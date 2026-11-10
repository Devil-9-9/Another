// Pure voxel world data (no rendering imports, so it runs in Node for tests).
// Chunks are 16^3 cubes keyed "cx,cy,cz". There is NO world height or depth limit: any integer y is valid.
//   chunks.get(key) === undefined  -> not loaded      null -> loaded, entirely air      Uint8Array -> blocks
import { CHUNK, SEA } from '../core/Constants.js';
import { Terrain } from './Terrain.js';
import { B, BLOCKS, isSolid, isFluid } from './BlockTypes.js';
import { V_FLAT, V_BLEND } from './Village.js';

const ck = (cx, cy, cz) => cx + ',' + cy + ',' + cz;
const VOL = CHUNK * CHUNK * CHUNK;
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

export class World {
  constructor(seed = 1337) {
    this.seed = seed;
    this.terrain = new Terrain(seed);
    this.villages = this.terrain.villages;
    this.chunks = new Map();
    this.dirty = new Set();       // chunk keys needing a re-mesh
    this.edits = new Map();       // "x,y,z" -> id, everything players changed (sent to late joiners)
    this.editsByChunk = new Map();// chunk key -> Map(localIndex -> id), re-applied if a chunk is regenerated
    this.damage = new Map();      // "x,y,z" -> damage taken so far
    this._lx = NaN; this._ly = NaN; this._lz = NaN; this._lc = undefined; // last-chunk lookup cache
  }

  heightAt(x, z) { return this.terrain.heightAt(Math.floor(x), Math.floor(z)); }
  index(lx, ly, lz) { return (ly * CHUNK + lz) * CHUNK + lx; }

  /* ---------- chunk storage ---------- */
  getChunk(cx, cy, cz) {
    if (cx === this._lx && cy === this._ly && cz === this._lz) return this._lc;
    const c = this.chunks.get(ck(cx, cy, cz));
    this._lx = cx; this._ly = cy; this._lz = cz; this._lc = c;
    return c;
  }

  generateChunk(cx, cy, cz) {
    const key = ck(cx, cy, cz);
    let data = this.terrain.genChunk(cx, cy, cz);
    const e = this.editsByChunk.get(key);
    if (e) {
      if (!data) data = new Uint8Array(VOL);
      for (const [i, id] of e) data[i] = id;
    }
    this.chunks.set(key, data);
    this._lx = NaN;
    return data;
  }

  ensureChunk(cx, cy, cz) {
    const c = this.chunks.get(ck(cx, cy, cz));
    return c === undefined ? this.generateChunk(cx, cy, cz) : c;
  }
  hasChunk(cx, cy, cz) { return this.chunks.has(ck(cx, cy, cz)); }
  isLoaded(x, y, z) { return this.chunks.has(ck(Math.floor(x) >> 4, Math.floor(y) >> 4, Math.floor(z) >> 4)); }
  unloadChunk(key) { this.chunks.delete(key); this._lx = NaN; }

  /* ---------- block access ---------- */
  getBlock(x, y, z) {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    const c = this.getChunk(x >> 4, y >> 4, z >> 4);
    if (!c) return B.AIR;
    return c[((y & 15) * CHUNK + (z & 15)) * CHUNK + (x & 15)];
  }

  fluidAt(x, y, z) { const id = this.getBlock(x, y, z); return isFluid(id) ? id : 0; }

  setBlock(x, y, z, id, record = true) {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    const cx = x >> 4, cy = y >> 4, cz = z >> 4;
    const key = ck(cx, cy, cz);
    const lx = x & 15, ly = y & 15, lz = z & 15, i = this.index(lx, ly, lz);
    let c = this.chunks.get(key);
    if (c !== undefined && c !== null && c[i] === id) return false;
    if (c === null && id === B.AIR) return false;
    if (record) {
      this.edits.set(x + ',' + y + ',' + z, id);
      let m = this.editsByChunk.get(key);
      if (!m) { m = new Map(); this.editsByChunk.set(key, m); }
      m.set(i, id);
    }
    if (c === undefined) return true;           // far away: remembered, applied when the chunk generates
    if (c === null) { c = new Uint8Array(VOL); this.chunks.set(key, c); this._lx = NaN; }
    c[i] = id;
    this.damage.delete(x + ',' + y + ',' + z);
    this.dirty.add(key);
    if (lx === 0) this.dirty.add(ck(cx - 1, cy, cz));
    if (lx === CHUNK - 1) this.dirty.add(ck(cx + 1, cy, cz));
    if (ly === 0) this.dirty.add(ck(cx, cy - 1, cz));
    if (ly === CHUNK - 1) this.dirty.add(ck(cx, cy + 1, cz));
    if (lz === 0) this.dirty.add(ck(cx, cy, cz - 1));
    if (lz === CHUNK - 1) this.dirty.add(ck(cx, cy, cz + 1));
    return true;
  }

  /** Apply damage. Returns 'broken', 'damaged' or null (unbreakable / empty / fluid). */
  damageBlock(x, y, z, amount) {
    const id = this.getBlock(x, y, z);
    if (id === B.AIR) return null;
    const hp = BLOCKS[id].hp;
    if (!isFinite(hp)) return null;
    const k = Math.floor(x) + ',' + Math.floor(y) + ',' + Math.floor(z);
    const taken = (this.damage.get(k) || 0) + amount;
    if (taken >= hp) { this.setBlock(x, y, z, B.AIR); return 'broken'; }
    this.damage.set(k, taken);
    return 'damaged';
  }

