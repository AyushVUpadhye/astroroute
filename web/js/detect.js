// Transit search + vetting, written from scratch (no library, no trained model).
// BLS: Kovacs, Zucker & Mazeh (2002) "A box-fitting algorithm in the search for periodic
//   transits", A&A 391, 369. Signal residue on mean-subtracted flux: SR = S^2 n / (c (n - c)),
//   S = sum of flux in the box, c = points in the box, n = all points.
// Checks follow the false-positive tests used for Kepler candidates (SNR threshold 7.1,
//   odd/even depth, secondary eclipse) - Thompson et al. (2018) ApJS 235, 38.

const DURATIONS = [0.04, 0.06, 0.09, 0.13, 0.18, 0.25]; // days
const SNR_MIN = 7.1;
// Thresholds tuned on real data, not just synthetic: very clean light curves make tiny
// systematic odd/even or secondary differences "significant", so a check fails only when the
// effect is BOTH significant and large (WASP-18 b, a confirmed planet, shows an 11% / 26 sigma
// odd-even difference from systematics; eclipsing binaries seen at half their period differ
// by tens of %).
const ODD_EVEN_SIGMA = 3, ODD_EVEN_FRAC = 0.2;
const SECONDARY_SIGMA = 5, SECONDARY_FRAC = 0.05; // hot Jupiters can show a few-% secondary
// Size: depth = (Rp/R*)^2, so Rp = R* sqrt(depth). Nothing bigger than ~2 Jupiter radii is a
// planet (the most inflated hot Jupiters reach ~2 R_J). R_sun / R_earth = 695,700 / 6,378.1 km.
const R_SUN_IN_EARTH = 109.1, MAX_PLANET_EARTH_RADII = 22.4;
// Brightness: a planet seen at phase 0.5 can at most hide the light it reflects, so a secondary
// dip deeper than (Rp/a)^2 needs a "geometric albedo" above 1 - the companion shines by itself,
// so it is a star (the albedo test of the Kepler Robovetter, Thompson et al. 2018). a/R* from
// Kepler's third law: a = 215.03 R_sun * (M P_yr^2)^(1/3), with M ~ R for main-sequence stars
// (capped at 2 M_sun, which can only make the test more lenient).
const AU_IN_R_SUN = 215.03, MAX_ALBEDO = 1;

const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const std = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, a.length - 1)); };

// Phase in days, centred on the transit: (-P/2, P/2].
const phaseDays = (t, period, t0) => {
  const x = (t - t0) / period;
  return (x - Math.round(x)) * period;
};

export function bls(time, flux, opts = {}) {
  const n = time.length;
  const none = { periods: [], power: [], best: null };
  if (n < 50) return none;
  const span = time[n - 1] - time[0];
  const minP = opts.minPeriod ?? 0.3;
  const maxP = Math.min(opts.maxPeriod ?? 15, span / 2);
  if (!(maxP > minP)) return none;
  const durations = opts.durations ?? DURATIONS;
  const nb = opts.bins ?? 200;

  // Log-uniform period grid: a step of dP/P keeps the transit phase drift over the whole
  // baseline below half the shortest duration (span * dP/P < dmin / 2).
  const rel = Math.min(...durations) / (2 * span);
  const nP = Math.max(500, Math.min(opts.maxPeriods ?? 25000, Math.ceil(Math.log(maxP / minP) / rel)));
  const periods = new Float64Array(nP), power = new Float64Array(nP);

  const tref = time[0];
  const dt = Float64Array.from(time, (t) => t - tref);
  const m = mean(flux);
  const y = Float64Array.from(flux, (v) => v - m);
  const sum = new Float64Array(nb), cnt = new Float64Array(nb);
  let best = null, bestPow = 0;

  for (let k = 0; k < nP; k++) {
    const P = minP * Math.exp((Math.log(maxP / minP) * k) / (nP - 1));
    periods[k] = P;
    sum.fill(0); cnt.fill(0);
    const f = 1 / P;
    for (let i = 0; i < n; i++) {
      const x = dt[i] * f;
      const b = ((x - Math.floor(x)) * nb) | 0;
      sum[b] += y[i]; cnt[b] += 1;
    }
    let pk = 0;
    for (const d of durations) {
      const w = Math.max(1, Math.round((d / P) * nb));
      if (w >= nb / 4) continue; // box must be short compared with the period
      let s = 0, c = 0;
      for (let j = 0; j < w; j++) { s += sum[j]; c += cnt[j]; }
      for (let start = 0; start < nb; start++) {
        if (s < 0 && c >= 3 && c <= n - 3) {
          const pw = (s * s * n) / (c * (n - c));
          if (pw > pk) pk = pw;
          if (pw > bestPow) { bestPow = pw; best = { P, start, w, s, c }; }
        }
        const out = start, inn = (start + w) % nb; // slide the box by one bin (wraps around)
        s += sum[inn] - sum[out]; c += cnt[inn] - cnt[out];
      }
    }
    power[k] = pk;
  }
  if (!best) return { periods: Array.from(periods), power: Array.from(power), best: null };

  const { P, start, w, s, c } = best;
  const duration = (w / nb) * P;
  const t0 = tref + ((start + w / 2) / nb) * P;
  const inTr = [], outTr = [];
  for (let i = 0; i < n; i++) (Math.abs(phaseDays(time[i], P, t0)) < duration / 2 ? inTr : outTr).push(flux[i]);
  const depth = -(s * n) / (c * (n - c));
  const sigma = outTr.length > 1 ? std(outTr) : 0;
  const depthErr = inTr.length && outTr.length ? sigma * Math.sqrt(1 / inTr.length + 1 / outTr.length) : Infinity;
  return {
    periods: Array.from(periods), power: Array.from(power),
    best: { period: P, t0, duration, depth, depthErr, snr: depthErr > 0 ? depth / depthErr : 0 },
  };
}

