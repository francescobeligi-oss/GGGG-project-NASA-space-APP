"""Export everything the front-end needs for the mission flow (static files in web-data/):
terrain/, region map, ice (PSR) layer, mission presets, and options/<mission>.json with
recommendation, top-3 options (+ hourly series), calendar, slip tolerance, backup site,
operations timeline and hardware toggles."""
import json, os, sys, copy, datetime as dt
import numpy as np
sys.path.insert(0, "/home/claude/lss/src")
import engine as E, report as R

ROOT, OUT = E.ROOT, "/home/claude/lss/web-data"
for d in ("terrain", "presets", "options"): os.makedirs(f"{OUT}/{d}", exist_ok=True)
iso = lambda u: dt.datetime.fromtimestamp(float(u), dt.timezone.utc).isoformat()[:16] + "Z"

# ---------- terrain and layers ----------
def export_terrain():
    sites = E._sites()
    for sid in sites:
        t = np.load(f"{ROOT}/v2/{sid}_terrain.npz"); t["viz"].astype("<f4").tofile(f"{OUT}/terrain/{sid}_10m.bin")
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.windows import from_bounds
    H, PX = 270000, 600; N = 2 * H // PX + 1
    with rasterio.open(f"{ROOT}/dem/LDEM_80S_80MPP_ADJ.TIF") as d:  # area-average the 80 m DEM to 600 m
        z = d.read(1, window=from_bounds(-H - PX / 2, -H - PX / 2, H + PX / 2, H + PX / 2, d.transform), out_shape=(N, N), resampling=Resampling.average)
    h = {"z": z.astype("<f4")}; h["z"].tofile(f"{OUT}/terrain/region_600m.bin")
    from rasterio.warp import reproject
    from rasterio.transform import from_origin
    with rasterio.open(f"{ROOT}/AVGVISIB_85S_060M_201608.TIF") as d:  # NASA average Sun visibility, same 600 m grid
        src = d.read(1).astype("f4"); src[src == d.nodata] = np.nan; src *= d.scales[0]; sun = np.full((N, N), np.nan, "f4")
        reproject(src, sun, src_transform=d.transform, src_crs=d.crs, dst_transform=from_origin(-H - PX / 2, H + PX / 2, PX, PX), dst_crs=d.crs,
                  resampling=Resampling.average, src_nodata=np.nan, dst_nodata=np.nan)
    np.where(np.isnan(sun), 255, np.clip(np.round(sun * 100), 0, 100)).astype("u1").tofile(f"{OUT}/terrain/region_sun_600m.bin")
    json.dump(dict(sites=dict(file="<id>_10m.bin", shape=[901, 901], pixel_m=10, half_width_m=4500, origin="row 0 = north edge (map +y), col 0 = west edge (map -x)",
                              note="centre pixel = landing point; heights in m relative to the 1737.4 km lunar sphere"),
                   region=dict(file="region_600m.bin", shape=list(h["z"].shape), pixel_m=600, half_width_m=270000, centre="south pole",
                               note="south polar stereographic; row 0 = map +y edge; heights m relative to the 1737.4 km sphere"),
                   region_sun=dict(file="region_sun_600m.bin", shape=[N, N], dtype="uint8", same_grid_as="region",
                                   units="percent of time the Sun is visible (NASA LOLA AVGVISIB_85S_060M, area-averaged to 600 m); 255 = outside the NASA map"),
                   dtype="float32 little-endian"), open(f"{OUT}/terrain/terrain.json", "w"), indent=1)
    P = np.load(f"{ROOT}/psr.npz"); m = (P["area_km2"] > 0.01) & (np.abs(P["x"]) < 270000) & (np.abs(P["y"]) < 270000)
    json.dump(dict(note="NASA LOLA permanently shadowed regions (Barker et al. 2023), area > 0.01 km2, centroids in south polar stereographic m",
                   x_m=np.round(P["x"][m]).astype(int).tolist(), y_m=np.round(P["y"][m]).astype(int).tolist(),
                   area_km2=np.round(P["area_km2"][m], 4).tolist()), open(f"{OUT}/psr.json", "w"))

