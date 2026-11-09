import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Clapperboard } from 'lucide-react';
import { IMG } from '../lib/tmdb.js';
import { useT } from '../lib/i18n.js';
import { drukletters, kaartjeDatum } from '../lib/kaartje.js';
import { useFilmkleur } from '../lib/filmkleur.js';
import { bronTekst } from './Kaartjesdoos.jsx';

// Het moment dat de app zelf ontdekt dat je een gekozen film keek (je
// Letterboxd-dagboek, of je markeerde hem als gezien): het kaartje schuift in
// beeld, krijgt een rode stempel "Gekeken" met je sterren, en de strook
// scheurt af, de doos in. Tik om verder te gaan; na een paar tellen gaat hij
// vanzelf. Met "beperk beweging" staat alles meteen stil in beeld.
//   item: { k (beoordeeld kaartje), nummer }, meer: hoeveel er nog wachten
const sterrenTekst = (s) => '★'.repeat(Math.floor(s)) + (s % 1 >= 0.5 ? '½' : '');
const alsDatum = (s) => new Date(String(s).length === 10 ? `${s}T12:00:00` : s);

export default function Ontdekt({ item, meer = 0, poster, onKlaar, onBekijk }) {
  const { t: tr, lang } = useT();
  const { k, nummer } = item;
  const kleur = useFilmkleur(poster);
  const klaarRef = useRef(onKlaar);
  klaarRef.current = onKlaar;
  useEffect(() => {
    const t = setTimeout(() => klaarRef.current(), 5600);
    return () => clearTimeout(t);
  }, [k.id]);
  const d = alsDatum(k.gekekenOp);
  const bewijsKop = k.bewijs === 'letterboxd'
    ? tr('kaartje.ontdektLetterboxd', { datum: new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long' }).format(d) })
    : tr('kaartje.ontdektGezien');
  // Een film die de tool voor je vond: dat zeggen we erbij
  const kop = k.bron === 'gevonden' ? `${bronTekst(k, tr)}. ${bewijsKop}` : bewijsKop;

  return createPortal(
    <div className="kaartje-ontdekt" role="status" aria-live="polite" onClick={() => onKlaar()}>
      <p className="kaartje-ontdekt-kop">{kop}</p>
      <div className="kaartje-ontdekt-ticket">
        <div className="kaartje-ontdekt-body">
          <span className="kaartje-ontdekt-datum">{kaartjeDatum(d, lang)}</span>
          <span className="kaartje-ontdekt-titel">{drukletters(k.name, lang)}</span>
          <span className="kaartje-ontdekt-bron">{k.year || ''}</span>
          <span className="kaartje-ontdekt-stempel" aria-hidden="true">
            {drukletters(tr('kaartje.stempelGekeken'), lang)}
            {k.sterren != null && <span className="kaartje-ontdekt-sterren">{sterrenTekst(k.sterren)}</span>}
          </span>
        </div>
        <div className="kaartje-ontdekt-strook" style={{ background: kleur }} aria-hidden="true">
          {poster ? <img src={IMG(poster, 'w342')} alt="" /> : <Clapperboard size={26} strokeWidth={1.4} />}
        </div>
      </div>
      <p className="kaartje-ontdekt-tekst">{tr('kaartje.inDeDoos', { n: nummer })}</p>
      <div className="kaartje-ontdekt-acties">
        <button type="button" className="linkbtn" onClick={(e) => { e.stopPropagation(); onBekijk(); }}>{tr('kaartje.bekijkDoos')}</button>
        <span>{meer > 0 ? tr('kaartje.ontdektMeer', { count: meer, n: meer }) : tr('kaartje.ontdektVerder')}</span>
      </div>
    </div>,
    document.body,
  );
}
