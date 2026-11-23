import { useEffect, useRef, useState } from 'react';
import { useT } from '../lib/i18n.js';
import { fetchDetailById, effectiveTmdbKey } from '../lib/tmdb.js';
import { leesOpslag, schrijfOpslag } from '../lib/storage.js';
import { usePoll } from '../lib/usePoll.js';
import { useFilmkleur } from '../lib/filmkleur.js';
import { AVOND_GAT } from '../lib/kaartjesdoos.js';
import { renderShareCard, shareOrDownload } from '../lib/extra.js';
import { haalZaal, doeMee, stuurStem, stemRij, nieuwToken, doetMee } from '../lib/zaalstemming.js';
import { lijstje, genreKop, genreZin, uitslagZin, stemTekst, ZaalFilmInhoud, ZaalCodeInvoer, StemKnoppen } from './ZaalDelen.jsx';
import ZaalLetterboxd, { useZaalLetterboxd } from './ZaalLetterboxd.jsx';
import ZaalVoordracht, { useZaalVoordracht } from './ZaalVoordracht.jsx';
import Kaartje from './Kaartje.jsx';
import StemOefening from './StemOefening.jsx';

// De telefoon bij een zaalstemming (?zaal=CODE): een naam, en dan per ronde
// een 1e en een 2e keus, die je kunt wisselen of terugnemen. Geen watchlist
// of account nodig; alles komt uit de zaal. Wat er gekozen wordt, staat op
// het grote scherm (ZaalScherm.jsx). Wie wil, laat de eigen Letterboxd
// meetellen (ZaalLetterboxd.jsx) of draagt zelf een film voor
// (ZaalVoordracht.jsx). Tijdens de trailers kijkt de telefoon mee en kun je
// alvast stemmen; na afloop krijgt iedereen het kaartje mee naar huis.
const IK = 'zaalIk'; // { [code]: { naam, token } }, zodat herladen je stem niet kost

