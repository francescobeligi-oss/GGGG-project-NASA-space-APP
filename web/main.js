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
const SITEZ = {};
function siteTerrain(sid) { // 10 m NASA terrain, downloaded once and shared by the map and the 3D view
  const w = S.info.web16 && S.info.web16.sites[sid];
  return SITEZ[sid] || (SITEZ[sid] = (w ? getBuf('terrain/' + w.file).then(b => dec16(b, w)) : getBuf(`terrain/${sid}_10m.bin`).then(b => new Float32Array(b))).catch(e => { delete SITEZ[sid]; throw e; }));
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
const VEXPERT = { green: 'Go', yellow: 'Go with caveats', red: 'No go' };
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
  when: null, whenIdx: null, metric: 'sun', showPlaces: true, lightMode: 'photo', layers: { sun: true, ice: true } };

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
  const ready = () => document.body.classList.add('moon-ready'); setTimeout(ready, 5000); // the Moon fades in once its image is there: never a black ball
  const tex = texLoader.load('assets/moon_2k.jpg', () => { GQ.dirty = true; requestAnimationFrame(() => requestAnimationFrame(ready)); }); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
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
// ---------- terrain look: NASA LRO camera mosaic (LROC WAC, 100 m) draped on NASA LOLA heights ----------
// one material for the whole polar terrain: the photo, softened when the real sunlight of the chosen date is shown,
// times the vertex colours (gold = often sunlit, blue = permanently dark), times the light.
const TERR = { photo: null, u: { uTint: { value: 0 }, uPhoto: { value: 1 }, uDetail: { value: null }, uLS: { value: 0 }, uRim: { value: 0 }, uRimW: { value: 70000 }, uGlobe: { value: M.full.material.map }, uGlobeMix: { value: 0 } }, ux: { uTint: { value: 1 }, uPhoto: { value: 0.55 }, uLS: { value: 0.7 }, uIce: { value: 0 } } };
function terrainMaterial(extra = {}, U = TERR.u, local = false, rim = false) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, map: TERR.photo, ...extra });
  const iceGlow = U === TERR.ux;
  mat.customProgramCacheKey = () => (local ? 'terr-local' : 'terr') + (rim ? '-rim' : '') + (iceGlow ? '-ice' : '');
  mat.onBeforeCompile = sh => { sh.uniforms.uPhoto = U.uPhoto; sh.uniforms.uDetail = TERR.u.uDetail; sh.uniforms.uTint = U.uTint || TERR.u.uTint;
    // vertex colours fade in through a uniform: the colours are uploaded once, the fade costs nothing per frame
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#if defined( USE_COLOR_ALPHA )\n diffuseColor *= mix( vec4( 1.0 ), vColor, uTint );\n#elif defined( USE_COLOR )\n diffuseColor.rgb *= mix( vec3( 1.0 ), vColor, uTint );\n#endif').replace('void main() {', 'uniform float uTint;\nvoid main() {');
    if (local) { // close to the ground: two more grain sizes, measured in metres on the site so they stay sharp
      sh.vertexShader = sh.vertexShader.replace('void main() {', 'varying vec2 vLoc;\nvoid main() {').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLoc = position.xz;');
    }
    // Moon soil reflects light like the real regolith (lunar-Lambert: Lommel-Seeliger blended with Lambert), so sunlit ground stays bright under a low Sun
    sh.uniforms.uLS = U.uLS || TERR.u.uLS;
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_physical_pars_fragment>', 'uniform float uLS;\n' + THREE.ShaderChunk.lights_physical_pars_fragment.replace('\tvec3 irradiance = dotNL * directLight.color;\n\t#ifdef USE_CLEARCOAT', '\tfloat dotNVls = saturate( dot( geometryNormal, geometryViewDir ) ), phs = acos( clamp( dot( directLight.direction, geometryViewDir ), -1.0, 1.0 ) );\n\tvec3 irradiance = mix( dotNL, ( 2.0 * dotNL / ( dotNL + max( dotNVls, 0.25 ) ) ) * ( 0.3 + 0.7 * exp( -phs / 1.1 ) ) * 1.7, uLS ) * directLight.color;\n\t#ifdef USE_CLEARCOAT'));
    // the photo, plus fine regolith texture at two scales (it fades out by itself in the distance through mipmaps)
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#ifdef USE_MAP
      vec4 sampledDiffuseColor = texture2D( map, vMapUv ); sampledDiffuseColor.rgb = mix( vec3( 0.42 ), sampledDiffuseColor.rgb, uPhoto ) * 1.25;
      float d1 = texture2D( uDetail, vMapUv * 1200.0 ).r, d2 = texture2D( uDetail, vMapUv * 9000.0 ).r;
      sampledDiffuseColor.rgb *= ( 0.7 + 0.6 * d1 ) * ( 0.8 + 0.4 * d2 ); diffuseColor *= sampledDiffuseColor;
      #endif`).replace('void main() {', 'uniform float uPhoto;\nuniform sampler2D uDetail;\nvoid main() {');
    if (rim) { sh.uniforms.uRim = TERR.u.uRim; // the rim of the polar map darkens as much as the rest of the Moon around it
      sh.vertexShader = sh.vertexShader.replace('void main() {', 'attribute float rim;\nvarying float vRim;\nvoid main() {').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRim = rim;');
      sh.uniforms.uRimW = TERR.u.uRimW; // fade width in metres: narrow on the map, wide in the opening story (a soft spotlight, no visible disc)
      sh.uniforms.uGlobe = TERR.u.uGlobe; sh.uniforms.uGlobeMix = TERR.u.uGlobeMix; // the map's edge (and, from far away, all of it) shows the same global Moon image as the globe: no seam, no pop
      sh.fragmentShader = sh.fragmentShader.replace('diffuseColor *= sampledDiffuseColor;', 'vec2 gM = ( vMapUv - 0.5 ) * 540000.0; float gR = length( gM ), gLat = -1.5707963 + 2.0 * atan( gR / 3474800.0 ), gLon = atan( gM.x, gM.y ); vec3 gC = texture2D( uGlobe, vec2( ( gLon + 3.14159265 ) / 6.2831853, ( gLat + 1.5707963 ) / 3.14159265 ), -1.0 ).rgb; sampledDiffuseColor.rgb = mix( sampledDiffuseColor.rgb, gC, max( uGlobeMix, smoothstep( 165000.0, 258000.0, gR ) ) ); diffuseColor *= sampledDiffuseColor;').replace('void main() {', 'uniform sampler2D uGlobe;\nuniform float uGlobeMix;\nvoid main() {');
      sh.fragmentShader = sh.fragmentShader.replace('diffuseColor *= sampledDiffuseColor;', 'float rimQ = clamp( ( 262000.0 - length( vMapUv - 0.5 ) * 540000.0 ) / uRimW, 0.0, 1.0 ); rimQ = rimQ * rimQ * ( 3.0 - 2.0 * rimQ ); sampledDiffuseColor.rgb *= mix( 1.0, 0.26 + 0.74 * rimQ, uRim ); diffuseColor *= sampledDiffuseColor;').replace('void main() {', 'uniform float uRim;\nuniform float uRimW;\nvarying float vRim;\nvoid main() {'); }
    if (iceGlow) { sh.uniforms.uIce = TERR.ux.uIce; // ice-bearing ground glows blue on request: it is in permanent shadow, so a tint alone would stay black
      sh.vertexShader = sh.vertexShader.replace('void main() {', 'attribute float ice;\nvarying float vIce;\nvoid main() {').replace('#include <begin_vertex>', '#include <begin_vertex>\nvIce = ice;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3( 0.12, 0.45, 1.0 ) * vIce * uIce * 0.4;').replace('void main() {', 'uniform float uIce;\nvarying float vIce;\nvoid main() {'); }
    if (local) sh.fragmentShader = sh.fragmentShader.replace('diffuseColor *= sampledDiffuseColor;', 'sampledDiffuseColor.rgb *= ( 0.72 + 0.56 * texture2D( uDetail, vLoc / 23.0 ).r ) * ( 0.84 + 0.32 * texture2D( uDetail, vLoc / 3.1 ).r ); diffuseColor *= sampledDiffuseColor;').replace('void main() {', 'varying vec2 vLoc;\nvoid main() {'); };
  return mat;
}
// compile the map's shaders and upload its textures while nothing moves, so the first flight to the pole does not stutter
function prewarm() {
  if (!M.cap) return;
  const vis = [M.cap.visible, M.holed.visible, M.full.visible]; M.cap.visible = M.holed.visible = M.full.visible = true;
  try { renderer.compile(M.scene, M.camera); } catch (e) {}
  // the map is drawn with shadows on: compile that variant too, so switching to it costs nothing later
  const sh = [M.sun.castShadow, M.cap.castShadow, M.cap.receiveShadow]; M.sun.castShadow = M.cap.castShadow = M.cap.receiveShadow = true;
  try { renderer.compile(M.scene, M.camera); } catch (e) {}
  [M.sun.castShadow, M.cap.castShadow, M.cap.receiveShadow] = sh;
  M.cap.visible = vis[0]; M.holed.visible = vis[1]; M.full.visible = vis[2];
  for (const t of [TERR.photo, TERR.u.uDetail.value, TERR.u.uGlobe.value]) if (t && t.isTexture) try { renderer.initTexture(t); } catch (e) {}
  // one draw into a tiny target uploads the map's vertex buffers now, not on the first frame of the flight
  try { const rt = new THREE.WebGLRenderTarget(4, 4), fc = M.cap.frustumCulled; M.cap.visible = true; M.cap.frustumCulled = false; renderer.setRenderTarget(rt); renderer.render(M.scene, M.camera); renderer.setRenderTarget(null); rt.dispose(); M.cap.frustumCulled = fc; M.cap.visible = vis[0]; } catch (e) { renderer.setRenderTarget(null); }
}
function loadPhoto() {
  texLoader.load(D + 'imagery/regolith_512.jpg', t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); try { renderer.initTexture(t); } catch (e) {} TERR.u.uDetail.value = t; GQ.dirty = true; });
  const load = (f, then) => texLoader.load(D + 'imagery/' + f, t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); t.generateMipmaps = true; then(t); });
  load('wac_south_2048.jpg', t => { try { renderer.initTexture(t); } catch (e) {} TERR.photo = t; for (const ms of [M.cap, M.mid, M.tile, X.mesh, X.inner, X.far]) if (ms) { ms.material.map = t; ms.material.needsUpdate = true; } GQ.dirty = true;
    if (!GQ.low) idle(() => load('wac_south_4096.jpg', t2 => { try { renderer.initTexture(t2); } catch (e) {} TERR.photo = t2; for (const ms of [M.cap, M.mid, M.tile, X.mesh, X.inner, X.far]) if (ms) { ms.material.map = t2; ms.material.needsUpdate = true; } t.dispose(); GQ.dirty = true; })); });
}
const mapUV = (map, n) => { const uv = new Float32Array(n * 2), H = 270000; for (let k = 0; k < n; k++) { uv[k * 2] = (map[k * 2] + H) / (2 * H); uv[k * 2 + 1] = (map[k * 2 + 1] + H) / (2 * H); } return new THREE.BufferAttribute(uv, 2); };
// colours for any polar grid: white (the photo shows through), gold where NASA's map says the Sun is often up, blue where it never is
function tintArrays(map, nv, m, rimFade) {
  const ice = psrMask(map, m), plain = new Float32Array(nv * 3).fill(1), tint = new Float32Array(nv * 3), tintNoIce = new Float32Array(nv * 3), alpha = new Float32Array(nv).fill(1);
  for (let k = 0; k < nv; k++) {
    const mx = map[k * 2], my = map[k * 2 + 1];
    let r = 1, gg = 1, b = 1; const s = regionSunAt(mx, my);
    if (s !== 255) { const edge = Math.min(1, Math.max(0, (151000 - Math.max(Math.abs(mx), Math.abs(my))) / 20000)), f = Math.min(1, Math.max(0, (s - 15) / 35)) * edge * 0.85; gg -= 0.12 * f; b -= 0.72 * f; r += 0.18 * f; }
    const fade = rimFade ? Math.min(1, Math.max(0, (RHO_MAX - Math.hypot(mx, my)) / 25000)) : 1; // blend into the globe at the rim
    tintNoIce.set([1 + (r - 1) * fade, 1 + (gg - 1) * fade, 1 + (b - 1) * fade], k * 3);
    if (ice[k]) { r = r * 0.3 + 0.25; gg = gg * 0.3 + 0.55; b = b * 0.3 + 1.1; }
    tint.set([1 + (r - 1) * fade, 1 + (gg - 1) * fade, 1 + (b - 1) * fade], k * 3);
    if (rimFade) { const q = Math.min(1, Math.max(0, (RHO_MAX - Math.hypot(mx, my)) / 70000)); alpha[k] = 0.26 + 0.74 * q * q * (3 - 2 * q); } // rim darkens to match the dimmed globe
  }
  return { plain, tint, tintNoIce, alpha };
}
function applyTint(mesh, f) {
  const g = mesh.geometry, key = (S.layers.sun ? 1 : 0) + (S.layers.ice ? 2 : 0);
  if (g.userData.tkey !== key) { // rewrite the colours only when the layers change
    const { plain, alpha } = g.userData, tint = !S.layers.sun && !S.layers.ice ? plain : S.layers.ice && S.layers.sun ? g.userData.tint : S.layers.sun ? g.userData.tintNoIce : g.userData.iceOnly, c = g.attributes.color.array;
    for (let k = 0, n = alpha.length; k < n; k++) { c[k * 4] = tint[k * 3]; c[k * 4 + 1] = tint[k * 3 + 1]; c[k * 4 + 2] = tint[k * 3 + 2]; c[k * 4 + 3] = 1; }
    g.attributes.color.needsUpdate = true; g.userData.tkey = key;
  }
  if (f != null) TERR.u.uTint.value = f;
}
function withIceOnly(u) { const n = u.alpha.length, io = new Float32Array(n * 3); for (let k = 0; k < n; k++) for (let q = 0; q < 3; q++) io[k * 3 + q] = u.tint[k * 3 + q] / Math.max(1e-3, u.tintNoIce[k * 3 + q]); u.iceOnly = io; return u; }
function gridIndex(m, map, keep) { // triangles of an m x m grid, skipping cells that keep() rejects
  const idx = [];
  for (let i = 0; i < m - 1; i++) for (let j = 0; j < m - 1; j++) { const a = i * m + j, b = a + 1, c = a + m, d = c + 1; if (keep(a, b, c, d)) idx.push(a, c, b, b, c, d); }
  return new THREE.Uint32BufferAttribute(idx, 1);
}
const inBox = (map, k, h) => h && Math.abs(map[k * 2] - h.x) < h.r && Math.abs(map[k * 2 + 1] - h.y) < h.r;
function capIndex(hole) {
  // triangles of the polar terrain inside the disc, minus the cells covered by a more detailed tile
  const { m, map, inside } = M.cap.geometry.userData;
  M.cap.geometry.setIndex(gridIndex(m, map, (a, b, c, d) => inside[a] && inside[b] && inside[c] && inside[d] && !(inBox(map, a, hole) && inBox(map, b, hole) && inBox(map, c, hole) && inBox(map, d, hole))));
}
function buildCap() {
  if (M.cap || !S.region) return;
  const t = S.info.region, n = t.shape[0], step = GQ.low ? 2 : 1, m = Math.floor((n - 1) / step) + 1; // 600 m grid (1.2 km on light graphics)
  const pos = new Float32Array(m * m * 3), map = new Float32Array(m * m * 2), inside = new Uint8Array(m * m);
  for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) {
    const k = i * m + j, mx = -t.half_width_m + j * step * t.pixel_m, my = t.half_width_m - i * step * t.pixel_m;
    const rim = Math.min(1, Math.max(0, (RHO_MAX - Math.hypot(mx, my)) / 30000)), sm = rim * rim * (3 - 2 * rim); // heights ease to the sphere at the rim: no seam
    const [lat, lon] = mapToLatLon(mx, my), h = S.region[(i * step) * n + j * step] * sm;
    const v = globePoint(lat, lon, 1 + h / R_MOON); pos.set([v.x, v.y, v.z], k * 3); map[k * 2] = mx; map[k * 2 + 1] = my;
    inside[k] = Math.hypot(mx, my) <= RHO_MAX;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', mapUV(map, m * m));
  g.userData = { m, map, inside, ...withIceOnly(tintArrays(map, m * m, m, true)) };
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(m * m * 4), 4));
  g.setAttribute('rim', new THREE.BufferAttribute(g.userData.alpha, 1));
  M.cap = new THREE.Mesh(g, terrainMaterial({}, TERR.u, false, true)); M.cap.visible = false;
  capIndex(null); g.computeVertexNormals(); applyTint(M.cap, 0);
  M.moon.add(M.cap); if (!TERR.photo) loadPhoto();
}
function setCapTint(f) {
  for (const ms of [M.cap, M.mid, M.tile]) if (ms) applyTint(ms, f);
  M.holed.material.color.setScalar(1 - 0.74 * f); TERR.u.uRim.value = f; TERR.u.uRimW.value = 70000; // the rest of the Moon dims while the pole map is open, and the map's rim with it
  GQ.dirty = true;
}
// a terrain grid laid on the globe: heights z (n x n, pixel px, centred on gcx, gcy in map metres), edges blended into `under`
function globeGrid(z, n, px, gcx, gcy, step, under, blendM, hole) {
  const half = (n - 1) / 2 * px, m = Math.floor((n - 1) / step) + 1, pos = new Float32Array(m * m * 3), map = new Float32Array(m * m * 2);
  for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) {
    const k = i * m + j, mx = gcx - half + j * step * px, my = gcy + half - i * step * px, e = Math.min(i, j, m - 1 - i, m - 1 - j) * step * px;
    let h = z[(i * step) * n + j * step]; if (e < blendM) { const w = 1 - e / blendM, s = w * w * (3 - 2 * w); h += (under(mx, my) - h) * s; }
    const [lat, lon] = mapToLatLon(mx, my), v = globePoint(lat, lon, 1 + h / R_MOON); pos.set([v.x, v.y, v.z], k * 3); map[k * 2] = mx; map[k * 2 + 1] = my;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', mapUV(map, m * m));
  g.userData = { m, map, ...withIceOnly(tintArrays(map, m * m, m, false)) }; g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(m * m * 4), 4));
  g.setIndex(gridIndex(m, map, (a, b, c, d) => !(inBox(map, a, hole) && inBox(map, b, hole) && inBox(map, c, hole) && inBox(map, d, hole)))); g.computeVertexNormals();
  return g;
}
const MIDZ = {};
function midTerrain(sid) {
  const w = S.info.mid.sites[sid];
  return MIDZ[sid] || (MIDZ[sid] = getBuf('terrain/' + w.file).then(b => ({ z: dec16(b, w), w })).catch(e => { delete MIDZ[sid]; throw e; }));
}
function placeDetail(kind, g) {
  const old = M[kind]; if (old) { M.moon.remove(old); old.geometry.dispose(); }
  const off = kind === 'tile' ? -4 : -2;
  M[kind] = new THREE.Mesh(g, terrainMaterial({ polygonOffset: true, polygonOffsetFactor: off, polygonOffsetUnits: off }));
  M[kind].castShadow = M[kind].receiveShadow = M.sun.castShadow; applyTint(M[kind], M.tint); M.moon.add(M[kind]);
  renderer.shadowMap.needsUpdate = true; GQ.dirty = true;
}
// medium detail (NASA LOLA 80 m, at 160 m, 80 km wide) and fine detail (LOLA 10 m, 9 km wide) appear as you fly close to a site
async function mapMid(sid) {
  if (M.midSid === sid || M.midLoading) return; M.midLoading = true;
  try {
    const { z, w } = await midTerrain(sid), t = S.info.mid, n = t.shape[0];
    const g = globeGrid(z, n, t.pixel_m, w.gcx, w.gcy, GQ.low ? 2 : 1, regionH, 2400, M.tileSid ? M.tileHole : null);
    M.midSid = sid; M.midHole = { x: w.gcx, y: w.gcy, r: t.half_width_m - 1300 }; placeDetail('mid', g); capIndex(M.midHole);
  } finally { M.midLoading = false; }
}
async function mapTile(sid) {
  if (M.tileSid === sid || M.tileLoading) return; M.tileLoading = true;
  try {
    const site = await siteMeta(sid), z = await siteTerrain(sid), t = S.info.sites, n = t.shape[0];
    const mid = M.midSid === sid ? await midTerrain(sid) : null, mt = S.info.mid;
    const under = mid ? (x, y) => sampleH(mid.z, mt.shape[0], mt.pixel_m, mt.half_width_m, mid.w.gcx, mid.w.gcy, x, y) : regionH;
    const g = globeGrid(z, n, t.pixel_m, site.x_m, site.y_m, GQ.low ? 4 : 2, under, 500, null);
    M.tileSid = sid; M.tileHole = { x: site.x_m, y: site.y_m, r: t.half_width_m - 400 }; placeDetail('tile', g);
    if (M.mid && M.midSid === sid) M.mid.geometry.setIndex(gridIndex(M.mid.geometry.userData.m, M.mid.geometry.userData.map, (a, b, c, d) => { const mp = M.mid.geometry.userData.map, h = M.tileHole; return !(inBox(mp, a, h) && inBox(mp, b, h) && inBox(mp, c, h) && inBox(mp, d, h)); }));
    else capIndex(M.tileHole);
  } finally { M.tileLoading = false; }
}
function checkTile() {
  if (!M.map || !NAV.cur || !S.index || NAV.cur.d > 0.13) return;
  let best = null, bd = 1e9; for (const s of S.index.sites) { const a = siteWorld(s).normalize().angleTo(NAV.cur.t); if (a < bd) { bd = a; best = s; } }
  if (!best) return;
  if (bd < 0.03 && S.info.mid && S.info.mid.sites[best.id]) mapMid(best.id);
  if (NAV.cur.d < 0.04 && bd < 0.012 && M.midSid === best.id && !M.midLoading) mapTile(best.id);
}
const siteWorld = s => M.moon.localToWorld(globePoint(s.lat, s.lon, 1 + (regionH(s.x_m, s.y_m) + 150) / R_MOON));


