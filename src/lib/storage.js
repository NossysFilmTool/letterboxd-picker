import { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import { NS, OUD_NS } from './naamruimte.js';
import { idbAvailable, idbGetAll, idbApply, idbClear, dbNaam } from './idb.js';

const ROOT = `${NS}.`;
// Profielen: het klassieke, ongeprefixte gegevensbestand is het profiel
// "Standaard"; extra profielen (huisgenoten) krijgen een eigen voorvoegsel
// en een eigen IndexedDB. Wisselen is een herlaad; twee globale sleutels
// (activeProfile, profiles) staan buiten elk profiel.
const GLOBALS = [`${ROOT}activeProfile`, `${ROOT}profiles`];
function activeProfileName() {
  try { return localStorage.getItem(`${ROOT}activeProfile`) || ''; } catch { return ''; }
}
const PROFILE = activeProfileName();
const PREFIX = PROFILE ? `${ROOT}p.${PROFILE}.` : ROOT;
// Hoort deze sleutel bij het actieve profiel? Op Standaard sluit dat de
// p.-profielen en de globale sleutels expliciet uit.
const isOwnKey = (k) => k.startsWith(PREFIX)
  && (PROFILE ? true : (!k.startsWith(`${ROOT}p.`) && !GLOBALS.includes(k)));
// Kale naam (zonder welk profiel-voorvoegsel dan ook), voor back-ups.
// Ook de oude naam (back-ups van voor versie 6, lib/naamruimte.js).
const KAAL = new RegExp(`^(${NS}|${OUD_NS})\\.(p\\.[^.]+\\.)?`);
const bareKey = (k) => k.replace(KAAL, '');

// Losse lees- en schrijfhulp voor het actieve profiel (achtergrondwerk, sync)
export function leesOpslag(key, standaard = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw !== null ? JSON.parse(raw) : standaard;
  } catch { return standaard; }
}
// De ruwe tekst, voor wie zelf wil zien of er iets veranderde
export function leesOpslagRuw(key) {
  try { return localStorage.getItem(PREFIX + key); } catch { return null; }
}
export function schrijfOpslag(key, waarde) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(waarde)); } catch { reportStorageError(); }
}
// Een seintje bij elke opgeslagen wijziging (voor de sync tussen apparaten)
const luisteraars = new Set();
export function opWijziging(fn) { luisteraars.add(fn); return () => luisteraars.delete(fn); }

// Alle hooks per sleutel in dit tabblad: schrijft er een, dan zien de andere
// het meteen (twee schermen met dezelfde sleutel lopen zo nooit uiteen)
const abonnees = new Map(); // sleutel -> Set(fn(tekst | null))
const meldAbonnees = (key, tekst, behalve = null) => {
  abonnees.get(key)?.forEach((fn) => { if (fn !== behalve) fn(tekst); });
};

// Sleutels wissen, ook in de schermen die nu openstaan: die gaan terug naar
// hun beginwaarde
export function wisOpslag(keys) {
  keys.forEach((k) => {
    try { localStorage.removeItem(PREFIX + k); } catch { /* geblokkeerd */ }
    meldAbonnees(k, null);
  });
}

export function useLS(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw !== null ? JSON.parse(raw) : defaultValue;
    } catch {
      return defaultValue;
    }
  });
  const standaard = useRef(defaultValue);
  standaard.current = defaultValue;
  // De tekst die net van buiten kwam (een ander tabblad of een andere hook):
  // die schrijven we niet terug, en de sync hoort er hier niets over
  const vanBuiten = useRef(undefined);
  const ikZelf = useRef(null);
  useEffect(() => {
    const neem = (tekst) => {
      if (tekst === null) {
        vanBuiten.current = JSON.stringify(standaard.current);
        setValue(standaard.current);
        return;
      }
      try { const v = JSON.parse(tekst); vanBuiten.current = tekst; setValue(v); } catch { /* onleesbaar: laten */ }
    };
    ikZelf.current = neem;
    if (!abonnees.has(key)) abonnees.set(key, new Set());
    abonnees.get(key).add(neem);
    // Een ander tabblad schreef deze sleutel: overnemen, anders overschrijft
    // dit tabblad straks wat daar gebeurde
    const opStorage = (e) => {
      if (e.key !== PREFIX + key) return;
      try { if (e.storageArea && e.storageArea !== localStorage) return; } catch { return; }
      neem(e.newValue);
    };
    window.addEventListener('storage', opStorage);
    return () => {
      abonnees.get(key)?.delete(neem);
      window.removeEventListener('storage', opStorage);
    };
  }, [key]);
  useEffect(() => {
    const tekst = JSON.stringify(value);
    if (vanBuiten.current !== undefined) {
      const was = vanBuiten.current;
      vanBuiten.current = undefined;
      if (tekst === was) return;
    }
    try {
      localStorage.setItem(PREFIX + key, tekst);
      meldAbonnees(key, tekst, ikZelf.current);
      luisteraars.forEach((fn) => { try { fn(key); } catch { /* een luisteraar mag het opslaan niet breken */ } });
    } catch (e) {
      console.warn('Opslag vol of geblokkeerd voor', key, e);
      reportStorageError();
    }
  }, [key, value]);
  return [value, setValue];
}

