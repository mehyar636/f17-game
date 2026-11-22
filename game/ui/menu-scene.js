import { FONT, FONT_R, setTeams } from '../match/config.js';
import { generateTextures } from '../match/textures.js';
import { sfx } from '../match/sfx.js';
import { TIERS, teamsOf } from '../data/teams.js';
import { ensureCareer, nextFixture, position, ROUNDS, seasonOver } from '../career/league.js';
import { preloadArt, backdrop, button, crest, goTo, heroPortrait, hex, pressable, topBar } from './widgets.js';
import { stage } from './stage3d.js';

const ord = (n) => n + (['th', 'st', 'nd', 'rd'][n % 10 > 3 || (n % 100 > 10 && n % 100 < 14) ? 0 : n % 10]);

/** Home screen: the hero F17 (live 3D), the next league match, and the ways in to Career and Training. */
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
    this.leaving = false; this.input.enabled = true;
    this.cameras.main.fadeIn(140, 5, 8, 16);
    const bd = backdrop(this);
    topBar(this, 'F17 PRO ACADEMY', `${tier.name}   ·   SEASON ${career.season}`, gs.coins || 0);

    // ── Hero: 3D character with a card-style stat column ──────────────────
    const HX = 318, FEET = 652, HH = 520;
    const shade = this.add.graphics();
    shade.fillGradientStyle(0x050810, 0x050810, 0x050810, 0x050810, 0.85, 0, 0.85, 0); shade.fillRect(0, 80, 230, H - 80);
    const portrait = heroPortrait(this, HX, 400, 1.55);
    stage.show(this, { x: HX, y: FEET, h: HH, yaw: 0.25 }).then((ok) => {
      if (!ok || !this.sys.isActive()) return;
      portrait.setVisible(false);
      if (bd.img) this.tweens.add({ targets: bd.img, alpha: 0, duration: 260 });
    });
    this.add.zone(HX, 380, 250, 520).setInteractive({ useHandCursor: true }).on('pointerdown', () => { sfx.ensure(); sfx.click(); stage.spin(); stage.cheer(); });

    this.add.text(40, 96, String(gs.rating), { fontFamily: FONT, fontSize: '84px', color: '#fde047', stroke: '#000', strokeThickness: 6 });
    this.add.text(46, 190, 'OVR  ·  FORWARD', { fontFamily: FONT_R, fontSize: '11px', color: 'rgba(255,255,255,0.85)', letterSpacing: 3 });
    const st = gs.stats, bars = [['PAC', st.speed, 0x22c55e], ['SHO', st.shooting, 0xef4444], ['DRI', st.dribbling, 0x38bdf8], ['PAS', st.passing, 0xfacc15], ['DEF', st.defending, 0xc084fc], ['PHY', st.stamina, 0xfb923c]];
    const bg = this.add.graphics();
    bars.forEach(([lbl, v, col], i) => {
      const by = 228 + i * 50;
      this.add.text(44, by, String(v), { fontFamily: FONT, fontSize: '30px', color: '#ffffff', stroke: '#000', strokeThickness: 4 });
      this.add.text(88, by + 9, lbl, { fontFamily: FONT_R, fontSize: '12px', color: hex(col), letterSpacing: 3, stroke: '#000', strokeThickness: 3 });
      bg.fillStyle(0xffffff, 0.14); bg.fillRoundedRect(44, by + 37, 96, 5, 2);
      bg.fillStyle(col); bg.fillRoundedRect(44, by + 37, Math.max(5, 96 * v / 99), 5, 2);
    });
    this.add.text(44, 560, 'F17', { fontFamily: FONT, fontSize: '76px', color: '#ffffff', stroke: '#000', strokeThickness: 6 });
    this.add.text(46, 644, `#17   ·   ${tier.f17}`, { fontFamily: FONT_R, fontSize: '12px', color: 'rgba(255,255,255,0.8)', letterSpacing: 3 });
    const xf = Math.min(1, gs.xp / gs.xpNextLevel);
    bg.fillStyle(0x000000, 0.5); bg.fillRoundedRect(44, 670, 420, 14, 7);
    bg.fillStyle(0xfacc15); bg.fillRoundedRect(46, 672, Math.max(10, 416 * xf), 10, 5);
    this.add.text(464, 694, `XP ${gs.xp} / ${gs.xpNextLevel}  TO NEXT RATING`, { fontFamily: FONT_R, fontSize: '10px', color: 'rgba(255,255,255,0.6)', letterSpacing: 2 }).setOrigin(1, 0);

    // ── Next match ────────────────────────────────────────────────────────
    const nx = 506, ny = 92, nw = W - nx - 36, nh = 322;
    const band = this.add.graphics();
    band.fillStyle(0x000000, 0.4); band.fillRoundedRect(nx + 3, ny + 7, nw, nh, 18);
    band.fillGradientStyle(0x14532d, 0x0b1220, 0x0b3d1f, 0x0b1220, 0.96, 0.96, 0.96, 0.96); band.fillRoundedRect(nx, ny, nw, nh, 18);
    for (let i = 0; i < 9; i++) { band.fillStyle(0xffffff, i % 2 ? 0.035 : 0); band.fillRect(nx + 20 + i * ((nw - 40) / 9), ny + 46, (nw - 40) / 9, nh - 46); }
    band.fillStyle(0x000000, 0.4); band.fillRoundedRect(nx, ny, nw, 46, { tl: 18, tr: 18, bl: 0, br: 0 });
    band.fillStyle(0xfacc15); band.fillRoundedRect(nx, ny, nw, 5, { tl: 18, tr: 18, bl: 0, br: 0 });
    band.lineStyle(1.5, 0xffffff, 0.16); band.strokeRoundedRect(nx, ny, nw, nh, 18);
    const over = seasonOver(career);
    this.add.text(nx + 24, ny + 25, over ? 'SEASON COMPLETE' : 'NEXT MATCH', { fontFamily: FONT, fontSize: '20px', color: '#fde047' }).setOrigin(0, 0.5);
    this.add.text(nx + nw - 24, ny + 25, over ? tier.name : `${tier.name}   ·   MATCHDAY ${career.round + 1} OF ${ROUNDS}`, { fontFamily: FONT_R, fontSize: '12px', color: 'rgba(255,255,255,0.7)', letterSpacing: 3 }).setOrigin(1, 0.5);
    const cy = ny + 148;
    if (!over) {
      crest(this, nx + 124, cy, 66, teams[0]);
      this.add.text(nx + 124, cy + 92, teams[0].name, { fontFamily: FONT, fontSize: '22px', color: '#ffffff' }).setOrigin(0.5);
      crest(this, nx + nw - 124, cy, 66, fx.opp);
      this.add.text(nx + nw - 124, cy + 92, fx.opp.name, { fontFamily: FONT, fontSize: '22px', color: '#ffffff' }).setOrigin(0.5);
      this.add.text(nx + nw / 2, cy - 52, 'VS', { fontFamily: FONT, fontSize: '34px', color: 'rgba(255,255,255,0.4)' }).setOrigin(0.5);
      const play = button(this, nx + nw / 2, cy + 30, 300, 84, 'PLAY MATCH', { size: 38, sub: `YOU ARE ${ord(position(career)).toUpperCase()} IN THE TABLE`, onClick: () => this.go('Match') });
      const glow = this.add.image(nx + nw / 2, cy + 30, 'm_glow').setScale(1.5, 0.7).setTint(0x22c55e).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.35);
      this.children.moveBelow(glow, play);
      this.tweens.add({ targets: glow, alpha: 0.7, scaleX: 1.7, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    } else {
      const pos = position(career);
      this.add.text(nx + nw / 2, cy - 30, `YOU FINISHED ${ord(pos).toUpperCase()}`, { fontFamily: FONT, fontSize: '46px', color: pos <= 2 ? '#22c55e' : '#ffffff' }).setOrigin(0.5);
      button(this, nx + nw / 2, cy + 60, 320, 70, 'SEE SEASON RESULT', { size: 28, color: 0xfacc15, text: '#1a1200', onClick: () => this.go('Career') });
    }

    // ── Mode tiles ────────────────────────────────────────────────────────
    const my = ny + nh + 20, mh = H - my - 44, mw = (nw - 36) / 3;
    const tr = gs.training || {};
    const drillStars = ['shoot', 'dribble', 'pass'].reduce((a, k) => a + ((tr[k] && tr[k].stars) || 0), 0);
    const cards = [
      { t: 'CAREER', s: 'League table · Ladder', big: ord(position(career)).toUpperCase(), small: `${tier.short} LEAGUE`, col: 0x2563eb, to: 'Career' },
      { t: 'TRAINING', s: '3 drills · Coach F17', big: `${drillStars}/9`, small: 'STARS EARNED', col: 0x9333ea, to: 'Training' },
      { t: 'RECORD', s: `${gs.goals} goals · ${(gs.trophies || []).length} trophies`, big: `${gs.wins}-${gs.draws}-${gs.losses}`, small: 'WON · DRAWN · LOST', col: 0x0f766e, to: null },
    ];
    cards.forEach((c, i) => {
      const x = nx + i * (mw + 18);
      const g = this.add.graphics();
      const draw = (hover) => {
        g.clear();
        g.fillStyle(0x000000, 0.4); g.fillRoundedRect(-mw / 2 + 3, -mh / 2 + 7, mw, mh, 16);
        g.fillStyle(0x0b1220, 0.96); g.fillRoundedRect(-mw / 2, -mh / 2, mw, mh, 16);
        g.fillStyle(c.col, hover ? 0.5 : 0.3); g.fillRoundedRect(-mw / 2, -mh / 2, mw, mh, 16);
        g.fillStyle(0x000000, 0.28); g.fillRoundedRect(-mw / 2, 0, mw, mh / 2, { tl: 0, tr: 0, bl: 16, br: 16 });
        g.fillStyle(c.col); g.fillRoundedRect(-mw / 2, -mh / 2, mw, 6, { tl: 16, tr: 16, bl: 0, br: 0 });
        g.lineStyle(2, hover ? 0xfacc15 : 0xffffff, hover ? 0.95 : 0.14); g.strokeRoundedRect(-mw / 2, -mh / 2, mw, mh, 16);
      };
      draw(false);
      const L = -mw / 2 + 22;
      const items = [g,
        this.add.text(L, -mh / 2 + 20, c.t, { fontFamily: FONT, fontSize: '28px', color: '#ffffff' }),
        this.add.text(L, -mh / 2 + 56, c.s, { fontFamily: FONT_R, fontSize: '12px', color: 'rgba(255,255,255,0.65)' }),
        this.add.text(L, mh / 2 - 78, c.big, { fontFamily: FONT, fontSize: '46px', color: '#fde047' }),
        this.add.text(L, mh / 2 - 26, c.small, { fontFamily: FONT_R, fontSize: '10px', color: 'rgba(255,255,255,0.55)', letterSpacing: 3 }),
      ];
      if (c.to) items.push(this.add.text(mw / 2 - 18, 0, '›', { fontFamily: FONT, fontSize: '44px', color: 'rgba(255,255,255,0.5)' }).setOrigin(1, 0.5));
      const card = this.add.container(x + mw / 2, my + mh / 2, items).setSize(mw, mh);
      if (c.to) { card.setInteractive({ useHandCursor: true }); pressable(this, card, () => this.go(c.to), { hover: 1.025, onHover: draw }); }
    });

    // discreet save reset (two taps)
    const reset = this.add.text(W - 36, H - 12, 'RESET SAVE', { fontFamily: FONT_R, fontSize: '10px', color: 'rgba(255,255,255,0.3)', letterSpacing: 2 }).setOrigin(1, 1).setPadding(10, 8, 0, 0).setInteractive({ useHandCursor: true });
    let armed = false;
    reset.on('pointerup', () => {
      if (!armed) { armed = true; reset.setText('TAP AGAIN TO ERASE ALL PROGRESS').setColor('#ef4444'); this.time.delayedCall(3000, () => { armed = false; reset.setText('RESET SAVE').setColor('rgba(255,255,255,0.3)'); }); }
      else { GameState.reset(); this.scene.restart(); }
    });
    this.input.keyboard && this.input.keyboard.once('keydown-ENTER', () => this.go(over ? 'Career' : 'Match'));
  }

  go(key) { goTo(this, key); }
}
