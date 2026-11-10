// Deterministic villages. A village is a pure function of (seed, grid cell) so every peer, and every chunk
// generated at any time, agrees on exactly where the houses are, with no global state needed.
import { hash2 } from '../core/Noise.js';
import { SEA } from '../core/Constants.js';
import { B } from './BlockTypes.js';

export const VCELL = 160;      // one village candidate per 160x160 area
export const V_FLAT = 22;      // ground is flattened inside this radius
export const V_BLEND = 8;      // ...and blended back into natural terrain over this many blocks
const DOOR_DIR = [[0, -1], [1, 0], [0, 1], [-1, 0]];

// local (lx,lz) in the 7x7 footprint -> world offset from the house origin, for rotation k (quarter turns)
function toWorld(k, lx, lz) {
  switch (k) {
    case 0: return [lx, lz];
    case 1: return [6 - lz, lx];
    case 2: return [6 - lx, 6 - lz];
    default: return [lz, 6 - lx];
  }
}
// inverse: world offset (dx,dz in 0..6) -> local
export function toLocal(k, dx, dz) {
  switch (k) {
    case 0: return [dx, dz];
    case 1: return [dz, 6 - dx];
    case 2: return [6 - dx, 6 - dz];
    default: return [6 - dz, dx];
  }
}

/** Block at local house coords. ly = height above the floor (0 = floor). Returns a block id, or null for "leave as is". */
export function houseBlock(lx, ly, lz) {
  if (ly === 0) return B.PLANKS;
  const edge = lx === 0 || lx === 6 || lz === 0 || lz === 6;
  const corner = (lx === 0 || lx === 6) && (lz === 0 || lz === 6);
  if (ly >= 1 && ly <= 3) {
    if (!edge) return B.AIR;                                   // clear the interior
    if (lz === 0 && lx === 3 && ly <= 2) return B.AIR;         // doorway (2 high)
    if (corner) return B.WOOD;
    if (ly === 2) {
      const along = (lz === 0 || lz === 6) ? lx : lz;
      if (along === 2 || along === 4) return B.GLASS;          // windows
    }
    return B.PLANKS;
  }
  if (ly === 4) return B.PLANKS;                               // flat ceiling, slight overhang is the wall edge
  if (ly === 5) return (lx >= 1 && lx <= 5 && lz >= 1 && lz <= 5) ? B.BRICK : null;
  if (ly === 6) return (lx >= 2 && lx <= 4 && lz >= 2 && lz <= 4) ? B.BRICK : null;
  if (ly === 7) return (lx === 3 && lz === 3) ? B.BRICK : null;
  return null;
}

export class Villages {
  constructor(seed, rawHeight) {
    this.seed = seed; this.rawHeight = rawHeight; this.cache = new Map();
  }

  inCell(cx, cz) {
    const k = cx + ',' + cz;
    if (this.cache.has(k)) return this.cache.get(k);
    let v = null;
    if (hash2(cx, cz, this.seed + 501) < 0.5) {
      const x = cx * VCELL + 40 + Math.floor(hash2(cx, cz, this.seed + 502) * (VCELL - 80));
      const z = cz * VCELL + 40 + Math.floor(hash2(cx, cz, this.seed + 503) * (VCELL - 80));
      const h = this.rawHeight(x, z);
      // must be well inland: sample a ring so we don't build on a coast or in a lake
      let dry = h >= SEA + 3;
      for (let a = 0; a < 8 && dry; a++) {
        const hh = this.rawHeight(x + Math.round(Math.cos(a * 0.785) * 24), z + Math.round(Math.sin(a * 0.785) * 24));
        if (hh < SEA + 1) dry = false;
      }
      if (dry) v = this.build(cx, cz, x, z, Math.min(h, SEA + 24));
    }
    this.cache.set(k, v);
    return v;
  }

  build(cx, cz, x, z, baseH) {
    const houses = [];
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2 + (hash2(cx, cz, this.seed + 510 + i) - 0.5) * 0.35;
      const r = 13 + (hash2(cx, cz, this.seed + 520 + i) - 0.5) * 4;
      const hx = Math.round(x + Math.cos(ang) * r), hz = Math.round(z + Math.sin(ang) * r);
      // choose the rotation whose door points most nearly at the village centre
      let best = 0, bestDot = -9;
      for (let k = 0; k < 4; k++) {
        const d = DOOR_DIR[k][0] * -Math.cos(ang) + DOOR_DIR[k][1] * -Math.sin(ang);
        if (d > bestDot) { bestDot = d; best = k; }
      }
      const ox = hx - 3, oz = hz - 3;
      const out = toWorld(best, 3, -1), inside = toWorld(best, 3, 3);
      houses.push({
        id: `${cx},${cz}#${i}`, ox, oz, rot: best,
        doorOut: { x: ox + out[0] + 0.5, z: oz + out[1] + 0.5 },
        inside: { x: ox + inside[0] + 0.5, z: oz + inside[1] + 0.5 },
      });
    }
    return { key: `${cx},${cz}`, x, z, baseH, houses };
  }

  /** All villages whose centre is within `radius` of (x,z). radius must be < VCELL. */
  near(x, z, radius) {
    const out = [];
    const cx0 = Math.floor(x / VCELL), cz0 = Math.floor(z / VCELL);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const v = this.inCell(cx0 + a, cz0 + b);
      if (v && Math.hypot(v.x - x, v.z - z) <= radius) out.push(v);
    }
    return out;
  }

  /** Emit every block of a village through put(x, y, z, id). */
  paint(v, put) {
    const base = v.baseH;
    // well
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const x = v.x + dx, z = v.z + dz;
      if (dx === 0 && dz === 0) { put(x, base, z, B.WATER); put(x, base + 1, z, B.AIR); continue; }
      put(x, base, z, B.STONE); put(x, base + 1, z, B.STONE);
      if (dx !== 0 && dz !== 0) { put(x, base + 2, z, B.WOOD); put(x, base + 3, z, B.WOOD); }
    }
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) put(v.x + dx, base + 4, v.z + dz, B.PLANKS);
    // stone paths from the well to every door
    for (const h of v.houses) {
      const len = Math.ceil(Math.hypot(h.doorOut.x - v.x, h.doorOut.z - v.z) * 2);
      for (let s = 2; s <= len; s++) {
        const t = s / len;
        const px = Math.floor(v.x + 0.5 + (h.doorOut.x - v.x - 0.5) * t), pz = Math.floor(v.z + 0.5 + (h.doorOut.z - v.z - 0.5) * t);
        put(px, base, pz, B.STONE); put(px + 1, base, pz, B.STONE);
      }
    }
    // houses
    for (const h of v.houses) {
      for (let dx = 0; dx < 7; dx++) for (let dz = 0; dz < 7; dz++) {
        const [lx, lz] = toLocal(h.rot, dx, dz);
        for (let ly = 0; ly <= 7; ly++) {
          const id = houseBlock(lx, ly, lz);
          if (id !== null) put(h.ox + dx, base + ly, h.oz + dz, id);
        }
        // a small table inside so the room reads as lived-in
        if (lx === 5 && lz === 5) put(h.ox + dx, base + 1, h.oz + dz, B.WOOD);
      }
    }
  }
}
