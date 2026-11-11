import { useState } from 'react';
import { RefreshCw, Copy, Check, Link2, KeyRound } from 'lucide-react';
import { useT } from '../lib/i18n.js';
import { normaliseerCode } from '../lib/sync.js';
import { bevestig } from '../lib/melding.js';

// Setup: sync tussen je apparaten (lib/sync.js). Aanzetten maakt een geheime
// code; op een ander apparaat vul je die in (of open je de koppellink).
export default function SyncApparaten({ app }) {
  const { t: tr, lang } = useT();
  const { sync } = app;
  const { stand, bezig } = sync;
  const [invoer, setInvoer] = useState('');
  const [melding, setMelding] = useState('');
  const [toon, setToon] = useState(false);
  const [gekopieerd, setGekopieerd] = useState(false);
  const [gewisseld, setGewisseld] = useState(false);
  const code = stand?.code;
  const link = code ? `${location.origin}${location.pathname}?sync=${code}` : '';

  const koppel = () => {
    const c = normaliseerCode(invoer);
    if (!c) { setMelding(tr('sync.ongeldig')); return; }
    setMelding('');
    setInvoer('');
    sync.koppel(c);
  };
  const kopieer = () => {
    navigator.clipboard?.writeText(link);
    setGekopieerd(true);
    setTimeout(() => setGekopieerd(false), 2000);
  };
  const wanneer = stand?.laatst
    ? new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(stand.laatst))
    : null;
  const fout = stand?.fout && ({
    WORKER_OUD: tr('sync.workerOud'),
    NO_KV: tr('avond.kvMissing'),
    INGETROKKEN: tr('sync.ingetrokken'),
    GEEN_TOEGANG: tr('sync.geenToegang'),
  }[stand.fout] || tr('sync.fout', { msg: stand.fout }));
  const wissel = async () => {
    if (!await bevestig(tr('sync.wisselVraag'), { ja: tr('sync.wisselJa'), gevaar: true })) return;
    if (await sync.wissel()) { setGewisseld(true); setToon(true); }
  };

  return (
    <div className="card sync-kaart" style={{ marginBottom: 18 }}>
      <p className="label" style={{ marginBottom: 6 }}>{tr('sync.titel')}</p>
      {!code ? (
        <>
          <p style={{ color: 'var(--fog)', fontSize: 13.5, marginBottom: 12 }}>{tr('sync.uitleg')}</p>
          {app.demoMode ? (
            <p className="notice">{tr('sync.nietInDemo')}</p>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              <div><button type="button" className="btn primary" onClick={sync.start}><RefreshCw size={14} /> {tr('sync.aanzetten')}</button></div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <input className="field" style={{ maxWidth: 320 }} placeholder={tr('sync.codePlaceholder')} value={invoer}
                  onChange={(e) => setInvoer(e.target.value)} aria-label={tr('sync.codeLabel')}
                  onKeyDown={(e) => { if (e.key === 'Enter') koppel(); }} />
                <button type="button" className="btn" onClick={koppel}><Link2 size={14} /> {tr('sync.koppel')}</button>
              </div>
              {melding && <p style={{ color: 'var(--dot-o)', fontSize: 13 }}>{melding}</p>}
            </div>
          )}
        </>
      ) : (
        <>
          <p style={{ color: 'var(--fog)', fontSize: 13.5, marginBottom: 12 }}>{tr('sync.aanUitleg')}</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="sync-code" aria-label={tr('sync.codeLabel')}>{toon ? code : code.replace(/[A-Z0-9]/g, '•')}</span>
            <button type="button" className="linkbtn" onClick={() => setToon((v) => !v)}>{toon ? tr('sync.verberg') : tr('sync.toon')}</button>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
            <button type="button" className="btn" onClick={kopieer}>{gekopieerd ? <Check size={14} /> : <Copy size={14} />} {gekopieerd ? tr('samen.gekopieerd') : tr('sync.kopieerLink')}</button>
            <button type="button" className="btn" onClick={sync.nu} disabled={bezig}><RefreshCw size={14} /> {bezig ? tr('lbLive.bezig') : tr('sync.nu')}</button>
            <button type="button" className="btn ghost" onClick={wissel} disabled={bezig}><KeyRound size={14} /> {tr('sync.wissel')}</button>
            <button type="button" className="linkbtn" onClick={async () => { if (await bevestig(tr('sync.ontkoppelVraag'), { ja: tr('sync.ontkoppel') })) sync.ontkoppel(); }}>{tr('sync.ontkoppel')}</button>
          </div>
          {gewisseld && !fout && <p style={{ color: 'var(--dot-g)', fontSize: 13, marginTop: 10 }}>{tr('sync.gewisseld')}</p>}
          {!bezig && fout && <p style={{ color: 'var(--dot-o)', fontSize: 13, marginTop: 10 }}>{fout}</p>}
          {stand.fout === 'INGETROKKEN' && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
              <input className="field" style={{ maxWidth: 320 }} placeholder={tr('sync.nieuweCodePlaceholder')} value={invoer}
                onChange={(e) => setInvoer(e.target.value)} aria-label={tr('sync.codeLabel')}
                onKeyDown={(e) => { if (e.key === 'Enter') koppel(); }} />
              <button type="button" className="btn" onClick={koppel}><Link2 size={14} /> {tr('sync.koppel')}</button>
              {melding && <p style={{ color: 'var(--dot-o)', fontSize: 13 }}>{melding}</p>}
            </div>
          )}
          {!bezig && !fout && wanneer && <p style={{ color: 'var(--dot-g)', fontSize: 13, marginTop: 10 }}>{tr('sync.stand', { wanneer })}</p>}
          <p style={{ color: 'var(--fog-dim)', fontSize: 12.5, marginTop: 10 }}>{tr('sync.bewaar')}</p>
        </>
      )}
    </div>
  );
}
