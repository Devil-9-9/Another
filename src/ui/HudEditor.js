import { HudLayout } from './HudLayout.js';

const $ = (s) => document.querySelector(s);
const safeStorage = () => { try { return window.localStorage; } catch (_) { return null; } };

// Everything the player can move / resize / fade / hide. `fixed` items only scale (the crosshair must stay centred).
export const ITEMS = [
  { id: 'joystick', label: 'Move stick', sel: '#joystick', touch: true },
  { id: 'btn-shoot', label: 'SHOOT', sel: '#btn-shoot', touch: true },
  { id: 'btn-jump', label: 'JUMP', sel: '#btn-jump', touch: true },
  { id: 'btn-reload', label: 'RELOAD', sel: '#btn-reload', touch: true },
  { id: 'btn-scope', label: 'SCOPE', sel: '#btn-scope', touch: true },
  { id: 'btn-build', label: 'BUILD', sel: '#btn-build', touch: true },
  { id: 'btn-place', label: 'PLACE BLOCK', sel: '#btn-place', touch: true },
  { id: 'btn-crouch', label: 'DUCK / DIVE', sel: '#btn-crouch', touch: true },
  { id: 'btn-sprint', label: 'RUN', sel: '#btn-sprint', touch: true },
  { id: 'btn-weapon', label: 'SWAP GUN', sel: '#btn-weapon', touch: true },
  { id: 'btn-block', label: 'NEXT BLOCK', sel: '#btn-block', touch: true },
  { id: 'btn-fly', label: 'FLY', sel: '#btn-fly', touch: true },
  { id: 'btn-cam', label: 'CAMERA', sel: '#btn-cam', touch: true },
  { id: 'btn-bag', label: 'INVENTORY', sel: '#btn-bag', touch: true },
  { id: 'btn-craft', label: 'CRAFT', sel: '#btn-craft', touch: true },
  { id: 'btn-enter', label: 'ENTER / EXIT VEHICLE', sel: '#btn-enter', touch: true },
  { id: 'hp', label: 'Health bar', sel: '#top-left' },
  { id: 'stats', label: 'Kills / time / realm', sel: '#top-right' },
  { id: 'ammo', label: 'Ammo', sel: '#bottom-right' },
  { id: 'hotbar', label: 'Block bar', sel: '#hotbar' },
  { id: 'killfeed', label: 'Kill feed', sel: '#killfeed' },
  { id: 'pause', label: 'Pause button', sel: '#pause-btn' },
  { id: 'crosshair', label: 'Crosshair', sel: '#crosshair', fixed: true },
];

export class HudEditor {
  constructor({ touch, onExit }) {
    this.touch = touch; this.onExit = onExit;
    this.layout = new HudLayout(safeStorage());
    this.active = false; this.sel = null;
    this.els = new Map(); this.meta = new Map();
    for (const it of ITEMS) {
      const el = $(it.sel);
      if (!el) continue;
      el.classList.add('hud-item'); el.dataset.hudId = it.id;
      this.els.set(it.id, el); this.meta.set(it.id, it);
      this.bindDrag(it.id, el);
    }
    this.panel = $('#hud-editor');
    this.bindPanel();
    this.applyAll();
  }

  /* ---------- applying the saved layout to the page ---------- */
  apply(id) {
    const el = this.els.get(id), it = this.layout.get(id), m = this.meta.get(id);
    if (!el) return;
    if (!it) {                                           // untouched: back to the stylesheet defaults
      for (const p of ['left', 'top', 'right', 'bottom', 'transform']) el.style[p] = '';
      el.style.removeProperty('--hud-o'); el.classList.remove('hud-hidden', 'hud-ghost');
      return;
    }
    if (m.fixed) el.style.transform = `scale(${it.s})`;
    else if (it.x !== null) {
      Object.assign(el.style, { left: it.x + '%', top: it.y + '%', right: 'auto', bottom: 'auto', transform: `translate(-50%, -50%) scale(${it.s})`, transformOrigin: 'center' });
    }
    el.style.setProperty('--hud-o', it.o);
    el.classList.toggle('hud-hidden', it.hidden && !this.active);   // hidden while playing...
    el.classList.toggle('hud-ghost', it.hidden && this.active);     // ...but ghosted so you can bring it back while editing
  }
  /** Nudge an item so its whole box (including scale) stays inside the screen. */
  keepOnScreen(id) {
    const el = this.els.get(id), it = this.layout.get(id);
    if (!el || !it || it.x === null) return;
    const r = el.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
    if (!r.width || !r.height) return;
    const dx = r.left < 0 ? -r.left : r.right > vw ? vw - r.right : 0;
    const dy = r.top < 0 ? -r.top : r.bottom > vh ? vh - r.bottom : 0;
    if (dx || dy) { this.layout.set(id, { x: it.x + (dx / vw) * 100, y: it.y + (dy / vh) * 100 }); this.apply(id); }
  }

