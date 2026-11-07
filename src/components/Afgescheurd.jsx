import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Clapperboard } from 'lucide-react';
import { IMG } from '../lib/tmdb.js';
import { useT } from '../lib/i18n.js';
import { drukletters } from '../lib/kaartje.js';

// Het moment dat een kaartje afscheurt: je zei dat je de film keek, en de
// strook scheurt zichtbaar los en schuift de doos in, met zijn nummer.
// Verdwijnt na een paar tellen vanzelf.
//   melding: { kaartje, nummer }
const sterrenTekst = (s) => '★'.repeat(Math.floor(s)) + (s % 1 >= 0.5 ? '½' : '');

export default function Afgescheurd({ melding, onSluit, onBekijk }) {
  const { t: tr, lang } = useT();
  const { kaartje: k, nummer } = melding;
  // onSluit in een ref: de app tekent vaak opnieuw (achtergrondverversing),
  // en dan mag de teller niet steeds opnieuw beginnen (zie ook Leader.jsx)
  const sluitRef = useRef(onSluit);
  sluitRef.current = onSluit;
  useEffect(() => {
    const t = setTimeout(() => sluitRef.current(), 6000);
    return () => clearTimeout(t);
  }, [melding]);
  return createPortal(
    <div className="afgescheurd" role="status">
      <div className="afgescheurd-strook" aria-hidden="true">
        <span className="kaartje-stub-poster">
          {k.poster ? <img src={IMG(k.poster, 'w185')} alt="" /> : <Clapperboard size={16} strokeWidth={1.4} />}
        </span>
        <span className="kaartje-stub-papier">
          <span className="kaartje-stub-titel">{drukletters(k.name, lang)}</span>
          {k.sterren != null && <span className="kaartje-stub-stempel">{sterrenTekst(k.sterren)}</span>}
        </span>
      </div>
      <div className="afgescheurd-tekst">
        <p>{tr('kaartje.inDeDoos', { n: nummer })}</p>
        <button type="button" className="linkbtn" onClick={onBekijk}>{tr('kaartje.bekijkDoos')}</button>
      </div>
      <button type="button" className="afgescheurd-sluit" aria-label={tr('common.close')} onClick={onSluit}>✕</button>
    </div>,
    document.body,
  );
}
