import { useEffect, useMemo, useRef, useState } from 'react';
import { usePoll } from '../lib/usePoll.js';
import SamenHost from '../components/SamenHost.jsx';
import { useT } from '../lib/i18n.js';
import { remoteAvailable, createSession, getSession, closeSession, computeWinner } from '../lib/session.js';
import { Users, Swords, Ban, Clapperboard, RotateCcw, Upload, Info, ArrowLeft, Send } from 'lucide-react';
import { IMG } from '../lib/tmdb.js';
import { sample, nossyScore } from '../lib/pick.js';
import { parseLetterboxdFiles } from '../lib/csv.js';
import Winner from '../components/Winner.jsx';
import Pitch from '../components/Pitch.jsx';
import AvondFilters from '../components/AvondFilters.jsx';
import { filterPot, metStandaard } from '../lib/avondFilters.js';
import { ontgrendel } from '../lib/zaalgeluid.js';
import { leesOpslag } from '../lib/storage.js';

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
  const [friends, setFriends] = useState([]); // [{name, keys:Set}]
  const [remote, setRemote] = useState(null); // {code, films}
  const [remoteVotes, setRemoteVotes] = useState({});
  const [remoteWinner, setRemoteWinner] = useState(null);
  const [remoteBusy, setRemoteBusy] = useState(false);
  const [remoteMsg, setRemoteMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const friendRef = useRef(null);

  // veto state
  const [vetoFilms, setVetoFilms] = useState([]);
  const [struckKeys, setStruckKeys] = useState([]);
  const [info, setInfo] = useState(null); // even spieken: filmkaart zonder de ronde te verstoren
  // Eerst de trailers: elke film krijgt een korte pitch voordat er gestreept wordt
  const [pitchOpen, setPitchOpen] = useState(false);
  const pitchAan = app.settings?.vetoPitch !== false;
  // Het zaalgeluid bij de trailers; browsers willen dat aanzetten in een klik
  const geluidAan = app.settings?.pitchGeluid !== false;
  const openPitch = () => { if (geluidAan) ontgrendel(); setPitchOpen(true); };
  const zetGeluidAan = (v) => app.setSettings((s) => ({ ...s, pitchGeluid: v }));
  const peek = (film) => { setInfo(film); app.ensureDetail(film); app.freshenProviders(film.key); };
  // bracket state
  const [rounds, setRounds] = useState([]); // [[films...]] per ronde
  const [pairIdx, setPairIdx] = useState(0);
  const [nextRound, setNextRound] = useState([]);
  const [champion, setChampion] = useState(null);
  // Bij "Voor ons": wie er meededen (namen op het kaartje)
  const [championNamen, setChampionNamen] = useState(null);
  // De winnaar van de avond levert een kaartje op, voor iedereen die meedeed
  useEffect(() => {
    if (champion) {
      app.geefKaartje(champion, championNamen
        ? { bron: 'samen', personen: championNamen.length, namen: championNamen }
        : { bron: 'avond', personen: playerCount });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [champion?.key]);
  // Vooraf filteren welke films meedoen aan de avond
  // (lib/avondFilters.js), onthouden in de instellingen
  const filters = metStandaard(app.settings?.avondFilters);
  const zetFilters = (f) => app.setSettings((s) => ({ ...s, avondFilters: f }));
  // Je diensten uit Verken: dan telt "alleen op streaming" alleen die
  const [diensten] = useState(() => leesOpslag('mijnDiensten', []));

  const basePool = useMemo(() => {
    let p = watchlist.filter((f) => !seenSet.has(f.key));
    if (useOverlap && friends.length) p = p.filter((f) => friends.every((fr) => fr.keys.has(f.key)));
    return filterPot(p, meta, filters, nossyScore, { diensten });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlist, seenSet, useOverlap, friends, meta, JSON.stringify(filters), diensten]);

  const genresAvail = useMemo(() => {
    const count = {};
    watchlist.forEach((f) => meta[f.key]?.genres?.forEach((g) => { count[g] = (count[g] || 0) + 1; }));
    return Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([g]) => g);
  }, [watchlist, meta]);

  const decadesAvail = useMemo(() => {
    const s = new Set();
    watchlist.forEach((f) => { if (f.year) s.add(Math.floor(f.year / 10) * 10); });
    return [...s].sort((a, b) => b - a);
  }, [watchlist]);

  // --- Op afstand: gastheer ------------------------------------------------
  // Poll pauzeert bij een verborgen tabblad en stopt zodra er een winnaar is.
  usePoll(async () => {
    try { const s = await getSession(remote.code); setRemoteVotes(s.votes || {}); } catch { /* volgende poll */ }
  }, 10000, !!remote && !remoteWinner);

  const startRemote = async () => {
    setRemoteMsg('');
    setRemoteBusy(true);
    try {
      const kandidaten = [...basePool].sort(() => Math.random() - 0.5).slice(0, 12)
        .map((f) => ({ key: f.key, name: f.name, year: f.year, poster: meta[f.key]?.poster || null }));
      const { code } = await createSession(kandidaten, 'Nossy');
      setRemote({ code, films: kandidaten });
      setRemoteVotes({});
      setRemoteWinner(null);
    } catch (e) {
      setRemoteMsg(e.message === 'NO_KV' ? tr('avond.kvMissing') : tr('avond.remoteFailed', { msg: e.message }));
    }
    setRemoteBusy(false);
  };

  const sluitRemote = async () => {
    const { winner } = computeWinner(remote.films, remoteVotes, (f) => nossyScore(meta[f.key]));
    try { await closeSession(remote.code, winner.key); } catch { /* uitslag blijft lokaal geldig */ }
    setRemoteWinner(winner);
  };


  const loadFriend = async (files) => {
    if (!files?.length) return;
    try {
      const res = await parseLetterboxdFiles(Array.from(files));
      if (!res.watchlist?.length) { alert(tr('avond.noWatchlistInFile')); return; }
      const naam = files[0].name.replace(/\.(zip|csv)$/i, '');
      setFriends((prev) => [...prev.filter((fr) => fr.name !== naam), { name: naam, keys: new Set(res.watchlist.map((f) => f.key)) }]);
      setUseOverlap(true);
    } catch (e) { alert(tr('avond.ladenMislukt', { msg: e.message })); }
  };

  const kiesSamen = (film, namen) => {
    setChampionNamen(namen);
    setChampion(film);
    app.freshenProviders(film.key);
  };

  const startVeto = () => {
    setChampionNamen(null);
    const n = Math.min(8, basePool.length);
    const films = sample(basePool, n);
    setVetoFilms(films);
    // Verhaal, regie, rolverdeling en cijfers voor de trailers (en het spieken)
    films.forEach((f) => app.ensureDetail(f));
    if (pitchAan) openPitch(); else setPitchOpen(false);
    setStruckKeys([]);
    setChampion(null);
    setMode('veto');
  };

  const startBracket = () => {
    setChampionNamen(null);
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

  const reset = () => { setMode(null); setChampion(null); setChampionNamen(null); setPitchOpen(false); };

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
          <ArrowLeft size={15} /> {tr('avond.terugNaarRonde')}
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
          <button className="btn" onClick={reset}><RotateCcw size={15} /> {tr('avond.nieuweRonde')}</button>
        </div>
        <Winner
          film={champion} meta={meta[champion.key]}
          context={championNamen ? tr('samen.gekozenContext') : mode === 'veto' ? tr('avond.survivedVetoes') : tr('avond.bracketWinner')}
          kaartje={championNamen?.length || playerCount} namen={championNamen || undefined} onKijken={() => app.kaartjeDoorgeklikt(champion.key)}
          seen={seenSet.has(champion.key)} onToggleSeen={() => app.toggleSeen(champion.key)}
          onSimilar={() => app.openSimilar(champion, meta[champion.key])}
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
            <p className="page-sub">{tr('avond.vetoBeurt', { n: turn + 1, over: left.length })}</p>
          </div>
          <button className="btn ghost" onClick={reset}>{tr('common.stop')}</button>
        </div>
        <div className="poster-grid">
          {vetoFilms.map((f, i) => (
            <Tile key={f.key} film={f} meta={meta[f.key]} index={i} struck={struckKeys.includes(f.key)} onClick={() => strike(f)} label={tr('avond.streepWeg', { name: f.name })} onInfo={peek} />
          ))}
        </div>
        <p style={{ color: 'var(--fog-dim)', fontSize: 13, marginTop: 16 }}>{tr('avond.vetoHint')}</p>
        <button type="button" className="linkbtn" style={{ fontSize: 13, color: 'var(--fog)', marginTop: 10 }} onClick={openPitch}>
          {tr('avond.pitchTerugkijken')}
        </button>
        {pitchOpen && (
          <Pitch films={left} meta={meta} onKlaar={() => setPitchOpen(false)} tmdbKey={app.tmdbKey}
            geluid={geluidAan} onGeluid={zetGeluidAan} />
        )}
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
            <p className="page-sub">{tr('avond.duelVan', { i: pairIdx + 1, n: cur.length / 2 })}</p>
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
          <p className="page-sub">{tr('avond.pageSub', { count: basePool.length })}</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <p className="label" style={{ marginBottom: 10 }}>{tr('avond.pot')}</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className={`chip ${!useOverlap ? 'on-g' : ''}`} onClick={() => setUseOverlap(false)}>{tr('avond.myWatchlist')}</button>
          <button className={`chip ${useOverlap ? 'on-g' : ''}`} onClick={() => (friends.length ? setUseOverlap(true) : friendRef.current?.click())} disabled={!friends.length && !basePool.length}>
            {friends.length ? tr('avond.overlapChip', { names: friends.map((fr) => fr.name).join(' + ') }) : tr('avond.overlapChipEmpty')}
          </button>
          {friends.map((fr) => (
            <button key={fr.name} className="chip" aria-label={tr('avond.removeFriendAria', { name: fr.name })}
              onClick={() => setFriends((prev) => { const next = prev.filter((x) => x.name !== fr.name); if (!next.length) setUseOverlap(false); return next; })}>
              {fr.name} ✕
            </button>
          ))}
          <button className="btn ghost" onClick={() => friendRef.current?.click()}><Upload size={14} /> {friends.length ? tr('avond.loadOtherFriend') : tr('avond.loadFriendWatchlist')}</button>
          <input ref={friendRef} type="file" accept=".zip,.csv" hidden onChange={(e) => { loadFriend(e.target.files); e.target.value = ''; }} />
        </div>
        {useOverlap && friends.length > 0 && (
          <p style={{ color: 'var(--fog)', fontSize: 13, marginTop: 10 }}>
            {tr('avond.overlapCount', { count: basePool.length })}{basePool.length < 4 ? tr('avond.overlapTooFew') : ''}.
          </p>
        )}
      </div>

      <AvondFilters filters={filters} onChange={zetFilters} aantal={basePool.length} genres={genresAvail} decennia={decadesAvail} diensten={diensten} />

      {remoteAvailable() && (
        <div style={{ marginBottom: 16 }}>
          <SamenHost app={app} pool={basePool} meta={meta} onKies={kiesSamen} />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        {remoteAvailable() && (
          <div className="card">
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700 }}><Send size={18} style={{ verticalAlign: -3, color: 'var(--fog)' }} /> {tr('avond.remoteTitle')}</h2>
            {!remote && (
              <>
                <p style={{ color: 'var(--fog)', fontSize: 13.5, marginTop: 8 }}>{tr('avond.remoteExplain')}</p>
                <ol style={{ color: 'var(--fog)', fontSize: 13, margin: '10px 0 0 18px', display: 'grid', gap: 5 }}>
                  <li>{tr('avond.remoteHow1')}</li>
                  <li>{tr('avond.remoteHow2')}</li>
                  <li>{tr('avond.remoteHow3')}</li>
                </ol>
                <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button className="btn primary" onClick={startRemote} disabled={remoteBusy || basePool.length < 2}>
                    <Send size={15} /> {tr('avond.startRemote')}
                  </button>
                  {remoteMsg && <span style={{ color: 'var(--dot-o)', fontSize: 13 }}>{remoteMsg}</span>}
                </div>
              </>
            )}
            {remote && !remoteWinner && (() => {
              const link = `${location.origin}${location.pathname}?avond=${remote.code}`;
              const stemmers = Object.keys(remoteVotes);
              const telling = {};
              Object.values(remoteVotes).forEach((picks) => (picks || []).forEach((k) => { telling[k] = (telling[k] || 0) + 1; }));
              return (
                <div style={{ marginTop: 10 }}>
                  <p style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--paper)' }}>{tr('avond.remoteCode', { code: remote.code })}</p>
                  <button className="btn" style={{ marginTop: 8 }} onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
                    {copied ? tr('avond.copied') : tr('avond.copyLink')}
                  </button>
                  <p style={{ color: 'var(--fog)', fontSize: 13, marginTop: 12 }}>
                    {stemmers.length ? tr('avond.votesIn', { count: stemmers.length, names: stemmers.join(', ') }) : tr('avond.noVotesYet')}
                  </p>
                  <p style={{ color: 'var(--fog-dim)', fontSize: 12.5, marginTop: 6 }}>{tr('avond.remoteWaitHint')} {tr('avond.remoteValidity')}</p>
                  {stemmers.length > 0 && (
                    <ul style={{ margin: '10px 0 0', paddingLeft: 18, color: 'var(--fog)', fontSize: 13 }}>
                      {remote.films.filter((f) => telling[f.key]).sort((a, b) => telling[b.key] - telling[a.key]).map((f) => (
                        <li key={f.key}>{f.name}: {tr('avond.remoteVoteCount', { count: telling[f.key] })}</li>
                      ))}
                    </ul>
                  )}
                  <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                    <button className="btn primary" onClick={sluitRemote} disabled={!stemmers.length}>{tr('avond.closeRound')}</button>
                    <button className="btn ghost" onClick={() => { setRemote(null); setRemoteVotes({}); }}>{tr('avond.stopRound')}</button>
                  </div>
                </div>
              );
            })()}
            {remoteWinner && (
              <div style={{ marginTop: 12, textAlign: 'center' }}>
                <p className="label" style={{ marginBottom: 8 }}>{tr('remote.winnerIs')}</p>
                {meta[remoteWinner.key]?.poster && <img src={IMG(meta[remoteWinner.key].poster, 'w342')} alt="" style={{ width: 130, borderRadius: 2, marginBottom: 8 }} />}
                <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--paper)' }}>{remoteWinner.name}{remoteWinner.year ? ` (${remoteWinner.year})` : ''}</p>
                <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => { setRemote(null); setRemoteWinner(null); setRemoteVotes({}); }}>{tr('avond.stopRound')}</button>
              </div>
            )}
          </div>
        )}
        <div className="card">
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700 }}><Ban size={18} style={{ verticalAlign: -3, color: 'var(--fog)' }} /> {tr('avond.vetoTitel')}</h2>
          <p style={{ color: 'var(--fog)', fontSize: 13.5, marginTop: 8 }}>
            {tr('avond.vetoExplain', { count: Math.min(8, basePool.length) })}
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 13, color: 'var(--fog)' }}>{tr('avond.players')}</label>
            <select className="field" style={{ width: 76 }} value={playerCount} onChange={(e) => setPlayerCount(+e.target.value)} aria-label={tr('avond.playerCount')}>
              {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <button className="btn primary" onClick={startVeto} disabled={basePool.length < 4}><Users size={15} /> {tr('avond.startVeto')}</button>
          </div>
          <button type="button" className={`chip ${pitchAan ? 'on' : ''}`} style={{ marginTop: 12, fontSize: 12.5 }} aria-pressed={pitchAan}
            title={tr('avond.pitchAanTitel')} onClick={() => app.setSettings((s) => ({ ...s, vetoPitch: !(s.vetoPitch !== false) }))}>
            <Clapperboard size={13} style={{ verticalAlign: -2 }} /> {tr('avond.pitchAan')}
          </button>
        </div>
        <div className="card">
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700 }}><Swords size={18} style={{ verticalAlign: -3, color: 'var(--fog)' }} /> {tr('avond.bracketTitel')}</h2>
          <p style={{ color: 'var(--fog)', fontSize: 13.5, marginTop: 8 }}>
            {basePool.length >= 8 ? tr('avond.bracketUitleg8') : tr('avond.bracketUitleg4')}
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