//   onKaartje(film, opties): het kaartje in de eigen kaartjesdoos (App.jsx geefKaartje)
export default function ZaalTelefoon({ code, onWeg, onCode, onKaartje, pollMs = 2000, zoekMs }) {
  const { t: tr } = useT();
  const [zaal, setZaal] = useState(null);
  const [ongeldig, setOngeldig] = useState(false);
  const [ik, setIk] = useState(() => (leesOpslag(IK, {}) || {})[code] || null);
  const [naam, setNaam] = useState(ik?.naam || '');
  const [melding, setMelding] = useState('');
  const [bezig, setBezig] = useState(false);
  const [keuze, setKeuze] = useState(null); // { ronde, keuze }
  const herstel = useRef(false);
  const verstuur = useRef(null);
  if (!verstuur.current) verstuur.current = stemRij(stuurStem);
  const binnenNu = !!ik && !!zaal && doetMee(zaal.spelers, ik.naam);
  const lb = useZaalLetterboxd({ code, ik, zaal, binnen: binnenNu });
  const vd = useZaalVoordracht({ code, ik, zaal, binnen: binnenNu, ...(zoekMs != null ? { zoekMs } : {}) });
  // Alvast stemmen tijdens de trailers: { ronde, keuze }. Gaat de stemming
  // open (de volgende ronde), dan gaat hij meteen de deur uit.
  const [voorStem, setVoorStem] = useState(null);
  const voorVerstuurd = useRef(null);

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
      await verstuur.current(code, ik.naam, ik.token, ronde, k);
    } catch (err) {
      if (err.message === 'OUDE_RONDE' || err.message === 'DICHT') laad();
      else setMelding(tr('zaal.stemFout', { msg: err.message }));
    }
  };

  useEffect(() => {
    if (zaal?.fase !== 'film' || !voorStem || zaal.ronde !== voorStem.ronde + 1 || voorVerstuurd.current === zaal.ronde) return;
    voorVerstuurd.current = zaal.ronde;
    if (!gekozen && voorStem.keuze.some((x) => x != null)) stem(voorStem.keuze);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zaal?.fase, zaal?.ronde]);

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
        <KaartjeMee film={film} namen={zaal.spelers || []} waarom={uitslagZin(zaal.uitslag, tr)} onKaartje={onKaartje} onWeg={onWeg} />
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
        <ZaalVoordracht vd={vd} />
        <ZaalLetterboxd lb={lb} />
        <OefenKaart />
      </>,
    );
  }

  // Je stem in deze ronde: wat je net tikte, of wat de zaal van je heeft
  const naamVan = (id) => (zaal.opties || []).find((o) => o.id === id)?.naam || films.find((f) => f.key === id)?.name || id;
  const status = gekozen?.length > 0 && (
    <p className="zs-t-status" role="status">{tr('zaal.tJouwStem', { stem: stemTekst(gekozen, naamVan, tr) })}</p>
  );

  if (zaal.fase === 'genre') {
    const opties = zaal.opties || [];
    return scherm(
      <>
        <h1 className="zs-t-kop">{tr('zaal.tKiesGenre')}</h1>
        <p className="zs-t-sub">{tr('zaal.tStemUitleg')}</p>
        <ul className="zs-t-opties">
          {opties.map((o) => (
            <li key={o.id} className="zs-t-optie">
              <span className="zs-t-optie-naam">{o.naam}<span className="zs-optie-n">{tr('zaal.nFilms', { count: o.n })}</span></span>
              <StemKnoppen id={o.id} naam={o.naam} stem={gekozen} onStem={stem} />
            </li>
          ))}
        </ul>
        {status}
        <ZaalVoordracht vd={vd} compact />
        <ZaalLetterboxd lb={lb} compact />
      </>,
    );
  }

  const trailerLink = (f) => f.trailer && (
    <a className="zs-t-trailer" href={`https://www.youtube.com/watch?v=${f.trailer}`} target="_blank" rel="noreferrer">
      {tr('zaal.tTrailerYoutube', { name: f.name })}
    </a>
  );
  // Eerst de films van de lijst, dan de aanraders en de voordrachten, elk
  // met een kopje als er meer groepen zijn
  const groepen = (regel) => {
    const alle = [
      { kop: tr('zaal.vanLijst'), films: films.filter((f) => !f.aanrader && !f.voorgedragen) },
      { kop: tr('zaal.aanradersKop'), films: films.filter((f) => f.aanrader) },
      { kop: tr('zaal.voordrachtenKop'), films: films.filter((f) => f.voorgedragen) },
    ].filter((g, i) => i === 0 || g.films.length);
    const ol = (fs) => <ol className="zs-t-films">{fs.map(regel)}</ol>;
    if (alle.length === 1) return ol(alle[0].films);
    return alle.map((g) => (
      <div key={g.kop} className="zs-t-groep">
        <p className="label-breed zs-groep">{g.kop}</p>
        {ol(g.films)}
      </div>
    ));
  };

  if (zaal.fase === 'film') {
    const badge = (f) => (gekozen?.[0] === f.key ? tr('zaal.favoriet') : gekozen?.[1] === f.key ? tr('zaal.tweede') : null);
    return scherm(
      <>
        <h1 className="zs-t-kop">{tr('zaal.tKiesFilm')}</h1>
        <p className="zs-t-sub">{tr('zaal.tStemUitleg')}</p>
        {status}
        {groepen((f) => (
          <li key={f.key}>
            <div className="zs-t-filmregel">
              <div className="zs-film"><ZaalFilmInhoud film={f} badge={badge(f)} /></div>
              <StemKnoppen id={f.key} naam={f.name} stem={gekozen} onStem={stem} />
            </div>
            {trailerLink(f)}
          </li>
        ))}
      </>,
    );
  }

  // De trailers draaien op het scherm. De telefoon laat zien welke er nu
  // draait, en wie het al weet, stemt alvast: dat telt zodra het stemmen begint.
  const nu = zaal.nu && films.find((f) => f.key === zaal.nu.key);
  const alvast = voorStem?.ronde === ronde ? voorStem.keuze : null;
  const zetAlvast = (k) => setVoorStem({ ronde, keuze: k });
  const merk = (f) => (alvast?.[0] === f.key ? tr('zaal.favoriet') : alvast?.[1] === f.key ? tr('zaal.tweede') : null);
  // Je voordracht: ligt hij op tafel?
  const opTafel = vd.mijn && films.some((f) => f.id === vd.mijn.id || (f.voor || []).includes(ik.naam));
  return scherm(
    <>
      <h1 className="zs-t-kop">{genreKop(zaal.genre, tr)}</h1>
      <p className="zs-t-sub">{genreZin(zaal.genre, tr)} {tr('zaal.tTrailersOpScherm')}</p>
      {nu && (
        <div className="zs-t-nu" role="status">
          <p className="label-breed">{tr('zaal.tNuOpScherm', { i: zaal.nu.i, n: zaal.nu.n })}</p>
          <div className="zs-t-filmregel">
            <div className="zs-film"><ZaalFilmInhoud film={nu} badge={merk(nu)} /></div>
            <StemKnoppen id={nu.key} naam={nu.name} stem={alvast} onStem={zetAlvast} />
          </div>
        </div>
      )}
      {alvast?.some((x) => x != null)
        ? <p className="zs-t-status" role="status">{tr('zaal.tAlvastStem', { stem: stemTekst(alvast, naamVan, tr) })}</p>
        : <p className="zs-t-sub">{tr('zaal.tAlvastUitleg')}</p>}
      {zaal.vd > 0 && vd.mijn && (
        <p className="zs-t-sub">{opTafel ? tr('zaal.vdOpTafel') : tr('zaal.vdNietOpTafel', { titel: vd.mijn.name })}</p>
      )}
      <ZaalLetterboxd lb={lb} compact />
      {groepen((f) => (
        <li key={f.key} className={nu?.key === f.key ? 'nu' : undefined}>
          <div className="zs-t-filmregel">
            <div className="zs-film"><ZaalFilmInhoud film={f} badge={merk(f)} /></div>
            {nu?.key === f.key
              ? <span className="zs-t-nu-merk">{tr('zaal.tNuMerk')}</span>
              : <StemKnoppen id={f.key} naam={f.name} stem={alvast} onStem={zetAlvast} />}
          </div>
          {trailerLink(f)}
        </li>
      ))}
    </>,
  );
}

