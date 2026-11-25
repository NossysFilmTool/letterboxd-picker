// Aanraders voor de zaalstemming: drie films die niet op de lijst staan maar
// er wel bij passen, binnen het genre van de zaal en de avondfilters.
//
// Waar ze vandaan komen:
//   tafel      de aanbevelingen bij de vijf films die vanavond op tafel
//              liggen. Die koos de zaal net zelf, dus dat weegt het zwaarst.
//   lijst      de aanbevelingen bij de rest van de watchlist: hoe meer films
//              op de lijst een film aanraden, hoe sterker hij staat
//   favoriet   de aanbevelingen bij films die de gastheer 4 of 5 sterren gaf
//   bewaard    wat de gastheer in Verken bewaarde om nog te zien
//   Discover   in hetzelfde genre en binnen dezelfde grenzen: gedragen films
//              (bekend, maar niet de klassiekers die iedereen al zag), parels
//              met weinig stemmen, en wat er op de eigen diensten staat
// Een aanbeveling bovenaan TMDB's lijst telt zwaarder dan onderaan (net als
// in Voor jou), en meer wegen naar dezelfde film is een bevestiging. Wat TMDB
// aanraadt bij films van 2 sterren of minder zakt, net als een film die de
// zaal kort geleden al voorbij zag komen.
//
// Wat eruit gaat: alles wat de gastheer al kent (ook met een net andere
// titel), wat in Voor jou is afgewezen, films zonder poster, en elk
// opgeblazen cijfer (fans of bots, lib/opgeblazen.js) zonder tweede mening
// die het tegenspreekt.
//
// De score, met de volledige filmdata erbij:
//   cijfer       gedempt naar het aantal stemmen: een groep wil zekerheid
//   aanbevolen   hoe sterk, en langs hoeveel wegen
//   zaal         de genres van de uitslag (bij van elk wat gaat een film die
//                ze allebei is voor), en de films op tafel
//   smaak        het smaakprofiel van de gastheer
//   vanavond     een trailer (dat is de pitch), op de eigen diensten, en een
//                lengte die op een avond past
//   bekendheid   een film die vrijwel iedereen al zag, is geen aanrader
// Dan de drie samen: telkens de beste die het minst lijkt op wat er al ligt
// (niet twee van dezelfde regisseur of reeks, liefst andere genres en
// tijden). De laatste plek houdt ruimte voor een parel, als er een goede is.
// Een beetje toeval zorgt dat twee avonden niet hetzelfde aanbieden als het
// verschil klein is.
import { GENRES, discover, fetchDetailById } from './tmdb.js';
import { opgeblazenReden, beoordeelCijfer } from './opgeblazen.js';
import { filterPot, metStandaard } from './avondFilters.js';
import { appScore } from './pick.js';
import { matchScore } from './taste.js';
import { plekGewicht } from './rows.js';
import { maakHerkenner } from './gezien.js';
import { filmKey } from './storage.js';
import { kandidaatVoorSessie } from './samen.js';
import { aanradersMetZaal } from './zaalgasten.js';

// Onder dit aantal TMDB-stemmen is een film een parel
export const PAREL_TOT = 800;
// Vanaf dit aantal TMDB-stemmen heeft vrijwel iedereen hem al gezien
export const IEDEREEN_VANAF = 15000;
// Zo lang zakt een aanrader die de zaal al zag (het ebt geleidelijk weg)
export const GETOOND_DAGEN = 21;
const MIN_CIJFER = 6.6;
const MIN_STEMMEN = 50;
const DAG = 86400e3;

// Genrenamen (zoals in de filmdata) naar TMDB-ids
export function genreIds(namen) {
  return (namen || [])
    .map((n) => GENRES.find((g) => [g.en, g.nl].some((l) => l.toLowerCase() === String(n).toLowerCase()))?.id)
    .filter(Boolean);
}

