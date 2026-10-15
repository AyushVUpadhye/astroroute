// Canvas drawing helpers: map, charts, panels. Owner: Ayush.
// No chart library: everything here is plain Canvas 2D and DOM.

export const COLORS = {
  bg: "#05070D", panel: "#0B1020", line: "#1C2540", text: "#E6EDF3", muted: "#8B95A7",
  accent: "#7FD1FF", amber: "#FFB547", red: "#FF6B6B", green: "#69D39A",
};
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

// Newest-wins guard for overlapping async loads: each call starts a load and returns an
// isCurrent() check that turns false as soon as a newer load starts, so a slow, superseded
// response can be dropped instead of overwriting the newer one.
export function latestOnly() {
  let seq = 0;
  return () => { const mine = ++seq; return () => mine === seq; };
}

// ---------------------------------------------------------------- canvas basics

// Match the backing store to the CSS size (crisp on HiDPI). Returns ctx in CSS pixels.
export function fitCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(canvas.clientWidth)), h = Math.max(1, Math.round(canvas.clientHeight));
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

const hexRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const mix = (c1, c2, t) => {
  const a = hexRgb(c1), b = hexRgb(c2);
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
};
export const rgba = (hex, alpha) => `rgba(${hexRgb(hex).join(",")},${alpha})`;

// SNR -> red (at the blocking threshold) .. amber .. green (comfortable).
export function snrColor(snrDb, alpha = 1, lo = 6, hi = 24) {
  const t = Math.min(1, Math.max(0, (snrDb - lo) / (hi - lo)));
  const c = t < 0.5 ? mix(COLORS.red, COLORS.amber, t * 2) : mix(COLORS.amber, COLORS.green, (t - 0.5) * 2);
  return `rgba(${c.join(",")},${alpha})`;
}

// Deterministic per-id RNG so debris particle clouds keep their shape between frames.
function seeded(str) {
  let s = 2166136261;
  for (const ch of String(str)) s = Math.imul(s ^ ch.charCodeAt(0), 16777619);
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const particleCache = new Map();
function particles(d) {
  if (!particleCache.has(d.id)) {
    const r = seeded(d.id), n = d.kind === "comet" ? 26 : 46;
    // use the sim's own particle offsets (AU from the centre) when it provides them
    particleCache.set(d.id, d.particles?.length
      ? d.particles.map((p) => ({ a: Math.atan2(-p.dy, p.dx), d: Math.hypot(p.dx, p.dy) / d.r, s: 0.6 + r() * 1.6, w: (r() - 0.5) * 0.6 }))
      : Array.from({ length: n }, () => ({ a: r() * Math.PI * 2, d: Math.sqrt(r()) * 0.55, s: 0.6 + r() * 1.6, w: (r() - 0.5) * 0.6 })));
  }
  return particleCache.get(d.id);
}

// ---------------------------------------------------------------- charts

function niceTicks(lo, hi, n = 4) {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / n, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) || mag * 10;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toPrecision(12));
  return out;
}
const fmtTick = (v) => {
  const a = Math.abs(v);
  if (a !== 0 && (a < 0.01 || a >= 1e4)) return v.toExponential(0);
  return a < 1 ? v.toFixed(a < 0.1 ? 3 : 2).replace(/0+$/, "").replace(/\.$/, "") : String(+v.toFixed(2));
};

