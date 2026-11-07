import { useState } from 'react';
import { Clapperboard } from 'lucide-react';
import { IMG } from '../lib/tmdb.js';
import { useT } from '../lib/i18n.js';

// De ene vraag na een avond (lib/kaartjesdoos.js, vraagAvond): welk kaartje
// heb je gebruikt? Eén kaartje: de bekende vraag met sterren. Meer kaartjes
// (je koos een paar keer): tik de film aan die je keek, of "geen van allen".
//   avond:      de kaartjes van die avond, met doorgeklikte vooraan
//   onAntwoord: (key | null, sterren | null)
//   onLater:    de vraag tot later wegleggen (optioneel)
export default function AvondVraag({ avond, meta, onAntwoord, onLater }) {
  const { t: tr, lang } = useT();
  const [gekozen, setGekozen] = useState(avond.length === 1 ? avond[0] : null);
  const wanneer = (() => {
    try {
      const dagen = Math.round((Date.parse(avond[0].datum) - Date.now()) / (24 * 3600e3));
      return new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }).format(dagen, 'day');
    } catch { return ''; }
  })();
  const poster = (k, maat = 'w154') => {
    const pad = meta[k.key]?.poster || k.poster;
    return pad ? IMG(pad, maat) : null;
  };

  const sterren = (k) => (
    <div className="fu-antwoord">
      <span className="fu-stars" role="group" aria-label={tr('pick.followupQ')}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" className="fu-star" aria-label={tr('pick.rateAria', { n })}
            onClick={() => onAntwoord(k.key, n)}>★</button>
        ))}
      </span>
      <button type="button" className="btn ghost" onClick={() => onAntwoord(k.key, null)}>{tr('pick.seenNoStars')}</button>
      {avond.length === 1
        ? <button type="button" className="btn ghost" onClick={() => onAntwoord(null, null)}>{tr('pick.notWatched')}</button>
        : <button type="button" className="btn ghost" onClick={() => setGekozen(null)}>{tr('pick.followupTerug')}</button>}
      {onLater && avond.length === 1 && <button type="button" className="linkbtn fu-later" onClick={onLater}>{tr('pick.followupLater')}</button>}
    </div>
  );

  if (gekozen) {
    return (
      <div className="card followup-card" style={{ marginBottom: 18 }}>
        {poster(gekozen) ? <img className="fu-poster" src={poster(gekozen)} alt="" /> : <div className="fu-poster" aria-hidden="true" />}
        <div style={{ flex: 1, minWidth: 200 }}>
          <p className="label" style={{ marginBottom: 2 }}>{avond.length === 1 ? tr('pick.followupTitle') : tr('pick.followupAvondTitel')}, {wanneer}</p>
          <p style={{ color: 'var(--paper)', fontSize: 15.5, fontWeight: 600 }}>{gekozen.name}{gekozen.year ? ` (${gekozen.year})` : ''}: {tr('pick.followupQ')}</p>
        </div>
        {sterren(gekozen)}
      </div>
    );
  }

  return (
    <div className="card followup-card" style={{ marginBottom: 18 }}>
      <div style={{ flex: '1 1 100%' }}>
        <p className="label" style={{ marginBottom: 2 }}>{tr('pick.followupAvondTitel')}, {wanneer}</p>
        <p style={{ color: 'var(--paper)', fontSize: 15.5, fontWeight: 600 }}>{tr('pick.followupAvondQ', { n: avond.length })}</p>
      </div>
      <div className="fu-keuzes">
        {avond.slice(0, 6).map((k) => (
          <button key={k.id} type="button" className="fu-keuze" onClick={() => setGekozen(k)} aria-label={tr('pick.followupKeek', { name: k.name })}>
            {poster(k, 'w185') ? <img src={poster(k, 'w185')} alt="" /> : <span className="fu-leeg"><Clapperboard size={18} strokeWidth={1.4} aria-hidden="true" /></span>}
            <span className="fu-naam">{k.name}</span>
          </button>
        ))}
      </div>
      <button type="button" className="btn ghost" onClick={() => onAntwoord(null, null)}>{tr('pick.followupGeen')}</button>
      {onLater && <button type="button" className="linkbtn fu-later" onClick={onLater}>{tr('pick.followupLater')}</button>}
    </div>
  );
}
