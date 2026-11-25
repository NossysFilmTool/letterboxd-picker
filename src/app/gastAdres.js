import { zaalCode } from '../lib/zaalstemming.js';

// Is dit adres voor een gast (een deellink of een zaalcode)? main.jsx laadt
// dan alleen het gastenscherm (Gast.jsx), niet de hele tool. Een eigen
// klein bestand, zodat main.jsx Gast.jsx niet meteen meeneemt.
export const isGastAdres = (search) => {
  const p = new URLSearchParams(search);
  return !!(p.get('avond') || p.get('samen') || zaalCode(p.get('zaal')));
};
