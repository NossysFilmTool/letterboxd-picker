// De app als geheel, deel 1 van 4: Vanavond, de voorpagina, rijen en Voor jou.
import { describe, it, expect, beforeEach, vi, onTestFinished } from 'vitest';
import { render, fireEvent, screen, cleanup, within, waitFor, act } from '@testing-library/react';
import App from '../src/App.jsx';
import { fakeFilms, seed } from './helpers.jsx';

describe('V2 smoke (1/4)', () => {
  beforeEach(() => { cleanup(); seed(); });


  it('onboarding-hero zonder data', () => {
    localStorage.clear();
    localStorage.setItem('picker.settings', JSON.stringify({ lang: 'nl' }));
    render(<App />);
    expect(document.body.textContent).toContain('Wat kijken we vanavond?');
    expect(document.body.textContent).toContain('demo-watchlist');
    expect(document.body.textContent).toContain('één keer');
    expect(document.body.textContent).not.toContain('u00e9');
  });

  it('pick-tab: de kassa toont de pot, moods, de knop en de schakelaars', () => {
    render(<App />);
    expect(document.querySelector('.kassa-aantal').textContent).toBe('6 films in de pot');
    expect(document.body.textContent).toContain('Korte avond');
    expect(document.body.textContent).toContain('Verborgen parel');
    expect(document.querySelector('.kassa').textContent).toContain('Aanvang');
    expect(document.querySelector('.kassa-sleuf')).toBeTruthy();
    expect(screen.getByText('Laat het lot kiezen')).toBeTruthy();
    const slim = screen.getByRole('switch', { name: 'Slim kiezen' });
    expect(slim.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(slim);
    expect(slim.getAttribute('aria-checked')).toBe('true');
    const trailer = screen.getByRole('switch', { name: 'Eerst de trailer' });
    expect(trailer.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(trailer);
    expect(trailer.getAttribute('aria-checked')).toBe('false');
  });

  it('kassa: een stemming vult de pot in plaats van meteen te kiezen', () => {
    render(<App />);
    const kort = screen.getByRole('button', { name: /Korte avond/ });
    fireEvent.click(kort);
    expect(kort.getAttribute('aria-pressed')).toBe('true');
    // 105 minuten of korter: Aftersun (96), La haine (98) en Close (104)
    expect(document.querySelector('.kassa-aantal').textContent).toBe('3 films in de pot');
    expect(document.querySelector('.leader')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Alles' }));
    expect(document.querySelector('.kassa-aantal').textContent).toBe('6 films in de pot');
  });

  it('kassa: de la met wat er op tafel komt, onthouden los van Filmavond', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Aanpassen/ }));
    const la = screen.getByRole('dialog', { name: 'Wat er op tafel komt' });
    // tot twee uur: Stalker (162) en First Cow (122) vallen af
    fireEvent.click(within(la).getByRole('button', { name: 'Tot 2 uur' }));
    expect(document.querySelector('.kassa-aantal').textContent).toBe('4 films in de pot');
    expect(within(la).getByText('4 films')).toBeTruthy();
    expect(document.querySelector('.kassa-samenvatting').textContent).toContain('Tot 2 uur');
    const s = JSON.parse(localStorage.getItem('picker.settings'));
    expect(s.pickFilters.maxDuur).toBe(120);
    expect(s.avondFilters).toBeUndefined();
    // gezien kan meedoen (voor een lijst met favorieten)
    fireEvent.click(within(la).getByRole('button', { name: 'Gezien eruit' }));
    expect(document.querySelector('.kassa-samenvatting').textContent).toContain('Gezien doet mee');
    fireEvent.click(within(la).getByText('Terug naar standaard'));
    expect(document.querySelector('.kassa-aantal').textContent).toBe('6 films in de pot');
    expect(document.querySelector('.kassa-samenvatting').textContent).toContain('Gezien eruit');
    fireEvent.click(within(la).getByRole('button', { name: 'Klaar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    // Escape sluit hem ook
    fireEvent.click(screen.getByRole('button', { name: /Aanpassen/ }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('wat er op tafel komt: alleen op streaming telt je eigen diensten als je die koos', async () => {
    const { filterPot } = await import('../src/lib/avondFilters.js');
    const pot = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];
    const meta = { a: { flat: ['Netflix'] }, b: { flat: ['MUBI'] }, c: {} };
    const f = { alleenStreaming: true, geenKort: false };
    const score = () => null;
    expect(filterPot(pot, meta, f, score).map((x) => x.key)).toEqual(['a', 'b']);
    expect(filterPot(pot, meta, f, score, { diensten: ['MUBI'] }).map((x) => x.key)).toEqual(['b']);
    // en de kaart zegt dan ook wat hij doet
    localStorage.setItem('picker.mijnDiensten', JSON.stringify(['MUBI']));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Aanpassen/ }));
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Op mijn diensten' })).toBeTruthy();
  });

  it('kassa: met beweging krijgt je pick eerst een trailer, daarna het kaartje', async () => {
    const mm = window.matchMedia;
    window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    try {
      render(<App />);
      fireEvent.click(screen.getByText('Laat het lot kiezen'));
      await act(async () => { vi.advanceTimersByTime(4500); });
      const trailer = screen.getByRole('dialog', { name: 'Trailer van je pick' });
      expect(trailer.textContent).toContain('Jouw film van vanavond.');
      expect(trailer.textContent).not.toContain('veto');
      expect(document.querySelector('.kaartje')).toBeNull();
      fireEvent.click(within(trailer).getByText('Meteen naar je kaartje'));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.querySelector('.kassa.uitgifte')).toBeTruthy();
      expect(document.querySelector('.kaartje').textContent).toContain('SHUTTERBOX');
      // het kaartje is er al bij het einde van het aftellen, ook als je de trailer wegklikt
      expect(JSON.parse(localStorage.getItem('picker.kaartjes'))[0]).toMatchObject({ bron: 'pick' });
      fireEvent.click(screen.getByText('Terug naar de kassa'));
      expect(document.querySelector('.kassa-aantal')).toBeTruthy();
    } finally {
      vi.useRealTimers();
      window.matchMedia = mm;
    }
  });

  it('kassa: zonder trailer schuift het kaartje na het aftellen meteen uit de sleuf', async () => {
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl', pickTrailer: false }));
    const mm = window.matchMedia;
    window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    try {
      render(<App />);
      fireEvent.click(screen.getByText('Laat het lot kiezen'));
      await act(async () => { vi.advanceTimersByTime(4500); });
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.querySelector('.kaartje')).toBeTruthy();
    } finally {
      vi.useRealTimers();
      window.matchMedia = mm;
    }
  });

  it('première: vanzelf alleen in een echte versie, één keer, en niet voor wie op 5 instapt', async () => {
    const { premiereAutomatisch } = await import('../src/lib/premiere.js');
    const basis = { versie: '5.0.0', gezien: undefined, nieuwHier: false, watchlist: 12, demoMode: false };
    expect(premiereAutomatisch(basis)).toBe(true);
    expect(premiereAutomatisch({ ...basis, versie: '5.0.1' })).toBe(true);
    expect(premiereAutomatisch({ ...basis, versie: '5.0.0-beta.38' })).toBe(false);
    expect(premiereAutomatisch({ ...basis, versie: null })).toBe(false);
    expect(premiereAutomatisch({ ...basis, versie: 'dev' })).toBe(false);
    // de tests zelf draaien als 'dev', zodat de première niet over elk scherm opent
    expect(typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev').toBe('dev');
    expect(premiereAutomatisch({ ...basis, gezien: '5.0' })).toBe(false);
    expect(premiereAutomatisch({ ...basis, nieuwHier: true })).toBe(false);
    expect(premiereAutomatisch({ ...basis, watchlist: 0 })).toBe(false);
    expect(premiereAutomatisch({ ...basis, demoMode: true })).toBe(false);
    // een apparaat dat leeg begint, begint op 5
    localStorage.clear();
    localStorage.setItem('picker.settings', JSON.stringify({ lang: 'nl' }));
    render(<App />);
    expect(JSON.parse(localStorage.getItem('picker.nieuwOp5'))).toBe(true);
  });

  it('première: de trailer komt uit je eigen gegevens, en wat er niet is valt weg', async () => {
    const { premiereInhoud } = await import('../src/lib/premiere.js');
    const { t, setLang } = await import('../src/lib/i18n.js');
    setLang('nl');
    const nu = new Date(2026, 10, 11, 20, 0);
    const watchlist = [{ key: 'a|1' }, { key: 'b|2' }, { key: 'c|3' }];
    const meta = { 'a|1': { flat: ['MUBI'], backdrop: '/a.jpg' }, 'b|2': { flat: [], backdrop: '/b.jpg' }, 'c|3': { flat: ['Netflix'] }, 'x|9': { backdrop: '/x.jpg' } };
    const kaartjesStand = [
      { id: '1', key: 'x|9', name: 'Aftersun', bron: 'pick', status: 'gekeken', gekekenOp: '2026-11-02', sterren: 5, namen: ['Ik', 'Sanne'] },
      { id: '2', key: 'y|8', name: 'Close', bron: 'avond', status: 'gekeken', gekekenOp: '2026-10-02', sterren: 4, namen: ['Ik', 'Sanne'] },
      { id: '3', key: 'z|7', name: 'Stalker', bron: 'pick', status: 'open' },
    ];
    const inh = premiereInhoud({ watchlist, kaartjesStand, meta, tr: t, nu });
    expect(inh.slogan).toBe('3 keer koos je een film. 2 keer keek je hem echt.');
    expect(inh.van).toBe('3 films van je watchlist');
    expect(inh.metKop).toBe('Je filmjaar 2026');
    expect(inh.met).toEqual(['2 kaartjes', 'Hoogst: Aftersun', 'Het vaakst met Sanne']);
    // het hoofdbeeld is je hoogst gewaardeerde kaartje, de shots komen daarna
    expect(inh.beeld).toContain('/x.jpg');
    expect(inh.shots.join(' ')).not.toContain('/x.jpg');
    expect(inh.cijfers.map((c) => [c.waarde, c.label])).toEqual([[2, 'in de doos'], [3, 'op je lijst'], [2, 'nu te streamen']]);
    expect(premiereInhoud({ watchlist, kaartjesStand, meta, diensten: ['MUBI'], tr: t, nu }).cijfers[2]).toMatchObject({ waarde: 1, label: 'nu op je diensten' });
    // zonder kaartjes: geen shot met tekst en geen filmjaar, wel je watchlist
    const kaal = premiereInhoud({ watchlist, kaartjesStand: [], meta: {}, tr: t, nu });
    expect(kaal.slogan).toBeNull();
    expect(kaal.met).toEqual([]);
    expect(kaal.beeld).toBeNull();
    expect(kaal.cijfers.map((c) => c.label)).toEqual(['op je lijst']);
  });

  it('première: het kaartje bij de deur, dan de trailer, en daarna onthouden', async () => {
    const mm = window.matchMedia;
    window.matchMedia = () => ({ matches: true, addListener() {}, removeListener() {} });
    window.history.replaceState(null, '', '/?premiere');
    try {
      render(<App />);
      const deur = await screen.findByRole('dialog', { name: 'De première van ShutterBox' }, { timeout: 3000 });
      expect(location.search).toBe('');
      expect(deur.textContent).toContain('PREMIÈRE');
      expect(deur.textContent).toContain('TOEGANG 1 PERSOON');
      expect(deur.textContent).toContain('Op je lijst');
      fireEvent.click(within(deur).getByRole('button', { name: 'Scheur je kaartje af en ga naar binnen' }));
      // met beperk beweging meteen het eindbeeld, zonder voorprogramma
      const trailer = await screen.findByRole('dialog', { name: 'De première van ShutterBox' });
      expect(trailer.classList.contains('pitch')).toBe(true);
      expect(trailer.textContent).toContain('Een productie van ShutterBox');
      expect(trailer.textContent).toContain('ShutterBox');
      expect(trailer.textContent).toContain('op je lijst');
      expect(trailer.textContent).not.toContain('veto');
      fireEvent.click(within(trailer).getByRole('button', { name: /Naar de kassa/ }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(JSON.parse(localStorage.getItem('picker.settings')).premiere).toBe('5.0');
      expect(document.querySelector('.kassa')).toBeTruthy();
    } finally {
      window.matchMedia = mm;
      window.history.replaceState(null, '', '/');
    }
  });

  it('première: bij Setup nog eens te zien, en overslaan kan altijd', () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Setup')[0]);
    fireEvent.click(screen.getByText('Bekijk de première van 5.0 nog eens'));
    const deur = screen.getByRole('dialog', { name: 'De première van ShutterBox' });
    fireEvent.click(within(deur).getByText('Overslaan'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(JSON.parse(localStorage.getItem('picker.settings')).premiere).toBe('5.0');
  });

  it('voorpagina: de hoofdfilm komt uit je eigen lijst, met een echte reden', async () => {
    const { kiesHoofdfilm } = await import('../src/lib/voorpagina.js');
    const nu = new Date(2026, 10, 14, 20, 0);
    const watchlist = [{ key: 'a', name: 'A' }, { key: 'b', name: 'B' }, { key: 'c', name: 'C' }, { key: 'zag', name: 'Al gezien' }];
    const meta = {
      a: { vote: 7.0, votes: 2000, runtime: 100, flat: ['MUBI'], backdrop: '/a.jpg' },
      b: { vote: 9.5, votes: 20000, runtime: 110, flat: [], director: 'Wim Wenders' },
      c: { vote: 5.0, votes: 800, runtime: 95, flat: ['Netflix'], flatSinds: { Netflix: nu.getTime() - 2 * 864e5 } },
      zag: { vote: 9.9, runtime: 90 },
      pd: { director: 'Wim Wenders' },
    };
    const seenSet = new Set(['zag']);
    // wat je al zag nooit; het hoogste cijfer dat je nog niet zag wint hier ruim
    const b = kiesHoofdfilm({ watchlist, meta, seenSet, nu });
    expect(b.film.key).toBe('b');
    expect(b.reden).toEqual({ soort: 'hoogste' });
    // dezelfde dag, dezelfde keuze
    expect(kiesHoofdfilm({ watchlist, meta, seenSet, nu }).film.key).toBe('b');
    // dezelfde regisseur als een film die je vijf sterren gaf, is een betere reden
    const metSterren = kiesHoofdfilm({ watchlist, meta, seenSet, nu, ratedFilms: [{ key: 'pd', name: 'Perfect Days', rating: 5 }] });
    expect(metSterren.reden).toEqual({ soort: 'regisseur', regisseur: 'Wim Wenders', titel: 'Perfect Days', sterren: 5 });
    // weggeklikt: de volgende, die nu op een dienst staat en vanavond nog past
    const a = kiesHoofdfilm({ watchlist, meta, seenSet, nu, weg: ['b'] });
    expect(a.film.key).toBe('a');
    expect(a.reden).toEqual({ soort: 'dienst', dienst: 'MUBI' });
    // net binnen gaat voor alles
    const c = kiesHoofdfilm({ watchlist, meta, seenSet, nu, weg: ['b', 'a'] });
    expect(c.reden).toEqual({ soort: 'binnen', dienst: 'Netflix' });
    // zonder filmdata geen hoofdfilm
    expect(kiesHoofdfilm({ watchlist, meta: {}, seenSet, nu })).toBeNull();
  });

  it('voorpagina: een korte film is nooit de hoofdfilm, maar wel de voorfilm', async () => {
    const { kiesHoofdfilm, kiesVoorfilm, betrouwbaarCijfer } = await import('../src/lib/voorpagina.js');
    const nu = new Date(2026, 10, 14, 20, 0);
    const watchlist = [{ key: 'wire', name: 'The Wire' }, { key: 'lang', name: 'Een speelfilm' }, { key: 'zeldzaam', name: 'Bijna niemand zag hem' }];
    const meta = {
      // een korte film van 3 minuten met een hoog cijfer van twaalf stemmers
      wire: { vote: 8.6, votes: 12, runtime: 3 },
      lang: { vote: 7.6, votes: 40000, runtime: 112 },
      // een speelfilm met een 9,4 van negen stemmers: geen "hoogste cijfer"
      zeldzaam: { vote: 9.4, votes: 9, runtime: 95 },
    };
    // weinig stemmen trekt het cijfer naar het midden
    expect(betrouwbaarCijfer(meta.zeldzaam)).toBeLessThan(betrouwbaarCijfer(meta.lang));
    const keuze = kiesHoofdfilm({ watchlist, meta, nu });
    expect(keuze.film.key).toBe('lang');
    expect(keuze.reden).toEqual({ soort: 'hoogste' });
    // de korte film wordt de voorfilm, nooit de hoofdfilm zelf
    expect(kiesHoofdfilm({ watchlist, meta, nu, weg: ['lang', 'zeldzaam'] })).toBeNull();
    expect(kiesVoorfilm({ watchlist, meta, nu, zonder: keuze.film.key }).film.key).toBe('wire');
    // al gezien: geen voorfilm; alleen korte films op je lijst: dan toch een hoofdfilm
    expect(kiesVoorfilm({ watchlist, meta, nu, seenSet: new Set(['wire']) })).toBeNull();
    expect(kiesHoofdfilm({ watchlist: [watchlist[0]], meta, nu }).film.key).toBe('wire');
  });

  it('voorpagina: je smaak als reden, en afwisseling over de dagen', async () => {
    const { kiesHoofdfilm, beschrijfHoofdfilm } = await import('../src/lib/voorpagina.js');
    const nu = new Date(2026, 10, 18, 20, 0);
    const taste = { genres: { Drama: 0.8 }, decades: { 1970: 0.6 }, themes: {}, topThemes: [], nietEngels: 0.5, medianVotes: 5000, sterk: true };
    const meta = {
      d: { vote: 8.0, votes: 5000, runtime: 105, year: 1975, lang: 'fr', genres: ['Drama'] },
      x: { vote: 7.4, votes: 6000, runtime: 100, year: 2004, lang: 'en', genres: ['Comedy'], director: 'X' },
      y: { vote: 7.4, votes: 6000, runtime: 100, year: 2004, lang: 'en', genres: ['Comedy'], director: 'Y' },
    };
    // met een sterk profiel: de reden is je smaak, met wat de film ermee deelt
    const smaak = beschrijfHoofdfilm({ key: 'd', name: 'D' }, { meta, taste, nu });
    expect(smaak.reden).toMatchObject({ soort: 'smaak', genre: 'Drama', era: '70' });
    expect(smaak.reden.pct).toBeGreaterThanOrEqual(70);
    // met een pril profiel claimt de tool dat niet
    expect(beschrijfHoofdfilm({ key: 'd', name: 'D' }, { meta, taste: { ...taste, sterk: false }, nu }).reden.soort).not.toBe('smaak');
    // drie dagen weggeklikt: hij zakt onder een gelijke film
    const watchlist = [{ key: 'x', name: 'X' }, { key: 'y', name: 'Y' }];
    const overgeslagen = { x: ['2026-11-10', '2026-11-12', '2026-11-15'], y: [] };
    expect(kiesHoofdfilm({ watchlist, meta, nu, overgeslagen }).film.key).toBe('y');
    expect(kiesHoofdfilm({ watchlist, meta, nu, overgeslagen: { y: overgeslagen.x } }).film.key).toBe('x');
    // vorige week al gepickt: niet weer als hoofdfilm, maar vandaag gepickt verandert vandaag niets
    const vorigeWeek = new Date(2026, 10, 12, 21, 0).toISOString();
    expect(kiesHoofdfilm({ watchlist, meta, nu, gepickt: [{ key: 'x', date: vorigeWeek }] }).film.key).toBe('y');
    expect(kiesHoofdfilm({ watchlist, meta, nu, gepickt: [{ key: 'y', date: vorigeWeek }] }).film.key).toBe('x');
    const vandaagGepickt = kiesHoofdfilm({ watchlist, meta, nu, gepickt: [{ key: 'x', date: nu.toISOString() }] }).film.key;
    expect(vandaagGepickt).toBe(kiesHoofdfilm({ watchlist, meta, nu }).film.key);
  });

  it('voorpagina: de voorfilm staat onder de reden en opent zijn eigen filmkaart', async () => {
    const meta = JSON.parse(localStorage.getItem('picker.meta'));
    const kort = JSON.parse(localStorage.getItem('picker.watchlist'))[2];
    meta[kort.key] = { ...meta[kort.key], runtime: 7 };
    localStorage.setItem('picker.meta', JSON.stringify(meta));
    render(<App />);
    const regel = await waitFor(() => { const r = document.querySelector('.hoofdfilm-voorfilm'); expect(r).toBeTruthy(); return r; });
    expect(document.querySelector('.hoofdfilm-titel').textContent).not.toBe(kort.name);
    expect(regel.textContent).toContain('Voorfilm');
    expect(regel.textContent).toContain('7 min');
    const knop = within(regel).getByRole('button', { name: kort.name });
    fireEvent.click(knop);
    expect(knop.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('.voorfilm-kaart').textContent).toContain('Voorfilm van vanavond');
    // geen kaartje: alleen kijken
    expect(JSON.parse(localStorage.getItem('picker.kaartjes') || '[]')).toEqual([]);
    // vandaag onthouden voor de afwisseling van morgen
    const log = JSON.parse(localStorage.getItem('picker.hoofdfilmLog'));
    expect(log.at(-1).key).toBe(JSON.parse(localStorage.getItem('picker.watchlist')).find((f) => f.name === document.querySelector('.hoofdfilm-titel').textContent).key);
  });

  it('voorpagina: een hoofdfilm met titelblok, een andere kiezen, en het kaartje pakken', async () => {
    const mm = window.matchMedia;
    window.matchMedia = () => ({ matches: true, addListener() {}, removeListener() {} });
    try {
      render(<App />);
      const titel = () => document.querySelector('.hoofdfilm-titel')?.textContent;
      await waitFor(() => expect(titel()).toBeTruthy());
      const eerste = titel();
      expect(fakeFilms.map(([naam]) => naam)).toContain(eerste);
      expect(document.querySelector('.titelblok').getAttribute('aria-label')).toMatch(/^Een film van /);
      // met een hoofdfilm is het lot de tweede keus
      expect(screen.getByText('Laat het lot kiezen').className).toContain('tweede');
      // een andere film: de vorige blijft vandaag weg
      fireEvent.click(screen.getByText('Een andere film'));
      expect(titel()).not.toBe(eerste);
      const weg = JSON.parse(localStorage.getItem('picker.hoofdfilmWeg'));
      expect(weg.keys).toHaveLength(1);
      // en op welke dag: drie dagen weggeklikt en hij zakt
      expect(JSON.parse(localStorage.getItem('picker.hoofdfilmOvergeslagen'))[weg.keys[0]]).toEqual([weg.dag]);
      // het kaartje pakken: het kaartje schuift uit de kassa, met de hoofdfilm erop
      const tweede = titel();
      fireEvent.click(screen.getByText('Pak dit kaartje'));
      expect(await screen.findByText('Meer zoals deze')).toBeTruthy();
      expect(document.querySelector('.kassa-context').textContent).toBe('Hoofdfilm van vanavond');
      expect(JSON.parse(localStorage.getItem('picker.kaartjes'))[0].name).toBe(tweede);
      expect(JSON.parse(localStorage.getItem('picker.history'))[0].context).toBe('Hoofdfilm van vanavond');
    } finally {
      window.matchMedia = mm;
    }
  });

  it('voorpagina: net binnen als programmaregels, en een regel wordt de hoofdfilm', async () => {
    const meta = JSON.parse(localStorage.getItem('picker.meta'));
    const gisteren = Date.now() - 864e5;
    meta['la haine|1995'].flatSinds = { Netflix: gisteren };
    meta['close|2022'].flatSinds = { Netflix: gisteren };
    localStorage.setItem('picker.meta', JSON.stringify(meta));
    render(<App />);
    const rubriek = await screen.findByRole('region', { name: 'Net binnen' });
    const regels = within(rubriek).getAllByRole('button', { name: /als hoofdfilm van vanavond/ });
    expect(regels.length).toBeGreaterThan(0);
    const naam = regels[0].getAttribute('aria-label').replace('Zet ', '').replace(' als hoofdfilm van vanavond', '');
    fireEvent.click(regels[0]);
    expect(document.querySelector('.hoofdfilm-titel').textContent).toBe(naam);
    expect(document.querySelector('.hoofdfilm-reden').textContent).toBe('Net binnen op Netflix.');
  });

  it('voorpagina: de laatste kaartjes uit je doos, als waaier, openen de doos', () => {
    const gisteren = new Date(Date.now() - 24 * 3600e3).toISOString();
    localStorage.setItem('picker.kaartjes', JSON.stringify([
      { id: `${gisteren}|aftersun|2022`, key: 'aftersun|2022', name: 'Aftersun', year: 2022, datum: gisteren, bron: 'pick', personen: 1, antwoord: 'gekeken', sterren: 4.5, beantwoord: gisteren },
    ]));
    render(<App />);
    const doos = screen.getByRole('region', { name: 'Uit je doos' });
    expect(doos.textContent).toContain('AFTERSUN');
    expect(doos.textContent).toContain('★★★★½');
    fireEvent.click(within(doos).getByText('naar de doos'));
    expect(document.body.textContent).toContain('1 kaartje in de doos');
  });

  it('pick draait leader en levert winnaar met acties', async () => {
    const mm = window.matchMedia;
    window.matchMedia = () => ({ matches: true, addListener() {}, removeListener() {} });
    onTestFinished(() => { window.matchMedia = mm; });
    render(<App />);
    fireEvent.click(screen.getAllByText('Laat het lot kiezen')[0]);
    expect(await screen.findByText('Gezien')).toBeTruthy();
    expect(document.body.textContent).toContain('Meer zoals deze');
    // een pick levert een bioscoopkaartje, zonder verzonnen zaal, rij of stoel
    const kaartje = document.querySelector('.kaartje');
    expect(kaartje).toBeTruthy();
    expect(kaartje.textContent).toContain('SHUTTERBOX');
    expect(kaartje.textContent).toContain('TOEGANG 1 PERSOON');
    expect(kaartje.textContent).toContain('Aanvang');
    expect(kaartje.textContent).not.toMatch(/Rij|Stoel/);
    // het kaartje is bewaard, maar zit nog niet in de doos: een pick is geen bewijs
    const bewaard = JSON.parse(localStorage.getItem('picker.kaartjes'));
    expect(bewaard[0]).toMatchObject({ bron: 'pick', personen: 1 });
    expect(bewaard[0].antwoord).toBeUndefined();
  });

  it('kaartje: aanvang op vijf minuten, einde uit de speelduur, echte gegevens', async () => {
    const { aanvangTijd, kaartjeInhoud, streepjes } = await import('../src/lib/kaartje.js');
    const { t } = await import('../src/lib/i18n.js');
    const om = (u, m, s = 0) => new Date(2026, 10, 6, u, m, s);
    expect(aanvangTijd(om(20, 27)).getMinutes()).toBe(30);
    expect(aanvangTijd(om(20, 30, 10)).getMinutes()).toBe(35);
    expect(aanvangTijd(om(20, 58)).getHours()).toBe(21);
    const film = { key: 'aftersun|2022', name: 'Aftersun', year: 2022 };
    const meta = { id: 965150, runtime: 101, vote: 7.6, director: 'Charlotte Wells', cast: ['Paul Mescal', 'Frankie Corio'], flat: ['MUBI'] };
    const k = kaartjeInhoud(film, meta, { tr: t, lang: 'nl', personen: 3, nu: om(20, 27) });
    expect(k.titel).toBe('AFTERSUN');
    expect(k.aftiteling).toBe('Een film van Charlotte Wells, met Paul Mescal en Frankie Corio');
    const veld = (naam) => k.velden.find((v) => v.k === naam)?.v;
    expect(veld('Aanvang')).toBe('20:30');
    expect(veld('Einde')).toBe('22:11');
    expect(veld('Kijk op')).toBe('MUBI');
    expect(veld('Prijs')).toBe('INBEGREPEN');
    expect(k.toegang).toBe('TOEGANG 3 PERSONEN');
    expect(k.code).toBe('TMDB 965150');
    // zonder aanbod, speelduur of regie: die velden vallen weg
    const kaal = kaartjeInhoud(film, {}, { tr: t, lang: 'nl', nu: om(20, 27) });
    expect(kaal.velden.map((v) => v.k)).toEqual(['Aanvang', 'Jaar']);
    expect(kaal.aftiteling).toBeNull();
    // dezelfde code geeft dezelfde streepjes
    expect(streepjes('TMDB 965150')).toEqual(streepjes('TMDB 965150'));
    expect(streepjes('TMDB 965150')).not.toEqual(streepjes('TMDB 1'));
  });

  it('het aftellen loopt door als de ouder tussendoor opnieuw tekent', async () => {
    // Zo ging het mis: tijdens het verversen op de achtergrond tekende Pick
    // elke ~300 ms opnieuw, en het aftellen begon dan steeds weer bij 3
    const { default: Leader } = await import('../src/components/Leader.jsx');
    const { useState, useEffect } = await import('react');
    const mm = window.matchMedia;
    window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    try {
      const klaar = vi.fn();
      function Ouder() {
        const [, setN] = useState(0);
        useEffect(() => { const t = setInterval(() => setN((n) => n + 1), 250); return () => clearInterval(t); }, []);
        return <Leader onDone={() => klaar()} />;
      }
      render(<Ouder />);
      await act(async () => { vi.advanceTimersByTime(3000); });
      expect(klaar).toHaveBeenCalledTimes(1);
      await act(async () => { vi.advanceTimersByTime(3000); });
      expect(klaar).toHaveBeenCalledTimes(1); // en maar één keer
    } finally {
      vi.useRealTimers();
      window.matchMedia = mm;
    }
  });

  it('het aftellen heeft een vangnet als animatieframes stilvallen', async () => {
    const { default: Leader } = await import('../src/components/Leader.jsx');
    const mm = window.matchMedia;
    const raf = window.requestAnimationFrame;
    window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    window.requestAnimationFrame = () => 0; // tab op de achtergrond: geen frames
    try {
      const klaar = vi.fn();
      render(<Leader onDone={klaar} />);
      await act(async () => { vi.advanceTimersByTime(2000); });
      expect(klaar).not.toHaveBeenCalled();
      await act(async () => { vi.advanceTimersByTime(2000); });
      expect(klaar).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      window.requestAnimationFrame = raf;
      window.matchMedia = mm;
    }
  });

  it('score-recept: de componenten tellen op tot de match-score', async () => {
    const { matchScore } = await import('../src/lib/taste.js');
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
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Programma')[0]);
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
    const { voegNieuweToe } = await import('../src/lib/rows.js');
    expect(voegNieuweToe([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 3 }]).map((f) => f.id)).toEqual([1, 2, 3]);
  });

  it('voor jou: het rijrecept geeft top, favorieten, regisseur, parels en bubbel, zonder dubbele films', async () => {
    const { bouwRecept } = await import('../src/lib/foryou.js');
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
    for (let i = 0; i < 5; i++) list.push(film({ genre_ids: [35], vote: 7.6, votes: 5000, waarde: 0.7, bronnen: ['profiel'] }));
    // klassiekers die je mist: alleen via de canon-bron, met een hoog cijfer
    for (let i = 0; i < 5; i++) list.push(film({ vote: 8.4, votes: 20000, match: 90, waarde: 0.5, bronnen: ['canon'] }));
    // rommel onder de kwaliteitsdrempel (een 9 met 30 stemmen)
    for (let i = 0; i < 5; i++) list.push(film({ votes: 30, vote: 9, bronnen: ['profiel'] }));
    const taste = { genres: { Drama: 0.9, Comedy: 0 } };
    const seedFilms = ['S1', 'S2', 'S3'].map((n) => ({ key: n, name: n }));
    const rijen = bouwRecept(list, { seedFilms, regisseurs: ['R1', 'R2'], taste, dag: 0 });
    expect(rijen.map((r) => r.type)).toEqual(['top', 'seed', 'canon', 'oeuvre', 'parels', 'seed', 'bubbel']);
    // de canon-films (hoogste match!) staan alleen in hun eigen rij, niet in de Top
    expect(rijen[0].films.some((f) => f.bronnen.includes('canon'))).toBe(false);
    expect(rijen.find((r) => r.type === 'canon').films.every((f) => f.bronnen.includes('canon'))).toBe(true);
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

  it('prijslijsten: één rij per dag met winnaars die je niet zag, naast je persoonlijke rijen', async () => {
    const { bouwRecept } = await import('../src/lib/foryou.js');
    const { PRIJSLIJSTEN } = await import('../src/lib/prijzen.js');
    // de meegeleverde lijsten: compleet, zonder dubbele films per lijst
    expect(PRIJSLIJSTEN.map((l) => l.id)).toEqual(['palme', 'oscar', 'leeuw', 'beer', 'internationaal']);
    PRIJSLIJSTEN.forEach((l) => {
      expect(l.films.length).toBeGreaterThanOrEqual(20);
      expect(new Set(l.films.map((f) => f.id)).size).toBe(l.films.length);
      l.films.forEach((f) => { expect(f.id).toBeGreaterThan(0); expect(f.title).toBeTruthy(); expect(f.prijsjaar).toBeGreaterThanOrEqual(1990); });
    });
    let id = 0;
    const film = (extra) => ({ id: ++id, vote: 7.4, votes: 3000, match: 70, waarde: 1, bronnen: [], seeds: [], genre_ids: [18], ...extra });
    const persoonlijk = Array.from({ length: 16 }, (_, i) => film({ waarde: 3 - i * 0.1, bronnen: ['aanbevolen'], seeds: [`S${i % 4}`] }));
    const palme = Array.from({ length: 5 }, () => film({ vote: 7.5, votes: 2000, match: 95, bronnen: ['lijst:palme'] }));
    const oscar = Array.from({ length: 5 }, () => film({ vote: 7.5, votes: 2000, match: 95, bronnen: ['lijst:oscar'] }));
    const lijstRij = (dag) => bouwRecept([...persoonlijk, ...palme, ...oscar], { seedFilms: [], dag }).find((r) => r.type === 'lijst');
    // wisselend per dag, en de winnaars (met de hoogste match!) blijven uit de Top
    expect(new Set([lijstRij(0).lijst, lijstRij(1).lijst])).toEqual(new Set(['oscar', 'palme']));
    const rijen = bouwRecept([...persoonlijk, ...palme, ...oscar], { dag: 0 });
    expect(rijen[0].type).toBe('top');
    expect(rijen[0].films.some((f) => f.bronnen.some((b) => b.startsWith('lijst:')))).toBe(false);
    // zonder één persoonlijke rij geen lijstrij (Voor jou toont dan de lijst)
    expect(bouwRecept([...persoonlijk.slice(0, 3), ...palme], { dag: 0 })).toEqual([]);
  });

  it('voor jou: de thema-rij vraagt twee gedeelde thema\'s, en het label noemt ze', async () => {
    const { bouwRecept } = await import('../src/lib/foryou.js');
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

  it('rijen: de match beslist, de aanbevelingssterkte breekt een gelijkspel', async () => {
    // Gemeten met de meetlat op een echt profiel: de match zet verborgen
    // favorieten veruit het hoogst; de aanbevelingssterkte voorspelde ze slecht.
    const { sorteerOpSterkte, plekGewicht } = await import('../src/lib/rows.js');
    expect(plekGewicht(0, 10)).toBe(1);
    expect(plekGewicht(9, 10)).toBeCloseTo(0.55);
    // sterk aangeraden maar middelmatige match, tegen zwak aangeraden met hoge match
    const sterk = { id: 1, waarde: 3, match: 60 };
    const zwak = { id: 2, waarde: 1.2 * 0.6, match: 80 };
    expect(sorteerOpSterkte([sterk, zwak]).map((f) => f.id)).toEqual([2, 1]);
    // bij gelijke match beslist de sterkte
    expect(sorteerOpSterkte([{ id: 3, waarde: 0.5, match: 70 }, { id: 4, waarde: 3, match: 70 }]).map((f) => f.id)).toEqual([4, 3]);
  });

  it('rijen: regisseurs op sterkte, en een uitstapje buiten hun genre valt uit "Meer van"', async () => {
    const { rangschikRegisseurs, pastInOeuvre } = await import('../src/lib/rows.js');
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
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('picker.watchlist', JSON.stringify([{ key: 'w|2019', name: 'W', year: 2019, uri: '' }]));
    localStorage.setItem('picker.ratings', JSON.stringify({ 'w|2019': 4 }));
    localStorage.setItem('picker.meta', JSON.stringify({ 'w|2019': { id: 1, title: 'W', year: 2019, genres: ['Drama'], vote: 7, votes: 3000, at: Date.now(), recs: [] } }));
    localStorage.setItem('picker.ratedFilms', JSON.stringify([1, 2, 3].map((n) => ({ key: `fav${n}|${2010 + n}`, name: `Fav${n}`, year: 2010 + n, uri: '', rating: 5 }))));
    const oud = [1, 2, 3, 4, 5].map((k) => ({ id: 950 + k, title: `Oud ${k}`, year: 2000, vote: 7.5, votes: 2000, genre_ids: [18] }));
    localStorage.setItem('picker.oeuvres', JSON.stringify({ 'Oude Regisseur': { at: Date.now(), films: oud } }));
    try {
      render(<App />);
      fireEvent.click(screen.getAllByLabelText('Programma')[0]);
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
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('picker.ratedFilms', JSON.stringify([
      { key: 'a|2020', name: 'A', year: 2020, rating: 5 }, { key: 'b|2019', name: 'B', year: 2019, rating: 5 },
      { key: 'c|2018', name: 'C', year: 2018, rating: 4.5 }, { key: 'd|2017', name: 'D', year: 2017, rating: 4.5 },
    ]));
    localStorage.setItem('picker.watchlist', JSON.stringify([{ key: 'a|2020', name: 'A', year: 2020 }]));
    const oeuvreFilms = [1, 2, 3, 4, 5, 6].map((n) => ({ id: 900 + n, title: `Reg Film ${n}`, year: 2000 + n, poster: `/r${n}.jpg`, vote: 7.5, votes: 2000, genre_ids: [18] }));
    localStorage.setItem('picker.oeuvres', JSON.stringify({ Testregisseur: { films: oeuvreFilms, at: Date.now() } }));
    localStorage.setItem('picker.meta', JSON.stringify({ 'a|2020': { id: 1, poster: '/a.jpg', vote: 8, votes: 5000, genres: ['Drama'], director: 'Testregisseur', at: Date.now() } }));
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Programma')[0]); // opent op Voor jou
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

  // Fase 6: dezelfde opzet als hierboven, met een nep-TMDB die details geeft
  const regFixture = () => {
    localStorage.clear();
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('picker.ratedFilms', JSON.stringify([
      { key: 'a|2020', name: 'A', year: 2020, rating: 5 }, { key: 'b|2019', name: 'B', year: 2019, rating: 5 },
      { key: 'c|2018', name: 'C', year: 2018, rating: 4.5 }, { key: 'd|2017', name: 'D', year: 2017, rating: 4.5 },
    ]));
    localStorage.setItem('picker.watchlist', JSON.stringify([{ key: 'a|2020', name: 'A', year: 2020 }]));
    const oeuvreFilms = [1, 2, 3, 4, 5, 6].map((n) => ({ id: 900 + n, title: `Reg Film ${n}`, year: 2000 + n, poster: `/r${n}.jpg`, vote: 7.5, votes: 2000, genre_ids: [18], overview: `Plot ${n}` }));
    localStorage.setItem('picker.oeuvres', JSON.stringify({ Testregisseur: { films: oeuvreFilms, at: Date.now() } }));
    localStorage.setItem('picker.meta', JSON.stringify({ 'a|2020': { id: 1, poster: '/a.jpg', vote: 8, votes: 5000, genres: ['Drama'], director: 'Testregisseur', at: Date.now() } }));
    const calls = [];
    global.fetch = async (url) => {
      const u = String(url);
      calls.push(u);
      const m = u.match(/\/movie\/(9\d\d)\?/);
      const body = m
        ? { id: +m[1], title: `Reg Film ${+m[1] - 900}`, release_date: `${2000 + +m[1] - 900}-01-01`, runtime: 100, genres: [{ id: 18, name: 'Drama' }], vote_average: 7.5, vote_count: 2000, credits: { crew: [{ job: 'Director', name: 'Testregisseur', id: 77 }] } }
        : { results: [] };
      return { ok: true, status: 200, json: async () => body };
    };
    return calls;
  };
  const ls = (k) => JSON.parse(localStorage.getItem(`picker.${k}`) || 'null');

  it('feedback: x vraagt waarom, de reden gaat mee, en "Al gezien" vraagt sterren', async () => {
    const calls = regFixture();
    try {
      render(<App />);
      fireEvent.click(screen.getAllByLabelText('Programma')[0]);
      expect(screen.getByText('Meer van Testregisseur')).toBeTruthy();
      // x: de film is weg, en onderin vraagt de app waarom
      fireEvent.click(screen.getByLabelText('Niet voor mij: Reg Film 1'));
      expect(screen.getByText(/Waarom niet\?/)).toBeTruthy();
      expect(document.body.textContent).toMatch(/je ziet nu iets minder/i);
      // de regisseur is bekend via het oeuvre, dus die keuze staat erbij
      fireEvent.click(screen.getByText('Niet van Testregisseur'));
      await waitFor(() => expect(ls('skipped')?.find((s) => s.id === 901)?.reden).toBe('regisseur'));
      expect(ls('skipped').find((s) => s.id === 901).director).toBe('Testregisseur');
      expect(document.body.textContent).toContain('Films van Testregisseur zakken naar achteren');
      // x op een film die je eigenlijk al zag: terug uit de afwijzingen, als gezien met sterren
      fireEvent.click(screen.getByLabelText('Niet voor mij: Reg Film 2'));
      fireEvent.click(within(document.querySelector('.fy-toast')).getByText('Al gezien'));
      expect(screen.getByText('Je zag Reg Film 2 al. Hoeveel sterren?')).toBeTruthy();
      fireEvent.click(within(document.querySelector('.fy-toast')).getByLabelText('Geef 4 sterren'));
      await waitFor(() => expect(ls('ownRatings')?.['reg film 2|2002']?.rating).toBe(4));
      expect(ls('seen')).toContain('reg film 2|2002');
      expect(ls('skipped').some((s) => s.id === 902)).toBe(false);
      expect(screen.queryByText('Reg Film 2')).toBeNull();
      // de details komen erbij, zodat genres en thema's in het profiel tellen
      await waitFor(() => expect(calls.some((u) => u.includes('/movie/902?'))).toBe(true));
    } finally {
      delete global.fetch;
    }
  });

  it('feedback: het oog op een tegel markeert als gezien, met halve sterren', async () => {
    regFixture();
    try {
      render(<App />);
      fireEvent.click(screen.getAllByLabelText('Programma')[0]);
      fireEvent.click(screen.getByLabelText('Al gezien: Reg Film 3'));
      // de knoppen maken plaats voor de sterren
      expect(screen.queryByLabelText('Al gezien: Reg Film 3')).toBeNull();
      expect(screen.getByText('Hoeveel sterren?')).toBeTruthy();
      fireEvent.click(screen.getByLabelText('Geef 4,5 sterren'));
      await waitFor(() => expect(ls('ownRatings')?.['reg film 3|2003']?.rating).toBe(4.5));
      expect(document.body.textContent).toContain('Reg Film 3 staat als gezien met 4,5 sterren');
      expect(screen.queryByText('Reg Film 3')).toBeNull();
      // zonder sterren kan ook: alleen gezien, geen beoordeling
      fireEvent.click(screen.getByLabelText('Al gezien: Reg Film 4'));
      fireEvent.click(screen.getByText('Zonder sterren'));
      await waitFor(() => expect(ls('seen')).toContain('reg film 4|2004'));
      expect(ls('ownRatings')['reg film 4|2004']).toBeUndefined();
    } finally {
      delete global.fetch;
    }
  });

  it('snel beoordelen: een film per keer, met knoppen en pijltjestoetsen', async () => {
    regFixture();
    try {
      render(<App />);
      fireEvent.click(screen.getAllByLabelText('Programma')[0]);
      fireEvent.click(screen.getByText('Snel beoordelen'));
      const titel = () => document.querySelector('.snel-info h2')?.textContent;
      const eerste = titel();
      expect(eerste).toMatch(/^Reg Film \d$/);
      // wil ik zien: naar de shortlist, en de volgende film schuift door
      fireEvent.click(screen.getByText('Wil ik zien'));
      await waitFor(() => expect(ls('shortlist')?.length).toBe(1));
      expect(titel()).not.toBe(eerste);
      expect(screen.getByText('1 film beoordeeld')).toBeTruthy();
      // pijl links: niet voor mij (zonder tussenvraag, het moet snel)
      const tweede = titel();
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      await waitFor(() => expect(ls('skipped')?.length).toBe(1));
      expect(titel()).not.toBe(tweede);
      expect(document.querySelector('.fy-toast')).toBeNull();
      // weet niet: overslaan telt niet mee
      const derde = titel();
      fireEvent.click(screen.getByText('Weet niet'));
      expect(titel()).not.toBe(derde);
      expect(screen.getByText('2 films beoordeeld')).toBeTruthy();
      // klaar: terug naar Voor jou
      fireEvent.click(screen.getByText('Klaar'));
      expect(document.querySelector('.snel')).toBeNull();
      expect(screen.getByText('Snel beoordelen')).toBeTruthy();
    } finally {
      delete global.fetch;
    }
  });

  it('klassiekers die je mist: een eigen rij uit de canon, zonder wat je al zag', async () => {
    const calls = regFixture();
    const klassiek = [1, 2, 3, 4, 5, 6].map((n) => ({ id: 7700 + n, title: `Klassieker ${n}`, release_date: `${1950 + n}-01-01`, poster_path: `/k${n}.jpg`, vote_average: 8.3, vote_count: 20000, original_language: 'en', overview: '', genre_ids: [18] }));
    const oud = global.fetch;
    global.fetch = async (url) => {
      const u = String(url);
      if (u.includes('/discover/') && u.includes('vote_count.gte=10000') && u.includes('page=1')) {
        calls.push(u);
        return { ok: true, status: 200, json: async () => ({ total_pages: 1, results: klassiek }) };
      }
      return oud(url);
    };
    // Klassieker 1 zag je al (gelogd op Letterboxd)
    localStorage.setItem('picker.watchedLb', JSON.stringify(['klassieker 1|1951']));
    try {
      render(<App />);
      fireEvent.click(screen.getAllByLabelText('Programma')[0]);
      expect(await screen.findByText('Klassiekers die je mist')).toBeTruthy();
      expect(screen.getByText('Klassieker 2')).toBeTruthy();
      expect(screen.queryByText('Klassieker 1')).toBeNull();
      // opgeslagen voor een maand: geen nieuwe aanvragen bij de volgende keer
      expect(JSON.parse(localStorage.getItem('picker.canon')).films.length).toBe(6);
    } finally {
      delete global.fetch;
    }
  });

  it('tegels: de korte reden zegt wat de rij-kop nog niet zegt', async () => {
    const { kortReden } = await import('../src/lib/redenen.js');
    const tr = (k, v) => `${k}:${Object.values(v || {}).join(',')}`;
    const top = { type: 'top' };
    // Top voor jou: oeuvre gaat voor, anders de favoriet, anders het thema
    expect(kortReden({ bronnen: ['oeuvre:Kore-eda', 'aanbevolen'], seeds: ['Aftersun'] }, top, tr)).toBe('verken.kortVan:Kore-eda');
    expect(kortReden({ bronnen: ['aanbevolen'], seeds: ['Aftersun'] }, top, tr)).toBe('verken.kortLijktOp:Aftersun');
    expect(kortReden({ bronnen: ['thema'], gedeeldeThemas: ['grief'] }, top, tr)).toBe('verken.kortOver:grief');
    // in "Omdat je Aftersun..." niet nog eens Aftersun, wel een andere favoriet
    const seedRij = { type: 'seed', naam: 'Aftersun' };
    expect(kortReden({ bronnen: ['aanbevolen'], seeds: ['Aftersun', 'Close'] }, seedRij, tr)).toBe('verken.kortLijktOp:Close');
    expect(kortReden({ bronnen: ['aanbevolen'], seeds: ['Aftersun'], gedeeldeThemas: ['grief'] }, seedRij, tr)).toBe('verken.kortOver:grief');
    // in "Meer van Kore-eda" niet nog eens Kore-eda
    expect(kortReden({ bronnen: ['oeuvre:Kore-eda'], seeds: ['Shoplifters'] }, { type: 'oeuvre', naam: 'Kore-eda' }, tr)).toBe('verken.kortLijktOp:Shoplifters');
    // in de thema-rij geen thema, en zonder echte reden: niets
    expect(kortReden({ bronnen: ['thema'], gedeeldeThemas: ['grief'] }, { type: 'thema' }, tr)).toBeNull();
    expect(kortReden({ bronnen: ['profiel'] }, top, tr)).toBeNull();
    // de lange reden is een hele zin per taal (Engels: "Because you rated A highly")
    const { hoofdreden } = await import('../src/lib/redenen.js');
    expect(hoofdreden({ bronnen: ['aanbevolen'], seeds: ['A'] }, tr, true)).toBe('verken.redenHoog:A');
    expect(hoofdreden({ bronnen: ['aanbevolen'], seeds: ['A'] }, tr, false)).toBe('verken.redenLijst:A,1');
    expect(hoofdreden({ bronnen: ['vergelijkbaar'], seeds: ['A'] }, tr, true)).toBe('verken.redenLijkt:A');
  });

  it('vanavond: voorrang voor je diensten en wat vanavond nog past', async () => {
    const { kiesVanavond, avondRuimte } = await import('../src/lib/foryou.js');
    const f = (id, extra) => ({ id, title: `F${id}`, vote: 7.5, votes: 3000, match: 70, waarde: 1, bronnen: ['aanbevolen'], genre_ids: [18], runtime: 100, flat: [], ...extra });
    const tienUur = new Date(2026, 10, 6, 22, 0);
    expect(avondRuimte(tienUur)).toBe(150);
    expect(avondRuimte(new Date(2026, 10, 6, 14, 0))).toBe(270);
    // op jouw dienst wint van een iets betere match elders
    const lijst = [f(1, { match: 75 }), f(2, { flat: ['Netflix'] })];
    const k = kiesVanavond(lijst, { mijnDiensten: ['Netflix'], nu: tienUur });
    expect(k.film.id).toBe(2);
    expect(k.dienst).toBe('Netflix');
    expect(k.past).toBe(true);
    // om tien uur valt een film van drie uur af
    const lang = kiesVanavond([f(3, { runtime: 180, flat: ['Netflix'], match: 80 }), f(4, { flat: ['Netflix'] })], { mijnDiensten: ['Netflix'], nu: tienUur });
    expect(lang.film.id).toBe(4);
    // weggeklikt via "Andere" en zonder looptijd (nog geen details): niet kiezen
    expect(kiesVanavond(lijst, { mijnDiensten: ['Netflix'], nu: tienUur, overslaan: new Set([2]) }).film.id).toBe(1);
    expect(kiesVanavond([f(5, { runtime: null })], { nu: tienUur })).toBeNull();
  });

  it('vanavond: een grote aanrader bovenaan, niet dubbel in de rijen, met "Andere"', async () => {
    regFixture();
    try {
      render(<App />);
      fireEvent.click(screen.getAllByLabelText('Programma')[0]);
      // zodra de details er zijn (looptijd), verschijnt de aanrader
      await waitFor(() => expect(document.querySelector('.vanavond')).toBeTruthy());
      const titel = () => document.querySelector('.vanavond .vtitle').textContent;
      const tegels = () => [...document.querySelectorAll('.rec-tile .t')].map((t) => t.textContent);
      const eerste = titel();
      expect(eerste).toMatch(/^Reg Film \d$/);
      expect(tegels()).not.toContain(eerste);
      expect(document.querySelector('.vanavond').textContent).toContain('100 min');
      // de volledige details (regisseur) komen erbij
      await waitFor(() => expect(document.querySelector('.vanavond .vmeta').textContent).toContain('Testregisseur'));
      // een andere: een nieuwe aanrader, de vorige staat weer gewoon in de rij
      fireEvent.click(screen.getByText('Een andere'));
      expect(titel()).not.toBe(eerste);
      expect(tegels()).toContain(eerste);
      // op de shortlist: weg uit vanavond, en de volgende komt
      const tweede = titel();
      fireEvent.click(within(document.querySelector('.vanavond')).getByText('Op shortlist'));
      await waitFor(() => expect(ls('shortlist')?.map((s) => s.title)).toEqual([tweede]));
      expect(titel()).not.toBe(tweede);
    } finally {
      delete global.fetch;
    }
  });

  it('filmkleur: uit de poster, altijd diep genoeg voor witte tekst', async () => {
    const { tintUitPixels } = await import('../src/lib/filmkleur.js');
    const pixels = (rgb, n = 40) => { const d = new Uint8ClampedArray(n * 4); for (let i = 0; i < n; i++) d.set([...rgb, 255], i * 4); return d; };
    const lum = (hex) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrastMetWit = (hex) => 1.05 / (lum(hex) + 0.05);
    // fel geel, fel rood, wit, zwart, teal: steeds een diepe tint met genoeg contrast
    for (const rgb of [[250, 220, 40], [220, 30, 30], [255, 255, 255], [0, 0, 0], [40, 160, 170]]) {
      const kleur = tintUitPixels(pixels(rgb));
      expect(kleur).toMatch(/^#[0-9a-f]{6}$/);
      expect(contrastMetWit(kleur)).toBeGreaterThanOrEqual(4.5);
    }
    // de tint volgt de poster: een rode poster geeft een rode tint
    const rood = tintUitPixels(pixels([220, 30, 30]));
    expect(parseInt(rood.slice(1, 3), 16)).toBeGreaterThan(parseInt(rood.slice(5, 7), 16));
  });

  it('opgeblazen cijfers: fans en bots herkend, kleine arthousefilms niet', async () => {
    const { opgeblazenReden } = await import('../src/lib/opgeblazen.js');
    // gemeten op TMDB (november 2026)
    expect(opgeblazenReden({ vote: 8.4, votes: 2485, lijsten: 134, bios: false })).toBe('streaming'); // Gabriel's Inferno
    expect(opgeblazenReden({ vote: 8.3, votes: 1569, lijsten: 76, bios: true })).toBe('lijsten'); // deel II
    expect(opgeblazenReden({ vote: 9.9, votes: 143, lijsten: 9, bios: true })).toBe('onmogelijk'); // The Way to the Heart
    expect(opgeblazenReden({ vote: 9.9, votes: 143 })).toBe('onmogelijk'); // ook zonder details
    expect(opgeblazenReden({ vote: 8.04, votes: 2974, lijsten: 228, bios: false })).toBe('streaming'); // Purple Hearts
    // goede films, ook kleine en streaming-only: niet geraakt
    expect(opgeblazenReden({ vote: 7.6, votes: 2041, lijsten: 302, bios: true })).toBeNull(); // Aftersun
    expect(opgeblazenReden({ vote: 8.3, votes: 523, lijsten: 50, bios: true })).toBeNull(); // Radical
    expect(opgeblazenReden({ vote: 7.8, votes: 4275, lijsten: 407, bios: false })).toBeNull(); // Finch (Apple TV+)
    expect(opgeblazenReden({ vote: 7.2, votes: 196, lijsten: 24, bios: true })).toBeNull(); // The Blue Caftan
    expect(opgeblazenReden({ vote: 8.5, votes: 37242, lijsten: 3139, bios: true })).toBeNull(); // The Dark Knight
    // zonder details weten we het (nog) niet
    expect(opgeblazenReden({ vote: 8.4, votes: 2485 })).toBeNull();
  });

  it('opgeblazen cijfers: een mild TMDB-publiek (mainstream-romance) telt alleen met een tweede mening', async () => {
    const { opgeblazenReden, beoordeelCijfer } = await import('../src/lib/opgeblazen.js');
    const { appScore } = await import('../src/lib/pick.js');
    const signaal = ([, vote, votes, lijsten]) => opgeblazenReden({ vote, votes, lijsten, bios: true });
    // gemeten op TMDB (november 2026): [titel, cijfer, stemmen, lijsten]
    const romances = [
      ['The Best of Me', 7.48, 2775, 173], ['Midnight Sun', 7.8, 3587, 193], ['Love, Rosie', 7.8, 6621, 309],
      ['If I Stay', 7.3, 4379, 213], ['Everything, Everything', 7.24, 3783, 146], ['The Last Song', 7.23, 3430, 210],
      ['The Choice', 7.2, 1999, 138], ['Through My Window', 7.3, 3397, 121],
    ];
    expect(romances.map((r) => [r[0], signaal(r)])).toEqual(romances.map((r) => [r[0], 'publiek']));
    // veertig goede films met evenveel stemmen, ook romantische: geen enkele geraakt
    const goed = [
      ['Aftersun', 7.7, 2044, 302], ['First Cow', 7.03, 569, 160], ['Close', 7.8, 1096, 143], ['Past Lives', 7.69, 2545, 367],
      ['Paterson', 7.1, 2151, 219], ['Columbus', 7.1, 517, 109], ['Certified Copy', 7.0, 470, 93], ['Shoplifters', 7.8, 2412, 275],
      ['Drive My Car', 7.43, 1593, 243], ['Petite Maman', 7.1, 491, 97], ['The Worst Person in the World', 7.44, 2028, 275],
      ['Cold War', 7.4, 1643, 175], ['Phantom Thread', 7.3, 3913, 479], ['Carol', 7.49, 4073, 405], ['Blue Valentine', 7.0, 3663, 368],
      ['Before Sunrise', 8.0, 4962, 572], ['Before Midnight', 7.5, 2842, 378], ['Lost in Translation', 7.38, 8427, 776],
      ['Her', 7.83, 15817, 1121], ['Call Me by Your Name', 8.07, 13042, 691], ['About Time', 7.9, 9642, 801],
      ['Anatomy of a Fall', 7.5, 3569, 372], ['The Zone of Interest', 7.01, 2824, 372], ['Perfect Days', 7.8, 2155, 245],
      ['Leave No Trace', 6.8, 1435, 237], ['Never Rarely Sometimes Always', 7.1, 612, 116], ['The Florida Project', 7.42, 3232, 395],
      ['Moonlight', 7.35, 7758, 767], ['Lady Bird', 7.25, 9260, 671], ['Portrait of a Lady on Fire', 8.1, 3101, 436],
      ['Atonement', 7.6, 4902, 612], ['The Fault in Our Stars', 7.59, 11771, 582], ['Pride & Prejudice', 8.05, 9060, 652],
      ['In the Mood for Love', 8.09, 3457, 450], ['Happy Together', 7.6, 845, 156], ['Fallen Leaves', 7.11, 793, 72],
      ['Minari', 7.35, 2058, 302], ['Nomadland', 7.16, 3523, 412], ['Still Walking', 7.79, 477, 110], ['After Yang', 6.4, 558, 144],
    ];
    expect(goed.filter((r) => signaal(r)).map((r) => r[0])).toEqual([]);

    const bestOfMe = { vote: 7.48, votes: 2775, lijsten: 173, bios: true };
    // zonder tweede mening verandert er niets: een vermoeden is geen bewijs
    expect(beoordeelCijfer(bestOfMe)).toEqual({ opgeblazen: null, cijfer: 7.48, bevestigd: false });
    // IMDb 6,7 en Metacritic 29: samen 4,8
    expect(beoordeelCijfer({ ...bestOfMe, imdb: 6.7, mc: 29 })).toEqual({ opgeblazen: 'publiek', cijfer: 4.8, bevestigd: false });
    expect(beoordeelCijfer({ ...bestOfMe, ext: { imdb: 6.7, mc: 29 } }).cijfer).toBe(4.8); // uit een filmkaart
    expect(beoordeelCijfer({ ...bestOfMe, imdb: 6.7 }).cijfer).toBe(6.7); // alleen IMDb bekend
    // IMDb en critici dicht bij TMDB: het cijfer staat
    expect(beoordeelCijfer({ ...bestOfMe, imdb: 7.3, mc: 74 })).toEqual({ opgeblazen: null, cijfer: 7.48, bevestigd: true });
    // in een verdachte reeks zonder tweede mening: onbetrouwbaar, zoals voorheen
    expect(beoordeelCijfer(bestOfMe, { reeksVerdacht: true })).toMatchObject({ opgeblazen: 'reeks', cijfer: null });
    // de ShutterScore laat het milde TMDB-cijfer weg
    const metTmdb = appScore({ vote: 7.48, votes: 2775, ext: { imdb: 6.7, mc: 29 } });
    expect(appScore({ ...bestOfMe, ext: { imdb: 6.7, mc: 29 } })).toBeLessThan(metTmdb);
  });

  it('opgeblazen cijfers: Voor jou rekent met IMDb en critici, en een filmkaart zegt het eerlijk', async () => {
    const { scoorKandidaten, bepaalSeeds } = await import('../src/lib/kandidaten.js');
    const { buildTaste } = await import('../src/lib/taste.js');
    const { degelijk } = await import('../src/lib/foryou.js');
    const f = (id, title) => ({ id, title, year: 2014, vote: 7.48, votes: 2775, genre_ids: [18, 10749] });
    const meta = {
      'a|2000': { id: 1, genres: ['Drama'], recs: [f(20, 'Met mening'), f(21, 'Zonder mening')] },
      'b|2001': { id: 2, genres: ['Drama'], recs: [] },
      'c|2002': { id: 3, genres: ['Drama'], recs: [] },
    };
    const ratedFilms = [
      { key: 'a|2000', name: 'A', year: 2000, rating: 5 }, { key: 'b|2001', name: 'B', year: 2001, rating: 5 },
      { key: 'c|2002', name: 'C', year: 2002, rating: 4.5 },
    ];
    const det = (extra) => ({ v: 3, regio: 'NL', at: Date.now(), runtime: 117, flat: [], lijsten: 173, bios: true, ...extra });
    const details = { 20: det({ imdb: 6.7, mc: 29 }), 21: det({}) };
    const basis = { watchlist: [], meta, ratedFilms, seeds: bepaalSeeds({ watchlist: [], ratedFilms, meta }), regisseurs: [], taste: buildTaste({ watchlist: [], ratedFilms, meta }), uitleg: (k) => k };
    const zonder = Object.fromEntries(scoorKandidaten(basis).recs.map((r) => [r.title, r]));
    const met = Object.fromEntries(scoorKandidaten({ ...basis, details }).recs.map((r) => [r.title, r]));
    expect(met['Met mening']).toMatchObject({ opgeblazen: 'publiek', vote: 4.8, tmdbVote: 7.48 });
    expect(met['Met mening'].redenen).toContain('verken.opgeblazenPubliek');
    expect(met['Met mening'].match).toBeLessThan(zonder['Met mening'].match);
    // onder de kwaliteitsdrempel: hij komt in geen enkele rij meer
    expect(degelijk(met['Met mening'])).toBe(false);
    // zonder tweede mening: precies als voorheen
    expect(met['Zonder mening'].opgeblazen).toBeUndefined();
    expect(met['Zonder mening'].match).toBe(zonder['Zonder mening'].match);

    // de filmkaart: eigen uitleg (geen bots), en huren en kopen bij dezelfde dienst een keer
    const { default: Winner } = await import('../src/components/Winner.jsx');
    render(<Winner film={{ key: 'tbom|2014', name: 'The Best of Me', year: 2014 }} meta={{
      vote: 7.48, votes: 2775, lijsten: 173, bios: true, ext: { imdb: 6.7, mc: 29, rt: 12 }, at: Date.now(),
      flat: [], rent: ['Path\u00e9 Thuis', 'Amazon Video', 'Path\u00e9 Thuis', 'Amazon Video'], jwLink: 'https://www.justwatch.com/nl',
    }} />);
    expect(screen.getByText('Het TMDB-publiek is hier veel milder dan IMDb en de critici. Voor jou rekent met hun gemiddelde (4,8).')).toBeTruthy();
    expect(screen.getAllByText('Huur/koop: Path\u00e9 Thuis').length).toBe(1);
    expect(screen.getAllByText('Huur/koop: Amazon Video').length).toBe(1);
    expect(document.body.textContent).not.toContain('bots');
  });

  it('opgeblazen cijfers: neutraal meetellen, de reeks gaat mee, en x op één deel verbergt de rest', async () => {
    const { scoorKandidaten, bepaalSeeds } = await import('../src/lib/kandidaten.js');
    const { buildTaste } = await import('../src/lib/taste.js');
    const { bouwRecept, kiesVanavond, isKlassieker } = await import('../src/lib/foryou.js');
    const f = (id, title, vote, votes) => ({ id, title, year: 2020, vote, votes, genre_ids: [18, 10749] });
    const meta = {
      'a|2000': { id: 1, genres: ['Drama'], recs: [f(10, 'Inferno I', 8.4, 2485), f(11, 'Inferno II', 8.3, 1569), f(12, 'Echte Film', 7.6, 2041)] },
      'b|2001': { id: 2, genres: ['Drama'], recs: [] },
      'c|2002': { id: 3, genres: ['Drama'], recs: [] },
    };
    const ratedFilms = [
      { key: 'a|2000', name: 'A', year: 2000, rating: 5 }, { key: 'b|2001', name: 'B', year: 2001, rating: 5 },
      { key: 'c|2002', name: 'C', year: 2002, rating: 4.5 },
    ];
    const det = (lijsten, bios, collectie) => ({ v: 3, regio: 'NL', at: Date.now(), runtime: 110, flat: [], lijsten, bios, collectie });
    // deel I is verdacht (geen bioscoop, weinig lijsten); deel II op zichzelf niet, maar zit in dezelfde reeks
    const details = { 10: det(134, false, 77), 11: det(400, true, 77), 12: det(302, true, null) };
    const basis = { watchlist: [], meta, ratedFilms, seeds: bepaalSeeds({ watchlist: [], ratedFilms, meta }), regisseurs: [], taste: buildTaste({ watchlist: [], ratedFilms, meta }), uitleg: (k) => k };
    const zonder = Object.fromEntries(scoorKandidaten(basis).recs.map((r) => [r.title, r]));
    const recs = scoorKandidaten({ ...basis, details }).recs;
    const met = Object.fromEntries(recs.map((r) => [r.title, r]));
    expect(met['Inferno I'].opgeblazen).toBe('streaming');
    expect(met['Inferno II'].opgeblazen).toBe('reeks');
    expect(met['Echte Film'].opgeblazen).toBeUndefined();
    // het hoge cijfer telt niet meer mee: lagere match, met een eerlijke reden
    expect(met['Inferno I'].match).toBeLessThan(zonder['Inferno I'].match);
    expect(met['Inferno I'].redenen).toContain('verken.opgeblazenUitleg');
    expect(met['Echte Film'].match).toBe(zonder['Echte Film'].match);
    // nooit Vanavond, nooit een klassieker
    expect(kiesVanavond(recs).film.title).toBe('Echte Film');
    expect(isKlassieker({ ...met['Inferno I'], bronnen: ['canon'] })).toBe(false);
    // geen plek in de rijen die op het cijfer draaien (Top, parels, bubbel)
    const rijen = bouwRecept(recs, { dag: 0 });
    expect(rijen.filter((r) => ['top', 'parels', 'bubbel', 'canon'].includes(r.type)).some((r) => r.films.some((x) => x.opgeblazen))).toBe(false);
    // x op deel I met de reeks erbij: deel II verdwijnt ook
    const naX = scoorKandidaten({ ...basis, details, skipped: [{ id: 10, title: 'Inferno I', genre_ids: [18], collectie: 77 }] }).recs.map((r) => r.title);
    expect(naX).toEqual(['Echte Film']);
  });

  it('opgeblazen cijfers: IMDb als tweede mening bevestigt of zet recht', async () => {
    const { beoordeelCijfer } = await import('../src/lib/opgeblazen.js');
    const { scoorKandidaten, bepaalSeeds } = await import('../src/lib/kandidaten.js');
    const { buildTaste } = await import('../src/lib/taste.js');
    const { appScore } = await import('../src/lib/pick.js');
    const { bouwRecept } = await import('../src/lib/foryou.js');
    // verdacht volgens TMDB, maar IMDb bevestigt (minder dan een punt lager): gewoon geliefd
    expect(beoordeelCijfer({ vote: 8.0, votes: 378, lijsten: 25, bios: true, imdb: 7.6 })).toEqual({ opgeblazen: null, cijfer: 8.0, bevestigd: true });
    // IMDb ligt veel lager: rekenen met IMDb
    expect(beoordeelCijfer({ vote: 8.3, votes: 1093, lijsten: 74, bios: false, imdb: 6.5 })).toEqual({ opgeblazen: 'streaming', cijfer: 6.5, bevestigd: false });
    // geen IMDb: onbetrouwbaar
    expect(beoordeelCijfer({ vote: 8.3, votes: 1093, lijsten: 74, bios: false }).cijfer).toBeNull();
    // in de motor: het IMDb-cijfer telt, de Latijns-Amerikaanse parel blijft gewoon staan
    const f = (id, title, vote, votes) => ({ id, title, year: 2020, vote, votes, genre_ids: [18] });
    const meta = {
      'a|2000': { id: 1, genres: ['Drama'], recs: [f(10, 'Inferno III', 8.3, 1093), f(11, 'Bajo la misma luna', 8.0, 378)] },
      'b|2001': { id: 2, genres: ['Drama'], recs: [] },
      'c|2002': { id: 3, genres: ['Drama'], recs: [] },
    };
    const ratedFilms = [
      { key: 'a|2000', name: 'A', year: 2000, rating: 5 }, { key: 'b|2001', name: 'B', year: 2001, rating: 5 },
      { key: 'c|2002', name: 'C', year: 2002, rating: 4.5 },
    ];
    const det = (extra) => ({ v: 3, regio: 'NL', at: Date.now(), runtime: 110, flat: [], ...extra });
    const details = { 10: det({ lijsten: 74, bios: false, imdb: 6.5 }), 11: det({ lijsten: 25, bios: true, imdb: 7.6 }) };
    const recs = scoorKandidaten({ watchlist: [], meta, ratedFilms, seeds: bepaalSeeds({ watchlist: [], ratedFilms, meta }), regisseurs: [], taste: buildTaste({ watchlist: [], ratedFilms, meta }), details, uitleg: (k, v) => `${k}:${v?.cijfer ?? ''}` }).recs;
    const r = Object.fromEntries(recs.map((x) => [x.title, x]));
    expect(r['Inferno III']).toMatchObject({ opgeblazen: 'streaming', vote: 6.5, tmdbVote: 8.3 });
    expect(r['Inferno III'].onbetrouwbaar).toBeUndefined();
    expect(r['Inferno III'].redenen.some((x) => x.startsWith('verken.opgeblazenImdb'))).toBe(true);
    expect(r['Bajo la misma luna'].opgeblazen).toBeUndefined();
    expect(r['Bajo la misma luna'].vote).toBe(8.0);
    // de bevestigde parel mag in Verborgen parels, de rechtgezette (6,5) haalt de lat niet
    const parels = bouwRecept([...recs, ...Array.from({ length: 6 }, (_, i) => ({ id: 900 + i, title: `P${i}`, vote: 7.4, votes: 600, match: 60, waarde: 1, bronnen: ['aanbevolen'], seeds: [`S${i % 4}`], genre_ids: [18] }))], { dag: 0 })
      .find((x) => x.type === 'parels');
    expect(parels.films.map((x) => x.title)).toContain('Bajo la misma luna');
    expect(parels.films.map((x) => x.title)).not.toContain('Inferno III');
    // de ShutterScore laat een opgeblazen TMDB-cijfer weg, een bevestigd niet
    expect(appScore({ vote: 8.3, votes: 1093, lijsten: 74, bios: false, ext: { imdb: 6.5 } })).toBe(6.5);
    expect(appScore({ vote: 8.0, votes: 378, lijsten: 25, bios: true, ext: { imdb: 7.6 } })).toBeGreaterThan(7.6);
  });

  it('kandidaat-details: wat deze sessie is opgehaald, valt niet uit een volle cache', async () => {
    const { snoeiDetails } = await import('../src/lib/useForYou.js');
    const nu = Date.now();
    // 400 oude, en 5 die deze sessie het eerst (dus het oudst van de sessie) zijn opgehaald
    const map = {};
    for (let i = 0; i < 400; i++) map[i] = { at: nu - 1000 - i };
    for (let i = 1000; i < 1005; i++) map[i] = { at: nu - 5000 };
    const uit = snoeiDetails(map, new Set([1000, 1001, 1002, 1003, 1004]));
    expect(Object.keys(uit).length).toBe(300);
    [1000, 1001, 1002, 1003, 1004].forEach((id) => expect(uit[id]).toBeTruthy());
  });

  it('feedback: redenen sturen de motor (genre, mainstream, regisseur)', async () => {
    const { scoorKandidaten, bepaalSeeds } = await import('../src/lib/kandidaten.js');
    const { rangschikRegisseurs } = await import('../src/lib/rows.js');
    const { buildTaste } = await import('../src/lib/taste.js');
    const f = (id, title, votes = 2000) => ({ id, title, year: 2010, vote: 7.5, votes, genre_ids: [18] });
    const meta = {
      'a|2000': { id: 1, genres: ['Drama'], director: 'D', recs: [f(10, 'Klein'), f(11, 'Groot', 60000)] },
      'b|2001': { id: 2, genres: ['Drama'], director: 'D', recs: [] },
      'e|2003': { id: 4, genres: ['Drama'], recs: [] },
    };
    const ratedFilms = [
      { key: 'a|2000', name: 'A', year: 2000, rating: 5 }, { key: 'b|2001', name: 'B', year: 2001, rating: 5 },
      { key: 'e|2003', name: 'E', year: 2003, rating: 4.5 },
    ];
    const oeuvres = { D: { at: Date.now(), films: [f(20, 'Oeuvrefilm')] } };
    const seeds = bepaalSeeds({ watchlist: [], ratedFilms, meta });
    const taste = buildTaste({ watchlist: [], ratedFilms, meta });
    const basis = { watchlist: [], meta, ratedFilms, oeuvres, seeds, regisseurs: rangschikRegisseurs(seeds, meta), taste };
    const scoor = (skipped) => Object.fromEntries(scoorKandidaten({ ...basis, skipped }).recs.map((r) => [r.title, r]));
    const zonder = scoor([]);
    // te mainstream: wat minstens zo bekend is als de afgewezen film zakt, de rest niet
    const mainstream = scoor([{ id: 99, genre_ids: [18], votes: 50000, reden: 'mainstream' }]);
    expect(mainstream.Groot.match).toBe(Math.max(0, zonder.Groot.match - 12));
    expect(mainstream.Groot.redenen).toContain('verken.redenMainstreamUitleg');
    expect(mainstream.Klein.match).toBe(zonder.Klein.match);
    // de regisseur: zijn oeuvre zakt ver weg
    const regisseur = scoor([{ id: 98, genre_ids: [18], director: 'D', reden: 'regisseur' }]);
    expect(regisseur.Oeuvrefilm.waarde).toBeLessThan(zonder.Oeuvrefilm.waarde * 0.3);
    expect(regisseur.Klein.waarde).toBe(zonder.Klein.waarde);
    // niet mijn genre weegt zwaarder dan een kale x
    const basisT = { watchlist: [], ratedFilms: [{ key: 'x|2000', year: 2000, rating: 4 }], meta: { 'x|2000': { genres: ['Drama'], votes: 100 } } };
    const kaal = buildTaste({ ...basisT, skipped: [{ id: 1, genre_ids: [35] }] });
    const genre = buildTaste({ ...basisT, skipped: [{ id: 1, genre_ids: [35], reden: 'genre' }] });
    const mainstreamT = buildTaste({ ...basisT, skipped: [{ id: 1, genre_ids: [35], reden: 'mainstream' }] });
    expect(genre.genres.Comedy ?? 0).toBeLessThan(kaal.genres.Comedy ?? 0);
    expect(mainstreamT.genres.Comedy ?? 0).toBeGreaterThan(kaal.genres.Comedy ?? 0);
  });
});
