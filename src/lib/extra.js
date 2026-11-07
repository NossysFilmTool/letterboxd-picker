import { t, getLang } from './i18n.js';
import { filmKey } from './storage.js';
import { IMG } from './tmdb.js';
import { leesFilmkleur } from './filmkleur.js';
import { kaartjeInhoud, streepjes, drukletters, kaartjeDatum } from './kaartje.js';

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
    // Een eigen adres voor het canvas: dezelfde afbeelding staat vaak al in
    // de cache zonder CORS-kop (van een gewone <img>), en dan weigert het canvas
    img.src = `${url}${url.includes('?') ? '&' : '?'}canvas=1`;
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

// Tekst die in een breedte past: eerst kleiner, dan afkappen met een beletselteken
function pasIn(ctx, tekst, maxB, font, groot, klein) {
  for (let px = groot; px >= klein; px -= 4) {
    ctx.font = font(px);
    if (ctx.measureText(tekst).width <= maxB) return tekst;
  }
  let s = tekst;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxB) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

// Deelbare pick als bioscoopkaartje (1080x1350, 4:5) als PNG-blob: het
// filmbeeld als doek bovenaan, daaronder het kaartje (zie lib/kaartje.js).
export async function renderShareCard(film, meta) {
  const inhoud = kaartjeInhoud(film, meta, { tr: t, lang: getLang() });
  // Lettertypes per teken laden (Google deelt ze op in stukken per tekenreeks)
  const tekst = [inhoud.kop, inhoud.datum, inhoud.titel, inhoud.aftiteling, inhoud.code, inhoud.toegang, ...inhoud.velden.flatMap((v) => [v.k, v.v])].filter(Boolean).join(' ');
  try {
    await Promise.all([
      document.fonts.load('700 80px "Archivo Narrow"', tekst),
      document.fonts.load('500 26px "Archivo Narrow"', tekst),
      document.fonts.load('400 24px Archivo', tekst),
      document.fonts.load('30px DotGothic16', tekst),
    ]);
  } catch { /* lettertypes optioneel */ }
  const W = 1080; const H = 1350;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const INK = '#121110'; const PAPIER = '#ece6dc'; const DRUK = '#1b1a18';
  const ticketFont = (px) => `${px}px DotGothic16, "Courier New", monospace`;

  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  const filmkleur = await leesFilmkleur(meta?.poster);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#a69f94';
  ctx.font = '600 28px Archivo, sans-serif';
  ctx.fillText(t('share.eyebrow'), 60, 96);

  // Het doek: filmbeeld in breedbeeld tussen zwarte balken
  let y = 130;
  if (meta?.backdrop) {
    try {
      const still = await loadImage(IMG(meta.backdrop, 'w1280'));
      const sh = Math.round(W / 2.39);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, y, W, sh + 48);
      const schaal = Math.max(W / still.width, sh / still.height);
      const bw = W / schaal; const bh = sh / schaal;
      ctx.drawImage(still, (still.width - bw) / 2, (still.height - bh) / 2, bw, bh, 0, y + 24, W, sh);
      y += sh + 48 + 40;
    } catch { y = null; }
  } else {
    y = null;
  }

  // Het kaartje
  // De strook is de poster, van rand tot rand: 2:3 bij de hoogte van het kaartje
  const KX = 60; const KW = 960; const KH = 540; const STROOK = 360;
  const BW = KW - STROOK; const PAD = 36;
  // Zonder doek staat het kaartje in het midden
  const ky = y == null ? Math.round((H - KH) / 2) : Math.min(y, H - 110 - KH);
  ctx.fillStyle = PAPIER;
  roundRect(ctx, KX, ky, KW, KH, 4);
  ctx.fill();
  ctx.fillStyle = filmkleur;
  ctx.fillRect(KX + BW, ky, STROOK, KH);
  if (meta?.poster) {
    try {
      const poster = await loadImage(IMG(meta.poster, 'w500'));
      // Vullend bijsnijden, binnen de afgeronde hoeken van het kaartje
      const schaal = Math.max(STROOK / poster.width, KH / poster.height);
      const sw = STROOK / schaal; const sh = KH / schaal;
      ctx.save();
      roundRect(ctx, KX, ky, KW, KH, 4);
      ctx.clip();
      ctx.drawImage(poster, (poster.width - sw) / 2, (poster.height - sh) / 2, sw, sh, KX + BW, ky, STROOK, KH);
      ctx.restore();
    } catch { /* poster kan falen door CORS */ }
  }
  // Perforatie met halve gaatjes boven en onder
  ctx.strokeStyle = 'rgba(27,26,24,0.45)';
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 9]);
  ctx.beginPath(); ctx.moveTo(KX + BW, ky); ctx.lineTo(KX + BW, ky + KH); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = INK;
  [ky, ky + KH].forEach((gy) => { ctx.beginPath(); ctx.arc(KX + BW, gy, 18, 0, Math.PI * 2); ctx.fill(); });

  const bx = KX + PAD; const bb = BW - 2 * PAD;
  let ty = ky + PAD + 22;
  ctx.fillStyle = DRUK;
  ctx.font = ticketFont(24);
  ctx.fillText(inhoud.kop, bx, ty);
  ctx.textAlign = 'right';
  ctx.fillText(inhoud.datum, bx + bb, ty);
  ctx.textAlign = 'left';
  ctx.fillRect(bx, ty + 14, bb, 3);

  ty += 100;
  const titelFont = (px) => `700 ${px}px "Archivo Narrow", Archivo, sans-serif`;
  const titel = pasIn(ctx, inhoud.titel, bb, titelFont, 92, 56);
  ctx.fillText(titel, bx, ty);
  if (inhoud.aftiteling) {
    ty += 44;
    ctx.fillStyle = '#4a4640';
    const aft = pasIn(ctx, inhoud.aftiteling, bb, (px) => `500 ${px}px "Archivo Narrow", Archivo, sans-serif`, 26, 20);
    ctx.fillText(aft, bx, ty);
  }

  // Velden: vier kolommen, brede velden nemen er twee
  ty += 56;
  const kol = bb / 4;
  let k = 0;
  inhoud.velden.forEach((v) => {
    const span = v.breed ? 2 : 1;
    if (k + span > 4) { k = 0; ty += 82; }
    const vx = bx + k * kol;
    ctx.fillStyle = '#6f6a62';
    ctx.font = '400 20px Archivo, sans-serif';
    ctx.fillText(v.k, vx, ty);
    ctx.fillStyle = DRUK;
    ctx.fillText(pasIn(ctx, v.v, kol * span - 16, ticketFont, 30, 20), vx, ty + 38);
    k += span;
  });

  // Voet: streepjescode en toegang
  const voetY = ky + KH - PAD;
  if (inhoud.code) {
    ctx.fillStyle = DRUK;
    streepjes(inhoud.code, 300).forEach(([x, w]) => ctx.fillRect(bx + x, voetY - 86, w, 56));
    ctx.font = ticketFont(20);
    ctx.fillText(inhoud.code, bx, voetY);
  }
  ctx.font = ticketFont(24);
  const tw = ctx.measureText(inhoud.toegang).width;
  ctx.lineWidth = 3;
  ctx.strokeStyle = DRUK;
  ctx.strokeRect(bx + bb - tw - 28, voetY - 44, tw + 28, 48);
  ctx.fillText(inhoud.toegang, bx + bb - tw - 14, voetY - 11);

  ctx.fillStyle = '#a69f94';
  ctx.font = '400 24px Archivo, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(t('kaartje.voet'), W / 2, H - 52);

  return new Promise((resolve) => c.toBlob(resolve, 'image/png'));
}

