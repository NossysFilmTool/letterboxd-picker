import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../lib/i18n.js';
import { drukletters, kaartjeDatum, aanvangTijd, streepjes } from '../lib/kaartje.js';
import { premiereInhoud } from '../lib/premiere.js';
import { leesOpslag } from '../lib/storage.js';
import { ontgrendel } from '../lib/zaalgeluid.js';
import Pitch from './Pitch.jsx';

// De première van Nossy 5 (DESIGN.md, "De première"). Eerst je kaartje bij de
// deur: echt, met de aanvang van nu en jouw aantallen. Tik erop en de strook
// scheurt af; die tik zet ook het geluid aan, want een browser wil eerst een
// tik. Dan gaat het licht uit en volgt een trailer van je eigen tijd met
// Nossy (Pitch.jsx met de inhoud uit lib/premiere.js). Met "beperk beweging"
// ga je meteen naar het eindbeeld, zonder geluid.

const stilGewenst = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const SCHEUR_DUUR = 900;

export default function Premiere({ app, onKlaar }) {
  const { t: tr, lang } = useT();
  const [fase, setFase] = useState('deur'); // deur | scheurt | trailer
  const [nu] = useState(() => new Date());
  const klaarRef = useRef(onKlaar);
  klaarRef.current = onKlaar;
  const knopRef = useRef(null);
  const geluid = app.settings?.pitchGeluid !== false;

  // De inhoud ligt vast zodra de deur opengaat
  const inhoud = useMemo(() => premiereInhoud({
    watchlist: app.watchlist, kaartjesStand: app.kaartjesStand || [], meta: app.meta,
    diensten: leesOpslag('mijnDiensten', []), tr, nu,
  }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const film = useMemo(() => ({ key: 'premiere', name: tr('premiere.titel'), inhoud }), [inhoud, tr]);

  // Bij de deur: Escape slaat over, de pagina eronder scrolt niet mee
  useEffect(() => {
    if (fase === 'trailer') return undefined;
    const toets = (e) => { if (e.key === 'Escape') klaarRef.current(); };
    window.addEventListener('keydown', toets);
    const oud = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', toets); document.body.style.overflow = oud; };
  }, [fase]);
  useEffect(() => { knopRef.current?.focus(); }, []);
  useEffect(() => {
    if (fase !== 'scheurt') return undefined;
    const t = setTimeout(() => setFase('trailer'), SCHEUR_DUUR);
    return () => clearTimeout(t);
  }, [fase]);

  const binnen = () => {
    if (fase !== 'deur') return;
    const stil = stilGewenst();
    if (geluid && !stil) ontgrendel();
    setFase(stil ? 'trailer' : 'scheurt');
  };

  if (fase === 'trailer') {
    return (
      <Pitch films={[film]} meta={app.meta} tmdbKey={null} onKlaar={() => klaarRef.current()}
        geluid={geluid} onGeluid={(v) => app.setSettings((s) => ({ ...s, pitchGeluid: v }))}
        teksten={{ introKop: tr('premiere.introKop'), overslaan: tr('premiere.overslaan'), naarEinde: tr('premiere.naarKassa'), aria: tr('premiere.aria') }} />
    );
  }

  const klok = new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' }).format(aanvangTijd(nu));
  const balken = streepjes('NOSSY 5.0', 120);
  const velden = [
    { k: tr('kaartje.aanvang'), v: klok },
    inhoud.inDeDoos ? { k: tr('premiere.veldDoos'), v: String(inhoud.inDeDoos) } : null,
    { k: tr('premiere.veldLijst'), v: String(inhoud.opLijst) },
  ].filter(Boolean);

  return createPortal(
    <div className="premiere" role="dialog" aria-modal="true" aria-label={tr('premiere.aria')}>
      <div className="premiere-top">
        <button type="button" className="linkbtn" onClick={() => klaarRef.current()}>{tr('premiere.overslaanKort')}</button>
      </div>
      <p className="premiere-kop">{tr('premiere.vanavond')}</p>
      <button ref={knopRef} type="button" className={`kaartje-premiere${fase === 'scheurt' ? ' scheurt' : ''}`}
        onClick={binnen} aria-label={tr('premiere.binnenAria')}>
        <span className="kaartje-premiere-strook" aria-hidden="true">
          <span className="kaartje-premiere-merk">{drukletters('Nossy', lang)}</span>
          <span className="kaartje-premiere-vijf">5</span>
        </span>
        <span className="kaartje-premiere-body" aria-hidden="true">
          <span className="kaartje-premiere-kop"><span>{drukletters(tr('kaartje.kop'), lang)}</span><span>{kaartjeDatum(nu, lang)}</span></span>
          <span className="kaartje-premiere-titel">{drukletters(tr('premiere.voorstelling'), lang)}</span>
          <span className="kaartje-premiere-aftiteling">{tr('premiere.aftiteling')}</span>
          <span className="kaartje-premiere-velden">
            {velden.map((v) => (
              <span key={v.k}><span className="kaartje-premiere-dt">{v.k}</span><span className="kaartje-premiere-dd">{v.v}</span></span>
            ))}
          </span>
          <span className="kaartje-premiere-voet">
            <svg width="120" height="26" viewBox="0 0 120 26">
              {balken.map(([x, w]) => <rect key={x} x={x} y="0" width={w} height="26" />)}
            </svg>
            <span className="kaartje-premiere-toegang">{drukletters(tr('kaartje.toegang', { count: 1, n: 1 }), lang)}</span>
          </span>
        </span>
      </button>
      <p className="premiere-hint">{tr('premiere.tik')}</p>
      {geluid && <p className="premiere-sub">{tr('premiere.geluid')}</p>}
    </div>,
    document.body,
  );
}
