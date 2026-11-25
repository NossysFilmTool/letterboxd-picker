// ShutterScore 2 (versie 6.1): Metacritic op dezelfde schaal, voor iedereen
// hetzelfde (geen recept meer), en "voorlopig" bij weinig stemmen.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen, cleanup, waitFor } from '@testing-library/react';
import App from '../src/App.jsx';
import { seed } from './helpers.jsx';

describe('ShutterScore 2', () => {
  beforeEach(() => { cleanup(); seed(); });

  it('Metacritic gaat eerst naar dezelfde schaal als IMDb en TMDB', async () => {
    const { mcOpTien } = await import('../src/lib/metacritic.js');
    const { appScore } = await import('../src/lib/pick.js');
    // Gemeten op 146 films: 30 -> 5,3, 65 -> 7,0, 90 -> 8,3 (was 3,0, 6,5, 9,0)
    expect(mcOpTien(30)).toBeCloseTo(5.32, 2);
    expect(mcOpTien(65)).toBeCloseTo(7.035, 3);
    expect(mcOpTien(90)).toBeCloseTo(8.26, 2);
    // Het voorbeeld uit het advies: IMDb 7,0 en TMDB 7,1 geven 7,1. Met
    // Metacritic 65 erbij zakte hij naar 6,9, alleen door de schaal; nu 7,0
    const film = { vote: 7.1, votes: 5000, ext: { imdb: 7.0, imdbVotes: 40000 } };
    expect(appScore(film)).toBe(7.1);
    expect(appScore({ ...film, ext: { ...film.ext, mc: 65 } })).toBe(7.0);
    // Critici die een film echt afkraken, tellen nog steeds zwaar
    expect(appScore({ ...film, ext: { ...film.ext, mc: 20 } })).toBe(6.3);
  });

  it('een oud recept telt niet meer, en Setup heeft er geen kaart meer voor', async () => {
    const st = JSON.parse(localStorage.getItem('picker.settings'));
    localStorage.setItem('picker.settings', JSON.stringify({ ...st, scoreWeights: { imdb: 3, mc: 0, tmdb: 1 }, nossyWeights: { imdb: 2 } }));
    render(<App />);
    const { appScore } = await import('../src/lib/pick.js');
    expect(appScore({ vote: 7.1, ext: { imdb: 7.0, mc: 65 } })).toBe(7.0);
    fireEvent.click(screen.getAllByLabelText('Setup')[0]);
    expect(document.querySelector('[data-uitleg="setup-recept"]')).toBeNull();
    expect(screen.queryByLabelText('Gewicht IMDb')).toBeNull();
    expect(document.body.textContent).not.toContain('recept');
  });

  it('OMDb geeft ook het aantal IMDb-stemmen door', async () => {
    const { fetchExtRatings } = await import('../src/lib/omdb.js');
    const antwoord = (extra) => async () => ({ ok: true, status: 200, json: async () => ({
      Response: 'True', imdbRating: '7.1', Ratings: [{ Source: 'Metacritic', Value: '65/100' }], ...extra,
    }) });
    try {
      global.fetch = antwoord({ imdbVotes: '12,345' });
      expect(await fetchExtRatings({ imdbId: 'tt1' }, { name: 'X', year: 2020 }, 'k')).toMatchObject({ imdb: 7.1, imdbVotes: 12345, mc: 65 });
      global.fetch = antwoord({ imdbVotes: 'N/A' });
      expect((await fetchExtRatings({ imdbId: 'tt1' }, { name: 'X', year: 2020 }, 'k')).imdbVotes).toBeNull();
    } finally {
      delete global.fetch;
    }
  });

  it('voorlopig: bij elkaar minder dan duizend stemmen, en het cijfer blijft staan', async () => {
    const { scoreVoorlopig, appScore } = await import('../src/lib/pick.js');
    const klein = { vote: 7.6, votes: 80, ext: { imdb: 7.4, imdbVotes: 600, mc: 70 } };
    expect(scoreVoorlopig(klein)).toBe(true);
    expect(appScore(klein)).toBe(7.4); // niet naar het midden getrokken
    expect(scoreVoorlopig({ ...klein, ext: { ...klein.ext, imdbVotes: 950 } })).toBe(false); // 950 + 80
    expect(scoreVoorlopig({ ...klein, ext: { ...klein.ext, imdbVotes: 25000 } })).toBe(false);
    // Scores van voor 6.1 zonder aantal: het voordeel van de twijfel
    expect(scoreVoorlopig({ ...klein, ext: { imdb: 7.4, mc: 70 } })).toBe(false);
    // Zonder IMDb tellen alleen de TMDB-stemmen
    expect(scoreVoorlopig({ vote: 7.2, votes: 400, ext: { mc: 70 } })).toBe(true);
    // Een opgeblazen TMDB-cijfer telt niet mee, zijn stemmen dus ook niet
    expect(scoreVoorlopig({ vote: 9.4, votes: 900, ext: { imdb: 6.1, imdbVotes: 300 } })).toBe(true);
  });

  it('de filmkaart zegt het erbij, met uitleg', async () => {
    const { default: Winner } = await import('../src/components/Winner.jsx');
    const { setLang } = await import('../src/lib/i18n.js');
    setLang('nl');
    const film = { key: 'x|2025', name: 'Kleine Film', year: 2025 };
    const meta = { vote: 7.6, votes: 80, at: Date.now(), flat: [], rent: [], ext: { imdb: 7.4, imdbVotes: 600 } };
    const { unmount } = render(<Winner film={film} meta={meta} />);
    const label = screen.getByText('ShutterScore, voorlopig');
    expect(label.closest('[title]').title).toContain('nog geen duizend stemmen');
    expect(label.closest('[title]').title).toContain('Metacritic rekent de tool eerst om');
    unmount();
    render(<Winner film={film} meta={{ ...meta, ext: { imdb: 7.4, imdbVotes: 30000 } }} />);
    expect(screen.queryByText('ShutterScore, voorlopig')).toBeNull();
    expect(screen.getByText('ShutterScore')).toBeTruthy();
  });

  it('ontbrekende stemmen haalt de tool eenmalig bij, alleen waar het ertoe doet', async () => {
    const { extTeHalen } = await import('../src/lib/pick.js');
    expect(extTeHalen({ votes: 500 })).toBe(true); // nog geen scores
    expect(extTeHalen({ votes: 500, ext: { imdb: 7.0 } })).toBe(true); // oud, weinig TMDB-stemmen
    expect(extTeHalen({ votes: 5000, ext: { imdb: 7.0 } })).toBe(false); // genoeg stemmen: nooit voorlopig
    expect(extTeHalen({ votes: 500, ext: { imdb: 7.0, imdbVotes: null } })).toBe(false); // al gevraagd
    expect(extTeHalen({ votes: 500, ext: { at: 1 } })).toBe(false); // OMDb kende hem niet

    // Bij het opstarten: Aftersun (oude scores, nu 300 TMDB-stemmen) wel,
    // La haine (9000 stemmen) niet
    const meta = JSON.parse(localStorage.getItem('picker.meta'));
    meta['aftersun|2022'].votes = 300;
    meta['la haine|1995'].ext = { imdb: 8.1, mc: 89, at: Date.now() };
    localStorage.setItem('picker.meta', JSON.stringify(meta));
    const st = JSON.parse(localStorage.getItem('picker.settings'));
    localStorage.setItem('picker.settings', JSON.stringify({ ...st, omdbKeys: ['k1'] }));
    const gevraagd = [];
    global.fetch = async (url) => {
      const u = String(url);
      if (!u.includes('omdbapi')) return { ok: true, status: 200, json: async () => ({}) };
      gevraagd.push(new URL(u).searchParams.get('i'));
      return { ok: true, status: 200, json: async () => ({ Response: 'True', imdbRating: '7.0', imdbVotes: '450', Ratings: [] }) };
    };
    try {
      render(<App />);
      await waitFor(() => expect(gevraagd).toContain('tt000'));
      expect(gevraagd).not.toContain('tt001');
      await waitFor(() => expect(JSON.parse(localStorage.getItem('picker.meta'))['aftersun|2022'].ext.imdbVotes).toBe(450));
    } finally {
      delete global.fetch;
    }
  });

  it('Voor jou: een opgeblazen film moet 6,5 halen', async () => {
    const { degelijk } = await import('../src/lib/foryou.js');
    expect(degelijk({ vote: 6.2, votes: 3000 })).toBe(true);
    expect(degelijk({ vote: 6.2, votes: 3000, opgeblazen: 'publiek' })).toBe(false);
    expect(degelijk({ vote: 6.6, votes: 3000, opgeblazen: 'publiek' })).toBe(true);
  });
});
