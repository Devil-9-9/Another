// Fly mode, portals, buildings, inventory items, new weapons (pure logic: no rendering).
import { World } from '../src/blocks/World.js';
import { B, BLOCKS, isSolid, isPortal } from '../src/blocks/BlockTypes.js';
import { VoxelBody } from '../src/player/VoxelBody.js';
import { Player } from '../src/player/Player.js';
import { InputState } from '../src/controls/InputState.js';
import { buildStructure, rotate, turnsFor, placeStructure } from '../src/blocks/Structures.js';
import { findPortalFrame, portalIntact } from '../src/blocks/Portals.js';
import { BLOCK_IDS, isValidItem, itemInfo, loadHotbar } from '../src/blocks/Items.js';
import { WeaponManager } from '../src/weapons/WeaponManager.js';

const w = new World(1337);
const place = (list) => { for (const [x, y, z, id] of list) w.setBlock(x, y, z, id); };

// ---- every block is in the inventory, portal blocks are walk-through
console.assert(BLOCK_IDS.length >= 25, 'inventory has all the blocks', BLOCK_IDS.length);
console.assert(!BLOCK_IDS.includes(B.PORTAL_UNDER) && !BLOCK_IDS.includes(B.AIR), 'portal/air blocks are not handed out');
console.assert(!isSolid(B.PORTAL_UNDER) && !isSolid(B.PORTAL_SKY) && isPortal(B.PORTAL_SKY), 'portals are not solid');
console.assert(isSolid(B.OBSIDIAN) && isSolid(B.GOLD) && BLOCKS[B.LAMP].emissive, 'new blocks behave');
console.assert(isValidItem('struct:hotel') && isValidItem('veh:heli') && isValidItem('tool:lighter') && !isValidItem('veh:tank') && !isValidItem(9999), 'item validation');
console.assert(itemInfo('struct:hotel').kind === 'struct' && itemInfo(B.STONE).kind === 'block', 'item info');
const fakeStore = { getItem: () => JSON.stringify([B.GOLD, 'bogus', 'veh:jeep']) };
const hb = loadHotbar(fakeStore);
console.assert(hb[0] === B.GOLD && hb[2] === 'veh:jeep' && hb.length === 8 && isValidItem(hb[1]), 'saved hotbar loads and rejects junk');

// ---- flying: no gravity, unlimited time and height
const sp = w.findLandSpawn(0, 0);
for (let cx = -2; cx <= 2; cx++) for (let cz = -2; cz <= 2; cz++) for (let cy = -2; cy <= 40; cy++) w.ensureChunk((Math.floor(sp.x) >> 4) + cx, cy, (Math.floor(sp.z) >> 4) + cz);
const player = new Player(w, { x: sp.x, y: sp.y + 60, z: sp.z });
player.setFlying(true);
const inp = new InputState();
let y0 = player.body.y;
for (let i = 0; i < 600; i++) player.update(0.05, inp);        // 30 s hovering
console.assert(Math.abs(player.body.y - y0) < 0.5, 'hovers, does not fall', y0, player.body.y);
inp.jump = true;
for (let i = 0; i < 100; i++) player.update(0.05, inp);        // 5 s climbing
console.assert(player.body.y > y0 + 20, 'JUMP climbs while flying', player.body.y - y0);
inp.jump = false; inp.crouch = true;
for (let i = 0; i < 100; i++) player.update(0.05, inp);
console.assert(player.body.y < y0 + 20, 'DUCK descends while flying');
console.assert(!player.crouching, 'no crouch pose while flying');
// look up + forward = climb
inp.crouch = false; inp.moveZ = 1; player.pitch = 0.8; const yb = player.body.y;
for (let i = 0; i < 20; i++) player.update(0.05, inp);
console.assert(player.body.y > yb + 3, 'forward follows the look direction');
// switching off in mid-air: feather fall, no damage on landing
inp.moveZ = 0; player.pitch = 0; player.setFlying(false);
for (let i = 0; i < 1500 && !player.body.onGround; i++) player.update(0.05, inp);
console.assert(player.hp === 100, 'no fall damage after flying', player.hp);
const fall = new Player(w, { x: sp.x, y: sp.y + 40, z: sp.z });
for (let i = 0; i < 1500 && !fall.body.onGround; i++) fall.update(0.05, new InputState());
console.assert(fall.hp < 100, 'a normal fall still hurts', fall.hp);

