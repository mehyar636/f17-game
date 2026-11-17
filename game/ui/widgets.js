import { FONT, FONT_R } from '../match/config.js';
import { sfx } from '../match/sfx.js';

export const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const lum = (c) => (0.299 * ((c >> 16) & 255) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255)) / 255;

/** Round club crest: kit colours, pattern hint and the club's initial. Returns a container. */
export function crest(scene, x, y, r, team) {
  const k = team.kit, g = scene.add.graphics();
  g.fillStyle(0x000000, 0.35); g.fillCircle(2, 3, r);
  g.fillStyle(k.trim); g.fillCircle(0, 0, r);
  g.fillStyle(k.jersey); g.fillCircle(0, 0, r * 0.86);
  g.fillStyle(k.jerseyLight, 0.9);
  if (k.pattern === 'stripes') { g.fillRect(-r * 0.12, -r * 0.8, r * 0.24, r * 1.6); g.fillRect(-r * 0.55, -r * 0.62, r * 0.16, r * 1.24); g.fillRect(r * 0.39, -r * 0.62, r * 0.16, r * 1.24); }
  else if (k.pattern === 'band' || k.pattern === 'hoops') g.fillRect(-r * 0.82, -r * 0.14, r * 1.64, r * 0.28);
  else if (k.pattern === 'sash') { g.fillTriangle(-r * 0.6, -r * 0.6, -r * 0.25, -r * 0.8, r * 0.6, r * 0.6); g.fillTriangle(-r * 0.6, -r * 0.6, r * 0.6, r * 0.6, r * 0.25, r * 0.8); }
  g.fillStyle(0xffffff, 0.16); g.fillEllipse(-r * 0.2, -r * 0.4, r * 1.1, r * 0.6);
  g.lineStyle(Math.max(1.5, r * 0.07), 0x000000, 0.35); g.strokeCircle(0, 0, r);
  const letter = team.id === 'f17' ? '17' : team.short[0];
  const t = scene.add.text(0, 0, letter, { fontFamily: FONT, fontSize: `${Math.round(r * (team.id === 'f17' ? 0.85 : 1.05))}px`, color: lum(k.jersey) > 0.62 ? '#111827' : '#ffffff', stroke: lum(k.jersey) > 0.62 ? '#ffffff' : '#000000', strokeThickness: Math.max(2, r * 0.1) }).setOrigin(0.5);
  return scene.add.container(x, y, [g, t]);
}

