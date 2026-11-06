import { useMemo, useState } from 'react';
import { History, X, Sparkles } from 'lucide-react';
import Winner from '../components/Winner.jsx';
import { buildTaste } from '../lib/taste.js';
import { GENRES, genreLabel, getRegion } from '../lib/tmdb.js';
import { meetlat, STANDAARD_OPTIES } from '../lib/kandidaten.js';
import { verzamelVoorbeelden, leerEnToets, watGeleerd } from '../lib/model.js';
import { useLS } from '../lib/storage.js';

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
  const { watchlist, meta, ratings, ratedFilms, shortlist, skipped, history, seenSet, diary } = app;

  // Kijkritme uit het Letterboxd-dagboek: telling per maand, laatste 12 maanden.
  const ritme = useMemo(() => {
    if (!diary?.length) return null;
    const nu = new Date();
    const maanden = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(nu.getFullYear(), nu.getMonth() - i, 1);
      maanden.push({ y: d.getFullYear(), m: d.getMonth(), count: 0 });
    }
    let herkijk = 0;
    diary.forEach((e) => {
      const d = new Date(e.watchedDate);
      if (Number.isNaN(d.getTime())) return;
      const slot = maanden.find((x) => x.y === d.getFullYear() && x.m === d.getMonth());
      if (slot) { slot.count += 1; if (e.rewatch) herkijk += 1; }
    });
    const totaal = maanden.reduce((n, x) => n + x.count, 0);
    if (!totaal) return null;
    const piek = maanden.reduce((a, b) => (b.count > a.count ? b : a));
    const maandNaam = (m, y) => { try { return new Intl.DateTimeFormat(lang, { month: 'long' }).format(new Date(y, m, 1)); } catch { return `${m + 1}`; } };
    return { maanden, totaal, herkijk, piekNaam: maandNaam(piek.m, piek.y), max: Math.max(...maanden.map((x) => x.count)) };
  }, [diary, lang]);

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

  
  // De meetlat van Voor jou: draait lokaal op wat al gecachet is
  const [oeuvres] = useLS('oeuvres', {});
  const [kandDetails] = useLS('kandDetails', {});
  const [meting, setMeting] = useState(null);
  const actiefModel = app.smaakModel?.aan ? app.smaakModel : null;
  const meet = () => setMeting(meetlat({
    watchlist, meta, ratedFilms: ratedFilms || [], ratings: ratings || {}, seenSet, oeuvres, details: kandDetails, regio: getRegion(),
    model: actiefModel,
  }));

  // Fase 8: leren van je beoordelingen. Dezelfde rondes als de meetlat, dus
  // een paar seconden rekenwerk; tussen de rondes krijgt het scherm lucht.
  const [leren, setLeren] = useState(null); // { n, totaal } tijdens het leren
  const [leerMelding, setLeerMelding] = useState(null);
  const leerSmaak = async () => {
    if (leren) return;
    setLeerMelding(null);
    setLeren({ n: 0, totaal: 1 });
    try {
      const data = {
        watchlist, meta, ratedFilms: ratedFilms || [], ratings: ratings || {}, seenSet, oeuvres, details: kandDetails, regio: getRegion(),
        shortlist: shortlist || [], skipped: skipped || [],
      };
      const v = await verzamelVoorbeelden(data, { onVoortgang: (n, totaal) => setLeren({ n, totaal }) });
      if (!v.genoeg) { setLeerMelding(tr('inzicht.meetTeWeinig', { count: v.favorieten })); return; }
      const m = leerEnToets(v.records);
      if (!m) { setLeerMelding(tr('inzicht.leerTeWeinig')); return; }
      app.setSmaakModel(m);
      setMeting(null); // een oude meting gold voor de vorige rangschikking
    } finally {
      setLeren(null);
    }
  };
  const geleerd = app.smaakModel?.toets ? app.smaakModel : null;
  const fmtDatum = (ms) => { try { return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long' }).format(new Date(ms)); } catch { return ''; } };

  const smaak = useMemo(() => {
    const tp = buildTaste({ watchlist, ratedFilms: ratedFilms || [], meta, shortlist: shortlist || [], skipped: skipped || [], idf: STANDAARD_OPTIES.idf, profielUitFavorieten: STANDAARD_OPTIES.profielFav });
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
      {ritme && (
        <div className="card" style={{ marginBottom: 18 }}>
          <p className="label" style={{ marginBottom: 10 }}>{tr('inzicht.rhythm')}</p>
          <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end', height: 56, marginBottom: 10 }} aria-hidden="true">
            {ritme.maanden.map((x) => (
              <div key={`${x.y}-${x.m}`} title={`${x.count}`} style={{ flex: 1, minWidth: 8, height: `${x.count ? Math.max(12, (x.count / ritme.max) * 100) : 4}%`, borderRadius: 1, background: x.count === ritme.max && x.count ? 'var(--paper)' : 'var(--line-strong)' }} />
            ))}
          </div>
          <p style={{ color: 'var(--fog)', fontSize: 13.5 }}>
            {tr('inzicht.rhythmLine', { count: ritme.totaal, month: ritme.piekNaam })}
            {ritme.herkijk ? ` · ${tr('inzicht.rewatchLine', { count: ritme.herkijk })}` : ''}
          </p>
        </div>
      )}
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

      <div className="card" style={{ marginBottom: 18 }}>
        <p className="label" style={{ marginBottom: 10 }}><Sparkles size={14} style={{ verticalAlign: -2 }} /> {tr('inzicht.profileTitle')}</p>
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

      <div className="card meetlat" style={{ marginBottom: 18 }}>
        <p className="label" style={{ marginBottom: 8 }}>{tr('inzicht.meetTitle')}</p>
        <p style={{ fontSize: 13.5, color: 'var(--fog)' }}>{tr('inzicht.meetUitleg')}</p>
        {meting && !meting.genoeg && (
          <p style={{ fontSize: 13.5, color: 'var(--fog)', marginTop: 10 }}>{tr('inzicht.meetTeWeinig', { count: meting.favorieten })}</p>
        )}
        {meting?.genoeg && (
          <div style={{ marginTop: 12 }}>
            <p className="meet-score">
              <strong>{meting.pct}%</strong>
              <span>{tr('inzicht.meetResultaat', { found: meting.gevonden, total: meting.perFilm.length, top: meting.topN })}</span>
            </p>
            {meting.gevonden > 0 && (
              <p style={{ fontSize: 12.5, color: 'var(--fog-dim)', marginTop: 6 }}>
                {tr('inzicht.meetGevonden')} {meting.perFilm.filter((p) => p.positie != null && p.positie <= meting.topN).slice(0, 6).map((p) => `${p.name} (#${p.positie})`).join(', ')}
              </p>
            )}
            {meting.diagnose && (() => {
              const d = meting.diagnose;
              const n = (v) => (v == null ? '?' : Number(v).toLocaleString(lang));
              return (
                <div className="meet-diagnose">
                  <p className="label" style={{ marginBottom: 6 }}>{tr('inzicht.meetDiagnose')}</p>
                  <ul>
                    <li>{tr('inzicht.meetDekking', { fav: n(d.favorietenMetData), favTotaal: n(d.favorietenTotaal), seeds: n(d.seedsMetData), seedsTotaal: n(d.seedsTotaal) })}</li>
                    <li>{tr('inzicht.meetBereik', { inPoel: meting.inPoel, n: d.proef })}</li>
                    <li>{tr('inzicht.meetMediaan', { pos: n(d.mediaanPositie), poel: n(d.poel) })}</li>
                    <li>{tr('inzicht.meetBronnen', { recs: n(d.metAanbevelingen), sims: n(d.metVergelijkbaar), oeuvres: n(d.regisseursMetOeuvre), regisseurs: n(d.regisseurs) })}</li>
                    <li>{tr('inzicht.meetBekendheid', { top: n(d.stemmenTop), fav: n(d.stemmenFavorieten) })}</li>
                  </ul>
                </div>
              );
            })()}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
          <button className="btn" onClick={meet}>{meting ? tr('inzicht.meetOpnieuw') : tr('inzicht.meetKnop')}</button>
          <span style={{ fontSize: 12, color: 'var(--fog-dim)' }}>{actiefModel ? tr('inzicht.meetMetModel') : tr('inzicht.meetCache')}</span>
        </div>

        {/* Fase 8: het geleerde model */}
        <div className="leer">
          <p className="label" style={{ marginBottom: 6 }}>{tr('inzicht.leerTitel')}</p>
          <p style={{ fontSize: 13.5, color: 'var(--fog)' }}>{tr('inzicht.leerUitleg')}</p>
          {geleerd && !leren && (() => {
            const { basis, model: mt } = geleerd.toets;
            const g = geleerd.gegevens || {};
            const lessen = watGeleerd(geleerd);
            return (
              <div style={{ marginTop: 12 }}>
                <p className="meet-score">
                  <strong>{mt.top12}</strong>
                  <span>{tr('inzicht.leerToets', { m12: mt.top12, m50: mt.top50, b12: basis.top12, b50: basis.top50, n: mt.proef })}</span>
                </p>
                <p style={{ fontSize: 13, color: geleerd.beter ? 'var(--dot-g)' : 'var(--fog)', marginTop: 6 }}>
                  {geleerd.beter ? tr('inzicht.leerBeter') : tr('inzicht.leerNietBeter')}
                </p>
                {lessen.length > 0 && (
                  <div className="meet-diagnose">
                    <p className="label" style={{ marginBottom: 6 }}>{tr('inzicht.leerWat')}</p>
                    <ul>
                      {lessen.map((l) => (
                        <li key={l.kenmerk}>{tr(l.richting === 'meer' ? 'inzicht.leerZwaarder' : 'inzicht.leerLichter', { wat: tr(`inzicht.km${l.kenmerk.charAt(0).toUpperCase()}${l.kenmerk.slice(1)}`) })}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <button
                  type="button" className={`switch-row ${geleerd.aan ? 'on' : ''}`} style={{ marginTop: 12 }}
                  onClick={() => app.setSmaakModel({ ...geleerd, aan: !geleerd.aan })} aria-pressed={!!geleerd.aan}
                >
                  <span className="switch" aria-hidden="true"><span className="knob" /></span>
                  {tr('inzicht.leerGebruik')} <span className="state">{geleerd.aan ? tr('inzicht.leerAan') : tr('inzicht.leerUit')}</span>
                </button>
                <p style={{ fontSize: 12, color: 'var(--fog-dim)', marginTop: 8 }}>
                  {tr('inzicht.leerBron', { datum: fmtDatum(geleerd.at), fav: g.favorieten ?? 0, hoog: g.hoog ?? 0, laag: g.laag ?? 0, keuzes: (g.ja ?? 0) + (g.nee ?? 0) })}
                </p>
              </div>
            );
          })()}
          {leren && (
            <div style={{ marginTop: 12 }}>
              <div className="progressbar"><div style={{ width: `${Math.round((100 * leren.n) / leren.totaal)}%` }} /></div>
              <p style={{ fontSize: 12.5, color: 'var(--fog-dim)', marginTop: 6 }}>{tr('inzicht.leerBezig', { n: leren.n, totaal: leren.totaal })}</p>
            </div>
          )}
          {leerMelding && <p style={{ fontSize: 13.5, color: 'var(--fog)', marginTop: 10 }}>{leerMelding}</p>}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
            <button className="btn" onClick={leerSmaak} disabled={!!leren}>{geleerd ? tr('inzicht.leerOpnieuw') : tr('inzicht.leerKnop')}</button>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
        {metrics.map(([label, val]) => (
          <div className="card" key={label} style={{ padding: '14px 16px' }}>
            <p style={{ color: 'var(--fog-dim)', fontSize: 12 }}>{label}</p>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{val}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        {stats.genres.length > 0 && (
          <div className="card">
            <p className="label" style={{ marginBottom: 12 }}>{tr('inzicht.genres')}</p>
            <BarList items={stats.genres} color="var(--paper)" max={maxG} />
          </div>
        )}
        {stats.decades.length > 0 && (
          <div className="card">
            <p className="label" style={{ marginBottom: 12 }}>{tr('inzicht.decades')}</p>
            <BarList items={stats.decades} color="var(--fog)" max={maxD} />
          </div>
        )}
        {stats.directors.length > 0 && (
          <div className="card">
            <p className="label" style={{ marginBottom: 12 }}>{tr('inzicht.directorsMulti')}</p>
            <BarList items={stats.directors} color="var(--fog)" max={stats.directors[0][1]} />
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
          <p className="label" style={{ marginBottom: 12 }}><History size={13} style={{ verticalAlign: -2 }} /> Laatste picks, tik om te heropenen</p>
          <div style={{ display: 'grid', gap: 4 }}>
            {history.slice(0, 12).map((h, i) => (
              <button
                key={`${h.key}-${i}`} onClick={() => openPick(h)}
                style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13.5, background: 'none', border: 'none', borderBottom: i < Math.min(history.length, 12) - 1 ? '1px solid var(--line)' : 'none', padding: '6px 2px 8px', color: 'var(--paper)', textAlign: 'left', cursor: 'pointer' }}
              >
                <span>{h.name} <span style={{ color: 'var(--fog-dim)' }}>({h.year || '?'})</span>{h.context ? <span style={{ color: 'var(--fog-dim)', fontSize: 12 }}>, {h.context.toLowerCase()}</span> : null}</span>
                <span style={{ color: 'var(--fog-dim)', flexShrink: 0 }}>{new Date(h.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}</span>
              </button>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
