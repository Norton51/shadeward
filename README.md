# Sunseat

Find out which side of the plane gets the sun on your flight — and where to sit for shade, or for the sunset.

(Formerly Shadeward.)

## What it does

- Pick an origin and destination (≈3,300 airports with scheduled service), a departure time in the origin's local time, and optionally override the estimated flight time.
- Simulates the great-circle route minute by minute: aircraft position, heading, altitude, and the sun and moon relative to the cabin.
- Recommends a side for shade, or explains why it doesn't matter (dark flight, sun high or fore/aft, sun splits evenly).
- Lists sunrise, sunset, moonrise and moonset along the way, with the side of the aircraft they're visible from.
- An interactive map with day/twilight/night shading, the subsolar and sublunar points, and the aircraft on its route.
- A cabin "sky compass" showing where the sun sits around the aircraft and which windows it reaches.
- A small 3D view from a window seat (left or right), rendered live from the sun's actual position at each moment: sunlight falls through the windows onto the tray table and seats, glare shows on the sunny side, and the sky outside follows the time of day.
- A timeline coloured by where the sun is, with scrubbing, playback and clickable events.
- Every flight has a shareable address: `/lax-jfk?dep=2026-10-07T08:00&dur=320` (`dep` may also be just `HH:MM` for today; `dur` only when overridden). Older `#from=LAX&to=JFK…` links still work and are rewritten.
- Pre-rendered pages for the 500 busiest routes (both directions), an explainer on choosing a side, and notes on how route, timing, altitude and weather affect the estimate.

## Development

```bash
npm install
npm run dev       # http://localhost:5173
npm test          # unit tests for the geometry, time-zone and analysis code
npm run build     # static site in dist/ (vite build + pre-rendered pages)
```

`SITE_URL` sets the canonical origin used in page metadata and the sitemap (default `https://sunseat.org`):

```bash
SITE_URL=https://example.com npm run build
```

### SEO and pre-rendered pages

`npm run build` runs `scripts/prerender.mjs` after Vite. It writes into `dist/`:

- **Route pages** (`/lax-jfk`, `/jfk-lax`, … about 1,000): each runs the real analysis for four seasons × four departure times and writes a best-side table, sunrise/sunset sides, distance, flight time and accuracy notes, then loads the full app for that route.
- **`/which-side-of-the-plane`**: an explainer covering the rule of thumb, seasons, and how accurate predictions are.
- **`/routes`**: an index of every route page.
- **`sitemap.xml`** and **`robots.txt`**, plus canonical, Open Graph and structured-data tags on every page.
- **`/app`**: the bare app, which `vercel.json` serves for routes without their own page.

Shared images and icons live in `public/` (`og.png`, app icons, `manifest.webmanifest`).

