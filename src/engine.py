"""Lunar Site Scout - assessment engine v2.
Input : a Mission Profile (dict, see data/mission_profile_schema.json).
Output: a standard Site Assessment (dict) for every site and landing time, plus a landing-window scan.
Principle: real values first; an unknown value is never guessed - it is bounded (range) or turned into a requirement."""
import json, math, datetime as dt
import numpy as np, rasterio

ROOT = "/home/claude/lss/data"
HEIGHTS = [2.0, 10.0, 20.0]
DT_H = 0.5
_C = {}

def _sites():
    return json.load(open(f"{ROOT}/v2/sites.json"))

def _site(sid):
    if sid not in _C:
        d = np.load(f"{ROOT}/v2/{sid}.npz")
        _C[sid] = dict(unix=d["unix"], sun_az=d["sun_az"], sun_el=d["sun_el"], earth_az=d["earth_az"], earth_el=d["earth_el"],
                       sun_frac=[d[f"sun_frac_{i}"] for i in range(3)], earth_margin=[d[f"earth_margin_{i}"] for i in range(3)],
                       far=d["far_hz"], ell={r: (d[f"ell{r}_x"], d[f"ell{r}_y"], d[f"ell{r}_hz"].astype("float32")) for r in (50, 100, 250)})
    return _C[sid]

AZ1 = np.arange(0, 360, 1.0)
_EC = {}
def ellipse_series(sid, radius, hi, sl):
    """Exact per-point Sun fraction and Earth margin inside the landing ellipse for this window (cached by span).
    Returns sun_frac (points x n) and earth_margin (points x n)."""
    key = (sid, radius, hi)
    if key in _EC:
        a0, sf, em = _EC[key]
        if a0 <= sl.start and sl.stop <= a0 + sf.shape[1]:
            return sf[:, sl.start - a0:sl.stop - a0], em[:, sl.start - a0:sl.stop - a0]
    sf, em = _ellipse_compute(sid, radius, hi, sl)
    _EC[key] = (sl.start, sf, em)
    return sf, em

def prefetch(sid, radius, hi, sl):
    _EC.pop((sid, radius, hi), None); ellipse_series(sid, radius, hi, sl)

def _ellipse_compute(sid, radius, hi, sl):
    import core as Cc
    S = _site(sid); px, py, nh = S["ell"][radius]
    far = S["far"][hi][::4]                                   # 0.25 deg grid -> 1 deg grid
    s_az, s_el, e_az, e_el = S["sun_az"][sl], S["sun_el"][sl], S["earth_az"][sl], S["earth_el"][sl]
    sf = np.empty((len(px), len(s_az)), "float32"); em = np.empty_like(sf)
    for k in range(len(px)):
        hz = np.maximum(nh[k, hi], far)
        sf[k] = Cc.sun_fraction(s_az, s_el, hz, az=AZ1)
        em[k] = e_el - np.interp(e_az, AZ1, hz, period=360)
    return sf, em

def _dsn():
    if "dsn" not in _C: _C["dsn"] = dict(np.load(f"{ROOT}/dsn.npz"))
    return _C["dsn"]

def _psr():
    if "psr" not in _C: _C["psr"] = dict(np.load(f"{ROOT}/psr.npz"))
    return _C["psr"]

def _runs(mask):
    m = np.concatenate([[0], mask.astype(np.int8), [0]]); d = np.diff(m)
    return np.where(d == -1)[0] - np.where(d == 1)[0]

def _val(p, *keys, default=None):
    """Read a profile value; profile fields are {"v": value, "l": label, "src": source} or plain values."""
    x = p
    for k in keys:
        x = x.get(k) if isinstance(x, dict) else None
        if x is None: return default
    return x.get("v", default) if isinstance(x, dict) and "v" in x else x

