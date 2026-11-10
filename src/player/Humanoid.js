import { makeCharacter, lookFromColor } from './Character.js';
import { makeModelCharacter, animateModel, playModelOnce, modelReady } from './Model.js';

/**
 * Builds a person. `color` is a hoodie/shirt colour for bots and villagers; pass a wardrobe `look` (see Character.js) for real players.
 * If look.model names a realistic model that has finished loading, that model is used; otherwise the blocky character.
 * Origin at the feet, faces +z.
 */
let variant = 0;
export function makeHumanoid(color = 0x3a6ea5, armed = true, look = null, opts = {}) {
  if (look && look.model && look.model !== 'blocky' && modelReady(look.model)) {
    const m = makeModelCharacter(look.model, { armed, tint: opts.tint });
    if (m) return m;
  }
  return makeCharacter(look || lookFromColor(color, variant++), armed);
}

/** Swing limbs based on horizontal speed (blocky) or advance the real animation (model). */
export function animateHumanoid(g, dt, speed) {
  const u = g.userData;
  if (u.isModel) return animateModel(g, dt, speed);
  u.phase += dt * Math.min(speed, 7) * 1.8;
  const s = Math.sin(u.phase) * Math.min(1, speed / 3) * 0.8;
  u.legL.rotation.x = s; u.legR.rotation.x = -s;
  u.armL.rotation.x = -s * 0.6;
  u.armR.rotation.x = u.armed ? -1.3 : s * 0.6; // armed: right arm holds the gun forward; civilians swing both arms
}

/** Play a one-shot animation ('fire','reload','hit','die'...) on a model character; blocky ones ignore it. */
export function actHumanoid(g, name) { return g.userData.isModel ? playModelOnce(g, name) : false; }
