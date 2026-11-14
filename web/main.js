import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { quickCheck, readDocument } from './quick.js';

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const D = 'web-data/';
const R_MOON = 1737400;
const getJSON = p => fetch(D + p).then(r => { if (!r.ok) throw new Error(`Could not load ${p}`); return r.json(); });
const getBuf = p => fetch(D + p).then(r => { if (!r.ok) throw new Error(`Could not load ${p}`); return r.arrayBuffer(); });
const rad = d => d * Math.PI / 180;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = n => String(n).padStart(2, '0');
const toDate = s => new Date(/Z|\+/.test(s) ? s : s + 'Z');
const date = s => { const d = toDate(s); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const dateTime = s => { const d = toDate(s); return `${date(s)}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`; };
const fmt = (x, d = 0) => x == null || !isFinite(x) ? '–' : Number(x).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const pct = x => fmt(x) + '%';
const hrs = x => x == null ? '–' : x >= 48 ? fmt(x / 24, 1) + ' days' : x < 10 && x % 1 ? fmt(x, 1) + ' h' : fmt(x) + ' h';
const wh = x => x == null ? '–' : x >= 1000 ? fmt(x / 1000, 1) + ' kWh' : fmt(x) + ' Wh';
const watts = x => x == null ? '–' : x >= 1000 ? fmt(x / 1000, 2) + ' kW' : fmt(x) + ' W';
const range = (r, f) => !r || r[0] == null ? '–' : f(r[0]) === f(r[1]) ? f(r[0]) : `${f(r[0])} to ${f(r[1])}`;
const level = e => e == null ? '–' : `${fmt(Math.abs(e), 1)}° ${e >= 0 ? 'above' : 'below'} level`;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const VC = { green: 'var(--go)', yellow: 'var(--care)', red: 'var(--nogo)' };
const VHEX = { green: '#2fd27a', yellow: '#ffb020', red: '#ff5a4f' };
const VSIMPLE = { green: 'Great place to land', yellow: 'Possible, with care', red: 'Not suitable' };
const VEXPERT = { green: 'Go, even in the worst case', yellow: 'Go with caveats', red: 'No go' };
const verdictOf = o => o.worst_case_verdict || o.verdict;
const vx = v => S.data && S.data.quick ? { green: 'Go', yellow: 'Go with caveats', red: 'No go' }[v] : VEXPERT[v];
const ICON = {
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="#f5b83d" stroke-width="2"><circle cx="12" cy="12" r="4.5" fill="#f5b83d"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1"/></svg>',
  dark: '<svg viewBox="0 0 24 24" fill="none" stroke="#a3a8b0" stroke-width="2"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/></svg>',
  earth: '<svg viewBox="0 0 24 24" fill="none" stroke="#4ea3ff" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3.5 9h17M3.5 15h17M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="#fff"><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg>',
  ice: '<svg viewBox="0 0 24 24" fill="none" stroke="#8fd8ff" stroke-width="2"><path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 3.5l3 2.5 3-2.5M9 20.5l3-2.5 3 2.5"/></svg>',
  slope: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M2 20h20L2 8z"/></svg>',
};
const fact = (icon, text, sub) => `<div class="fact">${ICON[icon]}<div>${text}${sub ? `<small>${sub}</small>` : ''}</div></div>`;

// plain words for each measure
const W = {
  sun: p => p >= 99.5 ? 'Always in sunlight' : p >= 90 ? 'Almost always sunny' : p >= 70 ? 'Mostly sunny' : p >= 40 ? 'Often in shadow' : 'Mostly dark',
  dark: h => h <= 0 ? 'Never goes dark' : h <= 12 ? `Short dark spells, ${hrs(h)} at most` : `Longest darkness: ${hrs(h)}`,
  earth: p => p >= 95 ? 'Earth almost always in view' : p >= 75 ? 'Earth usually in view' : p >= 40 ? 'Earth in view part of the time' : 'Earth rarely in view',
  energy: o => {
    const pw = o.power || {};
    if (pw.max_sustainable_load_w != null) return `Enough power for ${watts(pw.max_sustainable_load_w)} nonstop`;
    if (pw.array_needed_w != null) return `Needs about ${watts(pw.array_needed_w)} of solar panels`;
    if (pw.battery_needed_wh != null) return pw.battery_needed_wh < 1 ? 'No battery needed for darkness' : `Needs a ${wh(pw.battery_needed_wh)} battery for the dark`;
    return null;
  },
  ice: km => km == null ? null : km < 1 ? 'Ice-bearing dark area under 1 km away' : `Nearest ice-bearing dark area: ${fmt(km, 1)} km`,
};

const MISSIONS = [
  { id: 'griffin1', name: 'Griffin-1', who: 'Astrobotic robotic lander, 14 days on the surface.', kid: 'A robot lander carrying a small rover.' },
  { id: 'artemis', name: 'Artemis crewed landing', who: 'Astronauts who need sunlight all the time and a short walk to ice.', kid: 'People landing on the Moon again.' },
  { id: 'novac', name: 'Nova-C class', who: 'Small robotic lander with a known power budget.', kid: 'A small robot lander, like the ones that landed in 2024 and 2025.' },
  { id: 'argonaut', name: 'Argonaut', who: 'European cargo lander for a long stay. No power data yet.', kid: 'A European lander that brings supplies.' },
];

const S = { screen: 'hero', role: null, mode: 'simple', data: null, mission: null, opt: 0, t: 0, playing: false, speed: 8, view: 'drone',
  ice: true, hw: null, sites: {}, index: null, info: null, psr: null, region: null, regionSun: null, doc: null, q: 0, answers: null };

/* ---------- renderer ---------- */
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
let VW = innerWidth, VH = innerHeight;
const labels = document.createElement('div'); labels.id = 'labels'; document.body.appendChild(labels);

/* ---------- globe ---------- */
const G = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(28, 1, 0.01, 100), spin: 0, tilt: -0.12, tiltTo: -0.12, dist: 3.2, distTo: 3.2, off: 0.22, offTo: 0.22 };
{
  const tex = new THREE.TextureLoader().load('assets/moon_2k.jpg'); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  G.pivot = new THREE.Group(); G.scene.add(G.pivot);
  G.moon = new THREE.Mesh(new THREE.SphereGeometry(1, 192, 96), new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 }));
  G.pivot.add(G.moon);
  // ring marking the study area around the south pole (latitude -84)
  const pts = []; for (let k = 0; k <= 128; k++) pts.push(globePoint(-84, k / 128 * 360 - 180, 1.003));
  G.ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xf5b83d, transparent: true, opacity: 0 }));
  G.moon.add(G.ring);
  const sun = new THREE.DirectionalLight(0xffffff, 3.4); sun.position.set(-3, 1.4, 2.2); G.scene.add(sun);
  G.scene.add(new THREE.AmbientLight(0xffffff, 0.04));
  G.camera.position.set(0, 0, 3.2);
  const sp = new Float32Array(1800 * 3); for (let i = 0; i < 1800; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(30 + Math.random() * 20); sp.set([v.x, v.y, v.z], i * 3); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  G.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.06, transparent: true, opacity: 0.55, sizeAttenuation: true })); G.scene.add(G.stars);
  G.mx = 0; G.my = 0; addEventListener('pointermove', e => { G.mx = e.clientX / innerWidth - 0.5; G.my = e.clientY / innerHeight - 0.5; });
}
function globePoint(lat, lon, r = 1) { const phi = rad(lon + 180), th = rad(90 - lat); return new THREE.Vector3(-r * Math.cos(phi) * Math.sin(th), r * Math.cos(th), r * Math.sin(phi) * Math.sin(th)); }
const GLOBE_POSE = { hero: [-0.12, 3.0, 0.2], who: [-0.5, 3.6, 0.25], mission: [-1.0, 3.4, 0.25] };

