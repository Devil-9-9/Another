import { World } from '../src/blocks/World.js';
import { B } from '../src/blocks/BlockTypes.js';
import { SEA, SKY_BASE } from '../src/core/Constants.js';
const t0 = performance.now();
const w = new World(1337);
const hist = { ocean:0, land:0 }; const N=120;
let minH=1e9,maxH=-1e9;
for (let i=0;i<N;i++) for (let j=0;j<N;j++){ const h=w.heightAt(i*40-2400,j*40-2400); (h<SEA?hist.ocean++:hist.land++); minH=Math.min(minH,h); maxH=Math.max(maxH,h); }
console.log('terrain sample 4.8km square: ocean/lake', (100*hist.ocean/(N*N)).toFixed(0)+'%', 'land', (100*hist.land/(N*N)).toFixed(0)+'%', 'height range', minH, '..', maxH);
// find villages
let vs=[]; for (let a=-4;a<=4;a++) for (let b=-4;b<=4;b++){ const v=w.villages.inCell(a,b); if(v) vs.push(v); }
console.log('villages in 9x9 cells:', vs.length, 'first at', vs[0]&&[vs[0].x,vs[0].z,'base',vs[0].baseH]);
// 1) vertical infinity: block at absurd heights/depths is settable and readable
for (const y of [-100000, -5000, -1, 0, 50, 5000, 1000000]) { w.ensureChunk(0,y>>4,0); w.setBlock(3,y,3,B.STONE); console.assert(w.getBlock(3,y,3)===B.STONE,'set/get at y='+y); }
console.log('set/get works at y = -100000 .. 1000000');
// 2) underworld: dig down column, count air/lava/crystal and see it never hits a floor
const stats = {air:0,lava:0,crystal:0,stone:0};
for (let cy=-40; cy<0; cy++) { const c=w.ensureChunk(10,cy,10); if(!c){stats.air+=4096;continue;} for (const v of c){ if(v===0)stats.air++; else if(v===B.LAVA)stats.lava++; else if(v===B.CRYSTAL)stats.crystal++; else stats.stone++; } }
console.log('underworld y -640..-1 chunk column:', stats); console.assert(stats.air>0 && stats.stone>0 && stats.lava>0, 'caves+lava exist');
// 3) sky realms: several bands up, islands exist in each
const bands=[]; for (let b=0;b<6;b++){ let solid=0, cloud=0; for (let cy=(SKY_BASE>>4)+b*8; cy<(SKY_BASE>>4)+b*8+8; cy++) for(let cx=-3;cx<=3;cx++) for(let cz=-3;cz<=3;cz++){ const c=w.ensureChunk(cx,cy,cz); if(!c)continue; for(const v of c){ if(v===B.CLOUD)cloud++; else if(v)solid++; } } bands.push([b,solid,cloud]); }
console.log('sky bands [band, solid, cloud] in 7x7 chunk area:', JSON.stringify(bands)); console.assert(bands.every(b=>b[1]>0),'islands in every band');
// 4) air gap between ground and sky is really empty
let gap=0; for (let cy=7-0; cy<8; cy++){ const c=w.ensureChunk(0,cy,0); if(c) gap++; } console.log('chunk y=112..127 loaded as air:', w.getChunk(0,7,0)===null);
console.log('time', (performance.now()-t0).toFixed(0)+'ms');
