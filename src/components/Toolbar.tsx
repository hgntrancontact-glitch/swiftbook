import React, { useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ActiveTool,
  HighlightColor,
  ViewMode,
  HIGHLIGHT_COLORS,
  BOX_COLORS,
} from '../types';
import {
  Menu,
  Upload,
  BookOpen,
  FileText,
  ScrollText,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Image as ImageIcon,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Highlighter,
  Square,
  Type,
  StickyNote,
  PenTool,
  Eraser,
  MousePointer,
  BookmarkCheck,
  CheckCircle2,
  Sparkles,
  Download,
  RotateCcw,
  Layers,
  ArrowUpDown,
} from 'lucide-react';
import { Tooltip } from './Tooltip';
import { CreateBookMenu } from './CreateBookMenu';
import { CustomBookConfig } from '../utils/customBookGenerator';

interface ToolbarProps {
  fileName: string;
  currentPage: number;
  totalPages: number;
  viewMode: ViewMode;
  scale: number;
  activeTool: ActiveTool;
  penColor: string;
  penSize: number;
  highlightColor: HighlightColor;
  boxColor: string;
  isSidebarOpen: boolean;
  isSaveBookModalOpen?: boolean;
  isLibraryModalOpen?: boolean;
  isExportModalOpen?: boolean;
  isCustomBookCreated?: boolean;
  totalAnnotations: number;
  onToggleSidebar: () => void;
  onFileUpload: (file: File | File[]) => void;
  onLoadSample: () => void;
  onResetToSample: () => void;
  onOpenSaveBookModal: () => void;
  onOpenLibraryModal: () => void;
  onPageChange: (page: number) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onZoomChange: (scale: number, resetFitMode?: boolean) => void;
  onActiveToolChange: (tool: ActiveTool) => void;
  onPenColorChange: (color: string) => void;
  onPenSizeChange: (size: number) => void;
  onHighlightColorChange: (color: HighlightColor) => void;
  onBoxColorChange: (color: string) => void;
  onOpenExportModal: () => void;
  onCreateBook?: (config: CustomBookConfig) => void;
  onAddPage?: () => void;
}

const PEN_COLORS = ['#000000', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];
const PEN_SIZES = [2, 4, 8];

