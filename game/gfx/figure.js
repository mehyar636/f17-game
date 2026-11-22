// A 3D footballer: a realistic rigged player model (Microsoft Rocketbox, MIT licence — see game/assets/players/LICENSE.md)
// with its own motion capture (idle / walk / run / sprint / cheering), team kits painted onto its texture, and authored
// football actions (shoot, pass, slide tackle, keeper dive …) layered on the skeleton in character space.
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

export { THREE };
const DIR = 'game/assets/players/';
export const PLAYER_H = 3.5;                 // world units (slightly larger than life so players read well)
const MODEL_CM = 180;                        // the model's height in its own units
const D2R = Math.PI / 180;
export const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const lumOf = (c) => (0.299 * ((c >> 16) & 255) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255)) / 255;
const css = (c) => '#' + c.toString(16).padStart(6, '0');
const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

// world px/s at which each locomotion clip's feet match the ground (from the clips' own root motion)
const GAIT = { walk: 39, run: 113, sprint: 225 };
const GAIT_PHASE = { walk: 0, run: 0, sprint: 0 };   // cycle offsets so all three gaits plant the same foot together
const KICK_START = 0.2;                              // the mocap kicks strike at 0.3 s; we join them just before

let modelPromise = null, lib = null;
const loadImage = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('image ' + src)); i.src = src; });

function buildClips(data) {
  const clips = {};
  for (const [name, c] of Object.entries(data.clips)) {
    const times = new Float32Array(c.n); for (let i = 0; i < c.n; i++) times[i] = (i / (c.n - 1)) * c.dur;
    const tracks = [];
    data.bones.forEach((b, i) => { if (c.q[i]) tracks.push(new THREE.QuaternionKeyframeTrack(b + '.quaternion', times, c.q[i])); });
    if (c.pos.length) {
      // keep the hips' bob but take out the travel, so every clip plays on the spot
      const p = Float32Array.from(c.pos), n = c.n, dz = p[(n - 1) * 3 + 2] - p[2], dx = p[(n - 1) * 3] - p[0];
      const loco = Math.abs(dz) > 30;
      for (let i = 0; i < n; i++) { const u = i / (n - 1); p[i * 3] = loco ? 0 : p[i * 3] - dx * u; p[i * 3 + 2] = loco ? 0 : p[i * 3 + 2] - (dz) * u; }
      tracks.push(new THREE.VectorKeyframeTrack('Bip01.position', times, p));
    }
    clips[name] = new THREE.AnimationClip(name, c.dur, tracks);
  }
  return clips;
}

export function loadModel() {
  if (!modelPromise) {
    const fbx = (u) => new Promise((res, rej) => new FBXLoader().load(u, res, undefined, rej));
    // the FBX files point at textures we don't ship; silence those lookups (we paint our own)
    modelPromise = Promise.all([
      fbx(DIR + 'player_a.fbx'), fetch(DIR + 'anims.json').then((r) => { if (!r.ok) throw new Error('anims'); return r.json(); }),
      loadImage(DIR + 'a_body.png'), loadImage(DIR + 'a_head.png'),
    ]).then(([model, anims, body, head]) => {
      lib = { model, clips: buildClips(anims), body, head };
      return lib;
    });
    modelPromise.catch(() => { modelPromise = null; });
  }
  return modelPromise;
}

let shared = null;
/** One WebGL renderer on #view3d, shared by the match view and the menu stage. */
export function sharedRenderer() {
  if (shared) return shared;
  const canvas = document.getElementById('view3d');
  if (!canvas) throw new Error('no #view3d canvas');
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.12;
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  shared = { renderer: r, canvas, owner: null };
  return shared;
}

