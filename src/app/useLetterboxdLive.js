import { useEffect, useRef, useState } from 'react';
import { useLS, leesOpslag } from '../lib/storage.js';
import { haalDagboek, voegDagboekSamen, volgendeLbCheck, LB_MIN_TUSSEN } from '../lib/lbLive.js';
import { verzamelVoorbeelden, leerEnToets } from '../lib/model.js';
import { getRegion } from '../lib/tmdb.js';
import { logFout } from '../lib/foutlog.js';

// Letterboxd live (lib/lbLive.js): je openbare dagboek-feed meelezen. Nieuwe
// logs gaan je dagboek in (kaartjes scheuren dan vanzelf af), tellen als
// gezien, en hun sterren tellen mee in je smaak. Plus: je smaakmodel opnieuw
// laten leren als er genoeg nieuwe sterren bij kwamen.
export function useLetterboxdLive({ settings, bieb, kaartjes }) {
  const {
    diary, setDiary, setWatchedLb, setWatchedFilms, ratings, setRatings, setRatedFilms,
    smaakModel, setSmaakModel, metaReady, metaRef, watchlist, mergedRatedFilms, mergedRatings, seenSet, shortlist, skipped,
  } = bieb;
  const [lbLive, setLbLive] = useLS('lbLive', { at: 0, fout: null, erbij: 0 });
  const [lbBezig, setLbBezig] = useState(false);
  const lbBezigRef = useRef(false); // ook binnen dezelfde render: nooit twee tegelijk
  const [herleren, setHerleren] = useState(false);

  const syncLetterboxd = async (naam = settings.lbNaam) => {
    if (!naam || lbBezigRef.current) return;
    lbBezigRef.current = true;
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
      // smaakmodel (Jaarboek), dan leert dat op de achtergrond opnieuw
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
      logFout('letterboxd', e);
      setLbLive((s) => ({ ...s, at: Date.now(), fout: e.message }));
    }
    lbBezigRef.current = false;
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
      } catch (e) { logFout('smaakmodel', e); } finally {
        if (!weg) setHerleren(false);
      }
    }, 5000);
    return () => { weg = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [herleren, metaReady]);

  // Vanzelf meelezen, zodat het ontdekmoment komt wanneer je het verwacht:
  // meteen bij het openen en als je terugkomt naar dit tabblad (hooguit eens
  // per minuut), en zolang de app openstaat op een slim tempo: elke twee
  // minuten na een pick of vondst van de laatste uren, elke tien minuten als
  // er nog iets openstaat, anders elk half uur (volgendeLbCheck). Een
  // verborgen tabblad kijkt niet. De Worker bewaart de feed een minuut, dus
  // al je apparaten samen vragen Letterboxd hooguit eens per minuut.
  const syncLbRef = useRef(null);
  syncLbRef.current = syncLetterboxd;
  const lbAtRef = useRef(lbLive.at);
  lbAtRef.current = lbLive.at;
  const lbFoutRef = useRef(lbLive.fout);
  lbFoutRef.current = lbLive.fout;
  const lbStandRef = useRef(kaartjes);
  lbStandRef.current = kaartjes;
  const lbHerplanRef = useRef(null);
  useEffect(() => {
    if (!settings.lbNaam) return undefined;
    let timer = null;
    let weg = false;
    const kijk = async () => {
      if (document.visibilityState === 'hidden') return;
      if (Date.now() - (lbAtRef.current || 0) < LB_MIN_TUSSEN) return;
      await syncLbRef.current?.();
    };
    const plan = () => {
      clearTimeout(timer);
      if (weg) return;
      const { kaartjesStand: ks, vondsten: vs } = lbStandRef.current;
      const wacht = volgendeLbCheck({ kaartjes: ks, vondsten: vs, fout: !!lbFoutRef.current });
      timer = setTimeout(async () => { await kijk(); plan(); }, wacht);
    };
    lbHerplanRef.current = plan;
    const terug = () => { kijk(); plan(); };
    kijk();
    plan();
    document.addEventListener('visibilitychange', terug);
    window.addEventListener('focus', terug);
    return () => {
      weg = true;
      clearTimeout(timer);
      lbHerplanRef.current = null;
      document.removeEventListener('visibilitychange', terug);
      window.removeEventListener('focus', terug);
    };
  }, [settings.lbNaam]);
  // Net een pick of vondst: dan meteen het snellere tempo
  useEffect(() => { lbHerplanRef.current?.(); }, [kaartjes.kaartjes, kaartjes.vondsten]);

  const wis = () => setLbLive({ at: 0, fout: null, erbij: 0 });

  return { lbLive, lbBezig, syncLetterboxd, wis };
}
