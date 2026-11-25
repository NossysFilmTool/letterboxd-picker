// De app als geheel, deel 4 van 4: Kaartjes, sync, Letterboxd live en Setup.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, screen, cleanup, within, waitFor } from '@testing-library/react';
import App from '../src/App.jsx';
import { seed, startOpZoeken, naarZoeken } from './helpers.jsx';

describe('V2 smoke (4/4)', () => {
  beforeEach(() => { cleanup(); seed(); });

  it('kaartjesdoos: het afscheurmoment, en de vraag staat op Vanavond (of later)', async () => {
    localStorage.clear();
    const gisteren = new Date(Date.now() - 20 * 3600e3).toISOString();
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('picker.watchlist', JSON.stringify([{ key: 'a|2001', name: 'Film A', year: 2001 }]));
    localStorage.setItem('picker.kaartjes', JSON.stringify([{ id: '1', key: 'a|2001', name: 'Film A', year: 2001, datum: gisteren, bron: 'pick', personen: 1 }]));
    render(<App />);
    // op het Archief niet, wel een stip op Vanavond; daar staat hij
    fireEvent.click(screen.getAllByLabelText('Archief')[0]);
    expect(screen.queryByText(/Gekeken\?/)).toBeNull();
    expect(document.querySelector('[data-stip="pick"]')).not.toBeNull();
    fireEvent.click(screen.getAllByLabelText('Vanavond')[0]);
    expect(screen.getByText(/Film A \(2001\): Gekeken\?/)).toBeTruthy();
    // later: weg tot morgen
    fireEvent.click(screen.getByText('Later'));
    expect(screen.queryByText(/Gekeken\?/)).toBeNull();
    expect(JSON.parse(localStorage.getItem('picker.vraagLater')).id).toBe('1');
    // de volgende keer (later verlopen) wel, en dan scheurt hij af
    cleanup();
    localStorage.setItem('picker.vraagLater', JSON.stringify({ id: '1', tot: Date.now() - 1000 }));
    render(<App />);
    fireEvent.click(screen.getByLabelText('Geef 5 sterren'));
    expect(screen.getByText('Kaartje 1 in de doos')).toBeTruthy();
    expect(document.querySelector('.afgescheurd .kaartje-stub-titel').textContent).toBe('FILM A');
    fireEvent.click(screen.getByText('Bekijk de doos'));
    // meteen op de tab Kaartjes
    expect(document.querySelector('.archief-tab.actief').textContent).toBe('Kaartjes 1');
    expect(document.querySelector('.kaartje-stub-stempel').textContent).toBe('★★★★★');
  });

  it('kaartjesdoos: beheren, notitie, toch (niet) gekeken en je filmjaar', async () => {
    localStorage.clear();
    const dag = 24 * 3600e3;
    const iso = (ms) => new Date(ms).toISOString();
    const nu = Date.now();
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('picker.watchlist', JSON.stringify([{ key: 'a|2001', name: 'Film A', year: 2001 }, { key: 'b|2002', name: 'Film B', year: 2002 }]));
    localStorage.setItem('picker.kaartjes', JSON.stringify([
      { id: 'a', key: 'a|2001', name: 'Film A', year: 2001, datum: iso(nu - 3 * dag), bron: 'samen', personen: 2, namen: ['Robin', 'Sanne'], antwoord: 'gekeken', sterren: 4 },
      { id: 'b', key: 'b|2002', name: 'Film B', year: 2002, datum: iso(nu - 5 * dag), bron: 'pick', personen: 1, antwoord: 'niet' },
    ]));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Archief')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Kaartjes 1' }));
    // je filmjaar
    expect(screen.getByText(`Jouw filmjaar ${new Date(nu - 3 * dag).getFullYear()}`)).toBeTruthy();
    expect(document.querySelector('.kd-jaar').textContent).toContain('Sanne');
    // recent gekozen, niet in de doos: toch gekeken
    fireEvent.click(screen.getByText('Recent gekozen, niet in de doos (1)'));
    expect(document.body.textContent).toContain('je zei: niet gekeken');
    fireEvent.click(screen.getByText('Toch gekeken'));
    expect(screen.getByText('Kaartje 2 in de doos')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Kaartjes 2' })).toBeTruthy();
    // een kaartje openen: notitie en sterren aanpassen
    fireEvent.click(screen.getByLabelText(/^Film A, gekeken op/));
    const notitie = screen.getByPlaceholderText(/Met wie, waar/);
    fireEvent.change(notitie, { target: { value: 'met Sanne, in Lab111' } });
    fireEvent.blur(notitie);
    fireEvent.click(screen.getAllByLabelText('Geef 2,5 sterren')[0]);
    let k = JSON.parse(localStorage.getItem('picker.kaartjes')).find((x) => x.id === 'a');
    expect(k).toMatchObject({ notitie: 'met Sanne, in Lab111', sterren: 2.5 });
    expect(JSON.parse(localStorage.getItem('picker.ownRatings'))['a|2001'].rating).toBe(2.5);
    // toch niet gekeken: uit de doos
    fireEvent.click(screen.getByText(/Toch niet gekeken/));
    expect(screen.getByRole('button', { name: 'Kaartjes 1' })).toBeTruthy();
    k = JSON.parse(localStorage.getItem('picker.kaartjes')).find((x) => x.id === 'a');
    expect(k.antwoord).toBe('niet');
  });

  it('kaartjesdoos: jaaroverzicht en kaartjes met poster van buiten je lijst', async () => {
    const { jaarOverzicht, nieuwKaartje, buitenDeDoos } = await import('../src/lib/kaartjesdoos.js');
    const doos = [
      { id: '1', name: 'A', gekekenOp: '2026-10-03', sterren: 4, namen: ['Robin', 'Sanne'] },
      { id: '2', name: 'B', gekekenOp: '2026-10-20', sterren: 5, namen: ['Robin', 'Sanne', 'Tom'] },
      { id: '3', name: 'C', gekekenOp: '2026-03-01T20:00:00.000Z', sterren: null },
      { id: '4', name: 'D', gekekenOp: '2025-12-30', sterren: 3 },
    ];
    const o = jaarOverzicht(doos, 2026, { eigenNaam: 'Robin' });
    expect(o).toMatchObject({ aantal: 3, gemiddeld: 4.5, besteMaand: { maand: 9, aantal: 2 } });
    expect(o.hoogste.name).toBe('B');
    expect(o.vaakstMet).toEqual({ naam: 'Sanne', aantal: 2 });
    expect(jaarOverzicht(doos, 2024)).toBeNull();
    const k = nieuwKaartje({ key: 'x', name: 'X' }, { bron: 'voorjou', poster: '/p.jpg', doorgeklikt: true });
    expect(k).toMatchObject({ bron: 'voorjou', poster: '/p.jpg', doorgeklikt: true });
    const nu = Date.now();
    const st = [{ id: 'o', datum: new Date(nu - 40 * 864e5).toISOString(), status: 'verlopen' }, { id: 'n', datum: new Date(nu - 2 * 864e5).toISOString(), status: 'niet' }, { id: 'g', datum: new Date(nu).toISOString(), status: 'gekeken' }];
    expect(buitenDeDoos(st, { nu }).map((x) => x.id)).toEqual(['n']);
  });

  it('letterboxd live: de feed komt nooit uit de browsercache', async () => {
    const { haalDagboek } = await import('../src/lib/lbLive.js');
    let opties = null;
    global.fetch = async (url, o) => { opties = o; return { ok: true, status: 200, text: async () => '<?xml version="1.0"?><rss><channel></channel></rss>' }; };
    await haalDagboek('robin');
    expect(opties).toMatchObject({ cache: 'no-store' });
    delete global.fetch;
  });

  it('trailers: logline en speelduur', async () => {
    const { logline, pitchDuur, PITCH_MIN, PITCH_MAX } = await import('../src/lib/pitch.js');
    expect(logline('')).toBe('');
    expect(logline('  Kort   verhaal. ')).toBe('Kort verhaal.');
    // lang: hele zinnen tot er genoeg staat, nooit langer dan 190 tekens
    const lang = 'Een jonge drummer schrijft zich in op een muziekschool in New York en wil de allerbeste worden. '
      + 'Zijn leraar, een meedogenloze dirigent, duwt hem over elke grens heen. Wat kost grootheid uiteindelijk, en wie betaalt? '
      + 'Een derde zin die er nooit meer bij past.';
    const l = logline(lang);
    expect(l).toBe('Een jonge drummer schrijft zich in op een muziekschool in New York en wil de allerbeste worden. Zijn leraar, een meedogenloze dirigent, duwt hem over elke grens heen.');
    expect(l.length).toBeLessThanOrEqual(190);
    // een eerste zin die al te lang is: afgebroken op een woord
    const eenZin = `${'woord '.repeat(60)}einde.`;
    const kort = logline(eenZin);
    expect(kort.length).toBeLessThanOrEqual(190);
    expect(kort.endsWith('woord…')).toBe(true);
    // speelduur: leestijd binnen de grenzen
    expect(pitchDuur('')).toBe(PITCH_MIN);
    expect(pitchDuur('woord '.repeat(20))).toBe(4000 + 20 * 320);
    expect(pitchDuur('woord '.repeat(200))).toBe(PITCH_MAX);
  });

  it('letterboxd live: de feed wordt dagboek, gezien en sterren; kaartjes scheuren vanzelf', async () => {
    const { normaliseerNaam, leesDagboekFeed, voegDagboekSamen } = await import('../src/lib/lbLive.js');
    const { lokaleDag } = await import('../src/lib/kaartjesdoos.js');
    expect(normaliseerNaam('https://letterboxd.com/Robin_N/films/')).toBe('Robin_N');
    expect(normaliseerNaam('@robin')).toBe('robin');
    expect(normaliseerNaam('niet geldig!')).toBeNull();
    const pick = Date.now() - 20 * 3600e3;
    const dag = lokaleDag(pick);
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:letterboxd="https://letterboxd.com" xmlns:tmdb="https://themoviedb.org">
<channel><title>Letterboxd - Robin</title>
<item><title>Aftersun, 2022 - ★★★★½</title><letterboxd:watchedDate>${dag}</letterboxd:watchedDate><letterboxd:rewatch>No</letterboxd:rewatch><letterboxd:filmTitle>Aftersun</letterboxd:filmTitle><letterboxd:filmYear>2022</letterboxd:filmYear><letterboxd:memberRating>4.5</letterboxd:memberRating><tmdb:movieId>965150</tmdb:movieId></item>
<item><title>Stalker, 1979</title><letterboxd:watchedDate>2026-01-02</letterboxd:watchedDate><letterboxd:rewatch>Yes</letterboxd:rewatch><letterboxd:filmTitle>Stalker</letterboxd:filmTitle><letterboxd:filmYear>1979</letterboxd:filmYear></item>
<item><title>Een lijst</title><link>https://letterboxd.com/robin/list/x/</link></item>
</channel></rss>`;
    const regels = leesDagboekFeed(xml);
    expect(regels).toHaveLength(2);
    expect(regels[0]).toMatchObject({ key: 'aftersun|2022', watchedDate: dag, rating: 4.5, tmdbId: 965150, rewatch: false });
    expect(regels[1]).toMatchObject({ key: 'stalker|1979', rating: null, rewatch: true });
    const { diary, erbij } = voegDagboekSamen([{ key: 'stalker|1979', watchedDate: '2026-01-02' }], regels);
    expect(erbij.map((r) => r.key)).toEqual(['aftersun|2022']);
    expect(diary).toHaveLength(2);
    // het TMDB-nummer blijft bewaard (voor Gevonden-kaartjes met een andere titel)
    expect(erbij[0].tmdbId).toBe(965150);

    // De Worker geeft de feed door, alleen voor nette gebruikersnamen
    const worker = (await import('../worker/worker.js')).default;
    const gevraagd = [];
    global.fetch = async (url) => { gevraagd.push(String(url)); return { ok: true, status: 200, text: async () => xml }; };
    try {
      const res = await worker.fetch(new Request('https://w.dev/lb/robin', { headers: { Origin: 'http://localhost:5173' } }), {});
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('letterboxd:filmTitle');
      expect(gevraagd[0]).toBe('https://letterboxd.com/robin/rss/');
      const fout = await worker.fetch(new Request('https://w.dev/lb/so%20nny', { headers: { Origin: 'http://localhost:5173' } }), {});
      expect(fout.status).toBe(404);
    } finally { delete global.fetch; }

    // In de app: bij het openen de feed lezen; het kaartje van gisteren scheurt af
    localStorage.clear();
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl', lbNaam: 'robin' }));
    localStorage.setItem('picker.watchlist', JSON.stringify([{ key: 'aftersun|2022', name: 'Aftersun', year: 2022 }]));
    localStorage.setItem('picker.kaartjes', JSON.stringify([{ id: '1', key: 'aftersun|2022', name: 'Aftersun', year: 2022, datum: new Date(pick).toISOString(), bron: 'pick', personen: 1 }]));
    global.fetch = async (url) => (String(url).includes('/lb/robin')
      ? { ok: true, status: 200, text: async () => xml }
      : { ok: true, status: 200, json: async () => ({}) });
    try {
      render(<App />);
      await waitFor(() => expect(JSON.parse(localStorage.getItem('picker.diary') || '[]')).toHaveLength(2));
      expect(JSON.parse(localStorage.getItem('picker.watchedLb'))).toContain('aftersun|2022');
      expect(JSON.parse(localStorage.getItem('picker.ratings'))['aftersun|2022']).toBe(4.5);
      expect(JSON.parse(localStorage.getItem('picker.lbLive'))).toMatchObject({ fout: null, erbij: 2 });
      // geen vraag meer over gisteren: het dagboek is het bewijs
      expect(screen.queryByText(/Gekeken\?/)).toBeNull();
      fireEvent.click(screen.getAllByLabelText('Archief')[0]);
      fireEvent.click(screen.getByRole('button', { name: 'Kaartjes 1' }));
      expect(document.querySelector('.kaartje-stub-stempel').textContent).toBe('★★★★½');
      // en in Setup zie je de stand
      fireEvent.click(screen.getAllByLabelText('Setup')[0]);
      expect(screen.getByText(/2 nieuwe logs uit je dagboek/)).toBeTruthy();
    } finally { delete global.fetch; }
  });

  it('ontdekt: de app ziet zelf dat je een gekozen film keek, op elk scherm', async () => {
    const { lokaleDag } = await import('../src/lib/kaartjesdoos.js');
    const pick = Date.now() - 20 * 3600e3;
    const xml = `<?xml version="1.0" encoding="utf-8"?><rss version="2.0" xmlns:letterboxd="https://letterboxd.com" xmlns:tmdb="https://themoviedb.org"><channel>
<item><title>Aftersun</title><letterboxd:watchedDate>${lokaleDag(pick)}</letterboxd:watchedDate><letterboxd:filmTitle>Aftersun</letterboxd:filmTitle><letterboxd:filmYear>2022</letterboxd:filmYear><letterboxd:memberRating>4</letterboxd:memberRating></item>
</channel></rss>`;
    localStorage.clear();
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl', lbNaam: 'robin' }));
    localStorage.setItem('picker.watchlist', JSON.stringify([{ key: 'aftersun|2022', name: 'Aftersun', year: 2022 }]));
    localStorage.setItem('picker.kaartjes', JSON.stringify([{ id: 'k1', key: 'aftersun|2022', name: 'Aftersun', year: 2022, datum: new Date(pick).toISOString(), bron: 'pick', personen: 1 }]));
    localStorage.setItem('picker.kaartjesGemeld', JSON.stringify([]));
    // de feed komt pas even later binnen; ondertussen zit je in Setup
    let laat;
    const binnen = new Promise((r) => { laat = r; });
    global.fetch = async (url) => {
      if (String(url).includes('/lb/robin')) { await binnen; return { ok: true, status: 200, text: async () => xml }; }
      return { ok: true, status: 200, json: async () => ({}) };
    };
    try {
      render(<App />);
      fireEvent.click(screen.getAllByLabelText('Setup')[0]);
      laat();
      const moment = await waitFor(() => { const m = document.querySelector('.kaartje-ontdekt'); if (!m) throw new Error('nog niet'); return m; });
      expect(moment.textContent).toContain('Gezien op Letterboxd');
      expect(moment.querySelector('.kaartje-ontdekt-titel').textContent).toBe('AFTERSUN');
      expect(moment.querySelector('.kaartje-ontdekt-stempel').textContent).toBe('GEKEKEN★★★★');
      expect(moment.textContent).toContain('Kaartje 1 in de doos');
      // we zitten nog steeds in Setup
      expect(document.body.textContent).toContain('Letterboxd live');
      expect(JSON.parse(localStorage.getItem('picker.kaartjesGemeld'))).toContain('k1');
      // tik: weg
      fireEvent.click(moment);
      expect(document.querySelector('.kaartje-ontdekt')).toBeNull();
    } finally { delete global.fetch; }
  });

  it('letterboxd live: vaak kijken als er iets te verwachten valt, zelden als niet', async () => {
    const { volgendeLbCheck } = await import('../src/lib/lbLive.js');
    const nu = Date.now();
    const UUR = 3600e3;
    const iso = (ms) => new Date(ms).toISOString();
    // niets open: elk half uur
    expect(volgendeLbCheck({ kaartjes: [], vondsten: {}, nu })).toBe(30 * 60e3);
    // een pick van net: elke twee minuten
    expect(volgendeLbCheck({ kaartjes: [{ key: 'a', status: 'open', datum: iso(nu - UUR) }], nu })).toBe(2 * 60e3);
    // een vondst van net (kaart geopend in Verken): ook elke twee minuten
    expect(volgendeLbCheck({ vondsten: { b: { key: 'b', laatst: nu - 10 * 60e3 } }, nu })).toBe(2 * 60e3);
    // nog iets open, maar van gisteren: elke tien minuten
    expect(volgendeLbCheck({ kaartjes: [{ key: 'a', status: 'open', datum: iso(nu - 30 * UUR) }], nu })).toBe(10 * 60e3);
    // een vondst die al in de doos zit, telt niet meer
    expect(volgendeLbCheck({ kaartjes: [{ key: 'b', status: 'gekeken', datum: iso(nu) }], vondsten: { b: { key: 'b', laatst: nu } }, nu })).toBe(30 * 60e3);
    // na een fout: rustig aan
    expect(volgendeLbCheck({ kaartjes: [{ key: 'a', status: 'open', datum: iso(nu) }], fout: true, nu })).toBe(10 * 60e3);

    // bij het openen kijkt de app meteen, ook als de vorige keer pas vijf minuten geleden was
    localStorage.clear();
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl', lbNaam: 'robin' }));
    localStorage.setItem('picker.watchlist', JSON.stringify([{ key: 'a|2001', name: 'A', year: 2001 }]));
    localStorage.setItem('picker.lbLive', JSON.stringify({ at: nu - 5 * 60e3, fout: null, erbij: 0 }));
    let gevraagd = 0;
    global.fetch = async (url) => {
      if (String(url).includes('/lb/robin')) { gevraagd += 1; return { ok: true, status: 200, text: async () => '<?xml version="1.0"?><rss><channel></channel></rss>' }; }
      return { ok: true, status: 200, json: async () => ({}) };
    };
    try {
      render(<App />);
      await waitFor(() => expect(gevraagd).toBe(1));
      // terugkomen binnen een minuut: niet opnieuw
      window.dispatchEvent(new Event('focus'));
      await new Promise((r) => setTimeout(r, 50));
      expect(gevraagd).toBe(1);
    } finally { delete global.fetch; }
  });

  it('ontdekt: wat er al lag speelt niet opnieuw af, en je eigen antwoord krijgt het kleine moment', () => {
    localStorage.clear();
    const gisteren = new Date(Date.now() - 20 * 3600e3).toISOString();
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('picker.watchlist', JSON.stringify([{ key: 'a|2001', name: 'Film A', year: 2001 }]));
    localStorage.setItem('picker.kaartjes', JSON.stringify([
      { id: 'oud', key: 'a|2001', name: 'Film A', year: 2001, datum: new Date(Date.now() - 5 * 864e5).toISOString(), bron: 'pick', personen: 1, antwoord: 'gekeken' },
      { id: 'nieuw', key: 'b|2002', name: 'Film B', year: 2002, datum: gisteren, bron: 'pick', personen: 1 },
    ]));
    render(<App />);
    // de eerste keer: alleen onthouden wat er al lag
    expect(document.querySelector('.kaartje-ontdekt')).toBeNull();
    expect(JSON.parse(localStorage.getItem('picker.kaartjesGemeld'))).toEqual(['oud']);
    // zelf antwoorden: het kleine afscheurmoment, niet het grote
    fireEvent.click(screen.getByLabelText('Geef 3 sterren'));
    expect(screen.getByText('Kaartje 2 in de doos')).toBeTruthy();
    expect(document.querySelector('.kaartje-ontdekt')).toBeNull();
  });

  it('gevonden: een film die de tool vond en die je daarna keek, wordt een kaartje', async () => {
    const { onthoudVondst, gevondenKaartjes, voegVondstenSamen, recentGelogd } = await import('../src/lib/vondsten.js');
    const DAG = 864e5;
    const t0 = new Date(2026, 10, 3, 21, 0).getTime();
    const film = { key: 'perfect days|2023', id: 976893, name: 'Perfect Days', year: 2023, poster: '/p.jpg' };
    // vondst: kaart geopend in Zoeken; later nog eens aangeraakt
    let v = onthoudVondst({}, film, { bron: 'zoeken', nu: t0 });
    v = onthoudVondst(v, film, { bron: 'voorjou', nu: t0 + DAG });
    expect(v[film.key]).toMatchObject({ bron: 'zoeken', eerst: t0, laatst: t0 + DAG, sterk: false });
    // een log in je dagboek dezelfde avond: een Gevonden-kaartje
    let k = gevondenKaartjes(v, { diary: [{ key: film.key, watchedDate: '2026-11-03', rating: 4.5 }] });
    expect(k).toHaveLength(1);
    expect(k[0]).toMatchObject({ id: 'gevonden|perfect days|2023', bron: 'gevonden', vondst: 'zoeken', status: 'gekeken', bewijs: 'letterboxd', sterren: 4.5, gekekenOp: '2026-11-03' });
    // ook als Letterboxd de titel anders schrijft: op TMDB-nummer
    k = gevondenKaartjes(v, { diary: [{ key: 'pafekuto deizu|2023', tmdbId: 976893, watchedDate: '2026-11-04' }] });
    expect(k).toHaveLength(1);
    // stond hij al eerder in je dagboek, dan vond de tool hem niet voor je
    k = gevondenKaartjes(v, { diary: [{ key: film.key, watchedDate: '2025-01-01' }, { key: film.key, watchedDate: '2026-11-03' }] });
    expect(k).toHaveLength(0);
    // te laat (zonder shortlist: 60 dagen na de laatste keer)
    k = gevondenKaartjes(v, { diary: [{ key: film.key, watchedDate: '2027-02-01' }] });
    expect(k).toHaveLength(0);
    // meteen "al gezien" binnen een uur: die kende je al; later wel
    expect(gevondenKaartjes(v, { gezienOp: { [film.key]: new Date(t0 + 10 * 60e3).toISOString() } })).toHaveLength(0);
    expect(gevondenKaartjes(v, { gezienOp: { [film.key]: new Date(t0 + 3 * 3600e3).toISOString() }, ownRatings: { [film.key]: { rating: 5, at: t0 + 3 * 3600e3 } } })[0])
      .toMatchObject({ bewijs: 'gezien', sterren: 5 });
    // heeft de film al een eigen kaartje in de doos, dan geen tweede
    expect(gevondenKaartjes(v, { diary: [{ key: film.key, watchedDate: '2026-11-03' }], overslaanKeys: new Set([film.key]) })).toHaveLength(0);
    // samenvoegen (sync): vroegste vondst, laatste aanraking, sterk als het ergens sterk was
    const ander = onthoudVondst({}, film, { bron: 'voorjou', sterk: true, nu: t0 + 5 * DAG });
    expect(voegVondstenSamen(v, ander)[film.key]).toMatchObject({ eerst: t0, laatst: t0 + 5 * DAG, sterk: true });
    // recente logs die nog niet in de doos zitten, nieuwste eerst, per film één keer
    const nu = new Date(2026, 10, 9).getTime();
    const g = recentGelogd([
      { key: 'a', watchedDate: '2026-11-08' }, { key: 'b', watchedDate: '2026-11-07' }, { key: 'a', watchedDate: '2026-11-01' }, { key: 'oud', watchedDate: '2026-08-01' },
    ], new Set(['b']), { nu });
    expect(g.map((d) => `${d.key}|${d.watchedDate}`)).toEqual(['a|2026-11-08']);
  });

  it('gevonden: in de doos, zelf toevoegen vanuit je dagboek, en aanpassen', () => {
    localStorage.clear();
    const dag = 864e5;
    const nu = Date.now();
    const lokaal = (ms) => { const d = new Date(ms); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('picker.watchlist', JSON.stringify([{ key: 'w|2001', name: 'Watchlistfilm', year: 2001 }]));
    localStorage.setItem('picker.kaartjesGemeld', JSON.stringify([]));
    // een vondst uit Zoeken van twee dagen terug, en je logde hem gisteren
    localStorage.setItem('picker.vondsten', JSON.stringify({
      'perfect days|2023': { key: 'perfect days|2023', id: 1, name: 'Perfect Days', year: 2023, poster: null, bron: 'zoeken', eerst: nu - 2 * dag, laatst: nu - 2 * dag, sterk: false },
    }));
    localStorage.setItem('picker.diary', JSON.stringify([
      { key: 'perfect days|2023', name: 'Perfect Days', year: 2023, watchedDate: lokaal(nu - dag), rating: 4 },
      { key: 'paterson|2016', name: 'Paterson', year: 2016, watchedDate: lokaal(nu - dag), rating: 4.5 },
    ]));
    render(<App />);
    // het ontdekmoment: gevonden met Zoeken
    const moment = document.querySelector('.kaartje-ontdekt');
    expect(moment.querySelector('.kaartje-ontdekt-kop').textContent).toMatch(/^Gevonden met Zoeken\. Gezien op Letterboxd/);
    fireEvent.click(moment);
    fireEvent.click(screen.getAllByLabelText('Archief')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Kaartjes 1' }));
    expect(document.querySelector('.kaartje-stub-bron').textContent).toBe('Gevonden met Zoeken, 2023');
    expect(document.querySelector('.kd-jaar').textContent).toContain('Gevonden met ShutterBox');
    // Paterson keek je ook, maar dat vond je niet via de tool: zelf toevoegen
    fireEvent.click(screen.getByText('Recent gelogd, niet in de doos (1)'));
    fireEvent.click(screen.getByText('Gevonden via ShutterBox'));
    expect(screen.getByText('Kaartje 2 in de doos')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Kaartjes 2' })).toBeTruthy();
    // een afgeleid Gevonden-kaartje aanpassen maakt er een eigen kaartje van
    fireEvent.click(screen.getByLabelText(/^Perfect Days, gekeken op/));
    const notitie = screen.getByPlaceholderText(/Met wie, waar/);
    fireEvent.change(notitie, { target: { value: 'alleen, op de bank' } });
    fireEvent.blur(notitie);
    const k = JSON.parse(localStorage.getItem('picker.kaartjes')).find((x) => x.id === 'gevonden|perfect days|2023');
    expect(k).toMatchObject({ bron: 'gevonden', vondst: 'zoeken', antwoord: 'gekeken', notitie: 'alleen, op de bank' });
    // terug in de doos: nog steeds twee kaartjes (geen dubbele), met de notitie
    fireEvent.click(screen.getByText('Terug naar het archief'));
    expect(screen.getByRole('button', { name: 'Kaartjes 2' })).toBeTruthy();
    expect(document.body.textContent).toContain('alleen, op de bank');
  });

  it('sync: samenvoegen per kaartje, per film en per log', async () => {
    const { voegKaartjesSamen, voegGezienSamen, voegSterrenSamen, maakCode, normaliseerCode } = await import('../src/lib/sync.js');
    // kaartjes: per id, de laatst gewijzigde wint; nieuwe van beide kanten blijven
    const a = [{ id: '1', datum: '2026-11-01T20:00:00Z', sterren: 3, bij: 100 }, { id: '2', datum: '2026-11-02T20:00:00Z' }];
    const b = [{ id: '1', datum: '2026-11-01T20:00:00Z', sterren: 5, bij: 200 }, { id: '3', datum: '2026-11-03T20:00:00Z' }];
    const k = voegKaartjesSamen(a, b);
    expect(k.map((x) => x.id)).toEqual(['3', '2', '1']);
    expect(k.find((x) => x.id === '1').sterren).toBe(5);
    // sterren: per film de nieuwste
    expect(voegSterrenSamen({ x: { rating: 3, at: 5 } }, { x: { rating: 4, at: 9 }, y: { rating: 2, at: 1 } }))
      .toEqual({ x: { rating: 4, at: 9 }, y: { rating: 2, at: 1 } });
    // gezien: toch-niet-gezien na gezien wint, maar opnieuw gezien daarna weer niet
    const g = voegGezienSamen(
      { seen: ['a', 'b'], gezienOp: { a: '2026-11-01T00:00:00Z', b: '2026-11-01T00:00:00Z' }, gezienWeg: {} },
      { seen: ['c'], gezienOp: { c: '2026-11-02T00:00:00Z' }, gezienWeg: { b: Date.parse('2026-11-05T00:00:00Z') } },
    );
    expect(g.seen.sort()).toEqual(['a', 'c']);
    // de code: 25 tekens in vijf groepjes, ook uit een koppellink te halen
    const code = maakCode();
    expect(code).toMatch(/^[A-Z2-9]{5}(-[A-Z2-9]{5}){4}$/);
    expect(normaliseerCode(`https://x.io/?sync=${code}`)).toBe(code);
    expect(normaliseerCode(code.toLowerCase().replace(/-/g, ' '))).toBe(code);
    expect(normaliseerCode('kort')).toBeNull();
  });

  it('sync: twee apparaten komen op hetzelfde uit, versleuteld', async () => {
    if (!globalThis.crypto?.subtle) {
      const { webcrypto } = await import('node:crypto');
      Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
    }
    const { synchroniseer, versleutel, ontsleutel, sleutelsVan, maakCode } = await import('../src/lib/sync.js');
    const code = maakCode();
    // versleutelen en terug
    const { sleutel, id } = await sleutelsVan(code);
    expect(id).toMatch(/^[a-f0-9]{64}$/);
    const geheim = await versleutel({ hallo: 'wereld' }, sleutel);
    expect(geheim).not.toContain('wereld');
    expect(await ontsleutel(geheim, sleutel)).toEqual({ hallo: 'wereld' });
    // een server die alleen bewaart, met een versiecontrole
    let doc = null; let schrijven = 0;
    const server = {
      haal: async () => doc,
      zet: async (_, data, basis) => { if (doc && basis !== doc.at) throw new Error('CONFLICT'); schrijven += 1; doc = { at: (doc?.at || 0) + 1, data }; return { ok: true, at: doc.at }; },
    };
    const opslag = (start) => { const m = new Map(Object.entries(start)); return { lees: (s) => (m.has(s) ? m.get(s) : null), schrijf: (s, v) => m.set(s, v), m }; };
    const tk = (id, extra = {}) => ({ id, key: id, name: id, datum: '2026-11-0' + id + 'T20:00:00Z', ...extra });
    const laptop = opslag({ kaartjes: [tk('1')], watchlist: [{ key: 'x' }], settings: { lang: 'nl', lbNaam: 'robin' } });
    const pc = opslag({ kaartjes: [tk('2')] });
    let sL = (await synchroniseer(code, { opslag: laptop, server, nu: 1000 })).staat;
    // het geheim in de server is onleesbaar
    expect(doc.data).not.toContain('robin');
    const eersteKeerPc = await synchroniseer(code, { opslag: pc, server, nu: 2000 });
    let sP = eersteKeerPc.staat;
    expect(pc.m.get('kaartjes').map((x) => x.id).sort()).toEqual(['1', '2']);
    expect(pc.m.get('watchlist')).toEqual([{ key: 'x' }]);
    expect(pc.m.get('settings').lbNaam).toBe('robin');
    expect(eersteKeerPc.toegepast).toEqual(expect.arrayContaining(['kaartjes', 'watchlist', 'settings']));
    sL = (await synchroniseer(code, { opslag: laptop, staat: sL, server, nu: 3000 })).staat;
    expect(laptop.m.get('kaartjes').map((x) => x.id).sort()).toEqual(['1', '2']);
    // niets veranderd: geen nieuwe schrijfactie
    const voor = schrijven;
    sP = (await synchroniseer(code, { opslag: pc, staat: sP, server, nu: 4000 })).staat;
    expect(schrijven).toBe(voor);
    // op beide tegelijk iets gewijzigd: allebei bewaard
    laptop.schrijf('kaartjes', laptop.m.get('kaartjes').map((x) => (x.id === '1' ? { ...x, sterren: 5, bij: Date.parse('2026-11-05T00:00:00Z') } : x)));
    pc.schrijf('kaartjes', [...pc.m.get('kaartjes'), tk('3')]);
    sL = (await synchroniseer(code, { opslag: laptop, staat: sL, server, nu: 6000 })).staat;
    sP = (await synchroniseer(code, { opslag: pc, staat: sP, server, nu: 7000 })).staat;
    sL = (await synchroniseer(code, { opslag: laptop, staat: sL, server, nu: 8000 })).staat;
    for (const apparaat of [laptop, pc]) {
      const ks = apparaat.m.get('kaartjes');
      expect(ks.map((x) => x.id).sort()).toEqual(['1', '2', '3']);
      expect(ks.find((x) => x.id === '1').sterren).toBe(5);
    }
    // een instelling op de pc gewijzigd: die gaat naar de laptop
    pc.schrijf('settings', { lang: 'en', lbNaam: 'robin' });
    await synchroniseer(code, { opslag: pc, staat: { ...sP, gewijzigd: { instellingen: 9000 } }, server, nu: 9000 });
    sL = (await synchroniseer(code, { opslag: laptop, staat: sL, server, nu: 10000 })).staat;
    expect(laptop.m.get('settings').lang).toBe('en');
    // een ander apparaat was net eerder: opnieuw proberen met zijn versie erbij
    const staleServer = { ...server, zet: async (...arg) => { staleServer.zet = server.zet; doc = { ...doc, at: doc.at + 10 }; throw new Error('CONFLICT'); } };
    laptop.schrijf('kaartjes', [...laptop.m.get('kaartjes'), tk('4')]);
    await synchroniseer(code, { opslag: laptop, staat: sL, server: staleServer, nu: 11000 });
    const { sleutel: s2 } = await sleutelsVan(code);
    expect((await ontsleutel(doc.data, s2)).kolommen.kaartjes.data.kaartjes.map((x) => x.id)).toContain('4');
  });

  it('sync: de Worker bewaart alleen versleutelde data, met een versiecontrole', async () => {
    if (!globalThis.crypto?.subtle) {
      const { webcrypto } = await import('node:crypto');
      Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
    }
    const kv = new Map();
    const env = { SESSIONS: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); } } };
    const worker = (await import('../worker/worker.js')).default;
    const id = 'a'.repeat(64);
    const vraag = (methode, body) => worker.fetch(new Request(`https://w.dev/sync/${id}`, body
      ? { method: methode, body: JSON.stringify(body), headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' } }
      : { method: methode, headers: { Origin: 'http://localhost:5173' } }), env);
    const token = 'b'.repeat(64);
    const vreemd = 'c'.repeat(64);
    expect((await vraag('GET')).status).toBe(404);
    // zonder schrijfsleutel: geweigerd
    expect((await vraag('POST', { data: 'g1:abc', basis: null })).status).toBe(403);
    const eerste = await (await vraag('POST', { data: 'g1:abc', basis: null, token })).json();
    expect(eerste.ok).toBe(true);
    const bewaard = JSON.parse(kv.get(`sync:${id}`));
    expect(bewaard.data).toBe('g1:abc');
    // de Worker bewaart een vingerafdruk van de schrijfsleutel, niet de sleutel zelf
    expect(bewaard.schrijf).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(bewaard)).not.toContain(token);
    // wat je terugkrijgt bevat geen vingerafdruk
    expect(await (await vraag('GET')).json()).toEqual({ at: eerste.at, data: 'g1:abc' });
    // wie alleen het id kent, kan niet overschrijven
    expect((await vraag('POST', { data: 'g1:kapot', basis: eerste.at, token: vreemd })).status).toBe(403);
    // voortbouwen op een oude versie: geweigerd
    expect((await vraag('POST', { data: 'g1:def', basis: eerste.at - 1, token })).status).toBe(409);
    const tweede = await (await vraag('POST', { data: 'g1:def', basis: eerste.at, token })).json();
    expect(tweede.at).toBeGreaterThan(eerste.at);
    expect((await (await vraag('GET')).json()).data).toBe('g1:def');
    expect((await vraag('POST', { data: '', token })).status).toBe(400);
    // intrekken: alleen met de schrijfsleutel; daarna is de kopie weg en de deur dicht
    expect((await vraag('POST', { intrekken: true, token: vreemd })).status).toBe(403);
    expect((await vraag('POST', { intrekken: true, token })).status).toBe(200);
    expect(JSON.parse(kv.get(`sync:${id}`)).data).toBeUndefined();
    expect((await vraag('GET')).status).toBe(410);
    expect((await vraag('POST', { data: 'g1:terug', basis: null, token })).status).toBe(410);
  });

  it('sync: in Setup wissel je van code; de oude wordt ingetrokken', async () => {
    if (!globalThis.crypto?.subtle) {
      const { webcrypto } = await import('node:crypto');
      Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
    }
    const { maakCode, sleutelsVan } = await import('../src/lib/sync.js');
    const oud = maakCode();
    const oudId = (await sleutelsVan(oud)).id;
    const docs = new Map();
    const posts = [];
    global.fetch = async (url, opts) => {
      const u = String(url);
      const m = u.match(/\/sync\/([a-f0-9]{64})$/);
      if (m) {
        if (opts?.method === 'POST') {
          const b = JSON.parse(opts.body); posts.push({ id: m[1], ...b });
          const d = docs.get(m[1]);
          if (b.intrekken) { docs.set(m[1], { ingetrokken: true }); return { ok: true, status: 200, json: async () => ({ ok: true }) }; }
          const at = (d?.at || 0) + 1; docs.set(m[1], { at, data: b.data }); return { ok: true, status: 200, json: async () => ({ ok: true, at }) };
        }
        const d = docs.get(m[1]);
        if (!d) return { ok: false, status: 404, json: async () => ({ error: 'NOT_FOUND' }) };
        if (d.ingetrokken) return { ok: false, status: 410, json: async () => ({ error: 'INGETROKKEN' }) };
        return { ok: true, status: 200, json: async () => d };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };
    try {
      localStorage.clear();
      localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
      localStorage.setItem('picker.watchlist', JSON.stringify([{ key: 'a|2001', name: 'Film A', year: 2001 }]));
      localStorage.setItem('picker.sync', JSON.stringify({ code: oud, basis: {}, gewijzigd: {} }));
      render(<App />);
      fireEvent.click(screen.getAllByLabelText('Setup')[0]);
      await waitFor(() => expect(screen.getByText(/Gesynchroniseerd/)).toBeTruthy(), { timeout: 6000 });
      fireEvent.click(screen.getByText('Wissel code'));
      // de vraag staat in een eigen venster, niet in een pop-up van de browser
      const venster = await screen.findByRole('alertdialog');
      expect(venster.textContent).toContain('Een nieuwe code maken?');
      fireEvent.click(within(venster).getByRole('button', { name: 'Maak een nieuwe code' }));
      expect(await screen.findByText(/Nieuwe code gemaakt/, {}, { timeout: 6000 })).toBeTruthy();
      const nieuw = JSON.parse(localStorage.getItem('picker.sync')).code;
      expect(nieuw).not.toBe(oud);
      // de nieuwe code staat meteen zichtbaar, de oude is ingetrokken
      expect(document.querySelector('.sync-code').textContent).toBe(nieuw);
      expect(docs.get(oudId).ingetrokken).toBe(true);
      // elke schrijfactie had een schrijfsleutel bij zich
      expect(posts.every((p) => /^[a-f0-9]{64}$/.test(p.token))).toBe(true);
    } finally {
      delete global.fetch;
    }
  });

  it('sync: een nieuwe code maken trekt de oude in', async () => {
    if (!globalThis.crypto?.subtle) {
      const { webcrypto } = await import('node:crypto');
      Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
    }
    const { synchroniseer, wisselCode, sleutelsVan, ontsleutel, maakCode } = await import('../src/lib/sync.js');
    // een nep-Worker met dezelfde regels als de echte
    const docs = new Map();
    const server = {
      haal: async (id) => { const d = docs.get(id); if (!d) return null; if (d.ingetrokken) throw new Error('INGETROKKEN'); return { at: d.at, data: d.data }; },
      zet: async (id, data, basis, token) => {
        const d = docs.get(id);
        if (d?.token && d.token !== token) throw new Error('GEEN_TOEGANG');
        if (d?.ingetrokken) throw new Error('INGETROKKEN');
        if (d && basis !== d.at) throw new Error('CONFLICT');
        const at = (d?.at || 0) + 1; docs.set(id, { at, data, token }); return { ok: true, at };
      },
      trekIn: async (id, token) => {
        const d = docs.get(id);
        if (d?.token && d.token !== token) throw new Error('GEEN_TOEGANG');
        docs.set(id, { at: (d?.at || 0) + 1, ingetrokken: true, token }); return { ok: true };
      },
    };
    const opslag = (start) => { const m = new Map(Object.entries(start)); return { lees: (s) => (m.has(s) ? m.get(s) : null), schrijf: (s, v) => m.set(s, v), m }; };
    const oud = maakCode();
    const laptop = opslag({ kaartjes: [{ id: '1', datum: '2026-11-01T20:00:00Z' }] });
    const pc = opslag({ kaartjes: [{ id: '2', datum: '2026-11-02T20:00:00Z' }] });
    const sL = (await synchroniseer(oud, { opslag: laptop, server })).staat;
    const sP = (await synchroniseer(oud, { opslag: pc, server })).staat;
    // de laptop maakt een nieuwe code: eerst alles binnen, dan opnieuw opslaan
    const { code: nieuw } = await wisselCode(oud, { opslag: laptop, staat: sL, server });
    expect(nieuw).not.toBe(oud);
    const oudId = (await sleutelsVan(oud)).id;
    expect(docs.get(oudId).ingetrokken).toBe(true);
    expect(docs.get(oudId).data).toBeUndefined();
    const { id: nieuwId, sleutel } = await sleutelsVan(nieuw);
    const inhoud = await ontsleutel(docs.get(nieuwId).data, sleutel);
    expect(inhoud.kolommen.kaartjes.data.kaartjes.map((k) => k.id).sort()).toEqual(['1', '2']);
    // de pc met de oude code hoort dat die ingetrokken is, en zet hem niet terug
    await expect(synchroniseer(oud, { opslag: pc, staat: sP, server })).rejects.toThrow('INGETROKKEN');
    expect(docs.get(oudId).ingetrokken).toBe(true);
    // met de nieuwe code doet de pc gewoon weer mee
    await synchroniseer(nieuw, { opslag: pc, server });
    expect(pc.m.get('kaartjes').map((k) => k.id).sort()).toEqual(['1', '2']);
  });

  it('sync: in de app komt een kaartje van je andere apparaat binnen', async () => {
    if (!globalThis.crypto?.subtle) {
      const { webcrypto } = await import('node:crypto');
      Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
    }
    const { synchroniseer, maakCode } = await import('../src/lib/sync.js');
    const code = maakCode();
    // het andere apparaat zette er een gekeken kaartje op
    let doc = null;
    const nep = { haal: async () => doc, zet: async (_, data) => { doc = { at: (doc?.at || 0) + 1, data }; return { ok: true, at: doc.at }; } };
    const ander = new Map(Object.entries({
      kaartjes: [{ id: 'pc1', key: 'aftersun|2022', name: 'Aftersun', year: 2022, datum: new Date(Date.now() - 2 * 864e5).toISOString(), bron: 'pick', personen: 1, antwoord: 'gekeken', sterren: 4.5, bij: Date.now() }],
    }));
    await synchroniseer(code, { opslag: { lees: (s) => (ander.has(s) ? ander.get(s) : null), schrijf: (s, v) => ander.set(s, v) }, server: nep });
    localStorage.clear();
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('picker.watchlist', JSON.stringify([{ key: 'aftersun|2022', name: 'Aftersun', year: 2022 }]));
    localStorage.setItem('picker.sync', JSON.stringify({ code, basis: {}, gewijzigd: {} }));
    const posts = [];
    global.fetch = async (url, opts) => {
      const u = String(url);
      if (u.includes('/sync/')) {
        if (opts?.method === 'POST') { const b = JSON.parse(opts.body); posts.push(b); doc = { at: doc.at + 1, data: b.data }; return { ok: true, status: 200, json: async () => ({ ok: true, at: doc.at }) }; }
        return { ok: true, status: 200, json: async () => doc };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };
    try {
      render(<App />);
      await waitFor(() => expect(JSON.parse(localStorage.getItem('picker.kaartjes') || '[]').map((k) => k.id)).toContain('pc1'), { timeout: 6000 });
      fireEvent.click(screen.getAllByLabelText('Archief')[0]);
      fireEvent.click(screen.getByRole('button', { name: 'Kaartjes 1' }));
      expect(document.querySelector('.kaartje-stub-stempel').textContent).toBe('★★★★½');
      // en in Setup: de stand
      fireEvent.click(screen.getAllByLabelText('Setup')[0]);
      expect(screen.getByText(/Gesynchroniseerd/)).toBeTruthy();
      // wat naar de Worker ging, is onleesbaar
      expect(posts.every((p) => !p.data.includes('Aftersun'))).toBe(true);
    } finally { delete global.fetch; }
  });

  it('voor ons: scoren op eigen smaak en een eerlijke groepsranglijst', async () => {
    const { kiesKandidaten, informatieveRatings, scoorKandidaten, scoresUitKeuze, groepsRanglijst } = await import('../src/lib/samen.js');
    // kandidaten: films met filmdata eerst, hooguit het maximum, compact
    const pool = [{ key: 'a', name: 'A' }, { key: 'b', name: 'B' }, { key: 'c', name: 'C' }];
    const meta = { b: { id: 2, genres: ['Drama'], keywords: [{ id: 9, name: 'x' }], vote: 7.5, votes: 900 } };
    const k = kiesKandidaten(pool, meta, 2);
    expect(k).toHaveLength(2);
    expect(k[0]).toMatchObject({ key: 'b', id: 2, genres: ['Drama'], keywords: [9] });
    // de beoordelingen die het meest zeggen: de uitschieters eerst
    const r = informatieveRatings([{ key: 'm', rating: 3 }, { key: 'h', rating: 5 }, { key: 'l', rating: 0.5 }, { key: 'n', rating: 3.5 }], 2);
    expect(r.map((x) => x.key)).toEqual(['l', 'h']);
    // scoren: watchlist geeft een duw, al gezien wordt gemarkeerd
    const smaak = { genres: { Drama: 1 }, decades: {}, themes: {}, topThemes: [], nietEngels: 0.3, medianVotes: 1000 };
    const kand = [{ key: 'b', id: 2, genres: ['Drama'], vote: 7.5, votes: 900 }, { key: 'd', id: 4, genres: ['Horror'], vote: 7.5, votes: 900 }];
    const zonder = scoorKandidaten(kand, smaak);
    const met = scoorKandidaten(kand, smaak, { lijstIds: new Set([2]), gezienKeys: new Set(['d']) });
    expect(zonder.b.s).toBeGreaterThan(zonder.d.s);
    expect(met.b.s).toBe(Math.min(99, zonder.b.s + 12));
    expect(met.b.w).toBe(true);
    expect(met.d.g).toBe(true);
    expect(scoresUitKeuze(kand, ['d'])).toEqual({ b: { s: 40, w: false, g: false }, d: { s: 80, w: false, g: false } });
    // de ranglijst: niemand onder de ondergrens en niemand zag hem al gaat voor
    const films = [{ key: 'x', name: 'X' }, { key: 'y', name: 'Y' }, { key: 'z', name: 'Z' }];
    const lijst = groepsRanglijst(films, {
      Jij: { x: { s: 95 }, y: { s: 70 }, z: { s: 90 } },
      Sanne: { x: { s: 30 }, y: { s: 72 }, z: { s: 80, g: true } },
    });
    expect(lijst.map((x) => x.film.key)).toEqual(['y', 'x', 'z']);
    expect(lijst[1].ellende).toBe(true);
    expect(lijst[2].gezienDoor).toEqual(['Sanne']);
    expect(lijst[0].gemiddeld).toBe(71);
  });

  it('voor ons: de Worker bewaart alleen nette scores, per gast', async () => {
    const kv = new Map();
    const env = { SESSIONS: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); } }, TMDB_KEY: 'x' };
    const worker = (await import('../worker/worker.js')).default;
    const vraag = (pad, body) => worker.fetch(new Request(`https://w.dev${pad}`, body
      ? { method: 'POST', body: JSON.stringify(body), headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' } }
      : { headers: { Origin: 'http://localhost:5173' } }), env);
    const films = Array.from({ length: 70 }, (_, i) => ({ key: `f${i}`, name: `F${i}`, year: 2000, id: i + 1, genres: ['Drama'], keywords: [1, 2], vote: 7, votes: 100, extra: 'weg' }));
    const nieuw = await (await vraag('/session/new', { type: 'samen', films, host: 'Robin' })).json();
    expect(nieuw.versie).toBe(2);
    const opgeslagen = JSON.parse(kv.get(`s:${nieuw.code}`));
    expect(opgeslagen.type).toBe('samen');
    expect(opgeslagen.films).toHaveLength(60);
    expect(opgeslagen.films[0]).toMatchObject({ id: 1, genres: ['Drama'], keywords: [1, 2] });
    expect(opgeslagen.films[0].extra).toBeUndefined();
    // scores: alleen bekende films, afgerond en begrensd
    const ok = await vraag(`/session/${nieuw.code}/scores`, { player: 'Sanne', scores: { f0: { s: 87.6, w: 1 }, f1: { s: 250 }, onbekend: { s: 50 } } });
    expect(ok.status).toBe(200);
    const sessie = await (await vraag(`/session/${nieuw.code}`)).json();
    expect(sessie.scores).toEqual({ Sanne: { f0: { s: 88, w: true, g: false }, f1: { s: 100, w: false, g: false } } });
    // een gewone stemronde blijft zoals hij was
    const stem = await (await vraag('/session/new', { films: films.slice(0, 3), host: 'x' })).json();
    expect(JSON.parse(kv.get(`s:${stem.code}`)).films[0].genres).toBeUndefined();
  });

  it('voor ons: een gast zonder export tikt aan wat hij ziet zitten', async () => {
    history.pushState({}, '', '?samen=SAM234');
    const calls = [];
    global.fetch = async (url, opts) => {
      calls.push({ url: String(url), body: opts?.body });
      if (String(url).endsWith('/session/SAM234')) {
        return { ok: true, status: 200, json: async () => ({ type: 'samen', host: 'Robin', winner: null, scores: {}, films: [
          { key: 'w|2016', name: 'The Wailing', year: 2016, poster: null },
          { key: 'l|2008', name: 'Lake Mungo', year: 2008, poster: null },
        ] }) };
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    };
    try {
      localStorage.clear();
      localStorage.setItem('picker.settings', JSON.stringify({ lang: 'nl' }));
      render(<App />);
      expect(await screen.findByText('Robin kiest een film voor jullie samen')).toBeTruthy();
      expect(document.body.textContent).toContain('Je export blijft op deze telefoon');
      fireEvent.change(screen.getByLabelText('Je naam'), { target: { value: 'Pim' } });
      fireEvent.click(screen.getByText(/Geen export bij de hand/));
      fireEvent.click(screen.getByLabelText('Lake Mungo (2008)'));
      fireEvent.click(screen.getByText('Verstuur je stem'));
      expect(await screen.findByText('Verstuurd')).toBeTruthy();
      const post = calls.find((c) => c.url.includes('/scores'));
      expect(JSON.parse(post.body)).toEqual({ player: 'Pim', scores: {
        'w|2016': { s: 40, w: false, g: false }, 'l|2008': { s: 80, w: false, g: false },
      } });
    } finally {
      delete global.fetch;
      history.pushState({}, '', '/');
    }
  });

  it('voor ons: een gast laadt zijn export; alleen scores verlaten het toestel', async () => {
    history.pushState({}, '', '?samen=SAM234');
    const calls = [];
    const detail = (id, title, jaar, genres) => ({ id, title, release_date: `${jaar}-01-01`, runtime: 100, genres: genres.map((name) => ({ name })), vote_average: 7.5, vote_count: 5000, credits: { crew: [], cast: [] }, videos: { results: [] }, recommendations: { results: [] }, 'watch/providers': { results: {} }, keywords: { keywords: [] } });
    const films = { Drama1: [1, 2001, ['Drama']], Drama2: [2, 2002, ['Drama']], Horror1: [3, 2003, ['Horror']], Gezien: [4, 2004, ['Drama']] };
    global.fetch = async (url, opts) => {
      const u = String(url);
      calls.push({ url: u, body: opts?.body });
      if (u.endsWith('/session/SAM234')) {
        return { ok: true, status: 200, json: async () => ({ type: 'samen', host: 'Robin', winner: null, scores: {}, films: [
          { key: 'drama nieuw|2020', name: 'Drama Nieuw', year: 2020, genres: ['Drama'], vote: 7.5, votes: 5000 },
          { key: 'horror nieuw|2020', name: 'Horror Nieuw', year: 2020, genres: ['Horror'], vote: 7.5, votes: 5000 },
          { key: 'gezien|2004', name: 'Gezien', year: 2004, id: 4, genres: ['Drama'], vote: 7.5, votes: 5000 },
        ] }) };
      }
      const zoek = u.match(/search\/movie\?query=([^&]+)/);
      if (zoek) {
        const naam = decodeURIComponent(zoek[1].replace(/\+/g, ' '));
        const f = films[naam];
        return { ok: true, status: 200, json: async () => ({ results: f ? [{ id: f[0], title: naam, release_date: `${f[1]}-01-01`, vote_count: 5000 }] : [] }) };
      }
      const det = u.match(/\/movie\/(\d+)\?/);
      if (det) {
        const [naam, f] = Object.entries(films).find(([, v]) => v[0] === +det[1]);
        return { ok: true, status: 200, json: async () => detail(f[0], naam, f[1], f[2]) };
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    };
    try {
      localStorage.clear();
      localStorage.setItem('picker.settings', JSON.stringify({ lang: 'nl' }));
      render(<App />);
      expect(await screen.findByText('Robin kiest een film voor jullie samen')).toBeTruthy();
      fireEvent.change(screen.getByLabelText('Je naam'), { target: { value: 'Eef' } });
      const csv = 'Date,Name,Year,Letterboxd URI,Rating\n2026-01-01,Drama1,2001,x,5\n2026-01-02,Drama2,2002,x,4.5\n2026-01-03,Horror1,2003,x,1\n2026-01-04,Gezien,2004,x,4';
      const bestand = new File([csv], 'ratings.csv', { type: 'text/csv' });
      fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [bestand] } });
      expect(await screen.findByText('Verstuurd', {}, { timeout: 5000 })).toBeTruthy();
      const post = JSON.parse(calls.find((c) => c.url.includes('/scores')).body);
      expect(post.player).toBe('Eef');
      // drama past bij Eef beter dan horror; een film die Eef al beoordeelde is "gezien"
      expect(post.scores['drama nieuw|2020'].s).toBeGreaterThan(post.scores['horror nieuw|2020'].s);
      expect(post.scores['gezien|2004'].g).toBe(true);
      // de export zelf gaat nergens heen: geen enkele aanvraag bevat de ratings
      expect(calls.some((c) => c.body && c.body.includes('Drama1'))).toBe(false);
      expect(document.body.textContent).toContain('Wat het best bij jou past');
    } finally {
      delete global.fetch;
      history.pushState({}, '', '/');
    }
  });

  it('voor ons: de gastheer ziet de ranglijst en kiest; het kaartje draagt alle namen', async () => {
    const calls = [];
    global.fetch = async (url, opts) => {
      const u = String(url);
      calls.push({ url: u, body: opts?.body });
      if (u.endsWith('/session/new')) return { ok: true, status: 200, json: async () => ({ code: 'SAM777', versie: 2 }) };
      if (u.endsWith('/session/SAM777')) {
        return { ok: true, status: 200, json: async () => ({ type: 'samen', host: 'Robin', winner: null, films: [], scores: {
          Sanne: { 'a|2020': { s: 90, w: true, g: false }, 'b|2021': { s: 20, w: false, g: false }, 'c|2022': { s: 60, w: false, g: false } },
        } }) };
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    };
    try {
      localStorage.clear();
      localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
      localStorage.setItem('picker.watchlist', JSON.stringify([
        { key: 'a|2020', name: 'A', year: 2020 }, { key: 'b|2021', name: 'B', year: 2021 }, { key: 'c|2022', name: 'C', year: 2022 },
      ]));
      render(<App />);
      fireEvent.click(screen.getAllByText('Filmavond')[0]);
      fireEvent.change(screen.getAllByLabelText('Je naam')[0], { target: { value: 'Robin' } });
      fireEvent.click(screen.getByText('Start Voor ons'));
      expect(await screen.findByText('Code: SAM777')).toBeTruthy();
      const nieuw = JSON.parse(calls.find((c) => c.url.endsWith('/session/new')).body);
      expect(nieuw.type).toBe('samen');
      expect(nieuw.host).toBe('Robin');
      expect(await screen.findByText('Doen mee: Robin, Sanne', {}, { timeout: 8000 })).toBeTruthy();
      expect(screen.getByText('Voor jullie samen')).toBeTruthy();
      expect(screen.getByText('Op de watchlist van Sanne')).toBeTruthy();
      // bovenaan staat A (Sanne 90, op haar lijst); B zakt (Sanne 20)
      const titels = [...document.querySelectorAll('.samen-titel')].map((t) => t.textContent);
      expect(titels[0]).toBe('A (2020)');
      expect(titels[titels.length - 1]).toBe('B (2021)');
      fireEvent.click(screen.getAllByText('Deze kijken we')[0]);
      const kaartje = await waitFor(() => { const k = document.querySelector('.kaartje'); if (!k) throw new Error('nog niet'); return k; });
      expect(kaartje.textContent).toContain('ROBIN, SANNE');
      expect(kaartje.textContent).toContain('TOEGANG 2 PERSONEN');
      expect(JSON.parse(calls.find((c) => c.url.includes('/close')).body).winner).toBe('a|2020');
      const k = JSON.parse(localStorage.getItem('picker.kaartjes'));
      expect(k[0]).toMatchObject({ key: 'a|2020', bron: 'samen', personen: 2, namen: ['Robin', 'Sanne'] });
    } finally {
      delete global.fetch;
    }
  });

  it('voor ons: een oude Worker zegt eerlijk dat hij bijgewerkt moet worden', async () => {
    global.fetch = async (url) => (String(url).endsWith('/session/new')
      ? { ok: true, status: 200, json: async () => ({ code: 'OUD234' }) }
      : { ok: true, status: 200, json: async () => ({}) });
    try {
      localStorage.clear();
      localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
      localStorage.setItem('picker.watchlist', JSON.stringify([{ key: 'a|2020', name: 'A', year: 2020 }, { key: 'b|2021', name: 'B', year: 2021 }]));
      render(<App />);
      fireEvent.click(screen.getAllByText('Filmavond')[0]);
      fireEvent.click(screen.getByText('Start Voor ons'));
      expect(await screen.findByText(/Voor ons is op dit moment niet beschikbaar/)).toBeTruthy();
    } finally {
      delete global.fetch;
    }
  });

  it('op afstand: deellink toont het stemscherm en verstuurt een stem', async () => {
    history.pushState({}, '', '?avond=ABC234');
    const calls = [];
    global.fetch = async (url, opts) => {
      calls.push({ url: String(url), body: opts?.body });
      if (String(url).endsWith('/session/ABC234')) {
        return { ok: true, status: 200, json: async () => ({ host: 'Sam', winner: null, votes: {}, films: [
          { key: 'w|2016', name: 'The Wailing', year: 2016, poster: null },
          { key: 'l|2008', name: 'Lake Mungo', year: 2008, poster: null },
        ] }) };
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    };
    try {
      localStorage.clear();
      localStorage.setItem('picker.settings', JSON.stringify({ lang: 'nl' }));
      render(<App />);
      expect(await screen.findByText('Sam wil samen een film kiezen')).toBeTruthy();
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
      if (u.endsWith('/session/QQQ777')) return { ok: true, status: 200, json: async () => ({ host: 'Sam', winner: null, films: [], votes: { Pim: ['a|2020'], Eef: ['a|2020', 'b|2021'] } }) };
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    };
    try {
      localStorage.clear();
      localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
      localStorage.setItem('picker.watchlist', JSON.stringify([
        { key: 'a|2020', name: 'A', year: 2020 }, { key: 'b|2021', name: 'B', year: 2021 }, { key: 'c|2022', name: 'C', year: 2022 },
      ]));
      render(<App />);
      fireEvent.click(screen.getAllByText('Filmavond')[0]);
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
      localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
      localStorage.setItem('picker.watchlist', JSON.stringify([
        { key: 'a|2020', name: 'A', year: 2020 }, { key: 'b|2021', name: 'B', year: 2021 },
      ]));
      render(<App />);
      fireEvent.click(screen.getAllByText('Filmavond')[0]);
      fireEvent.click(screen.getByText('Start stemronde op afstand'));
      expect(await screen.findByText(/Stemrondes op afstand zijn op dit moment niet beschikbaar/)).toBeTruthy();
    } finally {
      delete global.fetch;
    }
  });

  it('profielen: aanmaken, boekhouding en verwijderen ruimt alles op', async () => {
    const { listProfiles, addProfile, deleteProfile, currentProfile, switchProfile } = await import('../src/lib/storage.js');
    localStorage.clear();
    expect(currentProfile()).toBe('');
    expect(addProfile('Eef')).toBe(true);
    expect(addProfile('Eef')).toBe(false); // dubbele naam
    expect(addProfile('raar.punt')).toBe(false); // punt is ons scheidingsteken
    expect(addProfile('')).toBe(false);
    expect(listProfiles()).toEqual(['Eef']);
    // wisselen zet de globale sleutel (de herlaad wordt in jsdom gevangen)
    switchProfile('Eef');
    expect(localStorage.getItem('picker.activeProfile')).toBe('Eef');
    switchProfile('');
    // data van Eef simuleren; verwijderen ruimt sleutels en boekhouding op
    localStorage.setItem('picker.p.Eef.watchlist', '[]');
    localStorage.setItem('picker.p.Eef.settings', '{}');
    deleteProfile('Eef');
    expect(listProfiles()).toEqual([]);
    expect(localStorage.getItem('picker.p.Eef.watchlist')).toBeNull();
    expect(localStorage.getItem('picker.p.Eef.settings')).toBeNull();
  });

  it('profielen: een back-up van Standaard bevat geen andere profielen of globale sleutels', async () => {
    const { exportAll } = await import('../src/lib/storage.js');
    localStorage.clear();
    localStorage.setItem('picker.watchlist', '[{"key":"a|1"}]');
    localStorage.setItem('picker.p.Eef.watchlist', '[{"key":"x|9"}]');
    localStorage.setItem('picker.activeProfile', '');
    localStorage.setItem('picker.profiles', '["Eef"]');
    const dump = JSON.parse(exportAll({}));
    const keys = Object.keys(dump.data);
    expect(keys).toContain('picker.watchlist');
    expect(keys.some((k) => k.includes('.p.'))).toBe(false);
    expect(keys).not.toContain('picker.activeProfile');
    expect(keys).not.toContain('picker.profiles');
  });

  it('omdb-kaart: status telt de missende scores en biedt de ophaal-knop', () => {
    localStorage.clear();
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl', omdbKeys: ['aaaa1111'] }));
    localStorage.setItem('picker.watchlist', JSON.stringify([
      { key: 'a|2020', name: 'A', year: 2020 }, { key: 'b|2021', name: 'B', year: 2021 },
    ]));
    localStorage.setItem('picker.meta', JSON.stringify({
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
    const { smartSimilar } = await import('../src/lib/similar.js');
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
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('picker.watchlist', JSON.stringify([
      { key: 'a|2020', name: 'A', year: 2020 }, { key: 'aftersun|2022', name: 'Aftersun', year: 2022 },
    ]));
    localStorage.setItem('picker.meta', JSON.stringify({
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
      fireEvent.click(screen.getAllByLabelText('Archief')[0]);
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
    const { imdbLink, jwLink } = await import('../src/lib/links.js');
    expect(imdbLink({ imdbId: 'tt1234567' }, { name: 'X' })).toBe('https://www.imdb.com/title/tt1234567/');
    expect(imdbLink(null, { name: 'Aftersun', year: 2022 })).toContain('imdb.com/find/?q=Aftersun%202022');
    expect(jwLink({ jwLink: 'https://www.justwatch.com/nl/film/aftersun' }, { name: 'Aftersun' })).toContain('/nl/film/aftersun');
    expect(jwLink(null, { name: 'Aftersun' })).toContain('justwatch.com/nl/search?q=Aftersun');
  });

  it('zoeken: een gezien-en-gelogde film zegt "Al gezien" met jouw sterren, niet "in je collectie"', async () => {
    localStorage.clear();
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('picker.watchlist', JSON.stringify([{ key: 'a|2020', name: 'A', year: 2020 }]));
    // handmatig gezien via de tool (dus n\u00edet in watchedLb) + eigen rating
    localStorage.setItem('picker.seen', JSON.stringify(['aftersun|2022']));
    localStorage.setItem('picker.ownRatings', JSON.stringify({ 'aftersun|2022': { rating: 4, name: 'Aftersun', year: 2022, at: 1 } }));
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
      // standaard staat "Verberg al gezien" aan: de film is weg, met een telling
      expect(await screen.findByText(/1 al gezien verborgen/)).toBeTruthy();
      expect(screen.queryByText(/Al gezien · jij gaf/)).toBeNull();
      // knop uit: de film is terug, met jouw sterren
      fireEvent.click(screen.getByText('Verberg al gezien'));
      expect(await screen.findByText(/Al gezien · jij gaf 4,0 ★/)).toBeTruthy();
      expect(document.body.textContent).not.toContain('Al in je collectie');
      // de keuze wordt onthouden
      expect(JSON.parse(localStorage.getItem('picker.verbergGezien'))).toBe(false);
    } finally {
      delete global.fetch;
    }
  });

  it('al gezien: herkenning met speling op leestekens, accenten en festivaljaar', async () => {
    const { maakHerkenner, normTitel } = await import('../src/lib/gezien.js');
    expect(normTitel('The Hunger Games: Mockingjay – Part 2')).toBe(normTitel('The Hunger Games: Mockingjay - Part 2'));
    expect(normTitel('Amélie')).toBe('amelie');
    const ken = maakHerkenner(['the witch|2015', 'the hunger games: mockingjay – part 2|2015', 'amélie|2001'], [42]);
    expect(ken({ id: 1, title: 'The Witch', year: 2016 })).toBe(true); // festivaljaar
    expect(ken({ id: 2, title: 'The Hunger Games: Mockingjay - Part 2', year: 2015 })).toBe(true); // leesteken
    expect(ken({ id: 3, title: 'Amelie', year: 2001 })).toBe(true); // accent
    expect(ken({ id: 4, title: 'Something', orig: 'Amélie', year: 2001 })).toBe(true); // originele titel
    expect(ken({ id: 42, title: 'Heel Anders', year: 1990 })).toBe(true); // TMDB-id
    expect(ken({ id: 5, title: 'The Witch', year: 2019 })).toBe(false); // ander jaar: andere film
    expect(ken({ id: 6, title: 'The Witches', year: 2015 })).toBe(false);
  });

  it('voor jou: een al geziene film met net ander jaar of leesteken komt niet terug', async () => {
    const { scoorKandidaten, bepaalSeeds } = await import('../src/lib/kandidaten.js');
    const { buildTaste } = await import('../src/lib/taste.js');
    const f = (id, title, year) => ({ id, title, year, vote: 7.5, votes: 2000, genre_ids: [18] });
    const meta = {
      'a|2000': { id: 1, genres: ['Drama'], recs: [f(10, 'The Witch', 2016), f(11, 'Mockingjay - Part 2', 2015), f(12, 'Verse Film', 2012)] },
      'b|2001': { id: 2, genres: ['Drama'], recs: [] },
      'c|2002': { id: 3, genres: ['Drama'], recs: [] },
    };
    const ratedFilms = [
      { key: 'a|2000', name: 'A', year: 2000, rating: 5 }, { key: 'b|2001', name: 'B', year: 2001, rating: 5 },
      { key: 'c|2002', name: 'C', year: 2002, rating: 4.5 },
    ];
    // gelogd op Letterboxd (watched.csv), zonder filmdata
    const seenSet = new Set(['the witch|2015', 'mockingjay – part 2|2015']);
    const seeds = bepaalSeeds({ watchlist: [], ratedFilms, meta });
    const titels = scoorKandidaten({
      watchlist: [], meta, ratedFilms, seenSet, seeds, regisseurs: [], taste: buildTaste({ watchlist: [], ratedFilms, meta }),
    }).recs.map((r) => r.title);
    expect(titels).toEqual(['Verse Film']);
  });

  it('imdb-link uit een lijst gaat na de klik direct naar de titelpagina', async () => {
    const { default: ImdbA } = await import('../src/components/ImdbA.jsx');
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
    const { usePoll } = await import('../src/lib/usePoll.js');
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
