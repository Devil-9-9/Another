import * as THREE from 'three';
import { World } from '../blocks/World.js';
import { BlockManager } from '../blocks/BlockManager.js';
import { BuildTool } from '../blocks/BuildTool.js';
import { buildAtlas } from '../blocks/TextureAtlas.js';
import { PhysicsWorld } from './Physics.js';
import { DayNight } from './DayNight.js';
import { Effects } from './Effects.js';
import { Player } from '../player/Player.js';
import { WeaponManager } from '../weapons/WeaponManager.js';
import { ViewModel } from '../weapons/ViewModel.js';
import { Bot } from '../ai/Bot.js';
import { Wildlife } from '../ai/Wildlife.js';
import { GameAudio } from '../audio/Audio.js';
import { HUD } from '../ui/HUD.js';
import { InputState } from '../controls/InputState.js';
import { SKY_BASE, SKY_BAND, MAX_SURFACE } from './Constants.js';
import { B } from '../blocks/BlockTypes.js';
import { loadHotbar, saveHotbar, itemInfo, isValidItem } from '../blocks/Items.js';
import { lightPortal, Portals } from '../blocks/Portals.js';
import { VehicleManager } from '../vehicles/Vehicles.js';
import { Projectiles } from '../weapons/Projectiles.js';
import { PLAYER_HEIGHT } from './Constants.js';
import { packEdits } from './SaveGame.js';
import { Survival, dropFor, bk, isBlockKey, blockOf, ITEM_NAMES } from '../survival/Survival.js';
import { MobManager } from '../ai/Mob.js';
import { BossManager } from '../ai/Bosses.js';
import { Villager } from '../ai/Villager.js';
import { makeHumanoid, animateHumanoid } from '../player/Humanoid.js';
import { modelReady, loadModel, gfx } from '../player/Model.js';
import { resolveShot } from '../weapons/Ballistics.js';

const BOT_NAMES = ['VIPER', 'GHOST', 'RAZOR', 'HAWK', 'WOLF'];
const BASE_FOV = 75;

