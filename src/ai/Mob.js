import * as THREE from 'three';
import { VoxelBody } from '../player/VoxelBody.js';
import { makeHumanoid, animateHumanoid } from '../player/Humanoid.js';
import { Villager } from './Villager.js';
import { JUMP_SPEED } from '../core/Constants.js';

/**
 * Zombie, Skeleton, Spider, Creeper. Same power, look, health and speed in Creative and Survival: only the player differs
 * (Creative players cannot be hurt). DAY: peaceful, they just wander. NIGHT: red eyes, they hunt you down.
 * A torch within 6 blocks of you keeps them calm, and walls keep them out.
 */
export const MOBS = {
  zombie:   { hp: 20, dmg: 5, day: 0.9, night: 3.2, reach: 1.5, cd: 1.0, r: 0.3, h: 1.8 },
  skeleton: { hp: 15, dmg: 4, day: 0.8, night: 2.0, range: 18, cd: 2.6, r: 0.3, h: 1.8 },
  spider:   { hp: 15, dmg: 3, day: 1.0, night: 3.8, reach: 1.4, cd: 0.9, r: 0.5, h: 0.9 },
  creeper:  { hp: 20, dmg: 12, day: 0.8, night: 2.6, fuse: 1.4, blast: 2, r: 0.3, h: 1.6 },
};
const MAX_MOBS = 8;
const WEIGHTS = [['zombie', 4], ['skeleton', 2], ['spider', 2], ['creeper', 1.5]];
let uid = 0;
const box = (w, h, d, c, x, y, z, o) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: c, ...o })); m.position.set(x, y, z); m.castShadow = true; return m; };
const eyeMat = () => new THREE.MeshBasicMaterial({ color: 0x333300, fog: false });

function makeMobMesh(kind) {
  let g, eyes = [];
  if (kind === 'zombie' || kind === 'skeleton') {
    g = makeHumanoid(kind === 'zombie' ? 0x3f8a3f : 0xe6e6dc, false);
    for (const x of [-0.09, 0.09]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.03), eyeMat()); e.position.set(x, 1.66, 0.21); g.add(e); eyes.push(e); }
  } else if (kind === 'spider') {
    g = new THREE.Group();
    g.add(box(0.9, 0.45, 1.0, 0x2b2226, 0, 0.5, 0), box(0.55, 0.4, 0.5, 0x3a2e32, 0, 0.55, 0.75));
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) { const l = box(0.7, 0.07, 0.07, 0x1d1719, s * 0.7, 0.4, -0.3 + i * 0.3); l.rotation.z = s * 0.5; g.add(l); }
    for (const x of [-0.12, 0.12]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.04), eyeMat()); e.position.set(x, 0.62, 1.02); g.add(e); eyes.push(e); }
  } else {
    g = new THREE.Group();
    g.add(box(0.5, 1.0, 0.4, 0x4caf50, 0, 0.9, 0), box(0.5, 0.5, 0.5, 0x58c25c, 0, 1.65, 0));
    for (const [x, z] of [[-0.15, 0.2], [0.15, 0.2], [-0.15, -0.2], [0.15, -0.2]]) g.add(box(0.2, 0.4, 0.2, 0x3f9a44, x, 0.2, z));
    for (const x of [-0.12, 0.12]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.03), new THREE.MeshBasicMaterial({ color: 0x0a2a0a })); e.position.set(x, 1.7, 0.26); g.add(e); }
  }
  g.userData.eyes = eyes;
  return g;
}

export class Mob {
  constructor(game, kind, x, z) {
    this.game = game; this.kind = undefined; this.type = kind; this.mob = true;     // `kind` stays undefined so Game.onKill counts it as a monster, not an animal
    this.cfg = MOBS[kind]; this.name = kind.toUpperCase(); this.id = 'mob-' + (uid++);
    const s = game.world.spawnPoint(Math.floor(x), Math.floor(z));
    this.body = new VoxelBody(game.world, s.x, s.y, s.z, this.cfg.r, this.cfg.h);
    this.mesh = makeMobMesh(kind); game.scene.add(this.mesh);
    this.hp = this.cfg.hp; this.alive = true; this.gone = false;
    this.yaw = Math.random() * 6.28; this.wanderT = 0; this.cdT = 0.5; this.fuse = 0; this.flash = 0; this.aggro = false;
  }

  get pos() { return this.body; }
  get radius() { return this.cfg.r; }
  get height() { return this.cfg.h; }

  takeDamage(amount, attacker, headshot) {
    if (!this.alive) return false;
    this.hp -= amount; this.flash = 0.15;
    if (this.hp <= 0) { this.alive = false; this.mesh.visible = false; this.game.onKill?.(attacker, this, headshot); return true; }
    return false;
  }

  dispose() { this.game.scene.remove(this.mesh); this.gone = true; }

