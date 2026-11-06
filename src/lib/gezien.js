// Herkent films die je al kent (gezien, beoordeeld of op je lijst), ook als
// TMDB en Letterboxd net anders schrijven. Gemeten op een echt profiel:
// zonder dit glipten ~20 al geziene films door, door twee soorten verschil:
//   - leestekens en accenten: "Mockingjay – Part 2" tegenover "- Part 2"
//   - het jaartal: festivaljaar tegenover bioscoopjaar (The Witch 2015/2016)
// Daarom vergelijken we op genormaliseerde titel met een jaar speling.

export const normTitel = (t) => String(t || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

// keys: filmsleutels "titel|jaar" (zoals filmKey ze maakt); ids: TMDB-id's.
// Geeft een functie (film) => boolean voor een film met { id, title, orig?, year }.
export function maakHerkenner(keys = [], ids = []) {
  const idSet = new Set([...ids].filter((x) => x != null));
  const titels = new Map(); // genormaliseerde titel -> Set van jaren (null = onbekend)
  for (const k of keys) {
    if (!k) continue;
    const i = k.lastIndexOf('|');
    const t = normTitel(i >= 0 ? k.slice(0, i) : k);
    if (!t) continue;
    const y = i >= 0 ? (parseInt(k.slice(i + 1), 10) || null) : null;
    if (!titels.has(t)) titels.set(t, new Set());
    titels.get(t).add(y);
  }
  return (f) => {
    if (!f) return false;
    if (f.id != null && idSet.has(f.id)) return true;
    const y = parseInt(f.year, 10) || null;
    for (const titel of [f.title, f.orig, f.name]) {
      const jaren = titels.get(normTitel(titel));
      if (!jaren) continue;
      if (!y) { if (jaren.has(null)) return true; continue; }
      if (jaren.has(y) || jaren.has(y - 1) || jaren.has(y + 1)) return true;
    }
    return false;
  };
}
