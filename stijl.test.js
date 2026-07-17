// Huisstijl van alle teksten in de tool, bewaakt door tests zodat nieuwe
// teksten er vanzelf aan blijven voldoen:
//
// 1. Korte zinnen. Punt, komma of dubbele punt in plaats van gedachtestreepjes.
// 2. Eén mededeling per zin. Geen geruststellende bijzin aan elke melding.
// 3. Concreet boven algemeen. "1000 films per dag" in plaats van "ruime limieten".
// 4. Grapjes mogen, mits droog en spaarzaam.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
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
