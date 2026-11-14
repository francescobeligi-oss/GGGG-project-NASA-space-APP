"""Intake: customer documents (PDF) -> draft Mission Profile with a page citation for every value.
Step 1 (always, offline): deterministic rules. Step 2 (optional): a local LLM via an OpenAI-compatible endpoint
(e.g. Ollama) using extract_prompt.md - documents never leave the customer's machine.
Step 3: the questionnaire asks only the core fields still empty."""
import json, re, subprocess, sys
SCHEMA = json.load(open("/home/claude/lss/data/mission_profile_schema.json"))

def pages(pdf):
    txt = subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True, text=True).stdout
    return [re.sub(r"[ \t]+", " ", p) for p in txt.split("\f")]

NUM = r"(\d{1,3}(?:,\d{3})*(?:\.\d+)?)"
RULES = [  # (block, key, regex, converter, label)
    ("mission", "duration_days", rf"(?:surface operations? duration|mission duration|operate)[^\n]{{0,40}}?(?:up to )?{NUM}\s*(?:earth )?days", float, "declared"),
    ("_payload", "capacity_kg", rf"(?:payload (?:delivery )?capacity|payload mass)[^\n]{{0,30}}?{NUM}\s*kg", float, "declared"),
    ("_payload", "power_w_per_kg", rf"{NUM}\s*W(?:atts)?\b[^\n]{{0,40}}(?:per kilogram|/kg|per kg)|(?:per kilogram|/kg)[^\n]{{0,60}}?{NUM}\s*W(?:atts)?\b|{NUM}\s*Watts\s+{NUM}\s*kbps", float, "declared"),
    ("_payload", "kbps_per_kg", rf"{NUM}\s*kbps\s*(?:per kilogram|/kg|per kg)|Watts\s+{NUM}\s*kbps", float, "declared"),
    ("landing", "_ellipse_m", rf"{NUM}\s*m\s*x\s*{NUM}\s*m\s*ellipse", None, "declared"),
    ("landing", "max_slope_deg", rf"slope\s*(?:of\s*)?(?:≤|<=|less than|below|under)\s*{NUM}\s*°", float, "declared"),
    ("landing", "max_rock_size_m", rf"rock (?:height|size) of\s*{NUM}\s*m", float, "declared"),
    ("thermal", "surface_range_c", rf"LUNAR SURFACE\s*\(\s*(-?{NUM})\s*°C\s*TO\s*(-?{NUM})\s*°C", None, "declared"),
    ("power", "battery_wh", rf"{NUM}\s*Wh\b", float, "declared"),
    ("power", "_battery_ah", rf"{NUM}\s*(?:amp-hour|Ah)\b", float, "declared"),
    ("comms", "_band", r"\b(X-Band|S-Band|Ka-Band)\b", str, "declared"),
]

def rule_extract(pg, context=None):
    """All matches are collected. One distinct value -> declared. Several -> the page mentioning `context`
    (e.g. 'polar') wins; otherwise the field is marked as a conflict and goes to the questionnaire."""
    cand = {}
    for i, p in enumerate(pg, 1):
        for block, key, rx, conv, lab in RULES:
            for m in re.finditer(rx, p, re.I):
                g = [x for x in m.groups() if x is not None]
                quote = p[max(0, m.start() - 20):m.end() + 10].strip().replace("\n", " ")[:120]
                if key == "_ellipse_m": val = [float(g[0].replace(",", "")), float(g[1].replace(",", ""))]
                elif key == "surface_range_c": val = [float(g[0].replace(",", "")), float(g[2].replace(",", "") if len(g) > 2 else g[1])]
                elif conv is str: val = g[0]
                else: val = conv(g[0].replace(",", ""))
                ctx = bool(context and re.search(context, p, re.I))
                cand.setdefault((block, key), []).append(dict(v=val, page=i, quote=quote, ctx=ctx))
    found = {}
    for k, cs in cand.items():
        vals = {json.dumps(c["v"]) for c in cs}
        if len(vals) == 1:
            c = cs[0]; found[k] = {"v": c["v"], "l": "declared", "src": f"p{c['page']}: \"{c['quote']}\""}
        else:
            cc = [c for c in cs if c["ctx"]]
            if cc and len({json.dumps(c["v"]) for c in cc}) == 1:
                c = cc[0]; others = sorted({(json.dumps(x["v"]), x["page"]) for x in cs if not x["ctx"]})[:3]
                found[k] = {"v": c["v"], "l": "declared", "src": f"p{c['page']}: \"{c['quote']}\" (chosen: matches '{context}'; other values in the document: {others})"}
            else:
                found[k] = {"v": None, "l": "conflict", "candidates": [dict(v=c["v"], page=c["page"], quote=c["quote"]) for c in cs][:6]}
    return found

