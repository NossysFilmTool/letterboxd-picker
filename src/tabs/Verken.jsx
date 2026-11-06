import { Fragment, useMemo, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, Copy, RotateCcw, ArrowLeft, RefreshCw, Plus, Layers, EyeOff } from 'lucide-react';
import { maakHerkenner } from '../lib/gezien.js';
import { GENRES, genreLabelById, fetchDetailById } from '../lib/tmdb.js';
import { sorteerOpSterkte } from '../lib/rows.js';
import { bouwRecept, degelijk, pastFilter, RAAM, kiesVanavond, beschrijfVanavond, alleenApart } from '../lib/foryou.js';
import { useForYou } from '../lib/useForYou.js';
import { fetchExtRatings } from '../lib/omdb.js';
import { shortlistToCsv, downloadText } from '../lib/csv.js';
import { useT } from '../lib/i18n.js';
import { useLS, filmKey } from '../lib/storage.js';
import Zoekmachine from './Zoekmachine.jsx';
import Winner from '../components/Winner.jsx';
import RecRow from '../components/RecRow.jsx';
import RecCard from '../components/RecCard.jsx';
import Sterren from '../components/Sterren.jsx';
import SnelBeoordelen from '../components/SnelBeoordelen.jsx';
import Vanavond from '../components/Vanavond.jsx';
import DienstKiezer from '../components/DienstKiezer.jsx';
import EigenRijMaker from '../components/EigenRijMaker.jsx';
import { bouwEigenRijen, stelRijenVoor, normaliseer, autoNaam } from '../lib/eigenrijen.js';

// Sorteeropties in "Alles bekijken"
const SORTS = [['sterkte', 'verken.strongestRec'], ['match', 'sort.bestMatch'], ['score', 'sort.highestScore'], ['nieuw', 'sort.newest'], ['oud', 'sort.oldest']];

