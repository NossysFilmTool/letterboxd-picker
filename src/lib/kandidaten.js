// De kandidatenmotor als pure functies: seeds bepalen, kandidaten wegen en
// scoren, en de meetlat. Los van React, zodat de app en de meetlat precies
// dezelfde berekening gebruiken.
import { filmKey } from './storage.js';
import { buildTaste, matchScore } from './taste.js';
import { plekGewicht, rangschikRegisseurs, pastInOeuvre, sorteerOpSterkte } from './rows.js';
import { degelijk } from './foryou.js';

export const DETAIL_TTL = 14 * 24 * 3600e3; // streamingaanbod wisselt; twee weken is vers genoeg
export const detailVers = (d, regio, nu = Date.now()) => !!d && d.regio === regio && nu - (d.at || 0) < DETAIL_TTL;

// Standaard staan alle onderdelen aan; de meetlat kan ze los uitzetten om te
// zien wat elk onderdeel oplevert.
// watchlist: gewicht van je watchlist als bron; profielFav: taal en bekendheid
// van je smaak uit je hoog beoordeelde films (beide gemeten op een echt profiel).
export const STANDAARD_OPTIES = { kruis: true, anti: true, idf: true, regisseur: true, regisseurs: 12, watchlist: 0.4, profielFav: true };

// Al je beoordelingen op één hoop: Letterboxd-ratings van films op je
// watchlist plus je ratings.csv (die laatste wint bij dubbel).
function alleRatings({ watchlist, ratings = {}, ratedFilms }) {
  const uit = new Map();
  watchlist.forEach((f) => { if (ratings[f.key] != null) uit.set(f.key, { ...f, rating: ratings[f.key] }); });
  ratedFilms.forEach((f) => { if (f.rating != null) uit.set(f.key, f); });
  return [...uit.values()];
}

// Seeds: films die jij 4+ gaf en waarvan we filmdata hebben (5★ duwt harder)
export function bepaalSeeds({ watchlist, ratings, ratedFilms, meta }) {
  return alleRatings({ watchlist, ratings, ratedFilms })
    .filter((f) => f.rating >= 4 && meta[f.key])
    .sort((a, b) => b.rating - a.rating);
}

// Anti-seeds: films die jij 2★ of lager gaf. Wat TMDB daarbij aanraadt,
// schuift omlaag ("Omdat je The Notebook 2★ gaf, liever niet dit").
export function bepaalAntiSeeds({ watchlist, ratings, ratedFilms, meta }) {
  return alleRatings({ watchlist, ratings, ratedFilms })
    .filter((f) => f.rating <= 2 && meta[f.key]?.recs?.length)
    .sort((a, b) => a.rating - b.rating);
}

