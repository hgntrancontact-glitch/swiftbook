import { jsPDF } from 'jspdf';
import { PDFDocument } from 'pdf-lib';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import DOMPurify from 'dompurify';
import { renderAsync } from 'docx-preview';
import html2canvas from 'html2canvas';

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;

/**
 * Sanitize CSS modern color functions (oklch, oklab, lch, lab) to prevent html2canvas crashes.
 */
function sanitizeCssColors(htmlString: string): string {
  if (!htmlString) return '';
  return htmlString.replace(/(?:oklch|oklab|lch|lab)\([^)]+\)/gi, '#cbd5e1');
}

/**
 * Sanitize a DOM element's styles recursively.
 */
function sanitizeDomColors(container: HTMLElement) {
  const elements = container.querySelectorAll('*');
  elements.forEach(el => {
    if (el instanceof HTMLElement) {
      const style = el.getAttribute('style');
      if (style && /(oklch|oklab|lch|lab)\(/i.test(style)) {
        el.setAttribute('style', style.replace(/(?:oklch|oklab|lch|lab)\([^)]+\)/gi, '#cbd5e1'));
      }
    }
  });

  const styles = container.querySelectorAll('style');
  styles.forEach(style => {
    if (style.innerHTML && /(oklch|oklab|lch|lab)\(/i.test(style.innerHTML)) {
      style.innerHTML = style.innerHTML.replace(/(?:oklch|oklab|lch|lab)\([^)]+\)/gi, '#cbd5e1');
    }
  });
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const COMMON_A4_STYLES = `
  <style>
    * { box-sizing: border-box; }
    body, div, p, table, td, th { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
    .a4-container {
      width: ${A4_WIDTH_MM}mm;
      min-height: ${A4_HEIGHT_MM}mm;
      padding: 15mm;
      background: #ffffff;
      color: #0f172a;
      box-sizing: border-box;
      margin: 0 auto;
    }
    .page-break {
      page-break-after: always;
    }
    h1 { font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 12px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; line-height: 1.3; }
    h2 { font-size: 16px; font-weight: 600; color: #1e293b; margin-top: 14px; margin-bottom: 8px; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px; line-height: 1.3; }
    p { font-size: 13px; line-height: 1.65; color: #334155; margin-top: 0; margin-bottom: 10px; }
    table { width: 100% !important; border-collapse: collapse !important; margin: 12px 0 !important; font-size: 12px !important; page-break-inside: auto; }
    tr { page-break-inside: avoid; page-break-after: auto; }
    th, td { border: 1px solid #cbd5e1 !important; padding: 6px 8px !important; text-align: left !important; color: #334155 !important; word-wrap: break-word !important; }
    th { background-color: #f1f5f9 !important; font-weight: 600 !important; color: #0f172a !important; }
    tr:nth-child(even) td { background-color: #f8fafc !important; }
    img { max-width: 100% !important; max-height: 500px !important; object-fit: contain !important; display: block !important; margin: 8px auto !important; border-radius: 4px !important; page-break-inside: avoid; }
    
    .excel-header {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 6px;
      padding: 10px 14px;
      margin-bottom: 16px;
      color: #1e40af;
      font-size: 13px;
      font-weight: 600;
    }
  </style>
`;

/**
 * Generate PDF from a container using html2pdf.js
 */
async function generatePdfFromElements(elements: HTMLElement[], fitToPage: boolean = false): Promise<Uint8Array> {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    sanitizeDomColors(el);

    // Allow DOM to settle before rendering
    await new Promise(r => setTimeout(r, 100));

    try {
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        onclone: (clonedDoc: Document) => {
          const clonedEls = clonedDoc.querySelectorAll('*');
          clonedEls.forEach(cEl => {
            if (cEl instanceof HTMLElement) {
              const style = cEl.getAttribute('style');
              if (style && /(oklch|oklab|lch|lab)\(|\)/i.test(style)) {
                cEl.setAttribute('style', style.replace(/(?:oklch|oklab|lch|lab)\([^)]+\)/gi, '#cbd5e1'));
              }
            }
          });
          const styles = clonedDoc.querySelectorAll('style');
          styles.forEach(style => {
            if (style.innerHTML && /(oklch|oklab|lch|lab)\(/i.test(style.innerHTML)) {
              style.innerHTML = style.innerHTML.replace(/(?:oklch|oklab|lch|lab)\([^)]+\)/gi, '#cbd5e1');
            }
          });
        }
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.98);

      if (i > 0) {
        pdf.addPage();
      }

      if (fitToPage) {
        // Fit entire element into exactly one page
        const imgProps = pdf.getImageProperties(imgData);
        // Leave some margin
        const margin = 10;
        const maxWidth = pdfWidth - margin * 2;
        const maxHeight = pdfHeight - margin * 2;
        const ratio = Math.min(maxWidth / imgProps.width, maxHeight / imgProps.height);
        const finalWidth = imgProps.width * ratio;
        const finalHeight = imgProps.height * ratio;
        
        pdf.addImage(imgData, 'JPEG', margin, margin, finalWidth, finalHeight);
      } else {
        // Multi-page breaking logic if element is taller than a page
        const elHeight = (canvas.height * pdfWidth) / canvas.width;
        let heightLeft = elHeight;
        let position = 0;

        pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, elHeight);
        heightLeft -= pdfHeight;

        while (heightLeft > 0) {
          position = heightLeft - elHeight;
          pdf.addPage();
          pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, elHeight);
          heightLeft -= pdfHeight;
        }
      }
    } catch (err) {
      console.warn('Lỗi khi tạo hình ảnh cho phần tử ' + i + ':', err);
    }
  }

  return new Uint8Array(pdf.output('arraybuffer'));
}

