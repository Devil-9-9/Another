import { Weapon } from './Weapon.js';

export class Pistol extends Weapon {
  constructor() {
    super({
      name: 'PISTOL', damage: 22, headMult: 2, rpm: 380, mag: 12, reserve: 60, reloadTime: 1.4,
      spread: 0.014, adsSpreadMult: 0.4, recoilPitch: 0.02, recoilYaw: 0.004, recoilRecover: 9,
      range: 60, auto: false, blockDamage: 0.5, adsFov: 65, moveMult: 1.05, color: 0x222428, length: 0.4, sound: 'pistol',
    });
  }
}
