import {
  MAX_HP, PLAYER_HEIGHT, PLAYER_EYE, PLAYER_CROUCH_HEIGHT, PLAYER_CROUCH_EYE, PLAYER_RADIUS,
  WALK_SPEED, SPRINT_SPEED, CROUCH_SPEED, JUMP_SPEED, FLY_SPEED, FLY_FAST,
} from '../core/Constants.js';
import { VoxelBody } from './VoxelBody.js';

const LOOK_SENS = 0.0022;

export class Player {
  constructor(world, spawn) {
    this.world = world;
    this.body = new VoxelBody(world, spawn.x, spawn.y, spawn.z, PLAYER_RADIUS, PLAYER_HEIGHT);
    this.yaw = 0; this.pitch = 0;
    this.maxHp = MAX_HP; this.hp = MAX_HP; this.alive = true; this.respawnT = 0;      // maxHp grows with Survival levels
    this.kills = 0; this.deaths = 0;
    this.crouching = false; this.sprinting = false; this.ads = false;
    this.eye = PLAYER_EYE;
    this.speedMult = 1; this.lookMult = 1; this.sens = 1;
    this.stepT = 0;
    this.flying = false; this.safeLanding = false;   // fly mode; safeLanding = no fall damage until you next touch ground
    this.vehicle = null; this.onFlyChange = null;
    this.invulnerable = false;     // Creative: no damage, cannot die
    this.canFly = true;            // Creative (or an unlocked wing): fly mode allowed
    this.aimPoint = null;          // set by Game in third person: world point under the crosshair
    this.onHurt = null; this.onDeath = null; this.onRespawn = null; this.onSound = null;
    this.spawnFn = () => spawn;
    this.id = 'me';
  }

  /* target interface used by Ballistics */
  get pos() { return this.body; }
  get radius() { return PLAYER_RADIUS; }
  get height() { return this.body.height; }
  get eyePos() { return { x: this.body.x, y: this.body.y + this.eye, z: this.body.z }; }

  forward() {
    const cp = Math.cos(this.pitch);
    const f = { x: -Math.sin(this.yaw) * cp, y: Math.sin(this.pitch), z: -Math.cos(this.yaw) * cp };
    const a = this.aimPoint;
    if (a) {                       // third person: shoot/aim at whatever is under the crosshair, not along our own shoulder line
      const e = this.eyePos, dx = a.x - e.x, dy = a.y - e.y, dz = a.z - e.z, len = Math.hypot(dx, dy, dz);
      if (len > 0.5 && (dx * f.x + dy * f.y + dz * f.z) / len > 0.5) return { x: dx / len, y: dy / len, z: dz / len };
    }
    return f;
  }
  right() { return { x: Math.cos(this.yaw), y: 0, z: -Math.sin(this.yaw) }; }

  takeDamage(amount, attacker = null, headshot = false) {
    if (!this.alive || this.invulnerable) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.onHurt?.(amount, attacker, headshot);
    if (this.hp <= 0) {
      this.alive = false; this.deaths++; this.respawnT = 3; this.setFlying(false);
      this.onDeath?.(attacker, headshot);
      return true;
    }
    return false;
  }

  setFlying(on) {
    if (on && !this.canFly) return;
    if (on === this.flying) return;
    this.flying = on; this.body.flying = on;
    if (on) { this.safeLanding = true; this.body.vy = 0; }
    else this.safeLanding = !this.body.onGround;      // switched off in mid-air: feather-fall until you land
    this.onFlyChange?.(on);
  }

  respawn() {
    this.setFlying(false); this.safeLanding = false;
    const s = this.spawnFn();
    Object.assign(this.body, { x: s.x, y: s.y, z: s.z, vx: 0, vy: 0, vz: 0 });
    this.hp = this.maxHp; this.alive = true; this.crouching = false;
    this.onRespawn?.();
  }

