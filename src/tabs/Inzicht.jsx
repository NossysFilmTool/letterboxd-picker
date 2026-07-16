import { useMemo, useState } from 'react';
import { History, X, Sparkles } from 'lucide-react';
import Winner from '../components/Winner.jsx';
import { buildTaste } from '../lib/taste.js';
import { GENRES, genreLabel } from '../lib/tmdb.js';

function BarList({ items, color, max }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {items.map(([label, n]) => (
        <div className="bar-row" key={label}>
          <span className="bar-label">{label}</span>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${(n / max) * 100}%`, background: color }} /></div>
          <span className="bar-num">{n}</span>
        </div>
      ))}
    </div>
  );
}

const top = (counter, n) => Object.entries(counter).sort((a, b) => b[1] - a[1]).slice(0, n);
import { useT, esc } from '../lib/i18n.js';

export default function Inzicht({ app }) {
  const { t: tr, lang } = useT();
  const { watchlist, meta, ratings, ratedFilms, shortlist, skipped, history, seenSet } = app;
  const [sel, setSel] = useState(null);

  const openPick = (h) => {
    const film = watchlist.find((f) => f.key === h.key) || { key: h.key, name: h.name, year: h.year, uri: '' };
    setSel(film);
    app.ensureDetail(film);
    app.freshenProviders(h.key);
  };

  const stats = useMemo(() => {
    const genres = {}; const decades = {}; const directors = {}; const countries = {};
    let runtimeSum = 0; let runtimeN = 0; let voteSum = 0; let voteN = 0;
    watchlist.forEach((f) => {
      const m = meta[f.key];
      if (f.year) { const d = `${Math.floor(f.year / 10) * 10}s`; decades[d] = (decades[d] || 0) + 1; }
      if (!m) return;
      m.genres?.forEach((g) => { genres[g] = (genres[g] || 0) + 1; });
      if (m.director) directors[m.director] = (directors[m.director] || 0) + 1;
      if (m.country) countries[m.country] = (countries[m.country] || 0) + 1;
      if (m.runtime) { runtimeSum += m.runtime; runtimeN++; }
      if (m.vote) { voteSum += m.vote; voteN++; }
    });
    const ratingVals = Object.values(ratings);
    return {
      genres: top(genres, 8),
      decades: Object.entries(decades).sort((a, b) => a[0].localeCompare(b[0])),
      directors: top(directors, 5).filter(([, n]) => n > 1),
      countries: top(countries, 5),
      avgRuntime: runtimeN ? Math.round(runtimeSum / runtimeN) : null,
      avgVote: voteN ? (voteSum / voteN).toFixed(1).replace('.', ',') : null,
      avgOwn: ratingVals.length ? (ratingVals.reduce((a, b) => a + b, 0) / ratingVals.length).toFixed(2).replace('.', ',') : null,
      ratingCount: ratingVals.length,
      totalHours: runtimeN ? Math.round((runtimeSum / runtimeN) * watchlist.length / 60) : null,
    };
  }, [watchlist, meta, ratings]);

  
  const smaak = useMemo(() => {
    const tp = buildTaste({ watchlist, ratedFilms: ratedFilms || [], meta, shortlist: shortlist || [], skipped: skipped || [] });
    const lblFromEn = (en) => { const gg = GENRES.find((x) => x.en === en); return gg ? genreLabel(gg) : en; };
    const g = Object.entries(tp.genres).map(([en, v]) => [lblFromEn(en), v]).sort((a, b) => b[1] - a[1]);
    const d = Object.entries(tp.decades).sort((a, b) => b[1] - a[1]);
    return {
      sterk: tp.sterk,
      houdtVan: g.filter(([, v]) => v > 0.25).slice(0, 4),
      houdtNietVan: g.filter(([, v]) => v < -0.25).slice(-3).reverse(),
      tijdperk: d[0] && d[0][1] > 0.3 ? `${d[0][0]}s` : null,
      themes: (tp.topThemes || []).slice(0, 5).map((x) => x.name),
      nietEngels: tp.nietEngels,
      medianVotes: tp.medianVotes,
    };
  }, [watchlist, ratedFilms, meta, shortlist, skipped, lang]);

  if (!watchlist.length) {
    return (
      <div>
        <h1 className="page-title">{tr('inzicht.title')}</h1>
        <div className="empty card" style={{ marginTop: 20 }}>
          <p className="big">{tr('inzicht.empty')}</p>
          <p>{tr('inzicht.emptyHint')}</p>
        </div>
      </div>
    );
  }

  const maxG = stats.genres[0]?.[1] || 1;
  const maxD = Math.max(...stats.decades.map(([, n]) => n), 1);
  const unseen = watchlist.filter((f) => !seenSet.has(f.key)).length;

  const metrics = [
    [tr('inzicht.onWatchlist'), watchlist.length],
    [tr('inzicht.toWatch'), unseen],
    stats.avgRuntime ? [tr('inzicht.avgRuntime'), tr('inzicht.min', { m: stats.avgRuntime })] : null,
    stats.totalHours ? [tr('inzicht.totalTime'), tr('inzicht.hours', { h: stats.totalHours })] : null,
    stats.avgVote ? [tr('inzicht.avgTmdb'), stats.avgVote] : null,
    stats.avgOwn ? [`Jouw gem. rating (${stats.ratingCount})`, `${stats.avgOwn} ★`] : null,
  ].filter(Boolean);

  return (
    <div>
      <div className="toprow">
        <div>
          <h1 className="page-title">{tr('inzicht.title')}</h1>
          <p className="page-sub">{tr('inzicht.subtitle', { extra: stats.avgOwn ? tr('inzicht.andRatings') : '' })}</p>
        </div>
      </div>

      {sel && (
        <div style={{ marginBottom: 18 }}>
          <button className="btn ghost" style={{ marginBottom: 10 }} onClick={() => setSel(null)}><X size={14} /> Sluit</button>
          <Winner film={sel} meta={meta[sel.key]} context={tr('inzicht.prevPick')} seen={seenSet.has(sel.key)} onToggleSeen={() => app.toggleSeen(sel.key)} />
        </div>
      )}

      <div className="card" style={{ marginBottom: 18, borderColor: 'rgba(255,128,0,0.25)' }}>
        <p className="label" style={{ color: 'var(--dot-o)', marginBottom: 10 }}><Sparkles size={14} style={{ verticalAlign: -2 }} /> {tr('inzicht.profileTitle')}</p>
        {!smaak.sterk && (
          <p style={{ color: 'var(--fog)', fontSize: 13, marginBottom: 10 }}>
            {tr('inzicht.profileYoung')}
          </p>
        )}
        <div style={{ display: 'grid', gap: 12 }}>
          {smaak.houdtVan.length > 0 && (
            <p style={{ fontSize: 14, color: 'var(--fog)' }}>
<span dangerouslySetInnerHTML={{ __html: tr('inzicht.lovesLine', { genres: esc(smaak.houdtVan.map(([g]) => g).join(', ')) }) + (smaak.tijdperk ? tr('inzicht.lovesEra', { era: esc(smaak.tijdperk) }) : '') + '.' }} />
            </p>
          )}
          {smaak.houdtNietVan.length > 0 && (
            <p style={{ fontSize: 14, color: 'var(--fog)' }}>
<span dangerouslySetInnerHTML={{ __html: tr('inzicht.dislikesLine', { genres: esc(smaak.houdtNietVan.map(([g]) => g).join(', ')) }) }} />
            </p>
          )}
          {smaak.themes.length > 0 && (
            <p style={{ fontSize: 14, color: 'var(--fog)' }}>
<span dangerouslySetInnerHTML={{ __html: tr('inzicht.themesLine', { themes: esc(smaak.themes.join(', ')) }) }} />
            </p>
          )}
          <p style={{ fontSize: 14, color: 'var(--fog)' }} dangerouslySetInnerHTML={{ __html: tr('inzicht.langFamLine', {
            watch: smaak.nietEngels >= 0.5 ? tr('inzicht.watchMostly') : smaak.nietEngels >= 0.3 ? tr('inzicht.watchAlso') : tr('inzicht.watchMainlyEn'),
            pct: Math.round(smaak.nietEngels * 100),
            votes: smaak.medianVotes >= 1000 ? `${Math.round(smaak.medianVotes / 1000)}k` : smaak.medianVotes,
            verdict: esc(smaak.medianVotes < 2000 ? tr('inzicht.famDeep') : smaak.medianVotes < 10000 ? tr('inzicht.famMix') : tr('inzicht.famEstablished')),
          }) }} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
        {metrics.map(([label, val]) => (
          <div className="card" key={label} style={{ padding: '14px 16px' }}>
            <p style={{ color: 'var(--fog-dim)', fontSize: 12 }}>{label}</p>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: 26, marginTop: 2 }}>{val}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        {stats.genres.length > 0 && (
          <div className="card">
            <p className="label" style={{ marginBottom: 12 }}>{tr('inzicht.genres')}</p>
            <BarList items={stats.genres} color="var(--dot-o)" max={maxG} />
          </div>
        )}
        {stats.decades.length > 0 && (
          <div className="card">
            <p className="label" style={{ marginBottom: 12 }}>{tr('inzicht.decades')}</p>
            <BarList items={stats.decades} color="var(--dot-b)" max={maxD} />
          </div>
        )}
        {stats.directors.length > 0 && (
          <div className="card">
            <p className="label" style={{ marginBottom: 12 }}>{tr('inzicht.directorsMulti')}</p>
            <BarList items={stats.directors} color="var(--dot-g)" max={stats.directors[0][1]} />
          </div>
        )}
        {stats.countries.length > 0 && (
          <div className="card">
            <p className="label" style={{ marginBottom: 12 }}>{tr('inzicht.countries')}</p>
            <BarList items={stats.countries} color="var(--fog)" max={stats.countries[0][1]} />
          </div>
        )}
      </div>

      {history.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <p className="label" style={{ marginBottom: 12 }}><History size={13} style={{ verticalAlign: -2 }} /> Laatste picks — tik om te heropenen</p>
          <div style={{ display: 'grid', gap: 4 }}>
            {history.slice(0, 12).map((h, i) => (
              <button
                key={`${h.key}-${i}`} onClick={() => openPick(h)}
                style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13.5, background: 'none', border: 'none', borderBottom: i < Math.min(history.length, 12) - 1 ? '1px solid var(--line)' : 'none', padding: '6px 2px 8px', color: 'var(--paper)', textAlign: 'left', cursor: 'pointer' }}
              >
                <span>{h.name} <span style={{ color: 'var(--fog-dim)' }}>({h.year || '?'})</span>{h.context ? <span style={{ color: 'var(--dot-b)', fontSize: 12 }}> · {h.context.toLowerCase()}</span> : null}</span>
                <span style={{ color: 'var(--fog-dim)', flexShrink: 0 }}>{new Date(h.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}</span>
              </button>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
