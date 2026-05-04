/* ============================================================
   F17 STAR ARENA — v4 JavaScript
   Architecture:
   - Single canvas, fits viewport via CSS (100% width/height)
   - Pitch is a logical 1280x720 coordinate space
   - Canvas pixels = real screen size × DPR
   - Scenes own their own setup/update/draw
   - All tuning in CONFIG table
   ============================================================ */

'use strict';

const $ = (id) => document.getElementById(id);

// ============================================================
// CONFIG — central tuning for all gameplay numbers
// ============================================================
const CONFIG = {
  // Logical pitch coordinates
  pitch: { w: 1280, h: 720 },

  // Player physics
  player: {
    radius: 22,
    moveSpeed: 240,        // px/sec when joystick fully tilted
    dashSpeed: 480,        // px/sec during dash
    dashDuration: 0.45,    // seconds of dash
    dashCooldown: 1.4,     // seconds before dash usable again
    feintDuration: 0.5,
    feintCooldown: 1.2,
  },

  // Ball physics
  ball: {
    radius: 14,
    friction: 0.992,       // per frame at 60fps (≈0.6/sec)
    pickupRadius: 56,
    magnetRadius: 120,     // SHOOT button auto-pickup distance
    autoReturnDelay: 1.5,  // seconds before loose ball returns
    minSlowSpeed: 80,      // ball speed below this counts as "slow"
  },

  // Shot speeds (base + power × multiplier)
  shot: {
    arenaBase: 850,
    penaltyBase: 950,
    crossingBase: 600,
    powerMult: 400,
    minPower: 0.4,
    maxPower: 1.0,
  },

  // Goal
  goal: { w: 16, h: 220 },

  // Difficulty modifiers
  // Easy: forgiving — kid wins easily, builds confidence
  // Medium: balanced — challenging but fair
  // Hard: tough — real test, fewer goals, faster everything
  difficulty: {
    easy:   { keeperReact: 0.60, keeperRead: 0.20, defSpeed: 1.10, energyDrain: 0.20, label: 'ROOKIE',  shotPowerBoost: 1.30, defenderTackleRange: 0.85 },
    medium: { keeperReact: 0.32, keeperRead: 0.50, defSpeed: 1.45, energyDrain: 0.65, label: 'PRO',     shotPowerBoost: 1.05, defenderTackleRange: 1.05 },
    hard:   { keeperReact: 0.18, keeperRead: 0.75, defSpeed: 1.75, energyDrain: 1.10, label: 'LEGEND',  shotPowerBoost: 0.95, defenderTackleRange: 1.25 },
  },

  // Star rating thresholds
  stars: {
    perfectEnergyMin: 75,    // need 75%+ energy for 3 stars
    perfectTimeMin: 0.3,     // need 30%+ time remaining
    goodEnergyMin: 50,
  },

  // Free Kick Studio shot spots (player position; ball is +30 in front)
  // pitch is 1280×720, goal at x=1242 right edge
  shotSpots: {
    'close-c': { x: 1010, y: 360,  label: 'CLOSE • CENTER',     dist: '6m'  },
    'close-l': { x: 1010, y: 240,  label: 'CLOSE • LEFT',       dist: '6m'  },
    'close-r': { x: 1010, y: 480,  label: 'CLOSE • RIGHT',      dist: '6m'  },
    'mid-c':   { x: 880,  y: 360,  label: 'MID • CENTER (18m)', dist: '18m' },
    'mid-l':   { x: 880,  y: 200,  label: 'MID • LEFT WING',    dist: '18m' },
    'mid-r':   { x: 880,  y: 520,  label: 'MID • RIGHT WING',   dist: '18m' },
    'far-c':   { x: 720,  y: 360,  label: 'FAR • CENTER (30m)', dist: '30m' },
    'far-l':   { x: 720,  y: 180,  label: 'FAR • LEFT WING',    dist: '30m' },
    'far-r':   { x: 720,  y: 540,  label: 'FAR • RIGHT WING',   dist: '30m' },
  },

  // Levels per mode
  levels: {
    arena: [
      { name: 'WARM-UP',     goals: 2, defenders: 1, time: 0   /* free play */, coach: 'Score 2 goals to win!' },
      { name: 'TURNING UP',  goals: 3, defenders: 2, time: 0,   coach: 'Use DASH to beat defenders!' },
      { name: 'STAR PLAYER', goals: 3, defenders: 3, time: 180, coach: 'Aim for the corners!' },
    ],
    // FREE KICK STUDIO: 3 spots × 3 shots = 9 attempts per level
    penalty: [
      { name: 'WARMUP', goals: 2, shots: 9, spots: ['close-c', 'close-l', 'close-r'], coach: 'Aim with joystick. Try the corners!' },
      { name: 'STUDIO', goals: 3, shots: 9, spots: ['mid-c', 'mid-l', 'mid-r'],     coach: 'Wing shots auto-curve! Use power for far corners.' },
      { name: 'MASTER', goals: 4, shots: 9, spots: ['far-c', 'mid-l', 'far-r'],     coach: 'Mix corners! Keeper learns your pattern!' },
    ],
    crossing: [
      { name: 'WING DEBUT',   attacks: 2, time: 0,   coach: 'DASH past the fullback, then CROSS or SHOOT!' },
      { name: 'WING STAR',    attacks: 3, time: 0,   coach: 'Pick CROSS for header goals or SHOOT for top-corner!' },
      { name: 'WING MAESTRO', attacks: 4, time: 150, coach: 'Mix it up — keep the keeper guessing!' },
    ],
    boss: [
      { name: 'COURSE 1', gates: 5, defenders: 0, time: 0,   coach: 'Run through the numbered gates in order, then SHOOT!' },
      { name: 'COURSE 2', gates: 6, defenders: 1, time: 0,   coach: 'Avoid the defender — collect all gates, then score!' },
      { name: 'COURSE 3', gates: 7, defenders: 2, time: 120, coach: 'Master the course — DASH past defenders!' },
    ],
  },

  // Scoring
  combo: {
    bonusFor3: 2,    // 2x at 3-streak
    bonusFor5: 3,    // 3x at 5-streak
  },

  // Energy
  energyHit: {
    interceptArena: 8,
    bossBlock: 18,
    defenderBump: 6,
  },

  // Time
  freePlayMarker: 0,  // levels with time === 0 = free play
};

// ============================================================
// SAVE — fresh schema for v4
// ============================================================
const SAVE_KEY = 'f17_star_arena_v4';

const Save = {
  data: {
    version: 4,
    stars: 0, goals: 0, levels: 0,
    modeStars: { arena: 0, penalty: 0, crossing: 0, boss: 0 },
    sound: true, difficulty: 'easy',
    achievements: {},
    bestCombo: 0,
    topCornerGoals: 0,
    perfectLevels: 0,
  },
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.version === 4) Object.assign(this.data, parsed);
      }
    } catch (e) {}
  },
  write() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch (e) {}
  },
  reset() {
    Object.assign(this.data, {
      stars: 0, goals: 0, levels: 0,
      modeStars: { arena: 0, penalty: 0, crossing: 0, boss: 0 },
      achievements: {}, bestCombo: 0, topCornerGoals: 0, perfectLevels: 0,
      completedLevels: {},
    });
    this.write();
  },
  addLevelComplete(mode, levelIdx, stars) {
    const prev = this.data.modeStars[mode] || 0;
    if (stars > prev) {
      this.data.stars += (stars - prev);
      this.data.modeStars[mode] = stars;
    }
    // Track unique level completions
    this.data.completedLevels = this.data.completedLevels || {};
    const key = mode + ':' + levelIdx;
    if (!this.data.completedLevels[key] || stars > this.data.completedLevels[key]) {
      this.data.completedLevels[key] = stars;
    }
    // Single source of truth: count unique level keys
    this.data.levels = Object.keys(this.data.completedLevels).length;
    if (stars === 3) this.data.perfectLevels++;
    this.write();
  },
  addGoal() { this.data.goals++; this.write(); },
  unlockAchievement(id) {
    if (this.data.achievements[id]) return false;
    this.data.achievements[id] = Date.now();
    this.write();
    return true;
  },
};
Save.load();

// ============================================================
// ACHIEVEMENTS
// ============================================================
const ACHIEVEMENTS = {
  first_goal:    { name: 'FIRST GOAL!',         icon: '⚽', desc: 'Score your first goal' },
  hat_trick:     { name: 'HAT-TRICK HERO',      icon: '🎩', desc: '3 goals in a row' },
  on_fire:       { name: 'ON FIRE!',            icon: '🔥', desc: '5 goals in a row' },
  top_corner_5:  { name: 'CORNER SPECIALIST',   icon: '🎯', desc: 'Score 5 top-corner goals' },
  goal_10:       { name: 'STRIKER',             icon: '⭐', desc: '10 career goals' },
  goal_50:       { name: 'GOAL MACHINE',        icon: '💎', desc: '50 career goals' },
  goal_100:      { name: 'LEGEND',              icon: '👑', desc: '100 career goals' },
  perfect_level: { name: '3-STAR PERFORMANCE',  icon: '✨', desc: 'Earn 3 stars on a level' },
  all_modes:     { name: 'COMPLETE PLAYER',     icon: '🏆', desc: 'Win in every mode' },
  beat_legend:   { name: 'LEGEND SLAYER',       icon: '🥇', desc: 'Win on Legend difficulty' },
};

function checkAchievements(event, data) {
  const unlocks = [];
  if (event === 'goal') {
    if (Save.data.goals === 1) unlocks.push('first_goal');
    if (Save.data.goals === 10) unlocks.push('goal_10');
    if (Save.data.goals === 50) unlocks.push('goal_50');
    if (Save.data.goals === 100) unlocks.push('goal_100');
    if (data.combo === 3) unlocks.push('hat_trick');
    if (data.combo === 5) unlocks.push('on_fire');
    if (data.isTopCorner) {
      Save.data.topCornerGoals = (Save.data.topCornerGoals || 0) + 1;
      if (Save.data.topCornerGoals === 5) unlocks.push('top_corner_5');
      Save.write();
    }
  }
  if (event === 'level') {
    if (data.stars === 3) unlocks.push('perfect_level');
    if (data.diff === 'hard') unlocks.push('beat_legend');
    const won = Object.values(Save.data.modeStars).every(s => s > 0);
    if (won) unlocks.push('all_modes');
  }
  unlocks.forEach((id, i) => {
    if (Save.unlockAchievement(id)) {
      setTimeout(() => showAchievement(id), 1500 + i * 1800);
    }
  });
}

function showAchievement(id) {
  const a = ACHIEVEMENTS[id];
  if (!a) return;
  Audio.star();
  let el = document.querySelector('.achievement-popup');
  if (!el) {
    el = document.createElement('div');
    el.className = 'achievement-popup';
    document.body.appendChild(el);
  }
  el.innerHTML = `
    <div class="ach-popup-icon">${a.icon}</div>
    <div class="ach-popup-text">
      <div class="ach-popup-tag">UNLOCKED</div>
      <div class="ach-popup-name">${a.name}</div>
      <div class="ach-popup-desc">${a.desc}</div>
    </div>
  `;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3500);
}

// ============================================================
// AUDIO — procedural, layered
// ============================================================
const Audio = {
  ctx: null,
  enabled: Save.data.sound !== false,
  _ambient: null,

  init() {
    if (this.ctx) {
      // Resume if suspended (iOS Safari)
      if (this.ctx.state === 'suspended') {
        try { this.ctx.resume(); } catch (e) {}
      }
      return;
    }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      // iOS Safari: must resume after creation in user gesture
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    } catch (e) {}
  },
  beep(freq, dur, type = 'sine', vol = 0.1) {
    if (!this.enabled || !this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(g).connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + dur);
    } catch (e) {}
  },
  sweep(f1, f2, dur, type = 'sine', vol = 0.1) {
    if (!this.enabled || !this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f1, t);
      osc.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(g).connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + dur);
    } catch (e) {}
  },
  noise(vol, dur, freq = 800) {
    if (!this.enabled || !this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(filter).connect(g).connect(this.ctx.destination);
      src.start(t);
    } catch (e) {}
  },
  toggle() {
    this.enabled = !this.enabled;
    Save.data.sound = this.enabled;
    Save.write();
    if (this.enabled) { this.startAmbient(); this.buttonTap(); }
    else { this.stopAmbient(); }
  },
  // Game sounds
  kick() { this.beep(80, 0.06, 'sine', 0.18); this.sweep(220, 60, 0.12, 'square', 0.14); this.noise(0.07, 0.05, 1200); },
  goal() {
    this.sweep(440, 880, 0.1, 'square', 0.15);
    setTimeout(() => this.sweep(660, 1100, 0.14, 'square', 0.15), 90);
    setTimeout(() => this.sweep(880, 1320, 0.2, 'square', 0.13), 220);
    this.beep(110, 0.3, 'sine', 0.13);
    setTimeout(() => this.noise(0.4, 0.04, 1200), 200);
    setTimeout(() => this.noise(0.7, 0.08, 1800), 350);
  },
  save() { this.beep(180, 0.15, 'sawtooth', 0.11); this.sweep(800, 200, 0.2, 'sawtooth', 0.09); },
  miss() { this.beep(220, 0.2, 'sine', 0.08); },
  star() { this.beep(880, 0.04, 'sine', 0.07); setTimeout(() => this.beep(1320, 0.06, 'sine', 0.08), 30); setTimeout(() => this.beep(1760, 0.06, 'sine', 0.07), 70); },
  hit() { this.noise(0.13, 0.1, 400); this.beep(80, 0.1, 'sawtooth', 0.09); },
  whistle() { this.sweep(1800, 2400, 0.15, 'square', 0.07); setTimeout(() => this.sweep(2200, 1900, 0.18, 'square', 0.07), 200); },
  buttonTap() { this.beep(1100, 0.03, 'sine', 0.05); },
  countdown() { this.beep(660, 0.08, 'sine', 0.1); },
  feint() { this.sweep(880, 440, 0.08, 'sine', 0.09); this.noise(0.07, 0.04, 2000); },
  perfect() {
    this.beep(1320, 0.05, 'sine', 0.09);
    setTimeout(() => this.beep(1760, 0.05, 'sine', 0.09), 50);
    setTimeout(() => this.beep(2640, 0.1, 'sine', 0.09), 100);
    setTimeout(() => this.beep(3520, 0.15, 'sine', 0.07), 180);
  },
  combo(level) {
    const base = 440 + level * 110;
    this.beep(base, 0.06, 'sine', 0.07);
    this.beep(base * 1.5, 0.08, 'sine', 0.07);
  },
  dash() { this.sweep(140, 320, 0.18, 'sawtooth', 0.08); this.noise(0.08, 0.04, 600); },

  startAmbient() {
    if (!this.enabled || !this.ctx || this._ambient) return;
    try {
      const t = this.ctx.currentTime;
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 380;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.035, t + 1.5);
      src.connect(filter).connect(g).connect(this.ctx.destination);
      src.start(t);
      this._ambient = { src, gain: g };
    } catch (e) {}
  },
  stopAmbient() {
    if (!this._ambient) return;
    try {
      const t = this.ctx.currentTime;
      this._ambient.gain.gain.linearRampToValueAtTime(0, t + 0.3);
      const node = this._ambient;
      setTimeout(() => { try { node.src.stop(); } catch(e){} }, 400);
    } catch(e){}
    this._ambient = null;
  },
};

