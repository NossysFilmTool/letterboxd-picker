import { useT } from '../lib/i18n.js';

// Het voor/na-blokje: laat in één oogopslag zíen wat OMDb-sleutels toevoegen,
// in plaats van het uit te leggen. Puur decoratief (aria-hidden); de tekst
// ernaast draagt de boodschap voor schermlezers.
export default function ScoresPreview() {
  const { lang } = useT();
  const d = (s) => (lang === 'nl' ? s : s.replace(',', '.'));
  return (
    <div className="scores-preview" aria-hidden="true">
      <div className="sp-card sp-before">
        <span className="sp-src">TMDB</span> {d('7,8')}
      </div>
      <span className="sp-arrow">→</span>
      <div className="sp-card sp-after">
        <span className="sp-nossy">◉ {d('7,9')}</span>
        <span><span className="sp-src">IMDb</span> {d('7,8')}</span>
        <span>🍅 93%</span>
        <span><span className="sp-src">Meta</span> 81</span>
      </div>
    </div>
  );
}
