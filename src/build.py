"""Build all precomputed data (v2). Period: 2026-11-01 to 2033-01-01 UTC, 30-min step.
Per site: exact-UTC ephemeris, horizon at 2/10/20 m, Sun disc fraction and Earth margin, ellipse point horizons."""
import json, os, sys, datetime as dt
import numpy as np
from multiprocessing import Pool
sys.path.insert(0, "/home/claude/lss/src")
import core as C

ROOT = C.ROOT
START = dt.datetime(2026, 11, 1, tzinfo=dt.timezone.utc); END = dt.datetime(2033, 1, 1, tzinfo=dt.timezone.utc)
STEP = 1800
UNIX = START.timestamp() + np.arange(int((END - START).total_seconds() // STEP)) * STEP

SITE_DEFS = {   # id: (name, how to place the point)
    "Site01": ("Connecting ridge", ("xy", -11582.5, -12462.5)),
    "Site04": ("Shackleton rim", ("xy", -2812.5, -6647.5)),
    "Site07": ("Peak near Shackleton", ("xy", 30167.5, -20002.5)),
    "Site11": ("de Gerlache rim", ("xy", -37542.5, 14882.5)),
    "Site23": ("Malapert massif", ("search", "Site23")),
    "Site06": ("Nobile rim 1", ("search", "Site06")),
    "DM2": ("Nobile rim 2", ("search", "DM2")),
    "Site20": ("Leibnitz beta plateau", ("search", "Site20")),
    "Haworth": ("Haworth rim", ("search", "Haworth")),
    "Shoemaker": ("Shoemaker rim", ("search", "Shoemaker")),
    "MonsMouton": ("Mons Mouton plateau (IM-2 target)", ("latlon", -84.78, 29.13)),
}

_K = {}
def kernels():
    if not _K:
        from skyfield.api import load
        from skyfield.planetarylib import PlanetaryConstants
        k = f"{ROOT}/kernels"; pc = PlanetaryConstants()
        pc.read_text(load(f"{k}/moon_080317.tf")); pc.read_text(load(f"{k}/pck00010.tpc"))
        pc.read_binary(load(f"{k}/moon_pa_de421_1900-2050.bpc"))
        _K.update(ts=load.timescale(), eph=load(f"{k}/de421.bsp"), pc=pc, frame=pc.build_frame_named("MOON_ME_DE421"))
    return _K

def ephemeris(lat, lon, h, unix):
    K = kernels(); ts = K["ts"]
    t = ts.from_datetimes([dt.datetime.fromtimestamp(float(u), dt.timezone.utc) for u in unix]) if len(unix) < 5000 else \
        ts.utc(START.year, START.month, START.day, 0, 0, (unix - START.timestamp()))   # exact UTC seconds from START
    place = K["eph"]["moon"] + K["pc"].build_latlon_degrees(K["frame"], lat, lon, h)
    out = {}
    for body, key in ((K["eph"]["sun"], "sun"), (K["eph"]["earth"], "earth")):
        alt, az, _ = place.at(t).observe(body).apparent().altaz()
        out[key + "_el"], out[key + "_az"] = alt.degrees.astype("float32"), az.degrees.astype("float32")
    return out

def search_point(tile_id):
    """Most illuminated high point of the central 12 x 12 km of a 5 m tile (2027-2028, every 3 h, 2 m height)."""
    import rasterio
    f = f"{ROOT}/dem/{tile_id}_final_adj_5mpp_surf.tif"
    with rasterio.open(f) as d: b = d.bounds
    cx, cy = (b.left + b.right) / 2, (b.bottom + b.top) / 2
    near = C.best_near_grid(cx, cy)
    g = np.arange(-6000, 6001, 100.0); X, Y = np.meshgrid(cx + g, cy + g)
    Z = near.sample(X.ravel(), Y.ravel()); ok = np.isfinite(Z)
    thr = np.nanpercentile(Z[ok], 97); idx = np.where(ok & (Z >= thr))[0][:160]
    lat0, lon0 = C.to_latlon(cx, cy)
    t = START.timestamp() + 2 * 3600 * 24 * 60 + np.arange(0, 2 * 365 * 24, 3) * 3600.0
    e = ephemeris(lat0, lon0, float(np.nanmedian(Z)), t)
    best, bx, by = -1, cx, cy
    for i in idx:
        x, y = X.ravel()[i], Y.ravel()[i]
        _, hz = C.horizon(x, y, near, heights=[2.0], az=np.arange(0, 360, 1.0), d_max=60000)
        s = (C.sun_fraction(e["sun_az"], e["sun_el"], hz[0], az=np.arange(0, 360, 1.0)) > 0.5).mean()
        if s > best: best, bx, by = s, x, y
    return bx, by, best

def build_site(sid):
    name, how = SITE_DEFS[sid]
    if how[0] == "xy": x, y = how[1], how[2]; note = "NASA region of interest (PGDA)"
    elif how[0] == "latlon": x, y = C.to_xy(how[1], how[2]); note = "published target coordinates"
    else: x, y, s = search_point(how[1]); note = f"most illuminated high point of the tile (search: {100*s:.0f}% sunlit 2027-28)"
    near = C.best_near_grid(x, y)
    lat, lon = C.to_latlon(x, y)
    g0, hz = C.horizon(x, y, near)
    e = ephemeris(lat, lon, g0, UNIX)
    res = dict(unix=UNIX, hz=hz, az=C.AZ, heights=np.array(C.HEIGHTS), ground=g0, **e)
    for i in range(len(C.HEIGHTS)):
        res[f"sun_frac_{i}"] = C.sun_fraction(e["sun_az"], e["sun_el"], hz[i])
        res[f"earth_margin_{i}"] = C.earth_margin(e["earth_az"], e["earth_el"], hz[i]).astype("float32")
    # ellipse: horizons of points up to 250 m (near terrain within 5 km per point + far horizon of the centre)
    _, fhz = C.horizon(x, y, near, d_min=5000.0)
    azp = np.arange(0, 360, 1.0)
    for r in (50, 100, 250):
        step = max(5.0, r / 12); gg = np.arange(-r, r + 1e-6, step); XX, YY = np.meshgrid(gg, gg); m = XX ** 2 + YY ** 2 <= r * r
        px, py = XX[m], YY[m]; nh = np.empty((len(px), len(C.HEIGHTS), len(azp)), "float16")
        for k in range(len(px)):
            _, h_ = C.horizon(x + px[k], y + py[k], near, az=azp, d_max=5000.0, near_only=True)
            nh[k] = h_
        res[f"ell{r}_x"], res[f"ell{r}_y"], res[f"ell{r}_hz"] = px, py, nh
    res["far_hz"] = fhz
    np.savez_compressed(f"{ROOT}/v2/{sid}.npz", **res)
    meta = dict(name=name, x=float(x), y=float(y), lat=float(lat), lon=float(lon), height_m=g0, terrain=near.name, point=note)
    s2 = (res["sun_frac_0"] > 0.5).mean(); e2 = (res["earth_margin_0"] > 0).mean()
    print(f"{sid:10s} {name:34s} lat {lat:8.4f} lon {lon:9.4f} | {near.name:28s} | sun {100*s2:.0f}% earth {100*e2:.0f}%", flush=True)
    return sid, meta

if __name__ == "__main__":
    os.makedirs(f"{ROOT}/v2", exist_ok=True)
    ids = sys.argv[1:] or list(SITE_DEFS)
    with Pool(min(len(ids), os.cpu_count() or 2)) as p:
        out = dict(p.map(build_site, ids))
    path = f"{ROOT}/v2/sites.json"
    old = json.load(open(path)) if os.path.exists(path) else {}
    old.update(out); json.dump(old, open(path, "w"), indent=1)
    print("DONE", len(old), "sites")
