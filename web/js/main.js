// Main loop: sim -> router -> packets -> detect -> ui.

import { createWorld, step, snapshot, attenuationDb,
  debrisIntersectsPath, predictJam, pathLifetime,
  networkResilienceScore, forecastNetworkHealth, nearestNode } from "./sim.js";
import { buildLinks, bestPath, alternatePath } from "./router.js";
import { bls, fold, vet } from "./detect.js";
import { drawMap, drawLightCurve, drawPeriodogram, drawFolded,
  drawForecast, renderRouteCard, renderAltCard, renderVerdict,
  renderLog, renderResilienceBadge, logEvent } from "./ui.js";

// ── DOM refs ──────────────────────────────────────────────────────────────────
const mapCanvas     = document.getElementById("mapCanvas");
const lcCanvas      = document.getElementById("lcCanvas");
const pgCanvas      = document.getElementById("pgCanvas");
const foldCanvas    = document.getElementById("foldCanvas");
const forecastCanvas= document.getElementById("forecastCanvas");
const routeCard     = document.getElementById("routeCard");
const altRouteCard  = document.getElementById("altRouteCard");
const verdictBox    = document.getElementById("verdictBox");
const checksBox     = document.getElementById("checksBox");
const eventLog      = document.getElementById("eventLog");
const clock         = document.getElementById("clock");
const resScore      = document.getElementById("resScore");
const tooltip       = document.getElementById("tooltip");
const targetLabel   = document.getElementById("targetLabel");
const targetPicker  = document.getElementById("targetPicker");
const scenarioPicker= document.getElementById("scenarioPicker");
const speedPicker   = document.getElementById("speedPicker");
const btnPlayPause  = document.getElementById("btnPlayPause");
const btnReset      = document.getElementById("btnReset");
const btnAddAsteroid= document.getElementById("btnAddAsteroid");
const btnAddComet   = document.getElementById("btnAddComet");

// ── State ─────────────────────────────────────────────────────────────────────
let world, snap, route = null, altRoute = null;
let paused = false;
let addMode = null; // "asteroid" | "comet"
let hoveredId = null;
let lastFrameTime = 0;
let accumMs = 0;
const SIM_DT = 1; // hours per sim step

// Exoplanet data
let exoIndex = [];
let currentTarget = null;
let blsResult = null;
let vetResult = null;

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  await loadExoIndex();
  resetSim();
  requestAnimationFrame(frame);
}

async function loadExoIndex() {
  try {
    const res = await fetch("data/index.json");
    exoIndex = await res.json();
    exoIndex.forEach(e => {
      const opt = document.createElement("option");
      opt.value = e.slug; opt.textContent = e.target;
      targetPicker.appendChild(opt);
    });
    if (exoIndex.length) loadTarget(exoIndex[0].slug);
  } catch { logEvent("Could not load target index", "warn"); }
}

async function loadTarget(slug) {
  const entry = exoIndex.find(e => e.slug === slug);
  if (!entry) return;
  currentTarget = entry;
  targetLabel.textContent = entry.target;
  blsResult = null; vetResult = null;
  renderVerdict(verdictBox, checksBox, null);
  try {
    const res = await fetch(`data/${slug}.json`);
    const { time, flux } = await res.json();
    const r = bls(time, flux);
    blsResult = r;
    drawLightCurve(lcCanvas, time, flux);
    drawPeriodogram(pgCanvas, r.periods, r.power, r.best?.period);
    if (r.best) {
      const f = fold(time, flux, r.best.period, r.best.t0);
      drawFolded(foldCanvas, f.phase, f.flux);
      vetResult = vet(time, flux, r.best, entry.starRadius ?? null);
      renderVerdict(verdictBox, checksBox, vetResult);
      logEvent(`BLS: ${entry.target} P=${r.best.period.toFixed(4)}d → ${vetResult.verdict}`,
        vetResult.verdict === "PLANET CANDIDATE" ? "good" : "warn");
    } else {
      drawFolded(foldCanvas, null, null);
      renderVerdict(verdictBox, checksBox, { checks: [], verdict: "NO CONVINCING SIGNAL", radiusEarth: null });
    }
  } catch { logEvent(`Data load failed: ${slug}`, "alert"); }
}

