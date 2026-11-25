import { useEffect, useMemo, useRef, useState } from 'react';
import { useLS } from '../lib/storage.js';
import { enrichAll, refreshProviders, resolveFilm, fetchDetailById, herstelFestivalJaar, FESTIVAL_DREMPEL } from '../lib/tmdb.js';
import { fetchExtRatings } from '../lib/omdb.js';
import { meld } from '../lib/melding.js';
import { logFout } from '../lib/foutlog.js';

// De filmdata: ophalen bij TMDB (posters, cijfers, streaming), de scores van
// OMDb (IMDb, Rotten Tomatoes, Metacritic), en rustig verversen op de
// achtergrond.
export function useVerrijking({ settings, bieb, tmdbKey, tr }) {
  const { watchlist, meta, setMeta, metaReady, metaRef, mergedRatedFilms, watchedFilms, ignoredSet } = bieb;
  const [enrich, setEnrich] = useState({ running: false, done: 0, total: 0, errors: 0 });
  const [extEnrich, setExtEnrich] = useState({ running: false, done: 0, total: 0, ok: 0, lastError: null, ranOnce: false });
  const stopRef = useRef(false);
  const enrichBezig = useRef(false);
  const enrichDaarna = useRef(null);

  // OMDb-sleutels: meervoud (omdbKeys), met de oude enkele sleutel als terugval
  const omdbKeys = useMemo(
    () => (settings.omdbKeys?.length ? settings.omdbKeys : (settings.omdbKey ? [settings.omdbKey] : [])),
    [settings.omdbKeys, settings.omdbKey],
  );

  const runExtQueue = async (todo, keys) => {
    stopRef.current = false;
    setExtEnrich({ running: true, done: 0, total: todo.length, ok: 0, lastError: null, ranOnce: true });
    let done = 0;
    let gelukt = 0;
    let lastError = null;
    let keyIdx = 0; // gedeeld: bij daglimiet of afgekeurde sleutel roteren alle werkers mee
    const queue = [...todo];
    const werker = async () => {
      while (queue.length) {
        if (stopRef.current) return;
        const film = queue.shift();
        try {
          const ratings = await fetchExtRatings(metaRef.current[film.key] || {}, film, keys[keyIdx]);
          setMeta((prev) => (prev[film.key] ? { ...prev, [film.key]: { ...prev[film.key], ext: ratings } } : prev));
          gelukt++;
        } catch (e) {
          if (e.message === 'LIMIT' || e.message === 'KEY_INVALID') {
            queue.unshift(film); // deze film gaat niet verloren
            if (keyIdx < keys.length - 1) {
              keyIdx++;
              continue;
            }
            stopRef.current = true;
            // De daglimiet is gewoon nieuws; een afgekeurde sleutel is een fout
            if (e.message === 'KEY_INVALID') logFout('omdb', e);
            meld(tr(e.message === 'LIMIT' ? 'app.omdbStopLimit' : 'app.omdbStopInvalid', { count: queue.length }),
              { soort: e.message === 'LIMIT' ? 'info' : 'fout' });
            return;
          }
          lastError = e.message || String(e); // zichtbaar maken in plaats van wegslikken
          logFout('omdb', e);
          // tijdelijke fout: film overslaan, telt wel als verwerkt
        }
        done++;
        setExtEnrich((s) => ({ ...s, done }));
      }
    };
    await Promise.all(Array.from({ length: 3 }, werker));
    setExtEnrich((s) => ({ ...s, running: false, ok: gelukt, lastError }));
    if (gelukt === 0 && done > 0) {
      meld(tr('app.omdbNoScores', { done, err: lastError ? tr('app.omdbLastError', { msg: lastError }) : '' }), { soort: 'fout' });
    }
  };

  // Tweede laag: IMDb/RT/Metacritic via OMDb (optioneel, exact via imdbId)
  const startExtEnrich = async (films, keysOverride = null) => {
    // keysOverride: net opgeslagen sleutels direct gebruiken; de instellingen
    // zijn op dat moment nog niet bijgewerkt
    const keys = keysOverride?.length ? keysOverride : omdbKeys;
    if (!keys.length) return;
    const todo = films.filter((f) => metaRef.current[f.key] && !metaRef.current[f.key].ext);
    if (todo.length) runExtQueue(todo, keys);
  };

  const startEnrichRef = useRef(null);
  const startEnrich = async (films, force = false) => {
    const key = tmdbKey;
    // Nooit ophalen voordat de cache uit IndexedDB geladen is: anders lijkt
    // alles 'ontbrekend' en halen we honderden films dubbel op.
    if (!key || !metaReady) return;
    // Loopt er al een ronde (de demo, terwijl je eigen export binnenkomt):
    // dan is deze lijst de volgende
    if (enrichBezig.current) { enrichDaarna.current = { films, force }; return; }
    const todo = force ? films : films.filter((f) => !(f.key in metaRef.current));
    if (!todo.length) return;
    enrichBezig.current = true;
    stopRef.current = false;
    setEnrich({ running: true, done: 0, total: todo.length, errors: 0 });
    try {
      await enrichAll(
        todo, key,
        (p) => setEnrich((e) => ({ ...e, ...p })),
        (filmKey, m) => setMeta((prev) => ({ ...prev, [filmKey]: m })),
        () => stopRef.current,
      );
    } catch (e) {
      logFout('filmdata', e);
      if (e.message === 'KEY_INVALID') meld(tr('app.tmdbKeyRejected'), { soort: 'fout' });
      else meld(tr('app.enrichFailed', { msg: e.message }), { soort: 'fout' });
    }
    enrichBezig.current = false;
    setEnrich((e) => ({ ...e, running: false }));
    const daarna = enrichDaarna.current;
    enrichDaarna.current = null;
    if (daarna) setTimeout(() => startEnrichRef.current?.(daarna.films, daarna.force), 0);
    else if (omdbKeys.length) startExtEnrich(films);
  };
  startEnrichRef.current = startEnrich;

  // Scores horen vanzelf te komen: staan er OMDb-sleutels en zijn er films
  // zonder scores, dan start het ophalen bij het openen van de app
  useEffect(() => {
    if (!omdbKeys.length || !watchlist.length) return;
    const mist = watchlist.some((f) => meta[f.key] && !meta[f.key].ext);
    if (mist) startExtEnrich(watchlist);
    // bewust één keer per sessie, bij het opstarten
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bij een regio-wissel is het bewaarde streamingaanbod van de oude regio.
  // Ververs dan stilletjes de diensten van de hele bibliotheek.
  const regionInitRef = useRef(true);
  useEffect(() => {
    if (regionInitRef.current) { regionInitRef.current = false; return undefined; }
    const key = tmdbKey;
    if (!key) return undefined;
    const items = Object.entries(meta).filter(([, m]) => m && m.id);
    if (!items.length) return undefined;
    let stop = false;
    (async () => {
      for (const [k, m] of items) {
        if (stop) return;
        try {
          const p = await refreshProviders(m.id, key);
          // Ander land, ander aanbod: 'net binnen' begint hier opnieuw te tellen
          setMeta((prev) => (prev[k] ? { ...prev, [k]: { ...prev[k], ...p, flatSinds: null } } : prev));
        } catch (e) { logFout('regio', e); return; }
        await new Promise((r) => setTimeout(r, 250));
      }
    })();
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.region]);

  // Streamingaanbod wisselt wekelijks: check het aanbod van je pick opnieuw
  // als de data ouder is dan een dag
  const freshenProviders = async (filmK) => {
    const m = metaRef.current[filmK];
    const key = tmdbKey;
    if (!m || !key) return;
    if (m.at && Date.now() - m.at < 24 * 3600e3) return;
    try {
      const p = await refreshProviders(m.id, key);
      setMeta((prev) => (prev[filmK] ? { ...prev, [filmK]: { ...prev[filmK], ...p } } : prev));
    } catch { /* stil; oude data blijft staan */ }
  };

  // Garandeert dat een film volledige detaildata heeft (backdrop, trailer,
  // regisseur, streaming) en OMDb-scores, zodat elk scherm dezelfde rijke
  // kaart toont. Doet niets als alles er al is.
  const ensureDetail = async (film) => {
    const key = tmdbKey;
    if (!key || !film?.key) return;
    const cur = metaRef.current[film.key];
    const heeftDetail = cur && cur.at != null && 'trailer' in cur;
    const heeftExt = cur && cur.ext;
    if (heeftDetail && (heeftExt || !omdbKeys.length)) return;
    try {
      let base = cur;
      if (!heeftDetail) {
        base = await resolveFilm(film, key);
        if (!base) return;
      }
      let ext = base.ext;
      if (!ext && omdbKeys.length) {
        for (const k of omdbKeys) {
          try { ext = await fetchExtRatings(base, film, k); if (ext) break; } catch { /* volgende sleutel */ }
        }
      }
      const full = ext ? { ...base, ext } : base;
      setMeta((prev) => ({ ...prev, [film.key]: { ...(prev[film.key] || {}), ...full } }));
    } catch (e) { logFout('filmkaart', e); }
  };

  // De gebruiker koos zelf de juiste TMDB-film voor een lijst-item: de
  // volledige gegevens en scores ophalen, en de twijfel wissen
  const pickMatch = async (filmKey, tmdbId) => {
    const key = tmdbKey;
    if (!key) return;
    try {
      const d = await fetchDetailById(tmdbId, key);
      if (!d) return;
      delete d.yearMismatch; // handmatig bevestigd: geen twijfel meer
      d.handmatig = true; // en het festivaljaar-herstel blijft eraf
      let ext;
      for (const k of omdbKeys) {
        try { ext = await fetchExtRatings(d, { name: d.title, year: d.year }, k); if (ext) break; } catch { /* volgende sleutel */ }
      }
      const full = ext ? { ...d, ext } : d;
      setMeta((prev) => ({ ...prev, [filmKey]: full }));
    } catch (e) { logFout('koppelen', e); }
  };

  // Eenmalig herstel van koppelingen aan een obscure naamgenoot door het
  // festivaljaar (Mud 2012 met 1 stem in plaats van Mud 2013). Alleen films
  // met weinig stemmen, rustig op de achtergrond; een netwerkfout stelt het
  // uit tot de volgende sessie.
  const [koppelHerstel, setKoppelHerstel] = useLS('koppelHerstel', 0);
  useEffect(() => {
    const key = tmdbKey;
    if (!key || !metaReady || koppelHerstel >= 1) return undefined;
    const films = new Map();
    [...watchlist, ...mergedRatedFilms, ...watchedFilms].forEach((f) => { if (f?.key && f.name && f.year) films.set(f.key, f); });
    const todo = [...films.values()].filter((f) => {
      const m = meta[f.key];
      return m?.id && (m.votes ?? 0) < FESTIVAL_DREMPEL && !m.handmatig && !ignoredSet.has(f.key);
    });
    if (!todo.length) { setKoppelHerstel(1); return undefined; }
    let stop = false;
    (async () => {
      // eerst de opstart (ophalen, Voor jou) voor laten gaan
      await new Promise((r) => setTimeout(r, 4000));
      for (const f of todo) {
        if (stop) return;
        try {
          const beter = await herstelFestivalJaar(f, metaRef.current[f.key], key);
          if (beter) setMeta((prev) => (prev[f.key] && !prev[f.key].handmatig ? { ...prev, [f.key]: beter } : prev));
        } catch { return; }
        await new Promise((r) => setTimeout(r, 250));
      }
      if (!stop) setKoppelHerstel(1);
    })();
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tmdbKey, metaReady]);

  // En op de achtergrond: per sessie de 80 oudste films stilletjes verversen
  useEffect(() => {
    const key = tmdbKey;
    if (!key || !watchlist.length || !metaReady) return undefined;
    const WEEK = 7 * 24 * 3600e3;
    const stale = watchlist
      .filter((f) => meta[f.key] && (!meta[f.key].at || Date.now() - meta[f.key].at > WEEK))
      .sort((a, b) => (meta[a.key].at || 0) - (meta[b.key].at || 0))
      .slice(0, 80);
    if (!stale.length) return undefined;
    let stop = false;
    (async () => {
      for (const f of stale) {
        if (stop) return;
        try {
          const p = await refreshProviders(meta[f.key].id, key);
          setMeta((prev) => (prev[f.key] ? { ...prev, [f.key]: { ...prev[f.key], ...p } } : prev));
        } catch { return; }
        await new Promise((r) => setTimeout(r, 300));
      }
    })();
    return () => { stop = true; };
    // bewust één keer per sessie, zodra de cache geladen is
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaReady]);

  // Stoppen: bij Pauzeer, en bij terug naar start of een nieuwe import
  const stopEnrich = () => { stopRef.current = true; };
  const wis = () => { stopRef.current = true; setEnrich({ running: false, done: 0, total: 0, errors: 0 }); };

  return {
    enrich, extEnrich, omdbKeys,
    startEnrich, startEnrichRef, startExtEnrich, stopEnrich,
    freshenProviders, ensureDetail, pickMatch,
    wis,
  };
}
