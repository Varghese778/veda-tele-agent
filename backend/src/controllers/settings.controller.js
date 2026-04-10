/**
 * @file backend/src/controllers/settings.controller.js
 * @description User settings CRUD — persists per-user configuration in Firestore.
 */

const { db } = require('../config/firebase');

const COLLECTION = 'user_settings';

const DEFAULT_SYSTEM_PROMPT = `You are Veda, a professional AI voice agent. Be friendly, natural, and human-like. Follow conversation best practices: greet warmly, ask qualifying questions, present value, handle objections gracefully, and close with clear next steps. Keep responses to 2-3 sentences per turn. Never monologue.`;

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
