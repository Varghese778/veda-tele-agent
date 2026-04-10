/**
 * @file backend/src/middleware/ratelimit.middleware.js
 * @description Simple in-memory rate limiter and usage gate middleware.
 *
 * Limits are generous enough for dashboard polling (analytics + leads + activity
 * every 5 seconds = ~36 req/min) while still protecting against abuse.
 */

const { db } = require('../config/firebase');

// ── In-memory rate limiter ──────────────────────────────────────────────────

const windowMs = 60 * 1000; // 1 minute
const maxRequests = 300;     // 300 requests per minute per user/IP
const hits = new Map();

// Cleanup stale entries every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of hits.entries()) {
    if (now > entry.resetAt) hits.delete(key);
  }
}, 5 * 60 * 1000);

const rateLimiter = (req, res, next) => {
  // Exempt voice/widget and WebSocket upgrade requests from rate limiting
  const path = req.path || '';
  if (path.startsWith('/voice-stream') ||
      path.startsWith('/media-stream') ||
      path.startsWith('/api/voice/session')) {
    return next();
  }

  const key = req.user?.uid || req.ip;
  const now = Date.now();

  if (!hits.has(key)) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  }

  const entry = hits.get(key);
  if (now > entry.resetAt) {
    entry.count = 1;
    entry.resetAt = now + windowMs;
    return next();
  }

  entry.count++;
  if (entry.count > maxRequests) {
    return res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again shortly.',
    });
  }
  return next();
};

// ── Usage gate: enforces 50-trial limit per user ────────────────────────────

const usageGate = async (req, res, next) => {
  try {
    if (!req.user?.uid) return next();

    const ref = db.collection('user_settings').doc(req.user.uid);
    const snap = await ref.get();

    if (!snap.exists) {
      await ref.set({ usage_count: 0, usage_limit: 50 });
      return next();
    }

    const data = snap.data();
    const count = data.usage_count || 0;
    const limit = data.usage_limit || 50;

    if (count >= limit) {
      return res.status(403).json({
        error: 'Usage Limit Reached',
        message: `You have used all ${limit} free trials. Please upgrade to continue.`,
      });
    }

    return next();
  } catch (err) {
    console.error('[UsageGate] Error:', err.message);
    return next(); // fail-open
  }
};

module.exports = { rateLimiter, usageGate };
