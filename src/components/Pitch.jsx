import { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Clapperboard, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { IMG, fetchStills } from '../lib/tmdb.js';
import { useT, decimaal } from '../lib/i18n.js';
import { nossyScore, fmtScore } from '../lib/pick.js';
import { beoordeelCijfer } from '../lib/opgeblazen.js';
import { useFilmkleur } from '../lib/filmkleur.js';
import { logline, trailerPlan } from '../lib/pitch.js';
import { zetGeluid, startRatel, stopRatel, pauzeerRatel, klak, zoef, dreun, braam, ontgrendel } from '../lib/zaalgeluid.js';

// De trailers voor een veto-ronde: voordat er gestreept wordt, gaat de zaal
// donker. Het zaallicht dimt, de projector slaat aan, en elke film krijgt een
// trailer volgens een draaiboek (lib/pitch.js trailerPlan): een shot met de
// slogan, een zwarte kaart "Een film van", een shot met de namen, dan slaat
// de titel in beeld en schuift eronder waar hij over gaat, wie erin speelt en
// de cijfers. Het doek geeft licht op de zaal, er hangt stof in de bundel, en
// onderin staan de stoelen. Tik op het doek om de akten over te slaan, nog
// eens voor de volgende film; links tikken gaat terug. Spatie pauzeert. Na
// de laatste gaat het licht weer aan. Met "beperk beweging" staat alles
// stil, zonder geluid, en tik je zelf door.
const stilGewenst = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Een cijfer dat optelt van nul. Schermlezers horen meteen het echte cijfer.
function Teller({ waarde, decimalen, suffix = '', vertraging, stil }) {
  const [v, setV] = useState(stil ? waarde : 0);
  useEffect(() => {
    if (stil || typeof requestAnimationFrame !== 'function') { setV(waarde); return undefined; }
    const DUUR = 900;
    let raf;
    let start = null;
    const tick = (nu) => {
      if (start == null) start = nu;
      const p = Math.min(1, (nu - start) / DUUR);
      setV(waarde * (1 - (1 - p) ** 3));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    const t = setTimeout(() => { raf = requestAnimationFrame(tick); }, vertraging);
    // Vangnet: stilvallende frames (tab op de achtergrond) laten het eindcijfer staan
    const vangnet = setTimeout(() => setV(waarde), vertraging + DUUR + 800);
    return () => { clearTimeout(t); clearTimeout(vangnet); cancelAnimationFrame(raf); };
  }, [waarde, vertraging, stil]);
  const tekst = decimalen ? decimaal(v.toFixed(decimalen)) : String(Math.round(v));
  return <span className="n" aria-hidden="true">{tekst}{suffix}</span>;
}

// De cijfers van een film, als { waarde, decimalen, suffix, label, twijfel }
function cijfersVan(meta, tr) {
  if (!meta) return [];
  const uit = [];
  const ns = nossyScore(meta);
  const bronnen = [meta.ext?.imdb, meta.ext?.mc, meta.vote].filter((v) => v != null).length;
  if (ns != null && bronnen >= 2) uit.push({ waarde: ns, decimalen: 1, label: tr('winner.nossy'), groot: true });
  if (meta.ext?.imdb != null) uit.push({ waarde: meta.ext.imdb, decimalen: 1, label: 'IMDb' });
  if (meta.ext?.rt != null) uit.push({ waarde: meta.ext.rt, decimalen: 0, suffix: '%', label: 'Rotten Tomatoes' });
  if (meta.vote != null) {
    // Een opgeblazen TMDB-cijfer (fans of bots) tellen we niet op als feit
    const twijfel = !!beoordeelCijfer(meta).opgeblazen;
    uit.push({ waarde: meta.vote, decimalen: 1, label: twijfel ? tr('avond.pitchTmdbTwijfel') : 'TMDB', twijfel });
  }
  return uit;
}

// Andere beelden uit elke film, voor de shots. Een keer per film per sessie.
const stillsGeheugen = new Map();
function useStills(films, meta, sleutel) {
  const [versie, setVersie] = useState(0);
  const ids = films.map((f) => meta[f.key]?.id || '').join(',');
  useEffect(() => {
    if (!sleutel) return undefined;
    let weg = false;
    films.forEach((f) => {
      const m = meta[f.key];
      if (!m?.id || stillsGeheugen.has(m.id)) return;
      stillsGeheugen.set(m.id, null);
      Promise.resolve()
        .then(() => fetchStills(m.id, sleutel, m.backdrop))
        .then((paden) => { stillsGeheugen.set(m.id, paden); if (!weg) setVersie((x) => x + 1); })
        .catch(() => stillsGeheugen.set(m.id, []));
    });
    return () => { weg = true; };
  }, [ids, sleutel]); // eslint-disable-line react-hooks/exhaustive-deps
  return { stillsVan: (id) => (id && stillsGeheugen.get(id)) || null, versie };
}

// Een akte van de trailer: alleen in beeld tussen --start en --start + --len
function Akte({ akte, meta, beeld, stijl, onStart }) {
  const { t: tr } = useT();
  const { soort } = akte;
  const metBeeld = soort !== 'van' && !!beeld;
  return (
    <div className={`akte venster soort-${soort}${metBeeld ? ' met-beeld' : ''}`} style={stijl} onAnimationStart={onStart}>
      {metBeeld && <img className="akte-beeld" src={beeld} alt="" style={{ '--o': soort === 'met' ? '76% 52%' : '24% 38%' }} />}
      {soort === 'slogan' && <p className="akte-slogan">{meta.tagline}</p>}
      {soort === 'van' && (
        <p className="akte-kaart"><span>{tr('avond.pitchVanKop')}</span><strong>{meta.director}</strong></p>
      )}
      {soort === 'met' && (
        <p className="akte-kaart akte-namen">
          <span>{tr('avond.pitchMetKop')}</span>
          {meta.cast.slice(0, 3).map((n) => <strong key={n}>{n}</strong>)}
        </p>
      )}
    </div>
  );
}

function Trailer({ film, meta, plan, sprong, stil, stills: stillsNu, eerste, onPaneel }) {
  const { t: tr } = useT();
  // De shots liggen vast bij de eerste snit: geen ander beeld midden in een akte
  const [stills] = useState(stillsNu);
  const verhaal = logline(meta?.plot);
  const woorden = verhaal ? verhaal.split(' ') : [];
  const cijfers = cijfersVan(meta, tr);
  const waar = meta?.flat?.[0] || null;
  const ms = (x) => `${x - sprong}ms`;
  const beeld = meta?.backdrop ? IMG(meta.backdrop, 'w1280') : null;
  const shot = (j) => (stills?.[j] ? IMG(stills[j], 'w780') : beeld);
  // Overgeslagen of stil: meteen het eindbeeld
  const akten = stil || sprong > 0 ? [] : plan.akten;
  const geluidBij = (soort) => (e) => {
    if (e.target !== e.currentTarget || e.elapsedTime > 0.2) return;
    if (soort === 'van') dreun(); else zoef();
  };

  return (
    <div className={`pitch-scene${sprong ? '' : ' snit'}${eerste && !sprong ? ' eerste' : ''}`}
      style={{ '--nul': ms(0), '--titel': ms(plan.titel), '--paneel': ms(plan.paneel) }}>
      <div className="pitch-gloed" aria-hidden="true"
        style={meta?.backdrop ? { backgroundImage: `url(${IMG(meta.backdrop, 'w300')})` } : undefined} />
      {akten.filter((a) => a.soort === 'van').map((a) => (
        <div key={a.start} className="pitch-donker venster" aria-hidden="true" style={{ '--start': ms(a.start), '--len': `${a.duur}ms` }} />
      ))}
      {!stil && <div className="pitch-kamerflits" aria-hidden="true" />}
      <div className="pitch-scherm">
        <div className="pitch-straal" aria-hidden="true" />
        <div className="pitch-doek">
          <div className="pitch-weef">
            <div className="pitch-beeld">
              {beeld
                ? <img src={beeld} alt="" />
                : (
                  <div className="pitch-doek-leeg">
                    {meta?.poster ? <img src={IMG(meta.poster, 'w342')} alt="" /> : <Clapperboard size={34} strokeWidth={1.3} aria-hidden="true" />}
                  </div>
                )}
            </div>
            <div className="pitch-titelkaart">
              {meta?.tagline && <p className="pitch-slogan">{meta.tagline}</p>}
              <h2 className="pitch-titel"><span>{film.name}</span></h2>
            </div>
            {akten.length > 0 && (
              <div className="pitch-akten venster" aria-hidden="true" style={{ '--start': ms(0), '--len': `${plan.titel}ms` }}>
                {akten.map((a, j) => (
                  <Akte key={a.start} akte={a} meta={meta} beeld={shot(a.soort === 'met' ? 1 : 0)} onStart={geluidBij(a.soort)}
                    stijl={{ '--start': ms(a.start), '--len': `${a.duur}ms`, zIndex: j + 1 }} />
                ))}
              </div>
            )}
          </div>
          {!stil && (
            <span className="pitch-flits" aria-hidden="true"
              onAnimationStart={(e) => { if (e.target === e.currentTarget && e.elapsedTime < 0.2) braam(); }} />
          )}
          <span className="pitch-korrel" aria-hidden="true" />
          <span className="pitch-flikker" aria-hidden="true" />
        </div>
      </div>
      <div className="pitch-kaart" onAnimationStart={(e) => { if (e.target === e.currentTarget) onPaneel(); }}>
        <div className="pitch-kop">
          {meta?.poster && meta?.backdrop && (
            <div className="pitch-poster" aria-hidden="true"><img src={IMG(meta.poster, 'w342')} alt="" /></div>
          )}
          <div className="pitch-info">
            {meta?.director && <p className="pitch-van">{tr('avond.pitchVan', { naam: meta.director })}</p>}
            <p className="pitch-meta meta">
              {film.year ? <span>{film.year}</span> : null}
              {meta?.runtime ? <span>{meta.runtime} min</span> : null}
              {meta?.genres?.length ? <span>{meta.genres.slice(0, 3).join(', ')}</span> : null}
            </p>
            {meta?.cast?.length ? <p className="pitch-met">{tr('avond.pitchMet', { namen: meta.cast.slice(0, 3).join(', ') })}</p> : null}
          </div>
        </div>
        <p className="pitch-verhaal">
          {woorden.length
            ? woorden.map((w, j) => (
              <Fragment key={j}><span className="w" style={{ '--w': j }}>{w}</span>{j < woorden.length - 1 ? ' ' : ''}</Fragment>
            ))
            : <span className="pitch-geen">{meta ? tr('avond.pitchGeenVerhaal') : tr('avond.pitchLaden')}</span>}
        </p>
        {(cijfers.length > 0 || waar) && (
          <div className="pitch-cijfers">
            {cijfers.map((c, j) => (
              <div key={c.label} className={`pitch-cijfer${c.groot ? ' groot' : ''}${c.twijfel ? ' twijfel' : ''}`} style={{ '--c': j }}>
                <Teller waarde={c.waarde} decimalen={c.decimalen} suffix={c.suffix} vertraging={Math.max(0, plan.paneel + 1000 + j * 140 - sprong)} stil={stil} />
                <span className="sr-only">{c.decimalen ? fmtScore(c.waarde) : c.waarde}{c.suffix || ''}</span>
                <span className="lbl">{c.label}</span>
              </div>
            ))}
            {waar && <p className="pitch-waar"><span className="livedot" aria-hidden="true" />{tr('winner.nowOn', { p: waar })}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// Voor de eerste trailer: het zaallicht dimt, en even staat er wat er komt
function Intro({ kop, sub, onKlaar }) {
  return (
    <div className="pitch-intro" onAnimationEnd={(e) => { if (e.target === e.currentTarget) onKlaar(); }}>
      <p className="pitch-intro-kop">{kop}</p>
      <p className="pitch-intro-sub">{sub}</p>
    </div>
  );
}

//   films, meta, onKlaar: klaar met kijken (de ronde begint)
//   tmdbKey: voor extra beelden per film; geluid + onGeluid(aan): het zaalgeluid
//   teksten: eigen woorden voor een ander voorprogramma (de trailer voor je
//   pick): { introKop, overslaan, naarEinde, aria }
export default function Pitch({ films, meta, onKlaar, tmdbKey, geluid = false, onGeluid, teksten = {} }) {
  const { t: tr } = useT();
  const tekst = {
    introKop: tr('avond.pitchIntroKop', { count: films.length }),
    introSub: tr('avond.pitchIntroSub'),
    overslaan: tr('avond.pitchOverslaan'),
    naarEinde: tr('avond.pitchNaarVeto'),
    aria: tr('avond.pitchAria'),
    ...teksten,
  };
  const [stil] = useState(stilGewenst);
  // 'intro' (licht gaat uit) | 'trailers' | 'uit' (licht gaat aan)
  const [fase, setFase] = useState(stil ? 'trailers' : 'intro');
  // i: welke film; sprong: hoeveel ms van deze trailer is overgeslagen
  const [stand, setStand] = useState({ i: 0, sprong: 0 });
  const [pauze, setPauze] = useState(false);
  const ref = useRef(null);
  const paneelRef = useRef(false);
  const klaarRef = useRef(onKlaar);
  klaarRef.current = onKlaar;
  const { stillsVan, versie } = useStills(films, meta, tmdbKey);

  const { i, sprong } = stand;
  const film = films[i];
  const m = film ? meta[film.key] : null;
  const kleur = useFilmkleur(m?.poster);
  const plan = trailerPlan({ slogan: m?.tagline, regie: m?.director, cast: m?.cast, tekst: logline(m?.plot) });

  const laatste = i >= films.length - 1;
  const sluit = (direct) => {
    if (direct || stil) { stopRatel(); klaarRef.current(); } else setFase('uit');
  };
  const naar = (j) => { paneelRef.current = false; setStand({ i: j, sprong: 0 }); };
  const volgende = () => { if (laatste) sluit(false); else naar(i + 1); };
  const vorige = () => naar(Math.max(0, i - 1));
  const begin = () => setFase('trailers');
  const stapRef = useRef({});
  stapRef.current = { volgende, vorige, begin, fase };

  // Toetsen: pijltjes bladeren, spatie pauzeert, Escape gaat meteen naar de ronde.
  // De pagina eronder scrolt niet mee zolang de trailers lopen.
  useEffect(() => {
    const toets = (e) => {
      const s = stapRef.current;
      if (e.key === 'Escape') { stopRatel(); klaarRef.current(); return; }
      if (s.fase === 'uit') return;
      if (e.key === 'ArrowRight') { e.preventDefault(); if (s.fase === 'intro') s.begin(); else s.volgende(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); if (s.fase === 'trailers') s.vorige(); }
      else if (e.key === ' ' && e.target === ref.current) { e.preventDefault(); setPauze((p) => !p); }
    };
    window.addEventListener('keydown', toets);
    const oud = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => { window.removeEventListener('keydown', toets); document.body.style.overflow = oud; stopRatel(); };
  }, []);

  // Het geluid: de projector ratelt zolang de trailers lopen
  useEffect(() => { zetGeluid(geluid && !stil); }, [geluid, stil]);
  useEffect(() => {
    if (fase === 'trailers' && geluid && !stil) { klak(); startRatel(); }
    if (fase === 'uit') stopRatel();
  }, [fase, geluid, stil]);
  useEffect(() => { pauzeerRatel(pauze); }, [pauze]);

  // Licht aan: na de animatie naar de ronde, met een vangnet
  useEffect(() => {
    if (fase !== 'uit') return undefined;
    const t = setTimeout(() => klaarRef.current(), 1600);
    return () => clearTimeout(t);
  }, [fase]);

  // De beelden van deze en de volgende film alvast laden
  useEffect(() => {
    if (typeof Image === 'undefined') return;
    [films[i], films[i + 1]].forEach((f) => {
      const mm = f && meta[f.key];
      if (!mm) return;
      const urls = [mm.backdrop && IMG(mm.backdrop, 'w1280'), ...(stillsVan(mm.id) || []).slice(0, 2).map((p) => IMG(p, 'w780'))];
      urls.filter(Boolean).forEach((u) => { const im = new Image(); im.src = u; });
    });
  }, [i, versie]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!film) return null;

  // Tik op het doek: links terug; anders eerst de akten overslaan, dan door
  const tik = (e) => {
    if (fase === 'intro') { begin(); return; }
    if (fase !== 'trailers') return;
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width && e.clientX - r.left < r.width * 0.28) { vorige(); return; }
    if (!stil && !paneelRef.current && sprong < plan.paneel) {
      paneelRef.current = true;
      setStand({ i, sprong: plan.paneel });
      return;
    }
    volgende();
  };

  return createPortal(
    <div ref={ref} tabIndex={-1} className={`pitch fase-${fase}${pauze ? ' gepauzeerd' : ''}${stil ? ' stil' : ''}`}
      role="dialog" aria-modal="true" aria-label={tekst.aria} style={{ '--film': kleur, '--duur': `${plan.totaal}ms` }}>
      <div className="pitch-zaallicht" aria-hidden="true"
        onAnimationEnd={(e) => { if (fase === 'uit' && e.target === e.currentTarget) klaarRef.current(); }} />
      <div className="pitch-top">
        <div className="pitch-balken" aria-hidden="true">
          {films.map((f, j) => (
            <span key={f.key} className={`pitch-balk${j < i ? ' af' : ''}${j === i ? ' nu' : ''}`}>
              {j === i && !stil && fase === 'trailers' && (
                <span key={`${f.key}:${sprong}`} className="pitch-loop" style={{ animationDelay: `${-sprong}ms` }}
                  onAnimationEnd={(e) => { if (e.target === e.currentTarget) volgende(); }} />
              )}
            </span>
          ))}
        </div>
        {films.length > 1 && <span className="pitch-teller" aria-live="polite">{tr('avond.pitchTeller', { i: i + 1, n: films.length })}</span>}
        {!stil && onGeluid && (
          <button type="button" className="linkbtn pitch-geluid" aria-pressed={geluid}
            aria-label={geluid ? tr('avond.pitchGeluidUit') : tr('avond.pitchGeluidAan')}
            title={geluid ? tr('avond.pitchGeluidUit') : tr('avond.pitchGeluidAan')}
            onClick={() => { ontgrendel(); onGeluid(!geluid); }}>
            {geluid ? <Volume2 size={17} /> : <VolumeX size={17} />}
          </button>
        )}
        <button type="button" className="linkbtn pitch-sla" onClick={() => sluit(true)}>{tekst.overslaan}</button>
      </div>
      <div className="pitch-podium" onClick={tik}>
        {fase === 'intro'
          ? <Intro kop={tekst.introKop} sub={tekst.introSub} onKlaar={begin} />
          : (
            <Trailer key={`${film.key}:${sprong}`} film={film} meta={m} plan={plan} sprong={sprong} stil={stil}
              stills={stillsVan(m?.id)} eerste={i === 0} onPaneel={() => { paneelRef.current = true; }} />
          )}
      </div>
      <div className="pitch-bediening">
        <span className="pitch-stoelen" aria-hidden="true" />
        {films.length > 1 && (
          <button type="button" className="btn ghost" onClick={vorige} disabled={i === 0 || fase !== 'trailers'}>
            <ChevronLeft size={16} /> {tr('avond.pitchVorige')}
          </button>
        )}
        {!stil && (
          <button type="button" className="btn ghost" onClick={() => setPauze((p) => !p)} aria-pressed={pauze}>
            {pauze ? <><Play size={15} /> {tr('avond.pitchVerder')}</> : <><Pause size={15} /> {tr('avond.pitchPauze')}</>}
          </button>
        )}
        <button type="button" className="btn primary" onClick={volgende} disabled={fase !== 'trailers'}>
          {laatste ? tekst.naarEinde : tr('avond.pitchVolgende')} <ChevronRight size={16} />
        </button>
      </div>
    </div>,
    document.body,
  );
}
