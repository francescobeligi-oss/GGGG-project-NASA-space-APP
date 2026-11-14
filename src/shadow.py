"""Step 4 - 5 m shadow maps and landing-ellipse analysis.
far horizon (5-300 km) is computed once at the site centre; near terrain (<5 km) per pixel/point."""
import json, os, sys
import numpy as np
sys.path.insert(0, "/home/claude/lss/src")
import horizon as H

ROOT = "/home/claude/lss/data"
NEAR = 5000.0

def far_horizon(s, near, far):
    d0, z0 = near
    g0 = float(H.sample(d0, z0, np.array([s["x"]]), np.array([s["y"]]))[0])
    n, e = H.ne_vectors(d0.crs, s["lat"], s["lon"])
    a = np.radians(H.AZ)[:, None]
    ux, uy = np.cos(a) * n[0] + np.sin(a) * e[0], np.cos(a) * n[1] + np.sin(a) * e[1]
    dist = np.concatenate([np.arange(NEAR, 12000, 5.0), np.arange(12000, 300000, 80.0)])[None, :]
    xs, ys = s["x"] + ux * dist, s["y"] + uy * dist
    h = H.sample(d0, z0, xs.ravel(), ys.ravel()).reshape(xs.shape)
    hf = H.sample(*far, xs.ravel(), ys.ravel()).reshape(xs.shape)
    h = np.where(np.isfinite(h), h, hf)
    ang = np.degrees(np.arctan2(h - dist ** 2 / (2 * H.R) - (g0 + 2.0), dist))
    return np.nanmax(np.where(np.isfinite(ang), ang, -90), axis=1), (n, e)

def ellipse_points(s, radius, step=None):
    step = step or max(5.0, radius / 12)
    g = np.arange(-radius, radius + 1e-6, step)
    X, Y = np.meshgrid(g, g); m = X ** 2 + Y ** 2 <= radius ** 2
    return s["x"] + X[m], s["y"] + Y[m]

def point_horizons(px, py, near, ne, height=2.0, az_step=1.0):
    d0, z0 = near; n, e = ne
    az = np.arange(0, 360, az_step); a = np.radians(az)[:, None, None]
    ux = (np.cos(a) * n[0] + np.sin(a) * e[0]); uy = (np.cos(a) * n[1] + np.sin(a) * e[1])
    dist = np.arange(5.0, NEAR, 5.0)[None, None, :]
    out = np.empty((len(px), len(az)), "float32")
    for i in range(len(px)):
        g = float(H.sample(d0, z0, np.array([px[i]]), np.array([py[i]]))[0])
        xs, ys = px[i] + ux * dist, py[i] + uy * dist
        h = H.sample(d0, z0, xs.ravel(), ys.ravel()).reshape(xs.shape)
        ang = np.degrees(np.arctan2(h - (g + height), dist))
        out[i] = np.nanmax(np.where(np.isfinite(ang), ang, -90), axis=2)[:, 0]
    return az, out

def ellipse_sunlight(sid, radius, i0=None, n=None):
    """Sunlit fraction of time for each point of the landing ellipse (2 m height)."""
    sites = json.load(open(f"{ROOT}/sites.json")); s = sites[sid]
    near = H.load(f"{ROOT}/dem/{sid}_final_adj_5mpp_surf.tif"); far = H.load(f"{ROOT}/dem/LDEM_80S_80MPP_ADJ.TIF")
    fhz, ne = far_horizon(s, near, far)
    px, py = ellipse_points(s, radius)
    az, nhz = point_horizons(px, py, near, ne)
    e = np.load(f"{ROOT}/ephem/{sid}.npz")
    sl = slice(i0 or 0, (i0 or 0) + n if n else None)
    sa, se = e["sun_az"][sl], e["sun_el"][sl]
    fh = np.interp(sa, H.AZ, fhz, period=360)
    frac = np.empty((len(px), len(sa)), "float32")
    for i in range(len(px)):
        hz = np.maximum(np.interp(sa, az, nhz[i], period=360), fh)
        frac[i] = H.disc_fraction((se - hz) / H.SUN_R)
    return px - s["x"], py - s["y"], frac

def shade_map(sid, sun_az, sun_el, half=1500.0, res=10.0):
    """Lit fraction (0..1) of every pixel in a (2*half)^2 window around the site, for one Sun position."""
    sites = json.load(open(f"{ROOT}/sites.json")); s = sites[sid]
    near = H.load(f"{ROOT}/dem/{sid}_final_adj_5mpp_surf.tif"); far = H.load(f"{ROOT}/dem/LDEM_80S_80MPP_ADJ.TIF")
    fhz, (n, e) = far_horizon(s, near, far)
    g = np.arange(-half, half + 1e-6, res); X, Y = np.meshgrid(g, -g)
    X, Y = X + s["x"], Y + s["y"]
    z = H.sample(*near, X.ravel(), Y.ravel()).reshape(X.shape)
    a = np.radians(sun_az); u = np.cos(a) * n + np.sin(a) * e
    best = np.full(X.shape, -90.0)
    for d in np.arange(res, 3000.0, res):
        h = H.sample(*near, (X + u[0] * d).ravel(), (Y + u[1] * d).ravel()).reshape(X.shape)
        best = np.fmax(best, np.degrees(np.arctan2(h - (z + 2.0), d)))
    hz = np.maximum(best, np.interp(sun_az, H.AZ, fhz, period=360))
    return g, z, H.disc_fraction((sun_el - hz) / H.SUN_R)

if __name__ == "__main__":
    import time
    t = time.time()
    x, y, f = ellipse_sunlight("Site01", 250.0)
    p = 100 * (f > 0.5).mean(axis=1)
    print("Site01 ellipse 250 m: %d points, sunlight %% min %.0f / median %.0f / max %.0f  (%.0fs)" % (
        len(p), p.min(), np.median(p), p.max(), time.time() - t))
    t = time.time(); g, z, lit = shade_map("Site01", 120.0, 1.0)
    print("shade map", lit.shape, "lit %.0f%%" % (100 * (lit > 0.5).mean()), "(%.0fs)" % (time.time() - t))
