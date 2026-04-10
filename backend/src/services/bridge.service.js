/**
 * @file backend/src/services/bridge.service.js
 * @description GeminiLiveBridgeModule (MOD-07) — Real-time audio bridge.
 *
 * This service manages the bidirectional link between Twilio Media Streams
 * (WebSockets) and the Gemini Live Multimodal API (WebSockets).
 *
 * Architecture:
 *   Twilio (μ-law 8kHz) <-> Bridge <-> Gemini (PCM16 16k in / 24k out)
 *
 * Responsibilities:
 *   - Attaches WebSocket server to the Express HTTP server.
 *   - Manages session lifecycle per leadId.
 *   - Transcodes audio format and sample rates.
 *   - Orchestrates system prompt construction and tool calls.
 *   - Reconnects Gemini once on mid-call disconnect.
 */

const WebSocket = require('ws');
const { GoogleAuth } = require('google-auth-library');
const { mulawToPcm16, pcm16ToMulaw } = require('../utils/audio.converter');
const { buildPrompt } = require('./prompt.builder');
const { processOutcome } = require('./extraction.service');
const { saveTranscript } = require('./transcript.service');
const { logActivity } = require('../utils/activity.logger');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants & Configuration
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT;
const LOCATION = process.env.VERTEX_AI_LOCATION || 'us-central1';
const MODEL = process.env.GEMINI_MODEL || 'gemini-live-2.5-flash-native-audio';

/**
 * The Vertex AI Multimodal Live API endpoint.
 * This is a stateful WebSocket endpoint.
 */
const GEMINI_LIVE_URL = `wss://${LOCATION}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent`;

/**
 * Google Auth instance for generating ADC access tokens.
 */
const auth = new GoogleAuth({
  scopes: 'https://www.googleapis.com/auth/cloud-platform',
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tool Declarations
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CALL_OUTCOME_TOOL = {
  function_declarations: [{
    name: 'log_call_outcome',
    description: 'Log the final outcome of the call. Call this ONLY once the conversation has reached a natural conclusion or the customer wants to end the call.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Customer name' },
        interest_level: { type: 'string', enum: ['High', 'Medium', 'Low'], description: 'Interest level of the lead' },
        intent: { type: 'string', enum: ['INTERESTED', 'NOT_INTERESTED', 'CALLBACK'], description: 'Primary intent' },
        summary: { type: 'string', description: 'A short summary of the conversation' },
        next_action: { type: 'string', description: 'Recommended next step' }
      },
      required: ['interest_level', 'intent', 'summary']
    }
  }]
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Session Management
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Map of active sessions: leadId -> SessionState */
const sessions = new Map();

/**
 * initWebSocketBridge — Attaches the WebSocket server to the backend.
 *
 * @param {import('http').Server} server — The Express/HTTP server instance.
 */
