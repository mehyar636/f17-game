import { EV, FONT, FONT_R, TEAM } from './config.js';
import { sfx } from './sfx.js';

const dk = (c) => (((c >> 16 & 255) * 0.42) << 16) | (((c >> 8 & 255) * 0.42) << 8) | ((c & 255) * 0.42 | 0);
const lum = (c) => (0.299 * (c >> 16 & 255) + 0.587 * (c >> 8 & 255) + 0.114 * (c & 255)) / 255;
const ord = (n) => n + (['th', 'st', 'nd', 'rd'][n % 10 > 3 || (n % 100 > 10 && n % 100 < 14) ? 0 : n % 10]);

/** HUD + touch controls + full-time card. Lives above the match; never scrolls. */
export class UIScene extends Phaser.Scene {
  constructor() { super('UI'); }

  create() {
    this.isTouch = this.sys.game.device.input.touch;
    this.input.addPointer(3);
    this.radarW = 132; this.radarH = 86;
    this.lastScore = [0, 0];
    this.radarDots = []; this.btns = []; this.joyId = -1;

    // Cinematic vignette (behind all HUD)
    this.vignette = this.add.image(0, 0, 'm_vignette').setOrigin(0).setAlpha(0.4);

    // Scoreboard
    this.scoreBg = this.add.graphics();
    this.crestH = this.add.text(0, 0, 'F', { fontFamily: FONT, fontSize: '13px', color: '#0b3d1f' }).setOrigin(0.5);
    this.crestA = this.add.text(0, 0, 'R', { fontFamily: FONT, fontSize: '13px', color: '#5a0a0a' }).setOrigin(0.5);
    this.homeT = this.add.text(0, 0, TEAM[0].short, { fontFamily: FONT, fontSize: '15px', color: '#ffffff' }).setOrigin(0.5);
    this.awayT = this.add.text(0, 0, TEAM[1].short, { fontFamily: FONT, fontSize: '15px', color: '#ffffff' }).setOrigin(0.5);
    this.scoreT = this.add.text(0, 0, '0 - 0', { fontFamily: FONT, fontSize: '30px', color: '#ffffff' }).setOrigin(0.5);
    this.clockT = this.add.text(0, 0, '00:00', { fontFamily: FONT, fontSize: '15px', color: '#f1c40f' }).setOrigin(0.5);
    this.halfT = this.add.text(0, 0, '1ST HALF', { fontFamily: FONT_R, fontSize: '10px', color: 'rgba(255,255,255,0.55)', letterSpacing: 2 }).setOrigin(0.5);
    this.liveDot = this.add.circle(0, 0, 4, 0x22c55e);
    this.tweens.add({ targets: this.liveDot, alpha: 0.25, duration: 700, yoyo: true, repeat: -1 });

    // Stamina + controlled player
    this.stamBg = this.add.graphics();
    this.stamFill = this.add.rectangle(0, 0, 120, 8, 0x22c55e).setOrigin(0, 0.5);
    this.stamLbl = this.add.text(0, 0, 'STAMINA', { fontFamily: FONT_R, fontSize: '10px', color: 'rgba(255,255,255,0.6)', letterSpacing: 2 }).setOrigin(0, 1);
    this.ctrlT = this.add.text(0, 0, '#10  MID', { fontFamily: FONT, fontSize: '16px', color: '#f1c40f' }).setOrigin(0, 1);
    // stars + active power-up chip (kids layer)
    this.starIcon = this.add.image(0, 0, 'm_star').setScale(0.28).setTint(0xfacc15);
    this.starT = this.add.text(0, 0, '0', { fontFamily: FONT, fontSize: '20px', color: '#fde047' }).setOrigin(0, 0.5);
    this.puBg = this.add.graphics().setVisible(false);
    this.puT = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '14px', color: '#ffffff' }).setOrigin(0, 0.5).setVisible(false);
    // objectives panel
    this.objBg = this.add.graphics();
    this.objTitle = this.add.text(0, 0, 'OBJECTIVES', { fontFamily: FONT_R, fontSize: '10px', color: 'rgba(255,255,255,0.55)', letterSpacing: 3 });
    this.objRows = [0, 1, 2].map(() => ({
      box: this.add.text(0, 0, '○', { fontFamily: FONT, fontSize: '15px', color: 'rgba(255,255,255,0.6)' }).setOrigin(0, 0.5),
      txt: this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '15px', color: '#ffffff' }).setOrigin(0, 0.5),
      prog: this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '14px', color: '#f1c40f' }).setOrigin(1, 0.5),
    }));
    // praise pop (separate from the big centre pop so they can overlap)
    this.praiseT = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '42px', color: '#fde047', stroke: '#1a1200', strokeThickness: 7 }).setOrigin(0.5).setAlpha(0);
    this.praiseSub = this.add.text(0, 0, '', { fontFamily: FONT_R, fontSize: '13px', color: '#ffffff', letterSpacing: 3, stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setAlpha(0);

    // Shot power
    this.powBg = this.add.graphics().setVisible(false);
    this.powFill = this.add.rectangle(0, 0, 1, 12, 0xf1c40f).setOrigin(0, 0.5).setVisible(false);
    this.powLbl = this.add.text(0, 0, 'POWER', { fontFamily: FONT, fontSize: '11px', color: '#ffffff', letterSpacing: 3 }).setOrigin(0.5, 1).setVisible(false);

    // Radar
    this.radarBg = this.add.graphics();
    for (let i = 0; i < 22; i++) this.radarDots.push(this.add.circle(0, 0, 3, 0xffffff));
    this.radarBall = this.add.circle(0, 0, 2.5, 0xffffff).setStrokeStyle(1, 0x000000, 0.8);

    // Centre pop
    this.popBand = this.add.rectangle(0, 0, 10, 100, 0x000000, 0.55).setAlpha(0);
    this.popT = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '64px', color: '#ffffff', stroke: '#000000', strokeThickness: 8 }).setOrigin(0.5).setAlpha(0);
    this.popSub = this.add.text(0, 0, '', { fontFamily: FONT_R, fontSize: '14px', color: '#f1c40f', letterSpacing: 4 }).setOrigin(0.5).setAlpha(0);

    // Hints / sound
    this.hintT = this.add.text(0, 0, 'WASD / ARROWS  move    SHIFT  sprint    SPACE (hold)  shoot    X  pass    Q  switch', {
      fontFamily: FONT_R, fontSize: '11px', color: 'rgba(255,255,255,0.42)', letterSpacing: 1,
    }).setOrigin(0.5, 1).setVisible(!this.isTouch);
    this.muteT = this.add.text(0, 0, 'SOUND ON', { fontFamily: FONT, fontSize: '11px', color: 'rgba(255,255,255,0.6)' })
      .setOrigin(1, 0).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => { sfx.ensure(); sfx.setMuted(!sfx.muted); this.muteT.setText(sfx.muted ? 'SOUND OFF' : 'SOUND ON'); });

    this.buildFullTime();
    this.buildIntro();
    if (this.isTouch) this.buildTouch();
    this.layout();
    this.scale.on('resize', this.layout, this);

    // Events from the match
    const ev = this.game.events;
    const h = {
      [EV.SCORE]: (hs, as, awayName) => {
        this.scoreT.setText(`${hs} - ${as}`);
        this.awayT.setText(TEAM[1].short).setColor(lum(TEAM[1].jersey) > 0.62 ? '#111827' : '#ffffff'); this.crestA.setText(TEAM[1].short[0]); void awayName;
        if (hs !== this.lastScore[0] || as !== this.lastScore[1]) this.tweens.add({ targets: this.scoreT, scale: 1.5, duration: 160, yoyo: true, ease: 'Back.out' });
        this.lastScore = [hs, as];
      },
      [EV.CLOCK]: (sec, half, state) => {
        const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
        this.clockT.setText(`${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`);
        this.halfT.setText(state === 'fulltime' ? 'FULL TIME' : state === 'halftime' ? 'HALF TIME' : half === 1 ? '1ST HALF' : '2ND HALF');
        this.liveDot.setVisible(state === 'play');
      },
      [EV.STAMINA]: (v) => { this.stamFill.setSize(Math.max(1, 120 * v), 8); this.stamFill.setFillStyle(v > 0.5 ? 0x22c55e : v > 0.25 ? 0xf59e0b : 0xef4444); },
      [EV.POWER]: (v) => {
        const on = v > 0;
        this.powBg.setVisible(on); this.powFill.setVisible(on); this.powLbl.setVisible(on);
        this.powFill.setSize(Math.max(1, 180 * v), 12);
        this.powFill.setFillStyle(v < 0.6 ? 0x22c55e : v < 0.85 ? 0xf1c40f : 0xef4444);
      },
      [EV.POP]: (p) => this.showPop(p),
      [EV.RADAR]: (dots, ball) => {
        const { x0, y0 } = this.radarOrigin();
        dots.forEach((d, i) => {
          const c = this.radarDots[i];
          c.setPosition(x0 + d.x * this.radarW, y0 + d.y * this.radarH);
          c.setFillStyle(d.ctrl ? 0xf1c40f : d.team === 0 ? 0x22c55e : 0xef4444);
          c.setRadius(d.ctrl ? 4 : 3);
        });
        this.radarBall.setPosition(x0 + ball.x * this.radarW, y0 + ball.y * this.radarH);
      },
      [EV.CONTROLLED]: (num, name) => this.ctrlT.setText(`#${num}  ${name}`).setColor(name === 'F17' ? '#fde047' : '#ffffff'),
      [EV.FULLTIME]: (r) => this.showFullTime(r),
      [EV.INTRO]: (d) => this.showIntro(d),
      [EV.PRAISE]: (p) => this.showPraise(p),
      [EV.STARS]: (total, gained) => {
        this.starT.setText(String(total));
        if (gained > 0) {
          this.tweens.killTweensOf([this.starT, this.starIcon]);
          this.tweens.add({ targets: [this.starT, this.starIcon], scale: { from: 1.6, to: 1 }, duration: 320, ease: 'Back.out' });
          this.starIcon.setScale(0.28); this.tweens.add({ targets: this.starIcon, scale: 0.28, angle: { from: -25, to: 0 }, duration: 320 });
        }
      },
      [EV.POWERUP]: (s) => {
        const on = !!s;
        this.puBg.setVisible(on); this.puT.setVisible(on);
        if (s) this.puT.setText(`${s.emoji} ${s.label}${s.t > 0 ? '  ' + Math.ceil(s.t) + 's' : ''}`).setColor(s.type === 'fire' ? '#fdba74' : '#fde047');
      },
      [EV.OBJ]: (list) => {
        list.forEach((o, i) => {
          const r = this.objRows[i]; if (!r) return;
          r.box.setText(o.done ? '✓' : '○').setColor(o.done ? '#22c55e' : 'rgba(255,255,255,0.6)');
          r.txt.setText(o.text.toUpperCase()).setColor(o.done ? '#86efac' : '#ffffff').setAlpha(o.done ? 0.85 : 1);
          r.prog.setText(o.done ? `+${o.coins}` : `${o.progress}/${o.target}`).setColor(o.done ? '#fde047' : '#f1c40f');
          if (o.done && !r.flashed) { r.flashed = true; this.tweens.add({ targets: [r.txt, r.box], scale: { from: 1.25, to: 1 }, duration: 350, ease: 'Back.out' }); }
          if (!o.done) r.flashed = false;
        });
      },
    };
    Object.entries(h).forEach(([k, fn]) => ev.on(k, fn));
    const reset = () => { this.ftPanel.setVisible(false); this.lastScore = [0, 0]; this.scoreT.setText('0 - 0'); };
    this.events.on('reset', reset);
    this.events.once('shutdown', () => { Object.entries(h).forEach(([k, fn]) => ev.off(k, fn)); this.scale.off('resize', this.layout, this); this.events.off('reset', reset); });
    if (this.input.keyboard) this.input.keyboard.on('keydown-ENTER', () => { if (this.ftPanel.visible) this.toMenu('Career'); });
  }

  restart() { sfx.click(); this.ftPanel.setVisible(false); this.lastScore = [0, 0]; this.game.events.emit(EV.RESTART); }
  toMenu(key) { sfx.click(); this.ftPanel.setVisible(false); this.game.events.emit(EV.MENU, key); }

  radarOrigin() {
    const { width: w, height: h } = this.scale;
    return { x0: w - 16 - this.radarW, y0: h - 16 - this.radarH - (this.isTouch ? 170 : 0) };
  }

  layout() {
    const { width: w, height: h } = this.scale;
    const compact = w < 700;
    this.vignette.setPosition(0, 0).setDisplaySize(w, h);

    // Broadcast scoreboard: [crest|F17] [ score ] [RIVALS|crest] + clock tab below
    const sw = compact ? 300 : 400, sh = 50, sx = w / 2 - sw / 2, sy = 10, tab = compact ? 80 : 120, mid = sw - tab * 2;
    const g = this.scoreBg; g.clear();
    g.fillStyle(0x000000, 0.55); g.fillRoundedRect(sx - 3, sy - 3, sw + 6, sh + 6, 8);
    g.fillStyle(dk(TEAM[0].jersey)); g.fillRoundedRect(sx, sy, tab, sh, { tl: 6, bl: 6, tr: 0, br: 0 });
    g.fillStyle(TEAM[0].jersey); g.fillRect(sx, sy, tab - 6, sh);
    g.fillStyle(0xffffff, 0.08); g.fillRect(sx, sy, tab - 6, sh / 2);
    g.fillStyle(dk(TEAM[1].jersey)); g.fillRoundedRect(sx + sw - tab, sy, tab, sh, { tl: 0, bl: 0, tr: 6, br: 6 });
    g.fillStyle(TEAM[1].jersey); g.fillRect(sx + sw - tab + 6, sy, tab - 6, sh);
    g.fillStyle(0xffffff, 0.08); g.fillRect(sx + sw - tab + 6, sy, tab - 6, sh / 2);
    g.fillStyle(0x070b14, 0.97); g.fillRect(sx + tab, sy, mid, sh);
    g.fillStyle(0xf1c40f); g.fillRect(sx + tab, sy + sh - 3, mid, 3);
    g.fillStyle(0xffffff, 0.06); g.fillRect(sx + tab, sy, mid, 1);
    // crests
    g.fillStyle(0xf1c40f); g.fillCircle(sx + 22, sy + sh / 2, 13); g.fillStyle(0xffffff, 0.25); g.fillCircle(sx + 19, sy + sh / 2 - 3, 6);
    g.fillStyle(0xffffff); g.fillCircle(sx + sw - 22, sy + sh / 2, 13); g.fillStyle(0xffffff, 0.35); g.fillCircle(sx + sw - 25, sy + sh / 2 - 3, 6);
    // clock tab
    const cw = 168, ch = 24, cy = sy + sh + 3;
    g.fillStyle(0x070b14, 0.95); g.fillRoundedRect(w / 2 - cw / 2, cy, cw, ch, { tl: 0, tr: 0, bl: 8, br: 8 });
    g.fillStyle(0xf1c40f, 0.6); g.fillRect(w / 2 - cw / 2, cy, cw, 1);
    this.crestH.setPosition(sx + 22, sy + sh / 2 + 1);
    this.crestA.setPosition(sx + sw - 22, sy + sh / 2 + 1);
    this.homeT.setPosition(sx + 42 + (tab - 48) / 2, sy + sh / 2).setFontSize(compact ? 18 : 22);
    this.awayT.setPosition(sx + sw - tab + 6 + (tab - 48) / 2, sy + sh / 2).setFontSize(compact ? 18 : 22);
    this.scoreT.setPosition(w / 2, sy + sh / 2 - 1).setFontSize(compact ? 30 : 36);
    this.clockT.setPosition(w / 2 - 34, cy + ch / 2).setFontSize(17);
    this.halfT.setPosition(w / 2 + 36, cy + ch / 2);
    this.liveDot.setPosition(w / 2 - 72, cy + ch / 2);

    const bx = 18, by = h - (this.isTouch ? 182 : 22);
    this.stamBg.clear();
    this.stamBg.fillStyle(0x000000, 0.55); this.stamBg.fillRoundedRect(bx - 8, by - 50, 176, 60, 10);
    this.stamBg.fillStyle(0xffffff, 0.12); this.stamBg.fillRoundedRect(bx, by - 4, 120, 8, 4);
    this.stamFill.setPosition(bx, by); this.stamLbl.setPosition(bx, by - 10); this.ctrlT.setPosition(bx, by - 24);
    this.starIcon.setPosition(bx + 128, by - 32); this.starT.setPosition(bx + 140, by - 32);
    // power-up chip above the stamina panel
    this.puBg.clear(); this.puBg.fillStyle(0x000000, 0.6); this.puBg.fillRoundedRect(bx - 8, by - 86, 200, 30, 8);
    this.puBg.fillStyle(0xf1c40f, 0.9); this.puBg.fillRect(bx - 8, by - 86, 4, 30);
    this.puT.setPosition(bx + 4, by - 71);
    // objectives (top-left)
    const ox = 14, oy = 14, ow = compact ? 210 : 250;
    this.objBg.clear(); this.objBg.fillStyle(0x000000, 0.55); this.objBg.fillRoundedRect(ox, oy, ow, 92, 10);
    this.objBg.fillStyle(0xf1c40f, 0.9); this.objBg.fillRect(ox, oy + 10, 3, 72);
    this.objTitle.setPosition(ox + 12, oy + 7);
    this.objRows.forEach((r, i) => { const ry = oy + 32 + i * 21; r.box.setPosition(ox + 12, ry); r.txt.setPosition(ox + 30, ry).setFontSize(compact ? 13 : 15); r.prog.setPosition(ox + ow - 10, ry); });
    // praise pop, above the big pop
    this.praiseT.setPosition(w / 2, h * 0.22);
    this.praiseSub.setPosition(w / 2, h * 0.22 + 34);

    const pw = 180, px = w / 2 - pw / 2, py = h - (this.isTouch ? 200 : 70);
    this.powBg.clear();
    this.powBg.fillStyle(0x000000, 0.6); this.powBg.fillRoundedRect(px - 8, py - 26, pw + 16, 46, 8);
    this.powBg.fillStyle(0xffffff, 0.12); this.powBg.fillRoundedRect(px, py - 6, pw, 12, 6);
    this.powFill.setPosition(px, py); this.powLbl.setPosition(w / 2, py - 10);

    const { x0, y0 } = this.radarOrigin();
    const r = this.radarBg; r.clear();
    r.fillStyle(0x000000, 0.6); r.fillRoundedRect(x0 - 8, y0 - 8, this.radarW + 16, this.radarH + 16, 8);
    r.fillStyle(0x14532d, 0.7); r.fillRect(x0, y0, this.radarW, this.radarH);
    r.lineStyle(1, 0xffffff, 0.55); r.strokeRect(x0, y0, this.radarW, this.radarH);
    r.lineBetween(x0 + this.radarW / 2, y0, x0 + this.radarW / 2, y0 + this.radarH);
    r.strokeCircle(x0 + this.radarW / 2, y0 + this.radarH / 2, 11);
    r.strokeRect(x0, y0 + this.radarH * 0.21, this.radarW * 0.165, this.radarH * 0.58);
    r.strokeRect(x0 + this.radarW * 0.835, y0 + this.radarH * 0.21, this.radarW * 0.165, this.radarH * 0.58);

    this.popBand.setPosition(w / 2, h * 0.36).setSize(w, 100);
    this.popT.setPosition(w / 2, h * 0.36);
    this.popSub.setPosition(w / 2, h * 0.36 + 48);
    this.hintT.setPosition(w / 2, h - 8);
    this.muteT.setPosition(w - 14, 14);
    this.ftPanel.setPosition(w / 2, h / 2);
    this.layoutTouch();
  }

  showPop(p) {
    const size = p.size || 'sm';
    this.tweens.killTweensOf([this.popT, this.popSub, this.popBand]);
    this.popT.setText(p.text).setFontSize(size === 'lg' ? 84 : size === 'md' ? 52 : 34)
      .setColor(p.text === 'GOAL!' ? '#f1c40f' : p.text === 'CONCEDED' ? '#ef4444' : '#ffffff').setScale(0.6).setAlpha(1);
    this.popSub.setText(p.sub || '').setAlpha(p.sub ? 1 : 0);
    this.popBand.setAlpha(size === 'sm' ? 0 : 1).setScale(1, 0.2);
    const hold = size === 'lg' ? 1900 : size === 'md' ? 1100 : 700;
    this.tweens.add({ targets: this.popT, scale: 1, duration: 260, ease: 'Back.out' });
    this.tweens.add({ targets: this.popBand, scaleY: 1, duration: 220, ease: 'Cubic.out' });
    this.tweens.add({ targets: [this.popT, this.popSub, this.popBand], alpha: 0, delay: hold, duration: 350 });
    if (p.text === 'GOAL!') this.tweens.add({ targets: this.popT, angle: { from: -3, to: 3 }, duration: 90, yoyo: true, repeat: 6 });
    else this.popT.setAngle(0);
  }

  /** Quick, bouncy praise ("NICE PASS!", "COMBO x3!") — separate from the big centre pop. */
  showPraise(p) {
    this.tweens.killTweensOf([this.praiseT, this.praiseSub]);
    this.praiseT.setText(p.text).setAlpha(1).setScale(0.5).setAngle(Phaser.Math.Between(-4, 4));
    this.praiseSub.setText(p.sub || '').setAlpha(p.sub ? 1 : 0);
    this.tweens.add({ targets: this.praiseT, scale: 1, duration: 260, ease: 'Back.out' });
    this.tweens.add({ targets: this.praiseT, y: this.praiseT.y - 10, duration: 900, ease: 'Sine.out', yoyo: false });
    this.tweens.add({ targets: [this.praiseT, this.praiseSub], alpha: 0, delay: 1000, duration: 300, onComplete: () => this.praiseT.setY(this.scale.height * 0.22) });
  }

  // ─── Match intro: team blocks slide in, VS badge, week / difficulty ───────
  buildIntro() {
    this.inBand = this.add.rectangle(0, 0, 4000, 150, 0x000000, 0.72);
    this.inHomeG = this.add.graphics(); this.inAwayG = this.add.graphics();
    this.inHome = this.add.container(0, 0, [this.inHomeG,
      this.add.text(0, -14, 'F17', { fontFamily: FONT, fontSize: '60px', color: '#ffffff', stroke: '#06240f', strokeThickness: 6 }).setOrigin(0.5),
      this.add.text(0, 32, 'PRO ACADEMY', { fontFamily: FONT_R, fontSize: '12px', color: 'rgba(255,255,255,0.75)', letterSpacing: 5 }).setOrigin(0.5)]);
    this.inAwayT = this.add.text(0, -14, 'RIVALS', { fontFamily: FONT, fontSize: '46px', color: '#ffffff', stroke: '#3a0606', strokeThickness: 6 }).setOrigin(0.5);
    this.inAway = this.add.container(0, 0, [this.inAwayG, this.inAwayT,
      this.add.text(0, 32, 'AWAY', { fontFamily: FONT_R, fontSize: '12px', color: 'rgba(255,255,255,0.75)', letterSpacing: 5 }).setOrigin(0.5)]);
    const vsG = this.add.graphics(); vsG.fillStyle(0x0b1220); vsG.fillCircle(0, 0, 34); vsG.lineStyle(3, 0xf1c40f); vsG.strokeCircle(0, 0, 34);
    this.inVs = this.add.container(0, 0, [vsG, this.add.text(0, 0, 'VS', { fontFamily: FONT, fontSize: '28px', color: '#f1c40f' }).setOrigin(0.5)]);
    this.inSub = this.add.text(0, 0, '', { fontFamily: FONT_R, fontSize: '13px', color: '#f1c40f', letterSpacing: 6 }).setOrigin(0.5);
    this.intro = this.add.container(0, 0, [this.inBand, this.inHome, this.inAway, this.inVs, this.inSub]).setVisible(false).setDepth(90);
    [this.inHomeG, this.inAwayG].forEach((g, i) => {
      const col = i === 0 ? TEAM[0].jersey : TEAM[1].jersey, dark = i === 0 ? 0x0b3d1f : dk(TEAM[1].jersey);
      g.fillStyle(dark); g.fillRect(-170, -55, 340, 110);
      g.fillStyle(col); g.fillRect(-164, -49, 328, 98);
      g.fillStyle(0xffffff, 0.08); g.fillRect(-164, -49, 328, 40);
      g.fillStyle(0xf1c40f); g.fillRect(i === 0 ? 150 : -164, -49, 14, 98);
    });
  }

  showIntro(d) {
    const { width: w, height: h } = this.scale;
    this.inAwayT.setText((d.away || 'RIVALS').toUpperCase()).setFontSize(d.away && d.away.length > 9 ? 36 : 46);
    this.inSub.setText(d.sub || '');
    this.intro.setVisible(true).setAlpha(1);
    this.inBand.setPosition(w / 2, h / 2);
    this.inHome.setPosition(-300, h / 2); this.inAway.setPosition(w + 300, h / 2);
    this.inVs.setPosition(w / 2, h / 2).setScale(0);
    this.inSub.setPosition(w / 2, h / 2 + 96).setAlpha(0);
    this.tweens.add({ targets: this.inHome, x: w / 2 - 230, duration: 520, ease: 'Cubic.out' });
    this.tweens.add({ targets: this.inAway, x: w / 2 + 230, duration: 520, ease: 'Cubic.out' });
    this.tweens.add({ targets: this.inVs, scale: 1, duration: 420, delay: 380, ease: 'Back.out' });
    this.tweens.add({ targets: this.inSub, alpha: 1, duration: 300, delay: 600 });
    this.tweens.add({ targets: this.intro, alpha: 0, duration: 400, delay: 2500, onComplete: () => this.intro.setVisible(false) });
    sfx.ensure();
  }

  buildFullTime() {
    const bg = this.add.rectangle(0, 0, 4000, 4000, 0x000000, 0.78).setInteractive();
    this.ftCard = this.add.graphics();
    this.ftTitle = this.add.text(0, -150, 'FULL TIME', { fontFamily: FONT_R, fontSize: '13px', color: 'rgba(255,255,255,0.6)', letterSpacing: 6 }).setOrigin(0.5);
    this.ftNames = this.add.text(0, -116, 'F17   vs   RIVALS', { fontFamily: FONT, fontSize: '14px', color: '#ffffff' }).setOrigin(0.5);
    this.ftRes = this.add.text(0, -70, 'DRAW', { fontFamily: FONT, fontSize: '46px', color: '#f1c40f', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5);
    this.ftScore = this.add.text(0, -8, '0  :  0', { fontFamily: FONT, fontSize: '50px', color: '#ffffff' }).setOrigin(0.5);
    this.ftInfo = this.add.text(0, 44, '', { fontFamily: FONT_R, fontSize: '13px', color: 'rgba(255,255,255,0.5)' }).setOrigin(0.5);
    this.ftRating = this.add.text(0, 70, '', { fontFamily: FONT, fontSize: '16px', color: '#ffd700' }).setOrigin(0.5);
    // kids: 3 big stars + coins + objectives summary
    this.ftStars = [0, 1, 2].map(i => this.add.image(-60 + i * 60, -118, 'm_star').setScale(0.95).setTint(0x334155));
    this.ftCoinIcon = this.add.image(-40, 118, 'm_coin').setScale(0.6);
    this.ftCoins = this.add.text(-24, 118, '+0 COINS', { fontFamily: FONT, fontSize: '20px', color: '#fde047' }).setOrigin(0, 0.5);
    this.ftObjs = this.add.text(-270, 150, '', { fontFamily: FONT_R, fontSize: '12px', color: 'rgba(255,255,255,0.7)', lineSpacing: 2 }).setOrigin(0, 0.5);
    const mkBtn = (x, label, color, tc, cb) => {
      const bbg = this.add.graphics(); bbg.fillStyle(color); bbg.fillRoundedRect(-110, -26, 220, 52, 26);
      const bt = this.add.text(0, 0, label, { fontFamily: FONT, fontSize: '15px', color: tc }).setOrigin(0.5);
      const c = this.add.container(x, 140, [bbg, bt]).setSize(232, 56).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => { sfx.ensure(); c.setScale(0.94); }).on('pointerup', () => { c.setScale(1); cb(); })
        .on('pointerover', () => c.setScale(1.05)).on('pointerout', () => c.setScale(1));
      return c;
    };
    const b1 = mkBtn(-125, 'CONTINUE', 0x22c55e, '#04170a', () => this.toMenu('Career'));
    const b2 = mkBtn(125, 'MAIN MENU', 0x1f2937, '#ffffff', () => this.toMenu('Menu'));
    // vertical layout inside a 600×460 card (y from -230 to 230)
    this.ftTitle.setY(-206); this.ftNames.setY(-130); this.ftRes.setY(-86); this.ftScore.setY(-30);
    this.ftInfo.setY(22); this.ftRating.setY(46);
    this.ftStars.forEach((s, i) => s.setPosition(-64 + i * 64, -168));
    this.ftCoinIcon.setPosition(-46, 104); this.ftCoins.setPosition(-30, 104);
    this.ftObjs.setPosition(-276, 150);
    b1.setY(206); b2.setY(206);
    this.ftPanel = this.add.container(0, 0, [bg, this.ftCard, this.ftTitle, this.ftNames, this.ftRes, this.ftScore, this.ftInfo, this.ftRating,
      ...this.ftStars, this.ftCoinIcon, this.ftCoins, this.ftObjs, b1, b2]).setVisible(false).setDepth(100);
  }

  showFullTime(r) {
    const col = r.won ? 0x22c55e : r.drew ? 0xf1c40f : 0xef4444;
    const c = this.ftCard; c.clear();
    c.fillStyle(0x0b1220, 0.98); c.fillRoundedRect(-300, -230, 600, 460, 20);
    c.lineStyle(2, col, 0.9); c.strokeRoundedRect(-300, -230, 600, 460, 20);
    c.fillStyle(col); c.fillRoundedRect(-300, -230, 600, 6, { tl: 20, tr: 20, bl: 0, br: 0 });
    c.fillStyle(0xffffff, 0.06); c.fillRoundedRect(-210, 72, 420, 9, 4);
    c.fillStyle(0xffd700); c.fillRoundedRect(-210, 72, Math.max(6, Math.round(420 * (r.xpFrac || 0))), 9, 4);
    c.fillStyle(0xffffff, 0.05); c.fillRoundedRect(-284, 124, 568, 54, 10);
    this.ftNames.setText(`${TEAM[0].name}   vs   ${r.awayName || 'RIVALS'}`);
    this.ftRes.setText(r.won ? 'VICTORY!' : r.drew ? 'DRAW' : 'DEFEAT').setColor(r.won ? '#22c55e' : r.drew ? '#f1c40f' : '#ef4444');
    this.ftScore.setText(`${r.home}  :  ${r.away}`);
    this.ftInfo.setText(`YOUR GOALS: ${r.userGoals}      XP EARNED: +${r.xp}      STARS COLLECTED: ${r.stars ?? 0}`);
    this.ftRating.setText(r.league ? `${r.league.name}:  ${ord(r.league.position)} PLACE  ·  ${r.league.points} PTS${r.league.seasonOver ? '  ·  SEASON OVER' : ''}` : `FRIENDLY  ·  RATING ${r.rating}`);
    this.ftCoins.setText(`+${r.coins || 0} COINS`);
    const objs = r.objectives || [];
    this.ftObjs.setText(objs.map(o => `${o.done ? '✓' : '○'}  ${o.text.toUpperCase()}${o.done ? '   +' + o.coins : ''}`).join('\n'));
    // stars light up one by one
    const n = r.starRating || 1;
    this.ftStars.forEach((s, i) => {
      s.setTint(0x334155).setScale(0.95);
      if (i < n) this.time.delayedCall(1500 + i * 350, () => {
        s.setTint(0xfacc15);
        this.tweens.add({ targets: s, scale: { from: 1.8, to: 1.05 }, angle: { from: -30, to: 0 }, duration: 380, ease: 'Back.out' });
        sfx.star();
      });
    });
    this.ftPanel.setVisible(true).setAlpha(0);
    this.tweens.add({ targets: this.ftPanel, alpha: 1, duration: 500, delay: 1200 });
  }

  buildTouch() {
    this.joyBase = this.add.circle(0, 0, 58, 0xffffff, 0.12).setStrokeStyle(2, 0xffffff, 0.35).setVisible(false);
    this.joyKnob = this.add.circle(0, 0, 26, 0xffffff, 0.5).setVisible(false);
    const mkBtn = (name, label, r, color) => {
      const bg = this.add.circle(0, 0, r, color, 0.82).setStrokeStyle(3, 0xffffff, 0.5);
      const t = this.add.text(0, 0, label, { fontFamily: FONT, fontSize: `${Math.round(r * 0.36)}px`, color: '#ffffff' }).setOrigin(0.5);
      // generous circular hit area; the button is released only by the finger that pressed it
      const c = this.add.container(0, 0, [bg, t]).setSize(r * 2, r * 2).setInteractive(new Phaser.Geom.Circle(r, r, r + 14), Phaser.Geom.Circle.Contains);
      let by = -1;
      const send = (down) => { sfx.ensure(); bg.setAlpha(down ? 1 : 0.82); c.setScale(down ? 0.9 : 1); this.game.events.emit(EV.TOUCH, { type: 'btn', name, down }); };
      c.on('pointerdown', (p) => { by = p.id; send(true); });
      const up = (p) => { if (by === p.id) { by = -1; send(false); } };
      c.on('pointerup', up); c.on('pointerout', up); this.input.on('pointerup', up); this.input.on('pointerupoutside', up);
      this.btns.push({ c, name });
    };
    mkBtn('shoot', 'SHOOT', 50, 0xdc2626); mkBtn('pass', 'PASS', 40, 0x2563eb);
    mkBtn('sprint', 'SPRINT', 34, 0xca8a04); mkBtn('switch', 'SWITCH', 28, 0x475569);

    this.input.on('pointerdown', (p) => {
      if (p.x > this.scale.width * 0.5 || this.joyId !== -1 || this.ftPanel.visible) return;
      sfx.ensure(); this.joyId = p.id;
      this.joyBase.setPosition(p.x, p.y).setVisible(true); this.joyKnob.setPosition(p.x, p.y).setVisible(true);
    });
    this.input.on('pointermove', (p) => {
      if (p.id !== this.joyId) return;
      let dx = p.x - this.joyBase.x, dy = p.y - this.joyBase.y;
      const m = Math.hypot(dx, dy), R = 58;
      if (m > R) { dx = dx / m * R; dy = dy / m * R; }
      this.joyKnob.setPosition(this.joyBase.x + dx, this.joyBase.y + dy);
      // radial dead zone, then full speed from 60% of the throw so small thumbs still sprint in a straight line
      const mag = Math.min(1, m / R), out = mag < 0.14 ? 0 : Math.min(1, (mag - 0.14) / 0.46);
      this.game.events.emit(EV.TOUCH, { type: 'axis', x: (dx / (mag * R || 1)) * out, y: (dy / (mag * R || 1)) * out });
    });
    const end = (p) => {
      if (p.id !== this.joyId) return;
      this.joyId = -1; this.joyBase.setVisible(false); this.joyKnob.setVisible(false);
      this.game.events.emit(EV.TOUCH, { type: 'axis', x: 0, y: 0 });
    };
    this.input.on('pointerup', end); this.input.on('pointerupoutside', end);
  }

  layoutTouch() {
    if (!this.isTouch) return;
    const { width: w, height: h } = this.scale;
    const pos = { shoot: [w - 72, h - 84], pass: [w - 170, h - 60], sprint: [w - 150, h - 150], switch: [w - 62, h - 186] };
    this.btns.forEach(b => b.c.setPosition(pos[b.name][0], pos[b.name][1]));
  }
}
