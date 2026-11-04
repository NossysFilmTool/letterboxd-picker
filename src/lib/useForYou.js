// De Voor jou-motor: verrijkt je kijkgeschiedenis, mengt de instroombronnen
// (aanbevelingen, vergelijkbaar, oeuvres, profiel, thema's) en scoort elke
// kandidaat. Los van de weergave, zodat Verken.jsx alleen over het scherm gaat.
import { useEffect, useMemo, useRef, useState } from 'react';
import { GENRES, searchPersons, personFilms, fetchSimilar, fetchRecommendations, discoverGems, discoverByKeywords, fetchDetailById, getRegion } from './tmdb.js';
import { useLS, filmKey } from './storage.js';
import { buildTaste, matchScore } from './taste.js';
import { voegNieuweToe, plekGewicht, rangschikRegisseurs, pastInOeuvre } from './rows.js';
import { useT } from './i18n.js';

const HIST_PER_SESSIE = 60;
const OEUVRE_TTL = 30 * 24 * 3600e3;
const DETAIL_TTL = 14 * 24 * 3600e3; // streamingaanbod wisselt; twee weken is vers genoeg
const DETAIL_MAX = 300; // ~250 KB localStorage
const DETAIL_WERKERS = 6;

// Alleen wat Voor jou nodig heeft van een filmdetail: looptijd en genres
// (filters), trefwoorden (thema's en redenen), streamingaanbod en links.
const slank = (d) => ({
  runtime: d.runtime || null,
  genres: d.genres || [],
  keywords: d.keywords || [],
  flat: d.flat || [],
  jwLink: d.jwLink || null,
  imdbId: d.imdbId || null,
  director: d.director || null,
  regio: getRegion(),
  at: Date.now(),
});
// Houd de cache klein: verlopen eruit, daarna alleen de nieuwste DETAIL_MAX.
const snoei = (map) => {
  const nu = Date.now();
  const rijen = Object.entries(map).filter(([, d]) => d && nu - (d.at || 0) < DETAIL_TTL);
  if (rijen.length <= DETAIL_MAX) return Object.fromEntries(rijen);
  return Object.fromEntries(rijen.sort((a, b) => b[1].at - a[1].at).slice(0, DETAIL_MAX));
};

