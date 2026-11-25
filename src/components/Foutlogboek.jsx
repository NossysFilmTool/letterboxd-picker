import { useState } from 'react';
import { useFoutlog, wisFoutlog } from '../lib/foutlog.js';
import { useT } from '../lib/i18n.js';

// Wat er op de achtergrond misging (lib/foutlog.js). Alleen te zien als er
// iets in staat: een stille regel per melding, nieuwste bovenaan, met
// kopiëren (om mee te sturen als je hulp vraagt) en wissen.
export default function Foutlogboek() {
  const { t: tr, lang } = useT();
  const lijst = useFoutlog();
  const [gekopieerd, setGekopieerd] = useState(false);
  if (!lijst.length) return null;
  const tijd = (at) => new Date(at).toLocaleString(lang === 'nl' ? 'nl-NL' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const regels = [...lijst].reverse();
  const bron = (b) => { const k = `setup.foutBron.${b}`; const v = tr(k); return v === k ? b : v; };
  const kopieer = async () => {
    const v = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
    const tekst = [`v${v}`, ...lijst.map((r) => `${new Date(r.at).toISOString()} [${r.bron}] ${r.tekst}${r.n > 1 ? ` (x${r.n})` : ''}`)].join('\n');
    try { await navigator.clipboard.writeText(tekst); setGekopieerd(true); setTimeout(() => setGekopieerd(false), 2000); } catch { /* geen klembord */ }
  };
  return (
    <div className="card" style={{ marginBottom: 18 }} data-foutlog>
      <p className="label" style={{ marginBottom: 6 }}>{tr('setup.foutlogTitel')}</p>
      <p style={{ color: 'var(--fog-dim)', fontSize: 12.5, marginBottom: 12 }}>{tr('setup.foutlogUitleg')}</p>
      <ul style={{ listStyle: 'none', margin: '0 0 12px', padding: 0, maxHeight: 220, overflowY: 'auto', fontSize: 12.5 }}>
        {regels.map((r) => (
          <li key={`${r.at}-${r.bron}`} style={{ padding: '6px 0', borderTop: '1px solid var(--line)' }}>
            <span style={{ color: 'var(--fog-dim)' }}>{tijd(r.at)} · {bron(r.bron)}</span>
            {r.n > 1 && <span style={{ color: 'var(--fog-dim)' }}> · {tr('setup.foutKeer', { n: r.n })}</span>}
            <br />
            <span style={{ color: 'var(--fog)', wordBreak: 'break-word' }}>{r.tekst}</span>
          </li>
        ))}
      </ul>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" className="btn" onClick={kopieer}>{gekopieerd ? tr('setup.foutGekopieerd') : tr('setup.foutKopieer')}</button>
        <button type="button" className="btn ghost" onClick={wisFoutlog}>{tr('setup.foutWis')}</button>
      </div>
    </div>
  );
}