export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d', { willReadFrequently: true }), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export function labelSprite(text, color) {
  const tex = canvasTex(256, 96, (g) => {
    g.font = '800 58px "Barlow Condensed", "Arial Narrow", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 12; g.strokeStyle = 'rgba(0,0,0,0.9)'; g.strokeText(text, 128, 50);
    g.fillStyle = color; g.fillText(text, 128, 50);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(3.4, 1.28, 1); s.renderOrder = 10;
  return s;
}

/** A real football: 12 black pentagons + 20 white hexagons (truncated icosahedron), stitched seams. */
let ballTex = null;
export function ballTexture() {
  if (ballTex) return ballTex;
  const t = (1 + Math.sqrt(5)) / 2, verts = [];
  for (const a of [-1, 1]) for (const b of [-t, t]) { verts.push([0, a, b], [a, b, 0], [b, 0, a]); }
  const norm = (v) => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; };
  const P = verts.map(norm), F = [];
  for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) for (let k = j + 1; k < 12; k++) {
    const d = (a, b) => P[a][0] * P[b][0] + P[a][1] * P[b][1] + P[a][2] * P[b][2];
    if (d(i, j) > 0.4 && d(j, k) > 0.4 && d(i, k) > 0.4) F.push(norm([P[i][0] + P[j][0] + P[k][0], P[i][1] + P[j][1] + P[k][1], P[i][2] + P[j][2] + P[k][2]]));
  }
  const W = 1024, H = 512;
  ballTex = canvasTex(W, H, (g) => {
    const img = g.createImageData(W, H), d = img.data;
    for (let y = 0; y < H; y++) {
      const th = (y + 0.5) / H * Math.PI, st = Math.sin(th), cy = Math.cos(th);
      for (let x = 0; x < W; x++) {
        const ph = (x + 0.5) / W * Math.PI * 2, dx = st * Math.cos(ph), dz = st * Math.sin(ph);
        // weighted nearest-centre: pentagon centres (icosahedron corners) get a smaller cell than hexagon centres
        let b1 = -9, b2 = -9, pent = false;
        for (let i = 0; i < 12; i++) { const s = (dx * P[i][0] + cy * P[i][1] + dz * P[i][2]) - 0.062; if (s > b1) { b2 = b1; b1 = s; pent = true; } else if (s > b2) b2 = s; }
        for (let i = 0; i < 20; i++) { const s = dx * F[i][0] + cy * F[i][1] + dz * F[i][2]; if (s > b1) { b2 = b1; b1 = s; pent = false; } else if (s > b2) b2 = s; }
        const edge = b1 - b2, seam = Math.min(1, edge / 0.012), puff = Math.min(1, edge / 0.09);
        const base = pent ? 26 : 242, c = base * (0.8 + 0.2 * puff) * (0.35 + 0.65 * seam) + (pent ? 14 * puff : 0);
        const i4 = (y * W + x) * 4; d[i4] = c; d[i4 + 1] = c; d[i4 + 2] = pent ? c + 4 : c; d[i4 + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  });
  ballTex.anisotropy = 16;
  return ballTex;
}
export function ballMaterial() { return new THREE.MeshPhysicalMaterial({ map: ballTexture(), roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.3 }); }

// ─── Kit + skin painting ────────────────────────────────────────────────────────
// The model ships in a black / white striped kit. We repaint it per player: the dark and light cloth map to the
// team's colours (keeping the fabric shading), the trim follows, skin and hair are tinted, name + number are drawn.
const SKIN_TINT = [[1, 1, 1], [0.97, 0.92, 0.88], [0.86, 0.76, 0.68], [0.72, 0.6, 0.5], [0.56, 0.44, 0.36], [0.44, 0.33, 0.27]];

function bodyTexture(spec, S) {
  return canvasTex(S, S, (g) => {
    g.drawImage(lib.body, 0, 0, S, S);
    const img = g.getImageData(0, 0, S, S), d = img.data;
    const stripes = spec.pattern === 'stripes' || spec.pattern === 'hoops';
    const A = rgb(spec.jersey), B = rgb(stripes ? spec.trim : (spec.jerseyLight ?? spec.jersey)), TR = rgb(spec.trim);
    const SH = rgb(spec.shorts), SO = rgb(spec.socks), SOB = rgb(lumOf(spec.socks) > 0.5 ? spec.shorts : spec.trim), tint = spec.tint || SKIN_TINT[0], boot = rgb(spec.boots ?? 0xffffff);
    for (let y = 0; y < S; y++) {
      const v = y / S;
      for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4, r = d[i], gg = d[i + 1], b = d[i + 2], u = x / S;
        if (r + gg + b < 12) continue;                                                     // outside the UV islands
        const L = (r + gg + b) / 765;
        const orange = r > 140 && gg < r * 0.55 && b < r * 0.4;
        const skin = !orange && r > 90 && r > gg * 1.08 && gg > b * 1.02 && r - b > 25 && r - b < 150 && L > 0.3;
        if (skin && spec.gk && v > 0.585) {                                              // keeper: long sleeves, then gloves
          const kk = 0.5 + L * 0.85;
          if (v > 0.868) { const s2 = (Math.floor(u * 60) + Math.floor(v * 60)) % 7 === 0 ? 0.72 : 1; d[i] = Math.min(255, 250 * kk * s2); d[i + 1] = Math.min(255, 250 * kk * s2); d[i + 2] = Math.min(255, 252 * kk * s2); }
          else if (v > 0.845) { d[i] = TR[0] * kk; d[i + 1] = TR[1] * kk; d[i + 2] = TR[2] * kk; }
          else { d[i] = Math.min(255, A[0] * kk); d[i + 1] = Math.min(255, A[1] * kk); d[i + 2] = Math.min(255, A[2] * kk); }
          continue;
        }
        if (skin) { d[i] = r * tint[0]; d[i + 1] = gg * tint[1]; d[i + 2] = b * tint[2]; continue; }
        const side = u < 0.5 ? u : 1 - u;
        if (v > 0.715 && side > 0.2 && side < 0.345) {                                     // boots
          d[i] = r * boot[0] / 255; d[i + 1] = gg * boot[1] / 255; d[i + 2] = b * boot[2] / 255; continue;
        }
        const t = smooth(0.28, 0.6, L), shade = t < 0.5 ? Math.min(1.15, 0.8 + L * 1.4) : Math.min(1.05, Math.max(0.78, 0.42 + 0.64 * L));
        let lo, hi;
        if (v < 0.218 && side < 0.29) { lo = SH; hi = TR; }                               // shorts (+ swoosh)
        else if (v > 0.3 && v < 0.585 && side < 0.275) { lo = SOB; hi = SO; }              // socks (+ bands)
        else { lo = A; hi = B; }                                                           // shirt + sleeves
        const c = orange ? TR : [lo[0] + (hi[0] - lo[0]) * t, lo[1] + (hi[1] - lo[1]) * t, lo[2] + (hi[2] - lo[2]) * t];
        const k = orange ? 0.7 + L * 0.9 : shade;
        d[i] = Math.min(255, c[0] * k); d[i + 1] = Math.min(255, c[1] * k); d[i + 2] = Math.min(255, c[2] * k);
      }
    }
    g.putImageData(img, 0, 0);
    // lettering (texture space: the back panel is upside-down)
    const k = S / 1024, J = css(spec.jersey);
    const ink = lumOf(spec.jersey) > 0.6 ? (lumOf(spec.trim) < 0.5 ? css(spec.trim) : '#111827') : (lumOf(spec.trim) > 0.55 ? css(spec.trim) : '#ffffff');
    const plate = (x, y, w, h, col, rad = 14) => { g.fillStyle = col; g.beginPath(); g.roundRect(x * k, y * k, w * k, h * k, rad * k); g.fill(); };
    plate(428, 196, 174, 228, J); plate(283, 430, 20, 62, J, 2);
    plate(146, 146, 60, 54, css(spec.shorts), 4); plate(822, 182, 52, 16, css(spec.shorts), 2);
    g.save(); g.translate(515 * k, 310 * k); g.rotate(Math.PI); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = ink;
    g.font = `800 ${Math.round(150 * k)}px "Barlow Condensed", "Arial Narrow", Arial`; g.fillText(String(spec.num ?? ''), 0, 22 * k);
    if (spec.name) { g.font = `700 ${Math.round(40 * k)}px "Barlow Condensed", "Arial Narrow", Arial`; g.fillText(String(spec.name).slice(0, 10), 0, -84 * k); }
    g.restore();
    plate(436, 566, 156, 128, J);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = ink;
    g.font = `800 ${Math.round(60 * k)}px "Barlow Condensed", "Arial Narrow", Arial`; g.fillText(String(spec.sponsor || 'F17').slice(0, 5), 514 * k, 648 * k);
    g.font = `800 ${Math.round(34 * k)}px "Barlow Condensed", "Arial Narrow", Arial`; g.fillText(String(spec.num ?? ''), 552 * k, 594 * k);
    g.fillStyle = css(spec.trim); g.beginPath(); g.arc(476 * k, 594 * k, 13 * k, 0, 7); g.fill();
  });
}

function headTexture(spec, S) {
  return canvasTex(S, S, (g) => {
    g.drawImage(lib.head, 0, 0, S, S);
    const img = g.getImageData(0, 0, S, S), d = img.data, tint = spec.tint || SKIN_TINT[0], H = rgb(spec.hair), hl = lumOf(spec.hair);
    for (let y = 0; y < S; y++) {
      const v = y / S; if (v > 0.74) break;
      for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4, r = d[i], gg = d[i + 1], b = d[i + 2], u = x / S;
        if (r + gg + b < 12) continue;
        if (v > 0.6 && u < 0.37) continue;                                                 // eyes / mouth interior
        const L = (r + gg + b) / 765, face = u > 0.36 && u < 0.64 && v > 0.17;
        const hair = !face && v < 0.47 && L < 0.5 && r - b < 75;
        if (hair) { const k = 0.5 + L * (hl > 0.5 ? 2.1 : 1.7); d[i] = Math.min(255, H[0] * k); d[i + 1] = Math.min(255, H[1] * k); d[i + 2] = Math.min(255, H[2] * k); }
        else if (face && L < 0.42 && v < 0.33 && hl > 0.5) { d[i] = r * 1.5 + 30; d[i + 1] = gg * 1.5 + 22; d[i + 2] = b * 1.4; }   // lighter brows for fair hair
        else { d[i] = r * tint[0]; d[i + 1] = gg * tint[1]; d[i + 2] = b * tint[2]; }
      }
    }
    g.putImageData(img, 0, 0);
  });
}

