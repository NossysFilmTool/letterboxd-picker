import { useEffect, useRef, useState } from 'react';
import { useLS } from '../lib/storage.js';
import { premiereAutomatisch, PREMIERE_VERSIE } from '../lib/premiere.js';
import { uitlegAutomatisch, metGezien, metBezig, vindHoofdstuk } from '../lib/rondleiding.js';
import { meld } from '../lib/melding.js';
import { NAAM, naamMoment } from '../lib/merk.js';

const versie = () => (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : null);
// Een vlag uit de adresbalk halen (?premiere, ?uitleg): geeft terug of hij er was
const neemVlag = (naam) => {
  const p = new URLSearchParams(location.search);
  if (!p.has(naam)) return false;
  p.delete(naam);
  window.history.replaceState(window.history.state, '', `${location.pathname}${p.toString() ? `?${p}` : ''}${location.hash}`);
  return true;
};

// De première (lib/premiere.js): één keer, voor wie de tool al gebruikte.
// Een apparaat dat leeg begint, begint gewoon op de nieuwe versie (dat
// blijft op dit apparaat, het reist niet mee). ?premiere in de adresbalk
// laat hem altijd zien, ook in een beta.
export function usePremiere({ settings, setSettings, bieb, naarVanavond }) {
  const { watchlist, demoMode, metaReady } = bieb;
  const [premiereOpen, setPremiereOpen] = useState(false);
  const [nieuwHier, setNieuwHier] = useLS('nieuwOp5', false);
  useEffect(() => {
    if (!watchlist.length && !nieuwHier) setNieuwHier(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const premiereKomt = () => premiereAutomatisch({ versie: versie(), gezien: settings.premiere, nieuwHier, watchlist: watchlist.length, demoMode });
  const gekeken = useRef(false);
  useEffect(() => {
    if (!metaReady || gekeken.current) return;
    gekeken.current = true;
    if (neemVlag('premiere')) {
      if (watchlist.length) setPremiereOpen(true);
      return;
    }
    if (premiereKomt()) setPremiereOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaReady]);
  const sluitPremiere = () => {
    setPremiereOpen(false);
    setSettings((s) => ({ ...s, premiere: PREMIERE_VERSIE }));
    naarVanavond();
  };
  return { premiereOpen, openPremiere: () => setPremiereOpen(true), sluitPremiere, premiereKomt };
}

// De rondleiding (lib/rondleiding.js): de stand (welk hoofdstuk, welke
// stap), het programma, en het welkom op een leeg apparaat. De voortgang
// staat in de instellingen en reist mee met sync.
// stand: { h, s, deel?, rondgang? }: deel is een opgezocht onderwerp (alle
// stappen daarvan), rondgang de korte rondleiding van het welkom
export function useUitleg({ settings, setSettings, bieb, premiereKomt, tr }) {
  const { watchlist, demoMode, metaReady } = bieb;
  const [stand, setStand] = useState(null);
  const [programmaOpen, setProgrammaOpen] = useState(false);
  const [welkomOpen, setWelkomOpen] = useState(false);
  const zetUitleg = (fn) => setSettings((s) => ({ ...s, uitleg: fn(s.uitleg || {}) }));
  const start = (h, stap = 0, { deel = null, rondgang = false } = {}) => {
    setProgrammaOpen(false);
    setWelkomOpen(false);
    setStand({ h, s: stap, ...(deel ? { deel } : {}), ...(rondgang ? { rondgang: true } : {}) });
    zetUitleg((u) => metBezig(u, h, stap, deel));
  };
  // open(): het programma; open('vanavond'): dat hoofdstuk;
  // open('setup', 'sync'): meteen bij die stap, met alles van zijn deel
  // ("Hoe werkt dit?")
  const open = (h, stap) => {
    if (!h) { setProgrammaOpen(true); return; }
    const hs = vindHoofdstuk(h);
    const i = stap ? (hs?.stappen.findIndex((x) => x.id === stap) ?? -1) : -1;
    if (i < 0) { start(h, 0); return; }
    start(h, i, { deel: hs.stappen[i].deel });
  };
  const gekeken = useRef(false);
  useEffect(() => {
    if (!metaReady || gekeken.current) return;
    gekeken.current = true;
    if (neemVlag('uitleg')) {
      if (watchlist.length) setProgrammaOpen(true); else setWelkomOpen(true);
      return;
    }
    const wat = uitlegAutomatisch({ versie: versie(), uitleg: settings.uitleg, watchlist: watchlist.length, demoMode });
    if (wat === 'welkom') setWelkomOpen(true);
    // Een nieuwe naam gaat voor (de melding over Uitleg komt dan de keer
    // daarna), en de première noemt hem zelf al
    const naam = naamMoment({ versie: versie(), gezien: settings.naam, watchlist: watchlist.length, demoMode });
    if (naam === 'stil' || (naam === 'melding' && !premiereKomt())) {
      setSettings((s) => ({ ...s, naam: NAAM }));
      if (naam === 'melding') { meld(tr('app.nieuweNaam')); return; }
    }
    // Wie de tool al gebruikte: één keer een melding, niet tijdens de première
    if (wat === 'melding' && !premiereKomt()) {
      zetUitleg((u) => ({ ...u, welkom: 'melding' }));
      meld(tr('uitleg.nieuw'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaReady]);

  return {
    stand, programmaOpen, welkomOpen,
    open, start,
    openProgramma: () => setProgrammaOpen(true),
    sluitProgramma: () => setProgrammaOpen(false),
    stop: () => setStand(null),
    welkomRondleiding: () => { zetUitleg((u) => ({ ...u, welkom: 'rondleiding' })); start('welkom', 0, { rondgang: true }); },
    welkomZelf: () => { setWelkomOpen(false); zetUitleg((u) => ({ ...u, welkom: 'zelf' })); },
    welkomGast: () => { setWelkomOpen(false); zetUitleg((u) => ({ ...u, welkom: 'gast' })); },
    // Binnen een hoofdstuk blijven het deel en de rondgang staan
    naarStap: (h, stap) => {
      const zelfde = stand?.h === h;
      setStand(zelfde ? { ...stand, s: stap } : { h, s: stap });
      zetUitleg((u) => metBezig(u, h, stap, zelfde ? stand.deel : null));
    },
    gezien: (h) => zetUitleg((u) => metGezien(u, h)),
    klaar: (h, { volgende, programma, rondgang = false, gezien = true } = {}) => {
      zetUitleg((u) => (gezien ? metGezien(u, h) : { ...u, bezig: null }));
      setStand(null);
      if (volgende) start(volgende, 0, { rondgang });
      else if (programma) setProgrammaOpen(true);
    },
  };
}
