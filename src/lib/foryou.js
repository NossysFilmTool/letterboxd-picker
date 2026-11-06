// "Voor jou": het vaste rijrecept. Puur en testbaar.
//
// Hooguit zeven rijen, elk met een eigen reden:
//   Top voor jou        de sterkste films uit alle bronnen, kruisbevestigd eerst
//   Nu op je diensten   wat op jouw streamingdiensten staat en bij je past
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
// van de twijfel; TMDB levert ze vrijwel altijd mee. Is de looptijd bekend
// (via de kandidaat-details), dan vallen korte films en segmenten af.
export const degelijk = (f) => (f.votes == null || f.votes >= 50)
  && (f.vote == null || f.vote >= 6)
  && (f.runtime == null || f.runtime >= 40);

// De filters van Voor jou. Looptijd en streamingaanbod komen uit de
// kandidaat-details; zolang die er niet zijn, telt een film niet als passend.
//   dienst: '' (maakt niet uit), '*' (elke dienst), '~mijn' (jouw diensten) of een dienstnaam
export function pastFilter(f, { genre = '', kort = false, dienst = '', mijnDiensten = [] } = {}) {
  if (genre && !(f.genre_ids || []).includes(Number(genre))) return false;
  if (kort && !(f.runtime && f.runtime <= 105)) return false;
  if (dienst === '*' && !f.flat?.length) return false;
  if (dienst === '~mijn' && !f.flat?.some((p) => mijnDiensten.includes(p))) return false;
  if (dienst && dienst !== '*' && dienst !== '~mijn' && !f.flat?.includes(dienst)) return false;
  return true;
}

// Hoeveel minuten er vanavond nog zijn als je nu begint, tot half één.
// Overdag rekenen we met een avond vanaf acht uur (4,5 uur).
export function avondRuimte(nu = new Date()) {
  const u = nu.getHours() + nu.getMinutes() / 60;
  if (u >= 17) return Math.round((24.5 - u) * 60);
  if (u < 0.5) return Math.round((0.5 - u) * 60);
  if (u < 4) return 0;
  return 270;
}

// Vanavond: één film voor nu. Uit de sterkste kandidaten waarvan looptijd en
// aanbod bekend zijn, met voorrang voor wat op jouw diensten staat (of op
// elke dienst als je er geen koos) en wat vanavond nog past.
//   overslaan: id's die je via "Andere" wegklikte
export function kiesVanavond(list, { mijnDiensten = [], nu = new Date(), overslaan = new Set(), max = 40 } = {}) {
  const kandidaten = sorteerOpSterkte(list.filter((f) => degelijk(f) && f.runtime && !overslaan.has(f.id)
    && !alleenApart(f))).slice(0, max);
  if (!kandidaten.length) return null;
  const mijn = new Set(mijnDiensten);
  const ruimte = avondRuimte(nu);
  let best = null;
  kandidaten.forEach((f, i) => {
    const opMijn = !!f.flat?.some((p) => mijn.has(p));
    let s = (f.match ?? 50) - i * 0.5;
    if (opMijn) s += 15;
    else if (f.flat?.length) s += mijn.size ? 4 : 10;
    s += (gedempt(f) - 6.8) * 6;
    if (f.runtime > ruimte) s -= 25;
    if (f.runtime > 150) s -= 6;
    if (!best || s > best.s) best = { f, s };
  });
  return beschrijfVanavond(best.f, { mijnDiensten, nu });
}

// De context van een vanavond-film: waar hij staat en of hij nog past
export function beschrijfVanavond(f, { mijnDiensten = [], nu = new Date() } = {}) {
  const dienst = f.flat?.find((p) => mijnDiensten.includes(p)) || f.flat?.[0] || null;
  return { film: f, dienst, opMijnDienst: !!f.flat?.some((p) => mijnDiensten.includes(p)), past: !!f.runtime && f.runtime <= avondRuimte(nu) };
}

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

