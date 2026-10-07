// Flight simulation: where the aircraft is, which way it points, and where the
// sun and moon sit relative to the cabin at every moment of the flight.

import { greatCircle, normAngle, normLon, RAD } from './geo.js';
import { sunPosition, moonPosition, moonPhase, skyCondition } from './astro.js';

export const CRUISE_ALT_M = 11000;

/** Gate-to-gate time estimate: ~840 km/h cruise plus 30 min for taxi, climb and approach. */
export function estimateBlockMinutes(distanceKm) {
  return Math.max(30, Math.round((30 + (distanceKm / 840) * 60) / 5) * 5);
}

/** Simple climb / cruise / descent profile, by elapsed time. */
export function altitudeAt(t, totalSec) {
  const climb = Math.min(20 * 60, totalSec * 0.3);
  const descent = Math.min(25 * 60, totalSec * 0.35);
  if (t < climb) return (CRUISE_ALT_M * t) / climb;
  if (t > totalSec - descent) return (CRUISE_ALT_M * Math.max(0, totalSec - t)) / descent;
  return CRUISE_ALT_M;
}

/**
 * Apparent elevation of the horizon from altitude, in degrees (negative).
 * At cruise the horizon sits ~3° below level, so the sun stays visible after
 * it has set on the ground below.
 */
export function horizonDip(altitudeM) {
  return -0.833 - Math.sqrt(Math.max(0, altitudeM)) * 0.0293;
}

/** Below this lateral intensity the sun is too high, or too far fore/aft, to shine into a side window. */
export const DIRECT_SUN = 0.25;

/**
 * Sun geometry in the cabin frame.
 * relative: bearing from the nose, -180..180, positive = right wing.
 * left/right: how squarely the sun faces each row of windows (0..1), the
 * horizontal sun vector projected onto the window normal.
 */
export function cabinSun(sun, heading, horizon = -0.833) {
  const relative = normAngle(sun.azimuth - heading);
  const visible = sun.elevation > horizon;
  const lateral = Math.cos(sun.elevation * RAD) * Math.sin(relative * RAD);
  let side = null;
  if (visible) {
    const a = Math.abs(relative);
    side = a < 20 ? 'ahead' : a > 160 ? 'behind' : relative > 0 ? 'right' : 'left';
  }
  return {
    relative,
    visible,
    side,
    right: visible ? Math.max(0, lateral) : 0,
    left: visible ? Math.max(0, -lateral) : 0,
  };
}

/** Timeline band for a moment: which window the sun is in, or how dark it is. */
function bandFor(sky, cabin) {
  if (cabin.visible) {
    if (cabin.right >= DIRECT_SUN) return 'right';
    if (cabin.left >= DIRECT_SUN) return 'left';
    return 'day';
  }
  return sky === 'day' || sky === 'civil' || sky === 'nautical' ? 'twilight' : 'night';
}

export function createFlight({ from, to, departUtc, durationMin }) {
  const route = greatCircle(from, to);
  const totalSec = durationMin * 60;

  const stateAt = (t) => {
    t = Math.min(totalSec, Math.max(0, t));
    const p = route.at(t / totalSec);
    const utc = new Date(departUtc.getTime() + t * 1000);
    const altitudeM = altitudeAt(t, totalSec);
    const horizon = horizonDip(altitudeM);
    const sun = sunPosition(utc, p.lat, normLon(p.lon));
    const cabin = cabinSun(sun, p.heading, horizon);
    const sky = skyCondition(sun.elevation);
    return { t, utc, lat: p.lat, lon: p.lon, heading: p.heading, altitudeM, horizon, sun, cabin, sky, band: bandFor(sky, cabin) };
  };

  return {
    from, to, departUtc, durationMin, totalSec,
    distanceKm: route.distanceKm,
    arriveUtc: new Date(departUtc.getTime() + totalSec * 1000),
    stateAt,
  };
}

