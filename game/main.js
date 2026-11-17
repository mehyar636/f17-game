// F17 Pro Academy — Phaser 3 Game Entry Point (ES module)
// state.js and BootScene are classic global scripts; everything else is an ES module.
import { MatchScene } from './match/match-scene.js';
import { UIScene } from './match/ui-scene.js';
import { TrainingScene } from './training/training-scene.js';
import { ShootDrill } from './training/shoot-drill.js';
import { DribbleDrill } from './training/dribble-drill.js';
import { PassDrill } from './training/pass-drill.js';
import { MenuScene } from './ui/menu-scene.js';
import { CareerScene } from './ui/career-scene.js';

const config = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  parent: 'game-container',
  backgroundColor: '#050810',
  transparent: true,          // the 3D match canvas (#view3d) shows through during matches
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 0 }, debug: false },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: { activePointers: 4 },
  render: { antialias: true, roundPixels: false },
  // ?timer=1 forces a setTimeout loop (for embedded previews that throttle rAF)
  fps: { target: 60, forceSetTimeOut: new URLSearchParams(location.search).has('timer') },
  scene: [BootScene, MenuScene, CareerScene, MatchScene, UIScene, TrainingScene, ShootDrill, DribbleDrill, PassDrill],
};

window.gameInstance = new Phaser.Game(config);
