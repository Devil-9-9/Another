import { Game } from './core/Game.js';
import { getUniqueId, copyToClipboard } from './multiplayer/UniqueID.js';
import { Network } from './multiplayer/Network.js';
import { DesktopControls } from './controls/DesktopControls.js';
import { MobileControls, isTouchDevice } from './controls/MobileControls.js';
import { HudEditor } from './ui/HudEditor.js';
import { Profile, joinIdFromSearch, inviteLink } from './ui/Profile.js';
import { Lobby3D } from './ui/Lobby3D.js';
import { Inventory } from './ui/Inventory.js';
import { TRADERS, RECIPES, ITEM_NAMES, isBlockKey, blockOf } from './survival/Survival.js';
import { BLOCKS } from './blocks/BlockTypes.js';
import { buildWardrobe } from './ui/Wardrobe.js';
import { loadModel, gfx } from './player/Model.js';
import { generateWorldSeed, normalizeSeed, numericSeed } from './core/WorldSeed.js';
import { readSave, writeSave, lastPlayed, savedSeeds, unpackEdits } from './core/SaveGame.js';

const $ = (id) => document.getElementById(id);
const touch = isTouchDevice();
const myId = getUniqueId();
$('my-id').textContent = myId;

// ---- network (optional: the game works fully offline against bots) ----
const profile = new Profile((() => { try { return window.localStorage; } catch (_) { return null; } })(), myId);
const net = new Network(myId);
net.profile = profile.toJSON();
net.onStatus = (s) => { $('net-status').textContent = s; };
net.start();

// ---- game ----
let game;
try {
  game = new Game({ canvas: $('game'), net, myId, touch });
  game.loadWorld(net.hostSeed, [], false);
game.mobs.enabled = $('opt-bots').checked;
} catch (err) {
  $('net-status').textContent = 'Could not start 3D: ' + err.message;
  console.error(err);
  throw err;
}

let selected = null;        // the world picked in the lobby: { seed (128-bit text), friend }
net.onSeed = (seed, edits, key) => {
  game.loadWorld(seed, edits, false);
  game.player.sens = sens;
  game.hud.toast('Joined host world');
  if (key) { selected = { seed: key, friend: true }; showStep2(); }      // a friend's world: just pick Creative / Survival
};

// ---- controls ----
const desktop = new DesktopControls(game.input, $('game'));
desktop.getMode = () => game.mode;
const mobile = new MobileControls(game.input);
mobile.getMode = () => game.mode;
mobile.holdCrouch = () => game.player.flying || game.player.vehicle?.type === 'heli';   // DUCK = hold to descend

// ---- look sensitivity (saved) ----
const SENS_KEY = 'blockops.sens';
let sens = 1;
try { const v = parseFloat(localStorage.getItem(SENS_KEY)); if (v >= 0.4 && v <= 3) sens = v; } catch (_) { /* storage blocked */ }
$('pm-sens').value = sens;
game.player.sens = sens;
$('pm-sens').addEventListener('input', (e) => {
  sens = Number(e.target.value); game.player.sens = sens;
  try { localStorage.setItem(SENS_KEY, String(sens)); } catch (_) { /* ignore */ }
});

game.setLocalLook(profile.look);

// ---- inventory (I key / BAG button): freezes the game while open ----
const inventory = new Inventory({ game, root: $('inventory') });
function toggleInventory() {
  if (!game.running || editor.active || $('pause-menu').classList.contains('hidden') === false) return;
  if (!inventory.isOpen) {
    if (game.paused) return;
    game.paused = true; game.input.reset(); desktop.setEnabled(false);
    document.exitPointerLock?.();
    inventory.open();
  } else {
    inventory.close();
    game.paused = false; game.input.reset(); game.last = performance.now();
    if (!touch) { desktop.setEnabled(true); $('game').requestPointerLock?.(); }
  }
}
inventory.onClose = toggleInventory;
game.onInventory = toggleInventory;

