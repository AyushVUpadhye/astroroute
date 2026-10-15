// Space simulation: orbits, relays, debris swarm, jamming. Owner: Bhumika. See docs/PLAN.md "Interfaces".
// 2-D, sun at (0,0), units AU/days. Deterministic via seeded RNG.

// Mulberry32 seeded RNG — same seed → same sequence.
function mkRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Kepler's third law: period in days for a circular orbit at a AU.
function keplerPeriodDays(a) {
  return 365.25 * Math.pow(a, 1.5);
}

// Relay definitions: name, semi-major axis (AU), initial angle offset (radians).
// phi0 values are chosen so that at t=0 a viable relay chain connects Observatory→Earth.
// The target star lies in the +x direction; relays fan out from the x-axis.
const RELAY_DEFS = [
  { id: "Venus-Relay",   a: 0.72, phi0: 0.3 },
  { id: "Relay-L4",      a: 1.00, phi0:  Math.PI / 3 },
  { id: "Relay-L5",      a: 1.00, phi0: -Math.PI / 3 },
  { id: "Mars-Relay-1",  a: 1.52, phi0: 0.0 },   // near x-axis → chain node
  { id: "Mars-Relay-2",  a: 1.52, phi0: 2.8 },
  { id: "Belt-Relay-1",  a: 2.00, phi0: 0.0 },   // near x-axis → chain node
  { id: "Belt-Relay-2",  a: 2.40, phi0: 0.1 },
  { id: "Outer-Relay",   a: 3.20, phi0: 0.0 },   // near x-axis → bridges to Observatory
];

// Observatory: slow orbit at ~4.5 AU aimed toward the target star (+x direction).
const OBS_DEF = { id: "Observatory", a: 4.5, phi0: 0.0 };

// Build orbit node from definition.
function makeOrbiter(def, kind) {
  const period = keplerPeriodDays(def.a);
  const omega = (2 * Math.PI) / period; // rad/day
  return { id: def.id, name: def.id, kind, a: def.a, phi: def.phi0, omega };
}

// Debris particle cluster: centre + individual offsets.
function makeDebrisCluster(id, x, y, kind, r, strength, vx, vy, rand, n) {
  const particles = [];
  for (let i = 0; i < n; i++) {
    const angle = rand() * 2 * Math.PI;
    const dist = rand() * r;
    particles.push({ dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist });
  }
  return { id, kind, x, y, r, strength, vx, vy, particles };
}

// Debris scenarios — deterministic given seed.
function buildDebris(scenario, rand) {
  const debris = [];
  if (scenario === "default" || scenario === "storm" || scenario === "comet-rain") {
    // One asteroid swarm between Observatory (~4.5 AU, angle~0) and Earth (1 AU, angle~0) = place near 2 AU.
    debris.push(makeDebrisCluster("swarm-0", 2.1, 0.3, "asteroid", 0.35, 30,
      0.0002, -0.0001, rand, 40));
  }
  if (scenario === "storm") {
    debris.push(makeDebrisCluster("swarm-1", 1.5, -0.4, "asteroid", 0.35, 30,
      -0.0001, 0.0002, rand, 40));
    debris.push(makeDebrisCluster("swarm-2", 2.8, 0.6, "asteroid", 0.35, 30,
      0.0001, 0.0001, rand, 40));
  }
  if (scenario === "comet-rain") {
    // Two fast comets with small radius, high attenuation.
    debris.push(makeDebrisCluster("comet-0", -1.0, 3.0, "comet", 0.15, 40,
      0.004, -0.005, rand, 15));
    debris.push(makeDebrisCluster("comet-1",  1.0, -3.0, "comet", 0.15, 40,
      -0.003, 0.006, rand, 15));
  }
  return debris;
}

export function createWorld(scenario = "default") {
  const rand = mkRng(scenario === "default" ? 1 : scenario === "storm" ? 2 : scenario === "comet-rain" ? 3 : 1);

  // Earth at 1 AU.
  const earth = makeOrbiter({ id: "earth", a: 1.0, phi0: 0.0 }, "earth");
  earth.name = "Earth";

  const relays = RELAY_DEFS.map(d => makeOrbiter(d, "relay"));
  const obs = makeOrbiter(OBS_DEF, "observatory");
  obs.name = "Observatory";

  const nodes = [earth, ...relays, obs];
  const debris = buildDebris(scenario, rand);

  return { t: 0, scenario, nodes, debris, _rand: rand };
}

