import { t } from './i18n.js';
import { filmKey } from './storage.js';
import { IMG } from './tmdb.js';
import { leesFilmkleur } from './filmkleur.js';

const DEMO_TITLES = [
  ['Aftersun', 2022], ['Past Lives', 2023], ['The Zone of Interest', 2023],
  ['Anatomie d’une chute', 2023], ['La haine', 1995], ['Paris, Texas', 1984],
  ['Portrait de la jeune fille en feu', 2019], ['Parasite', 2019], ['Perfect Days', 2023],
  ['Come and See', 1985], ['Stalker', 1979], ['In the Mood for Love', 2000],
  ['Turks fruit', 1973], ['De vierde man', 1983], ['Close', 2022],
  ['The Worst Person in the World', 2021], ['Uncut Gems', 2019], ['Whiplash', 2014],
  ['Columbus', 2017], ['First Cow', 2019], ['Petite maman', 2021],
  ['The Lighthouse', 2019], ['Sound of Metal', 2019], ['Drive My Car', 2021],
];

export const demoWatchlist = () =>
  DEMO_TITLES.map(([name, year]) => ({ key: filmKey(name, year), name, year, uri: '' }));

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Deelbare pick-kaart (1080x1350, 4:5) als PNG-blob
export async function renderShareCard(film, meta) {
  try { await document.fonts.ready; } catch { /* fonts optioneel */ }
  const W = 1080; const H = 1350;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');

  // "De zaal" (DESIGN.md): het vlak neemt de kleur van de film aan, onderin
  // een donkere strook; platte vormen, geen gloed of vervaging.
  const filmkleur = await leesFilmkleur(meta?.poster);
  ctx.fillStyle = filmkleur;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#121110';
  ctx.fillRect(0, H - 120, W, 120);

  const pw = 460;
  const ph = pw * 1.5;
  const pxx = (W - pw) / 2; const pyy = 190;
  if (meta?.poster) {
    try {
      const poster = await loadImage(IMG(meta.poster, 'w500'));
      ctx.save();
      roundRect(ctx, pxx, pyy, pw, ph, 4);
      ctx.clip();
      ctx.drawImage(poster, pxx, pyy, pw, ph);
      ctx.restore();
    } catch { /* poster kan falen door CORS */ }
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.font = '600 30px Archivo, sans-serif';
  ctx.fillText(t('share.eyebrow'), W / 2, 120);

  ctx.fillStyle = '#f4efe6';
  ctx.font = '700 84px "Archivo Narrow", Archivo, sans-serif';
  const title = film.name.length > 26 ? film.name.slice(0, 25) + '…' : film.name;
  ctx.fillText(title, W / 2, pyy + ph + 110);

  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = '400 32px Archivo, sans-serif';
  const parts = [
    film.year,
    meta?.runtime ? `${meta.runtime} min` : null,
    meta?.director,
    meta?.vote ? `TMDB ${String(meta.vote).replace('.', ',')}` : null,
  ].filter(Boolean);
  ctx.fillText(parts.join(',   '), W / 2, pyy + ph + 172);

  ctx.fillStyle = '#a69f94';
  ctx.font = '400 24px Archivo, sans-serif';
  ctx.fillText("Gekozen met Nossy's Picker. Filmdata: TMDB", W / 2, H - 52);

  return new Promise((resolve) => c.toBlob(resolve, 'image/png'));
}

export async function shareOrDownload(blob, filename) {
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch { /* geannuleerd → download */ }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
