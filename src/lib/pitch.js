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
// leestijd voor de logline (een groep leest samen, dus rustig aan).
export const PITCH_MIN = 6000;
export const PITCH_MAX = 11000;
export function pitchDuur(tekst) {
  const woorden = String(tekst || '').split(/\s+/).filter(Boolean).length;
  return Math.max(PITCH_MIN, Math.min(PITCH_MAX, 3200 + woorden * 230));
}

// Het draaiboek van een trailer, in milliseconden vanaf de eerste snit.
// Eerst de akten, zoals in een echte trailer: een shot met de slogan, een
// zwarte kaart "Een film van", een shot met de namen. Dan slaat de titel in
// beeld, en even later schuift de rest eronder: waar hij over gaat, de
// cijfers. Wat een film niet heeft, valt weg; een shot zonder tekst blijft,
// zodat elke trailer met beeld begint.
export const AKTE = { kaart: 1300, met: 1700, shot: 1400 };
export const TITEL_HOUD = 800;
export function sloganDuur(slogan) {
  const woorden = String(slogan || '').split(/\s+/).filter(Boolean).length;
  return Math.max(1900, Math.min(3200, 1100 + woorden * 200));
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
  // Leestijd na het paneel: de oude speelduur min de tijd die het paneel nodig
  // heeft om op te komen
  const totaal = paneel + pitchDuur(tekst) - 1200;
  return { akten, titel, paneel, totaal };
}
