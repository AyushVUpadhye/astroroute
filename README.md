# AstroRoute

Keep the signal alive, find the world — live rerouting of deep-space telescope data around asteroid/comet jamming, with a from-scratch exoplanet detector.

---

## The constraint and how we meet it

**Constraint:** when asteroids or comets disrupt radio signals between Earth and the target system, the solution must dynamically find an alternative transmission path to keep communication up and enable exoplanet detection.

**How we meet it:** a relay network spans the solar system. Each animation step our router recomputes the best path (Dijkstra) and an independent alternate path (node-disjoint failover). As a debris swarm drifts and jams links, packets reroute in real time. Every arriving packet feeds our from-scratch BLS transit detector — the exoplanet signal emerges from the noise even during a network storm.

The simulation also supports **proactive rerouting**: `predictJam` looks ahead over a configurable time horizon, `debrisIntersectsPath` flags threatened routes, and the router switches to the reliable-cost path *before* a link actually breaks.

---

## Wow numbers (measured, not estimated)

| Metric | Value |
|---|---|
| Router optimal vs brute force (1 000 random networks) | **0 mismatches** |
| Packets — proactive rerouting vs reactive vs fixed route (default scenario) | **99.8% / 100% / 81.8%** |
| BLS recovered NASA-published periods (within 1% or harmonic) | **9 / 9** |

*(Regenerate: `node tools/validate.mjs`)*

---

## How to run

```bash
# Serve the web app (ES modules require http, not file://)
python -m http.server 8000 -d web
# open http://localhost:8000

# Run all tests (18 passing)
node --test tests/

# Measure delivery + BLS numbers → results/validation.csv
node tools/validate.mjs
```

---

## Architecture

```
NASA MAST ──(tools/fetch_data.py, once)──► web/data/*.json
                                               │
sim.js ──► router.js ──► main.js ──► detect.js ──► ui.js
orbits      Dijkstra     loop        BLS           canvas
relays      alternate    packets     fold          map
swarm       path         received    vetting       light curve
predictJam               proactive   verdict       verdict
```

Modules in `web/js/`. Everything written from scratch: routing logic, link/jamming model, BLS detector, vetting checks. No ML, no trained model, no routing/BLS library.

| Module | Owner | Responsibility |
|---|---|---|
| `sim.js` | Bhumika | 2-D orbits, relay network, debris swarms, jamming attenuation, predictive jam look-ahead |
| `router.js` | Chirag | Link budget, Dijkstra best path, independent alternate path |
| `detect.js` | Abhijeet | BLS period search, phase folding, vetting checks |
| `ui.js` + `main.js` | Ayush | Canvas map, light-curve panel, animation loop |

---

## sim.js API

| Function | What it does |
|---|---|
| `createWorld(scenario)` | Build a deterministic world (default / storm / comet-rain) |
| `step(world, dtHours)` | Advance orbits and drift debris |
| `snapshot(world)` | Pure read — returns `{ t, nodes, debris }` |
| `attenuationDb(snap, nodeA, nodeB)` | Jamming dB along link A→B |
| `addDebris(world, x, y, kind)` | Drop a swarm or comet at (x, y) |
| `predictJam(snap, nodeA, nodeB, horizonHours, dtHours)` | Look-ahead: will this link jam within N hours? |
| `debrisIntersectsPath(snap, nodeIds, marginAU)` | Is any debris threatening this path? |
| `nearestNode(snap, x, y)` | Snap a click coordinate to the nearest node |
| `linkThreatMap(snap)` | All jammed links sorted by attenuation dB |

---

## Simplifications (said out loud)

- 2-D solar system, circular orbits (no eccentricity).
- Toy link budget: fixed transmit power, 1/d² spreading loss, debris modelled as jamming discs.
- Light curves are real NASA data replayed as packets — not a live feed.
- Debris drift is linear; no gravitational deflection.
- Proactive horizon is configurable but not adaptive.

---

## Data credits

- NASA MAST (Mikulski Archive for Space Telescopes) — Kepler and TESS light curves.
- `lightkurve` used for download only (offline, once); not used at runtime.
- Targets: Kepler-6, Kepler-17, TrES-2, HAT-P-7, WASP-18, WASP-43, KIC 6756669, KIC 8801343, TOI-1163.01.

**No pre-built models.** All detection logic written from scratch.
