// Permanent player ID: BO-XXXX-1234 (4 letters + 4 digits), generated once and kept in localStorage.
// The letters skip I and O so the ID is easy to read out loud and type on a phone.
const KEY = 'blockops.id.v1';
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const ID_PATTERN = /^BO-[A-Z]{4}-\d{4}$/;

function rnd(n) {
  const a = new Uint32Array(1);
  (globalThis.crypto || window.crypto).getRandomValues(a);
  return a[0] % n;
}

export function generateId() {
  let letters = '';
  for (let i = 0; i < 4; i++) letters += LETTERS[rnd(LETTERS.length)];
  return `BO-${letters}-${String(rnd(10000)).padStart(4, '0')}`;
}

export function normalizeId(s) { return (s || '').trim().toUpperCase().replace(/\s+/g, ''); }

export function getUniqueId(storage = globalThis.localStorage) {
  try {
    const saved = storage.getItem(KEY);
    if (saved && ID_PATTERN.test(saved)) return saved;
  } catch (_) { /* storage blocked: fall through to a session-only id */ }
  const id = generateId();
  try { storage.setItem(KEY, id); } catch (_) { /* private mode: id lasts for this session */ }
  return id;
}

/** Deterministic numeric seed from an ID, so a host's world is always the same world. */
export function seedFromId(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 1000000;
}

export async function copyToClipboard(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (_) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (_) { /* ignore */ }
    ta.remove(); return ok;
  }
}
