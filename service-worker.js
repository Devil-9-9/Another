// Block Ops service worker: precache the app shell, runtime-cache CDN libs.
const VERSION = 'blockops-v9';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './src/ai/Animal.js',
  './src/ai/Bot.js',
  './src/ai/Bosses.js',
  './src/ai/Mob.js',
  './src/survival/Survival.js',
  './src/ai/Fish.js',
  './src/ai/Models.js',
  './src/ai/Villager.js',
  './src/ai/Wildlife.js',
  './src/audio/Audio.js',
  './src/blocks/BlockManager.js',
  './src/blocks/Items.js',
  './src/blocks/Portals.js',
  './src/blocks/Structures.js',
  './src/blocks/BlockTypes.js',
  './src/blocks/BuildTool.js',
  './src/blocks/ChunkMesher.js',
  './src/blocks/Terrain.js',
  './src/blocks/TextureAtlas.js',
  './src/blocks/Village.js',
  './src/blocks/World.js',
  './src/controls/DesktopControls.js',
  './src/controls/InputState.js',
  './src/controls/MobileControls.js',
  './src/core/Constants.js',
  './src/core/DayNight.js',
  './src/core/Effects.js',
  './src/core/Game.js',
  './src/core/SaveGame.js',
  './src/core/WorldSeed.js',
  './src/core/Noise.js',
  './src/core/Physics.js',
  './src/main.js',
  './src/multiplayer/Network.js',
  './src/multiplayer/RemotePlayer.js',
  './src/multiplayer/UniqueID.js',
  './src/player/Character.js',
  './src/player/Humanoid.js',
  './src/player/Model.js',
  './src/player/Player.js',
  './src/player/VoxelBody.js',
  './src/ui/HUD.js',
  './src/ui/Inventory.js',
  './src/vehicles/Vehicles.js',
  './src/ui/Lobby3D.js',
  './src/ui/Profile.js',
  './src/ui/Wardrobe.js',
  './src/ui/HudEditor.js',
  './src/ui/HudLayout.js',
  './src/ui/styles.css',
  './src/weapons/AK47.js',
  './src/weapons/Bow.js',
  './src/weapons/Melee.js',
  './src/weapons/Projectiles.js',
  './src/weapons/RPG.js',
  './src/weapons/SMG.js',
  './src/weapons/Sword.js',
  './src/weapons/Ballistics.js',
  './src/weapons/Pistol.js',
  './src/weapons/Shotgun.js',
  './src/weapons/Sniper.js',
  './src/weapons/ViewModel.js',
  './src/weapons/Weapon.js',
  './src/weapons/WeaponManager.js',
];
const CDN_HOSTS = ['unpkg.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !CDN_HOSTS.includes(url.hostname)) return; // PeerJS signalling etc: network only

  // CDN libs are version-pinned: cache first. Own files: network first so updates land, cache as fallback.
  if (!sameOrigin) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
        return res;
      }))
    );
    return;
  }
  e.respondWith(
    fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
