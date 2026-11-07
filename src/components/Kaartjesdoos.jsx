import { useMemo } from 'react';
import { Clapperboard } from 'lucide-react';
import { IMG } from '../lib/tmdb.js';
import { useT } from '../lib/i18n.js';
import { drukletters, kaartjeDatum } from '../lib/kaartje.js';
import { useFilmkleur } from '../lib/filmkleur.js';

// De kaartjesdoos (Bieb, tab Kaartjes): elke pick die je echt gekeken hebt,
// als afgescheurde strook met de poster, de kijkdatum en je sterren als
// stempel. Welke kaartjes erin komen, staat in lib/kaartjesdoos.js.
//   kaartjes: afgescheurde kaartjes (inDeDoos), laatst gekeken eerst

const sterrenTekst = (s) => '★'.repeat(Math.floor(s)) + (s % 1 >= 0.5 ? '½' : '');
// Letterboxd geeft alleen een dag ('2026-11-06'); midden op die dag lezen
const alsDatum = (s) => new Date(String(s).length === 10 ? `${s}T12:00:00` : s);

function Strook({ k, poster, onOpen }) {
  const { t: tr, lang } = useT();
  const kleur = useFilmkleur(poster);
  const d = alsDatum(k.gekekenOp);
  const bron = k.bron === 'avond' ? tr('kaartje.bronAvond', { n: k.personen || 2 }) : tr('kaartje.bronPick');
  return (
    <button type="button" className="kaartje-stub" onClick={() => onOpen({ key: k.key, name: k.name, year: k.year })}
      aria-label={tr('kaartje.stubAria', { name: k.name, datum: new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long' }).format(d) })}>
      <span className="kaartje-stub-poster" style={{ background: kleur }} aria-hidden="true">
        {poster ? <img src={IMG(poster, 'w185')} alt="" loading="lazy" /> : <Clapperboard size={18} strokeWidth={1.4} />}
      </span>
      <span className="kaartje-stub-papier" aria-hidden="true">
        <span className="kaartje-stub-datum">{kaartjeDatum(d, lang)}</span>
        <span className="kaartje-stub-titel">{drukletters(k.name, lang)}</span>
        <span className="kaartje-stub-bron">{bron}{k.year ? `, ${k.year}` : ''}</span>
        <span className={`kaartje-stub-stempel${k.sterren == null ? ' leeg' : ''}`}>
          {k.sterren != null ? sterrenTekst(k.sterren) : tr('kaartje.stempelGezien')}
        </span>
      </span>
    </button>
  );
}

export default function Kaartjesdoos({ kaartjes, meta, onOpen }) {
  const { t: tr, lang } = useT();
  const perMaand = useMemo(() => {
    const groepen = [];
    kaartjes.forEach((k) => {
      const label = new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric' }).format(alsDatum(k.gekekenOp));
      const laatste = groepen[groepen.length - 1];
      if (laatste && laatste.label === label) laatste.items.push(k);
      else groepen.push({ label, items: [k] });
    });
    return groepen;
  }, [kaartjes, lang]);

  if (!kaartjes.length) {
    return (
      <div className="empty card">
        <p className="big">{tr('kaartje.doosLeeg')}</p>
        <p>{tr('kaartje.doosLeegUitleg')}</p>
      </div>
    );
  }

  const metSterren = kaartjes.filter((k) => k.sterren != null);
  const gemiddeld = metSterren.length
    ? (metSterren.reduce((a, k) => a + k.sterren, 0) / metSterren.length).toFixed(1)
    : null;
  return (
    <div className="kaartjesdoos">
      <p className="kd-telling">
        {tr('kaartje.doosTelling', { count: kaartjes.length })}
        {gemiddeld ? tr('kaartje.doosGemiddeld', { s: lang === 'nl' ? gemiddeld.replace('.', ',') : gemiddeld }) : ''}
      </p>
      {perMaand.map((g) => (
        <section key={g.label} className="kd-maand">
          <h3>{g.label}</h3>
          <div className="kd-raster">
            {g.items.map((k) => <Strook key={k.id} k={k} poster={meta[k.key]?.poster} onOpen={onOpen} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
