import { useMemo, useState } from 'react';
import { Clapperboard, Share2 } from 'lucide-react';
import { IMG } from '../lib/tmdb.js';
import { useT } from '../lib/i18n.js';
import { drukletters, kaartjeDatum } from '../lib/kaartje.js';
import { useFilmkleur } from '../lib/filmkleur.js';
import { jaarOverzicht } from '../lib/kaartjesdoos.js';
import { renderJaarKaart, shareOrDownload } from '../lib/extra.js';
import Sterren from './Sterren.jsx';

// De kaartjesdoos (Bieb, tab Kaartjes): elke pick die je echt gekeken hebt,
// als afgescheurde strook met de poster, de kijkdatum, je sterren als stempel
// en eventueel een notitie. Bovenaan je filmjaar, onderaan wat je recent koos
// maar niet in de doos zit. Welke kaartjes erin komen: lib/kaartjesdoos.js.
//   kaartjes: afgescheurde kaartjes (inDeDoos), laatst gekeken eerst
//   buiten:   recent gekozen, niet in de doos (buitenDeDoos)

export const sterrenTekst = (s) => '★'.repeat(Math.floor(s)) + (s % 1 >= 0.5 ? '½' : '');
// Letterboxd geeft alleen een dag ('2026-11-06'); midden op die dag lezen
const alsDatum = (s) => new Date(String(s).length === 10 ? `${s}T12:00:00` : s);
const posterVan = (k, meta) => meta[k.key]?.poster || k.poster || null;

export function bronTekst(k, tr) {
  if (k.bron === 'gevonden') return tr(`kaartje.gevonden_${['voorjou', 'zoeken', 'vergelijkbaar'].includes(k.vondst) ? k.vondst : 'nossy'}`);
  if (k.bron === 'zoeken') return tr('kaartje.bronZoeken');
  if (k.bron === 'samen') return tr('kaartje.bronSamen', { namen: (k.namen || []).join(', ') || k.personen });
  if (k.bron === 'avond') return tr('kaartje.bronAvond', { n: k.personen || 2 });
  if (k.bron === 'voorjou') return tr('kaartje.bronVoorJou');
  return tr('kaartje.bronPick');
}

