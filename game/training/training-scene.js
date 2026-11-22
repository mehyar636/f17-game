import { FONT, FONT_R } from '../match/config.js';
import { generateTextures } from '../match/textures.js';
import { sfx } from '../match/sfx.js';
import { backdrop, button, goTo, heroPortrait, hex, panel, pressable, preloadArt, topBar } from '../ui/widgets.js';
import { stage } from '../ui/stage3d.js';

const DRILLS = [
  { id: 'shoot',   scene: 'DrillShoot',   name: 'TARGET PRACTICE', desc: 'Beat the keeper. Hit the gold target.', stat: 'SHOOTING', color: 0xdc2626, icon: 'm_target', iconScale: 0.42 },
  { id: 'dribble', scene: 'DrillDribble', name: 'CONE RUN',        desc: 'Weave the gold gates, then score.',     stat: 'DRIBBLING', color: 0xf97316, icon: 'm_cone', iconScale: 0.85 },
  { id: 'pass',    scene: 'DrillPass',    name: 'PASS MASTER',     desc: 'Find the gold teammate. Chain combos.', stat: 'PASSING',  color: 0x2563eb, icon: 'm_pu_star', iconScale: 0.42 },
];

const STATS = [
  ['speed', 'PACE', 0x22c55e, 'Run faster'],
  ['shooting', 'SHOOTING', 0xef4444, 'Harder, more accurate shots'],
  ['dribbling', 'DRIBBLING', 0x38bdf8, 'Harder to tackle'],
  ['passing', 'PASSING', 0xfacc15, 'Passes find their man'],
  ['defending', 'DEFENDING', 0xc084fc, 'Win more tackles'],
  ['stamina', 'STAMINA', 0xfb923c, 'Sprint for longer'],
];
const cost = (v) => 15 + Math.max(0, v - 45) * 3;

/** F17's training centre: coach his stats with coins, and play drills to earn stars, coins and stat boosts. */
export class TrainingScene extends Phaser.Scene {
  constructor() { super('Training'); }
  preload() { preloadArt(this); }

  create() {
    generateTextures(this);
    const { width: W, height: H } = this.scale;
    const gs = GameState.data;
    this.leaving = false; this.input.enabled = true;
    this.cameras.main.fadeIn(140, 5, 8, 16);
    const bd = backdrop(this);
    this.topCoins = topBar(this, 'F17 TRAINING CENTRE', 'TRAIN THE HERO   ·   DRILLS   ·   COACHING', gs.coins || 0);

    // ── Hero (live 3D, juggling) ──────────────────────────────────────────
    const HX = 168, FEET = 640, HH = 430;
    const portrait = heroPortrait(this, HX, 420, 1.25);
    stage.show(this, { x: HX, y: FEET, h: HH, yaw: 0.3, loop: 'juggle', turn: false }).then((ok) => {
      if (!ok || !this.sys.isActive()) return;
      portrait.setVisible(false);
      if (bd.img) this.tweens.add({ targets: bd.img, alpha: 0, duration: 260 });
    });
    this.add.text(40, 96, 'F17', { fontFamily: FONT, fontSize: '64px', color: '#ffffff', stroke: '#000', strokeThickness: 6 });
    this.ratingT = this.add.text(150, 104, '', { fontFamily: FONT, fontSize: '50px', color: '#fde047', stroke: '#000', strokeThickness: 5 });
    this.add.text(44, 172, '#17  ·  FORWARD  ·  OVERALL', { fontFamily: FONT_R, fontSize: '11px', color: 'rgba(255,255,255,0.8)', letterSpacing: 3 });
    this.coinsT = this.add.text(HX, 676, '', { fontFamily: FONT, fontSize: '22px', color: '#fde047', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5);

    // ── Coaching (spend coins on stats) ───────────────────────────────────
    const cx = 318, cy = 92, cw = 420, ch = 596;
    panel(this, cx, cy, cw, ch, { accent: true, alpha: 0.88 });
    this.add.text(cx + 22, cy + 20, 'COACHING', { fontFamily: FONT, fontSize: '22px', color: '#fde047' });
    this.add.text(cx + cw - 22, cy + 28, 'SPEND COINS TO IMPROVE F17', { fontFamily: FONT_R, fontSize: '10px', color: 'rgba(255,255,255,0.55)', letterSpacing: 3 }).setOrigin(1, 0);
    this.barG = this.add.graphics();
    this.rows = STATS.map(([key, label, col, hint], i) => {
      const y = cy + 66 + i * 86;
      this.add.text(cx + 22, y, label, { fontFamily: FONT, fontSize: '22px', color: '#ffffff' });
      this.add.text(cx + 22, y + 28, hint, { fontFamily: FONT_R, fontSize: '11px', color: 'rgba(255,255,255,0.5)' });
      const val = this.add.text(cx + 250, y + 16, '', { fontFamily: FONT, fontSize: '36px', color: hex(col) }).setOrigin(1, 0.5);
      const bg = this.add.graphics();
      const lbl = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '18px', color: '#1a1200' }).setOrigin(0.5);
      const btn = this.add.container(cx + cw - 86, y + 24, [bg, lbl]).setSize(140, 52).setInteractive({ useHandCursor: true });
      pressable(this, btn, () => this.buy(key, val), { hover: 1.05 });
      return { key, col, y, val, bg, lbl, btn, x: cx + 22, w: cw - 44 };
    });
    this.refresh();

