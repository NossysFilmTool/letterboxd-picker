import { useEffect, useRef, useState } from 'react';
import { useT } from '../lib/i18n.js';
import { IMG } from '../lib/tmdb.js';
import { leesOpslag, schrijfOpslag } from '../lib/storage.js';
import { usePoll } from '../lib/usePoll.js';
import { haalZaal, doeMee, stuurStem, nieuwToken, doetMee, tikFilm } from '../lib/zaalstemming.js';
import { lijstje, genreKop, genreZin, uitslagZin, ZaalFilmInhoud, ZaalCodeInvoer } from './ZaalDelen.jsx';

// De telefoon bij een zaalstemming (?zaal=CODE): een naam, en dan per ronde
// stemmen. Geen watchlist of account nodig; alles komt uit de zaal. Wat er
// gekozen wordt, staat op het grote scherm (ZaalScherm.jsx).
const IK = 'zaalIk'; // { [code]: { naam, token } }, zodat herladen je stem niet kost

export default function ZaalTelefoon({ code, onWeg, onCode, pollMs = 2000 }) {
  const { t: tr } = useT();
  const [zaal, setZaal] = useState(null);
  const [ongeldig, setOngeldig] = useState(false);
  const [ik, setIk] = useState(() => (leesOpslag(IK, {}) || {})[code] || null);
  const [naam, setNaam] = useState(ik?.naam || '');
  const [melding, setMelding] = useState('');
  const [bezig, setBezig] = useState(false);
  const [keuze, setKeuze] = useState(null); // { ronde, keuze }
  const herstel = useRef(false);

  const laad = async () => {
    try { setZaal(await haalZaal(code)); setOngeldig(false); } catch (e) { if (e.message === 'NOT_FOUND') setOngeldig(true); }
  };
  useEffect(() => { laad(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [code]);
  usePoll(laad, pollMs, !!zaal && !ongeldig && zaal.fase !== 'uitslag' && zaal.fase !== 'gesloten');

  // Botsten twee aanmeldingen, dan ontbreekt je naam: meld je dan stil opnieuw
  useEffect(() => {
    if (!ik || !zaal || zaal.fase !== 'lobby' || doetMee(zaal.spelers, ik.naam) || herstel.current) return;
    herstel.current = true;
    doeMee(code, ik.naam, ik.token).then((r) => { if (r?.zaal) setZaal(r.zaal); }).catch(() => {}).finally(() => { herstel.current = false; });
  }, [zaal, ik, code]);

  const meedoen = async (e) => {
    e?.preventDefault();
    const n = naam.replace(/\s+/g, ' ').trim().slice(0, 20);
    if (!n) { setMelding(tr('remote.nameFirst')); return; }
    setBezig(true);
    setMelding('');
    const token = ik?.token || nieuwToken();
    try {
      const r = await doeMee(code, n, token);
      const nieuw = { naam: r?.naam || n, token };
      const alle = leesOpslag(IK, {}) || {};
      schrijfOpslag(IK, Object.fromEntries([...Object.entries(alle).filter(([c]) => c !== code).slice(-4), [code, nieuw]]));
      setIk(nieuw);
      if (r?.zaal) setZaal(r.zaal);
    } catch (err) {
      const fouten = { NAAM_BEZET: 'zaal.tNaamBezet', BEGONNEN: 'zaal.tBegonnen', VOL: 'zaal.tVol', NOT_FOUND: 'zaal.tOngeldig' };
      setMelding(fouten[err.message] ? tr(fouten[err.message]) : tr('zaal.tFout', { msg: err.message }));
    }
    setBezig(false);
  };

  const ronde = zaal?.ronde;
  const gekozen = keuze && keuze.ronde === ronde ? keuze.keuze : null;
  const stem = async (k) => {
    setKeuze({ ronde, keuze: k });
    setMelding('');
    try {
      await stuurStem(code, ik.naam, ik.token, ronde, k);
    } catch (err) {
      if (err.message === 'OUDE_RONDE' || err.message === 'DICHT') laad();
      else setMelding(tr('zaal.stemFout', { msg: err.message }));
    }
  };

  const scherm = (inhoud) => (
    <div className="zs-telefoon">
      <p className="label-breed zs-boven">{tr('zaal.tTitel', { code })}</p>
      {inhoud}
      {melding && <p className="zs-melding" role="alert">{melding}</p>}
      <button type="button" className="linkbtn zs-weg" onClick={onWeg}>{tr('zaal.tWeg')}</button>
    </div>
  );

  if (ongeldig) {
    return scherm(
      <>
        <h1 className="zs-t-kop">{tr('zaal.tOngeldig')}</h1>
        <ZaalCodeInvoer onCode={onCode} kop={tr('zaal.tAndereCode')} />
      </>,
    );
  }
  if (!zaal) return scherm(<p className="zs-t-sub">{tr('zaal.tLaden')}</p>);

  if (!ik) {
    return scherm(
      <form className="zs-t-aanmelden" onSubmit={meedoen}>
        <h1 className="zs-t-kop">{tr('zaal.tWelkom')}</h1>
        <p className="zs-t-sub">{zaal.fase === 'lobby' ? tr('zaal.tUitleg') : tr('zaal.tBegonnen')}</p>
        <label className="zs-t-veld">
          <span className="label-breed">{tr('zaal.tNaam')}</span>
          <input className="field" value={naam} onChange={(e) => setNaam(e.target.value)} maxLength={20}
            autoComplete="nickname" placeholder={tr('zaal.tNaamPlaceholder')} />
        </label>
        <button type="submit" className="btn primary big" disabled={bezig}>{bezig ? tr('zaal.tBezig') : tr('zaal.tMeedoen')}</button>
      </form>,
    );
  }

  const binnen = doetMee(zaal.spelers, ik.naam);
  const films = zaal.films || [];

  if (zaal.fase === 'uitslag' && zaal.uitslag) {
    const film = films.find((f) => f.key === zaal.uitslag.key) || films[0];
    return scherm(
      <div className="zs-t-uitslag">
        <h1 className="zs-t-kop">{tr('zaal.hetWordt')}</h1>
        {film.poster && <img className="zs-t-uitslag-poster" src={IMG(film.poster, 'w342')} alt="" />}
        <p className="zs-t-uitslag-titel">{film.name}{film.year ? <span> {film.year}</span> : null}</p>
        <p className="zs-t-sub">{uitslagZin(zaal.uitslag, tr)}</p>
      </div>,
    );
  }

  if (!binnen && zaal.fase !== 'lobby') return scherm(<h1 className="zs-t-kop">{tr('zaal.tTeLaat')}</h1>);

  if (zaal.fase === 'lobby') {
    return scherm(
      <>
        <h1 className="zs-t-kop">{tr('zaal.tBinnen', { naam: ik.naam })}</h1>
        <p className="zs-t-sub">{tr('zaal.tWacht')}</p>
        {zaal.spelers?.length > 1 && <p className="zs-t-sub">{tr('zaal.tMet', { namen: lijstje(zaal.spelers.filter((n) => n !== ik.naam), tr) })}</p>}
      </>,
    );
  }

  if (zaal.fase === 'genre') {
    const opties = zaal.opties || [];
    const gekozenNaam = opties.find((o) => o.id === gekozen)?.naam;
    return scherm(
      <>
        <h1 className="zs-t-kop">{zaal.beslissend ? tr('zaal.rondeBeslissend') : tr('zaal.tKiesGenre')}</h1>
        {zaal.beslissend && <p className="zs-t-sub">{tr('zaal.gelijkTussen', { lijst: lijstje(opties.map((o) => o.naam), tr) })}</p>}
        <ul className="zs-t-opties">
          {opties.map((o) => (
            <li key={o.id}>
              <button type="button" className="zs-t-optie" aria-pressed={gekozen === o.id} onClick={() => stem(o.id)}>
                <span>{o.naam}</span><span className="zs-optie-n">{tr('zaal.nFilms', { count: o.n })}</span>
              </button>
            </li>
          ))}
        </ul>
        {gekozenNaam && <p className="zs-t-status" role="status">{tr('zaal.tGestemdOp', { keuze: gekozenNaam })} {tr('zaal.tWachtRest')}</p>}
      </>,
    );
  }

  const trailerLink = (f) => f.trailer && (
    <a className="zs-t-trailer" href={`https://www.youtube.com/watch?v=${f.trailer}`} target="_blank" rel="noreferrer">
      {tr('zaal.tTrailerYoutube', { name: f.name })}
    </a>
  );

  if (zaal.fase === 'film') {
    const badge = (f) => (gekozen?.[0] === f.key ? tr('zaal.favoriet') : gekozen?.[1] === f.key ? tr('zaal.tweede') : null);
    return scherm(
      <>
        <h1 className="zs-t-kop">{gekozen?.length > 1 ? tr('zaal.tKlaar') : gekozen?.length ? tr('zaal.tKiesTweede') : tr('zaal.tKiesFavoriet')}</h1>
        <ol className="zs-t-films">
          {films.map((f) => (
            <li key={f.key}>
              <button type="button" className="zs-film" aria-pressed={!!badge(f)} onClick={() => stem(tikFilm(gekozen, f.key))}>
                <ZaalFilmInhoud film={f} badge={badge(f)} />
              </button>
              {trailerLink(f)}
            </li>
          ))}
        </ol>
        {gekozen?.length > 0 && <p className="zs-t-status" role="status">{gekozen.length > 1 ? tr('zaal.tWachtRest') : tr('zaal.tStemBinnen')}</p>}
      </>,
    );
  }

  // De trailers draaien op het scherm
  return scherm(
    <>
      <h1 className="zs-t-kop">{genreKop(zaal.genre, tr)}</h1>
      <p className="zs-t-sub">{genreZin(zaal.genre, tr, !!zaal.beslissend)} {tr('zaal.tTrailersOpScherm')}</p>
      <ol className="zs-t-films">
        {films.map((f) => (
          <li key={f.key}>
            <div className="zs-film"><ZaalFilmInhoud film={f} /></div>
            {trailerLink(f)}
          </li>
        ))}
      </ol>
    </>,
  );
}
