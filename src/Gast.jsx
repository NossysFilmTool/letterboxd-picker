import { useState } from 'react';
import RemoteVote from './components/RemoteVote.jsx';
import SamenGast from './components/SamenGast.jsx';
import ZaalTelefoon from './components/ZaalTelefoon.jsx';
import Meldingen from './components/Meldingen.jsx';
import { zaalCode } from './lib/zaalstemming.js';
import { useLS, leesOpslag, schrijfOpslag } from './lib/storage.js';
import { nieuwKaartje, voegKaartjeToe } from './lib/kaartjesdoos.js';
import { useRekenInstellingen } from './app/useRekenInstellingen.js';

// Wie binnenkomt met een deellink (?avond, ?samen) of een zaalcode (?zaal)
// krijgt alleen zijn eigen scherm (main.jsx): een telefoon die net de
// QR-code scande, hoeft de hele tool niet te laden. Dezelfde schermen als in
// App.jsx, met dezelfde instellingen (taal, regio).
export default function Gast() {
  const [settings] = useLS('settings', { tmdbKey: '' });
  useRekenInstellingen(settings);
  const p = new URLSearchParams(location.search);
  const [zaal, setZaal] = useState(() => zaalCode(p.get('zaal')));
  // Het kaartje mee naar huis: in je eigen kaartjesdoos, voor als je de tool
  // zelf ook gebruikt
  const geefKaartje = (film, opties = {}) => {
    schrijfOpslag('kaartjes', voegKaartjeToe(leesOpslag('kaartjes', []) || [], nieuwKaartje(film, opties)));
  };
  // Weg uit de zaal of een andere code: de hele tool, of die andere zaal
  const weg = () => { location.href = location.pathname; };
  const naarZaal = (code) => {
    window.history.pushState({}, '', `${location.pathname}?zaal=${code}`);
    setZaal(code);
  };

  let scherm = null;
  if (zaal) scherm = <ZaalTelefoon key={zaal} code={zaal} onWeg={weg} onCode={naarZaal} onKaartje={geefKaartje} />;
  else if (p.get('avond')) scherm = <RemoteVote code={p.get('avond')} />;
  else if (p.get('samen')) scherm = <SamenGast code={p.get('samen')} />;
  return <><Meldingen />{scherm}</>;
}
