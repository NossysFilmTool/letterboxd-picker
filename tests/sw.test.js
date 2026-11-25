// De service worker (public/sw.js), in een nagebootste omgeving: de pagina
// één keer bewaard (nooit met een code erin), niet eindeloos wachten op een
// traag netwerk, en oude opslag weg.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';

const code = readFileSync('./public/sw.js', 'utf8');

function maakSw(fetchImpl) {
  const handlers = {};
  const opslag = new Map(); // naam -> Map(sleutel -> antwoord)
  const sleutel = (k) => (typeof k === 'string' ? k : k.url);
  const caches = {
    async open(naam) {
      if (!opslag.has(naam)) opslag.set(naam, new Map());
      const m = opslag.get(naam);
      return {
        match: async (k) => m.get(sleutel(k)),
        put: async (k, r) => { m.set(sleutel(k), r); },
        keys: async () => [...m.keys()].map((url) => ({ url })),
        delete: async (k) => m.delete(sleutel(k)),
      };
    },
    async keys() { return [...opslag.keys()]; },
    async delete(naam) { return opslag.delete(naam); },
  };
  const self = { addEventListener: (type, fn) => { handlers[type] = fn; }, skipWaiting() {}, clients: { claim: async () => {} } };
  new Function('self', 'caches', 'fetch', 'location', code)(self, caches, fetchImpl, { origin: 'https://site.test', href: 'https://site.test/sw.js' });
  return { handlers, opslag, caches };
}

const antwoord = (body) => ({ ok: true, type: 'basic', body, clone() { return this; } });

function verzoek(handlers, url, mode = 'navigate') {
  const wachten = [];
  let resp = null;
  const e = { request: { url, method: 'GET', mode }, respondWith: (p) => { resp = p; }, waitUntil: (p) => { wachten.push(p); } };
  handlers.fetch(e);
  return { resp: () => resp, klaar: () => Promise.all(wachten.map((p) => Promise.resolve(p).catch(() => {}))) };
}

describe('service worker', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('bewaart de pagina één keer, zonder zaalcode of sync-code', async () => {
    const sw = maakSw(async () => antwoord('pagina'));
    for (const url of ['https://site.test/?zaal=ABCD', 'https://site.test/?sync=GEHEIM123', 'https://site.test/?samen=XYZ']) {
      const v = verzoek(sw.handlers, url);
      expect((await v.resp()).body).toBe('pagina');
      await v.klaar();
    }
    const sleutels = [...sw.opslag.values()].flatMap((m) => [...m.keys()]);
    expect(sleutels).toEqual(['./']);
    expect(sleutels.join()).not.toContain('GEHEIM');
  });

  it('opent de bewaarde pagina als het netwerk te traag is, en zonder netwerk', async () => {
    let geef = null;
    const sw = maakSw(() => new Promise((r) => { geef = r; }));
    const c = await sw.caches.open('picker-v2');
    await c.put('./', antwoord('bewaard'));
    vi.useFakeTimers();
    const v = verzoek(sw.handlers, 'https://site.test/');
    await vi.advanceTimersByTimeAsync(3600);
    expect((await v.resp()).body).toBe('bewaard');
    // De nieuwe komt alsnog binnen, voor de volgende keer
    geef(antwoord('nieuw'));
    await v.klaar();
    expect((await c.match('./')).body).toBe('nieuw');
    vi.useRealTimers();
    const offline = maakSw(async () => { throw new Error('offline'); });
    const c2 = await offline.caches.open('picker-v2');
    await c2.put('./', antwoord('bewaard'));
    expect((await verzoek(offline.handlers, 'https://site.test/?zaal=ABCD').resp()).body).toBe('bewaard');
  });

  it('bewaart bij het installeren alles uit de lijst, en ruimt de vorige versie op', async () => {
    const opgehaald = [];
    const sw = maakSw(async (url) => {
      opgehaald.push(String(url));
      if (String(url).endsWith('bestanden.json')) return { ...antwoord(''), json: async () => ['assets/index-nieuw.js', 'assets/en-nieuw.js'] };
      return antwoord(`inhoud van ${url}`);
    });
    const c = await sw.caches.open('picker-v2');
    await c.put('https://site.test/assets/index-oud.js', antwoord('oud'));
    await c.put('https://site.test/icon-192.png', antwoord('pictogram'));
    let klaar = null;
    sw.handlers.install({ waitUntil: (p) => { klaar = p; } });
    await klaar;
    const sleutels = [...sw.opslag.get('picker-v2').keys()].sort();
    expect(sleutels).toEqual(['./', 'https://site.test/assets/en-nieuw.js', 'https://site.test/assets/index-nieuw.js', 'https://site.test/icon-192.png']);
    // En wat er al is, wordt niet nog eens opgehaald
    const nogEens = maakSw(async (url) => {
      opgehaald.push(String(url));
      return String(url).endsWith('bestanden.json') ? { ...antwoord(''), json: async () => ['assets/a.js'] } : antwoord('x');
    });
    const c2 = await nogEens.caches.open('picker-v2');
    await c2.put('https://site.test/assets/a.js', antwoord('al bewaard'));
    opgehaald.length = 0;
    nogEens.handlers.install({ waitUntil: (p) => { klaar = p; } });
    await klaar;
    expect(opgehaald).not.toContain('https://site.test/assets/a.js');
    expect((await c2.match('https://site.test/assets/a.js')).body).toBe('al bewaard');
  });

  it('installeert ook zonder lijst (de losse versie, of geen netwerk)', async () => {
    const sw = maakSw(async () => { throw new Error('offline'); });
    let klaar = null;
    sw.handlers.install({ waitUntil: (p) => { klaar = p; } });
    await expect(klaar).resolves.toBeUndefined();
  });

  it('ruimt de oude opslag op, en laat andere sites met rust', async () => {
    const sw = maakSw(async () => antwoord('x'));
    await sw.caches.open('nossy-shell');
    await sw.caches.open('een-andere-app');
    let klaar = null;
    sw.handlers.activate({ waitUntil: (p) => { klaar = p; } });
    await klaar;
    expect(await sw.caches.keys()).not.toContain('nossy-shell');
    expect(await sw.caches.keys()).toContain('een-andere-app');
    const e = { request: { url: 'https://api.themoviedb.org/3/movie/1', method: 'GET', mode: 'cors' }, respondWith: vi.fn(), waitUntil: vi.fn() };
    sw.handlers.fetch(e);
    expect(e.respondWith).not.toHaveBeenCalled();
  });
});
