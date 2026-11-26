import Papa from 'papaparse';
import { filmKey } from './storage.js';

function parseCsvText(text) {
  const res = Papa.parse(text, { header: true, skipEmptyLines: true });
  return res.data || [];
}

function rowsToFilms(rows) {
  return rows
    .filter((r) => r.Name)
    .map((r) => ({
      key: filmKey(r.Name, parseInt(r.Year) || ''),
      name: r.Name.trim(),
      year: parseInt(r.Year) || null,
      uri: r['Letterboxd URI'] || '',
    }));
}

function rowsToRatings(rows) {
  const map = {};
  const films = [];
  rows.forEach((r) => {
    if (!r.Name) return;
    const rating = parseFloat(r.Rating);
    if (isNaN(rating)) return;
    const key = filmKey(r.Name, parseInt(r.Year) || '');
    map[key] = rating;
    films.push({ key, name: r.Name.trim(), year: parseInt(r.Year) || null, uri: r['Letterboxd URI'] || '', rating });
  });
  return { map, films };
}

// diary.csv: kijkdatums, herkijken en ratings per kijkbeurt
function rowsToDiary(rows) {
  const out = [];
  rows.forEach((r) => {
    if (!r.Name || !r['Watched Date']) return;
    out.push({
      key: filmKey(r.Name, parseInt(r.Year) || ''),
      name: r.Name.trim(),
      year: parseInt(r.Year) || null,
      watchedDate: r['Watched Date'],
      rewatch: (r.Rewatch || '').trim() === 'Yes',
      rating: r.Rating ? parseFloat(r.Rating) : null,
    });
  });
  return out;
}

// Lijst-exports (lists/*.csv) hebben metadata-regels bóven de echte kolomkop
// (export-versie, lijstnaam, beschrijving). Eerst de kop opsporen dus.
function parseListCsv(text, fallbackNaam) {
  const regels = text.split(/\r?\n/);
  const hIdx = regels.findIndex((r) => r.startsWith('Position,'));
  if (hIdx === -1) return null;
  let naam = fallbackNaam;
  if (hIdx >= 3) {
    try {
      const metaRows = parseCsvText(regels.slice(1, 3).join('\n'));
      if (metaRows[0]?.Name) naam = metaRows[0].Name;
    } catch { /* bestandsnaam als vangnet */ }
  }
  const films = rowsToFilms(parseCsvText(regels.slice(hIdx).join('\n')));
  return films.length ? { naam, films } : null;
}

// De bestanden uit een Letterboxd-export die de tool leest. Letterboxd stopt
// er ook mappen bij met bestanden van dezelfde naam: deleted/diary.csv (je
// gewiste logs), orphaned/diary.csv, likes/films.csv (je gelikete films).
// Die horen er niet bij; alleen de bestanden bovenin de export tellen.
const SOORTEN = { 'watchlist.csv': 'watchlist', 'watched.csv': 'watched', 'ratings.csv': 'ratings', 'diary.csv': 'diary' };
const LEES = { watchlist: rowsToFilms, watched: rowsToFilms, ratings: rowsToRatings, diary: rowsToDiary };
// "watchlist (1).csv" of "ratings(2).csv": een tweede download van hetzelfde bestand
const kaleNaam = (naam) => naam.toLowerCase().split('/').pop().replace(/\s*\(\d+\)(?=\.csv$)/, '');
const mapVan = (pad) => pad.slice(0, pad.lastIndexOf('/') + 1);

// Een los CSV-bestand: herkennen aan de naam ("watchlist.csv", ook
// "watchlist van Sam.csv"), anders aan de kolommen. Wat niet zeker is
// (reviews.csv heeft ook sterren, films.csv uit likes/ ziet eruit als een
// watchlist), slaan we over: liever niets dan je sterren of je watchlist
// vervangen door het verkeerde bestand.
const soortVanNaam = (naam) => SOORTEN[naam] || ['watchlist', 'watched', 'ratings', 'diary'].find((s) => naam.includes(s)) || null;
function soortVanKolommen(tekst) {
  if (/^Position,/m.test(tekst)) return 'lijst';
  const kop = (tekst.split(/\r?\n/)[0] || '').split(',').map((k) => k.trim());
  if (kop.includes('Review') || !kop.includes('Name')) return null;
  if (kop.includes('Watched Date')) return 'diary';
  if (kop.includes('Rating') && kop.length === 5) return 'ratings';
  return null;
}

