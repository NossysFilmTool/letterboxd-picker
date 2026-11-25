// Service worker: maakt de tool offline opstartbaar als geïnstalleerde app.
//
// - De pagina zelf: eerst het netwerk (zo heb je altijd de nieuwste versie),
//   maar niet eindeloos. Duurt het langer dan WACHT, dan opent de bewaarde
//   versie meteen en komt de nieuwe op de achtergrond binnen (voor de
//   volgende keer). Zonder netwerk: de bewaarde versie.
// - De pagina wordt maar één keer bewaard, zonder wat er achter het
//   vraagteken staat. Een zaalcode of een koppellink (met je geheime
//   sync-code) komt zo nooit in de opslag, en niet elke link een eigen kopie.
// - Bestanden met een vingerafdruk in de naam (assets/…) veranderen nooit:
//   uit de opslag als ze er zijn. De rest (pictogrammen, manifest): meteen
//   uit de opslag, en op de achtergrond ververst.
// - Alleen eigen bestanden; TMDB, OMDb en de Worker gaan er gewoon langs.
// - Bij het installeren meteen alles bewaren wat in bestanden.json staat
//   (vite.config.js schrijft die lijst), ook de talen en de stukken die pas
//   later laden, plus de pagina zelf. Bestanden van een vorige versie gaan
//   dan weg. Zo start de app na het eerste bezoek ook zonder netwerk.
const CACHE = 'picker-v2';
// Alleen onze eigen opslag opruimen: andere apps op dezelfde site hebben die van hen
const VAN_ONS = /^(nossy-|shutterbox-|picker-)/;
const PAGINA = './';
const WACHT = 3500; // ms

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(voorraad().catch(() => { /* zonder lijst bewaart hij gewoon onderweg */ }));
});
self.addEventListener('activate', (e) => {
  // Oude opslag weg (de vorige versie bewaarde elke link apart)
  e.waitUntil((async () => {
    const namen = await caches.keys();
    await Promise.all(namen.filter((n) => n !== CACHE && VAN_ONS.test(n)).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

const bewaar = async (sleutel, res) => {
  if (!res || !res.ok || res.type === 'opaque') return;
  const c = await caches.open(CACHE);
  await c.put(sleutel, res);
};

const sleutelVan = (pad) => { const u = new URL(pad, location.href); return u.origin + u.pathname; };

async function voorraad() {
  const res = await fetch('./bestanden.json', { cache: 'no-store' });
  if (!res.ok) return;
  const lijst = await res.json();
  const c = await caches.open(CACHE);
  const sleutels = lijst.map(sleutelVan);
  await Promise.all(sleutels.map(async (sleutel) => {
    if (await c.match(sleutel)) return;
    await bewaar(sleutel, await fetch(sleutel));
  }));
  // De pagina ook: de eerste keer opende hij nog zonder service worker
  await bewaar(PAGINA, await fetch(PAGINA, { cache: 'no-store' }));
  // Wat een vorige versie bewaarde, is er nu niet meer
  for (const req of await c.keys()) {
    const sleutel = sleutelVan(req.url);
    if (/\/assets\//.test(sleutel) && !sleutels.includes(sleutel)) await c.delete(req);
  }
}

async function pagina(e) {
  const c = await caches.open(CACHE);
  const net = fetch(e.request).then((res) => {
    if (res.ok) e.waitUntil(bewaar(PAGINA, res.clone()));
    return res;
  });
  const bewaard = await c.match(PAGINA);
  if (!bewaard) return net;
  const traag = new Promise((klaar) => { setTimeout(() => klaar(null), WACHT); });
  try {
    const eerst = await Promise.race([net, traag]);
    if (eerst) return eerst;
    // Te traag: de bewaarde versie nu, de nieuwe komt alsnog in de opslag
    e.waitUntil(net.catch(() => {}));
    return bewaard;
  } catch {
    return bewaard;
  }
}

async function bestand(e, url) {
  const c = await caches.open(CACHE);
  const sleutel = url.origin + url.pathname;
  const bewaard = await c.match(sleutel);
  const vast = /\/assets\//.test(url.pathname);
  if (bewaard && vast) return bewaard;
  const net = fetch(e.request).then((res) => { e.waitUntil(bewaar(sleutel, res.clone())); return res; });
  if (bewaard) { e.waitUntil(net.catch(() => {})); return bewaard; }
  return net;
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== 'GET') return;
  if (e.request.mode === 'navigate') { e.respondWith(pagina(e)); return; }
  if (url.pathname.endsWith('/sw.js')) return;
  e.respondWith(bestand(e, url));
});
