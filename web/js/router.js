// Radio link model + routing, written from scratch (no routing library, no model).
// Best path: Dijkstra, E. W. (1959) "A note on two problems in connexion with graphs",
//   with a binary-heap priority queue.
// Alternate path: shortest path sharing no intermediate node with the best one (fully
//   independent failover); if none exists, the cheapest path that differs by at least one
//   link - the first deviation step of Yen, J. Y. (1971) "Finding the k shortest loopless
//   paths in a network".

export const LIGHT_MIN_PER_AU = 8.317; // 149,597,870.7 km / 299,792.458 km/s = 499.0 s

export const DEFAULTS = { txDb: 30, thresholdDb: 6, comfortDb: 15, lambda: 0.5, maxRangeAU: 2.6, bandwidthMHz: 1 };

// Shannon, C. E. (1948): capacity C = B log2(1 + SNR), SNR as a linear power ratio.
export const capacityMbps = (snrDb, bandwidthMHz = DEFAULTS.bandwidthMHz) =>
  bandwidthMHz * Math.log2(1 + 10 ** (snrDb / 10));

// Toy link budget: tx power minus 1/d^2 spreading loss minus debris jamming.
export function buildLinks(snap, attenuationDb, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const nodes = snap.nodes;
  const links = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const distAU = Math.hypot(a.x - b.x, a.y - b.y);
      const jammingDb = attenuationDb ? attenuationDb(snap, a, b) : 0;
      const snrDb = o.txDb - 20 * Math.log10(Math.max(distAU, 1e-3)) - jammingDb;
      links.push({
        a: a.id, b: b.id, distAU, latencyMin: distAU * LIGHT_MIN_PER_AU, snrDb, jammingDb,
        capacityMbps: capacityMbps(snrDb, o.bandwidthMHz),
        blocked: snrDb < o.thresholdDb || distAU > o.maxRangeAU,
      });
    }
  }
  return links;
}

// Predictive routing: extrapolate every node and debris cloud linearly from the last two
// snapshots and treat a link as unusable if it is blocked now OR will be within aheadDays,
// so traffic leaves a link before the swarm reaches it. Linear is fine over a few days:
// Earth moves ~0.05 AU in 3 days, so its orbit's curvature is negligible at that scale.
export function forecastSnapshot(prev, snap, dtDays, aheadDays) {
  const k = aheadDays / dtDays;
  const move = (list, prevList) => {
    const before = new Map((prevList || []).map((o) => [o.id, o]));
    return list.map((o) => {
      const p = before.get(o.id);
      return p ? { ...o, x: o.x + (o.x - p.x) * k, y: o.y + (o.y - p.y) * k } : o;
    });
  };
  return { ...snap, nodes: move(snap.nodes, prev.nodes), debris: move(snap.debris || [], prev.debris) };
}

export function buildLinksAhead(prev, snap, attenuationDb, dtDays, opts = {}) {
  const now = buildLinks(snap, attenuationDb, opts);
  if (!prev || !(dtDays > 0)) return now;
  const later = buildLinks(forecastSnapshot(prev, snap, dtDays, opts.aheadDays ?? 2), attenuationDb, opts);
  return now.map((l, i) => (later[i].blocked && !l.blocked ? { ...l, blocked: true, forecastBlocked: true } : l));
}

export const edgeKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function linkCost(l, mode, o) {
  if (mode === "reliable") return l.latencyMin + o.lambda * Math.max(0, o.comfortDb - l.snrDb);
  return l.latencyMin;
}

class MinHeap {
  constructor() { this.h = []; }
  get size() { return this.h.length; }
  push(item) {
    const h = this.h; h.push(item);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (h[p][0] <= h[i][0]) break;
      [h[p], h[i]] = [h[i], h[p]]; i = p;
    }
  }
  pop() {
    const h = this.h, top = h[0], last = h.pop();
    if (h.length) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < h.length && h[l][0] < h[m][0]) m = l;
        if (r < h.length && h[r][0] < h[m][0]) m = r;
        if (m === i) break;
        [h[m], h[i]] = [h[i], h[m]]; i = m;
      }
    }
    return top;
  }
}

