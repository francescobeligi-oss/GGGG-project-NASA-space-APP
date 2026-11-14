import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { quickCheck, readDocument, dateMetrics } from './quick.js';
import { exportPDF, exportXLSX } from './exports.js';

/* ================= helpers ================= */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const D = 'web-data/';
const R_MOON = 1737400;
const getJSON = p => fetch(D + p).then(r => { if (!r.ok) throw new Error(`Could not load ${p}`); return r.json(); });
const getBuf = p => fetch(D + p).then(r => { if (!r.ok) throw new Error(`Could not load ${p}`); return r.arrayBuffer(); });
const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
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
const usd = x => x == null || !isFinite(x) ? '–' : x >= 1e9 ? '$' + fmt(x / 1e9, 2) + 'B' : x >= 1e6 ? '$' + fmt(x / 1e6, x >= 1e7 ? 0 : 1) + 'M' : x >= 1e3 ? '$' + fmt(x / 1e3) + 'k' : '$' + fmt(x);
const range = (r, f) => !r || r[0] == null ? '–' : f(r[0]) === f(r[1]) ? f(r[0]) : `${f(r[0])} to ${f(r[1])}`;
const level = e => e == null ? '–' : `${fmt(Math.abs(e), 1)}° ${e >= 0 ? 'above' : 'below'} level`;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const ease = k => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const VC = { green: 'var(--go)', yellow: 'var(--care)', red: 'var(--nogo)' };
const VSIMPLE = { green: 'Great place to land', yellow: 'Possible, with care', red: 'Not suitable' };
const VEXPERT = { green: 'Go, even in the worst case', yellow: 'Go with caveats', red: 'No go' };
const verdictOf = o => o.worst_case_verdict || o.verdict;
const vx = v => S.data && S.data.quick ? { green: 'Go', yellow: 'Go with caveats', red: 'No go' }[v] : VEXPERT[v];
const LINE = ['#ffffff', '#7fb2ff', '#c39bff']; // option 1, 2, 3 on charts
const ICON = {
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="#f5b83d" stroke-width="2"><circle cx="12" cy="12" r="4.5" fill="#f5b83d"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1"/></svg>',
  dark: '<svg viewBox="0 0 24 24" fill="none" stroke="#a3a8b0" stroke-width="2"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/></svg>',
  earth: '<svg viewBox="0 0 24 24" fill="none" stroke="#4ea3ff" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3.5 9h17M3.5 15h17M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="#fff"><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg>',
  ice: '<svg viewBox="0 0 24 24" fill="none" stroke="#8fd8ff" stroke-width="2"><path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 3.5l3 2.5 3-2.5M9 20.5l3-2.5 3 2.5"/></svg>',
  slope: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M2 20h20L2 8z"/></svg>',
  cost: '<svg viewBox="0 0 24 24" fill="none" stroke="#2fd27a" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M15 8.5c-.7-1-1.8-1.5-3-1.5-1.7 0-3 .9-3 2.3 0 3.2 6 1.8 6 5 0 1.4-1.3 2.4-3 2.4-1.3 0-2.5-.6-3.1-1.6M12 5v2M12 17v2"/></svg>',
};
const fact = (icon, text, sub) => `<div class="fact">${ICON[icon]}<div>${text}${sub ? `<small>${sub}</small>` : ''}</div></div>`;

/* ================= cost scenarios: public sources only ================= */
const PRICES = [
  { id: 'astro', label: 'Astrobotic list price, $1.2M per kg (2021)', usdPerKg: 1.2e6, url: 'https://science.nasa.gov/wp-content/uploads/2023/11/astrobotic-lunar-landers-pug.pdf', note: 'Astrobotic Lunar Landers Payload User\'s Guide v5.0, public' },
  { id: 'clps', label: 'NASA CLPS award CP-22, $116.9M for 79 kg (2024)', usdPerKg: 116.9e6 / 79, url: 'https://spacenews.com/?p=505012', note: 'NASA task order to Intuitive Machines, reported by SpaceNews' },
  { id: 'starship', label: 'ispace on Starship, $50M for 500 kg (reported, from 2030, not yet flown)', usdPerKg: 50e6 / 500, url: 'https://universemagazine.com/en/lunar-logistics-moves-to-a-shared-flight-model/', note: 'Reported price for a future service' },
];
const BATT_WH_PER_KG = 265; // NASA Small Spacecraft State of the Art: Li-ion up to 265 Wh/kg (cell level, best case -> cost is a lower bound)
const DOD = 0.8;
const COST = { price: 'astro', loadW: 100, missionUsd: 116.9e6 };
const priceNow = () => PRICES.find(p => p.id === COST.price);
const battKg = darkH => darkH * COST.loadW / DOD / BATT_WH_PER_KG; // extra battery mass to cross the longest darkness
const costDark = darkH => battKg(darkH) * priceNow().usdPerKg;
const valueLost = (lostH, totalH) => lostH / totalH * COST.missionUsd;

/* ================= plain words ================= */
const W = {
  sun: p => p >= 99.5 ? 'Always in sunlight' : p >= 90 ? 'Almost always sunny' : p >= 70 ? 'Mostly sunny' : p >= 40 ? 'Often in shadow' : 'Mostly dark',
  dark: h => h <= 0 ? 'Never goes dark' : h <= 12 ? `Short dark spells, ${hrs(h)} at most` : `Longest darkness: ${hrs(h)}`,
  earth: p => p >= 95 ? 'Earth almost always in view' : p >= 75 ? 'Earth usually in view' : p >= 40 ? 'Earth in view part of the time' : 'Earth rarely in view',
  ice: km => km == null ? null : km < 1 ? 'Ice-bearing dark area under 1 km away' : `Nearest ice-bearing dark area: ${fmt(km, 1)} km`,
  ground: t => !t ? null : t.safe_fraction >= 0.95 ? 'Flat, safe ground' : t.safe_fraction >= 0.7 ? 'Mostly safe ground' : 'Steep ground in places',
  costDark: h => h <= 0 ? 'No extra battery needed for darkness' : `Darkness costs at least ${usd(costDark(h))} in extra battery`,
};
const FACTS = [
  'Near the south pole the Sun never climbs more than about 1.6 degrees above the horizon.',
  'Some crater floors here have not seen sunlight for billions of years. That is where ice can survive.',
  'From the south pole, Earth hangs low on the horizon and goes through phases, like the Moon does for us.',
  'A shadow from a 10 m boulder can stretch over 400 m when the Sun is this low.',
];

const MISSIONS = [
  { id: 'griffin1', name: 'Griffin-1', who: 'Astrobotic robotic lander, 14 days on the surface.', kid: 'A robot lander carrying a small rover.' },
  { id: 'artemis', name: 'Artemis crewed landing', who: 'Astronauts who need sunlight all the time and a short walk to ice.', kid: 'People landing on the Moon again.' },
  { id: 'novac', name: 'Nova-C class', who: 'Small robotic lander with a known power budget.', kid: 'A small robot lander, like the ones that landed in 2024 and 2025.' },
  { id: 'argonaut', name: 'Argonaut', who: 'European cargo lander for a long stay. No power data yet.', kid: 'A European lander that brings supplies.' },
];

const S = { screen: 'hero', role: null, mode: 'simple', data: null, mission: null, opt: 0, t: 0, playing: false, speed: 8, view: 'drone',
  ice: true, hw: 'none', sites: {}, index: null, info: null, psr: null, region: null, regionSun: null, doc: null, q: 0, answers: null,
  when: null, whenIdx: null, metric: 'sun', showPlaces: true };

/* ================= renderer ================= */
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
renderer.autoClear = false;
let VW = innerWidth, VH = innerHeight;
const labels = document.createElement('div'); labels.id = 'labels'; document.body.appendChild(labels);
const texLoader = new THREE.TextureLoader();

