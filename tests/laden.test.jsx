// Licht laden (versie 6): een gast laadt alleen zijn eigen scherm, iedereen
// alleen zijn eigen taal. Een eigen testbestand, omdat deze tests de modules
// opnieuw laden (vi.resetModules) en dat de andere tests niet mag raken.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup } from '@testing-library/react';
import { isGastAdres } from '../src/app/gastAdres.js';
import nl from '../src/lib/dict/nl.js';
import en from '../src/lib/dict/en.js';

const sleutels = (o, pad = '') => Object.entries(o).flatMap(([k, v]) => (
  v && typeof v === 'object' && !Array.isArray(v) && !('one' in v || 'other' in v)
    ? sleutels(v, `${pad}${k}.`)
    : [`${pad}${k}`]
));

const lobby = () => ({ ok: true, status: 200, json: async () => ({ host: '', winner: null, votes: {}, films: [{ key: 'a|2020', name: 'A', year: 2020 }] }) });

describe('licht laden', () => {
  afterEach(() => { cleanup(); document.body.innerHTML = ''; vi.resetModules(); });

  it('herkent een gastenadres', () => {
    expect(isGastAdres('?zaal=XANU')).toBe(true);
    expect(isGastAdres('?avond=ABC123')).toBe(true);
    expect(isGastAdres('?samen=XYZ')).toBe(true);
    // Geen gast: het kale adres, een koppellink, de rondleiding, een kapotte zaalcode
    for (const s of ['', '?sync=GEHEIM', '?uitleg', '?zaal=12']) expect(isGastAdres(s)).toBe(false);
  });

  it('een gast met een deellink krijgt alleen zijn eigen scherm', async () => {
    global.fetch = vi.fn(async () => lobby());
    localStorage.setItem('picker.settings', JSON.stringify({ lang: 'nl' }));
    window.history.replaceState(null, '', '/?avond=ABC123');
    document.body.innerHTML = '<div id="root"></div>';
    await import('../src/main.jsx');
    expect(await screen.findByText('Kies samen een film', {}, { timeout: 8000 })).toBeTruthy();
    expect(document.querySelector('nav')).toBeNull();
  }, 15000);

  it('wie de tool zelf gebruikt, krijgt de hele tool', async () => {
    // Zonder instellingen: de taal van de browser (in jsdom Engels)
    localStorage.clear();
    window.history.replaceState(null, '', '/');
    document.body.innerHTML = '<div id="root"></div>';
    await import('../src/main.jsx');
    expect((await screen.findAllByLabelText('Setup', {}, { timeout: 8000 })).length).toBeGreaterThan(0);
    expect(document.documentElement.textContent).toMatch(/Tonight/);
  }, 15000);

  it('laadt een taal pas als je hem kiest, en wisselt dan', async () => {
    vi.resetModules();
    const i18n = await import('../src/lib/i18n.js');
    const { NAAM } = await import('../src/lib/merk.js');
    expect(i18n.t('nav.huis')).toBe('nav.huis'); // nog niets geladen
    i18n.setLang('en');
    expect(i18n.getLang()).toBe('nl'); // eerst de teksten
    await vi.waitFor(() => expect(i18n.getLang()).toBe('en'));
    expect(i18n.t('kaartje.gevondenKnop')).toBe(`Found via ${NAAM}`);
    // Snel heen en weer: de laatste keuze wint, ook als een taal nog laadt
    vi.resetModules();
    const vers = await import('../src/lib/i18n.js');
    vers.setLang('en');
    vers.setLang('nl');
    await vers.laadTaal('en');
    await new Promise((r) => { setTimeout(r, 0); });
    expect(vers.getLang()).toBe('nl');
  });

  it('beide talen hebben precies dezelfde teksten', () => {
    const inNl = sleutels(nl);
    const inEn = sleutels(en);
    expect(inNl.filter((k) => !inEn.includes(k))).toEqual([]);
    expect(inEn.filter((k) => !inNl.includes(k))).toEqual([]);
  });
});
