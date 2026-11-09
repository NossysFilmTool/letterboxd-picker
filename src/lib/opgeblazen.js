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
//
// Een vierde, mild signaal (november 2026, na The Best of Me in Voor jou):
//   publiek     het TMDB-publiek is milder dan filmliefhebbers: mainstream-
//               romance en young adult. Een 7,2 of hoger bij 1000+ stemmen,
//               maar een lijstverhouding onder 0,66. Gemeten op 31
//               romances en 40 goede films: 8 romances geraakt (The Best of
//               Me, Midnight Sun, Love Rosie, If I Stay), geen goede film.
// Dit is een vermoeden, geen bewijs: het telt alleen met een tweede mening
// (zie beoordeelCijfer), anders verandert er niets.

export function opgeblazenReden(f) {
  const vote = f?.vote ?? 0;
  const votes = f?.votes ?? 0;
  if (vote >= 9 && votes > 0 && votes < 2000) return 'onmogelijk';
  if (f?.lijsten == null || votes < 100) return null;
  const verhouding = Math.log10(Math.max(1, f.lijsten)) / Math.log10(votes);
  if (vote >= 7.8 && verhouding < 0.6) return 'lijsten';
  if (f.bios === false && vote >= 7.5 && verhouding < 0.7) return 'streaming';
  if (votes >= PUBLIEK.stemmen && vote >= PUBLIEK.cijfer && verhouding < PUBLIEK.verhouding) return 'publiek';
  return null;
}
export const PUBLIEK = { cijfer: 7.2, stemmen: 1000, verhouding: 0.66, marge: 0.5 };

// Het cijfer waarmee een verdachte film meetelt als er geen tweede mening
// is: het neutrale vertrekpunt van de match (zelfde als de prior in taste.js)
export const NEUTRAAL_CIJFER = 6.2;

// De tweede mening: het IMDb-cijfer. Zit IMDb minder dan een punt onder het
// TMDB-cijfer, dan is het niet opgeblazen maar gewoon geliefd (bijvoorbeeld
// Latijns-Amerikaanse films waar TMDB-gebruikers hoog voor stemmen). Zit het
// er verder onder, dan rekenen we met IMDb (Gabriel's Inferno III: 8,3 bij
// TMDB, 6,5 bij IMDb). Zonder IMDb blijft het cijfer onbetrouwbaar.
//
// Bij het milde signaal (publiek) telt ook de critici mee: het gemiddelde van
// IMDb en Metacritic (op tien). Ligt dat een halve punt of meer onder TMDB,
// dan rekenen we daarmee (The Best of Me: TMDB 7,5, IMDb 6,7, Metacritic 29,
// dus 4,8). Arthousefilms beschermt dit vanzelf: critici geven die hoog.
// Zonder tweede mening blijft het TMDB-cijfer gewoon staan.
export const IMDB_MARGE = 1;
//   f: { vote, votes, lijsten, bios, imdb?, mc? } (ook in f.ext.imdb / f.ext.mc)
//   reeksVerdacht: een ander deel van dezelfde reeks is opgeblazen
// Geeft { opgeblazen: reden | null, cijfer: het cijfer om mee te rekenen
// (null = onbetrouwbaar), bevestigd: IMDb bevestigde een verdacht cijfer }
export function beoordeelCijfer(f, { reeksVerdacht = false } = {}) {
  const reden = opgeblazenReden(f) || (reeksVerdacht ? 'reeks' : null);
  if (!reden) return { opgeblazen: null, cijfer: f?.vote ?? null, bevestigd: false };
  const imdb = f.imdb ?? f.ext?.imdb ?? null;
  if (reden === 'publiek') {
    if (imdb == null) {
      return reeksVerdacht
        ? { opgeblazen: 'reeks', cijfer: null, bevestigd: false }
        : { opgeblazen: null, cijfer: f.vote ?? null, bevestigd: false };
    }
    const mc = f.mc ?? f.ext?.mc ?? null;
    const tweede = Math.round((mc != null ? (imdb + mc / 10) / 2 : imdb) * 10) / 10;
    if ((f.vote ?? 0) - tweede < PUBLIEK.marge) return { opgeblazen: null, cijfer: f.vote, bevestigd: true };
    return { opgeblazen: reden, cijfer: tweede, bevestigd: false };
  }
  if (imdb == null) return { opgeblazen: reden, cijfer: null, bevestigd: false };
  if ((f.vote ?? 0) - imdb < IMDB_MARGE) return { opgeblazen: null, cijfer: f.vote, bevestigd: true };
  return { opgeblazen: reden, cijfer: imdb, bevestigd: false };
}
