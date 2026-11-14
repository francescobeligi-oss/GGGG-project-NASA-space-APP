"""Step 3 - Mission simulation for one site + start date + Mission Profile.
Pure numpy; used by the app. Time step = 30 min (from the ephemeris grid)."""
import json
import numpy as np

ROOT = "/home/claude/lss/data"
HEIGHTS = [2.0, 10.0, 20.0]
DT_H = 0.5

DEFAULTS = dict(  # neutral defaults; every one is shown in the UI and can be changed
    days=14.0, height_m=2.0, panel="vertical_tracking", panel_az=0.0,
    array_w=200.0, load_ops_w=150.0, load_survival_w=60.0,
    battery_wh=None, dod=0.8, min_earth_el=0.0, data_mb=None, rate_kbps=None,
    min_sun_el_landing=None, _frac=None, _load_unknown=False,
)

_cache = {}
def site(sid):
    if sid not in _cache:
        e = np.load(f"{ROOT}/ephem/{sid}.npz"); v = np.load(f"{ROOT}/vis/{sid}.npz")
        _cache[sid] = dict(unix=e["unix"], sun_az=e["sun_az"], sun_el=e["sun_el"],
                           earth_az=e["earth_az"], earth_el=e["earth_el"],
                           sun_frac=[v[f"sun_frac_{i}"] for i in range(3)],
                           earth_margin=[v[f"earth_margin_{i}"] for i in range(3)])
    return _cache[sid]

def _runs(mask):
    """Lengths (in steps) of consecutive True runs."""
    m = np.concatenate([[0], mask.astype(int), [0]])
    d = np.diff(m); s, e = np.where(d == 1)[0], np.where(d == -1)[0]
    return e - s, s

def simulate(sid, start_unix, p):
    p = {**DEFAULTS, **{k: v for k, v in p.items() if v is not None or k in ("battery_wh", "data_mb", "rate_kbps")}}
    s = site(sid)
    hi = int(np.argmin([abs(h - p["height_m"]) for h in HEIGHTS]))
    i0 = int(np.searchsorted(s["unix"], start_unix)); n = int(p["days"] * 24 / DT_H)
    sl = slice(i0, i0 + n)
    t = s["unix"][sl]; s_az = s["sun_az"][sl]; s_el = s["sun_el"][sl]
    frac = p["_frac"][sl] if p.get("_frac") is not None else s["sun_frac"][hi][sl]
    earth = s["earth_margin"][hi][sl] > p["min_earth_el"]

    # panel geometry: at the pole the Sun is almost on the horizon
    if p["panel"] == "horizontal":
        geo = np.clip(np.sin(np.radians(s_el)), 0, None)
    elif p["panel"] == "vertical_fixed":
        geo = np.clip(np.cos(np.radians(s_az - p["panel_az"])), 0, None) * np.cos(np.radians(s_el))
    else:  # vertical, rotating to face the Sun
        geo = np.cos(np.radians(s_el))
    gen_w = p["array_w"] * frac * geo
    load_w = np.full(n, float(p["load_ops_w"]))
    net_wh = (gen_w - load_w) * DT_H

    # battery requirement = deepest drawdown of cumulative energy (starting full)
    cum = np.concatenate([[0.0], np.cumsum(net_wh)])
    drawdown = np.maximum.accumulate(cum) - cum
    need_wh = float(drawdown.max()) / max(p["dod"], 1e-6)

    soc = None; dead_at = None
    if p["battery_wh"]:
        cap = p["battery_wh"] * p["dod"]; soc = np.empty(n); e = cap
        for k in range(n):
            e = min(cap, e + net_wh[k]); soc[k] = e / cap
            if e <= 0 and dead_at is None: dead_at = k * DT_H
            e = max(e, 0.0)

    # requirement when the load is unknown: highest constant load the battery + array can sustain
    max_load = None
    if p["battery_wh"] and p.get("_load_unknown"):
        cap = p["battery_wh"] * p["dod"]
        def ok(L):
            e = cap
            for g in gen_w:
                e = min(cap, e + (g - L) * DT_H)
                if e < 0: return False
            return True
        lo_, hi_ = 0.0, float(gen_w.max()) + 1.0
        for _ in range(20):
            m = (lo_ + hi_) / 2
            lo_, hi_ = (m, hi_) if ok(m) else (lo_, m)
        max_load = lo_
    sunlit = frac > 0.5
    dark_runs, _ = _runs(~sunlit)
    first_dark = np.argmax(~sunlit) if (~sunlit).any() else n
    first_noearth = np.argmax(~earth) if (~earth).any() else n
    res = dict(
        site=sid, start=float(t[0]), hours=n * DT_H, height_m=HEIGHTS[hi],
        sun_hours=float(sunlit.sum() * DT_H), earth_hours=float(earth.sum() * DT_H),
        both_hours=float((sunlit & earth).sum() * DT_H),
        longest_dark_h=float(dark_runs.max() * DT_H) if len(dark_runs) else 0.0,
        hours_to_sunset=float(first_dark * DT_H), hours_to_earthset=float(first_noearth * DT_H),
        sun_el_landing=float(s_el[0]), sun_visible_landing=bool(sunlit[0]),
        energy_gen_kwh=float(gen_w.sum() * DT_H / 1000), energy_use_kwh=float(load_w.sum() * DT_H / 1000),
        battery_needed_wh=need_wh, dead_after_h=dead_at, max_load_w=max_load,
        avg_power_w=float(gen_w.mean()),
        hours_to_earthrise=float(np.argmax(earth) * DT_H) if earth.any() else None,
        data_mb_possible=(float(earth.sum() * DT_H * 3600 * p["rate_kbps"] / 8000) if p["rate_kbps"] else None),
        series=dict(t=t, sun_frac=frac, sun_el=s_el, sun_az=s_az, earth=earth,
                    earth_el=s["earth_el"][sl], earth_az=s["earth_az"][sl], gen_w=gen_w, soc=soc),
    )
    res["verdict"], res["reasons"] = verdict(res, p)
    return res

