// ─── World geometry (world pixels) ──────────────────────────────────────────
export const PITCH_W = 2000;
export const PITCH_H = 1300;
export const MARGIN = 260;
export const WORLD_W = PITCH_W + MARGIN * 2;
export const WORLD_H = PITCH_H + MARGIN * 2;
export const PX = MARGIN;
export const PY = MARGIN;
export const CX = MARGIN + PITCH_W / 2;
export const CY = MARGIN + PITCH_H / 2;

export const GOAL_W = 190;
export const GOAL_D = 64;
export const POST_R = 7;
export const BOX_W = 330, BOX_H = 760;
export const SIX_W = 115, SIX_H = 360;
export const CIRCLE_R = 180;
export const PEN_SPOT = 220;

// ─── Camera ─────────────────────────────────────────────────────────────────
export const VIEW_WIDTH_TARGET = 1050;
export const ZOOM_MIN = 0.65, ZOOM_MAX = 2.2;

// ─── Players ────────────────────────────────────────────────────────────────
export const PLAYER_SPEED = 185;
export const SPRINT_MULT = 1.32;
export const CONTROL_RADIUS = 26;
export const DRIBBLE_OFFSET = 20;
export const TACKLE_RATE = 2.0;

// ─── Ball ───────────────────────────────────────────────────────────────────
export const BALL_FRICTION = 0.58;
export const BALL_R = 11;
export const PASS_SPEED = 520;
export const SHOT_MIN = 640, SHOT_MAX = 1120;
export const SHOT_CHARGE_TIME = 0.8;

// ─── Match ──────────────────────────────────────────────────────────────────
export const HALF_REAL_SECONDS = 180;                       // 3 real minutes per half
export const CLOCK_SCALE = (45 * 60) / HALF_REAL_SECONDS;   // match-seconds per real second

// ─── Difficulty (from GameState.data.difficulty) ────────────────────────────
export const DIFFICULTY = {
  rookie: { aiSpeed: 0.84, aiAcc: 1.9, aiShoot: 0.7, tackle: 0.8, gkDive: 460 },
  pro:    { aiSpeed: 0.94, aiAcc: 1.45, aiShoot: 1.0, tackle: 1.0, gkDive: 540 },
  legend: { aiSpeed: 1.02, aiAcc: 1.1, aiShoot: 1.2, tackle: 1.3, gkDive: 620 },
};

export const OPPONENTS = ['RIVALS FC', 'CITY YOUTH', 'UNITED U17', 'HARBOUR SC', 'NORTH STARS', 'ROYAL ACADEMY', 'DESERT HAWKS', 'COASTAL FC'];

// ─── Kid-friendly rules per difficulty ──────────────────────────────────────
// walls: ball bounces off the boards (no throw-ins / corners)   aimAssist: 0..1 shot help
// shield: how hard it is to steal from the kid (lower = stickier)   control: extra first-touch radius
// autoRun: jog toward the ball when no input   teammateBias: AI mates prefer passing to the kid
export const KIDS = {
  rookie: { walls: true,  powerups: true,  aimAssist: 1.0, shield: 0.45, control: 10, autoRun: true,  halfSeconds: 105, teammateBias: 1.3, rubber: true,  hints: true,  superOnFull: true },
  pro:    { walls: true,  powerups: true,  aimAssist: 0.6, shield: 0.7,  control: 6,  autoRun: true,  halfSeconds: 150, teammateBias: 0.8, rubber: true,  hints: true,  superOnFull: true },
  legend: { walls: false, powerups: false, aimAssist: 0.2, shield: 0.95, control: 0,  autoRun: false, halfSeconds: 180, teammateBias: 0.3, rubber: false, hints: false, superOnFull: false },
};

