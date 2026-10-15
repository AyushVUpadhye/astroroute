# Q&A cheat sheet — read before 14:30

Numbers below are printed by `npm test` (measured 15 Oct). Never quote a number that isn't here.

| Measured | Value |
|---|---|
| Router vs brute force (every simple path) | 2000 cases, **0 mismatches** |
| Reroute time (30 nodes: links + best + alternate) | **~0.2 ms** per step |
| Packets delivered, default swarm, 120 days | **100% with rerouting vs 33.1% fixed route** (10 reroutes) |
| Packets delivered, 3-swarm storm, 120 days | **100% vs 20.9%** (11 reroutes) |
| Forced reroutes (path broke while in use), 120 days | **5 → 0** default, **6 → 0** storm, **5 → 0** comet-rain with predictive routing (1-day lookahead) |
| Data volume, max-throughput vs fastest mode, 120 days | **+22.4%** (default), **+31.2%** (storm), for +1.3 / +1.6 min latency |
| Widest path vs brute force | 1000 cases, **0 mismatches** |
| Kepler-6 streamed through the storm | 2093/2093 points arrived, period 3.2361 d (NASA 3.2347 d) |
| Our BLS on 9 real NASA light curves | **9/9 periods within 1%**, 0.1–0.6 s each |
| Verdicts | 6/6 confirmed planets → PLANET CANDIDATE; NASA false positives: 1/2 caught |

## Routing (Chirag)
- **How do you find the best path?** Dijkstra's algorithm with a binary heap, written by us.
  Cost = light-time latency (8.317 light-minutes per AU), or in "reliable" mode latency plus a
  penalty for every dB of signal below a 15 dB comfort margin.
- **What is the alternate path?** The shortest path that shares *no relay* with the best one,
  so one swarm can't take out both. If no fully independent path exists, the cheapest path that
  differs by at least one link (first step of Yen's k-shortest-paths).
- **How do you know it's correct?** Test against brute force: enumerate every simple path on
  1000 random networks × 2 modes → 0 mismatches.
- **What happens when there is no path at all?** Packets wait at the observatory (buffered) and
  go out when a path reopens — nothing is lost. The UI shows "LINK DOWN – buffering".
- **Predictive routing?** We extrapolate every relay and debris cloud one day ahead from the last two
  positions; a link that *will* be jammed is avoided now, so we switch before it fails. Measured:
  forced reroutes 5 → 0 (default), 6 → 0 (storm), 5 → 0 (comet rain).
- **Max-throughput mode?** Each link's capacity comes from Shannon's formula C = B·log2(1+SNR);
  this mode picks the path whose weakest link is strongest (widest path, Pollack 1960). It moves
  22–31% more data than the fastest path for ~1.5 min more delay — the trade-off is the user's choice.
  Absolute Gb depend on our assumed 1 MHz bandwidth, so quote the percentages only.
- **Why "dynamic"?** Positions and debris move every step; links and both paths are recomputed
  every step (0.2 ms), and every change of best path is logged as a reroute event.

## Simulation & link model (Bhumika)
- **How does jamming work?** Each swarm/comet is a disc with a strength in dB. For every link we
  take the closest distance s from the debris centre to the link; inside the disc it adds
  strength × (1 − s/r)² dB of loss. A link is blocked below 6 dB SNR or beyond 2.6 AU.
- **Is this real physics?** Simplified on purpose: 2-D, circular orbits, toy link budget
  (tx power − 1/d² spreading loss − jamming). Say it before they ask. The routing logic is the
  real contribution; a real link budget slots into `buildLinks` without changing the router.

## Detection (Abhijeet / Chirag)
- **What is BLS?** Box Least Squares (Kovács, Zucker & Mazeh 2002): try many periods, fold the
  light curve at each, find the box-shaped dip that best explains the data. We wrote it ourselves.
- **Planet vs false positive?** SNR ≥ 7.1 (Kepler's threshold), ≥ 2 real transits, odd vs even
  dips match, no strong secondary eclipse halfway between transits.
- **Why not machine learning?** The rules ban pre-built models, and we want every verdict to be
  explainable: each check prints the reason in plain English.
- **Weak spot?** We missed one NASA false positive (KIC 6756669) — it passes all four checks in
  this data. Next: transit-shape and stellar-size checks.
- **Thresholds?** Tuned on real data: a confirmed planet (WASP-18 b) showed a small but
  "significant" odd/even difference from systematics, so a check fails only when the effect is
  both significant and large.

## Data
Real Kepler and TESS light curves from NASA MAST, downloaded once with the open-source
`lightkurve` library (data access only — no models), cleaned and stored in `web/data/`.