/* ---------- terrain helpers ---------- */
function gridGeometry(z, n, px, half, step, o) {
  const { gcx = 0, gcy = 0, ox = 0, oy = 0, h0 = 0, unit = 1, hole = 0 } = o;
  const m = Math.floor((n - 1) / step) + 1, pos = new Float32Array(m * m * 3), map = new Float32Array(m * m * 2);
  for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) {
    const r = i * step, c = j * step, k = i * m + j, mx = gcx - half + c * px, my = gcy + half - r * px, dx = mx - ox, dy = my - oy;
    pos[k * 3] = dx / unit; pos[k * 3 + 1] = (z[r * n + c] - h0 - (dx * dx + dy * dy) / (2 * R_MOON)) / unit; pos[k * 3 + 2] = -dy / unit;
    map[k * 2] = mx; map[k * 2 + 1] = my;
  }
  const idx = [];
  for (let i = 0; i < m - 1; i++) for (let j = 0; j < m - 1; j++) {
    const a = i * m + j, b = a + 1, c = a + m, d = c + 1;
    if (hole && [a, b, c, d].every(q => Math.abs(map[q * 2] - ox) < hole && Math.abs(map[q * 2 + 1] - oy) < hole)) continue;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.Uint32BufferAttribute(idx, 1));
  g.computeVertexNormals();
  g.userData = { map, m };
  return g;
}
const regionSunAt = (mx, my) => {
  const t = S.info.region, n = t.shape[0], i = Math.round((t.half_width_m - my) / t.pixel_m), j = Math.round((mx + t.half_width_m) / t.pixel_m);
  if (i < 0 || j < 0 || i >= n || j >= n) return 255; return S.regionSun[i * n + j];
};
// base colour per vertex plus a version with the permanently shadowed regions in ice blue
function colourise(g, base, sunTint) {
  const { map, m } = g.userData, nv = m * m, plain = new Float32Array(nv * 3), ice = new Float32Array(nv * 3);
  for (let k = 0; k < nv; k++) {
    let r = base, gg = base, b = base;
    if (sunTint) { const s = regionSunAt(map[k * 2], map[k * 2 + 1]); if (s !== 255) { const t = S.info.region.half_width_m, edge = Math.min(1, Math.max(0, (151000 - Math.max(Math.abs(map[k * 2]), Math.abs(map[k * 2 + 1]))) / 20000)); const f = Math.min(1, Math.max(0, (s - 12) / 30)) * edge * 0.85; r = base + (1.0 - base) * f; gg = base + (0.78 - base) * f; b = base + (0.32 - base) * f; } }
    plain[k * 3] = ice[k * 3] = r; plain[k * 3 + 1] = ice[k * 3 + 1] = gg; plain[k * 3 + 2] = ice[k * 3 + 2] = b;
  }
  const x0 = map[0], y0 = map[1], dx = map[2] - map[0], dy = map[m * 2 + 1] - map[1], P = S.psr;
  for (let p = 0; p < P.x_m.length; p++) {
    const rr = Math.sqrt(P.area_km2[p] * 1e6 / Math.PI), cx = P.x_m[p], cy = P.y_m[p];
    const j0 = Math.max(0, Math.floor((cx - rr - x0) / dx)), j1 = Math.min(m - 1, Math.ceil((cx + rr - x0) / dx));
    const ia = Math.floor((cy + rr - y0) / dy), ib = Math.ceil((cy - rr - y0) / dy), i0 = Math.max(0, Math.min(ia, ib)), i1 = Math.min(m - 1, Math.max(ia, ib));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = i * m + j, ex = map[k * 2] - cx, ey = map[k * 2 + 1] - cy;
      if (ex * ex + ey * ey <= rr * rr) { ice[k * 3] = plain[k * 3] * 0.35 + 0.3; ice[k * 3 + 1] = plain[k * 3 + 1] * 0.35 + 0.52; ice[k * 3 + 2] = plain[k * 3 + 2] * 0.35 + 0.66; }
    }
  }
  g.userData.cols = { plain, ice };
  g.setAttribute('color', new THREE.BufferAttribute((S.ice ? ice : plain).slice(), 3));
}
function setIce(g) { if (g && g.userData.cols) { g.attributes.color.array.set(S.ice ? g.userData.cols.ice : g.userData.cols.plain); g.attributes.color.needsUpdate = true; } }
function sampleH(z, n, px, half, gcx, gcy, mx, my) {
  const c = (mx - (gcx - half)) / px, r = ((gcy + half) - my) / px;
  const c0 = Math.max(0, Math.min(n - 2, Math.floor(c))), r0 = Math.max(0, Math.min(n - 2, Math.floor(r))), fc = c - c0, fr = r - r0, q = (a, b) => z[a * n + b];
  return (q(r0, c0) * (1 - fc) + q(r0, c0 + 1) * fc) * (1 - fr) + (q(r0 + 1, c0) * (1 - fc) + q(r0 + 1, c0 + 1) * fc) * fr;
}
// lunar azimuth/elevation at a site -> world direction (site north/east unit vectors are given in map coordinates)
function dirFromAzEl(site, az, el) {
  const n = site.north_vec_map, e = site.east_vec_map, ca = Math.cos(rad(az)), sa = Math.sin(rad(az)), ce = Math.cos(rad(el));
  return new THREE.Vector3(ce * (ca * n[0] + sa * e[0]), Math.sin(rad(el)), -ce * (ca * n[1] + sa * e[1])).normalize();
}

/* ---------- polar map (km) ---------- */
const P = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(38, 1, 0.1, 3000), markers: [] };
P.controls = new OrbitControls(P.camera, canvas);
Object.assign(P.controls, { enableDamping: true, dampingFactor: 0.08, minDistance: 8, maxDistance: 600, maxPolarAngle: rad(75), enabled: false });
P.sun = new THREE.DirectionalLight(0xffffff, 2.2); P.scene.add(P.sun, P.sun.target);
P.scene.add(new THREE.HemisphereLight(0xffffff, 0x303030, 0.9));
function buildPolar() {
  if (P.mesh) return;
  const t = S.info.region, g = gridGeometry(S.region, t.shape[0], t.pixel_m, t.half_width_m, 1, { unit: 1000 });
  colourise(g, 0.5, true);
  P.mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  P.scene.add(P.mesh);
}
const polarH = (mx, my) => { const t = S.info.region; return sampleH(S.region, t.shape[0], t.pixel_m, t.half_width_m, 0, 0, mx, my) - (mx * mx + my * my) / (2 * R_MOON); };
function placeMarkers() {
  P.markers.forEach(m => m.el.remove()); P.markers = [];
  const opts = S.data.options;
  for (const s of S.index.sites) {
    const rank = opts.findIndex(o => o.site === s.id), el = document.createElement('button');
    el.className = 'pin' + (rank >= 0 ? ' top' : '');
    if (rank >= 0) el.style.setProperty('--c', VC[verdictOf(opts[rank])]);
    el.innerHTML = rank >= 0 ? `<span class="rk">${rank + 1}</span><span class="pl">${esc(s.name)}</span>` : `<span class="dotm"></span><span class="pl">${esc(s.name)}</span>`;
    el.setAttribute('aria-label', rank >= 0 ? `Option ${rank + 1}: ${s.name}` : s.name);
    el.onclick = () => rank >= 0 ? openExplore(rank) : sitePopover(s, el);
    el.style.display = 'none'; labels.appendChild(el);
    P.markers.push({ el, top: rank >= 0, pos: new THREE.Vector3(s.x_m / 1000, polarH(s.x_m, s.y_m) / 1000 + 0.3, -s.y_m / 1000) });
  }
}
function sitePopover(s, el) {
  $$('.pop').forEach(p => p.remove());
  const w = (S.data.landing_windows || {})[s.id] || [], pop = document.createElement('div'); pop.className = 'pop';
  pop.innerHTML = `<b>${esc(s.name)}</b><div class="small">${w.length ? `Not in your top three. ${w.length} landing window${w.length > 1 ? 's' : ''} for your dates, the first from ${date(w[0].open)}.` : 'No landing time works here for your mission and dates.'}</div><button class="btn" style="margin-top:6px;padding:9px 16px">See in calendar</button>`;
  pop.querySelector('button').onclick = () => { pop.remove(); openCalendar(s.id); };
  document.body.appendChild(pop);
  const r = el.getBoundingClientRect(); pop.style.left = Math.min(innerWidth - 310, r.left) + 'px'; pop.style.top = Math.min(innerHeight - 200, r.bottom + 8) + 'px';
  setTimeout(() => addEventListener('pointerdown', function off(e) { if (!pop.contains(e.target)) { pop.remove(); removeEventListener('pointerdown', off); } }), 0);
}
function framePolar() {
  const pts = S.data.options.map(o => S.index.sites.find(s => s.id === o.site));
  const cx = pts.reduce((a, s) => a + s.x_m, 0) / pts.length / 1000, cy = pts.reduce((a, s) => a + s.y_m, 0) / pts.length / 1000;
  const spread = Math.max(30, ...pts.map(s => Math.hypot(s.x_m / 1000 - cx, s.y_m / 1000 - cy)));
  const d = spread * 3.0;
  P.controls.target.set(cx, 0, -cy);
  P.camera.position.set(cx + d * 0.1, d * 1.0, -cy + d * 0.42);
  P.scene.fog = new THREE.Fog(0x000000, d * 1.3, d * 3.2);
  P.controls.update();
  const s0 = S.sites[S.data.options[0].site], az = S.data.options[0].landing.sun_azimuth_deg;
  // relief light for reading the map: real Sun azimuth at option 1, raised to 25 degrees
  const dir = dirFromAzEl(s0, az, 25); P.sun.position.copy(dir).multiplyScalar(400).add(P.controls.target); P.sun.target.position.copy(P.controls.target);
}

