import { Weapon } from './Weapon.js';
export class SMG extends Weapon {
  constructor() {
    super({ name: 'SMG', damage: 19, headMult: 1.8, rpm: 900, mag: 32, reserve: 160, reloadTime: 1.7,
      spread: 0.04, adsSpreadMult: 0.5, recoilPitch: 0.008, recoilYaw: 0.006, recoilRecover: 8,
      range: 70, auto: true, blockDamage: 1, adsFov: 62, moveMult: 1.05, color: 0x3a3a44, length: 0.5, sound: 'pistol' });
  }
}
