import * as THREE from 'three';
import { REACH } from '../core/Constants.js';
import { itemInfo } from './Items.js';
import { B } from './BlockTypes.js';
import { bk } from '../survival/Survival.js';
import { placeStructure } from './Structures.js';

/** Minecraft side: aim highlight, punch/break, place against the targeted face, hotbar. */
export class BuildTool {
  constructor(game) {
    this.game = game;
    this.slot = 0;
    this.breakCd = 0;
    this.target = null;
    this.onChange = null;
    const geo = new THREE.BoxGeometry(1.004, 1.004, 1.004);
    this.outline = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
    this.outline.visible = false;
    game.scene.add(this.outline);
  }

  get hotbar() { return this.game.hotbar; }
  get item() { return this.hotbar[this.slot]; }
  get blockId() { return typeof this.item === 'number' ? this.item : null; }

  select(i) { const n = this.hotbar.length; this.slot = ((i % n) + n) % n; this.onChange?.(this.slot); }

  /** Put an item (block id or 'struct:..' / 'veh:..' / 'tool:..') into a hotbar slot. */
  setSlot(i, item) { this.hotbar[i] = item; this.game.hud.setSlotItem(i, item); this.game.saveHotbar?.(); }

  update(dt, input, player, combatMode) {
    const g = this.game;
    this.breakCd -= dt;
    if (!player.alive || player.vehicle) { this.outline.visible = false; this.target = null; return; }

    if (input.consume('nextBlock')) this.select(this.slot + 1);
    if (input.consume('prevBlock')) this.select(this.slot - 1);
    for (let i = 0; i < this.hotbar.length; i++) if (input.consume('slot' + i)) this.select(i);

    const o = player.eyePos, f = player.forward();
    this.target = g.world.raycast(o.x, o.y, o.z, f.x, f.y, f.z, REACH);
    const t = this.target;
    this.outline.visible = !!t;
    if (t) this.outline.position.set(t.x + 0.5, t.y + 0.5, t.z + 0.5);

    // break: X key / BREAK press anywhere; held fire while in BUILD mode
    const wantBreak = input.consume('breakBlock') || (!combatMode && input.fire);
    if (wantBreak && t && this.breakCd <= 0) {
      g.blocks.hit(t.x, t.y, t.z, 1);
      g.viewModel.kickShot(0.5);
      this.breakCd = 0.18;
    }

    // use the selected item on the face we're looking at (works in either mode so you can build mid-fight)
    if (input.consume('place') && t) {
      const it = this.item, px = t.x + t.nx, py = t.y + t.ny, pz = t.z + t.nz;
      if (g.world.getBlock(t.x, t.y, t.z) === B.BED) { g.sleep(); return; }          // aim at a bed + PLACE = sleep through the night
      if (it == null) return;
      if (typeof it === 'number') {
        const b = player.body, r = b.radius;
        const overlapsMe = px + 1 > b.x - r && px < b.x + r && pz + 1 > b.z - r && pz < b.z + r && py + 1 > b.y && py < b.y + b.height;
        if (!overlapsMe) {
          if (g.sv && g.sv.count(bk(it)) < 1) g.hud.toast('NONE LEFT', 700);                    // survival: every block must have been collected
          else if (g.blocks.place(px, py, pz, it) && g.sv) g.sv.take(bk(it));
        }
      } else {
        const info = itemInfo(it);
        if (info.kind === 'struct') {
          const n = placeStructure(g, info.key, px, t.ny === 1 ? t.y : py, pz, player.yaw);
          g.hud.toast(n ? info.label + ' BUILT' : 'NOTHING CHANGED', 1200);
          g.viewModel.kickShot(0.5);
        } else if (info.kind === 'vehicle') {
          if (g.sv && !g.sv.take(info.key === 'jeep' ? 'car' : info.key)) return;               // survival: the vehicle item is used up
          g.vehicles.spawn(info.key, px + 0.5, py, pz + 0.5, player.yaw);
          g.hud.toast(info.label + ' READY: press V / ENTER', 1600);
        } else if (info.kind === 'tool') g.ignite();
      }
    }
  }
}