# ---------------- static site checks ----------------
def slope_in_ellipse(sid, radius, max_slope):
    import core as Cc
    s = _sites()[sid]; g = Cc.best_near_grid(s["x"], s["y"], half=radius + 200)
    k = int(radius / g.res) + 2; off = np.arange(-k, k + 1) * g.res
    X, Y = np.meshgrid(s["x"] + off, s["y"] + off); z = g.sample(X.ravel(), Y.ravel()).reshape(X.shape)
    gy, gx = np.gradient(z, g.res); slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    inside = (X - s["x"]) ** 2 + (Y - s["y"]) ** 2 <= radius ** 2; sl = slope[inside]
    return dict(resolution_m=g.res, median_deg=float(np.median(sl)), p90_deg=float(np.percentile(sl, 90)),
                safe_fraction=(float((sl <= max_slope).mean()) if max_slope else None))

def psr_access(sid, rover_km=None):
    s, P = _sites()[sid], _psr(); d = np.hypot(P["x"] - s["x"], P["y"] - s["y"]) / 1000
    out = {}
    for name, amin in (("any", 0.0), ("over_0.01km2", 0.01), ("over_1km2", 1.0)):
        m = P["area_km2"] > amin; out[f"nearest_{name}_km"] = float(d[m].min())
    if rover_km: out["count_within_rover_range"] = int(((d <= rover_km) & (P["area_km2"] > 0.01)).sum())
    return out

# ---------------- power ----------------
def _panel_power(panels, s_az, s_el, frac, yaw):
    w = np.zeros_like(s_el, dtype=float)
    for pn in panels:
        tilt = math.radians(pn.get("tilt_deg", 90.0)); peak = pn["peak_w"]
        el = np.radians(s_el)
        if pn.get("tracking", False):
            cosi = np.cos(el - (math.pi / 2 - tilt)) if tilt < math.pi / 2 else np.cos(el)
        else:
            az = np.radians(s_az - (pn.get("azimuth_deg", 0.0) + yaw))
            cosi = np.sin(tilt) * np.cos(el) * np.cos(az) + np.cos(tilt) * np.sin(el)
        w += peak * np.clip(cosi, 0, None)
    return w * frac

def _battery(gen_w, ops_w, surv_w, cap_wh, dod, eff):
    """Two modes: operations, or survival when usable charge falls under 20%. Returns soc, dead index, hours in survival."""
    usable = cap_wh * dod; e = usable; soc = np.empty(len(gen_w)); dead = None; surv = 0
    for k, g in enumerate(gen_w):
        load = ops_w if e > 0.2 * usable or surv_w is None else surv_w
        if load == surv_w and surv_w is not None and e <= 0.2 * usable: surv += 1
        net = g - load
        e = min(usable, e + (net * eff if net > 0 else net) * DT_H)
        if e < 0:
            if dead is None: dead = k
            e = 0.0
        soc[k] = e / usable
    return soc, dead, surv * DT_H

def _requirements(gen_w, ops_w, dod, eff):
    net = np.where(gen_w - ops_w > 0, (gen_w - ops_w) * eff, gen_w - ops_w) * DT_H
    cum = np.concatenate([[0.0], np.cumsum(net)])
    return float((np.maximum.accumulate(cum) - cum).max() / dod)

def _max_load(gen_w, cap_wh, dod, eff):
    usable = cap_wh * dod
    def ok(L):
        e = usable
        for g in gen_w:
            n = g - L; e = min(usable, e + (n * eff if n > 0 else n) * DT_H)
            if e < 0: return False
        return True
    lo, hi = 0.0, float(gen_w.max()) + 1
    for _ in range(18):
        m = (lo + hi) / 2; lo, hi = (m, hi) if ok(m) else (lo, m)
    return lo