def verdict(r, p):
    red, yellow = [], []
    if not r["sun_visible_landing"]: red.append("Sun not visible at landing")
    if p.get("min_sun_el_landing") is not None and r["sun_el_landing"] < p["min_sun_el_landing"]:
        yellow.append("Sun lower than required at landing (%.1f deg)" % r["sun_el_landing"])
    if p.get("_load_unknown"):
        yellow.append("Power use not provided: see the requirement (max sustainable load)")
    elif r["dead_after_h"] is not None: red.append("Battery empty after %.0f h" % r["dead_after_h"])
    elif p["battery_wh"] and r["battery_needed_wh"] > 0.8 * p["battery_wh"]: yellow.append("Battery margin under 20%")
    if r["hours_to_sunset"] < 0.5 * r["hours"]: yellow.append("Sunset after %.0f h" % r["hours_to_sunset"])
    if r["earth_hours"] < 0.3 * r["hours"]: yellow.append("Earth visible only %.0f%% of the time" % (100 * r["earth_hours"] / r["hours"]))
    if r["data_mb_possible"] is not None and p.get("data_mb") and r["data_mb_possible"] < p["data_mb"]:
        red.append("Not enough contact time for the data")
    v = "red" if red else ("yellow" if yellow else "green")
    return v, red + yellow

if __name__ == "__main__":
    import datetime as dt
    t0 = dt.datetime(2027, 3, 1, tzinfo=dt.timezone.utc).timestamp()
    for sid in ["Site01", "Site04", "Site07", "Site11", "Site23"]:
        for panel in ["vertical_tracking", "horizontal"]:
            r = simulate(sid, t0, dict(panel=panel, battery_wh=700, rate_kbps=100))
            print(sid, panel[:8], r["verdict"], "sun %.0fh earth %.0fh dark %.0fh sunset %.0fh need %.0fWh" % (
                r["sun_hours"], r["earth_hours"], r["longest_dark_h"], r["hours_to_sunset"], r["battery_needed_wh"]), r["reasons"][:2])
