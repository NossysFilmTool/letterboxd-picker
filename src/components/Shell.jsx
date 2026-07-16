import { Dice5, LibraryBig, Compass, Users, ChartNoAxesColumn, Settings } from 'lucide-react';
import { useT } from '../lib/i18n.js';

const TABS = [
  { id: 'pick', key: 'pick', Icon: Dice5, cls: 't-pick' },
  { id: 'bieb', key: 'bieb', Icon: LibraryBig, cls: 't-inzicht' },
  { id: 'verken', key: 'verken', Icon: Compass, cls: 't-verken' },
  { id: 'avond', key: 'avond', Icon: Users, cls: 't-avond' },
  { id: 'inzicht', key: 'inzicht', Icon: ChartNoAxesColumn, cls: 't-inzicht' },
];

function NavButtons({ tab, setTab, withSettings }) {
  const { t } = useT();
  return (
    <>
      {TABS.map(({ id, key, Icon, cls }) => {
        const label = t(`nav.${key}`);
        return (
        <button
          key={id}
          className={`nav-btn ${cls} ${tab === id ? 'active' : ''}`}
          onClick={() => setTab(id)}
          aria-label={label}
        >
          <Icon size={19} strokeWidth={1.8} />
          <span>{label}</span>
        </button>
        );
      })}
      {withSettings && (
        <>
        <div className="spacer" />
        <button
          className={`nav-btn t-inzicht ${tab === 'instellingen' ? 'active' : ''}`}
          onClick={() => setTab('instellingen')}
          aria-label={t('nav.setup')}
        >
          <Settings size={19} strokeWidth={1.8} />
          <span>{t('nav.setup')}</span>
        </button>
        </>
      )}
    </>
  );
}

export default function Shell({ tab, setTab, children }) {
  const { t } = useT();
  return (
    <div className="shell">
      <nav className="rail" aria-label={t('nav.navLabel')}>
        <div className="dots" aria-hidden="true">
          <span style={{ background: 'var(--dot-o)' }} />
          <span style={{ background: 'var(--dot-g)' }} />
          <span style={{ background: 'var(--dot-b)' }} />
        </div>
        <NavButtons tab={tab} setTab={setTab} withSettings />
      </nav>
      <main className="main">
        <div className="content">{children}</div>
      </main>
      <nav className="bottombar" aria-label={t('nav.navLabel')}>
        <NavButtons tab={tab} setTab={setTab} withSettings />
      </nav>
    </div>
  );
}
