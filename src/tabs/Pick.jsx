import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SlidersHorizontal, Dice5 } from 'lucide-react';
import { MOODS, moodTest, pickWinner, nossyScore } from '../lib/pick.js';
import { filterPot, metStandaard, afwijkend } from '../lib/avondFilters.js';
import { aanvangTijd } from '../lib/kaartje.js';
import { inDeDoos } from '../lib/kaartjesdoos.js';
import { leesOpslag } from '../lib/storage.js';
import { ontgrendel } from '../lib/zaalgeluid.js';
import { useT, decimaal } from '../lib/i18n.js';
import Leader from '../components/Leader.jsx';
import Winner from '../components/Winner.jsx';
import Pitch from '../components/Pitch.jsx';
import AvondVraag from '../components/AvondVraag.jsx';
import AvondFilters, { Chip } from '../components/AvondFilters.jsx';
import { Strook } from '../components/Kaartjesdoos.jsx';
import ImportPanel from '../components/ImportPanel.jsx';

// Pick is de kassa van de bioscoop (DESIGN.md, "De kassa"). Bovenaan waar je
// zin in hebt, daaronder de kassa: hoeveel films er in de pot zitten, wat er
// op tafel komt, en de sleuf waar je kaartje straks uit komt. De knop staat
// altijd in beeld, ook op een telefoon. Een stemming kiest niet meteen een
// film, maar vult de pot. Na het aftellen (en de trailer, als die aan staat)
// schuift het kaartje uit de sleuf.

const stilGewenst = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Wat er in de pot zit, in een paar woorden onder het getal
function samenvatting(f, { bronNaam, gezienEruit, diensten }, tr) {
  const delen = [bronNaam, gezienEruit ? tr('pick.gezienEruit') : tr('pick.gezienMee')];
  if (f.geenKort) delen.push(tr('avond.fGeenKort'));
  if (f.maxDuur) delen.push(tr('avond.fTotUur', { uur: decimaal(f.maxDuur / 60) }));
  if (f.genres.length) delen.push(f.genres.join(', '));
  if (f.nietGenres.length) delen.push(tr('pick.zonder', { genres: f.nietGenres.join(', ') }));
  if (f.taal === 'en') delen.push(tr('avond.fTaalEn'));
  if (f.taal === 'anders') delen.push(tr('avond.fTaalAnders'));
  if (f.jaarVan !== '' && f.jaarTot !== '') delen.push(tr('pick.periode', { van: f.jaarVan, tot: f.jaarTot }));
  else if (f.jaarVan !== '') delen.push(tr('pick.vanaf', { van: f.jaarVan }));
  else if (f.jaarTot !== '') delen.push(tr('pick.tot', { tot: f.jaarTot }));
  if (f.minScore) delen.push(`${tr('winner.nossy')} ${decimaal(f.minScore.toFixed(1))}+`);
  if (f.alleenStreaming) delen.push(diensten.length ? tr('avond.fMijnDiensten') : tr('avond.onlyStreaming'));
  return delen;
}

// De la met wat er op tafel komt: dezelfde kaart als bij Filmavond, plus
// waar je uit kiest en of gezien meedoet. Schuift van onderen open.
function La({ onSluit, children }) {
  const ref = useRef(null);
  const sluitRef = useRef(onSluit);
  sluitRef.current = onSluit;
  useEffect(() => {
    const toets = (e) => { if (e.key === 'Escape') sluitRef.current(); };
    window.addEventListener('keydown', toets);
    const oud = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => { window.removeEventListener('keydown', toets); document.body.style.overflow = oud; };
  }, []);
  return createPortal(
    <>
      <div className="kassa-la-achter" aria-hidden="true" onClick={onSluit} />
      <div ref={ref} tabIndex={-1} className="kassa-la" role="dialog" aria-modal="true" aria-labelledby="kassa-la-kop">
        <span className="kassa-la-greep" aria-hidden="true" />
        {children}
      </div>
    </>,
    document.body,
  );
}