// ============================================================
// HELPERS
// ============================================================
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const angleTo = (from, to) => Math.atan2(to.y - from.y, to.x - from.x);

function hapticPattern(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch(e){} }

// Round rect helper
function roundRect(ctx, x, y, w, h, r, fill = true, stroke = false) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

// ============================================================
// SPRITES
// ============================================================
const SPRITES = {
  player: new Image(),
  opp: new Image(),
};
SPRITES.player.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAACRAAAAKJCAMAAAD+lmd0AAABCGlDQ1BJQ0MgUHJvZmlsZQAAeJxjYGA8wQAELAYMDLl5JUVB7k4KEZFRCuwPGBiBEAwSk4sLGHADoKpv1yBqL+viUYcLcKakFicD6Q9ArFIEtBxopAiQLZIOYWuA2EkQtg2IXV5SUAJkB4DYRSFBzkB2CpCtkY7ETkJiJxcUgdT3ANk2uTmlyQh3M/Ck5oUGA2kOIJZhKGYIYnBncAL5H6IkfxEDg8VXBgbmCQixpJkMDNtbGRgkbiHEVBYwMPC3MDBsO48QQ4RJQWJRIliIBYiZ0tIYGD4tZ2DgjWRgEL7AwMAVDQsIHG5TALvNnSEfCNMZchhSgSKeDHkMyQx6QJYRgwGDIYMZAKbWPz9HbOBQAAAA/1BMVEWgXCajoZ8fGR3h4t7bnlnw2aNXKxKfb1BiX10lXJ8TJ1ELatvKbTFpSimqjGfNtJuYMgspSGwCNZVXcZaasdJoiqevzuvMdUfQjTa1hjBtm8/w1ni5wrJJO0gkg+B0hHE4i6PEvMUzRDmFfIRJesbCOgh9w/2/xnn4wDkAAAD4t3P5x2r39/EEWMkGZtT5xYj0qWcFSK4EOI35xVv71XUFKW2vZi4KVLb52YoKJVMNRZPrmFQMNXT0u4bw5tfxpVoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACopymAAAAAQHRSTlP//////////////////////////////////////////////////////wD/////////////////////////////lLAkxQABAABJREFUeNrsvW1v4zi3LErLpOQ9iKgePHcQCzkX++DcT6ECyIAFgwcN2f//X91Va5ESJdtJenZ3TzIhZ6Y7nbfOmCJZrFWrSj3nkUceeeSRRx55fPGh8kuQRx555JFHHnlkQJRHHnnkkUceeeSRAVEeeeSRRx555JFHBkR55JFHHnnkkUceGRDlkUceeeSRRx55ZECURx555JFHHnnkkQFRHnnkkUceeeSRRwZEeeSRRx555JFHHhkQ5ZFHHnnkkUceeWRAlEceeeSRRx555JEBUR555JFHHnnkkUcGRHnkkUceeeSRRx4ZEOWRRx555JFHHnlk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';
SPRITES.opp.src = 'data:image/png;base64,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';

const FRAME_PLAYER = { IDLE: 0, RUN1: 1, RUN2: 2, KICK: 3, CELEBRATE: 4 };
const FRAME_OPP = { DEF_STAND: 0, DEF_RUN: 1, GK_READY: 2, GK_DIVE: 3 };

function drawSprite(img, frameIdx, totalFrames, x, y, w, h, flip = false) {
  if (!img.complete || !img.naturalWidth) {
    // Fallback box
    ctx.fillStyle = '#54d9ff';
    ctx.fillRect(x - w/2, y - h, w, h);
    return;
  }
  const sw = img.naturalWidth / totalFrames;
  const sh = img.naturalHeight;
  ctx.save();
  if (flip) {
    ctx.translate(x, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(img, sw * frameIdx, 0, sw, sh, -w/2, y - h, w, h);
  } else {
    ctx.drawImage(img, sw * frameIdx, 0, sw, sh, x - w/2, y - h, w, h);
  }
  ctx.restore();
}

// ============================================================
// CANVAS / VIEW — proper viewport handling
// ============================================================
const canvas = $('canvas');
const ctx = canvas.getContext('2d');

let view = {
  scale: 1,        // pitch units → screen pixels
  offsetX: 0,
  offsetY: 0,
  screenW: 0,
  screenH: 0,
  dpr: 1,
};

function resizeCanvas() {
  const dpr = Math.min(1.5, window.devicePixelRatio || 1);  // capped for perf
  const sw = window.innerWidth;
  const sh = window.innerHeight;

  canvas.width = Math.round(sw * dpr);
  canvas.height = Math.round(sh * dpr);
  // CSS already handles 100% sizing — no inline style needed

  view.screenW = sw;
  view.screenH = sh;
  view.dpr = dpr;

  // Aspect ratios
  const scaleX = sw / CONFIG.pitch.w;
  const scaleY = sh / CONFIG.pitch.h;
  const fillScale = Math.max(scaleX, scaleY);  // fills screen, may crop pitch
  const fitScale = Math.min(scaleX, scaleY);   // shows full pitch, may letterbox

  const isPortrait = sh > sw;
  const isMobile = sw < 900;

  if (isPortrait && isMobile) {
    showRotate(true);
    view.scale = fitScale;
    view.offsetX = (sw - CONFIG.pitch.w * view.scale) / 2;
    view.offsetY = (sh - CONFIG.pitch.h * view.scale) / 2;
  } else {
    showRotate(false);
    // Hybrid fill: scale up to fill the screen, but cap the crop so playfield
    // edges (goals, sidelines) stay visible. Cap = 1.18× fitScale, which on
    // typical desktop 16:9 (1.78) and iPhone landscape (~2.16) eliminates
    // black bars while keeping crop under ~10% per side.
    const maxScale = fitScale * 1.18;
    view.scale = Math.min(fillScale, maxScale);
    const scaledPitchW = CONFIG.pitch.w * view.scale;
    const scaledPitchH = CONFIG.pitch.h * view.scale;
    view.offsetX = (sw - scaledPitchW) / 2;
    view.offsetY = (sh - scaledPitchH) / 2;
  }
}

function showRotate(show) {
  const el = $('rotateOverlay');
  el.hidden = !show;
}

function applyView() {
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.translate(view.offsetX, view.offsetY);
  ctx.scale(view.scale, view.scale);
}

window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 200));

// Auto-pause when tab is backgrounded (kid switches apps, locks screen, etc)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (Scene.current && Scene.current.G && Scene.current.G.running && !Scene.current.G.paused) {
      Scene.current.G.paused = true;
      const overlay = document.getElementById('pauseOverlay');
      if (overlay) overlay.hidden = false;
    }
    // Also pause audio
    if (Audio.ctx && Audio.ctx.state === 'running') {
      try { Audio.ctx.suspend(); } catch (e) {}
    }
  } else {
    // Resume audio context — user must explicitly click resume to unpause game
    if (Audio.ctx && Audio.ctx.state === 'suspended') {
      try { Audio.ctx.resume(); } catch (e) {}
    }
  }
});

// ============================================================
// INPUT
// ============================================================
const Input = {
  joy: { x: 0, y: 0, active: false, id: null },
  shootHeld: false,
};

const joystickEl = $('joystick');
const joyStickEl = $('joyStick');
const shootBtn = $('shootBtn');
const dashBtn = $('dashBtn');
const feintBtn = $('feintBtn');

function joystickPoint(e) {
  const r = joystickEl.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  let x = (e.clientX - cx) / (r.width / 2);
  let y = (e.clientY - cy) / (r.height / 2);
  const len = Math.hypot(x, y);
  if (len > 1) { x /= len; y /= len; }
  Input.joy.x = x;
  Input.joy.y = y;
  joyStickEl.style.transform = `translate(calc(-50% + ${x * 30}px), calc(-50% + ${y * 30}px))`;
}

joystickEl.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  Audio.init();
  Input.joy.active = true;
  Input.joy.id = e.pointerId;
  joystickEl.setPointerCapture(e.pointerId);
  joystickPoint(e);
});
joystickEl.addEventListener('pointermove', (e) => {
  if (Input.joy.active && e.pointerId === Input.joy.id) joystickPoint(e);
});
function joystickReset() {
  Input.joy = { x: 0, y: 0, active: false, id: null };
  joyStickEl.style.transform = 'translate(-50%, -50%)';
}
joystickEl.addEventListener('pointerup', joystickReset);
joystickEl.addEventListener('pointercancel', joystickReset);

shootBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  Audio.init();
  Input.shootHeld = true;
  Scene.current.onShootDown && Scene.current.onShootDown();
});
shootBtn.addEventListener('pointerup', (e) => {
  e.preventDefault();
  Input.shootHeld = false;
  Scene.current.onShootUp && Scene.current.onShootUp();
});
shootBtn.addEventListener('pointercancel', () => {
  Input.shootHeld = false;
  Scene.current.onShootUp && Scene.current.onShootUp();
});

dashBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  Audio.init();
  Scene.current.onDash && Scene.current.onDash();
});

feintBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  Audio.init();
  Scene.current.onFeint && Scene.current.onFeint();
});

// Keyboard for desktop
window.addEventListener('keydown', (e) => {
  if (e.key === ' ' && !e.repeat) {
    e.preventDefault();
    Input.shootHeld = true;
    Scene.current.onShootDown && Scene.current.onShootDown();
  }
  if (e.key === 'Shift') Scene.current.onDash && Scene.current.onDash();
  if (e.key.toLowerCase() === 'f') Scene.current.onFeint && Scene.current.onFeint();
  if (e.key === 'Escape') Scene.current.onPause && Scene.current.onPause();
});
window.addEventListener('keyup', (e) => {
  if (e.key === ' ') {
    Input.shootHeld = false;
    Scene.current.onShootUp && Scene.current.onShootUp();
  }
});
window.addEventListener('keydown', (e) => {
  // WASD/arrows for joystick simulation on desktop
  let dx = 0, dy = 0;
  if (['ArrowLeft', 'a', 'A'].includes(e.key)) dx = -1;
  if (['ArrowRight', 'd', 'D'].includes(e.key)) dx = 1;
  if (['ArrowUp', 'w', 'W'].includes(e.key)) dy = -1;
  if (['ArrowDown', 's', 'S'].includes(e.key)) dy = 1;
  if (dx || dy) { Input.joy.x = dx; Input.joy.y = dy; }
});
window.addEventListener('keyup', (e) => {
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','a','A','d','D','w','W','s','S'].includes(e.key)) {
    Input.joy.x = 0; Input.joy.y = 0;
  }
});

// Prevent canvas scroll
document.addEventListener('touchmove', (e) => {
  if (Scene.current && Scene.current.name !== 'home') e.preventDefault();
}, { passive: false });

// ============================================================
// SCENE MANAGER
// ============================================================
const Scene = {
  current: null,
  scenes: {},
  raf: 0,
  lastTime: 0,

  register(name, scene) {
    scene.name = name;
    this.scenes[name] = scene;
  },

  switch(name, params = {}) {
    if (this.current && this.current.exit) this.current.exit();
    this.current = this.scenes[name];
    this.current.params = params;
    if (this.current.enter) this.current.enter(params);
    if (!this.raf) this.start();
  },

  start() {
    this.lastTime = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - this.lastTime) / 1000);
      this.lastTime = now;
      if (this.current && this.current.update) this.current.update(dt);
      if (this.current && this.current.draw) this.current.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  },
};

// ============================================================
// HOME SCENE
// ============================================================
Scene.register('home', {
  enter() {
    $('home').classList.add('active');
    $('game').classList.remove('active');
    Audio.stopAmbient();
    refreshHome();
  },
  exit() {
    $('home').classList.remove('active');
  },
  update() {},
  draw() {},
});

function refreshHome() {
  $('careerStars').textContent = Save.data.stars;
  $('careerGoals').textContent = Save.data.goals;
  $('careerLevels').textContent = Save.data.levels;

  // Mode stars
  ['arena', 'penalty', 'crossing', 'boss'].forEach((mode) => {
    const el = document.querySelector(`[data-mode-stars="${mode}"]`);
    if (el) {
      const s = Save.data.modeStars[mode] || 0;
      el.textContent = '★'.repeat(s) + '☆'.repeat(3 - s);
    }
  });

  // Sound
  $('soundOn').hidden = !Audio.enabled;
  $('soundOff').hidden = Audio.enabled;

  // Difficulty
  document.querySelectorAll('.diff-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.diff === Save.data.difficulty);
  });

  // Achievements
  const total = Object.keys(ACHIEVEMENTS).length;
  const unlocked = Object.keys(Save.data.achievements || {}).length;
  $('achCount').textContent = `${unlocked}/${total}`;
  const row = $('achRow');
  row.innerHTML = Object.entries(ACHIEVEMENTS).map(([id, a]) => {
    const u = !!Save.data.achievements?.[id];
    return `<div class="ach-pill ${u ? 'unlocked' : ''}" title="${a.name}: ${a.desc}">${a.icon}</div>`;
  }).join('');
}

// Mode card clicks
document.querySelectorAll('.mode-card').forEach((card) => {
  card.addEventListener('click', () => {
    Audio.init(); Audio.buttonTap();
    showModeIntro(card.dataset.mode);
  });
});
// Difficulty
document.querySelectorAll('.diff-btn').forEach((b) => {
  b.addEventListener('click', () => {
    Audio.buttonTap();
    Save.data.difficulty = b.dataset.diff;
    Save.write();
    refreshHome();
  });
});
// Sound
$('soundBtn').addEventListener('click', () => {
  Audio.init();
  Audio.toggle();
  refreshHome();
});
// Reset
$('resetBtn').addEventListener('click', () => {
  if (confirm('Reset all progress?')) { Save.reset(); refreshHome(); }
});
// Help
$('helpBtn').addEventListener('click', () => showHelp());

// ============================================================
// MODAL
// ============================================================
const modal = $('modal');
const modalPanel = $('modalPanel');

function showModal(html) {
  modalPanel.innerHTML = html;
  modal.hidden = false;
}
function hideModal() { modal.hidden = true; }

