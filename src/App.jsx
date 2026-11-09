import { useCallback, useMemo, useRef, useState } from 'react';
import Shell from './components/Shell.jsx';
import ScoresPreview from './components/ScoresPreview.jsx';
import RemoteVote from './components/RemoteVote.jsx';
import SamenGast from './components/SamenGast.jsx';
import AvondVraag from './components/AvondVraag.jsx';
import Afgescheurd from './components/Afgescheurd.jsx';
import Ontdekt from './components/Ontdekt.jsx';
import SimilarOverlay from './components/SimilarOverlay.jsx';
import { buildTaste } from './lib/taste.js';
import Pick from './tabs/Pick.jsx';
import Bieb from './tabs/Bieb.jsx';
import Verken from './tabs/Verken.jsx';
import Avond from './tabs/Avond.jsx';
import Inzicht from './tabs/Inzicht.jsx';
import Instellingen from './tabs/Instellingen.jsx';
import { useLS, useStorageHealth, useMetaStore, leesOpslag, filmKey } from './lib/storage.js';
import { onthoudVondst, gevondenKaartjes } from './lib/vondsten.js';
import { verzamelVoorbeelden, leerEnToets } from './lib/model.js';
import { enrichAll, refreshProviders, resolveFilm, fetchDetailById, setRegion, getRegion, DEFAULT_REGION, effectiveTmdbKey, herstelFestivalJaar, FESTIVAL_DREMPEL } from './lib/tmdb.js';
import { setNossyWeights } from './lib/pick.js';
import { setThemeEmphasis } from './lib/taste.js';
import { fetchExtRatings } from './lib/omdb.js';
import { volgAanbod } from './lib/aanbod.js';
import { haalDagboek, voegDagboekSamen } from './lib/lbLive.js';
import { useSync } from './lib/useSync.js';
import { normaliseerCode } from './lib/sync.js';
import { nieuwKaartje, voegKaartjeToe, kaartjesUitGeschiedenis, beoordeelKaartjes, vraagAvond, inDeDoos, AVOND_GAT } from './lib/kaartjesdoos.js';
import { useEffect } from 'react';
import { registerDict, setLang, detectLang, getLang, useT } from './lib/i18n.js';
import nlDict from './lib/dict/nl.js';
import enDict from './lib/dict/en.js';

registerDict('nl', nlDict);
registerDict('en', enDict);

