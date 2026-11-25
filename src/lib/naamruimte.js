// De naamruimte van alle opslag op dit apparaat: localStorage-sleutels
// ('picker.watchlist', 'picker.p.Sam.settings') en de IndexedDB met de
// filmdata ('picker', 'picker-p-Sam'). Bewust een neutrale naam, los van de
// merknaam (lib/merk.js): die mag veranderen zonder dat je gegevens moeten
// verhuizen.
//
// Tot versie 6 heette alles 'nossyV2'. De eerste keer dat deze versie opent,
// verhuizen de sleutels één keer (hieronder, vóór iets anders de opslag
// leest); de filmdata verhuist bij het openen van de database (lib/idb.js).
export const NS = 'picker';
export const OUD_NS = 'nossyV2';

// Elke oude sleutel naar de nieuwe naam. Eerst weghalen en dan pas
// schrijven, zodat een volle opslag nooit twee kopieën hoeft te dragen. Wat
// onder de nieuwe naam al bestaat (een tabblad dat al verhuisde), wint.
export function verhuisOpslag(ls) {
  try {
    const opslag = ls || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!opslag) return 0;
    const oud = [];
    for (let i = 0; i < opslag.length; i++) {
      const k = opslag.key(i);
      if (k && k.startsWith(`${OUD_NS}.`)) oud.push(k);
    }
    let n = 0;
    for (const k of oud) {
      const nieuw = `${NS}.${k.slice(OUD_NS.length + 1)}`;
      const v = opslag.getItem(k);
      opslag.removeItem(k);
      if (v === null || opslag.getItem(nieuw) !== null) continue;
      try { opslag.setItem(nieuw, v); n++; } catch { /* vol: dan begint deze sleutel leeg */ }
    }
    return n;
  } catch { return 0; }
}

verhuisOpslag();