export function step(world, dtHours) {
  const dtDays = dtHours / 24;
  world.t += dtDays;

  // Advance orbital angles.
  for (const n of world.nodes) {
    n.phi += n.omega * dtDays;
  }

  // Drift debris.
  for (const d of world.debris) {
    d.x += d.vx * dtDays;
    d.y += d.vy * dtDays;
  }
}

export function snapshot(world) {
  const nodes = world.nodes.map(n => ({
    id: n.id,
    name: n.name,
    kind: n.kind,
    x: n.a * Math.cos(n.phi),
    y: n.a * Math.sin(n.phi),
  }));

  const debris = world.debris.map(d => ({
    id: d.id,
    kind: d.kind,
    x: d.x,
    y: d.y,
    r: d.r,
    strength: d.strength,
    vx: d.vx,
    vy: d.vy,
    particles: d.particles.map(p => ({ dx: p.dx, dy: p.dy })),
  }));

  return { t: world.t, nodes, debris };
}

// Closest distance from point (cx,cy) to segment (ax,ay)→(bx,by).
function pointSegDist(cx, cy, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(cx - ax, cy - ay);
  const t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / lenSq));
  return Math.hypot(cx - (ax + t * dx), cy - (ay + t * dy));
}

export function attenuationDb(snap, nodeA, nodeB) {
  const na = typeof nodeA === "string" ? snap.nodes.find(n => n.id === nodeA) : nodeA;
  const nb = typeof nodeB === "string" ? snap.nodes.find(n => n.id === nodeB) : nodeB;
  let total = 0;
  for (const d of snap.debris) {
    const s = pointSegDist(d.x, d.y, na.x, na.y, nb.x, nb.y);
    if (s < d.r) {
      total += d.strength * Math.pow(1 - s / d.r, 2);
    }
  }
  return total;
}

export function addDebris(world, x, y, kind) {
  const r = kind === "comet" ? 0.15 : 0.35;
  const strength = kind === "comet" ? 40 : 30;
  const vx = kind === "comet" ? 0.004 : 0.0002;
  const vy = kind === "comet" ? -0.005 : -0.0001;
  const id = `user-${kind}-${world.debris.length}`;
  const n = kind === "comet" ? 15 : 40;
  world.debris.push(makeDebrisCluster(id, x, y, kind, r, strength, vx, vy, world._rand, n));
}

// ── Advanced features ────────────────────────────────────────────────────────

// Look ahead in time to predict whether the link A→B will be jammed within
// horizonHours. Simulates debris positions forward in dtHours increments.
// Returns { willJam, inHours, maxAttenDb, peakHours } — pure, does not mutate world.
export function predictJam(snap, nodeA, nodeB, horizonHours = 24, dtHours = 1) {
  const na = typeof nodeA === "string" ? snap.nodes.find(n => n.id === nodeA) : nodeA;
  const nb = typeof nodeB === "string" ? snap.nodes.find(n => n.id === nodeB) : nodeB;
  if (!na || !nb) return { willJam: false, inHours: Infinity, maxAttenDb: 0, peakHours: Infinity };

  const BLOCK_THRESHOLD = 24; // dB — same logic as router thresholdDb sanity margin
  const dtDays = dtHours / 24;
  const steps = Math.ceil(horizonHours / dtHours);

  // Work on copies of debris positions so we don't mutate.
  const debrisCopies = snap.debris.map(d => ({ ...d }));

  let maxAttenDb = 0, firstJamHours = Infinity, peakHours = 0;

  for (let i = 0; i <= steps; i++) {
    const elapsedHours = i * dtHours;
    let totalDb = 0;
    for (const d of debrisCopies) {
      const cx = d.x + d.vx * dtDays * i;
      const cy = d.y + d.vy * dtDays * i;
      const s = pointSegDist(cx, cy, na.x, na.y, nb.x, nb.y);
      if (s < d.r) totalDb += d.strength * Math.pow(1 - s / d.r, 2);
    }
    if (totalDb > maxAttenDb) { maxAttenDb = totalDb; peakHours = elapsedHours; }
    if (totalDb >= BLOCK_THRESHOLD && firstJamHours === Infinity) firstJamHours = elapsedHours;
  }

  return { willJam: firstJamHours < Infinity, inHours: firstJamHours, maxAttenDb, peakHours };
}

