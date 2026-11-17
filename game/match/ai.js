import { BOX_H, BOX_W, CX, CY, GOAL_W, PITCH_H, PITCH_W, PLAYER_SPEED, PX, PY } from './config.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
  const t = Phaser.Math.Clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}
function openness(ctx, m) {
  let best = 400;
  for (const o of ctx.players) if (o.team !== m.team) best = Math.min(best, dist(o, m));
  return best;
}
function laneBlocked(ctx, from, to) {
  for (const o of ctx.players) {
    if (o.team === from.team) continue;
    if (segDist(o.x, o.y, from.x, from.y, to.x, to.y) < 34 && dist(o, from) > 20) return true;
  }
  return false;
}

/** Best pass option for p. prefX/prefY = preferred direction (unit) or undefined. */
export function bestPass(ctx, p, prefX, prefY, minScore = -Infinity) {
  const dir = ctx.attackDir(p.team);
  let best = null, bs = minScore;
  for (const m of ctx.players) {
    if (m.team !== p.team || m === p || m.isGK) continue;
    const d = dist(m, p);
    if (d < 60 || d > 900) continue;
    const ux = (m.x - p.x) / d, uy = (m.y - p.y) / d;
    let s = 0;
    if (prefX !== undefined && prefY !== undefined) {
      const dot = ux * prefX + uy * prefY;
      if (dot < 0.15) continue;
      s += dot * 2.2;
    }
    s += (dir * (m.x - p.x)) / 500;
    s += Math.min(openness(ctx, m), 220) / 220;
    s -= d / 1100;
    if (laneBlocked(ctx, p, m)) s -= 1.4;
    // kids mode: AI teammates like giving the ball to the kid's player
    if (m === ctx.controlled && ctx.kids) s += ctx.kids.teammateBias;
    if (s > bs) { bs = s; best = m; }
  }
  return best;
}

export function updateAI(ctx, dt) {
  const { ball, players, diff } = ctx;
  const BASE = PLAYER_SPEED * diff.aiSpeed;
  const owner = ball.owner;
  const bpx = ball.x + ball.vx * 0.28, bpy = ball.y + ball.vy * 0.28;

  for (let team = 0; team < 2; team++) {
    const dir = ctx.attackDir(team);
    const mates = players.filter(p => p.team === team);
    const teamHasBall = !!owner && owner.team === team;
    const oppHasBall = !!owner && owner.team !== team;
    const locked = !!ctx.restartLock && ctx.restartLock.team !== team && ctx.restartLock.t > 0;
    // user's teammates run at the user's pace, opponents at difficulty pace
    const base = team === ctx.userTeam ? PLAYER_SPEED * 0.94 : BASE;

    const free = mates.filter(p => !p.isGK && !p.controlled).sort((a, b) => dist(a, { x: bpx, y: bpy }) - dist(b, { x: bpx, y: bpy }));
    let chaser1 = free[0] || null;
    const chaser2 = free[1] || null;
    if (ctx.receiver && ctx.receiver.team === team && !ctx.receiver.controlled) chaser1 = ctx.receiver;
    const ballInOwnHalf = dir * (ball.x - CX) < 0;

    for (const p of mates) {
      if (p.controlled) continue;
      if (p.isGK) { goalkeeper(ctx, p, dt, base); continue; }
      if (owner === p) { possess(ctx, p, dt, base); continue; }

      let tx = p.homeX + (ball.x - CX) * 0.45;
      let ty = p.homeY + (ball.y - CY) * 0.3;
      let speed = base * 0.78;

      if (teamHasBall) {
        tx += dir * (p.role === 'FWD' ? 220 : p.role === 'MID' ? 150 : 90);
        if (owner && dist(owner, { x: tx, y: ty }) < 160) ty += (ty >= owner.y ? 1 : -1) * 160;
        speed = base * 0.9;
      } else if (oppHasBall) tx -= dir * 110;

      const isChaser = !locked && !teamHasBall && (p === chaser1 || (p === chaser2 && (ballInOwnHalf || !owner)));
      if (isChaser) {
        const d = dist(p, ball);
        const t = Phaser.Math.Clamp(d / 420, 0, 0.6);
        tx = ball.x + ball.vx * t; ty = ball.y + ball.vy * t;
        if (owner) { tx = owner.x + owner.vx * 0.15; ty = owner.y + owner.vy * 0.15; }
        speed = base * 1.22;
      } else if (oppHasBall) {
        let mk = null, md = 230;
        for (const o of players) {
          if (o.team === team || o.isGK || o === owner) continue;
          const d = dist(o, { x: tx, y: ty });
          if (d < md) { md = d; mk = o; }
        }
        if (mk) { tx = mk.x - dir * 34; ty = mk.y; speed = base * 0.98; }
      }

      for (const m of mates) {
        if (m === p || m.isGK) continue;
        const d = dist(m, p);
        if (d < 85 && d > 0.1) { tx += ((p.x - m.x) / d) * (85 - d) * 1.4; ty += ((p.y - m.y) / d) * (85 - d) * 1.4; }
      }
      tx = Phaser.Math.Clamp(tx, PX + 25, PX + PITCH_W - 25);
      ty = Phaser.Math.Clamp(ty, PY + 25, PY + PITCH_H - 25);
      p.steer(tx, ty, speed, dt, 7);
    }
  }
}

