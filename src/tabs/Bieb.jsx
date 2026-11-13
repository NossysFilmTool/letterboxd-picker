import { useMemo, useState, useEffect } from 'react';
import { Clapperboard, Check, ArrowLeft } from 'lucide-react';
import { IMG } from '../lib/tmdb.js';
import { nossyScore, fmtScore } from '../lib/pick.js';
import { useT } from '../lib/i18n.js';
import Winner from '../components/Winner.jsx';
import Kaartjesdoos, { KaartjeBeheer } from '../components/Kaartjesdoos.jsx';
import { inDeDoos, buitenDeDoos } from '../lib/kaartjesdoos.js';
import { recentGelogd } from '../lib/vondsten.js';
import { useLS } from '../lib/storage.js';

// Het archief (DESIGN.md, "Het programma"): je watchlist, wat je zag en je
// kaartjes. Geen muur van knopjes: je filtert met een zin waarin je op de
// onderstreepte woorden tikt. Op jaar gesorteerd staan de films per
// decennium, met grote cijfers als tussenkop.

const SORTS = ['nieuw', 'oud', 'titel', 'score', 'kort', 'lang'];

// Een woord in de filterzin: je ziet de keuze als tekst, eroverheen ligt een
// gewone keuzelijst (dus ook met toetsenbord en schermlezer te bedienen)
function Zinwoord({ label, value, onChange, opties, tekst }) {
  return (
    <span className="zinwoord">
      <span aria-hidden="true">{tekst}</span>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {opties.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </span>
  );
}

export default function Bieb({ app }) {
  const { t: tr } = useT();
  const { watchlist, watchedFilms, ratedFilms, ratings, meta, seenSet, freshenProviders, tmdbKey } = app;
  // watchlist | gezien | kaartjes; "Bekijk de doos" opent meteen op kaartjes
  const [scope, setScope] = useState(() => app.pakBiebStart?.() || 'watchlist');
  const [samenNaam] = useLS('samenNaam', '');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('nieuw');
  const [hideSeen, setHideSeen] = useState(false);
  const [genre, setGenre] = useState('');
  const [decade, setDecade] = useState('');
  const [shown, setShown] = useState(60);
  const [maxDur, setMaxDur] = useState('');
  const [prov, setProv] = useState('');
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
  const doos = useMemo(() => inDeDoos(app.kaartjesStand || []), [app.kaartjesStand]);
  const buiten = useMemo(() => buitenDeDoos((app.kaartjesStand || []).filter((k) => k.bron !== 'gevonden')), [app.kaartjesStand]);
  const gelogd = useMemo(() => recentGelogd(app.diary || [], new Set(doos.map((k) => k.key))), [app.diary, doos]);
  const tochGekeken = (k) => {
    app.pasKaartjeAan(k.id, { antwoord: 'gekeken', beantwoord: new Date().toISOString() });
    app.scheurAf(k, k.sterren ?? null);
  };

  const genresAvail = useMemo(() => {
    const count = {};
    base.forEach((f) => meta[f.key]?.genres?.forEach((g) => { count[g] = (count[g] || 0) + 1; }));
    return Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([g]) => g);
  }, [base, meta]);

  const provsAvail = useMemo(() => {
    const count = {};
    base.forEach((f) => meta[f.key]?.flat?.forEach((p) => { count[p] = (count[p] || 0) + 1; }));
    return Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([p]) => p);
  }, [base, meta]);

  const decadesAvail = useMemo(() => {
    const s = new Set();
    base.forEach((f) => { if (f.year) s.add(Math.floor(f.year / 10) * 10); });
    return [...s].sort((a, b) => b - a);
  }, [base]);

  const sortOptions = scope === 'gezien' ? [...SORTS, 'mijn'] : SORTS;

  useEffect(() => { setShown(60); }, [scope, q, sort, decade, maxDur, prov, genre, hideSeen]);

  const films = useMemo(() => {
    let list = base;
    if (scope === 'watchlist' && hideSeen) list = list.filter((f) => !seenSet.has(f.key));
    const needle = q.trim().toLowerCase();
    if (needle) list = list.filter((f) => f.name.toLowerCase().includes(needle));
    if (decade !== '') list = list.filter((f) => f.year && Math.floor(f.year / 10) * 10 === decade);
    if (maxDur !== '') list = list.filter((f) => meta[f.key]?.runtime && meta[f.key].runtime <= maxDur);
    if (genre) list = list.filter((f) => meta[f.key]?.genres?.includes(genre));
    if (prov) list = list.filter((f) => meta[f.key]?.flat?.includes(prov));

    const score = (f) => nossyScore(meta[f.key]) ?? -1;
    const runtime = (f) => meta[f.key]?.runtime ?? null;
    const sorted = [...list];
    switch (sort) {
      case 'nieuw': sorted.sort((a, b) => (b.year || 0) - (a.year || 0) || a.name.localeCompare(b.name, 'nl')); break;
      case 'oud': sorted.sort((a, b) => (a.year || 9999) - (b.year || 9999) || a.name.localeCompare(b.name, 'nl')); break;
      case 'score': sorted.sort((a, b) => score(b) - score(a)); break;
      case 'kort': sorted.sort((a, b) => (runtime(a) ?? 9999) - (runtime(b) ?? 9999)); break;
      case 'lang': sorted.sort((a, b) => (runtime(b) ?? -1) - (runtime(a) ?? -1)); break;
      case 'mijn': sorted.sort((a, b) => (ratings[b.key] || 0) - (ratings[a.key] || 0)); break;
      default: sorted.sort((a, b) => a.name.localeCompare(b.name, 'nl'));
    }
    return sorted;
  }, [base, scope, meta, seenSet, ratings, q, sort, hideSeen, decade, maxDur, genre, prov]);

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

  const filtersActief = genre || prov || decade !== '' || maxDur !== '';

  // Uitgelicht boven het archief: de film met het hoogste cijfer die je nog
  // niet zag, met zijn filmbeeld. Alleen zolang je niet zoekt of filtert.
  const uitgelicht = useMemo(() => {
    if (scope !== 'watchlist' || filtersActief || q.trim()) return null;
    let beste = null;
    watchlist.forEach((f) => {
      const m = meta[f.key];
      const ns = nossyScore(m);
      if (!m?.backdrop || ns == null || seenSet.has(f.key)) return;
      if (!beste || ns > beste.ns) beste = { f, m, ns };
    });
    return beste;
  }, [scope, filtersActief, q, watchlist, meta, seenSet]);

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
          <ArrowLeft size={15} /> {tr('bieb.terug')}
        </button>
        {sel.kaartjeId && (() => {
          // Vanuit de doos: dit kaartje beheren (sterren, notitie, toch niet)
          const k = (app.kaartjesStand || []).find((x) => x.id === sel.kaartjeId);
          if (!k || k.status !== 'gekeken') return null;
          return (
            <KaartjeBeheer key={k.id} k={k}
              onSterren={(n) => {
                app.pasKaartjeAan(k.id, { sterren: n });
                app.setOwnRatings((prev) => ({ ...prev, [k.key]: { rating: n, name: k.name, year: k.year, at: Date.now() } }));
              }}
              onNotitie={(tekst) => app.pasKaartjeAan(k.id, { notitie: tekst || undefined })}
              onNietGekeken={() => { app.pasKaartjeAan(k.id, { antwoord: 'niet' }); setSel(null); }} />
          );
        })()}
        <Winner
          film={sel} meta={meta[sel.key]}
          context={scope === 'kaartjes' ? tr('bieb.fromTickets') : scope === 'gezien'
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

  const tegel = (f, i) => {
    const m = meta[f.key];
    const ns = nossyScore(m);
    const eigen = ratings[f.key] ?? f.rating; // ratedFilms dragen hun rating zelf mee
    return (
      <button key={f.key} type="button" className="archief-film" style={{ opacity: busyKey === f.key ? 0.6 : 1 }} onClick={() => open(f)}
        aria-label={tr('common.openAria', { title: `${f.name}${f.year ? ` (${f.year})` : ''}` })} disabled={busyKey !== null}>
        <div className="poster">
          {m?.poster ? <img src={IMG(m.poster, 'w342')} alt="" loading={i > 11 ? 'lazy' : undefined} /> : <Clapperboard size={20} strokeWidth={1.4} aria-hidden="true" />}
          {scope === 'watchlist' && seenSet.has(f.key) && <span className="badge-seen" title={tr('common.seen')}><Check size={11} strokeWidth={3} /></span>}
        </div>
        <span className="archief-film-titel" aria-hidden="true">{busyKey === f.key ? tr('common.loading') : f.name}</span>
        <span className="archief-film-sub" aria-hidden="true">
          <span>{f.year || ''}</span>
          {scope === 'gezien' && eigen != null
            ? <span className="eigen">★ {fmtScore(eigen)}</span>
            : ns != null ? <span>{fmtScore(ns)}</span> : null}
        </span>
      </button>
    );
  };

  // Op jaar gesorteerd: per decennium, met het jaartal groot als tussenkop
  const zichtbaar = films.slice(0, shown);
  const perDecennium = (sort === 'nieuw' || sort === 'oud') && decade === ''
    ? zichtbaar.reduce((groepen, f) => {
      const d = f.year ? Math.floor(f.year / 10) * 10 : null;
      const laatste = groepen[groepen.length - 1];
      if (laatste && laatste.d === d) laatste.films.push(f);
      else groepen.push({ d, films: [f] });
      return groepen;
    }, [])
    : null;
  const aantalIn = (d) => films.filter((f) => (f.year ? Math.floor(f.year / 10) * 10 : null) === d).length;

  return (
    <div>
      <h1 className="page-title">{tr('bieb.title')}</h1>
      <div className="archief-tabs">
        <button type="button" className={`archief-tab ${scope === 'watchlist' ? 'actief' : ''}`} aria-pressed={scope === 'watchlist'} onClick={() => { setScope('watchlist'); setSort('nieuw'); }}>{tr('bieb.watchlist')} <sup>{watchlist.length}</sup></button>
        <button type="button" className={`archief-tab ${scope === 'gezien' ? 'actief' : ''}`} aria-pressed={scope === 'gezien'} onClick={() => { setScope('gezien'); setSort('mijn'); }}>{tr('bieb.tabGezien')} <sup>{gezienList.length}</sup></button>
        <button type="button" className={`archief-tab ${scope === 'kaartjes' ? 'actief' : ''}`} aria-pressed={scope === 'kaartjes'} onClick={() => setScope('kaartjes')}>{tr('bieb.tabKaartjes')} <sup>{doos.length}</sup></button>
      </div>

      {scope === 'kaartjes' && (
        <div style={{ marginTop: 20 }}>
          <Kaartjesdoos kaartjes={doos} buiten={buiten} gelogd={gelogd} meta={meta} eigenNaam={samenNaam.trim() || null}
            onOpen={(k) => open({ key: k.key, name: k.name, year: k.year, kaartjeId: k.id })} onTochGekeken={tochGekeken} onGevonden={app.gevondenToevoegen} />
        </div>
      )}

      {scope !== 'kaartjes' && (<>
      {scope === 'gezien' && watchedFilms.length === 0 && app.watchedLb.length > 0 && (
        <p className="notice warn" style={{ marginTop: 16 }}>
          {tr('bieb.alleenBeoordeeld')}
        </p>
      )}

      <p className="filterzin">
        {tr('bieb.zToon')}{' '}
        <Zinwoord label={tr('bieb.genreLabel')} value={genre} onChange={setGenre}
          tekst={genre ? genre.toLowerCase() : tr('bieb.zAlleGenres')}
          opties={[['', tr('bieb.zAlleGenres')], ...genresAvail.map((g) => [g, g])]} />
        {' '}{tr('bieb.zUit')}{' '}
        <Zinwoord label={tr('bieb.periodLabel')} value={decade} onChange={(v) => setDecade(v === '' ? '' : +v)}
          tekst={decade === '' ? tr('bieb.zAlleJaren') : tr('bieb.zJaren', { era: String(decade).slice(2) })}
          opties={[['', tr('common.allYears')], ...decadesAvail.map((d) => [d, tr('common.decade', { era: String(d).slice(2) })])]} />
        {', '}
        <Zinwoord label={tr('bieb.maxDurationLabel')} value={maxDur} onChange={(v) => setMaxDur(v === '' ? '' : +v)}
          tekst={maxDur === '' ? tr('bieb.zElkeLengte') : tr('bieb.zTot', { min: maxDur })}
          opties={[['', tr('common.anyDuration')], ...[90, 105, 120, 150, 180].map((d) => [d, `≤ ${d} min`])]} />
        {', '}
        <Zinwoord label={tr('bieb.whereLabel')} value={prov} onChange={setProv}
          tekst={prov ? tr('bieb.zOpDienst', { p: prov }) : tr('bieb.zOveral')}
          opties={[['', tr('bieb.zOveral')], ...provsAvail.map((p) => [p, p])]} />
        {scope === 'watchlist' && (
          <>
            {', '}
            <button type="button" className="zinwoord" aria-pressed={hideSeen} onClick={() => setHideSeen(!hideSeen)}>
              {hideSeen ? tr('bieb.zZonderGezien') : tr('bieb.zMetGezien')}
            </button>
          </>
        )}
        {'. '}{tr('bieb.zOp')}{' '}
        <Zinwoord label={tr('bieb.sortLabel')} value={sort} onChange={setSort}
          tekst={tr(`bieb.s_${sort}`)} opties={sortOptions.map((id) => [id, tr(`bieb.s_${id}`)])} />
        {'.'}
      </p>

      <label className="zoekregel">
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5l5 5" /></svg>
        <input type="search" placeholder={tr('bieb.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={tr('bieb.searchLabel')} />
        <span className="label-breed">{tr('bieb.header', { shown: films.length, count: base.length })}</span>
      </label>

      {uitgelicht && (
        <button type="button" className="uitgelicht" onClick={() => open(uitgelicht.f)} aria-label={tr('common.openAria', { title: uitgelicht.f.name })}>
          <img src={IMG(uitgelicht.m.backdrop, 'w1280')} alt="" />
          <span className="uitgelicht-regel">
            <span className="uitgelicht-titel">{uitgelicht.f.name}</span>
            <span className="label-breed">{tr('bieb.uitgelicht')}</span>
          </span>
          <span className="archief-film-sub uitgelicht-sub">
            <span>{[uitgelicht.f.year, uitgelicht.m.runtime ? `${uitgelicht.m.runtime} min` : null, uitgelicht.m.director].filter(Boolean).join('   ')}</span>
            <span>{fmtScore(uitgelicht.ns)}</span>
          </span>
        </button>
      )}

      {!films.length ? (
        <div className="empty card" style={{ marginTop: 24 }}><p className="big">{tr('bieb.nothingFound')}</p><p>{tr('bieb.noMatch')}</p></div>
      ) : (<>
        {perDecennium ? perDecennium.map((g) => (
          <section key={g.d ?? 'zonder'} className="decennium" aria-label={g.d != null ? tr('common.decade', { era: String(g.d).slice(2) }) : undefined}>
            <div className="decennium-kop">
              <h2>{g.d ?? '?'}</h2>
              <span className="label-breed">{tr('bieb.filmsIn', { count: aantalIn(g.d) })}</span>
            </div>
            <div className="archief-raster">{g.films.map((f, i) => tegel(f, i))}</div>
          </section>
        )) : (
          <div className="archief-raster" style={{ marginTop: 24 }}>{zichtbaar.map((f, i) => tegel(f, i))}</div>
        )}
        {films.length > shown && (
          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <button className="btn" onClick={() => setShown(shown + 60)}>{tr('common.showMore', { count: films.length - shown })}</button>
          </div>
        )}
      </>)}
      </>)}
    </div>
  );
}