// Het cijfer waarop een groep kan bouwen: gedempt naar het aantal stemmen,
// zoals IMDb's Top 250. Een 7,4 met 300 stemmen telt als 7,0, een 7,6 met
// 3000 stemmen als 7,5. Onbekend aantal: voorzichtig, als 200.
export function zaalCijfer(vote, votes) {
  const n = votes ?? 200;
  return vote ? (vote * n + 6.5 * 250) / (n + 250) : 6.5;
}

// Boven IEDEREEN_VANAF stemmen een aftrek die oploopt (hooguit 1,2)
export const bekendheid = (votes) => (votes > IEDEREEN_VANAF ? -Math.min(1.2, 0.5 * Math.log2(votes / IEDEREEN_VANAF)) : 0);

// Al eens in de zaal getoond: een aftrek die in GETOOND_DAGEN wegebt
export function eerderGetoond(getoond, id, nu = Date.now()) {
  const t = getoond?.[id];
  if (!t) return 0;
  const dagen = (nu - t) / DAG;
  return dagen >= GETOOND_DAGEN ? 0 : -1.2 * (1 - dagen / GETOOND_DAGEN);
}

// Onthouden wat de zaal te zien kreeg: { id: tijdstip }, hooguit 80 films
// en 60 dagen
export function onthoudGetoond(getoond, ids, nu = Date.now()) {
  const alles = { ...(getoond || {}) };
  ids.forEach((id) => { alles[id] = nu; });
  return Object.fromEntries(Object.entries(alles)
    .filter(([, t]) => nu - t < 60 * DAG)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 80));
}

// De TMDB-ids van de eigen diensten (voor Discover), uit de dienstenlijst
// die Voor jou bewaart: { regio, lijst: [{ id, naam }] }
export function dienstIdsVoor(diensten, dienstenLijst, regio) {
  if (!diensten?.length || dienstenLijst?.regio !== regio) return [];
  return diensten.map((n) => dienstenLijst.lijst?.find((p) => p.naam === n)?.id).filter(Boolean);
}

// Hoe goed genres passen bij de uitslag: elk genre van de uitslag telt naar
// zijn aandeel in de punten (het winnende genre 1). Genres die de uitslag
// niet haalden, sturen niet: wint Fantasy, dan geen voorrang voor een film
// die ook Sci-fi is. Hooguit 1,5.
//   aandeel: Map van genre-id naar 0..1
export function pastBijStemmen(ids, aandeel) {
  return Math.min(1.5, ids.reduce((s, id) => s + (aandeel.get(id) || 0), 0));
}

// Aandeel per genre-id van de uitslag: de punten gedeeld door de hoogste
// (zonder stemmen telt elk genre van de uitslag 1)
function stemAandeel(stemmen, namen) {
  const uit = new Map();
  const telt = (namen || []).map((n) => [n, stemmen?.[n] > 0 ? stemmen[n] : 1]);
  const max = Math.max(1, ...telt.map(([, p]) => p));
  telt.forEach(([naam, p]) => { const id = genreIds([naam])[0]; if (id) uit.set(id, p / max); });
  return uit;
}

// Welk deel van de films op tafel elk genre heeft
function tafelAandeel(tafel, meta) {
  const uit = new Map();
  tafel.forEach((key) => genreIds(meta[key]?.genres).forEach((id) => uit.set(id, (uit.get(id) || 0) + 1 / tafel.length)));
  return uit;
}

const gemiddeld = (ids, aandeel) => (ids.length ? ids.reduce((s, id) => s + (aandeel.get(id) || 0), 0) / ids.length : 0);

// Een kandidaat opnemen of versterken: waarde telt op, elke weg telt één keer
function neemOp(kandidaten, r, waarde, weg) {
  const k = kandidaten.get(r.id) || { ...r, waarde: 0, wegen: new Set(), bronnen: 0, viaLijst: [] };
  k.waarde += waarde;
  if (weg) k.wegen.add(weg);
  if (!k.genre_ids?.length && r.genre_ids?.length) k.genre_ids = r.genre_ids;
  kandidaten.set(r.id, k);
  return k;
}

