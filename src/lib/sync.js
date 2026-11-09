// Sync tussen je apparaten (laptop, pc, telefoon).
//
// Hoe het werkt:
// - Je apparaten delen een geheime code (25 tekens). Daaruit leidt elk
//   apparaat twee dingen af: een id (waar de gegevens in de Worker staan) en
//   een sleutel (AES-GCM) om ze te versleutelen, plus een schrijfsleutel. De
//   Worker ziet alleen het id, onleesbare data en een vingerafdruk van de
//   schrijfsleutel; zonder de code kan niemand je gegevens lezen of
//   overschrijven. Lekt de code, dan maak je een nieuwe (wisselCode): de oude
//   wordt ingetrokken en de kopie daaronder gewist.
// - Gesynchroniseerd worden je eigen gegevens (kaartjes, sterren, gezien,
//   dagboek, watchlist, instellingen), niet de filmcache: die haalt elk
//   apparaat zelf op.
// - Per onderdeel ("kolom") onthoudt elk apparaat hoe het eruitzag bij de
//   vorige sync. Veranderde het alleen hier, dan gaat het naar de rest;
//   veranderde het alleen elders, dan komt het hierheen. Veranderde het op
//   beide, dan voegen we samen: kaartjes per kaartje, sterren en gezien per
//   film, het dagboek per log. Voor de rest wint de laatste wijziging.
import { PROXY_URL } from './tmdb.js';
import { leesOpslag, schrijfOpslag } from './storage.js';
import { voegVondstenSamen } from './vondsten.js';

// --- De kolommen --------------------------------------------------------
const tijdVan = (v) => (typeof v === 'number' ? v : Date.parse(v) || 0);
const kaartjeTijd = (k) => k.bij || Date.parse(k.datum) || 0;

export function voegKaartjesSamen(a = [], b = []) {
  const m = new Map();
  [...(a || []), ...(b || [])].forEach((k) => {
    const o = m.get(k.id);
    if (!o || kaartjeTijd(k) > kaartjeTijd(o)) m.set(k.id, k);
  });
  return [...m.values()].sort((x, y) => Date.parse(y.datum) - Date.parse(x.datum));
}

// Per sleutel de nieuwste, op een tijd uit de waarde zelf
const perSleutel = (tijd) => (a = {}, b = {}) => {
  const uit = { ...(a || {}) };
  Object.entries(b || {}).forEach(([k, v]) => { if (!(k in uit) || tijd(v) > tijd(uit[k])) uit[k] = v; });
  return uit;
};
export const voegSterrenSamen = perSleutel((v) => v?.at || 0);

// Lijsten zonder dubbele: op een eigen sleutel per regel
const lijst = (sleutel, sorteer, max) => (a = [], b = []) => {
  const m = new Map();
  [...(a || []), ...(b || [])].forEach((x) => { const k = sleutel(x); if (!m.has(k)) m.set(k, x); });
  let uit = [...m.values()];
  if (sorteer) uit = uit.sort(sorteer);
  return max ? uit.slice(0, max) : uit;
};

// Gezien: drie sleutels samen. Een film is gezien tenzij hij later op
// "toch niet gezien" werd gezet (gezienWeg) dan dat hij gezien werd.
export function voegGezienSamen(a = {}, b = {}) {
  const op = perSleutel(tijdVan)(a.gezienOp, b.gezienOp);
  const weg = perSleutel(tijdVan)(a.gezienWeg, b.gezienWeg);
  const alle = new Set([...(a.seen || []), ...(b.seen || []), ...Object.keys(op)]);
  const seen = [...alle].filter((k) => !(weg[k] && tijdVan(weg[k]) > tijdVan(op[k])));
  return { seen, gezienOp: op, gezienWeg: weg };
}

// Elke kolom: een of meer opslagsleutels, en hoe samen te voegen (zonder
// samenvoeg-regel wint de laatste wijziging)
export const KOLOMMEN = [
  { naam: 'kaartjes', sleutels: ['kaartjes'], samen: (a, b) => ({ kaartjes: voegKaartjesSamen(a.kaartjes, b.kaartjes) }) },
  { naam: 'sterren', sleutels: ['ownRatings'], samen: (a, b) => ({ ownRatings: voegSterrenSamen(a.ownRatings, b.ownRatings) }) },
  { naam: 'gezien', sleutels: ['seen', 'gezienOp', 'gezienWeg'], samen: voegGezienSamen },
  { naam: 'geschiedenis', sleutels: ['history'], samen: (a, b) => ({ history: lijst((h) => `${h.date}|${h.key}`, (x, y) => Date.parse(y.date) - Date.parse(x.date), 80)(a.history, b.history) }) },
  { naam: 'vondsten', sleutels: ['vondsten'], samen: (a, b) => ({ vondsten: voegVondstenSamen(a.vondsten, b.vondsten) }) },
  { naam: 'dagboek', sleutels: ['diary'], samen: (a, b) => ({ diary: lijst((d) => `${d.key}|${d.watchedDate}`)(a.diary, b.diary) }) },
  { naam: 'letterboxd', sleutels: ['watchlist', 'watchedLb', 'watchedFilms', 'ratings', 'ratedFilms', 'lbLists'] },
  { naam: 'instellingen', sleutels: ['settings', 'mijnDiensten', 'samenNaam', 'smart', 'verbergGezien', 'dienstKiezerWeg'] },
  { naam: 'voorjou', sleutels: ['shortlist', 'skipped', 'ignored', 'eigenRijen'] },
  { naam: 'smaakmodel', sleutels: ['smaakModel'] },
];
export const GESYNCTE_SLEUTELS = KOLOMMEN.flatMap((k) => k.sleutels);
export const kolomVan = (sleutel) => KOLOMMEN.find((k) => k.sleutels.includes(sleutel));

