// Service worker for Träningslogg.
//
// Why this exists: manifest.json alone makes the app *installable*, but without a
// service worker the installed icon is still just a browser navigating to a URL —
// with zero signal (phone locked in a gym locker room, dead zone) it could fail to
// load at all. This makes the app shell load from a local cache instantly, every
// time, regardless of connectivity. Same pattern as Fiskelog's sw.js.
//
// Strategy: stale-while-revalidate, but ONLY for same-origin requests (the app shell
// itself). Träningslogg differs from Fiskelog here: this app also makes a live GET
// call to the Apps Script backend (fetchLastSessions()) to show real "last session"
// data, not just a POST export. That call must always hit the network — caching it
// would show stale numbers on every load until a background refetch happened to
// catch up. Cross-origin requests (both the GET and the POST to script.google.com)
// are left completely untouched, exactly as Fiskelog already does for its POST.
const CACHE_NAME = 'traningslogg-shell-v1';
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting(); // activate this version immediately, don't wait for old tabs to close
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return; // POST (the real export) always goes straight to the network

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return; // cross-origin GET (Apps Script doGet) — always fresh, never cached

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached); // offline with no exact cache match: nothing more we can do

      return cached || networkFetch;
    })
  );
});
