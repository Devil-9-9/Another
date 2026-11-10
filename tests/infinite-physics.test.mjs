import { World } from '../src/blocks/World.js';
import { VoxelBody } from '../src/player/VoxelBody.js';
import { B, isSolid } from '../src/blocks/BlockTypes.js';
const w = new World(1337);
// emulate BlockManager step 0: chunks around the player are always generated
const load = (b) => { const cx=Math.floor(b.x/16), cy=Math.floor(b.y/16), cz=Math.floor(b.z/16); for (let a=-1;a<=1;a++) for (let c=-1;c<=1;c++) for (let d=-1;d<=1;d++) w.ensureChunk(cx+a,cy+c,cz+d); };
const run = (b, secs, each) => { for (let t=0;t<secs;t+=1/60){ load(b); each?.(); b.step(1/60); } };

// 1) free-fall 3000 blocks from the sky realms onto land: must stop on the real ground, never fall through
const land = w.findLandSpawn(0,0); const gh = w.heightAt(land.x, land.z);
const b = new VoxelBody(w, land.x, 3000, land.z); let maxV=0;
run(b, 400, ()=>{ maxV=Math.max(maxV,-b.vy); if (b.onGround) {} });
console.log('1) fell from y=3000, rested at y=', b.y.toFixed(2), 'ground top =', gh+1, 'terminal speed', maxV.toFixed(1), 'm/s');
console.assert(b.onGround && isSolid(w.getBlock(b.x,b.y-0.5,b.z)), 'must come to rest on solid footing (the ground or a sky island), never fall through');

// 2) ocean: drop into the sea from y=70; water must slow you, no landing damage, no crash
let ox=null, oz=null; outer: for (let x=-800;x<800;x+=9) for (let z=-800;z<800;z+=9) if (w.heightAt(x,z)<=8){ ox=x; oz=z; break outer; }
const sb = new VoxelBody(w, ox+0.5, 70, oz+0.5); let wasInWater=false, minVyInWater=0, splashSpeed=0, prevInWater=false;
run(sb, 12, ()=>{ if (sb.inWater && !prevInWater) splashSpeed=-sb.vy; prevInWater=sb.inWater; wasInWater = wasInWater||sb.inWater; if (sb.inWater) minVyInWater=Math.min(minVyInWater,sb.vy); });
console.log('2) ocean at', [ox,oz], 'floor', w.heightAt(ox,oz), '| entered water at', splashSpeed.toFixed(1), 'm/s, slowest sink', (-minVyInWater).toFixed(1), 'm/s, landedSpeed on seabed', sb.landedSpeed, 'final y', sb.y.toFixed(2));
console.assert(wasInWater && sb.landedSpeed===0, 'swimming, no fall damage from the seabed');
// swim up with jump held
const up = {y0:sb.y}; for (let t=0;t<4;t+=1/60){ load(sb); sb.vy=Math.min(3.6, sb.vy+22/60); sb.step(1/60); } console.log('   swam up from', up.y0.toFixed(1), 'to', sb.y.toFixed(1), '(surface at ~21)');
console.assert(sb.y>up.y0+3);

// 3) dig straight down 400 blocks: there is no bottom
const d = new VoxelBody(w, land.x, gh+1, land.z); let cur=gh;
for (let i=0;i<400;i++){ load(d); const bx=Math.floor(d.x), bz=Math.floor(d.z); w.setBlock(bx, Math.floor(d.y)-1, bz, B.AIR); for (let s=0;s<30&&!d.onGround;s++){ load(d); d.step(1/60);} for (let s=0;s<3;s++){ load(d); d.step(1/60);} }
console.log('3) dug down from y=', gh+1, 'to y=', d.y.toFixed(1), '(400 blocks, still going: no floor)');
console.assert(d.y < gh+1-300);

// 4) build up 300 blocks in the air: place under feet, step up
const u = new VoxelBody(w, land.x, gh+1, land.z); load(u);
for (let i=0;i<300;i++){ load(u); const by=Math.floor(u.y)-1; if (!isSolid(w.getBlock(u.x,by,u.z))) { w.setBlock(Math.floor(u.x),by,Math.floor(u.z),B.PLANKS); } u.vy=5.2; for (let s=0;s<10;s++){ load(u); u.step(1/60);} const sup=Math.floor(u.y)-1; w.setBlock(Math.floor(u.x),sup,Math.floor(u.z),B.PLANKS); for(let s=0;s<20;s++){load(u);u.step(1/60);} }
console.log('4) built a tower up to y=', u.y.toFixed(1), 'from', gh+1);
console.assert(u.y > gh+200, 'can build upward past old limit (was 48)');
// 5) a fall through every sky realm, punching through islands on the way, ends on the real ground
{ const x=land.x+5, z=land.z+5, g=w.heightAt(x,z); const f=new VoxelBody(w,x,1500,z); let cleared=0;
  for (let s=0;s<60*400;s++){ load(f); if (f.onGround && f.y>g+3){ w.setBlock(Math.floor(f.x),Math.floor(f.y)-1,Math.floor(f.z),0); cleared++; } f.step(1/60); if (f.onGround && f.y<g+3) break; }
  console.log('5) fell 1500 blocks through the sky realms, punching through', cleared, 'island blocks, ended at y=', f.y.toFixed(2), 'ground top =', g+1);
  console.assert(Math.abs(f.y-(g+1))<0.05, 'ends on the real ground'); }
console.log('ALL OK');
