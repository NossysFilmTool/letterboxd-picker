// De voorpagina (Pick.jsx, DESIGN.md "De voorpagina"): elke dag een
// hoofdfilm van vanavond uit je eigen watchlist, met een echte reden erbij.
// De keuze verschuift per dag, zodat de voorpagina elke dag anders is, maar
// springt niet bij elke keer openen. "Een andere film" schuift naar de
// volgende; dat geldt de rest van de dag.

import { nossyScore } from './pick.js';
import { avondRuimte } from './foryou.js';
import { netBinnen } from './aanbod.js';

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
//   hoogste:   het hoogste cijfer op je lijst dat je nog niet zag
//   dienst:    staat nu op een van je diensten
//   past:      is vanavond nog voor half een uit
//   lijst:     gewoon van je eigen lijst
export function beschrijfHoofdfilm(film, { meta, ratedFilms = [], mijnDiensten = [], binnen = [], hoogsteKey = null, nu = new Date() }) {
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
    if (zelfde) reden = { soort: 'regisseur', regisseur: m.director, titel: zelfde.name, sterren: zelfde.rating };
    else if (hoogsteKey === film.key) reden = { soort: 'hoogste' };
    else if (dienst && past) reden = { soort: 'dienst', dienst };
    else if (past) reden = { soort: 'past' };
  }
  return { film, m, dienst, past, reden };
}

// De hoofdfilm van vanavond. Kandidaten: films van je lijst die je nog niet
// zag en waarvan de filmdata er is. Een hoger cijfer weegt het zwaarst; wat op
// je diensten staat, net binnen is, vanavond nog past en een filmbeeld heeft,
// krijgt voorrang. Het lot van de dag beslist tussen films die dicht bij
// elkaar liggen.
//   weg: films die je vandaag al wegklikte
export function kiesHoofdfilm({ watchlist, meta, seenSet = new Set(), ratedFilms = [], mijnDiensten = [], weg = [], nu = new Date() }) {
  const wegSet = new Set(weg);
  const kandidaten = watchlist.filter((f) => meta[f.key] && !seenSet.has(f.key));
  if (!kandidaten.length) return null;
  const mijn = new Set(mijnDiensten);
  const ruimte = avondRuimte(nu);
  const binnen = netBinnen(watchlist, meta, { mijnDiensten, seenSet, nu: nu.getTime() });
  const binnenKeys = new Set(binnen.map((b) => b.film.key));
  const dag = vandaag(nu);
  const cijfer = (f) => nossyScore(meta[f.key]) ?? meta[f.key].vote ?? null;

  let hoogste = null;
  kandidaten.forEach((f) => {
    const c = cijfer(f);
    if (c != null && (!hoogste || c > hoogste.c)) hoogste = { key: f.key, c };
  });

  let beste = null;
  kandidaten.forEach((f) => {
    if (wegSet.has(f.key)) return;
    const m = meta[f.key];
    const flat = m.flat || [];
    let s = cijfer(f) ?? 6.5;
    if (flat.some((p) => mijn.has(p))) s += 0.6;
    else if (flat.length) s += mijn.size ? 0.15 : 0.4;
    if (binnenKeys.has(f.key)) s += 0.5;
    if (m.runtime) s += m.runtime <= ruimte ? 0.3 : -0.8;
    if (m.backdrop) s += 0.3;
    s += lot(`${dag}|${f.key}`) * 0.9;
    if (!beste || s > beste.s) beste = { f, s };
  });
  if (!beste) return null;
  return beschrijfHoofdfilm(beste.f, { meta, ratedFilms, mijnDiensten, binnen, hoogsteKey: hoogste?.key, nu });
}
