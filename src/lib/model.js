// Fase 8: het geleerde model. Welke signalen voorspellen bij jóu een
// favoriet? Dat leren we uit je eigen beoordelingen, op dezelfde manier als
// de meetlat meet: verberg een film die je beoordeelde, bouw Voor jou opnieuw
// op uit de rest, en kijk waar hij uitkomt.
//   - een film die je 4★+ gaf hoort boven willekeurige kandidaten
//   - een film die je 2,5★ of lager gaf hoort onder je favorieten
//   - je shortlist telt als "ja", wat je met x afwees als "nee"
// Het model is een paarsgewijze logistische regressie op de kenmerken uit
// kenmerken.js, met een rem richting de vaste weging: met weinig gegevens
// blijft het daar dichtbij. Of het beter is, toetsen we eerlijk: op
// favorieten die het model tijdens het leren niet zag (kruisvalidatie).
import { KENMERKEN, KENMERKEN_SLEUTEL, VASTE_WEGING, scoorMetModel } from './kenmerken.js';
import { alleRatings, bouwRonde, steekproef, MEET_MIN, STANDAARD_OPTIES } from './kandidaten.js';

const D = KENMERKEN.length;

// Kleine voorspelbare toevalsgenerator: dezelfde gegevens geven hetzelfde model
function toeval(zaad) {
  let a = zaad >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const trek = (lijst, n, rnd) => {
  if (lijst.length <= n) return lijst.slice();
  const uit = []; const gezien = new Set();
  while (uit.length < n) {
    const i = Math.floor(rnd() * lijst.length);
    if (!gezien.has(i)) { gezien.add(i); uit.push(lijst[i]); }
  }
  return uit;
};

// Stap 1: gegevens verzamelen (de trage stap; elke ronde bouwt Voor jou op)
//   data: { watchlist, meta, ratedFilms, ratings, seenSet, oeuvres, details, regio, shortlist, skipped }
export async function verzamelVoorbeelden(data, {
  opties = STANDAARD_OPTIES, maxFav = 40, maxPos = 30, maxNeg = 30, negPerRonde = 40,
  onVoortgang = () => {}, pauze = () => new Promise((r) => setTimeout(r, 0)), zaad = 7,
} = {}) {
  const rnd = toeval(zaad);
  const alle = alleRatings(data).filter((f) => data.meta[f.key]?.id);
  const fav = steekproef(alle.filter((f) => f.rating >= 4.5), maxFav);
  if (fav.length < MEET_MIN) return { genoeg: false, favorieten: fav.length };
  const pos = steekproef(alle.filter((f) => f.rating >= 4 && f.rating < 4.5), maxPos);
  const neg = steekproef(alle.filter((f) => f.rating <= 2.5), maxNeg);
  const taken = [...fav.map((f) => ['fav', f]), ...pos.map((f) => ['pos', f]), ...neg.map((f) => ['neg', f])];
  const totaal = taken.length + 1;
  const records = [];
  for (let i = 0; i < taken.length; i++) {
    const [soort, f] = taken[i];
    const { gerangschikt } = bouwRonde(data, new Set([f.key]), { opties });
    const id = data.meta[f.key].id;
    const idx = gerangschikt.findIndex((x) => x.id === id);
    const rest = idx >= 0 ? [...gerangschikt.slice(0, idx), ...gerangschikt.slice(idx + 1)] : gerangschikt;
    const rec = { soort, naam: f.name, label: soort === 'neg' ? 0 : 1, km: idx >= 0 ? gerangschikt[idx].km : null, rangBasis: idx >= 0 ? idx + 1 : null };
    if (soort !== 'neg') rec.negatief = trek(rest, negPerRonde, rnd).map((x) => x.km);
    // De favorieten zijn ook de toets: daarvoor bewaren we de hele poel
    if (soort === 'fav') {
      const poel = new Float32Array(rest.length * D);
      rest.forEach((x, j) => poel.set(x.km, j * D));
      rec.poel = poel;
    }
    records.push(rec);
    onVoortgang(i + 1, totaal);
    await pauze();
  }
  // Je feedback in Voor jou: shortlist = ja, x = nee (behalve "al gezien")
  const { gerangschikt: vol } = bouwRonde(data, new Set(), { opties });
  const ja = new Set((data.shortlist || []).map((s) => s.id));
  const nee = new Set((data.skipped || []).filter((s) => typeof s === 'object' && s.reden !== 'gezien').map((s) => s.id));
  const anders = vol.filter((x) => !ja.has(x.id) && !nee.has(x.id));
  vol.forEach((x) => {
    if (ja.has(x.id)) records.push({ soort: 'ja', naam: x.title, label: 1, km: x.km, negatief: trek(anders, negPerRonde, rnd).map((y) => y.km) });
    else if (nee.has(x.id)) records.push({ soort: 'nee', naam: x.title, label: 0, km: x.km });
  });
  onVoortgang(totaal, totaal);
  return { genoeg: true, records, favorieten: fav.length };
}

// Paren (beter, slechter) met een gewicht. Elke positieve ronde telt samen
// voor 1, verdeeld over zijn willekeurige tegenvoorbeelden; elke lage
// beoordeling en elke x telt samen voor 1, verdeeld over alle positieve.
function maakParen(records) {
  const paren = [];
  const pos = records.filter((r) => r.label === 1 && r.km);
  const neg = records.filter((r) => r.label === 0 && r.km);
  pos.forEach((p) => p.negatief?.forEach((n) => paren.push([p.km, n, 1 / p.negatief.length])));
  if (pos.length) neg.forEach((n) => pos.forEach((p) => paren.push([p.km, n.km, 1 / pos.length])));
  return paren;
}

// De vaste weging als vertrekpunt, in gestandaardiseerde eenheden
const vastePrior = (sd) => KENMERKEN.map((k, i) => (VASTE_WEGING[k] || 0) * sd[i]);

function verlies(w, verschillen, gewichten) {
  let L = 0;
  for (let p = 0; p < gewichten.length; p++) {
    let s = 0;
    for (let i = 0; i < D; i++) s += w[i] * verschillen[p * D + i];
    L += gewichten[p] * (s > 30 ? Math.exp(-s) : Math.log1p(Math.exp(-s)));
  }
  return L;
}

// Stap 2: leren (snel; puur rekenwerk op de verzamelde paren)
// lambda: de rem richting de vaste weging (0,02 gaf op een echt profiel de
// beste eerlijke toets; 0,005 tot 0,2 zat er dicht bij)
export function leer(records, { lambda = 0.02, iteraties = 400, stap = 0.5 } = {}) {
  const paren = maakParen(records);
  if (paren.length < 20) return null;
  // Standaardiseren op alle vectoren in de paren
  const mu = new Array(D).fill(0); const sd = new Array(D).fill(0);
  let n = 0;
  paren.forEach(([a, b]) => { [a, b].forEach((x) => { n++; for (let i = 0; i < D; i++) mu[i] += x[i]; }); });
  for (let i = 0; i < D; i++) mu[i] /= n;
  paren.forEach(([a, b]) => { [a, b].forEach((x) => { for (let i = 0; i < D; i++) sd[i] += (x[i] - mu[i]) ** 2; }); });
  for (let i = 0; i < D; i++) sd[i] = Math.sqrt(sd[i] / n) || 1;
  const verschillen = new Float64Array(paren.length * D);
  const gewichten = new Float64Array(paren.length);
  let G = 0;
  paren.forEach(([a, b, g], p) => {
    for (let i = 0; i < D; i++) verschillen[p * D + i] = (a[i] - b[i]) / sd[i];
    gewichten[p] = g; G += g;
  });
  for (let p = 0; p < gewichten.length; p++) gewichten[p] /= G;

  // Vertrekpunt: de vaste weging, op de schaal die het best bij je paren past
  const basis = vastePrior(sd);
  let besteC = 1; let besteL = Infinity;
  for (let c = 1; c <= 400; c *= 1.5) {
    const L = verlies(basis.map((v) => v * c), verschillen, gewichten);
    if (L < besteL) { besteL = L; besteC = c; }
  }
  const prior = basis.map((v) => v * besteC);

  // Gradiëntafdaling met een rem (lambda) richting het vertrekpunt
  const w = prior.slice();
  const grad = new Float64Array(D);
  for (let it = 0; it < iteraties; it++) {
    for (let i = 0; i < D; i++) grad[i] = 2 * lambda * (w[i] - prior[i]);
    for (let p = 0; p < gewichten.length; p++) {
      let s = 0;
      for (let i = 0; i < D; i++) s += w[i] * verschillen[p * D + i];
      const f = gewichten[p] / (1 + Math.exp(s));
      for (let i = 0; i < D; i++) grad[i] -= f * verschillen[p * D + i];
    }
    for (let i = 0; i < D; i++) w[i] -= stap * grad[i];
  }
  // De spreiding van de modelscores over alle voorbeelden: de maat voor de
  // straf op wat je expliciet afwees (zie kenmerken.js)
  const scores = [];
  paren.forEach(([a, b]) => [a, b].forEach((x) => {
    let s = 0;
    for (let i = 0; i < D; i++) s += w[i] * ((x[i] - mu[i]) / sd[i]);
    scores.push(s);
  }));
  const gem = scores.reduce((t, s) => t + s, 0) / scores.length;
  const spreiding = Math.sqrt(scores.reduce((t, s) => t + (s - gem) ** 2, 0) / scores.length) || 1;
  return { w, mu, sd, prior, spreiding, kenmerken: KENMERKEN_SLEUTEL, paren: paren.length };
}

// Waar komt een verborgen favoriet uit met dit model? (1 = bovenaan)
function rangMet(model, rec) {
  if (!rec.km) return null;
  const eigen = scoorMetModel(model, rec.km);
  let hoger = 0;
  const x = new Array(D);
  for (let j = 0; j < rec.poel.length / D; j++) {
    for (let i = 0; i < D; i++) x[i] = rec.poel[j * D + i];
    if (scoorMetModel(model, x) > eigen) hoger++;
  }
  return hoger + 1;
}

const samenvatting = (rangen) => {
  const s = rangen.filter((r) => r != null).sort((a, b) => a - b);
  return {
    top12: s.filter((r) => r <= 12).length,
    top50: s.filter((r) => r <= 50).length,
    mediaan: s.length ? s[Math.floor(s.length / 2)] : null,
    proef: rangen.length,
  };
};

// Stap 3: eerlijk toetsen (twee helften: leer op de ene, toets op de andere)
// en het definitieve model leren op alles.
export function leerEnToets(records, instellingen = {}) {
  const favs = records.filter((r) => r.soort === 'fav');
  const rangModel = new Array(favs.length).fill(null);
  for (let helft = 0; helft < 2; helft++) {
    const toets = new Set(favs.filter((_, i) => i % 2 === helft));
    const model = leer(records.filter((r) => !toets.has(r)), instellingen);
    if (!model) return null;
    favs.forEach((r, i) => { if (toets.has(r)) rangModel[i] = rangMet(model, r); });
  }
  const model = leer(records, instellingen);
  if (!model) return null;
  const basis = samenvatting(favs.map((r) => r.rangBasis));
  const metModel = samenvatting(rangModel);
  // Beter = meer favorieten in de top 50 en niet minder in de top 12 (of
  // evenveel in de top 50 en meer in de top 12)
  const beter = (metModel.top50 > basis.top50 && metModel.top12 >= basis.top12)
    || (metModel.top50 === basis.top50 && metModel.top12 > basis.top12);
  const tel = (soort) => records.filter((r) => r.soort === soort && r.km).length;
  return {
    ...model,
    at: Date.now(),
    beter,
    aan: beter,
    toets: { basis, model: metModel },
    gegevens: { favorieten: tel('fav'), hoog: tel('pos'), laag: tel('neg'), ja: tel('ja'), nee: tel('nee') },
  };
}

// Wat het model leerde, in gewone woorden: de kenmerken die het verst van de
// vaste weging afweken (in gestandaardiseerde eenheden)
export function watGeleerd(model, n = 4) {
  if (!model?.prior) return [];
  return KENMERKEN
    .map((k, i) => ({ kenmerk: k, verschil: model.w[i] - model.prior[i] }))
    .filter((x) => Math.abs(x.verschil) > 0.05)
    .sort((a, b) => Math.abs(b.verschil) - Math.abs(a.verschil))
    .slice(0, n)
    .map((x) => ({ kenmerk: x.kenmerk, richting: x.verschil > 0 ? 'meer' : 'minder' }));
}
