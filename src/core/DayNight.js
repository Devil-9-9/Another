import * as THREE from 'three';
import { DAY_SEC, NIGHT_SEC } from './Constants.js';

const SKY_DAY = new THREE.Color(0x87c7f2);
const SKY_DUSK = new THREE.Color(0xf09a5a);
const SKY_NIGHT = new THREE.Color(0x1a2750);   // moonlit blue, not black (darker = harder to see)
const NIGHT_LIGHT = 0.55;                       // 0 = pitch dark night, 1 = as bright as day. Change this to taste
const SKY_HIGH = new THREE.Color(0x2448a0);
const SKY_CAVE = new THREE.Color(0x0a0506);

export class DayNight {
  constructor(scene, renderer, shadowRadius = 40) {
    this.scene = scene;
    this.time = 0.30; // 0..1 (0.25 = sunrise, 0.5 = noon, 0.75 = sunset)
    this.sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
    this.sun.castShadow = true;
    const s = this.sun.shadow;
    s.mapSize.set(1024, 1024);
    s.camera.left = -shadowRadius; s.camera.right = shadowRadius;
    s.camera.top = shadowRadius; s.camera.bottom = -shadowRadius;
    s.camera.near = 1; s.camera.far = 200;
    s.bias = -0.0006; s.normalBias = 0.05;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x445533, 0.7);
    scene.add(this.hemi);
    scene.background = SKY_DAY.clone();
    scene.fog = new THREE.Fog(SKY_DAY.clone(), 40, 120);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // visible sun & moon discs
    const mk = (c, r) => new THREE.Mesh(new THREE.SphereGeometry(r, 12, 12), new THREE.MeshBasicMaterial({ color: c, fog: false }));
    this.sunMesh = mk(0xfff4c0, 6); this.moonMesh = mk(0xdfe8ff, 4);
    scene.add(this.sunMesh, this.moonMesh);
    this.stars = this.makeStars();
    scene.add(this.stars);
  }

  makeStars() {
    const pts = [];
    for (let i = 0; i < 400; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.05, Math.random() - 0.5).normalize().multiplyScalar(300);
      pts.push(v.x, v.y, v.z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  }

  get clock() {
    const mins = Math.floor(((this.time * 24 + 6) % 24) * 60); // time 0 -> 06:00
    return String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
  }

  setTime(t) { this.time = ((t % 1) + 1) % 1; }

  /** env: { under: 0..1 (how deep underground), high: 0..1 (how high in the sky realms), water: camera is submerged } */
  update(dt, focus, env = {}) {
    const under = env.under || 0, high = env.high || 0;
    // time 0.25..0.75 is daytime (sun up), the rest is night. Each half advances at its own speed so day and night can have different lengths.
    const isDay = this.time >= 0.25 && this.time < 0.75;
    this.time = (this.time + dt * 0.5 / (isDay ? DAY_SEC : NIGHT_SEC)) % 1;
    const ang = (this.time - 0.25) * Math.PI * 2;      // sun above horizon between 0.25 and 0.75
    const dir = new THREE.Vector3(Math.cos(ang) * 0.8, Math.sin(ang), 0.45).normalize();
    const elev = dir.y;                                 // -1..1
    const day = THREE.MathUtils.smoothstep(elev, -0.05, 0.25);
    const dusk = 1 - Math.min(1, Math.abs(elev) / 0.3);

    // shadow-casting light follows the player, snapped to a texel-ish grid to avoid shimmering
    const snap = (v) => Math.round(v / 2) * 2;
    this.sun.target.position.set(snap(focus.x), snap(focus.y), snap(focus.z)); // follows you up into the sky and down into the underworld
    this.sun.position.copy(this.sun.target.position).addScaledVector(dir.y > 0.02 ? dir : dir.clone().multiplyScalar(-1), 100);
    this.sun.intensity = Math.max(0.0, day) * 2.2;
    this.sun.castShadow = elev > 0.02 || elev < -0.12; // moon casts a weak shadow too
    if (elev < 0) { this.sun.color.set(0x8fa6e8); this.sun.intensity = Math.max(this.sun.intensity, 0.35 + NIGHT_LIGHT * 0.9); }  // moonlight
    else this.sun.color.set(0xfff2d8).lerp(new THREE.Color(0xff9a50), dusk * 0.7);

    this.sun.intensity *= (1 - under);
    this.hemi.intensity = (0.12 + day * 0.65 + (1 - day) * NIGHT_LIGHT * 0.55) * (1 - 0.88 * under) + 0.03;   // ambient light, kept up at night

    const sky = SKY_NIGHT.clone().lerp(SKY_DAY, day).lerp(SKY_DUSK, dusk * 0.55 * (day > 0.02 ? 1 : 0.4));
    sky.lerp(SKY_HIGH, high * 0.65 * day);                 // deeper blue as you climb into the sky realms
    sky.lerp(SKY_CAVE, under);                             // near-black underground
    let near = 40 + day * 20, far = 120 + day * 40 + high * 60;   // fog: you can see further at night
    if (under > 0) { near = near * (1 - under) + 3 * under; far = far * (1 - under) + 60 * under; }
    if (env.water) { sky.set(0x1d5c9a); near = 0.4; far = 18; }   // murky blue underwater
    this.scene.background.copy(sky);
    this.scene.fog.color.copy(sky);
    this.scene.fog.near = near;
    this.scene.fog.far = far;
    if (this.lamp) this.lamp.intensity = under * 1.5;      // headlamp so caves are explorable
    this.stars.material.opacity = Math.max(1 - day, high * 0.5);

    this.sunMesh.position.copy(focus).addScaledVector(dir, 220);
    this.moonMesh.position.copy(focus).addScaledVector(dir, -220);
    this.stars.position.copy(focus);
  }
}
