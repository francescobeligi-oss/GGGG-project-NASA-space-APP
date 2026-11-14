// Quick check in the browser and document reading.
// Quick check: same rules as the Python engine (src/engine.py, assess + _verdict) applied to the centre point
// of each site on the hourly web data. It does not cover the landing area, lander orientation or terrain error.

const D = 'web-data/';
const COLS = 9; // sun_az, sun_el, earth_az, earth_el, sun_frac_2m, earth_margin_2m, sun_frac_10m, earth_margin_10m, dsn_any

async function rows(site, i0, i1) {
  const url = `${D}${site.id}.bin`, a = i0 * COLS * 4, b = i1 * COLS * 4 - 1;
  let r = await fetch(url, { headers: { Range: `bytes=${a}-${b}` } });
  if (r.status === 206) return new Float32Array(await r.arrayBuffer());
  const all = new Float32Array(await r.arrayBuffer()); // server ignored the range request
  return all.slice(i0 * COLS, i1 * COLS);
}
const runs = m => { const out = []; let n = 0; for (const x of m) { if (x) n++; else if (n) { out.push(n); n = 0; } } if (n) out.push(n); return out; };

function assess(R, k, n, p) {
  const hi = p.mast ? 6 : 4, ei = p.mast ? 7 : 5;
  const sunlit = new Uint8Array(n), earth = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const o = (k + i) * COLS; sunlit[i] = R[o + hi] > 0.5; earth[i] = R[o + ei] > 0 && R[o + 8] > 0.5; }
  const dark = runs([...sunlit].map(x => !x)), gaps = runs([...earth].map(x => !x));
  const sunPct = 100 * sunlit.reduce((a, b) => a + b, 0) / n, contactPct = 100 * earth.reduce((a, b) => a + b, 0) / n;
  const longestDark = dark.length ? Math.max(...dark) : 0, longestGap = gaps.length ? Math.max(...gaps) : 0;
  const red = [], yel = [], pw = {};
  if (!sunlit[0]) red.push('Sun hidden by terrain at landing');
  if (p.earthAtLanding && !earth[0]) red.push('No Earth contact during landing');
  if (p.continuousSun && longestDark > 0) red.push(`Not continuously sunlit (dark for ${longestDark} h)`);
  if (p.loadW) {
    pw.battery_needed_wh = longestDark * p.loadW / 0.8; // energy for the longest night at 80% depth of discharge
    if (p.batteryWh != null && p.batteryWh < pw.battery_needed_wh) red.push(`Battery too small for the longest darkness (needs ${Math.round(pw.battery_needed_wh)} Wh)`);
  } else if (longestDark > 0) yel.push(`No power data given: the battery must cover up to ${longestDark} h of darkness`);
  if (p.dte && contactPct < 30) yel.push(`Earth contact only ${Math.round(contactPct)}% of the time`);
  const verdict = red.length ? 'red' : yel.length ? 'yellow' : 'green';
  const order = { green: 0, yellow: 1, red: 2 };
  return { sunPct, contactPct, longestDark, longestGap, verdict, reasons: [...red, ...yel], pw, score: 100 - 50 * order[verdict] + 0.3 * sunPct + 0.2 * contactPct,
    hoursToSunset: sunlit.indexOf(0) < 0 ? n : sunlit.indexOf(0), sunlit, earth };
}

