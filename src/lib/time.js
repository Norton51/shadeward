// Time-zone helpers built on Intl, so DST and political offsets are correct
// for any IANA zone the browser knows.

const formatters = new Map();

function partsFormatter(timeZone) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

function wallClock(date, timeZone) {
  const p = Object.fromEntries(partsFormatter(timeZone).formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}

/** Offset of `timeZone` from UTC at instant `date`, in minutes (east positive). */
export function offsetMinutes(date, timeZone) {
  const w = wallClock(date, timeZone);
  const asUtc = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/**
 * Convert a wall-clock time "YYYY-MM-DDTHH:mm" in `timeZone` to a UTC Date.
 * Times inside a DST gap resolve forward; ambiguous times resolve to the earlier instant.
 */
export function zonedToUtc(local, timeZone) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return null;
  const naive = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  // The offset in force may differ between the naive instant and the true one, so
  // try every nearby offset and keep the candidates that read back correctly.
  const offsets = new Set([-1, 0, 1].map((d) => offsetMinutes(new Date(naive + d * 86400000), timeZone)));
  const candidates = [...offsets].map((o) => naive - o * 60000);
  const valid = candidates.filter((u) => toLocalInput(new Date(u), timeZone) === local.slice(0, 16));
  return new Date(valid.length ? Math.min(...valid) : Math.max(...candidates));
}

/** "YYYY-MM-DDTHH:mm" wall clock of `date` in `timeZone` (for datetime-local inputs). */
export function toLocalInput(date, timeZone) {
  const w = wallClock(date, timeZone);
  const p = (n) => String(n).padStart(2, '0');
  return `${w.y}-${p(w.mo)}-${p(w.d)}T${p(w.h)}:${p(w.mi)}`;
}

/** "14:05" in `timeZone`. */
export function clock(date, timeZone) {
  const w = wallClock(date, timeZone);
  return `${String(w.h).padStart(2, '0')}:${String(w.mi).padStart(2, '0')}`;
}

/** Calendar-day difference of `date` relative to `ref`, both read in `timeZone`. */
export function dayDelta(date, ref, timeZone) {
  const a = wallClock(date, timeZone);
  const b = wallClock(ref, timeZone);
  return Math.round((Date.UTC(a.y, a.mo - 1, a.d) - Date.UTC(b.y, b.mo - 1, b.d)) / 86400000);
}

/** Short zone name such as "PDT" or "GMT+8". */
export function zoneAbbr(date, timeZone) {
  const name = (locale) => new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'short' })
    .formatToParts(date)
    .find((x) => x.type === 'timeZoneName')?.value;
  // en-US only abbreviates American zones; en-GB adds BST, CET, etc.
  const us = name('en-US');
  if (us && !us.startsWith('GMT') && !us.startsWith('UTC')) return us;
  const gb = name('en-GB');
  return gb && !gb.startsWith('GMT+') && !gb.startsWith('GMT-') ? gb : us ?? timeZone;
}

/** "5h 05m" */
export function formatDuration(minutes) {
  const m = Math.round(minutes);
  const h = Math.floor(m / 60);
  return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}
