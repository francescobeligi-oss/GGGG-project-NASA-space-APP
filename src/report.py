"""Standard output: the Site Assessment Report (JSON + plain-English summary)."""
import json, sys, datetime as dt
sys.path.insert(0, "/home/claude/lss/src")
import engine as E

SCHEMA = json.load(open(f"{E.ROOT}/mission_profile_schema.json"))

def provenance(prof):
    rows, assumptions, missing_core = [], [], []
    for f in SCHEMA["fields"]:
        x = prof.get(f["block"], {}).get(f["key"])
        v = x.get("v") if isinstance(x, dict) else x
        if v is None:
            if f.get("if_missing"): assumptions.append(f"{f['block']}.{f['key']}: {f['if_missing']}")
            elif f["core"]: missing_core.append(f"{f['block']}.{f['key']}")
        else:
            rows.append(dict(field=f"{f['block']}.{f['key']}", value=v, label=x.get("l") if isinstance(x, dict) else "declared",
                             source=x.get("src") if isinstance(x, dict) else None))
    return rows, assumptions, missing_core

def build(prof, top=3):
    rows = E.scan(prof); wins = E.windows(rows)
    seen, best = set(), []
    for r in rows:  # best option per site, then the top N overall
        if r["site"] in seen: continue
        seen.add(r["site"]); best.append(r)
    best = best[:top]
    options = []
    for b in best:
        t = dt.datetime.fromisoformat(b["landing_utc"]).timestamp()
        ev = E.evaluate(b["site"], t, prof, full=False)
        options.append({k: ev[k] for k in ("site", "site_name", "landing_utc", "verdict", "worst_case_verdict", "reasons", "landing",
                                            "light", "comms", "power", "ranges", "terrain", "resources", "orientation") if k in ev} | {"terrain_uncertainty": ev.get("terrain_uncertainty")})
    prov, assumptions, missing = provenance(prof)
    o = options[0] if options else None
    summary = ("No site and date passes the checks in the scanned period." if not o else
               f"Best option: land at {o['site_name']} on {o['landing_utc'][:16].replace('T', ' ')} UTC ({o['verdict'].upper()}, worst case "
               f"{o['worst_case_verdict'].upper()}). Sunlight {o['ranges']['sun_pct'][0]:.0f}-{o['ranges']['sun_pct'][1]:.0f}% of the mission, "
               f"Earth contact {o['comms']['contact_pct']:.0f}%, longest darkness {o['light']['longest_dark_h']:.0f} h.")
    return dict(product="Lunar Site Scout - Site Assessment Report v1", generated_utc=dt.datetime.now(dt.timezone.utc).isoformat()[:19],
                summary=summary, best_options=options,
                landing_windows={k: [dict(site=w["site_name"], open=w["open"], close=w["close"], best=w["best"]["landing_utc"]) for w in v]
                                 for k, v in wins.items()},
                scanned=dict(landing_times=len(rows), sites=len({r['site'] for r in rows})),
                provenance=prov, assumptions=assumptions, missing_core_fields=missing,
                not_evaluated=E.evaluate.__doc__ and ["rock and crater size inside the ellipse", "Sun direction vs approach trajectory",
                                                      "distance to other landers and infrastructure", "full thermal model (proxy used)"],
                validation=json.load(open(f"{E.ROOT}/validation_report.json")) if __import__("os").path.exists(f"{E.ROOT}/validation_report.json") else None,
                data_sources=["NASA GSFC LOLA 5 m site DEMs, 10 m (83S) and 80 m south polar DEMs, LOLA DEM clones", "JPL DE421 ephemerides (validated vs JPL Horizons)",
                              "NASA LOLA permanently shadowed regions catalogue", "NASA DSN station locations"])

if __name__ == "__main__":
    prof = json.load(open(sys.argv[1] if len(sys.argv) > 1 else f"{E.ROOT}/test_profile.json"))
    rep = build(prof)
    json.dump(rep, open(f"{E.ROOT}/report_example.json", "w"), indent=1, default=float)
    print(rep["summary"]); print("windows:", {k: len(v) for k, v in rep["landing_windows"].items()})
    print("assumptions:", rep["assumptions"]); print("missing core:", rep["missing_core_fields"])
