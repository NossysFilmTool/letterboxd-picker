import { useId, useMemo, useState } from 'react';
import { useT } from '../lib/i18n.js';
import { IMG } from '../lib/tmdb.js';
import { fmtScore } from '../lib/pick.js';
import { zaalCode, stemZet } from '../lib/zaalstemming.js';
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

// Waarom een genre won (of hoe het gelijkspel werd opgelost)
export function genreZin(genre, tr) {
  switch (genre?.wijze) {
    case 'meeste': return tr('zaal.g_meeste', { count: genre.punten || 0 });
    case 'ook': return tr('zaal.g_ook', { count: genre.punten || 0, tweede: genre.namen?.[1] || '' });
    case 'breed': return tr('zaal.r_breed');
    case 'allebei': return tr(genre.namen.length > 2 ? 'zaal.g_allemaal' : 'zaal.g_allebei');
    case 'elkWat': return tr('zaal.g_elkWat');
    case 'vrij': return tr('zaal.g_vrij');
    default: return tr('zaal.g_alles');
  }
}

// Waarom een film won
export function uitslagZin(uitslag, tr) {
  if (!uitslag) return '';
  if (uitslag.wijze === 'breed') return tr('zaal.r_breed');
  if (uitslag.wijze === 'lot') return tr('zaal.f_lot');
  return tr('zaal.f_meeste', { count: uitslag.punten?.[uitslag.key] || 0 });
}

// Een stem in woorden: "1e Drama, 2e Thriller"
export function stemTekst(stem, naamVan, tr) {
  const [e, t] = stem || [];
  return [e != null ? `${tr('zaal.knopEerste')} ${naamVan(e)}` : null, t != null ? `${tr('zaal.knopTweede')} ${naamVan(t)}` : null]
    .filter(Boolean).join(', ');
}

// De twee knoppen bij een optie: 1e en 2e keus. Nog eens tikken haalt hem weg.
export function StemKnoppen({ id, naam, stem, onStem }) {
  const { t: tr } = useT();
  const [e, t] = stem || [];
  return (
    <span className="zs-stemknoppen">
      <button type="button" className="zs-stemknop" aria-pressed={e === id} aria-label={tr('zaal.ariaEerste', { naam })}
        onClick={() => onStem(stemZet(stem, id, 0))}>{tr('zaal.knopEerste')}</button>
      <button type="button" className="zs-stemknop" aria-pressed={t === id} aria-label={tr('zaal.ariaTweede', { naam })}
        onClick={() => onStem(stemZet(stem, id, 1))}>{tr('zaal.knopTweede')}</button>
    </span>
  );
}

// Waarom een aanrader op tafel ligt
export function aanraderReden(film, tr) {
  const via = film.via || [];
  if (via.length) {
    const meer = (film.bronnen || 0) - via.length;
    return meer > 0
      ? tr('zaal.r_viaMeer', { titels: lijstje(via, tr), count: meer })
      : tr('zaal.r_via', { titels: lijstje(via, tr) });
  }
  if (film.bronnen >= 2) return tr('zaal.r_bronnen', { n: film.bronnen });
  if (film.parel && film.votes) return tr('zaal.r_parel', { stemmen: film.votes });
  return tr('zaal.r_aanrader');
}

// Een film zoals de zaal hem ziet: poster, titel, jaar, lengte, cijfer, bij
// een aanrader waarom, en wie hem voordroeg
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
        {film.aanrader && <span className="zs-film-reden">{aanraderReden(film, tr)}</span>}
        {film.voor?.length > 0 && <span className="zs-film-reden">{tr('zaal.voorVan', { namen: lijstje(film.voor, tr) })}</span>}
      </span>
    </>
  );
}

// Meedoen met een code, voor wie de link niet heeft (uitleg: anker voor de rondleiding)
export function ZaalCodeInvoer({ onCode, kop, uitleg }) {
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
    <form className="zs-code-invoer" onSubmit={verstuur} data-uitleg={uitleg}>
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
