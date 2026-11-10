import * as THREE from 'three';

/** First-person gun made of boxes, parented to the camera. Handles ADS slide, recoil kick, reload dip, walk bob. */
export class ViewModel {
  constructor(camera) {
    this.camera = camera;
    this.root = new THREE.Group();
    camera.add(this.root);
    this.gun = new THREE.Group();
    this.root.add(this.gun);
    this.kick = 0; this.ads = 0; this.bob = 0; this.reload = 0; this.swingT = 0; this.draw = 0; this.bowParts = null;
    this.mat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    this.dark = new THREE.MeshLambertMaterial({ color: 0x151515 });
    this.hand = new THREE.MeshLambertMaterial({ color: 0xe0b48a });
    this.parts = [];
  }

  setWeapon(w) {
    for (const p of this.parts) { this.gun.remove(p); p.geometry.dispose(); }
    this.parts = [];
    const add = (sx, sy, sz, x, y, z, mat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
      m.position.set(x, y, z); this.gun.add(m); this.parts.push(m); return m;
    };
    const body = new THREE.MeshLambertMaterial({ color: w.color });
    const L = w.length;
    this.bowParts = null;
    if (w.fists) { add(0.09, 0.09, 0.16, 0.0, -0.05, -0.3, this.hand); this.root.visible = true; return; }   // bare hands
    if (w.type === 'melee') {                                // sword: grip, guard, long blade
      const steel = new THREE.MeshLambertMaterial({ color: w.bladeColor || 0xc9d6e2 }), gold = new THREE.MeshLambertMaterial({ color: 0xd8b030 });
      add(0.04, 0.16, 0.04, 0, -0.1, -0.3, new THREE.MeshLambertMaterial({ color: 0x4a2f1c }));
      add(0.2, 0.03, 0.05, 0, 0.0, -0.3, gold);
      const blade = add(0.05, 0.8, 0.012, 0, 0.42, -0.3, steel); blade.rotation.x = -0.12;
      add(0.07, 0.07, 0.14, 0.0, -0.12, -0.28, this.hand);
      this.root.visible = true; return;
    }
    if (w.type === 'bow') {                                  // bow: grip + two limbs + string + nocked arrow
      const wood = new THREE.MeshLambertMaterial({ color: 0x6b4a2a }), str = new THREE.MeshLambertMaterial({ color: 0xeeeeee });
      add(0.04, 0.2, 0.05, 0, 0, -0.4, wood);
      const up = add(0.03, 0.3, 0.04, 0, 0.22, -0.34, wood); up.rotation.x = 0.55;
      const lo = add(0.03, 0.3, 0.04, 0, -0.22, -0.34, wood); lo.rotation.x = -0.55;
      const string = add(0.008, 0.72, 0.008, 0, 0, -0.2, str);
      const arrow = add(0.015, 0.015, 0.7, 0, 0.02, -0.55, new THREE.MeshLambertMaterial({ color: 0xcaa66a }));
      add(0.07, 0.07, 0.12, 0.02, -0.06, -0.38, this.hand);
      this.bowParts = { string, arrow };
      this.root.visible = true; return;
    }
    add(0.07, 0.1, L, 0, 0, -L / 2, body);                 // receiver / barrel
    add(0.04, 0.04, L * 0.45, 0, 0.02, -L - L * 0.2, this.dark); // barrel extension
    add(0.06, 0.16, 0.08, 0, -0.12, -L * 0.15, this.dark); // grip
    if (w.scope) add(0.05, 0.05, 0.28, 0, 0.09, -L * 0.45, this.dark);
    else add(0.015, 0.03, 0.015, 0, 0.065, -L * 0.9, this.dark); // front sight
    if (w.mag > 6) add(0.05, 0.2, 0.08, 0, -0.14, -L * 0.5, this.dark); // magazine
    add(0.07, 0.07, 0.14, 0.02, -0.04, 0.02, this.hand);   // hand
    this.root.visible = true;
  }

  kickShot(amount = 1) { this.kick = Math.min(1.5, this.kick + amount); }
  swing() { this.swingT = 0.32; }
  /** Bow draw 0..1: pulls the string and arrow back. */
  setDraw(d) {
    this.draw = d;
    if (this.bowParts) { this.bowParts.string.position.z = -0.2 + d * 0.22; this.bowParts.arrow.position.z = -0.55 + d * 0.22; }
  }

  update(dt, { ads, reloading, moving, sprinting, visible }) {
    this.root.visible = visible;
    this.ads += ((ads ? 1 : 0) - this.ads) * Math.min(1, dt * 14);
    this.reload += ((reloading ? 1 : 0) - this.reload) * Math.min(1, dt * 8);
    this.kick *= Math.max(0, 1 - dt * 16);
    this.bob += dt * (sprinting ? 12 : 8) * (moving ? 1 : 0.2);
    const bobAmt = moving ? (sprinting ? 0.02 : 0.01) * (1 - this.ads) : 0.002;
    const hip = { x: 0.24, y: -0.22, z: -0.45 };
    const adsP = { x: 0.0, y: -0.115, z: -0.35 };
    const lerp = (a, b) => a + (b - a) * this.ads;
    this.root.position.set(
      lerp(hip.x, adsP.x) + Math.sin(this.bob) * bobAmt,
      lerp(hip.y, adsP.y) + Math.abs(Math.cos(this.bob)) * bobAmt - this.reload * 0.18,
      lerp(hip.z, adsP.z) + this.kick * 0.07,
    );
    let sw = 0;
    if (this.swingT > 0) { this.swingT -= dt; sw = Math.sin(Math.PI * (1 - Math.max(0, this.swingT) / 0.32)); this.root.position.x -= sw * 0.28; this.root.position.y += sw * 0.05; }
    this.root.rotation.set(this.kick * 0.08 + this.reload * 0.6 + (sprinting ? 0.35 : 0) - sw * 0.9, (sprinting ? 0.4 : 0) + sw * 0.7, this.reload * -0.3 - sw * 1.1);
  }
}
