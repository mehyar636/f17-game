import {
  AWAY, BALL_R, BOX_H, BOX_W, CIRCLE_R, CONTROL_RADIUS, CX, CY, DIFFICULTY, DRIBBLE_OFFSET, EV, FORMATION,
  GOAL_D, GOAL_W, HOME, KIDS, MARGIN, OBJECTIVE_POOL, PASS_SPEED, PEN_SPOT, PITCH_H, PITCH_W, PLAYER_SPEED,
  POST_R, POWERUPS, PX, PY, SHIRT_NUMBERS, SHOT_CHARGE_TIME, SHOT_MAX, SHOT_MIN, SIX_H, SIX_W, SPRINT_MULT, TACKLE_RATE,
  VIEW_WIDTH_TARGET, WORLD_H, WORLD_W, ZOOM_MAX, ZOOM_MIN,
  setTeams,
} from './config.js';
import { Ball } from './ball.js';
import { Player } from './player.js';
import { Controls } from './controls.js';
import { bestPass, updateAI } from './ai.js';
import { generateTextures, R } from './textures.js';
import { sfx } from './sfx.js';
import { buildPitch, buildStadium } from './pitch.js';
import { F17_NUMBERS, F17_SQUAD, HERO_SLOT, TIERS, squadNames, teamsOf } from '../data/teams.js';
import { ensureCareer, nextFixture, playRound } from '../career/league.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const GS = () => (typeof GameState !== 'undefined' ? GameState : {
  data: { difficulty: 'rookie', week: 1, stats: {}, rating: 62, xp: 0, xpNextLevel: 100, goals: 0, coins: 0, playerName: 'You' }, addXP() {}, save() {},
});
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** The match. Kid-friendly layer: assists, walls, power-ups, praise, stars, objectives, rubber-banding. */
export class MatchScene extends Phaser.Scene {
  constructor() { super('Match'); }

  // ─── Context used by the AI ───────────────────────────────────────────────
  attackDir(team) { return team === HOME ? 1 : -1; }
  oppGoal(team) { return { x: this.attackDir(team) > 0 ? PX + PITCH_W : PX, y: CY }; }
  ownGoal(team) { return { x: this.attackDir(team) > 0 ? PX : PX + PITCH_W, y: CY }; }

  kick(p, dx, dy, speed, lift = 0) {
    this.ball.lastTouch = p;
    this.ball.kick(dx, dy, speed, lift);
    p.kickCooldown = 0.38;
    p.triggerKick(speed > 780 || lift > 200 ? 'shoot' : 'pass');
    p.facing = Math.atan2(dy, dx);
    this.receiver = null;
    sfx.kick(Phaser.Math.Clamp(speed / SHOT_MAX, 0.15, 1));
  }

  passTo(p, mate) {
    const d = dist(p, mate);
    const t = d / PASS_SPEED;
    const err = p.controlled ? (1 - this.user.passing) * 30 : 0;
    const tx = mate.x + mate.vx * t * 0.75 + (Math.random() - 0.5) * err;
    const ty = mate.y + mate.vy * t * 0.75 + (Math.random() - 0.5) * err;
    this.kick(p, tx - p.x, ty - p.y, Phaser.Math.Clamp(d * 1.5, 380, 740), 0);
    this.receiver = mate;
    mate.decisionT = 0;
    if (p.controlled) this.pendingPass = { to: mate, t: 3 };
    if (p.team === this.userTeam && !mate.isGK) { this.setControlled(mate); this.switchT = 1.4; }
  }

  shoot(p, power, aimY = 0, aimX = 0) {
    const goal = this.oppGoal(p.team);
    let ty, acc, speed, lift;
    // aiming away from the goal: the ball goes exactly where you point (clearance / long ball)
    if (p.controlled && Math.hypot(aimX, aimY) > 0.3) {
      const m = Math.hypot(aimX, aimY), ax = aimX / m, ay = aimY / m, gd = Math.hypot(goal.x - p.x, goal.y - p.y) || 1;
      const toGoal = ((goal.x - p.x) * ax + (goal.y - p.y) * ay) / gd;
      if (toGoal < 0.55 && !this.fireReady) {
        this.cameras.main.shake(90, 0.0025 * power);
        this.kick(p, ax, ay, Phaser.Math.Linear(SHOT_MIN, SHOT_MAX, power) * this.user.power, 60 + power * 260);
        this.showTarget(false); return;
      }
    }
    const isSuper = p.controlled && (this.fireReady || (this.kids.superOnFull && power >= 0.98));
    if (p.controlled) {
      // aim assist: pick the corner away from the keeper unless the kid is steering up/down
      const gk = this.players.find(q => q.team !== p.team && q.isGK);
      const corner = gk ? (gk.y > CY ? -1 : 1) : (Math.random() < 0.5 ? -1 : 1);
      const assistY = CY + corner * (GOAL_W / 2 - 30);
      let wantY = assistY;
      if (Math.hypot(aimX, aimY) > 0.3) {
        // follow the aim: where the pointed line meets the goal line, kept just inside the posts
        const dxg = goal.x - p.x, hit = Math.abs(aimX) > 0.05 && Math.sign(aimX) === Math.sign(dxg) ? p.y + (aimY / aimX) * dxg : CY + Math.sign(aimY) * GOAL_W;
        wantY = Phaser.Math.Clamp(hit, CY - GOAL_W / 2 + 26, CY + GOAL_W / 2 - 26);
      }
      ty = wantY;
      acc = this.user.accuracy * (1 - this.kids.aimAssist * 0.7);
      ty += (Math.random() - 0.5) * GOAL_W * (0.35 + power * 0.5) * acc;
      speed = Phaser.Math.Linear(SHOT_MIN, SHOT_MAX, power) * this.user.power;
      lift = isSuper ? 30 : 50 + power * power * 380 * Math.random() * (1 - this.kids.aimAssist * 0.5);
      this.lastShot = { t: 2.5, p, isSuper };
    } else {
      acc = p.team === this.userTeam ? 1.3 : this.diff.aiAcc;
      ty = goal.y + (Math.random() - 0.5) * GOAL_W * (0.35 + power * 0.55) * acc;
      speed = Phaser.Math.Linear(SHOT_MIN, SHOT_MAX, power);
      lift = 60 + power * power * 560 * Math.random();
    }
    if (isSuper) {
      speed *= 1.28; this.fireReady = false; this.ball.fire = true;
      this.praise('SUPER SHOT!', 'UNSTOPPABLE'); sfx.superShot();
      this.cameras.main.shake(160, 0.006); this.hitStop = 0.09;
    } else {
      this.cameras.main.shake(90, 0.0025 * power);
      if (power > 0.7) this.hitStop = 0.05;
    }
    this.kick(p, goal.x - p.x, ty - p.y, speed, lift);
    this.showTarget(false);
  }

