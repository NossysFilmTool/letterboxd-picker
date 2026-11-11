// Meldingen en vragen in de zaal, in plaats van de pop-ups van de browser
// (alert en confirm). Die zijn grijs, houden alles tegen en horen niet in de
// donkere zaal. Een melding verschijnt bovenin en gaat vanzelf weer weg; een
// vraag is een rustig venster met twee knoppen (DESIGN.md, "Meldingen").
// Het scherm zelf staat in components/Meldingen.jsx.

const luisteraars = new Set();
let teller = 0;
const zend = (m) => { luisteraars.forEach((fn) => fn(m)); };

// Een korte melding. soort: 'info' (gaat na zes seconden weg) of 'fout'
// (blijft langer staan)
export function meld(tekst, { soort = 'info' } = {}) {
  if (!luisteraars.size) { console.info(tekst); return; }
  zend({ id: ++teller, type: 'melding', soort, tekst });
}

// Een vraag met ja of nee, als belofte: const zeker = await bevestig(...)
//   ja / nee: de woorden op de knoppen ("Wis alle data", "Annuleer")
//   gevaar: iets dat niet terug kan; de knop krijgt de waarschuwingskleur en
//   annuleren staat klaar onder je vinger
export function bevestig(tekst, { ja, nee, gevaar = false } = {}) {
  return new Promise((klaar) => {
    if (!luisteraars.size) { klaar(false); return; }
    zend({ id: ++teller, type: 'vraag', tekst, ja, nee, gevaar, klaar });
  });
}

// Tekst om zelf over te nemen, als het klembord niet mag
export function toonTekst(tekst, kopie) {
  return new Promise((klaar) => {
    if (!luisteraars.size) { klaar(); return; }
    zend({ id: ++teller, type: 'vraag', tekst, kopie, alleenSluiten: true, klaar: () => klaar() });
  });
}

export function luister(fn) {
  luisteraars.add(fn);
  return () => { luisteraars.delete(fn); };
}
