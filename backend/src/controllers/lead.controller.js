/**
 * @file backend/src/controllers/lead.controller.js
 * @description Controller logic for the LeadIngestionModule (MOD-04).
 *
 * Exports:
 *   - uploadLeads : Handles CSV upload, parsing, validation, deduplication
 *                   (both in-file and against Firestore), batch writes, and
 *                   campaign total_leads update.
 *
 * Pipeline:
 *   1. Verify campaign ownership.
 *   2. Parse CSV buffer via csv.parser utility.
 *   3. Enforce 500-row maximum.
 *   4. Validate each row (E.164, required fields).
 *   5. Deduplicate within the uploaded file.
 *   6. Deduplicate against existing Firestore leads for the campaign.
 *   7. Batch-write accepted leads (max 499 per commit).
 *   8. Update campaign.total_leads with accepted count.
 *   9. Return detailed accept/reject report.
 */

const { admin, db } = require('../config/firebase');
const { parseCSVBuffer } = require('../utils/csv.parser');
const {
  MAX_UPLOAD_ROWS,
  FIRESTORE_BATCH_LIMIT,
  validateLeadRow,
} = require('../validators/lead.validator');

const FieldValue = admin.firestore.FieldValue;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * getExistingPhones — Fetches the set of phone numbers already stored as
 * leads for the given campaign.
 *
 * Used for cross-referencing to prevent duplicate lead creation when a
 * business re-uploads or appends contacts.
 *
 * @param {string} campaignId
 * @param {string} businessId
 * @returns {Promise<Set<string>>}
 */
const getExistingPhones = async (campaignId, businessId) => {
  const snapshot = await db
    .collection('leads')
    .where('campaign_id', '==', campaignId)
    .where('business_id', '==', businessId)
    .select('phone_number') // Only fetch the field we need.
    .get();

  const phones = new Set();
  snapshot.forEach((doc) => {
    phones.add(doc.data().phone_number);
  });
  return phones;
};

/**
 * commitInBatches — Writes an array of lead documents to Firestore,
 * splitting into chunks of FIRESTORE_BATCH_LIMIT to stay within the
 * 500-operation limit per batch commit.
 *
 * @param {Array<object>} leads — Array of validated lead data objects.
 * @param {string} campaignId
 * @param {string} businessId
 * @returns {Promise<number>} — Number of leads successfully written.
 */