  // ─── Setup ────────────────────────────────────────────────────────────────
  init() {
    const career = ensureCareer(GS());
    const gs = GS().data;
    this.tier = TIERS[career.tier];
    const fx = nextFixture(career);
    const teams = teamsOf(career.tier);
    this.friendly = !fx;                                   // season finished → friendly, nothing recorded
    this.opp = fx ? fx.opp : teams[1 + Math.floor(Math.random() * (teams.length - 1))];
    this.matchday = fx ? fx.round + 1 : 0;
    setTeams(teams[0], this.opp);
    const level = DIFFICULTY[gs.difficulty] ? gs.difficulty : 'rookie';
    this.diffBase = { ...DIFFICULTY[level] };
    this.diffBase.aiSpeed *= 0.94 + this.opp.strength * 0.08;   // stronger clubs are quicker
    this.diff = { ...this.diffBase };
    this.kids = KIDS[level];
    this.clockScale = (45 * 60) / this.kids.halfSeconds;
    const st = gs.stats || {};
    const n = (v, d) => (typeof v === 'number' ? v : d);
    this.user = {
      speed: 0.9 + (n(st.speed, 65) - 50) / 100 * 0.4,
      accuracy: 0.98 - n(st.shooting, 60) / 100 * 0.45,
      power: 0.92 + n(st.shooting, 60) / 100 * 0.16,
      stamina: 1.3 - n(st.stamina, 70) / 100 * 0.6,
      shield: Math.min(0.95 - n(st.dribbling, 63) / 100 * 0.45, this.kids.shield),
      passing: n(st.passing, 58) / 100,
      tackle: 0.75 + n(st.defending, 45) / 100 * 0.6,
    };
    this.awayName = this.opp.name;
    // objectives
    const week = gs.week || 1;
    const goalObj = week <= 2 ? 'goal1' : pick(['goal1', 'goal2']);
    const skillObj = pick(week > 3 ? ['pass5', 'pass10', 'tackle2', 'shots3'] : ['pass5', 'tackle2', 'shots3']);
    const bonusObj = this.kids.powerups ? pick(['super1', 'power2', 'win']) : 'win';
    this.objectives = [goalObj, skillObj, bonusObj].map(id => ({ ...OBJECTIVE_POOL.find(o => o.id === id), done: false }));
    this.stats = { goals: 0, passes: 0, tackles: 0, shotsOn: 0, superGoals: 0, powerups: 0, win: 0 };
  }

  preload() {
    if (this.textures.exists('m_grass')) return;
    const { width: w, height: h } = this.scale;
    const t = this.add.text(w / 2, h / 2 - 30, 'LOADING STADIUM', { fontFamily: 'Arial Black', fontSize: '18px', color: '#f1c40f', letterSpacing: 4 }).setOrigin(0.5);
    const bar = this.add.graphics();
    this.load.on('progress', (v) => {
      bar.clear();
      bar.fillStyle(0xffffff, 0.08); bar.fillRoundedRect(w / 2 - 130, h / 2, 260, 8, 4);
      bar.fillStyle(0x22c55e); bar.fillRoundedRect(w / 2 - 130, h / 2, Math.max(8, 260 * v), 8, 4);
    });
    this.load.on('complete', () => { t.destroy(); bar.destroy(); });
    this.load.image('m_grass', 'game/assets/grass.png');
    this.load.image('m_crowd', 'game/assets/crowd.png');
    this.load.image('m_stadium', 'game/assets/stadium.png');
  }

  create() {
    generateTextures(this);
    this.players = []; this.controlled = null; this.receiver = null; this.restartLock = null;
    this.state = 'kickoff'; this.stateT = 0; this.half = 1; this.clock = 0; this.score = [0, 0];
    this.userTeam = HOME; this.userGoals = 0;
    this.charging = false; this.power = 0; this.switchT = 0; this.radarT = 0;
    this.camC = { x: CX, y: CY }; this.zoomBase = 1; this.concededBy = AWAY; this.introDone = false;
    this.timeScale = 1; this.hitStop = 0;
    // kids layer state
    this.stars = 0; this.combo = 0; this.pendingPass = null; this.lastShot = null;
    this.powerups = []; this.puSpawnT = 10; this.boostT = 0; this.fireReady = false; this.lastPU = null;
    this.dashT = 0; this.dashCool = 0; this.bufPass = 0; this.bufShot = null;
    this.aim3d = { on: false, x: 0, y: 0, dx: 1, dy: 0, power: 0 };
    this.hintsShown = 0; this.hintCool = 0; this.rubberT = 6; this.coinsEarned = 0;

    this.flashEms = buildStadium(this, { walls: this.kids.walls, mood: this.tier.mood }).flashEms;
    buildPitch(this);
    const oppNames = squadNames(this.opp);
    for (let team = 0; team < 2; team++) {
      const d = this.attackDir(team);
      FORMATION.forEach((f, i) => {
        const x = CX + f.x * (PITCH_W / 2 - 70) * d, y = CY + f.y * (PITCH_H / 2 - 70);
        const names = team === HOME ? F17_SQUAD : oppNames, nums = team === HOME ? F17_NUMBERS : SHIRT_NUMBERS;
        this.players.push(new Player(this, team, i, f.role, nums[i], x, y).setIdentity(names[i], team === HOME && i === HERO_SLOT));
      });
    }
    this.ball = new Ball(this, CX, CY);
    this.ball.fire = false;

    // FX emitters
    this.confetti = this.add.particles(0, 0, 'm_particle', {
      speed: { min: 160, max: 560 }, angle: { min: 180, max: 360 }, gravityY: 700,
      lifespan: { min: 900, max: 1700 }, scale: { start: 0.45, end: 0.1 }, rotate: { min: 0, max: 720 },
      tint: [0x22c55e, 0xf1c40f, 0xffffff, 0x60a5fa, 0xf472b6], quantity: 1, emitting: false,
    }).setDepth(6000);
    this.dustEm = this.add.particles(0, 0, 'm_dust', {
      speed: { min: 10, max: 45 }, angle: { min: 0, max: 360 }, lifespan: { min: 350, max: 650 },
      scale: { start: 0.17, end: 0.47 }, alpha: { start: 0.35, end: 0 }, tint: 0xd9e6c8, quantity: 1, emitting: false,
    }).setDepth(2);
    this.puff = (x, y, n = 1) => this.dustEm.explode(n, x, y);
    this.fireEm = this.add.particles(0, 0, 'm_fire', {
      speed: { min: 10, max: 60 }, angle: { min: 0, max: 360 }, lifespan: { min: 220, max: 420 },
      scale: { start: 0.55, end: 0.05 }, alpha: { start: 0.9, end: 0 }, tint: [0xffb703, 0xfb5607, 0xffffff, 0xff006e],
      blendMode: 'ADD', quantity: 1, emitting: false,
    }).setDepth(4000);
    this.sparkEm = this.add.particles(0, 0, 'm_star', {
      speed: { min: 20, max: 90 }, angle: { min: 0, max: 360 }, lifespan: { min: 300, max: 600 }, gravityY: 120,
      scale: { start: 0.35, end: 0 }, alpha: { start: 1, end: 0 }, tint: [0xfacc15, 0xffffff, 0xfde68a], rotate: { min: 0, max: 360 },
      blendMode: 'ADD', quantity: 1, emitting: false,
    }).setDepth(4001);
    this.starBurst = this.add.particles(0, 0, 'm_star', {
      speed: { min: 120, max: 320 }, angle: { min: 0, max: 360 }, lifespan: { min: 500, max: 900 }, gravityY: 300,
      scale: { start: 0.55, end: 0 }, tint: [0xfacc15, 0xffffff], rotate: { min: 0, max: 720 }, blendMode: 'ADD', quantity: 1, emitting: false,
    }).setDepth(6001);
    this.target = this.add.image(0, 0, 'm_target').setScale(1 / R).setDepth(3).setVisible(false).setAlpha(0.9);

    this.controls = new Controls(this);
    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_W, WORLD_H);
    cam.setBackgroundColor('#05070c');
    this.onResize(this.scale.gameSize);
    this.scale.on('resize', this.onResize, this);
    cam.centerOn(CX, CY);

