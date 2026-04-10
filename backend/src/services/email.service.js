/**
 * @file backend/src/services/email.service.js
 * @description Email dispatch service for the WebRTC voice funnel.
 *
 * Sends branded HTML emails to leads with a link to the voice widget.
 * Uses Nodemailer with Gmail App Password for zero-cost delivery (500/day).
 *
 * Exports:
 *   - sendCallEmail(lead, campaign, business) — Dispatches one email.
 */

const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5500';
const JWT_SECRET = process.env.AUTH_JWT_SECRET || 'dev-secret';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Transport
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let transporter = null;

if (GMAIL_USER && GMAIL_APP_PASSWORD) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_APP_PASSWORD,
    },
  });
  console.log(`[EmailService] Transport ready — sender: ${GMAIL_USER}`);
} else {
  console.warn(
    '[EmailService] GMAIL_USER or GMAIL_APP_PASSWORD not set. Email dispatch disabled.'
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Subject Line Pool (rotates for better engagement)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SUBJECT_TEMPLATES = [
  '🎯 {business_name} has something for you, {customer_name}!',
  '⚡ Quick chat? {business_name} wants to connect',
  '🔥 {customer_name}, {business_name} has an update for you',
  '🚀 {customer_name} — 2 minutes with {business_name}\'s AI?',
];

const pickSubject = (businessName, customerName) => {
  const idx = Math.floor(Math.random() * SUBJECT_TEMPLATES.length);
  return SUBJECT_TEMPLATES[idx]
    .replace(/{business_name}/g, businessName)
    .replace(/{customer_name}/g, customerName);
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Token Generation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * generateCallToken — Creates a short-lived JWT for the voice widget link.
 * Contains leadId and campaignId, expires in 48 hours.
 */
const generateCallToken = (leadId, campaignId) => {
  return jwt.sign({ leadId, campaignId }, JWT_SECRET, { expiresIn: '48h' });
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HTML Email Template
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const buildEmailHtml = (customerName, businessName, purpose, callUrl) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; background: #0f172a; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
    .wrapper { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .card { background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-radius: 20px; padding: 40px; border: 1px solid rgba(255,255,255,0.1); }
    .logo { color: #22c55e; font-size: 28px; font-weight: 700; margin-bottom: 30px; }
    h1 { color: #f8fafc; font-size: 24px; margin: 0 0 16px; line-height: 1.3; }
    p { color: #94a3b8; font-size: 16px; line-height: 1.6; margin: 0 0 12px; }
    .cta-btn { display: inline-block; background: linear-gradient(135deg, #22c55e, #16a34a); color: #000 !important; font-size: 18px; font-weight: 700; text-decoration: none; padding: 16px 40px; border-radius: 12px; margin: 24px 0; }
    .footer { color: #475569; font-size: 12px; text-align: center; margin-top: 30px; }
    .divider { height: 1px; background: rgba(255,255,255,0.1); margin: 24px 0; }
    .feature { color: #94a3b8; font-size: 14px; margin: 8px 0; }
    .feature span { color: #22c55e; margin-right: 8px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="logo">⚡ VEDA</div>
      <h1>Hi ${customerName},</h1>
      <p>${businessName} has something exciting to share with you.</p>
      <p style="color: #cbd5e1;">${purpose}</p>
      <div class="divider"></div>
      <p>Our AI assistant is ready to chat with you — it only takes 2 minutes, and you can do it right from your browser.</p>
      
      <div style="text-align: center;">
        <a href="${callUrl}" class="cta-btn" target="_blank">🎙️ Talk to our AI Assistant</a>
      </div>
      
      <div class="divider"></div>
      <div class="feature"><span>✓</span> No app download needed — works in your browser</div>
      <div class="feature"><span>✓</span> Just 2 minutes of your time</div>
      <div class="feature"><span>✓</span> Voice conversation — no typing required</div>
    </div>
    <div class="footer">
      Powered by Veda AI · You received this because ${businessName} wants to connect with you.
    </div>
  </div>
</body>
</html>`;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Core — Send Email
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * sendCallEmail — Dispatches a branded email to a lead with the voice widget link.
 *
 * @param {object} lead   — { lead_id, email, customer_name, campaign_id }
 * @param {object} campaign — { campaign_name, purpose }
 * @param {object} business — { business_name }
 * @returns {Promise<boolean>} — true if sent successfully.
 */
const sendCallEmail = async (lead, campaign, business) => {
  if (!transporter) {
    console.warn('[EmailService] No transport configured. Skipping email.');
    return false;
  }

  if (!lead.email) {
    console.warn(`[EmailService] Lead ${lead.lead_id} has no email. Skipping.`);
    return false;
  }

  try {
    const customerName = lead.customer_name || 'there';
    const businessName = business.business_name || 'Our Team';
    const purpose = campaign.purpose || 'We have something great to share.';

    // Generate secure call link.
    const token = generateCallToken(lead.lead_id, lead.campaign_id);
    const callUrl = `${FRONTEND_URL}/call.html?id=${lead.lead_id}&t=${token}`;

    const subject = pickSubject(businessName, customerName);
    const html = buildEmailHtml(customerName, businessName, purpose, callUrl);

    await transporter.sendMail({
      from: `"${businessName} via Veda" <${GMAIL_USER}>`,
      to: lead.email,
      subject,
      html,
    });

    console.log(`[EmailService] Email sent to ${lead.email} for lead=${lead.lead_id}`);
    return true;
  } catch (err) {
    console.error(`[EmailService] Failed to send email for lead=${lead.lead_id}:`, err.message);
    return false;
  }
};

module.exports = {
  sendCallEmail,
  generateCallToken,
};
