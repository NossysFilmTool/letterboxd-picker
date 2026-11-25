// De rondleiding (lib/rondleiding.js, components/Rondleiding.jsx): de ouvreuse met de zaklamp.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, screen, cleanup, within, waitFor, act } from '@testing-library/react';
import App from '../src/App.jsx';
import { seed, rKnop, rInstellingen, rDeel, rVerder, rStart, rVolgende } from './helpers.jsx';

describe('de rondleiding', () => {
  beforeEach(() => { cleanup(); seed(); });

  const bronTekst = async () => {
    const { readFileSync, readdirSync, statSync } = await import('fs');
    const { join } = await import('path');
    const uit = [];
    const loop = (map) => readdirSync(map).forEach((n) => {
      const p = join(map, n);
      if (statSync(p).isDirectory()) loop(p);
      else if (/\.jsx?$/.test(n)) uit.push(readFileSync(p, 'utf-8'));
    });
    loop('./src');
    return uit.join('\n');
  };

  it('elk doel heeft een anker in de tool, en elk anker hoort bij een stap', async () => {
    const { HOOFDSTUKKEN } = await import('../src/lib/rondleiding.js');
    const tekst = await bronTekst();
    // data-uitleg="..." of een prop die het doorgeeft (Rubriek uitleg, AvondVraag anker)
    const ankers = new Set([
      ...[...tekst.matchAll(/(?:data-uitleg|\buitleg|\banker)="([a-z0-9-]+)"/g)].map((m) => m[1]),
      // of alleen op de eerste: data-uitleg={eerste ? 'naam' : undefined}
      ...[...tekst.matchAll(/(?:data-uitleg|\buitleg)=\{[^}]*?'([a-z0-9-]+)'/g)].map((m) => m[1]),
    ]);
    const gebruikt = new Set();
    HOOFDSTUKKEN.forEach((h) => h.stappen.forEach((s) => {
      [s.doel, s.doe?.toon, s.voor?.klik, ...[].concat(s.voor?.sluit || [])].filter(Boolean).forEach((a) => gebruikt.add(a));
    }));
    // en wat een stap alleen controleert: heeft('naam'), vind?.('naam'), opScherm(tab, 'naam')
    const { readFileSync } = await import('fs');
    const regels = readFileSync('./src/lib/rondleiding.js', 'utf-8');
    [...regels.matchAll(/(?:heeft|vind\?\.)\('([a-z0-9-]+)'\)|opScherm\('[a-z]+', '([a-z0-9-]+)'\)/g)]
      .forEach((m) => gebruikt.add(m[1] || m[2]));
    expect([...gebruikt].filter((a) => !ankers.has(a))).toEqual([]);
    expect([...ankers].filter((a) => !gebruikt.has(a))).toEqual([]);
  });

  it('elke tekst staat in nl en en, met dezelfde plekhouders, en wordt gebruikt', async () => {
    const { HOOFDSTUKKEN } = await import('../src/lib/rondleiding.js');
    const nl = (await import('../src/lib/dict/nl.js')).default;
    const en = (await import('../src/lib/dict/en.js')).default;
    const haal = (d, k) => k.split('.').reduce((o, x) => (o == null ? o : o[x]), d);
    const plek = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    const plat = (o, pre, uit = []) => {
      Object.entries(o).forEach(([k, v]) => (v && typeof v === 'object' ? plat(v, `${pre}.${k}`, uit) : uit.push(`${pre}.${k}`)));
      return uit;
    };
    const stapSleutels = [];
    HOOFDSTUKKEN.forEach((h) => {
      // een stap mag niet heten zoals de titel of de zoekwoorden van zijn hoofdstuk
      h.stappen.forEach((s) => expect(['titel', 'zoek'], `${h.id}.${s.id}`).not.toContain(s.id));
      stapSleutels.push(`uitleg.h.${h.id}.titel`, `uitleg.h.${h.id}.zoek`);
      h.stappen.forEach((s) => {
        const b = `uitleg.h.${h.id}.${s.id}`;
        stapSleutels.push(`${b}.kop`, `${b}.tekst`);
        if (s.meer) stapSleutels.push(`${b}.meer`);
        if (s.vb) stapSleutels.push(`${b}.vb`);
        if (s.doe) stapSleutels.push(`${b}.doe`);
        if (s.doe?.knop) stapSleutels.push(`uitleg.knopDoe.${s.doe.knop}`);
        if (s.leeg) stapSleutels.push(`${b}.leeg`);
        // elke stap hoort bij een deel, en een naslagstap heeft geen tweede tekst
        expect(typeof s.deel, `${h.id}.${s.id}`).toBe('string');
        if (s.naslag) expect(s.meer, `${h.id}.${s.id}`).toBeFalsy();
      });
    });
    const nlAlle = plat(nl.uitleg, 'uitleg');
    expect(nlAlle.slice().sort()).toEqual(plat(en.uitleg, 'uitleg').sort());
    stapSleutels.forEach((k) => {
      expect(typeof haal(nl, k), k).toBe('string');
      expect(typeof haal(en, k), k).toBe('string');
    });
    nlAlle.forEach((k) => expect(plek(haal(en, k)), k).toBe(plek(haal(nl, k))));
    // niets staat er voor niets: een stap, of de motor en het programma zelf
    const tekst = await bronTekst();
    nlAlle.filter((k) => /^uitleg\.(h|knopDoe)\./.test(k)).forEach((k) => expect(stapSleutels.includes(k), k).toBe(true));
    nlAlle.filter((k) => !/^uitleg\.(h|knopDoe)\./.test(k)).forEach((k) => expect(tekst.includes(`'${k}'`), k).toBe(true));
    // onderweg gevonden: de tooltip bij "geen film" had geen tekst
    expect(nl.setup.unignoreTitle).toBeTruthy();
    expect(en.setup.unignoreTitle).toBeTruthy();
  });

  it('dun: zeven hoofdstukken, een korte rondgang, en kernteksten van een paar zinnen', async () => {
    const { HOOFDSTUKKEN } = await import('../src/lib/rondleiding.js');
    const nl = (await import('../src/lib/dict/nl.js')).default;
    const en = (await import('../src/lib/dict/en.js')).default;
    expect(HOOFDSTUKKEN.map((h) => h.id)).toEqual(['welkom', 'vanavond', 'archief', 'programma', 'samen', 'jaarboek', 'setup']);
    const kern = HOOFDSTUKKEN.flatMap((h) => h.stappen.filter((s) => !s.naslag).map((s) => [h, s]));
    expect(kern.length).toBeLessThanOrEqual(40);
    HOOFDSTUKKEN.forEach((h) => expect(h.stappen.filter((s) => !s.naslag).length, h.id).toBeLessThanOrEqual(7));
    kern.forEach(([h, s]) => [nl, en].forEach((d) => {
      const t = d.uitleg.h[h.id][s.id].tekst;
      expect(t.split(/\s+/).length, `${h.id}.${s.id}: ${t}`).toBeLessThanOrEqual(30);
    }));
  });

  it('vanzelf alleen in een uitgebrachte versie en één keer; in de tests niet', async () => {
    const { uitlegAutomatisch } = await import('../src/lib/rondleiding.js');
    const leeg = { versie: '5.8.0', uitleg: {}, watchlist: 0, demoMode: false };
    expect(uitlegAutomatisch(leeg)).toBe('welkom');
    expect(uitlegAutomatisch({ ...leeg, watchlist: 12 })).toBe('melding');
    expect(uitlegAutomatisch({ ...leeg, demoMode: true })).toBe('melding');
    expect(uitlegAutomatisch({ ...leeg, versie: '5.8.0-beta.2' })).toBe(null);
    expect(uitlegAutomatisch({ ...leeg, versie: 'dev' })).toBe(null);
    expect(uitlegAutomatisch({ ...leeg, versie: null })).toBe(null);
    expect(uitlegAutomatisch({ ...leeg, uitleg: { welkom: 'zelf' } })).toBe(null);
    expect(uitlegAutomatisch({ ...leeg, watchlist: 12, uitleg: { welkom: 'melding' } })).toBe(null);
    render(<App />);
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    expect(document.querySelector('.uitleg')).toBeNull();
    expect(document.querySelector('.uitleg-programma')).toBeNull();
  });

  it('?uitleg op een leeg apparaat: het welkom, met de code voor gasten', async () => {
    localStorage.clear();
    localStorage.setItem('picker.settings', JSON.stringify({ lang: 'nl' }));
    window.history.replaceState(null, '', '/?uitleg');
    try {
      render(<App />);
      const welkom = await screen.findByRole('dialog', { name: 'Welkom in de bioscoop' });
      expect(location.search).toBe('');
      expect(welkom.textContent).toContain('In drie minuten');
      expect(welkom.textContent).toContain('Kom je alleen meestemmen? Vul de code in.');
      expect(welkom.textContent).toContain('altijd onder Uitleg');
      fireEvent.click(within(welkom).getByRole('button', { name: 'Ik kijk zelf wel rond' }));
      expect(screen.queryByRole('dialog', { name: 'Welkom in de bioscoop' })).toBeNull();
      expect(rInstellingen().uitleg.welkom).toBe('zelf');
      expect(document.body.textContent).toContain('Wat kijken we vanavond?');
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });

  it('Uitleg opent het programma; zoeken vindt het hoofdstuk en de stap', () => {
    render(<App />);
    expect(rKnop().getAttribute('aria-label')).toBe('Uitleg');
    fireEvent.click(rKnop());
    const p = screen.getByRole('dialog', { name: 'Uitleg' });
    expect(p.textContent).toContain('Welkom en je lijst laden');
    expect(p.textContent).toContain('2 min');
    expect(p.querySelectorAll('.uitleg-regels:not(.hier) li')).toHaveLength(7);
    const zoek = within(p).getByLabelText('Zoek in de uitleg');
    expect(zoek.getAttribute('placeholder')).toBe('Waar wil je uitleg over?');
    fireEvent.change(zoek, { target: { value: 'Export' } });
    expect(p.textContent).toContain('Bij: Je Letterboxd-export');
    // ook wat alleen in de langere tekst staat, en in een naslagstap
    fireEvent.change(zoek, { target: { value: 'Pauzeer' } });
    expect(p.textContent).toContain('Bij: Filmdata van TMDB');
    fireEvent.change(zoek, { target: { value: 'huisgenoten' } });
    expect(p.textContent).toContain('Bij: Profielen');
    fireEvent.change(zoek, { target: { value: 'blokfluit' } });
    expect(p.textContent).toContain('Daar staat geen uitleg over');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Uitleg' })).toBeNull();
  });

  it('een hoofdstuk: de kern, Meer hierover, Escape bewaart de plek, en rustig uit', async () => {
    render(<App />);
    fireEvent.click(rKnop());
    fireEvent.click(screen.getByRole('button', { name: /Welkom en je lijst laden/ }));
    let titel = await screen.findByRole('dialog', { name: 'Wat deze tool doet' });
    expect(titel.textContent).toContain('stap 1 van 4');
    // de filmstrook: een raampje per stap, dit raampje belicht
    const ramen = titel.querySelectorAll('.uitleg-raam');
    expect(ramen).toHaveLength(4);
    expect(titel.querySelector('.uitleg-raam.nu')).toBe(ramen[0]);
    // kort, en de rest onder Meer hierover
    expect(titel.textContent).toContain('Je gegevens blijven in je eigen browser.');
    const meer = within(titel).getByRole('button', { name: 'Meer hierover' });
    expect(meer.getAttribute('aria-expanded')).toBe('false');
    expect(titel.querySelector('.uitleg-meer').hidden).toBe(true);
    fireEvent.click(meer);
    expect(titel.querySelector('.uitleg-meer').hidden).toBe(false);
    expect(titel.querySelector('.uitleg-meer').textContent).toContain('tenzij je zelf sync aanzet');
    expect(within(titel).getByRole('button', { name: 'Minder' }).getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('[data-uitleg-stap]').getAttribute('data-uitleg-stap')).toBe('welkom.wat');
    expect(rInstellingen().uitleg.bezig).toEqual({ h: 'welkom', s: 0 });
    rVolgende(titel);
    // met een lijst staat de import bij Setup; een nieuwe stap begint weer kort
    titel = await screen.findByRole('dialog', { name: 'Je Letterboxd-export' });
    expect(titel.textContent).toContain('stap 2 van 4');
    expect(titel.querySelector('.uitleg-raam.af')).toBeTruthy();
    expect(within(titel).getByRole('button', { name: 'Meer hierover' })).toBeTruthy();
    expect(document.querySelector('.kop-setup.active')).toBeTruthy();
    // terug, en met het pijltje weer verder
    rVolgende(titel, 'Vorige');
    titel = await screen.findByRole('dialog', { name: 'Wat deze tool doet' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    titel = await screen.findByRole('dialog', { name: 'Je Letterboxd-export' });
    rVolgende(titel);
    // Je lijst bijwerken is naslag. Niets op te halen: de lege tekst
    titel = await screen.findByRole('dialog', { name: 'Filmdata van TMDB' }, { timeout: 3000 });
    await waitFor(() => expect(titel.textContent).toContain('Nu is er niets op te halen'), { timeout: 3000 });
    expect(titel.textContent).toContain('stap 3 van 4');
    // Escape: weg, en de plek blijft bewaard
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(document.querySelector('.uitleg')).toBeNull());
    expect(rInstellingen().uitleg.bezig).toEqual({ h: 'welkom', s: 5 });
    rVerder('Welkom en je lijst laden');
    titel = await screen.findByRole('dialog', { name: 'Filmdata van TMDB' }, { timeout: 3000 });
    rVolgende(titel);
    // de vijf plekken zijn naslag
    titel = await screen.findByRole('dialog', { name: 'Uitleg, altijd bij de hand' });
    expect(titel.textContent).toContain('stap 4 van 4');
    rVolgende(titel, 'Klaar');
    const eind = await screen.findByRole('dialog', { name: 'Dat was Welkom en je lijst laden' });
    // rustig: Klaar voor nu gaat voor, het volgende hoofdstuk mag
    const knoppen = within(eind).getAllByRole('button');
    expect(knoppen[0].textContent).toBe('Klaar voor nu');
    expect(knoppen[0].className).toContain('primary');
    expect(within(eind).getByRole('button', { name: 'Verder met Vanavond: de hoofdfilm en de kassa' }).className).not.toContain('primary');
    expect(within(eind).getByRole('button', { name: 'Naar het programma' })).toBeTruthy();
    fireEvent.click(knoppen[0]);
    await waitFor(() => expect(document.querySelector('.uitleg')).toBeNull());
    expect(rInstellingen().uitleg.gezien).toEqual(['welkom']);
    expect(rInstellingen().uitleg.bezig).toBe(null);
    fireEvent.click(rKnop());
    expect(screen.getByRole('dialog', { name: 'Uitleg' }).textContent).toContain('gezien');
  });

  it('een gevonden stap opent zijn hele deel, met de langere tekst al open', async () => {
    render(<App />);
    fireEvent.click(rKnop());
    const p = screen.getByRole('dialog', { name: 'Uitleg' });
    fireEvent.change(within(p).getByLabelText('Zoek in de uitleg'), { target: { value: 'Downloads' } });
    expect(p.textContent).toContain('Bij: Je Letterboxd-export');
    fireEvent.click(within(p).getAllByRole('button', { name: /Welkom en je lijst laden/ })[0]);
    let titel = await screen.findByRole('dialog', { name: 'Je Letterboxd-export' });
    expect(titel.querySelector('.uitleg-meer').hidden).toBe(false);
    expect(titel.textContent).toContain('op een computer in je map Downloads');
    expect(within(titel).getByRole('button', { name: 'Minder' })).toBeTruthy();
    expect(titel.textContent).toContain('stap 2 van 6');
    expect(rInstellingen().uitleg.bezig).toEqual({ h: 'welkom', s: 2, deel: 'welkom' });
    rVolgende(titel);
    // de naslag hoort er nu bij
    titel = await screen.findByRole('dialog', { name: 'Je lijst bijwerken' });
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Filmdata van TMDB' }, { timeout: 3000 });
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Vijf plekken, en Setup' });
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Uitleg, altijd bij de hand' });
    rVolgende(titel, 'Klaar');
    const eind = await screen.findByRole('dialog', { name: 'Dat was Welkom en je lijst laden' });
    expect(eind.textContent).toContain('Zoek je nog iets?');
    expect(within(eind).queryByRole('button', { name: /Verder met/ })).toBeNull();
    fireEvent.click(within(eind).getByRole('button', { name: 'Klaar voor nu' }));
    await waitFor(() => expect(document.querySelector('.uitleg')).toBeNull());
    // een opgezocht deel is nog niet het hele hoofdstuk
    expect(rInstellingen().uitleg.gezien || []).not.toContain('welkom');
    expect(rInstellingen().uitleg.bezig).toBe(null);
  });

  it('beweging: de iris opent en sluit, de tussentitel flikkert aan; met beperk beweging niets', async () => {
    const mm = window.matchMedia;
    try {
      window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
      await rDeel('samen', 'samen');
      render(<App />);
      rVerder('Samen kiezen');
      let titel = await screen.findByRole('dialog', { name: 'Hoe kiezen jullie?' });
      expect(document.querySelector('.uitleg-iris')).toBeTruthy();
      expect(titel.className).toContain('flikker');
      await waitFor(() => expect(document.querySelector('.uitleg-iris')).toBeNull(), { timeout: 2000 });
      rVolgende(titel, 'Klaar');
      // eerst de iris dicht, dan pas het einde, dat uit het donker komt
      expect(document.querySelector('.uitleg-iris')).toBeTruthy();
      expect(screen.queryByRole('dialog', { name: 'Dat was Samen kiezen' })).toBeNull();
      let eind = await screen.findByRole('dialog', { name: 'Dat was Samen kiezen' }, { timeout: 2000 });
      expect(document.querySelector('.uitleg-zwart')).toBeTruthy();
      fireEvent.click(within(eind).getByRole('button', { name: 'Klaar voor nu' }));
      cleanup();
      // beperk beweging: geen iris en geen flikker, en meteen het einde
      window.matchMedia = () => ({ matches: true, addListener() {}, removeListener() {} });
      await rDeel('samen', 'samen');
      render(<App />);
      rVerder('Samen kiezen');
      titel = await screen.findByRole('dialog', { name: 'Hoe kiezen jullie?' });
      expect(document.querySelector('.uitleg-iris')).toBeNull();
      expect(document.querySelector('.uitleg.stil')).toBeTruthy();
      expect(titel.className).not.toContain('flikker');
      rVolgende(titel, 'Klaar');
      eind = screen.getByRole('dialog', { name: 'Dat was Samen kiezen' });
      expect(document.querySelector('.uitleg-zwart')).toBeNull();
    } finally {
      window.matchMedia = mm;
    }
  });

  it('zonder lijst: het welkom, de demo-lijst doet het voor, dan Vanavond, en dan rust', async () => {
    localStorage.clear();
    localStorage.setItem('picker.settings', JSON.stringify({ lang: 'nl' }));
    const oudFetch = global.fetch;
    global.fetch = vi.fn(() => Promise.reject(new Error('offline')));
    window.history.replaceState(null, '', '/?uitleg');
    try {
      render(<App />);
      const welkom = await screen.findByRole('dialog', { name: 'Welkom in de bioscoop' });
      fireEvent.click(within(welkom).getByRole('button', { name: 'Leid me rond' }));
      expect(rInstellingen().uitleg.welkom).toBe('rondleiding');
      let titel = await screen.findByRole('dialog', { name: 'Wat deze tool doet' });
      rVolgende(titel);
      // meestemmen met een code staat al in het welkom: hier is dat naslag
      titel = await screen.findByRole('dialog', { name: 'Je Letterboxd-export' });
      rVolgende(titel);
      titel = await screen.findByRole('dialog', { name: 'Laad je export' });
      // een doestap: geen Volgende, wel overslaan en voordoen
      expect(within(titel).queryByRole('button', { name: 'Volgende' })).toBeNull();
      expect(within(titel).getByRole('button', { name: 'Sla over' })).toBeTruthy();
      expect(titel.textContent).toContain('Nog geen export bij de hand?');
      fireEvent.click(within(titel).getByRole('button', { name: 'Oefen met de demo-lijst' }));
      await waitFor(() => expect(document.body.textContent).toContain('demo-watchlist, met voorbeeldfilms'));
      // gedaan: de rondleiding gaat zelf verder, langs de filmdata naar de demo
      titel = await screen.findByRole('dialog', { name: 'Filmdata van TMDB' }, { timeout: 4000 });
      // de teller loopt door: de stappen die je al zag, blijven meetellen
      expect(titel.textContent).toContain('stap 4 van 6');
      rVolgende(titel);
      titel = await screen.findByRole('dialog', { name: 'De demo-lijst' });
      expect(document.querySelector('[data-uitleg="demo-banner"]')).toBeTruthy();
      rVolgende(titel);
      titel = await screen.findByRole('dialog', { name: 'Uitleg, altijd bij de hand' });
      rVolgende(titel, 'Klaar');
      // de rondgang van het welkom gaat door naar Vanavond
      let eind = await screen.findByRole('dialog', { name: 'Dat was Welkom en je lijst laden' });
      const knoppen = within(eind).getAllByRole('button');
      expect(knoppen.map((k) => k.textContent)).toEqual(['Verder met Vanavond: de hoofdfilm en de kassa', 'Klaar voor nu']);
      fireEvent.click(knoppen[0]);
      titel = await screen.findByRole('dialog', { name: 'De hoofdfilm van vanavond' });
      await waitFor(() => expect(titel.textContent).toContain('Je hoofdfilm staat hier zodra de filmdata'), { timeout: 4000 });
      rVolgende(titel);
      titel = await screen.findByRole('dialog', { name: 'De kassa' });
      rVolgende(titel);
      titel = await screen.findByRole('dialog', { name: 'Aanpassen' });
      rVolgende(titel, 'Sla over');
      titel = await screen.findByRole('dialog', { name: 'De la van de kassa' }, { timeout: 3000 });
      rVolgende(titel);
      titel = await screen.findByRole('dialog', { name: 'Laat het lot kiezen' });
      rVolgende(titel, 'Sla over');
      // en daar houdt hij op: de rest staat onder Uitleg
      eind = await screen.findByRole('dialog', { name: 'Dat was Vanavond: de hoofdfilm en de kassa' }, { timeout: 3000 });
      expect(eind.textContent).toContain('De rest staat onder Uitleg');
      expect(within(eind).queryByRole('button', { name: /Verder met/ })).toBeNull();
      expect(within(eind).getAllByRole('button')[0].textContent).toBe('Klaar voor nu');
      fireEvent.click(within(eind).getByRole('button', { name: 'Klaar voor nu' }));
      await waitFor(() => expect(document.querySelector('.uitleg')).toBeNull());
      expect(rInstellingen().uitleg.gezien).toEqual(['welkom', 'vanavond']);
    } finally {
      global.fetch = oudFetch;
      window.history.replaceState(null, '', '/');
    }
  }, 20000);

  it('je eigen export na de demo: wat je in de demo deed, gaat weg', async () => {
    const { demoWatchlist } = await import('../src/lib/extra.js');
    const { nieuwKaartje } = await import('../src/lib/kaartjesdoos.js');
    const demo = demoWatchlist();
    localStorage.clear();
    localStorage.setItem('picker.settings', JSON.stringify({ lang: 'nl', tmdbKey: 'x' }));
    localStorage.setItem('picker.watchlist', JSON.stringify(demo));
    localStorage.setItem('picker.demoMode', 'true');
    localStorage.setItem('picker.kaartjes', JSON.stringify([nieuwKaartje(demo[0])]));
    localStorage.setItem('picker.ownRatings', JSON.stringify({ [demo[1].key]: 4 }));
    localStorage.setItem('picker.seen', JSON.stringify([demo[2].key]));
    const oudFetch = global.fetch;
    global.fetch = vi.fn(() => Promise.reject(new Error('offline')));
    try {
      render(<App />);
      fireEvent.click(screen.getAllByLabelText('Setup')[0]);
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      zip.file('watchlist.csv', 'Date,Name,Year,Letterboxd URI\n2024-01-01,Eigen Film,2015,x\n2024-01-02,Nog Een,2019,x');
      const bestand = new File([await zip.generateAsync({ type: 'blob' })], 'letterboxd-eigen.zip');
      fireEvent.change(document.querySelector('[data-uitleg="import"] input[type="file"]'), { target: { files: [bestand] } });
      expect(await screen.findByText('2 films geladen. Veel kijkplezier!', {}, { timeout: 5000 })).toBeTruthy();
      expect(JSON.parse(localStorage.getItem('picker.demoMode'))).toBe(false);
      expect(JSON.parse(localStorage.getItem('picker.watchlist')).map((f) => f.name)).toEqual(['Eigen Film', 'Nog Een']);
      expect(JSON.parse(localStorage.getItem('picker.kaartjes'))).toEqual([]);
      expect(JSON.parse(localStorage.getItem('picker.ownRatings'))).toEqual({});
      expect(JSON.parse(localStorage.getItem('picker.seen'))).toEqual([]);
      // met een eigen lijst geen demo-knop meer: die zou hem vervangen
      expect(screen.queryByText('Probeer met demo-watchlist')).toBeNull();
    } finally {
      global.fetch = oudFetch;
    }
  });
});

// De rondleiding: Vanavond, en je kaartjes en het archief
describe('de rondleiding: Vanavond, kaartjes, archief', () => {
  beforeEach(() => { cleanup(); seed(); });
  const metRust = async (fn) => {
    const mm = window.matchMedia;
    window.matchMedia = () => ({ matches: true, addListener() {}, removeListener() {} });
    try { await fn(); } finally { window.matchMedia = mm; }
  };

  it('Vanavond, kort: de hoofdfilm, de kassa, de la als doestap, en het lot', () => metRust(async () => {
    render(<App />);
    rStart('Vanavond: de hoofdfilm en de kassa');
    let titel = await screen.findByRole('dialog', { name: 'De hoofdfilm van vanavond' });
    const naam = document.querySelector('[data-uitleg="hoofdfilm"]').getAttribute('data-uitleg-titel');
    expect(titel.textContent).toContain(`Vandaag: ${naam}.`);
    expect(titel.textContent).toContain('Een korte film van je lijst staat eronder als voorfilm.');
    expect(titel.textContent).toContain('stap 1 van 6');
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Pak dit kaartje' });
    rVolgende(titel);
    // Net binnen, de vraag en de stemmingen zijn naslag
    titel = await screen.findByRole('dialog', { name: 'De kassa' });
    expect(titel.textContent).toContain('Nu in de pot: 6.');
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Aanpassen' });
    fireEvent.click(within(titel).getByRole('button', { name: 'Laat zien' }));
    titel = await screen.findByRole('dialog', { name: 'De la van de kassa' }, { timeout: 3000 });
    expect(document.querySelector('.kassa-la')).toBeTruthy();
    rVolgende(titel);
    // de la gaat eerst dicht
    titel = await screen.findByRole('dialog', { name: 'Laat het lot kiezen' });
    await waitFor(() => expect(document.querySelector('.kassa-la')).toBeNull());
    expect(titel.textContent).toContain('stap 6 van 6');
    rVolgende(titel, 'Sla over');
    const eind = await screen.findByRole('dialog', { name: 'Dat was Vanavond: de hoofdfilm en de kassa' });
    expect(within(eind).getByRole('button', { name: 'Verder met Je kaartjes en het archief' })).toBeTruthy();
    fireEvent.click(within(eind).getByRole('button', { name: 'Klaar voor nu' }));
    expect(rInstellingen().uitleg.gezien).toContain('vanavond');
    expect(JSON.parse(localStorage.getItem('picker.kaartjes') || '[]')).toEqual([]);
  }));

  it('Vanavond, het hele deel: Net binnen, de vraag, de stemmingen, en een echte pick als keuze', () => metRust(async () => {
    await rDeel('vanavond', 'vanavond');
    render(<App />);
    rVerder('Vanavond: de hoofdfilm en de kassa');
    let titel = await screen.findByRole('dialog', { name: 'De hoofdfilm van vanavond' });
    // de langere tekst staat meteen open
    expect(titel.textContent).toContain('Die keuze staat de hele dag vast.');
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Pak dit kaartje' });
    rVolgende(titel);
    // geen Net binnen en geen vraag: hun eigen tekst
    titel = await screen.findByRole('dialog', { name: 'Net binnen' });
    await waitFor(() => expect(titel.textContent).toContain('Komen er films van je lijst nieuw'));
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'De vraag over gisteren' });
    await waitFor(() => expect(titel.textContent).toContain('de dag erna de vraag'));
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'De kassa' });
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Waar heb je zin in?' });
    expect(titel.textContent).toContain('Tik je nu op Korte avond, dan blijven er 3 over.');
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Aanpassen' });
    expect(within(titel).queryByRole('button', { name: 'Volgende' })).toBeNull();
    fireEvent.click(within(titel).getByRole('button', { name: 'Laat zien' }));
    titel = await screen.findByRole('dialog', { name: 'De la van de kassa' }, { timeout: 3000 });
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Trailer en slim kiezen' });
    await waitFor(() => expect(document.querySelector('.kassa-la')).toBeNull());
    expect(titel.textContent).toContain('bijna twee keer zoveel kans');
    rVolgende(titel);
    // de echte pick is een keuze, met het gevolg erbij
    titel = await screen.findByRole('dialog', { name: 'Laat het lot kiezen' });
    expect(titel.textContent).toContain('Je krijgt dan een echt kaartje');
    expect(JSON.parse(localStorage.getItem('picker.kaartjes') || '[]')).toEqual([]);
    fireEvent.click(within(titel).getByRole('button', { name: 'Kies echt een film' }));
    titel = await screen.findByRole('dialog', { name: 'Je kaartje' }, { timeout: 4000 });
    expect(document.querySelector('.winner')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('picker.kaartjes')).length).toBe(1);
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Wat je met je pick doet' });
    rVolgende(titel, 'Klaar');
    const eind = await screen.findByRole('dialog', { name: 'Dat was Vanavond: de hoofdfilm en de kassa' });
    expect(eind.textContent).toContain('Zoek je nog iets?');
    expect(rInstellingen().uitleg.gezien || []).not.toContain('vanavond');
  }));

  it('Vanavond: de echte pick overslaan, dan vallen de stappen over de filmkaart weg', async () => {
    render(<App />);
    fireEvent.click(rKnop());
    // via het programma meteen naar de stap van het lot
    fireEvent.change(screen.getByLabelText('Zoek in de uitleg'), { target: { value: 'lot' } });
    fireEvent.click(screen.getAllByRole('button', { name: /Vanavond: de hoofdfilm en de kassa/ })[0]);
    const titel = await screen.findByRole('dialog', { name: 'Laat het lot kiezen' });
    fireEvent.click(within(titel).getByRole('button', { name: 'Sla over' }));
    await screen.findByRole('dialog', { name: 'Dat was Vanavond: de hoofdfilm en de kassa' });
    expect(JSON.parse(localStorage.getItem('picker.kaartjes') || '[]')).toEqual([]);
  });

  it('kaartjes en archief, kort: het kaartje, de doos, de filterzin en een film openen', async () => {
    render(<App />);
    rStart('Je kaartjes en het archief');
    let titel = await screen.findByRole('dialog', { name: 'Een pick is nog geen gekeken film' });
    expect(titel.textContent).toContain('stap 1 van 4');
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'De doos' });
    expect(titel.textContent).toContain('Nu in de doos: 0.');
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Filteren met een zin' });
    fireEvent.change(screen.getByLabelText('Genre'), { target: { value: 'Drama' } });
    // gelukt: de klapper klapt, en hij gaat zelf verder
    await waitFor(() => expect(document.querySelector('.uitleg-doe.gedaan .uitleg-klapper')).toBeTruthy());
    titel = await screen.findByRole('dialog', { name: 'Een film openen' }, { timeout: 3000 });
    fireEvent.click(within(titel).getByRole('button', { name: 'Laat zien' }));
    await screen.findByRole('dialog', { name: 'Dat was Je kaartjes en het archief' }, { timeout: 4000 });
    expect(document.querySelector('.winner')).toBeTruthy();
  });

  it('archief, het hele deel: de filterzin als doestap, de zin leest mee, en een film openen', async () => {
    await rDeel('archief', 'archief');
    render(<App />);
    rVerder('Je kaartjes en het archief');
    let titel = await screen.findByRole('dialog', { name: 'Alles wat je hebt' });
    expect(titel.textContent).toContain('6 op je watchlist');
    rVolgende(titel);
    // zonder filmbeeld geen uitgelichte film: die stap valt weg
    titel = await screen.findByRole('dialog', { name: 'Per decennium' }, { timeout: 4000 });
    expect(titel.textContent).toContain('stap 2 van');
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Zoeken' });
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Filteren met een zin' });
    expect(within(titel).queryByRole('button', { name: 'Volgende' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Genre'), { target: { value: 'Drama' } });
    titel = await screen.findByRole('dialog', { name: 'De zin past zich aan' }, { timeout: 3000 });
    expect(titel.textContent).toContain('Nu: Toon drama uit alle jaren');
    expect(titel.textContent).not.toContain('Sciencefiction'); // geen opties uit de keuzelijst
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Een film openen' });
    fireEvent.click(within(titel).getByRole('button', { name: 'Laat zien' }));
    titel = await screen.findByRole('dialog', { name: 'De filmkaart' }, { timeout: 4000 });
    expect(document.querySelector('.winner')).toBeTruthy();
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Je eigen sterren' }, { timeout: 3000 });
    await waitFor(() => expect(document.querySelector('.winner')).toBeNull());
  });

  it('archief: zonder genres om te kiezen is het filteren een kijkstap', async () => {
    const meta = JSON.parse(localStorage.getItem('picker.meta'));
    Object.values(meta).forEach((m) => { m.genres = []; });
    localStorage.setItem('picker.meta', JSON.stringify(meta));
    await rDeel('archief', 'archief');
    render(<App />);
    rVerder('Je kaartjes en het archief');
    let titel = await screen.findByRole('dialog', { name: 'Alles wat je hebt' });
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Per decennium' }, { timeout: 4000 });
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Zoeken' });
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Filteren met een zin' });
    expect(titel.textContent).not.toContain('Tik op alle genres');
    expect(within(titel).queryByRole('button', { name: 'Sla over' })).toBeNull();
    rVolgende(titel);
    await screen.findByRole('dialog', { name: 'De zin past zich aan' });
  });

  it('kaartjes, het hele deel: naar het tabblad Kaartjes, en de lege teksten zonder kaartjes', async () => {
    await rDeel('archief', 'kaartjes');
    render(<App />);
    rVerder('Je kaartjes en het archief');
    let titel = await screen.findByRole('dialog', { name: 'Een pick is nog geen gekeken film' });
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Afscheuren en ontdekken' });
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Uit je doos' });
    await waitFor(() => expect(titel.textContent).toContain('Zodra er kaartjes in je doos zitten'));
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'De doos' });
    expect(titel.textContent).toContain('Nu in de doos: 0.');
    expect(screen.getByRole('button', { name: /Kaartjes/, pressed: true })).toBeTruthy();
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Jouw filmjaar' });
    await waitFor(() => expect(titel.textContent).toContain('Zitten er dit jaar kaartjes in de doos'));
  });
});

