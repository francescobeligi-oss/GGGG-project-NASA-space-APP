"""Package light terrain windows per site so the app runs without the multi-GB NASA files (GitHub / Streamlit Cloud).
viz: 10 m grid, +-4.5 km (shadow maps); slope: native 5 m (10 m for Mons Mouton) grid, +-400 m (ellipse slopes)."""
import json, sys, numpy as np
sys.path.insert(0, "/home/claude/lss/src")
import core as C
ROOT = C.ROOT
sites = json.load(open(f"{ROOT}/v2/sites.json"))
for sid, s in sites.items():
    g = C.best_near_grid(s["x"], s["y"])
    off = np.arange(-4500, 4500.1, 10.0); X, Y = np.meshgrid(s["x"] + off, s["y"] - off)   # row 0 = north edge
    viz = g.sample(X.ravel(), Y.ravel()).reshape(X.shape).astype("float32")
    so = np.arange(-400, 400.1, g.res); XS, YS = np.meshgrid(s["x"] + so, s["y"] - so)
    slope_z = g.sample(XS.ravel(), YS.ravel()).reshape(XS.shape).astype("float32")
    np.savez_compressed(f"{ROOT}/v2/{sid}_terrain.npz", viz=viz, viz_res=10.0, viz_half=4500.0, slope_z=slope_z, slope_res=g.res, slope_half=400.0)
    print(sid, viz.shape, slope_z.shape, "nan in viz: %.1f%%" % (100 * np.isnan(viz).mean()), flush=True)
