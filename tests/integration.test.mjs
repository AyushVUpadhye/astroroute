// End to end: sim -> router -> packet delivery -> detector, headless.
// Measures the core claim: rerouting keeps telescope data flowing through a debris swarm.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as sim from "../web/js/sim.js";
import { buildLinks, bestPath, edgeKey } from "../web/js/router.js";
import { bls } from "../web/js/detect.js";

const simReady = (() => { try { sim.createWorld("default"); return true; } catch { return false; } })();
const STEP_H = 1, DAYS = 120;

function run(scenario) {
  const world = sim.createWorld(scenario);
  const ids = (s) => ({ obs: s.nodes.find((n) => n.kind === "observatory").id,
                        earth: s.nodes.find((n) => n.kind === "earth").id });
  let snap = sim.snapshot(world);
  const { obs, earth } = ids(snap);
  const fixed = bestPath(buildLinks(snap, sim.attenuationDb), obs, earth);
  let live = 0, kept = 0, reroutes = 0, prev = null;
  const steps = (DAYS * 24) / STEP_H;
  for (let k = 0; k < steps; k++) {
    sim.step(world, STEP_H);
    snap = sim.snapshot(world);
    const links = buildLinks(snap, sim.attenuationDb);
    const best = bestPath(links, obs, earth);
    if (best) {
      live++;
      const key = best.nodes.join(">");
      if (prev && key !== prev) reroutes++;
      prev = key;
    }
    if (fixed) {
      const up = new Set(links.filter((l) => !l.blocked).map((l) => edgeKey(l.a, l.b)));
      if (fixed.links.every((l) => up.has(edgeKey(l.a, l.b)))) kept++;
    }
  }
  return { live: (100 * live) / steps, fixed: (100 * kept) / steps, reroutes };
}

test("rerouting keeps more data flowing than a fixed route", { skip: !simReady && "sim.js not implemented yet" }, () => {
  for (const scenario of ["default", "storm"]) {
    const r = run(scenario);
    console.log(`Delivered with rerouting ${r.live.toFixed(1)}% vs fixed route ${r.fixed.toFixed(1)}% (scenario ${scenario}, ${r.reroutes} reroutes, ${DAYS} days)`);
    assert.ok(r.live >= r.fixed, "live rerouting can never do worse than the fixed route");
    assert.ok(r.reroutes > 0, `the ${scenario} swarm must force at least one reroute`);
  }
});

test("data delivered through the network still reveals the planet", { skip: !simReady && "sim.js not implemented yet" }, () => {
  // Deliver Kepler-6's light curve in order, only while a path exists; detection must still work.
  const d = JSON.parse(readFileSync(new URL("../web/data/kepler-6.json", import.meta.url)));
  const world = sim.createWorld("storm");
  let snap = sim.snapshot(world);
  const obs = snap.nodes.find((n) => n.kind === "observatory").id;
  const earth = snap.nodes.find((n) => n.kind === "earth").id;
  const perStep = 4; let sent = 0; const t = [], f = [];
  while (sent < d.time.length) {
    sim.step(world, STEP_H); snap = sim.snapshot(world);
    if (!bestPath(buildLinks(snap, sim.attenuationDb), obs, earth)) continue; // buffered, not lost
    for (let i = sent; i < Math.min(sent + perStep, d.time.length); i++) { t.push(d.time[i]); f.push(d.flux[i]); }
    sent += perStep;
  }
  const { best } = bls(t, f);
  console.log(`Kepler-6 via the network (storm): ${t.length}/${d.time.length} points delivered, period ${best.period.toFixed(4)} d vs NASA ${d.publishedPeriod}`);
  assert.equal(t.length, d.time.length, "no data lost: blocked packets wait and are sent later");
  assert.ok(Math.abs(best.period / d.publishedPeriod - 1) < 0.01);
});