/* ================= map navigation (globe camera, Google Earth style) ================= */
// state is a point on the Moon (t, unit vector in world space), a distance above it, a heading and a tilt.
// The camera tilts toward the horizon by itself as you come closer; right-drag (or Shift-drag) rotates and tilts.
const NAV = { t: new THREE.Vector3(0, 1, 0), d: 1, head: 0, tiltU: 0, cur: null, fly: false, ptrs: new Map() };
const D_MIN = 0.0016, D_MAX = 4.2; // closest: about 3 km from the ground
function tangent(up) { const ref = Math.abs(up.z) < 0.95 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0); const e1 = ref.sub(up.clone().multiplyScalar(ref.dot(up))).normalize(); return [e1, up.clone().cross(e1)]; }
const autoTilt = d => rad(38) + rad(40) * Math.min(1, Math.max(0, (Math.log(1.2) - Math.log(d)) / (Math.log(1.2) - Math.log(0.004)))); // always a 3D view, more toward the horizon as you come closer
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
  { // stay over the detailed polar terrain: past its edge there is only the coarse globe
    const pole = M.moon.localToWorld(globePoint(-90, 0, 1)).sub(M.moon.getWorldPosition(new THREE.Vector3())).normalize(), lim = Math.max(0.03, (RHO_MAX - 40000) / R_MOON - Math.max(0, NAV.d - 0.05) * 0.15), a = NAV.t.angleTo(pole);
    if (a > lim) { const ax = new THREE.Vector3().crossVectors(pole, NAV.t).normalize(), held = NAV.ptrs.size || Object.keys(NAV.keys || {}).length;
      // a soft edge, like a rubber band: while you pull, the map gives a little; let go and it eases back. No snapping, no shaking
      const over = a - lim, give = held ? 0.02 * (1 - Math.exp(-over / 0.02)) : over * Math.exp(-dt * 6);
      if (ax.lengthSq() > 0.5) { NAV.t.copy(pole).applyAxisAngle(ax, lim + Math.min(over, give)); if (held && c.t.angleTo(pole) > NAV.t.angleTo(pole)) c.t.copy(NAV.t); } // the view itself never goes past the band, so it cannot spring back and forth
      NAV.vel = null;
      const now = performance.now(), user = NAV.ptrs.size || NAV.vel || Object.keys(NAV.keys || {}).length; if (user && !S.fit && now - (NAV.toastAt || 0) > 15000) { NAV.toastAt = now; const t = $('#edgeToast'); t.textContent = 'For now you can fly over the south pole. The rest of the Moon comes next.'; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 4200); } }}
  if (S.index) { // close zoom only where the detailed 10 m terrain exists (around the sites); elsewhere NASA's 100 m photo would turn to blur
    let a = 9; for (const s of S.index.sites) a = Math.min(a, siteWorld(s).normalize().angleTo(NAV.t));
    const dm = a < 0.012 ? D_MIN : a < 0.03 ? D_MIN + (0.009 - D_MIN) * (a - 0.012) / 0.018 : 0.009; if (NAV.d < dm) NAV.d = dm; }
  const k = 1 - Math.pow(NAV.fly ? 0.08 : 0.0004, dt);
  c.t.lerp(NAV.t, k).normalize(); c.d = Math.exp(Math.log(c.d) + (Math.log(NAV.d) - Math.log(c.d)) * k);
  c.head += (((NAV.head - c.head + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * k; c.tiltU += (NAV.tiltU - c.tiltU) * k;
  if (NAV.fly && c.t.angleTo(NAV.t) < 1e-4 && Math.abs(Math.log(c.d / NAV.d)) < 0.01) NAV.fly = false;
  const p = navPose(c); M.camera.position.copy(p.pos); M.camera.up.copy(p.up); M.camera.lookAt(p.surf.clone().addScaledVector(p.up, c.d * 0.12)); // aim a little above the ground point: more horizon
  const nr = Math.max(2e-5, c.d * 0.02), fr = c.d * 30 + 3; if (Math.abs(M.camera.near / nr - 1) > 0.05) { M.camera.near = nr; M.camera.far = fr; M.camera.updateProjectionMatrix(); }
  checkTile();
  const cmp = $('#compass i'); if (cmp) cmp.style.transform = `rotate(${deg(c.head)}deg)`;
}
function panPix(dx, dy, snap) { // move the map by a screen distance in pixels
  const c = NAV.cur; if (!c) return; const up = c.t.clone().normalize(), scale = c.d * 2 * Math.tan(rad(M.camera.fov / 2)) / VH * 1.15;
  const right = new THREE.Vector3().setFromMatrixColumn(M.camera.matrixWorld, 0); right.sub(up.clone().multiplyScalar(right.dot(up))).normalize();
  const fwd = up.clone().cross(right).negate();
  NAV.t.addScaledVector(right, -dx * scale).addScaledVector(fwd, dy * scale).normalize(); if (snap) c.t.copy(NAV.t); GQ.dirty = true;
}
function navInertia(dt) {
  if (NAV.vel && !NAV.ptrs.size) { const ms = dt * 1000; panPix(NAV.vel.x * ms, NAV.vel.y * ms, true); const f = Math.exp(-dt * 3.2); NAV.vel.x *= f; NAV.vel.y *= f; if (Math.hypot(NAV.vel.x, NAV.vel.y) < 0.004) NAV.vel = null; }
  // keys held: fly smoothly (W A S D or arrows to move, Q E to turn, R F to rise and sink)
  const k = NAV.keys; if (!k || !M.map || S.screen !== 'results') return;
  const sp = 520 * dt; let mx = 0, my = 0;
  if (k.w || k.arrowup) my -= sp; if (k.s || k.arrowdown) my += sp; if (k.a || k.arrowleft) mx -= sp; if (k.d || k.arrowright) mx += sp;
  if (mx || my) { panPix(mx, my, false); NAV.fly = false; }
  if (k.q) { NAV.head += dt * 0.9; } if (k.e) { NAV.head -= dt * 0.9; }
  if (k.r) NAV.d = Math.min(D_MAX, NAV.d * Math.exp(dt * 1.2)); if (k.f) NAV.d = Math.max(D_MIN, NAV.d * Math.exp(-dt * 1.2));
  if (mx || my || k.q || k.e || k.r || k.f) GQ.dirty = true;
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
    // drag the ground under the cursor; the last movement carries on a little after release
    panPix(dx, dy, true); const now = performance.now(), dtm = Math.max(8, now - (NAV.lastMove || now - 16)); NAV.lastMove = now;
    NAV.vel = { x: dx / dtm, y: dy / dtm };
  });
  const end = e => { NAV.ptrs.delete(e.pointerId); if (NAV.ptrs.size < 2) NAV.pinch = null; if (!NAV.ptrs.size && NAV.vel && performance.now() - (NAV.lastMove || 0) > 80) NAV.vel = null; };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('contextmenu', e => { if (S.screen === 'results') e.preventDefault(); });
  canvas.addEventListener('dblclick', e => { if (!onMap(e)) return; const p = rayToMoon(e.clientX, e.clientY); if (p) flyTo(NAV.t.clone().lerp(p.normalize(), 0.85), NAV.d * 0.4); });
  canvas.addEventListener('wheel', e => {
    if (!(S.screen === 'results' && M.map && !anim)) return; e.preventDefault(); NAV.fly = false;
    const dy = e.ctrlKey ? e.deltaY * 4 : e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY; // trackpad pinch arrives as ctrl+wheel with small steps
    const f = Math.exp(Math.max(-60, Math.min(60, dy)) * 0.0022), p = rayToMoon(e.clientX, e.clientY);
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
  NAV.keys = {};
  addEventListener('keydown', e => {
    if (S.screen !== 'results' || !M.map || e.target.closest('input, select, textarea')) return;
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'q', 'e', 'r', 'f', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { e.preventDefault(); NAV.keys[k] = true; GQ.activeUntil = performance.now() + 400; }
    else if (k === '+' || k === '=') $('#zoomIn').click(); else if (k === '-') $('#zoomOut').click();
  });
  addEventListener('keyup', e => { delete NAV.keys[e.key.toLowerCase()]; });
  addEventListener('blur', () => { NAV.keys = {}; });
}
function mapButtons() {
  $('#zoomIn').onclick = () => { NAV.d = Math.max(D_MIN, NAV.d / 1.8); NAV.fly = true; };
  $('#zoomOut').onclick = () => { NAV.d = Math.min(D_MAX, NAV.d * 1.8); NAV.fly = true; };
  $('#compass').onclick = () => { const f = mapFrame(); flyTo(f.t, f.d, 0); NAV.tiltU = f.tiltU; S.fit = 8; };
  $('#tiltBtn').onclick = () => { const flat = NAV.tiltU < -rad(30); NAV.tiltU = flat ? 0 : -rad(70); $('#tiltBtn').textContent = flat ? '2D' : '3D'; NAV.fly = true; };
  $('#homeBtn').onclick = () => { const f = mapFrame(); flyTo(f.t, f.d, 0); NAV.tiltU = f.tiltU; S.fit = 8; };
}

/* ================= real sunlight on the map ================= */
// the Sun direction of the chosen landing time (option 1's site, the same within a few degrees across the region)
function mapSunDir() {
  const o = S.data.options[0], s0 = S.sites[o.site];
  let az = o.landing.sun_azimuth_deg, el = o.landing.sun_elevation_deg;
  if (S.whenIdx != null && S.when && S.when[o.site] && S.when[o.site][S.whenIdx]) { const m = S.when[o.site][S.whenIdx]; az = m.sunAz; el = m.sunEl; }
  if (S.lightMode === 'photo') el = 40; // the photo already carries its own shading: a soft light from above
  const dv = dirFromAzEl(s0, az, el); return new THREE.Vector3(-dv.z, dv.y, dv.x); // local site frame -> world (south pole up)
}
function setMapLight(instant) {
  if (!S.data) return;
  const d = mapSunDir(), real = S.lightMode !== 'photo', c = new THREE.Vector3(0, 1, 0);
  M.lightTo = { pos: c.clone().addScaledVector(d, 2), real }; TERR.photoTo = real ? 0.4 : 1;
  if (instant) M.sun.position.copy(M.lightTo.pos);
  M.sun.target.position.copy(c); M.sun.castShadow = real; for (const ms of [M.cap, M.mid, M.tile]) if (ms) ms.castShadow = ms.receiveShadow = real; GQ.dirty = true;
  M.sun.intensity = real ? 4.4 : 1.25; M.hemiTo = real ? 0.42 : 1.65; TERR.u.uLS.value = real ? 0.7 : 0;
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
  $('#tEnd').onclick = () => { $('#tour').classList.remove('on'); TOUR.i = -1; const f = mapFrame(); flyTo(f.t, f.d); NAV.tiltU = f.tiltU; if (TOUR.dockWas && $('#dock').classList.contains('closed')) $('#dockToggle').click(); };
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
// Discover: resources, hazards and history near the pole, from NASA and published sources; shown only when the Discover switch is on
const DICON = {
  ice: '<svg viewBox="0 0 24 24"><path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M9 4l3 2 3-2M9 20l3-2 3 2M4 10.5l1-3.4M19 13.5l1 3.4M4 13.5l1 3.4M19 10.5l1-3.4"/></svg>',
  hazard: '<svg viewBox="0 0 24 24"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 17.5v.5"/></svg>',
  history: '<svg viewBox="0 0 24 24"><path d="M6 21V3M6 4h11l-2.5 4L17 12H6"/></svg>',
  site: '<svg viewBox="0 0 24 24"><path d="M12 22s7-7.2 7-12a7 7 0 0 0-14 0c0 4.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  wonder: '<svg viewBox="0 0 24 24"><path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z"/></svg>' };
function nearbyItems() { // what is around this landing site, from NASA data and our own site list
  const sx = X.site.x_m, sy = X.site.y_m, out = [], dist = (x, y) => Math.hypot(x - sx, y - sy), km = d => d < 1000 ? `${Math.round(d / 10) * 10} m` : `${fmt(d / 1000, 1)} km`;
  const P = S.psr; if (P && P.x_m) { const idx = []; for (let k = 0; k < P.x_m.length; k++) { const d = dist(P.x_m[k], P.y_m[k]); if (d < 20000) idx.push([d / Math.sqrt(Math.max(0.02, P.area_km2[k])), k, d]); }
    idx.sort((a, b) => a[0] - b[0]).slice(0, 4).forEach(([, k, d]) => out.push({ cat: 'ice', name: `Ice-bearing dark area, ${km(d)}`, x_m: P.x_m[k], y_m: P.y_m[k], title: `Never-sunlit ground ${km(d)} away`,
      what: `A ${fmt(P.area_km2[k], 2)} km² patch where the Sun never shines, mapped by NASA's LRO laser altimeter (a permanently shadowed region). Places like this are cold enough to keep water ice for billions of years.`,
      why: d < 3000 ? 'Close enough for a rover to drive in from this landing site and look for water, the most wanted resource on the Moon. It is also extremely cold and dark: equipment needs heaters and its own power to work inside.' : 'A possible water source within reach of a long rover drive. Inside, it is extremely cold and dark.',
      source: { label: 'NASA LOLA permanently shadowed regions (Barker et al. 2023)', url: 'https://pgda.gsfc.nasa.gov/' } })); }
  for (const p of (S.places && S.places.places) || []) { const d = dist(p.x_m, p.y_m); if (d < 60000) out.push({ cat: 'wonder', name: `${p.name}, ${km(d)}`, x_m: p.x_m, y_m: p.y_m, title: p.name, what: `${p.type.split(',')[0]}, ${fmt(p.diam_km)} km across, ${km(d)} from your landing site. ${p.fact}`, why: `Named after ${p.namesake}`, source: { label: 'IAU Gazetteer of Planetary Nomenclature', url: p.source } }); }
  for (const t of S.index.sites) { if (t.id === X.sid) continue; const d = dist(t.x_m, t.y_m); if (d < 40000) out.push({ cat: 'site', name: `${t.name}, ${km(d)}`, x_m: t.x_m, y_m: t.y_m, title: `Another candidate site: ${t.name}`, what: `One of the 11 landing sites this tool checks, ${km(d)} from yours.`, why: 'A nearby backup if your site has a bad date: open Compare to see how it does.', source: null }); }
  for (const p of (S.discover && S.discover.items) || []) { const rho = 2 * R_MOON * Math.tan(rad(90 + p.lat) / 2), x_m = rho * Math.sin(rad(p.lon)), y_m = rho * Math.cos(rad(p.lon)), d = dist(x_m, y_m); if (d < 90000) out.push({ ...p, x_m, y_m, name: `${p.name}, ${km(d)}` }); }
  return out;
}
function buildNearby() {
  (X.dpins || []).forEach(q => { q.el.remove(); if (q.g3) { X.scene.remove(q.g3); q.g3.traverse(o => { if (o.geometry) o.geometry.dispose(); }); } }); X.dpinsSid = X.sid;
  const COL = { hazard: 0xff8a5c, history: 0xe8d9a8, wonder: 0xf5c84a };
  X.dpins = nearbyItems().map(p => { const el = document.createElement('button'); el.className = `pin disc xdisc c-${p.cat}`; el.innerHTML = `<span class="dic">${DICON[p.cat] || ''}</span><span class="dl">${esc(p.name)}</span>`; el.style.display = 'none'; el.onclick = () => discoverCard(p, el, true); document.body.appendChild(el);
    // the anchor lives in the 3D world: a ring on the ground and a thin pole up to the icon, so the icon never floats loose from its spot
    const c = COL[p.cat] || 0x8fd8ff, g3 = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    g3.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0)]), new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.85 })));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 1, 40).rotateX(-Math.PI / 2), mat), dot = new THREE.Mesh(new THREE.CircleGeometry(0.28, 20).rotateX(-Math.PI / 2), mat); ring.name = 'ring'; dot.name = 'dot'; g3.add(ring, dot); g3.visible = false; g3.renderOrder = 5; X.scene.add(g3);
    return { el, x_m: p.x_m, y_m: p.y_m, g3, gy: null, tries: 0 }; });
}
// height of the drawn terrain at a point of the explore scene (finest mesh first); null while the meshes are still loading
const _ray = new THREE.Raycaster(); _ray.firstHitOnly = true;
function groundY(x, z) {
  const ms = [X.inner, X.mesh, X.far, X.wide].filter(m => m && m.visible !== false); if (!ms.length) return null;
  _ray.set(new THREE.Vector3(x, 60000, z), new THREE.Vector3(0, -1, 0)); _ray.far = 200000;
  for (const m of ms) { const h = _ray.intersectObject(m, false)[0]; if (h) return h.point.y; }
  return null;
}
function xFlyTo(point, closer = 0.55) { // fly the 3D camera to a point, keeping the angle
  const t0 = performance.now(), fromT = X.controls.target.clone(), fromP = X.camera.position.clone(), off = fromP.clone().sub(fromT).multiplyScalar(closer), toT = point.clone(), toP = toT.clone().add(off.setLength(Math.max(30, off.length())));
  X.controls.enabled = false; hideExHint();
  const step = now => { const k = Math.min(1, (now - t0) / 1100), q = ease(k); X.controls.target.lerpVectors(fromT, toT, q); X.camera.position.lerpVectors(fromP, toP, q); X.camera.lookAt(X.controls.target); GQ.dirty = true;
    if (k < 1) requestAnimationFrame(step); else { X.controls.update(); X.controls.enabled = true; } };
  requestAnimationFrame(step);
}
function placeDiscover() {
  const D2 = S.discover; if (!D2) return;
  for (const p of D2.items) {
    const rho = 2 * R_MOON * Math.tan(rad(90 + p.lat) / 2), x_m = rho * Math.sin(rad(p.lon)), y_m = rho * Math.cos(rad(p.lon));
    const el = document.createElement('button'); el.className = `pin disc c-${p.cat}`; el.innerHTML = `<span class="dic">${DICON[p.cat] || ''}</span><span class="dl">${esc(p.name)}</span>`;
    el.setAttribute('aria-label', `${D2.cats[p.cat]}: ${p.title}`); el.style.display = 'none'; labels.appendChild(el);
    el.onclick = () => discoverCard(p, el, x_m, y_m);
    markers.push({ el, site: { lat: p.lat, lon: p.lon, x_m, y_m }, disc: true, w: 40 });
  }
}
function discoverCard(p, el, inExplore) {
  $$('.pop').forEach(x => x.remove());
  if (!inExplore) flyTo(M.moon.localToWorld(globePoint(p.lat, p.lon, 1)), Math.min(NAV.d, 0.05));
  else if (X.site && S.view !== 'fp') { const dx = p.x_m - X.site.x_m, dy = p.y_m - X.site.y_m, inSite = Math.abs(dx) < X.half - 20 && Math.abs(dy) < X.half - 20;
    xFlyTo(new THREE.Vector3(dx, inSite ? localH(dx, -dy) : regionH(p.x_m, p.y_m) - X.h0 - (dx * dx + dy * dy) / (2 * R_MOON), -dy), Math.hypot(dx, dy) > 20000 ? 1 : 0.7); }
  const pop = document.createElement('div'); pop.className = `pop dcard c-${p.cat}`; const src = [p.source, p.source2].filter(Boolean);
  pop.innerHTML = `<div class="dchip"><span class="dic">${DICON[p.cat] || ''}</span>${esc(({ ...S.discover.cats, site: 'Candidate site', wonder: S.discover.cats.wonder })[p.cat] || '')}</div><b>${esc(p.title)}</b>
    <div class="dsec"><span>What it is</span>${esc(p.what)}</div><div class="dsec"><span>Why it matters</span>${esc(p.why)}</div>
    ${src.length ? `<div class="small">Source: ${src.map(q => `<a href="${q.url}" target="_blank" rel="noopener">${esc(q.label)}</a>`).join('; ')}</div>` : ''}
    <button class="dclose" aria-label="Close">×</button>`;
  pop.style.visibility = 'hidden'; pop.style.top = '84px'; pop.style.left = '10px'; document.body.appendChild(pop); pop.__anchor = el; pop.querySelector('.dclose').onclick = () => { pop.remove(); GQ.dirty = true; };
  const r = el.getBoundingClientRect(), right = innerWidth > 980 ? innerWidth - 450 : innerWidth - 10; pop.style.left = Math.max(10, Math.min(right - 345, r.left - 20)) + 'px'; pop.style.top = Math.max(84, Math.min(innerHeight - pop.offsetHeight - 12, r.top - 40)) + 'px'; pop.style.visibility = ''; GQ.dirty = true; GQ.activeUntil = performance.now() + 600;
  setTimeout(() => addEventListener('pointerdown', function off(e) { if (!pop.contains(e.target) && !e.target.closest('.pin.disc')) { pop.remove(); removeEventListener('pointerdown', off); } }), 0);
}
// a 15-second tour of the map controls, shown once on the first visit and on demand
const TUT = { i: -1, h: null };
function tutorial() {
  try { localStorage.setItem('lss_tut', '1'); } catch (e) {}
  const free = () => { const dr = $('#dock').getBoundingClientRect(), right = innerWidth > 980 && !$('#dock').classList.contains('closed') ? dr.left : innerWidth; return { x: right / 2, y: innerHeight * 0.5 }; };
  const box = sel => { const e = typeof sel === 'string' ? document.querySelector(sel) : sel; if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? r : null; };
  const demo = (fn, ms) => { const t0 = performance.now(); const step = now => { const k = Math.min(1, (now - t0) / ms); fn(k); GQ.dirty = true; if (k < 1 && TUT.i >= 0) requestAnimationFrame(step); }; requestAnimationFrame(step); };
  const pin1 = [...document.querySelectorAll('.pin.top')].find(e => e.style.display !== 'none');
  const steps = [
    { t: 'Move around', d: 'Drag the map with the mouse or one finger, or hold the arrow keys (W A S D) to fly. Q and E turn.', g: 'drag', at: () => { const c = free(); return { x: c.x, y: c.y, w: 220, h: 140 }; }, run: () => { let last = 0; demo(k => { const v = Math.sin(k * Math.PI) * 160, dv = v - last; last = v; panPix(dv, 0, true); }, 1500); } },
    { t: 'Zoom', d: 'Scroll the wheel, or pinch on a touchpad or phone. Double-click a spot to dive in.', g: 'zoom', at: () => { const c = free(); return { x: c.x, y: c.y, w: 220, h: 140 }; }, run: () => { const d0 = NAV.d; demo(k => { NAV.d = d0 * (1 - 0.45 * Math.sin(k * Math.PI)); NAV.cur.d = NAV.d; }, 1500); } },
    { t: 'Tilt and turn', d: 'Right-drag, or hold Shift and drag, to turn the map and look across the horizon.', g: 'tilt', at: () => { const c = free(); return { x: c.x, y: c.y, w: 220, h: 140 }; }, run: () => { const h0 = NAV.head; demo(k => { NAV.head = h0 + 0.5 * Math.sin(k * Math.PI); NAV.cur.head = NAV.head; }, 1500); } },
    { t: 'Click to learn more', d: 'Click a numbered site to open it in 3D. Turn on Discover for glowing icons of water, hazards and history.', at: () => { const r = box('#discT'); return r && { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width + 24, h: r.height + 20 }; } },
    { t: 'Back to all three', d: 'Lost? The compass puts north up and brings all three sites back into view.', at: () => { const r = box('#compass'); return r && { x: r.left + r.width / 2, y: r.top + r.height / 2, w: 64, h: 64 }; } },
    { t: 'Pick a date', d: 'Drag along this bar or press play: sunlight, shadows and the verdicts change with the date.', at: () => { const r = box('.whenbar'); return r && { x: r.left + r.width / 2, y: r.top + r.height / 2 + 10, w: r.width - 40, h: r.height - 10 }; } } ];
  let el = $('#tut'); if (!el) { el = document.createElement('div'); el.id = 'tut'; el.className = 'tut'; el.innerHTML = '<div class="tut-ring"><i class="tut-g"></i></div><div class="tut-card"><div class="tut-n"></div><b></b><p></p><div class="tut-bar"><i></i></div><div class="tut-act"><button class="btn ghost" data-t="skip">Skip</button><button class="btn primary" data-t="next">Next</button></div></div>'; document.body.appendChild(el);
    el.querySelector('[data-t="skip"]').onclick = endTut; el.querySelector('[data-t="next"]').onclick = () => show(TUT.i + 1); }
  const show = i => {
    clearTimeout(TUT.h); if (i >= steps.length) return endTut(); TUT.i = i; const st = steps[i], a = st.at(); if (!a) return show(i + 1);
    const ring = el.querySelector('.tut-ring'), card = el.querySelector('.tut-card');
    Object.assign(ring.style, { left: a.x - a.w / 2 + 'px', top: a.y - a.h / 2 + 'px', width: a.w + 'px', height: a.h + 'px' }); ring.className = 'tut-ring' + (st.g ? ' g-' + st.g : '') + (a.w > 300 ? ' wide' : '');
    card.querySelector('.tut-n').textContent = `How to move · ${i + 1} of ${steps.length}`; card.querySelector('b').textContent = st.t; card.querySelector('p').textContent = st.d;
    card.querySelector('[data-t="next"]').textContent = i === steps.length - 1 ? 'Got it' : 'Next';
    const cw = 320, below = a.y + a.h / 2 + 16, above = a.y - a.h / 2 - 16; card.style.left = Math.max(16, Math.min(innerWidth - cw - 16, a.x - cw / 2)) + 'px';
    card.style.top = (below + 190 < innerHeight ? below : Math.max(80, above - card.offsetHeight)) + 'px';
    const bar = card.querySelector('.tut-bar i'); bar.style.transition = 'none'; bar.style.width = '0'; requestAnimationFrame(() => { bar.style.transition = 'width 3.4s linear'; bar.style.width = '100%'; });
    ring.classList.toggle('first', i === 0); card.classList.toggle('first', i === 0); el.classList.add('on'); if (st.run && NAV.cur) st.run(); TUT.h = setTimeout(() => show(i + 1), 3600);
  };
  show(0);
}
function endTut() { clearTimeout(TUT.h); TUT.i = -1; const el = $('#tut'); if (el) el.classList.remove('on'); }
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
Object.assign(X.controls, { enableDamping: true, dampingFactor: 0.08, minDistance: 15, maxDistance: 900000, maxPolarAngle: rad(88), enableZoom: false, enabled: false });
X.sun = new THREE.DirectionalLight(0xfff3dd, 4.8); X.sun.castShadow = true; X.sun.shadow.mapSize.set(GQ.low ? 1024 : 2048, GQ.low ? 1024 : 2048); X.sun.shadow.bias = -0.0004; X.sun.shadow.normalBias = 1.5;
X.scene.add(X.sun, X.sun.target);
X.fill = new THREE.HemisphereLight(0xdfe6ff, 0x1a1a1a, 0.17); X.scene.add(X.fill); // display fill so shaded ground stays readable
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
  { // the Sun as a camera sees it in space: a white-hot disc, a soft corona and faint diffraction spikes
    const c = document.createElement('canvas'); c.width = c.height = 1024; const g = c.getContext('2d'), C = 512;
    let gr = g.createRadialGradient(C, C, 0, C, C, C); gr.addColorStop(0, 'rgba(255,252,240,1)'); gr.addColorStop(0.036, 'rgba(255,250,235,1)'); gr.addColorStop(0.05, 'rgba(255,236,200,.75)'); gr.addColorStop(0.16, 'rgba(255,214,150,.22)'); gr.addColorStop(0.5, 'rgba(255,200,130,.05)'); gr.addColorStop(1, 'rgba(255,200,130,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 1024, 1024); g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + 0.3; g.save(); g.translate(C, C); g.rotate(a); const lg = g.createLinearGradient(0, 0, C, 0); lg.addColorStop(0, 'rgba(255,240,215,.32)'); lg.addColorStop(1, 'rgba(255,240,215,0)'); g.fillStyle = lg; g.beginPath(); g.moveTo(0, -2.6); g.lineTo(C * 0.8, 0); g.lineTo(0, 2.6); g.fill(); g.rotate(Math.PI); g.beginPath(); g.moveTo(0, -2.6); g.lineTo(C * 0.8, 0); g.lineTo(0, 2.6); g.fill(); g.restore(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    X.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true, toneMapped: false, blending: THREE.AdditiveBlending })); X.sky.add(X.sunGlow);
  }
  const grp = new THREE.Group(), foil = new THREE.MeshStandardMaterial({ color: 0xd4ad4f, metalness: 0.6, roughness: 0.35 }), grey = new THREE.MeshStandardMaterial({ color: 0xd0d3d8, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 1.6, 8), foil); body.position.y = 2.0; grp.add(body);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 2.2), grey); deck.position.y = 2.9; grp.add(deck);
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4, leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6), grey); leg.position.set(Math.cos(a) * 1.9, 1.0, Math.sin(a) * 1.9); leg.rotation.z = Math.cos(a) * 0.5; leg.rotation.x = -Math.sin(a) * 0.5; grp.add(leg); }
  grp.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  X.lander = grp; X.landerKind = 'generic'; X.scene.add(grp);
}
// the mission's own lander at its real size (public dimensions), with a 1.8 m person beside it for scale
const LANDERS = {
  starship: { name: 'Starship HLS, SpaceX', size: 'about 50 m tall and 9 m wide, like a 15-storey building', power: 'Its solar panels run in a band around the hull, high above the ground, so they catch a low Sun that hills hide from a small lander.', src: 'https://www.nasa.gov/hls' },
  novac: { name: 'Nova-C, Intuitive Machines', size: '4.3 m tall and 1.6 m wide, on six legs', power: 'Its panels sit on the sides of a tall, narrow body, built for the low Sun of the south pole.', src: 'https://intuitivemachines.com/nova-c' },
  griffin: { name: 'Griffin, Astrobotic', size: 'about 4.5 m wide and 2 m tall, on four legs', power: 'Its panels are close to the ground: the 2 m standard panel height in this tool fits it well.', src: 'https://www.space.com/astrobotic-technology' },
  argonaut: { name: 'Argonaut, ESA', size: '6 m tall and 4.5 m wide', power: 'Panels on a 6 m lander see slightly more of the low Sun than the 2 m standard; compare with the 10 m mast option.', src: 'https://www.esa.int/Science_Exploration/Human_and_Robotic_Exploration/Exploration/Argonaut' },
  generic: { name: 'a typical small lander', size: 'about 3 m tall', power: '', src: '' } };
