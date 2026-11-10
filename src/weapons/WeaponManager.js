import { AK47 } from './AK47.js';
import { Sniper } from './Sniper.js';
import { Pistol } from './Pistol.js';
import { Shotgun } from './Shotgun.js';
import { SMG } from './SMG.js';
import { RPG } from './RPG.js';
import { Sword } from './Sword.js';
import { Bow } from './Bow.js';
import { Fists, WoodenSword, StoneSword, IronSword } from './Melee.js';
import { resolveShot, falloff } from './Ballistics.js';

/**
 * Player-owned weapons: ammo, reload, recoil, ADS, spread and shot resolution.
 * `game` provides: world, blocks, effects, audio, hud, getTargets(), net, camera.
 */
export class WeaponManager {
  constructor(game) {
    this.game = game;
    this.weapons = [new AK47(), new Sniper(), new Pistol(), new Shotgun(), new SMG(), new RPG(), new Sword(), new Bow()];
    this.draw = 0;                 // bow draw 0..1
    this.cur = 0;
    this.recoilAccum = 0;
    this.wasFire = false;
    this.swapT = 0;
    this.onChange = null;
  }

  get weapon() { return this.weapons[this.cur]; }

  /**
   * Survival: only what you own. keys = ['fists', 'wooden_sword', ...]. Instances are cached so ammo survives swapping.
   * Bow and rocket ammo come from the inventory totals in `ammo` ({bow, rocket}).
   */
  setLoadout(keys, ammo = {}) {
    this.cache = this.cache || {};
    const make = {
      fists: () => new Fists(), wooden_sword: () => new WoodenSword(), stone_sword: () => new StoneSword(), iron_sword: () => new IronSword(),
      bow: () => new Bow({ damage: 22, mag: 12, reserve: 0 }), rocket: () => new RPG({ damage: 70, blockDamage: 14, radius: 3.5, mag: 1, reserve: 0 }),
    };
    const prevKey = this.keys?.[this.cur];
    for (const k of keys) if (!this.cache[k]) {
      const w = make[k]();
      if (k === 'bow' || k === 'rocket') { const total = ammo[k] || 0; w.ammo = Math.min(w.mag, total); w.reserve = total - w.ammo; }
      this.cache[k] = w;
    }
    for (const k of Object.keys(this.cache)) if (!keys.includes(k)) delete this.cache[k];      // lost weapons lose their ammo too
    this.keys = keys; this.weapons = keys.map((k) => this.cache[k]);
    this.cur = Math.max(0, keys.indexOf(prevKey));
    this.draw = 0; this.onChange?.(this.weapon);
  }

  /** Creative: back to the full arsenal. */
  restoreAll() {
    this.keys = null; this.cache = {};
    this.weapons = [new AK47(), new Sniper(), new Pistol(), new Shotgun(), new SMG(), new RPG(), new Sword(), new Bow()];
    this.cur = 0; this.onChange?.(this.weapon);
  }

  /** Current survival ammo totals, written back to the inventory state. */
  ammoTotals() {
    const out = {};
    this.keys?.forEach((k, i) => { if (k === 'bow' || k === 'rocket') out[k] = this.weapons[i].ammo + this.weapons[i].reserve; });
    return out;
  }

  select(i) {
    if (i === this.cur || i < 0 || i >= this.weapons.length) return;
    this.weapon.cancelReload();
    this.cur = i;
    this.draw = 0; this.game.viewModel?.setDraw?.(0);
    this.swapT = 0.35;
    this.recoilAccum = 0;
    this.onChange?.(this.weapon);
  }

  next() { this.select((this.cur + 1) % this.weapons.length); }

  refillAll() { for (const w of this.weapons) w.refill(); }

