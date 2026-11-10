// Hardcore survival rules. Pure logic (no rendering) so it is unit-tested in Node.
// Inventory keys: 'b<id>' for blocks (b5 = Wood log, b3 = Stone ...) and plain names for everything else ('coal', 'iron', 'bread' ...).
import { B } from '../blocks/BlockTypes.js';

export const bk = (id) => 'b' + id;
export const isBlockKey = (k) => /^b\d+$/.test(k);
export const blockOf = (k) => Number(k.slice(1));

export const ITEM_NAMES = {
  coal: 'Coal', iron: 'Iron', wheat: 'Wheat', bread: 'Bread', meat: 'Raw Meat', wool: 'Wool', string: 'String', gunpowder: 'Gunpowder',
  wheel: 'Wheel', engine: 'Engine', wooden_sword: 'Wooden Sword', stone_sword: 'Stone Sword', iron_sword: 'Iron Sword', bow: 'Bow', rocket: 'Rocket',
  bike: 'Bike', car: 'Car', underworld_key: 'Underworld Key', sky_key: 'Sky Key',
};
export const WEAPON_ITEMS = ['wooden_sword', 'stone_sword', 'iron_sword', 'bow', 'rocket'];
export const FOOD = { bread: 40, meat: 25 };          // hunger restored (hunger runs 0..100)

/** Recipes. Wood = b5 (log), Stone = b3, Wool/Wheel/Engine/String/Gunpowder come from mobs, animals and villagers. */
export const RECIPES = {
  torch:         { label: 'Torch',        cost: { b5: 1, coal: 1 }, give: { b34: 1 } },
  wooden_sword:  { label: 'Wooden Sword', cost: { b5: 2 }, give: { wooden_sword: 1 } },
  stone_sword:   { label: 'Stone Sword',  cost: { b5: 2, b3: 2 }, give: { stone_sword: 1 } },
  iron_sword:    { label: 'Iron Sword',   cost: { b5: 2, iron: 2 }, give: { iron_sword: 1 } },
  bow:           { label: 'Bow',          cost: { b5: 3, string: 2 }, give: { bow: 1 } },
  bed:           { label: 'Bed',          cost: { b5: 3, wool: 3 }, give: { b35: 1 } },
  bike:          { label: 'Bike',         cost: { b5: 10, iron: 5, wheel: 2 }, give: { bike: 1 } },
  car:           { label: 'Car',          cost: { iron: 20, b5: 10, wheel: 4, engine: 1 }, give: { car: 1 } },
  rocket:        { label: 'Rocket',       cost: { iron: 10, gunpowder: 5, b5: 2 }, give: { rocket: 1 } },
};
export const ROCKETS_PER_CRAFT = 3;                    // one Rocket craft = launcher + 3 rockets (more crafts add 3 each)
export const ARROWS_FIRST_BOW = 24;

/** Villager traders. sell = you give items, get coins. buy = you pay coins, get items. */
export const TRADERS = {
  farmer:     { name: 'FARMER',     trades: [
    { label: 'Sell 10 Wheat', give: { wheat: 10 }, coins: 5 },
    { label: 'Buy 1 Bread', price: 10, get: { bread: 1 } } ] },
  blacksmith: { name: 'BLACKSMITH', trades: [
    { label: 'Buy 1 Engine', price: 100, get: { engine: 1 } },
    { label: 'Buy 1 Iron Sword', price: 50, get: { iron_sword: 1 } },
    { label: 'Buy 1 Wheel', price: 20, get: { wheel: 1 } } ] },
  explorer:   { name: 'EXPLORER',   trades: [
    { label: 'Buy 1 Gunpowder', price: 15, get: { gunpowder: 1 } },
    { label: 'Buy 1 String', price: 5, get: { string: 1 } },
    { label: 'Buy 1 Coal', price: 3, get: { coal: 1 } } ] },
};
export const ROLES = Object.keys(TRADERS);
export function roleFor(id) { let h = 0; for (let i = 0; i < String(id).length; i++) h = (h * 31 + String(id).charCodeAt(i)) | 0; return ROLES[Math.abs(h) % ROLES.length]; }

/** What breaking a block gives you (null = nothing). Everything else drops itself. */
export function dropFor(id, rnd = Math.random) {
  switch (id) {
    case B.GRASS: return rnd() < 0.2 ? 'wheat' : bk(B.DIRT);     // seeds in the grass: the farmer buys wheat
    case B.LEAVES: case B.GLASS: case B.WATER: case B.LAVA: case B.BEDROCK: case B.PORTAL_UNDER: case B.PORTAL_SKY: return null;
    case B.STONE: return bk(B.STONE);
    case B.COAL_ORE: return 'coal';
    case B.IRON_ORE: case B.METAL: return 'iron';
    default: return bk(id);
  }
}

export class Survival {
  constructor() {
    this.items = {}; this.coins = 0; this.hunger = 100; this.xp = 0;
    this.crafted = {};                   // recipes you have crafted at least once (the Rocket counts toward the Level 5 fly unlock)
    this.bosses = {};                    // { beast: true, dragon: true } once beaten
    this.wing = false;                   // Dragon Wing: permanent fly
    this.ammo = { bow: 0, rocket: 0 };   // total arrows / rockets (in magazine + reserve)
    this.starveT = 0; this.dirty = true;
  }

