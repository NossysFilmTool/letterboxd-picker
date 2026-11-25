import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../lib/i18n.js';
import { vindHoofdstuk, sleutel, telt, volgendHoofdstuk, WACHT } from '../lib/rondleiding.js';
import { zaalBeschikbaar } from '../lib/zaalstemming.js';
import { ZaalCodeInvoer } from './ZaalDelen.jsx';
import StemOefening from './StemOefening.jsx';

// De rondleiding (DESIGN.md, "De rondleiding"): de ouvreuse met de zaklamp.
// Het scherm dimt, een zachte bundel valt op het echte onderdeel, en de
// uitleg staat op een tussentitel. De hoofdstukken staan in
// lib/rondleiding.js. Tijdens een moment (het aftellen, een trailer, de
// première, een kaartje dat afscheurt) wacht hij onzichtbaar.
//
// Beweging, allemaal uit de bioscoop en allemaal uit met "beperk beweging":
// de bundel zwaait van onderdeel naar onderdeel, een hoofdstuk opent en
// sluit met een iris, een nieuwe tussentitel flikkert even aan als een
// projector, bij een doestap klopt een ring om het onderdeel, lukt het dan
// klapt de klapper, en de voortgang is een filmstrook.

// Zonder matchMedia (jsdom, heel oude browsers) geen beweging
const stilGewenst = () => typeof window === 'undefined' || !window.matchMedia || !!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const RAND = 8; // ruimte rond het onderdeel in de bundel
const TELEFOON = 720;
const NAVIGATIE = 78; // de balk onderin op een telefoon (styles.css, .uitleg-titel.dock-onder)
const PANEEL = 300; // ongeveer de hoogte van een tussentitel op een telefoon
const ZWAAI = 420; // ms: de bundel van het ene onderdeel naar het volgende
const VASTHOUDEN = 700; // ms: zo lang blijft de bundel staan terwijl hij het volgende zoekt
const IRIS = { open: 620, dicht: 520, rust: 140 };
const stopBeeld = (id) => { if (id && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id); };

// Een anker zoeken. Staat hetzelfde anker er twee keer (de navigatie in de
// kop en onderin), dan het zichtbare.
export function vindAnker(naam) {
  if (!naam || typeof document === 'undefined') return null;
  const lijst = [...document.querySelectorAll(`[data-uitleg="${naam}"]`)];
  if (!lijst.length) return null;
  return lijst.find((e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  }) || lijst[0];
}
const eenMoment = () => typeof document !== 'undefined' && !!document.querySelector('[data-uitleg-moment]');
const eenVraag = () => typeof document !== 'undefined' && !!document.querySelector('.zaal-venster-achter');
// Een onderdeel met eigen toetsen (de la, Snel beoordelen met zijn pijltjes,
// Meer zoals deze): dan blijft de rondleiding van het toetsenbord af
const eigenToetsen = () => typeof document !== 'undefined' && !!document.querySelector('[data-uitleg-toetsen]');

// Een tussentitel: de kaart met de uitleg
function Tussentitel({ boven, kop, kopRef, kopId, children, knoppen, stijl, onStop, stopTekst, rol = 'dialog', klasse = '' }) {
  const tekstId = `${kopId}-t`;
  return (
    <section className={`uitleg-titel ${klasse}`} style={stijl} role={rol} aria-modal="false" aria-labelledby={kopId} aria-describedby={tekstId}>
      <div className="uitleg-boven">
        <span className="label-breed">{boven}</span>
        {onStop && <button type="button" className="linkbtn uitleg-stop" onClick={onStop}>{stopTekst}</button>}
      </div>
      <h2 id={kopId} ref={kopRef} tabIndex={-1} className="uitleg-kop">{kop}</h2>
      <div id={tekstId} className="uitleg-lijf" aria-live="polite">{children}</div>
      {knoppen && <div className="uitleg-knoppen">{knoppen}</div>}
    </section>
  );
}

// Waar de tussentitel staat: op een telefoon onderin (of bovenin als het
// onderdeel onderin staat), op een breed scherm naast het onderdeel
function plaats(rect, paneel = PANEEL) {
  if (typeof window === 'undefined') return {};
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!rect) return { midden: true };
  // Op een telefoon onderin (boven de navigatie), tenzij het daar het
  // onderdeel bedekt en er bovenin wel plek is. Past het nergens (de la is
  // bijna schermhoog), dan onderin: de kop van het onderdeel blijft te zien.
  if (vw <= TELEFOON) {
    const erboven = rect.top;
    const eronder = vh - NAVIGATIE - (rect.top + rect.height);
    return eronder >= paneel || erboven < paneel ? { onder: true } : { boven: true };
  }
  const breedte = 380;
  const left = Math.round(Math.min(Math.max(16, rect.left), vw - breedte - 16));
  if (rect.top + rect.height + 16 < vh * 0.6) return { stijl: { left, top: Math.round(rect.top + rect.height + 14) } };
  if (rect.top > vh * 0.4) return { stijl: { left, bottom: Math.round(vh - rect.top + 14) } };
  return { stijl: { right: 24, bottom: 24 } };
}

