import { useCallback, useMemo, useRef, useState } from 'react';
import Shell from './components/Shell.jsx';
import ScoresPreview from './components/ScoresPreview.jsx';
import RemoteVote from './components/RemoteVote.jsx';
import SamenGast from './components/SamenGast.jsx';
import SimilarOverlay from './components/SimilarOverlay.jsx';
import { buildTaste } from './lib/taste.js';
import Pick from './tabs/Pick.jsx';
import Bieb from './tabs/Bieb.jsx';
import Verken from './tabs/Verken.jsx';
import Avond from './tabs/Avond.jsx';
import Inzicht from './tabs/Inzicht.jsx';
import Instellingen from './tabs/Instellingen.jsx';
import { useLS, useStorageHealth, useMetaStore } from './lib/storage.js';
import { enrichAll, refreshProviders, resolveFilm, fetchDetailById, setRegion, DEFAULT_REGION, effectiveTmdbKey, herstelFestivalJaar, FESTIVAL_DREMPEL } from './lib/tmdb.js';
import { setNossyWeights } from './lib/pick.js';
import { setThemeEmphasis } from './lib/taste.js';
import { fetchExtRatings } from './lib/omdb.js';
import { volgAanbod } from './lib/aanbod.js';
import { nieuwKaartje, voegKaartjeToe, kaartjesUitGeschiedenis, beoordeelKaartjes, AVOND_GAT } from './lib/kaartjesdoos.js';
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
  // Binnengekomen via een deellink? Dan is dit apparaat een stemmer, geen
  // volwaardige tool-sessie. Werkt ook zonder watchlist of sleutel.
  const avondCode = new URLSearchParams(location.search).get('avond');
  // Of als gast bij "Voor ons" (?samen=CODE): smaak lezen, scores sturen
  const samenCode = new URLSearchParams(location.search).get('samen');
  const [settings, setSettings] = useLS('settings', { tmdbKey: '' });
  // Eigen sleutel wint; zonder eigen sleutel loopt alles via de tool-proxy
  // (zodra die geconfigureerd is). Guards en API-calls zien gewoon 'een sleutel'.
  const tmdbKey = effectiveTmdbKey(settings.tmdbKey);
  const [watchlist, setWatchlist] = useLS('watchlist', []);
  const [watchedLb, setWatchedLb] = useLS('watchedLb', []);
  const [watchedFilms, setWatchedFilms] = useLS('watchedFilms', []); // met naam/jaar, voor de Bieb
  const [ratings, setRatings] = useLS('ratings', {});
  const [ratedFilms, setRatedFilms] = useLS('ratedFilms', []); // uit ratings.csv, incl. films buiten je watchlist
  const [seen, setSeen] = useLS('seen', []);
  const [meta, setMetaRuw, metaReady] = useMetaStore();
  // Elke wijziging van de filmdata loopt langs volgAanbod: zo onthouden we
  // sinds wanneer een film op een dienst staat (Net binnen, lib/aanbod.js)
  const setMeta = useCallback((upd) => setMetaRuw((prev) => volgAanbod(prev, typeof upd === 'function' ? upd(prev) : upd)), [setMetaRuw]);
  const [history, setHistory] = useLS('history', []);
  // Eigen sterren (uit de pick-opvolging), los van de Letterboxd-import zodat
  // een her-import ze nooit wegvaagt. Vorm: { key: { rating, name, year, at } }
  const [ownRatings, setOwnRatings] = useLS('ownRatings', {});
  // Uit dezelfde Letterboxd-export, voorheen genegeerd: het kijk-dagboek
  // (datums, herkijken) en je eigen thematische lijsten.
  const [diary, setDiary] = useLS('diary', []);
  const [lbLists, setLbLists] = useLS('lbLists', []);
  // Antwoorden op "gekeken?"-vragen, per pick-datum: 'rated' | 'seen' | 'no'
  const [followups, setFollowups] = useLS('followups', {});
  // De kaartjesdoos (lib/kaartjesdoos.js): elk kaartje van een pick, en wanneer
  // je een film als gezien markeerde (bewijs dat je een kaartje gebruikte)
  const [kaartjes, setKaartjes] = useLS('kaartjes', null);
  const [gezienOp, setGezienOp] = useLS('gezienOp', {});
  const [shortlist, setShortlist] = useLS('shortlist', []);
  const [skipped, setSkipped] = useLS('skipped', []);
  // Fase 8: het uit jouw beoordelingen geleerde rangschikmodel (Inzicht)
  const [smaakModel, setSmaakModel] = useLS('smaakModel', null);
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
    setOwnRatings({});
    setFollowups({});
    setKaartjes([]);
    setGezienOp({});
    setDiary([]);
    setLbLists([]);
    setSeen([]);
    setMeta({});
    setHistory([]);
    setShortlist([]);
    setSkipped([]);
    setSmaakModel(null);
    setIgnored([]);
    setDemoMode(false);
    setTab('pick');
  };

  const seenSet = useMemo(() => new Set([...watchedLb, ...seen]), [watchedLb, seen]);
  // Eigen sterren mengen met de Letterboxd-ratings: het smaakprofiel en alle
  // tabs zien één geheel en leren dus direct van een pick-beoordeling.
  const mergedRatings = useMemo(() => ({
    ...ratings,
    ...Object.fromEntries(Object.entries(ownRatings).map(([k, v]) => [k, v.rating])),
  }), [ratings, ownRatings]);
  const mergedRatedFilms = useMemo(() => ([
    ...ratedFilms.filter((f) => !(f.key in ownRatings)),
    ...Object.entries(ownRatings).map(([key, v]) => ({ key, name: v.name, year: v.year, rating: v.rating })),
  ]), [ratedFilms, ownRatings]);

  // De slimme aanrader: vanaf elke filmkaart, dus centraal in de app.
  const [similarSeed, setSimilarSeed] = useState(null); // {film, meta}
  const taste = useMemo(
    () => buildTaste({ watchlist, ratedFilms: mergedRatedFilms, meta, shortlist, skipped }),
    [watchlist, mergedRatedFilms, meta, shortlist, skipped],
  );

  // De kaartjesdoos. Eenmalig bij de start: kaartjes uit de pick-geschiedenis
  // en de antwoorden op de oude "Gekeken?"-vraag.
  useEffect(() => {
    if (kaartjes === null) setKaartjes(kaartjesUitGeschiedenis(history, followups, ownRatings));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const kaartjesStand = useMemo(
    () => beoordeelKaartjes(kaartjes || [], { diary, gezienOp, ownRatings }),
    [kaartjes, diary, gezienOp, ownRatings],
  );
  // Een pick (of de winnaar van Avond) levert een kaartje op
  const geefKaartje = (film, opties = {}) => {
    setKaartjes((lijst) => voegKaartjeToe(lijst || [], nieuwKaartje(film, opties)));
  };
  // Doorklikken naar een dienst of delen: dit kaartje gaat vooraan in de vraag
  const kaartjeDoorgeklikt = (key) => {
    const nu = Date.now();
    setKaartjes((lijst) => (lijst || []).map((k) => (
      k.key === key && nu - Date.parse(k.datum) < AVOND_GAT && !k.doorgeklikt ? { ...k, doorgeklikt: true } : k
    )));
  };
  const markeerAlsGezien = (key) => {
    setSeen((s) => (s.includes(key) ? s : [...s, key]));
    setGezienOp((g) => ({ ...g, [key]: new Date().toISOString() }));
  };
  // Het antwoord op de vraag na een avond: welk kaartje heb je gebruikt (of
  // geen). gekozen: key van de gekeken film, of null voor "geen van allen".
  const beantwoordAvond = (avond, gekozen, sterren = null) => {
    const nu = new Date().toISOString();
    const ids = new Set(avond.map((k) => k.id));
    setKaartjes((lijst) => (lijst || []).map((k) => {
      if (!ids.has(k.id)) return k;
      if (k.key === gekozen) return { ...k, antwoord: 'gekeken', sterren: sterren || null, beantwoord: nu };
      return { ...k, antwoord: 'niet', beantwoord: nu };
    }));
    if (!gekozen) return;
    const film = avond.find((k) => k.key === gekozen);
    markeerAlsGezien(gekozen);
    if (sterren && film) setOwnRatings((prev) => ({ ...prev, [gekozen]: { rating: sterren, name: film.name, year: film.year, at: Date.now() } }));
  };
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
    const wasGezien = seen.includes(key);
    setSeen((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));
    setGezienOp((g) => {
      if (!wasGezien) return { ...g, [key]: new Date().toISOString() };
      const { [key]: _, ...rest } = g;
      return rest;
    });
  };
  // Een film van buiten je lijst als gezien markeren, desgewenst met sterren
  // (bijv. vanuit Voor jou). Sterren tellen als eigen beoordeling en voeden zo
  // je smaakprofiel; de filmdata (`detail`) zetten we er direct bij, met het
  // exacte TMDB-id, zodat er niets op titel geraden hoeft te worden.
  const markeerGezien = (film, sterren = null, detail = null) => {
    markeerAlsGezien(film.key);
    if (sterren) setOwnRatings((prev) => ({ ...prev, [film.key]: { rating: sterren, name: film.name, year: film.year, at: Date.now() } }));
    if (detail) setMeta((prev) => (prev[film.key] ? prev : { ...prev, [film.key]: detail }));
  };

  const startEnrich = async (films, force = false) => {
    const key = tmdbKey;
    // Nooit verrijken vóór de cache uit IndexedDB geladen is: anders lijkt
    // alles 'ontbrekend' en halen we honderden films dubbel op.
    if (!key || enrich.running || !metaReady) return;
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
    const key = tmdbKey;
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
    } catch { /* kaart blijft op wat er al was */ }
  };

  // De gebruiker koos handmatig de juiste TMDB-film voor een watchlist-item.
  // We halen de volledige detail + scores op en wissen de mismatch-vlag —
  // geen giswerk meer, jouw keuze is leidend.
  const pickMatch = async (filmKey, tmdbId) => {
    const key = tmdbKey;
    if (!key) return;
    try {
      const d = await fetchDetailById(tmdbId, key);
      if (!d) return;
      delete d.yearMismatch; // handmatig bevestigd → geen twijfel meer
      d.handmatig = true; // en het festivaljaar-herstel blijft eraf
      let ext;
      for (const k of omdbKeys) {
        try { ext = await fetchExtRatings(d, { name: d.title, year: d.year }, k); if (ext) break; } catch { /* volgende sleutel */ }
      }
      const full = ext ? { ...d, ext } : d;
      setMeta((prev) => ({ ...prev, [filmKey]: full }));
    } catch { /* stil; oude data blijft staan */ }
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
      // eerst de opstart (verrijken, Voor jou) voor laten gaan
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

  const app = {
    settings, setSettings,
    watchlist: watchlist.filter((f) => !ignoredSet.has(f.key)),
    watchlistAll: watchlist,
    setWatchlist,
    watchedLb, setWatchedLb,
    watchedFilms, setWatchedFilms,
    omdbKeys,
    ratings: mergedRatings, setRatings, lbRatings: ratings,
    ratedFilms: mergedRatedFilms, setRatedFilms,
    ownRatings, setOwnRatings,
    kaartjesStand, geefKaartje, kaartjeDoorgeklikt, beantwoordAvond,
    diary, setDiary, lbLists, setLbLists,
    seen, seenSet, toggleSeen, markeerGezien, smaakModel, setSmaakModel,
    meta, setMeta,
    history, setHistory,
    shortlist, setShortlist,
    skipped, setSkipped,
    ignored, ignoredSet, ignoreFilm, unignoreFilm,
    smart, setSmart,
    demoMode, setDemoMode,
    resetLibrary,
    enrich, startEnrich, metaReady, tmdbKey, goSetup: () => setTab('instellingen'),
    taste, openSimilar: (film, m) => setSimilarSeed({ film, meta: m }),
    extEnrich, startExtEnrich,
    freshenProviders,
    ensureDetail,
    pickMatch,
    stopEnrich: () => { stopRef.current = true; },
  };

  const needsKey = watchlist.length > 0 && !tmdbKey;

  if (avondCode) return <RemoteVote code={avondCode} />;
  if (samenCode) return <SamenGast code={samenCode} />;

  return (
    <>
    {similarSeed && (
      <SimilarOverlay seed={similarSeed.film} seedMeta={similarSeed.meta || meta[similarSeed.film.key] || {}}
        app={app} onClose={() => setSimilarSeed(null)} />
    )}
    <Shell tab={tab} setTab={setTab}>
      {storageBroken && (
        <div className="notice warn" role="alert" style={{ marginBottom: 18 }}>
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
          <div style={{ flex: 1, minWidth: 240 }}>
            <ScoresPreview />
            <span>{tr('app.omdbNudge')}<a href="#setup" onClick={(e) => { e.preventDefault(); setTab('instellingen'); }}>{tr('app.omdbNudgeLink')}</a>.</span>
          </div>
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
          <div className="progressbar"><div style={{ width: `${(extEnrich.done / Math.max(extEnrich.total, 1)) * 100}%` }} /></div>
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
    </>
  );
}
