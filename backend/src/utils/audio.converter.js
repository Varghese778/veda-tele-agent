/**
 * @file backend/src/utils/audio.converter.js
 * @description Audio transcoding utility for MOD-07.
 *
 * Bridges Twilio (μ-law, 8kHz) and Gemini Live (PCM16, 16kHz/24kHz).
 *
 * Twilio -> Gemini:
 *   - Decode μ-law (8kHz) to PCM16 (8kHz).
 *   - Upsample PCM16 from 8kHz to 16kHz (2x interpolation).
 *
 * Gemini -> Twilio:
 *   - Downsample PCM16 from 24kHz to 8kHz (3x decimation).
 *   - Encode PCM16 (8kHz) to μ-law (8kHz).
 */

const { mulaw } = require('alawmulaw');

/**
 * mulawToPcm16 — Transcodes Twilio audio for Gemini.
 *
 * @param {Buffer} mulawBuffer — 8-bit μ-law, 8kHz.
 * @returns {Buffer} — 16-bit PCM (little-endian), 16kHz.
 */
const mulawToPcm16 = (mulawBuffer) => {
  // 1. Decode μ-law (8-bit) to PCM16 (Int16Array, 8kHz).
  const pcm8k = mulaw.decode(mulawBuffer);

  // 2. Upsample from 8kHz to 16kHz by duplicating samples (linear interpolation).
  const pcm16k = new Int16Array(pcm8k.length * 2);
  for (let i = 0; i < pcm8k.length; i++) {
    pcm16k[i * 2] = pcm8k[i];
    pcm16k[i * 2 + 1] = pcm8k[i];
  }

  // 3. Convert Int16Array to Buffer (little-endian).
  return Buffer.from(pcm16k.buffer);
};

/**
 * pcm16ToMulaw — Transcodes Gemini audio for Twilio.
 *
 * Gemini Live 2.5 Flash Native Audio typically outputs 24kHz PCM16.
 *
 * @param {Buffer|Int16Array} pcm24kBuffer — 16-bit PCM, 24kHz.
 * @returns {Buffer} — 8-bit μ-law, 8kHz.
 */
const pcm16ToMulaw = (pcm24kBuffer) => {
  // Ensure we have an Int16Array.
  const pcm24k = pcm24kBuffer instanceof Int16Array 
    ? pcm24kBuffer 
    : new Int16Array(pcm24kBuffer.buffer, pcm24kBuffer.byteOffset, pcm24kBuffer.byteLength / 2);

  // 1. Downsample from 24kHz to 8kHz by taking every 3rd sample (decimation).
  const pcm8k = new Int16Array(Math.floor(pcm24k.length / 3));
  for (let i = 0; i < pcm8k.length; i++) {
    pcm8k[i] = pcm24k[i * 3];
  }

  // 2. Encode PCM16 (8kHz) to μ-law (8-bit, 8kHz).
  const mulawEncoded = mulaw.encode(pcm8k);

  // 3. Convert Uint8Array to Buffer.
  return Buffer.from(mulawEncoded);
};

module.exports = {
  mulawToPcm16,
  pcm16ToMulaw,
};
