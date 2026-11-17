// BootScene — generates all game textures with proper footballer silhouettes
// Players: head + jersey (with side stripes, collar, shine) + arms + shorts + legs + boots + shadow
// Two walk frames per player type for animation
class BootScene extends Phaser.Scene {
  constructor() { super({ key: 'Boot' }); }

  create() {
    // 2 walk frames per kit (frame 0 = key as-is, frame 1 = key + '-1')
    this._makePlayer('player-home',   0x1a6fd4, 0x0a3d8c, 0xf0f0f0, 0);
    this._makePlayer('player-home-1', 0x1a6fd4, 0x0a3d8c, 0xf0f0f0, 1);
    this._makePlayer('player-away',   0xdd1a1a, 0x8a0000, 0x111111, 0);
    this._makePlayer('player-away-1', 0xdd1a1a, 0x8a0000, 0x111111, 1);
    this._makePlayer('keeper-home',   0xe8a800, 0xa87000, 0x111111, 0);
    this._makePlayer('keeper-home-1', 0xe8a800, 0xa87000, 0x111111, 1);
    this._makePlayer('keeper-away',   0x00a050, 0x004a22, 0xf0f0f0, 0);
    this._makePlayer('keeper-away-1', 0x00a050, 0x004a22, 0xf0f0f0, 1);
    this._makeUserPlayer('player-user',   0);
    this._makeUserPlayer('player-user-1', 1);
    this._makeBall();
    this._makeGlow('glow-green', 0x00ff8a);
    this._makeGlow('glow-gold',  0xffd700);
    this._makeGlow('glow-white', 0xffffff);
    this._makeGlow('glow-red',   0xff3344);
    this._makeDot();
    this.scene.start('Menu');
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  _makePlayer  —  80×80 canvas, player faces UP (−y)
  //  Layout (top → bottom): direction dot | head | neck | jersey | shorts | legs | boots
  //  frame 0: left leg slightly forward; frame 1: right leg slightly forward
  // ─────────────────────────────────────────────────────────────────────────
  _makePlayer(key, jerseyColor, jerseyDark, shortsColor, frame) {
    const S = 80, cx = S / 2;
    const g = this.make.graphics({ add: false });

    // ── Ground shadow ─────────────────────────────────────────────
    g.fillStyle(0x000000, 0.28);
    g.fillEllipse(cx + 5, S - 7, 46, 11);

    // ── Legs & feet ───────────────────────────────────────────────
    const lLX = cx - 11;  // left leg X
    const lRX = cx + 1;   // right leg X
    const lLY = frame === 0 ? 50 : 55;  // left leg Y (forward = higher number)
    const lRY = frame === 0 ? 55 : 50;  // right leg Y
    const lW = 11;

    // Boots
    g.fillStyle(0x0d0d0d, 1);
    g.fillRoundedRect(lLX - 1, lLY + 10, lW + 2, 8, 3);
    g.fillRoundedRect(lRX - 1, lRY + 10, lW + 2, 8, 3);
    // Boot glint
    g.fillStyle(0xffffff, 0.18);
    g.fillCircle(lLX + 3, lLY + 12, 2.5);
    g.fillCircle(lRX + 3, lRY + 12, 2.5);

    // Socks
    g.fillStyle(0xe8e8e8, 1);
    g.fillRoundedRect(lLX, lLY + 4, lW, 8, 2);
    g.fillRoundedRect(lRX, lRY + 4, lW, 8, 2);
    // Sock kit stripe
    g.fillStyle(jerseyColor, 0.65);
    g.fillRect(lLX, lLY + 5, lW, 2);
    g.fillRect(lRX, lRY + 5, lW, 2);

    // Calf (skin between shorts and socks)
    g.fillStyle(0xc8855e, 1);
    g.fillRoundedRect(lLX + 1, lLY, lW - 2, 6, 2);
    g.fillRoundedRect(lRX + 1, lRY, lW - 2, 6, 2);

    // ── Shorts ────────────────────────────────────────────────────
    g.fillStyle(shortsColor, 1);
    g.fillRoundedRect(cx - 19, 49, 38, 14, { tl:2, tr:2, bl:5, br:5 });
    // Shorts shadow (depth)
    g.fillStyle(0x000000, 0.16);
    g.fillRoundedRect(cx - 19, 58, 38, 5, { tl:0, tr:0, bl:5, br:5 });
    // Center seam
    g.lineStyle(1, 0x000000, 0.12);
    g.lineBetween(cx, 49, cx, 63);

    // ── Jersey body ───────────────────────────────────────────────
    // Dark outline
    g.fillStyle(jerseyDark, 1);
    g.fillRoundedRect(cx - 21, 19, 42, 34, 8);
    // Main jersey fill
    g.fillStyle(jerseyColor, 1);
    g.fillRoundedRect(cx - 19, 18, 40, 33, 7);
    // Chest highlight (light catches top)
    g.fillStyle(0xffffff, 0.13);
    g.fillRoundedRect(cx - 12, 19, 17, 12, { tl:6, tr:6, bl:0, br:0 });
    // Side panel stripes (darker vertical bars)
    g.fillStyle(jerseyDark, 0.55);
    g.fillRoundedRect(cx - 19, 21, 6, 28, 2);
    g.fillRoundedRect(cx + 13, 21, 6, 28, 2);
    // Bottom edge shadow
    g.fillStyle(0x000000, 0.14);
    g.fillRoundedRect(cx - 19, 46, 40, 5, { tl:0, tr:0, bl:6, br:6 });

    // ── Collar ────────────────────────────────────────────────────
    g.fillStyle(jerseyDark, 1); g.fillCircle(cx, 21, 7);
    g.fillStyle(jerseyColor, 1); g.fillCircle(cx, 21, 5);
    // V-neck detail
    g.fillStyle(jerseyDark, 0.55);
    g.fillTriangle(cx - 3, 21, cx + 3, 21, cx, 27);

    // ── Arms (sleeves + hands) ────────────────────────────────────
    // Sleeve
    g.fillStyle(jerseyDark, 0.85); g.fillCircle(cx - 26, 32, 10);
    g.fillStyle(jerseyColor, 1);   g.fillCircle(cx - 26, 31, 9);
    g.fillStyle(jerseyDark, 0.85); g.fillCircle(cx + 26, 32, 10);
    g.fillStyle(jerseyColor, 1);   g.fillCircle(cx + 26, 31, 9);
    // Hand/wrist (skin)
    g.fillStyle(0xc8855e, 1);
    g.fillCircle(cx - 26, 37, 6);
    g.fillCircle(cx + 26, 37, 6);
    // Knuckle highlight
    g.fillStyle(0xe8a878, 0.55);
    g.fillCircle(cx - 26, 36, 3);
    g.fillCircle(cx + 26, 36, 3);

    // ── Head ──────────────────────────────────────────────────────
    // Hair (dark circle, slightly larger than face)
    g.fillStyle(0x1a0e05, 1);
    g.fillCircle(cx, 11, 11);
    // Skin
    g.fillStyle(0xc8855e, 1);
    g.fillCircle(cx, 12, 10);
    // Face highlight (light source above)
    g.fillStyle(0xe8a878, 0.72);
    g.fillEllipse(cx - 2, 10, 9, 11);
    // Eyes
    g.fillStyle(0x1a0a00, 0.68);
    g.fillCircle(cx - 3.5, 11, 1.8);
    g.fillCircle(cx + 3.5, 11, 1.8);
    // Eye glints
    g.fillStyle(0xffffff, 0.8);
    g.fillCircle(cx - 4, 10.5, 0.9);
    g.fillCircle(cx + 3, 10.5, 0.9);
    // Nose hint
    g.fillStyle(0xa06040, 0.35);
    g.fillCircle(cx, 14, 1.5);

    // ── Direction dot (above head = forward marker) ───────────────
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(cx, 0, 3);
    g.fillStyle(0xffffff, 0.2);
    g.fillCircle(cx, 0, 6);

    g.generateTexture(key, S, S);
    g.destroy();
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  User player — 90×90, green jersey, gold aura ring
  // ─────────────────────────────────────────────────────────────────────────
  _makeUserPlayer(key, frame) {
    const S = 90, cx = S / 2;
    const g = this.make.graphics({ add: false });

    // Gold aura (layered)
    g.fillStyle(0xffd700, 0.03); g.fillCircle(cx, cx, 46);
    g.fillStyle(0xffd700, 0.07); g.fillCircle(cx, cx, 40);
    g.fillStyle(0xffd700, 0.12); g.fillCircle(cx, cx, 34);
    g.lineStyle(9, 0xffd700, 0.07);  g.strokeCircle(cx, cx, 44);
    g.lineStyle(3, 0xffd700, 0.35);  g.strokeCircle(cx, cx, 35);
    g.lineStyle(1.5, 0xffd700, 0.9); g.strokeCircle(cx, cx, 29);

    // Shadow
    g.fillStyle(0x000000, 0.3);
    g.fillEllipse(cx + 6, S - 7, 50, 12);

    // Legs
    const lLX = cx - 12, lRX = cx + 2;
    const lLY = frame === 0 ? 54 : 59;
    const lRY = frame === 0 ? 59 : 54;
    const lW = 12;

    g.fillStyle(0x0d0d0d, 1);
    g.fillRoundedRect(lLX - 1, lLY + 11, lW + 2, 9, 3);
    g.fillRoundedRect(lRX - 1, lRY + 11, lW + 2, 9, 3);
    g.fillStyle(0xe8e8e8, 1);
    g.fillRoundedRect(lLX, lLY + 5, lW, 8, 2);
    g.fillRoundedRect(lRX, lRY + 5, lW, 8, 2);
    g.fillStyle(0xffd700, 0.75);
    g.fillRect(lLX, lLY + 6, lW, 2);
    g.fillRect(lRX, lRY + 6, lW, 2);
    g.fillStyle(0xc8855e, 1);
    g.fillRoundedRect(lLX + 1, lLY, lW - 2, 7, 2);
    g.fillRoundedRect(lRX + 1, lRY, lW - 2, 7, 2);

    // Shorts (gold)
    g.fillStyle(0xffd700, 1);
    g.fillRoundedRect(cx - 21, 53, 42, 16, { tl:2, tr:2, bl:5, br:5 });
    g.fillStyle(0x000000, 0.15);
    g.fillRoundedRect(cx - 21, 64, 42, 5, { tl:0, tr:0, bl:5, br:5 });

    // Jersey (green, gold border)
    g.fillStyle(0xffd700, 1);
    g.fillRoundedRect(cx - 23, 19, 46, 37, 9); // gold border
    g.fillStyle(0x004820, 1);
    g.fillRoundedRect(cx - 21, 18, 44, 36, 8);
    g.fillStyle(0x00a050, 1);
    g.fillRoundedRect(cx - 19, 17, 42, 35, 7);
    // Chest highlight
    g.fillStyle(0xffffff, 0.13);
    g.fillRoundedRect(cx - 13, 18, 20, 14, { tl:6, tr:6, bl:0, br:0 });
    // Side stripes
    g.fillStyle(0x004820, 0.6);
    g.fillRoundedRect(cx - 19, 20, 6, 30, 2);
    g.fillRoundedRect(cx + 13, 20, 6, 30, 2);

    // Collar (gold)
    g.fillStyle(0xffd700, 1); g.fillCircle(cx, 21, 8);
    g.fillStyle(0x008040, 1); g.fillCircle(cx, 21, 5);
    g.fillStyle(0x004820, 0.6);
    g.fillTriangle(cx - 3, 21, cx + 3, 21, cx, 28);

    // Arms (green + gold wrists)
    g.fillStyle(0x004820, 0.9); g.fillCircle(cx - 28, 34, 11);
    g.fillStyle(0x00a050, 1);   g.fillCircle(cx - 28, 33, 10);
    g.fillStyle(0x004820, 0.9); g.fillCircle(cx + 28, 34, 11);
    g.fillStyle(0x00a050, 1);   g.fillCircle(cx + 28, 33, 10);
    g.fillStyle(0xffd700, 1);
    g.fillCircle(cx - 28, 39, 7);
    g.fillCircle(cx + 28, 39, 7);
    g.fillStyle(0xc8855e, 1);
    g.fillCircle(cx - 28, 39, 5.5);
    g.fillCircle(cx + 28, 39, 5.5);

    // Head
    g.fillStyle(0x1a0e05, 1); g.fillCircle(cx, 12, 12);
    g.fillStyle(0xc8855e, 1); g.fillCircle(cx, 13, 11);
    g.fillStyle(0xe8a878, 0.7); g.fillEllipse(cx - 2, 11, 10, 13);
    g.fillStyle(0x1a0a00, 0.7); g.fillCircle(cx - 4, 12, 2);
    g.fillStyle(0x1a0a00, 0.7); g.fillCircle(cx + 4, 12, 2);
    g.fillStyle(0xffffff, 0.8); g.fillCircle(cx - 4.5, 11.5, 1);
    g.fillStyle(0xffffff, 0.8); g.fillCircle(cx + 3.5, 11.5, 1);

    // Gold direction dot
    g.fillStyle(0xffd700, 1);  g.fillCircle(cx, 0, 4);
    g.fillStyle(0xffd700, 0.3); g.fillCircle(cx, 0, 8);

    g.generateTexture(key, S, S);
    g.destroy();
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Ball — realistic football with pentagon patches and speculars
  // ─────────────────────────────────────────────────────────────────────────
  _makeBall() {
    const S = 46, R = 17;
    const g = this.make.graphics({ add: false });

    // Shadow
    g.fillStyle(0x000000, 0.4);
    g.fillEllipse(S/2 + 5, S/2 + 11, R * 2.8, R * 0.68);

    // Ball body
    g.fillStyle(0xf8f8f8, 1);
    g.fillCircle(S/2, S/2, R);
    g.fillStyle(0xeeeee8, 1);
    g.fillCircle(S/2, S/2 + 1, R - 1);

    // Pentagon patches (5 outer + 1 center)
    g.fillStyle(0x0d0d0d, 1);
    [-90, -18, 54, 126, 198].forEach(deg => {
      const rad = deg * Math.PI / 180;
      const px = S/2 + Math.cos(rad) * R * 0.52;
      const py = S/2 + Math.sin(rad) * R * 0.52;
      const pts = [];
      for (let i = 0; i < 5; i++) {
        const a = (i * 72 - 90) * Math.PI / 180;
        pts.push({ x: px + Math.cos(a) * 5.2, y: py + Math.sin(a) * 5.2 });
      }
      g.fillPoints(pts, true);
    });
    const cPts = [];
    for (let i = 0; i < 5; i++) {
      const a = (i * 72 - 90) * Math.PI / 180;
      cPts.push({ x: S/2 + Math.cos(a) * 4.8, y: S/2 + Math.sin(a) * 4.8 });
    }
    g.fillPoints(cPts, true);

    // Seam
    g.lineStyle(0.8, 0x888888, 0.28);
    g.strokeCircle(S/2, S/2, R);

    // Speculars
    g.fillStyle(0xffffff, 1);   g.fillEllipse(S/2 - 7, S/2 - 7, 11, 8);
    g.fillStyle(0xffffff, 0.45); g.fillEllipse(S/2 - 5, S/2 - 5, 5, 4);

    g.generateTexture('ball', S, S);
    g.destroy();
  }

  _makeGlow(key, color) {
    const S = 96, g = this.make.graphics({ add: false });
    for (let r = S/2; r > 0; r -= 1.5) {
      g.fillStyle(color, (1 - r / (S/2)) * 0.13);
      g.fillCircle(S/2, S/2, r);
    }
    g.generateTexture(key, S, S);
    g.destroy();
  }

  _makeDot() {
    const g = this.make.graphics({ add: false });
    g.fillStyle(0xffffff, 1); g.fillCircle(6, 6, 6);
    g.generateTexture('dot', 12, 12);
    g.destroy();
  }
}
