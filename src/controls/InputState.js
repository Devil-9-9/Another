// One shared input object. Desktop and mobile controllers both write into it; Player reads from it.
export class InputState {
  constructor() {
    this.moveX = 0;       // strafe, right = +1
    this.moveZ = 0;       // forward = +1
    this.lookDX = 0;      // accumulated pixels / pseudo-pixels since last frame
    this.lookDY = 0;
    this.jump = false;
    this.sprint = false;
    this.crouch = false;
    this.fire = false;
    this.aim = false;
    this.pressed = new Set(); // one-shot events: reload, toggleBuild, place, breakBlock, swap, nextBlock, prevBlock, weapon0..7, slot0..7, toggleFly, toggleCamera, craft, vehicle, ignite, inventory
  }
  press(name) { this.pressed.add(name); }
  consume(name) { return this.pressed.delete(name); }
  consumeLook() { const r = [this.lookDX, this.lookDY]; this.lookDX = this.lookDY = 0; return r; }
  reset() {
    this.moveX = this.moveZ = 0; this.jump = this.sprint = this.crouch = this.fire = this.aim = false;
    this.lookDX = this.lookDY = 0; this.pressed.clear();
  }
}
