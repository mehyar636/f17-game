// F17 Pro — Global Save State (classic script: defines the global `GameState`)
const SAVE_KEY = 'f17pro_v1';

const F17_DEFAULTS = () => ({
  version: 1,
  playerName: 'F17',
  age: 16,
  season: 1,
  week: 1,
  rating: 62,
  stats: { speed: 65, shooting: 60, dribbling: 63, passing: 58, defending: 45, stamina: 70 },
  xp: 0,
  xpNextLevel: 100,
  coins: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  goals: 0,
  assists: 0,
  storyFlags: {},
  difficulty: 'rookie',
  career: null,      // league season, created by game/career/league.js
  training: {},      // best scores / stars per drill
  trophies: [],
});

const GameState = {
  data: F17_DEFAULTS(),
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p.version === 1) Object.assign(this.data, p);
      }
    } catch (e) {}
    // the main character is F17 (older saves used a different default name)
    if (!this.data.playerName || this.data.playerName === 'Faisal') this.data.playerName = 'F17';
    if (!this.data.training) this.data.training = {};
    if (!this.data.trophies) this.data.trophies = [];
  },
  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch (e) {}
  },
  reset() {
    this.data = F17_DEFAULTS();
    this.save();
  },
  addXP(amount) {
    this.data.xp += amount;
    while (this.data.xp >= this.data.xpNextLevel) {
      this.data.xp -= this.data.xpNextLevel;
      this.data.rating = Math.min(99, this.data.rating + 1);
      const keys = Object.keys(this.data.stats);
      const k = keys[Math.floor(Math.random() * keys.length)];
      this.data.stats[k] = Math.min(99, this.data.stats[k] + 1);
      this.data.xpNextLevel = Math.round(this.data.xpNextLevel * 1.18);
    }
    this.save();
  },
};

GameState.load();
