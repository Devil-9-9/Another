import * as THREE from 'three';
import { T, BLOCKS } from './BlockTypes.js';
import { hash2 } from '../core/Noise.js';

export const TILE = 16;
export const GRID = 6;

function rand(tile, x, y) { return hash2(x + tile * 31, y - tile * 17, 777); }
const clamp = (v) => Math.max(0, Math.min(255, v));

function fill(ctx, tile, base, jitter = 18, fn) {
  const img = ctx.createImageData(TILE, TILE);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    let [r, g, b, a] = base;
    const j = (rand(tile, x, y) - 0.5) * jitter * 2;
    r = clamp(r + j); g = clamp(g + j); b = clamp(b + j); a = a ?? 255;
    if (fn) { const o = fn(x, y, [r, g, b, a]); if (o) [r, g, b, a] = o; }
    const i = (y * TILE + x) * 4;
    img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = a;
  }
  return img;
}

const GENERATORS = {
  [T.GRASS_TOP]: (c) => fill(c, T.GRASS_TOP, [96, 170, 70, 255], 16),
  [T.GRASS_SIDE]: (c) => fill(c, T.GRASS_SIDE, [134, 96, 62, 255], 14, (x, y, p) => (y < 3 + (rand(T.GRASS_SIDE, x, 0) > 0.5 ? 1 : 0) ? [90, 160, 64, 255] : p)),
  [T.DIRT]: (c) => fill(c, T.DIRT, [134, 96, 62, 255], 14),
  [T.STONE]: (c) => fill(c, T.STONE, [125, 128, 132, 255], 16, (x, y, p) => (rand(T.STONE, x * 3, y * 3) > 0.93 ? [95, 98, 102, 255] : p)),
  [T.SAND]: (c) => fill(c, T.SAND, [222, 207, 150, 255], 10),
  [T.WOOD_SIDE]: (c) => fill(c, T.WOOD_SIDE, [104, 78, 46, 255], 8, (x, y, p) => (x % 4 === 0 ? [p[0] - 18, p[1] - 14, p[2] - 10, 255] : p)),
  [T.WOOD_TOP]: (c) => fill(c, T.WOOD_TOP, [168, 135, 82, 255], 8, (x, y, p) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    return Math.floor(d) % 3 === 0 ? [p[0] - 30, p[1] - 26, p[2] - 20, 255] : p;
  }),
  [T.LEAVES]: (c) => fill(c, T.LEAVES, [58, 132, 48, 255], 20, (x, y, p) => (rand(T.LEAVES, x * 5, y * 5) > 0.82 ? [0, 0, 0, 0] : p)),
  [T.BRICK]: (c) => fill(c, T.BRICK, [160, 70, 56, 255], 10, (x, y, p) => {
    const row = Math.floor(y / 4);
    const off = row % 2 ? 4 : 0;
    return (y % 4 === 3 || (x + off) % 8 === 7) ? [190, 182, 170, 255] : p;
  }),
  [T.GLASS]: (c) => fill(c, T.GLASS, [190, 225, 240, 70], 0, (x, y, p) => ((x === 0 || y === 0 || x === 15 || y === 15) ? [220, 240, 250, 190] : (x === y || x === y + 1) && x < 6 ? [255, 255, 255, 140] : p)),
  [T.PLANKS]: (c) => fill(c, T.PLANKS, [176, 140, 86, 255], 9, (x, y, p) => (y % 4 === 3 ? [p[0] - 38, p[1] - 32, p[2] - 24, 255] : p)),
  [T.BEDROCK]: (c) => fill(c, T.BEDROCK, [50, 50, 54, 255], 26),
  [T.WATER]: (c) => fill(c, T.WATER, [40, 110, 200, 150], 10, (x, y, p) => ((x + y * 2) % 11 === 0 ? [90, 160, 235, 175] : p)),
  [T.LAVA]: (c) => fill(c, T.LAVA, [235, 90, 20, 255], 30, (x, y, p) => (rand(T.LAVA, x * 2, y * 2) > 0.75 ? [255, 210, 60, 255] : p)),
  [T.CLOUD]: (c) => fill(c, T.CLOUD, [245, 247, 252, 255], 6),
  [T.CRYSTAL]: (c) => fill(c, T.CRYSTAL, [90, 220, 235, 255], 22, (x, y, p) => ((x + y) % 5 === 0 ? [200, 255, 255, 255] : p)),
  [T.METAL]: (c) => fill(c, T.METAL, [150, 156, 166, 255], 6, (x, y, p) => {
    const edge = x === 0 || y === 0 || x === 15 || y === 15;
    const rivet = (x === 2 || x === 13) && (y === 2 || y === 13);
    return edge ? [105, 110, 120, 255] : rivet ? [215, 220, 228, 255] : p;
  }),
  [T.OBSIDIAN]: (c) => fill(c, T.OBSIDIAN, [26, 16, 42, 255], 8, (x, y, p) => (((x * 2 + y) % 9 === 0) ? [74, 36, 120, 255] : p)),
  [T.PORTAL_UNDER]: (c) => fill(c, T.PORTAL_UNDER, [130, 40, 200, 175], 14, (x, y, p) => (((x * 3 + y * 5) % 11 < 2) ? [225, 130, 255, 215] : p)),
  [T.PORTAL_SKY]: (c) => fill(c, T.PORTAL_SKY, [60, 200, 232, 165], 14, (x, y, p) => (((x * 5 + y * 3) % 11 < 2) ? [235, 255, 255, 215] : p)),
  [T.LAMP]: (c) => fill(c, T.LAMP, [255, 226, 130, 255], 12, (x, y, p) => ((x === 0 || y === 0 || x === 15 || y === 15) ? [214, 166, 70, 255] : p)),
  [T.QUARTZ]: (c) => fill(c, T.QUARTZ, [238, 234, 226, 255], 4, (x, y, p) => (y % 8 === 7 ? [p[0] - 16, p[1] - 16, p[2] - 14, 255] : p)),
  [T.GOLD]: (c) => fill(c, T.GOLD, [242, 200, 62, 255], 10, (x, y, p) => (((x + y) % 7 === 0) ? [255, 236, 140, 255] : (x === 0 || y === 0 ? [196, 150, 30, 255] : p))),
  [T.TILE]: (c) => fill(c, T.TILE, [236, 236, 242, 255], 3, (x, y, p) => ((((x >> 3) + (y >> 3)) % 2) ? [58, 58, 70, 255] : p)),
  [T.WOOL_RED]: (c) => fill(c, T.WOOL_RED, [190, 40, 46, 255], 12),
  [T.COBBLE]: (c) => fill(c, T.COBBLE, [120, 120, 122, 255], 14, (x, y, p) => ((rand(T.COBBLE, x * 3, y * 3) > 0.78 || (x + (y >> 2) * 3) % 6 === 0) ? [84, 84, 88, 255] : p)),
  [T.SANDSTONE]: (c) => fill(c, T.SANDSTONE, [216, 192, 132, 255], 8, (x, y, p) => (y % 5 === 4 ? [p[0] - 24, p[1] - 22, p[2] - 20, 255] : p)),
  [T.DIAMOND]: (c) => fill(c, T.DIAMOND, [72, 212, 218, 255], 14, (x, y, p) => ((rand(T.DIAMOND, x * 7, y * 7) > 0.88) ? [225, 255, 255, 255] : p)),
  [T.WOOL_BLUE]: (c) => fill(c, T.WOOL_BLUE, [46, 82, 192, 255], 12),
  [T.WOOL_YELLOW]: (c) => fill(c, T.WOOL_YELLOW, [236, 202, 52, 255], 12),
  [T.BLACK]: (c) => fill(c, T.BLACK, [32, 32, 36, 255], 6),
  [T.SNOW]: (c) => fill(c, T.SNOW, [248, 250, 255, 255], 4),
  [T.COAL_ORE]: (c) => fill(c, T.COAL_ORE, [120, 120, 122, 255], 12, (x, y, p) => ((rand(T.COAL_ORE, x >> 2, y >> 2) > 0.55 && rand(T.COAL_ORE, x, y) > 0.3) ? [24, 24, 28, 255] : p)),
  [T.IRON_ORE]: (c) => fill(c, T.IRON_ORE, [120, 120, 122, 255], 12, (x, y, p) => ((rand(T.IRON_ORE, x >> 2, y >> 2) > 0.55 && rand(T.IRON_ORE, x, y) > 0.3) ? [214, 160, 120, 255] : p)),
  [T.TORCH]: (c) => fill(c, T.TORCH, [255, 170, 50, 255], 18, (x, y, p) => ((x < 3 || x > 12) ? [150, 80, 20, 255] : (y < 5 ? [255, 235, 120, 255] : p))),
  [T.ICE]: (c) => fill(c, T.ICE, [150, 202, 246, 150], 8, (x, y, p) => ((x === 0 || y === 0 || x === 15 || y === 15) ? [200, 230, 255, 190] : p)),
};

