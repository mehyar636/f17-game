import { BALL_FRICTION, BALL_R, CY, GOAL_W, PITCH_H, PITCH_W, POST_R, PX, PY } from './config.js';
import { sfx } from './sfx.js';
import { R } from './textures.js';

const GRAVITY = 1500;

export class Ball {
  constructor(scene, x, y) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.z = 0; this.vz = 0;
    this.owner = null; this.lastTouch = null;
    this.spin = 0;
    this.shadow = scene.add.image(x, y, 'm_shadow').setScale(0.42 / R, 0.4 / R).setAlpha(0.9);
    this.sprite = scene.add.image(x, y, 'm_ball');
    this.trail = [];
    this.trailT = 0;
    for (let i = 0; i < 6; i++) this.trail.push(scene.add.image(x, y, 'm_spot').setAlpha(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(1));
  }

  get speed() { return Math.hypot(this.vx, this.vy); }

  place(x, y) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.z = 0; this.vz = 0; this.owner = null;
    this.trail.forEach(t => t.setAlpha(0));
  }

  kick(dirX, dirY, speed, lift = 0) {
    const m = Math.hypot(dirX, dirY) || 1;
    this.vx = (dirX / m) * speed; this.vy = (dirY / m) * speed;
    this.vz = lift; if (lift > 0 && this.z < 1) this.z = 1;
    this.owner = null;
  }

  /** Free-ball physics. Returns 'post' when a post was hit. */
  update(dt) {
    let hit = null;
    if (this.owner) { this.z = 0; this.vz = 0; }
    else {
      const f = Math.pow(BALL_FRICTION, dt) * (this.z > 2 ? 1.01 : 1);
      this.vx *= Math.min(f, 1); this.vy *= Math.min(f, 1);
      if (this.z > 0 || this.vz > 0) {
        this.vz -= GRAVITY * dt;
        this.z += this.vz * dt;
        if (this.z <= 0) { this.z = 0; if (this.vz < -120) { this.vz = -this.vz * 0.45; sfx.bounce(); } else this.vz = 0; }
      }
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (this.speed < 6) { this.vx = 0; this.vy = 0; }
      const posts = [[PX, CY - GOAL_W / 2], [PX, CY + GOAL_W / 2], [PX + PITCH_W, CY - GOAL_W / 2], [PX + PITCH_W, CY + GOAL_W / 2]];
      for (const [px, py] of posts) {
        const dx = this.x - px, dy = this.y - py, d = Math.hypot(dx, dy), min = BALL_R + POST_R;
        if (d < min && d > 0 && this.z < 110) {
          const nx = dx / d, ny = dy / d, dot = this.vx * nx + this.vy * ny;
          if (dot < 0) { this.vx -= 2 * dot * nx * 0.85; this.vy -= 2 * dot * ny * 0.85; hit = 'post'; }
          this.x = px + nx * min; this.y = py + ny * min;
        }
      }
    }
    this.spin += (this.speed / BALL_R) * dt * (this.vx >= 0 ? 1 : -1);
    const h = this.z, s = 1.2 * (1 + h / 260);
    this.sprite.setPosition(this.x, this.y - h * 0.8).setScale(s / R).setRotation(this.spin).setDepth(this.y + 2 + h * 2);
    this.shadow.setPosition(this.x + h * 0.25, this.y + 6).setScale(0.42 / Math.sqrt(s) / R, 0.4 / Math.sqrt(s) / R)
      .setAlpha(Phaser.Math.Clamp(0.9 - h / 300, 0.3, 0.9)).setDepth(this.y - 1);
    this.trailT += dt;
    if (this.speed > 450 && this.trailT > 0.03) {
      this.trailT = 0;
      const t = this.trail.pop(); this.trail.unshift(t);
      t.setPosition(this.x, this.y - h * 0.8).setAlpha(0.55).setScale(0.9 / R).setDepth(this.y + 1);
    }
    this.trail.forEach(t => { if (t.alpha > 0) t.setAlpha(Math.max(0, t.alpha - dt * 2.2)).setScale(t.scale * 0.985); });
    return hit;
  }

  outside() {
    if (this.x < PX - BALL_R) return 'left';
    if (this.x > PX + PITCH_W + BALL_R) return 'right';
    if (this.y < PY - BALL_R) return 'top';
    if (this.y > PY + PITCH_H + BALL_R) return 'bottom';
    return null;
  }
}