// Alle kandidaten uit wat de app al weet, zonder netwerk.
//   tafel: keys van de films op tafel; lijst: Set met keys van de watchlist
//   (null: alle filmdata telt als lijst); sterren: { key: rating }
//   bewaard: de bewaarde films uit Verken; isBekend(film): al bekend
// Geeft { kandidaten: Map id -> kandidaat, anti: Map id -> zwaarte }. Een
// kandidaat draagt waarde (hoe sterk aanbevolen), wegen (Set, voor de
// bevestiging), bronnen (hoeveel films op de lijst hem aanraden) en via.
export function verzamelKandidaten({ meta, tafel = [], lijst = null, sterren = {}, bewaard = [], isBekend = () => false }) {
  const kandidaten = new Map();
  const anti = new Map();
  const opTafel = new Set(tafel);
  const voeg = (r, waarde, weg) => (r?.id && !isBekend(r) ? neemOp(kandidaten, r, waarde, weg) : null);
  Object.entries(meta || {}).forEach(([key, m]) => {
    const recs = m?.recs || [];
    if (!recs.length) return;
    const ster = sterren[key];
    // Liever niet: wat TMDB hierbij aanraadt, zakt (1 ster telt dubbel)
    if (ster != null && ster <= 2) {
      recs.forEach((r, i) => { if (r?.id) anti.set(r.id, (anti.get(r.id) || 0) + (3 - ster) * plekGewicht(i, recs.length)); });
      return;
    }
    const tafelFilm = opTafel.has(key);
    const lijstFilm = tafelFilm || (lijst ? lijst.has(key) : true);
    const favoriet = ster >= 4;
    if (!lijstFilm && !favoriet) return;
    recs.forEach((r, i) => {
      const plek = plekGewicht(i, recs.length);
      const w = (tafelFilm ? 1.4 : lijstFilm ? 0.5 : 0) + (favoriet ? 0.9 * (ster - 3) : 0);
      const k = voeg(r, w * plek, tafelFilm || favoriet ? `film:${key}` : null);
      if (k && lijstFilm) {
        k.bronnen += 1;
        if (m.title) k.viaLijst.push({ titel: m.title, gewicht: (tafelFilm ? 10 : 0) + plek });
      }
    });
  });
  bewaard.forEach((b) => voeg({ ...b, bewaard: true }, 1.6, 'bewaard'));
  return { kandidaten, anti };
}

// Bij welke films op de lijst TMDB hem aanraadt: die op tafel eerst, dan de
// sterkste aanbeveling
const viaTitels = (k) => [...new Set([...(k.viaLijst || [])].sort((a, b) => b.gewicht - a.gewicht).map((v) => v.titel))].slice(0, 2);

// Hoe sterk aanbevolen: meer wegen is een bevestiging, en de opbrengst
// vlakt af (tien zwakke aanbevelingen zijn geen tien keer zo goed)
export function aanbevolen(k, anti = 0) {
  let w = k.waarde || 0;
  const wegen = k.wegen?.size || 0;
  if (wegen > 1) w *= 1 + 0.3 * (Math.min(wegen, 4) - 1);
  w /= 1 + anti;
  return 0.8 * Math.log2(1 + w);
}

// Hoeveel twee aanraders op elkaar lijken: een aftrek als ze naast elkaar
// liggen
function lijkt(a, b) {
  let p = 0;
  if (a.m.director && a.m.director === b.m.director) p += 2;
  if (a.m.collectie && a.m.collectie === b.m.collectie) p += 3;
  if (a.m.year && b.m.year && Math.floor(a.m.year / 10) === Math.floor(b.m.year / 10)) p += 0.25;
  const samen = a.genres.filter((g) => b.genres.includes(g)).length;
  const alle = new Set([...a.genres, ...b.genres]).size;
  if (alle) p += 0.6 * (samen / alle);
  if (a.parel && b.parel) p += 0.8;
  return p;
}

