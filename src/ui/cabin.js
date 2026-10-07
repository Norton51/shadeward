// Top-down "sky compass" around the aircraft: the outer ring is the horizon,
// the centre is straight overhead, and the nose points up.

const R = 84;

const windows = (x) => Array.from({ length: 7 }, (_, i) => `<rect x="${x}" y="${-27 + i * 8}" width="3" height="5" rx="1.2"/>`).join('');

export function renderCabinCompass(svg) {
  svg.setAttribute('viewBox', '-100 -100 200 200');
  svg.innerHTML = `
    <circle class="cc-sky" r="${R}"/>
    <circle class="cc-ring" r="${R * 2 / 3}"/>
    <circle class="cc-ring" r="${R / 3}"/>
    <line class="cc-axis" x1="0" y1="${-R}" x2="0" y2="${R}"/>
    <line class="cc-axis" x1="${-R}" y1="0" x2="${R}" y2="0"/>
    <text class="cc-label" x="0" y="${-R - 5}">NOSE</text>
    <text class="cc-label" x="${-R - 8}" y="3">L</text>
    <text class="cc-label" x="${R + 8}" y="3">R</text>
    <path class="cc-plane" d="M0-46c4 0 7 5 7 11v17l36 15v9L7-1v24l12 8v6L0 33l-19 4v-6l12-8V-1l-36 7v-9l36-15v-17c0-6 3-11 7-11z"/>
    <g class="cc-win cc-win-left">${windows(-5.5)}</g>
    <g class="cc-win cc-win-right">${windows(2.5)}</g>
    <line class="cc-ray" x1="0" y1="0" x2="0" y2="0"/>
    <g class="cc-sun"><circle r="9"/><circle class="cc-sun-halo" r="15"/></g>`;

  const sun = svg.querySelector('.cc-sun');
  const ray = svg.querySelector('.cc-ray');
  const left = svg.querySelector('.cc-win-left');
  const right = svg.querySelector('.cc-win-right');

  return (state) => {
    const { sun: pos, cabin } = state;
    // Elevation maps linearly from horizon (ring) to zenith (centre); below the
    // horizon the sun is parked just outside the ring.
    const r = pos.elevation >= 0 ? R * (1 - pos.elevation / 90) : R + 8;
    const a = (cabin.relative * Math.PI) / 180;
    const x = r * Math.sin(a);
    const y = -r * Math.cos(a);
    sun.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    sun.classList.toggle('is-down', !cabin.visible);
    ray.setAttribute('x2', x.toFixed(1));
    ray.setAttribute('y2', y.toFixed(1));
    ray.classList.toggle('is-down', !cabin.visible);
    left.style.setProperty('--glare', cabin.left.toFixed(2));
    right.style.setProperty('--glare', cabin.right.toFixed(2));
  };
}
