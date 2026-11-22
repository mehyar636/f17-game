import { DrillBase, dist, CX, CY, R } from './drill-base.js';
import { sfx } from '../match/sfx.js';

/** PASS MASTER — pass to the gold teammate, they give it straight back. Combos score more; later a defender blocks lanes. */
export class PassDrill extends DrillBase {
  constructor() {
    super('DrillPass', {
      id: 'pass', title: 'PASS MASTER', tip: 'PASS TO THE GOLD PLAYER  ·  CHAIN PASSES FOR COMBOS', duration: 60,
      thresholds: [500, 1000, 1600], stat: 'passing', stat2: 'dribbling', buttons: ['pass', 'sprint'],
      keys: 'WASD  move    X  pass (aim with WASD)    ESC  quit',
    });
  }

  setup() {
    this.autoRun = true;
    this.player.setPosition(CX - 200, CY); this.ball.place(CX - 178, CY); this.ball.owner = this.player;
    const spots = [[-0.9, -0.75], [0.1, -1], [0.95, -0.35], [0.95, 0.35], [0.1, 1], [-0.9, 0.75]];
    this.mates = spots.map(([ux, uy], i) => {
      const m = this.makePlayer(0, i + 1, 'MID', [2, 7, 9, 11, 8, 6][i], CX - 200 + ux * 330, CY + uy * 240);
      m.homeX = m.x; m.homeY = m.y; m.ring = this.add.image(m.x, m.y + 4, 'm_ring').setScale(1 / R).setVisible(false).setDepth(1);
      m.arrow = this.add.image(m.x, m.y - 40, 'm_chev').setScale(1.4 / R).setAngle(90).setVisible(false).setDepth(9000);
      m.prop = { kind: 'mark', p: m, on: false };
      return m;
    });
    this.props3d = this.mates.map(m => m.prop);
    this.defender = null;
    this.others = [...this.mates];
    this.success = 0; this.passLive = null; this.returnT = 0;
    this.pickTarget();
  }

  pickTarget() {
    const options = this.mates.filter(m => m !== this.target);
    this.target = options[Math.floor(Math.random() * options.length)];
    this.mates.forEach(m => { m.ring.setVisible(m === this.target); m.arrow.setVisible(m === this.target); m.prop.on = m === this.target; });
  }

  onPass(dx, dy) {
    // pick the teammate most aligned with the aim direction
    const p = this.player;
    let best = null, bs = -1;
    for (const m of this.mates) {
      const d = dist(m, p), ux = (m.x - p.x) / d, uy = (m.y - p.y) / d;
      const dot = ux * dx + uy * dy;
      if (dot > bs) { bs = dot; best = m; }
    }
    if (!best) return;
    const d = dist(best, p);
    this.kick(best.x - p.x, best.y - p.y, Phaser.Math.Clamp(d * 1.6, 420, 760), 0);
    this.passLive = { to: best, t: 2.5 };
  }

  onShoot(_power, aimY) { this.onPass(Math.cos(this.player.facing), Math.abs(aimY) > 0.3 ? aimY : Math.sin(this.player.facing)); }

  cam3d() { return { x: CX - 200, y: CY + (this.player.y - CY) * 0.25 + 40, dist: 44, h: 22 }; }

  onBallOut() { this.resetBallToPlayer(); if (this.passLive) { this.passLive = null; this.combo = 0; this.praise('TOO HARD!', 'EASY DOES IT'); } }

  spawnDefender() {
    this.defender = this.makePlayer(1, 5, 'MID', 4, CX - 60, CY);
    this.defender.speedMult = 0.85;
    this.others.push(this.defender);
    this.praise('DEFENDER!', 'FIND THE OPEN LANE');
  }

  tick(dt) {
    const b = this.ball, p = this.player;
    // teammates hold position (small sway), target bobs its arrow
    this.mates.forEach(m => {
      const sway = this.success >= 6 ? Math.sin(this.time.now / 700 + m.idx) * 90 : 0;
      m.steer(m.homeX, m.homeY + sway, 160, dt, 6);
      m.ring.setPosition(m.x, m.y + 4); m.arrow.setPosition(m.x, m.y - 44 + Math.sin(this.time.now / 150) * 4);
      m.faceToward && m.faceToward(b.x, b.y, dt);
      m.lockFacing = true; m.facing = Math.atan2(b.y - m.y, b.x - m.x);
    });
    // defender shadows the lane between player and target
    if (this.defender) {
      const t = this.target;
      const mx = (p.x + t.x) / 2, my = (p.y + t.y) / 2;
      this.defender.steer(mx, my, 150, dt, 4);
      if (this.passLive && dist(this.defender, b) < 30 && !b.owner) {
        b.vx *= -0.3; b.vy *= 0.3; this.passLive = null; this.combo = 0;
        this.praise('BLOCKED!', 'PASS AROUND THE DEFENDER'); sfx.deny();
      }
    }
    // a live pass arriving at a teammate
    if (this.passLive) {
      this.passLive.t -= dt;
      const to = this.passLive.to;
      if (dist(to, b) < 34 && b.z < 60) {
        const right = to === this.target;
        this.passLive = null;
        b.place(to.x, to.y); b.owner = null;
        if (right) {
          this.combo++; this.success++;
          const pts = 100 + Math.min(4, this.combo - 1) * 25;
          this.addScore(pts, to.x, to.y - 20, this.combo >= 3 ? `COMBO x${this.combo}!` : undefined);
          if (this.combo >= 3) sfx.combo(this.combo); else { this.good(); }
          if (this.success === 6) this.praise('TARGETS ARE MOVING!', 'WATCH THE GOLD RING');
          if (this.success === 9 && !this.defender) this.spawnDefender();
          this.pickTarget();
        } else { this.combo = 0; this.addScore(20, to.x, to.y - 20); this.praise('WRONG PLAYER!', 'LOOK FOR THE GOLD RING'); sfx.deny(); }
        // return pass after a beat
        this.returnT = 0.55; this.returner = to;
      } else if (this.passLive.t <= 0 || b.speed < 30) { this.passLive = null; this.combo = 0; this.praise('NOT QUITE', 'AIM WITH THE STICK, THEN PASS'); }
    }
    if (this.returnT > 0) {
      this.returnT -= dt;
      if (this.returnT <= 0 && this.returner) {
        const m = this.returner, d = dist(m, p);
        b.place(m.x, m.y); b.lastTouch = m; m.triggerKick('pass');
        b.kick(p.x + p.vx * 0.3 - m.x, p.y + p.vy * 0.3 - m.y, Phaser.Math.Clamp(d * 1.5, 380, 700), 0);
        sfx.kick(0.3); this.returner = null;
      }
    }
  }
}
