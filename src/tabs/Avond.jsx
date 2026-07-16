import { useMemo, useRef, useState } from 'react';
import { useT } from '../lib/i18n.js';
import { Users, Swords, Ban, Clapperboard, RotateCcw, Upload, Info, ArrowLeft, X } from 'lucide-react';
import { IMG } from '../lib/tmdb.js';
import { sample, nossyScore } from '../lib/pick.js';
import { parseLetterboxdFiles } from '../lib/csv.js';
import Winner from '../components/Winner.jsx';

function Tile({ film, meta, onClick, struck, label, index = 0, onInfo }) {
  const { t: tr } = useT();
  return (
    <button className={`poster-tile ${struck ? 'struck' : ''}`} onClick={onClick} aria-label={label || film.name} style={{ '--i': Math.min(index, 19) }}>
      <div className="poster">
        {meta?.poster ? <img src={IMG(meta.poster, 'w342')} alt="" loading="lazy" /> : <Clapperboard size={20} strokeWidth={1.4} aria-hidden="true" />}
        {struck && <span className="stamp" aria-hidden="true"><span>VETO</span></span>}
        {onInfo && !struck && (
          <span className="info-dot" role="button" tabIndex={0} aria-label={tr('avond.infoAria', { name: film.name })}
            onClick={(e) => { e.stopPropagation(); onInfo(film); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onInfo(film); } }}>
            <Info size={13} />
          </span>
        )}
      </div>
      <div className="t">{film.name}</div>
      <div className="y">{film.year || ''}</div>
    </button>
  );
}