export function buildAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TILE * GRID;
  const ctx = canvas.getContext('2d');
  for (const [tile, gen] of Object.entries(GENERATORS)) {
    const t = Number(tile);
    ctx.putImageData(gen(ctx), (t % GRID) * TILE, Math.floor(t / GRID) * TILE);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapLinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  return { canvas, texture };
}

/** UV rectangle [u0, v0, u1, v1] for a tile index (v up, matching three.js). */
export function tileUV(t) {
  const col = t % GRID, row = Math.floor(t / GRID);
  const e = 0.0015;
  return [col / GRID + e, 1 - (row + 1) / GRID + e, (col + 1) / GRID - e, 1 - row / GRID - e];
}

/** Draw a block's side texture into a small canvas (hotbar icon). */
export function drawBlockIcon(target, atlasCanvas, blockId) {
  const t = BLOCKS[blockId].side;
  target.width = target.height = TILE;
  const ctx = target.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(atlasCanvas, (t % GRID) * TILE, Math.floor(t / GRID) * TILE, TILE, TILE, 0, 0, TILE, TILE);
}

export const BLOCK_COLORS = {
  1: 0x60aa46, 2: 0x86603e, 3: 0x7d8084, 4: 0xdecf96, 5: 0x684e2e, 6: 0x3a8430,
  7: 0xa04638, 8: 0xbfe1f0, 9: 0xb08c56, 10: 0x323236, 11: 0x969ca6,
  12: 0x2f6fc8, 13: 0xf06014, 14: 0xf5f7fc, 15: 0x5adceb,
  16: 0x1a102a, 17: 0x8228c8, 18: 0x3cc8e8, 19: 0xffe282, 20: 0xeeeae2, 21: 0xf2c83e, 22: 0xc8c8d0, 23: 0xbe282e,
  32: 0x787880, 33: 0x787880, 34: 0xffaa32, 35: 0xbe282e,
  24: 0x787880, 25: 0xd8c084, 26: 0x48d4da, 27: 0x2e52c0, 28: 0xecca34, 29: 0x202024, 30: 0xf8faff, 31: 0x96caf6,
};
