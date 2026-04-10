/**
 * @file frontend/js/call-widget.js
 * @description Voice widget WebSocket client.
 *
 * Handles the full voice conversation lifecycle:
 *   1. Validates session via REST API.
 *   2. Opens WebSocket to /voice-stream/:leadId.
 *   3. Captures mic → PCM16 16kHz → sends to backend.
 *   4. Receives AI audio → plays via AudioContext.
 *   5. Drives the audio-reactive orb visualization.
 */

import { AudioOrb } from './audio-orb.js';

const API_BASE_URL = window.__ENV__?.API_BASE_URL || 'http://localhost:8080';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// State
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let ws = null;
let audioContext = null;
let mediaStream = null;
let scriptProcessor = null;
let activeOrb = null;
let sessionData = null;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DOM Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const showState = (stateId) => {
  document.querySelectorAll('.widget-state').forEach(el => el.classList.remove('active'));
  const target = document.getElementById(stateId);
  if (target) target.classList.add('active');
};

const getUrlParams = () => {
  const params = new URLSearchParams(window.location.search);
  return {
    leadId: params.get('id'),
    token: params.get('t'),
  };
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Session Validation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const validateSession = async (leadId, token) => {
  try {
    const res = await fetch(`${API_BASE_URL}/api/voice/session/${leadId}?t=${token}`);
    
    if (res.status === 410) {
      showState('completed-state');
      document.getElementById('completedTitle').textContent = 'Session Completed';
      document.getElementById('completedSubtitle').textContent = 'This conversation has already been completed. Thank you!';
      return null;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.message || 'Session validation failed');
    }

    return await res.json();
  } catch (err) {
    console.error('[Widget] Session validation error:', err.message);
    document.getElementById('errorMessage').textContent = err.message;
    showState('error-state');
    return null;
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Audio — Mic Capture
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const startMicCapture = async () => {
  audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
  mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

  const source = audioContext.createMediaStreamSource(mediaStream);
  
  // ScriptProcessor for PCM capture (widely supported).
  scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
  
  scriptProcessor.onaudioprocess = (event) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const inputData = event.inputBuffer.getChannelData(0);
    
    // Convert Float32 → Int16 PCM.
    const pcm16 = new Int16Array(inputData.length);
    for (let i = 0; i < inputData.length; i++) {
      const s = Math.max(-1, Math.min(1, inputData[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    // Compute amplitude for orb visualization.
    let sum = 0;
    for (let i = 0; i < inputData.length; i++) sum += Math.abs(inputData[i]);
    const avg = sum / inputData.length;
    
    if (activeOrb && activeOrb._currentState !== 'speaking') {
      activeOrb.setState('listening');
      activeOrb.setAmplitude(Math.min(1, avg * 8));
    }

    // Send as base64 over WebSocket.
    const base64 = arrayBufferToBase64(pcm16.buffer);
    ws.send(JSON.stringify({ type: 'audio', data: base64 }));
  };

  source.connect(scriptProcessor);
  scriptProcessor.connect(audioContext.destination);
};

const stopMicCapture = () => {
  if (scriptProcessor) {
    scriptProcessor.disconnect();
    scriptProcessor = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close().catch(() => {});
    audioContext = null;
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Audio — Playback
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let playbackContext = null;
let nextPlayTime = 0;

const initPlayback = () => {
  playbackContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
  nextPlayTime = 0;
};

const playAudioChunk = (base64Data) => {
  if (!playbackContext) return;

  try {
    const pcmBuffer = base64ToArrayBuffer(base64Data);
    const int16 = new Int16Array(pcmBuffer);
    const float32 = new Float32Array(int16.length);

    // Convert Int16 → Float32 for AudioContext.
    let sum = 0;
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
      sum += Math.abs(float32[i]);
    }

    // Drive orb with AI audio amplitude.
    const avg = sum / float32.length;
    if (activeOrb) {
      activeOrb.setState('speaking');
      activeOrb._currentState = 'speaking';
      activeOrb.setAmplitude(Math.min(1, avg * 6));
    }

    // Create AudioBuffer and play.
    const audioBuffer = playbackContext.createBuffer(1, float32.length, 24000);
    audioBuffer.getChannelData(0).set(float32);

    const bufferSource = playbackContext.createBufferSource();
    bufferSource.buffer = audioBuffer;
    bufferSource.connect(playbackContext.destination);

    const now = playbackContext.currentTime;
    const startTime = Math.max(now, nextPlayTime);
    bufferSource.start(startTime);
    nextPlayTime = startTime + audioBuffer.duration;

    // Reset orb state after this chunk finishes.
    bufferSource.onended = () => {
      if (activeOrb && playbackContext && playbackContext.currentTime >= nextPlayTime - 0.05) {
        activeOrb.setState('listening');
        activeOrb._currentState = 'listening';
        activeOrb.setAmplitude(0);
      }
    };
  } catch (err) {
    console.warn('[Widget] Audio playback error:', err.message);
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WebSocket Connection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const connectWebSocket = (leadId, token) => {
  const wsUrl = API_BASE_URL.replace(/^http/, 'ws');
  ws = new WebSocket(`${wsUrl}/voice-stream/${leadId}?t=${token}`);

  ws.onopen = () => {
    console.log('[Widget] WebSocket connected');
    document.getElementById('statusText').textContent = 'Connected — Listening...';
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);

      if (msg.type === 'audio' && msg.data) {
        playAudioChunk(msg.data);
        document.getElementById('statusText').textContent = 'AI is speaking...';
      }

      if (msg.type === 'transcript') {
        const preview = document.getElementById('transcriptPreview');
        if (preview) {
          preview.textContent = msg.text;
          preview.scrollTop = preview.scrollHeight;
        }
      }
    } catch (err) {
      console.warn('[Widget] WS message error:', err.message);
    }
  };

  ws.onclose = (event) => {
    console.log(`[Widget] WebSocket closed: code=${event.code}`);
    if (event.code !== 1000 && event.code !== 4001) {
      // Normal session end — show completed state.
      endConversation();
    }
  };

  ws.onerror = (err) => {
    console.error('[Widget] WebSocket error:', err);
    document.getElementById('statusText').textContent = 'Connection error...';
  };
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Conversation Lifecycle
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const startConversation = async () => {
  const { leadId, token } = getUrlParams();

  try {
    // Request mic permission.
    showState('active-state');

    // Initialize audio orb on the active canvas.
    const activeCanvas = document.getElementById('orbCanvasActive');
    if (activeCanvas) {
      activeOrb = new AudioOrb(activeCanvas);
      activeOrb.setState('listening');
    }

    await startMicCapture();
    initPlayback();
    connectWebSocket(leadId, token);
  } catch (err) {
    console.error('[Widget] Start conversation error:', err.message);
    if (err.name === 'NotAllowedError') {
      document.getElementById('errorMessage').textContent =
        'Microphone access was denied. Please allow microphone access and try again.';
    } else {
      document.getElementById('errorMessage').textContent = err.message;
    }
    showState('error-state');
  }
};

const endConversation = () => {
  // Send end signal.
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'end' }));
    ws.close(1000);
  }

  stopMicCapture();
  if (activeOrb) {
    activeOrb.destroy();
    activeOrb = null;
  }
  if (playbackContext) {
    playbackContext.close().catch(() => {});
    playbackContext = null;
  }

  showState('completed-state');
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Utility
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Init
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

document.addEventListener('DOMContentLoaded', async () => {
  const { leadId, token } = getUrlParams();

  if (!leadId || !token) {
    document.getElementById('errorMessage').textContent = 'Invalid link. Please use the link from your email.';
    showState('error-state');
    return;
  }

  // Validate session.
  sessionData = await validateSession(leadId, token);
  if (!sessionData) return;

  // Populate UI.
  document.getElementById('customerNameDisplay').textContent = sessionData.customerName || 'there';
  
  const bizHeaders = document.querySelectorAll('.brand-name');
  bizHeaders.forEach(el => { el.textContent = sessionData.businessName || ''; });

  const subtitle = document.getElementById('readySubtitle');
  if (subtitle && sessionData.businessName) {
    subtitle.textContent = `${sessionData.businessName} would love to chat with you. It only takes 2 minutes.`;
  }

  // Show ready state.
  showState('ready-state');

  // Bind events.
  document.getElementById('startCallBtn')?.addEventListener('click', startConversation);
  document.getElementById('endCallBtn')?.addEventListener('click', endConversation);
});
