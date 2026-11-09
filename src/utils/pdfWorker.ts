import * as pdfjsLib from 'pdfjs-dist';

if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.min.js`;
}

export { pdfjsLib };

// Serve support data with the app. A cold page must not wait for an external
// CDN to resolve its character maps or standard fonts before it can render.
export const pdfSupportData = {
  cMapUrl: `${import.meta.env.BASE_URL}pdf-assets/cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${import.meta.env.BASE_URL}pdf-assets/standard_fonts/`,
};

