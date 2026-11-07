export type HighlightColor = 'yellow' | 'green' | 'pink' | 'red' | 'gray';

export interface NormalizedRect {
  x: number; // percentage (0 to 100) or normalized relative to viewport
  y: number;
  width: number;
  height: number;
}

export interface HighlightAnnotation {
  id: string;
  pageNumber: number;
  text: string;
  color: HighlightColor;
  rects: NormalizedRect[];
  note?: string;
  createdAt: number;
}

export interface TextNoteAnnotation {
  /** Page scale when pixel-sized properties were created; absent legacy values use page units. */
  referenceScale?: number;
  id: string;
  pageNumber: number;
  x: number; // percentage (0-100)
  y: number; // percentage (0-100)
  text: string;
  color: string; // e.g. '#fef08a', '#bbf7d0', '#fbcfe8', '#bfdbfe', '#ffffff'
  width?: number; // width in px or %
  height?: number;
  isMinimized?: boolean;
  createdAt: number;
}

export interface BoxAnnotation {
  /** Page scale when pixel-sized properties were created; absent legacy values use page units. */
  referenceScale?: number;
  id: string;
  pageNumber: number;
  x: number; // percentage (0-100)
  y: number; // percentage (0-100)
  width: number; // percentage (0-100)
  height: number; // percentage (0-100)
  color: string; // hex or name
  borderWidth: number; // 2, 3, 4, 6
  borderStyle?: 'solid' | 'dashed' | 'dotted';
  fillColor?: string; // rgba or 'transparent'
  label?: string;
  createdAt: number;
}

export interface BoxConfig {
  color: string;
  borderWidth: number;
  borderStyle: 'solid' | 'dashed';
  hasBackground: boolean;
}

export const DEFAULT_BOX_CONFIG: BoxConfig = {
  color: '#ef4444',
  borderWidth: 2,
  borderStyle: 'solid',
  hasBackground: true,
};

export type FreeTextShape = string;

export interface FreeTextAnnotation {
  id: string;
  pageNumber: number;
  x: number; // percentage (0-100)
  y: number; // percentage (0-100)
  text: string;
  fontSize: number; // 10, 12, 14, 16, 18, 20, 24, 28, 32, 36
  color: string; // text color hex
  opacity?: number; // 0 to 1
  bgColor?: string; // fill color hex or 'transparent'
  bgOpacity?: number; // 0 to 1
  isBold?: boolean;
  isItalic?: boolean;
  isUnderline?: boolean;
  isStrikethrough?: boolean;
  hasShadow?: boolean;
  textAlign?: 'left' | 'center' | 'right';
  shape?: FreeTextShape;
  hyperlink?: string;
  isLocked?: boolean;
  width?: number; // optional min-width
  height?: number;
  rotation?: number; // angle in degrees (0 to 360)
  createdAt: number;
}

export interface DrawingPoint {
  x: number; // normalized (0-100)
  y: number; // normalized (0-100)
}

export interface DrawingStroke {
  /** Page scale when pixel-sized properties were created; absent legacy values use page units. */
  referenceScale?: number;
  id: string;
  pageNumber: number;
  points: DrawingPoint[];
  color: string;
  size: number;
  opacity: number;
  isHighlighter?: boolean;
  isSmartShape?: boolean;
  shapeType?: string;
  fillColor?: string;
  createdAt: number;
}

export interface CustomTOCItem {
  id: string;
  title: string;
  pageNumber: number;
  level: 1 | 2 | 3;
  parentId?: string | null;
  createdAt: number;
  isExpanded?: boolean;
}

export interface AutoTOCItem {
  title: string;
  pageNumber: number;
  items?: AutoTOCItem[];
}

export type ViewMode = 'single' | 'double' | 'continuous';

export type ActiveTool =
  | 'select'
  | 'highlighter'
  | 'pen'
  | 'smart_pen'
  | 'smart_highlighter'
  | 'eraser'
  | 'box'
  | 'text'
  | 'sticky';

export interface PDFDocumentState {
  fileId: string;
  fileName: string;
  customBookTitle?: string;
  bookConfig?: {
    orientation: 'portrait' | 'landscape';
    bgColor: string;
  };
  fileSize: number;
  totalPages: number;
  currentPage: number;
  viewMode: ViewMode;
  zoom: number;
  highlights: HighlightAnnotation[];
  textNotes: TextNoteAnnotation[];
  drawings: DrawingStroke[];
  boxes: BoxAnnotation[];
  freeTexts: FreeTextAnnotation[];
  customTOC: CustomTOCItem[];
  lastReadAt: number;
}

export interface HistorySnapshot {
  highlights: HighlightAnnotation[];
  drawings: DrawingStroke[];
  boxes: BoxAnnotation[];
  freeTexts: FreeTextAnnotation[];
  textNotes: TextNoteAnnotation[];
}

