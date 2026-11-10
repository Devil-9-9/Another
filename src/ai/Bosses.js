import * as THREE from 'three';
import { VoxelBody } from '../player/VoxelBody.js';
import { JUMP_SPEED } from '../core/Constants.js';

/**
 * Survival-only final bosses.
 *  DAUDI BEAST (Underworld, 800 HP): chases, charges, stomps the ground, throws lava. 12 damage.
 *  NAVRAJA (Sky realm): 9-headed dragon, 9 x 100 HP. Each head has one element power; kill a head to stop its power. 15 damage max.
 * Both stay in the arena the portal builds. Beating them is saved (they do not come back) and pays out keys, coins, XP and the Dragon Wing.
 */
const box = (w, h, d, c, x, y, z, o = {}) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), o.basic ? new THREE.MeshBasicMaterial({ color: c, fog: false }) : new THREE.MeshLambertMaterial({ color: c })); m.position.set(x, y, z); m.castShadow = true; return m; };

class Beast {
  constructor(game, at) {
    this.game = game; this.name = 'DAUDI BEAST'; this.id = 'boss-beast'; this.boss = true;
    this.body = new VoxelBody(game.world, at.x, at.y, at.z, 1.4, 2.6);
    const g = new THREE.Group();
    g.add(box(2.6, 1.7, 3.8, 0x14100f, 0, 1.9, 0), box(1.6, 1.3, 1.5, 0x1b1514, 0, 2.3, 2.5));
    for (const s of [-1, 1]) {
      const h = box(0.28, 1.3, 0.28, 0xd8d0c0, s * 0.6, 3.3, 2.6); h.rotation.z = -s * 0.35; g.add(h);
      g.add(box(0.2, 0.14, 0.1, 0xff7a10, s * 0.45, 2.45, 3.26, { basic: true }));
    }
    for (const x of [-0.9, 0.9]) for (const z of [-1.3, 1.3]) g.add(box(0.7, 1.2, 0.7, 0x0d0a0a, x, 0.6, z));
    for (let i = 0; i < 4; i++) g.add(box(0.3, 0.6, 0.3, 0xc83a10, 0, 2.95, -1.4 + i * 0.9, { basic: true }));
    this.mesh = g; game.scene.add(g);
    this.hp = 800; this.max = 800; this.alive = true; this.yaw = 0; this.state = 'chase'; this.st = 0;
    this.chargeCd = 6; this.stompCd = 9; this.lavaCd = 4; this.hitCd = 0; this.dir = { x: 0, z: 0 };
  }
  get pos() { return this.body; }
  get radius() { return 1.4; }
  get height() { return 2.6; }
  get targets() { return this.alive ? [this] : []; }
  get frac() { return this.hp / this.max; }

  takeDamage(amount, attacker, headshot) {
    if (!this.alive) return false;
    this.hp -= amount;
    if (this.hp <= 0) { this.alive = false; this.mesh.visible = false; this.game.effects.explosion(this.body.x, this.body.y + 1.5, this.body.z, 6); this.game.onKill?.(attacker, this, headshot); this.reward(); return true; }
    return false;
  }

  reward() {
    const g = this.game, sv = g.sv; if (!sv) return;
    sv.bosses.beast = true; sv.add('underworld_key'); sv.addCoins(1000); sv.addXp(200);
    g.hud.toast('DAUDI BEAST SLAIN: Underworld Key + 1000 coins + 200 XP', 4500);
  }

