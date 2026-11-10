# NAVRAJA browser boss upgrade (Three.js r160)

This project upgrades the existing NAVRAJA boss in `src/ai/Bosses.js` while retaining the `boss-dragon` identity and the existing combat/reward/HUD interfaces.

## Current included implementation
- Nine independent head rigs with separate neck, jaw, horn, eye and neck-plate groups.
- Procedural body, belly plating, dorsal spines, articulated limbs/claws, segmented tail and animated wings.
- Cinematic rise-in entrance and continuous flight, wing, tail, leg and head idle motion.
- Per-head elemental attacks, head HP and head defeat behavior retained.
- Per-head attack anticipation/lunge animation, driven independently when that head fires.
- `triggerHeadAttack(elementId)` helper for scripted animation cues (`fire`, `water`, `earth`, `air`, `lightning`, `ice`, `poison`, `dark`, `light`).
- `playEntrance()` helper to replay the entrance sequence.
- No new dependencies or changes to the custom physics / PeerJS architecture.

## Browser integration
The model is generated from Three.js geometry at runtime and is already attached to the existing boss flow. Run the game as usual. The existing boss manager still controls spawn, target selection, health UI, rewards and cleanup.

## Validation
Run `node tests/run.mjs` from this directory. The complete test suite passed in the build environment after this update.

## Important scope / quality note
This is a detailed procedural Three.js creature and animation upgrade, not a hand-sculpted AAA production asset. It does **not** include a finished `.glb` with authored PBR texture maps or a conventional exported skin-weighted skeleton. Those require a dedicated sculpt/retopology and rigging pass in a 3D authoring tool such as Blender. Browser visual quality also depends on the game's lighting, shadows, renderer settings and target device.
