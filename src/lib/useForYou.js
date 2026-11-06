// De Voor jou-motor: verrijkt je kijkgeschiedenis, mengt de instroombronnen
// (aanbevelingen, vergelijkbaar, oeuvres, profiel, thema's) en scoort elke
// kandidaat. Los van de weergave, zodat Verken.jsx alleen over het scherm gaat.
import { useEffect, useMemo, useRef, useState } from 'react';
import { GENRES, searchPersons, personFilms, fetchSimilar, fetchRecommendations, discoverGems, discoverByKeywords, fetchDetailById, fetchDiensten, getRegion } from './tmdb.js';
import { useLS } from './storage.js';
import { buildTaste } from './taste.js';
import { voegNieuweToe, rangschikRegisseurs } from './rows.js';
import { bepaalSeeds, scoorKandidaten, detailVers, DETAIL_TTL, STANDAARD_OPTIES } from './kandidaten.js';
import { normaliseer, handtekening, zoekVragen } from './eigenrijen.js';
import { useT } from './i18n.js';

const HIST_PER_SESSIE = 60;
const OEUVRE_TTL = 30 * 24 * 3600e3;
const DIENSTEN_TTL = 30 * 24 * 3600e3;
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
  const [dienstCands, setDienstCands] = useState([]); // "Nu op jouw diensten"
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
  const isVers = (d) => detailVers(d, regio);
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
    () => buildTaste({ watchlist, ratedFilms, meta, shortlist, skipped, idf: STANDAARD_OPTIES.idf, profielUitFavorieten: STANDAARD_OPTIES.profielFav }),
    [watchlist, ratedFilms, meta, shortlist, skipped],
  );

  // Seeds met gewicht: films die jij 4+ gaf (5★ duwt harder dan 4★)
  const seeds = useMemo(
    () => bepaalSeeds({ watchlist, ratings, ratedFilms, meta }),
    [watchlist, ratedFilms, ratings, meta],
  );

  // Kijkgeschiedenis verdiepen: je best beoordeelde films zonder filmdata
  // worden seed, je laagst beoordeelde anti-seed. Los van de mengmotor, want
  // die heeft seeds nodig om te starten. We wachten tot een lopende
  // verrijking klaar is, want startEnrich negeert een aanroep tijdens een andere run.
  const historyCandidates = useMemo(() => {
    const zonder = ratedFilms.filter((f) => !(f.key in meta));
    const hoog = zonder.filter((f) => f.rating >= 4).sort((a, b) => b.rating - a.rating).slice(0, 40);
    const laag = zonder.filter((f) => f.rating <= 2).sort((a, b) => a.rating - b.rating).slice(0, 15);
    return [...hoog, ...laag];
  }, [ratedFilms, meta]);
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

  // "Nu op jouw diensten": welke diensten jij hebt (onthouden), de lijst van
  // diensten in je regio (eens per 30 dagen), en wat daar nu staat en bij je
  // genres past. De rij zelf mengt dit met je eigen aanbevelingen die op je
  // diensten staan (uit de kandidaat-details).
  const [mijnDiensten, setMijnDiensten] = useLS('mijnDiensten', []);
  const [dienstenLijst, setDienstenLijst] = useLS('dienstenLijst', null); // { regio, at, lijst }
  const [dienstPage, setDienstPage] = useState(1);
  const dienstGeladen = useRef('');
  useEffect(() => {
    if (!actief || !tmdbKey) return undefined;
    if (dienstenLijst && dienstenLijst.regio === regio && Date.now() - (dienstenLijst.at || 0) < DIENSTEN_TTL) return undefined;
    let weg = false;
    fetchDiensten(tmdbKey, regio)
      .then((lijst) => { if (!weg && mounted.current) setDienstenLijst({ regio, at: Date.now(), lijst }); })
      .catch(() => { /* zonder lijst geen kiezer; volgende keer opnieuw */ });
    return () => { weg = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actief, tmdbKey, regio]);
  const regioDiensten = dienstenLijst?.regio === regio ? dienstenLijst.lijst : [];
  const dienstIds = mijnDiensten.map((n) => regioDiensten.find((p) => p.naam === n)?.id).filter(Boolean);
  // Wat de kiezer aanbiedt: wat je al koos, dan de diensten waar jouw films en
  // kandidaten het vaakst op staan (MUBI staat niet in TMDB's top, maar wel
  // onder je arthouse-favorieten), dan de bekendste in je regio. Zonder
  // kinder-, winkel- en kanaalvarianten.
  const dienstenKeuze = useMemo(() => {
    const geldig = (p) => !/kids|store|channel/i.test(p);
    const tel = {};
    [...Object.values(meta), ...Object.values(details)].forEach((m) => m?.flat?.forEach((p) => { tel[p] = (tel[p] || 0) + 1; }));
    const eigen = Object.entries(tel).sort((a, b) => b[1] - a[1]).map(([p]) => p).filter(geldig).slice(0, 6);
    const lijst = regioDiensten.map((p) => p.naam).filter(geldig).slice(0, 12);
    if (!lijst.length) return [];
    return [...new Set([...mijnDiensten, ...eigen, ...lijst])].slice(0, 16);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dienstenLijst, regio, mijnDiensten, meta, details]);
  const dienstQueries = (page) => {
    const topG = Object.entries(taste.genres).filter(([, v]) => v > 0.3).sort((a, b) => b[1] - a[1]).slice(0, 2)
      .map(([en]) => GENRES.find((g) => g.en === en)?.id).filter(Boolean);
    return [
      { providerIds: dienstIds, genreIds: topG, minScore: 7.0, minVotes: 300, minRuntime: 60, sortBy: 'vote_average.desc', page },
      { providerIds: dienstIds, genreIds: [], minScore: 7.3, minVotes: 1000, minRuntime: 60, sortBy: 'vote_average.desc', page },
    ];
  };
  const laadDienst = async (page) => {
    const batches = await Promise.all(dienstQueries(page).map((q) => discoverGems(tmdbKey, q).catch(() => ({ results: [] }))));
    return batches.reduce((acc, b) => voegNieuweToe(acc, b.results), []);
  };
  const dienstSig = `${dienstIds.join('|')}@${regio}`;
  useEffect(() => {
    if (!actief || !tmdbKey || !dienstIds.length || enrich.running || dienstGeladen.current === dienstSig) return;
    const sig = dienstSig;
    dienstGeladen.current = sig;
    (async () => {
      const films = await laadDienst(1);
      if (!mounted.current || dienstGeladen.current !== sig) return;
      setDienstCands(films);
      setDienstPage(1);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actief, tmdbKey, dienstSig, enrich.running]);

  // Eigen rijen: wat je zelf samenstelt (bewaard), en per rij de gevonden
  // films (per sessie, opnieuw zodra je de rij aanpast).
  const [eigenRijen, setEigenRijen] = useLS('eigenRijen', []);
  const [eigenCands, setEigenCands] = useState({}); // id -> { sig, films, page }
  const eigenBezig = useRef(new Set());
  const providerIdsVoor = (dienst) => {
    if (!dienst || dienst === '*') return []; // "elke dienst" kan TMDB niet; dat filtert de rij zelf
    const namen = dienst === '~mijn' ? mijnDiensten : [dienst];
    return namen.map((n) => regioDiensten.find((p) => p.naam === n)?.id).filter(Boolean);
  };
  const haalEigen = async (rij, page) => {
    const b = normaliseer(rij);
    if (b.basis === 'film') {
      const [recsF, simsF] = await Promise.all([
        fetchRecommendations(b.film.id, tmdbKey, page).catch(() => []),
        page === 1 ? fetchSimilar(b.film.id, tmdbKey, 1).catch(() => []) : Promise.resolve([]),
      ]);
      return voegNieuweToe(recsF, simsF);
    }
    if (b.basis === 'maker') {
      if (page > 1) return []; // een filmografie is in één keer compleet
      const films = await personFilms(tmdbKey, b.maker.id).catch(() => []);
      return films.filter((f) => (b.maker.rol === 'cast' ? f.rol === 'cast' : f.rol === 'regie'));
    }
    const vragen = zoekVragen(b, { providerIds: providerIdsVoor(b.dienst) });
    const res = await Promise.all(vragen.map((q) => discoverGems(tmdbKey, { ...q, page }).catch(() => ({ results: [] }))));
    return res.reduce((acc, d) => voegNieuweToe(acc, d.results), []);
  };
  const eigenSig = eigenRijen.map((r) => `${r.id}:${handtekening(r)}`).join('|');
  useEffect(() => {
    if (!actief || !tmdbKey) return;
    eigenRijen.forEach((rij) => {
      const sig = handtekening(rij);
      // wacht met dienst-rijen tot de dienstenlijst er is, anders zoekt TMDB zonder dienst
      if (rij.dienst && rij.dienst !== '*' && !regioDiensten.length) return;
      if (eigenCands[rij.id]?.sig === sig || eigenBezig.current.has(`${rij.id}:${sig}`)) return;
      eigenBezig.current.add(`${rij.id}:${sig}`);
      haalEigen(rij, 1).then((films) => {
        if (!mounted.current) return;
        setEigenCands((prev) => ({ ...prev, [rij.id]: { sig, films, page: 1 } }));
      }).finally(() => eigenBezig.current.delete(`${rij.id}:${sig}`));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actief, tmdbKey, eigenSig, regioDiensten.length]);
  // Voor de scoring: alleen de films die bij de huidige versie van elke rij horen
  const eigenFilms = useMemo(() => Object.fromEntries(eigenRijen
    .filter((r) => eigenCands[r.id]?.sig === handtekening(r))
    .map((r) => [r.id, eigenCands[r.id].films])), [eigenRijen, eigenCands]);
  const eigenGeladen = (id) => !!eigenCands[id] && eigenCands[id].sig === handtekening(eigenRijen.find((r) => r.id === id) || {});

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
    } else if (rij.type === 'eigen') {
      const huidig = eigenCands[rij.id];
      if (!huidig) return;
      const page = (huidig.page || 1) + 1;
      const films = await haalEigen(rij.rij, page);
      setEigenCands((prev) => (prev[rij.id] ? { ...prev, [rij.id]: { ...prev[rij.id], films: voegNieuweToe(prev[rij.id].films, films), page } } : prev));
    } else if (rij.type === 'dienst') {
      if (!dienstIds.length) return;
      const page = dienstPage + 1;
      const films = await laadDienst(page);
      setDienstCands((prev) => voegNieuweToe(prev, films));
      setDienstPage(page);
    } else if (rij.type !== 'oeuvre') {
      await laadVers();
    }
  };

  // Alle kandidaten, gewogen per bron en gescoord op jouw smaak (lib/kandidaten.js)
  // Het geleerde model (fase 8) rangschikt, als je het aan hebt staan
  const model = app.smaakModel?.aan ? app.smaakModel : null;
  const { recs, seededOnRatings, seedFilms } = useMemo(
    () => scoorKandidaten({
      watchlist, meta, ratedFilms, ratings, seenSet, shortlist, skipped,
      oeuvres, profielCands, themeCands, dienstCands, eigenCands: eigenFilms, details, regio,
      taste, seeds, regisseurs, uitleg: tr, model,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [watchlist, meta, ratedFilms, ratings, seenSet, shortlist, skipped, seeds, regisseurs, oeuvres, profielCands, themeCands, dienstCands, eigenFilms, taste, details, regio, lang, model],
  );

  return {
    taste, recs, seededOnRatings, seedFilms, regisseurs, blendBusy, versLaden, laadVers, haalMeer, vraagDetails, detailsLaden,
    mijnDiensten, setMijnDiensten, dienstenKeuze,
    seeds, eigenRijen, setEigenRijen, eigenGeladen,
  };
}
