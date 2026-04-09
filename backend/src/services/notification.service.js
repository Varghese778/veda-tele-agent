/**
 * @file backend/src/services/notification.service.js
 * @description MOD-14 — NotificationModule Service.
 *
 * Dispatches automated SMS follow-ups for CALLBACK intents via Twilio.
 * Includes rate limiting, message truncation, and number suppression.
 */

const { db, admin } = require('../config/firebase');
const { twilioClient, TWILIO_NUMBER } = require('../config/twilio');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SMS_RATE_LIMIT_MS = 24 * 60 * 60 * 1000; // 24 hours
const SMS_MAX_LENGTH = 160;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * formatSMSBody — Assembles and truncates the SMS template.
 */
const formatSMSBody = (customerName, businessName) => {
  const body = `Hi ${customerName || 'Customer'}, this is ${businessName || 'Our Team'}. We tried reaching you and would love to connect.`;
  
  if (body.length > SMS_MAX_LENGTH) {
    console.warn(`[NotificationService] Truncating SMS body (${body.length} chars) to fit 160 limit.`);
    return body.substring(0, SMS_MAX_LENGTH - 3) + '...';
  }
  
  return body;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Core Logic
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * sendCallbackSMS — dispatches a callback notification if conditions are met.
 * 
 * @param {string} leadId
 */
const sendCallbackSMS = async (leadId) => {
  if (!leadId) return;

  try {
    // 1. Fetch Lead Details
    const leadSnap = await db.collection('leads').doc(leadId).get();
    if (!leadSnap.exists) {
      console.warn(`[NotificationService] Lead ${leadId} not found. Skipping SMS.`);
      return;
    }

    const leadData = leadSnap.data();
    const { phone_number, customer_name, business_id, notification_sent_at } = leadData;

    // 2. Suppression: Self-number
    if (phone_number === TWILIO_NUMBER) {
      console.log(`[NotificationService] Lead number matches Twilio number. Skipping self-notification.`);
      return;
    }

    // 3. Rate Limiting: 24-hour check
    if (notification_sent_at) {
      const sentTime = notification_sent_at.toMillis ? notification_sent_at.toMillis() : new Date(notification_sent_at).getTime();
      if (Date.now() - sentTime < SMS_RATE_LIMIT_MS) {
        console.log(`[NotificationService] SMS rate limited for lead=${leadId}. Last sent < 24h ago.`);
        return;
      }
    }

    // 4. Fetch Business Context
    const businessSnap = await db.collection('businesses').doc(business_id).get();
    const businessName = businessSnap.exists ? businessSnap.data().business_name : 'the team';

    // 5. Build Message
    const smsBody = formatSMSBody(customer_name, businessName);

    // 6. Dispatch via Twilio
    if (!twilioClient) {
      console.warn(`[NotificationService] Twilio client not initialized. Trace: SMS intended for ${phone_number}`);
      return;
    }

    await twilioClient.messages.create({
      to: phone_number,
      from: TWILIO_NUMBER,
      body: smsBody
    });

    // 7. Update Persistence
    await db.collection('leads').doc(leadId).update({
      notification_sent: true,
      notification_sent_at: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`[NotificationService] Callback SMS sent to ${phone_number} for lead=${leadId}`);

  } catch (err) {
    // Non-critical: log but do not throw
    console.error(`[NotificationService] Failed to send SMS for lead=${leadId}:`, err.message);
  }
};

module.exports = {
  sendCallbackSMS,
};