export async function quickCheck(p, index, siteMeta, onProgress) {
  // p: { earliestUtc, slipDays, durationDays, mast, continuousSun, earthAtLanding, loadW, batteryWh, dte }
  const step = 6, n = Math.round(p.durationDays * 24);
  const sites = index.sites, out = [], calendar = { columns: ['landing_utc', 'verdict', 'worst_case_verdict', 'score'], step_hours: step, sites: {} }, windows = {};
  let done = 0;
  await Promise.all(sites.map(async s => {
    const meta = siteMeta[s.id], t0 = meta.time.start_unix, count = meta.time.count;
    const k0 = Math.ceil((Date.parse(p.earliestUtc) / 1000 - t0) / 3600), k1 = k0 + Math.round(p.slipDays * 24);
    if (k0 < 0 || k1 + n > count) throw new Error('Pick a landing between Nov 2026 and the end of 2032.');
    const R = await rows(s, k0, k1 + n);
    let best = null; calendar.sites[s.id] = [];
    for (let k = 0; k <= k1 - k0; k += step) {
      const a = assess(R, k, n, p), utc = new Date((t0 + (k0 + k) * 3600) * 1000).toISOString().slice(0, 16) + 'Z';
      calendar.sites[s.id].push([utc, a.verdict, a.verdict, +a.score.toFixed(1)]);
      if (!best || a.score > best.a.score) best = { a, k, utc };
    }
    // landing windows: runs of green or yellow
    const w = []; let open = null;
    for (const row of calendar.sites[s.id]) { if (row[1] !== 'red') { if (!open) open = { site: s.name, open: row[0] }; open.close = row[0]; } else if (open) { w.push(open); open = null; } }
    if (open) w.push(open); windows[s.id] = w;
    // hourly series for the best landing time
    const series = { t: [], sun_el: [], sun_az: [], earth_el: [], earth_az: [], sun_frac_worst_median_best: [[], [], []], earth_contact: [], power_w: null, battery_soc: null };
    const hi = p.mast ? 6 : 4;
    for (let i = 0; i < n; i++) {
      const o = (best.k + i) * COLS;
      series.t.push(new Date((t0 + (k0 + best.k + i) * 3600) * 1000).toISOString().slice(0, 16) + 'Z');
      series.sun_az.push(R[o]); series.sun_el.push(R[o + 1]); series.earth_az.push(R[o + 2]); series.earth_el.push(R[o + 3]);
      for (let b = 0; b < 3; b++) series.sun_frac_worst_median_best[b].push(R[o + hi]);
      series.earth_contact.push(best.a.earth[i]);
    }
    const a = best.a, o0 = best.k * COLS;
    out.push({ site: s.id, site_name: s.name, landing_utc: best.utc, duration_h: n, quick: true, score: a.score,
      landing: { sun_elevation_deg: R[o0 + 1], sun_azimuth_deg: R[o0], sun_visible: !!a.sunlit[0], earth_visible: !!a.earth[0], earth_elevation_deg: R[o0 + 3] },
      light: { sun_pct: a.sunPct, longest_dark_h: a.longestDark, hours_to_sunset: a.hoursToSunset },
      comms: { contact_pct: a.contactPct, longest_gap_h: a.longestGap },
      power: a.pw, verdict: a.verdict, worst_case_verdict: a.verdict, reasons: a.reasons, series_hourly: series,
      ranges: { sun_pct: [a.sunPct, a.sunPct], longest_dark_h: [a.longestDark, a.longestDark], contact_pct: [a.contactPct, a.contactPct], battery_needed_wh: a.pw.battery_needed_wh != null ? [a.pw.battery_needed_wh, a.pw.battery_needed_wh] : null } });
    onProgress && onProgress(++done / sites.length);
  }));
  out.sort((x, y) => y.score - x.score || x.landing_utc.localeCompare(y.landing_utc));
  return {
    mission: 'custom', quick: true, options: out.slice(0, 3), landing_windows: windows, calendar,
    trust_badge: 'Quick check at the centre of each site, hourly, from validated NASA LOLA terrain and JPL ephemeris data',
    not_evaluated: ['the whole landing area (only its centre is checked here)', 'unknown lander orientation', 'terrain error (NASA terrain versions)', 'slope and rocks', 'panel size and battery charging in detail'],
    assumptions: ['Sunlit when more than half of the solar disc is above the terrain', 'Earth contact needs Earth above the terrain and a NASA Deep Space Network dish that sees the Moon',
      p.loadW ? 'Battery need = longest darkness x power use / 0.8 (80% usable charge), panels assumed to recharge in sunlight' : 'No power use given'],
    data_sources: ['NASA GSFC LOLA site and polar DEMs (horizons up to 300 km)', 'JPL DE421 ephemeris via Skyfield, validated against JPL Horizons', 'NASA DSN station locations'],
  };
}

