// 3D broadcast view. The simulation stays 2D (match-scene.js / drill-base.js); this mirrors a "host" every frame.
// Host interface: players[], ball, state, tier.mood, powerups[], userTeam, attackDir(team), target, boostT, fireReady,
// charging, power, score[], cameras, events; optional: props3d[], cam3d(), loop3d(p), goalTeam.
import { BOX_H, BOX_W, CIRCLE_R, CX, CY, GOAL_D, GOAL_W, PEN_SPOT, PITCH_H, PITCH_W, POWERUPS, SIX_H, SIX_W, TEAM } from './config.js';
import { Figure, HERO_LOOK, PLAYER_H, THREE, ballMaterial, canvasTex, labelSprite, loadModel, sharedRenderer, specFor } from '../gfx/figure.js';

const S = 1 / 20;                          // world px → 3D units (pitch = 100 × 65)
const PW = PITCH_W * S, PH = PITCH_H * S;
const BALL_R3 = 0.36;
const X = (x) => (x - CX) * S, Z = (y) => (y - CY) * S;
const css = (c) => '#' + c.toString(16).padStart(6, '0');
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class View3D {
  constructor(host, opts = {}) {
    this.m = host; this.opts = opts; this.ready = false; this.dead = false; this.figs = new Map(); this.pu = new Map(); this.props = new Map();
    this.t = 0; this.rt = 0; this.last = performance.now(); this.tex = []; this.goalT = 0; this.cut = '';
    const sr = this.sr = sharedRenderer(); sr.owner = this;
    this.renderer = sr.renderer; this.canvas = sr.canvas;
    this.day = !!(host.tier && host.tier.mood === 'day');
    const sc = this.scene = new THREE.Scene();
    this.sky = this.day ? 0x9ccdf0 : 0x070b16;
    sc.background = new THREE.Color(this.sky);
    sc.fog = new THREE.Fog(this.day ? 0xb9dcf2 : 0x0a1020, 150, 460);
    this.cam = new THREE.PerspectiveCamera(30, 16 / 9, 1, 900);
    this.camPos = V(-46, 42, 84); this.camAim = V(0, 0, 0);
    this.buildLights(); this.buildPitch(); this.buildGoals(); this.buildStadium(); this.buildBall(); this.buildFx();
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize); this.resize();
    this.canvas.style.display = 'block';
    this.loaded = loadModel().then((gltf) => { if (this.dead) return; this.gltf = gltf; this.ready = true; this.syncPlayers(); host.events.emit('view3d-ready'); });
  }

  keep(t) { this.tex.push(t); return t; }

  resize() {
    const w = window.innerWidth, h = window.innerHeight, r = this.renderer;
    r.setSize(w, h, false); r.setViewport(0, 0, w, h); r.setScissorTest(false);
    this.cam.aspect = w / h;
    this.cam.fov = w / h < 1.3 ? 44 : 30;     // keep roughly the same amount of pitch in view on tall screens
    this.cam.updateProjectionMatrix();
  }

  // ─── World ────────────────────────────────────────────────────────────────
  buildLights() {
    const sc = this.scene;
    sc.add(new THREE.HemisphereLight(this.day ? 0xffffff : 0xc4d6ff, this.day ? 0x4c7a3a : 0x1d3b24, this.day ? 1.2 : 0.9));
    const sun = this.sun = new THREE.DirectionalLight(this.day ? 0xfff1cf : 0xffffff, this.day ? 2.3 : 1.7);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera; c.left = -36; c.right = 36; c.top = 30; c.bottom = -30; c.near = 10; c.far = 240;
    sun.shadow.bias = -0.0006; sun.shadow.radius = 3;
    sc.add(sun, sun.target);
    const fill = new THREE.DirectionalLight(this.day ? 0xcfe4ff : 0xdfe9ff, this.day ? 0.5 : 0.95); fill.position.set(-60, 70, 70); sc.add(fill);
    if (!this.day) { const back = new THREE.DirectionalLight(0xbfd0ff, 0.7); back.position.set(70, 60, -80); sc.add(back); }
  }

  buildPitch() {
    const run = this.run = 9, W = PW + run * 2, H = PH + run * 2, k = 20, sc = this.scene;
    // turf: real grass photo (mown in squares), tiled; flat green until it loads
    const turfMat = new THREE.MeshStandardMaterial({ color: 0x3f9a45, roughness: 0.96 });
    const turf = new THREE.Mesh(new THREE.PlaneGeometry(W + 30, H + 30), turfMat);
    turf.rotation.x = -Math.PI / 2; turf.receiveShadow = true; sc.add(turf);
    const img = new Image();
    img.onload = () => {
      if (this.dead) return;
      const t = this.keep(canvasTex(768, 768, (g) => g.drawImage(img, 0, 0, 768, 768, 0, 0, 768, 768)));   // 3 mowing periods, clear of the corner mark
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set((W + 30) / 37.5, (H + 30) / 37.5); t.offset.set(0.13, 0.2); t.anisotropy = 16;
      turfMat.map = t; turfMat.color.setHex(this.day ? 0xf2ffe8 : 0xd8f0d0); turfMat.needsUpdate = true;
    };
    img.src = 'game/assets/grass.png';
    // lines on their own crisp layer
    const lines = this.keep(canvasTex(Math.round(W * k), Math.round(H * k), (g, w, h) => {
      const ox = run * k, oy = run * k, pw = PW * k, ph = PH * k;
      g.clearRect(0, 0, w, h);
      // worn goalmouths
      [[ox + 30, 1], [ox + pw - 30, -1]].forEach(([gx]) => { const gr = g.createRadialGradient(gx, oy + ph / 2, 10, gx, oy + ph / 2, 150); gr.addColorStop(0, 'rgba(120,100,50,0.22)'); gr.addColorStop(1, 'rgba(120,100,50,0)'); g.fillStyle = gr; g.fillRect(gx - 160, oy + ph / 2 - 160, 320, 320); });
      g.strokeStyle = 'rgba(255,255,255,0.94)'; g.lineWidth = 3.8; g.fillStyle = 'rgba(255,255,255,0.94)';
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
    }));
    lines.anisotropy = 16;
    const lm = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: lines, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    lm.rotation.x = -Math.PI / 2; lm.position.y = 0.02; lm.renderOrder = 1; sc.add(lm);
    // track + far ground
    const track = new THREE.Mesh(new THREE.PlaneGeometry(190, 150), new THREE.MeshStandardMaterial({ color: this.day ? 0x6b7280 : 0x1b2230, roughness: 1 }));
    track.rotation.x = -Math.PI / 2; track.position.y = -0.04; track.receiveShadow = true; sc.add(track);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshBasicMaterial({ color: this.day ? 0x4d6b47 : 0x05080f }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.1; sc.add(ground);
    // corner flags
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), new THREE.MeshStandardMaterial({ color: 0xffffff }));
      pole.position.set(a * PW / 2, 1.3, b * PH / 2); pole.castShadow = true; sc.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), new THREE.MeshBasicMaterial({ color: 0xf1c40f, side: THREE.DoubleSide }));
      flag.position.set(a * PW / 2 + 0.45, 2.3, b * PH / 2); sc.add(flag);
    });
  }

  buildGoals() {
    const gw = GOAL_W * S, gd = GOAL_D * S, gh = 3.6, postR = 0.16, sc = this.scene;
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 });
    const netTex = this.keep(canvasTex(128, 128, (g) => { g.clearRect(0, 0, 128, 128); g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2.5; for (let i = 0; i <= 128; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); } }));
    netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
    const net = (w, h) => { const t = this.keep(netTex.clone()); t.needsUpdate = true; t.repeat.set(w / 1.0, h / 1.0); return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false })); };
    this.nets = [];
    [-1, 1].forEach((d) => {
      const g = new THREE.Group(); g.position.x = d * PW / 2;
      [-1, 1].forEach((s) => {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(postR, postR, gh, 12), white); p.position.set(0, gh / 2, s * gw / 2); p.castShadow = true; g.add(p);
        const stay = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, gh, 6), white); stay.position.set(d * gd, gh / 2, s * gw / 2); g.add(stay);
      });
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(postR, postR, gw + postR * 2, 12), white); bar.rotation.x = Math.PI / 2; bar.position.set(0, gh, 0); bar.castShadow = true; g.add(bar);
      const back = net(gw, gh); back.rotation.y = Math.PI / 2; back.position.set(d * gd, gh / 2, 0); g.add(back);
      const top = net(gw, gd); top.rotation.set(-Math.PI / 2, 0, Math.PI / 2); top.position.set(d * gd / 2, gh, 0); g.add(top);
      [-1, 1].forEach((s) => { const side = net(gd, gh); side.position.set(d * gd / 2, gh / 2, s * gw / 2); g.add(side); });
      sc.add(g); this.nets.push({ d, back, t: 0 });
    });
    this.goalH = gh;
  }

  buildStadium() {
    const run = this.run, bw = PW + run * 2, bh = PH + run * 2, sc = this.scene, day = this.day;
    const home = TEAM[0];
    // sky dome
    const skyTex = this.keep(canvasTex(16, 256, (g) => {
      const gr = g.createLinearGradient(0, 0, 0, 256);
      if (day) { gr.addColorStop(0, '#2f7fd0'); gr.addColorStop(0.5, '#86c2ee'); gr.addColorStop(0.62, '#d7ecf8'); gr.addColorStop(1, '#d7ecf8'); }
      else { gr.addColorStop(0, '#02040a'); gr.addColorStop(0.42, '#0a1226'); gr.addColorStop(0.6, '#1b2a4a'); gr.addColorStop(1, '#1b2a4a'); }
      g.fillStyle = gr; g.fillRect(0, 0, 16, 256);
    }));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(520, 24, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
    sc.add(dome);
    // outer bowl closes the corners
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(132, 132, 64, 48, 1, true), new THREE.MeshBasicMaterial({ color: day ? 0x334155 : 0x0b1120, side: THREE.BackSide }));
    bowl.position.y = 26; sc.add(bowl);

    // LED advertising boards (scrolling)
    const adTex = this.keep(canvasTex(2048, 64, (g, w, h) => {
      const words = ['F17 PRO ACADEMY', 'PLAY · TRAIN · WIN', home.name || 'F17', 'GO F17!'];
      const cols = [css(home.jersey), '#0b1220', css(home.trim), '#0b1220'];
      const seg = w / 8;
      for (let i = 0; i < 8; i++) {
        g.fillStyle = cols[i % 4]; g.fillRect(i * seg, 0, seg, h);
        g.fillStyle = i % 4 === 2 ? '#0b1220' : i % 4 === 0 ? css(home.trim) : '#ffffff'; g.font = '800 40px "Barlow Condensed", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(words[i % 4], i * seg + seg / 2, h / 2 + 2);
      }
    }));
    adTex.wrapS = THREE.RepeatWrapping;
    this.ads = [];
    const board = (len, x, z, ry) => {
      const t = this.keep(adTex.clone()); t.needsUpdate = true; t.repeat.set(len / 64, 1); this.ads.push(t);
      const b = new THREE.Mesh(new THREE.BoxGeometry(len, 1.5, 0.3), new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: day ? 0.25 : 0.85, roughness: 0.5 }));
      b.position.set(x, 0.75, z); b.rotation.y = ry; b.castShadow = true; sc.add(b);
    };
    board(bw, 0, -bh / 2, 0); board(bh, -bw / 2, 0, Math.PI / 2); board(bh, bw / 2, 0, -Math.PI / 2);   // none on the camera side

    // crowd: thousands of seated fans in club colours
    const fan = [css(home.jersey), css(home.jersey), css(home.jerseyLight || home.jersey), css(home.trim), '#f8fafc', '#1f2937', '#dc2626', '#2563eb', '#f59e0b', '#e5e7eb', '#111827'];
    const skins = ['#f1c6a0', '#e0ac7e', '#c68e62', '#a86d48', '#7e4b2c', '#5a3220'];
    const crowdTex = this.keep(canvasTex(1024, 512, (g, w, h) => {
      g.fillStyle = day ? '#39424f' : '#161d2b'; g.fillRect(0, 0, w, h);
      const rows = 32, cols = 128, rh = h / rows, cw = w / cols;
      for (let r = 0; r < rows; r++) {
        g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(0, r * rh + rh - 3, w, 3);
        for (let c = 0; c < cols; c++) {
          if (Math.random() < 0.07) continue;
          const x = c * cw + (r % 2 ? cw / 2 : 0), y = r * rh, up = Math.random() < 0.12;
          g.fillStyle = fan[Math.floor(Math.random() * Math.random() * fan.length * 1.6) % fan.length]; g.fillRect(x + 1, y + 7, cw - 2, rh - 8);
          if (up) g.fillRect(x, y + 1, 1.6, 7);
          g.fillStyle = skins[Math.floor(Math.random() * skins.length)]; g.beginPath(); g.arc(x + cw / 2, y + 5, 2.7, 0, 7); g.fill();
        }
      }
    }));
    crowdTex.wrapS = crowdTex.wrapT = THREE.RepeatWrapping; crowdTex.anisotropy = 16;
    const ribbon = this.keep(canvasTex(1024, 32, (g, w, h) => { g.fillStyle = '#05080f'; g.fillRect(0, 0, w, h); g.font = '800 24px "Barlow Condensed", Arial'; g.textBaseline = 'middle'; g.fillStyle = css(home.trim); for (let i = 0; i < 4; i++) g.fillText('F17 PRO ACADEMY   ★   ' + (home.name || 'F17') + '   ★', i * 256 + 8, h / 2 + 1); }));
    ribbon.wrapS = THREE.RepeatWrapping; this.ads.push(ribbon);
    const quad = (len, z0, y0, z1, y1, mat, ux = 1, uy = 1) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([-len / 2, y0, z0, len / 2, y0, z0, len / 2, y1, z1, -len / 2, y1, z1], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, ux, 0, ux, uy, 0, uy], 2));
      g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals();
      return new THREE.Mesh(g, mat);
    };
    const crowdMat = new THREE.MeshBasicMaterial({ map: crowdTex, color: day ? 0xffffff : 0xaab4cc, side: THREE.DoubleSide });
    const dark = new THREE.MeshBasicMaterial({ color: day ? 0x475569 : 0x0d1322, side: THREE.DoubleSide });
    const roofMat = new THREE.MeshBasicMaterial({ color: day ? 0xe2e8f0 : 0x111a2e, side: THREE.DoubleSide });
    const ribMat = new THREE.MeshBasicMaterial({ map: ribbon, side: THREE.DoubleSide });
    const lampTex = this.keep(canvasTex(256, 16, (g) => { g.fillStyle = '#0c1220'; g.fillRect(0, 0, 256, 16); g.fillStyle = '#fff7d6'; for (let i = 0; i < 16; i++) g.fillRect(i * 16 + 4, 5, 8, 6); }));
    lampTex.wrapS = THREE.RepeatWrapping;
    const lampMat = new THREE.MeshBasicMaterial({ map: lampTex, side: THREE.DoubleSide, fog: false });
    this.crowdPts = [];
    const stand = (len, x, z, ry, big) => {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
      const u = len / 80, d1 = big ? 20 : 15, h1 = big ? 11 : 8.5, d2 = big ? 24 : 16, h2 = big ? 17 : 12;
      const mk = (m, ux, uy) => { const mm = m.clone(); if (mm.map) { mm.map = this.keep(m.map.clone()); mm.map.needsUpdate = true; mm.map.repeat.set(ux, uy); } return mm; };
      g.add(quad(len, 0, 0, 0, 1.6, dark));
      g.add(quad(len, 0, 1.6, d1, 1.6 + h1, mk(crowdMat, u, 1)));
      const fy = 1.6 + h1;
      g.add(quad(len, d1, fy, d1, fy + 2.6, dark));
      const rb = quad(len, d1 - 0.05, fy + 0.5, d1 - 0.05, fy + 1.9, ribMat, -len / 60, 1); g.add(rb);
      g.add(quad(len, d1, fy + 2.6, d1 + d2, fy + 2.6 + h2, mk(crowdMat, u, 1.1)));
      const ty = fy + 2.6 + h2;
      g.add(quad(len, d1 + d2, 0, d1 + d2, ty + 7, dark));
      g.add(quad(len, d1 + d2 + 1, ty + 7, d1 - 4, ty + 3.5, roofMat));                      // cantilever roof
      g.add(quad(len, d1 - 4, ty + 3.5, d1 - 4, ty + 2.3, lampMat, len / 20, 1));            // roof-edge lights
      sc.add(g);
      this.crowdPts.push({ g, len, d1, h1, d2, h2, fy });
    };
    stand(bw + 60, 0, -bh / 2 - 3, Math.PI, true);
    stand(bh + 50, -bw / 2 - 3, 0, -Math.PI / 2, false);
    stand(bh + 50, bw / 2 + 3, 0, Math.PI / 2, false);
    stand(bw + 60, 0, bh / 2 + 22, 0, true);

    // big screen
    const scr = this.keep(canvasTex(512, 256, (g, w, h) => {
      g.fillStyle = '#05080f'; g.fillRect(0, 0, w, h); g.fillStyle = css(home.jersey); g.fillRect(0, 0, w, 14); g.fillRect(0, h - 14, w, 14);
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = css(home.trim); g.font = '800 120px "Barlow Condensed", Arial'; g.fillText('F17', w / 2, 104);
      g.fillStyle = '#ffffff'; g.font = '700 40px "Barlow Condensed", Arial'; g.fillText('PRO ACADEMY', w / 2, 190);
    }));
    [-1, 1].forEach((sx) => {
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(26, 13), new THREE.MeshBasicMaterial({ map: scr, fog: false }));
      screen.position.set(sx * 84, 30, -62); screen.rotation.y = -sx * 0.75; sc.add(screen);
    });

    // floodlight towers
    const glow = this.keep(canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,250,225,1)'); gr.addColorStop(0.25, 'rgba(255,240,190,0.55)'); gr.addColorStop(1, 'rgba(255,240,190,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }));
    this.glowTex = glow;
    const panelTex = this.keep(canvasTex(64, 64, (g) => { g.fillStyle = '#1b2333'; g.fillRect(0, 0, 64, 64); g.fillStyle = day ? '#cbd5e1' : '#fffbe6'; for (let y = 0; y < 4; y++) for (let x = 0; x < 6; x++) { g.beginPath(); g.arc(6 + x * 10.4, 8 + y * 16, 4, 0, 7); g.fill(); } }));
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => {
      const x = a * 92, z = b * 74;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, 62, 8), new THREE.MeshBasicMaterial({ color: day ? 0x94a3b8 : 0x1c2436 })); pole.position.set(x, 31, z); sc.add(pole);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(13, 8), new THREE.MeshBasicMaterial({ map: panelTex, fog: false, side: THREE.DoubleSide }));
      panel.position.set(x, 64, z); panel.lookAt(0, 0, 0); sc.add(panel);
      if (!day) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); s.position.set(x * 0.985, 64, z * 0.985); s.scale.set(46, 46, 1); sc.add(s);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(30, 90, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xcfe0ff, transparent: true, opacity: 0.035, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
        cone.position.set(x * 0.52, 34, z * 0.52); cone.lookAt(x, 66, z); cone.rotateX(-Math.PI / 2); sc.add(cone);
      }
    });
    // camera flashes in the crowd
    this.flashes = Array.from({ length: 26 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0 })); s.scale.set(2.6, 2.6, 1); sc.add(s); return s; });
    this.flashRate = 1.5;
  }

  buildBall() {
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R3, 32, 20), ballMaterial());
    this.ball.castShadow = true; this.scene.add(this.ball);
    this.fireLight = new THREE.PointLight(0xff7a18, 0, 14); this.scene.add(this.fireLight);
    this.blobTex = this.keep(canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.clearRect(0, 0, 64, 64); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }));
    this.blobGeo = new THREE.PlaneGeometry(1, 1);
    this.blobMat = new THREE.MeshBasicMaterial({ map: this.blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    this.ballBlob = this.blob(1.3);
  }

  blob(size) { const m = new THREE.Mesh(this.blobGeo, this.blobMat); m.rotation.x = -Math.PI / 2; m.position.y = 0.04; m.scale.setScalar(size); m.renderOrder = 2; this.scene.add(m); return m; }

  buildFx() {
    const sc = this.scene;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.6, 40), new THREE.MeshBasicMaterial({ color: 0xf1c40f, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.06; this.ring.visible = false; this.ring.renderOrder = 3; sc.add(this.ring);
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.9, 3), new THREE.MeshBasicMaterial({ color: 0xf1c40f }));
    this.arrow.rotation.x = Math.PI; this.arrow.visible = false; sc.add(this.arrow);
    this.target = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.12, 8, 40), new THREE.MeshBasicMaterial({ color: 0xf1c40f }));
    this.target.rotation.y = Math.PI / 2; this.target.visible = false; sc.add(this.target);
    this.trail = Array.from({ length: 14 }, () => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff8a1f, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); sc.add(m); return m; });
    this.trailI = 0; this.trailT = 0;
    // flat aim arrow (unit length along +z, stretched by scale.z)
    const ag = new THREE.BufferGeometry();
    ag.setAttribute('position', new THREE.Float32BufferAttribute([-0.22, 0, 0.9, 0.22, 0, 0.9, 0.22, 0, 0.82 * 1, -0.22, 0, 0.82, 0, 0, 0, 0, 0, 0], 3));
    const shaft = [-0.3, 0, 0.12, 0.3, 0, 0.12, 0.3, 0, 0.8, -0.3, 0, 0.8], head = [-0.8, 0, 0.8, 0.8, 0, 0.8, 0, 0, 1];
    ag.setAttribute('position', new THREE.Float32BufferAttribute([...shaft, ...head], 3)); ag.setIndex([0, 2, 1, 0, 3, 2, 4, 6, 5]);
    this.aimArrow = new THREE.Mesh(ag, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
    this.aimArrow.visible = false; this.aimArrow.renderOrder = 3; sc.add(this.aimArrow);
    const N = 420, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), pal = [0x22c55e, 0xf1c40f, 0xffffff, 0x60a5fa, 0xf472b6].map(c => new THREE.Color(c));
    for (let i = 0; i < N; i++) { const c = pal[i % pal.length]; col.set([c.r, c.g, c.b], i * 3); pos[i * 3 + 1] = -50; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.confetti = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.42, vertexColors: true, depthWrite: false }));
    this.confetti.frustumCulled = false; sc.add(this.confetti);
    this.confVel = new Float32Array(N * 3); this.confLife = 0;
    this.lastState = '';
  }

  /** Confetti burst at a world-px position. */
  burstAt(x, y, h = 1) { this.burst(X(x), h, Z(y)); }
  burst(x, y, z) {
    const p = this.confetti.geometry.attributes.position.array, v = this.confVel;
    for (let i = 0; i < p.length; i += 3) {
      p[i] = x + (Math.random() - 0.5) * 3; p[i + 1] = y + Math.random() * 2; p[i + 2] = z + (Math.random() - 0.5) * 3;
      const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 10;
      v[i] = Math.cos(a) * s; v[i + 1] = 9 + Math.random() * 14; v[i + 2] = Math.sin(a) * s;
    }
    this.confLife = 3.2;
  }

  /** World px (+ height in units) → Phaser game coordinates, for HUD pops that follow the 3D world. */
  project(x, y, h = 0) {
    const v = V(X(x), h, Z(y)).project(this.cam);
    const cx = (v.x * 0.5 + 0.5) * window.innerWidth, cy = (-v.y * 0.5 + 0.5) * window.innerHeight;
    const game = this.m.game, r = game.canvas.getBoundingClientRect();
    return { x: (cx - r.left) * (game.scale.width / r.width), y: (cy - r.top) * (game.scale.height / r.height) };
  }

  // ─── Players ──────────────────────────────────────────────────────────────
  syncPlayers() {
    const list = this.m.players;
    for (const p of list) {
      if (this.figs.has(p)) continue;
      const kit = TEAM[p.team], seed = p.team * 11 + p.idx;
      const spec = specFor(kit, seed, { gk: p.isGK, gkJersey: p.team === 0 ? 0xff3d9a : 0x22c7f0, num: p.num, name: p.name || '', height: PLAYER_H * (p.hero ? 1.04 : 0.96 + ((seed * 13) % 9) / 100), ...(p.hero ? HERO_LOOK : {}) });
      const fig = new Figure(this.gltf, spec);
      fig.yaw = Math.PI / 2 - p.facing;
      const f = { p, fig, seq: p.animSeq || 0, blob: this.blob(2.5), tag: null, star: null };
      f.tag = labelSprite(p.name || String(p.num), p.hero ? '#fde047' : '#ffffff'); f.tag.visible = false; this.scene.add(f.tag);
      if (p.hero) { f.star = labelSprite('★', '#fde047'); f.star.scale.set(2.2, 0.83, 1); this.scene.add(f.star); }
      this.scene.add(fig.root);
      this.figs.set(p, f);
    }
    if (this.figs.size !== list.length) for (const [p, f] of this.figs) if (!list.includes(p)) this.dropFig(p, f);
  }

  dropFig(p, f) {
    f.fig.dispose(); this.scene.remove(f.blob, f.tag); if (f.star) this.scene.remove(f.star);
    f.tag.material.map.dispose(); f.tag.material.dispose();
    this.figs.delete(p);
  }

  loopFor(p) {
    const m = this.m, b = m.ball;
    if (m.loop3d) { const r = m.loop3d(p); if (r !== undefined) return r; }
    if (m.state === 'goal' && b.lastTouch) {
      const team = m.goalTeam ?? b.lastTouch.team, sc = b.lastTouch;
      if (p.team === team) {
        if (p === sc) return p.hero ? 'wide' : 'pump';
        return Math.hypot(p.x - sc.x, p.y - sc.y) < 460 ? 'cheer' : null;
      }
      return (p.idx * 7) % 5 < 3 ? 'dejected' : null;
    }
    if (m.state === 'fulltime' && m.score) { const d = m.score[p.team] - m.score[1 - p.team]; return d > 0 ? 'cheer' : d < 0 ? 'dejected' : null; }
    if (p.isGK && b.owner === p) return 'hold';
    return null;
  }

  // ─── Drill props (cones, gates, goal targets, pass markers) ────────────────
  syncProps(dt) {
    const list = this.m.props3d || [];
    for (const pr of list) if (!this.props.has(pr)) this.props.set(pr, this.makeProp(pr));
    for (const [pr, o] of this.props) {
      if (!list.includes(pr)) { this.scene.remove(o.g); this.props.delete(pr); continue; }
      const pulse = 1 + Math.sin(this.t * 6) * 0.1;
      if (pr.kind === 'target') {
        o.disc.material.color.setHex(pr.on ? 0xf1c40f : 0xffffff); o.disc.material.opacity = pr.on ? 0.95 : 0.25;
        o.g.scale.setScalar(pr.on ? pulse : 0.8); o.g.rotation.x += dt * (pr.on ? 1.6 : 0);
      } else if (pr.kind === 'cone') {
        o.cone.material.color.setHex(pr.hit ? 0xef4444 : 0xf97316); o.g.rotation.z += ((pr.hit ? 1.2 : 0) - o.g.rotation.z) * Math.min(1, 10 * dt);
      } else if (pr.kind === 'gate') {
        o.disc.material.color.setHex(pr.cur ? 0xf1c40f : pr.done ? 0x22c55e : 0xffffff); o.disc.material.opacity = pr.cur ? 0.9 : pr.done ? 0.2 : 0.3;
        o.disc.scale.setScalar(pr.cur ? pulse : 1); o.beam.visible = !!pr.cur; o.num.material.opacity = pr.cur ? 1 : 0.45;
      } else if (pr.kind === 'mark') {
        o.g.visible = !!pr.on; o.g.position.set(X(pr.p.x), 0, Z(pr.p.y)); o.ring.scale.setScalar(pulse); o.arrow.position.y = PLAYER_H + 1.6 + Math.sin(this.t * 6) * 0.2;
      }
    }
  }

  makeProp(pr) {
    const g = new THREE.Group(), o = { g };
    const basic = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
    if (pr.kind === 'target') {
      o.disc = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.16, 8, 36), basic(0xffffff)); g.add(o.disc);
      const inner = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.1, 8, 24), basic(0xffffff, 0.6)); g.add(inner);
      g.rotation.y = Math.PI / 2; g.position.set(X(pr.x) - 0.2, pr.h ?? 1.9, Z(pr.y));
    } else if (pr.kind === 'cone') {
      o.cone = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.3, 14), new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.6 })); o.cone.position.y = 0.65; o.cone.castShadow = true; g.add(o.cone);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.37, 0.22, 14), new THREE.MeshStandardMaterial({ color: 0xffffff })); band.position.y = 0.7; g.add(band);
      g.position.set(X(pr.x), 0, Z(pr.y));
    } else if (pr.kind === 'gate') {
      o.disc = new THREE.Mesh(new THREE.RingGeometry(1.5, 2.1, 40), basic(0xffffff, 0.3)); o.disc.rotation.x = -Math.PI / 2; o.disc.position.y = 0.05; g.add(o.disc);
      o.beam = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 8, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xf1c40f, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); o.beam.position.y = 4; g.add(o.beam);
      o.num = labelSprite(String(pr.n), '#ffffff'); o.num.position.y = 3.4; o.num.scale.set(4.2, 1.6, 1); g.add(o.num);
      g.position.set(X(pr.x), 0, Z(pr.y));
    } else if (pr.kind === 'mark') {
      o.ring = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.75, 40), basic(0xf1c40f, 0.95)); o.ring.rotation.x = -Math.PI / 2; o.ring.position.y = 0.06; g.add(o.ring);
      o.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.1, 4), new THREE.MeshBasicMaterial({ color: 0xf1c40f })); o.arrow.rotation.x = Math.PI; g.add(o.arrow);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 9, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xf1c40f, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); beam.position.y = 4.5; g.add(beam);
    }
    this.scene.add(g);
    return o;
  }

  // ─── Frame ────────────────────────────────────────────────────────────────
  update(dt) {
    if (this.dead || this.sr.owner !== this) return;
    const now = performance.now(), rdt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    const m = this.m, b = m.ball; this.t += dt; this.rt += rdt;
    if (this.ready) this.syncPlayers();
    this.syncProps(dt);

    // players
    let ctl = null; const bx0 = X(b.x), bz0 = Z(b.y);
    const goal = m.state === 'goal', scorer = goal ? b.lastTouch : null;
    for (const [p, f] of this.figs) {
      const fig = f.fig, s = Math.hypot(p.vx, p.vy);
      if ((p.animSeq || 0) !== f.seq) {
        f.seq = p.animSeq;
        let mirror = false;
        if (p.anim === 'dive') mirror = -Math.sin(fig.yaw) * (p.animDir || 1) < 0;
        fig.play(p.anim, { mirror });
      }
      fig.setLoop(this.loopFor(p));
      let yaw = Math.PI / 2 - p.facing;
      if (goal && p === scorer && this.goalT > 1.3) yaw = Math.atan2(this.cam.position.x - X(p.x), this.cam.position.z - Z(p.y));
      const stance = p.isGK && b.owner !== p && m.state === 'play' && Math.hypot(b.x - p.x, b.y - p.y) < 760 ? 1 : 0;
      let speed = s, strafe = 0;
      if (p.lockFacing) { const cf = Math.cos(p.facing), sf = Math.sin(p.facing); speed = Math.abs(p.vx * cf + p.vy * sf); strafe = p.vx * sf - p.vy * cf; }
      fig.update(dt, { x: X(p.x), z: Z(p.y), speed, strafe, yaw, look: { x: bx0, z: bz0 }, stance, charge: p.controlled && m.charging ? 0.4 + 0.6 * (m.power || 0) : 0 });
      const px = fig.root.position.x, pz = fig.root.position.z, lift = Math.max(0, fig.baseY);
      // goal close-up: anyone standing right in front of the lens (other than the scorer) would fill the frame
      fig.root.visible = !(goal && p !== scorer && Math.hypot(this.cam.position.x - px, this.cam.position.z - pz) < 4.5);
      f.blob.visible = fig.root.visible;
      f.blob.position.set(px, 0.04, pz); f.blob.scale.setScalar(2.5 - Math.min(1, lift) * 0.8);
      const show = (p.controlled || p.hero) && !goal;      // no floating labels in the close-up goal camera
      f.tag.visible = show; if (show) f.tag.position.set(px, PLAYER_H + 1.15 + lift, pz);
      if (f.star) f.star.visible = !goal;
      if (f.star) f.star.position.set(px, PLAYER_H + 2.1 + lift + Math.sin(this.t * 4) * 0.12, pz);
      if (p.controlled) ctl = f;
    }
    this.ring.visible = this.arrow.visible = !!ctl;
    if (ctl) {
      const pu = 1 + Math.sin(this.t * 7) * 0.06, r = ctl.fig.root.position;
      this.ring.position.set(r.x, 0.06, r.z); this.ring.scale.setScalar(pu);
      this.ring.material.color.setHex(m.boostT > 0 ? 0x38bdf8 : m.fireReady ? 0xff7a18 : 0xf1c40f);
      this.arrow.position.set(r.x, PLAYER_H + (ctl.p.hero ? 3.1 : 2.3) + Math.sin(this.t * 6) * 0.15, r.z);
    }

    // aim arrow: where the next pass or shot will go
    const aim = m.aim3d;
    this.aimArrow.visible = !!(aim && aim.on && ctl);
    if (this.aimArrow.visible) {
      const len = 4.5 + (aim.power || 0) * 7;
      this.aimArrow.position.set(X(aim.x), 0.07, Z(aim.y)); this.aimArrow.rotation.y = Math.atan2(aim.dx, aim.dy);
      this.aimArrow.scale.set(1, 1, len);
      this.aimArrow.material.color.setHex(aim.power > 0.97 ? 0xff5a1f : aim.power > 0 ? 0xfde047 : 0xffffff); this.aimArrow.material.opacity = aim.power > 0 ? 0.95 : 0.75;
    }

    // ball (in the keeper's hands while he holds it)
    let bx = bx0, bz = bz0, by = BALL_R3 + b.z * S * 1.5;
    const drib = b.owner && !b.owner.isGK ? this.figs.get(b.owner) : null;
    if (drib && m.state === 'play') {                                 // little touches ahead of the feet, in step with the stride
      const k = Math.sin(drib.fig.cycle * Math.PI * 4) * 0.32 * Math.min(1, Math.hypot(b.owner.vx, b.owner.vy) / 120);
      bx += Math.sin(drib.fig.yaw) * k; bz += Math.cos(drib.fig.yaw) * k;
    }
    const holder = b.owner && b.owner.isGK ? this.figs.get(b.owner) : null;
    if (holder) { bx = holder.fig.x + Math.sin(holder.fig.yaw) * 0.95; bz = holder.fig.z + Math.cos(holder.fig.yaw) * 0.95; by = 2.15; }
    const sp = Math.hypot(b.vx, b.vy) * S;
    if (sp > 0.05 && !holder) { const ax = V(b.vy, 0, -b.vx).normalize(); this.ball.rotateOnWorldAxis(ax, (sp * dt) / BALL_R3); }
    this.ball.position.set(bx, by, bz);
    this.ballBlob.position.set(bx, 0.045, bz); this.ballBlob.scale.setScalar(1.15 + by * 0.25);
    this.fireLight.position.set(bx, by + 0.5, bz); this.fireLight.intensity = b.fire ? 40 : 0;
    this.ball.material.emissive.setHex(b.fire ? 0xff5a00 : 0x000000); this.ball.material.emissiveIntensity = b.fire ? 0.9 : 0;
    this.trailT -= dt;
    const fast = !b.owner && sp > 30;
    if ((b.fire || fast) && this.trailT <= 0) { this.trailT = 0.02; const t = this.trail[this.trailI++ % this.trail.length]; t.position.set(bx, by, bz); t.material.color.setHex(b.fire ? 0xff8a1f : 0xffffff); t.material.opacity = b.fire ? 0.9 : 0.28; t.scale.setScalar(b.fire ? 1 : 0.8); }
    for (const t of this.trail) if (t.material.opacity > 0) { t.material.opacity = Math.max(0, t.material.opacity - dt * 2.6); t.scale.multiplyScalar(1 - dt * 1.5); }

    // power-ups
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

    // shot target, goal moment, confetti, crowd
    this.target.visible = !m.props3d && !!(m.target && m.target.visible);
    if (this.target.visible) { this.target.position.set(PW / 2 * m.attackDir(m.userTeam), this.goalH / 2, 0); this.target.rotation.x = this.t * 2; const s2 = 1 + Math.sin(this.t * 8) * 0.08; this.target.scale.set(s2, s2, s2); }
    if (m.state !== this.lastState) {
      if (m.state === 'goal') { this.burst(bx, 1, bz); this.shake = 0.5; this.goalT = 0; this.flashRate = 26; const n = this.nets.find(q => Math.sign(q.d) === Math.sign(bx)); if (n) n.t = 1; }
      else if (this.lastState === 'goal') this.flashRate = 1.5;
      this.lastState = m.state;
    }
    if (goal) this.goalT += rdt;
    for (const n of this.nets) if (n.t > 0) { n.t = Math.max(0, n.t - rdt * 1.6); n.back.position.x = n.d * (GOAL_D * S + Math.sin(n.t * Math.PI) * 0.7); }
    if (this.confLife > 0) {
      this.confLife -= dt;
      const p = this.confetti.geometry.attributes.position.array, v = this.confVel;
      for (let i = 0; i < p.length; i += 3) { v[i + 1] -= 16 * dt; p[i] += v[i] * dt; p[i + 1] = Math.max(0.05, p[i + 1] + v[i + 1] * dt); p[i + 2] += v[i + 2] * dt; if (p[i + 1] <= 0.06) { v[i] *= 0.9; v[i + 2] *= 0.9; } }
      this.confetti.geometry.attributes.position.needsUpdate = true;
      if (this.confLife <= 0) for (let i = 1; i < p.length; i += 3) p[i] = -50;
    }
    for (const t of this.ads) t.offset.x += rdt * 0.012;
    for (const s of this.flashes) {
      if (s.material.opacity > 0) s.material.opacity = Math.max(0, s.material.opacity - rdt * 7);
      else if (Math.random() < this.flashRate * rdt / this.flashes.length * 4) {
        const st = this.crowdPts[Math.floor(Math.random() * 3)], up = Math.random() < 0.5, u = Math.random();
        const lz = up ? st.d1 + u * st.d2 : u * st.d1, ly = up ? st.fy + 2.6 + u * st.h2 : 1.6 + u * st.h1;
        s.position.copy(st.g.localToWorld(V((Math.random() - 0.5) * st.len * 0.8, ly + 0.8, lz - 0.5))); s.material.opacity = 1;
      }
    }

    this.updateCamera(rdt, bx, bz, sp, ctl, scorer);
    this.sun.position.set(this.camAim.x - 38, 78, this.camAim.z + (this.day ? 30 : -34));
    this.sun.target.position.copy(this.camAim); this.sun.target.updateMatrixWorld();
    this.renderer.render(this.scene, this.cam);
  }

  updateCamera(rdt, bx, bz, sp, ctl, scorer) {
    const m = this.m, b = m.ball;
    let aim, pos, k = 3.4, ka = 5, cut = 'play';
    if (m.cam3d) {                                                       // drills: closer, follows the trainee
      const c = m.cam3d(); aim = V(X(c.x), 1.2, Z(c.y) * 0.8 - 0.5);
      pos = V(aim.x * 0.96 - (c.side || 0), c.h || 11.5, aim.z + (c.dist || 25)); cut = 'drill';
    } else if (m.state === 'goal' && this.goalT > 1.3 && scorer && this.figs.has(scorer)) {   // scorer close-up, slow orbit
      const sx = X(scorer.x), sz = Z(scorer.y), a = (this.goalT - 1.3) * 0.32 - 0.5, d = -Math.sign(sx || 1);
      aim = V(sx, 2.1, sz); pos = V(sx + d * Math.cos(a) * 8.5, 2.6, sz + (Math.sin(a) * 0.6 + 0.75) * 8.5); cut = 'scorer'; k = 6; ka = 8;
    } else if (m.state === 'goal') {
      aim = V(bx, 1.2, bz); pos = V(bx * 0.9, 8, bz + 20); k = 1.8; cut = 'net';
    } else if (m.state === 'fulltime') {
      const a = this.rt * 0.12; aim = V(0, 2, 0); pos = V(Math.sin(a) * 46, 15, Math.cos(a) * 46 + 6); k = 1.2; cut = 'ft';
    } else {
      const lead = Math.max(-6, Math.min(6, b.vx * S * 0.35));
      const tx = Math.max(-PW / 2 + 14, Math.min(PW / 2 - 14, bx + lead)), tz = bz * 0.55;
      aim = V(tx, 0.8, tz - 1.5);
      pos = V(aim.x * 0.94, 15.5, aim.z + 28.5 + Math.min(5, sp * 0.22));
      if (this.rt < 2.8) k = 0.9;                                        // opening sweep down to the pitch
    }
    if (cut !== this.cut) { if (cut === 'scorer' || (this.cut === 'scorer' && cut !== 'net')) { this.camPos.copy(pos); this.camAim.copy(aim); } this.cut = cut; }
    this.camPos.lerp(pos, Math.min(1, k * rdt)); this.camAim.lerp(aim, Math.min(1, ka * rdt));
    this.cam.position.copy(this.camPos);
    const sh = m.cameras.main.shakeEffect;
    this.shake = Math.max(0, (this.shake || 0) - rdt);
    const amp = (sh && sh.isRunning ? 0.25 : 0) + this.shake * 0.5;
    if (amp > 0) { this.cam.position.x += (Math.random() - 0.5) * amp; this.cam.position.y += (Math.random() - 0.5) * amp; }
    this.cam.lookAt(this.camAim);
    void ctl;
  }

  destroy() {
    this.dead = true;
    window.removeEventListener('resize', this.onResize);
    for (const [p, f] of this.figs) this.dropFig(p, f);
    this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((mm) => mm.dispose()); } });
    this.tex.forEach((t) => t.dispose());
    if (this.sr.owner === this) { this.sr.owner = null; this.canvas.style.display = 'none'; this.renderer.clear(); }
  }
}
