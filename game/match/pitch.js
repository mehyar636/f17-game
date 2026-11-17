import { BOX_H, BOX_W, CIRCLE_R, CX, CY, GOAL_D, GOAL_W, MARGIN, PEN_SPOT, PITCH_H, PITCH_W, POST_R, PX, PY, SIX_H, SIX_W, WORLD_H, WORLD_W } from './config.js';

/** Night stadium around the pitch: bowl, crowd, run-off grass, ad boards, floodlights, crowd flashes. */
export function buildStadium(scene, { walls = false, mood = 'night' } = {}) {
  const day = mood === 'day';
  scene.add.image(WORLD_W / 2, WORLD_H / 2, 'm_stadium').setDisplaySize(WORLD_W * 1.1, WORLD_H * 1.1).setAlpha(day ? 0.25 : 0.55).setDepth(-100);
  scene.add.rectangle(WORLD_W / 2, WORLD_H / 2, WORLD_W * 1.2, WORLD_H * 1.2, day ? 0x7dd3fc : 0x02040a, day ? 0.35 : 0.45).setDepth(-99);

  const RUN = 74, standT = MARGIN - RUN;
  const crowdTex = scene.textures.get('m_crowd').getSourceImage();
  const cs = standT / crowdTex.height;
  const mk = (x, y, w, h, angle) => scene.add.tileSprite(x, y, w, h, 'm_crowd').setTileScale(cs * 1.6, cs).setAngle(angle).setDepth(-50).setAlpha(0.95);
  mk(WORLD_W / 2, standT / 2, WORLD_W, standT, 0);
  mk(WORLD_W / 2, WORLD_H - standT / 2, WORLD_W, standT, 180);
  mk(standT / 2, WORLD_H / 2, WORLD_H - standT * 2, standT, 90);
  mk(WORLD_W - standT / 2, WORLD_H / 2, WORLD_H - standT * 2, standT, -90);
  const shade = scene.add.graphics().setDepth(-49);
  shade.fillStyle(0x060a14, day ? 0.06 : 0.38);
  shade.fillRect(0, 0, WORLD_W, standT); shade.fillRect(0, WORLD_H - standT, WORLD_W, standT);
  shade.fillRect(0, 0, standT, WORLD_H); shade.fillRect(WORLD_W - standT, 0, standT, WORLD_H);

  const grassTex = scene.textures.get('m_grass').getSourceImage();
  const gs = (PITCH_H / 2) / grassTex.height;
  scene.add.tileSprite(CX, CY, PITCH_W + RUN * 2, PITCH_H + RUN * 2, 'm_grass').setTileScale(gs).setDepth(-40).setTint(day ? 0xffffff : 0xb8c8b8);

  const ad = scene.add.graphics().setDepth(-39);
  const cols = [0x15803d, 0xf1c40f, 0x111827, 0xffffff];
  const T = 22, seg = 220;
  const ring = [
    { x: PX - RUN, y: PY - RUN - T, w: PITCH_W + RUN * 2, h: T, horiz: true },
    { x: PX - RUN, y: PY + PITCH_H + RUN, w: PITCH_W + RUN * 2, h: T, horiz: true },
    { x: PX - RUN - T, y: PY - RUN, w: T, h: PITCH_H + RUN * 2, horiz: false },
    { x: PX + PITCH_W + RUN, y: PY - RUN, w: T, h: PITCH_H + RUN * 2, horiz: false },
  ];
  ring.forEach(r => {
    const n = Math.ceil((r.horiz ? r.w : r.h) / seg);
    for (let i = 0; i < n; i++) {
      ad.fillStyle(cols[i % cols.length], 0.92);
      if (r.horiz) ad.fillRect(r.x + i * seg, r.y, Math.min(seg, r.w - i * seg), r.h);
      else ad.fillRect(r.x, r.y + i * seg, r.w, Math.min(seg, r.h - i * seg));
    }
    ad.lineStyle(2, 0x000000, 0.5); ad.strokeRect(r.x, r.y, r.w, r.h);
  });
  for (let i = 0; i < 5; i++) {
    const x = PX - RUN + 110 + i * (seg * 2) + seg * 0.5;
    [PY - RUN - T / 2, PY + PITCH_H + RUN + T / 2].forEach(y => {
      scene.add.text(x, y, i % 2 ? 'PRO ACADEMY' : 'F17', {
        fontFamily: '"Arial Black", Arial', fontSize: '13px', color: i % 2 ? '#111827' : '#f1c40f', fontStyle: 'bold', letterSpacing: 2,
      }).setOrigin(0.5).setDepth(-38);
    });
  }
  if (walls) {
    const wall = scene.add.graphics().setDepth(-37);
    wall.lineStyle(10, 0xf1c40f, 0.18); wall.strokeRect(PX - 14, PY - 14, PITCH_W + 28, PITCH_H + 28);
    wall.lineStyle(3, 0xffffff, 0.35); wall.strokeRect(PX - 14, PY - 14, PITCH_W + 28, PITCH_H + 28);
  }
  if (!day) [[0, 0], [WORLD_W, 0], [0, WORLD_H], [WORLD_W, WORLD_H]].forEach(([x, y]) => {
    scene.add.image(x, y, 'm_glow').setScale(3.6).setBlendMode(Phaser.BlendModes.ADD).setDepth(-30).setAlpha(0.9);
    scene.add.circle(x + (x ? -14 : 14), y + (y ? -14 : 14), 6, 0xfff7d6).setDepth(-29);
  });
  if (!day) [[CX - 620, CY], [CX, CY], [CX + 620, CY]].forEach(([x, y], i) => {
    scene.add.image(x, y, 'm_glow').setScale(4.6, 3).setBlendMode(Phaser.BlendModes.ADD).setDepth(-36).setAlpha(i === 1 ? 0.55 : 0.42);
  });
  const flashZone = (x, y, w, h) => scene.add.particles(0, 0, 'm_flash', {
    emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(x, y, w, h) },
    lifespan: { min: 90, max: 220 }, scale: { start: 0.32, end: 0.04 }, alpha: { start: 1, end: 0 },
    frequency: day ? 900 : 260, quantity: 1, blendMode: 'ADD',
  }).setDepth(-45);
  const flashEms = [
    flashZone(0, 0, WORLD_W, standT), flashZone(0, WORLD_H - standT, WORLD_W, standT),
    flashZone(0, standT, standT, WORLD_H - standT * 2), flashZone(WORLD_W - standT, standT, standT, WORLD_H - standT * 2),
  ];
  return { flashEms };
}