// De rondleiding: het programma (Voor jou, eigen rijen, zoeken)
describe('de rondleiding: het programma', () => {
  beforeEach(() => { cleanup(); seed(); });
  // de aanraders komen uit TMDB: in de tests wacht de rondleiding korter
  let wacht;
  beforeEach(async () => { wacht = (await import('../src/lib/rondleiding.js')).WACHT; wacht.oud = wacht.lang; wacht.lang = 300; });
  afterEach(() => { wacht.lang = wacht.oud; });
  const PROGRAMMA = 'Programma: nieuwe films voor jou';
  // vier hoge sterren en een regisseur met vijf films: genoeg voor een rij
  const metRij = () => {
    localStorage.clear();
    localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
    localStorage.setItem('picker.ratedFilms', JSON.stringify([
      { key: 'a|2020', name: 'A', year: 2020, rating: 5 }, { key: 'b|2019', name: 'B', year: 2019, rating: 5 },
      { key: 'c|2018', name: 'C', year: 2018, rating: 4.5 }, { key: 'd|2017', name: 'D', year: 2017, rating: 4.5 },
    ]));
    localStorage.setItem('picker.watchlist', JSON.stringify([{ key: 'a|2020', name: 'A', year: 2020 }]));
    const oeuvreFilms = [1, 2, 3, 4, 5, 6].map((n) => ({ id: 900 + n, title: `Reg Film ${n}`, year: 2000 + n, poster: `/r${n}.jpg`, vote: 7.5, votes: 2000, genre_ids: [18] }));
    localStorage.setItem('picker.oeuvres', JSON.stringify({ Testregisseur: { films: oeuvreFilms, at: Date.now() } }));
    localStorage.setItem('picker.meta', JSON.stringify({
      'a|2020': { id: 1, poster: '/a.jpg', vote: 8, votes: 5000, genres: ['Drama'], director: 'Testregisseur', flat: ['Netflix'], at: Date.now() },
    }));
    // de diensten van je regio zijn al binnen, en eerder zei je Niet nu
    localStorage.setItem('picker.dienstenLijst', JSON.stringify({ regio: 'NL', at: Date.now(), lijst: [{ id: 8, naam: 'Netflix' }, { id: 337, naam: 'Disney Plus' }] }));
    localStorage.setItem('picker.dienstKiezerWeg', 'true');
  };

  it('kort: Voor jou, de rijen, een tegel, een eigen rij en zoeken', async () => {
    metRij();
    render(<App />);
    rStart(PROGRAMMA);
    let titel = await screen.findByRole('dialog', { name: 'Films van buiten je lijst' });
    expect(titel.textContent).toContain('stap 1 van 5');
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Rijen met een reden' });
    await waitFor(() => expect(titel.textContent).toContain('Bovenaan: Meer van Testregisseur.'));
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Een tegel' });
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Een eigen rij' });
    fireEvent.click(within(titel).getByRole('button', { name: 'Laat zien' }));
    titel = await screen.findByRole('dialog', { name: 'Opslaan' }, { timeout: 3000 });
    rVolgende(titel);
    // de maker gaat dicht, dan zoeken
    titel = await screen.findByRole('dialog', { name: 'Zoeken' });
    await waitFor(() => expect(document.querySelector('[data-uitleg="eigen-maker"]')).toBeNull());
    fireEvent.click(within(titel).getByRole('button', { name: 'Laat zien' }));
    await screen.findByRole('dialog', { name: `Dat was ${PROGRAMMA}` }, { timeout: 3000 });
    expect(document.querySelector('[data-uitleg="zoekmachine"]')).toBeTruthy();
  }, 15000);

  it('Voor jou met een rij: de tegel, Alles bekijken als doestap, en terug naar de rijen', async () => {
    metRij();
    await rDeel('programma', 'voorjou');
    render(<App />);
    // na Niet nu staat Diensten kiezen bij de filters
    fireEvent.click(screen.getAllByLabelText('Programma')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Diensten kiezen' }));
    expect(screen.getByText('Welke streamingdiensten heb je?')).toBeTruthy();
    rVerder(PROGRAMMA);
    let titel = await screen.findByRole('dialog', { name: 'Films van buiten je lijst' });
    expect(titel.textContent).toMatch(/Nu: \d+ suggesties\./);
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Vanavond, voor jou' });
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Net binnen' });
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Rijen met een reden' });
    await waitFor(() => expect(titel.textContent).toContain('Bovenaan: Meer van Testregisseur.'));
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Een tegel' });
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Alles bekijken' });
    expect(within(titel).queryByRole('button', { name: 'Volgende' })).toBeNull();
    fireEvent.click(within(titel).getByRole('button', { name: 'Laat zien' }));
    titel = await screen.findByRole('dialog', { name: 'De hele rij' }, { timeout: 3000 });
    expect(document.querySelector('.rec-row-head')).toBeNull();
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Waarom deze film' });
    rVolgende(titel);
    // de filters: eerst terug uit Alles bekijken
    titel = await screen.findByRole('dialog', { name: 'Filters en andere suggesties' });
    await waitFor(() => expect(document.querySelector('.rec-row-head')).toBeTruthy());
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Je diensten' });
    expect(titel.textContent).toContain('Kies één keer welke streamingdiensten je hebt');
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Je shortlist' });
    await waitFor(() => expect(titel.textContent).toContain('Zet je een film op je shortlist'));
  }, 15000);

  it('Voor jou zonder rijen: de lijst met je kandidaten, en de lege teksten', async () => {
    await rDeel('programma', 'voorjou');
    render(<App />);
    rVerder(PROGRAMMA);
    let titel = await screen.findByRole('dialog', { name: 'Films van buiten je lijst' });
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Vanavond, voor jou' });
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Net binnen' });
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Rijen met een reden' });
    await waitFor(() => expect(titel.textContent).toContain('De rijen verschijnen zodra'));
    rVolgende(titel);
    // geen rij, dus geen tegel en geen Alles bekijken: meteen de lijst
    titel = await screen.findByRole('dialog', { name: 'De hele rij' }, { timeout: 4000 });
    expect(titel.textContent).not.toContain('Terug naar Voor jou');
  });

  it('eigen rijen: de maker als doestap, en Snel beoordelen houdt zijn eigen toetsen', async () => {
    await rDeel('programma', 'eigenrijen');
    render(<App />);
    rVerder(PROGRAMMA);
    let titel = await screen.findByRole('dialog', { name: 'Een eigen rij' });
    expect(within(titel).queryByRole('button', { name: 'Volgende' })).toBeNull();
    // zelf op de echte knop tikken
    fireEvent.click(screen.getByRole('button', { name: 'Eigen rij' }));
    titel = await screen.findByRole('dialog', { name: /Voorstellen|Waar gaat de rij over\?/ }, { timeout: 3000 });
    if (titel.textContent.includes('Voorstellen')) { rVolgende(titel); titel = await screen.findByRole('dialog', { name: 'Waar gaat de rij over?' }); }
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'De bouwstenen' });
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'De naam' });
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Opslaan' });
    rVolgende(titel);
    // de maker gaat dicht, en zonder eigen rij de lege tekst
    titel = await screen.findByRole('dialog', { name: 'Rijen beheren' });
    await waitFor(() => expect(document.querySelector('[data-uitleg="eigen-maker"]')).toBeNull());
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Snel beoordelen' });
    fireEvent.click(within(titel).getByRole('button', { name: 'Laat zien' }));
    titel = await screen.findByRole('dialog', { name: 'Vegen' }, { timeout: 3000 });
    // pijltjes en Escape zijn van Snel beoordelen: de rondleiding blijft staan
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByRole('dialog', { name: 'Vegen' })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.querySelector('[data-uitleg="snel"]')).toBeNull();
    // Snel beoordelen is dicht, de rondleiding niet: hij gaat naar het einde van dit deel
    await screen.findByRole('dialog', { name: `Dat was ${PROGRAMMA}` }, { timeout: 4000 });
  }, 15000);

  it('zoeken: zelf zoeken als doestap, de filters, en de resultaten', async () => {
    global.fetch = async (url) => ({
      ok: true, status: 200,
      json: async () => (String(url).includes('/search/movie')
        ? { results: [{ id: 777, title: 'Zoekfilm', release_date: '2018-03-01', poster_path: null, vote_average: 7.2, vote_count: 900, original_language: 'da', overview: '' }] }
        : { results: [] }),
    });
    try {
      await rDeel('programma', 'zoeken');
      render(<App />);
      rVerder(PROGRAMMA);
      let titel = await screen.findByRole('dialog', { name: 'Zoeken' });
      fireEvent.click(within(titel).getByRole('button', { name: 'Laat zien' }));
      // zelf zoeken: daar is geen Laat zien voor
      titel = await screen.findByRole('dialog', { name: 'Op titel of maker' }, { timeout: 3000 });
      expect(within(titel).queryByRole('button', { name: 'Laat zien' })).toBeNull();
      const veld = screen.getByLabelText('Zoek op titel of maker');
      fireEvent.change(veld, { target: { value: 'zoekfilm' } });
      fireEvent.keyDown(veld, { key: 'Enter' });
      expect(await screen.findByText('Zoekfilm')).toBeTruthy();
      titel = await screen.findByRole('dialog', { name: 'Zoeken op criteria' }, { timeout: 3000 });
      fireEvent.click(within(titel).getByRole('button', { name: 'Laat zien' }));
      titel = await screen.findByRole('dialog', { name: 'De criteria' }, { timeout: 3000 });
      expect(within(document.querySelector('[data-uitleg="zoek-filters"]')).getByText('Diep ondergronds')).toBeTruthy();
      rVolgende(titel);
      titel = await screen.findByRole('dialog', { name: 'Verberg al gezien' });
      rVolgende(titel);
      titel = await screen.findByRole('dialog', { name: 'De resultaten' });
      expect(titel.textContent).toContain('Verberg wat ik al ken');
      rVolgende(titel, 'Klaar');
      await screen.findByRole('dialog', { name: `Dat was ${PROGRAMMA}` });
      expect(screen.getByText('Zoekfilm')).toBeTruthy();
    } finally {
      delete global.fetch;
    }
  }, 15000);
});