// Verken: "Voor jou" (aanbevelingen buiten je lijst, in rijen met een reden)
// en "Zoeken" (de hele TMDB-catalogus). De motor achter Voor jou zit in
// lib/useForYou.js, het rijrecept in lib/foryou.js.
export default function Verken({ app }) {
  const { t: tr, lang } = useT();
  const { meta, watchlist, ratedFilms, seenSet, shortlist, setShortlist, skipped, setSkipped, tmdbKey } = app;

  // Verken onthoudt je laatste keuze. Zonder keuze open je met eigen films op
  // Voor jou (ontdekken is het doel), zonder op Zoeken.
  const [gekozenMode, setMode] = useLS('verkenMode', null);
  const mode = gekozenMode || (Object.keys(meta).length ? 'voorJou' : 'zoeken');
  const {
    taste, recs, seededOnRatings, seedFilms, regisseurs, blendBusy, versLaden, laadVers, haalMeer, vraagDetails, detailsLaden,
    mijnDiensten, setMijnDiensten, dienstenKeuze,
    seeds, eigenRijen, setEigenRijen, eigenGeladen,
  } = useForYou(app, mode === 'voorJou');
  // Eigen rijen: welke rij staat open in de maker ('nieuw' of een rij-id)
  const [maker, setMaker] = useState(null);
  // De dienstenkiezer: verschijnt zolang je nog geen diensten koos (tot "Niet
  // nu"), en opnieuw via "Diensten wijzigen" op de dienstrij
  const [kiezerWeg, setKiezerWeg] = useLS('dienstKiezerWeg', false);
  const [kiesDiensten, setKiesDiensten] = useState(false);
  const toonKiezer = !!tmdbKey && dienstenKeuze.length > 0 && (kiesDiensten || (!mijnDiensten.length && !kiezerWeg));

  const topRef = useRef(null);
  const [openFilm, setOpenFilm] = useState(null); // { light, detail? }
  const detailCache = useRef(new Map());
  const [nudge, setNudge] = useState(null);
  useEffect(() => {
    if (!nudge) return undefined;
    const t = setTimeout(() => setNudge(null), 3500);
    return () => clearTimeout(t);
  }, [nudge]);
  // Na ✕: waarom niet? Eén keuze stuurt de motor gerichter dan "minder van
  // dit genre". stap 'reden' verdwijnt vanzelf, stap 'sterren' (het bleek
  // "al gezien") wacht op je keuze.
  const [laatsteSkip, setLaatsteSkip] = useState(null); // { r, stap: 'reden' | 'sterren' }
  useEffect(() => {
    if (laatsteSkip?.stap !== 'reden') return undefined;
    const t = setTimeout(() => setLaatsteSkip(null), 12000);
    return () => clearTimeout(t);
  }, [laatsteSkip]);
  const [snel, setSnel] = useState(false); // Snel beoordelen open
  const [showSkipped, setShowSkipped] = useState(false);
  const [shortOpen, setShortOpen] = useState(false);
  // Filters op Voor jou. De streamingkeuze wordt onthouden (je diensten
  // wisselen zelden); genre en kort gelden per bezoek.
  const [genre, setGenre] = useState('');
  const [kort, setKort] = useState(false);
  const [dienst, setDienst] = useLS('verkenDienst', ''); // '' | '*' (elke dienst) | '~mijn' | dienstnaam
  const filterActief = !!(genre || kort || dienst);
  const wachtOpDetails = (kort || !!dienst) && detailsLaden; // genre kan zonder details
  const wisFilters = () => { setGenre(''); setKort(false); setDienst(''); };
  const [ronde, setRonde] = useState(0); // "Andere suggesties": wisselt favorieten en regisseur
  const [alles, setAlles] = useState(null); // de rij waarvan "Alles bekijken" open staat
  const [sortAlles, setSortAlles] = useState('sterkte');
  const [shown, setShown] = useState(12);
  const [receptOpen, setReceptOpen] = useState(null); // film-id waarvan het score-recept uitgeklapt is
  const [meerBezig, setMeerBezig] = useState(false);

  const gefilterd = useMemo(
    () => (filterActief ? recs.filter((f) => pastFilter(f, { genre, kort, dienst, mijnDiensten })) : recs),
    [recs, filterActief, genre, kort, dienst, mijnDiensten],
  );
  // Diensten om op te filteren: wat je eigen bibliotheek en de kandidaten
  // het vaakst aanbieden in jouw regio (zoals bij Pick)
  const diensten = useMemo(() => {
    const tel = {};
    Object.values(meta).forEach((m) => m?.flat?.forEach((p) => { tel[p] = (tel[p] || 0) + 1; }));
    recs.forEach((f) => f.flat?.forEach((p) => { tel[p] = (tel[p] || 0) + 1; }));
    const top = Object.entries(tel).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([p]) => p);
    return dienst && !['*', '~mijn'].includes(dienst) && !top.includes(dienst) ? [...top, dienst] : top;
  }, [meta, recs, dienst]);
  // Vanavond: één grote aanrader bovenaan. Blijft staan tot je er iets mee
  // doet (of hij niet meer door je filters komt), zodat hij niet verspringt
  // terwijl de details van andere films binnenkomen.
  const [vanavondWeg, setVanavondWeg] = useState(() => new Set());
  const vanavondRef = useRef(null);
  const vanavond = useMemo(() => {
    if (mode !== 'voorJou') return null;
    const vorige = vanavondRef.current;
    const nog = vorige != null && !vanavondWeg.has(vorige) ? gefilterd.find((f) => f.id === vorige && degelijk(f)) : null;
    const k = nog ? beschrijfVanavond(nog, { mijnDiensten }) : kiesVanavond(gefilterd, { mijnDiensten, overslaan: vanavondWeg });
    vanavondRef.current = k?.film.id ?? null;
    return k;
  }, [mode, gefilterd, mijnDiensten, vanavondWeg]);
  const vanavondId = vanavond?.film.id ?? null;
  const [vanavondDetail, setVanavondDetail] = useState(null); // { id, d }
  // De rijen tonen de vanavond-film niet nog een keer
  const voorRijen = useMemo(() => (vanavondId == null ? gefilterd : gefilterd.filter((f) => f.id !== vanavondId)), [gefilterd, vanavondId]);
  // Wat je als eigen rij vastzette, krijgt geen automatische dubbelganger
  const vastFilms = useMemo(() => new Set(eigenRijen.filter((r) => r.basis === 'film').map((r) => r.film?.id)), [eigenRijen]);
  const vastMakers = useMemo(() => new Set(eigenRijen.filter((r) => r.basis === 'maker' && r.maker?.rol !== 'cast').map((r) => r.maker?.naam)), [eigenRijen]);
  const rijen = useMemo(
    () => bouwRecept(voorRijen, {
      seedFilms: seedFilms.filter((s) => !vastFilms.has(meta[s.key]?.id)),
      regisseurs: regisseurs.map((r) => r.naam).filter((n) => !vastMakers.has(n)),
      taste, mijnDiensten, ronde,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [voorRijen, seedFilms, regisseurs, taste, mijnDiensten, ronde, vastFilms, vastMakers],
  );
  // Je eigen rijen staan direct onder Top voor jou, in jouw volgorde
  const eigen = useMemo(() => bouwEigenRijen(voorRijen, eigenRijen, { mijnDiensten }), [voorRijen, eigenRijen, mijnDiensten]);
  const weergaveRijen = rijen[0]?.type === 'top' ? [rijen[0], ...eigen, ...rijen.slice(1)] : [...eigen, ...rijen];
  const voorstellen = useMemo(
    () => stelRijenVoor({ seeds, meta, taste, regisseurs, bestaande: eigenRijen }),
    [seeds, meta, taste, regisseurs, eigenRijen],
  );
  // Welke dienst noemt een tegel als eerste: de gefilterde, anders een van jouw diensten
  const voorkeur = dienst && !['*', '~mijn'].includes(dienst) ? [dienst] : mijnDiensten;

  // De lijstweergave: "Alles bekijken" van één rij (live uit de kandidaten,
  // dus met wat je net ophaalde en zonder wat je afwees), of alles als er
  // te weinig kandidaten voor rijen zijn.
  // Zonder rijen: de lijst met je persoonlijke kandidaten (geen klassiekers of
  // prijswinnaars die alleen daarom binnenkwamen)
  const persoonlijk = useMemo(() => voorRijen.filter((f) => !alleenApart(f)), [voorRijen]);
  const lijstModus = !!alles || (weergaveRijen.length === 0 && persoonlijk.length > 0);
  const lijst = useMemo(() => {
    if (!lijstModus) return [];
    const basis = sorteerOpSterkte(alles ? gefilterd.filter(degelijk).filter(alles.past) : persoonlijk);
    if (sortAlles === 'match') return [...basis].sort((a, b) => b.match - a.match);
    if (sortAlles === 'score') return [...basis].sort((a, b) => (b.vote || 0) - (a.vote || 0));
    if (sortAlles === 'nieuw') return [...basis].sort((a, b) => (b.year || 0) - (a.year || 0));
    if (sortAlles === 'oud') return [...basis].sort((a, b) => (a.year || 9999) - (b.year || 9999));
    return basis;
  }, [lijstModus, alles, gefilterd, persoonlijk, sortAlles]);
  // Snel beoordelen: de sterkste kandidaten, één voor één
  const snelLijst = useMemo(() => (snel ? sorteerOpSterkte(gefilterd.filter(degelijk)).slice(0, 80) : []), [snel, gefilterd]);

  // Details ophalen voor wat je ziet plus de sterkste kandidaten (met een
  // filter aan wat ruimer, anders blijven de gefilterde rijen leeg).
  const nodigIds = useMemo(() => {
    if (mode !== 'voorJou') return [];
    const ids = new Set();
    sorteerOpSterkte(recs.filter(degelijk)).slice(0, filterActief ? 150 : 60).forEach((f) => ids.add(f.id));
    // thema-vondsten: pas met trefwoorden blijkt of ze echt je thema's delen
    recs.filter((f) => f.bronnen.includes('thema')).slice(0, 40).forEach((f) => ids.add(f.id));
    rijen.forEach((rij) => rij.films.slice(0, RAAM).forEach((f) => ids.add(f.id)));
    // eigen rijen: ook films die (nog) niet door hun filters komen, want een
    // filter op looptijd of dienst kan pas oordelen met details
    eigenRijen.forEach((r) => recs.filter((f) => f.bronnen.includes(`eigen:${r.id}`)).slice(0, 40).forEach((f) => ids.add(f.id)));
    lijst.slice(0, shown).forEach((f) => ids.add(f.id));
    snelLijst.slice(0, 8).forEach((f) => ids.add(f.id));
    return [...ids];
  }, [mode, recs, rijen, eigenRijen, lijst, shown, filterActief, snelLijst]);
  const nodigSig = nodigIds.join(',');
  useEffect(() => {
    if (nodigIds.length) vraagDetails(nodigIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodigSig]);

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
  // Herkenners met speling op titel en jaar (zie lib/gezien.js). Beoordeeld
  // telt ook als gezien.
  const isGezien = useMemo(
    () => maakHerkenner([...seenSet, ...ratedFilms.map((f) => f.key)], seenIds),
    [seenSet, ratedFilms, seenIds],
  );
  const isBekend = useMemo(() => maakHerkenner(ownKeysAll, ownIdsAll), [ownKeysAll, ownIdsAll]);
  // Verberg al gezien (in Zoeken; Voor jou laat ze nooit zien). Standaard aan.
  const [verbergGezien, setVerbergGezien] = useLS('verbergGezien', true);

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

  // De vanavond-film krijgt zijn volledige details (backdrop, plot, regisseur)
  useEffect(() => {
    if (vanavondId == null) return undefined;
    const bekend = detailCache.current.get(vanavondId);
    if (bekend) { setVanavondDetail({ id: vanavondId, d: bekend }); return undefined; }
    if (!tmdbKey) return undefined;
    let weg = false;
    fetchDetailById(vanavondId, tmdbKey)
      .then((d) => { detailCache.current.set(vanavondId, d); if (!weg) setVanavondDetail({ id: vanavondId, d }); })
      .catch(() => { /* de kaart werkt ook met de lichte data */ });
    return () => { weg = true; };
  }, [vanavondId, tmdbKey]);

  const genreNaam = (ids) => (ids || []).map((id) => genreLabelById(id)).filter(Boolean)[0];
  const addToShortlist = (r) => {
    if (shortIds.has(r.id)) return;
    setShortlist((s) => [...s, { id: r.id, title: r.title, year: r.year, poster: r.poster, vote: r.vote, seeds: r.seeds, genre_ids: r.genre_ids || [] }]);
    const g = genreNaam(r.genre_ids);
    if (g) setNudge(tr('verken.nudgeMore', { genre: g }));
  };
  // Regisseur van een kandidaat: uit de details, of uit de oeuvre-route
  const regisseurVan = (r) => r.director || detailCache.current.get(r.id)?.director
    || r.bronnen?.find((b) => b.startsWith('oeuvre:'))?.slice(7) || null;
  const skip = (r, { vraag = true } = {}) => {
    setSkipped((s) => [...s, {
      id: r.id, title: r.title, year: r.year, genre_ids: r.genre_ids || [],
      director: regisseurVan(r), votes: r.votes ?? null,
    }]);
    if (vraag) { setNudge(null); setLaatsteSkip({ r, stap: 'reden' }); }
  };
  const unskip = (id) => setSkipped((s) => s.filter((x) => (typeof x === 'object' ? x.id : x) !== id));
  const geefReden = (reden) => {
    const r = laatsteSkip?.r;
    if (!r) return;
    if (reden === 'gezien') {
      // geen afwijzing maar een film die je al kent: terug uit de afgewezen
      // films en als gezien bewaren (met sterren als je wilt)
      unskip(r.id);
      setLaatsteSkip({ r, stap: 'sterren' });
      return;
    }
    setSkipped((s) => s.map((x) => (typeof x === 'object' && x.id === r.id ? { ...x, reden } : x)));
    setLaatsteSkip(null);
    if (reden === 'genre') setNudge(tr('verken.redenGenreOk', { genre: genreNaam(r.genre_ids) || tr('verken.ditGenre') }));
    else if (reden === 'mainstream') setNudge(tr('verken.redenMainstreamOk'));
    else if (reden === 'regisseur') setNudge(tr('verken.redenRegisseurOk', { name: regisseurVan(r) }));
  };
  // Al gezien: telt als gezien (en met sterren als beoordeling), zodat hij
  // uit de aanbevelingen verdwijnt en je smaakprofiel ervan leert
  const fmtSter = (n) => (lang === 'nl' ? String(n).replace('.', ',') : String(n));
  const gezien = async (r, sterren = null) => {
    const film = { key: filmKey(r.title, r.year), name: r.title, year: r.year };
    const bekend = detailCache.current.get(r.id) || null;
    app.markeerGezien(film, sterren, bekend);
    setLaatsteSkip(null);
    setNudge(sterren ? tr('verken.gezienMetSterren', { title: r.title, n: fmtSter(sterren) }) : tr('verken.gezienZonder', { title: r.title }));
    // de details erbij, zodat genres en thema's in je profiel tellen
    if (!bekend && tmdbKey) {
      try {
        const d = await fetchDetailById(r.id, tmdbKey);
        detailCache.current.set(r.id, d);
        app.markeerGezien(film, null, d);
      } catch { /* zonder details telt hij alleen als gezien */ }
    }
  };
  const removeShort = (id) => setShortlist((s) => s.filter((x) => x.id !== id));
  const openSimilar = (r) => app.openSimilar(
    { key: `tmdb:${r.id}`, name: r.title, year: r.year },
    { id: r.id, genres: (r.genre_ids || []).map(genreLabelById), lang: r.lang, keywords: detailCache.current.get(r.id)?.keywords || [] },
  );
  const skippedObjects = skipped.filter((s) => typeof s === 'object');

  const openAlles = (rij) => {
    setAlles(rij);
    setShown(12);
    setSortAlles('sterkte');
    topRef.current?.scrollIntoView?.({ block: 'start' });
  };
  const andereSuggesties = () => { setRonde((x) => x + 1); laadVers(); };
  const meerOphalen = async () => {
    if (!alles || meerBezig) return;
    setMeerBezig(true);
    try { await haalMeer(alles); } finally { setMeerBezig(false); }
  };

  const copyList = async () => {
    const text = shortlist.map((s) => `${s.title} (${s.year || '?'})`).join('\n');
    try { await navigator.clipboard.writeText(text); alert(tr('verken.shortlistCopied')); }
    catch { alert(text); }
  };

  const rijTitel = (rij) => {
    switch (rij.type) {
      case 'top': return tr('verken.rowTop');
      case 'seed': return tr('verken.rowSeed', { name: rij.naam });
      case 'oeuvre': return tr('verken.rowOeuvre', { name: rij.naam });
      case 'parels': return tr('verken.rowGems');
      case 'canon': return tr('verken.rowCanon');
      case 'lijst': return tr('verken.rowLijst', { lijst: tr(`verken.lijst${rij.lijst.charAt(0).toUpperCase()}${rij.lijst.slice(1)}`) });
      case 'thema': return rij.themas?.length ? tr('verken.rowTheme', { themes: rij.themas.join(', ') }) : tr('verken.rowThemePlain');
      case 'bubbel': return tr('verken.rowBubble');
      case 'dienst': {
        const d = rij.diensten || [];
        return tr('verken.rowServices', { services: d.length > 2 ? `${d.slice(0, 2).join(', ')} +${d.length - 2}` : d.join(tr('verken.and')) });
      }
      case 'eigen': return rij.naam;
      default: return tr('verken.rowProfile');
    }
  };

  // Eigen rijen beheren
  const opslaanEigen = (r) => {
    const bestaat = eigenRijen.some((x) => x.id === r.id);
    setEigenRijen((lijstR) => (bestaat ? lijstR.map((x) => (x.id === r.id ? r : x)) : [...lijstR, r]));
    setMaker(null);
    setNudge(tr(bestaat ? 'verken.eigenBijgewerkt' : 'verken.eigenToegevoegd', { naam: r.naam }));
  };
  const verwijderEigen = (id) => { setEigenRijen((l) => l.filter((x) => x.id !== id)); setMaker(null); };
  const schuifEigen = (id, richting) => setEigenRijen((l) => {
    const i = l.findIndex((x) => x.id === id);
    const j = i + richting;
    if (i < 0 || j < 0 || j >= l.length) return l;
    const kopie = [...l];
    [kopie[i], kopie[j]] = [kopie[j], kopie[i]];
    return kopie;
  });
  // Een automatische rij vastzetten: "Omdat je X..." wordt "lijkt op X",
  // "Meer van Y" wordt "van Y", en beide wisselen niet meer mee met de dag
  const vastzetten = (rij) => {
    const id = `e${Date.now().toString(36)}`;
    if (rij.type === 'seed') {
      const m = meta[rij.id.slice(5)];
      if (!m?.id) return;
      opslaanEigen({ id, naam: rijTitel(rij), basis: 'film', film: { id: m.id, title: rij.naam, year: m.year } });
    } else if (rij.type === 'oeuvre') {
      const reg = regisseurs.find((r) => r.naam === rij.naam);
      if (!reg?.id) return;
      opslaanEigen({ id, naam: rijTitel(rij), basis: 'maker', maker: { id: reg.id, naam: reg.naam, rol: 'regie' } });
    }
  };
  const kopActie = (rij) => {
    if (rij.type === 'dienst') return kiesDiensten ? null : { label: tr('verken.servicesEdit'), onClick: () => setKiesDiensten(true) };
    if (rij.type === 'eigen') return { label: tr('verken.eigenBewerk'), onClick: () => { setMaker(rij.id); topRef.current?.scrollIntoView?.({ block: 'start' }); } };
    if (rij.type === 'seed' || (rij.type === 'oeuvre' && regisseurs.find((r) => r.naam === rij.naam)?.id)) {
      return { label: tr('verken.eigenVastzetten'), onClick: () => vastzetten(rij) };
    }
    return null;
  };
  const makerPaneel = maker ? (() => {
    const start = maker === 'nieuw' ? null : eigenRijen.find((x) => x.id === maker);
    const i = start ? eigenRijen.findIndex((x) => x.id === start.id) : -1;
    return (
      <EigenRijMaker
        key={maker} start={start} tmdbKey={tmdbKey} mijnDiensten={mijnDiensten} diensten={dienstenKeuze}
        voorstellen={voorstellen}
        onOpslaan={opslaanEigen} onAnnuleer={() => setMaker(null)}
        onVerwijder={start ? () => verwijderEigen(start.id) : undefined}
        onOmhoog={start && i > 0 ? () => schuifEigen(start.id, -1) : undefined}
        onOmlaag={start && i < eigenRijen.length - 1 ? () => schuifEigen(start.id, 1) : undefined}
      />
    );
  })() : null;
  const kiezer = toonKiezer ? (
    <DienstKiezer
      key="kiezer"
      keuze={dienstenKeuze} gekozen={mijnDiensten}
      onOpslaan={(sel) => { setMijnDiensten(sel); setKiesDiensten(false); }}
      onLater={() => { if (kiesDiensten) setKiesDiensten(false); else setKiezerWeg(true); }}
    />
  ) : null;
  const totaalVan = (rij) => gefilterd.filter((f) => degelijk(f) && rij.past(f)).length;

  // De zoekmachine draait op een TMDB-sleutel alleen, zonder verrijkte bieb.
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
    return (
      <div>
        <button className="btn ghost" style={{ marginBottom: 14 }} onClick={() => setOpenFilm(null)}>
          <ArrowLeft size={15} /> {tr('verken.backToVerken')}
        </button>
        <Winner
          film={{ key: `tmdb:${light.id}`, name: light.title, year: light.year, uri: '' }}
          meta={m} context={detail ? tr('verken.fromOutside') : tr('verken.detailsLoading')}
          onShortlist={() => addToShortlist({ ...light, seeds: [], count: 0 })} inShortlist={shortIds.has(light.id)}
          onSkip={mode === 'voorJou' ? () => { skip(light); setOpenFilm(null); } : undefined}
          onGezien={(n) => { gezien(light, n); setOpenFilm(null); }}
          onSimilar={() => openSimilar(light)}
          onWantScores={!app.omdbKeys.length ? app.goSetup : undefined}
        />
      </div>
    );
  })() : null;

  // De lijst met uitgebreide kaarten (Alles bekijken, of de kleine-poel-weergave)
  const lijstWeergave = (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        {alles
          ? <h2 className="fy-alles-title">{rijTitel(alles)} <span className="cnt">{lijst.length}</span></h2>
          : <span />}
        <select className="field" style={{ width: 'auto' }} value={sortAlles} onChange={(e) => setSortAlles(e.target.value)} aria-label={tr('bieb.sortLabel')}>
          {SORTS.map(([v, k]) => <option key={v} value={v}>{tr(k)}</option>)}
        </select>
      </div>
      {lijst.slice(0, shown).map((r, i) => (
        <RecCard
          key={r.id} r={r} i={i} sterk={taste.sterk} seededOnRatings={seededOnRatings}
          detail={detailCache.current.get(r.id) || (r.jwLink || r.imdbId ? { jwLink: r.jwLink, imdbId: r.imdbId } : undefined)}
          tmdbKey={tmdbKey} voorkeur={voorkeur}
          receptOpen={receptOpen === r.id} onToggleRecept={(id) => setReceptOpen(receptOpen === id ? null : id)}
          onOpen={openDetail} onShortlist={addToShortlist} onSkip={skip} onSimilar={openSimilar} onGezien={gezien}
        />
      ))}
      {lijst.length > shown && (
        <button className="btn" style={{ justifyContent: 'center' }} onClick={() => setShown(shown + 12)}>{tr('verken.showMore', { count: lijst.length - shown })}</button>
      )}
      {tmdbKey && alles && alles.type !== 'oeuvre' && (
        <button className="btn" style={{ justifyContent: 'center' }} onClick={meerOphalen} disabled={meerBezig}>
          <RefreshCw size={14} className={meerBezig ? 'spin' : ''} /> {meerBezig ? tr('verken.tappingTmdb') : tr('verken.fetchMore')}
        </button>
      )}
    </div>
  );

  const voorJou = (() => {
    if (!recs.length) {
      if (blendBusy) {
        // Eerste keer laden: een rustig skelet in plaats van verspringende rijen
        return (
          <div className="rec-rows" aria-busy="true">
            <p className="fy-busy">{tr('verken.blending')}</p>
            {[0, 1, 2].map((n) => (
              <section key={n} aria-hidden="true">
                <div className="skel skel-head" />
                <div className="rec-strip">{Array.from({ length: 7 }, (_, j) => <div key={j} className="skel skel-tile" />)}</div>
              </section>
            ))}
          </div>
        );
      }
      return (
        <div className="empty card">
          <p className="big">{tr('verken.forNowEmpty')}</p>
          <p>{tr('verken.allRatedEmpty')}</p>
          {tmdbKey && (
            <button className="btn primary" style={{ marginTop: 14 }} onClick={laadVers} disabled={versLaden}>
              {versLaden ? tr('verken.tapping') : tr('verken.loadFresh')}
            </button>
          )}
        </div>
      );
    }
    if (snel) {
      return (
        <SnelBeoordelen
          kandidaten={snelLijst} seededOnRatings={seededOnRatings}
          onWil={addToShortlist} onNiet={(r) => skip(r, { vraag: false })} onGezien={gezien}
          onSluit={() => setSnel(false)}
        />
      );
    }
    if (alles) {
      return (
        <div>
          <button className="btn ghost" style={{ marginBottom: 12 }} onClick={() => setAlles(null)}>
            <ArrowLeft size={15} /> {tr('verken.backToForYou')}
          </button>
          {lijstWeergave}
        </div>
      );
    }
    return (
      <div>
        <div className="fy-toolbar">
          <select className="field" style={{ width: 'auto' }} value={genre} onChange={(e) => setGenre(e.target.value)} aria-label={tr('verken.genreFilter')}>
            <option value="">{tr('verken.allGenres')}</option>
            {GENRES.map((g) => <option key={g.id} value={g.id}>{lang === 'nl' ? g.nl : g.en}</option>)}
          </select>
          <select className="field" style={{ width: 'auto' }} value={dienst} onChange={(e) => setDienst(e.target.value)} aria-label={tr('verken.serviceFilter')}>
            <option value="">{tr('verken.serviceAny')}</option>
            <option value="*">{tr('verken.serviceStreaming')}</option>
            {mijnDiensten.length > 0 && <option value="~mijn">{tr('verken.serviceMine')}</option>}
            {diensten.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <button className={`chip ${kort ? 'on-o' : ''}`} onClick={() => setKort((v) => !v)} aria-pressed={kort}>{tr('verken.filterShort')}</button>
          {tmdbKey && (
            <button className="btn ghost" onClick={andereSuggesties} disabled={versLaden}>
              <RefreshCw size={14} className={versLaden ? 'spin' : ''} /> {tr('verken.otherSuggestions')}
            </button>
          )}
          {tmdbKey && (
            <button className={`btn ghost ${maker === 'nieuw' ? 'actief' : ''}`} onClick={() => setMaker(maker === 'nieuw' ? null : 'nieuw')} aria-expanded={maker === 'nieuw'}>
              <Plus size={14} /> {tr('verken.eigenNieuw')}
            </button>
          )}
          <button className="btn ghost" onClick={() => { setSnel(true); setLaatsteSkip(null); topRef.current?.scrollIntoView?.({ block: 'start' }); }} title={tr('verken.snelUitleg')}>
            <Layers size={14} /> {tr('verken.snelKnop')}
          </button>
          {(blendBusy || wachtOpDetails) && (
            <span className="fy-busy">{wachtOpDetails ? tr('verken.detailsLoadingFilter') : tr('verken.blending')}</span>
          )}
        </div>
        {makerPaneel}
        {vanavond ? (
          <Vanavond
            keuze={vanavond} detail={vanavondDetail?.id === vanavondId ? vanavondDetail.d : null}
            seededOnRatings={seededOnRatings}
            onOpen={openDetail} onShortlist={addToShortlist} onSkip={skip} onGezien={gezien}
            onAnder={() => setVanavondWeg((s) => new Set(s).add(vanavondId))}
          />
        ) : detailsLaden && !filterActief ? <div className="skel skel-vanavond" aria-hidden="true" /> : null}
        {weergaveRijen.length > 0 ? (
          <div className="rec-rows">
            {weergaveRijen.map((rij, i) => (
              <Fragment key={rij.id}>
                {/* de dienstenkiezer staat direct onder de eerste rij */}
                {i === 1 && kiezer}
                {rij.type === 'eigen' && rij.films.length === 0 ? (
                  // een eigen rij zonder (passende) films: laat zien wat er aan de hand is
                  <section className="rec-row">
                    <div className="rec-row-head">
                      <h3>{rij.naam}</h3>
                      <button type="button" className="row-actie" onClick={() => setMaker(rij.id)}>{tr('verken.eigenBewerk')}</button>
                    </div>
                    <p className="rij-leeg">{eigenGeladen(rij.id) && !wachtOpDetails ? tr('verken.eigenLeeg') : tr('verken.eigenLaden')}</p>
                  </section>
                ) : (
                  <RecRow
                    titel={rijTitel(rij)} rij={rij} totaal={totaalVan(rij)} voorkeur={voorkeur} actie={kopActie(rij)}
                    onAlles={openAlles} onOpen={openDetail} onShortlist={addToShortlist} onSkip={skip} onGezien={gezien}
                  />
                )}
              </Fragment>
            ))}
            {weergaveRijen.length === 1 && kiezer}
          </div>
        ) : persoonlijk.length > 0 ? lijstWeergave : vanavond ? null : (
          <div className="empty card">
            <p className="big">{wachtOpDetails ? tr('verken.detailsLoadingFilter') : tr('verken.filterEmpty')}</p>
            <button className="btn" style={{ marginTop: 12 }} onClick={wisFilters}>{tr('zoek.clearFilters')}</button>
          </div>
        )}
      </div>
    );
  })();

  return (
    <div ref={topRef}>
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
          {shortlist.length > 0 && (
            <button className={`chip ${shortOpen ? 'on-b' : ''}`} onClick={() => setShortOpen((v) => !v)} aria-expanded={shortOpen}>
              {tr('verken.shortlistToggle', { count: shortlist.length })}
            </button>
          )}
        </div>

        {shortOpen && shortlist.length > 0 && (
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
            <p style={{ color: 'var(--fog-dim)', fontSize: 12.5, marginTop: 10 }}>{tr('zoek.lbImportHint')}</p>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className={`chip ${mode === 'voorJou' ? 'on-b' : ''}`} onClick={() => setMode('voorJou')}>{tr('verken.tabForYou')}</button>
          <button className={`chip ${mode === 'zoeken' ? 'on-b' : ''}`} onClick={() => setMode('zoeken')}>{tr('verken.tabSearch')}</button>
          {/* Verberg al gezien: Voor jou doet dat altijd, in Zoeken kies je zelf */}
          <button
            className={`chip verberg-gezien ${mode === 'voorJou' || verbergGezien ? 'on-g' : ''}`}
            aria-pressed={mode === 'voorJou' || verbergGezien}
            title={mode === 'voorJou' ? tr('verken.gezienAltijdWeg') : tr('verken.verbergGezienTitel')}
            onClick={() => (mode === 'voorJou' ? setNudge(tr('verken.gezienAltijdWeg')) : setVerbergGezien((v) => !v))}
          >
            <EyeOff size={13} /> {tr('verken.verbergGezien')}
          </button>
        </div>

        {mode === 'zoeken' && (
          <Zoekmachine
            app={app} taste={taste} openDetail={openDetail}
            addToShortlist={addToShortlist} shortIds={shortIds}
            ownIdsAll={ownIdsAll} ownKeysAll={ownKeysAll} seenIds={seenIds}
            isGezien={isGezien} isBekend={isBekend} verbergGezien={verbergGezien}
            onBewaarRij={(r) => opslaanEigen({ ...normaliseer(r), id: `e${Date.now().toString(36)}`, naam: autoNaam(r, { tr }) })}
          />
        )}

        {/* Meldingen onderin beeld, zodat je ze ziet waar je ook scrolt */}
        {/* via een portal: de tab-animatie laat een transform achter die position: fixed breekt */}
        {createPortal(!snel && laatsteSkip ? (
          <div className="notice fy-toast" role="status">
            {laatsteSkip.stap === 'reden' ? (
              <>
                <span className="fy-toast-tekst">
                  {genreNaam(laatsteSkip.r.genre_ids) ? `${tr('verken.nudgeLess', { genre: genreNaam(laatsteSkip.r.genre_ids) })} ` : ''}
                  {tr('verken.waaromNiet')}
                </span>
                <span className="reden-chips">
                  <button type="button" className="chip" onClick={() => geefReden('genre')}>{tr('verken.redenGenre')}</button>
                  <button type="button" className="chip" onClick={() => geefReden('mainstream')}>{tr('verken.redenMainstream')}</button>
                  {regisseurVan(laatsteSkip.r) && (
                    <button type="button" className="chip" onClick={() => geefReden('regisseur')}>{tr('verken.redenRegisseur', { name: regisseurVan(laatsteSkip.r) })}</button>
                  )}
                  <button type="button" className="chip" onClick={() => geefReden('gezien')}>{tr('verken.redenGezien')}</button>
                </span>
              </>
            ) : (
              <>
                <span className="fy-toast-tekst">{tr('verken.gezienVraag', { title: laatsteSkip.r.title })}</span>
                <span className="reden-chips">
                  <Sterren onKies={(n) => gezien(laatsteSkip.r, n)} />
                  <button type="button" className="linkbtn" onClick={() => gezien(laatsteSkip.r, null)}>{tr('verken.zonderSterren')}</button>
                </span>
              </>
            )}
            <button type="button" className="fy-toast-sluit" onClick={() => setLaatsteSkip(null)} aria-label={tr('verken.sluiten')}><X size={14} /></button>
          </div>
        ) : !snel && nudge ? (
          <div className="notice fy-toast" role="status">
            <span className="fy-toast-tekst">{nudge}</span>
          </div>
        ) : null, document.body)}

        {mode === 'voorJou' && voorJou}

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
