import SunCalc from 'suncalc';
import { RAD, DEG, normLon } from './geo.js';

const J2000 = 2451545;
const daysSinceJ2000 = (date) => date.getTime() / 86400000 + 2440587.5 - J2000;
const gmstDeg = (d) => 280.46061837 + 360.98564736629 * d;

/** Sun azimuth (compass, clockwise from north) and elevation in degrees. */
export function sunPosition(date, lat, lon) {
  const p = SunCalc.getPosition(date, lat, lon);
  // SunCalc measures azimuth from south, positive westward.
  return { azimuth: (p.azimuth * DEG + 540) % 360, elevation: p.altitude * DEG };
}

export function moonPosition(date, lat, lon) {
  const p = SunCalc.getMoonPosition(date, lat, lon);
  return { azimuth: (p.azimuth * DEG + 540) % 360, elevation: p.altitude * DEG };
}

/** Point on Earth where the sun is directly overhead. */
export function subsolarPoint(date) {
  const d = daysSinceJ2000(date);
  const L = 280.46 + 0.9856474 * d;
  const g = (357.528 + 0.9856003 * d) * RAD;
  const λ = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const ε = (23.439 - 4e-7 * d) * RAD;
  const dec = Math.asin(Math.sin(ε) * Math.sin(λ)) * DEG;
  const ra = Math.atan2(Math.cos(ε) * Math.sin(λ), Math.cos(λ)) * DEG;
  return { lat: dec, lon: normLon(ra - gmstDeg(d)) };
}

/** Point on Earth where the moon is directly overhead (geocentric; same low-precision model as SunCalc). */
export function sublunarPoint(date) {
  const d = daysSinceJ2000(date);
  const L = (218.316 + 13.176396 * d) * RAD;
  const M = (134.963 + 13.064993 * d) * RAD;
  const F = (93.272 + 13.22935 * d) * RAD;
  const l = L + 6.289 * RAD * Math.sin(M);
  const b = 5.128 * RAD * Math.sin(F);
  const e = 23.4397 * RAD;
  const dec = Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l)) * DEG;
  const ra = Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l)) * DEG;
  return { lat: dec, lon: normLon(ra - gmstDeg(d)) };
}

const PHASES = [
  [0.0625, 'New moon', '🌑'], [0.1875, 'Waxing crescent', '🌒'], [0.3125, 'First quarter', '🌓'],
  [0.4375, 'Waxing gibbous', '🌔'], [0.5625, 'Full moon', '🌕'], [0.6875, 'Waning gibbous', '🌖'],
  [0.8125, 'Last quarter', '🌗'], [0.9375, 'Waning crescent', '🌘'], [1.01, 'New moon', '🌑'],
];

export function moonPhase(date) {
  const { phase, fraction } = SunCalc.getMoonIllumination(date);
  const [, name, glyph] = PHASES.find(([limit]) => phase < limit);
  return { name, glyph, phase, illumination: fraction };
}

/** Sky condition for a sun elevation, using the standard twilight thresholds. */
export function skyCondition(elevation) {
  if (elevation > -0.833) return 'day';
  if (elevation > -6) return 'civil';
  if (elevation > -12) return 'nautical';
  if (elevation > -18) return 'astronomical';
  return 'night';
}

export const SKY_LABEL = {
  day: 'Daylight',
  civil: 'Civil twilight',
  nautical: 'Nautical twilight',
  astronomical: 'Astronomical twilight',
  night: 'Night',
};
