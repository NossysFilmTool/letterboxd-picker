import { useEffect, useState } from 'react';
import { IMG } from './tmdb.js';

// De kleur van de film in beeld ("De zaal", DESIGN.md): uit de poster
// gelezen en omgezet naar een diepe tint waar witte tekst goed leesbaar op
// blijft. Het Vanavond-blok en de filmkaart nemen die kleur aan, zodat elke
// film zijn eigen sfeer krijgt in plaats van één vaste accentkleur.
//
// TMDB's afbeeldingen mogen in een canvas gelezen worden (CORS); we gebruiken
// de kleinste versie (92 px breed) en onthouden de uitkomst per poster.

const STANDAARD = '#3a3632';
const geheugen = new Map();
const OPSLAG = 'nossyV2.filmkleuren';
let opgeslagen = null;
const leesOpslag = () => {
  if (opgeslagen) return opgeslagen;
  try { opgeslagen = JSON.parse(localStorage.getItem(OPSLAG) || '{}'); } catch { opgeslagen = {}; }
  return opgeslagen;
};
const bewaar = (pad, kleur) => {
  const o = leesOpslag();
  o[pad] = kleur;
  const sleutels = Object.keys(o);
  if (sleutels.length > 400) sleutels.slice(0, sleutels.length - 400).forEach((k) => delete o[k]);
  try { localStorage.setItem(OPSLAG, JSON.stringify(o)); } catch { /* vol: alleen in het geheugen */ }
};

// RGB (0-255) naar HSL (0-1) en terug
function naarHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}
function naarRgb(h, s, l) {
  if (s === 0) return [l, l, l].map((v) => Math.round(v * 255));
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const kanaal = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [kanaal(h + 1 / 3), kanaal(h), kanaal(h - 1 / 3)].map((v) => Math.round(v * 255));
}
const hex = (rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

// Uit de pixels van de poster: het gemiddelde, met meer gewicht voor
// verzadigde pixels (anders wint het grijs van tekst en randen), daarna diep
// gemaakt (lichtheid 22-30%) en wat getemperd, zodat witte tekst er altijd
// leesbaar op staat.
export function tintUitPixels(data) {
  let r = 0; let g = 0; let b = 0; let w = 0;
  for (let i = 0; i < data.length; i += 4) {
    const [, s, l] = naarHsl(data[i], data[i + 1], data[i + 2]);
    const gewicht = 0.15 + s * (1 - Math.abs(l - 0.5) * 1.6);
    if (gewicht <= 0) continue;
    r += data[i] * gewicht; g += data[i + 1] * gewicht; b += data[i + 2] * gewicht; w += gewicht;
  }
  if (!w) return STANDAARD;
  const [h, s] = naarHsl(r / w, g / w, b / w);
  return hex(naarRgb(h, Math.min(s, 0.42), 0.26));
}

export function leesFilmkleur(posterPad) {
  if (!posterPad) return Promise.resolve(STANDAARD);
  if (geheugen.has(posterPad)) return Promise.resolve(geheugen.get(posterPad));
  const bewaard = leesOpslag()[posterPad];
  if (bewaard) { geheugen.set(posterPad, bewaard); return Promise.resolve(bewaard); }
  return new Promise((klaar) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = 24; c.height = 36;
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0, 24, 36);
        const kleur = tintUitPixels(x.getImageData(0, 0, 24, 36).data);
        geheugen.set(posterPad, kleur);
        bewaar(posterPad, kleur);
        klaar(kleur);
      } catch { klaar(STANDAARD); }
    };
    img.onerror = () => klaar(STANDAARD);
    img.src = IMG(posterPad, 'w92');
  });
}

// React: de filmkleur van een poster (eerst de standaardtint, dan de echte)
export function useFilmkleur(posterPad) {
  const [kleur, setKleur] = useState(() => geheugen.get(posterPad) || leesOpslag()[posterPad] || STANDAARD);
  useEffect(() => {
    let weg = false;
    leesFilmkleur(posterPad).then((k) => { if (!weg) setKleur(k); });
    return () => { weg = true; };
  }, [posterPad]);
  return kleur;
}