// Check whether any debris currently threatens nodes along a path (within marginAU of
// any segment). Returns { threatened, segments: [{a, b, debrisId, distAU}] }.
export function debrisIntersectsPath(snap, nodeIds, marginAU = 0) {
  const nodes = nodeIds.map(id =>
    typeof id === "string" ? snap.nodes.find(n => n.id === id) : id
  ).filter(Boolean);

  const segments = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i], b = nodes[i + 1];
    for (const d of snap.debris) {
      const s = pointSegDist(d.x, d.y, a.x, a.y, b.x, b.y);
      const effective = d.r + marginAU;
      if (s < effective) {
        segments.push({ a: a.id, b: b.id, debrisId: d.id, distAU: s, debrisKind: d.kind });
      }
    }
  }
  return { threatened: segments.length > 0, segments };
}

// Return the node from snap closest to the given (x, y) coordinate.
// Useful for mapping a UI click to the nearest network node.
export function nearestNode(snap, x, y) {
  let best = null, bestDist = Infinity;
  for (const n of snap.nodes) {
    const d = Math.hypot(n.x - x, n.y - y);
    if (d < bestDist) { bestDist = d; best = n; }
  }
  return best;
}

// Return the attenuation dB for every link that is currently above zero, sorted
// descending — convenience for the UI threat overlay.
export function linkThreatMap(snap) {
  const pairs = [];
  for (let i = 0; i < snap.nodes.length; i++) {
    for (let j = i + 1; j < snap.nodes.length; j++) {
      const db = attenuationDb(snap, snap.nodes[i], snap.nodes[j]);
      if (db > 0) pairs.push({ a: snap.nodes[i].id, b: snap.nodes[j].id, attenDb: db });
    }
  }
  return pairs.sort((x, y) => y.attenDb - x.attenDb);
}

// ── Winning features ─────────────────────────────────────────────────────────

// How many hours until the first link in this path jams.
// The "weakest link" in time — tells you exactly when to pre-emptively reroute.
// Returns { lifetimeHours, bottleneckLink: {a, b}, allLinks: [{a, b, inHours, maxAttenDb}] }
export function pathLifetime(snap, nodeIds, horizonHours = 48, dtHours = 1) {
  const ids = nodeIds.map(id => (typeof id === "string" ? id : id.id));
  const allLinks = [];
  for (let i = 0; i < ids.length - 1; i++) {
    const a = ids[i], b = ids[i + 1];
    const pred = predictJam(snap, a, b, horizonHours, dtHours);
    allLinks.push({ a, b, inHours: pred.willJam ? pred.inHours : horizonHours, maxAttenDb: pred.maxAttenDb, peakHours: pred.peakHours });
  }
  if (allLinks.length === 0) return { lifetimeHours: Infinity, bottleneckLink: null, allLinks };
  const bottleneck = allLinks.reduce((min, l) => l.inHours < min.inHours ? l : min, allLinks[0]);
  return { lifetimeHours: bottleneck.inHours, bottleneckLink: { a: bottleneck.a, b: bottleneck.b }, allLinks };
}

// 0–100 score for how healthy the relay network is right now.
// Measures the fraction of potential links (within maxRangeAU) that are debris-free.
// 100 = all links clear; 0 = every reachable link is fully jammed.
// Also returns counts so the UI can show "7/10 links clear".
export function networkResilienceScore(snap, maxRangeAU = 2.6) {
  const BLOCK_DB = 24; // mirror router threshold
  let total = 0, clear = 0, partialJam = 0, blocked = 0;
  const nodes = snap.nodes;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dist = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
      if (dist > maxRangeAU) continue;
      total++;
      const db = attenuationDb(snap, nodes[i], nodes[j]);
      if (db === 0) clear++;
      else if (db < BLOCK_DB) partialJam++;
      else blocked++;
    }
  }
  if (total === 0) return { score: 100, total: 0, clear: 0, partialJam: 0, blocked: 0 };
  const score = Math.round(100 * (clear + 0.5 * partialJam) / total);
  return { score, total, clear, partialJam, blocked };
}

