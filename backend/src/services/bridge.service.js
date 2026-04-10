/**
 * @file backend/src/services/bridge.service.js
 * @description GeminiLiveBridgeModule — Real-time audio bridge.
 *
 * Handles TWO connection types:
 *   1. Browser Voice Widget (/voice-stream/:leadId) — direct PCM16 16kHz in/out
 *   2. Twilio Media Stream (/media-stream/:leadId) — μ-law 8kHz with event wrapper
 *
 * Architecture:
 *   Browser (PCM16 16kHz) <-> Bridge <-> Gemini Live (PCM16 16k in / 24k out)
 *   Twilio  (μ-law  8kHz) <-> Bridge <-> Gemini Live (PCM16 16k in / 24k out)
 */

const WebSocket = require('ws');
const { GoogleAuth } = require('google-auth-library');
const { mulawToPcm16, pcm16ToMulaw } = require('../utils/audio.converter');
const { buildPrompt } = require('./prompt.builder');
const { processOutcome } = require('./extraction.service');
const { saveTranscript } = require('./transcript.service');
const { logActivity } = require('../utils/activity.logger');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT;
const LOCATION = process.env.VERTEX_AI_LOCATION || 'us-central1';
const MODEL = process.env.GEMINI_MODEL || 'gemini-live-2.5-flash-native-audio';

const GEMINI_LIVE_URL = `wss://${LOCATION}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent`;

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
        interest_level: { type: 'string', enum: ['High', 'Medium', 'Low'], description: 'Interest level' },
        intent: { type: 'string', enum: ['INTERESTED', 'NOT_INTERESTED', 'CALLBACK'], description: 'Primary intent' },
        summary: { type: 'string', description: 'Short conversation summary' },
        next_action: { type: 'string', description: 'Recommended next step' }
      },
      required: ['interest_level', 'intent', 'summary']
    }
  }]
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Session Management
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const sessions = new Map();

/**
 * initWebSocketBridge — Attaches dual WebSocket handlers to the server.
 */
