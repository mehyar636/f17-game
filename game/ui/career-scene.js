import { FONT, FONT_R } from '../match/config.js';
import { generateTextures } from '../match/textures.js';
import { sfx } from '../match/sfx.js';
import { TIERS, squadNames, teamById, teamsOf } from '../data/teams.js';
import { ensureCareer, finishSeason, nextFixture, position, ROUNDS, seasonOver, sortedTable } from '../career/league.js';
import { preloadArt, backdrop, button, crest, panel, topBar } from './widgets.js';

const ord = (n) => n + (['th', 'st', 'nd', 'rd'][n % 10 > 3 || (n % 100 > 10 && n % 100 < 14) ? 0 : n % 10]);

/** Career: the ladder of leagues, the live table and the next fixture. */
export class CareerScene extends Phaser.Scene {
  constructor() { super('Career'); }

  preload() { preloadArt(this); }

  create() {
    generateTextures(this);
    const gs = GameState.data;
    const c = ensureCareer(GameState);
    const tier = TIERS[c.tier], top = c.tier === TIERS.length - 1;
    const { width: W, height: H } = this.scale;
    this.cameras.main.setBackgroundColor('#050810');
    this.cameras.main.fadeIn(250, 5, 8, 16);
    backdrop(this);
    topBar(this, 'CAREER', `${tier.name}   ·   SEASON ${c.season}`, gs.coins || 0);

    // ── Ladder ────────────────────────────────────────────────────────────
    const lx = 36, ly = 92, lw = 290, lh = 596;
    panel(this, lx, ly, lw, lh, { accent: true });
    this.add.text(lx + 22, ly + 20, 'THE LADDER', { fontFamily: FONT, fontSize: '20px', color: '#fde047' });
    const lg = this.add.graphics();
    const rh = 118, y0 = ly + 62;
    TIERS.forEach((t, i) => {
      const row = TIERS.length - 1 - i, y = y0 + row * (rh + 10);
      const cur = i === c.tier, done = i < c.tier;
      lg.fillStyle(cur ? 0x14532d : 0x111827, cur ? 0.95 : 0.7); lg.fillRoundedRect(lx + 16, y, lw - 32, rh, 12);
      if (cur) { lg.lineStyle(2, 0xfacc15, 1); lg.strokeRoundedRect(lx + 16, y, lw - 32, rh, 12); }
      lg.fillStyle(done ? 0x22c55e : cur ? 0xfacc15 : 0x334155); lg.fillCircle(lx + 44, y + 34, 16);
      this.add.text(lx + 44, y + 34, done ? '✓' : String(i + 1), { fontFamily: FONT, fontSize: '18px', color: '#0b1220' }).setOrigin(0.5);
      this.add.text(lx + 70, y + 20, t.name, { fontFamily: FONT, fontSize: '21px', color: cur || done ? '#ffffff' : 'rgba(255,255,255,0.4)' });
      this.add.text(lx + 32, y + 62, cur ? 'YOU ARE HERE' : done ? 'COMPLETED' : 'LOCKED', { fontFamily: FONT_R, fontSize: '10px', color: cur ? '#fde047' : done ? '#86efac' : 'rgba(255,255,255,0.35)', letterSpacing: 3 });
      this.add.text(lx + 32, y + 80, t.blurb, { fontFamily: FONT_R, fontSize: '11px', color: 'rgba(255,255,255,0.5)', wordWrap: { width: lw - 64 } });
      this.add.text(lx + lw - 30, y + 24, t.difficulty.toUpperCase(), { fontFamily: FONT_R, fontSize: '9px', color: 'rgba(255,255,255,0.45)', letterSpacing: 2 }).setOrigin(1, 0);
    });

    // ── Table ─────────────────────────────────────────────────────────────
    const tx = lx + lw + 20, tw = 560;
    panel(this, tx, ly, tw, lh);
    this.add.text(tx + 22, ly + 20, 'LEAGUE TABLE', { fontFamily: FONT, fontSize: '20px', color: '#fde047' });
    this.add.text(tx + tw - 22, ly + 26, `PLAYED ${Math.min(c.round, ROUNDS)} OF ${ROUNDS}`, { fontFamily: FONT_R, fontSize: '11px', color: 'rgba(255,255,255,0.55)', letterSpacing: 3 }).setOrigin(1, 0);
    const cols = [['P', 318], ['W', 356], ['D', 394], ['L', 432], ['GD', 478], ['PTS', 530]];
    cols.forEach(([h, dx]) => this.add.text(tx + dx, ly + 70, h, { fontFamily: FONT_R, fontSize: '10px', color: 'rgba(255,255,255,0.45)', letterSpacing: 2 }).setOrigin(0.5));
    const tg = this.add.graphics();
    const rows = sortedTable(c), rowH = 70, ry0 = ly + 90;
    rows.forEach((r, i) => {
      const team = teamById(c.tier, r.id), y = ry0 + i * (rowH + 8), me = r.id === 'f17';
      tg.fillStyle(me ? 0x14532d : 0x111827, me ? 0.95 : 0.65); tg.fillRoundedRect(tx + 14, y, tw - 28, rowH, 10);
      if (me) { tg.lineStyle(2, 0xfacc15, 1); tg.strokeRoundedRect(tx + 14, y, tw - 28, rowH, 10); }
      if (i < (top ? 1 : 2)) { tg.fillStyle(top ? 0xfacc15 : 0x22c55e); tg.fillRoundedRect(tx + 14, y, 6, rowH, { tl: 10, bl: 10, tr: 0, br: 0 }); }
      this.add.text(tx + 44, y + rowH / 2, String(i + 1), { fontFamily: FONT, fontSize: '24px', color: me ? '#fde047' : '#ffffff' }).setOrigin(0.5);
      crest(this, tx + 90, y + rowH / 2, 22, team);
      this.add.text(tx + 124, y + rowH / 2, team.name, { fontFamily: FONT, fontSize: '20px', color: me ? '#fde047' : '#ffffff' }).setOrigin(0, 0.5);
      const gd = r.gf - r.ga;
      [r.p, r.w, r.d, r.l, (gd > 0 ? '+' : '') + gd].forEach((v, k) => this.add.text(tx + cols[k][1], y + rowH / 2, String(v), { fontFamily: FONT_R, fontSize: '15px', color: 'rgba(255,255,255,0.8)' }).setOrigin(0.5));
      this.add.text(tx + 530, y + rowH / 2, String(r.pts), { fontFamily: FONT, fontSize: '24px', color: '#ffffff' }).setOrigin(0.5);
    });
    this.add.text(tx + 22, ly + lh - 26, top ? '▌ 1ST PLACE WINS THE TITLE' : '▌ TOP 2 ARE PROMOTED', { fontFamily: FONT_R, fontSize: '10px', color: top ? '#fde047' : '#86efac', letterSpacing: 3 });

    // ── Next fixture / last results ───────────────────────────────────────
    const fxX = tx + tw + 20, fw = W - fxX - 36;
    panel(this, fxX, ly, fw, lh);
    const fx = nextFixture(c);
    if (fx) {
      this.add.text(fxX + fw / 2, ly + 28, `MATCHDAY ${fx.round + 1}`, { fontFamily: FONT, fontSize: '20px', color: '#fde047' }).setOrigin(0.5);
      crest(this, fxX + fw / 2, ly + 116, 54, fx.opp);
      this.add.text(fxX + fw / 2, ly + 188, fx.opp.name, { fontFamily: FONT, fontSize: '22px', color: '#ffffff', align: 'center', wordWrap: { width: fw - 30 } }).setOrigin(0.5, 0);
      const names = squadNames(fx.opp);
      this.add.text(fxX + fw / 2, ly + 250, `STAR PLAYER:  ${names[9]}\nKEEPER:  ${names[0]}`, { fontFamily: FONT_R, fontSize: '11px', color: 'rgba(255,255,255,0.55)', align: 'center', lineSpacing: 6, letterSpacing: 2 }).setOrigin(0.5, 0);
      const stars = Math.max(1, Math.round(fx.opp.strength * 5));
      for (let i = 0; i < 5; i++) this.add.image(fxX + fw / 2 - 48 + i * 24, ly + 306, 'm_star').setScale(0.38).setTint(i < stars ? 0xfacc15 : 0x334155);
      this.add.text(fxX + fw / 2, ly + 328, 'TEAM STRENGTH', { fontFamily: FONT_R, fontSize: '9px', color: 'rgba(255,255,255,0.4)', letterSpacing: 3 }).setOrigin(0.5);
      button(this, fxX + fw / 2, ly + 386, fw - 44, 64, 'PLAY MATCH', { size: 26, onClick: () => this.go('Match') });
    } else {
      this.add.text(fxX + fw / 2, ly + 120, 'SEASON\nCOMPLETE', { fontFamily: FONT, fontSize: '34px', color: '#fde047', align: 'center' }).setOrigin(0.5);
    }
    if (c.lastRound) {
      this.add.text(fxX + 22, ly + 440, 'LAST RESULTS', { fontFamily: FONT_R, fontSize: '10px', color: 'rgba(255,255,255,0.5)', letterSpacing: 3 });
      c.lastRound.results.forEach((m, i) => {
        const hT = teamById(c.tier, m.h), aT = teamById(c.tier, m.a), mine = m.h === 'f17' || m.a === 'f17';
        this.add.text(fxX + fw / 2, ly + 468 + i * 24, `${hT.short}  ${m.gh} - ${m.ga}  ${aT.short}`, { fontFamily: FONT, fontSize: '17px', color: mine ? '#fde047' : 'rgba(255,255,255,0.8)' }).setOrigin(0.5);
      });
    }
    button(this, fxX + fw / 2, ly + lh - 44, fw - 44, 46, 'MAIN MENU', { size: 17, color: 0x1f2937, text: '#ffffff', onClick: () => this.go('Menu') });
    this.input.keyboard && this.input.keyboard.once('keydown-ESC', () => this.go('Menu'));

    if (seasonOver(c)) this.time.delayedCall(500, () => this.seasonEnd(c, tier, top));
    void teamsOf;
  }

