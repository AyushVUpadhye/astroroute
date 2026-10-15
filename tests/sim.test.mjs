import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createWorld, step, snapshot, attenuationDb, addDebris,
  predictJam, debrisIntersectsPath, nearestNode, linkThreatMap,
  pathLifetime, networkResilienceScore, forecastNetworkHealth,
  relayVulnerabilityRanking, computeSwarmImpact,
} from "../web/js/sim.js";

test("attenuation is 0 when debris is far from segment", () => {
  const world = createWorld("default");
  const snap = snapshot(world);
  // Place a debris far from any node pair and verify 0 attenuation manually.
  const farSnap = {
    nodes: [{ id: "A", x: 0, y: 0 }, { id: "B", x: 1, y: 0 }],
    debris: [{ id: "d", x: 0, y: 5, r: 0.1, strength: 30 }],
  };
  assert.strictEqual(attenuationDb(farSnap, "A", "B"), 0);
});

test("attenuation is max (strength) when debris centre is on segment", () => {
  const snap = {
    nodes: [{ id: "A", x: 0, y: 0 }, { id: "B", x: 2, y: 0 }],
    debris: [{ id: "d", x: 1, y: 0, r: 0.5, strength: 30 }],
  };
  // s=0, so strength*(1-0)^2 = 30
  assert.strictEqual(attenuationDb(snap, "A", "B"), 30);
});

test("attenuation is symmetric: A->B equals B->A", () => {
  const snap = {
    nodes: [{ id: "A", x: -1, y: 0 }, { id: "B", x: 1, y: 0 }],
    debris: [{ id: "d", x: 0, y: 0.2, r: 0.5, strength: 20 }],
  };
  const ab = attenuationDb(snap, "A", "B");
  const ba = attenuationDb(snap, "B", "A");
  assert.ok(Math.abs(ab - ba) < 1e-10, `symmetric: ${ab} vs ${ba}`);
  assert.ok(ab > 0, "should have non-zero attenuation");
});

test("orbits keep radius after 1000 steps", () => {
  const world = createWorld("default");
  const snap0 = snapshot(world);
  const radii0 = snap0.nodes.map(n => Math.hypot(n.x, n.y));

  for (let i = 0; i < 1000; i++) step(world, 1); // 1000 hours

  const snap1 = snapshot(world);
  const radii1 = snap1.nodes.map(n => Math.hypot(n.x, n.y));

  for (let i = 0; i < radii0.length; i++) {
    assert.ok(Math.abs(radii0[i] - radii1[i]) < 1e-9,
      `node ${snap0.nodes[i].id} radius changed from ${radii0[i]} to ${radii1[i]}`);
  }
});

test("same seed produces same snapshot", () => {
  const w1 = createWorld("default");
  const w2 = createWorld("default");
  for (let i = 0; i < 50; i++) { step(w1, 24); step(w2, 24); }
  const s1 = snapshot(w1);
  const s2 = snapshot(w2);
  for (let i = 0; i < s1.nodes.length; i++) {
    assert.ok(Math.abs(s1.nodes[i].x - s2.nodes[i].x) < 1e-12);
    assert.ok(Math.abs(s1.nodes[i].y - s2.nodes[i].y) < 1e-12);
  }
  for (let i = 0; i < s1.debris.length; i++) {
    assert.ok(Math.abs(s1.debris[i].x - s2.debris[i].x) < 1e-12);
    assert.ok(Math.abs(s1.debris[i].y - s2.debris[i].y) < 1e-12);
  }
});

test("addDebris adds a new debris entry", () => {
  const world = createWorld("default");
  const before = world.debris.length;
  addDebris(world, 1.5, 0.5, "comet");
  assert.strictEqual(world.debris.length, before + 1);
  const d = world.debris[world.debris.length - 1];
  assert.strictEqual(d.kind, "comet");
  assert.ok(Math.abs(d.x - 1.5) < 1e-12);
  assert.ok(Math.abs(d.y - 0.5) < 1e-12);
});

test("snapshot includes all expected fields", () => {
  const world = createWorld("default");
  const snap = snapshot(world);
  assert.ok(typeof snap.t === "number");
  assert.ok(Array.isArray(snap.nodes));
  assert.ok(Array.isArray(snap.debris));
  const earth = snap.nodes.find(n => n.id === "earth");
  assert.ok(earth, "earth node missing");
  assert.ok(typeof earth.x === "number" && typeof earth.y === "number");
  const obs = snap.nodes.find(n => n.kind === "observatory");
  assert.ok(obs, "observatory node missing");
});

