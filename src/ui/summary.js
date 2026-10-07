import { esc, sideLabel } from './dom.js';
import { formatDuration } from '../lib/time.js';

const BAND_INFO = [
  ['left', 'Sun on left'],
  ['right', 'Sun on right'],
  ['day', 'Daylight, sun high or fore/aft'],
  ['twilight', 'Twilight'],
  ['night', 'Night'],
];

const EVENT_NAME = { sunrise: 'Sunrise', sunset: 'Sunset', moonrise: 'Moonrise', moonset: 'Moonset' };

const EITHER_REASON = {
  dark: 'It’s dark for most of this flight, so the side makes little difference.',
  'no-direct-sun': 'The sun stays high overhead or off the nose and tail, so little of it reaches the side windows.',
  balanced: 'The sun spends a similar amount of time on each side.',
};

function seatMap(seat) {
  const row = (side) => `<span class="seat-block ${seat === side ? 'is-pick' : seat === 'either' ? '' : 'is-sunny'}">
      <span class="seat"></span><span class="seat"></span><span class="seat"></span></span>`;
  return `<div class="seat-map" aria-hidden="true">${row('left')}<span class="aisle"></span>${row('right')}</div>`;
}

/**
 * @param ctx { flight, analysis, from, to, fmt: { at, clocks, day, elapsed } } — see main.js
 */
export function renderSummary(el, { flight, analysis, from, to, fmt }) {
  const { recommendation: rec, totals } = analysis;
  const other = rec.seat === 'left' ? 'right' : 'left';

  const headline = rec.seat === 'either'
    ? 'Either side works'
    : `Sit on the <em>${rec.seat}</em> for shade`;
  const detail = rec.seat === 'either'
    ? EITHER_REASON[rec.reason]
    : `The ${other} windows get direct sun for about ${formatDuration(rec.sunnyMinutes[other])}; the ${rec.seat} side ${rec.sunnyMinutes[rec.seat] >= 1 ? `for ${formatDuration(rec.sunnyMinutes[rec.seat])}` : 'not at all'}.`;

  const views = analysis.events.map((e) => {
    const where = e.side === 'left' || e.side === 'right' ? `${e.side} side` : sideLabel[e.side];
    const extra = e.phase ? ` · ${Math.round(e.phase.illumination * 100)}% lit` : '';
    return `<li class="ev ev-${e.type}">
      <span class="ev-name">${EVENT_NAME[e.type]}</span>
      <span class="ev-where">${esc(where)}${extra}</span>
      <span class="ev-when">${fmt.elapsed(e.t)} in <span class="muted">· ${esc(fmt.clocks(e.utc))}</span></span>
    </li>`;
  }).join('');

  const total = flight.durationMin;
  const bar = BAND_INFO.filter(([k]) => totals.bands[k] >= 0.5).map(([k, label]) =>
    `<span class="band band-${k}" style="flex:${totals.bands[k]}" title="${label}: ${formatDuration(totals.bands[k])}"></span>`).join('');
  const legend = BAND_INFO.filter(([k]) => totals.bands[k] >= 0.5).map(([k, label]) =>
    `<li><span class="swatch band-${k}"></span>${label}<span class="legend-val">${formatDuration(totals.bands[k])}</span></li>`).join('');

  const arrDay = fmt.day(flight.arriveUtc, flight.departUtc, to.tz);

  el.innerHTML = `
    <section class="verdict verdict-${rec.seat}" aria-live="polite">
      ${seatMap(rec.seat)}
      <div>
        <p class="eyebrow">Recommendation</p>
        <h2>${headline}</h2>
        <p class="verdict-detail">${esc(detail)}</p>
      </div>
    </section>

    <dl class="facts">
      <div><dt>Departs ${esc(from.iata)}</dt><dd>${esc(fmt.at(flight.departUtc, from.tz))}</dd></div>
      <div><dt>Arrives ${esc(to.iata)}</dt><dd>${esc(fmt.at(flight.arriveUtc, to.tz))}${arrDay ? ` <sup>${arrDay}</sup>` : ''}</dd></div>
      <div><dt>Distance</dt><dd>${Math.round(flight.distanceKm).toLocaleString()} km</dd></div>
      <div><dt>Flight time</dt><dd>${formatDuration(total)}</dd></div>
    </dl>

    ${views ? `<h3 class="section-title">Along the way</h3><ul class="events">${views}</ul>` : ''}

    <h3 class="section-title">Where the sun is</h3>
    <div class="band-bar">${bar}</div>
    <ul class="legend">${legend}</ul>
  `;
}
