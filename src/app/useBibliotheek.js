import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLS, useMetaStore } from '../lib/storage.js';
import { volgAanbod } from '../lib/aanbod.js';
import { buildTaste } from '../lib/taste.js';

// Je bibliotheek: wat je wilt zien, wat je zag en beoordeelde, wat je
// wegklikte, en de filmdata (in IndexedDB). Plus wat alle schermen daaruit
// afleiden, één keer per wijziging berekend.
export function useBibliotheek() {
  const [watchlist, setWatchlist] = useLS('watchlist', []);
  const [watchedLb, setWatchedLb] = useLS('watchedLb', []);
  const [watchedFilms, setWatchedFilms] = useLS('watchedFilms', []); // met naam/jaar, voor het archief
  const [ratings, setRatings] = useLS('ratings', {});
  const [ratedFilms, setRatedFilms] = useLS('ratedFilms', []); // uit ratings.csv, ook films buiten je watchlist
  const [seen, setSeen] = useLS('seen', []);
  const [meta, setMetaRuw, metaReady] = useMetaStore();
  // Elke wijziging van de filmdata loopt langs volgAanbod: zo onthouden we
  // sinds wanneer een film op een dienst staat (Net binnen, lib/aanbod.js)
  const setMeta = useCallback((upd) => setMetaRuw((prev) => volgAanbod(prev, typeof upd === 'function' ? upd(prev) : upd)), [setMetaRuw]);
  const metaRef = useRef(meta);
  useEffect(() => { metaRef.current = meta; }, [meta]);
  const [history, setHistory] = useLS('history', []);
  // Eigen sterren (uit de pick-opvolging), los van de Letterboxd-import zodat
  // een her-import ze nooit wegvaagt. Vorm: { key: { rating, name, year, at } }
  const [ownRatings, setOwnRatings] = useLS('ownRatings', {});
  // Uit dezelfde Letterboxd-export: het kijk-dagboek (datums, herkijken) en
  // je eigen thematische lijsten
  const [diary, setDiary] = useLS('diary', []);
  const [lbLists, setLbLists] = useLS('lbLists', []);
  // Antwoorden op "gekeken?"-vragen, per pick-datum: 'rated' | 'seen' | 'no'
  const [followups, setFollowups] = useLS('followups', {});
  // Wanneer je een film als gezien markeerde (bewijs voor een kaartje), en
  // "toch niet gezien", met tijd: zodat de sync weet wat het laatst gold
  const [gezienOp, setGezienOp] = useLS('gezienOp', {});
  const [gezienWeg, setGezienWeg] = useLS('gezienWeg', {});
  const [shortlist, setShortlist] = useLS('shortlist', []);
  const [skipped, setSkipped] = useLS('skipped', []);
  // Het uit jouw beoordelingen geleerde rangschikmodel (Jaarboek)
  const [smaakModel, setSmaakModel] = useLS('smaakModel', null);
  const [ignored, setIgnored] = useLS('ignored', []); // keys van items die geen film zijn (bijv. tv-series)
  const [smart, setSmart] = useLS('smart', false);
  const [demoMode, setDemoMode] = useLS('demoMode', false);

  const seenSet = useMemo(() => new Set([...watchedLb, ...seen]), [watchedLb, seen]);
  // Eigen sterren mengen met de Letterboxd-ratings: het smaakprofiel en alle
  // schermen zien één geheel en leren dus direct van een pick-beoordeling
  const mergedRatings = useMemo(() => ({
    ...ratings,
    ...Object.fromEntries(Object.entries(ownRatings).map(([k, v]) => [k, v.rating])),
  }), [ratings, ownRatings]);
  const mergedRatedFilms = useMemo(() => ([
    ...ratedFilms.filter((f) => !(f.key in ownRatings)),
    ...Object.entries(ownRatings).map(([key, v]) => ({ key, name: v.name, year: v.year, rating: v.rating })),
  ]), [ratedFilms, ownRatings]);
  const taste = useMemo(
    () => buildTaste({ watchlist, ratedFilms: mergedRatedFilms, meta, shortlist, skipped }),
    [watchlist, mergedRatedFilms, meta, shortlist, skipped],
  );
  const ignoredSet = useMemo(() => new Set(ignored), [ignored]);
  // De lijst zonder wat geen film is. Eén keer per wijziging, niet bij elke
  // render: alle schermen rekenen erop (de pot, de hoofdfilm, Voor jou)
  const zichtbareLijst = useMemo(() => watchlist.filter((f) => !ignoredSet.has(f.key)), [watchlist, ignoredSet]);

  const markeerAlsGezien = (key) => {
    setSeen((s) => (s.includes(key) ? s : [...s, key]));
    setGezienOp((g) => ({ ...g, [key]: new Date().toISOString() }));
  };
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
  // Een lijst-item markeren als 'geen film' (bijv. een tv-serie die
  // Letterboxd meesmokkelde): het verdwijnt uit aanbevelingen, Filmavond en
  // de lijst met twijfelgevallen
  const ignoreFilm = (filmKey) => {
    setIgnored((prev) => (prev.includes(filmKey) ? prev : [...prev, filmKey]));
    setMeta((prev) => {
      if (!prev[filmKey]?.yearMismatch) return prev;
      const { yearMismatch, ...rest } = prev[filmKey];
      return { ...prev, [filmKey]: rest };
    });
  };
  const unignoreFilm = (filmKey) => setIgnored((prev) => prev.filter((k) => k !== filmKey));

  // Alles wat van jou is wissen (niet de lijst zelf en niet de filmdata)
  const wisPersoonlijk = () => {
    setWatchedLb([]);
    setWatchedFilms([]);
    setRatings({});
    setRatedFilms([]);
    setOwnRatings({});
    setFollowups({});
    setGezienOp({});
    setGezienWeg({});
    setDiary([]);
    setLbLists([]);
    setSeen([]);
    setHistory([]);
    setShortlist([]);
    setSkipped([]);
    setSmaakModel(null);
    setIgnored([]);
  };

  return {
    watchlist, setWatchlist, zichtbareLijst,
    watchedLb, setWatchedLb, watchedFilms, setWatchedFilms,
    ratings, setRatings, ratedFilms, setRatedFilms, mergedRatings, mergedRatedFilms,
    ownRatings, setOwnRatings,
    seen, setSeen, seenSet, gezienOp, setGezienOp, gezienWeg, setGezienWeg,
    meta, setMeta, metaReady, metaRef,
    history, setHistory, diary, setDiary, lbLists, setLbLists, followups, setFollowups,
    shortlist, setShortlist, skipped, setSkipped,
    smaakModel, setSmaakModel, ignored, setIgnored, ignoredSet,
    smart, setSmart, demoMode, setDemoMode,
    taste,
    markeerAlsGezien, toggleSeen, markeerGezien, ignoreFilm, unignoreFilm,
    wisPersoonlijk,
  };
}
