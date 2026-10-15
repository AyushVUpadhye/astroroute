# Google Form — paste-ready text (numbers from `npm test`, 15 Oct 2026)

**Project name:** AstroRoute

**GitHub link:** https://github.com/thegoodengineers/astroroute

**Hosted website:** https://thegoodengineers.github.io/astroroute/  (auto demo: add `?demo=1`)

**Theme:** 03 · SPACE — Exoplanet Hunter (+ the asteroid/comet disruption constraint)

**Product description:**
AstroRoute keeps a deep-space telescope's data flowing to Earth while asteroid swarms and comets
jam the radio links — and still finds the exoplanet in that data. A relay network spans the
solar system; every step our router recomputes the best path (Dijkstra) and a fully independent
alternate path, looks one day ahead to leave links before debris reaches them, and can maximise
Shannon throughput. Real NASA Kepler and TESS light curves travel through the network as packets;
blocked packets wait instead of being lost. Every packet that arrives feeds our from-scratch Box
Least Squares transit search and six physics checks (signal strength, repeats, odd/even depth,
secondary eclipse, size, brightness) that explain each verdict in plain English.
Measured: 100% of data delivered with rerouting vs 33.1% (default swarm) and 20.9% (storm) on a
fixed route; predictive routing cut paths broken in use 5→0 and 6→0; max-throughput mode moves
22–31% more data; router matches brute force in 2,000/2,000 cases; our BLS recovers 9/9 NASA
periods within 1%; 6/6 confirmed planets and 2/2 NASA false positives classified correctly; a
planet is confirmed from a median 15% of the stream and still found in 17/18 runs with 70% of
packets lost. No pre-built or trained models — every algorithm is ours.

**Tech stack:**
JavaScript (ES modules, Canvas, Web Worker) — no frameworks, no build step · Python 3.11 +
lightkurve (NASA MAST data download only) · Node.js test runner (54 tests) · GitHub Pages.
Algorithms written by us: Dijkstra (binary heap), independent-alternate / Yen-style paths,
widest path (Shannon capacity), predictive link forecasting, Box Least Squares, transit vetting.

**Team:** The Good Engineers — Chirag, Abhijeet, Ayush, Bhumika
