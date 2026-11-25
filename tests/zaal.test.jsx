// De zaalstemming: de Worker, de gastheer en de telefoons.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen, cleanup, within, waitFor, act } from '@testing-library/react';
import App from '../src/App.jsx';
import { seed } from './helpers.jsx';

describe('Zaalstemming', () => {
  beforeEach(() => { cleanup(); seed(); });

  const PROXY = 'https://nossy-tmdb.songason1-nossytool.workers.dev';
  // Een nep-KV zoals Cloudflare die heeft: alleen get en put
  const nepKV = () => {
    const kv = new Map();
    return { kv, SESSIONS: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); } } };
  };
  const laadWorker = async () => (await import('../worker/worker.js')).default;
  const vraagAan = (w, env) => (pad, body) => w.fetch(new Request(`https://w.dev${pad}`, body
    ? { method: 'POST', body: JSON.stringify(body), headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' } }
    : { headers: { Origin: 'http://localhost:5173' } }), env);
  // De app praat via fetch met de echte Worker-code, met de nep-KV erachter;
  // TMDB beantwoordt `tmdb(url)` (of een leeg antwoord)
  const via = (w, env, tmdb = () => null) => async (url, opts = {}) => {
    const u = String(url);
    if (u.startsWith(`${PROXY}/zaal`)) {
      return w.fetch(new Request(u.replace(PROXY, 'https://w.dev'), {
        method: opts.method || 'GET', body: opts.body,
        headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' },
      }), env);
    }
    const antwoord = tmdb(u);
    return { ok: true, status: 200, json: async () => antwoord || {} };
  };
  // Meteen opnieuw ophalen, zoals wanneer je het tabblad weer opent
  const peil = async () => {
    await act(async () => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
  };
  const tA = 'a'.repeat(32);
  const tB = 'b'.repeat(32);
  const tC = 'c'.repeat(32);
  // Een film zoals TMDB hem geeft, voor de aanraders
  const tmdbFilm = (id, title, jaar, { vote = 7.5, votes = 2000, runtime = 110, lijsten = 2000, genres = ['Drama'], director = null, collectie = null } = {}) => ({
    id, title, release_date: `${jaar}-01-01`, runtime, genres: genres.map((name) => ({ name })),
    vote_average: vote, vote_count: votes, poster_path: `/p${id}.jpg`, backdrop_path: null, overview: '',
    credits: { crew: director ? [{ job: 'Director', name: director, id: 1 }] : [], cast: [] },
    belongs_to_collection: collectie ? { id: collectie } : null, videos: { results: [{ site: 'YouTube', type: 'Trailer', key: `trailer${id}` }] },
    recommendations: { results: [] }, 'watch/providers': { results: {} }, keywords: { keywords: [] },
    lists: { total_results: lijsten }, release_dates: { results: [{ release_dates: [{ type: 3 }] }] },
  });
  const licht = (f) => ({ id: f.id, title: f.title, release_date: f.release_date, vote_average: f.vote_average, vote_count: f.vote_count, poster_path: f.poster_path, genre_ids: [18], original_language: 'en' });

  it('stemmen gaan op volgorde de deur uit: een snelle 2e keus wordt nooit door een trage 1e overschreven', async () => {
    const { stemRij } = await import('../src/lib/zaalstemming.js');
    const aangekomen = [];
    let los;
    const traag = new Promise((r) => { los = r; });
    const stuur = async (k) => {
      if (k === 'a') await traag;
      if (k === 'kapot') throw new Error('DRUK');
      aangekomen.push(k);
      return { ok: k };
    };
    const rij = stemRij(stuur);
    const a = rij('a');
    const b = rij('b');
    const c = rij('c');
    // b werd ingehaald voor hij wegging: die gaat niet meer
    expect(await b).toEqual({ ingehaald: true });
    los();
    expect(await a).toEqual({ ok: 'a' });
    expect(await c).toEqual({ ok: 'c' });
    expect(aangekomen).toEqual(['a', 'c']);
    // een fout komt bij de afzender terug, en de rij loopt door
    await expect(rij('kapot')).rejects.toThrow('DRUK');
    expect(await rij('d')).toEqual({ ok: 'd' });
  });

  it('regels: stemmen als 1e en 2e keus, punten, de breedste steun, en de films', async () => {
    const { uitslagGenre, kiesFilms, uitslagFilm, stemZet, telStemmen, zaalCode, youtubeId, genreOpties, breedGedragen } = await import('../src/lib/zaalstemming.js');
    // een stem zetten, wisselen en terugnemen
    expect(stemZet([], 'x', 0)).toEqual(['x', null]);
    expect(stemZet(['x', null], 'y', 1)).toEqual(['x', 'y']);
    expect(stemZet(['x', 'y'], 'y', 0)).toEqual(['y', 'x']);
    expect(stemZet(['x', 'y'], 'z', 0)).toEqual(['z', 'y']);
    expect(stemZet(['x', 'y'], 'x', 0)).toEqual([null, 'y']);
    expect(stemZet([null, 'y'], 'y', 1)).toEqual([]);
    expect(stemZet(['x', null], 'x', 1)).toEqual([null, 'x']);

    const drie = [{ key: 'x' }, { key: 'y' }, { key: 'z' }];
    // 2 punten voor een 1e keus, 1 voor een 2e
    expect(telStemmen(['x', 'y', 'z'], [['x', 'y'], ['y', null], [null, 'x']]).punten).toEqual({ x: 3, y: 3, z: 0 });
    expect(uitslagFilm(drie, [['x', 'y'], ['x', 'z'], ['y', 'x']])).toMatchObject({ key: 'x', wijze: 'meeste' });
    // twee mensen, elk een andere favoriet maar dezelfde 2e keus: die 2e keus wint
    expect(uitslagFilm(drie, [['x', 'z'], ['y', 'z']])).toMatchObject({ key: 'z', wijze: 'breed', punten: { x: 2, y: 2, z: 2 }, lijstjes: { x: 1, y: 1, z: 2 } });
    // echt gelijk: het lot, alleen tussen die films
    expect(uitslagFilm(drie, [['x', 'y'], ['y', 'x']], () => 0.99)).toMatchObject({ key: 'y', wijze: 'lot', kandidaten: ['x', 'y'] });

    const lijst = [['a', ['Drama', 'Thriller']], ['b', ['Drama', 'Thriller']], ['c', ['Drama', 'Thriller']],
      ['d', ['Horror']], ['e', ['Horror']], ['g', ['Horror']], ['h', ['Komedie']], ['i', ['Komedie']], ['j', ['Komedie']]];
    const pool = lijst.map(([key]) => ({ key, name: key.toUpperCase(), year: 2000 }));
    const meta = Object.fromEntries(lijst.map(([key, genres]) => [key, { genres, vote: 7, trailer: `https://www.youtube.com/watch?v=tr${key}12345` }]));
    const opties = genreOpties(pool, meta);
    expect(opties.map((o) => o.id)).toEqual(['Drama', 'Horror', 'Komedie', 'Thriller']);
    expect(uitslagGenre({ opties, stemmen: [['Horror', 'Drama'], ['Horror', null], ['Drama', 'Horror']], pool, meta, nodig: 3 }))
      .toMatchObject({ namen: ['Horror'], wijze: 'meeste', punten: 5 });
    expect(uitslagGenre({ opties, stemmen: [['Horror', 'Drama'], ['Komedie', 'Drama']], pool, meta, nodig: 3 }))
      .toMatchObject({ namen: ['Drama'], wijze: 'breed' });
    // helemaal gelijk, en er zijn genoeg films die allebei zijn
    expect(uitslagGenre({ opties, stemmen: [['Drama', 'Thriller'], ['Thriller', 'Drama']], pool, meta, nodig: 3 }))
      .toMatchObject({ namen: ['Drama', 'Thriller'], wijze: 'allebei' });
    // helemaal gelijk zonder genoeg overlap: van elk wat
    expect(uitslagGenre({ opties, stemmen: [['Horror', 'Komedie'], ['Komedie', 'Horror']], pool, meta, nodig: 3 }))
      .toMatchObject({ namen: ['Horror', 'Komedie'], wijze: 'elkWat' });
    expect(uitslagGenre({ opties, stemmen: [], pool, meta })).toMatchObject({ namen: [], wijze: 'alles' });
    // de meeste punten wint, en een 2e genre dat maar bij één persoon op het
    // lijstje staat, komt er niet bij (1e Horror 2e Komedie, 1e Komedie 2e Drama)
    expect(uitslagGenre({ opties, stemmen: [['Horror', 'Komedie'], ['Komedie', 'Drama']], pool, meta, nodig: 3 }))
      .toMatchObject({ namen: ['Komedie'], wijze: 'meeste', punten: 3 });
    // valt een 2e keus weg, dan is het ineens gelijk: daarom telt het scherm vers
    expect(uitslagGenre({ opties, stemmen: [['Horror', null], ['Komedie', 'Drama']], pool, meta, nodig: 3 }))
      .toMatchObject({ namen: ['Horror', 'Komedie'], wijze: 'elkWat' });
    // het 2e genre staat bij iedereen op het lijstje en zit er dichtbij: films die allebei zijn
    const breedVoor = [['Drama', 'Thriller'], ['Drama', 'Thriller'], ['Thriller', 'Drama']];
    expect(uitslagGenre({ opties, stemmen: breedVoor, pool, meta, nodig: 3 }))
      .toMatchObject({ namen: ['Drama', 'Thriller'], wijze: 'ook', punten: 5 });
    expect(kiesFilms(pool, meta, { namen: ['Drama', 'Thriller'], wijze: 'ook' }, [], 5, () => 0.5).map((f) => f.key).sort()).toEqual(['a', 'b', 'c']);
    // maar niet als er te weinig films zijn die allebei zijn
    expect(uitslagGenre({ opties, stemmen: breedVoor, pool, meta, nodig: 4 })).toMatchObject({ namen: ['Drama'], wijze: 'meeste' });
    // gelijk op punten, de breedste wint, en de verliezer had ook brede steun
    expect(uitslagGenre({ opties, stemmen: [...breedVoor, ['Horror', 'Thriller']], pool, meta, nodig: 3 }))
      .toMatchObject({ namen: ['Thriller', 'Drama'], wijze: 'ook' });
    // twee genres delen de 2e plek: dan is er geen tweede
    const telling = { punten: { a: 4, b: 3, c: 3 }, lijstjes: { a: 2, b: 2, c: 2 } };
    expect(breedGedragen('a', ['a', 'b', 'c'], telling, 3)).toBeNull();
    expect(breedGedragen('a', ['a', 'b', 'c'], { ...telling, punten: { a: 4, b: 3, c: 1 } }, 3)).toBe('b');
    expect(breedGedragen('a', ['a', 'b'], { punten: { a: 3, b: 2 }, lijstjes: { a: 2, b: 1 } }, 2)).toBeNull();
    const { genreZin } = await import('../src/components/ZaalDelen.jsx');
    expect(genreZin({ namen: ['Drama', 'Thriller'], wijze: 'ook', punten: 5 }, (k, v) => `${k} ${JSON.stringify(v)}`))
      .toBe('zaal.g_ook {"count":5,"tweede":"Thriller"}');

    const keys = (fs) => fs.map((f) => f.key).sort();
    expect(keys(kiesFilms(pool, meta, { namen: ['Horror'], wijze: 'meeste' }, [], 5, () => 0.5))).toEqual(['d', 'e', 'g']);
    expect(keys(kiesFilms(pool, meta, { namen: ['Drama', 'Thriller'], wijze: 'allebei' }, [], 5, () => 0.5))).toEqual(['a', 'b', 'c']);
    const elk = kiesFilms(pool, meta, { namen: ['Horror', 'Komedie'], wijze: 'elkWat' }, [], 5, () => 0.1);
    expect(elk).toHaveLength(5);
    expect(elk.every((f) => ['Horror', 'Komedie'].some((g) => meta[f.key].genres.includes(g)))).toBe(true);
    // films met een trailer gaan voor
    const zonder = Object.fromEntries(Object.entries(meta).map(([k, m]) => [k, { ...m, trailer: ['d', 'h', 'j'].includes(k) ? m.trailer : null }]));
    expect(keys(kiesFilms(pool, zonder, { namen: [], wijze: 'alles' }, [], 3, () => 0.5))).toEqual(['d', 'h', 'j']);
    expect(zaalCode(' kmrt ')).toBe('KMRT');
    expect(zaalCode('KMRO')).toBeNull();
    expect(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  // TMDB in de tests: elke /movie/<id> geeft de film uit `films`, de rest 404
  const metTmdb = async (films, fn) => {
    const oud = global.fetch;
    global.fetch = async (u) => {
      const f = films[String(u).match(/\/movie\/(\d+)/)?.[1]];
      return f ? { ok: true, status: 200, json: async () => f } : { ok: false, status: 404, json: async () => ({}) };
    };
    try { return await fn(); } finally { global.fetch = oud; }
  };
  // Zoals Discover een film teruggeeft
  const gevonden = (f, genre_ids = [18]) => ({ id: f.id, title: f.title, year: +f.release_date.slice(0, 4), vote: f.vote_average, votes: f.vote_count, genre_ids });
  const rec = (id, title, jaar, genre_ids = [18], vote = 7.6, votes = 3000) => ({ id, title, year: jaar, poster: '/x.jpg', vote, votes, genre_ids });

  it('aanraders: van buiten de lijst, in het genre en binnen de filters, zonder opgeblazen cijfers', async () => {
    const { zoekAanraders, genreIds, PAREL_TOT, IEDEREEN_VANAF } = await import('../src/lib/aanraders.js');
    expect(genreIds(['Drama', 'Sciencefiction', 'Onbekend'])).toEqual([18, 878]);
    const meta = {
      'een|2001': { id: 1, title: 'Een', recs: [rec(77, 'Aangeraden', 2015), rec(88, 'Eng', 2016, [27]), rec(99, 'Al op de lijst', 2010)] },
      'twee|2002': { id: 2, title: 'Twee', recs: [rec(77, 'Aangeraden', 2015)] },
      'al op de lijst|2010': { id: 99, title: 'Al op de lijst' },
    };
    const films = {
      77: tmdbFilm(77, 'Aangeraden', 2015, { vote: 7.6, votes: 3000 }),
      101: tmdbFilm(101, 'Bekend', 2012, { vote: 8.0, votes: 3000, runtime: 100 }),
      102: tmdbFilm(102, 'Parel', 2019, { vote: 7.4, votes: 300, runtime: 95 }),
      103: tmdbFilm(103, 'Bots', 2021, { vote: 9.6, votes: 100 }),
      104: tmdbFilm(104, 'Kort', 2020, { vote: 7.8, votes: 1500, runtime: 20 }),
      105: tmdbFilm(105, 'Fans', 2018, { vote: 8.2, votes: 4000, lijsten: 10 }),
      106: tmdbFilm(106, 'Te lang', 2017, { vote: 7.8, votes: 2000, runtime: 150 }),
    };
    const vragen = [];
    const ontdek = async (sleutel, opties) => {
      vragen.push(opties);
      return { results: (opties.maxVotes === PAREL_TOT ? [102, 103] : [101, 104, 105, 106]).map((id) => gevonden(films[id])) };
    };
    const uit = await metTmdb(films, () => zoekAanraders({
      sleutel: 'x', meta, genre: { namen: ['Drama'], wijze: 'meeste' }, filters: { maxDuur: 120 },
      uit: { ids: new Set([1, 2, 99]), keys: new Set(['een|2001', 'twee|2002', 'al op de lijst|2010']) },
      rnd: () => 0.5, ontdek,
    }));
    expect(uit.map((a) => a.film.name).sort()).toEqual(['Aangeraden', 'Bekend', 'Parel']);
    expect(uit.find((a) => a.film.name === 'Aangeraden')).toMatchObject({ bronnen: 2, via: ['Een', 'Twee'] });
    expect(uit.find((a) => a.film.name === 'Parel').parel).toBe(true);
    expect(uit.find((a) => a.film.name === 'Bekend').m.trailer).toBe('https://www.youtube.com/watch?v=trailer101');
    // Discover zoekt binnen hetzelfde genre en dezelfde lengte, zonder de
    // klassiekers die iedereen al zag; zonder diensten geen derde zoektocht
    expect(vragen[0]).toMatchObject({ genreIds: ['18'], maxRuntime: 120, minRuntime: 40, maxVotes: IEDEREEN_VANAF });
    expect(vragen.some((v) => v.maxVotes === PAREL_TOT)).toBe(true);
    expect(vragen).toHaveLength(2);
  });

  it('aanraders: een 8 van een handvol stemmen telt alleen als IMDb het bevestigt', async () => {
    const { zoekAanraders } = await import('../src/lib/aanraders.js');
    const films = {
      701: { ...tmdbFilm(701, 'Tandenfee', 2025, { vote: 8.5, votes: 67, lijsten: 21 }), imdb_id: 'tt701' },
      702: { ...tmdbFilm(702, 'Kleine Parel', 2019, { vote: 8.1, votes: 62, lijsten: 21 }), imdb_id: 'tt702' },
      703: tmdbFilm(703, 'Oneens', 2016, { vote: 7.8, votes: 500 }),
      704: tmdbFilm(704, 'Gewoon Een', 2010, { vote: 7.4, votes: 3000 }),
      705: tmdbFilm(705, 'Gewoon Twee', 2005, { vote: 7.3, votes: 3000 }),
    };
    const ontdek = async () => ({ results: Object.values(films).map((f) => gevonden(f)) });
    const zoek = async (extra = {}) => (await metTmdb(films, () => zoekAanraders({
      sleutel: 'x', meta: {}, genre: { namen: [], wijze: 'alles' }, filters: {}, aantal: 5,
      uit: { ids: new Set(), keys: new Set() }, rnd: () => 0.5, ontdek, ...extra,
    }))).map((a) => a.film.name);
    // Zonder OMDb: niets om het cijfer aan te toetsen, dus geen van beide
    const zonder = await zoek();
    expect(zonder).not.toContain('Tandenfee');
    expect(zonder).not.toContain('Kleine Parel');
    expect(zonder).toContain('Gewoon Een');
    // Met OMDb vraagt de zaal het zelf, alleen voor de verdachte films:
    // IMDb bevestigt de parel en zet de tandenfee op zijn plek (5,2)
    const gevraagd = [];
    const imdb = { tt701: 5.2, tt702: 7.6 };
    const met = await zoek({ tweedeMening: async (m) => { gevraagd.push(m.id); return { imdb: imdb[m.imdbId], mc: null }; } });
    expect(met).toContain('Kleine Parel');
    expect(met).not.toContain('Tandenfee');
    expect(gevraagd.sort()).toEqual([701, 702]);
    // Wat Voor jou al wist, hoeft niet opnieuw; en ligt IMDb ver onder TMDB
    // (Oneens: 7,8 tegen 6,0), dan telt IMDb en haalt hij de lat niet
    gevraagd.length = 0;
    const uitCache = await zoek({ details: { 701: { imdb: 5.2 }, 702: { imdb: 7.6 }, 703: { imdb: 6.0 } }, tweedeMening: async (m) => { gevraagd.push(m.id); return null; } });
    expect(uitCache).toContain('Kleine Parel');
    expect(uitCache).not.toContain('Oneens');
    expect(gevraagd).toEqual([]);
    // Een kapotte OMDb is geen ramp: dan zonder
    const kapot = await zoek({ tweedeMening: async () => { throw new Error('OMDb 500'); } });
    expect(kapot).toEqual(zonder);
  });

  it('aanraders: de films op tafel en de favorieten wegen, liever-niet zakt, afgewezen en al gezien vallen af', async () => {
    const { zoekAanraders, verzamelKandidaten } = await import('../src/lib/aanraders.js');
    const meta = {
      'tafel|2001': { id: 11, title: 'Tafel', genres: ['Drama'], recs: [rec(201, 'Van tafel', 2011), rec(206, 'Afgewezen', 2012), rec(208, 'Al Gezien', 2016)] },
      'lijst|2002': { id: 12, title: 'Lijst', genres: ['Drama'], recs: [rec(202, 'Van lijst', 2013), rec(204, 'Afgeraden', 2014)] },
      'favoriet|1999': { id: 13, title: 'Favoriet', genres: ['Drama'], recs: [rec(203, 'Van favoriet', 2009)] },
      'nee|1998': { id: 14, title: 'Nee', genres: ['Drama'], recs: [rec(204, 'Afgeraden', 2014)] },
    };
    const sterren = { 'favoriet|1999': 5, 'nee|1998': 1 };
    const lijst = new Set(['tafel|2001', 'lijst|2002']);
    const bewaard = [{ id: 205, title: 'Bewaard', year: 2018, poster: '/b.jpg', vote: 7.6, genre_ids: [18] }];
    const uit = { ids: new Set([11, 12, 13, 14]), keys: new Set([...Object.keys(meta), 'al gezien|2015']) };
    // zonder netwerk: wat de app al weet, en hoe sterk
    const { kandidaten, anti } = verzamelKandidaten({ meta, tafel: ['tafel|2001'], lijst, sterren, bewaard, isBekend: (r) => r.id === 208 });
    expect(kandidaten.get(201)).toMatchObject({ waarde: 1.4, bronnen: 1 });
    expect(kandidaten.get(202)).toMatchObject({ waarde: 0.5, bronnen: 1 });
    expect(kandidaten.get(203)).toMatchObject({ waarde: 1.8, bronnen: 0 });
    expect(kandidaten.has(208)).toBe(false);
    expect(anti.get(204)).toBe(2);

    const films = Object.fromEntries([[201, 'Van tafel', 2011], [202, 'Van lijst', 2013], [203, 'Van favoriet', 2009], [204, 'Afgeraden', 2014], [205, 'Bewaard', 2018], [206, 'Afgewezen', 2012], [208, 'Al Gezien', 2016]]
      .map(([id, t, j]) => [id, tmdbFilm(id, t, j, { vote: 7.6, votes: 3000 })]));
    const gekozen = await metTmdb(films, () => zoekAanraders({
      sleutel: 'x', meta, genre: { namen: ['Drama'], wijze: 'meeste' }, filters: {}, uit,
      tafel: ['tafel|2001'], lijst, sterren, bewaard, afgewezen: [{ id: 206, reden: 'saai' }],
      rnd: () => 0.5, ontdek: async () => ({ results: [] }),
    }));
    expect(gekozen.map((a) => a.film.name).sort()).toEqual(['Bewaard', 'Van favoriet', 'Van tafel']);
    // het waarom noemt de film op tafel; een favoriet staat niet op de lijst
    expect(gekozen.find((a) => a.film.name === 'Van tafel')).toMatchObject({ bronnen: 1, via: ['Tafel'] });
    expect(gekozen.find((a) => a.film.name === 'Van favoriet')).toMatchObject({ bronnen: 0, via: [] });
  });

  it('aanraders: drie verschillende, een parel op de laatste plek, en wat de zaal al zag zakt', async () => {
    const { zoekAanraders } = await import('../src/lib/aanraders.js');
    const films = {
      301: tmdbFilm(301, 'Regisseur Een', 2015, { vote: 8.2, votes: 5000, director: 'Dezelfde' }),
      302: tmdbFilm(302, 'Regisseur Twee', 1995, { vote: 8.1, votes: 5000, director: 'Dezelfde' }),
      303: tmdbFilm(303, 'Reeks Een', 2005, { vote: 8.0, votes: 5000, collectie: 9 }),
      304: tmdbFilm(304, 'Reeks Twee', 1985, { vote: 7.9, votes: 5000, collectie: 9 }),
      305: tmdbFilm(305, 'Gewoon', 1975, { vote: 7.4, votes: 3000 }),
      306: tmdbFilm(306, 'Kleine Parel', 2019, { vote: 7.6, votes: 400 }),
    };
    const ontdek = async () => ({ results: Object.values(films).map((f) => gevonden(f)) });
    const zoek = (extra = {}) => metTmdb(films, () => zoekAanraders({
      sleutel: 'x', meta: {}, genre: { namen: ['Drama'], wijze: 'meeste' }, filters: {},
      uit: { ids: new Set(), keys: new Set() }, rnd: () => 0.5, ontdek, nu: 100 * 86400e3, ...extra,
    }));
    // niet twee van dezelfde regisseur of reeks; de parel krijgt de laatste plek
    expect((await zoek()).map((a) => a.film.name)).toEqual(['Regisseur Een', 'Reeks Een', 'Kleine Parel']);
    // Reeks Een zag de zaal gisteren: dan liever het andere deel
    expect((await zoek({ getoond: { 303: 99 * 86400e3 } })).map((a) => a.film.name)).toEqual(['Regisseur Een', 'Reeks Twee', 'Kleine Parel']);
  });

  it('aanraders: van elk wat, de eigen diensten, en een tweede ronde als de filmdata niet komt', async () => {
    const { zoekAanraders } = await import('../src/lib/aanraders.js');
    const films = {
      501: tmdbFilm(501, 'Drama Een', 2015, { vote: 8.0, votes: 4000 }),
      502: tmdbFilm(502, 'Drama Twee', 2005, { vote: 7.9, votes: 4000 }),
      503: tmdbFilm(503, 'Drama Drie', 1995, { vote: 7.8, votes: 4000 }),
      504: tmdbFilm(504, 'Eng', 1985, { vote: 7.5, votes: 4000, genres: ['Horror'] }),
    };
    const vragen = [];
    const ontdek = async (s, opties) => {
      vragen.push(opties);
      return { results: Object.values(films).map((f) => gevonden(f, f.id === 504 ? [27] : [18])) };
    };
    const elk = await metTmdb(films, () => zoekAanraders({
      sleutel: 'x', meta: {}, genre: { namen: ['Drama', 'Horror'], wijze: 'elkWat' }, stemmen: { Drama: 3, Horror: 3 }, filters: {},
      uit: { ids: new Set(), keys: new Set() }, rnd: () => 0.5, ontdek, dienstIds: [8],
    }));
    expect(elk.map((a) => a.film.name)).toContain('Eng');
    expect(vragen.find((v) => v.providerIds)).toMatchObject({ providerIds: [8], genreIds: ['18|27'] });

    // de eerste acht komen niet: dan haalt hij de volgende
    const veel = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [600 + i, tmdbFilm(600 + i, `Film ${i}`, 1960 + i * 4, { vote: 8.4 - i * 0.05, votes: 3000 })]));
    const kapot = Object.fromEntries(Object.entries(veel).filter(([id]) => +id >= 608));
    const tweede = await metTmdb(kapot, () => zoekAanraders({
      sleutel: 'x', meta: {}, genre: { namen: [], wijze: 'alles' }, filters: {},
      uit: { ids: new Set(), keys: new Set() }, rnd: () => 0.5, ontdek: async () => ({ results: Object.values(veel).map((f) => gevonden(f)) }),
    }));
    expect(tweede).toHaveLength(3);
    expect(tweede.every((a) => a.m.id >= 608)).toBe(true);
  });

  it('aanraders: het cijfer voor een groep, bekendheid, en wat de zaal al zag', async () => {
    const { zaalCijfer, bekendheid, eerderGetoond, onthoudGetoond, pastBijStemmen, dienstIdsVoor } = await import('../src/lib/aanraders.js');
    expect(zaalCijfer(7.4, 300)).toBeCloseTo(6.991, 3);
    expect(zaalCijfer(7.6, 3000)).toBeCloseTo(7.515, 3);
    expect(bekendheid(9000)).toBe(0);
    expect(bekendheid(60000)).toBeCloseTo(-1, 5);
    expect(bekendheid(900000)).toBe(-1.2);
    const dag = 86400e3;
    expect(eerderGetoond({ 7: 10 * dag }, 7, 10 * dag)).toBeCloseTo(-1.2, 5);
    expect(eerderGetoond({ 7: 10 * dag }, 7, 20 * dag)).toBeCloseTo(-1.2 * (11 / 21), 5);
    expect(eerderGetoond({ 7: 10 * dag }, 7, 31 * dag)).toBe(0);
    expect(eerderGetoond({}, 7, 10 * dag)).toBe(0);
    // onthouden: nieuw erbij, ouder dan 60 dagen eruit
    expect(onthoudGetoond({ 1: 0, 2: 50 * dag }, [3, 2], 70 * dag)).toEqual({ 2: 70 * dag, 3: 70 * dag });
    expect(Object.keys(onthoudGetoond({}, Array.from({ length: 90 }, (_, i) => i), 0))).toHaveLength(80);
    // de 2e keuzes tellen mee, hooguit 1,5
    const aandeel = new Map([[18, 1], [53, 0.75], [27, 0.75]]);
    expect(pastBijStemmen([18], aandeel)).toBe(1);
    expect(pastBijStemmen([18, 53, 27], aandeel)).toBe(1.5);
    expect(dienstIdsVoor(['Netflix', 'MUBI'], { regio: 'NL', lijst: [{ id: 8, naam: 'Netflix' }, { id: 11, naam: 'MUBI' }] }, 'NL')).toEqual([8, 11]);
    expect(dienstIdsVoor(['Netflix'], { regio: 'BE', lijst: [{ id: 8, naam: 'Netflix' }] }, 'NL')).toEqual([]);
  });

  it('qr: zelf getekend, en klopt met de waarden uit de standaard', async () => {
    const { rsRest, rsDeler, formaatBits, versieBits, dataCodewoorden, qrCode, qrPad } = await import('../src/lib/qr.js');
    // Reed-Solomon: het bekende HELLO WORLD-voorbeeld, versie 1-M
    expect(rsRest([32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17], rsDeler(10))).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
    const f = (n, m) => formaatBits(n, m).toString(2).padStart(15, '0');
    expect([f('L', 0), f('L', 4), f('M', 0), f('M', 1), f('H', 0)]).toEqual(['111011111000100', '110011000101111', '101010000010010', '101000100100101', '001011010001001']);
    expect(versieBits(7)).toBe(0x07c94);
    expect([1, 4, 5, 10].map((v) => dataCodewoorden(v, 'M'))).toEqual([16, 64, 86, 216]);
    // de link naar een zaal past in versie 4 (33 bij 33), met de drie zoekpatronen
    const qr = qrCode('https://nossysfilmtool.github.io/letterboxd-picker/?zaal=XANU');
    expect([qr.versie, qr.size]).toEqual([4, 33]);
    const ring = (cx, cy) => [-3, -2, -1, 0, 1, 2, 3].every((dy) => [-3, -2, -1, 0, 1, 2, 3].every((dx) => qr.modules[cy + dy][cx + dx] === (Math.max(Math.abs(dx), Math.abs(dy)) !== 2)));
    expect(ring(3, 3) && ring(29, 3) && ring(3, 29)).toBe(true);
    expect(qr.modules[25][8]).toBe(true);
    expect(qrPad(qr)).toMatch(/^M4,4h1v1h-1z/);
  });

  it('worker: een zaal met een geheim, een eigen sleutel per stemmer, stemmen terugnemen', async () => {
    const { kv, SESSIONS } = nepKV();
    const vraag = vraagAan(await laadWorker(), { SESSIONS, TMDB_KEY: 'x' });
    const nieuw = await (await vraag('/zaal/new', {})).json();
    expect(nieuw.code).toMatch(/^[A-HJ-NP-Z]{4}$/);
    expect(nieuw.versie).toBe(1);
    const C = nieuw.code;
    const open = await (await vraag(`/zaal/${C}`)).json();
    expect(open).toMatchObject({ type: 'zaal', fase: 'lobby', spelers: [] });
    expect(open._geheim).toBeUndefined();
    expect(kv.get(`z:${C}`)).not.toContain(nieuw.geheim);
    expect((await vraag(`/zaal/${C}/meedoen`, { naam: ' Anna ', token: tA })).status).toBe(200);
    expect((await vraag(`/zaal/${C}/meedoen`, { naam: 'Bram', token: tB })).status).toBe(200);
    const bezet = await vraag(`/zaal/${C}/meedoen`, { naam: 'anna', token: tC });
    expect(bezet.status).toBe(409);
    expect((await bezet.json()).error).toBe('NAAM_BEZET');
    expect((await vraag(`/zaal/${C}/meedoen`, { naam: 'Anna', token: tA })).status).toBe(200);
    expect((await (await vraag(`/zaal/${C}`)).json()).spelers).toEqual(['Anna', 'Bram']);
    // alleen het scherm zet de rondes, en wie meedoet houdt de Worker bij
    expect((await vraag(`/zaal/${C}/zet`, { geheim: 'fout', staat: { fase: 'genre' } })).status).toBe(403);
    const opties = [{ id: 'Drama', naam: 'Drama', n: 4 }, { id: 'Horror', naam: 'Horror', n: 3 }];
    const zet = await (await vraag(`/zaal/${C}/zet`, { geheim: nieuw.geheim, staat: { fase: 'genre', ronde: 1, opties, spelers: ['Indringer'], extra: 'weg' } })).json();
    expect(zet.zaal).toMatchObject({ fase: 'genre', ronde: 1, opties, spelers: ['Anna', 'Bram'] });
    expect(zet.zaal.extra).toBeUndefined();
    expect((await (await vraag(`/zaal/${C}/meedoen`, { naam: 'Cas', token: tC })).json()).error).toBe('BEGONNEN');
    // een stem is [1e, 2e]: alleen op wat er ligt, met je eigen token, in deze ronde
    expect((await vraag(`/zaal/${C}/stem`, { naam: 'Anna', token: tA, ronde: 1, keuze: ['Drama', 'Horror'] })).status).toBe(200);
    expect((await vraag(`/zaal/${C}/stem`, { naam: 'Bram', token: tB, ronde: 1, keuze: [null, 'Horror'] })).status).toBe(200);
    expect((await vraag(`/zaal/${C}/stem`, { naam: 'Bram', token: tA, ronde: 1, keuze: ['Horror'] })).status).toBe(403);
    expect((await vraag(`/zaal/${C}/stem`, { naam: 'Bram', token: tB, ronde: 1, keuze: ['Western'] })).status).toBe(400);
    expect((await vraag(`/zaal/${C}/stem`, { naam: 'Bram', token: tB, ronde: 1, keuze: ['Horror', 'Horror'] })).status).toBe(400);
    expect((await vraag(`/zaal/${C}/stem`, { naam: 'Bram', token: tB, ronde: 0, keuze: ['Horror'] })).status).toBe(409);
    expect((await vraag(`/zaal/${C}/stand`, { geheim: 'fout' })).status).toBe(403);
    expect((await (await vraag(`/zaal/${C}/stand`, { geheim: nieuw.geheim })).json()).stemmen).toEqual({ Anna: { 1: ['Drama', 'Horror'] }, Bram: { 1: [null, 'Horror'] } });
    // terugnemen: een lege stem haalt hem weg
    expect((await vraag(`/zaal/${C}/stem`, { naam: 'Bram', token: tB, ronde: 1, keuze: [] })).status).toBe(200);
    expect((await (await vraag(`/zaal/${C}/stand`, { geheim: nieuw.geheim })).json()).stemmen.Bram).toEqual({});
    // twaalf films op tafel (lijst, aanraders, voordrachten), aanraders met waarom
    const films = Array.from({ length: 13 }, (_, i) => ({ key: `f${i}|2000`, name: `F${i}`, year: 2000, poster: '/x.jpg', trailer: 'abcdef123', score: 7.25 }));
    films[0].poster = 'javascript:x';
    Object.assign(films[6], { aanrader: true, bronnen: 3, parel: false, votes: 4000 });
    const genre = { namen: ['Drama', 'Horror'], wijze: 'ook', punten: 5 };
    const r2 = await (await vraag(`/zaal/${C}/zet`, { geheim: nieuw.geheim, staat: { fase: 'film', ronde: 2, films, genre } })).json();
    expect(r2.zaal.genre).toEqual(genre);
    expect(r2.zaal.films).toHaveLength(12);
    expect(r2.zaal.films[0].poster).toBeNull();
    expect(r2.zaal.films[1]).toMatchObject({ poster: '/x.jpg', trailer: 'abcdef123', score: 7.3 });
    expect(r2.zaal.films[1].aanrader).toBeUndefined();
    expect(r2.zaal.films[6]).toMatchObject({ aanrader: true, bronnen: 3, parel: false, votes: 4000 });
    expect((await vraag(`/zaal/${C}/stem`, { naam: 'Bram', token: tB, ronde: 2, keuze: ['f7|2000', 'f1|2000'] })).status).toBe(200);
    expect((await vraag(`/zaal/${C}/stem`, { naam: 'Bram', token: tB, ronde: 2, keuze: ['f12|2000'] })).status).toBe(400);
    expect((await (await vraag(`/zaal/${C}/stand`, { geheim: nieuw.geheim })).json()).stemmen.Bram).toEqual({ 2: ['f7|2000', 'f1|2000'] });
    // botst een schrijver met KV, dan 429: de app probeert het zo opnieuw
    SESSIONS.put = async () => { throw new Error('KV PUT failed: 429 Too Many Requests'); };
    expect((await vraag(`/zaal/${C}/stem`, { naam: 'Anna', token: tA, ronde: 2, keuze: ['f1|2000'] })).status).toBe(429);
  });

  it('de hele avond op het scherm: 1e en 2e keuzes, vijf films plus aanraders, de breedste steun wint', async () => {
    const { kv, SESSIONS } = nepKV();
    const env = { SESSIONS, TMDB_KEY: 'x' };
    const aanraders = {
      901: tmdbFilm(901, 'Parel Een', 2019, { vote: 7.9, votes: 300 }),
      902: tmdbFilm(902, 'Bekend Twee', 2011, { vote: 8.1, votes: 5000 }),
      903: tmdbFilm(903, 'Bekend Drie', 2008, { vote: 7.6, votes: 2500 }),
      904: tmdbFilm(904, 'Botfilm', 2022, { vote: 9.4, votes: 120 }),
      905: tmdbFilm(905, 'Aftersun', 2022, { vote: 7.7, votes: 3000 }),
    };
    const tmdb = (u) => {
      if (u.includes('/discover/movie')) return { results: Object.values(aanraders).map((f) => ({ ...licht(f) })) };
      const m = u.match(/\/movie\/(\d+)\?/);
      return m ? aanraders[m[1]] || null : null;
    };
    global.fetch = via(await laadWorker(), env, tmdb);
    const { doeMee, stuurStem, haalZaal } = await import('../src/lib/zaalstemming.js');
    const meta = JSON.parse(localStorage.getItem('picker.meta'));
    ['stalker|1979', 'whiplash|2014', 'first cow|2019'].forEach((k) => { meta[k].genres = [...meta[k].genres, 'Thriller']; });
    Object.values(meta).forEach((m, i) => { m.trailer = `https://www.youtube.com/watch?v=trailer${i}xyz`; });
    localStorage.setItem('picker.meta', JSON.stringify(meta));
    try {
      render(<App />);
      fireEvent.click(screen.getAllByLabelText('Filmavond')[0]);
      fireEvent.click(screen.getByText('Open de zaal'));
      expect(await screen.findByText('Pak je telefoon')).toBeTruthy();
      const code = document.querySelector('.zs-code').textContent;
      expect(code).toMatch(/^[A-Z]{4}$/);
      const qr = screen.getByRole('img', { name: `QR-code met de link naar zaal ${code}` });
      expect(qr.querySelector('path').getAttribute('d').length).toBeGreaterThan(1000);
      const spel = screen.getByRole('group', { name: 'Zo speelt de zaal' });
      expect(within(spel).getByRole('button', { name: '3 aanraders van buiten de lijst' }).getAttribute('aria-pressed')).toBe('true');
      expect(within(spel).getByRole('button', { name: '5 films' }).getAttribute('aria-pressed')).toBe('true');
      await waitFor(() => expect(JSON.parse(kv.get(`z:${code}`)).lb).toBe(true));
      await doeMee(code, 'Anna', tA);
      await doeMee(code, 'Bram', tB);
      fireEvent.click(screen.getByText('Ik doe zelf ook mee, op dit scherm'));
      fireEvent.change(screen.getByLabelText('Je naam op dit scherm'), { target: { value: 'Robin' } });
      await peil();
      fireEvent.click(await screen.findByText('Begin met 3 spelers'));
      expect(await screen.findByText('Waar hebben jullie zin in?')).toBeTruthy();
      expect(document.querySelectorAll('.zs-opties li')).toHaveLength(2);

      // genre: een 1e en een 2e keus, ook vanaf dit scherm
      await stuurStem(code, 'Anna', tA, 1, ['Drama', 'Thriller']);
      await stuurStem(code, 'Bram', tB, 1, ['Thriller', null]);
      fireEvent.click(screen.getByRole('button', { name: 'Eerste keus: Drama' }));
      await waitFor(() => expect(JSON.parse(kv.get(`z:${code}:p:robin`)).stemmen['1']).toEqual(['Drama', null]));
      await peil();
      expect(await screen.findByText('Iedereen heeft een 1e keus. Nog even tijd voor een 2e.')).toBeTruthy();
      // Bram zet nog een 2e keus, na de laatste peiling: het scherm telt vers
      await stuurStem(code, 'Bram', tB, 1, ['Thriller', 'Drama']);
      fireEvent.click(screen.getByText('Sluit de stemming'));
      expect(await screen.findByText('Het wordt Drama')).toBeTruthy();
      expect(document.body.textContent).toContain('Met 5 punten.');
      expect(document.body.textContent).toContain('De slimme pick koos 5 films uit de lijst.');
      expect(document.body.textContent).toContain('Plus 3 aanraders van buiten.');
      // de aanraders: niet van de lijst, geen opgeblazen cijfer, met waarom
      const groepen = [...document.querySelectorAll('.zs-filmgroep')];
      expect(groepen).toHaveLength(2);
      expect(groepen[0].querySelectorAll('.zs-film')).toHaveLength(5);
      const aanr = [...groepen[1].querySelectorAll('.zs-film-titel')].map((e) => e.textContent).sort();
      expect(aanr).toEqual(['Bekend Drie', 'Bekend Twee', 'Parel Een']);
      expect(groepen[1].textContent).toContain('Een parel: hoog gewaardeerd, door 300 mensen.');
      const zaal1 = await haalZaal(code);
      expect(zaal1.films).toHaveLength(8);
      expect(zaal1.films.filter((f) => f.aanrader)).toHaveLength(3);
      // wat de zaal zag, onthoudt het scherm: een volgende avond zakken ze
      expect(Object.keys(JSON.parse(localStorage.getItem('picker.zaalGetoond'))).sort()).toEqual(['901', '902', '903']);

      // de trailers, alle acht
      fireEvent.click(screen.getByText('Bekijk de 8 trailers'));
      expect(screen.getByText('Trailer 1 van 8')).toBeTruthy();
      const doek = document.querySelector('.zs-trailers iframe');
      act(() => {
        window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ event: 'onStateChange', info: 0 }), origin: 'https://www.youtube-nocookie.com', source: doek.contentWindow }));
      });
      expect(screen.getByText('Trailer 2 van 8')).toBeTruthy();
      fireEvent.click(screen.getByText('Sluiten'));
      fireEvent.click(screen.getByText('Nu stemmen'));
      expect(await screen.findByText('Welke wordt het?')).toBeTruthy();
      const ronde = (await haalZaal(code)).ronde;

      // de film: elk een andere favoriet, maar dezelfde 2e keus
      const [een, twee, drie] = zaal1.films.filter((f) => !f.aanrader);
      await stuurStem(code, 'Anna', tA, ronde, [een.key, 'parel een|2019']);
      await stuurStem(code, 'Bram', tB, ronde, [twee.key, 'parel een|2019']);
      // en vanaf dit scherm: kiezen, verplaatsen en terugnemen
      const ek = `Eerste keus: ${drie.name}`;
      const tk = `Tweede keus: ${drie.name}`;
      fireEvent.click(screen.getByRole('button', { name: ek }));
      await waitFor(() => expect(screen.getByRole('button', { name: ek }).getAttribute('aria-pressed')).toBe('true'));
      fireEvent.click(screen.getByRole('button', { name: tk }));
      await waitFor(() => expect(screen.getByRole('button', { name: tk }).getAttribute('aria-pressed')).toBe('true'));
      expect(screen.getByRole('button', { name: ek }).getAttribute('aria-pressed')).toBe('false');
      fireEvent.click(screen.getByRole('button', { name: tk }));
      await waitFor(() => expect(screen.getByRole('button', { name: tk }).getAttribute('aria-pressed')).toBe('false'));
      await waitFor(() => expect(JSON.parse(kv.get(`z:${code}:p:robin`)).stemmen[String(ronde)]).toBeUndefined());
      await peil();
      expect(await screen.findByText('2 van 3 gestemd')).toBeTruthy();
      fireEvent.click(screen.getByText('Sluit de stemming'));
      expect(await screen.findByText('Gelijk op punten. Deze stond op de meeste lijstjes.')).toBeTruthy();
      expect(document.querySelector('.zs-uitslag-titel').textContent).toBe('Parel Een');
      expect(await haalZaal(code)).toMatchObject({ fase: 'uitslag', uitslag: { key: 'parel een|2019', wijze: 'breed' } });

      // het kaartje, met iedereen erop; de aanrader telt als vondst
      fireEvent.click(screen.getByText('Pak het kaartje'));
      expect(await screen.findByText('Gekozen in de zaal')).toBeTruthy();
      await waitFor(() => expect(JSON.parse(localStorage.getItem('picker.kaartjes'))[0]).toMatchObject({ key: 'parel een|2019', bron: 'zaal', personen: 3, namen: ['Anna', 'Bram', 'Robin'], poster: '/p901.jpg' }));
      expect(JSON.parse(localStorage.getItem('picker.vondsten'))['parel een|2019']).toMatchObject({ bron: 'zaal', id: 901 });
    } finally {
      delete global.fetch;
      delete document.hidden;
    }
  });

  it('de telefoon: meedoen, een 1e en 2e keus zetten, verplaatsen en terugnemen, en na herladen nog binnen', async () => {
    const { kv, SESSIONS } = nepKV();
    const w = await laadWorker();
    const env = { SESSIONS, TMDB_KEY: 'x' };
    const vraag = vraagAan(w, env);
    global.fetch = via(w, env);
    const { code, geheim } = await (await vraag('/zaal/new', {})).json();
    const zet = (staat) => vraag(`/zaal/${code}/zet`, { geheim, staat });
    const films = [
      { key: 'x|2000', name: 'Xanadu', year: 2000, runtime: 96, trailer: 'trailerXX1', score: 7.1 },
      { key: 'y|2001', name: 'Yi Yi', year: 2001, runtime: 173, trailer: 'trailerYY1', score: 8.1 },
      { key: 'z|2002', name: 'Zodiac', year: 2002, runtime: 157, trailer: null, score: 7.7, aanrader: true, bronnen: 3, votes: 9000 },
    ];
    const stem = () => JSON.parse(kv.get(`z:${code}:p:pim`)).stemmen;
    try {
      localStorage.clear();
      localStorage.setItem('picker.settings', JSON.stringify({ lang: 'nl' }));
      history.pushState({}, '', `?zaal=${code}`);
      render(<App />);
      expect(await screen.findByText('Welkom in de zaal')).toBeTruthy();
      fireEvent.change(screen.getByLabelText('Je naam'), { target: { value: 'Pim' } });
      fireEvent.click(screen.getByRole('button', { name: 'Doe mee' }));
      expect(await screen.findByText('Je zit erin, Pim.')).toBeTruthy();
      expect(JSON.parse(localStorage.getItem('picker.zaalIk'))[code].naam).toBe('Pim');
      // de gastheer vroeg niet naar Letterboxd: dan ook geen vraag op de telefoon
      expect(screen.queryByText('Mag de zaal rekening houden met jou?')).toBeNull();

      // het genre: 1e, 2e, en de 1e weer terugnemen
      await zet({ fase: 'genre', ronde: 1, opties: [{ id: 'Drama', naam: 'Drama', n: 5 }, { id: 'Horror', naam: 'Horror', n: 3 }] });
      await peil();
      expect(await screen.findByText('Waar heb je zin in?')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Eerste keus: Horror' }));
      expect(await screen.findByText('Jouw stem: 1e Horror.')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Tweede keus: Drama' }));
      await waitFor(() => expect(stem()).toEqual({ 1: ['Horror', 'Drama'] }));
      fireEvent.click(screen.getByRole('button', { name: 'Eerste keus: Horror' }));
      expect(await screen.findByText('Jouw stem: 2e Drama.')).toBeTruthy();
      await waitFor(() => expect(stem()).toEqual({ 1: [null, 'Drama'] }));
      fireEvent.click(screen.getByRole('button', { name: 'Tweede keus: Drama' }));
      await waitFor(() => expect(stem()).toEqual({}));

      // de films: de aanrader apart, met waarom; je 1e keus kun je verplaatsen
      await zet({ fase: 'film', ronde: 2, genre: { namen: ['Drama'], wijze: 'meeste', punten: 2 }, films });
      await peil();
      expect(await screen.findByText('Welke wil jij zien?')).toBeTruthy();
      expect(document.body.textContent).toContain('Aanraders, nog niet op de lijst');
      expect(document.body.textContent).toContain('TMDB raadt hem aan bij 3 films op de lijst.');
      expect([...document.querySelectorAll('.zs-t-trailer')].map((a) => a.getAttribute('href'))).toEqual(['https://www.youtube.com/watch?v=trailerXX1', 'https://www.youtube.com/watch?v=trailerYY1']);
      fireEvent.click(screen.getByRole('button', { name: 'Eerste keus: Yi Yi' }));
      fireEvent.click(screen.getByRole('button', { name: 'Tweede keus: Zodiac' }));
      await waitFor(() => expect(stem()['2']).toEqual(['y|2001', 'z|2002']));
      fireEvent.click(screen.getByRole('button', { name: 'Eerste keus: Zodiac' }));
      expect(await screen.findByText('Jouw stem: 1e Zodiac, 2e Yi Yi.')).toBeTruthy();
      await waitFor(() => expect(stem()['2']).toEqual(['z|2002', 'y|2001']));

      // de uitslag, ook na herladen
      await zet({ fase: 'uitslag', ronde: 2, films, uitslag: { key: 'y|2001', wijze: 'breed', punten: { 'y|2001': 2, 'x|2000': 2 } } });
      await peil();
      expect(await screen.findByText('Gelijk op punten. Deze stond op de meeste lijstjes.')).toBeTruthy();
      cleanup();
      render(<App />);
      expect(await screen.findByText('Yi Yi')).toBeTruthy();
      expect(screen.queryByText('Welkom in de zaal')).toBeNull();
    } finally {
      delete global.fetch;
      delete document.hidden;
      history.pushState({}, '', '/');
    }
  });

  it('gasten met Letterboxd: per film gezien, op de watchlist en hoe goed hij past, en hoe de zaal dat meeweegt', async () => {
    const { maakProfiel, oordeelVan, zaalOordeel, zaalSturing, metZaal, aanradersMetZaal, vraagUitPot, profielUitApp } = await import('../src/lib/zaalgasten.js');
    const { kiesFilms } = await import('../src/lib/zaalstemming.js');
    const meta = JSON.parse(localStorage.getItem('picker.meta'));
    const pool = JSON.parse(localStorage.getItem('picker.watchlist'));
    // een profiel: sleutels en een smaakprofiel, klein genoeg om te onthouden
    const p = maakProfiel({
      watched: [{ key: 'the witch|2015' }, { key: 'mockingjay - part 2|2015' }],
      ratedFilms: [{ key: 'aftersun|2022', rating: 5 }, { key: 'whiplash|2014', rating: 1 }],
      watchlist: [{ key: 'close|2022' }],
      meta, nu: 1000,
    });
    expect(p).toMatchObject({ v: 1, bron: 'export', at: 1000, lijst: ['close|2022'], beoordeeld: 2 });
    expect([...p.gezien].sort()).toEqual(['aftersun|2022', 'mockingjay - part 2|2015', 'the witch|2015', 'whiplash|2014']);
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
    // het oordeel: gezien herkend, ook bij een jaar verschil en andere leestekens
    const kand = [
      { key: 'the witch|2016', name: 'The Witch', year: 2016, genres: ['Horror'], keywords: [], vote: 7, votes: 9000 },
      { key: 'mockingjay – part 2|2015', name: 'Mockingjay – Part 2', year: 2015, genres: ['Actie'], keywords: [], vote: 6.9, votes: 9000 },
      { key: 'close|2022', name: 'Close', year: 2022, genres: ['Drama'], keywords: [], vote: 7.7, votes: 1100 },
      { key: 'la haine|1995', name: 'La haine', year: 1995, genres: ['Drama', 'Crime'], keywords: [], vote: 8.1, votes: 9000 },
    ];
    const o = oordeelVan(kand, p);
    expect(o['the witch|2016']).toEqual([null, 1, 0]);
    expect(o['mockingjay – part 2|2015']).toEqual([null, 1, 0]);
    expect(o['close|2022'].slice(1)).toEqual([0, 1]);
    expect(o['la haine|1995'][0]).toBeGreaterThan(0);
    expect(o['la haine|1995'].slice(1)).toEqual([0, 0]);

    // wat de zaal vindt: per film wie hem zag, wie hem wil zien, de laagste en de gemiddelde score
    const zo = zaalOordeel({
      Anna: { s: { a: [80, 0, 1], b: [null, 1, 0], c: [30, 0, 0] } },
      Bram: { s: { a: [60, 0, 0], c: [70, 0, 0] } },
      Cas: { v: 0, n: 0 },
    });
    expect(zo.a).toEqual({ gezien: [], wil: ['Anna'], scores: [80, 60], min: 60, gem: 70 });
    expect(zo.b).toMatchObject({ gezien: ['Anna'], scores: [], min: null, gem: null });
    expect(zo.c).toMatchObject({ min: 30, gem: 50 });
    expect([...zaalSturing(zo).uit]).toEqual(['b']);
    expect(zaalSturing(zo).score).toEqual({ a: 70, c: 50 });
    expect(zaalSturing(zo, { gezienWeg: false, smaakMee: true }).uit.size).toBe(0);
    expect(zaalSturing(zo, { gezienWeg: true, smaakMee: false }).score).toEqual({});

    // de pot: wat iemand zag gaat eruit als er genoeg overblijft; wat iemand
    // echt niet ziet zitten ook; dan de beter passende films
    const pot = Array.from({ length: 12 }, (_, i) => ({ key: `f${i}` }));
    expect(metZaal(pot, null)).toBe(pot);
    expect(metZaal(pot, { uit: new Set(['f0', 'f1']) }, 5).map((f) => f.key)).not.toContain('f0');
    expect(metZaal(pot.slice(0, 5), { uit: new Set(['f0']) }, 5)).toHaveLength(5);
    const score = Object.fromEntries(pot.map((f, i) => [f.key, 40 + i * 5]));
    expect(metZaal(pot, { uit: new Set(), score, min: { ...score, f11: 20 } }, 3).map((f) => f.key))
      .toEqual(['f10', 'f9', 'f8', 'f7', 'f6', 'f5', 'f4', 'f3', 'f2']);
    // de slimme pick kiest nooit wat een gast al zag, zolang het kan
    for (let i = 0; i < 20; i++) {
      const zaal = { uit: new Set(['whiplash|2014', 'close|2022', 'aftersun|2022']), score: {}, min: {} };
      expect(kiesFilms(pool, meta, { namen: [], wijze: 'vrij' }, [], 3, Math.random, zaal).map((f) => f.key).sort())
        .toEqual(['first cow|2019', 'la haine|1995', 'stalker|1979']);
    }

    // de aanraders: gezien valt af (of zakt ver), de smaak en de watchlist van de zaal tellen mee
    const rij = [{ film: { key: 'x' }, s: 5 }, { film: { key: 'y' }, s: 4 }, { film: { key: 'z' }, s: 3 }, { film: { key: 'q' }, s: 2 }];
    const oo = {
      x: { gezien: ['Anna'], wil: [], scores: [], min: null, gem: null },
      y: { gezien: [], wil: ['Bram'], scores: [90], min: 90, gem: 90 },
      z: { gezien: [], wil: [], scores: [20], min: 20, gem: 20 },
    };
    const na = aanradersMetZaal(rij, oo, { aantal: 3 });
    expect(na.map((x) => x.film.key)).toEqual(['y', 'z', 'q']);
    expect(na[0].s).toBeCloseTo(4 + 35 / 25 + 0.4);
    expect(na[1].s).toBeCloseTo(3 - 35 / 25 - 0.8);
    expect(na[2].s).toBe(2);
    expect(aanradersMetZaal(rij.slice(0, 3), oo, { aantal: 3 })[0].s).toBe(2);
    expect(aanradersMetZaal(rij, {}, { aantal: 3 })).toBe(rij);

    // wat naar de telefoons gaat: de pot, met een hoger cijfer eerst, zonder meer dan nodig
    const vr = vraagUitPot(pool, meta, 4);
    expect(vr).toHaveLength(4);
    expect(vr[0].key).toBe('whiplash|2014');
    expect(Object.keys(vr[0]).sort()).toEqual(['genres', 'id', 'key', 'keywords', 'lang', 'name', 'poster', 'runtime', 'vote', 'votes', 'year']);
    // zonder filmdata gaat een film als laatste mee: gezien herkent de telefoon op titel en jaar, een score is er dan niet
    const metOnbekend = vraagUitPot([{ key: 'onbekend|2020', name: 'Onbekend', year: 2020 }, ...pool], meta);
    expect(metOnbekend).toHaveLength(7);
    expect(metOnbekend[6]).toMatchObject({ key: 'onbekend|2020', genres: [] });
    expect(oordeelVan([{ key: 'the witch|2016', name: 'The Witch', year: 2016, genres: [] }, { key: 'n|2020', name: 'N', year: 2020, genres: [] }], p))
      .toEqual({ 'the witch|2016': [null, 1, 0], 'n|2020': [null, 0, 0] });

    // wie de tool zelf gebruikt, hoeft geen export te kiezen; de demo telt niet
    const lees = (k, d) => { const r = localStorage.getItem(`picker.${k}`); return r ? JSON.parse(r) : d; };
    const app = await profielUitApp({ lees, metaLezen: async () => meta });
    expect(app.bron).toBe('app');
    expect(app.gezien).toEqual(expect.arrayContaining(['columbus|2017', 'petite maman|2021', 'aftersun|2022', 'la haine|1995', 'stalker|1979']));
    expect(app.lijst).toHaveLength(6);
    localStorage.setItem('picker.demoMode', 'true');
    expect(await profielUitApp({ lees, metaLezen: async () => meta })).toBeNull();
  });

  it('worker: gasten met Letterboxd geven alleen een oordeel per film, en alleen het scherm leest het', async () => {
    const { kv, SESSIONS } = nepKV();
    const vraag = vraagAan(await laadWorker(), { SESSIONS, TMDB_KEY: 'x' });
    const { code: C, geheim } = await (await vraag('/zaal/new', {})).json();
    await vraag(`/zaal/${C}/meedoen`, { naam: 'Anna', token: tA });
    await vraag(`/zaal/${C}/meedoen`, { naam: 'Bram', token: tB });
    // de gastheer zet het aan; de telefoons zien het
    expect((await (await vraag(`/zaal/${C}/zet`, { geheim, staat: { fase: 'lobby', ronde: 0, lb: true } })).json()).zaal.lb).toBe(true);
    expect((await (await vraag(`/zaal/${C}`)).json()).lb).toBe(true);
    expect(await (await vraag(`/zaal/${C}/vraag`)).json()).toEqual({ v: 0, films: [] });
    // alleen het scherm zet films klaar, alleen de gast zelf geeft een oordeel
    expect((await vraag(`/zaal/${C}/vraag`, { geheim: 'fout', films: [] })).status).toBe(403);
    expect((await vraag(`/zaal/${C}/smaak`, { naam: 'Anna', token: tB, v: 0, s: {} })).status).toBe(403);
    expect((await vraag(`/zaal/${C}/smaak`, { naam: 'Anna', token: tA, v: 0, s: [] })).status).toBe(400);
    // een gast meldt zich (v 0): het scherm ziet het
    expect(await (await vraag(`/zaal/${C}/smaak`, { naam: 'Anna', token: tA, v: 0, s: {} })).json()).toMatchObject({ ok: true, v: 0, n: 0 });
    expect((await (await vraag(`/zaal/${C}/stand`, { geheim })).json()).gasten).toEqual({ Anna: { v: 0, n: 0 } });
    // films klaarzetten: opgeschoond tot wat een telefoon nodig heeft om te scoren
    const films = [
      { key: 'a|2001', name: 'A', year: 2001, id: 11, genres: ['Drama'], keywords: [1, 2, 'x'], vote: 7.46, votes: 900, lang: 'en', poster: '/p.jpg', plot: 'weg' },
      { key: 'b|2002', name: 'B', year: 2002, genres: ['Horror'], vote: 6.1 },
      { name: 'zonder sleutel' },
    ];
    expect(await (await vraag(`/zaal/${C}/vraag`, { geheim, films })).json()).toMatchObject({ ok: true, v: 1, n: 2 });
    const v1 = await (await vraag(`/zaal/${C}/vraag`)).json();
    expect(v1.v).toBe(1);
    expect(v1.films[0]).toEqual({ key: 'a|2001', name: 'A', year: 2001, id: 11, genres: ['Drama'], keywords: [1, 2], vote: 7.5, votes: 900, lang: 'en' });
    expect((await (await vraag(`/zaal/${C}`)).json()).vraag).toBe(1);
    // de vraag groeit: wie later aanhaakt, krijgt alles
    await vraag(`/zaal/${C}/vraag`, { geheim, films: [{ key: 'c|2003', name: 'C', year: 2003 }, { key: 'a|2001', name: 'A', year: 2001 }] });
    expect((await (await vraag(`/zaal/${C}/vraag`)).json()).films.map((f) => f.key)).toEqual(['b|2002', 'c|2003', 'a|2001']);
    // het oordeel: alleen films op de vraag, alleen [score, gezien, wil zien]
    const r = await (await vraag(`/zaal/${C}/smaak`, { naam: 'Anna', token: tA, v: 2, s: { 'a|2001': [140, 0, 1], 'b|2002': [null, 1, 0], 'x|1999': [50, 0, 0], 'c|2003': 'kapot' } })).json();
    expect(r).toMatchObject({ ok: true, v: 2, n: 2 });
    expect(JSON.parse(kv.get(`z:${C}:s:anna`))).toEqual({ v: 2, s: { 'a|2001': [100, 0, 1], 'b|2002': [null, 1, 0] } });
    // een nieuwe ronde houdt het aan en de vraag vast; een stem houdt het merkje
    expect((await (await vraag(`/zaal/${C}/zet`, { geheim, staat: { fase: 'genre', ronde: 1, opties: [{ id: 'Drama', naam: 'Drama', n: 3 }] } })).json()).zaal)
      .toMatchObject({ lb: true, vraag: 2 });
    expect((await vraag(`/zaal/${C}/stem`, { naam: 'Anna', token: tA, ronde: 1, keuze: ['Drama'] })).status).toBe(200);
    const stand = await (await vraag(`/zaal/${C}/stand`, { geheim })).json();
    expect(stand.gasten).toEqual({ Anna: { v: 2, n: 2 } });
    expect(stand.stemmen.Anna).toEqual({ 1: ['Drama', null] });
    expect((await (await vraag(`/zaal/${C}/stand`, { geheim, oordeel: true })).json()).gasten.Anna.s).toEqual({ 'a|2001': [100, 0, 1], 'b|2002': [null, 1, 0] });
    // toch niet: het scherm ziet niets meer
    expect((await vraag(`/zaal/${C}/smaak`, { naam: 'Anna', token: tA, uit: true })).status).toBe(200);
    expect((await (await vraag(`/zaal/${C}/stand`, { geheim, oordeel: true })).json()).gasten).toEqual({});
    // de gastheer kan het weer uitzetten
    expect((await (await vraag(`/zaal/${C}/zet`, { geheim, staat: { fase: 'genre', ronde: 1, lb: false } })).json()).zaal.lb).toBeUndefined();
  });

  it('de telefoon: je Letterboxd laten meetellen in drie stappen; alleen een oordeel per film gaat de deur uit', async () => {
    const { kv, SESSIONS } = nepKV();
    const w = await laadWorker();
    const env = { SESSIONS, TMDB_KEY: 'x' };
    const vraag = vraagAan(w, env);
    const calls = [];
    const doorgeven = via(w, env);
    global.fetch = async (url, opts = {}) => { calls.push({ url: String(url), body: opts.body }); return doorgeven(url, opts); };
    const { code, geheim } = await (await vraag('/zaal/new', {})).json();
    await vraag(`/zaal/${code}/zet`, { geheim, staat: { fase: 'lobby', ronde: 0, lb: true } });
    const oordeel = () => JSON.parse(kv.get(`z:${code}:s:pim`) || 'null');
    try {
      localStorage.clear();
      localStorage.setItem('picker.settings', JSON.stringify({ lang: 'nl' }));
      history.pushState({}, '', `?zaal=${code}`);
      render(<App />);
      expect(await screen.findByText('Welkom in de zaal')).toBeTruthy();
      fireEvent.change(screen.getByLabelText('Je naam'), { target: { value: 'Pim' } });
      fireEvent.click(screen.getByRole('button', { name: 'Doe mee' }));
      expect(await screen.findByText('Mag de zaal rekening houden met jou?')).toBeTruthy();
      expect(document.body.textContent).toContain('Je export blijft op je telefoon.');
      // nee kan, en terug ook
      fireEvent.click(screen.getByText('Nee, liever niet'));
      expect(await screen.findByText('Je Letterboxd telt niet mee.')).toBeTruthy();
      fireEvent.click(screen.getByText('Toch wel'));

      // de drie stappen: Letterboxd openen, het zip-bestand, kiezen
      fireEvent.click(screen.getByText('Ja, met mijn Letterboxd-export'));
      expect(screen.getByText('Je export, in drie stappen')).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Open Letterboxd' }).getAttribute('href')).toBe('https://letterboxd.com/settings/data/');
      expect(screen.getByRole('button', { name: 'Onthoud op deze telefoon, voor een volgende filmavond' }).getAttribute('aria-pressed')).toBe('true');
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      zip.file('watched.csv', 'Date,Name,Year,Letterboxd URI\n2024-01-01,Gezien Een,2010,x\n2024-01-02,Zodiac,2007,x');
      zip.file('ratings.csv', 'Date,Name,Year,Letterboxd URI,Rating\n2024-01-01,Gezien Een,2010,x,4.5');
      zip.file('watchlist.csv', 'Date,Name,Year,Letterboxd URI\n2024-01-01,Wil Ik,2015,x');
      const bestand = new File([await zip.generateAsync({ type: 'blob' })], 'letterboxd-pim.zip');
      fireEvent.change(document.querySelector('.zs-lb input[type="file"]'), { target: { files: [bestand] } });
      expect(await screen.findByText('Je Letterboxd telt mee', {}, { timeout: 5000 })).toBeTruthy();
      expect(document.body.textContent).toContain('2 gezien, 1 beoordeeld, 1 op je watchlist.');
      // aangemeld (v 0); de telefoon onthoudt alleen sleutels en een smaakprofiel
      await waitFor(() => expect(oordeel()).toEqual({ v: 0, s: {} }));
      expect(JSON.parse(kv.get(`z:${code}:p:pim`)).lb).toEqual({ v: 0, n: 0 });
      const onthouden = JSON.parse(localStorage.getItem('picker.zaalMijnLetterboxd')).profiel;
      expect([...onthouden.gezien].sort()).toEqual(['gezien een|2010', 'zodiac|2007']);
      expect(onthouden.lijst).toEqual(['wil ik|2015']);

      // het scherm zet films klaar; de telefoon beantwoordt de vraag vanzelf
      const kand = (key, name, year, genres) => ({ key, name, year, genres, keywords: [], vote: 7.5, votes: 5000 });
      await vraag(`/zaal/${code}/vraag`, { geheim, films: [kand('zodiac|2007', 'Zodiac', 2007, ['Thriller']), kand('wil ik|2015', 'Wil Ik', 2015, ['Drama']), kand('nieuw|2020', 'Nieuw', 2020, ['Drama'])] });
      await peil();
      await waitFor(() => expect(oordeel().v).toBe(1));
      const s = oordeel().s;
      expect(s['zodiac|2007']).toEqual([null, 1, 0]);
      expect(s['wil ik|2015'].slice(1)).toEqual([0, 1]);
      expect(s['nieuw|2020'][0]).toBeGreaterThanOrEqual(0);
      expect(await screen.findByText('Het scherm weet wat je van 3 films vindt.')).toBeTruthy();
      // de export zelf gaat nergens heen
      expect(calls.some((c) => c.body && /Gezien Een|4\.5/.test(c.body))).toBe(false);

      // toch niet: het oordeel is weg
      fireEvent.click(screen.getByText('Toch niet meetellen'));
      expect(await screen.findByText('Je Letterboxd telt niet mee.')).toBeTruthy();
      expect(oordeel()).toEqual({ uit: true });
      expect(JSON.parse(kv.get(`z:${code}:p:pim`)).lb).toBeUndefined();
      // en weer wel: nu met één tik, met de onthouden export
      fireEvent.click(screen.getByText('Toch wel'));
      expect(document.body.textContent).toContain('Met je export van');
      fireEvent.click(screen.getByText('Ja, tel mijn Letterboxd mee'));
      expect(await screen.findByText('Je Letterboxd telt mee')).toBeTruthy();
      await waitFor(() => expect(oordeel().v).toBe(1));
      expect(oordeel().s['zodiac|2007']).toEqual([null, 1, 0]);
    } finally {
      delete global.fetch;
      delete document.hidden;
      history.pushState({}, '', '/');
    }
  });

  it('het scherm: zo speelt de zaal kies je vooraf, en wat een gast met Letterboxd al zag komt niet op tafel', async () => {
    const { kv, SESSIONS } = nepKV();
    global.fetch = via(await laadWorker(), { SESSIONS, TMDB_KEY: 'x' });
    const { doeMee, stuurSmaak, haalZaal, haalVraag } = await import('../src/lib/zaalstemming.js');
    try {
      render(<App />);
      fireEvent.click(screen.getAllByLabelText('Filmavond')[0]);
      fireEvent.click(screen.getByText('Open de zaal'));
      expect(await screen.findByText('Pak je telefoon')).toBeTruthy();
      const code = document.querySelector('.zs-code').textContent;
      // de gastheer kiest; dit toestel onthoudt het
      const spel = screen.getByRole('group', { name: 'Zo speelt de zaal' });
      expect(within(spel).getByRole('button', { name: '3 aanraders van buiten de lijst' }).getAttribute('aria-pressed')).toBe('true');
      expect(within(spel).getByText('Vraag het de gasten').getAttribute('aria-pressed')).toBe('true');
      fireEvent.click(within(spel).getByText('Meteen naar de films'));
      fireEvent.click(within(spel).getByRole('button', { name: '3 films' }));
      fireEvent.click(within(spel).getByRole('button', { name: 'Geen aanraders van buiten de lijst' }));
      fireEvent.click(within(spel).getByText('Sluiten met de hand'));
      expect(JSON.parse(localStorage.getItem('picker.zaalOpties'))).toMatchObject({ genreRonde: false, lijst: 3, aanraders: 0, gasten: true, vanzelf: false });
      // de telefoons mogen het vragen
      await waitFor(() => expect(JSON.parse(kv.get(`z:${code}`)).lb).toBe(true));

      await doeMee(code, 'Anna', tA);
      await doeMee(code, 'Bram', tB);
      await stuurSmaak(code, 'Anna', tA, 0, {});
      await peil();
      // Anna telt haar Letterboxd mee: het scherm laat het zien en zet de pot alvast klaar
      await waitFor(() => expect(document.querySelector('.zs-namen').textContent).toContain('Annamet Letterboxd'));
      await waitFor(() => expect(kv.get(`z:${code}:k`)).toBeTruthy());
      const vr = await haalVraag(code);
      const zag = ['whiplash|2014', 'close|2022', 'aftersun|2022'];
      const rest = vr.films.map((f) => f.key).filter((k) => !zag.includes(k)).sort();
      expect(rest).toHaveLength(3);
      await stuurSmaak(code, 'Anna', tA, vr.v, Object.fromEntries(vr.films.map((f) => [f.key, zag.includes(f.key) ? [null, 1, 0] : [70, 0, 0]])));

      fireEvent.click(await screen.findByText('Begin met 2 spelers'));
      expect(await screen.findByText('Het wordt alles door elkaar')).toBeTruthy();
      expect(document.body.textContent).toContain('Zonder genreronde, dus alles uit de pot.');
      expect(document.body.textContent).toContain('De slimme pick koos 3 films uit de lijst.');
      expect(document.body.textContent).toContain('Met de Letterboxd van Anna: wat iemand al zag, ging eruit, en hun smaak telde mee.');
      const z = await haalZaal(code);
      expect(z.films.map((f) => f.key).sort()).toEqual(rest);
      expect(z.films.some((f) => f.aanrader)).toBe(false);

      // met de hand sluiten: ook als iedereen gestemd heeft, wacht het scherm
      fireEvent.click(screen.getByText('Nu stemmen'));
      expect(await screen.findByText('Welke wordt het?')).toBeTruthy();
      const ronde = (await haalZaal(code)).ronde;
      const { stuurStem } = await import('../src/lib/zaalstemming.js');
      await stuurStem(code, 'Anna', tA, ronde, [rest[0], rest[1]]);
      await stuurStem(code, 'Bram', tB, ronde, [rest[0], rest[2]]);
      await peil();
      expect(await screen.findByText('Iedereen heeft gestemd. Sluit de stemming als jullie klaar zijn.')).toBeTruthy();
      expect((await haalZaal(code)).fase).toBe('film');
      fireEvent.click(screen.getByText('Sluit de stemming'));
      expect(await screen.findByText('Pak het kaartje')).toBeTruthy();
      expect((await haalZaal(code)).uitslag.key).toBe(rest[0]);
    } finally {
      delete global.fetch;
      delete document.hidden;
    }
  });

  it('voordrachten: per film met wie hem voordroeg; bij te veel gaat voor wat vaker voorgedragen is en bij het genre past', async () => {
    const { voordrachtenPerFilm, kiesVoordrachten, filmVoorZaal } = await import('../src/lib/zaalstemming.js');
    const per = voordrachtenPerFilm({
      Anna: { id: 1, name: 'Heat', year: 1995 }, Bram: { id: 2, name: 'Clue', year: 1985, poster: '/c.jpg' },
      Cas: { id: 1, name: 'Heat', year: 1995 }, Dirk: { name: 'Zonder nummer' },
    });
    expect(per).toEqual([
      { id: 1, name: 'Heat', year: 1995, poster: null, voor: ['Anna', 'Cas'] },
      { id: 2, name: 'Clue', year: 1985, poster: '/c.jpg', voor: ['Bram'] },
    ]);
    const k = (id, voor, genres) => ({ id, voor, m: { genres } });
    const lijst = [k(1, ['A'], ['Comedy']), k(2, ['B'], ['Horror']), k(3, ['C', 'D'], ['Comedy']), k(4, ['E'], ['Horror'])];
    const past = (x) => x.m.genres.includes('Horror');
    // eerst wat twee gasten voordroegen, dan wat bij het genre past
    expect(kiesVoordrachten(lijst, 2, { past, rnd: () => 0.5 }).map((x) => x.id)).toEqual([3, 2]);
    expect(kiesVoordrachten(lijst, 9, { past })).toHaveLength(4);
    expect(kiesVoordrachten(lijst, 0)).toEqual([]);
    // verder het lot
    const lot = [0.9, 0.1];
    expect(kiesVoordrachten([k(1, ['A'], []), k(2, ['B'], [])], 1, { rnd: () => lot.shift() }).map((x) => x.id)).toEqual([2]);
    expect(filmVoorZaal({ key: 'heat|1995', name: 'Heat', year: 1995 }, { id: 949, poster: '/h.jpg' }, null, ['Anna'])).toMatchObject({ id: 949, voor: ['Anna'] });
    expect(filmVoorZaal({ key: 'heat|1995', name: 'Heat', year: 1995 }, null).voor).toBeUndefined();
  });

  it('worker: gasten dragen een film voor als het scherm dat toestaat, tot de films op tafel liggen; en welke trailer er draait', async () => {
    const { kv, SESSIONS } = nepKV();
    const vraag = vraagAan(await laadWorker(), { SESSIONS, TMDB_KEY: 'x' });
    const { code: C, geheim } = await (await vraag('/zaal/new', {})).json();
    const zet = async (staat) => (await vraag(`/zaal/${C}/zet`, { geheim, staat })).json();
    const draag = (naam, token, film) => vraag(`/zaal/${C}/voordracht`, { naam, token, film });
    await vraag(`/zaal/${C}/meedoen`, { naam: 'Anna', token: tA });
    await vraag(`/zaal/${C}/meedoen`, { naam: 'Bram', token: tB });
    const parasite = { id: 496243, name: 'Parasite', year: 2019, poster: '/p.jpg', plot: 'blijft weg' };
    // zonder toestemming van het scherm kan het niet
    expect((await (await draag('Anna', tA, parasite)).json()).error).toBe('GEEN_VOORDRACHT');
    expect((await zet({ fase: 'lobby', ronde: 0, vd: 2 })).zaal.vd).toBe(2);
    expect((await zet({ fase: 'lobby', ronde: 0, vd: 7 })).zaal.vd).toBe(3);
    expect((await zet({ fase: 'lobby', ronde: 0, vd: 2 })).zaal.vd).toBe(2);
    // alleen met je eigen token, en alleen een film met een nummer en een titel
    expect((await draag('Anna', tB, parasite)).status).toBe(403);
    expect((await draag('Anna', tA, { name: 'Zonder nummer' })).status).toBe(400);
    expect(await (await draag('Anna', tA, { ...parasite, poster: 'javascript:x' })).json()).toEqual({ ok: true, film: { id: 496243, name: 'Parasite', year: 2019, poster: null } });
    expect((await draag('Anna', tA, parasite)).status).toBe(200);
    expect((await draag('Bram', tB, { id: 1, name: 'Zodiac', year: 2007 })).status).toBe(200);
    // een eigen sleutel, los van je stem: nooit een botsing
    expect(JSON.parse(kv.get(`z:${C}:d:anna`))).toEqual({ id: 496243, name: 'Parasite', year: 2019, poster: '/p.jpg' });
    expect(JSON.parse(kv.get(`z:${C}:p:anna`)).vd).toBeUndefined();
    // alleen het scherm leest ze, en alleen als het erom vraagt
    expect((await (await vraag(`/zaal/${C}/stand`, { geheim })).json()).voordrachten).toBeUndefined();
    expect((await (await vraag(`/zaal/${C}/stand`, { geheim, voordrachten: true })).json()).voordrachten).toEqual({
      Anna: { id: 496243, name: 'Parasite', year: 2019, poster: '/p.jpg' }, Bram: { id: 1, name: 'Zodiac', year: 2007, poster: null },
    });
    // intrekken
    expect((await vraag(`/zaal/${C}/voordracht`, { naam: 'Bram', token: tB, uit: true })).status).toBe(200);
    expect(Object.keys((await (await vraag(`/zaal/${C}/stand`, { geheim, voordrachten: true })).json()).voordrachten)).toEqual(['Anna']);
    // tijdens het genre kan het nog; de toestemming blijft staan
    expect((await zet({ fase: 'genre', ronde: 1, opties: [{ id: 'Drama', naam: 'Drama', n: 4 }] })).zaal.vd).toBe(2);
    expect((await draag('Bram', tB, { id: 2, name: 'Heat', year: 1995 })).status).toBe(200);
    // de films op tafel, met het TMDB-nummer en wie hem voordroeg; en de trailer die draait
    const films = [
      { key: 'a|2000', name: 'A', year: 2000, id: 11, trailer: 'trailerAAA' },
      { key: 'parasite|2019', name: 'Parasite', year: 2019, id: 496243, trailer: 'trailerPPP', voorgedragen: true, voor: ['Anna', ' '] },
    ];
    const tr = await zet({ fase: 'trailers', ronde: 1, films, nu: { key: 'parasite|2019', i: 2, n: 2 } });
    expect(tr.zaal.films[0]).toMatchObject({ id: 11 });
    expect(tr.zaal.films[0].voorgedragen).toBeUndefined();
    expect(tr.zaal.films[1]).toMatchObject({ id: 496243, voorgedragen: true, voor: ['Anna'] });
    expect(tr.zaal.nu).toEqual({ key: 'parasite|2019', i: 2, n: 2 });
    // daarna is het dicht
    expect((await (await draag('Anna', tA, parasite)).json()).error).toBe('DICHT');
    // een trailer die niet op tafel ligt, of buiten de trailers: geen nu
    expect((await zet({ fase: 'trailers', ronde: 1, films, nu: { key: 'x|1', i: 1, n: 2 } })).zaal.nu).toBeUndefined();
    expect((await zet({ fase: 'film', ronde: 2, films, nu: { key: 'a|2000', i: 1, n: 2 } })).zaal.nu).toBeUndefined();
  });

  it('het scherm: gasten dragen films voor, die komen op tafel met hun naam, en de telefoons zien welke trailer draait', async () => {
    const { kv, SESSIONS } = nepKV();
    const tmdb = (u) => {
      const m = u.match(/\/movie\/(\d+)\?/);
      if (m?.[1] === '777') return tmdbFilm(777, 'Gastfilm', 2015);
      if (m?.[1] === '778') return tmdbFilm(778, 'Andere Gastfilm', 2016);
      return null;
    };
    global.fetch = via(await laadWorker(), { SESSIONS, TMDB_KEY: 'x' }, tmdb);
    const { doeMee, stuurVoordracht, stuurStem, haalZaal } = await import('../src/lib/zaalstemming.js');
    const meta = JSON.parse(localStorage.getItem('picker.meta'));
    Object.values(meta).forEach((m, i) => { m.trailer = `https://www.youtube.com/watch?v=trailer${i}xyz`; });
    localStorage.setItem('picker.meta', JSON.stringify(meta));
    try {
      render(<App />);
      fireEvent.click(screen.getAllByLabelText('Filmavond')[0]);
      fireEvent.click(screen.getByText('Open de zaal'));
      expect(await screen.findByText('Pak je telefoon')).toBeTruthy();
      const code = document.querySelector('.zs-code').textContent;
      const spel = screen.getByRole('group', { name: 'Zo speelt de zaal' });
      // standaard staat voordragen uit
      expect(within(spel).getByRole('button', { name: 'Geen voordrachten van gasten' }).getAttribute('aria-pressed')).toBe('true');
      fireEvent.click(within(spel).getByText('Meteen naar de films'));
      fireEvent.click(within(spel).getByRole('button', { name: 'Geen aanraders van buiten de lijst' }));
      fireEvent.click(within(spel).getByText('Niet vragen'));
      fireEvent.click(within(spel).getByText('Sluiten met de hand'));
      fireEvent.click(within(spel).getByRole('button', { name: '1 voordracht van gasten' }));
      expect(within(spel).getByText(/Elke gast kan op de telefoon zelf een film voordragen/)).toBeTruthy();
      await waitFor(() => expect(JSON.parse(kv.get(`z:${code}`)).vd).toBe(1));

      await doeMee(code, 'Anna', tA);
      await doeMee(code, 'Bram', tB);
      await doeMee(code, 'Cas', tC);
      await stuurVoordracht(code, 'Anna', tA, { id: 777, name: 'Gastfilm', year: 2015 });
      await stuurVoordracht(code, 'Bram', tB, { id: 778, name: 'Andere Gastfilm', year: 2016 });
      await stuurVoordracht(code, 'Cas', tC, { id: 777, name: 'Gastfilm', year: 2015 });
      await peil();
      // het scherm laat zien wie wat voordraagt
      await waitFor(() => expect(document.querySelector('.zs-namen').textContent).toContain('Annadraagt Gastfilm voor'));
      expect(document.querySelector('.zs-namen').textContent).toContain('Bramdraagt Andere Gastfilm voor');

      fireEvent.click(await screen.findByText('Begin met 3 spelers'));
      expect(await screen.findByText('Het wordt alles door elkaar')).toBeTruthy();
      // één plek: wat twee gasten voordroegen, gaat voor
      expect(document.body.textContent).toContain('Plus 1 voorgedragen door een gast.');
      expect(document.body.textContent).toContain('Er waren 2 voordrachten voor 1 plek.');
      const groepen = [...document.querySelectorAll('.zs-filmgroep')];
      expect(groepen).toHaveLength(2);
      expect(groepen[1].textContent).toContain('Voorgedragen door gasten');
      expect(groepen[1].textContent).toContain('Voorgedragen door Anna en Cas.');
      const z = await haalZaal(code);
      expect(z.films.filter((f) => f.voorgedragen)).toEqual([expect.objectContaining({ key: 'gastfilm|2015', id: 777, voor: ['Anna', 'Cas'], trailer: 'trailer777' })]);
      expect(z.films.filter((f) => !f.voorgedragen).every((f) => f.id)).toBe(true);

      // de trailers: de zaal weet welke er draait
      fireEvent.click(screen.getByText(`Bekijk de ${z.films.length} trailers`));
      await waitFor(async () => expect((await haalZaal(code)).nu).toEqual({ key: z.films[0].key, i: 1, n: z.films.length }));
      fireEvent.click(screen.getByText('Volgende trailer'));
      await waitFor(async () => expect((await haalZaal(code)).nu).toEqual({ key: z.films[1].key, i: 2, n: z.films.length }));
      fireEvent.click(screen.getByText('Sluiten'));
      await waitFor(async () => expect((await haalZaal(code)).nu).toBeUndefined());
      fireEvent.click(screen.getByText('Nu stemmen'));
      expect(await screen.findByText('Welke wordt het?')).toBeTruthy();
      const ronde = (await haalZaal(code)).ronde;
      expect((await haalZaal(code)).fase).toBe('film');

      // de voorgedragen film wint: het kaartje, en de filmdata gaat mee
      await stuurStem(code, 'Anna', tA, ronde, ['gastfilm|2015', null]);
      await stuurStem(code, 'Bram', tB, ronde, ['gastfilm|2015', null]);
      await stuurStem(code, 'Cas', tC, ronde, [z.films[0].key, 'gastfilm|2015']);
      await peil();
      fireEvent.click(await screen.findByText('Sluit de stemming'));
      expect(await screen.findByText('Pak het kaartje')).toBeTruthy();
      expect(document.querySelector('.zs-uitslag-titel').textContent).toBe('Gastfilm');
      fireEvent.click(screen.getByText('Pak het kaartje'));
      await waitFor(() => expect(JSON.parse(localStorage.getItem('picker.kaartjes'))[0]).toMatchObject({ key: 'gastfilm|2015', bron: 'zaal', personen: 3, poster: '/p777.jpg' }));
    } finally {
      delete global.fetch;
      delete document.hidden;
    }
  });

  it('het scherm: lobby-instellingen die je snel na elkaar kiest, komen op volgorde aan', async () => {
    const { kv, SESSIONS } = nepKV();
    const echt = via(await laadWorker(), { SESSIONS, TMDB_KEY: 'x' });
    // De eerste instelling blijft onderweg hangen; zonder rij haalt de rest
    // hem in, en komt hij als laatste aan met wat je net uitzette
    let los;
    const traag = new Promise((r) => { los = r; });
    const verstuurd = [];
    global.fetch = async (url, opts = {}) => {
      if (String(url).endsWith('/zet')) {
        verstuurd.push(JSON.parse(opts.body).staat);
        if (verstuurd.length === 1) await traag;
      }
      return echt(url, opts);
    };
    try {
      render(<App />);
      fireEvent.click(screen.getAllByLabelText('Filmavond')[0]);
      fireEvent.click(screen.getByText('Open de zaal'));
      expect(await screen.findByText('Pak je telefoon')).toBeTruthy();
      const code = document.querySelector('.zs-code').textContent;
      const spel = screen.getByRole('group', { name: 'Zo speelt de zaal' });
      await waitFor(() => expect(verstuurd).toHaveLength(1));
      fireEvent.click(within(spel).getByText('Niet vragen'));
      fireEvent.click(within(spel).getByRole('button', { name: '1 voordracht van gasten' }));
      await new Promise((r) => { setTimeout(r, 50); });
      los();
      await waitFor(() => expect(JSON.parse(kv.get(`z:${code}`)).vd).toBe(1));
      expect(JSON.parse(kv.get(`z:${code}`)).lb).toBeUndefined();
      // de tussenstap ging nooit de deur uit: alleen de nieuwste wachtte
      expect(verstuurd.map((s) => [s.lb, s.vd])).toEqual([[true, 0], [false, 1]]);
    } finally {
      delete global.fetch;
    }
  });

  it('de Worker: wie de zaal schrijft, veegt niet weg wat een ander intussen schreef', async () => {
    const { kv, SESSIONS } = nepKV();
    // Een trage lezing: de zaal van nu, maar pas geleverd als los() klinkt
    const kvGet = SESSIONS.get;
    let houd = null;
    SESSIONS.get = async (k) => {
      const v = await kvGet(k);
      if (houd && /^z:[A-Z]{4}$/.test(k)) { const h = houd; houd = null; h.geraakt(); await h.wacht; }
      return v;
    };
    const houdVast = () => {
      let los;
      let geraakt;
      const raak = new Promise((r) => { geraakt = r; });
      houd = { wacht: new Promise((r) => { los = r; }), geraakt };
      return { raak, los: () => los() };
    };
    const vraag = vraagAan(await laadWorker(), { SESSIONS });
    const { code, geheim } = await (await vraag('/zaal/new', {})).json();
    const zaal = () => JSON.parse(kv.get(`z:${code}`));
    const zet = (staat) => vraag(`/zaal/${code}/zet`, { geheim, staat });

    // het scherm zet de lobby met een oude kopie; intussen doet Anna mee
    let h = houdVast();
    const lobby = zet({ fase: 'lobby', ronde: 0, vd: 1 });
    await h.raak;
    expect((await vraag(`/zaal/${code}/meedoen`, { naam: 'Anna', token: tA })).status).toBe(200);
    h.los();
    expect((await lobby).status).toBe(200);
    expect(zaal()).toMatchObject({ spelers: ['Anna'], vd: 1 });

    // films klaarzetten voor de gasten, terwijl het scherm het voordragen ruimer zet
    h = houdVast();
    const films = vraag(`/zaal/${code}/vraag`, { geheim, films: [{ key: 'a|2000', name: 'A', year: 2000 }] });
    await h.raak;
    expect((await zet({ fase: 'lobby', ronde: 0, lb: true, vd: 2 })).status).toBe(200);
    h.los();
    expect((await films).status).toBe(200);
    expect(zaal()).toMatchObject({ spelers: ['Anna'], lb: true, vd: 2, vraag: 1 });

    // Bram doet mee met een oude kopie, en het scherm begint intussen: te laat,
    // en de zaal springt niet terug naar de lobby
    h = houdVast();
    const bram = vraag(`/zaal/${code}/meedoen`, { naam: 'Bram', token: tB });
    await h.raak;
    expect((await zet({ fase: 'genre', ronde: 1, opties: [{ id: 'Drama', naam: 'Drama', n: 4 }] })).status).toBe(200);
    h.los();
    expect((await (await bram).json()).error).toBe('BEGONNEN');
    expect(zaal()).toMatchObject({ fase: 'genre', ronde: 1, spelers: ['Anna'], vraag: 1 });
  });

  it('de telefoon: zelf een film voordragen, meekijken met de trailers en alvast stemmen, en het kaartje mee naar huis', async () => {
    const { kv, SESSIONS } = nepKV();
    const w = await laadWorker();
    const env = { SESSIONS, TMDB_KEY: 'x' };
    const vraag = vraagAan(w, env);
    const tmdb = (u) => {
      if (u.includes('/search/movie')) {
        return { results: u.includes('eve') ? [licht(tmdbFilm(5, 'Parasite Eve', 1997))] : [licht(tmdbFilm(496243, 'Parasite', 2019)), licht(tmdbFilm(5, 'Parasite Eve', 1997))] };
      }
      const m = u.match(/\/movie\/(\d+)\?/);
      if (m?.[1] === '949') return tmdbFilm(949, 'Heat', 1995, { director: 'Michael Mann' });
      return null;
    };
    global.fetch = via(w, env, tmdb);
    const { code, geheim } = await (await vraag('/zaal/new', {})).json();
    const zet = (staat) => vraag(`/zaal/${code}/zet`, { geheim, staat });
    const zoekVeld = () => screen.getByLabelText('Zoek een film om voor te dragen');
    try {
      localStorage.clear();
      localStorage.setItem('picker.settings', JSON.stringify({ lang: 'nl' }));
      await zet({ fase: 'lobby', ronde: 0, vd: 2 });
      history.pushState({}, '', `?zaal=${code}`);
      render(<App />);
      fireEvent.change(await screen.findByLabelText('Je naam'), { target: { value: 'Pim' } });
      fireEvent.click(screen.getByRole('button', { name: 'Doe mee' }));
      expect(await screen.findByText('Je zit erin, Pim.')).toBeTruthy();

      // voordragen: zoeken en aantikken
      expect(screen.getByText('Zelf een film voordragen')).toBeTruthy();
      expect(document.body.textContent).toContain('Er is plek voor 2 voordrachten.');
      fireEvent.change(zoekVeld(), { target: { value: 'parasite' } });
      fireEvent.click(await screen.findByRole('button', { name: 'Draag Parasite (2019) voor' }));
      expect(await screen.findByText('Jij draagt voor')).toBeTruthy();
      expect(JSON.parse(kv.get(`z:${code}:d:pim`))).toEqual({ id: 496243, name: 'Parasite', year: 2019, poster: '/p496243.jpg' });
      // een andere film, en intrekken
      fireEvent.click(screen.getByText('Een andere film'));
      fireEvent.change(zoekVeld(), { target: { value: 'parasite eve' } });
      fireEvent.click(await screen.findByRole('button', { name: 'Draag Parasite Eve (1997) voor' }));
      await waitFor(() => expect(JSON.parse(kv.get(`z:${code}:d:pim`)).id).toBe(5));
      fireEvent.click(await screen.findByText('Trek in'));
      await waitFor(() => expect(JSON.parse(kv.get(`z:${code}:d:pim`))).toEqual({ uit: true }));
      expect(zoekVeld()).toBeTruthy();
      fireEvent.change(zoekVeld(), { target: { value: 'parasite' } });
      fireEvent.click(await screen.findByRole('button', { name: 'Draag Parasite (2019) voor' }));
      expect(await screen.findByText('Jij draagt voor')).toBeTruthy();

      // de trailers: wat er nu draait, en alvast stemmen (nog niets de deur uit)
      const films = [
        { key: 'heat|1995', name: 'Heat', year: 1995, id: 949, poster: '/h.jpg', runtime: 170, trailer: 'trailerHH1' },
        { key: 'clue|1985', name: 'Clue', year: 1985, trailer: 'trailerCC1' },
        { key: 'parasite|2019', name: 'Parasite', year: 2019, id: 496243, trailer: 'trailerPP1', voorgedragen: true, voor: ['Pim'] },
      ];
      const genre = { namen: [], wijze: 'vrij' };
      await zet({ fase: 'trailers', ronde: 1, genre, films, nu: { key: 'clue|1985', i: 2, n: 3 } });
      await peil();
      expect(await screen.findByText('Nu op het scherm: trailer 2 van 3')).toBeTruthy();
      expect(screen.getByText('Je voordracht ligt op tafel.')).toBeTruthy();
      expect(document.body.textContent).toContain('Voorgedragen door gasten');
      expect(document.body.textContent).toContain('Voorgedragen door Pim.');
      expect(screen.queryByText('Jij draagt voor')).toBeNull();
      expect(screen.getAllByRole('button', { name: 'Eerste keus: Clue' })).toHaveLength(1);
      fireEvent.click(screen.getByRole('button', { name: 'Eerste keus: Clue' }));
      fireEvent.click(screen.getByRole('button', { name: 'Tweede keus: Heat' }));
      expect(await screen.findByText('Jouw stem: 1e Clue, 2e Heat. Hij telt zodra het stemmen begint.')).toBeTruthy();
      expect(JSON.parse(kv.get(`z:${code}:p:pim`)).stemmen).toEqual({});
      // de stemming gaat open: de stem gaat meteen de deur uit
      await zet({ fase: 'film', ronde: 2, genre, films });
      await peil();
      expect(await screen.findByText('Jouw stem: 1e Clue, 2e Heat.')).toBeTruthy();
      await waitFor(() => expect(JSON.parse(kv.get(`z:${code}:p:pim`)).stemmen).toEqual({ 2: ['clue|1985', 'heat|1995'] }));

      // de uitslag: het kaartje met iedereen erop, mee naar huis
      await zet({ fase: 'uitslag', ronde: 2, films, uitslag: { key: 'heat|1995', wijze: 'meeste', punten: { 'heat|1995': 3 } } });
      await peil();
      const kaartje = await screen.findByRole('article', { name: 'Bioscoopkaartje voor Heat' });
      await waitFor(() => expect(kaartje.textContent).toContain('Een film van Michael Mann'));
      expect(kaartje.textContent).toContain('TMDB 949');
      expect(kaartje.textContent).toContain('PIM');
      fireEvent.click(screen.getByText('Bewaar in mijn kaartjesdoos'));
      expect(await screen.findByText('In je kaartjesdoos')).toBeTruthy();
      await waitFor(() => expect(JSON.parse(localStorage.getItem('picker.kaartjes'))[0]).toMatchObject({ key: 'heat|1995', bron: 'zaal', personen: 1, namen: ['Pim'], poster: '/h.jpg' }));
      expect(screen.getByText('Deel als plaatje')).toBeTruthy();
      // na herladen weet de telefoon het nog
      cleanup();
      render(<App />);
      expect(await screen.findByText('In je kaartjesdoos')).toBeTruthy();
    } finally {
      delete global.fetch;
      delete document.hidden;
      history.pushState({}, '', '/');
    }
  });

  it('meedoen met een ingetikte code op het startscherm, en een code die niet bestaat', async () => {
    const { SESSIONS } = nepKV();
    const w = await laadWorker();
    global.fetch = via(w, { SESSIONS, TMDB_KEY: 'x' });
    try {
      localStorage.clear();
      localStorage.setItem('picker.settings', JSON.stringify({ lang: 'nl' }));
      render(<App />);
      const veld = screen.getByLabelText('Stem je mee in een zaal? Vul de code in');
      fireEvent.change(veld, { target: { value: 'kmr' } });
      fireEvent.click(screen.getByRole('button', { name: 'Doe mee' }));
      expect(screen.getByText('Een code heeft vier letters.').getAttribute('role')).toBe('alert');
      fireEvent.change(veld, { target: { value: 'qqqq' } });
      fireEvent.click(screen.getByRole('button', { name: 'Doe mee' }));
      expect(location.search).toBe('?zaal=QQQQ');
      expect(await screen.findByText('Deze zaal bestaat niet of is gesloten. Een zaal blijft 12 uur open.')).toBeTruthy();
      fireEvent.click(screen.getByText('Verlaat de zaal'));
      expect(await screen.findByText('Wat kijken we vanavond?')).toBeTruthy();
      expect(location.search).toBe('');
    } finally {
      delete global.fetch;
      history.pushState({}, '', '/');
    }
  });
});