  update(dt, player) {
    const g = this.game, b = this.body;
    const dx = player.body.x - b.x, dz = player.body.z - b.z, d = Math.hypot(dx, dz);
    this.hitCd -= dt; this.chargeCd -= dt; this.stompCd -= dt; this.lavaCd -= dt; this.st -= dt;
    let speed = 0, face = true;
    if (this.state === 'chase') {
      speed = 5;
      if (this.chargeCd <= 0 && d > 5) { this.state = 'windup'; this.st = 0.9; }
      else if (this.stompCd <= 0 && d < 10) { this.state = 'stomp'; this.st = 0.8; }
      else if (this.lavaCd <= 0 && d > 6 && player.alive) { this.lavaCd = 5.5; this.throwLava(player); }
    } else if (this.state === 'windup') {                                // telegraph: stands still and glares
      speed = 0; this.mesh.scale.setScalar(1 + Math.sin(this.st * 40) * 0.03);
      if (this.st <= 0) { this.state = 'charge'; this.st = 1.1; this.dir = { x: dx / (d || 1), z: dz / (d || 1) }; this.mesh.scale.setScalar(1); }
    } else if (this.state === 'charge') {
      face = false; speed = 17;
      this.yaw = Math.atan2(-this.dir.x, -this.dir.z);
      if (this.st <= 0) { this.state = 'chase'; this.chargeCd = 8 + Math.random() * 3; }
    } else if (this.state === 'stomp') {
      speed = 0;
      if (this.st <= 0) {
        this.state = 'chase'; this.stompCd = 11;
        g.shake = 0.7; g.audio.play('explode'); g.effects.explosion(b.x, b.y + 0.3, b.z, 5);
        if (player.alive && d < 9 && player.body.onGround) player.takeDamage(12, this, false);          // ground shake: jump to dodge it
      }
    }
    if (face && player.alive) this.yaw = Math.atan2(-dx, -dz);
    const mx = this.state === 'charge' ? this.dir.x : (d ? dx / d : 0), mz = this.state === 'charge' ? this.dir.z : (d ? dz / d : 0);
    b.vx += (mx * speed - b.vx) * Math.min(1, 8 * dt); b.vz += (mz * speed - b.vz) * Math.min(1, 8 * dt);
    if ((b.blockedX || b.blockedZ) && b.onGround && speed > 0) b.vy = JUMP_SPEED;
    b.step(dt);
    if (d < 2.8 && Math.abs(player.body.y - b.y) < 2.5 && this.hitCd <= 0 && player.alive) {
      this.hitCd = 1.1; player.takeDamage(12, this, false);
      const k = this.state === 'charge' ? 14 : 6; player.body.vx += (dx / (d || 1)) * k; player.body.vz += (dz / (d || 1)) * k; player.body.vy += 4;
    }
    this.mesh.position.set(b.x, b.y, b.z); this.mesh.rotation.y = this.yaw + Math.PI;
  }

  throwLava(player) {
    const b = this.body, p = player.body, from = { x: b.x, y: b.y + 3, z: b.z };
    const dx = p.x - from.x, dy = p.y + 1 - from.y, dz = p.z - from.z, len = Math.hypot(dx, dy, dz), t = len / 22;
    this.game.projectiles.spawn({ kind: 'orb', from, dir: { x: dx / len, y: dy / len + 0.5 * 8 * t / 22, z: dz / len }, speed: 22, gravity: 8, damage: 12, owner: this, color: 0xff4a10, size: 0.8 });
    this.game.audio.play('rocket');
  }
  dispose() { this.game.scene.remove(this.mesh); }
}

const ELEMENTS = [
  { id: 'fire', name: 'FIRE HEAD', color: 0xff5a1a, cd: 4.2 },
  { id: 'water', name: 'WATER HEAD', color: 0x2a8cff, cd: 9 },
  { id: 'earth', name: 'EARTH HEAD', color: 0x9a7a4a, cd: 5.5 },
  { id: 'air', name: 'AIR HEAD', color: 0xcfeaff, cd: 8.5 },
  { id: 'lightning', name: 'LIGHTNING HEAD', color: 0xfff04a, cd: 7 },
  { id: 'ice', name: 'ICE HEAD', color: 0x8fe0ff, cd: 10.5 },
  { id: 'poison', name: 'POISON HEAD', color: 0x62d92c, cd: 11.5 },
  { id: 'dark', name: 'DARK HEAD', color: 0x2a1840, cd: 14 },
  { id: 'light', name: 'LIGHT HEAD', color: 0xffffff, cd: 13 },
];