// De rondleiding: samen kiezen (één telefoon, de zaal, op afstand)
describe('de rondleiding: samen kiezen', () => {
  beforeEach(() => { cleanup(); seed(); });
  // Een nep-Worker voor de zaal: openen, de lobby zetten en peilen
  const nepZaal = (code = 'KMRT') => {
    const calls = [];
    global.fetch = async (url, opts = {}) => {
      const u = String(url);
      calls.push([opts.method || 'GET', u]);
      const json = (body) => ({ ok: true, status: 200, json: async () => body });
      if (u.endsWith('/zaal/new')) return json({ versie: 1, code, geheim: 'g'.repeat(32) });
      if (u.includes(`/zaal/${code}/zet`)) return json({ zaal: { fase: 'lobby', ronde: 0, spelers: [], lb: true, vd: 0 } });
      if (u.includes(`/zaal/${code}/stand`)) return json({ zaal: { fase: 'lobby', spelers: [] }, gasten: {}, stemmen: {} });
      if (u.includes(`/zaal/${code}`)) return json({ fase: 'lobby', ronde: 0, spelers: ['Pim'] });
      return json({ results: [] });
    };
    return calls;
  };

  it('oefenen met stemmen: 2 punten tegen 1, de meeste lijstjes, en brede steun', async () => {
    const { oefenUitslag, OEFEN_GASTEN } = await import('../src/components/StemOefening.jsx');
    // Sam en Noor: elk een andere favoriet, dezelfde 2e keus
    expect(OEFEN_GASTEN.map(([, s]) => s)).toEqual([['drama', 'thriller'], ['komedie', 'thriller']]);
    let u = oefenUitslag([]);
    expect(u.telling.punten).toEqual({ drama: 2, komedie: 2, thriller: 2 });
    expect(u.telling.lijstjes).toEqual({ drama: 1, komedie: 1, thriller: 2 });
    // gelijk op punten: de meeste lijstjes beslissen
    expect(u.genre).toMatchObject({ namen: ['thriller'], wijze: 'breed' });
    // jouw 1e is 2 punten, je 2e 1 punt; komedie heeft dan ook brede steun
    u = oefenUitslag(['drama', 'komedie']);
    expect(u.telling.punten).toEqual({ drama: 4, komedie: 3, thriller: 2 });
    expect(u.genre).toMatchObject({ namen: ['drama', 'komedie'], wijze: 'ook', punten: 4 });
    // alleen een 1e keus: thriller wint ruim, en geen tweede genre (drama en komedie staan gelijk)
    expect(oefenUitslag(['thriller', null]).genre).toMatchObject({ namen: ['thriller'], wijze: 'meeste', punten: 4 });
    // thriller staat op twee lijstjes, maar heeft te weinig punten voor brede steun
    expect(oefenUitslag(['drama', null]).genre).toMatchObject({ namen: ['drama'], wijze: 'meeste' });
  });

  it('kort: welke manier wanneer, veto, de zaal als keuze, oefenen, en Voor ons', async () => {
    const calls = nepZaal();
    try {
      render(<App />);
      rStart('Samen kiezen');
      let titel = await screen.findByRole('dialog', { name: 'Hoe kiezen jullie?' });
      expect(titel.textContent).toContain('stap 1 van 5');
      rVolgende(titel);
      titel = await screen.findByRole('dialog', { name: 'Veto-rondes' });
      rVolgende(titel);
      titel = await screen.findByRole('dialog', { name: 'De zaal openen' });
      rVolgende(titel, 'Sla over');
      // zonder zaal vallen de code en het sluiten weg; de oefening blijft
      titel = await screen.findByRole('dialog', { name: 'Stemmen met punten' });
      expect(titel.textContent).toContain('Het wordt Thriller');
      rVolgende(titel);
      titel = await screen.findByRole('dialog', { name: 'Voor ons' });
      expect(document.querySelector('[data-uitleg="samen-host"]')).toBeTruthy();
      rVolgende(titel, 'Klaar');
      const eind = await screen.findByRole('dialog', { name: 'Dat was Samen kiezen' });
      expect(within(eind).getByRole('button', { name: 'Verder met Het jaarboek' })).toBeTruthy();
      expect(calls.some(([, u]) => u.includes('/zaal'))).toBe(false);
      expect(calls.filter(([m]) => m === 'POST')).toEqual([]);
    } finally {
      delete global.fetch;
    }
  });

  it('Filmavond: de pot, de filters, veto, de trailers en de knock-out', async () => {
    await rDeel('samen', 'filmavond');
    render(<App />);
    rVerder('Samen kiezen');
    let titel = await screen.findByRole('dialog', { name: 'Samen kiezen' });
    const n = document.querySelector('[data-uitleg="avond-kop"]').getAttribute('data-uitleg-n');
    expect(titel.textContent).toContain(`Kandidaten in de pot nu: ${n}.`);
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'De pot' });
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Wat er op tafel komt' });
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Veto-rondes' });
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Eerst de trailers' });
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Knock-out bracket' });
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'De winnaar' });
    rVolgende(titel, 'Klaar');
    await screen.findByRole('dialog', { name: 'Dat was Samen kiezen' });
  });

  it('de zaal: openen als keuze, de lobby in het licht, oefenen met stemmen, en weer sluiten', async () => {
    const calls = nepZaal();
    try {
      await rDeel('samen', 'zaal');
      render(<App />);
      rVerder('Samen kiezen');
      let titel = await screen.findByRole('dialog', { name: 'Iedereen stemt mee' });
      rVolgende(titel);
      // openen is een keuze: de rondleiding doet het niet vanzelf
      titel = await screen.findByRole('dialog', { name: 'De zaal openen' });
      expect(within(titel).queryByRole('button', { name: 'Volgende' })).toBeNull();
      expect(calls.some(([, u]) => u.endsWith('/zaal/new'))).toBe(false);
      fireEvent.click(within(titel).getByRole('button', { name: 'Open echt een zaal' }));
      titel = await screen.findByRole('dialog', { name: 'Code, QR en link' }, { timeout: 3000 });
      expect(titel.textContent).toContain('Deze zaal: KMRT.');
      rVolgende(titel);
      titel = await screen.findByRole('dialog', { name: 'Zelf meedoen' });
      rVolgende(titel);
      titel = await screen.findByRole('dialog', { name: 'Zo speelt de zaal' });
      rVolgende(titel);
      titel = await screen.findByRole('dialog', { name: 'De gasten' });
      rVolgende(titel);
      titel = await screen.findByRole('dialog', { name: 'Beginnen' });
      expect(titel.textContent).toContain('Nu in de zaal: 0.');
      rVolgende(titel);
      // de oefening: zonder jouw stem wint wat op de meeste lijstjes staat
      titel = await screen.findByRole('dialog', { name: 'Stemmen met punten' });
      expect(titel.textContent).toContain('Het wordt Thriller');
      expect(titel.textContent).toContain('Gelijk op punten. Deze stond op de meeste lijstjes.');
      expect(titel.textContent).toContain('Sam: 1e Drama, 2e Thriller.');
      expect(titel.textContent).toContain('Jij: nog geen stem.');
      fireEvent.click(within(titel).getByRole('button', { name: 'Eerste keus: Drama' }));
      fireEvent.click(within(titel).getByRole('button', { name: 'Tweede keus: Komedie' }));
      expect(titel.textContent).toContain('Jij: 1e Drama, 2e Komedie.');
      expect(titel.textContent).toContain('4 punten, op 2 lijstjes');
      expect(titel.textContent).toContain('Het wordt Drama en Komedie');
      expect(titel.textContent).toContain('Met 4 punten, en Komedie had ook brede steun: films die allebei zijn.');
      // de oefening stemt niet echt
      expect(calls.some(([, u]) => u.includes('/stem'))).toBe(false);
      rVolgende(titel);
      for (const kop of ['Bij gelijkspel', 'De films op tafel', 'De trailers', 'De filmronde', 'De uitslag']) {
        titel = await screen.findByRole('dialog', { name: kop });
        rVolgende(titel);
      }
      // aan het eind: de zaal weer dicht
      titel = await screen.findByRole('dialog', { name: 'De zaal sluiten' });
      fireEvent.click(within(titel).getByRole('button', { name: 'Laat zien' }));
      await screen.findByRole('dialog', { name: 'Dat was Samen kiezen' }, { timeout: 3000 });
      expect(document.querySelector('[data-uitleg="zaal-lobby"]')).toBeNull();
      expect(document.querySelector('[data-uitleg="avond-kop"]')).toBeTruthy();
    } finally {
      delete global.fetch;
    }
  }, 15000);

  it('de zaal: wie de zaal niet opent, krijgt het verloop zonder lobby', async () => {
    const calls = nepZaal();
    try {
      await rDeel('samen', 'zaal');
      render(<App />);
      rVerder('Samen kiezen');
      let titel = await screen.findByRole('dialog', { name: 'Iedereen stemt mee' });
      rVolgende(titel);
      titel = await screen.findByRole('dialog', { name: 'De zaal openen' });
      fireEvent.click(within(titel).getByRole('button', { name: 'Sla over' }));
      // de stappen over de lobby vallen weg
      titel = await screen.findByRole('dialog', { name: 'Stemmen met punten' });
      rVolgende(titel);
      for (const kop of ['Bij gelijkspel', 'De films op tafel', 'De trailers', 'De filmronde']) {
        titel = await screen.findByRole('dialog', { name: kop });
        rVolgende(titel);
      }
      titel = await screen.findByRole('dialog', { name: 'De uitslag' });
      rVolgende(titel, 'Klaar');
      await screen.findByRole('dialog', { name: 'Dat was Samen kiezen' });
      expect(calls.some(([, u]) => u.includes('/zaal'))).toBe(false);
    } finally {
      delete global.fetch;
    }
  });

  it('de gasten: het codeveld, de stappen op de telefoon, en dezelfde oefening', async () => {
    await rDeel('samen', 'zaalgast');
    render(<App />);
    rVerder('Samen kiezen');
    let titel = await screen.findByRole('dialog', { name: 'Meedoen met een code' });
    expect(document.querySelector('[data-uitleg="zaal-meedoen"]')).toBeTruthy();
    rVolgende(titel);
    for (const kop of ['Je naam', 'Je Letterboxd laten meetellen', 'Zelf een film voordragen']) {
      titel = await screen.findByRole('dialog', { name: kop });
      rVolgende(titel);
    }
    titel = await screen.findByRole('dialog', { name: 'Stemmen op je telefoon' });
    // nog eens tikken haalt hem weg
    fireEvent.click(within(titel).getByRole('button', { name: 'Eerste keus: Thriller' }));
    expect(titel.textContent).toContain('Jij: 1e Thriller.');
    expect(titel.textContent).toContain('Met 4 punten.');
    fireEvent.click(within(titel).getByRole('button', { name: 'Eerste keus: Thriller' }));
    expect(titel.textContent).toContain('Jij: nog geen stem.');
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Alvast stemmen' });
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Het kaartje mee naar huis' });
    rVolgende(titel, 'Klaar');
    await screen.findByRole('dialog', { name: 'Dat was Samen kiezen' });
  });

  it('op afstand: Voor ons en Op afstand, zonder een sessie te starten', async () => {
    const calls = nepZaal();
    try {
      await rDeel('samen', 'afstand');
      render(<App />);
      rVerder('Samen kiezen');
      let titel = await screen.findByRole('dialog', { name: 'Voor ons' });
      expect(document.querySelector('[data-uitleg="samen-host"]')).toBeTruthy();
      rVolgende(titel);
      for (const kop of ['Wat je vrienden doen', 'De ranglijst']) {
        titel = await screen.findByRole('dialog', { name: kop });
        rVolgende(titel);
      }
      titel = await screen.findByRole('dialog', { name: 'Op afstand' });
      rVolgende(titel);
      titel = await screen.findByRole('dialog', { name: 'De winnaar op afstand' });
      rVolgende(titel, 'Klaar');
      await screen.findByRole('dialog', { name: 'Dat was Samen kiezen' });
      expect(calls.filter(([m]) => m === 'POST')).toEqual([]);
    } finally {
      delete global.fetch;
    }
  });

  it('de telefoon in de lobby: oefenen terwijl je wacht, en er gaat niets naar de zaal', async () => {
    const calls = nepZaal('QQQQ');
    try {
      localStorage.clear();
      localStorage.setItem('picker.settings', JSON.stringify({ lang: 'nl' }));
      localStorage.setItem('picker.zaalIk', JSON.stringify({ QQQQ: { naam: 'Pim', token: 'p'.repeat(32) } }));
      history.pushState({}, '', '?zaal=QQQQ');
      render(<App />);
      expect(await screen.findByText('Je zit erin, Pim.')).toBeTruthy();
      const knop = screen.getByRole('button', { name: 'Terwijl je wacht: oefen het stemmen' });
      expect(knop.getAttribute('aria-expanded')).toBe('false');
      fireEvent.click(knop);
      expect(screen.getByText('Het wordt Thriller')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Eerste keus: Komedie' }));
      fireEvent.click(screen.getByRole('button', { name: 'Tweede keus: Drama' }));
      expect(screen.getByText('Het wordt Komedie en Drama')).toBeTruthy();
      expect(calls.filter(([m]) => m === 'POST')).toEqual([]);
      fireEvent.click(screen.getByRole('button', { name: 'Klaar met oefenen' }));
      expect(screen.queryByText('Het wordt Komedie en Drama')).toBeNull();
    } finally {
      delete global.fetch;
      history.pushState({}, '', location.pathname);
    }
  });
});

