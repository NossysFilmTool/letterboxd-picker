// De app als geheel, deel 3 van 4: Voor jou-motor, taal en kaartjes.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen, cleanup, within, waitFor, act } from '@testing-library/react';
import App from '../src/App.jsx';
import { seed, startOpZoeken, naarZoeken } from './helpers.jsx';

describe('V2 smoke (3/4)', () => {
  beforeEach(() => { cleanup(); seed(); });

  it('bieb: gezien-scope toont kijkgeschiedenis met jouw rating', () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Archief')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Gezien 2' }));
    expect(document.body.textContent).toContain('Columbus');
    expect(document.body.textContent).toContain('Petite maman');
    expect(document.body.textContent).toContain('4,5');
    expect(document.body.textContent).toContain('mijn sterren'); // sorteeroptie
  });

  it('archief: de kop van het huis, een filterzin, films per decennium en een uitgelichte film', async () => {
    const meta = JSON.parse(localStorage.getItem('picker.meta'));
    meta['whiplash|2014'].backdrop = '/w.jpg';
    localStorage.setItem('picker.meta', JSON.stringify(meta));
    render(<App />);
    expect(document.querySelector('.kop-naam').textContent).toBe('ShutterBox');
    fireEvent.click(screen.getAllByLabelText('Archief')[0]);
    expect(screen.getAllByRole('button', { name: 'Archief' }).every((b) => b.getAttribute('aria-current') === 'page')).toBe(true);
    // het hoogste cijfer dat je nog niet zag, met zijn filmbeeld
    expect(await screen.findByText('hoogste cijfer op je lijst')).toBeTruthy();
    expect(document.querySelector('.uitgelicht-titel').textContent).toBe('Whiplash');
    // op jaar: per decennium, nieuwste eerst
    expect([...document.querySelectorAll('.decennium-kop h2')].map((h) => h.textContent)).toEqual(['2020', '2010', '1990', '1970']);
    // de filterzin: tik op het onderstreepte woord (de zin zoals je hem ziet,
    // zonder de keuzelijsten die eroverheen liggen)
    const zin = () => {
      const kopie = document.querySelector('.filterzin').cloneNode(true);
      kopie.querySelectorAll('select').forEach((s) => s.remove());
      return kopie.textContent.replace(/\s+/g, ' ');
    };
    expect(zin()).toContain('Toon alle genres uit alle jaren, elke lengte, waar dan ook, gezien telt mee. Op jaar, nieuwste eerst.');
    fireEvent.change(screen.getByLabelText('Genre'), { target: { value: 'Western' } });
    expect(zin()).toContain('Toon western uit');
    expect(document.body.textContent).toContain('1 van 6 films');
    expect(document.querySelector('.uitgelicht')).toBeNull();
    // op titel: geen decennia meer
    fireEvent.change(screen.getByLabelText('Sorteer op'), { target: { value: 'titel' } });
    expect(zin()).toContain('Op titel.');
    expect(document.querySelector('.decennium')).toBeNull();
  });

  it('bieb: periode-filter werkt', () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Archief')[0]);
    fireEvent.change(screen.getByLabelText('Periode'), { target: { value: '1970' } });
    expect(document.body.textContent).toContain('Stalker');
    expect(document.body.textContent).not.toContain('Whiplash');
    expect(document.body.textContent).toContain('1 van 6 films');
  });

  it('app-score: het gemiddelde, Metacritic omgerekend, en één decimaal', async () => {
    const { appScore, fmtScore } = await import('../src/lib/pick.js');
    // RT telt niet mee: (7,8 + 7,82 + 7,7) / 3 = 7,8 (Metacritic 81 telt als 7,82)
    expect(appScore({ vote: 7.7, ext: { imdb: 7.8, rt: 93, mc: 81 } })).toBeCloseTo(7.8, 5);
    // zelfde film zonder RT geeft exact dezelfde score
    expect(appScore({ vote: 7.7, ext: { imdb: 7.8, mc: 81 } })).toBeCloseTo(7.8, 5);
    // RT-only levert geen app-score op (1 bron: alleen TMDB telt dan)
    expect(appScore({ vote: 7.0, ext: { rt: 95 } })).toBeCloseTo(7.0, 5);
    expect(fmtScore(8)).toBe('8,0');
    expect(fmtScore(7.25)).toBe('7,3');
  });

  it('matchmotor: profiel weegt op ratings en geeft uitlegbare redenen', async () => {
    const { buildTaste, matchScore } = await import('../src/lib/taste.js');
    const meta = {
      'a|2020': { genres: ['Drama', 'Mystery'], votes: 2000, country: 'FR' },
      'b|2020': { genres: ['Action'], votes: 900000, country: 'US' },
    };
    const taste = buildTaste({
      watchlist: [],
      ratedFilms: [
        { key: 'a|2020', year: 1995, rating: 5 },
        { key: 'b|2020', year: 2015, rating: 1.5 },
      ],
      meta,
    });
    expect(taste.genres.Drama).toBeGreaterThan(0.5);
    expect(taste.genres.Action).toBeLessThan(0);
    const drama90s = matchScore({ vote: 7.6, votes: 1500, year: 1994, lang: 'fr', genre_ids: [18, 9648] }, taste);
    const actie = matchScore({ vote: 7.6, votes: 1500, year: 1994, lang: 'fr', genre_ids: [28] }, taste);
    expect(drama90s.score).toBeGreaterThan(actie.score);
    expect(drama90s.redenen.join(' ')).toContain('past bij je hoogst beoordeelde films');
    expect(actie.redenen.join(' ')).toContain('let op');
  });

  it('verken toont match-badges zodra het profiel sterk genoeg is', () => {
    // profiel sterk maken: 10 uitgesproken ratings
    const rf = [];
    for (let i = 0; i < 10; i++) rf.push({ key: `film${i}|2000`, name: `Film${i}`, year: 2000, rating: 5 });
    localStorage.setItem('picker.ratedFilms', JSON.stringify(rf));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Programma')[0]);
    fireEvent.click(screen.getByText('Voor jou'));
    expect(document.body.textContent).toContain('% match');
    const lijstToggle = screen.queryByText('Toon als één lijst');
    if (lijstToggle) fireEvent.click(lijstToggle);
    expect(document.body.textContent).toContain('Beste match voor jou');
  });

  it('maker-zoek: duplicaat-profielen ontdubbeld, regie chronologisch', async () => {
    const { searchPersons, personFilms } = await import('../src/lib/tmdb.js');
    global.fetch = async (url) => ({
      ok: true, status: 200,
      json: async () => (String(url).includes('/search/person')
        ? { results: [
            { id: 2, name: 'Wes Anderson', popularity: 0.6, known_for_department: 'Acting', known_for: [] },
            { id: 1, name: 'Wes Anderson', popularity: 25, known_for_department: 'Directing', known_for: [{}] },
            { id: 3, name: 'Eric Chase Anderson', popularity: 2, known_for_department: 'Acting', known_for: [{}] },
          ] }
        : { crew: [
            { id: 11, job: 'Director', title: 'Oude Film', release_date: '1998-01-01', genre_ids: [] },
            { id: 12, job: 'Director', title: 'Nieuwe Film', release_date: '2023-01-01', genre_ids: [] },
          ], cast: [] }),
    });
    const ppl = await searchPersons('k', 'wes anderson');
    expect(ppl.length).toBe(2); // duplicaat weg
    expect(ppl[0].id).toBe(1); // populairste profiel wint
    const films = await personFilms('k', 1);
    expect(films[0].title).toBe('Nieuwe Film'); // regie nieuwste eerst
    expect(films[1].title).toBe('Oude Film');
    delete global.fetch;
  });

  it('mengmotor: similar- en oeuvre-instroom met bronlabels', () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Programma')[0]);
    fireEvent.click(screen.getByText('Voor jou'));
    expect(document.body.textContent).toContain('Vergelijkbare Parel');
    expect(document.body.textContent).toContain('Lijkt op Aftersun');
    expect(document.body.textContent).toContain('Oeuvre Film');
    expect(document.body.textContent).toContain('Uit het oeuvre van Charlotte Wells');
  });

  it('feedback-lus: skippen verlaagt genre-affiniteit', async () => {
    const { buildTaste } = await import('../src/lib/taste.js');
    const basis = { watchlist: [], ratedFilms: [{ key: 'x|2000', year: 2000, rating: 4 }], meta: { 'x|2000': { genres: ['Drama'], votes: 100 } } };
    const zonder = buildTaste(basis);
    const met = buildTaste({ ...basis, skipped: [{ id: 1, genre_ids: [35] }, { id: 2, genre_ids: [35] }] });
    expect(met.genres.Comedy ?? 0).toBeLessThan(zonder.genres.Comedy ?? 0);
  });

  it('camp shakespeare-regressie: 10-met-5-stemmen wordt gedempt en gevloerd', async () => {
    const { matchScore, buildTaste } = await import('../src/lib/taste.js');
    const taste = buildTaste({
      watchlist: [],
      ratedFilms: [{ key: 'x|2020', year: 2020, rating: 5 }],
      meta: { 'x|2020': { genres: ['Drama'], votes: 2000 } },
    });
    const junk = matchScore({ vote: 10, votes: 5, year: 2021, lang: 'en', genre_ids: [18] }, taste);
    const solide = matchScore({ vote: 7.6, votes: 3000, year: 2021, lang: 'en', genre_ids: [18] }, taste); // Nomadland-schaal
    expect(solide.score).toBeGreaterThan(junk.score + 10); // Bayes dempt de nep-10 hard
    expect(junk.redenen.join(' ')).toContain('korrel zout');
    expect(solide.redenen.join(' ')).toContain('sterk beoordeeld');
  });

  it('mengmotor-vloer: kandidaten met <30 stemmen komen de pool niet in', () => {
    const metaNow = JSON.parse(localStorage.getItem('picker.meta'));
    metaNow['aftersun|2022'].sims.push({ id: 7999, title: 'Junk Short', year: 2021, poster: null, vote: 10, votes: 5, lang: 'en', genre_ids: [18] });
    localStorage.setItem('picker.meta', JSON.stringify(metaNow));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Programma')[0]);
    fireEvent.click(screen.getByText('Voor jou'));
    expect(document.body.textContent).toContain('Vergelijkbare Parel'); // 800 stemmen: blijft
    expect(document.body.textContent).not.toContain('Junk Short'); // 5 stemmen: eruit
  });

  it('"Andere suggesties" haalt live nieuwe kandidaten uit TMDB', async () => {
    // alleen de tweede discover-pagina (de klik) levert de vondst;
    // de automatische instroom bij het openen (ook de klassiekers, met hun
    // eigen tweede pagina vanaf 10000 stemmen) krijgt lege resultaten
    global.fetch = async (url) => ({
      ok: true, status: 200,
      json: async () => (String(url).includes('/discover/') && String(url).includes('page=2') && !String(url).includes('vote_count.gte=10000')
        ? { total_pages: 5, results: [{ id: 8800, title: 'Verse Vondst', release_date: '2016-02-01', poster_path: null, vote_average: 7.4, vote_count: 4200, original_language: 'fr', overview: 'Live getapt.', genre_ids: [18] }] }
        : { total_pages: 1, results: [] }),
    });
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Programma')[0]);
    fireEvent.click(screen.getByText('Voor jou'));
    await new Promise((r) => setTimeout(r, 30)); // automatische instroom laten settelen
    expect(document.body.textContent).not.toContain('Verse Vondst');
    fireEvent.click(screen.getByText('Andere suggesties'));
    expect(await screen.findByText('Verse Vondst')).toBeTruthy();
    // te weinig kandidaten voor rijen: de kaartenlijst toont de reden
    expect(document.body.textContent).toContain('Via jouw smaakprofiel gevonden');
    delete global.fetch;
  });

  it('zoekmachine: criteria worden server-side queryparameters', async () => {
    const calls = [];
    global.fetch = async (url) => {
      calls.push(String(url));
      return { ok: true, status: 200, json: async () => ({
        total_pages: 8, total_results: 156,
        results: [{ id: 5000, title: 'Servergevonden', release_date: '1994-01-01', poster_path: null, vote_average: 7.8, vote_count: 3000, original_language: 'fr', overview: 'x', genre_ids: [18] }],
      }) };
    };
    startOpZoeken();
    render(<App />);
    naarZoeken({ filters: true });
    // criteria zetten: genre Drama (18) + niet-Engels, geen tekst
    fireEvent.click(screen.getByText('Drama'));
    fireEvent.change(screen.getByLabelText('Taal'), { target: { value: 'niet-en' } });
    fireEvent.click(screen.getByText('Zoek'));
    expect(await screen.findByText('Servergevonden')).toBeTruthy();
    // de laatste call is /discover met de criteria als parameters — geen client-zeef
    const disc = calls.find((u) => u.includes('/discover/movie'));
    expect(disc).toBeTruthy();
    expect(disc).toContain('with_genres=18'); // genre server-side
    // 'niet-Engels' kent TMDB niet als parameter → bewust client-side; met een echte
    // taalcode (fr/ja/…) zou with_original_language wél in de URL staan
    expect(document.body.textContent).toContain('156 resultaten');
    expect(document.body.textContent).toContain('pagina 1 van 8');
    delete global.fetch;
  });

  it('resolveFilm: kiest het juiste jaar bij gelijknamige films (Leviathan-bug)', async () => {
    global.fetch = async (url) => {
      const u = String(url);
      // primary_release_year=2014 → geen hit; brede zoek geeft beide Leviathans
      if (u.includes('/search/movie')) {
        if (u.includes('primary_release_year=2014')) return { ok: true, status: 200, json: async () => ({ results: [] }) };
        return { ok: true, status: 200, json: async () => ({ results: [
          { id: 111, title: 'Leviathan', release_date: '1989-03-17', vote_count: 20000 },
          { id: 222, title: 'Leviathan', release_date: '2014-09-25', vote_count: 900 },
        ] }) };
      }
      // detail van het gekozen id
      const id = u.match(/movie\/(\d+)/)[1];
      return { ok: true, status: 200, json: async () => ({ id: +id, title: 'Leviathan', release_date: id === '222' ? '2014-09-25' : '1989-03-17', runtime: 140, genres: [], vote_average: 7, vote_count: 900, credits: { crew: [] }, videos: { results: [] }, recommendations: { results: [] }, 'watch/providers': { results: {} } }) };
    };
    const { resolveFilm } = await import('../src/lib/tmdb.js');
    const meta = await resolveFilm({ name: 'Leviathan', year: 2014, key: 'leviathan|2014' }, 'k');
    expect(meta.id).toBe(222); // de 2014-versie, niet de populairdere 1989
    expect(meta.year).toBe(2014);
    expect(meta.yearMismatch).toBeUndefined();
    delete global.fetch;
  });

  // Festivaljaar: Letterboxd zegt Mud (2012), TMDB kent de echte Mud als 2013
  const mudFetch = (calls) => async (url) => {
    const u = String(url);
    calls.push(u);
    const json = (obj) => ({ ok: true, status: 200, json: async () => obj });
    if (u.includes('/search/movie')) {
      const obscuur = { id: 999, title: 'Mud', release_date: '2012-06-01', vote_count: 1 };
      const echt = { id: 103731, title: 'Mud', release_date: '2013-04-26', vote_count: 3193 };
      return json({ results: u.includes('primary_release_year=2012') ? [obscuur] : [echt, obscuur] });
    }
    const id = +u.match(/movie\/(\d+)/)[1];
    return json({ id, title: 'Mud', release_date: id === 103731 ? '2013-04-26' : '2012-06-01', runtime: 130, genres: [], vote_average: 7.1, vote_count: id === 103731 ? 3193 : 1, credits: { crew: [] }, videos: { results: [] }, recommendations: { results: [] }, 'watch/providers': { results: {} } });
  };

  it('resolveFilm: festivaljaar, de bekende film een jaar later wint van een obscure naamgenoot', async () => {
    const calls = [];
    global.fetch = mudFetch(calls);
    try {
      const { resolveFilm, herstelFestivalJaar } = await import('../src/lib/tmdb.js');
      const m = await resolveFilm({ name: 'Mud', year: 2012, key: 'mud|2012' }, 'k');
      expect(m.id).toBe(103731);
      expect(m.year).toBe(2013);
      expect(m.yearMismatch).toBeUndefined(); // een jaar verschil is normaal, geen twijfelgeval
      // een bestaande foute koppeling herstellen, een goede met stemmen laten staan
      expect((await herstelFestivalJaar({ name: 'Mud', year: 2012 }, { id: 999, votes: 1 }, 'k')).id).toBe(103731);
      expect(await herstelFestivalJaar({ name: 'Mud', year: 2012 }, { id: 103731, votes: 3193 }, 'k')).toBeNull();
    } finally {
      delete global.fetch;
    }
  });

  it('festivaljaar: bestaande foute koppelingen worden eenmalig op de achtergrond hersteld', async () => {
    const calls = [];
    global.fetch = mudFetch(calls);
    localStorage.clear();
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('picker.watchlist', JSON.stringify([{ key: 'mud|2012', name: 'Mud', year: 2012, uri: '' }]));
    localStorage.setItem('picker.meta', JSON.stringify({ 'mud|2012': { id: 999, title: 'Mud', year: 2012, votes: 1, at: Date.now(), trailer: null } }));
    try {
      render(<App />);
      await waitFor(() => expect(JSON.parse(localStorage.getItem('picker.koppelHerstel'))).toBe(1), { timeout: 8000 });
      expect(calls.some((u) => u.includes('/movie/103731'))).toBe(true);
    } finally {
      delete global.fetch;
    }
  }, 12000);

  it('matchcontrole: een correcte match met kloppend jaar wordt NIET gevlagd (ook bij net andere titel)', async () => {
    // Regressie V4.4.3: een exacte-titel-check vlagde massa's goede matches
    // omdat TMDB vaak een net andere schrijfwijze teruggeeft. Een film met
    // kloppend jaar en normale looptijd hoort géén twijfelgeval te zijn.
    global.fetch = async (url) => {
      const u = String(url);
      if (u.includes('/search/movie')) {
        return { ok: true, status: 200, json: async () => ({ results: [
          { id: 502, title: 'Eddie the Eagle', release_date: '2015-12-26', vote_count: 3000 },
        ] }) };
      }
      return { ok: true, status: 200, json: async () => ({ id: 502, title: "Eddie 'The Eagle'", release_date: '2015-12-26', runtime: 106, genres: [], vote_average: 7, vote_count: 3000, credits: { crew: [] }, videos: { results: [] }, recommendations: { results: [] }, 'watch/providers': { results: {} } }) };
    };
    const { resolveFilm } = await import('../src/lib/tmdb.js');
    const meta = await resolveFilm({ name: 'Eddie the Eagle', year: 2015, key: 'eddie-the-eagle|2015' }, 'k');
    expect(meta.year).toBe(2015);
    expect(meta.yearMismatch).toBeUndefined(); // kloppend jaar + normale duur = geen twijfel
    delete global.fetch;
  });

  it('matchcontrole: een korte film waar een speelfilm werd verwacht wordt gevlagd', async () => {
    global.fetch = async (url) => {
      const u = String(url);
      if (u.includes('/search/movie')) return { ok: true, status: 200, json: async () => ({ results: [{ id: 601, title: 'Piper', release_date: '2016-06-16', vote_count: 500 }] }) };
      return { ok: true, status: 200, json: async () => ({ id: 601, title: 'Piper', release_date: '2016-06-16', runtime: 6, genres: [], vote_average: 8, vote_count: 500, credits: { crew: [] }, videos: { results: [] }, recommendations: { results: [] }, 'watch/providers': { results: {} } }) };
    };
    const { resolveFilm } = await import('../src/lib/tmdb.js');
    const meta = await resolveFilm({ name: 'Piper', year: 2016, key: 'piper|2016' }, 'k');
    expect(meta.yearMismatch).toBeTruthy(); // 6 minuten = verdacht kort
    delete global.fetch;
  });

  it('zoekmachine: vrije stemmen-invoer wordt server-side vote_count', async () => {
    const calls = [];
    global.fetch = async (url) => { calls.push(String(url)); return { ok: true, status: 200, json: async () => ({ total_pages: 2, total_results: 30, results: [{ id: 6001, title: 'Breedgezien', release_date: '2010-01-01', poster_path: null, vote_average: 8.1, vote_count: 90000, original_language: 'en', overview: 'x', genre_ids: [18] }] }) }; };
    startOpZoeken();
    render(<App />);
    naarZoeken({ filters: true });
    fireEvent.change(screen.getByLabelText('Minimaal aantal stemmen'), { target: { value: '50000' } });
    fireEvent.click(screen.getByText('Zoek'));
    expect(await screen.findByText('Breedgezien')).toBeTruthy();
    const disc = calls.find((u) => u.includes('/discover/movie'));
    expect(disc).toContain('vote_count.gte=50000');
    expect(disc).not.toContain('vote_count.lte'); // geen bovengrens = geen lege doorsnede
    delete global.fetch;
  });

  it('zoekmachine: preset-chip vult de stemmen-velden', () => {
    startOpZoeken();
    render(<App />);
    naarZoeken({ filters: true });
    fireEvent.click(screen.getByText('Onder de radar'));
    expect(screen.getByLabelText('Minimaal aantal stemmen').value).toBe('400');
    expect(screen.getByLabelText('Maximaal aantal stemmen').value).toBe('2500');
  });

  it('get() stuurt nooit letterlijke "undefined" mee (breed-gezien-bug)', async () => {
    let captured = '';
    global.fetch = async (url) => { captured = String(url); return { ok: true, status: 200, json: async () => ({ total_pages: 1, total_results: 5, results: [] }) }; };
    const { discover } = await import('../src/lib/tmdb.js');
    await discover('k', { minVotes: 50000, maxVotes: undefined, genreIds: [], minScore: undefined });
    expect(captured).toContain('vote_count.gte=50000');
    expect(captured).not.toContain('undefined');
    expect(captured).not.toContain('vote_count.lte');
    delete global.fetch;
  });

  it('verken: zoekresultaten blijven behouden na kaart openen en terug', async () => {
    global.fetch = async (url) => {
      const u = String(url);
      if (u.includes('/search/movie')) return { ok: true, status: 200, json: async () => ({ results: [{ id: 4242, title: 'Blijverfilm', release_date: '2011-01-01', poster_path: null, vote_average: 7.3, vote_count: 5000, original_language: 'en', overview: 'x', genre_ids: [18] }] }) };
      if (u.includes('/search/person')) return { ok: true, status: 200, json: async () => ({ results: [] }) };
      return { ok: true, status: 200, json: async () => ({ id: 4242, title: 'Blijverfilm', release_date: '2011-01-01', runtime: 100, genres: [{ name: 'Drama' }], vote_average: 7.3, vote_count: 5000, poster_path: null, backdrop_path: null, overview: 'x', imdb_id: 'tt4242', production_countries: [], credits: { crew: [{ job: 'Director', name: 'Regisseur X' }] }, videos: { results: [] }, recommendations: { results: [] }, 'watch/providers': { results: {} } }) };
    };
    startOpZoeken();
    render(<App />);
    naarZoeken();
    fireEvent.change(screen.getByLabelText('Zoek op titel of maker'), { target: { value: 'blijver' } });
    fireEvent.click(screen.getByText('Zoek'));
    expect(await screen.findByText('Blijverfilm')).toBeTruthy();
    fireEvent.click(screen.getByText('Bekijk kaart'));
    expect(await screen.findByText(/Regisseur X/)).toBeTruthy();
    fireEvent.click(screen.getByText('Terug naar het programma'));
    // de zoekresultaten moeten er nog zijn — niet weggevaagd
    expect(screen.getByText('Blijverfilm')).toBeTruthy();
    expect(screen.getByLabelText('Zoek op titel of maker').value).toBe('blijver');
    delete global.fetch;
  });

  it('inzicht: smaakprofiel-kaart toont je genre-voorkeuren', () => {
    // sterk profiel: veel drama 5★, comedy 1★
    const rf = [];
    for (let i = 0; i < 8; i++) rf.push({ key: `d${i}|2015`, name: `D${i}`, year: 2015, rating: 5 });
    for (let i = 0; i < 5; i++) rf.push({ key: `c${i}|2015`, name: `C${i}`, year: 2015, rating: 1 });
    const m = {};
    rf.forEach((f) => { m[f.key] = { id: f.key, genres: [f.key[0] === 'd' ? 'Drama' : 'Comedy'], votes: 1500, country: 'US' }; });
    localStorage.setItem('picker.ratedFilms', JSON.stringify(rf));
    localStorage.setItem('picker.meta', JSON.stringify(m));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Jaarboek')[0]);
    expect(document.body.textContent).toContain('Jouw smaakprofiel');
    expect(document.body.textContent).toContain('Drama');
  });

  it('verken: skip toont een zichtbare feedback-nudge', () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Programma')[0]);
    fireEvent.click(screen.getByText('Voor jou'));
    const kaart = screen.getByText('Vergelijkbare Parel').closest('.card');
    fireEvent.click(within(kaart).getByText('Niet voor mij'));
    expect(document.body.textContent).toMatch(/je ziet nu iets minder/i);
  });

  it('zoekmachine: ruime talenlijst met o.a. Noors', () => {
    startOpZoeken();
    render(<App />);
    naarZoeken({ filters: true });
    const sel = screen.getByLabelText('Taal');
    const opties = [...sel.querySelectorAll('option')].map((o) => o.textContent);
    expect(opties).toContain('Noors');
    expect(opties).toContain('Tsjechisch');
    expect(opties).toContain('Thai');
    expect(opties.length).toBeGreaterThan(30);
  });

  it('winner: lange synopsis is inklapbaar met meer/minder', () => {
    const lang = 'In een verarmde post-Sovjetgemeenschap wordt Lilya door haar moeder achtergelaten. '.repeat(6);
    localStorage.setItem('picker.meta', JSON.stringify({ 'lilya|2002': { id: 1, poster: null, plot: lang, vote: 7.9, votes: 3000, genres: ['Drama'], at: Date.now(), trailer: null } }));
    localStorage.setItem('picker.watchlist', JSON.stringify([{ key: 'lilya|2002', name: 'Lilya 4-ever', year: 2002, uri: '' }]));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Archief')[0]);
    fireEvent.click(screen.getByLabelText(/Open Lilya/));
    const meer = screen.getByText('meer');
    expect(meer).toBeTruthy();
    // ingeklapt: niet de volledige tekst
    expect(document.body.textContent).toContain('…');
    fireEvent.click(meer);
    expect(screen.getByText('minder')).toBeTruthy();
  });

  it('setup: visuele match-kiezer laat je de juiste film aanklikken', async () => {
    global.fetch = async (url) => {
      const u = String(url);
      if (u.includes('/search/movie')) return { ok: true, status: 200, json: async () => ({ results: [
        { id: 111, title: 'Leviathan', release_date: '1989-03-17', poster_path: '/a.jpg', vote_average: 5.9, vote_count: 20000, original_language: 'en', overview: 'x' },
        { id: 222, title: 'Leviathan', release_date: '2014-09-25', poster_path: '/b.jpg', vote_average: 7.6, vote_count: 900, original_language: 'ru', overview: 'y' },
      ] }) };
      return { ok: true, status: 200, json: async () => ({ id: 222, title: 'Leviathan', release_date: '2014-09-25', runtime: 140, genres: [], vote_average: 7.6, vote_count: 900, poster_path: '/b.jpg', backdrop_path: null, overview: 'y', imdb_id: 'tt222', production_countries: [], credits: { crew: [] }, videos: { results: [] }, recommendations: { results: [] }, 'watch/providers': { results: {} } }) };
    };
    // film met mismatch-vlag: watchlist zegt 2014, meta staat op 1989
    localStorage.setItem('picker.watchlist', JSON.stringify([{ key: 'leviathan|2014', name: 'Leviathan', year: 2014, uri: '' }]));
    localStorage.setItem('picker.meta', JSON.stringify({ 'leviathan|2014': { id: 111, year: 1989, poster: '/a.jpg', yearMismatch: 2014, at: Date.now() } }));
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'k', lang: 'nl' }));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Setup')[0]);
    fireEvent.click(screen.getByText(/afwijkend jaar/));
    // kandidaten verschijnen als posters; kies de 2014-versie
    const juiste = await screen.findByLabelText(/Kies Leviathan \(2014\)/);
    fireEvent.click(juiste);
    // na keuze verdwijnt de mismatch (knop weg) — even de microtask laten lopen
    await new Promise((r) => setTimeout(r, 0));
    delete global.fetch;
  });

  it('taste: thema-affiniteit uit keywords stuurt de matchscore', async () => {
    const { buildTaste, matchScore, setThemeEmphasis } = await import('../src/lib/taste.js');
    setThemeEmphasis(1);
    // twee 5-sterrenfilms met keyword 'loneliness' (id 1) → sterk positief thema
    const ratedFilms = [
      { key: 'a|2020', name: 'A', year: 2020, rating: 5 },
      { key: 'b|2019', name: 'B', year: 2019, rating: 5 },
    ];
    const meta = {
      'a|2020': { id: 1, genres: ['Drama'], keywords: [{ id: 1, name: 'loneliness' }], votes: 3000, country: 'US' },
      'b|2019': { id: 2, genres: ['Drama'], keywords: [{ id: 1, name: 'loneliness' }], votes: 2500, country: 'US' },
    };
    const taste = buildTaste({ watchlist: [], ratedFilms, meta });
    expect(taste.topThemes.some((x) => x.name === 'loneliness')).toBe(true);
    // kandidaat mét het thema scoort hoger dan identieke kandidaat zónder
    const metThema = matchScore({ vote: 7.2, votes: 3000, year: 2021, lang: 'en', genre_ids: [18], keywords: [{ id: 1, name: 'loneliness' }] }, taste);
    const zonder = matchScore({ vote: 7.2, votes: 3000, year: 2021, lang: 'en', genre_ids: [18], keywords: [{ id: 99, name: 'car chase' }] }, taste);
    expect(metThema.score).toBeGreaterThan(zonder.score);
    expect(metThema.redenen.some((r) => /loneliness/.test(r))).toBe(true);
  });

  it('taste: emphasis 0 schakelt thema-invloed uit', async () => {
    const { buildTaste, matchScore, setThemeEmphasis } = await import('../src/lib/taste.js');
    const ratedFilms = [{ key: 'a|2020', name: 'A', year: 2020, rating: 5 }, { key: 'b|2019', name: 'B', year: 2019, rating: 5 }];
    const meta = { 'a|2020': { id: 1, genres: ['Drama'], keywords: [{ id: 1, name: 'loneliness' }], votes: 3000, country: 'US' }, 'b|2019': { id: 2, genres: ['Drama'], keywords: [{ id: 1, name: 'loneliness' }], votes: 2500, country: 'US' } };
    const taste = buildTaste({ watchlist: [], ratedFilms, meta });
    setThemeEmphasis(0);
    const metThema = matchScore({ vote: 7.2, votes: 3000, year: 2021, lang: 'en', genre_ids: [18], keywords: [{ id: 1, name: 'loneliness' }] }, taste);
    const zonder = matchScore({ vote: 7.2, votes: 3000, year: 2021, lang: 'en', genre_ids: [18], keywords: [{ id: 99, name: 'x' }] }, taste);
    expect(metThema.score).toBe(zonder.score); // thema telt niet mee
    setThemeEmphasis(1); // reset voor andere tests
  });

  it('matchkiezer: vindt alternatieven via de proxy, óók zonder eigen sleutel', async () => {
    // Regressie: de kiezer gebruikte app.settings.tmdbKey (leeg bij proxy-
    // gebruikers) i.p.v. de effectieve sleutel, dus zei hij altijd "geen film
    // gevonden". Hier bewijzen we dat hij mét lege eigen sleutel wél zoekt.
    const calls = [];
    global.fetch = async (url) => {
      const u = String(url);
      calls.push(u);
      if (u.includes('/search/movie')) return { ok: true, status: 200, json: async () => ({ results: [
        { id: 888, title: 'Eddie the Eagle', release_date: '2015-12-26', poster_path: '/e.jpg', vote_average: 7, vote_count: 3000, original_language: 'en', overview: 'ski' },
      ] }) };
      return { ok: true, status: 200, json: async () => ({ results: [] }) };
    };
    localStorage.clear();
    localStorage.setItem('picker.watchlist', JSON.stringify([{ key: 'eddie|2015', name: 'Eddie the Eagle', year: 2015, uri: '' }]));
    localStorage.setItem('picker.meta', JSON.stringify({ 'eddie|2015': { id: 222, year: 1989, poster: '/x.jpg', yearMismatch: 2015, mismatchType: 'year', at: Date.now() } }));
    // géén tmdbKey in settings: dit apparaat draait op de proxy
    localStorage.setItem('picker.settings', JSON.stringify({ lang: 'nl' }));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Setup')[0]);
    fireEvent.click(screen.getByText(/afwijkend jaar/));
    // het alternatief uit de zoekopdracht verschijnt: de kiezer werkt
    expect(await screen.findByText(/Eddie the Eagle/)).toBeTruthy();
    // en de zoekopdracht liep echt via de proxy-URL, niet met een lege sleutel
    expect(calls.some((u) => u.includes('workers.dev') && u.includes('/search/movie'))).toBe(true);
    expect(calls.some((u) => u.includes('api_key=&') || u.includes('api_key=&query'))).toBe(false);
    delete global.fetch;
  });

  it('matchcontrole: korte film met kloppend jaar krijgt type short (opt-in), jaarafwijking type year', async () => {
    const basis = (id, title, jaar, runtime) => ({ id, title, release_date: `${jaar}-01-01`, runtime, genres: [], vote_average: 7, vote_count: 900, credits: { crew: [] }, videos: { results: [] }, recommendations: { results: [] }, 'watch/providers': { results: {} } });
    // scenario 1: miniserie met kloppend jaar (Godless 2017, 0 min looptijd)
    global.fetch = async (url) => {
      const u = String(url);
      if (u.includes('/search/movie')) return { ok: true, status: 200, json: async () => ({ results: [{ id: 701, title: 'Godless', release_date: '2017-11-22', vote_count: 500 }] }) };
      return { ok: true, status: 200, json: async () => basis(701, 'Godless', 2017, 0) };
    };
    const { resolveFilm } = await import('../src/lib/tmdb.js');
    // 0 min telt niet als kort (onbekende looptijd), dus géén vlag
    let meta = await resolveFilm({ name: 'Godless', year: 2017, key: 'godless|2017' }, 'k');
    expect(meta.yearMismatch).toBeUndefined();

    // scenario 2: echte korte film (6 min) met kloppend jaar -> type 'short'
    global.fetch = async (url) => {
      const u = String(url);
      if (u.includes('/search/movie')) return { ok: true, status: 200, json: async () => ({ results: [{ id: 702, title: 'Piper', release_date: '2016-06-16', vote_count: 500 }] }) };
      return { ok: true, status: 200, json: async () => basis(702, 'Piper', 2016, 6) };
    };
    meta = await resolveFilm({ name: 'Piper', year: 2016, key: 'piper|2016' }, 'k');
    expect(meta.mismatchType).toBe('short');

    // scenario 3: verkeerd jaar -> type 'year'
    global.fetch = async (url) => {
      const u = String(url);
      if (u.includes('/search/movie')) return { ok: true, status: 200, json: async () => ({ results: [{ id: 703, title: 'Leviathan', release_date: '1989-03-17', vote_count: 900 }] }) };
      return { ok: true, status: 200, json: async () => basis(703, 'Leviathan', 1989, 140) };
    };
    meta = await resolveFilm({ name: 'Leviathan', year: 2014, key: 'leviathan|2014' }, 'k');
    expect(meta.mismatchType).toBe('year');
    delete global.fetch;
  });

  it('setup: tv-serie negeren haalt uit twijfellijst en aanbevelingen', async () => {
    global.fetch = async (url) => {
      const u = String(url);
      if (u.includes('/search/movie')) return { ok: true, status: 200, json: async () => ({ results: [
        { id: 777, title: '11-22-63: The Day the Nation Cried', release_date: '1989-01-01', poster_path: '/a.jpg', vote_average: 5, vote_count: 1, original_language: 'en', overview: 'docu' },
      ] }) };
      return { ok: true, status: 200, json: async () => ({ results: [] }) };
    };
    localStorage.setItem('picker.watchlist', JSON.stringify([{ key: '11.22.63|2016', name: '11.22.63', year: 2016, uri: '' }]));
    localStorage.setItem('picker.meta', JSON.stringify({ '11.22.63|2016': { id: 111, year: 1989, poster: '/a.jpg', yearMismatch: 2016, mismatchType: 'year', at: Date.now() } }));
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'k', lang: 'nl' }));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Setup')[0]);
    fireEvent.click(screen.getByText(/afwijkend jaar/));
    // de hint over tv-series verschijnt (mager resultaat)
    expect(await screen.findByText(/Mogelijk is dit een tv-serie/i)).toBeTruthy();
    // negeer 'm
    fireEvent.click(screen.getAllByText('Hoort niet op mijn filmlijst')[0]);
    // de twijfelknop verdwijnt (geen mismatches meer) en het item staat als genegeerd
    await waitFor(() => expect(screen.queryByText(/afwijkend jaar/)).toBeNull());
    expect(document.body.textContent).toMatch(/gemarkeerd als "geen film"/);
    delete global.fetch;
  });

  it('verken: thema-jacht legt uit waarom een film is aanbevolen', async () => {
    // sterk themaprofiel: 5-sterrenfilms met keyword 'loneliness' (id 90)
    const rf = [];
    for (let i = 0; i < 6; i++) rf.push({ key: `d${i}|2015`, name: `D${i}`, year: 2015, rating: 5 });
    const m = {};
    rf.forEach((f, i) => { m[f.key] = { id: 1000 + i, genres: ['Drama'], keywords: [{ id: 90, name: 'loneliness' }], votes: 3000, country: 'US', at: Date.now() }; });
    localStorage.setItem('picker.ratedFilms', JSON.stringify(rf));
    localStorage.setItem('picker.meta', JSON.stringify(m));
    localStorage.setItem('picker.watchlist', JSON.stringify([{ key: 'seed|2015', name: 'Seed', year: 2015, uri: '' }]));
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    global.fetch = async (url) => {
      const u = String(url);
      if (u.includes('with_keywords')) return { ok: true, status: 200, json: async () => ({ total_pages: 1, results: [
        { id: 8888, title: 'Eenzame Film', release_date: '2018-01-01', poster_path: null, vote_average: 7.6, vote_count: 4000, original_language: 'en', overview: 'x', genre_ids: [18] },
      ] }) };
      return { ok: true, status: 200, json: async () => ({ results: [], total_pages: 1 }) };
    };
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Programma')[0]);
    fireEvent.click(screen.getByText('Voor jou'));
    // de thema-jacht draait nu automatisch; geen chip meer
    // de gejaagde film verschijnt mét uitleg over het thema
    expect(await screen.findByText('Eenzame Film')).toBeTruthy();
    expect(document.body.textContent).toMatch(/thema['’]s: .*loneliness/i);
    delete global.fetch;
  });

  it('taste: themas moeten op >=2 films voorkomen en boilerplate valt weg', async () => {
    const { buildTaste, setThemeEmphasis } = await import('../src/lib/taste.js');
    setThemeEmphasis(1);
    const ratedFilms = [
      { key: 'a|2020', name: 'A', year: 2020, rating: 5 },
      { key: 'b|2019', name: 'B', year: 2019, rating: 5 },
      { key: 'c|2018', name: 'C', year: 2018, rating: 5 },
    ];
    const meta = {
      // 'loneliness' op 2 films → telt; 'circus' op 1 film → valt weg;
      // 'woman director' is boilerplate → valt weg ook al staat het op alle 3
      'a|2020': { id: 1, genres: ['Drama'], votes: 3000, country: 'US', keywords: [{ id: 10, name: 'loneliness' }, { id: 99, name: 'woman director' }] },
      'b|2019': { id: 2, genres: ['Drama'], votes: 3000, country: 'US', keywords: [{ id: 10, name: 'loneliness' }, { id: 99, name: 'woman director' }] },
      'c|2018': { id: 3, genres: ['Drama'], votes: 3000, country: 'US', keywords: [{ id: 77, name: 'circus' }, { id: 99, name: 'woman director' }] },
    };
    const taste = buildTaste({ watchlist: [], ratedFilms, meta });
    const namen = taste.topThemes.map((x) => x.name);
    expect(namen).toContain('loneliness'); // op 2 films
    expect(namen).not.toContain('circus'); // maar op 1 film
    expect(namen).not.toContain('woman director'); // boilerplate, ongeacht frequentie
  });

  it('taste: watchlist-films leveren geen themas (alleen gewaardeerde)', async () => {
    const { buildTaste } = await import('../src/lib/taste.js');
    const watchlist = [{ key: 'w1|2020', name: 'W1', year: 2020 }, { key: 'w2|2019', name: 'W2', year: 2019 }];
    const meta = {
      'w1|2020': { id: 1, genres: ['Drama'], votes: 3000, keywords: [{ id: 10, name: 'loneliness' }] },
      'w2|2019': { id: 2, genres: ['Drama'], votes: 3000, keywords: [{ id: 10, name: 'loneliness' }] },
    };
    const taste = buildTaste({ watchlist, ratedFilms: [], meta });
    expect(taste.topThemes.length).toBe(0); // watchlist telt niet mee voor thema's
  });

  it('i18n: taal wisselen naar Engels vertaalt de tabnamen', () => {
    render(<App />);
    // standaard NL: 'Programma' en 'Archief' zichtbaar
    expect(screen.getAllByText('Programma').length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByLabelText('Setup')[0]);
    fireEvent.click(screen.getByText('English'));
    // nu Engels: 'Programme' en 'Archive' verschijnen, 'Programma' verdwijnt
    expect(screen.getAllByText('Programme').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Archive').length).toBeGreaterThan(0);
    expect(screen.queryByText('Programma')).toBeNull();
  });

  it('i18n: t() interpoleert variabelen en kiest meervoud', async () => {
    const { t, setLang } = await import('../src/lib/i18n.js');
    setLang('nl');
    expect(t('common.films_over', { count: 1 })).toBe('1 film over');
    expect(t('common.films_over', { count: 5 })).toBe('5 films over');
    setLang('en');
    expect(t('common.films_over', { count: 1 })).toBe('1 film left');
    expect(t('common.films_over', { count: 3 })).toBe('3 films left');
    expect(t('nav.bieb')).toBe('Archive');
    setLang('nl'); // reset
  });

  it('i18n: Engels vertaalt de Pick-tab volledig (geen los Nederlands)', () => {
    localStorage.clear();
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'en' }));
    localStorage.setItem('picker.watchlist', JSON.stringify([{ key: 'a|2020', name: 'A', year: 2020 }, { key: 'b|2019', name: 'B', year: 2019 }]));
    render(<App />);
    const txt = document.body.textContent;
    expect(txt).toContain('The box office');
    expect(txt).toContain('Let fate decide');
    expect(txt).toContain('films in the pot');
    expect(txt).toContain('Trailer first');
    expect(txt).toContain('Seen left out');
    // geen kenmerkende Nederlandse UI-woorden meer
    expect(txt).not.toContain('Waar heb je zin in');
    expect(txt).not.toContain('Slim kiezen');
    expect(txt).not.toContain('Gezien');
    expect(txt).not.toContain('Aanvang');
  });

  it('i18n fase 3: meervouden kiezen de juiste vorm in beide talen', async () => {
    const { t, setLang } = await import('../src/lib/i18n.js');
    setLang('nl');
    expect(t('pick.potLabel', { count: 1 })).toBe('film in de pot');
    expect(t('pick.potLabel', { count: 6 })).toBe('films in de pot');
    expect(t('zoek.resCount', { count: 1 })).toBe('1 resultaat');
    expect(t('avond.overlapCount', { count: 1 })).toBe('1 film staat op al jullie lijsten');
    expect(t('match.votesShort', { count: 1, n: 1 })).toBe('1 stem');
    expect(t('setup.wrongFilms', { count: 2 })).toContain('afwijkend jaar');
    setLang('en');
    expect(t('pick.potLabel', { count: 1 })).toBe('film in the pot');
    expect(t('zoek.emptyTextFiltered', { count: 1, filters: 'x' })).toContain('There was 1 title match');
    expect(t('app.omdbStopLimit', { count: 1 })).toContain('1 film has no scores');
    setLang('nl'); // reset
  });

  it('i18n fase 3: pool-subtitel toont enkelvoud bij 1 film', () => {
    localStorage.clear();
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('picker.watchlist', JSON.stringify([{ key: 'a|2020', name: 'A', year: 2020 }]));
    render(<App />);
    expect(document.querySelector('.kassa-aantal').textContent).toBe('1 film in de pot');
    expect(document.body.textContent).not.toContain('1 films');
  });

  it('regio: refreshProviders leest de ingestelde regio en bewaart de JustWatch-link', async () => {
    const { setRegion, refreshProviders, DEFAULT_REGION } = await import('../src/lib/tmdb.js');
    global.fetch = async (url) => ({ ok: true, status: 200, json: async () => ({ results: {
      NL: { link: 'https://www.justwatch.com/nl/film/x', flatrate: [{ provider_name: 'Videoland' }] },
      GB: { link: 'https://www.justwatch.com/uk/movie/x', flatrate: [{ provider_name: 'BBC iPlayer' }] },
    } }) });
    setRegion('GB');
    const gb = await refreshProviders(1, 'k');
    expect(gb.flat).toEqual(['BBC iPlayer']);
    expect(gb.jwLink).toBe('https://www.justwatch.com/uk/movie/x');
    setRegion('NL');
    const nl = await refreshProviders(1, 'k');
    expect(nl.flat).toEqual(['Videoland']);
    expect(nl.jwLink).toBe('https://www.justwatch.com/nl/film/x');
    setRegion(DEFAULT_REGION);
    delete global.fetch;
  });

  it('regio: provider-badge is een klikbare JustWatch-link', () => {
    localStorage.setItem('picker.meta', JSON.stringify({ 'aftersun|2022': { id: 9, poster: null, vote: 7.8, votes: 5000, genres: ['Drama'], flat: ['MUBI'], jwLink: 'https://www.justwatch.com/nl/film/aftersun', at: Date.now(), trailer: null } }));
    localStorage.setItem('picker.watchlist', JSON.stringify([{ key: 'aftersun|2022', name: 'Aftersun', year: 2022, uri: '' }]));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Archief')[0]);
    fireEvent.click(screen.getByLabelText(/Open Aftersun/));
    const badge = screen.getByText(/Nu op MUBI/);
    const link = badge.closest('a');
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('https://www.justwatch.com/nl/film/aftersun');
  });

  it('regio: Setup heeft een regiokeuze met landen', () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Setup')[0]);
    const sel = screen.getByLabelText('Streaming-regio');
    const opties = [...sel.querySelectorAll('option')].map((o) => o.value);
    expect(opties).toContain('NL');
    expect(opties).toContain('GB');
    expect(opties).toContain('US');
    expect(opties.length).toBeGreaterThan(15);
  });

  it('regio: wisselen ververst het streamingaanbod automatisch', async () => {
    const calls = [];
    global.fetch = async (url) => {
      const u = String(url);
      if (u.includes('/watch/providers')) {
        calls.push(u);
        return { ok: true, status: 200, json: async () => ({ results: { GB: { link: 'https://www.justwatch.com/uk/movie/x', flatrate: [{ provider_name: 'BBC iPlayer' }] } } }) };
      }
      return { ok: true, status: 200, json: async () => ({ results: {} }) };
    };
    localStorage.setItem('picker.meta', JSON.stringify({ 'a|2020': { id: 42, poster: null, vote: 7, votes: 100, genres: [], flat: ['Videoland'], at: Date.now(), trailer: null } }));
    localStorage.setItem('picker.watchlist', JSON.stringify([{ key: 'a|2020', name: 'A', year: 2020, uri: '' }]));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Setup')[0]);
    fireEvent.change(screen.getByLabelText('Streaming-regio'), { target: { value: 'GB' } });
    await waitFor(() => expect(calls.length).toBeGreaterThan(0), { timeout: 2000 });
    expect(calls[0]).toContain('/movie/42/watch/providers');
    delete global.fetch;
  });

  it('fase 6: genre-labels en talenlijst schakelen mee naar Engels', async () => {
    const { genreLabelById } = await import('../src/lib/tmdb.js');
    const { setLang } = await import('../src/lib/i18n.js');
    setLang('nl');
    expect(genreLabelById(80)).toBe('Misdaad');
    setLang('en');
    expect(genreLabelById(80)).toBe('Crime');
    setLang('nl');
    // talenlijst in EN-modus via Intl
    cleanup();
    localStorage.clear();
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'en' }));
    localStorage.setItem('picker.watchlist', JSON.stringify([{ key: 'a|2020', name: 'A', year: 2020 }]));
    render(<App />);
    fireEvent.click(screen.getAllByText('Programme')[0]);
    fireEvent.click(screen.getByText('Show filters'));
    const sel = screen.getByLabelText('Language');
    const opties = [...sel.querySelectorAll('option')].map((o) => o.textContent);
    expect(opties).toContain('Norwegian');
    expect(opties).toContain('All languages');
    expect(opties).not.toContain('Noors');
  });

  it('fase 6: match-redenen komen in het Engels bij lang en', async () => {
    const { buildTaste, matchScore } = await import('../src/lib/taste.js');
    const { setLang } = await import('../src/lib/i18n.js');
    setLang('en');
    const meta = { 'a|2020': { id: 1, genres: ['Drama'], votes: 3000, country: 'US' }, 'b|2019': { id: 2, genres: ['Drama'], votes: 3000, country: 'US' } };
    const taste = buildTaste({ watchlist: [], ratedFilms: [{ key: 'a|2020', name: 'A', year: 2015, rating: 5 }, { key: 'b|2019', name: 'B', year: 2015, rating: 5 }], meta });
    const m = matchScore({ vote: 8, votes: 3000, year: 2016, lang: 'en', genre_ids: [18] }, taste);
    expect(m.redenen.some((r) => /matches your highest-rated films/.test(r))).toBe(true);
    expect(m.redenen.some((r) => /your era/.test(r))).toBe(true);
    setLang('nl');
  });

  it('veiligheid: extern trefwoord met HTML wordt geescaped, niet uitgevoerd', async () => {
    const { esc } = await import('../src/lib/i18n.js');
    expect(esc('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(esc("O'Brien & Co")).toBe('O&#39;Brien &amp; Co');
    // en door de hele keten: besmet TMDB-trefwoord in het smaakprofiel
    localStorage.clear();
    const evil = '<img src=x onerror=window.__pwned=1>';
    const kw = [{ id: 1, name: evil }];
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('picker.watchlist', JSON.stringify([{ key: 'a|2020', name: 'A', year: 2020 }]));
    localStorage.setItem('picker.ratedFilms', JSON.stringify([
      { key: 'a|2020', name: 'A', year: 2015, rating: 5 }, { key: 'b|2019', name: 'B', year: 2015, rating: 5 },
    ]));
    localStorage.setItem('picker.meta', JSON.stringify({
      'a|2020': { id: 1, genres: ['Drama'], votes: 3000, country: 'US', keywords: kw, at: Date.now() },
      'b|2019': { id: 2, genres: ['Drama'], votes: 3000, country: 'US', keywords: kw, at: Date.now() },
    }));
    render(<App />);
    fireEvent.click(screen.getAllByText('Jaarboek')[0]);
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(window.__pwned).toBeUndefined();
    expect(document.body.textContent).toContain('<img src=x');
  });

  it('taaldetectie: onbekende browsertaal valt terug op Engels, niet Nederlands', async () => {
    const { detectLang } = await import('../src/lib/i18n.js');
    const orig = Object.getOwnPropertyDescriptor(Navigator.prototype, 'language');
    Object.defineProperty(navigator, 'language', { value: 'fr-FR', configurable: true });
    expect(detectLang(null)).toBe('en');
    Object.defineProperty(navigator, 'language', { value: 'nl-BE', configurable: true });
    expect(detectLang(null)).toBe('nl');
    expect(detectLang('nl')).toBe('nl'); // opgeslagen keuze wint altijd
    delete navigator.language;
    if (orig) Object.defineProperty(Navigator.prototype, 'language', orig);
  });

  it('vertaling: decennium-dropdown en voortgangs-sleutels bestaan in beide talen', async () => {
    const { t, setLang } = await import('../src/lib/i18n.js');
    setLang('nl');
    expect(t('common.decade', { era: '90' })).toBe("Jaren '90");
    expect(t('app.enriching', { done: 3, total: 10 })).toContain('3/10');
    setLang('en');
    expect(t('common.decade', { era: '90' })).toBe("The '90s");
    expect(t('common.posterAlt', { name: 'Aftersun' })).toBe('Poster of Aftersun');
    setLang('nl');
  });

  it('opslag: kapotte localStorage geeft een zichtbare waarschuwing', async () => {
    const { reportStorageError } = await import('../src/lib/storage.js');
    render(<App />);
    expect(document.querySelector('[role="alert"]')).toBeNull();
    act(() => { reportStorageError(); });
    const alertEl = document.querySelector('[role="alert"]');
    expect(alertEl).toBeTruthy();
    expect(alertEl.textContent).toContain('niet meer opgeslagen');
  });

  it('opslag: Setup toont het gebruik in MB', () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Setup')[0]);
    expect(document.body.textContent).toMatch(/Opslag in gebruik: \d+,\d van ± 5 MB/);
  });

  it('bieb: paginering toont eerst 60 en laadt bij met Toon meer', () => {
    localStorage.clear();
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('picker.watchlist', JSON.stringify(
      Array.from({ length: 70 }, (_, i) => ({ key: `film${i}|2000`, name: `Film ${i}`, year: 2000 })),
    ));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Archief')[0]);
    expect(screen.getAllByLabelText(/^Open /).length).toBe(60);
    const btn = screen.getByText('Toon meer (10 over)');
    fireEvent.click(btn);
    expect(screen.getAllByLabelText(/^Open /).length).toBe(70);
    expect(screen.queryByText(/Toon meer/)).toBeNull();
    // filter-wijziging reset de teller
    fireEvent.change(screen.getByLabelText('Zoek in je archief'), { target: { value: 'Film' } });
    expect(screen.getAllByLabelText(/^Open /).length).toBe(60);
  });

  it('scores-onboarding: wizard met activatiemail-waarschuwing als er geen OMDb-sleutels zijn', () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Setup')[0]);
    expect(screen.getByText('Vier scores in plaats van één')).toBeTruthy();
    expect(document.body.textContent).toContain('activatielink');
    expect(document.querySelector('.scores-preview')).toBeTruthy();
    // één invoerveld eerst; rotatie pas na de toggle
    expect(screen.getByLabelText(/OMDb API-sleutels/).tagName).toBe('INPUT');
    fireEvent.click(screen.getByText(/Meerdere sleutels/));
    expect(screen.getByLabelText(/OMDb API-sleutels/).tagName).toBe('TEXTAREA');
  });

  it('scores-onboarding: status-modus bij actieve sleutels, met weg terug naar bewerken', () => {
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl', omdbKeys: ['aaaa1111', 'bbbb2222'] }));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Setup')[0]);
    expect(screen.getByText('OMDb actief · 2 sleutels')).toBeTruthy();
    expect(screen.queryByText('Vier scores in plaats van één')).toBeNull();
    fireEvent.click(screen.getByText('Wijzig sleutels'));
    expect(screen.getByLabelText(/OMDb API-sleutels/).value).toContain('aaaa1111');
  });

  it('scores-onboarding: spook-chipje op de filmkaart linkt naar Setup', () => {
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('picker.watchlist', JSON.stringify([{ key: 'a|2020', name: 'A', year: 2020 }]));
    localStorage.setItem('picker.meta', JSON.stringify({ 'a|2020': { id: 1, poster: null, vote: 7.2, votes: 900, genres: ['Drama'], at: Date.now() } }));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Archief')[0]);
    fireEvent.click(screen.getByLabelText(/^Open A/));
    const chip = screen.getByTitle(/Meer scores/);
    expect(chip.textContent).toContain('IMDb');
    fireEvent.click(chip);
    expect(screen.getByText('Vier scores in plaats van één')).toBeTruthy(); // we staan in Setup
  });

  it('proxy: zonder eigen sleutel loopt TMDB-verkeer via de Worker, zonder api_key', async () => {
    const { effectiveTmdbKey, PROXY_KEY, PROXY_URL, refreshProviders } = await import('../src/lib/tmdb.js');
    expect(PROXY_URL).toContain('workers.dev');
    expect(effectiveTmdbKey('')).toBe(PROXY_KEY);   // geen sleutel -> proxy
    expect(effectiveTmdbKey('abc')).toBe('abc');     // eigen sleutel wint
    let opgeroepen = '';
    global.fetch = async (url) => { opgeroepen = String(url); return { ok: true, status: 200, json: async () => ({ results: {} }) }; };
    await refreshProviders(42, PROXY_KEY);
    expect(opgeroepen.startsWith(`${PROXY_URL}/3/movie/42`)).toBe(true); // het VOLLEDIGE pad, incl. /3
    expect(opgeroepen).not.toContain('api_key');
    delete global.fetch;
  });

  it('proxy: sleutelloze gebruiker ziet werkende tool, geen sleutel-schermen', () => {
    localStorage.clear();
    localStorage.setItem('picker.settings', JSON.stringify({ lang: 'nl' }));
    localStorage.setItem('picker.watchlist', JSON.stringify([{ key: 'a|2020', name: 'A', year: 2020 }]));
    render(<App />);
    fireEvent.click(screen.getAllByText('Programma')[0]);
    expect(document.body.textContent).not.toContain('TMDB-sleutel nodig');
    fireEvent.click(screen.getAllByLabelText('Setup')[0]);
    expect(document.body.textContent).toContain('de tool regelt TMDB voor je');
  });

  it('opvolging: gisteren gepickt vraagt om sterren en voedt het profiel', () => {
    localStorage.clear();
    const gisteren = new Date(Date.now() - 20 * 3600e3).toISOString();
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('picker.watchlist', JSON.stringify([{ key: 'aftersun|2022', name: 'Aftersun', year: 2022 }]));
    localStorage.setItem('picker.history', JSON.stringify([{ key: 'aftersun|2022', name: 'Aftersun', year: 2022, date: gisteren, context: 'x' }]));
    render(<App />);
    expect(screen.getByText(/Aftersun \(2022\): Gekeken\?/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Geef 4 sterren'));
    // kaart weg, antwoord + rating bewaard
    expect(screen.queryByText(/Gekeken\?/)).toBeNull();
    const own = JSON.parse(localStorage.getItem('picker.ownRatings'));
    expect(own['aftersun|2022'].rating).toBe(4);
    // het kaartje uit de geschiedenis is afgescheurd, met jouw sterren
    const kaartjes = JSON.parse(localStorage.getItem('picker.kaartjes'));
    expect(kaartjes).toHaveLength(1);
    expect(kaartjes[0]).toMatchObject({ key: 'aftersun|2022', antwoord: 'gekeken', sterren: 4 });
    // en de film staat nu bij gezien, met jouw ster zichtbaar in de Bieb
    fireEvent.click(screen.getAllByLabelText('Archief')[0]);
    fireEvent.click(screen.getByRole('button', { name: /^Gezien \d/ }));
    expect(document.body.textContent).toContain('Aftersun');
    // en in de kaartjesdoos, met de sterren als stempel
    fireEvent.click(screen.getByRole('button', { name: 'Kaartjes 1' }));
    expect(document.querySelector('.kaartje-stub-titel').textContent).toBe('AFTERSUN');
    expect(document.querySelector('.kaartje-stub-stempel').textContent).toBe('★★★★');
  });

  it('opvolging: na een avond met meer picks één vraag, je tikt de gekeken film aan', () => {
    localStorage.clear();
    const t0 = Date.now() - 20 * 3600e3;
    const iso = (ms) => new Date(ms).toISOString();
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('picker.watchlist', JSON.stringify([
      { key: 'a|2001', name: 'Film A', year: 2001 }, { key: 'b|2002', name: 'Film B', year: 2002 }, { key: 'c|2003', name: 'Film C', year: 2003 },
    ]));
    // drie picks binnen een half uur: één avond, drie kaartjes
    localStorage.setItem('picker.kaartjes', JSON.stringify([
      { id: '3', key: 'c|2003', name: 'Film C', year: 2003, datum: iso(t0 + 30 * 60e3), bron: 'pick', personen: 1 },
      { id: '2', key: 'b|2002', name: 'Film B', year: 2002, datum: iso(t0 + 10 * 60e3), bron: 'pick', personen: 1, doorgeklikt: true },
      { id: '1', key: 'a|2001', name: 'Film A', year: 2001, datum: iso(t0), bron: 'pick', personen: 1 },
    ]));
    render(<App />);
    expect(screen.getByText('Je kreeg 3 kaartjes. Welke heb je gekeken?')).toBeTruthy();
    // het kaartje waar je doorklikte staat vooraan
    const keuzes = [...document.querySelectorAll('.fu-keuze')].map((b) => b.getAttribute('aria-label'));
    expect(keuzes).toEqual(['Ik keek Film B', 'Ik keek Film C', 'Ik keek Film A']);
    fireEvent.click(screen.getByLabelText('Ik keek Film C'));
    fireEvent.click(screen.getByLabelText('Geef 3 sterren'));
    expect(screen.queryByText(/Welke heb je gekeken/)).toBeNull();
    const k = JSON.parse(localStorage.getItem('picker.kaartjes'));
    const per = Object.fromEntries(k.map((x) => [x.key, x]));
    expect(per['c|2003']).toMatchObject({ antwoord: 'gekeken', sterren: 3 });
    expect(per['a|2001'].antwoord).toBe('niet');
    expect(per['b|2002'].antwoord).toBe('niet');
    expect(JSON.parse(localStorage.getItem('picker.ownRatings'))['c|2003'].rating).toBe(3);
  });

  it('kaartjesdoos: alleen met bewijs, nooit een stapel vragen', async () => {
    const { beoordeelKaartjes, vraagAvond, kaartjesUitGeschiedenis, voegKaartjeToe, nieuwKaartje, inDeDoos } = await import('../src/lib/kaartjesdoos.js');
    const DAG = 24 * 3600e3;
    const nu = new Date(2026, 10, 7, 12, 0).getTime();
    const iso = (ms) => new Date(ms).toISOString();
    const k = (id, key, ms, extra = {}) => ({ id, key, name: key, year: 2000, datum: iso(ms), bron: 'pick', personen: 1, ...extra });
    // een pick alleen is geen bewijs: open, en na 14 dagen verlopen
    let st = beoordeelKaartjes([k('1', 'a', nu - 2 * DAG)], { nu });
    expect(st[0].status).toBe('open');
    st = beoordeelKaartjes([k('1', 'a', nu - 20 * DAG)], { nu });
    expect(st[0].status).toBe('verlopen');
    // Letterboxd-dagboek op of na de pick-dag: afgescheurd, met die sterren
    const pick = new Date(2026, 10, 3, 20, 0).getTime();
    st = beoordeelKaartjes([k('1', 'a', pick)], { nu, diary: [{ key: 'a', watchedDate: '2026-11-03', rating: 4.5 }] });
    expect(st[0]).toMatchObject({ status: 'gekeken', bewijs: 'letterboxd', sterren: 4.5, gekekenOp: '2026-11-03' });
    // een dagboekregel van vóór de pick telt niet
    st = beoordeelKaartjes([k('1', 'a', pick)], { nu, diary: [{ key: 'a', watchedDate: '2026-11-01', rating: 3 }] });
    expect(st[0].status).toBe('open');
    // één dagboekregel scheurt één kaartje: het nieuwste dat ervoor lag
    st = beoordeelKaartjes([k('oud', 'a', pick - 2 * DAG), k('nieuw', 'a', pick)], { nu, diary: [{ key: 'a', watchedDate: '2026-11-04' }] });
    expect(st.find((x) => x.id === 'nieuw').status).toBe('gekeken');
    expect(st.find((x) => x.id === 'oud').status).toBe('open');
    // zelf als gezien gemarkeerd binnen 14 dagen: telt, met sterren als die er zijn
    st = beoordeelKaartjes([k('1', 'a', pick)], { nu, gezienOp: { a: iso(pick + 3 * 3600e3) }, ownRatings: { a: { rating: 5, at: pick + 3 * 3600e3 } } });
    expect(st[0]).toMatchObject({ status: 'gekeken', bewijs: 'gezien', sterren: 5 });
    // "niet gekeken" blijft buiten de doos
    st = beoordeelKaartjes([k('1', 'a', pick, { antwoord: 'niet' })], { nu, gezienOp: { a: iso(pick + 3600e3) } });
    expect(inDeDoos(st)).toHaveLength(0);
    // de vraag: alleen over de laatste avond die minstens 6 uur voorbij is
    const avondA = [k('a1', 'a', nu - 3 * DAG), k('a2', 'b', nu - 3 * DAG + 3600e3)];
    const avondB = [k('b1', 'c', nu - DAG)];
    const vraag = vraagAvond(beoordeelKaartjes([...avondA, ...avondB], { nu }), nu);
    expect(vraag.map((x) => x.id)).toEqual(['b1']);
    // is die laatste avond al bekend (bewijs), dan komt er geen vraag over oudere
    const zonder = vraagAvond(beoordeelKaartjes([...avondA, k('b1', 'c', nu - DAG, { antwoord: 'gekeken' })], { nu }), nu);
    expect(zonder).toBeNull();
    // en niet over de avond van nu (minder dan 6 uur geleden)
    expect(vraagAvond(beoordeelKaartjes([k('x', 'a', nu - 2 * 3600e3)], { nu }), nu)).toBeNull();
    // dezelfde film twee keer op één avond: één kaartje
    const eerst = nieuwKaartje({ key: 'a', name: 'A' }, { nu: new Date(nu) });
    const lijst = voegKaartjeToe(voegKaartjeToe([], eerst), nieuwKaartje({ key: 'a', name: 'A' }, { nu: new Date(nu + 3600e3) }));
    expect(lijst).toHaveLength(1);
    // de start: kaartjes uit de geschiedenis, met de oude antwoorden
    const start = kaartjesUitGeschiedenis(
      [{ key: 'b', name: 'B', date: iso(nu - DAG) }, { key: 'a', name: 'A', date: iso(nu - 9 * DAG) }],
      { [iso(nu - 9 * DAG)]: 'rated' }, { a: { rating: 4 } },
    );
    expect(start.map((x) => x.key)).toEqual(['b', 'a']);
    expect(start[1]).toMatchObject({ antwoord: 'gekeken', sterren: 4 });
  });

  it('net binnen: onthoudt sinds wanneer een film op een dienst staat', async () => {
    const { aanbodSinds, volgAanbod, netBinnen } = await import('../src/lib/aanbod.js');
    const DAG = 24 * 3600e3;
    const nu = 1_800_000_000_000;
    // de eerste keer weten we het niet: 0, dus nooit "net binnen"
    let m = aanbodSinds(undefined, { id: 1, flat: ['Netflix'] }, nu);
    expect(m.flatSinds).toEqual({ Netflix: 0 });
    // er komt een dienst bij: die krijgt de datum van nu
    m = aanbodSinds(m, { ...m, flat: ['Netflix', 'MUBI'] }, nu + DAG);
    expect(m.flatSinds).toEqual({ Netflix: 0, MUBI: nu + DAG });
    // een hapering (weg en binnen drie dagen terug) houdt de oude datum
    const weg = aanbodSinds(m, { ...m, flat: ['Netflix'] }, nu + 2 * DAG);
    const terug = aanbodSinds(weg, { ...weg, flat: ['Netflix', 'MUBI'] }, nu + 3 * DAG);
    expect(terug.flatSinds.MUBI).toBe(nu + DAG);
    // na een regiowissel (flatSinds: null) begint het opnieuw, zonder "nieuw"
    const regio = aanbodSinds(terug, { ...terug, flat: ['Videoland'], flatSinds: null }, nu + 4 * DAG);
    expect(regio.flatSinds).toEqual({ Videoland: 0 });
    // over de hele cache: alleen veranderde films worden bijgewerkt
    const prev = { a: m, b: { id: 2, flat: [] , flatSinds: {} } };
    const next = volgAanbod(prev, { ...prev, b: { ...prev.b, flat: ['Netflix'] } }, nu + 5 * DAG);
    expect(next.a).toBe(m);
    expect(next.b.flatSinds).toEqual({ Netflix: nu + 5 * DAG });
    // de rij: watchlist-films die deze week op jouw diensten kwamen
    const watchlist = [{ key: 'a', name: 'A' }, { key: 'b', name: 'B' }, { key: 'c', name: 'C' }];
    const meta = {
      a: { flat: ['MUBI'], flatSinds: { MUBI: nu - 2 * DAG } },
      b: { flat: ['Netflix'], flatSinds: { Netflix: nu - 10 * DAG } },
      c: { flat: ['Prime'], flatSinds: { Prime: nu - DAG } },
    };
    expect(netBinnen(watchlist, meta, { nu }).map((x) => x.film.key)).toEqual(['c', 'a']);
    expect(netBinnen(watchlist, meta, { nu, mijnDiensten: ['MUBI'] }).map((x) => x.dienst)).toEqual(['MUBI']);
    expect(netBinnen(watchlist, meta, { nu, seenSet: new Set(['c']) }).map((x) => x.film.key)).toEqual(['a']);
  });

  it('opvolging: "Niet gekeken" ruimt op zonder rating, en verse picks vragen niks', () => {
    localStorage.clear();
    const gisteren = new Date(Date.now() - 20 * 3600e3).toISOString();
    const netNu = new Date(Date.now() - 3600e3).toISOString();
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('picker.watchlist', JSON.stringify([{ key: 'a|2020', name: 'A', year: 2020 }]));
    localStorage.setItem('picker.history', JSON.stringify([
      { key: 'vers|2024', name: 'Vers', year: 2024, date: netNu, context: 'x' },
      { key: 'oud|2019', name: 'Oud', year: 2019, date: gisteren, context: 'x' },
    ]));
    render(<App />);
    // de verse pick (1 uur) wordt overgeslagen; de oudere komt aan bod
    expect(screen.getByText(/Oud \(2019\)/)).toBeTruthy();
    fireEvent.click(screen.getByText('Niet gekeken'));
    expect(screen.queryByText(/Gekeken\?/)).toBeNull();
    expect(localStorage.getItem('picker.ownRatings') || '{}').not.toContain('oud');
  });

  it('her-import: de diff vertelt precies wat er veranderde', async () => {
    const { importDiff } = await import('../src/lib/csv.js');
    // eerste import
    const eerste = importDiff({ watchlist: [], watchedLb: [], ratings: {} }, { watchlist: [{ key: 'a|1' }, { key: 'b|2' }] });
    expect(eerste.eerste).toBe(true);
    expect(eerste.totaal).toBe(2);
    // her-import: b bleef, c kwam erbij, a ging eraf; 1 nieuwe rating, 1 nieuw gezien
    const diff = importDiff(
      { watchlist: [{ key: 'a|1' }, { key: 'b|2' }], watchedLb: ['x|9'], ratings: { 'b|2': 4 } },
      { watchlist: [{ key: 'b|2' }, { key: 'c|3' }], watched: [{ key: 'x|9' }, { key: 'a|1' }], ratings: { map: { 'b|2': 4, 'a|1': 3.5 } } },
    );
    expect(diff.eerste).toBe(false);
    expect(diff.nieuwOpWl).toBe(1);
    expect(diff.vanWlAf).toBe(1);
    expect(diff.nieuweRatings).toBe(1);
    expect(diff.nieuwGezien).toBe(1);
    // niets veranderd
    const stil = importDiff(
      { watchlist: [{ key: 'a|1' }], watchedLb: [], ratings: {} },
      { watchlist: [{ key: 'a|1' }], watched: [], ratings: { map: {} } },
    );
    expect(stil.nieuwOpWl + stil.vanWlAf + stil.nieuweRatings + stil.nieuwGezien).toBe(0);
  });

  it('zip-schatten: diary en eigen lijsten worden uit de export gevist', async () => {
    const { parseLetterboxdFiles } = await import('../src/lib/csv.js');
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file('watchlist.csv', 'Date,Name,Year,Letterboxd URI\n2024-01-01,Aftersun,2022,https://x');
    zip.file('diary.csv', 'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2026-06-02,Aftersun,2022,https://x,4.5,,,2026-06-01\n2026-06-10,Stalker,1979,https://y,5,Yes,,2026-06-09');
    zip.file('lists/spooky-season.csv', 'Letterboxd list export v7\nDate,Name,Tags,URL,Description\n2026-05-01,Spooky Season,,https://l,Mijn octoberlijst\n\nPosition,Name,Year,URL,Description\n1,The Wailing,2016,https://a,\n2,Lake Mungo,2008,https://b,');
    const blob = await zip.generateAsync({ type: 'blob' });
    const file = new File([blob], 'letterboxd-export.zip');
    const res = await parseLetterboxdFiles([file]);
    expect(res.diary.length).toBe(2);
    expect(res.diary[1].rewatch).toBe(true);
    expect(res.diary[0].watchedDate).toBe('2026-06-01');
    expect(res.lists.length).toBe(1);
    expect(res.lists[0].naam).toBe('Spooky Season'); // uit de metadata, niet de bestandsnaam
    expect(res.lists[0].films.map((f) => f.name)).toEqual(['The Wailing', 'Lake Mungo']);
  });

  it('pick-bron: kiezen uit een eigen lijst verandert de pool', () => {
    localStorage.clear();
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('picker.watchlist', JSON.stringify([
      { key: 'a|2020', name: 'A', year: 2020 }, { key: 'b|2021', name: 'B', year: 2021 }, { key: 'c|2022', name: 'C', year: 2022 },
    ]));
    localStorage.setItem('picker.lbLists', JSON.stringify([
      { naam: 'Spooky Season', films: [{ key: 'w|2016', name: 'The Wailing', year: 2016 }, { key: 'l|2008', name: 'Lake Mungo', year: 2008 }] },
    ]));
    render(<App />);
    expect(document.querySelector('.kassa-aantal').textContent).toBe('3 films in de pot');
    fireEvent.click(screen.getByRole('button', { name: /Aanpassen/ }));
    fireEvent.click(screen.getByRole('button', { name: /Spooky Season/ }));
    expect(document.querySelector('.kassa-aantal').textContent).toBe('2 films in de pot');
    expect(document.querySelector('.kassa-samenvatting').textContent).toContain('Spooky Season');
  });

  it('kijkritme: het dagboek levert een ritme-kaart met piekmaand', () => {
    localStorage.clear();
    const m = (d) => d.toISOString().slice(0, 10);
    const nu = new Date();
    const dezeMaand = m(new Date(nu.getFullYear(), nu.getMonth(), 2));
    const vorigeMaand = m(new Date(nu.getFullYear(), nu.getMonth() - 1, 2));
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('picker.watchlist', JSON.stringify([{ key: 'a|2020', name: 'A', year: 2020 }]));
    localStorage.setItem('picker.diary', JSON.stringify([
      { key: 'x|1', name: 'X', year: 2020, watchedDate: dezeMaand, rewatch: false },
      { key: 'y|2', name: 'Y', year: 2021, watchedDate: dezeMaand, rewatch: true },
      { key: 'z|3', name: 'Z', year: 2019, watchedDate: vorigeMaand, rewatch: false },
    ]));
    render(<App />);
    fireEvent.click(screen.getAllByText('Jaarboek')[0]);
    expect(document.body.textContent).toContain('Jouw kijkritme');
    expect(document.body.textContent).toContain('3 films gekeken');
    expect(document.body.textContent).toContain('waarvan 1 herkijk');
  });

  it('op afstand: computeWinner telt stemmen, gelijkspel valt op score', async () => {
    const { computeWinner } = await import('../src/lib/session.js');
    const films = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];
    const r1 = computeWinner(films, { pim: ['a', 'b'], eef: ['a'] });
    expect(r1.winner.key).toBe('a');
    expect(r1.counts).toEqual({ a: 2, b: 1, c: 0 });
    const r2 = computeWinner(films, { pim: ['a'], eef: ['b'] }, (f) => (f.key === 'b' ? 8 : 6));
    expect(r2.winner.key).toBe('b');
  });
});
