import { useMemo, useRef, useState } from 'react';
import Shell from './components/Shell.jsx';
import Pick from './tabs/Pick.jsx';
import Bieb from './tabs/Bieb.jsx';
import Verken from './tabs/Verken.jsx';
import Avond from './tabs/Avond.jsx';
import Inzicht from './tabs/Inzicht.jsx';
import Instellingen from './tabs/Instellingen.jsx';
import { useLS, useStorageHealth } from './lib/storage.js';
import { enrichAll, refreshProviders, resolveFilm, fetchDetailById, setRegion, DEFAULT_REGION } from './lib/tmdb.js';
import { setNossyWeights } from './lib/pick.js';
import { setThemeEmphasis } from './lib/taste.js';
import { fetchExtRatings } from './lib/omdb.js';
import { useEffect } from 'react';
import { registerDict, setLang, detectLang, getLang, useT } from './lib/i18n.js';
import nlDict from './lib/dict/nl.js';
import enDict from './lib/dict/en.js';

registerDict('nl', nlDict);
registerDict('en', enDict);

export default function App() {
  const [tab, setTab] = useState('pick');
  const { t: tr } = useT();
  const storageBroken = useStorageHealth();
  const [settings, setSettings] = useLS('settings', { tmdbKey: '' });
  const [watchlist, setWatchlist] = useLS('watchlist', []);
  const [watchedLb, setWatchedLb] = useLS('watchedLb', []);
  const [watchedFilms, setWatchedFilms] = useLS('watchedFilms', []); // met naam/jaar, voor de Bieb
  const [ratings, setRatings] = useLS('ratings', {});
  const [ratedFilms, setRatedFilms] = useLS('ratedFilms', []); // uit ratings.csv, incl. films buiten je watchlist
  const [seen, setSeen] = useLS('seen', []);
  const [meta, setMeta] = useLS('meta', {});
  const [history, setHistory] = useLS('history', []);
  const [shortlist, setShortlist] = useLS('shortlist', []);
  const [skipped, setSkipped] = useLS('skipped', []);
  const [ignored, setIgnored] = useLS('ignored', []); // keys van items die geen film zijn (bijv. tv-series)
  const [smart, setSmart] = useLS('smart', false);
  const [demoMode, setDemoMode] = useLS('demoMode', false);
  const [enrich, setEnrich] = useState({ running: false, done: 0, total: 0, errors: 0 });
  const [extEnrich, setExtEnrich] = useState({ running: false, done: 0, total: 0, ok: 0, lastError: null, ranOnce: false });
  const stopRef = useRef(false);
  const metaRef = useRef(meta);
  useEffect(() => { metaRef.current = meta; }, [meta]);
  // Jouw Nossy-recept doorvoeren in de rekenmodule (ook voor Bieb-sortering, moods, slimme pick)
  setNossyWeights(settings.nossyWeights);
  setThemeEmphasis(settings.themeEmphasis);
  setRegion(settings.region || DEFAULT_REGION);
  // Taal: opgeslagen keuze, anders browsertaal als slim startpunt
  if (getLang() !== (settings.lang || detectLang())) setLang(settings.lang || detectLang());
  useEffect(() => { setLang(settings.lang || detectLang()); }, [settings.lang]);
  useEffect(() => { setNossyWeights(settings.nossyWeights); }, [settings.nossyWeights]);
  useEffect(() => { setRegion(settings.region || DEFAULT_REGION); }, [settings.region]);
  // Bij een regio-wissel is het gecachete streamingaanbod van de oude regio.
  // Ververs dan stilletjes de providers (en JustWatch-link) van de hele bieb.
  const regionInitRef = useRef(true);
  useEffect(() => {
    if (regionInitRef.current) { regionInitRef.current = false; return undefined; }
    const key = settings.tmdbKey;
    if (!key) return undefined;
    const items = Object.entries(meta).filter(([, m]) => m && m.id);
    if (!items.length) return undefined;
    let stop = false;
    (async () => {
      for (const [k, m] of items) {
        if (stop) return;
        try {
          const p = await refreshProviders(m.id, key);
          setMeta((prev) => (prev[k] ? { ...prev, [k]: { ...prev[k], ...p } } : prev));
        } catch { return; }
        await new Promise((r) => setTimeout(r, 250));
      }
    })();
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.region]);
  useEffect(() => { setThemeEmphasis(settings.themeEmphasis); }, [settings.themeEmphasis]);

  // Terug naar start: leegt de bibliotheek (watchlist, filmdata, ratings, geschiedenis)
  // maar bewaart instellingen zoals je TMDB-sleutel.
  const resetLibrary = () => {
    stopRef.current = true;
    setEnrich({ running: false, done: 0, total: 0, errors: 0 });
    setWatchlist([]);
    setWatchedLb([]);
    setWatchedFilms([]);
    setRatings({});
    setRatedFilms([]);
    setSeen([]);
    setMeta({});
    setHistory([]);
    setShortlist([]);
    setSkipped([]);
    setIgnored([]);
    setDemoMode(false);
    setTab('pick');
  };

  const seenSet = useMemo(() => new Set([...watchedLb, ...seen]), [watchedLb, seen]);
  const ignoredSet = useMemo(() => new Set(ignored), [ignored]);
  // Markeer een lijst-item als 'geen film' (bijv. een tv-serie die Letterboxd
  // meesmokkelde): het verdwijnt uit aanbevelingen, Avond en de mismatch-lijst.
  const ignoreFilm = (filmKey) => {
    setIgnored((prev) => (prev.includes(filmKey) ? prev : [...prev, filmKey]));
    // eventuele twijfelvlag opruimen zodat Setup niet blijft zeuren
    setMeta((prev) => {
      if (!prev[filmKey]?.yearMismatch) return prev;
      const { yearMismatch, ...rest } = prev[filmKey];
      return { ...prev, [filmKey]: rest };
    });
  };
  const unignoreFilm = (filmKey) => setIgnored((prev) => prev.filter((k) => k !== filmKey));

  const toggleSeen = (key) => {
    setSeen((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));
  };

  const startEnrich = async (films, force = false) => {
    const key = settings.tmdbKey;
    if (!key || enrich.running) return;
    const todo = force ? films : films.filter((f) => !(f.key in meta));
    if (!todo.length) return;
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
      if (e.message === 'KEY_INVALID') alert(tr('app.tmdbKeyRejected'));
      else alert(tr('app.enrichFailed', { msg: e.message }));
    }
    setEnrich((e) => ({ ...e, running: false }));
    if (omdbKeys.length) startExtEnrich(films);
  };

  // OMDb-sleutels: nieuw meervoud (omdbKeys), met migratie van de oude enkele sleutel
  const omdbKeys = settings.omdbKeys?.length ? settings.omdbKeys : (settings.omdbKey ? [settings.omdbKey] : []);

  // Tweede laag: IMDb/RT/Metacritic via OMDb (optioneel, exact via imdbId)
  const startExtEnrich = async (films, keysOverride = null) => {
    // keysOverride: net opgeslagen sleutels direct gebruiken — de settings-state
    // is op dat moment nog niet bijgewerkt (setState is asynchroon)
    const keys = keysOverride?.length ? keysOverride : omdbKeys;
    if (!keys.length) return;
    const todo = films.filter((f) => metaRef.current[f.key] && !metaRef.current[f.key].ext);
    if (todo.length) runExtQueue(todo, keys);
  };

  const runExtQueue = async (todo, keys) => {
    stopRef.current = false;
    setExtEnrich({ running: true, done: 0, total: todo.length, ok: 0, lastError: null, ranOnce: true });
    let done = 0;
    let gelukt = 0;
    let lastError = null;
    let keyIdx = 0; // gedeeld: bij daglimiet of afgekeurde sleutel roteren alle workers mee
    const queue = [...todo];
    const worker = async () => {
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
            alert(tr(e.message === 'LIMIT' ? 'app.omdbStopLimit' : 'app.omdbStopInvalid', { count: queue.length + 1 }));
            return;
          }
          lastError = e.message || String(e); // zichtbaar maken i.p.v. wegslikken
          // tijdelijke fout: film overslaan, telt wel als verwerkt
        }
        done++;
        setExtEnrich((s) => ({ ...s, done }));
      }
    };
    await Promise.all(Array.from({ length: 3 }, worker));
    setExtEnrich((s) => ({ ...s, running: false, ok: gelukt, lastError }));
    if (gelukt === 0 && done > 0) {
      alert(tr('app.omdbNoScores', { done, err: lastError ? tr('app.omdbLastError', { msg: lastError }) : '' }));
    }
  };

  // Scores horen vanzelf te komen: staan er OMDb-sleutels en zijn er verrijkte
  // films zonder scores, dan start het ophalen bij het openen van de app —
  // geen verstopte knop in Setup nodig.
  useEffect(() => {
    if (!omdbKeys.length || !watchlist.length) return;
    const mist = watchlist.some((f) => meta[f.key] && !meta[f.key].ext);
    if (mist) startExtEnrich(watchlist);
    // bewust één keer per sessie, bij het opstarten
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Streamingaanbod wisselt wekelijks: check het aanbod van je pick opnieuw
  // als de data ouder is dan een dag.
  const freshenProviders = async (filmK) => {
    const m = metaRef.current[filmK];
    const key = settings.tmdbKey;
    if (!m || !key) return;
    if (m.at && Date.now() - m.at < 24 * 3600e3) return;
    try {
      const p = await refreshProviders(m.id, key);
      setMeta((prev) => (prev[filmK] ? { ...prev, [filmK]: { ...prev[filmK], ...p } } : prev));
    } catch { /* stil; oude data blijft staan */ }
  };

  // Garandeert dat een film volledige detaildata heeft (backdrop, trailer,
  // regisseur, streaming) én OMDb-scores — zodat élke tab dezelfde rijke kaart
  // toont. Idempotent en gecachet: doet niks als alles er al is.
  const ensureDetail = async (film) => {
    const key = settings.tmdbKey;
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
    } catch { /* kaart blijft op wat er al was */ }
  };

  // De gebruiker koos handmatig de juiste TMDB-film voor een watchlist-item.
  // We halen de volledige detail + scores op en wissen de mismatch-vlag —
  // geen giswerk meer, jouw keuze is leidend.
  const pickMatch = async (filmKey, tmdbId) => {
    const key = settings.tmdbKey;
    if (!key) return;
    try {
      const d = await fetchDetailById(tmdbId, key);
      if (!d) return;
      delete d.yearMismatch; // handmatig bevestigd → geen twijfel meer
      let ext;
      for (const k of omdbKeys) {
        try { ext = await fetchExtRatings(d, { name: d.title, year: d.year }, k); if (ext) break; } catch { /* volgende sleutel */ }
      }
      const full = ext ? { ...d, ext } : d;
      setMeta((prev) => ({ ...prev, [filmKey]: full }));
    } catch { /* stil; oude data blijft staan */ }
  };

  // En op de achtergrond: per sessie de 80 oudste films stilletjes verversen
  useEffect(() => {
    const key = settings.tmdbKey;
    if (!key || !watchlist.length) return undefined;
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
    // bewust alleen bij het opstarten van een sessie
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const app = {
    settings, setSettings,
    watchlist: watchlist.filter((f) => !ignoredSet.has(f.key)),
    watchlistAll: watchlist,
    setWatchlist,
    watchedLb, setWatchedLb,
    watchedFilms, setWatchedFilms,
    omdbKeys,
    ratings, setRatings,
    ratedFilms, setRatedFilms,
    seen, seenSet, toggleSeen,
    meta, setMeta,
    history, setHistory,
    shortlist, setShortlist,
    skipped, setSkipped,
    ignored, ignoredSet, ignoreFilm, unignoreFilm,
    smart, setSmart,
    demoMode, setDemoMode,
    resetLibrary,
    enrich, startEnrich,
    extEnrich, startExtEnrich,
    freshenProviders,
    ensureDetail,
    pickMatch,
    stopEnrich: () => { stopRef.current = true; },
  };

  const needsKey = watchlist.length > 0 && !settings.tmdbKey;

  return (
    <Shell tab={tab} setTab={setTab}>
      {storageBroken && (
        <div className="notice" role="alert" style={{ marginBottom: 18, borderLeftColor: 'var(--dot-o)' }}>
          {tr('app.storageBroken')}
        </div>
      )}
      {enrich.running && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--fog)', marginBottom: 6 }}>
            <span>{tr('app.enriching', { done: enrich.done, total: enrich.total })}{enrich.errors ? tr('app.enrichErrCount', { count: enrich.errors }) : ''}</span>
            <button className="btn ghost" style={{ padding: '2px 8px', fontSize: 12 }} onClick={app.stopEnrich}>{tr('app.pause')}</button>
          </div>
          <div className="progressbar"><div style={{ width: `${(enrich.done / Math.max(enrich.total, 1)) * 100}%` }} /></div>
        </div>
      )}
      {demoMode && watchlist.length > 0 && (
        <div className="notice" style={{ marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span dangerouslySetInnerHTML={{ __html: tr('app.demoBanner') }} />
          <button className="btn" style={{ flexShrink: 0 }} onClick={resetLibrary}>{tr('app.demoReset')}</button>
        </div>
      )}
      {!needsKey && watchlist.length > 0 && Object.keys(meta).length > 0 && !omdbKeys.length && !settings.omdbHintWeg && tab !== 'instellingen' && (
        <div className="notice" style={{ marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span>{tr('app.omdbNudge')}<a href="#setup" onClick={(e) => { e.preventDefault(); setTab('instellingen'); }}>{tr('app.omdbNudgeLink')}</a>.</span>
          <button className="btn ghost" style={{ flexShrink: 0 }} onClick={() => setSettings((s) => ({ ...s, omdbHintWeg: true }))}>{tr('app.omdbNudgeDismiss')}</button>
        </div>
      )}
      {needsKey && tab !== 'instellingen' && (
        <div className="notice warn" style={{ marginBottom: 18 }}>
          {tr('app.needKeyNotice')}
          <a href="#setup" onClick={(e) => { e.preventDefault(); setTab('instellingen'); }}>{tr('app.setupLink')}</a>.
        </div>
      )}
      {extEnrich.running && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12.5, color: 'var(--fog)', marginBottom: 6 }}>
            Scores ophalen bij OMDb… {extEnrich.done}/{extEnrich.total}
          </div>
          <div className="progressbar"><div style={{ width: `${(extEnrich.done / Math.max(extEnrich.total, 1)) * 100}%`, background: 'var(--dot-o)' }} /></div>
        </div>
      )}
      <div className="tabfade" key={tab}>
        {tab === 'pick' && <Pick app={app} />}
        {tab === 'bieb' && <Bieb app={app} />}
        {tab === 'verken' && <Verken app={app} />}
        {tab === 'avond' && <Avond app={app} />}
        {tab === 'inzicht' && <Inzicht app={app} />}
        {tab === 'instellingen' && <Instellingen app={app} />}
      </div>
    </Shell>
  );
}
