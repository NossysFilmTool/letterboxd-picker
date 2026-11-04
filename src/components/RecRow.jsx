import { ChevronRight } from 'lucide-react';
import { useT } from '../lib/i18n.js';
import { RAAM } from '../lib/foryou.js';
import RecTile from './RecTile.jsx';

// Eén rij-met-reden: kop (klikbaar naar "Alles bekijken") en een strook tegels.
export default function RecRow({ titel, rij, totaal, onAlles, onOpen, onShortlist, onSkip }) {
  const { t: tr } = useT();
  return (
    <section className="rec-row">
      <div className="rec-row-head">
        <h3><button type="button" className="row-title" onClick={() => onAlles(rij)}>{titel}</button></h3>
        <button type="button" className="row-all" onClick={() => onAlles(rij)}>
          {tr('verken.seeAll', { count: totaal })} <ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>
      <div className="rec-strip">
        {rij.films.slice(0, RAAM).map((r, i) => (
          <RecTile key={r.id} film={r} i={i} onOpen={onOpen} onShortlist={onShortlist} onSkip={onSkip} />
        ))}
      </div>
    </section>
  );
}
