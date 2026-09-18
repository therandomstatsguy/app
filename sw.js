/* Random Stats Guy — service worker.

   Two jobs:
     1. Keep the app openable with no connection. The page carries its own
        snapshot, so a cached copy is a working app, not an error screen.
     2. Never get in the way of fresh data. The dashboards are fetched by the
        page itself and are far too big to cache (7-25MB each), so they are
        passed straight through to the network.

   Bump CACHE whenever you publish a new build — the old one is deleted on
   activate, so members pick the new version up on their next launch. */

var CACHE = 'rsg-v1';
var SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
      .catch(function () { /* a missing file must not block the install */ })
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
