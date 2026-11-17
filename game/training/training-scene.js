import { FONT, FONT_R } from '../match/config.js';
import { generateTextures } from '../match/textures.js';
import { sfx } from '../match/sfx.js';
import { backdrop, button, heroPortrait, hex, panel, preloadArt, topBar } from '../ui/widgets.js';

const DRILLS = [
  { id: 'shoot',   scene: 'DrillShoot',   name: 'TARGET PRACTICE', desc: 'Beat the keeper.\nHit the gold corner.', stat: 'SHOOTING', color: 0xdc2626, icon: 'm_target', iconScale: 0.5 },
  { id: 'dribble', scene: 'DrillDribble', name: 'CONE RUN',        desc: 'Weave the gold gates,\nthen score.',      stat: 'DRIBBLING', color: 0xf97316, icon: 'm_cone', iconScale: 1 },
  { id: 'pass',    scene: 'DrillPass',    name: 'PASS MASTER',     desc: 'Find the gold teammate.\nChain combos.',   stat: 'PASSING',  color: 0x2563eb, icon: 'm_pu_star', iconScale: 0.5 },
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
    this.cameras.main.setBackgroundColor('#050810');
    this.cameras.main.fadeIn(250, 5, 8, 16);
    backdrop(this);
    this.topCoins = topBar(this, 'F17 TRAINING CENTRE', 'TRAIN THE HERO   ·   DRILLS   ·   COACHING', gs.coins || 0);

    // ── Hero + coaching (spend coins on stats) ────────────────────────────
    const hx = 36, hy = 92, hw = 470, hh = 596;
    panel(this, hx, hy, hw, hh, { accent: true });
    const spot = this.add.graphics();
    spot.fillStyle(0x14532d, 0.85); spot.fillRoundedRect(hx + 16, hy + 20, 170, 190, 12);
    this.add.image(hx + 101, hy + 120, 'm_glow').setScale(0.8).setBlendMode(Phaser.BlendModes.ADD).setTint(0xfacc15).setAlpha(0.7);
    heroPortrait(this, hx + 101, hy + 122, 0.66);
    this.add.text(hx + 206, hy + 26, 'F17', { fontFamily: FONT, fontSize: '58px', color: '#ffffff' });
    this.add.text(hx + 208, hy + 92, '#17   ·   FORWARD', { fontFamily: FONT_R, fontSize: '12px', color: 'rgba(255,255,255,0.6)', letterSpacing: 3 });
    this.ratingT = this.add.text(hx + 208, hy + 116, '', { fontFamily: FONT, fontSize: '40px', color: '#fde047' });
    this.add.text(hx + 208, hy + 166, 'OVERALL RATING', { fontFamily: FONT_R, fontSize: '10px', color: 'rgba(255,255,255,0.5)', letterSpacing: 3 });
    this.coinsT = this.add.text(hx + hw - 24, hy + 190, '', { fontFamily: FONT, fontSize: '18px', color: '#fde047' }).setOrigin(1, 0.5);
    this.add.text(hx + 22, hy + 226, 'COACHING  —  SPEND COINS TO IMPROVE F17', { fontFamily: FONT_R, fontSize: '10px', color: 'rgba(255,255,255,0.55)', letterSpacing: 3 });

    this.barG = this.add.graphics();
    this.rows = STATS.map(([key, label, col, hint], i) => {
      const y = hy + 250 + i * 56;
      this.add.text(hx + 22, y, label, { fontFamily: FONT, fontSize: '18px', color: '#ffffff' });
      this.add.text(hx + 22, y + 22, hint, { fontFamily: FONT_R, fontSize: '10px', color: 'rgba(255,255,255,0.45)' });
      const val = this.add.text(hx + 290, y + 8, '', { fontFamily: FONT, fontSize: '26px', color: hex(col) }).setOrigin(1, 0.5);
      const bg = this.add.graphics();
      const lbl = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '15px', color: '#1a1200' }).setOrigin(0.5);
      const btn = this.add.container(hx + hw - 86, y + 18, [bg, lbl]).setSize(140, 38).setInteractive({ useHandCursor: true });
      btn.on('pointerup', () => this.buy(key, val));
      btn.on('pointerover', () => btn.setScale(1.04)).on('pointerout', () => btn.setScale(1));
      return { key, col, y, val, bg, lbl, btn };
    });
    this.refresh();

    // ── Drills ────────────────────────────────────────────────────────────
    const dx = hx + hw + 22, dw = W - dx - 36;
    panel(this, dx, hy, dw, hh);
    this.add.text(dx + 24, hy + 20, 'DRILLS', { fontFamily: FONT, fontSize: '22px', color: '#fde047' });
    this.add.text(dx + dw - 24, hy + 28, '60 SECONDS EACH   ·   2★ = +1 STAT   ·   3★ = +2', { fontFamily: FONT_R, fontSize: '10px', color: 'rgba(255,255,255,0.55)', letterSpacing: 3 }).setOrigin(1, 0);
    const rec = gs.training || {};
    const cw = (dw - 48 - 32) / 3, ch = 430, cy = hy + 66;
    DRILLS.forEach((d, i) => {
      const x = dx + 24 + i * (cw + 16);
      const r = rec[d.id] || { best: 0, stars: 0, plays: 0 };
      const g = this.add.graphics();
      const draw = (hover) => {
        g.clear();
        g.fillStyle(0x000000, 0.4); g.fillRoundedRect(x + 3, cy + 6, cw, ch, 16);
        g.fillStyle(hover ? 0x16233f : 0x0f172a, 0.96); g.fillRoundedRect(x, cy, cw, ch, 16);
        g.fillStyle(d.color); g.fillRoundedRect(x, cy, cw, 124, { tl: 16, tr: 16, bl: 0, br: 0 });
        g.fillStyle(0xffffff, 0.12); g.fillRoundedRect(x, cy, cw, 56, { tl: 16, tr: 16, bl: 0, br: 0 });
        g.fillStyle(0x000000, 0.18); g.fillRect(x, cy + 104, cw, 20);
        g.lineStyle(2, hover ? 0xfacc15 : 0xffffff, hover ? 1 : 0.12); g.strokeRoundedRect(x, cy, cw, ch, 16);
        g.fillStyle(0x22c55e); g.fillRoundedRect(x + 20, cy + ch - 66, cw - 40, 46, 23);
        g.fillStyle(0xffffff, hover ? 0.3 : 0.15); g.fillRoundedRect(x + 24, cy + ch - 62, cw - 48, 18, 9);
      };
      draw(false);
      const icon = this.add.image(x + cw / 2, cy + 58, d.icon).setScale(d.iconScale);
      this.tweens.add({ targets: icon, angle: d.icon === 'm_target' ? 360 : 8, duration: d.icon === 'm_target' ? 9000 : 900, yoyo: d.icon !== 'm_target', repeat: -1 });
      this.add.text(x + cw / 2, cy + 114, `TRAINS ${d.stat}`, { fontFamily: FONT_R, fontSize: '10px', color: '#ffffff', letterSpacing: 3 }).setOrigin(0.5);
      this.add.text(x + cw / 2, cy + 162, d.name, { fontFamily: FONT, fontSize: '25px', color: '#ffffff' }).setOrigin(0.5);
      this.add.text(x + cw / 2, cy + 212, d.desc, { fontFamily: FONT_R, fontSize: '13px', color: 'rgba(255,255,255,0.65)', align: 'center', lineSpacing: 4 }).setOrigin(0.5);
      [0, 1, 2].forEach(k => this.add.image(x + cw / 2 - 36 + k * 36, cy + 276, 'm_star').setScale(0.6).setTint(k < r.stars ? 0xfacc15 : 0x334155));
      this.add.text(x + cw / 2, cy + 316, r.plays ? `BEST  ${r.best}` : 'NOT PLAYED YET', { fontFamily: FONT, fontSize: '16px', color: r.plays ? '#fde047' : 'rgba(255,255,255,0.4)' }).setOrigin(0.5);
      this.add.text(x + cw / 2, cy + ch - 43, 'START DRILL', { fontFamily: FONT, fontSize: '18px', color: '#04170a' }).setOrigin(0.5);
      this.add.zone(x + cw / 2, cy + ch / 2, cw, ch).setInteractive({ useHandCursor: true })
        .on('pointerover', () => draw(true)).on('pointerout', () => draw(false))
        .on('pointerup', () => { sfx.ensure(); sfx.click(); this.go(d.scene); });
    });
    button(this, dx + dw / 2, hy + hh - 46, 260, 48, 'MAIN MENU', { size: 17, color: 0x1f2937, text: '#ffffff', onClick: () => this.go('Menu') });
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
      g.fillStyle(0xffffff, 0.1); g.fillRoundedRect(this.rows[0].val.x - 268, r.y + 40, 268, 6, 3);
      g.fillStyle(r.col); g.fillRoundedRect(this.rows[0].val.x - 268, r.y + 40, Math.max(6, 268 * v / 99), 6, 3);
      r.bg.clear();
      r.bg.fillStyle(can ? 0xfacc15 : 0x334155); r.bg.fillRoundedRect(-70, -19, 140, 38, 19);
      if (can) { r.bg.fillStyle(0xffffff, 0.25); r.bg.fillRoundedRect(-66, -16, 132, 14, 7); }
      r.lbl.setText(max ? 'MAXED' : `+1   ·   ${c}`).setColor(can ? '#1a1200' : 'rgba(255,255,255,0.5)');
    });
  }

  buy(key, valText) {
    const gs = GameState.data, v = gs.stats[key], c = cost(v);
    sfx.ensure();
    if (v >= 99) return;
    if ((gs.coins || 0) < c) { this.say(`NOT ENOUGH COINS — PLAY A MATCH OR A DRILL TO EARN MORE`, '#fca5a5'); sfx.wall(); return; }
    gs.coins -= c; gs.stats[key] = v + 1;
    // overall rating follows the average of the six stats (never drops)
    const avg = Math.round(Object.values(gs.stats).reduce((a, b) => a + b, 0) / 6);
    gs.rating = Math.max(gs.rating, avg + 2);
    GameState.save();
    sfx.star();
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

  go(key) {
    if (this.leaving) return; this.leaving = true;
    this.cameras.main.fadeOut(180, 5, 8, 16);
    this.cameras.main.once('camerafadeoutcomplete', () => { this.leaving = false; this.scene.start(key); });
  }
}