// Wat bij dit apparaat hoort en niet bij je gegevens. Een back-up neemt het
// niet mee, terugzetten laat het staan.
const APPARAAT = ['foutlog', 'nieuwOp5'];
// De koppeling met je andere apparaten: gaat wel mee in een back-up (zo blijft
// een verhuisd apparaat gekoppeld), maar terugzetten vervangt nooit de
// koppeling die hier al staat
const KOPPELING = 'sync';
// De naam in een back-upbestand; oudere back-ups heten nog anders
export const BACKUP_ID = 'shutterbox';
const BACKUP_IDS = [BACKUP_ID, 'nossy-picker'];

export function exportAll(metaObj) {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && isOwnKey(k) && !APPARAAT.includes(bareKey(k))) out[`${ROOT}${bareKey(k)}`] = localStorage.getItem(k);
  }
  // Op het IndexedDB-pad zit de filmcache niet in localStorage; voeg hem toe
  // onder dezelfde sleutel als vroeger, zodat oude en nieuwe back-ups
  // uitwisselbaar blijven in beide richtingen.
  const metaKey = `${PREFIX}meta`;
  if (metaObj && !(metaKey in out)) out[metaKey] = JSON.stringify(metaObj);
  return JSON.stringify({ app: BACKUP_ID, version: 2, data: out });
}

// Een back-up terugzetten vervangt je gegevens: wat niet in de back-up staat,
// gaat weg (behalve wat bij dit apparaat hoort). Eerst alles controleren,
// dan pas iets aanraken. De aanroeper herlaadt de app erna.
// Is dit een back-up van deze tool? Geeft de regels terug, of gooit
// INVALID_BACKUP. Los te gebruiken, zodat je pas om bevestiging vraagt als
// het bestand klopt.
export function controleerBackup(json) {
  let parsed;
  try { parsed = JSON.parse(json); } catch { throw new Error('INVALID_BACKUP'); }
  if (!parsed || !BACKUP_IDS.includes(parsed.app) || !parsed.data || typeof parsed.data !== 'object') {
    throw new Error('INVALID_BACKUP');
  }
  const regels = Object.entries(parsed.data).filter(([k, v]) => (k.startsWith(ROOT) || k.startsWith(`${OUD_NS}.`)) && typeof v === 'string');
  if (!regels.length) throw new Error('INVALID_BACKUP');
  return regels;
}

export async function importAll(json) {
  const regels = controleerBackup(json);
  const heeftKoppeling = localStorage.getItem(`${PREFIX}${KOPPELING}`) !== null;
  const weg = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && isOwnKey(k) && !APPARAAT.includes(bareKey(k)) && bareKey(k) !== KOPPELING) weg.push(k);
  }
  weg.forEach((k) => localStorage.removeItem(k));
  for (const [k, v] of regels) {
    const kaal = bareKey(k);
    if (!kaal || kaal === 'activeProfile' || kaal === 'profiles' || APPARAAT.includes(kaal)) continue;
    if (kaal === KOPPELING && heeftKoppeling) continue;
    if (kaal === 'meta' && idbAvailable()) {
      // Filmcache hoort in IndexedDB; de aanroeper herlaadt de app erna.
      try { await idbClear(); await idbApply(JSON.parse(v), []); } catch { localStorage.setItem(`${PREFIX}meta`, v); }
    } else {
      localStorage.setItem(`${PREFIX}${kaal}`, v);
    }
  }
}

// Alles van dit profiel wissen. De profielen van huisgenoten blijven staan.
export async function clearAll() {
  if (idbAvailable()) { try { await idbClear(); } catch { /* dan alleen LS */ } }
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && isOwnKey(k)) keys.push(k);
  }
  keys.forEach((k) => localStorage.removeItem(k));
}

export const filmKey = (name, year) => `${String(name).trim().toLowerCase()}|${year || ''}`;

// --- Opslag-gezondheid ---------------------------------------------------
// localStorage faalt stil (quota vol, private mode). Dat mag de gebruiker
// niet ontgaan: wijzigingen lijken dan bewaard maar zijn weg na een refresh.
let storageBroken = false;
const healthSubs = new Set();
export function reportStorageError() {
  if (storageBroken) return;
  storageBroken = true;
  healthSubs.forEach((cb) => cb());
}
export function useStorageHealth() {
  return useSyncExternalStore(
    (cb) => { healthSubs.add(cb); return () => healthSubs.delete(cb); },
    () => storageBroken,
  );
}