// "Mijn filmjaar in kaartjes" (1080x1350) als PNG-blob: de kop, de cijfers
// en de laatste twaalf afgescheurde stroken, zoals in de kaartjesdoos.
export async function renderJaarKaart(overzicht, meta = {}) {
  const lang = getLang();
  const kop = drukletters(t('kaartje.jaarKop', { jaar: overzicht.jaar }), lang);
  const stroken = overzicht.kaartjes.slice(0, 12);
  const tekst = [kop, ...stroken.map((k) => drukletters(k.name, lang)), '0123456789-★½'].join(' ');
  try {
    await Promise.all([
      document.fonts.load('700 110px "Archivo Narrow"', tekst),
      document.fonts.load('400 30px Archivo', tekst),
      document.fonts.load('20px DotGothic16', tekst),
    ]);
  } catch { /* lettertypes optioneel */ }
  const W = 1080; const H = 1350;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const INK = '#121110'; const PAPIER = '#ece6dc'; const DRUK = '#1b1a18';
  const ticketFont = (px) => `${px}px DotGothic16, "Courier New", monospace`;
  const sterrenTekst = (s) => '★'.repeat(Math.floor(s)) + (s % 1 >= 0.5 ? '½' : '');
  const fmt = (v) => (lang === 'nl' ? String(v).replace('.', ',') : String(v));

  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'left';
  ctx.fillStyle = PAPIER;
  ctx.fillText(pasIn(ctx, kop, W - 120, (px) => `700 ${px}px "Archivo Narrow", Archivo, sans-serif`, 110, 60), 60, 160);
  ctx.fillStyle = '#a69f94';
  ctx.font = '400 30px Archivo, sans-serif';
  const regel = overzicht.gemiddeld != null
    ? t('kaartje.jaarRegelSterren', { count: overzicht.aantal, n: overzicht.aantal, s: fmt(overzicht.gemiddeld) })
    : t('kaartje.jaarRegel', { count: overzicht.aantal, n: overzicht.aantal });
  ctx.fillText(regel, 60, 214);

  // De stroken: drie naast elkaar, vier rijen
  const SW = 300; const SH = 200; const GAP = 30; const RIJ = 26; const PW = 110;
  for (let i = 0; i < stroken.length; i += 1) {
    const k = stroken[i];
    const x = 60 + (i % 3) * (SW + GAP);
    const y = 260 + Math.floor(i / 3) * (SH + RIJ);
    ctx.fillStyle = PAPIER;
    roundRect(ctx, x, y, SW, SH, 4);
    ctx.fill();
    const pad = meta[k.key]?.poster || k.poster;
    if (pad) {
      try {
        const img = await loadImage(IMG(pad, 'w185'));
        const schaal = Math.max(PW / img.width, SH / img.height);
        const sw = PW / schaal; const sh = SH / schaal;
        ctx.save();
        roundRect(ctx, x, y, SW, SH, 4);
        ctx.clip();
        ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, PW, SH);
        ctx.restore();
      } catch { /* zonder poster */ }
    }
    ctx.strokeStyle = 'rgba(27,26,24,0.45)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.moveTo(x + PW, y); ctx.lineTo(x + PW, y + SH); ctx.stroke();
    ctx.setLineDash([]);
    const tx = x + PW + 14; const tb = SW - PW - 24;
    const d = new Date(String(k.gekekenOp).length === 10 ? `${k.gekekenOp}T12:00:00` : k.gekekenOp);
    ctx.fillStyle = '#4a4640';
    ctx.font = ticketFont(16);
    ctx.fillText(pasIn(ctx, kaartjeDatum(d, lang), tb, ticketFont, 16, 12), tx, y + 32);
    ctx.fillStyle = DRUK;
    // De titel over hooguit twee regels; past het dan nog niet, afkappen
    const titelFont = (px) => `700 ${px}px "Archivo Narrow", Archivo, sans-serif`;
    ctx.font = titelFont(28);
    const woorden = drukletters(k.name, lang).split(' ');
    const regels = [''];
    woorden.forEach((w) => {
      const proef = regels[regels.length - 1] ? `${regels[regels.length - 1]} ${w}` : w;
      if (ctx.measureText(proef).width <= tb || !regels[regels.length - 1]) regels[regels.length - 1] = proef;
      else regels.push(w);
    });
    const tweede = regels.slice(1).join(' ');
    ctx.fillText(pasIn(ctx, regels[0], tb, titelFont, 28, 18), tx, y + 70);
    if (tweede) ctx.fillText(pasIn(ctx, tweede, tb, titelFont, 28, 18), tx, y + 100);
    if (k.sterren != null) {
      ctx.fillStyle = '#a8463a';
      ctx.font = ticketFont(22);
      const st = sterrenTekst(k.sterren);
      const sw2 = ctx.measureText(st).width;
      ctx.strokeStyle = '#a8463a';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + SW - sw2 - 30, y + SH - 50, sw2 + 18, 34);
      ctx.fillText(st, x + SW - sw2 - 21, y + SH - 25);
    }
  }

  ctx.fillStyle = '#a69f94';
  ctx.font = '400 24px Archivo, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(t('kaartje.voet'), W / 2, H - 52);
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
