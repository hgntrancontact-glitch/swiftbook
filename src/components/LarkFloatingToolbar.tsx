import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ActiveTool } from '../types';
import {
  MousePointer,
  Type,
  StickyNote,
  Square,
  ChevronUp,
  ChevronDown,
  X,
  Pencil,
  Highlighter,
  Eraser,
  Menu,
  Sparkles,
  PencilRuler,
} from 'lucide-react';

interface LarkFloatingToolbarProps {
  activeTool: ActiveTool;
  penColor: string;
  penSize: number;
  penOpacity: number;
  eraserSize: number;
  onActiveToolChange: (tool: ActiveTool) => void;
  onPenColorChange: (color: string) => void;
  onPenSizeChange: (size: number) => void;
  onPenOpacityChange: (opacity: number) => void;
  onEraserSizeChange: (size: number) => void;
}

export const LARK_HIGHLIGHT_COLORS = [
  { name: 'Đen', hex: '#171717' },
  { name: 'Xám đậm', hex: '#4b5563' },
  { name: 'Xám nhạt', hex: '#9ca3af' },
  { name: 'Tím', hex: '#a855f7' },
  { name: 'Xanh lam', hex: '#3b82f6' },
  { name: 'Xanh lá', hex: '#22c55e' },
  { name: 'Vàng', hex: '#eab308' },
  { name: 'Cam', hex: '#f97316' },
  { name: 'Đỏ', hex: '#ef4444' },
  { name: 'Hồng', hex: '#ec4899' },
];

