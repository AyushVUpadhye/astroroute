# AstroRoute

Keep the signal alive, find the world — live rerouting of deep-space telescope data around asteroid/comet jamming, with a from-scratch exoplanet detector.

## Problem statement — ZERO HOUR · Theme 03: 🚀 SPACE — EXOPLANET HUNTER

**Case Study: A Signal Hidden in the Starlight**

**The Scenario.** A telescope monitoring a distant star has detected a repeating dip in its brightness. It could be an exoplanet passing in front of the star — or it could be noise, instrument error, or another astronomical event. Your research team has been given a limited window to investigate the signal before the observation slot expires. The raw measurements are complex, and manually examining every candidate would take too long. A false positive could waste valuable telescope time; overlooking a genuine planet could mean missing a major discovery.

**Your Mission.** Build an exoplanet-detection prototype that analyses astronomical light-curve data, identifies possible transit patterns, distinguishes promising candidates from noise, and visualizes the evidence behind its predictions. Use real public telescope data or a clearly documented sample dataset.

**The Challenge.** Can your system find a potential new world hidden in the data?

**Constraint (announced at the start of the hackathon).** When a group of asteroids or comets disrupts the radio signals between Earth and the target system, your solution must dynamically find an alternative transmission path to maintain communication and enable exoplanet detection. Pre-built models are not allowed.

## The constraint and how we meet it

**Constraint:** when asteroids/comets disrupt radio signals, find an alternative path and keep detection running.

**How:** relay network + Dijkstra rerouting + node-disjoint alternate path + from-scratch BLS detector. Beyond reactive rerouting: `pathLifetime` predicts how long your route will survive; `forecastNetworkHealth` gives a 24-hour threat forecast; `networkResilienceScore` grades the network 0–100 live; `relayVulnerabilityRanking` identifies the most critical relay.

## Wow numbers

| Metric | Value |
|---|---|
| Router optimal vs brute force (1 000 random networks) | **0 mismatches** |
| Packets delivered over 120 simulated days — live rerouting vs fixed | **100% vs 33.1%** (default), **100% vs 20.9%** (storm) |
| Paths broken in use — plain vs predictive routing (1-day lookahead) | **5 → 0** (default), **6 → 0** (storm) |
| Data volume — max-throughput vs fastest mode | **+22.4%** (default), **+31.2%** (storm) |
| BLS recovered NASA-published periods (within 1% or harmonic) | **9 / 9** |
| Verdicts on real NASA data — confirmed planets / known false positives | **6 / 6 planets**, **2 / 2 false positives caught** |
| Data needed to confirm a planet (stream cut short) | all 6 confirmed after **5–30%** of the stream, median **15%** |
| Random packet loss (6 planets × 3 seeds) | planet still found **18/18** at 50% loss, **17/18** at 70%, **14/18** at 90% |
| Network resilience score at start | **71 / 100** |
| Swarm impact at t=0 | **1 link blocked, 17 jammed** |

## How to run

```bash
python -m http.server 8000 -d web   # http://localhost:8000
npm test                             # 54 tests, all green
node tools/validate.mjs              # full report → results/validation.csv
```

## Architecture

```
sim.js ──► router.js ──► main.js ──► detect.js ──► ui.js
orbits      Dijkstra     loop        BLS           canvas
relays      alternate    packets     fold          map
predictJam  proactive    reroute     verdict       gauge
forecast
```

## sim.js API

| Function | What it does |
|---|---|
| `createWorld(scenario)` | default / storm / comet-rain |
| `step(world, dtHours)` | advance orbits + drift debris |
| `snapshot(world)` | pure read → `{t, nodes, debris}` |
| `attenuationDb(snap, A, B)` | jamming dB on link A→B |
| `addDebris(world, x, y, kind)` | drop swarm or comet |
| `predictJam(snap, A, B, horizonH, dtH)` | will this link jam within N hours? |
| `debrisIntersectsPath(snap, ids, margin)` | is debris threatening this path? |
| `pathLifetime(snap, ids, horizonH, dtH)` | hours until first link jams |
| `networkResilienceScore(snap)` | 0–100 network health score |
| `forecastNetworkHealth(snap, horizonH, dtH)` | threat time-series for next N hours |
| `relayVulnerabilityRanking(snap)` | which relay is most critical? |
| `computeSwarmImpact(snap, debrisId)` | links blocked/jammed by one swarm |
| `nearestNode(snap, x, y)` | closest node to a click |
| `linkThreatMap(snap)` | all jammed links sorted by dB |

## Simplifications

2-D solar system, circular orbits, toy link budget (1/d² loss), debris as jamming discs, linear drift.

## Data credits

NASA MAST (Kepler + TESS). `lightkurve` for download only — not used at runtime. **No pre-built models.**