// Uit de bestandsnaam van de ZIP (letterboxd-naam-2026-11-06-19-17-utc.zip):
// van wie de export is, en wanneer hij gemaakt werd
export function exportUitNaam(bestandsnaam) {
  const m = String(bestandsnaam || '').match(/^letterboxd-([a-z0-9_]+)-(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-utc/i);
  return m ? { naam: m[1], datum: `${m[2]}-${m[3]}-${m[4]}T${m[5]}:${m[6]}:00Z` } : null;
}

// Een bestand lezen, en onthouden wat de nieuwste datum erin is (kolom Date:
// toegevoegd, gelogd of beoordeeld). Zonder bestandsnaam van de ZIP is dat
// de beste schatting van wanneer de export gemaakt werd.
const IS_DATUM = /^\d{4}-\d{2}-\d{2}$/;
function leesSoort(soort, tekst, datums) {
  const rijen = parseCsvText(tekst);
  rijen.forEach((r) => { if (IS_DATUM.test(r.Date || '')) datums.push(r.Date); });
  return LEES[soort](rijen);
}

// result: { watchlist?, watched?, ratings?, diary?, lists?, export?, overgeslagen }
// Alleen aanwezig wat gevonden is. export: { naam, datum } (naam alleen uit de
// bestandsnaam van de ZIP; datum anders de nieuwste datum erin).
export async function parseLetterboxdFiles(fileList) {
  const result = { overgeslagen: [] };
  const datums = [];
  let uitNaam = null;
  for (const file of fileList) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.zip')) {
      uitNaam = uitNaam || exportUitNaam(file.name);
      // Pas laden bij een ZIP: wie de CSV's los kiest, heeft hem niet nodig
      const { default: JSZip } = await import('jszip');
      const zip = await JSZip.loadAsync(file);
      const bestanden = Object.values(zip.files).filter((e) => !e.dir && !e.name.includes('__MACOSX'));
      // Bovenin de export: de map met de ondiepste bekende bestanden (een
      // zelf opnieuw ingepakte export heeft er nog een map omheen)
      const bekend = bestanden.filter((e) => SOORTEN[kaleNaam(e.name)]);
      const top = bekend.map((e) => mapVan(e.name)).sort((a, b) => a.split('/').length - b.split('/').length)[0] ?? '';
      for (const e of bestanden) {
        const map = mapVan(e.name);
        const naam = kaleNaam(e.name);
        if (map === top && SOORTEN[naam]) result[SOORTEN[naam]] = leesSoort(SOORTEN[naam], await e.async('text'), datums);
        else if (map === `${top}lists/` && naam.endsWith('.csv')) {
          const lijst = parseListCsv(await e.async('text'), naam.replace('.csv', '').replace(/-/g, ' '));
          if (lijst) (result.lists = result.lists || []).push(lijst);
        }
      }
    } else if (lower.endsWith('.csv')) {
      const tekst = await file.text();
      const soort = soortVanKolommen(tekst) === 'lijst' ? 'lijst' : soortVanNaam(kaleNaam(file.name)) || soortVanKolommen(tekst);
      if (soort === 'lijst') {
        const lijst = parseListCsv(tekst, kaleNaam(file.name).replace('.csv', '').replace(/-/g, ' '));
        if (lijst) (result.lists = result.lists || []).push(lijst);
      } else if (soort) result[soort] = leesSoort(soort, tekst, datums);
      else result.overgeslagen.push(file.name);
    }
  }
  const datum = uitNaam?.datum || (datums.length ? `${datums.sort().pop()}T00:00:00Z` : null);
  if (datum) result.export = { naam: uitNaam?.naam || null, datum };
  return result;
}

