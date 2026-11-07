import { useMemo } from 'react';
import { Clapperboard } from 'lucide-react';
import { IMG } from '../lib/tmdb.js';
import { useT } from '../lib/i18n.js';
import { kaartjeInhoud, streepjes } from '../lib/kaartje.js';

// Het bioscoopkaartje van een pick: papier in de donkere zaal, met rechts
// een afscheurstrook met de poster. Het kaartje schuift bij het verschijnen
// uit een sleuf, zoals uit een kaartjesautomaat (zie .kaartje-sleuf).
//   personen: hoeveel mensen er kijken ("Toegang 3 personen" bij Avond)
export default function Kaartje({ film, meta, personen = 1, namen, kleur }) {
  const { t: tr, lang } = useT();
  // Aanvang en einde staan vast zolang dit kaartje er ligt
  const inhoud = useMemo(
    () => kaartjeInhoud(film, meta, { tr, lang, personen, namen }),
    [film.key, meta, lang, personen, namen?.join('|')], // tr hoort bij lang
  );
  const balken = useMemo(() => streepjes(inhoud.code || film.key), [inhoud.code, film.key]);

  return (
    <div className="kaartje-sleuf">
      <article className="kaartje" aria-label={tr('kaartje.aria', { name: film.name })}>
        <div className="kbody">
          <div className="kkop"><span>{inhoud.kop}</span><span>{inhoud.datum}</span></div>
          <h2 className="ktitel"><span aria-hidden="true">{inhoud.titel}</span><span className="sr-only">{film.name}</span></h2>
          {inhoud.aftiteling && <p className="kaftiteling">{inhoud.aftiteling}</p>}
          <dl className="kvelden">
            {inhoud.velden.map((v) => (
              <div key={v.k} className={v.vol ? 'vol' : v.breed ? 'breed' : undefined}>
                <dt>{v.k}</dt>
                <dd>{v.v}</dd>
              </div>
            ))}
          </dl>
          <div className="kvoet">
            {inhoud.code && (
              <div className="kcode">
                <svg width="190" height="34" viewBox="0 0 190 34" aria-hidden="true">
                  {balken.map(([x, w]) => <rect key={x} x={x} y="0" width={w} height="34" />)}
                </svg>
                <span>{inhoud.code}</span>
              </div>
            )}
            <span className="ktoegang">{inhoud.toegang}</span>
          </div>
        </div>
        <div className="kstrook" style={{ background: kleur }} aria-hidden="true">
          {meta?.poster ? <img src={IMG(meta.poster, 'w342')} alt="" /> : <Clapperboard size={28} strokeWidth={1.4} />}
          <span className="kgat boven" /><span className="kgat onder" />
        </div>
      </article>
    </div>
  );
}
