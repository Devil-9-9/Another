import * as THREE from 'three';
import { VoxelBody } from '../player/VoxelBody.js';
import { GRAVITY } from '../core/Constants.js';
import { B } from '../blocks/BlockTypes.js';
import { VEHICLES } from '../blocks/Items.js';

/**
 * Drivable vehicles: JEEP (land, SPRINT = nitro, runs enemies over), BOAT (water), HELICOPTER (flies anywhere, up and down, no fuel).
 * Models face -z at yaw 0 (forward = (-sin yaw, -cos yaw), same as the player). Vehicles stay where you leave them.
 * Vehicles are local to your game (friends do not see them yet).
 */
const SPEC = {
  jeep: { radius: 0.95, height: 1.5, cam: [5.2, 1.6], max: 15, nitro: 26 },
  bike: { radius: 0.5, height: 1.3, cam: [4.2, 1.4], max: 12, nitro: 21 },
  boat: { radius: 0.85, height: 0.8, cam: [6.2, 1.8], max: 16, nitro: 28 },
  heli: { radius: 1.1, height: 1.8, cam: [9, 2.6], max: 17, nitro: 32 },
};
export const MAX_VEHICLES = 10;

const matCache = new Map();
const mat = (c, o = {}) => { const k = c + JSON.stringify(o); if (!matCache.has(k)) matCache.set(k, new THREE.MeshLambertMaterial({ color: c, ...o })); return matCache.get(k); };
function part(g, sx, sy, sz, x, y, z, color, o) { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat(color, o)); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; }

function makeJeep() {
  const g = new THREE.Group(), wheels = [];
  part(g, 1.8, 0.55, 3.3, 0, 0.7, 0, 0x3a6b35);
  part(g, 1.6, 0.3, 1.1, 0, 1.1, -1.05, 0x2f5a2c);                    // hood
  part(g, 1.5, 0.7, 1.3, 0, 1.3, 0.35, 0x9fd6ee, { transparent: true, opacity: 0.55 });   // cabin glass
  part(g, 1.7, 0.1, 1.5, 0, 1.7, 0.35, 0x2a2a2a);                     // roof
  part(g, 0.35, 0.2, 0.1, -0.6, 0.85, -1.68, 0xffe9a0); part(g, 0.35, 0.2, 0.1, 0.6, 0.85, -1.68, 0xffe9a0);
  part(g, 1.7, 0.18, 0.18, 0, 0.5, -1.72, 0x222222);                  // bumper
  for (const [x, z] of [[-1, -1.05], [1, -1.05], [-1, 1.05], [1, 1.05]]) {
    const w = new THREE.Group(); w.position.set(x, 0.38, z);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.32, 10), mat(0x1b1b1b)); m.rotation.z = Math.PI / 2; w.add(m);
    part(w, 0.34, 0.12, 0.12, 0, 0, 0, 0x777777);
    g.add(w); wheels.push(w);
  }
  g.userData.wheels = wheels;
  return g;
}
function makeBike() {
  const g = new THREE.Group(), wheels = [];
  part(g, 0.18, 0.18, 1.5, 0, 0.75, 0, 0xc83232);                      // frame
  part(g, 0.14, 0.7, 0.14, 0, 0.9, -0.55, 0x333333);                   // fork
  part(g, 0.7, 0.08, 0.08, 0, 1.28, -0.55, 0x222222);                  // handlebar
  part(g, 0.22, 0.08, 0.4, 0, 1.0, 0.4, 0x2a2a2a);                     // seat
  for (const z of [-0.75, 0.75]) {
    const w = new THREE.Group(); w.position.set(0, 0.4, z);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.1, 12), mat(0x1b1b1b)); m.rotation.z = Math.PI / 2; w.add(m);
    part(w, 0.12, 0.1, 0.1, 0, 0, 0, 0x888888);
    g.add(w); wheels.push(w);
  }
  g.userData.wheels = wheels;
  return g;
}
function makeBoat() {
  const g = new THREE.Group();
  part(g, 1.5, 0.45, 3.2, 0, 0.25, 0.1, 0xf2f2f2);
  part(g, 1.0, 0.45, 0.9, 0, 0.25, -1.9, 0xf2f2f2);
  part(g, 0.5, 0.4, 0.5, 0, 0.25, -2.45, 0xe8e8e8);
  part(g, 1.55, 0.14, 3.25, 0, 0.5, 0.1, 0xd23a3a);                   // red rail
  part(g, 1.2, 0.5, 0.18, 0, 0.9, -0.5, 0x9fd6ee, { transparent: true, opacity: 0.55 });   // windshield
  part(g, 0.9, 0.12, 0.7, 0, 0.62, 0.7, 0x5a3a22);                    // seat
  part(g, 0.2, 0.5, 0.3, 0, 0.35, 1.8, 0x333333);                     // motor
  return g;
}
function makeHeli() {
  const g = new THREE.Group();
  part(g, 1.7, 1.3, 2.6, 0, 1.1, -0.2, 0xc83232);
  part(g, 1.5, 0.8, 1.0, 0, 1.3, -1.45, 0x9fd6ee, { transparent: true, opacity: 0.55 });  // canopy
  part(g, 0.4, 0.4, 2.7, 0, 1.45, 2.4, 0xa02828);                     // tail boom
  part(g, 0.1, 1.1, 0.5, 0, 1.9, 3.6, 0xa02828);                      // fin
  part(g, 0.12, 0.12, 0.9, -1.0, 0.25, 0, 0x333333); part(g, 0.12, 0.12, 0.9, 1.0, 0.25, 0, 0x333333);  // skids
  part(g, 0.1, 0.5, 0.1, -0.8, 0.5, -0.5, 0x333333); part(g, 0.1, 0.5, 0.1, 0.8, 0.5, -0.5, 0x333333);
  part(g, 2.0, 0.1, 0.1, -0.0, 0.25, -0.5, 0x333333);
  const rotor = new THREE.Group(); rotor.position.set(0, 1.9, -0.1);
  part(rotor, 7, 0.06, 0.28, 0, 0, 0, 0x222222); part(rotor, 0.28, 0.06, 7, 0, 0, 0, 0x222222);
  part(rotor, 0.3, 0.2, 0.3, 0, -0.05, 0, 0x555555);
  g.add(rotor);
  const tail = new THREE.Group(); tail.position.set(0.12, 1.9, 3.6);
  part(tail, 0.06, 0.9, 0.12, 0, 0, 0, 0x222222); g.add(tail);
  g.userData.rotor = rotor; g.userData.tail = tail;
  return g;
}
const MAKERS = { jeep: makeJeep, bike: makeBike, boat: makeBoat, heli: makeHeli };

