// World saves in localStorage. One save per world seed AND mode, so Creative building never leaks into a Survival run.
// Pure module: the storage object is passed in (tests use a fake).
import { normalizeSeed } from './WorldSeed.js';

const P = 'blockops.save.v1.';
const LAST = 'blockops.lastworld.v1';
export const MODES = ['creative', 'survival'];
export const saveKey = (seed, mode) => P + normalizeSeed(seed) + '.' + mode;

/** Map("x,y,z" -> id) -> flat [x,y,z,id,...] (small and fast to JSON). */
export function packEdits(map) {
  const out = [];
  for (const [k, id] of map) { const [x, y, z] = k.split(',').map(Number); out.push(x, y, z, id); }
  return out;
}
export function unpackEdits(flat) {
  const out = [];
  if (!Array.isArray(flat)) return out;
  for (let i = 0; i + 3 < flat.length; i += 4) {
    const [x, y, z, id] = [flat[i], flat[i + 1], flat[i + 2], flat[i + 3]];
    if ([x, y, z, id].every(Number.isFinite) && id >= 0 && id < 256) out.push([x | 0, y | 0, z | 0, id | 0]);
  }
  return out;
}

export function writeSave(storage, seed, mode, data) {
  try {
    if (!storage) return { ok: false, error: 'storage blocked' };
    const key = saveKey(seed, mode);
    storage.setItem(key, JSON.stringify({ ...data, v: 1, seed: normalizeSeed(seed), mode, savedAt: Date.now() }));
    storage.setItem(LAST, JSON.stringify({ seed: normalizeSeed(seed), mode }));
    return { ok: true };
  } catch (e) { return { ok: false, error: /quota/i.test(String(e?.name) + e?.message) ? 'storage full' : 'storage error' }; }
}

export function readSave(storage, seed, mode) {
  try {
    const s = JSON.parse(storage?.getItem(saveKey(seed, mode)) || 'null');
    if (!s || s.v !== 1 || normalizeSeed(s.seed) !== normalizeSeed(seed) || s.mode !== mode) return null;
    return s;
  } catch (_) { return null; }
}

export function lastPlayed(storage) {
  try {
    const l = JSON.parse(storage?.getItem(LAST) || 'null');
    if (l && normalizeSeed(l.seed) && MODES.includes(l.mode) && readSave(storage, l.seed, l.mode)) return l;
  } catch (_) { /* corrupt */ }
  return null;
}

/** Every world seed that has a save on this device (so a new seed can never equal one of them). */
export function savedSeeds(storage) {
  const out = new Set();
  try { for (let i = 0; i < (storage?.length || 0); i++) { const k = storage.key(i); if (k && k.startsWith(P)) { const s = normalizeSeed(k.slice(P.length, P.length + 39)); if (s) out.add(s); } } } catch (_) { /* ignore */ }
  return [...out];
}
