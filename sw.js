/* Random Stats Guy — service worker.

   Two jobs:
     1. Keep the app openable with no connection. The page carries its own
        snapshot, so a cached copy is a working app, not an error screen.
     2. Never get in the way of fresh data. The dashboards are fetched by the
        page itself and are far too big to cache (7-25MB each), so they are
        passed straight through to the network.

   CACHE is stamped by assemble.js on every build, so each publish retires the
   previous shell on activate. Don't edit it by hand — the next build overwrites
   it. An app already installed opens from this cache, so it can still be a
   launch behind; version.json (never cached, below) is what lets the page
   notice that and offer the reader an update. */

var CACHE = 'rsg-202609240626';
var SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './favicon-32.png'
];

self.addEventListener('install', function (e) {
  /* Cache each file on its own. addAll() is atomic — one missing file and the
     whole cache stays empty, which silently costs you offline support. */
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) {
        return Promise.all(SHELL.map(function (url) {
          return c.add(url).catch(function () { /* skip what isn't there */ });
        }));
      })
      .then(function () { return self.skipWaiting(); })
      .catch(function () {})
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          return k === CACHE ? null : caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }

  /* Anything off this origin — the dashboards, Google Fonts — goes straight to
     the network. The dashboards are megabytes each and change through the week;
     a stale copy would be worse than none. */
  if (url.origin !== self.location.origin) return;

  /* The version stamp is the one thing that must never come from the cache: it
     is what tells an installed app the shell it is running is out of date, and
     a cached copy would always agree with itself. */
  if (/\/version\.json$/.test(url.pathname)) {
    e.respondWith(fetch(req, {cache: 'no-store'}).catch(function () {
      return new Response('{}', {headers: {'Content-Type': 'application/json'}});
    }));
    return;
  }

  /* The app shell: serve from cache immediately so a launch is instant, then
     refresh the copy in the background for next time. */
  e.respondWith(
    caches.match(req).then(function (hit) {
      var live = fetch(req).then(function (res) {
        if (res && res.ok && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return hit; });
      return hit || live;
    })
  );
});