export const Toolbar: React.FC<ToolbarProps> = ({
  fileName,
  currentPage,
  totalPages,
  viewMode,
  scale,
  activeTool,
  penColor,
  penSize,
  highlightColor,
  boxColor,
  isSidebarOpen,
  isSaveBookModalOpen = false,
  isLibraryModalOpen = false,
  isExportModalOpen = false,
  isCustomBookCreated = false,
  totalAnnotations,
  onToggleSidebar,
  onFileUpload,
  onLoadSample,
  onResetToSample,
  onOpenSaveBookModal,
  onOpenLibraryModal,
  onPageChange,
  onViewModeChange,
  onZoomChange,
  onActiveToolChange,
  onPenColorChange,
  onPenSizeChange,
  onHighlightColorChange,
  onBoxColorChange,
  onOpenExportModal,
  onCreateBook,
  onAddPage,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadMenuRef = useRef<HTMLDivElement>(null);
  const uploadMenuPopoverRef = useRef<HTMLDivElement>(null);
  const [uploadMenuCoords, setUploadMenuCoords] = React.useState<{ top: number; left: number } | null>(null);
  const headerRef = useRef<HTMLElement>(null);
  const [headerScale, setHeaderScale] = React.useState<number>(1.0);
  const [pageInputValue, setPageInputValue] = React.useState<string>(String(currentPage));
  const [zoomInputValue, setZoomInputValue] = React.useState<string>(`${Math.round(scale * 100)}%`);
  const [isZoomInputFocused, setIsZoomInputFocused] = React.useState(false);
  const [isUploadMenuOpen, setIsUploadMenuOpen] = React.useState(false);

  const updateUploadMenuPos = () => {
    if (uploadMenuRef.current) {
      const rect = uploadMenuRef.current.getBoundingClientRect();
      setUploadMenuCoords({
        top: rect.bottom + 4,
        left: Math.max(8, rect.left),
      });
    }
  };

  useLayoutEffect(() => {
    if (isUploadMenuOpen) {
      updateUploadMenuPos();
    }
  }, [isUploadMenuOpen]);
  const STANDARD_FILE_ACCEPT = ".pdf, .png, .jpg, .jpeg, application/pdf, image/png, image/jpeg";
  const [acceptType, setAcceptType] = React.useState<string>(STANDARD_FILE_ACCEPT);

  const ALL_SUPPORTED_ACCEPTS = STANDARD_FILE_ACCEPT;
  const [resetConfirm, setResetConfirm] = React.useState(false);
  const resetTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Responsive Header Auto-Scaler: Automatically scales buttons, icons, fonts, padding & gaps
  // Strictly bounded to a minimum scale of 0.95 (95%) - Bắt buộc khoá chặt tỷ lệ ở mức 0.95, không được thu nhỏ thêm
  React.useEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    const calculateScale = () => {
      const width = el.clientWidth;
      const BASE_WIDTH = 1200;
      const MIN_SCALE = 0.95; // Điểm chặn tối thiểu Min-Scale cho Header là 95% (0.95)
      if (width < BASE_WIDTH) {
        const ratio = Math.max(MIN_SCALE, width / BASE_WIDTH);
        setHeaderScale(ratio);
      } else {
        setHeaderScale(1.0);
      }
    };

    calculateScale();
    const ro = new ResizeObserver(() => {
      calculateScale();
    });
    ro.observe(el);
    window.addEventListener('resize', calculateScale);

    const handleHeaderWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      if (el.scrollWidth > el.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener('wheel', handleHeaderWheel, { passive: true });

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', calculateScale);
      el.removeEventListener('wheel', handleHeaderWheel);
    };
  }, []);

  React.useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        uploadMenuRef.current &&
        !uploadMenuRef.current.contains(target) &&
        uploadMenuPopoverRef.current &&
        !uploadMenuPopoverRef.current.contains(target)
      ) {
        setIsUploadMenuOpen(false);
      }
    };

    const handleScrollOrResize = () => {
      if (isUploadMenuOpen) {
        updateUploadMenuPos();
      }
    };

    if (isUploadMenuOpen) {
      window.addEventListener('mousedown', handleGlobalClick);
      window.addEventListener('resize', handleScrollOrResize);
      window.addEventListener('scroll', handleScrollOrResize, true);
    }
    return () => {
      window.removeEventListener('mousedown', handleGlobalClick);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, [isUploadMenuOpen]);

  const handleResetClick = () => {
    if (resetConfirm) {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      setResetConfirm(false);
      onResetToSample();
    } else {
      setResetConfirm(true);
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(() => {
        setResetConfirm(false);
      }, 2500);
    }
  };

  const handleResetDoubleClick = () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    setResetConfirm(false);
    onResetToSample();
  };

  React.useEffect(() => {
    setPageInputValue(String(currentPage));
  }, [currentPage]);

  React.useEffect(() => {
    if (!isZoomInputFocused) {
      setZoomInputValue(`${Math.round(scale * 100)}%`);
    }
  }, [scale, isZoomInputFocused]);

  const handleZoomInputSubmit = () => {
    // Extract only digits and decimal points (automatically ignores % or any other text)
    const cleanStr = zoomInputValue.replace(/[^0-9.]/g, '');
    const parsedNum = parseFloat(cleanStr);
    if (!isNaN(parsedNum) && parsedNum > 0) {
      // Keep the zoom controls aligned with the 20% minimum.
      const clampedPercent = Math.max(20, Math.min(5000, parsedNum));
      const newScale = Number((clampedPercent / 100).toFixed(2));
      onZoomChange(newScale, false);
      setZoomInputValue(`${Math.round(clampedPercent)}%`);
    } else {
      setZoomInputValue(`${Math.round(scale * 100)}%`);
    }
  };

  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pageNum = parseInt(pageInputValue, 10);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
      onPageChange(pageNum);
    } else {
      setPageInputValue(String(currentPage));
    }
  };

  
  const triggerUpload = (acceptType: string, multiple = false) => {
    setIsUploadMenuOpen(false);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = acceptType;
    input.multiple = multiple;
    input.onchange = (e) => {
      const rawFiles = (e.target as HTMLInputElement).files;
      if (!rawFiles || rawFiles.length === 0) return;
      // Preserve exact native index order: files[0] = Page 1, files[1] = Page 2...
      const files = Array.from(rawFiles);
      if (files.length > 0) {
        if (multiple && files.length > 1) {
          onFileUpload(files);
        } else {
          onFileUpload(files[0]);
        }
      }
    };
    input.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = e.target.files;
    if (!rawFiles || rawFiles.length === 0) return;
    const files = Array.from(rawFiles);
    if (files.length > 0) {
      if (e.target.multiple && files.length > 1) {
        onFileUpload(files);
      } else {
        onFileUpload(files[0]);
      }
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <header
      ref={headerRef}
      id="app-header"
      className="bg-white border-t-[0.5px] border-t-neutral-200/40 border-b border-b-neutral-200/70 sticky top-0 z-30 font-['Inter',sans-serif] h-[38px] flex items-center shrink-0 w-full overflow-x-auto overflow-y-hidden no-scrollbar select-none"
    >
      <div
        className="px-2 sm:px-3 flex items-center justify-between gap-1 sm:gap-2 relative h-full shrink-0 flex-nowrap"
        style={
          headerScale < 1.0
            ? {
                minWidth: '1200px',
                width: `${Math.max(1200, (headerRef.current?.clientWidth || 1200) / headerScale)}px`,
                transform: `scale(${headerScale})`,
                transformOrigin: 'left center',
              }
            : {
                width: '100%',
                minWidth: '100%',
              }
        }
      >
        {/* Left Section: Logo Reset, Sidebar Toggle, File Upload */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 z-10 whitespace-nowrap">
          {/* Branding */}
          <div className="flex items-center gap-2 mr-1 sm:mr-3 border-r border-neutral-200/70 pr-2 sm:pr-4 h-[26px]">
            <span className="font-bold text-neutral-900 text-[20px] tracking-tight select-none leading-none">
              Swiftbook
            </span>
            <span className="bg-[#f5c41a] text-black px-2.5 py-0.5 rounded-full text-[11.5px] font-medium leading-tight select-none">
              by Swiftstreet
            </span>
          </div>

          {/* Logo / Reset Button (Nhấn đúp 2 lần mới Reset) */}
          <button
            onClick={handleResetClick}
            onDoubleClick={handleResetDoubleClick}
            className={`h-[26px] flex items-center gap-1 px-2 rounded-md text-xs font-bold transition-all shadow-2xs group whitespace-nowrap ${
              resetConfirm
                ? 'bg-red-600 hover:bg-red-700 text-white border-red-600 ring-2 ring-red-400 animate-pulse'
                : 'bg-neutral-100 hover:bg-red-50 text-neutral-800 hover:text-red-600 border border-neutral-300 hover:border-red-300'
            }`}
          >
            <RotateCcw size={13} className={resetConfirm ? 'text-white rotate-180 transition-transform' : 'text-neutral-700 group-hover:text-red-600 group-hover:-rotate-90 transition-transform duration-300'} />
            <span className="font-semibold">{resetConfirm ? 'Nhấn lại để Reset' : 'Reset'}</span>
          </button>

          {/* Sidebar Toggle */}
          <button
            onClick={onToggleSidebar}
            className={`h-[26px] px-2 rounded-md border transition-all flex items-center gap-1 text-xs font-medium whitespace-nowrap ${
              isSidebarOpen
                ? 'bg-neutral-900 text-white border-neutral-900 shadow-xs'
                : 'bg-white text-neutral-800 border-neutral-300 hover:bg-neutral-100'
            }`}
          >
            <Menu size={14} />
            <span>Mục lục</span>
          </button>

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept={STANDARD_FILE_ACCEPT}
            multiple={true}
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Header File Upload Dropdown Menu */}
          <div className="relative" ref={uploadMenuRef}>
            <button
              type="button"
              onClick={() => setIsUploadMenuOpen((prev) => !prev)}
              className="h-[26px] flex items-center gap-1.5 px-2.5 bg-neutral-900 hover:bg-black text-white rounded-md text-xs font-medium transition-all shadow-xs cursor-pointer select-none whitespace-nowrap"
            >
              <Upload size={13} />
              <span>Tải lên tệp</span>
              <ChevronDown size={12} className={`transition-transform duration-150 ${isUploadMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {isUploadMenuOpen &&
              uploadMenuCoords &&
              typeof document !== 'undefined' &&
              createPortal(
                <div
                  ref={uploadMenuPopoverRef}
                  style={{
                    position: 'fixed',
                    top: `${uploadMenuCoords.top}px`,
                    left: `${uploadMenuCoords.left}px`,
                  }}
                  className="min-w-[120px] bg-white rounded-lg shadow-xl border border-neutral-200 py-1 z-[999999] animate-in fade-in zoom-in-95 duration-100 flex flex-col overflow-hidden font-['Inter',sans-serif]"
                >
                  <button
                    type="button"
                    onClick={() => triggerUpload(".pdf,application/pdf", false)}
                    className="w-full px-3 py-1.5 text-left text-xs font-medium text-neutral-800 hover:bg-neutral-100 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Tải PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerUpload(".png,.jpg,.jpeg,image/png,image/jpeg", true)}
                    className="w-full px-3 py-1.5 text-left text-xs font-medium text-neutral-800 hover:bg-neutral-100 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Tải Ảnh
                  </button>
                </div>,
                document.body
              )}
          </div>

          {fileName && (
            <div className="text-xs font-normal text-neutral-500 truncate max-w-[110px] pl-1 whitespace-nowrap" title={fileName}>
              {fileName}
            </div>
          )}
        </div>

        {/* Center Section: Page Navigation & View Mode (Chính giữa trang) */}
        <div className="flex items-center gap-0.5 sm:gap-1 bg-neutral-50 h-[26px] px-1.5 rounded-md border border-neutral-200 shrink-0 z-10 whitespace-nowrap">
          <Tooltip content="Trang trước (←)" side="bottom">
            <button
              onClick={() => {
                if (viewMode === 'double') {
                  const left = currentPage % 2 === 1 ? currentPage : currentPage - 1;
                  onPageChange(Math.max(1, left - 2));
                } else {
                  onPageChange(Math.max(1, currentPage - 1));
                }
              }}
              disabled={viewMode === 'double' ? (currentPage % 2 === 1 ? currentPage : currentPage - 1) <= 1 : currentPage <= 1}
              className="p-0.5 rounded hover:bg-neutral-200 text-neutral-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronLeft size={13} />
            </button>
          </Tooltip>

          <form onSubmit={handlePageInputSubmit} className="flex items-center gap-0.5 sm:gap-1 text-xs">
            <span className="text-neutral-500 font-normal hidden sm:inline text-xs leading-none">Trang</span>
            <input
              type="text"
              value={pageInputValue}
              onChange={(e) => setPageInputValue(e.target.value)}
              onBlur={handlePageInputSubmit}
              className="w-8 h-[20px] text-center py-0 px-0.5 bg-white border border-neutral-300 rounded font-semibold text-neutral-900 text-xs focus:ring-1 focus:ring-neutral-900 focus:outline-none leading-none"
              title="Nhập số trang và nhấn Enter"
            />
            <span className="text-neutral-500 font-normal text-xs leading-none">/ {totalPages || 1}</span>
          </form>

          <Tooltip content="Trang sau (→)" side="bottom">
            <button
              onClick={() => {
                if (viewMode === 'double') {
                  const left = currentPage % 2 === 1 ? currentPage : currentPage - 1;
                  onPageChange(Math.min(totalPages, left + 2));
                } else {
                  onPageChange(Math.min(totalPages, currentPage + 1));
                }
              }}
              disabled={viewMode === 'double' ? (currentPage % 2 === 1 ? currentPage : currentPage - 1) + 1 >= totalPages : currentPage >= totalPages}
              className="p-0.5 rounded hover:bg-neutral-200 text-neutral-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronRight size={13} />
            </button>
          </Tooltip>

          {/* View Mode switcher */}
          <div className="h-3.5 w-px bg-neutral-300 mx-0.5" />

          <div className="flex items-center gap-0.5">
            <Tooltip content="Chế độ Sách 2 Trang" side="bottom">
              <button
                onClick={() => onViewModeChange('double')}
                className={`p-0.5 rounded transition-colors ${
                  viewMode === 'double'
                    ? 'bg-neutral-900 text-white shadow-2xs'
                    : 'text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                <BookOpen size={13} />
              </button>
            </Tooltip>
            <Tooltip content="Chế độ 1 Trang" side="bottom">
              <button
                onClick={() => onViewModeChange('single')}
                className={`p-0.5 rounded transition-colors ${
                  viewMode === 'single'
                    ? 'bg-neutral-900 text-white shadow-2xs'
                    : 'text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                <FileText size={13} />
              </button>
            </Tooltip>
            <Tooltip content="Chế độ Cuộn Liên Tục" side="bottom">
              <button
                onClick={() => onViewModeChange('continuous')}
                className={`p-0.5 rounded transition-colors ${
                  viewMode === 'continuous'
                    ? 'bg-neutral-900 text-white shadow-2xs'
                    : 'text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                <ScrollText size={13} />
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Right Section: Create Book, Save & Kho sách, Tool Selector & Quick actions */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 z-10">
          {/* Create Book / Add Page Button */}
          {onCreateBook && onAddPage && (
            <CreateBookMenu
              isCreated={isCustomBookCreated}
              onAddPage={onAddPage}
              onCreateBook={onCreateBook}
            />
          )}

          {/* Save Book button & Kho sách button */}
          <button
            onClick={onOpenSaveBookModal}
            className="h-[26px] flex items-center gap-1 px-2.5 bg-[#f5c41a] hover:bg-[#e1b418] text-neutral-900 rounded-md text-xs font-semibold transition-all shadow-xs cursor-pointer select-none"
          >
            <BookmarkCheck size={13} className="text-neutral-900" />
            <span>Save</span>
          </button>
          
          <button
            onClick={onOpenLibraryModal}
            className="h-[26px] flex items-center gap-1 px-2.5 bg-[#f5c41a] hover:bg-[#e1b418] text-neutral-900 rounded-md text-xs font-semibold transition-all shadow-xs cursor-pointer select-none"
          >
            <Layers size={13} className="text-neutral-900" />
            <span>Kho sách</span>
          </button>

          <div className="h-4 w-px bg-neutral-200 mx-0.5" />

          {/* Pointer / Select tool */}
          <Tooltip content="Con trỏ chuột " side="bottom">
            <button
              onClick={() => onActiveToolChange('select')}
              className={`h-[26px] w-[26px] flex items-center justify-center rounded-md transition-colors border ${
                activeTool === 'select'
                  ? 'bg-neutral-900 text-white border-neutral-900 shadow-2xs'
                  : 'text-neutral-700 bg-neutral-50 border-neutral-200 hover:bg-neutral-200'
              }`}
            >
              <MousePointer size={13} />
            </button>
          </Tooltip>

          {/* Zoom Controls */}
          <div className="flex items-center h-[26px] gap-0.5 bg-neutral-50 px-1 rounded-md border border-neutral-200 text-xs">
            <Tooltip content="Vừa vặn màn hình" side="bottom">
              <button
                onClick={() => onZoomChange(1.0, true)}
                className={`p-0.5 rounded transition-colors ${scale === 1.0 ? 'text-blue-600 bg-blue-50' : 'text-neutral-700 hover:text-neutral-900 hover:bg-neutral-200'}`}
              >
                <Maximize2 size={12} />
              </button>
            </Tooltip>
            <div className="w-px h-3.5 bg-neutral-300 mx-0.5" />
            <Tooltip content="Thu nhỏ (-10%)" side="bottom">
              <button
                onClick={() => {
                  const currentPercent = Math.round(scale * 100);
                  const nextPercent = Math.max(20, Math.floor((currentPercent - 1) / 10) * 10);
                  onZoomChange(Number((nextPercent / 100).toFixed(2)), false);
                }}
                disabled={Math.round(scale * 100) <= 20}
                className={`p-0.5 rounded transition-colors ${
                  Math.round(scale * 100) <= 20
                    ? 'text-neutral-300 cursor-not-allowed'
                    : 'text-neutral-700 hover:text-neutral-900 hover:bg-neutral-200'
                }`}
              >
                <ZoomOut size={12} />
              </button>
            </Tooltip>
            <input
              type="text"
              value={zoomInputValue}
              onChange={(e) => setZoomInputValue(e.target.value)}
              onFocus={(e) => {
                setIsZoomInputFocused(true);
                // Strip % when focusing so user can simply type a number like 100
                const num = e.target.value.replace(/[^0-9.]/g, '');
                if (num) setZoomInputValue(num);
                e.target.select();
              }}
              onBlur={() => {
                setIsZoomInputFocused(false);
                handleZoomInputSubmit();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              onDoubleClick={() => onZoomChange(scale, true)}
              className="font-sans text-xs font-medium text-neutral-800 w-11 h-[20px] text-center bg-transparent hover:bg-white focus:bg-white border border-transparent focus:border-neutral-300 rounded outline-none py-0 px-0.5 transition-all cursor-text focus:ring-1 focus:ring-neutral-400 leading-none"
              title="Nhập số thu phóng (vd: 100) và nhấn Enter (hoặc nhấp đúp để Tự động khớp)"
            />
            <Tooltip content="Phóng to (+10%)" side="bottom">
              <button
                onClick={() => {
                  const currentPercent = Math.round(scale * 100);
                  const nextPercent = Math.min(5000, Math.ceil((currentPercent + 1) / 10) * 10);
                  onZoomChange(Number((nextPercent / 100).toFixed(2)), false);
                }}
                disabled={Math.round(scale * 100) >= 5000}
                className={`p-0.5 rounded transition-colors ${
                  Math.round(scale * 100) >= 5000
                    ? 'text-neutral-300 cursor-not-allowed'
                    : 'text-neutral-700 hover:text-neutral-900 hover:bg-neutral-200'
                }`}
              >
                <ZoomIn size={12} />
              </button>
            </Tooltip>
          </div>

          {/* Auto-save Badge */}
          <Tooltip content="Dữ liệu ghi chú và trang đọc tự động lưu" side="bottom">
            <div className="h-[26px] hidden xl:flex items-center gap-1 text-xs text-neutral-700 font-normal px-2 rounded-md bg-neutral-100">
              <CheckCircle2 size={13} className="text-emerald-600" />
              <span>Tự lưu</span>
            </div>
          </Tooltip>

          {/* Export / Download Pages button */}
          <Tooltip content="Xuất & Tải về (PDF/Ảnh)" side="bottom" disabled={isExportModalOpen}>
            <button
              onClick={onOpenExportModal}
              className="h-[26px] w-[26px] flex items-center justify-center rounded-md border border-neutral-300 text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
            >
              <Download size={13} />
            </button>
          </Tooltip>

          {/* Fullscreen button */}
          <Tooltip content="Toàn màn hình" side="bottom">
            <button
              onClick={toggleFullscreen}
              className="h-[26px] w-[26px] flex items-center justify-center rounded-md border border-neutral-300 text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100 transition-colors hidden sm:flex"
            >
              <Maximize2 size={13} />
            </button>
          </Tooltip>
        </div>
      </div>
    </header>
  );
};