  count(k) { return this.items[k] || 0; }
  add(k, n = 1) { if (n > 0) { this.items[k] = this.count(k) + n; this.dirty = true; } }
  take(k, n = 1) { if (this.count(k) < n) return false; this.items[k] -= n; if (this.items[k] <= 0) delete this.items[k]; this.dirty = true; return true; }
  has(cost) { return Object.entries(cost).every(([k, n]) => this.count(k) >= n); }
  pay(cost) { if (!this.has(cost)) return false; for (const [k, n] of Object.entries(cost)) this.take(k, n); return true; }
  addCoins(n) { this.coins += n; this.dirty = true; }
  addXp(n) { this.xp += n; this.dirty = true; }

  /** Level up every 100 XP; every level adds +10 max health. */
  get level() { return Math.floor(this.xp / 100) + 1; }
  get xpIntoLevel() { return this.xp % 100; }
  get maxHp() { return 100 + 10 * (this.level - 1); }

  /** Fly is never free: the Dragon Wing (beat Navraja), or Level 5 AND a crafted Rocket. */
  canFly() { return this.wing || (this.level >= 5 && !!this.crafted.rocket); }
  flyHint() { return this.canFly() ? 'FLY UNLOCKED (Z)' : 'FLY LOCKED: beat Navraja for the Dragon Wing, or reach Level 5 and craft a Rocket'; }

  /** Combat items you own, in loadout order. Hands are always available (the game adds them). */
  ownedWeapons() { return WEAPON_ITEMS.filter((k) => this.count(k) > 0); }

  /** Craft one recipe. Returns false (and takes nothing) if you are short. Weapons are single items; rockets give ammo. */
  craft(id) {
    const r = RECIPES[id];
    if (!r || !this.has(r.cost)) return false;
    if (WEAPON_ITEMS.includes(id) && id !== 'rocket' && this.count(id) > 0) return false;   // you only need one of each weapon
    this.pay(r.cost);
    this.crafted[id] = true;
    for (const [k, n] of Object.entries(r.give)) this.add(k, n);
    if (id === 'bow' && this.ammo.bow === 0) this.ammo.bow = ARROWS_FIRST_BOW;
    if (id === 'rocket') this.ammo.rocket += ROCKETS_PER_CRAFT;
    return true;
  }

  /** Trade with a villager of `role` (index into its list). Returns a message string or null if it failed. */
  trade(role, i) {
    const t = TRADERS[role]?.trades[i];
    if (!t) return null;
    if (t.give) { if (!this.pay(t.give)) return null; this.addCoins(t.coins); return `+${t.coins} COINS`; }
    if (this.coins < t.price) return null;
    this.coins -= t.price; this.dirty = true;
    for (const [k, n] of Object.entries(t.get)) {
      this.add(k, n);
      if (k === 'rocket') this.ammo.rocket += ROCKETS_PER_CRAFT;
    }
    return 'BOUGHT';
  }

  /** Hunger drains; at 0 you slowly lose health. Returns hp damage to apply this tick (0 or 1). Auto-eats when hungry. */
  tick(dt, sprinting) {
    this.hunger = Math.max(0, this.hunger - dt * (sprinting ? 0.2 : 0.07));
    let ate = null;
    if (this.hunger <= 55) ate = this.eat();
    if (this.hunger <= 0) { this.starveT += dt; if (this.starveT >= 4) { this.starveT = 0; return { damage: 1, ate }; } } else this.starveT = 0;
    return { damage: 0, ate };
  }

  eat() {
    for (const k of ['bread', 'meat']) if (this.count(k) > 0) { this.take(k); this.hunger = Math.min(100, this.hunger + FOOD[k]); return k; }
    return null;
  }

  /** Death: all coins gone, half of every stack gone (rounded up). Respawn with hands. Bosses/wing are progress and stay. */
  onDeath() {
    this.coins = 0;
    for (const k of Object.keys(this.items)) { const keep = Math.floor(this.items[k] / 2); if (keep > 0) this.items[k] = keep; else delete this.items[k]; }
    this.hunger = 100; this.starveT = 0; this.dirty = true;
    if (this.count('bow') === 0) this.ammo.bow = 0;
    if (this.count('rocket') === 0) this.ammo.rocket = 0;
  }

  toJSON() { return { items: this.items, coins: this.coins, hunger: this.hunger, xp: this.xp, bosses: this.bosses, wing: this.wing, ammo: this.ammo, crafted: this.crafted }; }
  static fromJSON(j) {
    const s = new Survival();
    if (!j || typeof j !== 'object') return s;
    for (const [k, n] of Object.entries(j.items || {})) if ((isBlockKey(k) || ITEM_NAMES[k]) && Number.isFinite(n) && n > 0) s.items[k] = Math.floor(n);
    for (const f of ['coins', 'xp']) if (Number.isFinite(j[f]) && j[f] >= 0) s[f] = Math.floor(j[f]);
    if (Number.isFinite(j.hunger)) s.hunger = Math.max(0, Math.min(100, j.hunger));
    s.bosses = { beast: !!j.bosses?.beast, dragon: !!j.bosses?.dragon }; s.wing = !!j.wing;
    for (const k of Object.keys(RECIPES)) if (j.crafted?.[k]) s.crafted[k] = true;
    for (const k of ['bow', 'rocket']) if (Number.isFinite(j.ammo?.[k]) && j.ammo[k] >= 0) s.ammo[k] = Math.floor(j.ammo[k]);
    return s;
  }
}
