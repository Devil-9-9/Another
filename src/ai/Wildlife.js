import { SEA } from '../core/Constants.js';
import { B, isSolid } from '../blocks/BlockTypes.js';
import { ANIMALS } from './Models.js';
import { Animal } from './Animal.js';
import { Fish } from './Fish.js';
import { Villager } from './Villager.js';

const MAX_ANIMALS = 14, MAX_FISH = 12;
const KINDS = Object.entries(ANIMALS).flatMap(([k, c]) => Array(c.weight).fill(k));

/** Keeps the world alive around the player: farm animals on land, fish in the sea and lakes, villagers in every village. */
export class Wildlife {
  constructor(game) {
    this.game = game;
    this.animals = []; this.fish = []; this.villagers = new Map();
    this.deadAt = new Map();      // house id -> when its villager died (they come back after a while)
    this.clock = 0; this.t = 0;
  }

  all() { return [...this.animals, ...this.fish, ...this.villagers.values()]; }
  getTargets() { return this.all().filter((c) => c.alive); }

  dispose() { for (const c of this.all()) c.dispose(); this.animals = []; this.fish = []; this.villagers.clear(); }

  update(dt, player, time) {
    this.clock += dt;
    for (const a of this.animals) a.update(dt, player);
    for (const f of this.fish) f.update(dt, player);
    for (const v of this.villagers.values()) v.update(dt, player, time);
    this.animals = this.animals.filter((a) => !a.gone);
    this.fish = this.fish.filter((f) => !f.gone);
    for (const [id, v] of this.villagers) {
      if (!v.gone) continue;
      if (!v.alive) this.deadAt.set(id, this.clock);   // a killed villager is replaced only after a mourning period
      this.villagers.delete(id);
    }

    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.8;
    this.manage(player, time);
  }

  manage(player, time) {
    const w = this.game.world, b = player.body;
    const far = (x, z, r) => Math.hypot(x - b.x, z - b.z) > r;

    // despawn what we've left behind
    for (const a of this.animals) if (far(a.body.x, a.body.z, 110)) a.dispose();
    for (const f of this.fish) if (far(f.cx, f.cz, 90)) f.dispose();
    for (const [id, v] of this.villagers) if (far(v.body.x, v.body.z, 150)) { v.dispose(); this.villagers.delete(id); }

    if (b.y < -20 || b.y > 100) return;          // only populate the overworld surface

    // farm animals on dry land
    for (let tries = 0; tries < 3 && this.animals.length < MAX_ANIMALS; tries++) {
      const ang = Math.random() * 6.28, d = 28 + Math.random() * 42;
      const x = Math.floor(b.x + Math.cos(ang) * d), z = Math.floor(b.z + Math.sin(ang) * d);
      const h = w.heightAt(x, z);
      if (h < SEA + 2) continue;
      w.ensureChunk(x >> 4, (h + 1) >> 4, z >> 4); w.ensureChunk(x >> 4, h >> 4, z >> 4);
      if (isSolid(w.getBlock(x, h + 1, z)) || isSolid(w.getBlock(x, h + 2, z)) || !isSolid(w.getBlock(x, h, z))) continue; // tree / house
      this.animals.push(new Animal(this.game, KINDS[Math.floor(Math.random() * KINDS.length)], x + 0.5, h + 1.01, z + 0.5));
    }

    // fish in any water deep enough to swim in
    for (let tries = 0; tries < 4 && this.fish.length < MAX_FISH; tries++) {
      const ang = Math.random() * 6.28, d = 8 + Math.random() * 40;
      const x = Math.floor(b.x + Math.cos(ang) * d), z = Math.floor(b.z + Math.sin(ang) * d);
      const h = w.heightAt(x, z);
      if (h > SEA - 3) continue;
      const y = h + 1.5 + Math.random() * Math.max(0.5, SEA - h - 2.5);
      w.ensureChunk(x >> 4, Math.floor(y) >> 4, z >> 4);
      if (w.fluidAt(x, y, z) === B.WATER && w.fluidAt(x, y + 0.5, z) === B.WATER) this.fish.push(new Fish(this.game, x + 0.5, y, z + 0.5));
    }

    // one villager per house, in every village near enough to matter
    for (const v of w.villages.near(b.x, b.z, 90)) {
      v.houses.forEach((house, i) => {
        if (this.villagers.has(house.id)) return;
        if (this.deadAt.has(house.id) && this.clock - this.deadAt.get(house.id) < 60) return;   // mourning period
        const hx = Math.floor(house.inside.x), hz = Math.floor(house.inside.z);
        w.ensureChunk(hx >> 4, (v.baseH + 1) >> 4, hz >> 4);
        this.villagers.set(house.id, new Villager(this.game, v, house, i, Villager.isNight(time)));
        this.deadAt.delete(house.id);
      });
    }
  }
}