After deploying: verify the domain in [Google Search Console](https://search.google.com/search-console) and [Bing Webmaster Tools](https://www.bing.com/webmasters), and submit `https://<domain>/sitemap.xml`.

### Map

The map uses [MapLibre GL JS](https://maplibre.org/) with vector tiles from [OpenFreeMap](https://openfreemap.org/): no API key, no usage limits, and commercial use is allowed. Map data © OpenStreetMap contributors via OpenMapTiles. If the tile server can't be reached, the map falls back to a plain background so the route and day/night shading still work.

### Analytics

`src/analytics.js` loads [Vercel Web Analytics](https://vercel.com/docs/analytics). It only collects data when deployed on Vercel with Web Analytics enabled for the project (Project → Analytics → Enable). Only the path is reported (the query, which holds departure times, is stripped), and a page view is counted once per route, not on every edit.

### Airport data

`src/data/airports.json` is generated from [OurAirports](https://ourairports.com/data/) (public domain) and committed. Each row is `[iata, name, city, country, lat, lon, ianaTimeZone]`; the time zone is resolved at build time with `tz-lookup`. To refresh it:

```bash
npm run airports                       # downloads the CSV
npm run airports -- path/to/airports.csv
```

The dataset is code-split and loaded on first use (~105 kB gzipped).

### Route list

`src/data/routes.json` lists the 500 airport pairs that get pre-rendered pages. Openly licensed per-route passenger data doesn't exist, so `scripts/build-routes.mjs` combines a hand-picked seed of routes that published rankings regularly list as the busiest with the remainder ranked from [OpenFlights](https://openflights.org/data) route data by a gravity-style score (airlines on the route × airport size). OpenFlights data is under the [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/), so `routes.json` is a derived database under the same licence.

```bash
npm run routes                          # downloads routes.dat
npm run routes -- path/to/routes.dat
```

## Architecture

```
src/
├── main.js            App controller: form state, URL (path + query), wiring
├── analytics.js       Vercel Web Analytics
├── lib/               Pure logic (no DOM), covered by test/
│   ├── geo.js         Great-circle route, distance, bearing
│   ├── astro.js       Sun/moon positions (SunCalc), subsolar/sublunar points, moon phase
│   ├── time.js        IANA time-zone conversion and formatting via Intl
│   ├── flight.js      Flight simulation, cabin geometry, events, seat recommendation
│   └── airports.js    Lazy airport index and search
├── ui/
│   ├── mapview.js     MapLibre map: shading, route, aircraft, sun & moon
│   ├── timeline.js    Banded timeline, scrubber, playback
│   ├── cabin.js       Sky-compass SVG
│   ├── cabin3d.js     Window-seat 3D view (three.js, loaded on demand)
│   ├── summary.js     Recommendation and flight details panel
│   ├── autocomplete.js  ARIA combobox for airports
│   └── dom.js         Small DOM/escaping helpers
├── data/airports.json Generated airport dataset
├── data/routes.json   Routes that get pre-rendered pages
└── style.css
```

## The model

**Route.** A great circle on a spherical Earth, sampled every minute. Heading comes from a finite difference along the route, so it stays well-defined at both ends. Longitudes are unwrapped so trans-Pacific routes draw continuously.

**Timing.** The departure time is interpreted in the origin airport's real time zone (DST included). Flight time defaults to 30 min plus distance at 840 km/h, rounded to 5 min; it can be overridden.

**Altitude and horizon.** A simple climb/cruise/descent profile to 11,000 m. From cruise altitude the horizon sits about 3° below level, so the sun is treated as up until it drops below that dip — sunsets in the air happen later than on the ground below.

**Which window.** The sun's direction is projected onto the window normal of each side: `cos(elevation) · sin(bearing from the nose)`. That gives 0 when the sun is overhead, ahead or behind, and 1 when it faces a row of windows squarely. Minutes above 0.25 count as "direct sun" on that side; the recommendation compares the integrated exposure of each side.

**Night shading.** Drawn as a raster for the visible area at up to screen resolution: for each pixel (Web Mercator rows), the sun's elevation is one multiply-add, so darkness ramps smoothly from sunset to the end of astronomical twilight with an anti-aliased edge at sunset. Where it is dark and the moon is up, the shade is lifted and tinted. It is repainted as the timeline plays and as the map moves.

**Window-seat view.** A procedurally modelled single-aisle cabin (curved sidewall with window cut-outs, bins, 3–3 seating). The sun is a shadow-casting directional light placed at the flight's relative bearing and elevation, and the fuselage is closed apart from the windows, so lit patches fall where the geometry lets them. Outside is a Preetham scattering sky over a cloud deck, with stars after dark. three.js is code-split and only fetched once a flight is shown.

### Limitations: route, timing, altitude and weather

- **Route.** Real flights deviate from the great circle for jet streams, airways, oceanic tracks and closed airspace. A few degrees of heading rarely changes the side, except when the sun is nearly ahead or behind (when either side is fine).
- **Timing.** Times are scheduled, not actual. Delays, holding and winds shift every sunrise and sunset; a strong jet stream can change a long-haul flight by an hour.
- **Altitude.** The horizon dip at cruise is modelled (sunrise earlier and sunset later than on the ground, often by 10–20 minutes), with a simple climb and descent profile.
- **Weather.** Cloud below doesn't hide the sun but reflects glare up into windows on either side; flying through cloud during climb and descent softens it. Neither is modelled.
- No modelling of wing shadow or of seats far from a window.

## Credits

Airport data © [OurAirports](https://ourairports.com/) (public domain). Route list derived from [OpenFlights](https://openflights.org/) (ODbL). Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors via [OpenMapTiles](https://openmaptiles.org/), tiles by [OpenFreeMap](https://openfreemap.org/).

## Audit of the previous version (0.1)

The 0.2 rewrite replaced every module. Issues found in 0.1:

| Area | Finding | Resolution |
|---|---|---|
| Dead code | `scene.js` (the Three.js cabin advertised in the README) was never imported; `three` was an unused dependency. | Removed; replaced by the lightweight sky-compass. |
| Local time | Times used `longitude / 15` instead of real time zones — LAX by up to ~55 min, Madrid by over 2 h in summer, western China by ~3 h; DST was ignored, so the departure itself was computed at the wrong instant. | IANA zones per airport; conversions through `Intl`, including DST gaps and overlaps. |
| Mislabelled times | Timeline event chips rendered in the *browser's* zone but were labelled "UTC". | All times shown in origin/destination zones with abbreviations. |
| Airport loading | Every page load fetched the full ~12 MB OurAirports CSV from GitHub, then silently swapped databases. | Pre-built 3,300-airport dataset, code-split. |
| Side logic | Any sun more than 30° off the nose counted as "in the window", even at 85° elevation. | Window-normal projection; high or fore/aft sun no longer counts. |
| Sunrise/sunset | Ignored the horizon dip at altitude. | Horizon dip from the altitude profile. |
| Flight time | Fixed estimate with no override. | Editable, with a reset to the estimate. |
| Moon | Sublunar point found by a ~1,700-call grid search. | Closed-form sublunar point. |
| Night overlay | Meridians with no terminator crossing were skipped, distorting the polygon near the equinoxes. | Cap/meridian intersection per longitude. |
| Safety | Airport strings from a remote CSV were inserted with `innerHTML` unescaped. | All interpolated text is escaped. |
| Accessibility | Autocomplete had no ARIA roles; play button was an emoji; event tooltips mouse-only. | ARIA combobox, labelled controls, keyboard-reachable events, `aria-valuetext` on the scrubber, Space to play/pause. |
| Antipodal / same airport | Antipodal routes produced `NaN`; same-airport check only on IATA. | Both rejected with a message. |
| Sharing | No way to link to a result. | Flight encoded in the URL (now path + query). |
| Tests | None. | `node --test` suite for geometry, time zones, astronomy and recommendations. |
