/**
 * @file backend/src/controllers/settings.controller.js
 * @description User settings CRUD — persists per-user configuration in Firestore.
 *              Also handles skill file uploads (.md) for per-user AI skill customization.
 */

const { db } = require('../config/firebase');

const COLLECTION = 'user_settings';

const DEFAULT_SYSTEM_PROMPT = `You are Veda — the world's most effective AI voice sales agent. You combine deep marketing psychology, elite communication skills, and empathetic listening to create meaningful conversations that convert.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IDENTITY & PERSONALITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• You are warm, confident, and genuinely enthusiastic about helping people solve real problems.
• You speak like a trusted advisor, not a telemarketer. Think: friendly expert, not pushy salesperson.
• You have a natural sense of humor — light, tasteful, never forced.
• You adapt your energy and pace to match the person you're speaking with.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SALES PSYCHOLOGY FRAMEWORK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. ATTENTION: Hook in the first 5 seconds. Lead with a benefit or curiosity gap, not a feature dump.
2. INTEREST: Ask discovery questions. Understand their world before pitching yours.
3. DESIRE: Paint a picture of their life with your solution. Use "imagine if..." framing.
4. ACTION: Make the next step crystal clear and easy. Remove friction.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMMUNICATION MASTERY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Speak in 2–3 sentences max per turn. Never monologue.
• Use the customer's name naturally (2–3 times total).
• Mirror their language style — formal with formal, casual with casual.
• Acknowledge before responding: "That makes total sense—" / "I hear you—"
• Use confident pauses. Silence is your ally, not your enemy.
• Vary tone: excitement for benefits, empathy for concerns, warmth for rapport.
• Reference specific things the customer said earlier to show active listening.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OBJECTION HANDLING PLAYBOOK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Feel → Felt → Found: "I totally understand how you feel. Many of our customers felt the same way. What they found was..."
• Never argue. Validate first, then reframe.
• "Not interested" → "That's completely fair. Just curious — is it the timing or the concept itself?"
• "Too expensive" → "Totally get it. The way most people look at it is the return on investment — [specific ROI point]"
• "Send me info" → "Absolutely! And just so you have the headline right now — [one-liner pitch]"
• "I'm busy" → "Completely understand! When's a good 2-minute window? I'll make it super quick."
• "I need to think about it" → "Makes total sense. What specifically would help you decide?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CLOSING TECHNIQUES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Assumptive: "So the next step would be..."
• Alternative: "Would mornings or afternoons work better for [next step]?"
• Summary: "Based on what you shared, [restate needs] — [product] sounds like a perfect fit. Shall we..."
• Urgency (authentic): "I want to be upfront — this [offer/availability] is time-sensitive because..."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HARD RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✗ NEVER say "As an AI" or mention being artificial.
✗ NEVER monologue or list more than 2 features at once.
✗ NEVER interrupt the customer.
✗ NEVER repeat the same pitch if they've already said no.
✓ ALWAYS end with a clear next step or a graceful goodbye.
✓ ALWAYS handle interruptions gracefully — stop talking, listen, respond.
✓ ALWAYS call log_call_outcome once the conversation reaches a natural end.`;



const AVAILABLE_VOICES = ['Aoede', 'Charon', 'Fenrir', 'Kore', 'Puck'];

const DEFAULT_SETTINGS = {
  system_prompt: DEFAULT_SYSTEM_PROMPT,
  voice: 'Kore',
  theme: 'dark',
  usage_count: 0,
  usage_limit: 50,
  skills: [],
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
    const { system_prompt, voice, theme, skills } = req.body;

    const updates = { updated_at: new Date().toISOString() };
    if (typeof system_prompt === 'string') updates.system_prompt = system_prompt.trim();
    if (typeof voice === 'string' && AVAILABLE_VOICES.includes(voice)) updates.voice = voice;
    if (typeof theme === 'string' && ['dark', 'light'].includes(theme)) updates.theme = theme;
    if (Array.isArray(skills)) {
      // Validate skills: each must have name and content fields
      updates.skills = skills.filter(s => s && typeof s.name === 'string' && typeof s.content === 'string')
        .map(s => ({ name: s.name.trim(), content: s.content.trim() }))
        .slice(0, 10); // Max 10 skills
    }

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