// Time-series forecast of network threat level over the next horizonHours.
// Does NOT mutate world — simulates a copy of debris positions forward.
// Returns [{ hours, threatLevel, maxAttenDb, linksBlocked }] — like a weather forecast.
// threatLevel: 0 = clear, 1 = partial jam on some links, 2 = at least one link blocked.
export function forecastNetworkHealth(snap, horizonHours = 24, dtHours = 1) {
  const BLOCK_DB = 24;
  const nodes = snap.nodes;
  const maxRangeAU = 2.6;
  const dtDays = dtHours / 24;
  const steps = Math.ceil(horizonHours / dtHours);
  const forecast = [];

  for (let i = 0; i <= steps; i++) {
    const hours = i * dtHours;
    // Project debris positions forward (no mutation).
    const projected = snap.debris.map(d => ({
      ...d, x: d.x + d.vx * dtDays * i, y: d.y + d.vy * dtDays * i,
    }));
    const projSnap = { nodes, debris: projected };

    let maxAttenDb = 0, linksBlocked = 0, anyJam = false;
    for (let a = 0; a < nodes.length; a++) {
      for (let b = a + 1; b < nodes.length; b++) {
        if (Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y) > maxRangeAU) continue;
        const db = attenuationDb(projSnap, nodes[a], nodes[b]);
        if (db > maxAttenDb) maxAttenDb = db;
        if (db >= BLOCK_DB) linksBlocked++;
        else if (db > 0) anyJam = true;
      }
    }
    const threatLevel = linksBlocked > 0 ? 2 : anyJam ? 1 : 0;
    forecast.push({ hours, threatLevel, maxAttenDb: +maxAttenDb.toFixed(2), linksBlocked });
  }
  return forecast;
}

// Which relay is most critical? Ranks relays by how many range-limited link-pairs
// they bridge — removing the top relay would disconnect the most routes.
// Returns [{ id, name, kind, bridgedPairs, criticality }] sorted descending.
export function relayVulnerabilityRanking(snap, maxRangeAU = 2.6) {
  const nodes = snap.nodes;

  // Build adjacency of currently in-range (not necessarily unblocked) links.
  const inRange = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) <= maxRangeAU;

  // For each non-earth, non-observatory node: count how many (src, dst) pairs
  // it lies on a shortest hop-count path between.
  // Simplified betweenness: BFS from every node, count relay as bridge if removing it
  // disconnects any previously connected (src, dst) pair.
  const ids = nodes.map(n => n.id);
  const adj = new Map();
  for (const n of nodes) {
    adj.set(n.id, nodes.filter(m => m.id !== n.id && inRange(n, m)).map(m => m.id));
  }

  function bfsReachable(src, banned) {
    const visited = new Set([src]);
    const queue = [src];
    while (queue.length) {
      const u = queue.shift();
      for (const v of adj.get(u) || []) {
        if (v !== banned && !visited.has(v)) { visited.add(v); queue.push(v); }
      }
    }
    return visited;
  }

  const obsId = nodes.find(n => n.kind === "observatory")?.id;
  const earthId = nodes.find(n => n.kind === "earth")?.id;
  const baseReachable = bfsReachable(obsId, null);

  const results = [];
  for (const node of nodes) {
    if (node.kind === "earth" || node.kind === "observatory") continue;
    const reachable = bfsReachable(obsId, node.id);
    // Count how many nodes are lost by removing this relay.
    const lostNodes = [...baseReachable].filter(id => !reachable.has(id) && id !== node.id).length;
    const disconnectsEarth = baseReachable.has(earthId) && !reachable.has(earthId);
    results.push({
      id: node.id, name: node.name, kind: node.kind,
      lostNodes, disconnectsEarth,
      criticality: disconnectsEarth ? lostNodes + 1000 : lostNodes,
    });
  }
  return results.sort((a, b) => b.criticality - a.criticality);
}

