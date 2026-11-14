import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const D = 'web-data/';
const R_MOON = 1737400;
const getJSON = p => fetch(D + p).then(r => { if (!r.ok) throw new Error(`Could not load ${p} (${r.status})`); return r.json(); });
const getF32 = p => fetch(D + p).then(r => { if (!r.ok) throw new Error(`Could not load ${p}`); return r.arrayBuffer(); }).then(b => new Float32Array(b));
const rad = d => d * Math.PI / 180;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = n => String(n).padStart(2, '0');
const date = s => { const d = new Date(s.endsWith('Z') || s.includes('+') ? s : s + 'Z'); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const dateTime = s => { const d = new Date(s.endsWith('Z') || s.includes('+') ? s : s + 'Z'); return `${date(s)}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`; };
const fmt = (x, d = 0) => x == null || !isFinite(x) ? '–' : Number(x).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const pct = x => fmt(x) + '%';
const hrs = x => x == null ? '–' : x >= 48 ? fmt(x / 24, 1) + ' days' : x < 10 && x % 1 ? fmt(x, 1) + ' h' : fmt(x) + ' h';
const wh = x => x == null ? '–' : x >= 1000 ? fmt(x / 1000, 1) + ' kWh' : fmt(x) + ' Wh';
const watts = x => x == null ? '–' : x >= 1000 ? fmt(x / 1000, 2) + ' kW' : fmt(x) + ' W';
const range = (r, f) => !r ? '–' : (r[0] == null ? '–' : (Math.abs(r[0] - r[1]) < 1e-6 * Math.max(1, Math.abs(r[1])) || f(r[0]) === f(r[1])) ? f(r[0]) : `${f(r[0])} to ${f(r[1])}`);
const VERDICT = { green: 'Works, even in the worst case', yellow: 'Works with caveats', red: 'Does not work' };
const VSHORT = { green: 'Works', yellow: 'Caveats', red: 'No go' };
const VCOL = { green: '#34c77b', yellow: '#ff9f0a', red: '#ff5a4f' };
const level = e => e == null ? '–' : `${fmt(Math.abs(e), 1)}° ${e >= 0 ? 'above' : 'below'} level`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const MISSIONS = [
  { id: 'griffin1', name: 'Griffin-1', who: 'Astrobotic robotic lander. Values read from the public payload user guide.' },
  { id: 'novac', name: 'Nova-C class', who: 'Small robotic lander with a known power budget.' },
  { id: 'artemis', name: 'Artemis crewed', who: 'Crewed landing that needs continuous sunlight and a short walk to ice.' },
  { id: 'argonaut', name: 'Argonaut', who: 'Long-stay cargo lander. No power data yet, so we size it for you.' },
];
const FIELDS = [
  ['mission.duration_days', 'Time on the surface', v => `${v} days`],
  ['timing.earliest_landing_utc', 'Earliest landing', v => date(v)],
  ['timing.max_slip_days', 'How late you can land', v => `up to ${v} days later`],
  ['landing.ellipse_radius_m', 'Landing accuracy', v => `within ${v} m`],
  ['landing.max_slope_deg', 'Steepest safe slope', v => `${v}°`],
  ['power.panels', 'Solar panels', v => `${v.length} panel${v.length > 1 ? 's' : ''}${v.every(p => p.peak_w == null) ? ', size open' : ''}`],
  ['power.battery_wh', 'Battery', v => wh(v)],
  ['power.load_operations_w', 'Power while working', v => watts(v)],
  ['comms.mode', 'Link to Earth', v => v === 'DTE' ? 'Direct to Earth' : v],
  ['comms.data_rate_kbps', 'Data rate', v => `${fmt(v)} kbit/s`],
  ['mission.continuous_sun_required', 'Continuous sunlight', v => v ? 'Required' : 'Not required'],
  ['mission.max_distance_to_psr_km', 'Distance to ice', v => `within ${v} km`],
  ['mobility.rover_range_km', 'Rover range', v => `${v} km`],
];
const LABEL = { declared: 'From your documents', derived: 'Worked out from your documents', asked: 'Your answer', estimated: 'Estimate' };
const pathGet = (o, p) => p.split('.').reduce((a, k) => a && a[k], o);

const S = { mission: null, preset: null, data: null, opt: 0, screen: 'brief', explain: false, ice: true, hw: null,
  t: 0, playing: false, speed: 6, view: 'drone', sites: {}, index: null, psr: null, region: null };

/* ---------- renderer ---------- */
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
let W = innerWidth, H = innerHeight;
const labels = document.createElement('div');
labels.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9';
document.body.appendChild(labels);

/* ---------- globe scene ---------- */
const G = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(30, 1, 0.01, 100) };
{
  const tex = new THREE.TextureLoader().load('assets/moon_2k.jpg');
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  G.moon = new THREE.Mesh(new THREE.SphereGeometry(1, 160, 80), new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 }));
  G.scene.add(G.moon);
  const sun = new THREE.DirectionalLight(0xffffff, 3.2); sun.position.set(-4, 1.2, 2.5); G.scene.add(sun);
  G.scene.add(new THREE.AmbientLight(0xffffff, 0.05));
  G.camera.position.set(0, 0.35, 4.4);
  G.controls = new OrbitControls(G.camera, canvas);
  Object.assign(G.controls, { enablePan: false, enableDamping: true, dampingFactor: 0.08, minDistance: 1.6, maxDistance: 7, autoRotate: true, autoRotateSpeed: 0.35, rotateSpeed: 0.5 });
}
// same parametrisation as THREE.SphereGeometry: u = (lon+180)/360, v = (90-lat)/180
const globePoint = (lat, lon, r = 1.002) => {
  const phi = rad(lon + 180), th = rad(90 - lat);
  return new THREE.Vector3(-r * Math.cos(phi) * Math.sin(th), r * Math.cos(th), r * Math.sin(phi) * Math.sin(th));
};