class Head {
  constructor(dragon, i, el) {
    this.dragon=dragon; this.el=el; this.name=el.name; this.id='head-'+el.id; this.boss=true;
    this.hp=100; this.alive=true; this.pos={x:0,y:0,z:0}; this.cd=el.cd*(0.4+Math.random()*0.6); this.attackT=0; this.attackPhase=0; this.hitFlash=0;
    this.off={a:(i-4)*0.34,r:3.25,h:2.25+(i%3)*0.72}; this.phase=i*0.83;
    this.rig=new THREE.Group(); this.mesh=new THREE.Group(); this.neck=new THREE.Group();
    const skin=new THREE.MeshLambertMaterial({color:0x292d38,roughness:0.42,metalness:0.28});
    const plate=new THREE.MeshLambertMaterial({color:0x505565,roughness:0.32,metalness:0.48});
    const accent=new THREE.MeshLambertMaterial({color:el.color,emissive:el.color,emissiveIntensity:1.8,roughness:0.25});
    const dark=new THREE.MeshLambertMaterial({color:0x10131a,roughness:0.3,metalness:0.35});
    const sphere=(parent,scale,mat,pos)=>{const m=new THREE.Mesh(new THREE.SphereGeometry(1,18,14),mat);m.scale.set(...scale);m.position.set(...pos);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;};
    sphere(this.neck,[0.30,0.30,1.0],skin,[0,0,-0.45]);
    for(let j=0;j<5;j++) sphere(this.neck,[0.34-j*.035,0.34-j*.035,0.22],plate,[0,0,-0.12-j*.34]);
    sphere(this.mesh,[0.52,0.43,0.62],skin,[0,0,0]);
    sphere(this.mesh,[0.42,0.28,0.58],plate,[0,-0.18,0.28]);
    const muzzle=sphere(this.mesh,[0.34,0.22,0.48],skin,[0,-0.12,0.56]);
    const jaw=sphere(this.mesh,[0.32,0.105,0.40],dark,[0,-0.31,0.58]); this.jaw=jaw;
    for(const side of [-1,1]){
      sphere(this.mesh,[0.105,0.085,0.10],accent,[side*.22,.12,.43]);
      sphere(this.mesh,[0.035,0.035,0.035],dark,[side*.22,.12,.51]);
      const horn=new THREE.Mesh(new THREE.CylinderGeometry(.13,.62,8),plate);horn.position.set(side*.31,.42,-.12);horn.rotation.z=side*-.42;horn.castShadow=true;this.mesh.add(horn);
      const fang=new THREE.Mesh(new THREE.CylinderGeometry(.055,.23,7),plate);fang.position.set(side*.20,-.28,.78);fang.rotation.x=Math.PI;this.mesh.add(fang);
      for(let k=0;k<3;k++) sphere(this.mesh,[.11,.08,.17],plate,[side*(.38+k*.045),-.02,-.18-k*.18]);
    }
    this.rig.add(this.neck); this.rig.add(this.mesh); dragon.mesh.add(this.rig);
  }
  get radius(){return .9;} get height(){return 1.5;}
  takeDamage(amount,attacker,headshot){if(!this.alive)return false;this.hp-=amount;if(this.hp<=0){this.alive=false;this.rig.visible=false;this.dragon.headDown(this,attacker,headshot);return true;}return false;}
}

