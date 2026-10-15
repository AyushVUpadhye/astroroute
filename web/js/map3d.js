// 3-D solar-system map — Three.js renderer.
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

const NODE_COLOR = { earth: 0x4fa3ff, observatory: 0xc9a7ff, relay: 0x94a3b8 };
const NODE_R     = { earth: 0.09, observatory: 0.085, relay: 0.052 };
const NODE_GLOW  = { earth: 0.22,  observatory: 0.20,  relay: 0.14 };
const NODE_EMIT  = { earth: 0.9,   observatory: 1.1,   relay: 0.4 };

// Map solar-system AU coords → Three.js world (x stays, y→z, slight height per kind).
const Z_OFFSET = { sun: 0, earth: 0.06, observatory: 0.14, relay: 0.04 };
function auToWorld(n) {
  return new THREE.Vector3(n.x, Z_OFFSET[n.kind] ?? 0.04, -n.y);
}

export class Map3D {
  constructor(canvas) {
    this._canvas = canvas;
    this._packets = []; this._debrisMeshes = []; this._packetMeshes = [];
    this._routeGroup = null; this._staticGroup = null;
    this._mouse = new THREE.Vector2(0, 0);
    this._raycaster = new THREE.Raycaster();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._initRenderer();
    this._initScene();
    this._bindResize();
    this._t = 0;
    this.renderer.setAnimationLoop(t => this._frame(t));
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this._canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x05070d, 1);
    this.renderer.shadowMap.enabled = false;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x05070d, 0.018);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
    this.camera.position.set(0, 6.2, 5.0);
    this.camera.lookAt(0, 0, 0);
  }

  _initScene() {
    // Lights
    this.scene.add(new THREE.AmbientLight(0x0d1a33, 3));
    const sun = new THREE.PointLight(0xffd580, 3.5, 25, 1.5);
    sun.position.set(0, 0.3, 0);
    this.scene.add(sun);

    // Starfield — two layers for depth
    for (const [n, rMin, rMax, size, col] of [
      [1800, 14, 35, 0.055, 0xe8f4ff],
      [600,  10, 14, 0.09,  0xc8e8ff],
    ]) {
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const r = rMin + Math.random() * (rMax - rMin);
        const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
        pos[i*3] = r * Math.sin(ph) * Math.cos(th);
        pos[i*3+1] = r * Math.sin(ph) * Math.sin(th);
        pos[i*3+2] = r * Math.cos(ph);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({ color: col, size, sizeAttenuation: true, transparent: true, opacity: 0.85 });
      const stars = new THREE.Points(geo, mat);
      stars.userData.static = true;
      this.scene.add(stars);
    }

    // Sun core + corona halos
    const sunCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 24, 24),
      new THREE.MeshStandardMaterial({ color: 0xffe8a3, emissive: 0xffd060, emissiveIntensity: 3, roughness: 0.1 })
    );
    sunCore.userData.static = true;
    this.scene.add(sunCore);

    for (const [r, op, col] of [[0.32, 0.12, 0xffa030], [0.55, 0.05, 0xff6010], [0.85, 0.025, 0xff4000]]) {
      const h = new THREE.Mesh(
        new THREE.SphereGeometry(r, 16, 16),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, side: THREE.BackSide })
      );
      h.userData.static = true;
      this.scene.add(h);
    }

    this._staticGroup = new THREE.Group();
    this._dynamicGroup = new THREE.Group();
    this.scene.add(this._staticGroup, this._dynamicGroup);
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

  // Called every ~2 s from main.js
  update({ snap, links = [], best, alt, packets = [], buffered = 0, srcId, timeSec = 0 }) {
    this._snap = snap;
    this._links = links;
    this._best = best;
    this._alt = alt;
    this._buffered = buffered;
    this._srcId = srcId;
    this._simTimeSec = timeSec;
    this._lastPackets = packets;
    this._rebuild();
  }

  _rebuild() {
    // Clear dynamic group
    while (this._dynamicGroup.children.length) {
      const c = this._dynamicGroup.children[0];
      c.geometry?.dispose(); c.material?.dispose?.();
      this._dynamicGroup.remove(c);
    }
    this._debrisMeshes = [];

    const snap = this._snap;
    if (!snap) return;

    const byId = new Map(snap.nodes.map(n => [n.id, n]));
    const onPath = new Set(this._best?.nodes ?? []);
    const routeSet = new Set();
    if (this._best) for (let i = 1; i < this._best.nodes.length; i++) {
      routeSet.add(`${this._best.nodes[i-1]}|${this._best.nodes[i]}`);
      routeSet.add(`${this._best.nodes[i]}|${this._best.nodes[i-1]}`);
    }

    // Orbit rings (flat ring on XZ plane)
    const ringRadii = new Set();
    for (const n of snap.nodes) {
      const r = +Math.hypot(n.x, n.y).toFixed(2);
      if (r > 0.05 && !ringRadii.has(r)) {
        ringRadii.add(r);
        const geo = new THREE.RingGeometry(r - 0.008, r + 0.008, 128);
        const mat = new THREE.MeshBasicMaterial({ color: 0x1a3060, side: THREE.DoubleSide, transparent: true, opacity: 0.35 });
        const ring = new THREE.Mesh(geo, mat);
        ring.rotation.x = -Math.PI / 2;
        this._dynamicGroup.add(ring);
      }
    }

    // Background links (SNR-colored)
    for (const l of this._links) {
      if (routeSet.has(`${l.a}|${l.b}`)) continue;
      const a = byId.get(l.a), b = byId.get(l.b);
      if (!a || !b) continue;
      const snr = l.snrDb ?? 30;
      const t = Math.min(1, Math.max(0, (snr - 6) / 20));
      const color = new THREE.Color().setHSL(t * 0.33, 0.75, 0.38);
      const geo = new THREE.BufferGeometry().setFromPoints([auToWorld(a), auToWorld(b)]);
      const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: l.blocked ? 0 : 0.2 });
      this._dynamicGroup.add(new THREE.Line(geo, mat));
    }

    // Alternate path — dashed amber glow
    if (this._alt) {
      const pts = this._alt.nodes.map(id => byId.get(id)).filter(Boolean).map(auToWorld);
      for (const [col, op] of [[0xffb547, 0.55], [0xffcc88, 0.18]]) {
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineDashedMaterial({ color: col, dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: op });
        const line = new THREE.Line(geo, mat);
        line.computeLineDistances();
        this._dynamicGroup.add(line);
      }
    }

    // Best path — multi-layer glow (outer→inner)
    if (this._best) {
      const pts = this._best.nodes.map(id => byId.get(id)).filter(Boolean).map(n => {
        const v = auToWorld(n); v.y += 0.01; return v;
      });
      for (const [col, op] of [[0x7fd1ff, 0.06], [0x7fd1ff, 0.18], [0xa0e0ff, 0.55], [0xffffff, 0.95]]) {
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: op });
        this._dynamicGroup.add(new THREE.Line(geo, mat));
      }
      // Animated "data pulse" — stored for _frame update
      this._pulseLine = { pts, t: 0 };
    } else {
      this._pulseLine = null;
    }

    // Nodes
    for (const n of snap.nodes) {
      if (n.kind === 'sun') continue;
      const pos = auToWorld(n);
      const col = NODE_COLOR[n.kind] ?? 0x94a3b8;
      const r = NODE_R[n.kind] ?? 0.052;
      const active = onPath.has(n.id);
      const emit = (NODE_EMIT[n.kind] ?? 0.4) * (active ? 2.2 : 1);

      // Core sphere
      const geo = new THREE.SphereGeometry(r, 20, 20);
      const mat = new THREE.MeshStandardMaterial({
        color: col, emissive: col, emissiveIntensity: emit,
        roughness: 0.15, metalness: 0.6,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      this._dynamicGroup.add(mesh);

      // Glow halos (2 layers)
      for (const [rr, op] of [[NODE_GLOW[n.kind] ?? 0.14, active ? 0.18 : 0.06], [(NODE_GLOW[n.kind] ?? 0.14) * 1.7, active ? 0.06 : 0.02]]) {
        const hg = new THREE.SphereGeometry(rr, 12, 12);
        const hm = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, side: THREE.BackSide });
        const hh = new THREE.Mesh(hg, hm);
        hh.position.copy(pos);
        this._dynamicGroup.add(hh);
      }

      // Buffered indicator ring around source
      if (n.id === this._srcId && this._buffered > 0) {
        const rg = new THREE.RingGeometry(r + 0.06, r + 0.10, 32);
        const rm = new THREE.MeshBasicMaterial({ color: 0xff6b6b, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
        const ring = new THREE.Mesh(rg, rm);
        ring.position.copy(pos);
        ring.rotation.x = -Math.PI / 2;
        this._dynamicGroup.add(ring);
        ring.userData.pulse = true;
      }
    }

    // Debris — store refs for spin animation
    for (const d of snap.debris ?? []) {
      const n = d.kind === 'comet' ? 100 : 200;
      const pos = new Float32Array(n * 3);
      const angles = new Float32Array(n);
      const dists = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const a = d.particles?.[i]
          ? Math.atan2(-d.particles[i].dy, d.particles[i].dx)
          : Math.random() * Math.PI * 2;
        const dist = d.particles?.[i]
          ? Math.hypot(d.particles[i].dx, d.particles[i].dy)
          : Math.sqrt(Math.random()) * d.r * 0.85;
        angles[i] = a; dists[i] = dist;
        pos[i*3] = d.x + Math.cos(a) * dist;
        pos[i*3+1] = (Math.random() - 0.5) * 0.04;
        pos[i*3+2] = -(d.y + Math.sin(a) * dist);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const col = d.kind === 'comet' ? 0xc8a0ff : 0xf97316;
      const mat = new THREE.PointsMaterial({ color: col, size: 0.028, sizeAttenuation: true, transparent: true, opacity: 0.8 });
      const pts = new THREE.Points(geo, mat);
      pts.userData.debris = { d, angles, dists };
      this._dynamicGroup.add(pts);
      this._debrisMeshes.push(pts);

      // Comet nucleus + tail
      if (d.kind === 'comet') {
        const nuc = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 10),
          new THREE.MeshStandardMaterial({ color: 0xe8d8ff, emissive: 0xc0a0ff, emissiveIntensity: 1.5 }));
        nuc.position.set(d.x, 0.04, -d.y);
        this._dynamicGroup.add(nuc);
      }
    }
  }

  _frame(t) {
    this._t = t;

    // Subtle camera parallax following mouse
    const mx = this._mouse.x * 0.12, my = this._mouse.y * 0.06;
    this.camera.position.x += (mx - this.camera.position.x) * 0.04;
    this.camera.position.y += (6.2 + my - this.camera.position.y) * 0.04;
    this.camera.lookAt(0, 0, 0);

    const dt = t * 0.001;

    // Spin debris particles
    for (const pts of this._debrisMeshes) {
      const { d, angles, dists } = pts.userData.debris;
      const posArr = pts.geometry.attributes.position.array;
      const spin = dt * (d.kind === 'comet' ? 0.15 : 0.06);
      for (let i = 0, n = dists.length; i < n; i++) {
        const a = angles[i] + spin;
        posArr[i*3]   = d.x + Math.cos(a) * dists[i];
        posArr[i*3+2] = -(d.y + Math.sin(a) * dists[i]);
      }
      pts.geometry.attributes.position.needsUpdate = true;
    }

    // Animate pulse rings (buffered indicator)
    for (const c of this._dynamicGroup.children) {
      if (c.userData.pulse) {
        c.material.opacity = 0.4 + 0.35 * Math.sin(dt * 4);
        c.scale.setScalar(1 + 0.12 * Math.sin(dt * 4));
      }
    }

    // Update packet positions
    if (this._lastPackets) {
      // Remove old packet meshes
      const keep = [];
      for (const c of this._packetMeshes) {
        this._dynamicGroup.remove(c);
        c.geometry.dispose(); c.material.dispose();
      }
      this._packetMeshes = [];
      for (const p of this._lastPackets) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
        // Inner dot
        const g = new THREE.SphereGeometry(0.032, 8, 8);
        const m = new THREE.MeshBasicMaterial({ color: p.held ? 0xffb547 : 0xf0faff });
        const mesh = new THREE.Mesh(g, m);
        mesh.position.set(p.x, 0.09, -p.y);
        this._dynamicGroup.add(mesh);
        this._packetMeshes.push(mesh);
        // Glow halo
        const gh = new THREE.SphereGeometry(0.075, 8, 8);
        const mh = new THREE.MeshBasicMaterial({ color: 0x7fd1ff, transparent: true, opacity: 0.28, side: THREE.BackSide });
        const mhm = new THREE.Mesh(gh, mh);
        mhm.position.copy(mesh.position);
        this._dynamicGroup.add(mhm);
        this._packetMeshes.push(mhm);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  onMouseMove(clientX, clientY) {
    const r = this._canvas.getBoundingClientRect();
    this._mouse.x = ((clientX - r.left) / r.width) * 2 - 1;
    this._mouse.y = -((clientY - r.top) / r.height) * 2 + 1;
  }

  // Unproject screen coords (relative to canvas) → AU [x, y].
  toWorld(sx, sy) {
    const r = this._canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(sx / r.width * 2 - 1, -(sy / r.height) * 2 + 1);
    this._raycaster.setFromCamera(ndc, this.camera);
    const pt = new THREE.Vector3();
    if (this._raycaster.ray.intersectPlane(this._plane, pt)) return [pt.x, -pt.z];
    return [0, 0];
  }

  dispose() { this.renderer.dispose(); }
}
