# Credits, sources and licences

Lunar Site Scout, NASA Space Apps Challenge 2026, challenge "Lunar Landing Site Navigator".

## Our work
All code, text, 3D lander models (drawn in code), the regolith grain texture (generated in code), the report and workbook formats, and the demo slides were made by the team for this challenge. Licence: MIT (see `LICENSE`), an Open Source Initiative approved licence.

The app shows public facts about real missions and companies, with sources. It does not promote or sell any commercial product or service.

## Space agency data
- NASA GSFC LOLA 5 m site terrain models, LOLA terrain clones (measurement error), and 10 m, 80 m and 600 m south polar terrain models: NASA Goddard Planetary Geodesy Data Archive, https://pgda.gsfc.nasa.gov/
- NASA LOLA permanently shadowed regions catalogue: https://pgda.gsfc.nasa.gov/
- NASA LRO LROC Wide Angle Camera south pole mosaic (NASA/GSFC/Arizona State University): https://www.lroc.asu.edu/images/1401
- JPL DE421 planetary ephemeris, Moon orientation and frame kernels (NASA NAIF): https://naif.jpl.nasa.gov/pub/naif/generic_kernels/
- JPL Horizons, used to validate Sun and Earth positions: https://ssd.jpl.nasa.gov/horizons/
- NASA Deep Space Network station locations: https://deepspace.jpl.nasa.gov/
- NASA Blue Marble Earth image (NASA Visible Earth): https://visibleearth.nasa.gov/
- Global Moon colour image (`assets/moon_2k.jpg`): NASA Scientific Visualization Studio, CGI Moon Kit (LRO LROC colour mosaic), https://svs.gsfc.nasa.gov/4720 [TO VERIFY: confirm this is the file used, or replace it with the CGI Moon Kit image]
- NASA Small Spacecraft Technology State of the Art (power chapter, battery energy density): https://www.nasa.gov/smallsat-institute/sst-soa/
- Lunar feature names: IAU Gazetteer of Planetary Nomenclature (USGS), https://planetarynames.wr.usgs.gov/

## Mission facts and public prices (cited in the app)
- NASA Artemis IV: https://www.nasa.gov/mission/artemis-iv/
- NASA CLPS, Astrobotic Griffin Mission One: https://www.nasa.gov/event/clps-flight-astrobotics-griffin-mission-one/
- NASA: https://www.nasa.gov/?p=888289
- Astrobotic Lunar Landers Payload User's Guide (public): https://science.nasa.gov/wp-content/uploads/2023/11/astrobotic-lunar-landers-pug.pdf
- ESA Argonaut: https://www.esa.int/Science_Exploration/Human_and_Robotic_Exploration/Exploration/Argonaut
- ISRO: https://www.isro.gov.in/NSPD2025/
- NASA LRO images of Odysseus: https://www.nasa.gov/missions/lro/nasas-lro-images-intuitive-machines-odysseus-lander/
- Intuitive Machines Nova-C: https://intuitivemachines.com/nova-c
- SpaceNews (CLPS task order CP-22): https://spacenews.com/?p=505012 ; https://spacenews.com/?p=507567
- Universe Magazine (ispace on Starship, reported price): https://universemagazine.com/en/lunar-logistics-moves-to-a-shared-flight-model/
- Astronomy.com (IM-2): https://www.astronomy.com/space-exploration/intuitive-machines-im-2-moon-lander-is-lying-dead-in-a-crater/
- Scientific American (Chang'e-7): https://www.scientificamerican.com/article/chinas-change-7-moonshot-will-seek-water-ice-at-the-lunar-south-pole/
- Wikipedia (Chang'e-8): https://en.wikipedia.org/wiki/Chang%27e_8
- Interfax (Luna-27): https://interfax.com/newsroom/top-stories/113182/
- Civilsdaily (Chandrayaan-4): https://www.civilsdaily.com/?p=796318

Chinese missions appear only as public information about planned landings. No data, code or help from any Chinese or Chinese-owned entity was used.

## Science references (Discover nearby)
- Lunar Prospector: https://science.nasa.gov/mission/lunar-prospector
- https://arxiv.org/abs/1103.1687
- https://doi.org/10.1038/nature11216
- https://ui.adsabs.harvard.edu/abs/2021LPI....52.1013S/abstract
- NASA: https://science.nasa.gov/solar-system/moon/phenomena-nasa-astronauts-will-encounter-at-moons-south-pole/
- NASA SVS: https://svs.gsfc.nasa.gov/4944

## Third-party software (all open source, OSI-approved licences)
| Software | Use | Licence |
|---|---|---|
| three.js 0.160 | 3D rendering | MIT |
| jsPDF 2.5.1 | PDF report | MIT (`web/vendor/JSPDF_LICENSE`) |
| jsPDF-AutoTable 3.8.2 | PDF tables | MIT (`web/vendor/AUTOTABLE_LICENSE`) |
| SheetJS Community Edition | Excel | Apache-2.0 (`web/vendor/SHEETJS_LICENSE`) |
| xlsx-js-style 1.2.0 | Excel with styles | Apache-2.0 (`web/vendor/XLSX_JS_STYLE_LICENSE`) |
| PDF.js 4.0.379 | reading mission PDFs in the browser | Apache-2.0 (`web/vendor/PDFJS_LICENSE`) |
| Barlow and Barlow Condensed fonts (Google Fonts) | type | SIL Open Font License 1.1 |
| Skyfield | Sun and Earth positions (data pipeline) | MIT |
| NumPy, SciPy | data pipeline | BSD-3-Clause |
| rasterio | reading terrain models | BSD-3-Clause |
| pyproj | map projections | MIT |
| pyshp | shadowed-region shapes | MIT |
| Streamlit, Plotly | early prototype (`app.py`) | Apache-2.0, MIT |

## Privacy
The analysis runs in the visitor's browser; documents are read locally and never uploaded. Optional anonymous usage statistics and an optional feedback form (email only with explicit consent) go to a private sheet of the team, never to this repository. No personal data is part of the submission.

No export-controlled information is used: all inputs are public.
