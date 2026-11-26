// Je Letterboxd-export opnieuw laden, en verkeerde films opsporen (versie 6.2)
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup, waitFor, within } from '@testing-library/react';
import JSZip from 'jszip';
import App from '../src/App.jsx';
import { seed } from './helpers.jsx';

const KOP = {
  watchlist: 'Date,Name,Year,Letterboxd URI',
  ratings: 'Date,Name,Year,Letterboxd URI,Rating',
  diary: 'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date',
  reviews: 'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date',
};
const rij = (...v) => v.join(',');
// Een export zoals Letterboxd hem maakt: bovenin de echte bestanden, en mappen
// met bestanden van dezelfde naam (deleted/, orphaned/, likes/)
const echteExport = () => ({
  'profile.csv': 'Date Joined,Username,Given Name\n2020-01-01,robin,Robin',
  'watchlist.csv': `${KOP.watchlist}\n${rij('2026-11-01', 'Aftersun', 2022, 'https://boxd.it/a')}\n${rij('2026-11-02', 'Close', 2022, 'https://boxd.it/c')}`,
  'watched.csv': `${KOP.watchlist}\n${rij('2026-10-01', 'Stalker', 1979, 'https://boxd.it/s')}\n${rij('2026-10-05', 'Whiplash', 2014, 'https://boxd.it/w')}`,
  'ratings.csv': `${KOP.ratings}\n${rij('2026-10-01', 'Stalker', 1979, 'https://boxd.it/s', 4)}\n${rij('2026-10-05', 'Whiplash', 2014, 'https://boxd.it/w', 3.5)}\n${rij('2026-10-06', 'Columbus', 2017, 'https://boxd.it/co', 5)}`,
  'diary.csv': `${KOP.diary}\n${rij('2026-10-01', 'Stalker', 1979, 'https://boxd.it/s1', 4, '', '', '2026-10-01')}\n${rij('2026-10-05', 'Whiplash', 2014, 'https://boxd.it/w1', 3.5, 'Yes', '', '2026-10-04')}`,
  'reviews.csv': `${KOP.reviews}\n${rij('2026-10-01', 'Stalker', 1979, 'https://boxd.it/s1', 1, '', 'Lang', '', '2026-10-01')}`,
  'comments.csv': 'Date,Content,Comment\n2026-10-01,x,y',
  'deleted/diary.csv': KOP.diary,
  'deleted/reviews.csv': KOP.reviews,
  'orphaned/diary.csv': KOP.diary,
  'likes/films.csv': `${KOP.watchlist}\n${rij('2026-09-01', 'Heat', 1995, 'https://boxd.it/h')}`,
  'lists/spooky-season.csv': 'Letterboxd list export v7\nDate,Name,Tags,URL,Description\n2026-05-01,Spooky Season,,https://l,\n\nPosition,Name,Year,URL,Description\n1,The Wailing,2016,https://a,',
  'deleted/lists/oud.csv': 'Letterboxd list export v7\nDate,Name,Tags,URL,Description\n2026-01-01,Weg,,https://l,\n\nPosition,Name,Year,URL,Description\n1,Heat,1995,https://a,',
});
async function alsZip(bestanden, naam = 'letterboxd-robin-2026-11-06-19-17-utc.zip', map = '') {
  const zip = new JSZip();
  Object.entries(bestanden).forEach(([pad, tekst]) => zip.file(map + pad, tekst));
  return new File([await zip.generateAsync({ type: 'blob' })], naam);
}
const alsCsv = (naam, tekst) => new File([tekst], naam);