// Alle kandidaten, gewogen per bron en gescoord op jouw smaak.
//   uitleg(key, vars): vertaalfunctie voor redenen (de meetlat geeft een dummy)
export function scoorKandidaten({
  watchlist, meta, ratedFilms, ratings = {}, seenSet = new Set(), shortlist = [], skipped = [],
  oeuvres = {}, profielCands = [], themeCands = [], dienstCands = [], eigenCands = {}, details = {}, regio = 'NL',
  taste, seeds, regisseurs, uitleg = (k) => k, opties = STANDAARD_OPTIES,
}) {
  const ownKeys = new Set([...watchlist.map((f) => f.key), ...seenSet, ...ratedFilms.map((f) => f.key)]);
  const ownIds = new Set(Object.values(meta).filter(Boolean).map((m) => m.id));
  // Geziene films apart op TMDB-id: vangt titelverschillen tussen Letterboxd
  // en TMDB. Een film die je al zag mag nooit als aanbeveling terugkomen.
  const seenIds = new Set([...seenSet].map((k) => meta[k]?.id).filter(Boolean));
  const skippedSet = new Set(skipped.map((s) => (typeof s === 'object' ? s.id : s)));
  const shortIds = new Set(shortlist.map((s) => s.id));

  // Zonder minstens drie favorieten leunen we op de aanbevelingen bij je watchlist
  let gewogenSeeds = seeds;
  const onRatings = gewogenSeeds.length >= 3;
  if (!onRatings) gewogenSeeds = watchlist.filter((f) => meta[f.key]?.recs?.length).map((f) => ({ ...f, rating: 3.5 }));

  const agg = new Map();
  const voegToe = (r, waarde, bron, seedNaam) => {
    if (r.votes != null && r.votes < 20) return; // te weinig stemmen om iets over te zeggen (TMDB-schaal)
    if (ownIds.has(r.id) || seenIds.has(r.id) || shortIds.has(r.id) || skippedSet.has(r.id)) return;
    if (ownKeys.has(filmKey(r.title, r.year))) return;
    const cur = agg.get(r.id) || { ...r, count: 0, waarde: 0, seeds: [], bronnen: [], seedSet: new Set() };
    cur.count++;
    cur.waarde += waarde;
    if (seedNaam) {
      // Voor de kruisbevestiging tellen alleen echte aanbevelingen (kijkgedrag):
      // /similar is te ruis om als bevestiging te gelden (gemeten met de meetlat)
      if (bron === 'aanbevolen') cur.seedSet.add(seedNaam);
      if (cur.seeds.length < 3 && !cur.seeds.includes(seedNaam)) cur.seeds.push(seedNaam);
    }
    if (!cur.bronnen.includes(bron)) cur.bronnen.push(bron);
    // vollediger data wint (similar/discover dragen soms meer velden dan recs)
    if (!cur.genre_ids?.length && r.genre_ids?.length) cur.genre_ids = r.genre_ids;
    agg.set(r.id, cur);
  };

  gewogenSeeds.forEach((seed) => {
    const w = (seed.rating || 3.5) - 3; // 4★ = 1, 5★ = 2
    // /recommendations (kijkgedrag) is de hoofdbron; /similar (metadata) is
    // veel ruiser en weegt daarom half zo zwaar. De plek in TMDB's lijst telt mee.
    const recsS = meta[seed.key]?.recs || [];
    recsS.forEach((r, i) => voegToe(r, (1 + w) * plekGewicht(i, recsS.length), 'aanbevolen', seed.name));
    const sims = opties.sims === false ? [] : (meta[seed.key]?.sims || []);
    sims.forEach((r, i) => voegToe(r, (0.4 + w * 0.4) * plekGewicht(i, sims.length), 'vergelijkbaar', seed.name));
  });
  // Je watchlist als zwakke bron: wat jij wilt zien zegt ook iets over je
  // smaak, en de aanbevelingen bij die films staan al in de cache. Alleen
  // films die je (nog) niet beoordeelde; met een laag gewicht per film, maar
  // een kandidaat die bij veel watchlistfilms opduikt, telt flink op.
  if (onRatings && opties.watchlist) {
    const beoordeeld = new Set(alleRatings({ watchlist, ratings, ratedFilms }).map((f) => f.key));
    watchlist.forEach((f) => {
      if (beoordeeld.has(f.key)) return;
      const recsW = meta[f.key]?.recs || [];
      recsW.forEach((r, i) => voegToe(r, opties.watchlist * plekGewicht(i, recsW.length), 'watchlist', null));
    });
  }
  // Alleen oeuvres van je huidige favoriete regisseurs (de cache kan oude
  // bevatten), en alleen films die een genre delen met wat jij van ze waardeert.
  // Hoe meer films van een regisseur jij hoog gaf, hoe zwaarder zijn oeuvre
  // telt: vier keer 5★ voor Wong Kar-wai zegt meer dan één losse favoriet.
  regisseurs.forEach((reg) => {
    const gewicht = opties.regisseur ? Math.min(4, 0.8 + 0.4 * reg.score) : 1.6;
    oeuvres[reg.naam]?.films?.forEach((r) => {
      if (pastInOeuvre(r, reg.genres)) voegToe(r, gewicht, `oeuvre:${reg.naam}`, null);
    });
  });
  profielCands.forEach((r) => voegToe(r, 0.7, 'profiel', null));
  themeCands.forEach((r) => voegToe(r, 0.85, 'thema', null));
  dienstCands.forEach((r) => voegToe(r, 0.8, 'dienst', null));
  // Eigen rijen: elke rij is een eigen bron (eigen:<id>), zodat de rij precies
  // weet welke films bij hem horen
  Object.entries(eigenCands).forEach(([id, films]) => (films || []).forEach((r) => voegToe(r, 0.6, `eigen:${id}`, null)));

  // Anti-favorieten: hoe sterk een kandidaat wordt aangeraden bij films die
  // jij laag gaf (1★ telt dubbel zo zwaar als 2★, bovenaan de lijst zwaarder)
  const anti = new Map();
  if (opties.anti) {
    bepaalAntiSeeds({ watchlist, ratings, ratedFilms, meta }).forEach((a) => {
      const zwaarte = 3 - a.rating;
      const recsA = meta[a.key].recs;
      recsA.forEach((r, i) => {
        const cur = anti.get(r.id) || { score: 0, namen: [] };
        cur.score += zwaarte * plekGewicht(i, recsA.length);
        if (cur.namen.length < 2 && !cur.namen.includes(a.name)) cur.namen.push(a.name);
        anti.set(r.id, cur);
      });
    });
  }

  // Wat je met een reden afwees: "te mainstream" zet een grens op bekendheid
  // (70% van de minst bekende film die je zo afwees), "de regisseur" zet die
  // regisseur flink lager.
  const metReden = (reden) => skipped.filter((s) => typeof s === 'object' && s.reden === reden);
  const mainstreamStemmen = metReden('mainstream').map((s) => s.votes).filter((v) => v > 0);
  const mainstreamGrens = mainstreamStemmen.length ? Math.min(...mainstreamStemmen) * 0.7 : null;
  const afgewezenRegisseurs = new Set(metReden('regisseur').map((s) => s.director).filter(Boolean));

  const topThemaNamen = new Map((taste.topThemes || []).map((t) => [t.id, t.name]));
  const recs = [...agg.values()].map(({ seedSet, ...kaal }) => {
    // Met details: echte looptijd, genres, trefwoorden (thema-match) en aanbod
    const d = detailVers(details[kaal.id], regio) ? details[kaal.id] : null;
    const r = d ? {
      ...kaal,
      runtime: d.runtime, keywords: d.keywords, flat: d.flat, jwLink: d.jwLink, imdbId: d.imdbId, director: d.director,
      genres: d.genres?.length ? d.genres : kaal.genres,
    } : kaal;
    // Kruisbevestiging: het aantal onafhankelijke routes naar deze film
    // (elke favoriet telt apart, plus oeuvre, profiel, thema en dienst).
    // Eén lijst is ruis; de overlap tussen lijsten is signaal.
    const routes = seedSet.size + r.bronnen.filter((b) => b.startsWith('oeuvre:') || b === 'profiel' || b === 'thema' || b === 'dienst').length;
    let waarde = r.waarde;
    if (opties.kruis && routes > 1) waarde *= 1 + 0.3 * (routes - 1);
    const a = anti.get(r.id);
    if (a) waarde /= 1 + a.score;
    const m = matchScore(r, taste);
    let redenen = m.redenen;
    // Via de thema-jacht gevonden en de score gaf zelf geen thema-reden
    // (light-object zonder keywords): leg het alsnog uit.
    if (r.viaTheme?.length && !redenen.some((x) => /thema/i.test(x))) {
      redenen = [uitleg('verken.foundOnThemes', { themes: r.viaTheme.slice(0, 3).join(', ') }), ...redenen];
    }
    if (a) redenen = [...redenen, uitleg('verken.antiReason', { names: a.namen.join(', ') })];
    let match = m.score;
    if (mainstreamGrens && (r.votes || 0) >= mainstreamGrens) {
      match = Math.max(0, match - 12);
      redenen = [...redenen, uitleg('verken.redenMainstreamUitleg')];
    }
    const regisseurWeg = (r.director && afgewezenRegisseurs.has(r.director))
      || r.bronnen.some((b) => b.startsWith('oeuvre:') && afgewezenRegisseurs.has(b.slice(7)));
    if (regisseurWeg) {
      waarde *= 0.2;
      match = Math.max(0, match - 25);
    }
    // Welke van jouw top-thema's deze film aantoonbaar deelt (alleen met details)
    const gedeeldeThemas = r.keywords ? r.keywords.filter((k) => topThemaNamen.has(k.id)).map((k) => topThemaNamen.get(k.id)) : null;
    return { ...r, waarde, routes, bevestigd: routes >= 2, anti: a ? a.namen : null, match, redenen, recept: m.recept, gedeeldeThemas };
  });

  return {
    recs,
    seededOnRatings: onRatings,
    seedFilms: gewogenSeeds.filter((s) => (s.rating || 0) >= 4.5),
  };
}

