import { build } from 'vite';
import { copyFile, cp, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// GitHub Pages publishes main / (root). Commit the generated entry and assets.
const root = new URL('../', import.meta.url);
await build({ configFile: fileURLToPath(new URL('vite.pages.config.ts', root)) });
await mkdir(new URL('pages-assets/', root), { recursive: true });
await cp(new URL('.pages-build/pages-assets/', root), new URL('pages-assets/', root), { recursive: true });
await copyFile(new URL('.pages-build/index.html', root), new URL('index.html', root));
await writeFile(new URL('.nojekyll', root), '');
console.log('GitHub Pages entry ready: index.html + pages-assets/ + public/geo/');
