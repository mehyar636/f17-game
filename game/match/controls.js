import { EV } from './config.js';

/** Unifies keyboard + virtual touch controls into one per-frame snapshot. */
export class Controls {
  constructor(scene) {
    this.axisX = 0; this.axisY = 0;
    this.sprint = false;
    this.shootHeld = false; this.shootJustDown = false; this.shootJustUp = false; this.shootHoldTime = 0;
    this.passJust = false; this.switchJust = false; this.anyInput = false;
    this.keys = {};
    this.tAxisX = 0; this.tAxisY = 0;
    this.tBtn = { shoot: false, pass: false, sprint: false, switch: false };
    this.prevShoot = false; this.prevPass = false; this.prevSwitch = false;
    this.onTouch = (m) => {
      if (m.type === 'axis') { this.tAxisX = m.x; this.tAxisY = m.y; }
      else this.tBtn[m.name] = m.down;
    };
    const kb = scene.input.keyboard;
    if (kb) {
      this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,SHIFT,X,E,Q,TAB,C');
      kb.addCapture(['SPACE', 'TAB', 'UP', 'DOWN', 'LEFT', 'RIGHT']);
    }
    scene.game.events.on(EV.TOUCH, this.onTouch);
    scene.events.once('shutdown', () => scene.game.events.off(EV.TOUCH, this.onTouch));
  }

  update(dt) {
    const k = this.keys;
    const d = (n) => !!(k[n] && k[n].isDown);
    let x = (d('D') || d('RIGHT') ? 1 : 0) - (d('A') || d('LEFT') ? 1 : 0);
    let y = (d('S') || d('DOWN') ? 1 : 0) - (d('W') || d('UP') ? 1 : 0);
    if (x === 0 && y === 0) { x = this.tAxisX; y = this.tAxisY; }
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    this.axisX = x; this.axisY = y;

    this.sprint = d('SHIFT') || this.tBtn.sprint;
    const shoot = d('SPACE') || this.tBtn.shoot;
    const pass = d('X') || d('E') || d('C') || this.tBtn.pass;
    const sw = d('Q') || d('TAB') || this.tBtn.switch;

    this.shootJustDown = shoot && !this.prevShoot;
    this.shootJustUp = !shoot && this.prevShoot;
    this.shootHeld = shoot;
    this.shootHoldTime = shoot ? this.shootHoldTime + dt : (this.shootJustUp ? this.shootHoldTime : 0);
    if (this.shootJustDown) this.shootHoldTime = 0;
    this.passJust = pass && !this.prevPass;
    this.switchJust = sw && !this.prevSwitch;
    this.prevShoot = shoot; this.prevPass = pass; this.prevSwitch = sw;
    this.anyInput = m > 0 || shoot || pass || sw || this.sprint;
  }
}
