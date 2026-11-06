// De kenmerken waarop het geleerde model rangschikt, per kandidaat. Puur en
// zonder afhankelijkheden, zodat de motor (kandidaten.js) en de training
// (model.js) precies dezelfde getallen gebruiken.
//
// Een model is { w, mu, sd, kenmerken }: score = som w * (x - mu) / sd.
// Een bewaard model met een andere kenmerkenlijst (oudere versie) telt niet.

export const KENMERKEN = [
  'kwaliteit', 'thema', 'themaBekend', 'genre', 'tijdperk', 'taal', 'obscuriteit',
  'bekendheid', 'sterkte', 'routes',
  'aanbevolen', 'vergelijkbaar', 'oeuvre', 'watchlist', 'profiel', 'themaJacht',
  'anti', 'nietEngels', 'favorieten',
];
export const KENMERKEN_SLEUTEL = KENMERKEN.join(',');

// Wat de vaste weging (rows.js: 10% sterkte, 90% match) per kenmerk doet,
// als vertrekpunt: met weinig gegevens blijft het model daar dichtbij.
// Matchgewichten zonder thema (0,35/0,8 enzovoort), thema gemiddeld.
export const VASTE_WEGING = {
  kwaliteit: 0.9 * 0.4375, thema: 0.9 * 0.1, genre: 0.9 * 0.25, tijdperk: 0.9 * 0.15,
  taal: 0.9 * 0.1, obscuriteit: 0.9 * 0.0625, sterkte: 0.1 / 3,
};

export function kenmerken(r, taste = {}) {
  const rc = {};
  (r.recept || []).forEach((c) => { rc[c.id] = c.v; });
  const b = r.bronnen || [];
  const mv = taste.medianVotes;
  const bekendheid = r.votes && mv ? Math.max(-1, Math.min(1, (Math.log10(r.votes) - Math.log10(mv)) / 2)) : 0;
  return [
    rc.quality ?? 0.5,
    rc.theme ?? 0.5,
    rc.theme != null ? 1 : 0,
    rc.genre ?? 0.5,
    rc.era ?? 0.5,
    rc.lang ?? 0.5,
    rc.obscurity ?? 0.5,
    bekendheid,
    Math.log1p(r.waarde || 0),
    Math.min(r.routes || 0, 4) / 4,
    b.includes('aanbevolen') ? 1 : 0,
    b.includes('vergelijkbaar') ? 1 : 0,
    b.some((x) => x.startsWith('oeuvre:')) ? 1 : 0,
    b.includes('watchlist') ? 1 : 0,
    b.includes('profiel') ? 1 : 0,
    b.includes('thema') ? 1 : 0,
    r.anti ? 1 : 0,
    r.lang && r.lang !== 'en' ? 1 : 0,
    Math.min(r.seeds?.length || 0, 3) / 3,
  ];
}

export const modelGeldig = (m) => !!(m && Array.isArray(m.w) && m.w.length === KENMERKEN.length && m.kenmerken === KENMERKEN_SLEUTEL);

export function scoorMetModel(model, km) {
  let s = 0;
  for (let i = 0; i < km.length; i++) s += model.w[i] * ((km[i] - model.mu[i]) / model.sd[i]);
  return s;
}

// Wat je expliciet afwees ("te mainstream", "de regisseur") blijft gelden,
// ook met een model: dat leert het niet uit je beoordelingen. De straf telt
// in de spreiding van de modelscores (model.spreiding), zodat "niet van deze
// regisseur" (0,25) een film zo'n drie standaarddeviaties omlaag zet, net als
// de 25 matchpunten zonder model.
export const STRAF_GEWICHT = 12;
