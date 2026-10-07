// Builds src/data/airports.json from the OurAirports dataset (public domain).
//
//   node scripts/build-airports.mjs [path/to/airports.csv]
//
// Without an argument the CSV is downloaded. Each airport is emitted as a compact
// row [iata, name, city, country, lat, lon, ianaTimeZone] so the app can render
// political local times without a runtime timezone lookup.

import { readFile, writeFile } from 'node:fs/promises';
import tzlookup from 'tz-lookup';

const SOURCE = 'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv';
const OUT = new URL('../src/data/airports.json', import.meta.url);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuote = false;
      else field += ch;
    } else if (ch === '"') inQuote = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const round = (n) => Math.round(n * 1e4) / 1e4;

const text = process.argv[2]
  ? await readFile(process.argv[2], 'utf8')
  : await (await fetch(SOURCE)).text();

const [header, ...rows] = parseCsv(text);
const col = Object.fromEntries(header.map((h, i) => [h, i]));

const byIata = new Map();
for (const r of rows) {
  const type = r[col.type];
  const iata = (r[col.iata_code] || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(iata)) continue;
  if (type !== 'large_airport' && type !== 'medium_airport') continue;
  if (type === 'medium_airport' && r[col.scheduled_service] !== 'yes') continue;
  const lat = Number(r[col.latitude_deg]);
  const lon = Number(r[col.longitude_deg]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

  const prev = byIata.get(iata);
  if (prev && prev.type === 'large_airport') continue;

  const name = r[col.name].trim();
  byIata.set(iata, {
    type,
    row: [iata, name, (r[col.municipality] || '').trim() || name, r[col.iso_country], round(lat), round(lon), tzlookup(lat, lon)],
  });
}

const out = [...byIata.values()]
  .map((v) => v.row)
  .sort((a, b) => a[0].localeCompare(b[0]));

await writeFile(OUT, JSON.stringify(out).replace(/\],\[/g, '],\n['));
console.log(`Wrote ${out.length} airports to ${OUT.pathname}`);
