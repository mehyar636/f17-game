import { BALL_R, HAIRS, SKINS, TEAM } from './config.js';

/** Texture super-sampling factor: parts are drawn at R× and displayed at 1/R for crisp edges. */
export const R = 3;

const shade = (c, f) => {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * f)), g = Math.min(255, Math.round(((c >> 8) & 255) * f)), b = Math.min(255, Math.round((c & 255) * f));
  return (r << 16) | (g << 8) | b;
};

/** Generates every procedural sprite texture once. All keys prefixed `m_`. */
export function generateTextures(scene) {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  // scaled helpers (base units → R px)
  const E = (x, y, w, h) => g.fillEllipse(x * R, y * R, w * R, h * R);
  const C = (x, y, r) => g.fillCircle(x * R, y * R, r * R);
  const Q = (x, y, w, h) => g.fillRect(x * R, y * R, w * R, h * R);
  const SE = (x, y, w, h, lw, col, a) => { g.lineStyle(lw * R, col, a); g.strokeEllipse(x * R, y * R, w * R, h * R); };
  const F = (col, a = 1) => g.fillStyle(col, a);
  const tex = (key, w, h, draw) => {
    if (scene.textures.exists(key)) return;
    g.clear(); draw(); g.generateTexture(key, Math.ceil(w * R), Math.ceil(h * R));
  };

  // ── Soft shadow (directional light from top-left → offset applied by the rig) ──
  tex('m_shadow', 64, 40, () => {
    for (let i = 7; i >= 1; i--) { F(0x000000, 0.07); E(32, 20, 7 * i + 10, 4.2 * i + 5); }
  });

  // ── Ball ──────────────────────────────────────────────────────────────────
  const BS = BALL_R * 2 + 4, bc = BS / 2;
  tex('m_ball', BS, BS, () => {
    F(0x000000, 0.25); C(bc + 0.6, bc + 0.8, BALL_R);
    F(0xfafafa); C(bc, bc, BALL_R);
    F(0xdedede, 0.8); E(bc + 2, bc + 3, BALL_R * 1.5, BALL_R * 1.2);         // lower shade
    F(0xffffff); C(bc - 2.5, bc - 3, BALL_R * 0.72);                        // upper light
    F(0x151515);
    const spots = [[0, 0, 4.3], [7.2, -4.2, 3.1], [-7.2, -4.2, 3.1], [6.8, 5.6, 3.1], [-6.8, 5.6, 3.1]];
    for (const [dx, dy, r] of spots) {
      g.beginPath();
      for (let v = 0; v < 5; v++) {
        const a = (v / 5) * Math.PI * 2 - Math.PI / 2;
        const px = (bc + dx + Math.cos(a) * r) * R, py = (bc + dy + Math.sin(a) * r) * R;
        if (v === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.closePath(); g.fillPath();
    }
    g.lineStyle(0.6 * R, 0x222222, 0.55);
    for (const [dx, dy] of spots.slice(1)) { g.beginPath(); g.moveTo(bc * R, bc * R); g.lineTo((bc + dx * 0.55) * R, (bc + dy * 0.55) * R); g.strokePath(); }
    F(0xffffff, 0.85); E(bc - 3.5, bc - 4.5, 4.5, 2.6);
    SE(bc, bc, BALL_R * 2 - 0.6, BALL_R * 2 - 0.6, 0.7, 0x8a8a8a, 0.7);
  });

  // ── Selection ring + facing chevron ──────────────────────────────────────
  tex('m_ring', 76, 76, () => {
    SE(38, 38, 66, 46, 5, 0xf1c40f, 0.18);
    SE(38, 38, 58, 40, 2.6, 0xf1c40f, 1);
    SE(38, 38, 50, 34, 1, 0xffffff, 0.35);
  });
  tex('m_chev', 18, 14, () => {
    F(0x000000, 0.35); g.fillTriangle(1 * R, 1.5 * R, 17 * R, 7.5 * R, 1 * R, 13.5 * R);
    F(0xf1c40f); g.fillTriangle(0, 0.5 * R, 16 * R, 7 * R, 0, 13 * R);
    F(0xfff3b0, 0.8); g.fillTriangle(2 * R, 2.5 * R, 9 * R, 7 * R, 2 * R, 11 * R);
  });

  // ── FX ────────────────────────────────────────────────────────────────────
  tex('m_particle', 8, 8, () => { F(0xffffff); Q(0, 0, 8, 5); });
  tex('m_dust', 16, 16, () => { for (let r = 8; r > 0; r -= 1.5) { F(0xffffff, 0.09); C(8, 8, r); } });
  tex('m_flash', 12, 12, () => { F(0xffffff, 0.5); C(6, 6, 6); F(0xffffff); C(6, 6, 3); Q(5.2, 0, 1.6, 12); Q(0, 5.2, 12, 1.6); });
  tex('m_glow', 128, 128, () => { for (let r = 64; r > 0; r -= 2) { F(0xfff3c4, 0.016 * (1 - r / 64) + 0.003); C(64, 64, r); } });
  tex('m_spot', 32, 32, () => { for (let r = 16; r > 0; r -= 2) { F(0xffffff, 0.08); C(16, 16, r); } });

  // ── Kit parts per team (drawn facing UP = -y, centred) ────────────────────
  TEAM.forEach((t, ti) => {
    // a different club in this slot → drop the old kit textures so they are redrawn
    const sig = [t.jersey, t.jerseyLight, t.trim, t.shorts, t.socks, t.pattern].join(',');
    if (scene.registry.get(`kitSig${ti}`) !== sig) {
      [`m_torso_${ti}`, `m_leg_${ti}`, ...SKINS.map((_, si) => `m_arm_${ti}_${si}`)].forEach(k => { if (scene.textures.exists(k)) scene.textures.remove(k); });
      scene.registry.set(`kitSig${ti}`, sig);
    }
    const dark = shade(t.jersey, 0.62), light = t.jerseyLight;
    // Torso 44×38: shoulders, shoulder caps, collar, sleeves, back detail
    tex(`m_torso_${ti}`, 44, 38, () => {
      const cx = 22, cy = 19;
      F(0x000000, 0.22); E(cx, cy + 2.5, 41, 31);                              // contact shade
      F(dark); E(cx, cy, 40, 30);                                              // jersey base (dark)
      F(t.jersey); E(cx, cy - 1.2, 37, 26);                                    // mid tone
      F(light, 0.5); E(cx, cy - 4.5, 24, 13);                                  // upper-back light
      F(dark, 0.55); E(cx, cy + 9, 26, 7);                                     // lower hem shade
      // shoulder caps
      F(t.jersey); C(cx - 14.5, cy - 1.5, 7.2); C(cx + 14.5, cy - 1.5, 7.2);
      F(light, 0.45); C(cx - 15, cy - 3.5, 4.2); C(cx + 15, cy - 3.5, 4.2);
      // sleeve cuffs (trim)
      F(t.trim, 0.9); E(cx - 18.5, cy + 1.5, 4.5, 9); E(cx + 18.5, cy + 1.5, 4.5, 9);
      // kit pattern
      if (t.pattern === 'stripes') { F(t.trim, 0.55); Q(cx - 1.4, cy - 11, 2.8, 24); F(t.trim, 0.3); Q(cx - 6.4, cy - 9, 1.6, 20); Q(cx + 4.8, cy - 9, 1.6, 20); }
      else if (t.pattern === 'band') { F(t.trim, 0.4); Q(cx - 16, cy - 1, 32, 5); }
      else if (t.pattern === 'hoops') { F(t.trim, 0.38); Q(cx - 15, cy - 5, 30, 3); Q(cx - 16, cy + 2, 32, 3); }
      else if (t.pattern === 'sash') { F(t.trim, 0.5); for (let k = 0; k < 9; k++) Q(cx - 13 + k * 2.9, cy - 9 + k * 2.2, 4.5, 3); }
      // collar (front) + neck opening
      F(t.trim, 0.95); E(cx, cy - 10.5, 11, 5.5);
      F(dark); E(cx, cy - 10, 7, 3.4);
      // outline + rim
      SE(cx, cy, 40, 30, 1.1, 0x000000, 0.42);
      SE(cx, cy - 1, 36, 25, 0.8, 0xffffff, 0.14);
    });
    // Leg 16×28: thigh (shorts), knee, shin/sock, boot (toe forward = top)
    tex(`m_leg_${ti}`, 16, 28, () => {
      F(0x000000, 0.22); E(8, 15, 13, 24);
      F(shade(t.shorts, 0.8)); E(8, 19, 12, 15);                              // thigh
      F(t.shorts); E(7.3, 18, 9, 12);
      F(0xffffff, 0.12); E(6.6, 16.5, 4.5, 6);
      F(shade(t.socks, 0.78)); E(8, 10.5, 9.5, 11);                           // sock
      F(t.socks); E(7.5, 10, 7.5, 9);
      F(0xffffff, 0.22); E(6.8, 8.5, 3, 4.5);
      F(0x0d0d0d); E(8, 4.2, 9.5, 7.5);                                       // boot
      F(0x2a2a2a); E(7.6, 3.6, 7, 5.5);
      F(0xffffff, 0.55); Q(5.8, 2.6, 4.4, 1.2); F(0xffffff, 0.3); Q(6.2, 4.4, 3.6, 1);
    });
    // Arms per skin tone 12×24: sleeve + forearm + hand
    SKINS.forEach((skin, si) => {
      tex(`m_arm_${ti}_${si}`, 12, 24, () => {
        F(0x000000, 0.2); E(6, 13, 10, 20);
        F(dark); E(6, 17, 9.5, 12);                                           // sleeve
        F(t.jersey); E(5.6, 16.5, 7.5, 9.5);
        F(t.trim, 0.8); E(6, 12.5, 8.5, 2.6);                                 // cuff
        F(shade(skin, 0.85)); E(6, 7.5, 7.5, 12);                             // forearm
        F(skin); E(5.5, 7, 5.8, 10);
        F(shade(skin, 0.75)); E(6, 2.8, 5.6, 4.4);                            // hand
        F(0xffffff, 0.18); E(4.8, 6, 2.2, 5);
      });
    });
  });

  // ── Heads: skin × hair × 3 styles (top-down: mostly hair, forehead crescent at front)
  SKINS.forEach((skin, si) => {
    HAIRS.forEach((hair, hi) => {
      for (let style = 0; style < 3; style++) {
        tex(`m_head_${si}_${hi}_${style}`, 28, 28, () => {
          const c = 14;
          F(0x000000, 0.28); C(c, c + 1.2, 11.2);
          // ears
          F(shade(skin, 0.85)); C(c - 10.2, c + 0.5, 2.6); C(c + 10.2, c + 0.5, 2.6);
          // face
          F(shade(skin, 0.9)); C(c, c, 10.4);
          F(skin); C(c - 0.5, c - 0.8, 9.2);
          F(0xffffff, 0.16); E(c - 3, c - 4.5, 5, 3.2);                      // forehead sheen
          const bald = style === 2 && hi === 6;
          if (!bald) {
            const hDark = shade(hair, 0.7), hLight = shade(hair, 1.45);
            if (style === 0) {        // short crop
              F(hDark); C(c, c + 1.6, 9.6); F(hair); C(c, c + 1.4, 8.8); F(hair); E(c, c - 2.4, 15.5, 6.5);
              F(hLight, 0.35); E(c - 2.5, c - 0.5, 6, 3.5);
            } else if (style === 1) { // volume / fringe
              F(hDark); C(c, c + 1.2, 10.4); F(hair); C(c, c + 1, 9.6); F(hair); E(c, c - 3.6, 17, 7);
              F(hLight, 0.4); E(c - 3, c - 1, 7, 4); F(hDark, 0.5); Q(c - 0.6, c - 7, 1.2, 10);   // parting
            } else {                  // buzz + headband
              F(hDark, 0.9); C(c, c + 1.4, 9.4); F(hair, 0.85); C(c, c + 1.2, 8.6); F(hair); E(c, c - 2.2, 14.5, 6);
              F(TEAM[si % 2].trim, 0.95); E(c, c - 4.6, 16, 3.2);                              // headband
            }
          } else { F(0xffffff, 0.2); C(c - 3, c - 3, 3.5); }
          SE(c, c, 20.8, 20.8, 0.7, 0x000000, 0.35);
        });
      }
    });
  });

  // ── Kids-mode pickups, target marker, star / fire particles ───────────────
  const poly = (pts, cx, cy, s) => {
    g.beginPath();
    pts.forEach(([x, y], i) => { const px = (cx + x * s) * R, py = (cy + y * s) * R; if (i === 0) g.moveTo(px, py); else g.lineTo(px, py); });
    g.closePath(); g.fillPath();
  };
  const starPts = (n = 5, ro = 1, ri = 0.45) => Array.from({ length: n * 2 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / n, r = i % 2 ? ri : ro; return [Math.cos(a) * r, Math.sin(a) * r];
  });
  const badge = (key, col, drawIcon) => tex(key, 40, 40, () => {
    F(0x000000, 0.3); C(20, 22, 17);
    F(0xffffff); C(20, 20, 17);
    F(col); C(20, 20, 14.5);
    F(0xffffff, 0.22); E(20, 14, 20, 9);
    drawIcon();
    SE(20, 20, 34, 34, 1.2, 0x000000, 0.35);
  });
  badge('m_pu_speed', 0xfacc15, () => { F(0xffffff); poly([[-2, -9], [4, -9], [1, -2], [5, -2], [-3, 9], [-1, 1], [-5, 1]], 20, 20, 1); });
  badge('m_pu_fire', 0xf97316, () => {
    F(0xdc2626); E(20, 22, 13, 17); E(16, 16, 6, 9); E(24, 15, 5, 8);
    F(0xfacc15); E(20, 24, 7, 10); F(0xffffff, 0.85); E(20, 26, 3, 5);
  });
  badge('m_pu_star', 0xfde047, () => { F(0xffffff); poly(starPts(), 20, 20.5, 10); F(0xf59e0b, 0.5); poly(starPts(), 20, 21, 7); });
  tex('m_star', 16, 16, () => { F(0xffffff); poly(starPts(), 8, 8, 7); });
  tex('m_fire', 16, 16, () => { for (let r = 7; r > 0; r -= 1.2) { F(0xffffff, 0.14); C(8, 8, r); } });
  tex('m_target', 64, 64, () => {
    SE(32, 32, 56, 56, 2.4, 0xffffff, 0.9); SE(32, 32, 36, 36, 2, 0xf1c40f, 0.9);
    F(0xf1c40f); Q(31, 2, 2, 10); Q(31, 52, 2, 10); Q(2, 31, 10, 2); Q(52, 31, 10, 2); C(32, 32, 3);
  });
  // training cone (top-down: orange disc with white band) and a floor target disc
  tex('m_cone', 24, 24, () => {
    F(0x000000, 0.3); E(12, 13.5, 20, 12);
    F(0xc2410c); C(12, 12, 9.5); F(0xf97316); C(12, 11.5, 8.5);
    F(0xffffff, 0.9); SE(12, 11.5, 11, 11, 1.6, 0xffffff, 0.9);
    F(0xfdba74); C(11, 10, 3.5); F(0x7c2d12); C(12, 11.5, 1.6);
  });
  tex('m_disc', 64, 64, () => {
    F(0xffffff, 0.12); C(32, 32, 30); SE(32, 32, 58, 58, 2.5, 0xffffff, 0.8); SE(32, 32, 36, 36, 2, 0xffffff, 0.5); F(0xffffff, 0.9); C(32, 32, 4);
  });
  tex('m_coin', 16, 16, () => { F(0xb45309); C(8, 8.6, 7); F(0xfbbf24); C(8, 8, 7); F(0xfde68a); C(7, 6.5, 3.5); F(0xb45309, 0.8); Q(7, 4.5, 2, 7); });

  g.destroy();

  // ── Vignette (canvas radial gradient) ─────────────────────────────────────
  if (!scene.textures.exists('m_vignette')) {
    const W = 512, H = 288;
    const ct = scene.textures.createCanvas('m_vignette', W, H);
    const ctx = ct.getContext();
    const grd = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(0.7, 'rgba(0,0,0,0.18)');
    grd.addColorStop(1, 'rgba(0,0,0,0.62)');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
    ct.refresh();
  }
}
