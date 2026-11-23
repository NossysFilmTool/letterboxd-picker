import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../lib/i18n.js';
import { beschikbaar, hoofdstukVoorTab, vindHoofdstuk, zoekUitleg } from '../lib/rondleiding.js';

// Het programma van de rondleiding (DESIGN.md, "De rondleiding"): alle
// hoofdstukken als programmaregels, het hoofdstuk van dit scherm bovenaan,
// verder waar je was, en een zoekregel voor wie hulp zoekt bij iets.

export default function UitlegProgramma({ app, tab, uitleg = {}, onStart, onSluit }) {
  const { t: tr } = useT();
  const kopId = useId();
  const [vraag, setVraag] = useState('');
  const ref = useRef(null);
  const sluitRef = useRef(onSluit);
  sluitRef.current = onSluit;
  const ctx = { app, tab, el: null, vind: () => null };
  const lijst = beschikbaar(ctx);
  const gezien = uitleg.gezien || [];
  const bezig = uitleg.bezig && vindHoofdstuk(uitleg.bezig.h) ? uitleg.bezig : null;
  const hier = hoofdstukVoorTab(tab);
  const treffers = useMemo(() => (vraag.trim() ? zoekUitleg(vraag, tr, ctx) : null), [vraag, tr]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const toets = (e) => { if (e.key === 'Escape') sluitRef.current(); };
    window.addEventListener('keydown', toets);
    const oud = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => { window.removeEventListener('keydown', toets); document.body.style.overflow = oud; };
  }, []);

  const nummer = (h) => String(lijst.indexOf(h) + 1).padStart(2, '0');
  const stand = (h) => {
    if (bezig?.h === h.id) return tr('uitleg.pBezig');
    if (gezien.includes(h.id)) return tr('uitleg.pGezien');
    return '';
  };
  const regel = (h, { stap = 0, onder = null, boven = null } = {}) => (
    <li key={`${h.id}.${stap}.${boven || ''}`}>
      <button type="button" className="uitleg-regel" onClick={() => onStart(h.id, stap)}>
        <span className="label-breed uitleg-regel-nr">{boven || nummer(h)}</span>
        <span className="uitleg-regel-titel">{tr(`uitleg.h.${h.id}.titel`)}</span>
        <span className="uitleg-regel-meta label-breed">
          <span>{tr('uitleg.pDuur', { n: h.duur })}</span>
          {stand(h) && <span>{stand(h)}</span>}
        </span>
        {onder && <span className="uitleg-regel-onder">{onder}</span>}
      </button>
    </li>
  );

  return createPortal(
    <>
      <div className="uitleg-programma-achter" aria-hidden="true" onClick={onSluit} />
      <div ref={ref} tabIndex={-1} className="uitleg-programma" role="dialog" aria-modal="true" aria-labelledby={kopId}>
        <span className="kassa-la-greep" aria-hidden="true" />
        <div className="uitleg-programma-kop">
          <h2 id={kopId}>{tr('uitleg.pKop')}</h2>
          <button type="button" className="linkbtn" onClick={onSluit}>{tr('common.close')}</button>
        </div>
        <p className="uitleg-programma-sub">{tr('uitleg.pSub')}</p>
        {bezig && (
          <button type="button" className="btn primary uitleg-verder" onClick={() => onStart(bezig.h, bezig.s)}>
            {tr('uitleg.pVerder', { titel: tr(`uitleg.h.${bezig.h}.titel`) })}
          </button>
        )}
        <label className="zoekregel uitleg-zoek">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5l5 5" /></svg>
          <input type="search" value={vraag} onChange={(e) => setVraag(e.target.value)}
            placeholder={tr('uitleg.pZoekPlaceholder')} aria-label={tr('uitleg.pZoek')} />
        </label>
        {treffers ? (
          treffers.length ? (
            <ol className="uitleg-regels" aria-label={tr('uitleg.pTreffers')}>
              {treffers.map((x) => regel(x.h, { stap: x.stap, onder: x.kop ? tr('uitleg.pBij', { kop: x.kop }) : null }))}
            </ol>
          ) : <p className="uitleg-programma-niets">{tr('uitleg.pNiets')}</p>
        ) : (
          <>
            {hier && lijst.includes(hier) && (
              <ol className="uitleg-regels hier" aria-label={tr('uitleg.pHier')}>
                {regel(hier, { boven: tr('uitleg.pHier') })}
              </ol>
            )}
            <ol className="uitleg-regels" aria-label={tr('uitleg.pAlle')}>
              {lijst.map((h) => regel(h))}
            </ol>
          </>
        )}
      </div>
    </>,
    document.body,
  );
}
