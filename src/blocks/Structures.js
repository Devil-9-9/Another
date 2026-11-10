// Pre-built buildings. Pure data (no rendering): each builder returns [[dx,dy,dz,id], ...] relative to the
// centre of the footprint at the base slab (y = 0). The entrance faces -z; placeStructure() rotates it to face the player.
import { B, isSolid } from './BlockTypes.js';

class Vox {
  constructor() { this.m = new Map(); }
  set(x, y, z, id) { this.m.set(x + ',' + y + ',' + z, [x, y, z, id]); }
  box(x0, y0, z0, x1, y1, z1, id) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
        for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) this.set(x, y, z, id);
  }
  list() { return [...this.m.values()]; }
}

const shift = (list, dx, dz) => list.map(([x, y, z, id]) => [x - dx, y, z - dz, id]);

/** 4x5 frame with a 2x3 lit portal inside, in the x/y plane. Bottom-centre origin. */
export function portalPrefab(frame, portal) {
  const v = new Vox();
  v.box(0, 0, 0, 3, 4, 0, frame);
  v.box(1, 1, 0, 2, 3, 0, portal);
  return shift(v.list(), 1, 0);
}

export function hotel() {
  const v = new Vox(), W = 22, D = 13, FL = 4, FH = 4, top = FL * FH;
  v.box(-1, 1, -3, W, top + 3, D, B.AIR);                          // clear trees/hills inside the volume
  v.box(-2, 0, -4, W + 1, 0, D + 1, B.TILE);                       // ground slab + plaza
  for (let f = 0; f < FL; f++) {
    const y0 = f * FH;
    if (f > 0) v.box(0, y0, 0, W - 1, y0, D - 1, B.QUARTZ);       // floor slab
    // outer walls
    for (let y = y0 + 1; y <= y0 + 3; y++) {
      for (let x = 0; x < W; x++) for (const z of [0, D - 1]) v.set(x, y, z, B.QUARTZ);
      for (let z = 0; z < D; z++) for (const x of [0, W - 1]) v.set(x, y, z, B.QUARTZ);
    }
    for (let y = y0 + 2; y <= y0 + 3; y++) {                       // windows
      for (let x = 2; x < W - 2; x++) if (x % 3 === 1) { v.set(x, y, 0, B.GLASS); v.set(x, y, D - 1, B.GLASS); }
      for (let z = 2; z < D - 2; z++) if (z % 3 === 1) { v.set(0, y, z, B.GLASS); v.set(W - 1, y, z, B.GLASS); }
    }
    for (const [x, z] of [[0, 0], [W - 1, 0], [0, D - 1], [W - 1, D - 1]]) v.box(x, y0 + 1, z, x, y0 + 3, z, B.GOLD);
    if (f === 0) {                                                  // lobby
      v.box(2, 1, 0, W - 3, 3, 0, B.GLASS);                         // glass front
      v.box(9, 1, 0, 12, 3, 0, B.AIR);                              // main door
      v.box(8, 1, 0, 8, 3, 0, B.GOLD); v.box(13, 1, 0, 13, 3, 0, B.GOLD);
      v.box(7, 4, -2, 14, 4, -1, B.QUARTZ); v.box(7, 4, -2, 14, 4, -2, B.GOLD); // entrance canopy
      v.box(6, 1, 8, 15, 1, 8, B.GOLD); v.box(6, 2, 8, 15, 2, 8, B.WOOL_RED); // reception desk
      for (const x of [5, 16]) v.box(x, 1, 4, x, 3, 4, B.QUARTZ);
      for (const x of [5, 11, 16]) for (const z of [3, 8]) v.set(x, 4, z, B.LAMP);
      v.box(9, 1, 2, 12, 1, 3, B.WOOL_RED);                         // red carpet runner... drawn on top of the tiles
    } else {
      v.box(1, y0, 6, W - 2, y0, 8, B.WOOL_RED);                    // corridor carpet
      for (const x of [3, 8, 12, 16, 20]) v.set(x, y0 + 4, 7, B.LAMP);
      v.box(1, y0 + 1, 5, W - 2, y0 + 3, 5, B.QUARTZ);              // partitions
      v.box(1, y0 + 1, 9, W - 2, y0 + 3, 9, B.QUARTZ);
      v.box(5, y0 + 1, 1, 5, y0 + 3, 4, B.QUARTZ);                  // stair bay wall
      v.box(2, y0 + 1, 5, 3, y0 + 2, 5, B.AIR);                     // bay door
      for (const dx of [9, 13, 17]) { v.box(dx, y0 + 1, 1, dx, y0 + 3, 4, B.QUARTZ); v.box(dx, y0 + 1, 10, dx, y0 + 3, 11, B.QUARTZ); }
      for (const rx of [6, 10, 14, 18]) {
        v.box(rx + 1, y0 + 1, 5, rx + 1, y0 + 2, 5, B.AIR);         // room doors (front + back)
        v.box(rx + 1, y0 + 1, 9, rx + 1, y0 + 2, 9, B.AIR);
        v.box(rx, y0 + 1, 1, rx, y0 + 1, 2, B.WOOL_RED); v.set(rx + 1, y0 + 1, 1, B.WOOL_BLUE); v.set(rx + 1, y0 + 1, 2, B.WOOL_BLUE); // bed
        v.set(rx + 2, y0 + 3, 1, B.LAMP);
        v.box(rx, y0 + 1, 10, rx, y0 + 1, 11, B.WOOL_RED); v.set(rx + 2, y0 + 3, 11, B.LAMP);
      }
    }
  }
  // stairs: switchback, one block per step (jump clears one block). Flight A (+x, z 1..2) on even floors, B (-x, z 3..4) on odd.
  for (let f = 0; f < FL - 1; f++) {
    const y0 = f * FH, A = f % 2 === 0;
    for (let k = 0; k < 4; k++) {
      const x = A ? 1 + k : 4 - k, z0 = A ? 1 : 3;
      v.box(x, y0 + 1, z0, x, y0 + 1 + k, z0 + 1, B.QUARTZ);
    }
    if (A) v.box(1, y0 + FH, 1, 3, y0 + FH, 2, B.AIR); else v.box(2, y0 + FH, 3, 4, y0 + FH, 4, B.AIR); // opening in the slab above
  }
  v.box(0, top, 0, W - 1, top, D - 1, B.QUARTZ);                    // roof
  v.box(0, top + 1, 0, W - 1, top + 1, D - 1, B.BRICK); v.box(1, top + 1, 1, W - 2, top + 1, D - 2, B.AIR);
  for (const [x, z] of [[0, 0], [W - 1, 0], [0, D - 1], [W - 1, D - 1]]) v.box(x, top + 1, z, x, top + 2, z, B.LAMP);
  v.box(2, top + 1, 3, 5, top + 1, 4, B.AIR); v.box(2, top + 1, 3, 5, top + 1, 4, B.AIR);
  return shift(v.list(), Math.floor(W / 2), Math.floor(D / 2));
}

