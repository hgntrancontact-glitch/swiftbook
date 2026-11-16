import {useQuickShapes} from '../contexts/QuickShapesContext';
import {QuickShapesPanel,QuickShapesToggle} from './QuickShapesToolbar';
import React, { useState, useEffect } from 'react';
import { ActiveTool } from '../types';
import {
  MousePointer,
  Type,
  StickyNote,
  Square,
  ChevronUp,
  ChevronDown,
  Pencil,
  Highlighter,
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

export {DRAWING_COLORS as LARK_HIGHLIGHT_COLORS} from './QuickShapesToolbar';

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
  const shared=useQuickShapes();
  const drawingActive=['pen','highlighter','smart_pen','smart_highlighter'].includes(activeTool);
  const drawChosen=drawingActive || (activeTool==='eraser' && shared?.group==='draw');
  useEffect(()=>{
    if(activeTool==='pen' || activeTool==='smart_pen')onPenOpacityChange(1);
    else if(activeTool==='highlighter' || activeTool==='smart_highlighter')onPenOpacityChange(.45);
  },[activeTool]);
  const toggleDrawToolbar=()=>{
    if(shared?.open && shared.group==='draw' && drawChosen){shared.setOpen(false);onActiveToolChange('select');}
    else {shared?.setGroup('draw');shared?.setOpen(true);shared?.setSelection(null);onActiveToolChange(shared?.lastDrawTool || 'pen');}
  };
  return (
    <aside aria-label="Thanh công cụ Lark" className="relative z-40 select-none pointer-events-auto noto-ui flex flex-col items-center gap-3 max-w-[98vw]">
      <QuickShapesPanel activeTool={activeTool} onActiveToolChange={onActiveToolChange}/>
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

            <QuickShapesToggle activeTool={activeTool} onActiveToolChange={onActiveToolChange}/>
            {/* 2. Drawing Group Icon */}
            <div className="flex items-center">
              <button
                aria-label="Bút vẽ và Highlight"
                onClick={toggleDrawToolbar}
                className={`p-2 rounded-full transition-all flex items-center gap-1.5 text-xs font-semibold ${
                  drawChosen
                    ? 'bg-neutral-900 text-white shadow-xs'
                    : 'text-neutral-700 hover:bg-neutral-100'
                }`}
                title="Bộ công cụ vẽ & đánh dấu (Vẽ tự do, Highlight, Vẽ thông minh, Highlight thẳng, Cục tẩy)"
              >
                {activeTool === 'smart_pen' ? (
                  <PencilRuler size={15} />
                ) : activeTool === 'smart_highlighter' || activeTool === 'highlighter' ? (
                  <Highlighter size={15} />
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

