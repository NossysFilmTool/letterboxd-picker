// Versie 6: opslag, hoofdfilm, het foutlogboek, de naam, adressen per scherm en hoe kiezen jullie.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, screen, cleanup, within, waitFor, act } from '@testing-library/react';
import App from '../src/App.jsx';
import { seed } from './helpers.jsx';

describe('reparaties: opslag, hoofdfilm, programma', () => {
  beforeEach(() => { cleanup(); seed(); });

  it('terugzetten: een verkeerd bestand geeft een melding; een goede back-up vraagt eerst en vervangt dan', async () => {
    localStorage.setItem('picker.sync', JSON.stringify({ code: 'eigen-koppeling' }));
    localStorage.setItem('picker.foutlog', JSON.stringify([{ at: 1, bron: 'x', tekst: 'y' }]));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Setup')[0]);
    const invoer = document.querySelector('input[type="file"][accept=".json"]');
    fireEvent.change(invoer, { target: { files: [new File(['dit is geen back-up'], 'x.json')] } });
    await waitFor(() => expect(document.querySelector('.melding.fout')?.textContent).toContain('Geen geldig back-upbestand'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(JSON.parse(localStorage.getItem('picker.watchlist')).length).toBe(6);
    // Een echte back-up (ook een oude, onder de oude naam)
    const backup = JSON.stringify({ app: 'nossy-picker', version: 2, data: {
      'nossyV2.watchlist': JSON.stringify([{ key: 'heat|1995', name: 'Heat', year: 1995, uri: '' }]),
      'nossyV2.settings': JSON.stringify({ lang: 'nl' }),
      'nossyV2.sync': JSON.stringify({ code: 'andere-koppeling' }),
    } });
    fireEvent.change(invoer, { target: { files: [new File([backup], 'b.json')] } });
    const venster = await screen.findByRole('alertdialog');
    expect(venster.textContent).toContain('vervangt wat er nu op dit apparaat staat');
    fireEvent.click(within(venster).getByRole('button', { name: 'Zet terug' }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem('picker.watchlist')).length).toBe(1));
    // Vervangen, niet mengen: wat niet in de back-up stond is weg
    expect(localStorage.getItem('picker.ratings')).toBeNull();
    // Wat bij dit apparaat hoort, blijft: de koppeling en het logboek
    expect(JSON.parse(localStorage.getItem('picker.sync')).code).toBe('eigen-koppeling');
    expect(localStorage.getItem('picker.foutlog')).not.toBeNull();
  });

  it('back-up: heet ShutterBox, laat het logboek van dit apparaat thuis, en wissen spaart de huisgenoten', async () => {
    const { exportAll, clearAll, controleerBackup } = await import('../src/lib/storage.js');
    localStorage.setItem('picker.foutlog', JSON.stringify([]));
    localStorage.setItem('picker.p.Sam.watchlist', JSON.stringify([{ key: 'a|1', name: 'A', year: 1 }]));
    localStorage.setItem('picker.profiles', JSON.stringify(['Sam']));
    const b = JSON.parse(exportAll({}));
    expect(b.app).toBe('shutterbox');
    expect(Object.keys(b.data)).not.toContain('picker.foutlog');
    expect(Object.keys(b.data).some((k) => k.includes('p.Sam'))).toBe(false);
    expect(() => controleerBackup('{"app":"iets anders","data":{}}')).toThrow('INVALID_BACKUP');
    expect(() => controleerBackup('{"app":"shutterbox","data":{}}')).toThrow('INVALID_BACKUP');
    await clearAll();
    expect(localStorage.getItem('picker.watchlist')).toBeNull();
    expect(localStorage.getItem('picker.p.Sam.watchlist')).not.toBeNull();
    expect(localStorage.getItem('picker.profiles')).not.toBeNull();
  });

  it('twee tabbladen: wat het andere tabblad schrijft, neemt dit tabblad over, zonder het terug te schrijven', async () => {
    const { useLS, opWijziging } = await import('../src/lib/storage.js');
    function Teller({ naam }) {
      const [n, setN] = useLS('proef', 0);
      return <button type="button" aria-label={naam} onClick={() => setN((x) => x + 1)}>{n}</button>;
    }
    const gemeld = [];
    const stop = opWijziging((k) => gemeld.push(k));
    try {
      render(<><Teller naam="a" /><Teller naam="b" /></>);
      // In dit tabblad: de ene schrijft, de andere ziet het meteen
      fireEvent.click(screen.getByLabelText('a'));
      expect(screen.getByLabelText('b').textContent).toBe('1');
      expect(localStorage.getItem('picker.proef')).toBe('1');
      const voor = gemeld.length;
      // Een ander tabblad schrijft 7
      localStorage.setItem('picker.proef', '7');
      act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'picker.proef', newValue: '7', storageArea: localStorage })); });
      expect(screen.getByLabelText('a').textContent).toBe('7');
      expect(screen.getByLabelText('b').textContent).toBe('7');
      // De sync van dit tabblad hoort er niets over: dat deed het andere al
      expect(gemeld.length).toBe(voor);
      // En verder tellen gaat vanaf 7, niet vanaf de oude stand
      fireEvent.click(screen.getByLabelText('b'));
      expect(localStorage.getItem('picker.proef')).toBe('8');
    } finally { stop(); }
  });

  it('hoofdfilm: wat vandaag gekozen is blijft staan, ook als je later opent; Een andere film mag nog', async () => {
    const { kiesHoofdfilm, kiesVoorfilm } = await import('../src/lib/voorpagina.js');
    const watchlist = [{ key: 'a', name: 'A' }, { key: 'b', name: 'B' }, { key: 'kort1', name: 'K1' }, { key: 'kort2', name: 'K2' }];
    const meta = {
      a: { vote: 7.9, votes: 40000, runtime: 170 },
      b: { vote: 7.0, votes: 30000, runtime: 95 },
      kort1: { vote: 7.5, votes: 900, runtime: 8 },
      kort2: { vote: 7.4, votes: 900, runtime: 9 },
    };
    const middag = new Date(2026, 10, 25, 14, 0);
    const laat = new Date(2026, 10, 25, 22, 30);
    const eerst = kiesHoofdfilm({ watchlist, meta, nu: middag });
    // Zonder vast kan het later op de avond een andere worden; met vast niet
    expect(kiesHoofdfilm({ watchlist, meta, nu: laat, vast: eerst.film.key }).film.key).toBe(eerst.film.key);
    const ander = eerst.film.key === 'a' ? 'b' : 'a';
    expect(kiesHoofdfilm({ watchlist, meta, nu: laat, vast: eerst.film.key, weg: [eerst.film.key] }).film.key).toBe(ander);
    // Gezien: dan niet meer vast
    expect(kiesHoofdfilm({ watchlist, meta, nu: laat, vast: eerst.film.key, seenSet: new Set([eerst.film.key]) }).film.key).toBe(ander);
    // De voorfilm ook
    const voor = kiesVoorfilm({ watchlist, meta, nu: middag });
    const andereKort = voor.film.key === 'kort1' ? 'kort2' : 'kort1';
    expect(kiesVoorfilm({ watchlist, meta, nu: laat, vast: andereKort }).film.key).toBe(andereKort);
  });

  it('hoofdfilm: de keuze van vandaag staat in het logboek en komt terug na herladen', () => {
    const { unmount } = render(<App />);
    const titel = document.querySelector('.hoofdfilm-titel')?.textContent || document.querySelector('[data-uitleg="hoofdfilm"] h2')?.textContent;
    expect(titel).toBeTruthy();
    const log = JSON.parse(localStorage.getItem('picker.hoofdfilmLog'));
    expect(log.length).toBe(1);
    unmount();
    render(<App />);
    const opnieuw = document.querySelector('.hoofdfilm-titel')?.textContent || document.querySelector('[data-uitleg="hoofdfilm"] h2')?.textContent;
    expect(opnieuw).toBe(titel);
  });

  it('programma: lukt het ophalen niet, dan zegt hij dat (en niet dat je alles beoordeelde)', async () => {
    let pogingen = 0;
    global.fetch = async () => { pogingen += 1; throw new Error('offline'); };
    localStorage.clear();
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('picker.verkenMode', JSON.stringify('voorJou'));
    localStorage.setItem('picker.watchlist', JSON.stringify([{ key: 'w|2019', name: 'W', year: 2019, uri: '' }]));
    localStorage.setItem('picker.ratings', JSON.stringify({ 'w|2019': 4.5 }));
    localStorage.setItem('picker.meta', JSON.stringify({ 'w|2019': { id: 1, title: 'W', year: 2019, genres: ['Drama'], vote: 7, votes: 3000, at: Date.now(), recs: [] } }));
    try {
      render(<App />);
      fireEvent.click(screen.getAllByLabelText('Programma')[0]);
      await waitFor(() => expect(document.querySelector('[data-leeg="net"]')).toBeTruthy(), { timeout: 3000 });
      expect(document.body.textContent).toContain('Het aanbod kwam niet binnen');
      expect(document.body.textContent).not.toContain('Je hebt alles beoordeeld');
      const eerder = pogingen;
      fireEvent.click(screen.getByText('Probeer opnieuw'));
      await waitFor(() => expect(pogingen).toBeGreaterThan(eerder));
    } finally {
      delete global.fetch;
    }
  });

  it('programma: zonder sterren legt hij uit waar Voor jou op leunt', async () => {
    global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ results: [], total_pages: 1 }) });
    localStorage.clear();
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('picker.verkenMode', JSON.stringify('voorJou'));
    localStorage.setItem('picker.watchlist', JSON.stringify([{ key: 'w|2019', name: 'W', year: 2019, uri: '' }]));
    localStorage.setItem('picker.meta', JSON.stringify({ 'w|2019': { id: 1, title: 'W', year: 2019, genres: ['Drama'], vote: 7, votes: 3000, at: Date.now(), recs: [] } }));
    try {
      render(<App />);
      fireEvent.click(screen.getAllByLabelText('Programma')[0]);
      await waitFor(() => expect(document.querySelector('[data-leeg="sterren"]')).toBeTruthy(), { timeout: 3000 });
      expect(document.body.textContent).toContain('Voor jou leert van je sterren');
    } finally {
      delete global.fetch;
    }
  });

  it('terug naar start ruimt ook vondsten, de hoofdfilmgeschiedenis en wat al gemeld was op', async () => {
    const nu = Date.now();
    localStorage.setItem('picker.vondsten', JSON.stringify({ 'heat|1995': { key: 'heat|1995', id: 949, name: 'Heat', year: 1995, poster: null, bron: 'voorjou', eerst: nu, laatst: nu, sterk: false } }));
    localStorage.setItem('picker.hoofdfilmOvergeslagen', JSON.stringify({ 'close|2022': ['2026-11-20'] }));
    render(<App />);
    expect(JSON.parse(localStorage.getItem('picker.hoofdfilmLog')).length).toBe(1);
    fireEvent.click(screen.getAllByLabelText('Setup')[0]);
    fireEvent.click(screen.getByText('Terug naar start (wis bibliotheek)'));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Wis de bibliotheek' }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem('picker.watchlist')).length).toBe(0));
    expect(JSON.parse(localStorage.getItem('picker.vondsten'))).toEqual({});
    // Leeg (of weg): Vanavond opent daarna opnieuw en schrijft zijn beginwaarde
    expect(JSON.parse(localStorage.getItem('picker.hoofdfilmLog') || '[]')).toEqual([]);
    expect(JSON.parse(localStorage.getItem('picker.hoofdfilmOvergeslagen') || '{}')).toEqual({});
    expect(JSON.parse(localStorage.getItem('picker.kaartjesGemeld')) || []).toEqual([]);
  });
});

