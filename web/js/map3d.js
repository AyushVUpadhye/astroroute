// 3-D solar-system map — Three.js renderer.
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

const NODE_COLOR = { earth: 0x4fa3ff, observatory: 0xc9a7ff, relay: 0x7fb8d4 };
const NODE_R     = { earth: 0.095, observatory: 0.088, relay: 0.054 };
const NODE_GLOW  = { earth: 0.26,  observatory: 0.22,  relay: 0.16 };
const NODE_EMIT  = { earth: 1.2,   observatory: 1.4,   relay: 0.55 };
const Z_OFFSET   = { sun: 0, earth: 0.06, observatory: 0.14, relay: 0.04 };

// Camera orbit params
const CAM_R = 6.8, CAM_Y = 5.4, CAM_ORBIT_SPEED = 0.018; // rad/s

function auToWorld(n) {
  return new THREE.Vector3(n.x, Z_OFFSET[n.kind] ?? 0.04, -n.y);
}

function nodeColor(kind) { return new THREE.Color(NODE_COLOR[kind] ?? 0x7fb8d4); }

export class Map3D {
  constructor(canvas) {
    this._canvas = canvas;
    this._debrisMeshes = [];
    this._packetMeshes = [];
    this._labelEls = [];
    this._mouse = new THREE.Vector2(0, 0);
    this._raycaster = new THREE.Raycaster();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._orbitAngle = Math.PI * 0.55;
    this._userDrag = false;
    this._dragLast = null;
    this._pulseLine = null;
    this._pulseMarker = null;
    this._focus = new THREE.Vector3(0, 0, 0); // camera target: centre of the network
    this._extent = 4.6;                        // network radius around _focus (AU)
    this._reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

    this._initRenderer();
    this._initScene();
    this._initLabels();
    this._bindResize();
    this._bindDrag();
    this.renderer.setAnimationLoop(t => this._frame(t));
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this._canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x030508, 1);
    this.renderer.shadowMap.enabled = false;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x030508, 0.012);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 140);
    this._updateCamera();
  }

  _updateCamera() {
    const mx = this._mouse.x * 0.14, my = this._mouse.y * 0.07;
    this.camera.position.set(
      Math.sin(this._orbitAngle) * CAM_R + mx,
      CAM_Y + my,
      Math.cos(this._orbitAngle) * CAM_R
    );
    this.camera.lookAt(0, 0, 0);
  }

  _initScene() {
    this.scene.add(new THREE.AmbientLight(0x0a1830, 4));
    const sunLight = new THREE.PointLight(0xffd580, 4, 28, 1.4);
    sunLight.position.set(0, 0.3, 0);
    this.scene.add(sunLight);

    // Stars — 3 layers
    for (const [n, rMin, rMax, sz, col, op] of [
      [2400, 18, 55, 0.05,  0xeef8ff, 0.9],
      [700,  12, 18, 0.095, 0xc8e4ff, 0.8],
      [200,  9,  12, 0.14,  0xfff0e8, 0.7],
    ]) {
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const r = rMin + Math.random() * (rMax - rMin);
        const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
        pos[i*3]   = r * Math.sin(ph) * Math.cos(th);
        pos[i*3+1] = r * Math.sin(ph) * Math.sin(th);
        pos[i*3+2] = r * Math.cos(ph);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: col, size: sz, sizeAttenuation: true, transparent: true, opacity: op })));
    }

    // Sun core + corona
    const sunGeo = new THREE.SphereGeometry(0.17, 28, 28);
    this._sunMesh = new THREE.Mesh(sunGeo,
      new THREE.MeshStandardMaterial({ color: 0xffe8a3, emissive: 0xffd060, emissiveIntensity: 4, roughness: 0.05 }));
    this.scene.add(this._sunMesh);
    this._sunHalos = [];
    for (const [r, op, col] of [[0.30, 0.14, 0xffa030],[0.52, 0.06, 0xff6010],[0.82, 0.028, 0xff3000],[1.2, 0.012, 0xff2000]]) {
      const h = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 16),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, side: THREE.BackSide }));
      this.scene.add(h);
      this._sunHalos.push(h);
    }

    // Ecliptic grid
    this._buildGrid();

    this._staticGroup = new THREE.Group();
    this._dynamicGroup = new THREE.Group();
    this.scene.add(this._staticGroup, this._dynamicGroup);
  }

  _buildGrid() {
    const GRID_R = 4.2, RINGS = 8, SPOKES = 24;
    const pts = [];
    // Concentric rings
    for (let ri = 1; ri <= RINGS; ri++) {
      const r = (ri / RINGS) * GRID_R;
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2;
        pts.push(Math.cos(a) * r, 0, Math.sin(a) * r);
        if (i > 0) pts.push(Math.cos(a) * r, 0, Math.sin(a) * r); // line segment pairs
      }
    }
    // Spokes
    for (let s = 0; s < SPOKES; s++) {
      const a = (s / SPOKES) * Math.PI * 2;
      pts.push(0, 0, 0, Math.cos(a) * GRID_R, 0, Math.sin(a) * GRID_R);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
    const mat = new THREE.LineBasicMaterial({ color: 0x0d2040, transparent: true, opacity: 0.45 });
    this.scene.add(new THREE.LineSegments(geo, mat));
  }

  _initLabels() {
    // Overlay container for HTML node labels
    const wrap = this._canvas.parentElement;
    this._labelContainer = document.createElement('div');
    this._labelContainer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
    wrap.appendChild(this._labelContainer);
  }

  _bindResize() {
    const obs = new ResizeObserver(() => this._resize());
    obs.observe(this._canvas);
    this._resize();
  }

  _resize() {
    const w = this._canvas.clientWidth, h = this._canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _bindDrag() {
    // Pointer events so a finger rotates the view as well as a mouse.
    this._canvas.addEventListener('pointerdown', e => { this._userDrag = true; this._dragLast = e.clientX; });
    window.addEventListener('pointerup', () => { this._userDrag = false; this._dragLast = null; });
    window.addEventListener('pointercancel', () => { this._userDrag = false; this._dragLast = null; });
    window.addEventListener('pointermove', e => {
      if (this._userDrag && this._dragLast != null) {
        this._orbitAngle -= (e.clientX - this._dragLast) * 0.004;
        this._dragLast = e.clientX;
      }
    });
  }

  update({ snap, links = [], best, alt, packets = [], buffered = 0, srcId, timeSec = 0 }) {
    this._frameNetwork(snap.nodes);
    this._snap = snap;
    this._links = links;
    this._best = best;
    this._alt = alt;
    this._buffered = buffered;
    this._srcId = srcId;
    this._simTimeSec = timeSec;
    this._lastPackets = packets;
    this._rebuild();
    // _rebuild() recreates the label elements; place them now, or the browser paints them
    // unpositioned (off-screen) before the next animation frame moves them.
    this._updateLabels();
  }

  _rebuild() {
    // Clear dynamic group
    while (this._dynamicGroup.children.length) {
      const c = this._dynamicGroup.children[0];
      c.geometry?.dispose(); c.material?.dispose?.();
      this._dynamicGroup.remove(c);
    }
    this._debrisMeshes = [];
    this._pulseLine = null;

    // Clear old packet meshes
    for (const c of this._packetMeshes) {
      this._dynamicGroup.remove(c);
      c.geometry?.dispose(); c.material?.dispose?.();
    }
    this._packetMeshes = [];

    // Clear HTML labels
    this._labelContainer.innerHTML = '';
    this._labelEls = [];

    const snap = this._snap;
    if (!snap) return;

    const byId = new Map(snap.nodes.map(n => [n.id, n]));
    const onPath = new Set(this._best?.nodes ?? []);
    const routeSet = new Set();
    if (this._best) for (let i = 1; i < this._best.nodes.length; i++) {
      routeSet.add(`${this._best.nodes[i-1]}|${this._best.nodes[i]}`);
      routeSet.add(`${this._best.nodes[i]}|${this._best.nodes[i-1]}`);
    }

    // Orbit rings
    const seen = new Set();
    for (const n of snap.nodes) {
      const r = +Math.hypot(n.x, n.y).toFixed(3);
      if (r < 0.05 || seen.has(r)) continue;
      seen.add(r);
      const geo = new THREE.RingGeometry(r - 0.009, r + 0.009, 160);
      const mat = new THREE.MeshBasicMaterial({
        color: onPath.has(n.id) ? 0x1a4070 : 0x0d1e35,
        side: THREE.DoubleSide, transparent: true, opacity: onPath.has(n.id) ? 0.55 : 0.28
      });
      const ring = new THREE.Mesh(geo, mat);
      ring.rotation.x = -Math.PI / 2;
      this._dynamicGroup.add(ring);
    }

    // Background links (SNR-colored)
    for (const l of this._links) {
      if (routeSet.has(`${l.a}|${l.b}`)) continue;
      const a = byId.get(l.a), b = byId.get(l.b);
      if (!a || !b) continue;
      const snr = l.snrDb ?? 30;
      const t = Math.min(1, Math.max(0, (snr - 6) / 22));
      const color = new THREE.Color().setHSL(t * 0.33, 0.8, 0.35);
      const pts = [auToWorld(a), auToWorld(b)];
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: l.blocked ? 0 : (l.forecastBlocked ? 0.12 : 0.22) });
      this._dynamicGroup.add(new THREE.Line(geo, mat));
      // Blocked overlay (red)
      if (l.blocked) {
        const bm = new THREE.LineBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.35, linewidth: 2 });
        this._dynamicGroup.add(new THREE.Line(geo.clone(), bm));
      }
    }

    // Alternate path — amber dashes
    if (this._alt) {
      const pts = this._alt.nodes.map(id => byId.get(id)).filter(Boolean).map(auToWorld);
      for (const [col, op] of [[0xffb547, 0.6],[0xffcc88, 0.22]]) {
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineDashedMaterial({ color: col, dashSize: 0.14, gapSize: 0.09, transparent: true, opacity: op });
        const line = new THREE.Line(geo, mat); line.computeLineDistances();
        this._dynamicGroup.add(line);
      }
    }

    // Best path — 5-layer glow
    if (this._best) {
      const pts = this._best.nodes.map(id => byId.get(id)).filter(Boolean).map(n => {
        const v = auToWorld(n); v.y += 0.015; return v;
      });
      for (const [col, op, w] of [
        [0x002244, 1.0, 1], [0x0044aa, 0.12, 1], [0x1a88ff, 0.28, 1],
        [0x7fd1ff, 0.65, 1], [0xffffff, 1.0, 1],
      ]) {
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({ color: col, transparent: op < 1, opacity: op });
        this._dynamicGroup.add(new THREE.Line(geo, mat));
      }
      this._pulseLine = { pts, progress: 0 };

      // Traveling pulse marker
      const pmGeo = new THREE.SphereGeometry(0.048, 10, 10);
      const pmMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      this._pulseMarker = new THREE.Mesh(pmGeo, pmMat);
      this._dynamicGroup.add(this._pulseMarker);
      // Pulse glow
      const pgGeo = new THREE.SphereGeometry(0.13, 10, 10);
      const pgMat = new THREE.MeshBasicMaterial({ color: 0x7fd1ff, transparent: true, opacity: 0.35, side: THREE.BackSide });
      this._pulseGlow = new THREE.Mesh(pgGeo, pgMat);
      this._dynamicGroup.add(this._pulseGlow);
    } else {
      this._pulseMarker = null; this._pulseGlow = null;
    }

    // Nodes
    for (const n of snap.nodes) {
      if (n.kind === 'sun') continue;
      const pos = auToWorld(n);
      const col = NODE_COLOR[n.kind] ?? 0x7fb8d4;
      const r = NODE_R[n.kind] ?? 0.054;
      const active = onPath.has(n.id);
      const emit = (NODE_EMIT[n.kind] ?? 0.55) * (active ? 2.5 : 1);

      // Core
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(r, 24, 24),
        new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: emit, roughness: 0.12, metalness: 0.7 })
      );
      mesh.position.copy(pos);
      this._dynamicGroup.add(mesh);

      // Glow halos — 3 layers
      for (const [rr, op] of [
        [NODE_GLOW[n.kind] ?? 0.16, active ? 0.22 : 0.08],
        [(NODE_GLOW[n.kind] ?? 0.16) * 1.7, active ? 0.08 : 0.025],
        [(NODE_GLOW[n.kind] ?? 0.16) * 2.6, active ? 0.03 : 0.008],
      ]) {
        const hm = new THREE.Mesh(
          new THREE.SphereGeometry(rr, 10, 10),
          new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, side: THREE.BackSide })
        );
        hm.position.copy(pos); this._dynamicGroup.add(hm);
      }

      // Buffered indicator ring
      if (n.id === this._srcId && this._buffered > 0) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(r + 0.07, r + 0.12, 48),
          new THREE.MeshBasicMaterial({ color: 0xff5555, side: THREE.DoubleSide, transparent: true, opacity: 0.75 })
        );
        ring.position.copy(pos); ring.rotation.x = -Math.PI / 2;
        ring.userData.pulse = true;
        this._dynamicGroup.add(ring);
      }

      // HTML label
      this._addLabel(n, pos, active);
    }

    // Debris
    for (const d of snap.debris ?? []) {
      const n = d.kind === 'comet' ? 120 : 260;
      const pos = new Float32Array(n * 3);
      const angles = new Float32Array(n), dists = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const dist = Math.sqrt(Math.random()) * d.r * 0.9;
        angles[i] = a; dists[i] = dist;
        pos[i*3]   = d.x + Math.cos(a) * dist;
        pos[i*3+1] = (Math.random() - 0.5) * 0.05;
        pos[i*3+2] = -(d.y + Math.sin(a) * dist);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const col = d.kind === 'comet' ? 0xd0b0ff : 0xf97316;
      const sz  = d.kind === 'comet' ? 0.035 : 0.026;
      const pts = new THREE.Points(geo,
        new THREE.PointsMaterial({ color: col, size: sz, sizeAttenuation: true, transparent: true, opacity: 0.85 }));
      pts.userData.debris = { d, angles, dists };
      this._dynamicGroup.add(pts);
      this._debrisMeshes.push(pts);

      if (d.kind === 'comet') {
        const nuc = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 10),
          new THREE.MeshStandardMaterial({ color: 0xeee0ff, emissive: 0xc0a0ff, emissiveIntensity: 2 }));
        nuc.position.set(d.x, 0.05, -d.y); this._dynamicGroup.add(nuc);
        // Comet glow
        const cg = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xc090ff, transparent: true, opacity: 0.08, side: THREE.BackSide }));
        cg.position.set(d.x, 0.05, -d.y); this._dynamicGroup.add(cg);
      }
    }
  }

  _addLabel(n, worldPos, active) {
    const el = document.createElement('div');
    el.className = 'node-label' + (active ? ' active' : '');
    el.textContent = n.name || n.id;
    el.style.cssText = 'position:absolute;transform:translate(-50%,-100%);pointer-events:none;white-space:nowrap;';
    this._labelContainer.appendChild(el);
    this._labelEls.push({ el, worldPos: worldPos.clone(), kind: n.kind });
  }

  // Centre on the nodes' bounding box and size it from the farthest node, so the whole relay
  // chain stays on screen however the camera orbits (the Observatory sits at 4.5 AU).
  _frameNetwork(nodes) {
    if (!nodes?.length) return;
    const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    this._focus.set(cx, 0, -cy);
    this._extent = Math.max(1.5, ...nodes.map(n => Math.hypot(n.x - cx, n.y - cy))) + 0.35;
  }

  // Camera distance that fits a disc of radius _extent, seen from the orbit's elevation, inside
  // both the vertical and the horizontal field of view.
  _fitDistance() {
    const vHalf = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * this.camera.aspect);
    const sinElev = CAM_Y / Math.hypot(CAM_R, CAM_Y);
    const R = this._extent;
    return 1.08 * Math.max(R / Math.tan(hHalf), (R * sinElev + 0.3) / Math.tan(vHalf), 3);
  }

  _frame(t) {
    const dt = t * 0.001; // seconds

    // Slow auto-orbit when not dragging (off when the user prefers reduced motion)
    if (!this._userDrag && !this._reduceMotion.matches) this._orbitAngle += CAM_ORBIT_SPEED * (1 / 60);

    // Camera: orbit the network's centre at a distance that keeps every node in view,
    // plus a little mouse parallax
    const k = this._fitDistance() / Math.hypot(CAM_R, CAM_Y);
    const mx = this._mouse.x * 0.14, my = this._mouse.y * 0.07;
    const tx = this._focus.x + Math.sin(this._orbitAngle) * CAM_R * k + mx;
    const tz = this._focus.z + Math.cos(this._orbitAngle) * CAM_R * k;
    const ty = CAM_Y * k + my;
    this.camera.position.x += (tx - this.camera.position.x) * 0.06;
    this.camera.position.y += (ty - this.camera.position.y) * 0.06;
    this.camera.position.z += (tz - this.camera.position.z) * 0.06;
    this.camera.lookAt(this._focus);

    // Sun pulsate
    if (this._sunMesh) {
      const s = 1 + 0.012 * Math.sin(dt * 1.1);
      this._sunMesh.scale.setScalar(s);
      if (this._sunHalos?.[0]) this._sunHalos[0].scale.setScalar(1 + 0.04 * Math.sin(dt * 0.7));
    }

    // Spin debris
    for (const pts of this._debrisMeshes) {
      const { d, angles, dists } = pts.userData.debris;
      const arr = pts.geometry.attributes.position.array;
      const spin = dt * (d.kind === 'comet' ? 0.18 : 0.07);
      for (let i = 0, n = dists.length; i < n; i++) {
        const a = angles[i] + spin;
        arr[i*3]   = d.x + Math.cos(a) * dists[i];
        arr[i*3+2] = -(d.y + Math.sin(a) * dists[i]);
      }
      pts.geometry.attributes.position.needsUpdate = true;
    }

    // Pulse rings
    for (const c of this._dynamicGroup.children) {
      if (c.userData.pulse) {
        c.material.opacity = 0.4 + 0.35 * Math.sin(dt * 5);
        c.scale.setScalar(1 + 0.15 * Math.abs(Math.sin(dt * 2.5)));
      }
    }

    // Traveling pulse marker along best route
    if (this._pulseLine && this._pulseMarker) {
      const { pts } = this._pulseLine;
      // Total path length
      let total = 0;
      for (let i = 1; i < pts.length; i++) total += pts[i].distanceTo(pts[i-1]);
      // Speed: traverse full route in ~3s
      this._pulseLine.progress = (this._pulseLine.progress + (total / 3) * (1/60)) % total;
      // Position on path
      let rem = this._pulseLine.progress, pos = pts[0].clone();
      for (let i = 1; i < pts.length; i++) {
        const seg = pts[i].distanceTo(pts[i-1]);
        if (rem <= seg) { pos = pts[i-1].clone().lerp(pts[i], rem / seg); break; }
        rem -= seg;
      }
      this._pulseMarker.position.copy(pos);
      this._pulseGlow.position.copy(pos);
      const pulse = 0.8 + 0.2 * Math.sin(dt * 8);
      this._pulseMarker.scale.setScalar(pulse);
      this._pulseGlow.scale.setScalar(pulse * 1.2);
    }

    // Rebuild packets each frame
    for (const c of this._packetMeshes) {
      this._dynamicGroup.remove(c);
      c.geometry?.dispose(); c.material?.dispose?.();
    }
    this._packetMeshes = [];
    for (const p of this._lastPackets ?? []) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      const pos = new THREE.Vector3(p.x, 0.09, -p.y);
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8),
        new THREE.MeshBasicMaterial({ color: p.held ? 0xffb547 : 0xeafaff }));
      mesh.position.copy(pos); this._dynamicGroup.add(mesh); this._packetMeshes.push(mesh);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.072, 8, 8),
        new THREE.MeshBasicMaterial({ color: p.held ? 0xffcc80 : 0x7fd1ff, transparent: true, opacity: 0.28, side: THREE.BackSide }));
      glow.position.copy(pos); this._dynamicGroup.add(glow); this._packetMeshes.push(glow);
    }

    // Update HTML labels
    this._updateLabels();

    this.renderer.render(this.scene, this.camera);
  }

  _updateLabels() {
    const w = this._canvas.clientWidth, h = this._canvas.clientHeight;
    const tmp = new THREE.Vector3();
    for (const { el, worldPos } of this._labelEls) {
      tmp.copy(worldPos).project(this.camera);
      const x = (tmp.x * 0.5 + 0.5) * w;
      const y = (-tmp.y * 0.5 + 0.5) * h;
      // Hide if behind camera
      if (tmp.z > 1) { el.style.display = 'none'; continue; }
      el.style.display = '';
      el.style.left = x + 'px';
      el.style.top  = (y - 10) + 'px';
    }
  }

  onMouseMove(clientX, clientY) {
    const r = this._canvas.getBoundingClientRect();
    this._mouse.x = ((clientX - r.left) / r.width)  *  2 - 1;
    this._mouse.y = -((clientY - r.top)  / r.height) * 2 + 1;
  }

  toWorld(sx, sy) {
    const r = this._canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(sx / r.width * 2 - 1, -(sy / r.height) * 2 + 1);
    this._raycaster.setFromCamera(ndc, this.camera);
    const pt = new THREE.Vector3();
    if (this._raycaster.ray.intersectPlane(this._plane, pt)) return [pt.x, -pt.z];
    return [0, 0];
  }

  dispose() { this.renderer.dispose(); this._labelContainer.remove(); }
}
