import { useT } from '../lib/i18n.js';

// De kop en de navigatie van "Het programma" (DESIGN.md): bovenaan de naam
// van het huis en de datum van vandaag, zoals op een gedrukt programma. Op
// een breed scherm staat de navigatie als woorden in de kop; op een telefoon
// onderin, met eigen getekende pictogrammen in plaats van een standaardset.

const TABS = [
  { id: 'pick', key: 'pick' },
  { id: 'bieb', key: 'bieb' },
  { id: 'verken', key: 'verken' },
  { id: 'avond', key: 'avond' },
  { id: 'inzicht', key: 'inzicht' },
];

// Zes eigen pictogrammen: gevulde vormen, één gewicht. Het kaartje, de
// filmspoel, het gevouwen programma, twee stoelen, het jaarboek, de sleutel.
export function Pictogram({ naam, size = 24 }) {
  const gat = { stroke: 'var(--ink)', strokeWidth: 1.6, fill: 'none' };
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      {naam === 'pick' && (<><path d="M3 6h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4z" /><path d="M15 7.5v2M15 11v2M15 14.5v2" {...gat} /></>)}
      {naam === 'bieb' && (<><circle cx="12" cy="12" r="9.5" /><g fill="var(--ink)"><circle cx="12" cy="6.8" r="2.1" /><circle cx="7.5" cy="14.6" r="2.1" /><circle cx="16.5" cy="14.6" r="2.1" /><circle cx="12" cy="12" r="1" /></g></>)}
      {naam === 'verken' && (<><path d="M3.5 5.5l7.5 2v13l-7.5-2z" /><path d="M13 7.5l7.5-2v13l-7.5 2z" /></>)}
      {naam === 'avond' && (<><path d="M2.5 20v-7.5a4 4 0 0 1 8 0V20z" /><path d="M13.5 20v-7.5a4 4 0 0 1 8 0V20z" /></>)}
      {naam === 'inzicht' && (<><path d="M5 3.5h11.5a2.5 2.5 0 0 1 2.5 2.5v14.5H7.5A2.5 2.5 0 0 1 5 18z" /><path d="M8 17.2h11" {...gat} /></>)}
      {naam === 'setup' && (<path fillRule="evenodd" d="M8 4.5a5 5 0 0 1 4.7 3.3H21v3.4h-2v2.6h-3v-2.6h-3.3A5 5 0 1 1 8 4.5zm0 3.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6z" />)}
    </svg>
  );
}

export default function Shell({ tab, setTab, children }) {
  const { t, lang } = useT();
  const datum = new Intl.DateTimeFormat(lang, { weekday: 'short', day: 'numeric', month: 'long' }).format(new Date());
  const knop = (id, key, klasse, metPictogram) => {
    const label = t(`nav.${key}`);
    return (
      <button key={id} type="button" className={`${klasse} ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}
        aria-label={label} aria-current={tab === id ? 'page' : undefined}>
        {metPictogram && <Pictogram naam={id} />}
        <span>{label}</span>
      </button>
    );
  };
  return (
    <div className="shell">
      <header className="kop">
        <span className="kop-naam">{t('nav.huis')}</span>
        <nav className="kop-nav" aria-label={t('nav.navLabel')}>
          {TABS.map(({ id, key }) => knop(id, key, 'kop-knop', false))}
        </nav>
        <span className="kop-rechts">
          <span className="label-breed kop-datum">{datum}</span>
          <button type="button" className={`kop-setup ${tab === 'instellingen' ? 'active' : ''}`} onClick={() => setTab('instellingen')}
            aria-label={t('nav.setup')} aria-current={tab === 'instellingen' ? 'page' : undefined}>
            <Pictogram naam="setup" size={20} />
            <span>{t('nav.setup')}</span>
          </button>
        </span>
      </header>
      <main className="main">
        <div className="content">{children}</div>
      </main>
      <nav className="bottombar" aria-label={t('nav.navLabel')}>
        {TABS.map(({ id, key }) => knop(id, key, 'nav-btn', true))}
      </nav>
    </div>
  );
}