export default function Pick({ app }) {
  const { watchlist, meta, seenSet, smart, setSmart, history, setHistory, lbLists, startEnrich, geefKaartje, kaartjeDoorgeklikt, settings, setSettings } = app;
  const { t: tr, lang } = useT();
  const [phase, setPhase] = useState('idle'); // idle | leader | trailer | winner
  const [winner, setWinner] = useState(null);
  const [context, setContext] = useState(null);
  const [mood, setMood] = useState(null);
  const [laOpen, setLaOpen] = useState(false);
  const metTrailerRef = useRef(false);

  // Waar je uit kiest: je watchlist, of een van je eigen Letterboxd-lijsten
  const [bron, setBron] = useState('watchlist');
  const bronLijst = bron === 'watchlist' ? null : lbLists.find((l) => l.naam === bron);
  const basis = bronLijst ? bronLijst.films : watchlist;
  const kiesBron = (naam) => {
    setBron(naam);
    // Lijstfilms buiten je watchlist hebben mogelijk nog geen filmdata
    const lijst = lbLists.find((l) => l.naam === naam);
    const missend = lijst ? lijst.films.filter((f) => !(f.key in meta)) : [];
    if (missend.length) startEnrich(missend);
  };

  // Wat er op tafel komt: onthouden in de instellingen, los van Filmavond
  const pf = settings.pickFilters || {};
  const filters = metStandaard(pf);
  const gezienEruit = pf.gezienEruit !== false;
  const zetFilters = (f) => setSettings((s) => ({ ...s, pickFilters: f }));
  const [diensten] = useState(() => leesOpslag('mijnDiensten', []));
  const trailerAan = settings.pickTrailer !== false;
  const geluidAan = settings.pitchGeluid !== false;

  const potZonderMood = useMemo(() => {
    const p = gezienEruit ? basis.filter((f) => !seenSet.has(f.key)) : basis;
    return filterPot(p, meta, filters, nossyScore, { diensten });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basis, meta, seenSet, gezienEruit, JSON.stringify(filters), diensten]);
  const moodTelling = useMemo(() => {
    const telling = {};
    MOODS.forEach((m) => { telling[m.id] = potZonderMood.filter((f) => moodTest(m.id, f, meta[f.key])).length; });
    return telling;
  }, [potZonderMood, meta]);
  const pot = useMemo(
    () => (mood ? potZonderMood.filter((f) => moodTest(mood, f, meta[f.key])) : potZonderMood),
    [potZonderMood, mood, meta],
  );

  const genres = useMemo(() => {
    const telling = {};
    basis.forEach((f) => meta[f.key]?.genres?.forEach((g) => { telling[g] = (telling[g] || 0) + 1; }));
    return Object.entries(telling).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([g]) => g);
  }, [basis, meta]);
  const decennia = useMemo(() => {
    const s = new Set();
    basis.forEach((f) => { if (f.year) s.add(Math.floor(f.year / 10) * 10); });
    return [...s].sort((a, b) => b - a);
  }, [basis]);

  // De klok van de kassa: de aanvang loopt mee zolang het scherm openstaat
  const [nu, setNu] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNu(new Date()), 30000); return () => clearInterval(t); }, []);
  const klok = (d) => new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' }).format(d);
  const datum = (() => {
    const s = new Intl.DateTimeFormat(lang, { weekday: 'long', day: 'numeric', month: 'long' }).format(nu);
    return s.charAt(0).toUpperCase() + s.slice(1);
  })();

  const runPick = (uit) => {
    const gekozen = pickWinner(uit, meta, smart, history);
    if (!gekozen) return;
    // De trailer alleen met beweging; het geluid mag pas na een klik aan
    metTrailerRef.current = trailerAan && !stilGewenst();
    if (metTrailerRef.current && geluidAan) ontgrendel();
    // Verhaal, regie en rolverdeling voor de trailer en het kaartje
    app.ensureDetail(gekozen);
    setWinner(gekozen);
    setContext(mood
      ? tr('pick.moodContext', { mood: tr(`mood.${mood}`).toLowerCase() })
      : tr('pick.uitPot', { count: uit.length }));
    setPhase('leader');
  };

  const finishLeader = () => {
    geefKaartje(winner, { bron: 'pick', personen: 1 });
    app.freshenProviders(winner.key);
    setHistory((h) => [{ key: winner.key, name: winner.name, year: winner.year, date: new Date().toISOString(), context: mood ? context : null }, ...h].slice(0, 80));
    setPhase(metTrailerRef.current ? 'trailer' : 'winner');
  };

  if (!watchlist.length) return <ImportPanel app={app} hero />;

  const doos = inDeDoos(app.kaartjesStand || []);
  const vraag = app.vraag;
  const bronNaam = bronLijst ? bronLijst.naam : tr('pick.sourceWatchlist');
  const delen = samenvatting(filters, { bronNaam, gezienEruit, diensten }, tr);
  const anders = afwijkend(filters) || !gezienEruit;

  const schakelaar = (aan, label, onClick, title) => (
    <button type="button" className={`switch-row ${aan ? 'on' : ''}`} role="switch" aria-checked={aan} onClick={onClick} title={title}>
      <span className="switch" aria-hidden="true"><span className="knob" /></span>
      {label}
    </button>
  );

  return (
    <div className="kassa-pagina">
      {phase === 'leader' && <Leader onDone={finishLeader} />}
      {phase === 'trailer' && winner && (
        <Pitch films={[winner]} meta={meta} tmdbKey={app.tmdbKey} onKlaar={() => setPhase('winner')}
          geluid={geluidAan} onGeluid={(v) => setSettings((s) => ({ ...s, pitchGeluid: v }))}
          teksten={{ introKop: tr('pick.trailerIntro'), overslaan: tr('pick.trailerOverslaan'), naarEinde: tr('pick.trailerNaarKaartje'), aria: tr('pick.trailerAria') }} />
      )}

      <header>
        <h1 className="page-title">{tr('pick.title')}</h1>
        <p className="page-sub">{datum}</p>
      </header>

      {phase === 'winner' && winner ? (
        <div>
          <div className="kassa uitgifte">
            <div className="kassa-pot">
              <span className="kassa-context">{context}</span>
              <span className="kassa-aanvang">{tr('pick.aanvang', { t: klok(aanvangTijd(nu)) })}</span>
            </div>
            <div className="kassa-sleuf" aria-hidden="true" />
          </div>
          <Winner
            film={winner} meta={meta[winner.key]} context={context} zonderContext
            seen={seenSet.has(winner.key)} onToggleSeen={() => app.toggleSeen(winner.key)}
            onSimilar={() => app.openSimilar(winner, meta[winner.key])} onReroll={pot.length ? () => runPick(pot) : undefined}
            onWantScores={!app.omdbKeys.length ? app.goSetup : undefined}
            kaartje={1} onKijken={() => kaartjeDoorgeklikt(winner.key)}
          />
          <button type="button" className="btn ghost kassa-terug" onClick={() => setPhase('idle')}>{tr('pick.terugNaarKassa')}</button>
        </div>
      ) : (
        <>
          <section className="kassa-moods" aria-label={tr('pick.zinIn')}>
            <p className="label">{tr('pick.zinIn')}</p>
            <div className="kassa-chips">
              <Chip aan={!mood} onClick={() => setMood(null)}>{tr('pick.alles')}</Chip>
              {MOODS.map((m) => (
                <Chip key={m.id} aan={mood === m.id} title={tr(`mood.${m.id}_desc`)}
                  disabled={!moodTelling[m.id] && mood !== m.id} onClick={() => setMood(mood === m.id ? null : m.id)}>
                  {tr(`mood.${m.id}`)} <span className="count">{moodTelling[m.id]}</span>
                </Chip>
              ))}
            </div>
          </section>

          <div className="kassa-blok">
            <section className="kassa" aria-label={tr('pick.kassaAria')}>
              <div className="kassa-pot">
                <p className="kassa-aantal" aria-live="polite">
                  <span className="n">{pot.length}</span> <span className="lbl">{tr('pick.potLabel', { count: pot.length })}</span>
                </p>
                <span className="kassa-aanvang">{tr('pick.aanvang', { t: klok(aanvangTijd(nu)) })}</span>
              </div>
              <div className="kassa-samenvatting">
                {delen.map((d, i) => <span key={i}>{d}</span>)}
                <button type="button" className="linkbtn kassa-aanpassen" onClick={() => setLaOpen(true)} aria-haspopup="dialog">
                  <SlidersHorizontal size={15} aria-hidden="true" /> {tr('pick.aanpassen')}
                </button>
              </div>
              {!pot.length && <p className="kassa-leeg">{tr('pick.legePot')}</p>}
              <div className="kassa-sleuf" aria-hidden="true" />
            </section>

            <button type="button" className="btn primary big kassa-knop" disabled={phase !== 'idle' || !pot.length} onClick={() => runPick(pot)}>
              <Dice5 size={19} aria-hidden="true" /> {tr('pick.pickFilm')}
            </button>

            <div className="kassa-schakelaars">
              {schakelaar(trailerAan, tr('pick.trailerEerst'), () => setSettings((s) => ({ ...s, pickTrailer: !(s.pickTrailer !== false) })), tr('pick.trailerEerstTitel'))}
              {schakelaar(smart, tr('pick.slimKiezen'), () => setSmart(!smart), tr('pick.smartTitle'))}
            </div>
          </div>
        </>
      )}

      {vraag && (
        <AvondVraag kort key={vraag.avond[0].id} avond={vraag.avond} meta={meta} onAntwoord={vraag.onAntwoord} onLater={vraag.onLater} />
      )}

      {phase !== 'winner' && doos.length > 0 && (
        <section className="kassa-doos" aria-label={tr('pick.laatstInDoos')}>
          <div className="kassa-doos-kop">
            <h2>{tr('pick.laatstInDoos')}</h2>
            <button type="button" className="linkbtn" onClick={app.naarDeDoos}>{tr('pick.alleKaartjes', { count: doos.length })}</button>
          </div>
          <div className="kassa-doos-raster">
            {doos.slice(0, 4).map((k) => (
              <Strook key={k.id} k={k} poster={meta[k.key]?.poster || k.poster || null} onOpen={app.naarDeDoos} />
            ))}
          </div>
        </section>
      )}

      {laOpen && (
        <La onSluit={() => setLaOpen(false)}>
          <AvondFilters
            className="in-la" kopId="kassa-la-kop" minimum={0}
            filters={filters} onChange={zetFilters} aantal={pot.length} genres={genres} decennia={decennia} diensten={diensten}
            afwijkt={anders}
            actie={<button type="button" className="btn primary kassa-la-klaar" onClick={() => setLaOpen(false)}>{tr('pick.klaar')}</button>}
            voor={lbLists.length > 0 && (
              <div className="af-rij">
                <span className="af-label">{tr('pick.source')}</span>
                <div className="af-chips">
                  <Chip aan={bron === 'watchlist'} onClick={() => kiesBron('watchlist')}>
                    {tr('pick.sourceWatchlist')} <span className="count">{watchlist.length}</span>
                  </Chip>
                  {lbLists.map((l) => (
                    <Chip key={l.naam} aan={bron === l.naam} onClick={() => kiesBron(l.naam)}>
                      {l.naam} <span className="count">{l.films.length}</span>
                    </Chip>
                  ))}
                </div>
              </div>
            )}
            na={(
              <div className="af-rij">
                <span className="af-label">{tr('common.seen')}</span>
                <div className="af-chips">
                  <Chip aan={gezienEruit} title={tr('pick.gezienEruitTitel')}
                    onClick={() => setSettings((s) => ({ ...s, pickFilters: { ...metStandaard(s.pickFilters), gezienEruit: !gezienEruit } }))}>
                    {tr('pick.gezienEruit')}
                  </Chip>
                </div>
              </div>
            )}
          />
        </La>
      )}
    </div>
  );
}
