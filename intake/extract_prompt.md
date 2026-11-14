# Intake prompt (used with a local LLM, e.g. via Ollama, so documents never leave the customer)

You receive pages of a mission document (user guide, proposal, slides), each starting with "=== PAGE n".
Fill the Lunar Site Scout Mission Profile (data/mission_profile_schema.json).

Rules:
1. Only use values written in the document. For each value return {"v": value, "l": label, "src": "p<page>: short quote"}.
2. label = "declared" if written as is; "derived" if computed from written values (show the calculation in src).
3. Never estimate. If a value is not in the document, return {"v": null, "l": "asked"}.
4. Convert units to the schema units (W, Wh, m, deg, days, kbps, MB, UTC).
5. Return JSON only.

After extraction the platform asks the customer ONLY the core fields still null, then a human confirms.
