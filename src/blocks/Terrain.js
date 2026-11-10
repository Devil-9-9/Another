// Pure terrain generation (no rendering imports). Everything is a function of (seed, x, y, z): infinite in every direction.
//   y > MAX_SURFACE .. SKY_BASE   open air (build or tower up to reach the sky)
//   y >= SKY_BASE                 endless stack of sky-island realms, one every SKY_BAND blocks, each with its own seed
//   0-ish .. surface              overworld: continents, oceans, lakes, beaches, trees, villages
//   below the surface             caves everywhere; vast lava-lit caverns and crystals deeper down, forever
import { CHUNK, SEA, MAX_SURFACE, SKY_BASE, SKY_BAND } from '../core/Constants.js';
import { fbm, hash2, hash3, valueNoise3, makeGrid } from '../core/Noise.js';
import { B } from './BlockTypes.js';
import { Villages, V_FLAT, V_BLEND } from './Village.js';

const smooth01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const colKey = (x, z) => (x + 1048576) * 2097152 + (z + 1048576);
const mod = (n, m) => ((n % m) + m) % m;

export class Terrain {
  constructor(seed) {
    this.seed = seed;
    this.cols = new Map();
    this.villages = new Villages(seed, (x, z) => this.rawHeight(x, z));
  }

  /** Natural terrain height, ignoring villages. Below SEA means ocean/lake. */
  rawHeight(x, z) {
    const s = this.seed;
    const cont = fbm(x * 0.0045, z * 0.0045, s + 11, 3);          // continents vs ocean basins
    const n = fbm(x * 0.02, z * 0.02, s, 4);
    const ridge = fbm(x * 0.05 + 40, z * 0.05 - 17, s + 7, 2);
    let h = SEA + 4 + (cont - 0.5) * 60 + (n - 0.5) * 18 + ridge * 6;
    const lk = fbm(x * 0.025 - 90, z * 0.025 + 33, s + 23, 3);     // small-scale lake basins
    if (lk > 0.62) { const d = Math.min(1, (lk - 0.62) * 8); h = h * (1 - d) + (SEA - 4) * d; }
    return Math.max(-60, Math.min(MAX_SURFACE - 20, Math.floor(h)));
  }

  /** Final surface height (villages flatten the ground under them). */
  heightAt(x, z) {
    const key = colKey(x, z);
    let h = this.cols.get(key);
    if (h !== undefined) return h;
    h = this.rawHeight(x, z);
    for (const v of this.villages.near(x, z, V_FLAT + V_BLEND)) {
      const t = smooth01((Math.hypot(x - v.x, z - v.z) - V_FLAT) / V_BLEND);
      h = Math.round(v.baseH * (1 - t) + h * t);
    }
    if (this.cols.size > 80000) this.cols.clear();
    this.cols.set(key, h);
    return h;
  }

  /** Returns a Uint8Array(4096) or null when the whole chunk is air. */
  genChunk(cx, cy, cz) {
    const y0 = cy * CHUNK;
    if (y0 >= SKY_BASE) return this.genSky(cx, cy, cz);
    if (y0 > MAX_SURFACE) return null;

    const ox = cx * CHUNK, oz = cz * CHUNK, s = this.seed;
    const hs = new Int32Array(256);
    let maxH = -Infinity;
    for (let lz = 0; lz < CHUNK; lz++) for (let lx = 0; lx < CHUNK; lx++) {
      const h = this.heightAt(ox + lx, oz + lz);
      hs[lz * CHUNK + lx] = h; if (h > maxH) maxH = h;
    }
    const villages = this.villages.near(ox + 8, oz + 8, 60);
    let top = Math.max(SEA, maxH + 14);
    for (const v of villages) top = Math.max(top, v.baseH + 9);
    if (y0 > top) return null;

    const data = new Uint8Array(CHUNK * CHUNK * CHUNK);
    const caveG = makeGrid((x, y, z) => valueNoise3(x * 0.055, y * 0.075, z * 0.055, s + 31) * 0.65 + valueNoise3(x * 0.12, y * 0.14, z * 0.12, s + 32) * 0.35, ox, y0, oz);
    const bigG = y0 < -24 ? makeGrid((x, y, z) => valueNoise3(x * 0.012, y * 0.022, z * 0.012, s + 41), ox, y0, oz) : null;

    for (let lz = 0; lz < CHUNK; lz++) for (let lx = 0; lx < CHUNK; lx++) {
      const h = hs[lz * CHUNK + lx], wx = ox + lx, wz = oz + lz;
      const shore = h < SEA + 2;
      for (let ly = 0; ly < CHUNK; ly++) {
        const y = y0 + ly;
        let id = B.AIR;
        if (y <= h) {
          const depth = h - y;
          if (depth === 0) id = shore ? B.SAND : B.GRASS;
          else if (depth <= 3) id = shore ? B.SAND : B.DIRT;
          else id = this.rock(wx, y, wz);
          if (depth >= 6) {
            const thr = 0.64 - Math.min(0.06, Math.max(0, -y) / 2000);
            let carve = caveG(lx, ly, lz) > thr;
            if (!carve && bigG && bigG(lx, ly, lz) > 0.66) carve = true; // huge underworld caverns
            if (carve) id = (y < -30 && mod(y + 30, 128) < 5) ? B.LAVA : B.AIR;
            else if (y < 0 && hash3(wx, y, wz, s + 61) < 0.0035) id = B.CRYSTAL;
            else if (id === B.OBSIDIAN) { /* rock() chose obsidian: keep */ }
          }
        } else if (y <= SEA) id = B.WATER;
        data[(ly * CHUNK + lz) * CHUNK + lx] = id;
      }
    }

    const put = (x, y, z, id, onlyAir) => {
      const ly = y - y0, lx = x - ox, lz = z - oz;
      if (ly < 0 || ly >= CHUNK || lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK) return;
      const i = (ly * CHUNK + lz) * CHUNK + lx;
      if (onlyAir && data[i] !== B.AIR) return;
      data[i] = id;
    };

    // trees (kept away from the chunk's horizontal borders so a canopy is never cut in half)
    for (let lz = 3; lz < CHUNK - 3; lz++) for (let lx = 3; lx < CHUNK - 3; lx++) {
      const wx = ox + lx, wz = oz + lz, h = hs[lz * CHUNK + lx];
      if (h <= SEA + 2 || hash2(wx, wz, s + 99) >= 0.012) continue;
      if (this.villages.near(wx, wz, V_FLAT + V_BLEND + 6).length) continue;
      const th = 4 + Math.floor(hash2(wx, wz, s + 5) * 2);
      for (let t = 1; t <= th; t++) put(wx, h + t, wz, B.WOOD, false);
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = th - 1; dy <= th + 1; dy++) {
        if (Math.abs(dx) + Math.abs(dz) + (dy - th + 1) > 4) continue;
        put(wx + dx, h + dy + 1, wz + dz, B.LEAVES, true);
      }
    }

