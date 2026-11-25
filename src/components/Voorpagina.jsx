import { Clapperboard } from 'lucide-react';
import { IMG } from '../lib/tmdb.js';
import { useT, decimaal } from '../lib/i18n.js';
import { fmtScore, appScore } from '../lib/pick.js';
import { drukletters } from '../lib/kaartje.js';
import { useFilmkleur } from '../lib/filmkleur.js';
import { sterrenTekst } from './Kaartjesdoos.jsx';

// De onderdelen van de voorpagina (DESIGN.md, "De voorpagina"): de hoofdfilm
// van vanavond, een kop per rubriek, de programmaregels van Net binnen en de
// laatste kaartjes uit je doos als losse stroken.

const klok = (d, lang) => new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' }).format(d);

// Een rubriek: de kop groot en smal, rechts een klein bijschrift of een link
export function Rubriek({ kop, sub, children, label, uitleg }) {
  return (
    <section className="rubriek" aria-label={label || kop} data-uitleg={uitleg}>
      <div className="rubriek-kop">
        <h2>{kop}</h2>
        {sub}
      </div>
      {children}
    </section>
  );
}

// Het titelblok van een filmposter: wie de film maakte en wie erin spelen
function Titelblok({ m }) {
  const { t: tr, lang } = useT();
  const cast = (m.cast || []).slice(0, 2);
  if (!m.director && !cast.length) return null;
  const leesbaar = m.director && cast.length
    ? tr('kaartje.aftitelingBeide', { regie: m.director, namen: cast.join(` ${tr('kaartje.en')} `) })
    : m.director ? tr('kaartje.aftitelingRegie', { regie: m.director }) : tr('kaartje.aftitelingCast', { namen: cast.join(` ${tr('kaartje.en')} `) });
  const klein = (s) => <span className="tb-klein">{drukletters(s, lang)}</span>;
  return (
    <p className="titelblok" aria-label={leesbaar}>
      <span aria-hidden="true">
        {m.director && <>{klein(tr('voorpagina.tbVan'))} {drukletters(m.director, lang)}</>}
        {cast.length > 0 && (
          <>
            {m.director ? ' ' : ''}{klein(tr('voorpagina.tbMet'))} {drukletters(cast[0], lang)}
            {cast[1] && <> {klein(tr('voorpagina.tbEn'))} {drukletters(cast[1], lang)}</>}
          </>
        )}
      </span>
    </p>
  );
}

// De hoofdfilm van vanavond: het filmbeeld, en daaronder een vlak in de kleur
// van de film met de titel groot, het titelblok, de reden en de knoppen
//   keuze: uit kiesHoofdfilm (lib/voorpagina.js); aanvang: Date
//   voorfilm: uit kiesVoorfilm, een korte film van je lijst (of null)
export function Hoofdfilm({ keuze, aanvang, onKaartje, onAnder, bezig, voorfilm = null, voorfilmOpen = false, onVoorfilm }) {
  const { t: tr, lang } = useT();
  const { film, m, dienst, reden } = keuze;
  const kleur = useFilmkleur(m.poster);
  const einde = m.runtime ? new Date(aanvang.getTime() + m.runtime * 60000) : null;
  const ns = appScore(m);
  const redenTekst = (() => {
    const klaar = einde ? klok(einde, lang) : '';
    switch (reden.soort) {
      case 'binnen': return tr('voorpagina.r_binnen', { dienst: reden.dienst });
      case 'regisseur': return tr('voorpagina.r_regisseur', { regisseur: reden.regisseur, titel: reden.titel, sterren: decimaal(reden.sterren) });
      case 'hoogste': return tr('voorpagina.r_hoogste');
      case 'smaak': {
        const genre = reden.genre ? reden.genre.toLocaleLowerCase(lang) : null;
        if (genre && reden.era) return tr('voorpagina.r_smaakTijd', { pct: reden.pct, genre, era: reden.era });
        if (genre) return tr('voorpagina.r_smaakGenre', { pct: reden.pct, genre });
        return tr('voorpagina.r_smaak', { pct: reden.pct });
      }
      case 'dienst': return tr('voorpagina.r_dienst', { dienst: reden.dienst, klaar });
      case 'past': return tr('voorpagina.r_past', { klaar });
      default: return tr('voorpagina.r_lijst');
    }
  })();
  return (
    <section className="hoofdfilm" style={{ '--film': kleur }} aria-labelledby="hoofdfilm-titel"
      data-uitleg="hoofdfilm" data-uitleg-titel={film.name} data-uitleg-reden={redenTekst}>
      {m.backdrop && <img className="hoofdfilm-beeld" src={IMG(m.backdrop, 'w1280')} alt="" />}
      <div className="hoofdfilm-vlak">
        <p className="hoofdfilm-boven label-breed">
          <span>{tr('voorpagina.hoofdfilm')}</span>
          <span>{einde ? tr('voorpagina.tijden', { van: klok(aanvang, lang), tot: klok(einde, lang) }) : tr('voorpagina.vanaf', { van: klok(aanvang, lang) })}</span>
        </p>
        <h1 id="hoofdfilm-titel" className={`hoofdfilm-titel${film.name.length > 22 ? ' lang' : ''}`}>{film.name}</h1>
        <Titelblok m={m} />
        <p className="hoofdfilm-reden">{redenTekst}</p>
        {voorfilm && (
          <p className="hoofdfilm-voorfilm">
            <span className="label-breed">{tr('voorpagina.voorfilm')}</span>
            <button type="button" className="linkbtn" onClick={onVoorfilm} aria-expanded={voorfilmOpen}>{voorfilm.film.name}</button>
            {voorfilm.m.runtime ? <span>{voorfilm.m.runtime} min</span> : null}
          </p>
        )}
        <p className="hoofdfilm-meta meta">
          {film.year ? <span>{film.year}</span> : null}
          {m.runtime ? <span>{m.runtime} min</span> : null}
          {ns != null ? <span>{tr('winner.appScore')} {fmtScore(ns)}</span> : null}
          {dienst ? <span>{tr('voorpagina.nuOp', { p: dienst })}</span> : null}
        </p>
        <div className="hoofdfilm-acties" data-uitleg="hoofdfilm-acties">
          <button type="button" className="btn primary" onClick={onKaartje} disabled={bezig}>{tr('voorpagina.pakKaartje')}</button>
          <button type="button" className="linkbtn" onClick={onAnder} disabled={bezig}>{tr('voorpagina.ander')}</button>
        </div>
      </div>
    </section>
  );
}

