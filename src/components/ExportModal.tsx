import React, { useState, useEffect } from 'react';
import {
  X,
  Download,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Layers,
  Archive,
} from 'lucide-react';
import {
  HighlightAnnotation,
  TextNoteAnnotation,
  DrawingStroke,
  BoxAnnotation,
  FreeTextAnnotation,
} from '../types';
import { parsePageRange, executeExportPages } from '../utils/pageExporter';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  pdfDoc: any;
  bookTitle: string;
  totalPages: number;
  currentPage: number;
  highlights: HighlightAnnotation[];
  textNotes: TextNoteAnnotation[];
  drawings: DrawingStroke[];
  boxes: BoxAnnotation[];
  freeTexts: FreeTextAnnotation[];
  screenScale?: number;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  pdfDoc,
  bookTitle,
  totalPages,
  currentPage,
  highlights,
  textNotes,
  drawings,
  boxes,
  freeTexts,
  screenScale,
}) => {
  const [rangeType, setRangeType] = useState<'all' | 'current' | 'custom'>('custom');
  const [customRangeInput, setCustomRangeInput] = useState<string>('');
  const [exportFormat, setExportFormat] = useState<'pdf' | 'png' | 'jpeg'>('pdf');
  const [resolutionScale, setResolutionScale] = useState<number>(2.0);
  const [includeAnnotations, setIncludeAnnotations] = useState<boolean>(true);

  // Progress state
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [progressInfo, setProgressInfo] = useState<{ current: number; total: number; message: string }>({
    current: 0,
    total: 0,
    message: '',
  });
  const [exportError, setExportError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  // ESC key listener to close drawer
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isExporting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isExporting, onClose]);

  // Initialize custom range input to current page or simple default
  useEffect(() => {
    if (isOpen) {
      setCustomRangeInput(String(currentPage || 1));
      setRangeType('current');
      setIsSuccess(false);
      setExportError(null);
      setIsExporting(false);
    }
  }, [isOpen, currentPage]);

  if (!isOpen) return null;

  // Calculate pages to export
  let targetPages: number[] = [];
  if (rangeType === 'all') {
    targetPages = Array.from({ length: totalPages }, (_, i) => i + 1);
  } else if (rangeType === 'current') {
    targetPages = [currentPage || 1];
  } else {
    targetPages = parsePageRange(customRangeInput, totalPages);
  }

  const handleStartExport = async () => {
    if (!pdfDoc || targetPages.length === 0) {
      setExportError('Vui lòng chọn hoặc nhập ít nhất một trang hợp lệ để xuất.');
      return;
    }

    try {
      setIsExporting(true);
      setExportError(null);
      setIsSuccess(false);

      await executeExportPages({
        pdfDoc,
        bookTitle: bookTitle || 'Swiftbook',
        selectedPages: targetPages,
        format: exportFormat,
        resolutionScale,
        includeAnnotations,
        highlights,
        textNotes,
        drawings,
        boxes,
        freeTexts,
        screenScale,
        onProgress: (current, total, message) => {
          setProgressInfo({ current, total, message });
        },
      });

      setIsSuccess(true);
      setTimeout(() => {
        if (!isExporting) {
          onClose();
        }
      }, 1500);
    } catch (err: any) {
      console.error('Export failed:', err);
      setExportError(err?.message || 'Có lỗi xảy ra trong quá trình xuất trang. Vui lòng thử lại.');
    } finally {
      setIsExporting(false);
    }
  };

  const progressPercent =
    progressInfo.total > 0
      ? Math.round((progressInfo.current / progressInfo.total) * 100)
      : 0;

  return (
    <div className="fixed inset-0 z-[99999] bg-transparent flex justify-end font-['Inter',sans-serif] tracking-normal">
      {/* Backdrop click area */}
      <div className="absolute inset-0 bg-transparent" onClick={isExporting ? undefined : onClose} />

      {/* Drawer panel sliding in from the right */}
      <div className="relative z-10 w-full max-w-md bg-white h-full shadow-[0_8px_32px_rgba(0,0,0,0.12)] flex flex-col font-['Inter',sans-serif] tracking-normal border-l border-neutral-200/90 animate-in slide-in-from-right duration-300">
        {/* Header - Clean, modern, no heavy borders */}
        <div className="px-5 py-4 bg-neutral-900 text-white flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white tracking-normal">Xuất & Tải về trang</h2>
            <p className="text-xs text-neutral-400 font-normal tracking-normal mt-0.5">
              Tải trang tài liệu kèm ghi chú, nét vẽ & văn bản
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isExporting}
            className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors disabled:opacity-30 cursor-pointer"
            title="Đóng bảng xuất (ESC)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs font-['Inter',sans-serif] tracking-normal">
          {/* Error message */}
          {exportError && (
            <div className="bg-red-50 text-red-700 px-3.5 py-2.5 rounded-xl flex items-center gap-2 tracking-normal">
              <AlertCircle size={16} className="shrink-0 text-red-500" />
              <span>{exportError}</span>
            </div>
          )}

          {/* Success message */}
          {isSuccess && (
            <div className="bg-emerald-50 text-emerald-800 px-3.5 py-2.5 rounded-xl flex items-center gap-2 font-medium tracking-normal">
              <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
              <span>Tải về hoàn tất thành công! Đang đóng cửa sổ...</span>
            </div>
          )}

          {/* 1. Chọn phạm vi trang */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-neutral-800">
              <span className="font-semibold text-xs tracking-normal">1. Phạm vi trang</span>
              <span className="text-[11px] text-neutral-500 tracking-normal">
                Tổng: {totalPages} trang
              </span>
            </div>

            {/* Selection modes - segmented button style */}
            <div className="bg-neutral-100 p-1 rounded-xl grid grid-cols-3 gap-1">
              <button
                type="button"
                onClick={() => setRangeType('current')}
                disabled={isExporting}
                className={`py-2 px-1 rounded-lg text-center text-xs transition-all tracking-normal ${
                  rangeType === 'current'
                    ? 'bg-white text-neutral-900 font-semibold shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900 font-medium'
                }`}
              >
                Trang hiện tại ({currentPage})
              </button>

              <button
                type="button"
                onClick={() => setRangeType('custom')}
                disabled={isExporting}
                className={`py-2 px-1 rounded-lg text-center text-xs transition-all tracking-normal ${
                  rangeType === 'custom'
                    ? 'bg-white text-neutral-900 font-semibold shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900 font-medium'
                }`}
              >
                Trang tùy chỉnh
              </button>

              <button
                type="button"
                onClick={() => setRangeType('all')}
                disabled={isExporting}
                className={`py-2 px-1 rounded-lg text-center text-xs transition-all tracking-normal ${
                  rangeType === 'all'
                    ? 'bg-white text-neutral-900 font-semibold shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900 font-medium'
                }`}
              >
                Toàn bộ ({totalPages})
              </button>
            </div>

            {/* Custom Range Input Field */}
            {rangeType === 'custom' && (
              <div className="space-y-1.5 pt-1 animate-in fade-in tracking-normal">
                <input
                  type="text"
                  value={customRangeInput}
                  onChange={(e) => setCustomRangeInput(e.target.value)}
                  disabled={isExporting}
                  placeholder="Ví dụ: 5 hoặc 5-10 hoặc 1, 3, 5-8"
                  className="w-full px-3.5 py-2 bg-neutral-50 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#f5c41a] outline-none text-neutral-900 text-xs placeholder:text-neutral-400 transition-colors"
                />
                <div className="text-[11px] text-neutral-500 px-1 tracking-normal">
                  Trang lẻ: <strong className="text-neutral-800 font-semibold">5</strong> | Khoảng: <strong className="text-neutral-800 font-semibold">5-10</strong> | Kết hợp: <strong className="text-neutral-800 font-semibold">1, 5, 10-15</strong>
                </div>
              </div>
            )}

            {/* Target pages preview info */}
            <div className="bg-neutral-50 rounded-xl px-3 py-2 text-[11px] text-neutral-700 flex items-center justify-between tracking-normal">
              <span>
                Số lượng xuất:{' '}
                <strong className="text-neutral-950 font-semibold">{targetPages.length} trang</strong>
              </span>
              <span className="text-neutral-500 truncate max-w-[200px]">
                {targetPages.length <= 8
                  ? targetPages.join(', ')
                  : `${targetPages.slice(0, 5).join(', ')} ... ${targetPages[targetPages.length - 1]}`}
              </span>
            </div>
          </div>

          {/* 2. Định dạng xuất - Thiết kế gọn gàng tối giản */}
          <div className="space-y-2 tracking-normal">
            <div className="font-semibold text-neutral-800 text-xs tracking-normal">
              2. Định dạng tệp xuất
            </div>
            <div className="bg-neutral-100 p-1 rounded-xl grid grid-cols-3 gap-1">
              <button
                type="button"
                onClick={() => setExportFormat('pdf')}
                disabled={isExporting}
                className={`py-2 px-2 rounded-lg flex flex-col items-center justify-center text-center transition-all tracking-normal ${
                  exportFormat === 'pdf'
                    ? 'bg-white text-neutral-900 font-semibold shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900 font-medium'
                }`}
              >
                <span className="text-xs font-semibold">TÀI LIỆU PDF</span>
                <span className="text-[10px] text-neutral-400 font-normal">.pdf</span>
              </button>

              <button
                type="button"
                onClick={() => setExportFormat('png')}
                disabled={isExporting}
                className={`py-2 px-2 rounded-lg flex flex-col items-center justify-center text-center transition-all tracking-normal ${
                  exportFormat === 'png'
                    ? 'bg-white text-neutral-900 font-semibold shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900 font-medium'
                }`}
              >
                <span className="text-xs font-semibold">ẢNH PNG</span>
                <span className="text-[10px] text-neutral-400 font-normal">.png</span>
              </button>

              <button
                type="button"
                onClick={() => setExportFormat('jpeg')}
                disabled={isExporting}
                className={`py-2 px-2 rounded-lg flex flex-col items-center justify-center text-center transition-all tracking-normal ${
                  exportFormat === 'jpeg'
                    ? 'bg-white text-neutral-900 font-semibold shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900 font-medium'
                }`}
              >
                <span className="text-xs font-semibold">ẢNH JPG</span>
                <span className="text-[10px] text-neutral-400 font-normal">.jpg</span>
              </button>
            </div>
          </div>

          {/* 3. Tùy chọn nâng cao */}
          <div className="space-y-3 pt-2 tracking-normal">
            {/* Flatten annotations checkbox */}
            <label className="flex items-center gap-2.5 cursor-pointer select-none tracking-normal">
              <input
                type="checkbox"
                checked={includeAnnotations}
                onChange={(e) => setIncludeAnnotations(e.target.checked)}
                disabled={isExporting}
                className="w-4 h-4 rounded text-neutral-900 accent-neutral-900"
              />
              <div className="flex flex-col">
                <span className="font-medium text-neutral-900 tracking-normal">
                  Gộp đầy đủ nét vẽ, highlight & ghi chú
                </span>
                <span className="text-[11px] text-neutral-500 tracking-normal">
                  Lưu trực tiếp các chỉnh sửa vào từng trang xuất
                </span>
              </div>
            </label>

            {/* Quality scale selector */}
            <div className="flex items-center justify-between bg-neutral-50 p-2.5 rounded-xl tracking-normal text-xs">
              <span className="text-neutral-700 font-medium tracking-normal">Độ phân giải xuất:</span>
              <div className="flex items-center gap-1">
                {[
                  { label: '2x', val: 2.0 },
                  { label: '3x', val: 3.0 },
                  { label: '4x', val: 4.0 },
                ].map((item) => (
                  <button
                    key={item.val}
                    type="button"
                    onClick={() => setResolutionScale(item.val)}
                    disabled={isExporting}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all tracking-normal ${
                      resolutionScale === item.val
                        ? 'bg-neutral-900 text-white shadow-xs'
                        : 'text-neutral-600 hover:bg-neutral-200/60'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Progress display during export */}
          {isExporting && (
            <div className="bg-neutral-900 text-white p-3.5 rounded-xl space-y-2 animate-in fade-in tracking-normal">
              <div className="flex items-center justify-between text-xs tracking-normal">
                <span className="flex items-center gap-2 font-medium">
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {progressInfo.message || 'Đang xử lý xuất trang...'}
                </span>
                <span className="font-bold text-[#f5c41a] tracking-normal">{progressPercent}%</span>
              </div>
              <div className="w-full bg-neutral-700 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-[#f5c41a] h-full transition-all duration-200 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 bg-neutral-50 flex items-center justify-between gap-3 font-['Inter',sans-serif] tracking-normal">
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            className="px-4 py-2 text-xs font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/60 rounded-xl transition-colors disabled:opacity-40 tracking-normal"
          >
            Đóng
          </button>

          <button
            type="button"
            onClick={handleStartExport}
            disabled={isExporting || targetPages.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-neutral-900 hover:bg-black text-white rounded-xl text-xs font-semibold shadow-md transition-all disabled:opacity-40 cursor-pointer tracking-normal"
          >
            <Download size={14} className="text-[#f5c41a]" />
            <span className="tracking-normal">
              {isExporting ? 'Đang kết xuất...' : `Tải về (${targetPages.length} trang)`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
