import { useEffect, useRef, useState } from 'react';
import { Plus, X, Eye, ArrowLeft, Clapperboard, Star, SkipForward } from 'lucide-react';
import { IMG } from '../lib/tmdb.js';
import { useT } from '../lib/i18n.js';
import { hoofdreden } from '../lib/redenen.js';
import Sterren from './Sterren.jsx';

// Snel beoordelen: één film tegelijk. Rechts vegen (of pijl rechts) = wil ik
// zien, links (pijl links) = niet voor mij, pijl omlaag = weet ik niet, G =
// al gezien. Elke keuze leert het profiel meteen; de volgende film schuift
// vanzelf door omdat beoordeelde films uit de kandidaten verdwijnen.
const VEEG = 90; // pixels slepen voor een keuze

export default function SnelBeoordelen({ kandidaten, seededOnRatings, onWil, onNiet, onGezien, onSluit }) {
  const { t: tr, lang } = useT();
  const [overgeslagen, setOvergeslagen] = useState(() => new Set());
  const [gedaan, setGedaan] = useState(0);
  const [sterrenOpen, setSterrenOpen] = useState(false);
  const [dx, setDx] = useState(0);
  const start = useRef(null);
  const film = kandidaten.find((f) => !overgeslagen.has(f.id));
  const fmt = (v) => (lang === 'nl' ? String(v).replace('.', ',') : String(v));

  const kies = (soort) => {
    if (!film) return;
    setDx(0);
    setSterrenOpen(false);
    if (soort === 'wil') { onWil(film); setGedaan((n) => n + 1); }
    else if (soort === 'niet') { onNiet(film); setGedaan((n) => n + 1); }
    else if (soort === 'over') setOvergeslagen((s) => new Set(s).add(film.id));
    else if (soort === 'gezien') setSterrenOpen(true);
  };
  const gezien = (n) => { setSterrenOpen(false); onGezien(film, n); setGedaan((x) => x + 1); };

  // Toetsenbord, behalve als je in een veld typt
  useEffect(() => {
    const opToets = (e) => {
      if (/input|textarea|select/i.test(e.target?.tagName || '')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); kies('wil'); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); kies('niet'); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); kies('over'); }
      else if (e.key === 'g' || e.key === 'G') kies('gezien');
      else if (e.key === 'Escape') onSluit();
    };
    window.addEventListener('keydown', opToets);
    return () => window.removeEventListener('keydown', opToets);
  });

  // Vegen met vinger of muis
  const [sleept, setSleept] = useState(false);
  const neer = (e) => {
    if (e.button != null && e.button !== 0) return;
    start.current = e.clientX;
    setSleept(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const beweeg = (e) => { if (start.current != null) setDx(e.clientX - start.current); };
  const los = () => {
    if (start.current == null) return;
    start.current = null;
    setSleept(false);
    if (dx > VEEG) kies('wil');
    else if (dx < -VEEG) kies('niet');
    else setDx(0);
  };

  return (
    <div className="snel">
      <div className="snel-kop">
        <button type="button" className="btn ghost" onClick={onSluit}><ArrowLeft size={15} /> {tr('verken.snelKlaar')}</button>
        <span className="snel-teller">{tr('verken.snelTeller', { count: gedaan })}</span>
      </div>
      <p className="snel-uitleg">{tr('verken.snelUitleg')}</p>
      {!film ? (
        <div className="empty card"><p>{tr('verken.snelOp')}</p></div>
      ) : (
        <div className="snel-film">
          <div
            className={`snel-kaart ${sleept ? 'sleept' : ''} ${dx > VEEG / 2 ? 'naar-wil' : dx < -VEEG / 2 ? 'naar-niet' : ''}`}
            style={{ transform: dx ? `translateX(${dx}px) rotate(${dx / 30}deg)` : undefined }}
            onPointerDown={neer} onPointerMove={beweeg} onPointerUp={los} onPointerCancel={los}
          >
            <div className="snel-poster">
              {film.poster ? <img src={IMG(film.poster, 'w500')} alt={tr('common.posterAlt', { name: film.title })} draggable={false} /> : <Clapperboard size={34} strokeWidth={1.4} aria-hidden="true" />}
            </div>
            <div className="snel-info">
              <h2>{film.title}</h2>
              <p className="snel-meta">
                {[film.year, film.runtime ? `${film.runtime} min` : null].filter(Boolean).join(' · ')}
                {film.vote ? <> {'·'} <Star size={12} style={{ verticalAlign: -1, color: 'var(--dot-o)' }} /> {fmt(film.vote)}</> : null}
                {film.flat?.length ? <> {'·'} {tr('winner.nowOn', { p: film.flat.slice(0, 2).join(', ') })}</> : null}
              </p>
              <p className="why">{hoofdreden(film, tr, seededOnRatings)}</p>
              {film.plot && <p className="snel-plot">{film.plot}</p>}
            </div>
          </div>
          {sterrenOpen ? (
            <div className="kaart-sterren snel-sterren">
              <span>{tr('verken.welkeSterren')}</span>
              <Sterren onKies={gezien} />
              <button type="button" className="linkbtn" onClick={() => gezien(null)}>{tr('verken.zonderSterren')}</button>
              <button type="button" className="linkbtn" onClick={() => setSterrenOpen(false)}>{tr('verken.eigenAnnuleer')}</button>
            </div>
          ) : (
            <div className="snel-knoppen">
              <button type="button" className="btn snel-niet" onClick={() => kies('niet')}><X size={16} /> {tr('verken.notForMe')}</button>
              <button type="button" className="btn ghost" onClick={() => kies('over')}><SkipForward size={15} /> {tr('verken.snelOverslaan')}</button>
              <button type="button" className="btn ghost" onClick={() => kies('gezien')}><Eye size={15} /> {tr('verken.gezienKort')}</button>
              <button type="button" className="btn green" onClick={() => kies('wil')}><Plus size={16} /> {tr('verken.snelWil')}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
