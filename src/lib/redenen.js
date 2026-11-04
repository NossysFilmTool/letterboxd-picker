// De hoofdreden waarom een film in Voor jou staat, in één zin: via welke
// route kwam hij binnen. Gedeeld door de kaart en het snelbeoordeelscherm.
export function hoofdreden(r, tr, seededOnRatings = true) {
  const oeuvreBron = (r.bronnen || []).find((b) => b.startsWith('oeuvre:'));
  if (oeuvreBron) return tr('verken.fromOeuvre', { name: oeuvreBron.slice(7) });
  if (r.seeds?.length) {
    const soort = r.bronnen.includes('vergelijkbaar') && !r.bronnen.includes('aanbevolen') ? tr('verken.likeThis') : tr('verken.becauseYou');
    const namen = `${r.seeds.slice(0, 2).join(tr('verken.and'))}${r.seeds.length > 2 ? tr('verken.andOthers', { count: r.seeds.length - 2 }) : ''}`;
    const staart = r.bronnen.includes('aanbevolen') ? (seededOnRatings ? tr('verken.ratedHigh') : tr('verken.onYourList')) : '';
    return `${soort} ${namen}${staart}`;
  }
  if (r.viaTheme?.length) return tr('verken.foundOnThemes', { themes: r.viaTheme.slice(0, 3).join(', ') });
  return tr('verken.viaProfile');
}
