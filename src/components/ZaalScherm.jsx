import { useEffect, useRef, useState } from 'react';
import { useT } from '../lib/i18n.js';
import { IMG, getRegion, fetchDetailById } from '../lib/tmdb.js';
import { useLS, leesOpslag, filmKey } from '../lib/storage.js';
import { usePoll } from '../lib/usePoll.js';
import { useFilmkleur } from '../lib/filmkleur.js';
import {
  haalZaal, zetZaal, standZaal, zetVraag, doeMee, stuurStem, stemRij, nieuwToken, doetMee, keuzesIn,
  genreOpties, genreBasis, uitslagGenre, kiesFilms, uitslagFilm, filmVoorZaal, voordrachtenPerFilm, kiesVoordrachten,
} from '../lib/zaalstemming.js';
import { zoekAanraders, onthoudGetoond, dienstIdsVoor } from '../lib/aanraders.js';
import { vraagTweedeMening } from '../lib/omdb.js';
import { vraagUitPot, zaalOordeel, zaalSturing, MAX_VRAAG } from '../lib/zaalgasten.js';
import { genreKop, genreZin, uitslagZin, lijstje, ZaalFilmInhoud, QrCode, StemKnoppen } from './ZaalDelen.jsx';
import { Chip } from './AvondFilters.jsx';
import ZaalTrailers from './ZaalTrailers.jsx';

// Het scherm van de zaalstemming (Filmavond): dit toestel heeft de watchlist,
// staat waar iedereen het ziet, zet de rondes en telt de stemmen. De
// telefoons stemmen (ZaalTelefoon.jsx). Wie hier zit, kan zelf meedoen.
// Gasten kunnen hun eigen Letterboxd laten meetellen (lib/zaalgasten.js) en,
// als de gastheer dat wil, zelf een film voordragen. Tijdens de trailers
// zien de telefoons welke trailer er draait.
//   zaal: { code, geheim } uit maakZaal
//   filters, diensten: de avondfilters, ook voor de aanraders
//   onWinnaar(film, namen, filmdata van een aanrader)
//   wachtMs: zo lang wacht het scherm hooguit op de telefoons met Letterboxd
const stilGewenst = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
// Zo speelt de zaal: de keuzes van de gastheer, onthouden op dit toestel.
//   genreRonde: eerst samen een genre kiezen; lijst: films van de lijst (3
//   tot 5); aanraders: films van buiten de lijst (0 tot 3); gasten: gasten
//   mogen hun Letterboxd laten meetellen, met gezienWeg (wat iemand al zag
//   valt af) en smaakMee (hun smaak weegt mee); voordragen: hoeveel films
//   gasten zelf op tafel kunnen zetten (0 tot 3); vanzelf: een ronde sluit
//   vanzelf als iedereen gestemd heeft
const SPEL = { genreRonde: true, lijst: 5, aanraders: 3, gasten: true, gezienWeg: true, smaakMee: true, voordragen: 0, vanzelf: true };
// Wie de aanraders eerder uitzette (de oude schakelaar), houdt ze uit
const spelVan = (bewaard) => ({ ...SPEL, aanraders: leesOpslag('zaalAanraders', true) === false ? 0 : SPEL.aanraders, ...(bewaard || {}) });
// Heeft iedereen gestemd, dan sluit de ronde vanzelf na SLUIT_MS; heeft
// iemand nog alleen een 1e keus, dan na TWEEDE_MS (tijd voor een 2e keus)
const SLUIT_MS = 4000;
const TWEEDE_MS = 15000;

