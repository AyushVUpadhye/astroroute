# TASK — Abhijeet · detector (`web/js/detect.js`) · issue: Detector · branch `feat/detect`

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

tests/detect.test.mjs (node:test, run with `node --test tests/`): synthetic light curves:
(a) box transit P=2.5 d depth 0.01 + noise 0.002 -> period within 1% and PLANET CANDIDATE;
(b) eclipsing binary: alternating depths 0.02/0.01 at P=1.8 d + secondary -> LIKELY FALSE
POSITIVE; (c) pure noise -> NO CONVINCING SIGNAL; (d) 1.2 days of (a) -> NEED MORE DATA;
(e) timing: 6000 points < 1.5 s. Use a seeded random generator so tests are deterministic.

Done when: node --test tests/ is green. PR "Detector: BLS + checks (closes #2)", squash-merge.
Then: when web/data/*.json exists on main, run bls on each file and print found vs
publishedPeriod; fix real bugs in a new small PR (say exactly what changed and why).
```
