import { B } from '../blocks/BlockTypes.js';
import { makeFish } from './Models.js';

let uid = 0;

/** Swims around inside water cells only; turns around at the shore, the surface and the seabed. */
export class Fish {
  constructor(game, x, y, z) {
    this.game = game; this.id = 'fish-' + (uid++); this.name = 'FISH'; this.kind = 'fish';
    this.cx = x; this.cy = y; this.cz = z;           // body centre
    this.mesh = makeFish(uid);
    game.scene.add(this.mesh);
    this.yaw = Math.random() * 6.28; this.vy = 0; this.timer = 0;
    this.speed = 0.7 + Math.random() * 0.8;
    this.hp = 4; this.alive = true; this.gone = false; this.deadT = 0;
    this.pos = { x, y: y - 0.15, z };
    this.radius = 0.3; this.height = 0.3;
  }

  takeDamage(amount, attacker, headshot) {
    if (!this.alive) return false;
    this.hp -= amount;
    if (this.hp <= 0) { this.alive = false; this.game.onKill?.(attacker, this, headshot); return true; }
    return false;
  }

  inWater(x, y, z) { return this.game.world.fluidAt(x, y, z) === B.WATER; }

  update(dt, player) {
    const u = this.mesh.userData;
    u.t += dt * 9;
    u.tail.rotation.y = Math.sin(u.t) * 0.5;
    if (!this.alive) {                                  // belly-up, drifts to the surface
      this.deadT += dt;
      this.mesh.rotation.z = Math.PI;
      if (this.inWater(this.cx, this.cy + 0.3, this.cz)) this.cy += 0.5 * dt;
      this.mesh.position.set(this.cx, this.cy, this.cz);
      if (this.deadT > 4) { this.game.scene.remove(this.mesh); this.gone = true; }
      return;
    }
    this.timer -= dt;
    if (this.timer <= 0) { this.timer = 1.5 + Math.random() * 2.5; this.yaw += (Math.random() - 0.5) * 1.6; this.vy = (Math.random() - 0.5) * 0.5; }
    // startle when the player splashes close by
    let sp = this.speed;
    if (player && Math.hypot(player.body.x - this.cx, player.body.y - this.cy, player.body.z - this.cz) < 3 && player.body.inWater) sp *= 2.2;

    const nx = this.cx - Math.sin(this.yaw) * sp * dt, nz = this.cz - Math.cos(this.yaw) * sp * dt, ny = this.cy + this.vy * dt;
    // the fish occupies the water cell ahead, and must have water (not air) just above and not solid ground below
    if (this.inWater(nx, ny, nz) && this.inWater(nx, ny + 0.4, nz)) { this.cx = nx; this.cy = ny; this.cz = nz; }
    else { this.yaw += Math.PI * (0.55 + Math.random() * 0.4); this.vy = 0; this.timer = 1; }

    this.pos.x = this.cx; this.pos.y = this.cy - 0.15; this.pos.z = this.cz;
    this.mesh.position.set(this.cx, this.cy, this.cz);
    this.mesh.rotation.y = this.yaw + Math.PI;
    this.mesh.rotation.x = -this.vy * 0.6;
  }

  dispose() { this.game.scene.remove(this.mesh); this.gone = true; }
}
