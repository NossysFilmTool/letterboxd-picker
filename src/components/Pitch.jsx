import { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Clapperboard, Pause, Play } from 'lucide-react';
import { IMG } from '../lib/tmdb.js';
import { useT, decimaal } from '../lib/i18n.js';
import { nossyScore, fmtScore } from '../lib/pick.js';
import { beoordeelCijfer } from '../lib/opgeblazen.js';
import { useFilmkleur } from '../lib/filmkleur.js';
import { logline, pitchDuur } from '../lib/pitch.js';

// De trailers voor een veto-ronde: voordat er gestreept wordt, krijgt elke
// film een korte pitch. Het filmbeeld als doek dat langzaam inzoomt, de
// slogan erop, de titel die opkomt, waar hij over gaat, wie hem maakte en
// wie erin speelt, en de cijfers die optellen. Daarna de volgende, tot de
// ronde begint. Tik rechts voor de volgende, links voor de vorige; spatie
// pauzeert. Met "beperk beweging" staat alles stil en tik je zelf door.
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

function Trailer({ film, meta, stil }) {
  const { t: tr } = useT();
  const kleur = useFilmkleur(meta?.poster);
  const verhaal = logline(meta?.plot);
  const woorden = verhaal ? verhaal.split(' ') : [];
  const cijfers = cijfersVan(meta, tr);
  const waar = meta?.flat?.[0] || null;

  return (
    <div className="pitch-scene" style={{ '--film': kleur }}>
      <div className="pitch-doek">
        {meta?.backdrop
          ? <img src={IMG(meta.backdrop, 'w1280')} alt="" />
          : (
            <div className="pitch-doek-leeg">
              {meta?.poster ? <img src={IMG(meta.poster, 'w342')} alt="" /> : <Clapperboard size={34} strokeWidth={1.3} aria-hidden="true" />}
            </div>
          )}
        {meta?.tagline && <p className="pitch-slogan">{meta.tagline}</p>}
      </div>
      <div className="pitch-kaart">
        <div className="pitch-kop">
          {meta?.poster && meta?.backdrop && (
            <div className="pitch-poster" aria-hidden="true"><img src={IMG(meta.poster, 'w342')} alt="" /></div>
          )}
          <div className="pitch-info">
            {meta?.director && <p className="pitch-van">{tr('avond.pitchVan', { naam: meta.director })}</p>}
            <h2 className="pitch-titel"><span>{film.name}</span></h2>
            <p className="pitch-meta meta">
              {film.year ? <span>{film.year}</span> : null}
              {meta?.runtime ? <span>{meta.runtime} min</span> : null}
              {meta?.genres?.length ? <span>{meta.genres.slice(0, 3).join(', ')}</span> : null}
            </p>
          </div>
        </div>
        <p className="pitch-verhaal">
          {woorden.length
            ? woorden.map((w, j) => (
              <Fragment key={j}><span className="w" style={{ '--w': j }}>{w}</span>{j < woorden.length - 1 ? ' ' : ''}</Fragment>
            ))
            : <span className="pitch-geen">{meta ? tr('avond.pitchGeenVerhaal') : tr('avond.pitchLaden')}</span>}
        </p>
        {meta?.cast?.length ? <p className="pitch-met">{tr('avond.pitchMet', { namen: meta.cast.slice(0, 3).join(', ') })}</p> : null}
        {(cijfers.length > 0 || waar) && (
          <div className="pitch-cijfers">
            {cijfers.map((c, j) => (
              <div key={c.label} className={`pitch-cijfer${c.groot ? ' groot' : ''}${c.twijfel ? ' twijfel' : ''}`} style={{ '--c': j }}>
                <Teller waarde={c.waarde} decimalen={c.decimalen} suffix={c.suffix} vertraging={2100 + j * 140} stil={stil} />
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

export default function Pitch({ films, meta, onKlaar }) {
  const { t: tr } = useT();
  const [i, setI] = useState(0);
  const [pauze, setPauze] = useState(false);
  const [stil] = useState(stilGewenst);
  const ref = useRef(null);
  const klaarRef = useRef(onKlaar);
  klaarRef.current = onKlaar;

  const laatste = i >= films.length - 1;
  const volgende = () => { if (laatste) klaarRef.current(); else setI((x) => Math.min(films.length - 1, x + 1)); };
  const vorige = () => setI((x) => Math.max(0, x - 1));
  const stapRef = useRef({});
  stapRef.current = { volgende, vorige };

  // Toetsen: pijltjes bladeren, spatie pauzeert, Escape gaat meteen naar de ronde.
  // De pagina eronder scrolt niet mee zolang de trailers lopen.
  useEffect(() => {
    const toets = (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); stapRef.current.volgende(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); stapRef.current.vorige(); }
      else if (e.key === 'Escape') klaarRef.current();
      else if (e.key === ' ' && e.target === ref.current) { e.preventDefault(); setPauze((p) => !p); }
    };
    window.addEventListener('keydown', toets);
    const oud = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => { window.removeEventListener('keydown', toets); document.body.style.overflow = oud; };
  }, []);

  const film = films[i];
  if (!film) return null;
  const m = meta[film.key];
  const duur = pitchDuur(logline(m?.plot));

  // Tik op het beeld: links terug, de rest vooruit
  const tik = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width && e.clientX - r.left < r.width * 0.28) vorige(); else volgende();
  };

  return createPortal(
    <div ref={ref} tabIndex={-1} className={`pitch${pauze ? ' gepauzeerd' : ''}${stil ? ' stil' : ''}`}
      role="dialog" aria-modal="true" aria-label={tr('avond.pitchAria')} style={{ '--duur': `${duur}ms` }}>
      <div className="pitch-top">
        <div className="pitch-balken" aria-hidden="true">
          {films.map((f, j) => (
            <span key={f.key} className={`pitch-balk${j < i ? ' af' : ''}${j === i ? ' nu' : ''}`}>
              {j === i && !stil && (
                <span className="pitch-loop" onAnimationEnd={(e) => { if (e.target === e.currentTarget) volgende(); }} />
              )}
            </span>
          ))}
        </div>
        <span className="pitch-teller" aria-live="polite">{tr('avond.pitchTeller', { i: i + 1, n: films.length })}</span>
        <button type="button" className="linkbtn pitch-sla" onClick={() => onKlaar()}>{tr('avond.pitchOverslaan')}</button>
      </div>
      <div className="pitch-podium" onClick={tik}>
        <Trailer key={film.key} film={film} meta={m} stil={stil} />
      </div>
      <div className="pitch-bediening">
        <button type="button" className="btn ghost" onClick={vorige} disabled={i === 0}>
          <ChevronLeft size={16} /> {tr('avond.pitchVorige')}
        </button>
        {!stil && (
          <button type="button" className="btn ghost" onClick={() => setPauze((p) => !p)} aria-pressed={pauze}>
            {pauze ? <><Play size={15} /> {tr('avond.pitchVerder')}</> : <><Pause size={15} /> {tr('avond.pitchPauze')}</>}
          </button>
        )}
        <button type="button" className="btn primary" onClick={volgende}>
          {laatste ? tr('avond.pitchNaarVeto') : tr('avond.pitchVolgende')} <ChevronRight size={16} />
        </button>
      </div>
    </div>,
    document.body,
  );
}
