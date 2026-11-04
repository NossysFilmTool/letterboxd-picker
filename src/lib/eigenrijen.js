// Eigen rijen: rijen die je zelf samenstelt in Voor jou ("Koreaanse
// thrillers uit de jaren 2000", "Lijkt op Burning", "Van Wong Kar-wai").
// Puur en testbaar: wat een rij is, hoe hij heet, welke TMDB-zoekvraag erbij
// hoort en welke films erin passen.
import { GENRES, genreLabelById } from './tmdb.js';
import { pastFilter, degelijk } from './foryou.js';
import { sorteerOpSterkte } from './rows.js';

// Een eigen rij:
//   { id, naam, basis: 'criteria' | 'film' | 'maker',
//     film: { id, title, year } | null, maker: { id, naam, rol: 'regie' | 'cast' } | null,
//     genres: [tmdb-ids], themas: [{ id, name }], land: 'KR', jaarVan, jaarTot,
//     kort, dienst: '' | '*' | '~mijn' | naam, taal, minScore, minVotes, maxVotes }
export const LEEG = {
  basis: 'criteria', film: null, maker: null, genres: [], themas: [], land: '', jaarVan: '', jaarTot: '',
  kort: false, dienst: '', taal: '', minScore: 0, minVotes: '', maxVotes: '',
};
export const normaliseer = (r) => ({ ...LEEG, ...(r || {}) });

// Filmlanden om uit te kiezen (ISO 3166-1); namen komen uit Intl in de UI-taal
export const LANDEN = ['KR', 'JP', 'FR', 'IT', 'DE', 'ES', 'IR', 'IN', 'CN', 'HK', 'TW', 'MX', 'AR', 'BR', 'CL', 'CO',
  'SE', 'DK', 'NO', 'FI', 'IS', 'PL', 'RO', 'HU', 'CZ', 'GR', 'PT', 'AT', 'CH', 'BE', 'NL', 'IE', 'GB', 'US', 'CA',
  'AU', 'NZ', 'RU', 'TR', 'IL', 'TH', 'PH', 'SN', 'NG', 'ZA', 'EG'];

// Genoeg ingevuld om iets te zoeken?
export function isBruikbaar(r) {
  const b = normaliseer(r);
  if (b.basis === 'film') return !!b.film?.id;
  if (b.basis === 'maker') return !!b.maker?.id;
  return !!(b.genres.length || b.themas.length || b.land || b.jaarVan || b.jaarTot || b.kort || b.dienst
    || b.taal || b.minScore || b.minVotes || b.maxVotes);
}

// Vingerafdruk van de bouwstenen (zonder naam en id): herkent dubbele rijen
// en zoekresultaten die bij een oudere versie van de rij horen.
export function handtekening(r) {
  const b = normaliseer(r);
  return JSON.stringify([
    b.basis, b.film?.id || null, b.maker?.id || null, b.maker?.rol || null,
    [...b.genres].sort(), b.themas.map((t) => t.id).sort(), b.land, String(b.jaarVan), String(b.jaarTot),
    !!b.kort, b.dienst, b.taal, b.minScore || 0, String(b.minVotes), String(b.maxVotes),
  ]);
}

// Automatische naam uit de bouwstenen, bijv. "Thriller uit Zuid-Korea, 2000–2009"
export function autoNaam(r, { tr, landNaam = (c) => c }) {
  const b = normaliseer(r);
  if (b.basis === 'film' && b.film) return tr('verken.naamFilm', { title: b.film.title });
  if (b.basis === 'maker' && b.maker) return tr('verken.naamMaker', { naam: b.maker.naam });
  const genres = b.genres.map(genreLabelById).filter(Boolean);
  let kop = genres.length ? genres.join(' & ') : tr('verken.naamFilms');
  if (b.themas.length) kop += ` ${tr('verken.naamThema', { themas: b.themas.map((t) => t.name).join(tr('verken.and')) })}`;
  if (b.land) kop += ` ${tr('verken.naamLand', { land: landNaam(b.land) })}`;
  const delen = [kop];
  if (b.jaarVan || b.jaarTot) delen.push(`${b.jaarVan || '…'}–${b.jaarTot || tr('zoek.qNow')}`);
  if (b.kort) delen.push(tr('verken.naamKort'));
  if (b.dienst === '*') delen.push(tr('verken.naamStreaming'));
  else if (b.dienst === '~mijn') delen.push(tr('verken.naamMijnDiensten'));
  else if (b.dienst) delen.push(tr('verken.naamDienst', { dienst: b.dienst }));
  return delen.join(', ');
}