function resetSim() {
  world = createWorld(scenarioPicker.value);
  snap = snapshot(world);
  route = null; altRoute = null;
  updateRoute();
  logEvent(`Scenario: ${scenarioPicker.value}`, "info");
}

// ── Routing ───────────────────────────────────────────────────────────────────
function updateRoute() {
  const links = buildLinks(snap, (s, a, b) => attenuationDb(s, a, b));
  const src = snap.nodes.find(n => n.kind === "observatory")?.id;
  const dst = snap.nodes.find(n => n.kind === "earth")?.id;
  if (!src || !dst) return;

  const best = bestPath(links, src, dst);
  const wasRouted = !!route;

  if (best) {
    const prev = route;
    // Proactive reroute: check if route is about to be jammed
    if (route) {
      const threat = debrisIntersectsPath(snap, route);
      if (threat.threatened) {
        for (const seg of threat.segments) {
          if (predictJam(snap, seg.a, seg.b, 6, 1).willJam) {
            const reliable = bestPath(links, src, dst, "reliable");
            if (reliable) {
              route = reliable.nodes;
              logEvent("Proactive reroute (jam predicted)", "warn");
              break;
            }
          }
        }
      }
    }
    if (!route) {
      route = best.nodes;
      if (!wasRouted) logEvent("Route established", "good");
      else logEvent("Route restored", "good");
    }
    // Alternate path
    const alt = alternatePath(links, src, dst, { nodes: route });
    altRoute = alt ? alt.nodes : null;
    // Lifetime
    const lt = pathLifetime(snap, route, 48, 1);
    renderRouteCard(routeCard, route, lt.lifetimeHours, lt.bottleneckLink ? `${lt.bottleneckLink.a}–${lt.bottleneckLink.b}` : null);
    renderAltCard(altRouteCard, altRoute);
  } else {
    if (route) logEvent("Route LOST — no path!", "alert");
    route = null; altRoute = null;
    routeCard.textContent = "No route available";
    altRouteCard.textContent = "";
  }

  // Resilience
  const r = networkResilienceScore(snap);
  renderResilienceBadge(resScore, r.score);
}

// ── Frame loop ────────────────────────────────────────────────────────────────
const ROUTE_INTERVAL_MS = 2000;
const FORECAST_INTERVAL_MS = 5000;
let lastRouteUpdate = 0, lastForecastUpdate = 0;

function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.min(ts - lastFrameTime, 100);
  lastFrameTime = ts;
  if (paused) { redraw(); return; }

  const speed = parseInt(speedPicker.value, 10);
  accumMs += dt * speed;
  const stepsPerFrame = Math.min(Math.floor(accumMs / (1000 / 60)), 8);
  accumMs -= stepsPerFrame * (1000 / 60);

  for (let i = 0; i < stepsPerFrame; i++) step(world, SIM_DT);
  snap = snapshot(world);
  clock.textContent = `t = ${(snap.t / 24).toFixed(1)} d`;

  if (ts - lastRouteUpdate > ROUTE_INTERVAL_MS) {
    updateRoute(); lastRouteUpdate = ts;
  }
  if (ts - lastForecastUpdate > FORECAST_INTERVAL_MS) {
    const fc = forecastNetworkHealth(snap, 24, 1);
    drawForecast(forecastCanvas, fc);
    lastForecastUpdate = ts;
  }

  redraw();
  renderLog(eventLog);
}

function redraw() {
  drawMap(mapCanvas, snap, route, altRoute, hoveredId);
}

// ── Interactions ──────────────────────────────────────────────────────────────
btnPlayPause.addEventListener("click", () => {
  paused = !paused;
  btnPlayPause.textContent = paused ? "▶" : "⏸";
  logEvent(paused ? "Paused" : "Resumed", "info");
});

btnReset.addEventListener("click", resetSim);

scenarioPicker.addEventListener("change", resetSim);

