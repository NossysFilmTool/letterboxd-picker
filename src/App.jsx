import { useEffect, useState } from 'react';
import Shell from './components/Shell.jsx';
import RemoteVote from './components/RemoteVote.jsx';
import SamenGast from './components/SamenGast.jsx';
import ZaalTelefoon from './components/ZaalTelefoon.jsx';
import { zaalCode } from './lib/zaalstemming.js';
import Afgescheurd from './components/Afgescheurd.jsx';
import Ontdekt from './components/Ontdekt.jsx';
import SimilarOverlay from './components/SimilarOverlay.jsx';
import Meldingen from './components/Meldingen.jsx';
import Premiere from './components/Premiere.jsx';
import Rondleiding, { UitlegWelkom } from './components/Rondleiding.jsx';
import UitlegProgramma from './components/UitlegProgramma.jsx';
import { demoWatchlist } from './lib/extra.js';
import Pick from './tabs/Pick.jsx';
import Bieb from './tabs/Bieb.jsx';
import Verken from './tabs/Verken.jsx';
import Avond from './tabs/Avond.jsx';
import Inzicht from './tabs/Inzicht.jsx';
import Instellingen from './tabs/Instellingen.jsx';
import { useLS, useStorageHealth, leesOpslag, wisOpslag } from './lib/storage.js';
import { effectiveTmdbKey } from './lib/tmdb.js';
import { useSync } from './lib/useSync.js';
import { normaliseerCode } from './lib/sync.js';
import { useT } from './lib/i18n.js';
import { useBibliotheek } from './app/useBibliotheek.js';
import { useKaartjes } from './app/useKaartjes.js';
import { useVerrijking } from './app/useVerrijking.js';
import { useLetterboxdLive } from './app/useLetterboxdLive.js';
import { usePremiere, useUitleg } from './app/useOpstart.js';
import { useRekenInstellingen } from './app/useRekenInstellingen.js';

// Elk scherm een eigen adres (#archive, #setup, ...), zodat Terug in de
// browser, een bladwijzer en een gedeelde link gewoon werken. Vanavond is
// het kale adres.
const ADRES = { pick: '', bieb: 'archive', verken: 'programme', avond: 'movie-night', inzicht: 'yearbook', instellingen: 'setup' };
const hashVan = (t) => (ADRES[t] ? `#${ADRES[t]}` : '');
const tabVanAdres = () => {
  const h = location.hash.slice(1);
  return (h && Object.keys(ADRES).find((k) => ADRES[k] === h)) || 'pick';
};

// Sleutels die schermen zelf bewaren en die bij "terug naar start" ook weg
// moeten (de hoofdfilm van vandaag en eerdere dagen)
const ELDERS = ['hoofdfilmLog', 'hoofdfilmWeg', 'hoofdfilmOvergeslagen'];

