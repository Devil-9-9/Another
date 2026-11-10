import { Survival, RECIPES, TRADERS, dropFor, bk, roleFor, ROLES } from '../src/survival/Survival.js';
import { B, BLOCKS } from '../src/blocks/BlockTypes.js';
import { World } from '../src/blocks/World.js';

const s = new Survival();
// bare hands: nothing at all
console.assert(Object.keys(s.items).length === 0 && s.coins === 0 && s.ownedWeapons().length === 0, 'starts with nothing');
console.assert(!s.craft('wooden_sword') && !s.craft('torch'), 'cannot craft without materials');
// punch a tree: 1 wood, then a sword
s.add(bk(B.WOOD), 1); console.assert(!s.craft('wooden_sword'), '1 wood is not enough for a sword');
s.add(bk(B.WOOD), 1); console.assert(s.craft('wooden_sword') && s.ownedWeapons()[0] === 'wooden_sword' && s.count(bk(B.WOOD)) === 0, 'wooden sword = 2 wood');
console.assert(!s.craft('wooden_sword'), 'only one of each weapon');
// every spec recipe, exact costs
const want = { torch: { b5: 1, coal: 1 }, wooden_sword: { b5: 2 }, stone_sword: { b5: 2, b3: 2 }, iron_sword: { b5: 2, iron: 2 }, bow: { b5: 3, string: 2 }, bed: { b5: 3, wool: 3 }, bike: { b5: 10, iron: 5, wheel: 2 }, car: { iron: 20, b5: 10, wheel: 4, engine: 1 }, rocket: { iron: 10, gunpowder: 5, b5: 2 } };
for (const [k, c] of Object.entries(want)) console.assert(JSON.stringify(RECIPES[k].cost) === JSON.stringify(c), 'recipe ' + k);
const r = new Survival(); r.items = { b5: 10, iron: 5, wheel: 2 }; console.assert(r.craft('bike') && r.count('bike') === 1 && r.count('iron') === 0, 'bike');
const r2 = new Survival(); r2.items = { b5: 10, iron: 20, wheel: 3, engine: 1 }; console.assert(!r2.craft('car'), 'car needs 4 wheels'); r2.add('wheel'); console.assert(r2.craft('car'), 'car');
const r3 = new Survival(); r3.items = { b5: 3, string: 2 }; r3.craft('bow'); console.assert(r3.count('bow') === 1 && r3.ammo.bow > 0, 'bow + first arrows');
const r4 = new Survival(); r4.items = { iron: 10, gunpowder: 5, b5: 2 }; r4.craft('rocket'); console.assert(r4.ammo.rocket === 3, 'rocket gives ammo');
// trades: exact prices, coins only from breaking/zombies/selling
const t = new Survival(); t.add('wheat', 10); console.assert(t.trade('farmer', 0) === '+5 COINS' && t.coins === 5 && t.count('wheat') === 0, 'sell 10 wheat = 5 coins');
console.assert(t.trade('farmer', 0) === null, 'cannot sell wheat you do not have');
console.assert(t.trade('farmer', 1) === null && t.coins === 5, 'bread costs 10, not enough');
t.addCoins(5); console.assert(t.trade('farmer', 1) === 'BOUGHT' && t.count('bread') === 1 && t.coins === 0, 'buy bread = 10');
const prices = { blacksmith: [100, 50, 20], explorer: [15, 5, 3] };
for (const [role, ps] of Object.entries(prices)) ps.forEach((p, i) => console.assert(TRADERS[role].trades[i].price === p, role + ' price ' + i));
const rich = new Survival(); rich.addCoins(1000); rich.trade('blacksmith', 0); rich.trade('blacksmith', 1); rich.trade('blacksmith', 2);
console.assert(rich.count('engine') === 1 && rich.count('iron_sword') === 1 && rich.count('wheel') === 1 && rich.coins === 830, 'blacksmith buys', rich.coins);
console.assert(ROLES.length === 3 && ROLES.includes(roleFor('house-1')) && roleFor('x') === roleFor('x'), 'villager roles are stable');
// drops
console.assert(dropFor(B.WOOD) === 'b5' && dropFor(B.STONE) === 'b3' && dropFor(B.COAL_ORE) === 'coal' && dropFor(B.IRON_ORE) === 'iron' && dropFor(B.LEAVES) === null && dropFor(B.CLOUD) === bk(B.CLOUD), 'drops');
console.assert(dropFor(B.GRASS, () => 0.1) === 'wheat' && dropFor(B.GRASS, () => 0.9) === 'b2', 'grass sometimes gives wheat');
// hunger
const h = new Survival(); let dmg = 0;
for (let i = 0; i < 20000; i++) dmg += h.tick(0.1, false).damage;
console.assert(h.hunger === 0 && dmg > 0, 'starving hurts', dmg);
const e = new Survival(); e.items = { bread: 2 }; e.hunger = 50; const res = e.tick(0.1, false);
console.assert(res.ate === 'bread' && e.hunger > 85 && e.count('bread') === 1, 'auto-eats when hungry');
const f = new Survival(); f.hunger = 56; f.tick(0.1, true); console.assert(f.hunger < 56, 'sprinting costs more');
// death
const d = new Survival(); d.items = { b5: 5, iron: 1, bread: 3 }; d.coins = 500; d.bosses.beast = true; d.wing = true; d.hunger = 3;
d.onDeath(); console.assert(d.coins === 0 && d.count('b5') === 2 && d.count('iron') === 0 && d.count('bread') === 1 && d.hunger === 100, 'death: coins gone, half of each stack gone', JSON.stringify(d.items));
console.assert(d.bosses.beast && d.wing, 'boss progress survives death');
// save round trip + junk
const back = Survival.fromJSON(JSON.parse(JSON.stringify(rich.toJSON())));
console.assert(back.coins === 830 && back.count('engine') === 1, 'save round trip');
const bad = Survival.fromJSON({ items: { hax: 9999, b5: -3, coal: 2.7 }, coins: 'x' }); console.assert(bad.count('hax') === 0 && bad.count('b5') === 0 && bad.count('coal') === 2 && bad.coins === 0, 'junk save ignored');
// ores are seed-driven and exist
const w = new World(4242); const found = new Set();
for (let x = 0; x < 80; x += 1) for (let z = 0; z < 80; z += 1) { const cx = x >> 4, cz = z >> 4; for (let cy = 0; cy < 3; cy++) w.ensureChunk(cx, cy, cz); for (let y = 8; y < 44; y += 2) found.add(w.getBlock(x, y, z)); }
console.assert(found.has(B.COAL_ORE) && found.has(B.IRON_ORE), 'coal and iron ore generate', [...found]);
const w2 = new World(4242); w2.ensureChunk(0, 0, 0); w.ensureChunk(0, 0, 0);
let same = true; for (let i = 0; i < 400; i++) if (w.getBlock(i % 16, (i >> 4) % 16, 3) !== w2.getBlock(i % 16, (i >> 4) % 16, 3)) same = false;
console.assert(same, 'same seed, same ores');
console.assert(BLOCKS[B.TORCH].emissive && BLOCKS[B.BED], 'torch and bed blocks exist');
// ---- step 3: levels, XP, max health
const L = new Survival();
console.assert(L.level === 1 && L.maxHp === 100 && L.xpIntoLevel === 0, 'starts at level 1, 100 HP');
L.addXp(99); console.assert(L.level === 1 && L.xpIntoLevel === 99, '99 XP is still level 1');
L.addXp(1); console.assert(L.level === 2 && L.maxHp === 110 && L.xpIntoLevel === 0, '100 XP = level 2, +10 max health');
L.addXp(300); console.assert(L.level === 5 && L.maxHp === 140, 'level 5 = 140 max health', L.level);
// ---- unlocks: fly is never free
const F = new Survival();
console.assert(!F.canFly(), 'no fly at the start');
F.addXp(400); console.assert(F.level === 5 && !F.canFly(), 'level 5 alone does not unlock fly');
F.items = { iron: 10, gunpowder: 5, b5: 2 }; F.craft('rocket'); console.assert(F.canFly() && F.crafted.rocket, 'level 5 + crafted rocket unlocks fly');
const F2 = new Survival(); F2.items = { iron: 10, gunpowder: 5, b5: 2 }; F2.craft('rocket'); console.assert(!F2.canFly(), 'rocket alone (level 1) does not unlock fly');
const F3 = new Survival(); F3.wing = true; console.assert(F3.canFly(), 'the Dragon Wing unlocks fly');
const F4 = Survival.fromJSON(JSON.parse(JSON.stringify(F.toJSON()))); console.assert(F4.canFly() && F4.level === 5, 'unlock survives save/load');
const F5 = new Survival(); F5.addXp(400); F5.onDeath(); console.assert(F5.level === 5, 'dying keeps your level and XP');
console.assert(!new Survival().craft('car') && !new Survival().craft('bike') && !new Survival().craft('rocket'), 'no vehicle or rocket without parts');
const V = new Survival(); V.items = { b5: 10, iron: 20, wheel: 4, engine: 1 };
console.assert(V.craft('car') && !V.craft('car'), 'car needs wheels and an engine, which only villagers sell');
console.log('survival ok');
