import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { GestureHandling } from 'leaflet-gesture-handling';
import 'leaflet-gesture-handling/dist/leaflet-gesture-handling.css';
import SunCalc from 'suncalc';

L.Map.addInitHook('addHandler', 'gestureHandling', GestureHandling);

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

// World-copy offsets to tile across. 5 copies covers any realistic viewport at minZoom 2.
const COPY_OFFSETS = [-720, -360, 0, 360, 720];

function moonPhaseInfo(phase, fraction) {
  const pct = Math.round(fraction * 100);
  let name, emoji;
  if      (phase < 0.063 || phase >= 0.938) { name = 'New Moon';        emoji = '🌑'; }
  else if (phase < 0.188)                   { name = 'Waxing Crescent'; emoji = '🌒'; }
  else if (phase < 0.313)                   { name = 'First Quarter';   emoji = '🌓'; }
  else if (phase < 0.438)                   { name = 'Waxing Gibbous';  emoji = '🌔'; }
  else if (phase < 0.563)                   { name = 'Full Moon';       emoji = '🌕'; }
  else if (phase < 0.688)                   { name = 'Waning Gibbous';  emoji = '🌖'; }
  else if (phase < 0.813)                   { name = 'Last Quarter';    emoji = '🌗'; }
  else                                      { name = 'Waning Crescent'; emoji = '🌘'; }

  let brightness;
  if      (pct > 90) brightness = 'bright enough to read by and cast clear shadows';
  else if (pct > 60) brightness = 'noticeably bright — washes out faint stars';
  else if (pct > 35) brightness = 'moderate glow — shapes visible on the ground';
  else               brightness = 'dim glow';

  return { name, emoji, pct, brightness };
}

// ── Solar position ──────────────────────────────────────────────────────────

