import { BALL_R, CX, CY, EV, FONT, FONT_R, GOAL_W, PITCH_H, PITCH_W, PLAYER_SPEED, PX, PY, SHOT_CHARGE_TIME, SHOT_MAX, SPRINT_MULT, WORLD_H, WORLD_W } from '../match/config.js';
import { Ball } from '../match/ball.js';
import { Player } from '../match/player.js';
import { Controls } from '../match/controls.js';
import { generateTextures, R } from '../match/textures.js';
import { buildPitch, buildStadium } from '../match/pitch.js';
import { TouchPad } from '../match/touchpad.js';
import { sfx } from '../match/sfx.js';

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const GS = () => (typeof GameState !== 'undefined' ? GameState : { data: { stats: {}, coins: 0, training: {} }, addXP() {}, save() {} });
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const HUD = 20000;

/**
 * Shared skeleton for the training drills: stadium, player + ball physics, controls, HUD,
 * countdown, timer, scoring, praise, and the result card that writes rewards to the career save.
 * Subclasses implement setup(), tick(dt), onShoot(power, aimY), onPass(dx, dy).
 */
export class DrillBase extends Phaser.Scene {
  constructor(key, cfg) { super(key); this.key = key; this.cfg = cfg; }

  init(data) { this.force2d = !!(data && data.force2d); }

  // ─── What the 3D view reads (same shape as the match) ──────────────────────
  get players() { return [this.player, ...(this.others || [])]; }
  get state() { return 'play'; }
  get tier() { return { mood: 'day' }; }
  get powerups() { return []; }
  get userTeam() { return 0; }
  attackDir() { return 1; }
  cam3d() { return { x: this.player.x * 0.6 + this.ball.x * 0.4, y: this.player.y * 0.6 + this.ball.y * 0.4, dist: 25, h: 11.5 }; }
  loop3d(p) { if (this.phase === 'done' && p === this.player) return this.resultStars >= 2 ? 'pump' : this.resultStars === 0 ? 'dejected' : null; return undefined; }

  preload() {
    if (this.textures.exists('m_grass')) return;
    this.load.image('m_grass', 'game/assets/grass.png');
    this.load.image('m_crowd', 'game/assets/crowd.png');
    this.load.image('m_stadium', 'game/assets/stadium.png');
  }

