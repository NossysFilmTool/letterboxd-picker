// Tests voor het IndexedDB-pad van de filmcache. Draait met fake-indexeddb;
// de smoke-tests dekken het localStorage-terugvalpad (jsdom heeft geen IDB).
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

describe('filmcache in IndexedDB', () => {
  beforeEach(async () => {
    localStorage.clear();
    const { idbClear } = await import('../src/lib/idb.js');
    await idbClear();
  });

  it('roundtrip: schrijven, lezen en verwijderen', async () => {
    const { idbApply, idbGetAll, idbAvailable } = await import('../src/lib/idb.js');
    expect(idbAvailable()).toBe(true);
    await idbApply({ 'a|2020': { id: 1, vote: 7.5 }, 'b|1999': { id: 2 } }, []);
    let all = await idbGetAll();
    expect(Object.keys(all).length).toBe(2);
    expect(all['a|2020'].vote).toBe(7.5);
    await idbApply({}, ['b|1999']);
    all = await idbGetAll();
    expect(Object.keys(all).length).toBe(1);
  });

  it('migratie: oude localStorage-cache verhuist naar IndexedDB en maakt ruimte vrij', async () => {
    localStorage.setItem('picker.meta', JSON.stringify({ 'oud|2015': { id: 9, vote: 8.1 } }));
    const { useMetaStore } = await import('../src/lib/storage.js');
    const { result } = renderHook(() => useMetaStore());
    await waitFor(() => expect(result.current[2]).toBe(true)); // metaReady
    expect(result.current[0]['oud|2015'].vote).toBe(8.1);       // data geladen
    expect(localStorage.getItem('picker.meta')).toBeNull();    // LS opgeruimd
    const { idbGetAll } = await import('../src/lib/idb.js');
    const all = await idbGetAll();
    expect(all['oud|2015'].id).toBe(9);
  });

  it('persistentie: wijzigingen landen als diff in IndexedDB', async () => {
    const { useMetaStore } = await import('../src/lib/storage.js');
    const { idbGetAll } = await import('../src/lib/idb.js');
    const { result } = renderHook(() => useMetaStore());
    await waitFor(() => expect(result.current[2]).toBe(true));
    act(() => { result.current[1]((prev) => ({ ...prev, 'nieuw|2024': { id: 5, vote: 7.0 } })); });
    await waitFor(async () => {
      const all = await idbGetAll();
      expect(all['nieuw|2024']?.id).toBe(5);
    }, { timeout: 2000 });
    // en verwijderen
    act(() => { result.current[1]((prev) => { const n = { ...prev }; delete n['nieuw|2024']; return n; }); });
    await waitFor(async () => {
      const all = await idbGetAll();
      expect(all['nieuw|2024']).toBeUndefined();
    }, { timeout: 2000 });
  });

  it('back-up: exportAll neemt de cache mee en importAll zet hem terug in IDB', async () => {
    const { exportAll, importAll } = await import('../src/lib/storage.js');
    const { idbGetAll, idbClear } = await import('../src/lib/idb.js');
    localStorage.setItem('picker.settings', JSON.stringify({ lang: 'nl' }));
    const json = exportAll({ 'film|2021': { id: 7, vote: 6.9 } });
    const parsed = JSON.parse(json);
    expect(parsed.data['picker.meta']).toContain('film|2021');
    await idbClear();
    await importAll(json);
    const all = await idbGetAll();
    expect(all['film|2021'].vote).toBe(6.9);
    expect(localStorage.getItem('picker.meta')).toBeNull(); // niet per ongeluk in LS
  });
});

describe('de verhuizing van de oude naam (versie 6)', () => {
  it('sleutels verhuizen één keer; wat er onder de nieuwe naam al staat, wint', async () => {
    const { verhuisOpslag } = await import('../src/lib/naamruimte.js');
    localStorage.clear();
    localStorage.setItem('nossyV2.watchlist', '[1]');
    localStorage.setItem('nossyV2.p.Sam.settings', '{"lang":"en"}');
    localStorage.setItem('nossyV2.settings', '{"oud":true}');
    localStorage.setItem('picker.settings', '{"nieuw":true}');
    localStorage.setItem('iets-anders', 'x');
    expect(verhuisOpslag()).toBe(2);
    expect(localStorage.getItem('picker.watchlist')).toBe('[1]');
    expect(localStorage.getItem('picker.p.Sam.settings')).toBe('{"lang":"en"}');
    expect(localStorage.getItem('picker.settings')).toBe('{"nieuw":true}');
    expect(localStorage.getItem('iets-anders')).toBe('x');
    expect(Object.keys(localStorage).some((k) => k.startsWith('nossyV2.'))).toBe(false);
    expect(verhuisOpslag()).toBe(0);
  });

  it('de filmdata komt mee uit de oude database, en die verdwijnt daarna', async () => {
    // Een profiel, zodat dit los staat van de database van de andere tests
    await new Promise((klaar, mis) => {
      const req = indexedDB.open('nossyV2-p-Verhuis', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('meta');
      req.onsuccess = () => {
        const db = req.result;
        const t = db.transaction('meta', 'readwrite');
        t.objectStore('meta').put({ id: 5, vote: 7.2 }, 'oud|2001');
        t.oncomplete = () => { db.close(); klaar(); };
        t.onerror = () => mis(t.error);
      };
      req.onerror = () => mis(req.error);
    });
    localStorage.clear();
    localStorage.setItem('picker.activeProfile', 'Verhuis');
    const { vi } = await import('vitest');
    vi.resetModules();
    const { idbGetAll } = await import('../src/lib/idb.js');
    const alles = await idbGetAll();
    expect(alles['oud|2001'].vote).toBe(7.2);
    const namen = (await indexedDB.databases()).map((d) => d.name);
    expect(namen).toContain('picker-p-Verhuis');
    await waitFor(async () => expect((await indexedDB.databases()).map((d) => d.name)).not.toContain('nossyV2-p-Verhuis'));
    // Zonder oude database maakt het openen er ook geen aan
    localStorage.setItem('picker.activeProfile', 'Nieuw');
    vi.resetModules();
    const vers = await import('../src/lib/idb.js');
    expect(await vers.idbGetAll()).toEqual({});
    expect((await indexedDB.databases()).map((d) => d.name)).not.toContain('nossyV2-p-Nieuw');
    localStorage.clear();
  });
});
