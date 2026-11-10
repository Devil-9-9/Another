// World seeds: 128-bit, IPv6 style: 8 groups of 4 hex digits (xxxx-xxxx-xxxx-xxxx-xxxx-xxxx-xxxx-xxxx = 32 hex digits = 128 bits).
// Pure module (no DOM needed) so it is unit-tested in Node.
//
// A new seed = 128 bits from the browser's crypto RNG, XOR-mixed with a 128-bit hash of the time, the device and the player id.
// The crypto bits alone make a clash between two newly created worlds practically impossible
// (8 billion worlds: collision chance is about 1 in 10^19); the time/device mix only adds more. Seeds are NOT secrets or locks:
// anyone who types a seed gets that same world.

function cryptoWords() {
  const out = new Uint32Array(4);
  const c = globalThis.crypto;
  if (c && c.getRandomValues) c.getRandomValues(out);
  else for (let i = 0; i < 4; i++) out[i] = (Math.random() * 4294967296) >>> 0;   // very old browser: weaker, still mixed with time/device below
  return out;
}

/** cyrb128: string -> four 32-bit words. */
function hash128(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067); h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213); h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067); h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213); h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

let counter = 0;
function deviceString(extra) {
  const n = globalThis.navigator || {}, s = globalThis.screen || {};
  let tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (_) { /* ignore */ }
  return [Date.now(), globalThis.performance?.now?.(), ++counter, n.userAgent, n.language, n.hardwareConcurrency, n.platform,
    s.width, s.height, s.colorDepth, new Date().getTimezoneOffset(), tz, extra, Math.random()].join('|');
}

const hex8 = (w) => (w >>> 0).toString(16).padStart(8, '0');
const format = (h32) => h32.match(/.{4}/g).join('-');

/** Lowercase, dash-formatted seed, or null if the text is not exactly 32 hex digits (dashes/spaces/case ignored). */
export function normalizeSeed(text) {
  if (typeof text !== 'string') return null;
  const h = text.toLowerCase().replace(/[\s-]/g, '');
  return /^[0-9a-f]{32}$/.test(h) ? format(h) : null;
}

/** New unique seed. `avoid` = seeds already known on this device (never returned, however unlikely a clash is). */
export function generateWorldSeed({ extra = '', avoid = [] } = {}) {
  const taken = new Set(avoid.map(normalizeSeed).filter(Boolean));
  for (let tries = 0; tries < 50; tries++) {
    const r = cryptoWords(), m = hash128(deviceString(extra));
    const seed = format([0, 1, 2, 3].map((i) => hex8(r[i] ^ m[i])).join(''));
    if (!taken.has(seed)) return seed;
  }
  throw new Error('could not generate a unique seed');
}

/** The terrain generator takes one 31-bit number; every one of the 128 bits feeds it, and the same text always gives the same number. */
export function numericSeed(seedText) {
  const s = normalizeSeed(seedText);
  if (!s) throw new Error('bad seed');
  const h = s.replace(/-/g, '');
  let a = 0x9e3779b9;
  for (let i = 0; i < 4; i++) {
    a ^= parseInt(h.slice(i * 8, i * 8 + 8), 16);
    a = Math.imul(a ^ (a >>> 16), 0x85ebca6b); a = Math.imul(a ^ (a >>> 13), 0xc2b2ae35); a ^= a >>> 16;
  }
  return (a >>> 0) & 0x7fffffff;
}