// ─── Authored actions ───────────────────────────────────────────────────────────
// Angles are degrees in CHARACTER space (x = left, y = up, z = forward), added on top of the mocap pose:
//   legs / arms: -x swings forward, +x back;  knee bend: +x;  left arm out: +z, right arm out: -z
//   torso: +x leans forward;  +y turns left.   root = { y: lift (units), pitch: +forward, roll: +right } (degrees)
// All actions are authored right-footed / to the left and mirrored when needed.
const K = (t, pose, root) => ({ t, pose: pose || {}, root: root || {} });
const ACTIONS = {
  shoot: { dur: 0.72, in: 0.04, out: 0.2, damp: 0.9, keys: [
    K(0, { RightUpLeg: [38, 0, 0], RightLeg: [85, 0, 0], LeftUpLeg: [-14, 0, 0], LeftLeg: [20, 0, 0], Spine: [10, 0, 0], Spine2: [0, -20, 0], Hips: [0, -12, 0], LeftArm: [-30, 0, 48], RightArm: [42, 0, -22] }),
    K(0.08, { RightUpLeg: [-46, 0, 0], RightLeg: [12, 0, 0], RightFoot: [30, 0, 0], LeftUpLeg: [8, 0, 0], LeftLeg: [18, 0, 0], Spine: [15, 0, 0], Spine2: [0, 10, 0], Hips: [0, 10, 0], LeftArm: [10, 0, 62], RightArm: [-20, 0, -36] }),
    K(0.22, { RightUpLeg: [-90, 0, 0], RightLeg: [8, 0, 0], RightFoot: [26, 0, 0], LeftUpLeg: [14, 0, 0], LeftLeg: [6, 0, 0], LeftFoot: [22, 0, 0], Spine: [-5, 0, 0], Spine2: [0, 22, 0], Hips: [0, 18, 0], LeftArm: [24, 0, 72], RightArm: [-46, 0, -30] }, { y: 0.38 }),
    K(0.44, { RightUpLeg: [-30, 0, 0], RightLeg: [46, 0, 0], LeftUpLeg: [5, 0, 0], LeftLeg: [22, 0, 0], Spine: [12, 0, 0], LeftArm: [0, 0, 30], RightArm: [0, 0, -24] }),
    K(0.72, {}),
  ] },
  pass: { dur: 0.46, in: 0.04, out: 0.16, damp: 0.7, keys: [
    K(0, { RightUpLeg: [20, -30, 0], RightLeg: [38, 0, 0], Spine: [6, 0, 0], LeftArm: [0, 0, 24], RightArm: [12, 0, -12] }),
    K(0.07, { RightUpLeg: [-28, -50, 0], RightLeg: [6, 0, 0], RightFoot: [0, -22, 0], Spine: [10, 0, 0], Spine2: [0, 10, 0], LeftArm: [-12, 0, 36], RightArm: [16, 0, -16] }),
    K(0.2, { RightUpLeg: [-44, -45, 0], RightLeg: [10, 0, 0], Spine: [4, 0, 0], Spine2: [0, 14, 0], LeftArm: [-6, 0, 30], RightArm: [10, 0, -14] }),
    K(0.46, {}),
  ] },
  slide: { dur: 0.86, in: 0.08, out: 0.2, damp: 1, keys: [
    K(0, { Spine: [14, 0, 0] }, { pitch: -18 }),
    K(0.12, { RightUpLeg: [-6, 0, 0], RightFoot: [22, 0, 0], LeftUpLeg: [-52, 0, -12], LeftLeg: [120, 0, 0], Spine: [28, 0, 0], Spine1: [18, 0, 0], Neck: [14, 0, 0], LeftArm: [58, 0, 36], RightArm: [58, 0, -36] }, { pitch: -70, y: 0.12 }),
    K(0.44, { RightUpLeg: [-8, 0, 0], RightFoot: [22, 0, 0], LeftUpLeg: [-50, 0, -12], LeftLeg: [116, 0, 0], Spine: [30, 0, 0], Spine1: [18, 0, 0], Neck: [14, 0, 0], LeftArm: [58, 0, 36], RightArm: [58, 0, -36] }, { pitch: -68, y: 0.12 }),
    K(0.66, { LeftUpLeg: [-34, 0, 0], LeftLeg: [66, 0, 0], RightUpLeg: [-20, 0, 0], RightLeg: [40, 0, 0], Spine: [24, 0, 0], LeftArm: [20, 0, 30], RightArm: [20, 0, -30] }, { pitch: -24 }),
    K(0.86, {}),
  ] },
  poke: { dur: 0.42, in: 0.05, out: 0.16, damp: 0.6, keys: [
    K(0, {}),
    K(0.09, { RightUpLeg: [-58, 0, 0], RightLeg: [6, 0, 0], LeftUpLeg: [20, 0, 0], LeftLeg: [28, 0, 0], Spine: [18, 0, 0], LeftArm: [20, 0, 42], RightArm: [22, 0, -42] }),
    K(0.22, { RightUpLeg: [-46, 0, 0], RightLeg: [10, 0, 0], LeftUpLeg: [16, 0, 0], LeftLeg: [24, 0, 0], Spine: [14, 0, 0], LeftArm: [14, 0, 34], RightArm: [16, 0, -34] }),
    K(0.42, {}),
  ] },
  stumble: { dur: 0.55, in: 0.06, out: 0.2, damp: 0.5, keys: [
    K(0, {}),
    K(0.12, { Spine: [30, 0, 0], Spine1: [8, 0, 6], Neck: [-12, 0, 0], LeftArm: [-44, 0, 52], RightArm: [-30, 0, -58], LeftUpLeg: [-26, 0, 0], LeftLeg: [44, 0, 0] }, { pitch: 8 }),
    K(0.3, { Spine: [20, 0, 0], LeftArm: [-20, 0, 40], RightArm: [-14, 0, -44], RightUpLeg: [-22, 0, 0], RightLeg: [36, 0, 0] }, { pitch: 5 }),
    K(0.55, {}),
  ] },
  dive: { dur: 1.1, in: 0.06, out: 0.22, damp: 1, keys: [   // to the keeper's left; mirrored for the right
    K(0, { LeftUpLeg: [-24, 0, 0], LeftLeg: [44, 0, 0], RightUpLeg: [-24, 0, 0], RightLeg: [44, 0, 0], Spine: [14, 0, 0], LeftArm: [0, 0, 60], RightArm: [0, 0, -40] }, { y: -0.12 }),
    K(0.12, { LeftArm: [-10, 0, 120], RightArm: [-20, 0, -110], RightUpLeg: [10, 0, 0], RightLeg: [10, 0, 0], LeftUpLeg: [-18, 0, 0], LeftLeg: [30, 0, 0] }, { roll: -34, y: 0.3 }),
    K(0.3, { LeftArm: [-6, 0, 158], RightArm: [-14, 0, -150], LeftForeArm: [0, 0, 0], RightUpLeg: [14, 0, -8], RightLeg: [22, 0, 0], LeftUpLeg: [-12, 0, 0], LeftLeg: [16, 0, 0], Neck: [0, 0, -12] }, { roll: -80, y: 1.05 }),
    K(0.48, { LeftArm: [-6, 0, 160], RightArm: [-20, 0, -140], RightUpLeg: [10, 0, -10], RightLeg: [34, 0, 0], LeftUpLeg: [-16, 0, 0], LeftLeg: [24, 0, 0] }, { roll: -88, y: 0.42 }),
    K(0.78, { LeftArm: [-6, 0, 140], RightArm: [-30, 0, -90], RightUpLeg: [-20, 0, -10], RightLeg: [60, 0, 0], LeftUpLeg: [-20, 0, 0], LeftLeg: [30, 0, 0] }, { roll: -84, y: 0.42 }),
    K(1.1, {}),
  ] },
  catch: { dur: 0.5, in: 0.06, out: 0.2, damp: 0.6, keys: [
    K(0, {}),
    K(0.1, { LeftArm: [-70, 0, -12], RightArm: [-70, 0, 12], LeftForeArm: [-60, 0, 0], RightForeArm: [-60, 0, 0], Spine: [16, 0, 0], LeftUpLeg: [-16, 0, 0], LeftLeg: [30, 0, 0], RightUpLeg: [-16, 0, 0], RightLeg: [30, 0, 0] }, { y: -0.06 }),
    K(0.5, {}),
  ] },
};

