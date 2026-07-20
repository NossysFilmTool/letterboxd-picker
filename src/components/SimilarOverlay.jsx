import { useEffect, useState } from 'react';
import { X, Plus, Check, Sparkles, ArrowLeft } from 'lucide-react';
import { useT } from '../lib/i18n.js';
import { IMG, fetchDetailById } from '../lib/tmdb.js';
import Winner from './Winner.jsx';
import { smartSimilar } from '../lib/similar.js';
import { lbLink, jwLink } from '../lib/links.js';
import ImdbA from './ImdbA.jsx';
import { fmtScore } from '../lib/pick.js';

// De slimme aanrader als overlay: vertrekt vanaf één film en legt per
// suggestie uit waarom die erbij staat.
export default function SimilarOverlay({ seed, seedMeta, app, onClose }) {
  const { t: tr } = useT();
  const [status, setStatus] = useState('laden'); // laden | klaar | leeg
  const [data, setData] = useState(null);
  // Doorklikken naar de volwaardige filmkaart, binnen de overlay
  const [detailF, setDetailF] = useState(null);
  const [detailMeta, setDetailMeta] = useState(null);

  useEffect(() => {
    let dood = false;
    setDetailF(null);
    setDetailMeta(null);
    const seenKeys = new Set(app.seenSet);
    const watchlistKeys = new Set(app.watchlist.map((f) => f.key));
    smartSimilar(seed, seedMeta, {
      tmdbKey: app.tmdbKey, taste: app.taste, seenKeys, watchlistKeys,
    }).then((r) => {
      if (dood) return;
      setData(r);
      setStatus(r.results.length ? 'klaar' : 'leeg');
    }).catch(() => { if (!dood) setStatus('leeg'); });
    return () => { dood = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed?.key]);

  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const shortIds = new Set((app.shortlist || []).map((s) => s.id));
  const openFilm = async (f) => {
    setDetailF(f);
    setDetailMeta(null);
    try { setDetailMeta(await fetchDetailById(f.id, app.tmdbKey)); } catch { /* kaart op lichte data */ }
  };
  const reden = (r) => {
    if (r.type === 'themes') return tr('similar.shares', { themes: r.themes.join(', ') });
    if (r.type === 'tasteThemes') return tr('similar.tasteThemes', { themes: r.themes.join(', ') });
    if (r.type === 'genres') return tr('similar.genres', { genres: r.genres.join(' & ') });
    if (r.type === 'quality') return tr('similar.quality', { score: fmtScore(r.score) });
    if (r.type === 'lang') return tr('similar.lang');
    return '';
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={tr('similar.title', { name: seed.name })}
      style={{ position: 'fixed', inset: 0, background: 'rgba(10, 13, 16, 0.88)', backdropFilter: 'blur(4px)', zIndex: 60, overflowY: 'auto', padding: '30px 16px' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="wrap" style={{ maxWidth: 860, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400 }}>
            <Sparkles size={20} style={{ verticalAlign: -2, color: 'var(--dot-o)' }} /> {tr('similar.title', { name: seed.name })}
          </h1>
          <button className="btn ghost" style={{ marginLeft: 'auto' }} onClick={onClose}><X size={15} /> {tr('similar.close')}</button>
        </div>
        {detailF && (
          <div>
            <button className="btn ghost" style={{ marginBottom: 14 }} onClick={() => { setDetailF(null); setDetailMeta(null); }}>
              <ArrowLeft size={15} /> {tr('similar.back')}
            </button>
            <Winner
              film={{ key: `tmdb:${detailF.id}`, name: detailF.title, year: detailF.year, uri: '' }}
              meta={detailMeta || { poster: detailF.poster, vote: detailF.vote, genres: [] }}
              context={tr('similar.viaRecommender')}
              onShortlist={!detailF.opWatchlist && !shortIds.has(detailF.id)
                ? () => app.setShortlist((s) => [...s, { id: detailF.id, title: detailF.title, year: detailF.year, poster: detailF.poster, vote: detailF.vote, seeds: [seed.name], genre_ids: detailF.genre_ids }])
                : undefined}
              inShortlist={shortIds.has(detailF.id)}
              onSimilar={() => app.openSimilar({ key: `tmdb:${detailF.id}`, name: detailF.title, year: detailF.year }, detailMeta || { id: detailF.id, genres: [], keywords: [] })}
            />
          </div>
        )}
        {!detailF && data?.seedThemes?.length > 0 && (
          <p style={{ color: 'var(--fog-dim)', fontSize: 13, marginBottom: 16 }}>{tr('similar.seedThemes', { themes: data.seedThemes.join(', ') })}</p>
        )}
        {!detailF && status === 'laden' && <p style={{ color: 'var(--fog)' }}><span className="livedot" aria-hidden="true" style={{ marginRight: 8 }} />{tr('similar.loading')}</p>}
        {!detailF && status === 'leeg' && <p style={{ color: 'var(--fog)' }}>{tr('similar.none')}</p>}
        {!detailF && status === 'klaar' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 14 }}>
            {data.results.map((f) => (
              <div key={f.id} className="card" style={{ padding: 12 }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button style={{ width: 64, flexShrink: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }} onClick={() => openFilm(f)} aria-label={tr('common.openAria', { title: f.title })}>
                    {f.poster ? <img src={IMG(f.poster, 'w185')} alt="" loading="lazy" style={{ width: '100%', borderRadius: 6 }} /> : <div style={{ width: 64, height: 96, borderRadius: 6, background: 'var(--ink)' }} />}
                  </button>
                  <div style={{ minWidth: 0 }}>
                    <button style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }} onClick={() => openFilm(f)}>
                      <p style={{ color: 'var(--paper)', fontWeight: 600, fontSize: 14.5, lineHeight: 1.25 }}>{f.title}{f.year ? ` (${f.year})` : ''}</p>
                    </button>
                    {f.vote != null && <p style={{ color: 'var(--fog-dim)', fontSize: 12.5, marginTop: 2 }}>TMDB {fmtScore(f.vote)}</p>}
                    {f.opWatchlist && <span className="chip on-g" style={{ marginTop: 6, padding: '2px 8px', fontSize: 11 }}><Check size={11} /> {tr('similar.onList')}</span>}
                  </div>
                </div>
                <p style={{ color: 'var(--fog)', fontSize: 12.5, marginTop: 10, minHeight: 32 }}>
                  {[...(f.dubbeleBron ? [tr('similar.both')] : []), ...f.redenen.map(reden)].filter(Boolean).slice(0, 2).join(' · ')}
                </p>
                <div style={{ display: 'flex', gap: 10, marginTop: 8, alignItems: 'center', fontSize: 12 }}>
                  <a href={lbLink({ name: f.title }, f.id)} target="_blank" rel="noreferrer">Letterboxd</a>
                  <ImdbA tmdbId={f.id} tmdbKey={app.tmdbKey} film={{ name: f.title, year: f.year }} />
                  <a href={jwLink(null, { name: f.title })} target="_blank" rel="noreferrer">JustWatch</a>
                  {!f.opWatchlist && !shortIds.has(f.id) && (
                    <button className="btn ghost" style={{ marginLeft: 'auto', padding: '3px 9px', fontSize: 12 }}
                      onClick={() => app.setShortlist((s) => [...s, { id: f.id, title: f.title, year: f.year, poster: f.poster, vote: f.vote, seeds: [seed.name], genre_ids: f.genre_ids }])}>
                      <Plus size={12} /> Shortlist
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
