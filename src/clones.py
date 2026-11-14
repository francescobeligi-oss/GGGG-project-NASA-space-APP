"""Terrain uncertainty: horizon of each site recomputed on NASA LOLA DEM clones (statistically equivalent terrains)."""
import glob, json, sys, numpy as np, rasterio
sys.path.insert(0, "/home/claude/lss/src")
import core as C
ROOT = C.ROOT
sites = json.load(open(f"{ROOT}/v2/sites.json"))
for sid, s in sites.items():
    files = sorted(glob.glob(f"{ROOT}/dem/clones/{sid}_final_adj_5mpp_*_err.tif"))
    if not files: continue
    hzs = []
    for f in files:
        z, tr, res = C._read(f); g = C.Grid(z, tr, res, "clone")
        _, hz = C.horizon(s["x"], s["y"], g); hzs.append(hz)
    d = np.load(f"{ROOT}/v2/{sid}.npz"); hzs = np.array(hzs)
    sun = [(C.sun_fraction(d["sun_az"], d["sun_el"], h[0]) > 0.5).mean() for h in hzs]
    np.save(f"{ROOT}/v2/{sid}_clones_hz.npy", hzs.astype("float32"))
    print(f"{sid:10s} {len(files)} clones | sunlit {100*min(sun):.1f}-{100*max(sun):.1f}% (nominal {100*(d['sun_frac_0']>0.5).mean():.1f}%)", flush=True)
