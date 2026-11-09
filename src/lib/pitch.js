// De trailers voor een veto-ronde (components/Pitch.jsx): elke film krijgt
// een korte pitch. Hier de rekenregels, los van het scherm, zodat ze te toetsen
// zijn.

// Waar de film over gaat, in een paar zinnen: hele zinnen tot er genoeg staat,
// nooit langer dan max tekens. Is de eerste zin al te lang, dan afgebroken
// op een woord met een beletselteken.
export function logline(plot, { genoeg = 110, max = 190 } = {}) {
  const tekst = String(plot || '').replace(/\s+/g, ' ').trim();
  if (!tekst) return '';
  if (tekst.length <= max) return tekst;
  const zinnen = tekst.match(/[^.!?]+[.!?]+["'”’)]*\s*/g) || [];
  let uit = '';
  for (const z of zinnen) {
    if ((uit + z).trim().length > max) break;
    uit += z;
    if (uit.trim().length >= genoeg) break;
  }
  if (uit.trim()) return uit.trim();
  const kort = tekst.slice(0, max - 1).replace(/[\s,;:]+\S*$/, '');
  return `${kort}…`;
}

// Hoe lang een trailer in beeld blijft: tijd voor titel en cijfers, plus
// leestijd voor de logline. Een groep leest samen op een scherm, dus rustig
// aan: zo'n 320 ms per woord, en nooit korter dan 8 seconden.
export const PITCH_MIN = 8000;
export const PITCH_MAX = 16000;
export function pitchDuur(tekst) {
  const woorden = String(tekst || '').split(/\s+/).filter(Boolean).length;
  return Math.max(PITCH_MIN, Math.min(PITCH_MAX, 4000 + woorden * 320));
}

// Het draaiboek van een trailer, in milliseconden vanaf de eerste snit.
// Eerst de akten, zoals in een echte trailer: een shot met de slogan, een
// zwarte kaart "Een film van", een shot met de namen. Dan slaat de titel in
// beeld, en even later schuift de rest eronder: waar hij over gaat, de
// cijfers. Wat een film niet heeft, valt weg; een shot zonder tekst blijft,
// zodat elke trailer met beeld begint. Elke kaart blijft lang genoeg staan
// om hem hardop voor te lezen.
export const AKTE = { kaart: 2300, met: 3000, shot: 2000 };
export const TITEL_HOUD = 1400;
export function sloganDuur(slogan) {
  const woorden = String(slogan || '').split(/\s+/).filter(Boolean).length;
  return Math.max(3000, Math.min(6000, 1600 + woorden * 300));
}
export function trailerPlan({ slogan, regie, cast, tekst } = {}) {
  const akten = [];
  let t = 0;
  const zet = (soort, duur) => { akten.push({ soort, start: t, duur }); t += duur; };
  if (slogan) zet('slogan', sloganDuur(slogan)); else zet('shot', AKTE.shot);
  if (regie) zet('van', AKTE.kaart);
  if (cast?.length) zet('met', AKTE.met);
  const titel = t;
  const paneel = titel + TITEL_HOUD;
  // Daarna de leestijd voor het verhaal, de namen en de cijfers
  const totaal = paneel + pitchDuur(tekst);
  return { akten, titel, paneel, totaal };
}
