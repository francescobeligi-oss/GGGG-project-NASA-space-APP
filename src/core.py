"""Lunar Site Scout - geometric core (v2, precision version).
- terrain grids: 5 m site tiles, 10 m regional COG window (83S-pole), 80 m regional (80S-pole)
- horizon by ray tracing with lunar curvature, at several observer heights
- Sun visibility integrated over the whole solar disc (7 vertical slices, horizon read at each slice azimuth)
All coordinates: south polar stereographic, R = 1737.4 km, MOON_ME (DE421), same frame as the LOLA products."""
import glob
import numpy as np, rasterio
from rasterio.windows import from_bounds
from scipy.ndimage import map_coordinates
from pyproj import CRS, Transformer

ROOT = "/home/claude/lss/data"
R = 1737400.0
AZ = np.arange(0, 360, 0.25)
HEIGHTS = [2.0, 10.0, 20.0]
SUN_R = 0.2666                      # mean solar angular radius seen from the Moon (deg)
GEO = CRS.from_proj4("+proj=longlat +R=1737400 +no_defs")
STEREO = CRS.from_proj4("+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs")
URL10 = f"{ROOT}/dem/LDEM_83S_10MPP_ADJ.TIF"
FAR80 = f"{ROOT}/dem/LDEM_80S_80MPP_ADJ.TIF"

class Grid:
    def __init__(self, z, transform, res, name):
        self.z, self.transform, self.res, self.name = z, transform, res, name
    def sample(self, x, y):
        col, row = ~self.transform * (x, y)
        return map_coordinates(self.z, [np.asarray(row) - 0.5, np.asarray(col) - 0.5], order=1, mode="constant", cval=np.nan)
    def contains(self, x, y, margin=0.0):
        col, row = ~self.transform * (x, y)
        return margin <= col <= self.z.shape[1] - margin and margin <= row <= self.z.shape[0] - margin

def _read(path, bounds=None):
    with rasterio.open(path) as d:
        if bounds is None:
            z = d.read(1).astype("float32"); tr = d.transform
        else:
            w = from_bounds(*bounds, transform=d.transform).round_offsets().round_lengths()
            z = d.read(1, window=w).astype("float32"); tr = d.window_transform(w)
        res = d.res[0]
    z[~np.isfinite(z)] = np.nan; z[z < -20000] = np.nan
    return z, tr, res

_far = {}
def far_grid():
    if "g" not in _far: z, tr, res = _read(FAR80); _far["g"] = Grid(z, tr, res, "LOLA 80 m (80S-pole)")
    return _far["g"]

def best_near_grid(x, y, half=10000.0):
    """5 m tile if the point is inside one (with margin), else a 10 m window read from the NASA COG."""
    for f in sorted(glob.glob(f"{ROOT}/dem/*_final_adj_5mpp_surf.tif")):
        with rasterio.open(f) as d: b = d.bounds
        if b.left + 2000 < x < b.right - 2000 and b.bottom + 2000 < y < b.top - 2000:
            z, tr, res = _read(f); return Grid(z, tr, res, "LOLA 5 m site DEM " + f.split("/")[-1].split("_")[0])
    z, tr, res = _read(URL10, (x - half, y - half, x + half, y + half))
    return Grid(z, tr, res, "LOLA 10 m (83S-pole)")

def to_xy(lat, lon):
    return Transformer.from_crs(GEO, STEREO, always_xy=True).transform(lon, lat)

def to_latlon(x, y):
    lon, lat = Transformer.from_crs(STEREO, GEO, always_xy=True).transform(x, y); return lat, lon

def ne_vectors(lat, lon):
    t = Transformer.from_crs(GEO, STEREO, always_xy=True)
    x0, y0 = t.transform(lon, lat); xn, yn = t.transform(lon, lat + 1e-4); xe, ye = t.transform(lon + 1e-4, lat)
    n = np.array([xn - x0, yn - y0]); e = np.array([xe - x0, ye - y0])
    return n / np.linalg.norm(n), e / np.linalg.norm(e)

def horizon(x, y, near, heights=HEIGHTS, az=AZ, d_min=5.0, d_max=300000.0, near_only=False, ground=None):
    """Horizon elevation (deg) per azimuth for observers `heights` m above ground at (x, y)."""
    lat, lon = to_latlon(x, y); n, e = ne_vectors(lat, lon)
    g0 = float(near.sample(np.array([x]), np.array([y]))[0]) if ground is None else ground
    a = np.radians(az)[:, None]
    ux, uy = np.cos(a) * n[0] + np.sin(a) * e[0], np.cos(a) * n[1] + np.sin(a) * e[1]
    step_near = near.res
    d_near_max = 12000.0 if near.res <= 5 else 20000.0
    dist = np.arange(d_min, min(d_near_max, d_max), step_near)
    if not near_only and d_max > d_near_max: dist = np.concatenate([dist, np.arange(d_near_max, d_max, 80.0)])
    dist = dist[None, :]
    xs, ys = x + ux * dist, y + uy * dist
    h = near.sample(xs.ravel(), ys.ravel()).reshape(xs.shape)
    if not near_only:
        hf = far_grid().sample(xs.ravel(), ys.ravel()).reshape(xs.shape)
        h = np.where(np.isfinite(h), h, hf)
    drop = dist ** 2 / (2 * R)
    out = np.empty((len(heights), len(az)), "float32")
    for i, hh in enumerate(heights):
        ang = np.degrees(np.arctan2(h - drop - (g0 + hh), dist))
        out[i] = np.nanmax(np.where(np.isfinite(ang), ang, -90.0), axis=1)
    return g0, out

# solar disc: 7 vertical slices across the disc (Gauss-like uniform slices)
_SL = (np.arange(7) - 3) / 3.5 * SUN_R          # azimuthal offsets of slice centres (deg of arc)
_HALF = np.sqrt(np.clip(SUN_R ** 2 - _SL ** 2, 0, None))
_W = _HALF / _HALF.sum()

def sun_fraction(sun_az, sun_el, hz, az=AZ):
    """Visible fraction of the solar disc, reading the horizon at the azimuth of every slice."""
    sun_az = np.asarray(sun_az); sun_el = np.asarray(sun_el)
    cosel = np.clip(np.cos(np.radians(sun_el)), 0.05, 1)
    frac = np.zeros(sun_az.shape, dtype="float32")
    for o, c, w in zip(_SL, _HALF, _W):
        h = np.interp(sun_az + o / cosel, az, hz, period=360)
        vis = np.clip((sun_el + c - h) / (2 * c), 0, 1)
        frac += w * vis
    return frac

def earth_margin(earth_az, earth_el, hz, az=AZ):
    return np.asarray(earth_el) - np.interp(earth_az, az, hz, period=360)
