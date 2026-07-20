// "Meer zoals deze": de slimme aanrader vanaf elke filmkaart.
//
// Het recept mengt vijf signalen:
// 1. TMDB-aanbevelingen (kijkgedrag van miljoenen) en -vergelijkbaar
//    (metadata); een film die in beide lijsten staat, telt dubbel.
// 2. Genre-overlap met de uitgangsfilm.
// 3. Thema-overlap: gedeelde TMDB-trefwoorden met de uitgangsfilm. Dit is
//    het duurste signaal (extra opvraag per finalist) en levert de beste
//    redenen op, dus we meten het alleen voor de top na de voorronde.
// 4. Jouw smaakprofiel: genres en thema's waar jij hoog op scoort.
// 5. Kwaliteit, gedempt op stemmenaantal, zodat een 9 met 12 stemmen niet
//    boven een 7,9 met 40.000 stemmen uitkomt.
import { fetchRecommendations, fetchSimilar, fetchKeywords, genreLabelById } from './tmdb.js';

const damped = (vote, votes, m = 300) => (((vote || 0) * (votes || 0)) + 6.8 * m) / ((votes || 0) + m);

export async function smartSimilar(seed, seedMeta, opts) {
  const { tmdbKey, taste = {}, seenKeys = new Set(), watchlistKeys = new Set(), finalists = 12, top = 9 } = opts;
  const seedId = seedMeta?.id;
  if (!seedId || !tmdbKey) return { results: [], seedThemes: [] };

  // Stap 1: bronnen parallel, plus de thema's van de uitgangsfilm zelf
  const [recs, sims, seedKw] = await Promise.all([
    fetchRecommendations(seedId, tmdbKey).catch(() => []),
    fetchSimilar(seedId, tmdbKey).catch(() => []),
    seedMeta.keywords?.length
      ? Promise.resolve(seedMeta.keywords)
      : fetchKeywords(seedId, tmdbKey).catch(() => []),
  ]);
  const seedKwIds = new Set(seedKw.map((k) => k.id));
  const seedGenres = new Set(seedMeta.genres || []);
  const seedLang = seedMeta.lang || seedMeta.original_language || 'en';

  // Stap 2: poolen, dedupliceren, uitsluiten
  const pool = new Map();
  const voeg = (lijst, bron, gewicht) => lijst.forEach((f, i) => {
    if (f.id === seedId) return;
    const bestaand = pool.get(f.id) || { film: f, bronScore: 0, bronnen: [] };
    bestaand.bronScore += gewicht * (1 - (i / lijst.length) * 0.5); // rang telt licht mee
    bestaand.bronnen.push(bron);
    pool.set(f.id, bestaand);
  });
  voeg(recs, 'aanbevolen', 1.0);
  voeg(sims, 'vergelijkbaar', 0.65);

  const filmKeyOf = (f) => `${(f.title || '').toLowerCase().trim()}|${f.year || ''}`;
  const kandidaten = [...pool.values()].filter((k) => !seenKeys.has(filmKeyOf(k.film)));

  // Stap 3: voorronde op de gratis signalen
  kandidaten.forEach((k) => {
    const f = k.film;
    const gids = (f.genres || f.genre_ids || []).map((g) => (typeof g === 'number' ? genreLabelById(g) : g));
    const gDeel = gids.filter((g) => seedGenres.has(g));
    const jaccard = seedGenres.size ? gDeel.length / new Set([...seedGenres, ...gids]).size : 0;
    const smaakGenre = gids.reduce((n, g) => n + (taste.genres?.[g] || 0), 0);
    const kwaliteit = Math.max(0, Math.min(1, (damped(f.vote, f.votes) - 5.4) / 3));
    const taalBonus = seedLang !== 'en' && (f.lang || f.original_language) === seedLang ? 0.25 : 0;
    k.gDeel = gDeel;
    k.smaakGenre = smaakGenre;
    k.kwaliteit = f.vote ? damped(f.vote, f.votes) : null;
    k.score = k.bronScore + jaccard * 0.8 + Math.min(0.5, smaakGenre * 0.5) + kwaliteit * 0.6 + taalBonus;
    k.taalBonus = taalBonus;
  });
  kandidaten.sort((a, b) => b.score - a.score);

  // Stap 4: thema-overlap voor de finalisten (het dure, beste signaal)
  const finale = kandidaten.slice(0, finalists);
  await Promise.all(finale.map(async (k) => {
    try {
      const kw = await fetchKeywords(k.film.id, tmdbKey);
      k.gedeeldeThemas = kw.filter((x) => seedKwIds.has(x.id)).map((x) => x.name);
      k.smaakThemas = kw.filter((x) => taste.themes?.[x.id] > 0.3).map((x) => taste.themeName?.[x.id] || x.name);
      k.score += Math.min(3, k.gedeeldeThemas.length) * 0.35 + Math.min(2, k.smaakThemas.length) * 0.15;
    } catch { k.gedeeldeThemas = []; k.smaakThemas = []; }
  }));
  finale.sort((a, b) => b.score - a.score);

  // Stap 5: redenen per film, belangrijkste eerst
  const results = finale.slice(0, top).map((k) => {
    const redenen = [];
    if (k.gedeeldeThemas?.length) redenen.push({ type: 'themes', themes: k.gedeeldeThemas.slice(0, 3) });
    if (k.smaakThemas?.length && !k.gedeeldeThemas?.length) redenen.push({ type: 'tasteThemes', themes: k.smaakThemas.slice(0, 2) });
    if (k.gDeel.length && redenen.length < 2) redenen.push({ type: 'genres', genres: k.gDeel.slice(0, 2) });
    if (k.kwaliteit >= 7.4 && redenen.length < 2) redenen.push({ type: 'quality', score: k.kwaliteit });
    if (k.taalBonus && redenen.length < 2) redenen.push({ type: 'lang' });
    return {
      id: k.film.id,
      title: k.film.title,
      year: k.film.year,
      poster: k.film.poster,
      vote: k.film.vote,
      genre_ids: k.film.genre_ids || [],
      redenen,
      dubbeleBron: k.bronnen.length > 1,
      opWatchlist: watchlistKeys.has(filmKeyOf(k.film)),
    };
  });
  return { results, seedThemes: seedKw.slice(0, 5).map((k) => k.name) };
}
