import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf-assets/pdf.worker.min.mjs?v=${pdfjsLib.version}`;
}

export { pdfjsLib };

// Serve support data with the app. A cold page must not wait for an external
// CDN to resolve its character maps or standard fonts before it can render.
export const pdfSupportData = {
  enableHWA: true,
  wasmUrl: `${import.meta.env.BASE_URL}pdf-assets/wasm/`,
  iccUrl: `${import.meta.env.BASE_URL}pdf-assets/iccs/`,
  cMapUrl: `${import.meta.env.BASE_URL}pdf-assets/cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${import.meta.env.BASE_URL}pdf-assets/standard_fonts/`,
};

