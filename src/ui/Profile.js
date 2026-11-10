import { sanitizeLook, DEFAULT_LOOK } from '../player/Character.js';
import { ID_PATTERN, normalizeId } from '../multiplayer/UniqueID.js';

const KEY = 'blockops.profile.v1';

/** Player-visible name: letters, digits, space, _ . - only, max 12 chars. Used for our own name and for names received from friends. */
export function sanitizeName(s, fallback = 'PLAYER') {
  const n = String(s ?? '').replace(/[^\p{L}\p{N} _.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 12);
  return n || fallback;
}

/** `?join=BO-ABCD-1234` in the page address: tapping a friend's invite link joins their world. */
export function joinIdFromSearch(search) {
  try {
    const id = normalizeId(new URLSearchParams(search).get('join') || '');
    return ID_PATTERN.test(id) ? id : null;
  } catch (_) { return null; }
}

export function inviteLink(id, href) {
  const u = new URL(href); u.search = ''; u.hash = '';
  u.searchParams.set('join', id);
  return u.toString();
}

/** Saved on this device: your name and how your soldier looks. */
export class Profile {
  constructor(storage, id) {
    this.storage = storage;
    this.name = 'PLAYER' + String(id || '').slice(-4);
    this.look = { ...DEFAULT_LOOK };
    try {
      const raw = JSON.parse(storage?.getItem(KEY) || 'null');
      if (raw && typeof raw === 'object') { this.name = sanitizeName(raw.name, this.name); this.look = sanitizeLook(raw.look); }
    } catch (_) { /* storage blocked or corrupt: keep defaults */ }
  }
  setName(n) { this.name = sanitizeName(n, this.name); this.save(); }
  setLook(patch) { this.look = sanitizeLook({ ...this.look, ...patch }); this.save(); }
  save() { try { this.storage?.setItem(KEY, JSON.stringify({ name: this.name, look: this.look })); } catch (_) { /* ignore */ } }
  toJSON() { return { name: this.name, look: this.look }; }
}
