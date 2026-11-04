import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, screen, cleanup, within, waitFor, act } from '@testing-library/react';
import App from './src/App.jsx';

const fakeFilms = [
  ['Aftersun', 2022, 96, ['Drama'], 7.7, 1200, 'Charlotte Wells'],
  ['La haine', 1995, 98, ['Drama', 'Crime'], 8.1, 9000, 'Mathieu Kassovitz'],
  ['Stalker', 1979, 162, ['Sciencefiction', 'Drama'], 8.1, 5000, 'Andrei Tarkovsky'],
  ['Whiplash', 2014, 106, ['Drama', 'Muziek'], 8.4, 60000, 'Damien Chazelle'],
  ['First Cow', 2019, 122, ['Drama', 'Western'], 7.0, 1400, 'Kelly Reichardt'],
  ['Close', 2022, 104, ['Drama'], 7.7, 1100, 'Lukas Dhont'],
];

function seed() {
  localStorage.clear();
  const watchlist = fakeFilms.map(([name, year]) => ({ key: `${name.toLowerCase()}|${year}`, name, year, uri: '' }));
  const meta = {};
  fakeFilms.forEach(([name, year, runtime, genres, vote, votes, director], i) => {
    meta[`${name.toLowerCase()}|${year}`] = {
      id: 1000 + i, title: name, year, runtime, genres, vote, votes,
      at: Date.now(), imdbId: `tt00${i}`,
      ext: i === 0 ? { imdb: 7.8, rt: 93, mc: 81, at: Date.now() } : undefined,
      poster: null, backdrop: null, plot: 'Testplot.', director, country: 'FR',
      trailer: null, flat: i % 2 ? ['Netflix'] : [], rent: [],
      recs: [{ id: 5000 + i, title: `Aanrader ${i}`, year: 2010 + i, poster: null, vote: 7.2 }],
    };
  });
  localStorage.setItem('nossyV2.watchlist', JSON.stringify(watchlist));
  localStorage.setItem('nossyV2.meta', JSON.stringify(meta));
  localStorage.setItem('nossyV2.ratings', JSON.stringify({ 'aftersun|2022': 5, 'la haine|1995': 4.5, 'stalker|1979': 4 }));
  localStorage.setItem('nossyV2.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
  localStorage.setItem('nossyV2.watchedFilms', JSON.stringify([{ key: 'columbus|2017', name: 'Columbus', year: 2017, uri: '' }]));
  localStorage.setItem('nossyV2.ratedFilms', JSON.stringify([{ key: 'petite maman|2021', name: 'Petite maman', year: 2021, uri: '', rating: 4.5 }]));
  // mengmotor-cache: similar op Aftersun + een regisseurs-oeuvre
  const metaNow = JSON.parse(localStorage.getItem('nossyV2.meta'));
  metaNow['aftersun|2022'].sims = [{ id: 7100, title: 'Vergelijkbare Parel', year: 2021, poster: null, vote: 7.5, votes: 800, lang: 'en', genre_ids: [18] }];
  localStorage.setItem('nossyV2.meta', JSON.stringify(metaNow));
  localStorage.setItem('nossyV2.oeuvres', JSON.stringify({
    'Charlotte Wells': { at: Date.now(), films: [{ id: 7200, title: 'Oeuvre Film', year: 2024, poster: null, vote: 7.2, votes: 500, lang: 'en', genre_ids: [18], rol: 'regie' }] },
  }));
}

// Verken onthoudt de laatst gekozen modus; zonder keuze opent het met
// filmdata op Voor jou. Zoektests kiezen vóór het renderen Zoeken, zodat de
// Voor jou-motor niet eerst met hun nep-fetch aan de slag gaat.
const startOpZoeken = () => localStorage.setItem('nossyV2.verkenMode', JSON.stringify('zoeken'));
// Open Verken, optioneel met het (standaard ingeklapte) filterpaneel open.
function naarZoeken({ filters = false } = {}) {
  fireEvent.click(screen.getAllByLabelText('Verken')[0]);
  if (filters) fireEvent.click(screen.getByText('Toon filters'));
}

describe('V2 smoke', () => {
  beforeEach(() => { cleanup(); seed(); });

  it('onboarding-hero zonder data', () => {
    localStorage.clear();
    localStorage.setItem('nossyV2.settings', JSON.stringify({ lang: 'nl' }));
    render(<App />);
    expect(document.body.textContent).toContain('Wat kijken we vanavond?');
    expect(document.body.textContent).toContain('demo-watchlist');
    expect(document.body.textContent).toContain('één keer');
    expect(document.body.textContent).not.toContain('u00e9');
  });

  it('pick-tab toont pool, moods en pick-knop', () => {
    render(<App />);
    expect(document.body.textContent).toContain('6 films in je pool');
    expect(document.body.textContent).toContain('Korte avond');
    expect(document.body.textContent).toContain('Verborgen parel');
    const sw = document.querySelector('[role="switch"]');
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(sw.textContent).toContain('uit');
    fireEvent.click(sw);
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(sw.textContent).toContain('aan');
  });

  it('pick draait leader en levert winnaar met acties', async () => {
    window.matchMedia = () => ({ matches: true, addListener() {}, removeListener() {} });
    render(<App />);
    fireEvent.click(screen.getAllByText('Pick een film')[0]);
    expect(await screen.findByText('Gezien')).toBeTruthy();
    expect(document.body.textContent).toContain('Meer zoals deze');
  });

  it('score-recept: de componenten tellen op tot de match-score', async () => {
    const { matchScore } = await import('./src/lib/taste.js');
    const taste = { genres: { Drama: 0.6 }, themes: {}, decades: { 2010: 0.4 }, nietEngels: 0.3, medianVotes: 5000, topThemes: [] };
    const { score, recept } = matchScore({ title: 'X', year: 2014, vote: 7.8, votes: 4000, genre_ids: [18], lang: 'en' }, taste);
    expect(Array.isArray(recept)).toBe(true);
    expect(recept.length).toBeGreaterThanOrEqual(5);
    // elke component: waarde 0..1, gewicht 0..1, punten >= 0
    recept.forEach((c) => {
      expect(c.v).toBeGreaterThanOrEqual(0); expect(c.v).toBeLessThanOrEqual(1);
      expect(c.w).toBeGreaterThan(0); expect(c.w).toBeLessThanOrEqual(1);
      expect(c.pts).toBeGreaterThanOrEqual(0);
    });
    // de punten sommeren tot de score (op afronding per component na)
    const som = recept.reduce((a, c) => a + c.pts, 0);
    expect(Math.abs(som - score)).toBeLessThanOrEqual(recept.length);
    // en de gewichten sommeren tot 1 (het hele recept is verantwoord)
    const wSom = recept.reduce((a, c) => a + c.w, 0);
    expect(Math.abs(wSom - 1)).toBeLessThan(0.01);
  });

  it('score-recept: "Waarom X%?" klapt het recept uit op de kaart', () => {
    localStorage.clear();
    localStorage.setItem('nossyV2.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('nossyV2.ratedFilms', JSON.stringify([
      { key: 'a|2020', name: 'A', year: 2020, rating: 5 }, { key: 'b|2019', name: 'B', year: 2019, rating: 5 },
      { key: 'c|2018', name: 'C', year: 2018, rating: 4.5 }, { key: 'd|2017', name: 'D', year: 2017, rating: 4.5 },
    ]));
    localStorage.setItem('nossyV2.watchlist', JSON.stringify([{ key: 'a|2020', name: 'A', year: 2020 }]));
    const recFilms = [1, 2, 3, 4, 5].map((n) => ({ id: 600 + n, title: `Seed Film ${n}`, year: 2005 + n, poster: `/s${n}.jpg`, vote: 7.2, votes: 2500, genre_ids: [18] }));
    localStorage.setItem('nossyV2.meta', JSON.stringify({
      'a|2020': { id: 1, poster: '/a.jpg', vote: 8, votes: 5000, genres: ['Drama'], at: Date.now(), recs: recFilms },
      'b|2019': { id: 2, poster: '/b.jpg', vote: 7, votes: 4000, genres: ['Drama'], at: Date.now() },
      'c|2018': { id: 3, poster: '/c.jpg', vote: 7, votes: 4000, genres: ['Drama'], at: Date.now() },
      'd|2017': { id: 4, poster: '/d.jpg', vote: 7, votes: 4000, genres: ['Drama'], at: Date.now() },
    }));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Verken')[0]);
    fireEvent.click(screen.getByText('Voor jou'));
    // naar "Alles bekijken" van de rij, waar de kaarten met het recept wonen
    fireEvent.click(screen.getByText(/Alles bekijken/));
    fireEvent.click(screen.getAllByText(/Waarom \d+%\?/)[0]);
    expect(screen.getByText('Kwaliteit (gedempt op stemmen)')).toBeTruthy();
    expect(screen.getByText('Genre-affiniteit')).toBeTruthy();
    expect(document.body.textContent).toMatch(/\+\d+ punten/);
    fireEvent.click(screen.getByText('Verberg het recept'));
    expect(screen.queryByText('Kwaliteit (gedempt op stemmen)')).toBeNull();
  });

  it('rijen: voegNieuweToe dedupliceert op id', async () => {
    const { voegNieuweToe } = await import('./src/lib/rows.js');
    expect(voegNieuweToe([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 3 }]).map((f) => f.id)).toEqual([1, 2, 3]);
  });

  it('voor jou: het rijrecept geeft top, favorieten, regisseur, parels en bubbel, zonder dubbele films', async () => {
    const { bouwRecept } = await import('./src/lib/foryou.js');
    let id = 0;
    const film = (extra) => ({ id: ++id, vote: 7.4, votes: 3000, match: 70, waarde: 1, bronnen: [], seeds: [], genre_ids: [18], ...extra });
    const list = [];
    // sterke aanbevelingen via drie favorieten
    ['S1', 'S2', 'S3'].forEach((n) => { for (let i = 0; i < 8; i++) list.push(film({ waarde: 3 - i * 0.2, bronnen: ['aanbevolen'], seeds: [n] })); });
    // twee regisseurs
    ['R1', 'R2'].forEach((n) => { for (let i = 0; i < 8; i++) list.push(film({ waarde: 1.6, bronnen: [`oeuvre:${n}`] })); });
    // parels: weinig stemmen, hoog cijfer
    for (let i = 0; i < 5; i++) list.push(film({ votes: 400, vote: 7.6, waarde: 0.7, bronnen: ['profiel'] }));
    // buiten de bubbel: komedie, sterk beoordeeld
    for (let i = 0; i < 5; i++) list.push(film({ genre_ids: [35], vote: 7.8, votes: 5000, waarde: 0.7, bronnen: ['profiel'] }));
    // rommel onder de kwaliteitsdrempel (een 9 met 30 stemmen)
    for (let i = 0; i < 5; i++) list.push(film({ votes: 30, vote: 9, bronnen: ['profiel'] }));
    const taste = { genres: { Drama: 0.9, Comedy: 0 } };
    const seedFilms = ['S1', 'S2', 'S3'].map((n) => ({ key: n, name: n }));
    const rijen = bouwRecept(list, { seedFilms, regisseurs: ['R1', 'R2'], taste, dag: 0 });
    expect(rijen.map((r) => r.type)).toEqual(['top', 'seed', 'oeuvre', 'parels', 'seed', 'bubbel']);
    // geen film in twee rijen, en niets onder de drempel
    const ids = rijen.flatMap((r) => r.films.map((f) => f.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(rijen.some((r) => r.films.some((f) => f.votes === 30))).toBe(false);
    // de top begint met de sterkste aanbeveling, en neemt hooguit 3 films per favoriet of regisseur
    expect(rijen[0].films[0].waarde).toBe(3);
    const perBron = {};
    rijen[0].films.forEach((f) => { const b = f.bronnen.find((x) => x.startsWith('oeuvre:')) || f.seeds[0]; perBron[b] = (perBron[b] || 0) + 1; });
    expect(Math.max(...Object.values(perBron))).toBeLessThanOrEqual(3);
    // een andere dag (of "Andere suggesties") kiest andere favorieten en een andere regisseur
    const morgen = bouwRecept(list, { seedFilms, regisseurs: ['R1', 'R2'], taste, dag: 1 });
    expect(morgen.filter((r) => r.type === 'seed').map((r) => r.naam)).not.toEqual(rijen.filter((r) => r.type === 'seed').map((r) => r.naam));
    expect(morgen.find((r) => r.type === 'oeuvre').naam).not.toBe(rijen.find((r) => r.type === 'oeuvre').naam);
    // te weinig voor één echte rij: geen rijen (Voor jou toont dan de lijst)
    expect(bouwRecept(list.slice(0, 3), { seedFilms, taste, dag: 0 })).toEqual([]);
  });

  it('voor jou: de thema-rij vraagt twee gedeelde thema\'s, en het label noemt ze', async () => {
    const { bouwRecept } = await import('./src/lib/foryou.js');
    let id = 0;
    const film = (gedeeldeThemas) => ({ id: ++id, vote: 7.4, votes: 3000, match: 70, waarde: 1, bronnen: ['thema'], seeds: [], genre_ids: [18], gedeeldeThemas });
    const taste = { genres: {}, topThemes: [{ id: 1, name: 'grief' }, { id: 2, name: 'loneliness' }, { id: 3, name: 'florida' }] };
    // vijf films die twee thema's delen, vijf die er maar één delen (alleen "florida")
    const list = [...Array.from({ length: 5 }, () => film(['grief', 'loneliness'])), ...Array.from({ length: 5 }, () => film(['florida']))];
    const thema = bouwRecept(list, { taste, dag: 0 }).find((r) => r.type === 'thema');
    expect(thema.films.length).toBe(5);
    expect(thema.films.every((f) => f.gedeeldeThemas.length === 2)).toBe(true);
    expect(thema.themas).toEqual(['grief', 'loneliness']);
    // een sterk thema (op 4+ van je favorieten) telt ook in zijn eentje
    const sterk = { ...taste, topThemes: [{ id: 4, name: 'coming of age', films: 5 }, ...taste.topThemes] };
    const losse = Array.from({ length: 5 }, () => film(['coming of age']));
    const alles = [...list, ...losse];
    const rij = bouwRecept(alles, { taste: sterk, dag: 0 }).find((r) => r.type === 'thema');
    // de reden van de rij (ook gebruikt door "Alles bekijken"): paren én het sterke thema, geen losse florida
    expect(alles.filter(rij.past).length).toBe(10);
    expect(alles.filter(rij.past).some((f) => f.gedeeldeThemas.includes('florida') && f.gedeeldeThemas.length === 1)).toBe(false);
  });

  it('rijen: binnen een rij wint aanbevelingssterkte van een hoge match op een zwakke route', async () => {
    const { sorteerOpSterkte, plekGewicht } = await import('./src/lib/rows.js');
    expect(plekGewicht(0, 10)).toBe(1);
    expect(plekGewicht(9, 10)).toBeCloseTo(0.55);
    // sterke aanbeveling (5★-seed via recommendations) met middelmatige match
    const sterk = { id: 1, waarde: 3, match: 60 };
    // zwakke similar-treffer (halve weging, staart van de lijst) met hoge match
    const zwak = { id: 2, waarde: 1.2 * 0.6, match: 80 };
    expect(sorteerOpSterkte([zwak, sterk]).map((f) => f.id)).toEqual([1, 2]);
    // bij gelijke sterkte beslist de match
    expect(sorteerOpSterkte([{ id: 3, waarde: 2, match: 50 }, { id: 4, waarde: 2, match: 90 }]).map((f) => f.id)).toEqual([4, 3]);
  });

  it('rijen: regisseurs op sterkte, en een uitstapje buiten hun genre valt uit "Meer van"', async () => {
    const { rangschikRegisseurs, pastInOeuvre } = await import('./src/lib/rows.js');
    const meta = {
      a: { director: 'Een', directorId: 1, genres: ['Drama'] },
      b: { director: 'Twee', genres: ['Drama', 'Romance'] },
      c: { director: 'Twee', genres: ['Drama'] },
      d: { director: 'Vier', genres: ['Comedy'] },
    };
    const seeds = [{ key: 'a', rating: 5 }, { key: 'b', rating: 4.5 }, { key: 'c', rating: 4.5 }, { key: 'd', rating: 4 }];
    const r = rangschikRegisseurs(seeds, meta);
    // Twee: twee films die je hoog gaf (3 punten) wint van Een (2 punten);
    // Vier heeft geen 4,5★-film en telt niet mee
    expect(r.map((x) => x.naam)).toEqual(['Twee', 'Een']);
    expect(r[1].id).toBe(1);
    // Mufasa-regel: animatie/familie/avontuur deelt geen genre met een drama-regisseur
    expect(pastInOeuvre({ genre_ids: [16, 10751, 12] }, new Set(['Drama']))).toBe(false);
    expect(pastInOeuvre({ genre_ids: [18, 36] }, new Set(['Drama']))).toBe(true);
    expect(pastInOeuvre({ genre_ids: [] }, new Set(['Drama']))).toBe(true);
  });

  it('voor jou: alleen ratings buiten de watchlist geeft toch seed-, regisseur- en themarijen', async () => {
    // Het scenario van de drie motorbugs: de echte smaak zit in ratings zónder
    // filmdata (1), de motor start al op één watchlist-seed terwijl de
    // geschiedenis nog verrijkt wordt (2), en de thema's bestaan pas ná die
    // verrijking (3). Plus een oude oeuvre-cache van een niet-favoriet (4).
    const calls = [];
    const rec = (id, title) => ({ id, title, release_date: '2015-03-01', poster_path: `/p${id}.jpg`, vote_average: 7.4, vote_count: 2500, original_language: 'en', overview: '', genre_ids: [18] });
    global.fetch = async (url) => {
      const u = new URL(String(url));
      const p = u.pathname.replace(/^\/3/, '');
      calls.push(p);
      const json = (obj) => ({ ok: true, status: 200, json: async () => obj });
      if (p === '/search/movie') {
        const q = u.searchParams.get('query');
        const n = Number(q.slice(3));
        return json({ results: [{ id: 100 + n, title: q, release_date: `${2010 + n}-01-01` }] });
      }
      if (p === '/person/77/movie_credits') {
        return json({ crew: [1, 2, 3, 4, 5, 6, 7, 8].map((k) => ({ ...rec(700 + k, `Regiefilm ${k}`), job: 'Director' })), cast: [] });
      }
      if (u.searchParams.get('with_keywords')) {
        return json({ total_pages: 1, results: [1, 2, 3, 4].map((k) => rec(800 + k, `Themafilm ${k}`)) });
      }
      const detail = p.match(/^\/movie\/(\d+)$/);
      if (detail) {
        const id = Number(detail[1]);
        const n = id - 100;
        return json({
          id, title: `Fav${n}`, release_date: `${2010 + n}-01-01`, runtime: 100, genres: [{ id: 18, name: 'Drama' }],
          vote_average: 7.8, vote_count: 4000, poster_path: null, backdrop_path: null, overview: '',
          credits: { crew: [{ job: 'Director', name: 'Regisseur X', id: 77 }] }, videos: { results: [] },
          'watch/providers': { results: {} }, keywords: { keywords: [{ id: 90, name: 'loneliness' }] },
          production_countries: [], recommendations: { results: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => rec(id * 10 + k, `Aanrader ${n}-${k}`)) },
        });
      }
      return json({ results: [], total_pages: 1 });
    };
    localStorage.clear();
    localStorage.setItem('nossyV2.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('nossyV2.watchlist', JSON.stringify([{ key: 'w|2019', name: 'W', year: 2019, uri: '' }]));
    localStorage.setItem('nossyV2.ratings', JSON.stringify({ 'w|2019': 4 }));
    localStorage.setItem('nossyV2.meta', JSON.stringify({ 'w|2019': { id: 1, title: 'W', year: 2019, genres: ['Drama'], vote: 7, votes: 3000, at: Date.now(), recs: [] } }));
    localStorage.setItem('nossyV2.ratedFilms', JSON.stringify([1, 2, 3].map((n) => ({ key: `fav${n}|${2010 + n}`, name: `Fav${n}`, year: 2010 + n, uri: '', rating: 5 }))));
    const oud = [1, 2, 3, 4, 5].map((k) => ({ id: 950 + k, title: `Oud ${k}`, year: 2000, vote: 7.5, votes: 2000, genre_ids: [18] }));
    localStorage.setItem('nossyV2.oeuvres', JSON.stringify({ 'Oude Regisseur': { at: Date.now(), films: oud } }));
    try {
      render(<App />);
      fireEvent.click(screen.getAllByLabelText('Verken')[0]);
      fireEvent.click(screen.getByText('Voor jou'));
      const koppen = () => [...document.querySelectorAll('.rec-row-head h3')].map((h) => h.textContent);
      // Recept: top, favoriet, regisseur, favoriet, thema. Welke twee van de
      // drie favorieten een rij krijgen, wisselt per dag.
      await waitFor(() => expect(koppen().length).toBe(5), { timeout: 3000 });
      const k = koppen();
      expect(k[0]).toBe('Top voor jou');
      expect(k[2]).toBe('Meer van Regisseur X');
      expect(k[4]).toBe('Deelt loneliness met je favorieten');
      expect(k.filter((x) => /^Omdat je Fav\d hoog waardeerde$/.test(x)).length).toBe(2);
      expect(calls).toContain('/person/77/movie_credits');
      expect(document.body.textContent).not.toContain('Oude Regisseur');
    } finally {
      delete global.fetch;
    }
  });

  it('tegels: + zet op de shortlist, x wijst af, en de rij vult zichzelf aan', () => {
    localStorage.clear();
    localStorage.setItem('nossyV2.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('nossyV2.ratedFilms', JSON.stringify([
      { key: 'a|2020', name: 'A', year: 2020, rating: 5 }, { key: 'b|2019', name: 'B', year: 2019, rating: 5 },
      { key: 'c|2018', name: 'C', year: 2018, rating: 4.5 }, { key: 'd|2017', name: 'D', year: 2017, rating: 4.5 },
    ]));
    localStorage.setItem('nossyV2.watchlist', JSON.stringify([{ key: 'a|2020', name: 'A', year: 2020 }]));
    const oeuvreFilms = [1, 2, 3, 4, 5, 6].map((n) => ({ id: 900 + n, title: `Reg Film ${n}`, year: 2000 + n, poster: `/r${n}.jpg`, vote: 7.5, votes: 2000, genre_ids: [18] }));
    localStorage.setItem('nossyV2.oeuvres', JSON.stringify({ Testregisseur: { films: oeuvreFilms, at: Date.now() } }));
    localStorage.setItem('nossyV2.meta', JSON.stringify({ 'a|2020': { id: 1, poster: '/a.jpg', vote: 8, votes: 5000, genres: ['Drama'], director: 'Testregisseur', at: Date.now() } }));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Verken')[0]); // opent op Voor jou
    expect(screen.getByText('Meer van Testregisseur')).toBeTruthy();
    // x: weg uit de rij, met een zichtbare nudge
    fireEvent.click(screen.getByLabelText('Niet voor mij: Reg Film 1'));
    expect(screen.queryByText('Reg Film 1')).toBeNull();
    expect(document.body.textContent).toMatch(/je ziet nu iets minder/i);
    // +: naar de shortlist, die als uitklapknop in de kop verschijnt
    fireEvent.click(screen.getByLabelText('Zet Reg Film 2 op je shortlist'));
    expect(screen.queryByText('Reg Film 2')).toBeNull();
    fireEvent.click(screen.getByText('Shortlist (1)'));
    expect(document.body.textContent).toContain('Exporteer voor Letterboxd');
    // de rij blijft staan met de overige films
    expect(screen.getByText('Meer van Testregisseur')).toBeTruthy();
    expect(screen.getByText('Reg Film 3')).toBeTruthy();
  });

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
    localStorage.setItem('nossyV2.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('nossyV2.ratedFilms', JSON.stringify([
      { key: 'a|2020', name: 'A', year: 2020, rating: 5 }, { key: 'b|2019', name: 'B', year: 2019, rating: 5 },
      { key: 'c|2018', name: 'C', year: 2018, rating: 4.5 }, { key: 'd|2017', name: 'D', year: 2017, rating: 4.5 },
    ]));
    localStorage.setItem('nossyV2.watchlist', JSON.stringify([{ key: 'a|2020', name: 'A', year: 2020 }]));
    const recFilms = [1, 2, 3, 4, 5].map((n) => ({ id: 600 + n, title: `Seed Film ${n}`, year: 2005 + n, poster: `/s${n}.jpg`, vote: 7.2, votes: 2500, genre_ids: [18] }));
    localStorage.setItem('nossyV2.meta', JSON.stringify({
      'a|2020': { id: 1, poster: '/a.jpg', vote: 8, votes: 5000, genres: ['Drama'], at: Date.now(), recs: recFilms },
      'b|2019': { id: 2, poster: '/b.jpg', vote: 7, votes: 4000, genres: ['Drama'], at: Date.now() },
      'c|2018': { id: 3, poster: '/c.jpg', vote: 7, votes: 4000, genres: ['Drama'], at: Date.now() },
      'd|2017': { id: 4, poster: '/d.jpg', vote: 7, votes: 4000, genres: ['Drama'], at: Date.now() },
    }));
    try {
      render(<App />);
      fireEvent.click(screen.getAllByLabelText('Verken')[0]);
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
    localStorage.setItem('nossyV2.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    // vier ratings zodat de mengmotor op ratings draait
    localStorage.setItem('nossyV2.ratedFilms', JSON.stringify([
      { key: 'a|2020', name: 'A', year: 2020, rating: 5 }, { key: 'b|2019', name: 'B', year: 2019, rating: 5 },
      { key: 'c|2018', name: 'C', year: 2018, rating: 4.5 }, { key: 'd|2017', name: 'D', year: 2017, rating: 4.5 },
    ]));
    localStorage.setItem('nossyV2.watchlist', JSON.stringify([{ key: 'a|2020', name: 'A', year: 2020 }]));
    // film A is gezien-gelogd; de tool kent 'm met TMDB-id 555
    localStorage.setItem('nossyV2.seen', JSON.stringify(['gezienefilm|2015']));
    // recs van seed A bevatten óók id 555 (de al geziene film) plus een verse 556
    localStorage.setItem('nossyV2.meta', JSON.stringify({
      'a|2020': { id: 1, poster: '/a.jpg', vote: 8, votes: 5000, genres: ['Drama'], at: Date.now(), recs: [
        { id: 555, title: 'Gezienefilm', year: 2015, poster: '/g.jpg', vote: 7.5, votes: 3000, genre_ids: [18] },
        { id: 556, title: 'Verse Aanrader', year: 2016, poster: '/v.jpg', vote: 7.6, votes: 4000, genre_ids: [18] },
      ] },
      'gezienefilm|2015': { id: 555, poster: '/g.jpg', vote: 7.5, votes: 3000, genres: ['Drama'], at: Date.now() },
    }));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Verken')[0]);
    fireEvent.click(screen.getByText('Voor jou'));
    // de verse aanrader mag verschijnen, de al geziene film niet
    expect(document.body.textContent).toContain('Verse Aanrader');
    expect(document.body.textContent).not.toContain('Gezienefilm');
  });

  it('voor jou: filters op genre, looptijd en dienst, en korte films vallen uit de rijen', async () => {
    const { pastFilter, degelijk } = await import('./src/lib/foryou.js');
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
    const { buildTaste } = await import('./src/lib/taste.js');
    const kw = [{ id: 970, name: 'parent child relationship' }, { id: 90, name: 'loneliness' }];
    const rf = [1, 2, 3].map((n) => ({ key: `f${n}|2015`, year: 2015, rating: 5 }));
    const meta = Object.fromEntries(rf.map((f) => [f.key, { genres: ['Drama'], keywords: kw, votes: 2000 }]));
    const t = buildTaste({ watchlist: [], ratedFilms: rf, meta });
    expect(t.topThemes.map((x) => x.name)).toEqual(['loneliness']);
  });

  it('voor jou: het genre-filter beperkt de rijen en is terug te zetten', () => {
    localStorage.clear();
    localStorage.setItem('nossyV2.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('nossyV2.ratedFilms', JSON.stringify([
      { key: 'a|2020', name: 'A', year: 2020, rating: 5 }, { key: 'b|2019', name: 'B', year: 2019, rating: 5 },
      { key: 'c|2018', name: 'C', year: 2018, rating: 4.5 }, { key: 'd|2017', name: 'D', year: 2017, rating: 4.5 },
    ]));
    localStorage.setItem('nossyV2.watchlist', JSON.stringify([{ key: 'a|2020', name: 'A', year: 2020 }]));
    const oeuvreFilms = [1, 2, 3, 4, 5].map((n) => ({ id: 900 + n, title: `Reg Film ${n}`, year: 2000 + n, poster: `/r${n}.jpg`, vote: 7.5, votes: 2000, genre_ids: [18] }));
    localStorage.setItem('nossyV2.oeuvres', JSON.stringify({ Testregisseur: { films: oeuvreFilms, at: Date.now() } }));
    localStorage.setItem('nossyV2.meta', JSON.stringify({ 'a|2020': { id: 1, poster: '/a.jpg', vote: 8, votes: 5000, genres: ['Drama'], director: 'Testregisseur', at: Date.now() } }));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Verken')[0]);
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
    localStorage.setItem('nossyV2.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('nossyV2.ratedFilms', JSON.stringify([
      { key: 'a|2020', name: 'A', year: 2020, rating: 5 }, { key: 'b|2019', name: 'B', year: 2019, rating: 5 },
      { key: 'c|2018', name: 'C', year: 2018, rating: 4.5 }, { key: 'd|2017', name: 'D', year: 2017, rating: 4.5 },
    ]));
    localStorage.setItem('nossyV2.watchlist', JSON.stringify([{ key: 'a|2020', name: 'A', year: 2020 }]));
    const recFilms = [1, 2, 3, 4, 5].map((n) => ({ id: 600 + n, title: `Seed Film ${n}`, year: 2005 + n, poster: `/s${n}.jpg`, vote: 7.2, votes: 2500, genre_ids: [18] }));
    localStorage.setItem('nossyV2.meta', JSON.stringify({
      'a|2020': { id: 1, poster: '/a.jpg', vote: 8, votes: 5000, genres: ['Drama'], at: Date.now(), recs: recFilms },
      'b|2019': { id: 2, poster: '/b.jpg', vote: 7, votes: 4000, genres: ['Drama'], at: Date.now(), sims: [] },
      'c|2018': { id: 3, poster: '/c.jpg', vote: 7, votes: 4000, genres: ['Drama'], at: Date.now(), sims: [] },
      'd|2017': { id: 4, poster: '/d.jpg', vote: 7, votes: 4000, genres: ['Drama'], at: Date.now(), sims: [] },
    }));
    try {
      render(<App />);
      fireEvent.click(screen.getAllByLabelText('Verken')[0]);
      expect(screen.getByText('Omdat je A hoog waardeerde')).toBeTruthy();
      // de details komen binnen: twee tegels tonen dat ze op Netflix staan
      await waitFor(() => expect(document.querySelectorAll('.tile-prov').length).toBe(2));
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
      expect(document.body.textContent).toContain('Nu op Netflix');
    } finally {
      delete global.fetch;
    }
  });

  it('scoring: kruisbevestiging, anti-favorieten en regisseursgewicht', async () => {
    const { scoorKandidaten, bepaalSeeds } = await import('./src/lib/kandidaten.js');
    const { rangschikRegisseurs } = await import('./src/lib/rows.js');
    const { buildTaste } = await import('./src/lib/taste.js');
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
  });

  it('meetlat: verborgen favorieten die via andere favorieten bereikbaar zijn, komen terug', async () => {
    const { meetlat } = await import('./src/lib/kandidaten.js');
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

  it('inzicht: de meetlat-kaart meet op verzoek', () => {
    const namen = ['F1', 'F2', 'F3', 'F4', 'F5'];
    const ratedFilms = namen.map((n, i) => ({ key: `${n.toLowerCase()}|${2000 + i}`, name: n, year: 2000 + i, rating: 5 }));
    const meta = Object.fromEntries(ratedFilms.map((r, i) => {
      const volgende = ratedFilms[(i + 1) % 5];
      return [r.key, { id: 100 + i, genres: ['Drama'], recs: [{ id: 100 + ((i + 1) % 5), title: volgende.name, year: volgende.year, vote: 7.5, votes: 2000, genre_ids: [18] }] }];
    }));
    localStorage.setItem('nossyV2.ratedFilms', JSON.stringify(ratedFilms));
    localStorage.setItem('nossyV2.meta', JSON.stringify({ ...JSON.parse(localStorage.getItem('nossyV2.meta')), ...meta }));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Inzicht')[0]);
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
    localStorage.setItem('nossyV2.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('nossyV2.ratedFilms', JSON.stringify([
      { key: 'a|2020', name: 'A', year: 2020, rating: 5 }, { key: 'b|2019', name: 'B', year: 2019, rating: 5 },
      { key: 'c|2018', name: 'C', year: 2018, rating: 4.5 }, { key: 'd|2017', name: 'D', year: 2017, rating: 4.5 },
    ]));
    localStorage.setItem('nossyV2.watchlist', JSON.stringify([{ key: 'a|2020', name: 'A', year: 2020 }]));
    const recFilms = [1, 2, 3, 4, 5].map((n) => ({ id: 600 + n, title: `Seed Film ${n}`, year: 2005 + n, poster: `/s${n}.jpg`, vote: 7.2, votes: 2500, genre_ids: [18] }));
    localStorage.setItem('nossyV2.meta', JSON.stringify({
      'a|2020': { id: 1, poster: '/a.jpg', vote: 8, votes: 5000, genres: ['Drama'], at: Date.now(), recs: recFilms, sims: [] },
      'b|2019': { id: 2, poster: '/b.jpg', vote: 7, votes: 4000, genres: ['Drama'], at: Date.now(), sims: [] },
      'c|2018': { id: 3, poster: '/c.jpg', vote: 7, votes: 4000, genres: ['Drama'], at: Date.now(), sims: [] },
      'd|2017': { id: 4, poster: '/d.jpg', vote: 7, votes: 4000, genres: ['Drama'], at: Date.now(), sims: [] },
    }));
    try {
      render(<App />);
      fireEvent.click(screen.getAllByLabelText('Verken')[0]);
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
    localStorage.setItem('nossyV2.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    // vier 5-sterren films zodat het profiel "sterk" is en seeds tellen
    localStorage.setItem('nossyV2.ratedFilms', JSON.stringify([
      { key: 'a|2020', name: 'A', year: 2020, rating: 5 }, { key: 'b|2019', name: 'B', year: 2019, rating: 5 },
      { key: 'c|2018', name: 'C', year: 2018, rating: 4.5 }, { key: 'd|2017', name: 'D', year: 2017, rating: 4.5 },
    ]));
    localStorage.setItem('nossyV2.watchlist', JSON.stringify([{ key: 'a|2020', name: 'A', year: 2020 }]));
    // een oeuvre van "Testregisseur" met vijf films -> genoeg voor een rij
    const oeuvreFilms = [1, 2, 3, 4, 5].map((n) => ({ id: 900 + n, title: `Reg Film ${n}`, year: 2000 + n, poster: `/r${n}.jpg`, vote: 7.5, votes: 2000, genre_ids: [18] }));
    localStorage.setItem('nossyV2.oeuvres', JSON.stringify({ Testregisseur: { films: oeuvreFilms, at: Date.now() } }));
    localStorage.setItem('nossyV2.meta', JSON.stringify({
      'a|2020': { id: 1, poster: '/a.jpg', vote: 8, votes: 5000, genres: ['Drama'], director: 'Testregisseur', at: Date.now() },
    }));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Verken')[0]);
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
    fireEvent.click(screen.getAllByLabelText('Verken')[0]);
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
    fireEvent.click(screen.getAllByLabelText('Avond')[0]);
    fireEvent.click(screen.getByText('Start veto'));
    for (let i = 0; i < 5; i++) {
      const tiles = document.querySelectorAll('.poster-tile:not(.struck)');
      fireEvent.click(tiles[0]);
    }
    expect(document.body.textContent).toContain('De groep heeft gesproken');
  });

  it('avond: bracket van halve finale naar kampioen', () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Avond')[0]);
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
    fireEvent.click(screen.getAllByLabelText('Inzicht')[0]);
    expect(document.body.textContent).toContain('Genres');
    expect(document.body.textContent).toContain('Decennia');
    expect(document.body.textContent).toContain('Jouw gem. rating');
  });

  it('demo laden toont banner; wissen brengt terug naar landing', async () => {
    localStorage.clear();
    localStorage.setItem('nossyV2.settings', JSON.stringify({ lang: 'nl' }));
    render(<App />);
    fireEvent.click(screen.getByText('Probeer met demo-watchlist'));
    expect(document.body.textContent).toContain('demo-watchlist, met voorbeeldfilms');
    fireEvent.click(screen.getByText('Demo wissen en opnieuw beginnen'));
    expect(document.body.textContent).toContain('Wat kijken we vanavond?');
    expect(document.body.textContent).not.toContain('Demo wissen');
  });

  it('bieb: zoeken, sorteren en film openen met Nossy-score', () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Bieb')[0]);
    expect(document.body.textContent).toContain('6 van 6 films');
    fireEvent.change(screen.getByLabelText('Zoek in je bieb'), { target: { value: 'stalker' } });
    expect(document.body.textContent).toContain('1 van 6 films');
    fireEvent.click(screen.getByLabelText(/Open Stalker/));
    expect(document.body.textContent).toContain('Uit je bieb');
    expect(document.body.textContent).toContain('Terug naar de bieb');
  });

  it('winner toont Nossy-score en losse bronnen bij ext-ratings', () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Bieb')[0]);
    fireEvent.click(screen.getByLabelText(/Open Aftersun/));
    expect(document.body.textContent).toContain('Nossy'); // hero-label
    expect(document.body.textContent).toContain('7,8'); // IMDb-bron
    expect(document.body.textContent).toContain('93%');
    expect(document.body.textContent).toContain('81'); // Meta-bron
  });

  it('verken: afwijzen is te herstellen', () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Verken')[0]);
    fireEvent.click(screen.getByText('Voor jou'));
    const kaart = screen.getByText('Vergelijkbare Parel').closest('.card');
    fireEvent.click(within(kaart).getByText('Niet voor mij'));
    expect(document.body.textContent).not.toContain('Vergelijkbare Parel');
    fireEvent.click(screen.getByText(/Afgewezen \(1\)/));
    fireEvent.click(screen.getByLabelText('Herstel Vergelijkbare Parel'));
    expect(document.body.textContent).toContain('Vergelijkbare Parel');
  });

  it('inzicht: eerdere pick heropenen', () => {
    localStorage.setItem('nossyV2.history', JSON.stringify([{ key: 'stalker|1979', name: 'Stalker', year: 1979, date: new Date().toISOString(), context: null }]));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Inzicht')[0]);
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

  it('slimme pick en moods wegen op de Nossy-score', async () => {
    const { moodTest, pickWinner, nossyScore } = await import('./src/lib/pick.js');
    const metaMap = {
      'a|2020': { vote: 6.8, votes: 5000, ext: { imdb: 8.4, rt: 95, mc: 88 } }, // nossy ≈ 8,2 → topper
      'b|2020': { vote: 6.8, votes: 5000 }, // nossy 6,8 → geen topper
    };
    expect(nossyScore(metaMap['a|2020'])).toBeCloseTo(8.0, 5); // (8.4+8.8+6.8)/3, gelijke weging
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
    fireEvent.click(screen.getByText('Terug naar Verken'));
    delete global.fetch;
  });

  it('avond: filters beperken de pot vooraf', () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Avond')[0]);
    fireEvent.click(screen.getByText('Toon filters'));
    // periode vanaf 2010 (Whiplash 2014, Aftersun 2022 blijven; Stalker 1979 valt weg)
    fireEvent.change(screen.getByLabelText('Jaar van'), { target: { value: '2010' } });
    expect(document.body.textContent).toMatch(/films over/);
    // start een veto-ronde en check dat een out-of-range film niet op tafel ligt
    fireEvent.click(screen.getByText('Start veto'));
    expect(document.body.textContent).not.toContain('Stalker');
  });

  it('avond: info-knop spiekt zonder de ronde te verstoren', () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Avond')[0]);
    fireEvent.click(screen.getByText('Start veto'));
    const infoBtn = document.querySelector('[aria-label^="Info over"]');
    fireEvent.click(infoBtn);
    expect(document.body.textContent).toContain('Even spieken');
    fireEvent.click(screen.getByText('Terug naar de ronde'));
    expect(document.body.textContent).toContain('Speler 1 is aan de beurt');
  });

  it('nossy-label verschijnt pas bij 2+ bronnen', () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Bieb')[0]);
    fireEvent.click(screen.getByLabelText(/Open First Cow/)); // geen ext → alleen TMDB
    // geen Nossy-hero (dat vereist 2+ bronnen), wel de losse TMDB-bron
    expect(document.querySelector('.nossy-big')).toBeNull();
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
    fireEvent.click(screen.getAllByLabelText('Bieb')[0]);
    fireEvent.click(screen.getByLabelText(/Open First Cow/));
    expect(await screen.findByText(/8,1/)).toBeTruthy();
    expect(document.body.textContent).toContain('91%');
    expect(document.body.textContent).toContain('84'); // Meta
    expect(document.querySelector('.nossy-big')).toBeTruthy(); // Nossy-hero
    delete global.fetch;
  });

  it('scores worden bij het openen automatisch opgehaald als sleutels er zijn', async () => {
    localStorage.setItem('nossyV2.settings', JSON.stringify({ tmdbKey: 'x', omdbKeys: ['k1'], lang: 'nl' }));
    global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ Response: 'True', imdbRating: '7.9', Ratings: [] }) });
    render(<App />);
    await new Promise((r) => setTimeout(r, 50));
    fireEvent.click(screen.getAllByLabelText('Setup')[0]);
    expect(await screen.findByText(/6 met scores \(OMDb\)/)).toBeTruthy();
    delete global.fetch;
  });

  it('zonder omdb-sleutels: hint met wegklik', () => {
    render(<App />);
    expect(document.body.textContent).toContain('Je ziet nu alleen TMDB-scores');
    fireEvent.click(screen.getByText('Nee, TMDB is prima'));
    expect(document.body.textContent).not.toContain('Je ziet nu alleen TMDB-scores');
  });

  it('bieb: gezien-scope toont kijkgeschiedenis met jouw rating', () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Bieb')[0]);
    fireEvent.click(screen.getByText(/Gezien \(2\)/));
    expect(document.body.textContent).toContain('Columbus');
    expect(document.body.textContent).toContain('Petite maman');
    expect(document.body.textContent).toContain('4,5');
    expect(document.body.textContent).toContain('Jouw rating'); // sorteeroptie
  });

  it('bieb: periode-filter werkt', () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Bieb')[0]);
    fireEvent.change(screen.getByLabelText('Periode'), { target: { value: '1970' } });
    expect(document.body.textContent).toContain('Stalker');
    expect(document.body.textContent).not.toContain('Whiplash');
    expect(document.body.textContent).toContain('1 van 6 films (gefilterd)');
  });

  it('nossy-score: gewogen (IMDb dubbel) en één decimaal', async () => {
    const { nossyScore, fmtScore } = await import('./src/lib/pick.js');
    // RT telt niet mee: (7.8*2 + 8.1 + 7.7) / 4 = 7.85 -> 7.9
    expect(nossyScore({ vote: 7.7, ext: { imdb: 7.8, rt: 93, mc: 81 } })).toBeCloseTo(7.9, 5);
    // zelfde film zonder RT geeft exact dezelfde score
    expect(nossyScore({ vote: 7.7, ext: { imdb: 7.8, mc: 81 } })).toBeCloseTo(7.9, 5);
    // RT-only levert geen Nossy op (1 bron: alleen TMDB telt dan)
    expect(nossyScore({ vote: 7.0, ext: { rt: 95 } })).toBeCloseTo(7.0, 5);
    expect(fmtScore(8)).toBe('8,0');
    expect(fmtScore(7.25)).toBe('7,3');
  });

  it('matchmotor: profiel weegt op ratings en geeft uitlegbare redenen', async () => {
    const { buildTaste, matchScore } = await import('./src/lib/taste.js');
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
    localStorage.setItem('nossyV2.ratedFilms', JSON.stringify(rf));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Verken')[0]);
    fireEvent.click(screen.getByText('Voor jou'));
    expect(document.body.textContent).toContain('% match');
    const lijstToggle = screen.queryByText('Toon als één lijst');
    if (lijstToggle) fireEvent.click(lijstToggle);
    expect(document.body.textContent).toContain('Beste match voor jou');
  });

  it('maker-zoek: duplicaat-profielen ontdubbeld, regie chronologisch', async () => {
    const { searchPersons, personFilms } = await import('./src/lib/tmdb.js');
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
    fireEvent.click(screen.getAllByLabelText('Verken')[0]);
    fireEvent.click(screen.getByText('Voor jou'));
    expect(document.body.textContent).toContain('Vergelijkbare Parel');
    expect(document.body.textContent).toContain('Lijkt op Aftersun');
    expect(document.body.textContent).toContain('Oeuvre Film');
    expect(document.body.textContent).toContain('Uit het oeuvre van Charlotte Wells');
  });

  it('feedback-lus: skippen verlaagt genre-affiniteit', async () => {
    const { buildTaste } = await import('./src/lib/taste.js');
    const basis = { watchlist: [], ratedFilms: [{ key: 'x|2000', year: 2000, rating: 4 }], meta: { 'x|2000': { genres: ['Drama'], votes: 100 } } };
    const zonder = buildTaste(basis);
    const met = buildTaste({ ...basis, skipped: [{ id: 1, genre_ids: [35] }, { id: 2, genre_ids: [35] }] });
    expect(met.genres.Comedy ?? 0).toBeLessThan(zonder.genres.Comedy ?? 0);
  });

  it('camp shakespeare-regressie: 10-met-5-stemmen wordt gedempt en gevloerd', async () => {
    const { matchScore, buildTaste } = await import('./src/lib/taste.js');
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
    const metaNow = JSON.parse(localStorage.getItem('nossyV2.meta'));
    metaNow['aftersun|2022'].sims.push({ id: 7999, title: 'Junk Short', year: 2021, poster: null, vote: 10, votes: 5, lang: 'en', genre_ids: [18] });
    localStorage.setItem('nossyV2.meta', JSON.stringify(metaNow));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Verken')[0]);
    fireEvent.click(screen.getByText('Voor jou'));
    expect(document.body.textContent).toContain('Vergelijkbare Parel'); // 800 stemmen: blijft
    expect(document.body.textContent).not.toContain('Junk Short'); // 5 stemmen: eruit
  });

  it('"Andere suggesties" haalt live nieuwe kandidaten uit TMDB', async () => {
    // alleen de tweede discover-pagina (de klik) levert de vondst;
    // de automatische instroom bij het openen krijgt lege resultaten
    global.fetch = async (url) => ({
      ok: true, status: 200,
      json: async () => (String(url).includes('/discover/') && String(url).includes('page=2')
        ? { total_pages: 5, results: [{ id: 8800, title: 'Verse Vondst', release_date: '2016-02-01', poster_path: null, vote_average: 7.4, vote_count: 4200, original_language: 'fr', overview: 'Live getapt.', genre_ids: [18] }] }
        : { total_pages: 1, results: [] }),
    });
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Verken')[0]);
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
    const { resolveFilm } = await import('./src/lib/tmdb.js');
    const meta = await resolveFilm({ name: 'Leviathan', year: 2014, key: 'leviathan|2014' }, 'k');
    expect(meta.id).toBe(222); // de 2014-versie, niet de populairdere 1989
    expect(meta.year).toBe(2014);
    expect(meta.yearMismatch).toBeUndefined();
    delete global.fetch;
  });

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
    const { resolveFilm } = await import('./src/lib/tmdb.js');
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
    const { resolveFilm } = await import('./src/lib/tmdb.js');
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
    const { discover } = await import('./src/lib/tmdb.js');
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
    fireEvent.click(screen.getByText('Terug naar Verken'));
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
    localStorage.setItem('nossyV2.ratedFilms', JSON.stringify(rf));
    localStorage.setItem('nossyV2.meta', JSON.stringify(m));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Inzicht')[0]);
    expect(document.body.textContent).toContain('Jouw smaakprofiel');
    expect(document.body.textContent).toContain('Drama');
  });

  it('verken: skip toont een zichtbare feedback-nudge', () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Verken')[0]);
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
    localStorage.setItem('nossyV2.meta', JSON.stringify({ 'lilya|2002': { id: 1, poster: null, plot: lang, vote: 7.9, votes: 3000, genres: ['Drama'], at: Date.now(), trailer: null } }));
    localStorage.setItem('nossyV2.watchlist', JSON.stringify([{ key: 'lilya|2002', name: 'Lilya 4-ever', year: 2002, uri: '' }]));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Bieb')[0]);
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
    localStorage.setItem('nossyV2.watchlist', JSON.stringify([{ key: 'leviathan|2014', name: 'Leviathan', year: 2014, uri: '' }]));
    localStorage.setItem('nossyV2.meta', JSON.stringify({ 'leviathan|2014': { id: 111, year: 1989, poster: '/a.jpg', yearMismatch: 2014, at: Date.now() } }));
    localStorage.setItem('nossyV2.settings', JSON.stringify({ tmdbKey: 'k', lang: 'nl' }));
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
    const { buildTaste, matchScore, setThemeEmphasis } = await import('./src/lib/taste.js');
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
    const { buildTaste, matchScore, setThemeEmphasis } = await import('./src/lib/taste.js');
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
    localStorage.setItem('nossyV2.watchlist', JSON.stringify([{ key: 'eddie|2015', name: 'Eddie the Eagle', year: 2015, uri: '' }]));
    localStorage.setItem('nossyV2.meta', JSON.stringify({ 'eddie|2015': { id: 222, year: 1989, poster: '/x.jpg', yearMismatch: 2015, mismatchType: 'year', at: Date.now() } }));
    // géén tmdbKey in settings: dit apparaat draait op de proxy
    localStorage.setItem('nossyV2.settings', JSON.stringify({ lang: 'nl' }));
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
    const { resolveFilm } = await import('./src/lib/tmdb.js');
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
    localStorage.setItem('nossyV2.watchlist', JSON.stringify([{ key: '11.22.63|2016', name: '11.22.63', year: 2016, uri: '' }]));
    localStorage.setItem('nossyV2.meta', JSON.stringify({ '11.22.63|2016': { id: 111, year: 1989, poster: '/a.jpg', yearMismatch: 2016, mismatchType: 'year', at: Date.now() } }));
    localStorage.setItem('nossyV2.settings', JSON.stringify({ tmdbKey: 'k', lang: 'nl' }));
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
    localStorage.setItem('nossyV2.ratedFilms', JSON.stringify(rf));
    localStorage.setItem('nossyV2.meta', JSON.stringify(m));
    localStorage.setItem('nossyV2.watchlist', JSON.stringify([{ key: 'seed|2015', name: 'Seed', year: 2015, uri: '' }]));
    localStorage.setItem('nossyV2.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    global.fetch = async (url) => {
      const u = String(url);
      if (u.includes('with_keywords')) return { ok: true, status: 200, json: async () => ({ total_pages: 1, results: [
        { id: 8888, title: 'Eenzame Film', release_date: '2018-01-01', poster_path: null, vote_average: 7.6, vote_count: 4000, original_language: 'en', overview: 'x', genre_ids: [18] },
      ] }) };
      return { ok: true, status: 200, json: async () => ({ results: [], total_pages: 1 }) };
    };
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Verken')[0]);
    fireEvent.click(screen.getByText('Voor jou'));
    // de thema-jacht draait nu automatisch; geen chip meer
    // de gejaagde film verschijnt mét uitleg over het thema
    expect(await screen.findByText('Eenzame Film')).toBeTruthy();
    expect(document.body.textContent).toMatch(/thema['’]s: .*loneliness/i);
    delete global.fetch;
  });

  it('taste: themas moeten op >=2 films voorkomen en boilerplate valt weg', async () => {
    const { buildTaste, setThemeEmphasis } = await import('./src/lib/taste.js');
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
    const { buildTaste } = await import('./src/lib/taste.js');
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
    // standaard NL: 'Verken' en 'Bieb' zichtbaar
    expect(screen.getAllByText('Verken').length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByLabelText('Setup')[0]);
    fireEvent.click(screen.getByText('English'));
    // nu Engels: 'Explore' en 'Library' verschijnen, 'Verken' verdwijnt
    expect(screen.getAllByText('Explore').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Library').length).toBeGreaterThan(0);
    expect(screen.queryByText('Verken')).toBeNull();
  });

  it('i18n: t() interpoleert variabelen en kiest meervoud', async () => {
    const { t, setLang } = await import('./src/lib/i18n.js');
    setLang('nl');
    expect(t('common.films_over', { count: 1 })).toBe('1 film over');
    expect(t('common.films_over', { count: 5 })).toBe('5 films over');
    setLang('en');
    expect(t('common.films_over', { count: 1 })).toBe('1 film left');
    expect(t('common.films_over', { count: 3 })).toBe('3 films left');
    expect(t('nav.bieb')).toBe('Library');
    setLang('nl'); // reset
  });

  it('i18n: Engels vertaalt de Pick-tab volledig (geen los Nederlands)', () => {
    localStorage.clear();
    localStorage.setItem('nossyV2.settings', JSON.stringify({ tmdbKey: 'x', lang: 'en' }));
    localStorage.setItem('nossyV2.watchlist', JSON.stringify([{ key: 'a|2020', name: 'A', year: 2020 }, { key: 'b|2019', name: 'B', year: 2019 }]));
    render(<App />);
    const txt = document.body.textContent;
    expect(txt).toContain('In the mood for');
    expect(txt).toContain('Pick a film');
    expect(txt).toContain('films in your pool');
    // geen kenmerkende Nederlandse UI-woorden meer
    expect(txt).not.toContain('In de stemming');
    expect(txt).not.toContain('Slimme pick');
  });

  it('i18n fase 3: meervouden kiezen de juiste vorm in beide talen', async () => {
    const { t, setLang } = await import('./src/lib/i18n.js');
    setLang('nl');
    expect(t('pick.poolCount', { count: 1 })).toBe('1 film in je pool');
    expect(t('pick.poolCount', { count: 6 })).toBe('6 films in je pool');
    expect(t('zoek.resCount', { count: 1 })).toBe('1 resultaat');
    expect(t('avond.overlapCount', { count: 1 })).toBe('1 film staat op al jullie lijsten');
    expect(t('match.votesShort', { count: 1, n: 1 })).toBe('1 stem');
    expect(t('setup.wrongFilms', { count: 2 })).toContain('afwijkend jaar');
    setLang('en');
    expect(t('pick.poolCount', { count: 1 })).toBe('1 film in your pool');
    expect(t('zoek.emptyTextFiltered', { count: 1, filters: 'x' })).toContain('There was 1 title match');
    expect(t('app.omdbStopLimit', { count: 1 })).toContain('1 film has no scores');
    setLang('nl'); // reset
  });

  it('i18n fase 3: pool-subtitel toont enkelvoud bij 1 film', () => {
    localStorage.clear();
    localStorage.setItem('nossyV2.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('nossyV2.watchlist', JSON.stringify([{ key: 'a|2020', name: 'A', year: 2020 }]));
    render(<App />);
    expect(document.body.textContent).toContain('1 film in je pool');
    expect(document.body.textContent).not.toContain('1 films');
  });

  it('regio: refreshProviders leest de ingestelde regio en bewaart de JustWatch-link', async () => {
    const { setRegion, refreshProviders, DEFAULT_REGION } = await import('./src/lib/tmdb.js');
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
    localStorage.setItem('nossyV2.meta', JSON.stringify({ 'aftersun|2022': { id: 9, poster: null, vote: 7.8, votes: 5000, genres: ['Drama'], flat: ['MUBI'], jwLink: 'https://www.justwatch.com/nl/film/aftersun', at: Date.now(), trailer: null } }));
    localStorage.setItem('nossyV2.watchlist', JSON.stringify([{ key: 'aftersun|2022', name: 'Aftersun', year: 2022, uri: '' }]));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Bieb')[0]);
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
    localStorage.setItem('nossyV2.meta', JSON.stringify({ 'a|2020': { id: 42, poster: null, vote: 7, votes: 100, genres: [], flat: ['Videoland'], at: Date.now(), trailer: null } }));
    localStorage.setItem('nossyV2.watchlist', JSON.stringify([{ key: 'a|2020', name: 'A', year: 2020, uri: '' }]));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Setup')[0]);
    fireEvent.change(screen.getByLabelText('Streaming-regio'), { target: { value: 'GB' } });
    await waitFor(() => expect(calls.length).toBeGreaterThan(0), { timeout: 2000 });
    expect(calls[0]).toContain('/movie/42/watch/providers');
    delete global.fetch;
  });

  it('fase 6: genre-labels en talenlijst schakelen mee naar Engels', async () => {
    const { genreLabelById } = await import('./src/lib/tmdb.js');
    const { setLang } = await import('./src/lib/i18n.js');
    setLang('nl');
    expect(genreLabelById(80)).toBe('Misdaad');
    setLang('en');
    expect(genreLabelById(80)).toBe('Crime');
    setLang('nl');
    // talenlijst in EN-modus via Intl
    cleanup();
    localStorage.clear();
    localStorage.setItem('nossyV2.settings', JSON.stringify({ tmdbKey: 'x', lang: 'en' }));
    localStorage.setItem('nossyV2.watchlist', JSON.stringify([{ key: 'a|2020', name: 'A', year: 2020 }]));
    render(<App />);
    fireEvent.click(screen.getAllByText('Explore')[0]);
    fireEvent.click(screen.getByText('Show filters'));
    const sel = screen.getByLabelText('Language');
    const opties = [...sel.querySelectorAll('option')].map((o) => o.textContent);
    expect(opties).toContain('Norwegian');
    expect(opties).toContain('All languages');
    expect(opties).not.toContain('Noors');
  });

  it('fase 6: match-redenen komen in het Engels bij lang en', async () => {
    const { buildTaste, matchScore } = await import('./src/lib/taste.js');
    const { setLang } = await import('./src/lib/i18n.js');
    setLang('en');
    const meta = { 'a|2020': { id: 1, genres: ['Drama'], votes: 3000, country: 'US' }, 'b|2019': { id: 2, genres: ['Drama'], votes: 3000, country: 'US' } };
    const taste = buildTaste({ watchlist: [], ratedFilms: [{ key: 'a|2020', name: 'A', year: 2015, rating: 5 }, { key: 'b|2019', name: 'B', year: 2015, rating: 5 }], meta });
    const m = matchScore({ vote: 8, votes: 3000, year: 2016, lang: 'en', genre_ids: [18] }, taste);
    expect(m.redenen.some((r) => /matches your highest-rated films/.test(r))).toBe(true);
    expect(m.redenen.some((r) => /your era/.test(r))).toBe(true);
    setLang('nl');
  });

  it('veiligheid: extern trefwoord met HTML wordt geescaped, niet uitgevoerd', async () => {
    const { esc } = await import('./src/lib/i18n.js');
    expect(esc('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(esc("O'Brien & Co")).toBe('O&#39;Brien &amp; Co');
    // en door de hele keten: besmet TMDB-trefwoord in het smaakprofiel
    localStorage.clear();
    const evil = '<img src=x onerror=window.__pwned=1>';
    const kw = [{ id: 1, name: evil }];
    localStorage.setItem('nossyV2.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('nossyV2.watchlist', JSON.stringify([{ key: 'a|2020', name: 'A', year: 2020 }]));
    localStorage.setItem('nossyV2.ratedFilms', JSON.stringify([
      { key: 'a|2020', name: 'A', year: 2015, rating: 5 }, { key: 'b|2019', name: 'B', year: 2015, rating: 5 },
    ]));
    localStorage.setItem('nossyV2.meta', JSON.stringify({
      'a|2020': { id: 1, genres: ['Drama'], votes: 3000, country: 'US', keywords: kw, at: Date.now() },
      'b|2019': { id: 2, genres: ['Drama'], votes: 3000, country: 'US', keywords: kw, at: Date.now() },
    }));
    render(<App />);
    fireEvent.click(screen.getAllByText('Inzicht')[0]);
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(window.__pwned).toBeUndefined();
    expect(document.body.textContent).toContain('<img src=x');
  });

  it('taaldetectie: onbekende browsertaal valt terug op Engels, niet Nederlands', async () => {
    const { detectLang } = await import('./src/lib/i18n.js');
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
    const { t, setLang } = await import('./src/lib/i18n.js');
    setLang('nl');
    expect(t('common.decade', { era: '90' })).toBe("Jaren '90");
    expect(t('app.enriching', { done: 3, total: 10 })).toContain('3/10');
    setLang('en');
    expect(t('common.decade', { era: '90' })).toBe("The '90s");
    expect(t('common.posterAlt', { name: 'Aftersun' })).toBe('Poster of Aftersun');
    setLang('nl');
  });

  it('opslag: kapotte localStorage geeft een zichtbare waarschuwing', async () => {
    const { reportStorageError } = await import('./src/lib/storage.js');
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
    localStorage.setItem('nossyV2.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('nossyV2.watchlist', JSON.stringify(
      Array.from({ length: 70 }, (_, i) => ({ key: `film${i}|2000`, name: `Film ${i}`, year: 2000 })),
    ));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Bieb')[0]);
    expect(screen.getAllByLabelText(/^Open /).length).toBe(60);
    const btn = screen.getByText('Toon meer (10 over)');
    fireEvent.click(btn);
    expect(screen.getAllByLabelText(/^Open /).length).toBe(70);
    expect(screen.queryByText(/Toon meer/)).toBeNull();
    // filter-wijziging reset de teller
    fireEvent.change(screen.getByLabelText('Zoek in je bieb'), { target: { value: 'Film' } });
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
    localStorage.setItem('nossyV2.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl', omdbKeys: ['aaaa1111', 'bbbb2222'] }));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Setup')[0]);
    expect(screen.getByText('OMDb actief · 2 sleutels')).toBeTruthy();
    expect(screen.queryByText('Vier scores in plaats van één')).toBeNull();
    fireEvent.click(screen.getByText('Wijzig sleutels'));
    expect(screen.getByLabelText(/OMDb API-sleutels/).value).toContain('aaaa1111');
  });

  it('scores-onboarding: spook-chipje op de filmkaart linkt naar Setup', () => {
    localStorage.setItem('nossyV2.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('nossyV2.watchlist', JSON.stringify([{ key: 'a|2020', name: 'A', year: 2020 }]));
    localStorage.setItem('nossyV2.meta', JSON.stringify({ 'a|2020': { id: 1, poster: null, vote: 7.2, votes: 900, genres: ['Drama'], at: Date.now() } }));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Bieb')[0]);
    fireEvent.click(screen.getByLabelText(/^Open A/));
    const chip = screen.getByTitle(/Meer scores/);
    expect(chip.textContent).toContain('IMDb');
    fireEvent.click(chip);
    expect(screen.getByText('Vier scores in plaats van één')).toBeTruthy(); // we staan in Setup
  });

  it('proxy: zonder eigen sleutel loopt TMDB-verkeer via de Worker, zonder api_key', async () => {
    const { effectiveTmdbKey, PROXY_KEY, PROXY_URL, refreshProviders } = await import('./src/lib/tmdb.js');
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
    localStorage.setItem('nossyV2.settings', JSON.stringify({ lang: 'nl' }));
    localStorage.setItem('nossyV2.watchlist', JSON.stringify([{ key: 'a|2020', name: 'A', year: 2020 }]));
    render(<App />);
    fireEvent.click(screen.getAllByText('Verken')[0]);
    expect(document.body.textContent).not.toContain('TMDB-sleutel nodig');
    fireEvent.click(screen.getAllByLabelText('Setup')[0]);
    expect(document.body.textContent).toContain('de tool regelt TMDB voor je');
  });

  it('opvolging: gisteren gepickt vraagt om sterren en voedt het profiel', () => {
    localStorage.clear();
    const gisteren = new Date(Date.now() - 20 * 3600e3).toISOString();
    localStorage.setItem('nossyV2.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('nossyV2.watchlist', JSON.stringify([{ key: 'aftersun|2022', name: 'Aftersun', year: 2022 }]));
    localStorage.setItem('nossyV2.history', JSON.stringify([{ key: 'aftersun|2022', name: 'Aftersun', year: 2022, date: gisteren, context: 'x' }]));
    render(<App />);
    expect(screen.getByText(/Aftersun \(2022\) — Gekeken\?/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Geef 4 sterren'));
    // kaart weg, antwoord + rating bewaard
    expect(screen.queryByText(/Gekeken\?/)).toBeNull();
    const own = JSON.parse(localStorage.getItem('nossyV2.ownRatings'));
    expect(own['aftersun|2022'].rating).toBe(4);
    const fu = JSON.parse(localStorage.getItem('nossyV2.followups'));
    expect(fu[gisteren]).toBe('rated');
    // en de film staat nu bij gezien, met jouw ster zichtbaar in de Bieb
    fireEvent.click(screen.getAllByLabelText('Bieb')[0]);
    fireEvent.click(screen.getByText(/^Gezien \(/));
    expect(document.body.textContent).toContain('Aftersun');
  });

  it('opvolging: "Niet gekeken" ruimt op zonder rating, en verse picks vragen niks', () => {
    localStorage.clear();
    const gisteren = new Date(Date.now() - 20 * 3600e3).toISOString();
    const netNu = new Date(Date.now() - 3600e3).toISOString();
    localStorage.setItem('nossyV2.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('nossyV2.watchlist', JSON.stringify([{ key: 'a|2020', name: 'A', year: 2020 }]));
    localStorage.setItem('nossyV2.history', JSON.stringify([
      { key: 'vers|2024', name: 'Vers', year: 2024, date: netNu, context: 'x' },
      { key: 'oud|2019', name: 'Oud', year: 2019, date: gisteren, context: 'x' },
    ]));
    render(<App />);
    // de verse pick (1 uur) wordt overgeslagen; de oudere komt aan bod
    expect(screen.getByText(/Oud \(2019\)/)).toBeTruthy();
    fireEvent.click(screen.getByText('Niet gekeken'));
    expect(screen.queryByText(/Gekeken\?/)).toBeNull();
    expect(localStorage.getItem('nossyV2.ownRatings') || '{}').not.toContain('oud');
  });

  it('her-import: de diff vertelt precies wat er veranderde', async () => {
    const { importDiff } = await import('./src/lib/csv.js');
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
    const { parseLetterboxdFiles } = await import('./src/lib/csv.js');
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
    localStorage.setItem('nossyV2.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('nossyV2.watchlist', JSON.stringify([
      { key: 'a|2020', name: 'A', year: 2020 }, { key: 'b|2021', name: 'B', year: 2021 }, { key: 'c|2022', name: 'C', year: 2022 },
    ]));
    localStorage.setItem('nossyV2.lbLists', JSON.stringify([
      { naam: 'Spooky Season', films: [{ key: 'w|2016', name: 'The Wailing', year: 2016 }, { key: 'l|2008', name: 'Lake Mungo', year: 2008 }] },
    ]));
    render(<App />);
    expect(document.body.textContent).toContain('3 films in je pool');
    fireEvent.change(screen.getByLabelText('Pick uit'), { target: { value: 'Spooky Season' } });
    expect(document.body.textContent).toContain('2 films in je pool');
  });

  it('kijkritme: het dagboek levert een ritme-kaart met piekmaand', () => {
    localStorage.clear();
    const m = (d) => d.toISOString().slice(0, 10);
    const nu = new Date();
    const dezeMaand = m(new Date(nu.getFullYear(), nu.getMonth(), 2));
    const vorigeMaand = m(new Date(nu.getFullYear(), nu.getMonth() - 1, 2));
    localStorage.setItem('nossyV2.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('nossyV2.watchlist', JSON.stringify([{ key: 'a|2020', name: 'A', year: 2020 }]));
    localStorage.setItem('nossyV2.diary', JSON.stringify([
      { key: 'x|1', name: 'X', year: 2020, watchedDate: dezeMaand, rewatch: false },
      { key: 'y|2', name: 'Y', year: 2021, watchedDate: dezeMaand, rewatch: true },
      { key: 'z|3', name: 'Z', year: 2019, watchedDate: vorigeMaand, rewatch: false },
    ]));
    render(<App />);
    fireEvent.click(screen.getAllByText('Inzicht')[0]);
    expect(document.body.textContent).toContain('Jouw kijkritme');
    expect(document.body.textContent).toContain('3 films gekeken');
    expect(document.body.textContent).toContain('waarvan 1 herkijk');
  });

  it('op afstand: computeWinner telt stemmen, gelijkspel valt op score', async () => {
    const { computeWinner } = await import('./src/lib/session.js');
    const films = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];
    const r1 = computeWinner(films, { pim: ['a', 'b'], eef: ['a'] });
    expect(r1.winner.key).toBe('a');
    expect(r1.counts).toEqual({ a: 2, b: 1, c: 0 });
    const r2 = computeWinner(films, { pim: ['a'], eef: ['b'] }, (f) => (f.key === 'b' ? 8 : 6));
    expect(r2.winner.key).toBe('b');
  });

  it('op afstand: deellink toont het stemscherm en verstuurt een stem', async () => {
    history.pushState({}, '', '?avond=ABC234');
    const calls = [];
    global.fetch = async (url, opts) => {
      calls.push({ url: String(url), body: opts?.body });
      if (String(url).endsWith('/session/ABC234')) {
        return { ok: true, status: 200, json: async () => ({ host: 'Nossy', winner: null, votes: {}, films: [
          { key: 'w|2016', name: 'The Wailing', year: 2016, poster: null },
          { key: 'l|2008', name: 'Lake Mungo', year: 2008, poster: null },
        ] }) };
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    };
    try {
      localStorage.clear();
      localStorage.setItem('nossyV2.settings', JSON.stringify({ lang: 'nl' }));
      render(<App />);
      expect(await screen.findByText('Nossy wil samen een film kiezen')).toBeTruthy();
      fireEvent.click(screen.getByLabelText('The Wailing (2016)'));
      fireEvent.change(screen.getByLabelText('Je naam'), { target: { value: 'Pim' } });
      fireEvent.click(screen.getByText('Verstuur je stem'));
      expect(await screen.findByText('Stem verstuurd')).toBeTruthy();
      const votePost = calls.find((c) => c.url.includes('/vote'));
      expect(JSON.parse(votePost.body)).toEqual({ player: 'Pim', picks: ['w|2016'] });
    } finally {
      delete global.fetch;
      history.pushState({}, '', '/');
    }
  });

  it('op afstand: gastheer start een ronde, ziet stemmen en sluit af', async () => {
    const calls = [];
    global.fetch = async (url, opts) => {
      const u = String(url);
      calls.push({ url: u, body: opts?.body });
      if (u.endsWith('/session/new')) return { ok: true, status: 200, json: async () => ({ code: 'QQQ777' }) };
      if (u.endsWith('/session/QQQ777')) return { ok: true, status: 200, json: async () => ({ host: 'Nossy', winner: null, films: [], votes: { Pim: ['a|2020'], Eef: ['a|2020', 'b|2021'] } }) };
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    };
    try {
      localStorage.clear();
      localStorage.setItem('nossyV2.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
      localStorage.setItem('nossyV2.watchlist', JSON.stringify([
        { key: 'a|2020', name: 'A', year: 2020 }, { key: 'b|2021', name: 'B', year: 2021 }, { key: 'c|2022', name: 'C', year: 2022 },
      ]));
      render(<App />);
      fireEvent.click(screen.getAllByText('Avond')[0]);
      fireEvent.click(screen.getByText('Start stemronde op afstand'));
      expect(await screen.findByText('Code: QQQ777')).toBeTruthy();
      expect(screen.getByText('Kopieer deellink')).toBeTruthy();
      // de poll (5s) brengt de stemmen binnen
      expect(await screen.findByText(/2 stemmen binnen: Pim, Eef/, {}, { timeout: 8000 })).toBeTruthy();
      fireEvent.click(screen.getByText('Sluit af en kies de winnaar'));
      expect(await screen.findByText(/Het wordt:/)).toBeTruthy();
      expect(document.body.textContent).toContain('A (2020)');
      const closePost = calls.find((c) => c.url.includes('/close'));
      expect(JSON.parse(closePost.body).winner).toBe('a|2020');
    } finally {
      delete global.fetch;
    }
  }, 15000);

  it('op afstand: zonder KV-opslag verschijnt een duidelijke melding', async () => {
    global.fetch = async () => ({ ok: false, status: 501, json: async () => ({ error: 'NO_KV' }) });
    try {
      localStorage.clear();
      localStorage.setItem('nossyV2.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
      localStorage.setItem('nossyV2.watchlist', JSON.stringify([
        { key: 'a|2020', name: 'A', year: 2020 }, { key: 'b|2021', name: 'B', year: 2021 },
      ]));
      render(<App />);
      fireEvent.click(screen.getAllByText('Avond')[0]);
      fireEvent.click(screen.getByText('Start stemronde op afstand'));
      expect(await screen.findByText(/kent nog geen stemrondes/)).toBeTruthy();
    } finally {
      delete global.fetch;
    }
  });

  it('profielen: aanmaken, boekhouding en verwijderen ruimt alles op', async () => {
    const { listProfiles, addProfile, deleteProfile, currentProfile, switchProfile } = await import('./src/lib/storage.js');
    localStorage.clear();
    expect(currentProfile()).toBe('');
    expect(addProfile('Eef')).toBe(true);
    expect(addProfile('Eef')).toBe(false); // dubbele naam
    expect(addProfile('raar.punt')).toBe(false); // punt is ons scheidingsteken
    expect(addProfile('')).toBe(false);
    expect(listProfiles()).toEqual(['Eef']);
    // wisselen zet de globale sleutel (de herlaad wordt in jsdom gevangen)
    switchProfile('Eef');
    expect(localStorage.getItem('nossyV2.activeProfile')).toBe('Eef');
    switchProfile('');
    // data van Eef simuleren; verwijderen ruimt sleutels en boekhouding op
    localStorage.setItem('nossyV2.p.Eef.watchlist', '[]');
    localStorage.setItem('nossyV2.p.Eef.settings', '{}');
    deleteProfile('Eef');
    expect(listProfiles()).toEqual([]);
    expect(localStorage.getItem('nossyV2.p.Eef.watchlist')).toBeNull();
    expect(localStorage.getItem('nossyV2.p.Eef.settings')).toBeNull();
  });

  it('profielen: een back-up van Standaard bevat geen andere profielen of globale sleutels', async () => {
    const { exportAll } = await import('./src/lib/storage.js');
    localStorage.clear();
    localStorage.setItem('nossyV2.watchlist', '[{"key":"a|1"}]');
    localStorage.setItem('nossyV2.p.Eef.watchlist', '[{"key":"x|9"}]');
    localStorage.setItem('nossyV2.activeProfile', '');
    localStorage.setItem('nossyV2.profiles', '["Eef"]');
    const dump = JSON.parse(exportAll({}));
    const keys = Object.keys(dump.data);
    expect(keys).toContain('nossyV2.watchlist');
    expect(keys.some((k) => k.includes('.p.'))).toBe(false);
    expect(keys).not.toContain('nossyV2.activeProfile');
    expect(keys).not.toContain('nossyV2.profiles');
  });

  it('omdb-kaart: status telt de missende scores en biedt de ophaal-knop', () => {
    localStorage.clear();
    localStorage.setItem('nossyV2.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl', omdbKeys: ['aaaa1111'] }));
    localStorage.setItem('nossyV2.watchlist', JSON.stringify([
      { key: 'a|2020', name: 'A', year: 2020 }, { key: 'b|2021', name: 'B', year: 2021 },
    ]));
    localStorage.setItem('nossyV2.meta', JSON.stringify({
      'a|2020': { id: 1, vote: 7, votes: 100, genres: [], at: Date.now(), ext: { imdb: 7.5 } },
      'b|2021': { id: 2, vote: 6, votes: 50, genres: [], at: Date.now() },
    }));
    // de automatische ophaalronde strandt (geen netwerk), waarna de kaart
    // status en knop moet tonen: precies de situatie uit de klacht
    global.fetch = async () => { throw new Error('offline'); };
    try {
      render(<App />);
      fireEvent.click(screen.getAllByLabelText('Setup')[0]);
      return screen.findByText('Haal ze op', {}, { timeout: 5000 }).then((knop) => {
        expect(document.body.textContent).toContain('Scores compleet voor 1 van je 2 films.');
        expect(document.body.textContent).toContain('1 film mist nog OMDb-scores.');
        fireEvent.click(knop);
        expect(document.body.textContent).toContain('Scores ophalen: 0 van 1');
        // en de profielen-kaart staat er, met Standaard actief
        expect(screen.getByText('Profielen')).toBeTruthy();
        const profChip = screen.getAllByText('Standaard').find((el) => el.className.includes('chip'));
        expect(profChip.className).toContain('on-g');
      });
    } finally {
      delete global.fetch;
    }
  }, 10000);

  it('slimme aanrader: dubbele bron wint, gezien valt af, thema-overlap geeft de reden', async () => {
    const { smartSimilar } = await import('./src/lib/similar.js');
    const raw = (id, title, jaar, extra = {}) => ({ id, title, release_date: `${jaar}-01-01`, poster_path: null, vote_average: 7.5, vote_count: 5000, original_language: 'en', genre_ids: [18], ...extra });
    global.fetch = async (url) => {
      const u = String(url);
      const json = (obj) => ({ ok: true, status: 200, json: async () => obj });
      if (u.includes('/101/recommendations')) return json({ results: [raw(201, 'Dubbel', 2021), raw(202, 'AlleenRec', 2020), raw(203, 'Gezien', 2019)] });
      if (u.includes('/101/similar')) return json({ results: [raw(201, 'Dubbel', 2021), raw(204, 'AlleenSim', 2018)] });
      if (u.includes('/201/keywords')) return json({ keywords: [{ id: 1, name: 'grief' }, { id: 2, name: 'coming of age' }] });
      if (u.includes('/keywords')) return json({ keywords: [] });
      return json({ results: [] });
    };
    try {
      const { results } = await smartSimilar(
        { key: 'seed|2022', name: 'Seed' },
        { id: 101, genres: ['Drama'], lang: 'en', keywords: [{ id: 1, name: 'grief' }, { id: 2, name: 'coming of age' }] },
        { tmdbKey: 'x', seenKeys: new Set(['gezien|2019']), watchlistKeys: new Set(['alleenrec|2020']) },
      );
      const titels = results.map((r) => r.title);
      expect(titels).not.toContain('Gezien');
      expect(titels[0]).toBe('Dubbel'); // recs + similar + thema-overlap
      const dubbel = results.find((r) => r.title === 'Dubbel');
      expect(dubbel.dubbeleBron).toBe(true);
      expect(dubbel.redenen[0]).toEqual({ type: 'themes', themes: ['grief', 'coming of age'] });
      expect(results.find((r) => r.title === 'AlleenRec').opWatchlist).toBe(true);
    } finally {
      delete global.fetch;
    }
  });

  it('slimme aanrader: overlay vanaf de bieb-kaart, met reden en watchlist-badge', async () => {
    localStorage.clear();
    localStorage.setItem('nossyV2.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('nossyV2.watchlist', JSON.stringify([
      { key: 'a|2020', name: 'A', year: 2020 }, { key: 'aftersun|2022', name: 'Aftersun', year: 2022 },
    ]));
    localStorage.setItem('nossyV2.meta', JSON.stringify({
      'a|2020': { id: 101, poster: null, vote: 7.2, votes: 900, genres: ['Drama'], lang: 'en', at: Date.now(), keywords: [{ id: 1, name: 'grief' }] },
    }));
    const raw = (id, title, jaar) => ({ id, title, release_date: `${jaar}-01-01`, poster_path: null, vote_average: 7.9, vote_count: 8000, original_language: 'en', genre_ids: [18] });
    global.fetch = async (url) => {
      const u = String(url);
      const json = (obj) => ({ ok: true, status: 200, json: async () => obj });
      if (u.includes('/recommendations')) return json({ results: [raw(301, 'Aftersun', 2022)] });
      if (u.includes('/similar')) return json({ results: [] });
      if (u.includes('/301/keywords')) return json({ keywords: [{ id: 1, name: 'grief' }] });
      if (u.includes('/movie/301')) return json({
        id: 301, title: 'Aftersun', release_date: '2022-05-20', poster_path: null, vote_average: 7.9, vote_count: 8000,
        runtime: 101, genres: [{ id: 18, name: 'Drama' }], original_language: 'en', overview: 'Zomer.',
        imdb_id: 'tt19770238', credits: { crew: [{ job: 'Director', name: 'Charlotte Wells' }], cast: [] },
        videos: { results: [] }, 'watch/providers': { results: {} }, keywords: { keywords: [{ id: 1, name: 'grief' }] },
        recommendations: { results: [] },
      });
      return json({ results: [], keywords: [] });
    };
    try {
      render(<App />);
      fireEvent.click(screen.getAllByLabelText('Bieb')[0]);
      fireEvent.click(screen.getByLabelText('Open A (2020)'));
      fireEvent.click(screen.getByText('Meer zoals deze'));
      expect(await screen.findByText('Meer zoals A')).toBeTruthy();
      expect(await screen.findByText(/Aftersun \(2022\)/)).toBeTruthy();
      expect(document.body.textContent).toContain('deelt grief');
      expect(document.body.textContent).toContain('op je watchlist');
      // doorklikken op een suggestie opent de volwaardige filmkaart
      fireEvent.click(screen.getByLabelText('Open Aftersun'));
      expect(await screen.findByText('Via de slimme aanrader')).toBeTruthy();
      expect(await screen.findByText(/Charlotte Wells/)).toBeTruthy(); // detail is echt opgehaald
      // en de terugknop brengt je bij de suggesties terug
      fireEvent.click(screen.getByText('Terug naar de suggesties'));
      expect(screen.getByText(/deelt grief/)).toBeTruthy();
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByText('Meer zoals A')).toBeNull();
    } finally {
      delete global.fetch;
    }
  });

  it('filmkaarten linken naar IMDb en JustWatch, ook zonder gecachte ids', async () => {
    const { imdbLink, jwLink } = await import('./src/lib/links.js');
    expect(imdbLink({ imdbId: 'tt1234567' }, { name: 'X' })).toBe('https://www.imdb.com/title/tt1234567/');
    expect(imdbLink(null, { name: 'Aftersun', year: 2022 })).toContain('imdb.com/find/?q=Aftersun%202022');
    expect(jwLink({ jwLink: 'https://www.justwatch.com/nl/film/aftersun' }, { name: 'Aftersun' })).toContain('/nl/film/aftersun');
    expect(jwLink(null, { name: 'Aftersun' })).toContain('justwatch.com/nl/search?q=Aftersun');
  });

  it('zoeken: een gezien-en-gelogde film zegt "Al gezien" met jouw sterren, niet "in je collectie"', async () => {
    localStorage.clear();
    localStorage.setItem('nossyV2.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('nossyV2.watchlist', JSON.stringify([{ key: 'a|2020', name: 'A', year: 2020 }]));
    // handmatig gezien via de tool (dus n\u00edet in watchedLb) + eigen rating
    localStorage.setItem('nossyV2.seen', JSON.stringify(['aftersun|2022']));
    localStorage.setItem('nossyV2.ownRatings', JSON.stringify({ 'aftersun|2022': { rating: 4, name: 'Aftersun', year: 2022, at: 1 } }));
    global.fetch = async () => ({
      ok: true, status: 200,
      json: async () => ({
        total_pages: 1, total_results: 1,
        results: [{ id: 9002, title: 'Aftersun', release_date: '2022-05-20', poster_path: null, vote_average: 7.9, vote_count: 8000, original_language: 'en', overview: 'Zomer.', genre_ids: [18] }],
      }),
    });
    try {
      startOpZoeken();
      render(<App />);
      naarZoeken();
      fireEvent.change(screen.getByPlaceholderText(/Zoek op titel of maker/), { target: { value: 'aftersun' } });
      fireEvent.click(screen.getByText('Zoek'));
      expect(await screen.findByText(/Al gezien · jij gaf 4,0 ★/)).toBeTruthy();
      expect(document.body.textContent).not.toContain('Al in je collectie');
    } finally {
      delete global.fetch;
    }
  });

  it('imdb-link uit een lijst gaat na de klik direct naar de titelpagina', async () => {
    const { default: ImdbA } = await import('./src/components/ImdbA.jsx');
    const venster = { location: '', opener: 'x' };
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(venster);
    const calls = [];
    global.fetch = async (url) => {
      calls.push(String(url));
      return { ok: true, status: 200, json: async () => ({ imdb_id: 'tt19770238' }) };
    };
    try {
      render(<ImdbA tmdbId={301} tmdbKey="x" film={{ name: 'Aftersun', year: 2022 }} />);
      const link = screen.getByText('IMDb');
      // zonder bekend id valt de href terug op zoeken, maar de klik lost het op
      expect(link.getAttribute('href')).toContain('/find/');
      fireEvent.click(link);
      await waitFor(() => expect(String(venster.location)).toBe('https://www.imdb.com/title/tt19770238/'));
      expect(venster.opener).toBeNull();
      expect(calls.some((u) => u.includes('/301/external_ids'))).toBe(true);
    } finally {
      openSpy.mockRestore();
      delete global.fetch;
    }
  });

  it('usePoll: pauzeert bij een verborgen tabblad en stopt als inactief', async () => {
    vi.useFakeTimers();
    const { renderHook } = await import('@testing-library/react');
    const { usePoll } = await import('./src/lib/usePoll.js');
    let telling = 0;
    const zichtbaar = { value: false };
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => zichtbaar.value });

    const { rerender, unmount } = renderHook(({ actief }) => usePoll(() => { telling += 1; }, 1000, actief), {
      initialProps: { actief: true },
    });
    // zichtbaar tabblad: één directe tick plus twee intervallen
    expect(telling).toBe(1);
    vi.advanceTimersByTime(2000);
    expect(telling).toBe(3);

    // tabblad naar de achtergrond: geen enkele tick meer
    zichtbaar.value = true;
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(5000);
    expect(telling).toBe(3);

    // terug in beeld: pollen hervat
    zichtbaar.value = false;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(telling).toBe(4);

    // inactief geschakeld: alles stopt
    rerender({ actief: false });
    vi.advanceTimersByTime(5000);
    expect(telling).toBe(4);

    unmount();
    vi.useRealTimers();
    delete document.hidden;
  });

  it('setup toont sleutel en back-up', () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Setup')[0]);
    expect(document.body.textContent).toContain('TMDB API-sleutel');
    expect(document.body.textContent).toContain('OMDb-sleutel');
    expect(document.body.textContent).toContain('Exporteer alles');
  });
});