function Strook({ k, poster, onOpen }) {
  const { t: tr, lang } = useT();
  const kleur = useFilmkleur(poster);
  const d = alsDatum(k.gekekenOp);
  return (
    <button type="button" className="kaartje-stub" onClick={() => onOpen(k)}
      aria-label={tr('kaartje.stubAria', { name: k.name, datum: new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long' }).format(d) })}>
      <span className="kaartje-stub-poster" style={{ background: kleur }} aria-hidden="true">
        {poster ? <img src={IMG(poster, 'w185')} alt="" loading="lazy" /> : <Clapperboard size={18} strokeWidth={1.4} />}
      </span>
      <span className="kaartje-stub-papier" aria-hidden="true">
        <span className="kaartje-stub-datum">{kaartjeDatum(d, lang)}</span>
        <span className="kaartje-stub-titel">{drukletters(k.name, lang)}</span>
        <span className="kaartje-stub-bron">{bronTekst(k, tr)}{k.year ? `, ${k.year}` : ''}</span>
        {k.notitie && <span className="kaartje-stub-notitie">{k.notitie}</span>}
        <span className={`kaartje-stub-stempel${k.sterren == null ? ' leeg' : ''}`}>
          {k.sterren != null ? sterrenTekst(k.sterren) : tr('kaartje.stempelGezien')}
        </span>
      </span>
    </button>
  );
}

// Eén kaartje beheren (bij het openen vanuit de doos): sterren, notitie, of
// toch niet gekeken
export function KaartjeBeheer({ k, onSterren, onNotitie, onNietGekeken }) {
  const { t: tr, lang } = useT();
  const [notitie, setNotitie] = useState(k.notitie || '');
  const d = alsDatum(k.gekekenOp);
  const bewijs = { letterboxd: tr('kaartje.bewijsLetterboxd'), antwoord: tr('kaartje.bewijsAntwoord'), gezien: tr('kaartje.bewijsGezien') }[k.bewijs] || '';
  return (
    <div className="card kaartje-beheer">
      <p className="label">{tr('kaartje.beheerKop', { datum: new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', year: 'numeric' }).format(d) })}{bewijs ? `, ${bewijs}` : ''}</p>
      <div className="kb-rij">
        <span className="kb-label">{tr('kaartje.jouwSterren')}</span>
        <Sterren onKies={onSterren} />
        {k.sterren != null && <span className="kb-nu">{sterrenTekst(k.sterren)}</span>}
      </div>
      <label className="kb-rij">
        <span className="kb-label">{tr('kaartje.notitie')}</span>
        <input className="field" maxLength={80} value={notitie} placeholder={tr('kaartje.notitiePlaceholder')}
          onChange={(e) => setNotitie(e.target.value)} onBlur={() => onNotitie(notitie.trim())}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
      </label>
      <button type="button" className="linkbtn kb-niet" onClick={onNietGekeken}>{tr('kaartje.tochNiet')}</button>
    </div>
  );
}

// Je filmjaar in kaartjes: de cijfers, en een deelbaar beeld
function Filmjaar({ overzicht, meta }) {
  const { t: tr, lang } = useT();
  const [bezig, setBezig] = useState(false);
  const fmt = (v) => (lang === 'nl' ? String(v).replace('.', ',') : String(v));
  const maand = new Intl.DateTimeFormat(lang, { month: 'long' }).format(new Date(overzicht.jaar, overzicht.besteMaand.maand, 1));
  const deel = async () => {
    setBezig(true);
    try {
      const blob = await renderJaarKaart(overzicht, meta);
      if (blob) await shareOrDownload(blob, `filmjaar-${overzicht.jaar}.png`);
    } catch (e) { console.warn('Filmjaar delen mislukt', e); }
    setBezig(false);
  };
  return (
    <section className="kd-jaar" aria-label={tr('kaartje.jaarTitel', { jaar: overzicht.jaar })}>
      <h3>{tr('kaartje.jaarTitel', { jaar: overzicht.jaar })}</h3>
      <dl className="kd-jaar-cijfers">
        <div><dt>{tr('kaartje.jaarKaartjes')}</dt><dd>{overzicht.aantal}</dd></div>
        {overzicht.gemiddeld != null && <div><dt>{tr('kaartje.jaarGemiddeld')}</dt><dd>{fmt(overzicht.gemiddeld)}</dd></div>}
        <div><dt>{tr('kaartje.jaarMaand')}</dt><dd className="woord">{maand}</dd></div>
        {overzicht.hoogste && <div><dt>{tr('kaartje.jaarHoogste')}</dt><dd className="woord">{overzicht.hoogste.name}</dd></div>}
        {overzicht.vaakstMet && <div><dt>{tr('kaartje.jaarMet')}</dt><dd className="woord">{overzicht.vaakstMet.naam}</dd></div>}
        {overzicht.gevonden > 0 && <div><dt>{tr('kaartje.jaarGevonden')}</dt><dd>{overzicht.gevonden}</dd></div>}
      </dl>
      <button type="button" className="btn" onClick={deel} disabled={bezig}><Share2 size={14} /> {bezig ? tr('winner.makingCard') : tr('kaartje.jaarDeel')}</button>
    </section>
  );
}

export default function Kaartjesdoos({ kaartjes, buiten = [], gelogd = [], meta, eigenNaam = null, onOpen, onTochGekeken, onGevonden }) {
  const { t: tr, lang } = useT();
  const [buitenOpen, setBuitenOpen] = useState(false);
  const [gelogdOpen, setGelogdOpen] = useState(false);
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
  // Dit jaar; in januari, zolang er nog niets is, het vorige jaar
  const overzicht = useMemo(() => {
    const jaar = new Date().getFullYear();
    return jaarOverzicht(kaartjes, jaar, { eigenNaam }) || jaarOverzicht(kaartjes, jaar - 1, { eigenNaam });
  }, [kaartjes, eigenNaam]);

  const buitenLijst = buiten.length > 0 && (
    <section className="kd-buiten">
      <button type="button" className="linkbtn" onClick={() => setBuitenOpen((v) => !v)} aria-expanded={buitenOpen}>
        {tr('kaartje.buitenKop', { count: buiten.length })}
      </button>
      {buitenOpen && (
        <ul>
          {buiten.slice(0, 12).map((k) => (
            <li key={k.id}>
              <span className="kd-buiten-naam">{k.name}{k.year ? ` (${k.year})` : ''}</span>
              <span className="kd-buiten-stand">
                {new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }).format(alsDatum(k.datum))}, {tr(`kaartje.stand_${k.status}`)}
              </span>
              <button type="button" className="btn ghost" onClick={() => onTochGekeken(k)}>{tr('kaartje.tochGekeken')}</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  // Je recente Letterboxd-logs die nog niet in de doos zitten: vond je er
  // een via Nossy, dan voeg je hem hier zelf toe
  const gelogdLijst = gelogd.length > 0 && onGevonden && (
    <section className="kd-buiten">
      <button type="button" className="linkbtn" onClick={() => setGelogdOpen((v) => !v)} aria-expanded={gelogdOpen}>
        {tr('kaartje.gelogdKop', { count: gelogd.length })}
      </button>
      {gelogdOpen && (
        <ul>
          {gelogd.slice(0, 15).map((d) => (
            <li key={`${d.key}|${d.watchedDate}`}>
              <span className="kd-buiten-naam">{d.name}{d.year ? ` (${d.year})` : ''}</span>
              <span className="kd-buiten-stand">{new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }).format(alsDatum(d.watchedDate))}</span>
              <button type="button" className="btn ghost" onClick={() => onGevonden(d)}>{tr('kaartje.gevondenKnop')}</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  if (!kaartjes.length) {
    return (
      <>
        <div className="empty card">
          <p className="big">{tr('kaartje.doosLeeg')}</p>
          <p>{tr('kaartje.doosLeegUitleg')}</p>
        </div>
        {buitenLijst}
        {gelogdLijst}
      </>
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
      {overzicht && <Filmjaar overzicht={overzicht} meta={meta} />}
      {perMaand.map((g) => (
        <section key={g.label} className="kd-maand">
          <h3>{g.label}</h3>
          <div className="kd-raster">
            {g.items.map((k) => <Strook key={k.id} k={k} poster={posterVan(k, meta)} onOpen={onOpen} />)}
          </div>
        </section>
      ))}
      {buitenLijst}
      {gelogdLijst}
    </div>
  );
}
