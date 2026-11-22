import { DrillBase, dist, CY, PITCH_W, PX, PY, PITCH_H, R, GOAL_W } from './drill-base.js';
import { SHOT_MAX, SHOT_MIN } from '../match/config.js';
import { sfx } from '../match/sfx.js';

const GOAL_X = PX + PITCH_W;

/** CONE RUN — dribble through the gold gates in order, then finish with a shot. Knocked cones cost points. */
export class DribbleDrill extends DrillBase {
  constructor() {
    super('DrillDribble', {
      id: 'dribble', title: 'CONE RUN', tip: 'DRIBBLE THROUGH THE GOLD GATE  ·  DON\'T HIT THE CONES  ·  SHOOT AT THE END', duration: 60,
      thresholds: [500, 950, 1500], stat: 'dribbling', stat2: 'speed', buttons: ['shoot', 'sprint'],
    });
  }

  setup() {
    this.autoRun = false;
    this.others = [];
    this.laps = 0;
    this.buildCourse();
  }

  buildCourse() {
    if (this.gates) this.gates.forEach(g => g.objs.forEach(o => o.destroy()));
    this.gates = [];
    const n = 7;
    const x0 = PX + 260, x1 = GOAL_X - 420;
    for (let i = 0; i < n; i++) {
      const x = x0 + (i / (n - 1)) * (x1 - x0);
      const y = CY + (i % 2 ? 1 : -1) * Phaser.Math.Between(150, 260) * (this.laps % 2 ? -1 : 1);
      const half = 70;
      const cones = [this.add.image(x, y - half, 'm_cone'), this.add.image(x, y + half, 'm_cone')].map(c => c.setScale(1.3 / R).setDepth(c.y));
      const disc = this.add.image(x, y, 'm_disc').setScale(1.4 / R).setDepth(1).setAlpha(0.35);
      const num = this.add.text(x, y, String(i + 1), { fontFamily: '"Barlow Condensed", Arial Black', fontSize: '26px', color: '#ffffff' }).setOrigin(0.5).setDepth(1).setAlpha(0.6);
      const props = [{ kind: 'gate', x, y, n: i + 1, cur: false, done: false }, { kind: 'cone', x, y: y - half, hit: false }, { kind: 'cone', x, y: y + half, hit: false }];
      this.gates.push({ x, y, half, cones, disc, num, props, objs: [...cones, disc, num], done: false, hit: [false, false] });
    }
    this.props3d = this.gates.flatMap(g => g.props);
    this.current = 0;
    this.highlight();
    const p = this.player;
    p.setPosition(x0 - 160, CY); p.vx = 0; p.vy = 0; p.facing = 0;
    this.ball.place(p.x + 22, p.y); this.ball.owner = p;
    this.finishLive = false;
  }

  highlight() {
    this.gates.forEach((g, i) => {
      this.tweens.killTweensOf(g.disc);
      const cur = i === this.current;
      g.props[0].cur = cur; g.props[0].done = g.done;
      g.disc.setAlpha(cur ? 0.95 : g.done ? 0.15 : 0.35).setTint(cur ? 0xf1c40f : g.done ? 0x22c55e : 0xffffff).setScale(1.4 / R);
      g.num.setAlpha(cur ? 1 : 0.5).setColor(cur ? '#f1c40f' : '#ffffff');
      if (cur) this.tweens.add({ targets: g.disc, scale: 1.7 / R, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    });
  }

  onShoot(power, aimY) {
    if (!this.finishLive) { this.kick(Math.cos(this.player.facing), Math.sin(this.player.facing), 420, 0); return; }
    const isSuper = power >= 0.98;
    const ty = CY + (Math.abs(aimY) > 0.3 ? Math.sign(aimY) : (Math.random() < 0.5 ? -1 : 1)) * (GOAL_W / 2 - 34);
    this.kick(GOAL_X - this.player.x, ty - this.player.y + (Math.random() - 0.5) * 60, Phaser.Math.Linear(SHOT_MIN, SHOT_MAX, power) * (isSuper ? 1.28 : 1), isSuper ? 30 : 40 + power * 200 * Math.random(), isSuper);
    this.shotLive = true; this.shotT = 2.2;
  }
  onPass(dx, dy) { this.kick(dx, dy, 420, 0); }
  cam3d() { const p = this.player, b = this.ball, far = this.finishLive ? 0.35 : 0; return { x: (p.x * 0.6 + b.x * 0.4) * (1 - far) + GOAL_X * far + 60, y: p.y * 0.6 + b.y * 0.4, dist: 27, h: 12 }; }
  onBallOut() { this.resetBallToPlayer(); if (this.shotLive) { this.shotLive = false; this.praise('MISSED!', 'NEXT LAP'); this.nextLap(); } }

  nextLap() { this.laps++; this.time.delayedCall(500, () => { if (this.phase === 'play') this.buildCourse(); }); }

  tick(dt) {
    const b = this.ball, p = this.player;
    // gate logic
    const g = this.gates[this.current];
    if (g && !this.finishLive) {
      // cones knocked?
      g.cones.forEach((c, i) => {
        if (!g.hit[i] && (dist(c, b) < 20 || dist(c, p) < 24)) {
          g.hit[i] = true; g.props[i + 1].hit = true;
          this.tweens.add({ targets: c, angle: { from: -25, to: 25 }, duration: 90, yoyo: true, repeat: 3 });
          c.setTint(0xef4444);
          this.score = Math.max(0, this.score - 25); this.scoreT.setText(String(this.score)); this.updateStarHud();
          this.praise('OOPS! CONE!', '-25'); sfx.deny();
        }
      });
      // through the gate?
      if (b.x > g.x && Math.abs(b.y - g.y) < g.half - 10 && b.x < g.x + 60) {
        g.done = true;
        const clean = !g.hit[0] && !g.hit[1];
        this.addScore(clean ? 100 : 50, g.x, g.y - 20, clean ? undefined : null);
        if (clean) { this.good(); }
        this.current++;
        if (this.current >= this.gates.length) { this.finishLive = true; g.props[0].cur = false; g.props[0].done = true; this.praise('NOW SHOOT!', 'HOLD SPACE / SHOOT'); this.gates.forEach(x => this.tweens.killTweensOf(x.disc)); }
        else this.highlight();
      } else if (b.x > g.x + 90) {
        // skipped the gate
        g.done = true; this.praise('MISSED GATE', 'GO THROUGH THE GOLD ONE'); sfx.deny();
        this.current++;
        if (this.current >= this.gates.length) { this.finishLive = true; g.props[0].cur = false; g.props[0].done = true; this.praise('NOW SHOOT!', 'HOLD SPACE / SHOOT'); }
        else this.highlight();
      }
    }
    if (this.shotLive) {
      this.shotT -= dt;
      if (this.inRightGoal()) {
        this.shotLive = false; this.finishLive = false;
        this.confettiAt(b.x, b.y, 80); sfx.net(); sfx.cheer(0.8);
        this.addScore(b.fire ? 400 : 250, b.x - 60, b.y, b.fire ? 'SUPER FINISH!' : 'LAP COMPLETE + GOAL!');
        this.nextLap();
      } else if (this.shotT <= 0 || b.speed < 40) { this.shotLive = false; this.praise('TRY AGAIN', 'GET THE BALL AND SHOOT'); this.resetBallToPlayer(); }
    }
  }
}

export { PY, PITCH_H };
