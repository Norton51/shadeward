import './style.css';
import './analytics.js';
import { loadAirports, findAirport } from './lib/airports.js';
import { distanceKm } from './lib/geo.js';
import { zonedToUtc, toLocalInput, clock, zoneAbbr, dayDelta, formatDuration } from './lib/time.js';
import { createFlight, analyzeFlight, estimateBlockMinutes, DIRECT_SUN } from './lib/flight.js';
import { SKY_LABEL } from './lib/astro.js';
import { MapView } from './ui/mapview.js';
import { Timeline } from './ui/timeline.js';
import { airportCombobox } from './ui/autocomplete.js';
import { renderCabinCompass } from './ui/cabin.js';
import { renderSummary } from './ui/summary.js';
import { $, sideLabel } from './ui/dom.js';

const els = {
  depart: $('#depart'), departZone: $('#depart-zone'),
  durH: $('#dur-h'), durM: $('#dur-m'), durReset: $('#dur-reset'),
  error: $('#form-error'), result: $('#result'), share: $('#share'),
  compass: $('#compass'), timeline: $('#timeline'), cabin3d: $('#cabin3d'),
  nowTime: $('#now-time'), nowSun: $('#now-sun'), nowDetail: $('#now-detail'),
};
const emptyState = els.result.innerHTML;
const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

const state = { from: null, to: null, durationOverride: null };
let current = null;

// The 3D cabin view pulls in three.js, so load it only once there is a flight to show.
let cabinView = null;
let cabinLoading = null;
const defaultSeat = () => (current?.analysis.recommendation.seat === 'left' ? 'left' : 'right');

function setSeat(side) {
  cabinView?.setSide(side);
  for (const b of els.cabin3d.querySelectorAll('[data-side]')) b.setAttribute('aria-pressed', String(b.dataset.side === side));
}

els.cabin3d.addEventListener('click', (e) => {
  const b = e.target.closest('[data-side]');
  if (b) setSeat(b.dataset.side);
});

function loadCabinView() {
  cabinLoading ??= import('./ui/cabin3d.js')
    .then(({ createCabinView }) => {
      els.cabin3d.hidden = false;
      cabinView = createCabinView(els.cabin3d);
      if (current) {
        setSeat(defaultSeat());
        mapView.setFlight(current.analysis.samples); // refit now that the card is taller
        onTime(timeline.t);
      }
    })
    .catch((err) => console.warn('3D cabin view unavailable:', err));
  return cabinLoading;
}

const mapView = new MapView($('#map'), [els.compass, els.timeline]);
const updateCompass = renderCabinCompass($('#compass-svg'));
const timeline = new Timeline(els.timeline, onTime);
const fromBox = airportCombobox($('#from'), (a) => { state.from = a; routeChanged(); });
const toBox = airportCombobox($('#to'), (a) => { state.to = a; routeChanged(); });

// ── Inputs ────────────────────────────────────────────────────────────────

$('#trip').addEventListener('submit', (e) => e.preventDefault());

$('#swap').addEventListener('click', () => {
  [state.from, state.to] = [state.to, state.from];
  fromBox.set(state.from);
  toBox.set(state.to);
  routeChanged();
});

let departTimer = 0;
els.depart.addEventListener('input', () => {
  clearTimeout(departTimer);
  departTimer = setTimeout(compute, 250);
});

for (const input of [els.durH, els.durM]) {
  input.addEventListener('input', () => {
    const min = (+els.durH.value || 0) * 60 + (+els.durM.value || 0);
    state.durationOverride = min >= 15 ? min : null;
    els.durReset.hidden = state.durationOverride === null;
    clearTimeout(departTimer);
    departTimer = setTimeout(compute, 250);
  });
}

els.durReset.addEventListener('click', () => {
  state.durationOverride = null;
  els.durReset.hidden = true;
  showDuration();
  compute();
});

els.share.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    els.share.textContent = 'Link copied';
  } catch {
    els.share.textContent = 'Copy the address bar to share';
  }
  setTimeout(() => { els.share.textContent = 'Copy link to this flight'; }, 2000);
});

