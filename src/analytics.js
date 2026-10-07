import { inject } from '@vercel/analytics';

// Vercel Web Analytics. Collects nothing until the site is deployed on Vercel
// with Web Analytics enabled; in development it only logs to the console.
//
// Flights live in the URL hash and are rewritten with history.replaceState on
// every change, so strip the hash and drop repeat page views for the same path
// to keep it to one page view per visit.
let lastPath = null;

inject({
  mode: import.meta.env.DEV ? 'development' : 'production',
  beforeSend(event) {
    const url = new URL(event.url);
    url.hash = '';
    if (event.type === 'pageview') {
      if (url.pathname === lastPath) return null;
      lastPath = url.pathname;
    }
    return { ...event, url: url.toString() };
  },
});