// Snelle vingerafdruk (FNV-1a) van een waarde
export function vingerafdruk(v) {
  const s = JSON.stringify(v ?? null);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36) + s.length.toString(36);
}

// --- De code en de versleuteling ----------------------------------------
const ALFABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function maakCode() {
  const r = crypto.getRandomValues(new Uint8Array(25));
  const tekens = [...r].map((b) => ALFABET[b % ALFABET.length]).join('');
  return tekens.match(/.{5}/g).join('-');
}
// Wat iemand intypt of plakt (ook een hele koppellink) naar de nette code
export function normaliseerCode(invoer) {
  const s = String(invoer || '');
  const uitLink = s.match(/[?&]sync=([A-Za-z0-9-]+)/);
  const kaal = (uitLink ? uitLink[1] : s).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (kaal.length !== 25 || [...kaal].some((c) => !ALFABET.includes(c))) return null;
  return kaal.match(/.{5}/g).join('-');
}

const subtle = () => globalThis.crypto?.subtle;
const naarHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const naarB64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const vanB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function sleutelsVan(code) {
  const tekst = new TextEncoder();
  const id = naarHex(await subtle().digest('SHA-256', tekst.encode(`nossy-sync-id:${code}`)));
  const ruw = await subtle().digest('SHA-256', tekst.encode(`nossy-sync-sleutel:${code}`));
  const sleutel = await subtle().importKey('raw', ruw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  const schrijf = naarHex(await subtle().digest('SHA-256', tekst.encode(`nossy-sync-schrijf:${code}`)));
  return { id, sleutel, schrijf };
}

// Inpakken (gzip) waar de browser dat kan: je gegevens worden zo zo'n vijf
// tot tien keer kleiner. Kan het niet, dan gaan ze onverpakt (wel versleuteld).
async function inpakken(bytes, richting) {
  if (typeof CompressionStream === 'undefined' || typeof Response === 'undefined') {
    if (richting === 'uit') throw new Error('GEEN_GZIP');
    return null;
  }
  const stroom = new Response(bytes).body.pipeThrough(richting === 'in' ? new CompressionStream('gzip') : new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stroom).arrayBuffer());
}

export async function versleutel(waarde, sleutel) {
  const ruw = new TextEncoder().encode(JSON.stringify(waarde));
  const klein = await inpakken(ruw, 'in');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const geheim = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, sleutel, klein || ruw));
  const alles = new Uint8Array(12 + geheim.length);
  alles.set(iv); alles.set(geheim, 12);
  return `${klein ? 'g1' : 'p1'}:${naarB64(alles)}`;
}

export async function ontsleutel(tekst, sleutel) {
  const [soort, b64] = String(tekst).split(':');
  const alles = vanB64(b64);
  const open = new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: alles.subarray(0, 12) }, sleutel, alles.subarray(12)));
  const ruw = soort === 'g1' ? await inpakken(open, 'uit') : open;
  return JSON.parse(new TextDecoder().decode(ruw));
}

