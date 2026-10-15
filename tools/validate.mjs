#!/usr/bin/env node
// Headless validation: sim delivery stats (reactive vs proactive vs fixed) + BLS period recovery.
// Writes results/validation.csv.
import { createWorld, step, snapshot, attenuationDb, predictJam, debrisIntersectsPath } from "../web/js/sim.js";
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

// ---- Sim delivery stats ----
// Measures three strategies over STEPS sim steps:
//   reactive  — bestPath recomputed every step (live rerouting)
//   proactive — switch away from a link before it jams (predictJam look-ahead)
//   fixed     — route locked at t=0
async function deliveryStats(scenario, steps) {
  const SIM_DT = 1; // hours per step
  const PREDICT_HORIZON = 6; // hours to look ahead for proactive strategy

  const world = createWorld(scenario);
  let snap = snapshot(world);

  const srcId = snap.nodes.find(n => n.kind === "observatory")?.id;
  const dstId = snap.nodes.find(n => n.kind === "earth")?.id;

  // Fixed route: locked at t=0.
  const linksT0 = buildLinks(snap, (s, a, b) => attenuationDb(s, a, b));
  const fixedRoute = bestPath(linksT0, srcId, dstId);

  let deliveredReactive = 0, deliveredProactive = 0, deliveredFixed = 0;
  let proactiveRoute = fixedRoute; // proactive starts with t=0 route, switches ahead of jams
  let reactiveRerouteLag = 0, reactiveDropSteps = 0;
  let prevReactiveHadPath = true;

  for (let i = 0; i < steps; i++) {
    step(world, SIM_DT);
    snap = snapshot(world);

    const links = buildLinks(snap, (s, a, b) => attenuationDb(s, a, b));

    // ── Reactive: best path each step.
    const live = bestPath(links, srcId, dstId);
    if (live) {
      deliveredReactive++;
      if (!prevReactiveHadPath) reactiveRerouteLag++; // step where path came back
    } else {
      reactiveDropSteps++;
    }
    prevReactiveHadPath = !!live;

    // ── Fixed: check all links in the fixed route are still open.
    if (fixedRoute) {
      const fixedOk = fixedRoute.nodes.length >= 2 && fixedRoute.nodes.every((nid, idx) => {
        if (idx === 0) return true;
        const a = fixedRoute.nodes[idx - 1], b = nid;
        const lnk = links.find(l => (l.a === a && l.b === b) || (l.a === b && l.b === a));
        return lnk && !lnk.blocked;
      });
      if (fixedOk) deliveredFixed++;
    }

    // ── Proactive: use predictJam to switch before links jam.
    // Check if current proactive route is threatened within the look-ahead window.
    if (proactiveRoute) {
      const threat = debrisIntersectsPath(snap, proactiveRoute.nodes);
      let needsSwitch = false;
      if (threat.threatened) {
        // Check each threatened segment for imminent jamming.
        for (const seg of threat.segments) {
          const pred = predictJam(snap, seg.a, seg.b, PREDICT_HORIZON, 1);
          if (pred.willJam) { needsSwitch = true; break; }
        }
      }
      if (needsSwitch) {
        // Pre-emptively find the best alternate path that avoids the threatened links.
        proactiveRoute = bestPath(links, srcId, dstId, "reliable") ?? proactiveRoute;
      }
      // Deliver if the proactive route is actually open this step.
      const proactiveOk = proactiveRoute.nodes.length >= 2 && proactiveRoute.nodes.every((nid, idx) => {
        if (idx === 0) return true;
        const a = proactiveRoute.nodes[idx - 1], b = nid;
        const lnk = links.find(l => (l.a === a && l.b === b) || (l.a === b && l.b === a));
        return lnk && !lnk.blocked;
      });
      if (proactiveOk) deliveredProactive++;
      else proactiveRoute = bestPath(links, srcId, dstId) ?? proactiveRoute; // emergency fallback
    }
  }

  const pct = n => ((n / steps) * 100).toFixed(1);
  return {
    scenario, steps,
    deliveredReactive, deliveredProactive, deliveredFixed,
    reactivePercent: pct(deliveredReactive),
    proactivePercent: pct(deliveredProactive),
    fixedPercent: pct(deliveredFixed),
    dropSteps: reactiveDropSteps,
  };
}

