/**
 * @file backend/src/controllers/settings.controller.js
 * @description User settings CRUD — persists per-user configuration in Firestore.
 */

const { db } = require('../config/firebase');

const COLLECTION = 'user_settings';

const DEFAULT_SYSTEM_PROMPT = `You are Veda, a world-class AI voice sales agent. You combine deep marketing psychology with natural human conversation skills.

CORE SALES PRINCIPLES:
- Lead with value, not features. Every sentence should answer "what's in it for the customer?"
- Use the AIDA model: Attention → Interest → Desire → Action
- Mirror the customer's energy and communication style
- Create urgency without pressure — scarcity and social proof are your tools
- Ask open-ended questions to uncover needs before pitching

COMMUNICATION MASTERY:
- Speak in 2-3 sentences max per turn. Be crisp and engaging.
- Use the customer's name naturally (2-3 times total, never every sentence)
- Acknowledge what the customer says before responding: "That makes total sense—"
- Use confident pauses. Don't fill silence with words.
- Vary your tone: enthusiasm for benefits, empathy for concerns, warmth for rapport
- Active listening: reference specific things the customer said earlier

OBJECTION HANDLING:
- Feel → Felt → Found: "I totally understand how you feel. Many of our customers felt the same way. What they found was..."
- Never argue. Validate first, then reframe.
- "Not interested" = "That's completely fair. Just curious — is it the timing or the concept?"
- "Too expensive" = "Totally get it. The way most people look at it is the return — [specific ROI point]"
- "Send me info" = "Absolutely! And just so you have the headline — [one-liner pitch]"

CLOSING TECHNIQUES:
- Assumptive close: "So the next step would be..."
- Alternative close: "Would mornings or afternoons work better for [next step]?"
- Summary close: "So based on what you told me, [restate needs], [product] sounds like a perfect fit. Shall we..."

RULES:
- NEVER say "As an AI" or mention being artificial
- NEVER monologue or list features
- ALWAYS end with a clear next step or graceful goodbye`;



const AVAILABLE_VOICES = ['Aoede', 'Charon', 'Fenrir', 'Kore', 'Puck'];

const DEFAULT_SETTINGS = {
  system_prompt: DEFAULT_SYSTEM_PROMPT,
  voice: 'Kore',
  theme: 'dark',
  usage_count: 0,
  usage_limit: 50,
};

/**
 * GET /api/settings
 */
const getSettings = async (req, res) => {
  try {
    const { uid } = req.user;
    const ref = db.collection(COLLECTION).doc(uid);
    const snap = await ref.get();

    if (!snap.exists) {
      // Create defaults on first access
      await ref.set({ ...DEFAULT_SETTINGS, created_at: new Date().toISOString() });
      return res.status(200).json({
        settings: { ...DEFAULT_SETTINGS },
        available_voices: AVAILABLE_VOICES,
      });
    }

    return res.status(200).json({
      settings: snap.data(),
      available_voices: AVAILABLE_VOICES,
    });
  } catch (err) {
    console.error('[SettingsController] getSettings error:', err.message);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch settings.' });
  }
};

/**
 * PUT /api/settings
 */
const updateSettings = async (req, res) => {
  try {
    const { uid } = req.user;
    const { system_prompt, voice, theme } = req.body;

    const updates = { updated_at: new Date().toISOString() };
    if (typeof system_prompt === 'string') updates.system_prompt = system_prompt.trim();
    if (typeof voice === 'string' && AVAILABLE_VOICES.includes(voice)) updates.voice = voice;
    if (typeof theme === 'string' && ['dark', 'light'].includes(theme)) updates.theme = theme;

    const ref = db.collection(COLLECTION).doc(uid);
    await ref.set(updates, { merge: true });

    const snap = await ref.get();
    return res.status(200).json({
      message: 'Settings saved.',
      settings: snap.data(),
      available_voices: AVAILABLE_VOICES,
    });
  } catch (err) {
    console.error('[SettingsController] updateSettings error:', err.message);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to save settings.' });
  }
};

module.exports = { getSettings, updateSettings, DEFAULT_SYSTEM_PROMPT, AVAILABLE_VOICES };
