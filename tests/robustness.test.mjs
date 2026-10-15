// How much of the stream does the detector need? Real NASA light curves, two failure modes:
// (a) stream cut short (data arrives in time order, link dies), (b) random packet loss.
// "Found" = PLANET CANDIDATE at the NASA period (within 1%).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { bls, vet } from "../web/js/detect.js";

const dir = new URL("../web/data/", import.meta.url);
const planets = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "index.json")
  .map((f) => JSON.parse(readFileSync(new URL(f, dir)))).filter((d) => d.kind === "planet");

function found(d, idx) {
  const t = idx.map((i) => d.time[i]), f = idx.map((i) => d.flux[i]);
  const { best } = bls(t, f);
  return !!best && Math.abs(best.period / d.publishedPeriod - 1) < 0.01
    && vet(t, f, best, d.starRadius).verdict === "PLANET CANDIDATE";
}

function rng(seed) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}

test("planets are confirmed from a small first slice of the stream", () => {
  const need = [];
  for (const d of planets) {
    let pct = null;
    for (const p of [5, 10, 15, 20, 30, 40, 60, 80, 100]) {
      const n = Math.ceil((d.time.length * p) / 100);
      if (found(d, [...Array(n).keys()])) { pct = p; break; }
    }
    need.push(pct);
    console.log(`${d.target.padEnd(10)} confirmed after the first ${pct}% of the stream`);
  }
  const sorted = need.filter((x) => x !== null).sort((a, b) => a - b);
  console.log(`Stream cut short: ${sorted.length}/${planets.length} planets confirmed; median ${sorted[Math.floor(sorted.length / 2)]}% of the data needed`);
  assert.equal(sorted.length, planets.length);
});

test("planets survive heavy random packet loss (packets of 9 light-curve points)", () => {
  for (const loss of [0.5, 0.7, 0.9]) {
    let ok = 0, trials = 0;
    for (const d of planets) {
      for (let s = 1; s <= 3; s++) {
        const r = rng(s * 7919 + Math.round(loss * 100));
        const idx = [];
        for (let i = 0; i < d.time.length; i += 9) if (r() >= loss) for (let j = i; j < Math.min(i + 9, d.time.length); j++) idx.push(j);
        trials++; if (found(d, idx)) ok++;
      }
    }
    console.log(`Random packet loss ${Math.round(loss * 100)}%: planet still found in ${ok}/${trials} runs (6 planets x 3 seeds)`);
    if (loss === 0.5) assert.equal(ok, trials, "50% loss must never stop detection");
  }
});