/* ---------- terrain geometry ---------- */
// map frame: south polar stereographic metres. World: X = map x, Z = -map y, Y = height in a tangent frame at (ox, oy).
function gridGeometry(z, n, px, half, step, o) {
  const { gcx = 0, gcy = 0, ox = 0, oy = 0, h0 = 0, unit = 1, hole = 0 } = o;
  const m = Math.floor((n - 1) / step) + 1;
  const pos = new Float32Array(m * m * 3), map = new Float32Array(m * m * 2);
  for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) {
    const r = i * step, c = j * step, k = i * m + j;
    const mx = gcx - half + c * px, my = gcy + half - r * px, dx = mx - ox, dy = my - oy;
    const h = z[r * n + c];
    pos[k * 3] = dx / unit; pos[k * 3 + 1] = (h - h0 - (dx * dx + dy * dy) / (2 * R_MOON)) / unit; pos[k * 3 + 2] = -dy / unit;
    map[k * 2] = mx; map[k * 2 + 1] = my;
  }
  const idx = [];
  for (let i = 0; i < m - 1; i++) for (let j = 0; j < m - 1; j++) {
    const a = i * m + j, b = a + 1, c = a + m, d = c + 1;
    if (hole) {
      const xs = [a, b, c, d].map(q => Math.abs(map[q * 2] - ox)), ys = [a, b, c, d].map(q => Math.abs(map[q * 2 + 1] - oy));
      if (Math.max(...xs) < hole && Math.max(...ys) < hole) continue;
    }
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(m * m > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  g.computeVertexNormals();
  g.userData = { map, m };
  return g;
}
// two colour sets per mesh: plain grey and with the permanently shadowed regions tinted
function iceColours(g, base, psr) {
  const { map, m } = g.userData, nv = m * m;
  const plain = new Float32Array(nv * 3).fill(base), ice = new Float32Array(nv * 3).fill(base);
  // bucket vertices by grid index for speed
  const x0 = map[0], y0 = map[1], dx = map[2] - map[0], dy = map[m * 2 + 1] - map[1];
  for (let p = 0; p < psr.x_m.length; p++) {
    const rr = Math.sqrt(psr.area_km2[p] * 1e6 / Math.PI), cx = psr.x_m[p], cy = psr.y_m[p];
    const j0 = Math.max(0, Math.floor((cx - rr - x0) / dx)), j1 = Math.min(m - 1, Math.ceil((cx + rr - x0) / dx));
    const ia = Math.floor((cy + rr - y0) / dy), ib = Math.ceil((cy - rr - y0) / dy);
    const i0 = Math.max(0, Math.min(ia, ib)), i1 = Math.min(m - 1, Math.max(ia, ib));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = i * m + j, ex = map[k * 2] - cx, ey = map[k * 2 + 1] - cy;
      if (ex * ex + ey * ey <= rr * rr) { ice[k * 3] = 0.42; ice[k * 3 + 1] = 0.72; ice[k * 3 + 2] = 0.95; }
    }
  }
  g.userData.cols = { plain, ice };
  g.setAttribute('color', new THREE.BufferAttribute(S.ice ? ice.slice() : plain.slice(), 3));
}
function setIce(g) { if (!g || !g.userData.cols) return; g.attributes.color.array.set(S.ice ? g.userData.cols.ice : g.userData.cols.plain); g.attributes.color.needsUpdate = true; }
function sampleH(z, n, px, half, gcx, gcy, mx, my) {
  const c = (mx - (gcx - half)) / px, r = ((gcy + half) - my) / px;
  const c0 = Math.max(0, Math.min(n - 2, Math.floor(c))), r0 = Math.max(0, Math.min(n - 2, Math.floor(r))), fc = c - c0, fr = r - r0;
  const q = (rr, cc) => z[rr * n + cc];
  return (q(r0, c0) * (1 - fc) + q(r0, c0 + 1) * fc) * (1 - fr) + (q(r0 + 1, c0) * (1 - fc) + q(r0 + 1, c0 + 1) * fc) * fr;
}
// azimuth/elevation at a site -> world direction (site north/east vectors are in map coordinates)
function dirFromAzEl(site, az, el) {
  const n = site.north_vec_map, e = site.east_vec_map, ca = Math.cos(rad(az)), sa = Math.sin(rad(az)), ce = Math.cos(rad(el));
  const mx = ca * n[0] + sa * e[0], my = ca * n[1] + sa * e[1];
  return new THREE.Vector3(ce * mx, Math.sin(rad(el)), -ce * my).normalize();
}

/* ---------- polar region scene (km units) ---------- */
const P = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(40, 1, 0.1, 3000), markers: [] };
P.controls = new OrbitControls(P.camera, canvas);
Object.assign(P.controls, { enableDamping: true, dampingFactor: 0.08, minDistance: 8, maxDistance: 700, maxPolarAngle: rad(80), screenSpacePanning: false });
P.controls.enabled = false;
P.sun = new THREE.DirectionalLight(0xfff4e6, 3.0); P.scene.add(P.sun, P.sun.target);
P.scene.add(new THREE.AmbientLight(0xbfd4ff, 0.12));

async function buildPolar() {
  if (P.mesh) return;
  const t = S.terrainInfo.region;
  const z = S.region;
  const g = gridGeometry(z, t.shape[0], t.pixel_m, t.half_width_m, 1, { unit: 1000 });
  iceColours(g, 0.62, S.psr);
  P.mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }));
  P.scene.add(P.mesh);
}
function polarHeight(mx, my) { const t = S.terrainInfo.region; return sampleH(S.region, t.shape[0], t.pixel_m, t.half_width_m, 0, 0, mx, my) - (mx * mx + my * my) / (2 * R_MOON); }

function placePolarMarkers() {
  P.markers.forEach(m => m.el.remove()); P.markers = [];
  const opts = S.data.options;
  for (const s of S.index.sites) {
    const rank = opts.findIndex(o => o.site === s.id);
    const el = document.createElement('button');
    el.className = 'pin' + (rank >= 0 ? ' top' : '');
    const v = rank >= 0 ? (opts[rank].worst_case_verdict || opts[rank].verdict) : null;
    el.innerHTML = rank >= 0 ? `<span class="badge" style="background:${VCOL[v]}">${rank + 1}</span><span class="pl">${esc(s.name)}</span>` : `<span class="dotm"></span><span class="pl">${esc(s.name)}</span>`;
    el.setAttribute('aria-label', rank >= 0 ? `Option ${rank + 1}: ${s.name}` : s.name);
    el.onclick = () => rank >= 0 ? openExplore(rank) : sitePopover(s, el);
    labels.appendChild(el);
    const pos = new THREE.Vector3(s.x_m / 1000, polarHeight(s.x_m, s.y_m) / 1000 + 0.3, -s.y_m / 1000);
    P.markers.push({ el, pos, scene: 'polar' });
  }
}
function sitePopover(s, el) {
  $$('.pop').forEach(p => p.remove());
  const w = (S.data.landing_windows || {})[s.id] || [];
  const pop = document.createElement('div'); pop.className = 'pop glass';
  const first = w[0];
  pop.innerHTML = `<b>${esc(s.name)}</b><div class="small">${first ? `${w.length} landing window${w.length > 1 ? 's' : ''} for this mission. First opens ${date(first.open)}.` : 'No landing window works for this mission in your date range.'}</div><div class="small">Sunlit ${s.sunlit_pct_2m}% and Earth in view ${s.earth_pct_2m}% of the time over 2027 to 2032, at 2 m height.</div><button class="ghost" style="margin-top:8px">Show in calendar</button>`;
  pop.querySelector('button').onclick = () => { pop.remove(); openCalendar(s.id); };
  document.body.appendChild(pop);
  const r = el.getBoundingClientRect();
  pop.style.left = Math.min(innerWidth - 300, r.left) + 'px'; pop.style.top = (r.bottom + 8) + 'px';
  setTimeout(() => addEventListener('pointerdown', function off(e) { if (!pop.contains(e.target)) { pop.remove(); removeEventListener('pointerdown', off); } }), 0);
}

