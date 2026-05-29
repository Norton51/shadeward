import { sampleFlight, greatCircleDistanceKm, estimateDurationHours, normLon } from './flight.js';
import { sunPositionAt, sunRelativeToCabin, findSolarEvents, findMoonEvents, recommendSide } from './sun.js';
import { MapView } from './mapview.js';
import { Timeline } from './timeline.js';
import { attachAirportAutocomplete } from './ui.js';
import { initAirports } from './airports.js';
import SunCalc from 'suncalc';

initAirports();

let fromAirport = null;
let toAirport   = null;
let durationHours = 5;
let flightSamples = [];
let solarEvents   = [];

const fromInput = document.getElementById('from-airport');
const toInput   = document.getElementById('to-airport');
const fromSugg  = document.getElementById('from-suggestions');
const toSugg    = document.getElementById('to-suggestions');

attachAirportAutocomplete(fromInput, fromSugg, (ap) => {
  fromAirport = ap;
  mapView.setAirport('from', ap);
  updateEstimate();
  clearSameAirportError();
  tryAutoCompute();
});
attachAirportAutocomplete(toInput, toSugg, (ap) => {
  toAirport = ap;
  mapView.setAirport('to', ap);
  updateEstimate();
  clearSameAirportError();
  tryAutoCompute();
});

function clearSameAirportError() {
  toInput.classList.remove('input-error');
  const err = document.getElementById('same-airport-error');
  if (err) err.remove();
}

function showSameAirportError() {
  if (document.getElementById('same-airport-error')) return;
  toInput.classList.add('input-error');
  const msg = document.createElement('small');
  msg.id = 'same-airport-error';
  msg.textContent = 'Origin and destination cannot be the same.';
  msg.style.color = 'var(--error)';
  toInput.parentElement.appendChild(msg);
}

function updateEstimate() {
  if (fromAirport && toAirport) {
    const dist = greatCircleDistanceKm(fromAirport.lat, fromAirport.lon, toAirport.lat, toAirport.lon);
    durationHours = estimateDurationHours(dist);
  }
}

const now = new Date();
const defaultDepart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0);
const departInput = document.getElementById('depart-time');
departInput.value = formatForDatetimeLocal(defaultDepart);

let departTimer = null;
departInput.addEventListener('input', () => {
  clearTimeout(departTimer);
  departTimer = setTimeout(tryAutoCompute, 400);
});

