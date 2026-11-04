import { useMemo, useState, useRef, useEffect } from 'react';
import { X, Download, Copy, RotateCcw, ArrowLeft, RefreshCw } from 'lucide-react';
import { GENRES, genreLabelById, fetchDetailById } from '../lib/tmdb.js';
import { sorteerOpSterkte } from '../lib/rows.js';
import { bouwRecept, degelijk, pastFilter, RAAM } from '../lib/foryou.js';
import { useForYou } from '../lib/useForYou.js';
import { fetchExtRatings } from '../lib/omdb.js';
import { shortlistToCsv, downloadText } from '../lib/csv.js';
import { useT } from '../lib/i18n.js';
import { useLS } from '../lib/storage.js';
import Zoekmachine from './Zoekmachine.jsx';
import Winner from '../components/Winner.jsx';
import RecRow from '../components/RecRow.jsx';
import RecCard from '../components/RecCard.jsx';

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
  const { taste, recs, seededOnRatings, seedFilms, regisseurs, blendBusy, versLaden, laadVers, haalMeer, vraagDetails, detailsLaden } = useForYou(app, mode === 'voorJou');

  const topRef = useRef(null);
  const [openFilm, setOpenFilm] = useState(null); // { light, detail? }
  const detailCache = useRef(new Map());
  const [nudge, setNudge] = useState(null);
  useEffect(() => {
    if (!nudge) return undefined;
    const t = setTimeout(() => setNudge(null), 3500);
    return () => clearTimeout(t);
  }, [nudge]);
  const [showSkipped, setShowSkipped] = useState(false);
  const [shortOpen, setShortOpen] = useState(false);
  // Filters op Voor jou. De streamingkeuze wordt onthouden (je diensten
  // wisselen zelden); genre en kort gelden per bezoek.
  const [genre, setGenre] = useState('');
  const [kort, setKort] = useState(false);
  const [dienst, setDienst] = useLS('verkenDienst', ''); // '' | '*' (elke dienst) | dienstnaam
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
    () => (filterActief ? recs.filter((f) => pastFilter(f, { genre, kort, dienst })) : recs),
    [recs, filterActief, genre, kort, dienst],
  );
  // Diensten om op te filteren: wat je eigen bibliotheek en de kandidaten
  // het vaakst aanbieden in jouw regio (zoals bij Pick)
  const diensten = useMemo(() => {
    const tel = {};
    Object.values(meta).forEach((m) => m?.flat?.forEach((p) => { tel[p] = (tel[p] || 0) + 1; }));
    recs.forEach((f) => f.flat?.forEach((p) => { tel[p] = (tel[p] || 0) + 1; }));
    const top = Object.entries(tel).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([p]) => p);
    return dienst && dienst !== '*' && !top.includes(dienst) ? [...top, dienst] : top;
  }, [meta, recs, dienst]);
  const rijen = useMemo(
    () => bouwRecept(gefilterd, { seedFilms, regisseurs: regisseurs.map((r) => r.naam), taste, ronde }),
    [gefilterd, seedFilms, regisseurs, taste, ronde],
  );

  // De lijstweergave: "Alles bekijken" van één rij (live uit de kandidaten,
  // dus met wat je net ophaalde en zonder wat je afwees), of alles als er
  // te weinig kandidaten voor rijen zijn.
  const lijstModus = !!alles || (rijen.length === 0 && gefilterd.length > 0);
  const lijst = useMemo(() => {
    if (!lijstModus) return [];
    const basis = sorteerOpSterkte(alles ? gefilterd.filter(degelijk).filter(alles.past) : gefilterd);
    if (sortAlles === 'match') return [...basis].sort((a, b) => b.match - a.match);
    if (sortAlles === 'score') return [...basis].sort((a, b) => (b.vote || 0) - (a.vote || 0));
    if (sortAlles === 'nieuw') return [...basis].sort((a, b) => (b.year || 0) - (a.year || 0));
    if (sortAlles === 'oud') return [...basis].sort((a, b) => (a.year || 9999) - (b.year || 9999));
    return basis;
  }, [lijstModus, alles, gefilterd, sortAlles]);

  // Details ophalen voor wat je ziet plus de sterkste kandidaten (met een
  // filter aan wat ruimer, anders blijven de gefilterde rijen leeg).
  const nodigIds = useMemo(() => {
    if (mode !== 'voorJou') return [];
    const ids = new Set();
    sorteerOpSterkte(recs.filter(degelijk)).slice(0, filterActief ? 150 : 60).forEach((f) => ids.add(f.id));
    // thema-vondsten: pas met trefwoorden blijkt of ze echt je thema's delen
    recs.filter((f) => f.bronnen.includes('thema')).slice(0, 40).forEach((f) => ids.add(f.id));
    rijen.forEach((rij) => rij.films.slice(0, RAAM).forEach((f) => ids.add(f.id)));
    lijst.slice(0, shown).forEach((f) => ids.add(f.id));
    return [...ids];
  }, [mode, recs, rijen, lijst, shown, filterActief]);
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

  const genreNaam = (ids) => (ids || []).map((id) => genreLabelById(id)).filter(Boolean)[0];
  const addToShortlist = (r) => {
    if (shortIds.has(r.id)) return;
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
      case 'thema': return rij.themas?.length ? tr('verken.rowTheme', { themes: rij.themas.join(', ') }) : tr('verken.rowThemePlain');
      case 'bubbel': return tr('verken.rowBubble');
      default: return tr('verken.rowProfile');
    }
  };
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
          tmdbKey={tmdbKey} dienst={dienst}
          receptOpen={receptOpen === r.id} onToggleRecept={(id) => setReceptOpen(receptOpen === id ? null : id)}
          onOpen={openDetail} onShortlist={addToShortlist} onSkip={skip} onSimilar={openSimilar}
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
            {diensten.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <button className={`chip ${kort ? 'on-o' : ''}`} onClick={() => setKort((v) => !v)} aria-pressed={kort}>{tr('verken.filterShort')}</button>
          {tmdbKey && (
            <button className="btn ghost" onClick={andereSuggesties} disabled={versLaden}>
              <RefreshCw size={14} className={versLaden ? 'spin' : ''} /> {tr('verken.otherSuggestions')}
            </button>
          )}
          {(blendBusy || wachtOpDetails) && (
            <span className="fy-busy">{wachtOpDetails ? tr('verken.detailsLoadingFilter') : tr('verken.blending')}</span>
          )}
        </div>
        {rijen.length > 0 ? (
          <div className="rec-rows">
            {rijen.map((rij) => (
              <RecRow
                key={rij.id} titel={rijTitel(rij)} rij={rij} totaal={totaalVan(rij)} dienst={dienst}
                onAlles={openAlles} onOpen={openDetail} onShortlist={addToShortlist} onSkip={skip}
              />
            ))}
          </div>
        ) : gefilterd.length > 0 ? lijstWeergave : (
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

        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <button className={`chip ${mode === 'voorJou' ? 'on-b' : ''}`} onClick={() => setMode('voorJou')}>{tr('verken.tabForYou')}</button>
          <button className={`chip ${mode === 'zoeken' ? 'on-b' : ''}`} onClick={() => setMode('zoeken')}>{tr('verken.tabSearch')}</button>
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