# ---------------- one assessment ----------------
def assess(sid, start_unix, prof, band=1, yaw=0.0, full=True, req=True):
    S = _site(sid)
    days = _val(prof, "mission", "duration_days", default=14.0)
    h = _val(prof, "power", "panel_height_m", default=2.0); hi = int(np.argmin([abs(x - h) for x in HEIGHTS]))
    ant_h = _val(prof, "comms", "antenna_height_m", default=h); ai = int(np.argmin([abs(x - ant_h) for x in HEIGHTS]))
    radius = int(_val(prof, "landing", "ellipse_radius_m", default=100)); radius = min((50, 100, 250), key=lambda r: abs(r - radius))
    i0 = int(np.searchsorted(S["unix"], start_unix)); n = int(days * 24 / DT_H); sl = slice(i0, i0 + n)
    if i0 + n > len(S["unix"]): raise ValueError("date outside the computed period (Nov 2026 - Dec 2032)")
    s_az, s_el = S["sun_az"][sl], S["sun_el"][sl]
    min_e = _val(prof, "comms", "min_earth_elevation_deg", default=0.0)
    if band is None:
        frac = S["sun_frac"][hi][sl]; emarg = S["earth_margin"][ai][sl]
    else:
        # exact for this window: every point of the ellipse, then the 10th / 50th / 90th percentile point,
        # chosen separately for sunlight and for Earth contact (worst case is conservative on both)
        q = (0.10, 0.50, 0.90)[band]
        sf, _ = ellipse_series(sid, radius, hi, sl)
        _, em = ellipse_series(sid, radius, ai, sl) if ai != hi else (None, _)
        ks = np.argsort((sf > 0.5).mean(axis=1)); ke = np.argsort((em > min_e).mean(axis=1))
        frac = sf[ks[int(q * (len(ks) - 1))]]; emarg = em[ke[int(q * (len(ke) - 1))]]
    # communications: Earth above terrain + margin, a ground station sees the Moon, passes long enough
    earth = emarg > min_e
    stations = _val(prof, "comms", "ground_stations", default="DSN")
    if stations and stations != "none": earth = earth & _dsn()["any"][sl]
    min_pass = _val(prof, "comms", "min_pass_hours", default=0.0)
    if min_pass:
        m = np.concatenate([[0], earth.astype(np.int8), [0]]); d = np.diff(m)
        for a, b in zip(np.where(d == 1)[0], np.where(d == -1)[0]):
            if (b - a) * DT_H < min_pass: earth[a:b] = False
    sunlit = frac > 0.5

    r = dict(site=sid, site_name=_sites()[sid]["name"], landing_utc=dt.datetime.fromtimestamp(float(S["unix"][i0]), dt.timezone.utc).isoformat(),
             duration_h=n * DT_H, ellipse_radius_m=radius, band=["worst (p10)", "median", "best (p90)"][band] if band is not None else "centre")
    # landing
    r["landing"] = dict(sun_elevation_deg=float(s_el[0]), sun_azimuth_deg=float(s_az[0]), sun_visible=bool(sunlit[0]),
                        earth_visible=bool(earth[0]), earth_elevation_deg=float(S["earth_el"][sl][0]))
    # light and contact
    dark = _runs(~sunlit); gaps = _runs(~earth)
    r["light"] = dict(sun_hours=float(sunlit.sum() * DT_H), sun_pct=float(100 * sunlit.mean()),
                      hours_to_sunset=float((np.argmax(~sunlit) if (~sunlit).any() else n) * DT_H),
                      longest_dark_h=float(dark.max() * DT_H) if len(dark) else 0.0, dark_periods=int(len(dark)))
    r["comms"] = dict(contact_hours=float(earth.sum() * DT_H), contact_pct=float(100 * earth.mean()), passes=int(len(_runs(earth))),
                      longest_gap_h=float(gaps.max() * DT_H) if len(gaps) else 0.0,
                      hours_to_earthset=float((np.argmax(~earth) if (~earth).any() else n) * DT_H),
                      hours_to_earthrise=(float(np.argmax(earth) * DT_H) if earth.any() else None))
    rate = _val(prof, "comms", "data_rate_kbps"); need_mb = _val(prof, "comms", "data_volume_mb")
    if rate: r["comms"]["data_possible_mb"] = float(earth.sum() * DT_H * 3600 * rate / 8000)
    elif need_mb: r["comms"]["rate_needed_kbps"] = float(need_mb * 8000 / max(earth.sum() * DT_H * 3600, 1))

    # power
    panels = _val(prof, "power", "panels", default=None)
    ops = _val(prof, "power", "load_operations_w"); surv = _val(prof, "power", "load_survival_w")
    cap = _val(prof, "power", "battery_wh"); dod = _val(prof, "power", "battery_dod", default=0.8)
    eff = _val(prof, "power", "charge_efficiency", default=0.95)
    pw = {}
    if panels and any(pn.get("peak_w") is None for pn in panels) and ops:
        # requirement: smallest array (scale on panel geometry) that keeps the mission alive
        unit = _panel_power([{**pn, "peak_w": 1.0} for pn in panels], s_az, s_el, frac, yaw)
        if unit.max() <= 0:
            pw["array_needed_w"] = None; pw["note"] = "no sunlight on the panels in this window"
        elif cap:
            lo, hi = 0.0, 50.0 * ops / max(unit.mean(), 1e-6)
            for _ in range(18):
                m = (lo + hi) / 2
                ok = _battery(unit * m, ops, surv, cap, dod, eff)[1] is None
                lo, hi = (lo, m) if ok else (m, hi)
            pw["array_needed_w"] = hi * len(panels)
        else:
            s = ops / max(unit.mean(), 1e-6)
            pw["array_needed_w"] = s * len(panels); pw["battery_needed_wh"] = _requirements(unit * s, ops, dod, eff)
        panels = None
    if panels:
        gen = _panel_power(panels, s_az, s_el, frac, yaw)
        pw.update(energy_kwh=float(gen.sum() * DT_H / 1000), avg_w=float(gen.mean()))
        if ops is not None:
            pw["battery_needed_wh"] = _requirements(gen, ops, dod, eff)
            if cap:
                soc, dead, surv_h = _battery(gen, ops, surv, cap, dod, eff)
                pw.update(min_soc=float(soc.min()), survives=dead is None, dead_after_h=(dead * DT_H if dead is not None else None),
                          hours_in_survival_mode=surv_h)
                if full: r["series_soc"] = soc
        elif cap and req:
            pw["max_sustainable_load_w"] = _max_load(gen, cap, dod, eff)
        if full: r["series_gen"] = gen
    r["power"] = pw
    if full:
        r["series"] = dict(t=S["unix"][sl], sun_frac=frac, sun_el=s_el, sun_az=s_az, earth=earth,
                           earth_el=S["earth_el"][sl], earth_az=S["earth_az"][sl])
    r["verdict"], r["reasons"] = _verdict(r, prof)
    return r