/* ---------- site explorer scene (metres) ---------- */
const X = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(55, 1, 0.3, 120000), yaw: 0, pitch: 0 };
X.controls = new OrbitControls(X.camera, canvas);
Object.assign(X.controls, { enableDamping: true, dampingFactor: 0.08, minDistance: 20, maxDistance: 30000, maxPolarAngle: rad(88) });
X.controls.enabled = false;
X.sun = new THREE.DirectionalLight(0xfff4e2, 4.0);
X.sun.castShadow = true;
X.sun.shadow.mapSize.set(4096, 4096);
X.sun.shadow.bias = -0.0004; X.sun.shadow.normalBias = 1.5;
X.scene.add(X.sun, X.sun.target);
X.ambient = new THREE.AmbientLight(0xa8c4ff, 0.06); // faint earthshine so shadows read as shadows
X.scene.add(X.ambient);
{
  const mk = (col, size) => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, col); gr.addColorStop(size, col); gr.addColorStop(Math.min(1, size + 0.12), col.replace('1)', '0.35)')); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true, fog: false, toneMapped: false }));
  };
  X.sunSprite = mk('rgba(255,236,190,1)', 0.18); X.earthSprite = mk('rgba(120,180,255,1)', 0.45);
  X.scene.add(X.sunSprite, X.earthSprite);
}
{ // simple lander
  const grp = new THREE.Group(), foil = new THREE.MeshStandardMaterial({ color: 0xc9a54a, metalness: 0.7, roughness: 0.35 }), grey = new THREE.MeshStandardMaterial({ color: 0xbfc3c8, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 1.6, 8), foil); body.position.y = 2.0; grp.add(body);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 2.2), grey); deck.position.y = 2.9; grp.add(deck);
  for (let k = 0; k < 4; k++) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6), grey); const a = k * Math.PI / 2 + Math.PI / 4; leg.position.set(Math.cos(a) * 1.9, 1.0, Math.sin(a) * 1.9); leg.rotation.z = Math.cos(a) * 0.5; leg.rotation.x = -Math.sin(a) * 0.5; grp.add(leg); }
  grp.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  X.lander = grp; X.scene.add(grp);
}

async function buildSite(sid) {
  if (X.sid === sid) return;
  X.sid = sid;
  for (const k of ['mesh', 'far', 'ring']) if (X[k]) { X.scene.remove(X[k]); X[k].geometry.dispose(); X[k] = null; }
  const site = S.sites[sid] || (S.sites[sid] = await getJSON(`${sid}.json`));
  const z = await getF32(`terrain/${sid}_10m.bin`);
  const t = S.terrainInfo.sites, n = t.shape[0], half = t.half_width_m;
  const h0 = z[((n - 1) / 2) * n + (n - 1) / 2];
  const ox = site.x_m, oy = site.y_m;
  const weak = /Mobi|Android/i.test(navigator.userAgent) || (navigator.hardwareConcurrency || 8) <= 4;
  const g = gridGeometry(z, n, t.pixel_m, half, weak ? 2 : 1, { gcx: ox, gcy: oy, ox, oy, h0 });
  iceColours(g, 0.6, S.psr);
  X.mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
  X.mesh.castShadow = X.mesh.receiveShadow = true;
  X.scene.add(X.mesh);
  // surrounding region at 600 m so the horizon is not a cliff (lit, no cast shadows)
  const rt = S.terrainInfo.region, rn = rt.shape[0];
  const sub = { n: 141, z: null };
  const ci = Math.round((rt.half_width_m - oy) / rt.pixel_m), cj = Math.round((ox + rt.half_width_m) / rt.pixel_m), hw = (sub.n - 1) / 2;
  sub.z = new Float32Array(sub.n * sub.n);
  for (let i = 0; i < sub.n; i++) for (let j = 0; j < sub.n; j++) {
    const r = Math.max(0, Math.min(rn - 1, ci - hw + i)), c = Math.max(0, Math.min(rn - 1, cj - hw + j));
    sub.z[i * sub.n + j] = S.region[r * rn + c];
  }
  const gcx = -rt.half_width_m + cj * rt.pixel_m, gcy = rt.half_width_m - ci * rt.pixel_m;
  const fg = gridGeometry(sub.z, sub.n, rt.pixel_m, hw * rt.pixel_m, 1, { gcx, gcy, ox, oy, h0, hole: half - 600 });
  iceColours(fg, 0.5, S.psr);
  X.far = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  X.far.receiveShadow = false; X.scene.add(X.far);
  X.site = site; X.z = z; X.n = n; X.h0 = h0; X.half = half; X.px = t.pixel_m;
  X.box = new THREE.Box3().setFromBufferAttribute(g.attributes.position);
}
function setRing(radius) {
  if (X.ring) { X.scene.remove(X.ring); X.ring.geometry.dispose(); }
  const pts = [], s = X.site;
  for (let k = 0; k <= 96; k++) {
    const a = k / 96 * Math.PI * 2, dx = Math.cos(a) * radius, dy = Math.sin(a) * radius;
    const h = sampleH(X.z, X.n, X.px, X.half, s.x_m, s.y_m, s.x_m + dx, s.y_m + dy) - X.h0;
    pts.push(new THREE.Vector3(dx, h + 0.6, -dy));
  }
  X.ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
  X.scene.add(X.ring);
}
function fitShadow(dir) {
  const L = X.sun; L.position.copy(dir).multiplyScalar(20000); L.target.position.set(0, 0, 0); L.updateMatrixWorld(); L.target.updateMatrixWorld();
  const view = new THREE.Matrix4().lookAt(L.position, L.target.position, Math.abs(dir.y) > 0.99 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0));
  const inv = new THREE.Matrix4().makeBasis(...[0, 1, 2].map(i => new THREE.Vector3().setFromMatrixColumn(view, i))).setPosition(L.position).invert();
  const b = X.box, c = new THREE.Box3();
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) c.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(inv));
  const cam = L.shadow.camera;
  cam.left = c.min.x - 20; cam.right = c.max.x + 20; cam.bottom = c.min.y - 20; cam.top = c.max.y + 20; cam.near = Math.max(1, -c.max.z - 50); cam.far = -c.min.z + 50;
  cam.updateProjectionMatrix();
  renderer.shadowMap.needsUpdate = true;
}

/* ---------- time state ---------- */
const opt = () => S.data.options[S.opt];
const series = () => opt().series_hourly;
function lerpAng(a, b, f) { let d = ((b - a + 540) % 360) - 180; return a + d * f; }
function sample(t) {
  const s = series(), n = s.t.length, i = Math.max(0, Math.min(n - 1, Math.floor(t))), j = Math.min(n - 1, i + 1), f = Math.min(1, Math.max(0, t - i));
  const L = (a) => a[i] * (1 - f) + a[j] * f;
  const sf = s.sun_frac_worst_median_best;
  return { i, sunAz: lerpAng(s.sun_az[i], s.sun_az[j], f), sunEl: L(s.sun_el), earthAz: lerpAng(s.earth_az[i], s.earth_az[j], f), earthEl: L(s.earth_el),
    frac: [L(sf[0]), L(sf[1]), L(sf[2])], contact: s.earth_contact[f < 0.5 ? i : j], power: s.power_w ? L(s.power_w) : null, soc: s.battery_soc ? L(s.battery_soc) : null };
}
function applyTime() {
  const st = sample(S.t), site = X.site; if (!site) return;
  const sd = dirFromAzEl(site, st.sunAz, st.sunEl), ed = dirFromAzEl(site, st.earthAz, st.earthEl);
  fitShadow(sd);
  // global light: sunlit fraction of the solar disc from our horizon data (includes terrain up to 300 km away)
  X.sun.intensity = 4.0 * st.frac[1];
  const camP = X.camera.position;
  X.sunSprite.position.copy(camP).addScaledVector(sd, 50000); X.sunSprite.scale.setScalar(50000 * Math.tan(rad(0.53)) * 4);
  X.sunSprite.material.opacity = st.frac[1] > 0 ? 1 : 0;
  X.earthSprite.position.copy(camP).addScaledVector(ed, 50000); X.earthSprite.scale.setScalar(50000 * Math.tan(rad(1.9)) * 1.6);
  X.earthSprite.material.opacity = st.earthEl > -1 ? 1 : 0;
  const s = series(); const t0 = s.t[0];
  $('#scrub').value = S.t;
  const now = new Date(new Date(t0).getTime() + S.t * 3600e3);
  const dh = Math.floor(S.t);
  $('#clock').innerHTML = `Day ${Math.floor(dh / 24) + 1}, +${pad(dh % 24)} h<br><span class="small">${date(now.toISOString())} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())} UTC</span>`;
  updateNow(st);
  drawSpark(st.i);
}

