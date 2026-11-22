import { HAIRS, PITCH_H, PITCH_W, PX, PY, SKINS, TEAM } from './config.js';
import { R } from './textures.js';

export function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

const SCALE = 1.28;          // on-pitch size of a player
const LIGHT = { x: -0.35, y: 0.75 }; // shadow offset direction (light from top-left-ish)

/** A footballer: a rotating rig of super-sampled parts with a procedural run cycle. */
export class Player extends Phaser.GameObjects.Container {
  constructor(scene, team, idx, role, num, x, y) {
    super(scene, x, y);
    this.team = team; this.idx = idx; this.role = role; this.num = num;
    this.vx = 0; this.vy = 0;
    this.facing = team === 0 ? 0 : Math.PI;
    this.stamina = 1;
    this.kickCooldown = 0; this.decisionT = 0; this.holdT = 0;
    this.homeX = x; this.homeY = y;
    this.targetX = 0; this.targetY = 0; this.wantSpeed = 0;
    this.controlled = false; this.lockFacing = false;
    this.isGK = role === 'GK';
    this.phase = Math.random() * 6;
    this.kickAnim = 0; this.curSpeed = 0; this.prevVx = 0; this.prevVy = 0; this.dustT = 0;
    this.speedMult = 1; this.celebT = 0; this.boostT = 0;

    const seed = team * 11 + idx;
    const si = (seed * 7 + 3) % SKINS.length;
    const hi = (seed * 5 + team) % HAIRS.length;
    const style = (seed * 3 + 1) % 3;

    this.shadow = scene.add.image(LIGHT.x * 6, LIGHT.y * 6, 'm_shadow').setScale(1 / R).setAlpha(0.95);
    this.ring = scene.add.image(0, 3, 'm_ring').setScale(1 / R).setVisible(false);
    this.chev = scene.add.image(0, 0, 'm_chev').setScale(1 / R).setVisible(false);

    // rig children are positioned in R-space; the rig is scaled by 1/R
    this.legL = scene.add.image(-8 * R, 7 * R, `m_leg_${team}`);
    this.legR = scene.add.image(8 * R, 7 * R, `m_leg_${team}`);
    this.armL = scene.add.image(-19.5 * R, 1 * R, `m_arm_${team}_${si}`);
    this.armR = scene.add.image(19.5 * R, 1 * R, `m_arm_${team}_${si}`);
    this.torso = scene.add.image(0, 0, `m_torso_${team}`);
    this.numT = scene.add.text(0, 3 * R, String(num), {
      fontFamily: '"Barlow Condensed", "Arial Narrow", "Arial Black", sans-serif', fontSize: `${13 * R}px`, fontStyle: 'bold',
      color: '#' + TEAM[team].trim.toString(16).padStart(6, '0'), stroke: '#000000', strokeThickness: 2 * R,
    }).setOrigin(0.5).setAlpha(0.95);
    this.head = scene.add.image(0, -3.5 * R, `m_head_${si}_${hi}_${style}`);
    if (this.isGK) { this.torso.setTint(0xf59e0b); this.armL.setTint(0xffd27a); this.armR.setTint(0xffd27a); }

    this.rig = scene.add.container(0, 0, [this.legL, this.legR, this.armL, this.armR, this.torso, this.numT, this.head]);
    this.rig.setScale(1 / R);
    // name tag (shown for the hero always, for others while controlled) + hero star
    this.name = ''; this.hero = false;
    this.tag = scene.add.text(0, -30, '', {
      fontFamily: '"Barlow Condensed", "Arial Narrow", "Arial Black", sans-serif', fontSize: '26px', fontStyle: 'bold',
      color: '#ffffff', stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5, 1).setScale(0.5).setVisible(false);
    this.heroStar = scene.add.image(0, -47, 'm_star').setScale(0.3).setTint(0xfacc15).setVisible(false);
    this.heroGlow = scene.add.image(0, 3, 'm_glow').setScale(0.2, 0.14).setTint(0xfacc15).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.55).setVisible(false);
    this.add([this.shadow, this.heroGlow, this.ring, this.rig, this.chev, this.tag, this.heroStar]);
    this.rig.rotation = this.facing + Math.PI / 2;
    this.setScale(SCALE);
    scene.add.existing(this);
  }

  get speed() { return Math.hypot(this.vx, this.vy); }

  setControlled(on) { this.controlled = on; this.ring.setVisible(on); this.chev.setVisible(on); this.tag.setVisible(on || this.hero); }

  /** Give the player a display name; hero = the main character (gold tag, star, glow). */
  setIdentity(name, hero = false) {
    this.name = name; this.hero = hero;
    this.tag.setText(name).setColor(hero ? '#fde047' : '#ffffff').setVisible(hero || this.controlled);
    this.heroStar.setVisible(hero); this.heroGlow.setVisible(hero);
    if (hero) this.tag.setY(-36);
    return this;
  }

  steer(tx, ty, speed, dt, accel = 9) {
    const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
    if (d < 3) { this.vx *= 0.7; this.vy *= 0.7; return; }
    const s = Math.min(speed * this.speedMult, d * 8);
    const k = Math.min(1, accel * dt);
    this.vx += ((dx / d) * s - this.vx) * k;
    this.vy += ((dy / d) * s - this.vy) * k;
  }

  drive(ax, ay, speed, dt) {
    const k = Math.min(1, 12 * dt);
    this.vx += (ax * speed - this.vx) * k;
    this.vy += (ay * speed - this.vy) * k;
  }

