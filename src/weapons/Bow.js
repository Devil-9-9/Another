import { Weapon } from './Weapon.js';
/** Archery: hold FIRE to draw, release to loose. A full draw is fast, flat and deadly; arrows drop over distance. */
export class Bow extends Weapon {
  constructor(o = {}) {
    super({ name: 'BOW', type: 'bow', damage: 80, headMult: 2.2, rpm: 100, mag: 12, reserve: 48, reloadTime: 0.8,
      spread: 0.0, adsSpreadMult: 0, recoilPitch: 0.0, recoilYaw: 0, range: 220, auto: true, blockDamage: 1, adsFov: 58,
      moveMult: 1, color: 0x6b4a2a, length: 0.7, sound: 'bow', ...o });
  }
}
