# Asset credits

- **Player model, textures, motion capture**: see `players/CREDITS.md` and `players/LICENSE.md`.
- **Interface sounds** (`sfx/*.wav`: click-crisp-primary, coin-collect, coin-double, success-subtle-ping,
  xp-up, achievement, level-up, error-soft-thud, success-celebrate, loading-complete-chord):
  SoundWeaver built-in sound library, MIT licence — see `sfx/LICENSE-SoundWeaver.txt`.
  These are pre-rendered (offline-generated) WAV files, not microphone recordings.
- **Other football sounds** (kick, net, post, bounce): synthesised at runtime in `game/match/sfx.js`.
- **Stadium audio** (`sfx/crowd_ambience.mp3`, `sfx/goal_roar.mp3`, `sfx/whistle_short.mp3`, `sfx/whistle_long.mp3`):
  AI-generated with CellCog (https://cellcog.ai) on 2026-11-19 for this project; no third-party recordings.
  The synthesised crowd, cheer and whistle in `game/match/sfx.js` remain as the fallback.
