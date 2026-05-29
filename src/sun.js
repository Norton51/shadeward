import SunCalc from 'suncalc';

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/**
 * Sun position at a given lat/lon and time.
 * @returns { azimuthDeg, elevationDeg }
 *   - azimuthDeg: 0 = north, 90 = east, 180 = south, 270 = west (clockwise from N).
 *   - elevationDeg: above horizon, negative = below.
 *
 * Note: SunCalc returns azimuth measured from SOUTH, going westward (positive west).
 * We convert to the more conventional "from NORTH clockwise" used in aviation.
 */
export function sunPositionAt(date, lat, lon) {
  const pos = SunCalc.getPosition(date, lat, lon);
  // pos.azimuth: radians, from south, clockwise looking down (so west is positive).
  // Convert to compass azimuth from north, clockwise.
  let azimuthDeg = pos.azimuth * RAD + 180;
  azimuthDeg = ((azimuthDeg % 360) + 360) % 360;
  const elevationDeg = pos.altitude * RAD;
  return { azimuthDeg, elevationDeg };
}

/**
 * Sun position relative to the aircraft cabin.
 *
 * @param {number} sunAzimuthDeg - compass azimuth (from N, CW)
 * @param {number} sunElevationDeg - above horizon
 * @param {number} aircraftHeadingDeg - direction the nose is pointing (from N, CW)
 * @returns {Object}
 *   - relativeBearingDeg: [-180, 180]. 0 = ahead, 90 = right wing, -90 = left wing, ±180 = behind.
 *   - elevationDeg: same as sun elevation (cabin is level for our purposes).
 *   - side: 'left' | 'right' | 'ahead' | 'behind' | 'below'
 *   - isVisible: sun above the horizon (>-0.83° accounting for refraction)
 *   - throughWindow: object describing which window seat sees the sun, if any
 */
export function sunRelativeToCabin(sunAzimuthDeg, sunElevationDeg, aircraftHeadingDeg) {
  let rel = sunAzimuthDeg - aircraftHeadingDeg;
  // Normalize to [-180, 180]
  rel = ((rel + 540) % 360) - 180;

  const isVisible = sunElevationDeg > -0.83;

  let side;
  if (!isVisible) {
    side = 'below';
  } else if (Math.abs(rel) < 30) {
    side = 'ahead';
  } else if (Math.abs(rel) > 150) {
    side = 'behind';
  } else if (rel > 0) {
    side = 'right';
  } else {
    side = 'left';
  }

  // Through which window? Side windows have widest viewing angle.
  // We model the cabin as offering visibility roughly:
  //   - forward windows (cockpit, but not for passengers): bearing ±0..20°
  //   - side windows (rows of seats): bearing ±40..140°, this is most relevant for passengers
  //   - rear: ±160..180°, basically never visible to passengers
  // Vertical visibility through a side window is roughly -20° to +60° elevation
  // (you can lean to see up; can't see straight down through floor).
  const absRel = Math.abs(rel);
  let throughWindow = null;
  if (isVisible && absRel >= 30 && absRel <= 150) {
    // In the lateral viewing arc
    if (sunElevationDeg >= -10 && sunElevationDeg <= 75) {
      throughWindow = {
        side: rel > 0 ? 'right' : 'left',
        // Position along the cabin (forward, middle, rear) depends on the bearing magnitude.
        position: absRel < 70 ? 'forward' : absRel > 110 ? 'rear' : 'middle',
      };
    }
  }

  return {
    relativeBearingDeg: rel,
    elevationDeg: sunElevationDeg,
    side,
    isVisible,
    throughWindow,
  };
}

/**
 * Find moonrise/moonset crossings along a sampled flight that are actually
 * observable — i.e. the crossing happens during night (sun below horizon)
 * and the moon is bright enough to see (≥15% illuminated).
 * Returns an array of { t, type: 'moonrise' | 'moonset', lat, lon, utc }.
 */