/* ================= the Moon: globe + real polar terrain as one object ================= */
const RHO_MAX = 262000; // polar terrain disc radius on the map (m)
const M = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(30, 1, 0.0002, 200), spin: 0, tilt: -0.12, tiltTo: -0.12, dist: 3.0, distTo: 3.0, off: 0.2, offTo: 0.2, tint: 0, tintTo: 0, map: false };
function globePoint(lat, lon, r = 1) { const phi = rad(lon + 180), th = rad(90 - lat); return new THREE.Vector3(-r * Math.cos(phi) * Math.sin(th), r * Math.cos(th), r * Math.sin(phi) * Math.sin(th)); }
const mapToLatLon = (mx, my) => { const rho = Math.hypot(mx, my); return [-90 + deg(2 * Math.atan(rho / (2 * R_MOON))), deg(Math.atan2(mx, my))]; };
{
  const tex = texLoader.load('assets/moon_2k.jpg'); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 });
  M.pivot = new THREE.Group(); M.scene.add(M.pivot);
  M.moon = new THREE.Group(); M.pivot.add(M.moon);
  M.full = new THREE.Mesh(new THREE.SphereGeometry(1, 192, 96), mat);
  // same sphere with a hole at the south pole where the real terrain sits; UVs recomputed from latitude
  const holeC = 2 * Math.atan((RHO_MAX - 1500) / (2 * R_MOON));
  const hg = new THREE.SphereGeometry(1, 192, 96, 0, Math.PI * 2, 0, Math.PI - holeC), uv = hg.attributes.uv, p = hg.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - Math.acos(Math.max(-1, Math.min(1, p.getY(i)))) / Math.PI);
  M.holed = new THREE.Mesh(hg, mat.clone()); M.holed.visible = false;
  M.moon.add(M.full, M.holed);
  const pts = []; for (let k = 0; k <= 128; k++) pts.push(globePoint(-84, k / 128 * 360 - 180, 1.003));
  M.ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xf5b83d, transparent: true, opacity: 0 }));
  M.moon.add(M.ring);
  M.sun = new THREE.DirectionalLight(0xffffff, 3.4); M.sun.position.set(-3, 1.4, 2.2); M.scene.add(M.sun);
  M.hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 0.04); M.scene.add(M.hemi);
  const sp = new Float32Array(2400 * 3); for (let i = 0; i < 2400; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(40 + Math.random() * 30); sp.set([v.x, v.y, v.z], i * 3); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  M.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.08, transparent: true, opacity: 0.55 })); M.scene.add(M.stars);
  M.camera.position.set(0, 0, 3);
  M.controls = new MapControls(M.camera, canvas);
  Object.assign(M.controls, { enableDamping: true, dampingFactor: 0.08, screenSpacePanning: false, minDistance: 0.006, maxDistance: 5, maxPolarAngle: rad(80), zoomSpeed: 1.2, enabled: false });
  M.mx = 0; M.my = 0; addEventListener('pointermove', e => { M.mx = e.clientX / innerWidth - 0.5; M.my = e.clientY / innerHeight - 0.5; });
}
const POSE = { hero: [-0.12, 3.0, 0.2], who: [-0.5, 3.6, 0.25], mission: [-1.0, 3.4, 0.25] };
const regionSunAt = (mx, my) => { const t = S.info.region, n = t.shape[0], i = Math.round((t.half_width_m - my) / t.pixel_m), j = Math.round((mx + t.half_width_m) / t.pixel_m); return i < 0 || j < 0 || i >= n || j >= n ? 255 : S.regionSun[i * n + j]; };
const regionH = (mx, my) => { const t = S.info.region; return sampleH(S.region, t.shape[0], t.pixel_m, t.half_width_m, 0, 0, mx, my); };
function psrMask(map, m) {
  const mask = new Uint8Array(m * m), x0 = map[0], y0 = map[1], dx = map[2] - map[0], dy = map[m * 2 + 1] - map[1], P = S.psr;
  for (let p = 0; p < P.x_m.length; p++) {
    const rr = Math.sqrt(P.area_km2[p] * 1e6 / Math.PI), cx = P.x_m[p], cy = P.y_m[p];
    const j0 = Math.max(0, Math.floor((cx - rr - x0) / dx)), j1 = Math.min(m - 1, Math.ceil((cx + rr - x0) / dx));
    const ia = Math.floor((cy + rr - y0) / dy), ib = Math.ceil((cy - rr - y0) / dy), i0 = Math.max(0, Math.min(ia, ib)), i1 = Math.min(m - 1, Math.max(ia, ib));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = i * m + j, ex = map[k * 2] - cx, ey = map[k * 2 + 1] - cy; if (ex * ex + ey * ey <= rr * rr) mask[k] = 1; }
  }
  return mask;
}
function buildCap() {
  if (M.cap || !S.region) return;
  const t = S.info.region, n = t.shape[0], step = 2, m = Math.floor((n - 1) / step) + 1;
  const pos = new Float32Array(m * m * 3), map = new Float32Array(m * m * 2), inside = new Uint8Array(m * m);
  for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) {
    const k = i * m + j, mx = -t.half_width_m + j * step * t.pixel_m, my = t.half_width_m - i * step * t.pixel_m;
    const rim = Math.min(1, Math.max(0, (RHO_MAX - Math.hypot(mx, my)) / 30000)), sm = rim * rim * (3 - 2 * rim); // heights ease to the sphere at the rim: no seam
    const [lat, lon] = mapToLatLon(mx, my), h = S.region[(i * step) * n + j * step] * sm;
    const v = globePoint(lat, lon, 1 + h / R_MOON); pos.set([v.x, v.y, v.z], k * 3); map[k * 2] = mx; map[k * 2 + 1] = my;
    inside[k] = Math.hypot(mx, my) <= RHO_MAX;
  }
  const idx = [];
  for (let i = 0; i < m - 1; i++) for (let j = 0; j < m - 1; j++) { const a = i * m + j, b = a + 1, c = a + m, d = c + 1; if (inside[a] && inside[b] && inside[c] && inside[d]) idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(new THREE.Uint32BufferAttribute(idx, 1)); g.computeVertexNormals();
  // colours: plain grey (matches the globe) and tinted (NASA average sunlight in gold, permanently dark areas in ice blue)
  const ice = psrMask(map, m), plain = new Float32Array(m * m * 3), tint = new Float32Array(m * m * 3), tintNoIce = new Float32Array(m * m * 3);
  for (let k = 0; k < m * m; k++) {
    const base = 0.56; plain.set([base, base, base * 0.98], k * 3);
    let r = base, gg = base, b = base; const s = regionSunAt(map[k * 2], map[k * 2 + 1]);
    if (s !== 255) { const edge = Math.min(1, Math.max(0, (151000 - Math.max(Math.abs(map[k * 2]), Math.abs(map[k * 2 + 1]))) / 20000)), f = Math.min(1, Math.max(0, (s - 12) / 30)) * edge * 0.85; r += (1 - r) * f; gg += (0.78 - gg) * f; b += (0.32 - b) * f; }
    const fade = Math.min(1, Math.max(0, (RHO_MAX - Math.hypot(map[k * 2], map[k * 2 + 1])) / 25000)); // blend into the globe at the rim
    tintNoIce.set([base + (r - base) * fade, base + (gg - base) * fade, base * 0.98 + (b - base * 0.98) * fade], k * 3);
    if (ice[k]) { r = r * 0.35 + 0.3; gg = gg * 0.35 + 0.52; b = b * 0.35 + 0.66; }
    tint.set([base + (r - base) * fade, base + (gg - base) * fade, base * 0.98 + (b - base * 0.98) * fade], k * 3);
  }
  const alpha = new Float32Array(m * m); for (let k = 0; k < m * m; k++) { const r = Math.min(1, Math.max(0, (RHO_MAX - Math.hypot(map[k * 2], map[k * 2 + 1])) / 30000)); alpha[k] = 0.42 + 0.58 * r; } // rim darkens to match the dimmed globe
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(m * m * 4), 4));
  g.userData = { plain, tint, tintNoIce, alpha };
  M.cap = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })); M.cap.visible = false;
  setCapTint(0);
  M.moon.add(M.cap);
}
function setCapTint(f) {
  const g = M.cap.geometry, { plain, alpha } = g.userData, tint = S.ice ? g.userData.tint : g.userData.tintNoIce, c = g.attributes.color.array;
  for (let k = 0, n = alpha.length; k < n; k++) { const dim = 1 - (1 - alpha[k]) * f; for (let q = 0; q < 3; q++) c[k * 4 + q] = (plain[k * 3 + q] + (tint[k * 3 + q] - plain[k * 3 + q]) * f) * dim; c[k * 4 + 3] = 1; }
  M.holed.material.color.setScalar(1 - 0.58 * f); // the rest of the Moon dims while the pole map is open
  g.attributes.color.needsUpdate = true;
}
const siteWorld = s => M.moon.localToWorld(globePoint(s.lat, s.lon, 1 + (regionH(s.x_m, s.y_m) + 150) / R_MOON));

/* ================= map markers ================= */
let markers = [];
function placeMarkers() {
  markers.forEach(m => m.el.remove()); markers = [];
  const opts = S.data.options;
  for (const s of S.index.sites) {
    const rank = opts.findIndex(o => o.site === s.id), el = document.createElement('button');
    el.className = 'pin' + (rank >= 0 ? ' top' : '');
    if (rank >= 0) el.style.setProperty('--c', VC[verdictOf(opts[rank])]);
    el.innerHTML = rank >= 0 ? `<span class="rk">${rank + 1}</span><span class="pl">${esc(s.name)}</span>` : `<span class="dotm"></span><span class="pl">${esc(s.name)}</span>`;
    el.setAttribute('aria-label', rank >= 0 ? `Option ${rank + 1}: ${s.name}` : s.name);
    el.onclick = () => rank >= 0 ? openExplore(rank) : sitePopover(s, el);
    el.style.display = 'none'; labels.appendChild(el);
    markers.push({ el, site: s, top: rank >= 0 });
  }
}
function placePlaces() {
  for (const p of (S.places && S.places.places) || []) {
    const el = document.createElement('button'); el.className = 'pin poi'; el.innerHTML = `<span class="dia"></span><span class="pl">${esc(p.name)}</span>`;
    el.setAttribute('aria-label', `Place: ${p.name}`); el.style.display = 'none'; labels.appendChild(el);
    el.onclick = () => { $$('.pop').forEach(x => x.remove()); const pop = document.createElement('div'); pop.className = 'pop';
      pop.innerHTML = `<b>${esc(p.name)}</b><div class="small">${esc(p.type.split(',')[0])}, ${fmt(p.diam_km)} km across. Named after: ${esc(p.namesake)}</div><div>${esc(p.fact)}</div><a class="small" href="${p.source}" target="_blank" rel="noopener">IAU Gazetteer of Planetary Nomenclature</a>`;
      document.body.appendChild(pop); const r = el.getBoundingClientRect(); pop.style.left = Math.min(innerWidth - 310, r.left) + 'px'; pop.style.top = Math.min(innerHeight - 220, r.bottom + 8) + 'px';
      setTimeout(() => addEventListener('pointerdown', function off(e) { if (!pop.contains(e.target)) { pop.remove(); removeEventListener('pointerdown', off); } }), 0); };
    markers.push({ el, site: { lat: p.lat, lon: p.lon, x_m: p.x_m, y_m: p.y_m }, poi: true });
  }
}
function sitePopover(s, el) {
  $$('.pop').forEach(p => p.remove());
  const w = (S.data.landing_windows || {})[s.id] || [], pop = document.createElement('div'); pop.className = 'pop';
  pop.innerHTML = `<b>${esc(s.name)}</b><div class="small">${w.length ? `Not in your top three. ${w.length} landing window${w.length > 1 ? 's' : ''} for your dates, the first from ${date(w[0].open)}.` : 'No landing time works here for your mission and dates.'}</div><button class="btn" style="padding:9px 16px">See in calendar</button>`;
  pop.querySelector('button').onclick = () => { pop.remove(); openCalendar(s.id); };
  document.body.appendChild(pop);
  const r = el.getBoundingClientRect(); pop.style.left = Math.min(innerWidth - 310, r.left) + 'px'; pop.style.top = Math.min(innerHeight - 200, r.bottom + 8) + 'px';
  setTimeout(() => addEventListener('pointerdown', function off(e) { if (!pop.contains(e.target)) { pop.remove(); removeEventListener('pointerdown', off); } }), 0);
}

