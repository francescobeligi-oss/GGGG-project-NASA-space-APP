"""Lunar Site Scout - Streamlit app (NASA Space Apps 2026, Lunar Landing Site Navigator)."""
import json, sys, datetime as dt
import numpy as np, plotly.graph_objects as go, streamlit as st
from plotly.subplots import make_subplots
sys.path.insert(0, "src")
import sim

ROOT = sim.ROOT
st.set_page_config(page_title="Lunar Site Scout", layout="wide", page_icon="🌘")
SITES = json.load(open(f"{ROOT}/sites.json"))
NAMES = {sid: s["name"] for sid, s in SITES.items()}
COLORS = {"green": "#2E9E5B", "yellow": "#E0A800", "red": "#D64545"}

# Mission presets: values from public sources (see data/profiles.json); "asked" fields are editable
PRESETS = {
    "IM-2 Athena (Nova-C) - real lander": dict(days=14.0, array_w=200.0, battery_wh=700.0, load_ops_w=None,
        load_survival_w=None, panel="vertical_fixed", accuracy=50, rate_kbps=None,
        note="Declared: 200 W array, 25 Ah x 28 V battery (700 Wh), 14-day design life, 50 m landing zone. Power use not public: the tool computes the highest load the site can sustain."),
    "Griffin-1 + FLIP rover - payload view": dict(days=14.0, array_w=None, battery_wh=None, load_ops_w=625.0,
        load_survival_w=None, panel="vertical_tracking", accuracy=100, rate_kbps=6250.0,
        note="Declared: 625 kg payload at 1.0 W/kg and 10 kbps/kg. Lander array and battery not public: the tool computes the requirement."),
    "Artemis crewed - NASA site criteria": dict(days=6.5, array_w=None, battery_wh=None, load_ops_w=None,
        load_survival_w=None, panel="vertical_tracking", accuracy=100, rate_kbps=None,
        note="Declared by NASA: continuous sunlight for the 6.5-day stay, 100 m landing site radius, Earth visible for direct contact."),
    "Custom mission": dict(days=14.0, array_w=300.0, battery_wh=2000.0, load_ops_w=150.0, load_survival_w=60.0,
        panel="vertical_tracking", accuracy=100, rate_kbps=100.0, note="Enter your own values."),
}

@st.cache_data
def ellipse(sid):
    return dict(np.load(f"{ROOT}/ellipse/{sid}.npz"))

@st.cache_data
def hillshade():
    return dict(np.load(f"{ROOT}/hillshade.npz"))

@st.cache_data
def horizon(sid):
    return dict(np.load(f"{ROOT}/horizon/{sid}.npz"))

@st.cache_data(show_spinner="Casting shadows on 5 m terrain...")
def shade(sid, az, el):
    import shadow
    g, z, lit = shadow.shade_map(sid, az, el, half=1500.0, res=10.0)
    return g, lit

def run(sid, t0, prof, radius, band=None):
    p = dict(prof)
    p["array_w"] = p["array_w"] or 0.0
    p["_load_unknown"] = not p["load_ops_w"]
    p["load_ops_w"] = p["load_ops_w"] or 0.0
    if band is not None:
        e = ellipse(sid); p["_frac"] = e[f"r{radius}_bands"][band]
    return sim.simulate(sid, t0, p)

def fmt_h(h):
    return f"{h/24:.1f} d" if h >= 48 else f"{h:.0f} h"

