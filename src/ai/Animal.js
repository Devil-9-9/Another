import { VoxelBody } from '../player/VoxelBody.js';
import { isSolid } from '../blocks/BlockTypes.js';
import { ANIMALS, makeQuadruped, swingLegs } from './Models.js';

let uid = 0;

/** Cow / pig / sheep / chicken: wanders, avoids water and cliffs, runs when hurt. Shoot one for +10 HP. */
export class Animal {
  constructor(game, kind, x, y, z) {
    this.game = game; this.kind = kind; this.cfg = ANIMALS[kind];
    this.name = kind.toUpperCase(); this.id = 'animal-' + (uid++);
    this.body = new VoxelBody(game.world, x, y, z, this.cfg.w * 0.5, this.cfg.h);
    this.mesh = makeQuadruped(kind);
    game.scene.add(this.mesh);
    this.hp = this.cfg.hp; this.alive = true; this.gone = false; this.deadT = 0;
    this.yaw = Math.random() * 6.28; this.timer = Math.random() * 3; this.moving = false;
    this.fleeT = 0; this.fleeFrom = null;
  }

  get pos() { return this.body; }
  get radius() { return this.cfg.w; }
  get height() { return this.cfg.h; }

  takeDamage(amount, attacker, headshot) {
    if (!this.alive) return false;
    this.hp -= amount;
    this.fleeT = 4;
    this.fleeFrom = attacker?.pos ? { x: attacker.pos.x, z: attacker.pos.z } : null;
    if (this.hp <= 0) { this.alive = false; this.game.onKill?.(attacker, this, headshot); return true; }
    return false;
  }

  hazardAhead() {
    const b = this.body, w = this.game.world;
    const ax = b.x - Math.sin(this.yaw) * 0.9, az = b.z - Math.cos(this.yaw) * 0.9;
    if (w.fluidAt(ax, b.y + 0.2, az)) return true;                                  // water or lava
    return !isSolid(w.getBlock(ax, b.y - 0.5, az)) && !isSolid(w.getBlock(ax, b.y - 1.5, az)); // drop of 2+
  }

  update(dt) {
    if (!this.alive) {
      this.deadT += dt;
      this.mesh.rotation.z = Math.min(Math.PI / 2, this.deadT * 4);
      if (this.deadT > 3) this.dispose();
      return;
    }
    const b = this.body;
    let speed = 0;
    if (this.fleeT > 0) {
      this.fleeT -= dt;
      if (this.fleeFrom) this.yaw = Math.atan2(-(b.x - this.fleeFrom.x), -(b.z - this.fleeFrom.z));
      speed = this.cfg.speed * 2.6;
    } else {
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.moving) { this.moving = false; this.timer = 1.5 + Math.random() * 3.5; }
        else { this.moving = true; this.yaw += (Math.random() - 0.5) * 3.2; this.timer = 2 + Math.random() * 3; }
      }
      speed = this.moving ? this.cfg.speed * 0.8 : 0;
    }
    if (speed > 0 && this.hazardAhead()) { this.yaw += Math.PI * (0.6 + Math.random() * 0.4); speed = 0; }

    const k = Math.min(1, 10 * dt);
    b.vx += (-Math.sin(this.yaw) * speed - b.vx) * k;
    b.vz += (-Math.cos(this.yaw) * speed - b.vz) * k;
    if ((b.blockedX || b.blockedZ) && b.onGround && speed > 0) b.vy = 4.6;   // hop up a block
    if (b.inWater) b.vy = Math.max(b.vy, 1.4);                                // never drown: paddle to the surface
    b.step(dt);

    this.mesh.position.set(b.x, b.y, b.z);
    this.mesh.rotation.y = this.yaw + Math.PI;
    swingLegs(this.mesh, dt, Math.hypot(b.vx, b.vz));
  }

  dispose() { this.game.scene.remove(this.mesh); this.gone = true; }
}