// Match objectives (3 are picked per match)
export const OBJECTIVE_POOL = [
  { id: 'goal1',   text: 'Score a goal',          stat: 'goals',      target: 1,  coins: 20, tier: 'goal' },
  { id: 'goal2',   text: 'Score 2 goals',         stat: 'goals',      target: 2,  coins: 40, tier: 'goal' },
  { id: 'pass5',   text: 'Complete 5 passes',     stat: 'passes',     target: 5,  coins: 15, tier: 'skill' },
  { id: 'pass10',  text: 'Complete 10 passes',    stat: 'passes',     target: 10, coins: 30, tier: 'skill' },
  { id: 'tackle2', text: 'Win 2 tackles',         stat: 'tackles',    target: 2,  coins: 15, tier: 'skill' },
  { id: 'shots3',  text: '3 shots on target',     stat: 'shotsOn',    target: 3,  coins: 20, tier: 'skill' },
  { id: 'super1',  text: 'Score a SUPER SHOT',    stat: 'superGoals', target: 1,  coins: 30, tier: 'bonus' },
  { id: 'power2',  text: 'Grab 2 power-ups',      stat: 'powerups',   target: 2,  coins: 15, tier: 'bonus' },
  { id: 'win',     text: 'Win the match',         stat: 'win',        target: 1,  coins: 50, tier: 'bonus' },
];

export const POWERUPS = {
  speed: { label: 'SPEED BOOST', emoji: '⚡', color: 0xfacc15, duration: 6 },
  fire:  { label: 'FIRE SHOT',   emoji: '🔥', color: 0xf97316, duration: 0 },
  star:  { label: 'BONUS STARS', emoji: '⭐', color: 0xfde047, duration: 0 },
};

// ─── Teams ──────────────────────────────────────────────────────────────────
export const HOME = 0, AWAY = 1;
export const TEAM = [
  { name: 'F17',    short: 'F17', jersey: 0x15803d, jerseyLight: 0x22c55e, trim: 0xf1c40f, shorts: 0x0b3d1f, socks: 0xf1c40f, pattern: 'stripes' },
  { name: 'RIVALS', short: 'RVL', jersey: 0xb91c1c, jerseyLight: 0xef4444, trim: 0xffffff, shorts: 0xffffff, socks: 0xb91c1c, pattern: 'band' },
];
/** Set who is playing (team objects from data/teams.js). Kit textures regenerate on the next generateTextures(). */
export function setTeams(home, away) {
  [home, away].forEach((t, i) => { if (t) Object.assign(TEAM[i], t.kit, { name: t.name, short: t.short, id: t.id }); });
}

export const SKINS = [0xf1c6a0, 0xe0ac7e, 0xc68e62, 0xa86d48, 0x7e4b2c, 0x5a3220, 0xd9a380, 0xb57a52];
export const HAIRS = [0x1b1b1b, 0x3a2416, 0x6b4423, 0xc9a24a, 0x8a1c1c, 0x2d2d2d, 0x111111, 0x4a3b2a];

// 4-3-3, team attacking +x. x: -1 (own goal) → 1 (opp goal), y: -1..1
export const FORMATION = [
  { x: -0.93, y: 0,     role: 'GK'  },
  { x: -0.60, y: -0.62, role: 'DEF' },
  { x: -0.66, y: -0.22, role: 'DEF' },
  { x: -0.66, y: 0.22,  role: 'DEF' },
  { x: -0.60, y: 0.62,  role: 'DEF' },
  { x: -0.25, y: -0.48, role: 'MID' },
  { x: -0.32, y: 0,     role: 'MID' },
  { x: -0.25, y: 0.48,  role: 'MID' },
  { x: 0.12,  y: -0.62, role: 'FWD' },
  { x: 0.20,  y: 0,     role: 'FWD' },
  { x: 0.12,  y: 0.62,  role: 'FWD' },
];
export const SHIRT_NUMBERS = [1, 2, 5, 4, 3, 8, 6, 10, 7, 9, 11];

// ─── Typography (Google font loaded in index.html; falls back gracefully) ───
export const FONT = '"Barlow Condensed", "Arial Narrow", "Arial Black", Impact, sans-serif';
export const FONT_R = '"Barlow", Arial, sans-serif';

// ─── Events (Match ↔ UI) ────────────────────────────────────────────────────
export const EV = {
  SCORE: 'm:score', CLOCK: 'm:clock', STAMINA: 'm:stamina', POWER: 'm:power', POP: 'm:pop', GOAL: 'm:goal',
  RADAR: 'm:radar', CONTROLLED: 'm:controlled', FULLTIME: 'm:fulltime', RESTART: 'm:restart', MENU: 'm:menu', TOUCH: 'm:touch',
  INTRO: 'm:intro', OBJ: 'm:obj', STARS: 'm:stars', POWERUP: 'm:powerup', PRAISE: 'm:praise',
};
