#!/usr/bin/env node
// Headless validation: delivery stats, network resilience, forecasting, BLS.
// Writes results/validation.csv.
import {
  createWorld, step, snapshot, attenuationDb,
  predictJam, debrisIntersectsPath,
  pathLifetime, networkResilienceScore, forecastNetworkHealth,
  relayVulnerabilityRanking, computeSwarmImpact,
} from "../web/js/sim.js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");

// --- Router stub until router.js is on main ---
let bestPath, buildLinks;
try {
  ({ bestPath, buildLinks } = await import("../web/js/router.js"));
} catch {
  buildLinks = () => [];
  bestPath = () => null;
}

// --- BLS detect stub until detect.js is on main ---
let bls;
try {
  ({ bls } = await import("../web/js/detect.js"));
} catch {
  bls = () => ({ best: null });
}

const hr = (n) => `${n.toFixed(1)}h`;
const pct = (n, d) => `${((n / d) * 100).toFixed(1)}%`;

// ── 1. Delivery stats: proactive / reactive / fixed ──────────────────────────
async function deliveryStats(scenario, steps) {
  const SIM_DT = 1;
  const PREDICT_HORIZON = 6;
  const world = createWorld(scenario);
  let snap = snapshot(world);
  const srcId = snap.nodes.find(n => n.kind === "observatory")?.id;
  const dstId = snap.nodes.find(n => n.kind === "earth")?.id;

  const linksT0 = buildLinks(snap, (s, a, b) => attenuationDb(s, a, b));
  const fixedRoute = bestPath(linksT0, srcId, dstId);

  let deliveredReactive = 0, deliveredProactive = 0, deliveredFixed = 0;
  let proactiveRoute = fixedRoute;

  for (let i = 0; i < steps; i++) {
    step(world, SIM_DT);
    snap = snapshot(world);
    const links = buildLinks(snap, (s, a, b) => attenuationDb(s, a, b));

    const live = bestPath(links, srcId, dstId);
    if (live) deliveredReactive++;

    if (fixedRoute) {
      const ok = fixedRoute.nodes.every((nid, idx) => {
        if (!idx) return true;
        const lnk = links.find(l => (l.a === fixedRoute.nodes[idx-1] && l.b === nid) || (l.a === nid && l.b === fixedRoute.nodes[idx-1]));
        return lnk && !lnk.blocked;
      });
      if (ok) deliveredFixed++;
    }

    if (proactiveRoute) {
      const threat = debrisIntersectsPath(snap, proactiveRoute.nodes);
      if (threat.threatened) {
        for (const seg of threat.segments) {
          if (predictJam(snap, seg.a, seg.b, PREDICT_HORIZON, 1).willJam) {
            proactiveRoute = bestPath(links, srcId, dstId, "reliable") ?? proactiveRoute; break;
          }
        }
      }
      const ok = proactiveRoute.nodes.every((nid, idx) => {
        if (!idx) return true;
        const lnk = links.find(l => (l.a === proactiveRoute.nodes[idx-1] && l.b === nid) || (l.a === nid && l.b === proactiveRoute.nodes[idx-1]));
        return lnk && !lnk.blocked;
      });
      if (ok) deliveredProactive++;
      else proactiveRoute = bestPath(links, srcId, dstId) ?? proactiveRoute;
    }
  }
  return { scenario, steps, deliveredReactive, deliveredProactive, deliveredFixed };
}

// ── 2. Network resilience snapshot ───────────────────────────────────────────
function resilienceReport(scenario) {
  const world = createWorld(scenario);
  const snap0 = snapshot(world);
  const r0 = networkResilienceScore(snap0);
  for (let i = 0; i < 200; i++) step(world, 1);
  const snapMid = snapshot(world);
  const rMid = networkResilienceScore(snapMid);
  return { scenario, scoreAtStart: r0.score, scoreAtPeak: rMid.score,
    linksAtStart: r0.total, blockedAtPeak: rMid.blocked };
}