// Net binnen als programmaregels: dag, titel, gegevens, een kleine poster.
// Tik op een regel en hij wordt de hoofdfilm van vanavond.
export function Programmaregels({ regels, meta, onKies }) {
  const { t: tr, lang } = useT();
  return (
    <ul className="programmaregels">
      {regels.map(({ film, dienst, sinds }) => {
        const m = meta[film.key] || {};
        const ns = appScore(m);
        const d = new Date(sinds);
        return (
          <li key={film.key}>
            <button type="button" className="programmaregel" onClick={() => onKies(film)} aria-label={tr('voorpagina.alsHoofdfilm', { titel: film.name })}>
              <span className="programmaregel-dag label-breed" aria-hidden="true">
                {new Intl.DateTimeFormat(lang, { weekday: 'short' }).format(d)}<br />{new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }).format(d)}
              </span>
              <span className="programmaregel-midden" aria-hidden="true">
                <span className="programmaregel-titel">{film.name}</span>
                <span className="programmaregel-sub">
                  <span>{dienst}</span>
                  {m.runtime ? <span>{m.runtime} min</span> : null}
                  {ns != null ? <span>{fmtScore(ns)}</span> : null}
                </span>
              </span>
              {m.poster ? <img src={IMG(m.poster, 'w154')} alt="" loading="lazy" /> : <span className="programmaregel-leeg"><Clapperboard size={16} strokeWidth={1.4} aria-hidden="true" /></span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// De laatste kaartjes uit je doos, als losse stroken in een waaier
function Waaierstrook({ k, meta, onOpen }) {
  const { t: tr, lang } = useT();
  const m = meta[k.key] || {};
  const kleur = useFilmkleur(m.poster || k.poster);
  const beeld = m.backdrop ? IMG(m.backdrop, 'w300') : (m.poster || k.poster) ? IMG(m.poster || k.poster, 'w185') : null;
  const d = new Date(String(k.gekekenOp).length === 10 ? `${k.gekekenOp}T12:00:00` : k.gekekenOp);
  const datum = drukletters(new Intl.DateTimeFormat(lang, { weekday: 'short', day: '2-digit', month: '2-digit' }).format(d).replace(/\./g, '').replace(/\//g, '-'), lang);
  return (
    <button type="button" className="kaartje-waaier" onClick={onOpen}
      aria-label={tr('kaartje.stubAria', { name: k.name, datum: new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long' }).format(d) })}>
      <span className="kaartje-waaier-beeld" style={{ background: kleur }} aria-hidden="true">{beeld && <img src={beeld} alt="" loading="lazy" />}</span>
      <span className="kaartje-waaier-papier" aria-hidden="true">
        <span className="kaartje-waaier-datum">{datum}</span>
        <span className="kaartje-waaier-titel">{drukletters(k.name, lang)}</span>
        <span className="kaartje-waaier-stempel">{k.sterren != null ? sterrenTekst(k.sterren) : drukletters(tr('kaartje.stempelGezien'), lang)}</span>
      </span>
    </button>
  );
}

export function DoosWaaier({ kaartjes, meta, onOpen }) {
  return (
    <div className="doos-waaier">
      {kaartjes.slice(0, 3).map((k) => <Waaierstrook key={k.id} k={k} meta={meta} onOpen={onOpen} />)}
    </div>
  );
}