/* ---------- screens ---------- */
function go(name) {
  if (name !== 'brief' && !S.data) return;
  S.screen = name;
  $$('.screen').forEach(s => s.classList.toggle('on', s.id === name));
  $$('.steps button').forEach(b => { if (b.dataset.go !== name) b.removeAttribute('aria-current'); else b.setAttribute('aria-current', 'step'); });
  $$('.pop').forEach(p => p.remove());
  G.controls.enabled = name === 'brief';
  P.controls.enabled = name === 'options';
  X.controls.enabled = name === 'explore' && S.view !== 'fp';
  if (name === 'brief') { scene = 'globe'; G.controls.autoRotate = true; }
  if (name === 'options') flyToPole();
  if (name === 'explore') { scene = 'site'; }
  if (name === 'compare') { scene = 'site'; renderCompare(); }
  P.markers.forEach(m => m.el.style.display = name === 'options' && scene === 'polar' ? '' : 'none');
}
let scene = 'globe';

function renderPresets() {
  $('#presets').innerHTML = MISSIONS.map(m => `<button class="preset" data-m="${m.id}" aria-pressed="false"><b>${m.name}</b><span>${m.who}</span></button>`).join('');
  $$('.preset').forEach(b => b.onclick = () => pickMission(b.dataset.m));
}
async function pickMission(id) {
  $$('.preset').forEach(b => b.setAttribute('aria-pressed', b.dataset.m === id));
  S.mission = id; S.preset = await getJSON(`presets/${id}.json`);
  const rows = FIELDS.map(([p, q, f]) => {
    const o = pathGet(S.preset, p); if (!o || !('v' in o)) return '';
    const v = o.v == null ? `<span style="color:var(--muted)">Left open, we size it for you</span>` : esc(f(o.v));
    return `<div class="field"><div class="q">${q}</div><div class="a">${v}</div><div class="src"><span class="tag ${o.l}">${LABEL[o.l] || o.l}</span>${o.src ? `<span>${esc(o.src)}</span>` : ''}</div></div>`;
  }).join('');
  $('#fields').innerHTML = rows + `<p class="small" style="margin:12px 0 0">Every value shows where it came from. Values left open are not guessed: the results tell you what you would need.</p>`;
  $('#find').disabled = false;
}
async function findOptions() {
  if (!S.mission) { $('#fields').innerHTML = `<p class="small">Pick a mission above to see its values.</p>`; return; }
  $('#find').textContent = 'Loading results…';
  S.data = await getJSON(`options/${S.mission}.json`);
  await Promise.all(S.data.options.map(o => S.sites[o.site] ? null : getJSON(`${o.site}.json`).then(j => S.sites[o.site] = j)));
  $('#find').textContent = 'Find my landing options';
  $$('.steps button').forEach(b => b.disabled = false);
  S.opt = 0; X.sid = null;
  renderOptions();
  await buildPolar();
  placePolarMarkers();
  go('options');
}

function flyToPole() {
  scene = 'globe'; G.controls.autoRotate = false;
  const from = G.camera.position.clone(), to = new THREE.Vector3(0.02, -2.0, 0.55);
  const t0 = performance.now(), dur = matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 1700;
  const fade = $('#fade');
  anim = now => {
    const k = Math.min(1, (now - t0) / dur), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    const p = from.clone().lerp(to, e); p.setLength(from.length() + (to.length() - from.length()) * e);
    G.camera.position.copy(p); G.camera.lookAt(0, 0, 0);
    if (k > 0.75) fade.style.opacity = (k - 0.75) * 4;
    if (k >= 1) {
      anim = null; scene = 'polar'; framePolar();
      P.markers.forEach(m => m.el.style.display = S.screen === 'options' ? '' : 'none');
      fade.style.opacity = 0;
    }
  };
}
function framePolar() {
  const pts = S.data.options.map(o => S.index.sites.find(s => s.id === o.site));
  const cx = pts.reduce((a, s) => a + s.x_m, 0) / pts.length / 1000, cy = pts.reduce((a, s) => a + s.y_m, 0) / pts.length / 1000;
  const spread = Math.max(40, ...pts.map(s => Math.hypot(s.x_m / 1000 - cx, s.y_m / 1000 - cy))) * 2.6;
  P.controls.target.set(cx, 0, -cy);
  P.camera.position.set(cx + spread * 0.25, spread * 0.9, -cy + spread * 0.75);
  P.controls.update();
  const s0 = S.sites[S.data.options[0].site], o0 = S.data.options[0];
  // relief light for orientation: real azimuth at option 1 landing, raised to 8° so the map is readable
  const d = dirFromAzEl(s0, o0.landing.sun_azimuth_deg, 8);
  P.sun.position.copy(d).multiplyScalar(500).add(P.controls.target); P.sun.target.position.copy(P.controls.target);
}

function renderOptions() {
  const d = S.data, o = d.options;
  $('#summary').textContent = plainSummary();
  $('#trust').textContent = d.trust_badge;
  $('#cards').innerHTML = o.map((x, i) => {
    const v = x.worst_case_verdict || x.verdict;
    return `<article class="card glass">
      <div class="head"><div class="badge" style="background:${VCOL[v]}">${i + 1}</div><div><h3>${esc(x.site_name)}</h3><div class="when">Land ${dateTime(x.landing_utc)}</div></div></div>
      <div class="verdict v-${v}">${VERDICT[v]}</div>
      <div class="kv">
        <div><b>${pct(x.light.sun_pct)}</b><span>of the time in sunlight</span></div>
        <div><b>${pct(x.comms.contact_pct)}</b><span>of the time in contact with Earth</span></div>
        <div><b>${hrs(x.light.longest_dark_h)}</b><span>longest time in darkness</span></div>
        <div><b>${x.slip_tolerance_days != null ? fmt(x.slip_tolerance_days) + ' days' : '–'}</b><span>landing can slip and still work</span></div>
      </div>
      <p class="x small">${explainOption(x)}</p>
      <button class="ghost" data-open="${i}">Explore in 3D</button>
    </article>`;
  }).join('');
  $$('[data-open]').forEach(b => b.onclick = () => openExplore(+b.dataset.open));
}
function plainSummary() {
  const o = S.data.options[0], v = o.worst_case_verdict || o.verdict;
  const words = { green: 'works even in the worst case', yellow: 'works, with caveats you should read', red: 'does not meet your needs' };
  return `Land at ${o.site_name} on ${date(o.landing_utc)}. It ${words[v]}.`;
}
function explainOption(x) {
  const r = x.reasons && x.reasons.length ? x.reasons.join('. ') + '.' : 'No problems found for your mission.';
  return `${r} Worst case means the worst point of your landing area, the worst lander orientation and terrain error together.`;
}

