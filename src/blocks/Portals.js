// Minecraft-style portals. Build a 4x5 frame (2x3 opening): OBSIDIAN = Underworld portal, GOLD = Sky portal.
// Light it with the PORTAL LIGHTER (hotbar item) or the H key while aiming at the frame, then stand inside for ~1.5 s.
// The pure frame logic has no rendering imports so it runs in Node tests.
import { B, isPortal } from './BlockTypes.js';
import { SKY_BASE } from '../core/Constants.js';

export const FRAME_PORTAL = { [B.OBSIDIAN]: B.PORTAL_UNDER, [B.CLOUD]: B.PORTAL_SKY, [B.GOLD]: B.PORTAL_SKY };   // Underworld needs obsidian; the Sky realm needs cloud blocks (gold also works in Creative)
const OPEN_W = 2, OPEN_H = 3;
const AXES = [[1, 0], [0, 1]];

/** Is there a finished frame whose opening contains the empty cell (x,y,z)? Returns { cells, portal } or null. */
export function findPortalFrame(world, x, y, z) {
  x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
  for (const [ax, az] of AXES) {
    for (let i = -(OPEN_W - 1); i <= 0; i++) for (let j = -(OPEN_H - 1); j <= 0; j++) {
      const ox = x + i * ax, oy = y + j, oz = z + i * az;
      const cells = [];
      let ok = true;
      for (let a = 0; a < OPEN_W && ok; a++) for (let b = 0; b < OPEN_H; b++) {
        const cx = ox + a * ax, cy = oy + b, cz = oz + a * az;
        if (world.getBlock(cx, cy, cz) !== B.AIR) { ok = false; break; }
        cells.push([cx, cy, cz]);
      }
      if (!ok) continue;
      const frame = world.getBlock(ox - ax, oy, oz - az);
      if (!FRAME_PORTAL[frame]) continue;
      const edges = [];
      for (let a = 0; a < OPEN_W; a++) { edges.push([ox + a * ax, oy - 1, oz + a * az], [ox + a * ax, oy + OPEN_H, oz + a * az]); }
      for (let b = 0; b < OPEN_H; b++) { edges.push([ox - ax, oy + b, oz - az], [ox + OPEN_W * ax, oy + b, oz + OPEN_W * az]); }
      if (edges.every(([ex, ey, ez]) => world.getBlock(ex, ey, ez) === frame)) return { cells, portal: FRAME_PORTAL[frame] };
    }
  }
  return null;
}

/** Walk the connected portal cells around (x,y,z); true if every cell is still enclosed by portal or frame blocks. */
export function portalIntact(world, x, y, z) {
  x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
  const id = world.getBlock(x, y, z);
  if (!isPortal(id)) return { ok: false, cells: [] };
  const wantA = id === B.PORTAL_UNDER ? B.OBSIDIAN : B.CLOUD, wantB = id === B.PORTAL_UNDER ? B.OBSIDIAN : B.GOLD;
  const seen = new Set([x + ',' + y + ',' + z]), cells = [[x, y, z]];
  for (let i = 0; i < cells.length && cells.length < 40; i++) {
    const [cx, cy, cz] = cells[i];
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const nx = cx + dx, ny = cy + dy, nz = cz + dz, k = nx + ',' + ny + ',' + nz;
      if (seen.has(k)) continue;
      if (world.getBlock(nx, ny, nz) === id) { seen.add(k); cells.push([nx, ny, nz]); }
    }
  }
  let ok = cells.length >= OPEN_W * OPEN_H;
  const planeX = cells.every((c) => c[2] === cells[0][2]);      // portal lies in the x/y plane
  const dirs = planeX ? [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]] : [[0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]];
  for (const [cx, cy, cz] of cells) for (const [dx, dy, dz] of dirs) {
    const b = world.getBlock(cx + dx, cy + dy, cz + dz);
    if (b !== id && b !== wantA && b !== wantB) ok = false;
  }
  return { ok, cells };
}

export function lightPortal(game, x, y, z) {
  const f = findPortalFrame(game.world, x, y, z);
  if (!f) return false;
  game.blocks.setMany(f.cells.map((c) => [c[0], c[1], c[2], f.portal]));
  game.audio.play('portal');
  return true;
}

const UNDER_Y = -70, SKY_Y = SKY_BASE + 60, UNDER_LIMIT = -20;

/** Walk-in teleporting. Remembers where you came from so the arrival portal brings you home. */
export class Portals {
  constructor(game) { this.game = game; this.reset(); }
  reset() { this.t = 0; this.cool = 0; this.needExit = false; this.returns = {}; this.game.hud?.setPortal(null, 0); }

