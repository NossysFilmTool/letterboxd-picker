import Papa from 'papaparse';
import JSZip from 'jszip';
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

// result: { watchlist?, watched?, ratings?, diary?, lists? } — alleen aanwezig wat gevonden is
export async function parseLetterboxdFiles(fileList) {
  const result = {};
  for (const file of fileList) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.zip')) {
      const zip = await JSZip.loadAsync(file);
      for (const [path, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        const base = path.split('/').pop().toLowerCase();
        if (base === 'watchlist.csv') result.watchlist = rowsToFilms(parseCsvText(await entry.async('text')));
        else if (base === 'watched.csv') result.watched = rowsToFilms(parseCsvText(await entry.async('text')));
        else if (base === 'ratings.csv') result.ratings = rowsToRatings(parseCsvText(await entry.async('text')));
        else if (base === 'diary.csv') result.diary = rowsToDiary(parseCsvText(await entry.async('text')));
        else if (path.toLowerCase().includes('lists/') && base.endsWith('.csv')) {
          const lijst = parseListCsv(await entry.async('text'), base.replace('.csv', '').replace(/-/g, ' '));
          if (lijst) (result.lists = result.lists || []).push(lijst);
        }
      }
    } else if (lower.endsWith('.csv')) {
      const text = await file.text();
      const rows = parseCsvText(text);
      if (lower.includes('ratings')) result.ratings = rowsToRatings(rows);
      else if (lower.includes('watched')) result.watched = rowsToFilms(rows);
      else if (lower.includes('watchlist')) result.watchlist = rowsToFilms(rows);
      else if (rows.length && 'Rating' in rows[0]) result.ratings = rowsToRatings(rows);
      else result.watchlist = rowsToFilms(rows); // aanname: losse CSV zonder herkenbare naam = watchlist
    }
  }
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
  return {
    eerste: oudWl.size === 0,
    totaal: nieuwWl.size,
    nieuwOpWl: [...nieuwWl].filter((k) => !oudWl.has(k)).length,
    vanWlAf: [...oudWl].filter((k) => !nieuwWl.has(k)).length,
    nieuweRatings: Object.keys(nieuweRatings).filter((k) => !(k in oudRatings)).length,
    nieuwGezien: (res.watched || []).filter((f) => !oudSeen.has(f.key)).length,
  };
}
