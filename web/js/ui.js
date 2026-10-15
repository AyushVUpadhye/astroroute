// Canvas drawing helpers: map, charts, panels.

const C = {
  bg: "#05070D", bg2: "#0c1120", bg3: "#111827",
  accent: "#7FD1FF", accent2: "#4fa8d8",
  green: "#4ade80", yellow: "#facc15", red: "#f87171", orange: "#fb923c",
  text: "#e2e8f0", muted: "#64748b", border: "#1e3a5f",
};

// ── Map ──────────────────────────────────────────────────────────────────────
const AU_COLORS = { sun: "#FCD34D", earth: "#3B82F6", observatory: "#7FD1FF",
  relay: "#94A3B8", asteroid: "#F97316", comet: "#A78BFA" };

let _orbitAlpha = [];

export function drawMap(canvas, snap, route, altRoute, hoveredId) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const cx = canvas.width / 2, cy = canvas.height / 2;
  const size = Math.min(cx, cy);
  const SCALE = size * 0.9 / 5.5;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const px = (x) => cx + x * SCALE;
  const py = (y) => cy - y * SCALE;

  // Sun glow
  const sg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 28);
  sg.addColorStop(0, "rgba(252,211,77,0.9)"); sg.addColorStop(1, "rgba(252,211,77,0)");
  ctx.beginPath(); ctx.arc(cx, cy, 28, 0, Math.PI * 2);
  ctx.fillStyle = sg; ctx.fill();

  // Orbit rings
  const orbits = new Map();
  for (const n of snap.nodes) {
    const r = Math.sqrt(n.x * n.x + n.y * n.y);
    if (!orbits.has(r.toFixed(2))) orbits.set(r.toFixed(2), r);
  }
  ctx.lineWidth = 0.5;
  for (const r of orbits.values()) {
    ctx.beginPath(); ctx.arc(cx, cy, r * SCALE, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(30,58,95,0.6)"; ctx.stroke();
  }

  // Build route sets
  const routeSet = new Set();
  const altSet = new Set();
  if (route) for (let i = 1; i < route.length; i++) routeSet.add(`${route[i-1]}|${route[i]}`);
  if (altRoute) for (let i = 1; i < altRoute.length; i++) altSet.add(`${altRoute[i-1]}|${altRoute[i]}`);

  const nodeMap = new Map(snap.nodes.map(n => [n.id, n]));

  // All links (grey)
  for (const n of snap.nodes) {
    for (const m of snap.nodes) {
      if (n.id >= m.id) continue;
      const dx = n.x - m.x, dy = n.y - m.y, dist = Math.sqrt(dx*dx + dy*dy);
      if (dist > 2.7) continue;
      const key1 = `${n.id}|${m.id}`, key2 = `${m.id}|${n.id}`;
      if (routeSet.has(key1) || routeSet.has(key2) || altSet.has(key1) || altSet.has(key2)) continue;
      ctx.beginPath(); ctx.moveTo(px(n.x), py(n.y)); ctx.lineTo(px(m.x), py(m.y));
      ctx.strokeStyle = "rgba(30,58,95,0.4)"; ctx.lineWidth = 0.5; ctx.stroke();
    }
  }

  // Alt route links
  if (altRoute) {
    ctx.save(); ctx.setLineDash([4, 4]);
    for (let i = 1; i < altRoute.length; i++) {
      const a = nodeMap.get(altRoute[i-1]), b = nodeMap.get(altRoute[i]);
      if (!a || !b) continue;
      ctx.beginPath(); ctx.moveTo(px(a.x), py(a.y)); ctx.lineTo(px(b.x), py(b.y));
      ctx.strokeStyle = C.yellow; ctx.lineWidth = 1.5; ctx.stroke();
    }
    ctx.restore();
  }

  // Primary route links
  if (route) {
    for (let i = 1; i < route.length; i++) {
      const a = nodeMap.get(route[i-1]), b = nodeMap.get(route[i]);
      if (!a || !b) continue;
      // Glow
      ctx.shadowColor = C.accent; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(px(a.x), py(a.y)); ctx.lineTo(px(b.x), py(b.y));
      ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  // Debris
  for (const d of snap.debris) {
    const col = d.kind === "comet" ? C.orange : "#9CA3AF";
    const r = Math.max(2, d.r * SCALE * 0.6);
    const g = ctx.createRadialGradient(px(d.x), py(d.y), 0, px(d.x), py(d.y), r * 2.5);
    g.addColorStop(0, d.kind === "comet" ? "rgba(167,139,250,0.3)" : "rgba(249,115,22,0.25)");
    g.addColorStop(1, "transparent");
    ctx.beginPath(); ctx.arc(px(d.x), py(d.y), r * 2.5, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); ctx.arc(px(d.x), py(d.y), r, 0, Math.PI * 2);
    ctx.fillStyle = col; ctx.fill();
  }

  // Nodes
  for (const n of snap.nodes) {
    const col = AU_COLORS[n.kind] ?? AU_COLORS.relay;
    const r = n.kind === "sun" ? 0 : n.kind === "earth" ? 6 : n.kind === "observatory" ? 7 : 4;
    if (r === 0) continue;
    const isHovered = n.id === hoveredId;
    const inRoute = route && route.includes(n.id);
    if (isHovered || inRoute) { ctx.shadowColor = col; ctx.shadowBlur = 12; }
    ctx.beginPath(); ctx.arc(px(n.x), py(n.y), r + (isHovered ? 2 : 0), 0, Math.PI * 2);
    ctx.fillStyle = inRoute ? col : (isHovered ? col : col + "AA");
    ctx.fill();
    if (isHovered || inRoute) ctx.shadowBlur = 0;
    // Label
    if (n.kind !== "relay" || isHovered) {
      ctx.fillStyle = isHovered ? C.text : C.muted;
      ctx.font = `${isHovered ? 11 : 9}px Courier New`;
      ctx.fillText(n.name ?? n.id, px(n.x) + r + 3, py(n.y) + 4);
    }
  }
}

// ── Light curve ──────────────────────────────────────────────────────────────
export function drawLightCurve(canvas, time, flux) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, w, h);
  if (!time || time.length < 2) { _label(ctx, w, h, "Light curve"); return; }
  _label(ctx, w, h, "Light curve", 4);
  _line(ctx, w, h, time, flux, C.accent2, "blue");
}