// De bundel: alles dimt, behalve een zacht gat rond het onderdeel. Een
// SVG-masker met een vage rand (geen schaduwen of matglas, DESIGN.md).
function Bundel({ gat }) {
  return (
    <svg className="uitleg-donker" aria-hidden="true" width="100%" height="100%">
      <defs>
        <filter id="uitleg-zacht" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9" /></filter>
        <mask id="uitleg-gat">
          <rect x="0" y="0" width="100%" height="100%" fill="white" />
          {gat && <rect x={gat.x} y={gat.y} width={gat.w} height={gat.h} rx="12" fill="black" filter="url(#uitleg-zacht)" />}
        </mask>
      </defs>
      <rect x="0" y="0" width="100%" height="100%" className="uitleg-donker-vlak" mask="url(#uitleg-gat)" />
    </svg>
  );
}

// Doorzichtige vlakken die tikken opvangen: overal, of rond het gat (bij
// een doestap mag je het onderdeel zelf aantikken)
function Vangers({ gat }) {
  if (!gat) return <div className="uitleg-vang" style={{ inset: 0 }} aria-hidden="true" />;
  const { x, y, w, h } = gat;
  return (
    <>
      <div className="uitleg-vang" aria-hidden="true" style={{ left: 0, right: 0, top: 0, height: Math.max(0, y) }} />
      <div className="uitleg-vang" aria-hidden="true" style={{ left: 0, right: 0, top: y + h, bottom: 0 }} />
      <div className="uitleg-vang" aria-hidden="true" style={{ left: 0, width: Math.max(0, x), top: y, height: h }} />
      <div className="uitleg-vang" aria-hidden="true" style={{ left: x + w, right: 0, top: y, height: h }} />
    </>
  );
}

// De zaklamp zwaait: bij een nieuwe stap glijdt de bundel van het vorige
// onderdeel naar het nieuwe, in plaats van te springen. Tijdens het zoeken
// blijft hij even staan waar hij was. Scrollen en meten volgen hij meteen.
function useZwaai(doel, stapSleutel, zoekt) {
  const [toon, setToon] = useState(doel);
  const r = useRef({ gat: null, doel: null, sleutel: null, raf: 0 });
  const vast = !doel && zoekt && !stilGewenst();
  useLayoutEffect(() => {
    const v = r.current;
    if (!doel) {
      if (!vast) { stopBeeld(v.raf); v.raf = 0; v.gat = null; setToon(null); }
      return;
    }
    v.doel = doel;
    const nieuw = v.sleutel !== stapSleutel;
    v.sleutel = stapSleutel;
    if (v.raf) return; // de zwaai loopt al en gaat naar het nieuwste doel
    if (!nieuw || !v.gat || stilGewenst() || typeof requestAnimationFrame !== 'function') { v.gat = doel; setToon(doel); return; }
    const van = v.gat;
    const begin = performance.now();
    const stap = (t) => {
      const p = Math.min(1, (t - begin) / ZWAAI);
      const e = p < 0.5 ? 4 * p * p * p : 1 - ((-2 * p + 2) ** 3) / 2;
      const d = v.doel;
      const g = { x: van.x + (d.x - van.x) * e, y: van.y + (d.y - van.y) * e, w: van.w + (d.w - van.w) * e, h: van.h + (d.h - van.h) * e };
      v.gat = g;
      setToon(g);
      v.raf = p < 1 ? requestAnimationFrame(stap) : 0;
    };
    v.raf = requestAnimationFrame(stap);
  }, [doel?.x, doel?.y, doel?.w, doel?.h, stapSleutel, vast]); // eslint-disable-line react-hooks/exhaustive-deps
  // Niet eindeloos vasthouden: vindt hij niets, dan gaat het licht uit
  useEffect(() => {
    if (!vast) return undefined;
    const t = setTimeout(() => { const v = r.current; if (!v.raf) { v.gat = null; setToon(null); } }, VASTHOUDEN);
    return () => clearTimeout(t);
  }, [vast]);
  useEffect(() => () => stopBeeld(r.current.raf), []);
  return toon;
}

