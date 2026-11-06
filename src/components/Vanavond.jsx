import { useState, useEffect } from 'react';
import { X, Clapperboard } from 'lucide-react';
import { IMG } from '../lib/tmdb.js';
import { useT } from '../lib/i18n.js';
import { hoofdreden } from '../lib/redenen.js';
import { useFilmkleur } from '../lib/filmkleur.js';
import Sterren from './Sterren.jsx';

// "Vanavond": één grote aanrader bovenaan Voor jou, gekozen op wat bij je
// past, waar hij nu staat en of hij vanavond nog past. Het blok neemt de
// kleur van de film aan (uit de poster, lib/filmkleur.js).
//   keuze:  { film, dienst, opMijnDienst, past } (zie kiesVanavond)
//   detail: volledige TMDB-data (plot, regisseur), mag nog ontbreken
export default function Vanavond({ keuze, detail, seededOnRatings, onOpen, onShortlist, onSkip, onGezien, onAnder }) {
  const { t: tr, lang } = useT();
  const { film: r, dienst, past } = keuze;
  const [sterrenOpen, setSterrenOpen] = useState(false);
  useEffect(() => { setSterrenOpen(false); }, [r.id]);
  const kleur = useFilmkleur(r.poster);
  const runtime = detail?.runtime || r.runtime;
  const klaar = runtime
    ? new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' }).format(new Date(Date.now() + runtime * 60000))
    : null;
  const plot = detail?.plot || r.plot;
  const regisseur = detail?.director || r.director;

  return (
    <section className="vanavond" style={{ '--film': kleur }} aria-label={tr('verken.vanavondAria', { title: r.title })}>
      <div className="inner">
        <button type="button" className="vposter" onClick={() => onOpen(r)} aria-label={tr('common.openAria', { title: r.title })}>
          {r.poster ? <img src={IMG(r.poster, 'w342')} alt="" /> : <Clapperboard size={28} strokeWidth={1.4} aria-hidden="true" />}
        </button>
        <div className="vinfo">
          <p className="eyebrow">{dienst ? tr('verken.vanavondOp', { p: dienst }) : tr('verken.vanavond')}</p>
          <h2 className="vtitle"><button type="button" onClick={() => onOpen(r)}>{r.title}</button></h2>
          <p className="vmeta">
            {r.year ? <span>{r.year}</span> : null}
            {runtime ? <span>{runtime} min</span> : null}
            {klaar ? <span>{past ? tr('verken.vanavondKlaar', { t: klaar }) : tr('verken.vanavondLaatKort', { t: klaar })}</span> : null}
            {regisseur ? <span>{regisseur}</span> : null}
          </p>
        </div>
      </div>
      <div className="vonder">
        <p className="vwhy">{hoofdreden(r, tr, seededOnRatings)}</p>
        {plot && <p className="vplot">{plot}</p>}
        {sterrenOpen ? (
          <div className="kaart-sterren">
            <span>{tr('verken.welkeSterren')}</span>
            <Sterren onKies={(n) => { setSterrenOpen(false); onGezien(r, n); }} />
            <button type="button" className="linkbtn" onClick={() => { setSterrenOpen(false); onGezien(r, null); }}>{tr('verken.zonderSterren')}</button>
            <button type="button" className="linkbtn" onClick={() => setSterrenOpen(false)}>{tr('verken.eigenAnnuleer')}</button>
          </div>
        ) : (
          <div className="vacties">
            <button type="button" className="vknop-hoofd" onClick={() => onOpen(r)}>{tr('verken.vanavondBekijk')}</button>
            <button type="button" className="vknop" onClick={() => onShortlist(r)}>{tr('verken.vanavondShortlist')}</button>
            <button type="button" className="vknop" onClick={() => setSterrenOpen(true)}>{tr('verken.gezienKort')}</button>
            <button type="button" className="vknop zacht" onClick={onAnder}>{tr('verken.vanavondAnder')}</button>
            <button type="button" className="vknop zacht" onClick={() => onSkip(r)} aria-label={tr('verken.tileSkipAria', { title: r.title })}><X size={16} /></button>
          </div>
        )}
      </div>
    </section>
  );
}
