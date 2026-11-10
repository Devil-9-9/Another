import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }), getElementById: () => null };
const { World } = await import('../src/blocks/World.js');
const { Mob, MobManager, MOBS } = await import('../src/ai/Mob.js');
const { BossManager } = await import('../src/ai/Bosses.js');
const { Player } = await import('../src/player/Player.js');
const { Survival } = await import('../src/survival/Survival.js');
const { InputState } = await import('../src/controls/InputState.js');
const { WoodenSword, StoneSword, IronSword, Fists } = await import('../src/weapons/Melee.js');

const w = new World(1337); const sp = w.findLandSpawn(0, 0);
for (let cx = -4; cx <= 4; cx++) for (let cz = -4; cz <= 4; cz++) for (let cy = -1; cy <= 6; cy++) w.ensureChunk((Math.floor(sp.x) >> 4) + cx, cy, (Math.floor(sp.z) >> 4) + cz);

// a flat stone arena, so terrain never decides these tests
const { B } = await import('../src/blocks/BlockTypes.js');
const FY = Math.floor(sp.y) + 6, AX = Math.floor(sp.x), AZ = Math.floor(sp.z);
for (let x = AX - 30; x <= AX + 30; x++) for (let z = AZ - 30; z <= AZ + 30; z++) { for (let y = FY - 4; y < FY; y++) w.setBlock(x, y, z, B.STONE); for (let y = FY; y < FY + 8; y++) w.setBlock(x, y, z, B.AIR); }
const spawned = [], blasts = [], kills = [];
const mkGame = (time, torch = false) => ({
  world: w, scene: { add() {}, remove() {} }, daynight: { time }, sv: null, torches: torch ? [{ x: sp.x, y: sp.y, z: sp.z }] : [],
  torchNear(x, y, z, r) { return this.torches.some((t) => (t.x - x) ** 2 + (t.y - y) ** 2 + (t.z - z) ** 2 <= r * r); },
  effects: { explosion() {} }, audio: { play() {}, playAt() {} }, hud: { toast() {}, setBoss() {}, hitmarker() {} },
  projectiles: { spawn: (o) => spawned.push(o) }, blocks: { explode: (...a) => blasts.push(a) }, onKill: (a, v) => kills.push(v.name), shake: 0,
});
const mkPlayer = (invulnerable = false) => { const p = new Player(w, { x: AX + 0.5, y: FY, z: AZ + 0.5 }); p.invulnerable = invulnerable; return p; };
const run = (game, mob, player, secs, night) => { for (let t = 0; t < secs; t += 1 / 30) { if (mob.alive) mob.update(1 / 30, player, night); } };
const placeNear = (game, kind, dist, player) => { const m = new Mob(game, kind, player.body.x + dist, player.body.z); Object.assign(m.body, { x: player.body.x + dist, y: FY, z: player.body.z, vx: 0, vy: 0, vz: 0 }); return m; };

// ---- stats from the spec, the same in both modes (one Mob class)
console.assert(MOBS.zombie.hp === 20 && MOBS.zombie.dmg === 5 && MOBS.skeleton.hp === 15 && MOBS.skeleton.dmg === 4 && MOBS.spider.hp === 15 && MOBS.spider.dmg === 3 && MOBS.creeper.hp === 20 && MOBS.creeper.dmg === 12, 'mob stats match the spec');
console.assert(MOBS.zombie.day < MOBS.zombie.night && MOBS.spider.day < MOBS.spider.night, 'fast at night, slow by day');
console.assert(MOBS.creeper.blast <= 2, 'creeper blast is small');

// ---- DAY: peaceful. They walk around, never attack, never damage.
for (const kind of ['zombie', 'skeleton', 'spider', 'creeper']) {
  const g = mkGame(0.5), p = mkPlayer(), m = placeNear(g, kind, 1.2, p);
  const hp0 = p.hp; run(g, m, p, 20, false);
  console.assert(p.hp === hp0 && !m.aggro && spawned.length === 0 && blasts.length === 0, 'day: ' + kind + ' is harmless', p.hp);
}
// ---- NIGHT: the same mobs hunt
{ const g = mkGame(0.9), p = mkPlayer(), m = placeNear(g, 'zombie', 12, p);
  run(g, m, p, 12, true); console.assert(m.aggro && p.hp < 100 && (100 - p.hp) % 5 === 0, 'night: zombie attacks for 5 per hit', p.hp); }
{ const g = mkGame(0.9), p = mkPlayer(), m = placeNear(g, 'spider', 10, p);
  run(g, m, p, 8, true); console.assert(p.hp < 100 && (100 - p.hp) % 3 === 0, 'night: spider bites for 3', p.hp); }
{ spawned.length = 0; const g = mkGame(0.9), p = mkPlayer(), m = placeNear(g, 'skeleton', 12, p);
  run(g, m, p, 8, true); console.assert(spawned.length >= 1 && spawned[0].kind === 'arrow' && spawned[0].damage === 4 && spawned[0].owner === m, 'night: skeleton shoots 4-damage arrows'); }
{ blasts.length = 0; const g = mkGame(0.9), p = mkPlayer(), m = placeNear(g, 'creeper', 10, p);
  run(g, m, p, 10, true); console.assert(blasts.length === 1 && !m.alive && p.hp <= 88 && p.hp >= 80, 'night: creeper explodes for ~12', p.hp); }
