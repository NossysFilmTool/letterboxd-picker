import { useEffect, useState, useRef } from 'react';
import { Check, Send } from 'lucide-react';
import { useT } from '../lib/i18n.js';
import { IMG } from '../lib/tmdb.js';
import { getSession, sendVote } from '../lib/session.js';

// Het scherm voor wie via een deellink binnenkomt (?avond=CODE): naam invullen,
// films aantikken, stem versturen, wachten op de uitslag. Werkt zonder eigen
// watchlist of sleutel; alles komt uit de sessie.
export default function RemoteVote({ code, pollMs = 6000 }) {
  const { t: tr } = useT();
  const [sessie, setSessie] = useState(null);
  const [fout, setFout] = useState(null);
  const [naam, setNaam] = useState('');
  const [picks, setPicks] = useState([]);
  const [fase, setFase] = useState('stemmen'); // stemmen | bezig | verstuurd
  const [melding, setMelding] = useState('');
  const timerRef = useRef(null);

  const laad = async () => {
    try {
      const s = await getSession(code);
      setSessie(s);
      setFout(null);
    } catch (e) {
      if (!sessie) setFout(e.message);
    }
  };

  useEffect(() => {
    laad();
    timerRef.current = setInterval(laad, pollMs);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const toggle = (key) => setPicks((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));

  const verstuur = async () => {
    if (!naam.trim()) { setMelding(tr('remote.nameFirst')); return; }
    if (!picks.length) { setMelding(tr('remote.pickAtLeast')); return; }
    setMelding('');
    setFase('bezig');
    try {
      await sendVote(code, naam.trim(), picks);
      setFase('verstuurd');
    } catch (e) {
      setFase('stemmen');
      setMelding(e.message);
    }
  };

  if (fout) {
    return (
      <div className="wrap" style={{ maxWidth: 560, margin: '60px auto', textAlign: 'center' }}>
        <div className="card"><p className="big">{tr('remote.invalid')}</p></div>
      </div>
    );
  }
  if (!sessie) {
    return <div className="wrap" style={{ maxWidth: 560, margin: '60px auto', textAlign: 'center' }}><p>{tr('remote.loading')}</p></div>;
  }

  const winnaar = sessie.winner ? sessie.films.find((f) => f.key === sessie.winner) : null;
  if (winnaar) {
    return (
      <div className="wrap" style={{ maxWidth: 560, margin: '40px auto', textAlign: 'center' }}>
        <div className="card">
          <p className="label" style={{ marginBottom: 10 }}>{tr('remote.winnerIs')}</p>
          {winnaar.poster && <img src={IMG(winnaar.poster, 'w342')} alt="" style={{ width: 160, borderRadius: 10, marginBottom: 12 }} />}
          <p style={{ fontSize: 22, fontWeight: 600, color: 'var(--paper)' }}>{winnaar.name}{winnaar.year ? ` (${winnaar.year})` : ''}</p>
        </div>
      </div>
    );
  }

  if (fase === 'verstuurd') {
    return (
      <div className="wrap" style={{ maxWidth: 560, margin: '60px auto', textAlign: 'center' }}>
        <div className="card">
          <p className="big" style={{ marginBottom: 6 }}><Check size={18} style={{ verticalAlign: -3 }} /> {tr('remote.sentTitle')}</p>
          <p style={{ color: 'var(--fog)' }}>{tr('remote.sentWait', { host: sessie.host })}</p>
          <button className="btn ghost" style={{ marginTop: 14 }} onClick={() => setFase('stemmen')}>{tr('remote.changeVote')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap" style={{ maxWidth: 720, margin: '30px auto', padding: '0 14px' }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>{tr('remote.title', { host: sessie.host })}</h1>
      <p style={{ color: 'var(--fog)', marginBottom: 16 }}>{tr('remote.explain')}</p>
      <div className="poster-grid" style={{ marginBottom: 18 }}>
        {sessie.films.map((f) => (
          <button key={f.key} className={`poster-tile ${picks.includes(f.key) ? '' : ''}`} onClick={() => toggle(f.key)}
            aria-pressed={picks.includes(f.key)} aria-label={`${f.name}${f.year ? ` (${f.year})` : ''}`}
            style={picks.includes(f.key) ? { outline: '2px solid var(--dot-g)', outlineOffset: 2, borderRadius: 10 } : undefined}>
            <div className="poster">
              {f.poster ? <img src={IMG(f.poster, 'w342')} alt="" loading="lazy" /> : <span style={{ fontSize: 12, padding: 6 }}>{f.name}</span>}
              {picks.includes(f.key) && <span style={{ position: 'absolute', top: 6, right: 6, background: 'var(--dot-g)', color: '#08130b', borderRadius: '50%', width: 22, height: 22, display: 'grid', placeItems: 'center' }}><Check size={14} /></span>}
            </div>
            <span className="t">{f.name}</span>
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="field" style={{ maxWidth: 200 }} placeholder={tr('remote.namePlaceholder')} value={naam}
          onChange={(e) => setNaam(e.target.value)} aria-label={tr('remote.yourName')} />
        <button className="btn primary" onClick={verstuur} disabled={fase === 'bezig'}>
          <Send size={15} /> {fase === 'bezig' ? tr('remote.sending') : tr('remote.send')}
        </button>
        {melding && <span style={{ color: 'var(--dot-o)', fontSize: 13 }}>{melding}</span>}
      </div>
    </div>
  );
}
