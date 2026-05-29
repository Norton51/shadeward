// Great-circle (geodesic) math on a spherical Earth.
// Accuracy is sufficient for sun-position purposes; ellipsoid correction is <0.5% on path length.

const R_EARTH_KM = 6371;
const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/** Normalize any longitude to [-180, 180]. */
export function normLon(lon) {
  return ((lon % 360) + 540) % 360 - 180;
}

/**
 * Great-circle distance between two lat/lon points, in kilometers.
 */
export function greatCircleDistanceKm(lat1, lon1, lat2, lon2) {
  const φ1 = lat1 * DEG;
  const φ2 = lat2 * DEG;
  const Δφ = (lat2 - lat1) * DEG;
  const Δλ = (lon2 - lon1) * DEG;

  const a = Math.sin(Δφ / 2) ** 2 +
            Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R_EARTH_KM * c;
}

/**
 * Initial bearing (heading) at point 1 toward point 2, in degrees from true north, clockwise.
 * On a great circle, this changes continuously, so we recompute at each sample.
 */
export function initialBearingDeg(lat1, lon1, lat2, lon2) {
  const φ1 = lat1 * DEG;
  const φ2 = lat2 * DEG;
  const Δλ = (lon2 - lon1) * DEG;

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) -
            Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  return (Math.atan2(y, x) * RAD + 360) % 360;
}

/**
 * Intermediate point on great circle between two coords.
 * @param {number} f - fraction [0, 1] from point 1 to point 2.
 */
export function intermediatePoint(lat1, lon1, lat2, lon2, f) {
  const φ1 = lat1 * DEG;
  const λ1 = lon1 * DEG;
  const φ2 = lat2 * DEG;
  const λ2 = lon2 * DEG;

  const Δφ = φ2 - φ1;
  const Δλ = λ2 - λ1;
  const a = Math.sin(Δφ / 2) ** 2 +
            Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const δ = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  // Antipodal or coincident edge cases
  if (δ === 0) return { lat: lat1, lon: lon1 };

  const A = Math.sin((1 - f) * δ) / Math.sin(δ);
  const B = Math.sin(f * δ) / Math.sin(δ);

  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);

  const φi = Math.atan2(z, Math.sqrt(x * x + y * y));
  const λi = Math.atan2(y, x);

  return { lat: φi * RAD, lon: ((λi * RAD + 540) % 360) - 180 };
}

/**
 * Estimate flight duration in hours from great-circle distance.
 * Assumes ~800 km/h cruise + ~30 min taxi/climb/descent overhead.
 */
export function estimateDurationHours(distanceKm) {
  const cruiseHours = distanceKm / 800;
  const overheadHours = 0.5;
  return Math.max(0.5, cruiseHours + overheadHours);
}

/**
 * Sample the flight path at regular time intervals.
 * Returns an array of { t, fraction, lat, lon, heading, altitudeM }.
 * Altitude follows a simple climb/cruise/descent profile.
 *
 * @param {Object} from - { lat, lon }
 * @param {Object} to - { lat, lon }
 * @param {Date} departUtc
 * @param {number} durationHours
 * @param {number} sampleSec - sampling interval in seconds (default 60)
 */
export function sampleFlight(from, to, departUtc, durationHours, sampleSec = 60) {
  const totalSec = durationHours * 3600;
  const samples = [];
  const numSamples = Math.ceil(totalSec / sampleSec) + 1;

  const cruiseAltM = 11000; // ~36,000 ft
  const climbFraction = 0.08;
  const descentFraction = 0.92;

  let prevLon = from.lon;

  for (let i = 0; i < numSamples; i++) {
    const t = Math.min(i * sampleSec, totalSec);
    const f = t / totalSec;

    const p = intermediatePoint(from.lat, from.lon, to.lat, to.lon, f);

    // Unwrap longitude to stay continuous across the antimeridian.
    // lon may exceed ±180; callers needing a geographic lon should normalize via normLon().
    while (p.lon - prevLon >  180) p.lon -= 360;
    while (p.lon - prevLon < -180) p.lon += 360;
    prevLon = p.lon;

    // Heading: bearing from current point toward destination.
    // Near arrival this becomes noisy, so fall back to bearing from a slightly earlier point.
    let heading;
    if (f < 0.995) {
      heading = initialBearingDeg(p.lat, p.lon, to.lat, to.lon);
    } else {
      const back = intermediatePoint(from.lat, from.lon, to.lat, to.lon, Math.max(0, f - 0.005));
      heading = initialBearingDeg(back.lat, back.lon, to.lat, to.lon);
    }

    // Altitude profile
    let altitudeM;
    if (f < climbFraction) {
      altitudeM = (f / climbFraction) * cruiseAltM;
    } else if (f < descentFraction) {
      altitudeM = cruiseAltM;
    } else {
      altitudeM = ((1 - f) / (1 - descentFraction)) * cruiseAltM;
    }

    samples.push({
      t,
      fraction: f,
      lat: p.lat,
      lon: p.lon,
      heading,
      altitudeM,
      utc: new Date(departUtc.getTime() + t * 1000),
    });
  }

  return samples;
}
