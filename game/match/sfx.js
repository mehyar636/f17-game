/** Tiny WebAudio synth — no audio files needed. */
class Sfx {
  ctx = null;
  master = null;
  crowdGain = null;
  noiseBuf = null;
  muted = false;

  /** Call on first user gesture. */
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startCrowd();
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  noise() {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf; s.loop = true;
    return s;
  }

  startCrowd() {
    const c = this.ctx;
    const src = this.noise();
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.6;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
    this.crowdGain = c.createGain(); this.crowdGain.gain.value = 0.045;
    src.connect(bp); bp.connect(lp); lp.connect(this.crowdGain); this.crowdGain.connect(this.master);
    src.start();
    // slow breathing modulation
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07;
    const lfoG = c.createGain(); lfoG.gain.value = 0.012;
    lfo.connect(lfoG); lfoG.connect(this.crowdGain.gain); lfo.start();
  }

  /** Crowd swell (goal = 1, near miss = 0.4) */
  cheer(intensity = 1) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const src = this.noise();
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.5;
    const gn = c.createGain();
    gn.gain.setValueAtTime(0.001, t);
    gn.gain.exponentialRampToValueAtTime(0.35 * intensity, t + 0.25);
    gn.gain.exponentialRampToValueAtTime(0.25 * intensity, t + 1.2);
    gn.gain.exponentialRampToValueAtTime(0.001, t + 2.6 * intensity + 0.4);
    src.connect(bp); bp.connect(gn); gn.connect(this.master);
    src.start(t); src.stop(t + 3.5);
    // a few "voices"
    for (let i = 0; i < 4; i++) {
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(180 + i * 37, t); o.frequency.linearRampToValueAtTime(260 + i * 41, t + 0.6);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
      const og = c.createGain(); og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(0.03 * intensity, t + 0.3);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      o.connect(f); f.connect(og); og.connect(this.master); o.start(t); o.stop(t + 1.7);
    }
  }

  whistle(times = 1, long = false) {
    if (!this.ctx) return;
    const c = this.ctx;
    for (let i = 0; i < times; i++) {
      const t = c.currentTime + i * 0.42;
      const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 2250;
      const v = c.createOscillator(); v.frequency.value = 38;
      const vg = c.createGain(); vg.gain.value = 55; v.connect(vg); vg.connect(o.frequency);
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2300; f.Q.value = 6;
      const gn = c.createGain();
      const dur = long ? 0.9 : 0.32;
      gn.gain.setValueAtTime(0.0001, t);
      gn.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      gn.gain.setValueAtTime(0.16, t + dur - 0.05);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f); f.connect(gn); gn.connect(this.master);
      o.start(t); v.start(t); o.stop(t + dur + 0.05); v.stop(t + dur + 0.05);
    }
  }

  kick(power = 0.5) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const src = this.noise();
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500 + power * 900;
    const gn = c.createGain();
    gn.gain.setValueAtTime(0.25 + power * 0.35, t);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.09 + power * 0.06);
    src.connect(lp); lp.connect(gn); gn.connect(this.master); src.start(t); src.stop(t + 0.25);
    const o = c.createOscillator(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.12);
    const og = c.createGain(); og.gain.setValueAtTime(0.3 + power * 0.3, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 0.16);
  }

  bounce() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.06);
    const og = c.createGain(); og.gain.setValueAtTime(0.12, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 0.08);
  }

  post() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    [1, 2.4, 3.9].forEach((m, i) => {
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = 520 * m;
      const og = c.createGain(); og.gain.setValueAtTime(0.18 / (i + 1), t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.5 - i * 0.1);
      o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 0.6);
    });
  }

  net() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const src = this.noise();
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    const gn = c.createGain(); gn.gain.setValueAtTime(0.12, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    src.connect(hp); hp.connect(gn); gn.connect(this.master); src.start(t); src.stop(t + 0.2);
  }

  click() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.frequency.value = 880;
    const og = c.createGain(); og.gain.setValueAtTime(0.08, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 0.06);
  }

  /** Little melodic blip sequence (kid-friendly rewards). notes = frequencies */
  tune(notes, step = 0.09, vol = 0.12, type = 'triangle') {
    if (!this.ctx) return;
    const c = this.ctx, t0 = c.currentTime;
    notes.forEach((f, i) => {
      const t = t0 + i * step;
      const o = c.createOscillator(); o.type = type; o.frequency.value = f;
      const og = c.createGain(); og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(vol, t + 0.015); og.gain.exponentialRampToValueAtTime(0.0001, t + step * 1.8);
      o.connect(og); og.connect(this.master); o.start(t); o.stop(t + step * 2);
    });
  }
  ding()      { this.tune([1318], 0.1, 0.1, 'sine'); }                       // pass completed
  praise()    { this.tune([784, 1046], 0.08, 0.1); }                          // nice!
  combo(n)    { this.tune([659, 784, 988, 1318].slice(0, Math.min(4, 1 + n)), 0.07, 0.11); }
  powerup()   { this.tune([523, 659, 784, 1046, 1318], 0.06, 0.12, 'square'); }
  star()      { this.tune([1568, 1976, 2637], 0.07, 0.09, 'sine'); }
  objective() { this.tune([784, 988, 1175, 1568], 0.1, 0.13); }
  wall() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.08);
    const og = c.createGain(); og.gain.setValueAtTime(0.09, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 0.12);
  }
  superShot() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const src = this.noise();
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(3200, t + 0.35);
    const gn = c.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(0.35, t + 0.12); gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    src.connect(bp); bp.connect(gn); gn.connect(this.master); src.start(t); src.stop(t + 0.55);
    this.kick(1);
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.3);
    const og = c.createGain(); og.gain.setValueAtTime(0.25, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 0.4);
  }
}

export const sfx = new Sfx();