// De drie samenstellen: telkens de beste na aftrek voor wat erop lijkt. Bij
// "van elk wat" eerst elk gekozen genre één keer. Op de laatste plek krijgt
// een parel voorrang als er nog geen ligt.
//   rij: [{ s, ruis, m, genres, parel }]; elkWat: genre-ids die elk aan bod moeten
export function stelSamen(rij, aantal = 3, { elkWat = [] } = {}) {
  const gekozen = [];
  const rest = [...rij];
  while (gekozen.length < aantal && rest.length) {
    const laatste = gekozen.length === aantal - 1;
    const geenParel = !gekozen.some((g) => g.parel);
    const open = elkWat.filter((id) => !gekozen.some((g) => g.genres.includes(id)));
    const waarde = (x) => x.s + (x.ruis || 0)
      - gekozen.reduce((p, g) => p + lijkt(x, g), 0)
      - (open.length && !open.some((id) => x.genres.includes(id)) ? 0.8 : 0)
      + (laatste && geenParel && x.parel ? 0.6 : 0);
    let beste = 0;
    rest.forEach((x, i) => { if (waarde(x) > waarde(rest[beste])) beste = i; });
    gekozen.push(rest.splice(beste, 1)[0]);
  }
  return gekozen;
}

// Met beperkte gelijktijdigheid ophalen, mislukte films vallen weg
async function haalAlle(lijst, fn, tegelijk = 6) {
  const uit = new Array(lijst.length).fill(null);
  let i = 0;
  const werker = async () => {
    while (i < lijst.length) {
      const nu = i++;
      try { uit[nu] = await fn(lijst[nu]); } catch { uit[nu] = null; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(tegelijk, lijst.length) }, werker));
  return uit;
}

// Een afwijzing uit Voor jou: een id, of { id, reden, director, collectie }
const afwijzingen = (afgewezen) => {
  const obj = afgewezen.filter((s) => s && typeof s === 'object');
  return {
    ids: new Set(afgewezen.map((s) => (typeof s === 'object' ? s?.id : s)).filter(Boolean)),
    reeksen: new Set(obj.filter((s) => s.collectie && s.reden !== 'gezien').map((s) => s.collectie)),
    regisseurs: new Set(obj.filter((s) => s.reden === 'regisseur').map((s) => s.director).filter(Boolean)),
  };
};

