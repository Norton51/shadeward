// Spherical-earth great-circle helpers. Ellipsoidal error (<0.5%) is irrelevant
// for sun geometry, which only needs position to within a few kilometres.

export const RAD = Math.PI / 180;
export const DEG = 180 / Math.PI;
const R_EARTH_KM = 6371;

/** Wrap a longitude into [-180, 180). */
export function normLon(lon) {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/** Wrap an angle into [-180, 180). */
export const normAngle = normLon;

/** Central angle between two points, in radians. */
export function centralAngle(a, b) {
  const dφ = (b.lat - a.lat) * RAD;
  const dλ = (b.lon - a.lon) * RAD;
  const h = Math.sin(dφ / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dλ / 2) ** 2;
  return 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function distanceKm(a, b) {
  return centralAngle(a, b) * R_EARTH_KM;
}

/** Initial compass bearing from a to b, degrees clockwise from true north. */
export function bearing(a, b) {
  const φ1 = a.lat * RAD;
  const φ2 = b.lat * RAD;
  const dλ = (b.lon - a.lon) * RAD;
  const y = Math.sin(dλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  return (Math.atan2(y, x) * DEG + 360) % 360;
}

/**
 * A great-circle route between two points. `at(f)` returns the position and
 * heading at fraction f ∈ [0, 1]. Longitudes from `at` are unwrapped relative
 * to the origin so a path crossing the antimeridian stays continuous
 * (e.g. 179 → 181 rather than 179 → -179).
 */
export function greatCircle(from, to) {
  const δ = centralAngle(from, to);
  if (δ < 1e-9) throw new RangeError('Origin and destination are the same point.');
  if (Math.PI - δ < 1e-6) throw new RangeError('Origin and destination are antipodal; the route is undefined.');

  const φ1 = from.lat * RAD, λ1 = from.lon * RAD;
  const φ2 = to.lat * RAD, λ2 = to.lon * RAD;
  const p1 = [Math.cos(φ1) * Math.cos(λ1), Math.cos(φ1) * Math.sin(λ1), Math.sin(φ1)];
  const p2 = [Math.cos(φ2) * Math.cos(λ2), Math.cos(φ2) * Math.sin(λ2), Math.sin(φ2)];
  const sinδ = Math.sin(δ);

  const point = (f) => {
    const A = Math.sin((1 - f) * δ) / sinδ;
    const B = Math.sin(f * δ) / sinδ;
    const x = A * p1[0] + B * p2[0];
    const y = A * p1[1] + B * p2[1];
    const z = A * p1[2] + B * p2[2];
    const lat = Math.atan2(z, Math.hypot(x, y)) * DEG;
    let lon = Math.atan2(y, x) * DEG;
    // Unwrap relative to the origin: the route never spans more than 180° of longitude
    // from its start in the unwrapped frame because δ < 180°.
    lon = from.lon + normLon(lon - from.lon);
    return { lat, lon };
  };

  const EPS = 1e-4;
  return {
    distanceKm: δ * R_EARTH_KM,
    at(f) {
      f = Math.min(1, Math.max(0, f));
      const p = point(f);
      // Heading from a symmetric finite difference; one-sided at the endpoints.
      const a = point(Math.max(0, f - EPS));
      const b = point(Math.min(1, f + EPS));
      return { ...p, heading: bearing(a, b) };
    },
  };
}