    // ── Drills ────────────────────────────────────────────────────────────
    const dx = cx + cw + 18, dw = W - dx - 36;
    panel(this, dx, cy, dw, ch, { alpha: 0.88 });
    this.add.text(dx + 22, cy + 20, 'DRILLS', { fontFamily: FONT, fontSize: '22px', color: '#fde047' });
    this.add.text(dx + dw - 22, cy + 28, '60 SECONDS   ·   2★ = +1 STAT   ·   3★ = +2', { fontFamily: FONT_R, fontSize: '10px', color: 'rgba(255,255,255,0.55)', letterSpacing: 3 }).setOrigin(1, 0);
    const rec = gs.training || {};
    const rw = dw - 36, rh = 146;
    DRILLS.forEach((d, i) => {
      const r = rec[d.id] || { best: 0, stars: 0, plays: 0 };
      const g = this.add.graphics();
      const draw = (hover) => {
        g.clear();
        g.fillStyle(0x000000, 0.4); g.fillRoundedRect(-rw / 2 + 3, -rh / 2 + 6, rw, rh, 14);
        g.fillStyle(hover ? 0x16233f : 0x0f172a, 0.98); g.fillRoundedRect(-rw / 2, -rh / 2, rw, rh, 14);
        g.fillStyle(d.color); g.fillRoundedRect(-rw / 2, -rh / 2, 112, rh, { tl: 14, bl: 14, tr: 0, br: 0 });
        g.fillStyle(0xffffff, 0.14); g.fillRoundedRect(-rw / 2, -rh / 2, 112, rh / 2, { tl: 14, bl: 0, tr: 0, br: 0 });
        g.lineStyle(2, hover ? 0xfacc15 : 0xffffff, hover ? 1 : 0.12); g.strokeRoundedRect(-rw / 2, -rh / 2, rw, rh, 14);
        g.fillStyle(0x22c55e); g.fillRoundedRect(rw / 2 - 138, 14, 122, 44, 22);
        g.fillStyle(0xffffff, hover ? 0.32 : 0.16); g.fillRoundedRect(rw / 2 - 134, 17, 114, 17, 9);
      };
      draw(false);
      const icon = this.add.image(-rw / 2 + 56, -8, d.icon).setScale(d.iconScale);
      this.tweens.add({ targets: icon, angle: d.icon === 'm_target' ? 360 : 8, duration: d.icon === 'm_target' ? 9000 : 900, yoyo: d.icon !== 'm_target', repeat: -1 });
      const L = -rw / 2 + 130;
      const items = [g, icon,
        this.add.text(-rw / 2 + 56, rh / 2 - 20, d.stat, { fontFamily: FONT_R, fontSize: '10px', color: '#ffffff', letterSpacing: 2 }).setOrigin(0.5),
        this.add.text(L, -rh / 2 + 14, d.name, { fontFamily: FONT, fontSize: '28px', color: '#ffffff' }),
        this.add.text(L, -rh / 2 + 52, d.desc, { fontFamily: FONT_R, fontSize: '13px', color: 'rgba(255,255,255,0.7)' }),
        ...[0, 1, 2].map(k => this.add.image(L + 14 + k * 32, 34, 'm_star').setScale(0.52).setTint(k < r.stars ? 0xfacc15 : 0x334155)),
        this.add.text(L + 110, 34, r.plays ? `BEST ${r.best}` : 'NEW', { fontFamily: FONT, fontSize: '16px', color: r.plays ? '#fde047' : 'rgba(255,255,255,0.4)' }).setOrigin(0, 0.5),
        this.add.text(rw / 2 - 77, 36, 'START', { fontFamily: FONT, fontSize: '20px', color: '#04170a' }).setOrigin(0.5),
      ];
      const row = this.add.container(dx + dw / 2, cy + 66 + rh / 2 + i * (rh + 14), items).setSize(rw, rh).setInteractive({ useHandCursor: true });
      pressable(this, row, () => this.go(d.scene), { hover: 1.015, onHover: draw });
    });
    button(this, dx + dw / 2, cy + ch - 40, 260, 48, 'MAIN MENU', { size: 17, color: 0x1f2937, text: '#ffffff', onClick: () => this.go('Menu') });
    this.toast = this.add.text(W / 2, H - 20, '', { fontFamily: FONT, fontSize: '18px', color: '#fde047', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5, 1).setAlpha(0).setDepth(50);
    this.stars = this.add.particles(0, 0, 'm_star', { speed: { min: 80, max: 240 }, angle: { min: 0, max: 360 }, lifespan: { min: 400, max: 800 }, gravityY: 200, scale: { start: 0.5, end: 0 }, tint: [0xfacc15, 0xffffff], rotate: { min: 0, max: 720 }, blendMode: 'ADD', emitting: false }).setDepth(40);
    if (this.input.keyboard) this.input.keyboard.once('keydown-ESC', () => this.go('Menu'));
  }