/**
 * Ultra-fast Image to PDF converter
 */
export async function convertImageToPdfBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      const naturalW = img.naturalWidth || 800;
      const naturalH = img.naturalHeight || 600;

      const pdfW = A4_WIDTH_PT;
      const pdfH = Math.max(200, (naturalH / naturalW) * pdfW);
      const orientation = naturalW > naturalH ? 'l' : 'p';
      
      const doc = new jsPDF({ orientation, unit: 'pt', format: [pdfW, pdfH] });
      const format = (file.type.includes('png') || file.name.toLowerCase().endsWith('.png')) ? 'PNG' : 'JPEG';

      try {
        doc.addImage(img, format, 0, 0, pdfW, pdfH, undefined, 'FAST');
        resolve(new Uint8Array(doc.output('arraybuffer')));
      } catch (e) {
        // Canvas fallback
        try {
          const canvas = document.createElement('canvas');
          canvas.width = naturalW;
          canvas.height = naturalH;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            const fallbackDoc = new jsPDF({ orientation, unit: 'pt', format: [pdfW, pdfH] });
            fallbackDoc.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pdfW, pdfH, undefined, 'FAST');
            resolve(new Uint8Array(fallbackDoc.output('arraybuffer')));
            return;
          }
        } catch (canvasErr) {
          console.error('Canvas image fallback error:', canvasErr);
        }
        reject(e);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Không thể đọc hoặc giải mã tập tin hình ảnh.'));
    };
    img.src = objectUrl;
  });
}

/**
 * Clean legacy Word binary (.doc) text buffer into readable paragraphs
 */
function cleanDocBinaryText(arrayBuffer: ArrayBuffer): string {
  const decoder = new TextDecoder('utf-8');
  const raw = decoder.decode(arrayBuffer);
  const cleaned = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ');
  const lines = cleaned.split(/[\r\n]+/);
  
  const readableLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 3 && /[a-zA-Z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]/i.test(trimmed)) {
      readableLines.push(escapeHtml(trimmed));
    }
  }
  return readableLines.length === 0 
    ? '<p>Tài liệu Word (.doc) không chứa nội dung văn bản có thể trích xuất.</p>' 
    : readableLines.map(line => `<p>${line}</p>`).join('');
}

/**
 * Convert Word (.docx, .doc) to PDF bytes
 */
export async function convertWordToPdfBytes(file: File): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const isDocx = file.name.toLowerCase().endsWith('.docx');
  
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '-9999px';
  container.style.left = '-9999px';
  container.style.width = '794px'; // A4 width at 96 DPI
  document.body.appendChild(container);
  
  try {
    if (isDocx) {
      try {
        await renderAsync(arrayBuffer, container, container, {
          inWrapper: false,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          useBase64URL: true,
        });
        
        const sections = Array.from(container.querySelectorAll('section'));
        if (sections.length > 0) {
          // Add basic styling to ensure white background
          sections.forEach(sec => {
            sec.style.background = '#ffffff';
            sec.style.color = '#000000';
            sec.style.padding = '20px';
          });
          return await generatePdfFromElements(sections as HTMLElement[], false);
        }
      } catch (err) {
        console.warn('docx-preview failed, falling back to basic extraction:', err);
      }
    }
    
    // Fallback for .doc or if docx-preview failed
    const wrapper = document.createElement('div');
    wrapper.className = 'a4-container';
    wrapper.innerHTML = COMMON_A4_STYLES + '<div style="margin-bottom: 24px;"><h2>' + escapeHtml(file.name) + '</h2></div>' + cleanDocBinaryText(arrayBuffer);
    container.appendChild(wrapper);
    
    return await generatePdfFromElements([wrapper], false);
  } finally {
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  }
}

