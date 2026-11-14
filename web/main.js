import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { quickCheck, readDocument, dateMetrics } from './quick.js';
import { exportPDF, exportXLSX } from './exports.js';

/* ================= helpers ================= */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const D = 'web-data/';
const R_MOON = 1737400;
const getJSON = p => fetch(D + p).then(r => { if (!r.ok) throw new Error(`Could not load ${p}`); return r.json(); });
const getBuf = p => fetch(D + p).then(r => { if (!r.ok) throw new Error(`Could not load ${p}`); return r.arrayBuffer(); });
const dec16 = (buf, w) => { const q = new Uint16Array(buf), z = new Float32Array(q.length); for (let i = 0; i < q.length; i++) z[i] = w.offset + q[i] * w.scale; return z; };
const TERR = {};
function siteTerrain(sid) { // 10 m NASA terrain, downloaded once and shared by the map and the 3D view
  const w = S.info.web16 && S.info.web16.sites[sid];
  return TERR[sid] || (TERR[sid] = (w ? getBuf('terrain/' + w.file).then(b => dec16(b, w)) : getBuf(`terrain/${sid}_10m.bin`).then(b => new Float32Array(b))).catch(e => { delete TERR[sid]; throw e; }));
}
const idle = f => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 3000 }) : setTimeout(f, 1500));
async function getBufProgress(p, onp) { // download with a progress callback (0..1); safe when the server compresses the file
  const r = await fetch(D + p); if (!r.ok) throw new Error(`Could not load ${p}`);
  const t = S.info && S.info.region, expect = t ? t.shape[0] * t.shape[1] * (p.endsWith('.u16') ? 2 : 4) : 0; // the real size after decompression
  if (!r.body || !expect) return r.arrayBuffer();
  const rd = r.body.getReader(), parts = []; let got = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; onp(Math.min(1, got / expect)); }
  const out = new Uint8Array(got); let o = 0; for (const c of parts) { out.set(c, o); o += c.length; }
  return out.buffer;
}
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
  when: null, whenIdx: null, metric: 'sun', showPlaces: true, lightMode: 'real' };

/* ================= renderer ================= */
const canvas = $('#gl');
// performance: quality drops automatically on slow graphics, and frames are only drawn when something changes
const GQ = { low: /Mobi|Android/i.test(navigator.userAgent) || (navigator.hardwareConcurrency || 8) <= 4, pr: Math.min(devicePixelRatio, 1.5), dirty: true, activeUntil: 0, times: [], sig: '' };
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !GQ.low, powerPreference: 'high-performance' });
renderer.setPixelRatio(GQ.low ? 1 : GQ.pr);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
renderer.autoClear = false;
let VW = innerWidth, VH = innerHeight;
const labels = document.createElement('div'); labels.id = 'labels'; document.body.appendChild(labels);
const texLoader = new THREE.TextureLoader();

/* ================= the Moon: globe + real polar terrain as one object ================= */
const RHO_MAX = 262000; // polar terrain disc radius on the map (m)
const M = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(30, 1, 0.01, 200), spin: 0, tilt: -0.12, tiltTo: -0.12, dist: 3.0, distTo: 3.0, off: 0.2, offTo: 0.2, tint: 0, tintTo: 0, map: false };
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
  M.sun.castShadow = true; M.sun.shadow.mapSize.set(2048, 2048); M.sun.shadow.bias = -0.00002; M.sun.shadow.normalBias = 0.0006;
  Object.assign(M.sun.shadow.camera, { left: -0.17, right: 0.17, top: 0.17, bottom: -0.17, near: 1.5, far: 2.6 }); M.scene.add(M.sun.target);
  M.mx = 0; M.my = 0; addEventListener('pointermove', e => { M.mx = e.clientX / innerWidth - 0.5; M.my = e.clientY / innerHeight - 0.5; });
}
const POSE = { hero: [-0.12, 3.0, 0.2], who: [-0.5, 3.6, 0.25], mission: [-1.0, 3.4, 0.25] };
const regionSunAt = (mx, my) => { // bilinear between the 600 m NASA pixels, so close-ups stay smooth; 255 = outside the NASA map
  const t = S.info.region, n = t.shape[0], fi = (t.half_width_m - my) / t.pixel_m, fj = (mx + t.half_width_m) / t.pixel_m, i = Math.floor(fi), j = Math.floor(fj);
  if (i < 0 || j < 0 || i >= n - 1 || j >= n - 1) return 255;
  const a = S.regionSun[i * n + j], b = S.regionSun[i * n + j + 1], c = S.regionSun[(i + 1) * n + j], d = S.regionSun[(i + 1) * n + j + 1];
  if (a === 255 || b === 255 || c === 255 || d === 255) return Math.min(a, b, c, d) === 255 && Math.max(a, b, c, d) === 255 ? 255 : [a, b, c, d].filter(v => v !== 255)[0];
  const u = fj - j, v = fi - i; return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
};
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
// colours for any polar grid: plain grey (matches the globe) and tinted (NASA average sunlight in gold, dark areas in ice blue)
function tintArrays(map, nv, m, rimFade) {
  const ice = psrMask(map, m), plain = new Float32Array(nv * 3), tint = new Float32Array(nv * 3), tintNoIce = new Float32Array(nv * 3), alpha = new Float32Array(nv).fill(1), base = 0.56;
  for (let k = 0; k < nv; k++) {
    const mx = map[k * 2], my = map[k * 2 + 1]; plain.set([base, base, base * 0.98], k * 3);
    let r = base, gg = base, b = base; const s = regionSunAt(mx, my);
    if (s !== 255) { const edge = Math.min(1, Math.max(0, (151000 - Math.max(Math.abs(mx), Math.abs(my))) / 20000)), f = Math.min(1, Math.max(0, (s - 12) / 30)) * edge * 0.85; r += (1 - r) * f; gg += (0.78 - gg) * f; b += (0.32 - b) * f; }
    const fade = rimFade ? Math.min(1, Math.max(0, (RHO_MAX - Math.hypot(mx, my)) / 25000)) : 1; // blend into the globe at the rim
    tintNoIce.set([base + (r - base) * fade, base + (gg - base) * fade, base * 0.98 + (b - base * 0.98) * fade], k * 3);
    if (ice[k]) { r = r * 0.6 + 0.16; gg = gg * 0.6 + 0.27; b = b * 0.6 + 0.38; }
    tint.set([base + (r - base) * fade, base + (gg - base) * fade, base * 0.98 + (b - base * 0.98) * fade], k * 3);
    if (rimFade) alpha[k] = 0.42 + 0.58 * Math.min(1, Math.max(0, (RHO_MAX - Math.hypot(mx, my)) / 30000)); // rim darkens to match the dimmed globe
  }
  return { plain, tint, tintNoIce, alpha };
}
function applyTint(mesh, f) {
  const g = mesh.geometry, { plain, alpha } = g.userData, tint = S.ice ? g.userData.tint : g.userData.tintNoIce, c = g.attributes.color.array;
  for (let k = 0, n = alpha.length; k < n; k++) { const dim = 1 - (1 - alpha[k]) * f; for (let q = 0; q < 3; q++) c[k * 4 + q] = (plain[k * 3 + q] + (tint[k * 3 + q] - plain[k * 3 + q]) * f) * dim; c[k * 4 + 3] = 1; }
  g.attributes.color.needsUpdate = true;
}
function capIndex(hole) {
  // triangles of the polar terrain inside the disc, minus the cells covered by a detailed site tile
  const { m, map, inside } = M.cap.geometry.userData, idx = [];
  const out = k => !hole || !(Math.abs(map[k * 2] - hole.x) < hole.r && Math.abs(map[k * 2 + 1] - hole.y) < hole.r);
  for (let i = 0; i < m - 1; i++) for (let j = 0; j < m - 1; j++) { const a = i * m + j, b = a + 1, c = a + m, d = c + 1; if (inside[a] && inside[b] && inside[c] && inside[d] && (out(a) || out(b) || out(c) || out(d))) idx.push(a, c, b, b, c, d); }
  M.cap.geometry.setIndex(new THREE.Uint32BufferAttribute(idx, 1));
}
function buildCap() {
  if (M.cap || !S.region) return;
  const t = S.info.region, n = t.shape[0], step = 2, m = Math.floor((n - 1) / step) + 1; // 1.2 km grid; detailed 10 m tiles load near the sites
  const pos = new Float32Array(m * m * 3), map = new Float32Array(m * m * 2), inside = new Uint8Array(m * m);
  for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) {
    const k = i * m + j, mx = -t.half_width_m + j * step * t.pixel_m, my = t.half_width_m - i * step * t.pixel_m;
    const rim = Math.min(1, Math.max(0, (RHO_MAX - Math.hypot(mx, my)) / 30000)), sm = rim * rim * (3 - 2 * rim); // heights ease to the sphere at the rim: no seam
    const [lat, lon] = mapToLatLon(mx, my), h = S.region[(i * step) * n + j * step] * sm;
    const v = globePoint(lat, lon, 1 + h / R_MOON); pos.set([v.x, v.y, v.z], k * 3); map[k * 2] = mx; map[k * 2 + 1] = my;
    inside[k] = Math.hypot(mx, my) <= RHO_MAX;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.userData = { m, map, inside, ...tintArrays(map, m * m, m, true) };
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(m * m * 4), 4));
  M.cap = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })); M.cap.visible = false;
  capIndex(null); g.computeVertexNormals(); applyTint(M.cap, 0);
  M.moon.add(M.cap);
}
function setCapTint(f) {
  applyTint(M.cap, f); if (M.tile) applyTint(M.tile, f);
  M.holed.material.color.setScalar(1 - 0.58 * f); // the rest of the Moon dims while the pole map is open
}
// detailed NASA 10 m terrain on the map when the camera comes close to a site
async function mapTile(sid) {
  if (M.tileSid === sid || M.tileLoading) return; M.tileLoading = true;
  try {
    const site = await siteMeta(sid), z = await siteTerrain(sid), t = S.info.sites, n = t.shape[0], step = GQ.low ? 4 : 2, mm = Math.floor((n - 1) / step) + 1;
    const pos = new Float32Array(mm * mm * 3), map = new Float32Array(mm * mm * 2);
    for (let i = 0; i < mm; i++) for (let j = 0; j < mm; j++) {
      const k = i * mm + j, mx = site.x_m - t.half_width_m + j * step * t.pixel_m, my = site.y_m + t.half_width_m - i * step * t.pixel_m, [lat, lon] = mapToLatLon(mx, my);
      const v = globePoint(lat, lon, 1 + z[(i * step) * n + j * step] / R_MOON); pos.set([v.x, v.y, v.z], k * 3); map[k * 2] = mx; map[k * 2 + 1] = my;
    }
    const idx = []; for (let i = 0; i < mm - 1; i++) for (let j = 0; j < mm - 1; j++) { const a = i * mm + j, b = a + 1, c = a + mm, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(new THREE.Uint32BufferAttribute(idx, 1)); g.computeVertexNormals();
    g.userData = { m: mm, map, ...tintArrays(map, mm * mm, mm, false) }; g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(mm * mm * 4), 4));
    if (M.tile) { M.moon.remove(M.tile); M.tile.geometry.dispose(); }
    M.tile = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    M.tile.castShadow = M.tile.receiveShadow = M.sun.castShadow; applyTint(M.tile, M.tint); M.moon.add(M.tile);
    M.tileSid = sid; capIndex({ x: site.x_m, y: site.y_m, r: t.half_width_m - 600 }); renderer.shadowMap.needsUpdate = true; GQ.dirty = true;
  } finally { M.tileLoading = false; }
}
function checkTile() {
  if (!M.map || !NAV.cur || !S.index || NAV.cur.d > 0.05) return;
  let best = null, bd = 1e9; for (const s of S.index.sites) { const a = siteWorld(s).normalize().angleTo(NAV.cur.t); if (a < bd) { bd = a; best = s; } }
  if (best && bd < 0.02) mapTile(best.id);
}
const siteWorld = s => M.moon.localToWorld(globePoint(s.lat, s.lon, 1 + (regionH(s.x_m, s.y_m) + 150) / R_MOON));


