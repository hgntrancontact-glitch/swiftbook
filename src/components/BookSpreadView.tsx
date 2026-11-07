import React from 'react';
import {
  HighlightAnnotation,
  TextNoteAnnotation,
  DrawingStroke,
  BoxAnnotation,
  BoxConfig,
  FreeTextAnnotation,
  ActiveTool,
  NormalizedRect,
  HighlightColor,
} from '../types';
import { PDFPageView } from './PDFPageView';
import { SPREAD_GAP } from '../utils/pdfViewport';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface BookSpreadViewProps {
  fileId: string;
  pdfDoc: any;
  visualViewportScale?: number;
  currentPage: number;
  totalPages: number;
  scale: number;
  activeTool: ActiveTool;
  penColor: string;
  penSize: number;
  penOpacity?: number;
  eraserSize?: number;
  highlightColorHex?: string;
  highlightColor?: HighlightColor;
  boxColor?: string;
  boxConfig?: BoxConfig;
  onUpdateBoxConfig?: (updates: Partial<BoxConfig>) => void;
  highlights: HighlightAnnotation[];
  textNotes: TextNoteAnnotation[];
  drawings: DrawingStroke[];
  boxes: BoxAnnotation[];
  freeTexts: FreeTextAnnotation[];
  selectedIds?: string[];
  onSelect?: (id: string, isShift: boolean) => void;
  onPageChange: (page: number) => void;
  onTextSelected: (
    pageNumber: number,
    text: string,
    rects: NormalizedRect[],
    clientPos: { x: number; y: number }
  ) => void;
  onAddHighlight?: (highlight: HighlightAnnotation) => void;
  onAddNote: (note: Omit<TextNoteAnnotation, 'id' | 'createdAt'>) => void;
  onUpdateNote: (id: string, updates: Partial<TextNoteAnnotation>, skipHistory?: boolean) => void;
  onDeleteNote: (id: string) => void;
  onAddBox: (box: Omit<BoxAnnotation, 'id' | 'createdAt'>) => void;
  onUpdateBox: (id: string, updates: Partial<BoxAnnotation>, skipHistory?: boolean) => void;
  onDeleteBox: (id: string) => void;
  onAddFreeText: (text: Omit<FreeTextAnnotation, 'id' | 'createdAt'>) => void;
  onUpdateFreeText: (id: string, updates: Partial<FreeTextAnnotation>, skipHistory?: boolean) => void;
  onDeleteFreeText: (id: string) => void;
  onDeleteHighlight: (id: string) => void;
  onUpdateHighlight?: (id: string, updates: Partial<HighlightAnnotation>, skipHistory?: boolean) => void;
  onUpdateHighlightNote?: (id: string, note: string) => void;
  onUpdateHighlightColor?: (id: string, color: any) => void;
  onAddStroke: (stroke: Omit<DrawingStroke, 'id' | 'createdAt'>) => void;
  onUpdateStroke?: (strokeId: string, updates: Partial<DrawingStroke>, skipHistory?: boolean) => void;
  onDeleteStroke: (strokeId: string) => void;
  onActiveToolChange?: (tool: ActiveTool) => void;
}

