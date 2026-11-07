// "Net binnen": sinds wanneer staat een film op een streamingdienst?
//
// TMDB geeft alleen het huidige aanbod, geen datums. Daarom onthoudt de app
// het zelf: elke keer dat het aanbod van een film ververst wordt, vergelijken
// we met de vorige keer. Een dienst die er nieuw bij staat krijgt de datum van
// nu. Wat er al stond toen we begonnen met bijhouden, krijgt 0 ("onbekend"):
// daarvan weten we niet of het nieuw is, dus het telt nooit als net binnen.
//
// In de filmdata (meta):
//   flatSinds: { Netflix: 1762300000000, MUBI: 0 }     alleen huidige diensten
//   flatWeg:   { Videoland: { op, sinds } }            recent verdwenen
// Verdwijnt een dienst en komt hij binnen drie dagen terug, dan was het een
// hapering in de gegevens en houdt hij zijn oude datum.

const DAG = 24 * 3600e3;
const HAPERING = 3 * DAG;
const WEG_BEWAREN = 30 * DAG;

const zelfde = (a = [], b = []) => a.length === b.length && a.every((x) => b.includes(x));

// De bijgewerkte filmdata voor één film (oud: vorige versie, nieuw: de nieuwe)
export function aanbodSinds(oud, nieuw, nu = Date.now()) {
  if (!nieuw || !Array.isArray(nieuw.flat)) return nieuw;
  const flat = nieuw.flat;
  // flatSinds: null betekent opnieuw beginnen (bijv. na een regiowissel)
  const opnieuw = nieuw.flatSinds === null;
  const vorigSinds = opnieuw ? null : (oud?.flatSinds || nieuw.flatSinds || null);
  if (!vorigSinds) {
    return { ...nieuw, flatSinds: Object.fromEntries(flat.map((p) => [p, 0])), flatWeg: {} };
  }
  // flatSinds bevat precies de diensten van de vorige keer
  const vorigFlat = Object.keys(vorigSinds);
  if (zelfde(vorigFlat, flat) && nieuw.flatSinds === vorigSinds) return nieuw;

  const vorigWeg = oud?.flatWeg || nieuw.flatWeg || {};
  const weg = {};
  Object.entries(vorigWeg).forEach(([p, w]) => { if (w && nu - w.op < WEG_BEWAREN) weg[p] = w; });
  const sinds = {};
  flat.forEach((p) => {
    if (vorigFlat.includes(p) && p in vorigSinds) sinds[p] = vorigSinds[p];
    else if (weg[p] && nu - weg[p].op < HAPERING) sinds[p] = weg[p].sinds;
    else sinds[p] = nu;
    delete weg[p];
  });
  vorigFlat.forEach((p) => {
    if (!flat.includes(p)) weg[p] = { op: nu, sinds: vorigSinds[p] ?? 0 };
  });
  return { ...nieuw, flatSinds: sinds, flatWeg: weg };
}

// Over de hele filmcache: alleen films waarvan de gegevens veranderden
export function volgAanbod(prev, next, nu = Date.now()) {
  if (!next || next === prev) return next;
  let uit = next;
  for (const k of Object.keys(next)) {
    if (prev && next[k] === prev[k]) continue;
    const bij = aanbodSinds(prev?.[k], next[k], nu);
    if (bij !== next[k]) {
      if (uit === next) uit = { ...next };
      uit[k] = bij;
    }
  }
  return uit;
}

// Films van je watchlist die de afgelopen dagen op een (van jouw) dienst(en)
// verschenen, nieuwste eerst. mijnDiensten leeg: alle diensten tellen.
export function netBinnen(watchlist, meta, { mijnDiensten = [], seenSet = new Set(), dagen = 7, nu = Date.now() } = {}) {
  const uit = [];
  watchlist.forEach((f) => {
    if (seenSet.has(f.key)) return;
    const m = meta[f.key];
    if (!m?.flatSinds) return;
    const nieuw = Object.entries(m.flatSinds)
      .filter(([p, t]) => t > 0 && nu - t <= dagen * DAG && (m.flat || []).includes(p))
      .filter(([p]) => !mijnDiensten.length || mijnDiensten.includes(p))
      .sort((a, b) => b[1] - a[1]);
    if (nieuw.length) uit.push({ film: f, dienst: nieuw[0][0], sinds: nieuw[0][1] });
  });
  return uit.sort((a, b) => b.sinds - a.sinds);
}