// De meetlat: hoe goed kent Voor jou je smaak? We verbergen één 4,5★-film
// tegelijk alsof je hem nooit zag, bouwen de aanbevelingen opnieuw op uit de
// rest, en kijken of hij uit zichzelf in de top `topN` terugkomt. Eén tegelijk,
// want met groepen verdwenen soms alle films van één regisseur tegelijk (en
// daarmee zijn hele oeuvre-route). Bij veel favorieten een gelijkmatige
// steekproef. Alleen met gecachete data: geen netwerk.
export const MEET_MIN = 5;
export function meetlat({
  watchlist, meta, ratedFilms, ratings = {}, seenSet = new Set(), oeuvres = {}, details = {}, regio = 'NL',
  opties = STANDAARD_OPTIES, topN = 50, maxProef = 40,
}) {
  const favorieten = alleRatings({ watchlist, ratings, ratedFilms }).filter((f) => f.rating >= 4.5 && meta[f.key]?.id);
  if (favorieten.length < MEET_MIN) return { genoeg: false, favorieten: favorieten.length };
  const stap = Math.max(1, favorieten.length / maxProef);
  const proef = favorieten.length <= maxProef
    ? favorieten
    : Array.from({ length: maxProef }, (_, i) => favorieten[Math.floor(i * stap)]);
  // Eén ronde: de aanbevelingen opbouwen zonder de films in `weg`
  const ronde = (weg) => {
    const metaZonder = Object.fromEntries(Object.entries(meta).filter(([k]) => !weg.has(k)));
    const wl = watchlist.filter((f) => !weg.has(f.key));
    const rf = ratedFilms.filter((f) => !weg.has(f.key));
    const rt = Object.fromEntries(Object.entries(ratings).filter(([k]) => !weg.has(k)));
    const seen = new Set([...seenSet].filter((k) => !weg.has(k)));
    const taste = buildTaste({ watchlist: wl, ratedFilms: rf, meta: metaZonder, idf: opties.idf, profielUitFavorieten: opties.profielFav });
    const seeds = bepaalSeeds({ watchlist: wl, ratings: rt, ratedFilms: rf, meta: metaZonder });
    const regisseurs = rangschikRegisseurs(seeds, metaZonder, opties.regisseurs || 12);
    const { recs } = scoorKandidaten({
      watchlist: wl, meta: metaZonder, ratedFilms: rf, ratings: rt, seenSet: seen, oeuvres, details, regio,
      taste, seeds, regisseurs, opties,
    });
    return { gerangschikt: sorteerOpSterkte(recs.filter(degelijk)), seeds, regisseurs };
  };
  const perFilm = [];
  let poelTotaal = 0;
  for (const film of proef) {
    const { gerangschikt } = ronde(new Set([film.key]));
    poelTotaal += gerangschikt.length;
    const rang = new Map(gerangschikt.map((f, i) => [f.id, i]));
    const id = meta[film.key].id;
    perFilm.push({ name: film.name, year: film.year, votes: meta[film.key].votes ?? null, positie: rang.has(id) ? rang.get(id) + 1 : null });
  }
  const gevonden = perFilm.filter((p) => p.positie != null && p.positie <= topN).length;

  // Diagnose: waar zit het, bij het bereik of bij de rangschikking?
  const mediaan = (lijst) => {
    const s = lijst.filter((v) => v != null).sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : null;
  };
  const alles = alleRatings({ watchlist, ratings, ratedFilms });
  const volledig = ronde(new Set());
  const diagnose = {
    favorietenTotaal: alles.filter((f) => f.rating >= 4.5).length,
    favorietenMetData: favorieten.length,
    seedsTotaal: alles.filter((f) => f.rating >= 4).length,
    seedsMetData: volledig.seeds.length,
    metAanbevelingen: volledig.seeds.filter((s) => meta[s.key]?.recs?.length).length,
    metVergelijkbaar: volledig.seeds.filter((s) => meta[s.key]?.sims?.length).length,
    regisseurs: volledig.regisseurs.length,
    regisseursMetOeuvre: volledig.regisseurs.filter((r) => oeuvres[r.naam]?.films?.length).length,
    mediaanPositie: mediaan(perFilm.map((p) => p.positie)),
    poel: Math.round(poelTotaal / proef.length),
    // Bekendheid: hoeveel TMDB-stemmen de top van Voor jou heeft, tegen je favorieten.
    // Veel hoger = de motor trekt naar populaire films.
    stemmenTop: mediaan(volledig.gerangschikt.slice(0, topN).map((f) => f.votes)),
    stemmenFavorieten: mediaan(favorieten.map((f) => meta[f.key].votes)),
    proef: proef.length,
  };
  return {
    genoeg: true,
    favorieten: favorieten.length,
    gevonden,
    pct: Math.round((100 * gevonden) / perFilm.length),
    inPoel: perFilm.filter((p) => p.positie != null).length,
    topN,
    diagnose,
    perFilm: perFilm.sort((a, b) => (a.positie ?? 1e9) - (b.positie ?? 1e9)),
  };
}
