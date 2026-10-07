// Runs after `vite build`. Writes static, indexable pages into dist/:
//
//   /                          home, with structured data and popular routes
//   /lax-jfk, /jfk-lax, …      one page per direction of each route in routes.json
//   /which-side-of-the-plane   explainer, including how accurate the estimate is
//   /routes                    index of every route page
//   /app                       the bare app, served for routes without a page
//   sitemap.xml, robots.txt
//
// Route pages carry real text (a best-side table by season and departure time,
// sunrise/sunset sides, distance and flight time) and then load the full app,
// which reads the route from the path.
//
// SITE_URL sets the canonical origin (default https://sunseat.org).

import { readFile, writeFile } from 'node:fs/promises';
import { createFlight, analyzeFlight, estimateBlockMinutes } from '../src/lib/flight.js';
import { distanceKm, bearing } from '../src/lib/geo.js';
import { zonedToUtc, formatDuration } from '../src/lib/time.js';

const SITE = (process.env.SITE_URL || 'https://sunseat.org').replace(/\/$/, '');
const DIST = new URL('../dist/', import.meta.url);
const read = (rel) => readFile(new URL(rel, import.meta.url), 'utf8');

const template = await readFile(new URL('index.html', DIST), 'utf8');
const airportRows = JSON.parse(await read('../src/data/airports.json'));
const routes = JSON.parse(await read('../src/data/routes.json'));

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const airports = new Map(airportRows.map(([iata, name, city, country, lat, lon, tz]) => [iata, {
  iata, name, city: cleanCity(city), country: regionNames.of(country) ?? country, lat, lon, tz,
}]));

/** "Paris (Roissy-en-France, Val-d'Oise)" → "Paris" for headings. */
function cleanCity(city) {
  return city.replace(/\s*\(.*\)\s*$/, '').trim();
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ESC[c]);
const slug = (a, b) => `${a.iata.toLowerCase()}-${b.iata.toLowerCase()}`;
const placeName = (a) => `${a.city} (${a.iata})`;

// ── Analysis grid: four seasons × four departure times ─────────────────────

const YEAR = new Date().getUTCFullYear() + 1;
const SEASONS = [
  { key: 'mar', label: 'Mar', date: `${YEAR}-03-20` },
  { key: 'jun', label: 'Jun', date: `${YEAR}-06-21` },
  { key: 'sep', label: 'Sep', date: `${YEAR}-09-22` },
  { key: 'dec', label: 'Dec', date: `${YEAR}-12-21` },
];
const TIMES = [
  { key: 'morning', label: 'Morning', time: '07:00' },
  { key: 'midday', label: 'Midday', time: '12:00' },
  { key: 'afternoon', label: 'Afternoon', time: '16:00' },
  { key: 'evening', label: 'Evening', time: '20:00' },
];

function analyzeRoute(from, to) {
  const durationMin = estimateBlockMinutes(distanceKm(from, to));
  const grid = TIMES.map((tm) => SEASONS.map((se) => {
    const departUtc = zonedToUtc(`${se.date}T${tm.time}`, from.tz);
    const flight = createFlight({ from, to, departUtc, durationMin });
    return analyzeFlight(flight, 120);
  }));
  return { durationMin, grid };
}

const COMPASS = ['north', 'north-northeast', 'northeast', 'east-northeast', 'east', 'east-southeast', 'southeast', 'south-southeast',
  'south', 'south-southwest', 'southwest', 'west-southwest', 'west', 'west-northwest', 'northwest', 'north-northwest'];
const compass = (deg) => COMPASS[Math.round(deg / 22.5) % 16];

const EITHER_NOTE = { dark: 'mostly dark', 'no-direct-sun': 'sun high, ahead or behind', balanced: 'sun on both sides' };