// ── 3. Path lifetime ─────────────────────────────────────────────────────────
function pathLifetimeReport(scenario) {
  const world = createWorld(scenario);
  const snap = snapshot(world);
  const srcId = snap.nodes.find(n => n.kind === "observatory")?.id;
  const dstId = snap.nodes.find(n => n.kind === "earth")?.id;
  const links = buildLinks(snap, (s, a, b) => attenuationDb(s, a, b));
  const best = bestPath(links, srcId, dstId);
  if (!best) return { scenario, pathNodes: null, lifetimeHours: null };
  const lt = pathLifetime(snap, best.nodes, 48, 1);
  return { scenario, pathNodes: best.nodes.join(" → "), lifetimeHours: lt.lifetimeHours,
    bottleneck: lt.bottleneckLink ? `${lt.bottleneckLink.a}–${lt.bottleneckLink.b}` : "none" };
}

// ── 4. Relay vulnerability ───────────────────────────────────────────────────
function vulnerabilityReport(scenario) {
  const world = createWorld(scenario);
  const snap = snapshot(world);
  return relayVulnerabilityRanking(snap).slice(0, 3).map((r, i) =>
    ({ rank: i + 1, relay: r.id, criticality: r.criticality, disconnectsEarth: r.disconnectsEarth })
  );
}

// ── 5. Swarm impact ──────────────────────────────────────────────────────────
function swarmImpactReport(scenario) {
  const world = createWorld(scenario);
  const snap = snapshot(world);
  return snap.debris.map(d => {
    const impact = computeSwarmImpact(snap, d.id);
    return { debrisId: d.id, kind: d.kind, blocked: impact.blocked.length,
      jammed: impact.jammed.length, maxAttenDb: impact.maxAttenDb };
  });
}

// ── 6. Network forecast ──────────────────────────────────────────────────────
function forecastReport(scenario) {
  const world = createWorld(scenario);
  for (let i = 0; i < 50; i++) step(world, 1);
  const snap = snapshot(world);
  const forecast = forecastNetworkHealth(snap, 24, 2);
  const maxThreat = Math.max(...forecast.map(f => f.threatLevel));
  const firstBlock = forecast.find(f => f.linksBlocked > 0);
  const clearHours = forecast.filter(f => f.threatLevel === 0).length * 2;
  return { scenario, maxThreat, firstBlockHours: firstBlock?.hours ?? ">24", clearHours };
}

// ── 7. BLS ───────────────────────────────────────────────────────────────────
async function blsStats() {
  const indexPath = join(ROOT, "web", "data", "index.json");
  if (!existsSync(indexPath)) return [];
  const index = JSON.parse(await readFile(indexPath, "utf8"));
  const rows = [];
  for (const entry of index) {
    const dataPath = join(ROOT, "web", "data", `${entry.slug}.json`);
    if (!existsSync(dataPath)) { rows.push({ ...entry, status: "miss", note: "file missing" }); continue; }
    const { time, flux } = JSON.parse(await readFile(dataPath, "utf8"));
    let result = { best: null };
    try { result = bls(time, flux); } catch {}
    if (!result.best) {
      rows.push({ slug: entry.slug, target: entry.target, publishedPeriod: entry.publishedPeriod,
        recoveredPeriod: "N/A", status: "miss", note: "no signal" });
      continue;
    }
    const p = result.best.period, pub = entry.publishedPeriod, tol = 0.01;
    let status = "miss", note = `${p.toFixed(5)} vs ${pub}`;
    if (Math.abs(p - pub) / pub <= tol) { status = "exact"; note = "within 1%"; }
    for (const h of [0.5, 2, 3]) {
      if (Math.abs(p - pub * h) / (pub * h) <= tol) { status = "harmonic"; note = `${h}x harmonic`; break; }
    }
    rows.push({ slug: entry.slug, target: entry.target, publishedPeriod: pub,
      recoveredPeriod: p, status, note });
  }
  return rows;
}

// ── Run all ──────────────────────────────────────────────────────────────────
const STEPS = 500;
console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║              AstroRoute · Validation Report                 ║");
console.log("╚══════════════════════════════════════════════════════════════╝\n");

const [sd, ss] = await Promise.all([deliveryStats("default", STEPS), deliveryStats("storm", STEPS)]);
console.log("── 1. Delivery (proactive / reactive / fixed) ──────────────────");
for (const s of [sd, ss]) {
  console.log(`  ${s.scenario.padEnd(10)}  proactive ${pct(s.deliveredProactive, s.steps)}  reactive ${pct(s.deliveredReactive, s.steps)}  fixed ${pct(s.deliveredFixed, s.steps)}`);
}
console.log(`\nDelivered with rerouting ${pct(sd.deliveredReactive, sd.steps)} vs fixed route ${pct(sd.deliveredFixed, sd.steps)} (scenario default)`);

