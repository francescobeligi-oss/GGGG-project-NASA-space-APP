"""Validation suite: every number the engine produces is checked against independent references.
A. JPL Horizons (official ephemeris service): Sun and Earth azimuth/elevation at random times for every site
B. NASA GSFC average illumination and Earth-visibility maps (Mazarico et al., 18.6-year averages, 60 m)
C. Published values (ESA landing-site study: connecting ridge 85.7% illumination)
D. Internal unit tests (time grid, disc fraction, panel geometry, battery energy balance)"""
import json, sys, urllib.request, urllib.parse, datetime as dt
import numpy as np, rasterio
sys.path.insert(0, "/home/claude/lss/src")
import core as C

ROOT = C.ROOT
SITES = json.load(open(f"{ROOT}/v2/sites.json"))
rng = np.random.default_rng(42)
EARTH_R = np.degrees(np.arcsin(6378.0 / 384400.0))   # Earth angular radius from the Moon (mean), ~0.95 deg
out = {"generated_utc": dt.datetime.now(dt.timezone.utc).isoformat()[:19]}

def horizons(target, lat, lon, h_km, times):
    tl = " ".join(f"'{dt.datetime.fromtimestamp(t, dt.timezone.utc):%Y-%m-%d %H:%M}'" for t in times)
    p = dict(format="text", COMMAND=f"'{target}'", OBJ_DATA="'NO'", MAKE_EPHEM="'YES'", EPHEM_TYPE="'OBSERVER'",
             CENTER="'coord@301'", COORD_TYPE="'GEODETIC'", SITE_COORD=f"'{lon % 360:.6f},{lat:.6f},{h_km:.4f}'",
             TLIST=tl, TLIST_TYPE="'CAL'", TIME_TYPE="'UT'", QUANTITIES="'4'", ANG_FORMAT="'DEG'", EXTRA_PREC="'YES'")
    url = "https://ssd.jpl.nasa.gov/api/horizons.api?" + "&".join(f"{k}={urllib.parse.quote(v)}" for k, v in p.items())
    txt = urllib.request.urlopen(url, timeout=90).read().decode()
    rows = txt.split("$$SOE")[1].split("$$EOE")[0].strip().splitlines()
    return np.array([[float(x) for x in r.split()[-2:]] for r in rows])

# ---------- A. Horizons ----------
errs = []
for sid, s in SITES.items():
    d = np.load(f"{ROOT}/v2/{sid}.npz")
    k = np.sort(rng.choice(len(d["unix"]), 4, replace=False)); t = d["unix"][k]  # Horizons returns rows in time order
    for body, key in (("10", "sun"), ("399", "earth")):
        ref = horizons(body, s["lat"], s["lon"], s["height_m"] / 1000, t)
        daz = (d[key + "_az"][k] - ref[:, 0] + 180) % 360 - 180; delv = d[key + "_el"][k] - ref[:, 1]
        errs.append(dict(site=sid, body=key, max_az_err_deg=float(np.abs(daz).max()), max_el_err_deg=float(np.abs(delv).max())))
out["A_horizons"] = dict(comparisons=len(errs) * 4, max_az_err_deg=max(e["max_az_err_deg"] for e in errs),
                         max_el_err_deg=max(e["max_el_err_deg"] for e in errs), threshold_deg=0.01,
                         passed=all(e["max_el_err_deg"] < 0.01 and e["max_az_err_deg"] < 0.01 for e in errs))

# ---------- B. NASA illumination / Earth visibility maps ----------
def nasa(path, x, y):
    with rasterio.open(path) as m:
        r, c = m.index(x, y); w = m.read(1, window=((r - 1, r + 2), (c - 1, c + 2))).astype(float)
        w[w < 0] = np.nan; w *= m.scales[0]
        return float(w[1, 1]), float(np.nanmin(w)), float(np.nanmax(w))
import build as B
def our_long_term(x, y, near):
    lat, lon = C.to_latlon(x, y)
    g0, hz = C.horizon(x, y, near, heights=[0.5])
    t0 = dt.datetime(2008, 1, 1, tzinfo=dt.timezone.utc).timestamp(); tt = t0 + np.arange(0, 18.6 * 365.25 * 24, 2) * 3600.0
    K = B.kernels(); ts = K["ts"]; tm = ts.utc(2008, 1, 1, 0, 0, tt - t0)
    place = K["eph"]["moon"] + K["pc"].build_latlon_degrees(K["frame"], lat, lon, g0)
    sun = place.at(tm).observe(K["eph"]["sun"]).apparent().altaz(); ear = place.at(tm).observe(K["eph"]["earth"]).apparent().altaz()
    sf = C.sun_fraction(sun[1].degrees, sun[0].degrees, hz[0]).mean()
    ev = (C.earth_margin(ear[1].degrees, ear[0].degrees, hz[0]) > -EARTH_R).mean()
    return float(sf), float(ev)