/* ---------- reading a mission document (same rules as intake/extract.py) ---------- */
const NUM = String.raw`(\d{1,3}(?:,\d{3})*(?:\.\d+)?)`;
const RULES = [
  ['duration_days', String.raw`(?:surface operations? duration|mission duration|operate)[^\n]{0,40}?(?:up to )?${NUM}\s*(?:earth )?days`],
  ['_capacity_kg', String.raw`(?:payload (?:delivery )?capacity|payload mass)[^\n]{0,30}?${NUM}\s*kg`],
  ['_w_per_kg', String.raw`${NUM}\s*W(?:atts)?\b[^\n]{0,40}(?:per kilogram|/kg|per kg)|(?:per kilogram|/kg)[^\n]{0,60}?${NUM}\s*W(?:atts)?\b|${NUM}\s*Watts\s+${NUM}\s*kbps`],
  ['_ellipse_m', String.raw`${NUM}\s*m\s*x\s*${NUM}\s*m\s*ellipse`],
  ['max_slope_deg', String.raw`slope\s*(?:of\s*)?(?:≤|<=|less than|below|under)\s*${NUM}\s*°`],
  ['battery_wh', String.raw`${NUM}\s*Wh\b`],
  ['_band', String.raw`\b(X-Band|S-Band|Ka-Band)\b`],
];
export async function readDocument(file) {
  const pdfjs = await import('./vendor/pdf.min.mjs'); // pdf.js 4.0.379 (Apache-2.0), served with the site
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    pages.push(c.items.map(it => it.str + (it.hasEOL ? '\n' : ' ')).join('').replace(/[ \t]+/g, ' '));
  }
  return extract(pages);
}
export function extract(pages) {
  const cand = {};
  pages.forEach((p, i) => {
    for (const [key, rx] of RULES) for (const m of p.matchAll(new RegExp(rx, 'gi'))) {
      const g = m.slice(1).filter(x => x != null), num = x => parseFloat(x.replace(/,/g, ''));
      const v = key === '_ellipse_m' ? [num(g[0]), num(g[1])] : key === '_band' ? g[0] : num(g[0]);
      const quote = p.slice(Math.max(0, m.index - 20), m.index + m[0].length + 10).replace(/\s+/g, ' ').trim().slice(0, 110);
      (cand[key] = cand[key] || []).push({ v, page: i + 1, quote });
    }
  });
  const found = {};
  for (const [k, cs] of Object.entries(cand)) {
    const vals = new Set(cs.map(c => JSON.stringify(c.v)));
    found[k] = vals.size === 1 ? { v: cs[0].v, src: `page ${cs[0].page}: "${cs[0].quote}"` } : { v: null, conflict: cs.slice(0, 4).map(c => ({ v: c.v, page: c.page })) };
  }
  const out = { pages: pages.length, fields: {} };
  if (found.duration_days) out.fields.durationDays = found.duration_days;
  if (found.battery_wh) out.fields.batteryWh = found.battery_wh;
  if (found._capacity_kg && found._w_per_kg && found._capacity_kg.v != null && found._w_per_kg.v != null)
    out.fields.loadW = { v: found._capacity_kg.v * found._w_per_kg.v, src: `${found._w_per_kg.v} W per kg x ${found._capacity_kg.v} kg of payload` };
  if (found._band) out.fields.dte = { v: true, src: found._band.src + ' (direct link with Earth)' };
  if (found.max_slope_deg) out.fields.maxSlope = found.max_slope_deg;
  if (found._ellipse_m && found._ellipse_m.v) out.fields.ellipseM = { v: Math.min(...found._ellipse_m.v) / 2, src: found._ellipse_m.src + ', radius = half the short side' };
  return out;
}
