import { useEffect, useRef, useState } from 'react';
import { Check, Upload, Send } from 'lucide-react';
import { useT } from '../lib/i18n.js';
import { IMG, enrichAll, effectiveTmdbKey } from '../lib/tmdb.js';
import { parseLetterboxdFiles } from '../lib/csv.js';
import { getSession, sendScores } from '../lib/session.js';
import { usePoll } from '../lib/usePoll.js';
import { informatieveRatings, scoresUitExport, scoresUitKeuze } from '../lib/samen.js';

// Het scherm voor een gast bij "Voor ons" (?samen=CODE). Naam invullen, de
// eigen Letterboxd-export laden; deze telefoon leest daaruit de smaak en
// scoort de films van de avond. De export verlaat dit toestel niet: alleen
// de scores gaan naar de sessie (lib/samen.js). Zonder export kun je ook
// gewoon aantikken wat je ziet zitten.
export default function SamenGast({ code, pollMs = 10000 }) {
  const { t: tr } = useT();
  const [sessie, setSessie] = useState(null);
  const [fout, setFout] = useState(null);
  const [naam, setNaam] = useState('');
  const [fase, setFase] = useState('invoer'); // invoer | lezen | kiezen | bezig | verstuurd
  const [voortgang, setVoortgang] = useState({ done: 0, total: 0 });
  const [gekozen, setGekozen] = useState([]);
  const [top, setTop] = useState([]);
  const [melding, setMelding] = useState('');
  const bestand = useRef(null);

  const laad = async () => {
    try { setSessie(await getSession(code)); setFout(null); } catch (e) { if (!sessie) setFout(e.message); }
  };
  useEffect(() => { laad(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [code]);
  usePoll(laad, pollMs, fase === 'verstuurd' && !sessie?.winner);

  const verstuur = async (scores) => {
    setFase('bezig');
    try {
      await sendScores(code, naam.trim(), scores);
      const films = Object.fromEntries((sessie.films || []).map((f) => [f.key, f]));
      setTop(Object.entries(scores).filter(([, v]) => !v.g && v.s != null && v.s >= 60)
        .sort((a, b) => b[1].s - a[1].s).slice(0, 3).map(([k]) => films[k]).filter(Boolean));
      setFase('verstuurd');
    } catch (e) {
      setFase('invoer');
      setMelding(e.message === 'FULL' ? tr('samen.vol') : tr('samen.verstuurFout', { msg: e.message }));
    }
  };

  const leesExport = async (files) => {
    if (!naam.trim()) { setMelding(tr('remote.nameFirst')); return; }
    if (!files?.length) return;
    setMelding('');
    let exp;
    try { exp = await parseLetterboxdFiles(Array.from(files)); } catch { setMelding(tr('samen.leesFout')); return; }
    const rated = exp.ratings?.films || [];
    const lijst = exp.watchlist || [];
    if (!rated.length && !lijst.length) { setMelding(tr('samen.geenData')); return; }
    // Wat we ophalen: de beoordelingen die het meest zeggen, en bij weinig
    // beoordelingen een deel van de watchlist (dan zegt die iets over genres)
    const ophalen = [...informatieveRatings(rated, 120), ...(rated.length < 15 ? lijst.slice(0, 60) : [])];
    const meta = {};
    setFase('lezen');
    setVoortgang({ done: 0, total: ophalen.length });
    try {
      await enrichAll(ophalen, effectiveTmdbKey(''), (p) => setVoortgang(p), (key, m) => { if (m) meta[key] = m; });
    } catch { /* wat binnen is, telt */ }
    await verstuur(scoresUitExport(sessie.films, exp, meta));
  };

  const wrap = (inhoud, breed = false) => (
    <div className="wrap samen-gast" style={{ maxWidth: breed ? 720 : 560, margin: '30px auto', padding: '0 14px' }}>{inhoud}</div>
  );

  if (fout) return wrap(<div className="card"><p className="big">{tr('remote.invalid')}</p></div>);
  if (!sessie) return wrap(<p>{tr('remote.loading')}</p>);

  const winnaar = sessie.winner ? sessie.films.find((f) => f.key === sessie.winner) : null;
  if (winnaar) {
    return wrap(
      <div className="card" style={{ textAlign: 'center' }}>
        <p className="label" style={{ marginBottom: 10 }}>{tr('remote.winnerIs')}</p>
        {winnaar.poster && <img src={IMG(winnaar.poster, 'w342')} alt="" style={{ width: 160, borderRadius: 2, marginBottom: 12 }} />}
        <p style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 700, color: 'var(--paper)' }}>{winnaar.name}{winnaar.year ? ` (${winnaar.year})` : ''}</p>
      </div>,
    );
  }

  if (fase === 'verstuurd') {
    return wrap(
      <div className="card">
        <p className="big" style={{ marginBottom: 6 }}><Check size={18} style={{ verticalAlign: -3 }} /> {tr('samen.verstuurdTitel')}</p>
        <p style={{ color: 'var(--fog)' }}>{tr('samen.verstuurdUitleg', { host: sessie.host })}</p>
        {top.length > 0 && (
          <>
            <p className="label" style={{ marginTop: 16, marginBottom: 8 }}>{tr('samen.jouwTop')}</p>
            <ol className="samen-top">{top.map((f) => <li key={f.key}>{f.name}{f.year ? ` (${f.year})` : ''}</li>)}</ol>
          </>
        )}
      </div>,
    );
  }

  if (fase === 'lezen' || fase === 'bezig') {
    const pct = voortgang.total ? Math.round((voortgang.done / voortgang.total) * 100) : 0;
    return wrap(
      <div className="card">
        <p className="big" style={{ marginBottom: 10 }}>{fase === 'bezig' ? tr('remote.sending') : tr('samen.lezen', { done: voortgang.done, total: voortgang.total })}</p>
        <div className="progressbar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${pct}%` }} /></div>
        <p style={{ color: 'var(--fog)', fontSize: 13, marginTop: 10 }}>{tr('samen.lezenUitleg')}</p>
      </div>,
    );
  }

  if (fase === 'kiezen') {
    return wrap(
      <>
        <h1 className="samen-kop">{tr('samen.titel', { host: sessie.host })}</h1>
        <p style={{ color: 'var(--fog)', marginBottom: 16 }}>{tr('samen.kiesUitleg')}</p>
        <div className="poster-grid" style={{ marginBottom: 18 }}>
          {sessie.films.map((f) => {
            const aan = gekozen.includes(f.key);
            return (
              <button key={f.key} type="button" className="poster-tile" aria-pressed={aan} aria-label={`${f.name}${f.year ? ` (${f.year})` : ''}`}
                onClick={() => setGekozen((g) => (aan ? g.filter((k) => k !== f.key) : [...g, f.key]))}
                style={aan ? { outline: '2px solid var(--paper)', outlineOffset: 2, borderRadius: 3 } : undefined}>
                <div className="poster">{f.poster ? <img src={IMG(f.poster, 'w342')} alt="" loading="lazy" /> : <span style={{ fontSize: 12, padding: 6 }}>{f.name}</span>}</div>
                <span className="t">{f.name}</span>
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="btn primary" onClick={() => (gekozen.length ? verstuur(scoresUitKeuze(sessie.films, gekozen)) : setMelding(tr('remote.pickAtLeast')))}>
            <Send size={15} /> {tr('remote.send')}
          </button>
          <button type="button" className="btn ghost" onClick={() => setFase('invoer')}>{tr('pick.followupTerug')}</button>
          {melding && <span style={{ color: 'var(--dot-o)', fontSize: 13 }}>{melding}</span>}
        </div>
      </>,
      true,
    );
  }

  return wrap(
    <>
      <h1 className="samen-kop">{tr('samen.titel', { host: sessie.host })}</h1>
      <p style={{ color: 'var(--paper)', marginBottom: 8 }}>{tr('samen.uitleg', { host: sessie.host, count: sessie.films.length })}</p>
      <p style={{ color: 'var(--fog)', fontSize: 13.5, marginBottom: 18 }}>{tr('samen.exportHoe')}</p>
      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span className="label">{tr('remote.yourName')}</span>
          <input className="field" style={{ maxWidth: 240 }} placeholder={tr('remote.namePlaceholder')} value={naam} onChange={(e) => setNaam(e.target.value)} aria-label={tr('remote.yourName')} />
        </label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="btn primary" onClick={() => (naam.trim() ? bestand.current?.click() : setMelding(tr('remote.nameFirst')))}>
            <Upload size={15} /> {tr('samen.kiesExport')}
          </button>
          <input ref={bestand} type="file" accept=".zip,.csv" hidden onChange={(e) => { leesExport(e.target.files); e.target.value = ''; }} />
          <button type="button" className="linkbtn" onClick={() => (naam.trim() ? setFase('kiezen') : setMelding(tr('remote.nameFirst')))}>{tr('samen.zonderExport')}</button>
        </div>
        {melding && <p style={{ color: 'var(--dot-o)', fontSize: 13 }}>{melding}</p>}
        <p style={{ color: 'var(--fog-dim)', fontSize: 12.5 }}>{tr('samen.privacy', { host: sessie.host })}</p>
      </div>
    </>,
  );
}
