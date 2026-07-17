// Tests voor het IndexedDB-pad van de filmcache. Draait met fake-indexeddb;
// de smoke-tests dekken het localStorage-terugvalpad (jsdom heeft geen IDB).
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

describe('filmcache in IndexedDB', () => {
  beforeEach(async () => {
    localStorage.clear();
    const { idbClear } = await import('./src/lib/idb.js');
    await idbClear();
  });

  it('roundtrip: schrijven, lezen en verwijderen', async () => {
    const { idbApply, idbGetAll, idbAvailable } = await import('./src/lib/idb.js');
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
    localStorage.setItem('nossyV2.meta', JSON.stringify({ 'oud|2015': { id: 9, vote: 8.1 } }));
    const { useMetaStore } = await import('./src/lib/storage.js');
    const { result } = renderHook(() => useMetaStore());
    await waitFor(() => expect(result.current[2]).toBe(true)); // metaReady
    expect(result.current[0]['oud|2015'].vote).toBe(8.1);       // data geladen
    expect(localStorage.getItem('nossyV2.meta')).toBeNull();    // LS opgeruimd
    const { idbGetAll } = await import('./src/lib/idb.js');
    const all = await idbGetAll();
    expect(all['oud|2015'].id).toBe(9);
  });

  it('persistentie: wijzigingen landen als diff in IndexedDB', async () => {
    const { useMetaStore } = await import('./src/lib/storage.js');
    const { idbGetAll } = await import('./src/lib/idb.js');
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
    const { exportAll, importAll } = await import('./src/lib/storage.js');
    const { idbGetAll, idbClear } = await import('./src/lib/idb.js');
    localStorage.setItem('nossyV2.settings', JSON.stringify({ lang: 'nl' }));
    const json = exportAll({ 'film|2021': { id: 7, vote: 6.9 } });
    const parsed = JSON.parse(json);
    expect(parsed.data['nossyV2.meta']).toContain('film|2021');
    await idbClear();
    await importAll(json);
    const all = await idbGetAll();
    expect(all['film|2021'].vote).toBe(6.9);
    expect(localStorage.getItem('nossyV2.meta')).toBeNull(); // niet per ongeluk in LS
  });
});