    for (const v of villages) this.villages.paint(v, (x, y, z, id) => put(x, y, z, id, false));
    return data;
  }

  /** Is this voxel inside a floating island? Each SKY_BAND-tall realm has its own seed, so the sky never ends. */
  /** Stone with ores. Same seed = same ore spots: coal is common and shallow, iron deeper, obsidian only deep down near the lava. */
  rock(x, y, z) {
    const s = this.seed;
    if (y < 60 && hash3(x, y, z, s + 83) < 0.013) return B.COAL_ORE;
    if (y < 38 && hash3(x, y, z, s + 97) < 0.007) return B.IRON_ORE;
    if (y < -25 && hash3(x, y, z, s + 109) < 0.006) return B.OBSIDIAN;
    return B.STONE;
  }

  skySolid(x, y, z) {
    const b = Math.floor((y - SKY_BASE) / SKY_BAND);
    const t = (y - SKY_BASE - b * SKY_BAND) / SKY_BAND;
    const p = 1 - Math.abs(t - 0.5) * 2;                  // 0 at the realm's top/bottom, 1 in the middle
    const sd = this.seed + 1000 + b * 977;
    const f = valueNoise3(x * 0.02, y * 0.045, z * 0.02, sd) * 0.7 + valueNoise3(x * 0.07, y * 0.1, z * 0.07, sd + 1) * 0.3;
    return f > 0.74 - 0.12 * p;
  }

  skyCloud(x, y, z) {
    const b = Math.floor((y - SKY_BASE) / SKY_BAND);
    const t = (y - SKY_BASE - b * SKY_BAND) / SKY_BAND;
    if (Math.abs(t - 0.5) * 2 < 0.55) return false;       // clouds hug the realm's top and bottom
    return valueNoise3(x * 0.025, y * 0.18, z * 0.025, this.seed + 1000 + b * 977 + 7) > 0.73;
  }

  genSky(cx, cy, cz) {
    const y0 = cy * CHUNK, ox = cx * CHUNK, oz = cz * CHUNK;
    const data = new Uint8Array(CHUNK * CHUNK * CHUNK);
    let any = false;
    for (let lz = 0; lz < CHUNK; lz++) for (let lx = 0; lx < CHUNK; lx++) for (let ly = 0; ly < CHUNK; ly++) {
      const x = ox + lx, y = y0 + ly, z = oz + lz;
      let id = B.AIR;
      if (this.skySolid(x, y, z)) {
        if (!this.skySolid(x, y + 1, z)) id = B.GRASS;
        else if (!this.skySolid(x, y + 2, z) || !this.skySolid(x, y + 3, z)) id = B.DIRT;
        else id = hash3(x, y, z, this.seed + 71) < 0.003 ? B.CRYSTAL : B.STONE;
      } else if (this.skyCloud(x, y, z)) id = B.CLOUD;
      if (id !== B.AIR) { data[(ly * CHUNK + lz) * CHUNK + lx] = id; any = true; }
    }
    return any ? data : null;
  }
}
