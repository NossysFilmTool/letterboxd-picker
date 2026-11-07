import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useT } from '../lib/i18n.js';
import { normaliseerNaam } from '../lib/lbLive.js';

// Setup: Letterboxd live aan of uit. Met je gebruikersnaam leest de app je
// openbare dagboek-feed mee (lib/lbLive.js); zonder doet hij niets.
export default function LetterboxdLive({ app }) {
  const { t: tr, lang } = useT();
  const [invoer, setInvoer] = useState(app.settings.lbNaam || '');
  const [melding, setMelding] = useState('');
  const { lbLive, lbBezig } = app;
  const gekoppeld = app.settings.lbNaam;

  const bewaar = () => {
    const naam = normaliseerNaam(invoer);
    if (!naam) { setMelding(tr('lbLive.ongeldig')); return; }
    setMelding('');
    setInvoer(naam);
    app.setSettings((s) => ({ ...s, lbNaam: naam }));
    app.syncLetterboxd(naam);
  };
  const ontkoppel = () => {
    app.setSettings((s) => { const { lbNaam, ...rest } = s; return rest; });
    setInvoer('');
  };

  const wanneer = lbLive?.at
    ? new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(lbLive.at))
    : null;
  const fout = lbLive?.fout && ({
    WORKER_OUD: tr('lbLive.workerOud'),
    NIET_GEVONDEN: tr('lbLive.nietGevonden'),
  }[lbLive.fout] || tr('lbLive.fout', { msg: lbLive.fout }));

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <p className="label" style={{ marginBottom: 6 }}>{tr('lbLive.titel')}</p>
      <p style={{ color: 'var(--fog)', fontSize: 13.5, marginBottom: 12 }}>{tr('lbLive.uitleg')}</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="field" style={{ maxWidth: 240 }} placeholder={tr('lbLive.placeholder')} value={invoer}
          onChange={(e) => setInvoer(e.target.value)} aria-label={tr('lbLive.naam')}
          onKeyDown={(e) => { if (e.key === 'Enter') bewaar(); }} />
        <button type="button" className="btn" onClick={bewaar} disabled={lbBezig}>
          <RefreshCw size={14} /> {lbBezig ? tr('lbLive.bezig') : gekoppeld ? tr('lbLive.nuBijwerken') : tr('lbLive.koppel')}
        </button>
        {gekoppeld && <button type="button" className="linkbtn" onClick={ontkoppel}>{tr('lbLive.ontkoppel')}</button>}
      </div>
      {melding && <p style={{ color: 'var(--dot-o)', fontSize: 13, marginTop: 10 }}>{melding}</p>}
      {gekoppeld && !lbBezig && fout && <p style={{ color: 'var(--dot-o)', fontSize: 13, marginTop: 10 }}>{fout}</p>}
      {gekoppeld && !lbBezig && !fout && wanneer && (
        <p style={{ color: 'var(--dot-g)', fontSize: 13, marginTop: 10 }}>{tr('lbLive.stand', { wanneer, count: lbLive.erbij || 0, n: lbLive.erbij || 0 })}</p>
      )}
    </div>
  );
}
