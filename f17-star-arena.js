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
    dashSpeed: 540,        // px/sec during dash (v1.12: 480→540)
    dashDuration: 0.40,    // seconds of dash (v1.12: 0.45→0.40 — sharper burst)
    dashCooldown: 1.4,     // seconds before dash usable again
    dashGrace: 0.15,       // v1.12: invincibility grace window after dash ends
    feintDuration: 0.5,
    feintCooldown: 1.2,
  },

  // Ball physics
  ball: {
    radius: 20,            // was 14 — bumped so 3D shading + pentagons are visible
    friction: 0.992,       // per frame at 60fps (≈0.6/sec)
    pickupRadius: 64,      // was 56 — scaled with bigger ball
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
    easy:   { keeperReact: 0.60, keeperRead: 0.20, defSpeed: 0.85, energyDrain: 0.20, label: 'ROOKIE',  shotPowerBoost: 1.30, defenderTackleRange: 0.75, defenderAggression: 0.70, defenderCountBonus: 0,  tackleCooldown: 1.4 },
    medium: { keeperReact: 0.32, keeperRead: 0.50, defSpeed: 1.45, energyDrain: 0.55, label: 'PRO',     shotPowerBoost: 1.05, defenderTackleRange: 1.05, defenderAggression: 1.00, defenderCountBonus: 1,  tackleCooldown: 1.0 },
    hard:   { keeperReact: 0.18, keeperRead: 0.75, defSpeed: 1.65, energyDrain: 0.85, label: 'LEGEND',  shotPowerBoost: 0.95, defenderTackleRange: 1.20, defenderAggression: 1.15, defenderCountBonus: 2,  tackleCooldown: 1.0 },
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

  // Energy
  energyHit: {
    bossBlock: 18,  // energy lost when defender tackles ball off Faisal
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
    completedLevels: {},
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
    // Track unique level completions (per-level best stars)
    this.data.completedLevels = this.data.completedLevels || {};
    const key = mode + ':' + levelIdx;
    const prevLevelStars = this.data.completedLevels[key] || 0;
    if (stars > prevLevelStars) {
      // Only count the IMPROVEMENT towards total stars
      this.data.stars += (stars - prevLevelStars);
      this.data.completedLevels[key] = stars;
      if (stars === 3 && prevLevelStars < 3) this.data.perfectLevels++;
    }
    // Mode stars = best level in that mode (for unlock progress UI)
    const modeBest = Object.entries(this.data.completedLevels)
      .filter(([k]) => k.startsWith(mode + ':'))
      .reduce((max, [, s]) => Math.max(max, s), 0);
    this.data.modeStars[mode] = modeBest;
    // Single source of truth: count unique level keys
    this.data.levels = Object.keys(this.data.completedLevels).length;
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
  // Star milestones — give kids a tangible "next goal"
  stars_5:       { name: 'RISING STAR',         icon: '⭐', desc: 'Earn 5 stars total' },
  stars_15:      { name: 'STAR PLAYER',         icon: '🌟', desc: 'Earn 15 stars total' },
  stars_30:      { name: 'SUPERSTAR',           icon: '✨', desc: 'Earn 30 stars total' },
  stars_36:      { name: 'GOLDEN BOOT',         icon: '🥇', desc: 'Earn ALL 36 stars — perfect career!' },
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
    // Star milestones — check after stars are added to total
    const total = Save.data.stars || 0;
    if (total >= 5)  unlocks.push('stars_5');
    if (total >= 15) unlocks.push('stars_15');
    if (total >= 30) unlocks.push('stars_30');
    if (total >= 36) unlocks.push('stars_36');
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
  teammate: new Image(),
};
SPRITES.player.src = 'data:image/png;base64,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';
SPRITES.opp.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAA+gAAAGCCAMAAABEjRnDAAADAFBMVEVhVFQqHSOjlZxrXV8lHSCRaFxSKB5wYWNNJx3n191MLyXHqpyNbl9cN1/haRtgRTmynsljWFceDCSllpRiRTj2rSX7+vnqyaSuhmwfDSWRbl/7w3RINU3nnlaXSsTRtJxILCRlRzininTFqshKMlQ5HE6rViaml5WUapTDLQE4IElhI4zhfER9UpyDLq6JbGftz615YYoqHk42Fk6mjHivn532jxT9zCfUlGnNr5ZeRDiMd4zYcBft39hFPEGdTyCcgmmMd5bEtrbhwqdzb4GJO0WHf4f29tQAAAD9/f0sGBI1FlX5tXZSJhZpJ5T0qG0wJydIGWxONy7GOAPyZwv3dgm1NAfSZC2sVS3oWAhIGgywKwPSRgjpmWPyuojryqX9/f3kklxPI23Rd0nr29FqVlIyIRuGNLSqmJIrCwZVR0g5MjDxxJZtRjSQSClnKhfLXCZqOSYoFivXhVWsiG/LqY7XVhbx49qSZlGqaEr0iBAcFBXXtZcKAwXz6eX0khNLLCSvdVaOd26UKw2mTCXQl28oGBVXQjmLWkZ3LKQnGBWTVDfii1URBQmSNxdcI4Tx07RwMxzMuK2wRBlvN5SXho0xJya0lHg9F2G1pql1Z2u1YzkoGBVxRo+4o5ZHJlNdUlOPeJBmS0Z8M6irmKwnGBVNN05BHFzWx8kbCxQUBgwwJycwJyhWNm1sV292V42me2TYw7UbFBMcFBWRN8OHaJIbFBTKi2T9/PwaFBMoGBQYFBJKNzEcFBXWcjgwJyYYCBAtDE2JRq2KampLNzBnSHGkjI7JbUJqWFF4YlkpCAWFPSIwJyhHODUoFxNUSEgYCRHMt8wqCgeYg3gtJifWonsoCQckDDImBgR6ZI1TSEiMV6mYclukia0ZChFKODNVSEhrWFEnFiswIhw7JUkmFShcRGqZQR2FWpXZYxyTd6dZHYORZ6knBgP8ySYlFibpiC5oWFTc09AuIRx6UD0mBgQvIhz0ljE6MjE6MjE7MzN1Z2fkrIP3pRg6MzIAAADPPL8qAAAA/3RSTlNjXuygK9/g4J74XPig7/+i/yzzodD/cITioGj/oP//iytknfxi6PVm+v+j///7/y/mmi5hay+A/4hhMLCAozKALmY2fTf/Ih4A/f7+//7///7//v/////////+//////+9//////7+//7+/v7//v/+//7+///+///+/v/9/y3///7//v///tD+/v+w//9O/////v7///7P/v/+/f+P//7+/v/+//9x/v/+/G2uj/79///+cM///43/gVBRMM6w/3GO///+jP7+/87+kP9RrzHSrP/P/jL/r/5u/6/////NcY2v0Y7/rv////////9Q/47/jv/P/zCv/7CPzdD//29I7v78AADY2UlEQVR42uz9CVhb17noD9t4jjM4071J2/R0bs85PdM95z53eu7/+Q/fIDZsJLaxtC0j6dGwZUlob81oywgsCQlkxCjAGDBgMLbxCHZi+4unJHY8xZkcx5nsTE2auW2Spk2HtM+33rX21oDx0MaAcb3iYBAyaGuv33rn952luLVurVvrpl+zbthX1vCHPzzz2MHqW7fo1rq1bmbQZ//+UL3DwazddIv1W+vWunlArz5YjVeOTLeqmKENGxxrt926T7fWrXUTgP7sjidfczi4ngULYuLQXc/MJo8eUFmtkXqO44bevHWjbq1ba+aDrtoc2ewYQkhzYiwWGhNF5q3voIfrEOk042CGxFP/5daturVurZkO+tq1XoqiaIaJMAzPf8GJosjNeVrxLEVZKcqDHj0dW3jrXt1at9aMt9EbKFgqD8MwQ0mOS3JDDsfaTeghq5VCj9Ff+N++dbNurVtrBoNe/V/unvXiNgw6CHVGFJMcz3GOCGIck07zvIdmYqceRU+e+/Szt27arXVrzTDQN/3+s//VIyKq61V2ItPr6xHrnghT72AiNH6EoRme5hnmItekUBxUqbbPvnlvx/pn7nryrruefHLurZ15a90soB/47msOMRbjHAhpJkJRdjtY5FYaL6St07SLphD+FQzNe5h6JsLVI9LnqlSqhpv2duxwOOp5notx3H2zbru1O2+tmQ/60885OEdFhZVSIbxVQLgK6+kMgxmnMec0HQF1nq7n6xn0hzuErfl6x8wnffac70JcoVpeCil/oLq6AQ63CH9a7PzjrajirTXTQUeiSyWtCFMRcSG6QapHGAY+B9gjWKxHGKoBfbWB4xikvW/YjrR9lZUTZ7z2/liMG7r9x/dy3OnT4pg/Foud5r67iSQG1aEDT6tlHHzsROwW6rfWTAb9xUMMIF7B5C5ikUdo/IVjCElwhDnDIEHP0FxS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';
SPRITES.teammate.src = 'data:image/png;base64,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';

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
    // Always fit fully — letterbox bars on whichever axis doesn't match aspect.
    // The pitch dimensions (1024×640) are tuned to feel close to landscape mobile,
    // so letterbox is minimal on most devices.
    view.scale = fitScale;
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
    // Reset stuck inputs — backgrounding usually doesn't fire pointerup
    Input.shootHeld = false;
    if (typeof joyStickEl !== 'undefined') {
      Input.joy = { x: 0, y: 0, active: false, id: null };
      joyStickEl.style.transform = 'translate(-50%, -50%)';
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
// iOS touch fixes — prevent tap delay, double-tap zoom, and accidental pan/scroll
// touch-action: none gives the game full control of all gestures on these buttons
[shootBtn, dashBtn, feintBtn].forEach(btn => {
  btn.style.touchAction = 'none';
  btn.style.userSelect = 'none';
});

function joystickPoint(e) {
  const r = joystickEl.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  let x = (e.clientX - cx) / (r.width / 2);
  let y = (e.clientY - cy) / (r.height / 2);
  const len = Math.hypot(x, y);
  if (len > 1) { x /= len; y /= len; }
  // Deadzone — small finger drift shouldn't register
  // Maps len 0.0-0.12 → 0, then linear from 0.12 to 1.0
  const DEADZONE = 0.12;
  if (len < DEADZONE) {
    x = 0; y = 0;
  } else {
    const scale = (len - DEADZONE) / (1 - DEADZONE) / len;
    x *= scale;
    y *= scale;
  }
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
  if (Scene.current && Scene.current.onShootDown) Scene.current.onShootDown();
});
shootBtn.addEventListener('pointerup', (e) => {
  e.preventDefault();
  Input.shootHeld = false;
  if (Scene.current && Scene.current.onShootUp) Scene.current.onShootUp();
});
shootBtn.addEventListener('pointercancel', () => {
  Input.shootHeld = false;
  if (Scene.current && Scene.current.onShootUp) Scene.current.onShootUp();
});

dashBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  Audio.init();
  if (Scene.current && Scene.current.onDash) Scene.current.onDash();
});

feintBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  Audio.init();
  if (Scene.current && Scene.current.onFeint) Scene.current.onFeint();
});

// Keyboard for desktop
window.addEventListener('keydown', (e) => {
  if (e.key === ' ' && !e.repeat) {
    e.preventDefault();
    Input.shootHeld = true;
    if (Scene.current && Scene.current.onShootDown) Scene.current.onShootDown();
  }
  if (e.key === 'Shift' && Scene.current && Scene.current.onDash) Scene.current.onDash();
  if (e.key.toLowerCase() === 'f' && Scene.current && Scene.current.onFeint) Scene.current.onFeint();
  if (e.key === 'Escape' && Scene.current && Scene.current.onPause) Scene.current.onPause();
});
window.addEventListener('keyup', (e) => {
  if (e.key === ' ') {
    Input.shootHeld = false;
    if (Scene.current && Scene.current.onShootUp) Scene.current.onShootUp();
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
  // Defensive: clamp levelIdx to valid range
  const levels = CONFIG.levels[mode];
  if (!levels || !levels.length) {
    console.error('No levels defined for mode:', mode);
    return null;
  }
  levelIdx = clamp(levelIdx, 0, levels.length - 1);
  const cfg = levels[levelIdx];
  return {
    mode,
    levelIdx,
    cfg,
    diff: Save.data.difficulty,
    running: true,
    paused: false,
    countdown: 3,

    // Note: score / crowdHype / combo bonus multiplier were planned but unused — removed
    // Goals are tracked via goalsScored; combo via combo / bestCombo
    goalsScored: 0,
    energy: 100,
    combo: 0,
    bestCombo: 0,
    timeLeft: cfg.time || 999,
    attemptsUsed: 0,
    restarting: false,  // true during the brief reset window after a tackle
    // Free Kick Studio
    spotIdx: 0,
    shotsAtSpot: 0,
    // Wing Attack
    attacksCompleted: 0,
    wingPhase: 'beat',
    wingByline: false,
    wingSide: 'right',
    wingStartTime: 0,  // v1.12: set by setupWingAttack for DASH PAST! label fade
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
      kickTime: 0, dashTime: 0, dashCool: 0, dashGraceTime: 0,
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
    p.dashGraceTime = Math.max(0, (p.dashGraceTime || 0) - dt);  // v1.12: post-dash invincibility window
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
    } else if (G.restarting) {
      // Restart window: player can't move, decelerate
      p.vx *= 0.7; p.vy *= 0.7;
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
        // v1.12: instant velocity during dash — no 125ms lerp ramp that ate ~28% of dash duration
        if (p.dashTime > 0) {
          p.vx = tx;
          p.vy = ty;
        } else {
          p.vx = lerp(p.vx, tx, dt * 8);
          p.vy = lerp(p.vy, ty, dt * 8);
        }
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

    // Pickup if close & slow — but not during restart phase
    if (!G.restarting && b.lastTouch !== 'just-shot' && dist(b, p) < CONFIG.ball.pickupRadius && Math.hypot(b.vx, b.vy) < 220 && p.celebTime <= 0) {
      b.owner = 'player';
      b.lastTouch = 'player';
      b.looseTime = 0;
    }

    // Auto-return after delay (skip during restart — a reset is already scheduled)
    if (!G.restarting && b.owner !== 'player' && Math.hypot(b.vx, b.vy) < CONFIG.ball.minSlowSpeed) {
      b.looseTime += dt;
      if (b.looseTime > CONFIG.ball.autoReturnDelay) {
        // Wing Attack: a wild kick that doesn't reach goal counts as a failed attempt.
        // Without this, kid could spam-kick anywhere and ball just resets — no consequence.
        // Use handleMiss flow so attacksCompleted increments properly.
        if (G.mode === 'crossing' && (b.lastTouch === 'shot' || b.lastTouch === 'cross')) {
          HUD.showToast('LOST IT!', 'red', 800);
          Mechanics.handleMiss(G);
        } else {
          Mechanics.resetBall(G);
          HUD.setCoach('Ball returned. Try again!', 2500);
        }
      }
    } else {
      b.looseTime = 0;
    }

    // Cool down lastTouch — count frames so we don't spam setTimeout
    if (b.lastTouch === 'just-shot') {
      b.justShotTime = (b.justShotTime || 0) + dt;
      if (b.justShotTime > 0.35) {
        b.lastTouch = 'shot';
        b.justShotTime = 0;
      }
    } else {
      b.justShotTime = 0;
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
    // In Wing Attack, phase state must reset alongside the ball — otherwise Faisal
    // can be returned to the pitch with stale wingByline / wingPhase = 'byline'.
    // resetBall is only called for non-wing-tackle ball-loss (auto-return on wild kick).
    if (G.mode === 'crossing') {
      G.wingPhase = 'beat';
      G.wingByline = false;
      G.crossDelivered = false;
      G.wingStartTime = performance.now();  // v1.12: restart label fade timer
    }
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
      // PENALTY KEEPER PREVIEW: scale how much the GK tracks the player's aim before the shot
      // Easy: barely tracks (kid can aim freely without GK telegraphing)
      // Medium: moderate tracking
      // Hard: aggressive tracking (like a real GK reading the kicker)
      const trackMult = G.diff === 'easy' ? 0.15 : G.diff === 'medium' ? 0.55 : 0.95;
      const speed = (280 * diff.keeperRead + 80) * trackMult;
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
    // During restart phase, freeze enemies — kickoffReset will reposition them shortly
    if (G.restarting) {
      G.enemies.forEach((e) => {
        e.vx *= 0.85; e.vy *= 0.85;
        e.anim = 'stand';
      });
      return;
    }

    // Identify the PRESSER — only the closest defender (to ball/player) chases tightly.
    // Others hold their zones. Prevents the "all defenders converge" swarm.
    let presserIdx = -1;
    if (G.ball.owner === 'player' || (G.ball.owner === 'none' && Math.hypot(G.ball.vx, G.ball.vy) > 150)) {
      let minD = Infinity;
      const target = G.ball.owner === 'player' ? p : G.ball;
      G.enemies.forEach((e, idx) => {
        if (e.mode === 'boss' || e.mode === 'fullback' || e.mode === 'street') return;
        if (e.stun > 0) return;
        const d = Math.hypot(target.x - e.x, target.y - e.y);
        if (d < minD) { minD = d; presserIdx = idx; }
      });
    }

    G.enemies.forEach((e, idx) => {
      e.animTime += dt;
      e.stun = Math.max(0, e.stun - dt);
      if (e.stun > 0) {
        e.anim = 'stand';
        e.vx *= 0.85; e.vy *= 0.85;
        return;
      }
      if (e.mode === 'boss' || e.mode === 'fullback' || e.mode === 'street') return;

      const ball = G.ball;
      const ballSpeed = Math.hypot(ball.vx, ball.vy);
      let target;
      let chaseRange = 0;
      const isPresser = (idx === presserIdx);

      if (ball.owner === 'none' && ballSpeed > 150) {
        // Loose ball — only the presser pursues; others hold home and shift toward ball Y
        if (isPresser) {
          target = { x: ball.x + ball.vx * 0.3, y: ball.y + ball.vy * 0.3 };
          chaseRange = 20;
        } else {
          target = { x: e.homeX, y: lerp(e.homeY, ball.y, 0.35) };
          chaseRange = 18;
        }
      } else if (ball.owner === 'player') {
        if (isPresser) {
          // Closest defender presses the ball carrier directly
          target = { x: p.x, y: p.y };
          chaseRange = e.r + p.r + 6;
        } else {
          // Zone-holders compress TOWARD the ball — both X and Y.
          // X compression is stronger when ball is on their side of the pitch.
          // Y compression is gentler so the defensive shape doesn't collapse to a single point.
          const dxToBall = Math.abs(p.x - e.homeX);
          const dyToBall = Math.abs(p.y - e.homeY);
          // v1.12: weakened opposite-side compression (was 0.20/0.30)
          // When ball is on far side, defenders shouldn't creep over and crowd
          const xShift = dxToBall < 250 ? 0.40 : 0.12;
          const yShift = dyToBall < 200 ? 0.55 : 0.18;
          // Compression caps. v1.12: back-layer defenders (homeX > 850) need wider lateral release
          // so the lone CB can vacate the goal mouth when player drives to far flank.
          // Same-side cap stays 90 to prevent re-collapse; opposite-side gets 180.
          const isBackLayer = e.homeX > 850;
          const sameSide = (p.x - e.homeX) * (e.homeX - CONFIG.pitch.w / 2) > 0;  // crude same-half check
          const maxXShift = (isBackLayer && !sameSide) ? 180 : 90;
          const maxYShift = 140;
          const desiredX = e.homeX + clamp((p.x - e.homeX) * xShift, -maxXShift, maxXShift);
          const desiredY = e.homeY + clamp((p.y - e.homeY) * yShift, -maxYShift, maxYShift);
          target = { x: desiredX, y: desiredY };
          chaseRange = 24;
        }
      } else {
        // No ball owner and ball not loose → return home
        target = { x: e.homeX, y: e.homeY };
        chaseRange = 12;
      }

      // ===== SEPARATION FORCE — push defenders apart so they don't stack =====
      // v1.12: radius 70→95, force 80→110 — more breathing room around player
      let sepX = 0, sepY = 0;
      const SEP_RADIUS = 95;
      G.enemies.forEach((other, j) => {
        if (j === idx) return;
        if (other.mode === 'boss' || other.mode === 'fullback' || other.mode === 'street') return;
        const ddx = e.x - other.x;
        const ddy = e.y - other.y;
        const dd = Math.hypot(ddx, ddy);
        if (dd > 0 && dd < SEP_RADIUS) {
          const force = (SEP_RADIUS - dd) / SEP_RADIUS;  // 0..1
          sepX += (ddx / dd) * force;
          sepY += (ddy / dd) * force;
        }
      });

      const dx = target.x - e.x;
      const dy = target.y - e.y;
      const d = Math.hypot(dx, dy);

      const diff = CONFIG.difficulty[G.diff];
      const levelSpeedBoost = 1 + (G.levelIdx || 0) * 0.10;
      // Presser moves faster; zone-holders move slower (cover space, don't chase)
      const speedMult = isPresser ? 1.0 : 0.65;
      const maxSpeed = 130 * diff.defSpeed * levelSpeedBoost * speedMult;
      const aggression = diff.defenderAggression || 1.0;

      if (d < chaseRange) {
        e.vx *= 0.85;
        e.vy *= 0.85;
      } else {
        const desiredVx = (dx / d) * maxSpeed;
        const desiredVy = (dy / d) * maxSpeed;
        e.vx = lerp(e.vx, desiredVx, dt * 4 * aggression);
        e.vy = lerp(e.vy, desiredVy, dt * 4 * aggression);
      }

      // Apply separation as additional velocity nudge (keeps spacing without overriding intent)
      // v1.12: 80→110 stronger push to prevent stacking
      e.vx += sepX * 110 * dt;
      e.vy += sepY * 110 * dt;

      e.x = clamp(e.x + e.vx * dt, 80, CONFIG.pitch.w - 100);
      e.y = clamp(e.y + e.vy * dt, 110, CONFIG.pitch.h - 50);
      e.anim = Math.hypot(e.vx, e.vy) > 30 ? 'run' : 'stand';

      // Tackle — range scales with difficulty
      // De-dup: if already restarting, skip — prevents double-tackle from two defenders on same frame
      const diffCfg = CONFIG.difficulty[G.diff];
      const tackleRange = (p.r + e.r) * (diffCfg.defenderTackleRange || 1.0);
      if (!G.restarting && G.ball.owner === 'player' && dist(p, e) < tackleRange && (p.dashGraceTime || 0) <= 0 && (e.tackleCool || 0) <= 0) {
        Mechanics.tackle(G, e);
        e.tackleCool = diffCfg.tackleCooldown || 1.0;
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
    // Clear any in-progress charge — ball is no longer owned, so charging state is invalid
    G.charge.active = false;
    G.charge.power = 0;
    if (typeof shootBtn !== 'undefined') shootBtn.classList.remove('charging');
    Audio.hit();
    hapticPattern([60, 40, 60]);
    HUD.showToast('BLOCKED!', 'red', 800);
    G.particles.push(...makeParticles(G.player.x, G.player.y, '#ff7e7e', 12));
    // In Arena, reset player to start position after a tackle
    if (G.mode === 'arena') {
      G.restarting = true;
      HUD.setCoach('Defender stole the ball! Back to start — try again.');
      setTimeout(() => {
        if (!G.running) return;
        Mechanics.kickoffReset(G);
        G.restarting = false;
      }, 800);
    } else if (G.mode === 'crossing') {
      // In Wing Attack, restart the entire attack from phase 1 (beat the fullback again)
      G.restarting = true;
      HUD.setCoach('Tackled! Use DASH (yellow) to beat the fullback this time.');
      setTimeout(() => {
        if (!G.running) return;
        HUD.showToast('RESTART!', 'gold', 700);
        Mechanics.setupWingAttack(G);
        G.restarting = false;
      }, 900);
    } else {
      HUD.setCoach('Defender stole the ball! Back to start — try again.');
    }
  },

  startCharge(G) {
    if (!G.running || G.countdown > 0) return;
    if (G.restarting) return;  // can't shoot during restart
    if (G.player.kickTime > 0 || G.player.celebTime > 0) return;
    // Skills Course: can only shoot AFTER all gates collected
    if (G.mode === 'boss' && G.coursePhase === 'gates') {
      HUD.setCoach('Collect all gates first!');
      return;
    }
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
    // Reaction time = delay before keeper starts diving (higher = slower = easier for kid)
    // Penalty mode used to multiply by 0.35 (much FASTER reaction). For Easy that's brutal.
    // Now: Easy keeps the slow reaction, Medium some reduction, Hard full speed.
    let penaltyReactMult;
    if (G.mode === 'penalty') {
      penaltyReactMult = G.diff === 'easy' ? 1.0 : G.diff === 'medium' ? 0.6 : 0.35;
    } else {
      penaltyReactMult = 1.0;
    }
    let baseReact = diff.keeperReact * penaltyReactMult;
    k.reactionTime = baseReact;

    const memory = k.shotMemory;

    // ADAPTIVE LEARNING: as Faisal scores more, GK reads better
    // BUT scale this with difficulty so Easy stays forgiving
    // Legendary cap reduced from 0.28 -> 0.20 — prevents impossible keeper after a streak
    const adaptiveScale = G.diff === 'easy' ? 0.02 : G.diff === 'medium' ? 0.04 : 0.04;
    const adaptiveCap   = G.diff === 'easy' ? 0.12 : G.diff === 'medium' ? 0.18 : 0.20;
    const goalsBonus = Math.min(adaptiveCap, G.goalsScored * adaptiveScale);
    // LEVEL PROGRESSION: GK reads +7% per level above level 1 (slightly softened from +9%)
    const levelBonus = (G.levelIdx || 0) * 0.07;
    // PENALTY EASY: cut read chance in half — keeper guesses wrong corner often (kid-friendly)
    let readBase = diff.keeperRead;
    if (G.mode === 'penalty' && G.diff === 'easy') readBase *= 0.5;
    // Hard cap raised slightly so keeper can't be 85% unbeatable
    const readChance = clamp(readBase + goalsBonus + levelBonus, 0.10, 0.78);

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
    } else if (b.x + b.r >= goalX && b.vx > 0) {
      // Ball reached goal line moving forward but is OUTSIDE goal mouth — wide shot, register miss
      // Forward-motion check prevents false miss from a bouncing-back ball
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

    // Difficulty-based save multiplier
    // PENALTY MODE (free kicks): much more forgiving on Easy — kids should score most shots
    // ARENA MODE: keeper needs to be challenging at all difficulties
    // NOTE: Hard saveMult lowered 1.0 -> 0.88 to align with DESIGN_SPEC target of ~70% save rate
    // (combined with caps: direct=0.95, dive=0.85, the 0.88 multiplier brings effective rate ~70%)
    let saveMult;
    if (G.mode === 'penalty') {
      saveMult = G.diff === 'easy' ? 0.35 : G.diff === 'medium' ? 0.62 : 0.78;
    } else {
      saveMult = G.diff === 'easy' ? 0.62 : G.diff === 'medium' ? 0.82 : 0.88;
    }

    if (dy < reach) {
      // Direct hit on keeper — high save chance regardless of difficulty
      let sc = 0.92 - info.power * 0.20 - (info.corner ? 0.18 : 0) - Math.abs(info.curve) * 0.15;
      sc *= saveMult;
      // Penalty Easy: floor lower so even direct shots have a chance to sneak in
      const floor = (G.mode === 'penalty' && G.diff === 'easy') ? 0.25 : 0.40;
      sc = clamp(sc, floor, 0.95);
      return Math.random() < sc;
    }

    const diveSpeed = 700 * diff.keeperRead;
    const window = Math.max(0.15, info.travelTime || 0.2);
    const maxDive = diveSpeed * window;
    if (dy < reach + maxDive) {
      // Dive save
      // Penalty mode: reduce dive save chance further on Easy
      const diveBase = G.mode === 'penalty'
        ? (G.diff === 'easy' ? 0.40 : G.diff === 'medium' ? 0.55 : 0.65)
        : 0.45;
      let sc = ((reach + maxDive - dy) / (reach + maxDive)) * diveBase;
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

    // Freeze the ball at the moment of goal — focus the eye on player + particles, not chaotic bouncing
    G.ball.vx = 0;
    G.ball.vy = 0;
    G.ball.spin = 0;

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
    G.timeScaleTarget = 0.4;
    setTimeout(() => { if (G.running) G.timeScaleTarget = 1; }, 600);

    checkAchievements('goal', { combo: G.combo, isTopCorner });

    if (G.mode === 'penalty') G.attemptsUsed++;

    // Mode-specific post-goal flow — quick reset to keep momentum (kids need fast feedback)
    G.restarting = true;
    if (G.mode === 'penalty') {
      setTimeout(() => { if (G.running) { Mechanics.advanceFreeKickShot(G); G.restarting = false; } }, 1100);
    } else if (G.mode === 'crossing') {
      setTimeout(() => { if (G.running) { Mechanics.startNextWingAttack(G); G.restarting = false; } }, 1200);
    } else {
      // Arena: kickoff reset after goal
      setTimeout(() => { if (G.running) { Mechanics.kickoffReset(G); G.restarting = false; } }, 1100);
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
    G.restarting = true;
    if (G.mode === 'penalty') {
      setTimeout(() => { if (G.running) { Mechanics.advanceFreeKickShot(G); G.restarting = false; } }, 1300);
    } else if (G.mode === 'crossing') {
      // Save = attack failed, but still counts as an attempt completed
      setTimeout(() => { if (G.running) { Mechanics.startNextWingAttack(G); G.restarting = false; } }, 1300);
    } else {
      // Arena: reset player + ball + defenders to starting positions
      setTimeout(() => { if (G.running) { Mechanics.kickoffReset(G); G.restarting = false; } }, 1200);
    }
  },

  handleMiss(G) {
    G.combo = 0;
    Audio.miss();
    hapticPattern([40]);
    HUD.showToast('MISSED!', 'red', 800);
    HUD.setCoach('Aim INSIDE the posts! Back to start.');
    if (G.mode === 'penalty') G.attemptsUsed++;
    G.restarting = true;
    if (G.mode === 'penalty') {
      setTimeout(() => { if (G.running) { Mechanics.advanceFreeKickShot(G); G.restarting = false; } }, 1100);
    } else if (G.mode === 'crossing') {
      setTimeout(() => { if (G.running) { Mechanics.startNextWingAttack(G); G.restarting = false; } }, 1100);
    } else if (G.mode === 'boss') {
      // Skills Course: missed shot = reset to start
      setTimeout(() => { if (G.running) { Mechanics.resetBall(G); G.restarting = false; } }, 600);
    } else {
      // Arena: reset player + ball + defenders
      setTimeout(() => { if (G.running) { Mechanics.kickoffReset(G); G.restarting = false; } }, 1000);
    }
  },

  // Reset player to start position (Arena kickoff or post-fail reset)
  kickoffReset(G) {
    G.player.x = 200;
    G.player.y = CONFIG.pitch.h / 2;
    G.player.vx = 0; G.player.vy = 0;
    G.player.facing = 0;
    // Clear all timers — give player a fresh start (dash + feint ready)
    G.player.hitTime = 0;
    G.player.dashTime = 0;
    G.player.dashCool = 0;
    G.player.kickTime = 0;
    G.player.feintTime = 0;
    G.player.feintCool = 0;
    G.player.celebTime = 0;
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
    // Clear all timers
    p.hitTime = 0;
    p.kickTime = 0;
    p.celebTime = 0;
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
    // Clear all timers — fresh start every attack (dash + feint ready)
    p.hitTime = 0;
    p.dashTime = 0;
    p.dashCool = 0;
    p.dashGraceTime = 0;
    p.kickTime = 0;
    p.feintTime = 0;
    p.feintCool = 0;
    p.celebTime = 0;
    G.ball.x = p.x + 30;
    G.ball.y = p.y;
    G.ball.vx = 0; G.ball.vy = 0;
    G.ball.spin = 0;
    G.ball.owner = 'player';
    G.ball.lastTouch = 'player';
    G.wingPhase = 'beat';
    G.wingByline = false;
    G.crossDelivered = false;
    G.wingStartTime = performance.now();  // v1.12: track for DASH PAST! label fade

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
      //   (a) is past defender by ANY amount while dashing, OR
      //   (b) sprints past at any speed, OR
      //   (c) is far past the defender (>150px) — sneaky walk-around
      // v1.11: relaxed margins. Old req of 60px past + dash was too strict on Hard.
      const pastSlightly = p.x > fullback.x + 20;
      const past = p.x > fullback.x + 40;
      const dashing = p.dashTime > 0;
      const fast = Math.hypot(p.vx, p.vy) > 240;
      const veryFarPast = p.x > fullback.x + 150;
      if (!fullback.beaten && ((pastSlightly && dashing) || (past && fast) || veryFarPast)) {
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
        HUD.setCoach('Tap CROSS for teammate, SHOOT for top corner!');
      }
    }
  },

  // Fullback defender: chases Faisal, tries to tackle from side
  updateFullback(G, dt) {
    if (G.mode !== 'crossing') return;
    const p = G.player;
    const fullback = G.enemies[0];
    if (!fullback) return;
    // During restart phase, freeze — setupWingAttack will respawn shortly
    if (G.restarting) {
      fullback.vx *= 0.85; fullback.vy *= 0.85;
      fullback.anim = 'stand';
      return;
    }
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
    // Cap defSpeed effect on fullback — Faisal's dash MUST be able to beat him.
    // Lowered cap from 1.40 -> 1.25 in v1.11 (Hard wing was too sticky)
    const fbSpeedMult = Math.min(diff.defSpeed, 1.25);
    const speed = 220 * fbSpeedMult * (1 + (G.levelIdx || 0) * 0.06);
    if (d > 12) {
      fullback.vx = lerp(fullback.vx, (dx/d) * speed, dt * 5);
      fullback.vy = lerp(fullback.vy, (dy/d) * speed, dt * 5);
    } else {
      fullback.vx *= 0.85; fullback.vy *= 0.85;
    }
    fullback.x += fullback.vx * dt;
    fullback.y += fullback.vy * dt;
    // Fullback can't chase too far up the wing — clamp scales with difficulty
    // v1.11: Hard clamp lowered 960 -> 920 (gives Faisal more byline space)
    const maxFullbackX = G.diff === 'easy' ? 840 : G.diff === 'medium' ? 890 : 920;
    fullback.x = clamp(fullback.x, 100, maxFullbackX);
    fullback.y = clamp(fullback.y, 110, CONFIG.pitch.h - 50);
    fullback.anim = Math.hypot(fullback.vx, fullback.vy) > 30 ? 'run' : 'stand';

    // Tackle: if defender is close & player isn't dashing
    // v1.11: tighter tackle range (was +10, now +4) — fullback must be very close
    // This is a 1v1 — defender shouldn't have area-effect tackle
    if (!G.restarting &&
        Math.hypot(p.x - fullback.x, p.y - fullback.y) < p.r + fullback.r + 4 &&
        (p.dashGraceTime || 0) <= 0 && (fullback.tackleCool || 0) <= 0) {
      fullback.tackleCool = 1.0;
      Mechanics.tackle(G, fullback);
      // tackle() will trigger setupWingAttack() after a short delay (full restart)
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
    if (Math.hypot(b.x - t.x, b.y - t.y) > t.r + b.r + 40) return false;

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
    // Spread defender homes across the course path so they cover different zones
    // (not stacked along Faisal's likely route)
    const defHomes = [
      { x: 680, y: CONFIG.pitch.h / 2 - 110 },  // upper-mid zone
      { x: 920, y: CONFIG.pitch.h / 2 + 110 },  // lower-late zone
    ];
    for (let i = 0; i < numDefs; i++) {
      const home = defHomes[i % defHomes.length];
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
    // Clear all timers — fresh dash on retry
    p.hitTime = 0;
    p.dashTime = 0;
    p.dashCool = 0;
    p.dashGraceTime = 0;
    p.kickTime = 0;
    p.feintTime = 0;
    p.feintCool = 0;
    p.celebTime = 0;
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
    const p = G.player;

    // Identify the PRESSER — closest defender chases; others hold zones.
    let presserIdx = -1;
    let minD = Infinity;
    G.enemies.forEach((e, idx) => {
      if (e.stun > 0) return;
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      if (d < minD) { minD = d; presserIdx = idx; }
    });

    G.enemies.forEach((e, idx) => {
      e.animTime += dt;
      e.stun = Math.max(0, e.stun - dt);
      e.tackleCool = Math.max(0, (e.tackleCool || 0) - dt);
      if (e.stun > 0) { e.anim = 'stand'; e.vx *= 0.85; e.vy *= 0.85; return; }

      const isPresser = (idx === presserIdx);

      // Target: presser tracks player, others hold zone (shift toward player Y in their lane)
      let targetX, targetY;
      if (isPresser) {
        targetX = p.x;
        targetY = p.y;
      } else {
        const ballNearby = Math.abs(p.x - e.homeX) < 220;
        targetY = lerp(e.homeY, p.y, ballNearby ? 0.55 : 0.30);
        targetX = ballNearby ? lerp(e.homeX, p.x, 0.30) : e.homeX;
      }

      // Separation force — keep defenders apart
      // v1.12: radius 70→95, force 80→110
      let sepX = 0, sepY = 0;
      const SEP_RADIUS = 95;
      G.enemies.forEach((other, j) => {
        if (j === idx) return;
        const ddx = e.x - other.x;
        const ddy = e.y - other.y;
        const dd = Math.hypot(ddx, ddy);
        if (dd > 0 && dd < SEP_RADIUS) {
          const force = (SEP_RADIUS - dd) / SEP_RADIUS;
          sepX += (ddx / dd) * force;
          sepY += (ddy / dd) * force;
        }
      });

      const dx = targetX - e.x;
      const dy = targetY - e.y;
      const d = Math.hypot(dx, dy);
      const diff = CONFIG.difficulty[G.diff];
      const speedMult = isPresser ? 1.0 : 0.65;
      const speed = 230 * diff.defSpeed * (1 + (G.levelIdx || 0) * 0.10) * speedMult;
      const chaseRange = isPresser ? 14 : 22;

      if (d > chaseRange) {
        e.vx = lerp(e.vx, (dx/d) * speed, dt * 4);
        e.vy = lerp(e.vy, (dy/d) * speed, dt * 4);
      } else {
        e.vx *= 0.85; e.vy *= 0.85;
      }
      // Apply separation (v1.12: 80→110)
      e.vx += sepX * 110 * dt;
      e.vy += sepY * 110 * dt;

      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.x = clamp(e.x, 100, CONFIG.pitch.w - 100);
      e.y = clamp(e.y, 110, CONFIG.pitch.h - 50);
      e.anim = Math.hypot(e.vx, e.vy) > 30 ? 'run' : 'stand';

      // Tackle if close (only presser can tackle to avoid double-fires)
      if (isPresser && G.ball.owner === 'player' && Math.hypot(p.x - e.x, p.y - e.y) < p.r + e.r &&
          (p.dashGraceTime || 0) <= 0 && e.tackleCool <= 0 && !G.restarting) {
        e.tackleCool = 1.5;
        // Reset to start position (course rule: lose ball = back to start)
        Audio.hit();
        hapticPattern([60, 40, 60]);
        HUD.showToast('CAUGHT!', 'red', 700);
        HUD.setCoach('Defender stole the ball! Back to start. Try DASH!');
        G.particles.push(...makeParticles(p.x, p.y, '#ff7e7e', 14));
        G.restarting = true;
        setTimeout(() => { if (G.running) { Mechanics.resetSkillsCourse(G); G.restarting = false; } }, 700);
      }
    });
  },

  doDash(G) {
    const p = G.player;
    if (p.dashTime > 0 || p.dashCool > 0) return;
    p.dashTime = CONFIG.player.dashDuration;
    p.dashCool = CONFIG.player.dashCooldown;
    p.dashGraceTime = CONFIG.player.dashDuration + CONFIG.player.dashGrace;  // v1.12: invincibility through dash + 0.15s grace
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
  const speed = Math.hypot(b.vx, b.vy);
  // Shadow scales with vertical airtime (ball.r when airborne creates illusion of height)
  const shadowScale = 1.0;
  drawShadow(b.x, b.y + 12, 10 * shadowScale, 4 * shadowScale);

  // Motion trail — stronger when ball is moving fast (after a shot/pass)
  if (b.owner !== 'player' && speed > 80) {
    const trailStrength = clamp(speed / 800, 0.2, 1);
    for (let i = 1; i <= 5; i++) {
      ctx.globalAlpha = (0.35 - i * 0.06) * trailStrength;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(b.x - b.vx * 0.012 * i, b.y - b.vy * 0.012 * i, b.r * (1 - i * 0.12), 0, Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Ball body with radial gradient for sphere look
  const grad = ctx.createRadialGradient(
    b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.1,
    b.x, b.y, b.r * 1.05
  );
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.55, '#f0f0f0');
  grad.addColorStop(1, '#a0a0a0');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
  ctx.fill();

  // Outer rim
  ctx.strokeStyle = '#0c1a14';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Pentagon pattern — rotates with ball travel for spin effect
  // Use accumulated rotation based on position so the ball appears to roll
  const rot = (b.x * 0.04 + b.y * 0.04) + (b.spin || 0) * 2;
  ctx.fillStyle = '#0c1a14';

  // Center pentagon (visible from current viewpoint)
  drawPentagon(ctx, b.x, b.y, b.r * 0.32, rot);

  // Surrounding pentagons — only draw the ones on the visible hemisphere
  for (let i = 0; i < 5; i++) {
    const a = rot * 0.4 + i * Math.PI * 2 / 5 - Math.PI / 2;
    const cx = b.x + Math.cos(a) * b.r * 0.62;
    const cy = b.y + Math.sin(a) * b.r * 0.62;
    // Fade pentagons near the edge to simulate sphere curvature
    const edgeDist = Math.hypot(cx - b.x, cy - b.y) / b.r;
    const visibility = clamp(1 - edgeDist * 0.5, 0.3, 1);
    ctx.globalAlpha = visibility;
    drawPentagon(ctx, cx, cy, b.r * 0.18 * visibility, a);
  }
  ctx.globalAlpha = 1;

  // Specular highlight (top-left) for extra polish
  const hlGrad = ctx.createRadialGradient(
    b.x - b.r * 0.4, b.y - b.r * 0.45, 0,
    b.x - b.r * 0.4, b.y - b.r * 0.45, b.r * 0.6
  );
  hlGrad.addColorStop(0, 'rgba(255,255,255,0.7)');
  hlGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hlGrad;
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
  ctx.fill();
}

function drawPentagon(ctx, cx, cy, r, rot) {
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = rot + i * Math.PI * 2 / 5 - Math.PI / 2;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function drawPlayer(G) {
  const p = G.player;
  drawShadow(p.x, p.y + 28, 22, 7);

  // Dash trail
  if (p.dashTime > 0) {
    for (let i = 1; i <= 4; i++) {
      ctx.fillStyle = `rgba(84, 217, 255, ${(p.dashTime / CONFIG.player.dashDuration) * (0.4 / i)})`;
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
  // Sprite frames: 0=IDLE+ball, 1=RUN1+ball, 2=RUN2 (no ball), 3=KICK, 4=CELEBRATE
  // We use RUN2 most of the time as a safe default; KICK plays briefly on shoot for feel.
  const moving = Math.hypot(p.vx, p.vy) > 30;
  let frame;
  if (p.celebTime > 0) frame = FRAME_PLAYER.CELEBRATE;
  else if (p.kickTime > 0.05) frame = FRAME_PLAYER.KICK;  // brief kick anim after shooting
  else frame = FRAME_PLAYER.RUN2;
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
      // Hide pause overlay if user quits while paused
      const pauseO = document.getElementById('pauseOverlay');
      if (pauseO) pauseO.hidden = true;
      // Clear any pending coach/toast timers from this game
      clearTimeout(HUD._coachT);
      clearTimeout(HUD._toastT);
      $('coachBubble').hidden = true;
      $('toast').hidden = true;
      // Mark not running so any pending setTimeouts no-op
      if (this.G) this.G.running = false;
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
        // Arena: spread defenders across 3 lines — front pressure / midfield / back-line
        // Goal: only ONE back defender (not 2-3 stacked at goal). Mid-line cuts passing lanes.
        // count scales with difficulty
        const baseDefs = G.cfg.defenders || 2;
        const diffCfg = CONFIG.difficulty[G.diff];
        const defs = Math.max(1, baseDefs + (diffCfg.defenderCountBonus || 0));

        const ph = CONFIG.pitch.h;
        // Order: high-press first, then mid, then back. Adding more defenders fills layers
        // back-to-front (more bodies = denser midfield, not denser goal-line wall).
        const zoneSlots = [
          { x: 580, y: ph / 2,           zone: 'press' },  // 1st def: high press
          { x: 720, y: 220,              zone: 'RM'    },  // 2nd: right mid
          { x: 720, y: ph - 220,         zone: 'LM'    },  // 3rd: left mid
          { x: 880, y: ph / 2,           zone: 'CB'    },  // 4th: ONE central back
          { x: 780, y: ph / 2,           zone: 'CM'    },  // 5th: central mid (between mid+CB)
          { x: 850, y: 280,              zone: 'RB'    },  // 6th: right back (only on max diff)
        ];
        for (let i = 0; i < defs; i++) {
          const slot = zoneSlots[i % zoneSlots.length];
          G.enemies.push({
            x: slot.x, y: slot.y,
            homeX: slot.x, homeY: slot.y,
            zone: slot.zone,
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

      // Slow energy regen — helps recover from a few tackles
      // No regen during the brief recovery moment after a hit
      if (G.energy < 100 && G.player.hitTime <= 0) {
        G.energy = Math.min(100, G.energy + sdt * 4);  // ~25 sec to refill from 0
      }

      // Low-energy warning — fires once when crossing 25% threshold (kid sees danger before failing)
      if (G.energy < 25 && !G._lowEnergyWarned) {
        G._lowEnergyWarned = true;
        HUD.showToast('LOW ENERGY!', 'red', 1200);
        HUD.setCoach('Careful — avoid defenders or you\'ll fail!');
        Audio.miss();
      }
      if (G.energy >= 50) G._lowEnergyWarned = false;  // re-arm if recovered

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
      // Early-out if already ended — multiple win paths can fire same frame
      if (!G.running || G._levelEnded) return;

      if (mode === 'arena') {
        if (G.goalsScored >= cfg.goals) { this.endLevel(true); return; }
      } else if (mode === 'penalty') {
        if (G.attemptsUsed >= cfg.shots) {
          this.endLevel(G.goalsScored >= cfg.goals);
          return;
        }
      } else if (mode === 'crossing') {
        // Time-out failure — check FIRST (timeout always loses, even at goal moment)
        if (cfg.time > 0 && G.timeLeft <= 0) { this.endLevel(false); return; }
        // WING ATTACK: complete N attacks
        if ((G.attacksCompleted || 0) >= cfg.attacks) { this.endLevel(true); return; }
      } else if (mode === 'boss') {
        // Time-out failure — check FIRST
        if (cfg.time > 0 && G.timeLeft <= 0) { this.endLevel(false); return; }
        // Win = all gates collected AND a goal scored after entering shoot phase
        if (G.coursePhase === 'shoot' && G.goalsScored > 0) { this.endLevel(true); return; }
      }
    },

    refreshHUD() {
      const G = this.G;
      const cfg = G.cfg;
      const modeNames = { arena: 'STAR ARENA', penalty: 'FREE KICK', crossing: 'WING ATTACK', boss: 'SKILLS COURSE' };
      // Show difficulty as short suffix (E/M/L for compactness on small screens)
      const diffShort = G.diff === 'easy' ? 'E' : G.diff === 'medium' ? 'M' : 'L';

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
      HUD.setScoreboard(G.goalsScored, awayValue, awayLabel, modeNames[mode], `LV ${G.levelIdx + 1} • ${diffShort}`);

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
            // v1.12 U4+U5: label fades out after 1.5s (its job is done once player starts moving)
            // and moved BELOW fullback so it doesn't overlap player sprite coming from the left
            const elapsed = (performance.now() - (G.wingStartTime || performance.now())) / 1000;
            const labelAlpha = elapsed < 1.2 ? 0.95 : Math.max(0, 0.95 - (elapsed - 1.2) * 1.8);
            if (labelAlpha > 0.05) {
              ctx.fillStyle = `rgba(255, 100, 100, ${labelAlpha})`;
              ctx.font = 'bold 12px sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText('DASH PAST!', fb.x, fb.y + 58);
            }
          }
        }
        // Phase 2: cross zone visible
        if (G.wingPhase === 'byline' && G.crossZone) {
          const z = G.crossZone;
          // Once wingByline=true, the player has earned the right to cross from anywhere
          // (matches doWingCross gate). Otherwise check live position.
          const liveInZone = G.player.x >= z.x1 && G.player.x <= z.x2 && G.player.y >= z.y1 && G.player.y <= z.y2;
          const ready = G.wingByline || liveInZone;
          const pulse = 0.15 + Math.sin(t / 500) * 0.05;
          ctx.fillStyle = ready ? `rgba(34, 211, 108, ${pulse + 0.1})` : `rgba(84, 217, 255, ${pulse})`;
          ctx.fillRect(z.x1, z.y1, z.x2 - z.x1, z.y2 - z.y1);
          ctx.strokeStyle = ready ? '#22d36c' : '#54d9ff';
          ctx.lineWidth = 4;
          ctx.setLineDash([14, 10]);
          ctx.lineDashOffset = -t / 60;
          ctx.strokeRect(z.x1, z.y1, z.x2 - z.x1, z.y2 - z.y1);
          ctx.setLineDash([]);
          // Label — v1.12 U6: moved to ENTRY CORNER of zone (away from player's path to byline)
          // Right wing: zone spans bottom half → label at top edge
          // Left wing: zone spans top half → label at bottom edge
          // This keeps the label out of the player's run path and clear of the goal sightline.
          ctx.fillStyle = ready ? '#22d36c' : '#54d9ff';
          const labelCx = z.x1 + 95;  // 95px in from left edge (entry side)
          const labelCy = G.wingSide === 'right' ? z.y1 + 18 : z.y2 - 18;
          roundRect(ctx, labelCx - 90, labelCy - 13, 180, 26, 12);
          ctx.fillStyle = '#0c1a14';
          ctx.font = 'bold 13px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(ready ? '✅ CROSS or SHOOT!' : '🏃 RUN TO BYLINE', labelCx, labelCy);
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

      // v1.12 U1+U2+U3: compute label visibility based on player position
      // - U1: hide pill when player is within 80px of teammate (player blocks the sprite anyway)
      // - U3: fade pill as player approaches goal (x > 1000) — clear sightline for shot
      const p = G.player;
      const distToTM = Math.hypot(p.x - tm.x, p.y - tm.y);
      const proximityHide = distToTM < 80;
      const goalApproach = p.x > 1000;
      let labelAlpha;
      if (proximityHide) {
        labelAlpha = 0;
      } else if (goalApproach) {
        // Fade from 1.0 at x=1000 to 0 at x=1100
        labelAlpha = Math.max(0, 1 - (p.x - 1000) / 100);
      } else {
        labelAlpha = 1;
      }

      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 6]);
      ctx.lineDashOffset = -t / 80;
      ctx.beginPath();
      ctx.arc(tm.x, tm.y, 36 + Math.sin(t / 200) * 3, 0, Math.PI*2);
      ctx.stroke();
      ctx.setLineDash([]);
      // Label — v1.12 U2: shrunk from 140x28 to 110x22, moved higher (y-51 → y-72) for clearance
      if (labelAlpha > 0.05) {
        ctx.globalAlpha = labelAlpha;
        ctx.fillStyle = color;
        roundRect(ctx, tm.x - 55, tm.y - 84, 110, 22, 11);
        ctx.fillStyle = '#0c1a14';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ready ? '⚽ CROSS NOW' : 'WAITING...', tm.x, tm.y - 73);
        ctx.globalAlpha = 1;
      }
      // Sprite — match player sprite size for visual consistency (150×188)
      const frame = FRAME_PLAYER.RUN2;
      drawSprite(SPRITES.teammate, frame, 5, tm.x, tm.y + 44, 150, 188, true);
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
      // Idempotency guard — endLevel can be called from multiple paths same frame
      // (e.g. winning goal + energy depletion + timeout). Only the FIRST call processes.
      if (!G.running || G._levelEnded) return;
      G._levelEnded = true;
      G.running = false;
      // Hide pause overlay if visible (defensive)
      const pauseO = document.getElementById('pauseOverlay');
      if (pauseO) pauseO.hidden = true;
      G.paused = false;
      if (won) Audio.whistle();

      // Calculate stars — energy + time + mode-specific success rate
      let stars = 0;
      if (won) {
        stars = 1;
        if (G.energy >= CONFIG.stars.goodEnergyMin) stars = 2;
        if (G.energy >= CONFIG.stars.perfectEnergyMin && (!G.cfg.time || G.timeLeft > G.cfg.time * CONFIG.stars.perfectTimeMin)) stars = 3;

        // Mode-specific star caps based on EXTRA goals beyond the minimum to win.
        // (prevents winning with bare-minimum goals earning 3 stars; rewards going beyond)
        if (mode === 'crossing' && G.cfg.attacks > 0) {
          // Wing Attack: cfg.attacks is total attempts, but no minimum goals required.
          // Use conversion rate directly — requires actual scoring for high stars.
          const conversion = (G.goalsScored || 0) / G.cfg.attacks;
          if (conversion < 0.34) stars = Math.min(stars, 1);
          else if (conversion < 0.67) stars = Math.min(stars, 2);
        }
        if (mode === 'penalty' && G.cfg.goals > 0) {
          // Penalty: must score cfg.goals out of cfg.shots to win.
          // Cap stars based on how MUCH MORE than the minimum the kid scored.
          const minToWin = G.cfg.goals;
          const maxPossible = G.cfg.shots;
          const extraGoals = (G.goalsScored || 0) - minToWin;
          const extraSlots = maxPossible - minToWin;
          const bonusRatio = extraSlots > 0 ? extraGoals / extraSlots : 1;
          if (bonusRatio < 0.20) stars = Math.min(stars, 2);   // bare minimum win = 2 stars max
          // (3 stars allowed when kid scores >20% above the minimum)
        }

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

      // Fail icon and title depend on reason
      let failIcon, failTitle, failTip;
      if (G.cfg.time && G.timeLeft <= 0) {
        failIcon = '⏱';
        failTitle = 'TIME UP!';
        failTip = 'Be quicker next time!';
      } else if (G.energy <= 0) {
        failIcon = '⚡';
        failTitle = 'OUT OF ENERGY!';
        failTip = 'Avoid the defenders — use DASH to escape!';
      } else {
        failIcon = '😔';
        failTitle = 'TRY AGAIN!';
        failTip = 'You can do it — try again!';
      }

      setTimeout(() => {
        showModal(`
          <div class="modal-icon">${won ? '🏆' : failIcon}</div>
          <h2>${won ? G.cfg.name + (isLast ? ' COMPLETE!' : ' WON!') : failTitle}</h2>
          ${won ? `<div class="modal-stars">${starsHTML}</div>` : ''}
          <div class="result-stats">
            <div class="result-stat"><div class="result-num">${primaryNum}</div><div class="result-label">${primaryLabel}</div></div>
            <div class="result-stat"><div class="result-num">x${G.bestCombo}</div><div class="result-label">BEST</div></div>
            <div class="result-stat"><div class="result-num">${Math.round(G.energy)}%</div><div class="result-label">ENERGY</div></div>
          </div>
          ${secondaryHTML}
          ${won ? (stars === 3 ? '<p>⭐ Perfect performance!</p>' : stars === 2 ? '<p>👍 Great work!</p>' : '<p>✓ You did it!</p>') : `<p>${failTip}</p>`}
          ${won && !isLast ? '<button class="btn-primary" id="mNext">▶ NEXT LEVEL</button>' : ''}
          ${won && isLast ? '<button class="btn-primary" id="mHome">BACK TO MENU</button>' : ''}
          ${!won ? '<button class="btn-primary" id="mReplay">🔄 TRY AGAIN</button>' : '<button class="btn-secondary" id="mReplay">REPLAY</button>'}
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
  if (Scene.current && Scene.current.G) {
    const G = Scene.current.G;
    G.paused = false;
    // Clean up any stuck charge state — phone interruption could have left it active
    if (G.charge && G.charge.active && !Input.shootHeld) {
      G.charge.active = false;
      G.charge.power = 0;
      shootBtn.classList.remove('charging');
    }
  }
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
let booted = false;
function checkAssets() {
  assetsLoaded++;
  $('loaderFill').style.width = (assetsLoaded / 3 * 100) + '%';
  if (assetsLoaded >= 3) boot();
}
SPRITES.player.onload = checkAssets;
SPRITES.opp.onload = checkAssets;
SPRITES.teammate.onload = checkAssets;
SPRITES.player.onerror = checkAssets;
SPRITES.opp.onerror = checkAssets;
SPRITES.teammate.onerror = checkAssets;
setTimeout(() => { if (assetsLoaded < 3) boot(); }, 2500);

function boot() {
  if (booted) return;
  booted = true;
  setTimeout(() => $('loader').classList.add('fade-out'), 200);
  setTimeout(() => { const el = $('loader'); if (el) el.remove(); }, 800);
  resizeCanvas();
  Scene.switch('home');
  // Show first-launch help
  if (!localStorage.getItem(SAVE_KEY)) {
    setTimeout(() => showHelp(), 600);
  }
}

// Expose for debugging
window.F17 = { Scene, Save, Audio, CONFIG, Mechanics, Input, HUD };
