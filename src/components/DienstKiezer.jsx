import { useState } from 'react';
import { Tv } from 'lucide-react';
import { useT } from '../lib/i18n.js';

// "Welke streamingdiensten heb je?": een keer kiezen, daarna toont Voor jou
// een rij met wat daar nu staat en bij je past.
export default function DienstKiezer({ keuze, gekozen = [], onOpslaan, onLater }) {
  const { t: tr } = useT();
  const [sel, setSel] = useState(gekozen);
  const wissel = (naam) => setSel((s) => (s.includes(naam) ? s.filter((x) => x !== naam) : [...s, naam]));
  return (
    <section className="card dienst-kiezer" aria-label={tr('verken.servicesPickTitle')}>
      <p className="label" style={{ marginBottom: 6 }}><Tv size={14} style={{ verticalAlign: -2 }} /> {tr('verken.servicesPickTitle')}</p>
      <p style={{ fontSize: 13.5, color: 'var(--fog)', marginBottom: 12 }}>{tr('verken.servicesPickHint')}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {keuze.map((naam) => (
          <button key={naam} type="button" className={`chip ${sel.includes(naam) ? 'on-g' : ''}`} aria-pressed={sel.includes(naam)} onClick={() => wissel(naam)}>
            {naam}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn green" disabled={!sel.length} onClick={() => onOpslaan(sel)}>{tr('verken.servicesSave')}</button>
        <button type="button" className="btn ghost" onClick={onLater}>{tr('verken.servicesLater')}</button>
      </div>
    </section>
  );
}