// --- De Worker ------------------------------------------------------------
export const worker = {
  async haal(id) {
    const res = await fetch(`${PROXY_URL}/sync/${id}`, { cache: 'no-store' });
    if (res.status === 410) throw new Error('INGETROKKEN');
    if (res.status === 404) {
      let fout = null; try { fout = (await res.json())?.error; } catch { /* geen json */ }
      if (fout === 'NOT_FOUND') return null;
      throw new Error('WORKER_OUD'); // een Worker zonder deze route
    }
    if (!res.ok) { let fout = null; try { fout = (await res.json())?.error; } catch { /* */ } throw new Error(fout || `HTTP_${res.status}`); }
    return res.json(); // { at, data }
  },
  async zet(id, data, basis, token) {
    return schrijfNaar(id, { data, basis: basis ?? null, token });
  },
  // De code intrekken: de kopie gaat weg, de deur blijft dicht
  async trekIn(id, token) {
    return schrijfNaar(id, { intrekken: true, token });
  },
};
async function schrijfNaar(id, body) {
  const res = await fetch(`${PROXY_URL}/sync/${id}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  let antw = null; try { antw = await res.json(); } catch { /* */ }
  if (res.status === 409) throw new Error('CONFLICT');
  if (res.status === 410) throw new Error('INGETROKKEN');
  if (res.status === 403) throw new Error('GEEN_TOEGANG');
  if (res.status === 404 || res.status === 405) throw new Error('WORKER_OUD');
  if (!res.ok) throw new Error(antw?.error || `HTTP_${res.status}`);
  return antw; // { ok, at }
}

// --- Eén sync -------------------------------------------------------------
// opslag: { lees(sleutel), schrijf(sleutel, waarde) }; staat: de syncstand van
// dit apparaat ({ basis: { kolom: { hash, at } }, gewijzigd: { kolom: tijd } }).
// Geeft { staat, toegepast: [sleutels die hier veranderden] } terug.
const echteOpslag = { lees: (k) => leesOpslag(k, null), schrijf: (k, v) => schrijfOpslag(k, v) };

export async function synchroniseer(code, { opslag = echteOpslag, staat = {}, server = worker, nu = Date.now(), poging = 0, alToegepast = [] } = {}) {
  const { id, sleutel, schrijf } = await sleutelsVan(code);
  const opgehaald = await server.haal(id);
  const remote = opgehaald ? { at: opgehaald.at, doc: await ontsleutel(opgehaald.data, sleutel) } : null;
  const basis = staat.basis || {};
  const gewijzigd = staat.gewijzigd || {};
  const kolommen = {};
  const nieuweBasis = {};
  const toegepast = [...alToegepast];
  let teVersturen = !remote;

  KOLOMMEN.forEach((kol) => {
    const lokaal = Object.fromEntries(kol.sleutels.map((s) => [s, opslag.lees(s)]));
    const lHash = vingerafdruk(lokaal);
    const b = basis[kol.naam];
    const r = remote?.doc?.kolommen?.[kol.naam];
    const lokaalAnders = !b || lHash !== b.hash;
    const remoteAnders = !!r && (!b || r.at !== b.at);
    let uit; let at;
    if (!r) { uit = lokaal; at = gewijzigd[kol.naam] || nu; }
    else if (!remoteAnders) { uit = lokaal; at = lokaalAnders ? (gewijzigd[kol.naam] || nu) : r.at; }
    else if (!lokaalAnders) { uit = r.data; at = r.at; }
    else if (kol.samen) {
      uit = kol.samen(lokaal, r.data);
      at = nu;
    } else {
      // Op beide gewijzigd, geen samenvoeg-regel: de laatste wijziging wint.
      // Een apparaat dat nog nooit synchroniseerde, weet niet wanneer; dan
      // wint wat er al stond.
      const lAt = b ? (gewijzigd[kol.naam] || 0) : 0;
      if (lAt > r.at) { uit = lokaal; at = lAt; } else { uit = r.data; at = r.at; }
    }
    const uHash = vingerafdruk(uit);
    if (uHash !== lHash) {
      kol.sleutels.forEach((s) => {
        if (vingerafdruk(uit[s]) !== vingerafdruk(lokaal[s])) {
          if (uit[s] === undefined || uit[s] === null) return;
          opslag.schrijf(s, uit[s]);
          if (!toegepast.includes(s)) toegepast.push(s);
        }
      });
    }
    if (!r || at !== r.at || vingerafdruk(r.data) !== uHash) teVersturen = true;
    kolommen[kol.naam] = { at, data: uit };
    nieuweBasis[kol.naam] = { hash: uHash, at };
  });

  let serverAt = remote?.at ?? null;
  if (teVersturen) {
    try {
      const data = await versleutel({ v: 1, kolommen }, sleutel);
      serverAt = (await server.zet(id, data, remote?.at ?? null, schrijf)).at;
    } catch (e) {
      // Een ander apparaat was net eerder: opnieuw, met zijn versie erbij
      if (e.message === 'CONFLICT' && poging < 2) return synchroniseer(code, { opslag, staat, server, nu, poging: poging + 1, alToegepast: toegepast });
      throw e;
    }
  }
  return {
    staat: { ...staat, basis: nieuweBasis, gewijzigd: {}, serverAt, laatst: nu, fout: null },
    toegepast,
  };
}

// Een nieuwe code: eerst alles van de oude binnenhalen, dan alles onder de
// nieuwe opslaan, en de oude intrekken (de kopie daaronder wordt gewist).
// Je andere apparaten koppel je daarna opnieuw met de nieuwe link.
export async function wisselCode(oudeCode, { opslag = echteOpslag, staat = {}, server = worker, nu = Date.now() } = {}) {
  let toegepast = [];
  try {
    toegepast = (await synchroniseer(oudeCode, { opslag, staat, server, nu })).toegepast;
  } catch (e) {
    if (e.message !== 'INGETROKKEN') throw e; // al ingetrokken: dan alleen wat hier staat
  }
  const code = maakCode();
  const nieuw = await synchroniseer(code, { opslag, staat: {}, server, nu });
  const oud = await sleutelsVan(oudeCode);
  try { await server.trekIn(oud.id, oud.schrijf); } catch (e) { if (e.message !== 'INGETROKKEN') throw e; }
  return { code, staat: nieuw.staat, toegepast: [...new Set([...toegepast, ...nieuw.toegepast])] };
}