/* ================= map navigation (globe camera, Google Earth style) ================= */
// state is a point on the Moon (t, unit vector in world space), a distance above it, a heading and a tilt.
// The camera tilts toward the horizon by itself as you come closer; right-drag (or Shift-drag) rotates and tilts.
const NAV = { t: new THREE.Vector3(0, 1, 0), d: 1, head: 0, tiltU: 0, cur: null, fly: false, ptrs: new Map() };
const D_MIN = 0.0075, D_MAX = 4.2;
function tangent(up) { const ref = Math.abs(up.z) < 0.95 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0); const e1 = ref.sub(up.clone().multiplyScalar(ref.dot(up))).normalize(); return [e1, up.clone().cross(e1)]; }
const autoTilt = d => rad(18) + rad(54) * Math.min(1, Math.max(0, (Math.log(1.2) - Math.log(d)) / (Math.log(1.2) - Math.log(0.012)))); // more perspective as you come closer
function worldToMap(v) { // world point (map mode, south pole up) -> polar map metres and latitude
  const l = v.clone().normalize(), y = -l.y, z = -l.z, lat = deg(Math.asin(Math.max(-1, Math.min(1, y)))), lon = deg(Math.atan2(z, -l.x)) - 180;
  const rho = 2 * R_MOON * Math.tan(rad(90 + lat) / 2); return [rho * Math.sin(rad(lon)), rho * Math.cos(rad(lon)), lat];
}
function groundAt(v) { const [mx, my] = worldToMap(v); const t = S.info && S.info.region; return t && Math.abs(mx) < t.half_width_m && Math.abs(my) < t.half_width_m && Math.hypot(mx, my) < RHO_MAX ? regionH(mx, my) / R_MOON : 0; }
function navPose(st) {
  const up = st.t.clone().normalize(), [e1, e2] = tangent(up), fwd = e1.clone().multiplyScalar(Math.cos(st.head)).addScaledVector(e2, Math.sin(st.head));
  const surf = up.clone().multiplyScalar(1 + groundAt(up)), tilt = Math.min(rad(82), Math.max(0, autoTilt(st.d) + st.tiltU));
  const pos = surf.clone().addScaledVector(up, st.d * Math.cos(tilt)).addScaledVector(fwd, -st.d * Math.sin(tilt));
  const gr = 1 + groundAt(pos) + 0.0012; if (pos.length() < gr) pos.setLength(gr); // never under the ground
  return { pos, surf, up };
}
function navApply(dt) {
  const c = NAV.cur; if (!c) return;
  const k = 1 - Math.pow(NAV.fly ? 0.12 : 0.0015, dt);
  c.t.lerp(NAV.t, k).normalize(); c.d = Math.exp(Math.log(c.d) + (Math.log(NAV.d) - Math.log(c.d)) * k);
  c.head += (((NAV.head - c.head + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * k; c.tiltU += (NAV.tiltU - c.tiltU) * k;
  if (NAV.fly && c.t.angleTo(NAV.t) < 1e-4 && Math.abs(Math.log(c.d / NAV.d)) < 0.01) NAV.fly = false;
  const p = navPose(c); M.camera.position.copy(p.pos); M.camera.up.copy(p.up); M.camera.lookAt(p.surf);
  const nr = Math.max(2e-5, c.d * 0.02), fr = c.d * 30 + 3; if (Math.abs(M.camera.near / nr - 1) > 0.05) { M.camera.near = nr; M.camera.far = fr; M.camera.updateProjectionMatrix(); }
  checkTile();
  const cmp = $('#compass i'); if (cmp) cmp.style.transform = `rotate(${deg(c.head)}deg)`;
}
function flyTo(v, d, head) { NAV.t.copy(v).normalize(); NAV.d = Math.max(D_MIN, Math.min(D_MAX, d)); if (head != null) NAV.head = head; NAV.fly = true; }
function rayToMoon(cx, cy) {
  const ndc = new THREE.Vector2(cx / VW * 2 - 1, -(cy / VH) * 2 + 1), ray = new THREE.Raycaster(); ray.setFromCamera(ndc, M.camera);
  const o = ray.ray.origin, dir = ray.ray.direction, b = o.dot(dir), cc = o.lengthSq() - 1, disc = b * b - cc;
  return disc < 0 ? null : o.clone().addScaledVector(dir, -b - Math.sqrt(disc));
}
{
  const onMap = e => S.screen === 'results' && M.map && !anim && e.target === canvas;
  canvas.addEventListener('pointerdown', e => { if (!onMap(e)) return; canvas.setPointerCapture(e.pointerId); NAV.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); NAV.btn = e.button; NAV.shift = e.shiftKey || e.ctrlKey; NAV.fly = false; $$('.pop').forEach(p => p.remove()); });
  canvas.addEventListener('pointermove', e => {
    if (!NAV.ptrs.has(e.pointerId) || !NAV.cur) return;
    const prev = NAV.ptrs.get(e.pointerId), dx = e.clientX - prev.x, dy = e.clientY - prev.y; NAV.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (NAV.ptrs.size === 2) { // two fingers: pinch to zoom, twist to rotate
      const [a, b] = [...NAV.ptrs.values()], dist = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
      if (NAV.pinch) { NAV.d = Math.max(D_MIN, Math.min(D_MAX, NAV.d * NAV.pinch.dist / dist)); NAV.head -= ang - NAV.pinch.ang; }
      NAV.pinch = { dist, ang }; return;
    }
    if (NAV.btn === 2 || NAV.shift) { NAV.head -= dx * 0.005; NAV.tiltU = Math.max(-rad(70), Math.min(rad(40), NAV.tiltU + dy * 0.004)); return; }
    // drag the ground under the cursor
    const c = NAV.cur, up = c.t.clone().normalize(), scale = c.d * 2 * Math.tan(rad(M.camera.fov / 2)) / VH * 1.15;
    const right = new THREE.Vector3().setFromMatrixColumn(M.camera.matrixWorld, 0); right.sub(up.clone().multiplyScalar(right.dot(up))).normalize();
    const fwd = up.clone().cross(right).negate();
    NAV.t.addScaledVector(right, -dx * scale).addScaledVector(fwd, dy * scale).normalize(); c.t.copy(NAV.t);
  });
  const end = e => { NAV.ptrs.delete(e.pointerId); if (NAV.ptrs.size < 2) NAV.pinch = null; };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('contextmenu', e => { if (S.screen === 'results') e.preventDefault(); });
  canvas.addEventListener('wheel', e => {
    if (!(S.screen === 'results' && M.map && !anim)) return; e.preventDefault(); NAV.fly = false;
    const f = Math.exp(Math.max(-60, Math.min(60, e.deltaY)) * 0.0022), p = rayToMoon(e.clientX, e.clientY);
    NAV.d = Math.max(D_MIN, Math.min(D_MAX, NAV.d * f));
    if (p && f < 1) NAV.t.lerp(p.normalize(), (1 - f) * 0.9).normalize(); // zoom toward the point under the cursor
  }, { passive: false });
}
// move the map by a step in screen directions (buttons, arrow keys, W A S D); holding keeps moving
function panMap(dx, dy) {
  if (!(S.screen === 'results' && M.map && NAV.cur)) return;
  const c = NAV.cur, up = c.t.clone().normalize(), step = c.d * 0.25;
  const right = new THREE.Vector3().setFromMatrixColumn(M.camera.matrixWorld, 0); right.sub(up.clone().multiplyScalar(right.dot(up))).normalize();
  const fwd = up.clone().cross(right).negate();
  NAV.t.addScaledVector(right, dx * step).addScaledVector(fwd, -dy * step).normalize(); NAV.fly = true; GQ.dirty = true;
}
{
  const P = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  $$('.pad button').forEach(b => { let t = null; const go = () => panMap(...P[b.dataset.p]);
    b.addEventListener('pointerdown', e => { e.preventDefault(); go(); t = setInterval(go, 220); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => { clearInterval(t); t = null; }); });
  const K = { arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1], arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0] };
  addEventListener('keydown', e => {
    if (S.screen !== 'results' || !M.map || e.target.closest('input, select, textarea')) return;
    const k = e.key.toLowerCase();
    if (K[k]) { e.preventDefault(); panMap(K[k][0] * 0.5, K[k][1] * 0.5); }
    else if (k === '+' || k === '=') $('#zoomIn').click(); else if (k === '-') $('#zoomOut').click();
    else if (k === 'q') { NAV.head += 0.15; NAV.fly = true; } else if (k === 'e') { NAV.head -= 0.15; NAV.fly = true; }
  });
}
function mapButtons() {
  $('#zoomIn').onclick = () => { NAV.d = Math.max(D_MIN, NAV.d / 1.8); NAV.fly = true; };
  $('#zoomOut').onclick = () => { NAV.d = Math.min(D_MAX, NAV.d * 1.8); NAV.fly = true; };
  $('#compass').onclick = () => { NAV.head = 0; NAV.fly = true; };
  $('#tiltBtn').onclick = () => { const flat = NAV.tiltU < -rad(30); NAV.tiltU = flat ? 0 : -rad(70); $('#tiltBtn').textContent = flat ? '2D' : '3D'; NAV.fly = true; };
  $('#homeBtn').onclick = () => { const f = mapFrame(); flyTo(f.t, f.d, 0); NAV.tiltU = 0; };
}

/* ================= real sunlight on the map ================= */
// the Sun direction of the chosen landing time (option 1's site, the same within a few degrees across the region)
function mapSunDir() {
  const o = S.data.options[0], s0 = S.sites[o.site];
  let az = o.landing.sun_azimuth_deg, el = o.landing.sun_elevation_deg;
  if (S.whenIdx != null && S.when && S.when[o.site] && S.when[o.site][S.whenIdx]) { const m = S.when[o.site][S.whenIdx]; az = m.sunAz; el = m.sunEl; }
  if (S.lightMode === 'readable') el = 25;
  const dv = dirFromAzEl(s0, az, el); return new THREE.Vector3(-dv.z, dv.y, dv.x); // local site frame -> world (south pole up)
}
function setMapLight(instant) {
  if (!S.data) return;
  const d = mapSunDir(), real = S.lightMode !== 'readable', c = new THREE.Vector3(0, 1, 0);
  M.lightTo = { pos: c.clone().addScaledVector(d, 2), real };
  if (instant) M.sun.position.copy(M.lightTo.pos);
  M.sun.target.position.copy(c); M.sun.castShadow = real; if (M.cap) M.cap.castShadow = M.cap.receiveShadow = real; if (M.tile) M.tile.castShadow = M.tile.receiveShadow = real; GQ.dirty = true;
  M.sun.intensity = real ? 3.6 : 2.6; M.hemiTo = real ? 0.42 : 0.55;
}

/* ================= discover tour ================= */
const TOUR = { i: -1 };
function tourStep(i) {
  const P = (S.places && S.places.places) || []; if (!P.length) return;
  TOUR.i = (i + P.length) % P.length; const p = P[TOUR.i];
  const v = M.moon.localToWorld(globePoint(p.lat, p.lon, 1)); flyTo(v, Math.max(0.012, p.diam_km / 1737.4 * 2.6), NAV.head + 0.5);
  if (!$('#tour').classList.contains('on')) { TOUR.dockWas = !$('#dock').classList.contains('closed'); if (TOUR.dockWas) $('#dockToggle').click(); }
  $('#tour').classList.add('on');
  $('#tour').innerHTML = `<div class="small">Discover the south pole, ${TOUR.i + 1} of ${P.length}</div><b>${esc(p.name)}</b><p>${esc(p.fact)}</p><div class="small">${esc(p.type.split(',')[0])}, ${fmt(p.diam_km)} km across. Named after ${esc(p.namesake)}</div>
    <div class="trow"><button class="btn" id="tPrev">Back</button><button class="btn primary" id="tNext">Next place</button><button class="btn ghost" id="tEnd">End tour</button></div>`;
  $('#tPrev').onclick = () => tourStep(TOUR.i - 1); $('#tNext').onclick = () => tourStep(TOUR.i + 1);
  $('#tEnd').onclick = () => { $('#tour').classList.remove('on'); TOUR.i = -1; const f = mapFrame(); flyTo(f.t, f.d); if (TOUR.dockWas && $('#dock').classList.contains('closed')) $('#dockToggle').click(); };
}

/* ================= Earth as seen from the Moon: which face, which way up ================= */
// Moon position: low-precision series (Meeus, Astronomical Algorithms ch. 47, main terms); checked against JPL DE421:
// sub-lunar point within 0.1 degrees over 2027-2031. Earth's sidereal time from the IAU 1982 GMST formula.
function moonGeo(ms) {
  const jd = ms / 86400000 + 2440587.5, T = (jd - 2451545) / 36525, s = x => Math.sin(rad(x));
  const Lp = 218.3164477 + 481267.88123421 * T, Dd = 297.8501921 + 445267.1114034 * T, Ms = 357.5291092 + 35999.0502909 * T, Mp = 134.9633964 + 477198.8675055 * T, F = 93.2720950 + 483202.0175233 * T;
  const lam = rad(Lp + 6.289 * s(Mp) + 1.274 * s(2 * Dd - Mp) + 0.658 * s(2 * Dd) + 0.214 * s(2 * Mp) - 0.186 * s(Ms) - 0.114 * s(2 * F));
  const bet = rad(5.128 * s(F) + 0.281 * s(Mp + F) + 0.278 * s(Mp - F) + 0.173 * s(2 * Dd - F)), eps = rad(23.4393 - 0.0130 * T);
  const ra = Math.atan2(Math.sin(lam) * Math.cos(eps) - Math.tan(bet) * Math.sin(eps), Math.cos(lam)), dec = Math.asin(Math.sin(bet) * Math.cos(eps) + Math.cos(bet) * Math.sin(eps) * Math.sin(lam));
  const gmst = (280.46061837 + 360.98564736629 * (jd - 2451545)) % 360;
  return { lam, bet, eps, subLat: deg(dec), subLon: ((deg(ra) - gmst) % 360 + 540) % 360 - 180 };
}
function earthQuat(ms, ed) {
  const g = moonGeo(ms), V = (x, y, z) => new THREE.Vector3(x, y, z);
  // ecliptic frame; the local zenith at the lunar south pole is close to the south ecliptic pole (Moon's axis is 1.5 degrees off)
  const dE = V(-Math.cos(g.bet) * Math.cos(g.lam), -Math.cos(g.bet) * Math.sin(g.lam), -Math.sin(g.bet)), u1 = V(0, 0, -1);
  const u2 = dE.clone().sub(u1.clone().multiplyScalar(dE.dot(u1))).normalize(), u3 = u1.clone().cross(u2);
  const w1 = V(0, 1, 0), w2 = ed.clone().sub(w1.clone().multiplyScalar(ed.dot(w1))).normalize(), w3 = w1.clone().cross(w2);
  const toW = v => w1.clone().multiplyScalar(v.dot(u1)).addScaledVector(w2, v.dot(u2)).addScaledVector(w3, v.dot(u3));
  const nW = toW(V(0, Math.sin(g.eps), Math.cos(g.eps))), oW = ed.clone().negate();
  const a1 = globePoint(g.subLat, g.subLon, 1).normalize(), a2 = V(0, 1, 0).sub(a1.clone().multiplyScalar(a1.y)).normalize(), a3 = a1.clone().cross(a2);
  const b1 = oW, b2 = nW.sub(b1.clone().multiplyScalar(nW.dot(b1))).normalize(), b3 = b1.clone().cross(b2);
  const A = new THREE.Matrix4().makeBasis(a1, a2, a3), B = new THREE.Matrix4().makeBasis(b1, b2, b3);
  return new THREE.Quaternion().setFromRotationMatrix(B.multiply(A.transpose()));
}

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
    el.onclick = () => { flyTo(siteWorld(s), 0.022); rank >= 0 ? setTimeout(() => rankPopover(rank, el), 650) : sitePopover(s, el); };
    el.style.display = 'none'; labels.appendChild(el);
    markers.push({ el, site: s, top: rank >= 0 });
  }
}
function placePlaces() {
  for (const p of (S.places && S.places.places) || []) {
    const el = document.createElement('button'); el.className = 'pin poi'; el.innerHTML = `<span class="dia"></span><span class="pl">${esc(p.name)}</span>`;
    el.setAttribute('aria-label', `Place: ${p.name}`); el.style.display = 'none'; labels.appendChild(el);
    el.onclick = () => { flyTo(M.moon.localToWorld(globePoint(p.lat, p.lon, 1)), Math.max(0.012, p.diam_km / 1737.4 * 2.6)); $$('.pop').forEach(x => x.remove()); const pop = document.createElement('div'); pop.className = 'pop';
      pop.innerHTML = `<b>${esc(p.name)}</b><div class="small">${esc(p.type.split(',')[0])}, ${fmt(p.diam_km)} km across. Named after: ${esc(p.namesake)}</div><div>${esc(p.fact)}</div><a class="small" href="${p.source}" target="_blank" rel="noopener">IAU Gazetteer of Planetary Nomenclature</a>`;
      document.body.appendChild(pop); pop.__anchor = el; const r = el.getBoundingClientRect(); pop.style.left = Math.min(innerWidth - 310, r.left) + 'px'; pop.style.top = Math.min(innerHeight - 220, r.bottom + 8) + 'px';
      setTimeout(() => addEventListener('pointerdown', function off(e) { if (!pop.contains(e.target)) { pop.remove(); removeEventListener('pointerdown', off); } }), 0); };
    markers.push({ el, site: { lat: p.lat, lon: p.lon, x_m: p.x_m, y_m: p.y_m }, poi: true });
  }
}
function rankPopover(i, el) {
  $$('.pop').forEach(p => p.remove()); const o = S.data.options[i], pop = document.createElement('div'); pop.className = 'pop';
  pop.innerHTML = `<b>${i + 1}. ${esc(o.site_name)}</b><div class="small">${VSIMPLE[verdictOf(o)]}. Best landing ${dateTime(o.landing_utc)}.</div><button class="btn primary" style="padding:9px 16px">See it in 3D</button>`;
  pop.querySelector('button').onclick = () => { pop.remove(); openExplore(i); };
  document.body.appendChild(pop); pop.__anchor = el; const r = el.getBoundingClientRect(); pop.style.left = Math.min(innerWidth - 310, r.left) + 'px'; pop.style.top = Math.min(innerHeight - 200, r.bottom + 8) + 'px';
  setTimeout(() => addEventListener('pointerdown', function off(e) { if (!pop.contains(e.target)) { pop.remove(); removeEventListener('pointerdown', off); } }), 0);
}
function sitePopover(s, el) {
  $$('.pop').forEach(p => p.remove());
  const w = (S.data.landing_windows || {})[s.id] || [], pop = document.createElement('div'); pop.className = 'pop';
  pop.innerHTML = `<b>${esc(s.name)}</b><div class="small">${w.length ? `Not in your top three. ${w.length} landing window${w.length > 1 ? 's' : ''} for your dates, the first from ${date(w[0].open)}.` : 'No landing time works here for your mission and dates.'}</div><button class="btn" style="padding:9px 16px">See in calendar</button>`;
  pop.querySelector('button').onclick = () => { pop.remove(); openCalendar(s.id); };
  document.body.appendChild(pop); pop.__anchor = el;
  const r = el.getBoundingClientRect(); pop.style.left = Math.min(innerWidth - 310, r.left) + 'px'; pop.style.top = Math.min(innerHeight - 200, r.bottom + 8) + 'px';
  setTimeout(() => addEventListener('pointerdown', function off(e) { if (!pop.contains(e.target)) { pop.remove(); removeEventListener('pointerdown', off); } }), 0);
}

