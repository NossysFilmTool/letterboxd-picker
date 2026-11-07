// De kaartjesdoos: welke picks heb je echt gekeken?
//
// Een pick levert een kaartje op, maar een pick is nog geen gekeken film: vaak
// kies je een paar keer achter elkaar, of zoek je alleen even. Een kaartje
// gaat pas de doos in ("afgescheurd") met bewijs, van sterk naar zwak:
//   1. letterboxd: je dagboek (diary.csv) heeft de film met een kijkdatum op
//      of na de pick, binnen 14 dagen; met jouw sterren van daar
//   2. antwoord:   je zei het zelf, bij de vraag na een avond
//   3. gezien:     je markeerde de film binnen 14 dagen als gezien, of gaf
//      hem sterren
// Een pick op zich, opnieuw kiezen of de trailer openen telt niet. Doorklikken
// naar een dienst of het kaartje delen zet het kaartje alleen vooraan in de
// vraag. Zonder bewijs verloopt een kaartje na 14 dagen, zonder melding.
//
// Een kaartje: { id, key, name, year, datum (ISO), bron: 'pick'|'avond',
//   personen, doorgeklikt?, antwoord?: 'gekeken'|'niet', sterren?, beantwoord? }
// Bewijs wordt niet in het kaartje bewaard maar steeds opnieuw afgeleid, zodat
// een latere Letterboxd-import oude kaartjes alsnog kan afscheuren.

const UUR = 3600e3;
const DAG = 24 * UUR;
export const VENSTER = 14 * DAG;      // zo lang kan bewijs nog komen
export const AVOND_GAT = 4 * UUR;     // picks binnen 4 uur horen bij één avond
export const VRAAG_NA = 6 * UUR;      // de vraag komt pas de volgende ochtend
const MAX_KAARTJES = 2000;

