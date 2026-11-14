// Report (PDF, two pages) and data workbook (Excel), built in the browser.
const load = src => new Promise((res, rej) => { if (document.querySelector(`script[src="${src}"]`)) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s); });
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const toDate = s => new Date(/Z|\+/.test(s) ? s : s + 'Z');
const dt = s => { const d = toDate(s); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`; };
const f = (x, d = 0) => x == null || !isFinite(x) ? '-' : Number(x).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const rg = (r, d = 0, u = '') => !r || r[0] == null ? '-' : f(r[0], d) === f(r[1], d) ? f(r[0], d) + u : `${f(r[0], d)}-${f(r[1], d)}${u}`;
const usd = x => x == null || !isFinite(x) ? '-' : x >= 1e6 ? '$' + f(x / 1e6, 1) + 'M' : x >= 1e3 ? '$' + f(x / 1e3) + 'k' : '$' + f(x);
const darkW = x => (x.ranges && x.ranges.longest_dark_h ? x.ranges.longest_dark_h : [0, x.light.longest_dark_h])[1];
const missionName = (S, C) => { const m = C.MISSIONS.find(x => x.id === S.mission); return m ? m.name : 'Your mission (quick check)'; };
const file = (S, ext) => `lunar-site-scout_${S.mission}_${new Date().toISOString().slice(0, 10)}.${ext}`;

export async function exportPDF(S, C) {
  await load('web/vendor/jspdf.umd.min.js'); await load('web/vendor/jspdf.plugin.autotable.min.js');
  const { jsPDF } = window.jspdf, d = S.data, o = d.options, doc = new jsPDF({ unit: 'mm', format: 'a4' }), W = 210, M = 14;
  const head = { fillColor: [0, 0, 0], textColor: 255, fontStyle: 'bold', fontSize: 8 }, body = { fontSize: 7.6, cellPadding: 1.4, textColor: 20 }, col0 = { 0: { cellWidth: 42, fontStyle: 'bold' } };
  const keep = rows => rows.filter(r => r.slice(1).some(v => v !== '-'));
  const title = (t, y) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(0); doc.text(t.toUpperCase(), M, y); return y + 2; };
  // ---------- page 1: the decision ----------
  doc.setFillColor(0, 0, 0); doc.rect(0, 0, W, 30, 'F');
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text('LUNAR SITE SCOUT', M, 13);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(`Landing site report. ${missionName(S, C)}. Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC.`, M, 21);
  doc.setTextColor(0); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  const v = C.verdictOf(o[0]), answer = v === 'red' ? 'No site fully meets the requirements.' : `Recommended: ${o[0].site_name}, landing ${dt(o[0].landing_utc)}.`;
  doc.text(doc.splitTextToSize(answer, W - 2 * M), M, 40);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(70);
  doc.text(doc.splitTextToSize(`${d.trust_badge}.${d.quick ? ' Quick check: centre point of each site, hourly. The full analysis also covers the landing area, lander orientation and terrain error.' : ' Worst case covers the whole landing area, every lander orientation and NASA terrain error.'}`, W - 2 * M), M, 47);
  let y = title('Options', 58);
  doc.autoTable({ startY: y + 1, margin: { left: M, right: M }, headStyles: head, styles: body, theme: 'grid', columnStyles: col0,
    head: [['', ...o.map((x, i) => `${i + 1}. ${x.site_name}`)]],
    body: keep([
      ['Landing (UTC)', ...o.map(x => dt(x.landing_utc))],
      ['Verdict', ...o.map(x => C.vx(C.verdictOf(x)))],
      ['Time in sunlight', ...o.map(x => rg(x.ranges && x.ranges.sun_pct || [x.light.sun_pct, x.light.sun_pct], 0, '%'))],
      ['Longest darkness', ...o.map(x => rg(x.ranges && x.ranges.longest_dark_h || [x.light.longest_dark_h, x.light.longest_dark_h], 1, ' h'))],
      ['Earth contact', ...o.map(x => rg(x.ranges && x.ranges.contact_pct || [x.comms.contact_pct, x.comms.contact_pct], 0, '%'))],
      ['Longest contact gap', ...o.map(x => f(x.comms.longest_gap_h, 1) + ' h')],
      ['Slope (median, 90th pct)', ...o.map(x => x.terrain ? `${f(x.terrain.median_deg, 1)} deg, ${f(x.terrain.p90_deg, 1)} deg` : 'not in quick check')],
      ['Nearest dark area > 0.01 km2', ...o.map(x => x.resources ? f(x.resources['nearest_over_0.01km2_km'], 1) + ' km' : 'not in quick check')],
      ['Landing can slip by', ...o.map(x => x.slip_tolerance_days != null ? f(x.slip_tolerance_days) + ' days' : '-')],
      ['Backup site', ...o.map(x => x.backup_site ? `${x.backup_site.site_name}, ${dt(x.backup_site.landing_utc)}` : '-')],
      ['Reasons', ...o.map(x => (x.reasons || []).join('; ') || 'None')],
    ]) });
  y = title('Cost scenario (public prices, not a quote)', doc.lastAutoTable.finalY + 8);
  doc.autoTable({ startY: y + 1, margin: { left: M, right: M }, headStyles: head, styles: body, theme: 'grid', columnStyles: col0,
    head: [['', ...o.map((x, i) => `${i + 1}. ${x.site_name}`)]],
    body: keep([
      ['Extra battery for darkness', ...o.map(x => `${f(C.battKg(darkW(x)), 1)} kg`)],
      ['Cost to deliver it', ...o.map(x => usd(C.costDark(darkW(x))))],
      ['Hours without Sun or Earth contact', ...o.map(x => `${f(C.lostHours(x))} of ${f(x.duration_h)} h`)],
      ['Paid surface time not fully usable', ...o.map(x => usd(C.valueLost(C.lostHours(x), x.duration_h)))],
    ]) });
  doc.setFontSize(7.5); doc.setTextColor(70);
  const p = C.priceNow();
  doc.text(doc.splitTextToSize(`Inputs: ${f(C.COST.loadW)} W kept on in the dark${S.data.costLoadGiven ? ' (from the mission profile)' : ' (power use not given, 100 W used)'}; battery ${C.BATT_WH_PER_KG} Wh/kg (best Li-ion cells, NASA Small Spacecraft State of the Art), 80% usable, so mass and cost are lower bounds; delivery price ${p.label} (${p.url}); mission price ${usd(C.COST.missionUsd)}.`, W - 2 * M), M, doc.lastAutoTable.finalY + 5);
  // ---------- page 2: for engineers ----------
  doc.addPage(); y = title('Engineering detail', 16);
  doc.autoTable({ startY: y + 1, margin: { left: M, right: M }, headStyles: head, styles: body, theme: 'grid', columnStyles: col0,
    head: [['', ...o.map((x, i) => `${i + 1}. ${x.site_name}`)]],
    body: keep([
      ['Sun at touchdown (deg)', ...o.map(x => f(x.landing.sun_elevation_deg, 2))],
      ['Earth at touchdown (deg)', ...o.map(x => x.landing.earth_visible ? f(x.landing.earth_elevation_deg, 2) : 'not visible')],
      ['Hours to first sunset', ...o.map(x => f(x.light.hours_to_sunset, 1))],
      ['Solar array needed (W)', ...o.map(x => x.ranges && x.ranges.array_needed_w ? rg(x.ranges.array_needed_w) : '-')],
      ['Battery needed (Wh)', ...o.map(x => x.ranges && x.ranges.battery_needed_wh ? rg(x.ranges.battery_needed_wh) : x.power && x.power.battery_needed_wh != null ? f(x.power.battery_needed_wh) : '-')],
      ['Max continuous load (W)', ...o.map(x => x.ranges && x.ranges.max_sustainable_load_w ? rg(x.ranges.max_sustainable_load_w) : '-')],
      ['Data downlink possible (GB)', ...o.map(x => x.comms.data_possible_mb != null ? f(x.comms.data_possible_mb / 1000) : '-')],
      ['Terrain versions (sunlight)', ...o.map(x => x.terrain_uncertainty ? `${x.terrain_uncertainty.clones}: ${rg(x.terrain_uncertainty.centre_sun_pct, 0, '%')}` : '-')],
      ['Lander orientation', ...o.map(x => x.orientation || '-')],
      ['Landing shadow note', ...o.map(x => x.landing.shadow_risk || '-')],
    ]) });
  const prov = d.provenance ? d.provenance.map(r => [r.field, JSON.stringify(r.value), `${r.label}${r.source ? ': ' + r.source : ''}`]) : d.profile ? Object.entries(d.profile).map(([k, v]) => [k, JSON.stringify(v), 'your answer']) : [];
  if (prov.length) { y = title('Inputs and where they came from', doc.lastAutoTable.finalY + 7); doc.autoTable({ startY: y + 1, margin: { left: M, right: M }, headStyles: head, styles: { ...body, fontSize: 6.8, cellPadding: 0.9 }, theme: 'grid', head: [['Field', 'Value', 'Source']], body: prov, columnStyles: { 0: { cellWidth: 50 }, 2: { cellWidth: 95 } } }); }
  y = title('Method, limits and sources', doc.lastAutoTable.finalY + 7);
  const lines = [
    'Method: hourly Sun and Earth positions (JPL DE421 via Skyfield, checked against JPL Horizons) against horizons ray-traced on NASA LOLA terrain (5-10 m near the site, 80 m to 300 km). Sunlit = more than half of the solar disc above the terrain. Earth contact = Earth above the terrain and a NASA Deep Space Network station that sees the Moon.',
    d.assumptions && d.assumptions.length ? 'Assumptions: ' + d.assumptions.join('; ') + '.' : '',
    d.not_evaluated && d.not_evaluated.length ? 'Limits, not evaluated here: ' + d.not_evaluated.join('; ') + '.' : '',
    d.data_sources && d.data_sources.length ? 'Sources: ' + d.data_sources.join('; ') + '.' : '',
  ].filter(Boolean);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(40); let yy = y + 4;
  for (const l of lines) { const t = doc.splitTextToSize(l, W - 2 * M); if (yy + t.length * 3 > 287) { doc.addPage(); yy = 16; } doc.text(t, M, yy); yy += t.length * 3 + 1.5; }
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(7); doc.setTextColor(120); doc.text(`Lunar Site Scout, NASA Space Apps 2026. Page ${i} of ${n}`, M, 292); }
  doc.save(file(S, 'pdf'));
}

export async function exportXLSX(S, C) {
  await load('web/vendor/xlsx.mini.min.js');
  const X = window.XLSX, d = S.data, o = d.options, wb = X.utils.book_new(), add = (name, rows) => X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(rows), name.slice(0, 31));
  add('Summary', [
    ['Lunar Site Scout', missionName(S, C), 'generated ' + new Date().toISOString()],
    [d.trust_badge], [],
    ['Rank', 'Site', 'Landing UTC', 'Verdict', 'Sunlight % min', 'Sunlight % max', 'Longest darkness h (worst)', 'Earth contact % min', 'Longest contact gap h', 'Slope median deg', 'Slope p90 deg', 'Nearest dark area km', 'Slip tolerance days', 'Extra battery kg', 'Cost of darkness USD', 'Hours without Sun or contact', 'Value of unusable time USD', 'Reasons'],
    ...o.map((x, i) => [i + 1, x.site_name, x.landing_utc, C.vx(C.verdictOf(x)), (x.ranges && x.ranges.sun_pct || [x.light.sun_pct])[0], (x.ranges && x.ranges.sun_pct || [0, x.light.sun_pct])[1], darkW(x),
      (x.ranges && x.ranges.contact_pct || [x.comms.contact_pct])[0], x.comms.longest_gap_h, x.terrain ? x.terrain.median_deg : null, x.terrain ? x.terrain.p90_deg : null,
      x.resources ? x.resources['nearest_over_0.01km2_km'] : null, x.slip_tolerance_days ?? null, +C.battKg(darkW(x)).toFixed(2), Math.round(C.costDark(darkW(x))), C.lostHours(x), Math.round(C.valueLost(C.lostHours(x), x.duration_h)), (x.reasons || []).join('; ')]),
  ]);
  o.forEach((x, i) => {
    const s = x.series_hourly, ev = {}; for (const e of x.timeline_events || []) ev[e.time] = (ev[e.time] ? ev[e.time] + '; ' : '') + e.event.replace(/_/g, ' ');
    add(`Hourly ${i + 1} ${x.site_name}`, [['utc', 'hours after landing', 'sun elevation deg', 'sun azimuth deg', 'sunlit fraction worst', 'sunlit fraction median', 'sunlit fraction best', 'earth elevation deg', 'earth azimuth deg', 'earth contact', 'solar power W', 'battery state of charge', 'event'],
      ...s.t.map((t, k) => [t, k, +s.sun_el[k].toFixed(3), +s.sun_az[k].toFixed(3), +s.sun_frac_worst_median_best[0][k].toFixed(3), +s.sun_frac_worst_median_best[1][k].toFixed(3), +s.sun_frac_worst_median_best[2][k].toFixed(3), +s.earth_el[k].toFixed(3), +s.earth_az[k].toFixed(3), +s.earth_contact[k], s.power_w ? +s.power_w[k].toFixed(1) : null, s.battery_soc ? +s.battery_soc[k].toFixed(3) : null, ev[t] || ''])]);
  });
  const cal = d.calendar, ids = Object.keys(cal.sites);
  add('Landing calendar', [['landing UTC', ...ids.map(id => (S.index.sites.find(s => s.id === id) || {}).name || id)], ...cal.sites[ids[0]].map((r, k) => [r[0], ...ids.map(id => cal.sites[id][k][2])])]);
  add('Inputs', d.provenance ? [['field', 'value', 'label', 'source'], ...d.provenance.map(r => [r.field, JSON.stringify(r.value), r.label, r.source || ''])] : [['field', 'value'], ...Object.entries(d.profile || {}).map(([k, v]) => [k, JSON.stringify(v)])]);
  const p = C.priceNow();
  add('Cost scenario', [['Scenario from public prices, not a quote'], ['Power kept on in the dark W', C.COST.loadW], ['Battery Wh per kg (NASA SoA best Li-ion cell, lower bound on mass)', C.BATT_WH_PER_KG], ['Usable charge', 0.8], ['Delivery price USD per kg', p.usdPerKg], ['Delivery price source', p.label, p.url], ['Mission price USD', C.COST.missionUsd],
    ['Formula', 'extra battery kg = longest darkness h x power W / 0.8 / Wh per kg; cost = kg x price; value of unusable time = hours without Sun or contact / stay x mission price']]);
  add('Method and limits', [['Method', 'Hourly Sun/Earth positions (JPL DE421, Skyfield, checked against JPL Horizons) against horizons ray-traced on NASA LOLA terrain; sunlit = more than half the solar disc above terrain; contact = Earth above terrain and a DSN station sees the Moon'],
    ...(d.assumptions || []).map(a => ['Assumption', a]), ...(d.not_evaluated || []).map(a => ['Not evaluated', a]), ...(d.data_sources || []).map(a => ['Source', a])]);
  X.writeFile(wb, file(S, 'xlsx'));
}