export interface WorkspaceDoc {
  id: string; // unique workspace tab ID
  fileId: string;
  fileName: string;
  fileSize: number;
  pdfDoc: any; // pdfjs document object
  pdfBytes: Uint8Array | null;
  basePageDimensions: { width: number; height: number } | null;
  bookConfig?: {
    orientation: 'portrait' | 'landscape';
    bgColor: string;
    paperPattern?: string;
  } | null;
  totalPages: number;
  currentPage: number;
  viewMode: ViewMode;
  scale: number;
  fitMode: boolean;
  viewportRevision?: number;
  zoomRevision?: number;
  highlights: HighlightAnnotation[];
  textNotes: TextNoteAnnotation[];
  drawings: DrawingStroke[];
  boxes: BoxAnnotation[];
  freeTexts: FreeTextAnnotation[];
  customTOC: CustomTOCItem[];
  autoTOC: AutoTOCItem[];
  selectedIds: string[];
  selectionState: {
    pageNumber: number;
    text: string;
    rects: NormalizedRect[];
    position: { x: number; y: number } | null;
  } | null;
  pastStates: HistorySnapshot[];
  futureStates: HistorySnapshot[];
  isHidden: boolean;
  lastReadAt: number;
}

export interface BookGroup {
  id: string;
  name: string;
  color?: string;
  createdAt: number;
}

export interface SavedBook {
  id: string;
  name: string;
  originalFileName: string;
  bookConfig?: {
    orientation: 'portrait' | 'landscape';
    bgColor: string;
  };
  totalPages: number;
  lastReadPage: number;
  savedAt: number;
  lastReadAt: number;
  groupId?: string;
  groupName?: string;
  fileSize?: number;
  deletedAt?: number; // timestamp when moved to trash, undefined if active
}

export const HIGHLIGHT_COLORS: Record<HighlightColor, { name: string; bg: string; border: string; text: string; hex: string; rgba: string }> = {
  yellow: {
    name: 'Vàng',
    bg: 'bg-[#ffff00]',
    border: 'border-yellow-400',
    text: 'text-yellow-950',
    hex: '#ffff00',
    rgba: 'rgba(255, 235, 59, 0.20)',
  },
  green: {
    name: 'Xanh lá',
    bg: 'bg-[#00ff66]',
    border: 'border-emerald-400',
    text: 'text-emerald-950',
    hex: '#00ff66',
    rgba: 'rgba(0, 230, 118, 0.18)',
  },
  pink: {
    name: 'Hồng',
    bg: 'bg-[#ff2d95]',
    border: 'border-pink-400',
    text: 'text-pink-950',
    hex: '#ff2d95',
    rgba: 'rgba(255, 64, 129, 0.18)',
  },
  red: {
    name: 'Đỏ',
    bg: 'bg-[#ff3344]',
    border: 'border-red-400',
    text: 'text-red-950',
    hex: '#ff3344',
    rgba: 'rgba(255, 82, 82, 0.16)',
  },
  gray: {
    name: 'Xám',
    bg: 'bg-[#9ca3af]',
    border: 'border-neutral-400',
    text: 'text-neutral-900',
    hex: '#9ca3af',
    rgba: 'rgba(156, 163, 175, 0.20)',
  },
};

export const BOX_COLORS = [
  { name: 'Đỏ', hex: '#ef4444', rgba: 'rgba(239, 68, 68, 0.12)' },
  { name: 'Vàng', hex: '#eab308', rgba: 'rgba(234, 179, 8, 0.15)' },
  { name: 'Xanh lá', hex: '#10b981', rgba: 'rgba(16, 185, 129, 0.12)' },
  { name: 'Xanh dương', hex: '#3b82f6', rgba: 'rgba(59, 130, 246, 0.12)' },
  { name: 'Hồng tím', hex: '#ec4899', rgba: 'rgba(236, 72, 153, 0.12)' },
  { name: 'Đen', hex: '#171717', rgba: 'rgba(23, 23, 23, 0.08)' },
];

export interface NoteColorTheme {
  name: string;
  id: string;
  noteBg: string;
  contentBg: string;
  headerBg: string;
}

export const NOTE_PAPER_COLORS: NoteColorTheme[] = [
  {
    name: 'Màu 1',
    id: 'color-1',
    headerBg: '#ffefae',
    contentBg: '#fff4c9',
    noteBg: '#ffefae',
  },
  {
    name: 'Màu 2',
    id: 'color-2',
    headerBg: '#d9f7b2',
    contentBg: '#e8ffcb',
    noteBg: '#d9f7b2',
  },
  {
    name: 'Màu 3',
    id: 'color-3',
    headerBg: '#fbd4ec',
    contentBg: '#ffe6f5',
    noteBg: '#fbd4ec',
  },
  {
    name: 'Màu 4',
    id: 'color-4',
    headerBg: '#bce6ff',
    contentBg: '#d4efff',
    noteBg: '#bce6ff',
  },
  {
    name: 'Màu 5',
    id: 'color-5',
    headerBg: '#f7f5f5',
    contentBg: '#fdfdfd',
    noteBg: '#f7f5f5',
  },
];

export const TEXT_COLORS = [
  { name: 'Đen', hex: '#171717' },
  { name: 'Đỏ', hex: '#dc2626' },
  { name: 'Xanh dương', hex: '#2563eb' },
  { name: 'Xanh lá', hex: '#16a34a' },
  { name: 'Cam', hex: '#ea580c' },
  { name: 'Tím', hex: '#9333ea' },
];

