import * as THREE from 'three';
import { makeCharacter } from '../player/Character.js';
import { loadModel, modelReady, makeModelCharacter, animateModel } from '../player/Model.js';

const CELL = 2;                       // terrain columns are 2 x 2 blocks
const X0 = -40, X1 = 40, Z0 = -60, Z1 = 20;   // 41 x 41 columns around and behind the plaza

/** Height (in blocks) of the terrain column that contains world position x,z: flat plaza in the middle, mountains further out and behind. */
export function groundAt(x, z) {
  const cx = Math.round(x / CELL) * CELL, cz = Math.round(z / CELL) * CELL;
  const d = Math.hypot(cx, cz);
  if (d < 9) return 1;
  const rough = 0.6 + 0.4 * Math.sin(cx * 0.45) * Math.cos(cz * 0.37);
  const back = 1 + Math.max(0, -cz) / 14;               // taller mountains behind the player
  return Math.max(1, Math.round(1 + (d - 9) * 0.42 * rough * back + 0.8 * Math.sin(cx * 0.3 + cz * 0.2)));
}

function emblemTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'); if (!x) return null;
  x.fillStyle = '#8a8f98'; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = '#ff8c28'; x.lineWidth = 10; x.beginPath(); x.arc(128, 128, 112, 0, 7); x.stroke();
  x.lineWidth = 5; x.strokeStyle = '#2a2f38'; x.beginPath(); x.arc(128, 128, 96, 0, 7); x.stroke();
  x.fillStyle = '#2a2f38';                                // 8-point star: the Block Ops mark
  x.beginPath(); for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 34 : 86; x.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r); } x.fill();
  x.fillStyle = '#ff8c28'; x.beginPath(); x.arc(128, 128, 16, 0, 7); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** The 3D home screen: your soldier on a plaza in a blocky mountain village, with a bird, clouds and a slowly swaying camera. Everything is original art made from boxes. */
