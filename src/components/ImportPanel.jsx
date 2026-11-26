import { useRef, useState } from 'react';
import { Upload, Sparkles, Download } from 'lucide-react';
import { parseLetterboxdFiles, importDiff, pasExportToe, exportTwijfel } from '../lib/csv.js';
import { useT } from '../lib/i18n.js';
import { PROXY_URL } from '../lib/tmdb.js';
import { meld, bevestig } from '../lib/melding.js';
import { ZaalCodeInvoer } from './ZaalDelen.jsx';
import { zaalBeschikbaar } from '../lib/zaalstemming.js';

const EXPORT_URL = 'https://letterboxd.com/user/exportdata/';
const DAG = 24 * 3600e3;

export default function ImportPanel({ app, hero }) {
  const { t: tr, lang } = useT();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const datumTekst = (iso) => new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));

  const handleFiles = async (files) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const res = await parseLetterboxdFiles(Array.from(files));
      const naDemo = app.demoMode && res.watchlist?.length > 0;
      // Een export van een ander account, of een oudere dan je vorige: eerst vragen
      const eigenLijst = !app.demoMode && app.watchlistAll?.length > 0;
      const twijfel = eigenLijst ? exportTwijfel(res.export, app.lbExport, app.settings?.lbNaam) : null;
      if (twijfel) {
        const vraag = twijfel.soort === 'ander'
          ? tr('imp.vraagAnder', { naam: twijfel.naam, eigen: twijfel.eigen })
          : tr('imp.vraagOuder', { nieuw: datumTekst(twijfel.nieuw), oud: datumTekst(twijfel.oud) });
        if (!await bevestig(vraag, { ja: tr('imp.tochLaden'), gevaar: true })) { setBusy(false); return; }
      }
      // Je eigen lijst na de demo: wat je in de demo deed, gaat eerst weg,
      // en het verslag telt alles als nieuw
      if (naDemo) app.vervangDemo();
      const huidig = naDemo ? {} : { watchlist: app.watchlist, watchedLb: app.watchedLb, ratings: app.lbRatings, diary: app.diary, ownRatings: app.ownRatings };
      // Diff t.o.v. de huidige staat, vóórdat we iets vervangen
      const diff = importDiff(huidig, res);
      const nieuw = pasExportToe(huidig, res);
      if (!['watchlist', 'watchedLb', 'ratings', 'diary', 'lbLists'].some((k) => nieuw[k])) {
        meld(tr('imp.noFiles'), { soort: 'fout' });
      } else {
        if (nieuw.watchlist) app.setWatchlist(nieuw.watchlist);
        if (nieuw.watchedLb) { app.setWatchedLb(nieuw.watchedLb); app.setWatchedFilms(nieuw.watchedFilms); }
        if (nieuw.ratings) { app.setRatings(nieuw.ratings); app.setRatedFilms(nieuw.ratedFilms); app.setOwnRatings(nieuw.ownRatings); }
        if (nieuw.diary) app.setDiary(nieuw.diary);
        if (nieuw.lbLists) app.setLbLists(nieuw.lbLists);
        if (nieuw.lbExport) app.setLbExport(nieuw.lbExport);
        if (nieuw.watchlist) app.setDemoMode(false); // echte import vervangt de demo
        if (nieuw.watchlist && app.tmdbKey) app.startEnrich(nieuw.watchlist);
        setReport({ ...diff, lijsten: res.lists?.length || 0, overgeslagen: res.overgeslagen || [] });
      }
    } catch (e) {
      meld(tr('imp.mislukt', { msg: e.message }), { soort: 'fout' });
    }
    setBusy(false);
  };

  const verslag = report && (
    <p role="status" style={{ color: 'var(--dot-g)', fontSize: 13.5, marginTop: 12 }}>
      {report.eerste
        ? tr('imp.repFirst', { count: report.totaal })
        : (() => {
          const delen = [
            report.nieuwOpWl ? tr('imp.repNewWl', { count: report.nieuwOpWl }) : null,
            report.vanWlAf ? tr('imp.repGone', { count: report.vanWlAf }) : null,
            report.nieuweRatings ? tr('imp.repNewRatings', { count: report.nieuweRatings }) : null,
            report.nieuwGezien ? tr('imp.repNewSeen', { count: report.nieuwGezien }) : null,
            report.nieuwInDagboek ? tr('imp.repNewDiary', { count: report.nieuwInDagboek }) : null,
            report.lijsten ? tr('imp.repLists', { count: report.lijsten }) : null,
          ].filter(Boolean);
          return delen.length ? tr('imp.repUpdated') + delen.join(', ') : tr('imp.repNothingNew');
        })()}
      {report.overgeslagen.length > 0 && (
        <span style={{ display: 'block', color: 'var(--fog)', marginTop: 4 }}>{tr('imp.repSkipped', { namen: report.overgeslagen.join(', ') })}</span>
      )}
    </p>
  );
  const kiezer = (
    <input
      ref={inputRef} type="file" multiple accept=".zip,.csv" hidden
      onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
    />
  );
  const slepen = {
    onDragOver: (e) => { e.preventDefault(); setDragOver(true); },
    onDragLeave: () => setDragOver(false),
    onDrop: (e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); },
  };

  // In Setup, met een eigen lijst: waar je watchlist vandaan komt, wat
  // vanzelf bijblijft, en één knop voor een nieuwe export
  if (!hero && !app.demoMode && app.watchlistAll?.length > 0) {
    const ex = app.lbExport;
    const dagen = ex?.datum ? Math.floor((Date.now() - Date.parse(ex.datum)) / DAG) : null;
    return (
      <div data-uitleg="import" {...slepen} style={{ outline: dragOver ? '1px dashed var(--paper)' : 'none', outlineOffset: 6 }}>
        <p style={{ fontSize: 14 }}>
          {ex?.datum
            ? tr('imp.status', { datum: datumTekst(ex.datum), count: app.watchlistAll.length })
            : tr('imp.statusZonder', { count: app.watchlistAll.length })}
          {dagen != null && dagen > 14 && <span style={{ color: 'var(--dot-o)' }}> {tr('imp.statusOud', { count: dagen })}</span>}
        </p>
        <p style={{ color: 'var(--fog)', fontSize: 13, marginTop: 6 }}>
          {tr(PROXY_URL && app.settings?.lbNaam ? 'imp.uitlegLive' : PROXY_URL ? 'imp.uitlegMetLive' : 'imp.uitlegZonderLive')}
        </p>
        {verslag}
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn primary" onClick={() => inputRef.current?.click()} disabled={busy}>
            <Upload size={15} /> {busy ? tr('imp.busy') : tr('imp.nieuweExport')}
          </button>
          <a className="btn ghost" href={EXPORT_URL} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
            {tr('imp.exportMaken')} <Download size={13} style={{ verticalAlign: -2 }} />
          </a>
        </div>
        {kiezer}
      </div>
    );
  }

  // De demo alleen voor wie nog geen eigen lijst heeft: anders zou hij die
  // vervangen
  const demoMag = !app.watchlistAll?.length || app.demoMode;

  const inner = (
    <div
      {...slepen}
      className="card" data-uitleg="import"
      style={{ borderStyle: 'dashed', borderColor: dragOver ? 'var(--paper)' : 'var(--line-strong)', textAlign: 'center', padding: '28px 20px' }}
    >
      <Upload size={22} strokeWidth={1.6} style={{ color: 'var(--fog)' }} aria-hidden="true" />
      <p style={{ marginTop: 10, fontWeight: 500 }}>{tr('imp.dropHere')}</p>
      <p style={{ color: 'var(--fog)', fontSize: 13, marginTop: 4 }}>
        {tr('imp.dropSub')}
      </p>
      {verslag}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
        <button className="btn primary" onClick={() => inputRef.current?.click()} disabled={busy}>
          <Upload size={15} /> {busy ? tr('imp.busy') : tr('imp.chooseFiles')}
        </button>
        {demoMag && <button className="btn" onClick={app.laadDemo} data-uitleg="import-demo"><Sparkles size={15} /> {tr('imp.tryDemo')}</button>}
      </div>
      {kiezer}
      <p style={{ color: 'var(--fog-dim)', fontSize: 12, marginTop: 14 }}>
        {tr('imp.privacy')}<a href={EXPORT_URL} target="_blank" rel="noreferrer">letterboxd.com/user/exportdata <Download size={11} style={{ verticalAlign: -1 }} /></a>
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
      {/* Wie hier binnenkomt om mee te stemmen, hoeft niets te laden */}
      {zaalBeschikbaar() && app.naarZaal && (
        <div className="zs-start" data-uitleg="zaal-code">
          <ZaalCodeInvoer onCode={app.naarZaal} kop={tr('zaal.startKop')} />
        </div>
      )}
      {inner}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18, marginTop: 26 }}>
        <div className="step"><div className="n">1</div><p dangerouslySetInnerHTML={{ __html: tr('imp.step1') }} /></div>
        <div className="step"><div className="n">2</div><p dangerouslySetInnerHTML={{ __html: tr(PROXY_URL ? 'imp.step2Proxy' : 'imp.step2') }} /></div>
        <div className="step"><div className="n">3</div><p dangerouslySetInnerHTML={{ __html: tr('imp.step3') }} /></div>
      </div>
    </div>
  );
}
