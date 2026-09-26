import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Two patches to 98.css (see DECISIONS.md):
// - It bundles a pixel recreation of MS Sans Serif whose licence is unclear. Strip its
//   @font-face rules so the font files are never shipped; our font stack is in shell.css.
// - `@media (not(hover))` is rejected by Vite's CSS minifier; `(hover: none)` is equivalent.
function patch98css(): Plugin {
  return {
    name: 'patch-98css',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('98.css/dist/98.css')) return;
      const patched = code.replace(/@font-face\{[^}]*\}/g, '').replaceAll('@media (not(hover))', '@media (hover: none)');
      return { code: patched, map: null };
    },
  };
}

export default defineConfig({
  plugins: [patch98css(), react()],
  // The simulation worker (src/sim/worker.ts) is an ES module that shares chunks with the app.
  worker: { format: 'es' },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    // Vitest's module runner wraps imports in getters; bundled builds (what the game runs) have none.
    benchmark: { include: ['tests/**/*.bench.ts'], suppressExportGetterWarnings: true },
  },
});
