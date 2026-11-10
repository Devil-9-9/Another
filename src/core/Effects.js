import * as THREE from 'three';
import { GRAVITY } from './Constants.js';
import { isSolid } from '../blocks/BlockTypes.js';
import { BLOCK_COLORS } from '../blocks/TextureAtlas.js';

/** Tracers, muzzle flashes, block debris and bullet impacts. Debris uses the same g = 9.81. */
export class Effects {
  constructor(scene, world) {
    this.scene = scene; this.world = world;
    this.debris = [];
    this.tracers = [];
    this.debrisGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
    this.debrisMats = new Map();
    this.tracerGeo = new THREE.BoxGeometry(0.02, 0.02, 1);
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9, fog: false });
    this.flash = new THREE.PointLight(0xffb040, 0, 9);
    scene.add(this.flash);
    this.flashT = 0;
    this.fires = [];
    this.fireMats = [0xffe08a, 0xff9a2a, 0xe0501a, 0x555555].map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, fog: false }));
  }

  mat(id) {
    const color = BLOCK_COLORS[id] ?? 0x999999;
    if (!this.debrisMats.has(color)) this.debrisMats.set(color, new THREE.MeshLambertMaterial({ color }));
    return this.debrisMats.get(color);
  }

  blockDebris(x, y, z, id, count = 10, power = 3) {
    for (let i = 0; i < count; i++) {
      if (this.debris.length > 220) this.remove(this.debris.shift());
      const m = new THREE.Mesh(this.debrisGeo, this.mat(id));
      m.position.set(x + 0.2 + Math.random() * 0.6, y + 0.2 + Math.random() * 0.6, z + 0.2 + Math.random() * 0.6);
      m.scale.setScalar(0.5 + Math.random() * 0.8);
      this.scene.add(m);
      this.debris.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * power, Math.random() * power * 0.9, (Math.random() - 0.5) * power), life: 1.2 + Math.random() * 0.8 });
    }
  }

  impact(x, y, z, id) { this.blockDebris(x - 0.5, y - 0.5, z - 0.5, id, 3, 2); }

  tracer(from, to) {
    const len = from.distanceTo(to);
    if (len < 1) return;
    const m = new THREE.Mesh(this.tracerGeo, this.tracerMat);
    m.position.copy(from).lerp(to, 0.5);
    m.scale.z = len;
    m.lookAt(to);
    this.scene.add(m);
    this.tracers.push({ m, life: 0.07 });
  }

  muzzle(pos) {
    this.flash.position.copy(pos);
    this.flash.intensity = 6;
    this.flashT = 0.05;
  }

  /** Fireball + smoke for rockets. */
  explosion(x, y, z, r = 4) {
    for (let i = 0; i < 18; i++) {
      if (this.fires.length > 90) { const o = this.fires.shift(); this.scene.remove(o.m); }
      const m = new THREE.Mesh(this.debrisGeo, this.fireMats[i % 4].clone());
      m.position.set(x, y, z); m.scale.setScalar(2 + Math.random() * 4);
      this.scene.add(m);
      const a = Math.random() * 6.28, up = Math.random() * 0.8, sp = (0.5 + Math.random()) * r;
      this.fires.push({ m, v: new THREE.Vector3(Math.cos(a) * sp, up * sp + 1, Math.sin(a) * sp), life: 0.5 + Math.random() * 0.5, max: 1 });
    }
    this.flash.position.set(x, y + 0.5, z); this.flash.intensity = 14; this.flashT = 0.18;
  }

  remove(d) { this.scene.remove(d.m); }

  update(dt) {
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt;
      d.v.y -= GRAVITY * dt;
      const p = d.m.position;
      const nx = p.x + d.v.x * dt, ny = p.y + d.v.y * dt, nz = p.z + d.v.z * dt;
      if (isSolid(this.world.getBlock(nx, ny, nz))) {
        if (!isSolid(this.world.getBlock(p.x, ny, p.z))) { d.v.y *= -0.35; d.v.x *= 0.7; d.v.z *= 0.7; }
        else { d.v.multiplyScalar(0.2); }
      } else p.set(nx, ny, nz);
      d.m.rotation.x += dt * 6; d.m.rotation.y += dt * 4;
      if (d.life <= 0) { this.remove(d); this.debris.splice(i, 1); }
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) { this.scene.remove(t.m); this.tracers.splice(i, 1); }
    }
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.life -= dt; f.m.position.addScaledVector(f.v, dt); f.v.multiplyScalar(Math.max(0, 1 - 3 * dt)); f.v.y += 1.5 * dt;
      f.m.material.opacity = Math.max(0, Math.min(1, f.life * 2)); f.m.scale.multiplyScalar(1 + dt * 1.5);
      if (f.life <= 0) { this.scene.remove(f.m); f.m.material.dispose(); this.fires.splice(i, 1); }
    }
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.intensity = 0; }
  }
}
