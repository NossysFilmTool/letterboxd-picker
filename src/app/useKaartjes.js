import { useEffect, useMemo, useRef, useState } from 'react';
import { useLS, filmKey } from '../lib/storage.js';
import { onthoudVondst, gevondenKaartjes } from '../lib/vondsten.js';
import { nieuwKaartje, voegKaartjeToe, kaartjesUitGeschiedenis, beoordeelKaartjes, vraagAvond, inDeDoos, AVOND_GAT } from '../lib/kaartjesdoos.js';

// De kaartjesdoos (lib/kaartjesdoos.js): elk kaartje van een pick, de
// vondsten (films die de tool voor je vond), de vraag na een avond, en de
// momenten waarop een kaartje afscheurt.
export function useKaartjes({ bieb, naarArchief }) {
  const { meta, diary, gezienOp, ownRatings, setOwnRatings, history, followups, seenSet, mergedRatings, watchlist, markeerAlsGezien } = bieb;
  const [kaartjes, setKaartjes] = useLS('kaartjes', null);
  // Films die de tool voor je vond (lib/vondsten.js): kijk je ze daarna,
  // dan worden ze een Gevonden-kaartje
  const [vondsten, setVondsten] = useLS('vondsten', {});
  // De vraag na een avond kun je tot later wegleggen: { id, tot }
  const [vraagLater, setVraagLater] = useLS('vraagLater', null);
  // Afgescheurde kaartjes die je al voorbij zag komen (dit apparaat), en de
  // wachtrij van kaartjes die de app zelf als gekeken ontdekte
  const [gemeld, setGemeld] = useLS('kaartjesGemeld', null);
  const [ontdekt, setOntdekt] = useState([]);
  // Het moment dat een kaartje afscheurt: { kaartje, nummer }
  const [afgescheurd, setAfgescheurd] = useState(null);
  // Het archief op een bepaalde tab openen (bijv. vanuit "Bekijk de doos")
  const biebStartRef = useRef(null);

  // Eenmalig bij de start: kaartjes uit de pick-geschiedenis en de antwoorden
  // op de oude "Gekeken?"-vraag
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
  }, [kaartjes, diary, gezienOp, ownRatings, vondsten]);

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

  // Een pick (of de winnaar van Filmavond) levert een kaartje op
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
  // Een vondst onthouden: een film die je in Programma opende, op je shortlist
  // zette of doorklikte. Wat je al zag, beoordeelde of op je lijst had, niet.
  const vondst = (film, opties = {}) => {
    const key = film.key || filmKey(film.title || film.name, film.year || '');
    if (seenSet.has(key) || mergedRatings[key] != null || watchlist.some((f) => f.key === key)) return;
    setVondsten((v) => onthoudVondst(v, { key, id: film.id ?? null, name: film.name || film.title, year: film.year, poster: film.poster }, opties));
  };
  // Het afscheurmoment: het kaartje schuift de doos in, met zijn nummer
  const scheurAf = (kaartje, sterren = null) => {
    setAfgescheurd({ kaartje: { ...kaartje, sterren, poster: kaartje.poster || meta[kaartje.key]?.poster || null }, nummer: inDeDoos(kaartjesStand).length + 1 });
  };
  // Zelf toevoegen vanuit je dagboek: "die vond ik via de tool"
  const gevondenToevoegen = (d) => {
    const k = {
      id: `gevonden|${d.key}`, key: d.key, name: d.name, year: d.year || null, poster: meta[d.key]?.poster || null,
      datum: new Date(`${d.watchedDate}T20:00:00`).toISOString(), bron: 'gevonden', vondst: 'zelf', personen: 1,
      antwoord: 'gekeken', sterren: d.rating ?? null, beantwoord: new Date().toISOString(), bij: Date.now(),
    };
    setKaartjes((l) => [k, ...(l || []).filter((x) => x.id !== k.id)]);
    scheurAf(k, k.sterren);
  };
  const naarDeDoos = () => { biebStartRef.current = 'kaartjes'; setAfgescheurd(null); naarArchief(); };
  // Doorklikken naar een dienst of delen: dit kaartje gaat vooraan in de vraag
  const kaartjeDoorgeklikt = (key) => {
    const nu = Date.now();
    setKaartjes((lijst) => (lijst || []).map((k) => (
      k.key === key && nu - Date.parse(k.datum) < AVOND_GAT && !k.doorgeklikt ? { ...k, doorgeklikt: true, bij: nu } : k
    )));
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

  // De vraag na een avond: welk kaartje heb je gebruikt?
  const vraagNu = (() => {
    if (!watchlist.length) return null;
    const avond = vraagAvond(kaartjesStand.filter((k) => k.bron !== 'gevonden'));
    if (!avond) return null;
    if (vraagLater && vraagLater.id === avond[0].id && Date.now() < vraagLater.tot) return null;
    return avond;
  })();
  const vraag = vraagNu && {
    avond: vraagNu,
    onAntwoord: (key, sterren) => beantwoordAvond(vraagNu, key, sterren),
    onLater: () => setVraagLater({ id: vraagNu[0].id, tot: Date.now() + 12 * 3600e3 }),
  };

  // Alles terug naar het begin; wat al voorbij kwam, begint opnieuw zonder
  // animaties
  const wis = () => {
    setKaartjes([]);
    setVondsten({});
    setVraagLater(null);
    gemeldRef.current = null;
    setGemeld(null);
    setOntdekt([]);
    setAfgescheurd(null);
  };

  return {
    kaartjes, setKaartjes, kaartjesStand, vondsten, setVondsten,
    ontdekt, setOntdekt, afgescheurd, setAfgescheurd, vraag,
    geefKaartje, pasKaartjeAan, vondst, scheurAf, gevondenToevoegen, naarDeDoos, kaartjeDoorgeklikt, beantwoordAvond,
    pakBiebStart: () => { const s = biebStartRef.current; biebStartRef.current = null; return s; },
    wis,
  };
}
