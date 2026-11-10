/**
 * Touch controls: left joystick = move, drag anywhere on the right = look, on-screen buttons for everything else.
 * Every touch is tracked by identifier so move + look + shoot work simultaneously (multi-touch).
 */
export function isTouchDevice() {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

export class MobileControls {
  constructor(input) {
    this.input = input;
    this.root = document.getElementById('mobile-controls');
    this.joy = document.getElementById('joystick');
    this.stick = document.getElementById('stick');
    this.joyId = null; this.lookId = null; this.lookLast = null;
    this.enabled = false;
    this.editing = false;
    this.getMode = () => 'combat';
    this.holdCrouch = () => false;      // true while flying / in a helicopter: DUCK is then a hold-to-descend button
    this.lastJump = 0;
    this.lookScale = 1.9;
    this.bindJoystick();
    this.bindLook();
    this.bindButtons();
  }

  setEditing(v) { this.editing = v; if (v) this.input.reset(); }

  setEnabled(v) {
    this.enabled = v;
    this.root.classList.toggle('hidden', !v);
    if (!v) this.input.reset();
  }

  bindJoystick() {
    const i = this.input, joy = this.joy;
    const move = (t) => {
      const r = joy.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2, max = r.width / 2;
      let dx = t.clientX - cx, dy = t.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > max) { dx = dx / d * max; dy = dy / d * max; }
      this.stick.style.transform = `translate(${dx}px, ${dy}px)`;
      i.moveX = dx / max; i.moveZ = -dy / max;
      i.sprint = d > max * 1.15 || this.sprintLatched; // push past the ring to sprint
    };
    joy.addEventListener('touchstart', (e) => { e.preventDefault(); if (this.editing) return; const t = e.changedTouches[0]; this.joyId = t.identifier; move(t); }, { passive: false });
    joy.addEventListener('touchmove', (e) => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === this.joyId) move(t); }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) if (t.identifier === this.joyId) {
        this.joyId = null; this.stick.style.transform = ''; i.moveX = i.moveZ = 0; i.sprint = this.sprintLatched;
      }
    };
    joy.addEventListener('touchend', end); joy.addEventListener('touchcancel', end);
  }

  bindLook() {
    const i = this.input;
    // listen on window so a look-drag can pass over buttons without breaking; skip touches that start on controls
    window.addEventListener('touchstart', (e) => {
      if (!this.enabled || this.editing) return;
      for (const t of e.changedTouches) {
        if (this.lookId !== null) break;
        if (t.target.closest?.('.mbtn, #joystick')) continue;
        if (t.clientX < window.innerWidth * 0.35) continue; // left third belongs to the joystick area
        this.lookId = t.identifier; this.lookLast = { x: t.clientX, y: t.clientY };
      }
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) if (t.identifier === this.lookId) {
        i.lookDX += (t.clientX - this.lookLast.x) * this.lookScale;
        i.lookDY += (t.clientY - this.lookLast.y) * this.lookScale;
        this.lookLast = { x: t.clientX, y: t.clientY };
      }
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    const end = (e) => { for (const t of e.changedTouches) if (t.identifier === this.lookId) this.lookId = null; };
    window.addEventListener('touchend', end); window.addEventListener('touchcancel', end);
  }

  bindButtons() {
    const i = this.input;
    const hold = (id, on, off) => {
      const el = document.getElementById(id);
      const down = (e) => { e.preventDefault(); if (this.editing) return; el.classList.add('on'); on(); };
      const up = (e) => { e.preventDefault(); el.classList.remove('on'); off?.(); };
      el.addEventListener('touchstart', down, { passive: false });
      el.addEventListener('touchend', up, { passive: false });
      el.addEventListener('touchcancel', up, { passive: false });
    };
    const tap = (id, name) => hold(id, () => i.press(name));
    this.sprintLatched = false;

    hold('btn-shoot', () => { i.fire = true; }, () => { i.fire = false; });
    hold('btn-jump', () => { const n = performance.now(); if (n - this.lastJump < 300) i.press('toggleFly'); this.lastJump = n; i.jump = true; }, () => { i.jump = false; });   // double-tap JUMP = fly
    hold('btn-crouch', () => { if (this.holdCrouch()) i.crouch = true; else i.crouch = !i.crouch; }, () => { if (this.holdCrouch()) i.crouch = false; });   // toggle on foot, hold to descend in the air
    hold('btn-scope', () => { i.aim = !i.aim; });                        // toggle ADS
    hold('btn-sprint', () => { this.sprintLatched = !this.sprintLatched; i.sprint = this.sprintLatched; });
    tap('btn-reload', 'reload');
    tap('btn-build', 'toggleBuild');
    tap('btn-place', 'place');
    tap('btn-weapon', 'swap');
    tap('btn-block', 'nextBlock');
    tap('btn-fly', 'toggleFly');
    tap('btn-cam', 'toggleCamera');
    tap('btn-bag', 'inventory');
    tap('btn-craft', 'craft');
    tap('btn-enter', 'vehicle');
  }
}
