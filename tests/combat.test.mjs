import { World } from '../src/blocks/World.js';
import { B } from '../src/blocks/BlockTypes.js';
import { Player } from '../src/player/Player.js';
import { WeaponManager } from '../src/weapons/WeaponManager.js';
import { InputState } from '../src/controls/InputState.js';
const w = new World(42);
for (let cx=-3;cx<=3;cx++) for (let cz=-3;cz<=3;cz++) for (let cy=-1;cy<=3;cy++) w.ensureChunk(cx,cy,cz);
const sp = w.spawnPoint(0,0);
const player = new Player(w, sp);
const log = { hits:0, kills:0, blockHits:0, sounds:[], tracers:0 };
const game = { world:w, v3:p=>p,
  audio:{ play:n=>log.sounds.push(n) }, viewModel:{ kickShot(){} },
  effects:{ muzzle(){}, tracer(){log.tracers++}, blockDebris(){}, impact(){} },
  hud:{ hitmarker(k){ log.hits++; if(k) log.kills++; } },
  blocks:{ hit(){ log.blockHits++; return 'damaged'; } }, net:null,
  getTargets:()=>[dummy] };
// dummy target 15 blocks ahead (yaw 0 => facing -Z), standing on the terrain
const tz = -15, ty = 40; // above all terrain: clear line of fire
// make a clear line: flatten by putting player at same height as dummy feet
Object.assign(player.body, { x:0.5, y:ty, z:0.5 }); player.yaw = 0; player.pitch = 0;
let dmgTaken = 0;
const dummy = { alive:true, hp:100, pos:{x:0.5,y:ty,z:tz+0.5}, radius:0.3, height:1.8,
  takeDamage(d){ dmgTaken+=d; this.hp-=d; if(this.hp<=0){this.alive=false; return true;} return false; } };
const wm = new WeaponManager(game);
const input = new InputState();
// hold fire with the AK for 2 seconds of game time
input.fire = true; player.ads = false;
const startAmmo = wm.weapon.ammo;
for (let t=0;t<2;t+=1/60){ player.pitch=0; wm.update(1/60, input, player, true); if(!dummy.alive) break; }
console.log('AK shots fired:', startAmmo - wm.weapon.ammo, 'hits', log.hits, 'dmg dealt', dmgTaken.toFixed(0), 'dummy alive', dummy.alive, 'recoil pitch', player.pitch.toFixed(3));
console.assert(startAmmo - wm.weapon.ammo >= 5 && startAmmo - wm.weapon.ammo <= 22, 'AK fires at ~10 rps');
// rate check: 600rpm = 10 shots/s -> in ~1s expect ~10
input.fire = false; wm.update(1/60,input,player,true);
console.log('AK hits/shots', log.hits, '/', startAmmo - wm.weapon.ammo, 'blockHits', log.blockHits);
// semi-auto: holding fire on pistol shoots once
wm.select(2); wm.swapT = 0; const pa = wm.weapon.ammo; input.fire = true;
for (let i=0;i<60;i++){ wm.update(1/60,input,player,true);} console.log('pistol held 1s ->', pa - wm.weapon.ammo, 'shot (semi-auto)');
console.assert(pa - wm.weapon.ammo === 1);
input.fire=false; wm.update(1/60,input,player,true);
// reload: drain mag then reload
const aw = wm.weapons[0]; wm.select(0); wm.swapT=0; aw.ammo = 3; input.press('reload'); wm.update(1/60,input,player,true);
console.log('reloading:', aw.reloading);
for (let t=0;t<aw.reloadTime+0.1;t+=1/60) wm.update(1/60,input,player,true);
console.log('after reload ammo', aw.ammo, 'reserve', aw.reserve); console.assert(aw.ammo===30 && aw.reserve===93);
// empty mag auto-reload
aw.ammo=0; input.fire=true; wm.update(1/60,input,player,true); console.log('empty -> reloading', aw.reloading, 'sounds', log.sounds.slice(-2));
input.fire=false;
// sniper one-shot kill to head? damage 95*2.5 > 100
input.fire=false; wm.update(1/60,input,player,true); const sn = wm.weapons[1]; wm.select(1); wm.swapT=0; sn.cooldown=0; dummy.alive=true; dummy.hp=100; log.kills=0;
player.pitch = 0; // eye is 1.62 above feet => head zone (>=1.44)
input.fire = true; wm.update(1/60,input,player,true); input.fire=false;
console.log('sniper headshot kill?', log.kills===1, 'ammo', sn.ammo);
// shotgun fires 8 pellets
input.fire=false; wm.update(1/60,input,player,true); wm.select(3); wm.swapT=0; const sg=wm.weapon; sg.cooldown=0; dummy.alive=true; dummy.hp=1000; const t0=log.tracers; input.fire=true; wm.update(1/60,input,player,true); input.fire=false;
console.log('shotgun pellets/tracers', log.tracers-t0); console.assert(log.tracers-t0===8);
// player damage / death / respawn
let died=false, respawned=false; player.onDeath=()=>died=true; player.onRespawn=()=>respawned=true;
player.takeDamage(60); player.takeDamage(60);
console.log('died', died, 'alive', player.alive);
for (let t=0;t<3.2;t+=1/60) player.update(1/60,input);
console.log('respawned', respawned, 'hp', player.hp);
// fall damage: drop 20 blocks onto DRY land (water and clouds deliberately cancel fall damage)
const land = w.findLandSpawn(0,0); for (let cy=-1;cy<=3;cy++) for (let a=-1;a<=1;a++) for (let c=-1;c<=1;c++) w.ensureChunk((land.x>>4)+a,cy,(land.z>>4)+c);
Object.assign(player.body,{x:land.x,z:land.z,y:w.heightAt(land.x,land.z)+21,vy:0}); const hp0=player.hp; for(let t=0;t<3;t+=1/60) player.update(1/60,input);
console.log('fell 20 blocks, hp', hp0,'->',player.hp);
console.assert(player.hp<hp0);
console.log('ALL OK');
// --- sniper scoped (ADS => zero spread) ---
{
  input.fire=false; input.aim=true; wm.select(1); wm.swapT=0; wm.weapon.cooldown=0; wm.weapon.ammo=5;
  Object.assign(player.body,{x:0.5,y:40,z:0.5}); player.alive=true; player.hp=100; player.yaw=0; player.pitch=0; player.crouching=false; player.eye=1.62; player.body.vx=player.body.vz=0;
  dummy.alive=true; dummy.hp=100; log.kills=0;
  wm.update(1/60,input,player,true); // sets ads
  input.fire=true; wm.update(1/60,input,player,true); input.fire=false;
  console.log('SCOPED sniper: ads', player.ads, 'kill', log.kills===1, 'dummy hp', dummy.hp.toFixed(0));
  console.assert(log.kills===1);
}
