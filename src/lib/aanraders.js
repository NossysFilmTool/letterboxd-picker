// Aanraders voor de zaalstemming: drie films die niet op de lijst staan maar
// er wel bij passen, binnen hetzelfde genre en dezelfde avondfilters.
//
// Waar ze vandaan komen:
//   1. De aanbevelingen die TMDB al gaf bij de films op je lijst (ze zitten
//      in de filmdata). Hoe meer films op je lijst een film aanraden, hoe
//      sterker hij staat: dat herkent de app als een echte aanrader.
//   2. TMDB Discover in hetzelfde genre, met dezelfde grenzen (lengte, taal,
//      periode): goed gewaardeerde bekende films, en een paar parels met
//      weinig stemmen.
// Wat eruit gaat: alles wat je al hebt (lijst, gezien, beoordeeld), films
// zonder poster, en elk opgeblazen cijfer (fans of bots, lib/opgeblazen.js).
// Van wat overblijft, wegen cijfer, je smaakprofiel en het aantal aanbevelers.
// Twee plekken gaan naar de sterkste; de derde is een loterij waarin een
// parel dubbel kans maakt, zodat er af en toe een obscure film tussen zit.
import { GENRES, discover, fetchDetailById } from './tmdb.js';
import { opgeblazenReden } from './opgeblazen.js';
import { filterPot, metStandaard } from './avondFilters.js';
import { nossyScore } from './pick.js';
import { scoorKandidaten, kandidaatVoorSessie } from './samen.js';
import { filmKey } from './storage.js';

// Onder dit aantal TMDB-stemmen is een film een parel
export const PAREL_TOT = 800;

// Genrenamen (zoals in de filmdata) naar TMDB-ids
export function genreIds(namen) {
  return (namen || [])
    .map((n) => GENRES.find((g) => [g.en, g.nl].some((l) => l.toLowerCase() === String(n).toLowerCase()))?.id)
    .filter(Boolean);
}

