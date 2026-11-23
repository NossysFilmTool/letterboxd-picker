import { useState } from 'react';
import { useT } from '../lib/i18n.js';
import { uitslagGenre } from '../lib/zaalstemming.js';
import { StemKnoppen, stemTekst, genreKop, genreZin } from './ZaalDelen.jsx';

// Oefenen met stemmen (de rondleiding, en de telefoon in de lobby): drie
// genres, twee verzonnen gasten met een vaste stem, en jij. Het telt met de
// echte code van de zaal (lib/zaalstemming.js) en zegt de uitslag met
// dezelfde zinnen als het scherm. Er gaat niets de deur uit.
const GENRES = ['drama', 'komedie', 'thriller'];
// Sam en Noor kozen elk een andere favoriet, met dezelfde 2e keus. Zonder
// jouw stem staat alles gelijk op punten en wint wat op de meeste lijstjes
// staat; met jouw stem kan een tweede genre brede steun krijgen.
export const OEFEN_GASTEN = [['Sam', ['drama', 'thriller']], ['Noor', ['komedie', 'thriller']]];
// Genoeg films die alle drie de genres zijn, zodat "films die allebei zijn"
// altijd kan
const POT = [1, 2, 3, 4, 5].map((i) => ({ key: `oefen${i}` }));
const META = Object.fromEntries(POT.map((f) => [f.key, { genres: GENRES }]));
const OPTIES = GENRES.map((id) => ({ id, naam: id, n: POT.length }));

// De uitslag met jouw stem erbij: { genre (voor genreKop en genreZin), telling }
export function oefenUitslag(mijn) {
  const res = uitslagGenre({ opties: OPTIES, stemmen: [...OEFEN_GASTEN.map(([, s]) => s), mijn || []], pool: POT, meta: META, nodig: POT.length });
  return { genre: { namen: res.namen, wijze: res.wijze, punten: res.punten }, telling: res.telling };
}

export default function StemOefening({ className = '' }) {
  const { t: tr } = useT();
  const [mijn, setMijn] = useState([]);
  const naam = (id) => tr(`oefen.genres.${id}`);
  const { genre, telling } = oefenUitslag(mijn);
  const alsNamen = { ...genre, namen: genre.namen.map(naam) };
  const jij = tr('oefen.jij');
  return (
    <div className={`stem-oefening ${className}`} role="group" aria-label={tr('oefen.kop')}>
      <p className="so-intro">{tr('oefen.uitleg')}</p>
      <ul className="so-opties">
        {GENRES.map((id) => (
          <li key={id} className="so-optie">
            <span className="so-naam">
              {naam(id)}
              <span className="so-telling">{tr('zaal.puntenKort', { count: telling.punten[id] })}, {tr('oefen.lijstjes', { count: telling.lijstjes[id] })}</span>
            </span>
            <StemKnoppen id={id} naam={naam(id)} stem={mijn} onStem={setMijn} />
          </li>
        ))}
      </ul>
      <ul className="so-stemmen">
        {OEFEN_GASTEN.map(([n, s]) => <li key={n}>{tr('oefen.stem', { naam: n, stem: stemTekst(s, naam, tr) })}</li>)}
        <li className="jij">{mijn.length ? tr('oefen.stem', { naam: jij, stem: stemTekst(mijn, naam, tr) }) : tr('oefen.geenStem', { naam: jij })}</li>
      </ul>
      <div className="so-uitslag" aria-live="polite">
        <p className="so-kop">{genreKop(alsNamen, tr)}</p>
        <p className="so-zin">{genreZin(alsNamen, tr)}</p>
      </div>
    </div>
  );
}