// ---- villager trade (Y key / TRADE prompt): coins <-> items, survival only ----
function renderTrade() {
  const npc = game.tradeNpc, sv = game.sv; if (!npc || !sv) return;
  $('trade-title').textContent = npc.name;
  $('trade-coins').textContent = '\u{1FA99} ' + sv.coins;
  const rows = $('trade-rows'); rows.textContent = '';
  TRADERS[npc.role].trades.forEach((t, i) => {
    const row = document.createElement('div'); row.className = 'trade-row';
    const label = document.createElement('span');
    label.textContent = t.give ? `${t.label} \u2192 ${t.coins} coins (you have ${sv.count(Object.keys(t.give)[0])})` : `${t.label}: ${t.price} coins`;
    const btn = document.createElement('button'); btn.textContent = t.give ? 'SELL' : 'BUY';
    btn.disabled = t.give ? !sv.has(t.give) : sv.coins < t.price;
    btn.addEventListener('click', () => { const m = sv.trade(npc.role, i); $('trade-msg').textContent = m ? (m === 'BOUGHT' ? 'Bought: ' + t.label : m) : 'Not enough.'; renderTrade(); });
    row.append(label, btn); rows.appendChild(row);
  });
}
let tradeOpen = false;
function toggleTrade() {
  if (!game.running || editor.active || !$('pause-menu').classList.contains('hidden')) return;
  if (!tradeOpen) {
    if (game.paused || !game.tradeNpc || !game.sv) return;
    tradeOpen = true; game.paused = true; game.input.reset(); desktop.setEnabled(false); document.exitPointerLock?.();
    $('trade').classList.remove('hidden'); renderTrade();
  } else {
    tradeOpen = false; $('trade').classList.add('hidden');
    game.paused = false; game.input.reset(); game.last = performance.now();
    if (!touch) { desktop.setEnabled(true); $('game').requestPointerLock?.(); }
  }
}
game.onTrade = toggleTrade;
$('trade-close').addEventListener('click', toggleTrade);
$('trade-prompt').addEventListener('click', () => game.input.press('trade'));
window.addEventListener('keydown', (e) => { if (tradeOpen && (e.code === 'Escape' || e.code === 'KeyY')) { e.preventDefault(); toggleTrade(); } });

// ---- crafting menu (C key / CRAFT button), survival only ----
const itemName = (k) => (isBlockKey(k) ? (blockOf(k) === 5 ? 'Wood' : BLOCKS[blockOf(k)]?.name || k) : ITEM_NAMES[k] || k);
function renderCraft() {
  const sv = game.sv; if (!sv) return;
  $('craft-coins').textContent = 'LV ' + sv.level + '  \u{1FA99} ' + sv.coins;
  const rows = $('craft-rows'); rows.textContent = '';
  for (const [id, r] of Object.entries(RECIPES)) {
    const owned = ['wooden_sword', 'stone_sword', 'iron_sword', 'bow'].includes(id) && sv.count(id) > 0;
    const row = document.createElement('div'); row.className = 'trade-row craft-row';
    const left = document.createElement('span'); left.textContent = r.label + (owned ? '  (owned)' : '');
    const need = document.createElement('span'); need.className = 'need';
    for (const [k, n] of Object.entries(r.cost)) { const s = document.createElement('span'); s.className = sv.count(k) >= n ? 'ok' : 'no'; s.textContent = `${itemName(k)} ${sv.count(k)}/${n}  `; need.appendChild(s); }
    left.appendChild(need);
    const btn = document.createElement('button'); btn.textContent = 'CRAFT'; btn.disabled = owned || !sv.has(r.cost);
    btn.addEventListener('click', () => { const ok = sv.craft(id); $('craft-msg').textContent = ok ? 'Crafted: ' + r.label : 'Missing materials.'; if (ok) game.audio.play('place'); renderCraft(); });
    row.append(left, btn); rows.appendChild(row);
  }
  $('craft-msg').textContent = $('craft-msg').dataset.m || sv.flyHint();
}
let craftOpen = false;
function toggleCraft() {
  if (!game.running || editor.active || !$('pause-menu').classList.contains('hidden')) return;
  if (!craftOpen) {
    if (game.paused) return;
    if (!game.sv) { game.hud.toast('CREATIVE: everything is free, press I', 1600); return; }
    craftOpen = true; game.paused = true; game.input.reset(); desktop.setEnabled(false); document.exitPointerLock?.();
    $('craft').classList.remove('hidden'); renderCraft();
  } else {
    craftOpen = false; $('craft').classList.add('hidden');
    game.paused = false; game.input.reset(); game.last = performance.now();
    if (!touch) { desktop.setEnabled(true); $('game').requestPointerLock?.(); }
  }
}
game.onCraft = toggleCraft;
$('craft-close').addEventListener('click', toggleCraft);
window.addEventListener('keydown', (e) => { if (craftOpen && (e.code === 'Escape' || e.code === 'KeyC')) { e.preventDefault(); toggleCraft(); } });