export function drawPeriodogram(canvas, periods, power, bestPeriod) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, w, h);
  if (!periods || periods.length < 2) { _label(ctx, w, h, "Periodogram"); return; }
  _label(ctx, w, h, "Periodogram", 4);
  _line(ctx, w, h, periods, power, C.yellow, "log");
  // Best period marker
  if (bestPeriod) {
    const maxP = Math.max(...periods), minP = Math.min(...periods);
    const xf = (Math.log(bestPeriod) - Math.log(minP)) / (Math.log(maxP) - Math.log(minP));
    const x = 6 + xf * (w - 12);
    ctx.beginPath(); ctx.moveTo(x, 8); ctx.lineTo(x, h - 8);
    ctx.strokeStyle = C.red; ctx.lineWidth = 1.5; ctx.setLineDash([3,3]); ctx.stroke();
    ctx.setLineDash([]);
  }
}

export function drawFolded(canvas, phase, flux) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, w, h);
  if (!phase || phase.length < 2) { _label(ctx, w, h, "Folded transit"); return; }
  _label(ctx, w, h, "Folded transit", 4);
  // Sort by phase
  const pts = phase.map((p, i) => [p, flux[i]]).sort((a, b) => a[0] - b[0]);
  _line(ctx, w, h, pts.map(p => p[0]), pts.map(p => p[1]), C.green, "linear");
}

function _label(ctx, w, h, text, yOff = 0) {
  ctx.fillStyle = C.muted;
  ctx.font = "9px Courier New";
  ctx.fillText(text, 6, 11 + yOff);
}

function _line(ctx, w, h, xs, ys, color, xScale = "linear") {
  const pad = { l: 6, r: 6, t: 14, b: 6 };
  const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const rangeY = maxY - minY || 1, rangeX = maxX - minX || 1;
  const toX = (v) => {
    if (xScale === "log") return pad.l + ((Math.log(v) - Math.log(minX)) / Math.log(maxX / minX)) * pw;
    return pad.l + ((v - minX) / rangeX) * pw;
  };
  const toY = (v) => pad.t + ph - ((v - minY) / rangeY) * ph;
  ctx.beginPath();
  ctx.moveTo(toX(xs[0]), toY(ys[0]));
  for (let i = 1; i < xs.length; i++) ctx.lineTo(toX(xs[i]), toY(ys[i]));
  ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
}