const initWebSocketBridge = (server) => {
  const wss = new WebSocket.Server({ noServer: true });

  // Handle upgrade events for the /media-stream/:lead_id path.
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const pathname = url.pathname;

    if (pathname.startsWith('/media-stream/')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', handleTwilioConnection);
  console.log('[Bridge] WebSocket bridge initialized for /media-stream/:lead_id');
};

/**
 * handleTwilioConnection — Orchestrates a single call session.
 */
const handleTwilioConnection = async (twilioWs, request) => {
  const leadId = request.url.split('/').pop();
  if (!leadId) {
    console.error('[Bridge] Connection attempt without leadId.');
    twilioWs.close();
    return;
  }

  console.log(`[Bridge] Connected: lead=${leadId}`);

  // Log to activity feed (need campaign_id from Firestore).
  let campaignIdForLog = null;

  // Create isolated session state.
  const session = {
    leadId,
    geminiWs: null,
    streamSid: null,
    transcriptChunks: [],
    isReconnecting: false,
    reconnectAttempts: 0,
    isClosing: false,
  };

  sessions.set(leadId, session);

  // 1. Fetch system prompt once at boot.
  let systemPrompt = '';
  let userVoice = 'Kore';
  try {
    const promptData = await buildPrompt(leadId);
    systemPrompt = promptData.systemPrompt;
    userVoice = promptData.voice || 'Kore';
    campaignIdForLog = promptData.campaignId || null;
    if (campaignIdForLog) {
      logActivity(campaignIdForLog, `🎵 Voice widget connected — ${promptData.customerName || 'Lead'}`, 'call');
    }
  } catch (err) {
    console.error(`[Bridge] Failed to build prompt for lead=${leadId}:`, err.message);
    twilioWs.close();
    return;
  }

  // 2. Connect to Gemini Live.
  await connectToGemini(session, twilioWs, systemPrompt, userVoice);

  // 3. Handle messages from Twilio.
  twilioWs.on('message', async (data) => {
    try {
      const msg = JSON.parse(data);
      
      switch (msg.event) {
        case 'start':
          session.streamSid = msg.start.streamSid;
          console.log(`[Bridge] Stream started: lead=${leadId}, streamSid=${session.streamSid}`);
          break;

        case 'media':
          if (session.geminiWs && session.geminiWs.readyState === WebSocket.OPEN) {
            const pcm16 = mulawToPcm16(Buffer.from(msg.media.payload, 'base64'));
            session.geminiWs.send(JSON.stringify({
              realtimeInput: {
                mediaChunks: [{
                  mimeType: 'audio/pcm;rate=16000',
                  data: pcm16.toString('base64')
                }]
              }
            }));
          }
          break;

        case 'stop':
          console.log(`[Bridge] Stream stopped: lead=${leadId}`);
          await teardownSession(leadId);
          break;
      }
    } catch (err) {
      console.error(`[Bridge] Error processing Twilio message for lead=${leadId}:`, err.message);
    }
  });

  twilioWs.on('close', () => {
    console.log(`[Bridge] Twilio WebSocket closed: lead=${leadId}`);
    teardownSession(leadId);
  });
};

/**
 * connectToGemini — Establishes the WebSocket connection to Vertex AI.
 */
const connectToGemini = async (session, twilioWs, systemPrompt, userVoice = 'Kore') => {
  try {
    const client = await auth.getClient();
    const token = await client.getAccessToken();

    const geminiWs = new WebSocket(GEMINI_LIVE_URL, {
      headers: {
        'Authorization': `Bearer ${token.token}`,
        'Content-Type': 'application/json'
      }
    });

    session.geminiWs = geminiWs;

    geminiWs.on('open', () => {
      console.log(`[Bridge] Connected to Gemini Live: lead=${session.leadId}`);
      
      // Send setup message.
      const setupMsg = {
        setup: {
          model: `projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}`,
          generation_config: {
            response_modalities: ['AUDIO'],
            speech_config: {
              voice_config: {
                prebuilt_voice_config: {
                  voice_name: userVoice,
                }
              }
            }
          },
          system_instruction: {
            parts: [{ text: systemPrompt }]
          },
          tools: [CALL_OUTCOME_TOOL]
        }
      };
      geminiWs.send(JSON.stringify(setupMsg));
    });

    geminiWs.on('message', async (data) => {
      try {
        const response = JSON.parse(data);

        // ── Handle Audio Output ──
        if (response.serverContent?.modelTurn?.parts) {
          for (const part of response.serverContent.modelTurn.parts) {
            if (part.inlineData && part.inlineData.data) {
              const mulaw = pcm16ToMulaw(Buffer.from(part.inlineData.data, 'base64'));
              if (twilioWs.readyState === WebSocket.OPEN && session.streamSid) {
                twilioWs.send(JSON.stringify({
                  event: 'media',
                  streamSid: session.streamSid,
                  media: { payload: mulaw.toString('base64') }
                }));
              }
            }
            if (part.text) {
              session.transcriptChunks.push(part.text);
            }
          }
        }

        // ── Handle Tool Calls ──
        if (response.toolCall?.functionCalls) {
          for (const call of response.toolCall.functionCalls) {
            if (call.name === 'log_call_outcome') {
              console.log(`[Bridge] log_call_outcome triggered for lead=${session.leadId}`);
              // Execute the outcome processing (async/non-blocking).
              processOutcome(session.leadId, call.args || {}).catch(err => {
                console.error('[Bridge] processOutcome failure:', err.message);
              });
              
              // Log intent to activity feed.
              const intent = call.args?.intent || 'UNKNOWN';
              if (campaignIdForLog) {
                logActivity(campaignIdForLog, `🧠 AI classified: ${intent} — ${(call.args?.summary || '').substring(0, 80)}`, 'ai');
              }

              // Send response back to Gemini to confirm tool execution.
              geminiWs.send(JSON.stringify({
                toolResponse: {
                  functionResponses: [{
                    name: call.name,
                    id: call.id,
                    response: { result: 'Outcome logged successfully.' }
                  }]
                }
              }));
            }
          }
        }
      } catch (err) {
        console.error(`[Bridge] Gemini message processing error for lead=${session.leadId}:`, err.message);
      }
    });

    geminiWs.on('error', (err) => {
      console.error(`[Bridge] Gemini WebSocket error for lead=${session.leadId}:`, err.message);
    });

    geminiWs.on('close', async (code, reason) => {
      console.log(`[Bridge] Gemini WebSocket closed for lead=${session.leadId} (code=${code}): ${reason}`);
      
      if (!session.isClosing && session.reconnectAttempts < 1) {
        session.reconnectAttempts++;
        console.log(`[Bridge] Attempting 1x reconnect for lead=${session.leadId}...`);
        await connectToGemini(session, twilioWs, systemPrompt, userVoice);
      } else if (!session.isClosing) {
        console.warn(`[Bridge] Gemini connection failed permanently for lead=${session.leadId}. Closing Twilio.`);
        twilioWs.close();
      }
    });

  } catch (err) {
    console.error(`[Bridge] Failed to connect to Gemini Live for lead=${session.leadId}:`, err.message);
    if (twilioWs.readyState === WebSocket.OPEN) twilioWs.close();
  }
};

/**
 * teardownSession — Cleans up session state and saves final artifacts.
 */
const teardownSession = async (leadId) => {
  const session = sessions.get(leadId);
  if (!session || session.isClosing) return;

  session.isClosing = true;
  console.log(`[Bridge] Tearing down session: lead=${leadId}`);

  // 1. Save transcript if we have content.
  if (session.transcriptChunks.length > 0) {
    saveTranscript(leadId, session.transcriptChunks).catch(err => {
      console.error('[Bridge] saveTranscript failure:', err.message);
    });
  }

  // 2. Close Gemini WebSocket if open.
  if (session.geminiWs && session.geminiWs.readyState === WebSocket.OPEN) {
    session.geminiWs.close();
  }

  // 3. Remove session state.
  sessions.delete(leadId);
  console.log(`[Bridge] Session removed: lead=${leadId}`);
};

module.exports = {
  initWebSocketBridge,
};