export function house() {
  const v = new Vox(), W = 9, D = 7;
  v.box(-1, 1, -1, W, 8, D, B.AIR);
  v.box(0, 0, 0, W - 1, 0, D - 1, B.PLANKS);
  for (let y = 1; y <= 3; y++) {
    for (let x = 0; x < W; x++) for (const z of [0, D - 1]) v.set(x, y, z, y === 2 && x % 3 === 1 && x > 1 && x < W - 2 ? B.GLASS : B.BRICK);
    for (let z = 0; z < D; z++) for (const x of [0, W - 1]) v.set(x, y, z, y === 2 && z === 3 ? B.GLASS : B.BRICK);
  }
  v.box(4, 1, 0, 4, 2, 0, B.AIR);                                   // door
  for (const y of [1, 2, 3]) for (const [x, z] of [[0, 0], [W - 1, 0], [0, D - 1], [W - 1, D - 1]]) v.set(x, y, z, B.WOOD);
  for (let i = 0; i < 4; i++) v.box(i - 1, 4 + i, i - 1, W - i, 4 + i, D - i, B.PLANKS);
  v.box(1, 1, 4, 1, 1, 5, B.WOOL_RED); v.set(2, 1, 4, B.WOOL_BLUE); v.set(2, 1, 5, B.WOOL_BLUE);   // bed
  v.set(W - 2, 3, D - 2, B.LAMP); v.box(6, 1, 5, 7, 1, 5, B.WOOD);                                 // lamp + table
  return shift(v.list(), 4, 3);
}

