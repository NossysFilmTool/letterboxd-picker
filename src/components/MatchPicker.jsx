import { useState, useEffect } from 'react';
import { Clapperboard, Check, X, ArrowRight } from 'lucide-react';
import { IMG, searchMovies } from '../lib/tmdb.js';
import { useT } from '../lib/i18n.js';

// Toont per twijfelfilm de TMDB-zoekresultaten als posters, zodat je zélf
// de juiste kiest. Geen automatische logica meer die opnieuw kan misgaan.
export default function MatchPicker({ films, app, onClose }) {
  const { t: tr } = useT();
  const [idx, setIdx] = useState(0);
  const [kandidaten, setKandidaten] = useState([]);
  const [laden, setLaden] = useState(false);
  const [klaar, setKlaar] = useState([]); // keys die je hebt afgehandeld

  const film = films[idx];
  const huidige = film ? app.meta[film.key] : null;

  useEffect(() => {
    if (!film) return;
    let stop = false;
    setLaden(true);
    setKandidaten([]);
    searchMovies(app.tmdbKey, film.name)
      .then((r) => { if (!stop) setKandidaten(r); })
      .catch(() => { if (!stop) setKandidaten([]); })
      .finally(() => { if (!stop) setLaden(false); });
    return () => { stop = true; };
  }, [idx, film, app.tmdbKey]);

  const volgende = () => {
    if (idx + 1 < films.length) setIdx(idx + 1);
    else onClose();
  };

  const kies = async (kandidaat) => {
    await app.pickMatch(film.key, kandidaat.id);
    setKlaar((k) => [...k, film.key]);
    volgende();
  };

  const negeer = () => {
    app.ignoreFilm(film.key);
    setKlaar((k) => [...k, film.key]);
    volgende();
  };

  // Weinig of geen treffers wijst vaak op een tv-serie die Letterboxd meesmokkelde
  const magerResultaat = !laden && kandidaten.length <= 1;

  if (!film) {
    return (
      <div className="card" style={{ marginTop: 14 }}>
        <p className="big" style={{ fontFamily: 'var(--font-display)', fontSize: 22 }}>{tr('match.allDone')}</p>
        <p style={{ color: 'var(--fog)', fontSize: 13.5, marginTop: 6 }}>{tr('match.allChecked')}</p>
        <button className="btn" style={{ marginTop: 12 }} onClick={onClose}>{tr('match.close')}</button>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: 14, borderColor: 'rgba(255,128,0,0.3)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <p className="label" style={{ color: 'var(--dot-o)', marginBottom: 4 }}>{tr('match.title', { i: idx + 1, n: films.length })}</p>
          <p style={{ fontSize: 14, color: 'var(--fog)' }}>
            {tr('match.listSays', { name: film.name })}{film.year ? tr('match.fromYear', { year: film.year }) : ''}.{huidige?.year ? tr('match.nowLinked', { year: huidige.year }) : ''}{tr('match.chooseBelow')}
          </p>
        </div>
        <button className="btn ghost" onClick={onClose}><X size={14} /> {tr('match.stopBtn')}</button>
      </div>

      {laden ? (
        <p style={{ color: 'var(--fog-dim)', fontSize: 13, marginTop: 16 }}>{tr('match.searching')}</p>
      ) : kandidaten.length === 0 ? (
        <div style={{ marginTop: 16 }}>
          <p style={{ color: 'var(--fog)', fontSize: 13.5 }}>{tr('match.noneFound', { name: film.name })}</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button className="btn" style={{ borderColor: 'rgba(255,128,0,0.4)', color: 'var(--dot-o)' }} onClick={negeer}>{tr('match.notAFilm')}</button>
            <button className="btn ghost" onClick={volgende}>{tr('common.skip')} <ArrowRight size={14} /></button>
          </div>
        </div>
      ) : (
        <>
          {magerResultaat && (
            <p className="notice warn" style={{ marginTop: 16 }}>
              {tr('match.tvHint')}
            </p>
          )}
          <div className="match-grid" style={{ marginTop: 16 }}>
            {kandidaten.map((k) => {
              const isHuidige = huidige?.id === k.id;
              return (
                <button key={k.id} className="match-tile" onClick={() => kies(k)} aria-label={`Kies ${k.title} (${k.year || tr('match.yearUnknown')})`}>
                  <div className="poster">
                    {k.poster ? <img src={IMG(k.poster, 'w342')} alt="" loading="lazy" /> : <Clapperboard size={20} strokeWidth={1.4} aria-hidden="true" />}
                    {isHuidige && <span className="match-current" title={tr("match.current")}><Check size={11} strokeWidth={3} /></span>}
                  </div>
                  <div className="match-meta">
                    <span className="mt">{k.title}</span>
                    <span className="my">{k.year || tr('match.yearUnknown')}{k.lang ? ` · ${k.lang.toUpperCase()}` : ''}{k.votes != null ? ` · ${tr('match.votesShort', { count: k.votes, n: k.votes >= 1000 ? `${Math.round(k.votes / 1000)}k` : k.votes })}` : ''}</span>
                  </div>
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <button className="btn ghost" onClick={volgende}>{tr('match.thisIsRight')} <ArrowRight size={14} /></button>
            <button className="btn ghost" style={{ color: 'var(--dot-o)' }} onClick={negeer}>{tr('match.notAFilm')}</button>
          </div>
        </>
      )}
    </div>
  );
}