// De iris: een hoofdstuk opent als een cirkel die groter wordt, en sluit als
// een cirkel die tot een stip krimpt. Daarna roept hij onKlaar (ook zonder
// animatieframes, op tijd).
function Iris({ richting, midden, onKlaar }) {
  const cirkel = useRef(null);
  const klaarRef = useRef(onKlaar); klaarRef.current = onKlaar;
  useLayoutEffect(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cx = midden?.x ?? vw / 2;
    const cy = midden?.y ?? vh / 2;
    const groot = Math.hypot(Math.max(cx, vw - cx), Math.max(cy, vh - cy)) + 4;
    const duur = IRIS[richting];
    const zet = (straal) => {
      const c = cirkel.current;
      if (!c) return;
      c.setAttribute('cx', String(cx));
      c.setAttribute('cy', String(cy));
      c.setAttribute('r', String(Math.max(0, straal)));
    };
    const open = richting === 'open';
    zet(open ? 0 : groot);
    const begin = performance.now();
    let raf = 0;
    const stap = (t) => {
      const p = Math.min(1, (t - begin) / duur);
      const e = open ? 1 - (1 - p) ** 3 : p * p * (3 - 2 * p);
      // Dicht: tot een stip, die nog even blijft staan
      zet(open ? groot * e : Math.max(open ? 0 : 3, groot * (1 - e)));
      if (p < 1) raf = requestAnimationFrame(stap);
    };
    if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(stap);
    const t = setTimeout(() => klaarRef.current?.(), duur + (open ? 0 : IRIS.rust));
    return () => { stopBeeld(raf); clearTimeout(t); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <svg className="uitleg-iris" aria-hidden="true" width="100%" height="100%">
      <defs>
        <mask id="uitleg-iris-gat">
          <rect x="0" y="0" width="100%" height="100%" fill="white" />
          <circle ref={cirkel} r="0" fill="black" />
        </mask>
      </defs>
      <rect x="0" y="0" width="100%" height="100%" className="uitleg-iris-vlak" mask="url(#uitleg-iris-gat)" />
    </svg>
  );
}

// De klapper: lukt een doestap, dan klapt de lat dicht
function Klapper() {
  return (
    <svg className="uitleg-klapper" aria-hidden="true" width="20" height="17" viewBox="0 0 20 17">
      <rect x="1" y="7" width="18" height="9" rx="1" className="uitleg-klapper-vlak" />
      <g className="uitleg-klapper-lat">
        <rect x="1" y="2.2" width="18" height="3.6" rx="0.6" className="uitleg-klapper-vlak" />
        <path d="M4.2 2.2h2.4l-2.1 3.6H2.1zM9.2 2.2h2.4l-2.1 3.6H7.1zM14.2 2.2h2.4l-2.1 3.6h-2.4z" className="uitleg-klapper-streep" />
      </g>
    </svg>
  );
}

// De voortgang als filmstrook: een raampje per stap, de stappen die je zag
// belicht, de stap van nu het helderst. Een schermlezer hoort "stap 2 van 5".
function Filmstrook({ n, nr, tekst }) {
  return (
    <>
      <span className="uitleg-strook" aria-hidden="true">
        {Array.from({ length: n }, (_, i) => (
          <span key={i} className={`uitleg-raam${i < nr - 1 ? ' af' : ''}${i === nr - 1 ? ' nu' : ''}`} />
        ))}
      </span>
      <span className="uitleg-teller sr-only">{tekst}</span>
    </>
  );
}

export default function Rondleiding({ app, tab, setTab, stand, onStand, onStop, onKlaar, onGezien, gezien = [] }) {
  const { t: tr } = useT();
  const kopId = useId();
  const meerId = `${kopId}-meer`;
  const h = vindHoofdstuk(stand.h);
  const stap = h?.stappen[stand.s] || null;
  // Een deel (via de zoekregel of Hoe werkt dit?): alle stappen van dat
  // deel, met de langere tekst al open. Anders alleen de kern.
  const gekozen = stand.deel || null;
  const nodigFilms = () => (h?.nodigLijst && !app.watchlistAll.length ? 'lijst' : 'stap');
  // lijst: eerst films nodig; laden: de demo komt binnen; stap; sluit: de
  // iris gaat dicht; eind
  const [fase, setFase] = useState(nodigFilms);
  const [zoek, setZoek] = useState({ status: 'zoekt', el: null });
  const [herzoek, setHerzoek] = useState(0);
  const [rect, setRect] = useState(null);
  const [gedaan, setGedaan] = useState(false);
  const [pauze, setPauze] = useState(false);
  const [toonZoeken, setToonZoeken] = useState(false);
  const [meerOpen, setMeerOpen] = useState(!!gekozen);
  // De iris bij het begin van een rondgang, en of het einde uit het donker komt
  const [iris, setIris] = useState(() => (stilGewenst() ? null : 'open'));
  const [naIris, setNaIris] = useState(false);
  // Een ander hoofdstuk of deel: opnieuw kijken of er films zijn, en de iris
  // weer open. Meteen bij het tekenen, zodat het einde van het vorige
  // hoofdstuk niet nog even in beeld staat.
  const rondgang = `${stand.h}|${gekozen || ''}`;
  const [vorigeRondgang, setVorigeRondgang] = useState(rondgang);
  if (vorigeRondgang !== rondgang) {
    setVorigeRondgang(rondgang);
    setFase(nodigFilms());
    setIris(stilGewenst() ? null : 'open');
    setNaIris(false);
  }
  // Een andere stap: de zoektocht en het vinkje van de vorige horen daar niet
  // bij. Meteen bij het tekenen terugzetten, anders staat er heel even een
  // tussentitel met de knoppen van de vorige stap.
  const huidig = `${stand.h}.${stand.s}.${fase}`;
  const [vorigeStap, setVorigeStap] = useState(huidig);
  if (vorigeStap !== huidig) {
    setVorigeStap(huidig);
    setZoek({ status: 'zoekt', el: null });
    setGedaan(false);
    setToonZoeken(false);
    setRect(null);
    setMeerOpen(!!gekozen);
  }
  const kopRef = useRef(null);
  const laatsteGat = useRef(null);

  // Alles wat de timers nodig hebben, vers
  const appRef = useRef(app); appRef.current = app;
  const tabRef = useRef(tab); tabRef.current = tab;
  const setTabRef = useRef(setTab); setTabRef.current = setTab;
  const standRef = useRef(stand); standRef.current = stand;
  const onStandRef = useRef(onStand); onStandRef.current = onStand;
  const richtingRef = useRef(1);
  const gedaanRef = useRef(false); gedaanRef.current = gedaan;
  const onGezienRef = useRef(onGezien); onGezienRef.current = onGezien;
  // Welke stappen je in dit hoofdstuk zag of oversloeg, zodat de teller
  // niet terugloopt als er onderweg stappen wegvallen (je lijst is geladen)
  const geweest = useRef({ h: null, ids: new Map() });
  if (geweest.current.h !== rondgang) geweest.current = { h: rondgang, ids: new Map() };
  const ctx = (el = zoek.el) => ({ app: appRef.current, tab: tabRef.current, el, vind: vindAnker });
  // Een doestap die nu niet kan (er is niets om uit te kiezen) wordt een kijkstap
  const doeVan = (st, el) => (st?.doe && (!st.doe.kan || st.doe.kan(ctx(el))) ? st.doe : null);

  // Het einde: eerst de iris dicht, dan de eindkaart
  const naarEind = () => {
    if (stilGewenst()) { setFase('eind'); return; }
    setNaIris(true);
    setFase('sluit');
  };
  // Een stap verder of terug; een stap die niet bij deze rondgang hoort,
  // slaan we meteen over, een stap die nu niet past via de stap zelf
  const ga = (d) => {
    const { h: hid, s, deel } = standRef.current;
    const hs = vindHoofdstuk(hid);
    const past = (i) => telt(hs.stappen[i], deel);
    richtingRef.current = d;
    let n = s + d;
    while (n >= 0 && n < hs.stappen.length && !past(n)) n += d;
    // Terug vanaf een stap die wegviel, en er is niets ervoor: dan vooruit
    if (n < 0) {
      richtingRef.current = 1;
      n = s + 1;
      while (n < hs.stappen.length && !past(n)) n += 1;
    }
    if (n >= hs.stappen.length) { naarEind(); return; }
    onStandRef.current(hid, n);
  };
  const gaRef = useRef(ga); gaRef.current = ga;

  // De demo laden en wachten tot de filmdata er is
  const [geladenOp, setGeladenOp] = useState(0);
  useEffect(() => {
    if (fase !== 'laden') return undefined;
    const t = setInterval(() => {
      const a = appRef.current;
      if (a.watchlistAll.length && !a.enrich.running && Date.now() - geladenOp > 900) setFase('stap');
    }, 200);
    return () => clearInterval(t);
  }, [fase, geladenOp]);

  // Een moment gaat voor: dan wacht de rondleiding onzichtbaar
  useEffect(() => {
    const t = setInterval(() => setPauze(eenMoment()), 300);
    setPauze(eenMoment());
    return () => clearInterval(t);
  }, []);

  // Een ander scherm: opnieuw tellen zodra het er staat. De teller kijkt
  // welke onderdelen er zijn, en tijdens het wisselen staat het oude
  // scherm nog in beeld.
  const [, setGeteld] = useState(0);
  useEffect(() => { setGeteld((n) => n + 1); }, [tab]);

  // De stap: het juiste scherm, eerst iets aantikken (een tabblad, de la),
  // en dan het onderdeel zoeken. Verschijnt het niet, dan de lege tekst of
  // de volgende stap.
  useEffect(() => {
    if (fase !== 'stap' || !stap) return undefined;
    let weg = false;
    let timer = null;
    // Opnieuw zoeken (het onderdeel verdween): de tussentitel blijft staan
    setZoek({ status: 'zoekt', el: null });
    const c = ctx(null);
    if (!telt(stap, gekozen) || (stap.alleenAls && !stap.alleenAls(c))) {
      geweest.current.ids.set(stap.id, false);
      timer = setTimeout(() => { if (!weg) gaRef.current(richtingRef.current); }, 0);
      return () => { weg = true; clearTimeout(timer); };
    }
    geweest.current.ids.set(stap.id, true);
    const gewenst = typeof stap.tab === 'function' ? stap.tab(c) : stap.tab;
    if (gewenst && gewenst !== tabRef.current) setTabRef.current(gewenst);
    if (!stap.doel) { setZoek({ status: 'midden', el: null }); return undefined; }
    const wacht = stap.wacht === 'lang' ? WACHT.lang : (stap.wacht ?? WACHT.ms);
    // De wachttijd telt vanaf het eerste kijken (na de wissel van scherm)
    let begin = null;
    // Sluiten tot alles dicht is (een filmkaart, en daaronder Alles bekijken);
    // sluit mag één anker zijn of een lijst
    const sluiters = [].concat(stap.voor?.sluit || []);
    let sluitNog = sluiters.length ? 4 : 0;
    let geklikt = !stap.voor?.klik;
    // Tijdens het zoeken de tussentitel al tonen, behalve bij een stap die
    // kort zoekt en anders wegvalt: die zou even staan en dan doorspringen
    const toon = stap.leeg || wacht > 1500 ? setTimeout(() => { if (!weg) setToonZoeken(true); }, 500) : null;
    const kijk = () => {
      if (weg) return;
      // Een moment of een vraag in beeld: die tijd telt niet mee
      if (begin === null) begin = Date.now();
      if (eenMoment() || eenVraag()) { begin = Date.now(); timer = setTimeout(kijk, 250); return; }
      if (sluitNog > 0) {
        const s = sluiters.map(vindAnker).find(Boolean);
        if (s) { s.click(); sluitNog -= 1; begin = Date.now(); timer = setTimeout(kijk, 120); return; }
        sluitNog = 0;
      }
      if (!geklikt) {
        const k = vindAnker(stap.voor.klik);
        // Een tabblad dat al aan staat niet nog eens aantikken (dat zet de
        // sortering terug)
        if (k) {
          if (k.getAttribute('aria-pressed') !== 'true') k.click();
          geklikt = true; begin = Date.now();
        }
      }
      if (geklikt) {
        const el = vindAnker(stap.doel);
        if (el) {
          // Op een telefoon bovenin, want de tussentitel staat onderin
          const telefoon = window.innerWidth <= TELEFOON;
          el.scrollIntoView?.({ block: telefoon ? 'start' : 'center', inline: 'nearest', behavior: stilGewenst() ? 'auto' : 'smooth' });
          setZoek({ status: 'gevonden', el });
          return;
        }
      }
      if (Date.now() - begin > wacht) {
        if (stap.leeg) setZoek({ status: 'leeg', el: null });
        else {
          // Niet op het scherm: overslaan, en niet meetellen
          geweest.current.ids.set(stap.id, false);
          gaRef.current(richtingRef.current);
        }
        return;
      }
      timer = setTimeout(kijk, 120);
    };
    timer = setTimeout(kijk, gewenst && gewenst !== tabRef.current ? 80 : 0);
    return () => { weg = true; clearTimeout(timer); clearTimeout(toon); };
  }, [stand.h, stand.s, fase, herzoek]); // eslint-disable-line react-hooks/exhaustive-deps

  // Het onderdeel volgen als je scrolt of het scherm verandert
  useEffect(() => {
    if (zoek.status !== 'gevonden') { setRect(null); return undefined; }
    const el = zoek.el;
    let vorige = '';
    const meet = () => {
      if (!el.isConnected) {
        // Weg omdat je de doestap net deed (de lijst is geladen): dat ziet de
        // doestap zelf; anders opnieuw zoeken
        const d = doeVan(stap);
        if (!gedaanRef.current && !(d && d.klaar(ctx()))) setHerzoek((n) => n + 1);
        return;
      }
      const r = el.getBoundingClientRect();
      const k = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`;
      if (k !== vorige) {
        vorige = k;
        setRect(r.width || r.height ? { left: r.left, top: r.top, width: r.width, height: r.height } : null);
      }
    };
    meet();
    window.addEventListener('scroll', meet, true);
    window.addEventListener('resize', meet);
    const t = setInterval(meet, 300);
    return () => { window.removeEventListener('scroll', meet, true); window.removeEventListener('resize', meet); clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- opnieuw meten alleen voor een ander anker
  }, [zoek]);

  // Een doestap: wachten tot je het doet, dan vanzelf verder. Was het al
  // gedaan (je ging terug), dan gewoon Volgende.
  useEffect(() => {
    const d = doeVan(stap, zoek.el);
    if (!d || (zoek.status !== 'gevonden' && zoek.status !== 'leeg')) return undefined;
    if (d.klaar(ctx())) { setGedaan(true); return undefined; }
    const mijn = `${stand.h}|${stand.s}`;
    let verder = null;
    const t = setInterval(() => {
      if (!d.klaar(ctx())) return;
      clearInterval(t);
      setGedaan(true);
      verder = setTimeout(() => {
        const nu = standRef.current;
        if (`${nu.h}|${nu.s}` === mijn) gaRef.current(1);
      }, 800);
    }, 200);
    return () => { clearInterval(t); clearTimeout(verder); };
  }, [zoek, stand.h, stand.s]); // eslint-disable-line react-hooks/exhaustive-deps

  // De focus: op de kop (een schermlezer leest de stap voor), bij een
  // doestap op het onderdeel zelf
  useEffect(() => {
    if (zoek.status === 'zoekt') return;
    if (doeVan(stap, zoek.el) && zoek.el && !gedaan && typeof zoek.el.focus === 'function' && zoek.el.matches?.('button, select, input, a, [tabindex]')) {
      zoek.el.focus({ preventScroll: true });
    } else kopRef.current?.focus({ preventScroll: true });
  }, [zoek, fase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Toetsen: Escape stopt (de plek blijft bewaard), pijltjes bladeren
  useEffect(() => {
    const toets = (e) => {
      // Een vraag, een moment (de trailer) of de la heeft zijn eigen toetsen
      if (eenVraag() || eenMoment() || eigenToetsen()) return;
      if (e.key === 'Escape') { onStop(); return; }
      const actief = document.activeElement;
      if (actief && /^(INPUT|SELECT|TEXTAREA)$/.test(actief.tagName)) return;
      if (fase !== 'stap') return;
      if (e.key === 'ArrowRight' && (!doeVan(stap) || gedaanRef.current)) gaRef.current(1);
      if (e.key === 'ArrowLeft' && standRef.current.s > 0) gaRef.current(-1);
    };
    window.addEventListener('keydown', toets);
    return () => window.removeEventListener('keydown', toets);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- doeVan hangt alleen van de stap af
  }, [fase, stap, onStop]);

  useLayoutEffect(() => { if (fase === 'eind' || fase === 'lijst') kopRef.current?.focus({ preventScroll: true }); }, [fase]);
  // Het einde gehaald: dan is het hoofdstuk gezien, ook als je daarna
  // wegklikt. Een opgezocht deel telt niet als het hele hoofdstuk.
  useEffect(() => { if (fase === 'eind' && !standRef.current.deel) onGezienRef.current?.(stand.h); }, [fase]); // eslint-disable-line react-hooks/exhaustive-deps

  const status = zoek.status;
  const gat = fase === 'stap' && status === 'gevonden' && rect ? {
    x: Math.round(rect.left - RAND), y: Math.round(rect.top - RAND),
    w: Math.round(rect.width + RAND * 2), h: Math.round(rect.height + RAND * 2),
  } : null;
  // Gevonden maar nog niet gemeten telt ook als zoeken: anders gaat het
  // licht één beeld uit en springt de bundel in plaats van te zwaaien
  const toonGat = useZwaai(gat, `${stand.h}.${stand.s}`, fase === 'stap' && (status === 'zoekt' || (status === 'gevonden' && !rect)));
  if (toonGat) laatsteGat.current = toonGat;

  if (!h || pauze) return null;
  const titel = tr(`uitleg.h.${h.id}.titel`);
  const stopTekst = tr('uitleg.stop');
  const stil = stilGewenst();
  const klasse0 = `uitleg${stil ? ' stil' : ''}`;
  const irisOpen = iris === 'open' && <Iris richting="open" onKlaar={() => setIris(null)} />;

  // Eerst films: de demo als oefenlijst, of eerst je eigen lijst
  if (fase === 'lijst' || fase === 'laden') {
    const e = app.enrich;
    return createPortal(
      <div className={klasse0}>
        <Bundel gat={null} />
        <Vangers gat={null} />
        <Tussentitel boven={titel} kop={tr('uitleg.lijstKop')} kopRef={kopRef} kopId={kopId} onStop={onStop} stopTekst={stopTekst} stijl={{}} klasse="midden"
          knoppen={fase === 'lijst' ? (
            <>
              <button type="button" className="btn primary" onClick={() => { app.laadDemo(); setGeladenOp(Date.now()); setFase('laden'); }}>{tr('uitleg.lijstDemo')}</button>
              <button type="button" className="btn ghost" onClick={() => onStand('welkom', 0)}>{tr('uitleg.lijstEigen')}</button>
            </>
          ) : null}>
          <p className="uitleg-tekst">{tr('uitleg.lijstTekst')}</p>
          {fase === 'laden' && (
            <p className="uitleg-vb">{e.running && e.total ? tr('uitleg.lijstLaden', { klaar: e.done, totaal: e.total }) : tr('uitleg.lijstBijna')}</p>
          )}
        </Tussentitel>
        {irisOpen}
      </div>,
      document.body,
    );
  }

  // De iris gaat dicht, op het laatste onderdeel in het licht
  if (fase === 'sluit') {
    const g = laatsteGat.current;
    return createPortal(
      <div className={klasse0}>
        <Bundel gat={null} />
        <Vangers gat={null} />
        <Iris richting="dicht" midden={g ? { x: g.x + g.w / 2, y: g.y + g.h / 2 } : null} onKlaar={() => setFase('eind')} />
      </div>,
      document.body,
    );
  }

  // Het hoofdstuk is uit. Rustig: Klaar voor nu gaat voor, het volgende
  // hoofdstuk mag. De rondgang van het welkom loopt van Welkom naar
  // Vanavond en houdt dan op; een opgezocht deel stopt na dat deel.
  if (fase === 'eind') {
    const rond = !!stand.rondgang && !gekozen;
    let volgende = null;
    if (rond) volgende = h.id === 'welkom' ? vindHoofdstuk('vanavond') : null;
    else if (!gekozen) volgende = volgendHoofdstuk(h.id, [...gezien, h.id], ctx());
    const volgendeTitel = volgende ? tr(`uitleg.h.${volgende.id}.titel`) : '';
    let tekst = tr('uitleg.eindAlles');
    if (gekozen) tekst = tr('uitleg.eindNaslag');
    else if (rond && !volgende) tekst = tr('uitleg.eindRondgang');
    else if (volgende) tekst = tr('uitleg.eindTekst', { titel: volgendeTitel });
    const klaar = (extra = {}) => onKlaar(h.id, { gezien: !gekozen, ...extra });
    return createPortal(
      <div className={klasse0}>
        <Bundel gat={null} />
        <Vangers gat={null} />
        <Tussentitel boven={titel} kop={tr('uitleg.eindKop', { titel })} kopRef={kopRef} kopId={kopId} stijl={{}} klasse="midden"
          knoppen={rond && volgende ? (
            <>
              <button type="button" className="btn primary" onClick={() => klaar({ volgende: volgende.id, rondgang: true })}>{tr('uitleg.verderMet', { titel: volgendeTitel })}</button>
              <button type="button" className="btn ghost" onClick={() => klaar()}>{tr('uitleg.klaarVoorNu')}</button>
            </>
          ) : (
            <>
              <button type="button" className="btn primary" onClick={() => klaar()}>{tr('uitleg.klaarVoorNu')}</button>
              {volgende && <button type="button" className="btn ghost" onClick={() => klaar({ volgende: volgende.id })}>{tr('uitleg.verderMet', { titel: volgendeTitel })}</button>}
              <button type="button" className="linkbtn" onClick={() => klaar({ programma: true })}>{tr('uitleg.naarProgramma')}</button>
            </>
          )}>
          <p className="uitleg-tekst">{tekst}</p>
        </Tussentitel>
        {naIris && !stil && <div className="uitleg-zwart" aria-hidden="true" />}
      </div>,
      document.body,
    );
  }

  if (!stap) return null;
  const c = ctx();
  const ids = geweest.current.ids;
  const zichtbaar = h.stappen.filter((s, i) => telt(s, gekozen) && (
    i < stand.s && ids.has(s.id) ? ids.get(s.id) : (!s.alleenAls || s.alleenAls(c))
  ));
  const nr = Math.max(1, zichtbaar.indexOf(stap) + 1);
  const doe = doeVan(stap, zoek.el);
  const vrij = doe && !gedaan && gat; // het onderdeel mag je aantikken
  // De echte hoogte van de tussentitel als die er al staat
  const p = plaats(status === 'gevonden' ? rect : null, kopRef.current?.closest('.uitleg-titel')?.offsetHeight || PANEEL);
  const klasse = `${p.midden ? 'midden' : p.boven ? 'dock-boven' : p.onder ? 'dock-onder' : ''}${stil ? '' : ' flikker'}`;
  const toonPaneel = status !== 'zoekt' || toonZoeken;
  const vb = stap.vb && status === 'gevonden' ? stap.vb(ctx(zoek.el)) : null;
  const vbTekst = vb && Object.values(vb).every((v) => v != null) ? tr(sleutel(h, stap, 'vb'), vb) : null;
  const laatst = stand.s >= h.stappen.length - 1
    || h.stappen.slice(stand.s + 1).every((s) => !telt(s, gekozen) || (s.alleenAls && !s.alleenAls(c)));

  const knoppen = (
    <>
      {nr > 1 && <button type="button" className="btn ghost" onClick={() => ga(-1)}>{tr('uitleg.vorige')}</button>}
      {doe && !gedaan ? (
        <>
          {doe.toon && status === 'gevonden' && (
            <button type="button" className="btn" onClick={() => vindAnker(doe.toon)?.click()}>
              {tr(doe.knop ? `uitleg.knopDoe.${doe.knop}` : 'uitleg.laatZien')}
            </button>
          )}
          <button type="button" className="linkbtn uitleg-overslaan" onClick={() => ga(1)}>{tr('uitleg.slaOver')}</button>
        </>
      ) : (
        <button type="button" className="btn primary" onClick={() => ga(1)}>{laatst ? tr('uitleg.klaar') : tr('uitleg.volgende')}</button>
      )}
    </>
  );

  return createPortal(
    <div className={klasse0} data-uitleg-stap={`${h.id}.${stap.id}`}>
      <Bundel gat={toonGat} />
      <Vangers gat={vrij ? gat : null} />
      {toonGat && <div className={`uitleg-rand${vrij ? ' klopt' : ''}`} aria-hidden="true" style={{ left: toonGat.x, top: toonGat.y, width: toonGat.w, height: toonGat.h }} />}
      {toonPaneel && (
        <Tussentitel key={`${stand.h}.${stand.s}`}
          boven={<>{titel}<Filmstrook n={zichtbaar.length} nr={nr} tekst={tr('uitleg.stapVan', { nr, n: zichtbaar.length })} /></>}
          kop={tr(sleutel(h, stap, 'kop'))} kopRef={kopRef} kopId={kopId} onStop={onStop} stopTekst={stopTekst}
          stijl={p.stijl || {}} klasse={klasse} knoppen={knoppen}>
          <p className="uitleg-tekst">{tr(sleutel(h, stap, status === 'leeg' ? 'leeg' : 'tekst'))}</p>
          {stap.meer && status !== 'leeg' && (
            <>
              <p id={meerId} className="uitleg-meer" hidden={!meerOpen}>{tr(sleutel(h, stap, 'meer'))}</p>
              <button type="button" className="linkbtn uitleg-meer-knop" aria-expanded={meerOpen} aria-controls={meerId} onClick={() => setMeerOpen((o) => !o)}>
                {tr(meerOpen ? 'uitleg.minder' : 'uitleg.meer')}
              </button>
            </>
          )}
          {vbTekst && <p className="uitleg-vb">{vbTekst}</p>}
          {stap.oefening && <StemOefening />}
          {doe && status !== 'leeg' && (
            <p className={`uitleg-doe${gedaan ? ' gedaan' : ''}`}>
              {gedaan && <Klapper />}
              <span>{gedaan ? tr('uitleg.gedaan') : tr(sleutel(h, stap, 'doe'))}</span>
            </p>
          )}
        </Tussentitel>
      )}
      {irisOpen}
    </div>,
    document.body,
  );
}

// Het welkom op een leeg apparaat: een tussentitel midden in de zaal. Wie
// alleen komt meestemmen, vult hier meteen de code in.
export function UitlegWelkom({ onRondleiding, onZelf, onCode }) {
  const { t: tr } = useT();
  const kopId = useId();
  const kopRef = useRef(null);
  const zelfRef = useRef(onZelf); zelfRef.current = onZelf;
  useEffect(() => {
    kopRef.current?.focus({ preventScroll: true });
    const toets = (e) => { if (e.key === 'Escape') zelfRef.current(); };
    window.addEventListener('keydown', toets);
    return () => window.removeEventListener('keydown', toets);
  }, []);
  return createPortal(
    <div className={`uitleg${stilGewenst() ? ' stil' : ''}`}>
      <Bundel gat={null} />
      <Vangers gat={null} />
      <Tussentitel boven={tr('nav.huis')} kop={tr('uitleg.welkomKop')} kopRef={kopRef} kopId={kopId} stijl={{}} klasse="midden welkom" rol="dialog"
        knoppen={(
          <>
            <button type="button" className="btn primary" onClick={onRondleiding}>{tr('uitleg.welkomJa')}</button>
            <button type="button" className="btn ghost" onClick={onZelf}>{tr('uitleg.welkomZelf')}</button>
          </>
        )}>
        <p className="uitleg-tekst">{tr('uitleg.welkomTekst')}</p>
        {zaalBeschikbaar() && onCode && (
          <div className="uitleg-welkom-code">
            <ZaalCodeInvoer onCode={onCode} kop={tr('uitleg.welkomCode')} />
          </div>
        )}
        <p className="uitleg-klein">{tr('uitleg.welkomAltijd')}</p>
      </Tussentitel>
    </div>,
    document.body,
  );
}
