# Lunar Site Scout – validated data for the web app

These files replace the front-end's own geometry. They come from our Python engine, which is:

- **validated against JPL Horizons**: 80 random Sun/Earth positions across all sites, max error 0.000016°;
- built on **NASA LOLA terrain**: 5 m around the site and 80 m out to 300 km, so distant mountains are included. This is the main reason our sunset and Earth times differ from the current app. Example: Shackleton rim, 15 Jan 2027, sunset in 5.8 days instead of 17.6;
- computed with the **Sun as a disc** (partial sunlight) and **exact UTC**, every hour from 2026-11-01 to 2032-12-31.

## Files

| File | Content |
|---|---|
| `index.json` | List of the 11 sites: id, name, lat/lon, map position (south polar stereographic, m), long-term sunlight % and Earth % |
| `<id>.json` | Site metadata, real horizon (0.25° azimuth steps, at 2 / 10 / 20 m above ground), horizon on 6 NASA terrain clones (uncertainty) |
| `<id>.bin` | Hourly time series, Float32 little-endian, row-major `[count x 9]` |
| `report_example.json` | Full Site Assessment Report for Griffin-1 (best options, landing windows, requirements, provenance) |
| `mission_profile_schema.json` | The 32-field Mission Profile |
| `validation_report.json` | All validation results |

### Columns of `<id>.bin`

| # | Name | Unit | Meaning |
|---|---|---|---|
| 0 | `sun_az` | deg | Sun azimuth (0 = north, 90 = east) |
| 1 | `sun_el` | deg | Sun elevation above the local horizontal |
| 2 | `earth_az` | deg | Earth azimuth |
| 3 | `earth_el` | deg | Earth elevation |
| 4 | `sun_frac_2m` | 0–1 | Visible fraction of the solar disc over the real terrain, at 2 m height (**power**) |
| 5 | `earth_margin_2m` | deg | Earth elevation minus terrain horizon at 2 m (> 0 means Earth is visible: **link**) |
| 6 | `sun_frac_10m` | 0–1 | Same at 10 m (mast) |
| 7 | `earth_margin_10m` | deg | Same at 10 m |
| 8 | `dsn_any` | 0/1 | At least one NASA Deep Space Network station (Goldstone, Madrid, Canberra) sees the Moon above 10° |

Time of row `i` = `time.start_unix + i * 3600` (UTC seconds).

## Reading it in the browser

```js
const meta = await (await fetch(`/data/${id}.json`)).json();
const buf = await (await fetch(`/data/${meta.bin.file}`)).arrayBuffer();
const a = new Float32Array(buf), C = meta.bin.columns.length;
const row = i => ({ t: meta.time.start_unix + i * 3600, sunAz: a[i*C], sunEl: a[i*C+1], earthAz: a[i*C+2], earthEl: a[i*C+3],
                    sunFrac: a[i*C+4], earthMargin: a[i*C+5], dsn: a[i*C+8] });
const i0 = Math.floor((Date.parse("2027-01-15T00:00Z")/1000 - meta.time.start_unix) / 3600);
// power OK: row(i).sunFrac > 0.5 ; Earth link OK: row(i).earthMargin > 0 && row(i).dsn === 1
```

The horizon for the panorama is `meta.horizon.elevation_deg[0]` (2 m), with x = index × 0.25°.
To show terrain uncertainty, draw the band between the min and max of `meta.horizon_terrain_clones` at each azimuth.

## Rules to keep in the UI (agreed with the team)

1. Show **ranges** when available (landing ellipse, terrain clones), never a single "exact" number.
2. When a mission value is unknown, show the **requirement** (battery needed, max sustainable load), never a guess.
3. Show what is **not evaluated** (craters smaller than 2× the terrain resolution, rocks, thermal model).

## Mission flow files (for Screens 1–4 of the product spec)

| File | Screen | Content |
|---|---|---|
| `presets/<mission>.json` | 1 | Mission Profile of 4 real missions: `griffin1`, `novac`, `artemis`, `argonaut`. Every field is `{v, l, src}`: value, label (declared / derived / asked / estimated) and source |
| `options/<mission>.json` | 2, 3, 4 | `summary` (recommendation sentence), `options` (top 3), `calendar`, `landing_windows`, `provenance`, `assumptions`, `not_evaluated`, `trust_badge` |
| `terrain/<id>_10m.bin` | 3 | Height map 901 × 901, 10 m pixels, ±4.5 km around the landing point (centre pixel), row 0 = north edge (map +y). See `terrain/terrain.json` |
| `terrain/region_600m.bin` | 2, 3 | Height map 901 × 901, 600 m pixels (area-averaged from the LOLA 80 m DEM), ±270 km around the south pole |
| `terrain/region_sun_600m.bin` | 2 | Same grid, uint8: percent of time the Sun is visible (NASA AVGVISIB_85S map, inside ±151 km), 255 = no data |
| `psr.json` | 3 (ice layer) | Permanently shadowed regions > 0.01 km²: `x_m`, `y_m` (south polar stereographic), `area_km2` |

Each element of `options[]` contains:

- `site`, `site_name`, `landing_utc`, `verdict`, `worst_case_verdict`, `reasons` (plain-English list)
- `landing` (Sun elevation and azimuth, Earth visible, `shadow_risk` sentence), `light`, `comms`, `power`, `terrain` (slope in the ellipse), `resources` (distance to ice), `terrain_uncertainty`
- `ranges`: worst-to-best across the landing ellipse, lander orientations and terrain clones
- `series_hourly`: `t`, Sun and Earth az/el, `sun_frac_worst_median_best` (3 arrays), `earth_contact`, `power_w`, `battery_soc` (null when not computable)
- `timeline_events`: sunrise/sunset and contact start/end → the **operations timeline export** (CSV / calendar)
- `hardware_toggles`: `mast_10m` and `tracking_panels`, each `[without, with]` for sunlight %, contact %, longest dark, battery needed, verdict
- `slip_tolerance_days`, `backup_site` (available if wanted later)

`calendar.sites[<id>]` = list of `[landing_utc, verdict, worst_case_verdict, score]` every 6 hours → the **landing-window calendar** (date × site grid).
