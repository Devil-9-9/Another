import * as THREE from 'three';

/** Everything a player can pick in the wardrobe. Colours are stored as indices so saved/sent data stays tiny and safe. */
export const LOOK_OPTIONS = {
  skin: [0xf1c9a5, 0xe0b48a, 0xc68a5c, 0x8d5a3b, 0x5a3a26],
  hoodie: [0x1b1b22, 0xb03a3a, 0x2f6fd0, 0x3a8a4a, 0x8a4ad0, 0xe0a020, 0xe8e8ee],
  pants: [0x1d2230, 0x3a3f4a, 0x5a4a32, 0x2a4a3a, 0x7a2a2a],
  hairColor: [0x1a1a1a, 0x5a3a1a, 0xc8a050, 0xcc2222, 0x2a7ad0, 0xeeeeee, 0x7fd0f0],
  hair: ['mohawk', 'short', 'swept', 'beanie', 'none'],
  mask: ['none', 'glasses', 'clown', 'skull', 'visor'],
  outfit: ['hoodie', 'coat'],
  model: ['remy', 'kachujin', 'eve', 'blocky'],
};
export const DEFAULT_LOOK = { skin: 1, hoodie: 0, pants: 0, hairColor: 3, hair: 'mohawk', mask: 'clown', outfit: 'hoodie', model: 'remy' };

const idx = (v, list, d) => (Number.isInteger(v) && v >= 0 && v < list.length ? v : d);
const pick = (v, list, d) => (list.includes(v) ? v : d);

/** Never trust a look: it comes from localStorage or from another player over the network. */
export function sanitizeLook(l) {
  const o = LOOK_OPTIONS, d = DEFAULT_LOOK, s = l && typeof l === 'object' ? l : {};
  return {
    skin: idx(s.skin, o.skin, d.skin), hoodie: idx(s.hoodie, o.hoodie, d.hoodie), pants: idx(s.pants, o.pants, d.pants),
    hairColor: idx(s.hairColor, o.hairColor, d.hairColor), hair: pick(s.hair, o.hair, d.hair), mask: pick(s.mask, o.mask, d.mask), outfit: pick(s.outfit, o.outfit, d.outfit), model: pick(s.model, o.model, d.model),
  };
}

/** Look for a bot / villager that only has a shirt colour. */
export function lookFromColor(color, variant = 0) {
  return { ...DEFAULT_LOOK, skin: variant % 5, hairColor: (variant + 1) % 6, hair: ['short', 'beanie', 'short', 'none'][variant % 4], mask: 'none', hoodieRGB: color };
}

