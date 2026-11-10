import * as THREE from 'three';

/**
 * Realistic skinned characters (Mixamo models converted to small GLBs by tools/fbx2glb.py) with real animations.
 * GLTFLoader / SkeletonUtils come from three's "addons" and are imported lazily: if they cannot load (offline, blocked CDN)
 * every call quietly falls back to the blocky Character and the game keeps working.
 */
export const MODELS = {
  remy: { url: 'assets/models/remy.glb', label: 'REMY' },
  kachujin: { url: 'assets/models/kachujin.glb', label: 'KACHUJIN' },
  eve: { url: 'assets/models/eve.glb', label: 'EVE' },
};
export const MODEL_IDS = Object.keys(MODELS);

/** Quality switch: 'high' = realistic models for bots and friends, 'low' = blocky characters everywhere except the lobby. */
export const gfx = { models: true };

const lib = new Map();                 // id -> Promise while loading, {gltf, gun} when ready, {failed:true} if it could not load
let mods = null, metaP = null;

export function modelReady(id) { const e = lib.get(id); return !!e && !(e instanceof Promise) && !e.failed; }

function getMeta() {
  if (!metaP) metaP = fetch('assets/models/meta.json').then((r) => r.json()).catch(() => ({}));
  return metaP;
}

/** Starts (once) loading a model. Resolves with the entry, or null if unavailable. Never rejects. */
export function loadModel(id) {
  if (!MODELS[id]) return Promise.resolve(null);
  const cur = lib.get(id);
  if (cur instanceof Promise) return cur;
  if (cur) return Promise.resolve(cur.failed ? null : cur);
  const p = (async () => {
    try {
      if (!mods) {
        const [g, s] = await Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/utils/SkeletonUtils.js')]);
        mods = { GLTFLoader: g.GLTFLoader, clone: s.clone || s.default?.clone };
      }
      const [gltf, meta] = await Promise.all([new mods.GLTFLoader().loadAsync(MODELS[id].url), getMeta()]);
      const e = { gltf, gun: meta[id]?.gun || null };
      lib.set(id, e); return e;
    } catch (err) {
      console.warn('character model "' + id + '" unavailable, using blocky character:', err?.message || err);
      lib.set(id, { failed: true }); return null;
    }
  })();
  lib.set(id, p);
  return p;
}

let rifleGeo = null;
function makeRifle() {
  if (!rifleGeo) rifleGeo = {
    body: new THREE.BoxGeometry(0.06, 0.09, 0.5), barrel: new THREE.BoxGeometry(0.02, 0.02, 0.3), stock: new THREE.BoxGeometry(0.04, 0.09, 0.24),
    mag: new THREE.BoxGeometry(0.035, 0.16, 0.07), guard: new THREE.BoxGeometry(0.05, 0.05, 0.22),
  };
  const dark = new THREE.MeshLambertMaterial({ color: 0x2e2e33 }), wood = new THREE.MeshLambertMaterial({ color: 0x5a3d26 });
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); };
  add(rifleGeo.body, dark, 0, 0.04, 0.2); add(rifleGeo.barrel, dark, 0, 0.045, 0.62); add(rifleGeo.stock, wood, 0, 0.0, -0.17);
  add(rifleGeo.mag, dark, 0, -0.09, 0.12); add(rifleGeo.guard, wood, 0, 0.0, 0.42);
  return g;
}

/** A playable/visible character. Same contract as the blocky one: origin at the feet, faces +z. opts: { armed, tint }. */
export function makeModelCharacter(id, opts = {}) {
  const e = lib.get(id);
  if (!e || e instanceof Promise || e.failed) return null;
  const root = mods.clone(e.gltf.scene);
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false; o.castShadow = true;
    if (opts.tint) {                                   // team colour: multiply every material (clone first, materials are shared between copies)
      o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
      for (const m of [].concat(o.material)) if (m.color) m.color.multiply(new THREE.Color(opts.tint));
    }
  });
  const g = new THREE.Group(); g.add(root);
  const mixer = new THREE.AnimationMixer(root), actions = {};
  for (const c of e.gltf.animations) actions[c.name] = mixer.clipAction(c);
  g.userData = { isModel: true, id, mixer, actions, current: null, name: '', lock: 0, armed: !!opts.armed };
  if (opts.armed && e.gun) {
    const hand = root.getObjectByName('RightHand');
    if (hand) { const gun = makeRifle(); gun.position.fromArray(e.gun.p); gun.quaternion.fromArray(e.gun.q); hand.add(gun); }
  }
  playModel(g, 'idle', { fade: 0 });
  return g;
}

/** Cross-fade to a named clip ('idle','aim','run','run_pistol','walk_back','turn','fire','reload','jump','hit','hit_prone','die'). */
export function playModel(g, name, { fade = 0.2, once = false, speed = 1 } = {}) {
  const u = g.userData, a = u.actions[name];
  if (!a) return false;
  if (u.current === a && !once) { a.setEffectiveTimeScale(speed); return true; }
  a.reset(); a.enabled = true; a.setEffectiveWeight(1); a.setEffectiveTimeScale(speed);
  a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once;
  if (u.current && u.current !== a) { u.current.fadeOut(fade); a.fadeIn(fade); } else a.fadeIn(fade);
  a.play(); u.current = a; u.name = name;
  return true;
}

/** One-shot (fire / reload / hit / jump / die); after it ends, normal movement animation resumes. 'die' stays down. */
export function playModelOnce(g, name) {
  const u = g.userData, a = u.actions[name];
  if (!a) return false;
  playModel(g, name, { once: true, fade: 0.1 });
  u.lock = name === 'die' ? Infinity : Math.max(0.2, a.getClip().duration - 0.2);
  return true;
}

/** Advance the mixer and pick idle/run from horizontal speed (m/s). */
export function animateModel(g, dt, speed) {
  const u = g.userData;
  u.mixer.update(dt);
  if (u.lock > 0) { u.lock -= dt; if (u.lock > 0) return; }
  if (speed > 0.5) playModel(g, 'run', { speed: Math.min(1.5, Math.max(0.6, speed / 4.2)) });
  else playModel(g, 'idle');
}