rows = []
for sid, s in SITES.items():
    if s["lat"] > -85.0: continue
    near = C.best_near_grid(s["x"], s["y"])
    with rasterio.open(f"{ROOT}/AVGVISIB_85S_060M_201608.TIF") as ms, rasterio.open(f"{ROOT}/AVGVISIB_85S_060M_201608_EARTH.TIF") as me:
        r0, c0 = ms.index(s["x"], s["y"]); ours_s, ours_e, nasa_s, nasa_e = [], [], [], []
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                x, y = ms.xy(r0 + dr, c0 + dc)
                a_, b_ = our_long_term(x, y, near); ours_s.append(a_); ours_e.append(b_)
                nasa_s.append(float(ms.read(1, window=((r0 + dr, r0 + dr + 1), (c0 + dc, c0 + dc + 1)))[0, 0]) * ms.scales[0])
                nasa_e.append(float(me.read(1, window=((r0 + dr, r0 + dr + 1), (c0 + dc, c0 + dc + 1)))[0, 0]) * me.scales[0])
    os_, oe, ns, ne = map(np.array, (ours_s, ours_e, nasa_s, nasa_e))
    rows.append(dict(site=s["name"], sun_ours=round(100 * os_.mean(), 1), sun_nasa=round(100 * ns.mean(), 1),
                     sun_max_pixel_diff=round(100 * float(np.abs(os_ - ns).max()), 1),
                     earth_ours=round(100 * oe.mean(), 1), earth_nasa=round(100 * ne.mean(), 1),
                     earth_max_pixel_diff=round(100 * float(np.abs(oe - ne).max()), 1)))
    print(rows[-1], flush=True)
for r in rows:
    r["sun_diff"] = round(r["sun_ours"] - r["sun_nasa"], 1); r["earth_diff"] = round(r["earth_ours"] - r["earth_nasa"], 1)
out["B_nasa_maps"] = dict(note="Like-for-like: our model evaluated at the 9 NASA 60 m pixel centres around each site, 0.5 m above ground, over a full 18.6-year cycle (2-hour step). "
                               "Earth counted visible if any part of the disc is visible (NASA definition).",
                          sites=rows, mean_abs_sun_diff=round(float(np.mean([abs(r["sun_diff"]) for r in rows])), 1) if rows else None,
                          mean_abs_earth_diff=round(float(np.mean([abs(r["earth_diff"]) for r in rows])), 1) if rows else None)

# ---------- C. Published values ----------
s = SITES.get("Site01")
if s:
    d = np.load(f"{ROOT}/v2/Site01.npz")
    out["C_published"] = [dict(reference="ESA lunar lander study (Koebel et al.): connecting ridge 89 28'S 136 40'W, 85.7% illumination",
                               ours_position=f"{s['lat']:.4f}, {s['lon']:.4f}", ours_illumination=round(100 * float(d['sun_frac_0'].mean()), 1))]

# ---------- D. Unit tests ----------
tests = {}
d = np.load(f"{ROOT}/v2/Site01.npz"); u = d["unix"]
tests["time grid starts 2026-11-01 00:00 UTC, exact 30-min steps"] = bool(u[0] == dt.datetime(2026, 11, 1, tzinfo=dt.timezone.utc).timestamp() and np.all(np.diff(u) == 1800))
hz = np.zeros(1440, "float32")
tests["disc fully visible when Sun 1 deg above a flat horizon"] = bool(abs(C.sun_fraction([10.0], [1.0], hz)[0] - 1) < 1e-6)
tests["disc hidden when Sun 1 deg below the horizon"] = bool(C.sun_fraction([10.0], [-1.0], hz)[0] < 1e-6)
tests["half disc when Sun centre on the horizon"] = bool(abs(C.sun_fraction([10.0], [0.0], hz)[0] - 0.5) < 0.02)
import engine as E
el = np.array([1.0, 3.0]); f1 = np.ones(2)
p_h = E._panel_power([{"peak_w": 100, "tilt_deg": 0}], np.array([0.0, 0.0]), el, f1, 0)
tests["flat panel power = peak x sin(elevation)"] = bool(np.allclose(p_h, 100 * np.sin(np.radians(el)), atol=1e-6))
p_v = E._panel_power([{"peak_w": 100, "tilt_deg": 90, "azimuth_deg": 0}], np.array([0.0, 180.0]), np.array([0.0, 0.0]), f1, 0)
tests["vertical panel: full power facing the Sun, zero facing away"] = bool(abs(p_v[0] - 100) < 1e-6 and p_v[1] == 0)
soc, dead, _ = E._battery(np.zeros(100), 100.0, None, 1000.0, 0.8, 1.0)
tests["battery: 800 Wh usable at 100 W lasts exactly 8 h"] = bool(dead is not None and abs(dead * E.DT_H - 8.0) <= E.DT_H)
out["D_unit_tests"] = dict(tests=tests, passed=all(tests.values()))

json.dump(out, open(f"{ROOT}/validation_report.json", "w"), indent=1)
print(json.dumps({k: (v if k != "B_nasa_maps" else {kk: vv for kk, vv in v.items() if kk != "note"}) for k, v in out.items()}, indent=1)[:4000])