/** Sample a flight once per `stepSec` and derive events, totals and a seat recommendation. */
export function analyzeFlight(flight, stepSec = 60) {
  const n = Math.max(2, Math.ceil(flight.totalSec / stepSec) + 1);
  const samples = Array.from({ length: n }, (_, i) => flight.stateAt(Math.min(i * stepSec, flight.totalSec)));
  const events = findEvents(flight, samples);
  const totals = sumTotals(samples);
  return { samples, events, totals, recommendation: recommend(totals, events, flight.durationMin) };
}

function crossings(samples, value) {
  const out = [];
  for (let i = 1; i < samples.length; i++) {
    const a = value(samples[i - 1]);
    const b = value(samples[i]);
    if ((a <= 0) === (b <= 0)) continue;
    const f = a / (a - b);
    out.push({ rising: b > 0, t: samples[i - 1].t + f * (samples[i].t - samples[i - 1].t) });
  }
  return out;
}

function findEvents(flight, samples) {
  const events = [];

  for (const c of crossings(samples, (s) => s.sun.elevation - s.horizon)) {
    const s = flight.stateAt(c.t);
    events.push({ type: c.rising ? 'sunrise' : 'sunset', t: c.t, utc: s.utc, side: lateralSide(s.cabin.relative) });
  }

  const moonSamples = samples.map((s) => ({ t: s.t, alt: moonPosition(s.utc, s.lat, normLon(s.lon)).elevation - s.horizon }));
  for (const c of crossings(moonSamples, (s) => s.alt)) {
    const s = flight.stateAt(c.t);
    if (s.cabin.visible) continue; // the moon is unremarkable in daylight
    const phase = moonPhase(s.utc);
    if (phase.illumination < 0.15) continue;
    const moon = moonPosition(s.utc, s.lat, normLon(s.lon));
    events.push({ type: c.rising ? 'moonrise' : 'moonset', t: c.t, utc: s.utc, side: lateralSide(normAngle(moon.azimuth - s.heading)), phase });
  }

  return events.sort((a, b) => a.t - b.t);
}

function lateralSide(relative) {
  const a = Math.abs(relative);
  if (a < 20) return 'ahead';
  if (a > 160) return 'behind';
  return relative > 0 ? 'right' : 'left';
}

function sumTotals(samples) {
  const bands = { left: 0, right: 0, day: 0, twilight: 0, night: 0 };
  let leftExposure = 0;
  let rightExposure = 0;
  for (let i = 0; i < samples.length - 1; i++) {
    const s = samples[i];
    const dtMin = (samples[i + 1].t - s.t) / 60;
    bands[s.band] += dtMin;
    leftExposure += s.cabin.left * dtMin;
    rightExposure += s.cabin.right * dtMin;
  }
  return { bands, leftExposure, rightExposure, daylight: bands.left + bands.right + bands.day };
}

/**
 * Seat advice. `seat` is the side to sit on for shade ('left' | 'right' | 'either');
 * `reason` explains an 'either'. Sunrise/sunset/moon views are listed separately
 * because some travellers want the sun, not shade.
 */
function recommend(totals, events, durationMin) {
  const { left, right } = totals.bands;
  const direct = left + right;
  const views = events.filter((e) => e.side === 'left' || e.side === 'right');

  let seat = 'either';
  let reason;
  if (totals.daylight < Math.max(10, durationMin * 0.1)) {
    reason = 'dark';
  } else if (direct < Math.max(10, durationMin * 0.08)) {
    reason = 'no-direct-sun';
  } else {
    const hi = Math.max(totals.leftExposure, totals.rightExposure);
    const lo = Math.min(totals.leftExposure, totals.rightExposure);
    if (lo / hi > 0.7) reason = 'balanced';
    else seat = totals.leftExposure < totals.rightExposure ? 'left' : 'right';
  }
  return { seat, reason, sunnyMinutes: { left, right }, views };
}