def to_profile(found):
    prof = {}
    def put(b, k, x): prof.setdefault(b, {})[k] = x
    for (b, k), x in found.items():
        if not k.startswith("_"): put(b, k, x)
        elif x.get("l") == "conflict": put("_conflicts", f"{b}.{k}", x)
    if ("landing", "_ellipse_m") in found:
        e = found[("landing", "_ellipse_m")]; put("landing", "ellipse_radius_m", {"v": min(e["v"]) / 2, "l": "derived", "src": e["src"] + " -> radius = half the short side"})
    cap = found.get(("_payload", "capacity_kg")); w = found.get(("_payload", "power_w_per_kg")); kb = found.get(("_payload", "kbps_per_kg"))
    cap, w, kb = [x if x and x.get('v') is not None else None for x in (cap, w, kb)]
    if cap and w: put("power", "load_operations_w", {"v": cap["v"] * w["v"], "l": "derived", "src": f"{w['v']} W/kg ({w['src'][:4]}) x {cap['v']} kg ({cap['src'][:4]}) - payload power"})
    if cap and kb: put("comms", "data_rate_kbps", {"v": cap["v"] * kb["v"], "l": "derived", "src": f"{kb['v']} kbps/kg x {cap['v']} kg"})
    if ("comms", "_band") in found: put("comms", "mode", {"v": "DTE", "l": "derived", "src": found[("comms", "_band")]["src"] + " (direct link with Earth ground stations)"})
    return prof

def questionnaire(prof):
    """Only the core fields that are still empty, with the question to ask."""
    ask = [dict(field=k, unit="choose one", why="the document gives different values", candidates=[(c["v"], "p%d" % c["page"]) for c in x["candidates"]], if_unknown="engineer must choose")
           for k, x in prof.get("_conflicts", {}).items()]
    for f in SCHEMA["fields"]:
        x = prof.get(f["block"], {}).get(f["key"])
        if f["core"] and (x is None or x.get("v") is None):
            ask.append(dict(field=f"{f['block']}.{f['key']}", unit=f["unit"], why=f["used_for"],
                            if_unknown=f.get("if_missing", "the tool returns the requirement instead")))
    return ask

if __name__ == "__main__":
    ctx = sys.argv[3] if len(sys.argv) > 3 else None
    pg = pages(sys.argv[1]); found = rule_extract(pg, ctx); prof = to_profile(found)
    json.dump(prof, open(sys.argv[2] if len(sys.argv) > 2 else "draft_profile.json", "w"), indent=1)
    print(f"{len(pg)} pages read, {len(found)} values found with page citations:")
    for (b, k), x in found.items():
        print(f"  {b}.{k} = {x['v']}   [{x['src'][:90]}]" if x['l'] != 'conflict' else f"  {b}.{k} = CONFLICT {[(c['v'], 'p'+str(c['page'])) for c in x['candidates']]}")
    print("Questions left for the customer (core fields only):")
    for q in questionnaire(prof): print(f"  - {q['field']} ({q['unit']})" + (f" candidates {q['candidates']}" if 'candidates' in q else f" - if unknown: {q['if_unknown']}"))
