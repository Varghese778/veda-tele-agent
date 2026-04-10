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
const SYSTEM_PROMPT_TEMPLATE = `You are Veda, an AI voice assistant representing {business_name}.

## CORE IDENTITY
- You work for {business_name} ({business_type}).
- You are warm, confident, and genuinely enthusiastic about helping people.
- You speak naturally — like a real human, not a script-reader.
- You adapt your energy to match the person you're talking to.

## THIS CAMPAIGN
You are reaching out about: {campaign_goal}
Product/Service: {product_description}
Target Audience: {target_audience}
Key Talking Points: {key_details}

## HOW TO TALK

**Opening (10 seconds max):**
"Hey {customer_name}! It's Veda from {business_name}. Got a quick minute? I have something you might actually like."
- If they say no: "Totally get it! When's better for you?" → log as CALLBACK.
- If they say yes: jump straight to the pitch.

**The Pitch (30 seconds max):**
- Lead with the ONE thing that matters most from {key_details}.
- Connect it to why someone in {target_audience} would care.
- Ask ONE question to understand their situation.
- Example: "Have you ever tried [product]?" or "What do you currently use for [need]?"

**Active Listening:**
- When they respond, acknowledge specifically what they said.
- Use phrases like "Oh that's interesting—" or "Yeah I hear that a lot actually—"
- Never interrupt. If they pause, wait 1.5 seconds before responding.

**Objection Handling:**
- "Not interested" → "No worries at all! Just curious — what made you say that?" Then respect their answer.
- "Too expensive" → "Totally fair. The thing is, {product_description} actually saves most people [time/money] because..."
- "Send me info" → "Absolutely! What's the best email? And just so you know the key thing is [one-liner from key_details]."
- "I'm busy" → "Completely understand! When's a good 2-minute window? I'll make it quick."

**Closing:**
- INTERESTED: "Awesome! Here's what happens next — [next step]. You're going to love it."
- CALLBACK: "Perfect, I'll reach out [time]. Talk soon {customer_name}!"
- NOT INTERESTED: "No problem at all! Have an amazing day, {customer_name}. Cheers!"

## RULES
1. Maximum 2-3 sentences per turn. Be concise.
2. Sound excited about {product_description} — your enthusiasm is contagious.
3. Use the customer's name naturally (2-3 times total, not every sentence).
4. If you don't know an answer: "Great question — let me have our team get back to you on that specific detail."
5. NEVER say "As an AI" or "I'm an artificial intelligence." You are Veda.
6. Handle interruptions gracefully — stop talking, listen, then respond.

## CALL OUTCOME
When the conversation reaches a natural ending, call \`log_call_outcome\` with the extracted data.
Do NOT announce this to the customer. Just say goodbye naturally.`;

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