  create() {
    generateTextures(this);
    this.use3d = !this.force2d && !new URLSearchParams(location.search).has('2d');
    this.view3d = null; this.props3d = []; this.resultStars = -1;
    this.phase = 'ready'; this.timeLeft = this.cfg.duration; this.score = 0; this.combo = 0; this.best = 0;
    this.charging = false; this.power = 0; this.readyT = 3.4; this.lastCount = 4;
    this.flashEms = buildStadium(this, { walls: true }).flashEms;
    buildPitch(this);

    this.player = new Player(this, 0, 9, 'FWD', 17, CX, CY).setIdentity('F17', true);
    this.player.setControlled(true);
    this.ball = new Ball(this, CX + 30, CY);
    this.ball.fire = false;
    this.controls = new Controls(this);
    this.isTouch = this.sys.game.device.input.touch;


    this.fx = {
      star: this.add.particles(0, 0, 'm_star', { speed: { min: 120, max: 320 }, angle: { min: 0, max: 360 }, lifespan: { min: 500, max: 900 }, gravityY: 300, scale: { start: 0.55, end: 0 }, tint: [0xfacc15, 0xffffff], rotate: { min: 0, max: 720 }, blendMode: 'ADD', quantity: 1, emitting: false }).setDepth(6001),
      dust: this.add.particles(0, 0, 'm_dust', { speed: { min: 10, max: 45 }, angle: { min: 0, max: 360 }, lifespan: { min: 350, max: 650 }, scale: { start: 0.17, end: 0.47 }, alpha: { start: 0.35, end: 0 }, tint: 0xd9e6c8, quantity: 1, emitting: false }).setDepth(2),
      fire: this.add.particles(0, 0, 'm_fire', { speed: { min: 10, max: 60 }, angle: { min: 0, max: 360 }, lifespan: { min: 220, max: 420 }, scale: { start: 0.55, end: 0.05 }, alpha: { start: 0.9, end: 0 }, tint: [0xffb703, 0xfb5607, 0xffffff], blendMode: 'ADD', quantity: 1, emitting: false }).setDepth(4000),
      confetti: this.add.particles(0, 0, 'm_particle', { speed: { min: 160, max: 560 }, angle: { min: 180, max: 360 }, gravityY: 700, lifespan: { min: 900, max: 1700 }, scale: { start: 0.45, end: 0.1 }, rotate: { min: 0, max: 720 }, tint: [0x22c55e, 0xf1c40f, 0xffffff, 0x60a5fa], quantity: 1, emitting: false }).setDepth(6000),
    };
    this.puff = (x, y, n = 1) => { if (!this.use3d) this.fx.dust.explode(n, x, y); };

    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_W, WORLD_H); cam.setBackgroundColor('#05070c');
    this.z = this.use3d ? 1 : Phaser.Math.Clamp(Math.min(this.scale.width / 1050, this.scale.height / 640), 0.65, 2.2);
    cam.setZoom(this.z);
    // scrollFactor-0 objects are still zoomed: map screen px -> camera-space so the HUD lands exactly on screen
    const W0 = this.scale.width, H0 = this.scale.height, z = this.z;
    this.S = (sx, sy) => ({ x: (sx - W0 / 2) / z + W0 / 2, y: (sy - H0 / 2) / z + H0 / 2 });
    this.hud = (obj, sx, sy, depth = HUD) => { const p = this.S(sx, sy); return obj.setPosition(p.x, p.y).setScale(obj.scaleX / z, obj.scaleY / z).setScrollFactor(0).setDepth(depth); };
    this.camC = { x: CX, y: CY };