//   genre: { namen, wijze } uit de genreronde; stemmen: { genre: punten }
//   filters: de avondfilters; diensten: namen van de eigen diensten, en
//   dienstIds hun TMDB-ids (voor Discover)
//   uit: { ids, keys } wat al bekend is; tafel: keys van de films op tafel
//   lijst: Set met keys van de watchlist; sterren: { key: rating }
//   smaak: buildTaste-profiel; afgewezen, bewaard: uit Verken en Voor jou
//   getoond: { id: tijdstip } eerder in de zaal; details: de detailcache van
//   Voor jou (daar staat soms het IMDb-cijfer in, als tweede mening)
//   haalDetail, ontdek: de TMDB-aanroepen (te vervangen in tests)
//   zaal: de gasten met Letterboxd (lib/zaalgasten.js): { oordeel(kandidaten)
//   geeft een zaalOordeel, gezienWeg, smaakMee }
// Geeft [{ film: { key, name, year }, m: filmdata, bronnen, via: [titels], parel }]
export async function zoekAanraders({
  sleutel, meta, genre, filters, diensten = [], dienstIds = [], uit, smaak = null, aantal = 3,
  stemmen = null, tafel = [], lijst = null, sterren = {}, afgewezen = [], bewaard = [], getoond = {}, details = {},
  nu = Date.now(), rnd = Math.random, haalDetail = fetchDetailById, ontdek = discover, zaal = null,
}) {
  const namen = genre?.wijze === 'alles' ? [] : (genre?.namen || []);
  const ids = genreIds(namen);
  const alle = genre?.wijze === 'allebei' || genre?.wijze === 'ook';
  const pastGenre = (g) => !ids.length || (alle ? ids.every((id) => g.includes(id)) : ids.some((id) => g.includes(id)));
  const bekendeKeys = uit?.keys || new Set();
  const bekendeIds = uit?.ids || new Set();
  const herken = maakHerkenner([...bekendeKeys]);
  const weg = afwijzingen(afgewezen || []);
  const isBekend = (r) => bekendeIds.has(r.id) || weg.ids.has(r.id) || bekendeKeys.has(filmKey(r.title, r.year)) || herken(r);

  const { kandidaten, anti } = verzamelKandidaten({ meta, tafel, lijst, sterren, bewaard, isBekend });

  // Aanvullen met Discover, binnen dezelfde grenzen als de avond
  const f = metStandaard(filters);
  const grenzen = {
    genreIds: ids.length ? [ids.join(alle ? ',' : '|')] : undefined,
    yearFrom: f.jaarVan || undefined,
    yearTo: f.jaarTot || undefined,
    maxRuntime: f.maxDuur || undefined,
    minRuntime: f.geenKort ? 40 : undefined,
    lang: f.taal === 'en' ? 'en' : f.taal === 'anders' ? 'niet-en' : undefined,
  };
  const zoek = async (extra) => {
    try { return (await ontdek(sleutel, { ...grenzen, ...extra }))?.results || []; } catch { return []; }
  };
  const [gedragen, parels, opDienst] = await Promise.all([
    // Gedragen: hoog gewaardeerd en bekend genoeg, maar niet de klassiekers
    // die iedereen al zag (die staan anders bovenaan)
    zoek({ minScore: 7, minVotes: PAREL_TOT, maxVotes: IEDEREEN_VANAF, sortBy: 'vote_average.desc', page: 1 + Math.floor(rnd() * 3) }),
    // Parels: de meest gestemde onder de weinig bekende. Gesorteerd op cijfer
    // zou de top vol staan met films waar een kleine fanclub 9's geeft.
    zoek({ minScore: 7.3, minVotes: 150, maxVotes: PAREL_TOT, sortBy: 'vote_count.desc', page: 1 + Math.floor(rnd() * 2) }),
    // Vanavond te zien: wat er op de eigen diensten staat
    dienstIds.length
      ? zoek({ providerIds: dienstIds, minScore: 6.8, minVotes: 300, sortBy: 'vote_average.desc', page: 1 + Math.floor(rnd() * 2) })
      : [],
  ]);
  const ontdekt = (lijstje, waarde, wegNaam) => lijstje.forEach((r) => {
    if (r?.id && !isBekend(r)) neemOp(kandidaten, r, waarde, wegNaam);
  });
  ontdekt(gedragen, 0.5, null);
  ontdekt(parels, 0.4, null);
  ontdekt(opDienst, 0.6, 'dienst');

  // Wat de zaal wil: de genrestemming en de films op tafel
  const stemDeel = stemAandeel(stemmen, namen);
  const tafelDeel = tafelAandeel(tafel, meta || {});

  // Een voorselectie op wat we al weten, dan de volledige filmdata ophalen.
  // De smaak telt hier half: zonder trefwoorden is de match nog grof.
  const smaakVan = (film, vote, deel) => (smaak ? (matchScore({ ...film, vote }, smaak).score - 50) / deel : 0);
  const voor = [...kandidaten.values()]
    .filter((k) => k.bewaard || ((k.votes || 0) >= MIN_STEMMEN && (k.vote || 0) >= MIN_CIJFER))
    .filter((k) => !k.genre_ids?.length || pastGenre(k.genre_ids))
    .map((k) => {
      const g = k.genre_ids || [];
      const v = zaalCijfer(k.vote, k.votes) + aanbevolen(k, anti.get(k.id)) + 0.5 * pastBijStemmen(g, stemDeel)
        + 0.5 * gemiddeld(g, tafelDeel) + smaakVan(k, k.vote, 60) + bekendheid(k.votes) + eerderGetoond(getoond, k.id, nu) + rnd() * 0.4;
      return { k, v };
    })
    .sort((a, b) => b.v - a.v);
  const isParel = (k) => k.votes != null && k.votes < PAREL_TOT;
  const breed = voor.filter((x) => !isParel(x.k)).map((x) => x.k);
  const klein = voor.filter((x) => isParel(x.k)).map((x) => x.k);

  // De volledige score, met de filmdata
  const mijn = new Set(diensten);
  const beoordeel = ({ k, m }) => {
    if (!m?.id || !m.poster) return null;
    if (isBekend({ id: m.id, title: m.title, year: m.year })) return null;
    const genres = genreIds(m.genres);
    if (genres.length ? !pastGenre(genres) : ids.length) return null;
    if (m.collectie && weg.reeksen.has(m.collectie)) return null;
    // Een verdacht cijfer telt alleen met een tweede mening (IMDb) die het
    // tegenspreekt of een lager cijfer geeft om mee te rekenen
    let cijfer = m.vote ?? 0;
    if (opgeblazenReden(m)) {
      const d = details?.[m.id];
      if (d?.imdb == null) return null;
      const oordeel = beoordeelCijfer({ ...m, imdb: d.imdb, mc: d.mc });
      if (oordeel.cijfer == null) return null;
      cijfer = oordeel.cijfer;
    }
    if (cijfer < MIN_CIJFER) return null;
    if (filterPot([{ key: 'k', year: m.year }], { k: m }, filters, appScore, { diensten }).length !== 1) return null;
    const looptijd = !m.runtime ? 0 : m.runtime < 80 ? -0.3 : m.runtime > 150 ? -0.5 : m.runtime > 135 ? -0.2 : 0;
    const vanavond = (m.trailer ? 0.3 : -1.5)
      + (m.flat?.some((p) => mijn.has(p)) ? 0.5 : m.flat?.length ? 0.15 : 0)
      + looptijd;
    const s = zaalCijfer(cijfer, m.votes) + aanbevolen(k, anti.get(k.id))
      + 0.5 * pastBijStemmen(genres, stemDeel) + 0.5 * gemiddeld(genres, tafelDeel)
      + smaakVan(m, cijfer, 30) + vanavond + bekendheid(m.votes)
      + eerderGetoond(getoond, m.id, nu)
      - (m.director && weg.regisseurs.has(m.director) ? 1.5 : 0);
    const key = filmKey(m.title, m.year);
    return {
      film: { key, name: m.title, year: m.year }, m, bronnen: k.bronnen || 0, via: viaTitels(k),
      parel: (m.votes || 0) < PAREL_TOT, genres, s,
    };
  };
  const haal = async (lijstje) => (await haalAlle(lijstje, async (k) => ({ k, m: await haalDetail(k.id, sleutel) })))
    .map((d) => (d ? beoordeel(d) : null))
    .filter(Boolean);

  // Eerst de sterkste; vallen er te veel af, dan een tweede ronde
  let rij = await haal([...breed.slice(0, 8), ...klein.slice(0, 4)]);
  if (rij.length < aantal + 2) {
    const meer = [...breed.slice(8, 14), ...klein.slice(4, 6)];
    if (meer.length) rij = [...rij, ...(await haal(meer))];
  }
  rij = rij.filter((x, i) => rij.findIndex((y) => y.film.key === x.film.key) === i);

  // De gasten kijken mee: wat iemand al zag zakt weg, hun smaak telt mee
  if (zaal?.oordeel && rij.length) {
    try {
      const oordeel = await zaal.oordeel(rij.map((x) => kandidaatVoorSessie(x.film, x.m)));
      rij = aanradersMetZaal(rij, oordeel, { gezienWeg: zaal.gezienWeg !== false, smaakMee: zaal.smaakMee !== false, aantal });
    } catch { /* dan zonder de gasten */ }
  }

  // Een beetje toeval (Gumbel): bij een klein verschil wisselt de volgorde
  // weleens, bij een groot verschil niet
  rij.forEach((x) => { x.ruis = -0.3 * Math.log(-Math.log(0.01 + 0.98 * rnd())); });
  const gekozen = stelSamen(rij, aantal, { elkWat: genre?.wijze === 'elkWat' ? ids : [] });
  return gekozen.map(({ film, m, bronnen, via, parel }) => ({ film, m, bronnen, via, parel }));
}
