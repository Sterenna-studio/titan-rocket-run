import { cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

function copyTitanAssets(): Plugin {
  return {
    name: 'copy-titan-assets',
    apply: 'build',
    closeBundle() {
      const from = resolve(rootDir, 'assets');
      const to = resolve(rootDir, 'dist/assets');

      if (existsSync(from)) {
        cpSync(from, to, { recursive: true });
      }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [copyTitanAssets()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(rootDir, 'index.html'),
        'asset-browser': resolve(rootDir, 'asset-browser.html'),
      },
    },
  },
});