# ---------------- sidebar: the Mission Profile ----------------
st.sidebar.title("🌘 Lunar Site Scout")
st.sidebar.caption("Where and when should your mission land near the lunar south pole?")
preset = st.sidebar.selectbox("Mission profile", list(PRESETS))
P = PRESETS[preset]
st.sidebar.info(P["note"])
with st.sidebar.expander("Mission Profile (editable)", expanded=False):
    days = st.number_input("Surface duration (Earth days)", 0.5, 60.0, float(P["days"]), 0.5)
    accuracy = st.selectbox("Landing accuracy, ellipse radius (m)", [50, 100, 250], index=[50, 100, 250].index(P["accuracy"]))
    height = st.selectbox("Solar panel / antenna height (m)", [2.0, 10.0, 20.0])
    panel = st.selectbox("Solar panels", ["vertical_tracking", "vertical_fixed", "horizontal"],
                         index=["vertical_tracking", "vertical_fixed", "horizontal"].index(P["panel"]),
                         format_func=lambda v: {"vertical_tracking": "Vertical, turning to the Sun",
                                                "vertical_fixed": "Vertical, fixed", "horizontal": "Horizontal (flat)"}[v])
    panel_az = st.slider("Fixed panel faces azimuth (deg)", 0, 359, 0) if panel == "vertical_fixed" else 0
    array_w = st.number_input("Peak array power (W) - 0 if unknown", 0.0, 50000.0, float(P["array_w"] or 0.0), 10.0)
    load_w = st.number_input("Power used in operations (W)", 0.0, 50000.0, float(P["load_ops_w"] or 0.0), 10.0)
    batt = st.number_input("Battery capacity (Wh) - 0 if unknown", 0.0, 500000.0, float(P["battery_wh"] or 0.0), 50.0)
    rate = st.number_input("Downlink rate (kbps) - 0 if unknown", 0.0, 1e6, float(P["rate_kbps"] or 0.0), 10.0)
    min_e = st.slider("Minimum Earth elevation above terrain (deg)", 0.0, 3.0, 0.0, 0.5)
prof = dict(days=days, height_m=height, panel=panel, panel_az=panel_az, array_w=array_w or None,
            load_ops_w=load_w or None, battery_wh=batt or None, rate_kbps=rate or None, min_earth_el=min_e)

st.sidebar.subheader("Where and when")
sid = st.sidebar.selectbox("Landing site", list(SITES), format_func=lambda k: NAMES[k])
d0 = st.sidebar.date_input("Planned landing date (UTC)", dt.date(2027, 3, 1), dt.date(2026, 11, 2), dt.date(2028, 11, 30))
hr = st.sidebar.slider("Landing time (UTC hour)", 0, 23, 12)
slip = st.sidebar.slider("What if the launch slips? (days)", 0, 30, 0)
t0 = dt.datetime(d0.year, d0.month, d0.day, hr, tzinfo=dt.timezone.utc).timestamp() + slip * 86400
st.sidebar.caption("Data: NASA LOLA terrain (5 m and 80 m), JPL DE421 ephemerides, checked against JPL Horizons.")

# ---------------- results ----------------
mid = run(sid, t0, prof, accuracy, band=1)
lo, hi = run(sid, t0, prof, accuracy, band=0), run(sid, t0, prof, accuracy, band=2)

st.markdown(f"### {NAMES[sid]} · landing {dt.datetime.fromtimestamp(t0, dt.timezone.utc):%d %b %Y %H:%M} UTC"
            + (f" · slipped {slip} days" if slip else ""))
v = mid["verdict"]
st.markdown(f"<div style='padding:10px 16px;border-radius:8px;background:{COLORS[v]};color:white;font-size:18px'>"
            f"<b>{v.upper()}</b> &nbsp; {' · '.join(mid['reasons']) or 'All checks passed for this profile'}</div>",
            unsafe_allow_html=True)
c = st.columns(6)
c[0].metric("Sun at landing", f"{mid['sun_el_landing']:.1f}°", "visible" if mid["sun_visible_landing"] else "-hidden by terrain")
c[1].metric("Time to sunset", fmt_h(mid["hours_to_sunset"]))
if mid["hours_to_earthset"] > 0: c[2].metric("Time to Earthset", fmt_h(mid["hours_to_earthset"]))
else: c[2].metric("Earth hidden: rises in", fmt_h(mid["hours_to_earthrise"]) if mid["hours_to_earthrise"] is not None else "not in window")
c[3].metric("Sunlight in ellipse", f"{100*lo['sun_hours']/lo['hours']:.0f}–{100*hi['sun_hours']/hi['hours']:.0f}%",
            help="Range across the landing ellipse (10th to 90th percentile point)")
c[4].metric("Earth contact", f"{100*mid['earth_hours']/mid['hours']:.0f}%")
if not load_w and batt and array_w:
    ml = [r["max_load_w"] for r in (lo, hi)]
    c[5].metric("Max sustainable load", f"{ml[0]:.0f}–{ml[1]:.0f} W",
                help="Requirement: highest constant power use your array + battery can sustain here (worst to best point of the ellipse)")
elif load_w and array_w:
    need = [r["battery_needed_wh"] / 1000 for r in (hi, lo)]
    c[5].metric("Battery needed", f"{need[0]:.1f}–{need[1]:.1f} kWh",
                help="Requirement: minimum usable battery to survive the darkest stretch, best to worst point of the ellipse")
