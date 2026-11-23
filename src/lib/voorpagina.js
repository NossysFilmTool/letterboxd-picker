// De voorpagina (Pick.jsx, DESIGN.md "De voorpagina"): elke dag een
// hoofdfilm van vanavond uit je eigen watchlist, met een echte reden erbij,
// en een korte film van je lijst als voorfilm. De keuze verschuift per dag,
// zodat de voorpagina elke dag anders is, maar springt niet bij elke keer
// openen. "Een andere film" schuift naar de volgende; dat geldt de rest van
// de dag.

import { nossyScore } from './pick.js';
import { avondRuimte } from './foryou.js';
import { netBinnen } from './aanbod.js';
import { matchScore } from './taste.js';
import { beoordeelCijfer, NEUTRAAL_CIJFER } from './opgeblazen.js';
import { GENRES, genreLabel } from './tmdb.js';

// Korter dan dit is een korte film: geen hoofdfilm, wel een voorfilm (de
// grens die Voor jou ook gebruikt, foryou.js degelijk)
export const KORTE_FILM = 40;
const isKort = (m) => !!m?.runtime && m.runtime < KORTE_FILM;

// Een cijfer dat je kunt vertrouwen: de Nossy-score (met IMDb en Metacritic
// als die er zijn), anders TMDB, maar nooit een opgeblazen TMDB-cijfer. Weinig
// stemmen trekt het naar het neutrale midden (6,2), zoals de match in
// taste.js: een 8,6 van twaalf stemmers is geen 8,6. Met een tweede mening
// (IMDb of Metacritic) is er minder demping nodig.
export function betrouwbaarCijfer(m) {
  if (!m) return NEUTRAAL_CIJFER;
  let c = nossyScore(m);
  if (c == null) c = beoordeelCijfer(m).opgeblazen ? null : (m.vote || null);
  if (c == null) return NEUTRAAL_CIJFER;
  const tweede = m.ext?.imdb != null || m.ext?.mc != null;
  const n = m.votes ?? 60;
  const C = tweede ? 40 : 120;
  return (c * n + NEUTRAAL_CIJFER * C) / (n + C);
}

// Hoe goed een film bij je smaak past (0-100), met wat hij deelt met je
// profiel: het genre waar je op valt en het decennium
const enGenre = (naam) => GENRES.find((g) => g.en === naam || g.nl === naam);
export function smaakVan(m, taste) {
  if (!m || !taste?.genres) return null;
  const { score } = matchScore({ vote: betrouwbaarCijfer(m), votes: m.votes, year: m.year, lang: m.lang, genres: m.genres, keywords: m.keywords }, taste);
  const genre = (m.genres || []).find((g) => (taste.genres[g] ?? 0) > 0.35);
  const decennium = m.year ? Math.floor(m.year / 10) * 10 : null;
  const tijd = decennium != null && (taste.decades?.[decennium] ?? 0) > 0.35;
  return {
    pct: score,
    genre: genre ? genreLabel(enGenre(genre)) || genre : null,
    era: genre && tijd ? String(decennium).slice(2) : null,
  };
}

