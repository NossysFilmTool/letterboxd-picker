// Zaalstemming (Filmavond): iedereen stemt op de eigen telefoon, één scherm
// is de zaal. Het scherm heeft de watchlist, zet de rondes en telt; de
// telefoons hebben niets nodig behalve een naam. De zaal leeft in de Worker
// (worker/worker.js, /zaal), twaalf uur lang.
//
// Het verloop: iedereen stemt op een genre, de slimme pick kiest daar drie
// films uit de pot, de zaal kijkt de trailers, en dan stemt iedereen op een
// favoriet en een tweede keus. Gelijkspel lossen de regels hieronder op,
// zonder dat iemand hoeft te overleggen.
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

// Wat de telefoons van een film te zien krijgen
export function filmVoorZaal(f, m) {
  return {
    key: f.key, name: f.name, year: f.year || null,
    poster: m?.poster || null, runtime: m?.runtime || null,
    trailer: youtubeId(m?.trailer), score: nossyScore(m),
  };
}

const heeft = (meta, f, g) => (meta[f.key]?.genres || []).includes(g);

// De genres op tafel: alles met minstens drie films in de pot, het meest eerst
export function genreOpties(pool, meta, max = 8) {
  const n = {};
  pool.forEach((f) => (meta[f.key]?.genres || []).forEach((g) => { n[g] = (n[g] || 0) + 1; }));
  return Object.entries(n)
    .filter(([, c]) => c >= 3)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([g, c]) => ({ id: g, naam: g, n: c }));
}

// De uitslag van een genreronde. Meeste stemmen wint. Bij gelijkspel:
//   1. allebei: zijn er minstens drie films die alle gelijke genres tegelijk
//      zijn, dan worden het die. Iedereen krijgt zijn genre.
//   2. beslissende ronde: stemde iemand op iets anders, dan stemt iedereen
//      opnieuw tussen alleen de gelijke genres. Wie buiten de gelijkspel
//      stemde, beslist.
//   3. van elk wat: nog steeds gelijk (of niemand stemde erbuiten), dan
//      komen de drie films uit de gelijke genres, één per genre.
// Geeft { klaar: { namen, wijze, stemmen } } of { opnieuw: [ids] }.
export function uitslagGenre({ opties, keuzes, pool, meta, beslissend = false }) {
  const telling = Object.fromEntries(opties.map((o) => [o.id, 0]));
  keuzes.forEach((k) => { if (k in telling) telling[k] += 1; });
  const totaal = Object.values(telling).reduce((a, b) => a + b, 0);
  if (!totaal) return { klaar: { namen: [], wijze: 'alles' }, telling };
  const max = Math.max(...Object.values(telling));
  const gelijk = opties.filter((o) => telling[o.id] === max).map((o) => o.id);
  if (gelijk.length === 1) return { klaar: { namen: gelijk, wijze: beslissend ? 'beslissend' : 'meeste', stemmen: max }, telling };
  if (pool.filter((f) => gelijk.every((g) => heeft(meta, f, g))).length >= 3) {
    return { klaar: { namen: gelijk, wijze: 'allebei', stemmen: max }, telling };
  }
  if (!beslissend && totaal > max * gelijk.length) return { opnieuw: gelijk, telling };
  const grootte = (id) => opties.find((o) => o.id === id)?.n || 0;
  const namen = [...gelijk].sort((a, b) => grootte(b) - grootte(a)).slice(0, 3);
  return { klaar: { namen, wijze: 'elkWat', stemmen: max }, telling };
}

// Drie films met de slimme pick (lib/pick.js: hoger cijfer, meer kans;
// recent gekozen, minder). Films met een trailer gaan voor, als het er
// genoeg zijn. Bij "van elk wat" eerst één film per genre.
export function kiesDrie(pool, meta, genre, history = [], rnd = Math.random) {
  const namen = genre?.namen || [];
  let basis = pool;
  if (namen.length && genre.wijze === 'allebei') basis = pool.filter((f) => namen.every((g) => heeft(meta, f, g)));
  else if (namen.length && genre.wijze !== 'alles') basis = pool.filter((f) => namen.some((g) => heeft(meta, f, g)));
  if (basis.length < 3) basis = pool;
  const metTrailer = basis.filter((f) => meta[f.key]?.trailer);
  const bron = metTrailer.length >= 3 ? metTrailer : basis;
  const gekozen = [];
  const trek = (uit) => {
    const f = pickWinner(uit.filter((x) => !gekozen.includes(x)), meta, true, history, rnd);
    if (f) gekozen.push(f);
    return !!f;
  };
  if (genre?.wijze === 'elkWat') {
    namen.forEach((g) => {
      if (gekozen.length < 3 && !trek(bron.filter((f) => heeft(meta, f, g)))) trek(basis.filter((f) => heeft(meta, f, g)));
    });
  }
  while (gekozen.length < 3 && trek(bron));
  while (gekozen.length < 3 && trek(basis));
  return gekozen;
}

// Tikken in de filmronde: de eerste tik is je favoriet, een tik op een andere
// film je tweede keus, nog eens op de tweede keus haalt die weg.
export function tikFilm(huidig, key) {
  const [fav, tweede] = huidig || [];
  if (!fav || key === fav) return [key];
  if (key === tweede) return [fav];
  return [fav, key];
}

// De uitslag van de filmronde. Elke stem is [favoriet, tweede keus?].
//   1. de meeste favorieten wint;
//   2. gelijk? Dan wint van de gelijke films die met de meeste tweede keuzes:
//      wat de rest van de zaal ervan vindt, geeft de doorslag;
//   3. nog steeds gelijk? Dan het lot, tussen alleen die films.
export function uitslagFilm(films, stemmen, rnd = Math.random) {
  const telling = Object.fromEntries(films.map((f) => [f.key, 0]));
  const tweede = Object.fromEntries(films.map((f) => [f.key, 0]));
  stemmen.forEach((s) => {
    if (!Array.isArray(s)) return;
    if (s[0] in telling) telling[s[0]] += 1;
    if (s[1] in tweede && s[1] !== s[0]) tweede[s[1]] += 1;
  });
  const max = Math.max(...Object.values(telling));
  const gelijk = films.map((f) => f.key).filter((k) => telling[k] === max);
  if (gelijk.length === 1) return { key: gelijk[0], wijze: 'meeste', telling, tweede, kandidaten: gelijk };
  const max2 = Math.max(...gelijk.map((k) => tweede[k]));
  const nogGelijk = gelijk.filter((k) => tweede[k] === max2);
  if (nogGelijk.length === 1) return { key: nogGelijk[0], wijze: 'tweede', telling, tweede, kandidaten: gelijk };
  return { key: nogGelijk[Math.floor(rnd() * nogGelijk.length)], wijze: 'lot', telling, tweede, kandidaten: nogGelijk };
}
