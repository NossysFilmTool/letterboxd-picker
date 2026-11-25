import { useEffect, useRef, useState } from 'react';
import { useT, getLang } from '../lib/i18n.js';
import { enrichAll, effectiveTmdbKey } from '../lib/tmdb.js';
import { parseLetterboxdFiles } from '../lib/csv.js';
import { leesOpslag, schrijfOpslag } from '../lib/storage.js';
import { idbAvailable, idbGetAll } from '../lib/idb.js';
import { haalVraag, stuurSmaak, trekSmaakIn } from '../lib/zaalstemming.js';
import {
  MIJN_LETTERBOXD, LETTERBOXD_EXPORT, profielUitApp, profielUitExport, ophalenVoorSmaak, oordeelVan,
} from '../lib/zaalgasten.js';

// Op de telefoon van een gast (ZaalTelefoon.jsx): laat je eigen Letterboxd
// meetellen, als je wilt. Het scherm vraagt het alleen als de gastheer dat
// aanzette. Eén tik als deze telefoon je al kent (een onthouden export, of
// de tool zelf met je gegevens); anders in drie stappen met je export. De
// export blijft hier; naar de zaal gaat per film alleen: gezien of niet, op
// je watchlist of niet, en hoe goed hij bij je past (lib/zaalgasten.js).

const KEUZE = 'zaalLbKeuze'; // { [code]: 'ja' | 'nee' }
const stapSleutel = (code) => `zaalLbStap.${code}`;

// Wat je in de zaal hebt gekozen, per zaal (de laatste vijf)
function bewaarKeuze(code, k) {
  const alle = leesOpslag(KEUZE, {}) || {};
  const rest = Object.entries(alle).filter(([c]) => c !== code).slice(-4);
  schrijfOpslag(KEUZE, Object.fromEntries(k ? [...rest, [code, k]] : rest));
}

// Ben je even naar Letterboxd voor je export, dan sta je bij terugkomst nog
// bij de stappen, ook als de browser de pagina opnieuw laadde
const leesStap = (code) => { try { return sessionStorage.getItem(stapSleutel(code)) || 'kies'; } catch { return 'kies'; } };
const bewaarStap = (code, s) => { try { sessionStorage.setItem(stapSleutel(code), s); } catch { /* geen opslag */ } };