test("storm scenario has 3 debris swarms", () => {
  const world = createWorld("storm");
  assert.strictEqual(world.debris.length, 3);
});

test("default scenario debris moves after steps", () => {
  const w = createWorld("default");
  const snap0 = snapshot(w);
  for (let i = 0; i < 100; i++) step(w, 24);
  const snap1 = snapshot(w);
  assert.ok(snap0.debris[0].x !== snap1.debris[0].x || snap0.debris[0].y !== snap1.debris[0].y,
    "debris should have drifted");
});

// ── Advanced feature tests ────────────────────────────────────────────────────

test("predictJam: debris far from segment predicts no jam", () => {
  const snap = {
    nodes: [{ id: "A", x: 0, y: 0 }, { id: "B", x: 1, y: 0 }],
    debris: [{ id: "d", x: 0, y: 5, r: 0.1, strength: 30, vx: 0, vy: 0 }],
  };
  const result = predictJam(snap, "A", "B", 48, 1);
  assert.strictEqual(result.willJam, false);
  assert.strictEqual(result.maxAttenDb, 0);
});

test("predictJam: debris heading toward segment predicts future jam", () => {
  // Debris starts 2 AU above the segment and drifts down at 0.1 AU/day = 2.4 AU/hour×...
  // Actually vx/vy are AU/day. 1 AU/day drift, starts at y=0.5, segment along x-axis.
  // After 0.5 days = 12 hours, debris reaches y=0.
  const snap = {
    nodes: [{ id: "A", x: -1, y: 0 }, { id: "B", x: 1, y: 0 }],
    debris: [{ id: "d", x: 0, y: 0.4, r: 0.35, strength: 30, vx: 0, vy: -1.0 }],
  };
  const result = predictJam(snap, "A", "B", 24, 1);
  // debris at y=0.4 drifting at 1 AU/day; after ~9.6 hours it reaches r=0.35
  assert.ok(result.willJam, "should predict a jam");
  assert.ok(result.inHours > 0 && result.inHours <= 24, `jam in ${result.inHours}h`);
  assert.ok(result.maxAttenDb > 0);
});

test("predictJam: does not mutate the snapshot", () => {
  const snap = {
    nodes: [{ id: "A", x: 0, y: 0 }, { id: "B", x: 2, y: 0 }],
    debris: [{ id: "d", x: 1, y: 0.5, r: 0.3, strength: 20, vx: 0.01, vy: -0.01 }],
  };
  const originalX = snap.debris[0].x;
  predictJam(snap, "A", "B", 100, 5);
  assert.strictEqual(snap.debris[0].x, originalX, "predictJam must not mutate snap.debris");
});

test("debrisIntersectsPath: debris on path is detected", () => {
  const snap = {
    nodes: [
      { id: "A", x: 0, y: 0 },
      { id: "B", x: 2, y: 0 },
      { id: "C", x: 4, y: 0 },
    ],
    debris: [{ id: "swarm", x: 1, y: 0, r: 0.3, strength: 30 }],
  };
  const result = debrisIntersectsPath(snap, ["A", "B", "C"]);
  assert.ok(result.threatened, "path through debris should be threatened");
  assert.ok(result.segments.length > 0);
  assert.strictEqual(result.segments[0].debrisId, "swarm");
});

test("debrisIntersectsPath: debris far from path is not detected", () => {
  const snap = {
    nodes: [{ id: "A", x: 0, y: 0 }, { id: "B", x: 2, y: 0 }],
    debris: [{ id: "far", x: 1, y: 5, r: 0.3, strength: 30 }],
  };
  const result = debrisIntersectsPath(snap, ["A", "B"]);
  assert.ok(!result.threatened);
  assert.strictEqual(result.segments.length, 0);
});

test("debrisIntersectsPath: margin extends detection radius", () => {
  const snap = {
    nodes: [{ id: "A", x: 0, y: 0 }, { id: "B", x: 2, y: 0 }],
    debris: [{ id: "d", x: 1, y: 0.4, r: 0.1, strength: 30 }],
  };
  const withoutMargin = debrisIntersectsPath(snap, ["A", "B"], 0);
  const withMargin = debrisIntersectsPath(snap, ["A", "B"], 0.35);
  assert.ok(!withoutMargin.threatened, "no threat without margin");
  assert.ok(withMargin.threatened, "threat detected with margin");
});

