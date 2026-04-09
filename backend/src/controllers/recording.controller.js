/**
 * @file backend/src/controllers/recording.controller.js
 * @description Controller for call recording playback.
 * 
 * Proxies Twilio recordings through the backend using Basic Auth
 * to ensure security and multi-tenant isolation.
 */

const https = require('https');
const { db } = require('../config/firebase');

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

/**
 * streamRecording — Proxies the Twilio audio file to the client.
 *
 * Verification:
 *   - Authentication (verifyToken)
 *   - Tenant Isolation (lead.business_id === req.user.uid)
 */
const streamRecording = async (req, res) => {
  const { campaign_id, id: leadId } = req.params;
  const businessId = req.user.uid;

  try {
    // 1. Fetch lead document
    const leadSnap = await db.collection('leads').doc(leadId).get();

    if (!leadSnap.exists) {
      return res.status(404).json({ error: 'Not Found', message: 'Lead not found.' });
    }

    const leadData = leadSnap.data();

    // 2. Authorization check
    // business owner can only see their leads. admin claim can bypass.
    if (!req.user.admin && leadData.business_id !== businessId) {
      return res.status(404).json({ error: 'Not Found', message: 'Lead not found.' });
    }

    // Optional: verify campaign alignment
    if (!req.user.admin && leadData.campaign_id !== campaign_id) {
       return res.status(404).json({ error: 'Not Found', message: 'Lead not found in this campaign.' });
    }

    if (!leadData.recording_url) {
      return res.status(404).json({ error: 'Not Found', message: 'No recording available for this call.' });
    }

    // 3. Prepare Proxy Request to Twilio
    // Twilio recordings require HTTP Basic Auth: SID and Auth Token as user/pass.
    const authHeader = 'Basic ' + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');

    const proxyRequest = https.get(leadData.recording_url, {
      headers: { 'Authorization': authHeader }
    }, (twilioRes) => {
      // 4. Handle Twilio Response
      if (twilioRes.statusCode !== 200) {
        console.error(`[RecordingController] Upstream Twilio error (Status: ${twilioRes.statusCode}) for url: ${leadData.recording_url}`);
        return res.status(502).json({ error: 'Bad Gateway', message: 'Could not retrieve recording from telephony provider.' });
      }

      // Stream the audio content directly to the client
      res.setHeader('Content-Type', 'audio/mpeg');
      // Pass through length if available
      if (twilioRes.headers['content-length']) {
        res.setHeader('Content-Length', twilioRes.headers['content-length']);
      }
      
      twilioRes.pipe(res);
    });

    proxyRequest.on('error', (err) => {
      console.error('[RecordingController] Proxy connection error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal Server Error' });
      }
    });

  } catch (err) {
    console.error('[RecordingController] streamRecording error:', err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

module.exports = {
  streamRecording,
};