// Looping layers: fn(t, phase) → { pose, root }
const LOOPS = {
  ready: () => ({ pose: { LeftUpLeg: [-28, 0, 4], RightUpLeg: [-28, 0, -4], LeftLeg: [50, 0, 0], RightLeg: [50, 0, 0], LeftFoot: [-20, 0, 0], RightFoot: [-20, 0, 0], Spine: [18, 0, 0], Neck: [-10, 0, 0], LeftArm: [-22, 0, 34], RightArm: [-22, 0, -34], LeftForeArm: [-46, 0, 0], RightForeArm: [-46, 0, 0] }, root: { y: -0.16 } }),
  hold: () => ({ pose: { LeftArm: [-58, 0, -14], RightArm: [-58, 0, 14], LeftForeArm: [-72, 0, 0], RightForeArm: [-72, 0, 0], Spine: [-4, 0, 0] }, root: {} }),
  pump: (t) => { const j = Math.abs(Math.sin(t * Math.PI / 0.62)), s = Math.sin(t * Math.PI * 2 / 0.62);
    return { pose: { RightArm: [-150, 0, -14], RightForeArm: [-40 - 30 * s, 0, 0], LeftArm: [-24, 0, 28], LeftForeArm: [-60, 0, 0], LeftUpLeg: [-22 * j, 0, 0], LeftLeg: [44 * j, 0, 0], RightUpLeg: [-10 * j, 0, 0], RightLeg: [30 * j, 0, 0], Spine: [-8, 0, 0], Neck: [-12, 0, 0] }, root: { y: j * 1.15 } }; },
  cheer: (t, ph) => { const j = Math.abs(Math.sin((t + ph) * Math.PI / 0.55));
    return { pose: { LeftArm: [-10, 0, 150 + 14 * j], RightArm: [-10, 0, -150 - 14 * j], LeftUpLeg: [-14 * j, 0, 0], LeftLeg: [30 * j, 0, 0], RightUpLeg: [-14 * j, 0, 0], RightLeg: [30 * j, 0, 0], Spine: [-6, 0, 0], Neck: [-10, 0, 0] }, root: { y: j * 0.8 } }; },
  wide: (t) => { const b = Math.sin(t * 5) * 4;                    // knee slide, arms wide
    return { pose: { LeftUpLeg: [-8, 0, 6], RightUpLeg: [-8, 0, -6], LeftLeg: [98, 0, 0], RightLeg: [98, 0, 0], LeftFoot: [42, 0, 0], RightFoot: [42, 0, 0], Spine: [-16, 0, 0], Spine2: [-6, 0, 0], Neck: [-16, 0, 0], LeftArm: [0, 0, 118 + b], RightArm: [0, 0, -118 - b] }, root: { y: -0.84, pitch: -6 } }; },
  dejected: (t) => ({ pose: { Spine: [13, 0, 0], Spine2: [6, 0, 0], Neck: [22, 0, 0], Head: [12 + Math.sin(t * 1.4) * 3, Math.sin(t * 0.9) * 10, 0], LeftArm: [0, 0, 6], RightArm: [0, 0, -6] }, root: {} }),
  juggle: (t) => { const u = (t % 0.9) / 0.9, k = Math.max(0, Math.sin(u * Math.PI * 2));   // gentle keepy-uppy for the menu hero
    return { pose: { RightUpLeg: [-62 * k, 0, 0], RightLeg: [70 * k, 0, 0], RightFoot: [-18 * k, 0, 0], Spine: [6 * k, 0, 0], LeftArm: [0, 0, 22 + 10 * k], RightArm: [0, 0, -22 - 10 * k], Neck: [14 * k, 0, 0] }, root: {} }; },
};

