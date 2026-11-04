import { useState } from 'react';
import { useT } from '../lib/i18n.js';

// Sterren geven met halve sterren, zoals op Letterboxd: de linkerhelft van een
// ster geeft een halve. Elke helft is een eigen knop (toetsenbord en
// schermlezer werken gewoon), de ster eronder toont de keuze.
export default function Sterren({ onKies, klein = false }) {
  const { t: tr, lang } = useT();
  const [hover, setHover] = useState(0);
  const fmt = (n) => (lang === 'nl' ? String(n).replace('.', ',') : String(n));
  return (
    <span className={`sterren ${klein ? 'klein' : ''}`} role="group" aria-label={tr('verken.sterrenAria')} onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className="ster">
          <span className={`ster-vul ${hover >= n ? 'vol' : hover >= n - 0.5 ? 'half' : ''}`} aria-hidden="true">★</span>
          <button type="button" className="ster-links" aria-label={tr('pick.rateAria', { n: fmt(n - 0.5) })}
            onMouseEnter={() => setHover(n - 0.5)} onFocus={() => setHover(n - 0.5)} onBlur={() => setHover(0)} onClick={() => onKies(n - 0.5)} />
          <button type="button" className="ster-rechts" aria-label={tr('pick.rateAria', { n: fmt(n) })}
            onMouseEnter={() => setHover(n)} onFocus={() => setHover(n)} onBlur={() => setHover(0)} onClick={() => onKies(n)} />
        </span>
      ))}
    </span>
  );
}
