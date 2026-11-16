// Zaalstemming (Filmavond): iedereen stemt op de eigen telefoon, één scherm
// is de zaal. Het scherm heeft de watchlist, zet de rondes en telt; de
// telefoons hebben niets nodig behalve een naam. De zaal leeft in de Worker
// (worker/worker.js, /zaal), twaalf uur lang.
//
// Het verloop: iedereen kiest een 1e en een 2e genre, de slimme pick kiest
// daar vijf films uit de pot (plus drie aanraders van buiten de lijst, zie
// lib/aanraders.js), de zaal kijkt de trailers, en dan kiest iedereen een
// 1e en een 2e film. Een 1e keus is 2 punten, een 2e keus 1 punt. Gelijkspel
// lossen de regels hieronder op, zonder dat iemand hoeft te overleggen.
import { PROXY_URL } from './tmdb.js';
import { nossyScore, pickWinner } from './pick.js';

export const zaalBeschikbaar = () => !!PROXY_URL;
export const MAX_SPELERS = 12;
export const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const wacht = (ms) => new Promise((r) => setTimeout(r, ms));

// KV schrijft hooguit één keer per seconde naar dezelfde sleutel. Botsen
// twee schrijvers, dan geeft de Worker 429 en proberen we het zo opnieuw.
async function vraag(pad, body, pogingen = 3) {
  for (let i = 0; ; i++) {
    const res = await fetch(`${PROXY_URL}${pad}`, body
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : undefined);
    let data = null;
    try { data = await res.json(); } catch { /* geen json */ }
    if (res.status === 429 && i < pogingen - 1) { await wacht(1100 + Math.random() * 700); continue; }
    if (!res.ok) throw new Error(data?.error || `HTTP_${res.status}`);
    return data;
  }
}

// Een Worker van vóór de zaal kent /zaal niet: dan WORKER_OUD
export async function maakZaal() {
  let data;
  try { data = await vraag('/zaal/new', {}); } catch (e) {
    if (/^HTTP_40[45]$/.test(e.message) || e.message === 'NOT_FOUND') throw new Error('WORKER_OUD');
    throw e;
  }
  if (!data?.versie || !data.code || !data.geheim) throw new Error('WORKER_OUD');
  return data;
}
export const haalZaal = (code) => vraag(`/zaal/${code}`);
export const zetZaal = (code, geheim, staat) => vraag(`/zaal/${code}/zet`, { geheim, staat });
export const standZaal = (code, geheim) => vraag(`/zaal/${code}/stand`, { geheim });
export const doeMee = (code, naam, token) => vraag(`/zaal/${code}/meedoen`, { naam, token });
export const stuurStem = (code, naam, token, ronde, keuze) => vraag(`/zaal/${code}/stem`, { naam, token, ronde, keuze });

// Vier letters, zonder I en O (die lijken op 1 en 0)
export function zaalCode(invoer) {
  const c = String(invoer || '').toUpperCase().replace(/[^A-Z]/g, '');
  return c.length === 4 && [...c].every((l) => LETTERS.includes(l)) ? c : null;
}

export function nieuwToken() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

const zelfdeNaam = (a, b) => String(a).toLocaleLowerCase() === String(b).toLocaleLowerCase();
export const doetMee = (spelers, naam) => (spelers || []).some((n) => zelfdeNaam(n, naam));

// Wat iedereen in een ronde koos: { naam: keuze }, alleen wie er stemde
export function keuzesIn(stemmen, spelers, ronde) {
  const uit = {};
  (spelers || []).forEach((n) => {
    const k = stemmen?.[n]?.[String(ronde)];
    if (k != null) uit[n] = k;
  });
  return uit;
}

// YouTube-id uit de trailerlink die TMDB levert
export function youtubeId(url) {
  const m = String(url || '').match(/(?:[?&]v=|youtu\.be\/|\/embed\/)([\w-]{6,20})/);
  return m ? m[1] : null;
}

// Wat de telefoons van een film te zien krijgen. Een aanrader (niet van de
// lijst) draagt waarom: bij hoeveel films op de lijst TMDB hem aanraadt, of
// dat het een parel is (hoog cijfer, weinig stemmen).
export function filmVoorZaal(f, m, aanrader = null) {
  const film = {
    key: f.key, name: f.name, year: f.year || null,
    poster: m?.poster || null, runtime: m?.runtime || null,
    trailer: youtubeId(m?.trailer), score: nossyScore(m),
  };
  if (aanrader) {
    Object.assign(film, { aanrader: true, bronnen: aanrader.bronnen || 0, via: (aanrader.via || []).slice(0, 2), parel: !!aanrader.parel, votes: m?.votes || null });
  }
  return film;
}

const heeft = (meta, f, g) => (meta[f.key]?.genres || []).includes(g);

// De genres op tafel: wat in de pot genoeg films heeft (liefst vijf, anders
// drie), het meest eerst
export function genreOpties(pool, meta, max = 8) {
  const n = {};
  pool.forEach((f) => (meta[f.key]?.genres || []).forEach((g) => { n[g] = (n[g] || 0) + 1; }));
  const genoeg = Object.values(n).filter((c) => c >= 5).length >= 2 ? 5 : 3;
  return Object.entries(n)
    .filter(([, c]) => c >= genoeg)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([g, c]) => ({ id: g, naam: g, n: c }));
}