/* ================= site explorer (m) ================= */
const X = { scene: new THREE.Scene(), sky: new THREE.Scene(), camera: new THREE.PerspectiveCamera(55, 1, 0.3, 200000), yaw: 0, pitch: 0, walk: {} };
X.controls = new OrbitControls(X.camera, canvas);
Object.assign(X.controls, { enableDamping: true, dampingFactor: 0.08, minDistance: 15, maxDistance: 60000, maxPolarAngle: rad(88), enableZoom: false, enabled: false });
X.sun = new THREE.DirectionalLight(0xfff3dd, 4.2); X.sun.castShadow = true; X.sun.shadow.mapSize.set(GQ.low ? 1024 : 2048, GQ.low ? 1024 : 2048); X.sun.shadow.bias = -0.0004; X.sun.shadow.normalBias = 1.5;
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
  for (let i = 0; i < m - 1; i++) for (let j = 0; j < m - 1; j++) { const a = i * m + j, b = a + 1, c = a + m, d = c + 1; if (hole) { const inH = q => Math.abs(map[q * 2] - ox) < hole && Math.abs(map[q * 2 + 1] - oy) < hole; if (inH(a) && inH(b) && inH(c) && inH(d)) continue; } idx.push(a, c, b, b, c, d); }
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
  if (X.inner) { X.inner.geometry.dispose(); X.inner = null; }
  for (const k of ['mesh', 'far']) if (X[k]) { X.scene.remove(X[k]); X[k].geometry.dispose(); X[k] = null; }
  const site = await siteMeta(sid), z0 = await siteTerrain(sid);
  const t = S.info.sites, n = t.shape[0], half = t.half_width_m, h0 = z0[((n - 1) / 2) * n + (n - 1) / 2], ox = site.x_m, oy = site.y_m;
  // full 10 m detail in the inner 3 km where you stand and walk, 20 m further out: a quarter of the triangles
  const z = z0.slice(); // the last 600 m of the 10 m terrain blend into the 600 m regional terrain: no step and no square edge
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const e = Math.min(i, j, n - 1 - i, n - 1 - j) * t.pixel_m; if (e < 600) { const w = 1 - e / 600, s = w * w * (3 - 2 * w); z[i * n + j] += (regionH(ox - half + j * t.pixel_m, oy + half - i * t.pixel_m) - z[i * n + j]) * s; } }
  const ih = 1500, ic = (n - 1) / 2, ir = ih / t.pixel_m, inn = 2 * ir + 1, isub = new Float32Array(inn * inn);
  for (let i = 0; i < inn; i++) isub.set(z.subarray((ic - ir + i) * n + ic - ir, (ic - ir + i) * n + ic - ir + inn), i * inn);
  const g = gridGeometry(z, n, t.pixel_m, half, GQ.low ? 4 : 2, { gcx: ox, gcy: oy, ox, oy, h0, hole: ih + 1 }); siteColours(g, 0.74);
  const gi = gridGeometry(isub, inn, t.pixel_m, ih, GQ.low ? 2 : 1, { gcx: ox, gcy: oy, ox, oy, h0 }); siteColours(gi, 0.74);
  X.mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })); X.mesh.castShadow = X.mesh.receiveShadow = true; X.scene.add(X.mesh);
  X.inner = new THREE.Mesh(gi, X.mesh.material); X.inner.castShadow = X.inner.receiveShadow = true; X.mesh.add(X.inner);
  const rt = S.info.region, rn = rt.shape[0], sn = 181, hw = 90, sub = new Float32Array(sn * sn);
  const ci = Math.round((rt.half_width_m - oy) / rt.pixel_m), cj = Math.round((ox + rt.half_width_m) / rt.pixel_m);
  for (let i = 0; i < sn; i++) for (let j = 0; j < sn; j++) sub[i * sn + j] = S.region[Math.max(0, Math.min(rn - 1, ci - hw + i)) * rn + Math.max(0, Math.min(rn - 1, cj - hw + j))];
  const fg = gridGeometry(sub, sn, rt.pixel_m, hw * rt.pixel_m, 1, { gcx: -rt.half_width_m + cj * rt.pixel_m, gcy: rt.half_width_m - ci * rt.pixel_m, ox, oy, h0, hole: half - 600 }); siteColours(fg, 0.74);
  X.far = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 4 })); X.far.receiveShadow = true; X.scene.add(X.far);
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
  if (!X.site) return; GQ.dirty = true;
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
  GQ.dirty = true;
  if (['results', 'explore', 'compare'].includes(name) && !S.data) return;
  const prev = S.screen; S.screen = name; document.body.dataset.screen = name;
  $$('.screen').forEach(s => s.classList.toggle('on', s.id === name));
  $$('.pop').forEach(p => p.remove()); $('#calendar').classList.remove('open');
  const idx = ORDER.indexOf(name);
  $$('#progress li').forEach(li => { const k = ORDER.indexOf(li.dataset.step); li.className = k === idx ? 'now' : k < idx ? 'done reach' : (S.data ? 'reach' : ''); });
  X.controls.enabled = name === 'explore' && S.view !== 'fp';
  if (POSE[name]) { leaveMap(); [M.tiltTo, M.distTo, M.offTo] = POSE[name]; M.ring.material.opacity = name === 'mission' ? 0.9 : 0; }
  if (name === 'results') { if (M.map) backToMap(); else flyToPole(); }
  if (name === 'explore') scene = 'site';
  if (name === 'compare') renderCompare();
  setPlaying(false);
}
function leaveMap() {
  M.camera.near = 0.01; M.camera.far = 200; M.camera.updateProjectionMatrix();
  anim = null; scene = 'moon'; M.map = false; M.full.visible = true; M.holed.visible = false; if (M.cap) M.cap.visible = false; M.tintTo = 0; M.lightTo = null; M.sun.castShadow = false; M.sun.intensity = 3.4;
  M.sun.position.set(-3, 1.4, 2.2); M.hemi.intensity = 0.04; M.camera.up.set(0, 1, 0); $('#tour').classList.remove('on'); TOUR.i = -1; if (S.whenTimer) $('#whenPlay').click();
}
// globe -> south pole map without a cut: the Moon turns its pole up, then the camera descends over the real terrain
function flyToPole() {
  scene = 'moon'; buildCap(); M.full.visible = false; M.holed.visible = true; if (M.cap) M.cap.visible = true;
  const from = { tilt: M.tilt, spin: M.spin % (Math.PI * 2), cam: M.camera.position.clone() }, t0 = performance.now(), dur = REDUCED ? 1 : 1800;
  const high = { t: new THREE.Vector3(0, 1, 0), d: 1.6, head: 0, tiltU: 0 }, hp = navPose(high);
  M.ring.material.opacity = 0; M.offY = 0; M.offX = 0; setMapLight(false);
  const l0 = M.sun.position.clone();
  anim = now => {
    const k = Math.min(1, (now - t0) / dur), e = ease(k);
    M.tilt = M.tiltTo = from.tilt + (-Math.PI - from.tilt) * e; M.pivot.rotation.set(M.tilt, 0, 0);
    M.moon.rotation.y = from.spin * (1 - e); M.spin = M.moon.rotation.y;
    M.camera.position.lerpVectors(from.cam, hp.pos, e); M.camera.up.set(0, 1, 0).lerp(hp.up, e); M.camera.lookAt(new THREE.Vector3().lerpVectors(new THREE.Vector3(), hp.surf, e));
    M.sun.position.lerpVectors(l0, M.lightTo.pos, e); M.hemi.intensity = 0.04 + (M.hemiTo - 0.04) * e;
    if (k > 0.5) M.tintTo = 1;
    if (k >= 1) {
      anim = null; M.map = true; M.pivot.updateMatrixWorld(true);
      NAV.cur = { t: high.t.clone(), d: high.d, head: 0, tiltU: 0 }; const f = mapFrame(); flyTo(f.t, f.d, 0); NAV.tiltU = 0;
      let seen = false; try { seen = localStorage.getItem('lss_maphint') === '1'; localStorage.setItem('lss_maphint', '1'); } catch (e) {}
      if (!seen) { const h = $('#maphint'); h.classList.add('on'); const off = () => { h.classList.remove('on'); removeEventListener('pointerdown', off); removeEventListener('wheel', off); }; addEventListener('pointerdown', off); addEventListener('wheel', off); setTimeout(off, 7000); }
    }
  };
}
function mapFrame() {
  // where to look so the three options fit on screen (the Moon is in its final pose, south pole up)
  const w = S.data.options.map(o => siteWorld(S.index.sites.find(s => s.id === o.site)));
  const c = w.reduce((a, v) => a.add(v), new THREE.Vector3()).multiplyScalar(1 / w.length);
  const spread = Math.max(0.012, ...w.map(v => v.distanceTo(c)));
  return { t: c.normalize(), d: spread * 4.1 + 0.02 };
}
function backToMap() { scene = 'moon'; if (M.saved) { NAV.cur = { t: M.saved.t.clone(), d: M.saved.d * 0.35, head: M.saved.head, tiltU: M.saved.tiltU }; flyTo(M.saved.t, M.saved.d, M.saved.head); NAV.fly = true; } }

