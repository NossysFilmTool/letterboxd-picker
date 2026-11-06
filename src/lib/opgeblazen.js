// Opgeblazen TMDB-cijfers herkennen: films waar een fanbase (of bots) het
// gemiddelde omhoog trekt, zoals Gabriel's Inferno (8,4) of The Way to the
// Heart (9,9 bij 143 stemmen). Gemeten op 37 goede en 19 verdachte films, en
// getoetst op 235 films die een echte gebruiker 4+ sterren gaf (geen daarvan
// geraakt). Drie signalen:
//   onmogelijk  een 9 of hoger bij minder dan 2000 stemmen
//   lijsten     hoog cijfer, maar nauwelijks in lijsten van TMDB-gebruikers
//               (echte films: log(lijsten)/log(stemmen) 0,66 tot 0,80)
//   streaming   nooit in bioscoop of op festival, hoog cijfer, weinig lijsten
// Kleine arthousefilms hebben ook weinig lijsten, maar geen verdacht hoog
// cijfer; daarom gelden de lijstsignalen pas vanaf 7,5 of 7,8.

export function opgeblazenReden(f) {
  const vote = f?.vote ?? 0;
  const votes = f?.votes ?? 0;
  if (vote >= 9 && votes > 0 && votes < 2000) return 'onmogelijk';
  if (f?.lijsten == null || votes < 100) return null;
  const verhouding = Math.log10(Math.max(1, f.lijsten)) / Math.log10(votes);
  if (vote >= 7.8 && verhouding < 0.6) return 'lijsten';
  if (f.bios === false && vote >= 7.5 && verhouding < 0.7) return 'streaming';
  return null;
}

// Het cijfer waarmee een verdachte film meetelt: het neutrale vertrekpunt
// van de match (zelfde als de prior in taste.js)
export const NEUTRAAL_CIJFER = 6.2;
