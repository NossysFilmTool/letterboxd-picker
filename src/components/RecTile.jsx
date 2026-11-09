import { useState } from 'react';
import { Plus, X, Eye, Clapperboard } from 'lucide-react';
import { IMG } from '../lib/tmdb.js';
import { useT } from '../lib/i18n.js';
import Sterren from './Sterren.jsx';

// Eén aanbeveling als poster-tegel. Klik opent de filmkaart; plus, oog en kruis geven
// direct feedback (shortlist / al gezien, met sterren / niet voor mij),
// waarna de volgende film uit dezelfde rij vanzelf op deze plek schuift.
export default function RecTile({ film: r, i = 0, voorkeur = [], reden = null, onOpen, onShortlist, onSkip, onGezien }) {
  const { t: tr, lang } = useT();
  const [sterrenOpen, setSterrenOpen] = useState(false);
  const score = r.vote ? (lang === 'nl' ? String(r.vote).replace('.', ',') : String(r.vote)) : null;
  // Waar is hij nu te streamen? Bij voorkeur op een van jouw diensten, anders de eerste.
  const prov = r.flat?.length ? (r.flat.find((p) => voorkeur.includes(p)) || r.flat[0]) : null;
  return (
    <div className="rec-tile" style={{ '--i': Math.min(i, 12) }}>
      <div className="poster">
        <button type="button" className="tile-open" onClick={() => onOpen(r)} aria-label={tr('common.openAria', { title: r.title })}>
          {r.poster
            ? <img src={IMG(r.poster, 'w342')} alt="" loading="lazy" />
            : <Clapperboard size={20} strokeWidth={1.4} aria-hidden="true" />}
        </button>
        {sterrenOpen ? (
          // Al gezien: hoeveel sterren? (of zonder)
          <div className="tile-sterren">
            <span className="tile-sterren-vraag">{tr('verken.welkeSterren')}</span>
            <Sterren klein onKies={(n) => { setSterrenOpen(false); onGezien(r, n); }} />
            <button type="button" className="linkbtn" onClick={() => { setSterrenOpen(false); onGezien(r, null); }}>{tr('verken.zonderSterren')}</button>
            <button type="button" className="tile-sterren-sluit" aria-label={tr('verken.eigenAnnuleer')} onClick={() => setSterrenOpen(false)}><X size={13} /></button>
          </div>
        ) : (
          <div className="tile-acts">
            <button type="button" onClick={() => onShortlist(r)} aria-label={tr('verken.tileShortAria', { title: r.title })} title={tr('common.shortlist')}>
              <Plus size={15} />
            </button>
            {onGezien && (
              <button type="button" className="tile-gezien" onClick={() => setSterrenOpen(true)} aria-label={tr('verken.tileSeenAria', { title: r.title })} title={tr('verken.gezienKort')}>
                <Eye size={15} />
              </button>
            )}
            <button type="button" onClick={() => onSkip(r)} aria-label={tr('verken.tileSkipAria', { title: r.title })} title={tr('verken.notForMe')}>
              <X size={15} />
            </button>
          </div>
        )}
      </div>
      <button type="button" className="tile-cap" onClick={() => onOpen(r)} tabIndex={-1}>
        <span className="t">{r.title}</span>
        {/* Jaar links, cijfer rechts; een verdacht cijfer krijgt een vraagteken */}
        {(r.year || score) ? (
          <span className="tile-sub">
            <span>{r.year || ''}</span>
            {score ? (
              r.onbetrouwbaar
                ? <span className="verdacht" title={tr('verken.opgeblazenKort')}>{score}?</span>
                : r.opgeblazen
                  // IMDb zette het opgeblazen TMDB-cijfer recht: dit is het IMDb-cijfer
                  ? <span className="verdacht" title={tr(r.opgeblazen === 'publiek' ? 'verken.opgeblazenPubliekKort' : 'verken.opgeblazenImdbKort', { tmdb: lang === 'nl' ? String(r.tmdbVote).replace('.', ',') : String(r.tmdbVote) })}>{score}</span>
                  : <span>{score}</span>
            ) : null}
          </span>
        ) : null}
        {reden ? <span className="tile-reden" title={reden}>{reden}</span> : null}
        {prov ? <span className="tile-prov" title={tr('winner.nowOn', { p: r.flat.join(', ') })}><span className="livedot" aria-hidden="true" />{prov}</span> : null}
      </button>
    </div>
  );
}