// actief: alleen als 'Voor jou' open staat halen we iets op, zodat de
// Zoeken-tab instant blijft.
export function useForYou(app, actief) {
  const { t: tr, lang } = useT();
  const { watchlist, meta, setMeta, ratings, ratedFilms, shortlist, skipped, startEnrich, enrich, metaReady, tmdbKey, seenSet } = app;

  const [oeuvres, setOeuvres] = useLS('oeuvres', {});
  const [profielCands, setProfielCands] = useState([]);
  const [themeCands, setThemeCands] = useState([]);
  const [profielPage, setProfielPage] = useState(1);
  const [themaPage, setThemaPage] = useState(2); // pagina 1-2 laadt de instroom al
  const [versLaden, setVersLaden] = useState(false);
  const [blendBusy, setBlendBusy] = useState(false);
  // Wat de motor deze sessie al geprobeerd heeft, zodat hij na elke ronde kan
  // kijken of er nieuw werk is zonder mislukte calls eindeloos te herhalen.
  const blendRunning = useRef(false);
  const [blendTick, setBlendTick] = useState(0);
  const histTried = useRef(new Set());
  const simTried = useRef(new Set());
  const dirTried = useRef(new Set());
  const profielGeladen = useRef(false);
  const themaGeladen = useRef(''); // signatuur van de top-thema's waarop al gejaagd is
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  // Kandidaat-details: per TMDB-id, slank gecachet, per regio. Verken vraagt
  // ze op voor wat zichtbaar is en voor de sterkste kandidaten.
  const [details, setDetails] = useLS('kandDetails', {});
  const [detailsLaden, setDetailsLaden] = useState(false);
  const detailRij = useRef([]);
  const detailGeprobeerd = useRef(new Set()); // deze sessie; mislukt = pas na herladen opnieuw
  const detailLoopt = useRef(false);
  const regio = getRegion();
  const isVers = (d) => !!d && d.regio === regio && Date.now() - (d.at || 0) < DETAIL_TTL;
  const draaiDetails = async () => {
    detailLoopt.current = true;
    setDetailsLaden(true);
    let buffer = {};
    const flush = () => {
      const b = buffer;
      buffer = {};
      if (Object.keys(b).length) setDetails((prev) => snoei({ ...prev, ...b }));
    };
    const werker = async () => {
      while (detailRij.current.length && mounted.current) {
        const id = detailRij.current.shift();
        try {
          buffer[id] = slank(await fetchDetailById(id, tmdbKey));
          if (Object.keys(buffer).length >= DETAIL_WERKERS) flush();
        } catch { /* volgende sessie opnieuw */ }
      }
    };
    await Promise.all(Array.from({ length: DETAIL_WERKERS }, werker));
    flush();
    // Kwam er tijdens het ophalen nog iets bij, dan meteen door
    if (detailRij.current.length && mounted.current) { draaiDetails(); return; }
    detailLoopt.current = false;
    if (mounted.current) setDetailsLaden(false);
  };
  const vraagDetails = (ids) => {
    if (!tmdbKey || !actief) return;
    const nieuw = ids.filter((id) => !isVers(details[id]) && !detailGeprobeerd.current.has(id));
    if (!nieuw.length) return;
    nieuw.forEach((id) => detailGeprobeerd.current.add(id));
    detailRij.current.push(...nieuw);
    if (!detailLoopt.current) draaiDetails();
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
  // worden seed. Los van de mengmotor, want die heeft seeds nodig om te
  // starten. We wachten tot een lopende verrijking klaar is, want startEnrich
  // negeert een aanroep tijdens een andere run.
  const historyCandidates = useMemo(
    () => ratedFilms
      .filter((f) => f.rating >= 4 && !(f.key in meta))
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 40),
    [ratedFilms, meta],
  );
  useEffect(() => {
    if (!actief || !tmdbKey || !metaReady || enrich.running) return;
    const ruimte = HIST_PER_SESSIE - histTried.current.size;
    const todo = historyCandidates.filter((f) => !histTried.current.has(f.key)).slice(0, Math.max(0, ruimte));
    if (!todo.length) return;
    todo.forEach((f) => histTried.current.add(f.key));
    startEnrich(todo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actief, tmdbKey, metaReady, enrich.running, historyCandidates]);

  // Regisseurs achter je favorieten, sterkste eerst (bron voor "Meer van X")
  const regisseurs = useMemo(() => rangschikRegisseurs(seeds, meta), [seeds, meta]);

  // Profiel-discover op je topgenres; `page` bepaalt hoe diep.
  const profielQueries = (page, streng) => {
    const topG = Object.entries(taste.genres).filter(([, v]) => v > 0.3).sort((a, b) => b[1] - a[1]).slice(0, 2)
      .map(([en]) => GENRES.find((g) => g.en === en)?.id).filter(Boolean);
    if (streng) {
      const topD = Object.entries(taste.decades).sort((a, b) => b[1] - a[1])[0]?.[0];
      const basis = { minScore: 7.0, minVotes: 300, maxVotes: 60000, minRuntime: 60, sortBy: 'vote_average.desc', page };
      return [
        { ...basis, genreIds: topG, yearFrom: topD ? +topD : '', yearTo: topD ? +topD + 9 : '' },
        { ...basis, genreIds: topG.slice(0, 1), lang: taste.nietEngels >= 0.35 ? 'niet-en' : 'alle' },
        { ...basis, genreIds: topG, minVotes: 100, maxVotes: 5000 },
      ];
    }
    const basis = { minScore: 6.9, minVotes: 200, maxVotes: 80000, minRuntime: 60, sortBy: 'vote_average.desc', page };
    return [
      { ...basis, genreIds: topG },
      { ...basis, genreIds: topG.slice(0, 1), lang: taste.nietEngels >= 0.35 ? 'niet-en' : 'alle' },
      { ...basis, genreIds: [] },
    ];
  };

  // De mengmotor vult de instroom bij, in rondes. Elke ronde doet alleen wat
  // nog ontbreekt; na afloop kijkt hij opnieuw (blendTick), want ondertussen
  // kunnen er via de kijkgeschiedenis nieuwe seeds en regisseurs bijgekomen
  // zijn. Alleen bij unmount stoppen we.
  const seedSig = seeds.slice(0, 24).map((s) => s.key).join('|');
  const dirSig = regisseurs.map((r) => r.naam).join('|');
  useEffect(() => {
    const key = tmdbKey;
    if (!actief || !key || !seeds.length || blendRunning.current) return;
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
          const batches = await Promise.all(profielQueries(1, true).map((q) => discoverGems(key, q).catch(() => ({ results: [] }))));
          const cands = batches.reduce((acc, b) => voegNieuweToe(acc, b.results), []);
          // vooraan zetten, maar wat "Andere suggesties" intussen al ophaalde behouden
          if (mounted.current) setProfielCands((prev) => voegNieuweToe(cands, prev));
        }
      } catch { /* instroom is bonus */ } finally {
        blendRunning.current = false;
        if (mounted.current) { setBlendBusy(false); setBlendTick((t) => t + 1); }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actief, tmdbKey, seedSig, dirSig, enrich.running, blendTick]);

  // Thema-jacht: films die jouw top-thema's delen, automatisch zodra die
  // bestaan. We jagen op páren thema's die allebei in de film moeten zitten:
  // op één los trefwoord ("florida", "fire") kwam elke klassieker binnen.
  // Met maar één thema jagen we op dat ene. Per thema-signatuur, en pas als er
  // niets meer verrijkt wordt (tijdens het verrijken schuiven de thema's nog).
  const themaJachten = () => {
    const top = (taste.topThemes || []).slice(0, 4);
    if (top.length < 2) return top.map((t) => ({ ids: [t.id], namen: [t.name] }));
    // sterke thema's (4+ van je favorieten) mogen ook los
    const los = top.filter((t) => (t.films || 0) >= 4).map((t) => ({ ids: [t.id], namen: [t.name] }));
    const paren = [];
    for (let i = 0; i < top.length; i++) {
      for (let j = i + 1; j < top.length; j++) paren.push({ ids: [top[i].id, top[j].id], namen: [top[i].name, top[j].name] });
    }
    return [...los, ...paren];
  };
  const jaag = async (key, page) => {
    let fout = false;
    const lijsten = await Promise.all(themaJachten().map((j) => discoverByKeywords(key, j.ids, { minVotes: 40, page, alle: true })
      // Merk elke treffer met de thema's waarop gejaagd is, zodat de kaart kan uitleggen waarom
      .then((d) => d.results.map((r) => ({ ...r, viaTheme: j.namen })))
      .catch(() => { fout = true; return []; })));
    return { films: lijsten.reduce((acc, l) => voegNieuweToe(acc, l), []), fout };
  };
  const themaSig = (taste.topThemes || []).slice(0, 4).map((t) => t.id).join(',');
  useEffect(() => {
    const key = tmdbKey;
    if (!key || !actief || !themaSig || enrich.running || themaGeladen.current === themaSig) return;
    const sig = themaSig;
    themaGeladen.current = sig;
    (async () => {
      const { films, fout } = await jaag(key, 1);
      if (!mounted.current || themaGeladen.current !== sig) return; // ingehaald door nieuwere thema's
      // alles mislukt: bij een volgende aanleiding (bijv. einde verrijking) opnieuw proberen
      if (fout && !films.length) { themaGeladen.current = ''; return; }
      setThemeCands(films);
      setThemaPage(1);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tmdbKey, actief, themaSig, enrich.running]);

  // Verse instroom: een volgende discover-pagina op je profiel
  const laadVers = async () => {
    if (!tmdbKey || versLaden) return;
    setVersLaden(true);
    try {
      const nieuwePage = profielPage + 1;
      const batches = await Promise.all(profielQueries(nieuwePage, false).map((q) => discoverGems(tmdbKey, q).catch(() => ({ results: [] }))));
      setProfielCands((prev) => batches.reduce((acc, b) => voegNieuweToe(acc, b.results), prev));
      setProfielPage(nieuwePage);
    } catch { /* volgende klik probeert opnieuw */ }
    setVersLaden(false);
  };

  // Meer films voor één rij: seeds dieper in similar/recommendations,
  // thema's dieper in discover, de rest via verse profiel-instroom. Een
  // oeuvre is eindig, daar valt niets bij te halen.
  const haalMeer = async (rij) => {
    if (!tmdbKey) return;
    if (rij.type === 'seed') {
      const seedKey = rij.id.slice(5);
      const m = meta[seedKey];
      if (!m?.id) return;
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
    } else if (rij.type === 'thema') {
      if (!(taste.topThemes || []).length) return;
      const page = themaPage + 1;
      const { films } = await jaag(tmdbKey, page);
      setThemeCands((prev) => voegNieuweToe(prev, films));
      setThemaPage(page);
    } else if (rij.type !== 'oeuvre') {
      await laadVers();
    }
  };

  // Alle kandidaten, gewogen per bron en gescoord op jouw smaak
  const { recs, seededOnRatings, seedFilms } = useMemo(() => {
    const ownKeys = new Set([...watchlist.map((f) => f.key), ...seenSet, ...ratedFilms.map((f) => f.key)]);
    const ownIds = new Set(Object.values(meta).filter(Boolean).map((m) => m.id));
    // Geziene films apart op TMDB-id: vangt titelverschillen tussen Letterboxd
    // en TMDB. Een film die je al zag mag nooit als aanbeveling terugkomen.
    const seenIds = new Set([...seenSet].map((k) => meta[k]?.id).filter(Boolean));
    const skippedSet = new Set(skipped.map((s) => (typeof s === 'object' ? s.id : s)));
    const shortIds = new Set(shortlist.map((s) => s.id));

    // Zonder minstens drie favorieten leunen we op de aanbevelingen bij je watchlist
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
      const recsS = meta[seed.key]?.recs || [];
      recsS.forEach((r, i) => voegToe(r, (1 + w) * plekGewicht(i, recsS.length), 'aanbevolen', seed.name));
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

    const topThemaNamen = new Map((taste.topThemes || []).map((t) => [t.id, t.name]));
    const list = [...agg.values()].map((kaal) => {
      // Met details: echte looptijd, genres, trefwoorden (thema-match) en aanbod
      const d = isVers(details[kaal.id]) ? details[kaal.id] : null;
      const r = d ? {
        ...kaal,
        runtime: d.runtime, keywords: d.keywords, flat: d.flat, jwLink: d.jwLink, imdbId: d.imdbId, director: d.director,
        genres: d.genres?.length ? d.genres : kaal.genres,
      } : kaal;
      const m = matchScore(r, taste);
      let redenen = m.redenen;
      // Via de thema-jacht gevonden en de score gaf zelf geen thema-reden
      // (light-object zonder keywords): leg het alsnog uit.
      if (r.viaTheme?.length && !redenen.some((x) => /thema/i.test(x))) {
        redenen = [tr('verken.foundOnThemes', { themes: r.viaTheme.slice(0, 3).join(', ') }), ...redenen];
      }
      // Welke van jouw top-thema's deze film aantoonbaar deelt (alleen met details)
      const gedeeldeThemas = r.keywords ? r.keywords.filter((k) => topThemaNamen.has(k.id)).map((k) => topThemaNamen.get(k.id)) : null;
      return { ...r, match: m.score, redenen, recept: m.recept, gedeeldeThemas };
    });

    return {
      recs: list,
      seededOnRatings: onRatings,
      seedFilms: gewogenSeeds.filter((s) => (s.rating || 0) >= 4.5),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlist, meta, ratedFilms, seenSet, shortlist, skipped, seeds, regisseurs, oeuvres, profielCands, themeCands, taste, details, regio, lang]);

  return { taste, recs, seededOnRatings, seedFilms, regisseurs, blendBusy, versLaden, laadVers, haalMeer, vraagDetails, detailsLaden };
}