function possess(ctx, p, dt, base) {
  const dir = ctx.attackDir(p.team);
  const goal = ctx.oppGoal(p.team);
  const isOpp = p.team !== ctx.userTeam;
  if (p.decisionT <= 0) {
    p.decisionT = 0.22 + Math.random() * 0.25;
    const dg = dist(p, goal);
    let nearest = null, nd = 1e9;
    for (const o of ctx.players) if (o.team !== p.team) { const d = dist(o, p); if (d < nd) { nd = d; nearest = o; } }
    const pressure = nd < 115;
    const inFront = nearest ? dir * (nearest.x - p.x) > -10 : false;

    const shootBias = isOpp ? ctx.diff.aiShoot : 1;
    const angleOk = Math.abs(p.y - CY) < 380 || dg < 240;
    if (dg < 470 && angleOk && (dg < 260 || Math.random() < (pressure ? 0.7 : 0.35) * shootBias)) {
      ctx.shoot(p, Phaser.Math.Clamp(dg / 520, 0.45, 1));
      return;
    }
    const mate = bestPass(ctx, p, undefined, undefined, pressure ? -0.2 : 0.95);
    if (mate && ((pressure && inFront) || Math.random() < 0.22)) { ctx.passTo(p, mate); return; }

    let tx = goal.x, ty = goal.y + (p.y - CY) * 0.35;
    if (pressure && nearest) {
      const side = Math.sign(p.y - nearest.y) || (Math.random() < 0.5 ? 1 : -1);
      ty = p.y + side * 170; tx = p.x + dir * 140;
    }
    p.targetX = Phaser.Math.Clamp(tx, PX + 30, PX + PITCH_W - 30);
    p.targetY = Phaser.Math.Clamp(ty, PY + 40, PY + PITCH_H - 40);
    p.wantSpeed = base * (pressure ? 1.12 : 0.98);
  }
  p.steer(p.targetX, p.targetY, p.wantSpeed, dt, 8);
}

function goalkeeper(ctx, p, dt, base) {
  const { ball } = ctx;
  const dir = ctx.attackDir(p.team);
  const goal = ctx.ownGoal(p.team);
  const lineX = goal.x + dir * 36;
  const owner = ball.owner;

  if (owner === p) {
    p.brake(dt);
    if (p.holdT <= 0) {
      const mate = bestPass(ctx, p, dir, 0, 0.6);
      if (mate && Math.random() < 0.55) ctx.passTo(p, mate);
      else ctx.kick(p, dir, (Math.random() - 0.5) * 0.9, 820, 480);
    }
    return;
  }
  const inBox = Math.abs(ball.x - goal.x) < BOX_W * 0.85 && Math.abs(ball.y - CY) < BOX_H / 2;
  const coming = !owner && ball.vx * dir < -180;
  let tx = lineX, ty = CY + Phaser.Math.Clamp((ball.y - CY) * 0.75, -GOAL_W / 2 - 15, GOAL_W / 2 + 15);
  let speed = base * 0.9;
  if (coming && Math.abs(ball.x - goal.x) < 520) {
    const t = Phaser.Math.Clamp((lineX - ball.x) / (ball.vx || 1), 0, 1.2);
    ty = Phaser.Math.Clamp(ball.y + ball.vy * t, CY - GOAL_W / 2 - 20, CY + GOAL_W / 2 + 20);
    tx = lineX + dir * 10;
    speed = p.team === ctx.userTeam ? 540 : ctx.diff.gkDive;
  } else if (inBox && (!owner || owner.team !== p.team) && dist(p, ball) < 240 && ball.speed < 320) {
    tx = ball.x; ty = ball.y; speed = base * 1.15;
  }
  p.steer(tx, ty, speed, dt, 10);
  p.lockFacing = true;
  p.facing = dir > 0 ? 0 : Math.PI;
}