// ---- creative player: same mobs, no damage, cannot die
{ const g = mkGame(0.9), p = mkPlayer(true), m = placeNear(g, 'zombie', 3, p);
  run(g, m, p, 20, true); console.assert(m.aggro && p.hp === 100 && p.alive, 'creative: zombie hunts but cannot hurt'); }
// ---- torch keeps them calm at night
{ const g = mkGame(0.9, true), p = mkPlayer(), m = placeNear(g, 'zombie', 8, p);
  run(g, m, p, 15, true); console.assert(!m.aggro && p.hp === 100, 'a torch next to you calms the night'); }
// ---- killing
{ const g = mkGame(0.5), m = placeNear(g, 'zombie', 5, mkPlayer()); kills.length = 0;
  const hits = (W) => { const mm = placeNear(g, 'zombie', 5, mkPlayer()); let n = 0; while (mm.alive && n < 50) { mm.takeDamage(new W().damage, null, false); n++; } return n; };
  console.assert(hits(WoodenSword) === 4 && hits(StoneSword) === 3 && hits(IronSword) === 2 && hits(Fists) === 7, 'wooden sword kills a zombie in 4 hits (3-4 spec), stone 3, iron 2, hands 7');
  console.assert(MOBS.zombie.hp === 20 && new WoodenSword().damage * 4 >= 20, 'killable with 3-4 hits'); }

// ---- spawner: mobs appear in day and night, only on the surface, not next to torches
{ const g = mkGame(0.5); g.daynight = { time: 0.5 }; const mm = new MobManager(g), p = mkPlayer();
  for (let i = 0; i < 400; i++) mm.update(0.5, p); console.assert(mm.list.length > 0 && mm.list.length <= 8, 'mobs spawn by day too', mm.list.length);
  const g2 = mkGame(0.9); const m2 = new MobManager(g2), p2 = mkPlayer(); p2.body.y = -60;
  for (let i = 0; i < 100; i++) m2.update(0.5, p2); console.assert(m2.list.length === 0, 'no surface mobs underground'); }

// ---- bosses
{ const g = mkGame(0.5); g.sv = new Survival(); g.player = mkPlayer(); const bm = new BossManager(g);
  bm.spawn('beast', { x: sp.x + 8, y: sp.y, z: sp.z });
  const beast = bm.list[0]; console.assert(beast.hp === 800 && bm.targets.length === 1, 'beast has 800 HP');
  const p = g.player; Object.assign(beast.body, { x: p.body.x + 1.5, y: p.body.y, z: p.body.z }); const hp0 = p.hp;
  beast.update(1 / 30, p); console.assert(hp0 - p.hp === 12, 'beast hits for 12', hp0 - p.hp);
  beast.takeDamage(799, p, false); console.assert(beast.alive && g.sv.coins === 0, 'still alive at 1 HP');
  beast.takeDamage(5, p, false); console.assert(!beast.alive && g.sv.coins === 1000 && g.sv.xp === 200 && g.sv.count('underworld_key') === 1 && g.sv.bosses.beast, 'beast pays out: key, 1000 coins, 200 XP');
  bm.spawn('beast', { x: 0, y: 0, z: 0 }); console.assert(bm.list.length === 0, 'a beaten boss does not come back'); }
{ const g = mkGame(0.5); g.sv = new Survival(); g.player = mkPlayer(); g.player.canFly = false; const bm = new BossManager(g);
  bm.spawn('dragon', { x: sp.x, y: sp.y + 50, z: sp.z });
  const d = bm.list[0]; console.assert(d.heads.length === 9 && d.heads.every((h) => h.hp === 100) && bm.targets.length === 9, 'nine heads of 100 HP');
  console.assert(new Set(d.heads.map((h) => h.el.id)).size === 9 && ['fire', 'water', 'earth', 'air', 'lightning', 'ice', 'poison', 'dark', 'light'].every((e) => d.heads.some((h) => h.el.id === e)), 'nine different elements');
  d.heads[0].takeDamage(100, g.player, false); console.assert(bm.targets.length === 8 && Math.abs(d.frac - 800 / 900) < 1e-9, 'killing a head removes its target');
  console.assert(!g.sv.wing, 'no wing until all heads are dead');
  for (const h of d.heads) h.takeDamage(100, g.player, false);
  console.assert(d.done && g.sv.wing && g.player.canFly && g.sv.coins === 1000 && g.sv.xp === 500 && g.sv.count('sky_key') === 1 && g.sv.bosses.dragon, 'dragon pays out: key, 1000 coins, 500 XP, Dragon Wing'); }
{ const g = mkGame(0.5); g.sv = null; g.player = mkPlayer(); const bm = new BossManager(g); bm.spawn('beast', { x: 0, y: 0, z: 0 }); console.assert(bm.list.length === 0, 'bosses are survival only'); }
console.log('mobs-bosses ok');
