import { Weapon } from './Weapon.js';

export class Shotgun extends Weapon {
  constructor() {
    super({
      name: 'SHOTGUN', damage: 13, headMult: 1.5, rpm: 70, mag: 6, reserve: 30, reloadTime: 3.0,
      spread: 0.075, adsSpreadMult: 0.6, recoilPitch: 0.06, recoilYaw: 0.01, recoilRecover: 5,
      pellets: 8, range: 32, auto: false, blockDamage: 0.6, adsFov: 62, moveMult: 0.95, color: 0x3a2a1a, length: 0.8, sound: 'shotgun',
    });
  }
}
