// Everything that can sit in a hotbar slot: a block id (number) or a string item ('struct:hotel', 'veh:jeep', 'tool:lighter').
import { B, BLOCKS, HOTBAR, isPortal } from './BlockTypes.js';

export const STRUCTS = {
  hotel:        { label: 'HOTEL',            icon: '🏨', info: '22x13, 4 floors, rooms, stairs' },
  house:        { label: 'HOUSE',            icon: '🏠', info: 'Cosy house with a bed' },
  tower:        { label: 'TOWER',            icon: '🗼', info: '3-floor stone tower' },
  portal_under: { label: 'UNDERWORLD PORTAL', icon: '🌀', info: 'Obsidian frame, already lit' },
  portal_sky:   { label: 'SKY PORTAL',       icon: '☁️', info: 'Gold frame, already lit' },
};
export const VEHICLES = {
  jeep: { label: 'CAR',        icon: '🚙', info: 'Fast on land. SPRINT = nitro' },
  bike: { label: 'BIKE',       icon: '🚲', info: 'Light and quick on land' },
  boat: { label: 'BOAT',       icon: '🚤', info: 'Sails on water' },
  heli: { label: 'HELICOPTER', icon: '🚁', info: 'Fly anywhere. JUMP up, DUCK down' },
};
export const TOOLS = {
  lighter: { label: 'PORTAL LIGHTER', icon: '🔥', info: 'Aim at a finished portal frame and PLACE' },
};

export const BLOCK_IDS = Object.keys(BLOCKS).map(Number).filter((id) => id !== B.AIR && !isPortal(id));

export function isValidItem(it) {
  if (typeof it === 'number') return BLOCK_IDS.includes(it);
  if (typeof it !== 'string') return false;
  const [k, name] = it.split(':');
  return (k === 'struct' && !!STRUCTS[name]) || (k === 'veh' && !!VEHICLES[name]) || (k === 'tool' && !!TOOLS[name]);
}

export function itemInfo(it) {
  if (it == null) return { kind: 'empty', key: null, label: '' };
  if (typeof it === 'number') return { kind: 'block', key: it, label: (BLOCKS[it]?.name || 'Block').toUpperCase() };
  const [k, name] = String(it).split(':');
  const table = k === 'struct' ? STRUCTS : k === 'veh' ? VEHICLES : TOOLS;
  const d = table[name] || { label: '?', icon: '?' };
  return { kind: k === 'struct' ? 'struct' : k === 'veh' ? 'vehicle' : 'tool', key: name, label: d.label, icon: d.icon, info: d.info };
}

const KEY = 'blockops.hotbar.v1';
export function loadHotbar(storage) {
  const out = [...HOTBAR];
  try {
    const j = JSON.parse(storage?.getItem(KEY) || 'null');
    if (Array.isArray(j)) for (let i = 0; i < out.length; i++) if (isValidItem(j[i])) out[i] = j[i];
  } catch (_) { /* corrupt or blocked storage: defaults */ }
  return out;
}
export function saveHotbar(storage, hotbar) {
  try { storage?.setItem(KEY, JSON.stringify(hotbar)); } catch (_) { /* private mode */ }
}