// Pose names (authored once, model-agnostic) → this model's bones, applied parent-first.
const BONE = {
  Hips: 'Bip01', Spine: 'Bip01_Spine1', Spine1: 'Bip01_Spine2', Spine2: 'Bip01_Spine2', Neck: 'Bip01_Neck', Head: 'Bip01_Head',
  LeftShoulder: 'Bip01_L_Clavicle', LeftArm: 'Bip01_L_UpperArm', LeftForeArm: 'Bip01_L_Forearm', LeftHand: 'Bip01_L_Hand',
  RightShoulder: 'Bip01_R_Clavicle', RightArm: 'Bip01_R_UpperArm', RightForeArm: 'Bip01_R_Forearm', RightHand: 'Bip01_R_Hand',
  LeftUpLeg: 'Bip01_L_Thigh', LeftLeg: 'Bip01_L_Calf', LeftFoot: 'Bip01_L_Foot', RightUpLeg: 'Bip01_R_Thigh', RightLeg: 'Bip01_R_Calf', RightFoot: 'Bip01_R_Foot',
};
const ORDER = ['Bip01', 'Bip01_Spine1', 'Bip01_Spine2', 'Bip01_Neck', 'Bip01_Head', 'Bip01_L_Clavicle', 'Bip01_L_UpperArm', 'Bip01_L_Forearm', 'Bip01_L_Hand',
  'Bip01_R_Clavicle', 'Bip01_R_UpperArm', 'Bip01_R_Forearm', 'Bip01_R_Hand', 'Bip01_L_Thigh', 'Bip01_L_Calf', 'Bip01_L_Foot', 'Bip01_R_Thigh', 'Bip01_R_Calf', 'Bip01_R_Foot'];