targetPicker.addEventListener("change", () => loadTarget(targetPicker.value));

btnAddAsteroid.addEventListener("click", () => {
  addMode = addMode === "asteroid" ? null : "asteroid";
  btnAddAsteroid.classList.toggle("active", addMode === "asteroid");
  btnAddComet.classList.remove("active");
  if (addMode) logEvent("Click map to place asteroid", "info");
});

btnAddComet.addEventListener("click", () => {
  addMode = addMode === "comet" ? null : "comet";
  btnAddComet.classList.toggle("active", addMode === "comet");
  btnAddAsteroid.classList.remove("active");
  if (addMode) logEvent("Click map to place comet", "info");
});

mapCanvas.addEventListener("click", (e) => {
  if (!addMode) return;
  const { au_x, au_y } = canvasToAU(e);
  const { addDebris } = window._simExports ?? {};
  if (addDebris) {
    addDebris(world, au_x, au_y, addMode);
    snap = snapshot(world);
    logEvent(`${addMode} placed at (${au_x.toFixed(2)}, ${au_y.toFixed(2)}) AU`, "warn");
  }
  addMode = null;
  btnAddAsteroid.classList.remove("active");
  btnAddComet.classList.remove("active");
});

mapCanvas.addEventListener("mousemove", (e) => {
  const { au_x, au_y } = canvasToAU(e);
  const node = nearestNode(snap, au_x, au_y);
  if (node) {
    const dist = Math.sqrt((node.x - au_x)**2 + (node.y - au_y)**2);
    if (dist < 0.3) {
      hoveredId = node.id;
      tooltip.classList.remove("hidden");
      tooltip.style.left = (e.offsetX + 14) + "px";
      tooltip.style.top  = (e.offsetY + 8) + "px";
      tooltip.innerHTML = `<b>${node.name ?? node.id}</b><br>${node.kind}<br>` +
        `(${node.x.toFixed(2)}, ${node.y.toFixed(2)}) AU`;
      return;
    }
  }
  hoveredId = null;
  tooltip.classList.add("hidden");
});

mapCanvas.addEventListener("mouseleave", () => {
  hoveredId = null; tooltip.classList.add("hidden");
});

function canvasToAU(e) {
  const rect = mapCanvas.getBoundingClientRect();
  const cx = mapCanvas.width / 2, cy = mapCanvas.height / 2;
  const SCALE = Math.min(cx, cy) * 0.9 / 5.5;
  return {
    au_x: (e.clientX - rect.left - cx) / SCALE,
    au_y: -(e.clientY - rect.top  - cy) / SCALE,
  };
}

// ── Export addDebris for click handler ────────────────────────────────────────
import { addDebris } from "./sim.js";
window._simExports = { addDebris };

// ── Demo mode ─────────────────────────────────────────────────────────────────
const params = new URLSearchParams(location.search);
if (params.get("demo") === "1") {
  let demoStep = 0;
  const demoEvents = [
    { t: 3000,  fn: () => logEvent("Demo: storm scenario incoming...", "warn") },
    { t: 5000,  fn: () => { scenarioPicker.value = "storm"; resetSim(); } },
    { t: 15000, fn: () => logEvent("Demo: loading WASP-18 b detection", "info") },
    { t: 16000, fn: () => { targetPicker.value = "wasp-18"; loadTarget("wasp-18"); } },
    { t: 30000, fn: () => logEvent("Demo: comet-rain scenario", "warn") },
    { t: 32000, fn: () => { scenarioPicker.value = "comet-rain"; resetSim(); } },
  ];
  const demoStart = performance.now();
  function demoTick() {
    const elapsed = performance.now() - demoStart;
    while (demoStep < demoEvents.length && elapsed >= demoEvents[demoStep].t) {
      demoEvents[demoStep].fn(); demoStep++;
    }
    if (demoStep < demoEvents.length) requestAnimationFrame(demoTick);
  }
  requestAnimationFrame(demoTick);
}

// ── Boot ──────────────────────────────────────────────────────────────────────
init();