// Letterboxd-importformaat: tmdbID zorgt voor betrouwbare matching
export function shortlistToCsv(items) {
  const header = 'tmdbID,Title,Year';
  const lines = items.map((f) => {
    const title = /[",\n]/.test(f.title) ? `"${f.title.replace(/"/g, '""')}"` : f.title;
    return `${f.id},${title},${f.year || ''}`;
  });
  return [header, ...lines].join('\n');
}

export function downloadText(filename, text, mime = 'text/csv') {
  const blob = new Blob([text], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Verschil tussen de huidige staat en een verse Letterboxd-export, zodat een
// her-import kan vertellen wát er veranderde in plaats van stil te vervangen.
export function importDiff(oud, res) {
  const oudWl = new Set((oud.watchlist || []).map((f) => f.key));
  const nieuwWl = new Set((res.watchlist || []).map((f) => f.key));
  const oudSeen = new Set(oud.watchedLb || []);
  const oudRatings = oud.ratings || {};
  const nieuweRatings = res.ratings?.map || {};
  const oudDagboek = new Set((oud.diary || []).map((d) => `${d.key}|${d.watchedDate}`));
  return {
    eerste: oudWl.size === 0,
    totaal: nieuwWl.size,
    nieuwOpWl: [...nieuwWl].filter((k) => !oudWl.has(k)).length,
    vanWlAf: [...oudWl].filter((k) => !nieuwWl.has(k)).length,
    nieuweRatings: Object.keys(nieuweRatings).filter((k) => !(k in oudRatings)).length,
    nieuwGezien: (res.watched || []).filter((f) => !oudSeen.has(f.key)).length,
    nieuwInDagboek: (res.diary || []).filter((d) => !oudDagboek.has(`${d.key}|${d.watchedDate}`)).length,
  };
}

// Het dagboek uit een export samenvoegen met wat er al stond. Letterboxd live
// zette logs met het TMDB-nummer erbij (daarmee herkent de tool Gevonden-
// films); dat nummer blijft. Een log van vóór de exportdag die niet in de
// export staat, is op Letterboxd gewist en gaat eruit; een log van ná de
// export (via Letterboxd live) blijft staan.
//   exportDag: 'YYYY-MM-DD' of null (dan alleen erbij, niets eruit)
export function voegExportDagboekToe(diary = [], nieuw = [], exportDag = null) {
  const sleutel = (d) => `${d.key}|${d.watchedDate}`;
  const oud = new Map(diary.map((d) => [sleutel(d), d]));
  const uitExport = nieuw.map((d) => {
    const was = oud.get(sleutel(d));
    return was?.tmdbId != null ? { ...d, tmdbId: was.tmdbId } : d;
  });
  const inExport = new Set(nieuw.map(sleutel));
  const blijft = diary.filter((d) => !inExport.has(sleutel(d)) && (!exportDag || d.watchedDate > exportDag));
  return [...uitExport, ...blijft];
}

// Wat een export verandert aan je bibliotheek. huidig: { diary, ownRatings }.
// Geeft alleen de delen terug die in de export zaten. Logs van ná de
// exportdag (Letterboxd live) staan nog niet in de export: die films blijven
// gezien, met hun sterren.
export function pasExportToe(huidig, res) {
  const uit = {};
  const exportDag = res.export?.datum?.slice(0, 10) || null;
  if (res.watchlist?.length) uit.watchlist = res.watchlist;
  let diary = huidig.diary || [];
  if (res.diary) {
    uit.diary = voegExportDagboekToe(diary, res.diary, exportDag);
    diary = uit.diary;
  }
  const naExport = exportDag ? diary.filter((d) => d.watchedDate > exportDag).sort((a, b) => a.watchedDate.localeCompare(b.watchedDate)) : [];
  if (res.watched?.length) {
    const films = new Map(res.watched.map((f) => [f.key, f]));
    naExport.forEach((d) => { if (!films.has(d.key)) films.set(d.key, { key: d.key, name: d.name, year: d.year, uri: '' }); });
    uit.watchedFilms = [...films.values()];
    uit.watchedLb = [...films.keys()];
  }
  if (res.ratings && Object.keys(res.ratings.map).length) {
    const map = { ...res.ratings.map };
    const films = new Map(res.ratings.films.map((f) => [f.key, f]));
    naExport.forEach((d) => {
      if (d.rating == null) return;
      map[d.key] = d.rating;
      films.set(d.key, { key: d.key, name: d.name, year: d.year, uri: '', rating: d.rating });
    });
    uit.ratings = map;
    uit.ratedFilms = [...films.values()];
    // Eigen sterren opruimen voor films die Letterboxd nu zelf kent: vanaf
    // hier is de export de bron van waarheid voor die films
    uit.ownRatings = Object.fromEntries(Object.entries(huidig.ownRatings || {}).filter(([k]) => !(k in map)));
  }
  if (res.lists?.length) uit.lbLists = res.lists;
  if (res.watchlist?.length) uit.lbExport = { naam: res.export?.naam || null, datum: res.export?.datum || null, films: res.watchlist.length };
  return uit;
}

// Klopt er iets niet aan deze export? Van een ander account (de naam in de
// bestandsnaam is niet die van je vorige export of van Letterboxd live), of
// ouder dan wat je al hebt. Null als alles klopt.
export function exportTwijfel(nieuw, vorige, lbNaam) {
  if (!nieuw) return null;
  const eigen = vorige?.naam || lbNaam || null;
  if (nieuw.naam && eigen && nieuw.naam.toLowerCase() !== eigen.toLowerCase()) return { soort: 'ander', naam: nieuw.naam, eigen };
  if (vorige?.datum && nieuw.datum && nieuw.datum.slice(0, 10) < vorige.datum.slice(0, 10)) return { soort: 'ouder', nieuw: nieuw.datum, oud: vorige.datum };
  return null;
}
