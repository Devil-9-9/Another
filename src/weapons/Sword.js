import { Weapon } from './Weapon.js';
/** Melee: hold FIRE to swing. Short reach, no ammo, also chips blocks. */
export class Sword extends Weapon {
  constructor(o = {}) {
    super({ name: 'SWORD', type: 'melee', damage: 55, headMult: 1.5, rpm: 110, mag: Infinity, reserve: Infinity, reloadTime: 0,
      range: 3.2, auto: true, blockDamage: 2, adsFov: 75, moveMult: 1.12, color: 0xb8c8d8, length: 0.9, sound: 'sword', ...o });
  }
}
