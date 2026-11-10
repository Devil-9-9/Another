import * as THREE from 'three';
import { VoxelBody } from '../player/VoxelBody.js';
import { makeHumanoid, animateHumanoid, actHumanoid } from '../player/Humanoid.js';
import { modelReady, gfx } from '../player/Model.js';
import { resolveShot } from '../weapons/Ballistics.js';
import { JUMP_SPEED, MAX_HP } from '../core/Constants.js';

/** Enemy soldier: wanders, spots the player, chases, shoots, and chews through walls that block the way. */
export class Bot {
  constructor(game, name, x, z) {
    this.game = game; this.name = name; this.id = 'bot-' + name;
    const s = game.world.spawnPoint(Math.floor(x), Math.floor(z));
    this.body = new VoxelBody(game.world, s.x, s.y, s.z);
    this.mesh = makeHumanoid(0xb03a3a);
    game.scene.add(this.mesh);
    this.hp = MAX_HP; this.alive = true; this.respawnT = 0;
    this.yaw = Math.random() * 6.28;
    this.wanderT = 0; this.fireCd = 1; this.wallCd = 0; this.reactT = 0;
    this.team = 1;
  }

  get pos() { return this.body; }
  get radius() { return 0.3; }
  get height() { return 1.8; }
  get eye() { return { x: this.body.x, y: this.body.y + 1.6, z: this.body.z }; }

  takeDamage(amount, attacker, headshot) {
    if (!this.alive) return false;
    this.hp -= amount;
    this.reactT = 0; // wake up & face the shooter
    if (this.hp <= 0) {
      this.alive = false; this.respawnT = 5;
      if (actHumanoid(this.mesh, 'die')) this.dieShow = 2.6; else this.mesh.visible = false;   // realistic models fall over first, blocky ones just vanish
      this.game.onKill?.(attacker, this, headshot);
      return true;
    }
    return false;
  }

  respawn(near) {
    const a = Math.random() * 6.28, d = 22 + Math.random() * 14;
    const x = Math.floor(near.x + Math.cos(a) * d), z = Math.floor(near.z + Math.sin(a) * d);
    if (this.game.world.heightAt(x, z) < 22) return; // don't respawn in the ocean; try again next frame
    const s = this.game.world.spawnPoint(x, z);
    Object.assign(this.body, { x: s.x, y: s.y, z: s.z, vx: 0, vy: 0, vz: 0 });
    this.hp = MAX_HP; this.alive = true; this.mesh.visible = true; this.dieShow = 0;
    if (this.mesh.userData.isModel) this.mesh.userData.lock = 0;   // stand back up (idle/run resumes)
  }

  /** Swap the blocky body for the realistic model as soon as it has finished downloading. */
  upgradeModel() {
    const id = this.game.botModel;
    if (this.mesh.userData.isModel || !gfx.models || !id || !modelReady(id)) return;
    const old = this.mesh, m = makeHumanoid(0xb03a3a, true, { model: id }, { tint: 0xff8f8f });
    if (!m.userData.isModel) return;
    m.position.copy(old.position); m.rotation.y = old.rotation.y; m.visible = old.visible;
    this.game.scene.remove(old); this.game.scene.add(m); this.mesh = m;
  }

  update(dt, player) {
    const g = this.game, b = this.body;
    this.upgradeModel();
    if (!this.alive) {
      if (this.dieShow > 0) { this.dieShow -= dt; animateHumanoid(this.mesh, dt, 0); if (this.dieShow <= 0) this.mesh.visible = false; }
      this.respawnT -= dt; if (this.respawnT <= 0) this.respawn(player.body);
      return;
    }
    // don't simulate in unloaded terrain; pull stragglers back near the action
    if (!g.world.isLoaded(b.x, b.y, b.z)) { this.respawn(player.body); return; }
    const dx = player.body.x - b.x, dz = player.body.z - b.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 70 || Math.abs(player.body.y - b.y) > 40) { this.respawn(player.body); return; }

    const eye = this.eye, pe = player.eyePos;
    const toP = { x: pe.x - eye.x, y: pe.y - 0.2 - eye.y, z: pe.z - eye.z };
    const len3 = Math.hypot(toP.x, toP.y, toP.z) || 1;
    const dir = { x: toP.x / len3, y: toP.y / len3, z: toP.z / len3 };
    const firstBlock = g.world.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, len3);
    const los = !firstBlock && player.alive;
    const sees = los && len3 < 45;

    let wishX = 0, wishZ = 0, speed = 0;
    if (sees || (player.alive && dist < 30 && this.reactT < 3)) {
      this.reactT += dt;
      this.yaw = Math.atan2(-dx, -dz);
      if (len3 > 12) { wishX = -Math.sin(this.yaw); wishZ = -Math.cos(this.yaw); speed = 3.4; }
      else if (len3 < 6) { wishX = Math.sin(this.yaw); wishZ = Math.cos(this.yaw); speed = 2; }
      else { // strafe
        const s = Math.sin(performance.now() / 900 + b.x) > 0 ? 1 : -1;
        wishX = Math.cos(this.yaw) * s; wishZ = -Math.sin(this.yaw) * s; speed = 2.2;
      }
      // wall in the way: break it (the Minecraft half of the fight)
      if (firstBlock && firstBlock.dist < 5) {
        this.wallCd -= dt;
        if (this.wallCd <= 0) { g.blocks.hit(firstBlock.x, firstBlock.y, firstBlock.z, 1); this.wallCd = 0.45; }
      }
    } else {
      this.wanderT -= dt;
      if (this.wanderT <= 0) { this.yaw += (Math.random() - 0.5) * 3; this.wanderT = 1.5 + Math.random() * 2.5; }
      wishX = -Math.sin(this.yaw); wishZ = -Math.cos(this.yaw); speed = 1.6;
    }

    b.vx += (wishX * speed - b.vx) * Math.min(1, 10 * dt);
    b.vz += (wishZ * speed - b.vz) * Math.min(1, 10 * dt);
    if ((b.blockedX || b.blockedZ) && b.onGround && speed > 0) b.vy = JUMP_SPEED;
    b.step(dt);

    // shoot with human-like inaccuracy
    this.fireCd -= dt;
    if (sees && this.fireCd <= 0 && this.reactT > 0.5) {
      this.fireCd = 0.45 + Math.random() * 0.4;
      const err = 0.035 + len3 * 0.0012;
      const d = { x: dir.x + (Math.random() - 0.5) * err * 2, y: dir.y + (Math.random() - 0.5) * err * 2, z: dir.z + (Math.random() - 0.5) * err * 2 };
      const l = Math.hypot(d.x, d.y, d.z); d.x /= l; d.y /= l; d.z /= l;
      const res = resolveShot(g.world, eye, d, 60, [player], this);
      g.effects.tracer(new THREE.Vector3(eye.x, eye.y - 0.2, eye.z), new THREE.Vector3(res.point.x, res.point.y, res.point.z));
      g.audio.playAt?.('rifle', len3);
      if (res.kind === 'entity') player.takeDamage(7 + Math.random() * 4, this, res.headshot);
      else if (res.kind === 'block') g.effects.impact(res.point.x, res.point.y, res.point.z, res.block.id);
    }

    this.mesh.position.set(b.x, b.y, b.z);
    this.mesh.rotation.y = this.yaw + Math.PI; // model faces +Z, game forward is (-sin yaw, -cos yaw)
    animateHumanoid(this.mesh, dt, Math.hypot(b.vx, b.vz));
  }
}