class Dragon {
  constructor(game, at) {
    this.game=game; this.name='NAVRAJA'; this.id='boss-dragon'; this.c={x:at.x,y:at.y,z:at.z};
    const g=new THREE.Group(); this.mesh=g;
    const skin=new THREE.MeshLambertMaterial({color:0x242936,roughness:.38,metalness:.32});
    const armor=new THREE.MeshLambertMaterial({color:0x596174,roughness:.3,metalness:.58});
    const belly=new THREE.MeshLambertMaterial({color:0x6c5368,roughness:.55,metalness:.12});
    const sphere=(parent,scale,mat,pos)=>{const m=new THREE.Mesh(new THREE.SphereGeometry(1,32,22),mat);m.scale.set(...scale);m.position.set(...pos);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;};
    sphere(g,[1.55,.92,2.55],skin,[0,0,0]); sphere(g,[1.18,.62,1.9],belly,[0,-.43,.15]);
    sphere(g,[.82,.72,1.55],armor,[0,.12,-2.0]);
    // plated spine and long segmented tail
    this.spines=[]; for(let i=0;i<13;i++){const m=new THREE.Mesh(new THREE.CylinderGeometry(.22-i*.009,.62-i*.025,7),armor);m.position.set(0,.82,-1.0-i*.48);m.rotation.x=-Math.PI/2;m.castShadow=true;g.add(m);this.spines.push(m);}
    this.tail=new THREE.Group(); this.tail.position.set(0,.05,-3.0);g.add(this.tail);
    for(let i=0;i<7;i++) sphere(this.tail,[.52-i*.055,.48-i*.05,.72],[skin,armor][i%2],[0,0,-i*.72]);
    const limbs=[]; for(const x of [-1,1]) for(const z of [-1.45,1.35]){const leg=new THREE.Group();leg.position.set(x*1.05,-.48,z);sphere(leg,[.48,.72,.52],skin,[0,-.25,0]);sphere(leg,[.38,.24,.48],armor,[0,-.77,.15]);for(let c=-1;c<=1;c++){const claw=new THREE.Mesh(new THREE.CylinderGeometry(.09,.34,8),armor);claw.position.set(c*.2,-.86,.48);claw.rotation.x=Math.PI/2;leg.add(claw);}g.add(leg);limbs.push(leg);} this.legs=limbs;
    this.wings=[]; this.wingMembranes=[];
    for(const side of [-1,1]){const wing=new THREE.Group();wing.position.set(side*1.0,.48,-.35);g.add(wing);const boneMat=armor;const span=side*1;
      const arm=new THREE.Mesh(new THREE.CylinderGeometry(.12,.2,3.8,10),boneMat);arm.position.set(span*1.8,.15,0);arm.rotation.z=-side*.72;wing.add(arm);
      for(let j=0;j<4;j++){const finger=new THREE.Mesh(new THREE.CylinderGeometry(.045,.09,3.0-j*.28,8),boneMat);finger.position.set(side*(1.25+j*.48),.1,-.15-j*.38);finger.rotation.z=-side*(.8+j*.12);wing.add(finger);}
      const membrane=new THREE.Mesh(new THREE.BoxGeometry(2.8,2.4,0.035),new THREE.MeshLambertMaterial({color:0x34384d,transparent:true,opacity:.82}));membrane.position.z=-.12;wing.add(membrane);this.wings.push(wing);this.wingMembranes.push(membrane);
    }
    game.scene.add(g); this.t=0;this.yaw=0;this.p={x:at.x+12,y:at.y+9,z:at.z};this.ang=0;this.lowT=14;this.lowLeft=0;this.done=false;this.zones=[];this.marks=[];this.alive=true;this.enterT=0;this.entering=true;
    this.heads=ELEMENTS.map((el,i)=>new Head(this,i,el)); this.mesh.position.set(this.p.x,this.p.y-18,this.p.z);
    this.aura=new THREE.Mesh(new THREE.SphereGeometry(4.4,24,16),new THREE.MeshBasicMaterial({color:0x7733ff,transparent:true,opacity:.10,wireframe:true}));g.add(this.aura);
  }

  get targets() { return this.heads.filter((h) => h.alive); }
  get frac() { return this.heads.reduce((s, h) => s + h.hp, 0) / 900; }

