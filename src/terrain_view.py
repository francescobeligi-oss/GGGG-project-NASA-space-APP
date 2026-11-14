"""Light terrain products from the packed windows (no large NASA files needed):
shadow map at any Sun position, ellipse slopes, local relief for 3D views."""
import json, numpy as np
from scipy.ndimage import map_coordinates
import core as C
ROOT = C.ROOT
_T = {}
def _pack(sid):
    if sid not in _T:
        s = json.load(open(f"{ROOT}/v2/sites.json"))[sid]; d = dict(np.load(f"{ROOT}/v2/{sid}_terrain.npz"))
        d["site"] = s; d["ne"] = C.ne_vectors(s["lat"], s["lon"]); d["far"] = np.load(f"{ROOT}/v2/{sid}.npz")["far_hz"]
        _T[sid] = d
    return _T[sid]

def _sample(d, dx, dy):
    """Bilinear sample of the 10 m window at offsets (m) from the site; x east-ish (map x), y north-ish (map y)."""
    col = (dx + d["viz_half"]) / d["viz_res"]; row = (d["viz_half"] - dy) / d["viz_res"]
    return map_coordinates(d["viz"], [row, col], order=1, mode="constant", cval=np.nan)

def relief(sid, half=1500.0):
    d = _pack(sid); k = int((d["viz_half"] - half) / d["viz_res"]); z = d["viz"][k:-k or None, k:-k or None]
    g = np.arange(-half, half + 0.1, d["viz_res"])[:z.shape[0]]
    return g, z

def shade_map(sid, sun_az, sun_el, half=1500.0, height=2.0):
    """Lit fraction (0..1) of every 10 m pixel within +-half m of the site, for one Sun position (site frame)."""
    d = _pack(sid); n, e = d["ne"]; a = np.radians(sun_az); u = np.cos(a) * n + np.sin(a) * e
    g = np.arange(-half, half + 0.1, d["viz_res"]); DX, DY = np.meshgrid(g, -g)
    z = _sample(d, DX.ravel(), DY.ravel()).reshape(DX.shape)
    best = np.full(DX.shape, -90.0); reach = d["viz_half"] - half
    for dist in np.arange(d["viz_res"], reach, d["viz_res"]):
        h = _sample(d, (DX + u[0] * dist).ravel(), (DY + u[1] * dist).ravel()).reshape(DX.shape)
        best = np.fmax(best, np.degrees(np.arctan2(h - dist ** 2 / (2 * C.R) - (z + height), dist)))
    far = np.interp(sun_az, C.AZ, d["far"][0], period=360)          # terrain beyond 5 km, from the site centre
    hz = np.maximum(best, far)
    lit = np.zeros(DX.shape, dtype="float32")
    for o, c, w in zip(C._SL, C._HALF, C._W):
        lit += w * np.clip((sun_el + c - hz) / (2 * c), 0, 1)
    return g, z, lit

def ellipse_slope(sid, radius, max_slope=None):
    d = _pack(sid); z = d["slope_z"]; r = d["slope_res"]
    gy, gx = np.gradient(z, r); sl = np.degrees(np.arctan(np.hypot(gx, gy)))
    o = np.arange(z.shape[0]) * r - d["slope_half"]; X, Y = np.meshgrid(o, o); inside = X ** 2 + Y ** 2 <= radius ** 2
    v = sl[inside]
    return dict(resolution_m=float(r), median_deg=float(np.median(v)), p90_deg=float(np.percentile(v, 90)),
                safe_fraction=(float((v <= max_slope).mean()) if max_slope else None))
