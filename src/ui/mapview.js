import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { GestureHandling } from 'leaflet-gesture-handling';
import 'leaflet-gesture-handling/dist/leaflet-gesture-handling.css';
import { RAD, DEG, normLon } from '../lib/geo.js';
import { subsolarPoint, sublunarPoint, sunPosition, moonPosition, moonPhase, skyCondition, SKY_LABEL } from '../lib/astro.js';
import { esc } from './dom.js';

L.Map.addInitHook('addHandler', 'gestureHandling', GestureHandling);

// Each overlay is drawn on three world copies so it survives panning across the antimeridian.
const COPIES = [-360, 0, 360];
const MAX_LAT = 85;

// Stacked shading: each threshold the sun is below darkens the map a little more.
const SHADES = [-0.833, -6, -12, -18];

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

/** Leaflet multipolygon covering every meridian's interval between start and end longitudes. */
function zone(intervalAt, start, end) {
  const polys = [];
  let top = [], bottom = [];
  const flush = () => {
    if (top.length > 1) polys.push([[...top, ...bottom.reverse()]]);
    top = []; bottom = [];
  };
  for (let lon = start; lon <= end; lon += 1) {
    const iv = intervalAt(lon);
    if (!iv) { flush(); continue; }
    top.push([iv[1], lon]);
    bottom.push([iv[0], lon]);
  }
  flush();
  return polys;
}

const intersect = (a, b) => {
  if (!a || !b) return null;
  const lo = Math.max(a[0], b[0]), hi = Math.min(a[1], b[1]);
  return lo < hi ? [lo, hi] : null;
};

const fmtLat = (v) => `${Math.abs(v).toFixed(1)}°${v >= 0 ? 'N' : 'S'}`;
const fmtLon = (v) => `${Math.abs(normLon(v)).toFixed(1)}°${normLon(v) >= 0 ? 'E' : 'W'}`;