else:
    c[5].metric("Avg. solar power / kW of array", f"{1000*mid['avg_power_w']/max(array_w,1):.0f} W" if array_w else "enter array power")

tab_map, tab_sky, tab_time, tab_cmp = st.tabs(["🗺️ South pole map", "🌄 Sky & shadows", "⏱️ Timeline & power", "⚖️ Compare scenarios"])

with tab_map:
    H = hillshade(); g = H["g"] / 1000
    fig = go.Figure(go.Heatmap(x=g, y=-g, z=H["hs"], colorscale="gray", showscale=False, hoverinfo="skip"))
    for k, s in SITES.items():
        r = run(k, t0, prof, accuracy, band=1)
        fig.add_trace(go.Scatter(x=[s["x"] / 1000], y=[s["y"] / 1000], mode="markers+text", text=[s["name"]],
            textposition="top center", textfont=dict(color="white"),
            marker=dict(size=16 if k == sid else 11, color=COLORS[r["verdict"]], line=dict(color="white", width=2)),
            hovertext=f"{s['name']}: {r['verdict']} – sun {100*r['sun_hours']/r['hours']:.0f}%, Earth {100*r['earth_hours']/r['hours']:.0f}%",
            hoverinfo="text", showlegend=False))
    fig.add_trace(go.Scatter(x=[0], y=[0], mode="markers+text", text=["South Pole"], textposition="bottom center",
                             marker=dict(symbol="x", color="white", size=10), textfont=dict(color="white"), showlegend=False))
    fig.update_layout(height=620, margin=dict(l=0, r=0, t=10, b=0), xaxis=dict(title="km", scaleanchor="y"), yaxis=dict(title="km (toward Earth: up)"))
    st.plotly_chart(fig, use_container_width=True)
    st.caption("Colours show the verdict of each site for the selected mission and date. Polar view centred on the south pole, from NASA LOLA 80 m terrain.")

with tab_sky:
    hz = horizon(sid); hi_ = [2.0, 10.0, 20.0].index(height)
    S = mid["series"]; days_from = (S["t"] - S["t"][0]) / 86400
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=hz["az"], y=hz["hz"][hi_], fill="tozeroy", fillcolor="rgba(90,90,90,0.8)",
                             line=dict(color="#444"), name="Real horizon (terrain)", hoverinfo="skip"))
    fig.add_trace(go.Scatter(x=S["sun_az"], y=S["sun_el"], mode="markers", name="Sun path",
        marker=dict(size=4, color=days_from, colorscale="Plasma", colorbar=dict(title="days after landing"))))
    fig.add_trace(go.Scatter(x=S["earth_az"], y=S["earth_el"], mode="markers", name="Earth path",
                             marker=dict(size=4, color="#3A8DDE")))
    fig.add_trace(go.Scatter(x=[S["sun_az"][0]], y=[S["sun_el"][0]], mode="markers", name="Sun at landing",
                             marker=dict(symbol="star", size=16, color="gold", line=dict(color="black", width=1))))
    fig.update_layout(height=420, margin=dict(l=0, r=0, t=30, b=0), title="360° horizon seen from the site", legend=dict(orientation="h", y=-0.25),
                      xaxis=dict(title="Azimuth (deg, 0 = north, 90 = east)", range=[0, 360]),
                      yaxis=dict(title="Elevation (deg)", range=[-3, max(8, float(S["earth_el"].max()) + 1)]))
    st.plotly_chart(fig, use_container_width=True)

    hrs = st.slider("Shadow map: hours after landing", 0, int(mid["hours"]), 0, 6)
    k = min(int(hrs / sim.DT_H), len(S["t"]) - 1)
    az, el = round(float(S["sun_az"][k]), 1), round(float(S["sun_el"][k]), 2)
    gg, lit = shade(sid, az, el)
    e = ellipse(sid)
    fig2 = go.Figure(go.Heatmap(x=gg, y=gg, z=lit, colorscale=[[0, "#0b0b1a"], [1, "#f4e7b0"]], zmin=0, zmax=1,
                                colorbar=dict(title="lit")))
    th = np.linspace(0, 2 * np.pi, 100)
    fig2.add_trace(go.Scatter(x=accuracy * np.cos(th), y=accuracy * np.sin(th), mode="lines", line=dict(color="#2EC4F1", width=2), name="Landing ellipse"))
    fig2.add_trace(go.Scatter(x=[0], y=[0], mode="markers", marker=dict(symbol="cross", size=10, color="#2EC4F1"), name="Target"))
    fig2.update_layout(height=520, margin=dict(l=0, r=0, t=30, b=0), title=f"Light and shadow on 5 m terrain – Sun at {el:.1f}° elevation, azimuth {az:.0f}°",
                       xaxis=dict(title="m", scaleanchor="y"), yaxis=dict(title="m"))
    st.plotly_chart(fig2, use_container_width=True)
    pct = e[f"r{accuracy}_pct"]
    st.caption(f"Inside the {accuracy} m landing ellipse, points receive sunlight between {100*pct.min():.0f}% and {100*pct.max():.0f}% of the time (whole 2026–2028 period). "
               "IM-2 Athena (2025) landed 250 m from its target in a 20 m crater, received no sunlight and ended after about 13 hours.")

