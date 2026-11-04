import { useMemo, useState } from 'react';
import { useRef, useEffect } from 'react';
import { Plus, X, Download, Copy, Clapperboard, Star, RotateCcw, ArrowLeft, Sparkles } from 'lucide-react';
import { IMG, GENRES, genreLabelById, fetchDetailById, searchPersons, personFilms, fetchSimilar, fetchRecommendations, discoverGems, discoverByKeywords } from '../lib/tmdb.js';
import { useLS } from '../lib/storage.js';
import { buildTaste, matchScore } from '../lib/taste.js';
import { MOODS, applyMoods, filterMoods } from '../lib/moods.js';
import { vensterVan, voegNieuweToe, plekGewicht, rangschikRegisseurs, pastInOeuvre, bouwRijen } from '../lib/rows.js';
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
  const { watchlist, meta, setMeta, ratings, ratedFilms, shortlist, setShortlist, skipped, setSkipped, startEnrich, enrich, metaReady, tmdbKey, seenSet } = app;
  // Mengmotor-instroom: oeuvres van je favoriete regisseurs (gecachet met een
  // houdbaarheid), profiel-discover (per sessie) en similar-lijsten (in meta)
  const [oeuvres, setOeuvres] = useLS('oeuvres', {});
  const [profielCands, setProfielCands] = useState([]);
  const [themeCands, setThemeCands] = useState([]);
  const [profielPage, setProfielPage] = useState(1);
  const [versLaden, setVersLaden] = useState(false);
  const [blendBusy, setBlendBusy] = useState(false);
  // Bijhouden wat de motor deze sessie al geprobeerd heeft, zodat hij na elke
  // ronde kan kijken of er nieuw werk is zonder mislukte calls eindeloos te herhalen.
  const blendRunning = useRef(false);
  const [blendTick, setBlendTick] = useState(0);
  const histTried = useRef(new Set());
  const simTried = useRef(new Set());
  const dirTried = useRef(new Set());
  const profielGeladen = useRef(false);
  const themaGeladen = useRef(''); // signatuur van de top-thema's waarop al gejaagd is
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

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
      // Verse films binnengehaald: schuif ALLE rijen tegelijk door (ook rijen
      // die nog nooit aangeraakt zijn), zodat het overzicht echt verandert.
      setVerseShift((s) => s + 12);
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
  const [moods, setMoods] = useState([]); // actieve stemmingen
  const [focusGenre, setFocusGenre] = useState(''); // optioneel genre om op te focussen
  const toggleMood = (id) => setMoods((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  // Per rij: hoeveel films we al "weggeschoven" hebben (venster van 12; de
  // wrap-around zit in vensterVan). verseShift schuift ALLE rijen tegelijk
  // (de "Vers uit TMDB"-knop), dismissed verbergt omgewisselde rijen, en
  // rowBusy toont per rij of er nieuwe films onderweg zijn.
  const [rowOffsets, setRowOffsets] = useState({});
  const [verseShift, setVerseShift] = useState(0);
  const [dismissed, setDismissed] = useState([]);
  const [rowBusy, setRowBusy] = useState({});
  const [receptOpen, setReceptOpen] = useState(null); // film-id waarvan het score-recept uitgeklapt is
  const [themaPage, setThemaPage] = useState(2); // pagina 1-2 laadt de instroom al
  const schuifRij = (rijId) => setRowOffsets((o) => ({ ...o, [rijId]: (o[rijId] || 0) + 12 }));

  // "Andere films": schuif de rij door en haal er waar mogelijk écht nieuwe
  // films bij. Seeds kunnen dieper in similar/recommendations (volgende
  // pagina's), thema's dieper in discover; een oeuvre is eindig, dus daar
  // is doorschuiven alles wat er is.
  const haalMeerVoorRij = async (rij) => {
    if (rowBusy[rij.id]) return;
    setRowBusy((b) => ({ ...b, [rij.id]: true }));
    try {
      if (rij.type === 'seed' && tmdbKey) {
        const seedKey = rij.id.slice(5);
        const m = meta[seedKey];
        if (m?.id) {
          const page = (m.dieptePage || 1) + 1;
          const [sims2, recs2] = await Promise.all([
            fetchSimilar(m.id, tmdbKey, page).catch(() => []),
            fetchRecommendations(m.id, tmdbKey, page).catch(() => []),
          ]);
          setMeta((prev) => ({
            ...prev,
            [seedKey]: {
              ...prev[seedKey],
              sims: voegNieuweToe(prev[seedKey]?.sims || [], sims2),
              recs: voegNieuweToe(prev[seedKey]?.recs || [], recs2),
              dieptePage: page,
            },
          }));
        }
      } else if (rij.type === 'thema' && tmdbKey) {
        const kwIds = (taste.topThemes || []).map((t) => t.id);
        if (kwIds.length) {
          const page = themaPage + 1;
          const d = await discoverByKeywords(tmdbKey, kwIds, { minVotes: 40, page }).catch(() => ({ results: [] }));
          const merk = (r) => ({ ...r, viaTheme: (taste.topThemes || []).slice(0, 3).map((t) => t.name) });
          setThemeCands((prev) => voegNieuweToe(prev, (d.results || []).map(merk)));
          setThemaPage(page);
        }
      } else if (rij.type === 'profiel') {
        await laadVers();
      }
    } finally {
      setRowBusy((b) => ({ ...b, [rij.id]: false }));
      schuifRij(rij.id);
    }
  };

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

  // Kijkgeschiedenis verdiepen: je best beoordeelde films zonder filmdata
  // worden seed. Dit draait los van de mengmotor: die heeft seeds nodig om te
  // starten, dus binnen de motor kreeg een nieuwe gebruiker (ratings alleen
  // buiten de watchlist) nooit seeds. We wachten tot een lopende verrijking
  // klaar is, want startEnrich negeert een aanroep tijdens een andere run.
  const HIST_PER_SESSIE = 60;
  const historyCandidates = useMemo(
    () => ratedFilms
      .filter((f) => f.rating >= 4 && !(f.key in meta))
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 40),
    [ratedFilms, meta],
  );
  useEffect(() => {
    if (mode !== 'voorJou' || !tmdbKey || !metaReady || enrich.running) return;
    const ruimte = HIST_PER_SESSIE - histTried.current.size;
    const todo = historyCandidates.filter((f) => !histTried.current.has(f.key)).slice(0, Math.max(0, ruimte));
    if (!todo.length) return;
    todo.forEach((f) => histTried.current.add(f.key));
    startEnrich(todo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, tmdbKey, metaReady, enrich.running, historyCandidates]);

  // Regisseurs achter je favorieten, sterkste eerst (bron voor "Meer van X")
  const regisseurs = useMemo(() => rangschikRegisseurs(seeds, meta), [seeds, meta]);

  // De mengmotor vult de instroom bij, in rondes. Elke ronde doet alleen wat
  // nog ontbreekt; na afloop kijkt hij opnieuw (blendTick), want ondertussen
  // kunnen er via de kijkgeschiedenis nieuwe seeds en regisseurs bijgekomen
  // zijn. Voorheen brak hij af zodra het aantal seeds veranderde (wat hij zelf
  // veroorzaakte) en draaide hij die sessie nooit meer: geen oeuvres, geen
  // profiel-instroom. Alleen bij unmount stoppen we nog.
  const OEUVRE_TTL = 30 * 24 * 3600e3;
  const seedSig = seeds.slice(0, 24).map((s) => s.key).join('|');
  const dirSig = regisseurs.map((r) => r.naam).join('|');
  useEffect(() => {
    const key = tmdbKey;
    // Alleen voor 'Voor jou', zodat de Zoeken-tab instant blijft.
    if (mode !== 'voorJou' || !key || !seeds.length || blendRunning.current) return;
    const simTodo = seeds.slice(0, 24).filter((s) => meta[s.key]?.id && !meta[s.key].sims && !simTried.current.has(s.key));
    const dirTodo = regisseurs.filter((r) => {
      const o = oeuvres[r.naam];
      const vers = o && Date.now() - (o.at || 0) < OEUVRE_TTL;
      return !vers && !dirTried.current.has(r.naam);
    });
    // Profiel-discover pas als er niets meer verrijkt wordt: dan staat je
    // smaakprofiel (genres, decennia) op z'n volledigst.
    const profielTodo = !profielGeladen.current && !enrich.running;
    if (!simTodo.length && !dirTodo.length && !profielTodo) return;
    simTodo.forEach((s) => simTried.current.add(s.key));
    dirTodo.forEach((r) => dirTried.current.add(r.naam));
    if (profielTodo) profielGeladen.current = true;
    blendRunning.current = true;
    setBlendBusy(true);
    (async () => {
      try {
        // 1. Similar-lijsten voor je top-24 seeds (meta-cache)
        for (const s of simTodo) {
          if (!mounted.current) return;
          try {
            const sims = await fetchSimilar(meta[s.key].id, key);
            setMeta((prev) => (prev[s.key] ? { ...prev, [s.key]: { ...prev[s.key], sims } } : prev));
          } catch { /* similar is bonus */ }
        }
        // 2. Oeuvres van regisseurs achter je 4,5★+-films (LS-cache met houdbaarheid)
        for (const r of dirTodo) {
          if (!mounted.current) return;
          try {
            let pid = r.id;
            if (!pid) {
              const ppl = await searchPersons(key, r.naam);
              pid = ppl.find((p) => p.dept === 'Directing')?.id || ppl[0]?.id;
            }
            if (!pid) continue;
            const films = (await personFilms(key, pid)).filter((f) => f.rol === 'regie');
            setOeuvres((prev) => ({ ...prev, [r.naam]: { films, at: Date.now() } }));
          } catch { /* oeuvre is bonus */ }
        }
        // 3. Profiel-discover: instroom die aan géén bestaande film hangt
        if (profielTodo && mounted.current) {
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
          const cands = batches.reduce((acc, b) => voegNieuweToe(acc, b.results), []);
          // vooraan zetten, maar wat "Vers uit TMDB" intussen al ophaalde behouden
          if (mounted.current) setProfielCands((prev) => voegNieuweToe(cands, prev));
        }
      } catch { /* instroom is bonus */ } finally {
        blendRunning.current = false;
        if (mounted.current) { setBlendBusy(false); setBlendTick((t) => t + 1); }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, tmdbKey, seedSig, dirSig, enrich.running, blendTick]);

  // Thema-jacht: haalt films op die jouw top-thema's delen, automatisch zodra
  // die bestaan. Voorheen werd de jacht als 'gedaan' gemarkeerd vóórdat er
  // gecontroleerd werd of er al thema's waren; laadde je profiel nog, dan kwam
  // de thema-rij die sessie nooit. Nu jagen we per thema-signatuur, en pas als
  // er niets meer verrijkt wordt (tijdens het verrijken schuiven de thema's nog).
  const themaSig = (taste.topThemes || []).slice(0, 5).map((t) => t.id).join(',');
  useEffect(() => {
    const key = tmdbKey;
    if (!key || mode !== 'voorJou' || !themaSig || enrich.running || themaGeladen.current === themaSig) return;
    const sig = themaSig;
    themaGeladen.current = sig;
    const ids = sig.split(',').map(Number);
    const themeNamen = (taste.topThemes || []).slice(0, 5).map((t) => t.name);
    (async () => {
      try {
        const [a, b] = await Promise.all([
          discoverByKeywords(key, ids, { minVotes: 40, page: 1 }),
          discoverByKeywords(key, ids, { minVotes: 40, page: 2 }).catch(() => ({ results: [] })),
        ]);
        if (!mounted.current || themaGeladen.current !== sig) return; // ingehaald door nieuwere thema's
        // Merk elke treffer met de thema's waarop gejaagd is, zodat de kaart
        // kan uitleggen wáárom hij is aanbevolen.
        const merk = (r) => ({ ...r, viaTheme: themeNamen });
        setThemeCands([...a.results.map(merk), ...b.results.map(merk)]);
        setThemaPage(2);
      } catch {
        // mislukt: bij een volgende aanleiding (bijv. einde verrijking) opnieuw proberen
        if (themaGeladen.current === sig) themaGeladen.current = '';
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tmdbKey, mode, themaSig, enrich.running]);

  const { recs, seededOnRatings, rijen } = useMemo(() => {
    const ownKeys = new Set([...watchlist.map((f) => f.key), ...seenSet, ...ratedFilms.map((f) => f.key)]);
    const ownIds = new Set(Object.values(meta).filter(Boolean).map((m) => m.id));
    // Geziene films apart op TMDB-id: vangt titelverschillen tussen Letterboxd
    // en TMDB. Een film die je al zag mag nooit als aanbeveling terugkomen.
    const seenIds = new Set([...seenSet].map((k) => meta[k]?.id).filter(Boolean));
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
      if (ownIds.has(r.id) || seenIds.has(r.id) || shortIds.has(r.id) || skippedSet.has(r.id)) return;
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
      // /recommendations (kijkgedrag) is de hoofdbron; /similar (metadata) is
      // veel ruiser en weegt daarom half zo zwaar. De plek in TMDB's lijst telt mee.
      const recs = meta[seed.key]?.recs || [];
      recs.forEach((r, i) => voegToe(r, (1 + w) * plekGewicht(i, recs.length), 'aanbevolen', seed.name));
      const sims = meta[seed.key]?.sims || [];
      sims.forEach((r, i) => voegToe(r, (0.4 + w * 0.4) * plekGewicht(i, sims.length), 'vergelijkbaar', seed.name));
    });
    // Alleen oeuvres van je huidige favoriete regisseurs (de cache kan oude
    // bevatten), en alleen films die een genre delen met wat jij van ze waardeert.
    regisseurs.forEach((reg) => {
      oeuvres[reg.naam]?.films?.forEach((r) => {
        if (pastInOeuvre(r, reg.genres)) voegToe(r, 1.6, `oeuvre:${reg.naam}`, null);
      });
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
      return { ...r, match: m.score, redenen, recept: m.recept };
    });

    // Rijen-met-reden: dezelfde kandidaten, gegroepeerd op waaróm ze er zijn,
    // binnen elke rij op aanbevelingssterkte, en met afwisselende rijsoorten
    // (zie bouwRijen in lib/rows.js).
    const rijen = bouwRijen(list, {
      regisseurs: regisseurs.map((r) => r.naam),
      seedFilms: gewogenSeeds.filter((s) => (s.rating || 0) >= 4.5),
    });

    return { recs: list, seededOnRatings: onRatings, rijen };
  }, [watchlist, meta, ratings, ratedFilms, seenSet, shortlist, skipped, seeds, regisseurs, oeuvres, profielCands, themeCands, lang]);

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

      {mode === 'voorJou' && blendBusy && (
        <p style={{ color: 'var(--fog-dim)', fontSize: 12.5, marginBottom: 14 }}>
          {tr('verken.blending')}
        </p>
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
        const moodOn = moods.length > 0 || !!focusGenre;
        const focusIds = focusGenre ? [Number(focusGenre)] : [];
        const herweeg = (lijst) => (moodOn
          ? applyMoods(filterMoods(lijst, { active: moods, focusGenres: focusIds }), { active: moods, focusGenres: focusIds, taste }).sort((a, b) => b.moodScore - a.moodScore)
          : lijst);
        // Rijen: films binnen elke rij herwegen op de stemming; lege rijen (na
        // een strenge focus) vallen weg.
        const moodRijen = moodOn
          ? rijen.map((rij) => ({ ...rij, films: herweeg(rij.films) })).filter((rij) => rij.films.length)
          : rijen;
        const toonRijen = rowsView && sortRecs === 'match' && moodRijen.filter((rij) => !dismissed.includes(rij.id)).length >= 1;
        const gefilterd = applyLightFilters(recs);
        const gesorteerd = moodOn ? herweeg([...gefilterd]) : [...gefilterd].sort((a, b) => {
          if (sortRecs === 'aanbevolen') return b.waarde - a.waarde || b.match - a.match;
          if (sortRecs === 'score') return (b.vote || 0) - (a.vote || 0);
          if (sortRecs === 'nieuw') return (b.year || 0) - (a.year || 0);
          if (sortRecs === 'oud') return (a.year || 9999) - (b.year || 9999);
          return b.match - a.match; // standaard: jouw match
        });
        return (
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {rijen.length >= 1 && sortRecs === 'match' ? (
                <button className="btn ghost" style={{ fontSize: 12.5 }} onClick={() => setRowsView((v) => !v)}>
                  {rowsView ? tr('verken.rowsToggleAll') : tr('verken.rowsToggleRows')}
                </button>
              ) : null}
              {tmdbKey && (
                <button className="btn ghost" style={{ fontSize: 12.5 }} onClick={laadVers} disabled={versLaden}>
                  <Sparkles size={13} /> {versLaden ? tr('verken.tappingTmdb') : tr('verken.loadFresh')}
                </button>
              )}
            </div>
            {!toonRijen && (
              <select className="field" style={{ width: 'auto' }} value={sortRecs} onChange={(e) => setSortRecs(e.target.value)} aria-label="Sorteer aanbevelingen">
                <option value="match">{tr('sort.bestMatch')}</option>
                <option value="aanbevolen">{tr('verken.strongestRec')}</option>
                <option value="score">{tr('sort.highestScore')}</option>
                <option value="nieuw">{tr('sort.newest')}</option>
                <option value="oud">{tr('sort.oldest')}</option>
              </select>
            )}
          </div>

          <div className="mood-bar">
            <span className="mood-prompt">{tr('verken.moodPrompt')}</span>
            {MOODS.map((m) => (
              <button key={m.id} className={`chip ${moods.includes(m.id) ? 'on-o' : ''}`} onClick={() => toggleMood(m.id)}>
                {m.emoji} {tr(`verken.mood${m.id.charAt(0).toUpperCase()}${m.id.slice(1)}`)}
              </button>
            ))}
            <select className="field" style={{ width: 'auto', fontSize: 12.5 }} value={focusGenre} onChange={(e) => setFocusGenre(e.target.value)} aria-label={tr('verken.moodFocus')}>
              <option value="">{tr('verken.moodFocus')}</option>
              {GENRES.map((g) => <option key={g.id} value={g.id}>{lang === 'nl' ? g.nl : g.en}</option>)}
            </select>
            {(moods.length > 0 || focusGenre) && (
              <button className="btn ghost" style={{ fontSize: 12 }} onClick={() => { setMoods([]); setFocusGenre(''); }}>{tr('verken.moodClear')}</button>
            )}
          </div>

          {toonRijen ? (
            <div className="rec-rows">
              {moodRijen.filter((rij) => !dismissed.includes(rij.id)).slice(0, 7).map((rij) => {
                const zichtbaar = vensterVan(rij.films, (rowOffsets[rij.id] || 0) + verseShift, 12);
                return (
                <section key={rij.id}>
                  <div className="rec-row-head">
                    <h3>
                      {rij.type === 'oeuvre' && tr('verken.rowOeuvre', { name: rij.naam })}
                      {rij.type === 'thema' && (rij.themas?.length ? tr('verken.rowTheme', { themes: rij.themas.join(', ') }) : tr('verken.rowThemePlain'))}
                      {rij.type === 'seed' && tr('verken.rowSeed', { name: rij.naam })}
                      {rij.type === 'profiel' && tr('verken.rowProfile')}
                    </h3>
                    <span className="cnt">{rij.films.length}</span>
                    {(rij.films.length > 12 || rij.type !== 'oeuvre') && (
                      <button className="row-more icon" onClick={() => (rij.type === 'oeuvre' ? schuifRij(rij.id) : haalMeerVoorRij(rij))} disabled={!!rowBusy[rij.id]} aria-label={tr('verken.rowMoreAria')} title={tr('verken.rowMoreAria')}>
                        <RotateCcw size={13} className={rowBusy[rij.id] ? 'spin' : ''} />
                      </button>
                    )}
                    <button className="row-more icon" style={{ marginLeft: rij.films.length > 12 || rij.type !== 'oeuvre' ? 0 : 'auto' }} onClick={() => setDismissed((d) => [...d, rij.id])} aria-label={tr('verken.rowSwapAria')} title={tr('verken.rowSwapAria')}>
                      <X size={13} />
                    </button>
                  </div>
                  <div className="rec-strip">
                    {zichtbaar.map((r, i) => (
                      <button key={r.id} className="rec-tile" style={{ '--i': Math.min(i, 12) }} onClick={() => openDetail(r)} aria-label={tr('common.openAria', { title: r.title })}>
                        <div className="poster">
                          {r.poster ? <img src={IMG(r.poster, 'w342')} alt={tr('common.posterAlt', { name: r.title })} loading="lazy" /> : <Clapperboard size={20} strokeWidth={1.4} aria-hidden="true" />}
                          {r.vote ? <span className="tile-score"><Star size={10} style={{ verticalAlign: -1 }} /> {String(r.vote).replace('.', ',')}</span> : null}
                        </div>
                        <span className="t">{r.title}</span>
                        <span className="yr">{r.year || '—'}{taste.sterk && r.match != null ? <span className="mt"> · {r.match}%</span> : null}</span>
                      </button>
                    ))}
                  </div>
                </section>
                );
              })}
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
                {r.recept && r.match != null && (
                  <div style={{ marginTop: 8 }}>
                    <button className="why-score" onClick={() => setReceptOpen(receptOpen === r.id ? null : r.id)}>
                      {receptOpen === r.id ? tr('verken.receptHide') : tr('verken.whyScore', { score: r.match })}
                    </button>
                    {receptOpen === r.id && (
                      <div className="recept-panel">
                        <p className="recept-intro">{tr('verken.receptIntro', { score: r.match })}</p>
                        {r.recept.map((c) => (
                          <div key={c.id} className="recept-row">
                            <span className="recept-label">{tr(`verken.recept${c.id.charAt(0).toUpperCase()}${c.id.slice(1)}`)}</span>
                            <span className="recept-bar"><span style={{ width: `${Math.round(c.v * 100)}%` }} /></span>
                            <span className="recept-pts">{tr('verken.receptPts', { pts: c.pts })}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
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
          </>)}
        </div>
        );
      })())}

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
