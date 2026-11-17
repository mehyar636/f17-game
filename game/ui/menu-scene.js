import { FONT, FONT_R, setTeams } from '../match/config.js';
import { generateTextures } from '../match/textures.js';
import { sfx } from '../match/sfx.js';
import { TIERS, teamsOf } from '../data/teams.js';
import { ensureCareer, nextFixture, position, ROUNDS, seasonOver } from '../career/league.js';
import { preloadArt, backdrop, button, crest, heroPortrait, hex, panel, topBar } from './widgets.js';

const ord = (n) => n + (['th', 'st', 'nd', 'rd'][n % 10 > 3 || (n % 100 > 10 && n % 100 < 14) ? 0 : n % 10]);

/** Home screen: the hero F17, the next league match, and the ways in to Career and Training. */
export class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  preload() { preloadArt(this); }

  create() {
    const gs = GameState.data;
    const career = ensureCareer(GameState);
    const tier = TIERS[career.tier];
    const teams = teamsOf(career.tier);
    const fx = nextFixture(career);
    setTeams(teams[0], fx ? fx.opp : teams[1]);
    generateTextures(this);
    const { width: W, height: H } = this.scale;
    this.cameras.main.setBackgroundColor('#050810');
    this.cameras.main.fadeIn(250, 5, 8, 16);
    backdrop(this);
    topBar(this, 'F17 PRO ACADEMY', `${tier.name}   ·   SEASON ${career.season}`, gs.coins || 0);

    // ── Hero card ─────────────────────────────────────────────────────────
    const hx = 36, hy = 92, hw = 380, hh = 596;
    panel(this, hx, hy, hw, hh, { accent: true });
    const spot = this.add.graphics();
    spot.fillStyle(0x14532d, 0.9); spot.fillRoundedRect(hx + 16, hy + 20, hw - 32, 250, 12);
    for (let i = 0; i < 6; i++) { spot.fillStyle(0xffffff, i % 2 ? 0.05 : 0); spot.fillRect(hx + 16 + i * ((hw - 32) / 6), hy + 20, (hw - 32) / 6, 250); }
    spot.lineStyle(3, 0xffffff, 0.25); spot.strokeCircle(hx + hw / 2, hy + 150, 86);
    this.add.image(hx + hw / 2, hy + 150, 'm_glow').setScale(1.1).setBlendMode(Phaser.BlendModes.ADD).setTint(0xfacc15).setAlpha(0.8);
    const hero = heroPortrait(this, hx + hw / 2, hy + 152, 0.92);
    this.tweens.add({ targets: hero, y: hero.y - 4, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.add.text(hx + 30, hy + 32, String(gs.rating), { fontFamily: FONT, fontSize: '54px', color: '#fde047', stroke: '#000', strokeThickness: 5 });
    this.add.text(hx + 34, hy + 92, 'OVR', { fontFamily: FONT_R, fontSize: '11px', color: 'rgba(255,255,255,0.8)', letterSpacing: 3 });
    this.add.image(hx + hw - 44, hy + 50, 'm_star').setScale(0.55).setTint(0xfacc15);
    this.add.text(hx + hw / 2, hy + 300, 'F17', { fontFamily: FONT, fontSize: '56px', color: '#ffffff' }).setOrigin(0.5);
    this.add.text(hx + hw / 2, hy + 340, `#17   ·   FORWARD   ·   ${tier.f17}`, { fontFamily: FONT_R, fontSize: '12px', color: 'rgba(255,255,255,0.6)', letterSpacing: 3 }).setOrigin(0.5);

    const st = gs.stats, bars = [['PAC', st.speed, 0x22c55e], ['SHO', st.shooting, 0xef4444], ['DRI', st.dribbling, 0x38bdf8], ['PAS', st.passing, 0xfacc15], ['DEF', st.defending, 0xc084fc], ['PHY', st.stamina, 0xfb923c]];
    const bg = this.add.graphics();
    bars.forEach(([lbl, v, col], i) => {
      const bx = hx + 30 + (i % 2) * 168, by = hy + 376 + Math.floor(i / 2) * 46;
      this.add.text(bx, by, lbl, { fontFamily: FONT_R, fontSize: '11px', color: 'rgba(255,255,255,0.6)', letterSpacing: 2 });
      this.add.text(bx + 150, by - 6, String(v), { fontFamily: FONT, fontSize: '22px', color: hex(col) }).setOrigin(1, 0);
      bg.fillStyle(0xffffff, 0.1); bg.fillRoundedRect(bx, by + 22, 150, 6, 3);
      bg.fillStyle(col); bg.fillRoundedRect(bx, by + 22, Math.max(6, 150 * v / 99), 6, 3);
    });
    const xf = Math.min(1, gs.xp / gs.xpNextLevel);
    this.add.text(hx + 30, hy + hh - 60, 'XP TO NEXT RATING', { fontFamily: FONT_R, fontSize: '10px', color: 'rgba(255,255,255,0.5)', letterSpacing: 3 });
    this.add.text(hx + hw - 30, hy + hh - 60, `${gs.xp} / ${gs.xpNextLevel}`, { fontFamily: FONT_R, fontSize: '10px', color: '#fde047' }).setOrigin(1, 0);
    bg.fillStyle(0xffffff, 0.1); bg.fillRoundedRect(hx + 30, hy + hh - 40, hw - 60, 10, 5);
    bg.fillStyle(0xfacc15); bg.fillRoundedRect(hx + 30, hy + hh - 40, Math.max(10, (hw - 60) * xf), 10, 5);

    // ── Next match ────────────────────────────────────────────────────────
    const nx = 440, ny = 92, nw = W - nx - 36, nh = 330;
    panel(this, nx, ny, nw, nh);
    const band = this.add.graphics();
    band.fillStyle(0x14532d, 0.55); band.fillRoundedRect(nx, ny, nw, nh, 16);
    band.fillStyle(0x000000, 0.35); band.fillRoundedRect(nx, ny, nw, 46, { tl: 16, tr: 16, bl: 0, br: 0 });
    const over = seasonOver(career);
    this.add.text(nx + 24, ny + 23, over ? 'SEASON COMPLETE' : 'NEXT MATCH', { fontFamily: FONT, fontSize: '20px', color: '#fde047' }).setOrigin(0, 0.5);
    this.add.text(nx + nw - 24, ny + 23, over ? tier.name : `${tier.name}   ·   MATCHDAY ${career.round + 1} OF ${ROUNDS}`, { fontFamily: FONT_R, fontSize: '12px', color: 'rgba(255,255,255,0.7)', letterSpacing: 3 }).setOrigin(1, 0.5);
    const cy = ny + 150;
    if (!over) {
      crest(this, nx + 150, cy, 62, teams[0]);
      this.add.text(nx + 150, cy + 86, teams[0].name, { fontFamily: FONT, fontSize: '22px', color: '#ffffff' }).setOrigin(0.5);
      crest(this, nx + nw - 150, cy, 62, fx.opp);
      this.add.text(nx + nw - 150, cy + 86, fx.opp.name, { fontFamily: FONT, fontSize: '22px', color: '#ffffff' }).setOrigin(0.5);
      this.add.text(nx + nw / 2, cy - 44, 'VS', { fontFamily: FONT, fontSize: '34px', color: 'rgba(255,255,255,0.35)' }).setOrigin(0.5);
      const play = button(this, nx + nw / 2, cy + 34, 280, 76, 'PLAY MATCH', { size: 34, sub: `YOU ARE ${ord(position(career)).toUpperCase()} IN THE TABLE`, onClick: () => this.go('Match') });
      this.tweens.add({ targets: play, y: play.y - 4, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    } else {
      const pos = position(career);
      this.add.text(nx + nw / 2, cy - 30, `YOU FINISHED ${ord(pos).toUpperCase()}`, { fontFamily: FONT, fontSize: '46px', color: pos <= 2 ? '#22c55e' : '#ffffff' }).setOrigin(0.5);
      button(this, nx + nw / 2, cy + 60, 320, 70, 'SEE SEASON RESULT', { size: 28, color: 0xfacc15, text: '#1a1200', onClick: () => this.go('Career') });
    }

    // ── Mode cards ────────────────────────────────────────────────────────
    const my = ny + nh + 22, mh = H - my - 32, mw = (nw - 44) / 3;
    const tr = gs.training || {};
    const drillStars = ['shoot', 'dribble', 'pass'].reduce((a, k) => a + ((tr[k] && tr[k].stars) || 0), 0);
    const cards = [
      { t: 'CAREER', s: 'League table · Ladder', big: ord(position(career)).toUpperCase(), small: `${tier.short} LEAGUE`, col: 0x2563eb, to: 'Career' },
      { t: 'TRAINING', s: '3 drills · Boost your stats', big: `${drillStars}/9`, small: 'STARS EARNED', col: 0x9333ea, to: 'Training' },
      { t: 'RECORD', s: `${gs.goals} goals · ${(gs.trophies || []).length} trophies`, big: `${gs.wins}-${gs.draws}-${gs.losses}`, small: 'WON · DRAWN · LOST', col: 0x0f766e, to: null },
    ];
    cards.forEach((c, i) => {
      const x = nx + i * (mw + 22);
      const g = this.add.graphics();
      const draw = (hover) => {
        g.clear();
        g.fillStyle(0x000000, 0.35); g.fillRoundedRect(x + 3, my + 6, mw, mh, 16);
        g.fillStyle(hover ? 0x13203a : 0x0b1220, 0.95); g.fillRoundedRect(x, my, mw, mh, 16);
        g.fillStyle(c.col); g.fillRoundedRect(x, my, 8, mh, { tl: 16, bl: 16, tr: 0, br: 0 });
        g.fillStyle(c.col, 0.14); g.fillRoundedRect(x, my, mw, mh, 16);
        g.lineStyle(2, hover ? 0xfacc15 : 0xffffff, hover ? 0.9 : 0.08); g.strokeRoundedRect(x, my, mw, mh, 16);
      };
      draw(false);
      this.add.text(x + 28, my + 20, c.t, { fontFamily: FONT, fontSize: '28px', color: '#ffffff' });
      this.add.text(x + 28, my + 56, c.s, { fontFamily: FONT_R, fontSize: '12px', color: 'rgba(255,255,255,0.55)' });
      this.add.text(x + 28, my + mh - 74, c.big, { fontFamily: FONT, fontSize: '46px', color: '#fde047' });
      this.add.text(x + 28, my + mh - 24, c.small, { fontFamily: FONT_R, fontSize: '10px', color: 'rgba(255,255,255,0.5)', letterSpacing: 3 });
      if (c.to) {
        this.add.text(x + mw - 22, my + mh / 2, '›', { fontFamily: FONT, fontSize: '40px', color: 'rgba(255,255,255,0.35)' }).setOrigin(1, 0.5);
        this.add.zone(x + mw / 2, my + mh / 2, mw, mh).setInteractive({ useHandCursor: true })
          .on('pointerover', () => draw(true)).on('pointerout', () => draw(false))
          .on('pointerup', () => { sfx.ensure(); sfx.click(); this.go(c.to); });
      }
    });

    // discreet save reset (two taps)
    const reset = this.add.text(W - 36, H - 12, 'RESET SAVE', { fontFamily: FONT_R, fontSize: '10px', color: 'rgba(255,255,255,0.25)', letterSpacing: 2 }).setOrigin(1, 1).setInteractive({ useHandCursor: true });
    let armed = false;
    reset.on('pointerup', () => {
      if (!armed) { armed = true; reset.setText('TAP AGAIN TO ERASE ALL PROGRESS').setColor('#ef4444'); this.time.delayedCall(3000, () => { armed = false; reset.setText('RESET SAVE').setColor('rgba(255,255,255,0.25)'); }); }
      else { GameState.reset(); this.scene.restart(); }
    });
    this.input.keyboard && this.input.keyboard.once('keydown-ENTER', () => this.go(over ? 'Career' : 'Match'));
  }

  go(key) {
    if (this.leaving) return; this.leaving = true;
    this.cameras.main.fadeOut(180, 5, 8, 16);
    this.cameras.main.once('camerafadeoutcomplete', () => { this.leaving = false; this.scene.start(key); });
  }
}