// De rondleiding: het jaarboek en Setup
describe('de rondleiding: jaarboek en setup', () => {
  beforeEach(() => { cleanup(); seed(); });
  const watchlistNu = () => JSON.parse(localStorage.getItem('picker.watchlist'));
  const SETUP = 'Setup: je gegevens en de extra’s';

  it('het jaarboek, kort: je profiel, meten, de uitkomst en leren', async () => {
    render(<App />);
    rStart('Het jaarboek');
    let titel = await screen.findByRole('dialog', { name: 'Je smaakprofiel' });
    expect(titel.textContent).toContain('stap 1 van 3');
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Meten hoe goed Voor jou je kent' });
    fireEvent.click(within(titel).getByRole('button', { name: 'Laat zien' }));
    titel = await screen.findByRole('dialog', { name: 'De uitkomst' }, { timeout: 3000 });
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Leer mijn smaak' });
    rVolgende(titel, 'Klaar');
    const eind = await screen.findByRole('dialog', { name: 'Dat was Het jaarboek' });
    fireEvent.click(within(eind).getByRole('button', { name: 'Klaar voor nu' }));
    expect(rInstellingen().uitleg.gezien).toContain('jaarboek');
    expect(JSON.parse(localStorage.getItem('picker.smaakModel') || 'null')).toBeNull();
  });

  it('het jaarboek, het hele deel: de cijfers uit het scherm, meten als doestap, en de lege teksten', async () => {
    await rDeel('jaarboek', 'jaarboek');
    render(<App />);
    rVerder('Het jaarboek');
    let titel = await screen.findByRole('dialog', { name: 'Het jaarboek' });
    rVolgende(titel);
    // eerst de getallen
    titel = await screen.findByRole('dialog', { name: 'De cijfers' });
    const cijfers = document.querySelector('[data-uitleg="jaarboek-cijfers"]');
    expect(titel.textContent).toContain(`Op je watchlist: ${cijfers.getAttribute('data-uitleg-n')}. Nog te kijken: ${cijfers.getAttribute('data-uitleg-nog')}.`);
    // de eigen gemiddelde rating heeft nu een tekst in beide talen
    expect(document.body.textContent).not.toContain('${');
    rVolgende(titel);
    // geen dagboek in de testdata: de lege tekst
    titel = await screen.findByRole('dialog', { name: 'Je kijkritme' }, { timeout: 3000 });
    await waitFor(() => expect(titel.textContent).toContain('Staat je Letterboxd-dagboek erin'));
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Je smaakprofiel' });
    rVolgende(titel);
    // meten laat niets na: de rondleiding mag het voordoen
    titel = await screen.findByRole('dialog', { name: 'Meten hoe goed Voor jou je kent' });
    expect(within(titel).queryByRole('button', { name: 'Volgende' })).toBeNull();
    expect(document.querySelector('[data-uitleg="jaarboek-meting"]')).toBeNull();
    fireEvent.click(within(titel).getByRole('button', { name: 'Laat zien' }));
    titel = await screen.findByRole('dialog', { name: 'De uitkomst' }, { timeout: 3000 });
    // te weinig favorieten om te meten: dan geen percentage in het voorbeeld
    expect(document.querySelector('[data-uitleg="jaarboek-meting"]').textContent).toContain('Nog te weinig favorieten');
    expect(titel.textContent).not.toContain('Bij jou nu');
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Leer mijn smaak' });
    // leren verandert Voor jou: alleen kijken
    expect(within(titel).queryByRole('button', { name: 'Laat zien' })).toBeNull();
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Genres, decennia, makers en landen' });
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'De laatste picks' }, { timeout: 3000 });
    await waitFor(() => expect(titel.textContent).toContain('Zodra je een film pickt'));
    rVolgende(titel, 'Klaar');
    await screen.findByRole('dialog', { name: 'Dat was Het jaarboek' });
    expect(JSON.parse(localStorage.getItem('picker.smaakModel') || 'null')).toBeNull();
  }, 15000);

  it('het jaarboek met een dagboek en picks: het ritme en de picks in het licht', async () => {
    const vandaag = new Date().toISOString().slice(0, 10);
    localStorage.setItem('picker.diary', JSON.stringify([{ key: 'stalker|1979', name: 'Stalker', year: 1979, watchedDate: vandaag, rewatch: false }]));
    localStorage.setItem('picker.history', JSON.stringify([{ key: 'stalker|1979', name: 'Stalker', year: 1979, date: new Date().toISOString(), context: null }]));
    await rDeel('jaarboek', 'jaarboek');
    render(<App />);
    rVerder('Het jaarboek');
    let titel = await screen.findByRole('dialog', { name: 'Het jaarboek' });
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'De cijfers' });
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Je kijkritme' });
    expect(titel.textContent).toContain('Een staafje per maand');
    expect(document.querySelector('[data-uitleg="jaarboek-ritme"]')).toBeTruthy();
    expect(document.querySelector('[data-uitleg="jaarboek-picks"]').textContent).toContain('Stalker');
  });

  it('Setup, kort: je lijst bijwerken, back-up, OMDb, sync en live', async () => {
    render(<App />);
    rStart('Setup: je gegevens');
    let titel = await screen.findByRole('dialog', { name: 'Je lijst bijwerken' });
    expect(titel.textContent).toContain('stap 1 van 5');
    for (const kop of ['Back-up', 'Meer scores met OMDb', 'Op al je apparaten']) {
      rVolgende(titel);
      titel = await screen.findByRole('dialog', { name: kop });
    }
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Letterboxd live' });
    rVolgende(titel, 'Klaar');
    const eind = await screen.findByRole('dialog', { name: `Dat was ${SETUP}` });
    expect(within(eind).getByRole('button', { name: 'Verder met Welkom en je lijst laden' })).toBeTruthy();
    expect(watchlistNu().length).toBeGreaterThan(0);
  });

  it('Setup, de basis: een verkeerde film, de taal wisselt de rondleiding mee, en niets wordt gewist', async () => {
    const meta = JSON.parse(localStorage.getItem('picker.meta'));
    const eerste = watchlistNu()[0].key;
    meta[eerste] = { ...meta[eerste], yearMismatch: true, mismatchType: 'jaar' };
    localStorage.setItem('picker.meta', JSON.stringify(meta));
    await rDeel('setup', 'setup');
    render(<App />);
    rVerder(SETUP);
    let titel = await screen.findByRole('dialog', { name: 'De filmdata van TMDB' });
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Je lijst bijwerken' });
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Een verkeerde film' });
    expect(titel.textContent).toContain('Wijkt het jaar af');
    expect(document.querySelector('[data-uitleg="setup-match"]').textContent).toMatch(/afwijkend jaar/);
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Taal' });
    // de rondleiding spreekt meteen de nieuwe taal
    fireEvent.click(within(document.querySelector('[data-uitleg="setup-taal"]')).getByRole('button', { name: 'English' }));
    titel = await screen.findByRole('dialog', { name: 'Language' });
    rVolgende(titel, 'Next');
    titel = await screen.findByRole('dialog', { name: 'Your country' });
    rVolgende(titel, 'Next');
    titel = await screen.findByRole('dialog', { name: 'Profiles' });
    rVolgende(titel, 'Next');
    titel = await screen.findByRole('dialog', { name: 'Backup' });
    // ook de knop van de langere tekst spreekt Engels
    expect(within(titel).getByRole('button', { name: 'Less' })).toBeTruthy();
    rVolgende(titel, 'Next');
    titel = await screen.findByRole('dialog', { name: 'Starting over' });
    expect(titel.textContent).toContain('Your settings and keys stay');
    rVolgende(titel, 'Done');
    await screen.findByRole('dialog', { name: 'That was Setup: your data and the extras' });
    expect(watchlistNu().length).toBeGreaterThan(0);
  });

  it('Setup, de extra’s: van OMDb tot de première, en zoeken op sync', async () => {
    await rDeel('setup', 'extras');
    render(<App />);
    fireEvent.click(rKnop());
    const p = document.querySelector('.uitleg-programma');
    fireEvent.change(within(p).getByLabelText('Zoek in de uitleg'), { target: { value: 'sync' } });
    expect(p.textContent).toContain('Bij: Op al je apparaten');
    fireEvent.change(within(p).getByLabelText('Zoek in de uitleg'), { target: { value: '' } });
    fireEvent.click(within(p).getByRole('button', { name: `Verder waar je was: ${SETUP}` }));
    let titel = await screen.findByRole('dialog', { name: 'Meer scores met OMDb' });
    expect(titel.textContent).toContain('kies FREE (1000 films per dag)');
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Op al je apparaten' });
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Letterboxd live' });
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Thema-nadruk' });
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'Als app op je telefoon' });
    expect(titel.textContent).toContain('Zet op beginscherm');
    rVolgende(titel);
    titel = await screen.findByRole('dialog', { name: 'De première nog eens' });
    rVolgende(titel, 'Klaar');
    await screen.findByRole('dialog', { name: `Dat was ${SETUP}` });
  });

});

