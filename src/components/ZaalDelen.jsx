import { useId, useMemo, useState } from 'react';
import { useT } from '../lib/i18n.js';
import { IMG } from '../lib/tmdb.js';
import { fmtScore } from '../lib/pick.js';
import { zaalCode } from '../lib/zaalstemming.js';
import { qrCode, qrPad } from '../lib/qr.js';

// De link naar de zaal als QR-code: papier met inkt, zoals een aanplakbiljet
export function QrCode({ tekst, label }) {
  const qr = useMemo(() => { try { return qrCode(tekst); } catch { return null; } }, [tekst]);
  if (!qr) return null;
  const n = qr.size + 8;
  return (
    <svg className="zs-qr" viewBox={`0 0 ${n} ${n}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={n} height={n} />
      <path d={qrPad(qr)} />
    </svg>
  );
}

// Wat het scherm en de telefoons van de zaalstemming delen: de teksten bij
// een uitslag, een film als regel, en het veld om met een code mee te doen.

export const lijstje = (namen, tr) => (namen.length <= 1
  ? namen[0] || ''
  : `${namen.slice(0, -1).join(', ')} ${tr('zaal.en')} ${namen[namen.length - 1]}`);

export function genreKop(genre, tr) {
  if (!genre?.namen?.length) return tr('zaal.wordtAlles');
  return tr('zaal.wordt', { genre: lijstje(genre.namen, tr) });
}

// na: kwam de uitslag uit een beslissende ronde?
export function genreZin(genre, tr, na = false) {
  switch (genre?.wijze) {
    case 'meeste': return tr('zaal.g_meeste', { count: genre.stemmen || 0 });
    case 'beslissend': return tr('zaal.g_beslissend');
    case 'allebei': return tr(genre.namen.length > 2 ? 'zaal.g_allemaal' : 'zaal.g_allebei');
    case 'elkWat': return tr(na ? 'zaal.g_elkWat' : 'zaal.g_elkWatMeteen');
    default: return tr('zaal.g_alles');
  }
}

export function uitslagZin(uitslag, tr) {
  if (!uitslag) return '';
  if (uitslag.wijze === 'tweede') return tr('zaal.f_tweede');
  if (uitslag.wijze === 'lot') return tr('zaal.f_lot');
  const totaal = Object.values(uitslag.telling || {}).reduce((a, b) => a + b, 0);
  return tr('zaal.f_meeste', { n: uitslag.telling?.[uitslag.key] || 0, count: totaal });
}

// Een film zoals de zaal hem ziet: poster, titel, jaar, lengte, cijfer
export function ZaalFilmInhoud({ film, badge }) {
  const { t: tr } = useT();
  const gegevens = [film.year, film.runtime ? tr('zaal.minuten', { n: film.runtime }) : null, film.score != null ? `Nossy ${fmtScore(film.score)}` : null].filter(Boolean);
  return (
    <>
      <span className="zs-film-poster" aria-hidden="true">
        {film.poster ? <img src={IMG(film.poster, 'w342')} alt="" /> : <span className="zs-film-leeg">{film.name}</span>}
        {badge && <span className="zs-film-badge">{badge}</span>}
      </span>
      <span className="zs-film-tekst">
        <span className="zs-film-titel">{film.name}</span>
        <span className="zs-film-sub">{gegevens.map((g) => <span key={g}>{g}</span>)}</span>
      </span>
    </>
  );
}

// Meedoen met een code, voor wie de link niet heeft
export function ZaalCodeInvoer({ onCode, kop }) {
  const { t: tr } = useT();
  const id = useId();
  const [waarde, setWaarde] = useState('');
  const [melding, setMelding] = useState('');
  const verstuur = (e) => {
    e.preventDefault();
    const code = zaalCode(waarde);
    if (!code) { setMelding(tr('zaal.codeFout')); return; }
    setMelding('');
    onCode(code);
  };
  return (
    <form className="zs-code-invoer" onSubmit={verstuur}>
      <label className="label-breed" htmlFor={id}>{kop || tr('zaal.codeLabel')}</label>
      <div className="zs-code-rij">
        <input id={id} className="field zs-code-veld" value={waarde} onChange={(e) => setWaarde(e.target.value)}
          maxLength={8} autoCapitalize="characters" autoComplete="off" spellCheck={false}
          placeholder={tr('zaal.codePlaceholder')} />
        <button type="submit" className="btn">{tr('zaal.meedoenKnop')}</button>
      </div>
      {melding && <p className="zs-melding" role="alert">{melding}</p>}
    </form>
  );
}