describe('Je export opnieuw laden', () => {
  beforeEach(() => {
    cleanup(); seed();
    global.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });
  });
  afterEach(() => { delete global.fetch; });

  it('de ZIP: het echte dagboek, niet de lege uit deleted/ en orphaned/, en geen likes of gewiste lijsten', async () => {
    const { parseLetterboxdFiles } = await import('../src/lib/csv.js');
    const res = await parseLetterboxdFiles([await alsZip(echteExport())]);
    expect(res.diary).toHaveLength(2);
    expect(res.diary[1]).toMatchObject({ key: 'whiplash|2014', watchedDate: '2026-10-04', rewatch: true });
    expect(res.watchlist.map((f) => f.name)).toEqual(['Aftersun', 'Close']);
    expect(Object.keys(res.ratings.map)).toHaveLength(3);
    expect(res.lists.map((l) => l.naam)).toEqual(['Spooky Season']);
    // van wie en van wanneer, uit de bestandsnaam
    expect(res.export).toEqual({ naam: 'robin', datum: '2026-11-06T19:17:00Z' });
    // zelf opnieuw ingepakt, met een map eromheen: hetzelfde
    const ingepakt = await parseLetterboxdFiles([await alsZip(echteExport(), 'mijn-export.zip', 'letterboxd-robin/')]);
    expect(ingepakt.diary).toHaveLength(2);
    expect(ingepakt.lists).toHaveLength(1);
    // zonder bestandsnaam: de nieuwste datum erin
    expect(ingepakt.export).toEqual({ naam: null, datum: '2026-11-02T00:00:00Z' });
  });

  it('losse CSV’s (zoals na uitpakken): reviews.csv vervangt je sterren niet, diary.csv is je dagboek', async () => {
    const { parseLetterboxdFiles } = await import('../src/lib/csv.js');
    const ex = echteExport();
    const los = ['comments.csv', 'diary.csv', 'profile.csv', 'ratings.csv', 'reviews.csv', 'watched.csv', 'watchlist.csv'].map((n) => alsCsv(n, ex[n]));
    const res = await parseLetterboxdFiles(los);
    expect(Object.keys(res.ratings.map)).toHaveLength(3);
    expect(res.ratings.map['stalker|1979']).toBe(4); // niet de 1 uit reviews.csv
    expect(res.diary).toHaveLength(2);
    expect(res.watchlist).toHaveLength(2);
    expect(res.overgeslagen).toEqual(['comments.csv', 'profile.csv', 'reviews.csv']);
    // alleen diary.csv: je dagboek, niet je sterren
    const alleenDagboek = await parseLetterboxdFiles([alsCsv('diary.csv', ex['diary.csv'])]);
    expect(alleenDagboek.diary).toHaveLength(2);
    expect(alleenDagboek.ratings).toBeUndefined();
    // een tweede download, en een onbekend bestand dat op een watchlist lijkt
    const tweede = await parseLetterboxdFiles([alsCsv('watchlist (1).csv', ex['watchlist.csv']), alsCsv('films.csv', ex['likes/films.csv'])]);
    expect(tweede.watchlist.map((f) => f.name)).toEqual(['Aftersun', 'Close']);
    expect(tweede.overgeslagen).toEqual(['films.csv']);
  });

  it('het dagboek gaat samen: Letterboxd live houdt zijn TMDB-nummer, logs van na de export blijven', async () => {
    const { pasExportToe } = await import('../src/lib/csv.js');
    const huidig = {
      diary: [
        { key: 'stalker|1979', name: 'Stalker', year: 1979, watchedDate: '2026-10-01', rating: 4, tmdbId: 1398 },
        { key: 'heat|1995', name: 'Heat', year: 1995, watchedDate: '2026-09-20', rating: 3, tmdbId: 949 }, // op Letterboxd gewist
        { key: 'close|2022', name: 'Close', year: 2022, watchedDate: '2026-11-20', rating: 4.5, tmdbId: 1100 }, // na de export
      ],
      ownRatings: { 'columbus|2017': { rating: 4 }, 'aftersun|2022': { rating: 5 } },
    };
    const res = {
      export: { naam: 'robin', datum: '2026-11-06T19:17:00Z' },
      diary: [
        { key: 'stalker|1979', name: 'Stalker', year: 1979, watchedDate: '2026-10-01', rating: 4.5, rewatch: false },
        { key: 'whiplash|2014', name: 'Whiplash', year: 2014, watchedDate: '2026-10-04', rating: 3.5, rewatch: true },
      ],
      watched: [{ key: 'stalker|1979', name: 'Stalker', year: 1979 }, { key: 'whiplash|2014', name: 'Whiplash', year: 2014 }],
      ratings: { map: { 'stalker|1979': 4.5, 'columbus|2017': 5 }, films: [{ key: 'stalker|1979', rating: 4.5 }, { key: 'columbus|2017', rating: 5 }] },
      watchlist: [{ key: 'aftersun|2022', name: 'Aftersun', year: 2022 }],
    };
    const uit = pasExportToe(huidig, res);
    expect(uit.diary.map((d) => d.key)).toEqual(['stalker|1979', 'whiplash|2014', 'close|2022']);
    expect(uit.diary[0]).toMatchObject({ rating: 4.5, tmdbId: 1398 }); // de export wint, het nummer blijft
    expect(uit.watchedLb).toEqual(['stalker|1979', 'whiplash|2014', 'close|2022']);
    expect(uit.ratings).toEqual({ 'stalker|1979': 4.5, 'columbus|2017': 5, 'close|2022': 4.5 });
    // eigen sterren voor wat Letterboxd nu kent, gaan eruit
    expect(Object.keys(uit.ownRatings)).toEqual(['aftersun|2022']);
    expect(uit.lbExport).toEqual({ naam: 'robin', datum: '2026-11-06T19:17:00Z', films: 1 });
  });

  it('een export van een ander, of een oudere: eerst de vraag', async () => {
    const { exportTwijfel } = await import('../src/lib/csv.js');
    const vorige = { naam: 'robin', datum: '2026-11-06T19:17:00Z' };
    expect(exportTwijfel({ naam: 'sam', datum: '2026-11-20T10:00:00Z' }, vorige)).toMatchObject({ soort: 'ander', naam: 'sam', eigen: 'robin' });
    expect(exportTwijfel({ naam: 'Robin', datum: '2026-09-29T19:03:00Z' }, vorige)).toMatchObject({ soort: 'ouder' });
    expect(exportTwijfel({ naam: 'robin', datum: '2026-11-06T08:00:00Z' }, vorige)).toBeNull(); // dezelfde dag
    expect(exportTwijfel({ naam: 'sam', datum: '2026-11-20T10:00:00Z' }, null, 'robin')).toMatchObject({ soort: 'ander' }); // Letterboxd live
    expect(exportTwijfel({ naam: 'sam', datum: '2026-11-20T10:00:00Z' }, null, null)).toBeNull(); // niets om mee te vergelijken
  });

  it('Setup: van wanneer je watchlist is, en een oudere export laadt pas na ja', async () => {
    localStorage.setItem('picker.lbExport', JSON.stringify({ naam: 'robin', datum: '2026-11-06T19:17:00Z', films: 6 }));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Setup')[0]);
    const kaart = document.querySelector('[data-uitleg="setup-laden"]');
    expect(kaart.textContent).toContain('Je watchlist komt uit je Letterboxd-export van 6 november 2026: 6 films.');
    expect(within(kaart).getByText('Nieuwe export laden')).toBeTruthy();
    expect(kaart.textContent).not.toContain('Sleep je Letterboxd-export hierheen');
    const kies = kaart.querySelector('input[type="file"]');

    // een oude export uit je Downloads: de vraag, en nee laat alles staan
    fireEvent.change(kies, { target: { files: [await alsZip(echteExport(), 'letterboxd-robin-2026-09-29-19-03-utc.zip')] } });
    let vraag = await screen.findByRole('alertdialog');
    expect(vraag.textContent).toContain('Deze export is van 29 september 2026, je vorige van 6 november 2026');
    fireEvent.click(within(vraag).getByText('Annuleren'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(JSON.parse(localStorage.getItem('picker.watchlist'))).toHaveLength(6);

    // de export van een vriend
    fireEvent.change(kies, { target: { files: [await alsZip(echteExport(), 'letterboxd-sam-2026-11-20-10-00-utc.zip')] } });
    vraag = await screen.findByRole('alertdialog');
    expect(vraag.textContent).toContain('Deze export is van sam, niet van robin');
    fireEvent.click(within(vraag).getByText('Annuleren'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

    // je nieuwe export: geen vraag, en het verslag telt het dagboek mee
    fireEvent.change(kies, { target: { files: [await alsZip(echteExport(), 'letterboxd-robin-2026-11-20-10-00-utc.zip')] } });
    expect(await within(kaart).findByText(/2 nieuwe logs in je dagboek/)).toBeTruthy();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(JSON.parse(localStorage.getItem('picker.diary'))).toHaveLength(2);
    expect(JSON.parse(localStorage.getItem('picker.watchlist')).map((f) => f.key)).toEqual(['aftersun|2022', 'close|2022']);
    expect(JSON.parse(localStorage.getItem('picker.lbExport'))).toMatchObject({ naam: 'robin', datum: '2026-11-20T10:00:00Z', films: 2 });
    await waitFor(() => expect(kaart.textContent).toContain('export van 20 november 2026: 2 films'));
  });

  it('sync: een nieuwe export op de laptop en een log op de telefoon gaan allebei mee', async () => {
    if (!globalThis.crypto?.subtle) {
      const { webcrypto } = await import('node:crypto');
      Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
    }
    const { synchroniseer, maakCode } = await import('../src/lib/sync.js');
    const code = maakCode();
    let doc = null;
    const server = {
      haal: async () => doc,
      zet: async (_, data, basis) => { if (doc && basis !== doc.at) throw new Error('CONFLICT'); doc = { at: (doc?.at || 0) + 1, data }; return { ok: true, at: doc.at }; },
    };
    const opslag = (start) => { const m = new Map(Object.entries(start)); return { lees: (s) => (m.has(s) ? m.get(s) : null), schrijf: (s, v) => m.set(s, v), m }; };
    const laptop = opslag({ watchlist: [{ key: 'a' }, { key: 'b' }], watchedLb: ['x'], ratings: { x: 3 } });
    const telefoon = opslag({});
    let sL = (await synchroniseer(code, { opslag: laptop, server, nu: 1000 })).staat;
    let sT = (await synchroniseer(code, { opslag: telefoon, server, nu: 1100 })).staat;
    // 20:00 de laptop laadt een verse export: c op de watchlist, x nu 4 sterren
    laptop.schrijf('watchlist', [{ key: 'a' }, { key: 'b' }, { key: 'c' }]);
    laptop.schrijf('ratings', { x: 4 });
    sL = (await synchroniseer(code, { opslag: laptop, staat: { ...sL, gewijzigd: { watchlist: 2000, letterboxd: 2000 } }, server, nu: 2100 })).staat;
    // 20:30 de telefoon gaat open en Letterboxd live vindt een log (y), vóór de sync
    telefoon.schrijf('watchedLb', ['x', 'y']);
    telefoon.schrijf('ratings', { x: 3, y: 5 });
    sT = (await synchroniseer(code, { opslag: telefoon, staat: { ...sT, gewijzigd: { letterboxd: 3000 } }, server, nu: 3100 })).staat;
    await synchroniseer(code, { opslag: laptop, staat: sL, server, nu: 3200 });
    for (const app of [laptop, telefoon]) {
      expect(app.m.get('watchlist').map((f) => f.key)).toEqual(['a', 'b', 'c']);
      expect(app.m.get('watchedLb')).toEqual(['x', 'y']);
      expect(app.m.get('ratings')).toEqual({ x: 3, y: 5 }); // bij verschil wint de laatste wijziging
    }
    expect(sT.basis.watchlist).toBeTruthy();
  });
});

describe('Verkeerde films opsporen', () => {
  const zoekRes = { results: [
    { id: 111, title: 'Leviathan', release_date: '1989-03-17', poster_path: null, vote_average: 5.9, vote_count: 20000, original_language: 'en' },
    { id: 222, title: 'Leviathan', original_title: 'Левиафан', release_date: '2014-09-25', poster_path: null, vote_average: 7.6, vote_count: 900, original_language: 'ru' },
  ] };
  let vragen;
  beforeEach(() => {
    cleanup(); seed();
    vragen = [];
    global.fetch = async (url) => {
      const u = String(url);
      vragen.push(u);
      if (u.includes('/search/movie')) return { ok: true, status: 200, json: async () => (u.includes('query=Leviafan') ? { results: [] } : zoekRes) };
      if (u.includes('/credits')) return { ok: true, status: 200, json: async () => ({ crew: [{ job: 'Director', name: u.includes('/222/') ? 'Andrey Zvyagintsev' : 'George P. Cosmatos' }] }) };
      return { ok: true, status: 200, json: async () => ({}) };
    };
    const meta = JSON.parse(localStorage.getItem('picker.meta'));
    // Stalker staat op de verkeerde film; Close is een korte film met een oud vlaggetje
    meta['stalker|1979'] = { ...meta['stalker|1979'], id: 111, year: 1989, yearMismatch: 1979, mismatchType: 'year' };
    meta['close|2022'] = { ...meta['close|2022'], runtime: 15, yearMismatch: 2022, mismatchType: 'short' };
    // een beoordeelde film buiten je watchlist, ook verkeerd gekoppeld
    meta['petite maman|2021'] = { id: 111, title: 'Leviathan', year: 1989, yearMismatch: 2021, mismatchType: 'year', at: Date.now() };
    localStorage.setItem('picker.meta', JSON.stringify(meta));
  });
  afterEach(() => { delete global.fetch; });

  it('korte films zijn geen twijfelgeval meer, ook niet op de filmkaart', async () => {
    const { default: Winner } = await import('../src/components/Winner.jsx');
    const meta = JSON.parse(localStorage.getItem('picker.meta'));
    const { unmount } = render(<Winner film={{ key: 'close|2022', name: 'Close', year: 2022 }} meta={meta['close|2022']} />);
    expect(document.querySelector('.wwaarschuwing')).toBeNull();
    unmount();
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Setup')[0]);
    // Stalker en Petite maman (beoordeeld), niet Close
    expect(screen.getByText('2 films met afwijkend jaar, kies de juiste')).toBeTruthy();
    expect(screen.queryByText(/korte film/)).toBeNull();
  });

  it('"Deze klopt" onthoudt het, en de regisseur en de originele titel staan erbij', async () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Setup')[0]);
    fireEvent.click(screen.getByText(/afwijkend jaar/));
    // eerst gezocht met het jaar van Letterboxd erbij
    await screen.findByLabelText(/Kies Leviathan \(2014\)/);
    expect(vragen.some((u) => u.includes('/search/movie') && u.includes('year=1979'))).toBe(true);
    expect(await screen.findByText('Regie: Andrey Zvyagintsev')).toBeTruthy();
    expect(screen.getByText('Левиафан')).toBeTruthy();
    // Stalker: overslaan; Petite maman: de huidige klopt (zeg)
    fireEvent.click(screen.getByText('Sla over'));
    await screen.findByText(/Op Letterboxd heet hij Petite maman/);
    fireEvent.click(screen.getByText('Deze klopt'));
    // de laatste: de zoeker gaat dicht, en er staat er nog één open
    expect(await screen.findByText('1 film met afwijkend jaar, kies de juiste')).toBeTruthy();
    expect(screen.queryByText(/Op Letterboxd heet hij/)).toBeNull();
    const meta = JSON.parse(localStorage.getItem('picker.meta'));
    expect(meta['petite maman|2021'].yearMismatch).toBeUndefined();
    expect(meta['petite maman|2021'].handmatig).toBe(true);
  });

  it('zoeken op een andere titel, en een beoordeelde film zonder film eraf', async () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Setup')[0]);
    fireEvent.click(screen.getByText(/afwijkend jaar/));
    await screen.findByLabelText(/Kies Leviathan \(2014\)/);
    fireEvent.change(screen.getByLabelText('Zoek op een andere titel'), { target: { value: 'Leviafan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Zoek' }));
    expect(await screen.findByText(/Geen film gevonden voor "Leviafan"/)).toBeTruthy();
    fireEvent.click(screen.getByText('Sla over'));
    await screen.findByText(/Op Letterboxd heet hij Petite maman/);
    fireEvent.click(screen.getByText('Hoort niet op mijn filmlijst'));
    expect(await screen.findByText('1 film met afwijkend jaar, kies de juiste')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('picker.meta'))['petite maman|2021']).toBeNull();
    // niet op de lijst met "geen film": die is voor je watchlist
    expect(JSON.parse(localStorage.getItem('picker.ignored') || '[]')).toEqual([]);
  });

  it('opnieuw ophalen laat je eigen keuze en je scores staan, en vervangt niets door niets', async () => {
    const { naOphalen } = await import('../src/app/useVerrijking.js');
    const oud = { id: 5, title: 'A', ext: { imdb: 7.1 }, handmatig: true, yearMismatch: 1999, mismatchType: 'year' };
    expect(naOphalen(oud, null)).toBe(oud);
    expect(naOphalen(undefined, null)).toBeNull();
    expect(naOphalen(oud, { id: 5, title: 'A nieuw' })).toEqual({ id: 5, title: 'A nieuw', ext: { imdb: 7.1 }, handmatig: true });
    expect(naOphalen(oud, { id: 6, title: 'B' })).toEqual({ id: 6, title: 'B' });

    // in de app: een handmatige keuze haalt de tool op zijn TMDB-nummer op.
    // Deze nep-TMDB vindt niets: geen zoekresultaten, en lege filmdata.
    global.fetch = async (url) => { vragen.push(String(url)); return { ok: true, status: 200, json: async () => ({}) }; };
    const meta = JSON.parse(localStorage.getItem('picker.meta'));
    meta['whiplash|2014'] = { ...meta['whiplash|2014'], id: 4242, handmatig: true, ext: { imdb: 8.5, at: 1 } };
    localStorage.setItem('picker.meta', JSON.stringify(meta));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Setup')[0]);
    fireEvent.click(screen.getByText('Filmdata (opnieuw) ophalen'));
    await waitFor(() => expect(vragen.some((u) => u.includes('/movie/4242?'))).toBe(true));
    await waitFor(() => expect(screen.getByText('Filmdata (opnieuw) ophalen')).toBeTruthy());
    expect(vragen.some((u) => u.includes('/search/movie') && u.includes('Whiplash'))).toBe(false);
    const na = JSON.parse(localStorage.getItem('picker.meta'));
    // niets gevonden (de nep-TMDB kent niets): alles staat er nog, met scores
    expect(na['whiplash|2014']).toMatchObject({ id: 4242, handmatig: true, ext: { imdb: 8.5 } });
    expect(na['aftersun|2022']).toMatchObject({ id: 1000, ext: { imdb: 7.8 } });
  });
});
