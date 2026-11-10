import { VoxelBody } from '../player/VoxelBody.js';
import { makeHumanoid, animateHumanoid } from '../player/Humanoid.js';
import { makeBubble } from './Models.js';
import { JUMP_SPEED } from '../core/Constants.js';
import { roleFor, TRADERS } from '../survival/Survival.js';

const SHIRTS = [0x8a5a3a, 0x4a7a4a, 0x6a4a8a, 0x9a8a3a, 0x3a6a8a];
const GREET = ['Hello, traveler!', 'Lovely day, isn\'t it?', 'Mind the soldiers out there.', 'Fresh water in the well!', 'Welcome to our village.', 'Please, no shooting!'];
const WALK = 1.7;

/** Peaceful villager with a daily routine: wanders the village by day, walks home at dusk, sleeps in bed at night. */
export class Villager {
  constructor(game, village, house, idx, asleep) {
    this.game = game; this.village = village; this.house = house; this.kind = 'villager';
    this.id = 'villager-' + house.id;
    this.role = roleFor(this.id); this.name = TRADERS[this.role].name;     // FARMER / BLACKSMITH / EXPLORER: they trade for coins
    const s = asleep ? house.inside : house.doorOut;
    this.body = new VoxelBody(game.world, s.x, village.baseH + 1.01, s.z);
    this.mesh = makeHumanoid(SHIRTS[idx % SHIRTS.length], false);
    this.mesh.rotation.order = 'YXZ';
    this.bubble = makeBubble();
    this.mesh.add(this.bubble.sprite);
    game.scene.add(this.mesh);
    this.hp = 30; this.alive = true; this.gone = false; this.deadT = 0;
    this.yaw = Math.random() * 6.28;
    this.route = []; this.routeKind = ''; this.idleT = 1 + Math.random() * 3;
    this.sleeping = false; this.fleeT = 0; this.fleeFrom = null;
    this.bubbleT = 0; this.sayT = 2; this.stuckT = 0; this.lastX = s.x; this.lastZ = s.z; this.homeT = 0;
  }

  get pos() { return this.body; }
  get radius() { return 0.3; }
  get height() { return 1.8; }

  static isNight(t) { return t >= 0.75 || t < 0.23; }

  takeDamage(amount, attacker, headshot) {
    if (!this.alive) return false;
    this.hp -= amount;
    this.fleeT = 5; this.sleeping = false;
    this.fleeFrom = attacker?.pos ? { x: attacker.pos.x, z: attacker.pos.z } : null;
    this.bubble.set(this.hp > 0 ? 'Help!' : 'Ow...'); this.bubbleT = 2.5;
    if (this.hp <= 0) { this.alive = false; this.game.onKill?.(attacker, this, headshot); return true; }
    return false;
  }

  insideHouse() {
    const b = this.body, h = this.house;
    return Math.abs(b.x - h.inside.x) < 2.6 && Math.abs(b.z - h.inside.z) < 2.6 && Math.abs(b.y - (this.village.baseH + 1)) < 1.5;
  }