/* ---------- site explorer (m) ---------- */
const X = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(55, 1, 0.3, 150000), yaw: 0, pitch: 0 };
X.controls = new OrbitControls(X.camera, canvas);
Object.assign(X.controls, { enableDamping: true, dampingFactor: 0.08, minDistance: 15, maxDistance: 30000, maxPolarAngle: rad(88), enabled: false });
X.sun = new THREE.DirectionalLight(0xfff3dd, 4.2); X.sun.castShadow = true; X.sun.shadow.mapSize.set(4096, 4096); X.sun.shadow.bias = -0.0004; X.sun.shadow.normalBias = 1.5;
X.scene.add(X.sun, X.sun.target);
X.fill = new THREE.HemisphereLight(0xffffff, 0x2a2a2a, 0.42); X.scene.add(X.fill); // display fill so shaded ground stays readable
{
  const mk = (rgb, core) => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(core, `rgba(${rgb},1)`); gr.addColorStop(Math.min(1, core + 0.12), `rgba(${rgb},.35)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true, toneMapped: false }));
  };
  X.sunSprite = mk('255,236,190', 0.18); X.earthSprite = mk('120,180,255', 0.45); X.scene.add(X.sunSprite, X.earthSprite);
  const grp = new THREE.Group(), foil = new THREE.MeshStandardMaterial({ color: 0xd4ad4f, metalness: 0.6, roughness: 0.35 }), grey = new THREE.MeshStandardMaterial({ color: 0xd0d3d8, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 1.6, 8), foil); body.position.y = 2.0; grp.add(body);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 2.2), grey); deck.position.y = 2.9; grp.add(deck);
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4, leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6), grey); leg.position.set(Math.cos(a) * 1.9, 1.0, Math.sin(a) * 1.9); leg.rotation.z = Math.cos(a) * 0.5; leg.rotation.x = -Math.sin(a) * 0.5; grp.add(leg); }
  grp.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  X.lander = grp; X.scene.add(grp);
}
async function siteMeta(id) { return S.sites[id] || (S.sites[id] = await getJSON(`${id}.json`)); }
async function buildSite(sid) {
  if (X.sid === sid) return; X.sid = sid;
  for (const k of ['mesh', 'far', 'ring']) if (X[k]) { X.scene.remove(X[k]); X[k].geometry.dispose(); X[k] = null; }
  const site = await siteMeta(sid), z = new Float32Array(await getBuf(`terrain/${sid}_10m.bin`));
  const t = S.info.sites, n = t.shape[0], half = t.half_width_m, h0 = z[((n - 1) / 2) * n + (n - 1) / 2], ox = site.x_m, oy = site.y_m;
  const weak = /Mobi|Android/i.test(navigator.userAgent) || (navigator.hardwareConcurrency || 8) <= 4;
  const g = gridGeometry(z, n, t.pixel_m, half, weak ? 2 : 1, { gcx: ox, gcy: oy, ox, oy, h0 });
  colourise(g, 0.74, false);
  X.mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })); X.mesh.castShadow = X.mesh.receiveShadow = true; X.scene.add(X.mesh);
  // surrounding terrain at 600 m so the horizon is not a cliff (lit, casts no shadows)
  const rt = S.info.region, rn = rt.shape[0], sn = 141, hw = 70, sub = new Float32Array(sn * sn);
  const ci = Math.round((rt.half_width_m - oy) / rt.pixel_m), cj = Math.round((ox + rt.half_width_m) / rt.pixel_m);
  for (let i = 0; i < sn; i++) for (let j = 0; j < sn; j++) sub[i * sn + j] = S.region[Math.max(0, Math.min(rn - 1, ci - hw + i)) * rn + Math.max(0, Math.min(rn - 1, cj - hw + j))];
  const fg = gridGeometry(sub, sn, rt.pixel_m, hw * rt.pixel_m, 1, { gcx: -rt.half_width_m + cj * rt.pixel_m, gcy: rt.half_width_m - ci * rt.pixel_m, ox, oy, h0, hole: half - 600 });
  colourise(fg, 0.64, false);
  X.far = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })); X.scene.add(X.far);
  Object.assign(X, { site, z, n, h0, half, px: t.pixel_m, box: new THREE.Box3().setFromBufferAttribute(g.attributes.position) });
}
function setPaths() {
  for (const k of ['sunPath', 'earthPath']) if (X[k]) { X.scene.remove(X[k]); X[k].geometry.dispose(); }
  const s = series(), mk = (az, el, col, size) => {
    const pts = []; for (let i = 0; i < s.t.length; i += 2) pts.push(dirFromAzEl(X.site, az[i], el[i]).multiplyScalar(70).add(new THREE.Vector3(0, 3, 0)));
    return new THREE.Points(new THREE.BufferGeometry().setFromPoints(pts), new THREE.PointsMaterial({ color: col, size, transparent: true, opacity: 0.9, depthWrite: false }));
  };
  // where the Sun and Earth travel in the sky during the stay, drawn 70 m around the lander
  X.sunPath = mk(s.sun_az, s.sun_el, 0xf5b83d, 1.6); X.earthPath = mk(s.earth_az, s.earth_el, 0x4ea3ff, 1.6);
  X.scene.add(X.sunPath, X.earthPath);
}
function setRing(radius) {
  if (X.ring) { X.scene.remove(X.ring); X.ring.geometry.dispose(); }
  const pts = [], s = X.site;
  for (let k = 0; k <= 96; k++) { const a = k / 96 * Math.PI * 2, dx = Math.cos(a) * radius, dy = Math.sin(a) * radius; pts.push(new THREE.Vector3(dx, sampleH(X.z, X.n, X.px, X.half, s.x_m, s.y_m, s.x_m + dx, s.y_m + dy) - X.h0 + 0.6, -dy)); }
  X.ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffffff })); X.scene.add(X.ring);
}
function fitShadow(dir) {
  const L = X.sun; L.position.copy(dir).multiplyScalar(20000); L.target.position.set(0, 0, 0); L.updateMatrixWorld(); L.target.updateMatrixWorld();
  const look = new THREE.Matrix4().lookAt(L.position, L.target.position, Math.abs(dir.y) > 0.99 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0));
  const inv = new THREE.Matrix4().copy(look).setPosition(L.position).invert(), b = X.box, c = new THREE.Box3();
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) c.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(inv));
  const cam = L.shadow.camera; Object.assign(cam, { left: c.min.x - 20, right: c.max.x + 20, bottom: c.min.y - 20, top: c.max.y + 20, near: Math.max(1, -c.max.z - 50), far: -c.min.z + 50 });
  cam.updateProjectionMatrix(); renderer.shadowMap.needsUpdate = true;
}

/* ---------- time ---------- */
const opt = () => S.data.options[S.opt];
const series = () => opt().series_hourly;
const lerpAng = (a, b, f) => a + (((b - a + 540) % 360) - 180) * f;
function sample(t) {
  const s = series(), n = s.t.length, i = Math.max(0, Math.min(n - 1, Math.floor(t))), j = Math.min(n - 1, i + 1), f = Math.min(1, Math.max(0, t - i)), L = a => a[i] * (1 - f) + a[j] * f, sf = s.sun_frac_worst_median_best;
  return { i, sunAz: lerpAng(s.sun_az[i], s.sun_az[j], f), sunEl: L(s.sun_el), earthAz: lerpAng(s.earth_az[i], s.earth_az[j], f), earthEl: L(s.earth_el),
    frac: L(sf[1]), contact: s.earth_contact[f < 0.5 ? i : j], power: s.power_w ? L(s.power_w) : null, soc: s.battery_soc ? L(s.battery_soc) : null };
}
function applyTime() {
  if (!X.site) return;
  const st = sample(S.t), sd = dirFromAzEl(X.site, st.sunAz, st.sunEl);
  fitShadow(sd);
  X.sun.intensity = 4.2 * st.frac; // share of the solar disc above the terrain, from our horizon data (terrain up to 300 km away)
  X.sunSprite.material.opacity = st.frac > 0 ? 1 : 0; X.earthSprite.material.opacity = st.earthEl > -1 ? 1 : 0;
  $('#scrub').value = S.t;
  const s = series(), now = new Date(toDate(s.t[0]).getTime() + S.t * 3600e3), dh = Math.floor(S.t);
  $('#clock').innerHTML = `Day ${Math.floor(dh / 24) + 1}<small>${date(now.toISOString())}, ${pad(now.getUTCHours())}:00 UTC</small>`;
  const sunTxt = st.frac > 0.99 ? 'Sunlit' : st.frac < 0.01 ? 'In shadow' : 'Partly sunlit';
  $('#status').innerHTML = `<div class="chip" style="--c:${st.frac > 0.01 ? 'var(--sun)' : 'var(--muted)'}">${st.frac > 0.01 ? ICON.sun : ICON.dark}${sunTxt}</div>
    <div class="chip" style="--c:${st.contact ? 'var(--earth)' : 'var(--muted)'}">${ICON.earth}${st.contact ? 'Talking to Earth' : 'No contact with Earth'}</div>
    ${st.power != null ? `<div class="chip" style="--c:#fff">${ICON.bolt}${watts(st.power)} from the Sun</div>` : ''}
    ${st.soc != null ? `<div class="chip" style="--c:var(--go)">Battery ${pct(st.soc * (st.soc <= 1 ? 100 : 1))}</div>` : ''}
    <div class="chip xp" style="--c:var(--line)">Sun ${level(st.sunEl)}</div>`;
}
function drawBars() {
  const c = $('#bars'), s = series(), n = s.t.length, w = c.width = c.clientWidth * devicePixelRatio, h = c.height = 12 * devicePixelRatio, g = c.getContext('2d');
  g.clearRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const x = i / n * w, ww = Math.max(1, w / n + 0.5), f = s.sun_frac_worst_median_best[1][i];
    g.fillStyle = f > 0.5 ? '#f5b83d' : 'rgba(255,255,255,.12)'; g.fillRect(x, 0, ww, h * 0.45);
    g.fillStyle = s.earth_contact[i] ? '#4ea3ff' : 'rgba(255,255,255,.12)'; g.fillRect(x, h * 0.58, ww, h * 0.42);
  }
}

/* ---------- navigation ---------- */
const ORDER = ['hero', 'who', 'mission', 'results', 'explore', 'compare'];
let scene = 'globe', anim = null;
function go(name) {
  if (['results', 'explore', 'compare'].includes(name) && !S.data) return;
  const prev = S.screen; S.screen = name; document.body.dataset.screen = name;
  $$('.screen').forEach(s => s.classList.toggle('on', s.id === name));
  $$('.pop').forEach(p => p.remove()); $('#calendar').classList.remove('open');
  const idx = ORDER.indexOf(name);
  $$('#progress li').forEach(li => { const k = ORDER.indexOf(li.dataset.step); li.className = k === idx ? 'now' : k < idx ? 'done reach' : (S.data && k <= 5 ? 'reach' : ''); });
  P.controls.enabled = name === 'results'; X.controls.enabled = name === 'explore' && S.view !== 'fp';
  if (GLOBE_POSE[name]) { scene = 'globe'; [G.tiltTo, G.distTo, G.offTo] = GLOBE_POSE[name]; G.ring.material.opacity = name === 'mission' ? 0.9 : 0; }
  if (name === 'results') { if (prev === 'explore' || prev === 'compare') { scene = 'polar'; } else flyToPole(); }
  if (name === 'explore') scene = 'site';
  if (name === 'compare') renderCompare();
  if (name === 'hero') { S.role = null; }
  setPlaying(false);
}
function flyToPole() {
  scene = 'globe';
  const from = { tilt: G.tilt, dist: G.dist, off: G.off }, t0 = performance.now(), dur = matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 1800;
  anim = now => {
    const k = Math.min(1, (now - t0) / dur), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    G.tilt = G.tiltTo = from.tilt + (-Math.PI / 2 - from.tilt) * e; G.dist = G.distTo = from.dist + (1.18 - from.dist) * e; G.off = G.offTo = from.off * (1 - e);
    $('#fade').style.opacity = k > 0.78 ? (k - 0.78) * 4.5 : 0;
    if (k >= 1) { anim = null; scene = 'polar'; framePolar(); setTimeout(() => $('#fade').style.opacity = 0, 60); }
  };
}

/* ---------- step 1: who ---------- */
$$('#roles .choice').forEach(b => b.onclick = () => {
  S.role = b.dataset.role; $$('#roles .choice').forEach(x => x.setAttribute('aria-pressed', x === b));
  setMode(S.role === 'student' || S.role === 'past' ? 'simple' : 'expert');
  S.q = 0; S.doc = null; renderMission(); go('mission');
});

/* ---------- step 2: mission ---------- */
function renderMission() {
  const el = $('#missionBody');
  if (S.role === 'past' || S.role === 'student') {
    const kid = S.role === 'student';
    el.innerHTML = `<h2>${kid ? 'Pick a mission' : 'Pick a mission'}</h2><p class="lead">${kid ? 'We show you where it should land on the Moon, and why.' : 'Results use the full analysis: the whole landing area, every lander orientation and NASA terrain error.'}</p>
      <div class="choices">${MISSIONS.map(m => `<button class="choice" data-m="${m.id}"><b>${m.name}</b><span>${kid ? m.kid : m.who}</span></button>`).join('')}</div>`;
    $$('#missionBody [data-m]').forEach(b => b.onclick = () => loadPreset(b.dataset.m, b));
  } else if (S.role === 'project' && !S.doc) {
    el.innerHTML = `<h2>Upload your mission document</h2><p class="lead">A payload user guide or mission description in PDF. It stays on your computer: we read it in your browser.</p>
      <label class="drop" id="drop"><input type="file" accept="application/pdf" hidden id="file"><b>Drop your PDF here</b><span class="small">or click to choose a file</span></label>
      <div class="bar-load" hidden id="docLoad"><i></i></div>
      <p class="small" style="margin-top:22px">No document at hand? <button class="btn ghost" id="example" style="padding:0;letter-spacing:.08em">See the Griffin-1 example</button></p>`;
    const drop = $('#drop'), file = $('#file');
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); }; drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) readDoc(e.dataTransfer.files[0]); };
    file.onchange = () => file.files[0] && readDoc(file.files[0]);
    $('#example').onclick = () => { S.role = 'past'; loadPreset('griffin1'); };
  } else if (S.role === 'project' && S.doc && S.q < 0) {
    const F = S.doc.fields, names = { durationDays: ['Time on the surface', v => `${v} days`], batteryWh: ['Battery', wh], loadW: ['Power use', watts], dte: ['Talks directly to Earth', () => 'Yes'], maxSlope: ['Steepest safe slope', v => `${v}°`], ellipseM: ['Landing accuracy', v => `within ${v} m`] };
    const rows = Object.entries(F).filter(([k, f]) => names[k]).map(([k, f]) => `<div><span>${names[k][0]}</span><span>${f.v == null ? 'Two different values, we will ask you' : esc(names[k][1](f.v))}</span></div>`).join('');
    el.innerHTML = `<h2>${rows ? 'Here is what we found' : 'We could not find values'}</h2><p class="lead">${rows ? `We read ${S.doc.pages} pages. Check these, then answer a few questions for what is missing.` : 'This document has none of the values we look for. Answer a few short questions instead.'}</p>
      ${rows ? `<div class="found">${rows}</div>` : ''}<div class="qnav"><button class="btn primary" id="toQ">Continue</button></div>`;
    $('#toQ').onclick = () => { S.q = 0; renderMission(); };
  } else renderQuestion();
}
async function readDoc(f) {
  $('#docLoad').hidden = false; $('#docLoad i').style.width = '30%';
  try { S.doc = await readDocument(f); $('#docLoad i').style.width = '100%'; S.q = -1; renderMission(); }
  catch (e) { $('#missionBody .lead').textContent = `We could not read this file (${e.message}). Try another PDF, or answer the questions instead.`; }
}
async function loadPreset(id, btn) {
  if (btn) btn.querySelector('span').textContent = 'Loading…';
  S.mission = id; S.data = await getJSON(`options/${id}.json`);
  await afterData();
}
async function afterData() {
  await Promise.all(S.data.options.map(o => siteMeta(o.site)));
  S.opt = 0; X.sid = null; buildPolar(); placeMarkers(); renderResults(); go('results');
}

// question flow: one question per screen, values found in the document are pre-filled
const QS = [
  { k: 'earliestUtc', q: 'When is the earliest you can land?', type: 'date', def: '2027-06-01' },
  { k: 'slipDays', q: 'How late could you land?', why: 'We look for the best time inside this window.', opts: [[0, 'Only on that date'], [7, 'Up to a week later'], [30, 'Up to a month later'], [60, 'Up to two months later']], def: 30 },
  { k: 'durationDays', q: 'How long will you stay on the surface?', opts: [[7, 'One week'], [14, 'Two weeks'], [30, 'One month'], [90, 'Three months']], other: 'days', def: 14 },
  { k: 'continuousSun', q: 'Do you need sunlight all the time?', why: 'Some missions cannot survive a single night.', opts: [[true, 'Yes, always'], [false, 'No, short nights are fine']], def: false },
  { k: 'earthAtLanding', q: 'Must you talk to Earth while landing?', opts: [[true, 'Yes'], [false, 'No']], def: true },
  { k: 'loadW', q: 'How much power does your mission use?', why: 'If you do not know, we tell you how big the battery must be per watt.', type: 'number', unit: 'watts', unknown: 'I don\'t know yet', def: null },
  { k: 'batteryWh', q: 'How big is your battery?', type: 'number', unit: 'watt-hours', unknown: 'I don\'t know yet', def: null },
  { k: 'mast', q: 'Where are your solar panels?', why: 'Higher panels see the Sun for longer.', opts: [[false, 'On the lander, about 2 m up'], [true, 'On a 10 m mast']], def: false },
];
function renderQuestion() {
  if (!S.answers) S.answers = Object.fromEntries(QS.map(x => [x.k, x.def]));
  const F = (S.doc && S.doc.fields) || {};
  for (const [k, f] of Object.entries(F)) if (f.v != null && k in S.answers && !S.answers['_set_' + k]) { S.answers[k] = f.v; S.answers['_set_' + k] = 1; }
  if (F.dte && F.dte.v) S.answers.dte = true;
  const Q = QS[S.q], v = S.answers[Q.k], el = $('#missionBody'), fromDoc = F[Q.k] && F[Q.k].v != null ? `<span class="from-doc">From your document, ${esc(F[Q.k].src.split(':')[0])}</span>`
    : F[Q.k] && F[Q.k].conflict ? `<span class="from-doc" style="color:var(--care)">Your document gives different values: ${F[Q.k].conflict.map(c => `${esc(c.v)} on page ${c.page}`).join(', ')}. Pick the one for this mission.</span>` : '';
  let body = '';
  if (Q.opts) body = `<div class="choices${Q.opts.length === 2 ? ' two' : ''}">${Q.opts.map(([val, lab]) => `<button class="choice" data-v='${JSON.stringify(val)}' aria-pressed="${JSON.stringify(v) === JSON.stringify(val)}"><b>${lab}</b></button>`).join('')}</div>`
    + (Q.other ? `<div class="field-in"><input type="number" min="1" max="360" id="other" placeholder="Other" value="${Q.opts.some(o => o[0] === v) ? '' : v ?? ''}"><span>${Q.other}</span></div>` : '');
  else if (Q.type === 'date') body = `<div class="field-in"><input type="date" id="inp" min="2026-11-02" max="2032-08-01" value="${String(v).slice(0, 10)}"></div>`;
  else body = `<div class="field-in"><input type="number" min="0" id="inp" value="${v ?? ''}" placeholder="0"><span>${Q.unit}</span></div><div class="choices"><button class="choice" id="unk" aria-pressed="${v == null}"><b>${Q.unknown}</b></button></div>`;
  el.innerHTML = `<div class="qcount">Question ${S.q + 1} of ${QS.length}</div><h2>${Q.q}</h2>${Q.why ? `<p class="lead">${Q.why}</p>` : ''}${fromDoc}${body}
    <div class="qnav"><button class="btn primary" id="qnext">${S.q === QS.length - 1 ? 'Find my landing sites' : 'Next'}</button></div><div class="bar-load" hidden id="qLoad"><i></i></div><p class="small" id="qErr"></p>`;
  $$('#missionBody .choice[data-v]').forEach(b => b.onclick = () => { S.answers[Q.k] = JSON.parse(b.dataset.v); $$('#missionBody .choice[data-v]').forEach(x => x.setAttribute('aria-pressed', x === b)); if (!Q.other) nextQ(); });
  const inp = $('#inp'); if (inp) inp.oninput = () => { S.answers[Q.k] = Q.type === 'date' ? inp.value : (inp.value === '' ? null : +inp.value); const u = $('#unk'); if (u) u.setAttribute('aria-pressed', inp.value === ''); };
  const oth = $('#other'); if (oth) oth.oninput = () => { if (oth.value) { S.answers[Q.k] = +oth.value; $$('#missionBody .choice').forEach(x => x.setAttribute('aria-pressed', false)); } };
  const unk = $('#unk'); if (unk) unk.onclick = () => { S.answers[Q.k] = null; inp.value = ''; unk.setAttribute('aria-pressed', true); nextQ(); };
  $('#qnext').onclick = nextQ;
}
function nextQ() { if (S.q < QS.length - 1) { S.q++; renderQuestion(); } else runQuick(); }
async function runQuick() {
  const a = S.answers, bar = $('#qLoad'); bar.hidden = false; $('#qnext').disabled = true;
  try {
    await Promise.all(S.index.sites.map(s => siteMeta(s.id)));
    const p = { earliestUtc: a.earliestUtc + 'T00:00:00Z', slipDays: a.slipDays, durationDays: a.durationDays, mast: a.mast, continuousSun: a.continuousSun, earthAtLanding: a.earthAtLanding, loadW: a.loadW, batteryWh: a.batteryWh, dte: true };
    S.data = await quickCheck(p, S.index, S.sites, f => $('#qLoad i').style.width = Math.round(f * 100) + '%');
    S.data.profile = p; S.mission = 'custom';
    await afterData();
  } catch (e) { $('#qErr').textContent = e.message; $('#qnext').disabled = false; }
}

/* ---------- step 3: results ---------- */
function renderResults() {
  const o = S.data.options, best = o[0], v = verdictOf(best);
  const head = { green: `Land at ${best.site_name}.`, yellow: `${best.site_name} is your best option.`, red: 'No site fully meets your needs.' };
  $('#answer').textContent = head[v];
  $('#answerSub').innerHTML = `<span class="sp">${v === 'red' ? 'These are the closest matches. Each card says what goes wrong.' : `Best landing time: ${dateTime(best.landing_utc)}. Tap a card to see the place in 3D.`}</span>
    <span class="xp">${esc(S.data.trust_badge)}${S.data.quick ? '. Quick check: open Compare for what it does not cover.' : ''}</span>`;
  $('#cards').innerHTML = o.map((x, i) => {
    const vv = verdictOf(x), en = W.energy(x), ice = x.resources && x.resources['nearest_over_0.01km2_km'];
    return `<article class="card" style="--c:${VC[vv]}">
      <div class="top"><span class="rank">${i + 1}</span><div><h3>${esc(x.site_name)}</h3><div class="when">${date(x.landing_utc)}</div></div></div>
      <div class="verdict"><span class="sp">${VSIMPLE[vv]}</span><span class="xp">${vx(vv)}</span></div>
      <div class="facts sp">${fact(x.light.sun_pct > 50 ? 'sun' : 'dark', W.sun(x.light.sun_pct))}${fact('earth', W.earth(x.comms.contact_pct))}${en ? fact('bolt', en) : ''}</div>
      <div class="facts xp">${fact('sun', `Sunlight ${range(x.ranges && x.ranges.sun_pct || [x.light.sun_pct, x.light.sun_pct], pct)}`, `Longest darkness ${range(x.ranges && x.ranges.longest_dark_h || [x.light.longest_dark_h, x.light.longest_dark_h], hrs)}`)}
        ${fact('earth', `Earth contact ${range(x.ranges && x.ranges.contact_pct || [x.comms.contact_pct, x.comms.contact_pct], pct)}`, `Longest gap ${hrs(x.comms.longest_gap_h)}`)}
        ${en ? fact('bolt', en) : ''}${ice != null ? fact('ice', `Ice-bearing dark area ${fmt(ice, 1)} km away`) : ''}</div>
      ${x.reasons && x.reasons.length ? `<p class="why">${esc(x.reasons[0])}${x.reasons.length > 1 ? ` <span class="xp">(+${x.reasons.length - 1} more)</span>` : ''}</p>` : ''}
      <button class="btn go3d" data-open="${i}">See it in 3D</button></article>`;
  }).join('');
  $$('[data-open]').forEach(b => b.onclick = () => openExplore(+b.dataset.open));
}

/* ---------- step 4: explore ---------- */
async function openExplore(i) {
  S.opt = i; S.t = 0; S.hw = null;
  go('explore');
  $('#optTabs').innerHTML = S.data.options.map((o, k) => `<button data-k="${k}" aria-pressed="${k === i}">${k + 1} ${esc(o.site_name)}</button>`).join('');
  $$('#optTabs button').forEach(b => b.onclick = () => openExplore(+b.dataset.k));
  $('#panel').innerHTML = '<p class="small">Loading the terrain…</p>';
  await buildSite(opt().site);
  setRing(opt().ellipse_radius_m || 50);
  setPaths();
  $('#scrub').max = series().t.length - 1;
  renderPanel(); drawBars(); setView(S.view);
}
function setView(v) {
  S.view = v; $$('#views button').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === v));
  X.lander.visible = v !== 'fp'; if (X.sunPath) X.sunPath.visible = X.earthPath.visible = v === 'drone'; X.controls.enabled = v !== 'fp' && S.screen === 'explore';
  const st = sample(S.t), back = dirFromAzEl(X.site, st.sunAz + 150, 0);
  if (v === 'fp') { X.camera.position.set(0, 2, 0); X.yaw = st.sunAz; X.pitch = 2; X.camera.fov = 60; lookFP(); }
  else if (v === 'drone') { X.controls.target.set(0, 2, 0); X.camera.position.set(back.x * 120, 55, back.z * 120); X.camera.fov = 50; }
  else { X.controls.target.set(0, 0, 0); X.camera.position.set(back.x * 5200, 7600, back.z * 5200); X.camera.fov = 50; }
  X.camera.updateProjectionMatrix(); if (v !== 'fp') X.controls.update(); applyTime();
}
function lookFP() { X.camera.lookAt(X.camera.position.clone().add(dirFromAzEl(X.site, X.yaw, X.pitch))); }
{
  let drag = null;
  canvas.addEventListener('pointerdown', e => { if (S.screen === 'explore' && S.view === 'fp') { drag = { x: e.clientX, y: e.clientY, yaw: X.yaw, pitch: X.pitch }; canvas.setPointerCapture(e.pointerId); } });
  canvas.addEventListener('pointermove', e => { if (!drag) return; X.yaw = drag.yaw - (e.clientX - drag.x) * 0.25; X.pitch = Math.max(-60, Math.min(70, drag.pitch + (e.clientY - drag.y) * 0.25)); lookFP(); });
  addEventListener('pointerup', () => drag = null);
}
function renderPanel() {
  const o = opt(), v = verdictOf(o), L = o.landing, rg = o.ranges || {}, tr = o.terrain, re = o.resources, tu = o.terrain_uncertainty, pw = o.power || {};
  const h = S.hw && o.hardware_toggles ? o.hardware_toggles[S.hw] : null, pick = (k, base) => h && h[k] ? [h[k][1], h[k][1]] : base;
  const ice = re && re['nearest_over_0.01km2_km'], en = W.energy(o), stay = Math.round(o.duration_h / 24);
  const sunR = pick('sun_pct', rg.sun_pct || [o.light.sun_pct, o.light.sun_pct]), darkR = pick('longest_dark_h', rg.longest_dark_h || [o.light.longest_dark_h, o.light.longest_dark_h]);
  $('#panel').innerHTML = `
    <div><h3>${esc(o.site_name)}</h3><div class="small">Landing ${dateTime(o.landing_utc)}, ${stay} days on the surface</div>
      <div class="verdict" style="--c:${VC[v]};margin-top:12px"><span class="sp">${VSIMPLE[v]}</span><span class="xp">${vx(v)}</span></div></div>
    <div class="big sp">
      ${fact(sunR[0] > 50 ? 'sun' : 'dark', W.sun(sunR[0]), W.dark(darkR[1]))}
      ${fact('earth', W.earth(o.comms.contact_pct), o.comms.longest_gap_h > 0 ? `Longest silence: ${hrs(o.comms.longest_gap_h)}` : '')}
      ${en ? fact('bolt', en) : ''}${ice != null ? fact('ice', W.ice(ice)) : ''}
      ${tr ? fact('slope', tr.safe_fraction >= 0.95 ? 'Flat, safe ground' : tr.safe_fraction >= 0.7 ? 'Mostly safe ground' : 'Steep ground in places') : ''}
    </div>
    ${o.reasons && o.reasons.length ? `<div class="sec"><h4>Watch out</h4><ul class="reasons">${o.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}
    <div class="sec"><h4>What you are seeing</h4><p class="small" style="margin:0">Real NASA terrain around the landing spot. The white circle is where the lander can touch down. The gold dots trace the Sun's path across the sky during your stay, the blue dots trace Earth. Press play to watch the shadows move.</p></div>
    <div class="sec xp"><h4>Sunlight</h4><div class="rows">
      <div><span>Time in sunlight</span><span class="num">${range(sunR, pct)}</span></div>
      <div><span>Longest darkness</span><span class="num">${range(darkR, hrs)}</span></div>
      <div><span>Until first sunset</span><span class="num">${hrs(o.light.hours_to_sunset)}</span></div></div></div>
    <div class="sec xp"><h4>Earth contact</h4><div class="rows">
      <div><span>Time in contact</span><span class="num">${range(pick('contact_pct', rg.contact_pct || [o.comms.contact_pct, o.comms.contact_pct]), pct)}</span></div>
      <div><span>Longest gap</span><span class="num">${hrs(o.comms.longest_gap_h)}</span></div>
      ${o.comms.data_possible_mb != null ? `<div><span>Data you can send</span><span class="num">${fmt(o.comms.data_possible_mb / 1000)} GB</span></div>` : ''}</div></div>
    <div class="sec xp"><h4>Power</h4><div class="rows">
      ${pw.energy_kwh != null ? `<div><span>Energy collected</span><span class="num">${fmt(pw.energy_kwh, 1)} kWh</span></div>` : ''}
      ${pw.max_sustainable_load_w != null ? `<div><span>Max continuous load</span><span class="num">${watts(pw.max_sustainable_load_w)}</span></div>` : ''}
      ${pw.array_needed_w != null ? `<div><span>Solar array needed</span><span class="num">${range(rg.array_needed_w || [pw.array_needed_w, pw.array_needed_w], watts)}</span></div>` : ''}
      ${pw.battery_needed_wh != null ? `<div><span>Battery needed</span><span class="num">${range(pick('battery_needed_wh', rg.battery_needed_wh || [pw.battery_needed_wh, pw.battery_needed_wh]), wh)}</span></div>` : ''}
      ${!Object.keys(pw).length ? '<div><span>No power data given</span><span></span></div>' : ''}</div></div>
    <div class="sec xp"><h4>Landing</h4><div class="rows">
      <div><span>Sun at touchdown</span><span class="num">${level(L.sun_elevation_deg)}</span></div>
      <div><span>Earth at touchdown</span><span class="num">${L.earth_visible ? level(L.earth_elevation_deg) : 'Not visible'}</span></div>
      ${tr ? `<div><span>Slope, median and steepest 10%</span><span class="num">${fmt(tr.median_deg, 1)}°, ${fmt(tr.p90_deg, 1)}°</span></div><div><span>Area within your slope limit</span><span class="num">${pct(tr.safe_fraction * 100)}</span></div>` : ''}
      ${ice != null ? `<div><span>Nearest dark area (> 0.01 km²)</span><span class="num">${fmt(ice, 1)} km</span></div>` : ''}</div>
      ${L.shadow_risk ? `<p class="small">${esc(L.shadow_risk)}</p>` : ''}</div>
    ${tu ? `<div class="sec xp"><h4>Uncertainty</h4><div class="rows"><div><span>Sunlight on ${tu.clones} NASA terrain versions</span><span class="num">${range(tu.centre_sun_pct, pct)}</span></div><div><span>Lander orientation</span><span>${esc(o.orientation)}</span></div></div></div>` : ''}
    ${o.hardware_toggles ? `<div class="sec"><h4>What if</h4><div class="rows">
      <div class="switch"><span>Solar panels on a 10 m mast</span><button class="toggle" data-hw="mast_10m" aria-pressed="${S.hw === 'mast_10m'}" aria-label="Panels on a 10 m mast"></button></div>
      <div class="switch"><span>Panels that turn to follow the Sun</span><button class="toggle" data-hw="tracking_panels" aria-pressed="${S.hw === 'tracking_panels'}" aria-label="Sun-tracking panels"></button></div>
      ${h ? `<p class="small" style="margin:4px 0 0">${h.sun_pct[1] > h.sun_pct[0] + 0.5 ? `Sunlight goes from ${pct(h.sun_pct[0])} to ${pct(h.sun_pct[1])}.` : 'Sunlight stays the same here.'} ${h.longest_dark_h[1] < h.longest_dark_h[0] ? `Longest darkness drops from ${hrs(h.longest_dark_h[0])} to ${hrs(h.longest_dark_h[1])}.` : ''}</p>` : ''}</div></div>` : ''}
    <div class="sec"><div class="switch"><span>Show ice-bearing dark areas in blue</span><button class="toggle" id="iceT" aria-pressed="${S.ice}" aria-label="Show dark areas"></button></div></div>
    <div class="sec xp"><h4>Not checked</h4><ul class="reasons">${(o.not_evaluated || S.data.not_evaluated || []).map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>
    <button class="btn" data-go="compare">Compare all options</button>`;
  $$('#panel [data-hw]').forEach(b => b.onclick = () => { S.hw = S.hw === b.dataset.hw ? null : b.dataset.hw; renderPanel(); });
  $('#iceT').onclick = () => { S.ice = !S.ice; [X.mesh, X.far, P.mesh].forEach(m => m && setIce(m.geometry)); renderPanel(); };
  $$('#panel [data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
}

/* ---------- calendar ---------- */
function openCalendar(highlight) {
  const cal = S.data.calendar, ids = Object.keys(cal.sites), first = cal.sites[ids[0]];
  $('#calendar').classList.add('open');
  $('#calSub').textContent = `Each thin column is a possible landing time, every ${cal.step_hours} hours from ${date(first[0][0])} to ${date(first[first.length - 1][0])}. White dots mark your three options.`;
  const c = $('#calCanvas'), dpr = devicePixelRatio, lw = 200, rowH = 24, n = first.length;
  const order = [...S.data.options.map(o => o.site), ...ids.filter(i => !S.data.options.some(o => o.site === i))];
  const w = c.clientWidth || 1000, hh = order.length * rowH + 26; c.width = w * dpr; c.height = hh * dpr; c.style.height = hh + 'px';
  const g = c.getContext('2d'); g.scale(dpr, dpr); g.font = '14px Barlow, sans-serif'; g.textBaseline = 'middle';
  const cw = (w - lw) / n;
  order.forEach((id, r) => {
    const s = S.index.sites.find(x => x.id === id), rank = S.data.options.findIndex(o => o.site === id);
    let nm = (rank >= 0 ? `${rank + 1}  ` : '') + (s ? s.name : id); while (g.measureText(nm).width > lw - 14 && nm.length > 4) nm = nm.slice(0, -2) + '…';
    g.fillStyle = rank >= 0 || id === highlight ? '#fff' : '#a3a8b0'; g.fillText(nm, 0, r * rowH + rowH / 2);
    cal.sites[id].forEach((row, k) => { g.fillStyle = row[2] === 'green' ? '#2fd27a' : row[2] === 'yellow' ? '#ffb020' : 'rgba(255,90,79,.45)'; g.fillRect(lw + k * cw, r * rowH + 4, Math.max(1, cw - 0.4), rowH - 8); });
    if (id === highlight) { g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.strokeRect(lw - 3, r * rowH + 1, w - lw + 2, rowH - 2); }
  });
  S.data.options.forEach((o, r) => { const k = first.findIndex(row => row[0].slice(0, 13) === o.landing_utc.slice(0, 13)); if (k >= 0) { g.fillStyle = '#fff'; g.beginPath(); g.arc(lw + k * cw + cw / 2, r * rowH + rowH / 2, 4.5, 0, 7); g.fill(); } });
  g.fillStyle = '#a3a8b0'; let last = -1;
  first.forEach((row, k) => { const d = toDate(row[0]); if (d.getUTCDate() === 1 && d.getUTCMonth() !== last && d.getUTCHours() < cal.step_hours) { last = d.getUTCMonth(); g.fillText(`${MON[last]} ${d.getUTCFullYear()}`, lw + k * cw, order.length * rowH + 14); } });
  c.onmousemove = e => { const r = c.getBoundingClientRect(), k = Math.floor((e.clientX - r.left - lw) / cw), row = Math.floor((e.clientY - r.top) / rowH);
    c.title = k >= 0 && k < n && row < order.length ? `${dateTime(cal.sites[order[row]][k][0])}: ${VSIMPLE[cal.sites[order[row]][k][2]]}` : ''; };
}

/* ---------- step 5: compare ---------- */
function renderCompare() {
  const o = S.data.options, rr = (x, k, f) => x.ranges && x.ranges[k] ? x.ranges[k] : null;
  const rows = [
    ['Landing time', x => date(x.landing_utc), x => dateTime(x.landing_utc)],
    ['Verdict', x => `<span class="dotw" style="--c:${VC[verdictOf(x)]}"></span>${VSIMPLE[verdictOf(x)]}`, x => `<span class="dotw" style="--c:${VC[verdictOf(x)]}"></span>${vx(verdictOf(x))}`],
    ['Sunlight', x => W.sun(x.light.sun_pct), x => range(rr(x, 'sun_pct') || [x.light.sun_pct, x.light.sun_pct], pct), x => (rr(x, 'sun_pct') || [x.light.sun_pct])[0], 'max'],
    ['Darkness', x => W.dark(x.light.longest_dark_h), x => range(rr(x, 'longest_dark_h') || [x.light.longest_dark_h, x.light.longest_dark_h], hrs), x => (rr(x, 'longest_dark_h') || [0, x.light.longest_dark_h])[1], 'min'],
    ['Contact with Earth', x => W.earth(x.comms.contact_pct), x => range(rr(x, 'contact_pct') || [x.comms.contact_pct, x.comms.contact_pct], pct), x => (rr(x, 'contact_pct') || [x.comms.contact_pct])[0], 'max'],
    ['Longest silence', x => hrs(x.comms.longest_gap_h), x => hrs(x.comms.longest_gap_h), x => x.comms.longest_gap_h, 'min'],
    ['Energy', x => W.energy(x) || '–', x => W.energy(x) || '–'],
    ['Battery needed', x => wh(x.power && x.power.battery_needed_wh), x => range(rr(x, 'battery_needed_wh'), wh), x => x.power && x.power.battery_needed_wh, 'min', true],
    ['Ground', x => x.terrain ? (x.terrain.safe_fraction >= 0.95 ? 'Flat and safe' : x.terrain.safe_fraction >= 0.7 ? 'Mostly safe' : 'Steep in places') : '–', x => x.terrain ? `${fmt(x.terrain.median_deg, 1)}° typical, ${pct(x.terrain.safe_fraction * 100)} within limit` : '–', x => x.terrain && x.terrain.median_deg, 'min'],
    ['Ice nearby', x => x.resources ? `${fmt(x.resources['nearest_over_0.01km2_km'], 1)} km away` : '–', x => x.resources ? `${fmt(x.resources['nearest_over_0.01km2_km'], 1)} km` : '–', x => x.resources && x.resources['nearest_over_0.01km2_km'], 'min'],
    ['Can land late by', x => x.slip_tolerance_days != null ? `${fmt(x.slip_tolerance_days)} days` : '–', x => x.slip_tolerance_days != null ? `${fmt(x.slip_tolerance_days)} days` : '–', x => x.slip_tolerance_days, 'max'],
    ['Backup site', x => x.backup_site ? esc(x.backup_site.site_name) : '–', x => x.backup_site ? `${esc(x.backup_site.site_name)}, ${date(x.backup_site.landing_utc)}` : '–'],
  ];
  let html = '<div class="rh ch"></div>' + o.map((x, i) => `<div class="ch" style="--c:${VC[verdictOf(x)]}"><div class="rank">${i + 1}</div><h3>${esc(x.site_name)}</h3></div>`).join('');
  for (const [name, fs, fx, key, best, xpOnly] of rows) {
    const vals = key ? o.map(key) : [], ok = vals.filter(v => v != null && isFinite(v));
    if (key && !ok.length) continue;
    const target = ok.length > 1 && !ok.every(v => Math.abs(v - ok[0]) < 1e-9) ? (best === 'max' ? Math.max(...ok) : Math.min(...ok)) : null;
    const cls = xpOnly ? ' xp' : '';
    html += `<div class="rh${cls}">${name}</div>` + o.map((x, i) => `<div class="${target != null && vals[i] === target ? 'best' : ''}${cls}"><span class="sp">${fs(x)}</span><span class="xp">${fx(x)}</span></div>`).join('');
  }
  if (S.data.quick) html += `<div class="rh">Not covered by the quick check</div><div style="grid-column:span 3" class="small">${S.data.not_evaluated.join(', ')}.</div>`;
  $('#cmp').innerHTML = html;
}

/* ---------- exports ---------- */
function exportCSV() {
  const o = opt(), s = o.series_hourly, ev = {};
  for (const e of o.timeline_events || []) { const nm = e.event.replace(/_/g, ' '); ev[e.time] = ev[e.time] ? ev[e.time] + '; ' + nm : nm; }
  const lines = ['utc,hours_after_landing,sun_elevation_deg,sun_azimuth_deg,sunlit_fraction_worst,sunlit_fraction_median,sunlit_fraction_best,earth_elevation_deg,earth_azimuth_deg,earth_contact,solar_power_w,battery_soc,event'];
  const f = s.sun_frac_worst_median_best;
  for (let i = 0; i < s.t.length; i++) lines.push([s.t[i], i, s.sun_el[i].toFixed(3), s.sun_az[i].toFixed(3), f[0][i].toFixed(3), f[1][i].toFixed(3), f[2][i].toFixed(3), s.earth_el[i].toFixed(3), s.earth_az[i].toFixed(3), +s.earth_contact[i], s.power_w ? s.power_w[i].toFixed(1) : '', s.battery_soc ? s.battery_soc[i].toFixed(3) : '', `"${ev[s.t[i]] || ''}"`].join(','));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([`# Lunar Site Scout operations timeline: ${o.site_name}, landing ${o.landing_utc}. Times UTC, hourly.\n` + lines.join('\n')], { type: 'text/csv' }));
  a.download = `timeline_${S.mission}_${o.site}.csv`; a.click();
}
function printReport() {
  const d = S.data, o = d.options, row = (k, f) => `<tr><th>${k}</th>${o.map(x => `<td>${f(x)}</td>`).join('')}</tr>`, m = MISSIONS.find(x => x.id === S.mission);
  $('#report').innerHTML = `<h1>Lunar Site Scout: landing site report</h1>
    <p>Mission: ${m ? esc(m.name) : 'your mission (quick check)'}. Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC.</p><p><b>${esc($('#answer').textContent)}</b></p><p>${esc(d.trust_badge)}</p>
    <h2>Options</h2><table><tr><th></th>${o.map((x, i) => `<th>${i + 1}. ${esc(x.site_name)}</th>`).join('')}</tr>
    ${row('Landing (UTC)', x => dateTime(x.landing_utc))}${row('Verdict', x => vx(verdictOf(x)))}${row('Reasons', x => (x.reasons || []).map(esc).join('<br>') || 'None')}
    ${row('Time in sunlight', x => range(x.ranges && x.ranges.sun_pct, pct))}${row('Longest darkness', x => range(x.ranges && x.ranges.longest_dark_h, hrs))}
    ${row('Earth contact', x => range(x.ranges && x.ranges.contact_pct, pct))}${row('Longest contact gap', x => hrs(x.comms.longest_gap_h))}
    ${row('Battery needed', x => range(x.ranges && x.ranges.battery_needed_wh, wh))}${row('Energy', x => W.energy(x) || '–')}
    ${row('Slope (median, p90)', x => x.terrain ? `${fmt(x.terrain.median_deg, 1)}°, ${fmt(x.terrain.p90_deg, 1)}°` : 'not in quick check')}
    ${row('Nearest dark area', x => x.resources ? fmt(x.resources['nearest_over_0.01km2_km'], 1) + ' km' : 'not in quick check')}
    ${row('Landing shadow note', x => esc(x.landing.shadow_risk || ''))}</table>
    ${d.provenance ? `<h2>Where each input came from</h2><table><tr><th>Field</th><th>Value</th><th>Source</th></tr>${d.provenance.map(p => `<tr><td>${esc(p.field)}</td><td>${esc(JSON.stringify(p.value))}</td><td>${esc(p.label)}${p.source ? ': ' + esc(p.source) : ''}</td></tr>`).join('')}</table>` : ''}
    ${d.profile ? `<h2>Your answers</h2><table>${Object.entries(d.profile).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(JSON.stringify(v))}</td></tr>`).join('')}</table>` : ''}
    <h2>Assumptions</h2><ul>${(d.assumptions || []).map(a => `<li>${esc(a)}</li>`).join('')}</ul>
    <h2>Not evaluated</h2><ul>${(d.not_evaluated || []).map(a => `<li>${esc(a)}</li>`).join('')}</ul>
    <h2>Data sources</h2><ul>${(d.data_sources || []).map(a => `<li>${esc(a)}</li>`).join('')}</ul>`;
  print();
}

/* ---------- mode ---------- */
function setMode(m) { S.mode = m; document.body.classList.toggle('simple', m === 'simple'); $$('.mode button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === m)); }
$$('.mode button').forEach(b => b.onclick = () => setMode(b.dataset.mode));

/* ---------- loop ---------- */
let last = performance.now();
function resize() {
  VW = innerWidth; VH = innerHeight; renderer.setSize(VW, VH, false);
  for (const c of [G.camera, P.camera, X.camera]) { c.aspect = VW / VH; c.updateProjectionMatrix(); }
  P.camera.setViewOffset(VW, VH, 0, VH * 0.1, VW, VH);
  if (S.data && S.screen === 'explore') drawBars();
}
addEventListener('resize', resize);
const v3 = new THREE.Vector3();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (anim) anim(now);
  if (scene === 'globe') {
    const k = 1 - Math.pow(0.02, dt);
    G.tilt += (G.tiltTo - G.tilt) * k; G.dist += (G.distTo - G.dist) * k; G.off += (G.offTo - G.off) * k;
    if (!anim) G.spin += dt * 0.05;
    const par = anim ? 0 : 1; G.px = (G.px || 0) + ((G.mx * 0.18 * par) - (G.px || 0)) * k; G.py = (G.py || 0) + ((G.my * 0.12 * par) - (G.py || 0)) * k;
    G.pivot.rotation.set(G.tilt + G.py, G.px, 0); G.moon.rotation.y = G.spin;
    G.camera.position.set(0, 0, G.dist); G.camera.lookAt(0, 0, 0); G.stars.rotation.y = G.spin * 0.2 - G.px * 0.5;
    if (VW > 980) G.camera.setViewOffset(VW, VH, -VW * G.off, S.screen === 'hero' ? -VH * 0.06 : 0, VW, VH); else G.camera.clearViewOffset();
    renderer.toneMappingExposure = 1.15; renderer.render(G.scene, G.camera);
  } else if (scene === 'polar') {
    P.controls.update(); renderer.toneMappingExposure = 1.25; renderer.render(P.scene, P.camera);
    const cardTop = VW > 980 ? $('#cards').getBoundingClientRect().top - 8 : VH;
    for (const m of P.markers) { v3.copy(m.pos).project(P.camera); const py = (1 - v3.y) / 2 * VH; const vis = v3.z < 1 && S.screen === 'results' && Math.abs(v3.x) < 1.05 && py > 90 && py < cardTop; m.el.style.display = vis ? '' : 'none'; if (vis) m.el.style.transform = `translate(${(v3.x + 1) / 2 * VW}px, ${(1 - v3.y) / 2 * VH}px)`; }
  } else {
    if (S.playing && S.data) { const n = series().t.length - 1; S.t += dt * S.speed; if (S.t >= n) { S.t = n; setPlaying(false); } applyTime(); }
    if (S.view !== 'fp') X.controls.update();
    if (X.site) { const st = sample(S.t); X.sunSprite.position.copy(X.camera.position).addScaledVector(dirFromAzEl(X.site, st.sunAz, st.sunEl), 50000); X.sunSprite.scale.setScalar(50000 * Math.tan(rad(0.53)) * 4); X.earthSprite.position.copy(X.camera.position).addScaledVector(dirFromAzEl(X.site, st.earthAz, st.earthEl), 50000); X.earthSprite.scale.setScalar(50000 * Math.tan(rad(1.9)) * 1.6); }
    renderer.toneMappingExposure = 1.3; renderer.render(X.scene, X.camera);
  }
  if (scene !== 'polar') P.markers.forEach(m => m.el.style.display = 'none');
  requestAnimationFrame(frame);
}
function setPlaying(p) { S.playing = p; $('#play').textContent = p ? '❚❚' : '▶'; $('#play').setAttribute('aria-label', p ? 'Pause' : 'Play'); }

/* ---------- wiring ---------- */
document.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b && !b.closest('#panel')) go(b.dataset.go); });
$$('#progress li').forEach(li => li.onclick = () => { if (li.classList.contains('reach')) { if (li.dataset.step === 'explore') openExplore(S.opt); else go(li.dataset.step); } });
$('#back').onclick = () => {
  if (S.screen === 'mission' && S.role !== 'past' && S.role !== 'student' && S.q > 0) { S.q--; renderQuestion(); return; }
  if (S.screen === 'mission' && S.role === 'project' && S.doc && S.q === 0) { S.q = -1; renderMission(); return; }
  if (S.screen === 'mission' && S.role === 'project' && S.doc) { S.doc = null; renderMission(); return; }
  go(ORDER[Math.max(0, ORDER.indexOf(S.screen) - 1)]);
};
$('#openCal').onclick = () => openCalendar();
$('#closeCal').onclick = () => $('#calendar').classList.remove('open');
$('#pdf').onclick = printReport;
$('#csv').onclick = exportCSV;
$('#play').onclick = () => { if (S.t >= series().t.length - 1) S.t = 0; setPlaying(!S.playing); };
$('#scrub').oninput = e => { S.t = +e.target.value; applyTime(); };
$$('#speed button').forEach(b => b.onclick = () => { S.speed = +b.dataset.s; $$('#speed button').forEach(x => x.setAttribute('aria-pressed', x === b)); });
$$('#views button').forEach(b => b.onclick = () => setView(b.dataset.view));
addEventListener('wheel', e => { if (S.screen === 'hero' && e.deltaY > 30) go('who'); }, { passive: true });
addEventListener('keydown', e => { if (e.key === 'Escape') $('#calendar').classList.remove('open'); if (e.key === ' ' && S.screen === 'explore' && e.target === document.body) { e.preventDefault(); $('#play').click(); } });

(async function init() {
  setMode('simple'); resize(); requestAnimationFrame(frame);
  $$('.screen').forEach(s => s.classList.toggle('on', s.id === 'hero'));
  try {
    [S.index, S.info, S.psr] = await Promise.all([getJSON('index.json'), getJSON('terrain/terrain.json'), getJSON('psr.json')]);
    const [r, rs] = await Promise.all([getBuf('terrain/' + S.info.region.file), getBuf('terrain/' + S.info.region_sun.file)]);
    S.region = new Float32Array(r); S.regionSun = new Uint8Array(rs);
  } catch (e) { $('.hero-text p').textContent = `${e.message}. Open the app from a web server, not as a local file.`; }
})();