export class Vehicle {
  constructor(game, type, x, y, z, yaw = 0) {
    this.game = game; this.type = type; this.spec = SPEC[type]; this.label = VEHICLES[type].label;
    this.body = new VoxelBody(game.world, x, y, z, this.spec.radius, this.spec.height);
    this.body.flying = type !== 'jeep' && type !== 'bike';
    this.yaw = yaw; this.speed = 0; this.driver = null; this.tilt = 0; this.roll = 0; this.t = Math.random() * 6; this.hitCd = new Map();
    this.mesh = MAKERS[type]();
    game.scene.add(this.mesh);
    this.sync();
  }

  get pos() { return this.body; }

  dispose() { this.game.scene.remove(this.mesh); }

  sync(bob = 0) {
    const b = this.body, m = this.mesh;
    m.position.set(b.x, b.y + bob, b.z);
    m.rotation.set(this.tilt, this.yaw, this.roll, 'YXZ');
  }

  update(dt, input, player) {
    const b = this.body, w = this.game.world, sp = this.spec;
    this.t += dt;
    const driven = !!this.driver;
    const throttle = driven ? input.moveZ : 0, steer = driven ? input.moveX : 0;
    const top = input.sprint && driven ? sp.nitro : sp.max;
    let bob = 0;

    if (this.type === 'jeep' || this.type === 'bike') {
      const target = throttle > 0 ? throttle * top : throttle * 6;
      this.speed += (target - this.speed) * Math.min(1, (throttle ? 1.5 : 0.7) * dt);
      if (driven) this.yaw -= steer * Math.min(1, 0.35 + Math.abs(this.speed) / 6) * 1.7 * dt * (this.speed < -0.5 ? -1 : 1);
      if (b.inWater) this.speed *= 1 - Math.min(1, 1.5 * dt);
      b.vx = -Math.sin(this.yaw) * this.speed; b.vz = -Math.cos(this.yaw) * this.speed;
      if ((b.blockedX || b.blockedZ) && b.onGround && Math.abs(this.speed) > 2) b.vy = 5.6;   // hop up one-block steps
      b.step(dt);
      if ((b.blockedX || b.blockedZ) && !b.onGround) this.speed *= 0.9;
      for (const wl of this.mesh.userData.wheels) wl.children[0].rotation.x -= this.speed * dt * 2.4;
      if (driven) this.runOver(dt, player);
    } else if (this.type === 'boat') {
      const wet = w.fluidAt(b.x, b.y + 0.25, b.z) === B.WATER, floating = w.fluidAt(b.x, b.y - 0.4, b.z) === B.WATER;
      const cap = wet || floating ? top : 2.5;
      const target = throttle > 0 ? throttle * cap : throttle * Math.min(cap, 5);
      this.speed += (target - this.speed) * Math.min(1, (wet || floating ? 1.0 : 2.5) * dt);
      if (driven) this.yaw -= steer * Math.min(1, 0.3 + Math.abs(this.speed) / 8) * 1.3 * dt * (this.speed < -0.5 ? -1 : 1);
      b.vx = -Math.sin(this.yaw) * this.speed; b.vz = -Math.cos(this.yaw) * this.speed;
      if (wet) b.vy = 2.5; else if (floating) b.vy *= 0.4; else b.vy = Math.max(-20, b.vy - GRAVITY * dt);
      b.step(dt);
      if (b.blockedX || b.blockedZ) this.speed *= 0.6;
      if (floating || wet) bob = Math.sin(this.t * 2.2) * 0.06;
      this.roll += (-steer * 0.18 * Math.min(1, Math.abs(this.speed) / 8) - this.roll) * Math.min(1, 4 * dt);
      this.tilt += (-Math.min(0.12, Math.abs(this.speed) / 90) - this.tilt) * Math.min(1, 3 * dt);
    } else {                                   // heli
      b.flying = driven;                       // parked helicopters settle on the ground
      if (driven) {
        this.yaw = player.yaw;
        const fwd = { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) }, rgt = { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) };
        const k = Math.min(1, 2.2 * dt), v = top;
        b.vx += (fwd.x * throttle * v + rgt.x * steer * v * 0.7 - b.vx) * k;
        b.vz += (fwd.z * throttle * v + rgt.z * steer * v * 0.7 - b.vz) * k;
        b.vy += (((input.jump ? 1 : 0) - (input.crouch ? 1 : 0)) * 11 - b.vy) * k;
        this.tilt += (-throttle * 0.22 - this.tilt) * Math.min(1, 3 * dt);
        this.roll += (-steer * 0.25 - this.roll) * Math.min(1, 3 * dt);
      } else { this.tilt *= 0.9; this.roll *= 0.9; b.vx *= 0.9; b.vz *= 0.9; }
      b.step(dt);
      const spin = driven ? 34 : (b.onGround ? 0 : 6);
      this.mesh.userData.rotor.rotation.y += spin * dt; this.mesh.userData.tail.rotation.x += spin * dt;
    }
    this.sync(bob);
    if (driven) { const p = player.body; p.x = b.x; p.y = b.y; p.z = b.z; }
  }

  /** The jeep damages whatever it hits at speed. */
  runOver(dt, player) {
    if (Math.abs(this.speed) < 7) return;
    const b = this.body;
    for (const [k, t] of this.hitCd) { if (t - dt <= 0) this.hitCd.delete(k); else this.hitCd.set(k, t - dt); }
    for (const t of this.game.getTargets()) {
      if (!t.alive || t === player || this.hitCd.has(t)) continue;
      const p = t.pos;
      if (Math.hypot(p.x - b.x, p.z - b.z) < 1.9 && p.y < b.y + 2 && p.y + (t.height ?? 1.8) > b.y) {
        this.hitCd.set(t, 0.6);
        const dead = t.takeDamage(Math.abs(this.speed) * 4, player, false);
        this.game.hud.hitmarker(!!dead); this.game.audio.play(dead ? 'kill' : 'hit');
      }
    }
  }

  /** Where the camera sits when you ride this vehicle (3rd person, follows your look direction). */
  chaseCamera(player, out) {
    const [dist, up] = this.spec.cam, b = this.body, cp = Math.cos(player.pitch);
    const f = { x: -Math.sin(player.yaw) * cp, y: Math.sin(player.pitch), z: -Math.cos(player.yaw) * cp };
    const px = b.x, py = b.y + up * 0.6, pz = b.z;
    let d = dist;
    const hit = this.game.world.raycast(px, py, pz, -f.x, -f.y, -f.z, dist);
    if (hit) d = Math.max(1.2, hit.dist - 0.4);
    out.set(px - f.x * d, py - f.y * d + up * 0.4, pz - f.z * d);
  }
}

