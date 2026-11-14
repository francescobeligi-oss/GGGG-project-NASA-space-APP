# Lunar Site Scout

NASA Space Apps Challenge 2026 – *Lunar Landing Site Navigator*.

Tells a mission team **where and when to land near the lunar south pole** for its specific mission, and what changes if the launch slips.

## How it works
1. `src/ephem.py` – Sun and Earth azimuth/elevation from each site (JPL DE421, MOON_ME frame), every 30 min, Nov 2026 – Dec 2028. Checked against JPL Horizons (identical to 4 decimals).
2. `src/horizon.py` – real 360° horizon from NASA LOLA terrain (5 m near the site, 80 m regional out to 300 km, lunar curvature), Sun treated as a disc.
3. `src/shadow.py` – 5 m shadow maps and landing-ellipse analysis (sunlight range across the ellipse).
4. `src/sim.py` – mission simulation: power, battery, Earth contact, data, time to sunset, verdict, and requirements (battery needed / max sustainable load) when a value is not public.
5. `app.py` – Streamlit interface.

## Data (all public)
- NASA GSFC PGDA LOLA 5 m site DEMs and 80 m south polar DEM (Barker et al. 2021, 2023)
- JPL/NAIF DE421 ephemeris and lunar orientation kernels; JPL Horizons API for validation
- Mission parameters from public sources, listed with labels in `data/profiles.json`

## Use of AI
Code written with the help of Claude (Anthropic) and reviewed by the team; all numbers come from the data above.

## Run
```
pip install -r requirements.txt
python src/ephem.py && python src/horizon.py && python src/precompute.py
streamlit run app.py
```