export default function App() {
  const [tab, zetTab] = useState(tabVanAdres);
  // vervang: geen nieuwe stap in de geschiedenis (de rondleiding loopt zo
  // door de schermen zonder dat Terug daarna elk scherm nog eens langsgaat)
  const setTab = (t, { vervang = false } = {}) => {
    zetTab(t);
    if (location.hash === hashVan(t)) return;
    const url = `${location.pathname}${location.search}${hashVan(t)}`;
    if (vervang) window.history.replaceState(window.history.state, '', url);
    else window.history.pushState(null, '', url);
  };
  const { t: tr } = useT();
  const storageBroken = useStorageHealth();
  // Binnengekomen via een deellink? Dan is dit apparaat een stemmer, geen
  // volwaardige tool-sessie. Werkt ook zonder watchlist of sleutel.
  const avondCode = new URLSearchParams(location.search).get('avond');
  // Of als gast bij "Voor ons" (?samen=CODE): smaak lezen, scores sturen
  const samenCode = new URLSearchParams(location.search).get('samen');
  // Of als telefoon bij een zaalstemming (?zaal=CODE, of een ingetikte code)
  const [zaalCodeNu, setZaalCodeNu] = useState(() => zaalCode(new URLSearchParams(location.search).get('zaal')));
  const naarZaal = (code) => {
    window.history.pushState({}, '', `${location.pathname}?zaal=${code}`);
    setZaalCodeNu(code);
  };
  const uitDeZaal = () => {
    window.history.replaceState({}, '', `${location.pathname}${hashVan(tab)}`);
    setZaalCodeNu(null);
  };
  useEffect(() => {
    const terug = () => {
      setZaalCodeNu(zaalCode(new URLSearchParams(location.search).get('zaal')));
      zetTab(tabVanAdres());
    };
    window.addEventListener('popstate', terug);
    return () => window.removeEventListener('popstate', terug);
  }, []);

  const [settings, setSettings] = useLS('settings', { tmdbKey: '' });
  useRekenInstellingen(settings);
  // Eigen sleutel wint; zonder eigen sleutel loopt alles via de proxy van de
  // tool (zodra die er is). De rest ziet gewoon 'een sleutel'.
  const tmdbKey = effectiveTmdbKey(settings.tmdbKey);

  const bieb = useBibliotheek();
  const kaartjes = useKaartjes({ bieb, naarArchief: () => setTab('bieb') });
  const verrijking = useVerrijking({ settings, bieb, tmdbKey, tr });
  const lb = useLetterboxdLive({ settings, bieb, kaartjes });
  const premiere = usePremiere({ settings, setSettings, bieb, naarVanavond: () => setTab('pick') });
  const uitleg = useUitleg({ settings, setSettings, bieb, premiereKomt: premiere.premiereKomt, tr });
  // De slimme aanrader: vanaf elke filmkaart, dus centraal in de app
  const [similarSeed, setSimilarSeed] = useState(null); // {film, meta}

  // Alles wat van jou is (niet van de films): wat je keek, beoordeelde,
  // pickte, vond en wegklikte. Op één plek, zodat "Demo wissen", "Terug naar
  // start" en een echte import na de demo hetzelfde opruimen.
  const wisPersoonlijk = () => {
    bieb.wisPersoonlijk();
    kaartjes.wis();
    lb.wis();
    wisOpslag(ELDERS);
  };
  // Terug naar start: leegt de bibliotheek (watchlist, filmdata, ratings,
  // geschiedenis) maar bewaart instellingen zoals je TMDB-sleutel
  const resetLibrary = () => {
    verrijking.wis();
    wisPersoonlijk();
    bieb.setWatchlist([]);
    bieb.setMeta({});
    bieb.setDemoMode(false);
    setTab('pick');
  };
  // Een echte import na de demo: wat je in de demo deed, gaat weg. De
  // filmdata blijft staan: die hoort bij de films, niet bij jou.
  const vervangDemo = () => {
    verrijking.stopEnrich(); // de filmdata van de demo hoeft niet verder
    wisPersoonlijk();
    bieb.setDemoMode(false);
  };
  const laadDemo = () => {
    const demo = demoWatchlist();
    bieb.setWatchlist(demo);
    bieb.setDemoMode(true);
    if (tmdbKey) verrijking.startEnrich(demo);
  };

  // Sync tussen je apparaten (lib/sync.js): wat binnenkomt, leest de app
  // opnieuw in. Sleutels die hier niet wonen (bijv. je diensten) zien hun
  // schermen vanzelf (lib/storage.js).
  const setters = {
    kaartjes: kaartjes.setKaartjes, ownRatings: bieb.setOwnRatings, seen: bieb.setSeen, gezienOp: bieb.setGezienOp, gezienWeg: bieb.setGezienWeg,
    history: bieb.setHistory, diary: bieb.setDiary, watchlist: bieb.setWatchlist, watchedLb: bieb.setWatchedLb, watchedFilms: bieb.setWatchedFilms,
    ratings: bieb.setRatings, ratedFilms: bieb.setRatedFilms, lbLists: bieb.setLbLists, settings: setSettings, smart: bieb.setSmart,
    shortlist: bieb.setShortlist, skipped: bieb.setSkipped, ignored: bieb.setIgnored, smaakModel: bieb.setSmaakModel, vondsten: kaartjes.setVondsten,
  };
  const sync = useSync({
    uit: bieb.demoMode,
    pasToe: (sleutels) => {
      sleutels.forEach((s) => { const v = leesOpslag(s, null); if (v !== null && setters[s]) setters[s](v); });
      // Een watchlist van een ander apparaat: de filmdata haalt dit apparaat zelf
      if (sleutels.includes('watchlist')) {
        const wl = leesOpslag('watchlist', []);
        setTimeout(() => verrijking.startEnrichRef.current?.(wl), 500);
      }
    },
  });
  // Een koppellink (?sync=CODE) van een ander apparaat: koppelen en de code
  // meteen uit de adresbalk halen
  useEffect(() => {
    const ruw = new URLSearchParams(location.search).get('sync');
    if (!ruw) return;
    const code = normaliseerCode(ruw);
    const p = new URLSearchParams(location.search);
    p.delete('sync');
    window.history.replaceState(null, '', `${location.pathname}${p.toString() ? `?${p}` : ''}${location.hash}`);
    if (code && code !== sync.stand?.code) { sync.koppel(code); setTab('instellingen'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const app = {
    sync,
    vraag: kaartjes.vraag,
    naarDeDoos: kaartjes.naarDeDoos,
    openPremiere: premiere.openPremiere,
    openUitleg: uitleg.open, laadDemo, vervangDemo,
    settings, setSettings,
    watchlist: bieb.zichtbareLijst,
    watchlistAll: bieb.watchlist,
    setWatchlist: bieb.setWatchlist,
    watchedLb: bieb.watchedLb, setWatchedLb: bieb.setWatchedLb,
    watchedFilms: bieb.watchedFilms, setWatchedFilms: bieb.setWatchedFilms,
    omdbKeys: verrijking.omdbKeys,
    ratings: bieb.mergedRatings, setRatings: bieb.setRatings, lbRatings: bieb.ratings,
    ratedFilms: bieb.mergedRatedFilms, setRatedFilms: bieb.setRatedFilms,
    ownRatings: bieb.ownRatings, setOwnRatings: bieb.setOwnRatings,
    kaartjesStand: kaartjes.kaartjesStand, geefKaartje: kaartjes.geefKaartje, kaartjeDoorgeklikt: kaartjes.kaartjeDoorgeklikt,
    beantwoordAvond: kaartjes.beantwoordAvond, pasKaartjeAan: kaartjes.pasKaartjeAan, scheurAf: kaartjes.scheurAf,
    vondst: kaartjes.vondst, gevondenToevoegen: kaartjes.gevondenToevoegen, pakBiebStart: kaartjes.pakBiebStart,
    lbLive: lb.lbLive, lbBezig: lb.lbBezig, syncLetterboxd: lb.syncLetterboxd,
    diary: bieb.diary, setDiary: bieb.setDiary, lbLists: bieb.lbLists, setLbLists: bieb.setLbLists,
    seen: bieb.seen, seenSet: bieb.seenSet, toggleSeen: bieb.toggleSeen, markeerGezien: bieb.markeerGezien,
    smaakModel: bieb.smaakModel, setSmaakModel: bieb.setSmaakModel,
    meta: bieb.meta, setMeta: bieb.setMeta,
    history: bieb.history, setHistory: bieb.setHistory,
    shortlist: bieb.shortlist, setShortlist: bieb.setShortlist,
    skipped: bieb.skipped, setSkipped: bieb.setSkipped,
    ignored: bieb.ignored, ignoredSet: bieb.ignoredSet, ignoreFilm: bieb.ignoreFilm, unignoreFilm: bieb.unignoreFilm,
    smart: bieb.smart, setSmart: bieb.setSmart,
    demoMode: bieb.demoMode, setDemoMode: bieb.setDemoMode,
    resetLibrary,
    enrich: verrijking.enrich, startEnrich: verrijking.startEnrich, metaReady: bieb.metaReady, tmdbKey,
    goSetup: () => setTab('instellingen'),
    taste: bieb.taste, openSimilar: (film, m) => setSimilarSeed({ film, meta: m }),
    extEnrich: verrijking.extEnrich, startExtEnrich: verrijking.startExtEnrich,
    freshenProviders: verrijking.freshenProviders,
    ensureDetail: verrijking.ensureDetail,
    pickMatch: verrijking.pickMatch,
    naarZaal,
    stopEnrich: verrijking.stopEnrich,
  };

  const { watchlist, meta, demoMode } = bieb;
  const { enrich, extEnrich } = verrijking;
  const { vraag, afgescheurd, ontdekt } = kaartjes;
  const needsKey = watchlist.length > 0 && !tmdbKey;

  if (zaalCodeNu) return <ZaalTelefoon key={zaalCodeNu} code={zaalCodeNu} onWeg={uitDeZaal} onCode={naarZaal} onKaartje={kaartjes.geefKaartje} />;
  if (avondCode) return <RemoteVote code={avondCode} />;
  if (samenCode) return <SamenGast code={samenCode} />;

  return (
    <>
    <Meldingen />
    {premiere.premiereOpen && <Premiere app={app} onKlaar={premiere.sluitPremiere} />}
    {uitleg.welkomOpen && !uitleg.stand && (
      <UitlegWelkom
        onRondleiding={uitleg.welkomRondleiding}
        onZelf={uitleg.welkomZelf}
        onCode={(code) => { uitleg.welkomGast(); naarZaal(code); }} />
    )}
    {uitleg.programmaOpen && !uitleg.stand && (
      <UitlegProgramma app={app} tab={tab} uitleg={settings.uitleg} onStart={uitleg.start} onSluit={uitleg.sluitProgramma} />
    )}
    {uitleg.stand && (
      <Rondleiding app={app} tab={tab} setTab={(t) => setTab(t, { vervang: true })} stand={uitleg.stand} gezien={settings.uitleg?.gezien || []}
        onStand={uitleg.naarStap}
        onStop={uitleg.stop}
        onGezien={uitleg.gezien}
        onKlaar={uitleg.klaar} />
    )}
    {similarSeed && (
      <SimilarOverlay seed={similarSeed.film} seedMeta={similarSeed.meta || meta[similarSeed.film.key] || {}}
        app={app} onClose={() => setSimilarSeed(null)} />
    )}
    {/* De vraag na een avond staat op Vanavond (Pick.jsx); elders een stip op die tab */}
    <Shell tab={tab} setTab={setTab} onUitleg={uitleg.openProgramma} stippen={vraag ? ['pick'] : []}>
      {storageBroken && (
        <div className="notice warn" role="alert" style={{ marginBottom: 18 }}>
          {tr('app.storageBroken')}
        </div>
      )}
      {enrich.running && (
        <div style={{ marginBottom: 18 }} data-uitleg="filmdata" data-uitleg-klaar={enrich.done} data-uitleg-totaal={enrich.total}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--fog)', marginBottom: 6 }}>
            <span>{tr('app.enriching', { done: enrich.done, total: enrich.total })}{enrich.errors ? tr('app.enrichErrCount', { count: enrich.errors }) : ''}</span>
            <button className="btn ghost" style={{ padding: '2px 8px', fontSize: 12 }} onClick={verrijking.stopEnrich}>{tr('app.pause')}</button>
          </div>
          <div className="progressbar"><div style={{ width: `${(enrich.done / Math.max(enrich.total, 1)) * 100}%` }} /></div>
        </div>
      )}
      {demoMode && watchlist.length > 0 && (
        <div className="notice" data-uitleg="demo-banner" style={{ marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span dangerouslySetInnerHTML={{ __html: tr('app.demoBanner') }} />
          <button className="btn" style={{ flexShrink: 0 }} onClick={resetLibrary}>{tr('app.demoReset')}</button>
        </div>
      )}
      {needsKey && tab !== 'instellingen' && (
        <div className="notice warn" style={{ marginBottom: 18 }}>
          {tr('app.needKeyNotice')}
          <a href="#setup" onClick={(e) => { e.preventDefault(); setTab('instellingen'); }}>{tr('app.setupLink')}</a>.
        </div>
      )}
      {extEnrich.running && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12.5, color: 'var(--fog)', marginBottom: 6 }}>
            {tr('app.omdbBezig', { done: extEnrich.done, total: extEnrich.total })}
          </div>
          <div className="progressbar"><div style={{ width: `${(extEnrich.done / Math.max(extEnrich.total, 1)) * 100}%` }} /></div>
        </div>
      )}
      {afgescheurd && <Afgescheurd melding={afgescheurd} onSluit={() => kaartjes.setAfgescheurd(null)} onBekijk={kaartjes.naarDeDoos} />}
      {ontdekt[0] && !premiere.premiereOpen && (
        <Ontdekt key={ontdekt[0].k.id} item={ontdekt[0]} meer={ontdekt.length - 1}
          poster={meta[ontdekt[0].k.key]?.poster || ontdekt[0].k.poster || null}
          onKlaar={() => kaartjes.setOntdekt((q) => q.slice(1))}
          onBekijk={() => { kaartjes.setOntdekt([]); kaartjes.naarDeDoos(); }} />
      )}
      <div className="tabfade" key={tab}>
        {tab === 'pick' && <Pick app={app} />}
        {tab === 'bieb' && <Bieb app={app} />}
        {tab === 'verken' && <Verken app={app} />}
        {tab === 'avond' && <Avond app={app} />}
        {tab === 'inzicht' && <Inzicht app={app} />}
        {tab === 'instellingen' && <Instellingen app={app} />}
      </div>
    </Shell>
    </>
  );
}