export class Game {
  constructor({ canvas, net, myId, touch }) {
    this.net = net; this.myId = myId; this.touch = touch;
    this.mode = 'combat';
    this.running = false; this.paused = false; this.last = 0; this.bots = [];
    this.input = new InputState();
    this.audio = new GameAudio();
    this.hud = new HUD();

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !touch, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, touch ? 1.5 : 2));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.05, 250);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    window.addEventListener('resize', () => this.resize());
    this.resize();

    this.atlas = buildAtlas();
    this.physics = new PhysicsWorld();
    this.daynight = new DayNight(this.scene, this.renderer, touch ? 30 : 45);
    this.lamp = new THREE.PointLight(0xffd9a0, 0, 26);
    this.camera.add(this.lamp);
    this.daynight.lamp = this.lamp;
    this.viewModel = new ViewModel(this.camera);
    this.hotbar = loadHotbar(this.storage());
    this.hud.buildHotbar(this.atlas.canvas, (i) => this.build.select(i), this.hotbar);
    this.vehicles = new VehicleManager(this);
    this.projectiles = new Projectiles(this);
    this.portals = new Portals(this);
    this.mobs = new MobManager(this);
    this.bosses = new BossManager(this); this.shake = 0;
    this.sv = null;                                   // Survival state (null in Creative)
    this.torches = []; this.torchT = 0; this.tradeNpc = null;
    this.status = { slow: 0, poison: 0, dark: 0, blind: 0 };
    this.torchLights = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xffaa55, 0, 18, 1.6); this.scene.add(l); return l; });
    this.onInventory = null; this.onTrade = null; this.onCraft = null;
    this.camMode = (this.storage()?.getItem('blockops.cam') === 'fps') ? 'fps' : 'tps';   // third person by default (you can see yourself)
    this.localLook = null; this.selfMesh = null;
    this.gameMode = 'creative'; this.session = null;     // session = { seed (text), mode, friend } set by the lobby
    if (net) net.game = this;
  }

  storage() { try { return window.localStorage; } catch (_) { return null; } }
  saveHotbar() { saveHotbar(this.storage(), this.hotbar); }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  v3(p) { return new THREE.Vector3(p.x, p.y, p.z); }

  getTargets() {
    const t = this.bots.slice();
    if (this.wildlife) t.push(...this.wildlife.getTargets());   // animals, fish and villagers can all be shot
    if (this.net) t.push(...this.net.getTargets());
    t.push(...this.mobs.targets);
    if (this.bosses) t.push(...this.bosses.targets);
    return t;
  }

  /** (Re)build the world. Called at start and when a host's seed arrives. */
  loadWorld(seed, edits = [], withBots = true, startPos = null) {
    this.seed = seed;
    // tear down any previous world
    if (this.blocks) { for (const k of [...this.blocks.meshes.keys()]) this.blocks.disposeMesh(k); this.scene.remove(this.blocks.group); }
    for (const b of this.bots) this.scene.remove(b.mesh);
    this.bots = [];
    this.wildlife?.dispose();
    this.wildlife = new Wildlife(this);
    this.vehicles?.clear(); this.projectiles?.clear(); this.portals?.reset(); this.mobs?.clear(); this.bosses?.clear(); this.torches = [];
    if (this.player?.vehicle) this.exitVehicle(true);

    this.world = new World(seed);
    for (const [x, y, z, id] of edits) this.world.edits.set(`${x},${y},${z}`, id);
    this.effects = this.effects || new Effects(this.scene, this.world);
    this.effects.world = this.world;
    this.blocks = new BlockManager({ scene: this.scene, world: this.world, atlasTexture: this.atlas.texture, physics: this.physics, effects: this.effects, renderDist: this.touch ? 4 : 6, vertDist: this.touch ? 1 : 2 });
    this.blocks.onEdit = (x, y, z, id) => this.net?.sendEdit(x, y, z, id);
    this.blocks.onEdits = (list) => this.net?.sendEdits(list);
    this.blocks.onBroken = (x, y, z, id) => this.onBlockBroken(id);
    this.blocks.onSound = (n) => this.audio.play(n);

    // oceans can cover the origin, so search outward for dry land; each peer starts at a different spot on it
    const a = Math.random() * 6.28, r = Math.random() * 30;
    const spawn = startPos && [startPos.x, startPos.y, startPos.z].every(Number.isFinite) ? { x: startPos.x, y: startPos.y, z: startPos.z } : this.world.findLandSpawn(Math.cos(a) * r, Math.sin(a) * r);
    this.blocks.initialLoad(spawn.x, spawn.y, spawn.z, 2);

    if (!this.player) {
      this.player = new Player(this.world, spawn);
      this.weapons = new WeaponManager(this);
      this.build = new BuildTool(this);
      this.wirePlayer();
    } else {
      this.player.world = this.world; this.player.body.world = this.world;
      Object.assign(this.player.body, { x: spawn.x, y: spawn.y, z: spawn.z, vx: 0, vy: 0, vz: 0 });
    }
    // respawn on dry land near where you fell (also rescues you from the sky, deep caves or the sea)
    this.player.spawnFn = () => {
      const p = this.player.body;
      return this.world.findLandSpawn(p.x + (Math.random() - 0.5) * 20, p.z + (Math.random() - 0.5) * 20, 300);
    };
    this.build.game = this;
    this.hud.setHp(this.player.hp);
    this.hud.setKills(this.player.kills);
    this.hud.setWeapon(this.weapons.weapon);
    this.viewModel.setWeapon(this.weapons.weapon);
    this.build.select(this.build.slot);
    this.setMode('combat');

    if (withBots) for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * 6.28 + 0.7;
      this.bots.push(new Bot(this, BOT_NAMES[i], spawn.x + Math.cos(ang) * 26, spawn.z + Math.sin(ang) * 26));
    }
  }

  wirePlayer() {
    const p = this.player;
    p.onSound = (n) => this.audio.play(n);
    p.onHurt = (amt) => { this.hud.setHp(p.hp); this.hud.damageFlash(); this.audio.play('hurt'); };
    p.onDeath = (attacker) => {
      const by = attacker?.name || attacker?.id || 'the ground';
      this.hud.killfeed(`${by} ▸ YOU`);
      this.hud.toast('ELIMINATED', 2600);
      this.net?.sendDead(by, this.myId);
      this.input.fire = false;
      this.status = { slow: 0, poison: 0, dark: 0, blind: 0 };
      if (this.sv) { this.sv.onDeath(); this.sv.dirty = true; this.hud.toast('YOU DIED: coins and half your items are lost', 3200); }
    };
    p.onRespawn = () => {
      if (this.sv) { this.syncSurvival(); this.weapons.select(0); }                  // hardcore: no free ammo, back to bare hands
      else this.weapons.refillAll();
      this.hud.setHp(p.hp); this.hud.setWeapon(this.weapons.weapon); this.hud.toast('DEPLOYED');
    };
    this.weapons.onChange = (w) => { this.hud.setWeapon(w); this.viewModel.setWeapon(w); };
    this.build.onChange = (i) => { this.hud.selectSlot(i); const it = this.hotbar[i]; if (it != null) this.hud.toast(itemInfo(it).label, 700); };
    p.onFlyChange = (on) => { this.hud.setFlags({ flying: on }); this.hud.toast(on ? 'FLY ON: JUMP up, DUCK down, SPRINT = fast' : 'FLY OFF', 1500); };
  }

  onKill(attacker, victim, headshot) {
    const by = attacker === this.player ? 'YOU' : (attacker?.name || '?');
    this.hud.killfeed(`${by} ▸ ${victim.name}${headshot ? ' ◎' : ''}`);
    if (attacker !== this.player) return;
    if (victim.mob) { this.onMobKill(victim); this.player.kills++; this.hud.setKills(this.player.kills); return; }
    if (this.sv && victim.kind && victim.kind !== 'villager') {            // survival hunting: meat (and wool from sheep) instead of free health
      this.sv.add('meat', 1 + (Math.random() < 0.5 ? 1 : 0)); if (victim.kind === 'sheep') this.sv.add('wool', 1 + (Math.random() < 0.5 ? 1 : 0));
      this.hud.toast('+ MEAT', 900); return;
    }
    if (victim.kind === 'villager') this.hud.toast('A VILLAGER FELL...', 2200);
    else if (victim.kind) {                                   // hunting: farm animals and fish heal you
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 10);
      this.hud.setHp(this.player.hp);
      this.hud.toast('+10 HP', 900);
    } else { this.player.kills++; this.hud.setKills(this.player.kills); }
  }

  setMode(m) {
    this.mode = m;
    this.hud.setMode(m);
    this.viewModel.root.visible = m === 'combat';
    this.hud.toast(m === 'build' ? 'BUILD MODE' : 'COMBAT MODE', 900);
  }

  start() {
    if (this.running) return;
    this.running = true; this.last = performance.now();
    const loop = (t) => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      const dt = Math.min(0.05, (t - this.last) / 1000); this.last = t;
      if (this.paused) { this.renderer.render(this.scene, this.camera); return; }
      this.frame(dt);
    };
    requestAnimationFrame(loop);
  }

  frame(dt) {
    const { input, player, weapons, build } = this;

    // one-shot actions
    if (input.consume('toggleBuild')) this.setMode(this.mode === 'build' ? 'combat' : 'build');
    if (input.consume('swap')) weapons.next();
    for (let i = 0; i < weapons.weapons.length; i++) if (input.consume('weapon' + i)) { weapons.select(i); this.setMode('combat'); }
    if (input.consume('toggleFly') && player.alive && !player.vehicle) {
      if (!player.canFly) this.hud.toast(this.sv ? this.sv.flyHint() : 'FLYING IS LOCKED', 3000); else player.setFlying(!player.flying);
    }
    if (input.consume('vehicle')) this.toggleVehicle();
    if (input.consume('ignite')) this.ignite();
    if (input.consume('inventory')) this.onInventory?.();
    if (input.consume('toggleCamera')) this.toggleCamera();
    if (player.vehicle && !player.alive) this.exitVehicle(true);

    const combat = this.mode === 'combat' && !player.vehicle;
    player.update(dt, input);
    this.vehicles.update(dt, input, player);                 // moves the seated player with the vehicle
    this.updateAim();
    weapons.update(dt, input, player, combat);
    build.update(dt, input, player, combat);

    for (const b of this.bots) b.update(dt, player);
    this.blocks.update(player.body.x, player.body.y, player.body.z, dt);
    this.effects.update(dt);
    this.projectiles.update(dt);
    this.portals.update(dt, player);
    this.mobs.update(dt, player);
    this.bosses?.update(dt, player);
    this.tickSurvival(dt);
    this.tickTorches(dt);
    this.tickStatus(dt);
    if (input.consume('trade') && this.tradeNpc) this.onTrade?.();
    if (input.consume('craft')) this.onCraft?.();
    const env = this.environment();
    this.daynight.update(dt, player.body, env);
    this.hud.setRealm(env.realm, player.body.y);
    this.hud.setUnderwater(env.water);
    this.wildlife.update(dt, player, this.daynight.time);
    this.net?.update(dt, player, weapons.cur);

    this.updateSelf(dt);
    this.syncCamera(dt);
    const w = weapons.weapon;
    this.viewModel.update(dt, {
      ads: player.ads, reloading: w.reloading, sprinting: player.sprinting,
      moving: Math.hypot(player.body.vx, player.body.vz) > 1, visible: combat && player.alive && !(player.ads && w.scope) && !player.flying && !this.tps,
    });
    this.hud.setAmmo(w);
    this.hud.setAds(player.ads, w.scope);
    this.hud.setTime(this.daynight.clock);
    this.renderer.render(this.scene, this.camera);
  }

  /* ---------- game mode + saving ---------- */
  /** 'creative': fly, unlimited inventory, no damage, cannot die. 'survival': normal damage, no flying (hardcore rules come in step 2). */
  setGameMode(mode) {
    const p = this.player, creative = mode === 'creative';
    this.gameMode = mode;
    p.invulnerable = creative;
    if (creative) {
      this.sv = null; p.canFly = true; p.maxHp = 100; this.hud.setMaxHp(100);
      this.restoreCreativeArsenal();
      p.hp = p.maxHp; this.hud.setHp(p.hp); p.setFlying(true);
      this.hud.setSurvival(null);
    } else {
      this.sv = this.sv || new Survival();
      p.canFly = this.sv.canFly(); p.setFlying(false);
      this._lvl = this.sv.level; p.maxHp = this.sv.maxHp; this.hud.setMaxHp(p.maxHp); p.hp = Math.min(p.hp, p.maxHp); this.hud.setHp(p.hp);
      this.hunger = this.sv.hunger; this._wkeys = null; this.sv.dirty = true;
      this.hotbar.fill(null); this.hud.setSurvival(this.sv);
      this.syncSurvival();
    }
    this.hud.setFlags({ gm: creative ? 'CREATIVE' : 'SURVIVAL' });
  }

  /** Creative gets the full arsenal back (survival swaps the loadout for what you own). */
  restoreCreativeArsenal() { this.weapons.restoreAll(); this.hotbar.splice(0, this.hotbar.length, ...loadHotbar(this.storage())); this.hotbar.forEach((it, i) => this.hud.setSlotItem(i, it)); }

  /* ---------- survival ---------- */
  isNight() { return Villager.isNight(this.daynight.time); }

  /** Rebuild what survival lets you hold: weapons you own (hands always), blocks and vehicles you carry as hotbar slots. */
  syncSurvival() {
    const sv = this.sv; if (!sv) return;
    const keys = ['fists', ...sv.ownedWeapons()], sig = keys.join(',');
    const known = this.weapons.keys;
    if (sig !== this._wkeys || !known) { this.weapons.setLoadout(keys, sv.ammo); this._wkeys = sig; }
    else keys.forEach((k, i) => { if (k === 'bow' || k === 'rocket') { const w = this.weapons.weapons[i], total = w.ammo + w.reserve; if (sv.ammo[k] > total) w.reserve += sv.ammo[k] - total; } });
    const blocks = Object.keys(sv.items).filter(isBlockKey).map((k) => ({ id: blockOf(k), n: sv.items[k] }))
      .sort((a, b) => (a.id === B.TORCH ? -2 : a.id === B.BED ? -1 : a.id) - (b.id === B.TORCH ? -2 : b.id === B.BED ? -1 : b.id));
    const slots = blocks.map((b) => ({ item: b.id, n: b.n }));
    if (sv.count('bike')) slots.push({ item: 'veh:bike', n: sv.count('bike') });
    if (sv.count('car')) slots.push({ item: 'veh:jeep', n: sv.count('car') });
    for (let i = 0; i < this.hotbar.length; i++) { const sl = slots[i]; this.hotbar[i] = sl ? sl.item : null; this.hud.setSlotItem(i, sl ? sl.item : null, sl ? sl.n : 0); }
    this.hud.selectSlot(this.build.slot);
    this.hud.setSurvival(sv);
    this.p_canFlySync();
  }
  p_canFlySync() {
    const sv = this.sv, p = this.player; if (!sv) return;
    const can = sv.canFly();
    if (can && !p.canFly) this.hud.toast('FLY UNLOCKED: press Z (double-tap Space)', 4000);
    p.canFly = can;
    if (!can && p.flying) p.setFlying(false);
  }

  /** Level up every 100 XP: +10 max health (and the same amount healed). */
  checkLevel() {
    const sv = this.sv, p = this.player;
    if (this._lvl == null) this._lvl = sv.level;
    if (sv.level > this._lvl) {
      const gained = sv.level - this._lvl; this._lvl = sv.level;
      p.maxHp = sv.maxHp; this.hud.setMaxHp(p.maxHp);
      if (p.alive) p.hp = Math.min(p.maxHp, p.hp + 10 * gained);
      this.hud.setHp(p.hp);
      this.hud.toast(`LEVEL UP! LEVEL ${sv.level}: +${10 * gained} MAX HEALTH`, 3000);
    }
  }

  onBlockBroken(id) {
    const sv = this.sv; if (!sv) return;
    const d = dropFor(id); if (d) sv.add(d);
    sv.addCoins(1);                                                  // every block you break is +1 coin
  }

  onMobKill(m) {
    const sv = this.sv; if (!sv) return;
    const r = Math.random();
    if (m.type === 'zombie') { sv.addCoins(10); sv.addXp(20); this.hud.toast('+10 COINS', 900); }
    else if (m.type === 'spider') { sv.add('string', 1 + (r < 0.4 ? 1 : 0)); }
    else if (m.type === 'creeper') { sv.add('gunpowder', 1 + (r < 0.4 ? 1 : 0)); }
    else if (m.type === 'skeleton' && r < 0.3) sv.add('string', 1);
  }

  tickSurvival(dt) {
    const sv = this.sv, p = this.player; if (!sv) return;
    if (p.alive) {
      const r = sv.tick(dt, p.sprinting);
      if (r.damage) p.takeDamage(r.damage, { name: 'HUNGER' });
      if (r.ate) this.hud.toast('ATE ' + ITEM_NAMES[r.ate].toUpperCase(), 1000);
    }
    Object.assign(sv.ammo, this.weapons.ammoTotals());
    this.checkLevel();
    if (sv.dirty) { sv.dirty = false; this.syncSurvival(); }
    this.hud.setHunger(sv.hunger);
    // trader nearby?
    let npc = null;
    if (p.alive && !p.vehicle && this.wildlife) for (const v of this.wildlife.villagers.values()) {
      if (v.alive && Math.hypot(v.body.x - p.body.x, v.body.z - p.body.z) < 3.5 && Math.abs(v.body.y - p.body.y) < 2.5) { npc = v; break; }
    }
    if (npc !== this.tradeNpc) {
      this.tradeNpc = npc;
      const pr = document.getElementById('trade-prompt');
      if (pr) { pr.classList.toggle('hidden', !npc); if (npc) document.getElementById('trade-who').textContent = npc.name; }
    }
  }

  /** Torches: tracked from the world's edits (so friends' torches count), the nearest 3 give real light. */
  refreshTorches() {
    const out = [];
    for (const [k, id] of this.world.edits) if (id === B.TORCH) { const [x, y, z] = k.split(',').map(Number); out.push({ x: x + 0.5, y: y + 0.5, z: z + 0.5 }); }
    this.torches = out;
  }
  torchNear(x, y, z, r) { const r2 = r * r; for (const t of this.torches) if ((t.x - x) ** 2 + (t.y - y) ** 2 + (t.z - z) ** 2 <= r2) return true; return false; }
  tickTorches(dt) {
    this.torchT -= dt;
    if (this.torchT > 0) return;
    this.torchT = 0.8; this.refreshTorches();
    const b = this.player.body;
    const near = this.torches.map((t) => ({ t, d: (t.x - b.x) ** 2 + (t.y - b.y) ** 2 + (t.z - b.z) ** 2 })).filter((o) => o.d < 900).sort((a, c) => a.d - c.d);
    this.torchLights.forEach((l, i) => { const o = near[i]; if (o) { l.position.set(o.t.x, o.t.y + 0.4, o.t.z); l.intensity = 2.6; } else l.intensity = 0; });
  }

  /** Status effects from the dragon's heads. */
  applyStatus(kind, secs) { this.status[kind] = Math.max(this.status[kind], secs); if (kind === 'blind') this.hud.setStatus('blind', true); }
  tickStatus(dt) {
    const st = this.status, p = this.player;
    for (const k of Object.keys(st)) if (st[k] > 0) st[k] = Math.max(0, st[k] - dt);
    p.speedMult = st.slow > 0 ? 0.4 : 1;
    if (st.poison > 0 && p.alive) { this._poisonAcc = (this._poisonAcc || 0) + dt * 1.5; if (this._poisonAcc >= 1) { this._poisonAcc -= 1; p.takeDamage(1, { name: 'POISON' }); } }
    this.hud.setStatus('ice', st.slow > 0); this.hud.setStatus('poison', st.poison > 0); this.hud.setStatus('dark', st.dark > 0);
    if (st.blind < 2.7) this.hud.setStatus('blind', false);        // white flash cuts in instantly, then fades out over ~2 s
  }

  /** Aim at a bed + PLACE: sleep through the night and heal. */
  sleep() {
    if (!this.isNight()) { this.hud.toast('YOU CAN ONLY SLEEP AT NIGHT', 1500); return; }
    this.daynight.setTime(0.27);
    this.player.hp = this.player.maxHp; this.hud.setHp(this.player.hp);
    this.hud.toast('GOOD MORNING: healed', 1800);
  }

  /** Everything that must survive a reload: blocks you changed, where you stand, your hotbar. */
  makeSave() {
    const p = this.player, b = p.body;
    return {
      player: { x: b.x, y: b.y, z: b.z, yaw: p.yaw, pitch: p.pitch, hp: p.hp, flying: p.flying },
      hotbar: this.sv ? undefined : [...this.hotbar], slot: this.build.slot, edits: packEdits(this.world.edits),
      survival: this.sv ? this.sv.toJSON() : undefined,
    };
  }

  /** Put a loaded save's personal bits back (the blocks and position went into loadWorld). */
  applySaved(save) {
    this.sv = save?.survival ? Survival.fromJSON(save.survival) : null;
    if (!save) return;
    const p = this.player, s = save.player || {};
    if (Number.isFinite(s.yaw)) p.yaw = s.yaw;
    if (Number.isFinite(s.pitch)) p.pitch = Math.max(-1.5, Math.min(1.5, s.pitch));
    if (Number.isFinite(s.hp) && s.hp > 0) { p.hp = Math.min(s.hp, 300); this.hud.setHp(p.hp); }     // clamped to max health when the mode is set
    for (let i = 0; i < this.hotbar.length && Array.isArray(save.hotbar) && !save.survival; i++) if (isValidItem(save.hotbar[i])) { this.hotbar[i] = save.hotbar[i]; this.hud.setSlotItem(i, save.hotbar[i]); }
    if (Number.isInteger(save.slot)) this.build.select(save.slot);
    for (let i = 0; i < 20 && p.body.hits(p.body.x, p.body.y, p.body.z); i++) p.body.y += 1;   // blocks placed since: step out of them
  }

  /* ---------- camera: first / third person ---------- */
  /** Third person on foot (alive, not in a vehicle). Scoped weapons switch to first person while aiming so the scope view works. */
  get tps() {
    const p = this.player;
    return this.camMode === 'tps' && !!p && p.alive && !p.vehicle && !(p.ads && this.weapons.weapon.scope);
  }

  toggleCamera() {
    this.camMode = this.camMode === 'tps' ? 'fps' : 'tps';
    try { this.storage()?.setItem('blockops.cam', this.camMode); } catch (_) { /* ignore */ }
    this.hud.toast(this.camMode === 'tps' ? 'THIRD PERSON' : 'FIRST PERSON', 900);
  }

  /** Call when the wardrobe look changes (or at start) so your avatar matches. */
  setLocalLook(look) { this.localLook = look; if (this.selfMesh) { this.scene.remove(this.selfMesh); this.selfMesh = null; } }

  /** Over-the-shoulder camera, Free Fire style: behind and above, shifted a little right, pulled in by walls. */
  tpsCamPos(out) {
    const p = this.player, e = p.eyePos, cp = Math.cos(p.pitch);
    const f = { x: -Math.sin(p.yaw) * cp, y: Math.sin(p.pitch), z: -Math.cos(p.yaw) * cp }, r = p.right();
    const dist = p.ads ? 1.8 : 3.4, shoulder = p.ads ? 0.3 : 0.5, lift = 0.45;
    const dx = -f.x * dist + r.x * shoulder, dy = -f.y * dist + lift, dz = -f.z * dist + r.z * shoulder;
    const len = Math.hypot(dx, dy, dz);
    const hit = this.world.raycast(e.x, e.y, e.z, dx, dy, dz, len);
    const k = hit ? Math.max(0.2, hit.dist - 0.3) / len : 1;
    out.set(e.x + dx * k, e.y + dy * k, e.z + dz * k);
    return out;
  }

  /** Third person: find the point under the crosshair so shots and block targeting go where the crosshair points. */
  updateAim() {
    const p = this.player;
    if (!this.tps) { p.aimPoint = null; return; }
    if (!this._camTmp) this._camTmp = this.camera.position.clone();
    const c = this.tpsCamPos(this._camTmp), cp = Math.cos(p.pitch);
    const d = { x: -Math.sin(p.yaw) * cp, y: Math.sin(p.pitch), z: -Math.cos(p.yaw) * cp };
    const res = resolveShot(this.world, { x: c.x, y: c.y, z: c.z }, d, 300, this.getTargets(), p);
    p.aimPoint = res.point;
  }

  /** Your own body, visible in third person. */
  updateSelf(dt) {
    const p = this.player, show = this.tps;
    const look = this.localLook;
    if (show && look && gfx.models && look.model && look.model !== 'blocky' && !modelReady(look.model)) loadModel(look.model);
    if (this.selfMesh && !this.selfMesh.userData.isModel && look?.model && look.model !== 'blocky' && gfx.models && modelReady(look.model)) { this.scene.remove(this.selfMesh); this.selfMesh = null; }
    if (!this.selfMesh && show) {
      this.selfMesh = makeHumanoid(0x2f7fd0, true, look);
      this.selfMesh.rotation.order = 'YXZ';
      this.scene.add(this.selfMesh);
    }
    const m = this.selfMesh;
    if (!m) return;
    m.visible = show;
    if (!show) return;
    const b = p.body, speed = Math.hypot(b.vx, b.vz);
    m.position.set(b.x, b.y, b.z);
    m.rotation.y = p.yaw + Math.PI;
    const lean = p.flying ? Math.min(0.7, Math.hypot(b.vx, b.vy, b.vz) / 30) : 0;
    m.rotation.x += (lean - m.rotation.x) * Math.min(1, dt * 6);
    m.scale.y = p.crouching ? 0.78 : 1;
    animateHumanoid(m, dt, p.flying ? 0 : speed);
  }

  /* ---------- vehicles, portals ---------- */
  toggleVehicle() {
    const p = this.player;
    if (!p.alive) return;
    if (p.vehicle) { this.exitVehicle(); return; }
    const v = this.vehicles.nearest(p.body, 5);
    if (!v) { this.hud.toast('NO VEHICLE NEARBY', 1200); return; }
    p.setFlying(false);
    p.vehicle = v; v.driver = p; v.speed = 0;
    p.yaw = v.yaw; p.pitch = 0.2; p.crouching = false; p.body.height = PLAYER_HEIGHT;
    this.input.fire = false; this.input.aim = false; this.input.crouch = false;
    this.hud.setFlags({ vehicle: v.label });
    this.hud.toast('DRIVING ' + v.label + '  (V = exit)', 1800);
  }

  exitVehicle(silent = false) {
    const p = this.player, v = p.vehicle;
    if (!v) return;
    p.vehicle = null; v.driver = null; v.speed = 0;
    // step out beside it, on whichever side has room
    const r = v.spec.radius + p.body.radius + 0.5, b = v.body;
    const spots = [[r, 0], [-r, 0], [0, r], [0, -r], [0, 0]];
    let placed = false;
    for (const [dx, dz] of spots) {
      for (const dy of [0.1, 1.1, 2.1]) {
        if (!p.body.hits(b.x + dx, b.y + dy, b.z + dz, PLAYER_HEIGHT)) { Object.assign(p.body, { x: b.x + dx, y: b.y + dy, z: b.z + dz, vx: 0, vy: 0, vz: 0 }); placed = true; break; }
      }
      if (placed) break;
    }
    if (!placed) Object.assign(p.body, { x: b.x, y: b.y + v.spec.height + 1, z: b.z, vx: 0, vy: 0, vz: 0 });
    p.safeLanding = true;                                     // hopping out of a helicopter in mid-air does not hurt
    this.hud.setFlags({ vehicle: null });
    if (!silent) this.hud.toast('OUT OF ' + v.label, 900);
  }

  /** Light the portal frame you are aiming at (PORTAL LIGHTER item, or the H key). */
  ignite() {
    const t = this.build?.target;
    if (!t) { this.hud.toast('AIM AT A PORTAL FRAME', 1200); return; }
    const ok = lightPortal(this, t.x + t.nx, t.y + t.ny, t.z + t.nz) || lightPortal(this, t.x, t.y + 1, t.z);
    this.hud.toast(ok ? 'PORTAL LIT: step inside' : 'NEEDS A 4x5 FRAME: obsidian or gold, 2x3 opening', 1800);
  }

  /** Where is the player? Drives fog, light, headlamp and the realm label. */
  environment() {
    const b = this.player.body, y = b.y;
    const surface = this.world.heightAt(b.x, b.z);
    const under = y < MAX_SURFACE ? Math.max(0, Math.min(1, (surface - y - 5) / 12)) : 0;
    const high = Math.max(0, Math.min(1, (y - (SKY_BASE - 20)) / 80));
    const e = this.camera.position;
    const water = this.world.fluidAt(e.x, e.y, e.z) === B.WATER;
    let realm = 'OVERWORLD';
    if (y >= SKY_BASE) realm = 'SKY REALM ' + (Math.floor((y - SKY_BASE) / SKY_BAND) + 1);
    else if (y >= MAX_SURFACE) realm = 'OPEN SKY';
    else if (y < surface - 5) realm = y < 0 ? 'UNDERWORLD' : 'CAVES';
    else if (b.inWater) realm = 'SWIMMING';
    return { under, high, water, realm };
  }

  syncCamera(dt) {
    const p = this.player, c = this.camera, e = p.eyePos;
    if (p.vehicle) {                                          // 3rd-person chase camera
      if (p.vehicle.type !== 'heli') p.yaw = p.vehicle.yaw;   // cars and boats steer with the keys; the mouse only tilts the view
      p.pitch = Math.max(-0.6, Math.min(0.9, p.pitch));
      p.vehicle.chaseCamera(p, c.position);
    } else if (this.tps) this.tpsCamPos(c.position);
    else c.position.set(e.x, e.y, e.z);
    if (this.shake > 0) { c.position.x += (Math.random() - 0.5) * this.shake; c.position.y += (Math.random() - 0.5) * this.shake; this.shake = Math.max(0, this.shake - dt * 1.6); }
    c.rotation.y = p.yaw; c.rotation.x = p.pitch;
    c.rotation.z += ((p.alive ? 0 : 0.9) - c.rotation.z) * Math.min(1, dt * 4); // topple when dead
    if (!p.alive) c.position.y -= 0.9;
    const target = p.ads ? this.weapons.weapon.adsFov : (p.sprinting ? BASE_FOV + 6 : BASE_FOV);
    if (Math.abs(c.fov - target) > 0.05) { c.fov += (target - c.fov) * Math.min(1, dt * 12); c.updateProjectionMatrix(); }
  }
}
