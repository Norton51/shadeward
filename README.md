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
- A timeline coloured by where the sun is, with scrubbing, playback and clickable events.
- The URL encodes the flight (`#from=LAX&to=JFK&dep=2026-10-07T08:00&dur=320`) so a result can be shared. `dep` may also be just `HH:MM` (today).

## Development

```bash
npm install
npm run dev       # http://localhost:5173
npm test          # unit tests for the geometry, time-zone and analysis code
npm run build     # static site in dist/
```

### Analytics

`src/analytics.js` loads [Vercel Web Analytics](https://vercel.com/docs/analytics). It only collects data when deployed on Vercel with Web Analytics enabled for the project (Project → Analytics → Enable). The URL hash, which holds the flight, is stripped from reported URLs, and repeat page views from hash updates are dropped.

### Airport data

`src/data/airports.json` is generated from [OurAirports](https://ourairports.com/data/) (public domain) and committed. Each row is `[iata, name, city, country, lat, lon, ianaTimeZone]`; the time zone is resolved at build time with `tz-lookup`. To refresh it:

```bash
npm run airports                       # downloads the CSV
npm run airports -- path/to/airports.csv
```

The dataset is code-split and loaded on first use (~105 kB gzipped).

## Architecture

```
src/
├── main.js            App controller: form state, URL hash, wiring
├── analytics.js       Vercel Web Analytics
├── lib/               Pure logic (no DOM), covered by test/
│   ├── geo.js         Great-circle route, distance, bearing
│   ├── astro.js       Sun/moon positions (SunCalc), subsolar/sublunar points, moon phase
│   ├── time.js        IANA time-zone conversion and formatting via Intl
│   ├── flight.js      Flight simulation, cabin geometry, events, seat recommendation
│   └── airports.js    Lazy airport index and search
├── ui/
│   ├── mapview.js     Leaflet map: shading, route, aircraft, sun & moon
│   ├── timeline.js    Banded timeline, scrubber, playback
│   ├── cabin.js       Sky-compass SVG
│   ├── summary.js     Recommendation and flight details panel
│   ├── autocomplete.js  ARIA combobox for airports
│   └── dom.js         Small DOM/escaping helpers
├── data/airports.json Generated airport dataset
└── style.css
```

## The model

**Route.** A great circle on a spherical Earth, sampled every minute. Heading comes from a finite difference along the route, so it stays well-defined at both ends. Longitudes are unwrapped so trans-Pacific routes draw continuously.

**Timing.** The departure time is interpreted in the origin airport's real time zone (DST included). Flight time defaults to 30 min plus distance at 840 km/h, rounded to 5 min; it can be overridden.

**Altitude and horizon.** A simple climb/cruise/descent profile to 11,000 m. From cruise altitude the horizon sits about 3° below level, so the sun is treated as up until it drops below that dip — sunsets in the air happen later than on the ground below.

**Which window.** The sun's direction is projected onto the window normal of each side: `cos(elevation) · sin(bearing from the nose)`. That gives 0 when the sun is overhead, ahead or behind, and 1 when it faces a row of windows squarely. Minutes above 0.25 count as "direct sun" on that side; the recommendation compares the integrated exposure of each side.

**Night shading.** Each twilight threshold (0°, −6°, −12°, −18°) is a spherical cap; each is drawn by intersecting it with every meridian, which handles equinoxes and polar day/night without special cases.

### Limitations

- Real routes deviate from the great circle (winds, airways, restricted airspace). A few degrees of heading rarely changes the side.
- Times are scheduled, not actual; taxi and holding are folded into the duration.
- No modelling of wing shadow or of seats far from a window.

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
| Sharing | No way to link to a result. | Flight encoded in the URL hash. |
| Tests | None. | `node --test` suite for geometry, time zones, astronomy and recommendations. |