    // 3D broadcast view (loaded on demand; the 2D view stays as the fallback)
    this.view3d = null;
    if (!new URLSearchParams(location.search).has('2d')) {
      this.cameras.main.setVisible(false);
      import('./view3d.js').then(({ View3D }) => {
        if (!this.sys.isActive()) return;
        const v = new View3D(this);
        this.view3d = v;
        v.loaded.catch((e) => { console.warn('3D players unavailable, using 2D:', e); v.destroy(); this.view3d = null; this.cameras.main.setVisible(true); });
        this.events.once('shutdown', () => { v.destroy(); this.view3d = null; });
      }).catch((e) => { console.warn('3D view unavailable, using 2D:', e); this.cameras.main.setVisible(true); });
    }

    const wake = () => sfx.ensure();
    this.input.on('pointerdown', wake);
    if (this.input.keyboard) this.input.keyboard.on('keydown', wake);

    if (!this.scene.isActive('UI')) this.scene.launch('UI');
    else this.scene.get('UI').events.emit('reset');

    const onRestart = () => this.scene.restart();
    const onMenu = (key) => { this.scene.stop('UI'); this.scene.start(key || 'Menu'); };
    this.game.events.on(EV.RESTART, onRestart);
    this.game.events.on(EV.MENU, onMenu);
    this.events.once('shutdown', () => {
      this.game.events.off(EV.RESTART, onRestart);
      this.game.events.off(EV.MENU, onMenu);
      this.scale.off('resize', this.onResize, this);
    });

