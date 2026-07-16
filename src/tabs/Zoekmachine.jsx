import { useState, useMemo } from 'react';
import { useT } from '../lib/i18n.js';
import { Search, Clapperboard, Plus, Gem, Wand2, X, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { IMG, GENRES, genreLabelById, genreLabel, discover, searchMovies, searchPersons, personFilms } from '../lib/tmdb.js';
import { matchScore } from '../lib/taste.js';
import { nossyScore, fmtScore } from '../lib/pick.js';
import { fetchExtRatings } from '../lib/omdb.js';
import { fetchDetailById } from '../lib/tmdb.js';
import { filmKey } from '../lib/storage.js';

// Snelknoppen voor de periode; vullen de vrije van/tot-velden
const DECADE_PRESETS = [[2020, 2029, "'20"], [2010, 2019, "'10"], [2000, 2009, "'00"], [1990, 1999, "'90"], [1980, 1989, "'80"], [1970, 1979, "'70"], [1960, 1969, "'60"], ['', 1959, '<1960']];
// Ruime talenlijst (ISO 639-1). Bovenaan de snelfilters, daaronder alfabetisch
// op Nederlandse naam — zodat je ook Noors, Tsjechisch, Thai enz. kunt kiezen.
// Taalcodes (ISO 639-1); namen komen runtime uit Intl.DisplayNames in de UI-taal.
const LANG_CODES = ['en', 'nl', 'ar', 'bn', 'bs', 'bg', 'ca', 'zh', 'yue', 'da', 'de', 'et', 'fi', 'fr', 'ka', 'el', 'he', 'hi', 'hu', 'ga', 'is', 'id', 'it', 'ja', 'ko', 'hr', 'lv', 'lt', 'ml', 'no', 'fa', 'pl', 'pt', 'ro', 'ru', 'sr', 'sk', 'sl', 'es', 'ta', 'te', 'th', 'cs', 'tr', 'uk', 'vi', 'sv'];

const SORTS = [['vote_average.desc', 'bestScore'], ['popularity.desc', 'popular'], ['primary_release_date.desc', 'newest'], ['primary_release_date.asc', 'oldest']];
const SORT_NOSSY = 'nossy';
const RUNTIMES = [['', 'anyDuration'], [60, 'runtime60'], [90, 'runtime90'], [120, 'runtime120']];
// Snelkoppelingen voor de stemmen-band; vullen simpelweg de twee invulvelden
// Geijkt op TMDB, waar veel minder gestemd wordt dan op IMDb: Inception ~40k
// is zowat het plafond, Shawshank 31k, Blade Runner 15k, Nomadland/Eraserhead
// 3k (volwaardig beoordeeld), Limbo 121 (echt niche).
const FAME_PRESETS = [
  ['diep', 'diep', 30, 400],
  ['radar', 'radar', 400, 2500],
  ['degelijk', 'degelijk', 2500, 10000],
  ['breed', 'breed', 10000, ''],
];

export default function Zoekmachine({ app, taste, openDetail, addToShortlist, shortIds, ownIdsAll, ownKeysAll }) {
  const { t: tr, lang: uiLang } = useT();
  // Taalnamen in de UI-taal via de browser (Intl); geen woordenboek nodig.
  const langName = useMemo(() => {
    let dn; try { dn = new Intl.DisplayNames([uiLang], { type: 'language' }); } catch { dn = null; }
    return (code) => { try { return (dn && dn.of(code)) || code.toUpperCase(); } catch { return code.toUpperCase(); } };
  }, [uiLang]);
  const langOptions = useMemo(() => ([
    ['alle', tr('zoek.allLangs')],
    ['niet-en', tr('zoek.notEnglish')],
    ...LANG_CODES.map((code) => [code, langName(code)]).sort((a, b) => a[1].localeCompare(b[1], uiLang)),
  ]), [uiLang, langName, tr]);
  const { settings } = app;
  const [tekst, setTekst] = useState('');
  const [genres, setGenres] = useState([]);
  const [excl, setExcl] = useState([]);
  const [jaarVan, setJaarVan] = useState('');
  const [jaarTot, setJaarTot] = useState('');
  const [lang, setLang] = useState('alle');
  const [minVotes, setMinVotes] = useState('');
  const [maxVotes, setMaxVotes] = useState('');
  const [minScore, setMinScore] = useState(0);
  const [runtime, setRuntime] = useState('');
  const [sortBy, setSortBy] = useState('popularity.desc');
  const [hideKnown, setHideKnown] = useState(false);
  const [toonFilters, setToonFilters] = useState(true);

  const [res, setRes] = useState(null); // { films, totalResults, totalPages, tekstZoek }
  const [personen, setPersonen] = useState([]);
  const [maker, setMaker] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [scores, setScores] = useState({}); // tmdbId -> ext (on-demand Nossy)
  const [scoresLaden, setScoresLaden] = useState(false);

  // Nossy-scores voor de zichtbare resultaten ophalen (kost OMDb-calls, dus opt-in)
  const laadScores = async () => {
    if (!app.settings.tmdbKey || !app.omdbKeys.length || scoresLaden) return;
    setScoresLaden(true);
    const teDoen = lijst.filter((r) => !(r.id in scores)).slice(0, 20);
    for (const r of teDoen) {
      try {
        const d = await fetchDetailById(r.id, app.settings.tmdbKey);
        let ext;
        for (const k of app.omdbKeys) {
          try { ext = await fetchExtRatings(d, { name: r.title, year: r.year }, k); if (ext) break; } catch { /* volgende */ }
        }
        if (ext) setScores((prev) => ({ ...prev, [r.id]: ext }));
      } catch { /* sla over */ }
    }
    setScoresLaden(false);
  };

  const criteria = () => {
    return {
      minScore: minScore || undefined,
      minVotes: minVotes !== '' ? +minVotes : undefined,
      maxVotes: maxVotes !== '' ? +maxVotes : undefined,
      genreIds: genres,
      excludeGenreIds: excl,
      yearFrom: jaarVan !== '' ? +jaarVan : undefined,
      yearTo: jaarTot !== '' ? +jaarTot : undefined,
      lang,
      minRuntime: runtime || undefined,
      sortBy: sortBy === SORT_NOSSY ? 'vote_average.desc' : sortBy,
    };
  };

  // Query-omschrijving voor de transparantieregel
  const queryTekst = () => {
    const d = [];
    if (tekst.trim()) d.push(`"${tekst.trim()}"`);
    if (genres.length) d.push(genres.map((id) => genreLabelById(id)).filter(Boolean).join(' + '));
    if (excl.length) d.push(tr('zoek.qWithout', { genres: excl.map((id) => genreLabelById(id)).filter(Boolean).join('/') }));
    if (jaarVan !== '' || jaarTot !== '') d.push(`${jaarVan || '…'}–${jaarTot || tr('zoek.qNow')}`);
    if (lang !== 'alle') d.push(langOptions.find((x) => x[0] === lang)?.[1]);
    if (minVotes !== '' || maxVotes !== '') {
      const a = minVotes !== '' ? (+minVotes).toLocaleString('nl-NL') : '0';
      const b = maxVotes !== '' ? (+maxVotes).toLocaleString('nl-NL') : '∞';
      d.push(tr('zoek.qVotesRange', { a, b }));
    }
    if (minScore) d.push(`${String(minScore).replace('.', ',')}+`);
    if (runtime) d.push(`${runtime}+ min`);
    return d.length ? d.join(' · ') : tr('zoek.qAll');
  };

  const zoek = async (targetPage = 1) => {
    if (!settings.tmdbKey) { alert(tr('zoek.needKey')); return; }
    setLoading(true);
    setMaker(null);
    try {
      if (tekst.trim()) {
        // TMDB kan tekst + filters niet combineren: tekst → search, criteria als zeef
        const [films, ppl] = await Promise.all([
          searchMovies(settings.tmdbKey, tekst.trim()),
          targetPage === 1 ? searchPersons(settings.tmdbKey, tekst.trim()) : Promise.resolve(personen),
        ]);
        setRes({ films, totalResults: films.length, totalPages: 1, tekstZoek: true });
        setPersonen(ppl);
        setPage(1);
      } else {
        const d = await discover(settings.tmdbKey, { ...criteria(), page: targetPage });
        setRes({ films: d.results, totalResults: d.totalResults, totalPages: d.totalPages, tekstZoek: false });
        setPersonen([]);
        setPage(targetPage);
      }
    } catch (e) { alert(`Zoeken liep vast: ${e.message}`); }
    setLoading(false);
  };

  const openMaker = async (p) => {
    setLoading(true);
    try {
      const films = await personFilms(settings.tmdbKey, p.id);
      setMaker({ naam: p.name, dept: p.dept, films });
      setRes(null); setPersonen([]);
    } catch (e) { alert(`Filmografie laden liep vast: ${e.message}`); }
    setLoading(false);
  };

  // Presets: de oude Pareljacht en een profiel-vuller, nu als knop
  const presetParel = () => { setTekst(''); setMinVotes(50); setMaxVotes(800); setMinScore(7.0); setSortBy('vote_average.desc'); setRuntime(60); };
  const presetSmaak = () => {
    setTekst('');
    const topG = Object.entries(taste.genres).filter(([, v]) => v > 0.3).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([en]) => GENRES.find((g) => g.en === en)?.id).filter(Boolean);
    const topD = Object.entries(taste.decades).sort((a, b) => b[1] - a[1])[0]?.[0];
    setGenres(topG);
    if (topD) { setJaarVan(+topD); setJaarTot(+topD + 9); } else { setJaarVan(''); setJaarTot(''); }
    if (taste.nietEngels >= 0.35) setLang('niet-en');
    setMinVotes(''); setMaxVotes(''); setMinScore(6.5);
    setSortBy('vote_average.desc');
  };
  const wis = () => { setTekst(''); setGenres([]); setExcl([]); setJaarVan(''); setJaarTot(''); setLang('alle'); setMinVotes(''); setMaxVotes(''); setMinScore(0); setRuntime(''); setSortBy('popularity.desc'); setRes(null); setMaker(null); setPersonen([]); };

  const toggle = (setter, max) => (id) => setter((a) => (a.includes(id) ? a.filter((x) => x !== id) : (max ? [...a, id].slice(-max) : [...a, id])));

  // Client-side: bij tekstzoek de criteria als zeef; overal match-score + bekend/verberg
  const verwerk = (films) => {
    let list = films.map((r) => {
      const ext = scores[r.id] || (app.meta && Object.values(app.meta).find((m) => m && m.id === r.id)?.ext);
      const withExt = ext ? { ...r, ext } : r;
      const ns = nossyScore(withExt);
      return { ...withExt, ...matchScore(r, taste), nossy: ns, bekend: ownIdsAll.has(r.id) || ownKeysAll.has(filmKey(r.title, r.year)) };
    });
    if (res?.tekstZoek) {
      list = list.filter((r) => {
        if (genres.length && !genres.some((g) => (r.genre_ids || []).includes(g))) return false;
        if (excl.length && excl.some((g) => (r.genre_ids || []).includes(g))) return false;
        if (jaarVan !== '' && (!r.year || r.year < +jaarVan)) return false;
        if (jaarTot !== '' && (!r.year || r.year > +jaarTot)) return false;
        if (lang === 'niet-en' && r.lang === 'en') return false;
        if (lang !== 'alle' && lang !== 'niet-en' && r.lang !== lang) return false;
        if (minVotes !== '' && (r.votes == null || r.votes < +minVotes)) return false;
        if (maxVotes !== '' && (r.votes == null || r.votes > +maxVotes)) return false;
        if (minScore && (!r.vote || r.vote < minScore)) return false;
        return true;
      });
    }
    if (hideKnown) list = list.filter((r) => !r.bekend);
    return list;
  };

  let lijst = maker ? verwerk(maker.films) : res ? verwerk(res.films) : [];
  if (sortBy === SORT_NOSSY) {
    lijst = [...lijst].sort((a, b) => (b.nossy ?? -1) - (a.nossy ?? -1));
  }
  const chip = (on) => `chip ${on ? 'on' : ''}`;

  return (
    <div>
      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 13, color: 'var(--fog-dim)' }} aria-hidden="true" />
          <input
            className="field" style={{ paddingLeft: 38, fontSize: 15 }}
            placeholder={tr('zoek.placeholder')}
            value={tekst} aria-label={tr('zoek.searchLabel')}
            onChange={(e) => setTekst(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && zoek(1)}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: toonFilters ? 14 : 0, alignItems: 'center' }}>
          <button className="btn primary" onClick={() => zoek(1)} disabled={loading}><Search size={15} /> {loading ? tr('zoek.searching') : tr('common.search')}</button>
          <button className="btn ghost" onClick={presetSmaak} title={tr('zoek.tasteTitle')}><Wand2 size={14} /> {tr('zoek.onMyTaste')}</button>
          <button className="btn ghost" onClick={presetParel} title={tr('zoek.pearlTitle')}><Gem size={14} /> {tr('zoek.pearlPreset')}</button>
          <button className="btn ghost" onClick={() => setToonFilters(!toonFilters)}><SlidersHorizontal size={14} /> {toonFilters ? tr('common.hideFilters') : tr('common.showFilters')}</button>
          <button className="btn ghost" onClick={wis}><X size={14} /> Wis</button>
        </div>

        {toonFilters && (
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
            <p className="label" style={{ marginBottom: 8 }}>{tr('zoek.genres')}</p>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 12 }}>
              {GENRES.map((g) => (
                <button key={g.id} className={chip(genres.includes(g.id))} style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => toggle(setGenres, 3)(g.id)}>{genreLabel(g)}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--fog)' }}>{tr('zoek.periodLabel')}</span>
              <input
                className="field" type="number" min="1880" max="2100" style={{ width: 90 }} placeholder={tr('avond.from')}
                value={jaarVan} aria-label={tr('avond.yearFrom')}
                onChange={(e) => setJaarVan(e.target.value === '' ? '' : +e.target.value)}
              />
              <span style={{ color: 'var(--fog-dim)' }}>–</span>
              <input
                className="field" type="number" min="1880" max="2100" style={{ width: 90 }} placeholder={tr('avond.to')}
                value={jaarTot} aria-label={tr('avond.yearTot')}
                onChange={(e) => setJaarTot(e.target.value === '' ? '' : +e.target.value)}
              />
              {DECADE_PRESETS.map(([lo, hi, label]) => (
                <button key={label} className="chip" style={{ fontSize: 12, padding: '4px 9px' }} onClick={() => { setJaarVan(lo); setJaarTot(hi); }}>{label}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
              <select className="field" style={{ width: 'auto' }} value={lang} onChange={(e) => setLang(e.target.value)} aria-label={tr('zoek.language')}>
                {langOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <select className="field" style={{ width: 'auto' }} value={minScore} onChange={(e) => setMinScore(+e.target.value)} aria-label={tr('zoek.minScoreLabel')}>
                <option value={0}>{tr('common.anyScore')}</option>
                {[6.0, 6.5, 7.0, 7.5, 8.0].map((s) => <option key={s} value={s}>{String(s).replace('.', ',')}+</option>)}
              </select>
              <select className="field" style={{ width: 'auto' }} value={runtime} onChange={(e) => setRuntime(e.target.value ? +e.target.value : '')} aria-label={tr('zoek.runtime')}>
                {RUNTIMES.map(([v, l]) => <option key={l} value={v}>{l === 'anyDuration' ? tr('common.anyDuration') : tr(`zoek.${l}`)}</option>)}
              </select>
              <select className="field" style={{ width: 'auto' }} value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label={tr('bieb.sortLabel')}>
                {SORTS.map(([v, l]) => <option key={v} value={v}>{tr(`sort.${l}`)}</option>)}
                <option value={SORT_NOSSY}>{tr('sort.nossyScore')}</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
              <span style={{ fontSize: 13, color: 'var(--fog)' }}>{tr('zoek.votesLabel')}</span>
              <input
                className="field" type="number" min="0" style={{ width: 110 }} placeholder={tr('zoek.min')}
                value={minVotes} aria-label={tr('zoek.minVotes')}
                onChange={(e) => setMinVotes(e.target.value === '' ? '' : Math.max(0, +e.target.value))}
              />
              <span style={{ color: 'var(--fog-dim)' }}>–</span>
              <input
                className="field" type="number" min="0" style={{ width: 110 }} placeholder={tr('zoek.max')}
                value={maxVotes} aria-label={tr('zoek.maxVotes')}
                onChange={(e) => setMaxVotes(e.target.value === '' ? '' : Math.max(0, +e.target.value))}
              />
              <span style={{ fontSize: 12, color: 'var(--fog-dim)' }}>·</span>
              {FAME_PRESETS.map(([id, label, lo, hi]) => (
                <button key={id} className="chip" style={{ fontSize: 12, padding: '4px 9px' }} onClick={() => { setMinVotes(lo); setMaxVotes(hi); }} title={`${lo.toLocaleString()}${hi ? `–${(+hi).toLocaleString()}` : '+'}`}>{tr(`zoek.${label}`)}</button>
              ))}
            </div>
            {excl.length > 0 && (
              <p style={{ fontSize: 12, color: 'var(--fog-dim)', marginTop: 10 }}>{tr('zoek.excluded', { genres: excl.map((id) => genreLabelById(id)).join(', ') })} \u2014 <button className="linkbtn" onClick={() => setExcl([])}>{tr('zoek.wis')}</button></p>
            )}
          </div>
        )}
      </div>

      {personen.length > 0 && !maker && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--fog-dim)' }}>{tr('zoek.makers')}</span>
          {personen.map((p) => (
            <button key={p.id} className="chip on-b" onClick={() => openMaker(p)}>{p.name}{p.dept === 'Directing' ? ` (${tr('zoek.director')})` : p.dept === 'Acting' ? ` (${tr('zoek.actor')})` : ''}</button>
          ))}
        </div>
      )}

      {(res || maker) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          <p style={{ fontSize: 13, color: 'var(--fog)' }}>
            {maker ? (
              <><strong style={{ color: 'var(--paper)' }}>{tr('zoek.filmsByLine', { naam: maker.naam })}</strong> \u00b7 {tr('zoek.ofCount', { shown: lijst.length, total: maker.films.length })}</>
            ) : (
              <><strong style={{ color: 'var(--paper)' }}>{queryTekst()}</strong> \u2014 {res.tekstZoek ? tr('zoek.resCount', { count: lijst.length }) : tr('zoek.resPage', { total: res.totalResults.toLocaleString(), page: page, pages: res.totalPages })}</>
            )}
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {app.omdbKeys.length > 0 && (
              <button className="btn ghost" style={{ fontSize: 12 }} onClick={laadScores} disabled={scoresLaden} title="Haalt IMDb/Metacritic-scores op voor de zichtbare resultaten (kost OMDb-tegoed)">
                {scoresLaden ? tr('zoek.loadingScores') : tr('zoek.loadNossy')}
              </button>
            )}
            <button className={chip(hideKnown ? 'on-g' : '')} style={{ fontSize: 12 }} onClick={() => setHideKnown(!hideKnown)}>{tr('zoek.hideKnown')}</button>
          </div>
        </div>
      )}

      {res && lijst.length === 0 && !loading && (() => {
        const actief = [];
        if (genres.length) actief.push(tr('zoek.fGenre'));
        if (excl.length) actief.push(tr('zoek.fExcl'));
        if (jaarVan !== '' || jaarTot !== '') actief.push(tr('zoek.fPeriod'));
        if (lang !== 'alle') actief.push(tr('zoek.fLang'));
        if (minVotes !== '' || maxVotes !== '') actief.push(tr('zoek.fVotes'));
        if (minScore) actief.push(tr('zoek.fScore'));
        if (runtime) actief.push(tr('zoek.fDuur'));
        if (hideKnown) actief.push(tr('zoek.fHide'));
        const raw = res.totalResults || 0;
        return (
          <div className="empty card">
            <p className="big">{tr('zoek.nothingFound')}</p>
            {res.tekstZoek && raw > 0 && actief.length
              ? <p>{tr('zoek.emptyTextFiltered', { count: raw, filters: actief.join(', ') })}</p>
              : actief.length
                ? <p>{tr('zoek.emptyFiltered', { filters: actief.join(', ') })}</p>
                : <p>{tr('zoek.emptyRetry')}</p>}
            {actief.length > 0 && <button className="btn" style={{ marginTop: 12 }} onClick={wis}>{tr('zoek.clearFilters')}</button>}
          </div>
        );
      })()}

      <div style={{ display: 'grid', gap: 12 }}>
        {lijst.map((r, i) => (
          <div key={r.id} className="card rec rise-in" style={{ padding: 14, '--i': Math.min(i, 16) }}>
            <button className="rposter" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }} onClick={() => openDetail(r)} aria-label={tr('common.openAria', { title: r.title })}>
              <div className="poster">
                {r.poster ? <img src={IMG(r.poster, 'w342')} alt="" loading="lazy" /> : <Clapperboard size={20} strokeWidth={1.4} aria-hidden="true" />}
              </div>
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <button style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', color: 'var(--paper)' }} onClick={() => openDetail(r)}>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400 }}>{r.title}</h2>
              </button>
              <p style={{ color: 'var(--fog)', fontSize: 13, marginTop: 2 }}>
                {[r.year, r.rol === 'regie' ? tr('winner.regie') : null, r.lang ? langName(r.lang) : null, r.vote ? `★ ${uiLang === 'nl' ? String(r.vote).replace('.', ',') : String(r.vote)}` : null].filter(Boolean).join(' · ')}
                {r.votes != null && <span style={{ color: 'var(--fog-dim)' }}> ({r.votes >= 1000 ? `${Math.round(r.votes / 1000)}k` : r.votes})</span>}
                {r.nossy != null && <span style={{ marginLeft: 8, color: 'var(--dot-o)' }} title="Nossy-score (IMDb/Metacritic/TMDB)">◆ {fmtScore(r.nossy)}</span>}
                {taste.sterk && !r.bekend && <span className="chip on-b" style={{ marginLeft: 8, padding: '2px 8px', fontSize: 11 }}>{tr('zoek.matchPct', { pct: r.score })}</span>}
                {r.bekend && <span className="chip on-g" style={{ marginLeft: 8, padding: '2px 8px', fontSize: 11 }}>{tr('zoek.inCollection')}</span>}
              </p>
              {r.redenen?.length > 0 && !r.bekend && <p className="why" style={{ marginTop: 6 }}>{r.redenen.slice(0, 2).join(' · ')}</p>}
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button className="btn ghost" onClick={() => openDetail(r)}>{tr('verken.viewCard')}</button>
                {!r.bekend && !shortIds.has(r.id) && <button className="btn green" onClick={() => addToShortlist({ ...r, seeds: [], count: 0 })}><Plus size={14} /> Shortlist</button>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {res && !res.tekstZoek && page < res.totalPages && lijst.length > 0 && (
        <button className="btn" style={{ justifyContent: 'center', width: '100%', marginTop: 14 }} onClick={() => zoek(page + 1)} disabled={loading}>
          <RefreshCw size={14} /> {loading ? tr('common.loading') : tr('zoek.nextPage', { page: page + 1, total: res.totalPages })}
        </button>
      )}
    </div>
  );
}
