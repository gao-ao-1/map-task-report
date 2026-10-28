import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('./static-entry', import.meta.url)),
  base: './',
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: '../.pages-build',
    emptyOutDir: true,
    assetsDir: 'pages-assets',
  },
});