// ── Forecast bar chart ───────────────────────────────────────────────────────
export function drawForecast(canvas, entries) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, w, h);
  if (!entries || !entries.length) return;
  const n = entries.length;
  const bw = (w - 12) / n;
  const maxT = Math.max(1, ...entries.map(e => e.threatLevel));
  for (let i = 0; i < n; i++) {
    const e = entries[i];
    const frac = e.threatLevel / maxT;
    const bh = Math.max(2, frac * (h - 20));
    const col = e.linksBlocked > 0 ? C.red : e.threatLevel > 0 ? C.yellow : C.green;
    ctx.fillStyle = col + "99";
    ctx.fillRect(6 + i * bw, h - 14 - bh, bw - 1, bh);
  }
  // X labels
  ctx.fillStyle = C.muted; ctx.font = "8px Courier New";
  const step = Math.ceil(n / 6);
  for (let i = 0; i < n; i += step) {
    ctx.fillText(`${entries[i].hours}h`, 6 + i * bw, h - 3);
  }
}

// ── Route card text ──────────────────────────────────────────────────────────
export function renderRouteCard(el, pathNodes, lifetime, bottleneck) {
  if (!pathNodes || !pathNodes.length) { el.textContent = "No route"; return; }
  el.innerHTML = `<b>Path:</b> ${pathNodes.join(" → ")}<br>` +
    (lifetime != null ? `<span style="color:${lifetime < 6 ? C.red : lifetime < 24 ? C.yellow : C.green}">⏱ ${lifetime.toFixed(1)} h remaining</span><br>` : "") +
    (bottleneck ? `<span style="color:${C.muted}">⚠ bottleneck: ${bottleneck}</span>` : "");
}

export function renderAltCard(el, altNodes) {
  if (!altNodes || !altNodes.length) { el.textContent = ""; return; }
  el.innerHTML = `<b>Alt:</b> ${altNodes.join(" → ")}`;
}

// ── Verdict box ──────────────────────────────────────────────────────────────
export function renderVerdict(el, checksEl, result) {
  if (!result) { el.textContent = "—"; el.className = "verdict nodata"; checksEl.innerHTML = ""; return; }
  const { verdict, checks, radiusEarth } = result;
  const cls = verdict === "PLANET CANDIDATE" ? "candidate" :
    verdict === "LIKELY FALSE POSITIVE" ? "fp" :
    verdict === "NO CONVINCING SIGNAL" ? "weak" : "nodata";
  el.className = `verdict ${cls}`;
  el.textContent = verdict + (radiusEarth != null ? ` · ${radiusEarth.toFixed(1)} R⊕` : "");
  checksEl.innerHTML = (checks ?? []).map(c =>
    `<div class="check-row"><span class="icon">${c.passed ? "✔" : "✖"}</span>` +
    `<span style="color:${c.passed ? C.green : C.red}">${c.name}` +
    `${c.value != null ? ` (${c.value})` : ""}</span>` +
    `<span class="detail"> — ${c.detail}</span></div>`
  ).join("");
}

// ── Event log ────────────────────────────────────────────────────────────────
const MAX_LOG = 80;
const _log = [];

export function logEvent(msg, type = "info") {
  _log.push({ msg, type });
  if (_log.length > MAX_LOG) _log.shift();
}

export function renderLog(el) {
  el.innerHTML = _log.slice().reverse().slice(0, 20).map(e =>
    `<li class="${e.type}">${e.msg}</li>`
  ).join("");
}

// ── Resilience badge ─────────────────────────────────────────────────────────
export function renderResilienceBadge(el, score) {
  if (score == null) { el.textContent = "—"; return; }
  const col = score >= 70 ? C.green : score >= 40 ? C.yellow : C.red;
  el.style.color = col;
  el.style.borderColor = col;
  el.textContent = `Resilience ${score}/100`;
}
