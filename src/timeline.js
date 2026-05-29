// Timeline scrubber controller.
// Owns the current time index into the flight, supports drag-scrub and auto-play.

export class Timeline {
  constructor({ scrubEl, eventsEl, startLabelEl, endLabelEl, playBtnEl, onChange }) {
    this.scrub = scrubEl;
    this.events = eventsEl;
    this.startLabel = startLabelEl;
    this.endLabel = endLabelEl;
    this.playBtn = playBtnEl;
    this.onChange = onChange;

    this.samples = [];
    this.solarEvents = [];
    this.playing = false;
    this._lastFrameMs = 0;
    this._playF = 0; // float position [0,1] — not read back from rounded DOM scrub

    this._tooltip = document.createElement('div');
    this._tooltip.id = 'timeline-tooltip';
    document.body.appendChild(this._tooltip);

    this.scrub.addEventListener('input', () => {
      this._playF = Number(this.scrub.value) / 1000;
      this._emit(this._playF);
    });

    this.playBtn.addEventListener('click', () => {
      this.togglePlay();
    });
  }

  setFlight(samples, solarEvents) {
    this.samples = samples;
    this.solarEvents = solarEvents;
    this._renderEvents();
    this._renderLabels();
    this.scrub.value = 0;
    this._playF = 0;
    this._emit(0);
  }

  _renderEvents() {
    this.events.innerHTML = '';
    if (this.samples.length === 0) return;
    const totalSec = this.samples[this.samples.length - 1].t;
    for (const ev of this.solarEvents) {
      const f = ev.t / totalSec;
      const el = document.createElement('div');
      el.className = 'timeline-event';
      el.style.left = `${(f * 100).toFixed(2)}%`;
      const icon = ev.type === 'sunrise'  ? '🌅'
                 : ev.type === 'sunset'   ? '🌇'
                 : ev.type === 'moonrise' ? '🌔'
                 :                         '🌒';
      const labels = {
        sunrise:  'Sunrise — sun rises above the horizon',
        sunset:   'Sunset — sun drops below the horizon',
        moonrise: 'Moonrise — moon becomes visible above the horizon',
        moonset:  'Moonset — moon drops below the horizon',
      };
      const time = ev.utc.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      el.textContent = `${icon} ${time}`;
      const tipText = `${labels[ev.type]} · ${time} UTC`;
      el.addEventListener('mouseenter', (e) => {
        this._tooltip.textContent = tipText;
        this._tooltip.style.display = 'block';
        this._positionTooltip(e);
      });
      el.addEventListener('mousemove', (e) => this._positionTooltip(e));
      el.addEventListener('mouseleave', () => { this._tooltip.style.display = 'none'; });
      this.events.appendChild(el);
    }
  }

  _renderLabels() {
    if (this.samples.length === 0) return;
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    this.startLabel.textContent = formatLocal(first.utc, first.lat, first.lon) + ' depart';
    this.endLabel.textContent = formatLocal(last.utc, last.lat, last.lon) + ' arrive';
  }

  _emit(fraction) {
    if (this.samples.length === 0) return;
    // Find sample interpolating between indices
    const totalSec = this.samples[this.samples.length - 1].t;
    const targetT = fraction * totalSec;

    // Binary search for the sample bracket
    let lo = 0;
    let hi = this.samples.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (this.samples[mid].t <= targetT) lo = mid; else hi = mid;
    }
    const a = this.samples[lo];
    const b = this.samples[hi];
    const span = b.t - a.t || 1;
    const f = (targetT - a.t) / span;

    const interp = {
      t: targetT,
      fraction,
      lat: a.lat + (b.lat - a.lat) * f,
      lon: a.lon + (b.lon - a.lon) * f,
      heading: lerpAngleDeg(a.heading, b.heading, f),
      altitudeM: a.altitudeM + (b.altitudeM - a.altitudeM) * f,
      utc: new Date(a.utc.getTime() + (b.utc.getTime() - a.utc.getTime()) * f),
    };

    this.onChange?.(interp);
  }

  togglePlay() {
    if (this.playing) {
      this.playing = false;
      this.playBtn.textContent = '▶';
      this.playBtn.classList.remove('playing');
    } else {
      // Restart from beginning if already at the end.
      if (this._playF >= 1) {
        this._playF = 0;
        this.scrub.value = '0';
        this._emit(0);
      } else {
        this._playF = Number(this.scrub.value) / 1000;
      }
      this.playing = true;
      this.playBtn.textContent = '⏸';
      this.playBtn.classList.add('playing');
      this._lastFrameMs = performance.now();
      requestAnimationFrame(this._tick);
    }
  }

  _tick = (now) => {
    if (!this.playing) return;

    // Schedule the next frame immediately so a throw in _emit can't kill the loop.
    requestAnimationFrame(this._tick);

    const dt = (now - this._lastFrameMs) / 1000;
    this._lastFrameMs = now;
    const totalSec = this.samples[this.samples.length - 1].t;
    // 120× real time, but never slower than finishing in 60 s total.
    const rate = Math.max(120 / totalSec, 1 / 60);
    this._playF += dt * rate;
    if (this._playF >= 1) {
      this._playF = 1;
      this.playing = false;
      this.playBtn.textContent = '▶';
      this.playBtn.classList.remove('playing');
    }
    this.scrub.value = String(Math.round(this._playF * 1000));
    this._emit(this._playF);
  };

  _positionTooltip(e) {
    const tip = this._tooltip;
    const margin = 8;
    let x = e.clientX - tip.offsetWidth / 2;
    let y = e.clientY - tip.offsetHeight - margin;
    // Keep within viewport horizontally
    x = Math.max(margin, Math.min(x, window.innerWidth - tip.offsetWidth - margin));
    if (y < margin) y = e.clientY + margin;
    tip.style.left = `${x}px`;
    tip.style.top  = `${y}px`;
  }
}

function lerpAngleDeg(a, b, f) {
  let diff = ((b - a + 540) % 360) - 180;
  return (a + diff * f + 360) % 360;
}

function formatLocal(date, lat, lon) {
  // Rough local-time offset from longitude (15° = 1 hour).
  const offsetHours = (((lon % 360) + 540) % 360 - 180) / 15;
  const localMs = date.getTime() + offsetHours * 3600 * 1000;
  const local = new Date(localMs);
  return local.toISOString().slice(11, 16) + ' local';
}
