import { cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const rootDir = fileURLToPath(new URL('.', import.meta.url));
const assetCacheVersion =
  process.env.VITE_ASSET_CACHE_VERSION || process.env.GITHUB_SHA || `local-${Date.now().toString(36)}`;

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
  define: {
    __ASSET_CACHE_VERSION__: JSON.stringify(assetCacheVersion),
  },
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
