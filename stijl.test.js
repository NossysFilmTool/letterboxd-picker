// Huisstijl van alle teksten in de tool, bewaakt door tests zodat nieuwe
// teksten er vanzelf aan blijven voldoen:
//
// 1. Korte zinnen. Punt, komma of dubbele punt in plaats van gedachtestreepjes.
// 2. Eén mededeling per zin. Geen geruststellende bijzin aan elke melding.
// 3. Concreet boven algemeen. "1000 films per dag" in plaats van "ruime limieten".
// 4. Grapjes mogen, mits droog en spaarzaam.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import nl from './src/lib/dict/nl.js';
import en from './src/lib/dict/en.js';

function alleTeksten(obj, out = []) {
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object') alleTeksten(v, out);
    else if (typeof v === 'string') out.push(v);
  }
  return out;
}

describe('huisstijl', () => {
  it('interface-teksten bevatten geen gedachtestreepjes', () => {
    const zondaars = [...alleTeksten(nl), ...alleTeksten(en)].filter((s) => s.includes('\u2014'));
    expect(zondaars).toEqual([]);
  });

  it('de README bevat geen gedachtestreepjes', () => {
    const readme = readFileSync('./README.md', 'utf-8');
    expect(readme.includes('\u2014')).toBe(false);
  });

  it('interface-teksten vermijden holle frasen', () => {
    const verboden = [/niet alleen .{1,40} maar/i, /it'?s not just/i, /\bdelve\b/i, /in today'?s/i, /tapestry/i];
    const zondaars = [...alleTeksten(nl), ...alleTeksten(en)]
      .filter((s) => verboden.some((r) => r.test(s)));
    expect(zondaars).toEqual([]);
  });
});

// Ontwerp "De zaal" (DESIGN.md): de bekende kenmerken van een door AI
// gemaakte interface blijven eruit. Elke regel hier is een bewuste keuze;
// wil je er een breken, pas dan eerst DESIGN.md aan.
function bronbestanden(map, uit = []) {
  for (const naam of readdirSync(map)) {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) bronbestanden(pad, uit);
    else if (/\.(jsx?|css)$/.test(naam)) uit.push(pad);
  }
  return uit;
}
describe('ontwerp: geen AI-clichés', () => {
  const css = readFileSync('./src/styles.css', 'utf-8');
  const html = readFileSync('./index.html', 'utf-8');
  const bron = bronbestanden('./src').map((p) => [p, readFileSync(p, 'utf-8')]);

  it('geen standaardlettertypes (Inter) of de redactionele serif (Instrument Serif)', () => {
    expect(`${css}${html}`).not.toMatch(/['"]Inter['"]|family=Inter|Instrument Serif|Instrument\+Serif/);
  });

  it('geen spatiërende hoofdletters, gekleurde streep aan één kant, matglas of zwevende schaduwen', () => {
    const verboden = [/text-transform:\s*uppercase/, /border-left:\s*\d+px solid/, /backdrop-filter/, /box-shadow/, /textTransform:\s*'uppercase'/, /backdropFilter/];
    const zondaars = bron.filter(([, tekst]) => verboden.some((r) => r.test(tekst))).map(([p]) => p);
    expect(zondaars).toEqual([]);
  });

  it('geen emoji als pictogram, in code of in teksten', () => {
    const emoji = /[\u{1F300}-\u{1FAFF}]/u;
    expect(bron.filter(([, tekst]) => emoji.test(tekst)).map(([p]) => p)).toEqual([]);
    expect([...alleTeksten(nl), ...alleTeksten(en)].filter((s) => emoji.test(s))).toEqual([]);
  });

  it('hoofdletters en kaartjesletters alleen op het kaartje', () => {
    const metHoofdletters = bron.filter(([, tekst]) => tekst.includes('toLocaleUpperCase')).map(([p]) => p.replace(/\\/g, '/'));
    expect(metHoofdletters).toEqual(['src/lib/kaartje.js']);
    const ticketRegels = css.split('\n').filter((r) => r.includes('var(--font-ticket)'));
    expect(ticketRegels.length).toBeGreaterThan(0);
    expect(ticketRegels.filter((r) => !r.trim().startsWith('.kaartje'))).toEqual([]);
  });

  it('geen pop-ups van de browser: meldingen en vragen gaan via lib/melding.js', () => {
    const popup = /\b(alert|confirm|prompt)\(/;
    expect(bron.filter(([, tekst]) => popup.test(tekst)).map(([p]) => p)).toEqual([]);
  });

  it('de navigatie tekent zijn eigen pictogrammen, geen standaardset', () => {
    const shell = bron.find(([p]) => p.replace(/\\/g, '/').endsWith('components/Shell.jsx'))[1];
    expect(shell).not.toMatch(/lucide-react/);
  });

  it('het archief filtert met een zin, niet met een muur van knopjes', () => {
    const bieb = bron.find(([p]) => p.replace(/\\/g, '/').endsWith('tabs/Bieb.jsx'))[1];
    expect(bieb).not.toMatch(/className=\{?[`'"]chip/);
  });

  it('geen paarse verlopen (de bekendste AI-kleur)', () => {
    expect(css).not.toMatch(/linear-gradient\([^)]*(#8b5cf6|#7c3aed|#6366f1|#a855f7|indigo|purple)/i);
  });
});

// De stemronde-poll draait elke paar seconden bij elke deelnemer. Een KV
// list()-operatie in die hete lus tikt razendsnel tegen de gratis daglimiet
// aan (dat gebeurde in de praktijk). Deze test bewaakt dat de Worker geen
// list() meer gebruikt; stemmen horen in het sessie-object te zitten.
describe('worker KV-efficiëntie', () => {
  it('de Worker gebruikt geen KV list()-operaties', () => {
    const worker = readFileSync('./worker/worker.js', 'utf-8');
    expect(worker.includes('.list(')).toBe(false);
  });
});