// TMDB-zoekvragen voor een rij op criteria: de best beoordeelde én de
// bekendste films die erbij passen (die laatste voorkomt een rij vol films
// met 150 stemmen). providerIds: de TMDB-id's van de gekozen dienst(en).
export function zoekVragen(r, { providerIds = [] } = {}) {
  const b = normaliseer(r);
  const basis = {
    genreIds: b.genres,
    keywordIds: b.themas.map((t) => t.id),
    originCountry: b.land || undefined,
    yearFrom: b.jaarVan || undefined,
    yearTo: b.jaarTot || undefined,
    minRuntime: 60,
    maxRuntime: b.kort ? 105 : undefined,
    providerIds: providerIds.length ? providerIds : undefined,
    lang: b.taal || 'alle',
    minScore: b.minScore || undefined,
    maxVotes: b.maxVotes || undefined,
  };
  return [
    { ...basis, minVotes: b.minVotes || 150, sortBy: 'vote_average.desc' },
    { ...basis, minVotes: b.minVotes || 50, sortBy: 'popularity.desc' },
  ];
}

// Past een kandidaat in deze eigen rij? Hij moet via de rij zelf zijn
// binnengekomen. Bij een rij op criteria filtert TMDB al; alleen een dienst
// die TMDB niet kon filteren ("elke dienst") controleren we hier, zodra het
// aanbod bekend is. Bij "lijkt op" en "van een maker" gelden de overige
// bouwstenen als filter.
export function pastEigen(f, r, mijnDiensten = []) {
  const b = normaliseer(r);
  if (!f.bronnen?.includes(`eigen:${r.id}`)) return false;
  if (b.basis === 'criteria') {
    if (b.dienst && f.flat) return pastFilter(f, { dienst: b.dienst, mijnDiensten });
    return true;
  }
  if (b.genres.length && !b.genres.every((g) => (f.genre_ids || []).includes(g))) return false;
  if (b.jaarVan && (!f.year || f.year < +b.jaarVan)) return false;
  if (b.jaarTot && (!f.year || f.year > +b.jaarTot)) return false;
  if (b.taal === 'niet-en' && f.lang === 'en') return false;
  if (b.taal && b.taal !== 'niet-en' && f.lang && f.lang !== b.taal) return false;
  return pastFilter(f, { kort: b.kort, dienst: b.dienst, mijnDiensten });
}

// De eigen rijen als rijen voor het scherm, in jouw volgorde
export function bouwEigenRijen(list, eigenRijen, { mijnDiensten = [] } = {}) {
  return eigenRijen.map((r) => {
    const past = (f) => pastEigen(f, r, mijnDiensten);
    return { id: r.id, type: 'eigen', naam: r.naam, rij: r, past, films: sorteerOpSterkte(list.filter((f) => degelijk(f) && past(f))) };
  });
}

// Voorstellen op basis van je smaak, om met één tik toe te voegen: landen uit
// je favorieten, je sterkste genre in je sterkste decennium, sterke thema's
// en je sterkste regisseur. Zonder wat je al als eigen rij hebt.
export function stelRijenVoor({ seeds = [], meta = {}, taste = {}, regisseurs = [], bestaande = [] }) {
  const uit = [];
  const tel = {};
  seeds.forEach((s) => {
    const c = meta[s.key]?.country;
    if (c && !['US', 'GB'].includes(c)) tel[c] = (tel[c] || 0) + 1;
  });
  Object.entries(tel).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 2)
    .forEach(([land]) => uit.push({ basis: 'criteria', land }));
  const topG = Object.entries(taste.genres || {}).sort((a, b) => b[1] - a[1])[0];
  const topD = Object.entries(taste.decades || {}).sort((a, b) => b[1] - a[1])[0];
  const gid = topG && GENRES.find((g) => g.en === topG[0])?.id;
  if (gid && topD && topG[1] > 0.3 && topD[1] > 0.3) uit.push({ basis: 'criteria', genres: [gid], jaarVan: +topD[0], jaarTot: +topD[0] + 9 });
  (taste.topThemes || []).filter((t) => (t.films || 0) >= 3).slice(0, 2)
    .forEach((t) => uit.push({ basis: 'criteria', themas: [{ id: t.id, name: t.name }] }));
  const reg = regisseurs.find((r) => r.id);
  if (reg) uit.push({ basis: 'maker', maker: { id: reg.id, naam: reg.naam, rol: 'regie' } });
  const bekend = new Set(bestaande.map(handtekening));
  return uit.map(normaliseer).filter((r) => !bekend.has(handtekening(r))).slice(0, 5);
}
