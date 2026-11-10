import { BLOCK_IDS, STRUCTS, VEHICLES, TOOLS, itemInfo } from '../blocks/Items.js';
import { drawBlockIcon } from '../blocks/TextureAtlas.js';
import { ITEM_NAMES, isBlockKey, blockOf } from '../survival/Survival.js';
import { BLOCKS } from '../blocks/BlockTypes.js';

/**
 * Creative inventory: every block, ready-made buildings (hotel, house, tower, portals), vehicles and tools.
 * Tap a hotbar slot at the bottom, then tap an item to put it there. Saved on the device.
 */
export class Inventory {
  constructor({ game, root }) {
    this.game = game; this.root = root; this.tab = 'blocks'; this.slot = 0; this.isOpen = false;
    this.grid = root.querySelector('#inv-grid');
    this.bar = root.querySelector('#inv-hotbar');
    this.tabs = [...root.querySelectorAll('[data-tab]')];
    this.tabs.forEach((b) => b.addEventListener('click', () => { this.tab = b.dataset.tab; this.render(); }));
    this.onClose = null;
    root.querySelector('#inv-close').addEventListener('click', () => this.onClose?.());
    window.addEventListener('keydown', (e) => { if (this.isOpen && (e.code === 'Escape' || e.code === 'KeyI')) { e.preventDefault(); this.onClose?.(); } });
  }

  open() {
    this.isOpen = true; this.slot = this.game.build.slot; this.root.classList.remove('hidden');
    this.bag = !!this.game.sv;                                    // survival: a read-only bag of what you collected
    this.root.querySelector('.inv-tabs').style.display = this.bag ? 'none' : '';
    this.root.querySelector('.inv-foot').style.display = this.bag ? 'none' : '';
    this.root.querySelector('h2').textContent = this.bag ? 'BAG' : 'INVENTORY';
    this.render();
  }

  renderBag() {
    const sv = this.game.sv;
    this.grid.textContent = '';
    const entries = Object.entries(sv.items);
    if (!entries.length) { const e = document.createElement('p'); e.textContent = 'Empty. Punch a tree to get your first wood.'; e.style.color = '#8fa6ba'; this.grid.appendChild(e); }
    for (const [k, n] of entries) {
      const el = document.createElement('div'); el.className = 'inv-cell';
      if (isBlockKey(k)) { const c = document.createElement('canvas'); drawBlockIcon(c, this.game.atlas.canvas, blockOf(k)); el.appendChild(c); }
      else { const e = document.createElement('span'); e.className = 'emo'; e.textContent = '\u{1F392}'; el.appendChild(e); }
      const l = document.createElement('small'); l.textContent = (isBlockKey(k) ? BLOCKS[blockOf(k)]?.name : ITEM_NAMES[k] || k) + ' x' + n; el.appendChild(l);
      this.grid.appendChild(el);
    }
    const c = document.createElement('div'); c.className = 'inv-cell'; c.innerHTML = '<span class="emo">\u{1FA99}</span><small>COINS ' + sv.coins + '</small>'; this.grid.prepend(c);
  }
  close() { this.isOpen = false; this.root.classList.add('hidden'); }

  items() {
    if (this.tab === 'blocks') return BLOCK_IDS;
    const t = this.tab === 'builds' ? ['struct', STRUCTS] : this.tab === 'vehicles' ? ['veh', VEHICLES] : ['tool', TOOLS];
    return Object.keys(t[1]).map((k) => t[0] + ':' + k);
  }

  cell(item, onClick, extra = '') {
    const el = document.createElement('button'); el.className = 'inv-cell ' + extra;
    if (typeof item === 'number') { const c = document.createElement('canvas'); drawBlockIcon(c, this.game.atlas.canvas, item); el.appendChild(c); }
    else { const e = document.createElement('span'); e.className = 'emo'; e.textContent = itemInfo(item).icon; el.appendChild(e); }
    const l = document.createElement('small'); l.textContent = itemInfo(item).label; el.appendChild(l);
    const info = itemInfo(item).info; if (info) el.title = info;
    el.addEventListener('click', onClick);
    return el;
  }

  render() {
    if (this.bag) { this.renderBag(); return; }
    this.tabs.forEach((b) => b.classList.toggle('on', b.dataset.tab === this.tab));
    this.grid.textContent = '';
    for (const it of this.items()) {
      this.grid.appendChild(this.cell(it, () => {
        this.game.build.setSlot(this.slot, it);
        this.slot = (this.slot + 1) % this.game.hotbar.length;      // next tap fills the next slot
        this.render();
      }));
    }
    this.bar.textContent = '';
    this.game.hotbar.forEach((it, i) => this.bar.appendChild(this.cell(it, () => { this.slot = i; this.game.build.select(i); this.render(); }, i === this.slot ? 'sel' : '')));
  }
}