  update(dt, player) {
    const g = this.game, w = g.world;
    if (this.cool > 0) this.cool -= dt;
    if (!player.alive || player.vehicle) { this.t = 0; return; }
    const b = player.body;
    let id = 0, px = b.x, py = b.y + 0.9, pz = b.z;
    for (const h of [0.9, 0.2, 1.6]) { const c = w.getBlock(b.x, b.y + h, b.z); if (isPortal(c)) { id = c; py = b.y + h; break; } }
    if (!id) { this.t = Math.max(0, this.t - dt * 2); this.needExit = false; g.hud.setPortal(null, 0); return; }
    if (this.needExit || this.cool > 0) return;
    const chk = portalIntact(w, px, py, pz);
    if (!chk.ok) { g.blocks.setMany(chk.cells.map((c) => [c[0], c[1], c[2], B.AIR])); return; }
    this.t += dt;
    g.hud.setPortal(id === B.PORTAL_UNDER ? 'under' : 'sky', Math.min(1, this.t / 1.5));
    if (this.t >= 1.5) this.teleport(id, player);
  }

  teleport(id, player) {
    const g = this.game, b = player.body, under = id === B.PORTAL_UNDER;
    this.t = 0; this.cool = 4; this.needExit = true;
    g.hud.setPortal(null, 0);
    let dest;
    if (under) {
      if (b.y > UNDER_LIMIT) { this.returns.under = { x: b.x, y: b.y, z: b.z }; dest = this.buildArrival(b.x, b.z, UNDER_Y, B.OBSIDIAN, B.PORTAL_UNDER, 'under'); g.hud.toast('ENTERING THE UNDERWORLD', 2200); }
      else { dest = this.returns.under || g.world.findLandSpawn(b.x, b.z); g.hud.toast('BACK TO THE OVERWORLD', 2000); }
    } else {
      if (b.y < SKY_BASE - 8) { this.returns.sky = { x: b.x, y: b.y, z: b.z }; dest = this.buildArrival(b.x, b.z, SKY_Y, B.GOLD, B.PORTAL_SKY, 'sky'); g.hud.toast('ENTERING THE SKY REALM', 2200); }
      else { dest = this.returns.sky || g.world.findLandSpawn(b.x, b.z); g.hud.toast('BACK DOWN TO EARTH', 2000); }
    }
    this.moveTo(player, dest);
    // survival bosses wait in the arenas the portals build; leaving the realm resets them
    const inRealm = dest.arena;
    if (!inRealm) g.bosses?.clear();
    else if (g.sv) g.bosses?.spawn(dest.arena, dest.arena === 'beast' ? { x: dest.x, y: dest.y, z: dest.z + 8 } : { x: dest.x, y: dest.y, z: dest.z });
  }

  moveTo(player, d) {
    const g = this.game, b = player.body;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) g.world.ensureChunk((Math.floor(d.x) >> 4) + dx, (Math.floor(d.y) >> 4) + dy, (Math.floor(d.z) >> 4) + dz);
    Object.assign(b, { x: d.x, y: d.y, z: d.z, vx: 0, vy: 0, vz: 0 });
    player.safeLanding = true;
    g.blocks.initialLoad(d.x, d.y, d.z, g.touch ? 1 : 2);
    g.audio.play('portal');
  }

  /** A lit portal back home, standing on a platform: obsidian room underground, or a cloud deck in the sky. */
  buildArrival(x, z, y, frame, portal, kind) {
    const g = this.game, cx = Math.floor(x), cz = Math.floor(z), list = [];
    for (let dx = -4; dx <= 4; dx++) for (let dy = -2; dy <= 3; dy++) for (let dz = -4; dz <= 4; dz++) g.world.ensureChunk((cx >> 4) + dx, (y >> 4) + dy, (cz >> 4) + dz);
    if (kind === 'under') {
      for (let dx = -10; dx <= 10; dx++) for (let dz = -10; dz <= 10; dz++) {     // a wide obsidian arena: room to dodge the Daudi Beast
        list.push([cx + dx, y - 1, cz + dz, B.OBSIDIAN]);
        for (let dy = 0; dy <= 7; dy++) list.push([cx + dx, y + dy, cz + dz, B.AIR]);
      }
    } else {
      for (let dx = -12; dx <= 12; dx++) for (let dz = -12; dz <= 12; dz++) {      // a 25x25 cloud deck (big enough to count as anchored) for the Navraja fight
        list.push([cx + dx, y - 1, cz + dz, B.CLOUD], [cx + dx, y - 2, cz + dz, B.CLOUD]);
        for (let dy = 0; dy <= 22; dy++) list.push([cx + dx, y + dy, cz + dz, B.AIR]);
      }
    }
    for (let a = 0; a < 4; a++) for (let h = 0; h < 5; h++) if (a === 0 || a === 3 || h === 0 || h === 4) list.push([cx - 1 + a, y + h - 1, cz - 2, frame]);
    for (let a = 1; a <= 2; a++) for (let h = 1; h <= 3; h++) list.push([cx - 1 + a, y + h - 1, cz - 2, portal]);
    for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) list.push([cx + dx, y, cz + dz, B.LAMP]);
    if (kind === 'under') for (const [dx, dz] of [[-9, -9], [9, -9], [-9, 9], [9, 9], [0, 9], [0, -9], [9, 0], [-9, 0]]) list.push([cx + dx, y, cz + dz, B.LAMP]);
    g.blocks.setMany(list);
    return { x: cx + 0.5, y, z: cz + 1.5, arena: kind === 'under' ? 'beast' : 'dragon' };
  }
}