// De aanbevelingen bij je eigen films, geteld: { id, title, ..., bronnen }
//   alle: de film moet alle genres hebben (bij "allebei"), anders één ervan
//   uit: { ids: Set van TMDB-ids, keys: Set van filmKeys } die al bekend zijn
export function uitDeAanbevelingen(meta, { ids = [], alle = false } = {}, uit = { ids: new Set(), keys: new Set() }) {
  const per = new Map();
  Object.values(meta || {}).forEach((m) => (m?.recs || []).forEach((r) => {
    if (!r?.id || uit.ids.has(r.id) || uit.keys.has(filmKey(r.title, r.year))) return;
    const g = r.genre_ids || [];
    if (ids.length && !(alle ? ids.every((id) => g.includes(id)) : ids.some((id) => g.includes(id)))) return;
    const k = per.get(r.id) || { ...r, bronnen: 0, via: [] };
    k.bronnen += 1;
    if (m.title && !k.via.includes(m.title)) k.via.push(m.title);
    per.set(r.id, k);
  }));
  return [...per.values()];
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

//   genre: { namen, wijze } uit de genreronde; filters: de avondfilters
//   uit: wat al bekend is; smaak: buildTaste-profiel (mag ontbreken)
//   haalDetail, ontdek: de TMDB-aanroepen (te vervangen in tests)
// Geeft [{ film: { key, name, year }, m: filmdata, bronnen, via: [titels], parel }]
export async function zoekAanraders({
  sleutel, meta, genre, filters, diensten = [], uit, smaak = null, aantal = 3,
  rnd = Math.random, haalDetail = fetchDetailById, ontdek = discover,
}) {
  const namen = genre?.wijze === 'alles' ? [] : (genre?.namen || []);
  const ids = genreIds(namen);
  const alle = genre?.wijze === 'allebei';
  const bekend = { ids: uit?.ids || new Set(), keys: uit?.keys || new Set() };
  const kandidaten = new Map(uitDeAanbevelingen(meta, { ids, alle }, bekend).map((k) => [k.id, k]));

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
  const [bekende, parels] = await Promise.all([
    zoek({ minScore: 7, minVotes: PAREL_TOT, sortBy: 'vote_average.desc', page: 1 + Math.floor(rnd() * 3) }),
    // Parels: de meest gestemde onder de weinig bekende. Gesorteerd op cijfer
    // zou de top vol staan met films waar een kleine fanclub 9's geeft.
    zoek({ minScore: 7.3, minVotes: 150, maxVotes: PAREL_TOT, sortBy: 'vote_count.desc', page: 1 + Math.floor(rnd() * 2) }),
  ]);
  [...bekende, ...parels].forEach((r) => {
    if (!r?.id || kandidaten.has(r.id) || bekend.ids.has(r.id) || bekend.keys.has(filmKey(r.title, r.year))) return;
    kandidaten.set(r.id, { ...r, bronnen: 0, via: [] });
  });

  // Een voorselectie op wat we al weten, dan de volledige filmdata ophalen.
  // Een aanbeveling bij je eigen films weegt zwaar: dat is de echte aanrader.
  const voor = (k) => (k.vote || 0) + 1 * Math.min(k.bronnen, 3) + rnd() * 0.8;
  const gewogen = [...kandidaten.values()]
    .filter((k) => (k.votes || 0) >= 50 && (k.vote || 0) >= 6.6)
    .map((k) => ({ k, v: voor(k) }))
    .sort((a, b) => b.v - a.v);
  const kort = [
    ...gewogen.filter((x) => x.k.votes >= PAREL_TOT).slice(0, 7),
    ...gewogen.filter((x) => x.k.votes < PAREL_TOT).slice(0, 4),
  ].map((x) => x.k);
  const details = await haalAlle(kort, async (k) => ({ k, m: await haalDetail(k.id, sleutel) }));

  const smaakScore = (key, m) => {
    if (!smaak) return 50;
    try { return scoorKandidaten([kandidaatVoorSessie({ key, name: m.title, year: m.year }, m)], smaak)[key]?.s ?? 50; } catch { return 50; }
  };
  const rij = details
    .filter((d) => d?.m?.id && d.m.poster)
    .filter(({ m }) => !opgeblazenReden(m) && (m.vote ?? 0) >= 6.6)
    .filter(({ m }) => !bekend.ids.has(m.id) && !bekend.keys.has(filmKey(m.title, m.year)))
    .filter(({ m }) => filterPot([{ key: 'k', year: m.year }], { k: m }, filters, nossyScore, { diensten }).length === 1)
    .map(({ k, m }) => {
      const key = filmKey(m.title, m.year);
      const s = (nossyScore(m) ?? m.vote ?? 6.5) + smaakScore(key, m) / 25 + 0.9 * Math.min(k.bronnen, 3)
        + (m.trailer ? 0.4 : -0.6) + rnd() * 0.5;
      return { film: { key, name: m.title, year: m.year }, m, bronnen: k.bronnen, via: (k.via || []).slice(0, 2), parel: (m.votes || 0) < PAREL_TOT, s };
    })
    .sort((a, b) => b.s - a.s);

  // Twee keer de sterkste, dan een loterij waarin een parel dubbel kans maakt
  const gekozen = rij.slice(0, Math.min(aantal - 1, rij.length));
  const rest = rij.slice(gekozen.length, gekozen.length + 5);
  while (gekozen.length < aantal && rest.length) {
    const gewicht = rest.map((x) => Math.max(0.1, x.s - 5) * (x.parel ? 2 : 1));
    let t = rnd() * gewicht.reduce((a, b) => a + b, 0);
    const i = gewicht.findIndex((g) => (t -= g) <= 0);
    gekozen.push(rest.splice(i < 0 ? rest.length - 1 : i, 1)[0]);
  }
  return gekozen.map(({ s, ...x }) => x);
}