with tab_time:
    S = mid["series"]; tt = [dt.datetime.fromtimestamp(x, dt.timezone.utc) for x in S["t"]]
    rows = 3 if S["soc"] is not None else 2
    fig = make_subplots(rows=rows, cols=1, shared_xaxes=True, vertical_spacing=0.06,
                        row_heights=[0.25, 0.4, 0.35][:rows] if rows == 3 else [0.35, 0.65])
    fig.add_trace(go.Heatmap(x=tt, y=["Earth", "Sun"], z=[S["earth"].astype(float), (S["sun_frac"] > 0.5).astype(float)],
        colorscale=[[0, "#1d1d2b"], [1, "#f4c542"]], showscale=False, hoverinfo="x"), 1, 1)
    fig.add_trace(go.Scatter(x=tt, y=S["gen_w"], name="Power produced (W)", line=dict(color="#E8A33D")), 2, 1)
    if load_w: fig.add_hline(y=load_w, line=dict(color="#D64545", dash="dot"), row=2, col=1)
    if rows == 3:
        fig.add_trace(go.Scatter(x=tt, y=100 * S["soc"], name="Battery (%)", line=dict(color="#2E9E5B")), 3, 1)
    fig.update_layout(height=560, margin=dict(l=0, r=0, t=10, b=0), legend=dict(orientation="h"))
    st.plotly_chart(fig, use_container_width=True)
    a, b, c3 = st.columns(3)
    a.metric("Sunlit time", fmt_h(mid["sun_hours"])); b.metric("Earth contact", fmt_h(mid["earth_hours"]))
    c3.metric("Longest darkness", fmt_h(mid["longest_dark_h"]))
    if mid["data_mb_possible"] is not None:
        st.metric("Data that can be sent to Earth", f"{mid['data_mb_possible']/1000:.1f} GB")
    st.caption("Yellow = Sun or Earth visible. Red dotted line = power used. Ranges across the landing ellipse are shown in the header.")

with tab_cmp:
    st.write("Compare up to three site and date options for the same mission.")
    cols = st.columns(3); rows_ = []
    for i, col in enumerate(cols):
        with col:
            s_i = st.selectbox(f"Scenario {i+1} site", list(SITES), index=[0, 1, 4][i], format_func=lambda k: NAMES[k], key=f"s{i}")
            off = st.slider(f"Scenario {i+1} date shift (days)", -30, 60, [0, 0, 21][i], key=f"o{i}")
            r = run(s_i, t0 + off * 86400, prof, accuracy, band=1)
            st.markdown(f"<div style='padding:8px;border-radius:6px;background:{COLORS[r['verdict']]};color:white'><b>{r['verdict'].upper()}</b></div>", unsafe_allow_html=True)
            st.write(f"**Sun** {100*r['sun_hours']/r['hours']:.0f}% · **Earth** {100*r['earth_hours']/r['hours']:.0f}% · "
                     f"**sunset in** {fmt_h(r['hours_to_sunset'])} · **longest dark** {fmt_h(r['longest_dark_h'])}")
            if not load_w and batt and array_w: st.write(f"**Max sustainable load** {r['max_load_w']:.0f} W")
            elif load_w and array_w: st.write(f"**Battery needed** {r['battery_needed_wh']/1000:.1f} kWh")
            for reason in r["reasons"]: st.write("• " + reason)