const BookSpreadViewComponent: React.FC<BookSpreadViewProps> = ({
  fileId,
  pdfDoc,
  visualViewportScale = 1,
  currentPage,
  totalPages,
  scale,
  activeTool,
  penColor,
  penSize,
  penOpacity,
  eraserSize,
  highlightColorHex,
  highlightColor,
  boxColor,
  boxConfig,
  onUpdateBoxConfig,
  highlights,
  textNotes,
  drawings,
  boxes,
  freeTexts,
  selectedIds,
  onSelect,
  onPageChange,
  onTextSelected,
  onAddHighlight,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onAddBox,
  onUpdateBox,
  onDeleteBox,
  onAddFreeText,
  onUpdateFreeText,
  onDeleteFreeText,
  onDeleteHighlight,
  onUpdateHighlight,
  onUpdateHighlightNote,
  onUpdateHighlightColor,
  onAddStroke,
  onUpdateStroke,
  onDeleteStroke,
  onActiveToolChange,
}) => {
  // Always pair Page 1 & Page 2 together on spread 1, Page 3 & Page 4 together on spread 2, etc.
  const leftPageNum = currentPage % 2 === 1 ? currentPage : currentPage - 1;
  const rightPageNum = leftPageNum + 1 <= totalPages ? leftPageNum + 1 : null;

  // Active interacting page tracking to ensure open sticky notes, text blocks, and boxes never get hidden under sibling page
  const [activeSpreadPage, setActiveSpreadPage] = React.useState<number | null>(null);
  const [activeGesturingPage, setActiveGesturingPage] = React.useState<number | null>(null);

  React.useEffect(() => {
    const handleElevate = (e: any) => {
      const pNum = e.detail?.pageNumber;
      if (pNum) {
        setActiveGesturingPage(pNum);
        setActiveSpreadPage(pNum);
      }
    };
    const handleReset = (e: any) => {
      setActiveGesturingPage(null);
      const pNum = e.detail?.pageNumber;
      if (pNum) {
        setActiveSpreadPage(pNum);
      }
    };
    const handleActivated = (e: any) => {
      const pNum = e.detail?.pageNumber;
      if (pNum) {
        setActiveSpreadPage(pNum);
      }
    };

    window.addEventListener('page-elevate', handleElevate);
    window.addEventListener('page-reset', handleReset);
    window.addEventListener('page-activated', handleActivated);

    return () => {
      window.removeEventListener('page-elevate', handleElevate);
      window.removeEventListener('page-reset', handleReset);
      window.removeEventListener('page-activated', handleActivated);
    };
  }, []);

  const isLeftNoteOpen = textNotes.some(
    (n) => n.pageNumber === leftPageNum && !n.isMinimized
  );
  const isRightNoteOpen = rightPageNum
    ? textNotes.some((n) => n.pageNumber === rightPageNum && !n.isMinimized)
    : false;

  const isLeftHasSelected = Boolean(
    selectedIds && selectedIds.length > 0 && (
      freeTexts.some((t) => t.pageNumber === leftPageNum && selectedIds.includes(t.id)) ||
      textNotes.some((n) => n.pageNumber === leftPageNum && selectedIds.includes(n.id)) ||
      boxes.some((b) => b.pageNumber === leftPageNum && selectedIds.includes(b.id))
    )
  );
  const isRightHasSelected = Boolean(
    rightPageNum && selectedIds && selectedIds.length > 0 && (
      freeTexts.some((t) => t.pageNumber === rightPageNum && selectedIds.includes(t.id)) ||
      textNotes.some((n) => n.pageNumber === rightPageNum && selectedIds.includes(n.id)) ||
      boxes.some((b) => b.pageNumber === rightPageNum && selectedIds.includes(b.id))
    )
  );

  let leftZIndex = 20;
  let rightZIndex = 20;

  // Priority 1: Active dragging, resizing or gesturing takes absolute top priority (9999)
  if (activeGesturingPage === leftPageNum) {
    leftZIndex = 9999;
    rightZIndex = 10;
  } else if (activeGesturingPage === rightPageNum) {
    rightZIndex = 9999;
    leftZIndex = 10;
  }
  // Priority 2: Page containing selected annotation (500)
  else if (isLeftHasSelected && !isRightHasSelected) {
    leftZIndex = 500;
    rightZIndex = 20;
  } else if (isRightHasSelected && !isLeftHasSelected) {
    rightZIndex = 500;
    leftZIndex = 20;
  }
  // Priority 3: Page with open expanded note (200) - Never get covered by passive hover on sibling page!
  else if (isLeftNoteOpen && !isRightNoteOpen) {
    leftZIndex = 200;
    rightZIndex = 20;
  } else if (isRightNoteOpen && !isLeftNoteOpen) {
    rightZIndex = 200;
    leftZIndex = 20;
  } else if (isLeftNoteOpen && isRightNoteOpen) {
    if (activeSpreadPage === rightPageNum) {
      leftZIndex = 150;
      rightZIndex = 200;
    } else {
      leftZIndex = 200;
      rightZIndex = 150;
    }
  }
  // Default: Both pages rest stably at equal z-index (20) without flipping on hover or draw

  return (
    <div className="relative flex items-center justify-center p-0 select-none-container my-auto mx-auto">
      {/* Previous Page Navigation Button */}
      <button
        onClick={() => onPageChange(Math.max(1, leftPageNum - 2))}
        disabled={leftPageNum <= 1}
        className="absolute left-2 lg:left-6 top-1/2 -translate-y-1/2 z-[60000] pointer-events-auto w-10 h-10 rounded-full bg-white/90 border border-neutral-300 shadow-lg text-neutral-800 hover:bg-neutral-900 hover:text-white disabled:opacity-20 disabled:pointer-events-none transition-all flex items-center justify-center cursor-pointer"
        style={{ zIndex: 60000 }}
        title="Lật sang 2 trang trước"
      >
        <ChevronLeft size={20} />
      </button>

      {/* Book Container without rounded corners */}
      <div className="relative flex items-stretch justify-center rounded-none w-max overflow-visible bg-transparent">
        {/* Left Page */}
        <div
          className="relative overflow-visible shrink-0 rounded-none"
          style={{ zIndex: leftZIndex }}
          onPointerDownCapture={() => {
            if (!activeGesturingPage) setActiveSpreadPage(leftPageNum);
          }}
          onMouseDownCapture={() => {
            if (!activeGesturingPage) setActiveSpreadPage(leftPageNum);
          }}
          onMouseEnter={() => {
            if (!activeGesturingPage) {
              setActiveSpreadPage(leftPageNum);
            }
          }}
        >
          <PDFPageView
            fileId={fileId}
            visualViewportScale={visualViewportScale}
            key={`pdf-page-${leftPageNum}`}
            pdfDoc={pdfDoc}
            pageNumber={leftPageNum}
            scale={scale}
            activeTool={activeTool}
            penColor={penColor}
            penSize={penSize}
            penOpacity={penOpacity}
            eraserSize={eraserSize}
            highlightColorHex={highlightColorHex}
            highlightColor={highlightColor}
            boxColor={boxColor}
            boxConfig={boxConfig}
            onUpdateBoxConfig={onUpdateBoxConfig}
            highlights={highlights}
            textNotes={textNotes}
            drawings={drawings}
            boxes={boxes}
            freeTexts={freeTexts}
            selectedIds={selectedIds}
            onSelect={onSelect}
            onTextSelected={onTextSelected}
            onAddHighlight={onAddHighlight}
            onAddNote={onAddNote}
            onUpdateNote={onUpdateNote}
            onDeleteNote={onDeleteNote}
            onAddBox={onAddBox}
            onUpdateBox={onUpdateBox}
            onDeleteBox={onDeleteBox}
            onAddFreeText={onAddFreeText}
            onUpdateFreeText={onUpdateFreeText}
            onDeleteFreeText={onDeleteFreeText}
            onDeleteHighlight={onDeleteHighlight}
            onUpdateHighlight={onUpdateHighlight}
            onUpdateHighlightNote={onUpdateHighlightNote}
            onUpdateHighlightColor={onUpdateHighlightColor}
            onAddStroke={onAddStroke}
            onUpdateStroke={onUpdateStroke}
            onDeleteStroke={onDeleteStroke}
            onActiveToolChange={onActiveToolChange}
            isBookMode={true}
            bookPageSide="left"
            
          />
        </div>

        {/* Center Spine Crease / Divider */}
        {rightPageNum && (
          <div data-spread-gap="true" style={{ width: SPREAD_GAP }} className="bg-[#fafafa] relative z-20 self-stretch shrink-0 pointer-events-none" />
        )}

        {/* Right Page */}
        {rightPageNum ? (
          <div
            className="relative overflow-visible shrink-0 rounded-none"
            style={{ zIndex: rightZIndex }}
            onPointerDownCapture={() => {
              if (!activeGesturingPage) setActiveSpreadPage(rightPageNum);
            }}
            onMouseDownCapture={() => {
              if (!activeGesturingPage) setActiveSpreadPage(rightPageNum);
            }}
            onMouseEnter={() => {
              if (!activeGesturingPage) {
                setActiveSpreadPage(rightPageNum);
              }
            }}
          >
            <PDFPageView
              fileId={fileId}
              visualViewportScale={visualViewportScale}
              key={`pdf-page-${rightPageNum}`}
              pdfDoc={pdfDoc}
              pageNumber={rightPageNum}
              scale={scale}
              activeTool={activeTool}
              penColor={penColor}
              penSize={penSize}
              penOpacity={penOpacity}
              eraserSize={eraserSize}
              highlightColorHex={highlightColorHex}
              highlightColor={highlightColor}
              boxColor={boxColor}
              boxConfig={boxConfig}
              onUpdateBoxConfig={onUpdateBoxConfig}
              highlights={highlights}
              textNotes={textNotes}
              drawings={drawings}
              boxes={boxes}
              freeTexts={freeTexts}
              selectedIds={selectedIds}
              onSelect={onSelect}
              onTextSelected={onTextSelected}
              onAddHighlight={onAddHighlight}
              onAddNote={onAddNote}
              onUpdateNote={onUpdateNote}
              onDeleteNote={onDeleteNote}
              onAddBox={onAddBox}
              onUpdateBox={onUpdateBox}
              onDeleteBox={onDeleteBox}
              onAddFreeText={onAddFreeText}
              onUpdateFreeText={onUpdateFreeText}
              onDeleteFreeText={onDeleteFreeText}
              onDeleteHighlight={onDeleteHighlight}
              onUpdateHighlight={onUpdateHighlight}
              onUpdateHighlightNote={onUpdateHighlightNote}
              onUpdateHighlightColor={onUpdateHighlightColor}
              onAddStroke={onAddStroke}
              onUpdateStroke={onUpdateStroke}
              onDeleteStroke={onDeleteStroke}
              onActiveToolChange={onActiveToolChange}
              isBookMode={true}
              bookPageSide="right"
              
            />
          </div>
        ) : null}
      </div>

      {/* Next Page Navigation Button */}
      <button
        onClick={() => onPageChange(Math.min(totalPages, leftPageNum + 2))}
        disabled={rightPageNum === null || leftPageNum + 1 >= totalPages}
        className="absolute right-2 lg:right-6 top-1/2 -translate-y-1/2 z-[60000] pointer-events-auto w-10 h-10 rounded-full bg-white/90 border border-neutral-300 shadow-lg text-neutral-800 hover:bg-neutral-900 hover:text-white disabled:opacity-20 disabled:pointer-events-none transition-all flex items-center justify-center cursor-pointer"
        style={{ zIndex: 60000 }}
        title="Lật sang 2 trang sau"
      >
        <ChevronRight size={20} />
      </button>
    </div>
  );
};

export const BookSpreadView = React.memo(BookSpreadViewComponent);
