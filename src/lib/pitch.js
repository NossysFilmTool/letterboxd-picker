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
