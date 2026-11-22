/**
 * Game audio. Interface sounds (button, coin, reward, error, result) are WAV samples
 * from the SoundWeaver library and crowd / goal roar / whistle are generated recordings, all in
 * game/assets/sfx/ (see ../assets/CREDITS.md); the other football sounds are a WebAudio synth.
 * Every sampled sound falls back to its synthesised version if the file is missing.
 */
const SAMPLE_DIR = new URL('../assets/sfx/', import.meta.url).href;
/** sfx name -> [file, volume] */
const SAMPLES = {
  click:     ['click-crisp-primary.wav', 0.3],
  star:      ['coin-collect.wav', 0.42],
  ding:      ['success-subtle-ping.wav', 0.4],
  praise:    ['xp-up.wav', 0.4],
  combo:     ['coin-double.wav', 0.42],
  objective: ['achievement.wav', 0.5],
  powerup:   ['level-up.wav', 0.5],
  deny:      ['error-soft-thud.wav', 0.45],
  result:    ['success-celebrate.wav', 0.5],
  resultLow: ['loading-complete-chord.wav', 0.42],
  // stadium audio (CellCog-generated); the synth crowd / cheer / whistle remain as fallback
  crowd:        ['crowd_ambience.mp3', 0.32],
  roar:         ['goal_roar.mp3', 0.7],
  whistleShort: ['whistle_short.mp3', 0.3],
  whistleLong:  ['whistle_long.mp3', 0.3],
};

