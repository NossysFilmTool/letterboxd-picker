import { useMemo, useState } from 'react';
import { useRef, useEffect } from 'react';
import { Plus, X, Download, Copy, Clapperboard, Star, RotateCcw, ArrowLeft, Sparkles } from 'lucide-react';
import { IMG, GENRES, genreLabelById, fetchDetailById, searchPersons, personFilms, fetchSimilar, discoverGems, discoverByKeywords } from '../lib/tmdb.js';
import { useLS } from '../lib/storage.js';
import { buildTaste, matchScore } from '../lib/taste.js';
import { fetchExtRatings } from '../lib/omdb.js';
import { shortlistToCsv, downloadText } from '../lib/csv.js';
import { useT } from '../lib/i18n.js';
import { filmKey } from '../lib/storage.js';
import Zoekmachine from './Zoekmachine.jsx';
import Winner from '../components/Winner.jsx';
import { lbLink, jwLink } from '../lib/links.js';
import ImdbA from '../components/ImdbA.jsx';

// Aanbevelingen buiten je watchlist, op basis van je hoogst gewaardeerde films.
// Zonder ratings.csv: op basis van je watchlist zelf.
export default function Verken({ app }) {
  const { t: tr, lang } = useT();
  const { watchlist, meta, setMeta, ratings, ratedFilms, watchedLb, shortlist, setShortlist, skipped, setSkipped, settings, startEnrich, enrich, tmdbKey, seenSet } = app;
  // Mengmotor-instroom: oeuvres van je favoriete regisseurs (blijvend gecachet),
  // profiel-discover (per sessie) en similar-lijsten (in meta gecachet)
  const [oeuvres, setOeuvres] = useLS('oeuvres', {});
  const [profielCands, setProfielCands] = useState([]);
  const [themeCands, setThemeCands] = useState([]);
  const [themeHunt, setThemeHunt] = useState(false);
  const [huntBusy, setHuntBusy] = useState(false);
  const [profielPage, setProfielPage] = useState(1);
  const [versLaden, setVersLaden] = useState(false);
  const [blendBusy, setBlendBusy] = useState(false);
  const blendRan = useRef(false);

  // Live uit TMDB tappen: elke klik haalt 3 verse discover-pagina's op je
  // profiel op en giet ze in de mengmotor — de pool raakt nooit meer op
  const laadVers = async () => {
    const key = tmdbKey;
    if (!key || versLaden) return;
    setVersLaden(true);
    try {
      const topG = Object.entries(taste.genres).filter(([, v]) => v > 0.3).sort((a, b) => b[1] - a[1]).slice(0, 2)
        .map(([en]) => GENRES.find((g) => g.en === en)?.id).filter(Boolean);
      const nieuwePage = profielPage + 1;
      const basis = { minScore: 6.9, minVotes: 200, maxVotes: 80000, minRuntime: 60, sortBy: 'vote_average.desc' };
      const queries = [
        { ...basis, genreIds: topG, page: nieuwePage },
        { ...basis, genreIds: topG.slice(0, 1), lang: taste.nietEngels >= 0.35 ? 'niet-en' : 'alle', page: nieuwePage },
        { ...basis, genreIds: [], page: nieuwePage },
      ];
      const batches = await Promise.all(queries.map((q) => discoverGems(key, q).catch(() => ({ results: [] }))));
      setProfielCands((prev) => {
        const gezien = new Set(prev.map((r) => r.id));
        const extra = [];
        batches.forEach((b) => b.results.forEach((r) => { if (!gezien.has(r.id)) { gezien.add(r.id); extra.push(r); } }));
        return [...prev, ...extra];
      });
      setProfielPage(nieuwePage);
    } catch { /* volgende klik probeert opnieuw */ }
    setVersLaden(false);
  };
  const [shown, setShown] = useState(12);
  const [showSkipped, setShowSkipped] = useState(false);
  const [nudge, setNudge] = useState(null);
  useEffect(() => {
    if (!nudge) return undefined;
    const t = setTimeout(() => setNudge(null), 3500);
    return () => clearTimeout(t);
  }, [nudge]);
  const [mode, setMode] = useState('zoeken'); // zoeken | voorJou
  const [openFilm, setOpenFilm] = useState(null); // { light, detail? }
  const detailCache = useRef(new Map());
  const [sortRecs, setSortRecs] = useState('match'); // match | aanbevolen | score | nieuw | oud
  const [rowsView, setRowsView] = useState(true); // rijen-met-reden vs één vlakke lijst

  // Detailkaart voor elke film van buiten je lijst: volledige TMDB-data
  // (backdrop, regisseur, trailer, streamingaanbod) + on-demand OMDb-scores
  const openDetail = async (r) => {
    setOpenFilm({ light: r, detail: detailCache.current.get(r.id) || null });
    if (detailCache.current.has(r.id) || !app.tmdbKey) return;
    try {
      const d = await fetchDetailById(r.id, app.tmdbKey);
      let ext;
      // Probeer alle sleutels tot er één scores geeft (daglimiet/rotatie)
      for (const k of (app.omdbKeys || [])) {
        try { ext = await fetchExtRatings(d, { name: d.title, year: d.year }, k); if (ext) break; }
        catch { /* volgende sleutel */ }
      }
      const full = ext ? { ...d, ext } : d;
      detailCache.current.set(r.id, full);
      setOpenFilm((o) => (o && o.light.id === r.id ? { ...o, detail: full } : o));
    } catch { /* kaart blijft op lichte data */ }
  };

  const taste = useMemo(
    () => buildTaste({ watchlist, ratedFilms, meta, shortlist, skipped }),
    [watchlist, ratedFilms, meta, shortlist, skipped],
  );

  // Seeds met gewicht: films die jij 4+ gaf (5★ duwt harder dan 4★)
  const seeds = useMemo(() => {
    const uit = new Map();
    watchlist.forEach((f) => {
      const r = ratings[f.key];
      if (r >= 4 && meta[f.key]) uit.set(f.key, { ...f, rating: r });
    });
    ratedFilms.forEach((f) => {
      if (f.rating >= 4 && meta[f.key] && !uit.has(f.key)) uit.set(f.key, f);
    });
    return [...uit.values()].sort((a, b) => b.rating - a.rating);
  }, [watchlist, ratedFilms, ratings, meta]);

  // De mengmotor vult de instroom bij: één keer per sessie, alles gecachet
  useEffect(() => {
    const key = tmdbKey;
    // De mengmotor draait alleen voor 'Voor jou' — niet als je puur de
    // zoekmachine gebruikt. Zo blijft de Zoeken-tab instant.
    if (mode !== 'voorJou' || !key || blendRan.current || !seeds.length) return;
    blendRan.current = true;
    let stop = false;
    (async () => {
      setBlendBusy(true);
      // 0. Kijkgeschiedenis automatisch verdiepen: je best beoordeelde films
      // zonder filmdata worden seed, zonder dat je ergens op hoeft te klikken
      const histTodo = ratedFilms
        .filter((f) => f.rating >= 4 && !(f.key in meta))
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 40);
      if (histTodo.length) startEnrich(histTodo);
      // 1. Similar-lijsten voor je top-24 seeds (meta-cache; alleen wat ontbreekt)
      const simTodo = seeds.slice(0, 24).filter((s) => !meta[s.key]?.sims);
      for (const s of simTodo) {
        if (stop) break;
        try {
          const sims = await fetchSimilar(meta[s.key].id, key);
          setMeta((prev) => (prev[s.key] ? { ...prev, [s.key]: { ...prev[s.key], sims } } : prev));
        } catch { /* similar is bonus */ }
      }
      // 2. Oeuvres van regisseurs achter je 4,5+ films (LS-cache, max 12)
      const dirs = new Map();
      seeds.filter((s) => s.rating >= 4.5).forEach((s) => {
        const m = meta[s.key];
        if (m?.director && !dirs.has(m.director)) dirs.set(m.director, m.directorId || null);
      });
      for (const [naam, id] of [...dirs.entries()].slice(0, 12)) {
        if (stop) break;
        if (oeuvres[naam]) continue;
        try {
          let pid = id;
          if (!pid) {
            const ppl = await searchPersons(key, naam);
            pid = ppl.find((p) => p.dept === 'Directing')?.id || ppl[0]?.id;
          }
          if (!pid) continue;
          const films = (await personFilms(key, pid)).filter((f) => f.rol === 'regie');
          setOeuvres((prev) => ({ ...prev, [naam]: { films, at: Date.now() } }));
        } catch { /* oeuvre is bonus */ }
      }
      // 3. Profiel-discover: instroom die aan géén bestaande film hangt
      try {
        const topG = Object.entries(taste.genres).filter(([, v]) => v > 0.3).sort((a, b) => b[1] - a[1]).slice(0, 2)
          .map(([en]) => GENRES.find((g) => g.en === en)?.id).filter(Boolean);
        const topD = Object.entries(taste.decades).sort((a, b) => b[1] - a[1])[0]?.[0];
        const basis = { minScore: 7.0, minVotes: 300, maxVotes: 60000, minRuntime: 60, sortBy: 'vote_average.desc', page: 1 };
        const queries = [
          { ...basis, genreIds: topG, yearFrom: topD ? +topD : '', yearTo: topD ? +topD + 9 : '' },
          { ...basis, genreIds: topG.slice(0, 1), lang: taste.nietEngels >= 0.35 ? 'niet-en' : 'alle' },
          { ...basis, genreIds: topG, minVotes: 100, maxVotes: 5000 },
        ];
        const batches = await Promise.all(queries.map((q) => discoverGems(key, q).catch(() => ({ results: [] }))));
        const gezien = new Set();
        const cands = [];
        batches.forEach((b) => b.results.forEach((r) => { if (!gezien.has(r.id)) { gezien.add(r.id); cands.push(r); } }));
        if (!stop) setProfielCands(cands);
      } catch { /* profiel-instroom is bonus */ }
      setBlendBusy(false);
    })();
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seeds.length, tmdbKey, mode]);

  // Thema-jacht (optioneel): haalt films op die jouw top-thema's delen. Draait
  // alleen als je 'm aanzet, en opnieuw als je top-thema's wezenlijk wijzigen.
  useEffect(() => {
    const key = tmdbKey;
    if (!themeHunt || !key || mode !== 'voorJou') return undefined;
    const ids = (taste.topThemes || []).map((t) => t.id).slice(0, 5);
    if (!ids.length) return undefined;
    let stop = false;
    (async () => {
      setHuntBusy(true);
      try {
        const themeNamen = (taste.topThemes || []).slice(0, 5).map((t) => t.name);
        const [a, b] = await Promise.all([
          discoverByKeywords(key, ids, { minVotes: 40, page: 1 }),
          discoverByKeywords(key, ids, { minVotes: 40, page: 2 }).catch(() => ({ results: [] })),
        ]);
        // Merk elke treffer als 'via thema-jacht' met de thema's waarop gejaagd is,
        // zodat de kaart kan uitleggen wáárom het is aanbevolen.
        const merk = (r) => ({ ...r, viaTheme: themeNamen });
        if (!stop) setThemeCands([...a.results.map(merk), ...b.results.map(merk)]);
      } catch { /* thema-jacht is bonus */ }
      if (!stop) setHuntBusy(false);
    })();
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeHunt, tmdbKey, mode, (taste.topThemes || []).map((t) => t.id).join(',')]);

  const { recs, seededOnRatings, rijen } = useMemo(() => {
    const ownKeys = new Set([...watchlist.map((f) => f.key), ...seenSet, ...ratedFilms.map((f) => f.key)]);
    const ownIds = new Set(Object.values(meta).filter(Boolean).map((m) => m.id));
    const skippedSet = new Set(skipped.map((s) => (typeof s === 'object' ? s.id : s)));
    const shortIds = new Set(shortlist.map((s) => s.id));

    // Mengmotor: vier instroombronnen, elk met eigen gewicht en bronlabel.
    // 5★-seeds duwen hun kandidaten harder omhoog dan 4★'s.
    let gewogenSeeds = seeds;
    const onRatings = gewogenSeeds.length >= 3;
    if (!onRatings) gewogenSeeds = watchlist.filter((f) => meta[f.key]?.recs?.length).map((f) => ({ ...f, rating: 3.5 }));

    const agg = new Map();
    const voegToe = (r, waarde, bron, seedNaam) => {
      if (r.votes != null && r.votes < 20) return; // te weinig stemmen om iets over te zeggen (TMDB-schaal)
      if (ownIds.has(r.id) || shortIds.has(r.id) || skippedSet.has(r.id)) return;
      if (ownKeys.has(filmKey(r.title, r.year))) return;
      const cur = agg.get(r.id) || { ...r, count: 0, waarde: 0, seeds: [], bronnen: [] };
      cur.count++;
      cur.waarde += waarde;
      if (seedNaam && cur.seeds.length < 3 && !cur.seeds.includes(seedNaam)) cur.seeds.push(seedNaam);
      if (!cur.bronnen.includes(bron)) cur.bronnen.push(bron);
      // vollediger data wint (similar/discover dragen soms meer velden dan recs)
      if (!cur.genre_ids?.length && r.genre_ids?.length) cur.genre_ids = r.genre_ids;
      agg.set(r.id, cur);
    };

    gewogenSeeds.forEach((seed) => {
      const w = (seed.rating || 3.5) - 3; // 4★ = 1, 5★ = 2
      meta[seed.key]?.recs?.forEach((r) => voegToe(r, 1 + w, 'aanbevolen', seed.name));
      meta[seed.key]?.sims?.forEach((r) => voegToe(r, 0.8 + w * 0.8, 'vergelijkbaar', seed.name));
    });
    Object.entries(oeuvres).forEach(([naam, o]) => {
      o.films?.forEach((r) => voegToe(r, 1.6, `oeuvre:${naam}`, null));
    });
    profielCands.forEach((r) => voegToe(r, 0.7, 'profiel', null));
    themeCands.forEach((r) => voegToe(r, 0.85, 'thema', null));

    const tasteNow = buildTaste({ watchlist, ratedFilms, meta, shortlist, skipped });
    const list = [...agg.values()].map((r) => {
      const m = matchScore(r, tasteNow);
      let redenen = m.redenen;
      // Thema-jacht: als deze film via je thema's is gevonden en de score zelf
      // nog geen thema-reden gaf (light-object zonder keywords), leg het alsnog uit.
      if (r.viaTheme?.length && !redenen.some((x) => /thema/i.test(x))) {
        redenen = [tr('verken.foundOnThemes', { themes: r.viaTheme.slice(0, 3).join(', ') }), ...redenen];
      }
      return { ...r, match: m.score, redenen };
    });

    // Rijen-met-reden: dezelfde kandidaten, gegroepeerd op waaróm ze er zijn.
    // Volgorde: eerst per-regisseur (oeuvres), dan gedeelde thema's, dan
    // "omdat je X hoog gaf" (sterkste seeds), dan een profiel-restrij. Elke
    // film verschijnt in hooguit één rij (de eerst passende), zodat rijen niet
    // dezelfde posters herhalen. Films zonder duidelijke reden vallen terug in
    // de vlakke lijst (die de "alles"-weergave en het filteren blijft voeden).
    const opMatch = (a, b) => b.match - a.match;
    const rijen = [];
    const gebruikt = new Set();
    const neem = (films, min = 4) => {
      const vers = films.filter((r) => !gebruikt.has(r.id)).sort(opMatch);
      if (vers.length < min) return null;
      vers.slice(0, 18).forEach((r) => gebruikt.add(r.id));
      return vers.slice(0, 18);
    };

    // 1. Per regisseur: "Meer van {naam}"
    Object.keys(oeuvres).forEach((naam) => {
      const films = list.filter((r) => r.bronnen.includes(`oeuvre:${naam}`));
      const rij = neem(films);
      if (rij) rijen.push({ id: `oeuvre:${naam}`, type: 'oeuvre', naam, films: rij });
    });
    // 2. Gedeelde thema's
    const themaFilms = list.filter((r) => r.bronnen.includes('thema') || r.viaTheme?.length);
    const themaRij = neem(themaFilms);
    if (themaRij) {
      const topThemas = [...new Set(themaFilms.flatMap((r) => r.viaTheme || []))].slice(0, 3);
      rijen.push({ id: 'thema', type: 'thema', themas: topThemas, films: themaRij });
    }
    // 3. Omdat je een specifieke film hoog gaf (sterkste seeds eerst)
    const seedNamen = [...gewogenSeeds].filter((s) => (s.rating || 0) >= 4.5).slice(0, 4);
    seedNamen.forEach((seed) => {
      const films = list.filter((r) => r.seeds.includes(seed.name));
      const rij = neem(films);
      if (rij) rijen.push({ id: `seed:${seed.key}`, type: 'seed', naam: seed.name, films: rij });
    });
    // 4. Profiel-restrij: obscure/passende parels die nog niet in een rij staan
    const restRij = neem(list.filter((r) => !gebruikt.has(r.id)), 6);
    if (restRij) rijen.push({ id: 'profiel', type: 'profiel', films: restRij });

    return { recs: list, seededOnRatings: onRatings, rijen };
  }, [watchlist, meta, ratings, ratedFilms, seenSet, shortlist, skipped, seeds, oeuvres, profielCands, themeCands, lang]);

  const genreNaam = (ids) => (ids || []).map((id) => genreLabelById(id)).filter(Boolean)[0];
  const addToShortlist = (r) => {
    setShortlist((s) => [...s, { id: r.id, title: r.title, year: r.year, poster: r.poster, vote: r.vote, seeds: r.seeds, genre_ids: r.genre_ids || [] }]);
    const g = genreNaam(r.genre_ids);
    if (g) setNudge(tr('verken.nudgeMore', { genre: g }));
  };
  const skip = (r) => {
    setSkipped((s) => [...s, { id: r.id, title: r.title, year: r.year, genre_ids: r.genre_ids || [] }]);
    const g = genreNaam(r.genre_ids);
    if (g) setNudge(tr('verken.nudgeLess', { genre: g }));
  };
  const unskip = (id) => setSkipped((s) => s.filter((x) => (typeof x === 'object' ? x.id : x) !== id));
  const removeShort = (id) => setShortlist((s) => s.filter((x) => x.id !== id));

  // Kijkgeschiedenis verdiepen: haal filmdata op voor je best beoordeelde
  // gezien-films die nog geen meta hebben (max 40 per keer, API-vriendelijk)
  const historyCandidates = useMemo(
    () => ratedFilms
      .filter((f) => f.rating >= 4 && !(f.key in meta))
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 40),
    [ratedFilms, meta],
  );
  const skippedObjects = skipped.filter((s) => typeof s === 'object');
  // Het smaakprofiel: één keer berekend, overal in Verken toegepast

  // Gedeelde client-side filters voor aanbevelingen, zoek- en makerresultaten
  // 'Voor jou' toont het volledige persoonlijke aanbod; filteren gebeurt in de Zoeken-tab (server-side)
  const applyLightFilters = (list) => list;
  const ownIdsAll = useMemo(() => new Set(Object.values(meta).filter(Boolean).map((m) => m.id)), [meta]);
  const ownKeysAll = useMemo(
    () => new Set([...watchlist.map((f) => f.key), ...seenSet, ...ratedFilms.map((f) => f.key)]),
    [watchlist, seenSet, ratedFilms],
  );
  // Gezien-status apart: op key én op TMDB-id (vangt titelverschillen tussen
  // Letterboxd en TMDB zodra de film in de cache zit).
  const seenIds = useMemo(
    () => new Set([...seenSet].map((k) => meta[k]?.id).filter(Boolean)),
    [seenSet, meta],
  );
  const shortIds = useMemo(() => new Set(shortlist.map((s) => s.id)), [shortlist]);
  const skippedSet = useMemo(() => new Set(skipped.map((s) => (typeof s === 'object' ? s.id : s))), [skipped]);

  const copyList = async () => {
    const text = shortlist.map((s) => `${s.title} (${s.year || '?'})`).join('\n');
    try { await navigator.clipboard.writeText(text); alert(tr('verken.shortlistCopied')); }
    catch { alert(text); }
  };

  // De zoekmachine draait op een TMDB-sleutel alleen — geen verrijkte bieb nodig.
  // Alleen als er écht niets is (geen sleutel én geen data) tonen we de uitleg.
  if (!tmdbKey && !Object.keys(meta).length) {
    return (
      <div>
        <h1 className="page-title">{tr('verken.title')}</h1>
        <p className="page-sub" style={{ marginBottom: 20 }}>{tr('verken.needKeySub')}</p>
        <div className="empty card">
          <p className="big">{tr('verken.needKeyTitle')}</p>
          <p>{tr('verken.needKeyBody')}</p>
        </div>
      </div>
    );
  }

  // Detail-overlay: we unmounten de rest NIET (dat zou de zoekresultaten en
  // filters van de Zoekmachine wissen). We tonen de kaart erboven en verbergen
  // de rest met display:none, zodat alle state bewaard blijft.
  const detailOverlay = openFilm ? (() => {
    const { light, detail } = openFilm;
    const m = detail || { poster: light.poster, vote: light.vote, votes: light.votes, plot: light.plot };
    const inShort = shortIds.has(light.id);
    return (
      <div>
        <button className="btn ghost" style={{ marginBottom: 14 }} onClick={() => setOpenFilm(null)}>
          <ArrowLeft size={15} /> Terug naar Verken
        </button>
        <Winner
          film={{ key: `tmdb:${light.id}`, name: light.title, year: light.year, uri: '' }}
          meta={m} context={detail ? tr('verken.fromOutside') : tr('verken.detailsLoading')}
          onShortlist={() => addToShortlist({ ...light, seeds: [], count: 0 })} inShortlist={inShort}
          onSimilar={() => app.openSimilar({ key: `tmdb:${light.id}`, name: light.title, year: light.year }, { id: light.id, genres: (light.genre_ids || []).map(genreLabelById), lang: light.lang, keywords: detail?.keywords || [] })}
            onWantScores={!app.omdbKeys.length ? app.goSetup : undefined}
        />
      </div>
    );
  })() : null;

  return (
    <div>
      {detailOverlay}
      <div style={openFilm ? { display: 'none' } : undefined}>
      <div className="toprow">
        <div>
          <h1 className="page-title">{tr('verken.title')}</h1>
          <p className="page-sub">
            {mode === 'zoeken'
              ? tr('verken.searchSub')
              : tr('verken.forYouSub', { ratings: seededOnRatings ? tr('verken.basedOnRatings') : '', count: recs.length })}
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button className={`chip ${mode === 'zoeken' ? 'on-b' : ''}`} onClick={() => setMode('zoeken')}>{tr('verken.tabSearch')}</button>
        <button className={`chip ${mode === 'voorJou' ? 'on-b' : ''}`} onClick={() => setMode('voorJou')}>{tr('verken.tabForYou')}</button>
      </div>

      {mode === 'zoeken' && (
        <Zoekmachine
          app={app} taste={taste} openDetail={openDetail}
          addToShortlist={addToShortlist} shortIds={shortIds}
          ownIdsAll={ownIdsAll} ownKeysAll={ownKeysAll} seenIds={seenIds}
        />
      )}

      {nudge && (
        <div className="notice" style={{ marginBottom: 14, borderColor: 'rgba(255,128,0,0.35)', color: 'var(--fog)' }}>
          {nudge}
        </div>
      )}

      {mode === 'voorJou' && (blendBusy ? (
        <p style={{ color: 'var(--fog-dim)', fontSize: 12.5, marginBottom: 14 }}>
          {tr('verken.blending')}
        </p>
      ) : (Object.keys(oeuvres).length > 0 || profielCands.length > 0) && (
        <p style={{ color: 'var(--fog-dim)', fontSize: 12.5, marginBottom: 14 }}>
          {tr('verken.inflow', { oeuvres: Object.keys(oeuvres).length, theme: themeCands.length ? tr('verken.inflowTheme', { count: themeCands.length }) : '', count: recs.length })}
        </p>
      ))}

      {mode === 'voorJou' && (taste.topThemes?.length > 0) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          <button className={`chip ${themeHunt ? 'on-o' : ''}`} onClick={() => setThemeHunt((v) => !v)} title={tr('verken.huntTitle')}>
            {huntBusy ? tr('verken.hunting') : themeHunt ? tr('verken.huntThemesActive') : tr('verken.huntThemes')}
          </button>
          <span style={{ fontSize: 12.5, color: 'var(--fog-dim)' }}>
            Je thema's: {taste.topThemes.slice(0, 4).map((t) => t.name).join(', ')}
          </span>
        </div>
      )}


      {shortlist.length > 0 && (
        <div className="card" style={{ marginBottom: 20, borderColor: 'rgba(64,188,244,0.35)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <p className="label" style={{ color: 'var(--dot-b)' }}>Shortlist ({shortlist.length})</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={copyList}><Copy size={14} /> {tr('zoek.copyBtn')}</button>
              <button className="btn" onClick={() => downloadText('letterboxd-import.csv', shortlistToCsv(shortlist))}>
                <Download size={14} /> {tr('zoek.exportLbBtn')}
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            {shortlist.map((s) => (
              <span key={s.id} className="chip on-b">
                {s.title} ({s.year || '?'})
                <button onClick={() => removeShort(s.id)} aria-label={tr('verken.removeShortAria', { title: s.title })} style={{ background: 'none', border: 'none', color: 'inherit', padding: 0, display: 'inline-flex' }}>
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
          <p style={{ color: 'var(--fog-dim)', fontSize: 12.5, marginTop: 10 }}>
            {tr('zoek.lbImportHint')}
          </p>
        </div>
      )}

      {mode === 'voorJou' && (!recs.length ? (
        <div className="empty card">
          <p className="big">{tr('verken.forNowEmpty')}</p>
          <p>{tr('verken.allRatedEmpty')}</p>
          {tmdbKey && (
            <button className="btn primary" style={{ marginTop: 14 }} onClick={laadVers} disabled={versLaden}>
              {versLaden ? tr('verken.tapping') : tr('verken.loadFresh')}
            </button>
          )}
        </div>
      ) : (() => {
        const gefilterd = applyLightFilters(recs);
        const gesorteerd = [...gefilterd].sort((a, b) => {
          if (sortRecs === 'aanbevolen') return b.waarde - a.waarde || b.match - a.match;
          if (sortRecs === 'score') return (b.vote || 0) - (a.vote || 0);
          if (sortRecs === 'nieuw') return (b.year || 0) - (a.year || 0);
          if (sortRecs === 'oud') return (a.year || 9999) - (b.year || 9999);
          return b.match - a.match; // standaard: jouw match
        });
        return (
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {rijen.length >= 1 && sortRecs === 'match' ? (
              <button className="btn ghost" style={{ fontSize: 12.5 }} onClick={() => setRowsView((v) => !v)}>
                {rowsView ? tr('verken.rowsToggleAll') : tr('verken.rowsToggleRows')}
              </button>
            ) : <span />}
            <select className="field" style={{ width: 'auto' }} value={sortRecs} onChange={(e) => setSortRecs(e.target.value)} aria-label="Sorteer aanbevelingen">
              <option value="match">{tr('sort.bestMatch')}</option>
              <option value="aanbevolen">{tr('verken.strongestRec')}</option>
              <option value="score">{tr('sort.highestScore')}</option>
              <option value="nieuw">{tr('sort.newest')}</option>
              <option value="oud">{tr('sort.oldest')}</option>
            </select>
          </div>

          {rowsView && sortRecs === 'match' && rijen.length >= 1 ? (
            <div className="rec-rows">
              {rijen.map((rij) => (
                <section key={rij.id}>
                  <div className="rec-row-head">
                    <h3>
                      {rij.type === 'oeuvre' && tr('verken.rowOeuvre', { name: rij.naam })}
                      {rij.type === 'thema' && (rij.themas?.length ? tr('verken.rowTheme', { themes: rij.themas.join(', ') }) : tr('verken.rowThemePlain'))}
                      {rij.type === 'seed' && tr('verken.rowSeed', { name: rij.naam })}
                      {rij.type === 'profiel' && tr('verken.rowProfile')}
                    </h3>
                    <span className="cnt">{rij.films.length}</span>
                  </div>
                  <div className="rec-strip">
                    {rij.films.map((r, i) => (
                      <button key={r.id} className="rec-tile" style={{ '--i': Math.min(i, 12) }} onClick={() => openDetail(r)} aria-label={tr('common.openAria', { title: r.title })}>
                        <div className="poster">
                          {r.poster ? <img src={IMG(r.poster, 'w342')} alt={tr('common.posterAlt', { name: r.title })} loading="lazy" /> : <Clapperboard size={20} strokeWidth={1.4} aria-hidden="true" />}
                        </div>
                        <span className="t">{r.title}</span>
                        <span className="yr">{r.year || '—'}{taste.sterk && r.match != null ? <span className="mt"> · {r.match}%</span> : null}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (<>
          {gesorteerd.slice(0, shown).map((r, i) => (
            <div key={r.id} className="card rec rise-in" style={{ '--i': Math.min(i, 16) }}>
              <button className="rposter" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }} onClick={() => openDetail(r)} aria-label={tr('common.openAria', { title: r.title })}>
                <div className="poster">
                  {r.poster ? <img src={IMG(r.poster, 'w342')} alt={tr('common.posterAlt', { name: r.title })} loading="lazy" /> : <Clapperboard size={22} strokeWidth={1.4} aria-hidden="true" />}
                </div>
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <button style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', color: 'var(--paper)' }} onClick={() => openDetail(r)}>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 400 }}>{r.title}</h2>
                </button>
                <p style={{ color: 'var(--fog)', fontSize: 13.5, marginTop: 2 }}>
                  {r.year || 'jaar onbekend'}
                  {r.vote ? <> · <Star size={12} style={{ verticalAlign: -1, color: 'var(--dot-o)' }} /> {String(r.vote).replace('.', ',')}{r.votes != null ? <span style={{ color: 'var(--fog-dim)' }}> ({r.votes >= 1000 ? `${Math.round(r.votes / 1000)}k` : r.votes} stemmen)</span> : null}</> : null}
                  {taste.sterk && <span className="chip on-b" style={{ marginLeft: 8, padding: '2px 8px', fontSize: 11 }}>{r.match}% match</span>}
                </p>
                <p className="why">
                  {(() => {
                    const oeuvreBron = r.bronnen.find((b) => b.startsWith('oeuvre:'));
                    if (oeuvreBron) return tr('verken.fromOeuvre', { name: oeuvreBron.slice(7) });
                    if (r.seeds.length) return `${r.bronnen.includes('vergelijkbaar') && !r.bronnen.includes('aanbevolen') ? tr('verken.likeThis') : tr('verken.becauseYou')} ${r.seeds.slice(0, 2).join(tr('verken.and'))}${r.seeds.length > 2 ? tr('verken.andOthers', { count: r.seeds.length - 2 }) : ''}${r.bronnen.includes('aanbevolen') ? (seededOnRatings ? tr('verken.ratedHigh') : tr('verken.onYourList')) : ''}`;
                    if (r.viaTheme?.length) return tr('verken.foundOnThemes', { themes: r.viaTheme.slice(0, 3).join(', ') });
                    return tr('verken.viaProfile');
                  })()}
                  {r.bronnen.length > 1 ? tr('verken.viaRoutes', { count: r.bronnen.length }) : ''}
                  {(() => {
                    // toon de match-redenen, maar niet de thema-reden die we hierboven al als hoofdregel gaven
                    const themeReason = r.viaTheme?.length ? tr('verken.foundOnThemes', { themes: r.viaTheme.slice(0, 3).join(', ') }) : null;
                    const extra = (r.redenen || []).filter((x) => x !== themeReason);
                    return extra.length ? ` · ${extra.slice(0, 2).join(' · ')}` : '';
                  })()}
                </p>
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button className="btn green" onClick={() => addToShortlist(r)}><Plus size={14} /> {tr('common.shortlist')}</button>
                  <button className="btn ghost" onClick={() => skip(r)}><X size={14} /> {tr('verken.notForMe')}</button>
                  <button className="btn ghost" onClick={() => app.openSimilar({ key: `tmdb:${r.id}`, name: r.title, year: r.year }, { id: r.id, genres: (r.genre_ids || []).map(genreLabelById), lang: r.lang, keywords: detailCache.current.get(r.id)?.keywords || [] })}><Sparkles size={14} /> {tr('winner.moreLikeThis')}</button>
                  <span style={{ display: 'inline-flex', gap: 12, marginLeft: 4, fontSize: 12.5 }}>
                    <a href={lbLink({ name: r.title }, r.id)} target="_blank" rel="noreferrer">Letterboxd</a>
                    <ImdbA meta={detailCache.current.get(r.id)} tmdbId={r.id} tmdbKey={tmdbKey} film={{ name: r.title, year: r.year }} />
                    <a href={jwLink(detailCache.current.get(r.id), { name: r.title })} target="_blank" rel="noreferrer">JustWatch</a>
                  </span>
                </div>
              </div>
            </div>
          ))}
          {gesorteerd.length > shown && (
            <button className="btn" style={{ justifyContent: 'center' }} onClick={() => setShown(shown + 12)}>{tr('verken.showMore', { count: gesorteerd.length - shown })}</button>
          )}
          {tmdbKey && gesorteerd.length - shown < 12 && (
            <button className="btn" style={{ justifyContent: 'center' }} onClick={laadVers} disabled={versLaden}>
              {versLaden ? tr('verken.tappingTmdb') : tr('verken.loadFreshMore')}
            </button>
          )}
          </>)}
        </div>
        );
      })())}

      {skippedObjects.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <button className="btn ghost" onClick={() => setShowSkipped(!showSkipped)} aria-expanded={showSkipped}>
            <X size={14} /> {tr('verken.rejected', { count: skippedObjects.length, action: showSkipped ? tr('verken.rejHide') : tr('verken.rejShow') })}
          </button>
          {showSkipped && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              {skippedObjects.map((s) => (
                <span key={s.id} className="chip">
                  {s.title} ({s.year || '?'})
                  <button onClick={() => unskip(s.id)} aria-label={tr('verken.restore', { title: s.title })} title={tr('verken.restoreTitle')} style={{ background: 'none', border: 'none', color: 'var(--dot-g)', padding: 0, display: 'inline-flex' }}>
                    <RotateCcw size={13} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
    </div>
  );
}