  pickWander() {
    const v = this.village;
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * 6.28, r = 3 + Math.random() * 12;
      const x = v.x + Math.cos(a) * r, z = v.z + Math.sin(a) * r;
      if (v.houses.some((h) => Math.abs(x - (h.ox + 3.5)) < 4.8 && Math.abs(z - (h.oz + 3.5)) < 4.8)) continue; // not into a wall
      return { x, z };
    }
    return { x: v.x + 3, z: v.z + 3 };
  }

  update(dt, player, time) {
    if (!this.alive) {
      this.deadT += dt;
      this.mesh.rotation.x = -Math.min(Math.PI / 2, this.deadT * 3);
      if (this.deadT > 4) this.dispose();
      return;
    }
    const b = this.body, h = this.house, night = Villager.isNight(time);
    let speed = 0, face = null;

    if (this.fleeT > 0) {
      this.fleeT -= dt;
      if (this.fleeFrom) this.yaw = Math.atan2(-(b.x - this.fleeFrom.x), -(b.z - this.fleeFrom.z));
      speed = 4.2;
    } else {
      // --- decide what to do from the time of day ---
      const kind = night ? 'home' : 'wander';
      if (kind !== this.routeKind) {
        this.routeKind = kind; this.homeT = 0;
        const home = this.insideHouse();
        this.route = night ? (home ? [] : [h.doorOut, h.inside]) : (home ? [h.doorOut] : []);   // already in bed? stay there
      }
      if (night) {
        this.homeT += dt;
        if (this.homeT > 45 && !this.insideHouse()) {            // stuck somewhere: go straight to bed
          Object.assign(b, { x: h.inside.x, z: h.inside.z, y: this.village.baseH + 1.01, vx: 0, vz: 0, vy: 0 });
        }
      }
      const asleep = night && this.insideHouse() && this.route.length === 0;
      if (asleep !== this.sleeping) {
        this.sleeping = asleep;
        if (asleep) { this.bubble.set('Zzz...'); } else this.bubble.hide();
      }

      if (this.sleeping) { /* lying in bed */ }
      else if (this.route.length) {
        const t = this.route[0];
        const dx = t.x - b.x, dz = t.z - b.z;
        if (Math.hypot(dx, dz) < 0.55) this.route.shift();
        else { this.yaw = Math.atan2(-dx, -dz); speed = WALK; }
      } else if (!night) {
        this.idleT -= dt;
        if (this.idleT <= 0) { this.route = [this.pickWander()]; this.idleT = 2 + Math.random() * 5; }
        else if (player.alive && Math.hypot(player.body.x - b.x, player.body.z - b.z) < 6) face = player.body; // look at the traveler
      }
    }

    // stuck? skip this waypoint (or re-pick) after a second of no progress
    this.stuckT += dt;
    if (this.stuckT > 1.2) {
      if (speed > 0 && Math.hypot(b.x - this.lastX, b.z - this.lastZ) < 0.25 && this.fleeT <= 0) { if (this.route.length > 1 || !night) this.route.shift(); }
      this.stuckT = 0; this.lastX = b.x; this.lastZ = b.z;
    }

    if (face) { const want = Math.atan2(-(face.x - b.x), -(face.z - b.z)); let d = want - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); this.yaw += d * Math.min(1, 6 * dt); }

    const k = Math.min(1, 12 * dt);
    b.vx += (-Math.sin(this.yaw) * speed - b.vx) * k;
    b.vz += (-Math.cos(this.yaw) * speed - b.vz) * k;
    if ((b.blockedX || b.blockedZ) && b.onGround && speed > 0) b.vy = JUMP_SPEED;
    if (b.inWater) b.vy = Math.max(b.vy, 1.6);
    b.step(dt);

    // chat with a nearby player
    this.sayT -= dt;
    if (this.bubbleT > 0) { this.bubbleT -= dt; if (this.bubbleT <= 0 && !this.sleeping) this.bubble.hide(); }
    if (!this.sleeping && this.fleeT <= 0 && this.sayT <= 0 && player.alive && Math.hypot(player.body.x - b.x, player.body.z - b.z, player.body.y - b.y) < 4.5) {
      this.bubble.set(GREET[Math.floor(Math.random() * GREET.length)]); this.bubbleT = 3.2; this.sayT = 9;
    }

    this.mesh.position.set(b.x, b.y + (this.sleeping ? 0.3 : 0), b.z);
    this.mesh.rotation.y = this.yaw + Math.PI;
    this.mesh.rotation.x = this.sleeping ? -Math.PI / 2 : 0;
    if (!this.sleeping) animateHumanoid(this.mesh, dt, Math.hypot(b.vx, b.vz));
  }

  dispose() { this.game.scene.remove(this.mesh); this.gone = true; }
}
