// De matchmotor: jouw smaakprofiel uit ratings + watchlist, en een
// uitlegbaar match-percentage voor elke kandidaat-film.
import { GENRES } from './tmdb.js';

const decadeOf = (year) => (year ? Math.floor(year / 10) * 10 : null);

// Profiel: affiniteit per genre en decennium (-1..1, gewogen op jóuw ratings),
// taalvoorkeur en hoe obscuur je smaak is (mediaan stemmenaantal).
// TMDB plakt op bijna elke film een reeks productie-/administratieve trefwoorden
// die niets over het thema zeggen. Die filteren we weg, anders vullen ze elk
// profiel en voelen de thema's 'random'.
const KEYWORD_STOPLIST = new Set([
  'aftercreditsstinger', 'duringcreditsstinger', 'based on novel or book', 'based on novel',
  'woman director', 'independent film', 'based on true story', 'based on comic',
  'based on young adult novel', 'based on play or musical', 'based on short film',
  'based on video game', 'based on comic book', 'sequel', 'prequel', 'remake',
  'live action remake', 'reboot', 'shot on location', 'imax', '3d',
  'anime', 'live action', 'dubbed', 'silent film', 'black and white',
  'cameo', 'post credits scene', 'end credits scene', 'based on tv series',
]);

export function buildTaste({ watchlist, ratedFilms, meta, shortlist = [], skipped = [] }) {
  const gRaw = {}; const dRaw = {}; const kRaw = {}; const kName = {}; const kFilms = {};
  const add = (obj, k, v) => { obj[k] = (obj[k] || 0) + v; };
  // Thema's tellen we ALLEEN uit films die je echt beoordeeld hebt (bewezen smaak),
  // niet uit je watchlist (dat is 'wil ik zien'). En we houden bij op hoeveel films
  // een thema voorkomt, zodat een toevallig trefwoord uit één film niet domineert.
  const addKw = (list, w, filmKey) => (list || []).forEach((kw) => {
    if (!kw?.name || KEYWORD_STOPLIST.has(kw.name.toLowerCase())) return;
    add(kRaw, kw.id, w); kName[kw.id] = kw.name;
    (kFilms[kw.id] = kFilms[kw.id] || new Set()).add(filmKey);
  });
  const idNaam = Object.fromEntries(GENRES.map((g) => [g.id, g.en]));
  let signaal = 0;

  watchlist.forEach((f) => {
    meta[f.key]?.genres?.forEach((g) => add(gRaw, g, 0.35));
    const d = decadeOf(f.year); if (d) add(dRaw, d, 0.35);
  });
  ratedFilms.forEach((f) => {
    const w = f.rating - 3; // 5★ = +2, 3★ = 0, 1★ = -2
    signaal += Math.abs(w);
    meta[f.key]?.genres?.forEach((g) => add(gRaw, g, w));
    // alleen films die je positief waardeerde vormen je thema's (w > 0)
    if (w > 0) addKw(meta[f.key]?.keywords, w, f.key);
    const d = decadeOf(f.year); if (d) add(dRaw, d, w);
  });
  // Feedback-lus: shortlist/'niet voor mij' stuurt genres licht bij (thema's laten
  // we hier ongemoeid — die light-objecten dragen toch geen keywords).
  shortlist.forEach((s) => {
    (s.genre_ids || []).forEach((id) => { if (idNaam[id]) add(gRaw, idNaam[id], 0.5); });
  });
  skipped.forEach((s) => {
    if (typeof s !== 'object') return;
    (s.genre_ids || []).forEach((id) => { if (idNaam[id]) add(gRaw, idNaam[id], -0.5); });
  });

  const normalize = (raw) => {
    const max = Math.max(...Object.values(raw).map(Math.abs), 1);
    const out = {};
    Object.entries(raw).forEach(([k, v]) => { out[k] = v / max; });
    return out;
  };

  const metas = Object.values(meta).filter(Boolean);
  const nonEn = metas.filter((m) => m.country && !['US', 'GB'].includes(m.country)).length;
  const votesSorted = metas.map((m) => m.votes).filter(Boolean).sort((a, b) => a - b);

  // Alleen thema's die op MINSTENS 2 van je gewaardeerde films voorkomen tellen mee.
  // Zo verdwijnen toevallige eenmalige trefwoorden en houd je herkenbare patronen.
  const MIN_FILMS = 2;
  const kFiltered = {};
  Object.entries(kRaw).forEach(([id, v]) => {
    if ((kFilms[id]?.size || 0) >= MIN_FILMS) kFiltered[id] = v;
  });
  const themes = normalize(kFiltered);
  const topThemes = Object.entries(themes)
    .filter(([, v]) => v > 0.3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id, v]) => ({ id: +id, name: kName[id], score: v, films: kFilms[id]?.size || 0 }));

  return {
    genres: normalize(gRaw),
    decades: normalize(dRaw),
    themes,
    themeName: kName,
    topThemes,
    nietEngels: metas.length >= 10 ? nonEn / metas.length : 0.2,
    medianVotes: votesSorted[Math.floor(votesSorted.length / 2)] || 20000,
    sterk: signaal >= 20, // genoeg ratings om het profiel serieus te nemen
  };
}

