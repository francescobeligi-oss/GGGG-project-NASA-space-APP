// Report (PDF) and workbook (Excel), built in the browser from the same analysis the app shows.
// Both read one model (model()) so every number in the PDF matches the workbook and the screen.
const load = src => new Promise((res, rej) => { if (document.querySelector(`script[src="${src}"]`)) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s); });
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const toDate = s => new Date(/Z|\+/.test(s) ? s : s + 'Z');
const dt = s => { const d = toDate(s); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`; };
const day = s => { const d = toDate(s); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const iso = s => toDate(s).toISOString().slice(0, 16).replace('T', ' ');
const f = (x, d = 0) => x == null || !isFinite(x) ? '-' : Number(x).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const usd = x => x == null || !isFinite(x) ? '-' : x >= 1e9 ? '$' + f(x / 1e9, 2) + 'B' : x >= 1e6 ? '$' + f(x / 1e6, x >= 1e8 ? 0 : 1) + 'M' : x >= 1e3 ? '$' + f(x / 1e3) + 'k' : '$' + f(x);
const lvl = e => e == null ? '-' : `${f(Math.abs(e), 1)} deg ${e >= 0 ? 'above' : 'below'} level`;
const hrs = h => h == null ? '-' : h >= 48 ? `${f(h / 24, 1)} days (${f(h)} h)` : `${f(h, h % 1 ? 1 : 0)} h`;
const VW = { green: 'Go', yellow: 'Go with caveats', red: 'No go' };
const ORD = { green: 0, yellow: 1, red: 2 };
const file = (S, ext) => `lunar-site-scout_${S.mission}_${new Date().toISOString().slice(0, 10)}.${ext}`;
const SRC = {
  lola: ['NASA LOLA terrain models (Goddard Planetary Geodesy Data Archive)', 'https://pgda.gsfc.nasa.gov/'],
  horizons: ['JPL Horizons ephemeris service (used to check our Sun and Earth positions)', 'https://ssd.jpl.nasa.gov/horizons/'],
  de421: ['JPL DE421 planetary ephemeris (NAIF generic kernels)', 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/'],
  skyfield: ['Skyfield astronomy library', 'https://rhodesmill.org/skyfield/'],
  dsn: ['NASA Deep Space Network', 'https://deepspace.jpl.nasa.gov/'],
  soa: ['NASA Small Spacecraft Technology State of the Art (power chapter, Li-ion cells up to 265 Wh/kg)', 'https://www.nasa.gov/smallsat-institute/sst-soa/'],
  lroc: ['LROC Wide Angle Camera south pole mosaic', 'https://www.lroc.asu.edu/images/1401'],
};

/* ================= one model for both outputs ================= */
export function model(S, C) {
  const d = S.data, quick = !!d.quick, L = C.COST.loadW, DOD = C.DOD || 0.8, WHKG = C.BATT_WH_PER_KG;
  const name = id => ((S.index && S.index.sites.find(s => s.id === id)) || {}).name || id;
  const P = {};
  if (d.provenance) d.provenance.forEach(r => P[r.field] = r.value);
  else if (d.profile) { const p = d.profile; Object.assign(P, { 'mission.duration_days': p.durationDays, 'timing.earliest_landing_utc': p.earliestUtc, 'timing.max_slip_days': p.slipDays, 'mission.continuous_sun_required': p.continuousSun, 'landing.earth_visible_at_landing': p.earthAtLanding, 'power.load_operations_w': p.loadW, 'power.battery_wh': p.batteryWh, 'comms.mode': 'DTE', 'power.panel_height_m': p.mast ? 10 : 2 }); }
  const prices = [...C.PRICES].sort((a, b) => a.usdPerKg - b.usdPerKg);
  const W = quick ? { base: 100, worst: 50, med: 0, sun: 0.3, earth: 0.2, dark: 0 } : { base: 100, worst: 40, med: 10, sun: 0.3, earth: 0.2, dark: 0.05 };
  const opts = d.options.map((x, i) => {
    const s = x.series_hourly, nH = s.t.length, fr = s.sun_frac_worst_median_best, R = x.ranges || {};
    const sunMed = fr[1].map(v => v > 0.5 ? 1 : 0), sunWorst = fr[0].map(v => v > 0.5 ? 1 : 0), con = s.earth_contact.map(v => v ? 1 : 0);
    const run = a => { let m = 0, k = 0; for (const v of a) { k = v ? 0 : k + 1; m = Math.max(m, k); } return m; };
    const row = (d.calendar.sites[x.site] || []).find(r => r[0] === x.landing_utc.slice(0, 16) + 'Z');
    const scanW = row ? row[2] : (x.worst_case_verdict || x.verdict), scanV = row ? row[1] : x.verdict;
    const darkMed = x.light.longest_dark_h, darkWorst = R.longest_dark_h ? R.longest_dark_h[1] : darkMed;
    const usable = sunMed.map((v, k) => v * con[k]), lostH = nH - usable.reduce((a, b) => a + b, 0);
    const battWh = darkWorst * L / DOD, battKg = battWh / WHKG, verdict = x.worst_case_verdict || x.verdict;
    const score = W.base - W.worst * ORD[scanW] - W.med * ORD[scanV] + W.sun * x.light.sun_pct + W.earth * x.comms.contact_pct - W.dark * darkMed;
    return { x, i, s, nH, sunMed, sunWorst, con, usable, scanW, scanV, engScore: row ? row[3] : x.score, score, verdict,
      darkMed, darkWorst, runDarkMed: run(sunMed), runDarkWorst: run(sunWorst), runGap: run(con), contactH: con.reduce((a, b) => a + b, 0), sunH: sunMed.reduce((a, b) => a + b, 0),
      lostH, battWh, battKg, cost: prices.map(p => battKg * p.usdPerKg), lostUsd: lostH / x.duration_h * C.COST.missionUsd,
      sun: R.sun_pct || [x.light.sun_pct, x.light.sun_pct], contact: R.contact_pct || [x.comms.contact_pct, x.comms.contact_pct], meta: (S.sites || {})[x.site] || {} };
  });
  const best = opts[0], v = best.verdict;
  // all sites in the scan
  const sites = Object.entries(d.calendar.sites).map(([id, rows]) => {
    const top = rows.reduce((a, r) => r[3] > a[3] ? r : a, rows[0]);
    return { id, name: name(id), n: rows.length, go: rows.filter(r => r[2] === 'green').length, care: rows.filter(r => r[2] === 'yellow').length, no: rows.filter(r => r[2] === 'red').length, top, pick: opts.findIndex(o => o.x.site === id) };
  }).sort((a, b) => b.top[3] - a.top[3]);
  const first = d.calendar.sites[best.x.site][0][0], lastRow = d.calendar.sites[best.x.site].slice(-1)[0][0];
  const tie = opts.length > 1 && Math.abs(opts[0].engScore - opts[1].engScore) < 0.05;
  const answer = v === 'red' ? 'No site and landing time passes every check in this window. The three closest options are listed with what fails.'
    : `Land at ${best.x.site_name} on ${dt(best.x.landing_utc)}.`;
  const why = [];
  if (v !== 'red') {
    why.push(`${VW[v]} in the worst case: ${quick ? 'checked at the centre of the site, hourly' : 'it holds at the worst point of the landing area and for every lander orientation tested'}.`);
    why.push(`Sunlight ${f(best.sun[0])}${best.sun[0] !== best.sun[1] ? `-${f(best.sun[1])}` : ''}% of the stay, longest darkness ${hrs(best.darkWorst)}, Earth in contact ${f(best.x.comms.contact_pct)}% of the time.`);
    why.push(tie ? `Same ranking score as ${opts[1].x.site_name} (${f(best.engScore, 1)}): the two are equally good on light and contact; see Score and Terrain for what separates them.` : `Highest ranking score of the ${sites.length} sites checked (${f(best.engScore, 1)} against ${opts.slice(1).map(o => f(o.engScore, 1)).join(' and ')}).`);
    if (best.x.slip_tolerance_days != null) why.push(`${best.x.slip_tolerance_days > 0 ? `The landing can slip by ${f(best.x.slip_tolerance_days, 1)} days and stay ${VW[v]}` : `The date is tight: a delay of ${d.calendar.step_hours || 6} hours or more makes the verdict worse`}${best.x.backup_site ? `; backup within 3 days: ${best.x.backup_site.site_name}, ${dt(best.x.backup_site.landing_utc)}` : ''}.`);
  } else why.push(...(best.x.reasons || []));
  const mission = (C.MISSIONS.find(x => x.id === S.mission) || {}).name || 'Your mission (quick check)';
  return { d, quick, P, W, L, DOD, WHKG, prices, opts, sites, best, answer, why, tie, first, last: lastRow, mission, name, missionUsd: C.COST.missionUsd, loadGiven: !!d.costLoadGiven };
}

/* ================= Excel workbook ================= */
const colL = c => { let s = ''; c++; while (c) { const k = (c - 1) % 26; s = String.fromCharCode(65 + k) + s; c = Math.floor((c - 1) / 26); } return s; };
const A = (c, r) => colL(c) + r, AA = (c, r) => `$${colL(c)}$${r}`;
const X_ = (sh, c, r) => `'${sh}'!${AA(c, r)}`, XR = (sh, c, r0, r1) => `'${sh}'!${AA(c, r0)}:${AA(c, r1)}`;
const FN = 'Arial', thin = { style: 'thin', color: { rgb: 'D0D4DA' } };
const ST = {
  title: { font: { name: FN, sz: 16, bold: true } },
  sub: { font: { name: FN, sz: 10, color: { rgb: '555555' } }, alignment: { wrapText: true, vertical: 'top' } },
  h2: { font: { name: FN, sz: 12, bold: true }, border: { bottom: { style: 'medium', color: { rgb: '1F2328' } } } },
  head: { font: { name: FN, sz: 10, bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1F2328' } }, alignment: { wrapText: true, vertical: 'center' } },
  txt: { font: { name: FN, sz: 10 }, alignment: { wrapText: true, vertical: 'top' } },
  big: { font: { name: FN, sz: 12, bold: true }, alignment: { wrapText: true, vertical: 'top' } },
  lab: { font: { name: FN, sz: 10, bold: true }, alignment: { wrapText: true, vertical: 'top' }, border: { bottom: thin } },
  data: { font: { name: FN, sz: 10, color: { rgb: '5A6270' } }, alignment: { vertical: 'top', wrapText: true }, border: { bottom: thin } },
  inp: { font: { name: FN, sz: 10, bold: true, color: { rgb: '1F4FD1' } }, fill: { fgColor: { rgb: 'FFF4C2' } }, alignment: { vertical: 'top' }, border: { top: thin, bottom: thin, left: thin, right: thin } },
  calc: { font: { name: FN, sz: 10 }, alignment: { vertical: 'top', wrapText: true }, border: { bottom: thin } },
  link: { font: { name: FN, sz: 10, color: { rgb: '1E7B34' } }, alignment: { vertical: 'top', wrapText: true }, border: { bottom: thin } },
  key: { font: { name: FN, sz: 10, bold: true }, alignment: { vertical: 'top', wrapText: true }, border: { top: { style: 'thin', color: { rgb: '1F2328' } }, bottom: { style: 'thin', color: { rgb: '1F2328' } } } },
  note: { font: { name: FN, sz: 9, italic: true, color: { rgb: '666666' } }, alignment: { wrapText: true, vertical: 'top' } },
  url: { font: { name: FN, sz: 10, color: { rgb: '1F4FD1' }, underline: true }, alignment: { vertical: 'top' } },
};
const VS = { green: { fill: { fgColor: { rgb: 'D7F5E3' } }, font: { name: FN, sz: 10, bold: true, color: { rgb: '0B6B35' } } }, yellow: { fill: { fgColor: { rgb: 'FFF1CC' } }, font: { name: FN, sz: 10, bold: true, color: { rgb: '8A5A00' } } }, red: { fill: { fgColor: { rgb: 'FADBD8' } }, font: { name: FN, sz: 10, bold: true, color: { rgb: '9B1C1C' } } } };
const RS = { OK: VS.green, Caveat: VS.yellow, 'No go': VS.red, Go: VS.green, 'Go with caveats': VS.yellow };
const mergeSt = (a, b) => !b ? a : !a ? b : { ...a, ...b, font: { ...(a.font || {}), ...(b.font || {}) }, alignment: { ...(a.alignment || {}), ...(b.alignment || {}) } };
const F = (f, v, extra) => ({ f, v, ...extra });

function Sheet(name, cols) {
  const s = { name, cells: {}, merges: [], cols: cols || [], hts: {}, r: 0, maxC: 0 };
  s.set = (c, r, x, st) => { const cell = x && typeof x === 'object' && ('v' in x || 'f' in x) ? { ...x, s: mergeSt(st, x.s) } : { v: x, s: st }; s.cells[A(c, r)] = cell; s.maxC = Math.max(s.maxC, c); };
  s.add = (arr, st) => { s.r++; arr.forEach((x, c) => { if (x === undefined || x === null || x === '') return; s.set(c, s.r, x, Array.isArray(st) ? st[c] : st); }); return s.r; };
  s.skip = (k = 1) => { s.r += k; };
  s.span = (c0, c1, r = s.r) => { if (c1 > c0) s.merges.push({ s: { c: c0, r: r - 1 }, e: { c: c1, r: r - 1 } }); };
  // a paragraph across columns c0..c1, with a row height that fits the text
  s.para = (text, st, c1 = 5, c0 = 0, w) => { const r = s.add([...Array(c0).fill(null), text], st || ST.txt); s.span(c0, c1, r); const width = w || s.cols.slice(c0, c1 + 1).reduce((a, b) => a + (b || 10), 0); s.hts[r] = Math.max(15, Math.ceil(String(text).length / Math.max(20, width * 1.05)) * 13.5 + 3); return r; };
  s.h2 = (t, c1 = 5) => { s.skip(); const r = s.add([t, ...Array(c1).fill('')], ST.h2); for (let c = 1; c <= c1; c++) s.set(c, r, '', ST.h2); s.hts[r] = 20; return r; };
  return s;
}
function toWs(X, s) {
  const ws = {};
  let maxR = 1;
  for (const [k, c] of Object.entries(s.cells)) {
    const v = c.v; const cell = { v: v == null ? '' : v, t: typeof v === 'number' ? 'n' : typeof v === 'boolean' ? 'b' : 's' };
    if (c.f) cell.f = c.f; if (c.z) cell.z = c.z; if (c.s) cell.s = c.s; if (c.l) cell.l = c.l;
    if (cell.t === 'n' && !isFinite(v)) { cell.t = 's'; cell.v = '-'; }
    ws[k] = cell; maxR = Math.max(maxR, +k.replace(/^[A-Z]+/, ''));
  }
  ws['!ref'] = `A1:${A(Math.max(s.maxC, s.cols.length - 1), maxR)}`;
  ws['!cols'] = s.cols.map(w => ({ wch: w }));
  ws['!merges'] = s.merges;
  ws['!rows'] = []; for (const [r, h] of Object.entries(s.hts)) ws['!rows'][r - 1] = { hpt: h };
  if (s.freeze) ws['!freeze'] = s.freeze;
  if (s.filter) ws['!autofilter'] = { ref: s.filter };
  if (s.nogrid) ws['!nogrid'] = 1;
  return ws;
}
const goto = (sheet, text) => ({ v: text || sheet, l: { Target: `#'${sheet}'!A1`, Tooltip: `Open ${sheet}` }, s: ST.url });
const web = (text, url) => ({ v: text, l: { Target: url }, s: ST.url });

export function buildWorkbook(X, S, C) {
  const m = model(S, C), d = m.d, O = m.opts, n = O.length, quick = m.quick, now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const H = O.map((_, i) => `Hourly ${i + 1}`), HR0 = 5; // hourly sheets: header on row 4, data from row 5
  const hEnd = o => HR0 + o.nH - 1;
  const oc = i => 1 + i; // option columns B, C, D on table sheets
  const optHead = O.map(o => `${o.i + 1}. ${o.x.site_name}`);
  const S_ = {}; // where key cells live, for cross-sheet formulas
  const sheets = [];
  const vcell = (v, word) => ({ v: word || VW[v], s: VS[v] });

  /* ---------- Hourly (built first so other sheets can point at it) ---------- */
  const hourly = O.map((o, i) => {
    const s = Sheet(H[i], [17, 8, 9, 9, 9, 9, 9, 9, 10, 9, 10, 9, 9, 9, 10, 9, 10, 10, 36]); s.nogrid = true;
    s.add([`Hour by hour: option ${i + 1}, ${o.x.site_name}, landing ${dt(o.x.landing_utc)}`], ST.title);
    s.para(`One row per hour of the stay. Grey columns come from the analysis engine (JPL Sun and Earth positions against NASA LOLA horizons). Black columns are formulas: a site is sunlit when more than half of the Sun's disc is above the terrain (sunlit fraction > 0.5); a "run" counts consecutive hours without Sun or without Earth, so its maximum is the longest darkness or the longest silence. The engine works in 30-minute steps; this table shows every hour, so maxima can differ by up to 1 h.`, ST.sub, 18);
    s.skip();
    s.add(['UTC', 'Hours after landing', 'Sun elevation (deg)', 'Sun azimuth (deg)', 'Sunlit fraction, worst point', 'Sunlit fraction, median point', 'Sunlit fraction, best point', 'Sunlit? (median)', 'Hours in the dark (median, running)', 'Sunlit? (worst point)', 'Hours in the dark (worst point, running)', 'Earth elevation (deg)', 'Earth azimuth (deg)', 'Earth contact (1 = yes)', 'Hours without Earth (running)', 'Usable hour (Sun and Earth)', 'Solar power (W)', 'Battery charge (share)', 'Event'], ST.head);
    s.hts[4] = 54; s.freeze = 4; s.filter = `A4:S${hEnd(o)}`;
    const ser = o.s, ev = {}; for (const e of o.x.timeline_events || []) ev[e.time] = (ev[e.time] ? ev[e.time] + '; ' : '') + e.event.replace(/_/g, ' ');
    let rd = 0, rw = 0, rg = 0;
    for (let k = 0; k < o.nH; k++) {
      const r = HR0 + k, fr = ser.sun_frac_worst_median_best, sm = o.sunMed[k], sw = o.sunWorst[k], c = o.con[k];
      rd = sm ? 0 : rd + 1; rw = sw ? 0 : rw + 1; rg = c ? 0 : rg + 1;
      s.add([iso(ser.t[k]), k, +ser.sun_el[k].toFixed(3), +ser.sun_az[k].toFixed(2), +fr[0][k].toFixed(3), +fr[1][k].toFixed(3), +fr[2][k].toFixed(3),
        F(`IF(F${r}>0.5,1,0)`, sm), F(k ? `IF(H${r}=0,I${r - 1}+1,0)` : `IF(H${r}=0,1,0)`, rd), F(`IF(E${r}>0.5,1,0)`, sw), F(k ? `IF(J${r}=0,K${r - 1}+1,0)` : `IF(J${r}=0,1,0)`, rw),
        +ser.earth_el[k].toFixed(3), +ser.earth_az[k].toFixed(2), c, F(k ? `IF(N${r}=0,O${r - 1}+1,0)` : `IF(N${r}=0,1,0)`, rg), F(`H${r}*N${r}`, o.usable[k]),
        ser.power_w ? +ser.power_w[k].toFixed(1) : '', ser.battery_soc ? +ser.battery_soc[k].toFixed(3) : '', ev[ser.t[k]] || ''],
        [ST.data, ST.data, ST.data, ST.data, ST.data, ST.data, ST.data, ST.calc, ST.calc, ST.calc, ST.calc, ST.data, ST.data, ST.data, ST.calc, ST.calc, ST.data, ST.data, ST.data]);
    }
    return s;
  });
  const HX = (i, col) => XR(H[i], col, HR0, hEnd(O[i])); // a column range of hourly sheet i (col index)
  const CAL = 'Calendar', calRows = Object.values(d.calendar.sites).reduce((a, r) => a + r.length, 0), CR0 = 5, CR1 = CR0 + calRows - 1;
  const calR = col => `'${CAL}'!$${col}$${CR0}:$${col}$${CR1}`;

  /* ---------- Power ---------- */
  const pw = Sheet('Power', [44, 22, 22, 22, 60]); pw.nogrid = true;
  pw.add(['Power: the battery the darkness demands'], ST.title);
  pw.para('Near the pole the Sun skims the horizon, so a site can fall into shadow for hours or days. The lander must keep its essential systems warm and alive on batteries until the Sun returns. The longest darkness, at the worst point of the landing area and lander orientation, sets the battery.', ST.sub, 4);
  pw.h2('Inputs (change the blue cells)', 4);
  const pIn = {};
  pIn.load = pw.add(['Power kept on during darkness (W)', m.L, '', '', m.loadGiven ? 'From the mission profile.' : 'Not given by the mission: 100 W used as an example. Heaters and the computer of a small lander use roughly 50 to 150 W.'], [ST.lab, ST.inp, null, null, ST.note]);
  pIn.dod = pw.add(['Usable share of the battery', m.DOD, '', '', 'Convention: 80% depth of discharge protects lithium-ion cells.'], [ST.lab, ST.inp, null, null, ST.note]);
  pIn.whkg = pw.add(['Battery energy per kg (Wh/kg)', m.WHKG, '', '', 'Best lithium-ion cells in NASA\'s Small Spacecraft State of the Art report. A full battery pack is heavier, so mass and cost here are lower bounds.'], [ST.lab, ST.inp, null, null, ST.note]);
  pIn.eff = pw.add(['Charge efficiency (used by the engine)', 0.95, '', '', 'Share of solar energy that ends up stored. Used in the engine\'s battery simulation, not in the simple sizing below.'], [ST.lab, ST.data, null, null, ST.note]);
  [pIn.load, pIn.dod, pIn.whkg].forEach(r => pw.cells['B' + r].z = r === pIn.dod ? '0%' : '#,##0');
  pw.h2('Battery sizing, step by step', 4);
  pw.add(['', ...optHead, 'How it is calculated'], ST.head);
  const pr = {};
  pr.dm = pw.add(['Longest darkness, median point (h)', ...O.map(o => o.darkMed), 'Engine, 30-minute steps.'], [ST.lab, ST.data, ST.data, ST.data, ST.note]);
  pr.dw = pw.add(['Longest darkness, worst case (h)', ...O.map(o => o.darkWorst), quick ? 'Quick check: centre of the site only.' : 'Engine: worst point of the landing area and worst of 8 lander orientations. Used for sizing.'], [ST.lab, ST.data, ST.data, ST.data, ST.note]);
  pr.hc = pw.add(['Check: longest darkness in the hourly table (h)', ...O.map((o, i) => F(`MAX(${HX(i, 10)})`, o.runDarkWorst)), 'Maximum of the running count on the Hourly sheet (worst point). Hourly samples, so up to 1 h from the engine.'], [ST.lab, ST.link, ST.link, ST.link, ST.note]);
  pr.e = pw.add(['Energy to get through it (Wh)', ...O.map((o, i) => F(`${A(oc(i), pr.dw)}*$B$${pIn.load}`, o.darkWorst * m.L)), '= longest darkness x power kept on'], [ST.lab, ST.calc, ST.calc, ST.calc, ST.note]);
  pr.cap = pw.add(['Battery capacity needed (Wh)', ...O.map((o, i) => F(`${A(oc(i), pr.e)}/$B$${pIn.dod}`, o.battWh)), '= energy / usable share'], [ST.lab, ST.calc, ST.calc, ST.calc, ST.note]);
  pr.kg = pw.add(['Extra battery mass (kg)', ...O.map((o, i) => F(`${A(oc(i), pr.cap)}/$B$${pIn.whkg}`, o.battKg)), '= capacity / energy per kg. Zero means the site never goes dark.'], [ST.key, ST.key, ST.key, ST.key, ST.note]);
  pr.sun = pw.add(['Hours until the first sunset (h)', ...O.map(o => o.x.light.hours_to_sunset ?? '-'), 'Engine. Equal to the stay when the site never goes dark.'], [ST.lab, ST.data, ST.data, ST.data, ST.note]);
  for (let i = 0; i < n; i++) { [pr.dm, pr.dw, pr.hc, pr.sun].forEach(r => pw.cells[A(oc(i), r)].z = '0.0'); [pr.e, pr.cap].forEach(r => pw.cells[A(oc(i), r)].z = '#,##0'); pw.cells[A(oc(i), pr.kg)].z = '0.0'; }
  S_.kg = i => X_('Power', oc(i), pr.kg);
  const R = k => O.map(o => o.x.ranges && o.x.ranges[k] ? `${f(o.x.ranges[k][0])} to ${f(o.x.ranges[k][1])}` : '-');
  const eng = [['Battery needed with the real panels (Wh)', R('battery_needed_wh'), 'Engine simulation, hour by hour, with the mission\'s panels and power use: the deepest drop of the stored energy / usable share. Range across the landing area and orientations.'],
    ['Solar array needed (W)', R('array_needed_w'), 'Smallest array (on the mission\'s panel layout) that keeps the battery above zero. Only when panel power is not given.'],
    ['Highest continuous load the site supports (W)', R('max_sustainable_load_w'), 'Only when power use is not given: the largest constant load the given battery and panels can carry for the whole stay.'],
    ['Solar energy collected over the stay (kWh)', R('energy_kwh'), 'Only when panel power is given.']].filter(r => r[1].some(v => v !== '-'));
  if (eng.length) { pw.h2('What the engine simulated with the mission\'s own hardware', 4); pw.add(['', ...optHead, 'What it means'], ST.head); eng.forEach(r => pw.add([r[0], ...r[1], r[2]], [ST.lab, ST.data, ST.data, ST.data, ST.note])); }
  if (m.P['power.battery_wh']) {
    pw.h2('Margin on the mission\'s own battery', 4);
    const rb = pw.add(['Mission battery (Wh)', m.P['power.battery_wh'], '', '', 'From the mission profile.'], [ST.lab, ST.inp, null, null, ST.note]);
    pw.add(['Hours this battery lasts on its own (h)', ...O.map(() => F(`$B$${rb}*$B$${pIn.dod}/$B$${pIn.load}`, m.P['power.battery_wh'] * m.DOD / m.L, { z: '0.0' })), `= battery x usable share / power kept on. Compare with the longest darkness above.${m.loadGiven ? '' : ' Uses the example power: put the real one in the blue cell.'}`], [ST.lab, ST.calc, ST.calc, ST.calc, ST.note]);
    pw.add(['Margin after the longest darkness', ...O.map((o, i) => F(`1-${A(oc(i), pr.cap)}/$B$${rb}`, 1 - o.battWh / m.P['power.battery_wh'], { z: '0%' })), 'Below 20% the engine flags a caveat; below 0% the battery runs flat.'], [ST.lab, ST.calc, ST.calc, ST.calc, ST.note]);
  }
  pw.h2('What if the lander keeps more on? Extra battery mass (kg)', 4);
  pw.add(['Power kept on during darkness (W)', ...optHead, ''], ST.head);
  for (const w of [50, 100, 200, 300, 500, 1000]) { const r = pw.r + 1; pw.add([w, ...O.map((o, i) => F(`$A${r}*${A(oc(i), pr.dw)}/$B$${pIn.dod}/$B$${pIn.whkg}`, w * o.darkWorst / m.DOD / m.WHKG, { z: '0.0' }))], [ST.inp, ST.calc, ST.calc, ST.calc]); }

  /* ---------- Cost ---------- */
  const co = Sheet('Cost', [46, 22, 22, 22, 60]); co.nogrid = true;
  co.add(['Cost: what each site costs in battery and in lost time'], ST.title);
  co.para('Two costs separate the sites. Direct: every kilogram of extra battery must be flown to the Moon. Opportunity: hours with no Sun or no contact with Earth are paid-for surface time the mission cannot fully use. Prices are public figures, not quotes.', ST.sub, 4);
  co.h2('Inputs (change the blue cells)', 4);
  co.add(['Delivery price to the lunar surface', 'US$ per kg', '', '', 'Source'], ST.head);
  const cP = m.prices.map(p => co.add([p.label.replace(/,.*$/, ''), p.usdPerKg, '', '', web(p.note || p.label, p.url)], [ST.lab, { ...ST.inp }, null, null, null]));
  cP.forEach(r => co.cells['B' + r].z = '"$"#,##0');
  const cM = co.add(['Mission price (US$)', m.missionUsd, '', '', web('Default: NASA CLPS task order CP-22, $116.9M (SpaceNews)', 'https://spacenews.com/?p=505012')], [ST.lab, ST.inp, null, null, null]); co.cells['B' + cM].z = '"$"#,##0';
  co.h2('Direct cost: flying the extra battery', 4);
  co.add(['', ...optHead, 'How it is calculated'], ST.head);
  const cr = {};
  cr.kg = co.add(['Extra battery mass (kg)', ...O.map((o, i) => F(S_.kg(i), o.battKg, { z: '0.0' })), 'From the Power sheet.'], [ST.lab, ST.link, ST.link, ST.link, ST.note]);
  cr.c = m.prices.map((p, k) => co.add([`Delivery cost at ${['the lowest', 'the published list', 'the NASA-paid'][k] || 'this'} price`, ...O.map((o, i) => F(`${A(oc(i), cr.kg)}*$B$${cP[k]}`, o.cost[k], { z: '"$"#,##0' })), `= mass x ${usd(p.usdPerKg)} per kg`], [ST.lab, ST.calc, ST.calc, ST.calc, ST.note]));
  cr.d = co.add(['Extra over the cheapest site (list price)', ...O.map((o, i) => F(`${A(oc(i), cr.c[1])}-MIN($B$${cr.c[1]}:${AA(oc(n - 1), cr.c[1])})`, o.cost[1] - Math.min(...O.map(q => q.cost[1])), { z: '"$"#,##0' })), 'What choosing this site adds, against the site that needs the least battery.'], [ST.key, ST.key, ST.key, ST.key, ST.note]);
  co.h2('Opportunity cost: surface time without Sun or Earth', 4);
  co.add(['', ...optHead, 'How it is calculated'], ST.head);
  cr.lost = co.add(['Hours without Sun or without Earth (h)', ...O.map((o, i) => F(`COUNT(${HX(i, 15)})-SUM(${HX(i, 15)})`, o.lostH)), 'Hourly sheet: hours where the "usable hour" column is 0 (median point).'], [ST.lab, ST.link, ST.link, ST.link, ST.note]);
  cr.stay = co.add(['Hours on the surface (h)', ...O.map(o => o.x.duration_h), 'Mission profile.'], [ST.lab, ST.data, ST.data, ST.data, ST.note]);
  cr.sh = co.add(['Share of the stay not fully usable', ...O.map((o, i) => F(`${A(oc(i), cr.lost)}/${A(oc(i), cr.stay)}`, o.lostH / o.x.duration_h, { z: '0.0%' })), '= hours lost / hours on the surface'], [ST.lab, ST.calc, ST.calc, ST.calc, ST.note]);
  cr.v = co.add(['Value of that time (US$)', ...O.map((o, i) => F(`${A(oc(i), cr.sh)}*$B$${cM}`, o.lostUsd, { z: '"$"#,##0' })), '= share x mission price. A simple pro-rata view: it assumes every hour of the stay is worth the same.'], [ST.key, ST.key, ST.key, ST.key, ST.note]);
  co.h2('Both together', 4);
  co.add(['', ...optHead, ''], ST.head);
  cr.t = co.add(['Battery (list price) + value of lost time (US$)', ...O.map((o, i) => F(`${A(oc(i), cr.c[1])}+${A(oc(i), cr.v)}`, o.cost[1] + o.lostUsd, { z: '"$"#,##0' })), ''], [ST.key, ST.key, ST.key, ST.key, ST.note]);
  const tots = O.map(o => o.cost[1] + o.lostUsd), lo = tots.indexOf(Math.min(...tots));
  cr.dt = co.add(['More than the cheapest site (US$)', ...O.map((o, i) => F(`${A(oc(i), cr.t)}-MIN($B$${cr.t}:${AA(oc(n - 1), cr.t)})`, tots[i] - tots[lo], { z: '"$"#,##0' })), ''], [ST.lab, ST.calc, ST.calc, ST.calc, ST.note]);
  co.add(['Cheapest site overall', F(`INDEX($B$${cr.t - 1}:${AA(oc(n - 1), cr.t - 1)},MATCH(MIN($B$${cr.t}:${AA(oc(n - 1), cr.t)}),$B$${cr.t}:${AA(oc(n - 1), cr.t)},0))`, optHead[lo])], [ST.key, { ...ST.key, font: { name: FN, sz: 10, bold: true, color: { rgb: '0B6B35' } } }]);
  co.span(1, 3);
  co.skip();
  co.para('Not included: the price of the battery itself, extra radiators or heaters, insurance, launch slips. Batteries are sized with the best cell-level energy density, so real packs are heavier and the costs above are a floor, not a ceiling.', ST.note, 4);
  S_.cost = (k, i) => X_('Cost', oc(i), cr.c[k]); S_.lostV = i => X_('Cost', oc(i), cr.v);

  /* ---------- Comms ---------- */
  const cm = Sheet('Comms', [44, 22, 22, 22, 60]); cm.nogrid = true;
  cm.add(['Comms: when the lander can talk to Earth'], ST.title);
  cm.para('Contact needs two things at the same hour: Earth above the local terrain as seen from the antenna, and at least one NASA Deep Space Network complex (Goldstone, Madrid, Canberra) that sees the Moon. Near the pole Earth also skims the horizon, so mountains can cut the link for days.', ST.sub, 4);
  cm.h2('Inputs (change the blue cells)', 4);
  const rate = m.P['comms.data_rate_kbps'], need = m.P['comms.data_volume_mb'];
  const kR = cm.add(['Radio data rate to Earth (kbps)', rate || 1000, '', '', rate ? 'From the mission profile.' : 'Not given by the mission: 1,000 kbps used as an example (a small lander on X-band). Put your own rate.'], [ST.lab, ST.inp, null, null, ST.note]);
  const kN = cm.add(['Data the mission must send (MB)', need || '', '', '', need ? 'From the mission profile.' : 'Optional. Leave empty if not known.'], [ST.lab, ST.inp, null, null, ST.note]);
  cm.cells['B' + kR].z = '#,##0'; if (need) cm.cells['B' + kN].z = '#,##0';
  cm.h2('Contact over the stay', 4);
  cm.add(['', ...optHead, 'How it is calculated'], ST.head);
  const cmr = {};
  cmr.pct = cm.add(['Earth contact (% of the stay)', ...O.map(o => o.x.comms.contact_pct), 'Engine, median point of the landing area.'], [ST.lab, ST.data, ST.data, ST.data, ST.note]);
  cmr.h = cm.add(['Hours in contact (h)', ...O.map((o, i) => F(`SUM(${HX(i, 13)})`, o.contactH)), 'Hourly sheet: sum of the contact column.'], [ST.lab, ST.link, ST.link, ST.link, ST.note]);
  cmr.p = cm.add(['Separate contact periods', ...O.map(o => o.x.comms.passes ?? '-'), 'Engine. One means the link never drops.'], [ST.lab, ST.data, ST.data, ST.data, ST.note]);
  cmr.g = cm.add(['Longest silence (h)', ...O.map(o => o.x.comms.longest_gap_h), 'Engine, 30-minute steps.'], [ST.lab, ST.data, ST.data, ST.data, ST.note]);
  cmr.gc = cm.add(['Check: longest silence in the hourly table (h)', ...O.map((o, i) => F(`MAX(${HX(i, 14)})`, o.runGap)), 'Maximum of the running count on the Hourly sheet.'], [ST.lab, ST.link, ST.link, ST.link, ST.note]);
  cmr.es = cm.add(['Hours until Earth first drops out (h)', ...O.map(o => o.x.comms.hours_to_earthset ?? '-'), 'Engine.'], [ST.lab, ST.data, ST.data, ST.data, ST.note]);
  cmr.el = cm.add(['Earth elevation at touchdown (deg)', ...O.map(o => +o.x.landing.earth_elevation_deg.toFixed(2)), 'Angle above a level horizon. Terrain can still hide Earth even when this is positive.'], [ST.lab, ST.data, ST.data, ST.data, ST.note]);
  cmr.gb = cm.add(['Data you can send over the stay (GB)', ...O.map((o, i) => F(`${A(oc(i), cmr.h)}*3600*$B$${kR}/8/1000000`, o.contactH * 3600 * (rate || 1000) / 8 / 1e6, { z: '#,##0.0' })), '= hours x 3,600 s x kbps / 8 bits / 1,000,000 (kB to GB)'], [ST.key, ST.key, ST.key, ST.key, ST.note]);
  cm.add(['Enough for the mission\'s data?', ...O.map((o, i) => F(`IF($B$${kN}="","not given",IF(${A(oc(i), cmr.gb)}*1000>=$B$${kN},"Yes","No"))`, need ? (o.contactH * 3600 * (rate || 1000) / 8 / 1e3 >= need ? 'Yes' : 'No') : 'not given')), 'Compares the volume above with the data to send.'], [ST.lab, ST.calc, ST.calc, ST.calc, ST.note]);
  [cmr.pct, cmr.g, cmr.gc, cmr.es].forEach(r => O.forEach((o, i) => { const c = cm.cells[A(oc(i), r)]; if (typeof c.v === 'number') c.z = '0.0'; }));

  /* ---------- Checks ---------- */
  const ck = Sheet('Checks', [30, 44, 13, 11, ...O.flatMap(() => [13, 11])]); ck.nogrid = true;
  ck.add(['Checks: why each option gets its verdict'], ST.title);
  ck.para('Every rule the engine applies, with the mission requirement, the value at each site and the result. The verdict is the worst result: one "No go" makes the option No go; otherwise one "Caveat" makes it Go with caveats. Change a blue requirement and the results update.', ST.sub, 3 + 2 * n);
  ck.skip();
  const hdr = ['Check', 'Why it matters', 'Requirement', 'If it fails'];
  O.forEach(o => hdr.push(`${o.i + 1}. ${o.x.site_name}`, 'Result'));
  const hr = ck.add(hdr, ST.head); ck.hts[hr] = 30;
  const P = m.P, yes = v => v ? 'Yes' : 'No';
  const rules = [
    { k: 'Sun visible at touchdown', why: 'The lander needs light to see the ground and to start charging. Fails if terrain hides the Sun at the landing hour.', req: 'Always', sev: 'No go', val: o => yes(o.x.landing.sun_visible), f: v => `IF(${v}="Yes","OK","No go")`, js: v => v === 'Yes' ? 'OK' : 'No go' },
    P['landing.min_sun_elevation_deg'] != null && { k: 'Sun high enough at touchdown (deg)', why: 'A low Sun casts long shadows over the landing area and blinds cameras.', req: P['landing.min_sun_elevation_deg'], inp: 1, sev: 'Caveat', val: o => +o.x.landing.sun_elevation_deg.toFixed(2), f: (v, t) => `IF(${v}>=${t},"OK","Caveat")`, js: (v, t) => v >= t ? 'OK' : 'Caveat' },
    { k: 'Earth in view at touchdown', why: 'Early landers report every step of the descent to Earth. Required by this mission?', req: yes(P['landing.earth_visible_at_landing']), inp: 1, sev: 'No go', val: o => yes(o.x.landing.earth_visible), f: (v, t) => `IF(${t}="Yes",IF(${v}="Yes","OK","No go"),"OK")`, js: (v, t) => t === 'Yes' && v !== 'Yes' ? 'No go' : 'OK' },
    { k: 'Sunlight without a break (longest darkness, h)', why: 'Some missions (crew, no night-survival hardware) cannot live through a single night. Required by this mission?', req: yes(P['mission.continuous_sun_required']), inp: 1, sev: 'No go', val: o => o.darkMed, f: (v, t) => `IF(${t}="Yes",IF(${v}=0,"OK","No go"),"OK")`, js: (v, t) => t === 'Yes' && v > 0 ? 'No go' : 'OK' },
    O.some(o => o.x.power && o.x.power.survives != null) && { k: 'Battery never runs flat', why: 'Engine simulation with the mission\'s panels, battery and power use.', req: 'Always', sev: 'No go', val: o => o.x.power && o.x.power.survives != null ? yes(o.x.power.survives) : '-', f: v => `IF(${v}="No","No go","OK")`, js: v => v === 'No' ? 'No go' : 'OK' },
    O.some(o => o.x.power && o.x.power.min_soc != null) && { k: 'Lowest battery charge (share)', why: 'Below 20% the lander drops into survival mode.', req: 0.2, inp: 1, sev: 'Caveat', val: o => o.x.power && o.x.power.min_soc != null ? +o.x.power.min_soc.toFixed(3) : '-', f: (v, t) => `IF(ISNUMBER(${v}),IF(${v}>=${t},"OK","Caveat"),"OK")`, js: (v, t) => typeof v === 'number' && v < t ? 'Caveat' : 'OK' },
    quick && P['power.battery_wh'] != null && { k: 'Battery big enough for the longest darkness (Wh needed)', why: 'Longest darkness x power use / 0.8 against the battery you gave.', req: P['power.battery_wh'], inp: 1, sev: 'No go', val: o => Math.round(o.x.power.battery_needed_wh || 0), f: (v, t) => `IF(${v}<=${t},"OK","No go")`, js: (v, t) => v <= t ? 'OK' : 'No go' },
    { k: 'Power data given (if not: longest darkness, h)', why: 'Without power figures the engine cannot prove the lander survives the dark, so any darkness is a caveat.', req: 'Given', sev: 'Caveat', val: o => o.x.power && Object.keys(o.x.power).length ? 'given' : o.darkMed, f: v => `IF(ISNUMBER(${v}),IF(${v}>0,"Caveat","OK"),"OK")`, js: v => typeof v === 'number' && v > 0 ? 'Caveat' : 'OK' },
    O.some(o => o.x.power && o.x.power.max_sustainable_load_w != null) && { k: 'Power use given (if not: highest load the site supports, W)', why: 'The panels and battery are known but the power use is not: the engine gives the highest constant load the site can carry and flags it for you to check.', req: 'Given', sev: 'Caveat', val: o => o.x.power && o.x.power.max_sustainable_load_w != null ? Math.round(o.x.power.max_sustainable_load_w) : 'given', f: v => `IF(ISNUMBER(${v}),"Caveat","OK")`, js: v => typeof v === 'number' ? 'Caveat' : 'OK' },
    P['comms.data_volume_mb'] && { k: 'Enough contact to send the data (MB possible)', why: 'Contact hours x data rate against the data the mission must send.', req: P['comms.data_volume_mb'], inp: 1, sev: 'No go', val: o => o.x.comms.data_possible_mb != null ? Math.round(o.x.comms.data_possible_mb) : '-', f: (v, t) => `IF(ISNUMBER(${v}),IF(${v}>=${t},"OK","No go"),"OK")`, js: (v, t) => typeof v === 'number' && v < t ? 'No go' : 'OK' },
    (P['comms.mode'] || 'DTE') === 'DTE' && { k: 'Earth contact share (%)', why: 'Direct-to-Earth radio: with contact under 30% of the time, operations and fault recovery become hard.', req: 30, inp: 1, sev: 'Caveat', val: o => +o.x.comms.contact_pct.toFixed(1), f: (v, t) => `IF(${v}>=${t},"OK","Caveat")`, js: (v, t) => v >= t ? 'OK' : 'Caveat' },
    !quick && O.some(o => o.x.terrain && o.x.terrain.safe_fraction != null) && { k: `Landing area under ${P['landing.max_slope_deg'] || 10} deg slope (%)`, why: 'Share of the landing area flatter than the lander\'s limit, on 5 m NASA terrain. Under 90% is a caveat.', req: 90, inp: 1, sev: 'Caveat', val: o => o.x.terrain && o.x.terrain.safe_fraction != null ? +(100 * o.x.terrain.safe_fraction).toFixed(1) : '-', f: (v, t) => `IF(ISNUMBER(${v}),IF(${v}>=${t},"OK","Caveat"),"OK")`, js: (v, t) => typeof v === 'number' && v < t ? 'Caveat' : 'OK' },
    !quick && P['mission.max_distance_to_psr_km'] && { k: 'Ice-bearing dark area within reach (km)', why: 'Distance to the nearest permanently shadowed area larger than 0.01 km2, against the mission\'s walking or driving limit.', req: P['mission.max_distance_to_psr_km'], inp: 1, sev: 'No go', val: o => o.x.resources ? +o.x.resources['nearest_over_0.01km2_km'].toFixed(2) : '-', f: (v, t) => `IF(ISNUMBER(${v}),IF(${v}<=${t},"OK","No go"),"OK")`, js: (v, t) => typeof v === 'number' && v > t ? 'No go' : 'OK' },
  ].filter(Boolean);
  const rr0 = ck.r + 1;
  for (const ru of rules) {
    const r = ck.r + 1, t = AA(2, r);
    const cells = [ru.k, ru.why, ru.req, ru.sev];
    const sts = [ST.lab, ST.note, ru.inp ? ST.inp : ST.data, ST.data];
    O.forEach((o, i) => { const v = ru.val(o), vc = A(4 + 2 * i, r), res = ru.js(v, ru.req); cells.push(v, F(ru.f(vc, t), res)); sts.push(ST.data, mergeSt(ST.calc, RS[res])); });
    ck.add(cells, sts); ck.hts[r] = 40;
  }
  const rr1 = ck.r;
  const vr = ck.add(['Verdict from these checks', 'Worst result in the column above.', '', '', ...O.flatMap((o, i) => { const col = colL(5 + 2 * i), res = rules.map(ru => ru.js(ru.val(o), ru.req)), w = res.includes('No go') ? 'No go' : res.includes('Caveat') ? 'Go with caveats' : 'Go'; return ['', F(`IF(COUNTIF(${col}${rr0}:${col}${rr1},"No go")>0,"No go",IF(COUNTIF(${col}${rr0}:${col}${rr1},"Caveat")>0,"Go with caveats","Go"))`, w, { s: RS[w] })]; })], ST.key);
  S_.ckV = i => X_('Checks', 5 + 2 * i, vr);
  ck.add(['Engine verdict, median point', 'What the app shows for the centre of the analysis.', '', '', ...O.flatMap(o => ['', vcell(o.x.verdict)])], [ST.lab, ST.note, null, null, ...O.flatMap(() => [null, null])]);
  ck.add(['Engine verdict, worst case', quick ? 'Quick check: same as the median.' : 'Worst of the landing area (worst and best points) and of 8 lander orientations. This is the verdict on the cards.', '', '', ...O.flatMap(o => ['', vcell(o.verdict)])], [ST.lab, ST.note, null, null, ...O.flatMap(() => [null, null])]);
  ck.add(['Reasons given by the engine', '', '', '', ...O.flatMap(o => [(o.x.reasons || []).join('; ') || 'none', ''])], [ST.lab, null, null, null, ...O.flatMap(() => [ST.note, null])]);
  O.forEach((o, i) => ck.span(4 + 2 * i, 5 + 2 * i)); ck.hts[ck.r] = 48;
  ck.skip(); ck.para('If the verdict from these checks and the engine verdict differ, the difference is a requirement you changed in a blue cell, or the worst case: a check that passes at the median point can fail at the worst point of the landing area.', ST.note, 3 + 2 * n);

  /* ---------- Score ---------- */
  const sc = Sheet('Score', [24, 26, 18, 16, 10, 16, 17, 11, 11, 11, 12, 12, 11, 8]); sc.nogrid = true;
  sc.add(['Score: how the three options were ranked'], ST.title);
  sc.para(`The engine tried every site every ${d.calendar.step_hours || 6} hours from ${dt(m.first)} to ${dt(m.last)}: ${f(calRows)} landing times across ${m.sites.length} sites (all listed on the Calendar sheet). Each landing time gets a verdict and a score. The options are the best landing time at each of the three highest-scoring sites, so they are three different places.`, ST.sub, 13);
  sc.h2('Score weights (change the blue cells to test another ranking)', 13);
  const w = m.W, wr = {};
  const wl = [['base', 'Starting points', 'Every landing time starts here.'], ['worst', 'Penalty per step of the worst-case verdict', 'Go = 0 steps, Go with caveats = 1, No go = 2. The worst case dominates on purpose: safety first.'],
    ['med', 'Penalty per step of the median verdict', quick ? 'Not used in the quick check.' : 'The typical point of the landing area.'], ['sun', 'Points per % of the stay in sunlight', 'Power and warmth.'],
    ['earth', 'Points per % of the stay in contact with Earth', 'Operations and safety.'], ['dark', 'Penalty per hour of the longest darkness', quick ? 'Not used in the quick check.' : 'A long night costs battery mass.']];
  wl.forEach(([k, l, why]) => { wr[k] = sc.add([l, w[k], why], [ST.lab, ST.inp, ST.note]); sc.span(2, 9); });
  sc.add(['Score =', `starting points - worst steps x ${w.worst} - median steps x ${w.med} + sunlight % x ${w.sun} + contact % x ${w.earth} - longest darkness h x ${w.dark}`], [ST.lab, ST.calc]); sc.span(1, 9);
  sc.h2('The three options', 13);
  sc.add(['Option', 'Site', 'Landing (UTC)', 'Worst-case verdict in the scan', 'Steps', 'Median verdict in the scan', 'Steps', 'Sunlight (%)', 'Earth contact (%)', 'Longest darkness (h)', 'Score (formula)', 'Engine score', 'Difference', 'Rank'], ST.head);
  sc.hts[sc.r] = 42;
  const so0 = sc.r + 1, so1 = sc.r + n;
  const steps = c => `MATCH(${c},{"Go","Go with caveats","No go"},0)-1`;
  O.forEach((o, i) => {
    const r = sc.r + 1;
    sc.add([`${i + 1}`, o.x.site_name, iso(o.x.landing_utc), vcell(o.scanW), F(steps(`D${r}`), ORD[o.scanW]), vcell(o.scanV), F(steps(`F${r}`), ORD[o.scanV]), { v: o.x.light.sun_pct, z: '0.00' }, { v: o.x.comms.contact_pct, z: '0.00' }, o.darkMed,
      F(`$B$${wr.base}-$B$${wr.worst}*E${r}-$B$${wr.med}*G${r}+$B$${wr.sun}*H${r}+$B$${wr.earth}*I${r}-$B$${wr.dark}*J${r}`, o.score, { z: '0.0' }), o.engScore, F(`K${r}-L${r}`, o.score - o.engScore, { z: '0.0' }), F(`RANK(K${r},$K$${so0}:$K$${so1})`, 1 + O.filter(q => q.score > o.score + 1e-9).length)],
      [ST.lab, ST.lab, ST.data, null, ST.calc, null, ST.calc, ST.data, ST.data, ST.data, ST.key, ST.data, ST.calc, ST.key]);
  });
  S_.score = i => X_('Score', 10, so0 + i); S_.rank = i => X_('Score', 13, so0 + i);
  const notes = [];
  if (O.some(o => o.scanV !== o.x.verdict)) notes.push('The scan ranks landing times before the full power check. A caveat added afterwards (for example "power use not given") appears on the Checks sheet; it applies to every option alike, so it does not change the order.');
  if (m.tie) notes.push(`Options 1 and 2 have the same score: both are equally good on light, contact and darkness. The order between them then follows the data order. What separates them is on the Terrain and ice sheet (slope, distance to ice) and the Robustness sheet (how long the landing can slip, backup site).`);
  notes.forEach(t => sc.para(t, ST.note, 13));
  sc.h2('Every site in the scan, best landing time first', 13);
  sc.add(['Site', 'Landing times checked', 'Go (worst case)', 'Go with caveats', 'No go', 'Best score', 'Best landing (UTC)', 'In the top 3?'], ST.head);
  sc.hts[sc.r] = 30;
  for (const s of m.sites) {
    const r = sc.r + 1;
    sc.add([s.name, F(`COUNTIF(${calR('A')},A${r})`, s.n), F(`COUNTIFS(${calR('A')},A${r},${calR('E')},"Go")`, s.go), F(`COUNTIFS(${calR('A')},A${r},${calR('E')},"Go with caveats")`, s.care), F(`COUNTIFS(${calR('A')},A${r},${calR('E')},"No go")`, s.no),
      F(`_xlfn.MAXIFS(${calR('F')},${calR('A')},A${r})`, s.top[3], { z: '0.0' }), iso(s.top[0]), s.pick >= 0 ? `Option ${s.pick + 1}` : ''], [ST.lab, ST.link, ST.link, ST.link, ST.link, ST.link, ST.data, ST.key]);
  }

  /* ---------- Terrain and ice ---------- */
  const te = Sheet('Terrain and ice', [44, 24, 24, 24, 56]); te.nogrid = true;
  te.add(['Terrain and ice: is the ground safe, and how far is the water ice?'], ST.title);
  te.para('Slopes come from NASA LOLA terrain at 5 m per pixel inside the landing area. Ice-bearing areas are the permanently shadowed regions of the NASA LOLA catalogue, where the Sun never shines and water ice can survive.', ST.sub, 4);
  te.skip();
  te.add(['', ...optHead, 'Notes'], ST.head);
  const T = (l, fn, note, z) => { const r = te.add([l, ...O.map(fn), note || ''], [ST.lab, ST.data, ST.data, ST.data, ST.note]); if (z) O.forEach((o, i) => { const c = te.cells[A(oc(i), r)]; if (c && typeof c.v === 'number') c.z = z; }); return r; };
  T('Latitude (deg)', o => o.meta.lat ?? '-', 'Centre of the landing area.', '0.000');
  T('Longitude (deg)', o => o.meta.lon ?? '-', '', '0.000');
  T('Ground height (m)', o => o.meta.ground_height_m ?? '-', 'Above the lunar reference sphere (1,737.4 km).', '#,##0');
  T('Terrain model', o => o.meta.terrain || 'NASA LOLA', '');
  T('Landing area radius (m)', o => o.x.ellipse_radius_m ?? '-', 'From the mission profile: the circle the lander can hit.');
  if (!quick) {
    T('Terrain resolution (m)', o => o.x.terrain ? o.x.terrain.resolution_m : '-', 'Craters smaller than about twice this size are not resolved.');
    T('Slope, median (deg)', o => o.x.terrain ? +o.x.terrain.median_deg.toFixed(2) : '-', '', '0.0');
    T('Slope, steepest 10% (deg)', o => o.x.terrain ? +o.x.terrain.p90_deg.toFixed(2) : '-', '90th percentile of the slope inside the landing area.', '0.0');
    T(`Share of the area under ${P['landing.max_slope_deg'] || 10} deg (%)`, o => o.x.terrain && o.x.terrain.safe_fraction != null ? +(100 * o.x.terrain.safe_fraction).toFixed(1) : '-', 'Under 90% is a caveat (Checks sheet).', '0.0');
    T('Nearest permanently shadowed area, any size (km)', o => o.x.resources ? +o.x.resources.nearest_any_km.toFixed(2) : '-', 'Tiny cold traps can be metres across.', '0.00');
    T('Nearest shadowed area over 0.01 km2 (km)', o => o.x.resources ? +o.x.resources['nearest_over_0.01km2_km'].toFixed(2) : '-', 'Big enough to sample. Artemis asks for a walk under 5 km.', '0.00');
    T('Nearest shadowed area over 1 km2 (km)', o => o.x.resources ? +o.x.resources.nearest_over_1km2_km.toFixed(2) : '-', 'A large ice target for rovers.', '0.00');
  }
  T('Sun elevation at touchdown (deg)', o => +o.x.landing.sun_elevation_deg.toFixed(2), 'Above a level horizon. A low Sun means long shadows.', '0.00');
  T('Sun direction at touchdown (deg from north)', o => +o.x.landing.sun_azimuth_deg.toFixed(1), '', '0.0');
  if (!quick) { const r = T('Shadow note for the landing team', o => o.x.landing.shadow_risk || '-', ''); te.hts[r] = 120; }
  te.skip(); te.para('Not checked here: rocks and craters smaller than the terrain resolution. Before committing, the landing area must be checked on 0.5 to 1 m images (LRO Narrow Angle Camera, ShadowCam). IM-2 Athena (2025) tipped over in a crater about 20 m across.', ST.note, 4);

  /* ---------- Robustness ---------- */
  const rb = Sheet('Robustness', [46, 26, 26, 26, 50]); rb.nogrid = true;
  rb.add(['Robustness: how sure, and what if things move'], ST.title);
  rb.para(quick ? 'Quick check: one point per site, hourly. The full analysis adds the spread across the landing area, the lander orientation and NASA terrain error.' : 'Each number is a range: from the best to the worst point of the landing area, and across 8 lander orientations. NASA terrain versions (LOLA clones with the measurement error added) test how much the terrain itself can move the answer.', ST.sub, 4);
  rb.skip();
  rb.add(['', ...optHead, 'Notes'], ST.head);
  const RG = (l, k, d, note) => rb.add([l, ...O.map(o => o.x.ranges && o.x.ranges[k] ? `${f(o.x.ranges[k][0], d)} to ${f(o.x.ranges[k][1], d)}` : '-'), note || ''], [ST.lab, ST.data, ST.data, ST.data, ST.note]);
  RG('Sunlight (% of the stay)', 'sun_pct', 1); RG('Longest darkness (h)', 'longest_dark_h', 1, 'The worst value sizes the battery (Power sheet).'); RG('Earth contact (% of the stay)', 'contact_pct', 1);
  if (!quick) {
    rb.add(['Lander orientation', ...O.map(o => o.x.orientation || '-'), 'Body-mounted panels depend on which way the lander faces.'], [ST.lab, ST.data, ST.data, ST.data, ST.note]);
    rb.add(['NASA terrain versions tested', ...O.map(o => o.x.terrain_uncertainty ? o.x.terrain_uncertainty.clones : '-'), 'Centre of the site, same dates.'], [ST.lab, ST.data, ST.data, ST.data, ST.note]);
    rb.add(['Sunlight across terrain versions (%)', ...O.map(o => o.x.terrain_uncertainty ? `${f(o.x.terrain_uncertainty.centre_sun_pct[0], 1)} to ${f(o.x.terrain_uncertainty.centre_sun_pct[1], 1)}` : '-'), 'A narrow range means the terrain error does not change the answer.'], [ST.lab, ST.data, ST.data, ST.data, ST.note]);
    rb.add(['Longest darkness across terrain versions (h)', ...O.map(o => o.x.terrain_uncertainty ? `${f(o.x.terrain_uncertainty.centre_longest_dark_h[0], 1)} to ${f(o.x.terrain_uncertainty.centre_longest_dark_h[1], 1)}` : '-'), ''], [ST.lab, ST.data, ST.data, ST.data, ST.note]);
    rb.add(['Landing can slip by (days)', ...O.map(o => o.x.slip_tolerance_days ?? '-'), 'Days after the chosen time with a verdict no worse than at the chosen time.'], [ST.key, ST.key, ST.key, ST.key, ST.note]);
    rb.add(['Backup site within 3 days', ...O.map(o => o.x.backup_site ? `${o.x.backup_site.site_name}, ${iso(o.x.backup_site.landing_utc)}, ${VW[o.x.backup_site.verdict]}` : '-'), 'Best-scoring other site within 3 days of the chosen time.'], [ST.lab, ST.data, ST.data, ST.data, ST.note]);
    const hw = O.some(o => o.x.hardware_toggles && Object.keys(o.x.hardware_toggles).length);
    if (hw) {
      rb.h2('What hardware changes would do', 4);
      rb.add(['Change', ...optHead, 'Notes'], ST.head);
      const lab = { mast_10m: 'Panels and antenna on a 10 m mast', tracking_panels: 'Panels that track the Sun' };
      for (const key of ['mast_10m', 'tracking_panels']) {
        if (!O.some(o => o.x.hardware_toggles && o.x.hardware_toggles[key])) continue;
        const g = (o, k, d) => { const h = o.x.hardware_toggles && o.x.hardware_toggles[key]; return h && h[k] && h[k][0] != null ? `${f(h[k][0], d)} -> ${f(h[k][1], d)}` : '-'; };
        rb.add([`${lab[key]}: sunlight (%)`, ...O.map(o => g(o, 'sun_pct', 1)), 'Now -> with the change.'], [ST.lab, ST.data, ST.data, ST.data, ST.note]);
        rb.add([`${lab[key]}: longest darkness (h)`, ...O.map(o => g(o, 'longest_dark_h', 1)), ''], [ST.lab, ST.data, ST.data, ST.data, ST.note]);
        rb.add([`${lab[key]}: Earth contact (%)`, ...O.map(o => g(o, 'contact_pct', 1)), ''], [ST.lab, ST.data, ST.data, ST.data, ST.note]);
        rb.add([`${lab[key]}: verdict`, ...O.map(o => { const h = o.x.hardware_toggles && o.x.hardware_toggles[key]; return h && h.verdict ? `${VW[h.verdict[0]]} -> ${VW[h.verdict[1]]}` : '-'; }), ''], [ST.lab, ST.data, ST.data, ST.data, ST.note]);
      }
    }
  }
  const wins = d.landing_windows || {};
  rb.h2('Landing windows at these sites', 4);
  rb.add(['Site', 'Opens (UTC)', 'Closes (UTC)', 'Best time (UTC)', 'A window is a run of landing times that are Go in the worst case (or Go at the median with caveats in the worst case).'], ST.head); rb.hts[rb.r] = 42;
  O.forEach(o => (wins[o.x.site] || []).forEach(wd => rb.add([o.x.site_name, iso(wd.open), iso(wd.close), iso(typeof wd.best === 'string' ? wd.best : wd.best && wd.best.landing_utc || wd.open), ''], [ST.lab, ST.data, ST.data, ST.data, null])));

  /* ---------- Calendar ---------- */
  const ca = Sheet(CAL, [26, 10, 18, 18, 18, 10]); ca.nogrid = true;
  ca.add(['Calendar: every landing time the engine checked'], ST.title);
  ca.para(`Every ${d.calendar.step_hours || 6} hours in the landing window, for every site. Use the filter arrows to look at one site or one verdict. The Score sheet counts these rows.`, ST.sub, 5);
  ca.skip();
  ca.add(['Site', 'Site id', 'Landing (UTC)', 'Verdict, median point', 'Verdict, worst case', 'Score'], ST.head); ca.freeze = 4; ca.filter = `A4:F${CR1}`;
  for (const s of m.sites) for (const r of d.calendar.sites[s.id]) ca.add([s.name, s.id, iso(r[0]), vcell(r[1]), vcell(r[2]), r[3]], [ST.data, ST.data, ST.data, null, null, ST.data]);

  /* ---------- Inputs ---------- */
  const ip = Sheet('Inputs', [36, 30, 12, 70]); ip.nogrid = true;
  ip.add(['Inputs: what the analysis was told, and by whom'], ST.title);
  ip.para('Every value used, with its origin. Declared: stated in the mission\'s public documents. Derived: computed from those documents. Asked: an answer or an example value that should be confirmed by the mission team.', ST.sub, 3);
  ip.skip();
  ip.add(['Field', 'Value', 'Origin', 'Source or note'], ST.head);
  const val = v => typeof v === 'object' ? JSON.stringify(v) : v === true ? 'Yes' : v === false ? 'No' : v;
  if (d.provenance) d.provenance.forEach(r => { const rr = ip.add([r.field, val(r.value), r.label, r.source || ''], [ST.lab, ST.data, ST.data, ST.note]); if (String(val(r.value)).length > 40) ip.hts[rr] = 54; });
  else Object.entries(m.P).forEach(([k, v]) => v != null && ip.add([k, val(v), 'your answer', ''], [ST.lab, ST.data, ST.data, ST.note]));
  if ((d.assumptions || []).length) { ip.h2('Assumptions where the mission gave no value', 3); d.assumptions.forEach(a => ip.para(a, ST.txt, 3)); }
  ip.h2('Inputs used by the cost and power sheets', 3);
  ip.add(['Power kept on during darkness (W)', m.L, m.loadGiven ? 'declared' : 'asked', 'Change it on the Power sheet.'], [ST.lab, ST.data, ST.data, ST.note]);
  ip.add(['Battery energy per kg (Wh/kg)', m.WHKG, 'derived', SRC.soa[0]], [ST.lab, ST.data, ST.data, ST.note]);
  m.prices.forEach(p => ip.add([p.label, p.usdPerKg, 'declared', p.note || ''], [ST.lab, { v: p.usdPerKg, z: '"$"#,##0', s: ST.data }, ST.data, ST.note]));

  /* ---------- Validation ---------- */
  const va = Sheet('Validation', [30, 16, 16, 16, 16, 16, 16]); va.nogrid = true;
  va.add(['Validation: how far you can trust the numbers'], ST.title);
  const V = S.validation;
  if (V) {
    va.para('Four independent checks, run before the app was published.', ST.sub, 6);
    va.h2('1. Sun and Earth positions against JPL Horizons', 6);
    va.add(['Comparisons', V.A_horizons.comparisons], [ST.lab, ST.data]);
    va.add(['Largest error in direction (deg)', V.A_horizons.max_az_err_deg], [ST.lab, { v: V.A_horizons.max_az_err_deg, z: '0.0000000', s: ST.data }]);
    va.add(['Largest error in elevation (deg)', V.A_horizons.max_el_err_deg], [ST.lab, { v: V.A_horizons.max_el_err_deg, z: '0.0000000', s: ST.data }]);
    va.add(['Pass threshold (deg)', V.A_horizons.threshold_deg, V.A_horizons.passed ? 'Passed' : 'Failed'], [ST.lab, ST.data, mergeSt(ST.calc, V.A_horizons.passed ? VS.green : VS.red)]);
    va.h2('2. Long-term sunlight and Earth view against NASA maps', 6);
    va.para(V.B_nasa_maps.note, ST.note, 6);
    va.add(['Site', 'Sunlight, ours (%)', 'Sunlight, NASA (%)', 'Difference', 'Earth view, ours (%)', 'Earth view, NASA (%)', 'Difference'], ST.head); va.hts[va.r] = 30;
    const b0 = va.r + 1, mabs = k => V.B_nasa_maps.sites.reduce((a, x) => a + Math.abs(+(x[k + '_ours'] - x[k + '_nasa']).toFixed(1)), 0) / V.B_nasa_maps.sites.length;
    V.B_nasa_maps.sites.forEach(s => { const r = va.r + 1; va.add([s.site, s.sun_ours, s.sun_nasa, F(`B${r}-C${r}`, +(s.sun_ours - s.sun_nasa).toFixed(1), { z: '0.0' }), s.earth_ours, s.earth_nasa, F(`E${r}-F${r}`, +(s.earth_ours - s.earth_nasa).toFixed(1), { z: '0.0' })], [ST.lab, ST.data, ST.data, ST.calc, ST.data, ST.data, ST.calc]); });
    const b1 = va.r;
    va.add(['Average gap (absolute)', '', '', F(`SUMPRODUCT(ABS(D${b0}:D${b1}))/COUNT(D${b0}:D${b1})`, mabs('sun'), { z: '0.0' }), '', '', F(`SUMPRODUCT(ABS(G${b0}:G${b1}))/COUNT(G${b0}:G${b1})`, mabs('earth'), { z: '0.0' })], ST.key);
    if (V.B2_resolution_test) { va.para('Why our sunlight is lower than NASA\'s maps: ' + V.B2_resolution_test.finding, ST.txt, 6); va.para(V.B2_resolution_test.conclusion, ST.note, 6); }
    if (V.C_published) { va.h2('3. Against published figures', 6); V.C_published.forEach(c => { va.para(c.reference, ST.txt, 6); va.add(['Ours', `${c.ours_position}, ${c.ours_illumination}% sunlight`], [ST.lab, ST.data]); va.span(1, 6); }); }
    if (V.D_unit_tests) { va.h2('4. Unit tests of the engine', 6); Object.entries(V.D_unit_tests.tests).forEach(([t, ok]) => { const r = va.add([t, '', '', '', '', ok ? 'Passed' : 'Failed'], [ST.txt, null, null, null, null, mergeSt(ST.calc, ok ? VS.green : VS.red)]); va.span(0, 4, r); }); }
  } else va.para('Validation report not loaded.', ST.note, 6);

  /* ---------- Method and sources ---------- */
  const me = Sheet('Method and sources', [4, 110]); me.nogrid = true;
  me.add(['Method, limits and sources'], ST.title);
  me.h2('How the answer is computed', 1);
  [`Terrain: NASA LOLA elevation models, 5 m per pixel around each site, 10 m and 80 m for the region, out to 300 km so distant mountains are included.`,
    `Horizons: from each point of the landing area, at the panel and antenna height (${P['power.panel_height_m'] || 2} m), we trace the skyline in every direction (0.25 deg steps).`,
    `Sun and Earth: their positions for every half hour from November 2026 to 2032 come from the JPL DE421 ephemeris (Skyfield), checked against JPL Horizons.`,
    `Sunlit: more than half of the Sun's disc is above the skyline. Earth contact: Earth is above the skyline and at least one NASA Deep Space Network complex sees the Moon.`,
    `Scan: every site, every ${d.calendar.step_hours || 6} hours in the landing window, is checked against the mission's requirements (Checks sheet) and scored (Score sheet).`,
    quick ? 'Quick check: the centre of each site, hourly. The full analysis adds the landing area, lander orientation and terrain error.' : `Worst case: the best options are re-checked at the worst and best points of the landing area and for 8 lander orientations; slopes and ice distances come from the same terrain; NASA terrain versions test the terrain error.`,
    `Power and cost: battery mass = longest darkness x power kept on / usable share / energy per kg; cost = mass x public delivery prices (Power and Cost sheets).`]
    .forEach((t, k) => { const r = me.add([`${k + 1}.`, t], [ST.lab, ST.txt]); me.hts[r] = Math.max(15, Math.ceil(t.length / 115) * 13.5 + 3); });
  me.h2('Not evaluated (check these before committing)', 1);
  (d.not_evaluated || []).forEach(t => me.add(['-', t], [ST.lab, ST.txt]));
  me.h2('Sources', 1);
  Object.values(SRC).forEach(([t, u]) => me.add(['', web(t, u)]));
  m.prices.forEach(p => me.add(['', web(p.label, p.url)]));
  (d.data_sources || []).forEach(t => me.add(['', t], [null, ST.note]));
  me.h2('Words used', 1);
  [['Landing area', 'The circle the lander can hit (also called landing ellipse).'], ['Worst case', 'The worst point of the landing area and the worst lander orientation.'], ['Permanently shadowed area', 'A crater floor or hollow the Sun never reaches; water ice can survive there for billions of years.'],
    ['Direct to Earth (DTE)', 'The lander talks straight to antennas on Earth, without a relay satellite.'], ['DSN', 'NASA Deep Space Network: big antennas in California, Spain and Australia.'], ['Usable share (depth of discharge)', 'How much of the battery is used before it is recharged.']]
    .forEach(([a, b]) => { me.add(['', `${a}: ${b}`], [null, ST.txt]); });

  /* ---------- Decision ---------- */
  const de = Sheet('Decision', [40, 26, 26, 26, 44]); de.nogrid = true;
  de.add(['Decision'], ST.title);
  de.para(`${m.mission}. ${d.trust_badge}.`, ST.sub, 4);
  de.skip();
  de.para(m.answer, mergeSt(ST.big, { font: { name: FN, sz: 13, bold: true, color: { rgb: m.best.verdict === 'red' ? '9B1C1C' : '0B6B35' } } }), 4);
  de.h2('Why', 4);
  m.why.forEach(t => de.para(`- ${t}`, ST.txt, 4));
  de.h2('The three options side by side', 4);
  de.add(['', ...optHead, 'Where it comes from'], ST.head);
  const D = (l, cells, src, st = ST.data) => de.add([l, ...cells, src], [ST.lab, st, st, st, ST.note]);
  D('Landing time', O.map(o => dt(o.x.landing_utc)), 'Score sheet (best time at each site)');
  de.add(['Verdict, worst case', ...O.map(o => vcell(o.verdict)), 'Checks sheet'], [ST.lab, null, null, null, ST.note]);
  D('Ranking score', O.map((o, i) => F(S_.score(i), o.score, { z: '0.0' })), 'Score sheet', ST.link);
  D('Sunlight (% of the stay)', O.map(o => o.sun[0] === o.sun[1] ? f(o.sun[0], 1) : `${f(o.sun[0], 1)} to ${f(o.sun[1], 1)}`), 'Robustness sheet');
  D('Longest darkness, worst case (h)', O.map(o => o.darkWorst), 'Power sheet');
  D('Earth contact (% of the stay)', O.map(o => +o.x.comms.contact_pct.toFixed(1)), 'Comms sheet');
  D('Longest silence from Earth (h)', O.map(o => o.x.comms.longest_gap_h), 'Comms sheet');
  D('Extra battery for the darkness (kg)', O.map((o, i) => F(S_.kg(i), o.battKg, { z: '0.0' })), 'Power sheet', ST.link);
  D('Cost to fly that battery, list price (US$)', O.map((o, i) => F(S_.cost(1, i), o.cost[1], { z: '"$"#,##0' })), 'Cost sheet', ST.link);
  D('Value of time without Sun or Earth (US$)', O.map((o, i) => F(S_.lostV(i), o.lostUsd, { z: '"$"#,##0' })), 'Cost sheet', ST.link);
  if (!quick) {
    D('Slope: median / steepest 10% (deg)', O.map(o => o.x.terrain ? `${f(o.x.terrain.median_deg, 1)} / ${f(o.x.terrain.p90_deg, 1)}` : '-'), 'Terrain and ice sheet');
    D('Nearest ice-bearing area over 0.01 km2 (km)', O.map(o => o.x.resources ? +o.x.resources['nearest_over_0.01km2_km'].toFixed(2) : '-'), 'Terrain and ice sheet');
    D('Landing can slip by (days)', O.map(o => o.x.slip_tolerance_days ?? '-'), 'Robustness sheet');
    D('Backup site within 3 days', O.map(o => o.x.backup_site ? `${o.x.backup_site.site_name}, ${day(o.x.backup_site.landing_utc)}` : '-'), 'Robustness sheet');
  }
  const rsr = D('Caveats and blockers', O.map(o => (o.x.reasons || []).join('; ') || 'None'), 'Checks sheet'); de.hts[rsr] = 44;
  de.h2('What would change this answer', 4);
  const chg = [];
  if (m.best.x.slip_tolerance_days != null) chg.push(`A landing ${m.best.x.slip_tolerance_days > 0 ? `more than ${f(m.best.x.slip_tolerance_days, 1)} days` : `${d.calendar.step_hours || 6} hours or more`} after the chosen time: the verdict at ${m.best.x.site_name} gets worse. Move to the backup site or the next window (Robustness and Calendar sheets).`);
  chg.push(`More power kept on in the dark: the battery and its cost grow in proportion at sites that go dark (Power sheet, sensitivity table).`);
  if (m.loadGiven === false) chg.push('The mission did not state its power use: 100 W is an example. Put the real figure on the Power sheet.');
  chg.push(`Things the analysis does not see: ${(d.not_evaluated || []).join('; ')}.`);
  chg.forEach(t => de.para(`- ${t}`, ST.txt, 4));

  /* ---------- Read me ---------- */
  const rm = Sheet('Read me', [30, 100]); rm.nogrid = true;
  rm.add(['Lunar Site Scout: landing site workbook'], ST.title);
  rm.para(`${m.mission}. Generated ${now} UTC by the Lunar Site Scout app (NASA Space Apps 2026). Each site is shown at its best landing time.`, ST.sub, 1);
  rm.skip();
  rm.add(['The answer', m.answer], [ST.lab, ST.big]); rm.hts[rm.r] = 32;
  rm.add(['Why', m.why.join(' ')], [ST.lab, ST.txt]); rm.hts[rm.r] = Math.ceil(m.why.join(' ').length / 105) * 13.5 + 4;
  rm.add(['Analysis', quick ? 'Quick check: the centre of each site, hourly.' : 'Full analysis: every point of the landing area, 8 lander orientations, NASA terrain error.'], [ST.lab, ST.txt]);
  rm.add(['Data', d.trust_badge], [ST.lab, ST.txt]);
  rm.h2('How to read it', 1);
  rm.add([{ v: 'Blue on yellow', s: ST.inp }, 'Inputs. Change one and every number that depends on it updates.'], [null, ST.txt]);
  rm.add([{ v: 'Black', s: ST.calc }, 'Formulas. Click a cell to see how it is calculated.'], [null, ST.txt]);
  rm.add([{ v: 'Green', s: ST.link }, 'Formulas that pull a value from another sheet.'], [null, ST.txt]);
  rm.add([{ v: 'Grey', s: ST.data }, 'Results of the analysis engine (NASA terrain, JPL Sun and Earth positions). Data, not formulas.'], [null, ST.txt]);
  rm.add([{ v: 'Go', s: VS.green }, 'Every check passes.'], [null, ST.txt]);
  rm.add([{ v: 'Go with caveats', s: VS.yellow }, 'No blocker, but something needs attention (the reason is written next to it).'], [null, ST.txt]);
  rm.add([{ v: 'No go', s: VS.red }, 'A mission requirement fails.'], [null, ST.txt]);
  rm.h2('Your question, and where the answer is', 1);
  [['Where and when should we land?', 'Decision'], ['Why this site and not another?', 'Score'], ['Which requirement does each site pass or fail?', 'Checks'], ['How much battery do we need?', 'Power'], ['What does each site cost us?', 'Cost'],
    ['When can we talk to Earth, and how much data can we send?', 'Comms'], ['Is the ground flat? How far is the ice?', 'Terrain and ice'], ['What if we land late, or the lander faces the wrong way?', 'Robustness'],
    ['Which other dates would work?', 'Calendar'], ['Show me every hour of the stay.', H[0]], ['What did you assume?', 'Inputs'], ['How accurate is this?', 'Validation'], ['How does it work? What is not checked?', 'Method and sources']]
    .forEach(([q, sh]) => rm.add([q, goto(sh)], [ST.txt, null]));

  const order = [rm, de, sc, ck, pw, co, cm, te, rb, ca, ...hourly, ip, va, me];
  const wb = X.utils.book_new();
  for (const s of order) X.utils.book_append_sheet(wb, toWs(X, s), s.name.slice(0, 31));
  wb.Props = { Title: 'Lunar Site Scout landing site workbook', Subject: m.mission, Author: 'Lunar Site Scout' };
  return wb;
}

export async function exportXLSX(S, C) {
  await load('web/vendor/xlsx-style.min.js');
  if (!S.validation) S.validation = await fetch('web-data/validation_report.json').then(r => r.json()).catch(() => null);
  window.XLSX.writeFile(buildWorkbook(window.XLSX, S, C), file(S, 'xlsx'));
}

/* ================= PDF report ================= */
export function buildPDF(jsPDF, S, C) {
  const m = model(S, C), d = m.d, O = m.opts, n = O.length, quick = m.quick;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' }), PW = 210, PH = 297, M = 16, CW = PW - 2 * M;
  const K = { ink: [24, 27, 33], grey: [95, 100, 110], light: [235, 237, 240], go: [22, 150, 80], care: [214, 150, 20], no: [200, 50, 45], sun: [245, 184, 61], earth: [78, 163, 255], line: [[30, 30, 30], [60, 120, 220], [150, 90, 210]] };
  const VC = { green: K.go, yellow: K.care, red: K.no };
  const head = { fillColor: K.ink, textColor: 255, fontStyle: 'bold', fontSize: 8, cellPadding: 1.8 }, body = { fontSize: 8, cellPadding: 1.6, textColor: 25, lineColor: [215, 218, 222], lineWidth: 0.15 };
  let y = 0;
  const T = (t, x, yy, o = {}) => { doc.setFont('helvetica', o.b ? 'bold' : o.i ? 'italic' : 'normal'); doc.setFontSize(o.s || 9); doc.setTextColor(...(o.c || K.ink)); const lines = o.w ? doc.splitTextToSize(String(t), o.w) : [String(t)]; doc.text(lines, x, yy, { align: o.a || 'left', lineHeightFactor: o.lh || 1.3 }); return yy + lines.length * (o.s || 9) * 0.3528 * (o.lh || 1.3); };
  const P = (t, o = {}) => { const s = o.s || 9, lines = doc.splitTextToSize(String(t), o.w || CW); if (y + lines.length * s * 0.46 > PH - 18) { doc.addPage(); y = 20; } y = T(t, o.x || M, y, { ...o, w: o.w || CW }) + (o.after ?? 1.6); };
  const H1 = (t, sub) => { doc.addPage(); y = 22; T(t, M, y, { s: 17, b: true }); y += 3; doc.setDrawColor(...K.ink); doc.setLineWidth(0.6); doc.line(M, y, PW - M, y); y += 7; if (sub) P(sub, { c: K.grey, s: 9.5, after: 4 }); };
  const H2 = t => { if (y > PH - 40) { doc.addPage(); y = 20; } y += 2; T(t, M, y, { s: 11, b: true }); y += 5; };
  const table = (h, rows, o = {}) => { doc.autoTable({ startY: y, margin: { left: M, right: M }, head: h ? [h] : undefined, body: rows, theme: 'grid', headStyles: head, styles: { ...body, ...(o.styles || {}) }, columnStyles: o.cols || { 0: { fontStyle: 'bold', cellWidth: o.w0 || 52 } }, didParseCell: o.cell }); y = doc.lastAutoTable.finalY + (o.after ?? 5); };
  const verdictCell = c => { const t = c.cell.raw; const v = t === 'Go' || t === 'OK' ? 'green' : t === 'Go with caveats' || t === 'Caveat' ? 'yellow' : t === 'No go' ? 'red' : null; if (v && c.section === 'body') { c.cell.styles.textColor = VC[v]; c.cell.styles.fontStyle = 'bold'; } };
  const optH = ['', ...O.map(o => `${o.i + 1}. ${o.x.site_name}`)];
  const dot = (x, yy, v) => { doc.setFillColor(...VC[v]); doc.circle(x, yy, 1.6, 'F'); };

  /* ---------- page 1: the answer ---------- */
  doc.setFillColor(...K.ink); doc.rect(0, 0, PW, 44, 'F');
  T('LUNAR SITE SCOUT', M, 17, { s: 9, b: true, c: [200, 205, 212] });
  T('Landing site report', M, 28, { s: 20, b: true, c: [255, 255, 255] });
  T(`${m.mission}  |  generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC  |  ${quick ? 'quick check' : 'full analysis'}`, M, 37, { s: 8.5, c: [200, 205, 212] });
  y = 58;
  const bv = m.best.verdict;
  doc.setFillColor(...VC[bv]); doc.rect(M, y - 6, 2.2, 22, 'F');
  T(bv === 'red' ? 'NO SITE PASSES EVERY CHECK' : `RECOMMENDATION: ${VW[bv].toUpperCase()}`, M + 6, y - 1, { s: 8.5, b: true, c: VC[bv] });
  y = T(m.answer, M + 6, y + 6, { s: 15, b: true, w: CW - 6, lh: 1.15 }) + 6;
  H2('Why');
  m.why.forEach(t => { doc.setFillColor(...K.ink); doc.circle(M + 1.2, y - 1.1, 0.7, 'F'); P(t, { x: M + 5, w: CW - 5, after: 1.2 }); });
  y += 3;
  // key numbers
  const b = m.best, tiles = [['Sunlight', `${f(b.sun[0])}${b.sun[0] !== b.sun[1] ? `-${f(b.sun[1])}` : ''}%`, 'of the stay', K.sun], ['Longest darkness', b.darkWorst ? hrs(b.darkWorst) : 'none', 'worst case', [120, 125, 135]], ['Earth contact', `${f(b.x.comms.contact_pct)}%`, `longest silence ${hrs(b.x.comms.longest_gap_h)}`, K.earth], ['Extra battery', b.battKg ? `${f(b.battKg, 1)} kg` : 'none', b.battKg ? `${usd(b.cost[1])} to fly it` : 'never goes dark', K.go]];
  const tw = (CW - 9) / 4;
  tiles.forEach(([l, v, s, c], k) => { const x = M + k * (tw + 3); doc.setFillColor(...K.light); doc.rect(x, y, tw, 24, 'F'); doc.setFillColor(...c); doc.rect(x, y, tw, 1.2, 'F'); T(l.toUpperCase(), x + 3, y + 6.5, { s: 7, b: true, c: K.grey }); T(v, x + 3, y + 14, { s: v.length > 12 ? 10 : 13, b: true }); T(s, x + 3, y + 20, { s: 7, c: K.grey }); });
  y += 32;
  H2('The three options');
  table(['', 'Site and landing time', 'Verdict', 'Sunlight', 'Longest dark', 'Earth contact', 'Battery cost'], O.map(o => [`${o.i + 1}`, `${o.x.site_name}\n${dt(o.x.landing_utc)}`, VW[o.verdict], `${f(o.sun[0])}${o.sun[0] !== o.sun[1] ? `-${f(o.sun[1])}` : ''}%`, o.darkWorst ? hrs(o.darkWorst) : 'none', `${f(o.x.comms.contact_pct)}%`, o.battKg ? usd(o.cost[1]) : '$0']),
    { cols: { 0: { cellWidth: 8, fontStyle: 'bold' }, 1: { cellWidth: 58 } }, cell: verdictCell });
  H2('Before you commit');
  const next = [];
  if (b.x.slip_tolerance_days != null) next.push(`Hold the date: ${b.x.slip_tolerance_days > 0 ? `after ${f(b.x.slip_tolerance_days, 1)} days of delay` : `with any delay of ${d.calendar.step_hours || 6} hours or more`} the verdict at ${b.x.site_name} gets worse.${b.x.backup_site ? ` Keep ${b.x.backup_site.site_name} (${day(b.x.backup_site.landing_utc)}) as the backup.` : ''}`);
  if (!m.loadGiven) next.push(`Give the real power use in the dark: costs here assume ${f(m.L)} W.`);
  next.push(`Check the landing area on 0.5-1 m images for rocks and small craters: the terrain used here resolves features of about ${quick ? '10' : f((b.x.terrain && b.x.terrain.resolution_m || 5) * 2)} m and larger.`);
  next.forEach(t => { doc.setFillColor(...K.ink); doc.circle(M + 1.2, y - 1.1, 0.7, 'F'); P(t, { x: M + 5, w: CW - 5, after: 1.2 }); });
  y += 2; H2('For each team');
  const pw0 = b.x.ranges || {}, tw3 = (CW - 6) / 3, tby = y, tot1 = O.map(o => o.cost[1] + o.lostUsd), lo1 = tot1.indexOf(Math.min(...tot1));
  const teams = [['Engineering', [b.battKg ? `Battery for the darkness: ${f(b.battWh)} Wh, ${f(b.battKg, 1)} kg at ${f(m.L)} W.` : 'No darkness: no extra battery.', pw0.array_needed_w ? `Solar array needed: ${f(pw0.array_needed_w[1])} W.` : !quick && pw0.battery_needed_wh ? `Battery with the real panels: up to ${f(pw0.battery_needed_wh[1])} Wh.` : quick && m.P['power.battery_wh'] ? `Your ${f(m.P['power.battery_wh'])} Wh battery lasts ${hrs(m.P['power.battery_wh'] * m.DOD / m.L)} on its own.` : '', b.x.terrain ? `Slope ${f(b.x.terrain.median_deg, 1)} deg median, ${f(b.x.terrain.p90_deg, 1)} deg steepest 10%.` : '', `Sun at touchdown: ${lvl(b.x.landing.sun_elevation_deg)}.`]],
    ['Operations', [`Earth contact ${f(b.x.comms.contact_pct)}% of the stay${b.x.comms.passes != null ? `, ${b.x.comms.passes} contact period(s)` : ''}.`, `Longest silence: ${hrs(b.x.comms.longest_gap_h)}.`, b.x.comms.data_possible_mb != null ? `Data to Earth: ${f(b.x.comms.data_possible_mb / 1000)} GB over the stay.` : '', b.x.resources ? `Ice-bearing shadow ${f(b.x.resources['nearest_over_0.01km2_km'], 1)} km away.` : '']],
    ['Finance', [`Battery to fly: ${usd(b.cost[1])} at the list price.`, `Time without Sun or Earth: ${usd(b.lostUsd)} of a ${usd(m.missionUsd)} mission.`, n > 1 ? (lo1 === 0 ? `Cheapest of the three; next best costs ${usd(Math.min(...tot1.slice(1)) - tot1[0])} more.` : `${O[lo1].x.site_name} is ${usd(tot1[0] - tot1[lo1])} cheaper overall (Power and cost page).`) : '']]];
  let tmax = 0;
  teams.forEach(([t, lines], k) => { const x0 = M + k * (tw3 + 3); let yy = tby + 5; T(t.toUpperCase(), x0 + 3, yy, { s: 7, b: true, c: K.grey }); yy += 4.5; lines.filter(Boolean).forEach(l => { yy = T(l, x0 + 3, yy, { s: 7.8, w: tw3 - 6 }) + 1.2; }); tmax = Math.max(tmax, yy - tby); });
  teams.forEach((_, k) => { doc.setDrawColor(215); doc.setLineWidth(0.2); doc.rect(M + k * (tw3 + 3), tby, tw3, tmax + 1); });
  y = PH - 22; T(`${d.trust_badge}. The data workbook (Excel) has every number and formula behind this report.`, M, y, { s: 7.5, c: K.grey, w: CW });

  /* ---------- page 2: why this site wins ---------- */
  H1('Why this ranking', `The engine checked every site every ${d.calendar.step_hours || 6} hours from ${day(m.first)} to ${day(m.last)}: ${f(m.sites.reduce((a, s) => a + s.n, 0))} landing times at ${m.sites.length} sites. Each landing time gets a verdict from the mission's requirements and a score. The three options are the best landing time at each of the three best sites.`);
  H2('The score');
  P(`score = 100 - ${m.W.worst} x worst-case verdict steps${m.W.med ? ` - ${m.W.med} x median verdict steps` : ''} + ${m.W.sun} x sunlight % + ${m.W.earth} x Earth contact %${m.W.dark ? ` - ${m.W.dark} x longest darkness (h)` : ''}`, { b: true, s: 8.5 });
  P('Verdict steps: Go = 0, Go with caveats = 1, No go = 2. The worst case dominates, so a site that is safe everywhere in the landing area always beats one that is only safe at its centre; sunlight and contact then separate the safe sites.', { c: K.grey, s: 8.5, after: 3 });
  table(['Site', 'Best landing (UTC)', 'Go times', 'Caveat', 'No go', 'Best score', ''], m.sites.map(s => [s.name, iso(s.top[0]), s.go, s.care, s.no, f(s.top[3], 1), s.pick >= 0 ? `Option ${s.pick + 1}` : '']),
    { cols: { 0: { fontStyle: 'bold', cellWidth: 50 }, 6: { fontStyle: 'bold' } }, styles: { fontSize: 7.5, cellPadding: 1.2 } });
  if (m.tie) P(`Options 1 and 2 score the same. What separates them: slope, distance to ice, how long the landing can slip and the backup site (next pages).`, { c: K.grey, s: 8.5 });
  H2('Requirement checks');
  const ckRows = [['Sun visible at touchdown', ...O.map(o => o.x.landing.sun_visible ? 'OK' : 'No go')]];
  if (m.P['landing.earth_visible_at_landing']) ckRows.push(['Earth in view at touchdown (required)', ...O.map(o => o.x.landing.earth_visible ? 'OK' : 'No go')]);
  if (m.P['mission.continuous_sun_required']) ckRows.push(['Sunlight without a break (required)', ...O.map(o => o.darkMed > 0 ? 'No go' : 'OK')]);
  ckRows.push(['Power data given', ...O.map(o => o.x.power && Object.keys(o.x.power).length ? 'OK' : o.darkMed > 0 ? 'Caveat' : 'OK')]);
  if (O.some(o => o.x.power && o.x.power.max_sustainable_load_w != null)) ckRows.push(['Power use given', ...O.map(o => o.x.power && o.x.power.max_sustainable_load_w != null ? 'Caveat' : 'OK')]);
  ckRows.push(['Earth contact at least 30% of the time', ...O.map(o => o.x.comms.contact_pct >= 30 ? 'OK' : 'Caveat')]);
  if (!quick) ckRows.push(['Landing area at least 90% flat enough', ...O.map(o => o.x.terrain && o.x.terrain.safe_fraction != null && o.x.terrain.safe_fraction < 0.9 ? 'Caveat' : 'OK')]);
  if (!quick && m.P['mission.max_distance_to_psr_km']) ckRows.push([`Ice within ${m.P['mission.max_distance_to_psr_km']} km`, ...O.map(o => o.x.resources && o.x.resources['nearest_over_0.01km2_km'] > m.P['mission.max_distance_to_psr_km'] ? 'No go' : 'OK')]);
  ckRows.push(['Verdict, worst case', ...O.map(o => VW[o.verdict])]);
  table(optH.map((h, k) => k ? h : 'Check'), ckRows, { cell: verdictCell, w0: 66 });
  const rs = O.filter(o => (o.x.reasons || []).length);
  if (rs.length) { H2('What the caveats mean'); rs.forEach(o => P(`${o.i + 1}. ${o.x.site_name}: ${o.x.reasons.join('; ')}.`, { s: 8.5 })); }

  /* ---------- one page per option ---------- */
  O.forEach(o => {
    const x = o.x;
    H1(`${o.i + 1}. ${x.site_name}`, `Landing ${dt(x.landing_utc)}, ${f(x.duration_h / 24, 1)} days on the surface. ${o.meta.lat != null ? `${f(Math.abs(o.meta.lat), 3)} deg S, ${f(o.meta.lon, 3)} deg E, ${f(o.meta.ground_height_m)} m high.` : ''}`);
    dot(M + 1.6, y - 1.2, o.verdict); T(`${VW[o.verdict]}${(x.reasons || []).length ? `: ${x.reasons.join('; ')}` : ''}`, M + 5, y, { s: 9.5, b: true, c: VC[o.verdict], w: CW - 5 }); y += 8;
    // timeline chart: sunlight and Earth lanes, Sun elevation line
    const lw = 24, cx = M + lw, cw = CW - lw, ch = 46, nH = o.nH, X = k => cx + k / nH * cw;
    T('Sun and Earth over the stay', M, y, { s: 8, b: true, c: K.grey }); y += 3;
    const top = y;
    doc.setFillColor(...K.light); doc.rect(cx, top, cw, 7, 'F'); doc.rect(cx, top + 9, cw, 7, 'F');
    for (let k = 0; k < nH; k++) { if (o.sunMed[k]) { doc.setFillColor(...K.sun); doc.rect(X(k), top, cw / nH + 0.05, 7, 'F'); } if (o.con[k]) { doc.setFillColor(...K.earth); doc.rect(X(k), top + 9, cw / nH + 0.05, 7, 'F'); } }
    T('Sunlit', M, top + 4.8, { s: 7.5, b: true }); T('Earth contact', M, top + 13.8, { s: 7.5, b: true });
    // height of the Sun and Earth above a level horizon
    const gy = top + 20, gh = ch - 20, el = o.s.sun_el, ee = o.s.earth_el, eMax = Math.max(1, ...el.map(Math.abs), ...ee.map(Math.abs)) * 1.05, Y = e => gy + gh / 2 - e / eMax * gh / 2;
    doc.setDrawColor(225); doc.setLineWidth(0.15); doc.rect(cx, gy, cw, gh); doc.setDrawColor(170); doc.line(cx, Y(0), cx + cw, Y(0));
    doc.setLineWidth(0.5); doc.setDrawColor(...K.sun); for (let k = 1; k < nH; k++) doc.line(X(k - 1), Y(el[k - 1]), X(k), Y(el[k]));
    doc.setDrawColor(...K.earth); for (let k = 1; k < nH; k++) doc.line(X(k - 1), Y(ee[k - 1]), X(k), Y(ee[k]));
    T('Height above', M, gy + 3, { s: 7, b: true }); T('a level horizon', M, gy + 6.2, { s: 7, b: true });
    T(`+${f(eMax, 1)} deg`, cx + 1, gy + 2.6, { s: 6, c: K.grey }); T('0 deg', cx + 1, Y(0) - 0.8, { s: 6, c: K.grey }); T(`-${f(eMax, 1)} deg`, cx + 1, gy + gh - 0.8, { s: 6, c: K.grey });
    doc.setFillColor(...K.sun); doc.rect(M, gy + 10, 3, 1, 'F'); T('Sun', M + 4, gy + 11, { s: 6.5 }); doc.setFillColor(...K.earth); doc.rect(M, gy + 14, 3, 1, 'F'); T('Earth', M + 4, gy + 15, { s: 6.5 });
    const days = Math.round(nH / 24), stepD = days > 16 ? 5 : days > 8 ? 2 : 1;
    for (let dd = 0; dd <= days; dd += stepD) { const xx = X(dd * 24); doc.setDrawColor(190); doc.line(xx, top + ch, xx, top + ch + 1.2); T(`day ${dd}`, xx, top + ch + 4, { s: 6, c: K.grey, a: dd === days ? 'right' : dd ? 'center' : 'left' }); }
    y = top + ch + 8;
    T('Bars: hours when the site is really sunlit and really in contact, mountains included. Lines: how high the Sun and Earth stand; near the pole both skim the horizon, so a small hill can hide them.', M, y, { s: 7, c: K.grey, w: CW }); y += 8;
    const rows = [
      ['Touchdown', `Sun ${lvl(x.landing.sun_elevation_deg)}${x.landing.sun_elevation_deg < 0 ? ' (still visible: the site is high)' : ''}, from ${f(x.landing.sun_azimuth_deg)} deg; Earth ${x.landing.earth_visible ? 'in view' : 'not in view'}, ${lvl(x.landing.earth_elevation_deg)}`],
      ['Sunlight', `${f(o.sun[0], 1)}${o.sun[0] !== o.sun[1] ? ` to ${f(o.sun[1], 1)}` : ''}% of the stay; first sunset after ${hrs(x.light.hours_to_sunset)}`],
      ['Longest darkness', `${hrs(o.darkMed)} at the centre, ${hrs(o.darkWorst)} in the worst case`],
      ['Earth contact', `${f(x.comms.contact_pct, 1)}% of the stay${x.comms.passes != null ? ` in ${x.comms.passes} period(s)` : ''}; longest silence ${hrs(x.comms.longest_gap_h)}`],
      ['Battery for darkness', o.battKg ? `${f(o.battWh)} Wh = ${f(o.battKg, 1)} kg at ${f(m.L)} W, ${usd(o.cost[0])} to ${usd(o.cost[2])} to fly` : 'None: the site never goes dark'],
    ];
    if (x.ranges && x.ranges.battery_needed_wh) rows.push(['Battery with the real panels', `${f(x.ranges.battery_needed_wh[0])} to ${f(x.ranges.battery_needed_wh[1])} Wh (engine simulation)`]);
    if (x.ranges && x.ranges.array_needed_w) rows.push(['Solar array needed', `${f(x.ranges.array_needed_w[0])} to ${f(x.ranges.array_needed_w[1])} W`]);
    if (x.ranges && x.ranges.max_sustainable_load_w) rows.push(['Highest load it supports', `${f(x.ranges.max_sustainable_load_w[0])} to ${f(x.ranges.max_sustainable_load_w[1])} W continuous`]);
    if (x.comms.data_possible_mb != null) rows.push(['Data to Earth', `${f(x.comms.data_possible_mb / 1000, 1)} GB over the stay`]);
    if (x.terrain) rows.push(['Ground', `slope ${f(x.terrain.median_deg, 1)} deg median, ${f(x.terrain.p90_deg, 1)} deg for the steepest 10%; ${f(100 * x.terrain.safe_fraction, 1)}% of the landing area under ${m.P['landing.max_slope_deg'] || 10} deg`]);
    if (x.resources) rows.push(['Ice', `nearest permanently shadowed area ${f(x.resources['nearest_over_0.01km2_km'], 1)} km (over 0.01 km2), ${f(x.resources.nearest_over_1km2_km, 1)} km (over 1 km2)`]);
    if (x.terrain_uncertainty) rows.push(['Terrain error', `${x.terrain_uncertainty.clones} NASA terrain versions: sunlight ${f(x.terrain_uncertainty.centre_sun_pct[0], 1)} to ${f(x.terrain_uncertainty.centre_sun_pct[1], 1)}%`]);
    if (x.slip_tolerance_days != null) rows.push(['If the landing slips', `stays ${VW[o.verdict]} for ${f(x.slip_tolerance_days, 1)} days${x.backup_site ? `; backup ${x.backup_site.site_name}, ${day(x.backup_site.landing_utc)}` : ''}`]);
    table(null, rows, { w0: 42 });
    if (x.landing.shadow_risk) P(`For the landing team: ${x.landing.shadow_risk}`, { s: 8, c: K.grey });
  });

  /* ---------- power and cost ---------- */
  H1('Power and cost', 'What each site costs, in battery mass and in surface time the mission cannot fully use. Public prices, not quotes.');
  H2('Battery for the darkness');
  P(`battery mass = longest darkness (worst case) x ${f(m.L)} W kept on / ${m.DOD} usable share / ${m.WHKG} Wh per kg`, { b: true, s: 8.5 });
  P(`${m.loadGiven ? 'Power use from the mission profile.' : 'The mission gives no power use, so 100 W is an example.'} ${m.WHKG} Wh/kg is the best lithium-ion cell in NASA's Small Spacecraft State of the Art report; real packs are heavier, so these figures are a floor.`, { s: 8.5, c: K.grey, after: 3 });
  table(optH, [['Longest darkness, worst case', ...O.map(o => hrs(o.darkWorst))], ['Energy to cross it', ...O.map(o => `${f(o.darkWorst * m.L)} Wh`)], ['Battery capacity', ...O.map(o => `${f(o.battWh)} Wh`)], ['Extra battery mass', ...O.map(o => `${f(o.battKg, 1)} kg`)],
    ...m.prices.map((p, k) => [`Cost at ${usd(p.usdPerKg)}/kg`, ...O.map(o => usd(o.cost[k]))])]);
  P(`Prices: ${m.prices.map(p => p.label).join('; ')}.`, { s: 7.5, c: K.grey, after: 3 });
  H2('Surface time without Sun or Earth');
  P(`value = hours without Sun or without Earth / hours on the surface x mission price (${usd(m.missionUsd)}, NASA CLPS task order CP-22). A pro-rata view: every hour is worth the same.`, { s: 8.5, after: 3 });
  table(optH, [['Hours without Sun or Earth', ...O.map(o => `${f(o.lostH)} of ${f(o.x.duration_h)} h`)], ['Share of the stay', ...O.map(o => `${f(100 * o.lostH / o.x.duration_h, 1)}%`)], ['Value of that time', ...O.map(o => usd(o.lostUsd))],
    ['Battery (list price) + lost time', ...O.map(o => usd(o.cost[1] + o.lostUsd))]], { cell: c => { if (c.row.index === 3 && c.section === 'body') c.cell.styles.fontStyle = 'bold'; } });
  const tot = O.map(o => o.cost[1] + o.lostUsd), lo = tot.indexOf(Math.min(...tot));
  P(n > 1 ? `Cheapest overall: ${O[lo].x.site_name}. ${O.filter((_, i) => i !== lo).map(o => `${o.x.site_name} costs ${usd(tot[o.i] - tot[lo])} more`).join('; ')}.` : '', { b: true, s: 9 });
  H2('If the lander keeps more on in the dark');
  table(['Power kept on', ...O.map(o => `${o.i + 1}. ${o.x.site_name}`)], [50, 100, 200, 500, 1000].map(w => [`${w} W`, ...O.map(o => o.darkWorst ? `${f(w * o.darkWorst / m.DOD / m.WHKG, 1)} kg, ${usd(w * o.darkWorst / m.DOD / m.WHKG * m.prices[1].usdPerKg)}` : 'no darkness')]), { w0: 30 });

  /* ---------- calendar ---------- */
  H1('Landing calendar', `Every landing time checked, ${day(m.first)} to ${day(m.last)}. Each cell is one landing time; colour = worst-case verdict. Black marks: the chosen times.`);
  const cal = d.calendar.sites, labW = 46, gx = M + labW, gw = CW - labW, rowH = 6.2;
  const len = Math.max(...Object.values(cal).map(r => r.length)), t0 = toDate(cal[m.sites[0].id][0][0]).getTime(), t1 = toDate(cal[m.sites[0].id][len - 1][0]).getTime(), TX = t => gx + (t - t0) / Math.max(1, t1 - t0) * gw * (len - 1) / len + gw / len / 2;
  m.sites.forEach((s, k) => {
    const yy = y + k * (rowH + 1.4), rows = cal[s.id];
    T(s.name, M, yy + 4.3, { s: 7.5, b: s.pick >= 0 });
    rows.forEach((r, j) => { doc.setFillColor(...VC[r[2]]); doc.rect(gx + j / len * gw, yy, gw / len + 0.05, rowH, 'F'); });
    if (s.pick >= 0) { const xx = TX(toDate(O[s.pick].x.landing_utc).getTime()); doc.setFillColor(0); doc.rect(xx - 0.4, yy - 1, 0.8, rowH + 2, 'F'); T(`${s.pick + 1}`, xx, yy - 1.6, { s: 6.5, b: true, a: 'center' }); }
  });
  y += m.sites.length * (rowH + 1.4) + 2;
  const span = (t1 - t0) / 86400000, every = span > 120 ? 30 : span > 40 ? 7 : span > 14 ? 3 : 1;
  for (let t = t0; t <= t1; t += every * 86400000) { const xx = TX(t); doc.setDrawColor(170); doc.line(xx, y, xx, y + 1.2); T(day(new Date(t).toISOString()).replace(/ \d{4}$/, ''), xx, y + 4.2, { s: 6, c: K.grey, a: 'center' }); }
  y += 9;
  [['Go', K.go], ['Go with caveats', K.care], ['No go', K.no]].forEach(([l, c], k) => { doc.setFillColor(...c); doc.rect(M + k * 40, y - 2.6, 4, 3, 'F'); T(l, M + k * 40 + 5.5, y, { s: 7.5 }); });
  y += 8;
  H2('Landing windows at the three sites');
  const wrows = []; O.forEach(o => (d.landing_windows[o.x.site] || []).forEach(w => wrows.push([o.x.site_name, iso(w.open), iso(w.close), iso(typeof w.best === 'string' ? w.best : w.best && w.best.landing_utc || w.open)])));
  if (wrows.length) table(['Site', 'Opens (UTC)', 'Closes (UTC)', 'Best (UTC)'], wrows, { w0: 50 }); else P('No window where the site is Go in the worst case.', { c: K.grey });

  /* ---------- assumptions, limits, validation, sources ---------- */
  H1('Inputs, limits and trust', 'What the analysis was told, what it does not see, and how it was checked.');
  H2('Inputs');
  const val = v => typeof v === 'object' ? (Array.isArray(v) ? `${v.length} item(s)` : JSON.stringify(v)) : v === true ? 'Yes' : v === false ? 'No' : String(v);
  if (d.provenance) table(['Field', 'Value', 'Origin and source'], d.provenance.map(r => [r.field, val(r.value), `${r.label}${r.source ? ': ' + r.source : ''}`]), { cols: { 0: { cellWidth: 52, fontStyle: 'bold' }, 1: { cellWidth: 34 } }, styles: { fontSize: 7, cellPadding: 1.1 } });
  else table(['Field', 'Value'], Object.entries(m.P).filter(([, v]) => v != null).map(([k, v]) => [k, val(v)]), { styles: { fontSize: 7.5 } });
  if ((d.assumptions || []).length) P('Assumed where the mission gave no value: ' + d.assumptions.join('; ') + '.', { s: 7.5, c: K.grey, after: 3 });
  H2('Not evaluated');
  (d.not_evaluated || []).forEach(t => P(`- ${t}`, { s: 8.5, after: 0.6 }));
  y += 2;
  const V = S.validation;
  if (V) {
    H2('Validation');
    P(`Sun and Earth directions match JPL Horizons within ${f(Math.max(V.A_horizons.max_az_err_deg, V.A_horizons.max_el_err_deg), 6)} deg over ${V.A_horizons.comparisons} comparisons (threshold ${V.A_horizons.threshold_deg} deg).`, { s: 8.5 });
    P(`Long-term sunlight against NASA's 60 m maps: our values average ${f(V.B_nasa_maps.mean_abs_sun_diff, 1)} points lower, because our 5 m terrain at hardware height sees small relief that blocks a grazing Sun. Earth view matches within ${f(V.B_nasa_maps.mean_abs_earth_diff, 1)} points. On 80 m terrain we match NASA within about 8 points with no bias, so the engine is right and the 5 m answer is the conservative one.`, { s: 8.5 });
    if (V.D_unit_tests) P(`Unit tests: ${Object.values(V.D_unit_tests.tests).filter(Boolean).length} of ${Object.keys(V.D_unit_tests.tests).length} passed (geometry, panel power, battery).`, { s: 8.5 });
  }
  H2('Sources');
  [...Object.values(SRC).map(([t, u]) => `${t}: ${u}`), ...m.prices.map(p => `${p.label}: ${p.url}`)].forEach(t => P(t, { s: 7.5, c: K.grey, after: 0.8 }));

  const np = doc.getNumberOfPages();
  for (let i = 1; i <= np; i++) { doc.setPage(i); T(`Lunar Site Scout  |  NASA Space Apps 2026  |  ${m.mission}`, M, PH - 8, { s: 7, c: K.grey }); T(`${i} / ${np}`, PW - M, PH - 8, { s: 7, c: K.grey, a: 'right' }); }
  return doc;
}

export async function exportPDF(S, C) {
  await load('web/vendor/jspdf.umd.min.js'); await load('web/vendor/jspdf.plugin.autotable.min.js');
  if (!S.validation) S.validation = await fetch('web-data/validation_report.json').then(r => r.json()).catch(() => null);
  buildPDF(window.jspdf.jsPDF, S, C).save(file(S, 'pdf'));
}