  headDown(head, attacker, headshot) {
    const g = this.game, w = head.pos;
    g.effects.explosion(w.x, w.y + 0.7, w.z, 3); g.audio.play('explode');
    g.hud.toast(head.name + ' DOWN: its power is gone', 1800);
    g.onKill?.(attacker, head, headshot);
    if (this.heads.every((h) => !h.alive)) this.defeated();
  }

  defeated() {
    const g = this.game, sv = g.sv; this.alive = false; this.done = true;
    for (const w of this.wings) w.visible = false;
    g.effects.explosion(this.p.x, this.p.y, this.p.z, 8);
    if (sv) {
      sv.bosses.dragon = true; sv.add('sky_key'); sv.addCoins(1000); sv.addXp(500); sv.wing = true;
      g.player.canFly = true; g.hud.toast('NAVRAJA FALLS: Sky Key + 1000 coins + 500 XP + DRAGON WING (press Z to fly)', 6000);
    }
  }

  update(dt, player) {
    if (this.done) { this.mesh.visible = false; return; }
    const g = this.game; this.t += dt; this.enterT += dt;
    // cinematic entrance: rise through the cloud line, spread wings, then begin patrol
    if (this.entering) { const q=Math.min(1,this.enterT/4.5); const ease=1-Math.pow(1-q,3); this.p.y=this.c.y-18+ease*27; if(q>=1)this.entering=false; }
    // fly in circles; every ~18 s swoop low so swords can reach it
    this.lowT -= dt;
    if (this.lowT <= 0) { this.lowLeft = 5; this.lowT = 18; g.hud.toast('NAVRAJA SWOOPS LOW: strike now!', 1600); }
    if (this.lowLeft > 0) this.lowLeft -= dt;
    this.ang += dt * 0.35;
    const alt = this.entering ? this.p.y-this.c.y : (this.lowLeft > 0 ? 2.6 : 8 + Math.sin(this.t * 0.5) * 3.5), R = this.lowLeft > 0 ? 7 : 13;
    const tx = this.c.x + Math.cos(this.ang) * R, tz = this.c.z + Math.sin(this.ang) * R, ty = this.c.y + alt;
    const k = Math.min(1, 2.5 * dt);
    this.p.x += (tx - this.p.x) * k; this.p.y += (ty - this.p.y) * k; this.p.z += (tz - this.p.z) * k;
    const pb = player.body; this.yaw = Math.atan2(-(pb.x - this.p.x), -(pb.z - this.p.z));
    this.mesh.position.set(this.p.x, this.p.y, this.p.z); this.mesh.rotation.y = this.yaw + Math.PI;
    this.wings.forEach((w,i)=>{w.rotation.z=Math.sin(this.t*3.1+i*Math.PI)*.42*(i?-1:1);w.rotation.x=Math.sin(this.t*1.55)*.12;});
    this.tail.rotation.y=Math.sin(this.t*1.35)*.22; this.legs.forEach((l,i)=>{l.rotation.x=Math.sin(this.t*3+i)*.10;}); this.aura.material.opacity=.07+Math.sin(this.t*2.4)*.035;
    this.heads.forEach((h,i)=>{if(!h.alive)return;
      // Each neck/head has its own breathing cycle and a three-stage attack lunge.
      const idleY=Math.sin(this.t*1.7+h.phase)*.16, idleX=Math.sin(this.t*2.1+h.phase)*.09;
      h.attackT=Math.max(0,h.attackT-dt); const attack=h.attackT>0 ? 1-h.attackT/0.82 : 0;
      const wind=Math.max(0,Math.sin(Math.min(1,attack)*Math.PI));
      h.rig.rotation.y=idleY+Math.sin(attack*Math.PI*2)*.22;
      h.rig.rotation.x=idleX-wind*.42;
      h.mesh.rotation.x=Math.sin(this.t*2.8+h.phase)*.08+wind*.30;
      h.jaw.scale.y=.105+(wind>.35?.12*wind:Math.max(0,Math.sin(this.t*2+h.phase)-.93)*.9);
      h.rig.position.z=wind*.42;
    });
    // heads: positions in the dragon's frame (it faces -z locally because the mesh is turned by PI), mirrored into world space
    this.mesh.updateMatrixWorld(true);
    for (const h of this.heads) {
      const lx = Math.sin(h.off.a) * h.off.r, lz = -Math.cos(h.off.a) * h.off.r - 3;        // local to the mesh (front = -z after the PI turn)
      h.mesh.position.set(lx, h.off.h, lz);
      h.neck.position.set(lx * 0.5, h.off.h * 0.5, lz * 0.5 + 0.2); h.neck.lookAt(this.mesh.localToWorld(new THREE.Vector3(lx, h.off.h, lz)));
      const v = this.mesh.localToWorld(new THREE.Vector3(lx, h.off.h, lz));
      h.pos.x = v.x; h.pos.y = v.y - 0.75; h.pos.z = v.z;
      if (h.alive && player.alive) { h.cd -= dt; if (h.cd <= 0) { h.cd = h.el.cd; this.power(h, player); } }
    }
    this.updateEffects(dt, player);
  }

