import { useState, useEffect } from 'react';
import { Plus, X, Eye, Clapperboard, Star, RefreshCw } from 'lucide-react';
import { IMG } from '../lib/tmdb.js';
import { useT } from '../lib/i18n.js';
import { hoofdreden } from '../lib/redenen.js';
import Sterren from './Sterren.jsx';

// "Vanavond": één grote aanrader bovenaan Voor jou, gekozen op wat bij je
// past, waar hij nu staat en of hij vanavond nog past.
//   keuze:  { film, dienst, opMijnDienst, past } (zie kiesVanavond)
//   detail: volledige TMDB-data (backdrop, plot, regisseur), mag nog ontbreken
export default function Vanavond({ keuze, detail, seededOnRatings, onOpen, onShortlist, onSkip, onGezien, onAnder }) {
  const { t: tr, lang } = useT();
  const { film: r, dienst, past } = keuze;
  const [sterrenOpen, setSterrenOpen] = useState(false);
  useEffect(() => { setSterrenOpen(false); }, [r.id]);
  const fmt = (v) => (lang === 'nl' ? String(v).replace('.', ',') : String(v));
  const runtime = detail?.runtime || r.runtime;
  const klaar = runtime
    ? new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' }).format(new Date(Date.now() + runtime * 60000))
    : null;
  const plot = detail?.plot || r.plot;
  const regisseur = detail?.director || r.director;

  return (
    <section className="vanavond fade-up" aria-label={tr('verken.vanavondAria', { title: r.title })}>
      {detail?.backdrop && <div className="bg" style={{ backgroundImage: `url(${IMG(detail.backdrop, 'w1280')})` }} aria-hidden="true" />}
      <div className="veil" aria-hidden="true" />
      <div className="inner">
        <button type="button" className="vposter" onClick={() => onOpen(r)} aria-label={tr('common.openAria', { title: r.title })}>
          {r.poster ? <img src={IMG(r.poster, 'w342')} alt="" /> : <Clapperboard size={28} strokeWidth={1.4} aria-hidden="true" />}
        </button>
        <div className="vinfo">
          <p className="eyebrow">
            {tr('verken.vanavond')}
            {dienst ? <span className="vdienst"><span className="livedot" aria-hidden="true" />{tr('winner.nowOn', { p: dienst })}</span> : null}
          </p>
          <h2 className="vtitle"><button type="button" onClick={() => onOpen(r)}>{r.title}</button></h2>
          <p className="vmeta">
            {[
              r.year,
              runtime ? `${runtime} min` : null,
              klaar ? (past ? tr('winner.endTime', { t: klaar }) : tr('verken.vanavondLaat', { t: klaar })) : null,
              regisseur ? `${tr('winner.regie')} ${regisseur}` : null,
            ].filter(Boolean).join(' · ')}
            {r.vote ? <> {'·'} <Star size={12} style={{ verticalAlign: -1, color: 'var(--dot-o)' }} /> {fmt(r.vote)}</> : null}
          </p>
          <p className="why">{hoofdreden(r, tr, seededOnRatings)}</p>
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
              <button type="button" className="btn primary" onClick={() => onOpen(r)}>{tr('verken.viewCard')}</button>
              <button type="button" className="btn green" onClick={() => onShortlist(r)}><Plus size={15} /> {tr('common.shortlist')}</button>
              <button type="button" className="btn" onClick={() => setSterrenOpen(true)}><Eye size={15} /> {tr('verken.gezienKort')}</button>
              <button type="button" className="btn ghost" onClick={onAnder}><RefreshCw size={14} /> {tr('verken.vanavondAnder')}</button>
              <button type="button" className="btn ghost" onClick={() => onSkip(r)} aria-label={tr('verken.tileSkipAria', { title: r.title })}><X size={15} /></button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
