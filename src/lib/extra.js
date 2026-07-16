import { t } from './i18n.js';
import { filmKey } from './storage.js';
import { IMG } from './tmdb.js';

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

  ctx.fillStyle = '#0d1115';
  ctx.fillRect(0, 0, W, H);

  if (meta?.backdrop) {
    try {
      const bg = await loadImage(IMG(meta.backdrop, 'w780'));
      ctx.save();
      ctx.filter = 'blur(38px) brightness(0.4)';
      const scale = Math.max(W / bg.width, H / bg.height) * 1.15;
      ctx.drawImage(bg, (W - bg.width * scale) / 2, (H - bg.height * scale) / 2, bg.width * scale, bg.height * scale);
      ctx.restore();
    } catch { /* zonder backdrop verder */ }
  }
  ctx.fillStyle = 'rgba(13,17,21,0.42)';
  ctx.fillRect(0, 0, W, H);

  const px = 340; const py = 510;
  const pw = W - 2 * px + 60; // 460 breed
  const ph = pw * 1.5;
  const pxx = (W - pw) / 2; const pyy = 190;
  if (meta?.poster) {
    try {
      const poster = await loadImage(IMG(meta.poster, 'w500'));
      ctx.save();
      roundRect(ctx, pxx, pyy, pw, ph, 20);
      ctx.clip();
      ctx.drawImage(poster, pxx, pyy, pw, ph);
      ctx.restore();
      ctx.strokeStyle = 'rgba(238,242,245,0.25)';
      ctx.lineWidth = 2;
      roundRect(ctx, pxx, pyy, pw, ph, 20);
      ctx.stroke();
    } catch { /* poster kan falen door CORS */ }
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#99aabb';
  ctx.font = '600 30px Inter, sans-serif';
  ctx.fillText(t('share.eyebrow'), W / 2, 120);

  ctx.fillStyle = '#eef2f5';
  ctx.font = '400 76px "Instrument Serif", Georgia, serif';
  const title = film.name.length > 26 ? film.name.slice(0, 25) + '…' : film.name;
  ctx.fillText(title, W / 2, pyy + ph + 110);

  ctx.fillStyle = '#99aabb';
  ctx.font = '400 32px Inter, sans-serif';
  const parts = [film.year, meta?.runtime ? `${meta.runtime} min` : null, meta?.director].filter(Boolean);
  ctx.fillText(parts.join('  ·  '), W / 2, pyy + ph + 168);

  if (meta?.vote) {
    ctx.fillStyle = '#ff8000';
    ctx.beginPath();
    ctx.arc(W / 2 - 76, pyy + ph + 226, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#eef2f5';
    ctx.font = '500 34px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${String(meta.vote).replace('.', ',')} op TMDB`, W / 2 - 54, pyy + ph + 238);
    ctx.textAlign = 'center';
  }

  ctx.fillStyle = '#5f6d7a';
  ctx.font = '400 24px Inter, sans-serif';
  ctx.fillText("Gekozen met Nossy's Picker · filmdata: TMDB", W / 2, H - 56);

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