const landerKind = () => ({ artemis: 'starship', novac: 'novac', griffin1: 'griffin', argonaut: 'argonaut' })[S.mission] || 'generic';
function buildLander(kind) {
  const g = new THREE.Group(), M_ = (c, m = 0, r = 0.6) => new THREE.MeshStandardMaterial({ color: c, metalness: m, roughness: r });
  const steel = M_(0xd9dce1, 0.25, 0.42), foil = M_(0xd4ad4f, 0.6, 0.35), grey = M_(0xd0d3d8), dark = M_(0x2a2c30, 0.3, 0.5), panel = M_(0x1c2a4c, 0.35, 0.28), white = M_(0xeeeeee, 0, 0.7);
  const add = (geo, mat, x, y, z, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; m.rotation.z = rz; g.add(m); return m; };
  const legs = (n, r, h, top, w = 0.08) => { for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2 + Math.PI / n, A = new THREE.Vector3(Math.cos(a) * r * 0.5, top, Math.sin(a) * r * 0.5), B = new THREE.Vector3(Math.cos(a) * r, 0.05, Math.sin(a) * r), d = B.clone().sub(A);
    const leg = add(new THREE.CylinderGeometry(w, w, d.length(), 6), grey, (A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2); leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); add(new THREE.CylinderGeometry(w * 4, w * 4, 0.06, 10), grey, B.x, 0.03, B.z); } };
  if (kind === 'starship') {
    add(new THREE.CylinderGeometry(4.5, 4.5, 38, 48), steel, 0, 3 + 19, 0);
    add(new THREE.CylinderGeometry(0.9, 4.5, 9, 48), steel, 0, 41 + 4.5, 0);
    add(new THREE.SphereGeometry(0.9, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), steel, 0, 50, 0);
    add(new THREE.CylinderGeometry(4.56, 4.56, 6, 48, 1, true), panel, 0, 37, 0);
    add(new THREE.CylinderGeometry(4.58, 4.58, 1.2, 48, 1, true), dark, 0, 31, 0); // windows and airlock band
    legs(6, 5.2, 3.2, 3.2, 0.25);
  } else if (kind === 'novac') {
    add(new THREE.CylinderGeometry(0.8, 0.8, 3.0, 6), foil, 0, 1.0 + 1.5, 0);
    for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; const p = add(new THREE.BoxGeometry(0.75, 1.9, 0.04), panel, Math.cos(a) * 0.71, 2.6, Math.sin(a) * 0.71); p.rotation.y = -a + Math.PI / 2; }
    add(new THREE.CylinderGeometry(0.35, 0.45, 0.5, 12), dark, 0, 0.75, 0); add(new THREE.CylinderGeometry(0.05, 0.05, 0.3), grey, 0, 4.15, 0);
    legs(6, 1.9, 1.3, 1.3);
  } else if (kind === 'griffin') {
    add(new THREE.BoxGeometry(3.4, 0.25, 3.4), grey, 0, 1.25, 0);
    for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) add(new THREE.SphereGeometry(0.55, 16, 12), foil, x, 0.95, z);
    add(new THREE.BoxGeometry(1.6, 0.6, 1.2), white, 0.6, 1.68, 0.5);
    const p = add(new THREE.BoxGeometry(2.4, 0.04, 0.9), panel, -0.6, 1.95, -0.9); p.rotation.x = -0.25;
    legs(4, 2.25, 1.15, 1.15, 0.09);
  } else if (kind === 'argonaut') {
    add(new THREE.CylinderGeometry(2.25, 2.25, 2.4, 8), foil, 0, 1.0 + 1.2, 0);
    add(new THREE.BoxGeometry(3.8, 0.2, 3.8), grey, 0, 3.5, 0);
    add(new THREE.BoxGeometry(2.2, 2.2, 2.2), white, 0, 4.7, 0);
    for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + Math.PI / 4; const p = add(new THREE.BoxGeometry(1.6, 1.3, 0.04), panel, Math.cos(a) * 2.3, 2.2, Math.sin(a) * 2.3); p.rotation.y = -a + Math.PI / 2; }
    add(new THREE.CylinderGeometry(0.2, 0.2, 0.3), grey, 0, 6.0 - 0.15, 0); legs(4, 3.0, 1.2, 1.2, 0.1);
  } else return null;
  // a person, 1.8 m, a few metres away: the scale everyone understands
  const man = new THREE.Group(), suit = M_(0xf2f2f2, 0, 0.8);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.75, 4, 8), suit); body.position.y = 0.95; man.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), M_(0xd8b45a, 0.8, 0.2)); head.position.y = 1.62; man.add(head);
  for (const x of [-0.11, 0.11]) { const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.45, 4, 6), suit); l.position.set(x, 0.32, 0); man.add(l); }
  man.position.set((kind === 'starship' ? 8 : 3.2), 0, 1.2); g.add(man);
  g.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  return g;
}
function setLander() {
  const kind = landerKind(); if (X.landerKind === kind && X.lander) return;
  const g = kind === 'generic' ? X.landerGeneric || X.lander : buildLander(kind); if (!X.landerGeneric && X.landerKind === 'generic') X.landerGeneric = X.lander;
  if (X.lander && X.lander !== g) X.scene.remove(X.lander);
  X.lander = g; X.landerKind = kind; X.scene.add(g); g.position.set(0, X.site && X.z ? localH(0, 0) : 0, 0);
  const L = LANDERS[kind], el = $('#landerInfo'); if (el) el.innerHTML = kind === 'generic' ? '' : `<b>Your lander:</b> ${esc(L.name)}, ${esc(L.size)}, shown at real size next to a person. ${esc(L.power)} ${L.src ? `<a href="${L.src}" target="_blank" rel="noopener">Source</a>` : ''}`;
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
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', mapUV(map, m * m)); g.setIndex(new THREE.Uint32BufferAttribute(idx, 1)); g.computeVertexNormals(); g.userData = { map, m };
  return g;
}
function siteColours(g, base) {
  base = 1; const { map, m } = g.userData, mask = psrMask(map, m), plain = new Float32Array(m * m * 3).fill(base), ice = plain.slice();
  for (let k = 0; k < m * m; k++) if (mask[k]) { ice[k * 3] = 0.45; ice[k * 3 + 1] = 0.75; ice[k * 3 + 2] = 1.15; }
  g.userData.cols = { plain, ice }; g.setAttribute('color', new THREE.BufferAttribute(plain.slice(), 3)); g.setAttribute('ice', new THREE.BufferAttribute(Float32Array.from(mask, v => v ? 1 : 0), 1));
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
  for (const k of ['mesh', 'far', 'wide']) if (X[k]) { X.scene.remove(X[k]); X[k].geometry.dispose(); X[k] = null; }
  const site = await siteMeta(sid), z0 = await siteTerrain(sid);
  const t = S.info.sites, n = t.shape[0], half = t.half_width_m, h0 = z0[((n - 1) / 2) * n + (n - 1) / 2], ox = site.x_m, oy = site.y_m;
  // full 10 m detail in the inner 3 km where you stand and walk, 20 m further out: a quarter of the triangles
  const z = z0.slice(); // the last 600 m of the 10 m terrain blend into the 600 m regional terrain: no step and no square edge
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const e = Math.min(i, j, n - 1 - i, n - 1 - j) * t.pixel_m; if (e < 600) { const w = 1 - e / 600, s = w * w * (3 - 2 * w); z[i * n + j] += (regionH(ox - half + j * t.pixel_m, oy + half - i * t.pixel_m) - z[i * n + j]) * s; } }
  const ih = 1500, ic = (n - 1) / 2, ir = ih / t.pixel_m, inn = 2 * ir + 1, isub = new Float32Array(inn * inn);
  for (let i = 0; i < inn; i++) isub.set(z.subarray((ic - ir + i) * n + ic - ir, (ic - ir + i) * n + ic - ir + inn), i * inn);
  const g = gridGeometry(z, n, t.pixel_m, half, GQ.low ? 4 : 2, { gcx: ox, gcy: oy, ox, oy, h0, hole: ih + 1 }); siteColours(g, 0.74);
  const gi = gridGeometry(isub, inn, t.pixel_m, ih, GQ.low ? 2 : 1, { gcx: ox, gcy: oy, ox, oy, h0 }); siteColours(gi, 0.74);
  if (!TERR.photo) loadPhoto();
  X.mesh = new THREE.Mesh(g, terrainMaterial({ roughness: 0.95 }, TERR.ux, true)); X.mesh.castShadow = X.mesh.receiveShadow = true; X.scene.add(X.mesh);
  X.inner = new THREE.Mesh(gi, X.mesh.material); X.inner.castShadow = X.inner.receiveShadow = true; X.mesh.add(X.inner);
  const rt = S.info.region, rn = rt.shape[0], sn = 181, hw = 90, sub = new Float32Array(sn * sn);
  const ci = Math.round((rt.half_width_m - oy) / rt.pixel_m), cj = Math.round((ox + rt.half_width_m) / rt.pixel_m);
  for (let i = 0; i < sn; i++) for (let j = 0; j < sn; j++) sub[i * sn + j] = S.region[Math.max(0, Math.min(rn - 1, ci - hw + i)) * rn + Math.max(0, Math.min(rn - 1, cj - hw + j))];
  const fg = gridGeometry(sub, sn, rt.pixel_m, hw * rt.pixel_m, 1, { gcx: -rt.half_width_m + cj * rt.pixel_m, gcy: rt.half_width_m - ci * rt.pixel_m, ox, oy, h0, hole: half - 600 }); siteColours(fg, 0.74);
  X.far = new THREE.Mesh(fg, terrainMaterial({ roughness: 0.95, polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 4 }, TERR.ux)); X.far.receiveShadow = true; X.scene.add(X.far);
  // the whole polar region (1.8 km grid, curved with the Moon) and the Moon itself behind it: from high up the site sits on the real Moon
  if (X.wide) { X.scene.remove(X.wide); X.wide.geometry.dispose(); }
  const wg = gridGeometry(S.region, rn, rt.pixel_m, rt.half_width_m, GQ.low ? 5 : 3, { gcx: 0, gcy: 0, ox, oy, h0, hole: hw * rt.pixel_m - 2400 }); siteColours(wg, 1);
  { const wm = wg.userData.map, ix = wg.index.array, keep = []; // a round disc, like the polar map: the rest is the globe below
    for (let k = 0; k < ix.length; k += 3) if ([ix[k], ix[k + 1], ix[k + 2]].every(q => Math.hypot(wm[q * 2], wm[q * 2 + 1]) < RHO_MAX)) keep.push(ix[k], ix[k + 1], ix[k + 2]);
    wg.setIndex(new THREE.Uint32BufferAttribute(keep, 1)); }
  X.wide = new THREE.Mesh(wg, terrainMaterial({ roughness: 0.95, polygonOffset: true, polygonOffsetFactor: 8, polygonOffsetUnits: 8 }, TERR.ux)); X.scene.add(X.wide);
  if (!X.globe) { X.globe = new THREE.Mesh(M.holed.geometry, new THREE.MeshStandardMaterial({ map: M.holed.material.map, color: 0xa0a0a0, roughness: 1, metalness: 0, depthWrite: false })); X.globe.renderOrder = -10; X.globe.scale.setScalar(R_MOON); X.scene.add(X.globe); }
  { // turn the globe so the site, map east and map north line up with this local frame
    const g = (mx, my) => { const [la, lo] = mapToLatLon(mx, my); return globePoint(la, lo, 1); }, ps = g(ox, oy), up = ps.clone().normalize();
    const ex = g(ox + 2000, oy).sub(ps), ez = g(ox, oy - 2000).sub(ps);
    ex.addScaledVector(up, -ex.dot(up)).normalize(); ez.addScaledVector(up, -ez.dot(up)); ez.addScaledVector(ex, -ez.dot(ex)).normalize();
    X.globe.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ex, up, ez).transpose());
    X.globe.position.set(0, -h0 - R_MOON, 0); }
  Object.assign(X, { site, z, n, h0, half, px: t.pixel_m, box: new THREE.Box3().setFromBufferAttribute(g.attributes.position), farBox: new THREE.Box3().setFromBufferAttribute(fg.attributes.position), wideBox: new THREE.Box3().setFromBufferAttribute(wg.attributes.position) });
}
function setRing(radius) {
  const pts = [];
  for (let k = 0; k < 128; k++) { const a = k / 128 * Math.PI * 2, dx = Math.cos(a) * radius, dz = -Math.sin(a) * radius; pts.push(new THREE.Vector3(dx, localH(dx, dz) + 0.8, dz)); }
  const curve = new THREE.CatmullRomCurve3(pts, true);
  X.ring = new THREE.Mesh(new THREE.TubeGeometry(curve, 256, Math.max(0.18, radius / 260), 6, true), new THREE.MeshBasicMaterial({ color: 0xffd27a, toneMapped: false }));
  X.glow = new THREE.Mesh(new THREE.TubeGeometry(curve, 256, Math.max(0.9, radius / 60), 8, true), new THREE.MeshBasicMaterial({ color: 0xf5b83d, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
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
  const wide = S.view === 'region' || S.view === 'orbit', all = S.view === 'orbit' && X.wideBox, b = all ? X.wideBox : wide && X.farBox ? X.farBox : X.box;
  if (X.far) X.far.receiveShadow = X.far.castShadow = wide; if (X.wide) X.wide.receiveShadow = X.wide.castShadow = !!all;
  const L = X.sun; L.position.copy(dir).multiplyScalar(all ? 900000 : wide ? 150000 : 20000); L.target.position.set(0, 0, 0); L.updateMatrixWorld(); L.target.updateMatrixWorld();
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
  fitShadow(sd); X.sun.intensity = 4.8 * st.frac; // share of the solar disc above the terrain, from our horizon data (terrain up to 300 km away)
  X.skySun.position.copy(sd).multiplyScalar(10); X.skySun.target.position.set(0, 0, 0);
  $('#scrub').value = S.t;
  const s = series(), now = new Date(toDate(s.t[0]).getTime() + S.t * 3600e3), dh = Math.floor(S.t);
  $('#clock').innerHTML = `Day ${Math.floor(dh / 24) + 1}<small>${date(now.toISOString())}, ${pad(now.getUTCHours())}:00 UTC</small>`;
  $$('#days button').forEach(b => b.classList.toggle('on', +b.dataset.h <= S.t && S.t < +b.dataset.h + 24 * (+b.dataset.n || 1)));
  const sunTxt = st.frac > 0.99 ? 'Sunlit' : st.frac < 0.01 ? 'In shadow' : 'Partly sunlit';
  const up = el => el >= 0 ? `${fmt(el, 1)}° above the horizon` : `${fmt(-el, 1)}° below the horizon`;
  $('#nowState').innerHTML = `<div style="--c:${st.frac > 0.01 ? 'var(--sun)' : 'var(--muted)'}">${st.frac > 0.01 ? ICON.sun : ICON.dark}<b>${sunTxt}</b><span>${st.power != null ? `Panels give ${watts(st.power)}` : st.frac > 0.01 ? 'Sun on the panels' : 'On battery'}<em class="xp">, Sun ${level(st.sunEl)}</em></span></div>
    <div style="--c:${st.contact ? 'var(--earth)' : 'var(--muted)'}">${ICON.earth}<b>${st.contact ? 'Talking to Earth' : 'No contact'}</b><span>${st.contact ? 'Earth in view, a dish is listening' : st.earthEl < 0 ? 'Earth behind the horizon' : 'Earth hidden or no dish free'}<em class="xp">, Earth ${level(st.earthEl)}</em></span></div>`;
  $('#status').innerHTML = `<div class="chip" style="--c:${st.frac > 0.01 ? 'var(--sun)' : 'var(--muted)'}">${st.frac > 0.01 ? ICON.sun : ICON.dark}${sunTxt}</div>
    <div class="chip" style="--c:${st.contact ? 'var(--earth)' : 'var(--muted)'}">${ICON.earth}${st.contact ? 'Talking to Earth' : 'No contact with Earth'}</div>
    ${st.power != null ? `<div class="chip" style="--c:#fff">${ICON.bolt}${watts(st.power)} from the Sun</div>` : ''}
    ${st.soc != null ? `<div class="chip" style="--c:var(--go)">Battery ${pct(st.soc * (st.soc <= 1 ? 100 : 1))}</div>` : ''}
    <div class="chip xp" style="--c:var(--line)">Sun ${level(st.sunEl)}, Earth ${level(st.earthEl)}</div>`;
  if (S.view === 'fp' && X.walked) updateWalkChip();
}
function drawBars() { // sunlight and Earth link over the stay: what the panels and the radio will live through
  const c = $('#bars'), s = series(), n = s.t.length, dpr = devicePixelRatio, w = c.width = c.clientWidth * dpr, h = c.height = 34 * dpr, g = c.getContext('2d'), lh = 12 * dpr, y2 = 20 * dpr;
  g.clearRect(0, 0, w, h); const sun = i => s.sun_frac_worst_median_best[1][i], con = i => !!s.earth_contact[i];
  for (let i = 0; i < n; i++) { const x = i / n * w, ww = Math.max(1, w / n + 0.5), f = sun(i);
    g.fillStyle = f > 0.5 ? '#f5b83d' : f > 0.01 ? 'rgba(245,184,61,.45)' : 'rgba(255,255,255,.08)'; g.fillRect(x, 0, ww, lh);
    g.fillStyle = con(i) ? '#4ea3ff' : 'rgba(255,255,255,.08)'; g.fillRect(x, y2, ww, lh); }
  // name the gaps: how long the lander is in the dark or out of contact
  g.font = `600 ${9.5 * dpr}px Barlow Condensed, sans-serif`; g.textBaseline = 'middle'; g.textAlign = 'center';
  const gaps = (test, y, col, word) => { let a = -1; for (let i = 0; i <= n; i++) { const off = i < n && !test(i); if (off && a < 0) a = i; if (!off && a >= 0) { const len = i - a, x0 = a / n * w, x1 = i / n * w; if (len >= 3 && x1 - x0 > 46 * dpr) { g.fillStyle = col; g.fillText(`${word} ${len >= 48 ? fmt(len / 24, 1) + ' d' : len + ' h'}`, (x0 + x1) / 2, y + lh / 2); } a = -1; } } };
  gaps(i => sun(i) > 0.5, 0, '#f5b83d', 'dark'); gaps(con, y2, '#6fb5ff', 'no link');
  const sp = s.sun_frac_worst_median_best[1].filter(f => f > 0.5).length / n * 100, cp = s.earth_contact.filter(Boolean).length / n * 100;
  $('.lanes .l-sun').innerHTML = `Sunlight <b>${pct(sp)}</b>`; $('.lanes .l-earth').innerHTML = `Earth link <b>${pct(cp)}</b>`;
  const days = Math.ceil(n / 24), every = days > 20 ? Math.ceil(days / 15) : 1;
  $('#days').innerHTML = Array.from({ length: Math.ceil(days / every) }, (_, k) => `<button data-h="${k * every * 24}" data-n="${every}" style="left:${k * every * 24 / n * 100}%">D${k * every + 1}</button>`).join('');
  $$('#days button').forEach(b => b.onclick = () => { S.t = +b.dataset.h; applyTime(); });
  if (!c.__tip) { c.__tip = true; const tip = $('#barTip');
    c.addEventListener('mousemove', e => { const r = c.getBoundingClientRect(), s2 = series(), i = Math.max(0, Math.min(s2.t.length - 1, Math.floor((e.clientX - r.left) / r.width * s2.t.length))), st = sample(i), t = new Date(toDate(s2.t[0]).getTime() + i * 3600e3);
      tip.innerHTML = `<b>Day ${Math.floor(i / 24) + 1}, ${date(t.toISOString())} ${pad(t.getUTCHours())}:00</b><span style="color:#f5b83d">${st.frac > 0.99 ? 'Sunlit' : st.frac < 0.01 ? 'In shadow' : 'Partly sunlit'}</span><span style="color:#6fb5ff">${st.contact ? 'Talking to Earth' : 'No contact'}</span><i>Click to go there</i>`;
      tip.style.left = Math.min(innerWidth - 200, e.clientX - 90) + 'px'; tip.style.top = (r.top - 78) + 'px'; tip.classList.add('on'); });
    c.addEventListener('mouseleave', () => tip.classList.remove('on'));
    c.addEventListener('click', e => { const r = c.getBoundingClientRect(); S.t = Math.max(0, Math.min(series().t.length - 1, (e.clientX - r.left) / r.width * series().t.length)); applyTime(); }); }
}

/* ================= navigation ================= */
const ORDER = ['hero', 'who', 'mission', 'results', 'explore', 'compare'];
let scene = 'moon', anim = null;
function go(name, fromHistory) {
  if (name !== 'results' && TUT.i >= 0) endTut();
  fromHistory = fromHistory || S.navHist; if (name === 'explore' || !S.navHistExplore) S.navHist = false;
  if (!fromHistory && S.screen !== name && !(['results', 'explore', 'compare'].includes(name) && !S.data)) try { history.pushState({ s: name }, '', '#' + name); } catch (e) {}
  GQ.dirty = true;
  if (['results', 'explore', 'compare'].includes(name) && !S.data) return;
  const prev = S.screen; S.screen = name; document.body.dataset.screen = name;
  $$('.screen').forEach(s => s.classList.toggle('on', s.id === name));
  $$('.pop').forEach(p => p.remove()); $('#calendar').classList.remove('open');
  const idx = ORDER.indexOf(name);
  $$('#progress li').forEach(li => { const k = ORDER.indexOf(li.dataset.step); li.className = k === idx ? 'now' : k < idx ? 'done reach' : (S.data ? 'reach' : ''); });
  X.controls.enabled = name === 'explore' && S.view !== 'fp';
  if (prev === 'hero' && name !== 'hero') leaveStory();
  if (POSE[name]) { leaveMap(); [M.tiltTo, M.distTo, M.offTo] = POSE[name]; M.ring.material.opacity = name === 'mission' ? 0.9 : 0; }
  if (name === 'results') { if (M.map) backToMap(); else flyToPole(); }
  if (name === 'explore') scene = 'site';
  if (name === 'compare') { renderCompare(); setTimeout(drawWhen, 60); }
  setPlaying(false);
}
function leaveMap() {
  M.camera.near = 0.01; M.camera.far = 200; M.camera.updateProjectionMatrix();
  anim = null; scene = 'moon'; M.map = false; M.full.visible = true; M.holed.visible = false; if (M.cap) M.cap.visible = false; M.tintTo = 0; M.lightTo = null; M.sun.castShadow = false; M.sun.intensity = 3.4;
  M.sun.position.set(-3, 1.4, 2.2); M.hemi.intensity = 0.04; M.camera.up.set(0, 1, 0); $('#tour').classList.remove('on'); TOUR.i = -1; if (S.whenTimer) $('#whenPlay').click();
}
// globe -> south pole map in one continuous move: the Moon turns its pole up while the camera glides along an arc
// (never a straight line through the surface) and settles exactly on the map view, so there is no second jump
function flyToPole() {
  scene = 'moon'; buildCap(); flyToPole.mix0 = M.full.visible ? 1 : TERR.u.uGlobeMix.value; TERR.u.uGlobeMix.value = flyToPole.mix0; M.full.visible = false; M.holed.visible = true; if (M.cap) M.cap.visible = true;
  const from = { tilt: M.tilt, spin: M.spin % (Math.PI * 2), cam: M.camera.position.clone(), up: M.camera.up.clone() }, t0 = performance.now(), dur = REDUCED ? 1 : 2800;
  // the final view, computed with the Moon already in its end pose
  const r0 = [M.pivot.rotation.x, M.moon.rotation.y]; M.pivot.rotation.set(-Math.PI, 0, 0); M.moon.rotation.y = 0; M.pivot.updateMatrixWorld(true);
  const f = mapFrame(), end = { t: f.t.clone(), d: f.d, head: 0, tiltU: f.tiltU }, ep = navPose(end), look1 = ep.surf.clone().addScaledVector(ep.up, end.d * 0.12);
  M.pivot.rotation.set(r0[0], 0, 0); M.moon.rotation.y = r0[1]; M.pivot.updateMatrixWorld(true);
  const dir0 = from.cam.clone().normalize(), dir1 = ep.pos.clone().normalize(), rad0 = from.cam.length(), rad1 = ep.pos.length(), q = new THREE.Quaternion().setFromUnitVectors(dir0, dir1), qi = new THREE.Quaternion();
  const look0 = new THREE.Vector3(), lk = new THREE.Vector3(), ss = x => x * x * (3 - 2 * x);
  const V = M.camera.view; M.offX = V && V.enabled ? V.offsetX : 0; M.offY = V && V.enabled ? V.offsetY : 0; // keep the screen offset the Moon has now: it then glides, it does not jump
  const i0 = M.sun.intensity, ls0 = TERR.u.uLS.value; M.ring.material.opacity = 0; setMapLight(false);
  const l0 = M.sun.position.clone(), h0 = M.hemi.intensity, i1 = M.sun.intensity, ls1 = TERR.u.uLS.value; M.sun.intensity = i0; TERR.u.uLS.value = ls0;
  anim = now => {
    const k = Math.min(1, (now - t0) / dur), e = ease(k), er = ss(Math.min(1, Math.max(0, (k - 0.12) / 0.88))); // the turn starts first, the descent follows: a gentle, single arc
    M.tilt = M.tiltTo = from.tilt + (-Math.PI - from.tilt) * e; M.pivot.rotation.set(M.tilt, 0, 0);
    M.moon.rotation.y = from.spin * (1 - e); M.spin = M.moon.rotation.y;
    qi.identity().slerp(q, e); M.camera.position.copy(dir0).applyQuaternion(qi).multiplyScalar(Math.exp(Math.log(rad0) + (Math.log(rad1) - Math.log(rad0)) * er));
    M.camera.up.copy(from.up).lerp(ep.up, e).normalize(); M.camera.lookAt(lk.lerpVectors(look0, look1, ss(Math.min(1, k * 1.15))));
    M.sun.position.lerpVectors(l0, M.lightTo.pos, e); M.hemi.intensity = h0 + (M.hemiTo - h0) * e; M.sun.intensity = i0 + (i1 - i0) * e; TERR.u.uLS.value = ls0 + (ls1 - ls0) * e; TERR.u.uGlobeMix.value = flyToPole.mix0 * (1 - ss(Math.min(1, Math.max(0, (k - 0.1) / 0.4)))); GQ.dirty = true;
    M.tintTo = ss(Math.min(1, Math.max(0, (k - 0.35) / 0.5))); M.tint = M.tintTo; setCapTint(M.tint); // colours fade in with the descent (a uniform, no upload)
    if (k >= 1) {
      anim = null; M.map = true; M.pivot.updateMatrixWorld(true); M.tint = M.tintTo = 1;
      NAV.cur = { t: end.t.clone(), d: end.d, head: 0, tiltU: end.tiltU }; NAV.t.copy(end.t); NAV.d = end.d; NAV.head = 0; NAV.tiltU = end.tiltU; NAV.fly = false; S.fit = 8;
      if (flyToPole.after) { const fn = flyToPole.after; flyToPole.after = null; setTimeout(fn, 60); } // heavy work waits until the camera has landed
    }
  };
}
function mapFrame() {
  // where to look so the three options fit on screen (the Moon is in its final pose, south pole up)
  const w = S.data.options.map(o => siteWorld(S.index.sites.find(s => s.id === o.site)));
  const c = w.reduce((a, v) => a.add(v), new THREE.Vector3()).multiplyScalar(1 / w.length);
  const spread = Math.max(0.012, ...w.map(v => v.distanceTo(c)));
  const d = spread * 5.4 + 0.02; return { t: c.normalize(), d, tiltU: rad(34) - autoTilt(d) }; // a gentle 3D angle so all three options stay in view
}
function backToMap() { scene = 'moon'; if (M.saved) { NAV.cur = { t: M.saved.t.clone(), d: M.saved.d * 0.35, head: M.saved.head, tiltU: M.saved.tiltU }; flyTo(M.saved.t, M.saved.d, M.saved.head); NAV.fly = true; } }

/* ================= step 1: who ================= */
$$('#roles .choice').forEach(b => b.onclick = () => {
  S.role = b.dataset.role; $$('#roles .choice').forEach(x => x.setAttribute('aria-pressed', x === b));
  $('#tourBtn').hidden = S.role !== 'student'; // the guided tour of famous places is for students and the curious
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
    const tab = S.missionTab || 'planned', P = U.past || [];
    const chip = u => u.status === 'landed' ? `<i class="st landed">Landed ${esc(u.when)}</i>` : `<i class="st planned">Planned ${esc(((u.when || '').match(/20\d\d(-20\d\d)?/) || [''])[0])}</i>`;
    const card = (u, i, k) => `<button class="choice owned" data-${k}="${i}" title="${esc(u.short || '')}"><b>${esc(u.name)}</b>${chip(u)}<em>${esc(u.owner || u.agency)}</em><span>${esc(u.short || '')}</span></button>`;
    const grp = g => U.missions.map((u, i) => u.group === g ? card(u, i, 'u') : '').join('');
    el.closest('.col').classList.add('wide');
    el.innerHTML = `<h2>Pick a mission</h2>
      <div class="mtabs" role="tablist"><button role="tab" data-t="planned" aria-selected="${tab === 'planned'}">Planned <span>${U.missions.length}</span></button><button role="tab" data-t="past" aria-selected="${tab === 'past'}">Already landed <span>${P.length}</span></button></div><button class="ownbtn" id="ownMission"><b>No landing-site tool of your own?</b> Answer eight questions and check your own mission</button>
      ${tab === 'planned' ? `<p class="lead">Landings planned at the Moon's south pole, from public sources. Dates are targets and often slip.</p>
      <div class="mgrid"><div><h4>Space agencies</h4><div class="choices compact">${grp('agency')}</div></div>
      <div><h4>Companies</h4><div class="choices compact">${grp('company')}</div></div></div>`
      : `<p class="lead">What happened to the landers that already went near the south pole. Our hour-by-hour data starts in November 2026, so we check the same kind of lander for its next chances.</p>
      <div class="mgrid past"><div class="choices compact">${P.map((u, i) => card(u, i, 'p')).join('')}</div></div>`}
      <p class="small xp" style="margin-top:14px">Sources: ${[...U.missions, ...P].map(u => `<a href="${u.source}" target="_blank" rel="noopener">${esc(u.name)}</a>`).join(', ')}. ${esc(U.note || '')}</p>`;
    $$('#missionBody .mtabs button').forEach(b => b.onclick = () => { S.missionTab = b.dataset.t; renderMission(); });
    if ($('#ownMission')) $('#ownMission').onclick = () => { S.role = 'agency'; S.answers = null; S.q = 0; S.doc = null; setMode('expert'); renderMission(); };
    $$('#missionBody [data-m]').forEach(b => b.onclick = () => loadPreset(b.dataset.m, b));
    $$('#missionBody [data-u]').forEach(b => b.onclick = () => { const u = U.missions[+b.dataset.u];
      if (u.preset) { b.querySelector('span').textContent = 'Loading…'; loadPreset(u.preset); }
      else { S.role = 'agency'; S.answers = null; S.q = 0; S.doc = { pages: 0, fields: {} }; renderQuestion(); S.answers.earliestUtc = u.earliest; renderQuestion(); } });
    $$('#missionBody [data-p]').forEach(b => b.onclick = () => { const u = P[+b.dataset.p];
      if (u.preset) { b.querySelector('span').textContent = 'Loading the same kind of lander for its next chances…'; loadPreset(u.preset); }
      else b.querySelector('span').textContent = `${u.short} It landed outside the area this tool covers (south of 81°S), so there is no site to check here.`; });
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
  try { S.docName = f.name; S.doc = await readDocument(f); $('#docLoad i').style.width = '100%'; S.q = -1; renderMission(); }
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
  if (innerWidth <= 700 && !$('#dock').classList.contains('closed')) $('#dockToggle').click(); // phones: the map gets the screen, options fold down
  placeMarkers(); placePlaces(); placeDiscover(); renderResults();
  const later = () => { loadWhen(); idle(() => S.data.options.slice(0, 3).forEach((o, i) => setTimeout(() => siteTerrain(o.site).catch(() => {}), i * 400))); };
  flyToPole.after = later; go('results'); if (!anim) { flyToPole.after = null; later(); }
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
const dateWhy = q => darkNote(q) && q.sunPct >= 50 ? darkNote(q) : q.sunPct < 50 ? 'Dark for most of the stay.' : q.longestDark > 24 ? `Dark for up to ${hrs(q.longestDark)}.` : q.contactPct < 90 ? 'Earth is out of view for part of the stay, so no direct radio link then.' : 'The centre is fine on this date, but part of the landing area fails the checks.';
function renderResults() {
  const o = S.data.options, best = o[0], v = verdictOf(best), common = S.whenIdx != null && S.when;
  const head = { green: `Land at ${best.site_name}.`, yellow: `${best.site_name} is your best option.`, red: 'No site fully meets your needs.' };
  $('#answer').textContent = head[v];
  $('#answerSub').innerHTML = `<span class="sp">${v === 'red' ? 'These are the closest matches. Each card says what goes wrong.' : `Best landing time: ${dateTime(best.landing_utc)}.${common && S.when[best.site] ? ` Cards below show ${date(S.when[best.site][S.whenIdx].utc)}.` : ''}`}</span><span class="xp">${esc(S.data.trust_badge)}.</span>`;
  const cal = S.data.calendar;
  $('#cards').innerHTML = o.map((x, i) => {
    let vv = verdictOf(x), when = date(x.landing_utc), m = null;
    if (common && S.when[x.site]) { m = S.when[x.site][S.whenIdx]; const row = cal.sites[x.site] && cal.sites[x.site][S.whenIdx]; if (row) vv = dateVerdict(row[2], m); when = date(m.utc); }
    return `<article class="card" style="--c:${VC[vv]}">
      <div class="top"><span class="rank" style="color:${LINE[i]}">${i + 1}</span><div><h3>${esc(x.site_name)}</h3><div class="cwhen">${common ? 'If you land on ' : 'Best: '}${when}</div></div></div>
      <div class="verdict" style="color:${VC[vv]}"><span class="sp">${VSIMPLE[vv]}</span><span class="xp">${vx(vv)}</span></div>
      ${cardFacts(x, m)}
      ${!common && x.reasons && x.reasons.length ? `<p class="why">${esc(x.reasons[0])}</p>` : ''}
      ${common ? `<p class="why">${vv !== 'green' && m ? dateWhy(m) : '<span class="xp">Numbers at the centre of the site; the verdict covers the whole landing area.</span>'}</p>` : ''}
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
const METRIC_Q = { sun: 'Share of the stay in sunlight, if you land on that date', earth: 'Share of the stay in contact with Earth, if you land on that date', cost: 'Extra battery cost to get through the darkness, if you land on that date' };
const metricTxt = v => S.metric === 'cost' ? usd(v) : pct(v);
function drawWhen() {
  drawWhenIn($('#whenChart'), false); drawWhenIn($('#cmpChart'), true); drawSky();
  // the legend doubles as a read-out: each site's value on the date under the marker
  const i = S.whenIdx ?? S.bestIdx, o = S.data.options;
  const leg = full => o.map((x, k) => { const m = S.when && S.when[x.site] && S.when[x.site][i]; return `<span><i style="background:${LINE[k]}"></i>${k + 1}${full ? ` ${esc(x.site_name)}` : ''}${m ? ` <b>${metricTxt(metricVal(m))}</b>` : ''}</span>`; }).join('');
  if ($('#cmpLegend')) { $('#cmpLegend').innerHTML = leg(true); $('#cmpQ').textContent = METRIC_Q[S.metric || 'sun']; $('#stripSite').textContent = `${o[0].site_name}`; }
  if ($('#whenLegend')) $('#whenLegend').innerHTML = `<em>${METRIC_Q[S.metric || 'sun'].replace(', if you land on that date', '')}:</em>${leg(false)}`;
}
function drawWhenIn(c, big) {
  if (!S.when || !c || !c.clientWidth) return;
  const dpr = devicePixelRatio, w = c.clientWidth, h = c.clientHeight; c.width = w * dpr; c.height = h * dpr;
  const g = c.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, w, h);
  const sets = S.data.options.map(o => S.when[o.site] || []), n = sets[0].length; if (n < 2) return;
  const max = S.metric === 'cost' ? Math.max(1, ...sets.flat().map(metricVal)) : 100;
  const L = big ? 40 : 0, sb = big ? 8 : 3, top = big ? 16 : 14, bot = big ? 30 : 6; // left margin for the scale, stripe height, bottom margin for months
  const cal = S.data.calendar, x = i => L + i / (n - 1) * (w - L - 2), y = v => h - bot - v / max * (h - bot - top);
  g.font = `${big ? 11.5 : 11}px Barlow, sans-serif`;
  if (big) { // scale: 0, half, full, with faint guide lines
    g.textAlign = 'right'; g.textBaseline = 'middle';
    [0, 0.5, 1].forEach(f => { const yy = y(f * max); g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(L, yy, w - L, 1); g.fillStyle = 'rgba(255,255,255,.55)'; g.fillText(S.metric === 'cost' ? usd(f * max) : `${f * 100}%`, L - 6, yy); });
    g.textBaseline = 'alphabetic';
  }
  (cal.sites[S.data.options[0].site] || []).forEach((row, i) => { g.fillStyle = row[2] === 'green' ? 'rgba(47,210,122,.75)' : row[2] === 'yellow' ? 'rgba(255,176,32,.7)' : 'rgba(255,90,79,.5)'; g.fillRect(x(i), h - bot + (big ? 4 : 3) - sb + (big ? 0 : 0), Math.max(1, (w - L) / n), sb); });
  sets.forEach((set, k) => { g.strokeStyle = LINE[k]; g.globalAlpha = k ? 0.85 : 1; g.lineWidth = big ? (k ? 1.6 : 2.2) : (k ? 1.2 : 1.8); g.beginPath(); set.forEach((m, i) => g[i ? 'lineTo' : 'moveTo'](x(i), y(metricVal(m)))); g.stroke(); });
  g.globalAlpha = 1; const i = S.whenIdx ?? S.bestIdx; g.fillStyle = '#fff'; g.fillRect(x(i) - 1, top - 6, 2, h - top - bot + 6 + (big ? 8 : 0));
  if (big) sets.forEach((set, k) => { const m = set[i]; if (!m) return; g.beginPath(); g.arc(x(i), y(metricVal(m)), 4, 0, 7); g.fillStyle = LINE[k]; g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1.5; g.stroke(); });
  g.fillStyle = 'rgba(255,255,255,.6)'; g.textAlign = 'left'; let lastM = -1;
  sets[0].forEach((m, k) => { const d = toDate(m.utc); if (d.getUTCMonth() !== lastM && d.getUTCDate() <= 2) { lastM = d.getUTCMonth(); if (big) { g.fillRect(x(k), h - bot + 6, 1, 6); g.fillText(`${MON[lastM]} ${d.getUTCFullYear()}`, x(k) + 4, h - 6); } else g.fillText(MON[lastM], x(k) + 3, 11); } });
  if (!big) { g.textAlign = 'right'; g.fillText(S.metric === 'cost' ? usd(max) : '100%', w - 2, 11); }
}
// the sky seen from option 1's site: the real skyline (NASA terrain), and where the Sun and Earth travel during the stay.
// When the Sun's path dips behind a mountain the site goes dark; when Earth's does, the radio link drops.
function drawSky() {
  const c = $('#skyPano'); if (!c || !c.clientWidth || !S.when) return;
  const o = S.data.options[0], meta = S.sites[o.site], set = S.when[o.site], m = set && set[S.whenIdx ?? S.bestIdx]; if (!meta || !meta.horizon || !m) return;
  const dpr = devicePixelRatio, w = c.clientWidth, h = c.clientHeight; c.width = w * dpr; c.height = h * dpr; const g = c.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, w, h);
  const hz = meta.horizon.elevation_deg[S.data.profile && S.data.profile.mast ? 1 : 0], st = meta.horizon.az_step_deg, P = m.path || [[m.sunAz, m.sunEl, m.earthAz, m.earthEl]];
  const els = [...hz, ...P.map(p => p[1]), ...P.map(p => p[3])], lo = Math.min(...els) - 0.6, hi = Math.max(...els) + 0.8, top = 8, bot = 20;
  const X = az => ((az % 360) + 360) % 360 / 360 * w, Y = e => top + (hi - e) / (hi - lo) * (h - top - bot);
  g.fillStyle = '#05070b'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(0, Y(0), w, 1); // level line
  g.beginPath(); g.moveTo(0, h - bot); hz.forEach((e, k) => g.lineTo(X(k * st), Y(e))); g.lineTo(w, h - bot); g.closePath(); g.fillStyle = '#2a2d33'; g.fill(); g.strokeStyle = '#8c929c'; g.lineWidth = 1; g.stroke();
  const hzAt = az => hz[Math.round((((az % 360) + 360) % 360) / st) % hz.length];
  const track = (ia, ie, col) => { P.forEach(p => { const up = p[ie] > hzAt(p[ia]); g.fillStyle = up ? col : 'rgba(255,255,255,.18)'; g.beginPath(); g.arc(X(p[ia]), Y(p[ie]), up ? 1.6 : 1.2, 0, 7); g.fill(); }); };
  track(2, 3, 'rgba(78,163,255,.75)'); track(0, 1, 'rgba(245,184,61,.85)');
  const body = (az, el, col, r, lab) => { g.beginPath(); g.arc(X(az), Y(el), r, 0, 7); g.fillStyle = col; g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1.5; g.stroke(); g.fillStyle = '#fff'; g.font = '600 11px Barlow, sans-serif'; g.textAlign = 'left'; g.fillText(lab, Math.min(w - 40, X(az) + r + 4), Math.max(12, Y(el) - r)); };
  body(m.earthAz, m.earthEl, '#4ea3ff', 5.5, 'Earth'); body(m.sunAz, m.sunEl, '#f5b83d', 6, 'Sun');
  g.fillStyle = 'rgba(255,255,255,.55)'; g.font = '11px Barlow, sans-serif'; g.textAlign = 'center'; ['N', 'E', 'S', 'W'].forEach((t, k) => g.fillText(t, X(k * 90 + (k ? 0 : 0.01)) + (k ? 0 : 6), h - 5)); g.fillText('N', w - 6, h - 5);
  const sunHid = P.filter(p => p[1] <= hzAt(p[0])).length, earthHid = P.filter(p => p[3] <= hzAt(p[2])).length;
  $('#skyCap').innerHTML = `<b>The sky from ${esc(o.site_name)}</b>, landing ${date(m.utc)}. Grey: the real skyline all around (NASA terrain). Dots: where the <span class="ks">Sun</span> and <span class="ke">Earth</span> travel during the stay; ${sunHid ? `${Math.round(100 * sunHid / P.length)}% of the Sun's path is behind the mountains, so the site goes dark` : 'the Sun never drops behind the mountains, so the site stays lit'}${earthHid ? `; Earth is hidden ${Math.round(100 * earthHid / P.length)}% of the time` : ''}.`;
}
function setWhen(i) {
  if (S.lightMode === 'photo') setLightMode('date');
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
function setLightMode(l) { S.lightMode = l; $$('#lightMode button').forEach(x => x.setAttribute('aria-pressed', x.dataset.l === l)); setMapLight(); }
$$('#lightMode button').forEach(b => b.onclick = () => setLightMode(b.dataset.l));
$$('.map-key [data-layer]').forEach(b => b.onclick = () => { const k = b.dataset.layer; S.layers[k] = !S.layers[k]; b.setAttribute('aria-pressed', S.layers[k]); setCapTint(M.tint); });
$('#tourBtn').onclick = () => tourStep(TOUR.i < 0 ? 0 : TOUR.i + 1);
mapButtons();
$('#toBest').onclick = toBest;
$$('#metric button').forEach(b => b.onclick = () => { S.metric = b.dataset.m; $$('#cmpMetric button, #metric button').forEach(x => x.setAttribute('aria-pressed', x.dataset.m === S.metric)); drawWhen(); });
$('#dockToggle').onclick = () => { const d = $('#dock'), c = d.classList.toggle('closed'); document.body.classList.toggle('wide', c); $('#dockToggle').textContent = innerWidth <= 700 ? (c ? '▲ Your 3 options' : '▼ Back to the map') : c ? 'Show options' : 'Hide options'; $('#dockToggle').setAttribute('aria-expanded', !c); setTimeout(drawWhen, 480); };

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
  setRing(opt().ellipse_radius_m || 50); setPaths(); X.sunPath.visible = X.earthPath.visible = false; X.ring.visible = X.glow.visible = S.view !== 'fp';
  $('#scrub').max = series().t.length - 1;
  renderPanel(); drawBars(); setView(S.view, true); L.classList.remove('on'); $('#fade').style.opacity = 0; showExHint();
}
const VIEW = {
  drone: back => { const h = { starship: 50, novac: 4.3, griffin: 2, argonaut: 6 }[X.landerKind] || 3, r = 22 + h * 2.4, g = localH(0, 0); return { pos: new THREE.Vector3(back.x * r, g + h * 0.5 + r * 0.42, back.z * r), target: new THREE.Vector3(0, g + h * 0.45, 0), fov: 50 }; },
  region: back => ({ pos: new THREE.Vector3(back.x * 5200, 7600, back.z * 5200), target: new THREE.Vector3(0, 0, 0), fov: 50 }),
  orbit: back => ({ pos: new THREE.Vector3(back.x * 95000, 60000, back.z * 95000), target: new THREE.Vector3(0, 0, 0), fov: 50 }),
};
function setView(v, instant) {
  S.view = v; $$('#views button').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === v));
  $('#viewHint').textContent = { fp: 'You are standing where the lander touches down. Drag to look around, W A S D to walk, scroll to zoom in on the Sun or Earth.', drone: 'Your lander at real size, beside a person, in its landing circle. Drag to circle around it, arrows or W A S D to move, scroll out to see the whole circle, double-click a spot to fly there.', region: 'The 10 km around the site, with the hills that cast its shadows. Drag to turn, arrows or W A S D to fly, scroll to zoom, double-click a spot to fly there.', orbit: 'The pole seen from space, on the real Moon. Drag to turn, arrows or W A S D to fly, scroll to zoom out to the whole Moon, double-click a spot to fly there.' }[v];
  setLander(); X.lander.visible = v !== 'fp'; if (X.sunPath) X.sunPath.visible = X.earthPath.visible = false; if (X.ring) X.ring.visible = X.glow.visible = v !== 'fp';
  $('#walkhint').classList.toggle('on', v === 'fp'); $('#walkhint').textContent = 'Use the arrow keys or W A S D to walk. Hold Shift to run. Drag to look around.';
  const st = sample(S.t), back = dirFromAzEl(X.site, st.sunAz + 150, 0);
  X.controls.enabled = false;
  const fromPos = X.camera.position.clone(), fromTgt = X.controls.target.clone(), fromFov = X.camera.fov;
  let to;
  if (v === 'fp') { X.yaw = st.sunAz; X.pitch = 2; to = { pos: new THREE.Vector3(0, localH(0, 0) + 2, 0), fov: 60 }; to.target = to.pos.clone().add(dirFromAzEl(X.site, X.yaw, X.pitch)); }
  else to = VIEW[v](v === 'drone' ? dirFromAzEl(X.site, st.sunAz + 55, 0) : back); // close up: the Sun over your shoulder, so the lander is lit
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
  canvas.addEventListener('dblclick', e => { // fly to the spot under the cursor, keeping the angle, a little closer
    if (S.screen !== 'explore' || S.view === 'fp' || !X.mesh) return;
    const ndc = new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), ray = new THREE.Raycaster(); ray.setFromCamera(ndc, X.camera);
    const hit = ray.intersectObjects([X.mesh, X.far, X.wide].filter(Boolean), true)[0]; if (!hit) return;
    const t0 = performance.now(), fromT = X.controls.target.clone(), fromP = X.camera.position.clone(), off = fromP.clone().sub(fromT).multiplyScalar(0.55), toT = hit.point.clone(), toP = toT.clone().add(off.setLength(Math.max(30, off.length())));
    X.controls.enabled = false; hideExHint();
    const step = now => { const k = Math.min(1, (now - t0) / 1100), q = ease(k); X.controls.target.lerpVectors(fromT, toT, q); X.camera.position.lerpVectors(fromP, toP, q); X.camera.lookAt(X.controls.target); GQ.dirty = true;
      if (k < 1) requestAnimationFrame(step); else { X.controls.update(); X.controls.enabled = true; } };
    requestAnimationFrame(step); });
  canvas.addEventListener('pointerdown', e => { if (S.screen === 'explore') hideExHint(); if (S.screen === 'explore' && S.view === 'fp') { drag = { x: e.clientX, y: e.clientY, yaw: X.yaw, pitch: X.pitch }; canvas.setPointerCapture(e.pointerId); if (X.camera.fov < 50) { X.camera.fov = 60; X.camera.updateProjectionMatrix(); } } });
  canvas.addEventListener('pointermove', e => { if (!drag) return; X.yaw = drag.yaw - (e.clientX - drag.x) * 0.25; X.pitch = Math.max(-60, Math.min(70, drag.pitch + (e.clientY - drag.y) * 0.25)); lookFP(); });
  addEventListener('pointerup', () => drag = null);
  // scroll over the timeline: move through the days
  $('#explore .time').addEventListener('wheel', e => { if (!S.data || !X.site) return; e.preventDefault(); const n = series().t.length - 1; S.t = Math.max(0, Math.min(n, S.t + (e.deltaY || e.deltaX) * 0.03)); applyTime(); }, { passive: false });
  // the wheel on the scene zooms; with Shift it moves time
  canvas.addEventListener('wheel', e => {
    if (S.screen !== 'explore' || !S.data || !X.site) return; e.preventDefault();
    hideExHint();
    if (e.shiftKey) { const n = series().t.length - 1; S.t = Math.max(0, Math.min(n, S.t + (e.deltaY || e.deltaX) * 0.02)); applyTime(); return; }
    if (S.view === 'fp') { X.camera.fov = Math.max(8, Math.min(75, X.camera.fov * Math.exp(e.deltaY * 0.001))); X.camera.updateProjectionMatrix(); GQ.dirty = true; return; }
    const d = X.camera.position.clone().sub(X.controls.target), len = Math.max(15, Math.min(S.view === 'orbit' ? 900000 : 60000, d.length() * Math.exp(e.deltaY * 0.0012)));
    X.camera.position.copy(X.controls.target).add(d.setLength(len)); GQ.dirty = true;
  }, { passive: false });
  addEventListener('keydown', e => { if (S.screen === 'explore' && !e.target.closest('input')) { X.walk[e.key.toLowerCase()] = true; if (e.key.startsWith('Arrow')) e.preventDefault(); } });
  addEventListener('keyup', e => { X.walk[e.key.toLowerCase()] = false; });
}
function walkStep(dt) {
  const k = X.walk, f = (k.w || k.arrowup ? 1 : 0) - (k.s || k.arrowdown ? 1 : 0), r = (k.d || k.arrowright ? 1 : 0) - (k.a || k.arrowleft ? 1 : 0);
  const turn = (k.e ? 1 : 0) - (k.q ? 1 : 0); if (turn) { X.yaw += turn * dt * 50; lookFP(); GQ.dirty = true; }
  if (!f && !r) return;
  const sp = (k.shift ? 150 : 30) * dt, fwd = dirFromAzEl(X.site, X.yaw, 0), right = dirFromAzEl(X.site, X.yaw + 90, 0);
  const p = X.camera.position.clone().addScaledVector(fwd, f * sp).addScaledVector(right, r * sp), lim = X.half - 50;
  p.x = Math.max(-lim, Math.min(lim, p.x)); p.z = Math.max(-lim, Math.min(lim, p.z)); p.y = localH(p.x, p.z) + 2;
  X.camera.position.copy(p); lookFP(); X.walked = true; updateWalkChip();
}
function flyStep(dt) { // arrows or W A S D in the other views: glide over the ground, faster the higher you are
  const k = X.walk, f = (k.w || k.arrowup ? 1 : 0) - (k.s || k.arrowdown ? 1 : 0), r = (k.d || k.arrowright ? 1 : 0) - (k.a || k.arrowleft ? 1 : 0), turn = (k.e ? 1 : 0) - (k.q ? 1 : 0);
  const zm = (k.r ? 1 : 0) - (k.f ? 1 : 0);
  if (!f && !r && !turn && !zm) return false;
  const off = X.camera.position.clone().sub(X.controls.target);
  if (zm) off.multiplyScalar(Math.exp(zm * dt * 1.3)), off.setLength(Math.max(15, Math.min(S.view === 'orbit' ? 900000 : 60000, off.length())));
  const dist = off.length(), fwd = off.clone().setY(0).normalize().negate(), right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const mv = fwd.multiplyScalar(f).add(right.multiplyScalar(r)).multiplyScalar(Math.max(dist, 80) * (k.shift ? 1.6 : 0.6) * dt);
  X.controls.target.add(mv); const lim = 250000; X.controls.target.x = Math.max(-lim, Math.min(lim, X.controls.target.x)); X.controls.target.z = Math.max(-lim, Math.min(lim, X.controls.target.z));
  if (Math.abs(X.controls.target.x) < X.half && Math.abs(X.controls.target.z) < X.half) X.controls.target.y += (localH(X.controls.target.x, X.controls.target.z) - X.controls.target.y) * Math.min(1, dt * 4);
  if (turn) off.applyAxisAngle(new THREE.Vector3(0, 1, 0), -turn * dt * 0.9);
  X.camera.position.copy(X.controls.target).add(off); X.camera.lookAt(X.controls.target); GQ.dirty = true; GQ.activeUntil = performance.now() + 300; return true;
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
  TERR.ux.uIce.value = S.ice ? 1 : 0;
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
  const head = `<div><h3>${esc(o.site_name)}</h3><div class="small">Landing ${dateTime(o.landing_utc)}, ${stay} days on the surface</div>
      <div class="verdict" style="color:${VC[v]};margin-top:12px"><span class="sp">${VSIMPLE[v]}</span><span class="xp">${vx(v)}</span></div>
      <p class="small xp" style="margin:4px 0 0">For the worst point of the landing area${String(o.orientation).startsWith('unknown') ? ' and the worst of 8 lander directions' : ''}.</p></div>`;
  const simple = `<div class="sp panel-simple">
      <div class="big">
      ${fact(sunR[0] > 50 ? 'sun' : 'dark', W.sun(sunR[0]), W.dark(darkR[1]))}
      ${fact('earth', W.earth(conR[0]), o.comms.longest_gap_h > 0 ? `Longest silence: ${hrs(o.comms.longest_gap_h)}` : '')}
      ${fact('cost', W.costDark(darkR[1]), darkR[1] > 0 ? `${fmt(battKg(darkR[1]), 1)} kg of extra battery for every ${fmt(COST.loadW)} W you keep on` : '')}
      ${ice != null ? fact('ice', W.ice(ice)) : ''}${tr ? fact('slope', W.ground(tr)) : ''}
      </div>
      ${o.reasons && o.reasons.length ? `<div class="sec"><h4>Watch out</h4><ul class="reasons">${o.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}
      ${whatIf}</div>`;
  const expert = `<div class="xp panel-expert">
    <div class="sec"><h4>Sunlight</h4><div class="rows">
      ${row('Time in sunlight', range(sunR, pct), 'More than half of the Sun above the terrain, panels 2 m up.')}
      ${row('Longest darkness', range(darkR, hrs), 'The battery must carry the lander through this.')}
      ${row('Until first sunset', hrs(o.light.hours_to_sunset), 'After landing.')}</div></div>
    <div class="sec"><h4>Earth contact</h4><div class="rows">
      ${row('Time in contact', range(conR, pct), 'Earth above the terrain and a Deep Space Network dish in view.')}
      ${row('Longest silence', hrs(o.comms.longest_gap_h), 'Longest time you cannot send or receive.')}
      ${o.comms.data_possible_mb != null ? row('Data you can send', fmt(o.comms.data_possible_mb / 1000) + ' GB', 'Contact hours times your data rate.') : ''}</div></div>
    <div class="sec"><h4>Power</h4><div class="rows">
      ${pw.energy_kwh != null ? row('Energy collected', fmt(pw.energy_kwh, 1) + ' kWh', 'Over the whole stay.') : ''}
      ${pw.max_sustainable_load_w != null ? row('Max continuous load', watts(pw.max_sustainable_load_w), 'With your battery.') : ''}
      ${pw.array_needed_w != null ? row('Solar array needed', range(rg.array_needed_w || [pw.array_needed_w, pw.array_needed_w], watts), 'Smallest array for your load.') : ''}
      ${pw.battery_needed_wh != null ? row('Battery needed', range(pick('battery_needed_wh', rg.battery_needed_wh || [pw.battery_needed_wh, pw.battery_needed_wh]), wh), 'Smallest battery for your load, 80% usable.') : ''}
      ${!Object.keys(pw).filter(k => pw[k] != null).length ? row('Battery for 100 W', wh(darkR[1] * 100 / DOD), 'No power data given: what a 100 W load needs.') : ''}
      ${row('Extra battery mass for darkness', darkR[1] > 0 ? `${fmt(battKg(darkR[1]), 1)} kg` : 'None', `For ${fmt(COST.loadW)} W at ${BATT_WH_PER_KG} Wh/kg. Cost scenarios on the Compare page.`)}</div></div>
    <div class="sec"><h4>Landing and ground</h4><div class="rows">
      ${row('Sun at touchdown', level(L.sun_elevation_deg), 'Low Sun: long shadows on the approach.')}
      ${row('Earth at touchdown', L.earth_visible ? level(L.earth_elevation_deg) : 'Not visible', 'Needed to talk to Earth while landing.')}
      ${tr ? row('Slope, typical / steepest 10%', `${fmt(tr.median_deg, 1)}° / ${fmt(tr.p90_deg, 1)}°`, `NASA ${tr.resolution_m} m terrain inside the landing circle.`) + row('Ground within your slope limit', pct(tr.safe_fraction * 100), '') : ''}
      ${ice != null ? row('Nearest dark area over 0.01 km²', fmt(ice, 1) + ' km', 'Can hold water ice (NASA LOLA catalogue).') : ''}</div>
      ${L.shadow_risk ? `<p class="small">${esc(L.shadow_risk)}</p>` : ''}</div>
    ${tu ? `<div class="sec"><h4>How sure we are</h4><div class="rows">${row(`Same result on ${tu.clones} NASA terrain versions`, range(tu.centre_sun_pct, pct) + ' sunlight', 'The answer does not hinge on terrain errors.')}</div></div>` : ''}
    ${o.reasons && o.reasons.length ? `<div class="sec"><h4>Watch out</h4><ul class="reasons">${o.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}
    ${whatIf}</div>`;
  $('#panel').innerHTML = `${head}${simple}${expert}
    <div class="sec"><div class="switch"><span>Show ice-bearing dark areas in blue</span><button class="toggle" id="iceT" aria-pressed="${S.ice}" aria-label="Show dark areas"></button></div></div>
    <button class="btn" data-go="compare">Compare all options</button>`;
  $$('#panel [data-hw]').forEach(b => b.onclick = () => { S.hw = b.dataset.hw; renderPanel(); });
  $('#iceT').onclick = () => { S.ice = !S.ice; TERR.ux.uIce.value = S.ice ? 1 : 0; if (S.ice) toast('Blue glow: ground that never sees the Sun and can keep water ice (NASA LOLA).', 4200); if (M.cap) setCapTint(M.tint); GQ.dirty = true; renderPanel(); };
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
    const r = dateWhy(q).replace(/\.$/, '');
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
  renderCostbox(mm);

}

/* ================= what each site costs: one table, one answer ================= */
function renderCostbox(mm, partial) {
  const o = S.data.options, P = [...PRICES].sort((a, b) => a.usdPerKg - b.usdPerKg), pi = Math.max(0, P.findIndex(p => p.id === COST.price)), price = P[pi];
  const dark = x => { const q = mm(x); return q ? q.longestDark : (x.ranges && x.ranges.longest_dark_h ? x.ranges.longest_dark_h[1] : x.light.longest_dark_h); };
  const rows = o.map((x, i) => { const q = mm(x), h = dark(x), kg = battKg(h), bat = kg * price.usdPerKg, lostH = q ? q.lostH : lostHours(x), lost = valueLost(lostH, x.duration_h); return { x, i, h, kg, bat, lostH, lost, tot: bat + lost }; });
  const lo = rows.reduce((a, r) => r.tot < a.tot ? r : a, rows[0]), first = rows[0];
  const when = S.whenIdx != null && S.when ? 'on the date you picked' : 'each at its best date';
  const say = rows.every(r => r.kg < 0.05 && r.lostH === 0) ? `No site needs extra battery or loses surface time, ${when}. Cost does not separate them: pick on the other rows.`
    : lo === first ? `${esc(first.x.site_name)} is also the cheapest. ${rows.filter(r => r !== first).map(r => `${esc(r.x.site_name)} costs <b>${usd(r.tot - first.tot)} more</b>`).join(', ')}.`
    : `${esc(lo.x.site_name)} costs <b>${usd(first.tot - lo.tot)} less</b> than option 1, ${esc(first.x.site_name)}. Weigh that against the verdict and the other rows.`;
  const same = rows.every(r => Math.abs(r.tot - lo.tot) < 1), extra = r => same ? 'Same' : r === lo ? '<span class="ct-best">Cheapest</span>' : `+${usd(r.tot - lo.tot)}`;
  const table = `<table class="ct"><thead><tr><th>Option</th><th>Longest darkness<small>worst case</small></th><th>Extra battery<small>at ${fmt(COST.loadW)} W</small></th><th>Cost to fly it<small>${usd(price.usdPerKg)} per kg</small></th><th>Time without Sun or Earth<small>share of a ${usd(COST.missionUsd)} mission</small></th><th>Total<small>against the cheapest</small></th></tr></thead><tbody>
    ${rows.map(r => `<tr${r === lo && !same ? ' class="lo"' : ''}><th><b style="color:${LINE[r.i]}">${r.i + 1}</b> ${esc(r.x.site_name)}</th><td>${r.h > 0 ? hrs(r.h) : 'None'}</td><td>${r.kg >= 0.05 ? `${fmt(r.kg, 1)} kg` : 'None'}</td><td>${r.kg >= 0.05 ? usd(r.bat) : '$0'}</td><td>${r.lostH ? `${hrs(r.lostH)} = ${usd(r.lost)}` : 'None'}</td><td class="num">${extra(r)}</td></tr>`).join('')}</tbody></table>`;
  if (partial && $('#costbox .ct')) { $('#costbox .cb-say').innerHTML = say; $('#costbox .ct').outerHTML = table; return; }
  $('#costbox').innerHTML = `
    <div class="cb-head"><h3>What each option costs</h3><p class="cb-say">${say}</p></div>
    ${table}
    <div class="cb-ctrl">
      <label>Power kept on during the dark <b id="cLoadV">${fmt(COST.loadW)} W</b><input id="cLoad" type="range" min="20" max="1000" step="10" value="${COST.loadW}"><small>${S.data.costLoadGiven ? 'From the mission profile.' : 'Your mission did not say: 100 W is an example.'}</small></label>
      <div class="cb-price"><span>Delivery price to the Moon</span><div class="tabs" id="cPrice">${P.map((p, k) => `<button data-p="${p.id}" aria-pressed="${k === pi}" title="${esc(p.label)}">${['Lowest', 'List price', 'NASA paid'][k]} <small>${usd(p.usdPerKg)}/kg</small></button>`).join('')}</div></div>
      <label class="cb-mission xp">Mission price <span>$ <input id="cMission" type="number" min="1" value="${COST.missionUsd / 1e6}"> million</span></label>
    </div>
    <p class="small">Extra battery = longest darkness × power kept on ÷ 0.8 usable charge ÷ ${BATT_WH_PER_KG} Wh/kg (the best lithium-ion cells in NASA's Small Spacecraft State of the Art report, so real packs weigh more). Time without Sun or Earth is valued as its share of the mission price (default: NASA CLPS award CP-22, $116.9M). Public prices, not quotes: ${P.map(p => `<a href="${p.url}" target="_blank" rel="noopener">${esc(p.label)}</a>`).join('; ')}. Every step is in the Excel file, Cost and Power sheets.</p>`;
  $('#cLoad').oninput = e => { COST.loadW = +e.target.value; $('#cLoadV').textContent = `${fmt(COST.loadW)} W`; clearTimeout(S.cbT); S.cbT = setTimeout(() => { renderCostbox(mm, true); renderResults(); drawWhen(); }, 40); };
  $$('#cPrice button').forEach(btn => btn.onclick = () => { COST.price = btn.dataset.p; renderCostbox(mm); renderResults(); });
  $('#cMission').onchange = e => { COST.missionUsd = Math.max(1, +e.target.value || 116.9) * 1e6; renderCostbox(mm); };
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
/* ================= first screen: a scroll story in one continuous 3D world =================
   Scrolling flies from the whole Moon down to the south pole while the Sun circles the horizon (real low-Sun light on
   NASA terrain) and Earth sits low in the sky. Chapters 0-4; the camera follows a smooth path through key views. */
const STORY = { p: 0, to: 0, n: 4, sunAz: 40 };
const STORY_K = [ // map-mode views: point on the Moon (lat, lon), distance (Moon radii), heading, extra tilt
  null,
  { lat: -89.6, lon: 0, d: 0.75, head: 0.4, tiltU: -0.25 },
  { lat: -89.3, lon: -150, d: 0.075, head: 1.9, tiltU: 0.12 },
  { lat: -88.8, lon: 125, d: 0.022, head: 3.3, tiltU: 0.22 },
  { lat: -89.4, lon: 0, d: 0.55, head: 4.2, tiltU: -0.1 },
];
function storyPose(p) {
  const i = Math.min(3, Math.max(1, Math.floor(p))), f = ease(Math.min(1, Math.max(0, p - i))), a = STORY_K[i], b = STORY_K[i + 1];
  const ta = M.moon.localToWorld(globePoint(a.lat, a.lon, 1)).normalize(), tb = M.moon.localToWorld(globePoint(b.lat, b.lon, 1)).normalize();
  return { t: ta.lerp(tb, f).normalize(), d: Math.exp(Math.log(a.d) + (Math.log(b.d) - Math.log(a.d)) * f), head: a.head + (b.head - a.head) * f, tiltU: a.tiltU + (b.tiltU - a.tiltU) * f };
}
function storyChapter() {
  const c = Math.round(STORY.p); $$('.story .ch').forEach(ch => ch.classList.toggle('on', +ch.dataset.i === c));
  $$('.story-dots i').forEach((d, k) => d.classList.toggle('on', k === c)); $('#scrollCue').classList.toggle('off', STORY.to >= STORY.n - 0.05);
}
function storyGo(delta) { if (S.screen !== 'hero') return; STORY.to = Math.max(0, Math.min(STORY.n, STORY.to + delta)); GQ.dirty = true; }
addEventListener('wheel', e => { if (S.screen === 'hero' && !$('#how').classList.contains('on')) { e.preventDefault();
  // past the last chapter, a fresh scroll down (not the tail of the one that got there) moves on to the app
  const end = STORY.p > STORY.n - 0.02, now = performance.now();
  if (end && e.deltaY > 20 && STORY.endAt && now - STORY.endAt > 900 && now - (STORY.lastWheel || 0) > 250) { STORY.lastWheel = now; go('who'); return; }
  if (end && !STORY.endAt) STORY.endAt = now; if (!end) STORY.endAt = 0; STORY.lastWheel = now;
  storyGo(Math.max(-0.5, Math.min(0.5, e.deltaY / 500))); } }, { passive: false });
addEventListener('keydown', e => { if (S.screen !== 'hero' || e.target.closest('input')) return; const k = e.key; if (['ArrowDown', 'PageDown', ' '].includes(k)) { e.preventDefault(); if (STORY.p > STORY.n - 0.02) { go('who'); return; } storyGo(1 - (STORY.to % 1 || 0) || 1); STORY.to = Math.round(STORY.to); } else if (['ArrowUp', 'PageUp'].includes(k)) { e.preventDefault(); STORY.to = Math.max(0, Math.ceil(STORY.to) - 1); } });
{ let ty = null; addEventListener('touchstart', e => { if (S.screen === 'hero') ty = e.touches[0].clientY; }, { passive: true }); addEventListener('touchmove', e => { if (S.screen === 'hero' && ty != null) { storyGo((ty - e.touches[0].clientY) / 400); ty = e.touches[0].clientY; } }, { passive: true }); }
$('#storyNext').onclick = () => { STORY.to = Math.min(STORY.n, Math.floor(STORY.to) + 1); GQ.dirty = true; };
function storyEarth() {
  if (M.earthS) return M.earthS;
  const t = texLoader.load('assets/earth_2k.jpg'); t.colorSpace = THREE.SRGBColorSpace;
  M.earthS = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 })); M.earthS.visible = false; M.scene.add(M.earthS);
  return M.earthS;
}
function storyApply(dt) {
  const k = 1 - Math.pow(STORY.to === 0 ? 0.004 : 0.04, dt); STORY.p += (STORY.to - STORY.p) * k; if (Math.abs(STORY.to - STORY.p) < 1e-4) STORY.p = STORY.to;
  const p = STORY.p, ready = M.cap && TERR.photo;
  if (!ready || p <= 0.001) { // the whole Moon, turning slowly
    M.full.visible = true; M.holed.visible = false; if (M.cap) M.cap.visible = false; if (M.earthS) M.earthS.visible = false; if (STORY.dimmed) { STORY.dimmed = false; if (M.cap) applyTint(M.cap, 0); M.holed.material.color.setScalar(1); M.full.material.color.setScalar(1); TERR.u.uRim.value = 0; }
    M.sun.castShadow = false; M.sun.position.set(-3, 1.4, 2.2); M.sun.target.position.set(0, 0, 0); M.sun.intensity = 3.4; M.hemi.intensity = 0.04; M.camera.up.set(0, 1, 0);
    M.camera.near = 0.01; M.camera.far = 200; M.camera.updateProjectionMatrix(); return false;
  }
  const e = ease(Math.min(1, p)), gb = Math.min(1, Math.max(0, (e - 0.45) / 0.5)); // far away the polar map shows the same image as the globe; coming closer, NASA's detailed polar photo fades in: no cut
  M.full.visible = false; M.holed.visible = true; M.cap.visible = true; TERR.u.uGlobeMix.value = 1 - gb * gb * (3 - 2 * gb); TERR.u.uPhoto.value = 0.5; TERR.photoTo = null;
  if (!STORY.dimmed) { applyTint(M.cap, 0); M.tint = M.tintTo = 0; STORY.dimmed = true; } // plain colours in the story: the tint uniform at 0, no buffer rewrite
  const dimF = Math.min(1, Math.max(0, (e - 0.55) / 0.45)), dm = dimF * dimF * (3 - 2 * dimF) * 0.55; // the Moon darkens first, then the lit pole appears: a spotlight, not a pasted disc
  M.holed.material.color.setScalar(1 - 0.86 * dm); M.full.material.color.setScalar(1 - 0.86 * dm); TERR.u.uRimW.value = 170000; TERR.u.uRim.value = dm; // the rest of the Moon dims gradually: the pole stands out, with no edge
  M.pivot.rotation.set(M.tilt + (-Math.PI - M.tilt) * e, 0, 0); M.moon.rotation.y = (M.spin % (Math.PI * 2)) * (1 - e); M.pivot.updateMatrixWorld(true);
  // the Sun circles the pole a degree and a half above the horizon; its shadows turn with it
  STORY.sunAz += dt * (p > 0.9 ? 9 : 0); const az = rad(STORY.sunAz), el = rad(1.6), sd = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
  const pole = new THREE.Vector3(0, 1, 0), front = new THREE.Vector3(-3, 1.4, 2.2).normalize(), ls = Math.min(1, e / 0.7);
  const dir = front.clone().lerp(sd, ls * ls * (3 - 2 * ls)).normalize(); // the light eases from the front (the whole Moon lit) to the low polar Sun
  M.sun.target.position.copy(pole); M.sun.position.copy(pole).addScaledVector(dir, 2); M.sun.castShadow = e > 0.6; M.cap.castShadow = M.cap.receiveShadow = true;
  M.sun.intensity = 3.4 + 1.0 * e; M.hemi.intensity = 0.04 + 0.11 * e; renderer.shadowMap.needsUpdate = true;
  let pos, up, look;
  if (p < 1) {
    const hp = navPose(STORY_K[1] && storyPose(1)), from = new THREE.Vector3(0, 0, M.dist);
    pos = from.lerp(hp.pos, e); up = new THREE.Vector3(0, 1, 0).lerp(hp.up, e).normalize(); look = new THREE.Vector3().lerp(hp.surf, e);
    if (VW > 980) M.camera.setViewOffset(VW, VH, -VW * M.off * (1 - e), -VH * 0.06 * (1 - e), VW, VH);
  } else { const st = storyPose(p), q = navPose(st); pos = q.pos; up = q.up; look = q.surf.clone().addScaledVector(q.up, st.d * 0.12); M.camera.clearViewOffset(); }
  M.camera.position.copy(pos); M.camera.up.copy(up); M.camera.lookAt(look);
  const dd = M.camera.position.distanceTo(look), nr = Math.max(2e-5, dd * 0.02); M.camera.near = nr; M.camera.far = dd * 30 + 3; M.camera.updateProjectionMatrix();
  // Earth, low over the horizon (chapter 3): true angular size, about 1.9 degrees
  const ea = storyEarth(), show = p > 2.4; ea.visible = show;
  if (show) { const st = storyPose(Math.min(3, p)), u = st.t.clone().normalize(), [e1, e2] = tangent(u), fwd = e1.multiplyScalar(Math.cos(st.head)).addScaledVector(e2, Math.sin(st.head)).normalize();
    const ed = fwd.multiplyScalar(Math.cos(rad(1.0))).addScaledVector(u, Math.sin(rad(1.0))).normalize(), D = Math.min(2, M.camera.far * 0.6); ea.position.copy(M.camera.position).addScaledVector(ed, D); ea.scale.setScalar(D * Math.tan(rad(0.95))); ea.lookAt(M.camera.position); }
  return true;
}
function leaveStory() { TERR.u.uGlobeMix.value = 0; if (STORY.dimmed) { STORY.dimmed = false; if (M.cap) applyTint(M.cap, 0); M.holed.material.color.setScalar(1); M.full.material.color.setScalar(1); TERR.u.uRim.value = 0; } STORY.p = STORY.to = 0; storyChapter(); if (M.earthS) M.earthS.visible = false; M.camera.clearViewOffset(); M.pivot.rotation.set(M.tilt, 0, 0); }
// a ring follows the pointer and grows over things you can press or drag
{
  const ring = document.createElement('div'); ring.className = 'cring'; ring.innerHTML = '<span></span>'; document.body.appendChild(ring);
  let x = -100, y = -100, rx = -100, ry = -100;
  addEventListener('pointermove', e => { x = e.clientX; y = e.clientY; const t = e.target, hot = t.closest && t.closest('button, a, input, select, .pin, label');
    ring.classList.toggle('hot', !!hot); ring.querySelector('span').textContent = !hot && t === canvas ? (S.screen === 'hero' ? 'scroll' : S.screen === 'results' || S.screen === 'explore' ? 'drag' : '') : ''; }, { passive: true });
  (function loop() { rx += (x - rx) * 0.22; ry += (y - ry) * 0.22; ring.style.transform = `translate(${rx}px, ${ry}px)`; requestAnimationFrame(loop); })();
}
function setLow() {
  if (GQ.low) return; GQ.low = true; renderer.setPixelRatio(1);
  for (const L of [M.sun, X.sun]) { L.shadow.mapSize.set(1024, 1024); if (L.shadow.map) { L.shadow.map.dispose(); L.shadow.map = null; } }
  if (M.cap) { // rebuild the polar terrain at half the vertices
    const vis = M.cap.visible, sh = M.cap.castShadow; M.moon.remove(M.cap); M.cap.geometry.dispose(); M.cap.material.dispose(); M.cap = null; buildCap();
    M.cap.visible = vis; M.cap.castShadow = M.cap.receiveShadow = sh; applyTint(M.cap, M.tint); if (M.midHole) capIndex(M.midHole); STORY.dimmed = false;
  }
  renderer.shadowMap.needsUpdate = true; GQ.dirty = true;
}
for (const ev of ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchmove']) addEventListener(ev, () => { GQ.activeUntil = performance.now() + 1200; }, { passive: true });
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); $('#gpuNote').classList.add('on'); });
canvas.addEventListener('webglcontextrestored', () => { $('#gpuNote').classList.remove('on'); setLow(); GQ.dirty = true; });
// where the headline ends and the legend starts, read from the page at most three times a second (reading layout every frame makes the browser stutter)
function layoutY() { const now = performance.now(); if (!layoutY.v || now - layoutY.t > 330) { layoutY.v = { a: $('.res-tools').getBoundingClientRect().bottom || 210, b: $('.map-key').getBoundingClientRect().top || VH - 130 }; layoutY.t = now; } return layoutY.v; }
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  // adapt: if frames are slow while drawing, switch to light graphics (fewer pixels, smaller shadow maps)
  if (GQ.drew && GQ.drewBefore) { GQ.times.push(dt); if (GQ.times.length > 90) GQ.times.shift(); if (!GQ.low && GQ.times.length === 90 && GQ.times.slice().sort((x, y) => x - y)[45] > 0.045) setLow(); }
  GQ.drewBefore = GQ.drew;
  const cam = scene === 'moon' ? M.camera : X.camera, sig = cam.matrixWorld.elements.join(',') + cam.projectionMatrix.elements[0];
  const heroSpin = scene === 'moon' && !M.map && !anim, lerping = (M.cap && Math.abs(M.tint - M.tintTo) > 0.002) || (M.map && M.lightTo && M.sun.position.distanceTo(M.lightTo.pos) > 1e-4);
  if (scene === 'moon' && M.map && !anim) navInertia(dt);
  const navMoving = (M.map && (NAV.vel || Object.keys(NAV.keys || {}).length)) || M.map && NAV.cur && (NAV.cur.t.angleTo(NAV.t) > 1e-6 || Math.abs(Math.log(NAV.cur.d / NAV.d)) > 1e-4 || Math.abs(((NAV.head - NAV.cur.head + Math.PI * 3) % (Math.PI * 2)) - Math.PI) > 1e-5 || Math.abs(NAV.cur.tiltU - NAV.tiltU) > 1e-5);
  const storyMoving = S.screen === 'hero' && (Math.abs(STORY.to - STORY.p) > 1e-4 || (STORY.p > 0.9 && !(GQ.skip2 = !GQ.skip2))); // the turning Sun redraws at half rate
  const busy = anim || S.playing || GQ.dirty || (S.screen === 'explore' && Object.values(X.walk).some(Boolean)) || storyMoving || (S.fit > 0 && S.screen === 'results') || now < GQ.activeUntil || lerping || navMoving || (heroSpin && !(GQ.skip = !GQ.skip)) || (X.ring && now - X.ringBorn < 1600) || sig !== GQ.sig;
  GQ.drew = !!busy;
  if (!busy) { requestAnimationFrame(frame); return; }
  GQ.dirty = false;
  if (anim) anim(now);
  renderer.clear();
  if (scene === 'moon') { const xp0 = $('#xPin'); if (xp0) xp0.style.display = 'none'; if (X.dpins) X.dpins.forEach(q => q.el.style.display = 'none');
    const k = 1 - Math.pow(0.12, dt);
    if (S.screen === 'hero' && !anim && !M.map && storyApply(dt)) { storyChapter(); }
    else if (!M.map && !anim) {
      M.tilt += (M.tiltTo - M.tilt) * k; M.dist += (M.distTo - M.dist) * k; M.off += (M.offTo - M.off) * k; M.spin += dt * 0.012;
      const kp = 1 - Math.pow(0.25, dt); M.px = (M.px || 0) + (M.mx * 0.05 - (M.px || 0)) * kp; M.py = (M.py || 0) + (M.my * 0.035 - (M.py || 0)) * kp;
      M.pivot.rotation.set(M.tilt + M.py, M.px, 0); M.moon.rotation.y = M.spin;
      M.camera.position.set(0, 0, M.dist); M.camera.lookAt(0, 0, 0);
      if (VW > 980) M.camera.setViewOffset(VW, VH, -VW * M.off, S.screen === 'hero' ? -VH * 0.06 : 0, VW, VH); else M.camera.clearViewOffset();
    } else if (M.map || anim) {
      // the options dock covers the lower part of the screen: centre the map in the space above it
      const dockOpen = VW > 980 && S.screen === 'results' && !$('#dock').classList.contains('closed'), wantX = (dockOpen ? 210 : 0) - (S.screen === 'results' && VW > 980 && document.querySelector('.ctlegend:not([hidden])') ? 150 : 0), wantY = S.screen === 'results' && VW > 980 ? VH / 2 - (layoutY().a + layoutY().b) / 2 : VH * 0.06; // centre the map in the free space between the headline and the legend
      M.offX = (M.offX ?? 0) + (wantX - (M.offX ?? 0)) * k; M.offY = (M.offY ?? 0) + (wantY - (M.offY ?? 0)) * k; M.camera.setViewOffset(VW, VH, M.offX, M.offY, VW, VH);
    }
    if (M.map && !anim) { navApply(dt); if (M.lightTo) { M.sun.position.lerp(M.lightTo.pos, 1 - Math.pow(0.02, dt)); M.hemi.intensity += (M.hemiTo - M.hemi.intensity) * (1 - Math.pow(0.02, dt)); } }
    if (M.cap && Math.abs(M.tint - M.tintTo) > 0.002) { M.tint += (M.tintTo - M.tint) * Math.min(1, dt * 3); setCapTint(M.tint); }
    if (TERR.photoTo != null && Math.abs(TERR.u.uPhoto.value - TERR.photoTo) > 0.002) { TERR.u.uPhoto.value += (TERR.photoTo - TERR.u.uPhoto.value) * Math.min(1, dt * 3); GQ.dirty = true; }
    M.stars.rotation.y = M.spin * 0.2;
    if (M.map && M.sun.castShadow && (lerping || NAV.fly)) renderer.shadowMap.needsUpdate = true;
    { const ex = M.map || (anim && S.screen === 'results') ? 1.38 : S.screen === 'hero' && STORY.p > 0.05 ? 1.25 : 1.15; M.expo = M.expo == null ? ex : M.expo + (ex - M.expo) * Math.min(1, dt * 2.5); if (Math.abs(ex - M.expo) > 0.002) GQ.dirty = true; renderer.toneMappingExposure = M.expo; } renderer.render(M.scene, M.camera); // exposure eases, never pops GQ.sig = M.camera.matrixWorld.elements.join(',') + M.camera.projectionMatrix.elements[0];
    const showPins = M.map && S.screen === 'results', dr = $('#dock').getBoundingClientRect(), cardLeft = showPins && VW > 980 && !$('#dock').classList.contains('closed') ? dr.left - 8 : VW, barTop = (r => r.height ? r.top : Math.min(VH, $('#dock').getBoundingClientRect().top) - 60)($('.whenbar').getBoundingClientRect()) - 6;
    const boxes = showPins ? ['.map-key', '.navctl', '.ctlegend:not([hidden])', '.ctl-chip:not([hidden])', '.res-head h2', '.res-head .lead', '.res-tools', '.tour.on', '#dockToggle'].map(s => document.querySelector(s)).filter(Boolean).map(e => { const r = e.getBoundingClientRect(); return [r.left - 6, r.top - 6, r.right + 6, r.bottom + 6]; }).filter(b => b[2] > b[0]) : [];
    for (const m of markers.slice().sort((a, b) => (a.top ? 0 : a.disc ? 1 : a.poi ? 3 : 2) - (b.top ? 0 : b.disc ? 1 : b.poi ? 3 : 2))) {
      if (!showPins) { m.el.style.display = 'none'; continue; }
      v3.copy(siteWorld(m.site)).project(M.camera); const px = (v3.x + 1) / 2 * VW, py = (1 - v3.y) / 2 * VH; m.el.__raw = [Math.round(px), Math.round(py)];
      let vis = v3.z < 1 && px > 0 && px < cardLeft && py > 80 && py < barTop - 40 && (!m.poi || S.showPlaces) && (!m.disc || S.showDiscover);
      let side = 'r';
      if (vis) { // labels never overlap: a recommended site tries its label on the right, then on the left, then shows its number alone; others step aside
        const w = (m.w ||= m.el.textContent.length * (m.top ? 9.5 : 7.4) + 30), hit = bx => bx[2] > cardLeft || boxes.some(b => bx[0] < b[2] && bx[2] > b[0] && bx[1] < b[3] && bx[3] > b[1]);
        const tries = m.top ? [['r', [px - 16, py - 15, px + w, py + 15]], ['l', [px - w, py - 15, px + 16, py + 15]], ['n', [px - 16, py - 15, px + 16, py + 15]]] : m.disc ? [['r', [px - 13, py - 13, px + 13, py + 13]]] : [['r', [px - 16, py - 15, px + w, py + 15]]];
        const ok = tries.find(([, bx]) => !hit(bx));
        if (ok) { side = ok[0]; boxes.push(ok[1]); } else if (m.top) { side = 'n'; boxes.push(tries[2][1]); } else vis = false;
      }
      m.el.style.display = vis ? '' : 'none';
      if (vis) { m.el.classList.toggle('flip', side === 'l'); m.el.classList.toggle('bare', side === 'n'); m.el.style.transform = `translate(${px}px, ${py}px)${side === 'l' ? ' translateX(-100%)' : ''}`; } m.el.__p = vis ? [px, py] : null;
    }
    // after flying to the overview: if a recommended site is out of the free area, step back and re-centre until all three show
    if (showPins && S.fit && !NAV.fly && NAV.cur && !NAV.vel && NAV.cur.t.angleTo(NAV.t) < 2e-3 && Math.abs(Math.log(NAV.cur.d / NAV.d)) < 0.05) {
      const lg = document.querySelector('.ctlegend:not([hidden])'), lgR = lg && VW > 980 ? lg.getBoundingClientRect() : null, tops = markers.filter(q => q.top && q.el.__raw), fx0 = lgR && lgR.width ? lgR.right + 20 : 20, fx1 = cardLeft - 40, fy0 = Math.max(110, ($('.res-tools').getBoundingClientRect().bottom || 200) + 20), fy1 = barTop - 50;
      const xs = tops.map(q => q.el.__raw[0]), ys = tops.map(q => q.el.__raw[1]), x0 = Math.min(...xs) - 30, x1 = Math.max(...xs) + 230, y0 = Math.min(...ys) - 20, y1 = Math.max(...ys) + 20;
      const fits = tops.length && x0 >= fx0 && x1 <= fx1 && y0 >= fy0 && y1 <= fy1;
      if (fits || !tops.length) S.fit = 0;
      else { // slide the group to the middle of the free area, and step back only if it is too big for it
        S.fit--; const need = Math.max((x1 - x0) / (fx1 - fx0), (y1 - y0) / (fy1 - fy0));
        panPix((fx0 + fx1) / 2 - (x0 + x1) / 2, ((y0 + y1) / 2 - (fy0 + fy1) / 2) * 1.3);
        if (need > 0.92) NAV.d = Math.min(D_MAX, NAV.d * Math.min(1.5, need * 1.1));
        NAV.fly = true; }
    }
    const pop = document.querySelector('.pop'); // the open card follows its pin while the map moves
    if (pop && pop.__anchor) { const q = pop.__anchor.__p; pop.style.visibility = q ? '' : 'hidden'; if (q) { pop.style.left = Math.max(8, Math.min(cardLeft - 310, q[0] - 14)) + 'px'; pop.style.top = Math.max(84, Math.min(barTop - pop.offsetHeight - 8, q[1] + 22)) + 'px'; } }
  } else {
    markers.forEach(m => m.el.style.display = 'none');
    if (S.playing && S.data) { const n = series().t.length - 1; S.t += dt * S.speed; if (S.t >= n) { S.t = n; setPlaying(false); } applyTime(); }
    if (S.view === 'fp' && !anim) walkStep(dt); else if (!anim && X.controls.enabled) { flyStep(dt); X.controls.update(); }
    if (X.site) {
      const st = sample(S.t), cp = X.camera.position, sd = dirFromAzEl(X.site, st.sunAz, st.sunEl), ed = dirFromAzEl(X.site, st.earthAz, st.earthEl);
      X.sunGlow.position.copy(cp).addScaledVector(sd, SKY_D); X.sunGlow.scale.setScalar(SKY_D * Math.tan(rad(0.27)) * 56); X.sunGlow.material.opacity = Math.max(0.15, st.frac);
      X.earth.position.copy(cp).addScaledVector(ed, SKY_D); X.earth.scale.setScalar(SKY_D * Math.tan(rad(0.95))); X.earth.visible = st.earthEl > -1.5;
      X.earth.quaternion.copy(earthQuat(toDate(series().t[0]).getTime() + S.t * 3600e3, ed)); // the face of Earth turned toward the Moon at this hour
      X.skySun.target.position.copy(X.earth.position); X.skySun.position.copy(X.earth.position).addScaledVector(sd, 10); // Earth's phase from the real Sun direction
      if (X.ring) { const age = (now - X.ringBorn) / 1000, grow = REDUCED ? 1 : Math.min(1, age / 1.2); X.ring.scale.set(0.2 + 0.8 * ease(grow), 1, 0.2 + 0.8 * ease(grow)); X.glow.scale.copy(X.ring.scale); X.glow.material.opacity = 0.22 + (1 - grow) * 0.5; }
    }
    renderer.toneMappingExposure = 1.36;
    { // depth range follows the distance: sharp close up, and the whole Moon from far away
      const dd = S.view === 'fp' ? 2 : X.camera.position.distanceTo(X.controls.target), nr = Math.max(0.25, Math.min(400, dd * 0.002)), fr = Math.max(400000, dd * 4 + 800000);
      if (Math.abs(X.camera.near / nr - 1) > 0.1 || Math.abs(X.camera.far / fr - 1) > 0.1) { X.camera.near = nr; X.camera.far = fr; X.camera.updateProjectionMatrix(); } }
    { const xp = $('#xPin'), far = S.view === 'region' || S.view === 'orbit'; // label the landing spot when it is too small to see
      if (xp && far && X.ring && S.screen === 'explore') { v3.set(0, localH(0, 0) + 2, 0).project(X.camera); const px = (v3.x + 1) / 2 * innerWidth, py = (1 - v3.y) / 2 * innerHeight; const ok = v3.z < 1 && px > 0 && px < (innerWidth > 980 ? innerWidth - 560 : innerWidth - 120) && py > 0 && py < innerHeight; xp.style.display = ok ? '' : 'none'; if (ok) xp.style.transform = `translate(${px}px, ${py}px)`; }
      else if (xp) xp.style.display = 'none';
      // Discover nearby: ice-bearing dark areas, named places, other candidate sites and the Discover finds around this site
      if (X.site) { if (X.dpinsSid !== X.sid) buildNearby();
        const near = S.view === 'fp' || S.view === 'drone', ui = ['#optTabs', '#views', '#infoBtn', '#infoBox', '#status', '.look'].map(q => document.querySelector(q)).filter(e => e && !e.hidden).map(e => e.getBoundingClientRect()).filter(r => r.width);
        { const dc = $('#distChip'), P = S.view === 'fp' ? X.camera.position : X.controls.target, d = Math.hypot(P.x, P.z); // how far you have moved from the landing point
          dc.textContent = d > 30 && S.screen === 'explore' ? `${d < 1000 ? Math.round(d / 10) * 10 + ' m' : fmt(d / 1000, 1) + ' km'} from the landing site` : ''; }
        let rayBudget = 0; const placed = []; for (const q of X.dpins || []) { let ok = S.showDiscover && S.screen === 'explore';
          if (ok) { const dx = q.x_m - X.site.x_m, dy = q.y_m - X.site.y_m, inSite = Math.abs(dx) < X.half - 20 && Math.abs(dy) < X.half - 20;
            if (q.gy == null && !inSite && !rayBudget) { rayBudget = 1; const t0 = performance.now(), h = groundY(dx, -dy); X.rayMs = (X.rayMs || 0) + performance.now() - t0; if (h != null) q.gy = h; else if (++q.tries > 40) q.gy = false; } // outside the 10 m site: the exact height of the terrain that is drawn (one look-up per frame)
            const gh = typeof q.gy === 'number' ? q.gy : inSite ? localH(dx, -dy) : regionH(q.x_m, q.y_m) - X.h0 - (dx * dx + dy * dy) / (2 * R_MOON);
            const D = X.camera.position.distanceTo(v3.set(dx, gh, -dy)), rr = Math.min(700, Math.max(1.2, D * 0.011)); let H = Math.min(4000, Math.max(near ? 10 : 30, D * 0.07)), px, py;
            for (let tryN = 0; tryN < 3; tryN++) { // icons that would overlap stand on taller poles, so each stays readable and tied to its own spot
              v3.set(dx, gh + H, -dy).project(X.camera); px = (v3.x + 1) / 2 * innerWidth; py = (1 - v3.y) / 2 * innerHeight;
              if (!placed.some(([a, b]) => Math.abs(a - px) < 32 && Math.abs(b - py) < 32)) break; H *= 1.7; }
            placed.push([px, py]);
            q.g3.position.set(dx, gh + rr * 0.15, -dy); q.g3.children[0].scale.set(1, H, 1); q.g3.getObjectByName('ring').scale.setScalar(rr); q.g3.getObjectByName('dot').scale.setScalar(rr);
            q.el.style.setProperty('--stem', '0px');
            const front = v3.z < 1; q.g3.visible = front;
            ok = front && px > 10 && px < (innerWidth > 980 ? innerWidth - 450 : innerWidth - 10) && py > 70 && !ui.some(r => px > r.left - 16 && px < r.right + 16 && py > r.top - 16 && py < r.bottom + 16) && py < innerHeight - (innerWidth > 980 ? 110 : innerHeight * 0.4 + 90); if (ok) q.el.style.transform = `translate(${px}px, ${py - 29}px)`; }
          else q.g3.visible = false;
          q.el.style.display = ok ? '' : 'none'; } } }
    renderer.render(X.sky, X.camera); renderer.clearDepth(); renderer.render(X.scene, X.camera); GQ.sig = X.camera.matrixWorld.elements.join(',') + X.camera.projectionMatrix.elements[0];
  }
  requestAnimationFrame(frame);
}
function setPlaying(p) { S.playing = p; $('#play').textContent = p ? '❚❚' : '▶'; $('#play').setAttribute('aria-label', p ? 'Pause' : 'Play'); }

/* ================= wiring ================= */
document.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b && !b.closest('#panel')) go(b.dataset.go); });
// moving between steps: browser back and forward (and the phone's back swipe), a back button on phones, and a quick two-finger swipe on a touchpad
try { history.replaceState({ s: 'hero' }, '', location.pathname + location.search); } catch (e) {}
function stepTo(name, fromHistory) { if (name === 'explore') { if (S.data) { S.navHist = !!fromHistory; S.navHistExplore = true; openExplore(S.opt || 0); } } else go(name, fromHistory); }
function stepNav(dir) { const i = ORDER.indexOf(S.screen); let j = i + dir; if (j < 0 || j >= ORDER.length) return; if (!S.data && ORDER[j] !== 'hero' && ORDER[j] !== 'who' && ORDER[j] !== 'mission') return; if (ORDER[j] === 'mission' && !S.role) return; stepTo(ORDER[j]); }
addEventListener('popstate', e => { const n = e.state && e.state.s; if (n && n !== S.screen) stepTo(n, true); });
$('#backBtn').onclick = () => stepNav(-1);
{ let acc = 0, last = 0, cool = 0; const cue = $('#swipeCue');
  addEventListener('wheel', e => {
    if (e.ctrlKey || Math.abs(e.deltaX) < Math.abs(e.deltaY) * 1.6 || S.screen === 'hero') return;
    if (e.target.closest && e.target.closest('.cmp, .tabs, .cards, .panel, .mgrid, .how, input')) return;
    e.preventDefault(); const now = performance.now(); if (now - last > 400) acc = 0; last = now; if (now < cool) return;
    acc += e.deltaX; const k = Math.min(1, Math.abs(acc) / 120); cue.className = 'swipecue on ' + (acc < 0 ? 'l' : 'r'); cue.style.setProperty('--k', k); clearTimeout(cue.h); cue.h = setTimeout(() => cue.className = 'swipecue', 300);
    if (Math.abs(acc) > 120) { cool = now + 900; const d = acc < 0 ? -1 : 1; acc = 0; stepNav(d); }
  }, { passive: false }); }
$$('#progress li').forEach(li => li.onclick = () => { if (li.classList.contains('reach')) { if (li.dataset.step === 'explore') openExplore(S.opt); else go(li.dataset.step); } });
$('#back').onclick = () => {
  if (S.screen === 'mission' && S.role !== 'past' && S.role !== 'student' && S.q > 0) { S.q--; renderQuestion(); return; }
  if (S.screen === 'mission' && S.role === 'project' && S.doc && S.q === 0) { S.q = -1; renderMission(); return; }
  if (S.screen === 'mission' && S.role === 'project' && S.doc) { S.doc = null; renderMission(); return; }
  go(ORDER[Math.max(0, ORDER.indexOf(S.screen) - 1)]);
};
$('#openCal').onclick = () => openCalendar();
$('#placesT').onclick = () => { S.showPlaces = !S.showPlaces; $('#placesT').setAttribute('aria-pressed', S.showPlaces); };
const toast = (msg, ms = 4200) => { const t = $('#edgeToast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), ms); };
$('#discX').onclick = () => { S.showDiscover = !S.showDiscover; $('#discT').setAttribute('aria-pressed', S.showDiscover); $('#discX').setAttribute('aria-pressed', S.showDiscover); $('#discT').classList.remove('invite'); if (S.showDiscover && X.site) { if (X.dpinsSid !== X.sid) buildNearby(); const n = (X.dpins || []).length; toast(n ? `${n} things around this site: ice-bearing dark areas, places and other sites. Click an icon to fly there.` : 'Nothing mapped within 20 km of this site.', 5200); } if (!S.showDiscover) $$('.pop.dcard').forEach(x => x.remove()); GQ.dirty = true; };
$('#tutBtn').onclick = () => tutorial();
{ // phones: the 3D details are a sheet you pull up
  const h = document.createElement('button'); h.id = 'sheetBtn'; h.className = 'sheetbtn'; h.textContent = '▲ Details'; document.querySelector('#explore').appendChild(h);
  h.onclick = () => { const open = document.body.classList.toggle('sheet-open'); h.textContent = open ? '▼ Back to the scene' : '▲ Details'; GQ.dirty = true; }; }
$('#panelHide').onclick = () => { const off = document.body.classList.toggle('panel-off'); $('#panelHide').textContent = off ? '‹ Show details' : 'Hide details ›'; $('#panelHide').setAttribute('aria-expanded', !off); GQ.dirty = true; };
$('#infoBtn').onclick = () => { const b = $('#infoBox'), open = b.hidden; b.hidden = !open; $('#infoBtn').setAttribute('aria-expanded', open); };
{ // game-style arrows for phones and tablets: hold to move, same keys as the keyboard
  const touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0; document.body.classList.toggle('touch', touch);
  const target = () => S.screen === 'explore' ? X.walk : (NAV.keys ||= {});
  $$('#vpad button').forEach(b => { const k = b.dataset.k, on = e => { e.preventDefault(); target()[k] = true; GQ.dirty = true; GQ.activeUntil = performance.now() + 400; b.classList.add('down'); }, off = () => { delete NAV.keys[k]; X.walk[k] = false; b.classList.remove('down'); };
    b.addEventListener('pointerdown', on); for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, off); b.addEventListener('contextmenu', e => e.preventDefault()); }); }
{ // the controls legend on the map: open the first time, then as the person left it
  const setL = open => { $('#ctLegend').hidden = !open; $('#ctlChip').hidden = open; try { localStorage.setItem('lss_legend', open ? '1' : '0'); } catch (e) {} GQ.dirty = true; };
  let open = true; try { open = localStorage.getItem('lss_legend') !== '0'; } catch (e) {} setL(open);
  $('#ctlToggle').onclick = () => setL(false); $('#ctlChip').onclick = () => setL(true); $('#ctlShow').onclick = () => tutorial(); $('#ctlHome').onclick = () => $('#compass').click(); }
$('#discP').onclick = () => $('#discT').click();
$('#discT').onclick = () => { S.showDiscover = !S.showDiscover; $('#discT').setAttribute('aria-pressed', S.showDiscover); $('#discP').setAttribute('aria-pressed', S.showDiscover); $('#discX').setAttribute('aria-pressed', S.showDiscover); $('#discT').classList.remove('invite');
  if (S.showDiscover && S.discover) toast(`${S.discover.items.length} places to discover: water, hazards and history. Fly around and click a glowing icon.`, 5200); if (!S.showDiscover) $$('.pop.dcard').forEach(x => x.remove()); GQ.dirty = true; };
$('#closeCal').onclick = () => $('#calendar').classList.remove('open');
const CTX = () => ({ YOU: youInputs(), DOD, COST, PRICES, priceNow, costDark, battKg, valueLost, lostHours, BATT_WH_PER_KG, MISSIONS, VEXPERT, vx, verdictOf });
// everything the person told the app or changed on screen, so the report and workbook can say exactly what they were built from
function youInputs() {
  const role = { project: 'Mission team, with a mission document', planner: 'Mission planner, answering questions', past: 'Looking at real missions', student: 'Student or curious' }[S.role] || S.role || '-';
  const rows = [['Who you said you are', role]];
  const pre = MISSIONS.find(m => m.id === S.mission);
  rows.push(['Mission analysed', pre ? `${pre.name} (public mission data)` : S.doc ? `Your mission, from your document${S.docName ? ` "${S.docName}"` : ''} and your answers` : 'Your mission, from your answers (quick check)']);
  if (S.doc && S.doc.fields) for (const [k, f] of Object.entries(S.doc.fields)) if (f && f.v != null) rows.push([`Read from your document: ${k}`, `${Array.isArray(f.v) ? f.v.join(' to ') : f.v}${f.src ? ` (${f.src})` : ''}`]);
  if (S.data && S.data.profile) { const n = { earliestUtc: 'Earliest landing', slipDays: 'Latest landing, days after', durationDays: 'Days on the surface', continuousSun: 'Needs sunlight all the time', earthAtLanding: 'Must talk to Earth while landing', loadW: 'Power use (W)', batteryWh: 'Battery (Wh)', mast: 'Panels on a 10 m mast' };
    for (const [k, v] of Object.entries(S.data.profile)) if (n[k] && v != null) rows.push([`Your answer: ${n[k]}`, v === true ? 'Yes' : v === false ? 'No' : String(v).replace('T00:00:00Z', '')]); }
  rows.push(['Power kept on during darkness', `${fmt(COST.loadW)} W${S.data && S.data.costLoadGiven ? ' (from the mission)' : ' (example: the mission did not say)'}`]);
  rows.push(['Delivery price shown on screen', priceNow().label]);
  rows.push(['Mission price', usd(COST.missionUsd)]);
  const m = S.when && S.whenIdx != null && S.when[S.data.options[0].site] && S.when[S.data.options[0].site][S.whenIdx];
  rows.push(['Date picked on the slider', m ? `${dateTime(m.utc)} (this report keeps each site at its best date)` : 'none: each site at its best date']);
  if (S.hw && S.hw !== 'none') rows.push(['Solar panel option tried in 3D', { mast_10m: '10 m mast', tracking_panels: 'panels that follow the Sun' }[S.hw] || S.hw]);
  rows.push(['View', S.mode === 'expert' ? 'Expert' : 'Simple']);
  return rows;
}
const busy = async (btn, job) => { const t = btn.textContent; btn.disabled = true; btn.textContent = 'Preparing…'; try { await job(); } catch (e) { toast(`Could not build the file: ${e.message}`); } finally { btn.disabled = false; btn.textContent = t; } };
$('#pdf').onclick = e => busy(e.currentTarget, () => exportPDF(S, CTX()));
$('#xlsx').onclick = e => busy(e.currentTarget, () => exportXLSX(S, CTX()));
$('#play').onclick = () => { if (S.t >= series().t.length - 1) S.t = 0; setPlaying(!S.playing); };
$('#scrub').oninput = e => { S.t = +e.target.value; applyTime(); };
$$('#speed button').forEach(b => b.onclick = () => { S.speed = +b.dataset.s; $$('#speed button').forEach(x => x.setAttribute('aria-pressed', x === b)); });
$$('#views button').forEach(b => b.onclick = () => setView(b.dataset.view));
addEventListener('keydown', e => { if (e.key === 'Escape') $('#calendar').classList.remove('open'); if (e.key === ' ' && S.screen === 'explore' && e.target === document.body) { e.preventDefault(); $('#play').click(); } });

async function openHow() {
  const v = S.validation || (S.validation = await getJSON('validation_report.json').catch(() => null)), el = $('#how');
  const A = v && v.A_horizons, C = v && v.C_published && v.C_published[0], T = v && v.D_unit_tests && v.D_unit_tests.tests;
  el.querySelector('.how-body').innerHTML = `
    <section><h3>What we calculate</h3><p>For every hour from November 2026 to the end of 2032, at 11 candidate sites near the south pole: whether more than half of the Sun is above the real horizon, whether Earth is above the horizon while a NASA Deep Space Network dish can see the Moon, and from that the hours of sunlight, the longest darkness, the contact with Earth, the battery and solar array a mission needs, the slope of the landing area and the distance to permanently shadowed areas that can hold ice.</p></section>
    <section><h3>The data</h3><ul><li>Terrain: NASA LOLA digital elevation models, 5 m at the sites, 10 m and 80 m around them, out to 300 km for the horizon.</li><li>Sun and Earth positions: JPL DE421 planetary ephemeris and the Moon's orientation, through Skyfield.</li><li>Ground stations: the three NASA Deep Space Network complexes.</li><li>Ice: NASA LOLA catalogue of permanently shadowed regions. Average sunlight shading on the map: NASA LOLA illumination map.</li><li>Imagery: NASA Lunar Reconnaissance Orbiter camera, LROC WAC south pole mosaic at 100 m, draped on the LOLA terrain.</li><li>Place names: IAU Gazetteer of Planetary Nomenclature.</li></ul></section>
    <section><h3>How accurate it is</h3><div class="how-nums">
      <div><b>${A ? A.max_el_err_deg.toExponential(1) + '°' : '–'}</b><span>largest difference from NASA JPL Horizons for Sun and Earth positions, over ${A ? A.comparisons : '–'} checks</span></div>
      <div><b>${C ? C.ours_illumination + '%' : '–'}</b><span>sunlight we compute at the Connecting ridge; the ESA lander study reports 85.7% for the same point</span></div>
      <div><b>±8</b><span>percentage points: agreement with NASA's own sunlight maps on the same 80 m terrain, with no systematic bias</span></div>
      <div><b>${T ? Object.values(T).filter(Boolean).length + ' of ' + Object.keys(T).length : '–'}</b><span>automatic tests of the geometry, power and battery models pass</span></div></div>
      <p>On the sharper 5 m terrain our sunlight is lower than NASA's maps, because small hills block the grazing Sun. We keep the sharper terrain: it errs on the safe side.</p></section>
    <section><h3>How we handle what we do not know</h3><p>Every verdict holds for the worst point of the landing area, for every lander orientation when yours is unknown, and on six NASA versions of the terrain. When you do not give a value, we do not guess it: we tell you what you would need. Costs are scenarios built only from public prices, with their sources.</p></section>
    <section><h3>What we do not check</h3><p>Rocks smaller than the terrain grid, the approach trajectory, a full thermal model and other landers nearby. A mission team should confirm the chosen spot with 1 m imagery hazard maps.</p></section>
    <section><h3>Moving around</h3><p>As on Google Earth: drag to move, scroll or pinch to zoom, double-click to dive in, right-drag or Shift-drag to turn and tilt. The arrow keys (or W A S D) fly in any direction, Q and E turn, in the map and in every 3D view. On a phone, use the on-screen arrows. The compass brings north up and all three sites back into view. Discover shows water, hazards and history near the pole, each with its source.</p></section>
    <section><h3>What comes next</h3><p>Today you can explore the south polar region, out to about 81°S, where every landing planned for the next years is headed. Next: the rest of the Moon and the north pole, local installation so mission data never leaves the customer, and a full thermal model.</p></section>`;
  el.classList.add('on');
}
$('#helpBtn').onclick = () => { const h = $('#maphint'); h.classList.add('on'); setTimeout(() => h.classList.remove('on'), 5000); };
$('#howBtn').onclick = openHow; $('#howClose').onclick = () => $('#how').classList.remove('on');
window.__lss = { M, NAV, GQ, X, S, STORY, TERR, renderer }; // for automated checks
if (/[?&]debug/.test(location.search)) { // diagnostics for testing on other computers: add ?debug to the address
  const el = $('#dbg'); el.hidden = false; let frames = 0, lastEv = '-', gpu = '?';
  try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch (e) {}
  for (const ev of ['pointerdown', 'pointermove', 'wheel', 'keydown']) addEventListener(ev, e => { const t = e.target; lastEv = `${ev} on ${t.tagName.toLowerCase()}${t.id ? '#' + t.id : ''}${t.className && typeof t.className === 'string' ? '.' + t.className.split(' ')[0] : ''}`; }, { capture: true, passive: true });
  const r0 = renderer.render.bind(renderer); renderer.render = (...a) => { frames++; return r0(...a); };
  setInterval(() => { el.textContent = `GPU: ${gpu}\nframes/s: ${frames * 2}  light graphics: ${GQ.low}  pixel ratio: ${renderer.getPixelRatio()}\nscreen: ${S.screen}  map: ${!!M.map}  animating: ${!!anim}  zoom: ${NAV.cur ? NAV.cur.d.toFixed(4) : '-'}\nlast input: ${lastEv}`; frames = 0; }, 500);
}
(async function init() {
  setMode('simple'); resize(); requestAnimationFrame(frame); storyChapter();
  $$('.screen').forEach(s => s.classList.toggle('on', s.id === 'hero'));
  try {
    [S.index, S.info, S.psr, S.upcoming, S.places] = await Promise.all([getJSON('index.json'), getJSON('terrain/terrain.json'), getJSON('psr.json'), getJSON('upcoming.json').catch(() => null), getJSON('places.json').catch(() => null)]); S.discover = await getJSON('discover.json').catch(() => null);
    const lp = $('#loadBar'); lp.classList.add('on');
    const w16 = S.info.web16 && S.info.web16.region;
    const [r, rs] = await Promise.all([getBufProgress('terrain/' + (w16 ? w16.file : S.info.region.file), f => { lp.querySelector('i').style.width = Math.round(f * 100) + '%'; }), getBuf('terrain/' + S.info.region_sun.file)]);
    lp.classList.remove('on');
    S.region = w16 ? dec16(r, w16) : new Float32Array(r); S.regionSun = new Uint8Array(rs);
    setTimeout(() => { buildCap(); idle(prewarm); }, 300); // ready before the first flight to the pole, with its shaders compiled and textures on the GPU
  } catch (e) { $('.story .ch[data-i="0"] p').textContent = `${e.message}. Open the app from a web server, not as a local file.`; }
})();