  /** Called every frame while in COMBAT mode (or always, to tick cooldowns). */
  update(dt, input, player, combatMode) {
    const w = this.weapon;
    for (const x of this.weapons) x.tick(dt);
    if (this.swapT > 0) this.swapT -= dt;

    // recoil recovery: pull the view back down toward where it started
    if (this.recoilAccum > 0) {
      const rec = Math.min(this.recoilAccum, this.recoilAccum * w.recoilRecover * dt + 0.0004);
      player.pitch -= rec; this.recoilAccum -= rec;
    }

    player.ads = combatMode && player.alive && input.aim && !w.reloading && this.swapT <= 0;
    player.speedMult = w.moveMult;
    player.lookMult = player.ads ? (w.scope ? 0.25 : 0.6) : 1;

    if (!combatMode || !player.alive) { this.wasFire = input.fire; return; }

    if (input.consume('reload') && w.startReload()) this.game.audio.play('reload');

    if (w.type === 'melee') { this.updateMelee(player, w, input); this.wasFire = input.fire; return; }
    if (w.type === 'bow') { this.updateBow(dt, player, w, input); this.wasFire = input.fire; return; }

    const trigger = input.fire && (w.auto || !this.wasFire);
    this.wasFire = input.fire;
    if (!trigger || this.swapT > 0 || w.reloading) return;
    if (w.ammo <= 0) {
      if (!this.wasEmptyClick) this.game.audio.play('empty');
      this.wasEmptyClick = true;
      if (w.startReload()) this.game.audio.play('reload');
      return;
    }
    this.wasEmptyClick = false;
    if (!w.canFire()) return;
    this.fire(player, w);
  }

  /** Sword: hold FIRE to keep swinging. Hits whatever is in reach in front of you. */
  updateMelee(player, w, input) {
    const g = this.game;
    if (!input.fire || w.cooldown > 0 || this.swapT > 0) return;
    w.cooldown = w.interval;
    g.audio.play('sword'); g.viewModel.swing();
    const o = player.eyePos, f = player.forward(), r = player.right();
    const targets = g.getTargets();
    let res = null;
    for (const off of [0, -0.3, 0.3]) {                         // three rays so a swing has some width
      let d = { x: f.x + r.x * off, y: f.y, z: f.z + r.z * off };
      const len = Math.hypot(d.x, d.y, d.z); d = { x: d.x / len, y: d.y / len, z: d.z / len };
      const t = resolveShot(g.world, o, d, w.range, targets, player);
      if (t.kind === 'entity') { res = t; break; }
      if (!res && t.kind === 'block') res = t;
    }
    if (!res) return;
    if (res.kind === 'entity') {
      const dead = res.target.takeDamage(w.damage * (res.headshot ? w.headMult : 1), player, res.headshot);
      g.hud.hitmarker(!!dead); g.audio.play(dead ? 'kill' : 'hit');
      g.effects.blockDebris(res.point.x - 0.5, res.point.y - 0.5, res.point.z - 0.5, 7, 2, 2.2);
    } else {
      g.blocks.hit(res.block.x, res.block.y, res.block.z, w.blockDamage);
      g.effects.impact(res.point.x, res.point.y, res.point.z, res.block.id);
    }
  }

  /** Bow: hold to draw (0.8 s to full), release to shoot. */
  updateBow(dt, player, w, input) {
    const g = this.game;
    if (w.reloading || this.swapT > 0) { this.draw = 0; g.viewModel.setDraw(0); return; }
    if (input.fire) {
      if (w.ammo <= 0) {
        if (!this.wasFire) { g.audio.play('empty'); if (w.startReload()) g.audio.play('reload'); }
        return;
      }
      this.draw = Math.min(1, this.draw + dt / 0.8);
      g.viewModel.setDraw(this.draw);
    } else if (this.draw > 0) {
      if (this.draw >= 0.2 && w.canFire()) this.fireArrow(player, w, this.draw);
      this.draw = 0; g.viewModel.setDraw(0);
    }
  }

  fireArrow(player, w, draw) {
    const g = this.game;
    w.consumeShot(); g.audio.play('bow'); g.viewModel.kickShot(0.4);
    const o = player.eyePos, f = player.forward(), r = player.right();
    const s = (1 - draw) * 0.04;
    let d = { x: f.x + (Math.random() - 0.5) * s, y: f.y + (Math.random() - 0.5) * s, z: f.z + (Math.random() - 0.5) * s };
    const len = Math.hypot(d.x, d.y, d.z); d = { x: d.x / len, y: d.y / len, z: d.z / len };
    const from = { x: o.x + f.x * 0.6 + r.x * 0.12, y: o.y + f.y * 0.6 - 0.1, z: o.z + f.z * 0.6 + r.z * 0.12 };
    g.projectiles.spawn({ kind: 'arrow', from, dir: d, speed: 22 + 52 * draw, gravity: 9.81, damage: w.damage * (0.35 + 0.65 * draw), headMult: w.headMult, owner: player });
    g.net?.sendShot(from, { x: from.x + d.x * 14, y: from.y + d.y * 14, z: from.z + d.z * 14 }, this.cur);
  }

