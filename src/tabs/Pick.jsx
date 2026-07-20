import { IMG } from '../lib/tmdb.js';
import { useMemo, useState } from 'react';
import { SlidersHorizontal, Brain, Dice5, ChevronDown, ChevronUp } from 'lucide-react';
import { MOODS, moodTest, applyFilters, pickWinner, similarPool } from '../lib/pick.js';
import { useT } from '../lib/i18n.js';
import Leader from '../components/Leader.jsx';
import Winner from '../components/Winner.jsx';
import ImportPanel from '../components/ImportPanel.jsx';

const EMPTY_FILTERS = { minYear: '', maxYear: '', maxRuntime: '', minVote: '', genres: [], providers: [], mood: null, excludeSeen: true };

export default function Pick({ app }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [phase, setPhase] = useState('idle'); // idle | leader | winner
  const [winner, setWinner] = useState(null);
  const [context, setContext] = useState(null);

  const { watchlist, meta, seenSet, smart, setSmart, history, setHistory, ratings, followups, answerFollowup, lbLists, startEnrich } = app;
  const { t: tr, lang } = useT();

  // Bron van de pool: je watchlist, of één van je eigen Letterboxd-lijsten.
  const [bron, setBron] = useState('watchlist');
  const bronLijst = bron === 'watchlist' ? null : lbLists.find((l) => l.naam === bron);
  const basePool = bronLijst ? bronLijst.films : watchlist;
  const kiesBron = (naam) => {
    setBron(naam);
    // Lijstfilms buiten je watchlist hebben mogelijk nog geen filmdata.
    const lijst = lbLists.find((l) => l.naam === naam);
    if (lijst) {
      const missend = lijst.films.filter((f) => !(f.key in meta));
      if (missend.length) startEnrich(missend);
    }
  };
  const pool = useMemo(
    () => applyFilters(basePool, meta, { ...filters, minYear: +filters.minYear || 0, maxYear: +filters.maxYear || 0, maxRuntime: +filters.maxRuntime || 0, minVote: +filters.minVote || 0 }, seenSet),
    [basePool, meta, filters, seenSet],
  );

  const moodCounts = useMemo(() => {
    const counts = {};
    MOODS.forEach((m) => { counts[m.id] = 0; });
    watchlist.forEach((f) => {
      if (seenSet.has(f.key)) return;
      MOODS.forEach((m) => { if (moodTest(m.id, f, meta[f.key])) counts[m.id]++; });
    });
    return counts;
  }, [watchlist, meta, seenSet]);

  const genresAvail = useMemo(() => {
    const s = new Set();
    Object.values(meta).forEach((m) => m?.genres?.forEach((g) => s.add(g)));
    return [...s].sort();
  }, [meta]);

  const providersAvail = useMemo(() => {
    const count = {};
    Object.values(meta).forEach((m) => m?.flat?.forEach((p) => { count[p] = (count[p] || 0) + 1; }));
    return Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([p]) => p);
  }, [meta]);

  const runPick = (candidatePool, ctxLabel) => {
    const chosen = pickWinner(candidatePool, meta, smart, history);
    if (!chosen) {
      alert(tr('pick.empty'));
      return;
    }
    setWinner(chosen);
    setContext(ctxLabel);
    setPhase('leader');
  };

  const finishLeader = () => {
    setPhase('winner');
    app.freshenProviders(winner.key);
    setHistory((h) => [{ key: winner.key, name: winner.name, year: winner.year, date: new Date().toISOString(), context }, ...h].slice(0, 80));
  };

  const moodPick = (m) => {
    setFilters((f) => ({ ...f, mood: null }));
    const p = watchlist.filter((f) => !seenSet.has(f.key) && moodTest(m.id, f, meta[f.key]));
    runPick(p, tr('pick.moodContext', { mood: tr(`mood.${m.id}`).toLowerCase() }));
  };

  const similar = () => {
    const p = similarPool(winner, watchlist.filter((f) => !seenSet.has(f.key)), meta);
    if (!p.length) { alert(tr('pick.noSimilar')); return; }
    runPick(p, tr('pick.likePrev'));
  };

  if (!watchlist.length) return <ImportPanel app={app} hero />;

  // Post-pick-opvolging: de meest recente pick van 6 uur tot 14 dagen terug
  // waar nog geen antwoord of rating voor is. Eén vraag, nooit een stapel.
  const NU = Date.now();
  const followupPick = history.find((h) => {
    const t = new Date(h.date).getTime();
    if (NU - t < 6 * 3600e3 || NU - t > 14 * 24 * 3600e3) return false;
    if (followups[h.date]) return false;
    if (ratings[h.key] != null) return false;
    return true;
  });
  const relTijd = (iso) => {
    try {
      const dagen = Math.round((new Date(iso).getTime() - NU) / (24 * 3600e3));
      return new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }).format(dagen, 'day');
    } catch { return ''; }
  };

  const toggleIn = (arrKey, val) => setFilters((f) => ({
    ...f,
    [arrKey]: f[arrKey].includes(val) ? f[arrKey].filter((x) => x !== val) : [...f[arrKey], val],
  }));

  return (
    <div>
      {phase === 'leader' && <Leader onDone={finishLeader} />}

      <div className="toprow">
        <div>
          <h1 className="page-title">{tr('pick.title')}</h1>
          <p className="page-sub">{tr('pick.poolCount', { count: pool.length })}{filters.excludeSeen ? tr('pick.poolExcludeSeen') : ''}.</p>
        </div>
        <button
          className={`switch-row ${smart ? 'on' : ''}`}
          role="switch" aria-checked={smart}
          onClick={() => setSmart(!smart)}
          title={tr('pick.smartTitle')}
        >
          <span className="switch" aria-hidden="true"><span className="knob" /></span>
          <Brain size={14} /> {tr('pick.smartLabel')} <span className="state">{smart ? tr('pick.on') : tr('pick.off')}</span>
        </button>
      </div>

      {phase === 'winner' && winner && (
        <div style={{ marginBottom: 22 }}>
          <Winner
            film={winner} meta={meta[winner.key]} context={context}
            seen={seenSet.has(winner.key)} onToggleSeen={() => app.toggleSeen(winner.key)}
            onSimilar={() => app.openSimilar(winner, meta[winner.key])} onReroll={() => runPick(pool, null)}
            onWantScores={!app.omdbKeys.length ? app.goSetup : undefined}
          />
        </div>
      )}

      {followupPick && (
        <div className="card followup-card rise-in" style={{ marginBottom: 18 }}>
          {meta[followupPick.key]?.poster
            ? <img className="fu-poster" src={IMG(meta[followupPick.key].poster, 'w154')} alt="" />
            : <div className="fu-poster" aria-hidden="true" />}
          <div style={{ flex: 1, minWidth: 200 }}>
            <p className="label" style={{ marginBottom: 2 }}>{tr('pick.followupTitle')} · {relTijd(followupPick.date)}</p>
            <p style={{ color: 'var(--paper)', fontSize: 15.5, fontWeight: 600 }}>{followupPick.name}{followupPick.year ? ` (${followupPick.year})` : ''} — {tr('pick.followupQ')}</p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="fu-stars" role="group" aria-label={tr('pick.followupQ')}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" className="fu-star" aria-label={tr('pick.rateAria', { n })}
                  onClick={() => answerFollowup(followupPick, 'rated', n)}>★</button>
              ))}
            </span>
            <button className="btn ghost" onClick={() => answerFollowup(followupPick, 'seen')}>{tr('pick.seenNoStars')}</button>
            <button className="btn ghost" onClick={() => answerFollowup(followupPick, 'no')}>{tr('pick.notWatched')}</button>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 18 }}>
        {lbLists.length > 0 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
            <span className="label">{tr('pick.source')}</span>
            <select className="field" style={{ width: 'auto' }} value={bron} onChange={(e) => kiesBron(e.target.value)} aria-label={tr('pick.source')}>
              <option value="watchlist">{tr('pick.sourceWatchlist')} {tr('pick.sourceCount', { count: watchlist.length })}</option>
              {lbLists.map((l) => (
                <option key={l.naam} value={l.naam}>{l.naam} {tr('pick.sourceCount', { count: l.films.length })}</option>
              ))}
            </select>
          </div>
        )}
        <p className="label" style={{ marginBottom: 10 }}>{tr('pick.mood')}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {MOODS.map((m) => (
            <button key={m.id} className="chip" title={tr(`mood.${m.id}_desc`)} disabled={!moodCounts[m.id] || phase === 'leader'} onClick={() => moodPick(m)}>
              {tr(`mood.${m.id}`)} <span className="count">({moodCounts[m.id]})</span>
            </button>
          ))}
        </div>
      </div>

      <button className="btn primary big" style={{ width: '100%', justifyContent: 'center' }} disabled={phase === 'leader' || !pool.length} onClick={() => runPick(pool, null)}>
        <Dice5 size={18} /> {tr('pick.pickFilm')}
      </button>

      <div style={{ marginTop: 18 }}>
        <button className="btn ghost" onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters}>
          <SlidersHorizontal size={15} /> {tr('pick.filters')} {filters.genres.length + filters.providers.length > 0 || filters.minYear || filters.maxYear || filters.maxRuntime || filters.minVote ? tr('pick.filtersActive') : ''}
          {showFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {showFilters && (
          <div className="card" style={{ marginTop: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              <input className="field" type="number" placeholder={tr('pick.fromYear')} value={filters.minYear} onChange={(e) => setFilters({ ...filters, minYear: e.target.value })} aria-label={tr('pick.fromYear')} />
              <input className="field" type="number" placeholder={tr('pick.toYear')} value={filters.maxYear} onChange={(e) => setFilters({ ...filters, maxYear: e.target.value })} aria-label={tr('pick.toYear')} />
              <input className="field" type="number" placeholder={tr('pick.maxMinutes')} value={filters.maxRuntime} onChange={(e) => setFilters({ ...filters, maxRuntime: e.target.value })} aria-label={tr('pick.maxRuntime')} />
              <input className="field" type="number" step="0.1" placeholder={tr('pick.minScoreEx')} value={filters.minVote} onChange={(e) => setFilters({ ...filters, minVote: e.target.value })} aria-label={tr('pick.minScore')} />
            </div>

            {genresAvail.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <p className="label" style={{ marginBottom: 8 }}>{tr('pick.genres')}</p>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  {genresAvail.map((g) => (
                    <button key={g} className={`chip ${filters.genres.includes(g) ? 'on' : ''}`} onClick={() => toggleIn('genres', g)}>{g}</button>
                  ))}
                </div>
              </div>
            )}

            {providersAvail.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <p className="label" style={{ marginBottom: 8 }}>{tr('pick.onlyMyServices')}</p>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  {providersAvail.map((p) => (
                    <button key={p} className={`chip ${filters.providers.includes(p) ? 'on-g' : ''}`} onClick={() => toggleIn('providers', p)}>{p}</button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 13.5, color: 'var(--fog)', cursor: 'pointer' }}>
                <input type="checkbox" checked={filters.excludeSeen} onChange={(e) => setFilters({ ...filters, excludeSeen: e.target.checked })} style={{ accentColor: 'var(--dot-g)' }} />
                Gezien uitsluiten
              </label>
              <button className="btn ghost" onClick={() => setFilters(EMPTY_FILTERS)}>{tr('pick.resetFilters')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