export default function ZaalScherm({ app, pool, meta, zaal, filters, diensten = [], onWinnaar, onStop, pollMs = 2000, lotMs = 2600, wachtMs = 8000 }) {
  const { t: tr } = useT();
  const [staat, setStaat] = useState({ fase: 'lobby', ronde: 0, spelers: [] });
  const [stemmen, setStemmen] = useState({});
  const [fout, setFout] = useState('');
  const [bezig, setBezig] = useState(false);
  const [zoekt, setZoekt] = useState(false);
  const [noot, setNoot] = useState(''); // over de aanraders
  const [hostNaam, setHostNaam] = useLS('samenNaam', '');
  const [spelBewaard, setSpelBewaard] = useLS('zaalOpties', null);
  const spel = spelVan(spelBewaard);
  const zetSpel = (k, v) => setSpelBewaard((oud) => ({ ...spelVan(oud), [k]: v }));
  const [gasten, setGasten] = useState({}); // { naam: { v, n } }: wie de eigen Letterboxd meetelt
  const [lbKan, setLbKan] = useState(true); // false: de Worker kent het meetellen nog niet
  const [voordrachten, setVoordrachten] = useState({}); // { naam: film }: wat gasten voordragen
  const [vdKan, setVdKan] = useState(true); // false: de Worker kent het voordragen nog niet
  const [wachtOp, setWachtOp] = useState([]); // gasten met Letterboxd die nog moeten antwoorden
  const lobbyZet = useRef(null);
  const lobbyRij = useRef(null);
  if (!lobbyRij.current) lobbyRij.current = stemRij(zetZaal);
  const lbGezet = useRef(false);
  const gevraagd = useRef(new Set()); // films die de gasten al kregen
  const vraagV = useRef(0);
  const vraagRij = useRef(Promise.resolve());
  const [getoond, setGetoond] = useLS('zaalGetoond', {}); // aanraders die de zaal al zag
  const [zelfMee, setZelfMee] = useState(false);
  const token = useRef(null);
  if (!token.current) token.current = nieuwToken();
  const stuurHier = useRef(null);
  if (!stuurHier.current) stuurHier.current = stemRij(stuurStem);
  const aanraderMeta = useRef({}); // filmdata van films van buiten de lijst (aanraders, voordrachten)
  const trailerRij = useRef(Promise.resolve());
  const nuGewenst = useRef(null);
  const nuGezet = useRef(null);
  const naarStemmen = useRef(false);
  const [mijnKeuze, setMijnKeuze] = useState(null); // { ronde, keuze }
  const [trailersOpen, setTrailersOpen] = useState(false);
  const [lot, setLot] = useState(null); // { kandidaten, winnaar, i }
  const [gedeeld, setGedeeld] = useState(false);
  const sluitend = useRef(false);
  const { fase, ronde, spelers = [] } = staat;
  const stemt = fase === 'genre' || fase === 'film';

  // Wie er in de zaal zit (lobby), wie de eigen Letterboxd meetelt, wat er
  // voorgedragen is (tot de films op tafel komen), en wat er gestemd is
  usePoll(async () => {
    try {
      if (fase === 'lobby' && !spel.gasten && !spel.voordragen) {
        const z = await haalZaal(zaal.code);
        setStaat((s) => (s.fase === 'lobby' ? { ...s, spelers: z.spelers || [] } : s));
      } else {
        const metVd = spel.voordragen > 0 && (fase === 'lobby' || fase === 'genre');
        const r = await standZaal(zaal.code, zaal.geheim, metVd ? { voordrachten: true } : {});
        setGasten(r.gasten || {});
        if (metVd) setVoordrachten(r.voordrachten || {});
        if (fase === 'lobby') setStaat((s) => (s.fase === 'lobby' ? { ...s, spelers: r.zaal?.spelers || s.spelers } : s));
        else {
          setStemmen(r.stemmen || {});
          setStaat((s) => ({ ...s, spelers: r.zaal?.spelers || s.spelers }));
        }
      }
    } catch { /* de volgende keer */ }
  }, fase === 'lobby' ? Math.max(pollMs, 2500) : pollMs, fase === 'lobby' || stemt);

  // Mogen gasten hun Letterboxd laten meetellen, en zelf een film
  // voordragen? Dat hoort de zaal meteen, zodat de telefoons het kunnen
  // vragen. Kent de Worker het nog niet, dan zegt het scherm dat bij de keuze.
  // Eén tegelijk, en alleen de nieuwste wacht (stemRij): tik je snel twee
  // keuzes aan, dan kan de eerste anders als laatste aankomen en de zaal
  // terugzetten naar wat je net uitzette.
  const inLobby = fase === 'lobby';
  useEffect(() => {
    if (!inLobby || (!spel.gasten && !spel.voordragen && !lbGezet.current)) return undefined;
    let weg = false;
    lbGezet.current = true;
    const aan = !!spel.gasten;
    const vd = spel.voordragen || 0;
    lobbyZet.current = lobbyRij.current(zaal.code, zaal.geheim, { fase: 'lobby', ronde: 0, lb: aan, vd })
      .then((r) => {
        if (weg || r?.ingehaald) return;
        setLbKan(!aan || r?.zaal?.lb === true);
        setVdKan(!vd || r?.zaal?.vd === vd);
      })
      .catch(() => {});
    return () => { weg = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spel.gasten, spel.voordragen, inLobby]);

  // Films bij de vraag aan de gasten zetten (alleen wat ze nog niet kregen),
  // één keer tegelijk. Geeft de versie van de vraag.
  const vraagBij = (kandidaten) => {
    const doe = async () => {
      const nieuw = kandidaten.filter((k) => !gevraagd.current.has(k.key)).slice(0, MAX_VRAAG);
      if (nieuw.length) {
        const r = await zetVraag(zaal.code, zaal.geheim, nieuw);
        nieuw.forEach((k) => gevraagd.current.add(k.key));
        vraagV.current = r?.v || vraagV.current;
      }
      return vraagV.current;
    };
    vraagRij.current = vraagRij.current.then(doe, doe);
    return vraagRij.current;
  };

  // Meldt de eerste gast met Letterboxd zich, dan krijgen de telefoons de
  // films uit de pot alvast: bij het kiezen is hun oordeel er dan al
  const nGasten = Object.keys(gasten).length;
  useEffect(() => {
    if (!nGasten || !spel.gasten || gevraagd.current.size) return;
    vraagBij(vraagUitPot(pool, meta)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nGasten]);

  // Laat de gasten met Letterboxd oordelen over deze films: zet ze klaar,
  // wacht tot ieder antwoordde (hooguit wachtMs) en geef wat de zaal ervan
  // vindt. Null als niemand de eigen Letterboxd meetelt.
  const vraagGasten = async (kandidaten) => {
    let g = (await standZaal(zaal.code, zaal.geheim)).gasten || {};
    if (!Object.keys(g).length) return null;
    const v = await vraagBij(kandidaten);
    const tot = Date.now() + wachtMs;
    const nog = () => Object.entries(g).filter(([, x]) => (x.v || 0) < v).map(([n]) => n);
    try {
      while (nog().length && Date.now() < tot) {
        setWachtOp(nog());
        await wacht(600);
        try { g = (await standZaal(zaal.code, zaal.geheim)).gasten || {}; } catch { /* nog eens */ }
      }
    } finally { setWachtOp([]); }
    const r = await standZaal(zaal.code, zaal.geheim, { oordeel: true });
    const alle = r.gasten || {};
    return { oordeel: zaalOordeel(alle), namen: Object.keys(alle).filter((n) => alle[n].n > 0) };
  };

  // De voordrachten van de gasten bij de films op tafel. Staat een
  // voorgedragen film al op tafel, dan krijgt die de namen erbij; de rest
  // komt erbij, zoveel als de gastheer toestond. Zijn het er meer, dan gaat
  // voor wat meer gasten voordroegen, dan wat bij het genre past, en verder
  // beslist het lot. Geeft { films, totaal }.
  const voordrachtenOpTafel = async (genre, lijst) => {
    const r = await standZaal(zaal.code, zaal.geheim, { voordrachten: true });
    const per = voordrachtenPerFilm(r.voordrachten);
    if (!per.length) return { films: [], totaal: 0 };
    // Staat de film op de lijst van de gastheer, dan met diens sleutel en filmdata
    const sleutelVan = new Map(Object.entries(meta).filter(([, m]) => m?.id).map(([k, m]) => [m.id, k]));
    const rest = [];
    per.forEach((v) => {
      const key = sleutelVan.get(v.id) || filmKey(v.name, v.year);
      const op = lijst.find((f) => (f.id && f.id === v.id) || f.key === key);
      if (op) op.voor = v.voor;
      else rest.push({ v, key });
    });
    const namen = genre?.namen || [];
    const kandidaten = await Promise.all(rest.map(async ({ v, key }) => {
      let m = meta[key] || null;
      if (!m) { try { m = await fetchDetailById(v.id, app.tmdbKey); } catch { m = null; } }
      const film = meta[key]
        ? (pool.find((f) => f.key === key) || (app.watchlist || []).find((f) => f.key === key) || { key, name: v.name, year: v.year })
        : { key, name: v.name, year: m?.year || v.year };
      return { film, m: m || { id: v.id, poster: v.poster, year: v.year }, voor: v.voor, opLijst: !!meta[key] };
    }));
    const past = ({ m }) => !namen.length || (m.genres || []).some((g) => namen.includes(g));
    const gekozen = kiesVoordrachten(kandidaten, spel.voordragen, { past });
    gekozen.forEach(({ film, m, opLijst }) => { if (!opLijst) aanraderMeta.current[film.key] = m; });
    return {
      films: gekozen.map(({ film, m, voor }) => ({ ...filmVoorZaal(film, m, null, voor), voorgedragen: true })),
      totaal: kandidaten.length,
    };
  };

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

  // Wat de aanraders van de gastheer meenemen: de sterren (favorieten en
  // liever-niet), wat bewaard en afgewezen is, de eigen diensten
  const gastheer = () => {
    const sterren = { ...(app.ratings || {}) };
    (app.ratedFilms || []).forEach((f) => { if (f.rating != null) sterren[f.key] = f.rating; });
    return {
      sterren,
      lijst: new Set((app.watchlist || []).map((f) => f.key)),
      bewaard: app.shortlist || [],
      afgewezen: app.skipped || [],
      details: leesOpslag('kandDetails', {}),
      // Een verdacht cijfer laten toetsen aan IMDb, als de gastheer OMDb heeft
      tweedeMening: app.omdbKeys?.length ? (m) => vraagTweedeMening(m, app.omdbKeys) : null,
      dienstIds: dienstIdsVoor(diensten, leesOpslag('dienstenLijst', null), getRegion()),
    };
  };

  // Films van de lijst (vijf, of wat de gastheer koos), en zo gewenst
  // aanraders van buiten. De aanraders kennen de genrestemming (stemmen:
  // punten per genre) en de films op tafel. Tellen gasten hun Letterboxd
  // mee, dan valt eruit wat iemand al zag en weegt hun smaak mee.
  const naarFilms = async (genre, r, stemmen = null) => {
    setZoekt(true);
    setNoot('');
    try {
      let mee = null; // { oordeel, namen }
      if (spel.gasten && lbKan && (spel.gezienWeg || spel.smaakMee)) {
        try { mee = await vraagGasten(vraagUitPot(genreBasis(pool, meta, genre), meta)); } catch { mee = null; }
      }
      const sturing = mee ? zaalSturing(mee.oordeel, spel) : null;
      const lijst = kiesFilms(pool, meta, genre, app.history || [], spel.lijst, Math.random, sturing).map((f) => filmVoorZaal(f, meta[f.key]));
      const noten = [];
      if (mee?.namen.length) {
        const wat = spel.gezienWeg && spel.smaakMee ? 'zaal.gastenBeide' : spel.gezienWeg ? 'zaal.gastenGezien' : 'zaal.gastenSmaak';
        noten.push(tr(wat, { namen: lijstje(mee.namen, tr) }));
      }
      let voor = { films: [], totaal: 0 };
      if (spel.voordragen > 0 && vdKan) {
        try { voor = await voordrachtenOpTafel(genre, lijst); } catch { voor = { films: [], totaal: 0 }; }
        if (voor.totaal > voor.films.length) noten.push(tr('zaal.vdTeVeel', { n: voor.totaal, count: voor.films.length }));
      }
      let extra = [];
      if (spel.aanraders > 0) {
        // Geen aanrader die iemand al voordroeg
        const uit = bekend();
        voor.films.forEach((f) => { if (f.id) uit.ids.add(f.id); uit.keys.add(f.key); });
        try {
          const gevonden = await zoekAanraders({
            sleutel: app.tmdbKey, meta, genre, filters, diensten, uit, smaak: app.taste, aantal: spel.aanraders,
            stemmen, tafel: lijst.map((f) => f.key), getoond, ...gastheer(),
            zaal: mee ? { oordeel: async (k) => (await vraagGasten(k))?.oordeel || {}, gezienWeg: spel.gezienWeg, smaakMee: spel.smaakMee } : null,
          });
          gevonden.forEach((a) => { aanraderMeta.current[a.film.key] = a.m; });
          if (gevonden.length) setGetoond((g) => onthoudGetoond(g, gevonden.map((a) => a.m.id)));
          extra = gevonden.map((a) => filmVoorZaal(a.film, a.m, a)).filter((a) => !lijst.some((f) => f.key === a.key));
          if (!extra.length) noten.push(tr('zaal.aanradersGeen'));
        } catch {
          noten.push(tr('zaal.aanradersFout'));
        }
      }
      setNoot(noten.join(' '));
      naarStemmen.current = false;
      nuGezet.current = null;
      return await zet({ fase: 'trailers', ronde: r, genre, films: [...lijst, ...extra, ...voor.films] });
    } finally {
      setZoekt(false);
    }
  };

  const naamHier = hostNaam.trim();
  const hierInDeZaal = zelfMee && doetMee(spelers, naamHier);
  const naamInZaal = spelers.find((n) => n.toLocaleLowerCase() === naamHier.toLocaleLowerCase()) || naamHier;
  const aantal = spelers.length + (zelfMee && naamHier && !doetMee(spelers, naamHier) ? 1 : 0);

  // Zonder genreronde (of met te weinig genres in de pot): meteen de films
  const naarGenres = (r) => {
    const opties = genreOpties(pool, meta);
    return spel.genreRonde && opties.length >= 2 ? zet({ fase: 'genre', ronde: r, opties }) : naarFilms({ namen: [], wijze: 'vrij' }, r);
  };

  const begin = async () => {
    await lobbyZet.current; // eerst de lobby af, anders kan die de eerste ronde overschrijven
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
  const compleet = iedereen && Object.values(keuzes).every((k) => k[0] != null && k[1] != null);

  // Vlak voor het tellen de verse stand: de laatste peiling kan twee seconden
  // oud zijn, en een 2e keus van het laatste moment mag niet wegvallen (dan
  // kan een gelijkspel ontstaan dat er niet was). De stem op dit scherm telt
  // zoals hij hier staat, ook als hij nog onderweg is.
  const versKeuzes = async () => {
    let uit = keuzes;
    try {
      const r = await standZaal(zaal.code, zaal.geheim);
      setStemmen(r.stemmen || {});
      uit = keuzesIn(r.stemmen || {}, r.zaal?.spelers || spelers, ronde);
    } catch { /* dan de laatste peiling */ }
    if (hierInDeZaal && mijnKeuze?.ronde === ronde) {
      uit = Object.fromEntries(Object.entries(uit).filter(([n]) => n !== naamInZaal));
      if (mijnKeuze.keuze.length) uit[naamInZaal] = mijnKeuze.keuze;
    }
    return uit;
  };

  const sluitGenre = async () => {
    if (sluitend.current) return;
    sluitend.current = true;
    try {
      const vers = await versKeuzes();
      const res = uitslagGenre({ opties: staat.opties || [], stemmen: Object.values(vers), pool, meta, nodig: spel.lijst });
      await naarFilms({ namen: res.namen, wijze: res.wijze, punten: res.punten }, ronde, res.telling?.punten);
    } finally { sluitend.current = false; }
  };

  // Welke trailer er nu draait, voor de telefoons (nu: { key, i, n }, of
  // null als de trailers dicht gaan). Eén tegelijk, en alleen de laatste
  // stand: wie snel doortikt, stuurt niet elke trailer apart.
  const zetNu = (nu) => {
    nuGewenst.current = nu;
    const doe = async () => {
      const gewenst = nuGewenst.current;
      if (naarStemmen.current || JSON.stringify(gewenst) === JSON.stringify(nuGezet.current)) return;
      try {
        await zetZaal(zaal.code, zaal.geheim, { fase: 'trailers', ronde, genre: staat.genre, films: staat.films, ...(gewenst ? { nu: gewenst } : {}) });
        nuGezet.current = gewenst;
      } catch { /* dan zien de telefoons het net niet */ }
    };
    trailerRij.current = trailerRij.current.then(doe, doe);
  };

  // Eerst de laatste trailerstand af, anders kan die de stemming overschrijven
  const startStemmen = async () => {
    naarStemmen.current = true;
    await trailerRij.current;
    return zet({ fase: 'film', ronde: ronde + 1, genre: staat.genre, films: staat.films });
  };

  const sluitFilm = async () => {
    if (sluitend.current) return;
    sluitend.current = true;
    const res = uitslagFilm(staat.films, Object.values(await versKeuzes()));
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
  // wie nog een 2e keus wil zetten of wisselen, kan dat nog. Heeft iemand
  // alleen een 1e keus, dan wacht het scherm langer. Of met de hand, als de
  // gastheer dat koos.
  useEffect(() => {
    if (!spel.vanzelf || !iedereen || bezig || zoekt || lot) return undefined;
    const t = setTimeout(() => (fase === 'genre' ? sluitGenre() : sluitFilm()), compleet ? SLUIT_MS : TWEEDE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spel.vanzelf, iedereen, compleet, fase, ronde, JSON.stringify(keuzes), bezig, zoekt, !!lot]);

  // Zelf meedoen: stemmen vanaf dit scherm, net als op een telefoon
  const hierGekozen = mijnKeuze && mijnKeuze.ronde === ronde ? mijnKeuze.keuze : (keuzes[naamInZaal] || []);
  const stemHier = async (keuze) => {
    setMijnKeuze({ ronde, keuze });
    try {
      const r = await stuurHier.current(zaal.code, naamInZaal, token.current, ronde, keuze);
      if (r?.ingehaald) return;
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
        {iedereen ? tr(!spel.vanzelf ? 'zaal.iedereenHand' : compleet ? 'zaal.iedereen' : 'zaal.nogTweede') : tr('zaal.gestemd', { n: gestemd, totaal: spelers.length })}
      </p>
      <button type="button" className="btn" onClick={fase === 'genre' ? sluitGenre : sluitFilm} disabled={!gestemd || bezig || zoekt || !!lot}>{tr('zaal.sluitRonde')}</button>
    </div>
  );

  const voet = (
    <div className="zs-voet">
      {fout && <p className="zs-melding" role="alert">{fout}</p>}
      <button type="button" className="linkbtn zs-sluit" onClick={onStop} data-uitleg="zaal-sluit">{tr('zaal.stop')}</button>
    </div>
  );

  // ---------- de lobby ----------
  if (fase === 'lobby') {
    return (
      <section className="zs zs-lobby" aria-label={tr('zaal.titel')} data-uitleg="zaal-lobby">
        <div className="zs-lobby-code" data-uitleg="zaal-scan" data-uitleg-code={zaal.code}>
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
              {spelers.map((n) => (
                <li key={n}>
                  {n}
                  {gasten[n] && <span className="zs-namen-lb">{tr('zaal.lbMerk')}</span>}
                  {spel.voordragen > 0 && voordrachten[n] && <span className="zs-namen-lb">{tr('zaal.draagtVoor', { titel: voordrachten[n].name })}</span>}
                </li>
              ))}
              {zelfMee && naamHier && !doetMee(spelers, naamHier) && <li className="hier">{naamHier}</li>}
            </ul>
          ) : <p className="zs-leeg">{tr('zaal.nogNiemand')}</p>}
          <div className="zs-zelf" data-uitleg="zaal-zelf">
            <button type="button" className={`switch-row ${zelfMee ? 'on' : ''}`} aria-pressed={zelfMee} onClick={() => setZelfMee(!zelfMee)}>
              <span className="switch" aria-hidden="true"><span className="knob" /></span>
              {tr('zaal.zelfMee')}
            </button>
            {zelfMee && (
              <input className="field" value={hostNaam} onChange={(e) => setHostNaam(e.target.value)} maxLength={20}
                placeholder={tr('zaal.tNaamPlaceholder')} aria-label={tr('zaal.jouwNaam')} />
            )}
          </div>
          <ZaalSpel spel={spel} zetSpel={zetSpel} lbKan={lbKan} vdKan={vdKan} />
          <button type="button" className="btn primary big zs-begin" onClick={begin} disabled={bezig || zoekt || aantal < 1} data-uitleg="zaal-begin" data-uitleg-n={aantal}>
            {aantal ? tr('zaal.begin', { count: aantal }) : tr('zaal.wachtOpSpelers')}
          </button>
          {zoekt && <p className="zs-leeg" role="status">{wachtOp.length ? tr('zaal.wachtOpLb', { namen: lijstje(wachtOp, tr) }) : tr('zaal.kiezen')}</p>}
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
        <p className="zs-sub" role="status">{!zoekt ? tr('zaal.stemUitleg') : wachtOp.length ? tr('zaal.wachtOpLb', { namen: lijstje(wachtOp, tr) }) : tr('zaal.kiezen')}</p>
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
      aanraderMeta.current[film.key] || null,
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
  const vanLijst = films.filter((f) => !f.aanrader && !f.voorgedragen);
  const aanraders = films.filter((f) => f.aanrader);
  const voorgedragen = films.filter((f) => f.voorgedragen);
  // Van de lijst, aanraders en voordrachten, elk met een kopje als er meer zijn
  const groepen = [
    { kop: tr('zaal.vanLijst'), films: vanLijst },
    { kop: tr('zaal.aanradersKop'), films: aanraders },
    { kop: tr('zaal.voordrachtenKop'), films: voorgedragen },
  ].filter((g, i) => i === 0 || g.films.length);
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
            {voorgedragen.length > 0 && <> {tr('zaal.plusVoordrachten', { count: voorgedragen.length })}</>}
            {noot && <> {noot}</>}
          </p>
        </>
      )}
      <div className={`zs-filmgroepen${groepen.length > 1 ? ' met-groepen' : ''}`} style={{ '--kolommen': groepen.map((g) => `minmax(0, ${g.films.length || 1}fr)`).join(' ') }}>
        {groepen.map((g, gi) => (
          <div key={g.kop} className="zs-filmgroep">
            {groepen.length > 1 && <p className="label-breed zs-groep">{g.kop}</p>}
            {rij(g.films, groepen.slice(0, gi).reduce((n, x) => n + x.films.length, 0))}
          </div>
        ))}
      </div>
      {filmRonde ? wie : (
        <div className="zs-acties">
          {metTrailer > 0 && <button type="button" className="btn primary big" onClick={() => setTrailersOpen(true)}>{tr('zaal.trailers', { count: metTrailer })}</button>}
          <button type="button" className={`btn big ${metTrailer ? '' : 'primary'}`} onClick={startStemmen} disabled={bezig}>{tr('zaal.stemmenMaar')}</button>
          {!metTrailer && <p className="zs-leeg">{tr('zaal.geenTrailers')}</p>}
        </div>
      )}
      {trailersOpen && (
        <ZaalTrailers films={films} onNu={zetNu} onSluit={() => { setTrailersOpen(false); zetNu(null); }}
          onKlaar={() => { setTrailersOpen(false); startStemmen(); }} />
      )}
      {voet}
    </section>
  );
}

// Zo speelt de zaal: wat de gastheer kiest voor de avond begint. Onthouden
// op dit toestel; elke rij is een keuze, alles staat open.
function ZaalSpel({ spel, zetSpel, lbKan, vdKan }) {
  const { t: tr } = useT();
  const rij = (label, inhoud) => (
    <div className="af-rij">
      <span className="af-label">{label}</span>
      <div className="af-chips">{inhoud}</div>
    </div>
  );
  return (
    <div className="zs-spel" role="group" aria-label={tr('zaal.spelKop')} data-uitleg="zaal-spel">
      <h3 className="zs-spel-kop">{tr('zaal.spelKop')}</h3>
      {rij(tr('zaal.spelGenre'), (
        <>
          <Chip aan={spel.genreRonde} onClick={() => zetSpel('genreRonde', true)}>{tr('zaal.spelGenreJa')}</Chip>
          <Chip aan={!spel.genreRonde} onClick={() => zetSpel('genreRonde', false)}>{tr('zaal.spelGenreNee')}</Chip>
        </>
      ))}
      {rij(tr('zaal.spelLijst'), [3, 4, 5].map((n) => (
        <Chip key={n} aan={spel.lijst === n} onClick={() => zetSpel('lijst', n)} label={tr('zaal.nFilms', { count: n })}>{n}</Chip>
      )))}
      {rij(tr('zaal.spelAanraders'), [0, 1, 2, 3].map((n) => (
        <Chip key={n} aan={spel.aanraders === n} onClick={() => zetSpel('aanraders', n)}
          label={n ? tr('zaal.spelAanradersN', { count: n }) : tr('zaal.spelGeenAanraders')}>{n || tr('zaal.spelGeen')}</Chip>
      )))}
      {rij(tr('zaal.spelVoordragen'), [0, 1, 2, 3].map((n) => (
        <Chip key={n} aan={spel.voordragen === n} onClick={() => zetSpel('voordragen', n)}
          label={n ? tr('zaal.spelVoordragenN', { count: n }) : tr('zaal.spelGeenVoordrachten')}>{n || tr('zaal.spelGeen')}</Chip>
      )))}
      {spel.voordragen > 0 && <p className="zs-spel-noot">{vdKan ? tr('zaal.spelVoordragenUitleg') : tr('zaal.spelVdWorkerOud')}</p>}
      {rij(tr('zaal.spelGasten'), (
        <>
          <Chip aan={spel.gasten} onClick={() => zetSpel('gasten', true)}>{tr('zaal.spelGastenJa')}</Chip>
          <Chip aan={!spel.gasten} onClick={() => zetSpel('gasten', false)}>{tr('zaal.spelGastenNee')}</Chip>
        </>
      ))}
      {spel.gasten && rij(tr('zaal.spelMetLb'), (
        <>
          <Chip aan={spel.gezienWeg} onClick={() => zetSpel('gezienWeg', !spel.gezienWeg)}>{tr('zaal.spelGezien')}</Chip>
          <Chip aan={spel.smaakMee} onClick={() => zetSpel('smaakMee', !spel.smaakMee)}>{tr('zaal.spelSmaak')}</Chip>
        </>
      ))}
      {spel.gasten && <p className="zs-spel-noot">{lbKan ? tr('zaal.spelGastenUitleg') : tr('zaal.spelWorkerOud')}</p>}
      {rij(tr('zaal.spelSluiten'), (
        <>
          <Chip aan={spel.vanzelf} onClick={() => zetSpel('vanzelf', true)}>{tr('zaal.spelVanzelf')}</Chip>
          <Chip aan={!spel.vanzelf} onClick={() => zetSpel('vanzelf', false)}>{tr('zaal.spelHand')}</Chip>
        </>
      ))}
    </div>
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
