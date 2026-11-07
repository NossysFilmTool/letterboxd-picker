import { nossyScore, fmtScore } from './pick.js';

// Het bioscoopkaartje van een pick ("De zaal", DESIGN.md). Alles op het
// kaartje is echt: aanvang is nu (afgerond op het volgende vijftal minuten),
// einde volgt uit de speelduur, de dienst en de prijs uit het streamingaanbod,
// de streepjescode uit het TMDB-nummer. Gedeeld door het kaartje in de app
// (components/Kaartje.jsx) en het deelplaatje (lib/extra.js).

// Drukletters: de enige plek in de app waar tekst in hoofdletters gaat, zoals
// op een gedrukt kaartje (DESIGN.md; bewaakt door stijl.test.js)
export const drukletters = (s, lang) => String(s).toLocaleUpperCase(lang);

// De datum zoals op het kaartje: "DO 06-11-2026"
export function kaartjeDatum(d, lang) {
  const tekst = new Intl.DateTimeFormat(lang, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
    .format(d).replace(/\./g, '').replace(/\//g, '-');
  return drukletters(tekst, lang);
}

// Aanvang: het eerstvolgende veelvoud van vijf minuten, nooit nu zelf
export function aanvangTijd(nu = new Date()) {
  const d = new Date(nu);
  d.setSeconds(0, 0);
  d.setMinutes(Math.ceil((d.getMinutes() + 1) / 5) * 5);
  return d;
}

// "A", "A en B", "A, B en C"
function namenLijst(namen, en) {
  if (namen.length <= 1) return namen.join('');
  return `${namen.slice(0, -1).join(', ')} ${en} ${namen[namen.length - 1]}`;
}

// De inhoud van het kaartje. tr en lang uit useT (of t uit i18n.js).
export function kaartjeInhoud(film, meta, { tr, lang, personen = 1, nu = new Date() }) {
  const hoofd = (s) => drukletters(s, lang);
  const tijd = (d) => new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' }).format(d);
  const aanvang = aanvangTijd(nu);
  const runtime = meta?.runtime || null;
  const einde = runtime ? new Date(aanvang.getTime() + runtime * 60000) : null;
  const datum = kaartjeDatum(nu, lang);

  // Aftiteling: regie en de eerste namen van de rolverdeling
  const cast = (meta?.cast || []).slice(0, 3);
  let aftiteling = null;
  if (meta?.director && cast.length) aftiteling = tr('kaartje.aftitelingBeide', { regie: meta.director, namen: namenLijst(cast, tr('kaartje.en')) });
  else if (meta?.director) aftiteling = tr('kaartje.aftitelingRegie', { regie: meta.director });
  else if (cast.length) aftiteling = tr('kaartje.aftitelingCast', { namen: namenLijst(cast, tr('kaartje.en')) });

  // Het cijfer: Nossy bij twee of meer bronnen, anders TMDB (een opgeblazen
  // TMDB-cijfer laat nossyScore al weg; dan staat er geen cijfer)
  const ns = nossyScore(meta);
  const bronnen = meta ? [meta.ext?.imdb, meta.ext?.mc, meta.vote].filter((v) => v != null).length : 0;
  const cijfer = ns == null ? null : { label: bronnen >= 2 ? tr('winner.nossy') : 'TMDB', waarde: fmtScore(ns) };

  const flat = meta?.flat || [];
  const rent = meta?.rent || [];
  const dienst = flat.length ? flat.slice(0, 2).join(', ') : rent.length ? rent[0] : null;
  const prijs = flat.length ? tr('kaartje.inbegrepen') : rent.length ? tr('kaartje.huur') : null;

  const velden = [
    { k: tr('kaartje.aanvang'), v: tijd(aanvang) },
    einde ? { k: tr('kaartje.einde'), v: tijd(einde) } : null,
    film.year ? { k: tr('kaartje.jaar'), v: String(film.year) } : null,
    cijfer ? { k: cijfer.label, v: cijfer.waarde } : null,
    dienst ? { k: tr('kaartje.kijkOp'), v: hoofd(dienst), breed: true } : null,
    prijs ? { k: tr('kaartje.prijs'), v: hoofd(prijs), breed: true } : null,
  ].filter(Boolean);

  const tmdbId = meta?.id || (film.key?.startsWith('tmdb:') ? film.key.slice(5) : null);
  return {
    kop: hoofd(tr('kaartje.kop')),
    datum,
    titel: hoofd(film.name),
    aftiteling,
    velden,
    code: tmdbId ? `TMDB ${tmdbId}` : null,
    toegang: hoofd(tr('kaartje.toegang', { count: personen, n: personen })),
  };
}

// Een streepjescode als reeks [x, breedte], vast per code: dezelfde film
// geeft altijd dezelfde streepjes. Geen echte barcode, wel herkenbaar.
export function streepjes(code, breedte = 190) {
  const s = String(code || 'nossy');
  const uit = [];
  let x = 0;
  let i = 0;
  while (x < breedte - 3) {
    const c = s.charCodeAt(i % s.length) + i * 7;
    const w = 1 + (c % 3);
    uit.push([x, w]);
    x += w + 1 + ((c >> 2) % 3);
    i += 1;
  }
  return uit;
}
