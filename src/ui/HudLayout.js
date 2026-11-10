// Pure data model for the customisable HUD (no DOM, so it is unit-testable in Node).
// Each item stores: x,y = centre position in % of the screen (null = untouched CSS default),
// s = scale, o = opacity, hidden = not shown while playing.
export const STORAGE_KEY = 'blockops.hud.v1';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

export function sanitize(it = {}) {
  const hasPos = typeof it.x === 'number' && isFinite(it.x) && typeof it.y === 'number' && isFinite(it.y);
  return {
    x: hasPos ? clamp(it.x, 2, 98) : null,
    y: hasPos ? clamp(it.y, 3, 97) : null,
    s: clamp(num(it.s, 1), 0.4, 2.6),
    o: clamp(num(it.o, 1), 0.15, 1),
    hidden: !!it.hidden,
  };
}

export class HudLayout {
  constructor(storage = null) {
    this.storage = storage;
    this.items = Object.create(null); // no prototype: a saved key like "__proto__" can't do anything odd
    this.load();
  }

  load() {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY);
      const j = raw ? JSON.parse(raw) : null;
      if (j && typeof j.items === 'object' && j.items) {
        for (const [id, it] of Object.entries(j.items)) if (/^[\w-]{1,40}$/.test(id) && id !== '__proto__') this.items[id] = sanitize(it);
      }
    } catch (_) { this.items = Object.create(null); } // corrupt or blocked storage: fall back to defaults
  }

  save() {
    try { this.storage?.setItem(STORAGE_KEY, JSON.stringify({ v: 1, items: this.items })); } catch (_) { /* private mode: layout lasts for this session */ }
  }

  get(id) { return this.items[id] || null; }
  set(id, patch) { this.items[id] = sanitize({ ...(this.items[id] || {}), ...patch }); return this.items[id]; }
  reset(id) { delete this.items[id]; }
  resetAll() { this.items = Object.create(null); }

  /** Left-handed mode: flip every positioned item across the vertical centre line. */
  mirror() {
    for (const it of Object.values(this.items)) if (it.x !== null) it.x = clamp(100 - it.x, 2, 98);
  }
}