class Sfx {
  raw = {};      // name -> ArrayBuffer (fetched at load, before any user gesture)
  buf = {};      // name -> decoded AudioBuffer
  dec = {};      // name -> decode in progress
  loading = null;
  bed = null;    // recorded crowd loop bus

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
    this.decodeAll();
  }

  /** Fetch every sample once (no AudioContext needed yet). */
  preload() {
    if (this.loading) return this.loading;
    this.loading = Promise.all(Object.entries(SAMPLES).map(([name, [file]]) =>
      fetch(`${SAMPLE_DIR}${file}`)
        .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(ab => { this.raw[name] = ab; })
        .catch(() => { /* synth fallback stays in use for this sound */ })
    )).then(() => this.decodeAll());
    return this.loading;
  }

  decodeAll() {
    if (!this.ctx) return;
    for (const name of Object.keys(this.raw)) {
      const ab = this.raw[name]; delete this.raw[name];
      this.dec[name] = this.ctx.decodeAudioData(ab).then(b => { this.buf[name] = b; if (name === 'crowd') this.startCrowdBed(); }).catch(() => {}).then(() => { delete this.dec[name]; });
    }
  }

  /** Play a decoded sample through the master gain. Returns false if it is not available. */
  sample(name, rate = 1, delay = 0, vol = 1, fadeAt = 0) {
    try { return this.playSample(name, rate, delay, vol, fadeAt); }
    catch (e) { console.warn('sfx sample failed', name, e); return false; }   // audio must never break the game loop
  }

  playSample(name, rate, delay, vol, fadeAt) {
    if (!this.ctx) return true;           // no audio yet: nothing to fall back to either
    const b = this.buf[name];
    // first press of the session: the context was only just created, so wait for the decode
    if (!b && this.dec[name]) { this.dec[name].then(() => { if (this.buf[name]) this.sample(name, rate, delay, vol, fadeAt); }); return true; }
    if (!b) return false;
    const s = this.ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate;
    const t = this.ctx.currentTime + delay;
    const g = this.ctx.createGain(); g.gain.value = SAMPLES[name][1] * vol;
    if (fadeAt > 0 && fadeAt < b.duration) {            // cut a long sample short with a smooth tail
      g.gain.setValueAtTime(g.gain.value, t + fadeAt * 0.5);
      g.gain.linearRampToValueAtTime(0, t + fadeAt);
    }
    s.connect(g); g.connect(this.master); s.start(t);
    if (fadeAt > 0 && fadeAt < b.duration) s.stop(t + fadeAt + 0.05);   // stop() is only legal after start()
    return true;
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
    this.crowdLfo = lfoG;
  }

  /**
   * Recorded crowd bed: the clip is looped by overlapping copies with an equal-power
   * crossfade, so the seam is inaudible whatever the file's own start/end are like.
   * Replaces the synthesised noise bed once the file has decoded.
   */
  startCrowdBed() {
    const c = this.ctx, b = this.buf.crowd;
    if (!c || !b || this.bed || b.duration < 4) return;
    const X = Math.min(2, b.duration / 4), period = b.duration - X, N = 64;
    const up = new Float32Array(N), down = new Float32Array(N);
    for (let i = 0; i < N; i++) { up[i] = Math.sin((i / (N - 1)) * Math.PI / 2); down[i] = Math.cos((i / (N - 1)) * Math.PI / 2); }
    this.bed = c.createGain(); this.bed.gain.value = 0; this.bed.connect(this.master);
    this.bed.gain.setTargetAtTime(SAMPLES.crowd[1], c.currentTime, 0.6);
    if (this.crowdGain) this.crowdGain.gain.setTargetAtTime(0, c.currentTime, 0.6);   // synth bed out
    if (this.crowdLfo) this.crowdLfo.gain.value = 0;
    const voice = (t0) => {
      const src = c.createBufferSource(); src.buffer = b;
      const g = c.createGain(); g.gain.value = 0;
      g.gain.setValueCurveAtTime(up, t0, X); g.gain.setValueCurveAtTime(down, t0 + period, X);
      src.connect(g); g.connect(this.bed); src.start(t0); src.stop(t0 + b.duration + 0.05);
      setTimeout(() => voice(t0 + period), Math.max(0, (t0 + period - c.currentTime - 1) * 1000));
    };
    voice(c.currentTime + 0.05);
  }

  /** Crowd swell (goal = 1, near miss = 0.4) */
  cheer(intensity = 1) {
    if (!this.ctx) return;
    if (this.buf.roar && this.sample('roar', 1, 0, Math.min(1, 0.25 + intensity * 0.75), intensity >= 0.9 ? 0 : 1 + intensity * 2.2)) return;
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
    const ws = this.buf.whistleShort, wl = this.buf.whistleLong;
    if (ws && (wl || !long)) {
      // short blasts; a "long" call ends on one long blast (full time = two short + one long)
      const gap = Math.max(0.42, ws.duration + 0.08), shorts = long ? times - 1 : times;
      for (let i = 0; i < shorts; i++) this.sample('whistleShort', 1, i * gap);
      if (long) this.sample('whistleLong', 1, shorts * gap);
      return;
    }
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
    if (this.sample('click')) return;
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
  ding()      { if (!this.sample('ding')) this.tune([1318], 0.1, 0.1, 'sine'); }          // pass completed
  praise()    { if (!this.sample('praise')) this.tune([784, 1046], 0.08, 0.1); }           // nice!
  /** Coin ring that climbs in pitch with the streak. */
  combo(n = 3) {
    if (this.sample('combo', Math.min(1.5, 1 + Math.max(0, n - 3) * 0.06))) return;
    this.tune([659, 784, 988, 1318].slice(0, Math.min(4, 1 + n)), 0.07, 0.11);
  }
  powerup()   { if (!this.sample('powerup')) this.tune([523, 659, 784, 1046, 1318], 0.06, 0.12, 'square'); }
  star()      { if (!this.sample('star')) this.tune([1568, 1976, 2637], 0.07, 0.09, 'sine'); }
  objective() { if (!this.sample('objective')) this.tune([784, 988, 1175, 1568], 0.1, 0.13); }
  /** Not allowed / mistake (not enough coins, wrong target). */
  deny()      { if (!this.sample('deny')) this.wall(); }
  /** Result card appears: celebration when good, a soft resolving chord otherwise. */
  result(good = true) {
    if (this.sample(good ? 'result' : 'resultLow')) return;
    this.tune(good ? [784, 988, 1175, 1568] : [523, 659], 0.1, 0.12);
  }
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
sfx.preload();
