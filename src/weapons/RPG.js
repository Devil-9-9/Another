import { Weapon } from './Weapon.js';
/** Rocket launcher: one rocket per reload. The blast breaks blocks and hurts everything nearby (including you). */
export class RPG extends Weapon {
  constructor(o = {}) {
    super({ name: 'ROCKET', type: 'launcher', damage: 130, headMult: 1, rpm: 40, mag: 1, reserve: 6, reloadTime: 2.6,
      spread: 0.006, adsSpreadMult: 0.3, recoilPitch: 0.06, recoilYaw: 0.01, recoilRecover: 4,
      range: 200, auto: false, blockDamage: 18, adsFov: 60, moveMult: 0.8, color: 0x4a5a3a, length: 0.95, sound: 'rocket',
      speed: 48, radius: 4.5, ...o });
  }
}
