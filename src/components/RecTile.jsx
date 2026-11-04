import { Plus, X, Clapperboard, Star } from 'lucide-react';
import { IMG } from '../lib/tmdb.js';
import { useT } from '../lib/i18n.js';

// Eén aanbeveling als poster-tegel. Klik opent de filmkaart; ＋ en ✕ geven
// direct feedback (shortlist / niet voor mij), waarna de volgende film uit
// dezelfde rij vanzelf op deze plek schuift.
export default function RecTile({ film: r, i = 0, dienst = '', onOpen, onShortlist, onSkip }) {
  const { t: tr, lang } = useT();
  const score = r.vote ? (lang === 'nl' ? String(r.vote).replace('.', ',') : String(r.vote)) : null;
  // Waar is hij nu te streamen? De gekozen dienst als die erbij zit, anders de eerste.
  const prov = r.flat?.length ? (dienst && dienst !== '*' && r.flat.includes(dienst) ? dienst : r.flat[0]) : null;
  return (
    <div className="rec-tile" style={{ '--i': Math.min(i, 12) }}>
      <div className="poster">
        <button type="button" className="tile-open" onClick={() => onOpen(r)} aria-label={tr('common.openAria', { title: r.title })}>
          {r.poster
            ? <img src={IMG(r.poster, 'w342')} alt="" loading="lazy" />
            : <Clapperboard size={20} strokeWidth={1.4} aria-hidden="true" />}
        </button>
        {score && <span className="tile-score" aria-hidden="true"><Star size={10} style={{ verticalAlign: -1 }} /> {score}</span>}
        <div className="tile-acts">
          <button type="button" onClick={() => onShortlist(r)} aria-label={tr('verken.tileShortAria', { title: r.title })} title={tr('common.shortlist')}>
            <Plus size={15} />
          </button>
          <button type="button" onClick={() => onSkip(r)} aria-label={tr('verken.tileSkipAria', { title: r.title })} title={tr('verken.notForMe')}>
            <X size={15} />
          </button>
        </div>
      </div>
      <button type="button" className="tile-cap" onClick={() => onOpen(r)} tabIndex={-1}>
        <span className="t">{r.title}</span>
        {r.year ? <span className="yr">{r.year}</span> : null}
        {prov ? <span className="tile-prov" title={tr('winner.nowOn', { p: r.flat.join(', ') })}><span className="livedot" aria-hidden="true" />{prov}</span> : null}
      </button>
    </div>
  );
}
