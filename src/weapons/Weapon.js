/** Base weapon: stats + ammo state machine. Firing/hit resolution lives in WeaponManager. */
export class Weapon {
  constructor(cfg) {
    Object.assign(this, {
      name: 'Weapon', damage: 20, headMult: 2, rpm: 600, mag: 30, reserve: 90, reloadTime: 2,
      spread: 0.02, adsSpreadMult: 0.3, recoilPitch: 0.012, recoilYaw: 0.004, recoilRecover: 7,
      pellets: 1, range: 90, auto: true, blockDamage: 1, adsFov: 55, scope: false,
      moveMult: 1, color: 0x333333, length: 0.7, sound: 'rifle',
    }, cfg);
    this.ammo = this.mag;
    this.cooldown = 0;
    this.reloadLeft = 0;
  }

  get reloading() { return this.reloadLeft > 0; }
  get interval() { return 60 / this.rpm; }

  canFire() { return this.cooldown <= 0 && !this.reloading && this.ammo > 0; }

  startReload() {
    if (this.reloading || this.ammo >= this.mag || this.reserve <= 0) return false;
    this.reloadLeft = this.reloadTime;
    return true;
  }

  cancelReload() { this.reloadLeft = 0; }

  tick(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.reloadLeft > 0) {
      this.reloadLeft -= dt;
      if (this.reloadLeft <= 0) {
        const take = Math.min(this.mag - this.ammo, this.reserve);
        this.ammo += take; this.reserve -= take; this.reloadLeft = 0;
      }
    }
  }

  consumeShot() { this.ammo--; this.cooldown = this.interval; }

  refill() { this.ammo = this.mag; this.reserve = this.mag * 4; this.reloadLeft = 0; this.cooldown = 0; }
}