function dijkstra(links, src, dst, mode, o, bannedNodes = new Set(), bannedEdges = new Set()) {
  if (src === dst) return { nodes: [src], links: [], latencyMin: 0, minSnrDb: Infinity, cost: 0 };
  const adj = new Map();
  const add = (u, v, l, w) => { if (!adj.has(u)) adj.set(u, []); adj.get(u).push([v, l, w]); };
  for (const l of links) {
    if (l.blocked || bannedNodes.has(l.a) || bannedNodes.has(l.b)) continue;
    if (bannedEdges.has(edgeKey(l.a, l.b))) continue;
    const w = linkCost(l, mode, o);
    add(l.a, l.b, l, w); add(l.b, l.a, l, w);
  }
  const dist = new Map([[src, 0]]);
  const prev = new Map();
  const heap = new MinHeap();
  heap.push([0, src]);
  while (heap.size) {
    const [d, u] = heap.pop();
    if (d > dist.get(u)) continue; // stale entry
    if (u === dst) break;
    for (const [v, l, w] of adj.get(u) || []) {
      const nd = d + w;
      if (nd < (dist.has(v) ? dist.get(v) : Infinity)) {
        dist.set(v, nd); prev.set(v, [u, l]); heap.push([nd, v]);
      }
    }
  }
  if (!dist.has(dst)) return null;
  const nodes = [dst], used = [];
  for (let v = dst; v !== src;) { const [u, l] = prev.get(v); used.push(l); nodes.push(u); v = u; }
  nodes.reverse(); used.reverse();
  return summarize(nodes, used, dist.get(dst));
}

function summarize(nodes, used, cost) {
  return {
    nodes, links: used, cost,
    latencyMin: used.reduce((s, l) => s + l.latencyMin, 0),
    minSnrDb: Math.min(...used.map((l) => l.snrDb)),
    capacityMbps: Math.min(...used.map((l) => l.capacityMbps ?? capacityMbps(l.snrDb))),
  };
}

// Widest (maximum-bottleneck) path: Dijkstra with "best = largest minimum capacity so far",
// ties broken by lower latency. Pollack, M. (1960) "The maximum capacity through a network".
function widest(links, src, dst, bannedNodes = new Set(), bannedEdges = new Set()) {
  if (src === dst) return { nodes: [src], links: [], latencyMin: 0, minSnrDb: Infinity, capacityMbps: Infinity, cost: 0 };
  const adj = new Map();
  const add = (u, v, l) => { if (!adj.has(u)) adj.set(u, []); adj.get(u).push([v, l]); };
  for (const l of links) {
    if (l.blocked || bannedNodes.has(l.a) || bannedNodes.has(l.b)) continue;
    if (bannedEdges.has(edgeKey(l.a, l.b))) continue;
    add(l.a, l.b, l); add(l.b, l.a, l);
  }
  const cap = new Map([[src, Infinity]]), lat = new Map([[src, 0]]), prev = new Map(), done = new Set();
  const heap = new MinHeap(); // key: [-capacity, latency] packed into one sortable number pair
  heap.push([-Infinity, src, 0]);
  const better = (c, t, v) => c > (cap.get(v) ?? -1) || (c === cap.get(v) && t < lat.get(v));
  while (heap.size) {
    const [, u] = heap.pop();
    if (done.has(u)) continue;
    done.add(u);
    if (u === dst) break;
    for (const [v, l] of adj.get(u) || []) {
      if (done.has(v)) continue;
      const c = Math.min(cap.get(u), l.capacityMbps ?? capacityMbps(l.snrDb));
      const t = lat.get(u) + l.latencyMin;
      if (better(c, t, v)) { cap.set(v, c); lat.set(v, t); prev.set(v, [u, l]); heap.push([-c + t * 1e-9, v, t]); }
    }
  }
  if (!prev.has(dst)) return null;
  const nodes = [dst], used = [];
  for (let v = dst; v !== src;) { const [u, l] = prev.get(v); used.push(l); nodes.push(u); v = u; }
  nodes.reverse(); used.reverse();
  const r = summarize(nodes, used, 0);
  return { ...r, cost: -r.capacityMbps };
}

const route = (links, src, dst, mode, o, bannedNodes, bannedEdges) => (mode === "throughput"
  ? widest(links, src, dst, bannedNodes, bannedEdges)
  : dijkstra(links, src, dst, mode, o, bannedNodes, bannedEdges));

// mode: "fastest" (min latency) | "reliable" (latency + SNR-margin penalty) | "throughput" (widest path)
export function bestPath(links, src, dst, mode = "fastest", opts = {}) {
  return route(links, src, dst, mode, { ...DEFAULTS, ...opts });
}

export function alternatePath(links, src, dst, best, mode = "fastest", opts = {}) {
  if (!best || best.nodes.length < 2) return null;
  const o = { ...DEFAULTS, ...opts };
  const inner = new Set(best.nodes.slice(1, -1));
  const direct = inner.size === 0 ? new Set([edgeKey(src, dst)]) : new Set();
  const independent = route(links, src, dst, mode, o, inner, direct);
  if (independent) return { ...independent, independent: true };
  let alt = null; // Yen-style: forbid one link of the best path at a time, keep the cheapest
  for (const l of best.links) {
    const r = route(links, src, dst, mode, o, new Set(), new Set([edgeKey(l.a, l.b)]));
    if (r && (!alt || r.cost < alt.cost)) alt = r;
  }
  return alt && { ...alt, independent: false };
}
