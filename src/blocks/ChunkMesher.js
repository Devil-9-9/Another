import * as THREE from 'three';
import { CHUNK } from '../core/Constants.js';
import { B, BLOCKS, isOpaque } from './BlockTypes.js';
import { tileUV } from './TextureAtlas.js';

// dir, face shade, quad corners (CCW seen from outside)
const FACES = [
  { n: [1, 0, 0],  shade: 0.80, v: [[1,0,1],[1,0,0],[1,1,0],[1,1,1]], face: 'side' },
  { n: [-1, 0, 0], shade: 0.80, v: [[0,0,0],[0,0,1],[0,1,1],[0,1,0]], face: 'side' },
  { n: [0, 1, 0],  shade: 1.00, v: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]], face: 'top' },
  { n: [0, -1, 0], shade: 0.50, v: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]], face: 'bottom' },
  { n: [0, 0, 1],  shade: 0.65, v: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]], face: 'side' },
  { n: [0, 0, -1], shade: 0.65, v: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]], face: 'side' },
];
const QUAD_UV = [[0, 0], [1, 0], [1, 1], [0, 1]];
const EMISSIVE = 1.6; // vertex colour > 1 makes lava/crystal read as glowing even in dark caves

class Buf {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.i = []; this.count = 0; }
  toGeometry() {
    if (!this.count) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * Build opaque + translucent (glass, water) geometry for one 16^3 chunk with hidden-face culling.
 * Neighbouring chunks must already be generated, otherwise their border faces would be drawn.
 */
export function meshChunk(world, cx, cy, cz) {
  const opaque = new Buf(), glass = new Buf();
  if (!world.getChunk(cx, cy, cz)) return { opaque: null, glass: null }; // all air (or unloaded)
  const ox = cx * CHUNK, oy = cy * CHUNK, oz = cz * CHUNK;
  for (let ly = 0; ly < CHUNK; ly++) {
    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const x = ox + lx, y = oy + ly, z = oz + lz;
        const id = world.getBlock(x, y, z);
        if (id === B.AIR) continue;
        const def = BLOCKS[id];
        const buf = def.glass ? glass : opaque;
        for (const f of FACES) {
          const nb = world.getBlock(x + f.n[0], y + f.n[1], z + f.n[2]);
          if (isOpaque(nb)) continue;
          if (def.glass && nb === id) continue;
          if (def.fluid && !def.glass && nb === id) continue; // lava next to lava
          const uv = tileUV(def[f.face]);
          const shade = def.emissive ? EMISSIVE : f.shade;
          const base = buf.count;
          for (let k = 0; k < 4; k++) {
            const v = f.v[k];
            buf.p.push(x + v[0], y + v[1], z + v[2]);
            buf.n.push(f.n[0], f.n[1], f.n[2]);
            buf.uv.push(QUAD_UV[k][0] ? uv[2] : uv[0], QUAD_UV[k][1] ? uv[3] : uv[1]);
            buf.c.push(shade, shade, shade);
          }
          buf.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
          buf.count += 4;
        }
      }
    }
  }
  return { opaque: opaque.toGeometry(), glass: glass.toGeometry() };
}
