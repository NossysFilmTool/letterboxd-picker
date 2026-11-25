import { readFileSync } from 'fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

// De gehoste versie (npm run build): losse bestanden, zodat een gast alleen
// zijn eigen scherm laadt en iedereen alleen zijn eigen taal. Plus een lijst
// van alle bestanden, zodat de service worker (public/sw.js) ze bij het
// installeren meteen bewaart: dan start de app daarna ook zonder netwerk.
const bestandenLijst = () => ({
  name: 'bestanden-lijst',
  apply: 'build',
  enforce: 'post',
  generateBundle(_, bundle) {
    const lijst = Object.keys(bundle).filter((f) => f.startsWith('assets/')).sort();
    this.emitFile({ type: 'asset', fileName: 'bestanden.json', source: JSON.stringify(lijst) });
  },
});

// npm run build:los: alles in één index.html (dist-los/), om zonder server
// te openen of door te geven
export default defineConfig(({ mode }) => {
  const los = mode === 'los';
  return {
    base: './',
    // In de tests heet de versie 'dev': dan opent de première niet vanzelf
    // over elk scherm heen (lib/premiere.js)
    define: { __APP_VERSION__: JSON.stringify(process.env.VITEST ? 'dev' : pkg.version) },
    plugins: [react(), los ? viteSingleFile() : bestandenLijst()],
    build: los
      ? { target: 'es2018', outDir: 'dist-los', cssCodeSplit: false, assetsInlineLimit: 100000000 }
      : { target: 'es2018' },
    // De tests staan in tests/ (tests/helpers.jsx: gedeelde nepfilms en hulpjes)
    // Ruime wachttijden: op een drukke machine (of de CI) mag een test
    // trager zijn zonder te falen; een test die slaagt, wacht er niet op
    test: {
      include: ['tests/**/*.test.{js,jsx}'],
      environment: 'jsdom',
      setupFiles: ['tests/setup.js'],
      testTimeout: 20000,
    },
  };
});
