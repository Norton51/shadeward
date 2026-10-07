import { test } from 'node:test';
import assert from 'node:assert/strict';
import { greatCircle, distanceKm, bearing, normLon } from '../src/lib/geo.js';
import { zonedToUtc, toLocalInput, clock, offsetMinutes, dayDelta } from '../src/lib/time.js';
import { subsolarPoint, sublunarPoint, sunPosition, moonPosition } from '../src/lib/astro.js';
import { createFlight, analyzeFlight, cabinSun, estimateBlockMinutes, horizonDip } from '../src/lib/flight.js';

const LAX = { lat: 33.9425, lon: -118.408, tz: 'America/Los_Angeles' };
const JFK = { lat: 40.6398, lon: -73.7789, tz: 'America/New_York' };
const SFO = { lat: 37.619, lon: -122.375, tz: 'America/Los_Angeles' };
const NRT = { lat: 35.7647, lon: 140.386, tz: 'Asia/Tokyo' };
const LHR = { lat: 51.4707, lon: -0.4599, tz: 'Europe/London' };

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${a} ≈ ${b} ±${tol}`);

test('great-circle distance and bearing', () => {
  near(distanceKm(LAX, JFK), 3983, 15);
  near(bearing(LAX, JFK), 65.9, 1);
  near(distanceKm(LHR, JFK), 5540, 15);
});

test('route endpoints and antimeridian continuity', () => {
  const r = greatCircle(SFO, NRT);
  near(r.at(0).lat, SFO.lat, 1e-6);
  near(r.at(1).lat, NRT.lat, 1e-6);
  near(normLon(r.at(1).lon), NRT.lon, 1e-6);
  let prev = r.at(0).lon;
  for (let f = 0.01; f <= 1; f += 0.01) {
    const p = r.at(f);
    assert.ok(Math.abs(p.lon - prev) < 5, 'longitude jumps');
    prev = p.lon;
  }
  assert.ok(r.at(0.5).lat > 45, 'SFO–NRT arcs north');
  near(r.at(0).heading, bearing(SFO, NRT), 0.5);
});

test('rejects degenerate routes', () => {
  assert.throws(() => greatCircle(LAX, LAX), RangeError);
  assert.throws(() => greatCircle({ lat: 10, lon: 20 }, { lat: -10, lon: -160 }), RangeError);
});

test('time zones honour DST', () => {
  assert.equal(zonedToUtc('2026-07-01T09:00', 'America/Los_Angeles').toISOString(), '2026-07-01T16:00:00.000Z');
  assert.equal(zonedToUtc('2026-01-15T09:00', 'America/Los_Angeles').toISOString(), '2026-01-15T17:00:00.000Z');
  assert.equal(zonedToUtc('2026-07-01T09:00', 'Asia/Kolkata').toISOString(), '2026-07-01T03:30:00.000Z');
  // Spring-forward gap resolves forward; fall-back overlap takes the earlier instant.
  assert.equal(zonedToUtc('2026-03-08T02:30', 'America/Los_Angeles').toISOString(), '2026-03-08T10:30:00.000Z');
  assert.equal(zonedToUtc('2026-11-01T01:30', 'America/Los_Angeles').toISOString(), '2026-11-01T08:30:00.000Z');
  const d = new Date('2026-07-01T16:00:00Z');
  assert.equal(toLocalInput(d, 'America/Los_Angeles'), '2026-07-01T09:00');
  assert.equal(clock(d, 'Asia/Tokyo'), '01:00');
  assert.equal(dayDelta(d, d, 'Asia/Tokyo'), 0);
  assert.equal(offsetMinutes(d, 'Europe/London'), 60);
});

test('subsolar and sublunar points agree with SunCalc', () => {
  const t = new Date('2026-06-21T12:00:00Z');
  const s = subsolarPoint(t);
  near(s.lat, 23.44, 0.1);
  near(sunPosition(t, s.lat, s.lon).elevation, 90, 0.5);
  for (const iso of ['2026-02-03T05:00:00Z', '2026-09-17T21:30:00Z']) {
    const m = sublunarPoint(new Date(iso));
    near(moonPosition(new Date(iso), m.lat, m.lon).elevation, 90, 1.5, `moon at ${iso}`);
  }
});

test('cabin geometry', () => {
  const right = cabinSun({ azimuth: 180, elevation: 10 }, 90);
  assert.equal(right.side, 'right');
  near(right.right, Math.cos(10 * Math.PI / 180), 1e-9);
  assert.equal(right.left, 0);
  const left = cabinSun({ azimuth: 0, elevation: 10 }, 90);
  assert.equal(left.side, 'left');
  const overhead = cabinSun({ azimuth: 180, elevation: 85 }, 90);
  assert.ok(overhead.right < 0.25, 'high sun is not direct window sun');
  assert.equal(cabinSun({ azimuth: 180, elevation: -2 }, 90, horizonDip(11000)).visible, true);
  assert.equal(cabinSun({ azimuth: 180, elevation: -2 }, 90).visible, false);
});

test('duration estimate is in a sane range', () => {
  near(estimateBlockMinutes(3983), 315, 30);
  near(estimateBlockMinutes(10880), 13 * 60, 60);
});

test('eastbound morning US flight: sun on the right, sit left', () => {
  const f = createFlight({ from: LAX, to: JFK, departUtc: zonedToUtc('2026-10-07T07:00', LAX.tz), durationMin: 315 });
  const a = analyzeFlight(f);
  assert.ok(a.totals.rightExposure > a.totals.leftExposure * 2);
  assert.equal(a.recommendation.seat, 'left');
});

test('westbound afternoon US flight: sun on the left, sit right', () => {
  const f = createFlight({ from: JFK, to: LAX, departUtc: zonedToUtc('2026-10-07T13:00', JFK.tz), durationMin: 360 });
  const a = analyzeFlight(f);
  assert.equal(a.recommendation.seat, 'right');
});

test('overnight transatlantic flight has a sunrise and is mostly dark', () => {
  const f = createFlight({ from: JFK, to: LHR, departUtc: zonedToUtc('2026-10-07T21:00', JFK.tz), durationMin: 420 });
  const a = analyzeFlight(f);
  assert.ok(a.events.some((e) => e.type === 'sunrise'));
  assert.ok(a.totals.bands.night + a.totals.bands.twilight > 200);
  const sunrise = a.events.find((e) => e.type === 'sunrise');
  assert.equal(sunrise.side, 'ahead', 'heading east into the dawn, the sun rises off the nose');
});