  /** Trigger a visible attack lunge for a specific living head (useful to sync multiplayer cues). */
  triggerHeadAttack(elementId) { const h=this.heads.find(x=>x.el.id===elementId && x.alive); if(!h)return false; h.attackT=0.82; h.attackPhase++; return true; }

  /** Trigger the cinematic entrance again for scripted arena events. */
  playEntrance() { this.entering=true; this.enterT=0; this.p.y=this.c.y-18; this.mesh.visible=true; }

  aim(from, player, speed, extra = {}) {
    const p = player.body, dx = p.x - from.x, dy = p.y + 1.1 - from.y, dz = p.z - from.z, len = Math.hypot(dx, dy, dz);
    this.game.projectiles.spawn({ from, dir: { x: dx / len, y: dy / len, z: dz / len }, speed, owner: this, ...extra, kind: 'orb' });
  }

  power(h, player) {
    h.attackT=0.82; h.attackPhase++;
    const g = this.game, pb = player.body, from = { x: h.pos.x, y: h.pos.y + 0.75, z: h.pos.z };
    switch (h.el.id) {
      case 'fire': this.aim(from, player, 24, { damage: 15, color: 0xff5a1a, size: 0.7 }); g.audio.play('rocket'); break;
      case 'water': this.zones.push({ x: pb.x, z: pb.z, r: 4.5, t: 3.5, mesh: this.column(0x2a8cff, pb.x, pb.y, pb.z, 4.5), tick: 0 }); g.hud.toast('WATER STORM', 900); break;
      case 'earth': for (let i = 0; i < 3; i++) g.projectiles.spawn({ kind: 'orb', from: { x: pb.x + (Math.random() - 0.5) * 6, y: pb.y + 16, z: pb.z + (Math.random() - 0.5) * 6 }, dir: { x: 0, y: -1, z: 0 }, speed: 12, gravity: 20, damage: 12, owner: this, color: 0x8a7a60, size: 1.0 }); break;
      case 'air': {
        const dx = pb.x - this.c.x, dz = pb.z - this.c.z, d = Math.hypot(dx, dz) || 1;
        pb.vx += (dx / d) * 24; pb.vz += (dz / d) * 24; pb.vy += 8; player.takeDamage(5, this, false); g.hud.toast('WIND!', 800); break;
      }
      case 'lightning': this.marks.push({ x: pb.x, y: pb.y, z: pb.z, t: 1.1, mesh: this.column(0xffee55, pb.x, pb.y, pb.z, 1.6, 0.35) }); break;
      case 'ice': this.aim(from, player, 22, { damage: 8, color: 0x8fe0ff, size: 0.6, onHit: () => g.applyStatus('slow', 4) }); break;
      case 'poison': this.aim(from, player, 22, { damage: 4, color: 0x62d92c, size: 0.6, onHit: () => g.applyStatus('poison', 8) }); break;
      case 'dark': g.applyStatus('dark', 5); g.hud.toast('DARKNESS', 900); break;
      case 'light': g.applyStatus('blind', 3); g.hud.toast('LOOK AWAY!', 700); break;
      default: break;
    }
  }