  /* ---------- queries ---------- */
  /** Is the AABB intersecting any solid block? (fluids are not solid) */
  boxSolid(minx, miny, minz, maxx, maxy, maxz) {
    for (let x = Math.floor(minx); x <= Math.floor(maxx - 1e-6); x++)
      for (let y = Math.floor(miny); y <= Math.floor(maxy - 1e-6); y++)
        for (let z = Math.floor(minz); z <= Math.floor(maxz - 1e-6); z++)
          if (isSolid(this.getBlock(x, y, z))) return true;
    return false;
  }

  /** Voxel DDA ray through solid blocks (water/lava are skipped). Returns { x,y,z, nx,ny,nz, id, dist } or null. */
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len; dy /= len; dz /= len;
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const sx = Math.sign(dx), sy = Math.sign(dy), sz = Math.sign(dz);
    const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    const tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tx = dx !== 0 ? (sx > 0 ? x + 1 - ox : ox - x) * tdx : Infinity;
    let ty = dy !== 0 ? (sy > 0 ? y + 1 - oy : oy - y) * tdy : Infinity;
    let tz = dz !== 0 ? (sz > 0 ? z + 1 - oz : oz - z) * tdz : Infinity;
    let nx = 0, ny = 0, nz = 0, t = 0;
    for (let i = 0; i < 600; i++) {
      const id = this.getBlock(x, y, z);
      if (isSolid(id)) return { x, y, z, nx, ny, nz, id, dist: t };
      if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; nx = -sx; ny = 0; nz = 0; }
      else if (ty < tz) { y += sy; t = ty; ty += tdy; nx = 0; ny = -sy; nz = 0; }
      else { z += sz; t = tz; tz += tdz; nx = 0; ny = 0; nz = -sz; }
      if (t > maxDist) return null;
    }
    return null;
  }

  /**
   * After a block at (x,y,z) was removed, find solid groups that lost their anchor to the ground.
   * A group is "grounded" if any block is at/below terrain height + 1 (so everything underground is anchored),
   * or the group is huge (> limit; floating islands are far bigger than that).
   */
  findFloating(x, y, z, limit = 300) {
    const groups = [];
    const seen = new Set();
    for (const [ax, ay, az] of DIRS) {
      const sx = x + ax, sy = y + ay, sz = z + az;
      const sk = sx + ',' + sy + ',' + sz;
      if (seen.has(sk) || !isSolid(this.getBlock(sx, sy, sz))) continue;
      const comp = [];
      const queue = [[sx, sy, sz]];
      const local = new Set([sk]);
      let grounded = false;
      while (queue.length && !grounded) {
        const [cx, cy, cz] = queue.pop();
        comp.push({ x: cx, y: cy, z: cz, id: this.getBlock(cx, cy, cz) });
        if (cy <= this.heightAt(cx, cz) + 1 || comp.length > limit) { grounded = true; break; }
        for (const [bx, by, bz] of DIRS) {
          const nx = cx + bx, ny = cy + by, nz = cz + bz;
          const nk = nx + ',' + ny + ',' + nz;
          if (local.has(nk) || !isSolid(this.getBlock(nx, ny, nz))) continue;
          local.add(nk);
          queue.push([nx, ny, nz]);
        }
      }
      for (const k of local) seen.add(k);
      if (!grounded && comp.length) groups.push(comp);
    }
    return groups;
  }

  /* ---------- spawning ---------- */
  /** Standing spot at column (x,z): solid floor with 2 blocks of air above. Scans from just above ground (skips roofs/canopies). */
  trySpawn(x, z) {
    const h = this.heightAt(x, z);
    for (let y = h + 3; y >= h - 3; y--) {
      this.ensureChunk(x >> 4, y >> 4, z >> 4);
      this.ensureChunk(x >> 4, (y + 2) >> 4, z >> 4);
      if (isSolid(this.getBlock(x, y, z)) && !isSolid(this.getBlock(x, y + 1, z)) && !isSolid(this.getBlock(x, y + 2, z))) {
        return { x: x + 0.5, y: y + 1.01, z: z + 0.5 };
      }
    }
    return null;
  }

  spawnPoint(x = 0, z = 0) {
    x = Math.floor(x); z = Math.floor(z);
    return this.trySpawn(x, z) || { x: x + 0.5, y: this.heightAt(x, z) + 4, z: z + 0.5 };
  }

  /** Spiral outward to find dry land away from any village footprint (oceans can cover the origin). */
  findLandSpawn(x0 = 0, z0 = 0, maxR = 600) {
    for (let r = 0; r <= maxR; r += 6) {
      const steps = r === 0 ? 1 : Math.max(8, Math.floor(r / 3));
      for (let k = 0; k < steps; k++) {
        const a = (k / steps) * Math.PI * 2;
        const x = Math.floor(x0 + Math.cos(a) * r), z = Math.floor(z0 + Math.sin(a) * r);
        if (this.heightAt(x, z) < SEA + 3) continue;
        if (this.villages.near(x, z, V_FLAT + V_BLEND + 4).length) continue;
        const p = this.trySpawn(x, z);
        if (p) return p;
      }
    }
    return this.spawnPoint(x0, z0);
  }
}
