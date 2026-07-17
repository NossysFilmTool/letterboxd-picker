import { describe, it, expect, beforeEach } from 'vitest';
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

  it('verken toont aanbevelingen op ratings-basis en shortlist-export', () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Verken')[0]);
    fireEvent.click(screen.getByText('Voor jou'));
    expect(document.body.textContent).toContain('4+ sterren');
    expect(document.body.textContent).toContain('Aanrader');
    fireEvent.click(screen.getAllByText('Shortlist')[0]);
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
    expect(document.body.textContent).toContain('demo-watchlist — even proeven');
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

  it('zoekmachine: pareljacht-preset zoekt via discover en shortlist werkt', async () => {
    global.fetch = async () => ({
      ok: true, status: 200,
      json: async () => ({
        total_pages: 3, total_results: 42,
        results: [
          { id: 9001, title: 'Onbekende Parel', release_date: '2019-05-01', poster_path: null, vote_average: 7.9, vote_count: 640, original_language: 'fr', overview: 'Een juweel.', genre_ids: [18] },
        ],
      }),
    });
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Verken')[0]); // start op Zoeken
    fireEvent.click(screen.getByText('Pareljacht-preset'));
    fireEvent.click(screen.getByText('Zoek'));
    expect(await screen.findByText('Onbekende Parel')).toBeTruthy();
    expect(document.body.textContent).toContain('42 resultaten');
    expect(document.body.textContent).toContain('Frans');
    fireEvent.click(screen.getAllByText('Shortlist')[0]);
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
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Verken')[0]);
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
    expect(await screen.findByText(/Opgeslagen — scores worden opgehaald/)).toBeTruthy();
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
    expect(junk.redenen.join(' ')).toContain('amper beoordeeld');
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

  it('vers uit tmdb laden voegt live kandidaten toe', async () => {
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
    fireEvent.click(screen.getByText(/Vers uit TMDB laden/));
    expect(await screen.findByText('Verse Vondst')).toBeTruthy();
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
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Verken')[0]);
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

  it('zoekmachine: vrije stemmen-invoer wordt server-side vote_count', async () => {
    const calls = [];
    global.fetch = async (url) => { calls.push(String(url)); return { ok: true, status: 200, json: async () => ({ total_pages: 2, total_results: 30, results: [{ id: 6001, title: 'Breedgezien', release_date: '2010-01-01', poster_path: null, vote_average: 8.1, vote_count: 90000, original_language: 'en', overview: 'x', genre_ids: [18] }] }) }; };
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Verken')[0]);
    fireEvent.change(screen.getByLabelText('Minimaal aantal stemmen'), { target: { value: '50000' } });
    fireEvent.click(screen.getByText('Zoek'));
    expect(await screen.findByText('Breedgezien')).toBeTruthy();
    const disc = calls.find((u) => u.includes('/discover/movie'));
    expect(disc).toContain('vote_count.gte=50000');
    expect(disc).not.toContain('vote_count.lte'); // geen bovengrens = geen lege doorsnede
    delete global.fetch;
  });

  it('zoekmachine: preset-chip vult de stemmen-velden', () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Verken')[0]);
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
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Verken')[0]);
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
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Verken')[0]);
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
    fireEvent.click(screen.getByText(/mogelijk verkeerde film/));
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

  it('setup: tv-serie negeren haalt uit twijfellijst en aanbevelingen', async () => {
    global.fetch = async (url) => {
      const u = String(url);
      if (u.includes('/search/movie')) return { ok: true, status: 200, json: async () => ({ results: [
        { id: 777, title: '11-22-63: The Day the Nation Cried', release_date: '1989-01-01', poster_path: '/a.jpg', vote_average: 5, vote_count: 1, original_language: 'en', overview: 'docu' },
      ] }) };
      return { ok: true, status: 200, json: async () => ({ results: [] }) };
    };
    localStorage.setItem('nossyV2.watchlist', JSON.stringify([{ key: '11.22.63|2016', name: '11.22.63', year: 2016, uri: '' }]));
    localStorage.setItem('nossyV2.meta', JSON.stringify({ '11.22.63|2016': { id: 111, year: 1989, poster: '/a.jpg', yearMismatch: 2016, at: Date.now() } }));
    localStorage.setItem('nossyV2.settings', JSON.stringify({ tmdbKey: 'k', lang: 'nl' }));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Setup')[0]);
    fireEvent.click(screen.getByText(/mogelijk verkeerde film/));
    // de hint over tv-series verschijnt (mager resultaat)
    expect(await screen.findByText(/mogelijk een tv-serie/i)).toBeTruthy();
    // negeer 'm
    fireEvent.click(screen.getAllByText('Hoort niet op mijn filmlijst')[0]);
    // de twijfelknop verdwijnt (geen mismatches meer) en het item staat als genegeerd
    await waitFor(() => expect(screen.queryByText(/mogelijk verkeerde film/)).toBeNull());
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
    const huntBtn = await screen.findByText(/Jaag op mijn thema/);
    fireEvent.click(huntBtn);
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
    expect(t('avond.overlapCount', { count: 1 })).toBe('1 film staat op allebei jullie lijsten');
    expect(t('match.votesShort', { count: 1, n: 1 })).toBe('1 stem');
    expect(t('setup.wrongFilms', { count: 2 })).toContain('verkeerde films');
    setLang('en');
    expect(t('pick.poolCount', { count: 1 })).toBe('1 film in your pool');
    expect(t('zoek.emptyTextFiltered', { count: 1, filters: 'x' })).toContain('There was 1 title match');
    expect(t('app.omdbStopLimit', { count: 1 })).toContain('1 film without scores');
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
    expect(alertEl.textContent).toContain('niet meer bewaard');
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
    expect(opgeroepen.startsWith(PROXY_URL)).toBe(true);
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

  it('setup toont sleutel en back-up', () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Setup')[0]);
    expect(document.body.textContent).toContain('TMDB API-sleutel');
    expect(document.body.textContent).toContain('OMDb-sleutel');
    expect(document.body.textContent).toContain('Exporteer alles');
  });
});