document.addEventListener('keydown', (e) => {
  if (e.key !== ' ' || !current || e.target.closest('input, button, textarea, select, a')) return;
  e.preventDefault();
  timeline.raf ? timeline.pause() : timeline.resume();
});

function estimatedMinutes() {
  return state.from && state.to ? estimateBlockMinutes(distanceKm(state.from, state.to)) : null;
}

function durationMinutes() {
  return state.durationOverride ?? estimatedMinutes();
}

function showDuration() {
  const min = durationMinutes();
  els.durH.value = min == null ? '' : Math.floor(min / 60);
  els.durM.value = min == null ? '' : min % 60;
}

function originTz() {
  return state.from?.tz ?? browserTz;
}

function routeChanged() {
  syncPage();
  mapView.setAirports(state.from, state.to);
  els.departZone.textContent = state.from ? `local time at ${state.from.iata}` : 'local time';
  if (state.durationOverride === null) showDuration();
  compute();
}

function setError(msg) {
  els.error.textContent = msg ?? '';
  els.error.hidden = !msg;
}

// ── Computation ───────────────────────────────────────────────────────────

function compute() {
  const { from, to } = state;
  const departUtc = from && zonedToUtc(els.depart.value, from.tz);
  setError(null);

  if (!from || !to || !departUtc) return clearFlight();
  if (from.iata === to.iata) {
    setError('Origin and destination are the same airport.');
    return clearFlight();
  }

  let flight;
  try {
    flight = createFlight({ from, to, departUtc, durationMin: durationMinutes() });
  } catch (err) {
    setError(err.message);
    return clearFlight();
  }
  const analysis = analyzeFlight(flight);
  current = { flight, analysis };

  renderSummary(els.result, { flight, analysis, from, to, fmt });
  els.compass.hidden = false;
  els.timeline.hidden = false;
  els.share.hidden = false;
  mapView.invalidate();
  mapView.setFlight(analysis.samples);
  setSeat(defaultSeat());
  loadCabinView();
  timeline.setFlight({
    totalSec: flight.totalSec,
    samples: analysis.samples,
    events: analysis.events,
    startLabel: `${from.iata} ${fmt.at(flight.departUtc, from.tz)}`,
    endLabel: `${to.iata} ${fmt.at(flight.arriveUtc, to.tz)}`,
    describe: (t) => `${fmt.elapsed(t)} into flight, ${fmt.at(new Date(departUtc.getTime() + t * 1000), from.tz)}`,
    eventLabel: (e) => `${e.type[0].toUpperCase()}${e.type.slice(1)} · ${e.side === 'left' || e.side === 'right' ? `${e.side} side` : sideLabel[e.side]} · ${fmt.clocks(e.utc)}`,
  });
  writeUrl();
}

function clearFlight() {
  if (!current) return;
  current = null;
  timeline.pause();
  els.compass.hidden = true;
  els.timeline.hidden = true;
  els.share.hidden = true;
  els.result.innerHTML = emptyState;
  mapView.setFlight(null);
  mapView.setTime(new Date());
}

const fmt = {
  at: (utc, tz) => `${clock(utc, tz)} ${zoneAbbr(utc, tz)}`,
  day: (utc, ref, tz) => {
    const d = dayDelta(utc, ref, tz);
    return d ? `${d > 0 ? '+' : '−'}${Math.abs(d)}` : '';
  },
  elapsed: (t) => formatDuration(t / 60),
  /** Wall clock at origin and destination, e.g. "10:00 PDT / 13:00 EDT" (one if they agree). */
  clocks: (utc) => [...new Set([fmt.at(utc, state.from.tz), fmt.at(utc, state.to.tz)])].join(' / '),
};

// ── Scrubbing ─────────────────────────────────────────────────────────────

let lastMapDraw = 0;
let pendingMap = 0;