/**
 * Convert HTML (.html, .htm) to PDF bytes
 */
export async function convertHtmlFileToPdfBytes(file: File): Promise<Uint8Array> {
  const text = await file.text();
  let bodyContent = text;
  const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch && bodyMatch[1]) {
    bodyContent = bodyMatch[1];
  }
  
  bodyContent = sanitizeCssColors(bodyContent);
  bodyContent = DOMPurify.sanitize(bodyContent);
  
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '-9999px';
  container.style.left = '-9999px';
  container.style.width = '794px';
  document.body.appendChild(container);
  
  try {
    const wrapper = document.createElement('div');
    wrapper.className = 'a4-container';
    wrapper.innerHTML = COMMON_A4_STYLES + bodyContent;
    
    container.appendChild(wrapper);
    return await generatePdfFromElements([wrapper], false);
  } finally {
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  }
}

/**
 * Convert Excel (.xls, .xlsx) to PDF bytes by rendering a continuous HTML table
 */
export async function convertExcelToPdfBytes(file: File): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  
  let workbook;
  try {
    workbook = XLSX.read(arrayBuffer, { type: 'array' });
  } catch (e) {
    throw new Error("Không thể phân tích tệp Excel. Tệp có thể bị hỏng hoặc không đúng định dạng.");
  }

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '-9999px';
  container.style.left = '-9999px';
  document.body.appendChild(container);

  try {
    const sheetWrappers = [];

    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) continue;

      let truncatedWarning = '';
      const rangeStr = worksheet['!ref'];
      if (rangeStr) {
        const range = XLSX.utils.decode_range(rangeStr);
        // limit to max 1000 rows and 50 cols to prevent browser crash during html2canvas
        if (range.e.r - range.s.r > 1000 || range.e.c - range.s.c > 50) {
          range.e.r = Math.min(range.e.r, range.s.r + 1000);
          range.e.c = Math.min(range.e.c, range.s.c + 50);
          worksheet['!ref'] = XLSX.utils.encode_range(range);
          truncatedWarning = '<div style="color: #ef4444; font-size: 14px; margin-bottom: 8px;">⚠️ Dữ liệu quá lớn. Chỉ hiển thị một phần (tối đa 1000 dòng, 50 cột) để đảm bảo hiệu suất.</div>';
        }
      }

      const matrix = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
      const validRows = matrix.filter(row => row && row.some(cell => String(cell).trim() !== ''));

      if (!validRows || validRows.length === 0) continue;

      let contentHtml = COMMON_A4_STYLES;
      contentHtml += `
        <div>
          <div class="excel-header">
            <span>📊 Bảng tính Excel: <strong>${escapeHtml(sheetName)}</strong></span>
          </div>
          ${truncatedWarning}
        </div>
      `;

      const maxCols = Math.max(...validRows.map(r => r.length));
      let tableHtml = '<table><tbody>';

      validRows.forEach((row, rIdx) => {
        let rowHtml = '<tr>';
        for (let c = 0; c < maxCols; c++) {
          const val = row[c] !== undefined && row[c] !== null ? String(row[c]) : '';
          const escaped = escapeHtml(val);
          if (rIdx === 0) {
            rowHtml += `<th>${escaped}</th>`;
          } else {
            rowHtml += `<td>${escaped}</td>`;
          }
        }
        rowHtml += '</tr>';
        tableHtml += rowHtml;
      });

      tableHtml += '</tbody></table>';
      contentHtml += tableHtml;

      const wrapper = document.createElement('div');
      wrapper.className = 'a4-container';
      // Auto width to avoid squishing large tables, we'll scale it down later
      wrapper.style.width = 'max-content';
      wrapper.style.minWidth = '210mm';
      wrapper.style.padding = '20px';
      wrapper.style.background = '#ffffff';
      wrapper.innerHTML = contentHtml;
      
      container.appendChild(wrapper);
      sheetWrappers.push(wrapper);
    }

    if (sheetWrappers.length === 0) {
      const wrapper = document.createElement('div');
      wrapper.className = 'a4-container';
      wrapper.innerHTML = COMMON_A4_STYLES + '<p>Tài liệu Excel không chứa dữ liệu.</p>';
      container.appendChild(wrapper);
      sheetWrappers.push(wrapper);
    }

    // Pass fitToPage = true for Excel sheets (1 sheet = 1 page)
    return await generatePdfFromElements(sheetWrappers, true);
  } finally {
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  }
}

