import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../lib/i18n.js';

// De trailers van de drie films, echt van YouTube, op het grote scherm. Na
// de laatste trailer begint de stemming vanzelf (onKlaar). YouTube meldt het
// einde van een trailer via postMessage zodra we laten weten dat we
// luisteren; zonder dat seintje tik je zelf door. onNu hoort welke trailer
// er draait ({ key, i, n }), voor de telefoons.
const YOUTUBE = /^https:\/\/www\.youtube(-nocookie)?\.com$/;

export default function ZaalTrailers({ films, onKlaar, onSluit, onNu }) {
  const { t: tr } = useT();
  const lijst = films.filter((f) => f.trailer);
  const [i, setI] = useState(0);
  const frame = useRef(null);
  const knop = useRef(null);
  const afgelopen = useRef(null);
  const film = lijst[i];

  const volgende = () => (i + 1 < lijst.length ? setI(i + 1) : onKlaar());
  const volgendeRef = useRef(volgende);
  volgendeRef.current = volgende;
  const sluitRef = useRef(onSluit);
  sluitRef.current = onSluit;
  const nuRef = useRef(null);
  nuRef.current = film ? `${i}|${film.trailer}` : null;
  const meldRef = useRef(onNu);
  meldRef.current = onNu;
  useEffect(() => {
    if (film) meldRef.current?.({ key: film.key, i: i + 1, n: lijst.length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, film?.key]);

  useEffect(() => {
    const opBericht = (e) => {
      if (!YOUTUBE.test(e.origin) || e.source !== frame.current?.contentWindow) return;
      let d = e.data;
      if (typeof d === 'string') { try { d = JSON.parse(d); } catch { return; } }
      const stand = d?.event === 'onStateChange' ? d.info : d?.event === 'infoDelivery' ? d.info?.playerState : undefined;
      // 0 = afgelopen; YouTube meldt dat soms vaker, dus één keer per trailer
      if (stand === 0 && afgelopen.current !== nuRef.current) {
        afgelopen.current = nuRef.current;
        volgendeRef.current();
      }
    };
    const opToets = (e) => { if (e.key === 'Escape') sluitRef.current(); };
    window.addEventListener('message', opBericht);
    window.addEventListener('keydown', opToets);
    knop.current?.focus();
    return () => { window.removeEventListener('message', opBericht); window.removeEventListener('keydown', opToets); };
  }, []);

  if (!film) return null;
  const luister = () => {
    const w = frame.current?.contentWindow;
    if (!w) return;
    w.postMessage(JSON.stringify({ event: 'listening', id: 'zaal', channel: 'widget' }), '*');
    w.postMessage(JSON.stringify({ event: 'command', func: 'addEventListener', args: ['onStateChange'], id: 'zaal', channel: 'widget' }), '*');
  };
  const herkomst = typeof location !== 'undefined' ? encodeURIComponent(location.origin) : '';
  const laatste = i + 1 >= lijst.length;

  return createPortal(
    <div className="zs-trailers" data-uitleg-moment="" role="dialog" aria-modal="true" aria-label={tr('zaal.trailerAria', { name: film.name })}>
      <div className="zs-trailers-top">
        <p className="label-breed">{tr('zaal.trailerVan', { i: i + 1, n: lijst.length })}</p>
        <p className="zs-trailers-titel">{film.name}{film.year ? <span> {film.year}</span> : null}</p>
      </div>
      <div className="zs-trailers-doek">
        <iframe key={film.trailer} ref={frame} onLoad={luister} title={tr('zaal.trailerAria', { name: film.name })}
          src={`https://www.youtube-nocookie.com/embed/${film.trailer}?autoplay=1&rel=0&playsinline=1&enablejsapi=1&origin=${herkomst}`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
      </div>
      <div className="zs-trailers-knoppen">
        {i > 0 && <button type="button" className="btn" onClick={() => setI(i - 1)}>{tr('zaal.vorige')}</button>}
        <button type="button" ref={knop} className="btn primary" onClick={volgende}>{laatste ? tr('zaal.klaarMetTrailers') : tr('zaal.volgende')}</button>
        <button type="button" className="linkbtn" onClick={onSluit}>{tr('zaal.sluitTrailer')}</button>
      </div>
    </div>,
    document.body,
  );
}