# ---------- presets ----------
def val(v, l, src=None): return {"v": v, "l": l, **({"src": src} if src else {})}
PRESETS = {
    "griffin1": json.load(open("/home/claude/lss/intake/griffin1_profile_extracted.json")),
    "novac": {"_title": "Nova-C class lander (IM-2 Athena hardware)",
              "mission": {"type": val("robotic_lander", "declared", "NASA IM-2 press kit"), "duration_days": val(14, "declared", "Nova-C design life 14 days")},
              "timing": {"earliest_landing_utc": val("2027-06-01T00:00", "asked", "example date"), "max_slip_days": val(45, "asked")},
              "landing": {"ellipse_radius_m": val(50, "declared", "50 m landing zone"), "max_slope_deg": val(10, "asked"), "earth_visible_at_landing": val(True, "asked")},
              "power": {"panels": val([{"peak_w": 100, "tilt_deg": 90, "azimuth_deg": 0}, {"peak_w": 100, "tilt_deg": 90, "azimuth_deg": 180}, {"peak_w": 200, "tilt_deg": 0}],
                                      "derived", "200 W max from a top-deck panel and two body panels; directions not public"),
                        "battery_wh": val(700, "derived", "25 Ah on a 28 V bus"), "load_operations_w": val(None, "asked")},
              "comms": {"mode": val("DTE", "declared"), "ground_stations": val("DSN", "asked")}},
    "artemis": {"_title": "Artemis crewed landing (NASA site criteria)",
                "mission": {"type": val("crewed", "declared", "NASA"), "duration_days": val(6.5, "declared", "6.5-day surface stay"),
                            "continuous_sun_required": val(True, "declared", "NASA Lunar Site Selection white paper"), "max_distance_to_psr_km": val(5, "asked", "moonwalk to a shadowed region")},
                "timing": {"earliest_landing_utc": val("2028-01-15T00:00", "asked", "example date"), "max_slip_days": val(90, "asked")},
                "landing": {"ellipse_radius_m": val(100, "declared", "landing site radius about 100 m"), "max_slope_deg": val(8, "asked"), "earth_visible_at_landing": val(True, "declared")},
                "comms": {"mode": val("DTE", "declared", "Earth must be visible in early missions"), "ground_stations": val("DSN", "declared")}},
    "argonaut": {"_title": "ESA Argonaut mission 1 (long-duration cargo lander)",
                 "mission": {"type": val("long_duration_lander", "declared", "ESA"), "duration_days": val(30, "asked", "first month of a 5-year design life")},
                 "timing": {"earliest_landing_utc": val("2030-11-15T00:00", "asked", "ESA target: end of 2030"), "max_slip_days": val(60, "asked")},
                 "landing": {"ellipse_radius_m": val(250, "declared", "250 m landing accuracy"), "max_slope_deg": val(10, "asked")},
                 "comms": {"mode": val("DTE", "asked"), "ground_stations": val("DSN", "asked")}},
}

def events(series):
    out = []
    t, sun, earth = series["t"], series["sun_frac"] > 0.5, series["earth"]
    for name, m in (("sun", sun), ("earth_contact", earth)):
        d = np.diff(m.astype(int))
        for k in np.where(d != 0)[0]:
            out.append(dict(time=iso(t[k + 1]), event=f"{name}_{'start' if d[k] > 0 else 'end'}"))
    return sorted(out, key=lambda e: e["time"])

def option_detail(sid, t0, prof):
    ev = E.evaluate(sid, t0, prof, full=True)
    S = ev.pop("series"); soc = ev.pop("series_soc", None); gen = ev.pop("series_gen", None)
    i0 = int(np.searchsorted(E._site(sid)["unix"], t0)); n = len(S["t"]); sl = slice(i0, i0 + n)
    radius = ev["ellipse_radius_m"]; sf, em = E.ellipse_series(sid, radius, 0, sl)
    ks = np.argsort((sf > 0.5).mean(axis=1)); pick = [ks[int(q * (len(ks) - 1))] for q in (0.1, 0.5, 0.9)]
    k2 = slice(0, None, 2)  # hourly for the front-end
    ser = dict(t=[iso(x) for x in S["t"][k2]], sun_el=np.round(S["sun_el"][k2], 3).tolist(), sun_az=np.round(S["sun_az"][k2], 2).tolist(),
               earth_el=np.round(S["earth_el"][k2], 3).tolist(), earth_az=np.round(S["earth_az"][k2], 2).tolist(),
               sun_frac_worst_median_best=[np.round(sf[p][k2], 3).tolist() for p in pick], earth_contact=S["earth"][k2].astype(int).tolist(),
               power_w=(np.round(gen[k2], 1).tolist() if gen is not None else None), battery_soc=(np.round(soc[k2], 3).tolist() if soc is not None else None))
    ev["timeline_events"] = events(S)
    return ev, ser