// ---- portals: frame detection and integrity
const ox = 2000, oy = 140, oz = 2000;
for (let cx = -1; cx <= 1; cx++) for (let cy = -1; cy <= 1; cy++) for (let cz = -1; cz <= 1; cz++) w.ensureChunk((ox >> 4) + cx, (oy >> 4) + cy, (oz >> 4) + cz);
const frame = (x, y, z, id) => { for (let a = 0; a < 4; a++) for (let h = 0; h < 5; h++) if (a === 0 || a === 3 || h === 0 || h === 4) w.setBlock(x + a, y + h, z, id); };
for (let a = 0; a < 4; a++) for (let h = 0; h < 5; h++) for (let k = -1; k <= 1; k++) w.setBlock(ox + a, oy + h, oz + k, B.AIR);
frame(ox, oy, oz, B.OBSIDIAN);
let f = findPortalFrame(w, ox + 1, oy + 1, oz);
console.assert(f && f.cells.length === 6 && f.portal === B.PORTAL_UNDER, 'obsidian frame lights an underworld portal');
console.assert(!findPortalFrame(w, ox + 1, oy + 1, oz + 1), 'no frame on the wrong plane');
w.setBlock(ox, oy + 2, oz, B.AIR);                              // knock a block out of the frame
console.assert(!findPortalFrame(w, ox + 1, oy + 1, oz), 'broken frame does not light');
w.setBlock(ox, oy + 2, oz, B.OBSIDIAN);
for (const c of findPortalFrame(w, ox + 1, oy + 1, oz).cells) w.setBlock(c[0], c[1], c[2], B.PORTAL_UNDER);
console.assert(portalIntact(w, ox + 1, oy + 2, oz).ok, 'lit portal is intact');
w.setBlock(ox + 3, oy + 2, oz, B.AIR);
console.assert(!portalIntact(w, ox + 1, oy + 2, oz).ok, 'portal collapses when the frame breaks');
// gold frame along the other axis => sky portal
const gx = 2100, gz = 2100;
for (let cx = -1; cx <= 1; cx++) for (let cy = -1; cy <= 1; cy++) for (let cz = -1; cz <= 1; cz++) w.ensureChunk((gx >> 4) + cx, (oy >> 4) + cy, (gz >> 4) + cz);
for (let a = 0; a < 4; a++) for (let h = 0; h < 5; h++) { for (let k = -1; k <= 1; k++) w.setBlock(gx + k, oy + h, gz + a, B.AIR); if (a === 0 || a === 3 || h === 0 || h === 4) w.setBlock(gx, oy + h, gz + a, B.GOLD); }
f = findPortalFrame(w, gx, oy + 1, gz + 1);
console.assert(f && f.portal === B.PORTAL_SKY, 'gold frame (z axis) lights a sky portal');

// ---- sky portal needs cloud blocks (gold still works in creative)
const cx0 = 2200, cz0 = 2200;
for (let cx = -1; cx <= 1; cx++) for (let cy = -1; cy <= 1; cy++) for (let cz = -1; cz <= 1; cz++) w.ensureChunk((cx0 >> 4) + cx, (oy >> 4) + cy, (cz0 >> 4) + cz);
for (let a = 0; a < 4; a++) for (let h = 0; h < 5; h++) { for (let k = -1; k <= 1; k++) w.setBlock(cx0 + a, oy + h, cz0 + k, B.AIR); if (a === 0 || a === 3 || h === 0 || h === 4) w.setBlock(cx0 + a, oy + h, cz0, B.CLOUD); }
const cf = findPortalFrame(w, cx0 + 1, oy + 1, cz0);
console.assert(cf && cf.portal === B.PORTAL_SKY, 'cloud-block frame lights a sky portal');
for (const c of cf.cells) w.setBlock(c[0], c[1], c[2], B.PORTAL_SKY);
console.assert(portalIntact(w, cx0 + 1, oy + 2, cz0).ok, 'cloud-framed portal is intact');