function showHelp() {
  showModal(`
    <div class="modal-icon">⚽</div>
    <h2>HOW TO PLAY</h2>
    <div class="intro-steps">
      <div class="intro-step"><div class="step-num">1</div><div class="step-icon">🕹️</div><div class="step-text">Joystick (left) moves Faisal. Aim by holding it while charging.</div></div>
      <div class="intro-step"><div class="step-num">2</div><div class="step-icon">⚽</div><div class="step-text">Hold red SHOOT button to charge power. Release to kick!</div></div>
      <div class="intro-step"><div class="step-num">3</div><div class="step-icon">⚡</div><div class="step-text">Tap yellow DASH for a speed burst — beats defenders!</div></div>
      <div class="intro-step"><div class="step-num">4</div><div class="step-icon">↗️</div><div class="step-text">WING ATTACK: DASH past the fullback, then tap CROSS or SHOOT</div></div>
      <div class="intro-step"><div class="step-num">5</div><div class="step-icon">🚩</div><div class="step-text">SKILLS COURSE: run through numbered gates in order, then SHOOT at goal</div></div>
    </div>
    <button class="btn-primary" id="mClose">LET'S PLAY!</button>
  `);
  $('mClose').onclick = () => { Audio.buttonTap(); hideModal(); };
}

function showModeIntro(mode) {
  const cfg = CONFIG.levels[mode];
  const stars = Save.data.modeStars[mode] || 0;
  const modeNames = { arena: 'STAR ARENA', penalty: 'FREE KICK STUDIO', crossing: 'WING ATTACK', boss: 'SKILLS COURSE' };
  const modeIcons = { arena: '⚽', penalty: '🎯', crossing: '↗️', boss: '⚡' };

  const instructions = {
    arena: [
      { icon: '🕹️', text: 'Move Faisal with the joystick' },
      { icon: '⚽', text: 'Hold SHOOT to charge — joystick UP/DOWN aims!' },
      { icon: '↶', text: 'Shoot from the wings to bend the ball into the goal' },
      { icon: '⚡', text: 'Tap DASH for speed bursts past defenders' },
      { icon: '🏆', text: `Score ${cfg[0].goals} goals to win` },
    ],
    penalty: [
      { icon: '🎯', text: 'Take 9 free kicks from 3 different spots' },
      { icon: '🕹️', text: 'Joystick UP/DOWN aims high or low corners' },
      { icon: '↶', text: 'Wing shots auto-curve toward goal — like real wingers!' },
      { icon: '💪', text: 'Hold SHOOT longer = more power' },
      { icon: '👀', text: 'Keeper LEARNS — never repeat the same corner!' },
      { icon: '🏆', text: `Score ${cfg[0].goals}/9 to win level` },
    ],
    crossing: [
      { icon: '⚡', text: 'PHASE 1 — DASH past the fullback on the wing' },
      { icon: '🏃', text: 'PHASE 2 — Run to the byline (highlighted zone)' },
      { icon: '🤔', text: 'PHASE 3 — DECIDE: CROSS button or SHOOT yourself' },
      { icon: '🎯', text: 'Cross = teammate scores from header' },
      { icon: '⚽', text: 'Shoot = curving wing strike into far corner' },
      { icon: '🏆', text: `Complete ${cfg[0].attacks} attacks to win` },
    ],
    boss: [
      { icon: '🎯', text: 'Run through numbered GATES in order: 1 → 2 → 3...' },
      { icon: '🔵', text: 'Active gate glows BLUE. Touch it to collect.' },
      { icon: '⚽', text: 'After all gates collected, run to goal and SHOOT' },
      { icon: '⚡', text: 'Tap DASH (yellow) for speed bursts past defenders' },
      { icon: '🏆', text: `Collect all ${cfg[0].gates} gates and score to win!` },
    ],
  }[mode];

  showModal(`
    <div class="modal-icon">${modeIcons[mode]}</div>
    <h2>${modeNames[mode]}</h2>
    <div class="modal-stars">${[0,1,2].map(i => `<span class="star ${i < stars ? 'earned' : ''}">★</span>`).join('')}</div>
    <div class="intro-steps">
      ${instructions.map((s, i) => `
        <div class="intro-step">
          <div class="step-num">${i + 1}</div>
          <div class="step-icon">${s.icon}</div>
          <div class="step-text">${s.text}</div>
        </div>
      `).join('')}
    </div>
    <button class="btn-primary" id="mStart">▶ START PLAYING</button>
    <button class="btn-secondary" id="mCancel">BACK</button>
  `);
  $('mStart').onclick = () => {
    Audio.buttonTap();
    hideModal();
    startLevel(mode, 0);
  };
  $('mCancel').onclick = () => { Audio.buttonTap(); hideModal(); };
}

// ============================================================
// HUD
// ============================================================
const HUD = {
  set(id, value) { const el = $(id); if (el) el.textContent = value; },
  setEnergy(pct) {
    $('energyFill').style.width = clamp(pct, 0, 100) + '%';
  },
  setCombo(combo) {
    const el = $('comboHud');
    if (combo < 2) { el.hidden = true; return; }
    el.hidden = false;
    el.classList.toggle('hot', combo >= 3);
    el.classList.toggle('fire', combo >= 5);
    const labels = { 2: 'DOUBLE', 3: 'TRIPLE', 4: 'QUAD', 5: 'PENTA', 6: 'HEXA' };
    $('comboLabel').textContent = labels[Math.min(6, combo)] || `${combo}x`;
    $('comboMult').textContent = `x${combo >= 5 ? 3 : combo >= 3 ? 2 : 1}`;
  },
  setCoach(text, duration = 4000) {
    if (!text) { $('coachBubble').hidden = true; return; }
    $('coachText').textContent = text;
    $('coachBubble').hidden = false;
    clearTimeout(this._coachT);
    this._coachT = setTimeout(() => $('coachBubble').hidden = true, duration);
  },
  showToast(text, color = 'gold', duration = 1200) {
    const el = $('toast');
    $('toastText').textContent = text;
    el.className = 'toast' + (color === 'red' ? ' red' : '');
    el.hidden = false;
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => el.hidden = true, duration);
  },
  setMission(target, text) {
    $('mbTarget').textContent = target;
    $('mbText').textContent = text;
  },
  setScoreboard(home, away, awayLabel, mode, level) {
    $('sbHome').textContent = home;
    $('sbAway').textContent = away;
    $('sbAwayLabel').textContent = awayLabel;
    $('sbMode').textContent = mode;
    $('sbLevel').textContent = level;
  },
  setTimeStyle(remaining) {
    const el = $('sbAway');
    el.classList.toggle('time-low', remaining < 20 && remaining > 10);
    el.classList.toggle('time-critical', remaining > 0 && remaining <= 10);
  },
  showFeintBtn(show) { $('feintBtn').hidden = !show; },
  setFeintLabel(label) {
    const btn = $('feintBtn');
    const lbl = btn.querySelector('.ab-label');
    if (lbl) lbl.textContent = label;
  },
};

// ============================================================
// PITCH RENDERING (shared across game scenes)
// ============================================================
// Cache static pitch (lines, stripes, gradient) to offscreen canvas for perf
let pitchCache = null;
function buildPitchCache() {
  const w = CONFIG.pitch.w;
  const h = CONFIG.pitch.h;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const cx = c.getContext('2d');

  // Thin dark band at very top (subtle stadium hint, not distracting)
  cx.fillStyle = '#02110a';
  cx.fillRect(0, 0, w, 18);

  // Pitch (green) — gradient with stripes — use almost full canvas
  const pitchTop = 18;
  const pitchH = h - pitchTop;
  const grad = cx.createLinearGradient(0, pitchTop, 0, h);
  grad.addColorStop(0, '#1a8a3e');
  grad.addColorStop(1, '#0d6028');
  cx.fillStyle = grad;
  cx.fillRect(0, pitchTop, w, pitchH);
  cx.fillStyle = 'rgba(255,255,255,0.04)';
  for (let i = 0; i < 12; i++) {
    if (i % 2 === 0) cx.fillRect(i * (w / 12), pitchTop, w / 12, pitchH);
  }
  // Lines
  cx.strokeStyle = 'rgba(255,255,255,0.55)';
  cx.lineWidth = 3;
  cx.strokeRect(40, pitchTop + 14, w - 80, pitchH - 28);
  cx.beginPath();
  cx.arc(w/2, pitchTop + pitchH/2, 80, 0, Math.PI*2);
  cx.stroke();
  cx.beginPath();
  cx.moveTo(w/2, pitchTop + 14);
  cx.lineTo(w/2, h - 14);
  cx.stroke();
  cx.strokeRect(w - 240, pitchTop + 90, 200, pitchH - 180);
  cx.strokeRect(w - 100, pitchTop + 170, 60, pitchH - 340);
  cx.strokeRect(40, pitchTop + 90, 200, pitchH - 180);
  cx.strokeRect(40, pitchTop + 170, 60, pitchH - 340);
  cx.fillStyle = 'rgba(255,255,255,0.7)';
  cx.beginPath(); cx.arc(w - 150, pitchTop + pitchH/2, 4, 0, Math.PI*2); cx.fill();
  cx.beginPath(); cx.arc(150, pitchTop + pitchH/2, 4, 0, Math.PI*2); cx.fill();

  pitchCache = c;
}

function drawPitch(t) {
  if (!pitchCache) buildPitchCache();
  // Blit cached static pitch (single fast operation) — no overlay clutter
  ctx.drawImage(pitchCache, 0, 0);
}

// Draw goal at right side
function drawGoal() {
  const g = { x: CONFIG.pitch.w - 38, y: CONFIG.pitch.h / 2, w: CONFIG.goal.w, h: CONFIG.goal.h };
  const top = g.y - g.h/2;
  // Net background
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(g.x, top, 26, g.h);
  // Net pattern
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    const dy = top + i * (g.h / 8);
    ctx.beginPath();
    ctx.moveTo(g.x, dy);
    ctx.lineTo(g.x + 26, dy + 4);
    ctx.stroke();
  }
  for (let i = 0; i < 6; i++) {
    const dx = g.x + i * (26 / 5);
    ctx.beginPath();
    ctx.moveTo(dx, top);
    ctx.lineTo(dx, top + g.h);
    ctx.stroke();
  }
  // Posts (white)
  ctx.fillStyle = '#fff';
  ctx.fillRect(g.x - 4, top - 4, 8, g.h + 8);  // left post
  ctx.fillRect(g.x - 4, top - 4, 38, 8);       // crossbar
  ctx.fillRect(g.x - 4, top + g.h - 4, 38, 8); // bottom bar
  return g;
}

// Particle system
function makeParticles(x, y, color, count, opts = {}) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({
      x, y,
      vx: rand(-(opts.speed || 200), (opts.speed || 200)),
      vy: rand(-(opts.speed || 200), opts.gravity ? -(opts.speed || 100) : (opts.speed || 200)),
      r: rand(2, opts.maxR || 6),
      color,
      life: rand(0.4, opts.life || 1.0),
      gravity: opts.gravity,
    });
  }
  return out;
}

function updateParticles(arr, dt) {
  return arr.filter((p) => {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.96;
    p.vy *= 0.96;
    if (p.gravity) p.vy += 600 * dt;
    return p.life > 0;
  });
}