// Ruwe schatting van het opslaggebruik van deze tool (in bytes; de browser-
// limiet ligt rond de 5 MB aan UTF-16-eenheden — indicatie, geen exacte wet).
export function storageUsage(metaObj) {
  let units = 0;
  if (metaObj && idbAvailable()) { try { units += JSON.stringify(metaObj).length; } catch { /* schatting */ } }
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && isOwnKey(k)) units += k.length + (localStorage.getItem(k)?.length || 0);
    }
  } catch { /* geblokkeerd: laat 0 zien */ }
  return units;
}

// --- Filmcache in IndexedDB -----------------------------------------------
// Zelfde React-gebruik als useLS('meta'), andere persistentie: per film een
// record in IndexedDB, weggeschreven als gebatchte diff (alleen wat wijzigde).
// Zonder IndexedDB (oude browsers, sommige testomgevingen) valt de hook
// terug op exact het oude localStorage-gedrag.
export function useMetaStore() {
  const hasIdb = idbAvailable();
  const [meta, setMeta] = useState(() => {
    if (hasIdb) return {};
    try {
      const raw = localStorage.getItem(`${PREFIX}meta`);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  const [ready, setReady] = useState(!hasIdb);
  const prevRef = useRef(null); // null = IDB nog niet geladen; dan geen diffs schrijven
  const pendRef = useRef({ puts: {}, dels: new Set(), timer: null });

  // Boot (alleen IDB-pad): eerst eenmalige migratie van de oude
  // localStorage-cache, dan alles laden. Migratie maakt meteen ~2 MB
  // localStorage vrij — het oude plafond-probleem lost zichzelf op.
  useEffect(() => {
    if (!hasIdb) return undefined;
    let alive = true;
    (async () => {
      try {
        const oldRaw = localStorage.getItem(`${PREFIX}meta`);
        if (oldRaw) {
          try {
            await idbApply(JSON.parse(oldRaw), []);
            localStorage.removeItem(`${PREFIX}meta`);
          } catch (e) { console.warn('Meta-migratie naar IndexedDB faalde', e); }
        }
        const all = await idbGetAll();
        if (!alive) return;
        prevRef.current = all;
        setMeta(all);
      } catch (e) { console.warn('IndexedDB laden faalde', e); prevRef.current = {}; }
      if (alive) setReady(true);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persistentie. IDB-pad: diff per filmsleutel (object-identiteit volstaat:
  // elke wijziging maakt een nieuw object), gebatcht per 400 ms.
  useEffect(() => {
    if (!hasIdb) {
      try {
        localStorage.setItem(`${PREFIX}meta`, JSON.stringify(meta));
      } catch (e) {
        console.warn('Opslag vol of geblokkeerd voor meta', e);
        reportStorageError();
      }
      return;
    }
    const prev = prevRef.current;
    if (prev === null || prev === meta) return;
    const pend = pendRef.current;
    for (const k in meta) if (meta[k] !== prev[k]) { pend.puts[k] = meta[k]; pend.dels.delete(k); }
    for (const k in prev) if (!(k in meta)) { pend.dels.add(k); delete pend.puts[k]; }
    prevRef.current = meta;
    if (!pend.timer) {
      pend.timer = setTimeout(async () => {
        const puts = pend.puts; const dels = [...pend.dels];
        pend.puts = {}; pend.dels = new Set(); pend.timer = null;
        try { await idbApply(puts, dels); } catch (e) {
          console.warn('IndexedDB schrijven faalde', e);
          reportStorageError();
        }
      }, 400);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta]);

  return [meta, setMeta, ready];
}

// --- Profielen -------------------------------------------------------------
export const currentProfile = () => PROFILE;

export function listProfiles() {
  try { return JSON.parse(localStorage.getItem(`${ROOT}profiles`) || '[]'); } catch { return []; }
}

// Namen zonder punten of vreemde tekens: de punt is ons scheidingsteken.
export function addProfile(naam) {
  const n = String(naam || '').trim().slice(0, 24);
  if (!n || !/^[\w\- \u00c0-\u024f]+$/.test(n)) return false;
  const lijst = listProfiles();
  if (lijst.includes(n)) return false;
  localStorage.setItem(`${ROOT}profiles`, JSON.stringify([...lijst, n]));
  return true;
}

export function switchProfile(naam) {
  localStorage.setItem(`${ROOT}activeProfile`, naam || '');
  try { location.reload(); } catch { /* testomgeving */ }
}

export function deleteProfile(naam) {
  const pfx = `${ROOT}p.${naam}.`;
  const dood = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(pfx)) dood.push(k);
  }
  dood.forEach((k) => localStorage.removeItem(k));
  localStorage.setItem(`${ROOT}profiles`, JSON.stringify(listProfiles().filter((x) => x !== naam)));
  try { indexedDB.deleteDatabase(dbNaam(naam)); } catch { /* geen IDB */ }
  if (PROFILE === naam) switchProfile('');
}
