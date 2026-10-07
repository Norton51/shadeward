import { esc } from './dom.js';

const EVENT_GLYPH = { sunrise: '☀︎↑', sunset: '☀︎↓', moonrise: '☾↑', moonset: '☾↓' };
const PLAY_MS = 24000; // a whole flight plays back in about this long

/**
 * Flight timeline: a strip coloured by where the sun is, event markers, a
 * scrubber, and play/pause. Calls onChange(tSeconds) whenever the time moves.
 */
export class Timeline {
  constructor(root, onChange) {
    this.root = root;
    this.onChange = onChange;
    this.bands = root.querySelector('.tl-bands');
    this.events = root.querySelector('.tl-events');
    this.scrub = root.querySelector('.tl-scrub');
    this.play = root.querySelector('.tl-play');
    this.start = root.querySelector('.tl-start');
    this.end = root.querySelector('.tl-end');
    this.total = 0;
    this.t = 0;
    this.raf = 0;

    this.scrub.addEventListener('input', () => { this.pause(); this._set(+this.scrub.value); });
    this.play.addEventListener('click', () => (this.raf ? this.pause() : this.resume()));
    this.events.addEventListener('click', (e) => {
      const b = e.target.closest('[data-t]');
      if (b) { this.pause(); this.seek(+b.dataset.t); }
    });
  }

  /** @param describe (t) => accessible text for a moment, e.g. "1h 20m in · 10:20 PDT" */
  setFlight({ totalSec, samples, events, startLabel, endLabel, describe, eventLabel }) {
    this.pause();
    this.total = totalSec;
    this.describe = describe;
    this.scrub.max = String(totalSec);
    this.start.textContent = startLabel;
    this.end.textContent = endLabel;

    // Run-length encode the per-minute bands into segments.
    const segs = [];
    for (let i = 0; i < samples.length - 1; i++) {
      const s = samples[i];
      const last = segs[segs.length - 1];
      if (last && last.band === s.band) last.to = samples[i + 1].t;
      else segs.push({ band: s.band, from: s.t, to: samples[i + 1].t });
    }
    this.bands.innerHTML = segs.map((s) =>
      `<span class="band band-${s.band}" style="left:${(s.from / totalSec) * 100}%;width:${((s.to - s.from) / totalSec) * 100}%"></span>`).join('');

    this.events.innerHTML = events.map((e) => `
      <button type="button" class="tl-event ev-${e.type}" data-t="${e.t}" style="left:${(e.t / totalSec) * 100}%"
        title="${esc(eventLabel(e))}" aria-label="${esc(eventLabel(e))}">${EVENT_GLYPH[e.type]}</button>`).join('');

    this.seek(0);
  }

  seek(t) {
    this._set(Math.min(this.total, Math.max(0, t)));
  }

  resume() {
    if (this.t >= this.total) this._set(0);
    this.play.classList.add('is-playing');
    this.play.setAttribute('aria-label', 'Pause');
    let last = performance.now();
    const step = (now) => {
      const next = this.t + ((now - last) / PLAY_MS) * this.total;
      last = now;
      this._set(Math.min(next, this.total));
      this.raf = this.t < this.total ? requestAnimationFrame(step) : (this.pause(), 0);
    };
    this.raf = requestAnimationFrame(step);
  }

  pause() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.play.classList.remove('is-playing');
    this.play.setAttribute('aria-label', 'Play');
  }

  _set(t) {
    this.t = t;
    this.scrub.value = String(t);
    this.root.style.setProperty('--progress', `${(t / this.total) * 100}%`);
    if (this.describe) this.scrub.setAttribute('aria-valuetext', this.describe(t));
    this.onChange(t);
  }
}
