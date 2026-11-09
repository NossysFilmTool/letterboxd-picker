// Letterboxd live: je openbare Letterboxd-dagboek meelezen, zonder export.
//
// Elke Letterboxd-gebruiker met een openbaar profiel heeft een RSS-feed met
// de laatste logs (letterboxd.com/<naam>/rss/), inclusief kijkdatum, sterren
// en het TMDB-nummer. De browser mag die niet zelf ophalen (CORS); de Worker
// geeft hem door (/lb/<naam>). Nieuwe logs komen in je dagboek (zo scheuren
// kaartjes vanzelf af), tellen als gezien, en hun sterren voeden je smaak.
import { PROXY_URL } from './tmdb.js';
import { filmKey } from './storage.js';

// "letterboxd.com/naam", "@naam" of "naam" wordt "naam"; ongeldig: null
export function normaliseerNaam(invoer) {
  const s = String(invoer || '').trim();
  const uitUrl = s.match(/letterboxd\.com\/([A-Za-z0-9_]+)/i);
  const naam = (uitUrl ? uitUrl[1] : s).replace(/^@/, '').replace(/\/+$/, '');
  return /^[A-Za-z0-9_]{1,40}$/.test(naam) ? naam : null;
}

// De feed (XML-tekst) naar dagboekregels, in dezelfde vorm als diary.csv
export function leesDagboekFeed(xml) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('FEED_ONLEESBAAR');
  const veld = (item, naam) => item.getElementsByTagName(naam)[0]?.textContent?.trim() || null;
  return [...doc.getElementsByTagName('item')].map((item) => {
    const titel = veld(item, 'letterboxd:filmTitle');
    const datum = veld(item, 'letterboxd:watchedDate');
    if (!titel || !datum) return null; // lijsten en andere berichten
    const jaar = parseInt(veld(item, 'letterboxd:filmYear')) || null;
    const sterren = veld(item, 'letterboxd:memberRating');
    return {
      key: filmKey(titel, jaar || ''),
      name: titel,
      year: jaar,
      watchedDate: datum,
      rewatch: veld(item, 'letterboxd:rewatch') === 'Yes',
      rating: sterren ? parseFloat(sterren) : null,
      tmdbId: parseInt(veld(item, 'tmdb:movieId')) || null,
    };
  }).filter(Boolean);
}

export async function haalDagboek(naam) {
  // Nooit uit de browsercache: de Worker bewaart de feed al (een minuut), en
  // een oude Worker zei "max-age=600", waardoor de browser een nieuwe log tot
  // tien minuten bleef missen, ook als je zelf op bijwerken drukte.
  const res = await fetch(`${PROXY_URL}/lb/${encodeURIComponent(naam)}`, { cache: 'no-store' });
  if (!res.ok) {
    let fout = null;
    try { fout = (await res.json())?.error; } catch { /* geen json */ }
    // Een Worker zonder deze route geeft een eigen 404 ("Alleen TMDB v3-paden")
    if (res.status === 404) throw new Error(fout === 'LB_404' ? 'NIET_GEVONDEN' : 'WORKER_OUD');
    throw new Error(fout || `HTTP_${res.status}`);
  }
  return leesDagboekFeed(await res.text());
}

// Hoe lang tot de volgende blik op je dagboek. Het ontdekmoment moet komen
// als je het verwacht, maar Letterboxd en de Worker mogen niet overbelast
// raken. Dus: vaak als er net iets te verwachten valt (een pick of vondst van
// de laatste uren), af en toe als er nog iets openstaat, zelden als er niets
// openstaat. Na een fout: rustig aan. (Bij openen en terugkomen kijkt de app
// los daarvan, hooguit eens per minuut.)
export const LB_MIN_TUSSEN = 60e3;
export function volgendeLbCheck({ kaartjes = [], vondsten = {}, nu = Date.now(), fout = false } = {}) {
  if (fout) return 10 * 60e3;
  const UUR = 3600e3;
  const inDoos = new Set(kaartjes.filter((k) => k.status === 'gekeken').map((k) => k.key));
  const open = kaartjes.filter((k) => k.status === 'open').map((k) => Date.parse(k.datum));
  const vers = Object.values(vondsten || {}).filter((v) => !inDoos.has(v.key) && nu - v.laatst < 7 * 24 * UUR).map((v) => v.laatst);
  const momenten = [...open, ...vers];
  if (momenten.some((t) => nu - t < 6 * UUR)) return 2 * 60e3;
  if (momenten.length) return 10 * 60e3;
  return 30 * 60e3;
}

// Nieuwe dagboekregels erbij (op film + kijkdatum ontdubbeld). Het TMDB-nummer
// blijft erbij: daarmee herkennen we Gevonden-films ook bij een andere titel.
export function voegDagboekSamen(diary, nieuw) {
  const bekend = new Set(diary.map((d) => `${d.key}|${d.watchedDate}`));
  const erbij = nieuw.filter((d) => !bekend.has(`${d.key}|${d.watchedDate}`));
  return { diary: erbij.length ? [...diary, ...erbij] : diary, erbij };
}
