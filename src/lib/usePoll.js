import { useEffect, useRef } from 'react';

// Poll-hook die zuinig omgaat met de KV-limieten: hij vuurt alleen als het
// tabblad zichtbaar is. Gaat het tabblad naar de achtergrond (of vergeet
// iemand het scherm open te laten staan), dan stopt het pollen vanzelf en
// hervat het bij terugkeer. Scheelt honderden verzoeken bij een vergeten tab.
export function usePoll(fn, intervalMs, actief = true) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!actief) return undefined;
    let timer = null;

    const tick = () => { if (!document.hidden) fnRef.current(); };
    const start = () => {
      if (timer) return;
      tick(); // meteen één keer bij (her)start
      timer = setInterval(tick, intervalMs);
    };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };

    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVisibility);
    if (!document.hidden) start();

    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [intervalMs, actief]);
}
