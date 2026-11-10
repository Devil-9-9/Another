import { register } from 'node:module'; register('./three-loader.mjs', import.meta.url);   // 'three' -> tests/mock-three.mjs
const { sanitizeLook, DEFAULT_LOOK, LOOK_OPTIONS, makeCharacter, lookFromColor } = await import('../src/player/Character.js');
const { makeHumanoid, animateHumanoid } = await import('../src/player/Humanoid.js');
const { Profile, sanitizeName, joinIdFromSearch, inviteLink } = await import('../src/ui/Profile.js');

// looks from storage / the network are untrusted
console.assert(JSON.stringify(sanitizeLook(null)) === JSON.stringify(DEFAULT_LOOK), 'null -> default');
const bad = sanitizeLook({ skin: 99, hoodie: -1, pants: 'x', hairColor: 2.5, hair: '<script>', mask: {}, __proto__: { x: 1 } });
console.assert(bad.skin === DEFAULT_LOOK.skin && bad.hoodie === DEFAULT_LOOK.hoodie && bad.pants === DEFAULT_LOOK.pants && bad.hairColor === DEFAULT_LOOK.hairColor && bad.hair === DEFAULT_LOOK.hair && bad.mask === DEFAULT_LOOK.mask, 'junk -> defaults: ' + JSON.stringify(bad));
const ok = sanitizeLook({ skin: 3, hoodie: 6, pants: 4, hairColor: 5, hair: 'beanie', mask: 'skull' });
console.assert(ok.skin === 3 && ok.hoodie === 6 && ok.hair === 'beanie' && ok.mask === 'skull', 'valid look kept');

// every hair x mask combination builds a rig that animateHumanoid can drive
let n = 0;
for (const hair of LOOK_OPTIONS.hair) for (const mask of LOOK_OPTIONS.mask) for (const outfit of LOOK_OPTIONS.outfit) for (const armed of [true, false]) {
  const g = makeCharacter({ ...DEFAULT_LOOK, hair, mask, outfit }, armed); n++;
  const u = g.userData;
  console.assert(u.head && u.armL && u.armR && u.legL && u.legR && u.armed === armed, `rig ${hair}/${mask}`);
  animateHumanoid(g, 0.1, 4);
  console.assert(Number.isFinite(u.legL.rotation.x) && Number.isFinite(u.armR.rotation.x), 'animates');
}
const bot = makeHumanoid(0xb03a3a); console.assert(bot.userData.hoodieColor === 0xb03a3a, 'bots keep their shirt colour');
console.assert(lookFromColor(0x123456, 7).mask === 'none', 'bots wear no face paint');
console.log(`${n} character variants built`);
console.assert(DEFAULT_LOOK.model === 'remy' && sanitizeLook({ model: 'eve' }).model === 'eve' && sanitizeLook({ model: '../../x' }).model === 'remy', 'model choice is validated');
const { modelReady, MODEL_IDS, makeModelCharacter } = await import('../src/player/Model.js');
console.assert(MODEL_IDS.join() === 'remy,kachujin,eve' && !modelReady('remy') && makeModelCharacter('remy') === null, 'models fall back to blocky until loaded');
const h = makeHumanoid(0x3a6ea5, true, { model: 'remy' }); console.assert(!h.userData.isModel && h.userData.legL, 'makeHumanoid falls back to the blocky character when the model is not ready');

// names
console.assert(sanitizeName('  <b>Bunny</b>DJ46!!  ') === 'bBunnybDJ46', 'markup stripped: ' + sanitizeName('  <b>Bunny</b>DJ46!!  '));
console.assert(sanitizeName('') === 'PLAYER' && sanitizeName(null, 'X') === 'X', 'fallbacks');
console.assert(sanitizeName('A'.repeat(40)).length === 12, '12 chars max');

// profile persists
const mem = new Map(); const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
const p = new Profile(storage, 'BO-ABCD-1234');
console.assert(p.name === 'PLAYER1234', 'default name from id: ' + p.name);
p.setName('Sujit'); p.setLook({ hoodie: 2, mask: 'visor' });
const p2 = new Profile(storage, 'BO-ABCD-1234');
console.assert(p2.name === 'Sujit' && p2.look.hoodie === 2 && p2.look.mask === 'visor', 'saved across reloads');
mem.set('blockops.profile.v1', '{not json'); console.assert(new Profile(storage, 'BO-ABCD-1234').look.hair === 'mohawk', 'corrupt storage -> defaults');
console.assert(new Profile(null, 'BO-ABCD-1234').name === 'PLAYER1234', 'works without storage');

// invite links
console.assert(joinIdFromSearch('?join=bo-abcd-1234') === 'BO-ABCD-1234', 'link id normalised');
console.assert(joinIdFromSearch('?join=evil') === null && joinIdFromSearch('') === null && joinIdFromSearch('?join=BO-ABCD-12345') === null, 'bad ids rejected');
console.assert(inviteLink('BO-ABCD-1234', 'https://x.app/play/?a=1#h') === 'https://x.app/play/?join=BO-ABCD-1234', 'invite link: ' + inviteLink('BO-ABCD-1234', 'https://x.app/play/?a=1#h'));
console.log('character + profile tests done');
