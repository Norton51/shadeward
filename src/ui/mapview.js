import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre runs tile parsing in a module worker; let Vite bundle it and tell MapLibre where it is.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { RAD, DEG, normLon } from '../lib/geo.js';
import { subsolarPoint, sublunarPoint, sunPosition, moonPosition, moonPhase, skyCondition, SKY_LABEL } from '../lib/astro.js';
import { esc } from './dom.js';

// OpenFreeMap: free vector tiles, no API key, no usage limits (https://openfreemap.org).
maplibregl.setWorkerUrl(workerUrl);

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

// Used if the basemap can't be fetched, so the route and day/night shading still render.
const FALLBACK_STYLE = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e9e5dc' } }],
};

const MAX_LAT = 85;
const MERC_LAT = 85.0511; // latitude where Web Mercator's square world ends

// ── Day/night geometry ──────────────────────────────────────────────────────

/**
 * Latitude interval [lo, hi] along meridian `lon` where the body overhead at
 * `sub` is below (or above) `elevation` degrees. A cap of the sphere meets a
 * meridian in at most one arc, so one interval (or none) is enough.
 */
function latInterval(sub, lon, elevation, below) {
  const A = Math.sin(sub.lat * RAD);
  const B = Math.cos(sub.lat * RAD) * Math.cos((lon - sub.lon) * RAD);
  const s = Math.sin(elevation * RAD);
  const inside = (φ) => (A * Math.sin(φ) + B * Math.cos(φ) < s) === below;

  const cuts = [-Math.PI / 2, Math.PI / 2];
  const R = Math.hypot(A, B);
  if (R > Math.abs(s)) {
    const ψ = Math.atan2(B, A);
    const base = Math.asin(s / R);
    for (const raw of [base - ψ, Math.PI - base - ψ]) {
      const φ = Math.atan2(Math.sin(raw), Math.cos(raw));
      if (Math.abs(φ) < Math.PI / 2) cuts.push(φ);
    }
  }
  cuts.sort((a, b) => a - b);

  let lo = null, hi = null;
  for (let i = 0; i < cuts.length - 1; i++) {
    if (inside((cuts[i] + cuts[i + 1]) / 2)) { lo ??= cuts[i]; hi = cuts[i + 1]; }
  }
  if (lo === null) return null;
  lo = Math.max(-MAX_LAT, lo * DEG);
  hi = Math.min(MAX_LAT, hi * DEG);
  return lo < hi ? [lo, hi] : null;
}

/**
 * Day/night shading, painted per pixel for the part of the world on screen so
 * it stays crisp at every zoom. Darkness steps in at sunset (−0.833°) and
 * deepens to the end of astronomical twilight (−18°); where it is dark and the
 * moon is up, the shade is lifted and tinted to suggest moonlight.
 */
const sinD = (d) => Math.sin(d * RAD);
const S_SET = sinD(-0.833);
const S_DARK = sinD(-18);
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2));

/**
 * @param lons  pixel-centre longitudes (radians), one per column
 * @param lats  pixel-centre latitudes (radians), one per row
 * @param edge  width of the sunset edge in sin(elevation) units, about one pixel,
 *              so the terminator is anti-aliased instead of stair-stepped
 */
function paintShade(img, lons, lats, sub, lunar, glow, edge) {
  const data = img.data;
  const sδ = Math.sin(sub.lat * RAD), cδ = Math.cos(sub.lat * RAD);
  const mδs = Math.sin(lunar.lat * RAD), mδc = Math.cos(lunar.lat * RAD);
  const sunCos = lons.map((λ) => Math.cos(λ - sub.lon * RAD));
  const moonCos = lons.map((λ) => Math.cos(λ - lunar.lon * RAD));
  const W = lons.length;
  let i = 0;
  for (const φ of lats) {
    const sφ = Math.sin(φ), cφ = Math.cos(φ);
    const a = sφ * sδ, b = cφ * cδ, ma = sφ * mδs, mb = cφ * mδc;
    for (let c = 0; c < W; c++, i += 4) {
      const sinEl = a + b * sunCos[c];
      const below = S_SET - sinEl;
      if (below <= -edge) { data[i + 3] = 0; continue; }
      const step = below >= edge ? 1 : (below + edge) / (2 * edge);
      const t = below <= 0 ? 0 : Math.min(1, below / (S_SET - S_DARK));
      let moon = 0;
      if (glow && t > 0.4) {
        const m = (ma + mb * moonCos[c]) * 4;
        if (m > 0) moon = (glow * (m > 1 ? 1 : m) * (t - 0.4)) / 0.6;
      }
      data[i] = 13 + 110 * moon;
      data[i + 1] = 27 + 120 * moon;
      data[i + 2] = 61 + 150 * moon;
      // A visible step at sunset, deepening through twilight.
      data[i + 3] = (40 * step + 115 * t) * (1 - 0.3 * moon);
    }
  }
}