// ---- pause + HUD editor ----
let editFrom = 'menu';
const editor = new HudEditor({ touch, onExit: () => {
  if (touch) mobile.setEditing(false);
  if (editFrom === 'menu') {                                  // back to the main menu, hide the game HUD again
    game.hud.show(false);
    if (touch) mobile.setEnabled(false);
    $('menu').classList.remove('hidden');
  } else $('pause-menu').classList.remove('hidden');          // back to the pause menu
} });

function startEdit(from) {
  editFrom = from;
  $('menu').classList.add('hidden'); $('pause-menu').classList.add('hidden');
  game.hud.show(true);
  if (touch) { mobile.setEnabled(true); mobile.setEditing(true); }
  editor.enter();
}

function pause() {
  if (!game.running || game.paused || editor.active) return;
  game.paused = true;
  saveNow(false);
  game.input.reset();
  desktop.setEnabled(false);
  $('pause-menu').classList.remove('hidden');
  document.exitPointerLock?.();
}

function resume() {
  $('pause-menu').classList.add('hidden');
  game.paused = false;
  game.input.reset();
  game.last = performance.now();
  if (!touch) { desktop.setEnabled(true); $('game').requestPointerLock?.(); }
}

$('menu-hud-btn').addEventListener('click', () => startEdit('menu'));
$('pm-hud').addEventListener('click', () => startEdit('pause'));
$('pm-resume').addEventListener('click', resume);
$('pm-menu').addEventListener('click', () => location.reload());
$('pause-btn').addEventListener('click', pause);
document.addEventListener('pointerlockchange', () => {      // Esc on desktop releases the mouse -> pause
  if (!touch && game.running && !game.paused && !editor.active && document.pointerLockElement !== $('game')) pause();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

// ---- main menu ----
$('copy-id').addEventListener('click', async () => {
  const ok = await copyToClipboard(myId);
  $('copy-id').textContent = ok ? 'COPIED' : 'SELECT';
  setTimeout(() => ($('copy-id').textContent = 'COPY'), 1400);
});
$('join-btn').addEventListener('click', () => net.join($('friend-id').value));
$('friend-id').addEventListener('keydown', (e) => { if (e.key === 'Enter') net.join($('friend-id').value); });

// ---- lobby: 3D home screen, wardrobe, squad ----
let lobby = null;
try {
  lobby = new Lobby3D($('lobby-canvas'), profile.look, () => !$('menu').classList.contains('hidden'));
  lobby.onLoading = (on) => $('lb-loading').classList.toggle('hidden', !on);
  lobby.setLook(profile.look);                     // again, now that the loading chip is wired
  lobby.start();
  window.__lobby = lobby;
} catch (err) { console.warn('3D lobby unavailable, using the plain menu:', err); }   // the game itself must never depend on the lobby

const TIPS = ['Dig down to find caves, lava and glowing crystals.', 'Build a tower into the sky to reach floating islands.', 'Share your invite link: friends join with one tap.',
  'Shooting animals heals you.', 'Customize your HUD to fit your thumbs.', 'Water cancels fall damage. Clouds too.', 'Villagers sleep at night. Be quiet!'];
let tipI = 0; const showTip = () => { $('lb-tip').textContent = TIPS[tipI++ % TIPS.length]; }; showTip(); setInterval(showTip, 6000);

function refreshProfileUi() {
  $('lb-name').textContent = profile.name;
  $('lb-avatar').textContent = (profile.name[0] || 'P').toUpperCase();
  net.setProfile(profile.toJSON());
}
refreshProfileUi();

// ---- realistic characters: the chosen one loads first (lobby), then the one the bots use; GFX LOW keeps bots/friends blocky ----
const GFX_KEY = 'blockops.gfx';
try { if (localStorage.getItem(GFX_KEY) === 'low') gfx.models = false; } catch (_) { /* storage blocked */ }
const botModelFor = (look) => (look.model === 'remy' ? 'eve' : 'remy');   // enemies never look like you
function preloadModels() {
  game.botModel = botModelFor(profile.look);
  const mine = profile.look.model !== 'blocky' ? loadModel(profile.look.model) : Promise.resolve();
  mine.then(() => { if (gfx.models) loadModel(game.botModel); });
}
preloadModels();
const showGfx = () => { $('gfx-label').textContent = gfx.models ? 'GFX HIGH' : 'GFX LOW'; };
showGfx();
$('gfx-btn').addEventListener('click', () => {
  gfx.models = !gfx.models; showGfx();
  try { localStorage.setItem(GFX_KEY, gfx.models ? 'high' : 'low'); } catch (_) { /* ignore */ }
  if (gfx.models) preloadModels();
  $('net-status').textContent = gfx.models ? 'Graphics HIGH: realistic bots and friends' : 'Graphics LOW: lighter blocky bots and friends (faster on old phones)';
});

let refreshWardrobe = buildWardrobe($('wd-rows'), profile.look, (patch) => {
  profile.setLook(patch); game.setLocalLook(profile.look); refreshWardrobe(profile.look); lobby?.setLook(profile.look); refreshProfileUi();
  if (patch.model) preloadModels();
});
$('wd-name').value = profile.name;
$('wd-name').addEventListener('change', (e) => { profile.setName(e.target.value); e.target.value = profile.name; refreshProfileUi(); });
const openWardrobe = (on) => { $('wardrobe').classList.toggle('hidden', !on); $('help').classList.add('hidden'); };
$('wd-open').addEventListener('click', () => openWardrobe($('wardrobe').classList.contains('hidden')));
$('lb-profile').addEventListener('click', () => openWardrobe($('wardrobe').classList.contains('hidden')));
$('wd-done').addEventListener('click', () => openWardrobe(false));
$('help-btn').addEventListener('click', () => { $('help').classList.toggle('hidden'); $('wardrobe').classList.add('hidden'); });
$('help-close').addEventListener('click', () => $('help').classList.add('hidden'));

function renderSquad() {
  const box = $('lb-friends'); box.textContent = '';
  const you = document.createElement('div'); you.className = 'squad-slot you'; you.textContent = profile.name; box.appendChild(you);
  for (const id of net.conns.keys()) { const f = document.createElement('div'); f.className = 'squad-slot friend'; f.textContent = net.friendName(id); box.appendChild(f); }
  for (let i = box.children.length; i < 4; i++) { const e = document.createElement('div'); e.className = 'squad-slot'; e.textContent = 'Empty'; box.appendChild(e); }
  const n = 1 + net.conns.size;
  $('lb-count').textContent = n + '/4';
  $('start-sub').textContent = n > 1 ? 'WITH ' + (n - 1) + ' FRIEND' + (n > 2 ? 'S' : '') : 'SOLO';
}
net.onFriends = renderSquad; renderSquad();

const link = () => inviteLink(myId, location.href);
async function shareInvite() {
  const text = `Join my Block Ops world! My ID: ${myId}`;
  try { if (navigator.share) { await navigator.share({ title: 'Block Ops', text, url: link() }); return; } } catch (_) { /* cancelled: fall through to copy */ }
  const ok = await copyToClipboard(link());
  $('net-status').textContent = ok ? 'Invite link copied. Send it to your friend.' : 'Copy this link: ' + link();
}
$('lb-copy-link').addEventListener('click', shareInvite);

// opening a friend's invite link joins them automatically as soon as the network is up
const autoJoin = joinIdFromSearch(location.search);
if (autoJoin) { $('friend-id').value = autoJoin; net.onReady = () => net.join(autoJoin); $('net-status').textContent = 'Joining ' + autoJoin + '...'; }

async function deploy() {
  game.audio.unlock();
  $('menu').classList.add('hidden');
  lobby?.dispose(); lobby = null;
  game.hud.show(true);
  game.paused = false;
  if (touch) {
    mobile.setEnabled(true);
    try { await document.documentElement.requestFullscreen?.(); } catch (_) { /* iOS Safari: not supported */ }
    try { await screen.orientation?.lock?.('landscape'); } catch (_) { /* needs fullscreen/PWA */ }
  } else {
    desktop.setEnabled(true);
    $('game').requestPointerLock?.();
  }
  game.start();
  updateRotateHint();
}
$('opt-bots').addEventListener('change', () => { game.mobs.enabled = $('opt-bots').checked; });   // zombies, skeletons, spiders, creepers

// ---- worlds: create (unique 128-bit seed) / join with a seed, then Creative or Survival; saves live in localStorage ----
const store = () => { try { return window.localStorage; } catch (_) { return null; } };
const FIRST_KEY = 'blockops.firstseed.v1';
const getFirst = () => { try { return normalizeSeed(localStorage.getItem(FIRST_KEY)); } catch (_) { return null; } };
const setFirst = (s) => { if (!getFirst()) { try { localStorage.setItem(FIRST_KEY, s); } catch (_) { /* ignore */ } } };
const show = (id, on) => $(id).classList.toggle('hidden', !on);

function paintFirst() {
  const f = getFirst();
  $('wp-first-1').textContent = f || ''; show('wp-first-row', !!f);
  $('wp-first-2').textContent = f || ''; show('wp-first-row2', !!f && !!selected && selected.seed !== f);
}
function showStep1() {
  selected = null; show('wp-step1', true); show('wp-step2', false);
  show('wp-continue', !!lastPlayed(store())); $('wp-error').textContent = ''; paintFirst();
}
function showStep2() {
  show('wp-step1', false); show('wp-step2', true);
  $('wp-seed').textContent = selected.seed;
  $('wp-label').textContent = selected.friend ? "FRIEND'S WORLD SEED" : (selected.seed === getFirst() ? 'YOUR FIRST WORLD SEED' : 'WORLD SEED');
  for (const m of ['creative', 'survival']) {
    const saved = !selected.friend && readSave(store(), selected.seed, m);
    $('mode-' + m + '-sub').textContent = saved ? 'continue saved world' : (m === 'creative' ? 'fly, free build, no damage' : 'damage, no fly');
  }
  paintFirst();
}
function pickSeed(text) {
  const s = normalizeSeed(text);
  if (!s) { $('wp-error').textContent = 'A seed is 8 groups of 4 hex digits (32 in all), like a3f9-8c21-4b7d-9e12-7f8a-1b2c-3d4e-5f60'; return; }
  selected = { seed: s, friend: false }; showStep2();
}
$('wp-create').addEventListener('click', () => {
  const seed = generateWorldSeed({ extra: myId, avoid: [...savedSeeds(store()), getFirst()].filter(Boolean) });
  setFirst(seed);                                         // the first world you ever create is remembered as "your first world seed"
  selected = { seed, friend: false }; showStep2();
});
$('wp-join').addEventListener('click', () => pickSeed($('wp-seed-input').value));
$('wp-seed-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') pickSeed(e.target.value); });
$('wp-continue').addEventListener('click', () => { const l = lastPlayed(store()); if (l) { selected = { seed: l.seed, friend: false }; startWorld(l.mode); } });
$('wp-back').addEventListener('click', showStep1);
const copyBtn = async (btn, text) => { const ok = await copyToClipboard(text); btn.textContent = ok ? 'COPIED' : 'SELECT'; setTimeout(() => (btn.textContent = 'COPY'), 1400); };
$('wp-copy').addEventListener('click', () => selected && copyBtn($('wp-copy'), selected.seed));
$('wp-first-copy-1').addEventListener('click', () => copyBtn($('wp-first-copy-1'), getFirst() || ''));
$('wp-first-copy-2').addEventListener('click', () => copyBtn($('wp-first-copy-2'), getFirst() || ''));
$('pm-copy').addEventListener('click', () => game.session && copyBtn($('pm-copy'), game.session.seed));
$('mode-creative').addEventListener('click', () => startWorld('creative'));
$('mode-survival').addEventListener('click', () => startWorld('survival'));