/** Front-facing portrait of the hero, F17 (#17, green and gold). Returns a container centred on the chest. */
export function heroPortrait(scene, x, y, s = 1) {
  const g = scene.add.graphics();
  const SKIN = 0xd9a066, SKIN_D = 0xb97f4a, HAIR = 0x1f1410, GREEN = 0x15803d, GREEN_L = 0x22c55e, GREEN_D = 0x0b3d1f, GOLD = 0xf1c40f;
  const rr = (c, a, X, Y, W, H, R) => { g.fillStyle(c, a); g.fillRoundedRect(X, Y, W, H, R); };
  const el = (c, a, X, Y, W, H) => { g.fillStyle(c, a); g.fillEllipse(X, Y, W, H); };
  el(0x000000, 0.35, 0, 118, 150, 26);                                   // ground shadow
  // legs, socks, boots
  rr(SKIN_D, 1, -30, 44, 24, 40, 8); rr(SKIN_D, 1, 6, 44, 24, 40, 8);
  rr(SKIN, 1, -30, 44, 16, 40, 8); rr(SKIN, 1, 6, 44, 16, 40, 8);
  rr(GOLD, 1, -31, 74, 26, 30, 7); rr(GOLD, 1, 5, 74, 26, 30, 7);
  rr(0xffffff, 0.35, -31, 76, 26, 5, 2); rr(0xffffff, 0.35, 5, 76, 26, 5, 2);
  rr(0x111827, 1, -38, 100, 34, 16, 7); rr(0x111827, 1, 4, 100, 34, 16, 7);
  rr(0xffffff, 0.6, -34, 104, 14, 3, 1); rr(0xffffff, 0.6, 20, 104, 14, 3, 1);
  // shorts
  rr(GREEN_D, 1, -36, 22, 72, 34, 8); rr(0x000000, 0.25, -2, 34, 4, 22, 2); rr(GOLD, 1, -36, 50, 30, 4, 2); rr(GOLD, 1, 6, 50, 30, 4, 2);
  // arms (behind torso edge): sleeve + forearm + hand
  rr(GREEN, 1, -62, -46, 26, 36, 11); rr(GREEN, 1, 36, -46, 26, 36, 11);
  rr(GOLD, 1, -62, -16, 26, 6, 3); rr(GOLD, 1, 36, -16, 26, 6, 3);
  rr(SKIN, 1, -59, -12, 20, 40, 9); rr(SKIN, 1, 39, -12, 20, 40, 9);
  el(SKIN_D, 1, -49, 30, 20, 18); el(SKIN_D, 1, 49, 30, 20, 18);
  // torso: jersey with gold stripes
  rr(GREEN_D, 1, -42, -52, 84, 82, 16); rr(GREEN, 1, -42, -52, 78, 80, 16);
  rr(GREEN_L, 0.5, -36, -48, 40, 34, 12);
  rr(GOLD, 0.9, -4, -50, 8, 78, 3); rr(GOLD, 0.45, -24, -46, 5, 72, 2); rr(GOLD, 0.45, 19, -46, 5, 72, 2);
  // neck + collar
  rr(SKIN_D, 1, -11, -66, 22, 20, 6);
  g.fillStyle(GOLD); g.fillTriangle(-20, -54, 20, -54, 0, -36); g.fillStyle(GREEN_D); g.fillTriangle(-11, -54, 11, -54, 0, -43);
  // head
  el(SKIN_D, 1, -33, -92, 12, 18); el(SKIN_D, 1, 33, -92, 12, 18);        // ears
  el(SKIN, 1, 0, -94, 62, 68);
  el(0xffffff, 0.14, -12, -106, 24, 18);
  // hair: cap + swept fringe
  g.fillStyle(HAIR); g.slice(0, -100, 33, Math.PI, 0, false); g.fillPath();
  el(HAIR, 1, 0, -122, 60, 30); g.fillStyle(HAIR); g.fillTriangle(-32, -112, 6, -124, -14, -98); g.fillTriangle(32, -112, 10, -124, 24, -100);
  el(0x4a3324, 0.6, -8, -128, 26, 8);
  // face
  rr(HAIR, 1, -20, -100, 14, 4, 2); rr(HAIR, 1, 6, -100, 14, 4, 2);       // brows
  el(0xffffff, 1, -13, -90, 13, 12); el(0xffffff, 1, 13, -90, 13, 12);
  el(0x1f2937, 1, -12, -89, 7, 8); el(0x1f2937, 1, 14, -89, 7, 8);
  el(0xffffff, 1, -10.5, -91, 2.6, 2.6); el(0xffffff, 1, 15.5, -91, 2.6, 2.6);
  el(SKIN_D, 0.8, 0, -82, 7, 6);                                           // nose
  g.lineStyle(3, 0x7c2d12, 1); g.beginPath(); g.arc(0, -76, 11, 0.25, Math.PI - 0.25); g.strokePath();   // smile
  el(0xf87171, 0.35, -21, -78, 10, 6); el(0xf87171, 0.35, 21, -78, 10, 6);
  const num = scene.add.text(0, -8, '17', { fontFamily: FONT, fontSize: '40px', color: '#ffffff', stroke: '#0b3d1f', strokeThickness: 6 }).setOrigin(0.5);
  const items = [g, num];
  if (scene.textures.exists('m_ball')) items.push(scene.add.image(58, 104, 'm_ball').setScale(0.42));
  return scene.add.container(x, y, items).setScale(s);
}

