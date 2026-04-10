const { Router } = require('express');
const jwt = require('jsonwebtoken');
const { db } = require('../config/firebase');

const router = Router();
const JWT_SECRET = process.env.AUTH_JWT_SECRET || 'dev-secret';

/**
 * GET /api/voice/session/:leadId
 * Returns the lead's campaign context for the voice widget UI.
 * Validates the session token from the query parameter 't'.
 */
router.get('/session/:leadId', async (req, res) => {
  try {
    const { leadId } = req.params;
    const { t: token } = req.query;

    if (!token) {
      return res.status(401).json({ error: 'Missing session token' });
    }

    // 1. Verify Token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Session expired or invalid' });
    }

    if (decoded.leadId !== leadId) {
      return res.status(401).json({ error: 'Token mismatch' });
    }

    // 2. Fetch Context
    const leadSnap = await db.collection('leads').doc(leadId).get();
    if (!leadSnap.exists) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const lead = leadSnap.data();
    
    // Check if session is already completed
    if (lead.call_status === 'completed' || lead.call_status === 'not_interested' || lead.call_status === 'callback') {
      return res.status(410).json({ error: 'Session already completed' });
    }

    const campaignSnap = await db.collection('campaigns').doc(lead.campaign_id).get();
    const campaign = campaignSnap.exists ? campaignSnap.data() : {};
    const businessSnap = await db.collection('businesses').doc(lead.business_id).get();
    const business = businessSnap.exists ? businessSnap.data() : {};

    // 3. Update status
    await db.collection('leads').doc(leadId).update({
      call_status: 'widget_started',
      widget_opened_at: new Date().toISOString(),
    });

    return res.status(200).json({
      lead_id: leadId,
      customerName: lead.customer_name || 'Customer',
      businessName: business.business_name || 'Our Company',
      campaignName: campaign.campaign_name || 'Outreach',
      purpose: campaign.purpose || '',
    });
  } catch (err) {
    console.error('[VoiceRoutes] session error:', err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /api/voice/status/:leadId
 * Updates lead status from the voice widget.
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

