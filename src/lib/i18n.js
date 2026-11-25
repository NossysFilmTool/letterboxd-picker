import { useSyncExternalStore } from 'react';
import { NAAM, SCORE } from './merk.js';

// Lichtgewicht vertaal-laag, zonder externe library.
// Teksten leven in dictionaries (dict/nl.js, dict/en.js) als geneste objecten;
// t('pick.title') zoekt 'title' onder 'pick'. Variabelen via {naam}-placeholders,
// meervoud via t('key', { count: n }) op een { one, other } object.
// Elke taal is een eigen bestand dat pas laadt als iemand hem kiest: main.jsx
// laadt de eerste vóór het tekenen, setLang de volgende (de tests laden ze
// allebei meteen, tests/setup.js).

const DICTS = {};
export function registerDict(lang, dict) { DICTS[lang] = dict; }
const LADERS = { nl: () => import('./dict/nl.js'), en: () => import('./dict/en.js') };

const SUPPORTED = ['nl', 'en'];
export const DEFAULT_LANG = 'nl';

let current = DEFAULT_LANG;
let gevraagd = current; // de laatst gekozen taal, ook als die nog laadt
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

export async function laadTaal(lang) {
  const l = SUPPORTED.includes(lang) ? lang : DEFAULT_LANG;
  if (!DICTS[l]) registerDict(l, (await LADERS[l]()).default);
}

export function getLang() { return current; }
// Een getal met de decimaal zoals de taal hem schrijft: 7,5 (nl) of 7.5 (en)
export const decimaal = (v) => (current === 'nl' ? String(v).replace('.', ',') : String(v));
export function setLang(lang) {
  const next = SUPPORTED.includes(lang) ? lang : DEFAULT_LANG;
  gevraagd = next;
  if (next === current) return;
  if (DICTS[next]) { current = next; emit(); return; }
  // Nog niet geladen: eerst de teksten, dan pas wisselen (en alleen als je
  // intussen niet weer iets anders koos)
  laadTaal(next).then(() => {
    if (gevraagd === next && current !== next) { current = next; emit(); }
  }).catch(() => {});
}

// Slimme startwaarde: opgeslagen keuze > browsertaal > standaard
// HTML-escape voor waarden die via dangerouslySetInnerHTML de pagina in gaan.
// Externe data (TMDB-trefwoorden, bestandsnamen) mag nooit als rauwe HTML landen.
export const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
));

export function detectLang(saved) {
  if (saved && SUPPORTED.includes(saved)) return saved;
  const nav = (typeof navigator !== 'undefined' && (navigator.language || navigator.languages?.[0])) || '';
  const short = nav.slice(0, 2).toLowerCase();
  // NL-browser -> nl, EN-browser -> en, al het andere (fr, de, ja, ...) -> en:
  // Engels is voor een onbekende taal een veiliger gok dan Nederlands.
  return SUPPORTED.includes(short) ? short : 'en';
}

// Genest opzoeken: 'a.b.c' → dict.a.b.c
function lookup(dict, key) {
  return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), dict);
}

// {app} en {appScore} (de naam van de tool, lib/merk.js) staan altijd klaar
const VAST = { app: NAAM, appScore: SCORE };
function interpolate(str, vars) {
  if (typeof str !== 'string' || !str.includes('{')) return str;
  const alle = vars ? { ...VAST, ...vars } : VAST;
  return str.replace(/\{(\w+)\}/g, (m, k) => (alle[k] != null ? String(alle[k]) : m));
}

// t('key') of t('key', { naam: 'x', count: 3 }).
// Ontbrekende sleutel valt terug op NL, dan op de sleutel zelf (zichtbaar in dev).
export function t(key, vars) {
  let val = lookup(DICTS[current], key);
  if (val === undefined && current !== DEFAULT_LANG) val = lookup(DICTS[DEFAULT_LANG], key);
  if (val === undefined) return key;
  // Meervoud: { one, other } + count
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    if (vars && 'count' in vars) {
      const form = vars.count === 1 ? (val.one ?? val.other) : (val.other ?? val.one);
      return interpolate(form ?? key, vars);
    }
    return key; // een object zonder count is een vergissing
  }
  return interpolate(val, vars);
}

// React-hook: component her-rendert bij taalwissel. Gebruik: const { t, lang } = useT();
export function useT() {
  const lang = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => current,
    () => current,
  );
  return { t, lang, setLang };
}