  update(dt, player, night) {
    const g = this.game, b = this.body, c = this.cfg;
    const dx = player.body.x - b.x, dz = player.body.z - b.z, d = Math.hypot(dx, dz), dy = player.body.y - b.y;
    const calm = g.torchNear(player.body.x, player.body.y, player.body.z, 6) || g.torchNear(b.x, b.y, b.z, 5);
    this.aggro = night && !calm && player.alive && d < 42;
    for (const e of this.mesh.userData.eyes || []) e.material.color.setHex(this.aggro ? 0xff2a1a : 0x4a4a1a);

    let speed = c.day, wx = 0, wz = 0;
    if (this.aggro) {
      this.yaw = Math.atan2(-dx, -dz); speed = c.night;
      wx = -Math.sin(this.yaw); wz = -Math.cos(this.yaw);
      this.cdT -= dt;
      if (this.type === 'zombie' || this.type === 'spider') {
        if (d < c.reach && Math.abs(dy) < 1.8) { speed = 0.3; if (this.cdT <= 0) { this.cdT = c.cd; player.takeDamage(c.dmg, this, false); } }
      } else if (this.type === 'skeleton') {
        if (d < 8) { wx = -wx; wz = -wz; speed = 1.6; } else if (d < 14) speed = 0;     // keeps its distance and shoots
        if (d < c.range && this.cdT <= 0 && this.canSee(player)) {
          this.cdT = c.cd; this.shoot(player);
        }
      } else {                                                                            // creeper
        if (d < 3.2 && Math.abs(dy) < 2) { this.fuse += dt; speed = 0; if (this.fuse >= c.fuse) { this.explode(player); return; } } else this.fuse = Math.max(0, this.fuse - dt);
      }
    } else {
      this.fuse = 0;
      this.wanderT -= dt;
      if (this.wanderT <= 0) { this.yaw += (Math.random() - 0.5) * 3; this.wanderT = 2 + Math.random() * 3; if (Math.random() < 0.3) this.wanderT += 2; }
      wx = -Math.sin(this.yaw); wz = -Math.cos(this.yaw);
      if (this.wanderT > 3.5) speed = 0;
    }
    b.vx += (wx * speed - b.vx) * Math.min(1, 10 * dt);
    b.vz += (wz * speed - b.vz) * Math.min(1, 10 * dt);
    if ((b.blockedX || b.blockedZ) && b.onGround && speed > 0.5) b.vy = JUMP_SPEED;
    b.step(dt);

    if (this.flash > 0) this.flash -= dt;
    this.mesh.position.set(b.x, b.y, b.z);
    this.mesh.rotation.y = this.yaw + Math.PI;
    if (this.type === 'creeper') this.mesh.scale.setScalar(1 + (this.fuse > 0 ? Math.sin(this.fuse * 30) * 0.08 + this.fuse * 0.15 : 0));
    if (this.type === 'zombie' || this.type === 'skeleton') animateHumanoid(this.mesh, dt, Math.hypot(b.vx, b.vz));
  }

  canSee(player) {
    const b = this.body, p = player.body, ex = b.x, ey = b.y + 1.5, ez = b.z;
    const dx = p.x - ex, dy = p.y + 1.4 - ey, dz = p.z - ez, len = Math.hypot(dx, dy, dz);
    return !this.game.world.raycast(ex, ey, ez, dx, dy, dz, len);
  }

  shoot(player) {
    const b = this.body, p = player.body;
    const from = { x: b.x, y: b.y + 1.5, z: b.z };
    const dx = p.x - from.x + (Math.random() - 0.5) * 1.2, dy = p.y + 1.2 - from.y + 0.04 * Math.hypot(p.x - b.x, p.z - b.z), dz = p.z - from.z + (Math.random() - 0.5) * 1.2;
    const len = Math.hypot(dx, dy, dz);
    this.game.projectiles.spawn({ kind: 'arrow', from, dir: { x: dx / len, y: dy / len, z: dz / len }, speed: 26, gravity: 9.81, damage: this.cfg.dmg, owner: this });
    this.game.audio.playAt?.('bow', len);
  }

  explode(player) {
    const g = this.game, b = this.body, c = this.cfg;
    this.alive = false; this.mesh.visible = false;
    g.effects.explosion(b.x, b.y + 0.8, b.z, 2.5); g.audio.play('explode');
    g.blocks.explode(b.x, b.y + 0.8, b.z, c.blast, 12);                      // small blast: a creeper dents the ground, it does not level a house
    const d = Math.hypot(player.body.x - b.x, player.body.y + 0.9 - b.y, player.body.z - b.z);
    if (d < 4.5) player.takeDamage(c.dmg * (d < 3.2 ? 1 : 1 - (d - 3.2) / 1.3), this, false);
  }
}

export class MobManager {
  constructor(game) { this.game = game; this.list = []; this.t = 2; this.enabled = true; }
  clear() { for (const m of this.list) m.dispose(); this.list = []; }
  get targets() { return this.list.filter((m) => m.alive); }

  update(dt, player) {
    const g = this.game, night = Villager.isNight(g.daynight.time), py = player.body.y;
    if (!this.enabled) { if (this.list.length) this.clear(); return; }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const m = this.list[i];
      if (!m.alive) { m.dispose(); this.list.splice(i, 1); continue; }
      const far = Math.hypot(m.body.x - player.body.x, m.body.z - player.body.z);
      if (far > 90 || Math.abs(m.body.y - py) > 60) { m.dispose(); this.list.splice(i, 1); continue; }
      if (far < 120) m.update(dt, player, night);
    }
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 1.5;
    if (this.list.length >= MAX_MOBS || !player.alive || py < -5 || py > 130) return;     // surface only: not the underworld or sky realms
    const a = Math.random() * 6.28, r = 24 + Math.random() * 20;
    const x = player.body.x + Math.cos(a) * r, z = player.body.z + Math.sin(a) * r;
    if (g.world.heightAt(Math.floor(x), Math.floor(z)) < 22 || g.torchNear(x, py, z, 12)) return;      // not in the sea, not next to a torch
    let roll = Math.random() * WEIGHTS.reduce((s, w) => s + w[1], 0), kind = 'zombie';
    for (const [k, w] of WEIGHTS) { if ((roll -= w) <= 0) { kind = k; break; } }
    this.list.push(new Mob(g, kind, x, z));
  }
}