  fireRocket(player, w) {
    const g = this.game;
    const o = player.eyePos, f = player.forward(), r = player.right();
    const from = { x: o.x + f.x * 0.9 + r.x * 0.15, y: o.y + f.y * 0.9 - 0.12, z: o.z + f.z * 0.9 + r.z * 0.15 };
    g.projectiles.spawn({ kind: 'rocket', from, dir: f, speed: w.speed, gravity: 0, damage: w.damage, owner: player, radius: w.radius, blockPower: w.blockDamage });
    g.effects.muzzle(g.v3(from));
    g.net?.sendShot(from, { x: from.x + f.x * 20, y: from.y + f.y * 20, z: from.z + f.z * 20 }, this.cur);
    player.pitch = Math.min(1.5, player.pitch + w.recoilPitch); this.recoilAccum += w.recoilPitch * 0.85;
  }

  fire(player, w) {
    const g = this.game;
    w.consumeShot();
    g.audio.play(w.sound);
    g.viewModel.kickShot(w.type === 'launcher' ? 1.4 : w.pellets > 1 ? 1.2 : 0.7);
    if (w.type === 'launcher') { this.fireRocket(player, w); return; }

    // spread: tighter when aiming / crouched, wider when moving or airborne
    const b = player.body;
    const moving = Math.hypot(b.vx, b.vz) > 1.5;
    let spread = w.spread * (player.ads ? w.adsSpreadMult : 1) * (moving ? 1.5 : 1) * (player.crouching ? 0.7 : 1) * (b.onGround ? 1 : 2.2);

    const o = player.eyePos;
    const f = player.forward(), r = player.right();
    const up = { x: -Math.sin(player.pitch) * Math.sin(player.yaw), y: Math.cos(player.pitch), z: -Math.sin(player.pitch) * Math.cos(player.yaw) };
    const muzzle = { x: o.x + f.x * 0.7 + r.x * 0.18, y: o.y + f.y * 0.7 - 0.12, z: o.z + f.z * 0.7 + r.z * 0.18 };
    g.effects.muzzle(g.v3(muzzle));

    const targets = g.getTargets();
    let hitAny = false, killed = false;
    for (let p = 0; p < w.pellets; p++) {
      const sx = (Math.random() - 0.5) * 2 * spread, sy = (Math.random() - 0.5) * 2 * spread;
      let d = { x: f.x + r.x * sx + up.x * sy, y: f.y + up.y * sy, z: f.z + r.z * sx + up.z * sy + 0 };
      const len = Math.hypot(d.x, d.y, d.z); d = { x: d.x / len, y: d.y / len, z: d.z / len };
      const res = resolveShot(g.world, o, d, w.range, targets, player);
      g.effects.tracer(g.v3(muzzle), g.v3(res.point));
      g.net?.sendShot(muzzle, res.point, this.cur);

      if (res.kind === 'entity') {
        const dmg = w.damage * falloff(res.t, w.range) * (res.headshot ? w.headMult : 1);
        const dead = res.target.takeDamage(dmg, player, res.headshot);
        hitAny = true; killed = killed || !!dead;
        g.effects.blockDebris(res.point.x - 0.5, res.point.y - 0.5, res.point.z - 0.5, 7, 2, 2.2); // blood-ish sparks
      } else if (res.kind === 'block') {
        const bl = res.block;
        g.blocks.hit(bl.x, bl.y, bl.z, w.blockDamage);
        g.effects.impact(res.point.x, res.point.y, res.point.z, bl.id);
      }
    }
    if (hitAny) g.hud.hitmarker(killed);
    if (hitAny) g.audio.play(killed ? 'kill' : 'hit');

    // recoil: pitch kicks up (recovers later), yaw wobbles
    const kick = w.recoilPitch * (player.ads ? 0.7 : 1) * (0.85 + Math.random() * 0.3);
    player.pitch = Math.min(1.5, player.pitch + kick);
    this.recoilAccum += kick * 0.85;
    player.yaw += (Math.random() - 0.5) * 2 * w.recoilYaw;
  }
}
