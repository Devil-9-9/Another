#!/usr/bin/env bash
# Optional: copy Three.js / cannon-es / PeerJS into /vendor so the game has zero CDN dependency (full offline PWA).
# Run once on a machine with internet:  bash scripts/vendor.sh
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p vendor
curl -fsSL https://unpkg.com/three@0.160.0/build/three.module.js -o vendor/three.module.js
mkdir -p vendor/addons/loaders vendor/addons/utils
curl -fsSL https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js -o vendor/addons/loaders/GLTFLoader.js
curl -fsSL https://unpkg.com/three@0.160.0/examples/jsm/utils/SkeletonUtils.js -o vendor/addons/utils/SkeletonUtils.js
curl -fsSL https://unpkg.com/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js -o vendor/addons/utils/BufferGeometryUtils.js
curl -fsSL https://unpkg.com/cannon-es@0.20.0/dist/cannon-es.js -o vendor/cannon-es.js
curl -fsSL https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js -o vendor/peerjs.min.js

# point the import map and PeerJS loader at the local copies
sed -i 's#https://unpkg.com/three@0.160.0/build/three.module.js#./vendor/three.module.js#' index.html
sed -i 's#https://unpkg.com/three@0.160.0/examples/jsm/#./vendor/addons/#' index.html
sed -i 's#https://unpkg.com/cannon-es@0.20.0/dist/cannon-es.js#./vendor/cannon-es.js#' index.html
sed -i "s#https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js#vendor/peerjs.min.js#" src/multiplayer/Network.js
# precache them in the service worker
sed -i "s#'./src/ui/styles.css', './src/main.js',#'./src/ui/styles.css', './src/main.js', './vendor/three.module.js', './vendor/cannon-es.js', './vendor/peerjs.min.js',#" service-worker.js
echo "Vendored. Commit /vendor and deploy."
