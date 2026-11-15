# Lunar Site Scout

NASA Space Apps Challenge 2026 – *Lunar Landing Site Navigator*.

Tells a mission team **where and when to land near the lunar south pole** for its specific mission, and what changes if the launch slips.

**Try it:** https://francescobeligi-oss.github.io/GGGG-project-NASA-space-APP/
**Project demo (7 slides, PDF):** [demo/LunarSiteScout_GGGG_NASA_Space_Apps_2026.pdf](demo/LunarSiteScout_GGGG_NASA_Space_Apps_2026.pdf)

## What it does
- **Explore in 3D:** fly over the south pole on NASA LOLA terrain, find ice in permanent shadow, past landings and hazards, and stand on a site beside a real-size lander.
- **Travel in time:** the real Sun and Earth over the real horizon for any date and hour; press play and the light and shadows move; a landing calendar for every site.
- **Decide with proof:** upload a mission PDF, answer 8 questions or pick one of 13 real missions. The engine checks 11 sites every 6 hours in the worst case (whole landing area, 8 lander orientations, 6 terrain versions) for sunlight, power, battery, direct-to-Earth contact and cost, and explains the verdict. PDF report and Excel workbook with every formula and source.

## How it works
1. `src/ephem.py` – Sun and Earth azimuth/elevation from each site (JPL DE421, MOON_ME frame). Checked against JPL Horizons (max error 0.000016°).
2. `src/horizon.py` – real 360° horizon from NASA LOLA terrain (5 m near the site, 80 m regional out to 300 km, lunar curvature), Sun treated as a disc.
3. `src/shadow.py` – 5 m shadow maps and landing-ellipse analysis.
4. `src/sim.py` – mission simulation: power, battery, Earth contact, data, verdict.
5. `index.html` and `web/` – the web app (three.js), which runs fully in the browser: documents are read locally and never uploaded. `web-data/` holds the precomputed results.

## Data (all public)
- NASA GSFC PGDA LOLA 5 m site DEMs and 80 m south polar DEM (Barker et al. 2021, 2023), LOLA permanently shadowed regions
- NASA LRO LROC WAC south pole mosaic; NASA Deep Space Network station locations
- JPL/NAIF DE421 ephemeris and lunar orientation kernels; JPL Horizons for validation
- Mission parameters from public sources, listed with labels in `data/profiles.json`

## Use of AI
Code and presentation drafts were written with the help of Claude (Anthropic) and reviewed by the team. All numbers come from the data above; all images in the demo are renders from the app.

## Run locally
```
python -m http.server 8000   # then open http://localhost:8000
```
To rebuild the data: `pip install -r requirements.txt`, then `python src/ephem.py && python src/horizon.py && python src/precompute.py`. `app.py` is the early Streamlit prototype.

## Credits and licences
Code: MIT licence (`LICENSE`). Every data source, reference and third-party licence is listed in [`CREDITS.md`](CREDITS.md).
