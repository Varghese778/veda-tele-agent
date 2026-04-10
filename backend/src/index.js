/**
 * @file backend/src/index.js
 * @description Main entry point for the Veda-Tele-Agent backend.
 *
 * Responsibilities:
 *   - Bootstraps Express with JSON parsing, CORS, and health check.
 *   - Mounts route modules under their respective prefixes.
 *   - Starts the HTTP server on the configured PORT (default 8080 for Cloud Run).
 *
 * Future modules (MOD-02 through MOD-14) will each add their routers here.
 */

const express = require('express');
const cors = require('cors');

// ── Route imports ────────────────────────────────────────────────────────────
const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');
const businessRoutes = require('./routes/business.routes');
const campaignRoutes = require('./routes/campaigns.routes');
const leadRoutes = require('./routes/leads.routes');
const twilioRoutes = require('./routes/twilio.routes');
const transcriptRoutes = require('./routes/transcript.routes');
const recordingRoutes = require('./routes/recording.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const settingsRoutes = require('./routes/settings.routes');
const voiceRoutes = require('./routes/voice.routes');

// ── Middleware imports ───────────────────────────────────────────────────────
const { rateLimiter } = require('./middleware/ratelimit.middleware');

// ── Service imports ──────────────────────────────────────────────────────────
const { startOrchestrator, stopOrchestrator } = require('./services/orchestrator.service');
const { initWebSocketBridge } = require('./services/bridge.service');

// ── App initialization ──────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 8080;

// ── Global middleware ────────────────────────────────────────────────────────
app.use(cors());                  // Allow cross-origin requests (frontend on Firebase Hosting)
app.use(express.json());          // Parse JSON request bodies
app.use(rateLimiter);             // Rate limiting on all routes

// ── Health check endpoint ────────────────────────────────────────────────────
// Used by Cloud Run health probes and Docker HEALTHCHECK.
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Mount route modules ──────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);       // MOD-01: Auth routes
app.use('/api/admin', adminRoutes);     // MOD-01: Admin routes
app.use('/api/business', businessRoutes); // MOD-02: Business profile routes
app.use('/api/campaigns', campaignRoutes); // MOD-03: Campaign routes
app.use('/api/campaigns', leadRoutes);     // MOD-04: Lead upload routes (same prefix, different sub-paths)
app.use('/twilio', twilioRoutes);           // MOD-06: Twilio webhook routes (no /api prefix — Twilio hits directly)
app.use('/', transcriptRoutes);             // MOD-10: Transcript routes (handles nested patterns)
app.use('/', recordingRoutes);              // MOD-11: Recording proxy routes (handles nested patterns)
app.use('/', analyticsRoutes);              // MOD-12: Analytics routes (handles nested patterns)
app.use('/api/settings', settingsRoutes);   // User settings routes
app.use('/api/voice', voiceRoutes);         // Voice widget routes

// ── Global error handler ─────────────────────────────────────────────────────
// Catches any unhandled errors from downstream middleware/controllers.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[Server] Unhandled error:', err.message);
  res.status(500).json({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred.',
  });
});

// ── Start server ─────────────────────────────────────────────────────────────
const server = app.listen(PORT, async () => {
  console.log(`[Server] Veda-Tele-Agent backend listening on port ${PORT}`);
  console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);

  // Boot the call orchestrator (MOD-05) after the HTTP server is ready.
  // Skip in test environments to avoid side effects.
  if (process.env.NODE_ENV !== 'test') {
    await startOrchestrator();
    initWebSocketBridge(server); // Start the AI bridge WebSocket server
  }
});

// ── Graceful shutdown ────────────────────────────────────────────────────────
// Stop the orchestrator polling loop and close the HTTP server cleanly.
const gracefulShutdown = (signal) => {
  console.log(`[Server] ${signal} received. Shutting down gracefully...`);
  stopOrchestrator();
  server.close(() => {
    console.log('[Server] HTTP server closed.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app; // Exported for testing
