import { MAX_HP } from '../core/Constants.js';
import { itemInfo } from '../blocks/Items.js';
import { ITEM_NAMES } from '../survival/Survival.js';
import { drawBlockIcon } from '../blocks/TextureAtlas.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = {
      root: $('hud'), hp: $('hp-fill'), hpText: $('hp-text'), mode: $('mode-text'), kills: $('kill-count'), time: $('time-text'),
      ammoMag: $('ammo-mag'), ammoRes: $('ammo-res'), wname: $('weapon-name'), cross: $('crosshair'), hit: $('hitmarker'),
      flash: $('damage-flash'), portal: $('portal-overlay'), realm: $('realm-text'), water: $('water-overlay'), scope: $('scope-overlay'), feed: $('killfeed'), hotbar: $('hotbar'), toast: $('toast'), ammoBox: $('ammo'),
    };
    this.slots = [];
    this.toastT = null;
    this.mode = 'combat'; this.flags = { flying: false, vehicle: null, gm: '' };
    this.atlasCanvas = null;
  }

  show(v) { this.el.root.classList.toggle('hidden', !v); }

  buildHotbar(atlasCanvas, onPick, hotbar) {
    this.atlasCanvas = atlasCanvas;
    this.el.hotbar.innerHTML = '';
    this.slots = hotbar.map((item, i) => {
      const s = document.createElement('div'); s.className = 'slot';
      s.style.pointerEvents = 'auto';
      s.addEventListener('touchstart', (e) => { e.preventDefault(); onPick(i); }, { passive: false });
      s.addEventListener('click', () => onPick(i));
      this.el.hotbar.appendChild(s);
      this.paintSlot(s, item);
      return s;
    });
  }

  /** Draw an item into a slot element: block texture, or an emoji for buildings / vehicles / tools. */
  paintSlot(el, item, count = 0) {
    el.textContent = '';
    el.title = '';
    if (item == null) return;                                  // empty survival slot
    if (typeof item === 'number') { const c = document.createElement('canvas'); drawBlockIcon(c, this.atlasCanvas, item); el.appendChild(c); }
    else { const e = document.createElement('span'); e.className = 'emo'; e.textContent = itemInfo(item).icon || '?'; el.appendChild(e); }
    el.title = itemInfo(item).label;
    if (count > 0) { const c = document.createElement('b'); c.className = 'cnt'; c.textContent = count > 99 ? '99+' : count; el.appendChild(c); }
  }

  setSlotItem(i, item, count = 0) { if (this.slots[i]) this.paintSlot(this.slots[i], item, count); }

  /** Survival panel: hunger bar, coins, and the loose items (blocks live in the hotbar). */
  setSurvival(sv) {
    const box = document.getElementById('sv-hud');
    if (!box) return;
    box.classList.toggle('hidden', !sv);
    document.getElementById('sv-top')?.classList.toggle('hidden', !sv);
    if (!sv) return;
    document.getElementById('sv-coins').textContent = '\u{1FA99} ' + sv.coins;
    document.getElementById('sv-level').textContent = 'LV ' + sv.level;
    document.getElementById('sv-xp-fill').style.width = sv.xpIntoLevel + '%';
    document.getElementById('sv-xp-text').textContent = sv.xpIntoLevel + ' / 100 XP';
    document.getElementById('sv-hunger-fill').style.width = sv.hunger + '%';
    document.getElementById('sv-hunger-fill').classList.toggle('low', sv.hunger <= 25);
    const parts = Object.entries(sv.items).filter(([k]) => !/^b\d+$/.test(k)).map(([k, n]) => `${ITEM_NAMES[k] || k} ${n}`);
    document.getElementById('sv-items').textContent = parts.join(' · ');
  }
  setHunger(h) { const f = document.getElementById('sv-hunger-fill'); if (f) { f.style.width = h + '%'; f.classList.toggle('low', h <= 25); } }
  setBoss(name, frac) {
    const b = document.getElementById('boss-bar'); if (!b) return;
    b.classList.toggle('hidden', !name);
    if (name) { document.getElementById('boss-name').textContent = name; document.getElementById('boss-fill').style.width = Math.max(0, frac * 100) + '%'; }
  }
  setStatus(kind, on) { document.getElementById('fx-' + kind)?.classList.toggle('on', !!on); }

  selectSlot(i) { this.slots.forEach((s, k) => s.classList.toggle('sel', k === i)); }

  setHp(hp) {
    const p = Math.max(0, Math.min(1, hp / (this.maxHp || MAX_HP)));
    this.el.hp.style.width = (p * 100) + '%';
    this.el.hp.style.background = p > 0.5 ? '' : p > 0.25 ? 'linear-gradient(#f0c040,#c08a10)' : 'linear-gradient(#ff5a4a,#b01c10)';
    this.el.hpText.textContent = Math.ceil(hp);
  }

  setMaxHp(n) { this.maxHp = n; }

  setWeapon(w) { this.el.wname.textContent = w.name; this.setAmmo(w); this.el.scope.classList.add('hidden'); }

  setAmmo(w) {
    const melee = w.type === 'melee';
    if (melee !== this._melee) { this._melee = melee; this.el.ammoBox.parentElement.classList.toggle('melee', melee); }
    if (melee) return;
    this.el.ammoMag.textContent = w.reloading ? '--' : w.ammo;
    this.el.ammoMag.classList.toggle('low', w.ammo <= Math.ceil(w.mag * 0.25));
    this.el.ammoRes.textContent = w.reserve;
  }

  setMode(mode) {
    this.mode = mode; this.refreshMode();
    this.el.cross.classList.toggle('build', mode === 'build');
    this.el.hotbar.classList.toggle('dim', mode !== 'build');
  }

  /** Extra status next to the mode: FLYING, or the vehicle you are riding. */
  setFlags(f) { Object.assign(this.flags, f); this.refreshMode(); }
  refreshMode() {
    const base = this.mode === 'build' ? 'BUILD MODE' : 'COMBAT';
    const extra = this.flags.vehicle ? ' · ' + this.flags.vehicle : this.flags.flying ? ' · FLYING' : '';
    this.el.mode.textContent = (this.flags.gm ? this.flags.gm + ' · ' : '') + base + extra;
  }

  setPortal(kind, p) {
    const o = this.el.portal; if (!o) return;
    if (!kind) { if (this._pk) { this._pk = null; o.style.opacity = 0; } return; }
    if (this._pk !== kind) { this._pk = kind; o.className = kind; }
    o.style.opacity = String(0.25 + 0.75 * p);
  }

  setRealm(name, y) {
    const t = name + '  Y ' + Math.floor(y);
    if (t !== this._realm) { this._realm = t; this.el.realm.textContent = t; }
  }
  setUnderwater(on) { if (on !== this._uw) { this._uw = on; this.el.water.classList.toggle('show', on); } }

  setKills(n) { this.el.kills.textContent = n; }
  setTime(t) { this.el.time.textContent = t; }

  setAds(on, scoped) {
    this.el.cross.classList.toggle('ads', on);
    this.el.scope.classList.toggle('hidden', !(on && scoped));
  }

  hitmarker(kill) {
    const h = this.el.hit; h.classList.remove('show', 'kill'); void h.offsetWidth;
    h.classList.add('show'); if (kill) h.classList.add('kill');
    clearTimeout(this._ht); this._ht = setTimeout(() => h.classList.remove('show'), 90);
  }

  damageFlash() {
    const f = this.el.flash; f.classList.remove('show'); void f.offsetWidth; f.classList.add('show');
    setTimeout(() => f.classList.remove('show'), 60);
  }

  killfeed(text) {
    const d = document.createElement('div'); d.textContent = text; this.el.feed.prepend(d);
    setTimeout(() => d.remove(), 4000);
    while (this.el.feed.children.length > 5) this.el.feed.lastChild.remove();
  }

  toast(text, ms = 1800) {
    const t = this.el.toast; t.textContent = text; t.classList.add('show');
    clearTimeout(this.toastT); this.toastT = setTimeout(() => t.classList.remove('show'), ms);
  }
}
