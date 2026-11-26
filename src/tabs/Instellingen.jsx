import { useRef, useState } from 'react';
import { KeyRound, Check, Trash2, Download, Upload, X } from 'lucide-react';
import { testKey } from '../lib/tmdb.js';
import { checkOmdbKey } from '../lib/omdb.js';
import { SLUG } from '../lib/merk.js';
import { DEFAULT_THEME_EMPHASIS } from '../lib/taste.js';
import { REGIONS, DEFAULT_REGION, PROXY_URL, jaarTwijfel } from '../lib/tmdb.js';
import { useT } from '../lib/i18n.js';
import { exportAll, importAll, controleerBackup, clearAll, storageUsage, currentProfile, listProfiles, addProfile, switchProfile, deleteProfile } from '../lib/storage.js';
import Foutlogboek from '../components/Foutlogboek.jsx';
import { downloadText } from '../lib/csv.js';
import ImportPanel from '../components/ImportPanel.jsx';
import ScoresPreview from '../components/ScoresPreview.jsx';
import MatchPicker from '../components/MatchPicker.jsx';
import LetterboxdLive from '../components/LetterboxdLive.jsx';
import SyncApparaten from '../components/SyncApparaten.jsx';
import { meld, bevestig } from '../lib/melding.js';
import HoeWerktDit from '../components/HoeWerktDit.jsx';