  seasonEnd(c, tier, top) {
    const { width: W, height: H } = this.scale;
    const pos = position(c), promoted = pos <= 2 && !top, champion = top && pos === 1;
    const good = promoted || champion || pos === 1;
    const col = good ? 0xfacc15 : 0x64748b;
    const items = [this.add.rectangle(0, 0, W * 2, H * 2, 0x000000, 0.8).setInteractive()];
    const g = this.add.graphics();
    g.fillStyle(0x0b1220, 0.98); g.fillRoundedRect(-300, -210, 600, 420, 22);
    g.lineStyle(3, col, 1); g.strokeRoundedRect(-300, -210, 600, 420, 22);
    g.fillStyle(col); g.fillRoundedRect(-300, -210, 600, 8, { tl: 22, tr: 22, bl: 0, br: 0 });
    items.push(g);
    items.push(this.add.text(0, -170, `${tier.name}   ·   SEASON ${c.season}`, { fontFamily: FONT_R, fontSize: '12px', color: 'rgba(255,255,255,0.6)', letterSpacing: 5 }).setOrigin(0.5));
    items.push(this.add.text(0, -104, champion ? 'CHAMPIONS!' : promoted ? 'PROMOTED!' : pos === 1 ? 'LEAGUE WINNERS!' : 'SEASON OVER', { fontFamily: FONT, fontSize: '64px', color: good ? '#fde047' : '#ffffff', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5));
    items.push(this.add.text(0, -36, `F17 FINISHED ${ord(pos).toUpperCase()}`, { fontFamily: FONT, fontSize: '28px', color: '#ffffff' }).setOrigin(0.5));
    const next = promoted ? `NEXT STOP: ${TIERS[c.tier + 1].name}` : champion ? 'YOU ARE THE BEST TEAM IN THE LAND' : top ? 'FINISH 1ST TO WIN THE TITLE' : 'FINISH IN THE TOP 2 TO GO UP — TRY AGAIN!';
    items.push(this.add.text(0, 12, next, { fontFamily: FONT_R, fontSize: '13px', color: good ? '#86efac' : 'rgba(255,255,255,0.65)', letterSpacing: 3 }).setOrigin(0.5));
    const bonus = pos === 1 ? 150 : pos === 2 ? 80 : pos === 3 ? 40 : 15;
    items.push(this.add.image(-70, 62, 'm_coin').setScale(0.65));
    items.push(this.add.text(-50, 62, `+${bonus} COINS`, { fontFamily: FONT, fontSize: '24px', color: '#fde047' }).setOrigin(0, 0.5));
    items.push(button(this, 0, 146, 300, 64, promoted ? 'GO UP!' : 'NEXT SEASON', { size: 26, color: good ? 0xfacc15 : 0x22c55e, text: '#1a1200', onClick: () => { finishSeason(GameState); this.scene.restart(); } }));
    const card = this.add.container(W / 2, H / 2, items).setDepth(100).setAlpha(0);
    this.tweens.add({ targets: card, alpha: 1, duration: 300 });
    if (good) {
      sfx.ensure(); sfx.cheer(1); sfx.objective();
      this.add.particles(W / 2, H / 2 - 120, 'm_particle', { speed: { min: 200, max: 620 }, angle: { min: 200, max: 340 }, gravityY: 700, lifespan: { min: 1200, max: 2200 }, scale: { start: 0.5, end: 0.1 }, rotate: { min: 0, max: 720 }, tint: [0xfacc15, 0x22c55e, 0xffffff, 0x60a5fa], quantity: 1, emitting: false }).setDepth(101).explode(220);
    }
  }

  go(key) {
    if (this.leaving) return; this.leaving = true;
    this.cameras.main.fadeOut(180, 5, 8, 16);
    this.cameras.main.once('camerafadeoutcomplete', () => { this.leaving = false; this.scene.start(key); });
  }
}
