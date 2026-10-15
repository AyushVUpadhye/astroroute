# TASK — Abhijeet · detector (`web/js/detect.js`) · issue: Detector · branch `feat/detect`

## Handover status (Chirag is covering this while Abhijeet is away — read this first)
- **DONE (12:23, Chirag, pushed to main):** `web/js/detect.js` — from-scratch BLS (log-uniform
  period grid, 200 phase bins, 6 durations), `fold`, `vet` with 4 checks; `tests/detect.test.mjs`
  (synthetic planet / EB / noise / partial data + all real files). `npm test` → 10/10 green.
- **Measured on the 9 real NASA files:** BLS recovered 9/9 published periods within 1%
  (0.1–0.55 s each). Verdicts: 6/6 confirmed planets → PLANET CANDIDATE; NASA false positives:
  KIC 8801343 caught (secondary eclipse 6%, 9.2σ), **KIC 6756669 missed** (passes all checks);
  TOI-1163.01 → PLANET CANDIDATE.
- **Threshold change, with reason:** odd/even fails only if > 3σ AND > 20% different; secondary
  only if > 5σ AND > 5% of the primary. Reason: WASP-18 b (a confirmed planet) showed an 11%,
  26σ odd/even difference from systematics in very clean TESS data.

- **DONE (12:50, Chirag): Size check.** `vet(time, flux, best, starRadius)` - NASA star radius now in
  every `web/data/*.json`; radius = R* x sqrt(depth) x 109.1, fails above 22.4 Earth radii (2 R_Jup).
  Our radii vs NASA: Kepler-6 14.6/14.62, HAT-P-7 17.2/16.93, WASP-18 13.5/13.90, Kepler-17
  14.1/14.68, WASP-43 9.7/10.42, TrES-2 12.6/15.24 (grazing); KIC 8801343 33.1 -> flagged as a star.
  KIC 6756669 is still missed: NASA radius 0.806 R_sun gives 14.4 Earth radii, so size can't catch it.

- **DONE (Abhijeet): KIC 6756669 caught - new "Brightness" check.** V-shape does NOT separate it
  (inner/outer depth ratio 0.67 vs 0.57-0.89 for the planets; its folded dip is flat-bottomed), so
  no Shape check was added. What does: its secondary eclipse (7σ, phase 0.5) is only 1.4% of the
  transit - under the 5% rule, and HAT-P-7 b (a planet) has 1.3% - but it is 368 ppm deep, while a
  14 Earth-radius body at a/R* = 16 could reflect at most ~110 ppm: geometric albedo 3.4 > 1, so it
  shines by itself (Kepler Robovetter albedo test). Fails only if the secondary is > 5σ AND albedo
  > 1; WASP-18 b's real secondary gives 0.40 and passes. Result: 6/6 planets PLANET CANDIDATE,
  **2/2 NASA false positives caught**. Streamed (10%..100% of each file) it never fires on a planet.
- **DONE: odd/even robust to systematics.** WASP-18's 2nd and 4th TESS transits are distorted
  (half depth, ramped); both odd, so early in the stream WASP-18 b read as a binary until 40% of
  the data. The odd/even error now also uses transit-to-transit scatter within each parity -> correct
  from 30%; TOI-1163.01 from 60% (was 90%). Binaries still fail (their odd dips are consistently
  different). Tests: real-data verdicts now asserted + synthetic "too bright" binary. 52/52 green.

### Original list for Abhijeet (all done)
1. **Catch KIC 6756669** without breaking the 6 planets: try a V-shape check (mean depth in
   the outer half of the box vs the central half: measured 0.67 for KIC 6756669 vs 0.72–0.89
   for planets — too close alone). The size check is done and does not catch it (see above).
   Run `npm test` after every change; the real-data table prints at the end.
2. Add a "Shape" check to `vet()` only if it separates them; otherwise write the miss into
   README "limitations" (tell Bhumika).
3. Be ready to explain BLS + the checks in Q&A (see comments at the top of detect.js).

## For you
Debugger Gauntlet (no AI): when called — commit, push, merge, tell Chirag, go.
Clone, open Claude Code in the repo, type: *"Read docs/tasks/TASK_ABHIJEET.md and do 'For the AI'."*
Q&A you answer: how BLS works, how we tell a planet from an eclipsing binary.

## For the AI
```text
Read docs/PLAN.md ("Interfaces", "Git flow") first. Branch feat/detect. You own
web/js/detect.js and tests/detect.test.mjs ONLY. Plain JavaScript ES module, no libraries,
no ML - we must write the algorithm ourselves (the hackathon bans pre-built models).

Implement, exactly as in docs/PLAN.md:
- bls(time, flux, opts): Box Least Squares from scratch. Period grid from opts.minPeriod
  (default 0.3 d) to min(opts.maxPeriod ?? 15, span/2), spaced uniformly in frequency
  (~3000 trial periods), durations [0.04, 0.06, 0.09, 0.13, 0.18, 0.25] d. For each period:
  phase-fold, bin into ~200 phase bins (keep sum and count per bin), slide a box of each
  duration over the bins (wrap around), depth = mean_out - mean_in, power = depth^2 * n_in *
  n_out / n (standard BLS signal residue). Keep the best (period, t0, duration, depth).
  depthErr = std(out-of-transit flux) * sqrt(1/n_in + 1/n_out); snr = depth / depthErr.
  Return {periods, power, best}. Must run < 1.5 s on 6000 points in Node.
- fold(time, flux, period, t0): phase in days centred on transit (-P/2..P/2).
- vet(time, flux, best): checks with plain-English detail sentences:
  1 "Signal strength" SNR >= 7.1 (Kepler mission threshold)
  2 "Repeats" >= 2 transits covered by data
  3 "Odd vs even" depths of odd and even transits agree within 3 sigma
  4 "Secondary eclipse" no significant dip at phase 0.5
  verdict: not enough data (< 2 transits) -> "NEED MORE DATA"; 3 or 4 fail ->
  "LIKELY FALSE POSITIVE"; 1 fails -> "NO CONVINCING SIGNAL"; else "PLANET CANDIDATE".
- Works on PARTIAL data (the UI calls it as packets arrive), never throws on short arrays.

tests/detect.test.mjs (node:test, run with `node --test "tests/*.test.mjs"`): synthetic light curves:
(a) box transit P=2.5 d depth 0.01 + noise 0.002 -> period within 1% and PLANET CANDIDATE;
(b) eclipsing binary: alternating depths 0.02/0.01 at P=1.8 d + secondary -> LIKELY FALSE
POSITIVE; (c) pure noise -> NO CONVINCING SIGNAL; (d) 1.2 days of (a) -> NEED MORE DATA;
(e) timing: 6000 points < 1.5 s. Use a seeded random generator so tests are deterministic.

Done when: node --test "tests/*.test.mjs" is green. PR "Detector: BLS + checks (closes #2)", squash-merge.
Then: when web/data/*.json exists on main, run bls on each file and print found vs
publishedPeriod; fix real bugs in a new small PR (say exactly what changed and why).
```