export function tower() {
  const v = new Vox(), S = 7, H = 24;
  v.box(-1, 1, -1, S, H + 6, S, B.AIR);
  v.box(0, 0, 0, S - 1, 0, S - 1, B.COBBLE);
  for (let y = 1; y <= H; y++) {
    for (let i = 0; i < S; i++) for (const [x, z] of [[i, 0], [i, S - 1], [0, i], [S - 1, i]]) v.set(x, y, z, (y % 8 === 4 && i % 2 === 1) ? B.GLASS : B.COBBLE);
  }
  v.box(3, 1, 0, 3, 2, 0, B.AIR);                                   // door
  for (const y of [8, 16]) v.box(1, y, 1, S - 2, y, S - 2, B.PLANKS);
  v.box(0, H + 1, 0, S - 1, H + 1, S - 1, B.COBBLE); v.box(1, H + 1, 1, S - 2, H + 1, S - 2, B.QUARTZ);
  for (let i = 0; i < S; i += 2) for (const [x, z] of [[i, 0], [i, S - 1], [0, i], [S - 1, i]]) v.set(x, H + 2, z, B.COBBLE);
  v.box(3, H + 2, 3, 3, H + 4, 3, B.GOLD); v.set(3, H + 5, 3, B.LAMP);   // beacon
  return shift(v.list(), 3, 3);
}

export function buildStructure(key) {
  switch (key) {
    case 'hotel': return hotel();
    case 'house': return house();
    case 'tower': return tower();
    case 'portal_under': return portalPrefab(B.OBSIDIAN, B.PORTAL_UNDER);
    case 'portal_sky': return portalPrefab(B.GOLD, B.PORTAL_SKY);
    default: return [];
  }
}

/** Rotate by q quarter turns about the vertical axis. */
export function rotate(list, q) {
  q = ((q % 4) + 4) % 4;
  return list.map(([x, y, z, id]) => {
    for (let i = 0; i < q; i++) { const nx = -z, nz = x; x = nx; z = nz; }
    return [x, y, z, id];
  });
}

/** Quarter turns so the entrance (-z) faces the player, who looks along `yaw` (forward = (-sin, -cos)). */
export function turnsFor(yaw) {
  // the entrance should point back toward the player: direction = -forward = (sin yaw, cos yaw)
  const dx = Math.sin(yaw), dz = Math.cos(yaw);
  // base entrance direction is (0,-1); rotating once maps (x,z)->(-z,x): (0,-1)->(1,0)->(0,1)->(-1,0)
  const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  let best = 0, bd = -2;
  dirs.forEach(([a, b], i) => { const d = a * dx + b * dz; if (d > bd) { bd = d; best = i; } });
  return best;
}

/**
 * Build the blocks in the world, placing the base slab at (px, by, pz) and filling a foundation under it so
 * buildings on slopes do not float. Returns the number of blocks changed.
 */
export function placeStructure(game, key, px, by, pz, yaw) {
  let list = buildStructure(key);
  if (!list.length) return 0;
  list = rotate(list, turnsFor(yaw));
  const w = game.world, out = [];
  const slab = new Set();
  for (const [dx, dy, dz, id] of list) {
    out.push([px + dx, by + dy, pz + dz, id]);
    if (dy === 0 && id !== B.AIR) slab.add(dx + ',' + dz);
  }
  if (key !== 'portal_under' && key !== 'portal_sky') {
    for (const k of slab) {
      const [dx, dz] = k.split(',').map(Number);
      for (let i = 1; i <= 14; i++) {
        const x = px + dx, y = by - i, z = pz + dz;
        if (isSolid(w.getBlock(x, y, z))) break;
        out.push([x, y, z, B.COBBLE]);
      }
    }
  }
  return game.blocks.setMany(out);
}