export async function convertMultipleImagesToPdfBytes(files: File[]): Promise<Uint8Array> {
  const doc = new jsPDF({ unit: 'pt' });
  let isFirstPage = true;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    await new Promise<void>((resolve) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const naturalW = img.naturalWidth || 800;
        const naturalH = img.naturalHeight || 600;

        const pdfW = A4_WIDTH_PT;
        const pdfH = Math.max(200, (naturalH / naturalW) * pdfW);
        const orientation = naturalW > naturalH ? 'l' : 'p';
        
        if (isFirstPage) {
            doc.addPage([pdfW, pdfH], orientation);
            doc.setPage(1);
            doc.deletePage(1);
            isFirstPage = false;
        } else {
            doc.addPage([pdfW, pdfH], orientation);
        }

        const format = (file.type.includes('png') || file.name.toLowerCase().endsWith('.png')) ? 'PNG' : 'JPEG';

        try {
          doc.addImage(img, format, 0, 0, pdfW, pdfH, undefined, 'FAST');
        } catch (e) {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = naturalW;
            canvas.height = naturalH;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0);
              doc.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pdfW, pdfH, undefined, 'FAST');
            }
          } catch (err) {
            console.error('Failed to add image to PDF', err);
          }
        }
        URL.revokeObjectURL(objectUrl);
        resolve();
      };
      img.onerror = () => resolve(); // Skip failing images
      img.src = objectUrl;
    });
  }
  return new Uint8Array(doc.output('arraybuffer'));
}

/**
 * Extract numerical index from filename (e.g. "anh 10.jpg" -> 10, "10.png" -> 10, "Ảnh (10).jpg" -> 10, "trang_01" -> 1)
 */
export function extractFileNumber(fileName: string): number | null {
  const cleanName = fileName.replace(/\.[^/.]+$/, '');
  const matches = cleanName.match(/\d+/g);
  if (!matches || matches.length === 0) return null;
  // Use the salient index (the last group of digits in the filename)
  return parseInt(matches[matches.length - 1], 10);
}

/**
 * Natural comparison matching human intuition (e.g. "anh 2" comes before "anh 10")
 */
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Multi-file Ordering Engine:
 * Giữ nguyên vẹn 100% thứ tự các file theo danh sách bôi đen từ trên xuống dưới:
 * files[0] -> Trang 1
 * files[1] -> Trang 2
 * files[2] -> Trang 3
 * ... files[N] -> Trang N + 1
 */
export function sortFilesByUserSelectionIntent(files: File[]): File[] {
  if (!files || files.length <= 1) return files ? [...files] : [];
  return [...files];
}

/**
 * Helper to preserve natural selection order
 */
export function sortFilesNaturally(files: File[]): File[] {
  return sortFilesByUserSelectionIntent(files);
}

/**
 * Multi-file Ordering & Merge Engine:
 * Ghép danh sách tệp theo đúng thứ tự mảng:
 * files[0] -> Trang 1
 * files[1] -> Trang 2
 * files[2] -> Trang 3
 * ... files[N] -> Trang N + 1
 */