function drawParticles(arr) {
  arr.forEach((p) => {
    ctx.globalAlpha = clamp(p.life, 0, 1);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function drawShadow(x, y, w = 20, h = 6) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ============================================================
// COMMON GAME STATE BUILDER
// ============================================================
function makeGameState(mode, levelIdx) {
  const cfg = CONFIG.levels[mode][levelIdx];
  return {
    mode,
    levelIdx,
    cfg,
    diff: Save.data.difficulty,
    running: true,
    paused: false,
    countdown: 3,

    score: 0,
    goalsScored: 0,
    energy: 100,
    combo: 0,
    bestCombo: 0,
    timeLeft: cfg.time || 999,
    attemptsUsed: 0,
    // Free Kick Studio
    spotIdx: 0,
    shotsAtSpot: 0,
    // Wing Attack
    attacksCompleted: 0,
    wingPhase: 'beat',
    wingByline: false,
    wingSide: 'right',
    crossDelivered: false,
    // Skills Course
    gateIdx: 0,
    gatesCollected: 0,
    coursePhase: 'gates',  // 'gates' | 'shoot'
    gates: [],

    player: {
      x: 200, y: CONFIG.pitch.h / 2,
      vx: 0, vy: 0,
      r: CONFIG.player.radius,
      facing: 0,
      animTime: 0, runTime: 0,
      kickTime: 0, dashTime: 0, dashCool: 0,
      celebTime: 0, hitTime: 0,
      feintTime: 0, feintCool: 0,
    },

    ball: {
      x: 240, y: CONFIG.pitch.h / 2,
      vx: 0, vy: 0,
      r: CONFIG.ball.radius,
      owner: 'player', // 'player', 'none', 'enemy'
      lastTouch: 'player',
      looseTime: 0,
      spin: 0,
      shotInfo: null,
    },

    keeper: {
      x: CONFIG.pitch.w - 60, y: CONFIG.pitch.h / 2,
      r: 20, animTime: 0,
      reactionTime: 0, committedY: CONFIG.pitch.h / 2,
      shotMemory: [],
      anim: 'ready', diveTime: 0,
    },

    enemies: [],
    teammate: null,
    crossZone: null,

    charge: { active: false, power: 0, aimX: 0, aimY: 0 },

    particles: [],
    shockwaves: [],
    timeScale: 1,
    timeScaleTarget: 1,
    crowdHype: 0,
  };
}

// ============================================================
// SHARED MECHANICS — used by all game scenes
// ============================================================
const Mechanics = {
  updatePlayer(G, dt) {
    const p = G.player;
    const cfg = CONFIG.player;
    p.animTime += dt;
    p.kickTime = Math.max(0, p.kickTime - dt);
    p.celebTime = Math.max(0, p.celebTime - dt);
    p.dashTime = Math.max(0, p.dashTime - dt);
    p.dashCool = Math.max(0, p.dashCool - dt);
    p.hitTime = Math.max(0, p.hitTime - dt);
    p.feintTime = Math.max(0, p.feintTime - dt);
    p.feintCool = Math.max(0, p.feintCool - dt);

    if (G.charge.active) {
      // Update aim
      G.charge.aimX = Input.joy.x;
      G.charge.aimY = Input.joy.y;
      G.charge.power = clamp(G.charge.power + dt * 0.7, 0, 1);
      // Slow movement during charge
      p.vx *= 0.85; p.vy *= 0.85;
      // While charging, always face goal (right)
      p.facing = 0;
    } else if (p.celebTime <= 0) {
      // FREE KICK MODE: player is rooted to the spot — joystick aims, doesn't move
      if (G.mode === 'penalty') {
        p.vx *= 0.5; p.vy *= 0.5;
        p.facing = 0;  // always face goal
        // Joystick is interpreted as AIM PREVIEW — no movement
      } else {
        const speed = p.dashTime > 0 ? cfg.dashSpeed : cfg.moveSpeed;
        const tx = Input.joy.x * speed;
        const ty = Input.joy.y * speed;
        p.vx = lerp(p.vx, tx, dt * 8);
        p.vy = lerp(p.vy, ty, dt * 8);
        if (Math.abs(p.vx) > 5 || Math.abs(p.vy) > 5) {
          p.facing = Math.atan2(p.vy, p.vx);
          p.runTime += dt;
        } else {
          // Idle: face toward goal (right) gradually
          p.facing = lerp(p.facing, 0, dt * 3);
        }
      }
    }

    p.x = clamp(p.x + p.vx * dt, 60, CONFIG.pitch.w - 60);
    p.y = clamp(p.y + p.vy * dt, 100, CONFIG.pitch.h - 40);
  },

  updateBall(G, dt) {
    const b = G.ball;
    const p = G.player;

    if (b.owner === 'player' && p.celebTime <= 0) {
      // Stick to player slightly ahead in facing direction
      const offX = Math.cos(p.facing) * 32;
      const offY = Math.sin(p.facing) * 32;
      b.x = lerp(b.x, p.x + offX, dt * 14);
      b.y = lerp(b.y, p.y + offY, dt * 14);
      b.vx = 0; b.vy = 0;
      b.looseTime = 0;
      return;
    }

    // Spin curve
    if (Math.abs(b.spin) > 0.01) {
      const speed = Math.hypot(b.vx, b.vy);
      if (speed > 0.1) {
        const perpX = -b.vy / speed;
        const perpY = b.vx / speed;
        b.vx += perpX * b.spin * 380 * dt;
        b.vy += perpY * b.spin * 380 * dt;
      }
      b.spin *= 0.985;
    }

    // Position update
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    // Friction
    b.vx *= CONFIG.ball.friction;
    b.vy *= CONFIG.ball.friction;
    // Bounds
    if (b.x < b.r) { b.x = b.r; b.vx *= -0.6; }
    if (b.x > CONFIG.pitch.w - b.r) { b.x = CONFIG.pitch.w - b.r; b.vx *= -0.6; }
    if (b.y < 100) { b.y = 100; b.vy *= -0.6; }
    if (b.y > CONFIG.pitch.h - 40) { b.y = CONFIG.pitch.h - 40; b.vy *= -0.6; }

    // Pickup if close & slow
    if (b.lastTouch !== 'just-shot' && dist(b, p) < CONFIG.ball.pickupRadius && Math.hypot(b.vx, b.vy) < 220 && p.celebTime <= 0) {
      b.owner = 'player';
      b.lastTouch = 'player';
      b.looseTime = 0;
    }

    // Auto-return after delay
    if (b.owner !== 'player' && Math.hypot(b.vx, b.vy) < CONFIG.ball.minSlowSpeed) {
      b.looseTime += dt;
      if (b.looseTime > CONFIG.ball.autoReturnDelay) {
        Mechanics.resetBall(G);
        HUD.setCoach('Ball returned. Try again!', 2500);
      }
    } else {
      b.looseTime = 0;
    }

    // Cool down lastTouch
    if (b.lastTouch === 'just-shot') {
      setTimeout(() => { if (G.ball.lastTouch === 'just-shot') G.ball.lastTouch = 'shot'; }, 350);
    }
  },

  resetBall(G) {
    const p = G.player;
    G.ball.x = p.x + 30;
    G.ball.y = p.y;
    G.ball.vx = 0; G.ball.vy = 0;
    G.ball.spin = 0;
    G.ball.owner = 'player';
    G.ball.lastTouch = 'player';
    G.ball.shotInfo = null;
    G.ball.shotResolved = false;
    G.ball.looseTime = 0;
  },

  updateKeeper(G, dt) {
    const k = G.keeper;
    k.animTime += dt;
    k.diveTime = Math.max(0, k.diveTime - dt);

    // PENALTY mode: keeper anticipates aim during charge
    if (G.mode === 'penalty' && G.charge.active) {
      const diff = CONFIG.difficulty[G.diff];
      const aimY = G.charge.aimY || 0;
      const predictedY = CONFIG.pitch.h / 2 + aimY * CONFIG.goal.h * 0.32;
      const speed = 280 * diff.keeperRead + 80;
      const dy = predictedY - k.y;
      k.y += Math.sign(dy) * Math.min(Math.abs(dy), speed * dt);
      k.y = clamp(k.y, CONFIG.pitch.h/2 - CONFIG.goal.h/2 + 12, CONFIG.pitch.h/2 + CONFIG.goal.h/2 - 12);
      k.anim = 'ready';
      return;
    }

    if (k.reactionTime > 0) {
      k.reactionTime -= dt;
      k.y = CONFIG.pitch.h / 2 + Math.sin(k.animTime * 1.2) * 4;
    } else if (G.ball.shotInfo && G.ball.lastTouch !== 'player') {
      const dy = k.committedY - k.y;
      const diff = CONFIG.difficulty[G.diff];
      const speed = 540 * diff.keeperRead + 260;
      k.y += Math.sign(dy) * Math.min(Math.abs(dy), speed * dt);
      k.anim = 'dive';
    } else {
      // Idle
      k.y = lerp(k.y, CONFIG.pitch.h / 2 + Math.sin(k.animTime * 1.2) * 4, dt * 3);
      k.anim = 'ready';
    }
  },

  updateEnemies(G, dt) {
    const p = G.player;
    G.enemies.forEach((e) => {
      e.animTime += dt;
      e.stun = Math.max(0, e.stun - dt);
      if (e.stun > 0) {
        e.anim = 'stand';
        // Decay velocity to stop
        e.vx *= 0.85; e.vy *= 0.85;
        return;
      }
      if (e.mode === 'boss' || e.mode === 'fullback' || e.mode === 'street') return;
      // Generic defender — calm steering toward ball or player
      const ball = G.ball;
      const ballSpeed = Math.hypot(ball.vx, ball.vy);
      let target;
      let chaseRange = 0;  // distance considered "close enough" — stops chasing inside this

      if (ball.owner === 'none' && ballSpeed > 150) {
        // Ball is loose — predict where it will be
        const predX = ball.x + ball.vx * 0.3;
        const predY = ball.y + ball.vy * 0.3;
        target = { x: predX, y: predY };
        chaseRange = 20;
      } else if (ball.owner === 'player') {
        // ALWAYS chase the player when they have the ball — defenders work as a unit.
        // Different defenders have slightly different roles based on home position:
        //   - Closer to goal → mark the player tightly
        //   - Further from goal → cover space ahead of the player
        const distFromGoal = CONFIG.pitch.w - e.homeX;
        if (distFromGoal < 250) {
          // Goal-side defender: mark player directly
          target = { x: p.x, y: p.y };
          chaseRange = e.r + p.r + 8;
        } else {
          // Midfield defender: cover space slightly ahead of player
          target = { x: p.x + 60, y: p.y };
          chaseRange = e.r + p.r + 14;
        }
      } else {
        // No ball owner and ball not loose → return home briefly
        target = { x: e.homeX, y: e.homeY };
        chaseRange = 12;
      }

      const dx = target.x - e.x;
      const dy = target.y - e.y;
      const d = Math.hypot(dx, dy);

      const diff = CONFIG.difficulty[G.diff];
      const levelSpeedBoost = 1 + (G.levelIdx || 0) * 0.12;  // +12%/level (L1=1.0, L2=1.12, L3=1.24)
      const maxSpeed = 145 * diff.defSpeed * levelSpeedBoost;

      if (d < chaseRange) {
        // Close enough — stop and damp velocity (prevents wobble)
        e.vx *= 0.85;
        e.vy *= 0.85;
      } else {
        // Move toward target — smoothed but responsive
        const desiredVx = (dx / d) * maxSpeed;
        const desiredVy = (dy / d) * maxSpeed;
        e.vx = lerp(e.vx, desiredVx, dt * 7);
        e.vy = lerp(e.vy, desiredVy, dt * 7);
      }

      e.x = clamp(e.x + e.vx * dt, 80, CONFIG.pitch.w - 100);
      e.y = clamp(e.y + e.vy * dt, 110, CONFIG.pitch.h - 50);
      e.anim = Math.hypot(e.vx, e.vy) > 30 ? 'run' : 'stand';

      // Tackle — range scales with difficulty
      const diffCfg = CONFIG.difficulty[G.diff];
      const tackleRange = (p.r + e.r) * (diffCfg.defenderTackleRange || 1.0);
      if (G.ball.owner === 'player' && dist(p, e) < tackleRange && p.dashTime <= 0 && (e.tackleCool || 0) <= 0) {
        Mechanics.tackle(G, e);
        e.tackleCool = 1.0;
      }
      e.tackleCool = Math.max(0, (e.tackleCool || 0) - dt);
    });
  },

  tackle(G, e) {
    G.ball.owner = 'none';
    G.ball.lastTouch = 'enemy';
    const ang = angleTo({ x: CONFIG.pitch.w - 60, y: CONFIG.pitch.h / 2 }, e);
    G.ball.vx = Math.cos(ang) * 250;
    G.ball.vy = Math.sin(ang) * 250;
    G.player.hitTime = 0.3;
    G.energy = Math.max(0, G.energy - CONFIG.energyHit.bossBlock * CONFIG.difficulty[G.diff].energyDrain);
    G.combo = 0;
    Audio.hit();
    hapticPattern([60, 40, 60]);
    HUD.showToast('BLOCKED!', 'red', 800);
    HUD.setCoach('Defender stole the ball! Back to start — try again.');
    G.particles.push(...makeParticles(G.player.x, G.player.y, '#ff7e7e', 12));
    // In Arena, reset player to start position after a tackle
    if (G.mode === 'arena') {
      setTimeout(() => { if (G.running) Mechanics.kickoffReset(G); }, 800);
    }
  },

  startCharge(G) {
    if (!G.running || G.countdown > 0) return;
    if (G.player.kickTime > 0 || G.player.celebTime > 0) return;
    if (G.ball.owner !== 'player') {
      // Try to magnet pickup if close
      if (dist(G.ball, G.player) < CONFIG.ball.magnetRadius) {
        G.ball.owner = 'player';
        G.ball.lastTouch = 'player';
        G.ball.vx = 0; G.ball.vy = 0;
        G.ball.spin = 0;
        G.ball.looseTime = 0;
      } else {
        HUD.setCoach('Run to the ball first!');
        return;
      }
    }
    G.charge.active = true;
    G.charge.power = 0.2;
    shootBtn.classList.add('charging');
  },

  releaseCharge(G) {
    if (!G.charge.active) return;
    shootBtn.classList.remove('charging');
    if (G.ball.owner !== 'player') { G.charge.active = false; return; }
    Mechanics.shoot(G);
    G.charge.active = false;
    G.charge.power = 0;
  },

  shoot(G) {
    const charge = G.charge;
    const p = G.player;
    const b = G.ball;
    const power = clamp(charge.power, CONFIG.shot.minPower, CONFIG.shot.maxPower);

    // Base speed by mode
    let speedBase = CONFIG.shot.arenaBase;
    if (G.mode === 'penalty') speedBase = CONFIG.shot.penaltyBase;
    if (G.mode === 'crossing') speedBase = CONFIG.shot.crossingBase;

    // Determine target
    let targetX, targetY;
    if (G.mode === 'crossing') {
      // Cross to teammate based on aim type
      if (G.teammate) {
        targetX = G.teammate.x;
        targetY = G.teammate.y;
      } else {
        targetX = CONFIG.pitch.w - 100;
        targetY = CONFIG.pitch.h / 2;
      }
    } else {
      // Aim at goal with aimY shifting
      targetX = CONFIG.pitch.w - 50;
      targetY = CONFIG.pitch.h / 2 + charge.aimY * (CONFIG.goal.h * 0.45);
    }

    // SPOT-BASED AUTO-CURVE
    // Ball naturally curves toward goal center based on shooter's wing position.
    // Right wing → ball curves LEFT (negative spin)
    // Left wing → ball curves RIGHT (positive spin)
    // Center / penalty → no curve
    // Curve strength scales with distance to goal AND offset from center
    const goalCenterY = CONFIG.pitch.h / 2;
    const offsetFromCenter = b.y - goalCenterY;  // negative = above center, positive = below
    const distFromGoal = (CONFIG.pitch.w - 50) - b.x;
    const distFactor = clamp(distFromGoal / 600, 0, 1);  // farther = more curve potential
    const wingFactor = clamp(Math.abs(offsetFromCenter) / 200, 0, 1);  // wider = more curve
    // Sign: above center curves DOWN toward center; below center curves UP toward center
    const autoCurve = -Math.sign(offsetFromCenter) * 0.7 * distFactor * wingFactor;
    b.spin = autoCurve;

    const dx = targetX - b.x;
    const dy = targetY - b.y;
    const distance = Math.hypot(dx, dy) || 1;
    const diff = CONFIG.difficulty[G.diff];
    const diffPowerBoost = diff.shotPowerBoost || 1.0;
    // LEVEL POWER PROGRESSION: each level -3% shot power (L1=1.0, L2=0.97, L3=0.94)
    // So even Hard L3 still has decent power
    const levelPowerScale = 1.0 - (G.levelIdx * 0.03);
    const totalPowerMult = diffPowerBoost * levelPowerScale;
    const speed = (speedBase + power * CONFIG.shot.powerMult) * totalPowerMult;
    b.vx = (dx / distance) * speed;
    b.vy = (dy / distance) * speed;
    b.owner = 'none';
    b.lastTouch = 'just-shot';
    b.shotResolved = false;

    // Shot info for keeper save (curve makes save harder)
    const corner = Math.abs(charge.aimY) > 0.5;
    b.shotInfo = {
      power, curve: b.spin, corner,
      targetY,
      lane: charge.aimY < -0.3 ? 'high' : charge.aimY > 0.3 ? 'low' : 'middle',
      travelTime: distance / speed,
    };

    // Keeper memory
    G.keeper.shotMemory.push({ y: targetY, q: Mechanics.shotQuadrant(targetY) });
    if (G.keeper.shotMemory.length > 4) G.keeper.shotMemory.shift();

    // Decide keeper dive
    Mechanics.decideKeeperDive(G, targetY);

    p.kickTime = 0.3;
    Audio.kick();
    hapticPattern([20]);
  },

  decideKeeperDive(G, targetY) {
    const k = G.keeper;
    const diff = CONFIG.difficulty[G.diff];
    let baseReact = G.mode === 'penalty' ? diff.keeperReact * 0.35 : diff.keeperReact;
    k.reactionTime = baseReact;

    // Quadrant of incoming shot (1-5: TL, TR, M, BL, BR)
    const quadrant = Mechanics.shotQuadrant(targetY);
    const memory = k.shotMemory;

    // ADAPTIVE LEARNING: as Faisal scores more, GK reads better
    // BUT scale this with difficulty so Easy stays forgiving
    const adaptiveScale = G.diff === 'easy' ? 0.02 : G.diff === 'medium' ? 0.04 : 0.05;
    const adaptiveCap   = G.diff === 'easy' ? 0.12 : G.diff === 'medium' ? 0.20 : 0.28;
    const goalsBonus = Math.min(adaptiveCap, G.goalsScored * adaptiveScale);
    // LEVEL PROGRESSION: GK reads +9% per level above level 1 (noticeable ramp)
    const levelBonus = (G.levelIdx || 0) * 0.09;
    const readChance = clamp(diff.keeperRead + goalsBonus + levelBonus, 0.15, 0.85);

    let chosen = targetY;

    if (Math.random() < readChance) {
      // Good read — dives toward actual shot
      chosen = targetY;
    } else {
      // Pattern guess from memory
      if (memory.length >= 2) {
        // Find most-repeated quadrant in last 3 shots
        const recent = memory.slice(-3);
        const counts = {};
        recent.forEach(s => { counts[s.q] = (counts[s.q] || 0) + 1; });
        const mostCommon = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        if (mostCommon && mostCommon[1] >= 2) {
          // Faisal repeated a corner — GK guesses that corner
          chosen = Mechanics.quadrantToY(parseInt(mostCommon[0]));
        } else {
          // No pattern — guess middle
          chosen = CONFIG.pitch.h / 2;
        }
      } else {
        // No memory yet — guess middle
        chosen = CONFIG.pitch.h / 2;
      }
    }

    k.committedY = chosen;
    k.lastReadQuadrant = quadrant;
  },

  shotQuadrant(y) {
    const goalY = CONFIG.pitch.h / 2;
    const goalH = CONFIG.goal.h;
    const isHigh = y < goalY - goalH * 0.18;
    const isLow = y > goalY + goalH * 0.18;
    if (!isHigh && !isLow) return 3;  // middle
    // We don't have X (it's always near goal x); high vs low only
    return isHigh ? 1 : 5;  // 1=top, 5=bottom (mid=3)
  },

  quadrantToY(q) {
    const goalY = CONFIG.pitch.h / 2;
    const goalH = CONFIG.goal.h;
    if (q === 1) return goalY - goalH * 0.32;  // top
    if (q === 5) return goalY + goalH * 0.32;  // bottom
    return goalY;  // middle
  },

  checkGoal(G) {
    const b = G.ball;
    const goalX = CONFIG.pitch.w - 38;
    // Only resolve once per shot
    if (b.shotResolved) return false;
    if (b.lastTouch !== 'shot' && b.lastTouch !== 'just-shot') return false;
    if (b.x + b.r < goalX) return false;
    // In goal mouth?
    const inGoal = b.y > CONFIG.pitch.h/2 - CONFIG.goal.h/2 + 8 && b.y < CONFIG.pitch.h/2 + CONFIG.goal.h/2 - 8;
    if (inGoal) {
      b.shotResolved = true;
      // Keeper save check
      if (b.shotInfo && Mechanics.keeperSaves(G, b.shotInfo)) {
        Mechanics.handleSave(G);
      } else {
        Mechanics.handleGoal(G);
      }
      return true;
    } else if (b.x > goalX + 20) {
      b.shotResolved = true;
      Mechanics.handleMiss(G);
      return true;
    }
    return false;
  },

  keeperSaves(G, info) {
    const k = G.keeper;
    const diff = CONFIG.difficulty[G.diff];
    const dy = Math.abs(G.ball.y - k.y);
    const reach = k.r + 22;

    // Difficulty-based save multiplier — Easy is more forgiving but not by huge margin
    const saveMult = G.diff === 'easy' ? 0.65 : G.diff === 'medium' ? 0.88 : 1.0;

    if (dy < reach) {
      // Direct hit on keeper — high save chance regardless of difficulty
      let sc = 0.92 - info.power * 0.20 - (info.corner ? 0.18 : 0) - Math.abs(info.curve) * 0.15;
      sc *= saveMult;
      sc = clamp(sc, 0.40, 0.95);  // floor at 0.40 — keeper always has a chance when ball comes to him
      return Math.random() < sc;
    }

    const diveSpeed = 700 * diff.keeperRead;
    const window = Math.max(0.15, info.travelTime || 0.2);
    const maxDive = diveSpeed * window;
    if (dy < reach + maxDive) {
      // Dive save
      let sc = ((reach + maxDive - dy) / (reach + maxDive)) * (G.mode === 'penalty' ? 0.65 : 0.45);
      sc -= info.power * 0.15;
      sc -= Math.abs(info.curve) * 0.18;
      sc -= info.corner ? 0.12 : 0;
      sc *= saveMult;
      sc = clamp(sc, 0.05, 0.85);
      return Math.random() < sc;
    }
    return false;
  },

  handleGoal(G) {
    G.goalsScored++;
    G.combo++;
    if (G.combo > G.bestCombo) G.bestCombo = G.combo;

    const isTopCorner = G.ball.y < CONFIG.pitch.h/2 - CONFIG.goal.h * 0.25;

    G.player.celebTime = 1.2;
    Audio.goal();
    if (isTopCorner) setTimeout(() => Audio.perfect(), 200);
    if (G.combo >= 2) setTimeout(() => Audio.combo(Math.min(5, G.combo)), 350);
    hapticPattern(isTopCorner ? [80, 40, 80, 40, 150] : [120]);

    Save.addGoal();

    // Toast
    if (isTopCorner) HUD.showToast('TOP CORNER!', 'gold', 1500);
    else if (G.combo >= 5) HUD.showToast(`${G.combo} IN A ROW!`, 'gold', 1400);
    else if (G.combo >= 3) HUD.showToast('HAT-TRICK!', 'gold', 1400);
    else HUD.showToast('GOOOAL!', 'gold', 1400);

    // Particles & shockwave
    G.shockwaves.push({ x: G.ball.x, y: G.ball.y, r: 20, age: 0, color: isTopCorner ? '#ffd33d' : '#fff' });
    G.particles.push(...makeParticles(G.ball.x, G.ball.y, '#ffd33d', isTopCorner ? 50 : 36, { speed: 350, gravity: true }));
    G.crowdHype = 1.0;
    G.timeScaleTarget = 0.4;
    setTimeout(() => { if (G.running) G.timeScaleTarget = 1; }, 600);

    checkAchievements('goal', { combo: G.combo, isTopCorner });

    if (G.mode === 'penalty') G.attemptsUsed++;

    // Mode-specific post-goal flow
    if (G.mode === 'penalty') {
      setTimeout(() => { if (G.running) Mechanics.advanceFreeKickShot(G); }, 1500);
    } else if (G.mode === 'crossing') {
      setTimeout(() => { if (G.running) Mechanics.startNextWingAttack(G); }, 1500);
    } else {
      // Arena: kickoff reset after goal
      setTimeout(() => { if (G.running) Mechanics.kickoffReset(G); }, 1500);
    }
  },

  handleSave(G) {
    G.combo = 0;
    G.keeper.diveTime = 0.9;
    G.keeper.anim = 'dive';
    Audio.save();
    hapticPattern([60, 40, 60]);
    HUD.showToast('SAVED!', 'red', 1200);
    HUD.setCoach('Keeper got it. Back to start — try again!');
    G.particles.push(...makeParticles(G.keeper.x, G.keeper.y, '#ff7e7e', 18));
    if (G.mode === 'penalty') G.attemptsUsed++;
    if (G.mode === 'penalty') {
      setTimeout(() => { if (G.running) Mechanics.advanceFreeKickShot(G); }, 1300);
    } else if (G.mode === 'crossing') {
      // Save = attack failed, but still counts as an attempt completed
      setTimeout(() => { if (G.running) Mechanics.startNextWingAttack(G); }, 1300);
    } else {
      // Arena: reset player + ball + defenders to starting positions
      setTimeout(() => { if (G.running) Mechanics.kickoffReset(G); }, 1200);
    }
  },

  handleMiss(G) {
    G.combo = 0;
    Audio.miss();
    hapticPattern([40]);
    HUD.showToast('MISSED!', 'red', 800);
    HUD.setCoach('Aim INSIDE the posts! Back to start.');
    if (G.mode === 'penalty') G.attemptsUsed++;
    if (G.mode === 'penalty') {
      setTimeout(() => { if (G.running) Mechanics.advanceFreeKickShot(G); }, 1100);
    } else if (G.mode === 'crossing') {
      setTimeout(() => { if (G.running) Mechanics.startNextWingAttack(G); }, 1100);
    } else if (G.mode === 'boss') {
      // Skills Course: missed shot = reset to start
      setTimeout(() => { if (G.running) Mechanics.resetBall(G); }, 600);
    } else {
      // Arena: reset player + ball + defenders
      setTimeout(() => { if (G.running) Mechanics.kickoffReset(G); }, 1000);
    }
  },

  // Reset player to start position (Arena kickoff or post-fail reset)
  kickoffReset(G) {
    G.player.x = 200;
    G.player.y = CONFIG.pitch.h / 2;
    G.player.vx = 0; G.player.vy = 0;
    G.player.facing = 0;
    G.enemies.forEach(e => {
      e.x = e.homeX; e.y = e.homeY;
      e.vx = 0; e.vy = 0;
      e.stun = 0;
      e.tackleCool = 0;
    });
    Mechanics.resetBall(G);
  },

  // Free Kick Studio: advance to next spot OR repeat current spot until 3 attempts on it
  advanceFreeKickShot(G) {
    const spots = G.cfg.spots;
    if (!spots) return Mechanics.resetBall(G);
    // 3 shots per spot, then advance
    G.shotsAtSpot = (G.shotsAtSpot || 0) + 1;
    if (G.shotsAtSpot >= 3) {
      G.shotsAtSpot = 0;
      G.spotIdx = (G.spotIdx || 0) + 1;
      if (G.spotIdx >= spots.length) {
        // All spots done — let endLevel decide via win condition
        G.spotIdx = spots.length - 1;
      }
    }
    Mechanics.placePlayerAtFreeKickSpot(G);
  },

  placePlayerAtFreeKickSpot(G) {
    const spots = G.cfg.spots;
    if (!spots) return;
    const spotKey = spots[G.spotIdx || 0];
    const spot = CONFIG.shotSpots[spotKey];
    if (!spot) return;
    const p = G.player;
    p.x = spot.x;
    p.y = spot.y;
    p.vx = 0; p.vy = 0;
    p.facing = 0;
    G.ball.x = spot.x + 30;
    G.ball.y = spot.y;
    G.ball.vx = 0; G.ball.vy = 0;
    G.ball.spin = 0;
    G.ball.owner = 'player';
    G.ball.lastTouch = 'player';
    G.ball.shotInfo = null;
    G.ball.shotResolved = false;
    G.ball.looseTime = 0;
    HUD.showToast(spot.label, 'gold', 1100);
  },

  // ============================================================
  // WING ATTACK — 3-phase winger play
  // Phase 1: BEAT_FULLBACK — dash past the fullback
  // Phase 2: REACH_BYLINE — get into the box / byline area
  // Phase 3: DECIDE — CROSS (PASS button) or SHOOT
  // ============================================================
  setupWingAttack(G) {
    const p = G.player;
    // Choose wing for this attack — alternates left/right for variety
    const attackIdx = G.attacksCompleted || 0;
    G.wingSide = attackIdx % 2 === 0 ? 'right' : 'left';
    const wingY = G.wingSide === 'right' ? CONFIG.pitch.h - 160 : 160;
    p.x = 380;
    p.y = wingY;
    p.vx = 0; p.vy = 0;
    p.facing = 0;
    G.ball.x = p.x + 30;
    G.ball.y = p.y;
    G.ball.vx = 0; G.ball.vy = 0;
    G.ball.spin = 0;
    G.ball.owner = 'player';
    G.ball.lastTouch = 'player';
    G.wingPhase = 'beat';
    G.wingByline = false;
    G.crossDelivered = false;

    // Spawn the FULLBACK defender — blocks the wing
    G.enemies.length = 0;
    G.enemies.push({
      x: 620, y: wingY,
      homeX: 620, homeY: wingY,
      r: 32, vx: 0, vy: 0, mode: 'fullback',
      stun: 0, animTime: 0, anim: 'stand',
      beaten: false,  // becomes true once Faisal dashes past
    });

    // Spawn teammate ready to receive cross — runs into box
    // Position 240px from goal so label has clear space and doesn't overlap goal post
    G.teammate = {
      x: 1040,
      y: G.wingSide === 'right' ? CONFIG.pitch.h / 2 - 60 : CONFIG.pitch.h / 2 + 60,
      vx: 0, vy: 0,
      baseX: 1040,
      baseY: G.wingSide === 'right' ? CONFIG.pitch.h / 2 - 60 : CONFIG.pitch.h / 2 + 60,
      r: 26,
      animTime: 0,
      runType: G.wingSide === 'right' ? 'far-post' : 'near-post',
    };

    // Cross zone is the byline region near the goal
    G.crossZone = G.wingSide === 'right'
      ? { x1: 950, y1: CONFIG.pitch.h - 280, x2: 1200, y2: CONFIG.pitch.h - 50 }
      : { x1: 950, y1: 50, x2: 1200, y2: 280 };

    HUD.showToast(G.wingSide === 'right' ? 'RIGHT WING ATTACK!' : 'LEFT WING ATTACK!', 'gold', 1200);
  },

  // Update wing attack phase based on player position vs fullback
  updateWingAttack(G, dt) {
    if (G.mode !== 'crossing') return;
    const p = G.player;
    const fullback = G.enemies[0];
    if (!fullback) return;

    // Phase transitions
    if (G.wingPhase === 'beat') {
      // Beaten the fullback if Faisal:
      //   (a) dashes past with margin, OR
      //   (b) sprints past at high speed, OR
      //   (c) is very far past the defender (>200px) — sneaky walk-around
      const past = p.x > fullback.x + 60;
      const dashing = p.dashTime > 0;
      const fast = Math.hypot(p.vx, p.vy) > 280;
      const veryFarPast = p.x > fullback.x + 200;
      if (past && !fullback.beaten && (dashing || fast || veryFarPast)) {
        fullback.beaten = true;
        G.wingPhase = 'byline';
        Audio.dash();
        HUD.showToast('BEATEN!', 'gold', 900);
        HUD.setCoach('Now run to the byline! Then CROSS or SHOOT.');
        G.particles.push(...makeParticles(p.x, p.y, '#54d9ff', 14));
      }
    }
    if (G.wingPhase === 'byline') {
      // In cross zone?
      const z = G.crossZone;
      const inZone = p.x >= z.x1 && p.x <= z.x2 && p.y >= z.y1 && p.y <= z.y2;
      if (inZone && !G.wingByline) {
        G.wingByline = true;
        Audio.star();
        HUD.showToast('IN POSITION!', 'gold', 800);
        HUD.setCoach('PASS button to CROSS, SHOOT button to score!');
      }
    }
  },

  // Fullback defender: chases Faisal, tries to tackle from side
  updateFullback(G, dt) {
    if (G.mode !== 'crossing') return;
    const p = G.player;
    const fullback = G.enemies[0];
    if (!fullback) return;
    fullback.animTime += dt;
    fullback.stun = Math.max(0, fullback.stun - dt);
    if (fullback.stun > 0) return;

    if (fullback.beaten) {
      // Has been beaten — falls behind the play, decelerates
      fullback.vx *= 0.9;
      fullback.vy *= 0.9;
      fullback.x += fullback.vx * dt;
      fullback.y += fullback.vy * dt;
      fullback.anim = Math.hypot(fullback.vx, fullback.vy) > 30 ? 'run' : 'stand';
      return;
    }

    // Block the player's path on the wing — track player tightly
    const targetX = p.x + 30;  // small lead, not too far ahead
    const targetY = p.y;
    const dx = targetX - fullback.x;
    const dy = targetY - fullback.y;
    const d = Math.hypot(dx, dy);
    const diff = CONFIG.difficulty[G.diff];
    const speed = 250 * diff.defSpeed * (1 + (G.levelIdx || 0) * 0.12);  // base bumped, +12%/level
    if (d > 12) {
      fullback.vx = lerp(fullback.vx, (dx/d) * speed, dt * 5);
      fullback.vy = lerp(fullback.vy, (dy/d) * speed, dt * 5);
    } else {
      fullback.vx *= 0.85; fullback.vy *= 0.85;
    }
    fullback.x += fullback.vx * dt;
    fullback.y += fullback.vy * dt;
    fullback.x = clamp(fullback.x, 100, 950);
    fullback.y = clamp(fullback.y, 110, CONFIG.pitch.h - 50);
    fullback.anim = Math.hypot(fullback.vx, fullback.vy) > 30 ? 'run' : 'stand';

    // Tackle: if defender is close & player isn't dashing
    if (Math.hypot(p.x - fullback.x, p.y - fullback.y) < p.r + fullback.r + 10 &&
        p.dashTime <= 0 && (fullback.tackleCool || 0) <= 0) {
      fullback.tackleCool = 1.0;
      Mechanics.tackle(G, fullback);
      // Strong push back — player must try again with dash
      p.x -= 110;
      p.vx = -50;
      HUD.setCoach('Tackle! Use DASH (yellow) to beat the fullback!');
    }
    fullback.tackleCool = Math.max(0, (fullback.tackleCool || 0) - dt);
  },

  // Cross button pressed (PASS button in wing mode)
  doWingCross(G) {
    if (G.mode !== 'crossing') return;
    if (!G.wingByline || G.crossDelivered) {
      HUD.setCoach('Get to the byline first!');
      return;
    }
    if (G.ball.owner !== 'player') return;

    // Cross to teammate — auto-curving high ball
    const t = G.teammate;
    const b = G.ball;
    G.crossDelivered = true;
    b.owner = 'none';
    b.lastTouch = 'cross';
    const dx = t.x - b.x;
    const dy = t.y - b.y;
    const d = Math.hypot(dx, dy) || 1;
    const speed = 580;
    b.vx = (dx / d) * speed;
    b.vy = (dy / d) * speed;
    b.spin = 0.2 * Math.sign(t.y - b.y) * -1;  // gentle curve toward teammate
    Audio.kick();
    HUD.showToast('CROSS!', 'gold', 700);
  },

  // Cross arrived at teammate — teammate scores via header
  resolveCrossHeader(G) {
    const t = G.teammate;
    const b = G.ball;
    if (G.mode !== 'crossing' || !G.crossDelivered) return false;
    if (b.lastTouch !== 'cross') return false;
    if (Math.hypot(b.x - t.x, b.y - t.y) > t.r + b.r + 20) return false;

    // Teammate heads it — toward goal
    const goalX = CONFIG.pitch.w - 50;
    const goalY = CONFIG.pitch.h / 2 + (Math.random() - 0.5) * CONFIG.goal.h * 0.6;
    const dx = goalX - t.x;
    const dy = goalY - t.y;
    const d = Math.hypot(dx, dy) || 1;
    b.x = t.x;
    b.y = t.y;
    b.vx = (dx / d) * 880;
    b.vy = (dy / d) * 880;
    b.spin = 0;
    b.lastTouch = 'just-shot';
    b.shotResolved = false;
    b.shotInfo = {
      power: 0.7, curve: 0,
      corner: Math.abs(goalY - CONFIG.pitch.h/2) > CONFIG.goal.h * 0.3,
      targetY: goalY,
      lane: goalY < CONFIG.pitch.h/2 - 30 ? 'high' : goalY > CONFIG.pitch.h/2 + 30 ? 'low' : 'middle',
      travelTime: d / 880,
      isHeader: true,
    };
    Mechanics.decideKeeperDive(G, goalY);
    Audio.kick();
    HUD.showToast('HEADER!', 'gold', 800);
    return true;
  },

  // Wing attack completed — start a new one
  startNextWingAttack(G) {
    G.attacksCompleted = (G.attacksCompleted || 0) + 1;
    if (G.attacksCompleted >= G.cfg.attacks) return;  // win check handles this
    Mechanics.setupWingAttack(G);
  },

  // ============================================================
  // SKILLS COURSE — dribble through numbered gates in order, then score
  // ============================================================
  setupSkillsCourse(G) {
    const p = G.player;
    p.x = 200;
    p.y = CONFIG.pitch.h / 2;
    p.vx = 0; p.vy = 0;
    p.facing = 0;
    G.ball.x = p.x + 30;
    G.ball.y = p.y;
    G.ball.vx = 0; G.ball.vy = 0;
    G.ball.spin = 0;
    G.ball.owner = 'player';
    G.ball.lastTouch = 'player';

    G.gateIdx = 0;            // current gate to collect
    G.gatesCollected = 0;
    G.coursePhase = 'gates';  // 'gates' | 'shoot'

    // Generate gate positions — winding path from left to right
    const numGates = G.cfg.gates;
    G.gates = [];
    const margin = 80;
    const minX = 320, maxX = 1080;
    // Alternate top/bottom — but keep tighter range so gates don't land near joystick on small screens
    for (let i = 0; i < numGates; i++) {
      const t = i / (numGates - 1);
      const x = minX + (maxX - minX) * t;
      // Smaller alternation: ±120 instead of ±150
      const yOffset = (i % 2 === 0) ? -120 : 120;
      const y = CONFIG.pitch.h / 2 + yOffset + (Math.random() - 0.5) * 30;
      G.gates.push({
        x, y: clamp(y, margin + 80, CONFIG.pitch.h - margin - 30),
        r: 38,
        order: i + 1,
        collected: false,
        pulse: i * 0.4,
      });
    }

    // Optional defenders (level 2 has 1, level 3 has 2)
    G.enemies.length = 0;
    const numDefs = G.cfg.defenders || 0;
    for (let i = 0; i < numDefs; i++) {
      const home = i === 0
        ? { x: 700, y: CONFIG.pitch.h / 2 - 80 }
        : { x: 900, y: CONFIG.pitch.h / 2 + 80 };
      G.enemies.push({
        x: home.x, y: home.y,
        homeX: home.x, homeY: home.y,
        r: 32, vx: 0, vy: 0, mode: 'course',
        stun: 0, animTime: 0, anim: 'stand',
        tackleCool: 0,
      });
    }
  },

  resetSkillsCourse(G) {
    // Used after tackle — reset player to start, gates remain collected
    const p = G.player;
    p.x = 200;
    p.y = CONFIG.pitch.h / 2;
    p.vx = 0; p.vy = 0;
    p.facing = 0;
    G.ball.x = p.x + 30;
    G.ball.y = p.y;
    G.ball.vx = 0; G.ball.vy = 0;
    G.ball.spin = 0;
    G.ball.owner = 'player';
    G.ball.lastTouch = 'player';
    // Reset defenders to home
    G.enemies.forEach(e => {
      e.x = e.homeX; e.y = e.homeY;
      e.vx = 0; e.vy = 0;
      e.stun = 0;
      e.tackleCool = 0;
    });
  },

  // Update gate collection — every frame, check if player reached the active gate
  updateSkillsCourse(G, dt) {
    if (G.mode !== 'boss') return;
    if (G.coursePhase !== 'gates') return;
    const p = G.player;
    const gate = G.gates[G.gateIdx];
    if (!gate) return;
    gate.pulse += dt * 3;
    // Check if player reached the gate
    if (Math.hypot(p.x - gate.x, p.y - gate.y) < gate.r + p.r) {
      gate.collected = true;
      G.gatesCollected++;
      G.gateIdx++;
      Audio.star();
      Audio.combo(Math.min(5, G.gatesCollected));
      hapticPattern([20]);
      HUD.showToast(`✓ GATE ${gate.order}`, 'gold', 600);
      G.particles.push(...makeParticles(gate.x, gate.y, '#54d9ff', 14));
      G.shockwaves.push({ x: gate.x, y: gate.y, r: gate.r, age: 0, color: '#54d9ff' });
      // If all gates collected, transition to shoot phase
      if (G.gateIdx >= G.gates.length) {
        G.coursePhase = 'shoot';
        HUD.showToast('🎯 NOW SHOOT!', 'gold', 1500);
        HUD.setCoach('All gates collected! Run to the goal and SHOOT!');
        G.timeScaleTarget = 0.5;
        setTimeout(() => { if (G.running) G.timeScaleTarget = 1; }, 600);
      } else {
        const nextGate = G.gates[G.gateIdx];
        HUD.setCoach(`Gate ${nextGate.order} next!`);
      }
    }
  },

  // Update defenders in skills course — they chase player
  updateSkillsCourseDefenders(G, dt) {
    if (G.mode !== 'boss') return;
    G.enemies.forEach(e => {
      e.animTime += dt;
      e.stun = Math.max(0, e.stun - dt);
      e.tackleCool = Math.max(0, (e.tackleCool || 0) - dt);
      if (e.stun > 0) { e.anim = 'stand'; return; }
      const p = G.player;
      // Track player tightly
      const targetX = p.x;
      const targetY = p.y;
      const dx = targetX - e.x;
      const dy = targetY - e.y;
      const d = Math.hypot(dx, dy);
      const diff = CONFIG.difficulty[G.diff];
      const speed = 230 * diff.defSpeed * (1 + (G.levelIdx || 0) * 0.12);
      if (d > 14) {
        e.vx = lerp(e.vx, (dx/d) * speed, dt * 7);
        e.vy = lerp(e.vy, (dy/d) * speed, dt * 7);
      } else {
        e.vx *= 0.85; e.vy *= 0.85;
      }
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.x = clamp(e.x, 100, CONFIG.pitch.w - 100);
      e.y = clamp(e.y, 110, CONFIG.pitch.h - 50);
      e.anim = Math.hypot(e.vx, e.vy) > 30 ? 'run' : 'stand';
      // Tackle if close
      if (G.ball.owner === 'player' && Math.hypot(p.x - e.x, p.y - e.y) < p.r + e.r &&
          p.dashTime <= 0 && e.tackleCool <= 0) {
        e.tackleCool = 1.5;
        // Reset to start position (course rule: lose ball = back to start)
        Audio.hit();
        hapticPattern([60, 40, 60]);
        HUD.showToast('CAUGHT!', 'red', 700);
        HUD.setCoach('Defender stole the ball! Back to start. Try DASH!');
        G.particles.push(...makeParticles(p.x, p.y, '#ff7e7e', 14));
        setTimeout(() => { if (G.running) Mechanics.resetSkillsCourse(G); }, 700);
      }
    });
  },

  doDash(G) {
    const p = G.player;
    if (p.dashTime > 0 || p.dashCool > 0) return;
    p.dashTime = CONFIG.player.dashDuration;
    p.dashCool = CONFIG.player.dashCooldown;
    Audio.dash();
    hapticPattern([15]);
    G.particles.push(...makeParticles(p.x, p.y, '#54d9ff', 8));
  },

  doFeint(G) {
    if (G.mode === 'crossing') {
      // PASS button = CROSS in Wing Attack
      Mechanics.doWingCross(G);
      return;
    }
    // Street 1v1 uses joystick patterns for skill moves, not the FEINT button.
    // For other modes, FEINT does nothing.
  },
};

// ============================================================
// COMMON DRAW HELPERS
// ============================================================
function drawBall(G) {
  const b = G.ball;
  drawShadow(b.x, b.y + 12, 10, 4);
  // Spin trail
  if (b.owner !== 'player' && Math.hypot(b.vx, b.vy) > 100) {
    ctx.fillStyle = `rgba(255,255,255,0.3)`;
    for (let i = 1; i <= 4; i++) {
      ctx.globalAlpha = 0.3 - i * 0.06;
      ctx.beginPath();
      ctx.arc(b.x - b.vx * 0.015 * i, b.y - b.vy * 0.015 * i, b.r * (1 - i * 0.1), 0, Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  // Ball
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
  ctx.fill();
  ctx.strokeStyle = '#0c1a14';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Pentagons
  ctx.fillStyle = '#0c1a14';
  const rot = (b.x + b.y) / 30;
  for (let i = 0; i < 5; i++) {
    const a = rot + i * Math.PI * 2 / 5 - Math.PI / 2;
    if (Math.cos(a) > -0.5) {
      ctx.beginPath();
      ctx.arc(b.x + Math.cos(a) * b.r * 0.5, b.y + Math.sin(a) * b.r * 0.5, b.r * 0.18, 0, Math.PI*2);
      ctx.fill();
    }
  }
}

function drawPlayer(G) {
  const p = G.player;
  drawShadow(p.x, p.y + 28, 22, 7);

  // Dash trail
  if (p.dashTime > 0) {
    for (let i = 1; i <= 4; i++) {
      ctx.fillStyle = `rgba(84, 217, 255, ${(p.dashTime / 0.45) * (0.4 / i)})`;
      ctx.beginPath();
      ctx.arc(p.x - i * 14, p.y - 5, 22 - i * 3, 0, Math.PI*2);
      ctx.fill();
    }
  }

  // Hit flash
  if (p.hitTime > 0) {
    ctx.fillStyle = `rgba(255, 80, 80, ${p.hitTime})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 38, 0, Math.PI*2);
    ctx.fill();
  }

  // Feint aura
  if (p.feintTime > 0) {
    const t = p.feintTime / CONFIG.player.feintDuration;
    ctx.fillStyle = `rgba(167, 139, 250, ${t * 0.4})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 50, 0, Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = `rgba(167, 139, 250, ${t * 0.9})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 30 + (1 - t) * 40, 0, Math.PI*2);
    ctx.stroke();
  }

  // Charge ring
  if (G.charge.active) {
    ctx.strokeStyle = `rgba(255, 211, 61, ${0.4 + G.charge.power * 0.5})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 35 + G.charge.power * 6, 0, Math.PI*2);
    ctx.stroke();
  }

  // Sprite — frame selection
  // CRITICAL: IDLE (0), RUN1 (1), and KICK (3) all have a ball baked in.
  // Only RUN2 (2) and CELEBRATE (4) are ball-free. Use only those.
  const moving = Math.hypot(p.vx, p.vy) > 30;
  let frame;
  if (p.celebTime > 0) frame = FRAME_PLAYER.CELEBRATE;
  else frame = FRAME_PLAYER.RUN2;  // always RUN2 for movement and standing
  // Bigger sprite for visibility (was 70×90 → 96×120)
  const flip = Math.cos(p.facing) < 0;
  drawSprite(SPRITES.player, frame, 5, p.x, p.y + 44, 150, 188, flip);
}

function drawGates(G, t) {
  if (!G.gates) return;
  const time = t / 1000;
  G.gates.forEach((gate, idx) => {
    const isActive = idx === G.gateIdx && !gate.collected;
    const isPast = idx < G.gateIdx;
    const isFuture = idx > G.gateIdx;

    if (gate.collected) {
      // Collected — dim faded checkmark
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#54d9ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(gate.x, gate.y, gate.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#54d9ff';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✓', gate.x, gate.y);
      ctx.restore();
    } else if (isActive) {
      // Active — bright pulsing blue ring with big number
      const pulse = 1 + Math.sin(time * 4) * 0.12;
      ctx.save();
      // Outer glow
      ctx.shadowColor = '#54d9ff';
      ctx.shadowBlur = 30;
      ctx.strokeStyle = '#54d9ff';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(gate.x, gate.y, gate.r * pulse, 0, Math.PI * 2);
      ctx.stroke();
      // Inner ring
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#a3e8ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(gate.x, gate.y, gate.r * pulse - 8, 0, Math.PI * 2);
      ctx.stroke();
      // Big number
      ctx.fillStyle = '#fff';
      ctx.shadowColor = '#54d9ff';
      ctx.shadowBlur = 12;
      ctx.font = 'bold 40px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(gate.order, gate.x, gate.y);
      ctx.restore();
    } else if (isFuture) {
      // Future — faded gold ring with number
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = '#ffd33d';
      ctx.lineWidth = 4;
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.arc(gate.x, gate.y, gate.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffd33d';
      ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(gate.order, gate.x, gate.y);
      ctx.restore();
    }
  });
}

function drawKeeper(G) {
  const k = G.keeper;
  drawShadow(k.x, k.y + 28, 22, 7);
  let frame = FRAME_OPP.GK_READY;
  if (k.diveTime > 0 || k.anim === 'dive') frame = FRAME_OPP.GK_DIVE;
  // GK is on right side of pitch, must face left toward player (flip = true)
  drawSprite(SPRITES.opp, frame, 4, k.x, k.y + 32, 122, 156, true);
  // Glove indicator
  if (k.diveTime > 0) {
    ctx.fillStyle = 'rgba(255, 211, 61, 0.4)';
    ctx.beginPath();
    ctx.arc(k.x, k.y, 36, 0, Math.PI*2);
    ctx.fill();
  }
}

function drawEnemy(G, e) {
  drawShadow(e.x, e.y + 38, 28, 9);
  if (e.mode === 'boss') {
    // Boss aura
    ctx.fillStyle = e.feintConfusion > 0 ? 'rgba(167, 139, 250, 0.3)' : 'rgba(255, 100, 100, 0.2)';
    ctx.beginPath();
    ctx.arc(e.x, e.y, 56, 0, Math.PI*2);
    ctx.fill();
  }
  const frame = e.anim === 'run' ? FRAME_OPP.DEF_RUN : FRAME_OPP.DEF_STAND;
  // Defender ALWAYS faces the player (not based on instantaneous velocity)
  const flip = e.x > G.player.x;
  // Bigger sprite (was 64×84 → 86×112)
  drawSprite(SPRITES.opp, frame, 4, e.x, e.y + 44, 138, 178, flip);
}

function drawShockwaves(G, dt) {
  G.shockwaves = G.shockwaves.filter((s) => {
    s.age += dt;
    s.r += dt * 600;
    if (s.age >= 1) return false;
    const alpha = (1 - s.age) * 0.6;
    ctx.strokeStyle = s.color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 8 * (1 - s.age);
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    return true;
  });
}

function drawCountdown(G) {
  if (G.countdown <= 0) return;
  const num = Math.ceil(G.countdown);
  const frac = num - G.countdown;
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${0.4 * (1 - frac)})`;
  ctx.fillRect(0, 0, CONFIG.pitch.w, CONFIG.pitch.h);
  ctx.fillStyle = num === 0 ? '#22d36c' : '#ffd33d';
  ctx.font = `bold ${100 + frac * 40}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = 1 - frac;
  ctx.fillText(num > 0 ? String(num) : 'GO!', CONFIG.pitch.w / 2, CONFIG.pitch.h / 2);
  ctx.restore();
}

function drawAimGuide(G) {
  if (!G.charge.active) return;
  const b = G.ball;
  const charge = G.charge;
  let target;
  if (G.mode === 'crossing' && G.teammate) {
    target = G.teammate;
  } else {
    target = { x: CONFIG.pitch.w - 50, y: CONFIG.pitch.h/2 + charge.aimY * (CONFIG.goal.h * 0.45) };
  }

  // Predict auto-curve magnitude
  const goalCenterY = CONFIG.pitch.h / 2;
  const offsetFromCenter = b.y - goalCenterY;
  const distFromGoal = (CONFIG.pitch.w - 50) - b.x;
  const distFactor = clamp(distFromGoal / 600, 0, 1);
  const wingFactor = clamp(Math.abs(offsetFromCenter) / 200, 0, 1);
  const autoCurve = -Math.sign(offsetFromCenter) * 0.7 * distFactor * wingFactor;

  const power = charge.power;
  // Power-based color: blue→gold→red as power builds
  const r = power > 0.5 ? Math.round(255) : Math.round(84 + (255-84) * power * 2);
  const g = power > 0.5 ? Math.round(211 - (power-0.5) * 320) : Math.round(217 - (power) * 12);
  const bb = power > 0.5 ? Math.round(61 - (power-0.5) * 122) : Math.round(255 - power * 88);
  ctx.strokeStyle = `rgba(${clamp(r,0,255)},${clamp(g,0,255)},${clamp(Math.max(0,bb),0,255)},${0.7 + power * 0.3})`;
  ctx.lineWidth = 3 + power * 2;
  ctx.setLineDash([10, 6]);
  ctx.lineDashOffset = -performance.now() / 40;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);

  if (Math.abs(autoCurve) > 0.05) {
    const dx = target.x - b.x;
    const dy = target.y - b.y;
    const len = Math.hypot(dx, dy);
    const perpX = -dy / len;
    const perpY = dx / len;
    const bendStrength = 90 * autoCurve;
    const midX = (b.x + target.x) / 2 + perpX * bendStrength;
    const midY = (b.y + target.y) / 2 + perpY * bendStrength;
    ctx.quadraticCurveTo(midX, midY, target.x, target.y);
  } else {
    ctx.lineTo(target.x, target.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Reticle
  const pulse = Math.sin(performance.now() / 100) * 3 + 14;
  ctx.strokeStyle = '#ffd33d';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(target.x, target.y, pulse, 0, Math.PI*2);
  ctx.stroke();

  // Power bar BELOW ball
  if (power > 0.05) {
    const powerW = 100;
    const powerH = 9;
    const py = b.y + 38;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    roundRect(ctx, b.x - powerW/2, py, powerW, powerH, 4, true, false);
    ctx.fillStyle = power > 0.75 ? '#ff4d4d' : (power > 0.45 ? '#ffd33d' : '#54d9ff');
    roundRect(ctx, b.x - powerW/2, py, powerW * power, powerH, 4, true, false);

    // Power text
    const powerTxt = power > 0.75 ? 'BIG POWER' : power > 0.45 ? 'MEDIUM' : 'SOFT';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(powerTxt, b.x, py + powerH + 8);
  }
}

// ============================================================
// GAME SCENE — base for arena/penalty/crossing/boss
// ============================================================
function makeGameScene(mode) {
  return {
    G: null,

    enter(params) {
      this.G = makeGameState(mode, params.level || 0);
      this.setup();
      $('home').classList.remove('active');
      $('game').classList.add('active');
      // Show "CROSS" button in crossing mode (uses feint button slot, relabeled)
      HUD.showFeintBtn(mode === 'crossing');
      HUD.setFeintLabel(mode === 'crossing' ? 'CROSS' : 'FEINT');
      // Initial HUD
      this.refreshHUD();
      HUD.setCoach(this.G.cfg.coach);
      Audio.startAmbient();
      resizeCanvas();  // ensure layout fresh
    },

    exit() {
      $('game').classList.remove('active');
      Audio.stopAmbient();
      this.G = null;
    },

    setup() {
      const G = this.G;

      // Mode-specific setup
      if (mode === 'penalty') {
        // Free Kick Studio: start at first spot
        G.spotIdx = 0;
        G.shotsAtSpot = 0;
        Mechanics.placePlayerAtFreeKickSpot(G);
      } else if (mode === 'crossing') {
        // WING ATTACK: 3-phase active play
        // Phase 1: BEAT the fullback (Faisal must dash past)
        // Phase 2: REACH the byline (cross zone)
        // Phase 3: CHOOSE — cross or shoot
        Mechanics.setupWingAttack(G);
      } else if (mode === 'boss') {
        // SKILLS COURSE — dribble through gates, then score
        Mechanics.setupSkillsCourse(G);
      } else {
        // Arena: spread defenders
        const defs = G.cfg.defenders || 2;
        for (let i = 0; i < defs; i++) {
          G.enemies.push({
            x: 540 + (i % 3) * 180,
            y: 180 + Math.floor(i / 3) * 180 + (i % 2) * 70,
            homeX: 540 + (i % 3) * 180,
            homeY: 180 + Math.floor(i / 3) * 180 + (i % 2) * 70,
            r: 30, vx: 0, vy: 0, mode: 'def',
            stun: 0, animTime: 0, anim: 'stand',
          });
        }
      }
    },

    update(dt) {
      const G = this.G;
      if (!G || !G.running) return;

      // Slow-mo handling
      G.timeScale = lerp(G.timeScale, G.timeScaleTarget, dt * 6);
      const sdt = dt * G.timeScale;

      if (G.paused) return;

      // Countdown
      if (G.countdown > 0) {
        const prev = Math.ceil(G.countdown);
        G.countdown -= dt;
        const cur = Math.ceil(G.countdown);
        if (cur !== prev && cur >= 0) Audio.countdown();
        if (G.countdown <= 0) Audio.whistle();
        return;
      }

      // Time
      if (G.cfg.time && G.cfg.time > 0) {
        G.timeLeft -= sdt;
        if (G.timeLeft <= 0) { G.timeLeft = 0; this.endLevel(G.goalsScored >= G.cfg.goals); return; }
      }

      // Crowd hype decay
      G.crowdHype *= 0.985;

      // Update entities
      Mechanics.updatePlayer(G, sdt);
      Mechanics.updateBall(G, sdt);
      Mechanics.updateKeeper(G, sdt);

      // Mode-specific updates BEFORE generic enemy update (some modes own their own defender logic)
      if (mode === 'crossing') {
        Mechanics.updateWingAttack(G, sdt);
        Mechanics.updateFullback(G, sdt);
        this.updateTeammate(sdt);
        // Resolve cross delivery
        if (G.crossDelivered && G.ball.lastTouch === 'cross') {
          Mechanics.resolveCrossHeader(G);
        }
      } else if (mode === 'boss') {
        // Skills Course: collect gates, then shoot
        Mechanics.updateSkillsCourse(G, sdt);
        Mechanics.updateSkillsCourseDefenders(G, sdt);
      } else {
        Mechanics.updateEnemies(G, sdt);
      }

      // Check goal — Skills Course needs goal check during shoot phase
      Mechanics.checkGoal(G);

      // Particles
      G.particles = updateParticles(G.particles, sdt);

      // Win condition
      this.checkWin();

      // Energy fail
      if (G.energy <= 0) this.endLevel(false);

      // HUD refresh
      this.refreshHUD();
    },

    updateTeammate(dt) {
      const G = this.G;
      const t = G.teammate;
      if (!t) return;
      t.animTime += dt;
      // Hold position with subtle bob — waiting for cross
      t.y = lerp(t.y, t.baseY + Math.sin(t.animTime * 1.5) * 6, dt * 2);
    },

    checkWin() {
      const G = this.G;
      const cfg = G.cfg;
      if (mode === 'arena' && G.goalsScored >= cfg.goals) this.endLevel(true);
      if (mode === 'penalty') {
        if (G.attemptsUsed >= cfg.shots) {
          this.endLevel(G.goalsScored >= cfg.goals);
        }
      }
      // WING ATTACK: complete N attacks (each attack = beat fullback + reach byline + cross/shoot)
      if (mode === 'crossing') {
        if ((G.attacksCompleted || 0) >= cfg.attacks) this.endLevel(true);
        // Time-out failure
        if (cfg.time > 0 && G.timeLeft <= 0) this.endLevel(false);
      }
      // SKILLS COURSE: collect all gates, then score
      if (mode === 'boss') {
        // Win = all gates collected AND a goal scored after entering shoot phase
        if (G.coursePhase === 'shoot' && G.goalsScored > 0) this.endLevel(true);
        // Time-out failure
        if (cfg.time > 0 && G.timeLeft <= 0) this.endLevel(false);
      }
    },

    refreshHUD() {
      const G = this.G;
      const cfg = G.cfg;
      const modeNames = { arena: 'STAR ARENA', penalty: 'FREE KICK', crossing: 'WING ATTACK', boss: 'SKILLS COURSE' };

      // Scoreboard right side — prioritize mode-specific metric
      let awayLabel = 'TIME', awayValue = '';
      if (cfg.shots) {
        awayLabel = 'SHOTS';
        awayValue = cfg.shots - G.attemptsUsed;
      } else if (cfg.attacks) {
        awayLabel = 'ATTACKS';
        awayValue = `${G.attacksCompleted || 0}/${cfg.attacks}`;
      } else if (cfg.gates) {
        awayLabel = 'GATES';
        if (G.coursePhase === 'shoot') {
          awayValue = '🎯';  // shoot phase indicator
        } else {
          awayValue = `${G.gatesCollected || 0}/${cfg.gates}`;
        }
      } else if (cfg.time === 0) {
        awayLabel = 'FREE'; awayValue = '∞';
      } else if (cfg.time) {
        const m = Math.floor(G.timeLeft / 60);
        const s = Math.floor(G.timeLeft % 60).toString().padStart(2, '0');
        awayValue = `${m}:${s}`;
        HUD.setTimeStyle(G.timeLeft);
      }
      HUD.setScoreboard(G.goalsScored, awayValue, awayLabel, modeNames[mode], `LV ${G.levelIdx + 1}`);

      // Mission banner
      if (mode === 'arena') {
        HUD.setMission(`⚽ ${G.goalsScored}/${cfg.goals}`, G.goalsScored < cfg.goals ? `${cfg.goals - G.goalsScored} more goal${cfg.goals - G.goalsScored > 1 ? 's' : ''}!` : 'WIN!');
      } else if (mode === 'penalty') {
        const spotKey = (cfg.spots && cfg.spots[G.spotIdx || 0]) || '';
        const spot = CONFIG.shotSpots[spotKey];
        const spotLabel = spot ? spot.dist : '';
        HUD.setMission(`⚽ ${G.goalsScored}/${cfg.goals} • ${spotLabel}`, `${cfg.shots - G.attemptsUsed} shots left`);
      } else if (mode === 'crossing') {
        // Phase-aware coaching
        let phaseHint = 'DASH past the fullback!';
        if (G.wingPhase === 'byline') phaseHint = G.wingByline ? 'CROSS or SHOOT!' : 'Run to the byline!';
        HUD.setMission(`🎯 ${G.attacksCompleted || 0}/${cfg.attacks}`, phaseHint);
      } else if (mode === 'boss') {
        // Skills Course mission text
        if (G.coursePhase === 'shoot') {
          HUD.setMission('🎯 SHOOT NOW!', 'All gates done. Run to goal & SHOOT!');
        } else {
          const collected = G.gatesCollected || 0;
          const total = cfg.gates;
          const nextGate = G.gates && G.gates[G.gateIdx];
          const hint = nextGate
            ? `Run through gate ${nextGate.order} (blue glow)`
            : 'Collect all gates in order!';
          HUD.setMission(`🚩 ${collected}/${total}`, hint);
        }
      }

      HUD.setEnergy(G.energy);
      HUD.setCombo(G.combo);
    },

    draw() {
      const G = this.G;
      if (!G) return;
      const t = performance.now();

      // Clear (set transform back to identity for clear, then reapply)
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      ctx.fillStyle = '#0c1a14';
      ctx.fillRect(0, 0, view.screenW, view.screenH);

      applyView();

      drawPitch(t);
      // Skills Course needs the goal (kid shoots after collecting gates)
      drawGoal();
      this.drawModeOverlay(t);
      drawShockwaves(G, 1/60);

      // Draw skills-course gates BEFORE players (so players appear over them)
      if (mode === 'boss' && G.gates) drawGates(G, t);

      drawAimGuide(G);

      // Draw entities (sorted by Y for depth)
      const drawables = [];
      drawables.push({ y: G.ball.y, fn: () => drawBall(G) });
      drawables.push({ y: G.player.y, fn: () => drawPlayer(G) });
      drawables.push({ y: G.keeper.y, fn: () => drawKeeper(G) });
      G.enemies.forEach(e => drawables.push({ y: e.y, fn: () => drawEnemy(G, e) }));
      if (G.teammate) drawables.push({ y: G.teammate.y, fn: () => this.drawTeammate(t) });
      drawables.sort((a, b) => a.y - b.y);
      drawables.forEach(d => d.fn());

      drawParticles(G.particles);

      // Countdown overlay
      drawCountdown(G);
    },

    drawModeOverlay(t) {
      const G = this.G;
      if (mode === 'penalty') {
        // Draw penalty target zones
        const goalX = CONFIG.pitch.w - 50;
        const goalY = CONFIG.pitch.h / 2;
        const gh = CONFIG.goal.h;
        ['high', 'middle', 'low'].forEach((lane, i) => {
          const y = goalY + (i - 1) * gh * 0.32;
          ctx.fillStyle = lane === 'middle' ? 'rgba(255,255,255,0.05)' : 'rgba(255, 211, 61, 0.1)';
          ctx.fillRect(goalX - 10, y - 30, 50, 60);
        });
      }
      // WING ATTACK overlay: phase-aware visualization
      if (mode === 'crossing') {
        // Phase 1: highlight fullback as obstacle to beat
        if (G.wingPhase === 'beat') {
          const fb = G.enemies[0];
          if (fb && !fb.beaten) {
            const pulse = 0.2 + Math.sin(t / 300) * 0.08;
            ctx.fillStyle = `rgba(255, 100, 100, ${pulse})`;
            ctx.beginPath();
            ctx.arc(fb.x, fb.y, fb.r + 12, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255, 100, 100, 0.95)';
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('DASH PAST!', fb.x, fb.y - 60);
          }
        }
        // Phase 2: cross zone visible
        if (G.wingPhase === 'byline' && G.crossZone) {
          const z = G.crossZone;
          const inZone = G.player.x >= z.x1 && G.player.x <= z.x2 && G.player.y >= z.y1 && G.player.y <= z.y2;
          const pulse = 0.15 + Math.sin(t / 500) * 0.05;
          ctx.fillStyle = inZone ? `rgba(34, 211, 108, ${pulse + 0.1})` : `rgba(84, 217, 255, ${pulse})`;
          ctx.fillRect(z.x1, z.y1, z.x2 - z.x1, z.y2 - z.y1);
          ctx.strokeStyle = inZone ? '#22d36c' : '#54d9ff';
          ctx.lineWidth = 4;
          ctx.setLineDash([14, 10]);
          ctx.lineDashOffset = -t / 60;
          ctx.strokeRect(z.x1, z.y1, z.x2 - z.x1, z.y2 - z.y1);
          ctx.setLineDash([]);
          // Label
          ctx.fillStyle = inZone ? '#22d36c' : '#54d9ff';
          roundRect(ctx, (z.x1 + z.x2) / 2 - 90, z.y1 + 8, 180, 26, 12);
          ctx.fillStyle = '#0c1a14';
          ctx.font = 'bold 13px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(inZone ? '✅ CROSS or SHOOT!' : '🏃 RUN TO BYLINE', (z.x1 + z.x2) / 2, z.y1 + 21);
        }
      }
      // SKILLS COURSE: arrow pointing from player to next gate
      if (mode === 'boss') {
        if (G.coursePhase === 'gates' && G.gates) {
          const nextGate = G.gates[G.gateIdx];
          if (nextGate) {
            const dx = nextGate.x - G.player.x;
            const dy = nextGate.y - G.player.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 80) {  // only show arrow when far
              const ang = Math.atan2(dy, dx);
              const ax = G.player.x + Math.cos(ang) * 60;
              const ay = G.player.y + Math.sin(ang) * 60 - 30;
              ctx.save();
              ctx.translate(ax, ay);
              ctx.rotate(ang);
              ctx.fillStyle = 'rgba(84, 217, 255, 0.85)';
              ctx.shadowColor = '#54d9ff';
              ctx.shadowBlur = 10;
              ctx.beginPath();
              ctx.moveTo(20, 0);
              ctx.lineTo(0, -10);
              ctx.lineTo(0, -3);
              ctx.lineTo(-15, -3);
              ctx.lineTo(-15, 3);
              ctx.lineTo(0, 3);
              ctx.lineTo(0, 10);
              ctx.closePath();
              ctx.fill();
              ctx.restore();
            }
          }
        }
      }
    },

    drawTeammate(t) {
      const G = this.G;
      const tm = G.teammate;
      if (!tm) return;
      drawShadow(tm.x, tm.y + 30, 22, 7);
      // Indicator ring — pulsing blue when waiting for cross
      const ready = G.wingByline && !G.crossDelivered;
      const color = ready ? '#54d9ff' : '#ffd33d';
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 6]);
      ctx.lineDashOffset = -t / 80;
      ctx.beginPath();
      ctx.arc(tm.x, tm.y, 36 + Math.sin(t / 200) * 3, 0, Math.PI*2);
      ctx.stroke();
      ctx.setLineDash([]);
      // Label — bigger for readability on small screens
      ctx.fillStyle = color;
      roundRect(ctx, tm.x - 70, tm.y - 65, 140, 28, 14);
      ctx.fillStyle = '#0c1a14';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ready ? '⚽ CROSS NOW' : 'PASS HERE', tm.x, tm.y - 51);
      // Sprite — bigger to match new sizes
      const frame = FRAME_PLAYER.RUN2;
      drawSprite(SPRITES.player, frame, 5, tm.x, tm.y + 36, 124, 156, true);
    },

    onShootDown() {
      Mechanics.startCharge(this.G);
    },
    onShootUp() {
      Mechanics.releaseCharge(this.G);
    },
    onDash() {
      Mechanics.doDash(this.G);
    },
    onFeint() {
      Mechanics.doFeint(this.G);
    },

    onPause() {
      this.G.paused = !this.G.paused;
      $('pauseOverlay').hidden = !this.G.paused;
    },

    endLevel(won) {
      const G = this.G;
      G.running = false;
      if (won) Audio.whistle();

      // Calculate stars
      let stars = 0;
      if (won) {
        stars = 1;
        if (G.energy >= CONFIG.stars.goodEnergyMin) stars = 2;
        if (G.energy >= CONFIG.stars.perfectEnergyMin && (!G.cfg.time || G.timeLeft > G.cfg.time * CONFIG.stars.perfectTimeMin)) stars = 3;
        Save.addLevelComplete(mode, G.levelIdx, stars);
        checkAchievements('level', { stars, mode, diff: G.diff });
      }

      const isLast = G.levelIdx >= CONFIG.levels[mode].length - 1;
      const starsHTML = [0,1,2].map(i => `<span class="star ${i < stars ? 'earned' : ''}">★</span>`).join('');

      // Mode-specific primary metric
      let primaryNum, primaryLabel, secondaryHTML = '';
      if (mode === 'crossing') {
        primaryNum = G.attacksCompleted || 0;
        primaryLabel = 'ATTACKS';
      } else if (mode === 'boss') {
        // Skills Course: show "5/5 GATES" and goal indicator separately
        primaryNum = `${G.gatesCollected || 0}/${G.cfg.gates}`;
        primaryLabel = 'GATES';
        if (G.goalsScored > 0) {
          secondaryHTML = '<div class="result-badge">⚽ GOAL SCORED!</div>';
        }
      } else if (mode === 'penalty') {
        primaryNum = G.goalsScored;
        primaryLabel = `GOALS (${G.attemptsUsed} kicks)`;
      } else {
        primaryNum = G.goalsScored;
        primaryLabel = 'GOALS';
      }

      // Fail icon depends on reason
      const failIcon = (G.cfg.time && G.timeLeft <= 0) ? '⏱' : '😔';

      setTimeout(() => {
        showModal(`
          <div class="modal-icon">${won ? '🏆' : failIcon}</div>
          <h2>${won ? G.cfg.name + (isLast ? ' COMPLETE!' : ' WON!') : (G.cfg.time && G.timeLeft <= 0 ? 'TIME UP!' : 'TRY AGAIN!')}</h2>
          ${won ? `<div class="modal-stars">${starsHTML}</div>` : ''}
          <div class="result-stats">
            <div class="result-stat"><div class="result-num">${primaryNum}</div><div class="result-label">${primaryLabel}</div></div>
            <div class="result-stat"><div class="result-num">x${G.bestCombo}</div><div class="result-label">BEST</div></div>
            <div class="result-stat"><div class="result-num">${Math.round(G.energy)}%</div><div class="result-label">ENERGY</div></div>
          </div>
          ${secondaryHTML}
          ${won ? (stars === 3 ? '<p>⭐ Perfect performance!</p>' : stars === 2 ? '<p>👍 Great work!</p>' : '<p>✓ You did it!</p>') : '<p>Try again!</p>'}
          ${won && !isLast ? '<button class="btn-primary" id="mNext">▶ NEXT LEVEL</button>' : ''}
          ${won && isLast ? '<button class="btn-primary" id="mHome">BACK TO MENU</button>' : ''}
          <button class="btn-secondary" id="mReplay">${won ? 'REPLAY' : 'TRY AGAIN'}</button>
          <button class="btn-secondary" id="mExit">EXIT TO MENU</button>
        `);
        const next = $('mNext'), replay = $('mReplay'), exitB = $('mExit'), home = $('mHome');
        if (next) next.onclick = () => { hideModal(); Scene.switch(mode + '-game', { level: G.levelIdx + 1 }); };
        if (home) home.onclick = () => { hideModal(); Scene.switch('home'); };
        replay.onclick = () => { hideModal(); Scene.switch(mode + '-game', { level: G.levelIdx }); };
        exitB.onclick = () => { hideModal(); Scene.switch('home'); };
      }, 1100);
    },
  };
}

// Register all 4 game scenes
['arena', 'penalty', 'crossing', 'boss'].forEach((mode) => {
  Scene.register(mode + '-game', makeGameScene(mode));
});

// Pause / exit handlers
$('exitBtn').addEventListener('click', () => {
  Audio.buttonTap();
  if (Scene.current && Scene.current.G) {
    Scene.current.G.paused = true;
    $('pauseOverlay').hidden = false;
  }
});
$('resumeBtn').addEventListener('click', () => {
  Audio.buttonTap();
  if (Scene.current && Scene.current.G) Scene.current.G.paused = false;
  $('pauseOverlay').hidden = true;
});
$('quitBtn').addEventListener('click', () => {
  Audio.buttonTap();
  $('pauseOverlay').hidden = true;
  Scene.switch('home');
});

// ============================================================
// LEVEL LAUNCH
// ============================================================
function startLevel(mode, level = 0) {
  Audio.init();
  Scene.switch(mode + '-game', { level });
}

// ============================================================
// BOOT
// ============================================================
let assetsLoaded = 0;
function checkAssets() {
  assetsLoaded++;
  $('loaderFill').style.width = (assetsLoaded / 2 * 100) + '%';
  if (assetsLoaded >= 2) boot();
}
SPRITES.player.onload = checkAssets;
SPRITES.opp.onload = checkAssets;
SPRITES.player.onerror = checkAssets;
SPRITES.opp.onerror = checkAssets;
setTimeout(() => { if (assetsLoaded < 2) boot(); }, 2500);

function boot() {
  setTimeout(() => $('loader').classList.add('fade-out'), 200);
  setTimeout(() => { $('loader').remove(); }, 800);
  resizeCanvas();
  Scene.switch('home');
  // Show first-launch help
  if (!localStorage.getItem(SAVE_KEY)) {
    setTimeout(() => showHelp(), 600);
  }
}

// Expose for debugging
window.F17 = { Scene, Save, Audio, CONFIG, Mechanics, Input, HUD };
