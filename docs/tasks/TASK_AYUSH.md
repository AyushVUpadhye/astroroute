# TASK — Ayush · mission-control UI · issue: UI · branch `feat/ui`

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