function onTime(t) {
  if (!current) return;
  const { flight } = current;
  const s = flight.stateAt(t);

  // The day/night overlays are comparatively expensive; cap map redraws at ~20 fps.
  const drawMap = () => { lastMapDraw = performance.now(); pendingMap = 0; mapView.setTime(s.utc, s); };
  clearTimeout(pendingMap);
  if (performance.now() - lastMapDraw > 50) drawMap();
  else pendingMap = setTimeout(drawMap, 50);

  updateCompass(s);
  cabinView?.update(s);
  els.nowTime.textContent = `${fmt.elapsed(t)} in · ${fmt.clocks(s.utc)}`;

  const elev = Math.round(s.sun.elevation);
  if (s.cabin.visible) {
    const where = s.cabin.side === 'left' || s.cabin.side === 'right' ? `on the ${s.cabin.side}` : sideLabel[s.cabin.side];
    els.nowSun.textContent = `Sun ${Math.max(0, elev)}° up, ${where}`;
    els.nowDetail.textContent = s.cabin.right >= DIRECT_SUN ? 'Right-side windows in direct sun'
      : s.cabin.left >= DIRECT_SUN ? 'Left-side windows in direct sun'
      : s.sun.elevation > 55 ? 'Sun high overhead — little reaches the windows'
      : 'Sun off the nose or tail — little reaches the windows';
  } else {
    els.nowSun.textContent = SKY_LABEL[s.sky];
    els.nowDetail.textContent = s.sky === 'night' ? 'Sun well below the horizon' : `Sun ${Math.abs(elev)}° below the horizon`;
  }
}

// ── URL state ─────────────────────────────────────────────────────────────
//
// A flight lives in the path and query, e.g. /lax-jfk?dep=2026-10-07T08:00&dur=320,
// so every route has a real, indexable address. Popular routes are also
// pre-rendered as static pages at the same paths (scripts/prerender.mjs).
// Older #from=LAX&to=JFK links are still read, then rewritten.

const ROUTE_PATH = /^\/([a-z]{3})-([a-z]{3})\/?$/i;

function flightUrl() {
  const p = new URLSearchParams({ dep: els.depart.value });
  if (state.durationOverride !== null) p.set('dur', state.durationOverride);
  return `/${state.from.iata.toLowerCase()}-${state.to.iata.toLowerCase()}?${p.toString().replace(/%3A/g, ':')}`;
}

// Pre-rendered route pages carry a written guide for their own route; hide it
// once the app shows a different one, and keep the tab title in step.
const guide = document.querySelector('.guide[data-route]');
const pageTitle = document.title;

function syncPage() {
  const slug = state.from && state.to ? `${state.from.iata}-${state.to.iata}`.toLowerCase() : null;
  if (guide) guide.hidden = slug !== guide.dataset.route;
  document.title = !slug || slug === guide?.dataset.route ? pageTitle
    : `${state.from.city} to ${state.to.city} (${state.from.iata}–${state.to.iata}) · Sunseat`;
}

function writeUrl() {
  const url = flightUrl();
  if (url !== location.pathname + location.search) history.replaceState(null, '', url);
}

function readUrl() {
  const legacy = location.hash.length > 1 ? new URLSearchParams(location.hash.slice(1)) : null;
  const route = ROUTE_PATH.exec(location.pathname);
  const p = legacy ?? new URLSearchParams(location.search);
  state.from = findAirport(legacy ? p.get('from') : route?.[1]);
  state.to = findAirport(legacy ? p.get('to') : route?.[2]);
  fromBox.set(state.from);
  toBox.set(state.to);

  const dep = p.get('dep') ?? '';
  const today = toLocalInput(new Date(), originTz()).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dep)) els.depart.value = dep;
  else if (/^\d{2}:\d{2}$/.test(dep)) els.depart.value = `${today}T${dep}`;
  else els.depart.value = `${today}T09:00`;

  const dur = Number(p.get('dur'));
  state.durationOverride = dur >= 15 ? Math.round(dur) : null;
  els.durReset.hidden = state.durationOverride === null;
  showDuration();
  routeChanged();
}

window.addEventListener('popstate', readUrl);
window.addEventListener('hashchange', readUrl);

// Example and route links inside the app navigate without a page load.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-route]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  history.pushState(null, '', a.getAttribute('href'));
  readUrl();
});

loadAirports().then(readUrl, () => setError('Couldn’t load the airport list. Check your connection and reload.'));
