# TASK — Bhumika · space simulation + proof + pitch · issue: Sim · branch `feat/sim`

## For you
AI Music Gauntlet: MUSIC_KIT.txt (in the ffmpeg command change "Theme Exoplanet Hunter" to
"Theme Space"). When called — commit, push, merge, tell Chirag, go. Clone, open Claude Code in
the repo, type: *"Read docs/tasks/TASK_BHUMIKA.md and do 'For the AI'."*
13:45 is yours: run tools/validate.mjs → the wow numbers for README, slides and form.
At the pitch you narrate while Chirag drives. After: Google Form.

## For the AI
```text
Read docs/PLAN.md ("Interfaces", "Simplifications", "Git flow") first. Branch feat/sim.
You own web/js/sim.js, tests/sim.test.mjs, tools/validate.mjs, README.md and
docs/SLIDES.md ONLY. Plain JavaScript ES modules, no libraries.

web/js/sim.js exactly as in docs/PLAN.md "Interfaces". 2-D, sun at (0,0), units AU/days.
- Nodes: "earth" (Earth, circular orbit 1 AU, period 365.25 d); relays on circular orbits
  (e.g. Venus-orbit relay 0.72 AU, Earth L4/L5 relays at 1 AU +-60 deg, Mars-orbit relays
  1.52 AU, belt-edge relays ~2.0 and ~2.4 AU, outer relays ~3.2 AU) - 8 to 10 relays with
  Kepler-like periods (P = a^1.5 years); one "observatory" at ~4.5 AU in the direction of
  the target star (slow orbit). Names like "Relay-L4", "Mars-Relay-2".
- Debris: scenario "default" = one asteroid swarm (cluster of ~40 particles, centre + radius
  r ~0.35 AU, strength ~30 dB, slow drift) placed between the observatory and Earth so it
  crosses the initial best path within ~20 s at 4x; comets: small r ~0.15 AU, strength ~40 dB,
  fast straight trajectory. Each debris also keeps particle offsets for the UI to draw.
- attenuationDb: closest distance from debris centre to segment; if s < r add
  strength*(1 - s/r)^2 dB; sum over debris.
- addDebris(world, x, y, kind); scenarios: "default", "storm" (3 swarms), "comet-rain".
- Deterministic: seeded random generator, same scenario -> same world.
tests/sim.test.mjs (node:test): attenuation 0 when far, max at centre, symmetric in A/B;
orbits keep their radius after 1000 steps; same seed -> same snapshot.

tools/validate.mjs (node, imports the real modules from web/js/): headless run of the
"default" and "storm" scenarios for a fixed number of steps, observatory -> Earth, count
packets delivered per step (a) with live rerouting (bestPath each step) and (b) with the
route fixed at t=0. Print "Delivered with rerouting X% vs fixed route Y% (scenario ...)".
Also: for every web/data/*.json run detect.bls and compare with publishedPeriod (exact within
1%, harmonic 0.5x/2x/3x, else miss) -> print "BLS recovered A/B periods". Write all rows to
results/validation.csv. Never hide misses. Until router/detect exist on main, stub them.

README.md: name + one line, docs/screenshot.png, the constraint and how we meet it, how to
run (http.server + node --test), architecture (copy from docs/PLAN.md), real numbers from
results/validation.csv only, simplifications, data credits (NASA MAST, Kepler, TESS,
lightkurve for download only), "no pre-built models" statement.
docs/SLIDES.md: 4 slides - hook (signal lost behind a swarm), live demo, how it works,
proof + limits + team.

Done when: node --test tests/ green for sim; PR "Sim: world + swarm + jamming (closes #4)",
squash-merge. Then validate.mjs + README in a second PR once router/detect are on main.
```