describe('foutlogboek', () => {
  beforeEach(() => { cleanup(); seed(); });

  it('haalt sleutels en codes eruit, en telt dezelfde melding op', async () => {
    const { schoon, logFout, wisFoutlog } = await import('../src/lib/foutlog.js');
    expect(schoon('GET /3/movie?api_key=abc123&x=1')).toBe('GET /3/movie?api_key=…&x=1');
    expect(schoon('code ABCDE-FGHIJ-KLMNO-PQRST weg')).toBe('code … weg');
    expect(schoon('a'.repeat(40))).toBe('…');
    wisFoutlog();
    logFout('sync', new Error('HTTP_500'));
    logFout('sync', new Error('HTTP_500'));
    logFout('omdb', 'LIMIT');
    const l = JSON.parse(localStorage.getItem('picker.foutlog'));
    expect(l.map((r) => [r.bron, r.tekst, r.n || 1])).toEqual([['sync', 'HTTP_500', 2], ['omdb', 'LIMIT', 1]]);
  });

  it('Setup toont het alleen als er iets misging; kopiëren en wissen werken', async () => {
    const { wisFoutlog, logFout } = await import('../src/lib/foutlog.js');
    wisFoutlog();
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Setup')[0]);
    expect(document.querySelector('[data-foutlog]')).toBeNull();
    act(() => { logFout('voorjou', new Error('NETWORK')); });
    const kaart = await waitFor(() => { const k = document.querySelector('[data-foutlog]'); expect(k).not.toBeNull(); return k; });
    expect(kaart.textContent).toContain('Wat er misging');
    expect(kaart.textContent).toContain('Voor jou');
    expect(kaart.textContent).toContain('NETWORK');
    const schrijf = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: schrijf }, configurable: true });
    fireEvent.click(within(kaart).getByRole('button', { name: 'Kopieer' }));
    await waitFor(() => expect(schrijf).toHaveBeenCalled());
    expect(schrijf.mock.calls[0][0]).toMatch(/\[voorjou\] NETWORK/);
    fireEvent.click(within(kaart).getByRole('button', { name: 'Wissen' }));
    await waitFor(() => expect(document.querySelector('[data-foutlog]')).toBeNull());
  });
});