export class Lobby3D {
  constructor(canvas, look, isVisible = () => true) {
    this.canvas = canvas; this.isVisible = isVisible; this.t = 0; this.yaw = 0.35; this.drag = null; this.raf = 0; this.dead = false;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fd3f5);
    this.scene.fog = new THREE.Fog(0xbfe0f5, 45, 120);
    this.camera = new THREE.PerspectiveCamera(38, 2, 0.1, 300);
    this.scene.add(new THREE.HemisphereLight(0xe4f2ff, 0x6a7a4a, 1.0));
    const sun = new THREE.DirectionalLight(0xfff0d0, 1.9); sun.position.set(-10, 18, 12); this.scene.add(sun, sun.target);
    this.buildWorld();
    this.setLook(look);
    this.bindDrag();
    this.resize = () => this.onResize(); window.addEventListener('resize', this.resize); this.onResize();
  }

  buildWorld() {
    const sc = this.scene, box = (w, h, d, c, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: c })); m.position.set(x, y, z); sc.add(m); return m; };

    // terrain: one instanced box per column, coloured by height (grass -> forest -> rock -> snow)
    const n = ((X1 - X0) / CELL + 1) * ((Z1 - Z0) / CELL + 1), inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), n);
    const dummy = new THREE.Object3D(), col = new THREE.Color(); let i = 0;
    for (let gx = X0; gx <= X1; gx += CELL) for (let gz = Z0; gz <= Z1; gz += CELL) {
      const h = groundAt(gx, gz);
      dummy.position.set(gx, h / 2 - 0.9, gz);   // column top sits at h - 0.9 (0.1 on the flat plaza ground) dummy.scale.set(CELL, h, CELL); dummy.updateMatrix();
      if (i < n) {
        inst.setMatrixAt(i, dummy.matrix);
        col.set(h <= 2 ? 0x6fb04a : h <= 5 ? 0x4f9a3e : h <= 9 ? 0x8a8a84 : 0xeef2f6);
        inst.setColorAt(i, col); i++;
      }
    }
    inst.count = Math.min(i, n);
    inst.frustumCulled = false;
    sc.add(inst);

    // plaza with the emblem
    const plaza = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.4, 0.3, 32), new THREE.MeshLambertMaterial({ color: 0x9a9fa8 }));
    plaza.position.y = 0.15; sc.add(plaza);
    const tex = emblemTexture();
    const em = new THREE.Mesh(new THREE.CircleGeometry(3.9, 32), new THREE.MeshLambertMaterial(tex ? { map: tex } : { color: 0x8a8f98 }));
    em.rotation.x = -Math.PI / 2; em.position.y = 0.31; sc.add(em);
    const blob = new THREE.Mesh(new THREE.CircleGeometry(0.55, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }));
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.33; sc.add(blob);

    // houses, a tower and trees placed on the terrain
    const house = (x, z, wall, roof, s = 1) => {
      const y = groundAt(x, z) - 0.4;
      box(4 * s, 3 * s, 4 * s, wall, x, y + 1.5 * s - 0.5, z);
      const r = new THREE.Mesh(new THREE.ConeGeometry(3.3 * s, 2 * s, 4), new THREE.MeshLambertMaterial({ color: roof }));
      r.rotation.y = Math.PI / 4; r.position.set(x, y + 4 * s - 0.5, z); sc.add(r);
      box(0.9 * s, 1.6 * s, 0.12, 0x4a3320, x, y + 0.8 * s - 0.5, z + 2.02 * s);
      box(0.8 * s, 0.8 * s, 0.12, 0x9fd8ff, x + 1.2 * s, y + 1.9 * s - 0.5, z + 2.02 * s);
    };
    house(-9, -6, 0xe8dcc0, 0xb04a3a); house(9, -9, 0xd8c8a0, 0x3a6aa5, 1.2); house(-15, -14, 0xe8dcc0, 0x6a8a3a);
    house(14, 4, 0xf0e6cc, 0xb04a3a, 0.9); house(-13, 5, 0xd8c8a0, 0x7a4a8a, 0.9);
    const ty = groundAt(18, -12) - 0.4;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, 9, 10), new THREE.MeshLambertMaterial({ color: 0xcfc6b0 }));
    tower.position.set(18, ty + 4, -12); sc.add(tower);
    const tr = new THREE.Mesh(new THREE.ConeGeometry(2.4, 3, 10), new THREE.MeshLambertMaterial({ color: 0x3a8a9a }));
    tr.position.set(18, ty + 10.5, -12); sc.add(tr);
    const rnd = (k) => { const s = Math.sin(k * 127.1) * 43758.5453; return s - Math.floor(s); };
    for (let k = 0; k < 18; k++) {
      const a = rnd(k) * Math.PI * 2, r = 9 + rnd(k + 50) * 14, x = Math.cos(a) * r, z = Math.sin(a) * r - 4;
      if (Math.abs(x + 9) < 4 && Math.abs(z + 6) < 4) continue;
      const y = groundAt(x, z) - 0.4;
      box(0.5, 2.2, 0.5, 0x6a4a2a, x, y + 0.6, z); box(2.2, 1.6, 2.2, 0x2f7a35, x, y + 2.4, z); box(1.4, 1.2, 1.4, 0x3a9a40, x, y + 3.6, z);
    }

    // clouds
    this.clouds = [];
    for (let k = 0; k < 7; k++) {
      const cg = new THREE.Group(), m = new THREE.MeshLambertMaterial({ color: 0xffffff });
      for (let j = 0; j < 4; j++) { const b = new THREE.Mesh(new THREE.BoxGeometry(5 + rnd(k * 9 + j) * 4, 1.6, 3 + rnd(k * 7 + j) * 2), m); b.position.set(j * 3.5 - 5, rnd(j + k) * 0.8, rnd(j * 3 + k) * 2); cg.add(b); }
      cg.position.set(-40 + rnd(k + 9) * 80, 17 + rnd(k + 4) * 9, -20 - rnd(k + 2) * 40); this.clouds.push(cg); sc.add(cg);
    }

    // bird circling over the plaza
    const bird = new THREE.Group(), bm = new THREE.MeshLambertMaterial({ color: 0x2a2a33 }), wm = new THREE.MeshLambertMaterial({ color: 0x3a3a48 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, 0.9), bm); bird.add(body);
    const beak = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.25), new THREE.MeshLambertMaterial({ color: 0xe0b020 })); beak.position.z = 0.55; bird.add(beak);
    this.wingL = new THREE.Group(); this.wingR = new THREE.Group();
    const wing = (side) => { const w = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.6), wm); w.position.x = side * 0.75; return w; };
    this.wingL.add(wing(-1)); this.wingR.add(wing(1)); this.wingL.position.x = -0.15; this.wingR.position.x = 0.15; bird.add(this.wingL, this.wingR);
    this.bird = bird; sc.add(bird);
  }

  /** Shows the chosen realistic model (loads it on demand) or the blocky character. onLoading(true/false) drives the "loading" chip. */
  setLook(look) {
    const seq = this.seq = (this.seq || 0) + 1;
    const place = (obj) => {
      if (this.hero) this.scene.remove(this.hero);
      this.hero = obj; obj.position.set(0, 0.32, 0); this.scene.add(obj); this.onLoading?.(false);
    };
    const blocky = () => place(makeCharacter(look, true));
    if (!look.model || look.model === 'blocky') return blocky();
    const build = () => makeModelCharacter(look.model, { armed: true });
    if (modelReady(look.model)) return place(build() || makeCharacter(look, true));
    if (this.hero) { this.scene.remove(this.hero); this.hero = null; }
    this.onLoading?.(true);
    loadModel(look.model).then((e) => { if (seq !== this.seq || this.dead) return; const m = e && build(); m ? place(m) : blocky(); });
  }

  onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.portrait = h > w;
    this.camera.fov = this.portrait ? 50 : 36;
    this.camera.updateProjectionMatrix();
  }

  bindDrag() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => { this.drag = { x: e.clientX, yaw: this.yaw }; try { c.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ } });
    c.addEventListener('pointermove', (e) => { if (this.drag) this.yaw = this.drag.yaw + (e.clientX - this.drag.x) * 0.012; });
    const end = () => { this.drag = null; };
    c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
  }

  frame(dt) {
    this.t += dt;
    const t = this.t, h = this.hero;
    if (h) {
      h.rotation.y = this.yaw + (this.drag ? 0 : Math.sin(t * 0.4) * 0.25);
      if (h.userData.isModel) animateModel(h, dt, 0);          // real idle animation
      else {
        h.scale.set(1, 1 + Math.sin(t * 2) * 0.008, 1);
        h.userData.armL.rotation.x = Math.sin(t * 1.6) * 0.05;
        h.userData.armR.rotation.x = -1.3 + Math.sin(t * 1.6) * 0.04;
      }
    }
    const cz = this.portrait ? 7.2 : 5.0;
    this.camera.position.set(Math.sin(t * 0.15) * 0.5, 1.45, cz);
    this.camera.lookAt(0, 1.05, 0);
    const a = t * 0.45;
    this.bird.position.set(Math.cos(a) * 7, 5.5 + Math.sin(t * 0.9) * 0.4, Math.sin(a) * 7 - 3);
    this.bird.rotation.y = -a + Math.PI;
    const flap = Math.sin(t * 8) * 0.6; this.wingL.rotation.z = flap; this.wingR.rotation.z = -flap;
    for (const c of this.clouds) { c.position.x += dt * 0.8; if (c.position.x > 55) c.position.x = -55; }
  }

  start() {
    let last = performance.now();
    const loop = (now) => {
      if (this.dead) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (document.hidden || !this.isVisible()) return;      // nothing to draw behind the game or the HUD editor
      this.frame(dt);
      this.renderer.render(this.scene, this.camera);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Frees the GPU when the match starts. */
  dispose() {
    this.dead = true; cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    try { this.renderer.dispose(); this.renderer.forceContextLoss?.(); } catch (_) { /* ignore */ }
  }
}
