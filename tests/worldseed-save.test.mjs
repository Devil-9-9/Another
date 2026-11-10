// Step 1: 128-bit world seeds, per-seed/per-mode saves, creative rules.
import { generateWorldSeed, normalizeSeed, numericSeed } from '../src/core/WorldSeed.js';
import { packEdits, unpackEdits, writeSave, readSave, lastPlayed, savedSeeds, saveKey } from '../src/core/SaveGame.js';
import { World } from '../src/blocks/World.js';
import { Player } from '../src/player/Player.js';
import { InputState } from '../src/controls/InputState.js';

const FMT = /^([0-9a-f]{4}-){7}[0-9a-f]{4}$/;

// ---- generation: format, uniqueness, avoid-list
const seen = new Set();
for (let i = 0; i < 20000; i++) { const s = generateWorldSeed({ extra: 'BO-TEST-0001' }); if (!FMT.test(s)) throw new Error('bad format ' + s); seen.add(s); }
console.assert(seen.size === 20000, 'no duplicate among 20000 new seeds', seen.size);
const first = generateWorldSeed();
console.assert(generateWorldSeed({ avoid: [first] }) !== first, 'avoid list respected');
// every bit position varies (a stuck bit would shrink the 128 bits)
const hex = [...seen].slice(0, 2000).map((s) => s.replace(/-/g, ''));
for (let pos = 0; pos < 32; pos++) { const d = new Set(hex.map((h) => h[pos])); console.assert(d.size >= 14, 'hex digit ' + pos + ' is random', d.size); }

// ---- normalising what a player types
const s0 = 'a3f9-8c21-4b7d-9e12-7f8a-1b2c-3d4e-5f60';
console.assert(normalizeSeed(s0) === s0, 'valid seed unchanged');
console.assert(normalizeSeed('A3F98C214B7D9E127F8A1B2C3D4E5F60') === s0, 'no dashes + upper case accepted');
console.assert(normalizeSeed('A3F9 8C21 4B7D 9E12 7F8A 1B2C 3D4E 5F60') === s0, 'spaces and case ignored');
console.assert(normalizeSeed('a3f9-8c21-4b7d-9e12-7f8a1b2c3d4e') === null, 'the old 28-digit (112-bit) shape is rejected');
console.assert(normalizeSeed('zzzz-8c21-4b7d-9e12-7f8a-1b2c-3d4e-5f60') === null && normalizeSeed(42) === null && normalizeSeed('') === null, 'junk rejected');

// ---- same seed text = same world; different seeds differ; every bit counts
console.assert(numericSeed(s0) === numericSeed(s0.toUpperCase().replace(/-/g, '')), 'same seed, same number');
console.assert(numericSeed(s0) !== numericSeed('a3f9-8c21-4b7d-9e12-7f8a-1b2c-3d4e-5f61'), 'one changed digit changes the number');
const nums = new Set([...seen].slice(0, 5000).map(numericSeed));
console.assert(nums.size > 4990, 'terrain numbers are well spread', nums.size);
const heights = (seed) => { const w = new World(numericSeed(seed)); const out = []; for (let i = 0; i < 40; i++) out.push(w.heightAt(i * 13, i * 7)); return out.join(','); };
console.assert(heights(s0) === heights(s0), 'same seed generates the same terrain');
console.assert(heights(s0) !== heights([...seen][5]), 'different seeds generate different terrain');

// ---- saves
const mem = { d: {}, get length() { return Object.keys(this.d).length; }, key(i) { return Object.keys(this.d)[i]; },
  getItem(k) { return k in this.d ? this.d[k] : null; }, setItem(k, v) { this.d[k] = String(v); }, removeItem(k) { delete this.d[k]; } };
const edits = new Map([['1,2,3', 5], ['-4,70,9', 0], ['100,-20,-7', 21]]);
const packed = packEdits(edits);
console.assert(JSON.stringify(unpackEdits(packed)) === JSON.stringify([[1, 2, 3, 5], [-4, 70, 9, 0], [100, -20, -7, 21]]), 'edits round-trip');
console.assert(unpackEdits([1, 2, 3, 999, 'x', 1, 1, 1]).length === 0, 'bad edit ids / junk dropped');
const data = { player: { x: 1.5, y: 70, z: -3, yaw: 1, pitch: 0.2, hp: 80 }, hotbar: [9, 7, 'veh:jeep'], slot: 2, edits: packed };
console.assert(writeSave(mem, s0, 'creative', data).ok, 'save written');
const back = readSave(mem, s0, 'creative');
console.assert(back && back.player.x === 1.5 && back.hotbar[2] === 'veh:jeep' && back.slot === 2 && back.edits.length === 12, 'save reads back');
console.assert(readSave(mem, s0, 'survival') === null, 'creative save never leaks into survival');
console.assert(readSave(mem, first, 'creative') === null, 'other seed has no save');
console.assert(readSave(mem, s0.toUpperCase(), 'creative') !== null, 'seed typed in capitals finds the same save');
const l = lastPlayed(mem); console.assert(l && l.seed === s0 && l.mode === 'creative', 'last played remembered');
console.assert(savedSeeds(mem).includes(s0), 'saved seeds listed');
mem.d[saveKey(s0, 'survival')] = '{not json'; console.assert(readSave(mem, s0, 'survival') === null, 'corrupt save ignored');
const full = { getItem: () => null, setItem: () => { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; } };
console.assert(writeSave(full, s0, 'creative', data).error === 'storage full', 'storage full reported, not thrown');
console.assert(writeSave(null, s0, 'creative', data).ok === false, 'blocked storage reported');

// ---- creative: no damage, cannot die, flying allowed; survival: damage, no flying
const w = new World(1337); const sp = w.findLandSpawn(0, 0);
for (let cx = -2; cx <= 2; cx++) for (let cz = -2; cz <= 2; cz++) for (let cy = -2; cy <= 8; cy++) w.ensureChunk((Math.floor(sp.x) >> 4) + cx, cy, (Math.floor(sp.z) >> 4) + cz);
const c = new Player(w, sp); c.invulnerable = true; c.canFly = true;
c.takeDamage(500, null); console.assert(c.hp === 100 && c.alive, 'creative player takes no damage');
c.setFlying(true); console.assert(c.flying, 'creative can fly');
const sv = new Player(w, sp); sv.invulnerable = false; sv.canFly = false;
sv.setFlying(true); console.assert(!sv.flying, 'survival cannot fly');
sv.takeDamage(30, null); console.assert(sv.hp === 70, 'survival takes damage', sv.hp);
sv.takeDamage(500, null); console.assert(!sv.alive, 'survival player can die');
console.log('worldseed-save ok');