console.log("\n── 2. Network resilience score (0–100) ─────────────────────────");
for (const sc of ["default", "storm"]) {
  const r = resilienceReport(sc);
  console.log(`  ${sc.padEnd(10)}  start: ${r.scoreAtStart}/100  peak-swarm: ${r.scoreAtPeak}/100  links: ${r.linksAtStart}  blocked-at-peak: ${r.blockedAtPeak}`);
}

console.log("\n── 3. Path lifetime (hours until first link jams) ──────────────");
for (const sc of ["default", "storm"]) {
  const r = pathLifetimeReport(sc);
  if (r.lifetimeHours !== null)
    console.log(`  ${sc.padEnd(10)}  ${r.pathNodes}  →  lifetime ${hr(r.lifetimeHours)}  bottleneck: ${r.bottleneck}`);
}

console.log("\n── 4. Relay vulnerability ranking (top 3) ──────────────────────");
for (const r of vulnerabilityReport("default"))
  console.log(`  #${r.rank} ${r.relay.padEnd(16)}  criticality ${r.criticality}  disconnects-earth: ${r.disconnectsEarth}`);

console.log("\n── 5. Swarm impact at t=0 ──────────────────────────────────────");
for (const sc of ["default", "storm"]) {
  for (const imp of swarmImpactReport(sc))
    console.log(`  ${sc}/${imp.debrisId.padEnd(12)}  blocks ${imp.blocked} links  jams ${imp.jammed} links  max ${imp.maxAttenDb.toFixed(1)} dB`);
}

console.log("\n── 6. 24-hour threat forecast ──────────────────────────────────");
for (const sc of ["default", "storm"]) {
  const f = forecastReport(sc);
  console.log(`  ${sc.padEnd(10)}  first-block: ${typeof f.firstBlockHours === "number" ? hr(f.firstBlockHours) : f.firstBlockHours}  clear-hours: ${f.clearHours}h  max-threat: ${f.maxThreat}`);
}

console.log("\n── 7. BLS period recovery ──────────────────────────────────────");
const blsRows = await blsStats();
let blsA = 0;
for (const r of blsRows) {
  if (r.status === "exact" || r.status === "harmonic") { blsA++; console.log(`  ✓ ${r.target.padEnd(18)}  ${r.note}`); }
  else console.log(`  ✗ ${r.target.padEnd(18)}  MISS — ${r.note}`);
}
console.log(`\nBLS recovered ${blsA}/${blsRows.length} periods`);

// Write CSV.
const resultsDir = join(ROOT, "results");
await mkdir(resultsDir, { recursive: true });
const csv = [
  "type,scenario,metric,value",
  `delivery,default,proactive_percent,${pct(sd.deliveredProactive, sd.steps)}`,
  `delivery,default,reactive_percent,${pct(sd.deliveredReactive, sd.steps)}`,
  `delivery,default,fixed_percent,${pct(sd.deliveredFixed, sd.steps)}`,
  `delivery,storm,proactive_percent,${pct(ss.deliveredProactive, ss.steps)}`,
  `delivery,storm,reactive_percent,${pct(ss.deliveredReactive, ss.steps)}`,
  `delivery,storm,fixed_percent,${pct(ss.deliveredFixed, ss.steps)}`,
  ...["default","storm"].flatMap(sc => {
    const r = resilienceReport(sc);
    return [`resilience,${sc},score_start,${r.scoreAtStart}`, `resilience,${sc},score_peak_swarm,${r.scoreAtPeak}`];
  }),
  ...["default","storm"].map(sc => {
    const r = pathLifetimeReport(sc);
    return `lifetime,${sc},hours,${r.lifetimeHours?.toFixed(1) ?? "N/A"}`;
  }),
  ...blsRows.map(r => `bls,${r.slug},${r.status},${r.recoveredPeriod ?? "N/A"}`),
];
await writeFile(join(resultsDir, "validation.csv"), csv.join("\n") + "\n", "utf8");
console.log("\nWrote results/validation.csv");
