import { inject } from '@vercel/analytics';

// Vercel Web Analytics. Collects nothing until the site is deployed on Vercel
// with Web Analytics enabled; in development it only logs to the console.
//
// A flight lives in the path and query (/lax-jfk?dep=…) and the query is
// rewritten on every edit. Report only the path, so pages read as /lax-jfk,
// and count a page view once per route rather than once per edit.
let lastPath = null;

inject({
  mode: import.meta.env.DEV ? 'development' : 'production',
  beforeSend(event) {
    const url = new URL(event.url);
    url.hash = '';
    url.search = '';
    if (event.type === 'pageview') {
      if (url.pathname === lastPath) return null;
      lastPath = url.pathname;
    }
    return { ...event, url: url.toString() };
  },
});