describe('de naam', () => {
  beforeEach(() => { cleanup(); seed(); });

  it('staat op één plek: de woordenboeken vullen {app} en {appScore} vanzelf in', async () => {
    const { t, setLang } = await import('../src/lib/i18n.js');
    const { NAAM, SCORE } = await import('../src/lib/merk.js');
    expect(t('nav.huis')).toBe(NAAM);
    expect(t('setup.versionLine', { v: '6.0.0' })).toBe(`${NAAM}, versie 6.0.0`);
    expect(t('sort.appScore')).toContain(SCORE);
    setLang('en');
    expect(t('kaartje.gevondenKnop')).toBe(`Found via ${NAAM}`);
    setLang('nl');
    // Nergens in de teksten nog een eigen naam
    const nl = (await import('../src/lib/dict/nl.js')).default;
    const en = (await import('../src/lib/dict/en.js')).default;
    expect(JSON.stringify(nl)).not.toMatch(/nossy/i);
    expect(JSON.stringify(en)).not.toMatch(/nossy/i);
  });

  it('wie de tool al gebruikte, hoort de nieuwe naam één keer', async () => {
    const { naamMoment, NAAM } = await import('../src/lib/merk.js');
    const basis = { versie: '6.0.0', gezien: undefined, watchlist: 40, demoMode: false };
    expect(naamMoment(basis)).toBe('melding');
    expect(naamMoment({ ...basis, gezien: NAAM })).toBeNull();
    // Een leeg apparaat of de demo begint gewoon onder deze naam
    expect(naamMoment({ ...basis, watchlist: 0 })).toBe('stil');
    expect(naamMoment({ ...basis, demoMode: true })).toBe('stil');
    // In ontwikkeling en in de tests niet
    expect(naamMoment({ ...basis, versie: 'dev' })).toBeNull();
    const { t } = await import('../src/lib/i18n.js');
    expect(t('app.nieuweNaam')).toContain(NAAM);
  });

  it('het recept leest ook de oude instelling, en schrijft de nieuwe', async () => {
    const { receptUit } = await import('../src/lib/pick.js');
    expect(receptUit({ nossyWeights: { imdb: 2 } })).toEqual({ imdb: 2 });
    expect(receptUit({ scoreWeights: { mc: 0 }, nossyWeights: { imdb: 2 } })).toEqual({ mc: 0 });
    localStorage.setItem('picker.settings', JSON.stringify({ ...JSON.parse(localStorage.getItem('picker.settings') || '{}'), nossyWeights: { imdb: 2, mc: 1, tmdb: 1 } }));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Setup')[0]);
    const kaart = document.querySelector('[data-uitleg="setup-recept"]');
    const schuif = kaart.querySelector('select');
    expect(schuif.value).toBe('2');
    fireEvent.change(schuif, { target: { value: '3' } });
    const s = JSON.parse(localStorage.getItem('picker.settings'));
    expect(s.nossyWeights).toBeUndefined();
    expect(s.scoreWeights.imdb).toBe(3);
  });

  it('Op afstand zonder naam: een neutrale kop voor de gasten', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ host: 'host', winner: null, votes: {}, films: [{ key: 'a|2020', name: 'A', year: 2020 }] }) }));
    const RemoteVote = (await import('../src/components/RemoteVote.jsx')).default;
    render(<RemoteVote code="ABC123" pollMs={999999} />);
    expect(await screen.findByText('Kies samen een film')).toBeTruthy();
    expect(screen.queryByText(/host wil/)).toBeNull();
  });
});

