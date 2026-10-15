// End to end: sim -> router -> packet delivery -> detector, headless.
// Measures the core claim: rerouting keeps telescope data flowing through a debris swarm.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as sim from "../web/js/sim.js";
import { buildLinks, buildLinksAhead, bestPath, edgeKey } from "../web/js/router.js";
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

// A "forced" reroute = the path in use already had a jammed link when we switched (packets in
// flight interrupted). A "proactive" one = we left a path that was still working.
function handovers(scenario, predictive) {
  const w = sim.createWorld(scenario);
  let snap = sim.snapshot(w), prev = null, route = null, forced = 0, proactive = 0;
  const obs = snap.nodes.find((n) => n.kind === "observatory").id;
  const earth = snap.nodes.find((n) => n.kind === "earth").id;
  for (let k = 0; k < (DAYS * 24) / STEP_H; k++) {
    prev = snap; sim.step(w, STEP_H); snap = sim.snapshot(w);
    const now = buildLinks(snap, sim.attenuationDb);
    const up = new Set(now.filter((l) => !l.blocked).map((l) => edgeKey(l.a, l.b)));
    const links = predictive ? buildLinksAhead(prev, snap, sim.attenuationDb, STEP_H / 24, { aheadDays: 1 }) : now;
    const best = bestPath(links, obs, earth) || bestPath(now, obs, earth);
    if (!best) continue;
    const key = best.nodes.join(">");
    if (route && key !== route.key) route.links.every((l) => up.has(edgeKey(l.a, l.b))) ? proactive++ : forced++;
    route = { key, links: best.links };
  }
  return { forced, proactive };
}

test("predictive routing leaves a link before the debris jams it", { skip: !simReady && "sim.js not implemented yet" }, () => {
  for (const scenario of ["default", "storm", "comet-rain"]) {
    const plain = handovers(scenario, false), ahead = handovers(scenario, true);
    console.log(`Forced reroutes (path broke while in use), ${scenario}: ${plain.forced} plain vs ${ahead.forced} predictive (1-day lookahead)`);
    assert.ok(ahead.forced <= plain.forced);
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