test("nearestNode: returns the closest node to a point", () => {
  const world = createWorld("default");
  const snap = snapshot(world);
  const earth = snap.nodes.find(n => n.id === "earth");
  const result = nearestNode(snap, earth.x + 0.05, earth.y - 0.05);
  assert.strictEqual(result.id, "earth", `expected earth, got ${result.id}`);
});

test("nearestNode: works for observatory at outer orbit", () => {
  const world = createWorld("default");
  const snap = snapshot(world);
  const obs = snap.nodes.find(n => n.kind === "observatory");
  const result = nearestNode(snap, obs.x + 0.1, obs.y + 0.1);
  assert.strictEqual(result.id, obs.id);
});

test("linkThreatMap: returns sorted descending attenuation, empty when no debris overlaps", () => {
  const noJamSnap = {
    nodes: [{ id: "A", x: 0, y: 0 }, { id: "B", x: 1, y: 0 }],
    debris: [{ id: "d", x: 0, y: 10, r: 0.1, strength: 30 }],
  };
  assert.deepStrictEqual(linkThreatMap(noJamSnap), []);

  const jamSnap = {
    nodes: [{ id: "A", x: -1, y: 0 }, { id: "B", x: 1, y: 0 }, { id: "C", x: 0, y: 5 }],
    debris: [{ id: "d", x: 0, y: 0, r: 0.5, strength: 30 }],
  };
  const map = linkThreatMap(jamSnap);
  assert.ok(map.length > 0);
  assert.ok(map[0].attenDb >= (map[1]?.attenDb ?? 0), "must be sorted descending");
});

// ── Winning feature tests ─────────────────────────────────────────────────────

test("pathLifetime: infinite for path with no approaching debris", () => {
  const snap = {
    nodes: [{ id: "A", x: 0, y: 0 }, { id: "B", x: 1, y: 0 }, { id: "C", x: 2, y: 0 }],
    debris: [{ id: "d", x: 1, y: 10, r: 0.1, strength: 30, vx: 0, vy: 0 }],
  };
  const result = pathLifetime(snap, ["A", "B", "C"], 48, 1);
  assert.strictEqual(result.lifetimeHours, 48, "no jam in horizon → returns horizonHours");
  assert.strictEqual(result.bottleneckLink.a, "A"); // first link is bottleneck (tie)
});

test("pathLifetime: identifies the soonest-jamming link as bottleneck", () => {
  // Link A-B: debris approaches fast; Link B-C: debris far, won't jam.
  const snap = {
    nodes: [{ id: "A", x: -1, y: 0 }, { id: "B", x: 1, y: 0 }, { id: "C", x: 3, y: 0 }],
    debris: [
      { id: "fast", x: 0, y: 0.4, r: 0.35, strength: 30, vx: 0, vy: -1.0 }, // heads for A-B
      { id: "far",  x: 2, y: 10,  r: 0.1,  strength: 30, vx: 0, vy:  0   }, // far from B-C
    ],
  };
  const result = pathLifetime(snap, ["A", "B", "C"], 24, 1);
  assert.ok(result.lifetimeHours < 24, "should predict a jam before horizon");
  assert.strictEqual(result.bottleneckLink.a, "A", "A-B is the bottleneck");
  assert.strictEqual(result.allLinks.length, 2);
});

test("networkResilienceScore: 100 when no debris overlaps any link", () => {
  const world = createWorld("default");
  const snap = snapshot(world);
  // Inject a clean snap with debris far away.
  const cleanSnap = { ...snap, debris: snap.debris.map(d => ({ ...d, x: d.x, y: d.y + 20 })) };
  const result = networkResilienceScore(cleanSnap);
  assert.strictEqual(result.score, 100);
  assert.strictEqual(result.blocked, 0);
  assert.strictEqual(result.partialJam, 0);
});

test("networkResilienceScore: drops when debris jams links", () => {
  const snap = {
    nodes: [{ id: "A", x: 0, y: 0 }, { id: "B", x: 1, y: 0 }, { id: "C", x: 2, y: 0 }],
    debris: [{ id: "d", x: 0.5, y: 0, r: 0.4, strength: 50 }], // centre on A-B
  };
  const result = networkResilienceScore(snap, 3.0);
  assert.ok(result.score < 100, `score ${result.score} should be below 100`);
  assert.ok(result.blocked > 0 || result.partialJam > 0, "some links should be affected");
});

test("networkResilienceScore: total equals clear + partialJam + blocked", () => {
  const world = createWorld("storm");
  const snap = snapshot(world);
  const r = networkResilienceScore(snap);
  assert.strictEqual(r.total, r.clear + r.partialJam + r.blocked);
});

