import { World } from '../src/blocks/World.js';
import { B, isSolid } from '../src/blocks/BlockTypes.js';
const w = new World(1337);
let v=null; for (let a=-4;a<=4&&!v;a++) for (let b=-4;b<=4&&!v;b++){ v=w.villages.inCell(a,b); }
console.log('village', v.x, v.z, 'base', v.baseH, 'houses', v.houses.length);
for (let cx=(v.x>>4)-3; cx<=(v.x>>4)+3; cx++) for (let cz=(v.z>>4)-3; cz<=(v.z>>4)+3; cz++) for (let cy=(v.baseH>>4)-1; cy<=(v.baseH>>4)+1; cy++) w.ensureChunk(cx,cy,cz);
let ok=0;
for (const h of v.houses) {
  const fx=Math.floor(h.doorOut.x), fz=Math.floor(h.doorOut.z), ix=Math.floor(h.inside.x), iz=Math.floor(h.inside.z), by=v.baseH;
  const floor=w.getBlock(ix,by,iz), air1=w.getBlock(ix,by+1,iz), air2=w.getBlock(ix,by+2,iz), roof=w.getBlock(ix,by+4,iz);
  // the doorway cell is between doorOut and inside: walk the straight line and require it to be passable
  let pass=true; const steps=12; for(let s=0;s<=steps;s++){ const x=h.doorOut.x+(h.inside.x-h.doorOut.x)*s/steps, z=h.doorOut.z+(h.inside.z-h.doorOut.z)*s/steps; if(isSolid(w.getBlock(x,by+1,z))||isSolid(w.getBlock(x,by+2,z))) {pass=false;break;} }
  const good = floor===B.PLANKS && air1===0 && air2===0 && roof===B.PLANKS && pass;
  console.log(h.id,'rot',h.rot,'floor',floor,'room air',air1===0&&air2===0,'roof',roof,'door->bed path clear',pass, good?'OK':'BAD'); if(good) ok++;
}
console.assert(ok===5,'all houses valid');
console.log('well water:', w.getBlock(v.x,v.baseH,v.z)===B.WATER, 'ground outside is grass/stone at base:', w.getBlock(v.x+20,v.baseH,v.z));
// flat ground check inside radius
let flat=true; for (let a=0;a<360;a+=20){ const x=Math.round(v.x+Math.cos(a*Math.PI/180)*20), z=Math.round(v.z+Math.sin(a*Math.PI/180)*20); if (w.heightAt(x,z)!==v.baseH) flat=false; } console.log('ground flattened r=20:', flat);
const sp = w.findLandSpawn(0,0); console.log('land spawn', sp, 'ground height', w.heightAt(sp.x,sp.z));
console.assert(w.heightAt(sp.x,sp.z) >= 23);
// ocean really holds water
let wx=null; outer: for (let x=-600;x<600;x+=7) for (let z=-600;z<600;z+=7){ if (w.heightAt(x,z)<14){ wx=[x,z]; break outer; } }
w.ensureChunk(wx[0]>>4,0,wx[1]>>4); console.log('ocean column at',wx,'floor y',w.heightAt(...wx),'water at y=19:',w.getBlock(wx[0],19,wx[1])===B.WATER,'air at y=21:',w.getBlock(wx[0],21,wx[1])===0);
console.log('OK');
