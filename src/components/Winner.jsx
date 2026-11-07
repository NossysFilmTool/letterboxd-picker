import { useState, useEffect } from 'react';
import { Play, RefreshCw, Eye, EyeOff, Share2, Clapperboard, Plus, Check, X } from 'lucide-react';
import { IMG } from '../lib/tmdb.js';
import { imdbLink, jwLink } from '../lib/links.js';
import { nossyScore, fmtScore, getNossyWeights } from '../lib/pick.js';
import { renderShareCard, shareOrDownload } from '../lib/extra.js';
import { useT } from '../lib/i18n.js';
import Sterren from './Sterren.jsx';
import { beoordeelCijfer } from '../lib/opgeblazen.js';
import { useFilmkleur } from '../lib/filmkleur.js';
import Kaartje from './Kaartje.jsx';

const fmtVotes = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace('.', ',')}k` : n);

// onGezien(sterren | null): een film van buiten je lijst als gezien markeren
// kaartje: aantal personen; dan is het een pick en krijg je een bioscoopkaartje
// onKijken: je klikte door naar een dienst of deelde het kaartje (een hint
// voor de vraag na de avond, geen bewijs dat je keek)
export default function Winner({ film, meta, context, seen, onToggleSeen, onSimilar, onReroll, onShortlist, inShortlist, onSkip, onGezien, onWantScores, kaartje, onKijken }) {
  const { t: tr, lang } = useT();
  const [sharing, setSharing] = useState(false);
  const [plotOpen, setPlotOpen] = useState(false);
  const [sterrenOpen, setSterrenOpen] = useState(false);
  useEffect(() => { setPlotOpen(false); setSterrenOpen(false); }, [film?.key]);
  // De kaart neemt de kleur van de film aan (uit de poster)
  const kleur = useFilmkleur(meta?.poster);

  const share = async () => {
    setSharing(true);
    try {
      const blob = await renderShareCard(film, meta);
      if (blob) { await shareOrDownload(blob, `pick-${film.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`); onKijken?.(); }
    } catch (e) {
      console.warn('Deelkaart mislukt', e);
      alert(tr('winner.shareFail'));
    }
    setSharing(false);
  };

  // Letterboxd: eigen watchlist-uri indien aanwezig, anders via TMDB-id (werkt voor élke film)
  const tmdbId = meta?.id || (film.key?.startsWith('tmdb:') ? film.key.slice(5) : null);
  const lbUrl = film.uri || (tmdbId ? `https://letterboxd.com/tmdb/${tmdbId}` : null);

  const eindtijd = meta?.runtime
    ? new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' }).format(new Date(Date.now() + meta.runtime * 60000))
    : null;
  // De hoofdknop: op je shortlist (ontdekken), anders de trailer
  const shortlistHoofd = !!onShortlist && !inShortlist;

  // De cijfers als grote getallen met een klein label eronder
  const cijfers = (() => {
    const ns = nossyScore(meta);
    const bronnen = meta ? [meta.ext?.imdb, meta.ext?.mc, meta.vote].filter((v) => v != null).length : 0;
    const heeftNossy = ns != null && bronnen >= 2;
    const bronTitle = (() => { const w = getNossyWeights(); return tr('winner.bronTitle', { count: bronnen, imdb: w.imdb, mc: w.mc, tmdb: w.tmdb }); })();
    const heeftBronnen = meta?.ext || meta?.vote != null;
    if (!heeftNossy && !heeftBronnen) return null;
    return (
      <div className="wcijfers">
        {heeftNossy && (
          <div className="wcijfer nossy-big" title={bronTitle}>
            <span className="n">{fmtScore(ns)}</span>
            <span className="lbl">{tr('winner.nossy')}</span>
          </div>
        )}
        {meta?.ext?.imdb != null && <div className="wcijfer"><span className="n">{fmtScore(meta.ext.imdb)}</span><span className="lbl">IMDb</span></div>}
        {meta?.ext?.mc != null && <div className="wcijfer"><span className="n">{meta.ext.mc}</span><span className="lbl">Metacritic</span></div>}
        {meta?.ext?.rt != null && <div className="wcijfer"><span className="n">{meta.ext.rt}%</span><span className="lbl">Rotten Tomatoes</span></div>}
        {meta?.vote != null && <div className="wcijfer"><span className="n">{fmtScore(meta.vote)}</span><span className="lbl">TMDB, {tr('winner.stemmen', { n: fmtVotes(meta.votes) })}</span></div>}
        {!meta?.ext && onWantScores && (
          <button type="button" className="ghost-chip" title={tr('winner.moreScoresTitle')} onClick={onWantScores}>
            {tr('winner.moreScores')}
          </button>
        )}
      </div>
    );
  })();

  return (
    <section className={`winner${kaartje ? ' met-kaartje' : ''}`} style={{ '--film': kleur }} aria-label={tr('winner.chosenAria', { name: film.name })}>
      {kaartje ? (
        // Een pick: je krijgt een kaartje
        <>
          <p className="wcontext">{context || tr('winner.eyebrow')}</p>
          <Kaartje film={film} meta={meta} personen={kaartje} kleur={kleur} />
          {meta?.yearMismatch && (
            <p className="wwaarschuwing">{tr('winner.yearMismatch', { want: meta.yearMismatch, got: meta.year })}</p>
          )}
          {cijfers}
        </>
      ) : (
      // De filmkaart: het filmbeeld als doek, de kop in de kleur van de film
      <div className="wkop">
        {meta?.backdrop && (
          <div className="wdoek"><img src={IMG(meta.backdrop, 'w1280')} alt="" /></div>
        )}
        <div className="inner">
          <div className="wposter">
            <div className="poster">
              {meta?.poster ? <img src={IMG(meta.poster, 'w342')} alt={tr('common.posterAlt', { name: film.name })} /> : <Clapperboard size={30} strokeWidth={1.4} aria-hidden="true" />}
            </div>
          </div>
          <div className="winfo">
            <p className="eyebrow">{context || tr('winner.eyebrow')}</p>
            <h2 className="wtitle">{film.name}</h2>
            <p className="wmeta">
              {film.year ? <span>{film.year}</span> : null}
              {meta?.runtime ? <span>{meta.runtime} min</span> : null}
              {eindtijd ? <span>{tr('winner.endTime', { t: eindtijd })}</span> : null}
              {meta?.director ? <span>{tr('winner.regie')} {meta.director}</span> : null}
              {meta?.cast?.length ? <span>{tr('kaartje.aftitelingCast', { namen: meta.cast.slice(0, 2).join(', ') })}</span> : null}
              {meta?.genres?.length ? <span>{meta.genres.slice(0, 3).join(', ')}</span> : null}
            </p>
            {meta?.yearMismatch && (
              <p className="wwaarschuwing">{tr('winner.yearMismatch', { want: meta.yearMismatch, got: meta.year })}</p>
            )}
          </div>
        </div>
        {cijfers}
      </div>
      )}
      <div className="wonder">
          {(() => {
            // Een opgeblazen TMDB-cijfer (fans of bots): zeg het eerlijk. Met
            // IMDb als tweede mening: bevestigd (niets melden) of rechtgezet.
            const oordeel = beoordeelCijfer(meta);
            if (!oordeel.opgeblazen) return null;
            const fmt = (v) => (lang === 'nl' ? String(v).replace('.', ',') : String(v));
            const waarom = oordeel.opgeblazen === 'onmogelijk'
              ? tr('winner.opgeblazenOnmogelijk', { cijfer: fmt(meta.vote), stemmen: meta.votes })
              : tr(oordeel.opgeblazen === 'lijsten' ? 'winner.opgeblazenLijsten' : 'winner.opgeblazenStreaming');
            return (
              <p className="opgeblazen-melding">
                {oordeel.cijfer != null ? tr('winner.opgeblazenImdb', { waarom, imdb: fmt(oordeel.cijfer) }) : tr('winner.opgeblazen', { waarom })}
              </p>
            );
          })()}
          {/* Eén hoofdknop; de rest is rustige tekst */}
          <div className="wacties">
            {shortlistHoofd && (
              <button type="button" className="btn primary" onClick={onShortlist}><Plus size={16} /> {tr('common.shortlist')}</button>
            )}
            {meta?.trailer && (
              <a className={`btn ${shortlistHoofd ? '' : 'primary'}`} href={meta.trailer} target="_blank" rel="noreferrer">
                <Play size={15} /> {tr('winner.trailer')}
              </a>
            )}
            {onShortlist && inShortlist && (
              <span className="wstatus"><Check size={15} /> {tr('winner.onShortlist')}</span>
            )}
            {onSimilar && (
              <button type="button" className="wknop" onClick={onSimilar}><RefreshCw size={15} /> {tr('winner.moreLikeThis')}</button>
            )}
            {onToggleSeen && (
              <button type="button" className="wknop" onClick={onToggleSeen}>
                {seen ? <><EyeOff size={15} /> {tr('winner.notSeenAfterAll')}</> : <><Eye size={15} /> {tr('common.seen')}</>}
              </button>
            )}
            {onGezien && (
              <button type="button" className="wknop" onClick={() => setSterrenOpen((v) => !v)} aria-expanded={sterrenOpen}><Eye size={15} /> {tr('verken.gezienKort')}</button>
            )}
            {onSkip && (
              <button type="button" className="wknop zacht" onClick={onSkip}><X size={15} /> {tr('verken.notForMe')}</button>
            )}
            <button type="button" className="wknop zacht" onClick={share} disabled={sharing}>
              <Share2 size={15} /> {sharing ? tr('winner.makingCard') : tr('winner.share')}
            </button>
          </div>
          {sterrenOpen && onGezien && (
            <div className="kaart-sterren">
              <span>{tr('verken.welkeSterren')}</span>
              <Sterren onKies={(n) => { setSterrenOpen(false); onGezien(n); }} />
              <button type="button" className="linkbtn" onClick={() => { setSterrenOpen(false); onGezien(null); }}>{tr('verken.zonderSterren')}</button>
            </div>
          )}
          {/* Waar te zien, als gewone tekst */}
          {meta && (meta.flat?.length || meta.rent?.length) ? (
            <p className="provs">
              {meta.flat?.map((p) => (
                meta.jwLink
                  ? <a key={p} className="prov prov-link" href={meta.jwLink} target="_blank" rel="noreferrer" title={tr('winner.provTitle')} onClick={() => onKijken?.()}><span className="livedot" aria-hidden="true" />{tr('winner.nowOn', { p })}</a>
                  : <span key={p} className="prov"><span className="livedot" aria-hidden="true" />{tr('winner.nowOn', { p })}</span>
              ))}
              {!meta.flat?.length && meta.rent?.map((p) => (
                meta.jwLink
                  ? <a key={p} className="prov prov-link" href={meta.jwLink} target="_blank" rel="noreferrer" title={tr('winner.provTitle')} onClick={() => onKijken?.()}>{tr('winner.rentBuy', { p })}</a>
                  : <span key={p} className="prov">{tr('winner.rentBuy', { p })}</span>
              ))}
            </p>
          ) : meta?.at ? (
            <p className="provs"><span className="prov geen">{tr('winner.notFoundStreaming')}</span></p>
          ) : null}
          {meta?.plot && (
            meta.plot.length > 280
              ? (
                <p className="wplot">
                  {plotOpen ? meta.plot : meta.plot.slice(0, 260).replace(/\s+\S*$/, '') + '… '}
                  <button className="linkbtn" onClick={() => setPlotOpen((v) => !v)} style={{ marginLeft: plotOpen ? 6 : 0 }}>
                    {plotOpen ? tr('winner.less') : tr('winner.more')}
                  </button>
                </p>
              )
              : <p className="wplot">{meta.plot}</p>
          )}
          <p className="wlinks">
            {lbUrl && <a href={lbUrl} target="_blank" rel="noreferrer">Letterboxd</a>}
            <a href={imdbLink(meta, film)} target="_blank" rel="noreferrer">IMDb</a>
            <a href={jwLink(meta, film)} target="_blank" rel="noreferrer">JustWatch</a>
          </p>
          {onReroll && (
            <div>
              <button className="btn ghost" onClick={onReroll}>{tr('winner.rerollMood')}</button>
            </div>
          )}
      </div>
    </section>
  );
}