export function findMoonEvents(samples) {
  const events = [];
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const curr = samples[i];
    const prevAlt = SunCalc.getMoonPosition(prev.utc, prev.lat, prev.lon).altitude;
    const currAlt = SunCalc.getMoonPosition(curr.utc, curr.lat, curr.lon).altitude;

    let type = null;
    let f    = 0;
    if (prevAlt <= 0 && currAlt > 0) {
      type = 'moonrise';
      f    = -prevAlt / (currAlt - prevAlt);
    } else if (prevAlt > 0 && currAlt <= 0) {
      type = 'moonset';
      f    = prevAlt / (prevAlt - currAlt);
    }
    if (!type) continue;

    const t   = prev.t + f * (curr.t - prev.t);
    const utc = new Date(prev.utc.getTime() + f * (curr.utc.getTime() - prev.utc.getTime()));

    // Only relevant during night — skip if sun is above the horizon at this time/position.
    const sunElev = sunPositionAt(utc, prev.lat, prev.lon).elevationDeg;
    if (sunElev >= 0) continue;

    // Only relevant if the moon is bright enough to actually see.
    const illumination = SunCalc.getMoonIllumination(utc).fraction;
    if (illumination < 0.15) continue;

    events.push({ t, type, lat: prev.lat, lon: prev.lon, utc });
  }
  return events;
}

/**
 * Find sunrise/sunset crossings along a sampled flight.
 * Returns an array of { t, type: 'sunrise' | 'sunset', lat, lon, utc }.
 */
export function findSolarEvents(samples) {
  const events = [];
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const curr = samples[i];
    const prevSun = sunPositionAt(prev.utc, prev.lat, prev.lon);
    const currSun = sunPositionAt(curr.utc, curr.lat, curr.lon);

    // Horizon crossing
    if (prevSun.elevationDeg <= 0 && currSun.elevationDeg > 0) {
      // Linear interpolation in time for crossing
      const f = -prevSun.elevationDeg / (currSun.elevationDeg - prevSun.elevationDeg);
      const t = prev.t + f * (curr.t - prev.t);
      const utc = new Date(prev.utc.getTime() + f * (curr.utc.getTime() - prev.utc.getTime()));
      events.push({ t, type: 'sunrise', lat: prev.lat, lon: prev.lon, utc });
    } else if (prevSun.elevationDeg > 0 && currSun.elevationDeg <= 0) {
      const f = prevSun.elevationDeg / (prevSun.elevationDeg - currSun.elevationDeg);
      const t = prev.t + f * (curr.t - prev.t);
      const utc = new Date(prev.utc.getTime() + f * (curr.utc.getTime() - prev.utc.getTime()));
      events.push({ t, type: 'sunset', lat: prev.lat, lon: prev.lon, utc });
    }
  }
  return events;
}

/**
 * Aggregate which side gets the sun most, weighted by visible time.
 * Used to recommend a seat side.
 */
export function recommendSide(samples) {
  let leftSec = 0;
  let rightSec = 0;
  let parallelSec = 0;
  let nightSec = 0;
  let totalSec = 0;

  for (let i = 0; i < samples.length - 1; i++) {
    const s = samples[i];
    const next = samples[i + 1];
    const dt = next.t - s.t;
    const sun = sunPositionAt(s.utc, s.lat, s.lon);
    const cabin = sunRelativeToCabin(sun.azimuthDeg, sun.elevationDeg, s.heading);

    totalSec += dt;
    if (!cabin.isVisible) {
      nightSec += dt;
    } else if (cabin.side === 'left') {
      leftSec += dt;
    } else if (cabin.side === 'right') {
      rightSec += dt;
    } else {
      parallelSec += dt;
    }
  }

  const daySec          = totalSec - nightSec;
  const sideSec         = leftSec + rightSec;
  // Sun "ahead or behind" when most daylight time it's within ±30° of nose/tail.
  const sunParallel     = daySec > 0 && sideSec / daySec < 0.25;

  let recommendation;
  if (nightSec / totalSec > 0.7) {
    recommendation = 'either (mostly night)';
  } else if (sunParallel) {
    recommendation = 'either (sun flies parallel — little side window exposure)';
  } else if (leftSec > rightSec * 1.3) {
    recommendation = 'right (shaded)';
  } else if (rightSec > leftSec * 1.3) {
    recommendation = 'left (shaded)';
  } else {
    recommendation = 'either (sun shifts sides)';
  }

  return { leftSec, rightSec, parallelSec, nightSec, totalSec, recommendation };
}
