/**
 * @file frontend/js/audio-orb.js
 * @description Audio-reactive glassmorphic orb animation.
 *
 * Pure Canvas-based — no Three.js, no heavy 3D models.
 * Renders a floating orb with wave ripples that respond to audio amplitude.
 *
 * States:
 *   idle     — Gentle pulse glow.
 *   listening — Ring glow intensifies, subtle particles.
 *   speaking  — Wave burst, orb expands/contracts with audio.
 *
 * Usage:
 *   import { AudioOrb } from './audio-orb.js';
 *   const orb = new AudioOrb(canvasElement);
 *   orb.setState('listening');
 *   orb.setAmplitude(0.7); // 0..1
 *   orb.destroy();
 */

export class AudioOrb {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.state = 'idle'; // idle | listening | speaking
    this.amplitude = 0;
    this.targetAmplitude = 0;
    this.time = 0;
    this.particles = [];
    this.animFrame = null;
    this.dpr = window.devicePixelRatio || 1;

    // Set canvas resolution.
    this.canvas.width = 300 * this.dpr;
    this.canvas.height = 300 * this.dpr;
    this.canvas.style.width = '300px';
    this.canvas.style.height = '300px';
    this.ctx.scale(this.dpr, this.dpr);

    this.cx = 150;
    this.cy = 150;
    this.baseRadius = 60;

    this._animate = this._animate.bind(this);
    this._animate();
  }

  setState(state) {
    this.state = state;
  }

  setAmplitude(value) {
    this.targetAmplitude = Math.min(1, Math.max(0, value));
  }

  destroy() {
    if (this.animFrame) {
      cancelAnimationFrame(this.animFrame);
      this.animFrame = null;
    }
  }

  _animate() {
    this.time += 0.02;
    this.amplitude += (this.targetAmplitude - this.amplitude) * 0.1;

    const ctx = this.ctx;
    const cx = this.cx;
    const cy = this.cy;

    // Clear canvas.
    ctx.clearRect(0, 0, 300, 300);

    // ── Background Radial Glow ──
    const glowIntensity = this.state === 'idle' ? 0.05 : 0.1 + this.amplitude * 0.15;
    const glowRadius = this.baseRadius * (2 + this.amplitude * 1.5);
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
    glow.addColorStop(0, `rgba(34, 197, 94, ${glowIntensity})`);
    glow.addColorStop(1, 'rgba(34, 197, 94, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 300, 300);

    // ── Outer Ring Waves ──
    if (this.state !== 'idle') {
      const waveCount = 3;
      for (let w = 0; w < waveCount; w++) {
        const phase = this.time * 2 + w * (Math.PI * 2 / waveCount);
        const waveRadius = this.baseRadius + 20 + Math.sin(phase) * (10 + this.amplitude * 25);
        const waveAlpha = 0.05 + this.amplitude * 0.1 - w * 0.02;

        ctx.beginPath();
        const segments = 64;
        for (let i = 0; i <= segments; i++) {
          const angle = (i / segments) * Math.PI * 2;
          const wobble = Math.sin(angle * 6 + this.time * 3 + w) * this.amplitude * 8;
          const r = waveRadius + wobble;
          const x = cx + Math.cos(angle) * r;
          const y = cy + Math.sin(angle) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = `rgba(34, 197, 94, ${Math.max(0, waveAlpha)})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // ── Core Orb ──
    const orbRadius = this.baseRadius + this.amplitude * 15 + Math.sin(this.time * 1.5) * 3;

    // Gradient fill.
    const orbGrad = ctx.createRadialGradient(cx - 15, cy - 15, orbRadius * 0.1, cx, cy, orbRadius);
    if (this.state === 'speaking') {
      orbGrad.addColorStop(0, 'rgba(34, 197, 94, 0.6)');
      orbGrad.addColorStop(0.5, 'rgba(34, 197, 94, 0.3)');
      orbGrad.addColorStop(1, 'rgba(34, 197, 94, 0.05)');
    } else if (this.state === 'listening') {
      orbGrad.addColorStop(0, 'rgba(59, 130, 246, 0.5)');
      orbGrad.addColorStop(0.5, 'rgba(34, 197, 94, 0.2)');
      orbGrad.addColorStop(1, 'rgba(34, 197, 94, 0.03)');
    } else {
      orbGrad.addColorStop(0, 'rgba(34, 197, 94, 0.25)');
      orbGrad.addColorStop(0.5, 'rgba(34, 197, 94, 0.1)');
      orbGrad.addColorStop(1, 'rgba(34, 197, 94, 0.02)');
    }

    // Draw deformed circle (organic shape).
    ctx.beginPath();
    const orbSegments = 64;
    for (let i = 0; i <= orbSegments; i++) {
      const angle = (i / orbSegments) * Math.PI * 2;
      const deform = this.state === 'idle'
        ? Math.sin(angle * 3 + this.time) * 2
        : Math.sin(angle * 5 + this.time * 3) * this.amplitude * 12 +
          Math.sin(angle * 3 + this.time * 2) * 4;
      const r = orbRadius + deform;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = orbGrad;
    ctx.fill();

    // Border glow.
    ctx.strokeStyle = `rgba(34, 197, 94, ${0.2 + this.amplitude * 0.4})`;
    ctx.lineWidth = 2;
    ctx.stroke();

    // ── Inner Highlight ──
    const innerGrad = ctx.createRadialGradient(cx - 10, cy - 10, 0, cx, cy, orbRadius * 0.6);
    innerGrad.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
    innerGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.beginPath();
    ctx.arc(cx, cy, orbRadius * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = innerGrad;
    ctx.fill();

    // ── Particles (speaking/listening only) ──
    if (this.state !== 'idle' && this.amplitude > 0.1) {
      if (Math.random() < this.amplitude * 0.5) {
        const angle = Math.random() * Math.PI * 2;
        this.particles.push({
          x: cx + Math.cos(angle) * orbRadius,
          y: cy + Math.sin(angle) * orbRadius,
          vx: Math.cos(angle) * (1 + this.amplitude * 2),
          vy: Math.sin(angle) * (1 + this.amplitude * 2),
          life: 1,
          size: 1 + Math.random() * 2,
        });
      }
    }

    // Update & draw particles.
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.025;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(34, 197, 94, ${p.life * 0.6})`;
      ctx.fill();
    }

    // Cap particle count.
    if (this.particles.length > 50) {
      this.particles = this.particles.slice(-50);
    }

    this.animFrame = requestAnimationFrame(this._animate);
  }
}

// Auto-initialize idle orbs on page load.
document.addEventListener('DOMContentLoaded', () => {
  const idleCanvases = ['orbCanvas', 'orbCanvasReady', 'orbCanvasComplete'];
  idleCanvases.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      const orb = new AudioOrb(el);
      orb.setState('idle');
      el._orbInstance = orb;
    }
  });
});