export class VehicleManager {
  constructor(game) { this.game = game; this.list = []; }

  clear() { for (const v of this.list) v.dispose(); this.list = []; }

  spawn(type, x, y, z, yaw) {
    const g = this.game;
    if (!SPEC[type]) return null;
    const probe = new VoxelBody(g.world, x, y, z, SPEC[type].radius, SPEC[type].height);
    for (let i = 0; i < 8 && probe.hits(probe.x, probe.y, probe.z); i++) probe.y += 1;     // lift out of walls/ground
    if (this.list.length >= MAX_VEHICLES) { const old = this.list.shift(); if (old.driver) { this.list.unshift(old); } else old.dispose(); }
    const v = new Vehicle(g, type, probe.x, probe.y + 0.02, probe.z, yaw);
    this.list.push(v);
    g.audio.play('place');
    return v;
  }

  nearest(body, r = 5) {
    let best = null, bd = r;
    for (const v of this.list) {
      const d = Math.hypot(v.body.x - body.x, v.body.y + 0.8 - (body.y + 0.9), v.body.z - body.z);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  update(dt, input, player) {
    for (const v of this.list) {
      if (!v.driver && Math.hypot(v.body.x - player.body.x, v.body.z - player.body.z) > 120) continue;   // far parked vehicles sleep
      v.update(dt, input, player);
    }
  }
}
