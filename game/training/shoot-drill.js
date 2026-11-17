import { DrillBase, dist, CX, CY, GOAL_W, PITCH_W, PX, R } from './drill-base.js';
import { SHOT_MAX, SHOT_MIN } from '../match/config.js';
import { sfx } from '../match/sfx.js';

const GOAL_X = PX + PITCH_W;

/** TARGET PRACTICE — hit the glowing corner target past a moving keeper. Full charge = SUPER SHOT. */
export class ShootDrill extends DrillBase {
  constructor() {
    super('DrillShoot', {
      id: 'shoot', title: 'TARGET PRACTICE', tip: 'HIT THE GOLD TARGET  ·  FULL POWER = SUPER SHOT', duration: 60,
      thresholds: [300, 650, 1100], stat: 'shooting', stat2: 'speed', buttons: ['shoot', 'sprint'],
    });
  }

  setup() {
    this.autoRun = true;
    this.gk = this.makePlayer(1, 0, 'GK', 1, GOAL_X - 36, CY);
    this.others = [this.gk];
    // three target zones on the goal line: top corner, bottom corner, middle
    this.zones = [
      { y: CY - GOAL_W / 2 + 32, pts: 150, name: 'TOP CORNER!' },
      { y: CY + GOAL_W / 2 - 32, pts: 150, name: 'BOTTOM CORNER!' },
      { y: CY, pts: 80, name: 'DOWN THE MIDDLE!' },
    ].map(z => ({ ...z, img: this.add.image(GOAL_X - 4, z.y, 'm_target').setScale(1 / R).setDepth(5001).setAlpha(0.35) }));
    this.pickTarget();
    this.placeForShot(true);
    this.shotLive = false; this.shotT = 0; this.streak = 0;
  }

  pickTarget() {
    const options = this.zones.filter(z => z !== this.target);
    this.target = options[Math.floor(Math.random() * options.length)];
    this.zones.forEach(z => { this.tweens.killTweensOf(z.img); z.img.setAlpha(0.3).setScale(1 / R).setTint(0xffffff); });
    this.target.img.setAlpha(1).setTint(0xf1c40f);
    this.tweens.add({ targets: this.target.img, scale: 1.35 / R, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }

  placeForShot(first = false) {
    const x = GOAL_X - Phaser.Math.Between(330, 520), y = CY + Phaser.Math.Between(-320, 320);
    this.player.setPosition(x, y); this.player.vx = 0; this.player.vy = 0; this.player.facing = 0;
    this.ball.place(x + 22, y); this.ball.owner = this.player;
    if (!first) this.puff(x, y + 10, 3);
  }

  onShoot(power, aimY) {
    const isSuper = power >= 0.98;
    const ty = Math.abs(aimY) > 0.3 ? CY + Math.sign(aimY) * (GOAL_W / 2 - 30) : this.target.y;
    const spread = (1 - power * 0.4) * 0.5;
    const dy = ty - this.player.y + (Math.random() - 0.5) * GOAL_W * 0.25 * spread;
    const dx = GOAL_X - this.player.x;
    const speed = Phaser.Math.Linear(SHOT_MIN, SHOT_MAX, power) * (isSuper ? 1.28 : 1);
    this.kick(dx, dy, speed, isSuper ? 30 : 40 + power * power * 300 * Math.random(), isSuper);
    if (isSuper) this.praise('SUPER SHOT!', 'UNSTOPPABLE');
    this.shotLive = true; this.shotT = 2.2;
  }

  onPass(dx, dy) { this.onShoot(0.55, dy); void dx; }
  onBallOut() { this.endShot(0, this.ball.z >= 105 && Math.abs(this.ball.y - CY) < GOAL_W / 2 ? 'OVER THE BAR!' : 'WIDE!'); }

  endShot(points, label, x, y) {
    if (!this.shotLive) return;
    this.shotLive = false;
    if (points > 0) { this.streak++; this.addScore(points + (this.streak >= 3 ? 50 : 0), x, y, this.streak >= 3 ? `${label}  STREAK x${this.streak}!` : label); }
    else { this.streak = 0; this.praise(label, 'AIM FOR THE GOLD TARGET'); }
    this.time.delayedCall(650, () => { if (this.phase === 'play') { this.pickTarget(); this.placeForShot(); } });
  }

  tick(dt) {
    const b = this.ball, gk = this.gk;
    // keeper: track the ball, dive when it's coming
    const coming = this.shotLive && b.vx > 200;
    let ty = CY + Phaser.Math.Clamp((b.y - CY) * 0.7, -GOAL_W / 2, GOAL_W / 2), speed = 190;
    if (coming) {
      const t = Phaser.Math.Clamp((gk.x - b.x) / (b.vx || 1), 0, 1.2);
      ty = Phaser.Math.Clamp(b.y + b.vy * t, CY - GOAL_W / 2 + 10, CY + GOAL_W / 2 - 10);
      speed = 400;
    }
    gk.steer(GOAL_X - 36, ty, speed, dt, 9);
    gk.lockFacing = true; gk.facing = Math.PI;

    if (this.shotLive) {
      this.shotT -= dt;
      // save?
      if (!b.fire && dist(gk, b) < 34 && b.z < 120) {
        b.vx = -Math.abs(b.vx) * 0.35; b.vy += (Math.random() - 0.5) * 300; b.vz = 120;
        this.endShot(0, 'SAVED!'); sfx.kick(0.4); sfx.cheer(0.3); return;
      }
      if (b.fire && dist(gk, b) < 34 && b.z < 120) { sfx.cheer(0.5); } // keeper can't stop a super shot
      if (this.inRightGoal()) {
        const hit = this.zones.find(z => Math.abs(b.y - z.y) < 40);
        const onTarget = hit === this.target;
        const pts = onTarget ? this.target.pts * (b.fire ? 2 : 1) : 50;
        this.fx.confetti.explode(onTarget ? 60 : 20, b.x, b.y);
        sfx.net(); sfx.cheer(onTarget ? 0.8 : 0.4);
        this.endShot(pts, onTarget ? (b.fire ? 'SUPER ' + this.target.name : this.target.name) : 'GOAL!', b.x - 60, b.y);
        return;
      }
      if (this.shotT <= 0 || b.speed < 40) this.endShot(0, 'TOO SOFT!');
    }
  }
}