/* ---------- explore ---------- */
async function openExplore(i) {
  S.opt = i; S.t = 0; S.hw = null;
  if (S.screen !== 'explore') go('explore');
  $('#hint').style.display = '';
  $('#optTabs').innerHTML = S.data.options.map((o, k) => `<button data-k="${k}" aria-pressed="${k === i}">${k + 1}. ${esc(o.site_name)}</button>`).join('');
  $$('#optTabs button').forEach(b => b.onclick = () => openExplore(+b.dataset.k));
  $('#panel').innerHTML = `<p class="small">Loading terrain…</p>`;
  await buildSite(opt().site);
  setRing(opt().ellipse_radius_m || 50);
  const s = series();
  $('#scrub').max = s.t.length - 1; $('#scrub').step = 'any';
  renderPanel(); drawBars(); setView(S.view, true); applyTime();
}
function setView(v, reset) {
  S.view = v;
  $$('#views button').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === v));
  X.lander.visible = v !== 'fp';
  X.controls.enabled = v !== 'fp' && S.screen === 'explore';
  const st = sample(S.t), back = dirFromAzEl(X.site, st.sunAz + 150, 0);
  if (v === 'fp') {
    X.camera.position.set(0, 2.0, 0); X.yaw = rad(st.sunAz); X.pitch = rad(2); X.camera.fov = 60;
    lookFP();
  } else if (v === 'drone') {
    X.controls.target.set(0, 2, 0); X.camera.position.set(back.x * 110, 45, back.z * 110); X.camera.fov = 50;
  } else {
    X.controls.target.set(0, 0, 0); X.camera.position.set(back.x * 5200, 7600, back.z * 5200); X.camera.fov = 50;
  }
  X.camera.updateProjectionMatrix();
  if (v !== 'fp') X.controls.update();
  applyTime();
}
// first person: yaw measured as a lunar azimuth so the view starts facing the Sun
function lookFP() {
  const d = dirFromAzEl(X.site, X.yaw * 180 / Math.PI, X.pitch * 180 / Math.PI);
  X.camera.lookAt(X.camera.position.clone().add(d));
}
{
  let drag = null;
  canvas.addEventListener('pointerdown', e => { if (S.screen === 'explore') $('#hint').style.display = 'none'; if (S.screen === 'explore' && S.view === 'fp') { drag = { x: e.clientX, y: e.clientY, yaw: X.yaw, pitch: X.pitch }; canvas.setPointerCapture(e.pointerId); } });
  canvas.addEventListener('pointermove', e => { if (!drag) return; X.yaw = drag.yaw - (e.clientX - drag.x) * 0.004; X.pitch = Math.max(rad(-60), Math.min(rad(70), drag.pitch + (e.clientY - drag.y) * 0.004)); lookFP(); });
  addEventListener('pointerup', () => drag = null);
}

