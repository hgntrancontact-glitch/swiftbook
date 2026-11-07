import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(({ command }) => {
  return {
    // GitHub Pages serves this repository under /swiftbook/; local development stays at /.
    base: command === 'build' ? '/swiftbook/' : '/',
    plugins: [react(), tailwindcss(), viteStaticCopy({ targets: [
      { src: 'node_modules/tesseract.js/dist/worker.min.js', dest: 'ocr', rename: { stripBase: true } },
      { src: 'node_modules/tesseract.js/dist/worker.min.js.LICENSE.txt', dest: 'ocr', rename: { stripBase: true } },
      { src: 'node_modules/tesseract.js-core/*.wasm*', dest: 'ocr', rename: { stripBase: true } },
    ] })],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
