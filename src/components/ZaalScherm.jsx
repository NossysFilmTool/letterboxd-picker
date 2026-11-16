import { useEffect, useRef, useState } from 'react';
import { useT } from '../lib/i18n.js';
import { IMG } from '../lib/tmdb.js';
import { useLS } from '../lib/storage.js';
import { usePoll } from '../lib/usePoll.js';
import { useFilmkleur } from '../lib/filmkleur.js';
import {
  haalZaal, zetZaal, standZaal, doeMee, stuurStem, nieuwToken, doetMee, keuzesIn,
  genreOpties, uitslagGenre, kiesFilms, uitslagFilm, filmVoorZaal,
} from '../lib/zaalstemming.js';
import { zoekAanraders } from '../lib/aanraders.js';
import { genreKop, genreZin, uitslagZin, ZaalFilmInhoud, QrCode, StemKnoppen } from './ZaalDelen.jsx';
import ZaalTrailers from './ZaalTrailers.jsx';

// Het scherm van de zaalstemming (Filmavond): dit toestel heeft de watchlist,
// staat waar iedereen het ziet, zet de rondes en telt de stemmen. De
// telefoons stemmen (ZaalTelefoon.jsx). Wie hier zit, kan zelf meedoen.
//   zaal: { code, geheim } uit maakZaal
//   filters, diensten: de avondfilters, ook voor de aanraders
//   onWinnaar(film, namen, filmdata van een aanrader)
const stilGewenst = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const LIJST = 5;
const AANRADERS = 3;

