"""Export validated engine data for the web front-end (static files, no server needed).
Per site: <id>.json (metadata + horizon) and <id>.bin (Float32 time series, hourly, row-major)."""
import json, os, numpy as np
ROOT = "/home/claude/lss/data"; OUT = "/home/claude/lss/web-data"
os.makedirs(OUT, exist_ok=True)
sites = json.load(open(f"{ROOT}/v2/sites.json"))
dsn = np.load(f"{ROOT}/dsn.npz")["any"]
FIELDS = ["sun_az", "sun_el", "earth_az", "earth_el", "sun_frac_2m", "earth_margin_2m", "sun_frac_10m", "earth_margin_10m", "dsn_any"]
index = []
for sid, s in sites.items():
    d = np.load(f"{ROOT}/v2/{sid}.npz"); k = slice(0, None, 2)            # 30 min -> hourly
    cols = [d["sun_az"][k], d["sun_el"][k], d["earth_az"][k], d["earth_el"][k], d["sun_frac_0"][k], d["earth_margin_0"][k],
            d["sun_frac_1"][k], d["earth_margin_1"][k], dsn[k].astype("float32")]
    arr = np.stack(cols, axis=1).astype("<f4"); arr.tofile(f"{OUT}/{sid}.bin")
    cl = f"{ROOT}/v2/{sid}_clones_hz.npy"
    meta = dict(id=sid, name=s["name"], lat=round(s["lat"], 5), lon=round(s["lon"], 5), ground_height_m=round(s["height_m"], 1),
                terrain=s["terrain"], point=s["point"],
                time=dict(start_unix=int(d["unix"][0]), step_s=3600, count=int(arr.shape[0])),
                bin=dict(file=f"{sid}.bin", dtype="float32 little-endian", columns=FIELDS, layout="row-major [count x columns]"),
                horizon=dict(az_step_deg=0.25, heights_m=[2, 10, 20], elevation_deg=[[round(float(v), 3) for v in row] for row in d["hz"]]),
                horizon_terrain_clones=([[round(float(v), 3) for v in c[0]] for c in np.load(cl)] if os.path.exists(cl) else None))
    json.dump(meta, open(f"{OUT}/{sid}.json", "w"))
    index.append(dict(id=sid, name=s["name"], lat=meta["lat"], lon=meta["lon"], x_m=round(s["x"]), y_m=round(s["y"]),
                      sunlit_pct_2m=round(100 * float((d["sun_frac_0"] > 0.5).mean()), 1), earth_pct_2m=round(100 * float((d["earth_margin_0"] > 0).mean()), 1)))
json.dump(dict(sites=index, period="2026-11-01 to 2032-12-31 UTC", source="Lunar Site Scout engine v2 (validated vs JPL Horizons)"),
          open(f"{OUT}/index.json", "w"), indent=1)
for f in ["report_example.json", "validation_report.json", "mission_profile_schema.json", "profiles.json"]:
    os.system(f"cp {ROOT}/{f} {OUT}/")
print("exported", len(index), "sites")
