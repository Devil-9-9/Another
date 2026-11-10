// Pure hitscan resolution (no rendering). Targets: { alive, pos:{x,y,z feet}, radius, height }.

/** Slab test. Returns entry distance t >= 0 or null. */
export function rayAABB(o, d, min, max) {
  let t0 = 0, t1 = Infinity;
  for (const a of ['x', 'y', 'z']) {
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < min[a] || o[a] > max[a]) return null;
    } else {
      let ta = (min[a] - o[a]) / d[a], tb = (max[a] - o[a]) / d[a];
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) return null;
    }
  }
  return t0;
}

export function falloff(dist, range) {
  const near = range * 0.4;
  if (dist <= near) return 1;
  return 1 - 0.45 * Math.min(1, (dist - near) / (range - near));
}

/**
 * Resolve one ray. d must be normalised.
 * Returns { kind: 'entity'|'block'|'none', t, point, target?, headshot?, block? }
 */
export function resolveShot(world, o, d, range, targets, ignore = null) {
  const block = world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, range);
  let limit = block ? block.dist : range;
  let best = null;
  for (const tg of targets) {
    if (tg === ignore || !tg.alive) continue;
    const r = tg.radius ?? 0.3, h = tg.height ?? 1.8, p = tg.pos;
    const t = rayAABB(o, d, { x: p.x - r, y: p.y, z: p.z - r }, { x: p.x + r, y: p.y + h, z: p.z + r });
    if (t !== null && t <= limit && (!best || t < best.t)) best = { tg, t };
  }
  if (best) {
    const point = { x: o.x + d.x * best.t, y: o.y + d.y * best.t, z: o.z + d.z * best.t };
    const h = best.tg.height ?? 1.8;
    return { kind: 'entity', t: best.t, point, target: best.tg, headshot: point.y >= best.tg.pos.y + h * 0.8 };
  }
  if (block) {
    const point = { x: o.x + d.x * block.dist, y: o.y + d.y * block.dist, z: o.z + d.z * block.dist };
    return { kind: 'block', t: block.dist, point, block };
  }
  return { kind: 'none', t: range, point: { x: o.x + d.x * range, y: o.y + d.y * range, z: o.z + d.z * range } };
}
