import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { vangOnopgevangen } from './lib/foutlog.js';
import { laadTaal, setLang, detectLang } from './lib/i18n.js';
import { leesOpslag } from './lib/storage.js';
import { isGastAdres } from './app/gastAdres.js';

vangOnopgevangen();

// Een gast (deellink of zaalcode) krijgt alleen zijn eigen scherm; de hele
// tool laadt pas voor wie hem zelf gebruikt. En alleen de eigen taal.
const taal = detectLang(leesOpslag('settings', {})?.lang);
const scherm = isGastAdres(location.search) ? import('./Gast.jsx') : import('./App.jsx');
const root = document.getElementById('root');

Promise.all([scherm, laadTaal(taal).then(() => setLang(taal)).catch(() => {})])
  .then(([{ default: Scherm }]) => {
    createRoot(root).render(
      <React.StrictMode>
        <Scherm />
      </React.StrictMode>,
    );
  })
  .catch(() => {
    // Zonder netwerk en nog niets bewaard: liever een zin dan een leeg scherm
    root.textContent = taal === 'nl'
      ? 'Laden lukte niet. Kijk of je verbinding hebt en ververs de pagina.'
      : 'Could not load. Check your connection and refresh the page.';
  });