export const LarkFloatingToolbar: React.FC<LarkFloatingToolbarProps> = ({
  activeTool,
  penColor,
  penSize,
  penOpacity,
  eraserSize,
  onActiveToolChange,
  onPenColorChange,
  onPenSizeChange,
  onPenOpacityChange,
  onEraserSizeChange,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showDrawToolbar, setShowDrawToolbar] = useState(false);
  const [showThicknessPopup, setShowThicknessPopup] = useState(false);
  const [showColorPopup, setShowColorPopup] = useState(false);

  const thicknessBtnRef = useRef<HTMLButtonElement>(null);
  const colorBtnRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const [thicknessCoords, setThicknessCoords] = useState<{ top: number; left: number } | null>(null);
  const [colorCoords, setColorCoords] = useState<{ top: number; left: number } | null>(null);

  const updateThicknessCoords = () => {
    if (thicknessBtnRef.current) {
      const rect = thicknessBtnRef.current.getBoundingClientRect();
      setThicknessCoords({
        top: rect.top - 8,
        left: rect.left + rect.width / 2,
      });
    }
  };

  const updateColorCoords = () => {
    if (colorBtnRef.current) {
      const rect = colorBtnRef.current.getBoundingClientRect();
      setColorCoords({
        top: rect.top - 8,
        left: rect.left + rect.width / 2,
      });
    }
  };

  useEffect(() => {
    if (showThicknessPopup) updateThicknessCoords();
  }, [showThicknessPopup]);

  useEffect(() => {
    if (showColorPopup) updateColorCoords();
  }, [showColorPopup]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popupRef.current &&
        !popupRef.current.contains(target) &&
        thicknessBtnRef.current &&
        !thicknessBtnRef.current.contains(target) &&
        colorBtnRef.current &&
        !colorBtnRef.current.contains(target)
      ) {
        setShowThicknessPopup(false);
        setShowColorPopup(false);
      }
    };

    const handleScrollOrResize = () => {
      if (showThicknessPopup) updateThicknessCoords();
      if (showColorPopup) updateColorCoords();
    };

    if (showThicknessPopup || showColorPopup) {
      document.addEventListener('mousedown', handleOutsideClick);
      window.addEventListener('resize', handleScrollOrResize);
      window.addEventListener('scroll', handleScrollOrResize, true);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [showThicknessPopup, showColorPopup]);

  // Sync showDrawToolbar and tool properties whenever activeTool changes
  useEffect(() => {
    if (activeTool === 'pen' || activeTool === 'smart_pen') {
      setShowDrawToolbar(true);
      onPenOpacityChange(1);
    } else if (activeTool === 'highlighter' || activeTool === 'smart_highlighter') {
      setShowDrawToolbar(true);
      onPenOpacityChange(0.45);
    } else if (activeTool === 'eraser') {
      setShowDrawToolbar(true);
    } else {
      setShowDrawToolbar(false);
      setShowThicknessPopup(false);
      setShowColorPopup(false);
    }
  }, [activeTool]);

  const toggleDrawToolbar = () => {
    const isDrawingTool = ['pen', 'highlighter', 'smart_pen', 'smart_highlighter', 'eraser'].includes(activeTool);
    if (!showDrawToolbar) {
      setShowDrawToolbar(true);
      if (!isDrawingTool) {
        onActiveToolChange('pen');
        onPenOpacityChange(1);
      }
    } else {
      setShowDrawToolbar(false);
      setShowThicknessPopup(false);
      setShowColorPopup(false);
      if (isDrawingTool) {
        onActiveToolChange('select');
      }
    }
  };

  return (
    <aside aria-label="Thanh công cụ Lark" className="relative z-40 select-none pointer-events-auto font-['Inter',sans-serif] flex flex-col items-center gap-3 max-w-[98vw]">
      {/* Sub-toolbar for Drawing */}
      {showDrawToolbar && (
        <div className="absolute bottom-full mb-2.5 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-md rounded-full shadow-2xl border border-neutral-200/90 px-3 py-1.5 flex items-center gap-1.5 transition-all animate-in fade-in slide-in-from-bottom-2 z-50 whitespace-nowrap max-w-[95vw] overflow-x-auto no-scrollbar">
          
          {/* 1. Bút vẽ tự do (Pencil) - Nút nhanh P */}
          <button
            onClick={() => {
              onActiveToolChange('pen');
              onPenOpacityChange(1);
            }}
            className={`p-2 rounded-full transition-all flex items-center justify-center ${
              activeTool === 'pen' ? 'bg-neutral-100 shadow-xs' : 'text-neutral-500 hover:bg-neutral-100'
            }`}
            style={{
              color: activeTool === 'pen' ? penColor : undefined,
            }}
            onMouseEnter={(e) => {
              if (activeTool !== 'pen') e.currentTarget.style.color = penColor;
            }}
            onMouseLeave={(e) => {
              if (activeTool !== 'pen') e.currentTarget.style.color = '';
            }}
            title="Bút vẽ tự do (Phím P)"
          >
            <Pencil size={18} />
          </button>

          {/* 2. Highlight tự do (Highlighter) - Nút nhanh H */}
          <button
            onClick={() => {
              onActiveToolChange('highlighter');
              onPenOpacityChange(0.45);
            }}
            className={`p-2 rounded-full transition-all flex items-center justify-center ${
              activeTool === 'highlighter' ? 'bg-neutral-100 shadow-xs' : 'text-neutral-500 hover:bg-neutral-100'
            }`}
            style={{
              color: activeTool === 'highlighter' ? (penColor === '#ffd700' || penColor === '#eab308' ? '#d97706' : penColor) : undefined,
            }}
            onMouseEnter={(e) => {
              if (activeTool !== 'highlighter') {
                e.currentTarget.style.color = penColor === '#ffd700' || penColor === '#eab308' ? '#d97706' : penColor;
              }
            }}
            onMouseLeave={(e) => {
              if (activeTool !== 'highlighter') e.currentTarget.style.color = '';
            }}
            title="Highlight tự do (Phím H)"
          >
            <Highlighter size={18} />
          </button>

          {/* 3. Bút vẽ thông minh - Smart Draw (Nắn nét thành thẳng, tròn, tam giác, vuông) - Nút nhanh 2x P */}
          <button
            onClick={() => {
              onActiveToolChange('smart_pen');
              onPenOpacityChange(1);
            }}
            className={`p-2 rounded-full transition-all flex items-center justify-center relative ${
              activeTool === 'smart_pen' ? 'bg-neutral-100 shadow-xs' : 'text-neutral-500 hover:bg-neutral-100'
            }`}
            style={{
              color: activeTool === 'smart_pen' ? penColor : undefined,
            }}
            onMouseEnter={(e) => {
              if (activeTool !== 'smart_pen') e.currentTarget.style.color = penColor;
            }}
            onMouseLeave={(e) => {
              if (activeTool !== 'smart_pen') e.currentTarget.style.color = '';
            }}
            title="Bút vẽ thông minh - Tự nhận diện nắn thẳng hình học (Đường thẳng, tròn, tam giác, vuông) [Nhấn 2 lần P]"
          >
            <div className="relative flex items-center justify-center">
              <PencilRuler size={18} />
              <Sparkles size={8} className="absolute -top-1 -right-1 text-amber-500" />
            </div>
          </button>

          {/* 4. Highlight thông minh - Smart Highlight (Tự động thẳng highlight) - Nút nhanh 2x H */}
          <button
            onClick={() => {
              onActiveToolChange('smart_highlighter');
              onPenOpacityChange(0.45);
            }}
            className={`p-2 rounded-full transition-all flex items-center justify-center relative ${
              activeTool === 'smart_highlighter' ? 'bg-neutral-100 shadow-xs' : 'text-neutral-500 hover:bg-neutral-100'
            }`}
            style={{
              color: activeTool === 'smart_highlighter' ? (penColor === '#ffd700' || penColor === '#eab308' ? '#d97706' : penColor) : undefined,
            }}
            onMouseEnter={(e) => {
              if (activeTool !== 'smart_highlighter') {
                e.currentTarget.style.color = penColor === '#ffd700' || penColor === '#eab308' ? '#d97706' : penColor;
              }
            }}
            onMouseLeave={(e) => {
              if (activeTool !== 'smart_highlighter') e.currentTarget.style.color = '';
            }}
            title="Highlight thông minh - Tự động nắn đường highlight thẳng hàng [Nhấn 2 lần H]"
          >
            <div className="relative flex items-center justify-center">
              <Highlighter size={18} />
              <Sparkles size={8} className="absolute -top-1 -right-1 text-amber-500" />
            </div>
          </button>

          {/* 5. Cục tẩy / Bút xóa (Eraser) */}
          <button
            onClick={() => onActiveToolChange('eraser')}
            className={`p-2 rounded-full transition-all flex items-center justify-center ${
              activeTool === 'eraser' ? 'bg-neutral-100 text-pink-500 shadow-xs' : 'text-neutral-500 hover:bg-neutral-50 hover:text-pink-400'
            }`}
            title="Cục tẩy / Bút xóa (Phím X)"
          >
            <Eraser size={18} className={activeTool === 'eraser' ? 'fill-pink-100' : ''} />
          </button>

          <div className="h-5 w-px bg-neutral-200 mx-0.5" />

          {/* Thickness Menu */}
          <button
            ref={thicknessBtnRef}
            onClick={() => {
              setShowThicknessPopup((prev) => !prev);
              setShowColorPopup(false);
            }}
            className={`p-1.5 rounded-md transition-all flex items-center gap-0.5 text-neutral-600 hover:bg-neutral-100 cursor-pointer ${
              showThicknessPopup ? 'bg-neutral-100' : ''
            }`}
            title="Độ dày"
          >
            <Menu size={16} />
            <ChevronDown size={12} className="opacity-50" />
          </button>

          {/* Color Menu */}
          <button
            ref={colorBtnRef}
            onClick={() => {
              setShowColorPopup((prev) => !prev);
              setShowThicknessPopup(false);
            }}
            disabled={activeTool === 'eraser'}
            className={`p-1.5 rounded-md transition-all flex items-center gap-0.5 text-neutral-600 hover:bg-neutral-100 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer ${
              showColorPopup ? 'bg-neutral-100' : ''
            }`}
            title="Màu sắc"
          >
            <div className="w-4 h-4 rounded-full border border-neutral-300 shadow-2xs" style={{ backgroundColor: activeTool === 'eraser' ? '#cbd5e1' : penColor }} />
            <ChevronDown size={12} className="opacity-50" />
          </button>

          <div className="h-5 w-px bg-neutral-200 mx-0.5" />

          {/* Close */}
          <button
            onClick={toggleDrawToolbar}
            className="p-1.5 rounded-full transition-all text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 cursor-pointer"
            title="Đóng công cụ vẽ"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Thickness Popup */}
      {showThicknessPopup &&
        thicknessCoords &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popupRef}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              bottom: `${window.innerHeight - thicknessCoords.top}px`,
              left: `${thicknessCoords.left}px`,
              transform: 'translateX(-50%)',
            }}
            className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-neutral-200/90 p-3.5 w-52 text-neutral-800 z-[999999] animate-in fade-in zoom-in-95 select-none font-['Inter',sans-serif]"
          >
            <div className="flex items-center justify-between text-xs font-bold text-neutral-800 mb-2">
              <span>Độ dày nét vẽ</span>
              <span className="bg-neutral-100 text-neutral-900 px-2 py-0.5 rounded-md text-[11px]" style={{ fontFamily: '"Open Sans", sans-serif' }}>
                {activeTool === 'eraser' ? eraserSize : penSize}px
              </span>
            </div>
            <input
              type="range"
              min={2}
              max={48}
              step={2}
              value={activeTool === 'eraser' ? eraserSize : penSize}
              onChange={(e) => {
                if (activeTool === 'eraser') onEraserSizeChange(Number(e.target.value));
                else onPenSizeChange(Number(e.target.value));
              }}
              className="w-full h-1.5 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-[#f5c41a]"
            />
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-neutral-100 text-[11px] font-medium text-neutral-400">
              <span>2px (Mảnh)</span>
              <span>48px (Dày)</span>
            </div>
          </div>,
          document.body
        )}

      {/* Color Popup */}
      {showColorPopup &&
        colorCoords &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popupRef}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              bottom: `${window.innerHeight - colorCoords.top}px`,
              left: `${colorCoords.left}px`,
              transform: 'translateX(-50%)',
            }}
            className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-neutral-200/90 p-3.5 w-56 text-neutral-800 z-[999999] animate-in fade-in zoom-in-95 select-none font-['Inter',sans-serif]"
          >
            <div className="text-xs font-bold text-neutral-800 mb-2.5">
              Chọn màu nét vẽ & highlight
            </div>
            <div className="grid grid-cols-5 gap-2">
              {LARK_HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => {
                    onPenColorChange(c.hex);
                  }}
                  className={`w-7 h-7 rounded-full transition-all flex items-center justify-center cursor-pointer ${
                    penColor === c.hex
                      ? 'ring-2 ring-neutral-900 ring-offset-2 scale-110 shadow-xs'
                      : 'hover:scale-110 border border-neutral-300'
                  }`}
                  style={{ backgroundColor: c.hex }}
                  title={c.name}
                />
              ))}
            </div>
          </div>,
          document.body
        )}

      {/* Main Floating Dock Bar */}
      <div id="bottom-toolbar-dock" className="bg-white/95 backdrop-blur-md rounded-full shadow-2xl border border-neutral-200/90 px-3 py-1 flex items-center gap-1.5 h-[48px] box-border transition-all max-w-[95vw] overflow-x-auto no-scrollbar">
        {/* Collapse toggle button */}
        <button
          onClick={() => setIsCollapsed((prev) => !prev)}
          className="p-1.5 text-neutral-400 hover:text-neutral-700 rounded-full hover:bg-neutral-100 transition-colors"
          title={isCollapsed ? 'Mở rộng thanh công cụ' : 'Thu gọn thanh công cụ'}
        >
          {isCollapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {!isCollapsed && (
          <>
            {/* 1. Select / Pointer */}
            <button
              onClick={() => onActiveToolChange('select')}
              className={`p-2 rounded-full transition-all flex items-center gap-1 text-xs font-semibold ${
                activeTool === 'select'
                  ? 'bg-neutral-900 text-white shadow-xs'
                  : 'text-neutral-700 hover:bg-neutral-100'
              }`}
              title="Con trỏ chuột chọn văn bản"
            >
              <MousePointer size={15} />
            </button>

            {/* 2. Drawing Group Icon */}
            <div className="flex items-center">
              <button
                onClick={toggleDrawToolbar}
                className={`p-2 rounded-full transition-all flex items-center gap-1.5 text-xs font-semibold ${
                  ['pen', 'highlighter', 'smart_pen', 'smart_highlighter', 'eraser'].includes(activeTool) || showDrawToolbar
                    ? 'bg-[#f5c41a]/15 text-neutral-950 shadow-xs ring-1 ring-[#f5c41a]/40 font-bold'
                    : 'text-neutral-700 hover:bg-neutral-100'
                }`}
                title="Bộ công cụ vẽ & đánh dấu (Vẽ tự do, Highlight, Vẽ thông minh, Highlight thẳng, Cục tẩy)"
              >
                {activeTool === 'smart_pen' ? (
                  <PencilRuler size={15} className="text-indigo-600" />
                ) : activeTool === 'smart_highlighter' || activeTool === 'highlighter' ? (
                  <Highlighter size={15} className="text-amber-500" />
                ) : (
                  <Pencil size={15} />
                )}
                <span
                  className="w-2.5 h-2.5 rounded-full border border-black/10"
                  style={{
                    backgroundColor: ['pen', 'highlighter', 'smart_pen', 'smart_highlighter'].includes(activeTool)
                      ? penColor
                      : 'transparent',
                  }}
                />
              </button>
            </div>

            <div className="h-4 w-px bg-neutral-200 mx-0.5" />

            {/* 3. Text Tool */}
            <button
              onClick={() => onActiveToolChange(activeTool === 'text' ? 'select' : 'text')}
              className={`px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer ${
                activeTool === 'text'
                  ? 'bg-neutral-900 text-white shadow-xs'
                  : 'text-neutral-700 hover:bg-neutral-100'
              }`}
              title="Chèn khung chữ (Phím T)"
            >
              <Type size={15} />
              <span className="hidden sm:inline">Text</span>
            </button>

            {/* 3.5. Sticky Note Tool - Bên phải Text */}
            <button
              onClick={() => onActiveToolChange(activeTool === 'sticky' ? 'select' : 'sticky')}
              className={`px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer ${
                activeTool === 'sticky'
                  ? 'bg-[#f5c41a] text-neutral-950 shadow-xs font-bold'
                  : 'text-neutral-700 hover:bg-neutral-100'
              }`}
              title="Ghi chú dán nhỏ (Phím N)"
            >
              <StickyNote size={15} className={activeTool === 'sticky' ? 'text-neutral-950 fill-neutral-950/20' : 'text-[#f5c41a] fill-[#f5c41a]'} />
              <span className="hidden sm:inline">Note</span>
            </button>

            {/* 4. Box Framing Tool */}
            <button
              onClick={() => onActiveToolChange(activeTool === 'box' ? 'select' : 'box')}
              className={`p-2 rounded-full transition-all flex items-center gap-1 text-xs font-semibold cursor-pointer ${
                activeTool === 'box'
                  ? 'bg-neutral-900 text-white shadow-xs'
                  : 'text-neutral-700 hover:bg-neutral-100'
              }`}
              title="Khung ô vuông khoanh vùng (Phím D)"
            >
              <Square size={15} />
            </button>
          </>
        )}
      </div>
    </aside>
  );
};

