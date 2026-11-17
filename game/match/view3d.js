// 3D broadcast view of the match. The simulation stays 2D (match-scene.js); this mirrors it every frame.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { BOX_H, BOX_W, CIRCLE_R, CX, CY, GOAL_D, GOAL_W, HAIRS, PEN_SPOT, PITCH_H, PITCH_W, POWERUPS, PX, SIX_H, SIX_W, SKINS, TEAM } from './config.js';

const S = 1 / 20;                          // world px → 3D units (pitch = 100 × 65)
const PW = PITCH_W * S, PH = PITCH_H * S;
const PLAYER_H = 3.5;                      // slightly larger than life so players read well
const BALL_R3 = 0.42;
const MODEL_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/models/gltf/Xbot.glb';
const X = (x) => (x - CX) * S, Z = (y) => (y - CY) * S;
const PATTERNS = { plain: 0, stripes: 1, band: 2, hoops: 3, sash: 4 };
const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

let modelPromise = null;
function loadModel() {
  if (!modelPromise) modelPromise = new Promise((res, rej) => new GLTFLoader().load(MODEL_URL, res, undefined, rej));
  return modelPromise;
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function labelSprite(text, color) {
  const tex = canvasTex(256, 96, (g) => {
    g.font = '800 58px "Barlow Condensed", "Arial Narrow", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 12; g.strokeStyle = 'rgba(0,0,0,0.9)'; g.strokeText(text, 128, 50);
    g.fillStyle = color; g.fillText(text, 128, 50);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(3.4, 1.28, 1); s.renderOrder = 10;
  return s;
}

/** Paints kit / skin / hair onto the mannequin by bind-pose region (T-pose: height + sideways distance). */
function kitMaterial(base, k) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0.0 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, k.uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vBind;
        uniform vec3 uJersey, uJerseyL, uTrim, uShorts, uSocks, uSkin, uHair;
        uniform float uMinY, uH, uPattern;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float h = (vBind.y - uMinY) / uH;            // 0 feet → 1 head
        float sx = vBind.x / uH;                     // signed sideways, in body heights
        float ax = abs(sx);
        vec3 col = uSkin;
        if (h > 0.925) col = uHair;                                     // hair cap
        else if (h > 0.83 && ax < 0.09) col = (vBind.z < -0.012 * uH && h > 0.87) ? uHair : uSkin;   // head / neck (hair at the back)
        else if (h > 0.53 && ax < 0.3) {                                // torso + sleeves
          col = uJersey;
          if (ax < 0.115) {
            col = mix(uJersey, uJerseyL, smoothstep(0.62, 0.8, h) * 0.5);
            if (uPattern > 0.5 && uPattern < 1.5 && fract(sx * 22.0 + 0.5) > 0.62) col = uTrim;
            if (uPattern > 1.5 && uPattern < 2.5 && h > 0.665 && h < 0.715) col = uTrim;
            if (uPattern > 2.5 && uPattern < 3.5 && fract(h * 17.0) > 0.55) col = uTrim;
            if (uPattern > 3.5 && abs((h - 0.675) - sx * 1.25) < 0.028) col = uTrim;
            if (h > 0.795 && ax < 0.04) col = uTrim;                    // collar
          } else if (ax > 0.262) col = uTrim;                           // sleeve cuff
        }
        else if (h > 0.53) col = uSkin;                                 // forearms / hands
        else if (h > 0.345) col = (h < 0.36) ? uTrim : uShorts;         // shorts (+ hem)
        else if (h > 0.265) col = uSkin;                                // knees
        else if (h > 0.065) col = (h > 0.235) ? uTrim : uSocks;         // socks (+ top band)
        else col = vec3(0.05);                                          // boots
        diffuseColor.rgb = col;`);
  };
  m.customProgramCacheKey = () => 'f17kit';
  void base;
  return m;
}

export class View3D {
  /** @param match the MatchScene (reads players, ball, state, powerups, controlled) */
  constructor(match) {
    this.m = match; this.ready = false; this.dead = false; this.figs = []; this.pu = new Map(); this.t = 0;
    this.canvas = document.getElementById('view3d');
    if (!this.canvas) throw new Error('no #view3d canvas');
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.15;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.day = match.tier && match.tier.mood === 'day';
    const sc = this.scene = new THREE.Scene();
    sc.background = new THREE.Color(this.day ? 0x8fc7ee : 0x04060c);
    sc.fog = new THREE.Fog(this.day ? 0x8fc7ee : 0x04060c, 120, 260);
    this.cam = new THREE.PerspectiveCamera(30, 16 / 9, 1, 500);
    this.camPos = new THREE.Vector3(0, 30, 50); this.camAim = new THREE.Vector3(0, 0, 0);
    this.buildLights(); this.buildPitch(); this.buildGoals(); this.buildSurround(); this.buildBall(); this.buildFx();
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize); this.resize();
    this.canvas.style.display = 'block';
    this.loaded = loadModel().then((gltf) => { if (!this.dead) this.buildPlayers(gltf); });
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.cam.aspect = w / h;
    // keep roughly the same amount of pitch in view on tall (portrait) screens
    this.cam.fov = w / h < 1.3 ? 44 : 30;
    this.cam.updateProjectionMatrix();
  }

  buildLights() {
    const sc = this.scene;
    sc.add(new THREE.HemisphereLight(this.day ? 0xffffff : 0xbfd4ff, this.day ? 0x4c7a3a : 0x1c3a22, this.day ? 1.25 : 0.95));
    const sun = this.sun = new THREE.DirectionalLight(this.day ? 0xfff4d6 : 0xffffff, this.day ? 2.2 : 1.9);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera; c.left = -34; c.right = 34; c.top = 30; c.bottom = -30; c.near = 10; c.far = 220;
    sun.shadow.bias = -0.0006; sun.shadow.radius = 3;
    sc.add(sun, sun.target);
    if (!this.day) {  // floodlight fill from the opposite side
      const fill = new THREE.DirectionalLight(0xdfe9ff, 0.75); fill.position.set(-60, 70, 60); sc.add(fill);
    }
  }

  buildPitch() {
    const run = 9, W = PW + run * 2, H = PH + run * 2, k = 20;   // texture px per unit
    const tex = canvasTex(Math.round(W * k), Math.round(H * k), (g, w, h) => {
      const ox = run * k, oy = run * k, pw = PW * k, ph = PH * k;
      g.fillStyle = '#2f8a3c'; g.fillRect(0, 0, w, h);
      const N = 14, sw = pw / N;
      for (let i = -1; i <= N; i++) { g.fillStyle = (i & 1) ? '#3a9c47' : '#2b7f37'; g.fillRect(ox + i * sw, 0, sw, h); }
      for (let i = 0; i < 9000; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)'; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 5, 2); }
      g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 3.6; g.fillStyle = 'rgba(255,255,255,0.95)';
      const L = (v) => v * S * k, cx = ox + pw / 2, cy = oy + ph / 2;
      g.strokeRect(ox, oy, pw, ph);
      g.beginPath(); g.moveTo(cx, oy); g.lineTo(cx, oy + ph); g.stroke();
      g.beginPath(); g.arc(cx, cy, L(CIRCLE_R), 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(cx, cy, 5, 0, Math.PI * 2); g.fill();
      [[ox, 1], [ox + pw, -1]].forEach(([gx, d]) => {
        g.strokeRect(Math.min(gx, gx + d * L(BOX_W)), cy - L(BOX_H) / 2, L(BOX_W), L(BOX_H));
        g.strokeRect(Math.min(gx, gx + d * L(SIX_W)), cy - L(SIX_H) / 2, L(SIX_W), L(SIX_H));
        g.beginPath(); g.arc(gx + d * L(PEN_SPOT), cy, 5, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(gx + d * L(PEN_SPOT), cy, L(CIRCLE_R), d > 0 ? -0.93 : Math.PI - 0.93, d > 0 ? 0.93 : Math.PI + 0.93); g.stroke();
      });
      [[ox, oy, 0, Math.PI / 2], [ox + pw, oy, Math.PI / 2, Math.PI], [ox, oy + ph, -Math.PI / 2, 0], [ox + pw, oy + ph, Math.PI, Math.PI * 1.5]]
        .forEach(([x, y, a0, a1]) => { g.beginPath(); g.arc(x, y, L(28), a0, a1); g.stroke(); });
    });
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    pitch.rotation.x = -Math.PI / 2; pitch.receiveShadow = true; this.scene.add(pitch);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: this.day ? 0x4d6b47 : 0x0b1210, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; this.scene.add(ground);
    this.run = run;
  }

  buildGoals() {
    const gw = GOAL_W * S, gd = GOAL_D * S, gh = 3.6, postR = 0.16;
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    const netTex = canvasTex(128, 128, (g) => { g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 3; for (let i = 0; i <= 128; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); } });
    netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
    const net = (w, h) => { const t = netTex.clone(); t.needsUpdate = true; t.repeat.set(w / 1.1, h / 1.1); return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false })); };
    [-1, 1].forEach((d) => {
      const g = new THREE.Group(); g.position.x = d * PW / 2;
      [-1, 1].forEach((s) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(postR, postR, gh, 12), white); p.position.set(0, gh / 2, s * gw / 2); p.castShadow = true; g.add(p); });
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(postR, postR, gw + postR * 2, 12), white); bar.rotation.x = Math.PI / 2; bar.position.set(0, gh, 0); bar.castShadow = true; g.add(bar);
      const back = net(gw, gh); back.rotation.y = Math.PI / 2; back.position.set(d * gd, gh / 2, 0); g.add(back);
      const top = net(gd, gw); top.rotation.x = -Math.PI / 2; top.rotation.z = Math.PI / 2; top.position.set(d * gd / 2, gh, 0); top.geometry = new THREE.PlaneGeometry(gw, gd); top.rotation.set(-Math.PI / 2, 0, Math.PI / 2); g.add(top);
      [-1, 1].forEach((s) => { const side = net(gd, gh); side.position.set(d * gd / 2, gh / 2, s * gw / 2); g.add(side); });
      this.scene.add(g);
    });
    this.goalH = gh;
  }

  buildSurround() {
    const run = this.run, bw = PW + run * 2, bh = PH + run * 2, sc = this.scene;
    // advertising boards
    const adTex = canvasTex(2048, 64, (g, w, h) => {
      const cols = ['#15803d', '#f1c40f', '#111827', '#ffffff'], words = ['F17', 'PRO ACADEMY', 'F17', 'PLAY · TRAIN · WIN'];
      const seg = w / 8;
      for (let i = 0; i < 8; i++) {
        g.fillStyle = cols[i % 4]; g.fillRect(i * seg, 0, seg, h);
        g.fillStyle = (i % 4 === 1 || i % 4 === 3) ? '#111827' : '#f1c40f'; g.font = '800 40px "Barlow Condensed", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(words[i % 4], i * seg + seg / 2, h / 2 + 2);
      }
    });
    adTex.wrapS = THREE.RepeatWrapping;
    const board = (len, x, z, ry) => {
      const t = adTex.clone(); t.needsUpdate = true; t.repeat.set(len / 60, 1);
      const b = new THREE.Mesh(new THREE.BoxGeometry(len, 1.5, 0.3), new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: this.day ? 0.15 : 0.55, roughness: 0.6 }));
      b.position.set(x, 0.75, z); b.rotation.y = ry; b.castShadow = true; sc.add(b);
    };
    board(bw, 0, -bh / 2, 0); board(bh, -bw / 2, 0, Math.PI / 2); board(bh, bw / 2, 0, Math.PI / 2);   // none on the camera side
    // crowd stands: sloped planes with the crowd photo
    new THREE.TextureLoader().load('game/assets/crowd.png', (tex) => {
      if (this.dead) return;
      tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      const stand = (len, x, z, ry) => {
        const t = tex.clone(); t.needsUpdate = true; t.repeat.set(len / 26, 2.4);
        const depth = 46;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(len, depth), new THREE.MeshBasicMaterial({ map: t, color: this.day ? 0xdddddd : 0x8f9bb5 }));
        m.rotation.order = 'YXZ'; m.rotation.y = ry; m.rotation.x = -0.62;
        const up = Math.sin(0.62) * depth / 2, back = Math.cos(0.62) * depth / 2 + 4;
        m.position.set(x - Math.sin(ry) * back, up + 1.2, z - Math.cos(ry) * back);
        sc.add(m);
      };
      stand(bw + 60, 0, -bh / 2, 0);
      stand(bh + 60, -bw / 2, 0, Math.PI / 2);
      stand(bh + 60, bw / 2, 0, -Math.PI / 2);
    });
    // floodlights (night): bright sprites high up behind the far stand
    if (!this.day) {
      const glow = canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,250,225,1)'); gr.addColorStop(0.25, 'rgba(255,240,190,0.55)'); gr.addColorStop(1, 'rgba(255,240,190,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
      [[-52, -62], [-18, -66], [18, -66], [52, -62], [-78, -20], [78, -20]].forEach(([x, z]) => {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
        s.position.set(x, 40, z); s.scale.set(26, 26, 1); sc.add(s);
      });
    }
  }

  buildBall() {
    const tex = canvasTex(256, 128, (g, w, h) => {
      g.fillStyle = '#f7f7f7'; g.fillRect(0, 0, w, h); g.fillStyle = '#161616';
      for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) {
        const x = (c + (r % 2 ? 0.5 : 0)) * (w / 6) + 10, y = (r + 0.5) * (h / 3);
        g.beginPath(); for (let v = 0; v < 5; v++) { const a = v / 5 * Math.PI * 2 - Math.PI / 2; g.lineTo(x + Math.cos(a) * 15, y + Math.sin(a) * 15); } g.closePath(); g.fill();
      }
    });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R3, 24, 16), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35 }));
    this.ball.castShadow = true; this.scene.add(this.ball);
    this.fireLight = new THREE.PointLight(0xff7a18, 0, 14); this.scene.add(this.fireLight);
  }

  buildFx() {
    const sc = this.scene;
    // control ring + shot target
    this.ring = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.6, 40), new THREE.MeshBasicMaterial({ color: 0xf1c40f, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.06; this.ring.visible = false; sc.add(this.ring);
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.9, 3), new THREE.MeshBasicMaterial({ color: 0xf1c40f }));
    this.arrow.rotation.x = Math.PI; this.arrow.visible = false; sc.add(this.arrow);
    this.target = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.12, 8, 40), new THREE.MeshBasicMaterial({ color: 0xf1c40f }));
    this.target.rotation.y = Math.PI / 2; this.target.visible = false; sc.add(this.target);
    // fire trail pool
    this.trail = Array.from({ length: 14 }, () => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff8a1f, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); sc.add(m); return m; });
    this.trailI = 0; this.trailT = 0;
    // confetti
    const N = 420, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), pal = [0x22c55e, 0xf1c40f, 0xffffff, 0x60a5fa, 0xf472b6].map(c => new THREE.Color(c));
    for (let i = 0; i < N; i++) { const c = pal[i % pal.length]; col.set([c.r, c.g, c.b], i * 3); pos[i * 3 + 1] = -50; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.confetti = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.42, vertexColors: true, depthWrite: false }));
    this.confetti.frustumCulled = false; sc.add(this.confetti);
    this.confVel = new Float32Array(N * 3); this.confLife = 0;
    this.lastState = '';
  }

  burst(x, y, z) {
    const p = this.confetti.geometry.attributes.position.array, v = this.confVel;
    for (let i = 0; i < p.length; i += 3) {
      p[i] = x + (Math.random() - 0.5) * 3; p[i + 1] = y + Math.random() * 2; p[i + 2] = z + (Math.random() - 0.5) * 3;
      const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 10;
      v[i] = Math.cos(a) * s; v[i + 1] = 9 + Math.random() * 14; v[i + 2] = Math.sin(a) * s;
    }
    this.confLife = 3.2;
  }

  buildPlayers(gltf) {
    // measure the bind pose once (geometry space) so the kit shader knows where shirt / shorts / socks are
    let minY = Infinity, maxY = -Infinity;
    gltf.scene.traverse((o) => { if (o.isSkinnedMesh) { o.geometry.computeBoundingBox(); minY = Math.min(minY, o.geometry.boundingBox.min.y); maxY = Math.max(maxY, o.geometry.boundingBox.max.y); } });
    const box = new THREE.Box3().setFromObject(gltf.scene), worldH = box.max.y - box.min.y;
    const scale = PLAYER_H / (maxY - minY);   // geometry is already in metres; the skinned bbox is unreliable
    const clips = {}; gltf.animations.forEach(c => { clips[c.name.toLowerCase()] = c; });
    this.info = { minY, maxY, worldH, clips: Object.keys(clips) };
    for (const p of this.m.players) {
      const root = SkeletonUtils.clone(gltf.scene);
      root.scale.setScalar(scale * (p.hero ? 1.06 : 1));
      root.rotation.order = 'YXZ';
      const t = TEAM[p.team], seed = p.team * 11 + p.idx;
      const jersey = p.isGK ? 0xf59e0b : t.jersey, light = p.isGK ? 0xfbbf24 : t.jerseyLight;
      const U = (c) => ({ value: new THREE.Color(c) });
      const k = { uniforms: {
        uJersey: U(jersey), uJerseyL: U(light), uTrim: U(p.isGK ? 0x111827 : t.trim), uShorts: U(p.isGK ? 0x111827 : t.shorts), uSocks: U(p.isGK ? 0xf59e0b : t.socks),
        uSkin: U(SKINS[(seed * 7 + 3) % SKINS.length]), uHair: U(HAIRS[(seed * 5 + p.team) % HAIRS.length]),
        uMinY: { value: minY }, uH: { value: maxY - minY }, uPattern: { value: p.isGK ? 0 : (PATTERNS[t.pattern] || 0) },
      } };
      const mat = kitMaterial(null, k);
      const bones = {};
      root.traverse((o) => {
        if (o.isSkinnedMesh) { o.material = mat; o.castShadow = true; o.frustumCulled = false; }
        if (o.isBone) bones[o.name.replace('mixamorig', '')] = o;
      });
      const mixer = new THREE.AnimationMixer(root);
      const act = {};
      ['idle', 'walk', 'run'].forEach((n) => { if (clips[n]) { act[n] = mixer.clipAction(clips[n]); act[n].play(); act[n].setEffectiveWeight(n === 'idle' ? 1 : 0); } });
      const tag = labelSprite(p.name || String(p.num), p.hero ? '#fde047' : '#ffffff'); tag.visible = false; this.scene.add(tag);
      let star = null;
      if (p.hero) { star = labelSprite('★', '#fde047'); star.scale.set(2.2, 0.83, 1); this.scene.add(star); }
      this.scene.add(root);
      this.figs.push({ p, root, mixer, act, bones, tag, star, w: { idle: 1, walk: 0, run: 0 }, kick: 0, lastKick: 0, yaw: 0 });
    }
    this.ready = true;
    this.m.events.emit('view3d-ready');
  }

  update(dt) {
    if (this.dead) return;
    const m = this.m, b = m.ball; this.t += dt;
    // ── ball ────────────────────────────────────────────────────────────
    const bx = X(b.x), bz = Z(b.y), by = BALL_R3 + b.z * S * 1.5;
    const sp = Math.hypot(b.vx, b.vy) * S;
    if (sp > 0.05) { const ax = new THREE.Vector3(b.vy, 0, -b.vx).normalize(); this.ball.rotateOnWorldAxis(ax, (sp * dt) / BALL_R3); }
    this.ball.position.set(bx, by, bz);
    this.fireLight.position.set(bx, by + 0.5, bz); this.fireLight.intensity = b.fire ? 40 : 0;
    this.ball.material.emissive.setHex(b.fire ? 0xff5a00 : 0x000000); this.ball.material.emissiveIntensity = b.fire ? 0.9 : 0;
    this.trailT -= dt;
    if (b.fire && this.trailT <= 0) { this.trailT = 0.025; const t = this.trail[this.trailI++ % this.trail.length]; t.position.set(bx, by, bz); t.material.opacity = 0.9; t.scale.setScalar(1); }
    for (const t of this.trail) if (t.material.opacity > 0) { t.material.opacity = Math.max(0, t.material.opacity - dt * 2.6); t.scale.multiplyScalar(1 - dt * 1.5); }

    // ── players ─────────────────────────────────────────────────────────
    let ctl = null;
    for (const f of this.figs) {
      const p = f.p, s = Math.hypot(p.vx, p.vy);
      f.root.position.set(X(p.x), 0, Z(p.y));
      const yaw = Math.PI / 2 - p.facing;
      let d = yaw - f.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      f.yaw += d * Math.min(1, 14 * dt);
      f.root.rotation.y = f.yaw;
      // locomotion blend from real speed
      const wRun = smooth(95, 165, s), wWalk = smooth(6, 55, s) * (1 - wRun), wIdle = 1 - wRun - wWalk, k = Math.min(1, 10 * dt);
      f.w.run += (wRun - f.w.run) * k; f.w.walk += (wWalk - f.w.walk) * k; f.w.idle += (wIdle - f.w.idle) * k;
      if (f.act.idle) f.act.idle.setEffectiveWeight(f.w.idle);
      if (f.act.walk) { f.act.walk.setEffectiveWeight(f.w.walk); f.act.walk.setEffectiveTimeScale(Math.min(1.7, Math.max(0.6, s / 70))); }
      if (f.act.run) { f.act.run.setEffectiveWeight(f.w.run); f.act.run.setEffectiveTimeScale(Math.min(1.55, Math.max(0.75, s / 185))); }
      f.mixer.update(dt);
      // kick: swing the right leg on top of the mocap pose
      if (p.kickAnim > f.lastKick + 0.2) f.kick = 1;
      f.lastKick = p.kickAnim;
      if (f.kick > 0) {
        f.kick = Math.max(0, f.kick - dt * 3.4);
        const u = 1 - f.kick, sw = u < 0.35 ? -(u / 0.35) * 0.9 : -0.9 + ((u - 0.35) / 0.65) * 2.3;   // back-swing then through
        const amt = Math.sin(Math.min(1, u * 1.15) * Math.PI) > 0 ? sw : 0;
        if (f.bones.RightUpLeg) f.bones.RightUpLeg.rotation.x -= amt * (u < 0.9 ? 1 : (1 - u) * 10);
        if (f.bones.RightLeg) f.bones.RightLeg.rotation.x += u < 0.35 ? 0.9 * (u / 0.35) : 0.9 * Math.max(0, 1 - (u - 0.35) / 0.3);
        if (f.bones.Spine) f.bones.Spine.rotation.x += 0.18 * Math.sin(u * Math.PI);
      }
      // goal celebration: jump with arms up
      if (p.celebT > 0) {
        const u = 1 - p.celebT / 1.4, hop = Math.abs(Math.sin(u * Math.PI * 3));
        f.root.position.y = hop * 1.3; f.root.rotation.y = f.yaw + u * Math.PI * 4;
        if (f.bones.LeftArm) f.bones.LeftArm.rotation.z += 1.9; if (f.bones.RightArm) f.bones.RightArm.rotation.z -= 1.9;
      }
      // lean into sprints / lunges
      f.root.rotation.x = s > 230 && !p.isGK ? Math.min(0.26, (s - 230) / 600) : 0;
      // keeper dive: roll sideways when flying across the goal
      const dive = p.isGK && s > 330 ? Math.min(1.25, (s - 330) / 160) * Math.sign(p.vy || 1) * (p.team === 0 ? 1 : -1) : 0;
      f.roll = (f.roll || 0) + (dive - (f.roll || 0)) * Math.min(1, 12 * dt);
      f.root.rotation.z = f.roll; if (Math.abs(f.roll) > 0.05) f.root.position.y = Math.abs(f.roll) * 0.7;
      const show = p.controlled || p.hero;
      f.tag.visible = show; if (show) f.tag.position.set(f.root.position.x, PLAYER_H + 1.15 + f.root.position.y, f.root.position.z);
      if (f.star) f.star.position.set(f.root.position.x, PLAYER_H + 2.1 + f.root.position.y + Math.sin(this.t * 4) * 0.12, f.root.position.z);
      if (p.controlled) ctl = f;
    }
    this.ring.visible = this.arrow.visible = !!ctl;
    if (ctl) {
      const pu = 1 + Math.sin(this.t * 7) * 0.06;
      this.ring.position.set(ctl.root.position.x, 0.06, ctl.root.position.z); this.ring.scale.setScalar(pu);
      this.ring.material.color.setHex(m.boostT > 0 ? 0x38bdf8 : m.fireReady ? 0xff7a18 : 0xf1c40f);
      this.arrow.position.set(ctl.root.position.x, PLAYER_H + (ctl.p.hero ? 3.1 : 2.3) + Math.sin(this.t * 6) * 0.15, ctl.root.position.z);
    }

    // ── power-ups ───────────────────────────────────────────────────────
    for (const pu of m.powerups || []) {
      if (!this.pu.has(pu)) {
        const g = new THREE.Group(), info = POWERUPS[pu.type];
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.22, 28), new THREE.MeshStandardMaterial({ color: info.color, emissive: info.color, emissiveIntensity: 0.7, roughness: 0.3 }));
        disc.rotation.x = Math.PI / 2; disc.castShadow = true; g.add(disc);
        const icon = labelSprite(info.emoji, '#ffffff'); icon.scale.set(3, 1.13, 1); g.add(icon);
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 9, 20, 1, true), new THREE.MeshBasicMaterial({ color: info.color, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        beam.position.y = 3.2; g.add(beam);
        g.position.set(X(pu.x), 1.6, Z(pu.y)); this.scene.add(g); this.pu.set(pu, g);
      }
    }
    for (const [pu, g] of this.pu) {
      if (!m.powerups.includes(pu)) { this.scene.remove(g); this.pu.delete(pu); continue; }
      g.children[0].rotation.z += dt * 2.4; g.position.y = 1.6 + Math.sin(this.t * 3 + g.position.x) * 0.25;
    }

    // ── shot target, confetti ───────────────────────────────────────────
    this.target.visible = !!(m.target && m.target.visible);
    if (this.target.visible) { this.target.position.set(PW / 2 * m.attackDir(m.userTeam), this.goalH / 2, 0); this.target.rotation.x = this.t * 2; const s2 = 1 + Math.sin(this.t * 8) * 0.08; this.target.scale.set(s2, s2, s2); }
    if (m.state !== this.lastState) { if (m.state === 'goal') { this.burst(bx, 1, bz); this.shake = 0.5; } this.lastState = m.state; }
    if (this.confLife > 0) {
      this.confLife -= dt;
      const p = this.confetti.geometry.attributes.position.array, v = this.confVel;
      for (let i = 0; i < p.length; i += 3) { v[i + 1] -= 16 * dt; p[i] += v[i] * dt; p[i + 1] = Math.max(0.05, p[i + 1] + v[i + 1] * dt); p[i + 2] += v[i + 2] * dt; if (p[i + 1] <= 0.06) { v[i] *= 0.9; v[i + 2] *= 0.9; } }
      this.confetti.geometry.attributes.position.needsUpdate = true;
      if (this.confLife <= 0) for (let i = 1; i < p.length; i += 3) p[i] = -50;
    }

    // ── broadcast camera ────────────────────────────────────────────────
    const goal = m.state === 'goal';
    const lead = Math.max(-6, Math.min(6, b.vx * S * 0.35));
    const tx = Math.max(-PW / 2 + 14, Math.min(PW / 2 - 14, bx + lead)), tz = bz * 0.55;
    const aim = new THREE.Vector3(goal ? bx : tx, goal ? 1.2 : 0.8, goal ? bz : tz - 1.5);
    const dist = goal ? 20 : 32 + Math.min(5, sp * 0.22);
    const pos = new THREE.Vector3(aim.x * (goal ? 0.9 : 0.94), goal ? 8 : 17.5, aim.z + dist);
    const k = Math.min(1, (goal ? 1.6 : 3.4) * dt);
    this.camPos.lerp(pos, k); this.camAim.lerp(aim, Math.min(1, 5 * dt));
    this.cam.position.copy(this.camPos);
    const sh = m.cameras.main.shakeEffect;
    this.shake = Math.max(0, (this.shake || 0) - dt);
    const amp = (sh && sh.isRunning ? 0.25 : 0) + this.shake * 0.5;
    if (amp > 0) { this.cam.position.x += (Math.random() - 0.5) * amp; this.cam.position.y += (Math.random() - 0.5) * amp; }
    this.cam.lookAt(this.camAim);
    // shadow light follows the action
    this.sun.position.set(this.camAim.x - 38, 78, this.camAim.z + (this.day ? 30 : -34));
    this.sun.target.position.copy(this.camAim); this.sun.target.updateMatrixWorld();

    this.renderer.render(this.scene, this.cam);
  }

  destroy() {
    this.dead = true;
    window.removeEventListener('resize', this.onResize);
    this.canvas.style.display = 'none';
    this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((mm) => { if (mm.map) mm.map.dispose(); mm.dispose(); }); } });
    this.renderer.dispose();
  }
}