  column(color, x, y, z, r, op = 0.25) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 7, 16, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, side: THREE.DoubleSide, fog: false }));
    m.position.set(x, y + 3.5, z); this.game.scene.add(m); return m;
  }

  updateEffects(dt, player) {
    const g = this.game, pb = player.body;
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i]; z.t -= dt; z.tick -= dt;
      if (z.tick <= 0) { z.tick = 0.7; if (player.alive && Math.hypot(pb.x - z.x, pb.z - z.z) < z.r) player.takeDamage(3.5, this, false); }   // ~12 over the storm
      if (z.t <= 0) { g.scene.remove(z.mesh); this.zones.splice(i, 1); }
    }
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const m = this.marks[i]; m.t -= dt;
      if (m.t <= 0) {
        g.effects.explosion(m.x, m.y + 1, m.z, 2.2); g.audio.play('explode'); g.shake = 0.35;
        if (player.alive && Math.hypot(pb.x - m.x, pb.z - m.z) < 2.4) player.takeDamage(15, this, false);
        g.scene.remove(m.mesh); this.marks.splice(i, 1);
      }
    }
  }

  dispose() {
    this.game.scene.remove(this.mesh);
    for (const z of this.zones) this.game.scene.remove(z.mesh);
    for (const m of this.marks) this.game.scene.remove(m.mesh);
    this.zones = []; this.marks = [];
  }
}

export class BossManager {
  constructor(game) { this.game = game; this.list = []; }
  get targets() { return this.list.flatMap((b) => b.targets); }
  clear() { for (const b of this.list) b.dispose(); this.list = []; this.game.hud.setBoss(null); }

  /** Called by the portals when you arrive. Survival only; a beaten boss does not return. */
  spawn(kind, at) {
    const g = this.game, sv = g.sv;
    if (!sv) return;
    this.clear();
    if (kind === 'beast' && sv.bosses.beast) { g.hud.toast('The Daudi Beast is already slain', 1800); return; }
    if (kind === 'dragon' && sv.bosses.dragon) { g.hud.toast('Navraja is already slain', 1800); return; }
    this.list.push(kind === 'beast' ? new Beast(g, at) : new Dragon(g, at));
    g.hud.toast(kind === 'beast' ? 'THE DAUDI BEAST AWAKENS' : 'NAVRAJA, THE NINE-HEADED DRAGON', 3000);
  }

  update(dt, player) {
    const g = this.game;
    if (!this.list.length) return;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i], c = b.c || b.body;
      if (Math.hypot(c.x - player.body.x, c.z - player.body.z) > 90 || Math.abs((b.c ? b.c.y : b.body.y) - player.body.y) > 70) { b.dispose(); this.list.splice(i, 1); g.hud.setBoss(null); continue; }   // you left the realm: it resets
      if (b.alive === false && !b.heads) { b.dispose(); this.list.splice(i, 1); g.hud.setBoss(null); continue; }
      b.update(dt, player);
      if (b.heads) {
        g.hud.setBoss(b.name, b.frac);
        const dots = document.getElementById('boss-heads');
        if (dots) { if (!dots.children.length) b.heads.forEach((h) => { const s = document.createElement('span'); s.style.background = '#' + h.el.color.toString(16).padStart(6, '0'); dots.appendChild(s); }); [...dots.children].forEach((s, k) => s.classList.toggle('dead', !b.heads[k].alive)); }
        if (b.done) { b.dispose(); this.list.splice(i, 1); g.hud.setBoss(null); }
      } else g.hud.setBoss(b.name, b.frac);
    }
  }
}