function divIcon(html, size, className = '') {
  return L.divIcon({ html, className: `map-icon ${className}`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

const PLANE_SVG = `<svg viewBox="-16 -16 32 32" width="30" height="30" aria-hidden="true">
  <path d="M0-14c1.4 0 2 1.3 2 3v6.5l11 6.3v2.7L2 1v6.6l3.6 2.8v2.3L0 11.2l-5.6 1.5v-2.3L-2 7.6V1l-11 3.5V1.8l11-6.3V-11c0-1.7.6-3 2-3z"/></svg>`;

export class MapView {
  /** @param overlays elements floating over the map that a fitted route should avoid */
  constructor(el, overlays = []) {
    this.el = el;
    this.overlays = overlays;
    this.map = L.map(el, {
      worldCopyJump: true,
      minZoom: 2,
      maxBounds: [[-MAX_LAT, -Infinity], [MAX_LAT, Infinity]],
      maxBoundsViscosity: 1,
      gestureHandling: true,
      zoomControl: false,
      attributionControl: true,
    }).setView([25, 0], 2);
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);
    this.map.attributionControl.setPrefix(false);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 12,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · © <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(this.map);

    const pane = (name, z) => { this.map.createPane(name).style.zIndex = z; return name; };
    const shadePane = pane('shade', 350);
    const routePane = pane('route', 450);

    this.shades = SHADES.map(() => L.polygon([], { pane: shadePane, stroke: false, fillColor: '#0d1b3d', fillOpacity: 0.13, interactive: false }).addTo(this.map));
    this.moonlit = L.polygon([], { pane: shadePane, stroke: false, fillColor: '#b9c8ff', fillOpacity: 0, interactive: false }).addTo(this.map);
    this.terminator = L.polyline([], { pane: shadePane, color: '#f2a93b', weight: 1.25, opacity: 0.8, interactive: false }).addTo(this.map);

    this.flown = COPIES.map(() => L.polyline([], { pane: routePane, color: '#e8590c', weight: 3, opacity: 0.95, interactive: false }).addTo(this.map));
    this.ahead = COPIES.map(() => L.polyline([], { pane: routePane, color: '#e8590c', weight: 2, opacity: 0.7, dashArray: '2 6', lineCap: 'round', interactive: false }).addTo(this.map));

    this.sun = COPIES.map(() => L.marker([0, 0], { icon: divIcon('<span class="sun-dot"></span>', 26, 'sun-icon'), keyboard: false, interactive: false, zIndexOffset: 200 }).addTo(this.map));
    this.moon = COPIES.map(() => L.marker([0, 0], { icon: divIcon('', 22, 'moon-icon'), keyboard: false, interactive: false, zIndexOffset: 200 }).addTo(this.map));
    this.airports = [];
    this.planes = [];

    this.center = 0;
    this.samples = null;
    this.utc = new Date();
    this.map.on('click', (e) => this._explain(e.latlng));
    this.setTime(new Date());
  }

  setAirports(from, to) {
    for (const m of this.airports) m.remove();
    this.airports = [];
    for (const [a, role] of [[from, 'Departure'], [to, 'Arrival']]) {
      if (!a) continue;
      const lon = this._near(a.lon);
      for (const off of COPIES) {
        this.airports.push(L.marker([a.lat, lon + off], {
          icon: L.divIcon({ html: `<span class="ap-dot"></span><span class="ap-code">${esc(a.iata)}</span>`, className: 'map-icon ap-icon', iconSize: [12, 12], iconAnchor: [6, 6] }),
          title: `${a.iata} – ${a.name}`,
          zIndexOffset: 300,
        }).bindPopup(`<strong>${esc(a.iata)}</strong> · ${role}<br>${esc(a.name)}<br><span class="muted">${esc(a.city)}, ${esc(a.countryName)} · ${fmtLat(a.lat)} ${fmtLon(a.lon)}</span>`)
          .addTo(this.map));
      }
    }
    if (from && to) {
      this.map.fitBounds(L.latLngBounds([from.lat, this._near(from.lon)], [to.lat, this._near(to.lon)]), { padding: [60, 60] });
    } else if (from || to) {
      const a = from || to;
      this.map.setView([a.lat, a.lon], Math.max(this.map.getZoom(), 4));
    }
  }

  /** samples: analyzed flight samples (unwrapped longitudes), or null to clear the route. */
  setFlight(samples) {
    this.samples = samples;
    for (const p of this.planes) p.remove();
    this.planes = [];
    if (!samples) {
      for (const l of [...this.flown, ...this.ahead]) l.setLatLngs([]);
      return;
    }
    const lons = samples.map((s) => s.lon);
    this.center = (Math.min(...lons) + Math.max(...lons)) / 2;
    this.planes = COPIES.map(() => L.marker([0, 0], { icon: divIcon(PLANE_SVG, 30, 'plane-icon'), interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(this.map));
    const bounds = L.latLngBounds(samples.map((s) => [s.lat, s.lon]));
    this.map.fitBounds(bounds, { ...this._fitPadding(), maxZoom: 6 });
  }

  /** Padding that keeps a fitted route clear of the overlays docked along the map's edges. */
  _fitPadding() {
    const box = this.el.getBoundingClientRect();
    const pad = { top: 40, right: 40, bottom: 40, left: 40 };
    for (const o of this.overlays) {
      if (o.hidden) continue;
      const r = o.getBoundingClientRect();
      // Attribute each overlay to the map edge it hugs most closely.
      const gaps = { top: r.top - box.top, bottom: box.bottom - r.bottom, left: r.left - box.left, right: box.right - r.right };
      const edge = Object.keys(gaps).reduce((a, b) => (gaps[a] <= gaps[b] ? a : b));
      const depth = edge === 'top' ? r.bottom - box.top : edge === 'bottom' ? box.bottom - r.top
        : edge === 'left' ? r.right - box.left : box.right - r.left;
      // Ignore overlays so wide or tall that avoiding them would leave no room.
      const span = edge === 'top' || edge === 'bottom' ? box.height : box.width;
      if (depth < span * 0.45) pad[edge] = Math.max(pad[edge], depth + 16);
    }
    return { paddingTopLeft: [pad.left, pad.top], paddingBottomRight: [pad.right, pad.bottom] };
  }

  /** Redraw time-dependent layers; `state` is the aircraft state at `utc`, if a flight is loaded. */
  setTime(utc, state) {
    this.utc = utc;
    const sub = subsolarPoint(utc);
    const lunar = sublunarPoint(utc);
    const start = Math.round(this.center) - 540;
    const end = Math.round(this.center) + 540;

    SHADES.forEach((elev, i) => this.shades[i].setLatLngs(zone((lon) => latInterval(sub, lon, elev, true), start, end)));

    const terminator = [];
    for (let lon = start; lon <= end; lon += 1) {
      const iv = latInterval(sub, lon, -0.833, true);
      if (iv) terminator.push([sub.lat > 0 ? iv[1] : iv[0], lon]);
    }
    this.terminator.setLatLngs(terminator);

    const phase = moonPhase(utc);
    const glow = Math.max(0, (phase.illumination - 0.25) / 0.75);
    this.moonlit.setLatLngs(glow ? zone((lon) => intersect(latInterval(sub, lon, -12, true), latInterval(lunar, lon, 0, false)), start, end) : []);
    this.moonlit.setStyle({ fillOpacity: glow * 0.16 });

    const moonKey = `${phase.glyph}${(0.45 + 0.55 * phase.illumination).toFixed(1)}`;
    const moonIcon = moonKey !== this.moonKey && divIcon(`<span class="moon-glyph" style="opacity:${moonKey.slice(-3)}">${phase.glyph}</span>`, 22, 'moon-icon');
    this.moonKey = moonKey;
    COPIES.forEach((off, i) => {
      this.sun[i].setLatLng([sub.lat, this._near(sub.lon) + off]);
      this.moon[i].setLatLng([lunar.lat, this._near(lunar.lon) + off]);
      if (moonIcon) this.moon[i].setIcon(moonIcon);
    });

    if (state && this.samples) {
      const idx = this.samples.findIndex((s) => s.t > state.t);
      const cut = idx < 0 ? this.samples.length : idx;
      const here = [state.lat, state.lon];
      const flown = [...this.samples.slice(0, cut).map((s) => [s.lat, s.lon]), here];
      const ahead = [here, ...this.samples.slice(cut).map((s) => [s.lat, s.lon])];
      COPIES.forEach((off, i) => {
        this.flown[i].setLatLngs(flown.map(([a, b]) => [a, b + off]));
        this.ahead[i].setLatLngs(ahead.map(([a, b]) => [a, b + off]));
        this.planes[i].setLatLng([state.lat, state.lon + off]);
        const svg = this.planes[i].getElement()?.querySelector('svg');
        if (svg) svg.style.transform = `rotate(${state.heading}deg)`;
      });
    }
  }

  invalidate() { this.map.invalidateSize(); }

  /** Longitude shifted by whole turns to sit nearest the current map centre longitude. */
  _near(lon) {
    return this.center + normLon(lon - this.center);
  }

  _explain(latlng) {
    const lon = normLon(latlng.lng);
    const sun = sunPosition(this.utc, latlng.lat, lon);
    const sky = skyCondition(sun.elevation);
    let html = `<strong>${SKY_LABEL[sky]}</strong><br>Sun ${Math.round(sun.elevation)}° ${sun.elevation >= 0 ? 'above' : 'below'} the horizon`;
    if (sky !== 'day') {
      const moon = moonPosition(this.utc, latlng.lat, lon);
      const phase = moonPhase(this.utc);
      html += `<br><span class="muted">${phase.glyph} ${phase.name}, ${Math.round(phase.illumination * 100)}% lit · ${moon.elevation > 0 ? `${Math.round(moon.elevation)}° up` : 'below the horizon'}</span>`;
    }
    html += `<br><span class="muted">${fmtLat(latlng.lat)} ${fmtLon(lon)}</span>`;
    L.popup({ className: 'sky-popup' }).setLatLng(latlng).setContent(html).openOn(this.map);
  }
}