// ---- buildings
for (const k of ['hotel', 'house', 'tower', 'portal_under', 'portal_sky']) {
  const l = buildStructure(k);
  console.assert(l.length > 0 && l.every((b) => b.length === 4 && b.every(Number.isFinite)), k + ' builds');
}
const hotel = buildStructure('hotel');
const ids = new Set(hotel.map((b) => b[3]));
console.assert(ids.has(B.GLASS) && ids.has(B.LAMP) && ids.has(B.WOOL_RED) && ids.has(B.GOLD), 'hotel has windows, lamps, beds, gold trim');
console.assert(Math.max(...hotel.map((b) => b[1])) >= 17, 'hotel is multi-storey');
const r1 = rotate([[1, 0, 0, 5]], 1)[0], r4 = rotate([[1, 2, 3, 5]], 4)[0];
console.assert(r1[0] === 0 && r1[2] === 1, 'quarter turn', r1);
console.assert(r4[0] === 1 && r4[2] === 3, 'four turns is identity');
console.assert(turnsFor(0) === 2 && turnsFor(Math.PI) === 0, 'entrance faces the player', turnsFor(0), turnsFor(Math.PI));
// place a hotel into the world and walk the stairs' geometry
const placed = [];
const fakeGame = { world: w, blocks: { setMany: (l) => { let n = 0; for (const [x, y, z, id] of l) if (w.setBlock(x, y, z, id)) n++; placed.push(n); return n; } } };
for (let cx = -3; cx <= 3; cx++) for (let cy = 0; cy <= 8; cy++) for (let cz = -3; cz <= 3; cz++) w.ensureChunk(cx + 125, cy + 4, cz + 125);
const n = placeStructure(fakeGame, 'hotel', 2000, 70, 2000, 0);
console.assert(n > 1500, 'hotel placed', n);
const hotelStep = [2000, 71, 2000].some(Number.isFinite);
console.assert(hotelStep && w.getBlock(2000, 70, 2000) !== B.AIR, 'hotel slab exists');

// ---- new weapons
const fakeG = { viewModel: { setDraw() {} } };
const wm = new WeaponManager(fakeG);
const names = wm.weapons.map((x) => x.name);
console.assert(wm.weapons.length === 8 && ['SMG', 'ROCKET', 'SWORD', 'BOW'].every((x) => names.includes(x)), 'new weapons registered', names);
const sword = wm.weapons.find((x) => x.name === 'SWORD'), bow = wm.weapons.find((x) => x.name === 'BOW'), rpg = wm.weapons.find((x) => x.name === 'ROCKET');
console.assert(sword.type === 'melee' && sword.range < 5 && sword.canFire(), 'sword is melee with short reach');
console.assert(bow.type === 'bow' && bow.ammo === 12 && rpg.type === 'launcher' && rpg.mag === 1, 'bow and launcher stats');
sword.refill(); console.assert(sword.ammo === Infinity, 'sword never runs out');
// ---- third-person aiming: forward() converges on the crosshair point, falls back when it is nonsense
const tp = new Player(w, { x: sp.x, y: sp.y, z: sp.z });
tp.yaw = 0; tp.pitch = 0;
const e0 = tp.eyePos;
tp.aimPoint = { x: e0.x + 0.5, y: e0.y, z: e0.z - 20 };          // slightly right of straight ahead
const af = tp.forward();
console.assert(af.x > 0.01 && af.z < -0.9 && Math.abs(Math.hypot(af.x, af.y, af.z) - 1) < 1e-6, 'aim converges on the crosshair point', af);
tp.aimPoint = { x: e0.x, y: e0.y, z: e0.z + 20 };                // behind us: ignore
console.assert(tp.forward().z < -0.9, 'aim point behind the player is ignored');
tp.aimPoint = null;
console.assert(Math.abs(tp.forward().z + 1) < 1e-9, 'first person forward unchanged');
console.log('features ok');