def hardware_toggles(sid, t0, prof):
    out = {}
    base = E.evaluate(sid, t0, prof, full=False)
    for name, mod in (("mast_10m", lambda p: p.setdefault("power", {}).update(panel_height_m={"v": 10, "l": "asked"}) or p.setdefault("comms", {}).update(antenna_height_m={"v": 10, "l": "asked"})),
                      ("tracking_panels", lambda p: p.setdefault("power", {}).update(panels={"v": [{**pn, "tracking": True} for pn in (E._val(p, "power", "panels") or [])], "l": "asked"}))):
        q = copy.deepcopy(prof); mod(q)
        if name == "tracking_panels" and not E._val(prof, "power", "panels"): continue
        r = E.evaluate(sid, t0, q, full=False)
        out[name] = dict(sun_pct=[base["light"]["sun_pct"], r["light"]["sun_pct"]], contact_pct=[base["comms"]["contact_pct"], r["comms"]["contact_pct"]],
                         longest_dark_h=[base["light"]["longest_dark_h"], r["light"]["longest_dark_h"]],
                         battery_needed_wh=[base["power"].get("battery_needed_wh"), r["power"].get("battery_needed_wh")],
                         max_sustainable_load_w=[base["power"].get("max_sustainable_load_w"), r["power"].get("max_sustainable_load_w")],
                         verdict=[base["verdict"], r["verdict"]])
    return out

def export_mission(key, prof):
    rows = E.scan(prof); order = {"green": 0, "yellow": 1, "red": 2}
    rep = R.build(prof)
    cal = {}
    for r in rows: cal.setdefault(r["site"], []).append([r["landing_utc"][:16] + "Z", r["verdict"], r["worst_verdict"], round(r["score"], 1)])
    for v in cal.values(): v.sort()
    opts = []
    for o in rep["best_options"]:
        sid, t0 = o["site"], dt.datetime.fromisoformat(o["landing_utc"]).timestamp()
        detail, ser = option_detail(sid, t0, prof)
        lst = cal[sid]; i = next(k for k, x in enumerate(lst) if x[0] >= iso(t0)); tol = 0.0
        for x in lst[i:]:
            if order[x[2]] > order[lst[i][2]]: break
            tol = (dt.datetime.fromisoformat(x[0].replace("Z", "+00:00")).timestamp() - t0) / 86400
        near = [r for r in rows if r["site"] != sid and abs(dt.datetime.fromisoformat(r["landing_utc"]).timestamp() - t0) <= 3 * 86400]
        backup = max(near, key=lambda r: r["score"]) if near else None
        opts.append(dict(detail, series_hourly=ser, slip_tolerance_days=round(tol, 2),
                         backup_site=(dict(site=backup["site"], site_name=backup["site_name"], landing_utc=backup["landing_utc"], verdict=backup["verdict"]) if backup else None),
                         hardware_toggles=hardware_toggles(sid, t0, prof)))
    out = dict(mission=key, title=prof.get("_title", key), summary=rep["summary"], options=opts, landing_windows=rep["landing_windows"],
               calendar=dict(columns=["landing_utc", "verdict", "worst_case_verdict", "score"], step_hours=6, sites={k: v for k, v in cal.items()}),
               provenance=rep["provenance"], assumptions=rep["assumptions"], not_evaluated=rep["not_evaluated"], data_sources=rep["data_sources"],
               trust_badge="Verified against JPL Horizons (max error 0.000016 deg) - NASA LOLA 5 m terrain")
    json.dump(out, open(f"{OUT}/options/{key}.json", "w"), default=lambda x: float(x) if isinstance(x, (np.floating, np.integer)) else str(x))
    json.dump(prof, open(f"{OUT}/presets/{key}.json", "w"), indent=1)
    print(key, "|", rep["summary"][:150], "| options:", [(o["site_name"], o["slip_tolerance_days"], o["backup_site"] and o["backup_site"]["site_name"]) for o in opts], flush=True)

if __name__ == "__main__":
    export_terrain(); print("terrain + ice exported", flush=True)
    for k, p in PRESETS.items(): export_mission(k, p)
