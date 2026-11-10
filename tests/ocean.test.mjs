import { World } from '../src/blocks/World.js';
import { B } from '../src/blocks/BlockTypes.js';
const w = new World(1337); const x=-600,z=-292;
console.log('before loading y>=16 chunk: y=19 reads', w.getBlock(x,19,z), '(0 = unloaded reads as air)');
for (let cy=-1; cy<=1; cy++) w.ensureChunk(x>>4,cy,z>>4);
const col=[]; for (let y=10;y<=22;y++) col.push(y+':'+w.getBlock(x,y,z)); console.log(col.join(' '));
console.assert(w.getBlock(x,19,z)===B.WATER && w.getBlock(x,20,z)===B.WATER && w.getBlock(x,21,z)===B.AIR && w.getBlock(x,w.heightAt(x,z),z)===B.SAND, 'seabed sand, water up to y=20, air above');
console.log('OK: floor', w.heightAt(x,z), 'is sand, water fills to sea level 20');
