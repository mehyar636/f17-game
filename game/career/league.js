import { TIERS, teamById, teamsOf } from '../data/teams.js';

/** Round-robin (circle method) for six teams: 5 rounds × 3 matches, as [homeId, awayId]. */
function makeFixtures(ids) {
  const arr = [...ids], n = arr.length, rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const round = [];
    for (let i = 0; i < n / 2; i++) round.push([arr[i], arr[n - 1 - i]]);
    rounds.push(round);
    arr.splice(1, 0, arr.pop());
  }
  return rounds;
}

function newSeason(tier, season) {
  const teams = teamsOf(tier);
  return {
    tier, season, round: 0,
    table: teams.map(t => ({ id: t.id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 })),
    fixtures: makeFixtures(teams.map(t => t.id)),
    lastRound: null,
  };
}

/** Make sure the save has a career; returns it. Also keeps difficulty in sync with the tier. */
export function ensureCareer(gs) {
  const d = gs.data;
  if (!d.career || !d.career.fixtures || !d.career.table) d.career = newSeason(0, d.season || 1);
  d.difficulty = TIERS[d.career.tier].difficulty;
  return d.career;
}

export const ROUNDS = 5;
export function seasonOver(c) { return c.round >= ROUNDS; }

/** The user's next match: { opp (team), round } or null when the season is finished. */
export function nextFixture(c) {
  if (seasonOver(c)) return null;
  const m = c.fixtures[c.round].find(f => f.includes('f17'));
  const oppId = m[0] === 'f17' ? m[1] : m[0];
  return { opp: teamById(c.tier, oppId), round: c.round };
}

export function sortedTable(c) {
  return [...c.table].sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || (a.id === 'f17' ? -1 : b.id === 'f17' ? 1 : a.id.localeCompare(b.id)));
}
export function position(c, id = 'f17') { return sortedTable(c).findIndex(r => r.id === id) + 1; }

function apply(c, idA, ga, idB, gb) {
  const A = c.table.find(r => r.id === idA), B = c.table.find(r => r.id === idB);
  A.p++; B.p++; A.gf += ga; A.ga += gb; B.gf += gb; B.ga += ga;
  if (ga > gb) { A.w++; B.l++; A.pts += 3; } else if (ga < gb) { B.w++; A.l++; B.pts += 3; } else { A.d++; B.d++; A.pts++; B.pts++; }
}

function simGoals(sFor, sAgainst) {
  const lambda = Math.max(0.25, 1.2 + (sFor - sAgainst) * 2.2);
  let L = Math.exp(-lambda), k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L && k < 8);
  return k - 1;
}

/** Record the user's result for this round, simulate the other matches, advance the round. */
export function playRound(gs, goalsFor, goalsAgainst) {
  const c = ensureCareer(gs);
  if (seasonOver(c)) return null;
  const results = [];
  for (const [h, a] of c.fixtures[c.round]) {
    let gh, ga;
    if (h === 'f17') { gh = goalsFor; ga = goalsAgainst; }
    else if (a === 'f17') { gh = goalsAgainst; ga = goalsFor; }
    else { const H = teamById(c.tier, h), A = teamById(c.tier, a); gh = simGoals(H.strength + 0.04, A.strength); ga = simGoals(A.strength, H.strength + 0.04); }
    apply(c, h, gh, a, ga);
    results.push({ h, a, gh, ga });
  }
  c.lastRound = { round: c.round, results };
  c.round++;
  gs.save();
  return { position: position(c), points: c.table.find(r => r.id === 'f17').pts, results, seasonOver: seasonOver(c) };
}

/** Close a finished season: top 2 go up (or win the title in the top tier). Starts the next season. */
export function finishSeason(gs) {
  const c = ensureCareer(gs);
  const pos = position(c), top = c.tier === TIERS.length - 1;
  const promoted = pos <= 2 && !top, champion = top && pos === 1;
  const d = gs.data;
  d.trophies = d.trophies || [];
  if (pos === 1) d.trophies.push({ tier: c.tier, season: c.season });
  const bonus = pos === 1 ? 150 : pos === 2 ? 80 : pos === 3 ? 40 : 15;
  d.coins = (d.coins || 0) + bonus;
  d.season = (d.season || 1) + 1; d.week = 1;
  const summary = { pos, promoted, champion, bonus, from: c.tier, to: promoted ? c.tier + 1 : c.tier };
  d.career = newSeason(summary.to, d.season);
  d.difficulty = TIERS[d.career.tier].difficulty;
  gs.save();
  return summary;
}
