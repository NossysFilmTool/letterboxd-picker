// "Voor jou": het vaste rijrecept. Puur en testbaar.
//
// Hooguit zes rijen, elk met een eigen reden:
//   Top voor jou        de sterkste films uit alle bronnen
//   Omdat je X ...      twee van je favorieten, wisselend per dag
//   Meer van Y          één regisseur achter je favorieten, wisselend per dag
//   Verborgen parels    goed beoordeeld, weinig stemmen
//   Deelt Z ...         je terugkerende thema's
//   Buiten je bubbel    sterk, maar buiten je vaste genres
// Een film staat in hooguit één rij; het scherm toont de eerste RAAM films.
// Elke rij draagt ook zijn reden als filter (`past`), zodat "Alles bekijken"
// live álle films met die reden kan tonen, ook die in een andere rij staan.
import { GENRES } from './tmdb.js';
import { sorteerOpSterkte } from './rows.js';

const GENRE_EN = Object.fromEntries(GENRES.map((g) => [g.id, g.en]));
export const RAAM = 12;

// Bayesiaans gedempte score, zelfde prior als matchScore: een 9 met 12
// stemmen is geen 9.
export const gedempt = (f) => {
  if (!f.vote) return 6.2;
  const n = f.votes ?? 60;
  return (f.vote * n + 6.2 * 120) / (n + 120);
};

// Kwaliteitsdrempel voor alle rijen. Onbekende waarden geven we het voordeel
// van de twijfel; TMDB levert ze vrijwel altijd mee.
export const degelijk = (f) => (f.votes == null || f.votes >= 50) && (f.vote == null || f.vote >= 6);

// Dagnummer: welke favorieten en regisseurs een rij krijgen wisselt per dag
// (en per klik op "Andere suggesties"), maar verspringt niet bij elke render.
export const dagNummer = (nu = Date.now()) => Math.floor(nu / 86400000);

const draai = (lijst, start, n) => {
  if (!lijst.length) return [];
  const uit = [];
  for (let i = 0; i < Math.min(n, lijst.length); i++) uit.push(lijst[(start + i) % lijst.length]);
  return uit;
};

const genreNamen = (f) => (f.genre_ids || []).map((id) => GENRE_EN[id]).filter(Boolean);

//   list:       gescoorde kandidaten [{ id, vote, votes, match, waarde, bronnen, seeds, viaTheme, genre_ids }]
//   seedFilms:  je 4,5★+-favorieten [{ key, name }], sterkste eerst
//   regisseurs: namen, sterkste eerst
//   taste:      smaakprofiel (voor "Buiten je bubbel")
export function bouwRecept(list, { seedFilms = [], regisseurs = [], taste = {}, ronde = 0, dag = dagNummer(), max = 6 } = {}) {
  const pool = list.filter(degelijk);
  const gebruikt = new Set();
  const vrij = (f) => !gebruikt.has(f.id);
  const maak = (id, type, past, extra = {}, min = 4) => {
    const sorted = sorteerOpSterkte(pool.filter((f) => vrij(f) && past(f)));
    if (sorted.length < min) return null;
    sorted.forEach((f) => gebruikt.add(f.id));
    return { id, type, films: sorted, past, ...extra };
  };
  const genoeg = (past) => pool.filter((f) => vrij(f) && past(f)).length >= 4;
  const stap = dag + ronde;

  // 1. Top voor jou: de sterkste films, met een strengere kwaliteitslat. Hooguit
  // een derde van de poel, zodat de andere rijen ook iets overhouden.
  let top = null;
  const topGrootte = Math.min(RAAM, Math.floor(pool.length / 3));
  const topFilms = sorteerOpSterkte(pool.filter((f) => gedempt(f) >= 6.8)).slice(0, topGrootte);
  if (topFilms.length >= 4) {
    topFilms.forEach((f) => gebruikt.add(f.id));
    top = { id: 'top', type: 'top', films: topFilms, past: () => true };
  }

  // 2. Twee favorieten, wisselend: alleen favorieten met genoeg eigen films doen mee
  const doorSeed = (naam) => (f) => !!f.seeds?.includes(naam);
  const [seedA, seedB] = draai(seedFilms.filter((s) => genoeg(doorSeed(s.name))), stap * 2, 2);
  const seed1 = seedA ? maak(`seed:${seedA.key}`, 'seed', doorSeed(seedA.name), { naam: seedA.name }) : null;

  // 3. Eén regisseur, wisselend
  const vanRegisseur = (naam) => (f) => !!f.bronnen?.includes(`oeuvre:${naam}`);
  const [dir] = draai(regisseurs.filter((n) => genoeg(vanRegisseur(n))), stap, 1);
  const oeuvre = dir ? maak(`oeuvre:${dir}`, 'oeuvre', vanRegisseur(dir), { naam: dir }) : null;

  // 4. Verborgen parels: hoog cijfer, weinig stemmen
  const parels = maak('parels', 'parels', (f) => f.votes != null && f.votes >= 80 && f.votes <= 1500 && (f.vote || 0) >= 7);

  const seed2 = seedB ? maak(`seed:${seedB.key}`, 'seed', doorSeed(seedB.name), { naam: seedB.name }) : null;

  // 5. Gedeelde thema's
  const opThema = (f) => !!(f.bronnen?.includes('thema') || f.viaTheme?.length);
  const themas = [...new Set(pool.filter(opThema).flatMap((f) => f.viaTheme || []))].slice(0, 3);
  const thema = maak('thema', 'thema', opThema, { themas });

  // 6. Buiten je bubbel: sterk, maar geen van je topgenres en niets wat je mijdt
  const topGenres = new Set(Object.entries(taste.genres || {}).filter(([, w]) => w > 0.4).map(([g]) => g));
  const mijd = new Set(Object.entries(taste.genres || {}).filter(([, w]) => w < -0.35).map(([g]) => g));
  const bubbel = topGenres.size
    ? maak('bubbel', 'bubbel', (f) => {
      const gs = genreNamen(f);
      return gs.length > 0 && !gs.some((g) => topGenres.has(g) || mijd.has(g)) && gedempt(f) >= 6.9;
    })
    : null;

  let rijen = [top, seed1, oeuvre, parels, seed2, thema, bubbel].filter(Boolean);
  // Weinig rijen: vul aan met de rest. Zonder één echte rij geven we niets
  // terug; dan toont Voor jou de lijst met uitgebreide kaarten.
  if (rijen.length > 0 && rijen.length < 3) {
    const rest = maak('profiel', 'profiel', () => true);
    if (rest) rijen.push(rest);
  }
  rijen = rijen.slice(0, max);
  return rijen;
}