export default function Instellingen({ app }) {
  const { t: tr, lang } = useT();
  const [keyInput, setKeyInput] = useState(app.settings.tmdbKey || '');
  const [editKeys, setEditKeys] = useState(false);
  const [multiKeys, setMultiKeys] = useState((app.omdbKeys?.length || 0) > 1);
  const [profielNaam, setProfielNaam] = useState('');
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

  const wipe = async () => {
    // Met huisgenoten op dit apparaat: alleen dit profiel, en dat zeggen we
    const vraag = listProfiles().length ? tr('setup.confirmClearAllProfiel') : tr('setup.confirmClearAll');
    if (!await bevestig(vraag, { ja: tr('setup.wipeAll'), gevaar: true })) return;
    await clearAll();
    location.reload();
  };

  // Terugzetten vervangt wat er nu staat: eerst vragen, dan wachten tot alles
  // (ook de filmcache) terug is, en pas dan herladen
  const restore = async (files) => {
    if (!files?.length) return;
    try {
      const tekst = await files[0].text();
      controleerBackup(tekst);
      if (!await bevestig(tr('setup.confirmRestore'), { ja: tr('setup.restoreJa'), gevaar: true })) return;
      await importAll(tekst);
      location.reload();
    } catch (e) {
      meld(e.message === 'INVALID_BACKUP' ? tr('setup.invalidBackup') : e.message, { soort: 'fout' });
    }
  };
  const verwijderProfiel = async (naam) => {
    if (!await bevestig(tr('setup.deleteProfileConfirm', { name: naam }), { ja: tr('setup.deleteProfileJa'), gevaar: true })) return;
    deleteProfile(naam);
    if (currentProfile() !== naam) location.reload();
  };
  // Films die de tool misschien aan de verkeerde film koppelde: van je
  // watchlist, en ook wat je zag en beoordeelde (dat voedt je smaakprofiel)
  const twijfel = [...new Map([...app.watchlist, ...(app.ratedFilms || []), ...(app.watchedFilms || [])]
    .filter((f) => f?.key && f.name && !app.ignoredSet?.has(f.key) && jaarTwijfel(app.meta[f.key]))
    .map((f) => [f.key, f])).values()];

  const terugNaarStart = async () => {
    if (await bevestig(tr('setup.confirmClearData'), { ja: tr('setup.wisBieb'), gevaar: true })) app.resetLibrary();
  };

  return (
    <div>
      <div className="toprow">
        <div>
          <h1 className="page-title">{tr('setup.title')}</h1>
          <p className="page-sub">{tr('setup.pageSub')}</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }} data-uitleg="setup-tmdb">
        <p className="label" style={{ marginBottom: 10 }}>{tr('setup.tmdbKeyLabel')}</p>
        <p style={{ color: 'var(--fog)', fontSize: 13.5, marginBottom: 12 }}>
          {PROXY_URL ? tr('setup.tmdbViaProxy') : <>{tr('setup.tmdbIntro1')}<a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer">themoviedb.org/settings/api</a>{tr('setup.tmdbIntro2')}</>}
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
        {keyState === 'ok' && <p style={{ color: 'var(--dot-g)', fontSize: 13, marginTop: 10 }}><Check size={13} style={{ verticalAlign: -2 }} /> {tr('setup.sleutelWerkt')}</p>}
        {keyState === 'fail' && <p style={{ color: 'var(--dot-o)', fontSize: 13, marginTop: 10 }}>{tr('setup.tmdbRejected')}</p>}
        {app.settings.tmdbKey && keyState === 'idle' && <p style={{ color: 'var(--fog-dim)', fontSize: 13, marginTop: 10 }}>{tr('setup.tmdbWorking')}</p>}
      </div>

      <div className="card" style={{ marginBottom: 18 }} data-uitleg="setup-omdb">
        <p className="label" style={{ marginBottom: 10 }}>{tr('setup.omdbLabel')}</p>
        {app.omdbKeys.length > 0 && !editKeys ? (
          <>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <p style={{ color: 'var(--dot-g)', fontSize: 13.5 }}>
              <Check size={14} style={{ verticalAlign: -2 }} /> {tr('setup.omdbActive', { count: app.omdbKeys.length })}
            </p>
            <button className="btn ghost" onClick={() => { setOmdbInput(app.omdbKeys.join('\n')); setMultiKeys(app.omdbKeys.length > 1); setEditKeys(true); }}>{tr('setup.changeKeys')}</button>
          </div>
          {app.watchlist.length > 0 && (() => {
          const metFilmdata = app.watchlist.filter((f) => app.meta[f.key]);
          const heeft = metFilmdata.filter((f) => app.meta[f.key].ext).length;
          const mist = metFilmdata.length - heeft;
          const wachtOpTmdb = app.watchlist.length - metFilmdata.length;
          return (
            <div style={{ marginTop: 12 }}>
              {app.extEnrich.running ? (
                <p style={{ color: 'var(--fog)', fontSize: 13.5 }}>
                  <span className="livedot" aria-hidden="true" style={{ marginRight: 6 }} />
                  {tr('setup.scoresFetching', { done: app.extEnrich.done, total: app.extEnrich.total })}
                </p>
              ) : mist > 0 ? (
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <p style={{ color: 'var(--fog)', fontSize: 13.5 }}>
                    {tr('setup.scoresStatus', { have: heeft, total: metFilmdata.length })} {tr('setup.scoresMissing', { count: mist })}
                  </p>
                  <button className="btn primary" onClick={() => app.startExtEnrich(app.watchlist)}>{tr('setup.fetchScoresNow')}</button>
                </div>
              ) : (
                <p style={{ color: 'var(--dot-g)', fontSize: 13.5 }}><Check size={13} style={{ verticalAlign: -2 }} /> {tr('setup.scoresAllDone')}</p>
              )}
              {wachtOpTmdb > 0 && !app.extEnrich.running && (
                <p style={{ color: 'var(--fog-dim)', fontSize: 12.5, marginTop: 6 }}>{tr('setup.scoresAwaitTmdb')}</p>
              )}
            </div>
          );
          })()}
          </>
        ) : (
          <>
            <ScoresPreview />
            <p style={{ color: 'var(--paper)', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{tr('setup.scoresPitch')} <HoeWerktDit app={app} h="setup" stap="omdb" /></p>
            <ol style={{ color: 'var(--fog)', fontSize: 13.5, margin: '0 0 12px 18px', display: 'grid', gap: 6 }}>
              <li>{tr('setup.wizStep1')}<a href="https://www.omdbapi.com/apikey.aspx" target="_blank" rel="noreferrer">omdbapi.com/apikey.aspx</a>{tr('setup.wizStep1b')}</li>
              <li><strong style={{ color: 'var(--paper)' }}>{tr('setup.wizStep2')}</strong></li>
              <li>{tr('setup.wizStep3')}</li>
            </ol>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {multiKeys ? (
                <textarea
                  className="field" style={{ maxWidth: 420, minHeight: 66, resize: 'vertical', fontFamily: 'var(--font-ui)' }}
                  placeholder={tr('setup.omdbPlaceholder')} value={omdbInput}
                  onChange={(e) => { setOmdbInput(e.target.value); setOmdbState('idle'); }}
                  aria-label={tr('setup.omdbAria')}
                />
              ) : (
                <input
                  className="field" style={{ maxWidth: 260 }}
                  placeholder={tr('setup.singlePlaceholder')} value={omdbInput}
                  onChange={(e) => { setOmdbInput(e.target.value); setOmdbState('idle'); }}
                  aria-label={tr('setup.omdbAria')}
                />
              )}
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
                setEditKeys(false);
                if (okNu.length && app.watchlist.length) app.startExtEnrich(app.watchlist, geordend);
              }}>
                <KeyRound size={15} /> {omdbState === 'testing' ? tr('setup.testing') : tr('setup.saveTest')}
              </button>
            </div>
            {!multiKeys && (
              <button type="button" className="btn ghost" style={{ marginTop: 8, fontSize: 12.5 }} onClick={() => setMultiKeys(true)}>{tr('setup.multiToggle')}</button>
            )}
          </>
        )}
        {omdbState === 'ok' && <p style={{ color: 'var(--dot-g)', fontSize: 13, marginTop: 10 }}><Check size={13} style={{ verticalAlign: -2 }} /> {keyReport?.some((r) => r.status === 'ok') ? tr('setup.savedFetching') : tr('setup.savedNoBudget')}</p>}
        {omdbState === 'fail' && <p style={{ color: 'var(--dot-o)', fontSize: 13, marginTop: 10 }}>{tr('setup.noUsableKeys')}</p>}
        {keyReport?.some((r) => r.status === 'invalid') && (
          <p style={{ color: 'var(--fog)', fontSize: 13, marginTop: 8 }}>{tr('setup.invalidHint')}</p>
        )}
        {keyReport && (
          <div style={{ marginTop: 12, display: 'grid', gap: 4 }}>
            {keyReport.map((r) => (
              <p key={r.key} style={{ fontSize: 13, color: 'var(--fog)' }}>
                <code style={{ color: 'var(--paper)' }}>{r.key.slice(0, 4)}…{r.key.slice(-2)}</code>
                {': '}
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

      {PROXY_URL && <SyncApparaten app={app} />}
      {PROXY_URL && <LetterboxdLive app={app} />}

      <div className="card" style={{ marginBottom: 18 }} data-uitleg="setup-laden">
        <p className="label" style={{ marginBottom: 12 }}>{tr('setup.reloadData')}</p>
        <ImportPanel app={app} />
        {app.watchlistAll.length > 0 && (
          <>
          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ color: 'var(--fog)', fontSize: 13 }}>
              {tr('setup.loaded', { watchlist: app.watchlist.length, seen: app.watchedLb.length, ratings: Object.keys(app.ratings).length, meta: Object.keys(app.meta).length, ext: Object.values(app.meta).filter((m) => m && m.ext).length })}
            </span>
            {app.tmdbKey && (
              <button className="btn" onClick={() => app.startEnrich(app.watchlist, true)} disabled={app.enrich.running}>
                {app.enrich.running ? tr('setup.fetching') : tr('setup.fetchData')}
              </button>
            )}
            {app.tmdbKey && twijfel.length > 0 && (
              <button className="btn" style={{ borderColor: 'var(--dot-o)' }} onClick={() => setPicker(twijfel)} disabled={app.enrich.running} data-uitleg="setup-match">
                {tr('setup.wrongFilms', { count: twijfel.length })}
              </button>
            )}
          </div>
          {app.tmdbKey && app.watchlist.length > 0 && !twijfel.length && !app.enrich.running && (
            <p style={{ fontSize: 12.5, color: 'var(--fog-dim)', marginTop: 8 }}>{tr('setup.recheckHint')}</p>
          )}
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

      <div className="card" style={{ marginBottom: 18 }} data-uitleg="setup-taal">
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

      <div className="card" style={{ marginBottom: 18 }} data-uitleg="setup-regio">
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

      <div className="card" style={{ marginBottom: 18 }} data-uitleg="setup-thema">
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
            style={{ flex: 1, minWidth: 180, accentColor: 'var(--paper)' }}
          />
          <span style={{ fontSize: 14, color: 'var(--paper)', minWidth: 128 }}>
            {(() => { const v = app.settings.themeEmphasis ?? DEFAULT_THEME_EMPHASIS; return v === 0 ? tr('setup.themaUit') : v <= 0.5 ? tr('setup.themaLicht') : v <= 1 ? tr('setup.themaStandaard') : v <= 1.5 ? tr('setup.themaNadruk') : tr('setup.themaSterk'); })()}
          </span>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }} data-uitleg="setup-profielen">
        <p className="label" style={{ marginBottom: 10 }}>{tr('setup.profiles')}</p>
        <p style={{ color: 'var(--fog)', fontSize: 13.5, marginBottom: 12 }}>{tr('setup.profilesHint')}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <button className={`chip ${currentProfile() === '' ? 'on-g' : ''}`} onClick={() => currentProfile() !== '' && switchProfile('')}>
            {tr('setup.profileDefault')}
          </button>
          {listProfiles().map((naam) => (
            <span key={naam} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              <button className={`chip ${currentProfile() === naam ? 'on-g' : ''}`} onClick={() => currentProfile() !== naam && switchProfile(naam)}>{naam}</button>
              <button className="btn ghost" style={{ padding: '2px 7px', fontSize: 12 }} aria-label={tr('setup.deleteProfileAria', { name: naam })}
                onClick={() => verwijderProfiel(naam)}>✕</button>
            </span>
          ))}
          <input className="field" style={{ maxWidth: 140 }} placeholder={tr('setup.profileNamePlaceholder')} value={profielNaam}
            onChange={(e) => setProfielNaam(e.target.value)} aria-label={tr('setup.profiles')} />
          <button className="btn" onClick={() => {
            if (!addProfile(profielNaam)) { meld(tr('setup.profileNameInvalid'), { soort: 'fout' }); return; }
            switchProfile(profielNaam.trim());
          }}>{tr('setup.addProfile')}</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }} data-uitleg="setup-backup">
        <p className="label" style={{ marginBottom: 12 }}>{tr('setup.backup')}</p>
        <p style={{ color: 'var(--fog-dim)', fontSize: 12.5, marginBottom: 12 }}>
          {tr('setup.storageUsage', { mb: (storageUsage() / 1024 / 1024).toFixed(1).replace('.', lang === 'nl' ? ',' : '.') })}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {/* De filmcache staat in IndexedDB, niet in localStorage: geef hem mee,
              anders mist de back-up alle filmdata */}
          <button className="btn" onClick={() => downloadText(`${SLUG}-backup.json`, exportAll(app.meta), 'application/json')}>
            <Download size={15} /> {tr('setup.exportAll')}
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}><Upload size={15} /> {tr('setup.restoreBackup')}</button>
          <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => { restore(e.target.files); e.target.value = ''; }} />
          <button className="btn" onClick={terugNaarStart} data-uitleg="setup-start">
            <Trash2 size={15} /> {tr('setup.terugNaarStart')}
          </button>
          <button className="btn" style={{ borderColor: 'var(--line-strong)', color: 'var(--dot-o)' }} onClick={wipe}>
            <Trash2 size={15} /> {tr('setup.wipeAll')}
          </button>
        </div>
      </div>

      <Foutlogboek />

      <p style={{ color: 'var(--fog-dim)', fontSize: 12.5 }} data-uitleg="setup-versie">
        {tr('setup.versionLine', { v: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev' })}
        {app.watchlist.length > 0 && !app.demoMode && (
          <>
            {' '}<button type="button" className="linkbtn" style={{ fontSize: 12.5, color: 'var(--fog)' }} onClick={app.openPremiere}>{tr('premiere.nogEens')}</button>
          </>
        )}
        <br />
        {tr('setup.footer')}
      </p>
    </div>
  );
}
