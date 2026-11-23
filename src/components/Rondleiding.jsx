import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../lib/i18n.js';
import { vindHoofdstuk, sleutel, volgendHoofdstuk, WACHT } from '../lib/rondleiding.js';
import { zaalBeschikbaar } from '../lib/zaalstemming.js';
import { ZaalCodeInvoer } from './ZaalDelen.jsx';
import StemOefening from './StemOefening.jsx';

// De rondleiding (DESIGN.md, "De rondleiding"): de ouvreuse met de zaklamp.
// Het scherm dimt, een zachte bundel valt op het echte onderdeel, en de
// uitleg staat op een tussentitel. De hoofdstukken staan in
// lib/rondleiding.js. Tijdens een moment (het aftellen, een trailer, de
// première, een kaartje dat afscheurt) wacht hij onzichtbaar.

const stilGewenst = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const RAND = 8; // ruimte rond het onderdeel in de bundel
const TELEFOON = 720;
const NAVIGATIE = 78; // de balk onderin op een telefoon (styles.css, .uitleg-titel.dock-onder)
const PANEEL = 300; // ongeveer de hoogte van een tussentitel op een telefoon

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

export default function Rondleiding({ app, tab, setTab, stand, onStand, onStop, onKlaar, onGezien, gezien = [] }) {
  const { t: tr } = useT();
  const kopId = useId();
  const h = vindHoofdstuk(stand.h);
  const stap = h?.stappen[stand.s] || null;
  // lijst: eerst films nodig; laden: de demo komt binnen; stap; eind
  const [fase, setFase] = useState(() => (h?.nodigLijst && !app.watchlistAll.length ? 'lijst' : 'stap'));
  const [zoek, setZoek] = useState({ status: 'zoekt', el: null });
  const [herzoek, setHerzoek] = useState(0);
  const [rect, setRect] = useState(null);
  const [gedaan, setGedaan] = useState(false);
  const [pauze, setPauze] = useState(false);
  const [toonZoeken, setToonZoeken] = useState(false);
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
  }
  const kopRef = useRef(null);

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
  if (geweest.current.h !== stand.h) geweest.current = { h: stand.h, ids: new Map() };
  const ctx = (el = zoek.el) => ({ app: appRef.current, tab: tabRef.current, el, vind: vindAnker });
  // Een doestap die nu niet kan (er is niets om uit te kiezen) wordt een kijkstap
  const doeVan = (st, el) => (st?.doe && (!st.doe.kan || st.doe.kan(ctx(el))) ? st.doe : null);

  // Een stap verder of terug; een stap die niet past, slaan we over
  const ga = (d) => {
    const { h: hid, s } = standRef.current;
    const hs = vindHoofdstuk(hid);
    richtingRef.current = d;
    const n = s + d;
    // Terug vanaf een stap die wegviel, en er is niets ervoor: dan vooruit
    if (n < 0) { richtingRef.current = 1; onStandRef.current(hid, s + 1); return; }
    if (n >= hs.stappen.length) { setFase('eind'); return; }
    onStandRef.current(hid, n);
  };
  const gaRef = useRef(ga); gaRef.current = ga;

  // Een nieuw hoofdstuk: eerst kijken of er films zijn
  useEffect(() => {
    setFase(h?.nodigLijst && !appRef.current.watchlistAll.length ? 'lijst' : 'stap');
  }, [stand.h]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (stap.alleenAls && !stap.alleenAls(c)) {
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
  }, [fase, stap, onStop]);

  useLayoutEffect(() => { if (fase === 'eind' || fase === 'lijst') kopRef.current?.focus({ preventScroll: true }); }, [fase]);
  // Het einde gehaald: dan is het hoofdstuk gezien, ook als je daarna wegklikt
  useEffect(() => { if (fase === 'eind') onGezienRef.current?.(stand.h); }, [fase]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!h || pauze) return null;
  const titel = tr(`uitleg.h.${h.id}.titel`);
  const stopTekst = tr('uitleg.stop');

  // Eerst films: de demo als oefenlijst, of eerst je eigen lijst
  if (fase === 'lijst' || fase === 'laden') {
    const e = app.enrich;
    return createPortal(
      <div className="uitleg">
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
      </div>,
      document.body,
    );
  }

  // Het hoofdstuk is uit: verder met het volgende, of terug naar het programma
  if (fase === 'eind') {
    const volgende = volgendHoofdstuk(h.id, [...gezien, h.id], ctx());
    return createPortal(
      <div className="uitleg">
        <Bundel gat={null} />
        <Vangers gat={null} />
        <Tussentitel boven={titel} kop={tr('uitleg.eindKop', { titel })} kopRef={kopRef} kopId={kopId} stijl={{}} klasse="midden"
          knoppen={(
            <>
              {volgende && <button type="button" className="btn primary" onClick={() => onKlaar(h.id, { volgende: volgende.id })}>{tr('uitleg.verderMet', { titel: tr(`uitleg.h.${volgende.id}.titel`) })}</button>}
              <button type="button" className={`btn ${volgende ? 'ghost' : 'primary'}`} onClick={() => onKlaar(h.id, { programma: true })}>{tr('uitleg.naarProgramma')}</button>
              <button type="button" className="linkbtn" onClick={() => onKlaar(h.id, {})}>{tr('uitleg.klaarStop')}</button>
            </>
          )}>
          <p className="uitleg-tekst">{volgende ? tr('uitleg.eindTekst', { titel: tr(`uitleg.h.${volgende.id}.titel`) }) : tr('uitleg.eindAlles')}</p>
        </Tussentitel>
      </div>,
      document.body,
    );
  }

  if (!stap) return null;
  const c = ctx();
  const ids = geweest.current.ids;
  const zichtbaar = h.stappen.filter((s, i) => (
    i < stand.s && ids.has(s.id) ? ids.get(s.id) : (!s.alleenAls || s.alleenAls(c))
  ));
  const nr = Math.max(1, zichtbaar.indexOf(stap) + 1);
  const status = zoek.status;
  const gat = status === 'gevonden' && rect ? {
    x: Math.round(rect.left - RAND), y: Math.round(rect.top - RAND),
    w: Math.round(rect.width + RAND * 2), h: Math.round(rect.height + RAND * 2),
  } : null;
  const doe = doeVan(stap, zoek.el);
  const vrij = doe && !gedaan && gat; // het onderdeel mag je aantikken
  // De echte hoogte van de tussentitel als die er al staat
  const p = plaats(status === 'gevonden' ? rect : null, kopRef.current?.closest('.uitleg-titel')?.offsetHeight || PANEEL);
  const klasse = p.midden ? 'midden' : p.boven ? 'dock-boven' : p.onder ? 'dock-onder' : '';
  const toonPaneel = status !== 'zoekt' || toonZoeken;
  const vb = stap.vb && status === 'gevonden' ? stap.vb(ctx(zoek.el)) : null;
  const vbTekst = vb && Object.values(vb).every((v) => v != null) ? tr(sleutel(h, stap, 'vb'), vb) : null;
  const laatst = stand.s >= h.stappen.length - 1
    || h.stappen.slice(stand.s + 1).every((s) => s.alleenAls && !s.alleenAls(c));

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
    <div className={`uitleg${stilGewenst() ? ' stil' : ''}`} data-uitleg-stap={`${h.id}.${stap.id}`}>
      <Bundel gat={gat} />
      <Vangers gat={vrij ? gat : null} />
      {gat && <div className="uitleg-rand" aria-hidden="true" style={{ left: gat.x, top: gat.y, width: gat.w, height: gat.h }} />}
      {toonPaneel && (
        <Tussentitel key={`${stand.h}.${stand.s}`} boven={<>{titel}{' '}<span className="uitleg-teller">{tr('uitleg.stapVan', { nr, n: zichtbaar.length })}</span></>}
          kop={tr(sleutel(h, stap, 'kop'))} kopRef={kopRef} kopId={kopId} onStop={onStop} stopTekst={stopTekst}
          stijl={p.stijl || {}} klasse={klasse} knoppen={knoppen}>
          <p className="uitleg-tekst">{tr(sleutel(h, stap, status === 'leeg' ? 'leeg' : 'tekst'))}</p>
          {vbTekst && <p className="uitleg-vb">{vbTekst}</p>}
          {stap.oefening && <StemOefening />}
          {doe && status !== 'leeg' && (
            <p className={`uitleg-doe${gedaan ? ' gedaan' : ''}`}>{gedaan ? tr('uitleg.gedaan') : tr(sleutel(h, stap, 'doe'))}</p>
          )}
        </Tussentitel>
      )}
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
    <div className="uitleg">
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
