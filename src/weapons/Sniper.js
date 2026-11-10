import { Weapon } from './Weapon.js';

export class Sniper extends Weapon {
  constructor() {
    super({
      name: 'SNIPER', damage: 95, headMult: 2.5, rpm: 48, mag: 5, reserve: 25, reloadTime: 3.2,
      spread: 0.035, adsSpreadMult: 0.0, recoilPitch: 0.05, recoilYaw: 0.01, recoilRecover: 4,
      range: 220, auto: false, blockDamage: 4, adsFov: 14, scope: true, moveMult: 0.85, color: 0x2c3a2c, length: 1.0, sound: 'sniper',
    });
  }
}
