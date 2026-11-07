import { Clapperboard } from 'lucide-react';
import { IMG } from '../lib/tmdb.js';
import { useT } from '../lib/i18n.js';

// "Net binnen": films van je watchlist die de afgelopen week op (een van
// jouw) diensten verschenen (lib/aanbod.js, netBinnen).
//   items: [{ film, dienst, sinds }], nieuwste eerst
export default function NetBinnen({ items, meta, eigenDiensten, onOpen }) {
  const { t: tr, lang } = useT();
  if (!items.length) return null;
  const wanneer = (ms) => {
    try {
      const dagen = Math.round((ms - Date.now()) / (24 * 3600e3));
      return new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }).format(dagen, 'day');
    } catch { return ''; }
  };
  return (
    <section className="rec-row net-binnen" aria-label={tr(eigenDiensten ? 'verken.netBinnenTitel' : 'verken.netBinnenTitelAlle')}>
      <div className="rec-row-head">
        <h3>{tr(eigenDiensten ? 'verken.netBinnenTitel' : 'verken.netBinnenTitelAlle')}</h3>
      </div>
      <div className="rec-strip">
        {items.slice(0, 12).map(({ film, dienst, sinds }) => {
          const m = meta[film.key];
          return (
            <div key={film.key} className="rec-tile">
              <div className="poster">
                <button type="button" className="tile-open" onClick={() => onOpen(film)} aria-label={tr('common.openAria', { title: film.name })}>
                  {m?.poster ? <img src={IMG(m.poster, 'w342')} alt="" loading="lazy" /> : <Clapperboard size={20} strokeWidth={1.4} aria-hidden="true" />}
                </button>
              </div>
              <button type="button" className="tile-cap" onClick={() => onOpen(film)} tabIndex={-1}>
                <span className="t">{film.name}</span>
                <span className="tile-prov"><span className="livedot" aria-hidden="true" />{tr('verken.netBinnenOp', { p: dienst, wanneer: wanneer(sinds) })}</span>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
