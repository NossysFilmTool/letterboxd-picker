import { useEffect, useRef, useState } from 'react';
import { opWijziging, leesOpslag, schrijfOpslag } from './storage.js';
import { synchroniseer, wisselCode, kolomVan, vingerafdruk, maakCode, GESYNCTE_SLEUTELS } from './sync.js';

// De sync tussen je apparaten laten lopen (lib/sync.js): bij het openen, als
// je terugkomt naar het tabblad, en een kwartier-minuut na een wijziging. De
// stand van dit apparaat staat los opgeslagen ('sync', zelf niet gesynct).
//   pasToe(sleutels): de app leest die sleutels opnieuw in
//   uit:              tijdelijk niets doen (bijv. in de demo)
const NA_WIJZIGING = 15000;
const MIN_TUSSEN = 60000;

export function useSync({ pasToe, uit = false }) {
  const [stand, setStand] = useState(() => leesOpslag('sync', null));
  const [bezig, setBezig] = useState(false);
  const standRef = useRef(stand);
  const pasToeRef = useRef(pasToe);
  pasToeRef.current = pasToe;
  const bezigRef = useRef(false);
  const timer = useRef(null);
  const uitRef = useRef(uit);
  uitRef.current = uit;

  const bewaar = (s) => {
    standRef.current = s;
    if (s) schrijfOpslag('sync', s); else { try { schrijfOpslag('sync', null); } catch { /* */ } }
    setStand(s);
  };

  // handmatig: ook proberen als de code eerder ingetrokken bleek
  const nu = async (handmatig = false) => {
    const s = standRef.current;
    if (!s?.code || bezigRef.current || uitRef.current) return;
    if (s.fout === 'INGETROKKEN' && !handmatig) return;
    bezigRef.current = true;
    setBezig(true);
    clearTimeout(timer.current);
    try {
      const { staat, toegepast } = await synchroniseer(s.code, { staat: s });
      bewaar({ ...staat, code: s.code });
      if (toegepast.length) pasToeRef.current?.(toegepast);
    } catch (e) {
      bewaar({ ...standRef.current, fout: e.message, laatst: Date.now() });
    } finally {
      bezigRef.current = false;
      setBezig(false);
    }
  };
  const nuRef = useRef(nu);
  nuRef.current = nu;

  // Een wijziging hier: onthoud wanneer, en sync even later
  useEffect(() => opWijziging((sleutel) => {
    const s = standRef.current;
    if (!s?.code || !GESYNCTE_SLEUTELS.includes(sleutel)) return;
    const kol = kolomVan(sleutel);
    const waarde = Object.fromEntries(kol.sleutels.map((k) => [k, leesOpslag(k, null)]));
    if (s.basis?.[kol.naam]?.hash === vingerafdruk(waarde)) return; // net binnengekomen, niets nieuws
    const bijgewerkt = { ...s, gewijzigd: { ...(s.gewijzigd || {}), [kol.naam]: Date.now() } };
    standRef.current = bijgewerkt;
    schrijfOpslag('sync', bijgewerkt);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => nuRef.current(), NA_WIJZIGING);
  }), []);

  // Bij het openen, en als je terugkomt naar dit tabblad
  useEffect(() => {
    const start = setTimeout(() => nuRef.current(), 1500);
    const terug = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - (standRef.current?.laatst || 0) > MIN_TUSSEN) nuRef.current();
    };
    document.addEventListener('visibilitychange', terug);
    return () => { clearTimeout(start); clearTimeout(timer.current); document.removeEventListener('visibilitychange', terug); };
  }, []);

  // Een nieuwe code: de oude trekken we in (zie wisselCode)
  const wissel = async () => {
    const s = standRef.current;
    if (!s?.code || bezigRef.current) return false;
    bezigRef.current = true;
    setBezig(true);
    clearTimeout(timer.current);
    try {
      const { code, staat, toegepast } = await wisselCode(s.code, { staat: s });
      bewaar({ ...staat, code });
      if (toegepast.length) pasToeRef.current?.(toegepast);
      return true;
    } catch (e) {
      bewaar({ ...standRef.current, fout: e.message, laatst: Date.now() });
      return false;
    } finally {
      bezigRef.current = false;
      setBezig(false);
    }
  };

  return {
    stand,
    bezig,
    nu: () => nuRef.current(true),
    wissel,
    // Sync aanzetten met een nieuwe code, of koppelen met een bestaande
    start: () => { bewaar({ code: maakCode(), basis: {}, gewijzigd: {} }); setTimeout(() => nuRef.current(), 0); },
    koppel: (code) => { bewaar({ code, basis: {}, gewijzigd: {} }); setTimeout(() => nuRef.current(), 0); },
    ontkoppel: () => { clearTimeout(timer.current); bewaar(null); },
  };
}
