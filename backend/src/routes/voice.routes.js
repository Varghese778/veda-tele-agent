/**
 * @file backend/src/routes/voice.routes.js
 * @description Routes for the browser-based voice widget flow.
 *
 * When a lead clicks the email link, they hit the frontend call.html page
 * which connects via WebSocket to /media-stream/:lead_id (handled by bridge.service).
 * This route provides a REST endpoint for the widget to fetch lead + campaign context.
 */

const { Router } = require('express');
const { db } = require('../config/firebase');

const router = Router();

/**
 * GET /api/voice/context/:leadId
 * Returns the lead's campaign context for the voice widget UI.
 * No auth required — the lead is clicking from an email link.
 */
router.get('/context/:leadId', async (req, res) => {
  try {
    const { leadId } = req.params;
    const leadSnap = await db.collection('leads').doc(leadId).get();

    if (!leadSnap.exists) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const lead = leadSnap.data();
    const campaignSnap = await db.collection('campaigns').doc(lead.campaign_id).get();
    const campaign = campaignSnap.exists ? campaignSnap.data() : {};
    const businessSnap = await db.collection('businesses').doc(lead.business_id).get();
    const business = businessSnap.exists ? businessSnap.data() : {};

    // Update lead status to widget_started
    await db.collection('leads').doc(leadId).update({
      call_status: 'widget_started',
      widget_opened_at: new Date().toISOString(),
    });

    return res.status(200).json({
      lead_id: leadId,
      customer_name: lead.customer_name || 'Customer',
      business_name: business.business_name || 'Our Company',
      campaign_name: campaign.campaign_name || 'Outreach',
      purpose: campaign.purpose || '',
    });
  } catch (err) {
    console.error('[VoiceRoutes] context error:', err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /api/voice/status/:leadId
 * Updates lead status from the voice widget (e.g., call_started, call_ended).
 */
router.post('/status/:leadId', async (req, res) => {
  try {
    const { leadId } = req.params;
    const { status } = req.body;

    const validStatuses = ['widget_started', 'call_started', 'call_ended', 'call_failed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    await db.collection('leads').doc(leadId).update({
      call_status: status,
      [`${status}_at`]: new Date().toISOString(),
    });

    return res.status(200).json({ message: 'Status updated', status });
  } catch (err) {
    console.error('[VoiceRoutes] status update error:', err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
