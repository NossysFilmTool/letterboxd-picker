// Minimale IndexedDB-laag voor de filmdata-cache. Geen dependency, één store.
// Waarom IndexedDB: localStorage plafonneert rond de 5 MB; IndexedDB geeft
// honderden MB's. Instellingen en lijsten blijven in localStorage (klein en
// synchroon is daar juist prettig); alleen de zware meta-cache verhuist.

const profiel = (() => {
  try { return localStorage.getItem('nossyV2.activeProfile') || ''; } catch { return ''; }
})();
const DB_NAME = profiel ? `nossyV2-p-${profiel}` : 'nossyV2';
const STORE = 'meta';

export const idbAvailable = () => typeof indexedDB !== 'undefined';

let dbPromise = null;
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
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