/** Pill button with hover + press feedback. */
export function button(scene, x, y, w, h, label, opts = {}) {
  const { color = 0x22c55e, text = '#04170a', size = 20, sub, onClick } = opts;
  const g = scene.add.graphics();
  const draw = (hover) => {
    g.clear();
    g.fillStyle(0x000000, 0.35); g.fillRoundedRect(-w / 2 + 2, -h / 2 + 5, w, h, h / 2 > 26 ? 18 : h / 2);
    g.fillStyle(color); g.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2 > 26 ? 18 : h / 2);
    g.fillStyle(0xffffff, hover ? 0.28 : 0.14); g.fillRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, h * 0.42, h / 2 > 26 ? 14 : h * 0.21);
  };
  draw(false);
  const items = [g, scene.add.text(0, sub ? -8 : 0, label, { fontFamily: FONT, fontSize: `${size}px`, color: text }).setOrigin(0.5)];
  if (sub) items.push(scene.add.text(0, size * 0.75, sub, { fontFamily: FONT_R, fontSize: '11px', color: text, letterSpacing: 2 }).setOrigin(0.5).setAlpha(0.7));
  const c = scene.add.container(x, y, items).setSize(w, h).setInteractive({ useHandCursor: true });
  c.on('pointerover', () => { draw(true); scene.tweens.add({ targets: c, scale: 1.03, duration: 90 }); });
  c.on('pointerout', () => { draw(false); scene.tweens.add({ targets: c, scale: 1, duration: 90 }); });
  c.on('pointerdown', () => c.setScale(0.97));
  c.on('pointerup', () => { c.setScale(1); sfx.ensure(); sfx.click(); if (onClick) onClick(); });
  return c;
}

/** Dark rounded panel with an optional gold accent bar. */
export function panel(scene, x, y, w, h, { accent = false, alpha = 0.8, radius = 16 } = {}) {
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.35); g.fillRoundedRect(x + 3, y + 6, w, h, radius);
  g.fillStyle(0x0b1220, alpha); g.fillRoundedRect(x, y, w, h, radius);
  g.fillStyle(0xffffff, 0.04); g.fillRoundedRect(x, y, w, Math.min(h, 90), { tl: radius, tr: radius, bl: 0, br: 0 });
  g.lineStyle(1.5, 0xffffff, 0.14); g.strokeRoundedRect(x, y, w, h, radius);
  if (accent) { g.fillStyle(0xf1c40f); g.fillRoundedRect(x, y, w, 5, { tl: radius, tr: radius, bl: 0, br: 0 }); }
  return g;
}

/** Queue the shared menu artwork (call from a scene's preload). */
export function preloadArt(scene) {
  if (!scene.textures.exists('m_stadium')) scene.load.image('m_stadium', 'game/assets/stadium.png');
}

/** Night-stadium photo backdrop with a slow drift, darkened so panels read clearly. */
export function backdrop(scene) {
  const { width: W, height: H } = scene.scale;
  if (scene.textures.exists('m_stadium')) {
    const img = scene.add.image(W / 2, H / 2 - 20, 'm_stadium');
    const sc = Math.max(W / img.width, H / img.height) * 1.1;
    img.setScale(sc);
    scene.tweens.add({ targets: img, scale: sc * 1.07, x: W / 2 + 18, duration: 16000, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }
  const g = scene.add.graphics();
  g.fillStyle(0x050810, 0.5); g.fillRect(0, 0, W, H);
  g.fillGradientStyle(0x050810, 0x050810, 0x050810, 0x050810, 0.92, 0.92, 0, 0); g.fillRect(0, 0, W, 170);
  g.fillGradientStyle(0x050810, 0x050810, 0x050810, 0x050810, 0, 0, 0.96, 0.96); g.fillRect(0, H - 260, W, 260);
  if (scene.textures.exists('m_vignette')) scene.add.image(0, 0, 'm_vignette').setOrigin(0).setDisplaySize(W, H).setBlendMode(Phaser.BlendModes.MULTIPLY);
  return g;
}

/** Shared top bar: logo, title, coins. */
export function topBar(scene, title, sub, coins) {
  const { width: W } = scene.scale;
  const g = scene.add.graphics();
  g.fillStyle(0xf1c40f); g.fillRoundedRect(36, 26, 64, 40, 9);
  scene.add.text(68, 46, 'F17', { fontFamily: FONT, fontSize: '26px', color: '#111827' }).setOrigin(0.5);
  scene.add.text(116, 24, title, { fontFamily: FONT, fontSize: '30px', color: '#ffffff' });
  scene.add.text(118, 58, sub, { fontFamily: FONT_R, fontSize: '11px', color: 'rgba(255,255,255,0.5)', letterSpacing: 3 });
  g.fillStyle(0x000000, 0.5); g.fillRoundedRect(W - 176, 28, 140, 36, 18);
  if (scene.textures.exists('m_coin')) scene.add.image(W - 154, 46, 'm_coin').setScale(0.55);
  return scene.add.text(W - 134, 46, String(coins), { fontFamily: FONT, fontSize: '20px', color: '#fde047' }).setOrigin(0, 0.5);
}
