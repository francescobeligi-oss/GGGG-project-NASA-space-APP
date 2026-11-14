"""Any coordinate: ephemeris + horizon (80 m regional DEM, plus 5 m tile if the point falls inside one)."""
import sys, json, glob
import numpy as np, rasterio
from pyproj import CRS, Transformer
sys.path.insert(0, "/home/claude/lss/src")
import horizon as H
from skyfield.api import load
from skyfield.planetarylib import PlanetaryConstants

ROOT = "/home/claude/lss/data"
_K = {}
def kernels():
    if not _K:
        k = f"{ROOT}/kernels"; pc = PlanetaryConstants()
        pc.read_text(load(f"{k}/moon_080317.tf")); pc.read_text(load(f"{k}/pck00010.tpc"))
        pc.read_binary(load(f"{k}/moon_pa_de421_1900-2050.bpc"))
        eph = load(f"{k}/de421.bsp")
        _K.update(ts=load.timescale(), eph=eph, pc=pc, frame=pc.build_frame_named("MOON_ME_DE421"),
                  far=H.load(f"{ROOT}/dem/LDEM_80S_80MPP_ADJ.TIF"))
    return _K

def point(lat, lon, start_ymd, days, step_min=30):
    K = kernels(); dfar, zf = K["far"]
    tr = Transformer.from_crs(H.GEO, dfar.crs, always_xy=True); x, y = tr.transform(lon, lat)
    near = K["far"]
    for f in glob.glob(f"{ROOT}/dem/Site*_surf.tif"):
        d = rasterio.open(f); b = d.bounds
        if b.left < x < b.right and b.bottom < y < b.top: near = H.load(f); break
    s = dict(x=x, y=y, lat=lat, lon=lon)
    g0, hz = H.horizon(s, near, K["far"])
    t = K["ts"].utc(*start_ymd, 0, np.arange(int(days * 1440 / step_min)) * step_min)
    place = K["eph"]["moon"] + K["pc"].build_latlon_degrees(K["frame"], lat, lon, g0)
    out = dict(t=t, ground=g0, hz=hz)
    for body, key in ((K["eph"]["sun"], "sun"), (K["eph"]["earth"], "earth")):
        alt, az, _ = place.at(t).observe(body).apparent().altaz()
        out[key + "_el"], out[key + "_az"] = alt.degrees, az.degrees
    out["sun_frac"] = H.disc_fraction((out["sun_el"] - np.interp(out["sun_az"], H.AZ, hz[2.0], period=360)) / H.SUN_R)
    out["earth_margin"] = out["earth_el"] - np.interp(out["earth_az"], H.AZ, hz[2.0], period=360)
    return out

if __name__ == "__main__":
    for name, (lat, lon) in {"IM-2 actual": (-84.7906, 29.1957), "IM-2 intended": (-84.78, 29.13)}.items():
        o = point(lat, lon, (2025, 3, 6, 17), 2, step_min=60)
        print(name, "ground %.0f m" % o["ground"], "| landing: sun el %.2f, frac %.2f, earth margin %.2f" % (
            o["sun_el"][0], o["sun_frac"][0], o["earth_margin"][0]),
            "| next 48h sun %.0f%%" % (100 * (o["sun_frac"] > 0.5).mean()))