  applyAll() { for (const id of this.els.keys()) this.apply(id); }

  /** Turn "untouched CSS default" into an explicit % position so it can be dragged / scaled from where it is now. */
  materialize(id) {
    const el = this.els.get(id), m = this.meta.get(id);
    if (!el || m.fixed || this.layout.get(id)?.x != null) return;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return;
    this.layout.set(id, { x: ((r.left + r.width / 2) / window.innerWidth) * 100, y: ((r.top + r.height / 2) / window.innerHeight) * 100 });
  }

  /* ---------- editing ---------- */
  bindDrag(id, el) {
    el.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      e.preventDefault(); e.stopPropagation();
      this.select(id);
      this.materialize(id);
      const it = this.layout.get(id);
      if (!it || it.x === null) return;                   // crosshair: select only
      const sx = e.clientX, sy = e.clientY, ox = it.x, oy = it.y;
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      const move = (ev) => {
        this.layout.set(id, { x: ox + ((ev.clientX - sx) / window.innerWidth) * 100, y: oy + ((ev.clientY - sy) / window.innerHeight) * 100 });
        this.apply(id); this.keepOnScreen(id);
      };
      const up = () => {
        el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
        this.layout.save();
      };
      el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    });
  }

  select(id) {
    this.sel = id;
    for (const [k, el] of this.els) el.classList.toggle('selected', k === id);
    const it = this.layout.get(id), m = this.meta.get(id);
    $('#he-title').textContent = m ? m.label : 'Tap an item to select it, drag to move';
    $('#he-size').value = it?.s ?? 1; $('#he-opacity').value = it?.o ?? 1; $('#he-hide').checked = !!it?.hidden;
    for (const c of this.panel.querySelectorAll('[data-needs-sel]')) c.disabled = !m;
  }

  edit(patch) {
    if (!this.sel) return;
    this.materialize(this.sel);
    this.layout.set(this.sel, patch);
    this.apply(this.sel); this.keepOnScreen(this.sel); this.layout.save();
  }

  bindPanel() {
    $('#he-size').addEventListener('input', (e) => this.edit({ s: Number(e.target.value) }));
    $('#he-opacity').addEventListener('input', (e) => this.edit({ o: Number(e.target.value) }));
    $('#he-hide').addEventListener('change', (e) => this.edit({ hidden: e.target.checked }));
    $('#he-reset').addEventListener('click', () => { if (this.sel) { this.layout.reset(this.sel); this.apply(this.sel); this.layout.save(); this.select(this.sel); } });
    $('#he-resetall').addEventListener('click', () => { this.layout.resetAll(); this.layout.save(); this.applyAll(); if (this.sel) this.select(this.sel); });
    $('#he-mirror').addEventListener('click', () => {
      for (const id of this.els.keys()) this.materialize(id);   // so defaults mirror too
      this.layout.mirror(); this.applyAll(); for (const id of this.els.keys()) this.keepOnScreen(id); this.layout.save();
    });
    $('#he-flip').addEventListener('click', () => this.panel.classList.toggle('bottom'));
    $('#he-done').addEventListener('click', () => this.exit());
    // tapping empty space clears the selection
    $('#hud-edit-grid').addEventListener('pointerdown', () => this.select(null));
  }

  enter() {
    this.active = true;
    document.body.classList.add('hud-edit');
    document.exitPointerLock?.();
    this.panel.classList.remove('hidden');
    $('#hud-edit-grid').classList.remove('hidden');
    for (const [id, m] of this.meta) {                      // touch-only controls aren't shown on desktop
      if (m.touch && !this.touch) this.els.get(id).classList.add('hud-nontouch');
    }
    this.applyAll();
    this.select(null);
  }

  exit() {
    this.layout.save();
    this.active = false; this.sel = null;
    document.body.classList.remove('hud-edit');
    for (const el of this.els.values()) el.classList.remove('selected', 'hud-nontouch');
    this.panel.classList.add('hidden');
    $('#hud-edit-grid').classList.add('hidden');
    this.applyAll();
    this.onExit?.();
  }
}
