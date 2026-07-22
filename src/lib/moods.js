// "Waar zoek je nu naar" — stemmingen die de bestaande aanbevelingen live
// herwegen, zonder nieuwe API-calls. Elke stemming geeft een film een bonus
// of malus bovenop de match-score, zodat de rijen meteen meebewegen met wat
// je nú zoekt. Puur en testbaar gehouden.
import { GENRES } from './tmdb.js';

const GENRE_NAME = Object.fromEntries(GENRES.map((g) => [g.id, g.en]));

// Genre-id's per stemming (TMDB-nummers).
const LICHT = new Set([35, 10749, 10751, 16, 12, 10402]); // komedie, romantiek, familie, animatie, avontuur, muziek
const DONKER = new Set([27, 53, 80, 9648, 10752]); // horror, thriller, misdaad, mystery, oorlog

export const MOODS = [
  { id: 'light', emoji: '☀️' },
  { id: 'dark', emoji: '🌑' },
  { id: 'short', emoji: '⏱️' },
  { id: 'acclaimed', emoji: '🏆' },
  { id: 'surprise', emoji: '🎲' },
];

// Herweeg een lijst films op basis van de actieve stemmingen en gekozen
// focus-genres. Geeft een nieuwe, sorteerbare score terug per film (moodScore),
// zonder de originele match aan te tasten.
export function applyMoods(films, { active = [], focusGenres = [], taste = {} } = {}) {
  const set = new Set(active);
  const focus = new Set(focusGenres);
  return films.map((f) => {
    const gids = f.genre_ids || [];
    let bonus = 0;

    if (set.has('light')) bonus += gids.some((g) => LICHT.has(g)) ? 0.6 : -0.3;
    if (set.has('dark')) bonus += gids.some((g) => DONKER.has(g)) ? 0.6 : -0.3;
    if (set.has('short')) {
      // runtime is niet altijd bekend op light-objecten; alleen belonen als hij er is
      if (f.runtime != null && f.runtime > 0) bonus += f.runtime <= 105 ? 0.5 : -0.4;
    }
    if (set.has('acclaimed')) {
      const v = f.vote || 0;
      bonus += v >= 7.5 ? 0.6 : v >= 7 ? 0.2 : -0.3;
    }
    if (set.has('surprise')) {
      // bewust buiten je comfortzone: films met genres die NIET je toppers zijn
      const topGenres = new Set(Object.entries(taste.genres || {}).filter(([, w]) => w > 0.4).map(([g]) => g));
      const genreNamen = (f.genre_ids || []).map((id) => GENRE_NAME[id]).filter(Boolean);
      const buiten = genreNamen.some((g) => !topGenres.has(g));
      bonus += buiten ? 0.5 : -0.2;
      // en een vleugje willekeur zodat "verras me" ook echt verrast
      bonus += (hashId(f.id) - 0.5) * 0.6;
    }

    if (focus.size) {
      bonus += gids.some((g) => focus.has(g)) ? 0.8 : -0.6;
    }

    return { ...f, moodScore: (f.match || 0) / 100 + bonus };
  });
}

// Stabiele pseudo-willekeur per film-id (0..1), zodat "verras me" consistent
// blijft binnen een sessie in plaats van bij elke render te springen.
function hashId(id) {
  const x = Math.sin(id * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}
