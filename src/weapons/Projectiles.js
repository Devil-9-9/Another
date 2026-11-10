import * as THREE from 'three';
import { resolveShot } from './Ballistics.js';

/**
 * Arrows (gravity, stick in blocks) and rockets (fly straight, explode). One shared update loop.
 * Hits use the same entity interface as bullets: takeDamage(amount, attacker, headshot).
 */
export class Projectiles {
  constructor(game) {
    this.game = game; this.list = [];
    this.arrowGeo = new THREE.BoxGeometry(0.04, 0.04, 0.7);
    this.arrowMat = new THREE.MeshLambertMaterial({ color: 0xcaa66a });
    this.rocketGeo = new THREE.BoxGeometry(0.16, 0.16, 0.6);
    this.rocketMat = new THREE.MeshBasicMaterial({ color: 0xff7a1a, fog: false });
  }

  clear() { for (const p of this.list) this.game.scene.remove(p.mesh); this.list = []; }

  /** kind: 'arrow' | 'rocket' | 'orb' (boss magic: hurts only the player, no block damage). from/dir in world coords (dir normalised). */
  spawn({ kind, from, dir, speed, gravity = 0, damage, headMult = 1, owner, radius = 4, blockPower = 18, color = 0xff6a20, onHit = null, size = 0.5 }) {
    let geo = kind === 'rocket' ? this.rocketGeo : this.arrowGeo, mat = kind === 'rocket' ? this.rocketMat : this.arrowMat;
    if (kind === 'orb') { geo = new THREE.BoxGeometry(size, size, size); mat = new THREE.MeshBasicMaterial({ color, fog: false }); }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(from.x, from.y, from.z);
    this.game.scene.add(mesh);
    const p = { kind, mesh, x: from.x, y: from.y, z: from.z, vx: dir.x * speed, vy: dir.y * speed, vz: dir.z * speed, g: gravity,
      damage, headMult, owner, radius, blockPower, onHit, life: kind === 'rocket' ? 6 : kind === 'orb' ? 8 : 12, stuck: 0 };
    this.orient(p);
    this.list.push(p);
    return p;
  }

  orient(p) {
    p.mesh.position.set(p.x, p.y, p.z);
    p.mesh.lookAt(p.x + p.vx, p.y + p.vy, p.z + p.vz);
  }

  remove(i) { this.game.scene.remove(this.list[i].mesh); this.list.splice(i, 1); }

  update(dt) {
    const g = this.game;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.stuck) { p.stuck -= dt; if (p.stuck <= 0) this.remove(i); continue; }
      if (p.life <= 0) { if (p.kind === 'rocket') this.explode(p, p.x, p.y, p.z); this.remove(i); continue; }
      if (p.kind === 'orb') p.mesh.rotation.x += dt * 6;
      p.vy -= p.g * dt;
      const sx = p.vx * dt, sy = p.vy * dt, sz = p.vz * dt, len = Math.hypot(sx, sy, sz);
      if (len < 1e-6) continue;
      const d = { x: sx / len, y: sy / len, z: sz / len };
      const mine = p.owner === g.player;
      const res = resolveShot(g.world, { x: p.x, y: p.y, z: p.z }, d, len, mine ? g.getTargets() : (g.player?.alive ? [g.player] : []), p.owner);
      if (p.kind === 'orb' && res.kind !== 'none') {              // boss magic: bursts on the player or the ground
        g.effects.explosion(res.point.x, res.point.y, res.point.z, 1.2);
        const pl = g.player;
        if (pl?.alive && Math.hypot(pl.body.x - res.point.x, pl.body.y + 0.9 - res.point.y, pl.body.z - res.point.z) < 1.8) { pl.takeDamage(p.damage, p.owner, false); p.onHit?.(); }
        this.remove(i); continue;
      }
      if (res.kind === 'entity') {
        if (p.kind === 'rocket') this.explode(p, res.point.x, res.point.y, res.point.z);
        else {
          const dead = res.target.takeDamage(p.damage * (res.headshot ? p.headMult : 1), p.owner, res.headshot);
          if (p.owner === g.player) { g.hud.hitmarker(!!dead); g.audio.play(dead ? 'kill' : 'hit'); }
          g.effects.blockDebris(res.point.x - 0.5, res.point.y - 0.5, res.point.z - 0.5, 6, 2, 2.2);
        }
        this.remove(i); continue;
      }
      if (res.kind === 'block') {
        if (p.kind === 'rocket') { this.explode(p, res.point.x - d.x * 0.2, res.point.y - d.y * 0.2, res.point.z - d.z * 0.2); this.remove(i); continue; }
        if (mine) g.blocks.hit(res.block.x, res.block.y, res.block.z, 1);
        g.effects.impact(res.point.x, res.point.y, res.point.z, res.block.id);
        p.x = res.point.x; p.y = res.point.y; p.z = res.point.z; p.vx = d.x; p.vy = d.y; p.vz = d.z;
        this.orient(p); p.stuck = 6; continue;                     // arrow stays stuck in the wall for a few seconds
      }
      p.x += sx; p.y += sy; p.z += sz;
      this.orient(p);
    }
  }

  explode(p, x, y, z) {
    const g = this.game, R = p.radius;
    g.effects.explosion(x, y, z, R);
    g.audio.play('explode');
    g.blocks.explode(x, y, z, Math.round(R), p.blockPower);
    const reach = R * 1.4;
    const victims = g.getTargets().slice();
    if (g.player?.alive) victims.push(g.player);
    let hitOther = false, killed = false;
    for (const t of victims) {
      if (!t.alive) continue;
      const tp = t.pos, h = t.height ?? 1.8;
      const d = Math.hypot(tp.x - x, tp.y + h / 2 - y, tp.z - z);
      if (d > reach) continue;
      const dmg = p.damage * (1 - d / reach) * (t === g.player ? 0.5 : 1);
      const dead = t.takeDamage(dmg, p.owner, false);
      if (t !== g.player && p.owner === g.player) { hitOther = true; killed = killed || !!dead; }
    }
    if (hitOther) { g.hud.hitmarker(killed); g.audio.play(killed ? 'kill' : 'hit'); }
  }
}
