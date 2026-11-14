"""Precompute ellipse statistics (radii 50/100/250 m) and the polar hillshade for the map."""
import json, sys, numpy as np
sys.path.insert(0, "/home/claude/lss/src")
import shadow as S, horizon as H
ROOT = "/home/claude/lss/data"
sites = json.load(open(f"{ROOT}/sites.json"))
# hillshade of the region (400 m grid, +-150 km)
d, z = H.load(f"{ROOT}/dem/LDEM_80S_80MPP_ADJ.TIF")
g = np.arange(-150000, 150001, 400.0); X, Y = np.meshgrid(g, -g)
Z = H.sample(d, z, X.ravel(), Y.ravel()).reshape(X.shape)
gy, gx = np.gradient(Z, 400.0)
az, alt = np.radians(315), np.radians(35)
hs = np.sin(alt) * np.cos(np.arctan(np.hypot(gx, gy))) + np.cos(alt) * np.sin(np.arctan(np.hypot(gx, gy))) * np.cos(az - np.arctan2(-gx, gy))
np.savez_compressed(f"{ROOT}/hillshade.npz", g=g, hs=hs.astype("float32"), z=Z.astype("float32"))
print("hillshade done", flush=True)
import os; os.makedirs(f"{ROOT}/ellipse", exist_ok=True)
for sid in sites:
    out = {}
    for r in (50.0, 100.0, 250.0):
        x, y, f = S.ellipse_sunlight(sid, r)
        pct = (f > 0.5).mean(axis=1)
        order = np.argsort(pct); k = [order[int(q * (len(order) - 1))] for q in (0.1, 0.5, 0.9)]
        out[f"r{int(r)}_x"], out[f"r{int(r)}_y"], out[f"r{int(r)}_pct"] = x, y, pct
        out[f"r{int(r)}_bands"] = f[k]  # sun fraction series of the p10, p50, p90 points
        print(sid, r, "sun %% p10 %.0f p50 %.0f p90 %.0f" % tuple(100 * pct[k]), flush=True)
    np.savez_compressed(f"{ROOT}/ellipse/{sid}.npz", **out)
print("ALL DONE")