const G = {};
function geo() {
  if (G.ready) return G;
  Object.assign(G, {
    ready: true,
    head: new THREE.SphereGeometry(0.125, 16, 12),
    neck: new THREE.CylinderGeometry(0.05, 0.055, 0.12, 8),
    collar: new THREE.CylinderGeometry(0.1, 0.14, 0.08, 10),
    torso: new THREE.CylinderGeometry(0.19, 0.155, 0.5, 12),
    chest: new THREE.SphereGeometry(0.2, 12, 8),
    pelvis: new THREE.CylinderGeometry(0.165, 0.15, 0.2, 10),
    belt: new THREE.CylinderGeometry(0.17, 0.17, 0.05, 12),
    skirt: new THREE.CylinderGeometry(0.19, 0.28, 0.56, 12),
    hem: new THREE.CylinderGeometry(0.285, 0.285, 0.04, 12),
    shoulder: new THREE.SphereGeometry(0.078, 8, 6),
    arm: new THREE.CapsuleGeometry(0.06, 0.46, 3, 8),
    leg: new THREE.CapsuleGeometry(0.085, 0.6, 3, 8),
    hand: new THREE.SphereGeometry(0.065, 8, 6),
    boot: new THREE.BoxGeometry(0.17, 0.2, 0.28),
    hood: new THREE.SphereGeometry(0.13, 10, 8),
    cap: new THREE.SphereGeometry(0.14, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    blade: new THREE.BoxGeometry(0.04, 0.14, 0.07),
    fringe: new THREE.BoxGeometry(0.07, 0.05, 0.09),
    pom: new THREE.SphereGeometry(0.035, 8, 6),
    ring: new THREE.RingGeometry(0.035, 0.05, 18),
    lens: new THREE.RingGeometry(0.026, 0.036, 14),
    bridge: new THREE.BoxGeometry(0.035, 0.008, 0.008),
    visor: new THREE.BoxGeometry(0.27, 0.045, 0.06),
    pack: new THREE.BoxGeometry(0.32, 0.34, 0.14),
    gun: new THREE.BoxGeometry(0.06, 0.5, 0.09),
    mag: new THREE.BoxGeometry(0.05, 0.07, 0.14),
    stock: new THREE.BoxGeometry(0.05, 0.18, 0.08),
  });
  return G;
}

/** Face texture painted on a canvas (eyes, mouth, clown / skull paint). Front of the head faces +z, which is u = 0.25 on a three.js sphere. */
function faceTexture(look) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const x = c.getContext('2d');
  if (!x) return null;
  x.fillStyle = '#' + LOOK_OPTIONS.skin[look.skin].toString(16).padStart(6, '0'); x.fillRect(0, 0, 512, 256);
  const cx = 128, cy = 132;
  const eye = (dx, col, w = 11, h = 7) => { x.fillStyle = '#fff'; x.beginPath(); x.ellipse(cx + dx, cy - 6, w, h, 0, 0, 7); x.fill(); x.fillStyle = col; x.beginPath(); x.arc(cx + dx, cy - 6, h - 1.5, 0, 7); x.fill(); };
  if (look.mask === 'clown') {
    x.fillStyle = '#f4f4f4'; x.beginPath(); x.ellipse(cx, cy + 6, 62, 78, 0, 0, 7); x.fill();
    x.fillStyle = '#c8222a'; x.beginPath(); x.moveTo(cx - 40, cy + 36); x.quadraticCurveTo(cx, cy + 82, cx + 40, cy + 36); x.quadraticCurveTo(cx, cy + 58, cx - 40, cy + 36); x.fill(); // wide smile
    x.beginPath(); x.arc(cx, cy + 14, 9, 0, 7); x.fill();                                                                                            // red nose
    for (const s of [-1, 1]) { x.fillStyle = '#8a3ad8'; x.beginPath(); x.ellipse(cx + s * 24, cy - 8, 15, 11, 0, 0, 7); x.fill(); x.fillStyle = '#e9b8ff'; x.beginPath(); x.arc(cx + s * 24, cy - 8, 5, 0, 7); x.fill(); }
  } else if (look.mask === 'skull') {
    x.fillStyle = '#e8e8e0'; x.beginPath(); x.ellipse(cx, cy + 6, 62, 78, 0, 0, 7); x.fill();
    x.fillStyle = '#111'; for (const s of [-1, 1]) { x.beginPath(); x.ellipse(cx + s * 24, cy - 6, 16, 19, 0, 0, 7); x.fill(); }
    x.beginPath(); x.moveTo(cx, cy + 8); x.lineTo(cx - 8, cy + 30); x.lineTo(cx + 8, cy + 30); x.fill();
    for (let i = -3; i <= 3; i++) x.fillRect(cx + i * 9 - 3, cy + 44, 6, 22);
  } else if (look.mask === 'visor') {
    eye(-24, '#222'); eye(24, '#222');
    x.fillStyle = '#b86a50'; x.fillRect(cx - 18, cy + 40, 36, 5);
  } else {
    eye(-24, '#222'); eye(24, '#222');
    x.strokeStyle = '#6a3a2a'; x.lineWidth = 5; x.beginPath(); x.arc(cx, cy + 36, 20, 0.25, Math.PI - 0.25); x.stroke();
    x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(cx - 40, cy - 28, 26, 4); x.fillRect(cx + 14, cy - 28, 26, 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * A slim, properly proportioned player (about 7.3 heads tall): shoulders, neck, collar, jacket or long coat, belt, boots, hair, face paint or glasses.
 * Origin at the feet, faces +z. Keeps the rig contract used everywhere (userData.head / armL / armR / legL / legR / phase / armed),
 * so animateHumanoid still works. The gun is attached to the right hand, so it moves with the arm.
 */
export function makeCharacter(rawLook = DEFAULT_LOOK, armed = true) {
  const look = sanitizeLook(rawLook), g3 = geo(), O = LOOK_OPTIONS;
  const hoodieCol = rawLook && rawLook.hoodieRGB != null ? rawLook.hoodieRGB : O.hoodie[look.hoodie];
  const lam = (c, extra) => new THREE.MeshLambertMaterial({ color: c, ...extra });
  const skin = lam(O.skin[look.skin]), hoodie = lam(hoodieCol), pants = lam(O.pants[look.pants]);
  const dark = lam(0x15151a), hair = lam(O.hairColor[look.hairColor]);
  const g = new THREE.Group();
  const add = (parent, geom, mat, x, y, z) => { const m = new THREE.Mesh(geom, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };

  // legs + boots (pivot at the hip), pelvis joins them to the body
  const mkLeg = (x) => {
    const p = new THREE.Group(); p.position.set(x, 0.93, 0); g.add(p);
    add(p, g3.leg, pants, 0, -0.47, 0);
    add(p, g3.boot, dark, 0, -0.83, 0.04);
    return p;
  };
  const legL = mkLeg(-0.1), legR = mkLeg(0.1);
  add(g, g3.pelvis, pants, 0, 0.95, 0).scale.z = 0.75;

  // torso: tapered body + chest/shoulder ellipsoid + shoulder joints, collar and a hood bunched behind the neck
  add(g, g3.torso, hoodie, 0, 1.2, 0).scale.z = 0.72;
  const chest = add(g, g3.chest, hoodie, 0, 1.36, 0); chest.scale.set(1.2, 0.95, 0.75);
  add(g, g3.belt, dark, 0, 0.98, 0).scale.z = 0.75;
  const ring = new THREE.Mesh(g3.ring, new THREE.MeshBasicMaterial({ color: 0xdfe6ee, side: THREE.DoubleSide }));
  ring.position.set(0, 1.3, 0.158); g.add(ring);
  if (look.outfit === 'coat') {                                    // long open coat: flared skirt down to the knees with a dark hem
    add(g, g3.skirt, hoodie, 0, 0.72, 0).scale.z = 0.72;
    add(g, g3.hem, dark, 0, 0.46, 0).scale.z = 0.72;
  }
  const hoodBack = add(g, g3.hood, hoodie, 0, 1.5, -0.1); hoodBack.scale.set(1.1, 0.8, 0.7);
  add(g, g3.collar, hoodie, 0, 1.48, 0);

  // arms hang from the shoulder joints; gloves; the gun rides on the right hand
  const mkArm = (x) => {
    const p = new THREE.Group(); p.position.set(x, 1.4, 0); g.add(p);
    add(p, g3.shoulder, hoodie, 0, 0, 0);
    add(p, g3.arm, hoodie, 0, -0.3, 0);
    add(p, g3.hand, dark, 0, -0.6, 0);
    return p;
  };
  const armL = mkArm(-0.25), armR = mkArm(0.25);
  if (armed) {
    const gm = lam(0x222226);
    add(armR, g3.gun, gm, 0, -0.82, 0.03);
    add(armR, g3.mag, gm, 0, -0.78, -0.08);
    add(armR, g3.stock, lam(0x2c2c32), 0, -0.52, 0.02);
  }

  // neck + head with painted face
  add(g, g3.neck, skin, 0, 1.51, 0);
  const tex = faceTexture(look);
  const faceMat = lam(tex ? 0xffffff : O.skin[look.skin]);
  if (tex) faceMat.map = tex;
  const cy = 1.62;
  const head = add(g, g3.head, faceMat, 0, cy, 0); head.scale.set(0.95, 1.2, 1.0);

  // hair / headwear
  if (look.hair === 'mohawk') {
    for (const z of [0.1, 0.05, 0, -0.05, -0.1]) {
      const y = cy + 0.15 * Math.sqrt(Math.max(0, 1 - (z / 0.125) ** 2)) + 0.03;
      add(g, g3.blade, hair, 0, y, z).rotation.x = Math.atan2(z, y - cy) * 0.6;
    }
  } else if (look.hair === 'short' || look.hair === 'swept') {
    const c = add(g, g3.cap, hair, 0, cy + 0.01, -0.005); c.scale.set(1.0, 1.1, 1.05); c.rotation.x = -0.3;
    if (look.hair === 'swept') {                                  // fringe falling over the forehead
      add(g, g3.fringe, hair, -0.07, cy + 0.1, 0.095).rotation.z = 0.35;
      add(g, g3.fringe, hair, 0.0, cy + 0.105, 0.105);
      add(g, g3.fringe, hair, 0.07, cy + 0.095, 0.095).rotation.z = -0.35;
    }
  } else if (look.hair === 'beanie') {
    const bm = lam(0x8a2a2a);
    const c = add(g, g3.cap, bm, 0, cy + 0.025, 0); c.scale.set(1.08, 1.15, 1.1); c.rotation.x = 0.12;
    add(g, g3.pom, bm, 0, cy + 0.185, 0);
  }
  if (look.mask === 'visor') {
    const v = new THREE.Mesh(g3.visor, new THREE.MeshBasicMaterial({ color: 0x35e0ff }));
    v.position.set(0, cy + 0.005, 0.115); g.add(v);
  } else if (look.mask === 'glasses') {
    const gl = new THREE.MeshBasicMaterial({ color: 0x1a1a20, side: THREE.DoubleSide });
    for (const sx of [-1, 1]) { const r = new THREE.Mesh(g3.lens, gl); r.position.set(sx * 0.055, cy + 0.012, 0.118); g.add(r); }
    const br = new THREE.Mesh(g3.bridge, gl); br.position.set(0, cy + 0.018, 0.12); g.add(br);
  }

  if (armed) add(g, g3.pack, dark, 0, 1.28, -0.2);

  g.userData = { head, armL, armR, legL, legR, phase: 0, armed, look, hoodieColor: hoodieCol };
  return g;
}
