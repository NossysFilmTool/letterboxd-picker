// De hoofdreden waarom een film in Voor jou staat, in één zin: via welke
// route kwam hij binnen. Gedeeld door de kaart en het snelbeoordeelscherm.
export function hoofdreden(r, tr, seededOnRatings = true) {
  const oeuvreBron = (r.bronnen || []).find((b) => b.startsWith('oeuvre:'));
  if (oeuvreBron) return tr('verken.fromOeuvre', { name: oeuvreBron.slice(7) });
  if (r.seeds?.length) {
    const names = `${r.seeds.slice(0, 2).join(tr('verken.and'))}${r.seeds.length > 2 ? tr('verken.andOthers', { count: r.seeds.length - 2 }) : ''}`;
    // Hele zinnen per taal (Engels heeft een andere woordvolgorde)
    if (r.bronnen.includes('vergelijkbaar') && !r.bronnen.includes('aanbevolen')) return tr('verken.redenLijkt', { names });
    if (r.bronnen.includes('aanbevolen') && seededOnRatings) return tr('verken.redenHoog', { names });
    return tr('verken.redenLijst', { names, count: r.seeds.length });
  }
  if (r.viaTheme?.length) return tr('verken.foundOnThemes', { themes: r.viaTheme.slice(0, 3).join(', ') });
  return tr('verken.viaProfile');
}

// De korte reden onder een tegel: wat de rij-kop nog niet zegt. In Top voor
// jou wordt dat "Lijkt op Aftersun" of "Van Kore-eda"; in "Meer van Y" zeggen
// we niet nog eens "van Y" maar op welke favoriet hij lijkt. Geen goede reden:
// null (liever niets dan een vage reden).
export function kortReden(r, rij, tr) {
  const regisseur = (r.bronnen || []).find((b) => b.startsWith('oeuvre:'))?.slice(7);
  const rijRegisseur = rij?.type === 'oeuvre' ? rij.naam
    : (rij?.type === 'eigen' && rij.rij?.basis === 'maker' ? rij.rij.maker?.naam : null);
  if (regisseur && regisseur !== rijRegisseur) return tr('verken.kortVan', { name: regisseur });
  const seed = (r.seeds || []).find((s) => !(rij?.type === 'seed' && s === rij.naam));
  if (seed) return tr('verken.kortLijktOp', { name: seed });
  const thema = r.gedeeldeThemas?.[0] || r.viaTheme?.[0];
  if (thema && rij?.type !== 'thema') return tr('verken.kortOver', { thema });
  return null;
}
