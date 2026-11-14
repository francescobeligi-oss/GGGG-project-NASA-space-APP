"""Step 2 - Real horizon of each site from LOLA terrain, then Sun/Earth visibility over time.
Near field: 5 m site DEM. Far field: 80 m regional DEM (80S-pole) out to 300 km.
Output: data/horizon/<site>.npz  (az grid, horizon elevation per observer height)
        data/vis/<site>.npz      (sun_frac per height, earth_margin per height)"""
import json, os
import numpy as np, rasterio
from scipy.ndimage import map_coordinates
from pyproj import CRS, Transformer

ROOT = "/home/claude/lss/data"
R = 1737400.0
AZ = np.arange(0, 360, 0.25)            # azimuth grid, degrees from north, clockwise (east)
HEIGHTS = [2.0, 10.0, 20.0]             # observer heights above ground (m): lander deck, mast, tower
SUN_R = 0.2666                          # solar angular radius (deg)
GEO = CRS.from_proj4("+proj=longlat +R=1737400 +no_defs")

def load(path):
    d = rasterio.open(path)
    z = d.read(1).astype("float32")
    z[~np.isfinite(z)] = np.nan
    return d, z

def sample(d, z, x, y):
    """Bilinear sample of DEM z at map coords x, y (arrays). NaN outside."""
    col, row = ~d.transform * (x, y)
    v = map_coordinates(z, [row - 0.5, col - 0.5], order=1, mode="constant", cval=np.nan)
    return v

def ne_vectors(crs, lat, lon):
    t = Transformer.from_crs(GEO, crs, always_xy=True)
    x0, y0 = t.transform(lon, lat)
    xn, yn = t.transform(lon, lat + 1e-4)
    xe, ye = t.transform(lon + 1e-4, lat)
    n = np.array([xn - x0, yn - y0]); n /= np.linalg.norm(n)
    e = np.array([xe - x0, ye - y0]); e /= np.linalg.norm(e)
    return n, e

def horizon(site, near, far):
    (dn, zn), (dfar, zf) = near, far
    x0, y0 = site["x"], site["y"]
    g0 = float(sample(dn, zn, np.array([x0]), np.array([y0]))[0])
    n, e = ne_vectors(dn.crs, site["lat"], site["lon"])
    a = np.radians(AZ)[:, None]
    ux, uy = np.cos(a) * n[0] + np.sin(a) * e[0], np.cos(a) * n[1] + np.sin(a) * e[1]
    dist = np.concatenate([np.arange(10, 12000, 5.0), np.arange(12000, 300000, 80.0)])[None, :]
    xs, ys = x0 + ux * dist, y0 + uy * dist
    h = sample(dn, zn, xs.ravel(), ys.ravel()).reshape(xs.shape)
    hf = sample(dfar, zf, xs.ravel(), ys.ravel()).reshape(xs.shape)
    h = np.where(np.isfinite(h), h, hf)                    # 5 m where available, 80 m beyond
    drop = dist ** 2 / (2 * R)                             # curvature of the Moon
    out = {}
    for hh in HEIGHTS:
        ang = np.degrees(np.arctan2(h - drop - (g0 + hh), dist))
        out[hh] = np.nanmax(np.where(np.isfinite(ang), ang, -90), axis=1).astype("float32")
    return g0, out

def disc_fraction(dh):
    """Visible fraction of the solar disc; dh = (sun_el - horizon_el) / SUN_R."""
    c = np.clip(dh, -1, 1)
    return (np.arccos(-c) + c * np.sqrt(1 - c * c)) / np.pi

def main():
    sites = json.load(open(f"{ROOT}/sites.json"))
    far = load(f"{ROOT}/dem/LDEM_80S_80MPP_ADJ.TIF")
    os.makedirs(f"{ROOT}/horizon", exist_ok=True); os.makedirs(f"{ROOT}/vis", exist_ok=True)
    for sid, s in sites.items():
        near = load(f"{ROOT}/dem/{sid}_final_adj_5mpp_surf.tif")
        g0, hz = horizon(s, near, far)
        np.savez_compressed(f"{ROOT}/horizon/{sid}.npz", az=AZ, heights=np.array(HEIGHTS),
                            hz=np.stack([hz[h] for h in HEIGHTS]), ground=g0)
        e = np.load(f"{ROOT}/ephem/{sid}.npz")
        res = {}
        for i, hh in enumerate(HEIGHTS):
            hs = np.interp(e["sun_az"], AZ, hz[hh], period=360)
            he = np.interp(e["earth_az"], AZ, hz[hh], period=360)
            res[f"sun_frac_{i}"] = disc_fraction((e["sun_el"] - hs) / SUN_R).astype("float32")
            res[f"earth_margin_{i}"] = (e["earth_el"] - he).astype("float32")
        np.savez_compressed(f"{ROOT}/vis/{sid}.npz", unix=e["unix"], **res)
        msg = []
        for i, hh in enumerate(HEIGHTS):
            sun = res[f"sun_frac_{i}"]; ea = res[f"earth_margin_{i}"] > 0
            msg.append(f"h{hh:.0f}m sun {100*sun.mean():.0f}% earth {100*ea.mean():.0f}% both {100*((sun>0.5)&ea).mean():.0f}%")
        print(sid, s["name"], "| max horizon %.2f deg |" % hz[2.0].max(), " | ".join(msg))

if __name__ == "__main__":
    main()