// Een stem is [1e keus, 2e keus], elk een id of null. Tik je 1e of 2e bij
// iets, dan staat het daar; nog eens tikken haalt het weg. Tik je 1e bij je
// 2e keus (of andersom), dan wisselen ze. Leeg ([]) is geen stem.
export function stemZet(huidig, id, plek) {
  let [e = null, t = null] = huidig || [];
  if (plek === 0) {
    if (e === id) e = null;
    else { if (t === id) t = e; e = id; }
  } else if (t === id) t = null;
  else { if (e === id) e = t; t = id; }
  return e == null && t == null ? [] : [e, t];
}

// Tellen: 2 punten voor een 1e keus, 1 voor een 2e. Daarnaast op hoeveel
// lijstjes iets staat, en hoe vaak als 1e keus.
export function telStemmen(ids, stemmen) {
  const punten = {};
  const lijstjes = {};
  const eersten = {};
  ids.forEach((id) => { punten[id] = 0; lijstjes[id] = 0; eersten[id] = 0; });
  stemmen.forEach((s) => {
    if (!Array.isArray(s)) return;
    const [e, t] = s;
    if (e != null && e in punten) { punten[e] += 2; lijstjes[e] += 1; eersten[e] += 1; }
    if (t != null && t !== e && t in punten) { punten[t] += 1; lijstjes[t] += 1; }
  });
  return { punten, lijstjes, eersten };
}

// Wie bovenaan staat: de meeste punten. Gelijk? Dan wat op de meeste
// lijstjes staat: waar de zaal het breedst achter staat (kiezen twee mensen
// elk een andere favoriet maar dezelfde 2e keus, dan wint die 2e keus).
// Zijn punten en lijstjes allebei gelijk, dan ook de 1e keuzes (punten min
// lijstjes), dus dan is het echt gelijk.
export function bovenaan(ids, telling) {
  const top = (lijst, maat) => {
    const max = Math.max(...lijst.map((id) => maat[id]));
    return lijst.filter((id) => maat[id] === max);
  };
  const t1 = top(ids, telling.punten);
  if (t1.length === 1) return { ids: t1, wijze: 'meeste' };
  const t2 = top(t1, telling.lijstjes);
  if (t2.length === 1) return { ids: t2, wijze: 'breed' };
  return { ids: t2, wijze: 'gelijk' };
}

// De uitslag van de genreronde. Echt gelijk? Zijn er genoeg films die alle
// gelijke genres tegelijk zijn, dan worden het die (allebei); anders van
// elk wat, de grootste genres eerst. Niemand gestemd: alles uit de pot.
export function uitslagGenre({ opties, stemmen, pool, meta, nodig = 5 }) {
  const ids = opties.map((o) => o.id);
  const telling = telStemmen(ids, stemmen);
  if (!Object.values(telling.punten).some(Boolean)) return { namen: [], wijze: 'alles', telling };
  const b = bovenaan(ids, telling);
  const punten = telling.punten[b.ids[0]];
  if (b.wijze !== 'gelijk') return { namen: b.ids, wijze: b.wijze, punten, telling };
  if (pool.filter((f) => b.ids.every((g) => heeft(meta, f, g))).length >= nodig) return { namen: b.ids, wijze: 'allebei', punten, telling };
  const grootte = (id) => opties.find((o) => o.id === id)?.n || 0;
  return { namen: [...b.ids].sort((a, c) => grootte(c) - grootte(a)).slice(0, 3), wijze: 'elkWat', punten, telling };
}

// Vijf films van de lijst met de slimme pick (lib/pick.js: hoger cijfer,
// meer kans; recent gekozen, minder). Films met een trailer gaan voor, als
// het er genoeg zijn. Bij "van elk wat" eerst één film per genre.
export function kiesFilms(pool, meta, genre, history = [], n = 5, rnd = Math.random) {
  const namen = genre?.namen || [];
  let basis = pool;
  if (namen.length && genre.wijze === 'allebei') basis = pool.filter((f) => namen.every((g) => heeft(meta, f, g)));
  else if (namen.length && genre.wijze !== 'alles') basis = pool.filter((f) => namen.some((g) => heeft(meta, f, g)));
  if (!basis.length) basis = pool;
  const metTrailer = basis.filter((f) => meta[f.key]?.trailer);
  const bron = metTrailer.length >= n ? metTrailer : basis;
  const gekozen = [];
  const trek = (uit) => {
    const f = pickWinner(uit.filter((x) => !gekozen.includes(x)), meta, true, history, rnd);
    if (f) gekozen.push(f);
    return !!f;
  };
  if (genre?.wijze === 'elkWat') {
    namen.forEach((g) => {
      if (gekozen.length < n && !trek(bron.filter((f) => heeft(meta, f, g)))) trek(basis.filter((f) => heeft(meta, f, g)));
    });
  }
  while (gekozen.length < n && trek(bron));
  while (gekozen.length < n && trek(basis));
  return gekozen;
}

// De uitslag van de filmronde: zoals hierboven, en is het echt gelijk, dan
// het lot, tussen alleen die films.
export function uitslagFilm(films, stemmen, rnd = Math.random) {
  const ids = films.map((f) => f.key);
  const telling = telStemmen(ids, stemmen);
  const b = bovenaan(ids, telling);
  const key = b.wijze === 'gelijk' ? b.ids[Math.floor(rnd() * b.ids.length)] : b.ids[0];
  return { key, wijze: b.wijze === 'gelijk' ? 'lot' : b.wijze, ...telling, kandidaten: b.ids };
}