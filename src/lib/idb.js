// Minimale IndexedDB-laag voor de filmdata-cache. Geen dependency, één store.
// Waarom IndexedDB: localStorage plafonneert rond de 5 MB; IndexedDB geeft
// honderden MB's. Instellingen en lijsten blijven in localStorage (klein en
// synchroon is daar juist prettig); alleen de zware meta-cache verhuist.

import { NS, OUD_NS } from './naamruimte.js';

const profiel = (() => {
  try { return localStorage.getItem(`${NS}.activeProfile`) || ''; } catch { return ''; }
})();
export const dbNaam = (p, ns = NS) => (p ? `${ns}-p-${p}` : ns);
const DB_NAME = dbNaam(profiel);
const OUD_DB = dbNaam(profiel, OUD_NS);
const STORE = 'meta';

export const idbAvailable = () => typeof indexedDB !== 'undefined';

// De filmdata uit de database van voor versie 6 (lib/naamruimte.js): alleen
// als die bestaat. Bestaat hij niet, dan breekt het openen af zonder hem
// aan te maken.
function leesOudeDb() {
  return new Promise((resolve) => {
    let req;
    try { req = indexedDB.open(OUD_DB, 1); } catch { resolve(null); return; }
    req.onupgradeneeded = (e) => { if (e.oldVersion === 0) req.transaction.abort(); };
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) { db.close(); resolve(null); return; }
      const out = {};
      const cur = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if (c) { out[c.key] = c.value; c.continue(); } else { db.close(); resolve(out); }
      };
      cur.onerror = () => { db.close(); resolve(null); };
    };
  });
}

let dbPromise = null;
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      let nieuw = false;
      req.onupgradeneeded = (e) => { req.result.createObjectStore(STORE); nieuw = e.oldVersion === 0; };
      req.onsuccess = async () => {
        const db = req.result;
        if (nieuw) {
          // Net aangemaakt: neem de filmdata van de oude naam over
          const oud = await leesOudeDb();
          if (oud && Object.keys(oud).length) {
            try { await tx(db, 'readwrite', (store) => { Object.entries(oud).forEach(([k, v]) => store.put(v, k)); }); } catch { /* dan haalt de app hem opnieuw op */ }
          }
          if (oud) { try { indexedDB.deleteDatabase(OUD_DB); } catch { /* laat staan */ } }
        }
        resolve(db);
      };
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const out = fn(store);
    t.oncomplete = () => resolve(out?.result !== undefined ? out.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

// Alles ophalen als { key: waarde }-object (zoals de app meta gebruikt).
export async function idbGetAll() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readonly');
    const store = t.objectStore(STORE);
    const out = {};
    const req = store.openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (cur) { out[cur.key] = cur.value; cur.continue(); } else resolve(out);
    };
    req.onerror = () => reject(req.error);
  });
}

// Batch schrijven en verwijderen in één transactie.
export async function idbApply(puts, dels) {
  const db = await openDb();
  return tx(db, 'readwrite', (store) => {
    Object.entries(puts || {}).forEach(([k, v]) => store.put(v, k));
    (dels || []).forEach((k) => store.delete(k));
  });
}

export async function idbClear() {
  const db = await openDb();
  return tx(db, 'readwrite', (store) => store.clear());
}