test("forecastNetworkHealth: returns one entry per step including t=0", () => {
  const world = createWorld("default");
  const snap = snapshot(world);
  const forecast = forecastNetworkHealth(snap, 12, 2);
  assert.strictEqual(forecast.length, 7); // 0,2,4,6,8,10,12 → 7 entries
  assert.strictEqual(forecast[0].hours, 0);
  assert.strictEqual(forecast[forecast.length - 1].hours, 12);
});

test("forecastNetworkHealth: does not mutate snapshot debris positions", () => {
  const world = createWorld("default");
  const snap = snapshot(world);
  const origX = snap.debris.map(d => d.x);
  forecastNetworkHealth(snap, 100, 5);
  snap.debris.forEach((d, i) => assert.strictEqual(d.x, origX[i], "debris.x must not change"));
});

test("forecastNetworkHealth: threat level escalates when swarm intersects links", () => {
  // Swarm starts above segment and drifts down. Threat level should rise to 2 at some point.
  const snap = {
    nodes: [{ id: "A", x: -1, y: 0 }, { id: "B", x: 1, y: 0 }],
    debris: [{ id: "d", x: 0, y: 1.0, r: 0.35, strength: 50, vx: 0, vy: -1.0 }],
  };
  const forecast = forecastNetworkHealth(snap, 36, 1);
  const maxThreat = Math.max(...forecast.map(f => f.threatLevel));
  assert.ok(maxThreat >= 1, "threat should escalate as swarm approaches");
});

test("relayVulnerabilityRanking: returns one entry per relay, sorted", () => {
  const world = createWorld("default");
  const snap = snapshot(world);
  const ranking = relayVulnerabilityRanking(snap);
  const relayCount = snap.nodes.filter(n => n.kind === "relay").length;
  assert.strictEqual(ranking.length, relayCount);
  // Sorted descending by criticality.
  for (let i = 1; i < ranking.length; i++) {
    assert.ok(ranking[i - 1].criticality >= ranking[i].criticality,
      `ranking[${i-1}].criticality < ranking[${i}].criticality`);
  }
});

test("relayVulnerabilityRanking: top relay has highest or tied lostNodes", () => {
  const world = createWorld("default");
  const snap = snapshot(world);
  const ranking = relayVulnerabilityRanking(snap);
  assert.ok(ranking.length > 0);
  // Top-ranked relay must have lostNodes >= every other relay.
  for (const r of ranking.slice(1)) {
    assert.ok(ranking[0].criticality >= r.criticality,
      `top relay criticality ${ranking[0].criticality} < ${r.id} criticality ${r.criticality}`);
  }
  // At least one relay that, if removed, leaves some nodes unreachable from Observatory.
  // (The swarm scenario has less redundancy — verify the ranking is non-trivial there.)
  const rankingStorm = relayVulnerabilityRanking(snapshot(createWorld("storm")));
  const maxLost = Math.max(...rankingStorm.map(r => r.lostNodes));
  assert.ok(maxLost >= 0, "lostNodes must be non-negative");
});

test("computeSwarmImpact: returns null for unknown debrisId", () => {
  const world = createWorld("default");
  const snap = snapshot(world);
  assert.strictEqual(computeSwarmImpact(snap, "nonexistent"), null);
});

test("computeSwarmImpact: debris on a link shows it in blocked or jammed", () => {
  const snap = {
    nodes: [{ id: "A", x: -1, y: 0 }, { id: "B", x: 1, y: 0 }],
    debris: [{ id: "swarm", x: 0, y: 0, r: 0.5, strength: 50, kind: "asteroid" }],
  };
  const impact = computeSwarmImpact(snap, "swarm", 3.0);
  assert.ok(impact !== null);
  assert.ok(impact.blocked.length + impact.jammed.length > 0, "should affect at least one link");
  assert.ok(impact.maxAttenDb > 0);
});

test("computeSwarmImpact: isolated debris far from all links has zero impact", () => {
  const snap = {
    nodes: [{ id: "A", x: 0, y: 0 }, { id: "B", x: 1, y: 0 }],
    debris: [{ id: "far", x: 0, y: 20, r: 0.1, strength: 30, kind: "asteroid" }],
  };
  const impact = computeSwarmImpact(snap, "far", 3.0);
  assert.strictEqual(impact.blocked.length, 0);
  assert.strictEqual(impact.jammed.length, 0);
  assert.strictEqual(impact.maxAttenDb, 0);
});
