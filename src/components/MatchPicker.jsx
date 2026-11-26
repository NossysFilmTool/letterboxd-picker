import { useState, useEffect } from 'react';
import { Clapperboard, Check, X, ArrowRight, Search } from 'lucide-react';
import { IMG, searchMovies, fetchRegisseurs } from '../lib/tmdb.js';
import { useT } from '../lib/i18n.js';

// Toont per twijfelfilm de TMDB-zoekresultaten als posters, zodat je zélf
// de juiste kiest. Eerst de films uit het jaar dat Letterboxd noemt, met de
// regisseur erbij; vind je hem niet, zoek dan op een andere titel.
//   Deze klopt:  de huidige koppeling is goed; de twijfel gaat eraf
//   Sla over:    later nog eens
//   Geen film:   van je watchlist: hoort er niet op; anders: koppeling eraf
export default function MatchPicker({ films, app, onClose }) {
  const { t: tr } = useT();
  const [idx, setIdx] = useState(0);
  const [kandidaten, setKandidaten] = useState([]);
  const [laden, setLaden] = useState(false);
  const [zoek, setZoek] = useState(films[0]?.name || '');
  const [vraag, setVraag] = useState(null); // { tekst, jaar }: de zoekopdracht die nu loopt
  const [regisseurs, setRegisseurs] = useState({}); // { tmdbId: ['naam'] }

  const film = films[idx];
  const huidige = film ? app.meta[film.key] : null;

  // Een nieuwe film: zoek op zijn titel en jaar
  useEffect(() => {
    if (!film) return;
    setZoek(film.name);
    setVraag({ tekst: film.name, jaar: film.year || null });
  }, [idx, film]);

  useEffect(() => {
    if (!vraag) return undefined;
    let stop = false;
    setLaden(true);
    setKandidaten([]);
    searchMovies(app.tmdbKey, vraag.tekst, { jaar: vraag.jaar })
      .then((r) => {
        if (stop) return;
        setKandidaten(r);
        // De regisseurs erbij, zonder op ze te wachten
        r.forEach((k) => {
          fetchRegisseurs(k.id, app.tmdbKey)
            .then((namen) => { if (!stop && namen.length) setRegisseurs((x) => ({ ...x, [k.id]: namen })); })
            .catch(() => {});
        });
      })
      .catch(() => { if (!stop) setKandidaten([]); })
      .finally(() => { if (!stop) setLaden(false); });
    return () => { stop = true; };
  }, [vraag, app.tmdbKey]);

  const volgende = () => {
    if (idx + 1 < films.length) setIdx(idx + 1);
    else onClose();
  };

  const kies = async (kandidaat) => {
    await app.pickMatch(film.key, kandidaat.id);
    volgende();
  };
  const klopt = () => {
    app.bevestigMatch(film.key);
    volgende();
  };
  const geenFilm = () => {
    if ((app.watchlistAll || []).some((f) => f.key === film.key)) app.ignoreFilm(film.key);
    else app.wisKoppeling(film.key);
    volgende();
  };
  const zoekOpnieuw = (e) => {
    e.preventDefault();
    if (zoek.trim()) setVraag({ tekst: zoek.trim(), jaar: null });
  };

  // Weinig of geen treffers wijst vaak op een tv-serie die Letterboxd meesmokkelde
  const magerResultaat = !laden && kandidaten.length <= 1;

  if (!film) {
    return (
      <div className="card" style={{ marginTop: 14 }}>
        <p className="big" style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700 }}>{tr('match.allDone')}</p>
        <p style={{ color: 'var(--fog)', fontSize: 13.5, marginTop: 6 }}>{tr('match.allChecked')}</p>
        <button className="btn" style={{ marginTop: 12 }} onClick={onClose}>{tr('match.close')}</button>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: 14, borderColor: 'var(--line-strong)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <p className="label" style={{ marginBottom: 4 }}>{tr('match.title', { i: idx + 1, n: films.length })}</p>
          <p style={{ fontSize: 14, color: 'var(--fog)' }}>
            {tr('match.listSays', { name: film.name })}{film.year ? tr('match.fromYear', { year: film.year }) : ''}.{huidige?.year ? tr('match.nowLinked', { year: huidige.year }) : ''}{tr('match.chooseBelow')}
          </p>
        </div>
        <button className="btn ghost" onClick={onClose}><X size={14} /> {tr('match.stopBtn')}</button>
      </div>

      <form onSubmit={zoekOpnieuw} style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <input className="field" style={{ maxWidth: 320 }} value={zoek} onChange={(e) => setZoek(e.target.value)} aria-label={tr('match.zoekLabel')} />
        <button type="submit" className="btn" disabled={laden || !zoek.trim()}><Search size={14} /> {tr('match.zoek')}</button>
      </form>

      {laden ? (
        <p style={{ color: 'var(--fog-dim)', fontSize: 13, marginTop: 16 }}>{tr('match.searching')}</p>
      ) : kandidaten.length === 0 ? (
        <p style={{ color: 'var(--fog)', fontSize: 13.5, marginTop: 16 }}>{tr('match.noneFound', { name: vraag?.tekst || film.name })}</p>
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
              const regie = regisseurs[k.id];
              return (
                <button key={k.id} className="match-tile" onClick={() => kies(k)} aria-label={`Kies ${k.title} (${k.year || tr('match.yearUnknown')})`}>
                  <div className="poster">
                    {k.poster ? <img src={IMG(k.poster, 'w342')} alt="" loading="lazy" /> : <Clapperboard size={20} strokeWidth={1.4} aria-hidden="true" />}
                    {isHuidige && <span className="match-current" title={tr('match.current')}><Check size={11} strokeWidth={3} /></span>}
                  </div>
                  <div className="match-meta">
                    <span className="mt">{k.title}</span>
                    {k.orig && <span className="my">{k.orig}</span>}
                    <span className="my">{k.year || tr('match.yearUnknown')}{k.lang ? `, ${k.lang.toUpperCase()}` : ''}{k.votes != null ? `, ${tr('match.votesShort', { count: k.votes, n: k.votes >= 1000 ? `${Math.round(k.votes / 1000)}k` : k.votes })}` : ''}</span>
                    {regie && <span className="my">{tr('match.regie', { namen: regie.join(', ') })}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        {huidige?.id && <button className="btn" onClick={klopt}><Check size={14} /> {tr('match.thisIsRight')}</button>}
        <button className="btn ghost" onClick={volgende}>{tr('match.skip')} <ArrowRight size={14} /></button>
        <button className="btn ghost" style={{ color: 'var(--dot-o)' }} onClick={geenFilm}>{tr('match.notAFilm')}</button>
      </div>
    </div>
  );
}
