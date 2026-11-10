import { normalizeId, ID_PATTERN, seedFromId } from './UniqueID.js';
import { normalizeSeed, numericSeed } from '../core/WorldSeed.js';
import { RemotePlayer } from './RemotePlayer.js';
import { sanitizeName } from '../ui/Profile.js';
import { sanitizeLook } from '../player/Character.js';
import { loadModel, gfx } from '../player/Model.js';

const PEER_URL = 'https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js';

function loadPeerJS() {
  if (window.Peer) return Promise.resolve(window.Peer);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = PEER_URL; s.onload = () => resolve(window.Peer); s.onerror = () => reject(new Error('PeerJS failed to load (offline?)'));
    document.head.appendChild(s);
  });
}

/**
 * P2P over PeerJS (WebRTC). Full mesh: when you join a friend you also connect to everyone they know.
 * The host's ID decides the world seed, and the host sends all block edits so late joiners see the same world.
 * Messages: welcome, peers, state, shot, edit, edits (batch), hit, dead
 */
export class Network {
  constructor(myId) {
    this.myId = myId; this.peer = null; this.conns = new Map(); this.remotes = new Map();
    this.game = null; this.ready = false; this.hostSeed = seedFromId(myId); this.worldKey = null;   // worldKey = the 128-bit seed text of the world we host
    this.onStatus = () => {}; this.onSeed = null; this.sendT = 0;
    this.pendingEdits = [];
    this.profile = { name: 'PLAYER', look: null };   // ours, set by main.js
    this.profiles = new Map();                          // friends' names and looks, by peer id
    this.onFriends = () => {}; this.onReady = () => {};
  }

  async start() {
    try {
      const Peer = await loadPeerJS();
      this.peer = new Peer(this.myId);
    } catch (e) { this.onStatus('Offline: bots only (' + e.message + ')'); return; }
    this.peer.on('open', (id) => { this.ready = true; this.onStatus('Online. Share your ID or invite link.'); this.onReady(); });
    this.peer.on('connection', (c) => this.setup(c, true));
    this.peer.on('error', (err) => {
      if (err.type === 'unavailable-id') this.onStatus('Your ID is already online in another tab/device. Close it, then reload.');
      else if (err.type === 'peer-unavailable') this.onStatus('No player with that ID is online.');
      else this.onStatus('Network: ' + err.type);
    });
    this.peer.on('disconnected', () => { try { this.peer.reconnect(); } catch (_) { /* ignore */ } });
  }

  join(rawId) {
    const id = normalizeId(rawId);
    if (!ID_PATTERN.test(id)) { this.onStatus('ID looks like BO-ABCD-1234'); return; }
    if (id === this.myId) { this.onStatus("That's your own ID."); return; }
    if (!this.ready) { this.onStatus('Not connected to the network yet...'); return; }
    if (this.conns.has(id)) return;
    this.onStatus('Connecting to ' + id + '...');
    this.setup(this.peer.connect(id, { reliable: true }), false);
  }

  setup(conn, incoming) {
    const pid = conn.peer;
    conn.on('open', () => {
      this.conns.set(pid, conn);
      conn.send({ t: 'hello', ...this.profile });
      this.onStatus('Connected to ' + this.friendName(pid));
      this.onFriends();
      if (incoming) {
        // we are the host for this friend: send world seed, edits, and who else is here
        const edits = this.game ? [...this.game.world.edits].map(([k, v]) => [...k.split(',').map(Number), v]) : [];
        conn.send({ t: 'welcome', seed: this.hostSeed, key: this.worldKey, edits, peers: [...this.conns.keys()].filter((k) => k !== pid) });
      }
      this.game?.hud.toast(this.friendName(pid) + ' joined');
    });
    conn.on('data', (m) => this.handle(pid, m));
    const drop = () => {
      this.conns.delete(pid);
      const r = this.remotes.get(pid); if (r) { r.dispose(); this.remotes.delete(pid); }
      this.onStatus(this.conns.size ? 'Connected to ' + [...this.conns.keys()].map((k) => this.friendName(k)).join(', ') : 'Friend left. Waiting for players...');
      this.game?.hud.toast(this.friendName(pid) + ' left');
      this.profiles.delete(pid);
      this.onFriends();
    };
    conn.on('close', drop); conn.on('error', drop);
  }