describe('schermen: adressen, de vraag, de volgorde', () => {
  beforeEach(() => { cleanup(); seed(); });

  const metVraag = () => {
    const gisteren = new Date(Date.now() - 20 * 3600e3).toISOString();
    localStorage.setItem('picker.kaartjes', JSON.stringify([{ id: '1', key: 'aftersun|2022', name: 'Aftersun', year: 2022, datum: gisteren, bron: 'pick', personen: 1 }]));
  };

  it('elk scherm een eigen adres; Terug gaat terug, en een adres opent zijn scherm', async () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Archief')[0]);
    expect(location.hash).toBe('#archive');
    fireEvent.click(screen.getAllByLabelText('Setup')[0]);
    expect(location.hash).toBe('#setup');
    act(() => { window.history.back(); });
    await waitFor(() => expect(location.hash).toBe('#archive'));
    await waitFor(() => expect(screen.getAllByLabelText('Archief')[0].getAttribute('aria-current')).toBe('page'));
    fireEvent.click(screen.getAllByLabelText('Vanavond')[0]);
    expect(location.hash).toBe('');
    cleanup();
    window.history.replaceState(null, '', '/#yearbook');
    render(<App />);
    expect(screen.getAllByLabelText('Jaarboek')[0].getAttribute('aria-current')).toBe('page');
  });

  it('de vraag over gisteren staat alleen op Vanavond; elders een stip op die tab', async () => {
    metVraag();
    render(<App />);
    const vraag = () => document.querySelector('.followup-card');
    await waitFor(() => expect(vraag()).not.toBeNull());
    expect(document.querySelector('[data-stip="pick"]')).toBeNull();
    fireEvent.click(screen.getAllByLabelText('Archief')[0]);
    expect(vraag()).toBeNull();
    expect(document.querySelector('[data-stip="pick"]')).not.toBeNull();
    const knop = screen.getAllByLabelText('Vanavond')[0];
    expect(document.getElementById(knop.getAttribute('aria-describedby')).textContent).toBe('Er wacht een vraag over gisteren');
  });

  it('op een telefoon staat de kassa boven de vraag', async () => {
    metVraag();
    render(<App />);
    const vraag = await waitFor(() => { const v = document.querySelector('.followup-card'); expect(v).not.toBeNull(); return v; });
    const kassa = document.querySelector('[data-uitleg="kassa"]');
    expect(kassa.compareDocumentPosition(vraag) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('het jaarboek begint met de getallen', () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Jaarboek')[0]);
    const cijfers = document.querySelector('[data-uitleg="jaarboek-cijfers"]');
    const profiel = document.querySelector('[data-uitleg="jaarboek-profiel"]');
    const titel = document.querySelector('.page-title');
    expect(titel.compareDocumentPosition(cijfers) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(cijfers.compareDocumentPosition(profiel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('Filmavond: hoe kiezen jullie?', () => {
  beforeEach(() => { cleanup(); seed(); });

  it('één keuze bovenaan; alleen die manier staat in beeld, en de tool onthoudt hem', () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Filmavond')[0]);
    const knop = (naam) => screen.getByRole('button', { name: new RegExp(`^${naam}`) });
    expect(knop('Op de bank').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /Start veto/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open de zaal' })).toBeNull();
    fireEvent.click(knop('Met een link'));
    expect(screen.queryByRole('button', { name: /Start veto/ })).toBeNull();
    // Voor ons en Op afstand samen onder één manier
    expect(screen.getByRole('heading', { name: /Voor ons/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Op afstand/ })).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('picker.settings')).avondManier).toBe('link');
    fireEvent.click(knop('In de zaal'));
    expect(screen.getByRole('button', { name: 'Open de zaal' })).toBeTruthy();
    cleanup();
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Filmavond')[0]);
    expect(knop('In de zaal').getAttribute('aria-pressed')).toBe('true');
  });
});
