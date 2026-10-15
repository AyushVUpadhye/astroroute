import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { bls, fold, vet } from "../web/js/detect.js";

function rng(seed) { // mulberry32 + Box-Muller, deterministic
  const u = () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u());
}

// Synthetic light curve: 30-min cadence, box dips; depthFn(epoch) lets odd/even differ.
function synth({ days = 30, period, t0 = 0.7, dur = 0.12, depthFn, noise = 0.002, secondary = 0, seed = 1 }) {
  const g = rng(seed), time = [], flux = [];
  for (let t = 0; t < days; t += 1 / 48) {
    let f = 1 + noise * g();
    if (period) {
      const x = (t - t0) / period, e = Math.round(x), ph = (x - e) * period;
      if (Math.abs(ph) < dur / 2) f -= depthFn(e);
      if (secondary && period / 2 - Math.abs(ph) < dur / 2) f -= secondary;
    }
    time.push(t); flux.push(f);
  }
  return { time, flux };
}

test("planet: recovers the period and says PLANET CANDIDATE", () => {
  const { time, flux } = synth({ period: 2.5, depthFn: () => 0.01 });
  const { best } = bls(time, flux);
  assert.ok(Math.abs(best.period / 2.5 - 1) < 0.01, `found ${best.period}`);
  assert.equal(vet(time, flux, best).verdict, "PLANET CANDIDATE");
});

test("eclipsing binary (unequal eclipses) -> LIKELY FALSE POSITIVE", () => {
  // primary 2%, secondary 1% half an orbit later: BLS tends to lock onto half the true period
  const { time, flux } = synth({ period: 3.6, depthFn: () => 0.02, secondary: 0.01, seed: 2 });
  const { best } = bls(time, flux);
  assert.equal(vet(time, flux, best).verdict, "LIKELY FALSE POSITIVE");
});

test("pure noise -> no planet", () => {
  const { time, flux } = synth({ period: 0, seed: 3 });
  const { best } = bls(time, flux);
  assert.notEqual(vet(time, flux, best).verdict, "PLANET CANDIDATE");
});

test("partial data never throws and asks for more data", () => {
  const { time, flux } = synth({ days: 1.2, period: 2.5, depthFn: () => 0.01 });
  assert.equal(vet(time, flux, bls(time, flux).best).verdict, "NEED MORE DATA");
  assert.equal(bls([], []).best, null);
  assert.deepEqual(fold([1, 2], [1, 1], 2, 0).flux, [1, 1]);
});

test("real NASA light curves: period recovery and verdicts", () => {
  const dir = new URL("../web/data/", import.meta.url);
  let exact = 0, total = 0;
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "index.json")) {
    const d = JSON.parse(readFileSync(new URL(f, dir)));
    const t = performance.now();
    const { best } = bls(d.time, d.flux);
    const ms = performance.now() - t;
    const v = vet(d.time, d.flux, best);
    const r = best.period / d.publishedPeriod;
    const ok = Math.abs(r - 1) < 0.01;
    total++; if (ok) exact++;
    console.log(`${d.target.padEnd(13)} ${d.kind.padEnd(15)} found ${best.period.toFixed(4)} NASA ${d.publishedPeriod.toFixed(4)} ${ok ? "exact" : "x" + r.toFixed(2)}  SNR ${best.snr.toFixed(0).padStart(4)}  ${v.verdict}  ${ms.toFixed(0)} ms`);
    assert.ok(ms < 3000, "BLS must finish within 3 s");
  }
  console.log(`BLS recovered ${exact}/${total} NASA periods within 1%`);
});
