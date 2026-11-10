import { GRAVITY } from '../core/Constants.js';

/** Axis-aligned capsule-ish body colliding with the voxel grid. Pure logic: no rendering. */
export class VoxelBody {
  constructor(world, x, y, z, radius = 0.3, height = 1.8) {
    this.world = world;
    this.x = x; this.y = y; this.z = z;        // feet position
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.radius = radius; this.height = height;
    this.onGround = false;
    this.landedSpeed = 0;                      // downward speed on the frame we landed (for fall damage)
    this.blockedX = false; this.blockedZ = false;
    this.inWater = false; this.headUnder = false; this.inLava = false;
    this.flying = false;                       // true: no gravity / buoyancy (fly mode, helicopters, boats)
  }

  hits(x, y, z, h = this.height) {
    const r = this.radius;
    return this.world.boxSolid(x - r, y, z - r, x + r, y + h, z + r);
  }

  /** Can the body stand up to `h` tall here? */
  canStand(h) { return !this.hits(this.x, this.y, this.z, h); }

  step(dt) {
    dt = Math.min(dt, 0.05);
    // never simulate inside terrain that has not been generated yet (would fall through the world)
    if (!this.world.isLoaded(this.x, this.y, this.z) || !this.world.isLoaded(this.x, this.y + this.height, this.z) || !this.world.isLoaded(this.x, this.y - 0.5, this.z)) return;
    const mid = this.world.fluidAt(this.x, this.y + this.height * 0.4, this.z);
    this.inWater = mid === 12;                  // B.WATER
    this.inLava = mid === 13;                   // B.LAVA
    this.headUnder = this.world.fluidAt(this.x, this.y + this.height - 0.2, this.z) === 12;
    const swimming = !this.flying && (this.inWater || this.inLava);
    if (!this.flying) this.vy -= GRAVITY * (swimming ? 0.18 : 1) * dt;   // buoyancy: sink slowly
    if (swimming) {
      const drag = Math.max(0, 1 - (this.inLava ? 6 : 3) * dt);
      this.vx *= drag; this.vz *= drag; this.vy *= drag;
    }
    if (this.vy < -40) this.vy = -40;
    if (this.vy > 60) this.vy = 60;
    this.landedSpeed = 0;

    // X
    let nx = this.x + this.vx * dt;
    this.blockedX = false;
    if (this.hits(nx, this.y, this.z)) { this.blockedX = true; this.vx = 0; nx = this.x; }
    this.x = nx;
    // Z
    let nz = this.z + this.vz * dt;
    this.blockedZ = false;
    if (this.hits(this.x, this.y, nz)) { this.blockedZ = true; this.vz = 0; nz = this.z; }
    this.z = nz;
    // Y
    let ny = this.y + this.vy * dt;
    const wasGround = this.onGround;
    this.onGround = false;
    if (this.hits(this.x, ny, this.z)) {
      if (this.vy < 0) {
        this.y = Math.floor(ny) + 1;           // stand on top of the voxel we sank into
        this.onGround = true;
        const soft = swimming || this.world.getBlock(this.x, this.y - 0.5, this.z) === 14; // water or CLOUD breaks your fall
        this.landedSpeed = soft ? 0 : -this.vy;
      } else {
        this.y = Math.ceil(ny + this.height) - this.height - 1e-3; // bonk head
      }
      this.vy = 0;
    } else {
      this.y = ny;
    }
    if (!this.onGround && wasGround && this.vy <= 0) {
      // tiny gravity step-down keeps us glued while walking over flat ground
      if (this.hits(this.x, this.y - 0.02, this.z)) this.onGround = true;
    }
  }
}
