// Gevonden-kaartjes: films die de tool voor je vond en die je daarna keek.
//
// Een film geldt als vondst zodra je hem in Verken tegenkomt en er iets mee
// doet: zijn filmkaart openen (Voor jou, Vanavond, Zoeken, Meer zoals deze),
// hem op je shortlist zetten, of doorklikken naar een dienst. Films die je al
// gezien of beoordeeld had, of die al op je watchlist stonden, tellen niet:
// die vond de tool niet voor je.
//
// Een vondst wordt een kaartje in de doos met bewijs dat je hem daarna keek:
//   letterboxd: een log in je dagboek op of na de dag van de vondst (op naam
//               of op TMDB-nummer), binnen 60 dagen (shortlist of
//               doorklikken: 180 dagen)
//   gezien:     je markeerde hem als gezien of gaf sterren, minstens een uur
//               na de vondst (meteen "al gezien" betekent: die kende ik al)
// Stond hij vóór de vondst al in je dagboek, dan telt hij niet.
//
// Een vondst: { key, id, name, year, poster, bron: 'voorjou'|'zoeken'|
//   'vergelijkbaar', eerst, laatst, sterk } (tijden in ms)

const UUR = 3600e3;
const DAG = 24 * UUR;
const VENSTER_ZWAK = 60 * DAG;
const VENSTER_STERK = 180 * DAG;
const BEDENKTIJD = UUR;
const MAX_VONDSTEN = 1500;

const dag = (ms) => {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// Een vondst onthouden (of bijwerken); geeft de nieuwe verzameling terug
export function onthoudVondst(vondsten, film, { bron = 'voorjou', sterk = false, nu = Date.now() } = {}) {
  const oud = vondsten?.[film.key];
  const nieuw = {
    key: film.key,
    id: film.id ?? oud?.id ?? null,
    name: film.name,
    year: film.year || null,
    poster: film.poster || oud?.poster || null,
    bron: oud?.bron || bron,
    eerst: oud?.eerst || nu,
    laatst: nu,
    sterk: !!(oud?.sterk || sterk),
  };
  let uit = { ...(vondsten || {}), [film.key]: nieuw };
  // Opruimen: wat al een half jaar niets meer deed, en nooit meer dan het maximum
  const lijst = Object.values(uit).filter((v) => nu - v.laatst <= VENSTER_STERK);
  if (lijst.length !== Object.keys(uit).length || lijst.length > MAX_VONDSTEN) {
    uit = Object.fromEntries(lijst.sort((a, b) => b.laatst - a.laatst).slice(0, MAX_VONDSTEN).map((v) => [v.key, v]));
  }
  return uit;
}

// Twee verzamelingen samenvoegen (sync): per film de vroegste vondst, de
// laatste aanraking, en sterk als het ergens sterk was
export function voegVondstenSamen(a = {}, b = {}) {
  const uit = { ...(a || {}) };
  Object.values(b || {}).forEach((v) => {
    const o = uit[v.key];
    uit[v.key] = o ? { ...o, ...(v.laatst > o.laatst ? v : {}), eerst: Math.min(o.eerst, v.eerst), laatst: Math.max(o.laatst, v.laatst), sterk: o.sterk || v.sterk } : v;
  });
  return uit;
}

// De Gevonden-kaartjes, afgeleid uit je vondsten en het bewijs. Ze hebben
// een vast id per film (gevonden|key): een film kan er maar één opleveren.
// overslaan: ids en keys die al een (eigen) kaartje hebben
export function gevondenKaartjes(vondsten = {}, { diary = [], gezienOp = {}, ownRatings = {}, overslaanIds = new Set(), overslaanKeys = new Set() } = {}) {
  const uit = [];
  Object.values(vondsten || {}).forEach((v) => {
    const id = `gevonden|${v.key}`;
    if (overslaanIds.has(id) || overslaanKeys.has(v.key)) return;
    const venster = v.sterk ? VENSTER_STERK : VENSTER_ZWAK;
    const zelfde = (d) => d.key === v.key || (v.id != null && d.tmdbId === v.id);
    const vanaf = dag(v.eerst);
    // Al eerder gezien (in je dagboek vóór de vondst): geen vondst
    if (diary.some((d) => zelfde(d) && d.watchedDate < vanaf)) return;
    const tot = dag(v.laatst + venster);
    const log = diary.filter((d) => zelfde(d) && d.watchedDate >= vanaf && d.watchedDate <= tot)
      .sort((a, b) => a.watchedDate.localeCompare(b.watchedDate))[0];
    const basis = {
      id, key: v.key, name: v.name, year: v.year, poster: v.poster, datum: new Date(v.eerst).toISOString(),
      bron: 'gevonden', vondst: v.bron, personen: 1, status: 'gekeken',
    };
    if (log) {
      uit.push({ ...basis, bewijs: 'letterboxd', sterren: log.rating ?? null, gekekenOp: log.watchedDate });
      return;
    }
    const binnen = (ms) => ms >= v.eerst + BEDENKTIJD && ms <= v.laatst + venster;
    const gezien = gezienOp[v.key] != null ? Date.parse(gezienOp[v.key]) : null;
    const eigen = ownRatings[v.key];
    if (gezien != null && binnen(gezien)) {
      uit.push({ ...basis, bewijs: 'gezien', sterren: eigen?.rating ?? null, gekekenOp: new Date(gezien).toISOString() });
    } else if (eigen?.at && binnen(eigen.at)) {
      uit.push({ ...basis, bewijs: 'gezien', sterren: eigen.rating, gekekenOp: new Date(eigen.at).toISOString() });
    }
  });
  return uit;
}

// Recente logs uit je dagboek die (nog) niet in de doos zitten: daar kun je
// zelf "Gevonden via Nossy" op zeggen
export function recentGelogd(diary = [], inDoosKeys = new Set(), { nu = Date.now(), dagen = 30 } = {}) {
  const vanaf = dag(nu - dagen * DAG);
  const gezien = new Set();
  return diary.filter((d) => d.watchedDate >= vanaf && !inDoosKeys.has(d.key))
    .sort((a, b) => b.watchedDate.localeCompare(a.watchedDate))
    .filter((d) => (gezien.has(d.key) ? false : gezien.add(d.key)));
}