export default function App() {
  const [tab, setTab] = useState('pick');
  const { t: tr } = useT();
  const storageBroken = useStorageHealth();
  // Binnengekomen via een deellink? Dan is dit apparaat een stemmer, geen
  // volwaardige tool-sessie. Werkt ook zonder watchlist of sleutel.
  const avondCode = new URLSearchParams(location.search).get('avond');
  // Of als gast bij "Voor ons" (?samen=CODE): smaak lezen, scores sturen
  const samenCode = new URLSearchParams(location.search).get('samen');
  const [settings, setSettings] = useLS('settings', { tmdbKey: '' });
  // Eigen sleutel wint; zonder eigen sleutel loopt alles via de tool-proxy
  // (zodra die geconfigureerd is). Guards en API-calls zien gewoon 'een sleutel'.
  const tmdbKey = effectiveTmdbKey(settings.tmdbKey);
  const [watchlist, setWatchlist] = useLS('watchlist', []);
  const [watchedLb, setWatchedLb] = useLS('watchedLb', []);
  const [watchedFilms, setWatchedFilms] = useLS('watchedFilms', []); // met naam/jaar, voor de Bieb
  const [ratings, setRatings] = useLS('ratings', {});
  const [ratedFilms, setRatedFilms] = useLS('ratedFilms', []); // uit ratings.csv, incl. films buiten je watchlist
  const [seen, setSeen] = useLS('seen', []);
  const [meta, setMetaRuw, metaReady] = useMetaStore();
  // Elke wijziging van de filmdata loopt langs volgAanbod: zo onthouden we
  // sinds wanneer een film op een dienst staat (Net binnen, lib/aanbod.js)
  const setMeta = useCallback((upd) => setMetaRuw((prev) => volgAanbod(prev, typeof upd === 'function' ? upd(prev) : upd)), [setMetaRuw]);
  const [history, setHistory] = useLS('history', []);
  // Eigen sterren (uit de pick-opvolging), los van de Letterboxd-import zodat
  // een her-import ze nooit wegvaagt. Vorm: { key: { rating, name, year, at } }
  const [ownRatings, setOwnRatings] = useLS('ownRatings', {});
  // Uit dezelfde Letterboxd-export, voorheen genegeerd: het kijk-dagboek
  // (datums, herkijken) en je eigen thematische lijsten.
  const [diary, setDiary] = useLS('diary', []);
  const [lbLists, setLbLists] = useLS('lbLists', []);
  // Antwoorden op "gekeken?"-vragen, per pick-datum: 'rated' | 'seen' | 'no'
  const [followups, setFollowups] = useLS('followups', {});
  // De kaartjesdoos (lib/kaartjesdoos.js): elk kaartje van een pick, en wanneer
  // je een film als gezien markeerde (bewijs dat je een kaartje gebruikte)
  const [kaartjes, setKaartjes] = useLS('kaartjes', null);
  const [gezienOp, setGezienOp] = useLS('gezienOp', {});
  // "Toch niet gezien", met tijd: zodat de sync weet wat het laatst gold
  const [gezienWeg, setGezienWeg] = useLS('gezienWeg', {});
  // Films die de tool voor je vond (lib/vondsten.js): kijk je ze daarna,
  // dan worden ze een Gevonden-kaartje
  const [vondsten, setVondsten] = useLS('vondsten', {});
  // De vraag na een avond kun je tot later wegleggen: { id, tot }
  const [vraagLater, setVraagLater] = useLS('vraagLater', null);
  // Letterboxd live: wanneer je dagboek-feed voor het laatst is gelezen
  const [lbLive, setLbLive] = useLS('lbLive', { at: 0, fout: null, erbij: 0 });
  const [lbBezig, setLbBezig] = useState(false);
  // Je smaakmodel opnieuw laten leren (na nieuwe sterren via Letterboxd live)
  const [herleren, setHerleren] = useState(false);
  // Afgescheurde kaartjes die je al voorbij zag komen (dit apparaat), en de
  // wachtrij van kaartjes die de app zelf als gekeken ontdekte
  const [gemeld, setGemeld] = useLS('kaartjesGemeld', null);
  const [ontdekt, setOntdekt] = useState([]);
  // Het moment dat een kaartje afscheurt: { kaartje, nummer }
  const [afgescheurd, setAfgescheurd] = useState(null);
  // De Bieb op een bepaalde tab openen (bijv. vanuit "Bekijk de doos")
  const biebStartRef = useRef(null);
  const [shortlist, setShortlist] = useLS('shortlist', []);
  const [skipped, setSkipped] = useLS('skipped', []);
  // Fase 8: het uit jouw beoordelingen geleerde rangschikmodel (Inzicht)
  const [smaakModel, setSmaakModel] = useLS('smaakModel', null);
  const [ignored, setIgnored] = useLS('ignored', []); // keys van items die geen film zijn (bijv. tv-series)
  const [smart, setSmart] = useLS('smart', false);
  const [demoMode, setDemoMode] = useLS('demoMode', false);
  const [enrich, setEnrich] = useState({ running: false, done: 0, total: 0, errors: 0 });
  const [extEnrich, setExtEnrich] = useState({ running: false, done: 0, total: 0, ok: 0, lastError: null, ranOnce: false });
  const stopRef = useRef(false);
  const metaRef = useRef(meta);
  useEffect(() => { metaRef.current = meta; }, [meta]);
  // Jouw Nossy-recept doorvoeren in de rekenmodule (ook voor Bieb-sortering, moods, slimme pick)
  setNossyWeights(settings.nossyWeights);
  setThemeEmphasis(settings.themeEmphasis);
  setRegion(settings.region || DEFAULT_REGION);
  // Taal: opgeslagen keuze, anders browsertaal als slim startpunt
  if (getLang() !== (settings.lang || detectLang())) setLang(settings.lang || detectLang());
  useEffect(() => { setLang(settings.lang || detectLang()); }, [settings.lang]);
  useEffect(() => { setNossyWeights(settings.nossyWeights); }, [settings.nossyWeights]);
  useEffect(() => { setRegion(settings.region || DEFAULT_REGION); }, [settings.region]);
  // Bij een regio-wissel is het gecachete streamingaanbod van de oude regio.
  // Ververs dan stilletjes de providers (en JustWatch-link) van de hele bieb.
  const regionInitRef = useRef(true);
  useEffect(() => {
    if (regionInitRef.current) { regionInitRef.current = false; return undefined; }
    const key = tmdbKey;
    if (!key) return undefined;
    const items = Object.entries(meta).filter(([, m]) => m && m.id);
    if (!items.length) return undefined;
    let stop = false;
    (async () => {
      for (const [k, m] of items) {
        if (stop) return;
        try {
          const p = await refreshProviders(m.id, key);
          // Ander land, ander aanbod: 'net binnen' begint hier opnieuw te tellen
          setMeta((prev) => (prev[k] ? { ...prev, [k]: { ...prev[k], ...p, flatSinds: null } } : prev));
        } catch { return; }
        await new Promise((r) => setTimeout(r, 250));
      }
    })();
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.region]);
  useEffect(() => { setThemeEmphasis(settings.themeEmphasis); }, [settings.themeEmphasis]);

  // Terug naar start: leegt de bibliotheek (watchlist, filmdata, ratings, geschiedenis)
  // maar bewaart instellingen zoals je TMDB-sleutel.
  const resetLibrary = () => {
    stopRef.current = true;
    setEnrich({ running: false, done: 0, total: 0, errors: 0 });
    setWatchlist([]);
    setWatchedLb([]);
    setWatchedFilms([]);
    setRatings({});
    setRatedFilms([]);
    setOwnRatings({});
    setFollowups({});
    setKaartjes([]);
    setGezienOp({});
    setDiary([]);
    setLbLists([]);
    setSeen([]);
    setMeta({});
    setHistory([]);
    setShortlist([]);
    setSkipped([]);
    setSmaakModel(null);
    setIgnored([]);
    setDemoMode(false);
    setTab('pick');
  };

  const seenSet = useMemo(() => new Set([...watchedLb, ...seen]), [watchedLb, seen]);
  // Eigen sterren mengen met de Letterboxd-ratings: het smaakprofiel en alle
  // tabs zien één geheel en leren dus direct van een pick-beoordeling.
  const mergedRatings = useMemo(() => ({
    ...ratings,
    ...Object.fromEntries(Object.entries(ownRatings).map(([k, v]) => [k, v.rating])),
  }), [ratings, ownRatings]);
  const mergedRatedFilms = useMemo(() => ([
    ...ratedFilms.filter((f) => !(f.key in ownRatings)),
    ...Object.entries(ownRatings).map(([key, v]) => ({ key, name: v.name, year: v.year, rating: v.rating })),
  ]), [ratedFilms, ownRatings]);

  // De slimme aanrader: vanaf elke filmkaart, dus centraal in de app.
  const [similarSeed, setSimilarSeed] = useState(null); // {film, meta}
  const taste = useMemo(
    () => buildTaste({ watchlist, ratedFilms: mergedRatedFilms, meta, shortlist, skipped }),
    [watchlist, mergedRatedFilms, meta, shortlist, skipped],
  );

  // De kaartjesdoos. Eenmalig bij de start: kaartjes uit de pick-geschiedenis
  // en de antwoorden op de oude "Gekeken?"-vraag.
  useEffect(() => {
    if (kaartjes === null) setKaartjes(kaartjesUitGeschiedenis(history, followups, ownRatings));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const kaartjesStand = useMemo(() => {
    const eigen = beoordeelKaartjes(kaartjes || [], { diary, gezienOp, ownRatings });
    // Plus de Gevonden-kaartjes, behalve voor films die al een eigen kaartje
    // in de doos hebben (of waar je er zelf een van maakte)
    const overslaanIds = new Set((kaartjes || []).map((k) => k.id));
    const overslaanKeys = new Set(eigen.filter((k) => k.status === 'gekeken').map((k) => k.key));
    return [...eigen, ...gevondenKaartjes(vondsten, { diary, gezienOp, ownRatings, overslaanIds, overslaanKeys })];
  },
    [kaartjes, diary, gezienOp, ownRatings, vondsten],
  );
  // Ontdekt: een kaartje scheurt af door bewijs dat de app zelf vond (je
  // Letterboxd-dagboek, of je markeerde de film als gezien). Dan speelt het
  // ontdekmoment (Ontdekt.jsx), op welk scherm je ook bent. Wat je zelf
  // beantwoordde, kreeg al het kleine afscheurmoment. De eerste keer onthouden
  // we alleen wat er al lag, zonder animaties.
  // (een ref, zodat een effect dat twee keer draait niets dubbel meldt)
  const gemeldRef = useRef(gemeld);
  useEffect(() => {
    if (kaartjes === null) return;
    const gescheurd = kaartjesStand.filter((k) => k.status === 'gekeken');
    const al = gemeldRef.current;
    if (al === null) { gemeldRef.current = gescheurd.map((k) => k.id); setGemeld(gemeldRef.current); return; }
    const bekend = new Set(al);
    const nieuw = gescheurd.filter((k) => !bekend.has(k.id));
    if (!nieuw.length) return;
    gemeldRef.current = [...al, ...nieuw.map((k) => k.id)].slice(-3000);
    setGemeld(gemeldRef.current);
    const tonen = nieuw.filter((k) => k.bewijs !== 'antwoord');
    if (!tonen.length) return;
    const totaal = gescheurd.length;
    setOntdekt((q) => [...q, ...tonen.filter((k) => !q.some((x) => x.k.id === k.id))
      .map((k, i) => ({ k, nummer: totaal - tonen.length + i + 1 }))]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kaartjesStand]);

  // Een pick (of de winnaar van Avond) levert een kaartje op
  const geefKaartje = (film, opties = {}) => {
    const poster = opties.poster || meta[film.key]?.poster || null;
    setKaartjes((lijst) => voegKaartjeToe(lijst || [], nieuwKaartje(film, { ...opties, poster })));
  };
  // Een kaartje aanpassen: sterren, notitie, of achteraf toch (niet) gekeken
  const pasKaartjeAan = (id, wijziging) => {
    setKaartjes((lijst) => {
      const l = lijst || [];
      if (l.some((k) => k.id === id)) return l.map((k) => (k.id === id ? { ...k, ...wijziging, bij: Date.now() } : k));
      // Een Gevonden-kaartje bestaat alleen afgeleid: bij een wijziging wordt
      // het een eigen kaartje, op de dag dat je de film keek
      const af = kaartjesStand.find((k) => k.id === id);
      if (!af) return l;
      const { status, bewijs, gekekenOp, ...rest } = af;
      const datum = String(gekekenOp).length === 10 ? new Date(`${gekekenOp}T20:00:00`).toISOString() : gekekenOp;
      return [{ ...rest, datum, antwoord: 'gekeken', ...wijziging, bij: Date.now() }, ...l];
    });
  };
  // Een vondst onthouden: een film die je in Verken opende, op je shortlist
  // zette of doorklikte. Wat je al zag, beoordeelde of op je lijst had, niet.
  const vondst = (film, opties = {}) => {
    const key = film.key || filmKey(film.title || film.name, film.year || '');
    if (seenSet.has(key) || mergedRatings[key] != null || watchlist.some((f) => f.key === key)) return;
    setVondsten((v) => onthoudVondst(v, { key, id: film.id ?? null, name: film.name || film.title, year: film.year, poster: film.poster }, opties));
  };
  // Zelf toevoegen vanuit je dagboek: "die vond ik via Nossy"
  const gevondenToevoegen = (d) => {
    const k = {
      id: `gevonden|${d.key}`, key: d.key, name: d.name, year: d.year || null, poster: meta[d.key]?.poster || null,
      datum: new Date(`${d.watchedDate}T20:00:00`).toISOString(), bron: 'gevonden', vondst: 'zelf', personen: 1,
      antwoord: 'gekeken', sterren: d.rating ?? null, beantwoord: new Date().toISOString(), bij: Date.now(),
    };
    setKaartjes((l) => [k, ...(l || []).filter((x) => x.id !== k.id)]);
    scheurAf(k, k.sterren);
  };
  // Het afscheurmoment: het kaartje schuift de doos in, met zijn nummer
  const scheurAf = (kaartje, sterren = null) => {
    setAfgescheurd({ kaartje: { ...kaartje, sterren, poster: kaartje.poster || meta[kaartje.key]?.poster || null }, nummer: inDeDoos(kaartjesStand).length + 1 });
  };
  const naarDeDoos = () => { biebStartRef.current = 'kaartjes'; setAfgescheurd(null); setTab('bieb'); };
  // Doorklikken naar een dienst of delen: dit kaartje gaat vooraan in de vraag
  const kaartjeDoorgeklikt = (key) => {
    const nu = Date.now();
    setKaartjes((lijst) => (lijst || []).map((k) => (
      k.key === key && nu - Date.parse(k.datum) < AVOND_GAT && !k.doorgeklikt ? { ...k, doorgeklikt: true, bij: nu } : k
    )));
  };
  const markeerAlsGezien = (key) => {
    setSeen((s) => (s.includes(key) ? s : [...s, key]));
    setGezienOp((g) => ({ ...g, [key]: new Date().toISOString() }));
  };
  // Het antwoord op de vraag na een avond: welk kaartje heb je gebruikt (of
  // geen). gekozen: key van de gekeken film, of null voor "geen van allen".
  const beantwoordAvond = (avond, gekozen, sterren = null) => {
    const nu = new Date().toISOString();
    const ids = new Set(avond.map((k) => k.id));
    setKaartjes((lijst) => (lijst || []).map((k) => {
      if (!ids.has(k.id)) return k;
      if (k.key === gekozen) return { ...k, antwoord: 'gekeken', sterren: sterren || null, beantwoord: nu, bij: Date.now() };
      return { ...k, antwoord: 'niet', beantwoord: nu, bij: Date.now() };
    }));
    if (!gekozen) return;
    const film = avond.find((k) => k.key === gekozen);
    if (film) scheurAf(film, sterren);
    markeerAlsGezien(gekozen);
    if (sterren && film) setOwnRatings((prev) => ({ ...prev, [gekozen]: { rating: sterren, name: film.name, year: film.year, at: Date.now() } }));
  };
  // Letterboxd live (lib/lbLive.js): je openbare dagboek-feed meelezen. Nieuwe
  // logs gaan je dagboek in (kaartjes scheuren dan vanzelf af), tellen als
  // gezien, en hun sterren tellen mee in je smaak. Bij het openen hooguit
  // eens per zes uur, en altijd als je zelf op bijwerken drukt.
  const syncLetterboxd = async (naam = settings.lbNaam) => {
    if (!naam || lbBezig) return;
    setLbBezig(true);
    try {
      const regels = await haalDagboek(naam);
      const { diary: nieuwDagboek, erbij } = voegDagboekSamen(diary, regels);
      if (erbij.length) setDiary(nieuwDagboek);
      const keys = [...new Set(regels.map((r) => r.key))];
      setWatchedLb((prev) => (keys.every((k) => prev.includes(k)) ? prev : [...new Set([...prev, ...keys])]));
      setWatchedFilms((prev) => {
        const bekend = new Set(prev.map((f) => f.key));
        const nieuw = regels.filter((r) => !bekend.has(r.key)).map((r) => ({ key: r.key, name: r.name, year: r.year, uri: '' }));
        const uniek = [...new Map(nieuw.map((f) => [f.key, f])).values()];
        return uniek.length ? [...prev, ...uniek] : prev;
      });
      // De nieuwste sterren per film (de feed staat nieuwste eerst)
      const sterren = {};
      regels.forEach((r) => { if (r.rating != null && !(r.key in sterren)) sterren[r.key] = r; });
      // Zijn er een paar sterren bijgekomen of veranderd, en had je al een
      // smaakmodel (Inzicht), dan leert dat op de achtergrond opnieuw
      const veranderd = Object.values(sterren).filter((r) => ratings[r.key] !== r.rating).length;
      if (veranderd >= 3 && smaakModel && Date.now() - (smaakModel.at || 0) > 12 * 3600e3) setHerleren(true);
      if (Object.keys(sterren).length) {
        setRatings((prev) => ({ ...prev, ...Object.fromEntries(Object.entries(sterren).map(([k, r]) => [k, r.rating])) }));
        setRatedFilms((prev) => [
          ...prev.filter((f) => !(f.key in sterren)),
          ...Object.values(sterren).map((r) => ({ key: r.key, name: r.name, year: r.year, uri: '', rating: r.rating })),
        ]);
      }
      setLbLive({ at: Date.now(), fout: null, erbij: erbij.length });
    } catch (e) {
      setLbLive((s) => ({ ...s, at: Date.now(), fout: e.message }));
    }
    setLbBezig(false);
  };
  useEffect(() => {
    if (!herleren || !metaReady) return undefined;
    let weg = false;
    // Even wachten: eerst de opstart en het verversen, dan het rekenwerk
    const t = setTimeout(async () => {
      try {
        const data = {
          watchlist, meta: metaRef.current, ratedFilms: mergedRatedFilms, ratings: mergedRatings, seenSet,
          oeuvres: leesOpslag('oeuvres', {}), details: leesOpslag('kandDetails', {}), regio: getRegion(),
          shortlist, skipped,
        };
        const v = await verzamelVoorbeelden(data);
        if (weg || !v.genoeg) return;
        const m = leerEnToets(v.records);
        if (!m || weg) return;
        // Had je het model zelf uitgezet terwijl het beter was, dan blijft het uit
        setSmaakModel((oud) => ({ ...m, aan: m.beter && !(oud?.beter && oud.aan === false) }));
      } catch { /* dan de volgende keer */ } finally {
        if (!weg) setHerleren(false);
      }
    }, 5000);
    return () => { weg = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [herleren, metaReady]);
  // Vanzelf meelezen: bij het openen, als je terugkomt naar dit tabblad, en
  // elk half uur zolang de app openstaat. De Worker cachet de feed tien
  // minuten, dus vaker dan elke twintig minuten heeft geen zin.
  const syncLbRef = useRef(null);
  syncLbRef.current = syncLetterboxd;
  const lbAtRef = useRef(lbLive.at);
  lbAtRef.current = lbLive.at;
  useEffect(() => {
    if (!settings.lbNaam) return undefined;
    const LB_MIN = 20 * 60e3;
    const misschien = (altijd = false) => {
      if (!altijd && document.visibilityState !== 'visible') return;
      if (Date.now() - (lbAtRef.current || 0) > LB_MIN) syncLbRef.current?.();
    };
    misschien(true);
    const klok = setInterval(() => misschien(), 30 * 60e3);
    const terug = () => misschien();
    document.addEventListener('visibilitychange', terug);
    return () => { clearInterval(klok); document.removeEventListener('visibilitychange', terug); };
  }, [settings.lbNaam]);

  const ignoredSet = useMemo(() => new Set(ignored), [ignored]);
  // Markeer een lijst-item als 'geen film' (bijv. een tv-serie die Letterboxd
  // meesmokkelde): het verdwijnt uit aanbevelingen, Avond en de mismatch-lijst.
  const ignoreFilm = (filmKey) => {
    setIgnored((prev) => (prev.includes(filmKey) ? prev : [...prev, filmKey]));
    // eventuele twijfelvlag opruimen zodat Setup niet blijft zeuren
    setMeta((prev) => {
      if (!prev[filmKey]?.yearMismatch) return prev;
      const { yearMismatch, ...rest } = prev[filmKey];
      return { ...prev, [filmKey]: rest };
    });
  };
  const unignoreFilm = (filmKey) => setIgnored((prev) => prev.filter((k) => k !== filmKey));

  const toggleSeen = (key) => {
    const wasGezien = seen.includes(key);
    setSeen((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));
    setGezienOp((g) => {
      if (!wasGezien) return { ...g, [key]: new Date().toISOString() };
      const { [key]: _, ...rest } = g;
      return rest;
    });
    if (wasGezien) setGezienWeg((w) => ({ ...w, [key]: Date.now() }));
  };
  // Een film van buiten je lijst als gezien markeren, desgewenst met sterren
  // (bijv. vanuit Voor jou). Sterren tellen als eigen beoordeling en voeden zo
  // je smaakprofiel; de filmdata (`detail`) zetten we er direct bij, met het
  // exacte TMDB-id, zodat er niets op titel geraden hoeft te worden.
  const markeerGezien = (film, sterren = null, detail = null) => {
    markeerAlsGezien(film.key);
    if (sterren) setOwnRatings((prev) => ({ ...prev, [film.key]: { rating: sterren, name: film.name, year: film.year, at: Date.now() } }));
    if (detail) setMeta((prev) => (prev[film.key] ? prev : { ...prev, [film.key]: detail }));
  };

  const startEnrich = async (films, force = false) => {
    const key = tmdbKey;
    // Nooit verrijken vóór de cache uit IndexedDB geladen is: anders lijkt
    // alles 'ontbrekend' en halen we honderden films dubbel op.
    if (!key || enrich.running || !metaReady) return;
    const todo = force ? films : films.filter((f) => !(f.key in meta));
    if (!todo.length) return;
    stopRef.current = false;
    setEnrich({ running: true, done: 0, total: todo.length, errors: 0 });
    try {
      await enrichAll(
        todo, key,
        (p) => setEnrich((e) => ({ ...e, ...p })),
        (filmKey, m) => setMeta((prev) => ({ ...prev, [filmKey]: m })),
        () => stopRef.current,
      );
    } catch (e) {
      if (e.message === 'KEY_INVALID') alert(tr('app.tmdbKeyRejected'));
      else alert(tr('app.enrichFailed', { msg: e.message }));
    }
    setEnrich((e) => ({ ...e, running: false }));
    if (omdbKeys.length) startExtEnrich(films);
  };

  // OMDb-sleutels: nieuw meervoud (omdbKeys), met migratie van de oude enkele sleutel
  const omdbKeys = settings.omdbKeys?.length ? settings.omdbKeys : (settings.omdbKey ? [settings.omdbKey] : []);

  // Tweede laag: IMDb/RT/Metacritic via OMDb (optioneel, exact via imdbId)
  const startExtEnrich = async (films, keysOverride = null) => {
    // keysOverride: net opgeslagen sleutels direct gebruiken — de settings-state
    // is op dat moment nog niet bijgewerkt (setState is asynchroon)
    const keys = keysOverride?.length ? keysOverride : omdbKeys;
    if (!keys.length) return;
    const todo = films.filter((f) => metaRef.current[f.key] && !metaRef.current[f.key].ext);
    if (todo.length) runExtQueue(todo, keys);
  };

  const runExtQueue = async (todo, keys) => {
    stopRef.current = false;
    setExtEnrich({ running: true, done: 0, total: todo.length, ok: 0, lastError: null, ranOnce: true });
    let done = 0;
    let gelukt = 0;
    let lastError = null;
    let keyIdx = 0; // gedeeld: bij daglimiet of afgekeurde sleutel roteren alle workers mee
    const queue = [...todo];
    const worker = async () => {
      while (queue.length) {
        if (stopRef.current) return;
        const film = queue.shift();
        try {
          const ratings = await fetchExtRatings(metaRef.current[film.key] || {}, film, keys[keyIdx]);
          setMeta((prev) => (prev[film.key] ? { ...prev, [film.key]: { ...prev[film.key], ext: ratings } } : prev));
          gelukt++;
        } catch (e) {
          if (e.message === 'LIMIT' || e.message === 'KEY_INVALID') {
            queue.unshift(film); // deze film gaat niet verloren
            if (keyIdx < keys.length - 1) {
              keyIdx++;
              continue;
            }
            stopRef.current = true;
            alert(tr(e.message === 'LIMIT' ? 'app.omdbStopLimit' : 'app.omdbStopInvalid', { count: queue.length + 1 }));
            return;
          }
          lastError = e.message || String(e); // zichtbaar maken i.p.v. wegslikken
          // tijdelijke fout: film overslaan, telt wel als verwerkt
        }
        done++;
        setExtEnrich((s) => ({ ...s, done }));
      }
    };
    await Promise.all(Array.from({ length: 3 }, worker));
    setExtEnrich((s) => ({ ...s, running: false, ok: gelukt, lastError }));
    if (gelukt === 0 && done > 0) {
      alert(tr('app.omdbNoScores', { done, err: lastError ? tr('app.omdbLastError', { msg: lastError }) : '' }));
    }
  };

  // Scores horen vanzelf te komen: staan er OMDb-sleutels en zijn er verrijkte
  // films zonder scores, dan start het ophalen bij het openen van de app —
  // geen verstopte knop in Setup nodig.
  useEffect(() => {
    if (!omdbKeys.length || !watchlist.length) return;
    const mist = watchlist.some((f) => meta[f.key] && !meta[f.key].ext);
    if (mist) startExtEnrich(watchlist);
    // bewust één keer per sessie, bij het opstarten
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Streamingaanbod wisselt wekelijks: check het aanbod van je pick opnieuw
  // als de data ouder is dan een dag.
  const freshenProviders = async (filmK) => {
    const m = metaRef.current[filmK];
    const key = tmdbKey;
    if (!m || !key) return;
    if (m.at && Date.now() - m.at < 24 * 3600e3) return;
    try {
      const p = await refreshProviders(m.id, key);
      setMeta((prev) => (prev[filmK] ? { ...prev, [filmK]: { ...prev[filmK], ...p } } : prev));
    } catch { /* stil; oude data blijft staan */ }
  };

  // Garandeert dat een film volledige detaildata heeft (backdrop, trailer,
  // regisseur, streaming) én OMDb-scores — zodat élke tab dezelfde rijke kaart
  // toont. Idempotent en gecachet: doet niks als alles er al is.
  const ensureDetail = async (film) => {
    const key = tmdbKey;
    if (!key || !film?.key) return;
    const cur = metaRef.current[film.key];
    const heeftDetail = cur && cur.at != null && 'trailer' in cur;
    const heeftExt = cur && cur.ext;
    if (heeftDetail && (heeftExt || !omdbKeys.length)) return;
    try {
      let base = cur;
      if (!heeftDetail) {
        base = await resolveFilm(film, key);
        if (!base) return;
      }
      let ext = base.ext;
      if (!ext && omdbKeys.length) {
        for (const k of omdbKeys) {
          try { ext = await fetchExtRatings(base, film, k); if (ext) break; } catch { /* volgende sleutel */ }
        }
      }
      const full = ext ? { ...base, ext } : base;
      setMeta((prev) => ({ ...prev, [film.key]: { ...(prev[film.key] || {}), ...full } }));
    } catch { /* kaart blijft op wat er al was */ }
  };

  // De gebruiker koos handmatig de juiste TMDB-film voor een watchlist-item.
  // We halen de volledige detail + scores op en wissen de mismatch-vlag —
  // geen giswerk meer, jouw keuze is leidend.
  const pickMatch = async (filmKey, tmdbId) => {
    const key = tmdbKey;
    if (!key) return;
    try {
      const d = await fetchDetailById(tmdbId, key);
      if (!d) return;
      delete d.yearMismatch; // handmatig bevestigd → geen twijfel meer
      d.handmatig = true; // en het festivaljaar-herstel blijft eraf
      let ext;
      for (const k of omdbKeys) {
        try { ext = await fetchExtRatings(d, { name: d.title, year: d.year }, k); if (ext) break; } catch { /* volgende sleutel */ }
      }
      const full = ext ? { ...d, ext } : d;
      setMeta((prev) => ({ ...prev, [filmKey]: full }));
    } catch { /* stil; oude data blijft staan */ }
  };

  // Eenmalig herstel van koppelingen aan een obscure naamgenoot door het
  // festivaljaar (Mud 2012 met 1 stem in plaats van Mud 2013). Alleen films
  // met weinig stemmen, rustig op de achtergrond; een netwerkfout stelt het
  // uit tot de volgende sessie.
  const [koppelHerstel, setKoppelHerstel] = useLS('koppelHerstel', 0);
  useEffect(() => {
    const key = tmdbKey;
    if (!key || !metaReady || koppelHerstel >= 1) return undefined;
    const films = new Map();
    [...watchlist, ...mergedRatedFilms, ...watchedFilms].forEach((f) => { if (f?.key && f.name && f.year) films.set(f.key, f); });
    const todo = [...films.values()].filter((f) => {
      const m = meta[f.key];
      return m?.id && (m.votes ?? 0) < FESTIVAL_DREMPEL && !m.handmatig && !ignoredSet.has(f.key);
    });
    if (!todo.length) { setKoppelHerstel(1); return undefined; }
    let stop = false;
    (async () => {
      // eerst de opstart (verrijken, Voor jou) voor laten gaan
      await new Promise((r) => setTimeout(r, 4000));
      for (const f of todo) {
        if (stop) return;
        try {
          const beter = await herstelFestivalJaar(f, metaRef.current[f.key], key);
          if (beter) setMeta((prev) => (prev[f.key] && !prev[f.key].handmatig ? { ...prev, [f.key]: beter } : prev));
        } catch { return; }
        await new Promise((r) => setTimeout(r, 250));
      }
      if (!stop) setKoppelHerstel(1);
    })();
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tmdbKey, metaReady]);

  // En op de achtergrond: per sessie de 80 oudste films stilletjes verversen
  useEffect(() => {
    const key = tmdbKey;
    if (!key || !watchlist.length || !metaReady) return undefined;
    const WEEK = 7 * 24 * 3600e3;
    const stale = watchlist
      .filter((f) => meta[f.key] && (!meta[f.key].at || Date.now() - meta[f.key].at > WEEK))
      .sort((a, b) => (meta[a.key].at || 0) - (meta[b.key].at || 0))
      .slice(0, 80);
    if (!stale.length) return undefined;
    let stop = false;
    (async () => {
      for (const f of stale) {
        if (stop) return;
        try {
          const p = await refreshProviders(meta[f.key].id, key);
          setMeta((prev) => (prev[f.key] ? { ...prev, [f.key]: { ...prev[f.key], ...p } } : prev));
        } catch { return; }
        await new Promise((r) => setTimeout(r, 300));
      }
    })();
    return () => { stop = true; };
    // bewust één keer per sessie, zodra de cache geladen is
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaReady]);

  // Sync tussen je apparaten (lib/sync.js): wat binnenkomt, leest de app
  // opnieuw in. Sleutels die niet hier wonen (bijv. je diensten) lezen hun
  // eigen schermen bij het openen.
  const setters = {
    kaartjes: setKaartjes, ownRatings: setOwnRatings, seen: setSeen, gezienOp: setGezienOp, gezienWeg: setGezienWeg,
    history: setHistory, diary: setDiary, watchlist: setWatchlist, watchedLb: setWatchedLb, watchedFilms: setWatchedFilms,
    ratings: setRatings, ratedFilms: setRatedFilms, lbLists: setLbLists, settings: setSettings, smart: setSmart,
    shortlist: setShortlist, skipped: setSkipped, ignored: setIgnored, smaakModel: setSmaakModel, vondsten: setVondsten,
  };
  const sync = useSync({
    uit: demoMode,
    pasToe: (sleutels) => {
      sleutels.forEach((s) => { const v = leesOpslag(s, null); if (v !== null && setters[s]) setters[s](v); });
      // Een watchlist van een ander apparaat: de filmdata haalt dit apparaat zelf
      if (sleutels.includes('watchlist')) {
        const wl = leesOpslag('watchlist', []);
        setTimeout(() => startEnrichRef.current?.(wl), 500);
      }
    },
  });
  const startEnrichRef = useRef(null);
  startEnrichRef.current = startEnrich;
  // Een koppellink (?sync=CODE) van een ander apparaat: koppelen en de code
  // meteen uit de adresbalk halen
  useEffect(() => {
    const ruw = new URLSearchParams(location.search).get('sync');
    if (!ruw) return;
    const code = normaliseerCode(ruw);
    const p = new URLSearchParams(location.search);
    p.delete('sync');
    window.history.replaceState(null, '', `${location.pathname}${p.toString() ? `?${p}` : ''}${location.hash}`);
    if (code && code !== sync.stand?.code) { sync.koppel(code); setTab('instellingen'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const app = {
    sync,
    settings, setSettings,
    watchlist: watchlist.filter((f) => !ignoredSet.has(f.key)),
    watchlistAll: watchlist,
    setWatchlist,
    watchedLb, setWatchedLb,
    watchedFilms, setWatchedFilms,
    omdbKeys,
    ratings: mergedRatings, setRatings, lbRatings: ratings,
    ratedFilms: mergedRatedFilms, setRatedFilms,
    ownRatings, setOwnRatings,
    kaartjesStand, geefKaartje, kaartjeDoorgeklikt, beantwoordAvond, pasKaartjeAan, scheurAf, vondst, gevondenToevoegen,
    pakBiebStart: () => { const s = biebStartRef.current; biebStartRef.current = null; return s; },
    lbLive, lbBezig, syncLetterboxd,
    diary, setDiary, lbLists, setLbLists,
    seen, seenSet, toggleSeen, markeerGezien, smaakModel, setSmaakModel,
    meta, setMeta,
    history, setHistory,
    shortlist, setShortlist,
    skipped, setSkipped,
    ignored, ignoredSet, ignoreFilm, unignoreFilm,
    smart, setSmart,
    demoMode, setDemoMode,
    resetLibrary,
    enrich, startEnrich, metaReady, tmdbKey, goSetup: () => setTab('instellingen'),
    taste, openSimilar: (film, m) => setSimilarSeed({ film, meta: m }),
    extEnrich, startExtEnrich,
    freshenProviders,
    ensureDetail,
    pickMatch,
    stopEnrich: () => { stopRef.current = true; },
  };

  const needsKey = watchlist.length > 0 && !tmdbKey;

  if (avondCode) return <RemoteVote code={avondCode} />;
  if (samenCode) return <SamenGast code={samenCode} />;

  return (
    <>
    {similarSeed && (
      <SimilarOverlay seed={similarSeed.film} seedMeta={similarSeed.meta || meta[similarSeed.film.key] || {}}
        app={app} onClose={() => setSimilarSeed(null)} />
    )}
    <Shell tab={tab} setTab={setTab}>
      {storageBroken && (
        <div className="notice warn" role="alert" style={{ marginBottom: 18 }}>
          {tr('app.storageBroken')}
        </div>
      )}
      {enrich.running && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--fog)', marginBottom: 6 }}>
            <span>{tr('app.enriching', { done: enrich.done, total: enrich.total })}{enrich.errors ? tr('app.enrichErrCount', { count: enrich.errors }) : ''}</span>
            <button className="btn ghost" style={{ padding: '2px 8px', fontSize: 12 }} onClick={app.stopEnrich}>{tr('app.pause')}</button>
          </div>
          <div className="progressbar"><div style={{ width: `${(enrich.done / Math.max(enrich.total, 1)) * 100}%` }} /></div>
        </div>
      )}
      {demoMode && watchlist.length > 0 && (
        <div className="notice" style={{ marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span dangerouslySetInnerHTML={{ __html: tr('app.demoBanner') }} />
          <button className="btn" style={{ flexShrink: 0 }} onClick={resetLibrary}>{tr('app.demoReset')}</button>
        </div>
      )}
      {!needsKey && watchlist.length > 0 && Object.keys(meta).length > 0 && !omdbKeys.length && !settings.omdbHintWeg && tab !== 'instellingen' && (
        <div className="notice" style={{ marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <ScoresPreview />
            <span>{tr('app.omdbNudge')}<a href="#setup" onClick={(e) => { e.preventDefault(); setTab('instellingen'); }}>{tr('app.omdbNudgeLink')}</a>.</span>
          </div>
          <button className="btn ghost" style={{ flexShrink: 0 }} onClick={() => setSettings((s) => ({ ...s, omdbHintWeg: true }))}>{tr('app.omdbNudgeDismiss')}</button>
        </div>
      )}
      {needsKey && tab !== 'instellingen' && (
        <div className="notice warn" style={{ marginBottom: 18 }}>
          {tr('app.needKeyNotice')}
          <a href="#setup" onClick={(e) => { e.preventDefault(); setTab('instellingen'); }}>{tr('app.setupLink')}</a>.
        </div>
      )}
      {extEnrich.running && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12.5, color: 'var(--fog)', marginBottom: 6 }}>
            {tr('app.omdbBezig', { done: extEnrich.done, total: extEnrich.total })}
          </div>
          <div className="progressbar"><div style={{ width: `${(extEnrich.done / Math.max(extEnrich.total, 1)) * 100}%` }} /></div>
        </div>
      )}
      {/* De vraag na een avond: op het eerste scherm dat je opent, niet alleen bij Pick */}
      {(() => {
        if (tab === 'instellingen' || !watchlist.length) return null;
        const avond = vraagAvond(kaartjesStand.filter((k) => k.bron !== 'gevonden'));
        if (!avond) return null;
        if (vraagLater && vraagLater.id === avond[0].id && Date.now() < vraagLater.tot) return null;
        return (
          <AvondVraag key={avond[0].id} avond={avond} meta={meta}
            onAntwoord={(key, sterren) => beantwoordAvond(avond, key, sterren)}
            onLater={() => setVraagLater({ id: avond[0].id, tot: Date.now() + 12 * 3600e3 })} />
        );
      })()}
      {afgescheurd && <Afgescheurd melding={afgescheurd} onSluit={() => setAfgescheurd(null)} onBekijk={naarDeDoos} />}
      {ontdekt[0] && (
        <Ontdekt key={ontdekt[0].k.id} item={ontdekt[0]} meer={ontdekt.length - 1}
          poster={meta[ontdekt[0].k.key]?.poster || ontdekt[0].k.poster || null}
          onKlaar={() => setOntdekt((q) => q.slice(1))}
          onBekijk={() => { setOntdekt([]); naarDeDoos(); }} />
      )}
      <div className="tabfade" key={tab}>
        {tab === 'pick' && <Pick app={app} />}
        {tab === 'bieb' && <Bieb app={app} />}
        {tab === 'verken' && <Verken app={app} />}
        {tab === 'avond' && <Avond app={app} />}
        {tab === 'inzicht' && <Inzicht app={app} />}
        {tab === 'instellingen' && <Instellingen app={app} />}
      </div>
    </Shell>
    </>
  );
}