const idToEn = Object.fromEntries(GENRES.map((g) => [g.id, g.en]));
import { t as tt, getLang } from './i18n.js';
import { genreLabel } from './tmdb.js';
const lblFromEn = (gn) => { const g = GENRES.find((x) => x.en === gn); return g ? genreLabel(g) : gn; };

// Thema-nadruk is instelbaar (net als de Nossy-weging). 0 = thema's tellen niet
// mee (klassiek gedrag), 1 = standaard, tot 2 = sterk themagedreven. De weging
// wordt in matchScore verrekend zodat de componenten samen altijd 1 zijn.
export const DEFAULT_THEME_EMPHASIS = 1;
let THEME_EMPHASIS = DEFAULT_THEME_EMPHASIS;
export const setThemeEmphasis = (v) => { THEME_EMPHASIS = (v == null || isNaN(v)) ? DEFAULT_THEME_EMPHASIS : Math.max(0, Math.min(2, v)); };
export const getThemeEmphasis = () => THEME_EMPHASIS;

// Kandidaat: { vote, votes, year, lang?, genres? (namen) of genre_ids? (TMDB-ids), keywords? }
// Geeft { score: 0-100, redenen: [string] } — transparant, geen black box.
export function matchScore(cand, taste) {
  const genreNames = cand.genres?.length
    ? cand.genres
    : (cand.genre_ids || []).map((id) => idToEn[id]).filter(Boolean);

  // 1. Kwaliteit (40%): Bayesiaans gedempt — een 10 met 5 stemmen is geen 10.
  // Het cijfer wordt naar de prior (6,2) getrokken naarmate er minder stemmen
  // zijn (zelfde principe als IMDb's Top 250-formule).
  const n = cand.votes ?? 60; // onbekend aantal: voorzichtig lage aanname
  // C geijkt op TMDB-schaal (veel lagere aantallen dan IMDb): bij ~120 stemmen
  // weegt het eigen cijfer half mee, bij 3k (Nomadland) vrijwel volledig.
  const PRIOR = 6.2; const C = 120;
  const adj = cand.vote ? (cand.vote * n + PRIOR * C) / (n + C) : PRIOR;
  const q = Math.min(Math.max((adj - 5) / 3.5, 0), 1);

  // 2. Genre-affiniteit: gemiddelde affiniteit van de genres
  const affs = genreNames.map((g) => taste.genres[g] ?? 0);
  const gAff = affs.length ? affs.reduce((a, b) => a + b, 0) / affs.length : 0;
  const g = gAff * 0.5 + 0.5;

  // 2b. Thema-affiniteit: gemiddelde affiniteit van de TMDB-keywords van de film
  const themeAffs = (cand.keywords || []).map((kw) => taste.themes?.[kw.id] ?? 0).filter((v) => v !== 0);
  const tAff = themeAffs.length ? themeAffs.reduce((a, b) => a + b, 0) / themeAffs.length : 0;
  const th = tAff * 0.5 + 0.5;

  // 3. Tijdperk
  const d = cand.year ? ((taste.decades[decadeOf(cand.year)] ?? 0) * 0.5 + 0.5) : 0.5;

  // 4. Taal: niet-Engels scoort mee met jouw aandeel niet-Engels kijken
  const t = cand.lang ? (cand.lang !== 'en' ? taste.nietEngels : 1 - taste.nietEngels * 0.5) : 0.6;

  // 5. Obscuriteit: hoe dichter bij jouw gebruikelijke bekendheidsniveau
  let o = 0.5;
  if (cand.votes && taste.medianVotes) {
    const afstand = Math.abs(Math.log10(cand.votes) - Math.log10(taste.medianVotes));
    o = Math.max(0, 1 - afstand / 2.5);
  }

  // Weging: thema's zijn instelbaar (emphasis). Bij emphasis 1 is thema 20%.
  // De thema-weging schaalt met emphasis; als er geen keywords/thema-signaal is,
  // vervalt thema naar 0 en herverdelen we over de rest (geen straf voor films
  // zonder tags). De overige gewichten schalen mee zodat de som altijd 1 is.
  const emphasis = getThemeEmphasis();
  const heeftThema = themeAffs.length > 0 && (taste.topThemes?.length || 0) > 0;
  const wTheme = heeftThema ? 0.20 * emphasis : 0;
  const base = { q: 0.35, g: 0.20, d: 0.12, t: 0.08, o: 0.05 };
  const baseSum = base.q + base.g + base.d + base.t + base.o; // 0.80
  const rest = 1 - wTheme;
  const k = rest / baseSum;
  const score = Math.round(100 * (
    base.q * k * q + wTheme * th + base.g * k * g + base.d * k * d + base.t * k * t + base.o * k * o
  ));

  const redenen = [];
  const topGenres = genreNames.filter((gn) => (taste.genres[gn] ?? 0) > 0.35).map(lblFromEn);
  if (topGenres.length) redenen.push(tt('taste.matchGenres', { genres: topGenres.slice(0, 2).join(' & ') }));
  // Thema's die deze film deelt met jouw smaakprofiel
  if (heeftThema) {
    const raakThemas = (cand.keywords || [])
      .filter((kw) => (taste.themes?.[kw.id] ?? 0) > 0.3)
      .map((kw) => kw.name)
      .slice(0, 2);
    if (raakThemas.length) redenen.push(tt('taste.aboutThemes', { themes: raakThemas.join(tt('taste.and')) }));
  }
  const negGenres = genreNames.filter((gn) => (taste.genres[gn] ?? 0) < -0.35).map(lblFromEn);
  if (negGenres.length) redenen.push(tt('taste.negGenre', { genre: negGenres[0] }));
  if (cand.year && (taste.decades[decadeOf(cand.year)] ?? 0) > 0.35) redenen.push(tt('taste.yourEra', { era: String(decadeOf(cand.year)).slice(2) }));
  if (cand.lang && cand.lang !== 'en' && taste.nietEngels >= 0.35) redenen.push(tt('taste.nonEnglish'));
  if (cand.vote && adj >= 7.3) redenen.push(tt('taste.strongRated', { score: getLang() === 'nl' ? String(cand.vote).replace('.', ',') : String(cand.vote), n: n >= 1000 ? `${Math.round(n / 1000)}k` : n }));
  if (cand.votes != null && cand.votes < 40) redenen.push(tt('taste.barelyRated', { count: cand.votes }));
  if (cand.votes && cand.votes < 3000 && taste.medianVotes < 8000) redenen.push(tt('taste.obscure'));

  // Het transparante recept: per component de genormaliseerde waarde (0..1),
  // het effectieve gewicht en de bijdrage in punten. De som van de punten is
  // (op afronding na) de score — geen black box.
  const recept = [
    { id: 'quality', v: q, w: base.q * k, pts: Math.round(100 * base.q * k * q) },
    ...(wTheme > 0 ? [{ id: 'theme', v: th, w: wTheme, pts: Math.round(100 * wTheme * th) }] : []),
    { id: 'genre', v: g, w: base.g * k, pts: Math.round(100 * base.g * k * g) },
    { id: 'era', v: d, w: base.d * k, pts: Math.round(100 * base.d * k * d) },
    { id: 'lang', v: t, w: base.t * k, pts: Math.round(100 * base.t * k * t) },
    { id: 'obscurity', v: o, w: base.o * k, pts: Math.round(100 * base.o * k * o) },
  ];

  return { score: Math.min(score, 99), redenen, recept };
}
