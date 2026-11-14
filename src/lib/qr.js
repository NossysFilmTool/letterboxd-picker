// Een QR-code, zelf getekend zonder bibliotheek: bytemodus, versie 1 tot 10,
// volgens ISO/IEC 18004 en in de opzet van Project Nayuki's QR-generator
// (MIT). Genoeg voor een link naar de zaal (versie 4 of 5).
//   qrCode(tekst, niveau) -> { versie, size, modules: [[bool]] } (true = donker)

// Per versie (1 t/m 10): foutcorrectie-codewoorden per blok, en het aantal blokken
const ECC = {
  L: [7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
  M: [10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
  Q: [13, 22, 18, 26, 18, 24, 18, 22, 20, 24],
  H: [17, 28, 22, 16, 22, 28, 26, 26, 24, 28],
};
const BLOKKEN = {
  L: [1, 1, 1, 1, 1, 2, 2, 2, 2, 4],
  M: [1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
  Q: [1, 1, 2, 2, 4, 4, 6, 6, 8, 8],
  H: [1, 1, 2, 4, 4, 4, 5, 6, 8, 8],
};
const FORMAAT = { L: 1, M: 0, Q: 3, H: 2 };
const bit = (x, i) => ((x >>> i) & 1) !== 0;

// Hoeveel modules er voor data overblijven (na alle vaste patronen)
export function dataModules(versie) {
  let n = (16 * versie + 128) * versie + 64;
  if (versie >= 2) {
    const uit = Math.floor(versie / 7) + 2;
    n -= (25 * uit - 10) * uit - 55;
    if (versie >= 7) n -= 36;
  }
  return n;
}
export const dataCodewoorden = (versie, niveau) => Math.floor(dataModules(versie) / 8) - ECC[niveau][versie - 1] * BLOKKEN[niveau][versie - 1];

// Reed-Solomon over GF(2^8) met veelterm 0x11D
function vermenigvuldig(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}
export function rsDeler(graad) {
  const uit = Array(graad).fill(0);
  uit[graad - 1] = 1;
  let wortel = 1;
  for (let i = 0; i < graad; i++) {
    for (let j = 0; j < uit.length; j++) {
      uit[j] = vermenigvuldig(uit[j], wortel);
      if (j + 1 < uit.length) uit[j] ^= uit[j + 1];
    }
    wortel = vermenigvuldig(wortel, 0x02);
  }
  return uit;
}
export function rsRest(data, deler) {
  const uit = deler.map(() => 0);
  data.forEach((b) => {
    const factor = b ^ uit.shift();
    uit.push(0);
    deler.forEach((c, i) => { uit[i] ^= vermenigvuldig(c, factor); });
  });
  return uit;
}

// De 15 formaatbits (niveau + masker) en de 18 versiebits (vanaf versie 7)
export function formaatBits(niveau, masker) {
  const data = (FORMAAT[niveau] << 3) | masker;
  let rest = data;
  for (let i = 0; i < 10; i++) rest = (rest << 1) ^ ((rest >>> 9) * 0x537);
  return ((data << 10) | rest) ^ 0x5412;
}
export function versieBits(versie) {
  let rest = versie;
  for (let i = 0; i < 12; i++) rest = (rest << 1) ^ ((rest >>> 11) * 0x1f25);
  return (versie << 12) | rest;
}

function uitlijning(versie) {
  if (versie === 1) return [];
  const aantal = Math.floor(versie / 7) + 2;
  const stap = Math.ceil((versie * 4 + 4) / (aantal * 2 - 2)) * 2;
  const uit = [6];
  for (let pos = versie * 4 + 17 - 7; uit.length < aantal; pos -= stap) uit.splice(1, 0, pos);
  return uit;
}

// Data in blokken met foutcorrectie, en dan door elkaar gevlochten
function metFoutcorrectie(data, versie, niveau) {
  const blokken = BLOKKEN[niveau][versie - 1];
  const eccLen = ECC[niveau][versie - 1];
  const totaal = Math.floor(dataModules(versie) / 8);
  const kort = blokken - (totaal % blokken);
  const kortLen = Math.floor(totaal / blokken);
  const deler = rsDeler(eccLen);
  const rij = [];
  for (let i = 0, k = 0; i < blokken; i++) {
    const dat = data.slice(k, k + kortLen - eccLen + (i < kort ? 0 : 1));
    k += dat.length;
    const ecc = rsRest(dat, deler);
    if (i < kort) dat.push(0);
    rij.push(dat.concat(ecc));
  }
  const uit = [];
  for (let i = 0; i < rij[0].length; i++) {
    rij.forEach((blok, j) => { if (i !== kortLen - eccLen || j >= kort) uit.push(blok[i]); });
  }
  return uit;
}

const MASKERS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

// Strafpunten (alleen om het mooiste masker te kiezen; elk masker is geldig)
function straf(m) {
  const n = m.length;
  let p = 0;
  const lijnen = [];
  for (let y = 0; y < n; y++) lijnen.push(m[y]);
  for (let x = 0; x < n; x++) lijnen.push(m.map((r) => r[x]));
  lijnen.forEach((lijn) => {
    let reeks = 1;
    for (let i = 1; i <= n; i++) {
      if (i < n && lijn[i] === lijn[i - 1]) reeks++;
      else { if (reeks >= 5) p += reeks - 2; reeks = 1; }
    }
    const s = lijn.map((v) => (v ? 1 : 0)).join('');
    ['10111010000', '00001011101'].forEach((patroon) => {
      for (let k = s.indexOf(patroon); k !== -1; k = s.indexOf(patroon, k + 1)) p += 40;
    });
  });
  for (let y = 0; y < n - 1; y++) {
    for (let x = 0; x < n - 1; x++) {
      const c = m[y][x];
      if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3;
    }
  }
  const donker = m.reduce((a, r) => a + r.filter(Boolean).length, 0);
  p += Math.max(0, Math.ceil(Math.abs(donker * 20 - n * n * 10) / (n * n)) - 1) * 10;
  return p;
}

export function qrCode(tekst, niveau = 'M') {
  const bytes = [...new TextEncoder().encode(String(tekst))];
  let versie = 1;
  while (versie <= 10 && 4 + (versie <= 9 ? 8 : 16) + bytes.length * 8 > dataCodewoorden(versie, niveau) * 8) versie++;
  if (versie > 10) throw new Error('QR_TE_LANG');

  // Bytemodus: 0100, de lengte, de bytes, afsluiter en opvulling
  const bits = [];
  const zet = (waarde, lengte) => { for (let i = lengte - 1; i >= 0; i--) bits.push((waarde >>> i) & 1); };
  zet(0b0100, 4);
  zet(bytes.length, versie <= 9 ? 8 : 16);
  bytes.forEach((b) => zet(b, 8));
  const ruimte = dataCodewoorden(versie, niveau) * 8;
  zet(0, Math.min(4, ruimte - bits.length));
  zet(0, (8 - (bits.length % 8)) % 8);
  for (let vul = 0xec; bits.length < ruimte; vul ^= 0xec ^ 0x11) zet(vul, 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  const codewoorden = metFoutcorrectie(data, versie, niveau);

  const size = versie * 4 + 17;
  const modules = Array.from({ length: size }, () => Array(size).fill(false));
  const vast = Array.from({ length: size }, () => Array(size).fill(false));
  const zetVast = (x, y, donker) => { modules[y][x] = donker; vast[y][x] = true; };

  // Tijdlijnen, de drie zoekpatronen en de uitlijnpatronen
  for (let i = 0; i < size; i++) { zetVast(6, i, i % 2 === 0); zetVast(i, 6, i % 2 === 0); }
  [[3, 3], [size - 4, 3], [3, size - 4]].forEach(([cx, cy]) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < size && y >= 0 && y < size) zetVast(x, y, d !== 2 && d !== 4);
      }
    }
  });
  const pos = uitlijning(versie);
  pos.forEach((px, i) => pos.forEach((py, j) => {
    const hoek = (i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0);
    if (hoek) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) zetVast(px + dx, py + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  const tekenFormaat = (masker) => {
    const b = formaatBits(niveau, masker);
    for (let i = 0; i <= 5; i++) zetVast(8, i, bit(b, i));
    zetVast(8, 7, bit(b, 6));
    zetVast(8, 8, bit(b, 7));
    zetVast(7, 8, bit(b, 8));
    for (let i = 9; i < 15; i++) zetVast(14 - i, 8, bit(b, i));
    for (let i = 0; i < 8; i++) zetVast(size - 1 - i, 8, bit(b, i));
    for (let i = 8; i < 15; i++) zetVast(8, size - 15 + i, bit(b, i));
    zetVast(8, size - 8, true);
  };
  tekenFormaat(0);
  if (versie >= 7) {
    const b = versieBits(versie);
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3);
      const c = Math.floor(i / 3);
      zetVast(a, c, bit(b, i));
      zetVast(c, a, bit(b, i));
    }
  }

  // De codewoorden, zigzag van rechtsonder naar boven, om de tijdlijn heen
  let i = 0;
  for (let rechts = size - 1; rechts >= 1; rechts -= 2) {
    if (rechts === 6) rechts = 5;
    for (let v = 0; v < size; v++) {
      for (let j = 0; j < 2; j++) {
        const x = rechts - j;
        const omhoog = ((rechts + 1) & 2) === 0;
        const y = omhoog ? size - 1 - v : v;
        if (!vast[y][x] && i < codewoorden.length * 8) {
          modules[y][x] = bit(codewoorden[i >>> 3], 7 - (i & 7));
          i++;
        }
      }
    }
  }

  // Het masker met de minste strafpunten
  const maskeer = (m) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!vast[y][x] && MASKERS[m](x, y)) modules[y][x] = !modules[y][x];
  };
  let beste = 0;
  let minste = Infinity;
  for (let m = 0; m < 8; m++) {
    maskeer(m);
    tekenFormaat(m);
    const p = straf(modules);
    if (p < minste) { minste = p; beste = m; }
    maskeer(m);
  }
  maskeer(beste);
  tekenFormaat(beste);
  return { versie, size, masker: beste, modules };
}

// Als één SVG-pad, met een stille rand van vier modules
export function qrPad(qr, rand = 4) {
  let d = '';
  qr.modules.forEach((rij, y) => rij.forEach((donker, x) => { if (donker) d += `M${x + rand},${y + rand}h1v1h-1z`; }));
  return d;
}
