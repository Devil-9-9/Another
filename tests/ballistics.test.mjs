import { World } from '../src/blocks/World.js';
import { B } from '../src/blocks/BlockTypes.js';
import { resolveShot, rayAABB, falloff } from '../src/weapons/Ballistics.js';
const w = new World(42);
for (let cx=-2;cx<=2;cx++) for (let cz=-2;cz<=2;cz++) for (let cy=-1;cy<=3;cy++) w.ensureChunk(cx,cy,cz);
const gy = Math.max(w.heightAt(0,0), w.heightAt(10,0), w.heightAt(5,0)) + 1;
// clear a corridor and flatten: put the shooter and target well above terrain
const o = { x: 0.5, y: gy + 8 + 1.6, z: 0.5 };
const target = { alive: true, pos: { x: 10.5, y: gy + 8, z: 0.5 }, radius: 0.3, height: 1.8 };
const d = { x: 1, y: 0, z: 0 };
let r = resolveShot(w, o, d, 90, [target]);
console.log('body/head shot', r.kind, r.t.toFixed(2), 'head?', r.headshot);
console.assert(r.kind === 'entity' && Math.abs(r.t - 9.7) < 0.01, 'hits at x=10.2');
console.assert(r.headshot === true, 'eye-height ray is a headshot (y >= feet + 1.44)');
// aim at torso
r = resolveShot(w, { ...o, y: gy + 8 + 0.9 }, d, 90, [target]);
console.assert(r.kind === 'entity' && !r.headshot, 'torso is not headshot');
// wall in between blocks it: block placed at x=5 on the ray line
console.log('wall placed:', w.setBlock(5, Math.floor(o.y), 0, B.STONE), 'at y', Math.floor(o.y));
r = resolveShot(w, o, d, 90, [target]);
console.log('wall in the way ->', r.kind, 'at', r.t.toFixed(2));
console.assert(r.kind === 'block', 'wall must absorb the shot');
// dead / ignored targets
target.alive = false;
r = resolveShot(w, { ...o, y: o.y + 5 }, d, 90, [target]);
console.assert(r.kind !== 'entity', 'dead target ignored');
// range limit
target.alive = true;
r = resolveShot(w, { ...o, y: gy + 8 + 0.9 }, d, 5, [target]);
console.assert(r.kind === 'none', 'beyond range');
console.log('falloff 0/40%/70%/100% of range:', [0, 36, 63, 90].map(x => falloff(x, 90).toFixed(2)).join(' '));
console.log('OK');
