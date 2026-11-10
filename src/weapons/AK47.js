import { Weapon } from './Weapon.js';

export class AK47 extends Weapon {
  constructor() {
    super({
      name: 'AK-47', damage: 28, headMult: 2, rpm: 600, mag: 30, reserve: 120, reloadTime: 2.2,
      spread: 0.022, adsSpreadMult: 0.3, recoilPitch: 0.013, recoilYaw: 0.005, recoilRecover: 6,
      range: 90, auto: true, blockDamage: 1, adsFov: 55, moveMult: 0.95, color: 0x4a3524, length: 0.75, sound: 'rifle',
    });
  }
}
