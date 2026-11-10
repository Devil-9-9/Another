import * as THREE from 'three';

const mats = new Map();
const mat = (c) => { if (!mats.has(c)) mats.set(c, new THREE.MeshLambertMaterial({ color: c })); return mats.get(c); };
const box = (w, h, d, c, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
  m.position.set(x, y, z); m.castShadow = true; return m;
};

// body [w,h,l], head [w,h,l]; legH = leg length; w/h = collision box; speed in m/s; hp
export const ANIMALS = {
  cow:     { body: [0.7, 0.65, 1.1],  color: 0xf0eee8, patch: 0x2b2b2b, head: [0.42, 0.42, 0.42], headColor: 0xe6ddd2, legH: 0.55, w: 0.45, h: 1.3, speed: 1.1, hp: 20, weight: 3 },
  pig:     { body: [0.55, 0.5, 0.85], color: 0xf0a0a8, head: [0.38, 0.34, 0.36], headColor: 0xe8909a, legH: 0.3,  w: 0.4,  h: 0.9, speed: 1.3, hp: 14, weight: 3 },
  sheep:   { body: [0.65, 0.6, 0.9],  color: 0xf4f1e8, head: [0.32, 0.34, 0.34], headColor: 0x3a3330, legH: 0.42, w: 0.4,  h: 1.1, speed: 1.1, hp: 16, weight: 3 },
  chicken: { body: [0.3, 0.3, 0.42],  color: 0xffffff, head: [0.18, 0.2, 0.18],  headColor: 0xffffff, legH: 0.22, w: 0.2,  h: 0.6, speed: 1.6, hp: 6,  weight: 2, chicken: true },
};

/** Four-legged farm animal. Origin at the feet, faces +Z. */
export function makeQuadruped(kind) {
  const c = ANIMALS[kind];
  const g = new THREE.Group();
  const [bw, bh, bl] = c.body, [hw, hh, hl] = c.head;
  const by = c.legH + bh / 2;
  g.add(box(bw, bh, bl, c.color, 0, by, 0));
  if (c.patch) {
    g.add(box(bw + 0.02, bh * 0.45, bl * 0.3, c.patch, 0, by + 0.08, -0.15));
    g.add(box(bw * 0.4, bh * 0.4, bl * 0.28 + 0.02, c.patch, bw * 0.3, by - 0.05, 0.25));
  }
  g.add(box(hw, hh, hl, c.headColor, 0, c.legH + bh * 0.8, bl / 2 + hl * 0.35));
  if (kind === 'cow') { g.add(box(0.06, 0.12, 0.06, 0xd8cfc0, -0.2, c.legH + bh * 0.8 + 0.28, bl / 2 + 0.1)); g.add(box(0.06, 0.12, 0.06, 0xd8cfc0, 0.2, c.legH + bh * 0.8 + 0.28, bl / 2 + 0.1)); }
  if (kind === 'pig') g.add(box(0.2, 0.14, 0.08, 0xd4707c, 0, c.legH + bh * 0.72, bl / 2 + hl * 0.35 + hl / 2));
  if (c.chicken) {
    g.add(box(0.07, 0.07, 0.12, 0xf0a020, 0, c.legH + bh * 0.8, bl / 2 + hl * 0.35 + hl / 2));   // beak
    g.add(box(0.05, 0.08, 0.1, 0xd02020, 0, c.legH + bh * 0.8 + hh / 2 + 0.03, bl / 2 + hl * 0.35)); // comb
  }
  const legs = [];
  const lw = c.chicken ? 0.05 : 0.15;
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * bw * 0.32, c.legH, sz * bl * 0.33);
    const leg = box(lw, c.legH, lw, c.chicken ? 0xf0a020 : (kind === 'sheep' ? 0x3a3330 : c.color), 0, -c.legH / 2, 0);
    pivot.add(leg); g.add(pivot); legs.push(pivot);
  }
  g.userData = { legs, phase: Math.random() * 6 };
  return g;
}

export function swingLegs(g, dt, speed) {
  const u = g.userData;
  u.phase += dt * Math.min(speed, 4) * 5;
  const a = Math.sin(u.phase) * Math.min(1, speed / 1.2) * 0.7;
  u.legs[0].rotation.x = a; u.legs[3].rotation.x = a;
  u.legs[1].rotation.x = -a; u.legs[2].rotation.x = -a;
}

const FISH_COLORS = [0xf08030, 0x5aa0e0, 0xe0d040, 0xd05080, 0x70c080];
/** Little fish. Origin at its centre, faces +Z. */
export function makeFish(i = 0) {
  const col = FISH_COLORS[i % FISH_COLORS.length];
  const g = new THREE.Group();
  g.add(box(0.16, 0.22, 0.5, col));
  g.add(box(0.04, 0.12, 0.2, col, 0, 0.16, -0.05));
  const tail = new THREE.Group(); tail.position.z = -0.25;
  tail.add(box(0.04, 0.24, 0.16, col, 0, 0, -0.08));
  g.add(tail);
  g.add(box(0.05, 0.05, 0.02, 0x101010, 0.09, 0.04, 0.18)); g.add(box(0.05, 0.05, 0.02, 0x101010, -0.09, 0.04, 0.18));
  g.userData = { tail, t: Math.random() * 6 };
  return g;
}

/** Speech bubble sprite shown above a villager's head. */
export function makeBubble() {
  const c = document.createElement('canvas'); c.width = 320; c.height = 64;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, fog: false }));
  sprite.scale.set(2.4, 0.48, 1); sprite.position.y = 2.35; sprite.renderOrder = 11; sprite.visible = false;
  const set = (text) => {
    ctx.clearRect(0, 0, 320, 64);
    ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.beginPath(); ctx.roundRect(4, 4, 312, 56, 14); ctx.fill();
    ctx.fillStyle = '#222'; ctx.font = 'bold 26px system-ui'; ctx.textAlign = 'center'; ctx.fillText(text, 160, 41);
    tex.needsUpdate = true; sprite.visible = true;
  };
  return { sprite, set, hide: () => { sprite.visible = false; } };
}