function startWorld(mode) {
  if (!selected) return;
  const { seed, friend } = selected;
  if (!friend) {
    const save = readSave(store(), seed, mode);          // same seed = same terrain; saved blocks/position/hotbar come back
    game.loadWorld(numericSeed(seed), save ? unpackEdits(save.edits) : [], false, save?.player);
    game.mobs.enabled = $('opt-bots').checked;
    game.player.sens = sens;
    game.applySaved(save);
    net.hostSeed = numericSeed(seed);
  }
  net.worldKey = seed;                                    // friends who join us get this seed too
  game.session = { seed, mode, friend: !!friend };
  game.setGameMode(mode);
  $('pm-seed').textContent = seed; $('pm-mode').textContent = mode.toUpperCase();
  deploy();
}

// ---- saving: every 30 s, when you pause, on the SAVE button, and when the tab closes (not while in a friend's world) ----
function saveNow(manual) {
  const s = game.session;
  if (!game.running || !s) return false;
  if (s.friend) { if (manual) game.hud.toast("SAVING IS OFF IN A FRIEND'S WORLD", 1600); return false; }
  const r = writeSave(store(), s.seed, s.mode, game.makeSave());
  if (!r.ok) game.hud.toast('SAVE FAILED: ' + r.error, 2200);
  else if (manual) game.hud.toast('WORLD SAVED', 1200);
  return r.ok;
}
setInterval(() => { if (!game.paused && saveNow(false)) game.hud.toast('AUTOSAVED', 700); }, 30000);
$('pm-save').addEventListener('click', () => saveNow(true));
window.addEventListener('beforeunload', () => saveNow(false));
showStep1();

function updateRotateHint() {
  const portrait = touch && window.innerHeight > window.innerWidth && game.running;
  $('rotate-hint').classList.toggle('hidden', !portrait);
}
window.addEventListener('resize', updateRotateHint);

window.__bootOk = true;
window.__game = game; // handy for debugging in the console