// Generic chart: axes with ticks + labels, scatter/line series, vertical markers.
// series: [{type: "scatter"|"line", x, y, color, size, width, alpha}]
// marks:  [{x, color, dash, label}]
export function drawChart(canvas, { xRange, yRange, xLabel = "", yLabel = "", series = [], marks = [], empty = "" }) {
  const { ctx, w, h } = fitCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  const pad = { l: 40, r: 8, t: 8, b: 26 };
  const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
  const [x0, x1] = xRange, [y0, y1] = yRange;
  const X = (v) => pad.l + ((v - x0) / (x1 - x0 || 1)) * pw;
  const Y = (v) => pad.t + (1 - (v - y0) / (y1 - y0 || 1)) * ph;

  ctx.font = `10px ${MONO}`;
  ctx.lineWidth = 1;
  ctx.strokeStyle = COLORS.line; ctx.fillStyle = COLORS.muted;
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  for (const t of niceTicks(x0, x1, Math.max(2, Math.floor(pw / 60)))) {
    const x = Math.round(X(t)) + 0.5;
    ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + ph); ctx.stroke();
    ctx.fillText(fmtTick(t), x, pad.t + ph + 3);
  }
  ctx.textAlign = "right"; ctx.textBaseline = "middle";
  for (const t of niceTicks(y0, y1, Math.max(2, Math.floor(ph / 28)))) {
    const y = Math.round(Y(t)) + 0.5;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + pw, y); ctx.stroke();
    ctx.fillText(fmtTick(t), pad.l - 4, y);
  }
  ctx.strokeStyle = "#2D3A60";
  ctx.strokeRect(pad.l + 0.5, pad.t + 0.5, pw, ph);

  ctx.font = `10px ${SANS}`;
  ctx.textAlign = "right"; ctx.textBaseline = "bottom";
  ctx.fillText(xLabel, pad.l + pw, h - 1);
  if (yLabel) {
    ctx.save(); ctx.translate(9, pad.t + ph / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(yLabel, 0, 0); ctx.restore();
  }

  ctx.save();
  ctx.beginPath(); ctx.rect(pad.l, pad.t, pw, ph); ctx.clip();
  for (const s of series) {
    const n = Math.min(s.x.length, s.y.length);
    ctx.globalAlpha = s.alpha ?? 1;
    if (s.type === "line") {
      ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 1.2; ctx.beginPath();
      let pen = false;
      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(s.y[i])) { pen = false; continue; }
        const x = X(s.x[i]), y = Y(s.y[i]);
        if (pen) ctx.lineTo(x, y); else { ctx.moveTo(x, y); pen = true; }
      }
      ctx.stroke();
    } else {
      ctx.fillStyle = s.color;
      const r = s.size || 1.4;
      for (let i = 0; i < n; i++) ctx.fillRect(X(s.x[i]) - r / 2, Y(s.y[i]) - r / 2, r, r);
    }
  }
  ctx.globalAlpha = 1;
  for (const m of marks) {
    if (!Number.isFinite(m.x) || m.x < x0 || m.x > x1) continue;
    const x = Math.round(X(m.x)) + 0.5;
    ctx.strokeStyle = m.color; ctx.lineWidth = 1; ctx.setLineDash(m.dash || []);
    ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + ph); ctx.stroke(); ctx.setLineDash([]);
    if (m.label) {
      ctx.fillStyle = m.color; ctx.font = `10px ${MONO}`; ctx.textBaseline = "top";
      const right = x > pad.l + pw - 70;
      ctx.textAlign = right ? "right" : "left";
      ctx.fillText(m.label, x + (right ? -3 : 3), pad.t + 2 + (m.row || 0) * 11);
    }
  }
  ctx.restore();

  if (empty) {
    ctx.fillStyle = COLORS.muted; ctx.font = `11px ${SANS}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(empty, pad.l + pw / 2, pad.t + ph / 2);
  }
}

// ---------------------------------------------------------------- network map

// World (AU) <-> screen transform fitted to the box around all nodes and the Sun, so a long,
// flat relay chain uses the full width of the panel.
export function mapTransform(w, h, nodes) {
  const xs = [0, ...nodes.map((n) => n.x)], ys = [0, ...nodes.map((n) => n.y)];
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const pad = 0.5 + 0.08 * Math.max(x1 - x0, y1 - y0);
  const scale = Math.min(w / (x1 - x0 + 2 * pad), h / (y1 - y0 + 2 * pad));
  const cx = w / 2 - ((x0 + x1) / 2) * scale, cy = h / 2 + ((y0 + y1) / 2) * scale;
  return {
    scale,
    toScreen: (x, y) => [cx + x * scale, cy - y * scale],
    toWorld: (sx, sy) => [(sx - cx) / scale, -(sy - cy) / scale],
  };
}

const NODE_STYLE = {
  earth: { color: "#4FA3FF", r: 7 },
  relay: { color: COLORS.text, r: 4 },
  observatory: { color: "#C9A7FF", r: 6 },
};

function strokePath(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
}

// state: {snap, links, best, alt, packets:[{x,y}], buffered, timeSec, armed, hover:[sx,sy]|null, srcId}
export function drawMap(canvas, state) {
  const { ctx, w, h } = fitCanvas(canvas);
  const { snap, links = [], best, alt, packets = [], buffered = 0, timeSec = 0 } = state;
  ctx.fillStyle = COLORS.bg; ctx.fillRect(0, 0, w, h);
  if (!snap) return null;
  const T = mapTransform(w, h, snap.nodes);
  const S = (n) => T.toScreen(n.x, n.y);
  const byId = new Map(snap.nodes.map((n) => [n.id, n]));

  // starfield (stable, cheap)
  const rnd = seeded("stars");
  ctx.fillStyle = "rgba(230,237,243,0.35)";
  for (let i = 0; i < 140; i++) ctx.fillRect(rnd() * w, rnd() * h, rnd() < 0.1 ? 1.5 : 1, rnd() < 0.1 ? 1.5 : 1);

  // orbits
  const [sx0, sy0] = T.toScreen(0, 0);
  const radii = [...new Set(snap.nodes.map((n) => Math.hypot(n.x, n.y).toFixed(2)))];
  ctx.strokeStyle = "rgba(139,149,167,0.13)"; ctx.lineWidth = 1;
  for (const r of radii) { ctx.beginPath(); ctx.arc(sx0, sy0, +r * T.scale, 0, Math.PI * 2); ctx.stroke(); }

  // sun
  const sunR = Math.max(6, T.scale * 0.06);
  const g = ctx.createRadialGradient(sx0, sy0, 0, sx0, sy0, sunR * 4);
  g.addColorStop(0, "rgba(255,214,120,0.9)"); g.addColorStop(0.25, "rgba(255,181,71,0.35)"); g.addColorStop(1, "rgba(255,181,71,0)");
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx0, sy0, sunR * 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#FFE3A3"; ctx.beginPath(); ctx.arc(sx0, sy0, sunR, 0, Math.PI * 2); ctx.fill();

  // debris jamming halos + particle clouds
  for (const d of snap.debris || []) {
    const [dx, dy] = T.toScreen(d.x, d.y), rr = d.r * T.scale;
    const halo = ctx.createRadialGradient(dx, dy, 0, dx, dy, rr);
    halo.addColorStop(0, rgba(COLORS.red, 0.28)); halo.addColorStop(0.7, rgba(COLORS.red, 0.1)); halo.addColorStop(1, rgba(COLORS.red, 0));
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(dx, dy, rr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = rgba(COLORS.red, 0.35); ctx.setLineDash([2, 4]);
    ctx.beginPath(); ctx.arc(dx, dy, rr, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    const spin = timeSec * 0.15;
    if (d.kind === "comet") {
      const v = Math.hypot(d.vx || 0, d.vy || 0) || 1;
      const ux = -(d.vx || 0) / v, uy = (d.vy || 0) / v; // tail points away from motion (screen y flipped)
      const tail = ctx.createLinearGradient(dx, dy, dx + ux * rr * 1.8, dy + uy * rr * 1.8);
      tail.addColorStop(0, "rgba(200,230,255,0.55)"); tail.addColorStop(1, "rgba(200,230,255,0)");
      ctx.strokeStyle = tail; ctx.lineWidth = Math.max(3, rr * 0.25); ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(dx + ux * rr * 1.8, dy + uy * rr * 1.8); ctx.stroke();
      ctx.lineCap = "butt"; ctx.lineWidth = 1;
      ctx.fillStyle = "#EAF6FF"; ctx.beginPath(); ctx.arc(dx, dy, 3.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = d.kind === "comet" ? "rgba(220,240,255,0.75)" : "rgba(196,170,140,0.85)";
    for (const p of particles(d)) {
      const a = p.a + spin * (1 + p.w);
      ctx.fillRect(dx + Math.cos(a) * p.d * rr, dy + Math.sin(a) * p.d * rr, p.s, p.s);
    }
    if (d.label) {
      ctx.fillStyle = rgba(COLORS.red, 0.9); ctx.font = `10px ${MONO}`; ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.fillText(d.label, dx, dy + rr + 3);
    }
  }

  // all links, faint, coloured by SNR; blocked links hidden, links forecast to be jammed
  // (predictive routing) thin dotted red
  ctx.lineWidth = 1;
  for (const l of links) {
    if (l.blocked && !l.forecastBlocked) continue;
    const a = byId.get(l.a), b = byId.get(l.b);
    if (!a || !b) continue;
    if (l.forecastBlocked) { ctx.strokeStyle = rgba(COLORS.red, 0.75); ctx.setLineDash([2, 4]); }
    else ctx.strokeStyle = snrColor(l.snrDb, 0.22);
    strokePath(ctx, [S(a), S(b)]);
    ctx.setLineDash([]);
  }

  // alternate path: dashed amber
  if (alt) {
    ctx.strokeStyle = COLORS.amber; ctx.lineWidth = 2; ctx.setLineDash([7, 6]);
    strokePath(ctx, alt.nodes.map((id) => S(byId.get(id))));
    ctx.setLineDash([]);
  }
  // best path: thick cyan with glow
  if (best) {
    const pts = best.nodes.map((id) => S(byId.get(id)));
    ctx.strokeStyle = rgba(COLORS.accent, 0.18); ctx.lineWidth = 9; strokePath(ctx, pts);
    ctx.strokeStyle = COLORS.accent; ctx.lineWidth = 3; strokePath(ctx, pts);
  }
  ctx.lineWidth = 1;

  // packets
  for (const p of packets) {
    const [px, py] = T.toScreen(p.x, p.y);
    ctx.fillStyle = rgba(COLORS.accent, 0.25); ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = p.held ? COLORS.amber : "#E8F7FF"; ctx.beginPath(); ctx.arc(px, py, 2.6, 0, Math.PI * 2); ctx.fill();
  }

  // nodes, then labels placed greedily so a tight relay chain stays readable
  ctx.font = `11px ${SANS}`; ctx.textBaseline = "middle";
  const onPath = new Set(best ? best.nodes : []);
  const boxes = snap.nodes.map((n) => { const [x, y] = S(n); return [x - 6, y - 6, x + 6, y + 6]; });
  const hit = (b) => boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
  for (const n of snap.nodes) {
    const [x, y] = S(n), st = NODE_STYLE[n.kind] || NODE_STYLE.relay;
    if (n.kind === "relay") {
      ctx.fillStyle = onPath.has(n.id) ? COLORS.accent : st.color;
      ctx.beginPath(); ctx.moveTo(x, y - st.r - 1); ctx.lineTo(x + st.r + 1, y); ctx.lineTo(x, y + st.r + 1); ctx.lineTo(x - st.r - 1, y); ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = rgba(st.color, 0.25); ctx.beginPath(); ctx.arc(x, y, st.r + 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = st.color; ctx.beginPath(); ctx.arc(x, y, st.r, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.textAlign = "left";
  for (const n of snap.nodes) {
    const [x, y] = S(n), st = NODE_STYLE[n.kind] || NODE_STYLE.relay;
    const txt = n.name || n.id, tw = ctx.measureText(txt).width, g = st.r + 6;
    const spots = [[x + g, y], [x - g - tw, y], [x - tw / 2, y - g - 2], [x - tw / 2, y + g + 2],
      [x + g - 4, y - 13], [x + g - 4, y + 13], [x - g - tw + 4, y - 13], [x - g - tw + 4, y + 13]];
    const box = ([lx, ly]) => [lx - 1, ly - 7, lx + tw + 1, ly + 7];
    const at = spots.find((s) => !hit(box(s))) || spots[0];
    boxes.push(box(at));
    ctx.fillStyle = "rgba(5,7,13,0.6)"; ctx.fillRect(at[0] - 2, at[1] - 7, tw + 4, 14);
    ctx.fillStyle = COLORS.text; ctx.fillText(txt, at[0], at[1]);
  }

  // buffered badge at the source
  const src = byId.get(state.srcId);
  if (src && buffered > 0) {
    const [x, y] = S(src), txt = `${buffered} buffered`;
    ctx.font = `bold 11px ${MONO}`;
    const tw = ctx.measureText(txt).width + 12;
    ctx.fillStyle = rgba(COLORS.red, 0.15); ctx.strokeStyle = COLORS.red;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - tw / 2, y + 14, tw, 18, 9) : ctx.rect(x - tw / 2, y + 14, tw, 18);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = COLORS.red; ctx.textAlign = "center"; ctx.fillText(txt, x, y + 23);
  }

  // armed tool: preview of the jamming disc under the cursor
  if (state.armed && state.hover) {
    const [hx, hy] = state.hover, rr = (state.armed === "comet" ? 0.25 : 0.34) * T.scale;
    ctx.strokeStyle = rgba(COLORS.red, 0.8); ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.arc(hx, hy, rr, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  }
  return T;
}

// ---------------------------------------------------------------- panels (DOM)

const $ = (id) => document.getElementById(id);
const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : "—");

export function renderRoute({ best, alt, status, reroutes, forced = 0, nameOf }) {
  const pill = $("link-pill");
  const label = { up: "LINK UP", rerouted: "REROUTED", down: "LINK DOWN - buffering" }[status];
  if (pill.textContent !== label) { pill.textContent = label; pill.className = `pill ${status}`; }
  const path = $("route-path");
  path.textContent = best ? best.nodes.map(nameOf).join("  →  ") : "no route to Earth";
  path.title = path.textContent;
  $("st-latency").textContent = best ? fmt(best.latencyMin) : "—";
  $("st-tput").textContent = best && Number.isFinite(best.capacityMbps) ? fmt(best.capacityMbps) : "—";
  $("st-hops").textContent = best ? String(best.nodes.length - 1) : "—";
  $("st-snr").textContent = best ? fmt(best.minSnrDb) : "—";
  $("st-reroutes").textContent = String(reroutes);
  $("st-reroutes-k").textContent = `reroutes · ${forced} forced`;
  $("alt-line").textContent = alt
    ? `alternate${alt.independent ? " (independent)" : ""}: ${alt.nodes.map(nameOf).join(" → ")} · ${fmt(alt.latencyMin)} min`
    : "alternate: none available";
}

export function renderLog(events) {
  const ol = $("log");
  $("log-count").textContent = String(events.length);
  if (!events.length) { ol.innerHTML = '<li class="log-empty">No events yet - press Play.</li>'; return; }
  ol.replaceChildren(...events.slice(0, 60).map((e) => {
    const li = document.createElement("li");
    if (e.level) li.className = e.level;
    const t = document.createElement("time"); t.textContent = e.stamp;
    const dot = document.createElement("span"); dot.className = `lvl ${e.level || ""}`;
    const msg = document.createElement("span"); msg.textContent = e.text;
    li.append(t, dot, msg);
    return li;
  }));
}

export function renderProgress(received, total) {
  $("recv-bar").style.width = `${total ? (100 * received) / total : 0}%`;
  $("recv-text").textContent = `received ${received.toLocaleString()} of ${total.toLocaleString()} points`;
}

const VERDICT_CLASS = {
  "PLANET CANDIDATE": "good", "LIKELY FALSE POSITIVE": "bad",
  "NEED MORE DATA": "warn", "NO CONVINCING SIGNAL": "",
};

// ---------------------------------------------------------------- heatmap overlay

// Signal-attenuation heatmap over the map. attFn(x, y) -> jamming dB at world (x, y); T.toWorld
// maps a screen point to world. Sampled once per gridStep-pixel cell into a small image, then
// scaled up with smoothing so it reads as a field: amber where jamming starts, red where it
// would block a link.
const heatBuf = typeof document !== "undefined" ? document.createElement("canvas") : null;
export function drawHeatmap(canvas, T, attFn, gridStep = 28) {
  const { ctx, w, h } = fitCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  const cols = Math.ceil(w / gridStep), rows = Math.ceil(h / gridStep);
  heatBuf.width = cols; heatBuf.height = rows;
  const bctx = heatBuf.getContext("2d"), img = bctx.createImageData(cols, rows);
  const [ar, ag, ab] = hexRgb(COLORS.amber), [rr, rg, rb] = hexRgb(COLORS.red);
  let any = false;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const [wx, wy] = T.toWorld((i + 0.5) * gridStep, (j + 0.5) * gridStep);
    const db = attFn(wx, wy);
    if (!(db > 0.5)) continue;
    any = true;
    const t = Math.min(1, db / 24), k = (j * cols + i) * 4;
    img.data[k] = ar + (rr - ar) * t; img.data[k + 1] = ag + (rg - ag) * t; img.data[k + 2] = ab + (rb - ab) * t;
    img.data[k + 3] = 255 * Math.min(0.5, 0.12 + db / 60);
  }
  if (!any) return;
  bctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.drawImage(heatBuf, 0, 0, cols * gridStep, rows * gridStep);
}

// ---------------------------------------------------------------- hop-threat bars

// Render per-hop SNR threat indicator as colored mini-bars inside `el`.
export function renderHopThreats(el, best, links, nameOf) {
  if (!best || !links) { el.innerHTML = ""; return; }
  const idx = new Map(links.map(l => [`${l.a}|${l.b}`, l]).concat(links.map(l => [`${l.b}|${l.a}`, l])));
  const items = [];
  for (let i = 0; i + 1 < best.nodes.length; i++) {
    const a = best.nodes[i], b = best.nodes[i + 1];
    const l = idx.get(`${a}|${b}`);
    if (!l) continue;
    const snr = l.snrDb ?? 999;
    const blocked = l.blocked;
    const forecast = l.forecastBlocked;
    const level = blocked ? "blocked" : forecast ? "forecast" : snr < 9 ? "critical" : snr < 18 ? "warn" : "ok";
    items.push(`<div class="hop-bar">` +
      `<span class="hop-name">${nameOf(a)} → ${nameOf(b)}</span>` +
      `<span class="hop-snr ${level}">${blocked ? "JAMMED" : forecast ? "~JAM" : snr.toFixed(1) + " dB"}</span>` +
      `<div class="hop-fill ${level}" style="width:${Math.min(100, Math.max(0, snr / 40 * 100)).toFixed(0)}%"></div>` +
      `</div>`);
  }
  el.innerHTML = items.join("");
}

// ---------------------------------------------------------------- transit windows

export function renderTransitWindows(el, periodEl, windows, period, snapT) {
  if (period > 0) periodEl.textContent = `P = ${period.toFixed(4)} d`;
  if (!windows || !windows.length) {
    el.innerHTML = '<div class="muted" style="padding:6px 0;font-size:11px">No detection yet.</div>';
    return;
  }
  const fmtHours = (h) => {
    if (h < 24) return `${h.toFixed(1)} h`;
    const d = Math.floor(h / 24), rem = h % 24;
    return `${d}d ${rem.toFixed(0)}h`;
  };
  el.innerHTML = windows.slice(0, 5).map((w, i) => {
    const urgent = w.hoursFromNow < 48;
    const obs = w.hoursFromNow < 2;
    return `<div class="transit-row${obs ? " transit-now" : urgent ? " transit-soon" : ""}">` +
      `<span class="transit-ep">#${w.epochIndex}</span>` +
      `<span class="transit-time">${obs ? "▶ OBSERVABLE NOW" : "in " + fmtHours(w.hoursFromNow)}</span>` +
      `<span class="transit-dur muted">(dur ${fmtHours(w.durationDays * 24)})</span>` +
      `</div>`;
  }).join("");
}

export function renderVerdict(result, sub = "") {
  const box = $("verdict"), v = result?.verdict || "WAITING FOR DATA";
  box.className = `verdict ${VERDICT_CLASS[v] ?? ""}`;
  $("verdict-v").textContent = v;
  $("verdict-sub").textContent = sub;
  const ul = $("checks");
  ul.replaceChildren(...(result?.checks || []).map((c) => {
    const li = document.createElement("li");
    const mark = document.createElement("span");
    mark.className = `mark ${c.passed ? "ok" : "no"}`; mark.textContent = c.passed ? "✓" : "✗";
    const body = document.createElement("span");
    const name = document.createElement("span"); name.className = "name"; name.textContent = c.name;
    const det = document.createElement("span"); det.className = "detail"; det.textContent = ` - ${c.detail}`;
    body.append(name, det);
    li.append(mark, body);
    return li;
  }));
}
