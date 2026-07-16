import { useRef, useState } from 'react';
import { Upload, Sparkles, Download } from 'lucide-react';
import { parseLetterboxdFiles } from '../lib/csv.js';
import { demoWatchlist } from '../lib/extra.js';
import { useT } from '../lib/i18n.js';

export default function ImportPanel({ app, hero }) {
  const { t: tr } = useT();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = async (files) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const res = await parseLetterboxdFiles(Array.from(files));
      const found = [];
      if (res.watchlist?.length) { app.setWatchlist(res.watchlist); found.push(`${res.watchlist.length} watchlist-films`); }
      if (res.watched?.length) {
        app.setWatchedLb(res.watched.map((f) => f.key));
        app.setWatchedFilms(res.watched);
        found.push(`${res.watched.length} gezien`);
      }
      if (res.ratings && Object.keys(res.ratings.map).length) {
        app.setRatings(res.ratings.map);
        app.setRatedFilms(res.ratings.films);
        found.push(`${Object.keys(res.ratings.map).length} ratings`);
      }
      if (!found.length) {
        alert(tr('imp.noFiles'));
      } else {
        if (res.watchlist?.length) app.setDemoMode(false); // echte import vervangt de demo
        if (res.watchlist?.length && app.settings.tmdbKey) app.startEnrich(res.watchlist);
      }
    } catch (e) {
      alert(`Import mislukt: ${e.message}`);
    }
    setBusy(false);
  };

  const loadDemo = () => {
    const demo = demoWatchlist();
    app.setWatchlist(demo);
    app.setDemoMode(true);
    if (app.settings.tmdbKey) app.startEnrich(demo);
  };

  const inner = (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
      className="card"
      style={{ borderStyle: 'dashed', borderColor: dragOver ? 'var(--dot-o)' : 'var(--line-strong)', textAlign: 'center', padding: '28px 20px' }}
    >
      <Upload size={22} strokeWidth={1.6} style={{ color: 'var(--fog)' }} aria-hidden="true" />
      <p style={{ marginTop: 10, fontWeight: 500 }}>{tr('imp.dropHere')}</p>
      <p style={{ color: 'var(--fog)', fontSize: 13, marginTop: 4 }}>
        {tr('imp.dropSub')}
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
        <button className="btn primary" onClick={() => inputRef.current?.click()} disabled={busy}>
          <Upload size={15} /> {busy ? tr('imp.busy') : tr('imp.chooseFiles')}
        </button>
        <button className="btn" onClick={loadDemo}><Sparkles size={15} /> {tr('imp.tryDemo')}</button>
      </div>
      <input
        ref={inputRef} type="file" multiple accept=".zip,.csv" hidden
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
      />
      <p style={{ color: 'var(--fog-dim)', fontSize: 12, marginTop: 14 }}>
        {tr('imp.privacy')}<a href="https://letterboxd.com/user/exportdata/" target="_blank" rel="noreferrer">letterboxd.com/user/exportdata <Download size={11} style={{ verticalAlign: -1 }} /></a>
      </p>
    </div>
  );

  if (!hero) return inner;

  return (
    <div>
      <div style={{ textAlign: 'center', margin: '30px 0 26px' }}>
        <h1 className="page-title" style={{ fontSize: 42 }}>{tr('imp.title')}</h1>
        <p className="page-sub" style={{ maxWidth: 520, margin: '8px auto 0' }}>
          {tr('imp.heroSub')}
        </p>
      </div>
      {inner}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18, marginTop: 26 }}>
        <div className="step"><div className="n">1</div><p dangerouslySetInnerHTML={{ __html: tr('imp.step1') }} /></div>
        <div className="step"><div className="n">2</div><p dangerouslySetInnerHTML={{ __html: tr('imp.step2') }} /></div>
        <div className="step"><div className="n">3</div><p dangerouslySetInnerHTML={{ __html: tr('imp.step3') }} /></div>
      </div>
    </div>
  );
}