// Given a BLS-detected period (days) and t0 (days), return upcoming transit midpoints
// relative to the current sim time (snap.t in hours).
// Returns [{midDays, midHours, hoursFromNow, epochIndex}] sorted by soonest first.
export function predictTransitWindows(snap, period, t0, count = 6, durationDays = null) {
  if (!(period > 0)) return [];
  const tNowDays = snap.t / 24;
  const epochNow = Math.ceil((tNowDays - t0) / period);
  const out = [];
  for (let i = 0; i < count + 10 && out.length < count; i++) {
    const midDays = (epochNow + i) * period + t0;
    const hoursFromNow = (midDays - tNowDays) * 24;
    if (hoursFromNow > 0) out.push({ midDays, midHours: midDays * 24, hoursFromNow, epochIndex: epochNow + i, durationDays: durationDays ?? period * 0.05 });
  }
  return out;
}

// Count how many node-disjoint paths exist from src to dst using Edmonds-Karp max-flow
// on the node-split graph (each relay split into in/out with capacity 1).
// src/dst themselves are not split (infinite capacity).
export function pathDiversity(snap, maxRangeAU = 2.6) {
  const nodes = snap.nodes;
  const obsId  = nodes.find(n => n.kind === "observatory")?.id;
  const earthId = nodes.find(n => n.kind === "earth")?.id;
  if (!obsId || !earthId) return 0;

  // Node-split: relay i → node i_in (2*i) and i_out (2*i+1); earth/obs use single node
  const idx = new Map(nodes.map((n, i) => [n.id, i]));
  const N = nodes.length * 2;
  const cap = Array.from({ length: N }, () => new Array(N).fill(0));

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const ni = i * 2, no = i * 2 + 1;
    if (n.kind === "relay") cap[ni][no] = 1; // internal capacity 1
    else cap[ni][no] = 999; // earth/obs unlimited
  }
  // External edges: for each in-range pair add edge out_i → in_j and out_j → in_i
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y) > maxRangeAU) continue;
      cap[i * 2 + 1][j * 2] = 999;
      cap[j * 2 + 1][i * 2] = 999;
    }
  }

  const S = idx.get(obsId) * 2 + 1; // source = obs_out
  const T = idx.get(earthId) * 2;   // sink = earth_in

  // BFS to find augmenting path
  function bfs(flow) {
    const prev = new Array(N).fill(-1); prev[S] = S;
    const q = [S];
    for (let qi = 0; qi < q.length; qi++) {
      const u = q[qi];
      for (let v = 0; v < N; v++) {
        if (prev[v] === -1 && cap[u][v] - flow[u][v] > 0) { prev[v] = u; q.push(v); if (v === T) return prev; }
      }
    }
    return null;
  }

  const flow = Array.from({ length: N }, () => new Array(N).fill(0));
  let total = 0;
  let prev;
  while ((prev = bfs(flow)) !== null) {
    let pathFlow = Infinity;
    for (let v = T; v !== S; v = prev[v]) pathFlow = Math.min(pathFlow, cap[prev[v]][v] - flow[prev[v]][v]);
    for (let v = T; v !== S; v = prev[v]) { flow[prev[v]][v] += pathFlow; flow[v][prev[v]] -= pathFlow; }
    total += pathFlow;
  }
  return Math.min(total, 5); // cap display at 5
}

// For a single debris cluster: how many in-range links does it currently block vs partially jam?
// Returns { debrisId, kind, blocked: [{a,b,attenDb}], jammed: [{a,b,attenDb}], clear: number, maxAttenDb }
export function computeSwarmImpact(snap, debrisId, maxRangeAU = 2.6) {
  const BLOCK_DB = 24;
  const d = snap.debris.find(x => x.id === debrisId);
  if (!d) return null;
  const isolatedSnap = { nodes: snap.nodes, debris: [d] };
  const nodes = snap.nodes;
  const blocked = [], jammed = [];
  let clear = 0, maxAttenDb = 0;

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y) > maxRangeAU) continue;
      const db = attenuationDb(isolatedSnap, nodes[i], nodes[j]);
      if (db > maxAttenDb) maxAttenDb = db;
      const entry = { a: nodes[i].id, b: nodes[j].id, attenDb: +db.toFixed(2) };
      if (db >= BLOCK_DB) blocked.push(entry);
      else if (db > 0) jammed.push(entry);
      else clear++;
    }
  }
  return { debrisId, kind: d.kind, blocked, jammed, clear, maxAttenDb: +maxAttenDb.toFixed(2) };
}
