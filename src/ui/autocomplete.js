import { searchAirports } from '../lib/airports.js';
import { esc } from './dom.js';

let uid = 0;

/**
 * ARIA 1.2 combobox for picking an airport. Calls onSelect(airport) when one
 * is chosen and onSelect(null) when the text no longer matches a selection.
 */
export function airportCombobox(input, onSelect) {
  const list = document.createElement('ul');
  list.className = 'combo-list';
  list.id = `combo-${++uid}`;
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  input.after(list);

  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', list.id);
  input.setAttribute('aria-expanded', 'false');

  let results = [];
  let active = -1;
  let selected = null;

  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  };

  const render = () => {
    if (!results.length) return close();
    list.innerHTML = results.map((a, i) => `
      <li role="option" id="${list.id}-${i}" aria-selected="${i === active}" data-i="${i}">
        <span class="combo-code">${esc(a.iata)}</span>
        <span class="combo-text"><span class="combo-city">${esc(a.city)}</span>
        <span class="combo-name">${esc(a.name)} · ${esc(a.countryName)}</span></span>
      </li>`).join('');
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (active >= 0) {
      input.setAttribute('aria-activedescendant', `${list.id}-${active}`);
      list.children[active]?.scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  };

  const choose = (a) => {
    selected = a;
    input.value = `${a.iata} · ${a.city}`;
    close();
    onSelect(a);
  };

  const refresh = () => {
    results = searchAirports(input.value);
    active = results.length ? 0 : -1;
    render();
  };

  input.addEventListener('input', () => {
    if (selected) { selected = null; onSelect(null); }
    refresh();
  });
  input.addEventListener('focus', () => { if (!selected && input.value) refresh(); else input.select(); });
  input.addEventListener('blur', () => setTimeout(close, 120));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (list.hidden) { refresh(); return e.preventDefault(); }
      const step = e.key === 'ArrowDown' ? 1 : -1;
      active = (active + step + results.length) % results.length;
      render();
      e.preventDefault();
    } else if (e.key === 'Enter' && !list.hidden && results[active]) {
      choose(results[active]);
      e.preventDefault();
    } else if (e.key === 'Escape' && !list.hidden) {
      close();
      e.preventDefault();
    }
  });
  list.addEventListener('mousedown', (e) => {
    const li = e.target.closest('li[data-i]');
    if (li) { e.preventDefault(); choose(results[+li.dataset.i]); }
  });

  return {
    set(a) {
      selected = a;
      input.value = a ? `${a.iata} · ${a.city}` : '';
    },
    get: () => selected,
  };
}
