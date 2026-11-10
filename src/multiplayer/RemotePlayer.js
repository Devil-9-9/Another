import * as THREE from 'three';
import { makeHumanoid, animateHumanoid } from '../player/Humanoid.js';
import { modelReady, loadModel, gfx } from '../player/Model.js';

/** A friend's avatar. Position is interpolated; damage is forwarded to the owning peer (they apply it to themselves). */
export class RemotePlayer {
  constructor(game, id) {
    this.game = game; this.id = id;
    const prof = game.net?.profiles.get(id); this.prof = prof || null;
    if (gfx.models && prof?.look?.model) loadModel(prof.look.model);
    this.mesh = makeHumanoid(0x2f7fd0, true, prof?.look);
    game.scene.add(this.mesh);
    this.name = prof?.name || id;
    this.target = new THREE.Vector3(); this.cur = new THREE.Vector3();
    this.yaw = 0; this.targetYaw = 0;
    this.hp = 100; this.alive = true; this.height = 1.8; this.radius = 0.3;
    this.pos = { x: 0, y: 0, z: 0 };
    this.first = true;
    this.label = this.makeLabel(this.name);
    this.mesh.add(this.label);
  }

  /** The friend changed their look/name, or their hello arrived after their first position. */
  setProfile(prof) {
    this.prof = prof; if (gfx.models && prof.look?.model) loadModel(prof.look.model);
    const old = this.mesh, vis = old.visible, p = old.position.clone(), ry = old.rotation.y;
    this.game.scene.remove(old);
    this.mesh = makeHumanoid(0x2f7fd0, true, prof.look);
    this.mesh.position.copy(p); this.mesh.rotation.y = ry; this.mesh.visible = vis;
    this.game.scene.add(this.mesh);
    this.name = prof.name;
    this.label = this.makeLabel(this.name);
    this.mesh.add(this.label);
  }

  makeLabel(text) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 48;
    const x = c.getContext('2d');
    x.font = 'bold 28px system-ui'; x.textAlign = 'center';
    x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(0, 0, 256, 48);
    x.fillStyle = '#9fe870'; x.fillText(text, 128, 34);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, fog: false }));
    s.scale.set(1.6, 0.3, 1); s.position.y = 2.25; s.renderOrder = 10;
    return s;
  }

  applyState(s) {
    this.target.set(s.x, s.y, s.z);
    this.targetYaw = s.yaw;
    this.hp = s.hp; this.alive = s.hp > 0; this.height = s.crouch ? 1.25 : 1.8;
    this.mesh.visible = this.alive;
    if (this.first) { this.cur.copy(this.target); this.first = false; }
  }

  takeDamage(amount, attacker, headshot) {
    if (!this.alive) return false;
    this.game.net?.sendHit(this.id, amount, headshot);
    this.hp -= amount;              // optimistic; the next state packet corrects it
    return this.hp <= 0;
  }

  update(dt) {
    if (this.prof && gfx.models && !this.mesh.userData.isModel && this.prof.look?.model && modelReady(this.prof.look.model)) this.setProfile(this.prof);   // model finished downloading
    const prev = this.cur.clone();
    this.cur.lerp(this.target, Math.min(1, dt * 12));
    let dy = this.targetYaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * Math.min(1, dt * 12);
    this.mesh.position.copy(this.cur);
    this.mesh.rotation.y = this.yaw + Math.PI;
    this.pos.x = this.cur.x; this.pos.y = this.cur.y; this.pos.z = this.cur.z;
    animateHumanoid(this.mesh, dt, prev.distanceTo(this.cur) / Math.max(dt, 1e-3));
  }

  dispose() { this.game.scene.remove(this.mesh); }
}