// Terwijl je wacht: oefenen met stemmen, met verzonnen gasten
// (StemOefening.jsx). Dicht tot je erop tikt; er gaat niets naar de zaal.
function OefenKaart() {
  const { t: tr } = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="zs-t-oefen">
      <button type="button" className="linkbtn" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? tr('oefen.sluit') : tr('oefen.telefoon')}
      </button>
      {open && (
        <>
          <StemOefening />
          <p className="zs-t-sub">{tr('oefen.nietEcht')}</p>
        </>
      )}
    </div>
  );
}

// Het kaartje mee naar huis: hetzelfde kaartje als op het scherm, met
// iedereen erop. Bewaren zet het in de kaartjesdoos op deze telefoon (de
// tool vraagt dan later of je hem gekeken hebt); delen maakt er een plaatje van.
//   waarom: waarom hij won ("Met 5 punten.")
function KaartjeMee({ film, namen, waarom, onKaartje, onWeg }) {
  const { t: tr } = useT();
  const kleur = useFilmkleur(film.poster);
  const kaal = { key: film.key, name: film.name, year: film.year };
  const [meta, setMeta] = useState(() => ({ id: film.id || null, poster: film.poster || null, runtime: film.runtime || null }));
  const [bewaard, setBewaard] = useState(() => (leesOpslag('kaartjes', []) || [])
    .some((k) => k.key === film.key && Math.abs(Date.now() - Date.parse(k.datum)) < AVOND_GAT));
  const [deelt, setDeelt] = useState(false);

  // De rest van het kaartje (regie, rolverdeling, waar te zien) van TMDB
  useEffect(() => {
    if (!film.id) return undefined;
    let weg = false;
    fetchDetailById(film.id, effectiveTmdbKey('')).then((m) => { if (!weg && m) setMeta((oud) => ({ ...oud, ...m })); }).catch(() => {});
    return () => { weg = true; };
  }, [film.id]);

  const bewaar = () => {
    onKaartje?.(kaal, { bron: 'zaal', personen: Math.max(namen.length, 1), namen, poster: film.poster || null });
    setBewaard(true);
  };
  const deel = async () => {
    setDeelt(true);
    try {
      const blob = await renderShareCard(kaal, meta);
      if (blob) await shareOrDownload(blob, `zaal-${film.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`);
    } catch { /* afgebroken of niet gelukt */ }
    setDeelt(false);
  };

  return (
    <div className="zs-t-kaartje">
      <Kaartje film={kaal} meta={meta} personen={Math.max(namen.length, 1)} namen={namen} kleur={kleur} />
      {waarom && <p className="zs-t-sub">{waarom}</p>}
      <div className="zs-t-kaartje-knoppen">
        {onKaartje && (
          <button type="button" className="btn primary" onClick={bewaar} disabled={bewaard}>
            {bewaard ? tr('zaal.tBewaard') : tr('zaal.tBewaar')}
          </button>
        )}
        <button type="button" className="btn" onClick={deel} disabled={deelt}>{deelt ? tr('zaal.tDeelt') : tr('zaal.tDeel')}</button>
      </div>
      {bewaard && (
        <p className="zs-t-sub" role="status">
          {tr('zaal.tBewaardUitleg')} <button type="button" className="linkbtn" onClick={onWeg}>{tr('zaal.tNaarTool')}</button>
        </p>
      )}
    </div>
  );
}