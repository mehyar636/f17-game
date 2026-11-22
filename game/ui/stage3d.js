// The menu "stage": the hero F17 as a live 3D character behind the (transparent) Phaser UI.
// Loaded lazily; if 3D is unavailable the menus keep their 2D backdrop and portrait.
import { F17_KIT } from '../data/teams.js';

const FOV = 30, DIST = 10;
const HV = 2 * DIST * Math.tan((FOV / 2) * Math.PI / 180);      // world height visible at the hero's depth
let mod = null, st = null, failed = false, token = 0;

async function init() {
  if (st) return st;
  if (failed || new URLSearchParams(location.search).has('2d')) throw new Error('3D off');
  try {
    mod = mod || await import('../gfx/figure.js');
    const { THREE, Figure, HERO_LOOK, loadModel, sharedRenderer, specFor, canvasTex, ballMaterial } = mod;
    const gltf = await loadModel();
    const sr = sharedRenderer();
    const scene = new THREE.Scene(); scene.backgroundIntensity = 0.5;
    const cam = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.5, 100);
    cam.position.set(0, 0, DIST); cam.lookAt(0, 0, 0);
    scene.add(new THREE.HemisphereLight(0xdbe7ff, 0x1c2a1c, 1.0));
    const key = new THREE.DirectionalLight(0xfff3d6, 2.6); key.position.set(4, 7, 8); scene.add(key);
    const rimL = new THREE.DirectionalLight(0xffe9a8, 1.3); rimL.position.set(-6, 4, -7); scene.add(rimL);
    const rimR = new THREE.DirectionalLight(0x60a5fa, 1.6); rimR.position.set(7, 3, -6); scene.add(rimR);
    key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    const c = key.shadow.camera; c.left = -4; c.right = 4; c.top = 5; c.bottom = -3; c.near = 1; c.far = 30;
    // stadium photo behind, cover-fitted to the 16:9 viewport
    new THREE.TextureLoader().load('game/assets/stadium.png', (t) => {
      t.colorSpace = THREE.SRGBColorSpace; const a = (16 / 9) / (t.image.width / t.image.height);
      t.repeat.set(Math.min(1, a) * 0.94, Math.min(1, 1 / a) * 0.94); t.offset.set((1 - t.repeat.x) / 2, (1 - t.repeat.y) / 2);
      st.bg = t; scene.background = t;
    });
    const hero = new Figure(gltf, specFor(F17_KIT, 9, { num: 17, name: 'F17', height: 1, texSize: 1024, sponsor: 'F17', ...HERO_LOOK }));
    const pivot = new THREE.Group(); pivot.add(hero.root); scene.add(pivot);
    // pitch disc + spotlight glow under the hero
    const discTex = canvasTex(256, 256, (g) => {
      g.clearRect(0, 0, 256, 256);
      const gr = g.createRadialGradient(128, 128, 10, 128, 128, 128); gr.addColorStop(0, 'rgba(250,204,21,0.55)'); gr.addColorStop(0.45, 'rgba(34,197,94,0.35)'); gr.addColorStop(1, 'rgba(34,197,94,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 3; g.beginPath(); g.arc(128, 128, 84, 0, 7); g.stroke();
    });
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: discTex, transparent: true, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; pivot.add(disc);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.45 }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.002; shadow.receiveShadow = true; pivot.add(shadow);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.061, 28, 18), ballMaterial());
    ball.castShadow = true; pivot.add(ball);
    st = { THREE, sr, scene, cam, hero, pivot, disc, shadow, ball, t: 0, cfg: null, yaw: 0, bg: null };
    return st;
  } catch (e) { failed = true; throw e; }
}

function frame(dt) {
  const s = st; if (!s || !s.cfg || s.sr.owner !== stage) return;
  s.t += dt;
  const game = s.cfg.scene.game, rect = game.canvas.getBoundingClientRect(), r = s.sr.renderer;
  const W = window.innerWidth, H = window.innerHeight;
  if (s.w !== W || s.h !== H) { s.w = W; s.h = H; r.setSize(W, H, false); }
  r.setViewport(rect.left, H - rect.bottom, rect.width, rect.height); r.setScissor(rect.left, H - rect.bottom, rect.width, rect.height); r.setScissorTest(true);
  const c = s.cfg, sway = c.turn === false ? 0 : Math.sin(s.t * 0.5) * 0.4;
  s.yaw += ((c.yaw || 0) + sway + (s.spin || 0) - s.yaw) * Math.min(1, 5 * dt);
  if (s.spin) s.spin *= Math.pow(0.02, dt);
  s.hero.update(dt, { x: 0, z: 0, speed: 0, yaw: s.yaw, look: null });
  // ball: bounces on the knee while juggling, otherwise rests by the foot
  if (s.hero.loopName === 'juggle') { const u = (s.hero.loopT % 0.9) / 0.9, k = Math.max(0, Math.sin(u * Math.PI * 2)); const fall = u > 0.5 ? Math.abs(Math.sin((u - 0.5) * 2 * Math.PI)) : 0; s.ball.position.set(-0.05, 0.3 + k * 0.06 + fall * 0.3, 0.2); s.ball.rotation.x -= dt * 6; }
  else s.ball.position.set(0.24, 0.062, 0.16);
  if (s.bg) s.bg.offset.x = (1 - s.bg.repeat.x) / 2 + Math.sin(s.t * 0.12) * 0.02;
  r.render(s.scene, s.cam);
}

export const stage = {
  /**
   * Show the hero on a menu scene. cfg: { x, y (feet, design px), h (height px), yaw, loop, turn, ball }.
   * Resolves true once the 3D hero is on screen (false if 3D is unavailable).
   */
  async show(scene, cfg) {
    const my = ++token;
    try { await init(); } catch (e) { return false; }
    if (my !== token || !scene.sys.isActive()) return false;
    const s = st, k = HV / 720, size = cfg.h * k;
    s.cfg = { ...cfg, scene }; s.sr.owner = stage;
    s.pivot.position.set((cfg.x - 640) * k, (360 - cfg.y) * k, 0);
    s.pivot.scale.setScalar(size);
    s.disc.scale.setScalar(1.5); s.shadow.scale.setScalar(3);
    s.ball.visible = cfg.ball !== false;
    s.hero.setLoop(cfg.loop || null); s.hero.action = null;
    s.sr.canvas.style.display = 'block';
    const tick = (_t, d) => frame(Math.min(0.05, d / 1000));
    scene.events.on('update', tick);
    scene.events.once('shutdown', () => { scene.events.off('update', tick); if (s.cfg && s.cfg.scene === scene) stage.hide(); });
    return true;
  },
  hide() {
    token++;
    if (!st) return;
    st.cfg = null;
    if (st.sr.owner === stage) { st.sr.owner = null; st.sr.renderer.setScissorTest(false); st.sr.renderer.clear(); st.sr.canvas.style.display = 'none'; }
  },
  /** Hero reactions for menu feedback. */
  cheer() { if (st && st.cfg) { st.hero.setLoop('pump'); clearTimeout(st.tm); st.tm = setTimeout(() => { if (st.cfg) st.hero.setLoop(st.cfg.loop || null); }, 1300); } },
  kick() { if (st && st.cfg) st.hero.play('shoot'); },
  spin() { if (st && st.cfg) st.spin = (st.spin || 0) + Math.PI * 2; },
  get active() { return !!(st && st.cfg); },
  get hero() { return st && st.hero; },
};