export function fold(time, flux, period, t0) {
  return { phase: time.map((t) => phaseDays(t, period, t0)), flux: Array.from(flux) };
}

// Depth (out-of-transit mean minus in-window mean) and its significance.
function windowDepth(win, out) {
  if (win.length < 3 || out.length < 3) return { depth: 0, err: Infinity, n: win.length };
  return { depth: mean(out) - mean(win), err: std(out) * Math.sqrt(1 / win.length + 1 / out.length), n: win.length };
}

// starRadius: the host star's radius in solar radii (NASA catalogue), or null -> assume 1.
export function vet(time, flux, best, starRadius = null) {
  if (!best) return { checks: [], verdict: "NEED MORE DATA", radiusEarth: null, radiusAssumed: true };
  const { period: P, t0, duration: D } = best;
  const odd = [], even = [], sec = [], out = [];
  const epochs = new Map(); // epoch -> in-transit fluxes
  for (let i = 0; i < time.length; i++) {
    const ph = phaseDays(time[i], P, t0);
    if (Math.abs(ph) < D / 2) {
      const e = Math.round((time[i] - t0) / P);
      if (!epochs.has(e)) epochs.set(e, []);
      epochs.get(e).push(flux[i]);
      (e % 2 === 0 ? even : odd).push(flux[i]);
    } else if (P / 2 - Math.abs(ph) < D / 2) sec.push(flux[i]);
    else out.push(flux[i]);
  }
  const checks = [];
  const snrOk = best.snr >= SNR_MIN;
  checks.push({ name: "Signal strength", passed: snrOk, value: +best.snr.toFixed(1),
    detail: `Transit is ${best.snr.toFixed(1)}σ above the noise (needs ≥ ${SNR_MIN}, the Kepler mission threshold).` });

  // A transit "counts" only if that epoch really dips by at least half the folded depth,
  // so one dip folded at a fake short period is not mistaken for repeats.
  const mOut = out.length ? mean(out) : 1;
  const nT = [...epochs.values()].filter((f) => mOut - mean(f) > 0.5 * best.depth).length;
  checks.push({ name: "Repeats", passed: nT >= 2, value: nT,
    detail: nT >= 2 ? `${nT} separate transits seen at the same period.` : `Only ${nT} transit received so far - need at least 2.` });

  const o = windowDepth(odd, out), e = windowDepth(even, out);
  // Systematics can make single transits shallower (WASP-18's 2nd and 4th TESS transits are
  // distorted), so the error is also judged from how much transits of the same parity scatter.
  // A real binary still fails: its odd dips are consistently different from its even ones.
  for (const [w, parity] of [[o, 1], [e, 0]]) {
    const deps = [...epochs].filter(([k, f]) => Math.abs(k % 2) === parity && f.length >= 3).map(([, f]) => mOut - mean(f));
    if (deps.length >= 2) w.err = Math.max(w.err, std(deps) / Math.sqrt(deps.length));
  }
  const oeSigma = Math.abs(o.depth - e.depth) / Math.sqrt(o.err ** 2 + e.err ** 2);
  const oeKnown = Number.isFinite(oeSigma);
  const oeFrac = Math.max(o.depth, e.depth) > 0 ? Math.abs(o.depth - e.depth) / Math.max(o.depth, e.depth) : 0;
  const oeOk = !oeKnown || !(oeSigma > ODD_EVEN_SIGMA && oeFrac > ODD_EVEN_FRAC);
  const oePct = 100 * oeFrac;
  checks.push({ name: "Odd vs even", passed: oeOk, value: oeKnown ? +oeSigma.toFixed(1) : null,
    detail: !oeKnown ? "Not enough odd and even transits yet to compare."
      : oeOk ? `Odd and even dips match (${oePct.toFixed(0)}% apart, ${oeSigma.toFixed(1)}σ) - consistent with one planet.`
      : `Odd and even dips differ by ${oePct.toFixed(0)}% (${oeSigma.toFixed(1)}σ) - typical of an eclipsing binary at twice this period.` });

  const s2 = windowDepth(sec, out);
  const secSigma = s2.depth / s2.err;
  const secFrac = best.depth > 0 ? s2.depth / best.depth : 0;
  const secOk = !(secSigma > SECONDARY_SIGMA && secFrac > SECONDARY_FRAC);
  checks.push({ name: "Secondary eclipse", passed: secOk, value: Number.isFinite(secSigma) ? +secSigma.toFixed(1) : null,
    detail: secOk && secSigma > SECONDARY_SIGMA ? `A shallow dip halfway between transits (${(100 * secFrac).toFixed(1)}% of the transit, ${secSigma.toFixed(1)}σ) - small enough for a hot planet's own glow; see Brightness.`
      : secOk ? "No significant dip halfway between transits - the companion is not glowing like a star."
      : `A ${(100 * secFrac).toFixed(0)}%-deep dip appears halfway between transits (${secSigma.toFixed(1)}σ) - the companion is a star.` });

  const radiusAssumed = !(starRadius > 0);
  const radiusEarth = (radiusAssumed ? 1 : starRadius) * Math.sqrt(Math.max(0, best.depth)) * R_SUN_IN_EARTH;
  const sizeOk = radiusEarth <= MAX_PLANET_EARTH_RADII;
  const starTxt = radiusAssumed ? "assuming a Sun-sized star" : `star radius ${starRadius.toFixed(2)} R☉ (NASA)`;
  checks.push({ name: "Size", passed: sizeOk, value: +radiusEarth.toFixed(1),
    detail: sizeOk ? `Companion is ${radiusEarth.toFixed(1)} Earth radii (${starTxt}) - planet-sized.`
      : `Companion is ${radiusEarth.toFixed(1)} Earth radii (${starTxt}) - bigger than any known planet, so it is a star.` });

  // Only judged when the secondary is clearly real; a faint one passes.
  const rStar = radiusAssumed ? 1 : starRadius, mStar = Math.min(rStar, 2);
  const aOverR = (AU_IN_R_SUN * Math.cbrt(mStar * (P / 365.25) ** 2)) / rStar;
  const reflect = Math.max(0, best.depth) / aOverR ** 2; // (Rp/a)^2: the most a planet can reflect
  const secReal = secSigma > SECONDARY_SIGMA && s2.depth > 0;
  const albedo = secReal && reflect > 0 ? s2.depth / reflect : null;
  const brightOk = !(albedo > MAX_ALBEDO);
  checks.push({ name: "Brightness", passed: brightOk, value: albedo === null ? null : +albedo.toFixed(2),
    detail: albedo === null ? "No clear secondary eclipse, so nothing to say about the companion's own light."
      : brightOk ? `The ${(s2.depth * 1e6).toFixed(0)} ppm dip at phase 0.5 means albedo ${albedo.toFixed(2)} - a hot planet reflecting and glowing can do that.`
      : `The ${(s2.depth * 1e6).toFixed(0)} ppm dip at phase 0.5 would need albedo ${albedo.toFixed(1)} (> ${MAX_ALBEDO}): it gives off more light than a planet can reflect, so it is a star.` });

  let verdict = "PLANET CANDIDATE";
  if (nT < 2) verdict = "NEED MORE DATA";
  else if (!snrOk) verdict = "NO CONVINCING SIGNAL"; // too weak to judge its shape
  else if (!oeOk || !secOk || !sizeOk || !brightOk) verdict = "LIKELY FALSE POSITIVE";
  return { checks, verdict, radiusEarth, radiusAssumed };
}