    this.buildHud();
    if (this.isTouch) this.pad = new TouchPad(this, this.cfg.buttons || ['shoot', 'pass', 'sprint'], HUD, { map: this.S, scale: 1 / this.z });
    const wake = () => sfx.ensure();
    this.input.on('pointerdown', wake);
    if (this.input.keyboard) { this.input.keyboard.on('keydown', wake); this.input.keyboard.on('keydown-ESC', () => this.leave('Training')); }
    this.setup();
    this.camC.x = this.player.x; this.camC.y = this.player.y; cam.centerOn(this.camC.x, this.camC.y);
    if (this.use3d) {
      // the 2D world is parked off-screen; only the HUD (scrollFactor 0) is drawn over the 3D canvas
      cam.removeBounds(); cam.setScroll(-60000, -60000); cam.setBackgroundColor('rgba(0,0,0,0)');
      Object.values(this.fx).forEach((e) => e.setScrollFactor(0).setDepth(HUD - 2));
      const fallback = (e) => { console.warn('3D drill view unavailable, using 2D:', e); if (this.sys.isActive()) this.scene.restart({ force2d: true }); };
      import('../match/view3d.js').then(({ View3D }) => {
        if (!this.sys.isActive()) return;
        const v = new View3D(this); this.view3d = v; v.loaded.catch(fallback);
        this.events.once('shutdown', () => { v.destroy(); this.view3d = null; });
      }).catch(fallback);
    }
    this.vignette = this.hud(this.add.image(0, 0, 'm_vignette').setOrigin(0).setDisplaySize(this.scale.width, this.scale.height), 0, 0, HUD - 1).setAlpha(0.9).setBlendMode(Phaser.BlendModes.MULTIPLY);
  }

  // ─── Hooks (override) ──────────────────────────────────────────────────────
  setup() {}
  tick(_dt) {}
  onShoot(_power, _aimY) {}
  onPass(_dx, _dy) {}
  onBallOut() { this.resetBallToPlayer(); }

  // ─── Helpers for drills ────────────────────────────────────────────────────
  makePlayer(team, idx, role, num, x, y) { return new Player(this, team, idx, role, num, x, y); }

  kick(dx, dy, speed, lift = 0, fire = false) {
    const p = this.player;
    this.ball.lastTouch = p;
    this.ball.kick(dx, dy, speed, lift);
    this.ball.fire = fire;
    p.kickCooldown = 0.38; p.triggerKick(speed > 600 || fire ? 'shoot' : 'pass'); p.facing = Math.atan2(dy, dx);
    if (fire) { sfx.superShot(); this.cameras.main.shake(160, 0.006); this.hitStop = 0.08; }
    else sfx.kick(Phaser.Math.Clamp(speed / SHOT_MAX, 0.15, 1));
  }

  resetBallToPlayer() {
    const p = this.player;
    this.ball.place(p.x + Math.cos(p.facing) * 22, p.y + Math.sin(p.facing) * 22);
    this.ball.owner = p; this.ball.fire = false;
  }

  /** Did the ball just cross the right-hand goal line between the posts? */
  inRightGoal() { return this.ball.x > PX + PITCH_W + 2 && Math.abs(this.ball.y - CY) < GOAL_W / 2 - 2 && this.ball.z < 105; }

  addScore(n, x, y, label) {
    this.score += n;
    this.scoreT.setText(String(this.score));
    this.tweens.killTweensOf(this.scoreT);
    this.tweens.add({ targets: this.scoreT, scale: { from: 1.5, to: 1 }, duration: 260, ease: 'Back.out' });
    if (x !== undefined) {
      const q = this.screen(x, y, 2.5);
      this.fx.star.explode(Math.min(16, 4 + n / 20), q.x, q.y);
      const t = this.add.text(q.x, q.y - 20, `+${n}`, { fontFamily: FONT, fontSize: this.use3d ? '40px' : '26px', color: '#fde047', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5).setDepth(this.use3d ? HUD : 7000).setScrollFactor(this.use3d ? 0 : 1);
      this.tweens.add({ targets: t, y: q.y - 70, alpha: 0, duration: 800, ease: 'Cubic.out', onComplete: () => t.destroy() });
    }
    if (label) this.praise(label);
    this.updateStarHud();
  }

  praise(text, sub) {
    this.tweens.killTweensOf([this.praiseT, this.praiseSub]);
    this.praiseT.setText(text).setAlpha(1).setScale(0.5).setAngle(Phaser.Math.Between(-4, 4));
    this.praiseSub.setText(sub || '').setAlpha(sub ? 1 : 0);
    this.tweens.add({ targets: this.praiseT, scale: 1, duration: 260, ease: 'Back.out' });
    this.tweens.add({ targets: [this.praiseT, this.praiseSub], alpha: 0, delay: 900, duration: 300 });
  }

  /** World position → where to draw 2D effects (screen px in 3D mode, world px in 2D mode). */
  screen(x, y, h = 0) { return this.view3d ? this.view3d.project(x, y, h) : this.use3d ? { x: this.scale.width / 2, y: this.scale.height / 2 } : { x, y }; }
  confettiAt(x, y, n) { if (this.view3d) this.view3d.burstAt(x, y); else if (!this.use3d) this.fx.confetti.explode(n, x, y); }

  good(x, y) { this.praise(pick(['NICE!', 'GREAT!', 'AWESOME!', 'SUPER!', 'BRILLIANT!'])); sfx.praise(); void x; void y; }

  // ─── HUD ──────────────────────────────────────────────────────────────────
  buildHud() {
    const { width: w, height: h } = this.scale;
    const H = this.hud.bind(this);
    // screen-space graphics: draw in screen px, positioned/scaled through the mapper
    this.hudG = H(this.add.graphics(), 0, 0);
    const g = this.hudG;
    g.fillStyle(0x000000, 0.6); g.fillRoundedRect(w / 2 - 230, 10, 460, 54, 12);
    g.fillStyle(0xf1c40f); g.fillRect(w / 2 - 230, 61, 460, 3);
    g.fillStyle(0x000000, 0.55); g.fillRoundedRect(14, 14, 180, 70, 10); g.fillStyle(0xf1c40f, 0.9); g.fillRect(14, 24, 3, 50);
    H(this.add.text(0, 0, this.cfg.title, { fontFamily: FONT, fontSize: '22px', color: '#ffffff' }).setOrigin(0.5), w / 2, 24);
    H(this.add.text(0, 0, this.cfg.tip, { fontFamily: FONT_R, fontSize: '11px', color: 'rgba(255,255,255,0.6)', letterSpacing: 1 }).setOrigin(0, 0.5), w / 2 - 190, 48);
    this.timerT = H(this.add.text(0, 0, '60', { fontFamily: FONT, fontSize: '30px', color: '#fde047' }).setOrigin(1, 0.5), w / 2 + 215, 36);
    H(this.add.text(0, 0, 'SCORE', { fontFamily: FONT_R, fontSize: '10px', color: 'rgba(255,255,255,0.55)', letterSpacing: 3 }), 26, 22);
    this.scoreT = H(this.add.text(0, 0, '0', { fontFamily: FONT, fontSize: '34px', color: '#ffffff' }).setOrigin(0, 0.5), 26, 50);
    this.starHud = [0, 1, 2].map(i => H(this.add.image(0, 0, 'm_star').setScale(0.4).setTint(0x334155), 120 + i * 24, 50));
    this.nextT = H(this.add.text(0, 0, '', { fontFamily: FONT_R, fontSize: '10px', color: 'rgba(255,255,255,0.5)' }).setOrigin(0, 0.5), 120, 72);
    this.powG = H(this.add.graphics(), 0, 0).setVisible(false);
    this.praiseT = H(this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '44px', color: '#fde047', stroke: '#1a1200', strokeThickness: 7 }).setOrigin(0.5), w / 2, h * 0.24).setAlpha(0);
    this.praiseSub = H(this.add.text(0, 0, '', { fontFamily: FONT_R, fontSize: '13px', color: '#ffffff', letterSpacing: 3, stroke: '#000', strokeThickness: 3 }).setOrigin(0.5), w / 2, h * 0.24 + 34).setAlpha(0);
    this.countT = H(this.add.text(0, 0, '3', { fontFamily: FONT, fontSize: '140px', color: '#ffffff', stroke: '#000', strokeThickness: 10 }).setOrigin(0.5), w / 2, h / 2, HUD + 1);
    const back = H(this.add.text(0, 0, 'X  QUIT', { fontFamily: FONT, fontSize: '18px', color: '#ffffff', backgroundColor: 'rgba(0,0,0,0.55)', padding: { x: 14, y: 10 } }).setOrigin(1, 0), w - 14, 14).setInteractive({ useHandCursor: true });
    back.on('pointerup', () => this.leave('Training'));
    if (!this.isTouch) H(this.add.text(0, 0, this.cfg.keys || 'WASD  move    SHIFT  sprint    SPACE (hold)  shoot    X  pass    ESC  quit', { fontFamily: FONT_R, fontSize: '11px', color: 'rgba(255,255,255,0.42)' }).setOrigin(0.5, 1), w / 2, h - 8);
    this.updateStarHud();
  }

  updateStarHud() {
    const th = this.cfg.thresholds;
    this.starHud.forEach((s, i) => s.setTint(this.score >= th[i] ? 0xfacc15 : 0x334155));
    const next = th.find(t => this.score < t);
    this.nextT.setText(next ? `NEXT ★ AT ${next}` : 'MAX STARS!');
  }

  drawPower() {
    const { width: w, height: h } = this.scale;
    const g = this.powG; g.clear();
    if (!this.charging) { g.setVisible(false); return; }
    g.setVisible(true);
    const pw = 180, px = w / 2 - pw / 2, py = h - (this.isTouch ? 200 : 70);
    g.fillStyle(0x000000, 0.6); g.fillRoundedRect(px - 8, py - 12, pw + 16, 24, 8);
    g.fillStyle(0xffffff, 0.12); g.fillRoundedRect(px, py - 6, pw, 12, 6);
    g.fillStyle(this.power < 0.6 ? 0x22c55e : this.power < 0.98 ? 0xf1c40f : 0xef4444); g.fillRoundedRect(px, py - 6, Math.max(6, pw * this.power), 12, 6);
  }

  // ─── Loop ──────────────────────────────────────────────────────────────────
  update(_t, delta) {
    const raw = Math.min(delta / 1000, 0.034);
    this.controls.update(raw);
    if (this.hitStop > 0) { this.hitStop -= raw; if (this.view3d) this.view3d.update(0); return; }
    const dt = raw;

    if (this.phase === 'ready') {
      this.readyT -= dt;
      const n = Math.ceil(this.readyT - 0.4);
      if (n !== this.lastCount) {
        this.lastCount = n;
        this.countT.setText(n > 0 ? String(n) : 'GO!').setColor(n > 0 ? '#ffffff' : '#22c55e').setScale(0.4).setAlpha(1);
        this.tweens.add({ targets: this.countT, scale: 1, duration: 300, ease: 'Back.out' });
        if (n > 0) sfx.tune([660], 0.1, 0.1); else sfx.whistle(1);
      }
      if (this.readyT <= 0) { this.phase = 'play'; this.tweens.add({ targets: this.countT, alpha: 0, scale: 1.6, duration: 400 }); }
      this.player.brake(dt);
    } else if (this.phase === 'play') {
      this.timeLeft -= dt;
      this.timerT.setText(String(Math.max(0, Math.ceil(this.timeLeft)))).setColor(this.timeLeft < 10 ? '#ef4444' : '#fde047');
      if (this.timeLeft <= 0) { this.finish(); return; }
      this.updateUser(dt);
      this.tick(dt);
    } else this.player.brake(dt);

    if (this.ball.owner === this.player) this.dribble(dt);
    this.ball.update(dt);
    if (this.ball.fire) { if (!this.use3d) this.fx.fire.emitParticleAt(this.ball.x, this.ball.y - this.ball.z * 0.8, 2); if (this.ball.speed < 260) this.ball.fire = false; }
    if (this.phase === 'play' && this.ball.outside() && !this.inRightGoal()) this.onBallOut();
    this.player.integrate(dt);
    this.others && this.others.forEach(o => o.integrate(dt));
    this.drawPower();
    // camera: player with a little ball influence
    const tx = this.player.x * 0.6 + this.ball.x * 0.4, ty = this.player.y * 0.6 + this.ball.y * 0.4;
    const k = Math.min(1, 4.5 * dt);
    this.camC.x += (tx - this.camC.x) * k; this.camC.y += (ty - this.camC.y) * k;
    if (!this.use3d) this.cameras.main.centerOn(this.camC.x, this.camC.y);
    if (this.view3d) this.view3d.update(dt);
  }

  updateUser(dt) {
    const c = this.controls, p = this.player, b = this.ball;
    const moving = c.axisX !== 0 || c.axisY !== 0;
    let speed = PLAYER_SPEED * (b.owner === p ? 0.94 : 1) * (this.speedMult || 1);
    if (c.sprint && moving && p.stamina > 0.03) { speed *= SPRINT_MULT; p.stamina = Math.max(0, p.stamina - dt * 0.12); }
    else p.stamina = Math.min(1, p.stamina + dt * 0.14);
    speed *= 0.82 + 0.18 * p.stamina;
    p.lockFacing = false;
    if (moving) p.drive(c.axisX, c.axisY, speed, dt);
    else if (this.autoRun && !b.owner) p.steer(b.x, b.y, PLAYER_SPEED * 0.55, dt, 5);
    else p.brake(dt);

    // possession
    if (!b.owner && p.kickCooldown <= 0 && b.z < 60 && dist(p, b) < 36) { b.owner = p; b.z = 0; b.vz = 0; b.fire = false; this.onControl && this.onControl(); }
    if (b.owner === p && dist(p, b) > 62) b.owner = null;

    const nearBall = dist(p, b) < 58 && (b.owner === p || b.owner === null) && b.z < 70;
    if (c.shootJustDown) { this.charging = true; this.power = 0; }
    if (this.charging) {
      this.power = Math.min(1, c.shootHoldTime / SHOT_CHARGE_TIME);
      if (c.shootJustUp || this.power >= 1) {
        this.charging = false;
        if (nearBall) this.onShoot(Math.max(0.3, this.power), c.axisY);
        this.power = 0;
      }
    }
    if (c.passJust && nearBall) this.onPass(moving ? c.axisX : Math.cos(p.facing), moving ? c.axisY : Math.sin(p.facing));
  }

  dribble(dt) {
    const o = this.player, b = this.ball;
    const ahead = 20 + o.speed * 0.05;
    const tx = o.x + Math.cos(o.facing) * ahead, ty = o.y + Math.sin(o.facing) * ahead;
    const k = Math.min(1, 16 * dt);
    const px = b.x, py = b.y;
    b.x += (tx - b.x) * k; b.y += (ty - b.y) * k;
    b.vx = (b.x - px) / dt; b.vy = (b.y - py) / dt;
  }

  // ─── Finish / rewards ─────────────────────────────────────────────────────
  finish() {
    this.phase = 'done';
    this.charging = false;
    if (this.pad) this.pad.setLocked(true);
    sfx.whistle(2);
    const th = this.cfg.thresholds;
    const stars = this.score >= th[2] ? 3 : this.score >= th[1] ? 2 : this.score >= th[0] ? 1 : 0;
    const xp = 8 + stars * 12, coins = 5 + stars * 10;
    const gs = GS();
    const statGain = stars === 3 ? 2 : stars === 2 ? 1 : 0;
    const statLines = [];
    [this.cfg.stat, stars === 3 ? this.cfg.stat2 : null].filter(Boolean).forEach(st => {
      if (!gs.data.stats) gs.data.stats = {};
      const before = gs.data.stats[st] || 50;
      gs.data.stats[st] = Math.min(99, before + statGain);
      if (statGain > 0) statLines.push(`${st.toUpperCase()} +${statGain}`);
    });
    gs.data.coins = (gs.data.coins || 0) + coins;
    gs.data.training = gs.data.training || {};
    const rec = gs.data.training[this.cfg.id] || { best: 0, stars: 0, plays: 0 };
    const isBest = this.score > rec.best;
    rec.best = Math.max(rec.best, this.score); rec.stars = Math.max(rec.stars, stars); rec.plays++;
    gs.data.training[this.cfg.id] = rec;
    gs.addXP(xp); gs.save();
    this.resultStars = stars;
    if (stars >= 2) { this.confettiAt(this.player.x, this.player.y - 40, 140); sfx.cheer(0.8); }
    this.time.delayedCall(700, () => this.showResult({ stars, xp, coins, statLines, isBest, best: rec.best }));
  }

  showResult(r) {
    const { width: w, height: h } = this.scale;
    const D = HUD + 10;
    const col = r.stars === 3 ? 0xfacc15 : r.stars >= 1 ? 0x22c55e : 0x64748b;
    const items = [];
    items.push(this.add.rectangle(0, 0, w * 2.2, h * 2.2, 0x000000, 0.72).setInteractive());
    const card = this.add.graphics();
    card.fillStyle(0x0b1220, 0.98); card.fillRoundedRect(-260, -200, 520, 400, 20);
    card.lineStyle(2, col, 0.9); card.strokeRoundedRect(-260, -200, 520, 400, 20);
    card.fillStyle(col); card.fillRoundedRect(-260, -200, 520, 6, { tl: 20, tr: 20, bl: 0, br: 0 });
    items.push(card);
    items.push(this.add.text(0, -174, this.cfg.title, { fontFamily: FONT_R, fontSize: '13px', color: 'rgba(255,255,255,0.6)', letterSpacing: 6 }).setOrigin(0.5));
    const stars = [0, 1, 2].map(i => this.add.image(-70 + i * 70, -120, 'm_star').setScale(1.1).setTint(0x334155));
    items.push(...stars);
    items.push(this.add.text(0, -62, r.stars === 3 ? 'PERFECT!' : r.stars === 2 ? 'GREAT WORK!' : r.stars === 1 ? 'GOOD JOB!' : 'KEEP PRACTISING!', { fontFamily: FONT, fontSize: '40px', color: '#' + col.toString(16).padStart(6, '0'), stroke: '#000', strokeThickness: 4 }).setOrigin(0.5));
    items.push(this.add.text(0, -14, String(this.score), { fontFamily: FONT, fontSize: '54px', color: '#ffffff' }).setOrigin(0.5));
    items.push(this.add.text(0, 24, r.isBest ? 'NEW BEST SCORE!' : `BEST: ${r.best}`, { fontFamily: FONT_R, fontSize: '12px', color: r.isBest ? '#fde047' : 'rgba(255,255,255,0.5)', letterSpacing: 3 }).setOrigin(0.5));
    items.push(this.add.image(-110, 62, 'm_coin').setScale(0.55));
    items.push(this.add.text(-94, 62, `+${r.coins} COINS`, { fontFamily: FONT, fontSize: '18px', color: '#fde047' }).setOrigin(0, 0.5));
    items.push(this.add.text(40, 62, `+${r.xp} XP`, { fontFamily: FONT, fontSize: '18px', color: '#86efac' }).setOrigin(0, 0.5));
    items.push(this.add.text(0, 96, r.statLines.length ? r.statLines.join('     ') : 'EARN 2 STARS TO BOOST A STAT', { fontFamily: FONT, fontSize: '15px', color: r.statLines.length ? '#60a5fa' : 'rgba(255,255,255,0.45)' }).setOrigin(0.5));
    const mkBtn = (x, label, color, tc, cb) => {
      const bg = this.add.graphics(); bg.fillStyle(color); bg.fillRoundedRect(-100, -26, 200, 52, 26);
      const t = this.add.text(0, 0, label, { fontFamily: FONT, fontSize: '15px', color: tc }).setOrigin(0.5);
      const c = this.add.container(x, 156, [bg, t]).setSize(212, 56).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => { sfx.ensure(); c.setScale(0.94); }).on('pointerup', () => { c.setScale(1); cb(); })
        .on('pointerover', () => c.setScale(1.05)).on('pointerout', () => c.setScale(1));
      return c;
    };
    items.push(mkBtn(-110, 'TRY AGAIN', 0x22c55e, '#04170a', () => { sfx.click(); this.scene.restart(); }));
    items.push(mkBtn(110, 'TRAINING', 0x1f2937, '#ffffff', () => this.leave('Training')));
    // one container centred on screen, mapped through the zoom
    const panel = this.hud(this.add.container(0, 0, items), w / 2, h / 2, D).setAlpha(0);
    this.tweens.add({ targets: panel, alpha: 1, duration: 350 });
    stars.forEach((s, i) => { if (i < r.stars) this.time.delayedCall(600 + i * 350, () => { s.setTint(0xfacc15); this.tweens.add({ targets: s, scale: { from: 2, to: 1.2 }, angle: { from: -30, to: 0 }, duration: 380, ease: 'Back.out' }); sfx.star(); }); });
    if (this.input.keyboard) this.input.keyboard.once('keydown-ENTER', () => this.scene.restart());
  }

  leave(key) { sfx.click(); this.game.events.emit(EV.TOUCH, { type: 'axis', x: 0, y: 0 }); this.scene.start(key); }
}

export { R, BALL_R, PX, PY, PITCH_W, PITCH_H, CX, CY, GOAL_W };
