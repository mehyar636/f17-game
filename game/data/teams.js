// Teams, kits and squads. All clubs and players are fictional.

const kit = (jersey, jerseyLight, trim, shorts, socks, pattern) => ({ jersey, jerseyLight, trim, shorts, socks, pattern });

export const F17_KIT = kit(0x15803d, 0x22c55e, 0xf1c40f, 0x0b3d1f, 0xf1c40f, 'stripes');
/** F17 squad by formation slot (GK, 4 DEF, 3 MID, 3 FWD). Slot 9 = the hero. */
export const F17_SQUAD = ['SAMI', 'OMAR', 'LEO', 'KAI', 'ZAID', 'NOAH', 'RAYAN', 'MILO', 'ADAM', 'F17', 'YUSUF'];
export const F17_NUMBERS = [1, 2, 5, 4, 3, 8, 6, 10, 7, 17, 11];
export const HERO_SLOT = 9;

const T = (id, name, short, k, strength) => ({ id, name, short, kit: k, strength });

export const TIERS = [
  {
    id: 'academy', name: 'ACADEMY LEAGUE', short: 'ACADEMY', difficulty: 'rookie', mood: 'day', f17: 'F17 ACADEMY',
    blurb: 'Learn the game. Finish top 2 to move up.',
    teams: [
      T('riverside', 'RIVERSIDE JUNIORS', 'RIV', kit(0x1d4ed8, 0x60a5fa, 0xffffff, 0xffffff, 0x1d4ed8, 'plain'), 0.25),
      T('oakfield', 'OAKFIELD COLTS', 'OAK', kit(0xea580c, 0xfb923c, 0x111827, 0x111827, 0xea580c, 'band'), 0.3),
      T('harbour', 'HARBOUR KIDS', 'HAR', kit(0x0e7490, 0x22d3ee, 0xffffff, 0x083344, 0xffffff, 'hoops'), 0.35),
      T('sunnyvale', 'SUNNYVALE STARS', 'SUN', kit(0xeab308, 0xfde047, 0x7c2d12, 0x7c2d12, 0xeab308, 'sash'), 0.4),
      T('northgate', 'NORTHGATE LIONS', 'NOR', kit(0x7e22ce, 0xc084fc, 0xfde047, 0x3b0764, 0x7e22ce, 'stripes'), 0.45),
    ],
  },
  {
    id: 'u17', name: 'U17 LEAGUE', short: 'U17', difficulty: 'rookie', mood: 'night', f17: 'F17 U17',
    blurb: 'Faster rivals under the lights.',
    teams: [
      T('cityyouth', 'CITY YOUTH', 'CTY', kit(0x38bdf8, 0xbae6fd, 0x0c4a6e, 0xffffff, 0x38bdf8, 'plain'), 0.45),
      T('unitedu17', 'UNITED U17', 'UTD', kit(0xb91c1c, 0xef4444, 0xffffff, 0xffffff, 0x111827, 'plain'), 0.5),
      T('royalacad', 'ROYAL ACADEMY', 'ROY', kit(0xf8fafc, 0xffffff, 0x1e3a8a, 0xf8fafc, 0xf8fafc, 'sash'), 0.55),
      T('deserthawks', 'DESERT HAWKS', 'HWK', kit(0xb45309, 0xf59e0b, 0x1c1917, 0x1c1917, 0xb45309, 'hoops'), 0.6),
      T('coastal', 'COASTAL FC', 'CST', kit(0x0f766e, 0x2dd4bf, 0xfef3c7, 0x134e4a, 0xfef3c7, 'band'), 0.62),
    ],
  },
  {
    id: 'u21', name: 'U21 LEAGUE', short: 'U21', difficulty: 'pro', mood: 'night', f17: 'F17 U21',
    blurb: 'Stronger, smarter teams. Earn your debut.',
    teams: [
      T('capital', 'CAPITAL ROVERS', 'CAP', kit(0x1e3a8a, 0x3b82f6, 0xdc2626, 0x1e3a8a, 0xdc2626, 'stripes'), 0.6),
      T('ironforge', 'IRON FORGE', 'IRN', kit(0x374151, 0x9ca3af, 0xf97316, 0x111827, 0xf97316, 'band'), 0.66),
      T('blueharbor', 'BLUE HARBOR', 'BLU', kit(0x0369a1, 0x38bdf8, 0xfde047, 0x0c4a6e, 0xfde047, 'hoops'), 0.7),
      T('eagles', 'MOUNTAIN EAGLES', 'EAG', kit(0x9f1239, 0xfb7185, 0xfef9c3, 0x4c0519, 0xfef9c3, 'sash'), 0.74),
      T('comets', 'RED COMETS', 'COM', kit(0xdc2626, 0xf87171, 0x111827, 0x111827, 0xdc2626, 'stripes'), 0.78),
    ],
  },
  {
    id: 'pro', name: 'PRO LEAGUE', short: 'PRO', difficulty: 'legend', mood: 'night', f17: 'F17 FC',
    blurb: 'The top. Win it to become champion.',
    teams: [
      T('titans', 'TITANS FC', 'TIT', kit(0x111827, 0x4b5563, 0xfacc15, 0x111827, 0xfacc15, 'plain'), 0.78),
      T('royalcrown', 'ROYAL CROWN', 'CRN', kit(0x6d28d9, 0xa78bfa, 0xfacc15, 0xf8fafc, 0x6d28d9, 'sash'), 0.82),
      T('stormcity', 'STORM CITY', 'STM', kit(0x0ea5e9, 0x7dd3fc, 0x0f172a, 0x0f172a, 0x0ea5e9, 'hoops'), 0.86),
      T('falcons', 'GOLDEN FALCONS', 'FAL', kit(0xca8a04, 0xfde047, 0x1c1917, 0x1c1917, 0xca8a04, 'band'), 0.9),
      T('panthers', 'BLACK PANTHERS', 'PAN', kit(0x18181b, 0x52525b, 0xe11d48, 0x18181b, 0xe11d48, 'stripes'), 0.95),
    ],
  },
];

/** All six teams of a tier; F17 is always first. */
export function teamsOf(tier) {
  const t = TIERS[Phaser.Math.Clamp(tier, 0, TIERS.length - 1)];
  return [{ id: 'f17', name: t.f17, short: 'F17', kit: F17_KIT, strength: 0.5 }, ...t.teams];
}

export function teamById(tier, id) { return teamsOf(tier).find(t => t.id === id); }

const FIRST = ['ALEX', 'BEN', 'CARLO', 'DANI', 'EMRE', 'FINN', 'GABE', 'HUGO', 'IVAN', 'JAY', 'KARIM', 'LUCA', 'MATEO', 'NICO', 'OSCAR', 'PABLO', 'QUINN', 'RAFA', 'SETH', 'TARIQ', 'UMAR', 'VIK', 'WES', 'XAVI', 'YAN', 'ZEKE', 'THEO', 'JONAS', 'ELIAS', 'MARCO', 'DIEGO', 'ENZO', 'HAMZA', 'IDRIS', 'JUDE', 'KENJI'];

/** Deterministic 11-name squad for a rival club. */
export function squadNames(team) {
  if (team.id === 'f17') return F17_SQUAD;
  let h = 0;
  for (const c of team.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const out = [];
  for (let i = 0; i < 11; i++) {
    let n = FIRST[(h + i * 7) % FIRST.length];
    while (out.includes(n)) { h++; n = FIRST[(h + i * 7) % FIRST.length]; }
    out.push(n);
  }
  return out;
}
