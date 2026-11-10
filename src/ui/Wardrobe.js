import { LOOK_OPTIONS } from '../player/Character.js';

const ROWS = [
  { key: 'model', label: 'CHARACTER', type: 'text' },
  { key: 'skin', label: 'SKIN', type: 'color' },
  { key: 'hair', label: 'HAIR STYLE', type: 'text' },
  { key: 'hairColor', label: 'HAIR COLOUR', type: 'color' },
  { key: 'mask', label: 'FACE', type: 'text' },
  { key: 'hoodie', label: 'HOODIE', type: 'color' },
  { key: 'pants', label: 'PANTS', type: 'color' },
  { key: 'outfit', label: 'JACKET', type: 'text' },
];
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

/** Builds the option rows inside `container`. `onChange(patch)` fires with e.g. { hoodie: 3 }. Returns refresh(look) to re-highlight. */
export function buildWardrobe(container, look, onChange) {
  container.textContent = '';
  const groups = new Map();
  for (const r of ROWS) {
    const row = document.createElement('div'); row.className = 'wd-row';
    const lab = document.createElement('label'); lab.textContent = r.label;
    const opts = document.createElement('div'); opts.className = 'wd-opts';
    LOOK_OPTIONS[r.key].forEach((v, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'wd-opt' + (r.type === 'text' ? ' txt' : '');
      if (r.type === 'color') { b.style.background = hex(v); b.setAttribute('aria-label', r.label + ' ' + (i + 1)); } else b.textContent = String(v).toUpperCase();
      b.dataset.val = r.type === 'color' ? String(i) : String(v);
      b.addEventListener('click', () => onChange({ [r.key]: r.type === 'color' ? i : v }));
      opts.appendChild(b);
    });
    if (r.key !== 'model') row.dataset.blocky = '1';          // these only change the blocky character
    row.append(lab, opts); container.appendChild(row); groups.set(r.key, opts);
  }
  const refresh = (l) => {
    for (const r of ROWS) for (const b of groups.get(r.key).children) b.classList.toggle('on', b.dataset.val === String(l[r.key]));
    for (const row of container.querySelectorAll('[data-blocky]')) row.hidden = l.model !== 'blocky';
  };
  refresh(look);
  return refresh;
}
