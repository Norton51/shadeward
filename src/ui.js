import { searchAirports } from './airports.js';

export function attachAirportAutocomplete(inputEl, suggestionsEl, onSelect) {
  let selectedAirport = null;
  let activeIndex = -1;
  let currentResults = [];

  const render = (results) => {
    suggestionsEl.innerHTML = '';
    if (results.length === 0) {
      suggestionsEl.classList.remove('visible');
      return;
    }
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const li = document.createElement('li');
      li.innerHTML = `<span class="iata">${r.iata}</span>${r.city} <span class="city">${r.name}, ${r.country}</span>`;
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        select(r);
      });
      if (i === activeIndex) li.style.background = 'var(--border)';
      suggestionsEl.appendChild(li);
    }
    suggestionsEl.classList.add('visible');
  };

  const select = (airport) => {
    selectedAirport = airport;
    inputEl.value = `${airport.iata} ${airport.city}`;
    suggestionsEl.classList.remove('visible');
    activeIndex = -1;
    onSelect(airport);
  };

  inputEl.addEventListener('input', () => {
    selectedAirport = null;
    activeIndex = -1;
    const results = searchAirports(inputEl.value);
    currentResults = results;
    render(results);
  });

  inputEl.addEventListener('focus', () => {
    if (inputEl.value) {
      const results = searchAirports(inputEl.value);
      currentResults = results;
      render(results);
    }
  });

  inputEl.addEventListener('blur', () => {
    setTimeout(() => suggestionsEl.classList.remove('visible'), 150);
  });

  inputEl.addEventListener('keydown', (e) => {
    if (!currentResults.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, currentResults.length - 1);
      render(currentResults);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      render(currentResults);
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && activeIndex < currentResults.length) {
        e.preventDefault();
        select(currentResults[activeIndex]);
      } else if (currentResults.length > 0) {
        e.preventDefault();
        select(currentResults[0]);
      }
    } else if (e.key === 'Escape') {
      suggestionsEl.classList.remove('visible');
    }
  });

  return {
    getSelected: () => selectedAirport,
  };
}
