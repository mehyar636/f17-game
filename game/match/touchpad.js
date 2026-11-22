import { EV, FONT } from './config.js';
import { sfx } from './sfx.js';

const COLORS = { shoot: 0xdc2626, pass: 0x2563eb, sprint: 0xca8a04, switch: 0x475569 };
const SIZES = { shoot: 50, pass: 40, sprint: 34, switch: 28 };
const LABELS = { shoot: 'SHOOT', pass: 'PASS', sprint: 'SPRINT', switch: 'SWITCH' };

/**
 * Virtual joystick (left half) + action buttons (right) that emit EV.TOUCH, consumed by Controls.
 * Works in any scene; objects are fixed to the camera (scrollFactor 0).
 */
export class TouchPad {
  /**
   * opts.map(sx, sy) → position for a scrollFactor-0 object so it appears at screen (sx, sy) under a zoomed camera;
   * opts.scale = 1 / zoom. Omit both when the scene's camera is at zoom 1.
   */
  constructor(scene, buttons = ['shoot', 'pass', 'sprint'], depth = 20000, opts = {}) {
    this.scene = scene; this.joyId = -1; this.btns = [];
    this.map = opts.map || ((x, y) => ({ x, y })); this.k = opts.scale || 1;
    this.joyBase = scene.add.circle(0, 0, 58, 0xffffff, 0.12).setStrokeStyle(2, 0xffffff, 0.35).setVisible(false).setScrollFactor(0).setDepth(depth).setScale(this.k);
    this.joyKnob = scene.add.circle(0, 0, 26, 0xffffff, 0.5).setVisible(false).setScrollFactor(0).setDepth(depth).setScale(this.k);
    buttons.forEach(name => {
      const r = SIZES[name];
      const bg = scene.add.circle(0, 0, r, COLORS[name], 0.82).setStrokeStyle(3, 0xffffff, 0.5);
      const t = scene.add.text(0, 0, LABELS[name], { fontFamily: FONT, fontSize: `${Math.round(r * 0.42)}px`, color: '#ffffff' }).setOrigin(0.5);
      const c = scene.add.container(0, 0, [bg, t]).setSize(r * 2, r * 2).setInteractive(new Phaser.Geom.Circle(r, r, r + 14), Phaser.Geom.Circle.Contains).setScrollFactor(0).setDepth(depth).setScale(this.k);
      let by = -1;
      const send = (down) => { sfx.ensure(); bg.setAlpha(down ? 1 : 0.82); c.setScale((down ? 0.9 : 1) * this.k); scene.game.events.emit(EV.TOUCH, { type: 'btn', name, down }); };
      c.on('pointerdown', (p) => { by = p.id; send(true); });
      const up = (p) => { if (by === p.id) { by = -1; send(false); } };
      c.on('pointerup', up); c.on('pointerout', up); scene.input.on('pointerup', up); scene.input.on('pointerupoutside', up);
      this.ups = this.ups || []; this.ups.push(up);
      this.btns.push({ c, name });
    });
    this.onDown = (p) => {
      if (p.x > scene.scale.width * 0.5 || this.joyId !== -1 || this.locked) return;
      sfx.ensure(); this.joyId = p.id; this.joyOrigin = { x: p.x, y: p.y };
      const q = this.map(p.x, p.y);
      this.joyBase.setPosition(q.x, q.y).setVisible(true); this.joyKnob.setPosition(q.x, q.y).setVisible(true);
    };
    this.onMove = (p) => {
      if (p.id !== this.joyId) return;
      let dx = p.x - this.joyOrigin.x, dy = p.y - this.joyOrigin.y;
      const m = Math.hypot(dx, dy), R = 58;
      if (m > R) { dx = dx / m * R; dy = dy / m * R; }
      this.joyKnob.setPosition(this.joyBase.x + dx * this.k, this.joyBase.y + dy * this.k);
      const mag = Math.min(1, m / R), out = mag < 0.14 ? 0 : Math.min(1, (mag - 0.14) / 0.46);
      scene.game.events.emit(EV.TOUCH, { type: 'axis', x: (dx / (mag * R || 1)) * out, y: (dy / (mag * R || 1)) * out });
    };
    this.onUp = (p) => {
      if (p.id !== this.joyId) return;
      this.joyId = -1; this.joyBase.setVisible(false); this.joyKnob.setVisible(false);
      scene.game.events.emit(EV.TOUCH, { type: 'axis', x: 0, y: 0 });
    };
    scene.input.on('pointerdown', this.onDown); scene.input.on('pointermove', this.onMove);
    scene.input.on('pointerup', this.onUp); scene.input.on('pointerupoutside', this.onUp);
    scene.events.once('shutdown', () => this.destroy());
    this.layout();
  }

  /** Disable the joystick (e.g. while a result card is open). */
  setLocked(v) { this.locked = v; }

  layout() {
    const { width: w, height: h } = this.scene.scale;
    const pos = { shoot: [w - 72, h - 84], pass: [w - 170, h - 60], sprint: [w - 150, h - 150], switch: [w - 62, h - 186] };
    this.btns.forEach(b => { const q = this.map(pos[b.name][0], pos[b.name][1]); b.c.setPosition(q.x, q.y); });
  }

  destroy() {
    const i = this.scene.input;
    i.off('pointerdown', this.onDown); i.off('pointermove', this.onMove); i.off('pointerup', this.onUp); i.off('pointerupoutside', this.onUp);
    (this.ups || []).forEach((u) => { i.off('pointerup', u); i.off('pointerupoutside', u); });
    this.scene.game.events.emit(EV.TOUCH, { type: 'axis', x: 0, y: 0 });
  }
}