def _verdict(r, prof):
    red, yel = [], []
    L, P, C = r["landing"], r["power"], r["comms"]
    if not L["sun_visible"]: red.append("Sun hidden by terrain at landing")
    m = _val(prof, "landing", "min_sun_elevation_deg")
    if m is not None and L["sun_elevation_deg"] < m: yel.append(f"Sun at {L['sun_elevation_deg']:.1f} deg at landing, below the {m} deg required")
    if _val(prof, "landing", "earth_visible_at_landing") and not L["earth_visible"]: red.append("No Earth contact during landing")
    if _val(prof, "mission", "continuous_sun_required") and r["light"]["longest_dark_h"] > 0:
        red.append(f"Not continuously sunlit (dark for {r['light']['longest_dark_h']:.0f} h)")
    if P.get("survives") is False: red.append(f"Battery empty after {P['dead_after_h']:.0f} h")
    elif P.get("min_soc") is not None and P["min_soc"] < 0.2: yel.append("Battery falls below 20% (survival mode)")
    if "max_sustainable_load_w" in P: yel.append(f"Power use not given: max sustainable load {P['max_sustainable_load_w']:.0f} W")
    need = _val(prof, "comms", "data_volume_mb")
    if need and C.get("data_possible_mb") is not None and C["data_possible_mb"] < need: red.append("Not enough contact time to send the data")
    if _val(prof, "comms", "mode") == "DTE" and C["contact_pct"] < 30: yel.append(f"Earth contact only {C['contact_pct']:.0f}% of the time")
    return ("red" if red else "yellow" if yel else "green"), red + yel