const mirrorName = (n) => (n.startsWith('Left') ? 'Right' + n.slice(4) : n.startsWith('Right') ? 'Left' + n.slice(5) : n);
// celebration loops that use real motion capture instead of an authored pose
const MOCAP_LOOP = { pump: ['cheer3'], cheer: ['cheer4', 'clap', 'cheer3'] };
const _P = new THREE.Quaternion(), _Pi = new THREE.Quaternion(), _D = new THREE.Quaternion(), _E = new THREE.Euler();

export const ACTION_DEFS = ACTIONS;

export class Figure {
  /**
   * spec: { jersey, jerseyLight, trim, shorts, socks, pattern, tint, hair, boots, gk, num, name, sponsor, height, leftFoot, shadow, texSize }
   */
  constructor(_lib, spec) {
    this.spec = spec;
    const root = this.root = SkeletonUtils.clone(lib.model);
    root.rotation.order = 'YXZ';
    this.unit = (spec.height || PLAYER_H) / PLAYER_H;
    this.scale = (spec.height || PLAYER_H) / MODEL_CM;
    root.scale.setScalar(this.scale);
    this.bones = {};
    const S = spec.texSize || 512;
    this.bodyTex = bodyTexture(spec, S); this.headTex = headTexture(spec, Math.min(512, S));
    this.mats = [new THREE.MeshStandardMaterial({ map: this.bodyTex, roughness: 0.78 }), new THREE.MeshStandardMaterial({ map: this.headTex, roughness: 0.7 })];
    root.traverse((o) => {
      if (o.isSkinnedMesh) {
        const src = Array.isArray(o.material) ? o.material : [o.material];
        o.material = src.map((m) => (/head/i.test(m.name) ? this.mats[1] : this.mats[0]));
        o.castShadow = spec.shadow !== false; o.frustumCulled = false; this.mesh = o;
      }
      if (o.isBone) this.bones[o.name] = o;
    });
    this.mixer = new THREE.AnimationMixer(root);
    this.act = {};
    for (const n of ['idle', 'walk', 'run', 'sprint', 'cheer3', 'cheer4', 'clap']) {
      const c = lib.clips[n]; if (!c) continue;
      const a = this.act[n] = this.mixer.clipAction(c); a.play(); a.setEffectiveWeight(n === 'idle' ? 1 : 0);
    }
    for (const n of ['walk', 'run', 'sprint']) this.act[n].paused = true;          // we set their time from one shared stride cycle
    this.durs = { walk: lib.clips.walk.duration, run: lib.clips.run.duration, sprint: lib.clips.sprint.duration };
    this.cycle = Math.random();
    this.kicks = ['kickA', 'kickB', 'kickC'].filter((n) => lib.clips[n]).map((n) => { const a = this.mixer.clipAction(lib.clips[n]); a.play(); a.paused = true; a.setEffectiveWeight(0); return a; });
    this.kick = null; this.strafeW = 0; this.strafeT = 0;
    if (spec.gk) ['Bip01_L_Hand', 'Bip01_R_Hand'].forEach((n) => { if (this.bones[n]) this.bones[n].scale.setScalar(1.32); });
    this.act.idle.time = Math.random() * 6;
    this.w = { idle: 1, walk: 0, run: 0, sprint: 0 }; this.cw = { cheer3: 0, cheer4: 0, clap: 0 };
    this.yaw = 0; this.yawRate = 0; this.bank = 0; this.lean = 0;
    this.action = null; this.loopName = null; this.loopW = 0; this.loopT = 0; this.loopPrev = null; this.phase = Math.random();
    this.stance = 0; this.charge = 0; this.look = 0; this.rootOff = { y: 0, pitch: 0, roll: 0 };
    this.acc = new Map(); this.rec = new Map(); this.x = 0; this.z = 0; this.baseY = 0;
  }

  /** One-shot action. opts.mirror flips left/right. */
  play(name, opts = {}) {
    if (name === 'shoot' && this.kicks.length) {                                   // real motion-captured strike
      const a = this.kicks[Math.floor(Math.random() * this.kicks.length)];
      this.kick = { a, t: KICK_START, end: Math.min(a.getClip().duration, 1.02) }; this.action = null; return;
    }
    const def = ACTIONS[name]; if (!def) return;
    this.action = { def, t: 0, mirror: !!opts.mirror !== !!(this.spec.leftFoot && (name === 'shoot' || name === 'pass' || name === 'poke')) };
  }

  /** Looping layer (celebration, keeper stance …) or null. */
  setLoop(name) {
    if (name === this.loopName) return;
    if (this.loopName && this.loopW > 0.05 && LOOPS[this.loopName] && !MOCAP_LOOP[this.loopName]) this.loopPrev = { name: this.loopName, w: this.loopW, t: this.loopT };
    this.loopName = name; this.loopW = 0; this.loopT = 0;
    if (name && MOCAP_LOOP[name]) { const opts = MOCAP_LOOP[name]; this.mocap = opts[Math.floor(this.phase * opts.length) % opts.length]; const a = this.act[this.mocap]; if (a) a.time = this.phase * 1.5; }
    else this.mocap = null;
  }

  addPose(pose, w, mirror) {
    for (const n in pose) {
      const v = pose[n], key = BONE[mirror ? mirrorName(n) : n]; if (!key) continue;
      let a = this.acc.get(key); if (!a) { a = [0, 0, 0]; this.acc.set(key, a); }
      a[0] += v[0] * w; a[1] += (mirror ? -v[1] : v[1]) * w; a[2] += (mirror ? -v[2] : v[2]) * w;
    }
  }
  addRoot(r, w, mirror) {
    this.rootOff.y += (r.y || 0) * w; this.rootOff.pitch += (r.pitch || 0) * w; this.rootOff.roll += (mirror ? -(r.roll || 0) : (r.roll || 0)) * w;
  }

