// De première van Nossy 5 (components/Premiere.jsx, DESIGN.md "De première"):
// wie 5.0 voor het eerst opent en de tool al gebruikte, krijgt één keer een
// premièrekaartje bij de deur en daarna een trailer van zijn eigen tijd met
// Nossy. Alles in die trailer komt uit je eigen gegevens; een zin waar geen
// gegevens voor zijn, valt weg.

import { inDeDoos, jaarOverzicht } from './kaartjesdoos.js';
import { IMG } from './tmdb.js';

export const PREMIERE_VERSIE = '5.0';
export const PREMIERE_KLEUR = '#6b2a26';

// Vanzelf tonen? Alleen in een uitgebrachte versie (zoals 5.0.0: geen beta,
// niet in ontwikkeling of in de tests), één keer per persoon (gezien staat in
// de instellingen en reist mee met sync), niet in de demo, en niet op een
// apparaat dat leeg begon: wie op 5 instapt, heeft geen première te vieren.
export function premiereAutomatisch({ versie, gezien, nieuwHier, watchlist, demoMode }) {
  if (!/^\d+\.\d+\.\d+$/.test(versie || '')) return false;
  return !gezien && !nieuwHier && watchlist > 0 && !demoMode;
}

// De inhoud van de trailer, in de vorm die Pitch.jsx begrijpt (film.inhoud)
//   kaartjesStand: alle kaartjes met hun stand (App), diensten: je diensten
export function premiereInhoud({ watchlist = [], kaartjesStand = [], meta = {}, diensten = [], tr, nu = new Date() }) {
  const gekozen = kaartjesStand.filter((k) => k.bron !== 'gevonden').length;
  const doos = inDeDoos(kaartjesStand);
  const jaar = nu.getFullYear();
  const overzicht = jaarOverzicht(doos, jaar);
  const mijn = new Set(diensten);
  const opDiensten = watchlist.filter((f) => {
    const flat = meta[f.key]?.flat || [];
    return mijn.size ? flat.some((p) => mijn.has(p)) : flat.length > 0;
  }).length;

  // Eerst een shot met wat je deed; pas vanaf twee keer kiezen is het een verhaal
  const slogan = gekozen >= 2
    ? [tr('premiere.gekozen', { count: gekozen }), doos.length ? tr('premiere.gekeken', { count: doos.length }) : null].filter(Boolean).join(' ')
    : null;
  // Dan je filmjaar, als dat er is
  const met = overzicht
    ? [
      tr('premiere.jaarKaartjes', { count: overzicht.aantal }),
      overzicht.hoogste ? tr('premiere.jaarHoogste', { name: overzicht.hoogste.name }) : null,
      overzicht.vaakstMet ? tr('premiere.jaarMet', { naam: overzicht.vaakstMet.naam }) : null,
    ].filter(Boolean)
    : [];

  // Beelden uit je eigen kaartjes, anders uit je watchlist; het hoofdbeeld
  // is je hoogst gewaardeerde kaartje van dit jaar
  const beelden = [...new Set([
    ...doos.map((k) => meta[k.key]?.backdrop),
    ...watchlist.map((f) => meta[f.key]?.backdrop),
  ].filter(Boolean))];
  const hoofd = (overzicht?.hoogste && meta[overzicht.hoogste.key]?.backdrop) || beelden[0] || null;
  const shots = beelden.filter((b) => b !== hoofd).slice(0, 2);

  const cijfers = [
    doos.length ? { waarde: doos.length, decimalen: 0, label: tr('premiere.cijferDoos'), groot: true } : null,
    { waarde: watchlist.length, decimalen: 0, label: tr('premiere.cijferLijst'), groot: !doos.length },
    opDiensten ? { waarde: opDiensten, decimalen: 0, label: tr(mijn.size ? 'premiere.cijferDiensten' : 'premiere.cijferStreaming') } : null,
  ].filter(Boolean);

  return {
    slogan,
    titelSlogan: tr('premiere.titelSlogan'),
    vanKop: tr('premiere.hoofdrolKop'),
    van: tr('premiere.hoofdrol', { count: watchlist.length }),
    metKop: tr('premiere.jaarKop', { jaar }),
    met,
    paneelVan: tr('premiere.van'),
    paneelMeta: [String(jaar), tr('premiere.versie', { v: PREMIERE_VERSIE }), tr('premiere.uitDeBeta')],
    paneelMet: tr('premiere.aftiteling'),
    verhaal: tr('premiere.nieuw'),
    geenVerhaal: '',
    cijfers,
    waar: null,
    beeld: hoofd ? IMG(hoofd, 'w1280') : null,
    gloed: hoofd ? IMG(hoofd, 'w300') : null,
    shots: shots.map((b) => IMG(b, 'w780')),
    poster: null,
    kleur: PREMIERE_KLEUR,
    // Voor het kaartje bij de deur
    inDeDoos: doos.length,
    opLijst: watchlist.length,
  };
}
