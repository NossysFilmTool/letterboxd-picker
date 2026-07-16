import { useState, useEffect, useSyncExternalStore } from 'react';

const PREFIX = 'nossyV2.';

export function useLS(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw !== null ? JSON.parse(raw) : defaultValue;
    } catch {
      return defaultValue;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (e) {
      console.warn('Opslag vol of geblokkeerd voor', key, e);
      reportStorageError();
    }
  }, [key, value]);
  return [value, setValue];
}

export function exportAll() {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX)) out[k] = localStorage.getItem(k);
  }
  return JSON.stringify({ app: 'nossy-picker', version: 2, data: out });
}

export function importAll(json) {
  const parsed = JSON.parse(json);
  if (!parsed || parsed.app !== 'nossy-picker' || !parsed.data) {
    throw new Error('INVALID_BACKUP');
  }
  Object.entries(parsed.data).forEach(([k, v]) => {
    if (k.startsWith(PREFIX)) localStorage.setItem(k, v);
  });
}

export function clearAll() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX)) keys.push(k);
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
export function storageUsage() {
  let units = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) units += k.length + (localStorage.getItem(k)?.length || 0);
    }
  } catch { /* geblokkeerd: laat 0 zien */ }
  return units;
}