// Alleen via een eigen rij, de canon of een prijslijst binnengekomen: niet in
// de gewone rijen (die gaan over jouw smaak, niet over wat beroemd is)
export const alleenApart = (f) => (f.bronnen || []).every((b) => b.startsWith('eigen:') || b === 'canon' || b.startsWith('lijst:'));
// Een klassieker: uit de canon-bron, of een veelgeprezen film met heel veel
// stemmen die via je eigen smaak binnenkwam. Minstens vier jaar oud.
export const KLASSIEK_TOT = (nu = new Date()) => nu.getFullYear() - 4;
export const isKlassieker = (f) => !!f.bronnen?.includes('canon')
  || (!alleenApart(f) && (f.votes || 0) >= 8000 && (f.vote || 0) >= 7.7 && (!f.year || f.year <= KLASSIEK_TOT()));

//   list:       gescoorde kandidaten [{ id, vote, votes, match, waarde, bronnen, seeds, viaTheme, genre_ids }]
//   seedFilms:  je 4,5★+-favorieten [{ key, name }], sterkste eerst
//   regisseurs: namen, sterkste eerst
//   taste:      smaakprofiel (voor "Buiten je bubbel")
export function bouwRecept(list, { seedFilms = [], regisseurs = [], taste = {}, mijnDiensten = [], ronde = 0, dag = dagNummer(), max = 9 } = {}) {
  // Films die alleen via een eigen rij of als klassieker binnenkwamen, horen
  // in die rij en niet in de automatische rijen (anders vult "Koreaanse
  // thrillers" of de canon je Top)
  const pool = list.filter((f) => degelijk(f) && !alleenApart(f));
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
  // een derde van de poel, zodat de andere rijen ook iets overhouden. (Films
  // met meerdere routes gingen eerst voor, maar op een echt profiel voorspelde
  // het aantal routes favorieten juist slecht; die voorrang is eruit.)
  let top = null;
  const topGrootte = Math.min(RAAM, Math.floor(pool.length / 3));
  const topKandidaten = sorteerOpSterkte(pool.filter((f) => gedempt(f) >= 6.8));
  // Spreiding: hooguit 3 films per regisseur of per favoriet, anders is de
  // Top bij een geliefde regisseur alleen nog zijn oeuvre
  const perBron = {};
  const topFilms = [];
  for (const f of topKandidaten) {
    if (topFilms.length >= topGrootte) break;
    const bron = f.bronnen?.find((b) => b.startsWith('oeuvre:')) || (f.seeds?.[0] ? `seed:${f.seeds[0]}` : 'overig');
    if ((perBron[bron] || 0) >= 3 && bron !== 'overig') continue;
    perBron[bron] = (perBron[bron] || 0) + 1;
    topFilms.push(f);
  }
  if (topFilms.length >= 4) {
    topFilms.forEach((f) => gebruikt.add(f.id));
    top = { id: 'top', type: 'top', films: topFilms, past: () => true };
  }

  // 1b. Nu op jouw diensten: wat daar staat (via discover op je diensten, of
  // volgens de details van een aanbeveling) en bij je past
  const mijn = new Set(mijnDiensten);
  const opDienst = (f) => !!(f.bronnen?.includes('dienst') || f.flat?.some((p) => mijn.has(p)));
  const dienst = mijn.size ? maak('dienst', 'dienst', opDienst, { diensten: mijnDiensten }) : null;

  // 2. Twee favorieten, wisselend: alleen favorieten met genoeg eigen films doen mee
  const doorSeed = (naam) => (f) => !!f.seeds?.includes(naam);
  const [seedA, seedB] = draai(seedFilms.filter((s) => genoeg(doorSeed(s.name))), stap * 2, 2);
  const seed1 = seedA ? maak(`seed:${seedA.key}`, 'seed', doorSeed(seedA.name), { naam: seedA.name }) : null;

  // 3. Eén regisseur, wisselend
  const vanRegisseur = (naam) => (f) => !!f.bronnen?.includes(`oeuvre:${naam}`);
  const [dir] = draai(regisseurs.filter((n) => genoeg(vanRegisseur(n))), stap, 1);
  const oeuvre = dir ? maak(`oeuvre:${dir}`, 'oeuvre', vanRegisseur(dir), { naam: dir }) : null;

  // 3b. Klassiekers die je mist: de canon-bron, of een veelgeprezen film die
  // via je favorieten binnenkwam. Hier mogen de canon-films wel in.
  let canon = null;
  const canonFilms = sorteerOpSterkte(list.filter((f) => degelijk(f) && vrij(f) && isKlassieker(f)));
  if (canonFilms.length >= 4) {
    canonFilms.forEach((f) => gebruikt.add(f.id));
    canon = { id: 'canon', type: 'canon', films: canonFilms, past: isKlassieker };
  }

  // 3c. Een prijslijst (Gouden Palm, Oscars, ...), wisselend per dag: de
  // winnaars die je nog niet zag, op jouw smaak gesorteerd
  const uitLijst = (bron) => (f) => !!f.bronnen?.includes(bron);
  const lijstBronnen = [...new Set(list.flatMap((f) => (f.bronnen || []).filter((b) => b.startsWith('lijst:'))))].sort();
  const lijstVrij = (bron) => list.filter((f) => degelijk(f) && vrij(f) && uitLijst(bron)(f));
  const [lijstBron] = draai(lijstBronnen.filter((b) => lijstVrij(b).length >= 4), stap, 1);
  let prijs = null;
  if (lijstBron) {
    const films = sorteerOpSterkte(lijstVrij(lijstBron));
    films.forEach((f) => gebruikt.add(f.id));
    prijs = { id: lijstBron, type: 'lijst', lijst: lijstBron.slice(6), films, past: uitLijst(lijstBron) };
  }

  // 4. Verborgen parels: hoog cijfer, weinig stemmen
  const parels = maak('parels', 'parels', (f) => f.votes != null && f.votes >= 80 && f.votes <= 1500 && (f.vote || 0) >= 7);

  const seed2 = seedB ? maak(`seed:${seedB.key}`, 'seed', doorSeed(seedB.name), { naam: seedB.name }) : null;

  // 5. Gedeelde thema's: alleen films die aantoonbaar (via hun trefwoorden)
  // twee van je thema's delen, of één als je er maar één hebt. Eén los
  // gedeeld trefwoord ("florida") zegt te weinig, tenzij het een sterk thema
  // is: terug te vinden in 4+ films die jij hoog gaf. Het label noemt wat de
  // rij echt deelt.
  const nThemas = (taste.topThemes || []).length;
  const themaMin = Math.min(2, nThemas);
  const sterkeThemas = new Set((taste.topThemes || []).filter((t) => (t.films || 0) >= 4).map((t) => t.name));
  const opThema = (f) => (f.gedeeldeThemas?.length || 0) >= themaMin
    || !!f.gedeeldeThemas?.some((n) => sterkeThemas.has(n));
  const thema = nThemas ? maak('thema', 'thema', opThema) : null;
  if (thema) {
    const tel = {};
    thema.films.forEach((f) => f.gedeeldeThemas.forEach((n) => { tel[n] = (tel[n] || 0) + 1; }));
    thema.themas = Object.entries(tel).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n);
  }

  // 6. Buiten je bubbel: sterk, maar geen van je topgenres en niets wat je mijdt
  const topGenres = new Set(Object.entries(taste.genres || {}).filter(([, w]) => w > 0.4).map(([g]) => g));
  const mijd = new Set(Object.entries(taste.genres || {}).filter(([, w]) => w < -0.35).map(([g]) => g));
  const bubbel = topGenres.size
    ? maak('bubbel', 'bubbel', (f) => {
      const gs = genreNamen(f);
      return gs.length > 0 && !gs.some((g) => topGenres.has(g) || mijd.has(g)) && gedempt(f) >= 6.9;
    })
    : null;

  // De klassiekers en de prijslijst horen naast je persoonlijke rijen, niet in
  // plaats ervan: zonder één persoonlijke rij toont Voor jou de lijst
  if (![top, dienst, seed1, oeuvre, parels, seed2, thema, bubbel].some(Boolean)) return [];
  let rijen = [top, dienst, seed1, canon, oeuvre, prijs, parels, seed2, thema, bubbel].filter(Boolean);
  // Weinig rijen: vul aan met de rest. Zonder één echte rij geven we niets
  // terug; dan toont Voor jou de lijst met uitgebreide kaarten.
  if (rijen.length > 0 && rijen.length < 3) {
    const rest = maak('profiel', 'profiel', () => true);
    if (rest) rijen.push(rest);
  }
  rijen = rijen.slice(0, max);
  return rijen;
}