/* ================= step 1: who ================= */
$$('#roles .choice').forEach(b => b.onclick = () => {
  S.role = b.dataset.role; $$('#roles .choice').forEach(x => x.setAttribute('aria-pressed', x === b));
  setMode(S.role === 'student' || S.role === 'past' ? 'simple' : 'expert');
  S.q = 0; S.doc = null; S.answers = null; renderMission(); go('mission');
});

/* ================= step 2: mission ================= */
function renderMission() {
  const el = $('#missionBody'); el.closest('.col').classList.remove('wide');
  if (S.role === 'student') {
    el.innerHTML = `<h2>Pick a mission</h2><p class="lead">We show you where it should land on the Moon, and why.</p>
      <div class="choices">${MISSIONS.map(m => `<button class="choice" data-m="${m.id}"><b>${m.name}</b><span>${m.kid}</span></button>`).join('')}</div>`;
    $$('#missionBody [data-m]').forEach(b => b.onclick = () => loadPreset(b.dataset.m, b));
  } else if (S.role === 'past') {
    const U = S.upcoming || { missions: [] };
    const card = (u, i) => `<button class="choice owned" data-u="${i}" title="${esc(u.short || '')}"><b>${esc(u.name)}</b><em>${esc(u.owner || u.agency)}</em><span>${esc(u.short || '')}</span></button>`;
    const grp = g => U.missions.map((u, i) => u.group === g ? card(u, i) : '').join('');
    el.closest('.col').classList.add('wide');
    el.innerHTML = `<h2>Pick a mission</h2><p class="lead">Planned landings at the Moon's south pole, from public sources. Dates often slip.</p>
      <div class="mgrid"><div><h4>Space agencies</h4><div class="choices compact">${grp('agency')}</div></div>
      <div><h4>Companies</h4><div class="choices compact">${grp('company')}</div>
        <h4 class="own">Your mission</h4><div class="choices compact"><button class="choice yours" id="ownMission"><b>No landing-site tool of your own?</b><span>Answer eight short questions. We check every site, hour by hour, from NASA data, and show our sources.</span></button></div></div></div>
      <p class="small xp" style="margin-top:14px">Sources: ${U.missions.map(u => `<a href="${u.source}" target="_blank" rel="noopener">${esc(u.name)}</a>`).join(', ')}. ${esc(U.note || '')}</p>`;
    $('#ownMission').onclick = () => { S.role = 'agency'; S.answers = null; S.q = 0; S.doc = null; setMode('expert'); renderMission(); };
    $$('#missionBody [data-m]').forEach(b => b.onclick = () => loadPreset(b.dataset.m, b));
    $$('#missionBody [data-u]').forEach(b => b.onclick = () => { const u = U.missions[+b.dataset.u];
      if (u.preset) { b.querySelector('span').textContent = 'Loading…'; loadPreset(u.preset); }
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
    const rows = Object.entries(F).filter(([k]) => names[k]).map(([k, f]) => `<div><span>${f.note ? 'Power for payloads' : names[k][0]}</span><span>${f.v == null ? 'Two different values, we will ask you' : esc(names[k][1](f.v))}</span>${f.src ? `<small>${esc(f.src.replace(/^page (\d+): /, 'Page $1: '))}</small>` : ''}</div>`).join('');
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
  idle(() => S.data.options.slice(0, 3).forEach((o, i) => setTimeout(() => siteTerrain(o.site).catch(() => {}), i * 400)));
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
// On a chosen date the full check may be green because the battery need is reported as a requirement.
// When the centre of the site stays dark for more than two days we show it as "with care" and say why: no contradiction on screen.
const dateVerdict = (v, m) => v === 'green' && m && m.longestDark > 48 ? 'yellow' : v;
const darkNote = m => m && m.longestDark > 48 ? `Needs a battery for ${hrs(m.longestDark)} of darkness.` : '';
function renderResults() {
  const o = S.data.options, best = o[0], v = verdictOf(best), common = S.whenIdx != null && S.when;
  const head = { green: `Land at ${best.site_name}.`, yellow: `${best.site_name} is your best option.`, red: 'No site fully meets your needs.' };
  $('#answer').textContent = head[v];
  $('#answerSub').innerHTML = `<span class="sp">${v === 'red' ? 'These are the closest matches. Each card says what goes wrong.' : `Best landing time: ${dateTime(best.landing_utc)}.`}</span><span class="xp">${esc(S.data.trust_badge)}.</span>`;
  const cal = S.data.calendar;
  $('#cards').innerHTML = o.map((x, i) => {
    let vv = verdictOf(x), when = date(x.landing_utc), m = null;
    if (common && S.when[x.site]) { m = S.when[x.site][S.whenIdx]; const row = cal.sites[x.site] && cal.sites[x.site][S.whenIdx]; if (row) vv = dateVerdict(row[2], m); when = date(m.utc); }
    return `<article class="card" style="--c:${VC[vv]}">
      <div class="top"><span class="rank" style="color:${LINE[i]}">${i + 1}</span><div><h3>${esc(x.site_name)}</h3><div class="cwhen">${common ? 'If you land on ' : 'Best: '}${when}</div></div></div>
      <div class="verdict" style="color:${VC[vv]}"><span class="sp">${VSIMPLE[vv]}</span><span class="xp">${vx(vv)}</span></div>
      ${cardFacts(x, m)}
      ${!common && x.reasons && x.reasons.length ? `<p class="why">${esc(x.reasons[0])}</p>` : ''}
      ${common ? `<p class="why">${darkNote(m) && vv === 'yellow' ? darkNote(m) : vv !== 'green' && m && m.sunPct >= 99 && m.contactPct >= 90 ? 'The centre of the site is fine on this date, but part of the landing area fails the checks.' : '<span class="xp">Numbers at the centre of the site; the verdict covers the whole landing area.</span>'}</p>` : ''}
      <button class="btn go3d" data-open="${i}">See it in 3D</button></article>`;
  }).join('');
  $$('[data-open]').forEach(b => b.onclick = () => openExplore(+b.dataset.open));
}
// date slider: metrics for every landing time in the calendar range, at the centre of each option's site
async function loadWhen() {
  const cal = S.data.calendar, first = cal.sites[Object.keys(cal.sites)[0]], dur = Math.round(S.data.options[0].duration_h), mast = !!(S.data.profile && S.data.profile.mast);
  $('#whenSlider').max = $('#cmpSlider').max = first.length - 1;
  S.bestIdx = Math.max(0, first.findIndex(r => r[0].slice(0, 13) === S.data.options[0].landing_utc.slice(0, 13))); $('#whenSlider').value = $('#cmpSlider').value = S.bestIdx; $('#cmpDate').textContent = 'Each site at its best date';
  $('#whenDate').textContent = 'Each site at its best date';
  const W2 = {};
  await Promise.all(S.data.options.map(async o => { W2[o.site] = await dateMetrics(S.index.sites.find(s => s.id === o.site), S.sites[o.site], first[0][0], first[first.length - 1][0], dur, mast, cal.step_hours); }));
  S.when = W2; drawWhen();
}
const metricVal = m => S.metric === 'sun' ? m.sunPct : S.metric === 'earth' ? m.contactPct : costDark(m.longestDark);
function drawWhen() { drawWhenIn($('#whenChart')); drawWhenIn($('#cmpChart')); }
function drawWhenIn(c) {
  if (!S.when || !c || !c.clientWidth) return;
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
function setWhen(i) {
  S.whenIdx = i; $('#whenSlider').value = i; $('#cmpSlider').value = i; const m = S.when && S.when[S.data.options[0].site], t = m && m[i] ? `${dateTime(m[i].utc)}, Sun ${level(m[i].sunEl)}` : '';
  $('#whenDate').textContent = t; $('#cmpDate').textContent = m && m[i] ? `All sites on ${dateTime(m[i].utc)}` : ''; renderResults(); drawWhen(); setMapLight(); if (S.screen === 'compare') renderCompare();
}
function toBest() { if (S.whenTimer) $('#whenPlay').click(); if (S.cmpTimer) $('#cmpPlay').click(); S.whenIdx = null; $('#whenSlider').value = $('#cmpSlider').value = S.bestIdx; $('#whenDate').textContent = $('#cmpDate').textContent = 'Each site at its best date'; renderResults(); drawWhen(); setMapLight(); if (S.screen === 'compare') renderCompare(); }
$('#cmpSlider').oninput = e => setWhen(+e.target.value);
$('#cmpBest').onclick = toBest;
$('#cmpPlay').onclick = () => {
  if (S.cmpTimer) { clearInterval(S.cmpTimer); S.cmpTimer = null; $('#cmpPlay').textContent = '▶'; return; }
  $('#cmpPlay').textContent = '❚❚'; const n = +$('#cmpSlider').max;
  S.cmpTimer = setInterval(() => setWhen(((S.whenIdx ?? S.bestIdx) + 1) % (n + 1)), 260);
};
$$('#cmpMetric button').forEach(b => b.onclick = () => { S.metric = b.dataset.m; $$('#cmpMetric button, #metric button').forEach(x => x.setAttribute('aria-pressed', x.dataset.m === S.metric)); drawWhen(); });
$('#whenSlider').oninput = e => setWhen(+e.target.value);
$('#whenPlay').onclick = () => {
  if (S.whenTimer) { clearInterval(S.whenTimer); S.whenTimer = null; $('#whenPlay').textContent = '▶'; return; }
  $('#whenPlay').textContent = '❚❚'; const n = +$('#whenSlider').max;
  S.whenTimer = setInterval(() => { const i = ((S.whenIdx ?? S.bestIdx) + 1) % (n + 1); setWhen(i); }, 140);
};
$$('#lightMode button').forEach(b => b.onclick = () => { S.lightMode = b.dataset.l; $$('#lightMode button').forEach(x => x.setAttribute('aria-pressed', x === b)); setMapLight(); });
$('#tourBtn').onclick = () => tourStep(TOUR.i < 0 ? 0 : TOUR.i + 1);
mapButtons();
$('#toBest').onclick = toBest;
$$('#metric button').forEach(b => b.onclick = () => { S.metric = b.dataset.m; $$('#cmpMetric button, #metric button').forEach(x => x.setAttribute('aria-pressed', x.dataset.m === S.metric)); drawWhen(); });
$('#dockToggle').onclick = () => { const d = $('#dock'), c = d.classList.toggle('closed'); document.body.classList.toggle('wide', c); $('#dockToggle').textContent = c ? 'Show options' : 'Hide options'; $('#dockToggle').setAttribute('aria-expanded', !c); setTimeout(drawWhen, 480); };

/* ================= step 4: explore ================= */
async function openExplore(i) {
  S.opt = i; S.t = 0; S.hw = 'none'; X.walked = false;
  if (S.screen === 'results' && M.map && !REDUCED && NAV.cur) {
    // enter: the camera dives toward the site, then the 3D site takes over
    M.saved = { t: NAV.cur.t.clone(), d: NAV.cur.d, head: NAV.cur.head, tiltU: NAV.cur.tiltU };
    flyTo(siteWorld(S.index.sites.find(x => x.id === opt().site)), D_MIN); NAV.tiltU = 0.1;
    const t0 = performance.now();
    await new Promise(res => { const tick = () => { const k = (performance.now() - t0) / 1300; $('#fade').style.opacity = k > 0.6 ? Math.min(1, (k - 0.6) * 2.5) : 0; if (k >= 1) res(); else requestAnimationFrame(tick); }; tick(); });
  }
  go('explore');
  $('#optTabs').innerHTML = S.data.options.map((o, k) => `<button data-k="${k}" aria-pressed="${k === i}">${k + 1} ${esc(o.site_name)}</button>`).join('');
  $$('#optTabs button').forEach(b => b.onclick = () => openExplore(+b.dataset.k));
  const L = $('#loading'); L.classList.add('on'); 
  $('#panel').innerHTML = '';
  await buildSite(opt().site);
  for (const k of ['ring', 'glow', 'sunPath', 'earthPath']) if (X[k]) { X.scene.remove(X[k]); X[k].geometry.dispose(); X[k] = null; }
  setRing(opt().ellipse_radius_m || 50); setPaths(); X.ring.visible = X.glow.visible = S.view !== 'fp';
  $('#scrub').max = series().t.length - 1;
  renderPanel(); drawBars(); setView(S.view, true); L.classList.remove('on'); $('#fade').style.opacity = 0; showExHint();
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
function hideExHint() { $('#exhint').classList.remove('on'); }
function showExHint() { let seen = false; try { seen = localStorage.getItem('lss_exhint') === '1'; localStorage.setItem('lss_exhint', '1'); } catch (e) {} if (!seen) { $('#exhint').classList.add('on'); setTimeout(hideExHint, 7000); } }
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
  canvas.addEventListener('pointerdown', e => { if (S.screen === 'explore') hideExHint(); if (S.screen === 'explore' && S.view === 'fp') { drag = { x: e.clientX, y: e.clientY, yaw: X.yaw, pitch: X.pitch }; canvas.setPointerCapture(e.pointerId); if (X.camera.fov < 50) { X.camera.fov = 60; X.camera.updateProjectionMatrix(); } } });
  canvas.addEventListener('pointermove', e => { if (!drag) return; X.yaw = drag.yaw - (e.clientX - drag.x) * 0.25; X.pitch = Math.max(-60, Math.min(70, drag.pitch + (e.clientY - drag.y) * 0.25)); lookFP(); });
  addEventListener('pointerup', () => drag = null);
  // the wheel moves time (scroll through the days); with Shift it zooms
  canvas.addEventListener('wheel', e => {
    if (S.screen !== 'explore' || !S.data || !X.site) return; e.preventDefault();
    hideExHint();
    if (e.shiftKey) { const n = series().t.length - 1; S.t = Math.max(0, Math.min(n, S.t + (e.deltaY || e.deltaX) * 0.02)); applyTime(); return; }
    if (S.view === 'fp') { X.camera.fov = Math.max(8, Math.min(75, X.camera.fov * Math.exp(e.deltaY * 0.001))); X.camera.updateProjectionMatrix(); GQ.dirty = true; return; }
    const d = X.camera.position.clone().sub(X.controls.target), len = Math.max(15, Math.min(60000, d.length() * Math.exp(e.deltaY * 0.0012)));
    X.camera.position.copy(X.controls.target).add(d.setLength(len)); GQ.dirty = true;
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
    <div class="sec"><h4>What you are seeing</h4><p class="small" style="margin:0">Real NASA terrain around the landing spot. The glowing circle is where the lander can touch down. In Fly over, gold dots trace the Sun's path across the sky during your stay and blue dots trace Earth. Drag to turn, scroll to zoom, and use the timeline to move through the days.</p></div>
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
  $('#iceT').onclick = () => { S.ice = !S.ice; [X.mesh, X.inner, X.far].forEach(m => m && setIce(m.geometry)); if (M.cap) setCapTint(M.tint); GQ.dirty = true; renderPanel(); };
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
  const cal = S.data.calendar, common = S.whenIdx != null && S.when, mm = x => common && S.when[x.site] ? S.when[x.site][S.whenIdx] : null;
  const cv = x => { const row = common && cal.sites[x.site] && cal.sites[x.site][S.whenIdx]; return row ? dateVerdict(row[2], mm(x)) : verdictOf(x); };
  const stale = '<i class="stale">at its best date</i>';
  const why = x => { const q = mm(x); if (!q || cv(x) === 'green') return ''; // a short reason when a site fails on the chosen date
    const r = darkNote(q) && q.sunPct >= 50 ? darkNote(q) : q.sunPct < 50 ? 'Dark for most of the stay' : q.longestDark > 24 ? `Dark for up to ${hrs(q.longestDark)}` : q.contactPct < 50 ? 'Earth out of view much of the time' : 'Part of the landing area fails the checks';
    return `<i class="stale">${r}</i>`; };
  const prev = S.cmpPrev || {}; S.cmpPrev = {};
  const o = S.data.options, rr = (x, k) => x.ranges && x.ranges[k] ? x.ranges[k] : null, darkW = x => (rr(x, 'longest_dark_h') || [0, x.light.longest_dark_h])[1];
  const D = (f, g) => x => mm(x) ? g(mm(x), x) : f(x); // date-aware: centre-point values on the chosen date, full analysis otherwise
  const S_ = (f) => x => mm(x) ? `${f(x)} ${stale}` : f(x);
  const rows = [
    ['Landing time', D(x => date(x.landing_utc), m => date(m.utc)), D(x => dateTime(x.landing_utc), m => dateTime(m.utc)), null, null, 'The best time inside your window, or the date you picked above.'],
    ['Verdict', x => `<span class="dotw" style="--c:${VC[cv(x)]}"></span>${VSIMPLE[cv(x)]}${why(x)}`, x => `<span class="dotw" style="--c:${VC[cv(x)]}"></span>${common ? VSIMPLE[cv(x)] : vx(verdictOf(x))}${why(x)}`, null, null, 'All checks together, for the worst point of the landing area.'],
    ['Sunlight', D(x => W.sun(x.light.sun_pct), m => W.sun(m.sunPct)), D(x => range(rr(x, 'sun_pct') || [x.light.sun_pct, x.light.sun_pct], pct), m => pct(m.sunPct)), x => mm(x) ? mm(x).sunPct : (rr(x, 'sun_pct') || [x.light.sun_pct])[0], 'max', 'Solar power: how much of the stay the panels see the Sun.'],
    ['Longest darkness', D(x => W.dark(darkW(x)), m => W.dark(m.longestDark)), D(x => range(rr(x, 'longest_dark_h') || [x.light.longest_dark_h, x.light.longest_dark_h], hrs), m => hrs(m.longestDark)), x => mm(x) ? mm(x).longestDark : darkW(x), 'min', 'Sets the battery size and the cold the lander must survive.'],
    ['Contact with Earth', D(x => W.earth(x.comms.contact_pct), m => W.earth(m.contactPct)), D(x => range(rr(x, 'contact_pct') || [x.comms.contact_pct, x.comms.contact_pct], pct), m => pct(m.contactPct)), x => mm(x) ? mm(x).contactPct : (rr(x, 'contact_pct') || [x.comms.contact_pct])[0], 'max', 'Commands, telemetry and science data need a line of sight to Earth.'],
    ['Longest silence', S_(x => hrs(x.comms.longest_gap_h)), S_(x => hrs(x.comms.longest_gap_h)), x => mm(x) ? null : x.comms.longest_gap_h, 'min', 'Longest time the team cannot reach the lander.'],
    ['Sun at touchdown', D(x => x.landing.sun_elevation_deg >= 0 ? 'Above the horizon' : 'Just below level', m => m.sunEl >= 0 ? 'Above the horizon' : 'Just below level'), D(x => level(x.landing.sun_elevation_deg), m => level(m.sunEl)), x => mm(x) ? mm(x).sunEl : x.landing.sun_elevation_deg, 'max', 'Low Sun means long shadows in the landing area and blinding light for cameras.'],
    ['Earth at touchdown', S_(x => x.landing.earth_visible ? 'In view' : 'Not in view'), S_(x => x.landing.earth_visible ? level(x.landing.earth_elevation_deg) : 'Not visible'), null, null, 'Most landers report to Earth while they land.'],
    ['Cost of darkness', D(x => darkW(x) > 0 ? `at least ${usd(costDark(darkW(x)))}` : 'None', m => m.longestDark > 0 ? `at least ${usd(costDark(m.longestDark))}` : 'None'), D(x => darkW(x) > 0 ? `${usd(costDark(darkW(x)))} (${fmt(battKg(darkW(x)), 1)} kg)` : 'None', m => m.longestDark > 0 ? `${usd(costDark(m.longestDark))} (${fmt(battKg(m.longestDark), 1)} kg)` : 'None'), x => costDark(mm(x) ? mm(x).longestDark : darkW(x)), 'min', 'Extra battery mass to cross the darkness, at a public delivery price.'],
    ['Paid time you cannot fully use', D(x => lostHours(x) ? usd(valueLost(lostHours(x), x.duration_h)) : 'None', (m, x) => m.lostH ? usd(valueLost(m.lostH, x.duration_h)) : 'None'), D(x => lostHours(x) ? `${usd(valueLost(lostHours(x), x.duration_h))} (${hrs(lostHours(x))})` : 'None', (m, x) => m.lostH ? `${usd(valueLost(m.lostH, x.duration_h))} (${hrs(m.lostH)})` : 'None'), x => mm(x) ? mm(x).lostH : lostHours(x), 'min', 'Hours without Sun or without Earth, as a share of the mission price.'],
    ['Battery you need', D(x => x.ranges && x.ranges.battery_needed_wh ? wh(x.ranges.battery_needed_wh[1]) : '–', m => wh(m.longestDark * COST.loadW / DOD)), D(x => range(rr(x, 'battery_needed_wh'), wh), m => `${wh(m.longestDark * COST.loadW / DOD)} for ${watts(COST.loadW)}`), x => mm(x) ? mm(x).longestDark : x.ranges && x.ranges.battery_needed_wh && x.ranges.battery_needed_wh[1], 'min', 'For your stated power use, at 80% usable charge.'],
    ['Data you can send', S_(x => x.comms.data_possible_mb != null ? fmt(x.comms.data_possible_mb / 1000) + ' GB' : '–'), S_(x => x.comms.data_possible_mb != null ? fmt(x.comms.data_possible_mb / 1000) + ' GB' : '–'), x => mm(x) ? null : x.comms.data_possible_mb, 'max', 'Contact hours times your data rate.'],
    ['Ground', x => W.ground(x.terrain) || '–', x => x.terrain ? `${fmt(x.terrain.median_deg, 1)}° typical, ${pct(x.terrain.safe_fraction * 100)} within limit` : '–', x => x.terrain && x.terrain.median_deg, 'min', 'Slope inside the landing circle from NASA 5 m terrain. Rocks smaller than the terrain grid are not seen.'],
    ['Ice nearby', x => x.resources ? `${fmt(x.resources['nearest_over_0.01km2_km'], 1)} km away` : '–', x => x.resources ? `${fmt(x.resources['nearest_over_0.01km2_km'], 1)} km` : '–', x => x.resources && x.resources['nearest_over_0.01km2_km'], 'min', 'Distance to the nearest permanently shadowed area, where water ice can survive.'],
    ['Can land late by', x => x.slip_tolerance_days != null ? `${fmt(x.slip_tolerance_days)} days` : '–', x => x.slip_tolerance_days != null ? `${fmt(x.slip_tolerance_days)} days` : '–', x => x.slip_tolerance_days, 'max', 'How long the launch can slip with the same result.'],
    ['Backup site', x => x.backup_site ? esc(x.backup_site.site_name) : '–', x => x.backup_site ? `${esc(x.backup_site.site_name)}, ${date(x.backup_site.landing_utc)}` : '–', null, null, 'Where to go if the first choice is lost.'],
  ];
  let html = '<div class="rh ch"></div>' + o.map((x, i) => `<button class="ch" data-x="${i}" style="--c:${VC[cv(x)]}" title="See ${esc(x.site_name)} in 3D"><div class="rank" style="color:${LINE[i]}">${i + 1}</div><h3>${esc(x.site_name)}</h3><span class="go3d">See it in 3D</span></button>`).join('');
  for (const [name, fs, fx, key, best, why] of rows) {
    const vals = key ? o.map(key) : [], ok = vals.filter(v => v != null && isFinite(v));
    if (key && !ok.length && !common) continue;
    const target = ok.length > 1 && !ok.every(v => Math.abs(v - ok[0]) < 1e-9) ? (best === 'max' ? Math.max(...ok) : Math.min(...ok)) : null;
    html += `<div class="rh">${name}${why ? `<em>${why}</em>` : ''}</div>` + o.map((x, i) => { const v = fx(x), k = name + i, ch = prev[k] != null && prev[k] !== v; S.cmpPrev[k] = v; return `<div class="${target != null && vals[i] === target ? 'best' : ''}${ch ? ' changed' : ''}"><span class="sp">${fs(x)}</span><span class="xp">${v}</span></div>`; }).join('');
  }
  $('#cmp').innerHTML = html; $$('#cmp [data-x]').forEach(b => b.onclick = () => openExplore(+b.dataset.x));
  $('#cmpNote').textContent = common ? 'Centre-point values on this date for every site. Rows marked "at its best date" need the full analysis and keep their best-date value.' : 'Move the date: sunlight, contact, darkness and cost change for every site. Click a site name to see it in 3D.'; drawWhen();
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
  GQ.dirty = true; VW = innerWidth; VH = innerHeight; renderer.setSize(VW, VH, false);
  for (const c of [M.camera, X.camera]) { c.aspect = VW / VH; c.updateProjectionMatrix(); }
  if (S.data && S.screen === 'explore') drawBars(); if (S.when) drawWhen();
}
addEventListener('resize', resize);
const v3 = new THREE.Vector3();
function setLow() {
  if (GQ.low) return; GQ.low = true; renderer.setPixelRatio(1);
  for (const L of [M.sun, X.sun]) { L.shadow.mapSize.set(1024, 1024); if (L.shadow.map) { L.shadow.map.dispose(); L.shadow.map = null; } }
  renderer.shadowMap.needsUpdate = true; GQ.dirty = true;
}
for (const ev of ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchmove']) addEventListener(ev, () => { GQ.activeUntil = performance.now() + 1200; }, { passive: true });
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); $('#gpuNote').classList.add('on'); });
canvas.addEventListener('webglcontextrestored', () => { $('#gpuNote').classList.remove('on'); setLow(); GQ.dirty = true; });
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  // adapt: if frames are slow while drawing, switch to light graphics (fewer pixels, smaller shadow maps)
  if (GQ.drew && GQ.drewBefore) { GQ.times.push(dt); if (GQ.times.length > 90) GQ.times.shift(); if (!GQ.low && GQ.times.length === 90 && GQ.times.slice().sort((x, y) => x - y)[45] > 0.045) setLow(); }
  GQ.drewBefore = GQ.drew;
  const cam = scene === 'moon' ? M.camera : X.camera, sig = cam.matrixWorld.elements.join(',') + cam.projectionMatrix.elements[0];
  const heroSpin = scene === 'moon' && !M.map && !anim, lerping = (M.cap && Math.abs(M.tint - M.tintTo) > 0.002) || (M.map && M.lightTo && M.sun.position.distanceTo(M.lightTo.pos) > 1e-4);
  const navMoving = M.map && NAV.cur && (NAV.cur.t.angleTo(NAV.t) > 1e-6 || Math.abs(Math.log(NAV.cur.d / NAV.d)) > 1e-4 || Math.abs(((NAV.head - NAV.cur.head + Math.PI * 3) % (Math.PI * 2)) - Math.PI) > 1e-5 || Math.abs(NAV.cur.tiltU - NAV.tiltU) > 1e-5);
  const busy = anim || S.playing || GQ.dirty || now < GQ.activeUntil || lerping || navMoving || (heroSpin && !(GQ.skip = !GQ.skip)) || (X.ring && now - X.ringBorn < 1600) || sig !== GQ.sig;
  GQ.drew = !!busy;
  if (!busy) { requestAnimationFrame(frame); return; }
  GQ.dirty = false;
  if (anim) anim(now);
  renderer.clear();
  if (scene === 'moon') {
    const k = 1 - Math.pow(0.12, dt);
    if (!M.map && !anim) {
      M.tilt += (M.tiltTo - M.tilt) * k; M.dist += (M.distTo - M.dist) * k; M.off += (M.offTo - M.off) * k; M.spin += dt * 0.012;
      const kp = 1 - Math.pow(0.25, dt); M.px = (M.px || 0) + (M.mx * 0.05 - (M.px || 0)) * kp; M.py = (M.py || 0) + (M.my * 0.035 - (M.py || 0)) * kp;
      M.pivot.rotation.set(M.tilt + M.py, M.px, 0); M.moon.rotation.y = M.spin;
      M.camera.position.set(0, 0, M.dist); M.camera.lookAt(0, 0, 0);
      if (VW > 980) M.camera.setViewOffset(VW, VH, -VW * M.off, S.screen === 'hero' ? -VH * 0.06 : 0, VW, VH); else M.camera.clearViewOffset();
    } else if (M.map || anim) {
      // the options dock covers the lower part of the screen: centre the map in the space above it
      const dockOpen = VW > 980 && S.screen === 'results' && !$('#dock').classList.contains('closed'), wantX = dockOpen ? 210 : 0, wantY = S.screen === 'results' && VW > 980 ? VH / 2 - (($('.res-tools').getBoundingClientRect().bottom || 210) + ($('.map-key').getBoundingClientRect().top || VH - 130)) / 2 : VH * 0.06; // centre the map in the free space between the headline and the legend
      M.offX = (M.offX ?? 0) + (wantX - (M.offX ?? 0)) * k; M.offY = (M.offY ?? 0) + (wantY - (M.offY ?? 0)) * k; M.camera.setViewOffset(VW, VH, M.offX, M.offY, VW, VH);
    }
    if (M.map && !anim) { navApply(dt); if (M.lightTo) { M.sun.position.lerp(M.lightTo.pos, 1 - Math.pow(0.02, dt)); M.hemi.intensity += (M.hemiTo - M.hemi.intensity) * (1 - Math.pow(0.02, dt)); } }
    if (M.cap && Math.abs(M.tint - M.tintTo) > 0.002) { M.tint += (M.tintTo - M.tint) * Math.min(1, dt * 3); setCapTint(M.tint); }
    M.stars.rotation.y = M.spin * 0.2;
    if (M.map && M.sun.castShadow && (lerping || NAV.fly)) renderer.shadowMap.needsUpdate = true;
    renderer.toneMappingExposure = M.map ? 1.25 : 1.15; renderer.render(M.scene, M.camera); GQ.sig = M.camera.matrixWorld.elements.join(',') + M.camera.projectionMatrix.elements[0];
    const showPins = M.map && S.screen === 'results', dr = $('#dock').getBoundingClientRect(), cardLeft = showPins && VW > 980 && !$('#dock').classList.contains('closed') ? dr.left - 8 : VW, barTop = $('.whenbar').getBoundingClientRect().top - 6;
    const boxes = showPins ? ['.map-key', '.navctl', '.res-head h2', '.res-head .lead', '.res-tools', '.tour.on', '#dockToggle'].map(s => document.querySelector(s)).filter(Boolean).map(e => { const r = e.getBoundingClientRect(); return [r.left - 6, r.top - 6, r.right + 6, r.bottom + 6]; }).filter(b => b[2] > b[0]) : [];
    for (const m of markers.slice().sort((a, b) => (a.top ? 0 : a.poi ? 2 : 1) - (b.top ? 0 : b.poi ? 2 : 1))) {
      if (!showPins) { m.el.style.display = 'none'; continue; }
      v3.copy(siteWorld(m.site)).project(M.camera); const px = (v3.x + 1) / 2 * VW, py = (1 - v3.y) / 2 * VH; m.el.__raw = [Math.round(px), Math.round(py)];
      let vis = v3.z < 1 && px > 0 && px < cardLeft && py > 80 && py < barTop - 40 && (!m.poi || S.showPlaces);
      let side = 'r';
      if (vis) { // labels never overlap: a recommended site tries its label on the right, then on the left, then shows its number alone; others step aside
        const w = (m.w ||= m.el.textContent.length * (m.top ? 9.5 : 7.4) + 30), hit = bx => bx[2] > cardLeft || boxes.some(b => bx[0] < b[2] && bx[2] > b[0] && bx[1] < b[3] && bx[3] > b[1]);
        const tries = m.top ? [['r', [px - 16, py - 15, px + w, py + 15]], ['l', [px - w, py - 15, px + 16, py + 15]], ['n', [px - 16, py - 15, px + 16, py + 15]]] : [['r', [px - 16, py - 15, px + w, py + 15]]];
        const ok = tries.find(([, bx]) => !hit(bx));
        if (ok) { side = ok[0]; boxes.push(ok[1]); } else if (m.top) { side = 'n'; boxes.push(tries[2][1]); } else vis = false;
      }
      m.el.style.display = vis ? '' : 'none';
      if (vis) { m.el.classList.toggle('flip', side === 'l'); m.el.classList.toggle('bare', side === 'n'); m.el.style.transform = `translate(${px}px, ${py}px)${side === 'l' ? ' translateX(-100%)' : ''}`; } m.el.__p = vis ? [px, py] : null;
    }
    const pop = document.querySelector('.pop'); // the open card follows its pin while the map moves
    if (pop && pop.__anchor) { const q = pop.__anchor.__p; pop.style.visibility = q ? '' : 'hidden'; if (q) { pop.style.left = Math.max(8, Math.min(cardLeft - 310, q[0] - 14)) + 'px'; pop.style.top = Math.max(84, Math.min(barTop - pop.offsetHeight - 8, q[1] + 22)) + 'px'; } }
  } else {
    markers.forEach(m => m.el.style.display = 'none');
    if (S.playing && S.data) { const n = series().t.length - 1; S.t += dt * S.speed; if (S.t >= n) { S.t = n; setPlaying(false); } applyTime(); }
    if (S.view === 'fp' && !anim) walkStep(dt); else if (!anim && X.controls.enabled) X.controls.update();
    if (X.site) {
      const st = sample(S.t), cp = X.camera.position, sd = dirFromAzEl(X.site, st.sunAz, st.sunEl), ed = dirFromAzEl(X.site, st.earthAz, st.earthEl);
      X.sunGlow.position.copy(cp).addScaledVector(sd, SKY_D); X.sunGlow.scale.setScalar(SKY_D * Math.tan(rad(0.27)) * 28); X.sunGlow.material.opacity = Math.max(0.15, st.frac);
      X.earth.position.copy(cp).addScaledVector(ed, SKY_D); X.earth.scale.setScalar(SKY_D * Math.tan(rad(0.95))); X.earth.visible = st.earthEl > -1.5;
      X.earth.quaternion.copy(earthQuat(toDate(series().t[0]).getTime() + S.t * 3600e3, ed)); // the face of Earth turned toward the Moon at this hour
      X.skySun.target.position.copy(X.earth.position); X.skySun.position.copy(X.earth.position).addScaledVector(sd, 10); // Earth's phase from the real Sun direction
      if (X.ring) { const age = (now - X.ringBorn) / 1000, grow = REDUCED ? 1 : Math.min(1, age / 1.2); X.ring.scale.set(0.2 + 0.8 * ease(grow), 1, 0.2 + 0.8 * ease(grow)); X.glow.scale.copy(X.ring.scale); X.glow.material.opacity = 0.22 + (1 - grow) * 0.5; }
    }
    renderer.toneMappingExposure = 1.3;
    renderer.render(X.sky, X.camera); renderer.clearDepth(); renderer.render(X.scene, X.camera); GQ.sig = X.camera.matrixWorld.elements.join(',') + X.camera.projectionMatrix.elements[0];
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

async function openHow() {
  const v = S.validation || (S.validation = await getJSON('validation_report.json').catch(() => null)), el = $('#how');
  const A = v && v.A_horizons, C = v && v.C_published && v.C_published[0], T = v && v.D_unit_tests && v.D_unit_tests.tests;
  el.querySelector('.how-body').innerHTML = `
    <section><h3>What we calculate</h3><p>For every hour from November 2026 to the end of 2032, at 11 candidate sites near the south pole: whether more than half of the Sun is above the real horizon, whether Earth is above the horizon while a NASA Deep Space Network dish can see the Moon, and from that the hours of sunlight, the longest darkness, the contact with Earth, the battery and solar array a mission needs, the slope of the landing area and the distance to permanently shadowed areas that can hold ice.</p></section>
    <section><h3>The data</h3><ul><li>Terrain: NASA LOLA digital elevation models, 5 m at the sites, 10 m and 80 m around them, out to 300 km for the horizon.</li><li>Sun and Earth positions: JPL DE421 planetary ephemeris and the Moon's orientation, through Skyfield.</li><li>Ground stations: the three NASA Deep Space Network complexes.</li><li>Ice: NASA LOLA catalogue of permanently shadowed regions. Average sunlight shading on the map: NASA LOLA illumination map.</li><li>Place names: IAU Gazetteer of Planetary Nomenclature.</li></ul></section>
    <section><h3>How accurate it is</h3><div class="how-nums">
      <div><b>${A ? A.max_el_err_deg.toExponential(1) + '°' : '–'}</b><span>largest difference from NASA JPL Horizons for Sun and Earth positions, over ${A ? A.comparisons : '–'} checks</span></div>
      <div><b>${C ? C.ours_illumination + '%' : '–'}</b><span>sunlight we compute at the Connecting ridge; the ESA lander study reports 85.7% for the same point</span></div>
      <div><b>±8</b><span>percentage points: agreement with NASA's own sunlight maps on the same 80 m terrain, with no systematic bias</span></div>
      <div><b>${T ? Object.values(T).filter(Boolean).length + ' of ' + Object.keys(T).length : '–'}</b><span>automatic tests of the geometry, power and battery models pass</span></div></div>
      <p>On the sharper 5 m terrain our sunlight is lower than NASA's maps, because small hills block the grazing Sun. We keep the sharper terrain: it errs on the safe side.</p></section>
    <section><h3>How we handle what we do not know</h3><p>Every verdict holds for the worst point of the landing area, for every lander orientation when yours is unknown, and on six NASA versions of the terrain. When you do not give a value, we do not guess it: we tell you what you would need. Costs are scenarios built only from public prices, with their sources.</p></section>
    <section><h3>What we do not check</h3><p>Rocks smaller than the terrain grid, the approach trajectory, a full thermal model and other landers nearby. A mission team should confirm the chosen spot with 1 m imagery hazard maps.</p></section>`;
  el.classList.add('on');
}
$('#helpBtn').onclick = () => { const h = $('#maphint'); h.classList.add('on'); setTimeout(() => h.classList.remove('on'), 5000); };
$('#howBtn').onclick = openHow; $('#howClose').onclick = () => $('#how').classList.remove('on');
window.__lss = { M, NAV, GQ, X }; // for automated checks
if (/[?&]debug/.test(location.search)) { // diagnostics for testing on other computers: add ?debug to the address
  const el = $('#dbg'); el.hidden = false; let frames = 0, lastEv = '-', gpu = '?';
  try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch (e) {}
  for (const ev of ['pointerdown', 'pointermove', 'wheel', 'keydown']) addEventListener(ev, e => { const t = e.target; lastEv = `${ev} on ${t.tagName.toLowerCase()}${t.id ? '#' + t.id : ''}${t.className && typeof t.className === 'string' ? '.' + t.className.split(' ')[0] : ''}`; }, { capture: true, passive: true });
  const r0 = renderer.render.bind(renderer); renderer.render = (...a) => { frames++; return r0(...a); };
  setInterval(() => { el.textContent = `GPU: ${gpu}\nframes/s: ${frames * 2}  light graphics: ${GQ.low}  pixel ratio: ${renderer.getPixelRatio()}\nscreen: ${S.screen}  map: ${!!M.map}  animating: ${!!anim}  zoom: ${NAV.cur ? NAV.cur.d.toFixed(4) : '-'}\nlast input: ${lastEv}`; frames = 0; }, 500);
}
(async function init() {
  setMode('simple'); resize(); requestAnimationFrame(frame);
  $$('.screen').forEach(s => s.classList.toggle('on', s.id === 'hero'));
  try {
    [S.index, S.info, S.psr, S.upcoming, S.places] = await Promise.all([getJSON('index.json'), getJSON('terrain/terrain.json'), getJSON('psr.json'), getJSON('upcoming.json').catch(() => null), getJSON('places.json').catch(() => null)]);
    const lp = $('#loadBar'); lp.classList.add('on');
    const w16 = S.info.web16 && S.info.web16.region;
    const [r, rs] = await Promise.all([getBufProgress('terrain/' + (w16 ? w16.file : S.info.region.file), f => { lp.querySelector('i').style.width = Math.round(f * 100) + '%'; }), getBuf('terrain/' + S.info.region_sun.file)]);
    lp.classList.remove('on');
    S.region = w16 ? dec16(r, w16) : new Float32Array(r); S.regionSun = new Uint8Array(rs);
    setTimeout(buildCap, 300); // ready before the first flight to the pole
  } catch (e) { $('.hero-text p').textContent = `${e.message}. Open the app from a web server, not as a local file.`; }
})();