/** Pitch markings, nets and goal frames. */
export function buildPitch(scene) {
  const st = scene.add.graphics().setDepth(-35);
  const N = 14, sw = PITCH_W / N;
  for (let i = 0; i < N; i++) { st.fillStyle(i % 2 ? 0xffffff : 0x000000, i % 2 ? 0.055 : 0.07); st.fillRect(PX + i * sw, PY, sw, PITCH_H); }
  const g = scene.add.graphics().setDepth(-34);
  g.lineStyle(3.5, 0xffffff, 0.95);
  g.strokeRect(PX, PY, PITCH_W, PITCH_H);
  g.lineBetween(CX, PY, CX, PY + PITCH_H);
  g.strokeCircle(CX, CY, CIRCLE_R);
  g.fillStyle(0xffffff, 0.95); g.fillCircle(CX, CY, 5);
  [PX, PX + PITCH_W].forEach((gx, i) => {
    const d = i === 0 ? 1 : -1;
    g.strokeRect(Math.min(gx, gx + d * BOX_W), CY - BOX_H / 2, BOX_W, BOX_H);
    g.strokeRect(Math.min(gx, gx + d * SIX_W), CY - SIX_H / 2, SIX_W, SIX_H);
    g.fillCircle(gx + d * PEN_SPOT, CY, 5);
    g.beginPath();
    const a0 = i === 0 ? -0.93 : Math.PI - 0.93, a1 = i === 0 ? 0.93 : Math.PI + 0.93;
    g.arc(gx + d * PEN_SPOT, CY, CIRCLE_R, a0, a1, false);
    g.strokePath();
  });
  const r = 28;
  g.beginPath(); g.arc(PX, PY, r, 0, Math.PI / 2); g.strokePath();
  g.beginPath(); g.arc(PX + PITCH_W, PY, r, Math.PI / 2, Math.PI); g.strokePath();
  g.beginPath(); g.arc(PX, PY + PITCH_H, r, -Math.PI / 2, 0); g.strokePath();
  g.beginPath(); g.arc(PX + PITCH_W, PY + PITCH_H, r, Math.PI, Math.PI * 1.5); g.strokePath();

  [PX, PX + PITCH_W].forEach((gx, i) => {
    const d = i === 0 ? -1 : 1;
    const nx = Math.min(gx, gx + d * GOAL_D), ny = CY - GOAL_W / 2;
    const net = scene.add.graphics().setDepth(-33);
    net.fillStyle(0xffffff, 0.12); net.fillRect(nx, ny, GOAL_D, GOAL_W);
    net.lineStyle(1, 0xffffff, 0.35);
    for (let k = 0; k <= GOAL_W; k += 12) net.lineBetween(nx, ny + k, nx + GOAL_D, ny + k);
    for (let k = 0; k <= GOAL_D; k += 12) net.lineBetween(nx + k, ny, nx + k, ny + GOAL_W);
    const frame = scene.add.graphics().setDepth(5000);
    frame.lineStyle(5, 0xffffff, 1); frame.strokeRect(nx, ny, GOAL_D, GOAL_W);
    frame.fillStyle(0xffffff); frame.fillCircle(gx, ny, POST_R); frame.fillCircle(gx, ny + GOAL_W, POST_R);
    frame.fillStyle(0x000000, 0.25); frame.fillCircle(gx + 3, ny + 3, POST_R); frame.fillCircle(gx + 3, ny + GOAL_W + 3, POST_R);
  });
}