// De datum van vandaag als 'YYYY-MM-DD', in je eigen tijdzone
export function vandaag(nu = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${nu.getFullYear()}-${p(nu.getMonth() + 1)}-${p(nu.getDate())}`;
}

// Een vast getal tussen 0 en 1 per film per dag
function lot(tekst) {
  let h = 2166136261;
  for (let i = 0; i < tekst.length; i++) h = Math.imul(h ^ tekst.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

// Waarom juist deze film, uit echte gegevens, de sterkste reden eerst:
//   binnen:    net verschenen op een (van jouw) dienst(en)
//   regisseur: dezelfde regisseur als een film die je 4 sterren of meer gaf
//   hoogste:   het hoogste betrouwbare cijfer op je lijst dat je nog niet zag
//   smaak:     past sterk bij je smaakprofiel (alleen als dat profiel al
//              genoeg sterren heeft om op te bouwen)
//   dienst:    staat nu op een van je diensten
//   past:      is vanavond nog voor half een uit
//   lijst:     gewoon van je eigen lijst
export const SMAAK_REDEN = 70;
export function beschrijfHoofdfilm(film, { meta, ratedFilms = [], mijnDiensten = [], binnen = [], hoogsteKey = null, taste = null, nu = new Date() }) {
  const m = meta[film.key] || {};
  const mijn = new Set(mijnDiensten);
  const flat = m.flat || [];
  const dienst = flat.find((p) => mijn.has(p)) || (mijn.size ? null : flat[0]) || null;
  const past = !!m.runtime && m.runtime <= avondRuimte(nu);
  const nieuw = binnen.find((b) => b.film.key === film.key);
  let reden = { soort: 'lijst' };
  if (nieuw) reden = { soort: 'binnen', dienst: nieuw.dienst };
  else {
    const zelfde = m.director && ratedFilms
      .filter((f) => f.key !== film.key && f.rating >= 4 && meta[f.key]?.director === m.director)
      .sort((a, b) => b.rating - a.rating)[0];
    const smaak = taste?.sterk ? smaakVan(m, taste) : null;
    if (zelfde) reden = { soort: 'regisseur', regisseur: m.director, titel: zelfde.name, sterren: zelfde.rating };
    else if (hoogsteKey === film.key) reden = { soort: 'hoogste' };
    else if (smaak && smaak.pct >= SMAAK_REDEN) reden = { soort: 'smaak', pct: smaak.pct, genre: smaak.genre, era: smaak.era };
    else if (dienst && past) reden = { soort: 'dienst', dienst };
    else if (past) reden = { soort: 'past' };
  }
  return { film, m, dienst, past, reden };
}

// De hoofdfilm van vanavond. Kandidaten: films van je lijst die je nog niet
// zag, waarvan de filmdata er is, en die geen korte film zijn (heeft je lijst
// alleen korte films, dan toch). Wat telt:
//   - een betrouwbaar cijfer (gedempt bij weinig stemmen, nooit opgeblazen)
//   - je smaak: het matchpercentage van Voor jou, zwaarder zodra je profiel
//     genoeg sterren heeft
//   - op je diensten, net binnen, vanavond nog uit, een filmbeeld
//   - de avond zelf: doordeweeks liever geen lange zit, op vrijdag en
//     zaterdag juist wel
//   - afwisseling: niet dezelfde regisseur of hetzelfde genre als gisteren,
//     niet wat de afgelopen week al hoofdfilm was of wat je de afgelopen twee
//     weken al pickte, en wat je op meerdere dagen wegklikte zakt
//   - het lot van de dag beslist tussen films die dicht bij elkaar liggen
// Alles over eerdere dagen; wat je vandaag doet, verandert de keuze van
// vandaag niet (behalve "Een andere film").
//   weg:         films die je vandaag al wegklikte
//   vorige:      [{ dag, key }] de hoofdfilms van eerdere dagen
//   overgeslagen: { key: [dag] } de dagen waarop je een film wegklikte
//   gepickt:     [{ key, date }] je pick-geschiedenis
export function kiesHoofdfilm({
  watchlist, meta, seenSet = new Set(), ratedFilms = [], mijnDiensten = [], weg = [], nu = new Date(),
  taste = null, vorige = [], overgeslagen = {}, gepickt = [],
}) {
  const wegSet = new Set(weg);
  const alle = watchlist.filter((f) => meta[f.key] && !seenSet.has(f.key));
  if (!alle.length) return null;
  const lang = alle.filter((f) => !isKort(meta[f.key]));
  const kandidaten = lang.length ? lang : alle;
  const mijn = new Set(mijnDiensten);
  const ruimte = avondRuimte(nu);
  const binnen = netBinnen(watchlist, meta, { mijnDiensten, seenSet, nu: nu.getTime() });
  const binnenKeys = new Set(binnen.map((b) => b.film.key));
  const dag = vandaag(nu);
  const weekend = [5, 6].includes(nu.getDay());

  // Afwisseling, alleen uit eerdere dagen
  const eerder = vorige.filter((v) => v.dag < dag).sort((a, b) => (a.dag < b.dag ? 1 : -1));
  const gisteren = eerder[0] && meta[eerder[0].key];
  const weekGeleden = vandaag(new Date(nu.getTime() - 7 * 864e5));
  const laatsteWeek = new Set(eerder.filter((v) => v.dag >= weekGeleden).map((v) => v.key));
  const begin = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate()).getTime();
  const recentGepickt = new Set(gepickt
    .filter((h) => { const t = new Date(h.date).getTime(); return t < begin && t >= begin - 14 * 864e5; })
    .map((h) => h.key));

  // Je smaak weegt mee naar hoe sterk je profiel is
  const smaakGewicht = taste ? (taste.sterk ? 1 : 0.4) : 0;

  let hoogste = null;
  kandidaten.forEach((f) => {
    const c = betrouwbaarCijfer(meta[f.key]);
    if (!hoogste || c > hoogste.c) hoogste = { key: f.key, c };
  });

  let beste = null;
  kandidaten.forEach((f) => {
    if (wegSet.has(f.key)) return;
    const m = meta[f.key];
    const flat = m.flat || [];
    let s = betrouwbaarCijfer(m);
    if (smaakGewicht) s += smaakGewicht * ((smaakVan(m, taste)?.pct ?? 60) - 60) / 12;
    if (flat.some((p) => mijn.has(p))) s += 0.6;
    else if (flat.length) s += mijn.size ? 0.15 : 0.4;
    if (binnenKeys.has(f.key)) s += 0.5;
    if (m.runtime) {
      s += m.runtime <= ruimte ? 0.3 : -0.8;
      if (!weekend && m.runtime > 130) s -= 0.3;
      if (weekend && m.runtime >= 140) s += 0.3;
    }
    if (m.backdrop) s += 0.3;
    if (gisteren) {
      if (m.director && m.director === gisteren.director) s -= 0.6;
      if (m.genres?.[0] && m.genres[0] === gisteren.genres?.[0]) s -= 0.4;
    }
    if (laatsteWeek.has(f.key)) s -= 0.7;
    if (recentGepickt.has(f.key)) s -= 1;
    const keer = new Set(overgeslagen[f.key] || []).size;
    s -= keer >= 3 ? 1.5 : keer * 0.3;
    s += lot(`${dag}|${f.key}`) * 0.9;
    if (!beste || s > beste.s) beste = { f, s };
  });
  if (!beste) return null;
  return beschrijfHoofdfilm(beste.f, { meta, ratedFilms, mijnDiensten, binnen, hoogsteKey: hoogste?.key, taste, nu });
}

// De voorfilm: in de bioscoop draaide er een korte film voor de hoofdfilm.
// Een korte film van je lijst die je nog niet zag, op cijfer en smaak, met
// het lot van de dag. Geen korte films op je lijst: geen voorfilm.
export function kiesVoorfilm({ watchlist, meta, seenSet = new Set(), taste = null, nu = new Date(), zonder = null }) {
  const dag = vandaag(nu);
  let beste = null;
  watchlist.forEach((f) => {
    const m = meta[f.key];
    if (!m || f.key === zonder || seenSet.has(f.key) || !isKort(m)) return;
    let s = betrouwbaarCijfer(m);
    if (taste) s += (taste.sterk ? 1 : 0.4) * ((smaakVan(m, taste)?.pct ?? 60) - 60) / 12;
    s += lot(`voorfilm|${dag}|${f.key}`) * 0.9;
    if (!beste || s > beste.s) beste = { film: f, m, s };
  });
  return beste ? { film: beste.film, m: beste.m } : null;
}
