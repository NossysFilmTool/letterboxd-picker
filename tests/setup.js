// Voor elke test: het kale adres. Elk scherm heeft een eigen adres (#setup,
// #archive, ...) en jsdom onthoudt het tussen tests.
// En beide talen meteen geladen (in de app laden ze pas als je ze kiest,
// main.jsx en lib/i18n.js).
import { beforeEach } from 'vitest';
import { configure } from '@testing-library/react';
import { registerDict } from '../src/lib/i18n.js';
import nl from '../src/lib/dict/nl.js';
import en from '../src/lib/dict/en.js';

registerDict('nl', nl);
registerDict('en', en);

// findBy en waitFor: een paar seconden, niet één (zie vite.config.js)
configure({ asyncUtilTimeout: 5000 });

beforeEach(() => {
  if (typeof window !== 'undefined') window.history.replaceState(null, '', '/');
});