function formatForDatetimeLocal(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const mapView = new MapView(document.getElementById('map-container'));

// Render overlays at current real time on load.
mapView.tick(new Date());

const hudTime = document.getElementById('hud-time');
const hudSun  = document.getElementById('hud-sun');

const timeline = new Timeline({
  scrubEl:      document.getElementById('timeline-scrub'),
  eventsEl:     document.getElementById('timeline-events'),
  startLabelEl: document.getElementById('timeline-start'),
  endLabelEl:   document.getElementById('timeline-end'),
  playBtnEl:    document.getElementById('play-btn'),
  onChange: onTimelineChange,
});

function sunStateHud(elevDeg, side, utc) {
  if (elevDeg > 0) {
    const sideLabel = side === 'left' || side === 'right' ? ` · ${side.toUpperCase()}` : '';
    return `☀ ${Math.round(elevDeg)}°${sideLabel}`;
  }
  if (elevDeg > -6)  return `🌅 Civil twilight · ${Math.round(elevDeg)}°`;
  if (elevDeg > -12) return `🌆 Nautical twilight · ${Math.round(elevDeg)}°`;
  if (elevDeg > -18) return `🌇 Astro twilight · ${Math.round(elevDeg)}°`;
  const moon = SunCalc.getMoonIllumination(utc);
  const moonStr = moon.fraction > 0.1 ? ` · Moon ${Math.round(moon.fraction * 100)}%` : '';
  return `🌑 Night${moonStr}`;
}

function onTimelineChange(state) {
  const sun   = sunPositionAt(state.utc, state.lat, state.lon);
  const cabin = sunRelativeToCabin(sun.azimuthDeg, sun.elevationDeg, state.heading);

  mapView.update(state.lat, state.lon, state.heading, state.utc);

  hudTime.textContent = state.utc.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  hudSun.textContent  = sunStateHud(sun.elevationDeg, cabin.side, state.utc);
}

function tryAutoCompute() {
  if (!fromAirport || !toAirport) return;
  if (fromAirport.iata === toAirport.iata) { showSameAirportError(); return; }
  const departLocalStr = departInput.value;
  if (!departLocalStr) return;

  // Parse the datetime-local value as if it's UTC (appending Z avoids browser-timezone
  // interpretation), then shift by the airport's longitude-based offset to get true UTC.
  const asUTC = new Date(departLocalStr + 'Z');
  const offsetHours = fromAirport.lon / 15;
  const departUtc = new Date(asUTC.getTime() - offsetHours * 3600 * 1000);

  flightSamples = sampleFlight(
    { lat: fromAirport.lat, lon: fromAirport.lon },
    { lat: toAirport.lat,   lon: toAirport.lon   },
    departUtc,
    durationHours,
    60
  );

  solarEvents = [
    ...findSolarEvents(flightSamples),
    ...findMoonEvents(flightSamples),
  ].sort((a, b) => a.t - b.t);
  const rec = recommendSide(flightSamples);

  renderSummary(rec);
  document.getElementById('summary').classList.remove('hidden');
  document.getElementById('timeline-container').classList.remove('hidden');

  mapView.setFlight(flightSamples);
  timeline.setFlight(flightSamples, solarEvents);
}

const summaryContent = document.getElementById('summary-content');

function renderSummary(rec) {
  const dist = greatCircleDistanceKm(fromAirport.lat, fromAirport.lon, toAirport.lat, toAirport.lon);
  const EVENT_LABELS = {
    sunrise:  '🌅 Sunrise',
    sunset:   '🌇 Sunset',
    moonrise: '🌔 Moonrise',
    moonset:  '🌒 Moonset',
  };
  const eventList = solarEvents.length
    ? solarEvents.map(e => {
        const off = normLon(e.lon) / 15;
        const loc = new Date(e.utc.getTime() + off * 3600 * 1000);
        const t   = loc.toISOString().slice(11, 16);
        return `<div class="summary-row"><span class="label">${EVENT_LABELS[e.type]}</span><span class="value">${t} local</span></div>`;
      }).join('')
    : '<div class="summary-row"><span class="label">No notable events</span><span class="value">during flight</span></div>';

  const daySec   = rec.totalSec - rec.nightSec;
  const fmtHrs = (sec) => (sec / 3600).toFixed(1) + 'h';
  const fmtPct = (sec, of) => of > 0 ? (sec / of * 100).toFixed(0) + '%' : '0%';
  const fmtVal = (sec, of) => `${fmtPct(sec, of)} · ${fmtHrs(sec)}`;

  const dayPct       = fmtVal(daySec, rec.totalSec);
  const nightPct     = fmtVal(rec.nightSec, rec.totalSec);
  const leftPct      = fmtVal(rec.leftSec, daySec);
  const rightPct     = fmtVal(rec.rightSec, daySec);
  const parallelPct  = fmtVal(rec.parallelSec, daySec);

  summaryContent.innerHTML = `
    <div class="summary-row"><span class="label">Distance</span><span class="value">${Math.round(dist).toLocaleString()} km</span></div>
    <div class="summary-row"><span class="label">Duration</span><span class="value">${durationHours.toFixed(1)}h est.</span></div>
    <div class="summary-row"><span class="label">Daylight</span><span class="value">${dayPct}</span></div>
    <div class="summary-row summary-subrow"><span class="label">Sun · left window</span><span class="value">${leftPct}</span></div>
    <div class="summary-row summary-subrow"><span class="label">Sun · right window</span><span class="value">${rightPct}</span></div>
    <div class="summary-row summary-subrow"><span class="label">Sun · overhead/parallel</span><span class="value">${parallelPct}</span></div>
    <div class="summary-row"><span class="label">Night</span><span class="value">${nightPct}</span></div>
    ${eventList}
    <div class="seat-rec"><strong>Best side:</strong> ${rec.recommendation}</div>
  `;
}