export default function ZaalScherm({ app, pool, meta, zaal, filters, diensten = [], onWinnaar, onStop, pollMs = 2000, lotMs = 2600 }) {
  const { t: tr } = useT();
  const [staat, setStaat] = useState({ fase: 'lobby', ronde: 0, spelers: [] });
  const [stemmen, setStemmen] = useState({});
  const [fout, setFout] = useState('');
  const [bezig, setBezig] = useState(false);
  const [zoekt, setZoekt] = useState(false);
  const [noot, setNoot] = useState(''); // over de aanraders
  const [hostNaam, setHostNaam] = useLS('samenNaam', '');
  const [aanradersAan, setAanradersAan] = useLS('zaalAanraders', true);
  const [zelfMee, setZelfMee] = useState(false);
  const token = useRef(null);
  if (!token.current) token.current = nieuwToken();
  const aanraderMeta = useRef({});
  const [mijnKeuze, setMijnKeuze] = useState(null); // { ronde, keuze }
  const [trailersOpen, setTrailersOpen] = useState(false);
  const [lot, setLot] = useState(null); // { kandidaten, winnaar, i }
  const [gedeeld, setGedeeld] = useState(false);
  const sluitend = useRef(false);
  const { fase, ronde, spelers = [] } = staat;
  const stemt = fase === 'genre' || fase === 'film';

  // Wie er in de zaal zit (lobby) en wat er gestemd is (in een ronde)
  usePoll(async () => {
    try {
      if (fase === 'lobby') {
        const z = await haalZaal(zaal.code);
        setStaat((s) => (s.fase === 'lobby' ? { ...s, spelers: z.spelers || [] } : s));
      } else {
        const r = await standZaal(zaal.code, zaal.geheim);
        setStemmen(r.stemmen || {});
        setStaat((s) => ({ ...s, spelers: r.zaal?.spelers || s.spelers }));
      }
    } catch { /* de volgende keer */ }
  }, fase === 'lobby' ? Math.max(pollMs, 2500) : pollMs, fase === 'lobby' || stemt);

  // Een ronde zetten: alles wat de telefoons in die ronde nodig hebben
  const zet = async (nieuw) => {
    setBezig(true);
    setFout('');
    try {
      const r = await zetZaal(zaal.code, zaal.geheim, nieuw);
      setStaat({ ...nieuw, spelers: r?.zaal?.spelers || spelers });
      setStemmen({});
      setMijnKeuze(null);
      return true;
    } catch (e) {
      setFout(tr('zaal.zetFout', { msg: e.message }));
      return false;
    } finally {
      setBezig(false);
    }
  };

  // Wat de zaal al kent: geen aanrader die op de lijst staat, gezien of beoordeeld is
  const bekend = () => ({
    ids: new Set(Object.values(meta).map((m) => m?.id).filter(Boolean)),
    keys: new Set([
      ...(app.watchlist || []).map((f) => f.key), ...(app.seenSet || []),
      ...Object.keys(app.ratings || {}), ...(app.ratedFilms || []).map((f) => f.key),
    ]),
  });

  // Vijf films van de lijst, en zo gewenst drie aanraders van buiten
  const naarFilms = async (genre, r) => {
    setZoekt(true);
    setNoot('');
    try {
      const lijst = kiesFilms(pool, meta, genre, app.history || [], LIJST).map((f) => filmVoorZaal(f, meta[f.key]));
      let extra = [];
      if (aanradersAan) {
        try {
          const gevonden = await zoekAanraders({
            sleutel: app.tmdbKey, meta, genre, filters, diensten, uit: bekend(), smaak: app.taste, aantal: AANRADERS,
          });
          gevonden.forEach((a) => { aanraderMeta.current[a.film.key] = a.m; });
          extra = gevonden.map((a) => filmVoorZaal(a.film, a.m, a)).filter((a) => !lijst.some((f) => f.key === a.key));
          if (!extra.length) setNoot(tr('zaal.aanradersGeen'));
        } catch {
          setNoot(tr('zaal.aanradersFout'));
        }
      }
      return await zet({ fase: 'trailers', ronde: r, genre, films: [...lijst, ...extra] });
    } finally {
      setZoekt(false);
    }
  };

  const naamHier = hostNaam.trim();
  const hierInDeZaal = zelfMee && doetMee(spelers, naamHier);
  const aantal = spelers.length + (zelfMee && naamHier && !doetMee(spelers, naamHier) ? 1 : 0);

  const naarGenres = (r) => {
    const opties = genreOpties(pool, meta);
    return opties.length >= 2 ? zet({ fase: 'genre', ronde: r, opties }) : naarFilms({ namen: [], wijze: 'alles' }, r);
  };

  const begin = async () => {
    if (zelfMee) {
      if (!naamHier) { setFout(tr('zaal.naamEerst')); return; }
      if (!doetMee(spelers, naamHier)) {
        try {
          const r = await doeMee(zaal.code, naamHier, token.current);
          setStaat((s) => ({ ...s, spelers: r?.zaal?.spelers || s.spelers }));
        } catch (e) {
          setFout(e.message === 'NAAM_BEZET' ? tr('zaal.tNaamBezet') : tr('zaal.zetFout', { msg: e.message }));
          return;
        }
      }
    }
    await naarGenres(1);
  };

  const keuzes = stemt ? keuzesIn(stemmen, spelers, ronde) : {};
  const gestemd = Object.keys(keuzes).length;
  const iedereen = stemt && spelers.length > 0 && gestemd >= spelers.length;

  const sluitGenre = async () => {
    if (sluitend.current) return;
    sluitend.current = true;
    try {
      const res = uitslagGenre({ opties: staat.opties || [], stemmen: Object.values(keuzes), pool, meta, nodig: LIJST });
      await naarFilms({ namen: res.namen, wijze: res.wijze, punten: res.punten }, ronde);
    } finally { sluitend.current = false; }
  };

  const startStemmen = () => zet({ fase: 'film', ronde: ronde + 1, genre: staat.genre, films: staat.films });

  const sluitFilm = async () => {
    if (sluitend.current) return;
    sluitend.current = true;
    const res = uitslagFilm(staat.films, Object.values(keuzes));
    const schrijf = async () => {
      try {
        await zet({
          fase: 'uitslag', ronde, genre: staat.genre, films: staat.films,
          uitslag: { key: res.key, wijze: res.wijze, punten: res.punten, lijstjes: res.lijstjes, eersten: res.eersten, kandidaten: res.kandidaten },
        });
      } finally { setLot(null); sluitend.current = false; }
    };
    // Het lot: het licht springt tussen de gelijke films en blijft staan
    if (res.wijze === 'lot' && lotMs > 0 && !stilGewenst()) setLot({ kandidaten: res.kandidaten, winnaar: res.key, i: 0, schrijf });
    else await schrijf();
  };

  useEffect(() => {
    if (!lot) return undefined;
    const t0 = Date.now();
    let t;
    const stap = () => {
      const verstreken = Date.now() - t0;
      if (verstreken >= lotMs) {
        setLot((l) => (l ? { ...l, i: l.kandidaten.indexOf(l.winnaar) } : l));
        t = setTimeout(() => lot.schrijf(), 700);
        return;
      }
      setLot((l) => (l ? { ...l, i: (l.i + 1) % l.kandidaten.length } : l));
      t = setTimeout(stap, 90 + (verstreken / lotMs) * 260);
    };
    t = setTimeout(stap, 90);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lot?.winnaar]);

  // Heeft iedereen gestemd, dan sluit de ronde vanzelf, na even wachten:
  // wie nog een 2e keus wil zetten of wisselen, kan dat nog
  useEffect(() => {
    if (!iedereen || bezig || zoekt || lot) return undefined;
    const t = setTimeout(() => (fase === 'genre' ? sluitGenre() : sluitFilm()), 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iedereen, fase, ronde, JSON.stringify(keuzes), bezig, zoekt, !!lot]);

  // Zelf meedoen: stemmen vanaf dit scherm, net als op een telefoon
  const naamInZaal = spelers.find((n) => n.toLocaleLowerCase() === naamHier.toLocaleLowerCase()) || naamHier;
  const hierGekozen = mijnKeuze && mijnKeuze.ronde === ronde ? mijnKeuze.keuze : (keuzes[naamInZaal] || []);
  const stemHier = async (keuze) => {
    setMijnKeuze({ ronde, keuze });
    try {
      await stuurStem(zaal.code, naamInZaal, token.current, ronde, keuze);
      setStemmen((s) => {
        const mijn = { ...(s[naamInZaal] || {}) };
        if (keuze.length) mijn[String(ronde)] = keuze; else delete mijn[String(ronde)];
        return { ...s, [naamInZaal]: mijn };
      });
    } catch (e) {
      setFout(tr('zaal.stemFout', { msg: e.message }));
    }
  };

  const link = `${location.origin}${location.pathname}?zaal=${zaal.code}`;
  const adres = `${location.host}${location.pathname.replace(/\/$/, '')}`;
  const deel = async () => {
    try {
      if (navigator.share) await navigator.share({ title: tr('zaal.titel'), url: link });
      else { await navigator.clipboard?.writeText(link); setGedeeld(true); setTimeout(() => setGedeeld(false), 2000); }
    } catch { /* gedeeld of afgebroken */ }
  };

  const wie = stemt && (
    <div className="zs-wie" aria-live="polite">
      <ul className="zs-wie-namen">
        {spelers.map((n) => <li key={n} className={keuzes[n] != null ? 'klaar' : undefined}>{n}</li>)}
      </ul>
      <p className="zs-wie-stand">
        {iedereen ? tr('zaal.iedereen') : tr('zaal.gestemd', { n: gestemd, totaal: spelers.length })}
      </p>
      <button type="button" className="btn" onClick={fase === 'genre' ? sluitGenre : sluitFilm} disabled={!gestemd || bezig || zoekt || !!lot}>{tr('zaal.sluitRonde')}</button>
    </div>
  );

  const voet = (
    <div className="zs-voet">
      {fout && <p className="zs-melding" role="alert">{fout}</p>}
      <button type="button" className="linkbtn zs-sluit" onClick={onStop}>{tr('zaal.stop')}</button>
    </div>
  );

  // ---------- de lobby ----------
  if (fase === 'lobby') {
    return (
      <section className="zs zs-lobby" aria-label={tr('zaal.titel')}>
        <div className="zs-lobby-code">
          <p className="label-breed zs-boven">{tr('zaal.titel')}</p>
          <h1 className="zs-kop">{tr('zaal.pakTelefoon')}</h1>
          <p className="zs-code" aria-label={tr('zaal.codeAria', { code: zaal.code.split('').join(' ') })}>{zaal.code}</p>
          <p className="zs-adres">{tr('zaal.gaNaar', { adres })}</p>
          <div className="zs-scan">
            <QrCode tekst={link} label={tr('zaal.qrAria', { code: zaal.code })} />
            <div className="zs-scan-tekst">
              <p>{tr('zaal.scan')}</p>
              <button type="button" className="linkbtn zs-deel" onClick={deel}>{gedeeld ? tr('zaal.gekopieerd') : tr('zaal.deelLink')}</button>
            </div>
          </div>
        </div>
        <div className="zs-lobby-zaal">
          <h2 className="zs-rubriek">{tr('zaal.inDeZaal')} <sup>{aantal}</sup></h2>
          {spelers.length || (zelfMee && naamHier) ? (
            <ul className="zs-namen">
              {spelers.map((n) => <li key={n}>{n}</li>)}
              {zelfMee && naamHier && !doetMee(spelers, naamHier) && <li className="hier">{naamHier}</li>}
            </ul>
          ) : <p className="zs-leeg">{tr('zaal.nogNiemand')}</p>}
          <div className="zs-zelf">
            <button type="button" className={`switch-row ${zelfMee ? 'on' : ''}`} aria-pressed={zelfMee} onClick={() => setZelfMee(!zelfMee)}>
              <span className="switch" aria-hidden="true"><span className="knob" /></span>
              {tr('zaal.zelfMee')}
            </button>
            {zelfMee && (
              <input className="field" value={hostNaam} onChange={(e) => setHostNaam(e.target.value)} maxLength={20}
                placeholder={tr('zaal.tNaamPlaceholder')} aria-label={tr('zaal.jouwNaam')} />
            )}
          </div>
          <div className="zs-zelf">
            <button type="button" className={`switch-row ${aanradersAan ? 'on' : ''}`} aria-pressed={aanradersAan} onClick={() => setAanradersAan(!aanradersAan)}>
              <span className="switch" aria-hidden="true"><span className="knob" /></span>
              {tr('zaal.aanradersAan', { count: AANRADERS })}
            </button>
          </div>
          <button type="button" className="btn primary big zs-begin" onClick={begin} disabled={bezig || zoekt || aantal < 1}>
            {aantal ? tr('zaal.begin', { count: aantal }) : tr('zaal.wachtOpSpelers')}
          </button>
        </div>
        {voet}
      </section>
    );
  }

  // ---------- de genreronde ----------
  if (fase === 'genre') {
    const opties = staat.opties || [];
    return (
      <section className="zs zs-ronde" aria-label={tr('zaal.rondeGenre')}>
        <p className="label-breed zs-boven">{tr('zaal.rondeGenre')}</p>
        <h1 className="zs-kop">{tr('zaal.kiesGenre')}</h1>
        <p className="zs-sub">{zoekt ? tr('zaal.kiezen') : tr('zaal.stemUitleg')}</p>
        <ul className="zs-opties">
          {opties.map((o) => (
            <li key={o.id} className="zs-optie">
              <span className="zs-optie-naam">{o.naam}</span>
              <span className="zs-optie-n">{tr('zaal.nFilms', { count: o.n })}</span>
              {hierInDeZaal && <StemKnoppen id={o.id} naam={o.naam} stem={hierGekozen} onStem={stemHier} />}
            </li>
          ))}
        </ul>
        {wie}
        {voet}
      </section>
    );
  }

  // ---------- de uitslag ----------
  if (fase === 'uitslag' && staat.uitslag) {
    const film = staat.films.find((f) => f.key === staat.uitslag.key) || staat.films[0];
    const pak = () => onWinnaar(
      pool.find((f) => f.key === film.key) || { key: film.key, name: film.name, year: film.year },
      spelers,
      film.aanrader ? aanraderMeta.current[film.key] : null,
    );
    return (
      <ZaalUitslag staat={staat} film={film} meta={{ ...meta, ...aanraderMeta.current }}
        onPak={pak} onNogEens={() => naarGenres(ronde + 1)} voet={voet} bezig={bezig || zoekt} />
    );
  }

  // ---------- de films: trailers, dan stemmen ----------
  const films = staat.films || [];
  const filmRonde = fase === 'film';
  const metTrailer = films.filter((f) => f.trailer).length;
  const vanLijst = films.filter((f) => !f.aanrader);
  const aanraders = films.filter((f) => f.aanrader);
  const badge = (f) => {
    if (lot || !filmRonde) return null;
    if (hierGekozen?.[0] === f.key) return tr('zaal.favoriet');
    if (hierGekozen?.[1] === f.key) return tr('zaal.tweede');
    return null;
  };
  const rij = (lijst, start) => (
    <ol className={`zs-films${lot ? ' lot' : ''}`} style={{ '--n': Math.max(lijst.length, 1) }}>
      {lijst.map((f, i) => {
        const licht = lot && lot.kandidaten[lot.i] === f.key;
        const uit = lot && !lot.kandidaten.includes(f.key);
        return (
          <li key={f.key} style={{ '--i': start + i }}>
            <div className={`zs-film${licht ? ' licht' : ''}${uit ? ' uit' : ''}`}><ZaalFilmInhoud film={f} badge={badge(f)} /></div>
            {filmRonde && hierInDeZaal && !lot && <StemKnoppen id={f.key} naam={f.name} stem={hierGekozen} onStem={stemHier} />}
          </li>
        );
      })}
    </ol>
  );
  return (
    <section className="zs zs-ronde zs-breed" aria-label={filmRonde ? tr('zaal.rondeFilm') : genreKop(staat.genre, tr)}>
      {filmRonde ? (
        <>
          <p className="label-breed zs-boven">{tr('zaal.rondeFilm')}</p>
          <h1 className="zs-kop">{lot ? tr('zaal.lot') : tr('zaal.kiesFilm')}</h1>
          <p className="zs-sub">{tr('zaal.stemUitleg')}</p>
        </>
      ) : (
        <>
          <p className="label-breed zs-boven">{tr('zaal.uitslagGenre')}</p>
          <h1 className="zs-kop zs-wordt">{genreKop(staat.genre, tr)}</h1>
          <p className="zs-sub">
            {genreZin(staat.genre, tr)} {tr('zaal.gekozenLijst', { count: vanLijst.length })}
            {aanraders.length > 0 && <> {tr('zaal.plusAanraders', { count: aanraders.length })}</>}
            {noot && <> {noot}</>}
          </p>
        </>
      )}
      <div className={`zs-filmgroepen${aanraders.length ? ' met-aanraders' : ''}`} style={{ '--kolommen': `minmax(0, ${vanLijst.length || 1}fr) minmax(0, ${aanraders.length || 1}fr)` }}>
        <div className="zs-filmgroep">
          {aanraders.length > 0 && <p className="label-breed zs-groep">{tr('zaal.vanLijst')}</p>}
          {rij(vanLijst, 0)}
        </div>
        {aanraders.length > 0 && (
          <div className="zs-filmgroep">
            <p className="label-breed zs-groep">{tr('zaal.aanradersKop')}</p>
            {rij(aanraders, vanLijst.length)}
          </div>
        )}
      </div>
      {filmRonde ? wie : (
        <div className="zs-acties">
          {metTrailer > 0 && <button type="button" className="btn primary big" onClick={() => setTrailersOpen(true)}>{tr('zaal.trailers', { count: metTrailer })}</button>}
          <button type="button" className={`btn big ${metTrailer ? '' : 'primary'}`} onClick={startStemmen} disabled={bezig}>{tr('zaal.stemmenMaar')}</button>
          {!metTrailer && <p className="zs-leeg">{tr('zaal.geenTrailers')}</p>}
        </div>
      )}
      {trailersOpen && (
        <ZaalTrailers films={films} onSluit={() => setTrailersOpen(false)}
          onKlaar={() => { setTrailersOpen(false); startStemmen(); }} />
      )}
      {voet}
    </section>
  );
}

// De uitslag: de winnaar groot, in de kleur van de film, met waarom en de punten
function ZaalUitslag({ staat, film, meta, onPak, onNogEens, voet, bezig }) {
  const { t: tr } = useT();
  const kleur = useFilmkleur(film.poster);
  const beeld = meta[film.key]?.backdrop;
  const { uitslag } = staat;
  const volgorde = [...staat.films].sort((a, b) => (uitslag.punten?.[b.key] || 0) - (uitslag.punten?.[a.key] || 0));
  return (
    <section className="zs zs-uitslag" aria-label={tr('zaal.hetWordt')} style={{ '--film': kleur }}>
      <div className="zs-uitslag-vlak">
        {beeld && <img className="zs-uitslag-beeld" src={IMG(beeld, 'w1280')} alt="" />}
        <div className="zs-uitslag-tekst">
          <p className="label-breed zs-boven">{tr('zaal.hetWordt')}</p>
          <h1 className="zs-uitslag-titel">{film.name}</h1>
          <p className="zs-uitslag-waarom">{uitslagZin(uitslag, tr)}</p>
          <ol className="zs-telling">
            {volgorde.map((f) => (
              <li key={f.key} className={f.key === film.key ? 'wint' : undefined}>
                <span>{f.name}</span>
                <span className="n">{tr('zaal.puntenKort', { count: uitslag.punten?.[f.key] || 0 })}</span>
              </li>
            ))}
          </ol>
          <div className="zs-acties">
            <button type="button" className="btn primary big" onClick={onPak}>{tr('zaal.pakKaartje')}</button>
            <button type="button" className="linkbtn" onClick={onNogEens} disabled={bezig}>{tr('zaal.nogEens')}</button>
          </div>
        </div>
      </div>
      {voet}
    </section>
  );
}