  refresh() {
    const gs = GameState.data, g = this.barG;
    g.clear();
    this.ratingT.setText(String(gs.rating));
    this.coinsT.setText(`${gs.coins || 0} COINS`); this.topCoins.setText(String(gs.coins || 0));
    this.rows.forEach(r => {
      const v = gs.stats[r.key], c = cost(v), max = v >= 99, can = !max && (gs.coins || 0) >= c;
      r.val.setText(String(v));
      g.fillStyle(0xffffff, 0.1); g.fillRoundedRect(r.x, r.y + 54, r.w, 7, 3);
      g.fillStyle(r.col); g.fillRoundedRect(r.x, r.y + 54, Math.max(7, r.w * v / 99), 7, 3);
      r.bg.clear();
      r.bg.fillStyle(0x000000, 0.35); r.bg.fillRoundedRect(-68, -22, 140, 52, 24);
      r.bg.fillStyle(can ? 0xfacc15 : 0x334155); r.bg.fillRoundedRect(-70, -26, 140, 52, 24);
      if (can) { r.bg.fillStyle(0xffffff, 0.28); r.bg.fillRoundedRect(-65, -22, 130, 18, 9); }
      r.lbl.setText(max ? 'MAXED' : `+1   ·   ${c}`).setColor(can ? '#1a1200' : 'rgba(255,255,255,0.5)');
    });
  }

  buy(key, valText) {
    const gs = GameState.data, v = gs.stats[key], c = cost(v);
    if (v >= 99) return;
    if ((gs.coins || 0) < c) { this.say(`NOT ENOUGH COINS — PLAY A MATCH OR A DRILL TO EARN MORE`, '#fca5a5'); sfx.wall(); return; }
    gs.coins -= c; gs.stats[key] = v + 1;
    // overall rating follows the average of the six stats (never drops)
    const avg = Math.round(Object.values(gs.stats).reduce((a, b) => a + b, 0) / 6);
    gs.rating = Math.max(gs.rating, avg + 2);
    GameState.save();
    sfx.star(); stage.cheer();
    this.stars.explode(14, valText.x - 10, valText.y);
    this.tweens.add({ targets: valText, scale: { from: 1.6, to: 1 }, duration: 300, ease: 'Back.out' });
    this.say('F17 IMPROVED!', '#fde047');
    this.refresh();
  }

  say(text, color) {
    this.tweens.killTweensOf(this.toast);
    this.toast.setText(text).setColor(color).setAlpha(1);
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 1400, duration: 400 });
  }

  go(key) { goTo(this, key); }
}