# ---------------- full product: assessment with ranges ----------------
def evaluate(sid, start_unix, prof, full=True):
    """Median case plus worst/best across the landing ellipse and across unknown lander orientation."""
    panels = _val(prof, "power", "panels", default=None) or []
    yaw_known = _val(prof, "power", "lander_yaw_deg") is not None
    yaws = [_val(prof, "power", "lander_yaw_deg")] if yaw_known or all(p.get("tracking") for p in panels) else list(range(0, 360, 45))
    cases = [assess(sid, start_unix, prof, band=b, yaw=y, full=False) for b in (0, 2) for y in yaws]
    mid = assess(sid, start_unix, prof, band=1, yaw=yaws[0], full=full)
    def rng(*k):
        vals = []
        for c in cases + [mid]:
            x = c
            for kk in k: x = x.get(kk) if isinstance(x, dict) else None
            if x is not None: vals.append(x)
        return [min(vals), max(vals)] if vals else None
    mid["ranges"] = {"sun_pct": rng("light", "sun_pct"), "longest_dark_h": rng("light", "longest_dark_h"),
                     "contact_pct": rng("comms", "contact_pct"), "battery_needed_wh": rng("power", "battery_needed_wh"),
                     "max_sustainable_load_w": rng("power", "max_sustainable_load_w"), "energy_kwh": rng("power", "energy_kwh"),
                     "array_needed_w": rng("power", "array_needed_w")}
    order = {"green": 0, "yellow": 1, "red": 2}
    mid["worst_case_verdict"] = max([c["verdict"] for c in cases + [mid]], key=order.get)
    mid["orientation"] = "known" if yaw_known else ("not needed (tracking panels)" if len(yaws) == 1 else "unknown: 8 orientations tested")
    radius = mid["ellipse_radius_m"]
    # terrain uncertainty: same window recomputed on NASA LOLA terrain clones (centre point)
    import os, core as Cc
    cf = f"{ROOT}/v2/{sid}_clones_hz.npy"
    if os.path.exists(cf):
        S = _site(sid); hzs = np.load(cf)
        h = _val(prof, "power", "panel_height_m", default=2.0); hi = int(np.argmin([abs(x - h) for x in HEIGHTS]))
        i0 = int(np.searchsorted(S["unix"], start_unix)); n = int(_val(prof, "mission", "duration_days", default=14.0) * 24 / DT_H); sl = slice(i0, i0 + n)
        sun = [float((Cc.sun_fraction(S["sun_az"][sl], S["sun_el"][sl], hz[hi]) > 0.5).mean() * 100) for hz in hzs]
        dark = [float(_runs(Cc.sun_fraction(S["sun_az"][sl], S["sun_el"][sl], hz[hi]) <= 0.5).max(initial=0) * DT_H) for hz in hzs]
        mid["terrain_uncertainty"] = dict(clones=len(hzs), centre_sun_pct=[min(sun), max(sun)], centre_longest_dark_h=[min(dark), max(dark)])
    mid["terrain"] = slope_in_ellipse(sid, radius, _val(prof, "landing", "max_slope_deg"))
    if mid["terrain"]["safe_fraction"] is not None and mid["terrain"]["safe_fraction"] < 0.9:
        mid["reasons"].append(f"Only {100*mid['terrain']['safe_fraction']:.0f}% of the ellipse below the max slope")
        if mid["verdict"] == "green": mid["verdict"] = "yellow"
    mid["resources"] = psr_access(sid, _val(prof, "mobility", "rover_range_km"))
    tgt = _val(prof, "mission", "max_distance_to_psr_km")
    if tgt and mid["resources"]["nearest_over_0.01km2_km"] > tgt:
        mid["reasons"].append(f"Nearest shadowed region {mid['resources']['nearest_over_0.01km2_km']:.1f} km away (limit {tgt} km)")
        mid["verdict"] = "red"
    res_m = mid["terrain"]["resolution_m"]; sel = mid["landing"]["sun_elevation_deg"]
    if sel > 0:
        risk = (f"Sun {sel:.1f} deg above the local horizontal at landing: any depression or slope steeper than {sel:.1f} deg "
                f"facing away from the Sun is in shadow.")
    else:
        risk = (f"Sun {sel:.1f} deg, below the local horizontal (visible only because the site is high): any local depression is in shadow.")
    mid["landing"]["shadow_risk"] = risk + (f" Craters smaller than about {2*res_m:.0f} m are not resolved by the {res_m:.0f} m terrain: "
                                            f"check the ellipse with 1 m imagery (IM-2 Athena, 2025, ended in a 20 m crater).")
    mid["not_evaluated"] = ["rock and crater size inside the ellipse (needs 1 m imagery hazard maps)",
                            "Sun direction vs approach trajectory", "distance to other landers and infrastructure",
                            "full thermal model (proxy: longest dark period)"]
    return mid

