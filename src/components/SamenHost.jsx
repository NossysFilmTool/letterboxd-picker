import { useMemo, useState } from 'react';
import { HeartHandshake, Copy, Check, Clapperboard, X } from 'lucide-react';
import { useT } from '../lib/i18n.js';
import { IMG } from '../lib/tmdb.js';
import { useLS } from '../lib/storage.js';
import { createSamen, getSession, closeSession } from '../lib/session.js';
import { usePoll } from '../lib/usePoll.js';
import { kiesKandidaten, scoorKandidaten, groepsRanglijst } from '../lib/samen.js';

// "Voor ons" voor de gastheer (Avond): een avond klaarzetten met films uit
// je watchlist, de link delen, en zien wat het best bij iedereen past. Jouw
// eigen scores rekent dit toestel uit met je eigen smaakprofiel; die van de
// gasten komen uit de sessie (lib/samen.js). Kiezen geeft een kaartje met
// alle namen (onKies).
export default function SamenHost({ app, pool, meta, onKies, pollMs = 8000 }) {
  const { t: tr } = useT();
  const [naam, setNaam] = useLS('samenNaam', '');
  const [avond, setAvond] = useState(null); // { code, films }
  const [gastScores, setGastScores] = useState({});
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState('');
  const [gekopieerd, setGekopieerd] = useState(false);
  const ik = naam.trim() || tr('samen.jij');

  usePoll(async () => {
    try { const s = await getSession(avond.code); setGastScores(s.scores || {}); } catch { /* volgende keer */ }
  }, pollMs, !!avond);

  const start = async () => {
    setMelding('');
    setBezig(true);
    try {
      const films = kiesKandidaten(pool, meta, 60);
      const { code } = await createSamen(films, ik);
      setAvond({ code, films });
      setGastScores({});
    } catch (e) {
      setMelding(e.message === 'WORKER_OUD' ? tr('samen.workerOud') : e.message === 'NO_KV' ? tr('avond.kvMissing') : tr('avond.remoteFailed', { msg: e.message }));
    }
    setBezig(false);
  };

  // Jouw scores: hier uitgerekend met je eigen smaakprofiel
  const mijnScores = useMemo(() => (avond ? scoorKandidaten(avond.films, app.taste) : {}), [avond, app.taste]);
  const scores = useMemo(() => ({ [ik]: mijnScores, ...gastScores }), [ik, mijnScores, gastScores]);
  const lijst = useMemo(() => (avond ? groepsRanglijst(avond.films, scores) : []), [avond, scores]);
  const gasten = Object.keys(gastScores);

  const kies = async (film) => {
    try { await closeSession(avond.code, film.key); } catch { /* de keuze blijft hier geldig */ }
    const namen = [ik, ...gasten.filter((n) => n !== ik)];
    setAvond(null);
    onKies({ key: film.key, name: film.name, year: film.year }, namen);
  };

  return (
    <div className="card samen-host">
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700 }}>
        <HeartHandshake size={18} style={{ verticalAlign: -3, color: 'var(--fog)' }} /> {tr('samen.hostTitel')}
      </h2>
      {!avond ? (
        <>
          <p style={{ color: 'var(--fog)', fontSize: 13.5, marginTop: 8 }}>{tr('samen.hostUitleg')}</p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
            <input className="field" style={{ maxWidth: 180 }} placeholder={tr('remote.namePlaceholder')} value={naam} onChange={(e) => setNaam(e.target.value)} aria-label={tr('remote.yourName')} />
            <button type="button" className="btn primary" onClick={start} disabled={bezig || pool.length < 2}>
              <HeartHandshake size={15} /> {bezig ? tr('samen.starten') : tr('samen.start')}
            </button>
          </div>
          {melding && <p style={{ color: 'var(--dot-o)', fontSize: 13, marginTop: 10 }}>{melding}</p>}
        </>
      ) : (() => {
        const link = `${location.origin}${location.pathname}?samen=${avond.code}`;
        return (
          <>
            <p style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--paper)', marginTop: 10 }}>{tr('avond.remoteCode', { code: avond.code })}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
              <input className="field" readOnly value={link} style={{ flex: '1 1 220px' }} aria-label={tr('samen.link')} onFocus={(e) => e.target.select()} />
              <button type="button" className="btn" onClick={() => { navigator.clipboard?.writeText(link); setGekopieerd(true); setTimeout(() => setGekopieerd(false), 2000); }}>
                {gekopieerd ? <Check size={14} /> : <Copy size={14} />} {gekopieerd ? tr('samen.gekopieerd') : tr('samen.kopieer')}
              </button>
              <button type="button" className="btn ghost" onClick={() => setAvond(null)}><X size={14} /> {tr('common.stop')}</button>
            </div>
            <p style={{ color: 'var(--fog)', fontSize: 13.5, marginTop: 12 }}>
              {gasten.length ? tr('samen.doenMee', { namen: [ik, ...gasten].join(', ') }) : tr('samen.nogNiemand')}
            </p>
            <h3 className="samen-lijstkop">{gasten.length ? tr('samen.voorJullie') : tr('samen.voorJou')}</h3>
            <ol className="samen-lijst">
              {lijst.slice(0, 8).map((r, i) => (
                <li key={r.film.key} className={r.ellende || r.gezienDoor.length ? 'zwak' : undefined}>
                  <span className="samen-poster" aria-hidden="true">
                    {r.film.poster ? <img src={IMG(r.film.poster, 'w154')} alt="" loading="lazy" /> : <Clapperboard size={16} strokeWidth={1.4} />}
                  </span>
                  <span className="samen-info">
                    <span className="samen-titel">{r.film.name}{r.film.year ? ` (${r.film.year})` : ''}</span>
                    <span className="samen-per">
                      {Object.entries(r.per).map(([n, x]) => (
                        <span key={n} className={x.s != null && x.s < 45 ? 'laag' : undefined}>{n} {x.g ? tr('samen.alGezien') : x.s}</span>
                      ))}
                    </span>
                    {r.opLijstVan.length > 0 && <span className="samen-noot">{tr('samen.opLijstVan', { namen: r.opLijstVan.join(', ') })}</span>}
                  </span>
                  <span className="samen-score">
                    <span className="n">{r.gemiddeld ?? '?'}</span>
                    {i < 5 && !r.gezienDoor.length && (
                      <button type="button" className="btn" onClick={() => kies(r.film)}>{tr('samen.dezeKijkenWe')}</button>
                    )}
                  </span>
                </li>
              ))}
            </ol>
            <p style={{ color: 'var(--fog-dim)', fontSize: 12.5, marginTop: 10 }}>{tr('samen.hoeRang')}</p>
          </>
        );
      })()}
    </div>
  );
}