// ---- BLS period recovery ----
async function blsStats() {
  const indexPath = join(ROOT, "web", "data", "index.json");
  if (!existsSync(indexPath)) return [];

  const index = JSON.parse(await readFile(indexPath, "utf8"));
  const rows = [];

  for (const entry of index) {
    const dataPath = join(ROOT, "web", "data", `${entry.slug}.json`);
    if (!existsSync(dataPath)) {
      rows.push({ ...entry, recovered: "miss", note: "file missing" }); continue;
    }

    const data = JSON.parse(await readFile(dataPath, "utf8"));
    const { time, flux } = data;
    const publishedPeriod = entry.publishedPeriod;

    let result = { best: null };
    try { result = bls(time, flux); } catch { /* stub throws */ }

    if (!result.best) {
      rows.push({ slug: entry.slug, target: entry.target, publishedPeriod,
        recoveredPeriod: "N/A", status: "miss", note: "no signal (stub or data)" });
      continue;
    }

    const p = result.best.period;
    const tol = 0.01;
    let status = "miss", note = "";

    if (Math.abs(p - publishedPeriod) / publishedPeriod <= tol) {
      status = "exact"; note = `within 1% (${p.toFixed(5)} vs ${publishedPeriod})`;
    }
    for (const h of [0.5, 2, 3]) {
      const harmonic = publishedPeriod * h;
      if (Math.abs(p - harmonic) / harmonic <= tol) {
        status = "harmonic"; note = `harmonic ${h}x (${p.toFixed(5)} vs ${harmonic.toFixed(5)})`; break;
      }
    }
    if (status === "miss") note = `recovered ${p.toFixed(5)}, published ${publishedPeriod}`;

    rows.push({ slug: entry.slug, target: entry.target, publishedPeriod,
      recoveredPeriod: p, status, note });
  }
  return rows;
}

// ---- Main ----
const STEPS = 500;

const [statsDefault, statsStorm] = await Promise.all([
  deliveryStats("default", STEPS),
  deliveryStats("storm", STEPS),
]);

const pad = (s, n) => String(s).padStart(n);

console.log("\n── Delivery stats ──────────────────────────────────────────────");
console.log(`${"Scenario".padEnd(10)} ${"Proactive".padStart(10)} ${"Reactive".padStart(10)} ${"Fixed".padStart(10)} ${"Drops".padStart(8)}`);
for (const s of [statsDefault, statsStorm]) {
  console.log(
    `${s.scenario.padEnd(10)} ${pad(s.proactivePercent + "%", 10)} ${pad(s.reactivePercent + "%", 10)} ${pad(s.fixedPercent + "%", 10)} ${pad(s.dropSteps, 8)}`
  );
}
console.log(`\nDelivered with rerouting ${statsDefault.reactivePercent}% vs fixed route ${statsDefault.fixedPercent}% (scenario default)`);
console.log(`Delivered with rerouting ${statsStorm.reactivePercent}% vs fixed route ${statsStorm.fixedPercent}% (scenario storm)`);

const blsRows = await blsStats();
let blsA = 0;
for (const r of blsRows) {
  if (r.status === "exact" || r.status === "harmonic") blsA++;
  else console.log(`  MISS: ${r.target} — ${r.note}`);
}
if (blsRows.length > 0) console.log(`\nBLS recovered ${blsA}/${blsRows.length} periods`);

// Write CSV.
const resultsDir = join(ROOT, "results");
await mkdir(resultsDir, { recursive: true });

const csvRows = [
  "type,scenario,metric,value",
  `delivery,default,proactive_percent,${statsDefault.proactivePercent}`,
  `delivery,default,reactive_percent,${statsDefault.reactivePercent}`,
  `delivery,default,fixed_percent,${statsDefault.fixedPercent}`,
  `delivery,default,drop_steps,${statsDefault.dropSteps}`,
  `delivery,storm,proactive_percent,${statsStorm.proactivePercent}`,
  `delivery,storm,reactive_percent,${statsStorm.reactivePercent}`,
  `delivery,storm,fixed_percent,${statsStorm.fixedPercent}`,
  `delivery,storm,drop_steps,${statsStorm.dropSteps}`,
  ...blsRows.map(r =>
    `bls,${r.slug ?? ""},${r.status ?? "miss"},${r.recoveredPeriod ?? "N/A"}`
  ),
];
await writeFile(join(resultsDir, "validation.csv"), csvRows.join("\n") + "\n", "utf8");
console.log("\nWrote results/validation.csv");