// "Hoe werkt dit?": de stille ingangen bij de kaarten met veel opzet. Ze
// openen hun stap met alles van dat deel, de langere tekst al open.
describe('de rondleiding: Hoe werkt dit?', () => {
  beforeEach(() => { cleanup(); seed(); });
  const hoe = (anker) => within(document.querySelector(`[data-uitleg="${anker}"]`)).getByRole('button', { name: 'Hoe werkt dit?' });
  const stop = async (naam) => {
    const titel = await screen.findByRole('dialog', { name: naam }, { timeout: 3000 });
    fireEvent.click(within(titel).getByRole('button', { name: 'Stop' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: naam })).toBeNull());
  };

  it('Setup en het jaarboek: elk linkje opent zijn eigen stap', async () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Setup')[0]);
    fireEvent.click(hoe('setup-omdb'));
    const titel = await screen.findByRole('dialog', { name: 'Meer scores met OMDb' }, { timeout: 3000 });
    expect(titel.querySelector('.uitleg-meer').hidden).toBe(false);
    await stop('Meer scores met OMDb');
    fireEvent.click(hoe('setup-sync'));
    await stop('Op al je apparaten');
    fireEvent.click(hoe('setup-live'));
    await stop('Letterboxd live');
    expect(rInstellingen().uitleg.bezig).toEqual({ h: 'setup', s: 10, deel: 'extras' });
    fireEvent.click(screen.getAllByLabelText('Jaarboek')[0]);
    fireEvent.click(hoe('jaarboek-leren'));
    await stop('Leer mijn smaak');
  });

  it('Filmavond: de zaal, Voor ons en Op afstand', async () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText('Filmavond')[0]);
    // Hoe kiezen jullie? Elke manier toont zijn eigen kaarten
    fireEvent.click(screen.getByRole('button', { name: /^In de zaal/ }));
    fireEvent.click(hoe('zaal-kaart'));
    await stop('Iedereen stemt mee');
    fireEvent.click(screen.getByRole('button', { name: /^Met een link/ }));
    fireEvent.click(hoe('samen-host'));
    await stop('Voor ons');
    fireEvent.click(hoe('afstand'));
    await stop('Op afstand');
  });
});