export default function Avond({ app }) {
  const { t: tr } = useT();
  const { watchlist, meta, seenSet } = app;
  const [mode, setMode] = useState(null); // null | veto | bracket
  const [playerCount, setPlayerCount] = useState(2);
  const [useOverlap, setUseOverlap] = useState(false);
  const [friend, setFriend] = useState(null); // {name, keys:Set}
  const friendRef = useRef(null);

  // veto state
  const [vetoFilms, setVetoFilms] = useState([]);
  const [struckKeys, setStruckKeys] = useState([]);
  const [info, setInfo] = useState(null); // even spieken: filmkaart zonder de ronde te verstoren
  const peek = (film) => { setInfo(film); app.ensureDetail(film); app.freshenProviders(film.key); };
  // bracket state
  const [rounds, setRounds] = useState([]); // [[films...]] per ronde
  const [pairIdx, setPairIdx] = useState(0);
  const [nextRound, setNextRound] = useState([]);
  const [champion, setChampion] = useState(null);
  // Vooraf filteren welke films meedoen aan de avond
  const [fGenres, setFGenres] = useState([]);
  const [fMaxRuntime, setFMaxRuntime] = useState('');
  const [fMinScore, setFMinScore] = useState(0);
  const [fJaarVan, setFJaarVan] = useState('');
  const [fJaarTot, setFJaarTot] = useState('');
  const [fStreamOnly, setFStreamOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const basePool = useMemo(() => {
    let p = watchlist.filter((f) => !seenSet.has(f.key));
    if (useOverlap && friend) p = p.filter((f) => friend.keys.has(f.key));
    if (fGenres.length) p = p.filter((f) => meta[f.key]?.genres?.some((g) => fGenres.includes(g)));
    if (fMaxRuntime) p = p.filter((f) => meta[f.key]?.runtime && meta[f.key].runtime <= fMaxRuntime);
    if (fMinScore) p = p.filter((f) => (nossyScore(meta[f.key]) ?? 0) >= fMinScore);
    if (fJaarVan !== '') p = p.filter((f) => f.year && f.year >= +fJaarVan);
    if (fJaarTot !== '') p = p.filter((f) => f.year && f.year <= +fJaarTot);
    if (fStreamOnly) p = p.filter((f) => meta[f.key]?.flat?.length);
    return p;
  }, [watchlist, seenSet, useOverlap, friend, meta, fGenres, fMaxRuntime, fMinScore, fJaarVan, fJaarTot, fStreamOnly]);

  const genresAvail = useMemo(() => {
    const count = {};
    watchlist.forEach((f) => meta[f.key]?.genres?.forEach((g) => { count[g] = (count[g] || 0) + 1; }));
    return Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([g]) => g);
  }, [watchlist, meta]);

  const decadesAvail = useMemo(() => {
    const s = new Set();
    watchlist.forEach((f) => { if (f.year) s.add(Math.floor(f.year / 10) * 10); });
    return [...s].sort((a, b) => b - a);
  }, [watchlist]);

  const filtersActief = fGenres.length || fMaxRuntime || fMinScore || fJaarVan !== '' || fJaarTot !== '' || fStreamOnly;
  const wisFilters = () => { setFGenres([]); setFMaxRuntime(''); setFMinScore(0); setFJaarVan(''); setFJaarTot(''); setFStreamOnly(false); };

  const loadFriend = async (files) => {
    if (!files?.length) return;
    try {
      const res = await parseLetterboxdFiles(Array.from(files));
      if (!res.watchlist?.length) { alert(tr('avond.noWatchlistInFile')); return; }
      setFriend({ name: files[0].name.replace(/\.(zip|csv)$/i, ''), keys: new Set(res.watchlist.map((f) => f.key)) });
      setUseOverlap(true);
    } catch (e) { alert(`Laden mislukt: ${e.message}`); }
  };

  const startVeto = () => {
    const n = Math.min(8, basePool.length);
    setVetoFilms(sample(basePool, n));
    setStruckKeys([]);
    setChampion(null);
    setMode('veto');
  };

  const startBracket = () => {
    const n = basePool.length >= 8 ? 8 : 4;
    setRounds([sample(basePool, n)]);
    setPairIdx(0);
    setNextRound([]);
    setChampion(null);
    setMode('bracket');
  };

  const strike = (film) => {
    const struck = [...struckKeys, film.key];
    setStruckKeys(struck);
    const left = vetoFilms.filter((f) => !struck.includes(f.key));
    if (left.length === 1) { setChampion(left[0]); app.freshenProviders(left[0].key); }
  };

  const pickDuel = (film) => {
    const cur = rounds[rounds.length - 1];
    const advanced = [...nextRound, film];
    if ((pairIdx + 1) * 2 >= cur.length) {
      if (advanced.length === 1) { setChampion(advanced[0]); app.freshenProviders(advanced[0].key); return; }
      setRounds((r) => [...r, advanced]);
      setNextRound([]);
      setPairIdx(0);
    } else {
      setNextRound(advanced);
      setPairIdx(pairIdx + 1);
    }
  };

  const reset = () => { setMode(null); setChampion(null); };

  if (!watchlist.length) {
    return (
      <div>
        <h1 className="page-title">{tr('avond.title')}</h1>
        <div className="empty card" style={{ marginTop: 20 }}>
          <p className="big">{tr('avond.needWatchlist')}</p>
          <p>{tr('avond.needWatchlistHint')}</p>
        </div>
      </div>
    );
  }

  // ---------- even spieken (info-kaart) ----------
  if (info) {
    return (
      <div>
        <button className="btn ghost" style={{ marginBottom: 14 }} onClick={() => setInfo(null)}>
          <ArrowLeft size={15} /> Terug naar de ronde
        </button>
        <Winner film={info} meta={meta[info.key]} context={tr('avond.peek')} />
      </div>
    );
  }

  // ---------- winnaar ----------
  if (champion) {
    return (
      <div>
        <div className="toprow">
          <div><h1 className="page-title">{tr('avond.title')}</h1><p className="page-sub">{tr('avond.groupSpoke')}</p></div>
          <button className="btn" onClick={reset}><RotateCcw size={15} /> Nieuwe ronde</button>
        </div>
        <Winner
          film={champion} meta={meta[champion.key]}
          context={mode === 'veto' ? tr('avond.survivedVetoes') : tr('avond.bracketWinner')}
          seen={seenSet.has(champion.key)} onToggleSeen={() => app.toggleSeen(champion.key)}
        />
      </div>
    );
  }

  // ---------- veto ronde ----------
  if (mode === 'veto') {
    const left = vetoFilms.filter((f) => !struckKeys.includes(f.key));
    const turn = struckKeys.length % playerCount;
    return (
      <div>
        <div className="toprow">
          <div>
            <h1 className="page-title">{tr('avond.vetoRound')}</h1>
            <p className="page-sub">Speler {turn + 1} is aan de beurt — tik de film weg die jíj niet wilt. Nog {left.length} over.</p>
          </div>
          <button className="btn ghost" onClick={reset}>{tr('common.stop')}</button>
        </div>
        <div className="poster-grid">
          {vetoFilms.map((f, i) => (
            <Tile key={f.key} film={f} meta={meta[f.key]} index={i} struck={struckKeys.includes(f.key)} onClick={() => strike(f)} label={`Streep ${f.name} weg`} onInfo={peek} />
          ))}
        </div>
        <p style={{ color: 'var(--fog-dim)', fontSize: 13, marginTop: 16 }}>{tr('avond.vetoHint')}</p>
      </div>
    );
  }

  // ---------- bracket duel ----------
  if (mode === 'bracket') {
    const cur = rounds[rounds.length - 1];
    const a = cur[pairIdx * 2];
    const b = cur[pairIdx * 2 + 1];
    const roundName = cur.length === 8 ? tr('avond.quarterfinal') : cur.length === 4 ? tr('avond.semifinal') : tr('avond.final');
    return (
      <div>
        <div className="toprow">
          <div>
            <h1 className="page-title">{roundName}</h1>
            <p className="page-sub">Duel {pairIdx + 1} van {cur.length / 2} — beslis samen: welke wint?</p>
          </div>
          <button className="btn ghost" onClick={reset}>{tr('common.stop')}</button>
        </div>
        <div className="duel fade-up" key={`${rounds.length}-${pairIdx}`}>
          <button className="duel-card" onClick={() => pickDuel(a)}>
            <div className="poster" style={{ maxWidth: 190, margin: '0 auto', position: 'relative' }}>
              {meta[a.key]?.poster ? <img src={IMG(meta[a.key].poster, 'w342')} alt="" /> : <Clapperboard size={22} strokeWidth={1.4} aria-hidden="true" />}
              <span className="info-dot" role="button" tabIndex={0} aria-label={tr('avond.infoAria', { name: a.name })}
                onClick={(e) => { e.stopPropagation(); peek(a); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); peek(a); } }}>
                <Info size={13} />
              </span>
            </div>
            <div className="t">{a.name}</div><div className="y">{a.year || ''}</div>
          </button>
          <div className="vs" aria-hidden="true">vs</div>
          <button className="duel-card" onClick={() => pickDuel(b)}>
            <div className="poster" style={{ maxWidth: 190, margin: '0 auto', position: 'relative' }}>
              {meta[b.key]?.poster ? <img src={IMG(meta[b.key].poster, 'w342')} alt="" /> : <Clapperboard size={22} strokeWidth={1.4} aria-hidden="true" />}
              <span className="info-dot" role="button" tabIndex={0} aria-label={tr('avond.infoAria', { name: b.name })}
                onClick={(e) => { e.stopPropagation(); peek(b); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); peek(b); } }}>
                <Info size={13} />
              </span>
            </div>
            <div className="t">{b.name}</div><div className="y">{b.year || ''}</div>
          </button>
        </div>
      </div>
    );
  }

  // ---------- setup ----------
  return (
    <div>
      <div className="toprow">
        <div>
          <h1 className="page-title">{tr('avond.title')}</h1>
          <p className="page-sub">Samen kiezen zonder discussie: {basePool.length} kandidaten in de pot.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <p className="label" style={{ marginBottom: 10 }}>{tr('avond.pot')}</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className={`chip ${!useOverlap ? 'on-g' : ''}`} onClick={() => setUseOverlap(false)}>{tr('avond.myWatchlist')}</button>
          <button className={`chip ${useOverlap ? 'on-g' : ''}`} onClick={() => friend ? setUseOverlap(true) : friendRef.current?.click()} disabled={!friend && !basePool.length}>
            Overlap met een vriend {friend ? `(${friend.name})` : ''}
          </button>
          <button className="btn ghost" onClick={() => friendRef.current?.click()}><Upload size={14} /> {friend ? tr('avond.loadOtherFriend') : tr('avond.loadFriendWatchlist')}</button>
          <input ref={friendRef} type="file" accept=".zip,.csv" hidden onChange={(e) => { loadFriend(e.target.files); e.target.value = ''; }} />
        </div>
        {useOverlap && friend && (
          <p style={{ color: 'var(--fog)', fontSize: 13, marginTop: 10 }}>
            {tr('avond.overlapCount', { count: basePool.length })}{basePool.length < 4 ? tr('avond.overlapTooFew') : ''}.
          </p>
        )}
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <p className="label" style={{ margin: 0 }}>{tr('avond.filtersOpt', { suffix: filtersActief ? tr('avond.filtersActiveSuffix', { count: basePool.length }) : tr('avond.filtersOptSuffix') })}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            {filtersActief && <button className="btn ghost" onClick={wisFilters}><X size={14} /> {tr('common.clear')}</button>}
            <button className="btn ghost" onClick={() => setShowFilters(!showFilters)}>{showFilters ? tr('common.hide') : tr('common.showFilters')}</button>
          </div>
        </div>
        {showFilters && (
          <div style={{ marginTop: 14 }}>
            {genresAvail.length > 0 && (
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 12 }}>
                {genresAvail.map((g) => (
                  <button key={g} className={`chip ${fGenres.includes(g) ? 'on' : ''}`} style={{ fontSize: 12, padding: '5px 10px' }}
                    onClick={() => setFGenres((a) => (a.includes(g) ? a.filter((x) => x !== g) : [...a, g]))}>{g}</button>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--fog)' }}>{tr('avond.year')}</span>
              <input className="field" type="number" min="1880" max="2100" style={{ width: 80 }} placeholder={tr('avond.from')}
                value={fJaarVan} aria-label={tr('avond.yearFrom')} onChange={(e) => setFJaarVan(e.target.value === '' ? '' : +e.target.value)} />
              <span style={{ color: 'var(--fog-dim)' }}>–</span>
              <input className="field" type="number" min="1880" max="2100" style={{ width: 80 }} placeholder={tr('avond.to')}
                value={fJaarTot} aria-label={tr('avond.yearTot')} onChange={(e) => setFJaarTot(e.target.value === '' ? '' : +e.target.value)} />
              {decadesAvail.slice(0, 6).map((d) => (
                <button key={d} className="chip" style={{ fontSize: 12, padding: '4px 9px' }} onClick={() => { setFJaarVan(d); setFJaarTot(d + 9); }}>{`'${String(d).slice(2)}`}</button>
              ))}
              <select className="field" style={{ width: 'auto' }} value={fMaxRuntime} onChange={(e) => setFMaxRuntime(e.target.value === '' ? '' : +e.target.value)} aria-label={tr('avond.maxDuration')}>
                <option value="">{tr('common.anyDuration')}</option>
                {[90, 105, 120, 150].map((d) => <option key={d} value={d}>≤ {d} min</option>)}
              </select>
              <select className="field" style={{ width: 'auto' }} value={fMinScore} onChange={(e) => setFMinScore(+e.target.value)} aria-label={tr('avond.minNossy')}>
                <option value={0}>{tr('common.anyScore')}</option>
                {[6.5, 7.0, 7.5].map((s) => <option key={s} value={s}>{String(s).replace('.', ',')}+</option>)}
              </select>
              <button className={`chip ${fStreamOnly ? 'on-g' : ''}`} onClick={() => setFStreamOnly(!fStreamOnly)}>{tr('avond.onlyStreaming')}</button>
            </div>
            {filtersActief && basePool.length < 4 && (
              <p style={{ color: 'var(--dot-o)', fontSize: 12.5, marginTop: 10 }}>{tr('avond.tooFew', { count: basePool.length })}</p>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        <div className="card">
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 400 }}><Ban size={18} style={{ verticalAlign: -3, color: 'var(--dot-o)' }} /> Veto-rondes</h2>
          <p style={{ color: 'var(--fog)', fontSize: 13.5, marginTop: 8 }}>
            {Math.min(8, basePool.length)} films op tafel. Om de beurt streept iedereen er één weg — wat overblijft, kijken jullie. Telefoon doorgeven en klaar.
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 13, color: 'var(--fog)' }}>{tr('avond.players')}</label>
            <select className="field" style={{ width: 76 }} value={playerCount} onChange={(e) => setPlayerCount(+e.target.value)} aria-label={tr('avond.playerCount')}>
              {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <button className="btn primary" onClick={startVeto} disabled={basePool.length < 4}><Users size={15} /> {tr('avond.startVeto')}</button>
          </div>
        </div>
        <div className="card">
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 400 }}><Swords size={18} style={{ verticalAlign: -3, color: 'var(--dot-g)' }} /> Knock-out bracket</h2>
          <p style={{ color: 'var(--fog)', fontSize: 13.5, marginTop: 8 }}>
            {basePool.length >= 8 ? 'Acht' : 'Vier'} films, duel voor duel van {basePool.length >= 8 ? 'kwartfinale' : 'halve finale'} naar de finale. Beslis elk duel samen — of wissel per duel wie kiest.
          </p>
          <div style={{ marginTop: 14 }}>
            <button className="btn primary" onClick={startBracket} disabled={basePool.length < 4}><Swords size={15} /> {tr('avond.startBracket')}</button>
          </div>
        </div>
      </div>
      {basePool.length < 4 && <p className="notice warn" style={{ marginTop: 16 }}>{tr('avond.min4')}</p>}
    </div>
  );
}
