// Het geluid van de zaal bij de trailers (components/Pitch.jsx): de ratel
// van de projector, een klak als hij aanslaat, een zoef bij een snit, een
// dreun onder een zwarte titelkaart en de diepe hoorn als de titel in beeld
// slaat. Alles wordt hier gemaakt met Web Audio, zonder geluidsbestanden.
// Zonder Web Audio (oude browser, tests) doet elke functie niets.

let ctx = null;
let uitgang = null;
let aan = true;
let ratel = null;
let ruis = null;

function context() {
  if (ctx) return ctx;
  const AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
  if (!AC) return null;
  try {
    ctx = new AC();
    uitgang = ctx.createGain();
    uitgang.gain.value = 0.8;
    // Een compressor houdt de hoorn en de dreun binnen de perken
    const rem = ctx.createDynamicsCompressor();
    uitgang.connect(rem);
    rem.connect(ctx.destination);
  } catch {
    ctx = null;
  }
  return ctx;
}

// Browsers laten pas geluid toe na een klik of tik. Roep dit aan in de klik
// die de trailers opent.
export function ontgrendel() {
  const c = context();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

export function zetGeluid(v) {
  aan = !!v;
  if (!aan) stopRatel();
}

const klaar = () => aan && ctx && ctx.state === 'running';

function ruisBuffer() {
  if (ruis) return ruis;
  const n = ctx.sampleRate * 2;
  ruis = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = ruis.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return ruis;
}

// Snel op, langzaam weg
function omhulsel(g, t, piek, aanval, verval) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(piek, t + aanval);
  g.gain.exponentialRampToValueAtTime(0.0001, t + aanval + verval);
}

function ruisStoot(t, { type, freq, q = 0.8, piek, aanval, verval }) {
  const bron = ctx.createBufferSource();
  bron.buffer = ruisBuffer();
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  omhulsel(g, t, piek, aanval, verval);
  bron.connect(f);
  f.connect(g);
  g.connect(uitgang);
  bron.start(t, Math.random());
  bron.stop(t + aanval + verval + 0.05);
}

// Precies een seconde aan geluid: 24 beeldjes, per beeldje de tik van de
// grijper en een zachtere tik een halve beeldtijd later. Loopt naadloos rond.
function ratelBuffer() {
  const sr = ctx.sampleRate;
  const b = ctx.createBuffer(1, sr, sr);
  const d = b.getChannelData(0);
  const len = Math.floor(sr * 0.006);
  for (let beeld = 0; beeld < 24; beeld++) {
    [[0, 1], [0.5, 0.4]].forEach(([fase, sterkte]) => {
      const start = Math.floor(((beeld + fase) / 24) * sr + (Math.random() - 0.5) * sr * 0.0016);
      const amp = sterkte * (0.7 + Math.random() * 0.3);
      for (let i = 0; i < len && start + i < sr; i++) {
        if (start + i >= 0) d[start + i] += (Math.random() * 2 - 1) * amp * Math.exp(-i / (len / 5));
      }
    });
  }
  return b;
}

export function startRatel() {
  if (!klaar() || ratel) return;
  const t = ctx.currentTime;
  const hoofd = ctx.createGain();
  hoofd.gain.setValueAtTime(0.0001, t);
  hoofd.gain.exponentialRampToValueAtTime(1, t + 0.9);
  hoofd.connect(uitgang);
  // het tikken
  const bron = ctx.createBufferSource();
  bron.buffer = ratelBuffer();
  bron.loop = true;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 2300;
  band.Q.value = 0.7;
  const tik = ctx.createGain();
  tik.gain.value = 0.07;
  bron.connect(band);
  band.connect(tik);
  tik.connect(hoofd);
  // het brommen van de motor
  const brom = ctx.createOscillator();
  brom.type = 'sine';
  brom.frequency.value = 50;
  const bromSterkte = ctx.createGain();
  bromSterkte.gain.value = 0.025;
  brom.connect(bromSterkte);
  bromSterkte.connect(hoofd);
  bron.start(t);
  brom.start(t);
  ratel = { hoofd, bron, brom };
}

export function stopRatel() {
  if (!ratel || !ctx) return;
  const { hoofd, bron, brom } = ratel;
  ratel = null;
  const t = ctx.currentTime;
  hoofd.gain.cancelScheduledValues(t);
  hoofd.gain.setTargetAtTime(0.0001, t, 0.12);
  bron.stop(t + 0.6);
  brom.stop(t + 0.6);
}

export function pauzeerRatel(pauze) {
  if (!ratel || !ctx) return;
  const t = ctx.currentTime;
  ratel.hoofd.gain.cancelScheduledValues(t);
  ratel.hoofd.gain.setTargetAtTime(pauze ? 0.0001 : 1, t, 0.08);
}

// De projector slaat aan
export function klak() {
  if (!klaar()) return;
  const t = ctx.currentTime;
  ruisStoot(t, { type: 'bandpass', freq: 1400, q: 1.2, piek: 0.5, aanval: 0.002, verval: 0.05 });
  ruisStoot(t + 0.07, { type: 'bandpass', freq: 900, q: 1.2, piek: 0.3, aanval: 0.002, verval: 0.06 });
}

// Een snit naar een nieuw shot
export function zoef() {
  if (!klaar()) return;
  const t = ctx.currentTime;
  const bron = ctx.createBufferSource();
  bron.buffer = ruisBuffer();
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.Q.value = 1.1;
  band.frequency.setValueAtTime(320, t);
  band.frequency.exponentialRampToValueAtTime(2600, t + 0.45);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.2, t + 0.28);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
  bron.connect(band);
  band.connect(g);
  g.connect(uitgang);
  bron.start(t, Math.random());
  bron.stop(t + 0.75);
}

// Een zwarte titelkaart: een lage dreun met een klap erop
export function dreun() {
  if (!klaar()) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(36, t + 0.7);
  const g = ctx.createGain();
  omhulsel(g, t, 0.75, 0.006, 1.1);
  o.connect(g);
  g.connect(uitgang);
  o.start(t);
  o.stop(t + 1.2);
  ruisStoot(t, { type: 'lowpass', freq: 650, piek: 0.35, aanval: 0.003, verval: 0.25 });
}

// De titel slaat in beeld: een diepe hoorn die langzaam dichtgaat, met een sub
// eronder en een sissende klap erboven
export function braam() {
  if (!klaar()) return;
  const t = ctx.currentTime;
  const laag = ctx.createBiquadFilter();
  laag.type = 'lowpass';
  laag.Q.value = 2;
  laag.frequency.setValueAtTime(1900, t);
  laag.frequency.exponentialRampToValueAtTime(220, t + 2.4);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.3, t + 0.04);
  g.gain.setValueAtTime(0.3, t + 0.5);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
  laag.connect(g);
  g.connect(uitgang);
  [[43.65, 0], [43.65, 9], [87.3, -7], [65.4, 5]].forEach(([freq, cent]) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    o.detune.value = cent;
    o.connect(laag);
    o.start(t);
    o.stop(t + 2.9);
  });
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = 43.65;
  const gs = ctx.createGain();
  omhulsel(gs, t, 0.5, 0.02, 2.2);
  sub.connect(gs);
  gs.connect(uitgang);
  sub.start(t);
  sub.stop(t + 2.4);
  ruisStoot(t, { type: 'highpass', freq: 2600, piek: 0.1, aanval: 0.004, verval: 1.3 });
}