const commitInBatches = async (leads, campaignId, businessId) => {
  let written = 0;

  for (let i = 0; i < leads.length; i += FIRESTORE_BATCH_LIMIT) {
    const chunk = leads.slice(i, i + FIRESTORE_BATCH_LIMIT);
    const batch = db.batch();

    for (const lead of chunk) {
      const leadRef = db.collection('leads').doc(); // Auto-generate ID.
      const now = FieldValue.serverTimestamp();

      batch.set(leadRef, {
        lead_id: leadRef.id,
        campaign_id: campaignId,
        business_id: businessId,
        customer_name: lead.customer_name,
        phone_number: lead.phone_number,
        email: lead.email || '',
        call_status: 'pending',
        attempt_count: 0,
        twilio_call_sid: '',
        recording_url: '',
        transcript: '',
        extracted_data: {},
        call_duration_sec: 0,
        called_at: null,
        completed_at: null,
      });
    }

    await batch.commit();
    written += chunk.length;
  }

  return written;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/campaigns/:id/upload
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * uploadLeads — Full CSV upload pipeline.
 *
 * @param {import('express').Request}  req — Must have `req.user`, `req.params.id`,
 *                                          and `req.file` (from multer).
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
const uploadLeads = async (req, res) => {
  try {
    const { uid } = req.user;
    const campaignId = req.params.id;

    // ── 1. Verify campaign ownership ─────────────────────────────────────────
    const campaignRef = db.collection('campaigns').doc(campaignId);
    const campaignSnap = await campaignRef.get();

    if (!campaignSnap.exists) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Campaign not found.',
      });
    }

    const campaignData = campaignSnap.data();
    if (campaignData.business_id !== uid) {
      // Return 404 to avoid leaking document existence.
      return res.status(404).json({
        error: 'Not Found',
        message: 'Campaign not found.',
      });
    }

    // ── 2. Validate file presence ────────────────────────────────────────────
    if (!req.file) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'No file uploaded. Please attach a CSV file with field name "contacts".',
      });
    }

    // ── 3. Parse CSV buffer ──────────────────────────────────────────────────
    const { rows, error: parseError } = parseCSVBuffer(req.file.buffer);

    if (parseError) {
      return res.status(400).json({
        error: 'Bad Request',
        message: parseError,
      });
    }

    if (rows.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'CSV file is empty or contains only headers.',
      });
    }

    // ── 4. Enforce 500-row limit ─────────────────────────────────────────────
    if (rows.length > MAX_UPLOAD_ROWS) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `CSV contains ${rows.length} rows, which exceeds the maximum of ${MAX_UPLOAD_ROWS} rows per upload.`,
      });
    }

    // ── 5. Validate rows + in-file deduplication ─────────────────────────────
    const rejected = [];
    const validRows = [];
    const seenPhones = new Set();

    for (let i = 0; i < rows.length; i++) {
      const rowNumber = i + 2; // +2: 1-indexed + header row offset.
      const row = rows[i];

      // Field-level validation.
      const result = validateLeadRow(row, rowNumber);
      if (!result.valid) {
        rejected.push({ row: rowNumber, reason: result.reason });
        continue;
      }

      // In-file deduplication by phone number.
      if (seenPhones.has(result.sanitized.phone_number)) {
        rejected.push({ row: rowNumber, reason: 'Duplicate phone number within CSV' });
        continue;
      }

      seenPhones.add(result.sanitized.phone_number);
      validRows.push(result.sanitized);
    }

    // ── 6. Cross-reference against existing Firestore leads ──────────────────
    const existingPhones = await getExistingPhones(campaignId, uid);
    const acceptedRows = [];

    for (const row of validRows) {
      if (existingPhones.has(row.phone_number)) {
        // Find the original row number for this entry.
        const originalIndex = rows.findIndex(
          (r) => (r.phone_number || '').trim() === row.phone_number
        );
        rejected.push({
          row: originalIndex + 2,
          reason: 'Duplicate: phone number already exists for this campaign',
        });
        continue;
      }
      acceptedRows.push(row);
    }

    // ── 7. Batch write accepted leads to Firestore ───────────────────────────
    if (acceptedRows.length > 0) {
      await commitInBatches(acceptedRows, campaignId, uid);
    }

    // ── 8. Update campaign.total_leads ────────────────────────────────────────
    // Use the total count of leads now in the campaign (existing + new accepted).
    const newTotalLeads = existingPhones.size + acceptedRows.length;

    await campaignRef.update({
      total_leads: newTotalLeads,
      updated_at: FieldValue.serverTimestamp(),
    });

    // ── 9. Return detailed report ────────────────────────────────────────────
    // Sort rejected by row number for a clean report.
    rejected.sort((a, b) => a.row - b.row);

    return res.status(200).json({
      message: 'Lead upload processed successfully.',
      accepted: acceptedRows.length,
      rejected,
      total_leads_in_campaign: newTotalLeads,
    });
  } catch (err) {
    console.error('[LeadController] uploadLeads error:', err.message);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to process lead upload.',
    });
  }
};

/**
 * listLeads — Returns leads for a campaign owned by the authenticated business.
 */
const listLeads = async (req, res) => {
  try {
    const { uid } = req.user;
    const campaignId = req.params.id;

    const campaignRef = db.collection('campaigns').doc(campaignId);
    const campaignSnap = await campaignRef.get();

    if (!campaignSnap.exists) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Campaign not found.',
      });
    }

    const campaignData = campaignSnap.data();
    if (campaignData.business_id !== uid) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Campaign not found.',
      });
    }

    const leadsSnap = await db
      .collection('leads')
      .where('business_id', '==', uid)
      .where('campaign_id', '==', campaignId)
      .limit(200)
      .get();

    const leads = leadsSnap.docs.map((doc) => {
      const d = doc.data();
      return {
        lead_id: doc.id,
        customer_name: d.customer_name || '',
        phone_number: d.phone_number || '',
        email: d.email || '',
        call_status: d.call_status || 'pending',
        extracted_data: d.extracted_data || {},
        transcript: d.transcript || '',
        call_duration_sec: d.call_duration_sec || 0,
        called_at: d.called_at || null,
      };
    });

    return res.status(200).json({ leads });
  } catch (err) {
    console.error('[LeadController] listLeads error:', err.message);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch campaign leads.',
    });
  }
};

module.exports = { uploadLeads, listLeads };
