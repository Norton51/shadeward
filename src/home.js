// Home page: a lightweight search that hands off to the planner at /xxx-yyy.
import './style.css';
import './analytics.js';
import { loadAirports } from './lib/airports.js';
import { toLocalInput } from './lib/time.js';
import { airportCombobox } from './ui/autocomplete.js';
import { $ } from './ui/dom.js';

// Links from before the home page existed put the flight in the hash
// (/#from=LAX&to=JFK&dep=…); send them on to the planner for that route.
{
  const legacy = new URLSearchParams(location.hash.slice(1));
  const [from, to] = [legacy.get('from'), legacy.get('to')].map((c) => (c || '').toLowerCase());
  if (/^[a-z]{3}$/.test(from) && /^[a-z]{3}$/.test(to)) {
    legacy.delete('from');
    legacy.delete('to');
    const q = legacy.toString().replace(/%3A/g, ':');
    location.replace(`/${from}-${to}${q ? `?${q}` : ''}`);
  }
}

const state = { from: null, to: null };
const depart = $('#depart');
const zone = $('#depart-zone');
const error = $('#form-error');

const setDefaultTime = () => {
  const tz = state.from?.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!depart.value) depart.value = `${toLocalInput(new Date(), tz).slice(0, 10)}T09:00`;
};

const fromBox = airportCombobox($('#from'), (a) => {
  state.from = a;
  zone.textContent = a ? `local time at ${a.iata}` : 'local time';
});
const toBox = airportCombobox($('#to'), (a) => { state.to = a; });

$('#swap').addEventListener('click', () => {
  [state.from, state.to] = [state.to, state.from];
  fromBox.set(state.from);
  toBox.set(state.to);
  zone.textContent = state.from ? `local time at ${state.from.iata}` : 'local time';
});

$('#search').addEventListener('submit', (e) => {
  e.preventDefault();
  const msg = !state.from || !state.to ? 'Choose both airports from the list.'
    : state.from.iata === state.to.iata ? 'Origin and destination are the same airport.' : null;
  error.textContent = msg ?? '';
  error.hidden = !msg;
  if (msg) return;
  const q = depart.value ? `?dep=${depart.value}` : '';
  location.href = `/${state.from.iata.toLowerCase()}-${state.to.iata.toLowerCase()}${q}`;
});

setDefaultTime();
loadAirports().catch(() => {
  error.textContent = 'Couldn’t load the airport list. Check your connection and reload.';
  error.hidden = false;
});