const initWebSocketBridge = (server) => {
  const wss = new WebSocket.Server({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const pathname = url.pathname;

    // Accept both /voice-stream/ (browser) and /media-stream/ (Twilio)
    if (pathname.startsWith('/voice-stream/') || pathname.startsWith('/media-stream/')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        // Tag the connection type on the request for the handler
        request._bridgeType = pathname.startsWith('/voice-stream/') ? 'browser' : 'twilio';
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', handleConnection);
  console.log('[Bridge] WebSocket bridge initialized for /voice-stream/ and /media-stream/');
};

/**
 * handleConnection — Routes to the right handler based on connection type.
 */
const handleConnection = async (clientWs, request) => {
  const isBrowser = request._bridgeType === 'browser';
  
  // Extract leadId from URL (last path segment, strip query string)
  const urlPath = request.url.split('?')[0];
  const leadId = urlPath.split('/').pop();
  
  if (!leadId) {
    console.error('[Bridge] Connection attempt without leadId.');
    clientWs.close();
    return;
  }

  console.log(`[Bridge] Connected: lead=${leadId}, type=${isBrowser ? 'browser' : 'twilio'}`);

  let campaignIdForLog = null;

  const session = {
    leadId,
    type: isBrowser ? 'browser' : 'twilio',
    geminiWs: null,
    streamSid: null,
    transcriptChunks: [],
    reconnectAttempts: 0,
    isClosing: false,
  };

  sessions.set(leadId, session);

  // 1. Build system prompt (dynamic per campaign)
  let systemPrompt = '';
  let userVoice = 'Kore';
  try {
    const promptData = await buildPrompt(leadId);
    systemPrompt = promptData.systemPrompt;
    userVoice = promptData.voice || 'Kore';
    campaignIdForLog = promptData.campaignId || null;
    if (campaignIdForLog) {
      logActivity(campaignIdForLog, `🎙 ${isBrowser ? 'Widget' : 'Twilio'} connected — ${promptData.customerName || 'Lead'}`, 'call');
    }
  } catch (err) {
    console.error(`[Bridge] Failed to build prompt for lead=${leadId}:`, err.message);
    clientWs.close();
    return;
  }

  // 2. Connect to Gemini Live
  await connectToGemini(session, clientWs, systemPrompt, userVoice, campaignIdForLog);

  // 3. Handle client messages (polymorphic based on connection type)
  clientWs.on('message', async (data) => {
    try {
      const msg = JSON.parse(data);

      if (isBrowser) {
        // ── Browser Widget: { type: "audio", data: "<base64 PCM16>" }
        if (msg.type === 'audio' && msg.data) {
          if (session.geminiWs && session.geminiWs.readyState === WebSocket.OPEN) {
            session.geminiWs.send(JSON.stringify({
              realtimeInput: {
                mediaChunks: [{
                  mimeType: 'audio/pcm;rate=16000',
                  data: msg.data  // Already PCM16 base64 from browser
                }]
              }
            }));
          }
        }
        if (msg.type === 'end') {
          console.log(`[Bridge] Browser end signal: lead=${leadId}`);
          await teardownSession(leadId);
        }
      } else {
        // ── Twilio: { event: "start|media|stop", ... }
        switch (msg.event) {
          case 'start':
            session.streamSid = msg.start.streamSid;
            console.log(`[Bridge] Twilio stream started: lead=${leadId}, sid=${session.streamSid}`);
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
            console.log(`[Bridge] Twilio stream stopped: lead=${leadId}`);
            await teardownSession(leadId);
            break;
        }
      }
    } catch (err) {
      console.error(`[Bridge] Message processing error for lead=${leadId}:`, err.message);
    }
  });

  clientWs.on('close', () => {
    console.log(`[Bridge] Client WebSocket closed: lead=${leadId}`);
    teardownSession(leadId);
  });
};

/**
 * connectToGemini — Establishes the WebSocket connection to Vertex AI.
 */
const connectToGemini = async (session, clientWs, systemPrompt, userVoice = 'Kore', campaignIdForLog = null) => {
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
              if (session.type === 'browser') {
                // Send raw PCM16 base64 directly to browser
                if (clientWs.readyState === WebSocket.OPEN) {
                  clientWs.send(JSON.stringify({
                    type: 'audio',
                    data: part.inlineData.data  // PCM16 24kHz base64
                  }));
                }
              } else {
                // Convert to μ-law for Twilio
                const mulaw = pcm16ToMulaw(Buffer.from(part.inlineData.data, 'base64'));
                if (clientWs.readyState === WebSocket.OPEN && session.streamSid) {
                  clientWs.send(JSON.stringify({
                    event: 'media',
                    streamSid: session.streamSid,
                    media: { payload: mulaw.toString('base64') }
                  }));
                }
              }
            }
            if (part.text) {
              session.transcriptChunks.push(part.text);
              // Send transcript to browser widget in real-time
              if (session.type === 'browser' && clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: 'transcript', text: part.text }));
              }
            }
          }
        }

        // ── Handle Tool Calls ──
        if (response.toolCall?.functionCalls) {
          for (const call of response.toolCall.functionCalls) {
            if (call.name === 'log_call_outcome') {
              console.log(`[Bridge] log_call_outcome triggered for lead=${session.leadId}`);
              processOutcome(session.leadId, call.args || {}).catch(err => {
                console.error('[Bridge] processOutcome failure:', err.message);
              });

              const intent = call.args?.intent || 'UNKNOWN';
              if (campaignIdForLog) {
                logActivity(campaignIdForLog, `🧠 AI: ${intent} — ${(call.args?.summary || '').substring(0, 80)}`, 'ai');
              }

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
        console.error(`[Bridge] Gemini message error for lead=${session.leadId}:`, err.message);
      }
    });

    geminiWs.on('error', (err) => {
      console.error(`[Bridge] Gemini error for lead=${session.leadId}:`, err.message);
    });

    geminiWs.on('close', async (code, reason) => {
      console.log(`[Bridge] Gemini closed for lead=${session.leadId} (code=${code})`);
      if (!session.isClosing && session.reconnectAttempts < 1) {
        session.reconnectAttempts++;
        console.log(`[Bridge] Reconnecting Gemini for lead=${session.leadId}...`);
        await connectToGemini(session, clientWs, systemPrompt, userVoice, campaignIdForLog);
      } else if (!session.isClosing) {
        console.warn(`[Bridge] Gemini failed permanently for lead=${session.leadId}. Closing client.`);
        clientWs.close();
      }
    });

  } catch (err) {
    console.error(`[Bridge] Failed to connect to Gemini for lead=${session.leadId}:`, err.message);
    if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
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

  if (session.transcriptChunks.length > 0) {
    saveTranscript(leadId, session.transcriptChunks).catch(err => {
      console.error('[Bridge] saveTranscript failure:', err.message);
    });
  }

  if (session.geminiWs && session.geminiWs.readyState === WebSocket.OPEN) {
    session.geminiWs.close();
  }

  sessions.delete(leadId);
  console.log(`[Bridge] Session removed: lead=${leadId}`);
};

module.exports = {
  initWebSocketBridge,
};