function subsolarPoint(date) {
  const D  = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
  const L0 = ((280.460 + 0.9856474 * D) % 360 + 360) % 360;
  const g  = ((357.528 + 0.9856003 * D) % 360) * RAD;
  const λ  = (L0 + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD;
  const ε  = (23.439 - 0.0000004 * D) * RAD;
  const dec = Math.asin(Math.sin(ε) * Math.sin(λ)) * DEG;
  const ra  = Math.atan2(Math.cos(ε) * Math.sin(λ), Math.cos(λ)) * DEG;
  const GMST = ((280.46061837 + 360.98564736629 * D) % 360 + 360) % 360;
  const lon = ((ra - GMST + 180) % 360 + 360) % 360 - 180;
  return { lat: dec, lon };
}

// ── Terminator ──────────────────────────────────────────────────────────────

function terminatorLatAtLon(sunLat, sunLon, lon, elevDeg) {
  const φ0   = sunLat * RAD;
  const Δλ   = (lon - sunLon) * RAD;
  const sinE = Math.sin(elevDeg * RAD);
  const A    = Math.sin(φ0);
  const B    = Math.cos(φ0) * Math.cos(Δλ);
  const R    = Math.hypot(A, B);
  if (R < Math.abs(sinE)) return null;

  // A·sinφ + B·cosφ = sinE → R·sin(φ + ψ) = sinE has two solutions per circle.
  // In winter (A < 0) the principal solution falls outside [-90°,90°]; try both.
  const ψ    = Math.atan2(B, A);
  const base = Math.asin(sinE / R);
  const TWO_PI  = 2 * Math.PI;
  const HALF_PI = Math.PI / 2;

  for (const raw of [base - ψ, Math.PI - base - ψ]) {
    const φ = ((raw + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
    if (φ >= -HALF_PI && φ <= HALF_PI) return φ * DEG;
  }
  return null;
}

// centerLon sets the coordinate frame. Spans ±900° (5 world copies) so the
// overlay always fills whatever portion of the map is visible.
function terminatorLine(sunLat, sunLon, elevDeg = 0, centerLon = 0) {
  const pts   = [];
  const start = Math.round(centerLon) - 900;
  const end   = Math.round(centerLon) + 900;
  for (let lon = start; lon <= end; lon++) {
    const lat = terminatorLatAtLon(sunLat, sunLon, lon, elevDeg);
    if (lat !== null) pts.push([lat, lon]);
  }
  return pts;
}

function nightPolygon(sunLat, sunLon, elevDeg = 0, centerLon = 0) {
  const pts   = terminatorLine(sunLat, sunLon, elevDeg, centerLon);
  const pole  = sunLat > 0 ? -85 : 85;   // clamp away from ±90 (Mercator ±∞)
  const start = Math.round(centerLon) - 900;
  const end   = Math.round(centerLon) + 900;
  pts.push([pole, end]);
  pts.push([pole, start]);
  return pts;
}

// Like terminatorLatAtLon but returns ALL valid solutions in [-90,90], sorted ascending.
// When |sunLat| ≤ 18° the night-18 zone is a closed band; two solutions per longitude exist.
function allTerminatorLatsAtLon(sunLat, sunLon, lon, elevDeg) {
  const φ0   = sunLat * RAD;
  const Δλ   = (lon - sunLon) * RAD;
  const sinE = Math.sin(elevDeg * RAD);
  const A    = Math.sin(φ0);
  const B    = Math.cos(φ0) * Math.cos(Δλ);
  const R    = Math.hypot(A, B);
  if (R < Math.abs(sinE)) return [];

  const ψ       = Math.atan2(B, A);
  const base    = Math.asin(sinE / R);
  const TWO_PI  = 2 * Math.PI;
  const HALF_PI = Math.PI / 2;
  const result  = [];

  for (const raw of [base - ψ, Math.PI - base - ψ]) {
    const φ = ((raw + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
    if (φ >= -HALF_PI && φ <= HALF_PI) result.push(φ * DEG);
  }
  return result.sort((a, b) => a - b);
}

// Intersection: where moon is above the horizon AND sun is below -18° (true night).
function moonlitNightPolygon(sunLat, sunLon, moonSubLat, moonSubLon, centerLon = 0) {
  const start  = Math.round(centerLon) - 900;
  const end    = Math.round(centerLon) + 900;
  const moonPole = moonSubLat >= 0 ? 90 : -90;
  const sinE18   = Math.sin(-18 * RAD);
  const sinSun   = Math.sin(sunLat * RAD);
  const cosSun   = Math.cos(sunLat * RAD);

  const top = [];
  const bot = [];

  for (let lon = start; lon <= end; lon++) {
    const nightLats = allTerminatorLatsAtLon(sunLat, sunLon, lon, -18);
    if (nightLats.length === 0) continue;

    let nMin, nMax;
    if (nightLats.length === 2) {
      // Bounded band — night is between the two terminator latitudes (closed zone).
      [nMin, nMax] = [nightLats[0], nightLats[1]];
    } else {
      // Pole cap — use a test point to find which side of the terminator is night.
      const nLat    = nightLats[0];
      const testRad = (nLat - 1) * RAD;
      const sinElev = Math.sin(testRad) * sinSun
                    + Math.cos(testRad) * cosSun * Math.cos((lon - sunLon) * RAD);
      if (sinElev < sinE18) { nMin = -90;  nMax = nLat; }
      else                  { nMin = nLat; nMax = 90;   }
    }

    const mLat = terminatorLatAtLon(moonSubLat, moonSubLon, lon, 0);
    if (mLat === null) continue;
    const [mMin, mMax] = moonPole > 0 ? [mLat, 90] : [-90, mLat];

    const rMin = Math.max(nMin, mMin);
    const rMax = Math.min(nMax, mMax);
    if (rMin >= rMax) continue;

    top.push([Math.min(85, rMax), lon]);
    bot.push([Math.max(-85, rMin), lon]);
  }

  if (top.length === 0) return [];
  return [...top, ...[...bot].reverse()];
}

// ── Moon ────────────────────────────────────────────────────────────────────

let _moonCache = null;
let _moonCacheTime = -Infinity;

function sublunarPoint(date) {
  const t = date.getTime();
  if (Math.abs(t - _moonCacheTime) < 5 * 60 * 1000) return _moonCache;

  // Proper 2D coarse search — moon declination never exceeds ±28.5°
  let bestLat = 0, bestLon = 0, bestAlt = -Infinity;
  for (let lat = -30; lat <= 30; lat += 5) {
    for (let lon = -180; lon <= 175; lon += 10) {
      const a = SunCalc.getMoonPosition(date, lat, lon).altitude;
      if (a > bestAlt) { bestAlt = a; bestLat = lat; bestLon = lon; }
    }
  }
  // Refine around coarse best
  const lat0 = bestLat, lon0 = bestLon;
  bestAlt = -Infinity;
  for (let dlat = -6; dlat <= 6; dlat += 0.5) {
    for (let dlon = -12; dlon <= 12; dlon += 0.5) {
      const a = SunCalc.getMoonPosition(date, lat0 + dlat, lon0 + dlon).altitude;
      if (a > bestAlt) { bestAlt = a; bestLat = lat0 + dlat; bestLon = lon0 + dlon; }
    }
  }

  _moonCache = { lat: bestLat, lon: bestLon };
  _moonCacheTime = t;
  return _moonCache;
}

// ── Icons ───────────────────────────────────────────────────────────────────

function makePlaneEl(heading) {
  const div = document.createElement('div');
  div.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="-14 -14 28 28"
      style="transform:rotate(${heading}deg);filter:drop-shadow(0 1px 5px rgba(0,0,0,.9));transition:transform .12s linear">
    <path fill="#ffc857" stroke="#0a0e14" stroke-width="0.8" stroke-linejoin="round"
      d="M0,-11 L3,1 L0,-1 L-3,1 Z M-8,0 L8,0 L6,2.5 L-6,2.5 Z M-2.5,1.5 L2.5,1.5 L2,5.5 L-2,5.5 Z"/>
  </svg>`;
  return div;
}

function airportDot(iata) {
  return L.divIcon({
    html: `<div style="display:flex;flex-direction:column;align-items:center">
             <div style="width:9px;height:9px;border-radius:50%;background:#ffc857;border:2px solid #0a0e14;box-shadow:0 0 6px rgba(255,200,87,.7)"></div>
             <div style="color:#ffc857;font-size:10px;font-family:ui-monospace,monospace;margin-top:3px;white-space:nowrap;text-shadow:0 1px 4px #000;letter-spacing:.5px">${iata}</div>
           </div>`,
    className: '',
    iconSize: [40, 28],
    iconAnchor: [20, 5],
  });
}

// ── Twilight band definitions ────────────────────────────────────────────────
const BANDS = [
  { elevDeg:   0, fillOpacity: 0.18 },
  { elevDeg:  -6, fillOpacity: 0.18 },
  { elevDeg: -12, fillOpacity: 0.20 },
  { elevDeg: -18, fillOpacity: 0.22 },
];
const BAND_COLOR = '#1a2a4a';

// ── MapView ──────────────────────────────────────────────────────────────────

export class MapView {
  constructor(container) {
    this.map = L.map(container, {
      worldCopyJump: true,
      zoomControl: true,
      attributionControl: false,
      minZoom: 2,
      maxBounds: [[-85.06, -Infinity], [85.06, Infinity]],
      maxBoundsViscosity: 1.0,
      gestureHandling: true,
    }).setView([20, 0], 2);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
    }).addTo(this.map);

    this._bands         = [];
    this._termLine      = null;
    this._moonlitZone   = null;
    this._moonMarkers   = [];
    this._moonIconEmoji = null;
    this._pathCopies    = [];
    this._planeCopies   = [];
    this._planeElCopies = [];
    this._depCopies     = [];
    this._arrCopies     = [];
    this._centerLon     = 0;
    this._lastUtc       = new Date();
    this._suppressClick = false; // prevents zone popup when a marker popup is opening

    this.map.on('zoomend', () => this._updatePlaneScale());

    this.map.on('click', (e) => {
      if (this._suppressClick) { this._suppressClick = false; return; }
      const sunPos  = SunCalc.getPosition(this._lastUtc, e.latlng.lat, e.latlng.lng);
      const elevDeg = sunPos.altitude * DEG;
      let title, desc;
      if (elevDeg > 0) {
        title = '☀ Daylight';
        desc  = `Sun is ${Math.round(elevDeg)}° above the horizon.`;
      } else if (elevDeg > -6) {
        title = '🌅 Civil Twilight';
        desc  = 'Sun 0–6° below horizon — still bright enough to see clearly outdoors.';
      } else if (elevDeg > -12) {
        title = '🌆 Nautical Twilight';
        desc  = 'Sun 6–12° below horizon — horizon visible at sea, stars emerging.';
      } else if (elevDeg > -18) {
        title = '🌇 Astronomical Twilight';
        desc  = 'Sun 12–18° below horizon — sky nearly fully dark, faint stars visible.';
      } else {
        title = '🌑 Night';
        desc  = 'Sun more than 18° below horizon — full astronomical darkness.';
      }

      // Append moon info when it's dark enough to matter
      let moonLine = '';
      if (elevDeg <= 0) {
        const mi = moonPhaseInfo(
          SunCalc.getMoonIllumination(this._lastUtc).phase,
          SunCalc.getMoonIllumination(this._lastUtc).fraction,
        );
        const moonHere = SunCalc.getMoonPosition(this._lastUtc, e.latlng.lat, e.latlng.lng);
        if (mi.pct > 10) {
          const moonAlt = Math.round(moonHere.altitude * DEG);
          const moonStatus = moonHere.altitude > 0 ? `${moonAlt}° above horizon` : 'below horizon';
          moonLine = `<br><span style="color:#8b94a7">${mi.emoji} Moon: ${mi.name} · ${mi.pct}% · ${moonStatus}</span>`;
        }
      }

      L.popup({ className: 'zone-popup' })
        .setLatLng(e.latlng)
        .setContent(`<b>${title}</b><br>${desc}<br><span style="color:#8b94a7">Solar elevation: ${Math.round(elevDeg)}°</span>${moonLine}`)
        .openOn(this.map);
    });
  }

  setAirport(type, airport) {
    const copiesKey = type === 'from' ? '_depCopies' : '_arrCopies';
    for (const m of this[copiesKey]) m.remove();
    this[copiesKey] = [];

    const latStr = `${Math.abs(airport.lat).toFixed(2)}°${airport.lat >= 0 ? 'N' : 'S'}`;
    const lonStr = `${Math.abs(airport.lon).toFixed(2)}°${airport.lon >= 0 ? 'E' : 'W'}`;
    const label  = type === 'from' ? 'Departure' : 'Arrival';
    const popup  = `<b>${airport.iata}</b> · ${label}<br>${airport.name}<br>${airport.city}, ${airport.country}<br><span style="color:#8b94a7">${latStr} ${lonStr}</span>`;

    for (const off of COPY_OFFSETS) {
      const m = L.marker([airport.lat, airport.lon + off], {
        icon: airportDot(airport.iata),
        zIndexOffset: 500,
      }).bindPopup(popup)
        .on('click', () => { this._suppressClick = true; })
        .addTo(this.map);
      this[copiesKey].push(m);
    }

    // Fit using the canonical (offset=0) copy — index 2 in COPY_OFFSETS
    const primaryDep = this._depCopies[2];
    const primaryArr = this._arrCopies[2];
    if (primaryDep && primaryArr) {
      this.map.fitBounds(
        L.latLngBounds(primaryDep.getLatLng(), primaryArr.getLatLng()),
        { padding: [80, 80] }
      );
    } else {
      this.map.setView([airport.lat, airport.lon], 5);
    }
  }

  setFlight(samples) {
    this._centerLon = (samples[0].lon + samples[samples.length - 1].lon) / 2;

    // Remove old path copies and recreate (needed when centerLon changes)
    for (const p of this._pathCopies) p.remove();
    this._pathCopies = [];

    for (const off of COPY_OFFSETS) {
      const pts  = samples.map(s => [s.lat, s.lon + off]);
      const path = L.polyline(pts, {
        color: '#ffc857',
        weight: 2,
        opacity: 0.75,
        dashArray: '8 5',
      }).addTo(this.map);
      this._pathCopies.push(path);
    }

    // Fit to the copy whose lons are closest to the canonical [-180,180] range
    this.map.fitBounds(this._pathCopies[2].getBounds(), { padding: [60, 60] });

    // Clear plane copies — recreated on next update()
    for (const p of this._planeCopies) p.remove();
    this._planeCopies   = [];
    this._planeElCopies = [];

    // Force overlay recreation with new centerLon
    for (const b of this._bands) b.remove();
    this._bands = [];
    if (this._termLine) { this._termLine.remove(); this._termLine = null; }
    if (this._moonlitZone) { this._moonlitZone.remove(); this._moonlitZone = null; }
    for (const m of this._moonMarkers) m.remove();
    this._moonMarkers = [];
  }

  // Update only the sun/moon/terminator overlays — works without a flight loaded.
  tick(utcTime) {
    this._lastUtc = utcTime;
    const sub  = subsolarPoint(utcTime);
    const cLon = this._centerLon;

    // ── Twilight bands ───────────────────────────────────────────────────────
    if (this._bands.length === 0) {
      for (const band of BANDS) {
        const poly = L.polygon(nightPolygon(sub.lat, sub.lon, band.elevDeg, cLon), {
          stroke: false,
          fillColor: BAND_COLOR,
          fillOpacity: band.fillOpacity,
        }).addTo(this.map);
        poly.bringToBack();
        this._bands.push(poly);
      }
    } else {
      for (let i = 0; i < this._bands.length; i++) {
        this._bands[i].setLatLngs(nightPolygon(sub.lat, sub.lon, BANDS[i].elevDeg, cLon));
      }
    }

    // ── Terminator line ──────────────────────────────────────────────────────
    const tLine = terminatorLine(sub.lat, sub.lon, 0, cLon);
    if (!this._termLine) {
      this._termLine = L.polyline(tLine, {
        color: 'rgba(180, 120, 0, 0.7)',
        weight: 1.5,
      })
      .bindTooltip('Day / Night boundary', { sticky: true, className: 'map-tooltip' })
      .addTo(this.map);
    } else {
      this._termLine.setLatLngs(tLine);
    }

    // ── Moon circles + marker — one per world copy, only in night ────────────
    const moonIllum   = SunCalc.getMoonIllumination(utcTime);
    const moonPos     = sublunarPoint(utcTime);
    const sunAtMoon   = SunCalc.getPosition(utcTime, moonPos.lat, moonPos.lon);
    const moonInNight = sunAtMoon.altitude < 0;
    const mi          = moonPhaseInfo(moonIllum.phase, moonIllum.fraction);
    const moonOpacity = (moonIllum.fraction > 0.35 && moonInNight)
      ? ((moonIllum.fraction - 0.35) / 0.65) * 0.14
      : 0;
    const moonVisible = moonIllum.fraction > 0.35 && moonInNight;

    // ── Moonlit zone — intersection of moon-above-horizon and true night ─────
    const mlOpacity = moonVisible ? ((moonIllum.fraction - 0.35) / 0.65) * 0.09 : 0;
    const mlPts = moonVisible
      ? moonlitNightPolygon(sub.lat, sub.lon, moonPos.lat, moonPos.lon, cLon)
      : [];
    if (!this._moonlitZone) {
      this._moonlitZone = L.polygon(mlPts, {
        stroke: false,
        fillColor: '#99aacc',
        fillOpacity: mlOpacity,
      }).addTo(this.map);
      this._moonlitZone.bringToBack();
    } else {
      this._moonlitZone.setLatLngs(mlPts);
      this._moonlitZone.setStyle({ fillOpacity: mlOpacity });
    }

    const moonPopup = `<b>${mi.emoji} ${mi.name}</b><br>`
      + `Illumination: ${mi.pct}%<br>`
      + `${mi.brightness}.<br>`
      + `<span style="color:#8b94a7">The blue-tinted overlay shows true night areas where the moon `
      + `is above the horizon — ground illuminated by moonlight.</span>`;

    const emojiChanged = mi.emoji !== this._moonIconEmoji;
    if (emojiChanged) {
      this._moonIconEmoji  = mi.emoji;
      this._moonIconCached = L.divIcon({
        html: `<div style="font-size:18px;line-height:1;filter:drop-shadow(0 0 5px rgba(100,120,200,.95))">${mi.emoji}</div>`,
        className: '',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
    }
    const moonIcon = this._moonIconCached;

    if (this._moonMarkers.length === 0) {
      for (const off of COPY_OFFSETS) {
        const m = L.marker([moonPos.lat, moonPos.lon + off], {
          icon: moonIcon,
          zIndexOffset: 800,
          opacity: moonVisible ? 1 : 0,
        }).bindPopup(moonPopup)
          .on('click', () => { this._suppressClick = true; })
          .addTo(this.map);
        this._moonMarkers.push(m);
      }
    } else {
      for (let i = 0; i < COPY_OFFSETS.length; i++) {
        this._moonMarkers[i].setLatLng([moonPos.lat, moonPos.lon + COPY_OFFSETS[i]]);
        this._moonMarkers[i].setOpacity(moonVisible ? 1 : 0);
        this._moonMarkers[i].setPopupContent(moonPopup);
        if (emojiChanged) this._moonMarkers[i].setIcon(moonIcon);
      }
    }

  }

  update(lat, lon, heading, utcTime) {
    this.tick(utcTime);

    // ── Plane — one marker per world copy ────────────────────────────────────
    const latStr    = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}`;
    const lonStr    = `${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
    const hdgStr    = `${String(Math.round(heading)).padStart(3, '0')}°`;
    const planePopup = `<b>Aircraft position</b><br>${latStr} ${lonStr}<br>Heading: ${hdgStr}`;

    if (this._planeCopies.length === 0) {
      for (const off of COPY_OFFSETS) {
        const el = makePlaneEl(heading);
        const marker = L.marker([lat, lon + off], {
          icon: L.divIcon({ html: el, className: '', iconSize: [28, 28], iconAnchor: [14, 14] }),
          zIndexOffset: 1000,
        }).bindPopup(planePopup)
          .on('click', () => { this._suppressClick = true; })
          .addTo(this.map);
        this._planeCopies.push(marker);
        this._planeElCopies.push(el);
      }
      this._updatePlaneScale();
    } else {
      for (let i = 0; i < COPY_OFFSETS.length; i++) {
        this._planeCopies[i].setLatLng([lat, lon + COPY_OFFSETS[i]]);
        this._planeCopies[i].setPopupContent(planePopup);
        const svg = this._planeElCopies[i].querySelector('svg');
        if (svg) svg.style.transform = `rotate(${heading}deg)`;
      }
    }
  }

  _updatePlaneScale() {
    const zoom  = this.map.getZoom();
    const scale = Math.max(1, Math.pow(1.22, zoom - 3));
    for (const el of this._planeElCopies) {
      el.style.transform        = `scale(${scale})`;
      el.style.transformOrigin  = 'center center';
    }
  }
}
