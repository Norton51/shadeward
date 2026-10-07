// Builds src/data/routes.json: the ~500 busiest airport pairs, used to
// pre-render one page per direction (/lax-jfk and /jfk-lax).
//
//   node scripts/build-routes.mjs [path/to/routes.dat]
//
// Openly licensed passenger or frequency data per route doesn't exist, so the
// list is built in two parts:
//  1. SEED: routes that published rankings (OAG, ACI, airline reports)
//     regularly place among the world's busiest, plus well-known long-haul
//     routes. This guarantees the high-demand shuttles that a dataset without
//     frequencies cannot see (Gimpo–Jeju, Sydney–Melbourne, O'Hare–LaGuardia).
//  2. The rest ranked from OpenFlights routes.dat (https://openflights.org/data,
//     ODbL 1.0) by sqrt(operating airlines) × sqrt(routes at A × routes at B):
//     a gravity-style proxy where codeshares are excluded and airport size
//     stands in for traffic.
// Pairs are kept only if both airports are in the current airport list and are
// at least 250 km apart (shorter hops leave little to choose between sides).
// routes.json is therefore a derived database under the ODbL.

import { readFile, writeFile } from 'node:fs/promises';
import { distanceKm } from '../src/lib/geo.js';

const SOURCE = 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/routes.dat';
const OUT = new URL('../src/data/routes.json', import.meta.url);
const COUNT = 500;

const SEED = `
CJU-GMP CTS-HND FUK-HND HND-OKA HND-ITM HND-KIX? MEL-SYD BNE-SYD BNE-MEL MEL-PER PER-SYD ADL-MEL AKL-WLG AKL-CHC
JED-RUH DMM-RUH JED-MED CAI-JED DXB-JED DXB-RUH DOH-DXB DXB-KWI
BOM-DEL BLR-DEL BLR-BOM CCU-DEL DEL-MAA DEL-HYD BOM-HYD
PEK-SHA CAN-PEK PEK-SZX CAN-SHA SHA-SZX CTU-PEK HGH-PEK
HAN-SGN DAD-SGN DAD-HAN CGK-DPS CGK-KNO CGK-SUB MNL-CEB DVO-MNL BKK-CNX BKK-HKT KUL-PEN BKI-KUL
KUL-SIN HKG-TPE ICN-KIX ICN-NRT BKK-HKG CGK-SIN DPS-SIN BKK-SIN HKG-SIN MNL-SIN HKG-MNL HKG-PVG HKG-PEK HKG-ICN NRT-TPE TPE-HND ICN-TPE BKK-ICN
LAX-SFO LAS-LAX LGA-ORD BOS-LGA DCA-LGA ATL-LGA ATL-MCO DEN-LAS DEN-PHX LAX-SEA LAX-JFK JFK-SFO ATL-FLL DFW-LAX DFW-LGA ORD-LAX ATL-ORD HNL-LAX OGG-LAX DEN-LAX SEA-SFO ANC-SEA MIA-LGA JFK-MCO EWR-MCO BOS-ORD DFW-ORD
YUL-YYZ YVR-YYZ YVR-YYC YYC-YYZ MEX-CUN GDL-MEX MEX-MTY MEX-TIJ BOG-MDE BOG-CTG GRU-SDU CGH-SDU BSB-CGH EZE-SCL LIM-SCL GIG-GRU
BCN-MAD DUB-LHR AMS-LHR FRA-LHR CDG-LHR LHR-MAD BCN-LGW DUB-STN ORY-NCE CDG-NCE OSL-TRD BGO-OSL ARN-CPH CPH-OSL FCO-LIN CTA-FCO MAD-PMI BCN-PMI IST-ESB ADB-IST AYT-IST SVO-LED SVO-AER LGW-AGP MAN-TFS
JFK-LHR LAX-LHR SFO-LHR ORD-LHR BOS-LHR IAD-LHR CDG-JFK JFK-FRA EWR-LHR MIA-MAD GRU-LIS LHR-DXB DXB-SYD DXB-BOM DXB-LHR LHR-SIN LHR-HKG LHR-DEL LHR-BOM DOH-LHR FRA-SIN CDG-SIN MEL-SIN SIN-SYD AKL-SYD LAX-SYD LAX-AKL LAX-NRT SFO-HND JFK-NRT JFK-HND ORD-NRT SEA-NRT HNL-NRT HNL-HND LAX-HKG JFK-HKG SFO-HKG LAX-ICN JFK-ICN SFO-TPE LAX-TPE ICN-SFO YVR-HKG YVR-NRT YYZ-LHR JNB-LHR CPT-LHR NBO-LHR ADD-DXB JNB-DXB
`.split(/\s+/).filter((k) => k && !k.endsWith('?')).map((k) => k.split('-').sort().join('-'));

const text = process.argv[2] ? await readFile(process.argv[2], 'utf8') : await (await fetch(SOURCE)).text();
const airports = JSON.parse(await readFile(new URL('../src/data/airports.json', import.meta.url), 'utf8'));
const byIata = new Map(airports.map((a) => [a[0], { lat: a[4], lon: a[5] }]));

const airlines = new Map(); // "AAA-BBB" (sorted) → Set of airline codes
for (const line of text.split('\n')) {
  const [airline, , src, , dst, , codeshare] = line.split(',');
  if (!src || !dst || codeshare === 'Y') continue;
  if (!byIata.has(src) || !byIata.has(dst) || src === dst) continue;
  const key = [src, dst].sort().join('-');
  if (!airlines.has(key)) airlines.set(key, new Set());
  airlines.get(key).add(airline);
}

const degree = new Map();
for (const key of airlines.keys()) {
  for (const code of key.split('-')) degree.set(code, (degree.get(code) || 0) + 1);
}

const farEnough = (key) => {
  const [a, b] = key.split('-');
  return byIata.has(a) && byIata.has(b) && a !== b && distanceKm(byIata.get(a), byIata.get(b)) >= 250;
};

const chosen = [...new Set(SEED)].filter((key) => {
  if (!farEnough(key)) { console.warn(`skip seed ${key}: unknown airport or under 250 km`); return false; }
  return true;
});
const seen = new Set(chosen);
const ranked = [...airlines]
  .filter(([key]) => !seen.has(key) && farEnough(key))
  .map(([key, set]) => {
    const [a, b] = key.split('-');
    return { key, score: Math.sqrt(set.size) * Math.sqrt(degree.get(a) * degree.get(b)) };
  })
  .sort((x, y) => y.score - x.score);
for (const { key } of ranked) {
  if (chosen.length >= COUNT) break;
  chosen.push(key);
}
const pairs = chosen.map((key) => key.split('-'));

await writeFile(OUT, JSON.stringify(pairs).replace(/\],\[/g, '],\n['));
console.log(`Wrote ${pairs.length} airport pairs to ${OUT.pathname}`);
