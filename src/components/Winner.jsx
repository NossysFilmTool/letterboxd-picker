import { useState, useEffect } from 'react';
import { Play, RefreshCw, Eye, EyeOff, Share2, ExternalLink, Clapperboard, Plus, Check } from 'lucide-react';
import { IMG } from '../lib/tmdb.js';
import { nossyScore, fmtScore, getNossyWeights } from '../lib/pick.js';
import { renderShareCard, shareOrDownload } from '../lib/extra.js';
import { useT } from '../lib/i18n.js';

const fmtVotes = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace('.', ',')}k` : n);

export default function Winner({ film, meta, context, seen, onToggleSeen, onSimilar, onReroll, onShortlist, inShortlist, onWantScores }) {
  const { t: tr } = useT();
  const [sharing, setSharing] = useState(false);
  const [plotOpen, setPlotOpen] = useState(false);
  useEffect(() => { setPlotOpen(false); }, [film?.key]);

  const share = async () => {
    setSharing(true);
    try {
      const blob = await renderShareCard(film, meta);
      if (blob) await shareOrDownload(blob, `pick-${film.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`);
    } catch (e) {
      console.warn('Deelkaart mislukt', e);
      alert(tr('winner.shareFail'));
    }
    setSharing(false);
  };

  // Letterboxd: eigen watchlist-uri indien aanwezig, anders via TMDB-id (werkt voor élke film)
  const tmdbId = meta?.id || (film.key?.startsWith('tmdb:') ? film.key.slice(5) : null);
  const lbUrl = film.uri || (tmdbId ? `https://letterboxd.com/tmdb/${tmdbId}` : null);

  return (
    <section className="winner fade-up" aria-label={tr('winner.chosenAria', { name: film.name })}>
      {meta?.backdrop && <div className="bg" style={{ backgroundImage: `url(${IMG(meta.backdrop, 'w1280')})` }} aria-hidden="true" />}
      <div className="veil" aria-hidden="true" />
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
            {[film.year, meta?.runtime ? `${meta.runtime} min` : null, meta?.genres?.slice(0, 3).join(', '), meta?.director ? `${tr('winner.regie')} ${meta.director}` : null]
              .filter(Boolean).join(' · ')}
          </p>
          {meta?.yearMismatch && (
            <p style={{ color: 'var(--dot-o)', fontSize: 12.5, marginTop: 4 }}>
              {tr('winner.yearMismatch', { want: meta.yearMismatch, got: meta.year })}
            </p>
          )}
          {(() => {
            const ns = nossyScore(meta);
            const bronnen = meta ? [meta.ext?.imdb, meta.ext?.mc, meta.vote].filter((v) => v != null).length : 0;
            const heeftNossy = ns != null && bronnen >= 2;
            const bronTitle = (() => { const w = getNossyWeights(); return tr('winner.bronTitle', { count: bronnen, imdb: w.imdb, mc: w.mc, tmdb: w.tmdb }); })();
            const heeftBronnen = meta?.ext || meta?.vote != null;
            if (!heeftNossy && !heeftBronnen) return null;
            return (
              <div className="scorehero">
                {heeftNossy && (
                  <div className="nossy-big" title={bronTitle}>
                    <span className="n">{fmtScore(ns)}</span>
                    <span className="lbl">{tr('winner.nossy')}</span>
                  </div>
                )}
                {heeftNossy && heeftBronnen && <div className="scorediv" aria-hidden="true" />}
                {heeftBronnen && (
                  <div className="sources">
                    {meta?.ext?.imdb != null && <span><b>{fmtScore(meta.ext.imdb)}</b> IMDb</span>}
                    {meta?.ext?.rt != null && <span><b>{meta.ext.rt}%</b> 🍅</span>}
                    {meta?.ext?.mc != null && <span><b>{meta.ext.mc}</b> Meta</span>}
                    {meta?.vote != null && <span><b>{fmtScore(meta.vote)}</b> TMDB <span style={{ color: 'var(--fog-dim)' }}>({fmtVotes(meta.votes)})</span></span>}
                    {!meta?.ext && onWantScores && (
                      <button type="button" className="ghost-chip" title={tr('winner.moreScoresTitle')} onClick={onWantScores}>
                        {tr('winner.moreScores')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
          {meta && (meta.flat?.length || meta.rent?.length) ? (
            <div className="provs">
              {meta.flat?.map((p) => (
                meta.jwLink
                  ? <a key={p} className="prov prov-link" href={meta.jwLink} target="_blank" rel="noreferrer" title={tr('winner.provTitle')} style={{ borderColor: 'rgba(0,224,84,0.4)' }}><span className="livedot" aria-hidden="true" />{tr('winner.nowOn', { p })}</a>
                  : <span key={p} className="prov" style={{ borderColor: 'rgba(0,224,84,0.4)' }}><span className="livedot" aria-hidden="true" />{tr('winner.nowOn', { p })}</span>
              ))}
              {!meta.flat?.length && meta.rent?.map((p) => (
                meta.jwLink
                  ? <a key={p} className="prov prov-link" href={meta.jwLink} target="_blank" rel="noreferrer" title={tr('winner.provTitle')}>{tr('winner.rentBuy', { p })}</a>
                  : <span key={p} className="prov">{tr('winner.rentBuy', { p })}</span>
              ))}
            </div>
          ) : meta?.at ? (
            <div className="provs"><span className="prov" style={{ color: 'var(--fog-dim)' }}>{tr('winner.notFoundStreaming')}</span></div>
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
          <div className="actions">
            {meta?.trailer && (
              <a className="btn primary" href={meta.trailer} target="_blank" rel="noreferrer">
                <Play size={15} /> {tr('winner.trailer')}
              </a>
            )}
            {onSimilar && (
              <button className="btn" onClick={onSimilar}><RefreshCw size={15} /> {tr('winner.moreLikeThis')}</button>
            )}
            {onToggleSeen && (
              <button className="btn" onClick={onToggleSeen}>
                {seen ? <><EyeOff size={15} /> {tr('winner.notSeenAfterAll')}</> : <><Eye size={15} /> {tr('common.seen')}</>}
              </button>
            )}
            {onShortlist && (
              <button className={`btn ${inShortlist ? '' : 'green'}`} onClick={onShortlist} disabled={inShortlist}>
                {inShortlist ? <><Check size={15} /> {tr('winner.onShortlist')}</> : <><Plus size={15} /> {tr('common.shortlist')}</>}
              </button>
            )}
            <button className="btn" onClick={share} disabled={sharing}>
              <Share2 size={15} /> {sharing ? tr('winner.makingCard') : tr('winner.share')}
            </button>
            {lbUrl && (
              <a className="btn ghost" href={lbUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Letterboxd</a>
            )}
          </div>
          {onReroll && (
            <div style={{ marginTop: 18 }}>
              <button className="btn ghost" onClick={onReroll}>{tr('winner.rerollMood')}</button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
