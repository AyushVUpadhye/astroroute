# TASK — Chirag · router + data + integration · issue: Router · branch `feat/router`

## For you
At the bench all 2.5 h. Keep the clock, call the 14:00 freeze, drive the live demo, host on
GitHub Pages, cover whoever is at a Gauntlet. Q&A: routing, alternate path, link model.

## For the AI
```text
Read docs/PLAN.md first. Branch feat/router. You own web/js/router.js,
tests/router.test.mjs, tools/fetch_data.py, web/data/ ONLY.

1. tools/fetch_data.py (Python, venv "C:\Users\chira\Downloads\Zero hour hackthon\.venv"):
   for the targets below, download with lightkurve BY ID (name searches are slow), Kepler:
   author "Kepler", long cadence, 2 quarters stitched; TESS: author "SPOC" 120 s, 1 sector.
   remove_nans, normalize, remove outliers upward only (sigma_upper=4), flatten with
   window_length covering ~1 day, bin so <= 6000 points; write web/data/<slug>.json
   {target, mission, publishedPeriod, kind, time, flux} + web/data/index.json listing them.
   Targets (published periods from NASA Exoplanet Archive, see docs/TARGETS.md):
   Kepler-6 KIC 10874614 3.2346996 planet · Kepler-17 KIC 10619192 1.4857108 planet ·
   TrES-2 KIC 11446443 2.47063 planet · HAT-P-7 KIC 10666592 2.20474 planet ·
   WASP-18 TIC 100100827 0.94145223 planet · WASP-43 TIC 36734222 0.813475 planet ·
   KIC 6756669 5.851520671 false_positive · KIC 8801343 2.73987398 false_positive ·
   TOI-1163.01 TIC 375542276 3.0771612 candidate. Run it in the background, commit the JSON.
2. web/js/router.js exactly as in docs/PLAN.md "Interfaces": own Dijkstra with a binary heap,
   undirected links, defaults txDb=30, thresholdDb=6, comfortDb=15, lambda=0.5, maxRangeAU=2.6.
   alternatePath: remove best's intermediate nodes, rerun -> independent:true; else Yen-style
   second path (remove one best link at a time, keep cheapest) -> independent:false.
3. tests/router.test.mjs (node:test): 1000 random graphs of 4-9 nodes, compare bestPath cost
   with brute-force enumeration of all simple paths -> 0 mismatches (print the count);
   alternate path never equals best; independent alternate shares no intermediate node;
   blocked links never used; returns null when disconnected; timing for 30 nodes.
Done when: node --test tests/ green. PR "Router: links + best + alternate (closes #1)", merge.
```
