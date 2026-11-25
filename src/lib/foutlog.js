// Een klein logboek van wat er misging, alleen op dit apparaat.
//
// Veel werk gebeurt stil op de achtergrond (filmdata ophalen, Voor jou,
// sync, Letterboxd live). Mislukt daar iets, dan gaat de tool gewoon door,
// maar zonder logboek zie je nooit wát er misging. Hier komt het terecht:
// de laatste paar tientallen meldingen, te zien en te wissen onder Setup.
//
// Niets hiervan verlaat het apparaat: niet naar een server, niet in een
// back-up, niet in de sync. Sleutels, tokens en codes halen we eruit voordat
// iets bewaard wordt.
import { useSyncExternalStore } from 'react';
import { leesOpslagRuw, schrijfOpslag } from './storage.js';

const SLEUTEL = 'foutlog';
const MAX = 60;
const SAMEN = 60e3; // dezelfde melding binnen een minuut telt op in plaats van een nieuwe regel

// Wat er nooit in het logboek mag: sleutels in adressen, lange codes
export function schoon(tekst) {
  return String(tekst || '')
    .replace(/(api_?key|apikey|token|code|sync|key)=([^&\s]+)/gi, '$1=…')
    .replace(/\b[a-f0-9]{32,}\b/gi, '…')
    .replace(/\b[A-Z0-9]{5}(-[A-Z0-9]{5}){2,}\b/g, '…')
    .slice(0, 300);
}

const luisteraars = new Set();
// Opnieuw lezen alleen als de opslag echt veranderde (ook door een ander
// tabblad); anders dezelfde lijst, zodat React niet blijft hertekenen
let cacheRuw;
let cache = [];
const lees = () => {
  const ruw = leesOpslagRuw(SLEUTEL);
  if (ruw !== cacheRuw) {
    cacheRuw = ruw;
    try { const l = ruw ? JSON.parse(ruw) : []; cache = Array.isArray(l) ? l : []; } catch { cache = []; }
  }
  return cache;
};
const zet = (lijst) => {
  schrijfOpslag(SLEUTEL, lijst);
  luisteraars.forEach((fn) => { try { fn(); } catch { /* een luisteraar mag het loggen niet breken */ } });
};

// bron: waar het gebeurde ('filmdata', 'sync', 'voorjou', ...); fout: een
// Error of een tekst
export function logFout(bron, fout) {
  try {
    const tekst = schoon(fout?.message || fout);
    if (!tekst) return;
    const nu = Date.now();
    const lijst = lees();
    const laatste = lijst[lijst.length - 1];
    if (laatste && laatste.bron === bron && laatste.tekst === tekst && nu - laatste.at < SAMEN) {
      zet([...lijst.slice(0, -1), { ...laatste, at: nu, n: (laatste.n || 1) + 1 }]);
      return;
    }
    zet([...lijst, { at: nu, bron: String(bron), tekst }].slice(-MAX));
  } catch { /* loggen mag nooit zelf iets breken */ }
}

export function wisFoutlog() { zet([]); }

const abonneer = (fn) => { luisteraars.add(fn); return () => luisteraars.delete(fn); };
export function useFoutlog() {
  return useSyncExternalStore(abonneer, lees, lees);
}

// Wat nergens werd opgevangen (een fout in een knop, een vergeten belofte)
let gevangen = false;
export function vangOnopgevangen() {
  if (gevangen || typeof window === 'undefined') return;
  gevangen = true;
  window.addEventListener('error', (e) => logFout('app', e.error || e.message));
  window.addEventListener('unhandledrejection', (e) => logFout('app', e.reason));
}
