import { useEffect } from 'react';
import { setRegion, DEFAULT_REGION } from '../lib/tmdb.js';
import { setThemeEmphasis } from '../lib/taste.js';
import { setLang, detectLang, getLang } from '../lib/i18n.js';

// Je instellingen voor het rekenwerk (thema-nadruk, regio, taal): die lezen
// de rekenmodules zelf, dus vóór de schermen tekenen al goed zetten. Voor de app en voor een gast (Gast.jsx).
export function useRekenInstellingen(settings) {
  setThemeEmphasis(settings.themeEmphasis);
  setRegion(settings.region || DEFAULT_REGION);
  // Taal: opgeslagen keuze, anders de browsertaal als slim startpunt
  if (getLang() !== (settings.lang || detectLang())) setLang(settings.lang || detectLang());
  useEffect(() => { setLang(settings.lang || detectLang()); }, [settings.lang]);
  useEffect(() => { setRegion(settings.region || DEFAULT_REGION); }, [settings.region]);
  useEffect(() => { setThemeEmphasis(settings.themeEmphasis); }, [settings.themeEmphasis]);
}