  update(dt, input) {
    if (!this.alive) {
      this.respawnT -= dt;
      this.body.vx = this.body.vz = 0;
      this.body.step(dt);
      if (this.respawnT <= 0) this.respawn();
      return;
    }
    const b = this.body;

    // look (scaled down when aiming so scopes stay controllable)
    const [dx, dy] = input.consumeLook();
    const s = LOOK_SENS * this.lookMult * this.sens;
    this.yaw -= dx * s;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - dy * s));

    if (this.vehicle) { b.vx = b.vy = b.vz = 0; return; }     // seated: the vehicle drives, the Game moves our body with it

    // stance (while flying, DUCK means descend, not crouch)
    const wantCrouch = input.crouch && !this.flying;
    if (wantCrouch && !this.crouching) { this.crouching = true; b.height = PLAYER_CROUCH_HEIGHT; }
    else if (!wantCrouch && this.crouching && b.canStand(PLAYER_HEIGHT)) { this.crouching = false; b.height = PLAYER_HEIGHT; }
    const eyeTarget = this.crouching ? PLAYER_CROUCH_EYE : PLAYER_EYE;
    this.eye += (eyeTarget - this.eye) * Math.min(1, dt * 14);

    // movement
    const fwd = { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
    const rgt = { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) };
    let mx = input.moveX, mz = input.moveZ;
    const mag = Math.hypot(mx, mz);
    if (mag > 1) { mx /= mag; mz /= mag; }
    this.sprinting = input.sprint && mz > 0.3 && !this.crouching && !this.ads;
    const base = this.crouching ? CROUCH_SPEED : this.sprinting ? SPRINT_SPEED : WALK_SPEED;
    const speed = base * this.speedMult * (this.ads ? 0.6 : 1) * (b.inWater ? 0.65 : b.inLava ? 0.35 : 1);
    const tx = (fwd.x * mz + rgt.x * mx) * speed;
    const tz = (fwd.z * mz + rgt.z * mx) * speed;
    if (this.flying) {
      // fly: unlimited time, unlimited range, up and down. Forward follows where you look (look up + forward = climb).
      this.sprinting = input.sprint && mz > 0.3;
      const fs = this.sprinting ? FLY_FAST : FLY_SPEED, cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      const ftx = (fwd.x * mz * cp + rgt.x * mx) * fs, ftz = (fwd.z * mz * cp + rgt.z * mx) * fs;
      const fty = sp * mz * fs + ((input.jump ? 1 : 0) - (input.crouch ? 1 : 0)) * fs * 0.7;
      const kf = Math.min(1, 5 * dt);
      b.vx += (ftx - b.vx) * kf; b.vz += (ftz - b.vz) * kf; b.vy += (fty - b.vy) * kf;
    } else {
      const accel = b.onGround ? 14 : 3;
      const k = Math.min(1, accel * dt);
      b.vx += (tx - b.vx) * k;
      b.vz += (tz - b.vz) * k;

      if (b.inWater || b.inLava) {
        // swim: hold JUMP to rise (or climb out onto a ledge), DUCK to dive
        if (input.jump) { if (b.blockedX || b.blockedZ) b.vy = JUMP_SPEED; else b.vy = Math.min(3.6, b.vy + 22 * dt); }
        else if (input.crouch) b.vy = Math.max(-3.6, b.vy - 18 * dt);
      } else if (input.jump && b.onGround && !this.crouching) { b.vy = JUMP_SPEED; this.onSound?.('jump'); }
    }
    b.step(dt);

    // lava burns hard, in ticks so the damage flash/sound don't fire every frame
    if (b.inLava) {
      this.lavaAcc = (this.lavaAcc || 0) + 40 * dt;
      if (this.lavaAcc >= 6) { this.lavaAcc -= 6; this.takeDamage(6, { name: 'LAVA', id: 'LAVA' }); }
    } else this.lavaAcc = 0;

    // fall damage (g = 9.81: a 4-block drop lands at ~8.9 m/s, safe; 8 blocks ~12.5 m/s, hurts)
    if (b.onGround && !this.flying) { if (this.safeLanding) this.safeLanding = false; else if (b.landedSpeed > 11) this.takeDamage((b.landedSpeed - 11) * 9, null); }
    // footsteps
    const hs = Math.hypot(b.vx, b.vz);
    if (b.onGround && hs > 1.5) {
      this.stepT -= dt * hs;
      if (this.stepT <= 0) { this.stepT = 2.4; this.onSound?.('step'); }
    }
  }
}
