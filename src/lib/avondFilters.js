// Wat er op tafel komt: de filters voor alle spellen van een filmavond (veto,
// bracket, op afstand en Voor ons) en voor de kassa bij Pick. Ze worden
// onthouden in de instellingen, want je hebt meestal vaste wensen: geen
// korte films, geen horror. Pick en Filmavond onthouden elk hun eigen keuzes.

// Korter dan dit is een korte film (de grens die ook filmfestivals gebruiken)
export const KORT = 40;

export const STANDAARD_FILTERS = {
  geenKort: true, // films korter dan 40 minuten eruit
  maxDuur: null, // 90 | 120 | 150 minuten
  genres: [], // zin in: minstens een hiervan
  nietGenres: [], // liever niet: geen van deze
  taal: 'alle', // 'alle' | 'en' | 'anders'
  minScore: 0, // minimale Nossy-score
  jaarVan: '',
  jaarTot: '',
  alleenStreaming: false,
};

export const metStandaard = (f) => ({ ...STANDAARD_FILTERS, ...(f || {}) });

// De pot na de filters. Wat we niet weten (geen looptijd, taal of genres
// bekend) krijgt het voordeel van de twijfel, behalve bij een maximale duur:
// daar moet de film aantoonbaar kort genoeg zijn.
//   score: (meta) => Nossy-score of null
//   diensten: de diensten die je in Verken koos; dan betekent "alleen op
//   streaming" alleen op jouw diensten
export function filterPot(pot, meta, filters, score, { diensten = [] } = {}) {
  const f = metStandaard(filters);
  const mijn = new Set(diensten);
  return pot.filter((film) => {
    const m = meta[film.key] || {};
    if (f.geenKort && m.runtime && m.runtime < KORT) return false;
    if (f.maxDuur && !(m.runtime && m.runtime <= f.maxDuur)) return false;
    if (f.genres.length && !m.genres?.some((g) => f.genres.includes(g))) return false;
    if (f.nietGenres.length && m.genres?.some((g) => f.nietGenres.includes(g))) return false;
    if (f.taal === 'en' && m.lang && m.lang !== 'en') return false;
    if (f.taal === 'anders' && m.lang === 'en') return false;
    if (f.minScore && (score(m) ?? 0) < f.minScore) return false;
    if (f.jaarVan !== '' && !(film.year && film.year >= +f.jaarVan)) return false;
    if (f.jaarTot !== '' && !(film.year && film.year <= +f.jaarTot)) return false;
    if (f.alleenStreaming && !(mijn.size ? m.flat?.some((p) => mijn.has(p)) : m.flat?.length)) return false;
    return true;
  });
}

// Wijkt iets af van de standaard? (dan mag "terug naar standaard" erbij)
export function afwijkend(filters) {
  const f = metStandaard(filters);
  return Object.keys(STANDAARD_FILTERS).some((k) => JSON.stringify(f[k]) !== JSON.stringify(STANDAARD_FILTERS[k]));
}

// Een genre aan- of uitzetten bij "zin in" of "liever niet". Een genre staat
// nooit in allebei: wie het naar de ene lijst zet, haalt het uit de andere.
export function wisselGenre(filters, lijst, genre) {
  const f = metStandaard(filters);
  const ander = lijst === 'genres' ? 'nietGenres' : 'genres';
  const aan = f[lijst].includes(genre);
  return {
    ...f,
    [lijst]: aan ? f[lijst].filter((g) => g !== genre) : [...f[lijst], genre],
    [ander]: f[ander].filter((g) => g !== genre),
  };
}
