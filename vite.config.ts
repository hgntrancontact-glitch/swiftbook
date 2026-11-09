import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'path';
import {defineConfig} from 'vite';
import {execFileSync} from 'node:child_process';

export default defineConfig(({ command }) => {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const buildInfo = { commit, version: commit.slice(0, 7), builtAt: new Date().toISOString() };
  return {
    // GitHub Pages serves this repository under /swiftbook/; local development stays at /.
    base: command === 'build' ? '/swiftbook/' : '/',
    plugins: [{
      name: 'swiftbook-build-info',
      transformIndexHtml: (html) => html.replace('__SWIFTBOOK_BUILD__', buildInfo.version),
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'build-info.json', source: JSON.stringify(buildInfo, null, 2) });
      },
    }, react(), tailwindcss(), viteStaticCopy({ targets: [
      { src: 'node_modules/pdfjs-dist/cmaps/*.bcmap', dest: 'pdf-assets/cmaps', rename: { stripBase: true } },
      { src: 'node_modules/pdfjs-dist/standard_fonts/*', dest: 'pdf-assets/standard_fonts', rename: { stripBase: true } },
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
