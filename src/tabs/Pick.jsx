import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SlidersHorizontal } from 'lucide-react';
import { MOODS, moodTest, pickWinner, nossyScore } from '../lib/pick.js';
import { filterPot, metStandaard, afwijkend } from '../lib/avondFilters.js';
import { aanvangTijd } from '../lib/kaartje.js';
import { inDeDoos } from '../lib/kaartjesdoos.js';
import { leesOpslag, useLS } from '../lib/storage.js';
import { netBinnen } from '../lib/aanbod.js';
import { kiesHoofdfilm, kiesVoorfilm, beschrijfHoofdfilm, vandaag } from '../lib/voorpagina.js';
import { ontgrendel } from '../lib/zaalgeluid.js';
import { useT, decimaal } from '../lib/i18n.js';
import Leader from '../components/Leader.jsx';
import Winner from '../components/Winner.jsx';
import Pitch from '../components/Pitch.jsx';
import AvondVraag from '../components/AvondVraag.jsx';
import AvondFilters, { Chip } from '../components/AvondFilters.jsx';
import { Rubriek, Hoofdfilm, Programmaregels, DoosWaaier } from '../components/Voorpagina.jsx';
import ImportPanel from '../components/ImportPanel.jsx';

// Vanavond is de voorpagina van het programma (DESIGN.md, "De voorpagina"):
// elke dag een hoofdfilm uit je eigen lijst, met een echte reden en een
// knop die je het kaartje geeft. Daaronder de vraag over gisteren, de kassa
// voor wie liever het lot laat kiezen, wat er net binnen is en je laatste
// kaartjes. Op een breed scherm een dubbele bladzijde.
//
// De kassa (DESIGN.md, "De kassa"): hoeveel films er in de pot zitten, wat er
// op tafel komt, en de sleuf waar je kaartje uit komt. Een stemming kiest niet
// meteen een film, maar vult de pot. Na het aftellen (en de trailer, als die
// aan staat) schuift het kaartje uit de sleuf, ook voor de hoofdfilm.

