"""Step 1 - Sun and Earth azimuth/elevation seen from each site (DE421, MOON_ME frame).
Output: data/ephem/<site>.npz with times (Unix s), sun_az, sun_el, earth_az, earth_el (degrees),
and data/sites.json with the site coordinates."""
import json, sys
import numpy as np, rasterio
from pyproj import CRS, Transformer
from skyfield.api import load
from skyfield.planetarylib import PlanetaryConstants

ROOT = "/home/claude/lss/data"
SITES = {  # id: (name, x, y) in polar stereographic metres; None -> highest point of the DEM
    "Site01": ("Connecting ridge", -11582.5, -12462.5),
    "Site04": ("Shackleton rim", -2812.5, -6647.5),
    "Site07": ("Peak near Shackleton", 30167.5, -20002.5),
    "Site11": ("de Gerlache rim", -37542.5, 14882.5),
    "Site23": ("Malapert massif", None, None),
}
STEP_MIN = 30
START, END = (2026, 11, 1), (2029, 1, 1)

def site_points():
    out = {}
    for sid, (name, x, y) in SITES.items():
        with rasterio.open(f"{ROOT}/dem/{sid}_final_adj_5mpp_surf.tif") as d:
            z = d.read(1)
            if x is None:  # highest point away from the edges
                m = 400
                sub = z[m:-m, m:-m]
                r, c = np.unravel_index(np.nanargmax(sub), sub.shape)
                r, c = r + m, c + m
                x, y = d.xy(r, c)
            r, c = d.index(x, y)
            h = float(z[r, c])
            tr = Transformer.from_crs(d.crs, CRS.from_proj4("+proj=longlat +R=1737400 +no_defs"), always_xy=True)
        lon, lat = tr.transform(x, y)
        out[sid] = dict(name=name, x=float(x), y=float(y), lat=float(lat), lon=float(lon), height_m=h)
    return out

def main():
    ts = load.timescale()
    k = f"{ROOT}/kernels"
    eph = load(f"{k}/de421.bsp")
    pc = PlanetaryConstants()
    pc.read_text(load(f"{k}/moon_080317.tf"))
    pc.read_text(load(f"{k}/pck00010.tpc"))
    pc.read_binary(load(f"{k}/moon_pa_de421_1900-2050.bpc"))
    frame = pc.build_frame_named("MOON_ME_DE421")
    moon, sun, earth = eph["moon"], eph["sun"], eph["earth"]

    n = int((np.datetime64("%04d-%02d-%02d" % END) - np.datetime64("%04d-%02d-%02d" % START)) / np.timedelta64(STEP_MIN, "m"))
    t = ts.utc(*START, 0, np.arange(n) * STEP_MIN)
    unix = (t.tt - 2440587.5 - 69.184 / 86400) * 86400.0  # approx UTC seconds (TT-UTC = 69.184 s)

    sites = site_points()
    json.dump(sites, open(f"{ROOT}/sites.json", "w"), indent=1)
    import os; os.makedirs(f"{ROOT}/ephem", exist_ok=True)
    for sid, s in sites.items():
        place = moon + pc.build_latlon_degrees(frame, s["lat"], s["lon"], s["height_m"])
        res = {}
        for body, key in ((sun, "sun"), (earth, "earth")):
            alt, az, _ = place.at(t).observe(body).apparent().altaz()
            res[key + "_el"] = alt.degrees.astype("float32")
            res[key + "_az"] = az.degrees.astype("float32")
        np.savez_compressed(f"{ROOT}/ephem/{sid}.npz", unix=unix, **res)
        print(sid, s["name"], "lat %.4f lon %.4f h %.0f m" % (s["lat"], s["lon"], s["height_m"]),
              "| sun el %.2f..%.2f | earth el %.2f..%.2f" % (res["sun_el"].min(), res["sun_el"].max(),
                                                            res["earth_el"].min(), res["earth_el"].max()))
    # three check times for Horizons
    chk = ts.utc(2027, 3, [1, 10, 20], 12)
    s = sites["Site01"]
    place = moon + pc.build_latlon_degrees(frame, s["lat"], s["lon"], s["height_m"])
    for body, key in ((sun, "sun"), (earth, "earth")):
        alt, az, _ = place.at(chk).observe(body).apparent().altaz()
        print("CHECK", key, [("%.4f" % a, "%.4f" % e) for a, e in zip(az.degrees, alt.degrees)])

if __name__ == "__main__":
    main()