  /**
   * @param s  { x, z, speed (world px/s), yaw (target), look: {x, z} | null, stance 0-1, charge 0-1, y }
   */
  update(dt, s) {
    this.x = s.x; this.z = s.z;
    // facing
    let d = s.yaw - this.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    const step = d * Math.min(1, 20 * dt);
    this.yaw += step;
    if (dt > 0) this.yawRate += (step / dt - this.yawRate) * Math.min(1, 8 * dt);
    // locomotion: idle → walk → run → sprint, each played at the rate that keeps its feet planted
    const sp = s.speed || 0, k = Math.min(1, 10 * dt);
    const wSprint = smooth(150, 232, sp), wRun = smooth(48, 100, sp) * (1 - wSprint), wWalk = smooth(5, 32, sp) * (1 - smooth(48, 100, sp)), wIdle = Math.max(0, 1 - wSprint - wRun - wWalk);
    const W = this.w;
    W.sprint += (wSprint - W.sprint) * k; W.run += (wRun - W.run) * k; W.walk += (wWalk - W.walk) * k; W.idle += (wIdle - W.idle) * k;

    // gather the layered pose
    this.acc.clear(); this.rootOff.y = 0; this.rootOff.pitch = 0; this.rootOff.roll = 0;
    let damp = 0;
    const a = this.action;
    if (a) {
      a.t += dt;
      const def = a.def;
      if (a.t >= def.dur) this.action = null;
      else {
        const env = Math.min(1, a.t / def.in) * Math.min(1, (def.dur - a.t) / def.out);
        let i = 0; while (i < def.keys.length - 2 && def.keys[i + 1].t <= a.t) i++;
        const k0 = def.keys[i], k1 = def.keys[i + 1], u = smooth(k0.t, k1.t, a.t);
        this.addPose(k0.pose, env * (1 - u), a.mirror); this.addPose(k1.pose, env * u, a.mirror);
        this.addRoot(k0.root, env * (1 - u), a.mirror); this.addRoot(k1.root, env * u, a.mirror);
        damp = Math.max(damp, env * def.damp);
      }
    }
    // goalkeeper side-shuffle (moving sideways while facing the ball)
    const strafe = s.strafe || 0;
    this.strafeW += (Math.min(1, Math.abs(strafe) / 90) - this.strafeW) * Math.min(1, 8 * dt);
    if (this.strafeW > 0.03 && !this.action) {
      this.strafeT += dt * (5.5 + Math.abs(strafe) / 45);
      const kq = Math.sin(this.strafeT), hop = Math.abs(Math.cos(this.strafeT)), dir = strafe >= 0 ? 1 : -1;
      this.addPose({ LeftUpLeg: [0, 0, (dir > 0 ? 16 : 7) * Math.max(0, kq) + 4], RightUpLeg: [0, 0, -(dir < 0 ? 16 : 7) * Math.max(0, -kq) - 4], LeftLeg: [16 * hop, 0, 0], RightLeg: [16 * hop, 0, 0] }, this.strafeW, false);
      this.addRoot({ y: 0.12 * hop - 0.04, roll: -dir * 4 }, this.strafeW, false);
    }
    let kw = 0;
    if (this.kick) {
      const kc = this.kick; kc.t += dt * 1.12;
      if (kc.t >= kc.end) this.kick = null;
      else { kw = Math.min(1, (kc.t - KICK_START) / 0.07) * Math.min(1, (kc.end - kc.t) / 0.28); kc.a.time = kc.t; }
    }
    for (const ka of this.kicks) ka.setEffectiveWeight(this.kick && ka === this.kick.a ? kw : 0);
    let cheer = 0;
    if (this.loopName) {
      this.loopT += dt; this.loopW = Math.min(1, this.loopW + dt * 4);
      if (this.mocap) cheer = this.loopW;
      else {
        const r = LOOPS[this.loopName](this.loopT, this.phase);
        this.addPose(r.pose, this.loopW, false); this.addRoot(r.root, this.loopW, false);
        if (this.loopName !== 'hold' && this.loopName !== 'dejected') damp = Math.max(damp, this.loopW * 0.9);
      }
    }
    if (this.loopPrev) {
      const p = this.loopPrev; p.w -= dt * 4; p.t += dt;
      if (p.w <= 0) this.loopPrev = null;
      else { const r = LOOPS[p.name](p.t, this.phase); this.addPose(r.pose, p.w, false); this.addRoot(r.root, p.w, false); }
    }
    this.stance += ((s.stance || 0) - this.stance) * Math.min(1, 6 * dt);
    if (this.stance > 0.02 && !this.action) { const r = LOOPS.ready(); const w = this.stance * (1 - W.run - W.sprint); this.addPose(r.pose, w, false); this.addRoot(r.root, w, false); }
    this.charge += ((s.charge || 0) - this.charge) * Math.min(1, 12 * dt);
    if (this.charge > 0.02) this.addPose({ Spine: [11, 0, 0], Spine2: [0, -10, 0], LeftArm: [-10, 0, 30], RightArm: [24, 0, -16] }, this.charge, !!this.spec.leftFoot);
    // eyes on the ball
    if (s.look && damp < 0.5 && cheer < 0.5) {
      const dx = s.look.x - s.x, dz = s.look.z - s.z;
      let ang = Math.atan2(dx, dz) - this.yaw; while (ang > Math.PI) ang -= Math.PI * 2; while (ang < -Math.PI) ang += Math.PI * 2;
      const want = Math.abs(ang) < 2.0 ? Math.max(-1.1, Math.min(1.1, ang)) : 0;
      this.look += (want - this.look) * Math.min(1, 6 * dt);
    } else this.look += (0 - this.look) * Math.min(1, 6 * dt);
    if (Math.abs(this.look) > 0.02) { const deg = this.look / D2R; this.addPose({ Neck: [0, deg * 0.45, 0], Head: [0, deg * 0.4, 0], Spine2: [0, deg * 0.12, 0] }, 1, false); }

    // mocap weights: celebration clips take over; authored actions damp the stride
    for (const n in this.cw) { const t = n === this.mocap ? cheer : 0; this.cw[n] += (t - this.cw[n]) * Math.min(1, 5 * dt); if (this.act[n]) this.act[n].setEffectiveWeight(this.cw[n]); }
    const cTot = Math.min(1, this.cw.cheer3 + this.cw.cheer4 + this.cw.clap), keep = (1 - Math.max(damp, kw)) * (1 - cTot);
    const A = this.act, D = this.durs;
    // one stride cycle drives walk, run and sprint together, so blending between them never tangles the legs
    const tot = W.walk + W.run + W.sprint;
    if (tot > 0.001) {
      const rw = Math.min(1.9, Math.max(0.55, sp / GAIT.walk)), rr = Math.min(1.7, Math.max(0.6, sp / GAIT.run)), rs = Math.min(1.35, Math.max(0.7, sp / GAIT.sprint));
      this.cycle = (this.cycle + ((W.walk * rw / D.walk + W.run * rr / D.run + W.sprint * rs / D.sprint) / tot) * dt) % 1;
    }
    A.idle.setEffectiveWeight(W.idle * keep + damp * (1 - kw) * (1 - cTot));
    A.walk.setEffectiveWeight(W.walk * keep); A.walk.time = ((this.cycle + GAIT_PHASE.walk) % 1) * D.walk;
    A.run.setEffectiveWeight(W.run * keep); A.run.time = ((this.cycle + GAIT_PHASE.run) % 1) * D.run;
    A.sprint.setEffectiveWeight(W.sprint * keep); A.sprint.time = ((this.cycle + GAIT_PHASE.sprint) % 1) * D.sprint;
    this.mixer.update(dt);
    this.applyPose();

    // root: position, bank into turns (the sprint clip already leans)
    const bank = Math.max(-0.2, Math.min(0.2, -this.yawRate * 0.04)) * (W.run + W.sprint);
    this.bank += (bank - this.bank) * Math.min(1, 8 * dt);
    const r = this.root, o = this.rootOff;
    r.position.set(s.x, (s.y || 0) + o.y * this.unit, s.z);
    r.rotation.y = this.yaw;
    r.rotation.x = o.pitch * D2R;
    r.rotation.z = this.bank * (1 - damp) + o.roll * D2R;
    this.baseY = o.y * this.unit;
  }

