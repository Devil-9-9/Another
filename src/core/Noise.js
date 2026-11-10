// Seeded value noise (2D + 3D) + fBm. Deterministic so every peer generates the same world from one seed.
export function hash2(x, z, seed) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

export function hash3(x, y, z, seed) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 1103515245) + Math.imul(z | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

const smooth = (t) => t * t * (3 - 2 * t);

export function valueNoise(x, z, seed) {
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const fx = smooth(x - x0), fz = smooth(z - z0);
  const a = hash2(x0, z0, seed), b = hash2(x0 + 1, z0, seed);
  const c = hash2(x0, z0 + 1, seed), d = hash2(x0 + 1, z0 + 1, seed);
  return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
}

export function valueNoise3(x, y, z, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
  const fx = smooth(x - x0), fy = smooth(y - y0), fz = smooth(z - z0);
  const l = (a, b, t) => a + (b - a) * t;
  const h = (i, j, k) => hash3(x0 + i, y0 + j, z0 + k, seed);
  return l(
    l(l(h(0, 0, 0), h(1, 0, 0), fx), l(h(0, 1, 0), h(1, 1, 0), fx), fy),
    l(l(h(0, 0, 1), h(1, 0, 1), fx), l(h(0, 1, 1), h(1, 1, 1), fx), fy),
    fz,
  );
}

export function fbm(x, z, seed, octaves = 4) {
  let amp = 0.5, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, z * freq, seed + i * 101) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm; // 0..1
}

/**
 * Sample a smooth 3D field on a coarse lattice for one chunk, then trilinearly interpolate per voxel.
 * Much cheaper than evaluating noise for every one of the 4096 voxels. Lattice is aligned to world
 * multiples of `step`, so neighbouring chunks agree exactly on their shared border.
 */
export function makeGrid(fn, x0, y0, z0, size = 16, step = 4) {
  const n = size / step + 1;
  const g = new Float32Array(n * n * n);
  for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    g[(k * n + j) * n + i] = fn(x0 + i * step, y0 + j * step, z0 + k * step);
  }
  return (lx, ly, lz) => {
    const fx = lx / step, fy = ly / step, fz = lz / step;
    const i = Math.min(n - 2, fx | 0), j = Math.min(n - 2, fy | 0), k = Math.min(n - 2, fz | 0);
    const tx = fx - i, ty = fy - j, tz = fz - k;
    const at = (a, b, c) => g[((k + c) * n + (j + b)) * n + (i + a)];
    const l = (a, b, t) => a + (b - a) * t;
    return l(
      l(l(at(0, 0, 0), at(1, 0, 0), tx), l(at(0, 1, 0), at(1, 1, 0), tx), ty),
      l(l(at(0, 0, 1), at(1, 0, 1), tx), l(at(0, 1, 1), at(1, 1, 1), tx), ty),
      tz,
    );
  };
}
