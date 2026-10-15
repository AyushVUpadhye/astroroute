# AstroRoute — Slide Deck

---

## Slide 1 — Hook: Signal Lost

An observatory at 4.5 AU is watching a star. A planet transit begins.

Then an asteroid swarm drifts into the relay chain. Three links jam. The route dies.

*[live demo: swarm drifts in, links turn red, packet counter drops]*

But the system already knows. **pathLifetime said the route had 4 hours left.** It switched before the jam hit.

---

## Slide 2 — Live Demo

**Four things happening simultaneously on the canvas:**

1. **Relay network** — Observatory → 8 relays → Earth. Blue = best path. Orange = independent alternate (pre-computed, instant failover).
2. **Debris swarm** — 40-particle asteroid cluster drifting across the network. Each particle drawn individually.
3. **Resilience gauge** — 0–100 score dropping live as links jam. Starts at 71/100. Watch it fall.
4. **Light-curve panel** — BLS transit building up from every received packet. The planet emerges in real time.

Scenarios: Default (1 swarm) · Storm (3 swarms) · Comet rain. Drop your own swarm anywhere.

---

## Slide 3 — How It Works

**sim.js** — 2-D solar system, Kepler circular orbits. Debris: asteroid swarms (r 0.35 AU, 30 dB, slow) and comets (r 0.15 AU, 40 dB, fast). Jamming = `strength × (1 − s/r)²`. Fully deterministic (seeded RNG).

**Predictive layer (our contribution):**
- `pathLifetime` — for each link in the current path, runs `predictJam` forward in time. Returns the hour the bottleneck link jams. Router switches before that.
- `forecastNetworkHealth` — 24-hour threat forecast without mutating world state. Like a weather model for the network.
- `networkResilienceScore` — 0–100 grade: fraction of in-range links currently clear, weighted by partial jamming.
- `relayVulnerabilityRanking` — BFS from Observatory; removing each relay in turn, count how many nodes become unreachable. Top relay = most critical single point.

**router.js** — Dijkstra best path + node-disjoint alternate. Verified vs brute force: **0 mismatches on 1 000 random networks.**

**detect.js** — From-scratch BLS period search + phase folding + vetting. **9/9 NASA periods recovered within 1%.**

---

## Slide 4 — Proof, Limits and Team

**Numbers (all measured today):**

| What | Result |
|---|---|
| Router vs brute force | 0 mismatches |
| Proactive / reactive / fixed delivery | 99.8% / 100% / 81.8% |
| BLS period recovery | 9 / 9 |
| NASA false positives caught | 2 / 2 |
| Network resilience at start | 71 / 100 |
| Swarm impact at t=0 | 1 blocked, 17 jammed |

**Simplifications we own:** 2-D, circular orbits, toy link budget, linear debris drift, no gravity. The routing logic and detection are real. The physics is a declared approximation.

**Team:**

| | |
|---|---|
| Chirag | router, integration, hosting |
| Abhijeet | BLS detector |
| Ayush | UI/canvas |
| Bhumika | simulation, predictive features, validation, slides |
