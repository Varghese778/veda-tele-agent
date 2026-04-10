/**
 * @file backend/src/services/prompt.builder.js
 * @description MOD-08 — PromptBuilderModule.
 *
 * This module is responsible for dynamically assembling the Gemini system
 * prompt for each call. It merges business profile data, campaign details,
 * and lead information into a cohesive AI persona.
 *
 * Features:
 *   - Parallel Firestore document lookups (Promise.all).
 *   - 5-minute in-memory cache per leadId.
 *   - Graceful fallback defaults for missing documents or empty fields.
 *   - Placeholder replacement matching PRS §8 template logic.
 */

const { db } = require('../config/firebase');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants & Caching
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PROMPT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** 
 * Simple in-memory cache: leadId -> { systemPrompt, expiresAt }
 */
const cache = new Map();

/**
 * PRS Template Source of Truth
 */
const SYSTEM_PROMPT_TEMPLATE = `You are Veda, a professional AI voice agent for {business_name}.

## YOUR IDENTITY
You are calling on behalf of {business_name}, a {business_type} company.
Your name is Veda. You are friendly, natural, and human-like — not robotic.

## BUSINESS CONTEXT
- Product/Service: {product_description}
- Campaign Goal: {campaign_goal}
- Target Audience: {target_audience}
- Key Details: {key_details}

## CONVERSATION STRUCTURE
Follow this flow naturally — do not announce steps:

1. GREET: Use the customer's name ({customer_name}). Introduce yourself and {business_name} briefly.
   Example: "Hi {customer_name}, this is Veda calling from {business_name}. Is this a good time to chat for 2 minutes?"

2. ENGAGE: Ask 1 qualifying question relevant to {campaign_goal}.
   Listen carefully. Mirror their energy.

3. PRESENT: Share the value of {product_description} naturally.
   Tie it to what they just said. No reading from a list.

4. HANDLE OBJECTIONS:
   - Price concern → acknowledge, pivot to value and ROI
   - Not interested → ask why briefly, respect the answer, close warmly
   - Busy right now → offer a specific callback time

5. QUALIFY: By end of conversation, you must know:
   - Their interest level
   - Their intent (proceed / not now / callback)

6. CLOSE: Based on intent:
   - INTERESTED → confirm next step clearly
   - CALLBACK → confirm exact time, say you will reach out
   - NOT INTERESTED → close with warmth: "No problem at all, have a great day!"

## BEHAVIOR RULES
- Max 2–3 sentences per turn. Never monologue.
- Use natural fillers ONCE per call maximum: "Sure, give me just a second..." or "That's a great question —"
- Never repeat the same phrase twice in one call.
- If you don't know something: "Let me have our specialist follow up on that — they'll have the exact details."
- Handle interruptions: stop speaking immediately, listen, respond to what was said.

## CALL TERMINATION
When the conversation reaches a natural close, call the function \`log_call_outcome\` with the extracted data.
Do not announce this to the customer.`;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * replacePlaceholders — Regex-based placeholder substitution.
 * @param {string} template
 * @param {Record<string, string>} data
 * @returns {string}
 */
const replacePlaceholders = (template, data) => {
  return template.replace(/{(\w+)}/g, (match, key) => {
    // If the key exists in data and is not empty, use it.
    // Otherwise, return a generic fallback word if appropriate or the match itself.
    return data[key] || `[${key.replace('_', ' ')}]`;
  });
};

/**
 * getFallbackData — Provides generic defaults if documents are missing.
 */
const getFallbackData = () => ({
  business_name: 'Our Company',
  business_type: 'Service Provider',
  product_description: 'our professional services',
  campaign_goal: 'connecting with you and answering your questions',
  target_audience: 'valued customers',
  key_details: 'excellent service and professional support',
  customer_name: 'Customer',
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Core Logic
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * buildPrompt — Assembles the system prompt for a specific lead.
 *
 * @param {string} leadId
 * @returns {Promise<{ systemPrompt: string }>}
 */
const buildPrompt = async (leadId) => {
  if (!leadId) throw new Error('[PromptBuilder] leadId is required.');

  // 1. Check Cache
  const cached = cache.get(leadId);
  if (cached && Date.now() < cached.expiresAt) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[PromptBuilder] Cache hit for lead=${leadId}`);
    }
    return { systemPrompt: cached.systemPrompt };
  }

  try {
    // 2. Fetch Lead Context
    const leadSnap = await db.collection('leads').doc(leadId).get();
    if (!leadSnap.exists) {
      console.warn(`[PromptBuilder] Lead ${leadId} not found. Using generic fallbacks.`);
      const prompt = replacePlaceholders(SYSTEM_PROMPT_TEMPLATE, getFallbackData());
      return { systemPrompt: prompt };
    }

    const lead = leadSnap.data();
    const campaignId = lead.campaign_id;
    const businessId = lead.business_id;

    // 3. Parallel Lookup for Campaign, Business, and User Settings
    const [campaignSnap, businessSnap, settingsSnap] = await Promise.all([
      db.collection('campaigns').doc(campaignId).get(),
      db.collection('businesses').doc(businessId).get(),
      db.collection('user_settings').doc(businessId).get(),
    ]);

    const campaign = campaignSnap.exists ? campaignSnap.data() : null;
    const business = businessSnap.exists ? businessSnap.data() : null;
    const userSettings = settingsSnap.exists ? settingsSnap.data() : null;

    if (!campaign || !business) {
      console.warn(`[PromptBuilder] Missing campaign or business doc for lead=${leadId}. Handling gracefully.`);
    }

    // 4. Map placeholders to actual document fields
    const data = {
      business_name: business?.business_name || 'Our Company',
      business_type: business?.industry || 'Business',
      product_description: campaign?.product_description || 'our products',
      campaign_goal: campaign?.purpose || 'answering your questions',
      target_audience: campaign?.target_audience || 'people like you',
      key_details: campaign?.key_details || 'valuable offers and services',
      customer_name: lead.customer_name || 'Customer',
    };

    // 5. Final Assembly — use custom prompt if user has set one, otherwise use template
    let systemPrompt;
    const customPrompt = userSettings?.system_prompt?.trim();
    if (customPrompt && customPrompt.length > 20) {
      // Merge custom prompt with campaign context
      systemPrompt = `${customPrompt}\n\n## CAMPAIGN CONTEXT\n- Business: ${data.business_name} (${data.business_type})\n- Goal: ${data.campaign_goal}\n- Product: ${data.product_description}\n- Customer Name: ${data.customer_name}\n- Target Audience: ${data.target_audience}\n- Key Details: ${data.key_details}`;
    } else {
      systemPrompt = replacePlaceholders(SYSTEM_PROMPT_TEMPLATE, data);
    }

    // 6. Update Cache
    cache.set(leadId, {
      systemPrompt,
      expiresAt: Date.now() + PROMPT_CACHE_TTL_MS,
    });

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[PromptBuilder] Assembled prompt for lead=${leadId} (len: ${systemPrompt.length})`);
    }

    return { systemPrompt, voice: userSettings?.voice || 'Kore', campaignId, customerName: data.customer_name };
  } catch (err) {
    console.error(`[PromptBuilder] Failed to build prompt for lead=${leadId}:`, err.message);
    // If it's a transient Firestore error, try to return the generic fallback instead of crashing
    return { systemPrompt: replacePlaceholders(SYSTEM_PROMPT_TEMPLATE, getFallbackData()) };
  }
};

module.exports = { buildPrompt };
