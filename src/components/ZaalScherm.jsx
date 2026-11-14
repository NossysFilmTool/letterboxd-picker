import { useEffect, useRef, useState } from 'react';
import { useT } from '../lib/i18n.js';
import { IMG } from '../lib/tmdb.js';
import { useLS } from '../lib/storage.js';
import { usePoll } from '../lib/usePoll.js';
import { useFilmkleur } from '../lib/filmkleur.js';
import {
  haalZaal, zetZaal, standZaal, doeMee, stuurStem, nieuwToken, doetMee, keuzesIn,
  genreOpties, uitslagGenre, kiesDrie, uitslagFilm, filmVoorZaal, tikFilm,
} from '../lib/zaalstemming.js';
import { lijstje, genreKop, genreZin, uitslagZin, ZaalFilmInhoud, QrCode } from './ZaalDelen.jsx';
import ZaalTrailers from './ZaalTrailers.jsx';

// Het scherm van de zaalstemming (Filmavond): dit toestel heeft de watchlist,
// staat waar iedereen het ziet, zet de rondes en telt de stemmen. De
// telefoons stemmen (ZaalTelefoon.jsx). Wie hier zit, kan zelf meedoen.
//   zaal: { code, geheim } uit maakZaal; onWinnaar(film, namen)
const stilGewenst = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function ZaalScherm({ app, pool, meta, zaal, onWinnaar, onStop, pollMs = 2000, lotMs = 2600 }) {
  const { t: tr } = useT();
  const [staat, setStaat] = useState({ fase: 'lobby', ronde: 0, spelers: [] });
  const [stemmen, setStemmen] = useState({});
  const [fout, setFout] = useState('');
  const [bezig, setBezig] = useState(false);
  const [hostNaam, setHostNaam] = useLS('samenNaam', '');
  const [zelfMee, setZelfMee] = useState(false);
  const token = useRef(null);
  if (!token.current) token.current = nieuwToken();
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

  const naarFilms = (genre, r, beslissend = false) => {
    const films = kiesDrie(pool, meta, genre, app.history || []).map((f) => filmVoorZaal(f, meta[f.key]));
    return zet({ fase: 'trailers', ronde: r, genre, films, ...(beslissend ? { beslissend: true } : {}) });
  };

  const naamHier = hostNaam.trim();
  const hierInDeZaal = zelfMee && doetMee(spelers, naamHier);
  const aantal = spelers.length + (zelfMee && naamHier && !doetMee(spelers, naamHier) ? 1 : 0);

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
    const opties = genreOpties(pool, meta);
    if (opties.length >= 2) await zet({ fase: 'genre', ronde: 1, opties });
    else await naarFilms({ namen: [], wijze: 'alles' }, 1);
  };

  const keuzes = stemt ? keuzesIn(stemmen, spelers, ronde) : {};
  const gestemd = Object.keys(keuzes).length;
  const iedereen = stemt && spelers.length > 0 && gestemd >= spelers.length;

  const sluitGenre = async () => {
    if (sluitend.current) return;
    sluitend.current = true;
    try {
      const res = uitslagGenre({ opties: staat.opties || [], keuzes: Object.values(keuzes), pool, meta, beslissend: !!staat.beslissend });
      if (res.opnieuw) await zet({ fase: 'genre', ronde: ronde + 1, opties: staat.opties.filter((o) => res.opnieuw.includes(o.id)), beslissend: true });
      else await naarFilms(res.klaar, ronde, !!staat.beslissend);
    } finally { sluitend.current = false; }
  };

  const startStemmen = () => zet({ fase: 'film', ronde: ronde + 1, genre: staat.genre, films: staat.films });

  const sluitFilm = async () => {
    if (sluitend.current) return;
    sluitend.current = true;
    const res = uitslagFilm(staat.films, Object.values(keuzes));
    const schrijf = async () => {
      try {
        await zet({ fase: 'uitslag', ronde, genre: staat.genre, films: staat.films, uitslag: { key: res.key, wijze: res.wijze, telling: res.telling, tweede: res.tweede, kandidaten: res.kandidaten } });
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

  // Heeft iedereen gestemd, dan sluit de ronde vanzelf. Bij de films wat
  // later: na je favoriet kies je nog een tweede keus.
  useEffect(() => {
    if (!iedereen || bezig || lot) return undefined;
    const t = setTimeout(() => (fase === 'genre' ? sluitGenre() : sluitFilm()), fase === 'genre' ? 1500 : 3500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iedereen, fase, ronde, gestemd, bezig, !!lot]);

  // Zelf meedoen: stemmen vanaf dit scherm, net als op een telefoon
  const naamInZaal = spelers.find((n) => n.toLocaleLowerCase() === naamHier.toLocaleLowerCase()) || naamHier;
  const hierGekozen = mijnKeuze && mijnKeuze.ronde === ronde ? mijnKeuze.keuze : null;
  const stemHier = async (keuze) => {
    setMijnKeuze({ ronde, keuze });
    try {
      await stuurStem(zaal.code, naamInZaal, token.current, ronde, keuze);
      setStemmen((s) => ({ ...s, [naamInZaal]: { ...(s[naamInZaal] || {}), [String(ronde)]: keuze } }));
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
      <button type="button" className="btn" onClick={fase === 'genre' ? sluitGenre : sluitFilm} disabled={!gestemd || bezig || !!lot}>{tr('zaal.sluitRonde')}</button>
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
          <button type="button" className="btn primary big zs-begin" onClick={begin} disabled={bezig || aantal < 1}>
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
      <section className="zs zs-ronde" aria-label={staat.beslissend ? tr('zaal.rondeBeslissend') : tr('zaal.rondeGenre')}>
        <p className="label-breed zs-boven">{staat.beslissend ? tr('zaal.rondeBeslissend') : tr('zaal.rondeGenre')}</p>
        <h1 className="zs-kop">{staat.beslissend ? tr('zaal.gelijkTussen', { lijst: lijstje(opties.map((o) => o.naam), tr) }) : tr('zaal.kiesGenre')}</h1>
        <p className="zs-sub">{staat.beslissend ? tr('zaal.beslissendUitleg') : tr('zaal.stemOpTelefoon')}</p>
        <ul className="zs-opties">
          {opties.map((o) => {
            const inhoud = <><span className="zs-optie-naam">{o.naam}</span><span className="zs-optie-n">{tr('zaal.nFilms', { count: o.n })}</span></>;
            return (
              <li key={o.id}>
                {hierInDeZaal
                  ? <button type="button" className="zs-optie" aria-pressed={hierGekozen === o.id} onClick={() => stemHier(o.id)}>{inhoud}</button>
                  : <span className="zs-optie">{inhoud}</span>}
              </li>
            );
          })}
        </ul>
        {wie}
        {voet}
      </section>
    );
  }

  // ---------- de uitslag ----------
  if (fase === 'uitslag' && staat.uitslag) {
    const film = staat.films.find((f) => f.key === staat.uitslag.key) || staat.films[0];
    const pak = () => onWinnaar(pool.find((f) => f.key === film.key) || { key: film.key, name: film.name, year: film.year }, spelers);
    const nogEens = () => {
      const opties = genreOpties(pool, meta);
      return opties.length >= 2 ? zet({ fase: 'genre', ronde: ronde + 1, opties }) : naarFilms({ namen: [], wijze: 'alles' }, ronde + 1);
    };
    return <ZaalUitslag staat={staat} film={film} meta={meta} onPak={pak} onNogEens={nogEens} voet={voet} bezig={bezig} />;
  }

  // ---------- de drie films: trailers, dan stemmen ----------
  const films = staat.films || [];
  const filmRonde = fase === 'film';
  const metTrailer = films.filter((f) => f.trailer).length;
  const badge = (f) => {
    if (lot) return null;
    if (hierGekozen?.[0] === f.key) return tr('zaal.favoriet');
    if (hierGekozen?.[1] === f.key) return tr('zaal.tweede');
    return null;
  };
  return (
    <section className="zs zs-ronde" aria-label={filmRonde ? tr('zaal.rondeFilm') : genreKop(staat.genre, tr)}>
      {filmRonde ? (
        <>
          <p className="label-breed zs-boven">{tr('zaal.rondeFilm')}</p>
          <h1 className="zs-kop">{lot ? tr('zaal.lot') : tr('zaal.kiesFilm')}</h1>
          <p className="zs-sub">{tr('zaal.filmUitleg')}</p>
        </>
      ) : (
        <>
          <p className="label-breed zs-boven">{tr('zaal.uitslagGenre')}</p>
          <h1 className="zs-kop zs-wordt">{genreKop(staat.genre, tr)}</h1>
          <p className="zs-sub">{genreZin(staat.genre, tr, !!staat.beslissend)} {tr('zaal.drieFilms')}</p>
        </>
      )}
      <ol className={`zs-films${lot ? ' lot' : ''}`}>
        {films.map((f, i) => {
          const licht = lot && lot.kandidaten[lot.i] === f.key;
          const uit = lot && !lot.kandidaten.includes(f.key);
          const cls = `zs-film${licht ? ' licht' : ''}${uit ? ' uit' : ''}`;
          return (
            <li key={f.key} style={{ '--i': i }}>
              {filmRonde && hierInDeZaal && !lot
                ? <button type="button" className={cls} aria-pressed={!!badge(f)} onClick={() => stemHier(tikFilm(hierGekozen, f.key))}><ZaalFilmInhoud film={f} badge={badge(f)} /></button>
                : <div className={cls}><ZaalFilmInhoud film={f} /></div>}
            </li>
          );
        })}
      </ol>
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

// De uitslag: de winnaar groot, in de kleur van de film, met waarom
function ZaalUitslag({ staat, film, meta, onPak, onNogEens, voet, bezig }) {
  const { t: tr } = useT();
  const kleur = useFilmkleur(film.poster);
  const m = meta[film.key];
  const beeld = m?.backdrop;
  const { uitslag } = staat;
  return (
    <section className="zs zs-uitslag" aria-label={tr('zaal.hetWordt')} style={{ '--film': kleur }}>
      <div className="zs-uitslag-vlak">
        {beeld && <img className="zs-uitslag-beeld" src={IMG(beeld, 'w1280')} alt="" />}
        <div className="zs-uitslag-tekst">
          <p className="label-breed zs-boven">{tr('zaal.hetWordt')}</p>
          <h1 className="zs-uitslag-titel">{film.name}</h1>
          <p className="zs-uitslag-waarom">{uitslagZin(uitslag, tr)}</p>
          <ol className="zs-telling">
            {staat.films.map((f) => (
              <li key={f.key} className={f.key === film.key ? 'wint' : undefined}>
                <span>{f.name}</span>
                <span className="n">{tr('zaal.stemmenKort', { count: uitslag.telling?.[f.key] || 0 })}</span>
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