// De hele gast-kant, los van wat er op het scherm staat: blijft lopen tussen
// de rondes door (een nieuwe vraag van het scherm beantwoordt hij vanzelf).
//   binnen: deze telefoon zit in de zaal
export function useZaalLetterboxd({ code, ik, zaal, binnen }) {
  const { t: tr } = useT();
  const [keuze, setKeuzeRuw] = useState(() => (leesOpslag(KEUZE, {}) || {})[code] || null);
  const [onthouden, setOnthouden] = useState(() => leesOpslag(MIJN_LETTERBOXD, null)?.profiel || null);
  const [appProfiel, setAppProfiel] = useState(undefined); // undefined: nog niet gekeken
  const [profiel, setProfiel] = useState(null); // waarmee deze telefoon oordeelt
  const [stap, setStapRuw] = useState(() => leesStap(code)); // kies | stappen | lezen
  const [voortgang, setVoortgang] = useState({ done: 0, total: 0 });
  const [onthoud, setOnthoud] = useState(true);
  const [melding, setMelding] = useState('');
  const [verstuurd, setVerstuurd] = useState(null); // { v, n } zoals de zaal het heeft
  const beantwoord = useRef(-1);
  const loopt = useRef(false);
  const actief = !!zaal?.lb && !!binnen && !!ik && zaal.fase !== 'uitslag' && zaal.fase !== 'gesloten';

  const setKeuze = (k) => { setKeuzeRuw(k); bewaarKeuze(code, k); };
  const setStap = (s) => { setStapRuw(s); bewaarStap(code, s === 'stappen' ? s : 'kies'); };

  // Wat de tool op deze telefoon al van je weet (als je hem zelf gebruikt)
  useEffect(() => {
    if (!actief || appProfiel !== undefined) return undefined;
    let weg = false;
    profielUitApp({ metaLezen: () => (idbAvailable() ? idbGetAll() : null) })
      .then((p) => { if (!weg) setAppProfiel(p); })
      .catch(() => { if (!weg) setAppProfiel(null); });
    return () => { weg = true; };
  }, [actief, appProfiel]);

  const bekend = onthouden || appProfiel || null;

  // Al ja gezegd (bijvoorbeeld voor het herladen): oordeel met wat er is
  useEffect(() => {
    if (keuze === 'ja' && !profiel && bekend) setProfiel(bekend);
  }, [keuze, profiel, bekend]);

  // Elke nieuwe vraag van het scherm beantwoorden. Zonder vraag: meld je
  // aan (v 0), dan zet het scherm de films klaar.
  useEffect(() => {
    if (!actief || keuze !== 'ja' || !profiel || loopt.current) return;
    const v = zaal.vraag || 0;
    if (v <= beantwoord.current) return;
    loopt.current = true;
    (async () => {
      try {
        if (v > 0) {
          const vr = await haalVraag(code);
          const nu = Math.max(v, vr?.v || 0);
          const r = await stuurSmaak(code, ik.naam, ik.token, nu, oordeelVan(vr?.films || [], profiel));
          beantwoord.current = nu;
          setVerstuurd({ v: nu, n: r?.n || 0 });
        } else {
          await stuurSmaak(code, ik.naam, ik.token, 0, {});
          beantwoord.current = 0;
          setVerstuurd({ v: 0, n: 0 });
        }
      } catch { /* bij de volgende peiling opnieuw */ }
      loopt.current = false;
    })();
  }, [actief, keuze, profiel, zaal, code, ik]);

  const metProfiel = (p) => {
    beantwoord.current = -1;
    setVerstuurd(null);
    setProfiel(p);
    setKeuze('ja');
    setStap('kies');
  };

  const ja = () => { setMelding(''); if (bekend) metProfiel(bekend); else setStap('stappen'); };

  const nee = () => { setMelding(''); setKeuze('nee'); setStap('kies'); };

  // Toch niet: het scherm vergeet je oordeel
  const tochNiet = async () => {
    setMelding('');
    try { await trekSmaakIn(code, ik.naam, ik.token); } catch (e) { setMelding(tr('zaal.tFout', { msg: e.message })); return; }
    beantwoord.current = -1;
    setVerstuurd(null);
    setProfiel(null);
    setKeuze('nee');
  };

  const vergeet = () => { schrijfOpslag(MIJN_LETTERBOXD, null); setOnthouden(null); };

  const leesExport = async (files) => {
    if (!files?.length) return;
    setMelding('');
    let exp;
    try { exp = await parseLetterboxdFiles(Array.from(files)); } catch { setMelding(tr('zaal.lbLeesFout')); return; }
    if (!exp?.watchlist?.length && !exp?.watched?.length && !exp?.ratings?.films?.length) { setMelding(tr('zaal.lbGeenData')); return; }
    const ophalen = ophalenVoorSmaak(exp);
    const meta = {};
    setStapRuw('lezen');
    setVoortgang({ done: 0, total: ophalen.length });
    try {
      await enrichAll(ophalen, effectiveTmdbKey(''), (p) => setVoortgang(p), (key, m) => { if (m) meta[key] = m; });
    } catch { /* wat binnen is, telt */ }
    const p = profielUitExport(exp, meta);
    if (onthoud) { schrijfOpslag(MIJN_LETTERBOXD, { profiel: p }); setOnthouden(p); }
    metProfiel(p);
  };

  return {
    actief, keuze, profiel, bekend, onthouden, stap, setStap, voortgang, onthoud, setOnthoud, melding, verstuurd,
    ja, nee, tochNiet, vergeet, leesExport, opnieuw: () => setKeuze(null),
  };
}

const datumVan = (at) => {
  try { return new Date(at).toLocaleDateString(getLang() === 'en' ? 'en-GB' : 'nl-NL', { day: 'numeric', month: 'long' }); } catch { return ''; }
};

