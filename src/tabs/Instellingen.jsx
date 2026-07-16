import { useRef, useState } from 'react';
import { KeyRound, Check, Trash2, Download, Upload, X } from 'lucide-react';
import { testKey } from '../lib/tmdb.js';
import { testOmdbKey, checkOmdbKey } from '../lib/omdb.js';
import { DEFAULT_NOSSY_WEIGHTS } from '../lib/pick.js';
import { DEFAULT_THEME_EMPHASIS } from '../lib/taste.js';
import { REGIONS, DEFAULT_REGION } from '../lib/tmdb.js';
import { useT } from '../lib/i18n.js';
import { exportAll, importAll, clearAll, storageUsage } from '../lib/storage.js';
import { downloadText } from '../lib/csv.js';
import ImportPanel from '../components/ImportPanel.jsx';
import MatchPicker from '../components/MatchPicker.jsx';

export default function Instellingen({ app }) {
  const { t: tr, lang } = useT();
  const [keyInput, setKeyInput] = useState(app.settings.tmdbKey || '');
  const [keyState, setKeyState] = useState('idle'); // idle | testing | ok | fail
  const [omdbInput, setOmdbInput] = useState((app.settings.omdbKeys || (app.settings.omdbKey ? [app.settings.omdbKey] : [])).join('\n'));
  const [omdbState, setOmdbState] = useState('idle');
  const [keyReport, setKeyReport] = useState(null); // per-sleutel diagnose
  const fileRef = useRef(null);
  const [picker, setPicker] = useState(null); // lijst films voor de visuele match-kiezer

  const saveKey = async () => {
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    setKeyState('testing');
    try {
      await testKey(trimmed);
      app.setSettings((s) => ({ ...s, tmdbKey: trimmed }));
      setKeyState('ok');
      if (app.watchlist.length && !Object.keys(app.meta).length) app.startEnrich(app.watchlist);
    } catch {
      setKeyState('fail');
    }
  };

  const wipe = () => {
    if (!confirm(tr('setup.confirmClearAll'))) return;
    clearAll();
    location.reload();
  };

  const restore = async (files) => {
    if (!files?.length) return;
    try {
      importAll(await files[0].text());
      location.reload();
    } catch (e) {
      alert(e.message === 'INVALID_BACKUP' ? tr('setup.invalidBackup') : e.message);
    }
  };

  return (
    <div>
      <div className="toprow">
        <div>
          <h1 className="page-title">{tr('setup.title')}</h1>
          <p className="page-sub">{tr('setup.pageSub')}</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <p className="label" style={{ marginBottom: 10 }}>{tr('setup.tmdbKeyLabel')}</p>
        <p style={{ color: 'var(--fog)', fontSize: 13.5, marginBottom: 12 }}>
          {tr('setup.tmdbIntro1')}<a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer">themoviedb.org/settings/api</a>{tr('setup.tmdbIntro2')}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            className="field" style={{ maxWidth: 420 }} type="password"
            placeholder={tr('setup.tmdbPlaceholder')} value={keyInput}
            onChange={(e) => { setKeyInput(e.target.value); setKeyState('idle'); }}
            aria-label={tr('setup.tmdbKeyLabel')}
          />
          <button className="btn primary" onClick={saveKey} disabled={keyState === 'testing' || !keyInput.trim()}>
            <KeyRound size={15} /> {keyState === 'testing' ? tr('setup.testing') : tr('setup.saveTest')}
          </button>
        </div>
        {keyState === 'ok' && <p style={{ color: 'var(--dot-g)', fontSize: 13, marginTop: 10 }}><Check size={13} style={{ verticalAlign: -2 }} /> Sleutel werkt en is opgeslagen.</p>}
        {keyState === 'fail' && <p style={{ color: 'var(--dot-o)', fontSize: 13, marginTop: 10 }}>{tr('setup.tmdbRejected')}</p>}
        {app.settings.tmdbKey && keyState === 'idle' && <p style={{ color: 'var(--fog-dim)', fontSize: 13, marginTop: 10 }}>{tr('setup.tmdbWorking')}</p>}
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <p className="label" style={{ marginBottom: 10 }}>{tr('setup.omdbLabel')}</p>
        <p style={{ color: 'var(--fog)', fontSize: 13.5, marginBottom: 12 }}>
          {tr('setup.omdbIntro1')}<a href="https://www.omdbapi.com/apikey.aspx" target="_blank" rel="noreferrer">omdbapi.com/apikey.aspx</a>{tr('setup.omdbIntro1b')}{tr('setup.omdbIntro')}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <textarea
            className="field" style={{ maxWidth: 420, minHeight: 66, resize: 'vertical', fontFamily: 'var(--font-ui)' }}
            placeholder={tr('setup.omdbPlaceholder')} value={omdbInput}
            onChange={(e) => { setOmdbInput(e.target.value); setOmdbState('idle'); }}
            aria-label={tr('setup.omdbAria')}
          />
          <button className="btn primary" disabled={omdbState === 'testing' || !omdbInput.trim()} onClick={async () => {
            const keys = omdbInput.split(/[\n,;\s]+/).map((k) => k.trim()).filter(Boolean);
            if (!keys.length) return;
            setOmdbState('testing');
            // Elke sleutel apart diagnosticeren: werkend, daglimiet op, ongeldig of netwerk geblokkeerd
            const statuses = await Promise.all(keys.map((k) => checkOmdbKey(k)));
            const report = keys.map((k, i) => ({ key: k, status: statuses[i] }));
            setKeyReport(report);
            const bruikbaar = report.filter((r) => r.status !== 'invalid').map((r) => r.key);
            const okNu = report.filter((r) => r.status === 'ok').map((r) => r.key);
            if (!bruikbaar.length) { setOmdbState('fail'); return; }
            // ok-sleutels vooraan, limit-sleutels erachter (morgen weer bruikbaar)
            const geordend = [...okNu, ...bruikbaar.filter((k) => !okNu.includes(k))];
            app.setSettings((s) => ({ ...s, omdbKeys: geordend, omdbKey: undefined }));
            setOmdbState('ok');
            if (okNu.length && app.watchlist.length) app.startExtEnrich(app.watchlist, geordend);
          }}>
            <KeyRound size={15} /> {omdbState === 'testing' ? tr('setup.testing') : tr('setup.saveTest')}
          </button>
        </div>
        {omdbState === 'ok' && <p style={{ color: 'var(--dot-g)', fontSize: 13, marginTop: 10 }}><Check size={13} style={{ verticalAlign: -2 }} /> Opgeslagen{keyReport?.some((r) => r.status === 'ok') ? ' — scores worden opgehaald.' : ' — maar geen enkele sleutel heeft nú nog tegoed; morgen wordt automatisch verder geprobeerd.'}</p>}
        {omdbState === 'fail' && <p style={{ color: 'var(--dot-o)', fontSize: 13, marginTop: 10 }}>{tr('setup.noUsableKeys')}</p>}
        {keyReport && (
          <div style={{ marginTop: 12, display: 'grid', gap: 4 }}>
            {keyReport.map((r) => (
              <p key={r.key} style={{ fontSize: 13, color: 'var(--fog)' }}>
                <code style={{ color: 'var(--paper)' }}>{r.key.slice(0, 4)}…{r.key.slice(-2)}</code>
                {' — '}
                {r.status === 'ok' && <span style={{ color: 'var(--dot-g)' }}>{tr('setup.statusOk')}</span>}
                {r.status === 'limit' && <span style={{ color: 'var(--dot-o)' }}>{tr('setup.statusLimit')}</span>}
                {r.status === 'invalid' && <span style={{ color: 'var(--dot-o)' }}>{tr('setup.statusInvalid')}</span>}
                {r.status === 'netwerk' && <span style={{ color: 'var(--dot-o)' }}>{tr('setup.statusNetwork')}</span>}
              </p>
            ))}
          </div>
        )}
        {(app.settings.omdbKeys?.length || app.settings.omdbKey) && omdbState === 'idle' && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
            <p style={{ color: 'var(--fog-dim)', fontSize: 13 }}>
              {(app.settings.omdbKeys?.length || 1) === 1 ? tr('setup.omdbSet1') : tr('setup.omdbSetN', { count: app.settings.omdbKeys.length })}
            </p>
            <button className="btn" onClick={() => app.startExtEnrich(app.watchlist)} disabled={app.extEnrich.running}>
              {app.extEnrich.running ? tr('setup.busy') : tr('setup.fetchMissing')}
            </button>
            <button className="btn ghost" onClick={async () => {
              setOmdbState('testing');
              const keys = app.settings.omdbKeys || [];
              const statuses = await Promise.all(keys.map((k) => checkOmdbKey(k)));
              setKeyReport(keys.map((k, i) => ({ key: k, status: statuses[i] })));
              setOmdbState('idle');
            }}>{tr('setup.testAllKeys')}</button>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <p className="label" style={{ marginBottom: 12 }}>{tr('setup.reloadData')}</p>
        <ImportPanel app={app} />
        {app.watchlistAll.length > 0 && (
          <>
          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ color: 'var(--fog)', fontSize: 13 }}>
              {tr('setup.loaded', { watchlist: app.watchlist.length, seen: app.watchedLb.length, ratings: Object.keys(app.ratings).length, meta: Object.keys(app.meta).length, ext: Object.values(app.meta).filter((m) => m && m.ext).length })}
            </span>
            {app.settings.tmdbKey && (
              <button className="btn" onClick={() => app.startEnrich(app.watchlist, true)} disabled={app.enrich.running}>
                {app.enrich.running ? tr('setup.fetching') : tr('setup.fetchData')}
              </button>
            )}
            {app.settings.tmdbKey && (() => {
              const mismatches = app.watchlist.filter((f) => app.meta[f.key]?.yearMismatch);
              if (!mismatches.length) return null;
              return (
                <button className="btn" style={{ borderColor: 'rgba(255,128,0,0.4)' }} onClick={() => setPicker(mismatches)} disabled={app.enrich.running}>
                  {tr('setup.wrongFilms', { count: mismatches.length })}
                </button>
              );
            })()}
          </div>
          {picker && <MatchPicker films={picker} app={app} onClose={() => setPicker(null)} />}
          {app.ignored.length > 0 && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
              <p style={{ fontSize: 13, color: 'var(--fog)', marginBottom: 8 }}>
                {tr('setup.ignoredCount', { count: app.ignored.length })}
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {app.ignored.map((k) => {
                  const f = app.watchlistAll.find((w) => w.key === k);
                  return (
                    <button key={k} className="chip" style={{ fontSize: 12 }} onClick={() => app.unignoreFilm(k)} title={tr('setup.unignoreTitle')}>
                      {(f?.name || k)} <X size={12} style={{ verticalAlign: -1 }} />
                    </button>
                  );
                })}
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--fog-dim)', marginTop: 6 }}>{tr('setup.clickToRestore')}</p>
            </div>
          )}
          </>
        )}
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <p className="label" style={{ marginBottom: 10 }}>{tr('setup.nossyRecipe')}</p>
        <p style={{ color: 'var(--fog)', fontSize: 13.5, marginBottom: 12 }}>
          {tr('setup.nossyExplain')}
        </p>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {[['imdb', 'IMDb'], ['mc', 'Metacritic'], ['tmdb', 'TMDB']].map(([id, label]) => (
            <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--fog)' }}>
              {label}
              <select
                className="field" style={{ width: 70 }}
                value={(app.settings.nossyWeights || DEFAULT_NOSSY_WEIGHTS)[id] ?? 1}
                aria-label={tr('setup.weightAria', { label })}
                onChange={(e) => app.setSettings((s) => ({ ...s, nossyWeights: { ...DEFAULT_NOSSY_WEIGHTS, ...(s.nossyWeights || {}), [id]: +e.target.value } }))}
              >
                {[0, 1, 2, 3].map((w) => <option key={w} value={w}>{w}×</option>)}
              </select>
            </label>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <p className="label" style={{ marginBottom: 10 }}>{tr('setup.language')}</p>
        <p style={{ color: 'var(--fog)', fontSize: 13.5, marginBottom: 12 }}>{tr('setup.languageHint')}</p>
        <div style={{ display: 'flex', gap: 8 }}>
          {[['nl', 'Nederlands'], ['en', 'English']].map(([code, naam]) => (
            <button
              key={code}
              className={`chip ${(app.settings.lang || lang) === code ? 'on-b' : ''}`}
              onClick={() => { app.setSettings((s) => ({ ...s, lang: code })); }}
            >{naam}</button>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <p className="label" style={{ marginBottom: 10 }}>{tr('setup.region')}</p>
        <p style={{ color: 'var(--fog)', fontSize: 13.5, marginBottom: 12 }}>{tr('setup.regionHint')}</p>
        <select
          className="field" style={{ width: 'auto', minWidth: 220 }}
          value={app.settings.region || DEFAULT_REGION}
          aria-label={tr('setup.regionAria')}
          onChange={(e) => app.setSettings((s) => ({ ...s, region: e.target.value }))}
        >
          {(() => {
            let dn;
            try { dn = new Intl.DisplayNames([lang], { type: 'region' }); } catch { dn = null; }
            return REGIONS
              .map((code) => [code, dn ? (dn.of(code) || code) : code])
              .sort((a, b) => a[1].localeCompare(b[1], lang))
              .map(([code, naam]) => <option key={code} value={code}>{naam}</option>);
          })()}
        </select>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <p className="label" style={{ marginBottom: 10 }}>{tr('setup.themeEmphasis')}</p>
        <p style={{ color: 'var(--fog)', fontSize: 13.5, marginBottom: 12 }}>
{tr('setup.themeExplain')}
        </p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="range" min="0" max="2" step="0.5"
            value={app.settings.themeEmphasis ?? DEFAULT_THEME_EMPHASIS}
            aria-label={tr('setup.themeEmphasis')}
            onChange={(e) => app.setSettings((s) => ({ ...s, themeEmphasis: +e.target.value }))}
            style={{ flex: 1, minWidth: 180, accentColor: 'var(--dot-o)' }}
          />
          <span style={{ fontSize: 14, color: 'var(--paper)', minWidth: 128 }}>
            {(() => { const v = app.settings.themeEmphasis ?? DEFAULT_THEME_EMPHASIS; return v === 0 ? 'Uit — geen thema\u2019s' : v <= 0.5 ? 'Licht accent' : v <= 1 ? 'Standaard' : v <= 1.5 ? 'Nadrukkelijk' : 'Sterk themagedreven'; })()}
          </span>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <p className="label" style={{ marginBottom: 12 }}>{tr('setup.backup')}</p>
        <p style={{ color: 'var(--fog-dim)', fontSize: 12.5, marginBottom: 12 }}>
          {tr('setup.storageUsage', { mb: (storageUsage() / 1024 / 1024).toFixed(1).replace('.', lang === 'nl' ? ',' : '.') })}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => downloadText('nossy-picker-backup.json', exportAll(), 'application/json')}>
            <Download size={15} /> {tr('setup.exportAll')}
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}><Upload size={15} /> {tr('setup.restoreBackup')}</button>
          <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => { restore(e.target.files); e.target.value = ''; }} />
          <button className="btn" onClick={() => { if (confirm(tr('setup.confirmClearData'))) app.resetLibrary(); }}>
            <Trash2 size={15} /> Terug naar start (wis bibliotheek)
          </button>
          <button className="btn" style={{ borderColor: 'rgba(255,128,0,0.5)', color: 'var(--dot-o)' }} onClick={wipe}>
            <Trash2 size={15} /> {tr('setup.wipeAll')}
          </button>
        </div>
      </div>

      <p style={{ color: 'var(--fog-dim)', fontSize: 12.5 }}>
        {tr('setup.versionLine', { v: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev' })}
        <br />
        {tr('setup.footer')}
      </p>
    </div>
  );
}