  applyPose() {
    // the mixer skips bones whose mocap value did not change, so undo last frame's offsets ourselves
    for (const [name, rec] of this.rec) { if (rec.dirty) { const b = this.bones[name]; if (b.quaternion.equals(rec.out)) b.quaternion.copy(rec.base); rec.dirty = false; } }
    for (const name of ORDER) {
      const e = this.acc.get(name); if (!e) continue;
      if (Math.abs(e[0]) + Math.abs(e[1]) + Math.abs(e[2]) < 0.05) continue;
      const bone = this.bones[name]; if (!bone) continue;
      let rec = this.rec.get(name); if (!rec) { rec = { base: new THREE.Quaternion(), out: new THREE.Quaternion(), dirty: false }; this.rec.set(name, rec); }
      rec.base.copy(bone.quaternion);
      _P.identity();
      for (let o = bone.parent; o && o !== this.root; o = o.parent) _P.premultiply(o.quaternion);
      _D.setFromEuler(_E.set(e[0] * D2R, e[1] * D2R, e[2] * D2R, 'YXZ'));
      _Pi.copy(_P).invert();
      bone.quaternion.premultiply(_P).premultiply(_D).premultiply(_Pi);
      rec.out.copy(bone.quaternion); rec.dirty = true;
    }
  }

  dispose() {
    this.mixer.stopAllAction();
    this.bodyTex.dispose(); this.headTex.dispose(); this.mats.forEach((m) => m.dispose());
    if (this.root.parent) this.root.parent.remove(this.root);
  }
}

/** Kit + look for a player of a team (kit object with jersey / trim / …), varied by a seed. */
export function specFor(kit, seed, opts = {}) {
  const HR = [0x1b1b1b, 0x3a2416, 0x6b4423, 0x2d2d2d, 0x8a5a2b, 0x111111, 0x4a3b2a, 0xb08a4a];
  const BT = [0xffffff, 0x2a2a2a, 0xffffff, 0xff5a6e, 0x35d6f0, 0xffe14d, 0x2a2a2a, 0xb6f04a];
  const gk = !!opts.gk, ti = (seed * 7 + 3) % SKIN_TINT.length, gj = opts.gkJersey ?? 0xff3d9a;
  return {
    jersey: gk ? gj : kit.jersey, jerseyLight: gk ? gj : kit.jerseyLight, trim: gk ? 0x111827 : kit.trim,
    shorts: gk ? 0x111827 : kit.shorts, socks: gk ? gj : kit.socks, pattern: gk ? 'plain' : kit.pattern,
    tint: SKIN_TINT[ti], hair: ti >= 3 ? HR[(seed * 5) % 3 === 0 ? 0 : 5] : HR[(seed * 5 + (seed >> 3)) % HR.length],
    boots: BT[(seed * 3) % BT.length], leftFoot: seed % 4 === 1, gk, sponsor: kit.short || 'F17', ...opts,
  };
}
export const HERO_LOOK = { tint: SKIN_TINT[0], hair: 0xe3c05a, boots: 0xffe14d, leftFoot: false };