// De kaart. compact: tijdens het stemmen alleen een regel (of de voortgang)
export default function ZaalLetterboxd({ lb, compact = false }) {
  const { t: tr } = useT();
  const bestand = useRef(null);
  if (!lb?.actief) return null;
  const { keuze, profiel, bekend, stap, voortgang, melding, verstuurd } = lb;
  const klaar = keuze === 'ja' && !!profiel;
  const samenvatting = (p) => tr('zaal.lbSamenvatting', { gezien: p.gezien?.length || 0, beoordeeld: p.beoordeeld || 0, lijst: p.lijst?.length || 0 });
  const bron = (p) => (p.bron === 'app' ? tr('zaal.lbBronApp') : tr('zaal.lbBronExport', { datum: datumVan(p.at) }));
  const pct = voortgang.total ? Math.round((voortgang.done / voortgang.total) * 100) : 0;
  const lezen = (
    <>
      <p className="zs-t-status">{tr('zaal.lbLezen', { done: voortgang.done, total: voortgang.total })}</p>
      <div className="progressbar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${pct}%` }} /></div>
    </>
  );

  if (compact) {
    if (stap === 'lezen') return <div className="zs-lb zs-lb-kort">{lezen}</div>;
    return klaar ? <p className="zs-t-status zs-lb-regel">{tr('zaal.lbTeltMee')}</p> : null;
  }

  let inhoud;
  if (stap === 'lezen') {
    inhoud = (
      <>
        <h2 className="zs-lb-kop">{tr('zaal.lbLezenKop')}</h2>
        {lezen}
        <p className="zs-lb-klein">{tr('zaal.lbLezenUitleg')}</p>
      </>
    );
  } else if (klaar) {
    inhoud = (
      <>
        <h2 className="zs-lb-kop">{tr('zaal.lbKlaarKop')}</h2>
        <p className="zs-t-sub">{bron(profiel)} {samenvatting(profiel)}</p>
        <p className="zs-t-status" role="status">{verstuurd?.n ? tr('zaal.lbVerstuurd', { count: verstuurd.n }) : tr('zaal.lbAangemeld')}</p>
        <div className="zs-lb-knoppen">
          <button type="button" className="linkbtn" onClick={lb.tochNiet}>{tr('zaal.lbTochNiet')}</button>
          {lb.onthouden && <button type="button" className="linkbtn" onClick={lb.vergeet}>{tr('zaal.lbVergeet')}</button>}
        </div>
      </>
    );
  } else if (keuze === 'nee') {
    return (
      <div className="zs-lb zs-lb-kort">
        <p className="zs-t-sub">{tr('zaal.lbNee')}</p>
        <button type="button" className="linkbtn" onClick={lb.opnieuw}>{tr('zaal.lbTochWel')}</button>
      </div>
    );
  } else if (stap === 'stappen') {
    inhoud = (
      <>
        <h2 className="zs-lb-kop">{tr('zaal.lbStappenKop')}</h2>
        <ol className="zs-lb-stappen">
          <li>
            <span className="zs-lb-nr" aria-hidden="true">1</span>
            <div className="zs-lb-stap">
              <p>{tr('zaal.lbStap1')}</p>
              <a className="btn" href={LETTERBOXD_EXPORT} target="_blank" rel="noreferrer">{tr('zaal.lbOpen')}</a>
              <p className="zs-lb-klein">{tr('zaal.lbStap1Klein')}</p>
            </div>
          </li>
          <li>
            <span className="zs-lb-nr" aria-hidden="true">2</span>
            <div className="zs-lb-stap"><p>{tr('zaal.lbStap2')}</p></div>
          </li>
          <li>
            <span className="zs-lb-nr" aria-hidden="true">3</span>
            <div className="zs-lb-stap">
              <p>{tr('zaal.lbStap3')}</p>
              <button type="button" className="btn primary" onClick={() => bestand.current?.click()}>{tr('zaal.lbKies')}</button>
              <input ref={bestand} type="file" accept=".zip,.csv,application/zip" hidden aria-label={tr('zaal.lbKies')}
                onChange={(e) => { lb.leesExport(e.target.files); e.target.value = ''; }} />
            </div>
          </li>
        </ol>
        <button type="button" className={`switch-row ${lb.onthoud ? 'on' : ''}`} aria-pressed={lb.onthoud} onClick={() => lb.setOnthoud(!lb.onthoud)}>
          <span className="switch" aria-hidden="true"><span className="knob" /></span>
          {tr('zaal.lbOnthoud')}
        </button>
        <div className="zs-lb-knoppen">
          <button type="button" className="linkbtn" onClick={() => lb.setStap('kies')}>{tr('zaal.lbTerug')}</button>
        </div>
      </>
    );
  } else {
    inhoud = (
      <>
        <h2 className="zs-lb-kop">{tr('zaal.lbVraag')}</h2>
        <p className="zs-t-sub">{tr('zaal.lbUitleg')}</p>
        {bekend ? (
          <>
            <button type="button" className="btn primary big" onClick={lb.ja}>{tr('zaal.lbJa')}</button>
            <p className="zs-lb-klein">{bron(bekend)} {samenvatting(bekend)}</p>
            <div className="zs-lb-knoppen">
              <button type="button" className="linkbtn" onClick={() => lb.setStap('stappen')}>{tr('zaal.lbNieuwe')}</button>
              <button type="button" className="linkbtn" onClick={lb.nee}>{tr('zaal.lbLiever')}</button>
            </div>
          </>
        ) : (
          <>
            <button type="button" className="btn primary big" onClick={lb.ja}>{tr('zaal.lbJaExport')}</button>
            <p className="zs-lb-klein">{tr('zaal.lbDuur')}</p>
            <div className="zs-lb-knoppen">
              <button type="button" className="linkbtn" onClick={lb.nee}>{tr('zaal.lbLiever')}</button>
            </div>
          </>
        )}
        <p className="zs-lb-klein">{tr('zaal.lbPrivacy')}</p>
      </>
    );
  }

  return (
    <section className="zs-lb" aria-label={tr('zaal.lbBoven')}>
      <p className="label-breed zs-lb-boven">{tr('zaal.lbBoven')}</p>
      {inhoud}
      {melding && <p className="zs-melding" role="alert">{melding}</p>}
    </section>
  );
}