# ---------------- landing-window scan: the core paid output ----------------
def scan(prof, sites=None, step_h=6.0):
    """Every site x every landing time between the earliest date and earliest + max slip."""
    t0 = dt.datetime.fromisoformat(_val(prof, "timing", "earliest_landing_utc")).replace(tzinfo=dt.timezone.utc).timestamp()
    slip = _val(prof, "timing", "max_slip_days", default=30)
    starts = t0 + np.arange(0, slip * 24 + 1e-6, step_h) * 3600
    order = {"green": 0, "yellow": 1, "red": 2}; rows = []
    days = _val(prof, "mission", "duration_days", default=14.0); n = int(days * 24 / DT_H)
    radius = int(_val(prof, "landing", "ellipse_radius_m", default=100)); radius = min((50, 100, 250), key=lambda r: abs(r - radius))
    h = _val(prof, "power", "panel_height_m", default=2.0); hi = int(np.argmin([abs(x - h) for x in HEIGHTS]))
    ant_h = _val(prof, "comms", "antenna_height_m", default=h); ai = int(np.argmin([abs(x - ant_h) for x in HEIGHTS]))
    for sid in sites or list(_sites()):
        S = _site(sid); i_a = int(np.searchsorted(S["unix"], starts[0])); i_b = min(int(np.searchsorted(S["unix"], starts[-1])) + n, len(S["unix"]))
        for hh in {hi, ai}: prefetch(sid, radius, hh, slice(i_a, i_b))
        for t in starts:
            try:
                panels = _val(prof, "power", "panels", default=None) or []
                yaws = [0.0] if (_val(prof, "power", "lander_yaw_deg") is not None or all(pn.get("tracking") for pn in panels)) else [0.0, 90.0, 180.0, 270.0]
                ws = [assess(sid, t, prof, band=0, yaw=y, full=False, req=False) for y in yaws]  # worst point, every orientation
                w = max(ws, key=lambda c: order[c["verdict"]])
                m = assess(sid, t, prof, band=1, full=False, req=False)
            except ValueError:
                continue
            rows.append(dict(site=sid, site_name=_sites()[sid]["name"], landing_utc=m["landing_utc"], verdict=m["verdict"],
                             worst_verdict=max(w["verdict"], m["verdict"], key=order.get),
                             sun_pct=m["light"]["sun_pct"], contact_pct=m["comms"]["contact_pct"],
                             longest_dark_h=m["light"]["longest_dark_h"],
                             battery_needed_wh=m["power"].get("battery_needed_wh"), reasons=m["reasons"]))
    # score: worst-case verdict first, then sunlight and contact
    for r in rows:
        r["score"] = round(100 - 40 * order[r["worst_verdict"]] - 10 * order[r["verdict"]] + 0.3 * r["sun_pct"] + 0.2 * r["contact_pct"]
                           - 0.05 * r["longest_dark_h"], 1)
    rows.sort(key=lambda r: -r["score"])
    return rows

def windows(rows, step_h=6.0):
    """Group consecutive good landing times per site into windows."""
    out = {}
    for sid in {r["site"] for r in rows}:
        rs = sorted([r for r in rows if r["site"] == sid], key=lambda r: r["landing_utc"]); cur = None
        for r in rs:
            ok = r["worst_verdict"] == "green" or (r["worst_verdict"] == "yellow" and r["verdict"] == "green")
            if ok and cur is None: cur = dict(site=sid, site_name=r["site_name"], open=r["landing_utc"], close=r["landing_utc"], best=r)
            elif ok: cur["close"] = r["landing_utc"]; cur["best"] = max(cur["best"], r, key=lambda x: x["score"])
            elif cur: out.setdefault(sid, []).append(cur); cur = None
        if cur: out.setdefault(sid, []).append(cur)
    return out