// ── GeoJSON helpers ─────────────────────────────────────────────────────────

const collection = (features) => ({ type: 'FeatureCollection', features });
const point = (lon, lat, properties = {}) => ({ type: 'Feature', properties, geometry: { type: 'Point', coordinates: [lon, lat] } });
const line = (coords) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } });
const EMPTY = collection([]);

const fmtLat = (v) => `${Math.abs(v).toFixed(1)}°${v >= 0 ? 'N' : 'S'}`;
const fmtLon = (v) => `${Math.abs(normLon(v)).toFixed(1)}°${normLon(v) >= 0 ? 'E' : 'W'}`;

// ── Icons (drawn to canvas so they render as map symbols on every world copy) ─

const PIXEL_RATIO = 2;

function canvasIcon(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size * PIXEL_RATIO;
  const ctx = c.getContext('2d');
  ctx.scale(PIXEL_RATIO, PIXEL_RATIO);
  ctx.translate(size / 2, size / 2);
  draw(ctx);
  return ctx.getImageData(0, 0, c.width, c.height);
}

const PLANE_PATH = 'M0-14c1.4 0 2 1.3 2 3v6.5l11 6.3v2.7L2 1v6.6l3.6 2.8v2.3L0 11.2l-5.6 1.5v-2.3L-2 7.6V1l-11 3.5V1.8l11-6.3V-11c0-1.7.6-3 2-3z';

const planeIcon = () => canvasIcon(36, (ctx) => {
  ctx.shadowColor = 'rgba(0,0,0,.35)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1;
  const p = new Path2D(PLANE_PATH);
  ctx.fillStyle = '#1c2230';
  ctx.fill(p);
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.2;
  ctx.stroke(p);
});

const sunIcon = () => canvasIcon(30, (ctx) => {
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 15);
  g.addColorStop(0, '#ffd43b');
  g.addColorStop(0.38, '#ffd43b');
  g.addColorStop(0.4, 'rgba(255,212,59,.45)');
  g.addColorStop(1, 'rgba(255,212,59,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, Math.PI * 2);
  ctx.fill();
});

/** Moon disc with the lit fraction drawn for `phase` (0 new → 0.5 full → 1 new), as seen from the north. */
const moonIcon = (phase) => canvasIcon(24, (ctx) => {
  const r = 8;
  ctx.shadowColor = 'rgba(140,160,230,.9)';
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#4a5370';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';

  let p = phase;
  if (p > 0.5) { ctx.scale(-1, 1); p = 1 - p; } // waning: mirror so the lit limb is on the left
  const rx = r * Math.abs(Math.cos(2 * Math.PI * p));
  ctx.fillStyle = '#f1f3fb';
  ctx.beginPath();
  ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);                     // lit limb, top → right → bottom
  ctx.ellipse(0, 0, rx, r, 0, Math.PI / 2, -Math.PI / 2, p < 0.25); // terminator back to the top
  ctx.fill();
});

// ── Map ─────────────────────────────────────────────────────────────────────

export class MapView {
  /** @param overlays elements floating over the map that a fitted route should avoid */
  constructor(el, overlays = []) {
    this.el = el;
    this.overlays = overlays;
    this.ready = false;
    this.samples = null;
    this.state = null;
    this.utc = new Date();
    this.airports = { from: null, to: null };
    this.moonKey = '';
    this.shadeCanvas = Object.assign(document.createElement('canvas'), { width: 2, height: 2 });
    this.shadeCtx = this.shadeCanvas.getContext('2d');
    this.shadeImg = null;

    this.map = new maplibregl.Map({
      container: el,
      style: STYLE_URL,
      center: [0, 25],
      zoom: 1,
      minZoom: 0.5,
      maxZoom: 12,
      renderWorldCopies: true,
      dragRotate: false,
      pitchWithRotate: false,
      // On touch screens, one finger scrolls the page and two fingers move the map.
      cooperativeGestures: matchMedia('(pointer: coarse)').matches,
      attributionControl: { compact: true },
    });
    this.map.touchZoomRotate.disableRotation();
    this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    this.map.on('style.load', () => this._init());
    this.map.on('error', (e) => {
      if (this.ready || this.fellBack) return console.error('Map error:', e.error?.message ?? e);
      console.warn('Basemap unavailable, continuing without it:', e.error?.message ?? e);
      this.fellBack = true;
      this.map.setStyle(FALLBACK_STYLE, { diff: false });
    });
    this.map.on('click', (e) => this._click(e));
  }

