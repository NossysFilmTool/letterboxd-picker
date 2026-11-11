import { readFileSync } from 'fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

export default defineConfig({
  base: './',
  // In de tests heet de versie 'dev': dan opent de première niet vanzelf
  // over elk scherm heen (lib/premiere.js)
  define: { __APP_VERSION__: JSON.stringify(process.env.VITEST ? 'dev' : pkg.version) },
  plugins: [react(), viteSingleFile()],
  build: { target: 'es2018', cssCodeSplit: false, assetsInlineLimit: 100000000 },
});
