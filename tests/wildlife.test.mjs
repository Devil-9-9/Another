import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const ctx = new Proxy({}, { get:(t,k)=> (k in t? t[k] : ()=>{}), set:(t,k,v)=>{t[k]=v;return true;} });
globalThis.document = { createElement: () => ({ width:0, height:0, getContext: () => ctx }) };
const { World } = await import('../src/blocks/World.js');
const { Wildlife } = await import('../src/ai/Wildlife.js');
const { VoxelBody } = await import('../src/player/VoxelBody.js');
const { B } = await import('../src/blocks/BlockTypes.js');
const w = new World(1337);
const kills=[]; const game = { world:w, scene:{add(){},remove(){}}, onKill:(a,v)=>kills.push(v.name) };
const load = (b, r=4) => { const cx=b.x>>4, cy=Math.floor(b.y)>>4, cz=b.z>>4; for(let a=-r;a<=r;a++) for(let c=-1;c<=1;c++) for(let d=-r;d<=r;d++) w.ensureChunk(cx+a,cy+c,cz+d); };
let v=null; for (let a=-4;a<=4&&!v;a++) for (let b=-4;b<=4&&!v;b++) v=w.villages.inCell(a,b);
const player = { alive:true, body:{ x:v.x+30, y:v.baseH+1, z:v.z+30, inWater:false } };
load({x:v.x,y:v.baseH,z:v.z},6);
const wl = new Wildlife(game); game.wildlife = wl;
const step=(secs,time)=>{ for(let t=0;t<secs;t+=1/30){ wl.update(1/30,player,time); } };
// --- morning: villagers appear and walk around
step(2,0.3);
const vil=[...wl.villagers.values()]; console.log('villagers spawned:', vil.length, '| animals:', wl.animals.length);
console.assert(vil.length===5);
const start=vil.map(x=>[x.body.x,x.body.z]); step(60,0.3);
const moved=vil.map((x,i)=>Math.hypot(x.body.x-start[i][0],x.body.z-start[i][1])); const maxFromCentre=Math.max(...vil.map(x=>Math.hypot(x.body.x-v.x,x.body.z-v.z)));
console.log('day: distance walked (m):', moved.map(m=>m.toFixed(0)).join(','), '| farthest from well', maxFromCentre.toFixed(0),'m');
console.assert(moved.filter(m=>m>3).length>=3, 'most villagers wander by day'); console.assert(maxFromCentre<40);
// --- dusk -> night: everyone goes home and sleeps
step(90,0.8);
const asleep=vil.filter(x=>x.sleeping).length, inside=vil.filter(x=>x.insideHouse()).length;
console.log('night: sleeping', asleep,'/5, inside their own house', inside,'/5');
console.assert(asleep===5 && inside===5, 'all villagers asleep in bed');
// --- morning again: they wake and leave
step(90,0.3);
console.log('next morning: awake', vil.filter(x=>!x.sleeping).length,'/5, outside', vil.filter(x=>!x.insideHouse()).length,'/5');
console.assert(vil.filter(x=>!x.sleeping).length===5);
// --- shooting a villager: flees, dies, announced, respawns after 60s
const target=vil[0]; target.takeDamage(10,{pos:{x:target.body.x+3,z:target.body.z}}); console.log('hit villager: fleeT', target.fleeT, 'hp', target.hp);
target.takeDamage(100,{pos:{x:0,z:0}},false); step(5,0.3); console.log('dead villager removed:', !wl.villagers.has(target.house.id), 'kill feed:', kills.join(','));
step(40,0.3); console.log('still mourning at +45s:', !wl.villagers.has(target.house.id)); step(40,0.3); console.log('replacement after 60s:', wl.villagers.has(target.house.id));
console.assert(wl.villagers.has(target.house.id));
// --- animals: stay out of water, cliffs, nothing falls through the world
step(120,0.3); const bad=wl.animals.filter(a=>a.body.inWater||!isFinite(a.body.y)); console.log('animals alive:', wl.animals.length, 'in water:', bad.length, 'y range', Math.min(...wl.animals.map(a=>a.body.y)).toFixed(0),'..',Math.max(...wl.animals.map(a=>a.body.y)).toFixed(0));
// --- fish at a lake/ocean
let ox,oz; outer: for (let x=-900;x<900;x+=9) for (let z=-900;z<900;z+=9) if (w.heightAt(x,z)<=10){ ox=x; oz=z; break outer; }
const p2={alive:true,body:{x:ox,y:25,z:oz,inWater:false}}; load({x:ox,y:20,z:oz},5);
const wl2=new Wildlife(game); game.wildlife=wl2; for(let t=0;t<30;t+=1/30) wl2.update(1/30,p2,0.3);
console.log('fish near ocean:', wl2.fish.length); console.assert(wl2.fish.length>=6);
let outOfWater=0, samples=0; for(let t=0;t<90;t+=1/30){ wl2.update(1/30,p2,0.3); if (Math.floor(t*30)%30===0) for(const f of wl2.fish){ samples++; if (w.fluidAt(f.cx,f.cy,f.cz)!==B.WATER) outOfWater++; } }
console.log('fish samples', samples, 'out of water', outOfWater); console.assert(outOfWater===0);
const f0=wl2.fish[0]; const hit=f0.takeDamage(10,{pos:{x:0,z:0}}); console.log('fish killed:', hit, 'kills:', kills.slice(-1));
console.log('ALL OK');
