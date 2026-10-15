# TASK — Ayush · mission-control UI · issue: UI · branch `feat/ui`

## Update from Chirag (12:37) — real modules are on main, plus one new feature
- `sim.js` (Bhumika), `router.js`, `detect.js` are REAL and tested on main — no mocks needed,
  `git pull origin main` and import them.
- NEW: **predictive routing.** Add a "Predictive" toggle to the route card, ON by default. When on:
  `bestPath(buildLinksAhead(prevSnap, snap, sim.attenuationDb, dtDays, {aheadDays: 1}), obs, earth)
  || bestPath(buildLinks(snap, sim.attenuationDb), obs, earth)` (same links for alternatePath).
  Keep last frame's snapshot as `prevSnap`. Draw links with `forecastBlocked: true` as a thin
  dotted red line ("will be jammed"). In the event log mark each reroute "proactive" (old path
  still up) or "forced" (old path already jammed). Measured: forced reroutes 5 → 0 with it on.
- NEW (12:44): **3 routing modes.** Mode toggle Fastest / Reliable / **Max throughput** (`bestPath(links, obs, earth, "throughput")`).
  Every route has `capacityMbps` (Shannon bottleneck) — show "Throughput X.X Mbps" next to latency.
- A backup UI is being built on branch `fallback/ui` in case of time trouble — push yours to main
  as soon as it runs; yours wins if it works.

## For you
UI/UX Gauntlet: use UIUX_PROMPT.txt in an EMPTY folder (not this repo). When called — commit,
push, merge, tell Chirag, go. Clone, open Claude Code in the repo, type:
*"Read docs/tasks/TASK_AYUSH.md and do 'For the AI'."*
Run: `python -m http.server 8000 -d web` → http://localhost:8000 (and `?demo=1`).
Q&A you answer: what each panel shows, how a user plays with it.

## For the AI
```text
Read docs/PLAN.md ("Interfaces", "Git flow") first. Branch feat/ui. You own web/index.html,
web/css/style.css, web/js/ui.js and web/js/main.js ONLY. Vanilla HTML/CSS/JS ES modules,
Canvas 2D, NO libraries, no build step. Until sim.js / router.js / detect.js are implemented
on main, write small mocks INSIDE main.js behind one flag (USE_MOCKS) with the exact shapes
from docs/PLAN.md "Interfaces", so the UI works from minute one.

Layout (1440x900 first, still usable at 1024 wide), dark space theme: bg #05070D, panels
#0B1020 with 1px #1C2540 hairlines, text #E6EDF3, muted #8B95A7, ONE accent #7FD1FF (best
path), amber #FFB547 (alternate path), red #FF6B6B (jamming), green #69D39A (ok). System font
stack + monospace for numbers.
- LEFT, big: "Network map" canvas: sun, orbit circles, nodes (Earth, relays, observatory)
  with labels, all links as faint lines coloured by snrDb (green->red, blocked links hidden),
  debris as particle clouds with a soft red jamming halo of radius r, BEST path thick cyan
  with animated packets (dots) flowing observatory -> Earth, ALTERNATE path dashed amber.
- RIGHT column: (1) Route card: mode toggle Fastest/Reliable, latency (min), hops, min SNR,
  reroutes count, link status pill "LINK UP / REROUTED / LINK DOWN - buffering";
  (2) Event log (newest first, timestamped: "Comet C-1 jammed Relay-3 -> Earth; rerouted via
  Relay-5, +1.8 min"); (3) Detection: received light-curve chart (points appear as packets
  arrive), "received N of M points" bar, periodogram mini-chart, folded transit chart,
  VERDICT card (big word coloured by state) + checks list (tick/cross + detail sentence).
- TOP bar: name "AstroRoute", target picker (custom buttons, NOT a native <select>) from
  web/data/index.json, Play/Pause, speed 1x/4x/16x, tool buttons "Drop asteroid swarm" /
  "Launch comet" (then click on the map), "Reset".
main.js loop (requestAnimationFrame): sim.step -> snapshot -> router.buildLinks ->
bestPath/alternatePath (observatory -> Earth) -> if the best path changed, log a reroute
event -> move packets along the CURRENT best path; packets carry chunks of the target's
light curve (web/data/<slug>.json); if there is no path, packets wait at the observatory
(count "buffered") -> delivered points append to the received arrays -> every ~10 delivered
packets call detect.bls + detect.vet and redraw charts. Charts: write small canvas helpers in
ui.js (scatter, line, axes with labels) - no chart library.
?demo=1: auto-play a story: load the first target, play 4x, at ~10 s auto-drop a swarm on the
current best path, at ~25 s launch a comet across the alternate, keep going until the verdict.

Done when: on mocks, the map animates, packets flow, dropping a swarm on the path triggers a
reroute event, charts fill. PR "UI: mission control (closes #3)", squash-merge. Then switch
USE_MOCKS off when the real modules are on main (git pull origin main), fix integration
issues in small PRs, and save a screenshot to docs/screenshot.png.
```
