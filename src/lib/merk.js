// De naam van de tool, op één plek. De teksten in de woordenboeken schrijven
// {app} en {appScore}; i18n.js vult ze hier vandaan in. Een nieuwe naam is
// dus deze twee regels, plus index.html en public/manifest.webmanifest (die
// de browser leest voordat de app er is).
//
// De opslag hangt hier bewust niet van af (lib/naamruimte.js): een nieuwe
// naam vraagt nooit een verhuizing van je gegevens.
export const NAAM = 'ShutterBox';
export const SCORE = 'ShutterScore';
// Voor bestandsnamen (back-up, export)
export const SLUG = NAAM.toLowerCase();

// Een nieuwe naam: wie de tool al gebruikte, hoort het één keer, rustig, en
// ook dat alles er nog is (lib/useOpstart.js). Alleen in een uitgebrachte
// versie. 'melding': nu laten weten; 'stil': alleen onthouden (een leeg
// apparaat of de demo begint gewoon onder deze naam); null: niets te doen.
// gezien staat in de instellingen en reist mee met sync.
export function naamMoment({ versie, gezien, watchlist, demoMode }) {
  if (!/^\d+\.\d+\.\d+$/.test(versie || '') || gezien === NAAM) return null;
  return watchlist > 0 && !demoMode ? 'melding' : 'stil';
}