  setAirports(from, to) {
    this.airports = { from, to };
    if (this.ready) this._drawAirports();
    if (from && to) {
      const toLon = from.lon + normLon(to.lon - from.lon);
      this._fit([[from.lon, from.lat], [toLon, to.lat]], 5);
    } else if (from || to) {
      const a = from || to;
      this.map.easeTo({ center: [a.lon, a.lat], zoom: Math.max(this.map.getZoom(), 3.5) });
    }
  }

  /** samples: analyzed flight samples (unwrapped longitudes), or null to clear the route. */
  setFlight(samples) {
    this.samples = samples;
    this.state = null;
    if (this.ready) this._drawRoute();
    if (samples) this._fit(samples.map((s) => [s.lon, s.lat]), 6);
  }

  /** Redraw time-dependent layers; `state` is the aircraft state at `utc`, if a flight is loaded. */
  setTime(utc, state) {
    this.utc = utc;
    this.state = state ?? null;
    if (this.ready) { this._drawSky(); this._drawRoute(); }
  }

  invalidate() { this.map.resize(); }

  _init() {
    if (this.ready) return;
    const map = this.map;
    map.addImage('plane', planeIcon(), { pixelRatio: PIXEL_RATIO });
    map.addImage('sun', sunIcon(), { pixelRatio: PIXEL_RATIO });

    for (const id of ['terminator', 'sky-bodies', 'flown', 'ahead', 'plane', 'airports']) {
      map.addSource(id, { type: 'geojson', data: EMPTY });
    }

    // Shading sits under the basemap's labels so place names stay legible at night.
    const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
    map.addSource('shade', {
      type: 'canvas',
      canvas: this.shadeCanvas,
      animate: false,
      coordinates: [[-180, MERC_LAT], [180, MERC_LAT], [180, -MERC_LAT], [-180, -MERC_LAT]], // replaced per view
    });
    map.addLayer({ id: 'shade', type: 'raster', source: 'shade', paint: { 'raster-fade-duration': 0, 'raster-resampling': 'linear' } }, firstLabel);
    // The shading covers only the visible area, so repaint it as the view changes.
    map.on('move', () => this._paintShade());
    map.on('resize', () => this._paintShade());
    map.addLayer({ id: 'terminator', type: 'line', source: 'terminator', paint: { 'line-color': '#f2a93b', 'line-width': 1.25, 'line-opacity': 0.8 } }, firstLabel);

    map.addLayer({ id: 'flown', type: 'line', source: 'flown', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#e8590c', 'line-width': 3 } });
    map.addLayer({ id: 'ahead', type: 'line', source: 'ahead', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#e8590c', 'line-width': 2, 'line-opacity': 0.75, 'line-dasharray': [0.1, 3] } });
    map.addLayer({ id: 'sky-bodies', type: 'symbol', source: 'sky-bodies', layout: { 'icon-image': ['get', 'icon'], 'icon-allow-overlap': true, 'icon-ignore-placement': true }, paint: { 'icon-opacity': ['get', 'opacity'] } });
    map.addLayer({ id: 'airport-dots', type: 'circle', source: 'airports', paint: { 'circle-radius': 5, 'circle-color': '#fff', 'circle-stroke-color': '#e8590c', 'circle-stroke-width': 3 } });
    // Labels need the basemap's fonts, which the fallback style doesn't have.
    if (map.getStyle().glyphs) map.addLayer({
      id: 'airport-codes', type: 'symbol', source: 'airports',
      layout: { 'text-field': ['get', 'iata'], 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-anchor': 'left', 'text-offset': [0.9, 0], 'text-allow-overlap': true },
      paint: { 'text-color': '#1c2230', 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
    });
    map.addLayer({ id: 'plane', type: 'symbol', source: 'plane', layout: { 'icon-image': 'plane', 'icon-rotate': ['get', 'heading'], 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true } });

    map.on('mouseenter', 'airport-dots', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'airport-dots', () => { map.getCanvas().style.cursor = ''; });

    this.ready = true;
    this._drawAirports();
    this._drawSky();
    this._drawRoute();
  }

  _drawAirports() {
    const { from, to } = this.airports;
    const features = [];
    if (from) features.push(point(from.lon, from.lat, { ...from, role: 'Departure' }));
    if (to) features.push(point(to.lon, to.lat, { ...to, role: 'Arrival' }));
    this.map.getSource('airports').setData(collection(features));
  }

  _drawSky() {
    const utc = this.utc;
    const sub = subsolarPoint(utc);
    const lunar = sublunarPoint(utc);

    const terminator = [];
    for (let lon = -180; lon <= 180; lon += 0.25) {
      const iv = latInterval(sub, lon, -0.833, true);
      if (iv) terminator.push([lon, sub.lat > 0 ? iv[1] : iv[0]]);
    }
    this.map.getSource('terminator').setData(line(terminator));

    const phase = moonPhase(utc);
    this.sky = { sub, lunar, glow: Math.max(0, (phase.illumination - 0.25) / 0.75) };
    this._paintShade();

    // Redraw the moon icon only when its shape visibly changes.
    const key = phase.phase.toFixed(2);
    if (key !== this.moonKey) {
      const img = moonIcon(phase.phase);
      if (this.map.hasImage('moon')) this.map.updateImage('moon', img);
      else this.map.addImage('moon', img, { pixelRatio: PIXEL_RATIO });
      this.moonKey = key;
    }
    this.map.getSource('sky-bodies').setData(collection([
      point(sub.lon, sub.lat, { icon: 'sun', opacity: 1 }),
      point(lunar.lon, lunar.lat, { icon: 'moon', opacity: 0.5 + 0.5 * phase.illumination }),
    ]));
  }

  /**
   * Paint the shading for the current view at up to screen resolution. When the
   * view shows more than one world, paint one world and let MapLibre repeat it.
   */
  _paintShade() {
    if (!this.ready || !this.sky) return;
    const map = this.map;
    const { clientWidth: cssW, clientHeight: cssH } = map.getContainer();
    if (!cssW || !cssH) return;
    const bounds = map.getBounds();
    let west = bounds.getWest(), east = bounds.getEast();
    const north = Math.min(bounds.getNorth(), MERC_LAT), south = Math.max(bounds.getSouth(), -MERC_LAT);
    if (north <= south) return;
    let pxPerLon = cssW / (east - west);
    if (east - west >= 360) { west = -180; east = 180; }

    // Cap the work at roughly 600k pixels; bilinear filtering hides the rest.
    const yN = mercY(north), yS = mercY(south);
    const spanX = (east - west) * RAD;
    let W = Math.round((east - west) * pxPerLon);
    let H = Math.round(W * ((yN - yS) / spanX));
    const scale = Math.min(1, Math.sqrt(600000 / Math.max(1, W * H)));
    W = Math.max(2, Math.round(W * scale));
    H = Math.max(2, Math.round(H * scale));

    if (this.shadeCanvas.width !== W || this.shadeCanvas.height !== H) {
      this.shadeCanvas.width = W;
      this.shadeCanvas.height = H;
      this.shadeImg = this.shadeCtx.createImageData(W, H);
    }
    const lons = Array.from({ length: W }, (_, c) => (west + ((east - west) * (c + 0.5)) / W) * RAD);
    const lats = Array.from({ length: H }, (_, r) => Math.atan(Math.sinh(yN + ((yS - yN) * (r + 0.5)) / H)));
    // One pixel of longitude at the equator, as a change in sin(elevation).
    const edge = Math.max(1e-4, Math.sin(spanX / W));
    const { sub, lunar, glow } = this.sky;
    paintShade(this.shadeImg, lons, lats, sub, lunar, glow, edge);
    this.shadeCtx.putImageData(this.shadeImg, 0, 0);

    const src = map.getSource('shade');
    src.setCoordinates([[west, north], [east, north], [east, south], [west, south]]);
    this._refreshShade();
  }

  /** A paused canvas source only re-reads its canvas while playing; play for a couple of frames. */
  _refreshShade() {
    const src = this.map.getSource('shade');
    src.play();
    cancelAnimationFrame(this.shadePause);
    this.shadePause = requestAnimationFrame(() => {
      this.shadePause = requestAnimationFrame(() => src.pause());
    });
  }

  _drawRoute() {
    const samples = this.samples;
    const s = this.state;
    if (!samples) {
      for (const id of ['flown', 'ahead', 'plane']) this.map.getSource(id).setData(EMPTY);
      return;
    }
    const coords = samples.map((x) => [x.lon, x.lat]);
    if (!s) {
      this.map.getSource('flown').setData(EMPTY);
      this.map.getSource('ahead').setData(line(coords));
      this.map.getSource('plane').setData(EMPTY);
      return;
    }
    const idx = samples.findIndex((x) => x.t > s.t);
    const cut = idx < 0 ? samples.length : idx;
    const here = [s.lon, s.lat];
    this.map.getSource('flown').setData(line([...coords.slice(0, cut), here]));
    this.map.getSource('ahead').setData(line([here, ...coords.slice(cut)]));
    this.map.getSource('plane').setData(collection([point(s.lon, s.lat, { heading: s.heading })]));
  }

  /** Fit coordinates (longitudes may run past ±180) clear of the overlays. */
  _fit(coords, maxZoom) {
    const lons = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    const bounds = [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]];
    this.map.fitBounds(bounds, { padding: this._fitPadding(), maxZoom, duration: 600 });
  }

  /** Padding that keeps a fitted route clear of the overlays docked along the map's edges. */
  _fitPadding() {
    const box = this.el.getBoundingClientRect();
    const pad = { top: 40, right: 40, bottom: 40, left: 40 };
    for (const o of this.overlays) {
      if (o.hidden) continue;
      const r = o.getBoundingClientRect();
      // How far the overlay reaches in from each edge it is docked against
      // (within 40px of it). A card in a corner touches two edges; pad the one
      // that costs less room, e.g. the right edge for a tall card top-right.
      const reach = {
        top: [r.top - box.top, r.bottom - box.top, box.height],
        bottom: [box.bottom - r.bottom, box.bottom - r.top, box.height],
        left: [r.left - box.left, r.right - box.left, box.width],
        right: [box.right - r.right, box.right - r.left, box.width],
      };
      const options = Object.entries(reach)
        .filter(([, [gap, depth, span]]) => gap <= 40 && depth < span * 0.6)
        .sort((a, b) => a[1][1] / a[1][2] - b[1][1] / b[1][2]);
      if (!options.length) continue;
      const [edge, [, depth]] = options[0];
      pad[edge] = Math.max(pad[edge], depth + 16);
    }
    return pad;
  }

  _click(e) {
    const airport = this.ready && this.map.queryRenderedFeatures(e.point, { layers: ['airport-dots'] })[0];
    let html;
    if (airport) {
      const a = airport.properties;
      html = `<strong>${esc(a.iata)}</strong> · ${esc(a.role)}<br>${esc(a.name)}<br><span class="muted">${esc(a.city)}, ${esc(a.countryName)} · ${fmtLat(+a.lat)} ${fmtLon(+a.lon)}</span>`;
    } else {
      const lat = e.lngLat.lat;
      const lon = normLon(e.lngLat.lng);
      const sun = sunPosition(this.utc, lat, lon);
      const sky = skyCondition(sun.elevation);
      html = `<strong>${SKY_LABEL[sky]}</strong><br>Sun ${Math.round(sun.elevation)}° ${sun.elevation >= 0 ? 'above' : 'below'} the horizon`;
      if (sky !== 'day') {
        const moon = moonPosition(this.utc, lat, lon);
        const phase = moonPhase(this.utc);
        html += `<br><span class="muted">${phase.glyph} ${phase.name}, ${Math.round(phase.illumination * 100)}% lit · ${moon.elevation > 0 ? `${Math.round(moon.elevation)}° up` : 'below the horizon'}</span>`;
      }
      html += `<br><span class="muted">${fmtLat(lat)} ${fmtLon(lon)}</span>`;
    }
    new maplibregl.Popup({ className: 'sky-popup', maxWidth: '260px' }).setLngLat(e.lngLat).setHTML(html).addTo(this.map);
  }
}
