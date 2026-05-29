# SunFlight

See where the sun will be from your seat on a flight. A better version of the (now-defunct) shadeward.org.

## What it does

- Pick origin and destination airports
- Pick a departure time and flight duration
- Computes the great-circle flight path and aircraft heading at every minute
- Calculates sun position (azimuth + elevation) at every point of the flight
- Transforms sun position into cabin-relative coordinates (left/right window, ahead/behind)
- Renders a 3D cabin POV: stylized cabin interior, window cutouts, sun moving through the sky outside the window as you scrub through the flight
- Sunrise/sunset events marked on the timeline
- Recommends which side of the plane to sit on

## Tech stack

- **Vite** for dev server + build
- **Three.js** for the 3D cabin scene (custom shaders for sky + ground, procedural cabin geometry)
- **SunCalc** for solar position math
- **Vanilla JS** otherwise. No framework needed for a single-page tool.

## Local dev

```bash
npm install
npm run dev
```

Opens at http://localhost:5173.

## Build

```bash
npm run build
```

Outputs static files to `dist/` ready to deploy on Cloudflare Pages, Vercel, Netlify, GitHub Pages, etc.

## Architecture

```
src/
├── main.js       Entry point, wires everything together
├── flight.js     Great-circle math, geodesic interpolation, heading
├── sun.js        SunCalc wrapper + cabin-relative transformation + solar event detection
├── scene.js      Three.js scene (cabin geometry, sky shader, sun, ground)
├── timeline.js   Scrubber + auto-play controller
├── ui.js         Airport autocomplete dropdown
├── airports.js   Starter airport dataset (~150 major airports)
└── style.css     Dark aviation aesthetic
```

### Coordinate conventions

In the 3D scene:
- `+Z` = forward (aircraft nose direction)
- `+X` = right wing (out the right window)
- `+Y` = up
- Sun azimuth in scene = angle from `+Z` clockwise (viewed from above), so `+90°` puts the sun out the right window.

### Adding a detailed cabin model (v2)

`scene.js` has `_buildCabin()`. To replace with a GLTF model:

1. Add `GLTFLoader` import.
2. Load the model in the constructor, position so the passenger's eye (camera) is at a window seat.
3. Make sure the model's forward axis matches the scene convention (+Z forward).

The sun, sky, ground, and lighting code doesn't change.

### Replacing the airport dataset

`airports.js` exports `AIRPORTS` as a hand-curated list. For a production version, download [OurAirports data](https://ourairports.com/data/) (CC0), filter for airports with IATA codes and scheduled service, and emit a JSON the same shape. Tens of thousands of airports is fine in memory.

## Math notes

**Heading on a great circle changes continuously.** A great circle from NYC to Tokyo starts heading roughly north-by-northwest, peaks somewhere near the Bering Strait, and ends heading southwest. We recompute the bearing at every sample (every 60 seconds).

**Sun azimuth conventions vary.** SunCalc returns azimuth from SOUTH going westward. Aviation uses azimuth from NORTH going clockwise. We convert. See `sun.js`.

**Relative bearing.** Once we have sun azimuth (compass) and aircraft heading (compass), the sun's bearing relative to the cabin is `sunAz - heading`, normalized to `[-180, 180]`. Positive = right side, negative = left side. Combined with elevation, this gives a full 3D direction in cabin coordinates.

**Local time at origin.** The input takes "local time at origin" but the math runs in UTC. We approximate the local-to-UTC offset using `longitude / 15` (i.e. solar time, not political time). Good enough for sun position. A v2 could use a tz database for political timezones and DST.

## Known limitations / v2 ideas

- Flight path is great-circle. Real flights deviate for jet streams, ATC routing, restricted airspace. Lateral deviation rarely changes sun position by more than a degree or two, so it's not visually important. Real route data (via FlightAware or similar) could be a v2 paid feature.
- Local time is approximated from longitude. Fine for sun, off by up to ~2 hours for political-time display.
- Airport list is small (~150). Swap in OurAirports for full coverage.
- The cabin is stylized, not photoreal. Detailed GLTF can drop in.
- Doesn't account for atmospheric refraction beyond what SunCalc does internally (small effect near horizon).
- Doesn't model in-cabin shading (people in the row blocking the window, etc).