  handle(from, m) {
    if (!m || typeof m !== 'object') return;
    const g = this.game;
    switch (m.t) {
      case 'hello': {                                   // a friend's name and look (untrusted input: sanitise)
        const prof = { name: sanitizeName(m.name, from), look: sanitizeLook(m.look) };
        this.profiles.set(from, prof);
        if (gfx.models) loadModel(prof.look.model);
        this.remotes.get(from)?.setProfile(prof);
        this.onFriends();
        break;
      }
      case 'welcome':
        {
          const key = normalizeSeed(m.key);                 // untrusted: must be a valid 128-bit seed, else fall back to the plain number
          this.worldKey = key;
          this.hostSeed = key ? numericSeed(key) : (Number.isFinite(m.seed) ? m.seed | 0 : this.hostSeed);
          this.pendingEdits = Array.isArray(m.edits) ? m.edits : [];
          this.onSeed?.(this.hostSeed, this.pendingEdits, key);
        }
        for (const p of m.peers || []) if (!this.conns.has(p) && p !== this.myId) this.join(p);
        break;
      case 'state': {
        if (!g) return;
        let r = this.remotes.get(from);
        if (!r) { r = new RemotePlayer(g, from); this.remotes.set(from, r); }
        r.applyState(m);
        break;
      }
      case 'shot':
        g?.effects.tracer(g.v3(m.from), g.v3(m.to));
        g?.effects.muzzle(g.v3(m.from));
        break;
      case 'edit':
        if (Number.isFinite(m.x) && Number.isFinite(m.y) && Number.isFinite(m.z)) g?.blocks.applyRemote(m.x, m.y, m.z, m.id | 0);
        break;
      case 'edits':                                     // batched edits: buildings, explosions, portals (untrusted: validate)
        if (Array.isArray(m.list) && g) for (const e of m.list.slice(0, 12000)) {
          if (Array.isArray(e) && e.length === 4 && e.every(Number.isFinite)) g.blocks.applyRemote(e[0], e[1], e[2], e[3] | 0);
        }
        break;
      case 'hit':
        if (m.to === this.myId && g) g.player.takeDamage(Math.min(200, Number(m.dmg) || 0), { name: this.friendName(from), id: from, remote: true }, !!m.head);
        break;
      case 'dead':
        g?.hud.killfeed(`${m.by} ▸ ${m.who}`);
        break;
      default: break;
    }
  }

  friendName(id) { return this.profiles.get(id)?.name || id; }

  /** Call after the player changes name or look in the wardrobe. */
  setProfile(p) { this.profile = p; this.broadcast({ t: 'hello', ...p }); }

  broadcast(msg) { for (const c of this.conns.values()) if (c.open) c.send(msg); }

  sendShot(from, to, w) { if (this.conns.size) this.broadcast({ t: 'shot', from: { x: from.x, y: from.y, z: from.z }, to: { x: to.x, y: to.y, z: to.z }, w }); }
  sendEdit(x, y, z, id) { if (this.conns.size) this.broadcast({ t: 'edit', x, y, z, id }); }
  sendEdits(list) { if (this.conns.size && list.length) this.broadcast({ t: 'edits', list }); }
  sendHit(to, dmg, head) { const c = this.conns.get(to); if (c?.open) c.send({ t: 'hit', to, dmg, head }); }
  sendDead(by, who) { if (this.conns.size) this.broadcast({ t: 'dead', by, who }); }

  update(dt, player, weaponIdx) {
    for (const r of this.remotes.values()) r.update(dt);
    if (!this.conns.size) return;
    this.sendT -= dt;
    if (this.sendT > 0) return;
    this.sendT = 1 / 15;
    const b = player.body;
    this.broadcast({ t: 'state', x: +b.x.toFixed(2), y: +b.y.toFixed(2), z: +b.z.toFixed(2), yaw: +player.yaw.toFixed(3), hp: Math.round(player.hp), crouch: player.crouching, w: weaponIdx });
  }

  getTargets() { return [...this.remotes.values()]; }
}
