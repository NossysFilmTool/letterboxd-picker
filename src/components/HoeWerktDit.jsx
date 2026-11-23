import { useT } from '../lib/i18n.js';

// Een stil linkje bij een kaart met veel opzet: het opent de rondleiding
// meteen bij het goede hoofdstuk en de goede stap (DESIGN.md, "De
// rondleiding": geen banners, wel een ingang waar je hem zoekt).
export default function HoeWerktDit({ app, h, stap }) {
  const { t: tr } = useT();
  if (!app?.openUitleg) return null;
  return (
    <button type="button" className="linkbtn hoe-werkt" onClick={() => app.openUitleg(h, stap)}>
      {tr('uitleg.hoeWerkt')}
    </button>
  );
}