const tijd = (iso) => Date.parse(iso);
// Kalenderdag in de eigen tijdzone, als 'YYYY-MM-DD' (zoals Letterboxd)
export function lokaleDag(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function nieuwKaartje(film, { bron = 'pick', personen = 1, nu = new Date() } = {}) {
  const datum = nu.toISOString();
  return { id: `${datum}|${film.key}`, key: film.key, name: film.name, year: film.year || null, datum, bron, personen };
}

// Erbij, nieuwste eerst; dezelfde film op dezelfde avond telt één keer
export function voegKaartjeToe(lijst, kaartje) {
  const t = tijd(kaartje.datum);
  if (lijst.some((k) => k.key === kaartje.key && Math.abs(tijd(k.datum) - t) < AVOND_GAT)) return lijst;
  return [kaartje, ...lijst].slice(0, MAX_KAARTJES);
}

// De eenmalige start: kaartjes uit de pick-geschiedenis, met de antwoorden op
// de oude "Gekeken?"-vraag (per pick-datum: 'rated' | 'seen' | 'no')
export function kaartjesUitGeschiedenis(history = [], followups = {}, ownRatings = {}) {
  let lijst = [];
  [...history].reverse().forEach((h) => {
    if (!h?.key || !h.date) return;
    const k = { id: `${h.date}|${h.key}`, key: h.key, name: h.name, year: h.year || null, datum: h.date, bron: 'pick', personen: 1 };
    const a = followups[h.date];
    if (a === 'rated' || a === 'seen') {
      k.antwoord = 'gekeken';
      k.beantwoord = h.date;
      if (a === 'rated' && ownRatings[h.key]?.rating) k.sterren = ownRatings[h.key].rating;
    } else if (a === 'no') {
      k.antwoord = 'niet';
    }
    lijst = voegKaartjeToe(lijst, k);
  });
  return lijst;
}

// Elk kaartje met zijn stand: 'gekeken' (in de doos), 'open', 'niet' of
// 'verlopen', plus bewijs, sterren en kijkdatum.
export function beoordeelKaartjes(kaartjes = [], { diary = [], gezienOp = {}, ownRatings = {}, nu = Date.now() } = {}) {
  const nieuwsteEerst = [...kaartjes].sort((a, b) => tijd(b.datum) - tijd(a.datum));
  const dagboekGebruikt = new Set();
  const gezienGebruikt = new Set();
  const sterrenGebruikt = new Set();
  return nieuwsteEerst.map((k) => {
    const t = tijd(k.datum);
    const vanDag = lokaleDag(t);
    const totDag = lokaleDag(t + VENSTER);
    const binnen = (ms) => ms >= t && ms <= t + VENSTER;

    if (k.antwoord === 'gekeken') {
      return { ...k, status: 'gekeken', bewijs: 'antwoord', sterren: k.sterren ?? null, gekekenOp: k.beantwoord || k.datum };
    }
    if (k.antwoord === 'niet') return { ...k, status: 'niet', bewijs: null, sterren: null, gekekenOp: null };

    // 1. Letterboxd-dagboek: elke dagboekregel scheurt hooguit één kaartje
    const i = diary.findIndex((d, idx) => !dagboekGebruikt.has(idx) && d.key === k.key
      && d.watchedDate >= vanDag && d.watchedDate <= totDag);
    if (i >= 0) {
      dagboekGebruikt.add(i);
      const d = diary[i];
      return { ...k, status: 'gekeken', bewijs: 'letterboxd', sterren: d.rating ?? null, gekekenOp: d.watchedDate };
    }
    // 2. Zelf als gezien gemarkeerd, of sterren gegeven, binnen het venster
    const eigen = ownRatings[k.key];
    const gezien = gezienOp[k.key] != null ? tijd(gezienOp[k.key]) : null;
    if (gezien != null && binnen(gezien) && !gezienGebruikt.has(k.key)) {
      gezienGebruikt.add(k.key);
      const sterren = eigen?.at && binnen(eigen.at) ? eigen.rating : null;
      return { ...k, status: 'gekeken', bewijs: 'gezien', sterren, gekekenOp: new Date(gezien).toISOString() };
    }
    if (eigen?.at && binnen(eigen.at) && !sterrenGebruikt.has(k.key)) {
      sterrenGebruikt.add(k.key);
      return { ...k, status: 'gekeken', bewijs: 'gezien', sterren: eigen.rating, gekekenOp: new Date(eigen.at).toISOString() };
    }
    return { ...k, status: nu - t > VENSTER ? 'verlopen' : 'open', bewijs: null, sterren: null, gekekenOp: null };
  });
}

// Picks die dicht op elkaar zitten vormen één avond; nieuwste avond eerst
export function avondenVan(kaartjes) {
  const oplopend = [...kaartjes].sort((a, b) => tijd(a.datum) - tijd(b.datum));
  const avonden = [];
  oplopend.forEach((k) => {
    const laatste = avonden[avonden.length - 1];
    if (laatste && tijd(k.datum) - tijd(laatste[laatste.length - 1].datum) <= AVOND_GAT) laatste.push(k);
    else avonden.push([k]);
  });
  return avonden.reverse();
}

// De ene vraag: over de laatste avond die minstens 6 uur geleden eindigde,
// alleen als daar nog niets over bekend is. Oudere avonden komen nooit meer
// aan de beurt (geen stapel vragen); die verlopen vanzelf. De kaartjes waar je
// doorklikte staan vooraan, daarna de laatst gekozen.
export function vraagAvond(beoordeeld, nu = Date.now()) {
  const avond = avondenVan(beoordeeld).find((a) => nu - tijd(a[a.length - 1].datum) >= VRAAG_NA);
  if (!avond) return null;
  if (nu - tijd(avond[0].datum) > VENSTER) return null;
  if (!avond.every((k) => k.status === 'open')) return null;
  return [...avond].sort((a, b) => (Number(!!b.doorgeklikt) - Number(!!a.doorgeklikt)) || (tijd(b.datum) - tijd(a.datum)));
}

// De doos: afgescheurde kaartjes, laatst gekeken eerst
export function inDeDoos(beoordeeld) {
  return beoordeeld.filter((k) => k.status === 'gekeken')
    .sort((a, b) => String(b.gekekenOp).localeCompare(String(a.gekekenOp)));
}