function cell(analysis) {
  const rec = analysis.recommendation;
  const sunset = analysis.events.find((e) => e.type === 'sunset' && (e.side === 'left' || e.side === 'right'));
  const sunrise = analysis.events.find((e) => e.type === 'sunrise' && (e.side === 'left' || e.side === 'right'));
  const view = sunset ? `sunset ${sunset.side}` : sunrise ? `sunrise ${sunrise.side}` : '';
  const main = rec.seat === 'either' ? 'Either' : rec.seat === 'left' ? 'Left' : 'Right';
  const note = rec.seat === 'either' ? EITHER_NOTE[rec.reason] : view;
  return `<span class="side side-${rec.seat}">${main}</span>${note ? `<small>${esc(note)}</small>` : ''}`;
}

/** One-sentence takeaway from the grid. */
function summarize(from, to, grid) {
  const daytime = grid.slice(0, 3).flat(); // morning, midday, afternoon
  const left = daytime.filter((a) => a.recommendation.seat === 'left').length;
  const right = daytime.filter((a) => a.recommendation.seat === 'right').length;
  const route = `${from.city} to ${to.city}`;
  if (left + right <= 2) {
    return `On most departures from ${route}, the sun stays high, ahead or behind, or it's dark, so neither side gets much direct sun.`;
  }
  if (left >= 2 * right) return `On most daytime flights from ${route}, the sun shines in on the right. Sit on the <strong>left</strong> for shade, or the right for the view of the sun.`;
  if (right >= 2 * left) return `On most daytime flights from ${route}, the sun shines in on the left. Sit on the <strong>right</strong> for shade, or the left for the view of the sun.`;
  return `On ${route}, the shady side depends on when you fly: check the table for your departure time and season.`;
}

function viewsSentence(grid) {
  const all = grid.flat().flatMap((a) => a.events).filter((e) => (e.type === 'sunset' || e.type === 'sunrise') && (e.side === 'left' || e.side === 'right'));
  const sides = (type) => [...new Set(all.filter((e) => e.type === type).map((e) => e.side))];
  const parts = [];
  for (const type of ['sunrise', 'sunset']) {
    const s = sides(type);
    if (s.length === 1) parts.push(`the ${type} is on the <strong>${s[0]}</strong>`);
    else if (s.length === 2) parts.push(`the ${type} can be on either side, depending on season and time`);
  }
  return parts.length ? `When it happens during the flight, ${parts.join(', and ')}.` : '';
}

/** Rule-of-thumb sentence, only where it reliably applies (both ends outside the tropics, same hemisphere). */
function ruleOfThumb(from, to) {
  const h = bearing(from, to);
  const dir = compass(h);
  if (Math.abs(from.lat) < 23.5 || Math.abs(to.lat) < 23.5 || Math.sign(from.lat) !== Math.sign(to.lat)) {
    return `The route starts out heading ${dir}.`;
  }
  const north = from.lat > 0;
  const eastbound = h > 0 && h < 180;
  const side = north === eastbound ? 'right' : 'left';
  return `The route starts out heading ${dir}. ${north ? 'North' : 'South'} of the tropics the midday sun is in the ${north ? 'southern' : 'northern'} sky, so on this heading it tends to be on the <strong>${side}</strong> of the aircraft.`;
}

// ── HTML ───────────────────────────────────────────────────────────────────

/** path null: no canonical URL (the bare app serves many different flight URLs). */
function headTags({ title, description, path, jsonLd, noindex = false }) {
  const url = path ? `${SITE}${path}` : null;
  return [
    url ? `<link rel="canonical" href="${esc(url)}" />` : '',
    noindex ? '<meta name="robots" content="noindex" />' : '',
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Sunseat" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    url ? `<meta property="og:url" content="${esc(url)}" />` : '',
    `<meta property="og:image" content="${SITE}/og.png" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<link rel="manifest" href="/manifest.webmanifest" />`,
    `<link rel="apple-touch-icon" href="/apple-touch-icon.png" />`,
    jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : '',
  ].filter(Boolean).join('\n  ');
}

function page({ title, description, path, jsonLd, body = '', h1 = true, noindex }) {
  let html = template
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${esc(description)}" />`)
    .replace('<!--seo:head-->', headTags({ title, description, path, jsonLd, noindex }))
    .replace('<!--seo:body-->', body);
  // Route pages carry their own <h1>; the brand becomes plain text there.
  if (!h1) html = html.replace('<h1 class="brand-title">Sunseat</h1>', '<p class="brand-title">Sunseat</p>');
  return html;
}