    this.time.delayedCall(60, () => {
      this.game.events.emit(EV.SCORE, 0, 0, this.awayName);
      this.game.events.emit(EV.OBJ, this.objectives.map(o => ({ ...o, progress: 0 })));
      this.game.events.emit(EV.STARS, 0, 0);
      this.game.events.emit(EV.POWERUP, null);
    });
    this.kickoff(HOME, 'KICK OFF');
  }

  onResize(size) {
    this.zoomBase = Phaser.Math.Clamp(Math.min(size.width / VIEW_WIDTH_TARGET, size.height / 640), ZOOM_MIN, ZOOM_MAX);
    this.cameras.main.setZoom(this.zoomBase);
  }

  crowdFlashBurst(ms = 2500) {
    this.flashEms.forEach(e => e.setFrequency(40));
    this.time.delayedCall(ms, () => this.flashEms.forEach(e => e.setFrequency(260)));
  }

  // ─── Flow ─────────────────────────────────────────────────────────────────
  kickoff(team, label) {
    this.state = 'kickoff'; this.stateT = 1.4;
    this.restartLock = null; this.receiver = null; this.charging = false; this.power = 0;
    this.pendingPass = null; this.combo = 0; this.ball.fire = false; this.showTarget(false);
    for (const p of this.players) {
      const d = this.attackDir(p.team);
      let x = p.homeX, y = p.homeY;
      if (p.team === team) { if (d * (x - CX) > -60) x = CX - d * 60 - d * Math.abs(p.homeY - CY) * 0.15; }
      else if (d * (x - CX) > -CIRCLE_R - 30) x = CX - d * (CIRCLE_R + 30);
      if (p.team === team && p.idx === 9) { x = CX - d * 20; y = CY; }
      p.setPosition(x, y); p.vx = 0; p.vy = 0; p.kickCooldown = 0; p.decisionT = Math.random() * 0.4;
      p.facing = d > 0 ? 0 : Math.PI; p.lockFacing = false; p.celebT = 0;
    }
    this.ball.place(CX, CY);
    const kicker = this.players.find(p => p.team === team && p.idx === 9);
    this.takeBall(kicker);
    kicker.decisionT = 0.2;
    if (this.userTeam === team) this.setControlled(kicker);
    else this.setControlled(this.players.find(p => p.team === this.userTeam && p.idx === 6));
    this.camC.x = CX; this.camC.y = CY;
    if (!this.introDone) {
      this.introDone = true;
      this.stateT = 3.2;
      const sub = this.friendly ? 'FRIENDLY MATCH' : `${this.tier.name}   ·   MATCHDAY ${this.matchday} OF 5`;
      this.time.delayedCall(80, () => this.game.events.emit(EV.INTRO, { away: this.awayName, sub }));
      this.time.delayedCall(2600, () => sfx.whistle(1));
    } else {
      this.game.events.emit(EV.POP, { text: label, sub: this.half === 2 ? 'SECOND HALF' : undefined, size: 'md' });
      sfx.whistle(1);
    }
  }

  setControlled(p) {
    if (this.controlled === p) return;
    if (this.controlled) this.controlled.setControlled(false);
    this.controlled = p;
    if (p) { p.setControlled(true); this.game.events.emit(EV.CONTROLLED, p.num, p.name || p.role); }
  }

  takeBall(p) {
    const wasPending = this.pendingPass;
    this.ball.owner = p; this.ball.lastTouch = p;
    this.ball.z = 0; this.ball.vz = 0; this.ball.vx = p.vx; this.ball.vy = p.vy;
    this.ball.fire = false;
    p.decisionT = 0; this.receiver = null;
    if (p.team === this.userTeam) {
      if (wasPending) { this.pendingPass = null; this.passCompleted(p); }
      if (!p.isGK) { this.setControlled(p); this.switchT = 0.5; }
    } else { this.pendingPass = null; this.combo = 0; }
  }

  nearestTo(x, y, team, excludeGK = true, exclude = null) {
    let best = null, bd = 1e9;
    for (const p of this.players) {
      if (p.team !== team || (excludeGK && p.isGK) || p === exclude) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  pop(text, size = 'sm', sub) { this.game.events.emit(EV.POP, { text, size, sub }); }
  praise(text, sub) { this.game.events.emit(EV.PRAISE, { text, sub }); }

  // ─── Kids layer: stars / objectives / power-ups ───────────────────────────
  addStars(n, atX, atY) {
    const before = this.stars;
    this.stars += n;
    if (this.kids.powerups && !this.fireReady && Math.floor(this.stars / 10) > Math.floor(before / 10)) {
      this.fireReady = true;
      this.time.delayedCall(900, () => { this.praise('STAR POWER!', 'FIRE SHOT READY'); sfx.powerup(); });
    }
    this.game.events.emit(EV.STARS, this.stars, n);
    if (atX !== undefined) this.starBurst.explode(Math.min(14, 4 + n * 3), atX, atY);
  }

  bump(stat, n = 1) {
    this.stats[stat] += n;
    let changed = false;
    for (const o of this.objectives) {
      if (!o.done && this.stats[o.stat] >= o.target) {
        o.done = true; changed = true; this.coinsEarned += o.coins;
        this.time.delayedCall(700, () => { this.praise('OBJECTIVE COMPLETE!', `${o.text.toUpperCase()}  ·  +${o.coins} COINS`); sfx.objective(); });
      }
    }
    this.game.events.emit(EV.OBJ, this.objectives.map(o => ({ ...o, progress: Math.min(this.stats[o.stat], o.target) })));
    return changed;
  }

  passCompleted(receiver) {
    this.combo++;
    this.bump('passes');
    this.addStars(1, receiver.x, receiver.y - 20);
    if (this.combo >= 3) { this.praise(`COMBO x${this.combo}!`, 'KEEP IT GOING'); sfx.combo(this.combo); }
    else { this.praise(pick(['NICE PASS!', 'GOOD BALL!', 'GREAT PASS!']), null); sfx.ding(); }
  }

  spawnPowerup() {
    const type = pick(['speed', 'speed', 'fire', 'fire', 'star']);
    const x = Phaser.Math.Between(PX + BOX_W + 80, PX + PITCH_W - BOX_W - 80);
    const y = Phaser.Math.Between(PY + 90, PY + PITCH_H - 90);
    const glow = this.add.image(x, y + 4, 'm_glow').setScale(0.9).setBlendMode(Phaser.BlendModes.ADD).setTint(POWERUPS[type].color).setDepth(1).setAlpha(0.9);
    const img = this.add.image(x, y, `m_pu_${type}`).setScale(1.2 / R).setDepth(y);
    const shadow = this.add.image(x + 2, y + 16, 'm_shadow').setScale(0.6 / R).setAlpha(0.7).setDepth(y - 1);
    const pu = { type, x, y, img, glow, shadow, t: 16 };
    this.tweens.add({ targets: img, y: y - 7, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.tweens.add({ targets: glow, scale: 1.15, alpha: 0.5, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.tweens.add({ targets: img, scale: { from: 0, to: 1.2 / R }, duration: 400, ease: 'Back.out' });
    this.powerups.push(pu);
  }

  removePowerup(pu, collected) {
    this.powerups.splice(this.powerups.indexOf(pu), 1);
    this.tweens.killTweensOf([pu.img, pu.glow]);
    pu.shadow.destroy();
    if (collected) {
      this.tweens.add({ targets: pu.img, scale: 2.4 / R, alpha: 0, duration: 350, ease: 'Cubic.out', onComplete: () => pu.img.destroy() });
      this.tweens.add({ targets: pu.glow, scale: 2.2, alpha: 0, duration: 350, onComplete: () => pu.glow.destroy() });
    } else { pu.img.destroy(); pu.glow.destroy(); }
  }

  applyPowerup(pu, by) {
    const info = POWERUPS[pu.type];
    this.bump('powerups');
    this.sparkEm.explode(18, pu.x, pu.y);
    sfx.powerup();
    if (pu.type === 'speed') { this.boostT = info.duration; this.praise('⚡ SPEED BOOST!', 'ZOOM!'); }
    else if (pu.type === 'fire') { this.fireReady = true; this.praise('🔥 FIRE SHOT READY!', 'YOUR NEXT SHOT IS SUPER'); }
    else { this.addStars(3, by.x, by.y - 20); this.praise('⭐ +3 STARS!', null); }
    this.removePowerup(pu, true);
  }

  updatePowerups(dt) {
    if (!this.kids.powerups) return;
    if (this.state === 'play') {
      this.puSpawnT -= dt;
      if (this.puSpawnT <= 0 && this.powerups.length < 2) { this.spawnPowerup(); this.puSpawnT = Phaser.Math.Between(16, 26); }
    }
    for (const pu of [...this.powerups]) {
      pu.t -= dt;
      if (pu.t < 3) pu.img.setAlpha(0.4 + 0.6 * Math.abs(Math.sin(pu.t * 10)));
      if (pu.t <= 0) { this.removePowerup(pu, false); continue; }
      if (this.state !== 'play') continue;
      for (const p of this.players) {
        if (p.team !== this.userTeam) continue;
        if (dist(p, pu) < 34) { this.applyPowerup(pu, p); break; }
      }
    }
    // active effects → HUD
    const state = this.boostT > 0 ? { type: 'speed', label: POWERUPS.speed.label, emoji: POWERUPS.speed.emoji, t: this.boostT }
      : this.fireReady ? { type: 'fire', label: POWERUPS.fire.label + ' READY', emoji: POWERUPS.fire.emoji, t: 0 } : null;
    const key = state ? `${state.type}:${Math.ceil(state.t)}` : 'none';
    if (key !== this.lastPU) { this.lastPU = key; this.game.events.emit(EV.POWERUP, state); }
  }

  showTarget(on) {
    if (on) {
      const goal = this.oppGoal(this.userTeam);
      this.target.setVisible(true).setPosition(goal.x - this.attackDir(this.userTeam) * 6, CY)
        .setScale((1 + Math.sin(this.time.now / 120) * 0.08) / R).setAngle(this.time.now / 20);
    } else this.target.setVisible(false);
  }

  rubberBand() {
    if (!this.kids.rubber) return;
    const diff = this.score[this.userTeam] - this.score[1 - this.userTeam];
    const rb = Phaser.Math.Clamp(diff * 0.05, -0.14, 0.08);
    const b = this.diffBase;
    this.diff = {
      aiSpeed: b.aiSpeed * (1 + rb),
      aiAcc: b.aiAcc + Math.max(0, -diff) * 0.3,
      aiShoot: b.aiShoot * (diff < 0 ? 0.75 : diff >= 3 ? 1.15 : 1),
      tackle: b.tackle * (diff < 0 ? 0.75 : 1),
      gkDive: b.gkDive * (diff >= 3 ? 1.12 : diff < 0 ? 0.9 : 1),
    };
  }

  // ─── Update ───────────────────────────────────────────────────────────────
  update(_t, delta) {
    const raw = Math.min(delta / 1000, 0.034);
    this.controls.update(raw);
    if (this.hitStop > 0) { this.hitStop -= raw; if (this.view3d) this.view3d.update(0); return; }
    if (this.timeScale < 1) this.timeScale = Math.min(1, this.timeScale + raw * 0.9);
    const dt = raw * this.timeScale;
    this.stateT -= dt;

    switch (this.state) {
      case 'kickoff': if (this.stateT <= 0) this.state = 'play'; break;
      case 'goal': if (this.stateT <= 0) this.kickoff(this.concededBy, 'KICK OFF'); break;
      case 'halftime': if (this.stateT <= 0) { this.half = 2; this.kickoff(AWAY, 'KICK OFF'); } break;
      case 'play':
        this.clock += dt * this.clockScale;
        if (this.half === 1 && this.clock >= 45 * 60) { this.state = 'halftime'; this.stateT = 3.2; this.pop('HALF TIME', 'lg'); sfx.whistle(2); }
        else if (this.half === 2 && this.clock >= 90 * 60) this.fullTime();
        break;
    }

    const live = this.state === 'play';
    if (live) { this.updateUser(dt); updateAI(this, dt); this.resolvePossession(dt); }
    else { for (const p of this.players) p.brake(dt); if (this.state === 'goal') this.celebrate(dt); }

    if (this.ball.owner) this.dribble(dt);
    const hit = this.ball.update(dt);
    if (hit === 'post' && this.state !== 'goal') { sfx.post(); this.pop('POST!'); this.cameras.main.shake(120, 0.004); sfx.cheer(0.35); if (this.lastShot && this.lastShot.t > 0) { this.lastShot = null; this.praise('SO CLOSE!', null); } }
    if (live) this.checkBoundaries();
    if (this.state === 'goal') this.keepBallInNet();
    if (this.ball.fire) {
      this.fireEm.emitParticleAt(this.ball.x, this.ball.y - this.ball.z * 0.8, 2);
      if (this.ball.speed < 260) this.ball.fire = false;
    }

    for (const p of this.players) p.integrate(dt);
    if (this.restartLock) {
      this.restartLock.t -= dt;
      if (this.restartLock.t <= 0 || (this.ball.owner && this.ball.owner.team === this.restartLock.team)) this.restartLock = null;
    }
    // timers for the kids layer
    if (this.pendingPass && (this.pendingPass.t -= dt) <= 0) { this.pendingPass = null; this.combo = 0; }
    if (this.lastShot && (this.lastShot.t -= dt) <= 0) this.lastShot = null;
    if (this.boostT > 0) {
      this.boostT -= dt;
      if (this.controlled && Math.random() < 0.6) this.sparkEm.emitParticleAt(this.controlled.x - Math.cos(this.controlled.facing) * 14, this.controlled.y - Math.sin(this.controlled.facing) * 14 + 6, 1);
    }
    if (this.hintCool > 0) this.hintCool -= dt;
    if ((this.rubberT -= dt) <= 0) { this.rubberT = 6; this.rubberBand(); }
    this.updatePowerups(dt);
    this.updateCamera(dt);
    this.emitHud(dt);
    if (this.view3d) this.view3d.update(dt);
  }

  updateUser(dt) {
    let p = this.controlled;
    if (!p) return;
    const c = this.controls, b = this.ball;
    const weHaveBall = !!b.owner && b.owner.team === this.userTeam;

    this.switchT -= dt;
    if (!weHaveBall && this.switchT <= 0) {
      const bx = b.x + b.vx * 0.25, by = b.y + b.vy * 0.25;
      const near = this.nearestTo(bx, by, this.userTeam);
      if (near && near !== p && Math.hypot(near.x - bx, near.y - by) < Math.hypot(p.x - bx, p.y - by) - 70) { this.setControlled(near); p = near; this.switchT = 0.5; }
    }
    if (c.switchJust) {
      const near = this.nearestTo(b.x, b.y, this.userTeam, true, p);
      if (near) { this.setControlled(near); p = near; this.switchT = 1.2; sfx.click(); }
    }

    const moving = c.axisX !== 0 || c.axisY !== 0;
    const hasBall = b.owner === p;
    let speed = PLAYER_SPEED * this.user.speed * (hasBall ? 0.94 : 1) * (this.boostT > 0 ? 1.35 : 1);
    if (c.sprint && moving && p.stamina > 0.03) { speed *= SPRINT_MULT; p.stamina = Math.max(0, p.stamina - dt * 0.17 * this.user.stamina); }
    else p.stamina = Math.min(1, p.stamina + dt * (moving ? 0.06 : 0.14));
    speed *= 0.78 + 0.22 * p.stamina;
    p.lockFacing = false;
    if (this.dashT > 0.12) { /* mid-lunge: keep the momentum */ }
    else if (moving) p.drive(c.axisX, c.axisY, speed, dt);
    else if (this.kids.autoRun && !weHaveBall && !c.anyInput) p.steer(b.x + b.vx * 0.2, b.y + b.vy * 0.2, PLAYER_SPEED * 0.55, dt, 5);
    else p.brake(dt);

    // guidance: target on the goal + "SHOOT!" hint when in range with the ball
    const goal = this.oppGoal(this.userTeam);
    const inRange = hasBall && dist(p, goal) < 560;
    this.showTarget(inRange && this.kids.hints);
    if (inRange && this.kids.hints && this.hintsShown < 3 && this.hintCool <= 0) {
      this.hintsShown++; this.hintCool = 8;
      this.praise('SHOOT!', this.sys.game.device.input.touch ? 'HOLD THE SHOOT BUTTON' : 'HOLD SPACE, THEN RELEASE');
    }

    const nearBall = dist(p, b) < 48 + this.kids.control && (b.owner === p || b.owner === null) && b.z < 70;
    this.aim3d.on = hasBall; this.aim3d.x = p.x; this.aim3d.y = p.y; this.aim3d.power = this.charging ? this.power : 0;
    this.aim3d.dx = moving ? c.axisX : Math.cos(p.facing); this.aim3d.dy = moving ? c.axisY : Math.sin(p.facing);
    // a loose ball arriving from a teammate: buttons are buffered so first-time passes and shots work
    const incoming = !b.owner && !nearBall && dist(p, b) < 260 && !!b.lastTouch && b.lastTouch.team === this.userTeam;
    if (this.bufPass > 0) this.bufPass -= dt;
    if (this.bufShot && (this.bufShot.t -= dt) <= 0) this.bufShot = null;
    if (c.passJust && incoming) this.bufPass = 0.45;
    if (this.bufShot && nearBall) { const pw = this.bufShot.power; this.bufShot = null; this.shoot(p, pw, c.axisY, c.axisX); return; }
    // every button always does something: without the ball SHOOT is a lunge tackle
    if (this.dashCool > 0) this.dashCool -= dt;
    if (this.dashT > 0) this.dashT -= dt;
    if (c.shootJustDown && !nearBall && !weHaveBall && !incoming) {
      if (this.dashCool <= 0) {
        const tx = b.x + b.vx * 0.15 - p.x, ty = b.y + b.vy * 0.15 - p.y, m = Math.hypot(tx, ty) || 1;
        p.vx = (tx / m) * 520; p.vy = (ty / m) * 520; p.facing = Math.atan2(ty, tx);
        this.dashT = 0.3; this.dashCool = 0.9; p.stamina = Math.max(0, p.stamina - 0.08);
        this.puff(p.x, p.y + 8, 4); sfx.kick(0.25); p.play('slide');
      }
    } else if (c.shootJustDown) { this.charging = true; this.power = 0; }
    if (this.charging) {
      this.power = Math.min(1, c.shootHoldTime / SHOT_CHARGE_TIME);
      if (c.shootJustUp || this.power >= 1) {
        this.charging = false;
        if (nearBall) {
          // far from goal, a "shoot" becomes a big forward pass so the button is never useless
          if (dist(p, goal) > 900 && !this.fireReady && !moving) {
            const mate = bestPass(this, p, this.attackDir(this.userTeam), 0);
            if (mate) this.passTo(p, mate); else this.kick(p, this.attackDir(this.userTeam), c.axisY * 0.4, 700, 120);
          } else this.shoot(p, Math.max(0.28, this.power), c.axisY, c.axisX);
        } else if (incoming) this.bufShot = { t: 0.4, power: Math.max(0.45, this.power) };
        this.power = 0;
      }
    }
    if ((c.passJust || this.bufPass > 0) && nearBall) {
      this.bufPass = 0;
      const dx = moving ? c.axisX : Math.cos(p.facing), dy = moving ? c.axisY : Math.sin(p.facing);
      // pass to the teammate you are pointing at; if nobody is there, play the ball into that space
      const mate = bestPass(this, p, dx, dy, -Infinity, moving ? 0.8 : 0.5);
      if (mate) this.passTo(p, mate); else this.kick(p, dx, dy, 620, 0);
    } else if (c.passJust && weHaveBall && b.owner && b.owner !== p && !b.owner.isGK) {
      // PASS while a teammate has it = call for the ball
      this.passTo(b.owner, p); this.praise('PASS IT!', null);
    } else if (c.passJust && !weHaveBall && !incoming) {
      // PASS while defending = switch to the next closest player
      const near = this.nearestTo(b.x, b.y, this.userTeam, true, p);
      if (near) { this.setControlled(near); this.switchT = 1.2; sfx.click(); }
    }
  }

  resolvePossession(dt) {
    const b = this.ball, o = b.owner;
    const locked = (team) => !!this.restartLock && this.restartLock.team !== team && this.restartLock.t > 0;
    const radius = (p) => (p.isGK ? 38 : CONTROL_RADIUS) + (p.team === this.userTeam ? this.kids.control : 0);
    if (o) {
      if (dist(o, b) > CONTROL_RADIUS * 2.4) { b.owner = null; return; }
      for (const p of this.players) {
        if (p.team === o.team || p.kickCooldown > 0 || locked(p.team)) continue;
        const lunging = p.controlled && this.dashT > 0;
        if (dist(p, b) > radius(p) + (lunging ? 16 : 0)) continue;
        const closing = ((b.x - p.x) * p.vx + (b.y - p.y) * p.vy) > 0 ? 1 : 0.45;
        const shield = o.controlled ? this.user.shield : 1;
        const rate = TACKLE_RATE * (p.team !== this.userTeam ? this.diff.tackle : this.user.tackle) * (lunging ? 6 : 1);
        if (Math.random() < rate * dt * closing * shield) {
          const byKid = p.controlled;
          this.takeBall(p);
          b.vx = Math.cos(p.facing) * 90; b.vy = Math.sin(p.facing) * 90;
          o.kickCooldown = 0.55; sfx.kick(0.2); o.play('stumble'); if (!lunging) p.play('poke');
          if (byKid) { this.bump('tackles'); this.addStars(1, p.x, p.y - 20); this.praise(pick(['GREAT TACKLE!', 'BALL WON!', 'SUPER DEFENDING!']), null); sfx.praise(); }
          break;
        }
      }
      return;
    }
    let best = null, bd = 1e9;
    for (const p of this.players) {
      if (p.kickCooldown > 0 || locked(p.team)) continue;
      if (b.z > (p.isGK ? 130 : 60)) continue;
      const d = dist(p, b);
      if (d < radius(p) && d < bd) { bd = d; best = p; }
    }
    if (!best) return;
    const sp = b.speed;
    if (best.isGK) {
      const kidShot = this.lastShot && best.team !== this.userTeam;
      if (kidShot) { this.bump('shotsOn'); this.lastShot = null; }
      if (b.fire || (sp > 980 && Math.random() < 0.5)) {
        b.vx = -b.vx * 0.3; b.vy = (Math.random() < 0.5 ? -1 : 1) * (300 + Math.random() * 220); b.vz = 150; b.fire = false;
        best.kickCooldown = 0.5; if (!best.diveT || best.diveT <= 0) best.play('dive', Math.sign(b.vy) || 1); this.pop(b.fire || sp > 980 ? 'WHAT A SAVE!' : 'SAVE!', 'md'); sfx.cheer(0.5); sfx.kick(0.4);
        if (kidShot) this.praise('SO CLOSE!', 'TRY AGAIN!');
        return;
      }
      this.takeBall(best); best.holdT = 0.9; if (sp > 300 && !(best.diveT > 0)) best.play('catch');
      if (sp > 420) { this.pop('SAVE!', 'md'); sfx.cheer(0.45); if (kidShot) this.praise('ON TARGET!', null); }
      return;
    }
    if (sp > 850 && best.team !== this.userTeam) { b.vx *= 0.4; b.vy = b.vy * 0.4 + (Math.random() - 0.5) * 280; best.kickCooldown = 0.3; b.lastTouch = best; return; }
    this.takeBall(best);
  }

  dribble(dt) {
    const o = this.ball.owner, b = this.ball;
    const ahead = DRIBBLE_OFFSET + o.speed * 0.05;
    const tx = o.x + Math.cos(o.facing) * ahead, ty = o.y + Math.sin(o.facing) * ahead;
    const k = Math.min(1, 16 * dt);
    const px = b.x, py = b.y;
    b.x += (tx - b.x) * k; b.y += (ty - b.y) * k;
    b.vx = (b.x - px) / dt; b.vy = (b.y - py) / dt;
  }

  checkBoundaries() {
    const b = this.ball;
    const out = b.outside();
    if (!out) return;
    const lastTeam = b.lastTouch ? b.lastTouch.team : AWAY;
    if (out === 'left' || out === 'right') {
      const inMouth = Math.abs(b.y - CY) < GOAL_W / 2 - 2;
      const defending = out === 'left' ? HOME : AWAY;
      const attacking = 1 - defending;
      if (inMouth && b.z < 105) { this.goal(attacking); return; }
      if (inMouth) { this.pop('OVER THE BAR!'); sfx.cheer(0.3); if (this.lastShot) { this.lastShot = null; this.praise('UNLUCKY!', 'LESS POWER NEXT TIME'); } }
      if (this.kids.walls) { this.bounce('x'); return; }
      if (lastTeam === attacking) {
        const gk = this.players.find(p => p.team === defending && p.isGK);
        const gx = this.ownGoal(defending).x + this.attackDir(defending) * (SIX_W + 30);
        b.place(gx, CY + (b.y > CY ? 1 : -1) * 150);
        gk.setPosition(gx - this.attackDir(defending) * 18, b.y); gk.vx = 0; gk.vy = 0;
        this.takeBall(gk); gk.holdT = 0.6;
        this.restartLock = { team: defending, t: 2.5 };
        this.pop('GOAL KICK');
      } else {
        const cx = out === 'left' ? PX + 4 : PX + PITCH_W - 4, cy = b.y > CY ? PY + PITCH_H - 4 : PY + 4;
        this.quickRestart(attacking, cx, cy, 'CORNER');
      }
      return;
    }
    if (this.kids.walls) { this.bounce('y'); return; }
    const awarded = 1 - lastTeam;
    this.quickRestart(awarded, Phaser.Math.Clamp(b.x, PX + 20, PX + PITCH_W - 20), out === 'top' ? PY + 4 : PY + PITCH_H - 4, 'THROW-IN');
  }

  /** Arena boards: the ball rebounds instead of going out. */
  bounce(axis) {
    const b = this.ball;
    if (axis === 'x') { b.x = Phaser.Math.Clamp(b.x, PX - BALL_R + 1, PX + PITCH_W + BALL_R - 1); b.vx = -b.vx * 0.72; }
    else { b.y = Phaser.Math.Clamp(b.y, PY - BALL_R + 1, PY + PITCH_H + BALL_R - 1); b.vy = -b.vy * 0.72; }
    b.owner = null;
    if (b.speed > 120) { sfx.wall(); this.puff(b.x, b.y, 2); }
  }

  quickRestart(team, x, y, label) {
    this.ball.place(x, y);
    const p = this.nearestTo(x, y, team);
    const ix = CX - x, iy = CY - y, m = Math.hypot(ix, iy) || 1;
    p.setPosition(x - (ix / m) * 26, y - (iy / m) * 26);
    p.vx = 0; p.vy = 0; p.facing = Math.atan2(iy, ix);
    this.takeBall(p);
    p.decisionT = 0.3;
    for (const o of this.players) if (o.team !== team && dist(o, this.ball) < 160) {
      const dx = o.x - x, dy = o.y - y, d = Math.hypot(dx, dy) || 1;
      o.setPosition(x + (dx / d) * 160, y + (dy / d) * 160);
    }
    this.restartLock = { team, t: 2.2 };
    this.pop(label);
  }

  goal(team) {
    const gs = GS();
    this.score[team]++; this.goalTeam = team;
    this.state = 'goal'; this.stateT = 3.6; this.concededBy = 1 - team;
    const wasFire = this.ball.fire;
    this.ball.vx *= 0.12; this.ball.vy *= 0.12; this.ball.vz = 0; this.ball.fire = false;
    const scorer = this.ball.lastTouch;
    const mine = team === this.userTeam;
    if (mine) {
      if (scorer && scorer.controlled) this.userGoals++;
      gs.data.goals = (gs.data.goals || 0) + 1; gs.addXP(25);
      this.bump('goals'); if (wasFire) this.bump('superGoals');
      this.addStars(wasFire ? 5 : 3, this.ball.x, this.ball.y - 30);
      if (scorer) scorer.celebrate();
    } else gs.addXP(5);
    gs.save();
    sfx.net(); sfx.cheer(1); sfx.whistle(1);
    this.timeScale = 0.28;
    this.crowdFlashBurst(3000);
    const cam = this.cameras.main;
    cam.shake(420, 0.009); cam.flash(220, 255, 255, 255);
    this.confetti.explode(mine ? 220 : 90, this.ball.x, this.ball.y - 40);
    this.lastShot = null;
    this.game.events.emit(EV.SCORE, this.score[0], this.score[1], this.awayName);
    this.game.events.emit(EV.GOAL, team, scorer ? scorer.num : 0, mine);
    const who = !scorer ? 'GOAL FOR F17' : scorer.hero ? 'F17 SCORES!' : `${scorer.name} SCORES FOR F17`;
    if (mine && scorer && scorer.hero) this.addStars(2, scorer.x, scorer.y - 30);
    const text = !mine ? 'CONCEDED' : wasFire ? 'WHAT A GOAL!' : pick(['GOAL!', 'GOOOAL!', 'GOAL!']);
    this.pop(text, 'lg', mine ? `${who}  ·  +25 XP  ·  +${wasFire ? 5 : 3} ★` : `${scorer && scorer.team !== this.userTeam ? scorer.name + ' SCORES FOR ' : ''}${this.awayName}  ·  COME ON, HIT BACK!`);
    this.charging = false; this.power = 0;
  }

  fullTime() {
    const gs = GS();
    this.state = 'fulltime';
    const h = this.score[0], a = this.score[1];
    const won = h > a, drew = h === a;
    if (won) { gs.data.wins = (gs.data.wins || 0) + 1; this.bump('win'); } else if (drew) gs.data.draws = (gs.data.draws || 0) + 1; else gs.data.losses = (gs.data.losses || 0) + 1;
    gs.data.week = (gs.data.week || 1) + 1;
    const lg = this.friendly ? null : playRound(gs, h, a);
    const xp = won ? 35 : drew ? 12 : 6;
    gs.addXP(xp);
    const starRating = this.stars >= 14 || (won && this.stars >= 9) ? 3 : this.stars >= 6 || won ? 2 : 1;
    const coins = this.coinsEarned + this.stars * 2 + (won ? 30 : drew ? 10 : 5);
    gs.data.coins = (gs.data.coins || 0) + coins;
    gs.save();
    this.pop('FULL TIME', 'lg'); sfx.whistle(3, true);
    this.setControlled(null); this.showTarget(false);
    this.game.events.emit(EV.FULLTIME, {
      home: h, away: a, won, drew, userGoals: this.userGoals, xp, coins, starRating, stars: this.stars,
      objectives: this.objectives.map(o => ({ text: o.text, done: o.done, coins: o.coins })),
      rating: gs.data.rating, xpFrac: Math.min(1, gs.data.xp / gs.data.xpNextLevel), awayName: this.awayName,
      league: lg ? { name: this.tier.name, position: lg.position, points: lg.points, seasonOver: lg.seasonOver } : null,
    });
  }

  keepBallInNet() {
    const b = this.ball;
    if (b.x < PX - GOAL_D + BALL_R) { b.x = PX - GOAL_D + BALL_R; b.vx = Math.abs(b.vx) * 0.3; }
    if (b.x > PX + PITCH_W + GOAL_D - BALL_R) { b.x = PX + PITCH_W + GOAL_D - BALL_R; b.vx = -Math.abs(b.vx) * 0.3; }
    b.y = Phaser.Math.Clamp(b.y, CY - GOAL_W / 2 + BALL_R, CY + GOAL_W / 2 - BALL_R);
  }

  celebrate(dt) {
    const scorer = this.ball.lastTouch;
    if (!scorer) return;
    const team = scorer.team, d = this.attackDir(team);
    const cx = d > 0 ? PX + PITCH_W - 120 : PX + 120, cy = scorer.y > CY ? PY + PITCH_H - 110 : PY + 110;
    for (const p of this.players) {
      if (p === scorer) { p.brake(dt); continue; }
      if (p.team === team && !p.isGK && dist(p, scorer) < 420) p.steer(scorer.x + (p.idx - 6) * 34, scorer.y + ((p.idx % 3) - 1) * 40, 210, dt, 4);
      else p.steer(p.homeX, p.homeY, 120, dt, 3);
    }
    void cx; void cy;
  }

  updateCamera(dt) {
    const b = this.ball, cam = this.cameras.main;
    let tx = b.x + b.vx * 0.2, ty = b.y + b.vy * 0.2;
    if (this.controlled) { tx = tx * 0.78 + this.controlled.x * 0.22; ty = ty * 0.78 + this.controlled.y * 0.22; }
    const k = Math.min(1, (this.state === 'goal' ? 2.2 : 4.5) * dt);
    this.camC.x += (tx - this.camC.x) * k; this.camC.y += (ty - this.camC.y) * k;
    cam.centerOn(this.camC.x, this.camC.y);
    const zt = this.zoomBase * (this.state === 'goal' ? 1.18 : 1 - Math.min(b.speed / 1300, 1) * 0.06);
    cam.setZoom(cam.zoom + (zt - cam.zoom) * Math.min(1, 2.5 * dt));
  }

  emitHud(dt) {
    const ev = this.game.events;
    ev.emit(EV.CLOCK, this.clock, this.half, this.state);
    ev.emit(EV.STAMINA, this.controlled ? this.controlled.stamina : 1);
    ev.emit(EV.POWER, this.charging ? this.power : 0);
    this.radarT += dt;
    if (this.radarT > 0.08) {
      this.radarT = 0;
      const dots = this.players.map(p => ({ x: (p.x - PX) / PITCH_W, y: (p.y - PY) / PITCH_H, team: p.team, ctrl: p.controlled }));
      ev.emit(EV.RADAR, dots, { x: (this.ball.x - PX) / PITCH_W, y: (this.ball.y - PY) / PITCH_H });
    }
  }
}
