import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../lib/i18n.js';

// Filmleader-aftelling: 3… 2… 1… met roterende klok-wipe, dan flits en klaar.
// Bij prefers-reduced-motion wordt de overlay via CSS verborgen; onDone vuurt dan direct.
export default function Leader({ onDone }) {
  const { t: tr } = useT();
  const [num, setNum] = useState(3);
  const [sweep, setSweep] = useState(0);
  const [flash, setFlash] = useState(false);
  const [hair] = useState(() => Math.random() < 0.05); // paasei: haartje in de gate
  const raf = useRef(null);
  // onDone in een ref: de ouder geeft bij elke render een nieuwe functie mee.
  // Stond die in de afhankelijkheden, dan begon het aftellen bij elke render
  // opnieuw. Terwijl de app op de achtergrond films ververst (elke ~300 ms
  // een update) bleef het daardoor eindeloos op 3 hangen.
  const klaarRef = useRef(onDone);
  klaarRef.current = onDone;

  useEffect(() => {
    let klaar = false;
    const af = () => { if (!klaar) { klaar = true; klaarRef.current(); } };
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      af();
      return undefined;
    }
    const STEP = 720; // ms per cijfer
    const start = performance.now();
    let flitsTimer;
    // Vangnet: requestAnimationFrame kan stilvallen (tab op de achtergrond,
    // trage telefoon). Na de volle duur plus marge is je pick er hoe dan ook.
    const vangnet = setTimeout(af, STEP * 3 + 1500);
    const tick = (now) => {
      const elapsed = Math.max(0, now - start);
      const idx = Math.floor(elapsed / STEP);
      const within = (elapsed % STEP) / STEP;
      if (idx >= 3) {
        setFlash(true);
        flitsTimer = setTimeout(af, 320);
        return;
      }
      setNum(3 - idx);
      setSweep(within * 360);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf.current); clearTimeout(vangnet); clearTimeout(flitsTimer); };
  }, []);

  // Portal naar <body>: geen enkele ouder-animatie (tab-crossfade e.d.) kan de
  // fixed-positionering dan nog kapen — gegarandeerd schermvullend.
  return createPortal(
    <div className={`leader ${flash ? 'flash' : ''}`} role="status" aria-label={tr('pick.aftellenAria')}>
      <div className="flick" aria-hidden="true" />
      <div className="frame">
        <div className="cross-h" />
        <div className="cross-v" />
        <div className="wipe" style={{ '--sweep': `${sweep}deg` }} />
        <div className="ring" />
        <div className="ring inner-ring" />
        <div className="num">{num}</div>
        {hair && <div className="hair" aria-hidden="true" />}
        <div className="cap">{tr('pick.komtEraan')}</div>
      </div>
    </div>,
    document.body,
  );
}
