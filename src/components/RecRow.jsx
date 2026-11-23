import { ChevronRight } from 'lucide-react';
import { useT } from '../lib/i18n.js';
import { RAAM } from '../lib/foryou.js';
import { kortReden } from '../lib/redenen.js';
import RecTile from './RecTile.jsx';

// Eén rij-met-reden: kop (klikbaar naar "Alles bekijken") en een strook tegels.
//   voorkeur: diensten die een tegel als eerste noemt
//   actie:    optionele extra knop in de kop ({ label, onClick })
//   uitleg:   de eerste rij, met ankers voor de rondleiding
export default function RecRow({ titel, rij, totaal, voorkeur = [], actie = null, uitleg = false, onAlles, onOpen, onShortlist, onSkip, onGezien }) {
  const { t: tr } = useT();
  return (
    <section className="rec-row" data-uitleg={uitleg ? 'voorjou-rij' : undefined} data-uitleg-titel={uitleg ? titel : undefined}>
      <div className="rec-row-head">
        <h3><button type="button" className="row-title" onClick={() => onAlles(rij)}>{titel}</button></h3>
        {actie && <button type="button" className="row-actie" onClick={actie.onClick} data-uitleg="rij-actie" data-uitleg-label={actie.label}>{actie.label}</button>}
        <button type="button" className="row-all" onClick={() => onAlles(rij)} data-uitleg={uitleg ? 'voorjou-alles' : undefined}>
          {tr('verken.seeAll', { count: totaal })} <ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>
      <div className="rec-strip">
        {rij.films.slice(0, RAAM).map((r, i) => (
          <RecTile key={r.id} film={r} i={i} uitleg={uitleg && i === 0} voorkeur={voorkeur} reden={kortReden(r, rij, tr)} onOpen={onOpen} onShortlist={onShortlist} onSkip={onSkip} onGezien={onGezien} />
        ))}
      </div>
    </section>
  );
}
