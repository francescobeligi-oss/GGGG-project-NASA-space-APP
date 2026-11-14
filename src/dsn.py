"""Ground stations: when does at least one NASA Deep Space Network complex see the Moon (elevation > 10 deg)?"""
import numpy as np
from skyfield.api import load, wgs84
ROOT = "/home/claude/lss/data"
STATIONS = {"Goldstone": (35.4267, -116.8900), "Madrid": (40.4314, -4.2481), "Canberra": (-35.4014, 148.9817)}
MIN_EL = 10.0
e = np.load(f"{ROOT}/v2/Site01.npz"); unix = e["unix"]
ts = load.timescale(); eph = load(f"{ROOT}/kernels/de421.bsp")
t = ts.utc(2026, 11, 1, 0, 0, unix - unix[0])
out = {}
for name, (lat, lon) in STATIONS.items():
    alt, _, _ = (eph["earth"] + wgs84.latlon(lat, lon)).at(t).observe(eph["moon"]).apparent().altaz()
    out[name] = alt.degrees > MIN_EL
anyst = np.any(np.stack(list(out.values())), axis=0)
np.savez_compressed(f"{ROOT}/dsn.npz", unix=unix, any=anyst, **out)
print("DSN coverage of the Moon: any station %.0f%%" % (100 * anyst.mean()), {k: "%.0f%%" % (100 * v.mean()) for k, v in out.items()})
