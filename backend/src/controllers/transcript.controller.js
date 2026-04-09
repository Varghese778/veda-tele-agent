/**
 * @file backend/src/controllers/transcript.controller.js
 * @description Controller for transcript retrieval.
 *
 * Handles HTTP requests for viewing call conversation logs.
 */

const { db } = require('../config/firebase');

/**
 * getTranscriptForBusiness — Retrieves transcript with tenant isolation.
 *
 * Verification:
 *   - Authentication (verifyToken)
 *   - Ownership (business_id)
 *   - Context (campaign_id)
 */
const getTranscriptForBusiness = async (req, res) => {
  const { campaign_id, id: leadId } = req.params;
  const businessId = req.user.uid;

  try {
    const leadSnap = await db.collection('leads').doc(leadId).get();

    if (!leadSnap.exists) {
      return res.status(404).json({ error: 'Not Found', message: 'Lead not found.' });
    }

    const leadData = leadSnap.data();

    // ── Authorization check ──────────────────────────────────────────────────
    // Does this lead belong to the requesting business and the specified campaign?
    if (leadData.business_id !== businessId || leadData.campaign_id !== campaign_id) {
      // Return 404 instead of 403 to prevent record existence leakage.
      return res.status(404).json({ error: 'Not Found', message: 'Lead not found in this campaign.' });
    }

    if (!leadData.transcript) {
      return res.status(200).json({ 
        message: 'No transcript recorded for this lead.',
        transcript: null 
      });
    }

    return res.status(200).json({
      lead_id: leadId,
      customer_name: leadData.customer_name,
      transcript: leadData.transcript
    });

  } catch (err) {
    console.error('[TranscriptController] getTranscriptForBusiness error:', err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

/**
 * getTranscriptForAdmin — Retrieves transcript for any lead.
 *
 * Verification:
 *   - Authentication (verifyToken)
 *   - Superuser (isAdmin)
 */
const getTranscriptForAdmin = async (req, res) => {
  const { id: leadId } = req.params;

  try {
    const leadSnap = await db.collection('leads').doc(leadId).get();

    if (!leadSnap.exists) {
      return res.status(404).json({ error: 'Not Found', message: 'Lead not found.' });
    }

    const leadData = leadSnap.data();

    return res.status(200).json({
      lead_id: leadId,
      business_id: leadData.business_id,
      campaign_id: leadData.campaign_id,
      customer_name: leadData.customer_name,
      transcript: leadData.transcript || 'No transcript available.'
    });

  } catch (err) {
    console.error('[TranscriptController] getTranscriptForAdmin error:', err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

module.exports = {
  getTranscriptForBusiness,
  getTranscriptForAdmin,
};
