import { useMemo, useState, useEffect } from 'react';
import { Search, Clapperboard, Check, ArrowLeft, Star } from 'lucide-react';
import { IMG, resolveFilm } from '../lib/tmdb.js';
import { nossyScore, fmtScore } from '../lib/pick.js';
import { useT } from '../lib/i18n.js';
import Winner from '../components/Winner.jsx';

const SORTS = [
  ['titel', 'titleAZ'],
  ['nieuw', 'newest'],
  ['oud', 'oldest'],
  ['score', 'highestScore'],
  ['kort', 'shortest'],
  ['lang', 'longest'],
];

export default function Bieb({ app }) {
  const { t: tr } = useT();
  const { watchlist, watchedFilms, ratedFilms, ratings, meta, setMeta, seenSet, settings, freshenProviders, tmdbKey } = app;
  const [scope, setScope] = useState('watchlist'); // watchlist | gezien
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('titel');
  const [hideSeen, setHideSeen] = useState(false);
  const [genreSel, setGenreSel] = useState([]);
  const [decade, setDecade] = useState('');
  const [shown, setShown] = useState(60);
  const [maxDur, setMaxDur] = useState('');
  const [provSel, setProvSel] = useState([]);
  const [sel, setSel] = useState(null);
  const [busyKey, setBusyKey] = useState(null);

  // Kijkgeschiedenis: gezien-lijst ∪ beoordeelde films, ontdubbeld op key
  const gezienList = useMemo(() => {
    const map = new Map();
    watchedFilms.forEach((f) => map.set(f.key, f));
    ratedFilms.forEach((f) => { if (!map.has(f.key)) map.set(f.key, f); });
    return [...map.values()];
  }, [watchedFilms, ratedFilms]);

  const base = scope === 'watchlist' ? watchlist : gezienList;

  const genresAvail = useMemo(() => {
    const count = {};
    base.forEach((f) => meta[f.key]?.genres?.forEach((g) => { count[g] = (count[g] || 0) + 1; }));
    return Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([g]) => g);
  }, [base, meta]);

  const provsAvail = useMemo(() => {
    const count = {};
    base.forEach((f) => meta[f.key]?.flat?.forEach((p) => { count[p] = (count[p] || 0) + 1; }));
    return Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([p]) => p);
  }, [base, meta]);

  const decadesAvail = useMemo(() => {
    const s = new Set();
    base.forEach((f) => { if (f.year) s.add(Math.floor(f.year / 10) * 10); });
    return [...s].sort((a, b) => b - a);
  }, [base]);

  const sortOptions = scope === 'gezien' ? [...SORTS, ['mijn', 'yourRating']] : SORTS;

  useEffect(() => { setShown(60); }, [scope, q, sort, decade, maxDur, provSel, hideSeen]);

  const films = useMemo(() => {
    let list = base;
    if (scope === 'watchlist' && hideSeen) list = list.filter((f) => !seenSet.has(f.key));
    const needle = q.trim().toLowerCase();
    if (needle) list = list.filter((f) => f.name.toLowerCase().includes(needle));
    if (decade !== '') list = list.filter((f) => f.year && Math.floor(f.year / 10) * 10 === decade);
    if (maxDur !== '') list = list.filter((f) => meta[f.key]?.runtime && meta[f.key].runtime <= maxDur);
    if (genreSel.length) list = list.filter((f) => meta[f.key]?.genres?.some((g) => genreSel.includes(g)));
    if (provSel.length) list = list.filter((f) => meta[f.key]?.flat?.some((p) => provSel.includes(p)));

    const score = (f) => nossyScore(meta[f.key]) ?? -1;
    const runtime = (f) => meta[f.key]?.runtime ?? null;
    const sorted = [...list];
    switch (sort) {
      case 'nieuw': sorted.sort((a, b) => (b.year || 0) - (a.year || 0)); break;
      case 'oud': sorted.sort((a, b) => (a.year || 9999) - (b.year || 9999)); break;
      case 'score': sorted.sort((a, b) => score(b) - score(a)); break;
      case 'kort': sorted.sort((a, b) => (runtime(a) ?? 9999) - (runtime(b) ?? 9999)); break;
      case 'lang': sorted.sort((a, b) => (runtime(b) ?? -1) - (runtime(a) ?? -1)); break;
      case 'mijn': sorted.sort((a, b) => (ratings[b.key] || 0) - (ratings[a.key] || 0)); break;
      default: sorted.sort((a, b) => a.name.localeCompare(b.name, 'nl'));
    }
    return sorted;
  }, [base, scope, meta, seenSet, ratings, q, sort, hideSeen, decade, maxDur, genreSel, provSel]);

  // Gezien-films missen vaak nog filmdata: bij het openen on-demand ophalen (en cachen)
  const open = async (f) => {
    setSel(f);
    // Volledige kaart + OMDb-scores garanderen, net als in Verken
    if (tmdbKey && !(meta[f.key]?.at != null && meta[f.key]?.ext)) {
      setBusyKey(f.key);
      await app.ensureDetail(f);
      setBusyKey(null);
    }
    freshenProviders(f.key);
  };

  const toggleIn = (setter) => (val) => setter((arr) => (arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]));
  const filtersActief = genreSel.length || provSel.length || decade !== '' || maxDur !== '';

  if (!watchlist.length && !gezienList.length) {
    return (
      <div>
        <h1 className="page-title">{tr('bieb.title')}</h1>
        <div className="empty card" style={{ marginTop: 20 }}>
          <p className="big">{tr('bieb.empty')}</p>
          <p>{tr('bieb.emptyHint')}</p>
        </div>
      </div>
    );
  }

  if (sel) {
    return (
      <div>
        <button className="btn ghost" style={{ marginBottom: 14 }} onClick={() => setSel(null)}>
          <ArrowLeft size={15} /> Terug naar de bieb
        </button>
        <Winner
          film={sel} meta={meta[sel.key]}
          context={scope === 'gezien'
            ? `${tr('bieb.fromHistory')}${ratings[sel.key] ? tr('bieb.youGave', { score: fmtScore(ratings[sel.key]) }) : ''}`
            : tr('bieb.fromLibrary')}
          seen={seenSet.has(sel.key)}
          onToggleSeen={scope === 'watchlist' ? () => app.toggleSeen(sel.key) : undefined}
          onSimilar={() => app.openSimilar(sel, meta[sel.key])}
          onWantScores={!app.omdbKeys.length ? app.goSetup : undefined}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="toprow">
        <div>
          <h1 className="page-title">{tr('bieb.title')}</h1>
          <p className="page-sub">
            {scope === 'watchlist' ? tr('bieb.yourWatchlist') : tr('bieb.yourHistory')} \u2014 {tr('bieb.header', { shown: films.length, count: base.length })}{filtersActief ? tr('bieb.filtered') : ''}.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`chip ${scope === 'watchlist' ? 'on' : ''}`} onClick={() => { setScope('watchlist'); setSort('titel'); }}>{tr('bieb.watchlist')}</button>
          <button className={`chip ${scope === 'gezien' ? 'on-g' : ''}`} onClick={() => { setScope('gezien'); setSort('mijn'); }}>{tr('bieb.seenTab', { count: gezienList.length })}</button>
        </div>
      </div>

      {scope === 'gezien' && watchedFilms.length === 0 && app.watchedLb.length > 0 && (
        <p className="notice warn" style={{ marginBottom: 16 }}>
          Je ziet nu alleen je beoordeelde films. Herlaad je Letterboxd-export (Setup) om ook je niet-beoordeelde gezien-films hier te krijgen.
        </p>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 320 }}>
          <Search size={15} style={{ position: 'absolute', left: 11, top: 11, color: 'var(--fog-dim)' }} aria-hidden="true" />
          <input className="field" style={{ paddingLeft: 34 }} placeholder={tr('bieb.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={tr('bieb.searchLabel')} />
        </div>
        <select className="field" style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value)} aria-label={tr('bieb.sortLabel')}>
          {sortOptions.map(([id, key]) => <option key={id} value={id}>{tr(`sort.${key}`)}</option>)}
        </select>
        <select className="field" style={{ width: 'auto' }} value={decade} onChange={(e) => setDecade(e.target.value === '' ? '' : +e.target.value)} aria-label={tr('bieb.periodLabel')}>
          <option value="">{tr('common.allYears')}</option>
          {decadesAvail.map((d) => <option key={d} value={d}>{tr('common.decade', { era: String(d).slice(2) })}</option>)}
        </select>
        <select className="field" style={{ width: 'auto' }} value={maxDur} onChange={(e) => setMaxDur(e.target.value === '' ? '' : +e.target.value)} aria-label={tr('bieb.maxDurationLabel')}>
          <option value="">{tr('common.anyDuration')}</option>
          {[90, 105, 120, 150, 180].map((d) => <option key={d} value={d}>≤ {d} min</option>)}
        </select>
        {scope === 'watchlist' && (
          <button className={`chip ${hideSeen ? 'on-g' : ''}`} onClick={() => setHideSeen(!hideSeen)}>
            <Check size={13} /> {tr('bieb.hideSeen')}
          </button>
        )}
      </div>

      {genresAvail.length > 0 && (
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 10 }}>
          {genresAvail.map((g) => (
            <button key={g} className={`chip ${genreSel.includes(g) ? 'on' : ''}`} onClick={() => toggleIn(setGenreSel)(g)}>{g}</button>
          ))}
        </div>
      )}
      {provsAvail.length > 0 && (
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 18, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--fog-dim)' }}>{tr('bieb.onStreaming')}</span>
          {provsAvail.map((p) => (
            <button key={p} className={`chip ${provSel.includes(p) ? 'on-g' : ''}`} onClick={() => toggleIn(setProvSel)(p)}>{p}</button>
          ))}
        </div>
      )}

      {!films.length ? (
        <div className="empty card"><p className="big">{tr('bieb.nothingFound')}</p><p>{tr('bieb.noMatch')}</p></div>
      ) : (<>
        <div className="poster-grid">
          {films.slice(0, shown).map((f, i) => {
            const m = meta[f.key];
            const ns = nossyScore(m);
            const eigen = ratings[f.key] ?? f.rating; // ratedFilms dragen hun rating zelf mee
            return (
              <button key={f.key} className="poster-tile" style={{ '--i': Math.min(i, 19), opacity: busyKey === f.key ? 0.6 : 1 }} onClick={() => open(f)} aria-label={tr('common.openAria', { title: `${f.name}${f.year ? ` (${f.year})` : ''}` })} disabled={busyKey !== null}>
                <div className="poster">
                  {m?.poster ? <img src={IMG(m.poster, 'w342')} alt="" loading="lazy" /> : <Clapperboard size={20} strokeWidth={1.4} aria-hidden="true" />}
                  {scope === 'gezien' && eigen != null ? (
                    <span className="badge-score" style={{ color: 'var(--dot-g)', borderColor: 'rgba(0,224,84,0.4)' }}><Star size={9} style={{ verticalAlign: -1 }} /> {fmtScore(eigen)}</span>
                  ) : ns != null ? (
                    <span className="badge-score">{fmtScore(ns)}</span>
                  ) : null}
                  {scope === 'watchlist' && seenSet.has(f.key) && <span className="badge-seen" title={tr('common.seen')}><Check size={11} strokeWidth={3} /></span>}
                  <div className="caption" aria-hidden="true">
                    <span className="t">{busyKey === f.key ? tr('common.loading') : f.name}</span>
                    <span className="y">{f.year || ''}{m?.runtime ? ` · ${m.runtime} min` : ''}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        {films.length > shown && (
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button className="btn" onClick={() => setShown(shown + 60)}>{tr('common.showMore', { count: films.length - shown })}</button>
          </div>
        )}
      </>)}
    </div>
  );
}