/* ================= site explorer (m) ================= */
const X = { scene: new THREE.Scene(), sky: new THREE.Scene(), camera: new THREE.PerspectiveCamera(55, 1, 0.3, 200000), yaw: 0, pitch: 0, walk: {} };
X.controls = new OrbitControls(X.camera, canvas);
Object.assign(X.controls, { enableDamping: true, dampingFactor: 0.08, minDistance: 15, maxDistance: 60000, maxPolarAngle: rad(88), enableZoom: false, enabled: false });
X.sun = new THREE.DirectionalLight(0xfff3dd, 4.2); X.sun.castShadow = true; X.sun.shadow.mapSize.set(4096, 4096); X.sun.shadow.bias = -0.0004; X.sun.shadow.normalBias = 1.5;
X.scene.add(X.sun, X.sun.target);
X.fill = new THREE.HemisphereLight(0xffffff, 0x2a2a2a, 0.42); X.scene.add(X.fill); // display fill so shaded ground stays readable
{
  // sky: a real Earth (NASA Blue Marble) lit by the Sun, so its phase is the true one, and a glowing Sun
  const et = texLoader.load('assets/earth_2k.jpg'); et.colorSpace = THREE.SRGBColorSpace;
  X.earth = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), new THREE.MeshStandardMaterial({ map: et, roughness: 0.8, metalness: 0 }));
  X.skySun = new THREE.DirectionalLight(0xffffff, 3.2); X.sky.add(X.earth, X.skySun, X.skySun.target, new THREE.AmbientLight(0x223344, 0.08));
  const glow = (rgb, core) => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(core, `rgba(${rgb},1)`); gr.addColorStop(core + 0.04, `rgba(${rgb},.55)`); gr.addColorStop(0.45, `rgba(${rgb},.12)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true, toneMapped: false, blending: THREE.AdditiveBlending }));
  };
  X.sunGlow = glow('255,240,210', 0.05); X.sky.add(X.sunGlow);
  const grp = new THREE.Group(), foil = new THREE.MeshStandardMaterial({ color: 0xd4ad4f, metalness: 0.6, roughness: 0.35 }), grey = new THREE.MeshStandardMaterial({ color: 0xd0d3d8, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 1.6, 8), foil); body.position.y = 2.0; grp.add(body);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 2.2), grey); deck.position.y = 2.9; grp.add(deck);
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4, leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6), grey); leg.position.set(Math.cos(a) * 1.9, 1.0, Math.sin(a) * 1.9); leg.rotation.z = Math.cos(a) * 0.5; leg.rotation.x = -Math.sin(a) * 0.5; grp.add(leg); }
  grp.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  X.lander = grp; X.scene.add(grp);
}
const SKY_D = 60000;
function gridGeometry(z, n, px, half, step, o) {
  const { gcx = 0, gcy = 0, ox = 0, oy = 0, h0 = 0, hole = 0 } = o;
  const m = Math.floor((n - 1) / step) + 1, pos = new Float32Array(m * m * 3), map = new Float32Array(m * m * 2);
  for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) {
    const r = i * step, c = j * step, k = i * m + j, mx = gcx - half + c * px, my = gcy + half - r * px, dx = mx - ox, dy = my - oy;
    pos[k * 3] = dx; pos[k * 3 + 1] = z[r * n + c] - h0 - (dx * dx + dy * dy) / (2 * R_MOON); pos[k * 3 + 2] = -dy; map[k * 2] = mx; map[k * 2 + 1] = my;
  }
  const idx = [];
  for (let i = 0; i < m - 1; i++) for (let j = 0; j < m - 1; j++) { const a = i * m + j, b = a + 1, c = a + m, d = c + 1; if (hole && [a, b, c, d].every(q => Math.abs(map[q * 2] - ox) < hole && Math.abs(map[q * 2 + 1] - oy) < hole)) continue; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(new THREE.Uint32BufferAttribute(idx, 1)); g.computeVertexNormals(); g.userData = { map, m };
  return g;
}
function siteColours(g, base) {
  const { map, m } = g.userData, mask = psrMask(map, m), plain = new Float32Array(m * m * 3).fill(base), ice = plain.slice();
  for (let k = 0; k < m * m; k++) if (mask[k]) { ice[k * 3] = base * 0.35 + 0.3; ice[k * 3 + 1] = base * 0.35 + 0.52; ice[k * 3 + 2] = base * 0.35 + 0.66; }
  g.userData.cols = { plain, ice }; g.setAttribute('color', new THREE.BufferAttribute((S.ice ? ice : plain).slice(), 3));
}
function setIce(g) { if (g && g.userData.cols) { g.attributes.color.array.set(S.ice ? g.userData.cols.ice : g.userData.cols.plain); g.attributes.color.needsUpdate = true; } }
function sampleH(z, n, px, half, gcx, gcy, mx, my) {
  const c = (mx - (gcx - half)) / px, r = ((gcy + half) - my) / px, c0 = Math.max(0, Math.min(n - 2, Math.floor(c))), r0 = Math.max(0, Math.min(n - 2, Math.floor(r))), fc = c - c0, fr = r - r0, q = (a, b) => z[a * n + b];
  return (q(r0, c0) * (1 - fc) + q(r0, c0 + 1) * fc) * (1 - fr) + (q(r0 + 1, c0) * (1 - fc) + q(r0 + 1, c0 + 1) * fc) * fr;
}
function dirFromAzEl(site, az, el) {
  const n = site.north_vec_map, e = site.east_vec_map, ca = Math.cos(rad(az)), sa = Math.sin(rad(az)), ce = Math.cos(rad(el));
  return new THREE.Vector3(ce * (ca * n[0] + sa * e[0]), Math.sin(rad(el)), -ce * (ca * n[1] + sa * e[1])).normalize();
}
const localH = (dx, dz) => sampleH(X.z, X.n, X.px, X.half, X.site.x_m, X.site.y_m, X.site.x_m + dx, X.site.y_m - dz) - X.h0 - (dx * dx + dz * dz) / (2 * R_MOON);
async function siteMeta(id) { return S.sites[id] || (S.sites[id] = await getJSON(`${id}.json`)); }
async function buildSite(sid) {
  if (X.sid === sid) return; X.sid = sid;
  for (const k of ['mesh', 'far']) if (X[k]) { X.scene.remove(X[k]); X[k].geometry.dispose(); X[k] = null; }
  const site = await siteMeta(sid), z = new Float32Array(await getBuf(`terrain/${sid}_10m.bin`));
  const t = S.info.sites, n = t.shape[0], half = t.half_width_m, h0 = z[((n - 1) / 2) * n + (n - 1) / 2], ox = site.x_m, oy = site.y_m;
  const weak = /Mobi|Android/i.test(navigator.userAgent) || (navigator.hardwareConcurrency || 8) <= 4;
  const g = gridGeometry(z, n, t.pixel_m, half, weak ? 2 : 1, { gcx: ox, gcy: oy, ox, oy, h0 }); siteColours(g, 0.74);
  X.mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })); X.mesh.castShadow = X.mesh.receiveShadow = true; X.scene.add(X.mesh);
  const rt = S.info.region, rn = rt.shape[0], sn = 181, hw = 90, sub = new Float32Array(sn * sn);
  const ci = Math.round((rt.half_width_m - oy) / rt.pixel_m), cj = Math.round((ox + rt.half_width_m) / rt.pixel_m);
  for (let i = 0; i < sn; i++) for (let j = 0; j < sn; j++) sub[i * sn + j] = S.region[Math.max(0, Math.min(rn - 1, ci - hw + i)) * rn + Math.max(0, Math.min(rn - 1, cj - hw + j))];
  const fg = gridGeometry(sub, sn, rt.pixel_m, hw * rt.pixel_m, 1, { gcx: -rt.half_width_m + cj * rt.pixel_m, gcy: rt.half_width_m - ci * rt.pixel_m, ox, oy, h0, hole: half - 600 }); siteColours(fg, 0.64);
  X.far = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })); X.scene.add(X.far);
  Object.assign(X, { site, z, n, h0, half, px: t.pixel_m, box: new THREE.Box3().setFromBufferAttribute(g.attributes.position), farBox: new THREE.Box3().setFromBufferAttribute(fg.attributes.position) });
}
function setRing(radius) {
  const pts = [];
  for (let k = 0; k < 128; k++) { const a = k / 128 * Math.PI * 2, dx = Math.cos(a) * radius, dz = -Math.sin(a) * radius; pts.push(new THREE.Vector3(dx, localH(dx, dz) + 0.8, dz)); }
  const curve = new THREE.CatmullRomCurve3(pts, true);
  X.ring = new THREE.Mesh(new THREE.TubeGeometry(curve, 256, Math.max(0.35, radius / 120), 6, true), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  X.glow = new THREE.Mesh(new THREE.TubeGeometry(curve, 256, Math.max(1.6, radius / 30), 8, true), new THREE.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  X.scene.add(X.ring, X.glow); X.ringBorn = performance.now();
}
function setPaths() {
  const s = series(), mk = (az, el, col) => {
    const pts = []; for (let i = 0; i < s.t.length; i += 2) pts.push(dirFromAzEl(X.site, az[i], el[i]).multiplyScalar(70).add(new THREE.Vector3(0, 3, 0)));
    return new THREE.Points(new THREE.BufferGeometry().setFromPoints(pts), new THREE.PointsMaterial({ color: col, size: 1.6, transparent: true, opacity: 0.9, depthWrite: false }));
  };
  X.sunPath = mk(s.sun_az, s.sun_el, 0xf5b83d); X.earthPath = mk(s.earth_az, s.earth_el, 0x4ea3ff); X.scene.add(X.sunPath, X.earthPath);
}
function fitShadow(dir) {
  const wide = S.view === 'region' || S.view === 'orbit', b = wide && X.farBox ? X.farBox : X.box;
  if (X.far) X.far.receiveShadow = X.far.castShadow = wide;
  const L = X.sun; L.position.copy(dir).multiplyScalar(wide ? 150000 : 20000); L.target.position.set(0, 0, 0); L.updateMatrixWorld(); L.target.updateMatrixWorld();
  const look = new THREE.Matrix4().lookAt(L.position, L.target.position, Math.abs(dir.y) > 0.99 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0));
  const inv = new THREE.Matrix4().copy(look).setPosition(L.position).invert(), c = new THREE.Box3();
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) c.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(inv));
  Object.assign(L.shadow.camera, { left: c.min.x - 20, right: c.max.x + 20, bottom: c.min.y - 20, top: c.max.y + 20, near: Math.max(1, -c.max.z - 50), far: -c.min.z + 50 });
  L.shadow.camera.updateProjectionMatrix(); renderer.shadowMap.needsUpdate = true;
}

/* ================= time in the explorer ================= */
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
  fitShadow(sd); X.sun.intensity = 4.2 * st.frac; // share of the solar disc above the terrain, from our horizon data (terrain up to 300 km away)
  X.skySun.position.copy(sd).multiplyScalar(10); X.skySun.target.position.set(0, 0, 0);
  $('#scrub').value = S.t;
  const s = series(), now = new Date(toDate(s.t[0]).getTime() + S.t * 3600e3), dh = Math.floor(S.t);
  $('#clock').innerHTML = `Day ${Math.floor(dh / 24) + 1}<small>${date(now.toISOString())}, ${pad(now.getUTCHours())}:00 UTC</small>`;
  $$('#days button').forEach(b => b.classList.toggle('on', +b.dataset.h <= S.t && S.t < +b.dataset.h + 24 * (+b.dataset.n || 1)));
  const sunTxt = st.frac > 0.99 ? 'Sunlit' : st.frac < 0.01 ? 'In shadow' : 'Partly sunlit';
  $('#status').innerHTML = `<div class="chip" style="--c:${st.frac > 0.01 ? 'var(--sun)' : 'var(--muted)'}">${st.frac > 0.01 ? ICON.sun : ICON.dark}${sunTxt}</div>
    <div class="chip" style="--c:${st.contact ? 'var(--earth)' : 'var(--muted)'}">${ICON.earth}${st.contact ? 'Talking to Earth' : 'No contact with Earth'}</div>
    ${st.power != null ? `<div class="chip" style="--c:#fff">${ICON.bolt}${watts(st.power)} from the Sun</div>` : ''}
    ${st.soc != null ? `<div class="chip" style="--c:var(--go)">Battery ${pct(st.soc * (st.soc <= 1 ? 100 : 1))}</div>` : ''}
    <div class="chip xp" style="--c:var(--line)">Sun ${level(st.sunEl)}, Earth ${level(st.earthEl)}</div>`;
  if (S.view === 'fp' && X.walked) updateWalkChip();
}
function drawBars() {
  const c = $('#bars'), s = series(), n = s.t.length, w = c.width = c.clientWidth * devicePixelRatio, h = c.height = 12 * devicePixelRatio, g = c.getContext('2d');
  g.clearRect(0, 0, w, h);
  for (let i = 0; i < n; i++) { const x = i / n * w, ww = Math.max(1, w / n + 0.5), f = s.sun_frac_worst_median_best[1][i];
    g.fillStyle = f > 0.5 ? '#f5b83d' : 'rgba(255,255,255,.12)'; g.fillRect(x, 0, ww, h * 0.45); g.fillStyle = s.earth_contact[i] ? '#4ea3ff' : 'rgba(255,255,255,.12)'; g.fillRect(x, h * 0.58, ww, h * 0.42); }
  const days = Math.ceil(n / 24), every = days > 20 ? Math.ceil(days / 15) : 1;
  $('#days').innerHTML = Array.from({ length: Math.ceil(days / every) }, (_, k) => `<button data-h="${k * every * 24}" data-n="${every}" style="left:${k * every * 24 / n * 100}%">D${k * every + 1}</button>`).join('');
  $$('#days button').forEach(b => b.onclick = () => { S.t = +b.dataset.h; applyTime(); });
}

/* ================= navigation ================= */
const ORDER = ['hero', 'who', 'mission', 'results', 'explore', 'compare'];
let scene = 'moon', anim = null;
function go(name) {
  if (['results', 'explore', 'compare'].includes(name) && !S.data) return;
  const prev = S.screen; S.screen = name; document.body.dataset.screen = name;
  $$('.screen').forEach(s => s.classList.toggle('on', s.id === name));
  $$('.pop').forEach(p => p.remove()); $('#calendar').classList.remove('open');
  const idx = ORDER.indexOf(name);
  $$('#progress li').forEach(li => { const k = ORDER.indexOf(li.dataset.step); li.className = k === idx ? 'now' : k < idx ? 'done reach' : (S.data ? 'reach' : ''); });
  M.controls.enabled = name === 'results'; X.controls.enabled = name === 'explore' && S.view !== 'fp';
  if (POSE[name]) { leaveMap(); [M.tiltTo, M.distTo, M.offTo] = POSE[name]; M.ring.material.opacity = name === 'mission' ? 0.9 : 0; }
  if (name === 'results') { if (M.map) backToMap(); else flyToPole(); }
  if (name === 'explore') scene = 'site';
  if (name === 'compare') renderCompare();
  setPlaying(false);
}
function leaveMap() {
  anim = null; scene = 'moon'; M.map = false; M.full.visible = true; M.holed.visible = false; if (M.cap) M.cap.visible = false; M.tintTo = 0;
  M.sun.position.set(-3, 1.4, 2.2); M.hemi.intensity = 0.04;
}
// globe -> south pole map without a cut: the Moon turns its pole up and the camera comes down over the real terrain
function flyToPole() {
  scene = 'moon'; buildCap(); M.full.visible = false; M.holed.visible = true; if (M.cap) M.cap.visible = true;
  const from = { tilt: M.tilt, spin: M.spin % (Math.PI * 2), cam: M.camera.position.clone() }, t0 = performance.now(), dur = REDUCED ? 1 : 2400;
  const end = mapFrame(); M.ring.material.opacity = 0; M.offY = 0; M.offX = 0;
  anim = now => {
    const k = Math.min(1, (now - t0) / dur), e = ease(k);
    M.tilt = M.tiltTo = from.tilt + (-Math.PI - from.tilt) * e; M.pivot.rotation.set(M.tilt, 0, 0);
    M.moon.rotation.y = from.spin * (1 - e); M.spin = M.moon.rotation.y;
    M.camera.position.lerpVectors(from.cam, end.cam, e); M.camera.lookAt(new THREE.Vector3().lerpVectors(new THREE.Vector3(), end.target, e));
    M.sun.position.lerpVectors(new THREE.Vector3(-3, 1.4, 2.2), end.light, e); M.hemi.intensity = 0.04 + 0.5 * e;
    if (k > 0.55) M.tintTo = 1;
    if (k >= 1) { anim = null; M.map = true; M.controls.target.copy(end.target); M.controls.update(); }
  };
}
function mapFrame() {
  // camera position over the pole that frames the three options (computed with the Moon in its final pose)
  const keep = [M.pivot.rotation.x, M.moon.rotation.y];
  M.pivot.rotation.set(-Math.PI, 0, 0); M.moon.rotation.y = 0; M.pivot.updateMatrixWorld(true);
  const w = S.data.options.map(o => siteWorld(S.index.sites.find(s => s.id === o.site)));
  const c = w.reduce((a, v) => a.add(v), new THREE.Vector3()).multiplyScalar(1 / w.length);
  const spread = Math.max(0.02, ...w.map(v => v.distanceTo(c)));
  const d = spread * 4.6 + 0.03, up = c.clone().normalize();
  const cam = c.clone().addScaledVector(up, d).add(new THREE.Vector3(0, 0, d * 0.32));
  const s0 = S.sites[S.data.options[0].site], dv = dirFromAzEl(s0, S.data.options[0].landing.sun_azimuth_deg, 25);
  const light = new THREE.Vector3(-dv.z, dv.y, dv.x).multiplyScalar(3); // map frame -> world at the pole (south pole up)
  M.pivot.rotation.x = keep[0]; M.moon.rotation.y = keep[1]; M.pivot.updateMatrixWorld(true);
  return { cam, target: c, light };
}
function backToMap() { scene = 'moon'; if (M.saved) { M.camera.position.copy(M.saved.cam); M.controls.target.copy(M.saved.target); M.controls.update(); } }

/* ================= step 1: who ================= */
$$('#roles .choice').forEach(b => b.onclick = () => {
  S.role = b.dataset.role; $$('#roles .choice').forEach(x => x.setAttribute('aria-pressed', x === b));
  setMode(S.role === 'student' || S.role === 'past' ? 'simple' : 'expert');
  S.q = 0; S.doc = null; S.answers = null; renderMission(); go('mission');
});

/* ================= step 2: mission ================= */
function renderMission() {
  const el = $('#missionBody');
  if (S.role === 'student') {
    el.innerHTML = `<h2>Pick a mission</h2><p class="lead">We show you where it should land on the Moon, and why.</p>
      <div class="choices">${MISSIONS.map(m => `<button class="choice" data-m="${m.id}"><b>${m.name}</b><span>${m.kid}</span></button>`).join('')}</div>`;
    $$('#missionBody [data-m]').forEach(b => b.onclick = () => loadPreset(b.dataset.m, b));
  } else if (S.role === 'past') {
    const U = S.upcoming || { missions: [] };
    el.innerHTML = `<h2>Upcoming missions</h2><p class="lead">Planned south pole landings from public sources. Dates are targets and often slip.</p>
      <div class="choices">${U.missions.map((u, i) => `<div class="choice mission"><b>${esc(u.name)}</b><span class="tagline">${esc(u.agency)}. ${esc(u.when)}. ${esc(u.target)}.</span><span>${esc(u.goal)}</span>
        <div class="mrow"><button class="btn" data-u="${i}" style="padding:9px 16px">${u.preset ? 'See the full analysis' : 'Check it with your values'}</button><a href="${u.source}" target="_blank" rel="noopener">Source</a></div></div>`).join('')}</div>
      <p class="small" style="margin-top:18px">${esc(U.note || '')}</p>
      <h2 style="margin-top:34px;font-size:30px">Example missions</h2>
      <div class="choices">${MISSIONS.filter(m => m.id === 'argonaut').map(m => `<button class="choice" data-m="${m.id}"><b>${m.name}</b><span>${m.who}</span></button>`).join('')}</div>`;
    $$('#missionBody [data-m]').forEach(b => b.onclick = () => loadPreset(b.dataset.m, b));
    $$('#missionBody [data-u]').forEach(b => b.onclick = () => { const u = U.missions[+b.dataset.u];
      if (u.preset) { b.textContent = 'Loading…'; loadPreset(u.preset); }
      else { S.role = 'agency'; S.answers = null; S.q = 0; S.doc = { pages: 0, fields: {} }; renderQuestion(); S.answers.earliestUtc = u.earliest; renderQuestion(); } });
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
    const rows = Object.entries(F).filter(([k]) => names[k]).map(([k, f]) => `<div><span>${names[k][0]}</span><span>${f.v == null ? 'Two different values, we will ask you' : esc(names[k][1](f.v))}</span></div>`).join('');
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
  const pre = await getJSON(`presets/${id}.json`).catch(() => null), lw = pre && pre.power && pre.power.load_operations_w && pre.power.load_operations_w.v;
  COST.loadW = lw || 100; S.data.costLoadGiven = !!lw;
  await afterData();
}
async function afterData() {
  await Promise.all(S.data.options.map(o => siteMeta(o.site)));
  S.opt = 0; X.sid = null; S.when = null; S.whenIdx = null; M.map = false;
  placeMarkers(); placePlaces(); renderResults(); go('results'); loadWhen();
}

const QS = [
  { k: 'earliestUtc', q: 'When is the earliest you can land?', type: 'date', def: '2027-06-01' },
  { k: 'slipDays', q: 'How late could you land?', why: 'We look for the best time inside this window.', opts: [[0, 'Only on that date'], [7, 'Up to a week later'], [30, 'Up to a month later'], [60, 'Up to two months later']], def: 30 },
  { k: 'durationDays', q: 'How long will you stay on the surface?', opts: [[7, 'One week'], [14, 'Two weeks'], [30, 'One month'], [90, 'Three months']], def: 14 },
  { k: 'continuousSun', q: 'Do you need sunlight all the time?', why: 'Some missions cannot survive a single night.', opts: [[true, 'Yes, always'], [false, 'No, short nights are fine']], def: false },
  { k: 'earthAtLanding', q: 'Must you talk to Earth while landing?', opts: [[true, 'Yes'], [false, 'No']], def: true },
  { k: 'loadW', q: 'How much power does your mission use?', why: 'If you do not know yet, we show what a 100 W mission would need.', type: 'number', unit: 'watts', unknown: 'I don\'t know yet', def: null },
  { k: 'batteryWh', q: 'How big is your battery?', type: 'number', unit: 'watt-hours', unknown: 'I don\'t know yet', def: null },
  { k: 'mast', q: 'Where are your solar panels?', why: 'Higher panels see the Sun for longer.', opts: [[false, 'On the lander, about 2 m up'], [true, 'On a 10 m mast']], def: false },
];
function renderQuestion() {
  if (!S.answers) S.answers = Object.fromEntries(QS.map(x => [x.k, x.def]));
  const F = (S.doc && S.doc.fields) || {};
  for (const [k, f] of Object.entries(F)) if (f.v != null && k in S.answers && !S.answers['_set_' + k]) { S.answers[k] = f.v; S.answers['_set_' + k] = 1; }
  const Q = QS[S.q], v = S.answers[Q.k], el = $('#missionBody');
  const fromDoc = F[Q.k] && F[Q.k].v != null ? `<span class="from-doc">From your document, ${esc(F[Q.k].src.split(':')[0])}</span>`
    : F[Q.k] && F[Q.k].conflict ? `<span class="from-doc" style="color:var(--care)">Your document gives different values: ${F[Q.k].conflict.map(c => `${esc(c.v)} on page ${c.page}`).join(', ')}. Pick the one for this mission.</span>` : '';
  let body = '';
  if (Q.opts) body = `<div class="choices${Q.opts.length === 2 ? ' two' : ''}">${Q.opts.map(([val, lab]) => `<button class="choice" data-v='${JSON.stringify(val)}' aria-pressed="${JSON.stringify(v) === JSON.stringify(val)}"><b>${lab}</b></button>`).join('')}</div>`;
  else if (Q.type === 'date') body = `<div class="field-in"><input type="date" id="inp" min="2026-11-02" max="2032-08-01" value="${String(v).slice(0, 10)}"></div>`;
  else body = `<div class="field-in"><input type="number" min="0" id="inp" value="${v ?? ''}" placeholder="0"><span>${Q.unit}</span></div><div class="choices"><button class="choice" id="unk" aria-pressed="${v == null}"><b>${Q.unknown}</b></button></div>`;
  el.innerHTML = `<div class="qcount">Question ${S.q + 1} of ${QS.length}</div><h2 class="q">${Q.q}</h2>${Q.why ? `<p class="lead">${Q.why}</p>` : ''}${fromDoc}${body}
    <div class="qnav"><button class="btn primary" id="qnext">${S.q === QS.length - 1 ? 'Find my landing sites' : 'Next'}</button></div><div class="bar-load" hidden id="qLoad"><i></i></div><p class="small" id="qErr"></p>`;
  // a choice answers the question and moves on
  $$('#missionBody .choice[data-v]').forEach(b => b.onclick = () => { S.answers[Q.k] = JSON.parse(b.dataset.v); $$('#missionBody .choice[data-v]').forEach(x => x.setAttribute('aria-pressed', x === b)); setTimeout(nextQ, 160); });
  const inp = $('#inp'); if (inp) { inp.oninput = () => { S.answers[Q.k] = Q.type === 'date' ? inp.value : (inp.value === '' ? null : +inp.value); const u = $('#unk'); if (u) u.setAttribute('aria-pressed', inp.value === ''); }; inp.onkeydown = e => { if (e.key === 'Enter') nextQ(); }; }
  const unk = $('#unk'); if (unk) unk.onclick = () => { S.answers[Q.k] = null; inp.value = ''; unk.setAttribute('aria-pressed', true); setTimeout(nextQ, 160); };
  $('#qnext').onclick = nextQ;
}
function nextQ() { if (S.q < QS.length - 1) { S.q++; renderQuestion(); } else runQuick(); }
async function runQuick() {
  const a = S.answers, bar = $('#qLoad'); bar.hidden = false; $('#qnext').disabled = true;
  try {
    await Promise.all(S.index.sites.map(s => siteMeta(s.id)));
    const p = { earliestUtc: a.earliestUtc + 'T00:00:00Z', slipDays: a.slipDays, durationDays: a.durationDays, mast: a.mast, continuousSun: a.continuousSun, earthAtLanding: a.earthAtLanding, loadW: a.loadW, batteryWh: a.batteryWh, dte: true };
    S.data = await quickCheck(p, S.index, S.sites, f => $('#qLoad i').style.width = Math.round(f * 100) + '%');
    S.data.profile = p; S.mission = 'custom'; COST.loadW = a.loadW || 100; S.data.costLoadGiven = !!a.loadW;
    await afterData();
  } catch (e) { $('#qErr').textContent = e.message; $('#qnext').disabled = false; }
}

/* ================= step 3: results ================= */
function cardFacts(x, m) {
  // m: metrics at the chosen landing date (centre of the site), or null for the full analysis at the site's best date
  const sun = m ? m.sunPct : x.light.sun_pct, dark = m ? m.longestDark : x.light.longest_dark_h, con = m ? m.contactPct : x.comms.contact_pct;
  const simple = `${fact(sun > 50 ? 'sun' : 'dark', W.sun(sun), W.dark(dark))}${fact('earth', W.earth(con))}${fact('cost', W.costDark(dark))}`;
  const r = k => !m && x.ranges && x.ranges[k];
  const expert = `${fact('sun', `Sunlight ${r('sun_pct') ? range(x.ranges.sun_pct, pct) : pct(sun)}`, `Longest darkness ${r('longest_dark_h') ? range(x.ranges.longest_dark_h, hrs) : hrs(dark)}`)}
    ${fact('earth', `Earth contact ${r('contact_pct') ? range(x.ranges.contact_pct, pct) : pct(con)}`, m ? `${hrs(m.lostH)} without Sun or contact` : `Longest gap ${hrs(x.comms.longest_gap_h)}`)}
    ${dark > 0 ? fact('cost', `Darkness: at least ${usd(costDark(dark))}`, `${fmt(battKg(dark), 1)} kg of battery for ${fmt(COST.loadW)} W, at ${usd(priceNow().usdPerKg)}/kg`) : fact('cost', 'No extra battery for darkness')}`;
  return `<div class="facts sp">${simple}</div><div class="facts xp">${expert}</div>`;
}
function renderResults() {
  const o = S.data.options, best = o[0], v = verdictOf(best), common = S.whenIdx != null && S.when;
  const head = { green: `Land at ${best.site_name}.`, yellow: `${best.site_name} is your best option.`, red: 'No site fully meets your needs.' };
  $('#answer').textContent = head[v];
  $('#answerSub').innerHTML = `<span class="sp">${v === 'red' ? 'These are the closest matches. Each card says what goes wrong.' : `Best landing time: ${dateTime(best.landing_utc)}.`}</span><span class="xp">${esc(S.data.trust_badge)}.</span>`;
  const cal = S.data.calendar;
  $('#cards').innerHTML = o.map((x, i) => {
    let vv = verdictOf(x), when = date(x.landing_utc), m = null;
    if (common && S.when[x.site]) { m = S.when[x.site][S.whenIdx]; const row = cal.sites[x.site] && cal.sites[x.site][S.whenIdx]; if (row) vv = row[2]; when = date(m.utc); }
    return `<article class="card" style="--c:${VC[vv]}">
      <div class="top"><span class="rank" style="color:${LINE[i]}">${i + 1}</span><div><h3>${esc(x.site_name)}</h3><div class="cwhen">${common ? 'If you land on ' : 'Best: '}${when}</div></div></div>
      <div class="verdict" style="color:${VC[vv]}"><span class="sp">${VSIMPLE[vv]}</span><span class="xp">${vx(vv)}</span></div>
      ${cardFacts(x, m)}
      ${!common && x.reasons && x.reasons.length ? `<p class="why">${esc(x.reasons[0])}</p>` : ''}
      ${common ? `<p class="why">${vv !== 'green' && m && m.sunPct >= 99 && m.contactPct >= 90 ? 'The centre of the site is fine on this date, but part of the landing area fails the checks.' : '<span class="xp">Numbers at the centre of the site; the verdict covers the whole landing area.</span>'}</p>` : ''}
      <button class="btn go3d" data-open="${i}">See it in 3D</button></article>`;
  }).join('');
  $$('[data-open]').forEach(b => b.onclick = () => openExplore(+b.dataset.open));
}
// date slider: metrics for every landing time in the calendar range, at the centre of each option's site
async function loadWhen() {
  const cal = S.data.calendar, first = cal.sites[Object.keys(cal.sites)[0]], dur = Math.round(S.data.options[0].duration_h), mast = !!(S.data.profile && S.data.profile.mast);
  $('#whenSlider').max = first.length - 1;
  S.bestIdx = Math.max(0, first.findIndex(r => r[0].slice(0, 13) === S.data.options[0].landing_utc.slice(0, 13))); $('#whenSlider').value = S.bestIdx;
  $('#whenDate').textContent = 'Each site at its best date';
  const W2 = {};
  await Promise.all(S.data.options.map(async o => { W2[o.site] = await dateMetrics(S.index.sites.find(s => s.id === o.site), S.sites[o.site], first[0][0], first[first.length - 1][0], dur, mast, cal.step_hours); }));
  S.when = W2; drawWhen();
}
const metricVal = m => S.metric === 'sun' ? m.sunPct : S.metric === 'earth' ? m.contactPct : costDark(m.longestDark);
function drawWhen() {
  const c = $('#whenChart'); if (!S.when || !c.clientWidth) return;
  const dpr = devicePixelRatio, w = c.clientWidth, h = c.clientHeight; c.width = w * dpr; c.height = h * dpr;
  const g = c.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, w, h);
  const sets = S.data.options.map(o => S.when[o.site] || []), n = sets[0].length; if (n < 2) return;
  const max = S.metric === 'cost' ? Math.max(1, ...sets.flat().map(metricVal)) : 100;
  const cal = S.data.calendar, x = i => i / (n - 1) * w, y = v => h - 6 - v / max * (h - 18);
  (cal.sites[S.data.options[0].site] || []).forEach((row, i) => { g.fillStyle = row[2] === 'green' ? 'rgba(47,210,122,.6)' : row[2] === 'yellow' ? 'rgba(255,176,32,.55)' : 'rgba(255,90,79,.35)'; g.fillRect(x(i), h - 3, Math.max(1, w / n), 3); });
  sets.forEach((set, k) => { g.strokeStyle = LINE[k]; g.globalAlpha = k ? 0.85 : 1; g.lineWidth = k ? 1.2 : 1.8; g.beginPath(); set.forEach((m, i) => g[i ? 'lineTo' : 'moveTo'](x(i), y(metricVal(m)))); g.stroke(); });
  g.globalAlpha = 1; const i = S.whenIdx ?? S.bestIdx; g.fillStyle = '#fff'; g.fillRect(x(i) - 1, 0, 2, h);
  g.fillStyle = 'rgba(255,255,255,.55)'; g.font = '11px Barlow, sans-serif'; let lastM = -1;
  sets[0].forEach((m, k) => { const d = toDate(m.utc); if (d.getUTCMonth() !== lastM && d.getUTCDate() <= 2) { lastM = d.getUTCMonth(); g.fillText(MON[lastM], x(k) + 3, 11); } });
  g.textAlign = 'right'; g.fillText(S.metric === 'cost' ? usd(max) : '100%', w - 2, 11);
}
$('#whenSlider').oninput = e => { S.whenIdx = +e.target.value; const m = S.when && S.when[S.data.options[0].site]; $('#whenDate').textContent = m ? `Land on ${dateTime(m[S.whenIdx].utc)}` : ''; renderResults(); drawWhen(); };
$('#toBest').onclick = () => { S.whenIdx = null; $('#whenSlider').value = S.bestIdx; $('#whenDate').textContent = 'Each site at its best date'; renderResults(); drawWhen(); };
$$('#metric button').forEach(b => b.onclick = () => { S.metric = b.dataset.m; $$('#metric button').forEach(x => x.setAttribute('aria-pressed', x === b)); drawWhen(); });
$('#dockToggle').onclick = () => { const d = $('#dock'), c = d.classList.toggle('closed'); document.body.classList.toggle('wide', c); $('#dockToggle').textContent = c ? 'Show options' : 'Hide options'; $('#dockToggle').setAttribute('aria-expanded', !c); setTimeout(drawWhen, 480); };

/* ================= step 4: explore ================= */
async function openExplore(i) {
  S.opt = i; S.t = 0; S.hw = 'none'; X.walked = false;
  if (S.screen === 'results' && M.map && !REDUCED) {
    // enter: the map camera dives toward the site, then the 3D site takes over
    M.saved = { cam: M.camera.position.clone(), target: M.controls.target.clone() };
    const s = S.index.sites.find(x => x.id === opt().site), p = siteWorld(s), from = M.camera.position.clone(), ft = M.controls.target.clone(), t0 = performance.now();
    const to = p.clone().addScaledVector(p.clone().normalize(), 0.004).add(new THREE.Vector3(0, 0, 0.002));
    M.controls.enabled = false;
    await new Promise(res => { anim = now => { const k = Math.min(1, (now - t0) / 1100), e = ease(k); M.camera.position.lerpVectors(from, to, e); const tg = new THREE.Vector3().lerpVectors(ft, p, e); M.camera.lookAt(tg); $('#fade').style.opacity = k > 0.7 ? (k - 0.7) * 3.3 : 0; if (k >= 1) { anim = null; res(); } }; });
  }
  go('explore');
  $('#optTabs').innerHTML = S.data.options.map((o, k) => `<button data-k="${k}" aria-pressed="${k === i}">${k + 1} ${esc(o.site_name)}</button>`).join('');
  $$('#optTabs button').forEach(b => b.onclick = () => openExplore(+b.dataset.k));
  const L = $('#loading'); L.classList.add('on'); $('#loadFact').textContent = FACTS[Math.floor(Math.random() * FACTS.length)];
  $('#panel').innerHTML = '';
  await buildSite(opt().site);
  for (const k of ['ring', 'glow', 'sunPath', 'earthPath']) if (X[k]) { X.scene.remove(X[k]); X[k].geometry.dispose(); X[k] = null; }
  setRing(opt().ellipse_radius_m || 50); setPaths(); X.ring.visible = X.glow.visible = S.view !== 'fp';
  $('#scrub').max = series().t.length - 1;
  renderPanel(); drawBars(); setView(S.view, true); L.classList.remove('on'); $('#fade').style.opacity = 0;
}
const VIEW = {
  drone: back => ({ pos: new THREE.Vector3(back.x * 120, 55, back.z * 120), target: new THREE.Vector3(0, 2, 0), fov: 50 }),
  region: back => ({ pos: new THREE.Vector3(back.x * 5200, 7600, back.z * 5200), target: new THREE.Vector3(0, 0, 0), fov: 50 }),
  orbit: back => ({ pos: new THREE.Vector3(back.x * 22000, 38000, back.z * 22000), target: new THREE.Vector3(0, 0, 0), fov: 50 }),
};
function setView(v, instant) {
  S.view = v; $$('#views button').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === v));
  X.lander.visible = v !== 'fp'; if (X.sunPath) X.sunPath.visible = X.earthPath.visible = v === 'drone'; if (X.ring) X.ring.visible = X.glow.visible = v !== 'fp';
  $('#walkhint').classList.toggle('on', v === 'fp'); $('#walkhint').textContent = 'Use the arrow keys or W A S D to walk. Hold Shift to run. Drag to look around.';
  const st = sample(S.t), back = dirFromAzEl(X.site, st.sunAz + 150, 0);
  X.controls.enabled = false;
  const fromPos = X.camera.position.clone(), fromTgt = X.controls.target.clone(), fromFov = X.camera.fov;
  let to;
  if (v === 'fp') { X.yaw = st.sunAz; X.pitch = 2; to = { pos: new THREE.Vector3(0, localH(0, 0) + 2, 0), fov: 60 }; to.target = to.pos.clone().add(dirFromAzEl(X.site, X.yaw, X.pitch)); }
  else to = VIEW[v](back);
  const done = () => { X.camera.position.copy(to.pos); X.camera.fov = to.fov; X.camera.updateProjectionMatrix(); if (v === 'fp') lookFP(); else { X.controls.target.copy(to.target); X.camera.lookAt(to.target); X.controls.update(); X.controls.enabled = S.screen === 'explore'; } applyTime(); };
  if (instant || REDUCED) { done(); return; }
  const t0 = performance.now();
  anim = now => { const k = Math.min(1, (now - t0) / 1000), e = ease(k);
    X.camera.position.lerpVectors(fromPos, to.pos, e); const tg = fromTgt.clone().lerp(to.target, e); X.camera.lookAt(tg); X.controls.target.copy(tg);
    X.camera.fov = fromFov + (to.fov - fromFov) * e; X.camera.updateProjectionMatrix();
    if (k >= 1) { anim = null; done(); } };
}
function lookFP() { X.camera.lookAt(X.camera.position.clone().add(dirFromAzEl(X.site, X.yaw, X.pitch))); }
// look at the Sun or Earth: turn to it and zoom in, so Earth's real phase is visible
function lookAt(which) {
  const st = sample(S.t), az = which === 'sun' ? st.sunAz : st.earthAz, el = which === 'sun' ? st.sunEl : st.earthEl;
  if (S.view !== 'fp') setView('fp', true);
  const y0 = X.yaw, p0 = X.pitch, f0 = X.camera.fov, f1 = which === 'earth' ? 3.2 : 6, t0 = performance.now(), dy = ((az - y0 + 540) % 360) - 180;
  anim = now => { const k = Math.min(1, (now - t0) / 1400), e = ease(k); X.yaw = y0 + dy * e; X.pitch = p0 + (el - p0) * e; X.camera.fov = f0 + (f1 - f0) * e; X.camera.updateProjectionMatrix(); lookFP(); if (k >= 1) anim = null; };
}
$('#lookSun').onclick = () => lookAt('sun'); $('#lookEarth').onclick = () => lookAt('earth');
{
  let drag = null;
  canvas.addEventListener('pointerdown', e => { if (S.screen === 'explore' && S.view === 'fp') { drag = { x: e.clientX, y: e.clientY, yaw: X.yaw, pitch: X.pitch }; canvas.setPointerCapture(e.pointerId); if (X.camera.fov < 50) { X.camera.fov = 60; X.camera.updateProjectionMatrix(); } } });
  canvas.addEventListener('pointermove', e => { if (!drag) return; X.yaw = drag.yaw - (e.clientX - drag.x) * 0.25; X.pitch = Math.max(-60, Math.min(70, drag.pitch + (e.clientY - drag.y) * 0.25)); lookFP(); });
  addEventListener('pointerup', () => drag = null);
  // the wheel moves time (scroll through the days); with Shift it zooms
  canvas.addEventListener('wheel', e => {
    if (S.screen !== 'explore' || !S.data || !X.site) return; e.preventDefault();
    if (e.shiftKey && S.view !== 'fp') { const d = X.camera.position.clone().sub(X.controls.target); d.multiplyScalar(Math.exp((e.deltaY || e.deltaX) * 0.001)); X.camera.position.copy(X.controls.target).add(d); return; }
    const n = series().t.length - 1; S.t = Math.max(0, Math.min(n, S.t + e.deltaY * 0.02)); applyTime();
  }, { passive: false });
  addEventListener('keydown', e => { if (S.screen === 'explore' && S.view === 'fp' && !e.target.closest('input')) { X.walk[e.key.toLowerCase()] = true; if (e.key.startsWith('Arrow')) e.preventDefault(); } });
  addEventListener('keyup', e => { X.walk[e.key.toLowerCase()] = false; });
}
function walkStep(dt) {
  const k = X.walk, f = (k.w || k.arrowup ? 1 : 0) - (k.s || k.arrowdown ? 1 : 0), r = (k.d || k.arrowright ? 1 : 0) - (k.a || k.arrowleft ? 1 : 0);
  if (!f && !r) return;
  const sp = (k.shift ? 150 : 30) * dt, fwd = dirFromAzEl(X.site, X.yaw, 0), right = dirFromAzEl(X.site, X.yaw + 90, 0);
  const p = X.camera.position.clone().addScaledVector(fwd, f * sp).addScaledVector(right, r * sp), lim = X.half - 50;
  p.x = Math.max(-lim, Math.min(lim, p.x)); p.z = Math.max(-lim, Math.min(lim, p.z)); p.y = localH(p.x, p.z) + 2;
  X.camera.position.copy(p); lookFP(); X.walked = true; updateWalkChip();
}
function updateWalkChip() {
  // distance from the lander and direction to the nearest permanently shadowed area while walking
  const p = X.camera.position, mx = X.site.x_m + p.x, my = X.site.y_m - p.z, P = S.psr; let best = 1e18, bi = -1;
  for (let i = 0; i < P.x_m.length; i++) { const dx = P.x_m[i] - mx, dy = P.y_m[i] - my; if (Math.abs(dx) > 30000 || Math.abs(dy) > 30000) continue; const d = dx * dx + dy * dy; if (d < best) { best = d; bi = i; } }
  if (bi < 0) return;
  const v = new THREE.Vector3(P.x_m[bi] - mx, 0, -(P.y_m[bi] - my)).normalize(), fwd = dirFromAzEl(X.site, X.yaw, 0);
  const ang = Math.round(deg(Math.atan2(fwd.x * v.z - fwd.z * v.x, fwd.x * v.x + fwd.z * v.z)));
  $('#walkhint').innerHTML = `${fmt(Math.hypot(p.x, p.z))} m from the lander. Nearest ice-bearing dark area (centre): ${fmt(Math.sqrt(best) / 1000, 2)} km, ${Math.abs(ang) < 15 ? 'straight ahead' : ang > 0 ? `${Math.abs(ang)}° to your right` : `${Math.abs(ang)}° to your left`}.`;
}

function lostHours(x) { const s = x.series_hourly; let n = 0; for (let i = 0; i < s.t.length; i++) if (!(s.sun_frac_worst_median_best[1][i] > 0.5) || !s.earth_contact[i]) n++; return n; }
function renderPanel() {
  const o = opt(), v = verdictOf(o), L = o.landing, rg = o.ranges || {}, tr = o.terrain, re = o.resources, tu = o.terrain_uncertainty, pw = o.power || {};
  const hw = o.hardware_toggles, h = S.hw !== 'none' && hw ? hw[S.hw] : null, pick = (k, base) => h && h[k] ? [h[k][1], h[k][1]] : base;
  const ice = re && re['nearest_over_0.01km2_km'], stay = Math.round(o.duration_h / 24);
  const sunR = pick('sun_pct', rg.sun_pct || [o.light.sun_pct, o.light.sun_pct]), darkR = pick('longest_dark_h', rg.longest_dark_h || [o.light.longest_dark_h, o.light.longest_dark_h]);
  const conR = pick('contact_pct', rg.contact_pct || [o.comms.contact_pct, o.comms.contact_pct]), lost = lostHours(o);
  const row = (label, value, why) => `<div class="r"><span>${label}</span><span class="num">${value}</span>${why ? `<em>${why}</em>` : ''}</div>`;
  let whatIf = '';
  if (hw) {
    const opts = [['none', 'Standard'], ['mast_10m', '10 m mast'], ['tracking_panels', 'Follow the Sun']];
    const eff = h ? (h.sun_pct[1] - h.sun_pct[0] > 0.5 || h.longest_dark_h[0] - h.longest_dark_h[1] > 0.5 ? `Sunlight ${pct(h.sun_pct[0])} → ${pct(h.sun_pct[1])}. Longest darkness ${hrs(h.longest_dark_h[0])} → ${hrs(h.longest_dark_h[1])}.` : `No change here: this site already gets ${pct(h.sun_pct[0])} sunlight with standard panels.`) : 'Standard: panels fixed on the lander, about 2 m above the ground. Pick another option to see what changes at this site.';
    whatIf = `<div class="sec"><h4>What if you change the solar panels</h4><div class="seg3">${opts.map(([k, l]) => `<button data-hw="${k}" aria-pressed="${S.hw === k}">${l}</button>`).join('')}</div><p class="small" style="margin:8px 0 0">${eff}</p></div>`;
  }
  $('#panel').innerHTML = `
    <div><h3>${esc(o.site_name)}</h3><div class="small">Landing ${dateTime(o.landing_utc)}, ${stay} days on the surface</div>
      <div class="verdict" style="color:${VC[v]};margin-top:12px"><span class="sp">${VSIMPLE[v]}</span><span class="xp">${vx(v)}</span></div></div>
    <div class="big sp">
      ${fact(sunR[0] > 50 ? 'sun' : 'dark', W.sun(sunR[0]), W.dark(darkR[1]))}
      ${fact('earth', W.earth(conR[0]), o.comms.longest_gap_h > 0 ? `Longest silence: ${hrs(o.comms.longest_gap_h)}` : '')}
      ${fact('cost', W.costDark(darkR[1]), darkR[1] > 0 ? `${fmt(battKg(darkR[1]), 1)} kg of extra battery for every ${fmt(COST.loadW)} W you keep on` : '')}
      ${ice != null ? fact('ice', W.ice(ice)) : ''}${tr ? fact('slope', W.ground(tr)) : ''}
    </div>
    ${o.reasons && o.reasons.length ? `<div class="sec"><h4>Watch out</h4><ul class="reasons">${o.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}
    ${whatIf}
    <div class="sec"><h4>What you are seeing</h4><p class="small" style="margin:0">Real NASA terrain around the landing spot. The glowing circle is where the lander can touch down. In Fly over, gold dots trace the Sun's path across the sky during your stay and blue dots trace Earth. Scroll to move through the days.</p></div>
    <div class="sec xp"><h4>Sunlight</h4><div class="rows">
      ${row('Time in sunlight', range(sunR, pct), 'Share of the stay with more than half of the Sun above the terrain, seen by panels 2 m up.')}
      ${row('Longest darkness', range(darkR, hrs), 'The battery must carry the lander through this.')}
      ${row('Until first sunset', hrs(o.light.hours_to_sunset), 'Time after landing before sunlight is first lost.')}</div></div>
    <div class="sec xp"><h4>Earth contact</h4><div class="rows">
      ${row('Time in contact', range(conR, pct), 'Earth above the terrain and a NASA Deep Space Network dish able to see the Moon.')}
      ${row('Longest gap', hrs(o.comms.longest_gap_h), 'Longest time you cannot send or receive.')}
      ${o.comms.data_possible_mb != null ? row('Data you can send', fmt(o.comms.data_possible_mb / 1000) + ' GB', 'Contact hours times your data rate.') : ''}</div></div>
    <div class="sec xp"><h4>Power</h4><div class="rows">
      ${pw.energy_kwh != null ? row('Energy collected', fmt(pw.energy_kwh, 1) + ' kWh', 'From your panels over the stay.') : ''}
      ${pw.max_sustainable_load_w != null ? row('Max continuous load', watts(pw.max_sustainable_load_w), 'Most power you can use nonstop with your battery.') : ''}
      ${pw.array_needed_w != null ? row('Solar array needed', range(rg.array_needed_w || [pw.array_needed_w, pw.array_needed_w], watts), 'Smallest array that keeps your load running, with your panel layout.') : ''}
      ${pw.battery_needed_wh != null ? row('Battery needed', range(pick('battery_needed_wh', rg.battery_needed_wh || [pw.battery_needed_wh, pw.battery_needed_wh]), wh), 'Smallest battery for your load, at 80% usable charge.') : ''}
      ${!Object.keys(pw).filter(k => pw[k] != null).length ? row('Battery for 100 W', wh(darkR[1] * 100 / DOD), 'No panels or power use given, so this is what a 100 W load needs to cross the longest darkness.') : ''}</div></div>
    <div class="sec xp"><h4>Cost scenario</h4><div class="rows">
      ${row('Extra battery for darkness', usd(costDark(darkR[1])), `${fmt(battKg(darkR[1]), 1)} kg for ${fmt(COST.loadW)} W at ${BATT_WH_PER_KG} Wh/kg (NASA best cell figure, so at least), delivered at: ${esc(priceNow().label)}.`)}
      ${row('Time you cannot fully work', `${hrs(lost)} of ${hrs(o.duration_h)}`, `Hours without Sun or without Earth contact: ${usd(valueLost(lost, o.duration_h))} of a ${usd(COST.missionUsd)} mission.`)}</div>
      <p class="small" style="margin:6px 0 0">Scenarios from public prices, not quotes. Change them on the Compare page.</p></div>
    <div class="sec xp"><h4>Landing</h4><div class="rows">
      ${row('Sun at touchdown', level(L.sun_elevation_deg), 'Low Sun means long shadows on the approach.')}
      ${row('Earth at touchdown', L.earth_visible ? level(L.earth_elevation_deg) : 'Not visible', 'Needed to talk to Earth while landing.')}
      ${tr ? row('Slope, typical and steepest 10%', `${fmt(tr.median_deg, 1)}°, ${fmt(tr.p90_deg, 1)}°`, `From NASA ${tr.resolution_m} m terrain inside the landing circle.`) + row('Ground within your slope limit', pct(tr.safe_fraction * 100), '') : ''}
      ${ice != null ? row('Nearest dark area over 0.01 km²', fmt(ice, 1) + ' km', 'Permanently shadowed areas can hold water ice (NASA LOLA catalogue).') : ''}</div>
      ${L.shadow_risk ? `<p class="small">${esc(L.shadow_risk)}</p>` : ''}</div>
    ${tu ? `<div class="sec xp"><h4>How sure we are</h4><div class="rows">${row(`Checked on ${tu.clones} NASA terrain versions`, range(tu.centre_sun_pct, pct) + ' sunlight', 'The same answer on every version of the terrain means it does not hinge on terrain errors.')}
      ${String(o.orientation).startsWith('unknown') ? row('Lander orientation', 'unknown', 'We tested 8 directions and report the worst.') : ''}</div></div>` : ''}
    <div class="sec"><div class="switch"><span>Show ice-bearing dark areas in blue</span><button class="toggle" id="iceT" aria-pressed="${S.ice}" aria-label="Show dark areas"></button></div></div>
    <button class="btn" data-go="compare">Compare all options</button>`;
  $$('#panel [data-hw]').forEach(b => b.onclick = () => { S.hw = b.dataset.hw; renderPanel(); });
  $('#iceT').onclick = () => { S.ice = !S.ice; [X.mesh, X.far].forEach(m => m && setIce(m.geometry)); if (M.cap) setCapTint(M.tint); renderPanel(); };
  $$('#panel [data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
}

/* ================= calendar ================= */
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

/* ================= step 5: compare ================= */
function renderCompare() {
  const o = S.data.options, rr = (x, k) => x.ranges && x.ranges[k] ? x.ranges[k] : null, darkW = x => (rr(x, 'longest_dark_h') || [0, x.light.longest_dark_h])[1];
  const rows = [
    ['Landing time', x => date(x.landing_utc), x => dateTime(x.landing_utc)],
    ['Verdict', x => `<span class="dotw" style="--c:${VC[verdictOf(x)]}"></span>${VSIMPLE[verdictOf(x)]}`, x => `<span class="dotw" style="--c:${VC[verdictOf(x)]}"></span>${vx(verdictOf(x))}`],
    ['Sunlight', x => W.sun(x.light.sun_pct), x => range(rr(x, 'sun_pct') || [x.light.sun_pct, x.light.sun_pct], pct), x => (rr(x, 'sun_pct') || [x.light.sun_pct])[0], 'max'],
    ['Longest darkness', x => W.dark(darkW(x)), x => range(rr(x, 'longest_dark_h') || [x.light.longest_dark_h, x.light.longest_dark_h], hrs), darkW, 'min'],
    ['Contact with Earth', x => W.earth(x.comms.contact_pct), x => range(rr(x, 'contact_pct') || [x.comms.contact_pct, x.comms.contact_pct], pct), x => (rr(x, 'contact_pct') || [x.comms.contact_pct])[0], 'max'],
    ['Longest silence', x => hrs(x.comms.longest_gap_h), x => hrs(x.comms.longest_gap_h), x => x.comms.longest_gap_h, 'min'],
    ['Cost of darkness', x => darkW(x) > 0 ? `at least ${usd(costDark(darkW(x)))}` : 'None', x => darkW(x) > 0 ? `${usd(costDark(darkW(x)))} (${fmt(battKg(darkW(x)), 1)} kg)` : 'None', x => costDark(darkW(x)), 'min'],
    ['Paid time you cannot fully use', x => lostHours(x) ? usd(valueLost(lostHours(x), x.duration_h)) : 'None', x => lostHours(x) ? `${usd(valueLost(lostHours(x), x.duration_h))} (${hrs(lostHours(x))})` : 'None', x => lostHours(x), 'min'],
    ['Ground', x => W.ground(x.terrain) || '–', x => x.terrain ? `${fmt(x.terrain.median_deg, 1)}° typical, ${pct(x.terrain.safe_fraction * 100)} within limit` : '–', x => x.terrain && x.terrain.median_deg, 'min'],
    ['Ice nearby', x => x.resources ? `${fmt(x.resources['nearest_over_0.01km2_km'], 1)} km away` : '–', x => x.resources ? `${fmt(x.resources['nearest_over_0.01km2_km'], 1)} km` : '–', x => x.resources && x.resources['nearest_over_0.01km2_km'], 'min'],
    ['Can land late by', x => x.slip_tolerance_days != null ? `${fmt(x.slip_tolerance_days)} days` : '–', x => x.slip_tolerance_days != null ? `${fmt(x.slip_tolerance_days)} days` : '–', x => x.slip_tolerance_days, 'max'],
    ['Backup site', x => x.backup_site ? esc(x.backup_site.site_name) : '–', x => x.backup_site ? `${esc(x.backup_site.site_name)}, ${date(x.backup_site.landing_utc)}` : '–'],
  ];
  let html = '<div class="rh ch"></div>' + o.map((x, i) => `<div class="ch" style="--c:${VC[verdictOf(x)]}"><div class="rank" style="color:${LINE[i]}">${i + 1}</div><h3>${esc(x.site_name)}</h3></div>`).join('');
  for (const [name, fs, fx, key, best] of rows) {
    const vals = key ? o.map(key) : [], ok = vals.filter(v => v != null && isFinite(v));
    if (key && !ok.length) continue;
    const target = ok.length > 1 && !ok.every(v => Math.abs(v - ok[0]) < 1e-9) ? (best === 'max' ? Math.max(...ok) : Math.min(...ok)) : null;
    html += `<div class="rh">${name}</div>` + o.map((x, i) => `<div class="${target != null && vals[i] === target ? 'best' : ''}"><span class="sp">${fs(x)}</span><span class="xp">${fx(x)}</span></div>`).join('');
  }
  $('#cmp').innerHTML = html;
  $('#costbox').innerHTML = `<h4>Cost scenario: change the numbers</h4>
    <div class="cost-in">
      <label>Delivery price<select id="cPrice">${PRICES.map(p => `<option value="${p.id}" ${p.id === COST.price ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select></label>
      <label>Power kept on in the dark<span><input id="cLoad" type="number" min="1" value="${COST.loadW}"> W</span></label>
      <label>Your mission price<span>$ <input id="cMission" type="number" min="1" value="${COST.missionUsd / 1e6}"> million</span></label>
    </div>
    <p class="small">Scenarios built only from public prices, not quotes. Extra battery = longest darkness × power ÷ 0.8 usable charge ÷ ${BATT_WH_PER_KG} Wh/kg (the best lithium-ion cells in NASA's Small Spacecraft State of the Art report, so real mass and cost are higher). Paid time you cannot fully use = hours without Sun or Earth contact ÷ stay × your mission price (default: NASA CLPS award CP-22, $116.9M). Price source: <a href="${priceNow().url}" target="_blank" rel="noopener">${esc(priceNow().note)}</a>. ${S.data.costLoadGiven ? '' : 'Your power use is not known, so we use 100 W.'}</p>`;
  $('#cPrice').onchange = e => { COST.price = e.target.value; renderCompare(); renderResults(); drawWhen(); };
  $('#cLoad').onchange = e => { COST.loadW = Math.max(1, +e.target.value || 100); renderCompare(); renderResults(); drawWhen(); };
  $('#cMission').onchange = e => { COST.missionUsd = Math.max(1, +e.target.value || 116.9) * 1e6; renderCompare(); };
}

/* ================= mode ================= */
function setMode(m) { S.mode = m; document.body.classList.toggle('simple', m === 'simple'); $$('.mode button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === m)); }
$$('.mode button').forEach(b => b.onclick = () => setMode(b.dataset.mode));

/* ================= loop ================= */
let last = performance.now();
function resize() {
  VW = innerWidth; VH = innerHeight; renderer.setSize(VW, VH, false);
  for (const c of [M.camera, X.camera]) { c.aspect = VW / VH; c.updateProjectionMatrix(); }
  if (S.data && S.screen === 'explore') drawBars(); if (S.when) drawWhen();
}
addEventListener('resize', resize);
const v3 = new THREE.Vector3();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (anim) anim(now);
  renderer.clear();
  if (scene === 'moon') {
    const k = 1 - Math.pow(0.02, dt);
    if (!M.map && !anim) {
      M.tilt += (M.tiltTo - M.tilt) * k; M.dist += (M.distTo - M.dist) * k; M.off += (M.offTo - M.off) * k; M.spin += dt * 0.05;
      M.px = (M.px || 0) + (M.mx * 0.18 - (M.px || 0)) * k; M.py = (M.py || 0) + (M.my * 0.12 - (M.py || 0)) * k;
      M.pivot.rotation.set(M.tilt + M.py, M.px, 0); M.moon.rotation.y = M.spin;
      M.camera.position.set(0, 0, M.dist); M.camera.lookAt(0, 0, 0);
      if (VW > 980) M.camera.setViewOffset(VW, VH, -VW * M.off, S.screen === 'hero' ? -VH * 0.06 : 0, VW, VH); else M.camera.clearViewOffset();
    } else if (M.map || anim) {
      // the options dock covers the lower part of the screen: centre the map in the space above it
      const dockOpen = VW > 980 && S.screen === 'results' && !$('#dock').classList.contains('closed'), wantX = dockOpen ? 210 : 0, wantY = VH * 0.06;
      M.offX = (M.offX ?? 0) + (wantX - (M.offX ?? 0)) * k; M.offY = (M.offY ?? 0) + (wantY - (M.offY ?? 0)) * k; M.camera.setViewOffset(VW, VH, M.offX, M.offY, VW, VH);
    }
    if (M.map && !anim) M.controls.update();
    if (M.cap && Math.abs(M.tint - M.tintTo) > 0.002) { M.tint += (M.tintTo - M.tint) * Math.min(1, dt * 3); setCapTint(M.tint); }
    M.stars.rotation.y = M.spin * 0.2;
    renderer.toneMappingExposure = M.map ? 1.25 : 1.15; renderer.render(M.scene, M.camera);
    const showPins = M.map && S.screen === 'results', dr = $('#dock').getBoundingClientRect(), cardLeft = showPins && VW > 980 && !$('#dock').classList.contains('closed') ? dr.left - 8 : VW, barTop = $('.whenbar').getBoundingClientRect().top - 6;
    for (const m of markers) {
      if (!showPins) { m.el.style.display = 'none'; continue; }
      v3.copy(siteWorld(m.site)).project(M.camera); const px = (v3.x + 1) / 2 * VW, py = (1 - v3.y) / 2 * VH;
      const vis = v3.z < 1 && px > 0 && px < cardLeft && py > 80 && py < barTop && !(px < 680 && py < 290) && (!m.poi || S.showPlaces); m.el.style.display = vis ? '' : 'none'; if (vis) m.el.style.transform = `translate(${px}px, ${py}px)`;
    }
  } else {
    markers.forEach(m => m.el.style.display = 'none');
    if (S.playing && S.data) { const n = series().t.length - 1; S.t += dt * S.speed; if (S.t >= n) { S.t = n; setPlaying(false); } applyTime(); }
    if (S.view === 'fp' && !anim) walkStep(dt); else if (!anim && X.controls.enabled) X.controls.update();
    if (X.site) {
      const st = sample(S.t), cp = X.camera.position, sd = dirFromAzEl(X.site, st.sunAz, st.sunEl), ed = dirFromAzEl(X.site, st.earthAz, st.earthEl);
      X.sunGlow.position.copy(cp).addScaledVector(sd, SKY_D); X.sunGlow.scale.setScalar(SKY_D * Math.tan(rad(0.27)) * 28); X.sunGlow.material.opacity = Math.max(0.15, st.frac);
      X.earth.position.copy(cp).addScaledVector(ed, SKY_D); X.earth.scale.setScalar(SKY_D * Math.tan(rad(0.95))); X.earth.visible = st.earthEl > -1.5;
      X.skySun.target.position.copy(X.earth.position); X.skySun.position.copy(X.earth.position).addScaledVector(sd, 10); // Earth's phase from the real Sun direction
      if (X.ring) { const age = (now - X.ringBorn) / 1000, grow = REDUCED ? 1 : Math.min(1, age / 1.2); X.ring.scale.set(0.2 + 0.8 * ease(grow), 1, 0.2 + 0.8 * ease(grow)); X.glow.scale.copy(X.ring.scale); X.glow.material.opacity = 0.18 + 0.1 * Math.sin(now / 600) + (1 - grow) * 0.5; }
    }
    renderer.toneMappingExposure = 1.3;
    renderer.render(X.sky, X.camera); renderer.clearDepth(); renderer.render(X.scene, X.camera);
  }
  requestAnimationFrame(frame);
}
function setPlaying(p) { S.playing = p; $('#play').textContent = p ? '❚❚' : '▶'; $('#play').setAttribute('aria-label', p ? 'Pause' : 'Play'); }

/* ================= wiring ================= */
document.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b && !b.closest('#panel')) go(b.dataset.go); });
$$('#progress li').forEach(li => li.onclick = () => { if (li.classList.contains('reach')) { if (li.dataset.step === 'explore') openExplore(S.opt); else go(li.dataset.step); } });
$('#back').onclick = () => {
  if (S.screen === 'mission' && S.role !== 'past' && S.role !== 'student' && S.q > 0) { S.q--; renderQuestion(); return; }
  if (S.screen === 'mission' && S.role === 'project' && S.doc && S.q === 0) { S.q = -1; renderMission(); return; }
  if (S.screen === 'mission' && S.role === 'project' && S.doc) { S.doc = null; renderMission(); return; }
  go(ORDER[Math.max(0, ORDER.indexOf(S.screen) - 1)]);
};
$('#openCal').onclick = () => openCalendar();
$('#placesT').onclick = () => { S.showPlaces = !S.showPlaces; $('#placesT').setAttribute('aria-pressed', S.showPlaces); };
$('#closeCal').onclick = () => $('#calendar').classList.remove('open');
const CTX = () => ({ COST, PRICES, priceNow, costDark, battKg, valueLost, lostHours, BATT_WH_PER_KG, MISSIONS, VEXPERT, vx, verdictOf });
$('#pdf').onclick = () => exportPDF(S, CTX());
$('#xlsx').onclick = () => exportXLSX(S, CTX());
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
    [S.index, S.info, S.psr, S.upcoming, S.places] = await Promise.all([getJSON('index.json'), getJSON('terrain/terrain.json'), getJSON('psr.json'), getJSON('upcoming.json').catch(() => null), getJSON('places.json').catch(() => null)]);
    const [r, rs] = await Promise.all([getBuf('terrain/' + S.info.region.file), getBuf('terrain/' + S.info.region_sun.file)]);
    S.region = new Float32Array(r); S.regionSun = new Uint8Array(rs);
    setTimeout(buildCap, 300); // ready before the first flight to the pole
  } catch (e) { $('.hero-text p').textContent = `${e.message}. Open the app from a web server, not as a local file.`; }
})();
