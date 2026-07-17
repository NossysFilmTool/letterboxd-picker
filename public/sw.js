// Service worker: maakt de tool offline opstartbaar als geïnstalleerde app.
// Strategie: netwerk eerst (altijd de nieuwste versie zodra je online bent),
// cache als vangnet (opent ook in de trein). Alleen de app-schil zelf wordt
// gecachet; filmdata leeft in IndexedDB en API-verkeer blijft ongemoeid.
const CACHE = 'nossy-shell';

self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Alleen eigen bestanden; TMDB/OMDb/afbeeldingen gaan er gewoon langs.
  if (url.origin !== location.origin) return;
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })
        .then((hit) => hit || caches.match('./', { ignoreSearch: true }))),
  );
});
