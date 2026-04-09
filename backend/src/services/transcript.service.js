/**
 * @file backend/src/services/transcript.service.js
 * @description MOD-10 — TranscriptModule Service.
 *
 * This service assembles, truncates, and persists call transcripts to Firestore.
 * It is called by the bridge service once a call session ends.
 */

const { db } = require('../config/firebase');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const MAX_TRANSCRIPT_LENGTH = 50000;
const TRUNCATION_SUFFIX = '\n\n[Transcript truncated — full recording available via recording_url]';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * formatTranscript — Joins chunks and applies header/truncation.
 * @param {string} customerName
 * @param {string[]} chunks
 * @returns {string}
 */
const formatTranscript = (customerName, chunks) => {
  // Join chunks and normalize whitespace
  let fullText = chunks.join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Apply truncation if limit exceeded
  if (fullText.length > MAX_TRANSCRIPT_LENGTH) {
    fullText = fullText.substring(0, MAX_TRANSCRIPT_LENGTH) + TRUNCATION_SUFFIX;
  }

  // Add header
  const header = `Transcript — ${customerName || 'Customer'} — ${new Date().toISOString()}\n`;
  const separator = '═'.repeat(header.length - 1) + '\n\n';

  return header + separator + fullText;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Core Logic
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * saveTranscript — Finalizes and persists the transcript for a lead.
 *
 * @param {string} leadId
 * @param {string[]} rawChunks — Array of text parts collected during the call.
 */
const saveTranscript = async (leadId, rawChunks) => {
  if (!leadId) throw new Error('[TranscriptService] leadId is required.');
  if (!rawChunks || rawChunks.length === 0) {
    console.warn(`[TranscriptService] No transcript content for lead=${leadId}. skipping save.`);
    return;
  }

  try {
    // 1. Fetch lead metadata for the header
    const leadSnap = await db.collection('leads').doc(leadId).get();
    if (!leadSnap.exists) {
      throw new Error(`Lead ${leadId} not found.`);
    }

    const leadData = leadSnap.data();

    // 2. Assemble and format
    const finalizedTranscript = formatTranscript(leadData.customer_name, rawChunks);

    // 3. Persist to Firestore
    await db.collection('leads').doc(leadId).update({
      transcript: finalizedTranscript,
      updated_at: new Date()
    });

    console.log(`[TranscriptService] Transcript saved for lead=${leadId} (len: ${finalizedTranscript.length})`);
  } catch (err) {
    console.error(`[TranscriptService] Failed to save transcript for lead=${leadId}:`, err.message);
    // Note: Do not throw here to prevent crashing the bridge teardown, but log the failure.
  }
};

module.exports = {
  saveTranscript,
};