function hwVal(key) { // hardware toggle: show the "with" value when that option is on
  const o = opt(), h = S.hw && o.hardware_toggles && o.hardware_toggles[S.hw];
  if (h && h[key]) return h[key][1];
  if (key === 'verdict') return o.worst_case_verdict || o.verdict;
  return null;
}
function renderPanel() {
  const o = opt(), v = hwVal('verdict');
  const L = o.landing, li = o.light, c = o.comms, pw = o.power || {}, rg = o.ranges || {}, tr = o.terrain || {}, re = o.resources || {}, tu = o.terrain_uncertainty || {};
  const h = S.hw && o.hardware_toggles ? o.hardware_toggles[S.hw] : null;
  const pick = (k, base) => h && h[k] ? h[k][1] : base;
  const ice = re['nearest_over_0.01km2_km'];
  $('#panel').innerHTML = `
    <div>
      <h2>${esc(o.site_name)}</h2>
      <div class="small">Land ${dateTime(o.landing_utc)}, stay ${hrs(o.duration_h)}</div>
      <div class="verdict v-${v}" style="margin-top:10px">${VERDICT[v]}</div>
      ${o.reasons && o.reasons.length ? `<ul class="reasons">${o.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
    </div>
    <div class="now" id="now"></div>
    <div class="section"><h4>Over the whole stay</h4>
      <canvas id="spark" height="120" style="width:100%"></canvas>
      <div class="legend" style="margin-top:6px"><span><i style="background:var(--sun)"></i>Sunlit part of the Sun</span><span><i style="background:var(--earth)"></i>Earth contact</span>${o.series_hourly.battery_soc ? '<span><i style="background:var(--go)"></i>Battery</span>' : ''}</div>
    </div>
    <div class="section"><h4>Sunlight</h4><div class="rows">
      <div><span>Time in sunlight</span><span class="num">${S.hw ? pct(pick('sun_pct')) : range(rg.sun_pct, pct)}</span></div>
      <div><span>Longest darkness</span><span class="num">${S.hw ? hrs(pick('longest_dark_h')) : range(rg.longest_dark_h, hrs)}</span></div>
      <div><span>Hours until first sunset</span><span class="num">${hrs(li.hours_to_sunset)}</span></div>
    </div><p class="x small">Ranges run from the worst to the best point of your landing area, over every lander orientation.</p></div>
    <div class="section"><h4>Talking to Earth</h4><div class="rows">
      <div><span>Time in contact</span><span class="num">${S.hw ? pct(pick('contact_pct')) : range(rg.contact_pct, pct)}</span></div>
      <div><span>Longest gap</span><span class="num">${hrs(c.longest_gap_h)}</span></div>
      <div><span>Data you can send</span><span class="num">${c.data_possible_mb != null ? fmt(c.data_possible_mb / 1000, 0) + ' GB' : '–'}</span></div>
    </div><p class="x small">Contact needs Earth above the local horizon and a NASA Deep Space Network dish that can see the Moon.</p></div>
    <div class="section"><h4>Power</h4><div class="rows">
      ${pw.energy_kwh != null ? `<div><span>Energy collected</span><span class="num">${fmt(pw.energy_kwh, 1)} kWh</span></div>` : ''}
      ${pw.max_sustainable_load_w != null ? `<div><span>Most power you can use nonstop</span><span class="num">${watts(pw.max_sustainable_load_w)}</span></div>` : ''}
      ${pw.array_needed_w != null ? `<div><span>Solar array you need</span><span class="num">${watts(pw.array_needed_w)}</span></div>` : ''}
      ${pw.battery_needed_wh != null || rg.battery_needed_wh ? `<div><span>Battery you need</span><span class="num">${S.hw ? wh(pick('battery_needed_wh')) : range(rg.battery_needed_wh, wh)}</span></div>` : ''}
    </div><p class="x small">When you have not given a panel or battery size, we tell you the size that would make the mission work here.</p></div>
    <div class="section"><h4>Hardware what-if</h4><div class="hw">
      <div class="line"><span>Mount panels on a 10 m mast</span><button class="toggle" data-hw="mast_10m" aria-pressed="${S.hw === 'mast_10m'}" aria-label="10 m mast"></button></div>
      <div class="line"><span>Sun-tracking panels</span><button class="toggle" data-hw="tracking_panels" aria-pressed="${S.hw === 'tracking_panels'}" aria-label="Sun-tracking panels"></button></div>
      ${h ? `<div class="delta">Sunlight ${pct(h.sun_pct[0])} becomes ${pct(h.sun_pct[1])}. Longest darkness ${hrs(h.longest_dark_h[0])} becomes ${hrs(h.longest_dark_h[1])}.</div>` : ''}
    </div></div>
    <div class="section"><h4>Landing</h4><div class="rows">
      <div><span>Sun at touchdown</span><span class="num">${level(L.sun_elevation_deg)}</span></div>
      <div><span>Earth at touchdown</span><span class="num">${L.earth_visible ? level(L.earth_elevation_deg) : 'Not visible'}</span></div>
      <div><span>Typical slope</span><span class="num">${fmt(tr.median_deg, 1)}° (steepest 10%: ${fmt(tr.p90_deg, 1)}°)</span></div>
      <div><span>Area safe for your slope limit</span><span class="num">${tr.safe_fraction != null ? pct(tr.safe_fraction * 100) : '–'}</span></div>
    </div>${L.shadow_risk ? `<p class="small">${esc(L.shadow_risk)}</p>` : ''}</div>
    <div class="section"><h4>Ice</h4><div class="rows">
      <div><span>Nearest permanently dark area</span><span class="num">${ice != null ? fmt(ice, 1) + ' km' : '–'}</span></div>
      <div><span>Nearest one larger than 1 km²</span><span class="num">${re.nearest_over_1km2_km != null ? fmt(re.nearest_over_1km2_km, 1) + ' km' : '–'}</span></div>
      <div class="line" style="display:flex;justify-content:space-between;align-items:center"><span>Show dark areas in blue</span><button class="toggle" id="iceT" aria-pressed="${S.ice}" aria-label="Show permanently dark areas"></button></div>
    </div><p class="x small">Permanently shadowed areas are where water ice can survive. Blue patches are drawn as circles with the real area of each one.</p></div>
    <div class="section"><h4>How sure we are</h4><div class="rows">
      <div><span>Terrain versions tested</span><span class="num">${tu.clones || '–'}</span></div>
      <div><span>Sunlight across terrain versions</span><span class="num">${range(tu.centre_sun_pct, pct)}</span></div>
      <div><span>Lander orientation</span><span class="num">${esc(o.orientation || '–')}</span></div>
    </div></div>
    <div class="section"><h4>Not checked here</h4><ul class="reasons">${(o.not_evaluated || []).map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>
    ${o.backup_site ? `<div class="section"><h4>Backup site</h4><p class="small" style="margin:0">${esc(o.backup_site.site_name)}, ${dateTime(o.backup_site.landing_utc)}: ${VERDICT[o.backup_site.verdict] ? VERDICT[o.backup_site.verdict].toLowerCase() : ''}.</p></div>` : ''}
    <button class="ghost" id="csv2">Export operations timeline</button>`;
  $$('[data-hw]').forEach(b => b.onclick = () => { S.hw = S.hw === b.dataset.hw ? null : b.dataset.hw; renderPanel(); applyTime(); });
  $('#iceT').onclick = () => { S.ice = !S.ice; [X.mesh, X.far, P.mesh].forEach(m => m && setIce(m.geometry)); renderPanel(); applyTime(); };
  $('#csv2').onclick = exportCSV;
  applyExplain();
}
function updateNow(st) {
  const el = $('#now'); if (!el) return;
  const sun = st.frac[1];
  el.innerHTML = `
    <div class="cell"><span><i class="dot" style="background:var(--sun)"></i>Sun</span><b class="num">${sun > 0.995 ? 'Full' : sun < 0.005 ? 'Hidden' : pct(sun * 100)}</b><span class="num">${level(st.sunEl)}</span></div>
    <div class="cell"><span><i class="dot" style="background:var(--earth)"></i>Earth</span><b>${st.contact ? 'In contact' : 'No contact'}</b><span class="num">${level(st.earthEl)}</span></div>
    ${st.power != null ? `<div class="cell"><span>Solar power</span><b class="num">${watts(st.power)}</b></div>` : ''}
    ${st.soc != null ? `<div class="cell"><span>Battery</span><b class="num">${pct(st.soc * (st.soc <= 1 ? 100 : 1))}</b></div>` : ''}`;
}
function drawSpark(cur) {
  const c = $('#spark'); if (!c) return;
  const s = series(), n = s.t.length, w = c.clientWidth * devicePixelRatio, h = c.height = 120 * devicePixelRatio; c.width = w;
  const g = c.getContext('2d'), sf = s.sun_frac_worst_median_best;
  g.clearRect(0, 0, w, h);
  const X_ = i => i / (n - 1) * w, top = h * 0.08, bot = h * 0.72;
  g.fillStyle = 'rgba(244,183,64,.18)'; g.beginPath(); g.moveTo(0, bot);
  for (let i = 0; i < n; i++) g.lineTo(X_(i), bot - sf[2][i] * (bot - top)); g.lineTo(w, bot); g.fill(); // best
  g.fillStyle = 'rgba(244,183,64,.85)'; g.beginPath(); g.moveTo(0, bot);
  for (let i = 0; i < n; i++) g.lineTo(X_(i), bot - sf[0][i] * (bot - top)); g.lineTo(w, bot); g.fill(); // worst
  if (s.battery_soc) { g.strokeStyle = '#34c77b'; g.lineWidth = 2 * devicePixelRatio; g.beginPath(); for (let i = 0; i < n; i++) { const v = s.battery_soc[i] <= 1 ? s.battery_soc[i] : s.battery_soc[i] / 100; g[i ? 'lineTo' : 'moveTo'](X_(i), bot - v * (bot - top)); } g.stroke(); }
  g.fillStyle = '#5aa9ff';
  for (let i = 0; i < n; i++) if (s.earth_contact[i]) g.fillRect(X_(i), h * 0.82, Math.max(1, w / n + 0.5), h * 0.1);
  g.fillStyle = '#fff'; g.fillRect(X_(cur) - devicePixelRatio, 0, 2 * devicePixelRatio, h);
}
function drawBars() {
  const c = $('#bars'), s = series(), n = s.t.length, w = c.width = c.clientWidth * devicePixelRatio, h = c.height = 20 * devicePixelRatio, g = c.getContext('2d');
  g.clearRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const x = i / n * w, ww = Math.max(1, w / n + 0.5);
    g.fillStyle = `rgba(244,183,64,${0.15 + 0.85 * s.sun_frac_worst_median_best[1][i]})`; g.fillRect(x, 0, ww, h * 0.48);
    g.fillStyle = s.earth_contact[i] ? '#5aa9ff' : 'rgba(90,169,255,.12)'; g.fillRect(x, h * 0.56, ww, h * 0.44);
  }
}

/* ---------- calendar ---------- */
function openCalendar(highlight) {
  const cal = S.data.calendar, ids = Object.keys(cal.sites), sh = $('#calendar');
  sh.classList.add('open');
  const first = cal.sites[ids[0]];
  $('#calSub').textContent = `Each column is a landing time, every ${cal.step_hours} hours from ${date(first[0][0])} to ${date(first[first.length - 1][0])}. Colours use the worst case.`;
  const c = $('#calCanvas'), dpr = devicePixelRatio, lw = 190, rowH = 22, n = first.length;
  const order = [...S.data.options.map(o => o.site), ...ids.filter(i => !S.data.options.some(o => o.site === i))];
  const w = c.clientWidth || 1000; c.width = w * dpr; c.height = (order.length * rowH + 26) * dpr; c.style.height = (order.length * rowH + 26) + 'px';
  const g = c.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, w, 999);
  const cw = (w - lw) / n;
  g.font = '13px -apple-system, Inter, sans-serif'; g.textBaseline = 'middle';
  order.forEach((id, r) => {
    const s = S.index.sites.find(x => x.id === id), rank = S.data.options.findIndex(o => o.site === id);
    g.fillStyle = id === highlight || rank >= 0 ? '#f2f3f5' : '#9ba1a8';
    let nm = (rank >= 0 ? `${rank + 1}. ` : '') + (s ? s.name : id); while (g.measureText(nm).width > lw - 12 && nm.length > 4) nm = nm.slice(0, -2) + '…';
    g.fillText(nm, 0, r * rowH + rowH / 2);
    cal.sites[id].forEach((row, k) => { g.fillStyle = row[2] === 'green' ? '#34c77b' : row[2] === 'yellow' ? '#ff9f0a' : 'rgba(255,90,79,.55)'; g.fillRect(lw + k * cw, r * rowH + 3, Math.max(1, cw - 0.4), rowH - 6); });
    if (id === highlight) { g.strokeStyle = '#fff'; g.strokeRect(lw - 2, r * rowH + 1, w - lw + 1, rowH - 2); }
  });
  S.data.options.forEach((o, r) => { // mark the recommended landing time
    const k = first.findIndex(row => row[0].slice(0, 13) === o.landing_utc.slice(0, 13));
    if (k >= 0) { g.fillStyle = '#fff'; g.beginPath(); g.arc(lw + k * cw + cw / 2, r * rowH + rowH / 2, 4, 0, 7); g.fill(); }
  });
  g.fillStyle = '#9ba1a8'; let lastM = -1;
  first.forEach((row, k) => { const d = new Date(row[0]); if (d.getUTCDate() === 1 && d.getUTCHours() === 0 && d.getUTCMonth() !== lastM) { lastM = d.getUTCMonth(); g.fillText(`${MON[lastM]} ${d.getUTCFullYear()}`, lw + k * cw, order.length * rowH + 13); } });
  c.onmousemove = e => {
    const r = c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, k = Math.floor((x - lw) / cw), row = Math.floor(y / rowH);
    if (k < 0 || k >= n || row >= order.length) { c.title = ''; return; }
    const v = cal.sites[order[row]][k]; c.title = `${dateTime(v[0])}: ${VERDICT[v[2]]}`;
  };
}

/* ---------- compare ---------- */
function renderCompare() {
  const o = S.data.options;
  const rows = [
    ['Landing time', x => dateTime(x.landing_utc)],
    ['Result in the worst case', x => `<span class="verdict v-${x.worst_case_verdict || x.verdict}">${VERDICT[x.worst_case_verdict || x.verdict]}</span>`],
    ['Time in sunlight', x => range(x.ranges.sun_pct, pct), x => x.ranges.sun_pct && x.ranges.sun_pct[0], 'max', 'Share of the stay with the Sun reaching your panels.'],
    ['Longest darkness', x => range(x.ranges.longest_dark_h, hrs), x => x.ranges.longest_dark_h && x.ranges.longest_dark_h[1], 'min', 'Your battery must carry you through this.'],
    ['Time in contact with Earth', x => range(x.ranges.contact_pct, pct), x => x.ranges.contact_pct && x.ranges.contact_pct[0], 'max'],
    ['Longest gap in contact', x => hrs(x.comms.longest_gap_h), x => x.comms.longest_gap_h, 'min'],
    ['Battery you need', x => range(x.ranges.battery_needed_wh, wh), x => x.ranges.battery_needed_wh && x.ranges.battery_needed_wh[1], 'min'],
    ['Most power you can use nonstop', x => range(x.ranges.max_sustainable_load_w, watts), x => x.ranges.max_sustainable_load_w && x.ranges.max_sustainable_load_w[0], 'max'],
    ['Solar array you need', x => range(x.ranges.array_needed_w, watts), x => x.ranges.array_needed_w && x.ranges.array_needed_w[1], 'min'],
    ['Typical slope', x => `${fmt(x.terrain.median_deg, 1)}°`, x => x.terrain.median_deg, 'min'],
    ['Nearest ice-bearing dark area', x => x.resources['nearest_over_0.01km2_km'] != null ? fmt(x.resources['nearest_over_0.01km2_km'], 1) + ' km' : '–', x => x.resources['nearest_over_0.01km2_km'], 'min', 'Permanently shadowed areas larger than 0.01 km².'],
    ['Landing can slip by', x => x.slip_tolerance_days != null ? fmt(x.slip_tolerance_days) + ' days' : '–', x => x.slip_tolerance_days, 'max', 'How long you can be late and still land with the same result.'],
    ['Backup site', x => x.backup_site ? `${esc(x.backup_site.site_name)}, ${date(x.backup_site.landing_utc)}` : '–'],
  ];
  let html = `<div class="rh ch"></div>` + o.map((x, i) => { const v = x.worst_case_verdict || x.verdict; return `<div class="ch"><div class="badge" style="background:${VCOL[v]}">${i + 1}</div><h3>${esc(x.site_name)}</h3></div>`; }).join('');
  for (const [name, f, key, best, help] of rows) {
    const vals = key ? o.map(key) : [];
    const ok = vals.filter(v => v != null && isFinite(v));
    if (key && !ok.length) continue;
    const target = key && ok.length > 1 ? (best === 'max' ? Math.max(...ok) : Math.min(...ok)) : null;
    const allSame = ok.length > 1 && ok.every(v => Math.abs(v - ok[0]) < 1e-9);
    html += `<div class="rh">${name}${help ? `<div class="x small">${help}</div>` : ''}</div>` + o.map((x, i) => `<div class="${target != null && !allSame && vals[i] === target ? 'best' : ''}">${f(x)}</div>`).join('');
  }
  $('#cmp').innerHTML = html;
  applyExplain();
}

/* ---------- exports ---------- */
function exportCSV() {
  const o = opt(), s = o.series_hourly, ev = {};
  for (const e of o.timeline_events || []) { const name = e.event.replace(/_/g, ' '); ev[e.time] = ev[e.time] ? ev[e.time] + '; ' + name : name; }
  const head = ['utc', 'hours_after_landing', 'sun_elevation_deg', 'sun_azimuth_deg', 'sunlit_fraction_worst', 'sunlit_fraction_median', 'sunlit_fraction_best', 'earth_elevation_deg', 'earth_azimuth_deg', 'earth_contact', 'solar_power_w', 'battery_soc', 'event'];
  const lines = [head.join(',')];
  for (let i = 0; i < s.t.length; i++) {
    const f = s.sun_frac_worst_median_best;
    lines.push([s.t[i], i, s.sun_el[i].toFixed(3), s.sun_az[i].toFixed(3), f[0][i].toFixed(3), f[1][i].toFixed(3), f[2][i].toFixed(3), s.earth_el[i].toFixed(3), s.earth_az[i].toFixed(3), s.earth_contact[i],
      s.power_w ? s.power_w[i].toFixed(1) : '', s.battery_soc ? s.battery_soc[i].toFixed(3) : '', `"${ev[s.t[i]] || ''}"`].join(','));
  }
  const meta = `# Lunar Site Scout operations timeline: ${o.site_name}, landing ${o.landing_utc}. Mission: ${S.data.mission}. Times UTC, hourly.\n`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([meta + lines.join('\n')], { type: 'text/csv' }));
  a.download = `timeline_${S.data.mission}_${o.site}.csv`; a.click();
}
function printReport() {
  const d = S.data, o = d.options;
  const row = (k, f) => `<tr><th>${k}</th>${o.map(x => `<td>${f(x)}</td>`).join('')}</tr>`;
  $('#report').innerHTML = `
    <h1>Lunar Site Scout: landing site report</h1>
    <p>Mission: ${esc(MISSIONS.find(m => m.id === S.mission).name)}. Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC.</p>
    <p><b>${esc(plainSummary())}</b></p>
    <p>${esc(d.trust_badge)}</p>
    <h2>Options</h2>
    <table><tr><th></th>${o.map((x, i) => `<th>${i + 1}. ${esc(x.site_name)}</th>`).join('')}</tr>
    ${row('Landing (UTC)', x => dateTime(x.landing_utc))}
    ${row('Worst-case result', x => VERDICT[x.worst_case_verdict || x.verdict])}
    ${row('Reasons', x => (x.reasons || []).map(esc).join('<br>') || 'None')}
    ${row('Time in sunlight', x => range(x.ranges.sun_pct, pct))}
    ${row('Longest darkness', x => range(x.ranges.longest_dark_h, hrs))}
    ${row('Contact with Earth', x => range(x.ranges.contact_pct, pct))}
    ${row('Longest contact gap', x => hrs(x.comms.longest_gap_h))}
    ${row('Battery needed', x => range(x.ranges.battery_needed_wh, wh))}
    ${row('Max continuous load', x => range(x.ranges.max_sustainable_load_w, watts))}
    ${row('Array needed', x => range(x.ranges.array_needed_w, watts))}
    ${row('Slope (median / p90)', x => `${fmt(x.terrain.median_deg, 1)}° / ${fmt(x.terrain.p90_deg, 1)}°`)}
    ${row('Nearest dark area (> 0.01 km²)', x => fmt(x.resources['nearest_over_0.01km2_km'], 1) + ' km')}
    ${row('Slip tolerance', x => x.slip_tolerance_days != null ? fmt(x.slip_tolerance_days) + ' days' : '–')}
    ${row('Landing shadow note', x => esc(x.landing.shadow_risk || ''))}
    </table>
    <h2>Where each input came from</h2>
    <table><tr><th>Field</th><th>Value</th><th>Source</th></tr>${(d.provenance || []).map(p => `<tr><td>${esc(p.field)}</td><td>${esc(JSON.stringify(p.value))}</td><td>${esc(LABEL[p.label] || p.label)}${p.source ? ': ' + esc(p.source) : ''}</td></tr>`).join('')}</table>
    <h2>Assumptions</h2><ul>${(d.assumptions || []).map(a => `<li>${esc(a)}</li>`).join('')}</ul>
    <h2>Not evaluated</h2><ul>${(d.not_evaluated || []).map(a => `<li>${esc(a)}</li>`).join('')}</ul>
    <h2>Data sources</h2><ul>${(d.data_sources || []).map(a => `<li>${esc(a)}</li>`).join('')}</ul>`;
  print();
}

/* ---------- explain mode ---------- */
function applyExplain() {
  document.body.classList.toggle('explain', S.explain);
  $$('[data-plain]').forEach(e => { if (!e.dataset.tech) e.dataset.tech = e.textContent; e.textContent = S.explain ? e.dataset.plain : e.dataset.tech; });
}

/* ---------- labels & loop ---------- */
let anim = null, last = performance.now();
function resize() {
  W = innerWidth; H = innerHeight; renderer.setSize(W, H, false);
  for (const c of [G.camera, P.camera, X.camera]) { c.aspect = W / H; c.updateProjectionMatrix(); }
  // globe sits to the right of the brief panel on wide screens
  if (W > 900) { G.camera.setViewOffset(W, H, -W * 0.18, 0, W, H); P.camera.setViewOffset(W, H, 200, 0, W, H); } else { G.camera.clearViewOffset(); P.camera.clearViewOffset(); }
  if (S.data && S.screen === 'explore') { drawBars(); applyTime(); }
}
addEventListener('resize', resize);
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (anim) anim(now);
  if (scene === 'globe') { if (!anim) G.controls.update(); renderer.render(G.scene, G.camera); }
  else if (scene === 'polar') {
    P.controls.update(); renderer.render(P.scene, P.camera);
    const v = new THREE.Vector3();
    for (const m of P.markers) { v.copy(m.pos).project(P.camera); const vis = v.z < 1 && S.screen === 'options'; m.el.style.display = vis ? '' : 'none'; if (vis) m.el.style.transform = `translate(${(v.x + 1) / 2 * W}px, ${(1 - v.y) / 2 * H}px)`; }
  } else {
    if (S.playing && S.data) {
      const n = series().t.length - 1;
      S.t += dt * S.speed; if (S.t >= n) { S.t = n; setPlaying(false); }
      applyTime();
    }
    if (S.view !== 'fp') X.controls.update();
    if (X.site) { const st = sample(S.t); X.sunSprite.position.copy(X.camera.position).addScaledVector(dirFromAzEl(X.site, st.sunAz, st.sunEl), 50000); X.earthSprite.position.copy(X.camera.position).addScaledVector(dirFromAzEl(X.site, st.earthAz, st.earthEl), 50000); }
    renderer.render(X.scene, X.camera);
  }
  requestAnimationFrame(frame);
}
function setPlaying(p) { S.playing = p; $('#play').textContent = p ? '❚❚' : '▶'; $('#play').setAttribute('aria-label', p ? 'Pause' : 'Play'); }

/* ---------- wiring ---------- */
$$('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));
$('#find').onclick = findOptions;
$('#openCal').onclick = () => openCalendar();
$('#closeCal').onclick = () => $('#calendar').classList.remove('open');
$('#toCompare').onclick = () => go('compare');
$('#pdf').onclick = printReport;
$('#csv').onclick = exportCSV;
$('#explain').onclick = () => { S.explain = !S.explain; $('#explain').setAttribute('aria-pressed', S.explain); applyExplain(); if (S.data) renderOptions(); applyExplain(); };
$('#play').onclick = () => { if (S.t >= series().t.length - 1) S.t = 0; setPlaying(!S.playing); };
$('#scrub').oninput = e => { S.t = +e.target.value; applyTime(); };
$$('#speed button').forEach(b => b.onclick = () => { S.speed = +b.dataset.s; $$('#speed button').forEach(x => x.setAttribute('aria-pressed', x === b)); });
$$('#views button').forEach(b => b.onclick = () => setView(b.dataset.view));
addEventListener('keydown', e => { if (e.key === 'Escape') $('#calendar').classList.remove('open'); if (e.key === ' ' && S.screen === 'explore' && e.target === document.body) { e.preventDefault(); $('#play').click(); } });

(async function init() {
  resize(); requestAnimationFrame(frame);
  renderPresets();
  try {
    [S.index, S.terrainInfo, S.psr] = await Promise.all([getJSON('index.json'), getJSON('terrain/terrain.json'), getJSON('psr.json')]);
    S.region = await getF32('terrain/' + S.terrainInfo.region.file);
  } catch (e) { $('#fields').innerHTML = `<p class="small">${esc(e.message)}. Open the app from a web server (GitHub Pages or <code>python3 -m http.server</code>), not as a local file.</p>`; }
  pickMission('griffin1');
})();
