import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';

// Filmleader-aftelling: 3… 2… 1… met roterende klok-wipe, dan flits en klaar.
// Bij prefers-reduced-motion wordt de overlay via CSS verborgen; onDone vuurt dan direct.
export default function Leader({ onDone }) {
  const [num, setNum] = useState(3);
  const [sweep, setSweep] = useState(0);
  const [flash, setFlash] = useState(false);
  const [hair] = useState(() => Math.random() < 0.05); // paasei: haartje in de gate
  const raf = useRef(null);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      onDone();
      return undefined;
    }
    const STEP = 720; // ms per cijfer
    const start = performance.now();
    const tick = (now) => {
      const elapsed = now - start;
      const idx = Math.floor(elapsed / STEP);
      const within = (elapsed % STEP) / STEP;
      if (idx >= 3) {
        setFlash(true);
        setTimeout(onDone, 320);
        return;
      }
      setNum(3 - idx);
      setSweep(within * 360);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [onDone]);

  // Portal naar <body>: geen enkele ouder-animatie (tab-crossfade e.d.) kan de
  // fixed-positionering dan nog kapen — gegarandeerd schermvullend.
  return createPortal(
    <div className={`leader ${flash ? 'flash' : ''}`} role="status" aria-label="Aftellen naar je pick">
      <div className="flick" aria-hidden="true" />
      <div className="frame">
        <div className="cross-h" />
        <div className="cross-v" />
        <div className="wipe" style={{ '--sweep': `${sweep}deg` }} />
        <div className="ring" />
        <div className="ring inner-ring" />
        <div className="num">{num}</div>
        {hair && <div className="hair" aria-hidden="true" />}
        <div className="cap">Jouw pick komt eraan</div>
      </div>
    </div>,
    document.body,
  );
}