const stylesheet = template.match(/<link rel="stylesheet"[^>]*>/)?.[0] ?? '';
const iconLink = template.match(/<link rel="icon"[^>]*>/)?.[0] ?? '';
const brandMark = template.match(/<svg class="brand-mark"[\s\S]*?<\/svg>/)?.[0] ?? '';

function articlePage({ title, description, path, jsonLd, content }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <meta name="theme-color" content="#fbf7f0" media="(prefers-color-scheme: light)" />
  <meta name="theme-color" content="#11151c" media="(prefers-color-scheme: dark)" />
  ${headTags({ title, description, path, jsonLd })}
  ${iconLink}
  ${stylesheet}
</head>
<body class="article-body">
  <main class="article">
    <a class="brand" href="/">${brandMark}<div><p class="brand-title">Sunseat</p><p>Which side of the plane gets the sun?</p></div></a>
    ${content}
  </main>
</body>
</html>
`;
}

const ACCURACY_HTML = `
<p>Where the sun is in the sky at a given moment and place is known almost exactly. What isn't known in advance is exactly where your aircraft will be, and when. Sunseat's answer is an estimate built on three assumptions.</p>
<ul>
  <li><strong>Route.</strong> Sunseat assumes the shortest path, a great circle. Real flights bend around jet streams, follow airways and oceanic tracks, and detour around closed airspace. A heading a few degrees off rarely changes which side gets the sun. It can when the sun is nearly ahead of the nose or behind the tail, which is when either side is a good choice anyway.</li>
  <li><strong>Timing.</strong> Departure delays, holding, and the wind all move the schedule. A strong jet stream can make an eastbound long-haul flight an hour shorter than the westbound return. Every sunrise and sunset along the way shifts with it, so treat event times as approximate.</li>
  <li><strong>Altitude.</strong> At cruise, about 11 km up, the horizon sits around 3° below level. You see the sun rise earlier and set later than people on the ground below, often 10 to 20 minutes, and Sunseat includes this. Climb and descent are modelled as a simple profile.</li>
  <li><strong>Weather.</strong> Clouds below the aircraft don't hide the sun, but a bright cloud deck reflects strong glare up through the windows, even on the "shady" side. Flying through cloud during climb and descent softens the light. At cruise you are above almost all weather, so the sun is usually in full view.</li>
</ul>
<p>Over a whole flight these effects mostly average out. The side with more sun on paper is nearly always the side with more sun in the air.</p>`;

// ── Pages ──────────────────────────────────────────────────────────────────

const written = [];
const out = async (path, html) => {
  const file = path === '/' ? 'index.html' : `${path.slice(1)}.html`;
  await writeFile(new URL(file, DIST), html);
  written.push(path);
};

const directed = [];
for (const [a, b] of routes) {
  const A = airports.get(a), B = airports.get(b);
  if (A && B) directed.push([A, B], [B, A]);
}

// Route pages
const byOrigin = new Map();
for (const [A, B] of directed) {
  if (!byOrigin.has(A.iata)) byOrigin.set(A.iata, []);
  byOrigin.get(A.iata).push(B);
}

let n = 0;
const started = Date.now();
for (const [A, B] of directed) {
  const path = `/${slug(A, B)}`;
  const { durationMin, grid } = analyzeRoute(A, B);
  const km = Math.round(distanceKm(A, B));
  const summary = summarize(A, B, grid);
  const plainSummary = summary.replace(/<[^>]+>/g, '');
  const title = `${A.city} to ${B.city} (${A.iata}–${B.iata}): which side of the plane gets the sun? · Sunseat`;
  const description = `${plainSummary} Best side by season and time of day, sunrise and sunset sides, for ${A.iata} to ${B.iata}.`;

  const table = `
    <table class="guide-table">
      <caption class="muted" style="caption-side:bottom;text-align:left;padding-top:6px;font-size:11.5px">Departure time is local at ${esc(A.iata)}. Seasons use the solstices and equinoxes.</caption>
      <thead><tr><th scope="col">Departing</th>${SEASONS.map((s) => `<th scope="col">${s.label}</th>`).join('')}</tr></thead>
      <tbody>${TIMES.map((t, i) => `<tr><th scope="row">${t.label}<small>${t.time}</small></th>${grid[i].map((a) => `<td>${cell(a)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>`;

  const others = (byOrigin.get(A.iata) || []).filter((x) => x.iata !== B.iata).slice(0, 8);
  const body = `
      <section class="guide" aria-labelledby="guide-title" data-route="${slug(A, B)}">
        <h1 id="guide-title">${esc(A.city)} to ${esc(B.city)}: which side of the plane gets the sun?</h1>
        <p class="lede">${summary}</p>
        <h2>Best side for shade</h2>
        ${table}
        <p>${ruleOfThumb(A, B)} ${viewsSentence(grid)}</p>
        <h2>About this flight</h2>
        <p>${esc(placeName(A))} to ${esc(placeName(B))} is about ${km.toLocaleString('en-US')} km on the shortest path, typically around ${formatDuration(durationMin)} gate to gate. Set your exact departure time above to see where the sun is minute by minute.</p>
        <h2>How accurate is this?</h2>
        <p>Real flights don't fly exactly the shortest path, and delays and winds shift the timing, so treat sunrise and sunset times as approximate. At cruise altitude the sun sets 10 to 20 minutes later than on the ground. A bright cloud deck below can reflect glare in on either side. <a href="/which-side-of-the-plane#accuracy">More on accuracy</a>.</p>
        <h2>Related routes</h2>
        <ul class="guide-links">
          <li><a href="/${slug(B, A)}">${esc(B.iata)} → ${esc(A.iata)} (return)</a></li>
          ${others.map((x) => `<li><a href="/${slug(A, x)}">${esc(A.iata)} → ${esc(x.iata)}</a></li>`).join('')}
          <li><a href="/routes">All routes</a></li>
        </ul>
      </section>`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description,
    url: `${SITE}${path}`,
    isPartOf: { '@type': 'WebSite', name: 'Sunseat', url: `${SITE}/` },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Sunseat', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Routes', item: `${SITE}/routes` },
        { '@type': 'ListItem', position: 3, name: `${A.iata} to ${B.iata}`, item: `${SITE}${path}` },
      ],
    },
  };
  await out(path, page({ title, description, path, jsonLd, body, h1: false }));
  if (++n % 100 === 0) console.log(`  ${n}/${directed.length} route pages (${((Date.now() - started) / 1000).toFixed(0)}s)`);
}

// Home
const popular = directed.slice(0, 24);
await out('/', page({
  title: 'Sunseat: which side of the plane gets the sun?',
  description: 'Free tool: see which side of the plane gets the sun on your flight, where to sit for shade or for the sunset, with a live map and window-seat view.',
  path: '/',
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Sunseat',
    url: `${SITE}/`,
    applicationCategory: 'TravelApplication',
    operatingSystem: 'Any (web browser)',
    description: 'Shows where the sun will be from your seat on any flight and which side of the plane to sit on for shade or views.',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  },
  body: `
      <nav class="guide" aria-labelledby="popular-title">
        <h2 id="popular-title">Popular routes</h2>
        <ul class="guide-links">
          ${popular.map(([A, B]) => `<li><a href="/${slug(A, B)}">${esc(A.iata)} → ${esc(B.iata)}</a></li>`).join('')}
          <li><a href="/routes">All routes</a></li>
          <li><a href="/which-side-of-the-plane">How it works</a></li>
        </ul>
      </nav>`,
}));

// Bare app for routes without a page (served by the vercel.json rewrite).
await out('/app', page({ title: 'Sunseat: which side of the plane gets the sun?', description: 'See which side of the plane gets the sun on your flight.', path: null, jsonLd: null }));

// Explainer
await out('/which-side-of-the-plane', articlePage({
  title: 'Which side of the plane should you sit on to avoid the sun? · Sunseat',
  description: 'How to choose the shady (or sunny) side of the plane: the rule of thumb, why it changes with season and time, and how accurate any prediction can be.',
  path: '/which-side-of-the-plane',
  jsonLd: {
    '@context': 'https://schema.org', '@type': 'Article',
    headline: 'Which side of the plane should you sit on to avoid the sun?',
    url: `${SITE}/which-side-of-the-plane`, author: { '@type': 'Organization', name: 'Sunseat' },
  },
  content: `
    <h1>Which side of the plane should you sit on to avoid the sun?</h1>
    <p>It depends on three things: which way the aircraft is heading, the time of day, and the time of year. Get them right and you can pick a seat out of the glare, or one with the sunset.</p>
    <p><a class="cta" href="/">Check your flight</a></p>

    <h2>The rule of thumb</h2>
    <p>North of the tropics, the sun spends the middle of the day in the southern sky. South of the tropics, it's in the northern sky. So:</p>
    <ul>
      <li><strong>Northern hemisphere, flying east:</strong> south is on your right, so the sun is mostly on the right. Sit on the <strong>left</strong> for shade.</li>
      <li><strong>Northern hemisphere, flying west:</strong> the sun is mostly on the left. Sit on the <strong>right</strong>.</li>
      <li><strong>Southern hemisphere:</strong> the other way round.</li>
      <li><strong>Flying north or south:</strong> the sun is on the east side in the morning and the west side in the afternoon. Flying north, east is on the right; flying south, it's on the left.</li>
    </ul>

    <h2>Why it changes with season and time</h2>
    <p>Early and late in the day the sun is low and far to the east or west, so morning and evening flights can have it on the opposite side to midday. In summer the sun rises and sets well to the north (in the northern hemisphere), so on some routes the "shady" side flips for part of the flight. Near the tropics the midday sun can be almost overhead, where it barely reaches the side windows at all.</p>
    <p>A sun that's ahead of the nose or behind the tail doesn't shine directly into the side windows either, so on those flights either side is fine.</p>

    <h2>What about sunsets and sunrises?</h2>
    <p>If you want the view rather than the shade, sit on the side where the sun is. Sunseat lists every sunrise and sunset along the way and the side it's on. At cruise altitude the sun sets later than on the ground, so the colours often last longer than you'd expect.</p>

    <h2 id="accuracy">How accurate is any prediction?</h2>
    ${ACCURACY_HTML}

    <h2>Popular routes</h2>
    <ul class="guide-links">
      ${popular.map(([A, B]) => `<li><a href="/${slug(A, B)}">${esc(A.city)} → ${esc(B.city)}</a></li>`).join('')}
      <li><a href="/routes">All routes</a></li>
    </ul>`,
}));

// Route index
const sortedDirected = [...directed].sort(([a1, b1], [a2, b2]) => a1.city.localeCompare(a2.city) || b1.city.localeCompare(b2.city));
await out('/routes', articlePage({
  title: 'All routes · Sunseat',
  description: `Which side of the plane gets the sun on ${directed.length} popular routes worldwide.`,
  path: '/routes',
  content: `
    <h1>All routes</h1>
    <p>Which side of the plane gets the sun on ${directed.length} popular routes. Any other route works too: <a href="/">enter it in Sunseat</a>.</p>
    <ul class="route-index">
      ${sortedDirected.map(([A, B]) => `<li><a href="/${slug(A, B)}">${esc(A.city)} → ${esc(B.city)}</a></li>`).join('\n      ')}
    </ul>`,
}));

// Sitemap and robots
const today = new Date().toISOString().slice(0, 10);
const sitemapPaths = written.filter((p) => p !== '/app');
await writeFile(new URL('sitemap.xml', DIST), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapPaths.map((p) => `  <url><loc>${SITE}${p === '/' ? '/' : p}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`);
await writeFile(new URL('robots.txt', DIST), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);

console.log(`Pre-rendered ${written.length} pages (${directed.length} routes) in ${((Date.now() - started) / 1000).toFixed(1)}s`);