const stilGewenst = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Een breed scherm: dan wordt de voorpagina een dubbele bladzijde
const BREED = '(min-width: 1000px)';
function useBreed() {
  const [breed, setBreed] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(BREED).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(BREED);
    if (!mq?.addEventListener) return undefined;
    const bij = () => setBreed(!!mq.matches);
    mq.addEventListener('change', bij);
    return () => mq.removeEventListener('change', bij);
  }, []);
  return breed;
}

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
      <div ref={ref} tabIndex={-1} className="kassa-la" role="dialog" aria-modal="true" aria-labelledby="kassa-la-kop" data-uitleg="kassa-la" data-uitleg-toetsen="">
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
  const breed = useBreed();

  // De hoofdfilm van vanavond. De keuze ligt vast voor de dag (het moment van
  // openen telt), "Een andere film" schuift door en geldt de rest van de dag,
  // en een tik op een regel van Net binnen zet die film als hoofdfilm.
  const [beginNu] = useState(() => new Date());
  const dag = vandaag(nu);
  const [hfWeg, setHfWeg] = useLS('hoofdfilmWeg', { dag: '', keys: [] });
  const weg = hfWeg?.dag === dag ? hfWeg.keys : [];
  // Voor de afwisseling: de hoofdfilms van eerdere dagen, en op welke dagen
  // je een film wegklikte (lib/voorpagina.js)
  const [hfLog, setHfLog] = useLS('hoofdfilmLog', []);
  const [hfOvergeslagen, setHfOvergeslagen] = useLS('hoofdfilmOvergeslagen', {});
  const vorige = (Array.isArray(hfLog) ? hfLog : []).filter((v) => v.dag !== dag);
  const [voorkeur, setVoorkeur] = useState(null);
  const binnen = useMemo(() => netBinnen(watchlist, meta, { mijnDiensten: diensten, seenSet }), [watchlist, meta, diensten, seenSet]);
  const keuze = useMemo(() => {
    const ratedFilms = app.ratedFilms || [];
    if (voorkeur) {
      const f = watchlist.find((x) => x.key === voorkeur);
      if (f && meta[f.key]) return beschrijfHoofdfilm(f, { meta, ratedFilms, mijnDiensten: diensten, binnen, taste: app.taste, nu: beginNu });
    }
    const basisArgs = {
      watchlist, meta, seenSet, ratedFilms, mijnDiensten: diensten, nu: beginNu,
      taste: app.taste, vorige, overgeslagen: hfOvergeslagen || {}, gepickt: history || [],
    };
    return kiesHoofdfilm({ ...basisArgs, weg }) || (weg.length ? kiesHoofdfilm({ ...basisArgs, weg: [] }) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voorkeur, watchlist, meta, seenSet, app.ratedFilms, app.taste, diensten, binnen, dag, weg.join('|'), JSON.stringify(vorige), hfOvergeslagen, history]);
  // Wat vandaag de hoofdfilm is, onthouden voor de afwisseling van morgen
  const keuzeKey = !voorkeur ? keuze?.film.key : null;
  useEffect(() => {
    if (!keuzeKey) return;
    setHfLog((log) => {
      const oud = Array.isArray(log) ? log : [];
      if (oud.some((v) => v.dag === dag && v.key === keuzeKey)) return log;
      return [...oud.filter((v) => v.dag !== dag), { dag, key: keuzeKey }].slice(-14);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keuzeKey, dag]);
  const anderHoofdfilm = () => {
    if (!keuze) return;
    setVoorkeur(null);
    setHfWeg({ dag, keys: [...weg.filter((k) => k !== keuze.film.key), keuze.film.key] });
    // Op hoeveel dagen je hem wegklikte: drie keer en hij zakt
    const key = keuze.film.key;
    setHfOvergeslagen((o) => {
      const alle = { ...(o || {}) };
      alle[key] = [...new Set([...(alle[key] || []), dag])].slice(-5);
      const sleutels = Object.keys(alle);
      if (sleutels.length > 200) sleutels.slice(0, sleutels.length - 200).forEach((k) => { delete alle[k]; });
      return alle;
    });
  };
  // De voorfilm: een korte film van je lijst, met een eigen filmkaart
  const voorfilm = useMemo(
    () => kiesVoorfilm({ watchlist, meta, seenSet, taste: app.taste, nu: beginNu, zonder: keuze?.film.key }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [watchlist, meta, seenSet, app.taste, dag, keuze?.film.key],
  );
  const [voorfilmOpen, setVoorfilmOpen] = useState(false);
  const alsHoofdfilm = (film) => {
    setVoorkeur(film.key);
    document.querySelector('.hoofdfilm')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  // Een film kiezen (uit de pot of als hoofdfilm): het aftellen, dan de trailer
  // als die aan staat, dan het kaartje. contextVoorLijst: wat er in je
  // geschiedenis bij komt te staan (de stemming of "hoofdfilm van vanavond")
  const contextVoorLijst = useRef(null);
  const start = (gekozen, ctx, ctxLijst) => {
    // De trailer alleen met beweging; het geluid mag pas na een klik aan
    metTrailerRef.current = trailerAan && !stilGewenst();
    if (metTrailerRef.current && geluidAan) ontgrendel();
    // Verhaal, regie en rolverdeling voor de trailer en het kaartje
    app.ensureDetail(gekozen);
    setWinner(gekozen);
    setContext(ctx);
    contextVoorLijst.current = ctxLijst;
    setPhase('leader');
  };
  const runPick = (uit) => {
    const gekozen = pickWinner(uit, meta, smart, history);
    if (!gekozen) return;
    const moodTekst = mood ? tr('pick.moodContext', { mood: tr(`mood.${mood}`).toLowerCase() }) : null;
    start(gekozen, moodTekst || tr('pick.uitPot', { count: uit.length }), moodTekst);
  };
  const pakHoofdfilm = () => {
    if (keuze) start(keuze.film, tr('voorpagina.context'), tr('voorpagina.context'));
  };

  const finishLeader = () => {
    geefKaartje(winner, { bron: 'pick', personen: 1 });
    app.freshenProviders(winner.key);
    setHistory((h) => [{ key: winner.key, name: winner.name, year: winner.year, date: new Date().toISOString(), context: contextVoorLijst.current }, ...h].slice(0, 80));
    setPhase(metTrailerRef.current ? 'trailer' : 'winner');
  };

  if (!watchlist.length) return <ImportPanel app={app} hero />;

  const doos = inDeDoos(app.kaartjesStand || []);
  const vraag = app.vraag;
  const regels = binnen.filter((b) => b.film.key !== keuze?.film.key).slice(0, 3);
  const bronNaam = bronLijst ? bronLijst.naam : tr('pick.sourceWatchlist');
  const delen = samenvatting(filters, { bronNaam, gezienEruit, diensten }, tr);
  const anders = afwijkend(filters) || !gezienEruit;

  const schakelaar = (aan, label, onClick, title) => (
    <button type="button" className={`switch-row ${aan ? 'on' : ''}`} role="switch" aria-checked={aan} onClick={onClick} title={title}>
      <span className="switch" aria-hidden="true"><span className="knob" /></span>
      {label}
    </button>
  );

  const momenten = (
    <>
      {phase === 'leader' && <Leader onDone={finishLeader} />}
      {phase === 'trailer' && winner && (
        <Pitch films={[winner]} meta={meta} tmdbKey={app.tmdbKey} onKlaar={() => setPhase('winner')}
          geluid={geluidAan} onGeluid={(v) => setSettings((s) => ({ ...s, pitchGeluid: v }))}
          teksten={{ introKop: tr('pick.trailerIntro'), overslaan: tr('pick.trailerOverslaan'), naarEinde: tr('pick.trailerNaarKaartje'), aria: tr('pick.trailerAria') }} />
      )}
    </>
  );

  // Het kaartje schuift uit de sleuf: dan staat alleen dat in beeld
  if (phase === 'winner' && winner) {
    return (
      <div className="kassa-pagina">
        {momenten}
        <h1 className="page-title">{tr('pick.title')}</h1>
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
          <button type="button" className="btn ghost kassa-terug" onClick={() => setPhase('idle')} data-uitleg="kassa-terug">{tr('pick.terugNaarKassa')}</button>
        </div>
      </div>
    );
  }

  const hoofd = keuze
    ? (
      <>
        <Hoofdfilm keuze={keuze} aanvang={aanvangTijd(nu)} onKaartje={pakHoofdfilm} onAnder={anderHoofdfilm} bezig={phase !== 'idle'}
          voorfilm={voorfilm} voorfilmOpen={voorfilmOpen} onVoorfilm={() => setVoorfilmOpen((o) => !o)} />
        {voorfilm && voorfilmOpen && (
          <div className="voorfilm-kaart">
            <Winner film={voorfilm.film} meta={voorfilm.m} context={tr('voorpagina.voorfilmKaart')}
              seen={seenSet.has(voorfilm.film.key)} onToggleSeen={() => app.toggleSeen(voorfilm.film.key)} />
          </div>
        )}
      </>
    )
    : <h1 className="page-title">{tr('pick.title')}</h1>;

  const vraagBlok = vraag && (
    <AvondVraag kort anker="avond-vraag" key={vraag.avond[0].id} avond={vraag.avond} meta={meta} onAntwoord={vraag.onAntwoord} onLater={vraag.onLater} />
  );

  const kassaBlok = (
    <Rubriek kop={tr('voorpagina.kassaKop')} sub={<span className="label-breed">{tr('voorpagina.kassaSub')}</span>}>
          <section className="kassa-moods" aria-label={tr('pick.zinIn')} data-uitleg="kassa-moods" data-uitleg-kort={moodTelling.kort}>
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
            <section className="kassa" aria-label={tr('pick.kassaAria')} data-uitleg="kassa" data-uitleg-aantal={pot.length}>
              <div className="kassa-pot">
                <p className="kassa-aantal" aria-live="polite">
                  <span className="n">{pot.length}</span> <span className="lbl">{tr('pick.potLabel', { count: pot.length })}</span>
                </p>
                <span className="kassa-aanvang">{tr('pick.aanvang', { t: klok(aanvangTijd(nu)) })}</span>
              </div>
              <div className="kassa-samenvatting">
                {delen.map((d, i) => <span key={i}>{d}</span>)}
                <button type="button" className="linkbtn kassa-aanpassen" onClick={() => setLaOpen(true)} aria-haspopup="dialog" data-uitleg="kassa-aanpassen">
                  <SlidersHorizontal size={15} aria-hidden="true" /> {tr('pick.aanpassen')}
                </button>
              </div>
              {!pot.length && <p className="kassa-leeg">{tr('pick.legePot')}</p>}
              <div className="kassa-sleuf" aria-hidden="true" />
            </section>

            {/* Met een hoofdfilm is "Pak dit kaartje" de hoofdknop; dan is het lot de tweede keus */}
            <button type="button" className={`btn big kassa-knop ${keuze ? 'tweede' : 'primary'}`} disabled={phase !== 'idle' || !pot.length} onClick={() => runPick(pot)} data-uitleg="kassa-lot">
              {tr('pick.pickFilm')}
            </button>

            <div className="kassa-schakelaars" data-uitleg="kassa-schakelaars">
              {schakelaar(trailerAan, tr('pick.trailerEerst'), () => setSettings((s) => ({ ...s, pickTrailer: !(s.pickTrailer !== false) })), tr('pick.trailerEerstTitel'))}
              {schakelaar(smart, tr('pick.slimKiezen'), () => setSmart(!smart), tr('pick.smartTitle'))}
            </div>
          </div>
    </Rubriek>
  );

  const binnenBlok = regels.length > 0 && (
    <Rubriek uitleg="net-binnen" kop={tr('voorpagina.binnenKop')} sub={<span className="label-breed">{tr(diensten.length ? 'voorpagina.binnenSub' : 'voorpagina.binnenSubAlle')}</span>}>
      <Programmaregels regels={regels} meta={meta} onKies={alsHoofdfilm} />
    </Rubriek>
  );

  const doosBlok = doos.length > 0 && (
    <Rubriek uitleg="doos" kop={tr('voorpagina.doosKop')}
      sub={<button type="button" className="linkbtn rubriek-link" onClick={app.naarDeDoos}>{tr('pick.alleKaartjes', { count: doos.length })}</button>}>
      <DoosWaaier kaartjes={doos} meta={meta} onOpen={app.naarDeDoos} />
    </Rubriek>
  );

  return (
    <div className={`voorpagina${breed ? ' breed' : ''}`}>
      {momenten}
      {breed ? (
        <>
          <div className="voorpagina-kolom">{hoofd}{binnenBlok}</div>
          <aside className="voorpagina-kolom zij">{kassaBlok}{vraagBlok}{doosBlok}</aside>
        </>
      ) : (
        <>{hoofd}{vraagBlok}{kassaBlok}{binnenBlok}{doosBlok}</>
      )}

      {laOpen && (
        <La onSluit={() => setLaOpen(false)}>
          <AvondFilters
            className="in-la" kopId="kassa-la-kop" minimum={0}
            filters={filters} onChange={zetFilters} aantal={pot.length} genres={genres} decennia={decennia} diensten={diensten}
            afwijkt={anders}
            actie={<button type="button" className="btn primary kassa-la-klaar" onClick={() => setLaOpen(false)} data-uitleg="kassa-la-klaar">{tr('pick.klaar')}</button>}
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