export async function convertMultipleFilesToSinglePdfBytes(
  filesInput: File[],
  skipSort: boolean = false
): Promise<Uint8Array> {
  if (!filesInput || filesInput.length === 0) {
    throw new Error('Không có tệp nào được chọn.');
  }

  const files = skipSort ? [...filesInput] : sortFilesByUserSelectionIntent(filesInput);
  const mergedPdf = await PDFDocument.create();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const lowerName = file.name.toLowerCase();
    const isPdf = file.type === 'application/pdf' || lowerName.endsWith('.pdf');
    const isPng = file.type === 'image/png' || lowerName.endsWith('.png');
    const isJpg =
      file.type === 'image/jpeg' ||
      file.type === 'image/jpg' ||
      lowerName.endsWith('.jpg') ||
      lowerName.endsWith('.jpeg');

    try {
      if (isPdf) {
        const arrayBuffer = await file.arrayBuffer();
        const donorPdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
        const copiedPages = await mergedPdf.copyPages(donorPdf, donorPdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      } else if (isPng) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const pngImage = await mergedPdf.embedPng(arrayBuffer);
          const { width, height } = pngImage.scale(1);
          const page = mergedPdf.addPage([width, height]);
          page.drawImage(pngImage, {
            x: 0,
            y: 0,
            width,
            height,
          });
        } catch {
          // Fallback to canvas converter to avoid skipping or dropping image
          const singleBytes = await convertImageToPdfBytes(file);
          const donorPdf = await PDFDocument.load(singleBytes, { ignoreEncryption: true });
          const copiedPages = await mergedPdf.copyPages(donorPdf, donorPdf.getPageIndices());
          copiedPages.forEach((page) => mergedPdf.addPage(page));
        }
      } else if (isJpg) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const jpgImage = await mergedPdf.embedJpg(arrayBuffer);
          const { width, height } = jpgImage.scale(1);
          const page = mergedPdf.addPage([width, height]);
          page.drawImage(jpgImage, {
            x: 0,
            y: 0,
            width,
            height,
          });
        } catch {
          // Fallback to canvas converter to avoid skipping or dropping image
          const singleBytes = await convertImageToPdfBytes(file);
          const donorPdf = await PDFDocument.load(singleBytes, { ignoreEncryption: true });
          const copiedPages = await mergedPdf.copyPages(donorPdf, donorPdf.getPageIndices());
          copiedPages.forEach((page) => mergedPdf.addPage(page));
        }
      } else if (file.type.startsWith('image/') || ['webp', 'gif', 'bmp', 'svg'].some(ext => lowerName.endsWith('.' + ext))) {
        // Other image formats via canvas converter
        const singleBytes = await convertImageToPdfBytes(file);
        const donorPdf = await PDFDocument.load(singleBytes, { ignoreEncryption: true });
        const copiedPages = await mergedPdf.copyPages(donorPdf, donorPdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      } else {
        const single = await convertAnyFileToPdfBytes(file);
        const donorPdf = await PDFDocument.load(single.bytes, { ignoreEncryption: true });
        const copiedPages = await mergedPdf.copyPages(donorPdf, donorPdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      }
    } catch (err) {
      console.warn(`Lỗi khi ghép tệp ${file.name} tại vị trí trang ${i + 1}:`, err);
    }
  }

  if (mergedPdf.getPageCount() === 0) {
    throw new Error('Không thể tạo trang nào từ danh sách tệp đã chọn.');
  }

  return await mergedPdf.save();
}

/**
 * Reorder pages in an existing PDF document by array of 0-based page indices
 */
export async function reorderPdfPages(
  pdfBytes: Uint8Array,
  newOrderIndices: number[]
): Promise<Uint8Array> {
  const donorPdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const newPdf = await PDFDocument.create();
  const copied = await newPdf.copyPages(donorPdf, newOrderIndices);
  copied.forEach((p) => newPdf.addPage(p));
  return await newPdf.save();
}

/**
 * Universal dispatcher
 */
export async function convertAnyFileToPdfBytes(
  fileOrFiles: File | File[],
  skipSort: boolean = false
): Promise<{ bytes: Uint8Array; fileName: string; isConverted: boolean }> {
  if (Array.isArray(fileOrFiles)) {
    if (fileOrFiles.length === 0) throw new Error('Không có tệp nào được chọn.');
    if (fileOrFiles.length === 1) return convertAnyFileToPdfBytes(fileOrFiles[0]);

    const files = skipSort ? [...fileOrFiles] : sortFilesByUserSelectionIntent(fileOrFiles);
    const bytes = await convertMultipleFilesToSinglePdfBytes(files, true);
    const firstName = files[0].name.replace(/\.[^/.]+$/, '');
    const fileName = `${firstName} (${files.length} tệp).pdf`;
    return { bytes, fileName, isConverted: true };
  }

  const file = fileOrFiles as File;
  const fileName = file.name;
  const ext = fileName.toLowerCase().split('.').pop() || '';
  const type = file.type.toLowerCase();

  if (type.includes('pdf') || ext === 'pdf') {
    const buffer = await file.arrayBuffer();
    return { bytes: new Uint8Array(buffer), fileName, isConverted: false };
  }

  if (['docx', 'doc'].includes(ext) || type.includes('word') || type.includes('msword') || type.includes('document')) {
    const bytes = await convertWordToPdfBytes(file);
    return { bytes, fileName, isConverted: true };
  }

  if (['html', 'htm'].includes(ext) || type.includes('html')) {
    const bytes = await convertHtmlFileToPdfBytes(file);
    return { bytes, fileName, isConverted: true };
  }

  if (['xlsx', 'xls'].includes(ext) || type.includes('excel') || type.includes('spreadsheetml')) {
    const bytes = await convertExcelToPdfBytes(file);
    return { bytes, fileName, isConverted: true };
  }

  if (type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext)) {
    const bytes = await convertImageToPdfBytes(file);
    return { bytes, fileName, isConverted: true };
  }

  throw new Error('Định dạng tệp không được hỗ trợ.');
}
