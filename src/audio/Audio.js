// Tiny WebAudio synth: no audio files needed (keeps the PWA small and fully offline).
export class GameAudio {
  constructor() { this.ctx = null; this.master = null; this.noiseBuf = null; }

  /** Must be called from a user gesture (tap on DEPLOY). */
  unlock() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 0.5;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  noise(dur, freq, q, vol, type = 'lowpass', sweepTo = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur);
  }

  tone(freq, dur, vol, type = 'square', slideTo = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur);
  }

  play(name) {
    switch (name) {
      case 'rifle':   this.noise(0.16, 2600, 0.8, 0.9, 'lowpass', 300); this.tone(110, 0.08, 0.4, 'square', 50); break;
      case 'pistol':  this.noise(0.12, 3200, 0.8, 0.7, 'lowpass', 500); this.tone(160, 0.06, 0.3, 'square', 70); break;
      case 'sniper':  this.noise(0.5, 1800, 0.6, 1.0, 'lowpass', 120); this.tone(70, 0.3, 0.6, 'sawtooth', 30); break;
      case 'shotgun': this.noise(0.35, 1500, 0.5, 1.0, 'lowpass', 150); this.tone(80, 0.2, 0.5, 'sawtooth', 35); break;
      case 'empty':   this.tone(900, 0.04, 0.25, 'square'); break;
      case 'reload':  this.noise(0.05, 4000, 4, 0.5, 'bandpass'); setTimeout(() => this.noise(0.06, 2500, 4, 0.5, 'bandpass'), 650); break;
      case 'hit':     this.tone(1400, 0.05, 0.25, 'triangle'); break;
      case 'kill':    this.tone(900, 0.12, 0.3, 'triangle', 1800); break;
      case 'hurt':    this.tone(180, 0.15, 0.5, 'sawtooth', 90); break;
      case 'break':   this.noise(0.2, 900, 1, 0.8, 'lowpass', 200); break;
      case 'place':   this.noise(0.07, 700, 1.5, 0.6, 'lowpass', 300); this.tone(220, 0.05, 0.25, 'square'); break;
      case 'collapse':this.noise(0.6, 600, 0.7, 0.9, 'lowpass', 80); break;
      case 'step':    this.noise(0.05, 500, 1, 0.12, 'lowpass'); break;
      case 'jump':    this.noise(0.06, 800, 1, 0.12, 'lowpass'); break;
      case 'bow':     this.noise(0.14, 1400, 2, 0.45, 'bandpass', 400); this.tone(240, 0.12, 0.2, 'triangle', 90); break;
      case 'sword':   this.noise(0.18, 3200, 1.2, 0.5, 'bandpass', 900); this.tone(520, 0.1, 0.12, 'triangle', 200); break;
      case 'rocket':  this.noise(0.45, 1300, 0.6, 0.9, 'lowpass', 200); this.tone(95, 0.3, 0.5, 'sawtooth', 40); break;
      case 'explode': this.noise(0.9, 700, 0.5, 1.0, 'lowpass', 60); this.tone(55, 0.7, 0.8, 'sawtooth', 25); break;
      case 'portal':  this.tone(260, 0.8, 0.3, 'sine', 900); setTimeout(() => this.tone(520, 0.5, 0.2, 'sine', 1300), 120); break;
      default: break;
    }
  }
}
