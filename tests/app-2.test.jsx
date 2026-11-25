// De app als geheel, deel 2 van 4: Programma, Jaarboek, trailers en import.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, screen, cleanup, within, waitFor, act } from '@testing-library/react';
import App from '../src/App.jsx';
import { seed, startOpZoeken, naarZoeken } from './helpers.jsx';

describe('V2 smoke (2/4)', () => {
  beforeEach(() => { cleanup(); seed(); });

  it('rijen: "Meer ophalen" in Alles bekijken van een seed-rij haalt echt pagina 2 op', async () => {
    const calls = [];
    global.fetch = async (url) => {
      const u = String(url);
      calls.push(u);
      const json = (obj) => ({ ok: true, status: 200, json: async () => obj });
      if (u.includes('page=2') && (u.includes('/similar') || u.includes('/recommendations'))) {
        return json({ results: [{ id: 699, title: 'Diepere Vondst', release_date: '2012-05-01', poster_path: '/d.jpg', vote_average: 7.7, vote_count: 3000, original_language: 'en', overview: 'dieper', genre_ids: [18] }] });
      }
      return json({ results: [] });
    };
    localStorage.clear();
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('picker.ratedFilms', JSON.stringify([
      { key: 'a|2020', name: 'A', year: 2020, rating: 5 }, { key: 'b|2019', name: 'B', year: 2019, rating: 5 },
      { key: 'c|2018', name: 'C', year: 2018, rating: 4.5 }, { key: 'd|2017', name: 'D', year: 2017, rating: 4.5 },
    ]));
    localStorage.setItem('picker.watchlist', JSON.stringify([{ key: 'a|2020', name: 'A', year: 2020 }]));
    const recFilms = [1, 2, 3, 4, 5].map((n) => ({ id: 600 + n, title: `Seed Film ${n}`, year: 2005 + n, poster: `/s${n}.jpg`, vote: 7.2, votes: 2500, genre_ids: [18] }));
    localStorage.setItem('picker.meta', JSON.stringify({
      'a|2020': { id: 1, poster: '/a.jpg', vote: 8, votes: 5000, genres: ['Drama'], at: Date.now(), recs: recFilms },
      'b|2019': { id: 2, poster: '/b.jpg', vote: 7, votes: 4000, genres: ['Drama'], at: Date.now() },
      'c|2018': { id: 3, poster: '/c.jpg', vote: 7, votes: 4000, genres: ['Drama'], at: Date.now() },
      'd|2017': { id: 4, poster: '/d.jpg', vote: 7, votes: 4000, genres: ['Drama'], at: Date.now() },
    }));
    try {
      render(<App />);
      fireEvent.click(screen.getAllByLabelText('Programma')[0]);
      fireEvent.click(screen.getByText('Voor jou'));
      expect(screen.getByText('Omdat je A hoog waardeerde')).toBeTruthy();
      fireEvent.click(screen.getByText(/Alles bekijken/));
      expect(screen.getByText('Terug naar Voor jou')).toBeTruthy();
      fireEvent.click(screen.getByText('Meer ophalen uit TMDB'));
      // de diepere pagina is echt opgevraagd én de nieuwe film staat in de lijst
      expect(await screen.findByText('Diepere Vondst')).toBeTruthy();
      expect(calls.some((u) => u.includes('page=2') && u.includes('/1/similar'))).toBe(true);
      expect(calls.some((u) => u.includes('page=2') && u.includes('/1/recommendations'))).toBe(true);
    } finally {
      delete global.fetch;
    }
  });

  it('verken: een al geziene film komt niet terug als aanbeveling (op TMDB-id)', () => {
    localStorage.clear();
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    // vier ratings zodat de mengmotor op ratings draait
    localStorage.setItem('picker.ratedFilms', JSON.stringify([
      { key: 'a|2020', name: 'A', year: 2020, rating: 5 }, { key: 'b|2019', name: 'B', year: 2019, rating: 5 },
      { key: 'c|2018', name: 'C', year: 2018, rating: 4.5 }, { key: 'd|2017', name: 'D', year: 2017, rating: 4.5 },
    ]));
    localStorage.setItem('picker.watchlist', JSON.stringify([{ key: 'a|2020', name: 'A', year: 2020 }]));
    // film A is gezien-gelogd; de tool kent 'm met TMDB-id 555
    localStorage.setItem('picker.seen', JSON.stringify(['gezienefilm|2015']));
    // recs van seed A bevatten óók id 555 (de al geziene film) plus een verse 556
    localStorage.setItem('picker.meta', JSON.stringify({
      'a|2020': { id: 1, poster: '/a.jpg', vote: 8, votes: 5000, genres: ['Drama'], at: Date.now(), recs: [
        { id: 555, title: 'Gezienefilm', year: 2015, poster: '/g.jpg', vote: 7.5, votes: 3000, genre_ids: [18] },
        { id: 556, title: 'Verse Aanrader', year: 2016, poster: '/v.jpg', vote: 7.6, votes: 4000, genre_ids: [18] },
      ] },
      'gezienefilm|2015': { id: 555, poster: '/g.jpg', vote: 7.5, votes: 3000, genres: ['Drama'], at: Date.now() },
    }));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Programma')[0]);
    fireEvent.click(screen.getByText('Voor jou'));
    // de verse aanrader mag verschijnen, de al geziene film niet
    expect(document.body.textContent).toContain('Verse Aanrader');
    expect(document.body.textContent).not.toContain('Gezienefilm');
  });

  it('voor jou: filters op genre, looptijd en dienst, en korte films vallen uit de rijen', async () => {
    const { pastFilter, degelijk } = await import('../src/lib/foryou.js');
    const drama = { id: 1, genre_ids: [18], runtime: 95, flat: ['Netflix'] };
    const lang = { id: 2, genre_ids: [18], runtime: 160, flat: [] };
    const onbekend = { id: 3, genre_ids: [35] }; // nog geen details
    // genre
    expect(pastFilter(drama, { genre: '18' })).toBe(true);
    expect(pastFilter(onbekend, { genre: '18' })).toBe(false);
    // kort: alleen met bekende looptijd tot 105 minuten
    expect(pastFilter(drama, { kort: true })).toBe(true);
    expect(pastFilter(lang, { kort: true })).toBe(false);
    expect(pastFilter(onbekend, { kort: true })).toBe(false);
    // dienst: '*' is elke dienst, een naam is precies die dienst
    expect(pastFilter(drama, { dienst: '*' })).toBe(true);
    expect(pastFilter(lang, { dienst: '*' })).toBe(false);
    expect(pastFilter(drama, { dienst: 'Netflix' })).toBe(true);
    expect(pastFilter(drama, { dienst: 'Videoland' })).toBe(false);
    // zonder filters past alles
    expect(pastFilter(onbekend, {})).toBe(true);
    // een segment van 8 minuten hoort niet in de rijen; onbekende looptijd wel
    expect(degelijk({ vote: 7.5, votes: 900, runtime: 8 })).toBe(false);
    expect(degelijk({ vote: 7.5, votes: 900 })).toBe(true);
  });

  it('taste: te algemene trefwoorden worden geen thema', async () => {
    const { buildTaste } = await import('../src/lib/taste.js');
    const kw = [{ id: 970, name: 'parent child relationship' }, { id: 90, name: 'loneliness' }];
    const rf = [1, 2, 3].map((n) => ({ key: `f${n}|2015`, year: 2015, rating: 5 }));
    const meta = Object.fromEntries(rf.map((f) => [f.key, { genres: ['Drama'], keywords: kw, votes: 2000 }]));
    const t = buildTaste({ watchlist: [], ratedFilms: rf, meta });
    expect(t.topThemes.map((x) => x.name)).toEqual(['loneliness']);
  });

  it('voor jou: het genre-filter beperkt de rijen en is terug te zetten', () => {
    localStorage.clear();
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('picker.ratedFilms', JSON.stringify([
      { key: 'a|2020', name: 'A', year: 2020, rating: 5 }, { key: 'b|2019', name: 'B', year: 2019, rating: 5 },
      { key: 'c|2018', name: 'C', year: 2018, rating: 4.5 }, { key: 'd|2017', name: 'D', year: 2017, rating: 4.5 },
    ]));
    localStorage.setItem('picker.watchlist', JSON.stringify([{ key: 'a|2020', name: 'A', year: 2020 }]));
    const oeuvreFilms = [1, 2, 3, 4, 5].map((n) => ({ id: 900 + n, title: `Reg Film ${n}`, year: 2000 + n, poster: `/r${n}.jpg`, vote: 7.5, votes: 2000, genre_ids: [18] }));
    localStorage.setItem('picker.oeuvres', JSON.stringify({ Testregisseur: { films: oeuvreFilms, at: Date.now() } }));
    localStorage.setItem('picker.meta', JSON.stringify({ 'a|2020': { id: 1, poster: '/a.jpg', vote: 8, votes: 5000, genres: ['Drama'], director: 'Testregisseur', at: Date.now() } }));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Programma')[0]);
    fireEvent.click(screen.getByText('Voor jou'));
    expect(screen.getByText('Meer van Testregisseur')).toBeTruthy();
    // alleen komedie: de drama-regisseur valt weg, met een duidelijke melding
    fireEvent.change(screen.getByLabelText('Filter op genre'), { target: { value: '35' } });
    expect(screen.queryByText('Meer van Testregisseur')).toBeNull();
    expect(screen.getByText('Geen suggesties met deze filters')).toBeTruthy();
    // filters wissen brengt de rij terug
    fireEvent.click(screen.getByRole('button', { name: 'Filters wissen' }));
    expect(screen.getByText('Meer van Testregisseur')).toBeTruthy();
  });

  it('voor jou: details van kandidaten voeden "Kort", de dienstkeuze en de streaming-hint', async () => {
    const calls = [];
    const kortIds = [601, 603, 605];
    const netflixIds = [601, 602];
    global.fetch = async (url) => {
      const u = new URL(String(url));
      const p = u.pathname.replace(/^\/3/, '');
      calls.push(p);
      const json = (obj) => ({ ok: true, status: 200, json: async () => obj });
      const m = p.match(/^\/movie\/(60\d)$/);
      if (m) {
        const id = Number(m[1]);
        return json({
          id, title: `Seed Film ${id - 600}`, release_date: '2010-01-01', runtime: kortIds.includes(id) ? 95 : 140,
          genres: [{ id: 18, name: 'Drama' }], vote_average: 7.2, vote_count: 2500, credits: { crew: [] }, videos: { results: [] },
          recommendations: { results: [] }, keywords: { keywords: [] }, production_countries: [],
          'watch/providers': { results: netflixIds.includes(id) ? { NL: { flatrate: [{ provider_name: 'Netflix' }], link: 'https://www.justwatch.com/nl/film/x' } } : {} },
        });
      }
      return json({ results: [], total_pages: 1 });
    };
    localStorage.clear();
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('picker.ratedFilms', JSON.stringify([
      { key: 'a|2020', name: 'A', year: 2020, rating: 5 }, { key: 'b|2019', name: 'B', year: 2019, rating: 5 },
      { key: 'c|2018', name: 'C', year: 2018, rating: 4.5 }, { key: 'd|2017', name: 'D', year: 2017, rating: 4.5 },
    ]));
    localStorage.setItem('picker.watchlist', JSON.stringify([{ key: 'a|2020', name: 'A', year: 2020 }]));
    const recFilms = [1, 2, 3, 4, 5].map((n) => ({ id: 600 + n, title: `Seed Film ${n}`, year: 2005 + n, poster: `/s${n}.jpg`, vote: 7.2, votes: 2500, genre_ids: [18] }));
    localStorage.setItem('picker.meta', JSON.stringify({
      'a|2020': { id: 1, poster: '/a.jpg', vote: 8, votes: 5000, genres: ['Drama'], at: Date.now(), recs: recFilms },
      'b|2019': { id: 2, poster: '/b.jpg', vote: 7, votes: 4000, genres: ['Drama'], at: Date.now(), sims: [] },
      'c|2018': { id: 3, poster: '/c.jpg', vote: 7, votes: 4000, genres: ['Drama'], at: Date.now(), sims: [] },
      'd|2017': { id: 4, poster: '/d.jpg', vote: 7, votes: 4000, genres: ['Drama'], at: Date.now(), sims: [] },
    }));
    try {
      render(<App />);
      fireEvent.click(screen.getAllByLabelText('Programma')[0]);
      expect(screen.getByText('Omdat je A hoog waardeerde')).toBeTruthy();
      // de details komen binnen: twee films tonen dat ze op Netflix staan (een
      // tegel en de vanavond-aanrader, die streamingaanbod voorrang geeft)
      await waitFor(() => expect(document.querySelectorAll('.tile-prov').length).toBe(1));
      expect(document.querySelector('.vanavond .eyebrow').textContent).toBe('Vanavond, nu op Netflix');
      expect(calls).toContain('/movie/601');
      // kort: de films van 140 minuten vallen weg (te weinig voor een rij, dus de kaartenlijst)
      fireEvent.click(screen.getByText('Kort (< 1u45)'));
      expect(screen.getByText('Seed Film 1')).toBeTruthy();
      expect(screen.getByText('Seed Film 3')).toBeTruthy();
      expect(screen.queryByText('Seed Film 2')).toBeNull();
      expect(document.body.textContent).toContain('95 min');
      // plus alleen Netflix: één film over, met het aanbod op de kaart
      fireEvent.change(screen.getByLabelText('Filter op streamingdienst'), { target: { value: 'Netflix' } });
      expect(screen.getByText('Seed Film 1')).toBeTruthy();
      expect(screen.queryByText('Seed Film 3')).toBeNull();
      expect(document.body.textContent).toMatch(/nu op Netflix/i);
    } finally {
      delete global.fetch;
    }
  });

  it('scoring: kruisbevestiging, anti-favorieten en regisseursgewicht', async () => {
    const { scoorKandidaten, bepaalSeeds } = await import('../src/lib/kandidaten.js');
    const { rangschikRegisseurs } = await import('../src/lib/rows.js');
    const { buildTaste } = await import('../src/lib/taste.js');
    const f = (id, title) => ({ id, title, year: 2010, vote: 7.5, votes: 2000, genre_ids: [18] });
    const meta = {
      'a|2000': { id: 1, genres: ['Drama'], director: 'D', recs: [f(10, 'X'), f(11, 'Y')] },
      'b|2001': { id: 2, genres: ['Drama'], director: 'D', recs: [f(10, 'X'), f(12, 'Z')] },
      'c|2002': { id: 3, genres: ['Drama'], recs: [f(11, 'Y')] },
      'e|2003': { id: 4, genres: ['Drama'], recs: [] }, // derde favoriet: de motor draait pas op ratings vanaf drie
    };
    const ratedFilms = [
      { key: 'a|2000', name: 'A', year: 2000, rating: 5 }, { key: 'b|2001', name: 'B', year: 2001, rating: 5 },
      { key: 'c|2002', name: 'C', year: 2002, rating: 1 }, { key: 'e|2003', name: 'E', year: 2003, rating: 4 },
    ];
    const oeuvres = { D: { at: Date.now(), films: [f(20, 'Oeuvrefilm')] } };
    const seeds = bepaalSeeds({ watchlist: [], ratedFilms, meta });
    const basis = {
      watchlist: [], meta, ratedFilms, oeuvres, seeds, regisseurs: rangschikRegisseurs(seeds, meta),
      taste: buildTaste({ watchlist: [], ratedFilms, meta }), uitleg: (k, v) => `${k}:${v?.names || ''}`,
    };
    const scoor = (opties) => Object.fromEntries(scoorKandidaten({ ...basis, opties }).recs.map((r) => [r.title, r]));
    const aan = scoor({ kruis: true, anti: true, regisseur: true });
    const uit = scoor({ kruis: false, anti: false, regisseur: false });
    // X komt via A én B binnen: bevestigd, en zwaarder dan zonder kruisbevestiging
    expect(aan.X.bevestigd).toBe(true);
    expect(aan.X.waarde).toBeGreaterThan(uit.X.waarde);
    // Y wordt ook aangeraden bij C (1★): omlaag, met een eerlijke reden
    expect(aan.Y.waarde).toBeLessThan(uit.Y.waarde);
    expect(aan.Y.anti).toEqual(['C']);
    expect(aan.Y.redenen.join(' ')).toContain('verken.antiReason:C');
    // twee 5★-films van D: zijn oeuvre telt zwaarder dan de vaste 1,6
    expect(aan.Oeuvrefilm.waarde).toBeGreaterThan(uit.Oeuvrefilm.waarde);
    // je watchlist als zwakke bron: aanbevelingen bij een (onbeoordeelde) watchlistfilm doen mee
    const metaWl = { ...meta, 'w|2015': { id: 9, genres: ['Drama'], recs: [f(30, 'Via watchlist')] } };
    const wl = [{ key: 'w|2015', name: 'W', year: 2015 }];
    const metWl = scoorKandidaten({ ...basis, meta: metaWl, watchlist: wl, opties: { watchlist: 0.4 } }).recs;
    expect(metWl.find((r) => r.title === 'Via watchlist')?.bronnen).toEqual(['watchlist']);
    const zonderWl = scoorKandidaten({ ...basis, meta: metaWl, watchlist: wl, opties: { watchlist: 0 } }).recs;
    expect(zonderWl.some((r) => r.title === 'Via watchlist')).toBe(false);
  });

  it('eigen rijen: naam, vingerafdruk, zoekvraag, filters en voorstellen', async () => {
    const { autoNaam, handtekening, isBruikbaar, zoekVragen, pastEigen, stelRijenVoor } = await import('../src/lib/eigenrijen.js');
    const { t } = await import('../src/lib/i18n.js');
    const landNaam = (c) => ({ KR: 'Zuid-Korea' }[c] || c);
    // automatische namen
    expect(autoNaam({ basis: 'criteria', genres: [53], land: 'KR', jaarVan: 2000, jaarTot: 2009 }, { tr: t, landNaam })).toBe('Thriller uit Zuid-Korea, 2000–2009');
    expect(autoNaam({ basis: 'film', film: { id: 1, title: 'Burning' } }, { tr: t })).toBe('Lijkt op Burning');
    expect(autoNaam({ basis: 'maker', maker: { id: 2, naam: 'Wong Kar-wai' } }, { tr: t })).toBe('Van Wong Kar-wai');
    expect(autoNaam({ basis: 'criteria', themas: [{ id: 9, name: 'grief' }], kort: true }, { tr: t })).toBe('Films over grief, kort');
    // dezelfde bouwstenen = dezelfde vingerafdruk, ongeacht naam of volgorde van genres
    expect(handtekening({ id: 'a', naam: 'x', genres: [18, 53] })).toBe(handtekening({ id: 'b', naam: 'y', genres: [53, 18] }));
    expect(isBruikbaar({ basis: 'criteria' })).toBe(false);
    expect(isBruikbaar({ basis: 'criteria', land: 'KR' })).toBe(true);
    expect(isBruikbaar({ basis: 'film' })).toBe(false);
    // de zoekvraag vertaalt de bouwstenen naar TMDB
    const [q] = zoekVragen({ basis: 'criteria', genres: [53], land: 'KR', kort: true, themas: [{ id: 9, name: 'grief' }] }, { providerIds: [8] });
    expect(q).toMatchObject({ genreIds: [53], originCountry: 'KR', maxRuntime: 105, keywordIds: [9], providerIds: [8] });
    // "lijkt op" met filters: genre en kort gelden pas als filter op de gevonden films
    const rij = { id: 'r1', basis: 'film', film: { id: 1, title: 'X' }, genres: [18], kort: true };
    const film = (extra) => ({ bronnen: ['eigen:r1'], genre_ids: [18], runtime: 95, ...extra });
    expect(pastEigen(film({}), rij)).toBe(true);
    expect(pastEigen(film({ genre_ids: [35] }), rij)).toBe(false);
    expect(pastEigen(film({ runtime: 150 }), rij)).toBe(false);
    expect(pastEigen(film({ bronnen: ['aanbevolen'] }), rij)).toBe(false); // niet via deze rij binnengekomen
    // voorstellen: een land met drie favorieten, maar niet als je die rij al hebt
    const seeds = ['a', 'b', 'c'].map((k) => ({ key: k, rating: 5 }));
    const meta = { a: { country: 'KR' }, b: { country: 'KR' }, c: { country: 'KR' } };
    expect(stelRijenVoor({ seeds, meta }).some((v) => v.land === 'KR')).toBe(true);
    expect(stelRijenVoor({ seeds, meta, bestaande: [{ id: 'x', basis: 'criteria', land: 'KR' }] }).some((v) => v.land === 'KR')).toBe(false);
  });

  it('eigen rijen: samenstellen, bewerken en verwijderen in Voor jou', async () => {
    const calls = [];
    const film = (id, title) => ({ id, title, release_date: '2005-01-01', poster_path: `/k${id}.jpg`, vote_average: 7.6, vote_count: 3000, original_language: 'ko', overview: '', genre_ids: [53] });
    global.fetch = async (url) => {
      const u = new URL(String(url));
      calls.push(String(url));
      const json = (obj) => ({ ok: true, status: 200, json: async () => obj });
      if (u.pathname.endsWith('/discover/movie') && u.searchParams.get('with_origin_country') === 'KR') {
        return json({ total_pages: 1, results: [1, 2, 3, 4, 5].map((k) => film(800 + k, `Koreaans ${k}`)) });
      }
      return json({ results: [], total_pages: 1 });
    };
    localStorage.clear();
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('picker.dienstKiezerWeg', 'true');
    localStorage.setItem('picker.ratedFilms', JSON.stringify([
      { key: 'a|2020', name: 'A', year: 2020, rating: 5 }, { key: 'b|2019', name: 'B', year: 2019, rating: 5 },
      { key: 'c|2018', name: 'C', year: 2018, rating: 4.5 }, { key: 'd|2017', name: 'D', year: 2017, rating: 4.5 },
    ]));
    localStorage.setItem('picker.watchlist', JSON.stringify([{ key: 'a|2020', name: 'A', year: 2020 }]));
    const recFilms = [1, 2, 3, 4, 5].map((n) => ({ id: 600 + n, title: `Seed Film ${n}`, year: 2005 + n, poster: `/s${n}.jpg`, vote: 7.2, votes: 2500, genre_ids: [18] }));
    localStorage.setItem('picker.meta', JSON.stringify({
      'a|2020': { id: 1, poster: '/a.jpg', vote: 8, votes: 5000, genres: ['Drama'], at: Date.now(), recs: recFilms, sims: [] },
      'b|2019': { id: 2, poster: '/b.jpg', vote: 7, votes: 4000, genres: ['Drama'], at: Date.now(), sims: [] },
      'c|2018': { id: 3, poster: '/c.jpg', vote: 7, votes: 4000, genres: ['Drama'], at: Date.now(), sims: [] },
      'd|2017': { id: 4, poster: '/d.jpg', vote: 7, votes: 4000, genres: ['Drama'], at: Date.now(), sims: [] },
    }));
    try {
      render(<App />);
      fireEvent.click(screen.getAllByLabelText('Programma')[0]);
      // samenstellen: alles uit Zuid-Korea
      fireEvent.click(screen.getByRole('button', { name: 'Eigen rij' }));
      expect(screen.getByText('Stel je eigen rij samen')).toBeTruthy();
      fireEvent.change(screen.getByLabelText('Land'), { target: { value: 'KR' } });
      fireEvent.click(screen.getByText('Rij opslaan'));
      expect(await screen.findByText('Koreaans 1')).toBeTruthy();
      expect(document.body.textContent).toContain('Films uit Zuid-Korea');
      expect(calls.some((c) => c.includes('with_origin_country=KR'))).toBe(true);
      expect(JSON.parse(localStorage.getItem('picker.eigenRijen'))).toHaveLength(1);
      // bewerken: een eigen naam
      fireEvent.click(screen.getAllByText('Bewerk')[0]);
      expect(screen.getByText('Eigen rij bewerken')).toBeTruthy();
      fireEvent.change(screen.getByLabelText('Naam van de rij'), { target: { value: 'Mijn Koreaanse rij' } });
      fireEvent.click(screen.getByText('Rij opslaan'));
      expect(screen.getByText('Mijn Koreaanse rij')).toBeTruthy();
      // verwijderen
      fireEvent.click(screen.getAllByText('Bewerk')[0]);
      fireEvent.click(screen.getByText('Verwijderen'));
      expect(screen.queryByText('Mijn Koreaanse rij')).toBeNull();
      expect(JSON.parse(localStorage.getItem('picker.eigenRijen'))).toHaveLength(0);
    } finally {
      delete global.fetch;
    }
  });

  it('eigen rijen: een automatische rij vastzetten en bewaren vanuit Zoeken', async () => {
    const film = (id, title, genre) => ({ id, title, release_date: '2011-01-01', poster_path: null, vote_average: 7.5, vote_count: 2500, original_language: 'en', overview: '', genre_ids: [genre] });
    global.fetch = async (url) => {
      const u = new URL(String(url));
      const json = (obj) => ({ ok: true, status: 200, json: async () => obj });
      if (u.pathname.endsWith('/movie/1/recommendations')) return json({ results: [1, 2, 3, 4, 5].map((k) => film(700 + k, `Vast ${k}`, 18)) });
      if (u.pathname.endsWith('/discover/movie')) return json({ total_pages: 1, total_results: 1, results: [film(9100, 'Zoekvondst', 18)] });
      return json({ results: [], total_pages: 1 });
    };
    localStorage.clear();
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('picker.dienstKiezerWeg', 'true');
    localStorage.setItem('picker.ratedFilms', JSON.stringify([
      { key: 'a|2020', name: 'A', year: 2020, rating: 5 }, { key: 'b|2019', name: 'B', year: 2019, rating: 5 },
      { key: 'c|2018', name: 'C', year: 2018, rating: 4.5 }, { key: 'd|2017', name: 'D', year: 2017, rating: 4.5 },
    ]));
    localStorage.setItem('picker.watchlist', JSON.stringify([{ key: 'a|2020', name: 'A', year: 2020 }]));
    const recFilms = [1, 2, 3, 4, 5].map((n) => ({ id: 600 + n, title: `Seed Film ${n}`, year: 2005 + n, poster: `/s${n}.jpg`, vote: 7.2, votes: 2500, genre_ids: [18] }));
    localStorage.setItem('picker.meta', JSON.stringify({
      'a|2020': { id: 1, year: 2020, poster: '/a.jpg', vote: 8, votes: 5000, genres: ['Drama'], at: Date.now(), recs: recFilms, sims: [] },
      'b|2019': { id: 2, poster: '/b.jpg', vote: 7, votes: 4000, genres: ['Drama'], at: Date.now(), sims: [] },
      'c|2018': { id: 3, poster: '/c.jpg', vote: 7, votes: 4000, genres: ['Drama'], at: Date.now(), sims: [] },
      'd|2017': { id: 4, poster: '/d.jpg', vote: 7, votes: 4000, genres: ['Drama'], at: Date.now(), sims: [] },
    }));
    try {
      render(<App />);
      fireEvent.click(screen.getAllByLabelText('Programma')[0]);
      expect(screen.getByText('Omdat je A hoog waardeerde')).toBeTruthy();
      // vastzetten: de rij wordt een eigen rij "lijkt op A" en wisselt niet meer mee
      fireEvent.click(screen.getByText('Vastzetten'));
      const eigen = JSON.parse(localStorage.getItem('picker.eigenRijen'));
      expect(eigen).toHaveLength(1);
      expect(eigen[0]).toMatchObject({ basis: 'film', film: { id: 1, title: 'A' }, naam: 'Omdat je A hoog waardeerde' });
      expect(await screen.findByText('Vast 1')).toBeTruthy();
      expect(screen.getAllByText('Omdat je A hoog waardeerde')).toHaveLength(1); // geen automatische dubbelganger
      // bewaren vanuit Zoeken: een zoekopdracht op genre wordt een rij
      fireEvent.click(screen.getByText('Zoeken'));
      fireEvent.click(screen.getByText('Toon filters'));
      fireEvent.click(screen.getAllByText('Drama')[0]);
      fireEvent.click(screen.getByText('Zoek'));
      expect(await screen.findByText('Zoekvondst')).toBeTruthy();
      fireEvent.click(screen.getByText('Bewaar als rij in Voor jou'));
      const na = JSON.parse(localStorage.getItem('picker.eigenRijen'));
      expect(na).toHaveLength(2);
      expect(na[1]).toMatchObject({ basis: 'criteria', genres: [18], naam: 'Drama' });
      expect(document.body.textContent).toContain('Rij "Drama" staat nu in Voor jou.');
    } finally {
      delete global.fetch;
    }
  });

  it('meetlat: verborgen favorieten die via andere favorieten bereikbaar zijn, komen terug', async () => {
    const { meetlat } = await import('../src/lib/kandidaten.js');
    const namen = ['F1', 'F2', 'F3', 'F4', 'F5'];
    const ratedFilms = namen.map((n, i) => ({ key: `${n.toLowerCase()}|${2000 + i}`, name: n, year: 2000 + i, rating: 5 }));
    // een kring: elke favoriet raadt de volgende aan
    const meta = Object.fromEntries(ratedFilms.map((r, i) => {
      const volgende = ratedFilms[(i + 1) % 5];
      return [r.key, { id: 100 + i, genres: ['Drama'], recs: [{ id: 100 + ((i + 1) % 5), title: volgende.name, year: volgende.year, vote: 7.5, votes: 2000, genre_ids: [18] }] }];
    }));
    const m = meetlat({ watchlist: [], meta, ratedFilms });
    expect(m.genoeg).toBe(true);
    expect(m.gevonden).toBe(5);
    expect(m.pct).toBe(100);
    // de diagnose: alle favorieten hebben data, iedereen is bereikbaar, met aanbevelingen
    expect(m.diagnose.favorietenMetData).toBe(5);
    expect(m.diagnose.favorietenTotaal).toBe(5);
    expect(m.diagnose.metAanbevelingen).toBe(5);
    expect(m.diagnose.mediaanPositie).toBe(1);
    expect(m.diagnose.stemmenFavorieten).toBe(null); // geen stemmen in de testdata
    // te weinig favorieten: geen meting
    expect(meetlat({ watchlist: [], meta, ratedFilms: ratedFilms.slice(0, 4) }).genoeg).toBe(false);
  });

  it('model: leert welk kenmerk jouw favorieten voorspelt, en toetst op wat het niet zag', async () => {
    const { leerEnToets, watGeleerd } = await import('../src/lib/model.js');
    const { KENMERKEN } = await import('../src/lib/kenmerken.js');
    const D = KENMERKEN.length;
    const iNE = KENMERKEN.indexOf('nietEngels');
    let zaad = 3;
    const rnd = () => { zaad = (zaad * 16807) % 2147483647; return zaad / 2147483647; };
    // favorieten zijn niet-Engelstalig, de rest van de poel meestal niet
    const vec = (ne) => { const v = Array.from({ length: D }, () => rnd()); v[iNE] = ne; return v; };
    const poel = (n) => { const p = new Float32Array(n * D); for (let j = 0; j < n; j++) p.set(vec(rnd() < 0.1 ? 1 : 0), j * D); return p; };
    const records = Array.from({ length: 12 }, (_, i) => ({
      soort: 'fav', naam: `F${i}`, label: 1, km: vec(1), rangBasis: 40 + i,
      negatief: Array.from({ length: 30 }, () => vec(rnd() < 0.1 ? 1 : 0)), poel: poel(150),
    }));
    const m = leerEnToets(records);
    expect(m.toets.basis.top12).toBe(0);
    expect(m.toets.model.top12).toBeGreaterThan(m.toets.basis.top12);
    expect(m.beter).toBe(true);
    expect(m.aan).toBe(true);
    expect(watGeleerd(m)[0]).toEqual({ kenmerk: 'nietEngels', richting: 'meer' });
    // klein genoeg om te bewaren: geen poel of voorbeelden in het model
    expect(JSON.stringify(m).length).toBeLessThan(5000);
  });

  it('model: een geleerd model rangschikt Voor jou, en een afwijzing met reden blijft gelden', async () => {
    const { scoorKandidaten, bepaalSeeds } = await import('../src/lib/kandidaten.js');
    const { sorteerOpSterkte } = await import('../src/lib/rows.js');
    const { buildTaste } = await import('../src/lib/taste.js');
    const { KENMERKEN, KENMERKEN_SLEUTEL } = await import('../src/lib/kenmerken.js');
    const f = (id, title, lang, director) => ({ id, title, year: 2010, vote: 7.5, votes: 2000, genre_ids: [18], lang, director });
    const meta = {
      'a|2000': { id: 1, genres: ['Drama'], lang: 'en', recs: [f(10, 'Engels', 'en'), f(11, 'Japans', 'ja', 'Ozu')] },
      'b|2001': { id: 2, genres: ['Drama'], lang: 'en', recs: [] },
      'c|2002': { id: 3, genres: ['Drama'], lang: 'en', recs: [] },
    };
    const ratedFilms = [
      { key: 'a|2000', name: 'A', year: 2000, rating: 5 }, { key: 'b|2001', name: 'B', year: 2001, rating: 5 },
      { key: 'c|2002', name: 'C', year: 2002, rating: 4.5 },
    ];
    const basis = { watchlist: [], meta, ratedFilms, seeds: bepaalSeeds({ watchlist: [], ratedFilms, meta }), regisseurs: [], taste: buildTaste({ watchlist: [], ratedFilms, meta }) };
    const titels = (extra) => sorteerOpSterkte(scoorKandidaten({ ...basis, ...extra }).recs).map((r) => r.title);
    // zonder model: de vaste weging (een Engelstalig profiel zet Engels voor)
    expect(titels({})).toEqual(['Engels', 'Japans']);
    // een model dat niet-Engels zwaar laat wegen draait dat om
    const model = { w: KENMERKEN.map((k) => (k === 'nietEngels' ? 3 : 0)), mu: KENMERKEN.map(() => 0), sd: KENMERKEN.map(() => 1), spreiding: 1.5, kenmerken: KENMERKEN_SLEUTEL };
    expect(titels({ model })).toEqual(['Japans', 'Engels']);
    // een model van een oudere versie (andere kenmerken) telt niet
    expect(titels({ model: { ...model, kenmerken: 'oud' } })).toEqual(['Engels', 'Japans']);
    // "niet van Ozu" blijft gelden, ook met een model
    expect(titels({ model, skipped: [{ id: 99, genre_ids: [18], director: 'Ozu', reden: 'regisseur' }] })).toEqual(['Engels', 'Japans']);
  });

  it('inzicht: leren van je beoordelingen, eerlijk getoetst, met een schakelaar', async () => {
    const namen = ['F1', 'F2', 'F3', 'F4', 'F5'];
    const ratedFilms = namen.map((n, i) => ({ key: `${n.toLowerCase()}|${2000 + i}`, name: n, year: 2000 + i, rating: 5 }));
    const meta = Object.fromEntries(ratedFilms.map((r, i) => {
      const volgende = ratedFilms[(i + 1) % 5];
      const extra = [1, 2, 3].map((j) => ({ id: 900 + i * 10 + j, title: `Ruis ${i}${j}`, year: 2010, vote: 7, votes: 1500, genre_ids: [18] }));
      return [r.key, { id: 100 + i, genres: ['Drama'], recs: [{ id: 100 + ((i + 1) % 5), title: volgende.name, year: volgende.year, vote: 7.5, votes: 2000, genre_ids: [18] }, ...extra] }];
    }));
    localStorage.setItem('picker.ratedFilms', JSON.stringify(ratedFilms));
    localStorage.setItem('picker.meta', JSON.stringify({ ...JSON.parse(localStorage.getItem('picker.meta')), ...meta }));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Jaarboek')[0]);
    expect(screen.getByText('Leer van je beoordelingen')).toBeTruthy();
    fireEvent.click(screen.getByText('Leer mijn smaak'));
    // de vaste weging vindt deze kring al perfect: het model is niet beter en blijft uit
    expect(await screen.findByText(/getoetst op favorieten die het model niet zag/, {}, { timeout: 4000 })).toBeTruthy();
    expect(screen.getByText(/Voor jou houdt die/)).toBeTruthy();
    const opslag = () => JSON.parse(localStorage.getItem('picker.smaakModel'));
    expect(opslag().aan).toBe(false);
    expect(opslag().gegevens.favorieten).toBe(5);
    // zelf aanzetten kan wel
    fireEvent.click(screen.getByText('Gebruik in Voor jou'));
    expect(opslag().aan).toBe(true);
    expect(screen.getByText('Opnieuw leren')).toBeTruthy();
  });

  it('inzicht: de meetlat-kaart meet op verzoek', () => {
    const namen = ['F1', 'F2', 'F3', 'F4', 'F5'];
    const ratedFilms = namen.map((n, i) => ({ key: `${n.toLowerCase()}|${2000 + i}`, name: n, year: 2000 + i, rating: 5 }));
    const meta = Object.fromEntries(ratedFilms.map((r, i) => {
      const volgende = ratedFilms[(i + 1) % 5];
      return [r.key, { id: 100 + i, genres: ['Drama'], recs: [{ id: 100 + ((i + 1) % 5), title: volgende.name, year: volgende.year, vote: 7.5, votes: 2000, genre_ids: [18] }] }];
    }));
    localStorage.setItem('picker.ratedFilms', JSON.stringify(ratedFilms));
    localStorage.setItem('picker.meta', JSON.stringify({ ...JSON.parse(localStorage.getItem('picker.meta')), ...meta }));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Jaarboek')[0]);
    expect(screen.getByText('Hoe goed kent Voor jou je smaak?')).toBeTruthy();
    fireEvent.click(screen.getByText('Meet het'));
    expect(document.body.textContent).toMatch(/\d+ van \d+ favorieten teruggevonden in de top 50/);
    expect(screen.getByText('Meet opnieuw')).toBeTruthy();
    // de diagnose laat zien waar het zit: bereik of rangschikking
    expect(screen.getByText('Diagnose')).toBeTruthy();
    expect(document.body.textContent).toMatch(/Bereik: \d+ van de \d+ verborgen favorieten/);
    expect(document.body.textContent).toMatch(/Rangschikking: mediaanpositie #/);
  });

  it('voor jou: je kiest je diensten en krijgt een rij "Nu op ..., voor jou"', async () => {
    const calls = [];
    const film = (id, title) => ({ id, title, release_date: '2012-01-01', poster_path: `/d${id}.jpg`, vote_average: 7.6, vote_count: 3000, original_language: 'en', overview: '', genre_ids: [18] });
    global.fetch = async (url) => {
      const u = new URL(String(url));
      const p = u.pathname.replace(/^\/3/, '');
      calls.push(String(url));
      const json = (obj) => ({ ok: true, status: 200, json: async () => obj });
      if (p === '/watch/providers/movie') {
        return json({ results: [
          { provider_id: 8, provider_name: 'Netflix', display_priorities: { NL: 1 } },
          { provider_id: 72, provider_name: 'Videoland', display_priorities: { NL: 2 } },
          { provider_id: 175, provider_name: 'Netflix Kids', display_priorities: { NL: 3 } },
        ] });
      }
      if (p === '/discover/movie' && u.searchParams.get('with_watch_providers')) {
        return json({ total_pages: 1, results: [1, 2, 3, 4, 5].map((k) => film(900 + k, `Dienstfilm ${k}`)) });
      }
      return json({ results: [], total_pages: 1 });
    };
    localStorage.clear();
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('picker.ratedFilms', JSON.stringify([
      { key: 'a|2020', name: 'A', year: 2020, rating: 5 }, { key: 'b|2019', name: 'B', year: 2019, rating: 5 },
      { key: 'c|2018', name: 'C', year: 2018, rating: 4.5 }, { key: 'd|2017', name: 'D', year: 2017, rating: 4.5 },
    ]));
    localStorage.setItem('picker.watchlist', JSON.stringify([{ key: 'a|2020', name: 'A', year: 2020 }]));
    const recFilms = [1, 2, 3, 4, 5].map((n) => ({ id: 600 + n, title: `Seed Film ${n}`, year: 2005 + n, poster: `/s${n}.jpg`, vote: 7.2, votes: 2500, genre_ids: [18] }));
    localStorage.setItem('picker.meta', JSON.stringify({
      'a|2020': { id: 1, poster: '/a.jpg', vote: 8, votes: 5000, genres: ['Drama'], at: Date.now(), recs: recFilms, sims: [] },
      'b|2019': { id: 2, poster: '/b.jpg', vote: 7, votes: 4000, genres: ['Drama'], at: Date.now(), sims: [] },
      'c|2018': { id: 3, poster: '/c.jpg', vote: 7, votes: 4000, genres: ['Drama'], at: Date.now(), sims: [] },
      'd|2017': { id: 4, poster: '/d.jpg', vote: 7, votes: 4000, genres: ['Drama'], at: Date.now(), sims: [] },
    }));
    try {
      render(<App />);
      fireEvent.click(screen.getAllByLabelText('Programma')[0]);
      // de kiezer verschijnt zodra de diensten van je regio binnen zijn (zonder kindervariant)
      expect(await screen.findByText('Welke streamingdiensten heb je?')).toBeTruthy();
      expect(screen.queryByText('Netflix Kids')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Netflix' }));
      fireEvent.click(screen.getByText('Opslaan'));
      expect(await screen.findByText('Nu op Netflix, voor jou')).toBeTruthy();
      expect(screen.getByText('Dienstfilm 1')).toBeTruthy();
      expect(screen.queryByText('Welke streamingdiensten heb je?')).toBeNull();
      // discover vroeg echt naar Netflix (id 8) in jouw regio, alleen in abonnement
      const disc = calls.find((c) => c.includes('with_watch_providers'));
      expect(disc).toContain('with_watch_providers=8');
      expect(disc).toContain('watch_region=NL');
      expect(disc).toContain('with_watch_monetization_types=flatrate');
      // de keuze is later te wijzigen
      expect(screen.getByText('Diensten wijzigen')).toBeTruthy();
    } finally {
      delete global.fetch;
    }
  });

  it('verken: rijen-met-reden tonen een oeuvre-rij met kop en posters', () => {
    localStorage.clear();
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    // vier 5-sterren films zodat het profiel "sterk" is en seeds tellen
    localStorage.setItem('picker.ratedFilms', JSON.stringify([
      { key: 'a|2020', name: 'A', year: 2020, rating: 5 }, { key: 'b|2019', name: 'B', year: 2019, rating: 5 },
      { key: 'c|2018', name: 'C', year: 2018, rating: 4.5 }, { key: 'd|2017', name: 'D', year: 2017, rating: 4.5 },
    ]));
    localStorage.setItem('picker.watchlist', JSON.stringify([{ key: 'a|2020', name: 'A', year: 2020 }]));
    // een oeuvre van "Testregisseur" met vijf films -> genoeg voor een rij
    const oeuvreFilms = [1, 2, 3, 4, 5].map((n) => ({ id: 900 + n, title: `Reg Film ${n}`, year: 2000 + n, poster: `/r${n}.jpg`, vote: 7.5, votes: 2000, genre_ids: [18] }));
    localStorage.setItem('picker.oeuvres', JSON.stringify({ Testregisseur: { films: oeuvreFilms, at: Date.now() } }));
    localStorage.setItem('picker.meta', JSON.stringify({
      'a|2020': { id: 1, poster: '/a.jpg', vote: 8, votes: 5000, genres: ['Drama'], director: 'Testregisseur', at: Date.now() },
    }));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Programma')[0]);
    fireEvent.click(screen.getByText('Voor jou'));
    // de rij-kop verschijnt met de regisseursnaam, met posters
    expect(screen.getByText('Meer van Testregisseur')).toBeTruthy();
    expect(document.querySelectorAll('.rec-tile').length).toBe(5);
    // "Alles bekijken" opent de kaarten met reden; terug brengt de rijen terug
    fireEvent.click(screen.getByText(/Alles bekijken \(5\)/));
    expect(document.querySelector('.rec-row-head')).toBeNull();
    expect(screen.getAllByText(/Uit het oeuvre van Testregisseur/).length).toBe(5);
    fireEvent.click(screen.getByText('Terug naar Voor jou'));
    expect(document.querySelector('.rec-row-head')).toBeTruthy();
  });

  it('verken toont aanbevelingen op ratings-basis en shortlist-export', () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Programma')[0]);
    fireEvent.click(screen.getByText('Voor jou'));
    expect(document.body.textContent).toContain('4+ sterren');
    expect(document.body.textContent).toContain('Aanrader');
    fireEvent.click(screen.getAllByText('Shortlist')[0]);
    // de shortlist klapt uit vanuit de kop
    fireEvent.click(screen.getByText('Shortlist (1)'));
    expect(document.body.textContent).toContain('Exporteer voor Letterboxd');
  });

  it('avond: veto-ronde tot winnaar', () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Filmavond')[0]);
    fireEvent.click(screen.getByText('Start veto'));
    fireEvent.click(screen.getByText('Meteen naar de veto'));
    for (let i = 0; i < 5; i++) {
      const tiles = document.querySelectorAll('.poster-tile:not(.struck)');
      fireEvent.click(tiles[0]);
    }
    expect(document.body.textContent).toContain('De groep heeft gesproken');
  });

  it('avond: bracket van halve finale naar kampioen', () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Filmavond')[0]);
    fireEvent.click(screen.getByText('Start bracket'));
    for (let i = 0; i < 3; i++) {
      const cards = document.querySelectorAll('.duel-card');
      if (!cards.length) break;
      fireEvent.click(cards[0]);
    }
    expect(document.body.textContent).toContain('Winnaar van het bracket');
  });

  it('inzicht toont smaakprofiel', () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Jaarboek')[0]);
    expect(document.body.textContent).toContain('Genres');
    expect(document.body.textContent).toContain('Decennia');
    expect(document.body.textContent).toContain('Jouw gem. rating');
  });

  it('demo laden toont banner; wissen brengt terug naar landing', async () => {
    localStorage.clear();
    localStorage.setItem('picker.settings', JSON.stringify({ lang: 'nl' }));
    render(<App />);
    fireEvent.click(screen.getByText('Probeer met demo-watchlist'));
    expect(document.body.textContent).toContain('demo-watchlist, met voorbeeldfilms');
    fireEvent.click(screen.getByText('Demo wissen en opnieuw beginnen'));
    expect(document.body.textContent).toContain('Wat kijken we vanavond?');
    expect(document.body.textContent).not.toContain('Demo wissen');
  });

  it('bieb: zoeken, sorteren en film openen met ShutterScore', () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Archief')[0]);
    expect(document.body.textContent).toContain('6 van 6 films');
    fireEvent.change(screen.getByLabelText('Zoek in je archief'), { target: { value: 'stalker' } });
    expect(document.body.textContent).toContain('1 van 6 films');
    fireEvent.click(screen.getByLabelText(/Open Stalker/));
    expect(document.body.textContent).toContain('Uit je archief');
    expect(document.body.textContent).toContain('Terug naar het archief');
  });

  it('winner toont ShutterScore en losse bronnen bij ext-ratings', () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Archief')[0]);
    fireEvent.click(screen.getByLabelText(/Open Aftersun/));
    expect(document.body.textContent).toContain('ShutterScore'); // hero-label
    expect(document.body.textContent).toContain('7,8'); // IMDb-bron
    expect(document.body.textContent).toContain('93%');
    expect(document.body.textContent).toContain('81'); // Meta-bron
  });

  it('verken: afwijzen is te herstellen', () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Programma')[0]);
    fireEvent.click(screen.getByText('Voor jou'));
    const kaart = screen.getByText('Vergelijkbare Parel').closest('.card');
    fireEvent.click(within(kaart).getByText('Niet voor mij'));
    expect(document.body.textContent).not.toContain('Vergelijkbare Parel');
    fireEvent.click(screen.getByText(/Afgewezen \(1\)/));
    fireEvent.click(screen.getByLabelText('Herstel Vergelijkbare Parel'));
    expect(document.body.textContent).toContain('Vergelijkbare Parel');
  });

  it('inzicht: eerdere pick heropenen', () => {
    localStorage.setItem('picker.history', JSON.stringify([{ key: 'stalker|1979', name: 'Stalker', year: 1979, date: new Date().toISOString(), context: null }]));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Jaarboek')[0]);
    fireEvent.click(screen.getByText(/^Stalker/));
    expect(document.body.textContent).toContain('Eerdere pick');
    expect(document.body.textContent).toContain('162 min');
  });

  it('zoekmachine: discover-zoek zonder tekst werkt en shortlist werkt', async () => {
    global.fetch = async () => ({
      ok: true, status: 200,
      json: async () => ({
        total_pages: 3, total_results: 42,
        results: [
          { id: 9001, title: 'Onbekende Parel', release_date: '2019-05-01', poster_path: null, vote_average: 7.9, vote_count: 640, original_language: 'fr', overview: 'Een juweel.', genre_ids: [18] },
        ],
      }),
    });
    startOpZoeken();
    render(<App />);
    naarZoeken();
    fireEvent.click(screen.getByText('Zoek'));
    expect(await screen.findByText('Onbekende Parel')).toBeTruthy();
    expect(document.body.textContent).toContain('42 resultaten');
    expect(document.body.textContent).toContain('Frans');
    fireEvent.click(screen.getAllByText('Shortlist')[0]);
    fireEvent.click(screen.getByText('Shortlist (1)'));
    expect(document.body.textContent).toContain('Exporteer voor Letterboxd');
    delete global.fetch;
  });

  it('slimme pick en moods wegen op de ShutterScore', async () => {
    const { moodTest, pickWinner, appScore } = await import('../src/lib/pick.js');
    const metaMap = {
      'a|2020': { vote: 6.8, votes: 5000, ext: { imdb: 8.4, rt: 95, mc: 88 } }, // score 7,8 → topper
      'b|2020': { vote: 6.8, votes: 5000 }, // score 6,8 → geen topper
    };
    expect(appScore(metaMap['a|2020'])).toBeCloseTo(7.8, 5); // (8,4 + 8,16 + 6,8) / 3: Metacritic 88 telt als 8,16
    expect(moodTest('topper', { year: 2020 }, metaMap['a|2020'])).toBe(true);
    expect(moodTest('topper', { year: 2020 }, metaMap['b|2020'])).toBe(false);
    const pool = [{ key: 'a|2020' }, { key: 'b|2020' }];
    let aWint = 0;
    for (let i = 0; i < 1000; i++) if (pickWinner(pool, metaMap, true, []).key === 'a|2020') aWint++;
    // verwachting ~594/1000 (8,2² vs 6,8²); 545 ligt ~3σ boven toeval én ~3σ onder de verwachting
    expect(aWint).toBeGreaterThan(500); // ruime marge onder de verwachting (~594) tegen toevalsruis
  });

  it('verken: zoeken in hele database en detailkaart openen', async () => {
    global.fetch = async (url) => ({
      ok: true, status: 200,
      json: async () => (String(url).includes('/search/movie')
        ? { results: [{ id: 777, title: 'Zoekfilm', release_date: '2018-03-01', poster_path: null, vote_average: 7.2, vote_count: 900, original_language: 'da', overview: 'Deens juweel.' }] }
        : { id: 777, title: 'Zoekfilm', release_date: '2018-03-01', runtime: 101, genres: [{ name: 'Drama' }], vote_average: 7.2, vote_count: 900, poster_path: null, backdrop_path: null, overview: 'Deens juweel.', imdb_id: 'tt777', production_countries: [{ iso_3166_1: 'DK' }], credits: { crew: [{ job: 'Director', name: 'Test Regisseur' }] }, videos: { results: [] }, recommendations: { results: [] }, 'watch/providers': { results: {} } }),
    });
    startOpZoeken();
    render(<App />);
    naarZoeken();
    fireEvent.change(screen.getByLabelText('Zoek op titel of maker'), { target: { value: 'zoekfilm' } });
    fireEvent.click(screen.getByText('Zoek'));
    expect(await screen.findByText('Zoekfilm')).toBeTruthy();
    fireEvent.click(screen.getByText('Bekijk kaart'));
    expect(await screen.findByText(/Test Regisseur/)).toBeTruthy();
    expect(document.body.textContent).toContain('101 min');
    expect(document.body.textContent).toContain('Van buiten je lijst');
    fireEvent.click(screen.getByText('Terug naar het programma'));
    delete global.fetch;
  });

  it('avond: filters beperken de pot vooraf, en blijven bewaard', () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Filmavond')[0]);
    const telling = () => document.querySelector('.af-telling').textContent;
    expect(telling()).toBe('6 films');
    // standaard: alleen "geen korte films" staat aan, dus niets om terug te zetten
    expect(screen.queryByText('Terug naar standaard')).toBeNull();
    // periode vanaf 2010 (Whiplash 2014, Aftersun 2022 blijven; Stalker 1979 valt weg)
    fireEvent.change(screen.getByLabelText('Jaar van'), { target: { value: '2010' } });
    expect(telling()).toBe('4 films');
    // liever geen western: First Cow valt weg, en dat is te weinig voor een goede ronde
    fireEvent.click(screen.getByLabelText('Liever geen Western'));
    expect(telling()).toBe('3 films');
    expect(document.body.textContent).toContain('Nog maar 3 films over');
    expect(screen.getByText('Start veto').closest('button').disabled).toBe(true);
    // onthouden in de instellingen (en dus op al je apparaten)
    const bewaard = JSON.parse(localStorage.getItem('picker.settings')).avondFilters;
    expect(bewaard.jaarVan).toBe(2010);
    expect(bewaard.nietGenres).toEqual(['Western']);
    // western mag weer; start een veto-ronde en check dat een out-of-range film niet op tafel ligt
    fireEvent.click(screen.getByLabelText('Liever geen Western'));
    expect(telling()).toBe('4 films');
    fireEvent.click(screen.getByText('Start veto'));
    expect(document.body.textContent).not.toContain('Stalker');
  });

  it('avond: korte films blijven standaard buiten de pot, en terug naar standaard wist de rest', () => {
    const meta = JSON.parse(localStorage.getItem('picker.meta'));
    meta['close|2022'].runtime = 14; // een korte film
    localStorage.setItem('picker.meta', JSON.stringify(meta));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Filmavond')[0]);
    const telling = () => document.querySelector('.af-telling').textContent;
    expect(telling()).toBe('5 films');
    const geenKort = screen.getByText('Geen korte films').closest('button');
    expect(geenKort.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(geenKort);
    expect(telling()).toBe('6 films');
    // tot 1,5 uur: alleen films die aantoonbaar kort genoeg zijn
    fireEvent.click(screen.getByText('Tot 1,5 uur'));
    expect(telling()).toBe('1 film');
    fireEvent.click(screen.getByText('Terug naar standaard'));
    expect(telling()).toBe('5 films');
    expect(screen.getByText('Geen korte films').closest('button').getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByText('Terug naar standaard')).toBeNull();
  });

  it('avond: taal, en een genre staat nooit bij "zin in" en "liever niet" tegelijk', () => {
    const meta = JSON.parse(localStorage.getItem('picker.meta'));
    const talen = { 'aftersun|2022': 'en', 'la haine|1995': 'fr', 'stalker|1979': 'ru', 'whiplash|2014': 'en', 'first cow|2019': 'en', 'close|2022': 'fr' };
    Object.entries(talen).forEach(([k, l]) => { meta[k].lang = l; });
    localStorage.setItem('picker.meta', JSON.stringify(meta));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Filmavond')[0]);
    const telling = () => document.querySelector('.af-telling').textContent;
    fireEvent.click(screen.getByText('Engelstalig'));
    expect(telling()).toBe('3 films');
    fireEvent.click(screen.getByText('Anderstalig'));
    expect(telling()).toBe('3 films');
    fireEvent.click(within(screen.getByText('Engelstalig').closest('.af-chips')).getByText('Alles'));
    expect(telling()).toBe('6 films');
    // zin in misdaad: alleen La haine; daarna liever geen misdaad haalt hem uit "zin in"
    const zinIn = screen.getAllByText('Crime').find((b) => !b.getAttribute('aria-label'));
    fireEvent.click(zinIn);
    expect(telling()).toBe('1 film');
    fireEvent.click(screen.getByLabelText('Liever geen Crime'));
    expect(telling()).toBe('5 films');
    expect(zinIn.getAttribute('aria-pressed')).toBe('false');
  });

  it('avondfilters: de pot-logica', async () => {
    const { filterPot, afwijkend, wisselGenre, STANDAARD_FILTERS } = await import('../src/lib/avondFilters.js');
    const pot = [{ key: 'a', year: 2001 }, { key: 'b', year: 2015 }, { key: 'c', year: 2020 }, { key: 'd', year: 1990 }];
    const meta = {
      a: { runtime: 12, genres: ['Animatie'], lang: 'en', flat: [] },
      b: { runtime: 95, genres: ['Drama'], lang: 'ko', flat: ['MUBI'] },
      c: { runtime: 140, genres: ['Horror'], lang: 'en', flat: [] },
      d: {}, // niets bekend: voordeel van de twijfel, behalve bij een maximale duur
    };
    const keys = (f) => filterPot(pot, meta, f, () => null).map((x) => x.key).join('');
    expect(keys(STANDAARD_FILTERS)).toBe('bcd');
    expect(keys({ geenKort: false })).toBe('abcd');
    expect(keys({ maxDuur: 120 })).toBe('b');
    expect(keys({ nietGenres: ['Horror'] })).toBe('bd');
    expect(keys({ taal: 'en' })).toBe('cd');
    expect(keys({ taal: 'anders' })).toBe('bd');
    expect(keys({ alleenStreaming: true })).toBe('b');
    expect(keys({ jaarVan: 2010, jaarTot: 2019 })).toBe('b');
    expect(afwijkend({})).toBe(false);
    expect(afwijkend({ geenKort: false })).toBe(true);
    const f = wisselGenre(wisselGenre({}, 'genres', 'Drama'), 'nietGenres', 'Drama');
    expect(f.genres).toEqual([]);
    expect(f.nietGenres).toEqual(['Drama']);
  });

  it('avond: eerst de trailers, film voor film, dan de ronde', () => {
    // Een film met alles erop: slogan, verhaal, regie, rolverdeling, cijfers, dienst
    const meta = JSON.parse(localStorage.getItem('picker.meta'));
    Object.values(meta).forEach((m) => {
      m.plot = 'Een jonge drummer wil de beste worden. Zijn leraar duwt hem over elke grens. Wat kost grootheid?';
      m.tagline = 'De weg naar grootheid kan je breken.';
      m.cast = ['Miles Teller', 'J.K. Simmons', 'Paul Reiser'];
      m.ext = { imdb: 8.5, rt: 94, mc: 89, at: Date.now() };
      m.flat = ['Netflix'];
    });
    localStorage.setItem('picker.meta', JSON.stringify(meta));
    // "beperk beweging" aan: alles staat stil, je tikt zelf door
    const mm = window.matchMedia;
    window.matchMedia = () => ({ matches: true, addListener() {}, removeListener() {} });
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Filmavond')[0]);
    fireEvent.click(screen.getByText('Start veto'));
    window.matchMedia = mm;
    const dialoog = screen.getByRole('dialog', { name: 'Trailers van de films in deze ronde' });
    expect(within(dialoog).getByText('Trailer 1 van 6')).toBeTruthy();
    // wie, wat, waarover en de cijfers
    expect(within(dialoog).getByText(/^Een film van /)).toBeTruthy();
    expect(within(dialoog).getByText('Met Miles Teller, J.K. Simmons, Paul Reiser')).toBeTruthy();
    expect(within(dialoog).getByText('De weg naar grootheid kan je breken.')).toBeTruthy();
    expect(dialoog.querySelector('.pitch-verhaal').textContent).toContain('Een jonge drummer wil de beste worden.');
    expect(dialoog.textContent).toContain('IMDb');
    expect(dialoog.textContent).toContain('Rotten Tomatoes');
    expect(dialoog.textContent).toContain('Nu op Netflix');
    // bladeren: volgende, vorige (niet voorbij het begin)
    const eerste = dialoog.querySelector('.pitch-titel').textContent;
    fireEvent.click(within(dialoog).getByText('Volgende'));
    expect(within(dialoog).getByText('Trailer 2 van 6')).toBeTruthy();
    expect(dialoog.querySelector('.pitch-titel').textContent).not.toBe(eerste);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(within(dialoog).getByText('Trailer 1 van 6')).toBeTruthy();
    expect(dialoog.querySelector('.pitch-titel').textContent).toBe(eerste);
    // met "beperk beweging" loopt niets vanzelf
    expect(dialoog.querySelector('.pitch-loop')).toBeNull();
    expect(within(dialoog).queryByText('Pauze')).toBeNull();
    // na de laatste trailer begint de ronde
    for (let i = 0; i < 5; i++) fireEvent.click(within(dialoog).getByText('Volgende'));
    expect(within(dialoog).getByText('Trailer 6 van 6')).toBeTruthy();
    fireEvent.click(within(dialoog).getByText('Naar de veto'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.textContent).toContain('Speler 1 is aan de beurt');
    // terugkijken kan, met alleen de films die nog over zijn; Escape sluit
    fireEvent.click(document.querySelectorAll('.poster-tile:not(.struck)')[0]);
    fireEvent.click(screen.getByText('Trailers terugkijken'));
    expect(screen.getByText('Trailer 1 van 5')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('avond: met beweging gaat eerst het licht uit, dan lopen de trailers vanzelf door', () => {
    const mm = window.matchMedia;
    window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
    try {
      render(<App />);
      fireEvent.click(screen.getAllByLabelText('Filmavond')[0]);
      fireEvent.click(screen.getByText('Start veto'));
      const dialoog = screen.getByRole('dialog');
      // jsdom kent geen AnimationEvent; React luistert dan naar de webkit-naam
      const einde = (el) => { fireEvent.animationEnd(el); fireEvent(el, new Event('webkitAnimationEnd', { bubbles: true })); };
      // het voorprogramma: zaallicht uit, wat er komt, nog geen trailer
      expect(dialoog.classList.contains('fase-intro')).toBe(true);
      expect(within(dialoog).getByText('6 trailers, dan de veto.')).toBeTruthy();
      expect(dialoog.querySelector('.pitch-loop')).toBeNull();
      einde(dialoog.querySelector('.pitch-intro'));
      expect(dialoog.classList.contains('fase-trailers')).toBe(true);
      expect(within(dialoog).getByText('Trailer 1 van 6')).toBeTruthy();
      // het draaiboek: een shot, dan de zwarte kaart met de regisseur (geen slogan of rolverdeling hier)
      expect([...dialoog.querySelectorAll('.akte')].map((a) => a.className.match(/soort-(\w+)/)[1])).toEqual(['shot', 'van']);
      expect(dialoog.querySelector('.soort-van span').textContent).toBe('Een film van');
      expect(dialoog.querySelector('.soort-van strong').textContent).toBeTruthy();
      expect(dialoog.querySelector('.soort-van').closest('[aria-hidden="true"]')).toBeTruthy();
      // de balk bovenin loopt af en zet de volgende film in beeld
      einde(dialoog.querySelector('.pitch-loop'));
      expect(within(dialoog).getByText('Trailer 2 van 6')).toBeTruthy();
      // een animatie van iets anders in beeld telt niet als einde
      einde(dialoog.querySelector('.pitch-titel span'));
      expect(within(dialoog).getByText('Trailer 2 van 6')).toBeTruthy();
      fireEvent.click(within(dialoog).getByText('Pauze'));
      expect(dialoog.classList.contains('gepauzeerd')).toBe(true);
      fireEvent.click(within(dialoog).getByText('Verder'));
      expect(dialoog.classList.contains('gepauzeerd')).toBe(false);
      // tikken op het doek: eerst de akten over, dan pas de volgende film
      fireEvent.click(dialoog.querySelector('.pitch-podium'));
      expect(within(dialoog).getByText('Trailer 2 van 6')).toBeTruthy();
      expect(dialoog.querySelector('.pitch-akten')).toBeNull();
      expect(dialoog.querySelector('.pitch-loop').style.animationDelay).toMatch(/^-\d+ms$/);
      fireEvent.click(dialoog.querySelector('.pitch-podium'));
      expect(within(dialoog).getByText('Trailer 3 van 6')).toBeTruthy();
      expect(dialoog.querySelector('.pitch-akten')).not.toBeNull();
      // na de laatste gaat het zaallicht aan, en dan begint de ronde
      for (let i = 0; i < 3; i++) fireEvent.click(within(dialoog).getByText('Volgende'));
      fireEvent.click(within(dialoog).getByText('Naar de veto'));
      expect(dialoog.classList.contains('fase-uit')).toBe(true);
      expect(screen.getByRole('dialog')).toBeTruthy();
      einde(dialoog.querySelector('.pitch-zaallicht'));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.body.textContent).toContain('Speler 1 is aan de beurt');
    } finally {
      window.matchMedia = mm;
    }
  });

  it('avond: het zaalgeluid is uit te zetten, en dat blijft zo', () => {
    const mm = window.matchMedia;
    window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
    try {
      render(<App />);
      fireEvent.click(screen.getAllByLabelText('Filmavond')[0]);
      fireEvent.click(screen.getByText('Start veto'));
      const dialoog = screen.getByRole('dialog');
      const knop = within(dialoog).getByLabelText('Geluid uit');
      expect(knop.getAttribute('aria-pressed')).toBe('true');
      fireEvent.click(knop);
      expect(within(dialoog).getByLabelText('Geluid aan').getAttribute('aria-pressed')).toBe('false');
      expect(JSON.parse(localStorage.getItem('picker.settings')).pitchGeluid).toBe(false);
      // "Meteen naar de veto" wacht niet op het zaallicht
      fireEvent.click(within(dialoog).getByText('Meteen naar de veto'));
      expect(screen.queryByRole('dialog')).toBeNull();
    } finally {
      window.matchMedia = mm;
    }
  });

  it('trailers: het draaiboek van een trailer', async () => {
    const { trailerPlan, sloganDuur, pitchDuur, AKTE, TITEL_HOUD } = await import('../src/lib/pitch.js');
    const tekst = 'Een jonge drummer wil de beste worden. Zijn leraar duwt hem over elke grens.';
    const vol = trailerPlan({ slogan: 'De weg naar grootheid kan je breken.', regie: 'Damien Chazelle', cast: ['Miles Teller'], tekst });
    expect(vol.akten.map((a) => a.soort)).toEqual(['slogan', 'van', 'met']);
    // de akten sluiten op elkaar aan, de titel komt direct na de laatste
    vol.akten.slice(1).forEach((a, j) => expect(a.start).toBe(vol.akten[j].start + vol.akten[j].duur));
    expect(vol.akten[0].duur).toBe(sloganDuur('De weg naar grootheid kan je breken.'));
    expect(vol.titel).toBe(sloganDuur('De weg naar grootheid kan je breken.') + AKTE.kaart + AKTE.met);
    expect(vol.paneel).toBe(vol.titel + TITEL_HOUD);
    expect(vol.totaal).toBe(vol.paneel + pitchDuur(tekst));
    // zonder slogan, regie of namen: alleen een shot, en dan de titel
    const kaal = trailerPlan({});
    expect(kaal.akten).toEqual([{ soort: 'shot', start: 0, duur: AKTE.shot }]);
    expect(kaal.titel).toBe(AKTE.shot);
    // een lange slogan krijgt meer tijd, maar nooit eindeloos
    expect(sloganDuur('kort')).toBe(3000);
    expect(sloganDuur('woord '.repeat(10))).toBe(1600 + 10 * 300);
    expect(sloganDuur('woord '.repeat(40))).toBe(6000);
  });

  it('trailers: extra beelden uit de film, zonder de hoofdafbeelding', async () => {
    const { fetchStills } = await import('../src/lib/tmdb.js');
    const oud = global.fetch;
    let gevraagd = '';
    global.fetch = async (url) => {
      gevraagd = String(url);
      return {
        ok: true, status: 200,
        json: async () => ({ backdrops: [
          { file_path: '/hoofd.jpg', aspect_ratio: 1.78 },
          { file_path: '/a.jpg', aspect_ratio: 1.78 },
          { file_path: '/staand.jpg', aspect_ratio: 0.67 },
          { file_path: '/b.jpg', aspect_ratio: 1.78 },
          { file_path: '/c.jpg', aspect_ratio: 1.78 },
          { file_path: '/d.jpg', aspect_ratio: 1.78 },
        ] }),
      };
    };
    try {
      expect(await fetchStills(42, 'sleutel', '/hoofd.jpg')).toEqual(['/a.jpg', '/b.jpg', '/c.jpg']);
      expect(gevraagd).toContain('/movie/42/images');
      expect(gevraagd).toContain('include_image_language=null');
    } finally {
      if (oud) global.fetch = oud; else delete global.fetch;
    }
  });

  it('zaalgeluid: zonder Web Audio doet niets iets', async () => {
    const g = await import('../src/lib/zaalgeluid.js');
    expect(() => {
      g.ontgrendel(); g.zetGeluid(true); g.startRatel(); g.pauzeerRatel(true);
      g.klak(); g.zoef(); g.dreun(); g.braam(); g.stopRatel(); g.zetGeluid(false);
    }).not.toThrow();
  });

  it('avond: trailers zijn uit te zetten, en dat blijft zo', () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Filmavond')[0]);
    const schakelaar = screen.getByText('Eerst de trailers').closest('button');
    expect(schakelaar.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(schakelaar);
    expect(schakelaar.getAttribute('aria-pressed')).toBe('false');
    expect(JSON.parse(localStorage.getItem('picker.settings')).vetoPitch).toBe(false);
    fireEvent.click(screen.getByText('Start veto'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.textContent).toContain('Speler 1 is aan de beurt');
  });

  it('avond: een trailer zonder verhaal of cijfers zegt dat eerlijk', () => {
    // met beperk beweging: meteen het eindbeeld van de trailer
    const mm = window.matchMedia;
    window.matchMedia = () => ({ matches: true, addListener() {}, removeListener() {} });
    try {
      const meta = JSON.parse(localStorage.getItem('picker.meta'));
      Object.values(meta).forEach((m) => { m.plot = ''; m.vote = null; m.ext = undefined; m.flat = []; });
      localStorage.setItem('picker.meta', JSON.stringify(meta));
      render(<App />);
      fireEvent.click(screen.getAllByLabelText('Filmavond')[0]);
      fireEvent.click(screen.getByText('Start veto'));
      const dialoog = screen.getByRole('dialog');
      expect(within(dialoog).getByText('TMDB heeft geen beschrijving van deze film.')).toBeTruthy();
      expect(dialoog.querySelector('.pitch-cijfers')).toBeNull();
    } finally {
      window.matchMedia = mm;
    }
  });

  it('avond: info-knop spiekt zonder de ronde te verstoren', () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Filmavond')[0]);
    fireEvent.click(screen.getByText('Start veto'));
    fireEvent.click(screen.getByText('Meteen naar de veto'));
    const infoBtn = document.querySelector('[aria-label^="Info over"]');
    fireEvent.click(infoBtn);
    expect(document.body.textContent).toContain('Even spieken');
    fireEvent.click(screen.getByText('Terug naar de ronde'));
    expect(document.body.textContent).toContain('Speler 1 is aan de beurt');
  });

  it('score-label verschijnt pas bij 2+ bronnen', () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Archief')[0]);
    fireEvent.click(screen.getByLabelText(/Open First Cow/)); // geen ext → alleen TMDB
    // geen score-hero (dat vereist 2+ bronnen), wel de losse TMDB-bron
    expect(document.querySelector('.appscore-big')).toBeNull();
    expect(document.body.textContent).toContain('TMDB');
  });

  it('omdb-sleutel opslaan haalt direct scores op (regressie: stale state)', async () => {
    global.fetch = async () => ({
      ok: true, status: 200,
      json: async () => ({
        Response: 'True', imdbRating: '8.1',
        Ratings: [{ Source: 'Rotten Tomatoes', Value: '91%' }, { Source: 'Metacritic', Value: '84/100' }],
      }),
    });
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Setup')[0]);
    fireEvent.change(screen.getByLabelText('OMDb API-sleutels, één per regel'), { target: { value: 'sleutel1\nsleutel2' } });
    fireEvent.click(screen.getAllByText('Opslaan en testen')[1]); // tweede knop = OMDb-kaart
    expect(await screen.findByText(/Opgeslagen. Scores worden opgehaald/)).toBeTruthy();
    // wachtrij (5 films zonder ext) laten leeglopen
    await new Promise((r) => setTimeout(r, 50));
    fireEvent.click(screen.getAllByLabelText('Archief')[0]);
    fireEvent.click(screen.getByLabelText(/Open First Cow/));
    expect(await screen.findByText(/8,1/)).toBeTruthy();
    expect(document.body.textContent).toContain('91%');
    expect(document.body.textContent).toContain('84'); // Meta
    expect(document.querySelector('.appscore-big')).toBeTruthy(); // score-hero
    delete global.fetch;
  });

  it('scores worden bij het openen automatisch opgehaald als sleutels er zijn', async () => {
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', omdbKeys: ['k1'], lang: 'nl' }));
    global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ Response: 'True', imdbRating: '7.9', Ratings: [] }) });
    render(<App />);
    await new Promise((r) => setTimeout(r, 50));
    fireEvent.click(screen.getAllByLabelText('Setup')[0]);
    expect(await screen.findByText(/6 met scores \(OMDb\)/)).toBeTruthy();
    delete global.fetch;
  });

  it('zonder omdb-sleutels: geen melding boven elk scherm, de uitleg staat in Setup', () => {
    render(<App />);
    expect(document.body.textContent).not.toContain('Je ziet nu alleen TMDB-scores');
    expect(document.querySelector('.scores-preview')).toBeNull();
    fireEvent.click(screen.getAllByLabelText('Archief')[0]);
    expect(document.querySelector('.scores-preview')).toBeNull();
    fireEvent.click(screen.getAllByLabelText('Setup')[0]);
    expect(document.querySelector('.scores-preview')).toBeTruthy();
  });

  it('meldingen: bovenin, weg met het kruisje of vanzelf, fouten blijven langer', async () => {
    const { meld } = await import('../src/lib/melding.js');
    render(<App />);
    act(() => { meld('Shortlist gekopieerd.'); });
    const m = document.querySelector('.melding');
    expect(m.textContent).toContain('Shortlist gekopieerd.');
    expect(m.closest('[role="status"]')).toBeTruthy();
    fireEvent.click(within(m).getByRole('button', { name: 'Sluiten' }));
    expect(document.querySelector('.melding')).toBeNull();
    // dezelfde melding twee keer staat er maar één keer
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      act(() => { meld('Nog eens.'); meld('Nog eens.'); meld('Mis.', { soort: 'fout' }); });
      expect(document.querySelectorAll('.melding').length).toBe(2);
      expect(document.querySelector('.melding.fout').textContent).toContain('Mis.');
      act(() => { vi.advanceTimersByTime(6500); });
      expect(document.body.textContent).not.toContain('Nog eens.');
      expect(document.body.textContent).toContain('Mis.');
      act(() => { vi.advanceTimersByTime(6000); });
      expect(document.querySelector('.melding')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('vraagvenster: ja, annuleren met Escape, en bij gevaar staat annuleren klaar', async () => {
    const { bevestig, toonTekst } = await import('../src/lib/melding.js');
    render(<App />);
    let antwoord;
    act(() => { bevestig('Echt wissen?', { ja: 'Wis het', gevaar: true }).then((a) => { antwoord = a; }); });
    let venster = screen.getByRole('alertdialog', { name: 'Echt wissen?' });
    expect(document.activeElement.textContent).toBe('Annuleren');
    expect(within(venster).getByRole('button', { name: 'Wis het' }).className).toContain('gevaar');
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(antwoord).toBe(false));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    act(() => { bevestig('Doorgaan?', { ja: 'Ga door' }).then((a) => { antwoord = a; }); });
    fireEvent.click(screen.getByRole('button', { name: 'Ga door' }));
    await waitFor(() => expect(antwoord).toBe(true));
    // tekst om zelf te kopiëren, als het klembord niet mag
    act(() => { toonTekst('Kopieer dit zelf.', 'Aftersun (2022)\nClose (2022)'); });
    venster = screen.getByRole('alertdialog');
    expect(within(venster).getByRole('textbox').value).toBe('Aftersun (2022)\nClose (2022)');
    fireEvent.click(within(venster).getByRole('button', { name: 'Sluiten' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('setup: wissen vraagt het in een eigen venster; annuleren laat alles staan', async () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Setup')[0]);
    fireEvent.click(screen.getByText('Terug naar start (wis bibliotheek)'));
    const venster = screen.getByRole('alertdialog');
    expect(venster.textContent).toContain('Watchlist, filmdata, ratings en geschiedenis wissen?');
    fireEvent.click(within(venster).getByRole('button', { name: 'Annuleren' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(JSON.parse(localStorage.getItem('picker.watchlist')).length).toBe(6);
    // en ja wist de bibliotheek
    fireEvent.click(screen.getByText('Terug naar start (wis bibliotheek)'));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Wis de bibliotheek' }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem('picker.watchlist')).length).toBe(0));
  });

  it('import zonder bruikbare bestanden: een melding in de zaal, geen pop-up', async () => {
    localStorage.clear();
    localStorage.setItem('picker.settings', JSON.stringify({ lang: 'nl' }));
    render(<App />);
    const invoer = document.querySelector('input[type="file"]');
    fireEvent.change(invoer, { target: { files: [new File(['hallo'], 'notities.txt')] } });
    await waitFor(() => expect(document.querySelector('.melding.fout')).toBeTruthy());
    expect(document.querySelector('.melding.fout').textContent).toContain('Geen bruikbare bestanden');
  });
});