  brake(dt) { const k = Math.pow(0.001, dt); this.vx *= k; this.vy *= k; }

  /** kind: 'pass' | 'shoot' — picks the 3D animation. */
  triggerKick(kind = 'pass') { this.kickAnim = 1; this.play(kind); }

  /** Ask the 3D view to play a one-shot action (shoot, pass, slide, poke, stumble, dive, catch). */
  play(name, dir = 0) { this.anim = name; this.animDir = dir; this.animSeq = (this.animSeq || 0) + 1; }

  /** Goal celebration: spin + hop for ~1.4 s (handled in animate). */
  celebrate() { this.celebT = 1.4; }

  integrate(dt) {
    this.x += this.vx * dt; this.y += this.vy * dt;
    const m = 40;
    this.x = Phaser.Math.Clamp(this.x, PX - m, PX + PITCH_W + m);
    this.y = Phaser.Math.Clamp(this.y, PY - m, PY + PITCH_H + m);
    if (this.kickCooldown > 0) this.kickCooldown -= dt;
    if (this.holdT > 0) this.holdT -= dt;
    if (this.decisionT > 0) this.decisionT -= dt;

    const sp = this.speed;
    this.curSpeed += (sp - this.curSpeed) * Math.min(1, 10 * dt);
    if (sp > 12 && !this.lockFacing) this.facing = lerpAngle(this.facing, Math.atan2(this.vy, this.vx), Math.min(1, 16 * dt));

    // dust: hard direction changes / stops, and a trickle while sprinting
    if (dt > 0) {
      const ax = (this.vx - this.prevVx) / dt, ay = (this.vy - this.prevVy) / dt;
      const acc = Math.hypot(ax, ay);
      this.dustT -= dt;
      if ((acc > 1400 && this.curSpeed > 80 && this.dustT <= 0) || (sp > 235 && this.dustT <= 0)) {
        if (this.scene.puff) this.scene.puff(this.x - Math.cos(this.facing) * 10, this.y - Math.sin(this.facing) * 10 + 8, acc > 1400 ? 3 : 1);
        this.dustT = acc > 1400 ? 0.25 : 0.14;
      }
    }
    this.prevVx = this.vx; this.prevVy = this.vy;
    this.animate(dt);
    this.setDepth(this.y);
  }

  animate(dt) {
    const sp = this.curSpeed;
    const run = Phaser.Math.Clamp(sp / 200, 0, 1.6);
    this.phase += dt * (3 + sp * 0.08) * Math.PI * 2 * (run > 0.05 ? 1 : 0);
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    const stride = s * 8.5 * run;
    const bob = Math.abs(c) * 1.6 * run;
    let kickL = 0;
    if (this.kickAnim > 0) { this.kickAnim = Math.max(0, this.kickAnim - dt * 5); kickL = Math.sin(this.kickAnim * Math.PI) * 13; }

    // legs: stride + knee bend (shorter when under the body)
    this.legL.y = (7 + stride) * R;
    this.legR.y = (7 - stride - kickL) * R;
    this.legL.setScale(1, 1 - Math.max(0, -s) * 0.22 * run);
    this.legR.setScale(1, 1 - Math.max(0, s) * 0.22 * run + kickL * 0.01);
    // arms: counter-swing in a shallow arc + slight elbow flare
    this.armL.y = (1 - stride * 0.75) * R;
    this.armR.y = (1 + stride * 0.75) * R;
    this.armL.x = (-19.5 - Math.abs(stride) * 0.12) * R;
    this.armR.x = (19.5 + Math.abs(stride) * 0.12) * R;
    this.armL.rotation = -s * 0.25 * run;
    this.armR.rotation = s * 0.25 * run;
    // torso / head bob, sprint lean (stretch along facing)
    const lean = Phaser.Math.Clamp((sp - 200) / 150, 0, 1);
    this.torso.y = -bob * 0.5 * R;
    this.head.y = (-3.5 - bob - lean * 1.5) * R;
    this.numT.y = (3 - bob * 0.5) * R;
    this.rig.rotation = this.facing + Math.PI / 2;
    this.rig.setScale((1 + lean * 0.03) / R, (1 + bob * 0.012 + lean * 0.07) / R);
    if (this.celebT > 0) {
      // spin + hop
      this.celebT = Math.max(0, this.celebT - dt);
      const u = 1 - this.celebT / 1.4;
      this.rig.rotation += u * Math.PI * 4;
      const hop = Math.abs(Math.sin(u * Math.PI * 3)) * 0.22;
      this.rig.setScale((1 + hop) / R);
      this.shadow.setScale((1 - hop * 0.6) / R).setAlpha(0.7 - hop);
    }
    // shadow: offset by light, stretched when fast
    this.shadow.setScale((1 + lean * 0.12) / R, 1 / R).setAlpha(0.95 - bob * 0.05);
    this.shadow.setPosition(LIGHT.x * 6 + Math.cos(this.facing) * lean * 3, LIGHT.y * 6 + Math.sin(this.facing) * lean * 3);
    if (this.hero) this.heroStar.setY(-47 + Math.sin(this.scene.time.now / 220) * 2).setAngle(Math.sin(this.scene.time.now / 400) * 12);
    if (this.controlled) {
      const t = this.scene.time.now / 160;
      this.ring.setScale((1 + Math.sin(t) * 0.04) / R);
      this.chev.setPosition(Math.cos(this.facing) * 31, Math.sin(this.facing) * 31 + 3).setRotation(this.facing);
    }
  }
}
