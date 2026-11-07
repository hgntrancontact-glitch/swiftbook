import { AnnotationToolbar } from './AnnotationToolbar';
import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { FreeTextAnnotation } from '../types';
import { findBestMatchingPage, elevatePageZIndex, resetPageZIndex } from '../utils/pageBoundaryHelper';
import {
  MessageCircle,
  MoreHorizontal,
  ChevronDown,
  Unlock,
  Lock,
  Trash2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  RotateCw,
  Pencil,
  Unlink,
  ExternalLink,
  Link,
  Globe,
  Underline,
  X
} from 'lucide-react';

let globalJustDeactivated = false;

interface FreeTextLayerProps {
  fileId?: string;
  pageNumber: number;
  totalPages?: number;
  freeTexts: FreeTextAnnotation[];
  isTextToolActive: boolean;
  onAddText: (textData: Omit<FreeTextAnnotation, 'id' | 'createdAt'> & { id?: string }) => void;
  onUpdateText: (id: string, updates: Partial<FreeTextAnnotation>, skipHistory?: boolean) => void;
  onDeleteText: (id: string) => void;
  onDeactivateTextTool?: () => void;
  scale?: number;
  selectedIds?: string[];
  onSelect?: (id: string, isShift: boolean) => void;
}

const FONT_SIZES = [12, 14, 18, 24, 36, 48, 72, 96];

const TEXT_COLORS = [
  '#1D2129', '#86909C', '#FFFFFF', '#7B61FF', '#f5c41a', '#27C346', '#F7BA1E', '#F97316', '#F53F3F'
];

const BG_COLORS_LIGHT = [
  'transparent', '#FFFFFF', '#d9d9d9', '#d5c2fc', '#b5e4ff', '#bcf7b7', '#fcf8ae', '#fab388', '#ec7b7b', '#ffcfec'
];

const BG_COLORS_DARK = [
  '#000000', '#545454', '#a6a6a6', '#8c52ff', '#38b6ff', '#7dff72', '#f9ef23', '#ff751f', '#ff0000', '#ff66c4'
];

const SHAPES = [
  'text', 'note', 'rounded', 'oval', 'diamond',
  'rectangle', 'circle', 'cylinder', 'arrow-right-ribbon', 'arrow-left-ribbon',
  'parallelogram', 'trapezoid', 'speech-round', 'speech-square', 'triangle-right',
  'triangle', 'star', 'hexagon', 'pentagon', 'double-circle',
  'arrow-left', 'arrow-right', 'arrow-both', 'cloud', 'brace-left',
  'brace-right', 'cross', 'cube'
];

interface FloatingSubmenuProps {
  isToolbarAbove: boolean;
  align?: 'left' | 'center' | 'right';
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  onMouseDown?: (e: React.MouseEvent) => void;
  onClick?: (e: React.MouseEvent) => void;
}

const FloatingSubmenu: React.FC<FloatingSubmenuProps> = ({
  isToolbarAbove,
  align = 'center',
  className = '',
  style = {},
  children,
  onMouseDown,
  onClick,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{
    direction: 'up' | 'down';
    shiftX: number;
    shiftY: number;
    maxHeight?: number;
  }>({
    direction: isToolbarAbove ? 'up' : 'down',
    shiftX: 0,
    shiftY: 0,
  });

  const checkPosition = () => {
    const el = menuRef.current;
    if (!el) return;

    const parentEl = el.parentElement;
    if (!parentEl) return;

    const parentRect = parentEl.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;

    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const margin = 10;
    const gap = 8;

    // 1. VERTICAL DIRECTION & COLLISION DETECTION
    const headerEl = document.querySelector('header');
    const headerBottom = headerEl ? Math.max(0, headerEl.getBoundingClientRect().bottom) : 48;
    const bottomToolbarEl = document.getElementById('bottom-toolbar') || document.querySelector('.bottom-toolbar, [data-bottom-toolbar="true"]');
    const bottomToolbarRect = bottomToolbarEl ? bottomToolbarEl.getBoundingClientRect() : null;
    const bottomLimit = bottomToolbarRect && bottomToolbarRect.top > 0
      ? bottomToolbarRect.top
      : (viewportHeight - 70);

    const spaceAbove = parentRect.top - headerBottom - gap - margin;
    const spaceBelow = bottomLimit - parentRect.bottom - gap - margin;

    // Submenu follows isToolbarAbove, but if space in that direction is severely cramped (<130px) and the other side has more room, flip cleanly
    let targetDirection: 'up' | 'down' = isToolbarAbove ? 'up' : 'down';
    if (targetDirection === 'up' && spaceAbove < 130 && spaceBelow > spaceAbove) {
      targetDirection = 'down';
    } else if (targetDirection === 'down' && spaceBelow < 130 && spaceAbove > spaceBelow) {
      targetDirection = 'up';
    }

    const availableHeight = targetDirection === 'up'
      ? Math.max(100, spaceAbove)
      : Math.max(100, spaceBelow);

    // 2. HORIZONTAL ALIGNMENT & VIEWPORT BOUNDARY DETECTION
    const sidebarEl = document.querySelector('aside, .sidebar-container, [data-sidebar="true"]');
    const sidebarRect = sidebarEl ? sidebarEl.getBoundingClientRect() : null;
    const sidebarRight = sidebarRect && sidebarRect.right > 0 && sidebarRect.right < viewportWidth / 2
      ? sidebarRect.right
      : 0;

    const minLeft = Math.max(margin, sidebarRight + margin);
    const maxRight = viewportWidth - margin;

    let baseLeft = parentRect.left;
    if (align === 'center') {
      baseLeft = parentRect.left + (parentRect.width / 2) - (w / 2);
    } else if (align === 'right') {
      baseLeft = parentRect.right - w;
    }

    let targetLeft = baseLeft;
    if (targetLeft < minLeft) {
      targetLeft = minLeft;
    } else if (targetLeft + w > maxRight) {
      targetLeft = Math.max(minLeft, maxRight - w);
    }

    const shiftX = targetLeft - baseLeft;

    setPlacement({
      direction: targetDirection,
      shiftX,
      shiftY: 0,
      maxHeight: availableHeight,
    });
  };

  useLayoutEffect(() => {
    checkPosition();
    const raf = requestAnimationFrame(checkPosition);
    const timer = setTimeout(checkPosition, 40);

    window.addEventListener('resize', checkPosition);
    window.addEventListener('scroll', checkPosition, true);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      window.removeEventListener('resize', checkPosition);
      window.removeEventListener('scroll', checkPosition, true);
    };
  }, [isToolbarAbove, align]);

  const verticalClass = placement.direction === 'up'
    ? 'bottom-[calc(100%+8px)]'
    : 'top-[calc(100%+8px)]';

  let alignClass = 'left-1/2';
  if (align === 'left') alignClass = 'left-0';
  if (align === 'right') alignClass = 'right-0';

  const transformParts: string[] = [];
  if (align === 'center') {
    transformParts.push('translateX(-50%)');
  }
  if (placement.shiftX !== 0 || placement.shiftY !== 0) {
    transformParts.push(`translate(${placement.shiftX}px, ${placement.shiftY}px)`);
  }

  return (
    <div
      ref={menuRef}
      className={`absolute ${verticalClass} ${alignClass} z-[9500] pointer-events-auto select-none ${className}`}
      style={{
        ...style,
        transform: transformParts.length > 0 ? transformParts.join(' ') : undefined,
        maxHeight: placement.maxHeight ? `${placement.maxHeight}px` : undefined,
        overflowY: 'auto',
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={onMouseDown}
      onClick={onClick}
    >
      {children}
    </div>
  );
};

const ShapeRenderer = ({ shape, bgColor, borderColor }: { shape: string; bgColor: string; borderColor: string }) => {
  if (shape === 'none' || shape === 'text') {
    return bgColor && bgColor !== 'transparent' ? (
      <div
        className="absolute inset-0 pointer-events-none rounded-none"
        style={{ backgroundColor: bgColor, borderRadius: '0px' }}
      />
    ) : null;
  }
  
  const renderPath = () => {
    switch(shape) {
      case 'note': return <><path d="M4 4h16v11l-5 5H4z"/><path d="M15 15h5v5"/></>;
      case 'rectangle': return <rect x="2" y="2" width="20" height="20" rx="0" ry="0" />;
      case 'rounded': return <rect x="2" y="2" width="20" height="20" rx="4" ry="4" />;
      case 'oval': return <ellipse cx="12" cy="12" rx="10" ry="6" />;
      case 'diamond': return <path d="M12 2l10 10-10 10L2 12z" />;
      case 'circle': return <circle cx="12" cy="12" r="10" />;
      case 'cylinder': return <><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/></>;
      case 'arrow-right-ribbon': return <path d="M4 6h12l4 6-4 6H4l4-6-4-6z"/>;
      case 'arrow-left-ribbon': return <path d="M20 6H8L4 12l4 6h12l-4-6 4-6z"/>;
      case 'parallelogram': return <path d="M6 18l4-12h12l-4 12z" />;
      case 'trapezoid': return <path d="M6 6h12l4 12H2z" />;
      case 'speech-round': return <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>;
      case 'speech-square': return <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>;
      case 'triangle-right': return <path d="M4 20h16L4 4v16z"/>;
      case 'triangle': return <path d="M12 2L2 20h20z"/>;
      case 'star': return <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>;
      case 'hexagon': return <path d="M12 2l9 5v10l-9 5-9-5V7l9-5z"/>;
      case 'pentagon': return <path d="M12 2l10 7v13H2V9l10-7z"/>;
      case 'double-circle': return <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/></>;
      case 'arrow-left': return <path d="M10 18v-4h10v-4H10V6l-7 6 7 6z"/>;
      case 'arrow-right': return <path d="M14 18v-4H4v-4h10V6l7 6-7 6z"/>;
      case 'arrow-both': return <path d="M7 10h10V7l4 5-4 5v-3H7v3l-4-5 4-5v3z"/>;
      case 'cloud': return <path d="M17.5 19c2.5 0 4.5-2 4.5-4.5S20 10 17.5 10c-.5-3.5-3.5-6-7-6S4 6.5 3.5 10C1 10 0 12 0 14.5S2 19 4.5 19h13z"/>;
      case 'brace-left': return <><path d="M8 4v4c0 2-2 2-2 4s2 2 2 4v4"/><path d="M14 8h6M14 12h6M14 16h6"/></>;
      case 'brace-right': return <><path d="M16 4v4c0 2 2 2 2 4s-2 2-2 4v4"/><path d="M4 8h6M4 12h6M4 16h6"/></>;
      case 'cross': return <path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7V3z"/>;
      case 'cube': return <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05"/><path d="M12 22.08V12"/></>;
      default: return null;
    }
  };
  
  return (
    <svg 
      className="absolute inset-0 w-full h-full" 
      preserveAspectRatio="none" 
      viewBox="0 0 24 24" 
      style={{
        fill: bgColor !== 'transparent' ? bgColor : 'none',
        stroke: borderColor,
        strokeWidth: 1.5,
        vectorEffect: 'non-scaling-stroke'
      }}
    >
      {renderPath()}
    </svg>
  );
};

function getSelectionOffsets(root: HTMLElement, range: Range): { start: number; end: number } | null {
  try {
    const preRange = document.createRange();
    preRange.selectNodeContents(root);
    preRange.setEnd(range.startContainer, range.startOffset);
    const start = preRange.toString().length;
    preRange.setEnd(range.endContainer, range.endOffset);
    const end = preRange.toString().length;
    return { start, end };
  } catch (_) {
    return null;
  }
}

function restoreSelectionOffsets(root: HTMLElement, start: number, end: number): Range | null {
  const sel = window.getSelection();
  if (!sel) return null;
  let charIndex = 0;
  let startNode: Node | null = null;
  let startOffset = 0;
  let endNode: Node | null = null;
  let endOffset = 0;

  const nodeIterator = document.createNodeIterator(root, NodeFilter.SHOW_TEXT);
  let curNode: Node | null;
  while ((curNode = nodeIterator.nextNode())) {
    const len = curNode.textContent?.length || 0;
    if (!startNode && charIndex + len >= start) {
      startNode = curNode;
      startOffset = Math.max(0, start - charIndex);
    }
    if (!endNode && charIndex + len >= end) {
      endNode = curNode;
      endOffset = Math.max(0, end - charIndex);
      break;
    }
    charIndex += len;
  }

  if (startNode && endNode) {
    try {
      const range = document.createRange();
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
      sel.removeAllRanges();
      sel.addRange(range);
      return range;
    } catch (_) {}
  }
  return null;
}

function getSelectedFontSize(el: HTMLElement | null): number | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !el) return null;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.commonAncestorContainer)) return null;

  let node: Node | null = range.startContainer;
  if (node.nodeType === Node.TEXT_NODE) {
    node = node.parentElement;
  }
  while (node && node !== el) {
    if (node instanceof HTMLElement) {
      const dataSize = node.getAttribute('data-size');
      if (dataSize) {
        const val = parseInt(dataSize);
        if (!isNaN(val) && val > 0) return val;
      }
      const fs = node.style.fontSize;
      if (fs) {
        const val = parseInt(fs);
        if (!isNaN(val) && val > 0) return val;
      }
    }
    node = node.parentElement;
  }
  return null;
}

function getElementBaseFontSize(el: HTMLElement): number | null {
  const dataOrig = el.getAttribute('data-orig-size');
  if (dataOrig) {
    const v = parseFloat(dataOrig);
    if (!isNaN(v) && v > 0) return v;
  }
  const dataSize = el.getAttribute('data-size');
  if (dataSize) {
    const v = parseFloat(dataSize);
    if (!isNaN(v) && v > 0) return v;
  }
  if (el.style.fontSize) {
    const m = el.style.fontSize.match(/(\d+(?:\.\d+)?)\s*px/);
    if (m) {
      const v = parseFloat(m[1]);
      if (!isNaN(v) && v > 0) return v;
    }
    const direct = parseFloat(el.style.fontSize);
    if (!isNaN(direct) && direct > 0) return direct;
  }
  const fontAttr = el.getAttribute('size');
  if (fontAttr) {
    const fontSizes: Record<string, number> = {
      '1': 10, '2': 13, '3': 16, '4': 18, '5': 24, '6': 32, '7': 48
    };
    if (fontSizes[fontAttr]) return fontSizes[fontAttr];
  }
  return null;
}

export function scaleHtmlTextSizes(initialHtml: string, scaleRatio: number): string {
  if (!initialHtml || scaleRatio === 1 || isNaN(scaleRatio) || scaleRatio <= 0) return initialHtml;

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = initialHtml;

  const styledEls = tempDiv.querySelectorAll<HTMLElement>(
    '[data-size], [data-orig-size], [style*="font-size"], font[size]'
  );

  if (styledEls.length === 0) {
    return initialHtml;
  }

  styledEls.forEach((el) => {
    const origSize = getElementBaseFontSize(el);
    if (origSize && origSize > 0) {
      const newSize = Math.max(3, Math.min(500, Math.round(origSize * scaleRatio)));
      el.setAttribute('data-size', newSize.toString());
      el.style.fontSize = `calc(var(--ft-scale, 1) * ${newSize}px)`;
      if (!el.style.lineHeight) {
        el.style.lineHeight = '1.25';
      }
    }
  });

  return tempDiv.innerHTML;
}

export interface TextFormatState {
  hasSelection: boolean;
  fontSize: number | 'mixed';
  color: string | 'mixed';
  bgColor: string | 'mixed';
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  isStrikethrough: boolean;
}

export function getSelectionFormatInfo(el: HTMLElement | null, baseItem: FreeTextAnnotation): TextFormatState {
  const defaultState: TextFormatState = {
    hasSelection: false,
    fontSize: baseItem.fontSize || 16,
    color: (baseItem.color || '#1D2129').toUpperCase(),
    bgColor: (baseItem.bgColor || 'transparent').toLowerCase(),
    isBold: !!baseItem.isBold,
    isItalic: !!baseItem.isItalic,
    isUnderline: !!baseItem.isUnderline,
    isStrikethrough: !!baseItem.isStrikethrough,
  };

  if (!el) return defaultState;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return defaultState;

  let range: Range;
  try {
    range = sel.getRangeAt(0);
  } catch (_) {
    return defaultState;
  }

  if (!el.contains(range.commonAncestorContainer) && !range.intersectsNode(el)) {
    return defaultState;
  }

  const textNodes: Node[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    try {
      if (range.intersectsNode(n) && (n.textContent || '').trim().length > 0) {
        textNodes.push(n);
      }
    } catch (_) {}
  }

  if (textNodes.length === 0) {
    return defaultState;
  }

  let isBold = false;
  let isItalic = false;
  let isUnderline = false;
  let isStrikethrough = false;

  try { isBold = document.queryCommandState('bold'); } catch (_) {}
  try { isItalic = document.queryCommandState('italic'); } catch (_) {}
  try { isUnderline = document.queryCommandState('underline'); } catch (_) {}
  try { isStrikethrough = document.queryCommandState('strikeThrough'); } catch (_) {}

  if (!isBold) {
    isBold = textNodes.every((node) => {
      let p: HTMLElement | null = node.parentElement;
      while (p && p !== el) {
        if (p.tagName === 'B' || p.tagName === 'STRONG' || p.style.fontWeight === 'bold' || parseInt(p.style.fontWeight) >= 600) {
          return true;
        }
        p = p.parentElement;
      }
      return !!baseItem.isBold;
    });
  }

  if (!isItalic) {
    isItalic = textNodes.every((node) => {
      let p: HTMLElement | null = node.parentElement;
      while (p && p !== el) {
        if (p.tagName === 'I' || p.tagName === 'EM' || p.style.fontStyle === 'italic') {
          return true;
        }
        p = p.parentElement;
      }
      return !!baseItem.isItalic;
    });
  }

  if (!isUnderline) {
    isUnderline = textNodes.every((node) => {
      let p: HTMLElement | null = node.parentElement;
      while (p && p !== el) {
        if (p.tagName === 'U' || (p.style.textDecoration && p.style.textDecoration.includes('underline'))) {
          return true;
        }
        p = p.parentElement;
      }
      return !!baseItem.isUnderline;
    });
  }

  if (!isStrikethrough) {
    isStrikethrough = textNodes.every((node) => {
      let p: HTMLElement | null = node.parentElement;
      while (p && p !== el) {
        if (p.tagName === 'S' || p.tagName === 'STRIKE' || p.tagName === 'DEL' || (p.style.textDecoration && p.style.textDecoration.includes('line-through'))) {
          return true;
        }
        p = p.parentElement;
      }
      return !!baseItem.isStrikethrough;
    });
  }

  const fontSizes = new Set<number>();
  textNodes.forEach((node) => {
    let size: number | null = null;
    let p: HTMLElement | null = node.parentElement;
    while (p && p !== el) {
      const dataSize = p.getAttribute('data-size');
      if (dataSize) {
        const v = parseInt(dataSize);
        if (!isNaN(v) && v > 0) { size = v; break; }
      }
      const fs = p.style.fontSize;
      if (fs) {
        const m = fs.match(/(\d+(?:\.\d+)?)\s*px/);
        if (m) {
          const v = Math.round(parseFloat(m[1]));
          if (v > 0) { size = v; break; }
        }
      }
      p = p.parentElement;
    }
    fontSizes.add(size ?? (baseItem.fontSize || 16));
  });

  const textColors = new Set<string>();
  textNodes.forEach((node) => {
    let color: string | null = null;
    let p: HTMLElement | null = node.parentElement;
    while (p && p !== el) {
      if (p.style.color) {
        color = p.style.color;
        break;
      }
      if (p.hasAttribute('color')) {
        color = p.getAttribute('color');
        break;
      }
      p = p.parentElement;
    }
    textColors.add(color ? color.trim() : (baseItem.color || '#1D2129'));
  });

  const bgColors = new Set<string>();
  textNodes.forEach((node) => {
    let bg: string | null = null;
    let p: HTMLElement | null = node.parentElement;
    while (p && p !== el) {
      if (p.tagName === 'MARK') {
        bg = p.style.backgroundColor || '#FEF08A';
        break;
      }
      if (p.style.backgroundColor && p.style.backgroundColor !== 'transparent' && p.style.backgroundColor !== 'rgba(0, 0, 0, 0)') {
        bg = p.style.backgroundColor;
        break;
      }
      p = p.parentElement;
    }
    bgColors.add(bg ? bg.trim() : (baseItem.bgColor || 'transparent'));
  });

  return {
    hasSelection: true,
    fontSize: fontSizes.size === 1 ? Array.from(fontSizes)[0] : 'mixed',
    color: textColors.size === 1 ? Array.from(textColors)[0] : 'mixed',
    bgColor: bgColors.size === 1 ? Array.from(bgColors)[0] : 'mixed',
    isBold,
    isItalic,
    isUnderline,
    isStrikethrough,
  };
}

export function recalculateBlockLayout(el: HTMLElement, currentBaseFontSize: number): number {
  if (!el) return currentBaseFontSize;

  const extractSizesFromNode = (container: HTMLElement): number[] => {
    const sizes: number[] = [];
    const elements = container.querySelectorAll<HTMLElement>('[data-size], [style*="font-size"], font[size]');
    elements.forEach((elem) => {
      const s = getElementBaseFontSize(elem);
      if (s && s > 0) sizes.push(s);
    });
    return sizes;
  };

  // If content has top-level <br> line breaks and no block containers, wrap each line into <div>
  // so each line has its own independent line-height and font-size boundary
  if (!el.querySelector('div, p, li') && el.innerHTML.includes('<br>')) {
    const parts = el.innerHTML.split(/<br\s*\/?>/gi);
    if (parts.length > 1) {
      el.innerHTML = parts.map((part) => `<div>${part || '<br>'}</div>`).join('');
    }
  }

  const blockChildren = Array.from(el.children).filter((c) =>
    ['DIV', 'P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE'].includes(c.tagName)
  ) as HTMLElement[];

  let globalMaxFontSize = 0;
  let hasAnyCustomSize = false;

  if (blockChildren.length > 0) {
    blockChildren.forEach((block) => {
      const sizesInBlock = extractSizesFromNode(block);
      if (sizesInBlock.length > 0) {
        hasAnyCustomSize = true;
        const maxInBlock = Math.max(...sizesInBlock);
        globalMaxFontSize = Math.max(globalMaxFontSize, maxInBlock);
        block.setAttribute('data-size', maxInBlock.toString());
        block.style.fontSize = `calc(var(--ft-scale, 1) * ${maxInBlock}px)`;
        block.style.lineHeight = '1.34';
      } else {
        block.removeAttribute('data-size');
        block.style.removeProperty('font-size');
        block.style.removeProperty('line-height');
        globalMaxFontSize = Math.max(globalMaxFontSize, currentBaseFontSize);
      }
    });
  } else {
    const sizes = extractSizesFromNode(el);
    if (sizes.length > 0) {
      hasAnyCustomSize = true;
      globalMaxFontSize = Math.max(...sizes);
    } else {
      globalMaxFontSize = currentBaseFontSize;
    }
  }

  if (hasAnyCustomSize && globalMaxFontSize > 0) {
    return globalMaxFontSize;
  }
  return currentBaseFontSize;
}

interface EditableTextProps {
  id: string;
  isSelected: boolean;
  isEditing: boolean;
  isLocked: boolean;
  text: string;
  fontSize: number;
  scale?: number;
  color: string;
  isBold?: boolean;
  isItalic?: boolean;
  isUnderline?: boolean;
  isStrikethrough?: boolean;
  hasShadow?: boolean;
  textAlign?: 'left' | 'center' | 'right';
  pageNumber?: number;
  onUpdateText: (id: string, updates: Partial<FreeTextAnnotation>) => void;
  onDeleteText: (id: string) => void;
  setActiveTextId: (id: string | null) => void;
  setEditingTextId: (id: string | null) => void;
  onLinkClick?: (anchor: HTMLAnchorElement, href: string) => void;
  onLinkHover?: (anchor: HTMLAnchorElement, href: string, isPinned?: boolean) => void;
  onLinkHoverLeave?: () => void;
  onSelectionRangeChange?: (range: Range | null) => void;
  onOpenLinkDialog?: () => void;
  isJustDragged?: () => boolean;
}

const EditableText: React.FC<EditableTextProps> = ({
  id,
  isSelected,
  isEditing,
  isLocked,
  text,
  fontSize,
  scale = 1,
  color,
  isBold,
  isItalic,
  isUnderline,
  isStrikethrough,
  hasShadow,
  textAlign,
  pageNumber,
  onUpdateText,
  onDeleteText,
  setActiveTextId,
  setEditingTextId,
  onLinkClick,
  onLinkHover,
  onLinkHoverLeave,
  onSelectionRangeChange,
  onOpenLinkDialog,
  isJustDragged,
}) => {
  const elRef = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false);
  const lastClickedAnchorRef = useRef<{ anchor: HTMLAnchorElement; time: number } | null>(null);
  const hoverTimerRef = useRef<number | null>(null);

  const updateSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && elRef.current) {
      const range = sel.getRangeAt(0);
      if (elRef.current.contains(range.commonAncestorContainer)) {
        if (range.collapsed) {
          onSelectionRangeChange?.(null);
        } else {
          onSelectionRangeChange?.(range.cloneRange());
        }
        return;
      }
    }
    onSelectionRangeChange?.(null);
  };

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const handleDocSelectionChange = () => {
      if (isEditing && elRef.current) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          if (elRef.current.contains(range.commonAncestorContainer)) {
            if (range.collapsed) {
              onSelectionRangeChange?.(null);
            } else {
              onSelectionRangeChange?.(range.cloneRange());
            }
            return;
          }
        }
        onSelectionRangeChange?.(null);
      }
    };

    document.addEventListener('selectionchange', handleDocSelectionChange);
    return () => document.removeEventListener('selectionchange', handleDocSelectionChange);
  }, [isEditing, onSelectionRangeChange]);

  useEffect(() => {
    if (elRef.current) {
      if (document.activeElement !== elRef.current) {
        if (elRef.current.innerHTML !== (text || '')) {
          elRef.current.innerHTML = text || '';
        }
      }
    }
  }, [text, id]);

  useEffect(() => {
    if (isEditing && elRef.current && document.activeElement !== elRef.current) {
      elRef.current.focus();
      const sel = window.getSelection();
      if (sel && elRef.current.childNodes.length > 0) {
        const range = document.createRange();
        range.selectNodeContents(elRef.current);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  }, [isEditing]);

  return (
    <div
      id={`editable-${id}`}
      ref={elRef}
      contentEditable={isEditing && !isLocked}
      suppressContentEditableWarning
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (!isEditing && (e.target as HTMLElement).closest('a')) {
          e.preventDefault();
        }
      }}
      onCompositionStart={() => { isComposingRef.current = true; }}
      onCompositionEnd={() => {
        isComposingRef.current = false;
        if (elRef.current) {
          onUpdateText(id, { text: elRef.current.innerHTML || '' });
        }
      }}
      onMouseMove={(e) => {
        if (isJustDragged && isJustDragged()) return;
        // Chỉ khi khối text ĐANG ĐƯỢC CHỌN (isSelected = true) và người dùng rê chuột đúng chính xác vào từ có chứa link
        const target = e.target as HTMLElement;
        const anchor = (target.closest('a') || (target.tagName === 'A' ? target : null)) as HTMLAnchorElement | null;
        
        if (isSelected && anchor && anchor.getAttribute('href')) {
          const href = anchor.getAttribute('href') || '';
          if (!hoverTimerRef.current) {
            hoverTimerRef.current = window.setTimeout(() => {
              onLinkHover?.(anchor, href, false);
              hoverTimerRef.current = null;
            }, 300); // 300ms delay
          }
        } else {
          if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
          }
          // Rê chuột ra khỏi từ chứa link: gọi onLinkHoverLeave (sẽ chỉ ẩn nếu không ở chế độ pinned)
          onLinkHoverLeave?.();
        }
      }}
      onMouseLeave={() => {
        if (hoverTimerRef.current) {
          clearTimeout(hoverTimerRef.current);
          hoverTimerRef.current = null;
        }
        onLinkHoverLeave?.();
      }}
      onClick={(e) => {
        if (isJustDragged && isJustDragged()) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        const target = e.target as HTMLElement;
        const anchor = (target.closest('a') || (target.tagName === 'A' ? target : null)) as HTMLAnchorElement | null;
        if (anchor && anchor.getAttribute('href')) {
          e.preventDefault();
          e.stopPropagation();
          const href = anchor.getAttribute('href') || '';
          const now = Date.now();
          const lastClick = lastClickedAnchorRef.current;
          
          // Khi người dùng click vào link: Ghim (Pin) Popover cố định cho đến khi click ra ngoài
          setActiveTextId(id);
          onLinkHover?.(anchor, href, true);

          // Nhấn chuột lần 2 chính xác vào chữ chứa link trong 3.5s -> mở tab mới
          if (isSelected && lastClick && lastClick.anchor === anchor && (now - lastClick.time < 3500)) {
            window.open(href, '_blank', 'noopener,noreferrer');
            lastClickedAnchorRef.current = null;
          } else {
            lastClickedAnchorRef.current = { anchor, time: now };
          }
        } else {
          lastClickedAnchorRef.current = null;
        }
      }}
      onMouseUp={updateSelection}
      onKeyUp={(e) => {
        updateSelection();
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
          e.preventDefault();
          onOpenLinkDialog?.();
        }
      }}
      onInput={() => {
        if (!isComposingRef.current && elRef.current) {
          const html = elRef.current.innerHTML || '';
          onUpdateText(id, { text: html });
        }
      }}
      onBlur={() => {
        if (!elRef.current) return;
        const html = elRef.current.innerHTML || '';
        const textContent = (elRef.current.textContent || elRef.current.innerText || '').trim();
        if (textContent === '' || html === '<br>' || html.trim() === '') {
          onDeleteText(id);
          if (isSelected) {
            setActiveTextId(null);
            setEditingTextId(null);
          }
        } else {
          onUpdateText(id, { text: html });
        }
      }}
      onPaste={(e) => {
        e.preventDefault();
        const html = e.clipboardData.getData('text/html');
        const plainText = e.clipboardData.getData('text/plain');

        let contentToInsert = '';

        if (html) {
          try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Remove scripts, meta, link, object tags
            const dangerous = doc.querySelectorAll('script, style, meta, link, iframe, object, embed');
            dangerous.forEach((n) => n.remove());

            // Sanitize elements: remove hardcoded dimensions, fixed font sizes, and rigid layouts
            const allElements = doc.body.querySelectorAll('*');
            allElements.forEach((el) => {
              const htmlEl = el as HTMLElement;
              if (htmlEl.style) {
                htmlEl.style.removeProperty('width');
                htmlEl.style.removeProperty('min-width');
                htmlEl.style.removeProperty('max-width');
                htmlEl.style.removeProperty('height');
                htmlEl.style.removeProperty('min-height');
                htmlEl.style.removeProperty('max-height');
                htmlEl.style.removeProperty('white-space');
                htmlEl.style.removeProperty('font-size'); // Allow parent fontSize scaling!
                htmlEl.style.removeProperty('line-height');
                htmlEl.style.removeProperty('word-break');
                htmlEl.style.removeProperty('overflow');
                htmlEl.style.removeProperty('display');
              }
              if (el.tagName === 'TABLE') {
                el.removeAttribute('width');
                (el as HTMLElement).style.width = '100%';
                (el as HTMLElement).style.maxWidth = '100%';
              }
              if (el.tagName === 'IMG') {
                el.removeAttribute('width');
                el.removeAttribute('height');
                (el as HTMLElement).style.maxWidth = '100%';
                (el as HTMLElement).style.height = 'auto';
              }
              if (el.tagName === 'PRE') {
                (el as HTMLElement).style.whiteSpace = 'pre-wrap';
              }
            });

            contentToInsert = doc.body.innerHTML;
          } catch (_) {
            contentToInsert = '';
          }
        }

        if (!contentToInsert && plainText) {
          const escaped = plainText
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;')
            .replace(/\n/g, '<br>');
          contentToInsert = escaped;
        }

        if (contentToInsert) {
          document.execCommand('insertHTML', false, contentToInsert);
          if (elRef.current) {
            const updatedHtml = elRef.current.innerHTML || '';
            onUpdateText(id, { text: updatedHtml });

            // Check if pasted content causes text box to span across pages (>50% on target page)
            if (pageNumber !== undefined) {
              requestAnimationFrame(() => {
                if (!elRef.current) return;
                const rect = elRef.current.getBoundingClientRect();
                const match = findBestMatchingPage(rect, pageNumber);
                if (match && match.targetPage !== pageNumber) {
                  onUpdateText(id, {
                    pageNumber: match.targetPage,
                    x: match.relXPct,
                    y: match.relYPct,
                  });
                }
              });
            }
          }
        }
      }}
      onKeyDown={(e) => {
        if ((e.key === 'Delete' || e.key === 'Backspace') && (elRef.current?.innerText || '').trim() === '') {
          onDeleteText(id);
          setActiveTextId(null);
          setEditingTextId(null);
        }
      }}
      className={`free-text-editable bg-transparent border-none outline-none whitespace-pre-wrap inline-block empty:before:content-['Thêm_văn_bản'] empty:before:text-neutral-400 empty:before:pointer-events-none ${(!text && !isSelected) ? 'text-neutral-400 font-medium' : ''} ${
        isEditing ? 'cursor-text select-text pointer-events-auto ' : 'cursor-default select-none pointer-events-auto'
      }`}
      style={{
        fontSize: `${fontSize}px`,
        color: color || '#1D2129',
        fontWeight: isBold ? 'bold' : 'normal',
        fontStyle: isItalic ? 'italic' : 'normal',
        textDecoration: `${isUnderline ? 'underline' : ''} ${isStrikethrough ? 'line-through' : ''}`.trim(),
        textUnderlineOffset: 'clamp(2px, 0.12em, 5px)',
        textDecorationSkipInk: 'none',
        textDecorationThickness: '0.08em',
        textAlign: textAlign || 'left',
        height: 'auto',
        minHeight: 'fit-content',
        width: '100%',
        minWidth: '0px',
        wordBreak: 'normal',
        overflowWrap: 'break-word',
        whiteSpace: 'pre-wrap',
        padding: '0px 1px 0px 1px',
        margin: '0px',
        lineHeight: '1.25',
        boxSizing: 'border-box',
        ['--ft-scale' as any]: scale || 1,
      }}
    />
  );
};

export const FreeTextLayer: React.FC<FreeTextLayerProps> = ({
  fileId,
  pageNumber,
  totalPages,
  freeTexts,
  isTextToolActive,
  onAddText,
  onUpdateText,
  onDeleteText,
  onDeactivateTextTool,
  scale = 1.0,
  selectedIds,
  onSelect,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeTextId, setActiveTextId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [rotatingAngle, setRotatingAngle] = useState<{ id: string; angle: number; snapped?: boolean } | null>(null);

  const [activePopup, setActivePopup] = useState<'shape' | 'color' | 'size' | 'format' | 'more' | null>(null);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [inlineLinkUrl, setInlineLinkUrl] = useState('');
  const [savedRange, setSavedRange] = useState<Range | null>(null);
  const savedRangeRef = useRef<{ itemId: string; range: Range } | null>(null);
  const savedOffsetsRef = useRef<{ itemId: string; start: number; end: number; text: string } | null>(null);

  const captureCurrentSelection = (itemId: string) => {
    if (editingTextId !== itemId) {
      if (savedRangeRef.current?.itemId === itemId) {
        savedRangeRef.current = null;
      }
      if (savedOffsetsRef.current?.itemId === itemId) {
        savedOffsetsRef.current = null;
      }
      setSavedRange(null);
      return;
    }
    const el = document.getElementById(`editable-${itemId}`);
    const sel = window.getSelection();
    if (el && sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (el.contains(range.commonAncestorContainer) && !range.collapsed) {
        savedRangeRef.current = { itemId, range: range.cloneRange() };
        setSavedRange(range.cloneRange());
        const offsets = getSelectionOffsets(el, range);
        if (offsets) {
          savedOffsetsRef.current = { itemId, ...offsets, text: range.toString() };
        }
        return;
      }
    }
    if (savedRangeRef.current?.itemId === itemId) {
      savedRangeRef.current = null;
    }
    if (savedOffsetsRef.current?.itemId === itemId) {
      savedOffsetsRef.current = null;
    }
    setSavedRange(null);
  };
  const [editingAnchor, setEditingAnchor] = useState<HTMLAnchorElement | null>(null);
  const [isGesturing, setIsGesturing] = useState(false);
  const [activeLinkCard, setActiveLinkCard] = useState<{
    itemId: string;
    href: string;
    anchorElement: HTMLAnchorElement;
    top: number;
    left: number;
    isPinned: boolean;
    isEditingInline?: boolean;
  } | null>(null);
  const linkCardTimeoutRef = useRef<number | null>(null);
  const justDraggedRef = useRef(false);
  const [altGhost, setAltGhost] = useState<FreeTextAnnotation | null>(null);
  const altGhostRef = useRef<FreeTextAnnotation | null>(null);
  useEffect(() => { altGhostRef.current = altGhost; }, [altGhost]);

  const selectedIdsRef = useRef<string[] | undefined>(selectedIds);
  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  // Shift key tracking
  const [isShiftDown, setIsShiftDown] = useState(false);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift' || e.shiftKey) setIsShiftDown(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift' || !e.shiftKey) setIsShiftDown(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Smart positioning state and calculation for Toolbar and Sub-menus
  interface ToolbarPosition {
    top: number;
    left: number;
    isAbove: boolean;
    isVisible: boolean;
  }
  const [toolbarPos, setToolbarPos] = useState<ToolbarPosition | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [smartDirectionMap, setSmartDirectionMap] = useState<Record<string, boolean>>({});

  // Formatting state synchronization for Toolbar
  const [selectionFormat, setSelectionFormat] = useState<TextFormatState | null>(null);

  const refreshSelectionFormat = useCallback(() => {
    if (!activeTextId) {
      setSelectionFormat(null);
      return;
    }
    const item = freeTexts.find((t) => t.id === activeTextId);
    if (!item) {
      setSelectionFormat(null);
      return;
    }
    const el = document.getElementById(`editable-${activeTextId}`);
    const format = getSelectionFormatInfo(el, item);
    setSelectionFormat(format);
  }, [activeTextId, freeTexts]);

  useEffect(() => {
    const handleDocSelectionChange = () => {
      refreshSelectionFormat();
    };
    document.addEventListener('selectionchange', handleDocSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleDocSelectionChange);
    };
  }, [refreshSelectionFormat]);

  useEffect(() => {
    refreshSelectionFormat();
  }, [activeTextId, editingTextId, freeTexts, refreshSelectionFormat]);

  const updateSmartPosition = useCallback(() => {
    const isMulti = Boolean(selectedIds && selectedIds.length > 1);
    const selectedTextsOnPage = freeTexts.filter((t) => t.pageNumber === pageNumber && selectedIds?.includes(t.id));

    let targetKey: string | null = null;
    let rects: DOMRect[] = [];

    if (isMulti && selectedTextsOnPage.length > 1) {
      targetKey = 'group_' + selectedTextsOnPage.map((t) => t.id).sort().join('_');
      selectedTextsOnPage.forEach((t) => {
        const el = document.getElementById(`freetext-${t.id}`) || document.getElementById(`editable-${t.id}`);
        if (el) {
          rects.push(el.getBoundingClientRect());
        }
      });
    } else if (activeTextId) {
      targetKey = activeTextId;
      const el = document.getElementById(`freetext-${activeTextId}`) || document.getElementById(`editable-${activeTextId}`);
      if (el) {
        rects.push(el.getBoundingClientRect());
      }
    } else if (selectedIds && selectedIds.length === 1) {
      targetKey = selectedIds[0];
      const el = document.getElementById(`freetext-${selectedIds[0]}`) || document.getElementById(`editable-${selectedIds[0]}`);
      if (el) {
        rects.push(el.getBoundingClientRect());
      }
    }

    if (!targetKey || rects.length === 0) {
      setToolbarPos(null);
      return;
    }

    const rect = {
      top: Math.min(...rects.map((r) => r.top)),
      bottom: Math.max(...rects.map((r) => r.bottom)),
      left: Math.min(...rects.map((r) => r.left)),
      right: Math.max(...rects.map((r) => r.right)),
      width: Math.max(...rects.map((r) => r.right)) - Math.min(...rects.map((r) => r.left)),
      height: Math.max(...rects.map((r) => r.bottom)) - Math.min(...rects.map((r) => r.top)),
    };

    const headerEl = document.querySelector('header');
    const headerBottom = headerEl ? Math.max(0, headerEl.getBoundingClientRect().bottom) : 48;

    const bottomToolbarEl = document.getElementById('bottom-toolbar') || document.querySelector('.bottom-toolbar, [data-bottom-toolbar="true"]');
    const bottomToolbarRect = bottomToolbarEl ? bottomToolbarEl.getBoundingClientRect() : null;
    const bottomLimit = bottomToolbarRect && bottomToolbarRect.top > 0
      ? bottomToolbarRect.top
      : (window.innerHeight - 70);

    const viewportWidth = window.innerWidth;

    if (rect.bottom < headerBottom || rect.top > bottomLimit || rect.right < 0 || rect.left > viewportWidth) {
      setToolbarPos((prev) => (prev ? { ...prev, isVisible: false } : null));
      return;
    }

    const tbEl = toolbarRef.current;
    const tbWidth = tbEl ? tbEl.offsetWidth : 430;
    const tbHeight = tbEl ? tbEl.offsetHeight : 42;

    const GAP_BOX_TB = 10;
    const GAP_TB_SUB = 8;
    const MARGIN = 10;
    // Estimated max height of submenus (Font size dropdown ~280px, Color picker ~240px, Format panel ~220px)
    const PREDICTED_SUBMENU_HEIGHT = 280;

    const totalAboveNeeded = tbHeight + GAP_BOX_TB + GAP_TB_SUB + PREDICTED_SUBMENU_HEIGHT + MARGIN;
    const totalBelowNeeded = tbHeight + GAP_BOX_TB + GAP_TB_SUB + PREDICTED_SUBMENU_HEIGHT + MARGIN;

    const spaceAbove = rect.top - headerBottom;
    const spaceBelow = bottomLimit - rect.bottom;

    const currentDir = smartDirectionMap[targetKey];
    let isAbove = true;

    if (currentDir === undefined) {
      if (spaceAbove >= totalAboveNeeded) {
        isAbove = true;
      } else if (spaceBelow >= totalBelowNeeded) {
        isAbove = false;
      } else {
        isAbove = spaceAbove >= spaceBelow;
      }
    } else if (currentDir === true) {
      const hysteresisMargin = 16;
      if (spaceAbove < totalAboveNeeded - hysteresisMargin && spaceBelow > spaceAbove) {
        isAbove = false;
      } else {
        isAbove = true;
      }
    } else {
      const hysteresisMargin = 16;
      if (spaceAbove >= totalAboveNeeded + hysteresisMargin || (spaceAbove > spaceBelow && spaceBelow < totalBelowNeeded - hysteresisMargin)) {
        isAbove = true;
      } else {
        isAbove = false;
      }
    }

    setSmartDirectionMap((prev) => {
      if (prev[targetKey!] === isAbove) return prev;
      return { ...prev, [targetKey!]: isAbove };
    });

  }, [activeTextId, selectedIds, pageNumber, freeTexts, smartDirectionMap]);

  useLayoutEffect(() => {
    updateSmartPosition();
    const raf = requestAnimationFrame(updateSmartPosition);
    return () => cancelAnimationFrame(raf);
  }, [activeTextId, selectedIds, activePopup, showLinkInput, freeTexts, scale, updateSmartPosition]);

  useEffect(() => {
    window.addEventListener('resize', updateSmartPosition);
    window.addEventListener('scroll', updateSmartPosition, true);

    const container = document.querySelector('.pdf-viewport-container');
    if (container) {
      container.addEventListener('scroll', updateSmartPosition, { passive: true });
    }

    return () => {
      window.removeEventListener('resize', updateSmartPosition);
      window.removeEventListener('scroll', updateSmartPosition, true);
      if (container) {
        container.removeEventListener('scroll', updateSmartPosition);
      }
    };
  }, [updateSmartPosition]);

  // Auto-close open sub-menus on scroll
  useEffect(() => {
    const handleScroll = () => {
      if (activePopup) {
        setActivePopup(null);
      }
    };
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [activePopup]);

  // Khi xoá khối text có link: Popover biến mất ngay lập tức (0ms delay)
  useEffect(() => {
    if (activeLinkCard) {
      const exists = freeTexts.some((t) => t.id === activeLinkCard.itemId);
      if (!exists) {
        setActiveLinkCard(null);
        if (linkCardTimeoutRef.current) {
          clearTimeout(linkCardTimeoutRef.current);
          linkCardTimeoutRef.current = null;
        }
      }
    }
  }, [freeTexts, activeLinkCard]);

  useEffect(() => {
    const handleClickAway = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        !target.closest('.ft-link-card-popover') &&
        !target.closest('.ft-link-dialog') &&
        !target.closest('.free-text-item-container') &&
        !target.closest('.ft-toolbar')
      ) {
        setActiveLinkCard(null);
      }
    };
    window.addEventListener('pointerdown', handleClickAway);
    return () => window.removeEventListener('pointerdown', handleClickAway);
  }, []);

  // Khi scale/zoom thay đổi hoặc đang kéo giãn/thu phóng khối text -> tự động ẩn Popover
  useEffect(() => {
    setActiveLinkCard(null);
  }, [scale]);

  useEffect(() => {
    if (isGesturing) {
      setActiveLinkCard(null);
    }
  }, [isGesturing]);

  const handleLinkHover = (itemId: string, anchor: HTMLAnchorElement, href: string, isPinned = false) => {
    if (linkCardTimeoutRef.current) {
      clearTimeout(linkCardTimeoutRef.current);
      linkCardTimeoutRef.current = null;
    }
    const rect = anchor.getBoundingClientRect();
    const popoverWidth = 320;
    const popoverHeight = 44;

    // Yêu cầu: Popover xem trước nằm cố định phía dưới chữ (8px)
    let top = rect.bottom + 8;
    if (top + popoverHeight > window.innerHeight - 10) {
      top = Math.max(10, rect.top - popoverHeight - 8);
    }

    const left = Math.max(12, Math.min(window.innerWidth - popoverWidth - 12, rect.left));

    setActiveLinkCard((prev) => {
      const shouldKeepPinned = isPinned || (prev?.isPinned && prev.itemId === itemId && prev.anchorElement === anchor);
      const isEditing = prev?.isEditingInline && prev.anchorElement === anchor;
      return {
        itemId,
        href,
        anchorElement: anchor,
        top,
        left,
        isPinned: !!shouldKeepPinned,
        isEditingInline: isEditing,
      };
    });
  };

  const handleLinkHoverLeave = () => {
    if (linkCardTimeoutRef.current) {
      clearTimeout(linkCardTimeoutRef.current);
    }
    // Khoảng đệm timeout 300ms, chỉ tự ẩn nếu không ở trạng thái cố định (isPinned = false)
    linkCardTimeoutRef.current = window.setTimeout(() => {
      setActiveLinkCard((prev) => (prev && !prev.isPinned ? null : prev));
    }, 300);
  };

  const handleOpenLinkDialog = (itemId?: string) => {
    const targetId = itemId || activeTextId;
    let currentHref = '';
    let currentAnchor: HTMLAnchorElement | null = null;
    const targetEl = targetId ? document.getElementById(`editable-${targetId}`) : null;

    // 1. Kiểm tra anchor từ vùng bôi đen (selection range)
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && targetEl) {
      const range = sel.getRangeAt(0);
      if (targetEl.contains(range.commonAncestorContainer)) {
        setSavedRange(range.cloneRange());
        const anchorNode = sel.anchorNode;
        const parentAnchor = anchorNode ? (anchorNode.parentElement?.closest('a') || (anchorNode as HTMLElement).closest?.('a')) : null;
        if (parentAnchor) {
          currentAnchor = parentAnchor as HTMLAnchorElement;
          currentHref = parentAnchor.getAttribute('href') || '';
        }
      }
    }

    // 2. Nếu không có vùng bôi đen cụ thể, kiểm tra xem khối text hiện tại có chứa thẻ a không
    if (!currentAnchor && targetEl) {
      const existingAnchor = targetEl.querySelector('a');
      if (existingAnchor) {
        currentAnchor = existingAnchor as HTMLAnchorElement;
        currentHref = existingAnchor.getAttribute('href') || '';
      }
    }

    // 3. Nếu DOM chưa kịp bắt, đọc trực tiếp từ dữ liệu item text
    if (!currentHref && targetId) {
      const item = freeTexts.find(t => t.id === targetId);
      if (item && item.text) {
        const match = item.text.match(/href=["']([^"']+)["']/i);
        if (match && match[1]) {
          currentHref = match[1];
        }
      }
    }

    // Ghi nhận thuộc tính href của text, ô input hiển thị sẵn đường dẫn URL cũ
    setEditingAnchor(currentAnchor);
    setLinkUrl(currentHref);
    setShowLinkInput(true);
    setActivePopup(null);
    setActiveLinkCard(null);
  };

  const handleConfirmLink = (itemId?: string) => {
    const targetId = itemId || activeTextId;
    if (!targetId) {
      setShowLinkInput(false);
      setEditingAnchor(null);
      setSavedRange(null);
      setLinkUrl('');
      return;
    }

    // Nếu người dùng xóa trắng link thì thực hiện gỡ liên kết (unlink)
    if (!linkUrl.trim()) {
      if (editingAnchor) {
        handleUnlinkAnchor(targetId, editingAnchor);
      } else {
        const el = document.getElementById(`editable-${targetId}`);
        const existingA = el?.querySelector('a');
        if (existingA) {
          handleUnlinkAnchor(targetId, existingA as HTMLAnchorElement);
        }
      }
      setShowLinkInput(false);
      setEditingAnchor(null);
      setSavedRange(null);
      setLinkUrl('');
      return;
    }

    const raw = linkUrl.trim();
    const url = (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('mailto:') || raw.startsWith('tel:'))
      ? raw
      : `https://${raw}`;

    const el = document.getElementById(`editable-${targetId}`);
    if (el) {
      if (editingAnchor && el.contains(editingAnchor)) {
        // Case 1: Editing existing link - ONLY update href, NEVER touch display text
        editingAnchor.setAttribute('href', url);
        editingAnchor.setAttribute('target', '_blank');
        editingAnchor.setAttribute('rel', 'noopener noreferrer');
        editingAnchor.style.color = '#2563eb';
        editingAnchor.style.textDecoration = 'underline';
        editingAnchor.className = 'text-blue-600 underline font-medium cursor-pointer hover:text-blue-700';
      } else {
        let rangeToApply: Range | null = savedRange || (savedRangeRef.current?.itemId === targetId ? savedRangeRef.current.range : null);
        if (!rangeToApply || !el.contains(rangeToApply.commonAncestorContainer)) {
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0) {
            const selRange = sel.getRangeAt(0);
            if (el.contains(selRange.commonAncestorContainer) && !selRange.collapsed) {
              rangeToApply = selRange.cloneRange();
            }
          }
        }

        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.style.color = '#2563eb';
        anchor.style.textDecoration = 'underline';
        anchor.className = 'text-blue-600 underline font-medium cursor-pointer hover:text-blue-700';

        if (rangeToApply && el.contains(rangeToApply.commonAncestorContainer) && !rangeToApply.collapsed) {
          // Case 2: Specific range of text highlighted by user - wrap ONLY the selected text
          const extracted = rangeToApply.extractContents();
          anchor.appendChild(extracted);
          rangeToApply.insertNode(anchor);
        } else {
          // Case 3: Whole box selected or range collapsed - wrap existing text without replacing
          const hasExistingText = (el.textContent || '').trim().length > 0;
          if (hasExistingText) {
            const existingA = el.querySelector('a');
            if (existingA) {
              existingA.setAttribute('href', url);
              existingA.setAttribute('target', '_blank');
              existingA.setAttribute('rel', 'noopener noreferrer');
              existingA.style.color = '#2563eb';
              existingA.style.textDecoration = 'underline';
              existingA.className = 'text-blue-600 underline font-medium cursor-pointer hover:text-blue-700';
            } else {
              while (el.firstChild) {
                anchor.appendChild(el.firstChild);
              }
              el.appendChild(anchor);
            }
          } else {
            // Case 4: Box was totally empty
            anchor.textContent = url;
            el.appendChild(anchor);
          }
        }
      }
      onUpdateText(targetId, { text: el.innerHTML });
    }

    setShowLinkInput(false);
    setEditingAnchor(null);
    setSavedRange(null);
    setLinkUrl('');
  };

  const handleSaveInlineLink = () => {
    if (!activeLinkCard) return;
    const { itemId, anchorElement, href: oldHref } = activeLinkCard;
    const raw = inlineLinkUrl.trim();
    if (!raw) {
      handleUnlinkAnchor(itemId, anchorElement);
      return;
    }
    const formattedUrl = (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('mailto:') || raw.startsWith('tel:'))
      ? raw
      : `https://${raw}`;

    const item = freeTexts.find(t => t.id === itemId);
    let updatedHtml = '';

    if (item && item.text) {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(item.text, 'text/html');
        const anchors = Array.from(doc.querySelectorAll('a'));
        const targetA = (oldHref ? anchors.find(a => a.getAttribute('href') === oldHref) : null) || anchors[0];
        if (targetA) {
          targetA.setAttribute('href', formattedUrl);
          targetA.setAttribute('target', '_blank');
          targetA.setAttribute('rel', 'noopener noreferrer');
          targetA.style.color = '#2563eb';
          targetA.style.textDecoration = 'underline';
          targetA.className = 'text-blue-600 underline font-medium cursor-pointer hover:text-blue-700';
          updatedHtml = doc.body.innerHTML;
        }
      } catch (_) {}
    }

    const el = document.getElementById(`editable-${itemId}`);
    if (el) {
      let targetAnchor: HTMLAnchorElement | null = null;
      if (anchorElement && el.contains(anchorElement)) {
        targetAnchor = anchorElement;
      } else {
        const anchors = Array.from(el.querySelectorAll('a'));
        targetAnchor = (oldHref ? anchors.find(a => a.getAttribute('href') === oldHref) : null) || anchors[0] || null;
      }

      if (targetAnchor) {
        targetAnchor.setAttribute('href', formattedUrl);
        targetAnchor.setAttribute('target', '_blank');
        targetAnchor.setAttribute('rel', 'noopener noreferrer');
        targetAnchor.style.color = '#2563eb';
        targetAnchor.style.textDecoration = 'underline';
        targetAnchor.className = 'text-blue-600 underline font-medium cursor-pointer hover:text-blue-700';
        updatedHtml = el.innerHTML;
      }
    }

    if (updatedHtml) {
      onUpdateText(itemId, { text: updatedHtml });
    } else if (item && item.text) {
      const updated = item.text.replace(/href=["'][^"']*["']/i, `href="${formattedUrl}"`);
      onUpdateText(itemId, { text: updated });
    }

    setActiveLinkCard((prev) => prev ? { ...prev, href: formattedUrl, isEditingInline: false, isPinned: true } : null);
  };

  const handleEditLinkFromCard = (card: { itemId: string; href: string; anchorElement: HTMLAnchorElement }) => {
    setInlineLinkUrl(card.href);
    setActiveLinkCard((prev) => prev ? { ...prev, isEditingInline: true, isPinned: true } : null);
  };

  const handleUnlinkAnchor = (itemId: string, anchor?: HTMLAnchorElement | null) => {
    const item = freeTexts.find(t => t.id === itemId);
    let updatedHtml = '';

    const unwrapNode = (node: Node) => {
      const parent = node.parentNode;
      if (!parent) return;
      while (node.firstChild) {
        parent.insertBefore(node.firstChild, node);
      }
      parent.removeChild(node);
    };

    const el = document.getElementById(`editable-${itemId}`);
    if (el) {
      if (anchor && el.contains(anchor)) {
        unwrapNode(anchor);
        updatedHtml = el.innerHTML;
      } else {
        const targetHref = activeLinkCard?.href;
        const anchors = Array.from(el.querySelectorAll('a'));
        const matchingAnchor = (targetHref ? anchors.find(a => a.getAttribute('href') === targetHref) : null) || (anchors.length > 0 ? anchors[0] : null);
        if (matchingAnchor) {
          unwrapNode(matchingAnchor);
          updatedHtml = el.innerHTML;
        } else if (anchors.length > 0) {
          anchors.forEach(unwrapNode);
          updatedHtml = el.innerHTML;
        }
      }
    }

    if (!updatedHtml && item && item.text) {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(item.text, 'text/html');
        const targetHref = activeLinkCard?.href;
        const anchors = Array.from(doc.querySelectorAll('a'));
        const matchingAnchor = (targetHref ? anchors.find(a => a.getAttribute('href') === targetHref) : null) || (anchors.length > 0 ? anchors[0] : null);
        if (matchingAnchor) {
          unwrapNode(matchingAnchor);
          updatedHtml = doc.body.innerHTML;
        } else if (anchors.length > 0) {
          anchors.forEach(unwrapNode);
          updatedHtml = doc.body.innerHTML;
        }
      } catch (_) {}
    }

    if (updatedHtml) {
      onUpdateText(itemId, { text: updatedHtml });
    } else if (item && item.text) {
      const stripped = item.text.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, '$1');
      onUpdateText(itemId, { text: stripped });
    }

    setActiveLinkCard(null);
    setShowLinkInput(false);
    setEditingAnchor(null);
    setLinkUrl('');
  };

  const handleUnlinkFromCard = (card: { itemId: string; anchorElement: HTMLAnchorElement }) => {
    handleUnlinkAnchor(card.itemId, card.anchorElement);
  };

  // High-performance pointer gesture refs
  const rafRef = useRef<number | null>(null);
  const copiedItemRef = useRef<FreeTextAnnotation | null>(null);

  const dragRef = useRef<{
    id: string;
    startPointerX: number;
    startPointerY: number;
    startX: number;
    startY: number;
    hasMoved: boolean;
    wasAlreadySelected: boolean;
    isAltGhost?: boolean;
    isFrameClick?: boolean;
  } | null>(null);

  const resizeRef = useRef<{
    id: string;
    handle: string;
    startPointerX: number;
    startPointerY: number;
    startWidth: number;
    startHeight: number;
    startLeft: number;
    startTop: number;
    startFontSize: number;
    startItemWidth?: number;
    startHtml?: string;
  } | null>(null);

  const rotateRef = useRef<{
    id: string;
    centerX: number;
    centerY: number;
    initialPointerAngle: number;
    initialRotation: number;
  } | null>(null);

  const pageTexts = [...freeTexts.filter((t) => t.pageNumber === pageNumber), ...(altGhost && altGhost.pageNumber === pageNumber ? [altGhost] : [])];

  // Cleanup empty text items when text tool becomes inactive
  useEffect(() => {
    if (!isTextToolActive) {
      pageTexts.forEach((item) => {
        const cleanText = (item.text || '').replace(/<[^>]*>/g, '').trim();
        if (!cleanText) {
          onDeleteText(item.id);
        }
      });
      setActiveTextId(null);
      setEditingTextId(null);
    }
  }, [isTextToolActive]);

  const getRotateCursorClass = (corner: 'nw' | 'ne' | 'se' | 'sw' | 'handle', itemRotation: number = 0) => {
    const cornerAngles: Record<string, number> = {
      nw: 0,
      ne: 90,
      se: 180,
      sw: 270,
      handle: 270,
    };
    const base = cornerAngles[corner] ?? 0;
    const totalAngle = ((base + itemRotation) % 360 + 360) % 360;
    const snapped = (Math.round(totalAngle / 45) * 45) % 360;
    return `cursor-rotate-${snapped}`;
  };

  const ensureSelectionRestored = (itemId: string): { el: HTMLElement | null; sel: Selection | null; hasSelection: boolean } => {
    const el = document.getElementById(`editable-${itemId}`);
    const sel = window.getSelection();
    if (!el || !sel) return { el: null, sel: null, hasSelection: false };

    // If the text item is NOT currently in editing mode (editingTextId !== itemId),
    // then the user has selected the whole block! There is NO active text selection!
    if (editingTextId !== itemId) {
      if (savedRangeRef.current?.itemId === itemId) {
        savedRangeRef.current = null;
      }
      if (savedOffsetsRef.current?.itemId === itemId) {
        savedOffsetsRef.current = null;
      }
      setSavedRange(null);
      return { el, sel, hasSelection: false };
    }

    // 1. Current active selection is already inside el
    if (sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (el.contains(range.commonAncestorContainer)) {
        if (range.collapsed) {
          if (savedRangeRef.current?.itemId === itemId) {
            savedRangeRef.current = null;
          }
          if (savedOffsetsRef.current?.itemId === itemId) {
            savedOffsetsRef.current = null;
          }
          setSavedRange(null);
          return { el, sel, hasSelection: false };
        }
        return { el, sel, hasSelection: true };
      }
    }

    // 2. Try to restore savedRangeRef or state savedRange
    if (savedRangeRef.current && savedRangeRef.current.itemId === itemId) {
      const rangeToUse = savedRangeRef.current.range;
      if (rangeToUse && el.contains(rangeToUse.commonAncestorContainer) && !rangeToUse.collapsed) {
        try {
          sel.removeAllRanges();
          sel.addRange(rangeToUse);
          return { el, sel, hasSelection: true };
        } catch (_) {}
      }
    }

    if (savedRange && el.contains(savedRange.commonAncestorContainer) && !savedRange.collapsed) {
      try {
        sel.removeAllRanges();
        sel.addRange(savedRange);
        return { el, sel, hasSelection: true };
      } catch (_) {}
    }

    // 3. Try to restore from savedOffsetsRef
    if (savedOffsetsRef.current && savedOffsetsRef.current.itemId === itemId && savedOffsetsRef.current.end > savedOffsetsRef.current.start) {
      const restored = restoreSelectionOffsets(el, savedOffsetsRef.current.start, savedOffsetsRef.current.end);
      if (restored && !restored.collapsed) {
        return { el, sel, hasSelection: true };
      }
    }

    return { el, sel, hasSelection: false };
  };

  // Helper to synchronize whole block properties across all descendant elements while preserving rich-text structure
  const applyWholeBlockFormatting = (
    el: HTMLElement,
    property: 'bgColor' | 'color' | 'bold' | 'italic' | 'underline' | 'strikethrough' | 'fontSize',
    value: any
  ): string => {
    const all = Array.from(el.querySelectorAll('*')) as HTMLElement[];

    if (property === 'bgColor') {
      // Remove inline background colors on inner spans/elements so parent/wrapper background shines through cleanly
      all.forEach((child) => {
        if (child.style) {
          child.style.removeProperty('background-color');
          child.style.removeProperty('backgroundColor');
        }
        if (child.tagName === 'MARK') {
          const parent = child.parentNode;
          if (parent) {
            while (child.firstChild) {
              parent.insertBefore(child.firstChild, child);
            }
            parent.removeChild(child);
          }
        }
      });
    } else if (property === 'color') {
      // Remove inline text colors on non-link spans/elements so parent text color applies uniformly
      all.forEach((child) => {
        if (child.tagName !== 'A') {
          if (child.style) {
            child.style.removeProperty('color');
          }
          if (child.hasAttribute('color')) {
            child.removeAttribute('color');
          }
        }
      });
    } else if (property === 'bold') {
      all.forEach((child) => {
        if (child.style) {
          child.style.removeProperty('font-weight');
          child.style.removeProperty('fontWeight');
        }
        if (!value && (child.tagName === 'B' || child.tagName === 'STRONG')) {
          const parent = child.parentNode;
          if (parent) {
            while (child.firstChild) {
              parent.insertBefore(child.firstChild, child);
            }
            parent.removeChild(child);
          }
        }
      });
    } else if (property === 'italic') {
      all.forEach((child) => {
        if (child.style) {
          child.style.removeProperty('font-style');
          child.style.removeProperty('fontStyle');
        }
        if (!value && (child.tagName === 'I' || child.tagName === 'EM')) {
          const parent = child.parentNode;
          if (parent) {
            while (child.firstChild) {
              parent.insertBefore(child.firstChild, child);
            }
            parent.removeChild(child);
          }
        }
      });
    } else if (property === 'underline') {
      all.forEach((child) => {
        if (child.tagName !== 'A') {
          if (child.style) {
            child.style.removeProperty('text-decoration');
            child.style.removeProperty('textDecoration');
          }
          if (!value && child.tagName === 'U') {
            const parent = child.parentNode;
            if (parent) {
              while (child.firstChild) {
                parent.insertBefore(child.firstChild, child);
              }
              parent.removeChild(child);
            }
          }
        }
      });
    } else if (property === 'strikethrough') {
      all.forEach((child) => {
        if (child.style) {
          child.style.removeProperty('text-decoration');
          child.style.removeProperty('textDecoration');
        }
        if (!value && (child.tagName === 'S' || child.tagName === 'STRIKE' || child.tagName === 'DEL')) {
          const parent = child.parentNode;
          if (parent) {
            while (child.firstChild) {
              parent.insertBefore(child.firstChild, child);
            }
            parent.removeChild(child);
          }
        }
      });
    } else if (property === 'fontSize') {
      all.forEach((child) => {
        if (child.style) {
          child.style.removeProperty('font-size');
          child.style.removeProperty('fontSize');
        }
        child.removeAttribute('data-size');
        child.removeAttribute('data-orig-size');
      });
    }

    return el.innerHTML;
  };

  const handleToggleBold = (itemId: string) => {
    const { el, hasSelection } = ensureSelectionRestored(itemId);
    if (!el) return;

    if (hasSelection) {
      document.execCommand('bold', false);
      const updatedHtml = el.innerHTML;
      onUpdateText(itemId, { text: updatedHtml });
    } else {
      const item = freeTexts.find((t) => t.id === itemId);
      const nextBold = !item?.isBold;
      const updatedHtml = applyWholeBlockFormatting(el, 'bold', nextBold);
      onUpdateText(itemId, { isBold: nextBold, text: updatedHtml });
    }
    setTimeout(refreshSelectionFormat, 10);
  };

  const handleToggleItalic = (itemId: string) => {
    const { el, hasSelection } = ensureSelectionRestored(itemId);
    if (!el) return;

    if (hasSelection) {
      document.execCommand('italic', false);
      const updatedHtml = el.innerHTML;
      onUpdateText(itemId, { text: updatedHtml });
    } else {
      const item = freeTexts.find((t) => t.id === itemId);
      const nextItalic = !item?.isItalic;
      const updatedHtml = applyWholeBlockFormatting(el, 'italic', nextItalic);
      onUpdateText(itemId, { isItalic: nextItalic, text: updatedHtml });
    }
    setTimeout(refreshSelectionFormat, 10);
  };

  const handleToggleUnderline = (itemId: string) => {
    const { el, hasSelection } = ensureSelectionRestored(itemId);
    if (!el) return;

    if (hasSelection) {
      document.execCommand('underline', false);
      const updatedHtml = el.innerHTML;
      onUpdateText(itemId, { text: updatedHtml });
    } else {
      const item = freeTexts.find((t) => t.id === itemId);
      const nextUnderline = !item?.isUnderline;
      const updatedHtml = applyWholeBlockFormatting(el, 'underline', nextUnderline);
      onUpdateText(itemId, { isUnderline: nextUnderline, text: updatedHtml });
    }
    setTimeout(refreshSelectionFormat, 10);
  };

  const handleToggleStrikethrough = (itemId: string) => {
    const { el, hasSelection } = ensureSelectionRestored(itemId);
    if (!el) return;

    if (hasSelection) {
      document.execCommand('strikeThrough', false);
      const updatedHtml = el.innerHTML;
      onUpdateText(itemId, { text: updatedHtml });
    } else {
      const item = freeTexts.find((t) => t.id === itemId);
      const nextStrikethrough = !item?.isStrikethrough;
      const updatedHtml = applyWholeBlockFormatting(el, 'strikethrough', nextStrikethrough);
      onUpdateText(itemId, { isStrikethrough: nextStrikethrough, text: updatedHtml });
    }
    setTimeout(refreshSelectionFormat, 10);
  };

  const handleApplyTextColor = (itemId: string, color: string) => {
    const { el, hasSelection } = ensureSelectionRestored(itemId);
    if (!el) return;

    if (hasSelection) {
      document.execCommand('foreColor', false, color);

      // If selection was inside or wrapped a .ft-font-size-span, sync color directly to that span
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        let n: Node | null = range.commonAncestorContainer;
        while (n && n !== el) {
          if ((n as HTMLElement).classList?.contains('ft-font-size-span')) {
            (n as HTMLElement).style.color = color;
            break;
          }
          n = n.parentElement;
        }
      }

      // Also sync any font[color] that wraps or is inside .ft-font-size-span
      el.querySelectorAll('font[color]').forEach((fNode) => {
        const f = fNode as HTMLElement;
        const c = f.getAttribute('color') || f.style.color;
        if (c) {
          f.querySelectorAll('.ft-font-size-span').forEach((sNode) => {
            (sNode as HTMLElement).style.color = c;
          });
        }
      });

      const updatedHtml = el.innerHTML;
      onUpdateText(itemId, { text: updatedHtml });
    } else {
      const updatedHtml = applyWholeBlockFormatting(el, 'color', color);
      onUpdateText(itemId, { color, text: updatedHtml });
    }
    setTimeout(refreshSelectionFormat, 10);
  };

  const handleApplyBgColor = (itemId: string, color: string) => {
    const { el, hasSelection } = ensureSelectionRestored(itemId);
    if (!el) return;

    if (hasSelection) {
      if (color === 'transparent') {
        document.execCommand('hiliteColor', false, 'transparent');
      } else {
        document.execCommand('hiliteColor', false, color);
      }

      // If any .ft-font-size-span was wrapped by <mark> or has background applied, sync directly
      el.querySelectorAll('.ft-font-size-span').forEach((sNode) => {
        const s = sNode as HTMLElement;
        const p = s.parentElement;
        if (p && p.tagName === 'MARK') {
          const markBg = p.style.backgroundColor || (color === 'transparent' ? 'transparent' : color);
          s.style.backgroundColor = color === 'transparent' ? 'transparent' : markBg;
          if ((p.innerText || '').trim() === (s.innerText || '').trim() || p.childNodes.length === 1) {
            p.parentNode?.replaceChild(s, p);
          }
        }
      });

      // Also if selection was entirely within a .ft-font-size-span or contains .ft-font-size-span:
      // ensure its backgroundColor is set directly
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        let n: Node | null = range.commonAncestorContainer;
        while (n && n !== el) {
          if ((n as HTMLElement).classList?.contains('ft-font-size-span')) {
            (n as HTMLElement).style.backgroundColor = color === 'transparent' ? 'transparent' : color;
            break;
          }
          n = n.parentElement;
        }
      }

      const updatedHtml = el.innerHTML;
      onUpdateText(itemId, { text: updatedHtml });
    } else {
      const updatedHtml = applyWholeBlockFormatting(el, 'bgColor', color);
      onUpdateText(itemId, { bgColor: color, text: updatedHtml });
    }
    setTimeout(refreshSelectionFormat, 10);
  };

  const handleApplyFontSize = (itemId: string, size: number) => {
    const item = freeTexts.find((t) => t.id === itemId);
    if (!item) return;

    const { el, sel, hasSelection } = ensureSelectionRestored(itemId);
    if (!el) return;

    if (hasSelection && sel && sel.rangeCount > 0) {
      const fullText = (el.innerText || el.textContent || '').trim();
      const selectedText = sel.toString().trim();
      const isSelectingEntireContent = fullText.length > 0 && selectedText.length === fullText.length;

      if (isSelectingEntireContent) {
        // User selected the entire block's text: update base fontSize and clean inner redundant spans
        const updatedHtml = applyWholeBlockFormatting(el, 'fontSize', size);
        onUpdateText(itemId, { fontSize: size, text: updatedHtml });

        // Maintain full selection
        const newRange = document.createRange();
        newRange.selectNodeContents(el);
        sel.removeAllRanges();
        sel.addRange(newRange);
        savedRangeRef.current = { itemId, range: newRange.cloneRange() };
        setSavedRange(newRange.cloneRange());
        savedOffsetsRef.current = { itemId, start: 0, end: fullText.length, text: selectedText };
        setTimeout(refreshSelectionFormat, 10);
        return;
      }

      // Partial selection: change ONLY the selected text!
      const range = sel.getRangeAt(0);
      let detectedColor: string | null = null;
      let detectedBgColor: string | null = null;

      // 1. Inspect selection start container ancestor chain up to el
      let currNode: Node | null = range.startContainer.nodeType === Node.TEXT_NODE
        ? range.startContainer.parentElement
        : range.startContainer;
      while (currNode && currNode !== el) {
        const elem = currNode as HTMLElement;
        if (!detectedColor) {
          if (elem.style?.color) {
            detectedColor = elem.style.color;
          } else if (elem.getAttribute && elem.getAttribute('color')) {
            detectedColor = elem.getAttribute('color');
          }
        }
        if (!detectedBgColor) {
          if (elem.tagName === 'MARK') {
            detectedBgColor = elem.style?.backgroundColor || '#FEF08A';
          } else if (elem.style?.backgroundColor && elem.style.backgroundColor !== 'transparent') {
            detectedBgColor = elem.style.backgroundColor;
          }
        }
        currNode = currNode.parentElement;
      }

      // 2. Also inspect cloned fragment if color or mark was inside a child element of range
      try {
        const clone = range.cloneContents();
        const fontWithColor = clone.querySelector('font[color]') as HTMLElement | null;
        if (fontWithColor && !detectedColor) {
          detectedColor = fontWithColor.getAttribute('color') || fontWithColor.style.color;
        }
        const spanWithColor = clone.querySelector('[style*="color"]') as HTMLElement | null;
        if (spanWithColor && !detectedColor && spanWithColor.style.color) {
          detectedColor = spanWithColor.style.color;
        }
        const markOrBg = clone.querySelector('mark, [style*="background"]') as HTMLElement | null;
        if (markOrBg && !detectedBgColor) {
          detectedBgColor = markOrBg.style?.backgroundColor || (markOrBg.tagName === 'MARK' ? '#FEF08A' : null);
        }
      } catch (_) {}

      document.execCommand('styleWithCSS', false, 'false');
      document.execCommand('fontSize', false, '7');

      const targetFonts = Array.from(el.querySelectorAll<HTMLElement>('font[size="7"], font[size]'));
      const createdSpans: HTMLElement[] = [];

      if (targetFonts.length > 0) {
        targetFonts.forEach((fontEl) => {
          // Detect text color on fontEl itself, inner elements, or ancestors
          const fontColor = fontEl.getAttribute('color') || fontEl.style.color;
          let innerColor: string | null = null;
          const innerColorEl = fontEl.querySelector('[color], [style*="color"]') as HTMLElement | null;
          if (innerColorEl) {
            innerColor = innerColorEl.getAttribute('color') || innerColorEl.style.color;
          }
          const finalColor = fontColor || innerColor || detectedColor;

          // Detect background color on fontEl, parent mark, or ancestors
          let fontBg = fontEl.style.backgroundColor;
          let parentBg: string | null = null;
          let parentMarkOrBg: HTMLElement | null = null;
          let p = fontEl.parentElement;
          while (p && p !== el) {
            if (p.tagName === 'MARK' || (p.style && p.style.backgroundColor && p.style.backgroundColor !== 'transparent')) {
              parentBg = p.style.backgroundColor || (p.tagName === 'MARK' ? '#FEF08A' : null);
              parentMarkOrBg = p;
              break;
            }
            p = p.parentElement;
          }
          const finalBg = fontBg || parentBg || detectedBgColor;

          fontEl.querySelectorAll('*').forEach((child) => {
            const htmlChild = child as HTMLElement;
            if (htmlChild.style) htmlChild.style.removeProperty('font-size');
            htmlChild.removeAttribute('data-size');
          });

          const span = document.createElement('span');
          span.setAttribute('data-size', size.toString());
          span.style.fontSize = `calc(var(--ft-scale, 1) * ${size}px)`;
          span.style.lineHeight = '1.34';
          span.className = 'ft-font-size-span';
          span.style.display = 'inline';

          // Preserve text color
          if (finalColor) {
            span.style.color = finalColor;
          }

          // Preserve background color at full font size height
          if (finalBg && finalBg !== 'transparent') {
            span.style.backgroundColor = finalBg;
          }

          while (fontEl.firstChild) {
            span.appendChild(fontEl.firstChild);
          }

          // If parent is a <mark> or bg-wrapper that only contains this fontEl (or selection), unwrap it
          if (parentMarkOrBg && parentMarkOrBg.parentNode) {
            const parentText = (parentMarkOrBg.innerText || parentMarkOrBg.textContent || '').trim();
            const fontText = (span.innerText || span.textContent || '').trim();
            if (parentText === fontText || parentMarkOrBg.children.length <= 1) {
              parentMarkOrBg.parentNode.replaceChild(span, parentMarkOrBg);
              createdSpans.push(span);
              return;
            }
          }

          fontEl.parentNode?.replaceChild(span, fontEl);
          createdSpans.push(span);
        });
      } else {
        // Fallback using range extraction
        try {
          const r = sel.getRangeAt(0);
          if (r && !r.collapsed) {
            const span = document.createElement('span');
            span.setAttribute('data-size', size.toString());
            span.style.fontSize = `calc(var(--ft-scale, 1) * ${size}px)`;
            span.style.lineHeight = '1.34';
            span.className = 'ft-font-size-span';
            span.style.display = 'inline';

            if (detectedColor) {
              span.style.color = detectedColor;
            }
            if (detectedBgColor && detectedBgColor !== 'transparent') {
              span.style.backgroundColor = detectedBgColor;
            }

            const fragment = r.extractContents();
            fragment.querySelectorAll?.('*').forEach((child: any) => {
              if (child.style) child.style.removeProperty('font-size');
              child.removeAttribute?.('data-size');
            });
            span.appendChild(fragment);
            r.insertNode(span);
            createdSpans.push(span);
          }
        } catch (_) {}
      }

      // Clean up any redundant wrapper <mark> around .ft-font-size-span
      el.querySelectorAll('.ft-font-size-span').forEach((sNode) => {
        const s = sNode as HTMLElement;
        const p = s.parentElement;
        if (p && p.tagName === 'MARK') {
          const markBg = p.style.backgroundColor || '#FEF08A';
          if (!s.style.backgroundColor || s.style.backgroundColor === 'transparent') {
            s.style.backgroundColor = markBg;
          }
          if ((p.innerText || '').trim() === (s.innerText || '').trim() || p.childNodes.length === 1) {
            p.parentNode?.replaceChild(s, p);
          }
        }
      });

      // Collapse redundant nested .ft-font-size-span inside .ft-font-size-span
      el.querySelectorAll('.ft-font-size-span .ft-font-size-span').forEach((innerSpanNode) => {
        const innerSpan = innerSpanNode as HTMLElement;
        const outerSpan = innerSpan.parentElement as HTMLElement;
        if (outerSpan && outerSpan.classList.contains('ft-font-size-span')) {
          if (outerSpan.childNodes.length === 1 || outerSpan.innerText.trim() === innerSpan.innerText.trim()) {
            if (!innerSpan.style.color && outerSpan.style.color) {
              innerSpan.style.color = outerSpan.style.color;
            }
            if (!innerSpan.style.backgroundColor && outerSpan.style.backgroundColor) {
              innerSpan.style.backgroundColor = outerSpan.style.backgroundColor;
            }
            outerSpan.parentNode?.replaceChild(innerSpan, outerSpan);
          }
        }
      });

      // Recalculate line heights and container font size to eliminate phantom line gaps
      const newBaseSize = recalculateBlockLayout(el, item.fontSize || 16);

      // Re-select the newly styled span(s) so selection is maintained
      if (createdSpans.length > 0) {
        try {
          const newRange = document.createRange();
          newRange.setStartBefore(createdSpans[0]);
          newRange.setEndAfter(createdSpans[createdSpans.length - 1]);
          sel.removeAllRanges();
          sel.addRange(newRange);

          savedRangeRef.current = { itemId, range: newRange.cloneRange() };
          setSavedRange(newRange.cloneRange());
          const offsets = getSelectionOffsets(el, newRange);
          if (offsets) {
            savedOffsetsRef.current = { itemId, ...offsets, text: sel.toString() };
          }
        } catch (_) {}
      }

      const updatedHtml = el.innerHTML;
      onUpdateText(itemId, { text: updatedHtml });
      setTimeout(refreshSelectionFormat, 10);
    } else {
      // Whole block selected: update base fontSize and synchronize inner spans
      const updatedHtml = applyWholeBlockFormatting(el, 'fontSize', size);
      onUpdateText(itemId, { fontSize: size, text: updatedHtml });
      setTimeout(refreshSelectionFormat, 10);
    }
  };

  const applyFormatCommand = (itemId: string, command: string, value: string | undefined = undefined) => {
    const el = document.getElementById(`editable-${itemId}`);
    if (el) {
      ensureSelectionRestored(itemId);
      document.execCommand(command, false, value);
      const updatedHtml = el.innerHTML;
      onUpdateText(itemId, { text: updatedHtml });
    }
  };

  const toggleListFormat = (itemId: string, type: 'ol' | 'ul') => {
    const item = freeTexts.find((t) => t.id === itemId);
    if (!item) return;
    const el = document.getElementById(`editable-${itemId}`);
    const currentHtml = el ? el.innerHTML : (item.text || '');

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = currentHtml;

    const existingList = tempDiv.querySelector(type);

    if (existingList) {
      // If already in this list type, toggle it off to normal paragraphs/lines
      const lis = tempDiv.querySelectorAll('li');
      let plainLines: string[] = [];
      if (lis.length > 0) {
        lis.forEach((li) => {
          const content = li.innerHTML.trim();
          if (content) plainLines.push(content);
        });
      } else {
        const text = (tempDiv.innerText || tempDiv.textContent || '').trim();
        if (text) plainLines.push(text);
      }
      const newHtml = plainLines.join('<br>') || '';
      if (el) el.innerHTML = newHtml;
      onUpdateText(itemId, { text: newHtml });
      return;
    }

    // Otherwise, convert lines/content to the specified list type
    let lines: string[] = [];
    const otherLis = tempDiv.querySelectorAll('li');
    if (otherLis.length > 0) {
      otherLis.forEach((li) => {
        const content = li.innerHTML.trim();
        if (content) lines.push(content);
      });
    } else {
      // Split by block tags or linebreaks
      const rawFormatted = currentHtml
        .replace(/<\/?(p|div|h[1-6]|blockquote)[^>]*>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n');
      const parserDiv = document.createElement('div');
      parserDiv.innerHTML = rawFormatted;
      const rawText = parserDiv.innerText || parserDiv.textContent || '';
      const splitLines = rawText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
      lines = splitLines;
    }

    if (lines.length === 0) {
      const raw = (tempDiv.innerText || tempDiv.textContent || '').trim();
      if (raw) lines = [raw];
      else lines = ['Mục 1'];
    }

    const listTag = type;
    const listItemsHtml = lines.map((line) => `<li>${line}</li>`).join('');
    const newHtml = `<${listTag}>${listItemsHtml}</${listTag}>`;

    if (el) el.innerHTML = newHtml;
    onUpdateText(itemId, { text: newHtml });
  };

  const removeListFormat = (itemId: string) => {
    const item = freeTexts.find((t) => t.id === itemId);
    if (!item) return;
    const el = document.getElementById(`editable-${itemId}`);
    const currentHtml = el ? el.innerHTML : (item.text || '');
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = currentHtml;

    const lis = tempDiv.querySelectorAll('li');
    let newHtml = '';
    if (lis.length > 0) {
      const lines: string[] = [];
      lis.forEach((li) => {
        const content = li.innerHTML.trim();
        if (content) lines.push(content);
      });
      newHtml = lines.join('<br>');
    } else {
      newHtml = (tempDiv.innerText || tempDiv.textContent || '').replace(/\n/g, '<br>');
    }
    if (!newHtml.trim()) {
      newHtml = (tempDiv.textContent || '').trim();
    }
    if (el) el.innerHTML = newHtml;
    onUpdateText(itemId, {
      text: newHtml,
      isBold: false,
      isItalic: false,
      isUnderline: false,
      isStrikethrough: false,
    });
  };

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isTextToolActive || !containerRef.current) return;
    if ((e.target as HTMLElement).closest('.free-text-item-container')) return;

    if (globalJustDeactivated) {
      globalJustDeactivated = false;
      return;
    }

    // First delete any empty text items on this page
    pageTexts.forEach((item) => {
      const cleanText = (item.text || '').replace(/<[^>]*>/g, '').trim();
      if (!cleanText) {
        onDeleteText(item.id);
      }
    });

    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    const newId = `text_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    onAddText({
      id: newId,
      pageNumber,
      x,
      y,
      text: '',
      fontSize: 16,
      color: '#1D2129',
      opacity: 1,
      bgColor: 'transparent',
      bgOpacity: 1,
      isBold: false,
      isItalic: false,
      isUnderline: false,
      isStrikethrough: false,
      textAlign: 'left',
      shape: 'text',
      isLocked: false,
    });

    setActiveTextId(newId);
    setEditingTextId(newId);
    setActivePopup(null);
    savedRangeRef.current = null;
    savedOffsetsRef.current = null;
    setSavedRange(null);
  };

  // Pointer move handler (drag, resize, rotate) with RAF batching
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();

    if (dragRef.current) {
      const { id, startPointerX, startPointerY, startX, startY, isAltGhost } = dragRef.current;
      const dist = Math.hypot(e.clientX - startPointerX, e.clientY - startPointerY);
      if (dist > 3) {
        if (!dragRef.current.hasMoved) {
          dragRef.current.hasMoved = true;
          if (!(dragRef.current as any).historyRecorded && !isAltGhost) {
            (dragRef.current as any).historyRecorded = true;
            window.dispatchEvent(new CustomEvent('app-record-history'));
            const currentSelected = selectedIdsRef.current;
            if (currentSelected && currentSelected.length > 1 && currentSelected.includes(id)) {
              window.dispatchEvent(new CustomEvent('batch-translate-start'));
            }
          }
        }
        justDraggedRef.current = true;
        setActiveLinkCard(null);
      }
      document.body.style.cursor = isAltGhost ? 'copy' : 'grabbing';

      const dx = ((e.clientX - startPointerX) / rect.width) * 100;
      const dy = ((e.clientY - startPointerY) / rect.height) * 100;

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        if (isAltGhost && altGhostRef.current) {
          setAltGhost({ ...altGhostRef.current, x: startX + dx, y: startY + dy });
        } else {
          onUpdateText(id, { x: startX + dx, y: startY + dy }, true);
          const currentSelected = selectedIdsRef.current;
          if (currentSelected && currentSelected.length > 1 && currentSelected.includes(id)) {
            const lastDx = (dragRef.current as any)?.lastDispatchedDx || 0;
            const lastDy = (dragRef.current as any)?.lastDispatchedDy || 0;
            const stepDx = dx - lastDx;
            const stepDy = dy - lastDy;
            if (dragRef.current) {
              (dragRef.current as any).lastDispatchedDx = dx;
              (dragRef.current as any).lastDispatchedDy = dy;
            }
            window.dispatchEvent(new CustomEvent('batch-translate', {
              detail: { leaderId: id, dxPct: stepDx, dyPct: stepDy }
            }));
          }
          updateSmartPosition();
        }
      });
    }

    if (resizeRef.current) {
      if (!(resizeRef.current as any).historyRecorded) {
        (resizeRef.current as any).historyRecorded = true;
        window.dispatchEvent(new CustomEvent('app-record-history'));
      }
      const { id, handle, startPointerX, startPointerY, startWidth, startHeight, startLeft, startTop, startFontSize, startItemWidth, startHtml } = resizeRef.current;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const dxPx = e.clientX - startPointerX;
        const dyPx = e.clientY - startPointerY;
        const dxPct = (dxPx / rect.width) * 100;
        const dyPct = (dyPx / rect.height) * 100;

        // 1. Left / Right middle handles: stretch/shrink width to rewrap text
        if (handle === 'e') {
          const maxAllowedW = Math.max(2, 100 - startLeft);
          const newW = Math.min(maxAllowedW, Math.max(2, startWidth + dxPct));
          onUpdateText(id, { width: newW }, true);
          return;
        }
        if (handle === 'w') {
          const maxAllowedDx = startLeft + startWidth - 2;
          const clampedDx = Math.min(maxAllowedDx, Math.max(-startLeft, dxPct));
          const newW = Math.max(2, startWidth - clampedDx);
          const newX = Math.max(0, startLeft + (startWidth - newW));
          onUpdateText(id, { x: newX, width: newW }, true);
          return;
        }

        // 2. 4-Corner handles: scale font size and container proportionally with no arbitrary limits
        const baseW = Math.max(startWidth, 1.5);
        const baseH = Math.max(startHeight, 1.5);

        let deltaRatio = 0;
        if (handle === 'se') {
          deltaRatio = (dxPct / baseW + dyPct / baseH) / 2;
        } else if (handle === 'sw') {
          deltaRatio = (-dxPct / baseW + dyPct / baseH) / 2;
        } else if (handle === 'ne') {
          deltaRatio = (dxPct / baseW - dyPct / baseH) / 2;
        } else if (handle === 'nw') {
          deltaRatio = (-dxPct / baseW - dyPct / baseH) / 2;
        }

        const resizeFactor = Math.max(0.04, Math.min(50, 1 + deltaRatio));
        const newFontSize = Math.max(3, Math.min(500, Math.round(startFontSize * resizeFactor)));

        const updatedText = startHtml ? scaleHtmlTextSizes(startHtml, resizeFactor) : undefined;

        const updates: Partial<FreeTextAnnotation> = {
          fontSize: newFontSize,
        };
        if (updatedText && updatedText !== startHtml) {
          updates.text = updatedText;
        }

        if (handle === 'se') {
          if (startItemWidth) {
            updates.width = Math.max(2, startItemWidth * resizeFactor);
          }
        } else if (handle === 'sw') {
          updates.x = startLeft + startWidth * (1 - resizeFactor);
          if (startItemWidth) {
            updates.width = Math.max(2, startItemWidth * resizeFactor);
          }
        } else if (handle === 'ne') {
          updates.y = startTop + startHeight * (1 - resizeFactor);
          if (startItemWidth) {
            updates.width = Math.max(2, startItemWidth * resizeFactor);
          }
        } else if (handle === 'nw') {
          updates.x = startLeft + startWidth * (1 - resizeFactor);
          updates.y = startTop + startHeight * (1 - resizeFactor);
          if (startItemWidth) {
            updates.width = Math.max(2, startItemWidth * resizeFactor);
          }
        }

        // Direct DOM update in current frame for instant responsiveness
        const editableEl = document.getElementById(`editable-${id}`);
        if (editableEl) {
          editableEl.style.fontSize = `${newFontSize * (scale || 1)}px`;
          if (updatedText && editableEl.innerHTML !== updatedText) {
            editableEl.innerHTML = updatedText;
          }
        }
        const wrapperEl = document.getElementById(`freetext-${id}`);
        if (wrapperEl) {
          if (updates.x !== undefined) wrapperEl.style.left = `${updates.x}%`;
          if (updates.y !== undefined) wrapperEl.style.top = `${updates.y}%`;
          if (updates.width !== undefined) wrapperEl.style.width = `${updates.width}%`;
        }

        onUpdateText(id, updates, true);
        updateSmartPosition();
      });
    }

    if (rotateRef.current) {
      if (!(rotateRef.current as any).historyRecorded) {
        (rotateRef.current as any).historyRecorded = true;
        window.dispatchEvent(new CustomEvent('app-record-history'));
      }
      const { id, centerX, centerY, initialPointerAngle, initialRotation } = rotateRef.current;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const dx = e.clientX - centerX;
        const dy = e.clientY - centerY;
        let pointerAngle = Math.atan2(dy, dx) * (180 / Math.PI);
        let angle = initialRotation + (pointerAngle - initialPointerAngle);
        let snapped = false;

        if (e.shiftKey) {
          angle = Math.round(angle / 15) * 15;
          snapped = true;
        } else {
          // Smart angle snapping (±5 degrees) for 0 degrees
          const normalized = ((angle % 360) + 360) % 360;
          const snapThreshold = 5;
          
          if (normalized <= snapThreshold || normalized >= 360 - snapThreshold) {
            angle = angle - (normalized > 180 ? normalized - 360 : normalized);
            snapped = true;
          }
        }
        
        setRotatingAngle({ id, angle, snapped });
        onUpdateText(id, { rotation: angle }, true);
      });
    }
  };

  const endPointerGesture = (e: React.PointerEvent) => {
    setIsGesturing(false);
    document.body.style.cursor = '';

    if (dragRef.current) {
      const { id, hasMoved, wasAlreadySelected, isAltGhost } = dragRef.current;

      if (isAltGhost && altGhostRef.current) {
        const ghost = altGhostRef.current;
        const ghostEl = document.getElementById(`freetext-${ghost.id}`);
        let targetPage = ghost.pageNumber || pageNumber;
        let finalX = ghost.x;
        let finalY = ghost.y;
        if (ghostEl) {
          const rect = ghostEl.getBoundingClientRect();
          const match = findBestMatchingPage(rect, targetPage, ghost.width || 0, ghost.height || 0, fileId);
          if (match) {
            targetPage = match.targetPage;
            finalX = match.relXPct;
            finalY = match.relYPct;
          }
        }
        onAddText({
          ...ghost,
          pageNumber: targetPage,
          x: finalX,
          y: finalY,
        });
        setAltGhost(null);
        setActiveTextId(id);
        if (onSelect) onSelect(id, false);
        resetPageZIndex(targetPage, fileId);
        resetPageZIndex(undefined, fileId);
        dragRef.current = null;
        return;
      }

      if (hasMoved) {
        justDraggedRef.current = true;
        setTimeout(() => {
          justDraggedRef.current = false;
        }, 150);
      }
      const item = freeTexts.find((t) => t.id === id);
      const startX = dragRef.current.startX;
      const startY = dragRef.current.startY;
      const startPage = (dragRef.current as any).startPage ?? (item?.pageNumber || pageNumber);
      const historyRecorded = (dragRef.current as any).historyRecorded;

      if (item && hasMoved) {
        let finalPage = item.pageNumber;
        let finalX = item.x;
        let finalY = item.y;
        const draggedEl = document.getElementById(`freetext-${id}`);
        if (draggedEl) {
          const draggedRect = draggedEl.getBoundingClientRect();
          const match = findBestMatchingPage(draggedRect, item.pageNumber, item.width || 0, item.height || 0, fileId);
          if (match) {
            finalPage = match.targetPage;
            finalX = match.relXPct;
            finalY = match.relYPct;
          }
        }

        const distMoved = Math.hypot(finalX - startX, finalY - startY);
        const didActuallyMove = (finalPage !== startPage) || distMoved > 0.05;

        if (!didActuallyMove) {
          if (historyRecorded) {
            window.dispatchEvent(new CustomEvent('app-pop-history'));
          }
          onUpdateText(id, { pageNumber: startPage, x: startX, y: startY }, true);
        } else {
          onUpdateText(id, {
            pageNumber: finalPage,
            x: finalX,
            y: finalY,
          }, true);
        }

        const currentSelected = selectedIdsRef.current;
        if (currentSelected && currentSelected.length > 1 && currentSelected.includes(id)) {
          window.dispatchEvent(new CustomEvent('batch-translate-commit', { detail: { leaderId: id } }));
        }
      }

      if (!hasMoved) {
        const isFrameClick = (dragRef.current as any)?.isFrameClick;
        if (!isFrameClick && wasAlreadySelected && editingTextId !== id && !e.shiftKey) {
          // Click 2 directly on text content when box was already selected: Enter Edit Mode!
          setEditingTextId(id);
        } else if (!e.shiftKey) {
          const currentSelected = selectedIdsRef.current;
          if (currentSelected && currentSelected.length > 1 && currentSelected.includes(id)) {
            if (onSelect) onSelect(id, false);
          }
        }
      }
      resetPageZIndex(item?.pageNumber || pageNumber, fileId);
      resetPageZIndex(undefined, fileId);
      dragRef.current = null;
    }

    if (resizeRef.current) {
      const { id } = resizeRef.current;
      const editableEl = document.getElementById(`editable-${id}`);
      const rawHtml = editableEl ? editableEl.innerHTML : (freeTexts.find((t) => t.id === id)?.text || '');
      if (rawHtml && rawHtml.includes('data-orig-size')) {
        const cleanedHtml = rawHtml.replace(/\s*data-orig-size="[^"]*"/g, '');
        if (editableEl) editableEl.innerHTML = cleanedHtml;
        onUpdateText(id, { text: cleanedHtml }, true);
      }
      resetPageZIndex(pageNumber, fileId);
      resetPageZIndex(undefined, fileId);
      resizeRef.current = null;
    }

    if (rotateRef.current) {
      resetPageZIndex(pageNumber, fileId);
      resetPageZIndex(undefined, fileId);
      rotateRef.current = null;
      setRotatingAngle(null);
    }
  };

  const startResizePointer = (e: React.PointerEvent, item: FreeTextAnnotation, handle: string) => {
    if (item.isLocked) return;
    e.stopPropagation();
    if (!containerRef.current) return;
    const el = document.getElementById(`freetext-${item.id}`);
    if (!el) return;

    // Clear any text selection and ensure whole-block mode
    const sel = window.getSelection();
    if (sel) {
      try {
        sel.removeAllRanges();
      } catch (_) {}
    }
    if (savedRangeRef.current?.itemId === item.id) {
      savedRangeRef.current = null;
    }
    if (savedOffsetsRef.current?.itemId === item.id) {
      savedOffsetsRef.current = null;
    }
    setSavedRange(null);
    setEditingTextId(null);
    setActiveTextId(item.id);

    elevatePageZIndex(item.pageNumber || pageNumber, fileId);

    const rect = containerRef.current.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const editableEl = document.getElementById(`editable-${item.id}`);
    let startHtml = editableEl ? editableEl.innerHTML : (item.text || '');

    if (startHtml) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = startHtml;
      const styledEls = tempDiv.querySelectorAll<HTMLElement>(
        '[data-size], [style*="font-size"], font[size]'
      );
      styledEls.forEach((styledEl) => {
        const size = getElementBaseFontSize(styledEl);
        if (size && size > 0) {
          styledEl.setAttribute('data-orig-size', size.toString());
        }
      });
      startHtml = tempDiv.innerHTML;
    }

    setIsGesturing(true);
    setActiveLinkCard(null);
    resizeRef.current = {
      id: item.id,
      handle,
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      startWidth: (elRect.width / rect.width) * 100,
      startHeight: (elRect.height / rect.height) * 100,
      startLeft: item.x,
      startTop: item.y,
      startFontSize: item.fontSize || 16,
      startItemWidth: item.width,
      startHtml,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const startRotatePointer = (e: React.PointerEvent, item: FreeTextAnnotation) => {
    if (item.isLocked) return;
    e.stopPropagation();
    const el = document.getElementById(`freetext-${item.id}`);
    if (!el) return;

    // Clear any text selection and ensure whole-block mode
    const sel = window.getSelection();
    if (sel) {
      try {
        sel.removeAllRanges();
      } catch (_) {}
    }
    if (savedRangeRef.current?.itemId === item.id) {
      savedRangeRef.current = null;
    }
    if (savedOffsetsRef.current?.itemId === item.id) {
      savedOffsetsRef.current = null;
    }
    setSavedRange(null);
    setEditingTextId(null);
    setActiveTextId(item.id);

    elevatePageZIndex(item.pageNumber || pageNumber, fileId);

    const elRect = el.getBoundingClientRect();
    const centerX = elRect.left + elRect.width / 2;
    const centerY = elRect.top + elRect.height / 2;

    const initialPointerAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
    const initialRotation = item.rotation || 0;

    setIsGesturing(true);
    setActiveLinkCard(null);
    rotateRef.current = {
      id: item.id,
      centerX,
      centerY,
      initialPointerAngle,
      initialRotation,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleSelectWholeBlock = (e: React.PointerEvent, item: FreeTextAnnotation) => {
    e.stopPropagation();
    // 1. Clear active DOM text selection
    const sel = window.getSelection();
    if (sel) {
      try {
        sel.removeAllRanges();
      } catch (_) {}
    }
    // 2. Clear all saved selection states and refs
    if (savedRangeRef.current?.itemId === item.id) {
      savedRangeRef.current = null;
    }
    if (savedOffsetsRef.current?.itemId === item.id) {
      savedOffsetsRef.current = null;
    }
    setSavedRange(null);

    // 3. Switch to whole-block selection mode
    setEditingTextId(null);
    setActiveTextId(item.id);
    if (onSelect) {
      onSelect(item.id, false);
    }
    setActivePopup(null);

    // 4. Delegate to startDragPointer with isFrameClick = true
    startDragPointer(e, item, true);
  };

  const startDragPointer = (e: React.PointerEvent, item: FreeTextAnnotation, isFrameClick = false) => {
    const target = e.target as HTMLElement;

    // Never hijack clicks on the toolbar, popovers, or submenus
    if (
      target.closest('.ft-toolbar') ||
      target.closest('.ft-link-dialog') ||
      target.closest('.ft-link-card-popover') ||
      target.closest('.ft-rotate-zone') ||
      target.closest('.ft-resize-handle')
    ) {
      return;
    }

    const isInsideEditable = !!target.closest(`#editable-${item.id}`);

    // If click is on the frame, border, background, or outside the text:
    if (!isInsideEditable || isFrameClick) {
      if (editingTextId === item.id) {
        setEditingTextId(null);
        const sel = window.getSelection();
        if (sel) {
          try {
            sel.removeAllRanges();
          } catch (_) {}
        }
        if (savedRangeRef.current?.itemId === item.id) {
          savedRangeRef.current = null;
        }
        if (savedOffsetsRef.current?.itemId === item.id) {
          savedOffsetsRef.current = null;
        }
        setSavedRange(null);
      }
    } else {
      // User clicked directly inside editable text
      if (editingTextId === item.id) {
        return;
      }
    }

    e.stopPropagation();

    // If item is locked, select it so the locked toolbar (Mở khóa / Xóa) is displayed,
    // but do not allow dragging, resizing, or rotation.
    if (item.isLocked) {
      elevatePageZIndex(item.pageNumber || pageNumber, fileId);
      setActiveTextId(item.id);
      setEditingTextId(null);
      if (onSelect) {
        onSelect(item.id, false);
      }
      setActivePopup(null);
      return;
    }

    // 1. Option (Alt) + Drag -> Quick Duplicate/Clone Text
    if (e.altKey) {
      e.preventDefault();
      const dupId = `text_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const duplicated: FreeTextAnnotation = {
        ...item,
        id: dupId,
        createdAt: Date.now(),
      };
      setAltGhost(duplicated);
      setIsGesturing(true);
      setActiveLinkCard(null);
      dragRef.current = {
        id: dupId,
        startPointerX: e.clientX,
        startPointerY: e.clientY,
        startX: item.x,
        startY: item.y,
        hasMoved: true,
        wasAlreadySelected: false,
        isAltGhost: true,
        isFrameClick,
      };
      document.body.style.cursor = 'copy';
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    // 2. Shift + Click: Multi-selection (strictly hide toolbar for smooth group selecting)
    if (e.shiftKey) {
      if (onSelect) {
        onSelect(item.id, true);
      }
      setActiveTextId(item.id);
      setActivePopup(null);
      setActiveLinkCard(null);
      dragRef.current = {
        id: item.id,
        startPointerX: e.clientX,
        startPointerY: e.clientY,
        startX: item.x,
        startY: item.y,
        hasMoved: false,
        wasAlreadySelected: selectedIdsRef.current ? selectedIdsRef.current.includes(item.id) : activeTextId === item.id,
        isAltGhost: false,
        isFrameClick,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    // 3. Normal Click / Drag
    elevatePageZIndex(item.pageNumber || pageNumber, fileId);
    const currentSelected = selectedIdsRef.current;
    const isMultiSelected = currentSelected && currentSelected.length > 1 && currentSelected.includes(item.id);
    const wasAlreadySelected = currentSelected ? (currentSelected.length === 1 && currentSelected.includes(item.id)) : activeTextId === item.id;
    setActiveTextId(item.id);
    if (!isMultiSelected) {
      if (onSelect) {
        onSelect(item.id, false);
      }
    }
    setActivePopup(null);

    dragRef.current = {
      id: item.id,
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      startX: item.x,
      startY: item.y,
      startPage: item.pageNumber || pageNumber,
      hasMoved: false,
      wasAlreadySelected,
      isAltGhost: false,
      historyRecorded: false,
      isFrameClick,
    } as any;
    document.body.style.cursor = 'grabbing';
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target : (e.target as Node | null)?.parentElement;
      if (!el?.closest?.('.free-text-item-container') && !el?.closest?.('.ft-toolbar') && !el?.closest?.('.unified-group-toolbar') && !el?.closest?.('.floating-submenu')) {
        if (activeTextId) {
          const item = freeTexts.find((t) => t.id === activeTextId);
          if (item) {
            const el = document.getElementById(`editable-${activeTextId}`);
            const textContent = (el?.textContent || el?.innerText || item.text || '').replace(/<[^>]*>/g, '').trim();
            if (textContent === '') {
              onDeleteText(activeTextId);
              setActiveLinkCard(null);
            }
          }
          if (isTextToolActive && onDeactivateTextTool) {
            globalJustDeactivated = true;
            onDeactivateTextTool();
            const clearFlag = () => {
              // Ensure we run after handleContainerClick which is a normal bubble phase listener
              setTimeout(() => { globalJustDeactivated = false; }, 0);
              window.removeEventListener('click', clearFlag, true);
            };
            window.addEventListener('click', clearFlag, true);
          }
        }
        setActiveTextId(null);
        setEditingTextId(null);
        setActivePopup(null);
        savedRangeRef.current = null;
        savedOffsetsRef.current = null;
        setSavedRange(null);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [activeTextId, freeTexts, onDeleteText, isTextToolActive, onDeactivateTextTool]);

  // Keyboard shortcuts for active text item: formatting (Cmd+B/I/U/S) and duplication (Option+drag, Cmd+C/V/D)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInputFocused =
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'INPUT' ||
        target?.isContentEditable;

      const currentSelected = selectedIdsRef.current || [];
      const selectedTexts = freeTexts.filter((t) => currentSelected.includes(t.id));

      // If multiple text blocks are selected, App.tsx handles formatting globally across pages
      if (selectedTexts.length > 1) {
        return;
      }

      const targetId =
        activeTextId ||
        (selectedTexts.length === 1 && pageTexts.some((t) => t.id === selectedTexts[0].id)
          ? selectedTexts[0].id
          : null);

      if (targetId) {
        const item = freeTexts.find((t) => t.id === targetId);
        if (!item) return;

        // Formatting shortcuts with Command or Control
        if (e.metaKey || e.ctrlKey) {
          const key = e.key.toLowerCase();
          if (key === 'b') {
            e.preventDefault();
            handleToggleBold(targetId);
            return;
          } else if (key === 'i') {
            e.preventDefault();
            handleToggleItalic(targetId);
            return;
          } else if (key === 'u') {
            e.preventDefault();
            handleToggleUnderline(targetId);
            return;
          } else if (key === 's') {
            // Command+S triggers Strikethrough (Gạch ngang text)
            e.preventDefault();
            handleToggleStrikethrough(targetId);
            return;
          } else if (key === 'c' && !isInputFocused) {
            // Copy text block
            e.preventDefault();
            copiedItemRef.current = { ...item };
            return;
          } else if (key === 'd' && !isInputFocused) {
            // Quick duplicate
            e.preventDefault();
            const dupId = `text_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            const duplicatedItem: FreeTextAnnotation = {
              ...item,
              id: dupId,
              x: Math.min(85, item.x + 3),
              y: Math.min(85, item.y + 3),
              createdAt: Date.now(),
            };
            onAddText(duplicatedItem);
            setActiveTextId(dupId);
            setEditingTextId(null);
            return;
          }
        }

        if ((e.key === 'Delete' || e.key === 'Backspace') && !isInputFocused) {
          if (currentSelected && currentSelected.length > 1) {
            return;
          }
          onDeleteText(targetId);
          setActiveTextId(null);
          setEditingTextId(null);
          setActiveLinkCard(null);
          return;
        }
      }

      // Paste shortcut: Cmd+V / Ctrl+V for copied annotation items
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v' && !isInputFocused) {
        if (copiedItemRef.current) {
          e.preventDefault();
          const dupId = `text_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
          const duplicatedItem: FreeTextAnnotation = {
            ...copiedItemRef.current,
            id: dupId,
            pageNumber,
            x: Math.min(85, copiedItemRef.current.x + 3),
            y: Math.min(85, copiedItemRef.current.y + 3),
            createdAt: Date.now(),
          };
          onAddText(duplicatedItem);
          setActiveTextId(dupId);
          setEditingTextId(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTextId, freeTexts, onDeleteText, onUpdateText, onAddText, pageNumber]);

  
  useEffect(() => {
    if (activeLinkCard && !freeTexts.some(t => t.id === activeLinkCard.itemId)) {
      setActiveLinkCard(null);
    }
  }, [freeTexts, activeLinkCard]);

  const isMultiSelectedText = Boolean(selectedIds && selectedIds.length > 1);
  const selectedTextsOnPage = pageTexts.filter((t) => selectedIds?.includes(t.id));
  const primaryTextId =
    activeTextId && selectedIds?.includes(activeTextId)
      ? activeTextId
      : (selectedIds && selectedIds.find((id) => pageTexts.some((t) => t.id === id))) || activeTextId;

  return (
    <div
      ref={containerRef}
      onClick={handleContainerClick}
      className={`absolute inset-0 select-none overflow-visible ${
        isGesturing ? 'z-[9999]' : activeTextId ? 'z-[8000]' : 'z-20'
      } ${
        isTextToolActive ? 'cursor-text pointer-events-auto' : 'pointer-events-none'
      }`}
    >
      {pageTexts.map((item) => {
        const isSelected = selectedIds ? selectedIds.includes(item.id) : activeTextId === item.id;
        const isCurrentMulti = Boolean(isMultiSelectedText && selectedIds?.includes(item.id));
        const isPrimaryForToolbar = !isMultiSelectedText || item.id === primaryTextId;

        // Multi-selection mixed state calculations
        const allSameColor = isCurrentMulti
          ? selectedTextsOnPage.every((t) => (t.color || '#1D2129').toUpperCase() === (item.color || '#1D2129').toUpperCase())
          : true;
        const multiGroupColor = allSameColor ? (item.color || '#1D2129') : 'mixed';

        const allSameBg = isCurrentMulti
          ? selectedTextsOnPage.every((t) => (t.bgColor || 'transparent').toLowerCase() === (item.bgColor || 'transparent').toLowerCase())
          : true;
        const multiGroupBgColor = allSameBg ? (item.bgColor || 'transparent') : 'mixed';

        const allSameFontSize = isCurrentMulti
          ? selectedTextsOnPage.every((t) => (t.fontSize || 16) === (item.fontSize || 16))
          : true;
        const multiGroupFontSize = allSameFontSize ? (item.fontSize || 16) : 'mixed';

        const allBold = isCurrentMulti ? selectedTextsOnPage.every((t) => !!t.isBold) : !!item.isBold;
        const allItalic = isCurrentMulti ? selectedTextsOnPage.every((t) => !!t.isItalic) : !!item.isItalic;
        const allUnderline = isCurrentMulti ? selectedTextsOnPage.every((t) => !!t.isUnderline) : !!item.isUnderline;
        const allStrikethrough = isCurrentMulti ? selectedTextsOnPage.every((t) => !!t.isStrikethrough) : !!item.isStrikethrough;
        const allShadow = isCurrentMulti ? selectedTextsOnPage.every((t) => !!t.hasShadow) : !!item.hasShadow;

        const allSameAlign = isCurrentMulti
          ? selectedTextsOnPage.every((t) => (t.textAlign || 'left') === (item.textAlign || 'left'))
          : true;
        const multiGroupAlign = allSameAlign ? (item.textAlign || 'left') : 'mixed';

        const allLocked = isCurrentMulti ? selectedTextsOnPage.every((t) => !!t.isLocked) : !!item.isLocked;

        const baseFontSize = item.fontSize || 16;
        const currentFontSize = Math.max(0.5, baseFontSize * scale);
        // Padding to enclose Vietnamese diacritics and descenders (p, g, y, q, dấu nặng) without excessive blank space at bottom
        const topExtra = Math.max(2, Math.round(currentFontSize * 0.12));
        const bottomExtra = Math.max(1, Math.round(currentFontSize * 0.04));
        const itemCreatedAt = item.createdAt || 0;
        // Priority layering: earlier created element overlays later created ones; interacting block stays on top
        const itemZIndex = isSelected && isGesturing
          ? 9999
          : editingTextId === item.id || isSelected
          ? 8000
          : 50 + (itemCreatedAt % 500);

        // Smart positioning logic: dynamically calculate space relative to Header and viewport
        const isToolbarAbove = smartDirectionMap[item.id] !== undefined ? smartDirectionMap[item.id] : true;

        // Robust width preservation: Never let group dragging or page boundary transfer crush the text box width into a vertical strip
        const isBeingDragged =
          (dragRef.current?.id === item.id) ||
          (isSelected && (isGesturing || (typeof document !== 'undefined' && document.body.classList.contains('is-annotation-gesturing'))));
        const effectiveWidthPct = item.width ? item.width : undefined;

        return (
          <div
            key={item.id}
            id={`freetext-${item.id}`}
            onPointerDown={(e) => startDragPointer(e, item)}
            onPointerMove={handlePointerMove}
            onPointerUp={endPointerGesture}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (!item.isLocked) {
                setActiveTextId(item.id);
                setEditingTextId(item.id);
                elevatePageZIndex(item.pageNumber || pageNumber, fileId);
              }
            }}
            className={`free-text-item-container absolute pointer-events-auto flex flex-col justify-center rounded-none ${
              editingTextId === item.id
                ? 'cursor-text select-text'
                : 'cursor-grab active:cursor-grabbing select-none'
            }`}
            style={{
              left: `${item.x}%`,
              top: `${item.y}%`,
              width: effectiveWidthPct ? `${effectiveWidthPct}%` : 'max-content',
              maxWidth: isBeingDragged ? 'none' : (effectiveWidthPct ? `${effectiveWidthPct}%` : '100%'),
              height: 'auto',
              minHeight: 'fit-content',
              minWidth: '0px',
              transform: item.rotation ? `rotate(${item.rotation}deg)` : undefined,
              transformOrigin: 'center center',
              boxSizing: 'border-box',
              borderRadius: '0px',
              boxShadow: item.hasShadow ? '0px 10px 2px rgba(0,0,0,0.36)' : undefined,
              zIndex: isBeingDragged ? 9999 : itemZIndex,
            }}
          >
            {/* Background Color Fill Layer */}
            <div 
              className="absolute z-0 rounded-none overflow-hidden pointer-events-none"
              style={{
                top: `-${topExtra}px`,
                bottom: `-${bottomExtra}px`,
                left: '0px',
                right: '0px',
                borderRadius: '0px'
              }}
            >
              <ShapeRenderer shape={item.shape || 'text'} bgColor={item.bgColor || 'transparent'} borderColor="transparent" />
            </div>

            {/* Selection Lark-style Border & Handles Layer */}
            {isSelected && (
              <div
                className="absolute -left-0 -right-0 rounded-none pointer-events-none z-20 border border-[#f5c41a]"
                style={{
                  top: `-${topExtra + 1}px`,
                  bottom: `-${bottomExtra + 1}px`,
                  borderRadius: '0px'
                }}
              >
                {/* 4 Interactive border hit zones so clicking on the yellow frame effortlessly selects the whole block */}
                {!item.isLocked && (
                  <>
                    <div
                      className="ft-frame-hit-top absolute -top-[6px] -left-[6px] -right-[6px] h-[12px] pointer-events-auto cursor-grab z-25"
                      onPointerDown={(e) => handleSelectWholeBlock(e, item)}
                      title="Chọn toàn khối văn bản"
                    />
                    <div
                      className="ft-frame-hit-bottom absolute -bottom-[6px] -left-[6px] -right-[6px] h-[12px] pointer-events-auto cursor-grab z-25"
                      onPointerDown={(e) => handleSelectWholeBlock(e, item)}
                      title="Chọn toàn khối văn bản"
                    />
                    <div
                      className="ft-frame-hit-left absolute -left-[6px] -top-[6px] -bottom-[6px] w-[12px] pointer-events-auto cursor-grab z-25"
                      onPointerDown={(e) => handleSelectWholeBlock(e, item)}
                      title="Chọn toàn khối văn bản"
                    />
                    <div
                      className="ft-frame-hit-right absolute -right-[6px] -top-[6px] -bottom-[6px] w-[12px] pointer-events-auto cursor-grab z-25"
                      onPointerDown={(e) => handleSelectWholeBlock(e, item)}
                      title="Chọn toàn khối văn bản"
                    />
                  </>
                )}
                {!item.isLocked && editingTextId !== item.id && (
                  <>
                    {/* 4 Corner Rotate Zones - STRICTLY OUTSIDE the bounding box */}
                    {/* NW Rotate Zone (Strictly in top-left outer quadrant) */}
                    <div
                      className={`ft-rotate-zone absolute -top-[23px] -left-[20px] w-[20px] h-[20px] pointer-events-auto z-30 ${getRotateCursorClass('nw', rotatingAngle?.id === item.id ? rotatingAngle.angle : (item.rotation || 0))}`}
                      onPointerDown={(e) => startRotatePointer(e, item)}
                      title="Xoay văn bản (Kéo để xoay, Shift để snap 15°)"
                    />

                    {/* NE Rotate Zone (Strictly in top-right outer quadrant) */}
                    <div
                      className={`ft-rotate-zone absolute -top-[23px] -right-[20px] w-[20px] h-[20px] pointer-events-auto z-30 ${getRotateCursorClass('ne', rotatingAngle?.id === item.id ? rotatingAngle.angle : (item.rotation || 0))}`}
                      onPointerDown={(e) => startRotatePointer(e, item)}
                      title="Xoay văn bản (Kéo để xoay, Shift để snap 15°)"
                    />

                    {/* SW Rotate Zone (Strictly in bottom-left outer quadrant) */}
                    <div
                      className={`ft-rotate-zone absolute -bottom-[20px] -left-[20px] w-[20px] h-[20px] pointer-events-auto z-30 ${getRotateCursorClass('sw', rotatingAngle?.id === item.id ? rotatingAngle.angle : (item.rotation || 0))}`}
                      onPointerDown={(e) => startRotatePointer(e, item)}
                      title="Xoay văn bản (Kéo để xoay, Shift để snap 15°)"
                    />

                    {/* SE Rotate Zone (Strictly in bottom-right outer quadrant) */}
                    <div
                      className={`ft-rotate-zone absolute -bottom-[20px] -right-[20px] w-[20px] h-[20px] pointer-events-auto z-30 ${getRotateCursorClass('se', rotatingAngle?.id === item.id ? rotatingAngle.angle : (item.rotation || 0))}`}
                      onPointerDown={(e) => startRotatePointer(e, item)}
                      title="Xoay văn bản (Kéo để xoay, Shift để snap 15°)"
                    />

                    {/* 4 Corner Resize Handles - Centered exactly at corner vertices */}
                    <div
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        startResizePointer(e, item, 'nw');
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        onUpdateText(item.id, { width: undefined, fontSize: 16 }, true);
                      }}
                      className="ft-resize-handle absolute -top-[6.5px] -left-[3.5px] w-[7px] h-[7px] bg-white border border-[#f5c41a] rounded-[1px] pointer-events-auto cursor-nwse-resize z-35 shadow-2xs hover:scale-125 transition-transform"
                      title="Co giãn tỷ lệ (NW) / Double-click để Reset"
                    />
                    <div
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        startResizePointer(e, item, 'ne');
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        onUpdateText(item.id, { width: undefined, fontSize: 16 }, true);
                      }}
                      className="ft-resize-handle absolute -top-[6.5px] -right-[3.5px] w-[7px] h-[7px] bg-white border border-[#f5c41a] rounded-[1px] pointer-events-auto cursor-nesw-resize z-35 shadow-2xs hover:scale-125 transition-transform"
                      title="Co giãn tỷ lệ (NE) / Double-click để Reset"
                    />
                    <div
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        startResizePointer(e, item, 'sw');
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        onUpdateText(item.id, { width: undefined, fontSize: 16 }, true);
                      }}
                      className="ft-resize-handle absolute -bottom-[3.5px] -left-[3.5px] w-[7px] h-[7px] bg-white border border-[#f5c41a] rounded-[1px] pointer-events-auto cursor-nesw-resize z-35 shadow-2xs hover:scale-125 transition-transform"
                      title="Co giãn tỷ lệ (SW) / Double-click để Reset"
                    />
                    <div
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        startResizePointer(e, item, 'se');
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        onUpdateText(item.id, { width: undefined, fontSize: 16 }, true);
                      }}
                      className="ft-resize-handle absolute -bottom-[3.5px] -right-[3.5px] w-[7px] h-[7px] bg-white border border-[#f5c41a] rounded-[1px] pointer-events-auto cursor-nwse-resize z-35 shadow-2xs hover:scale-125 transition-transform"
                      title="Co giãn tỷ lệ (SE) / Double-click để Reset"
                    />

                    {/* Left Middle Handle (6x6 Circle) */}
                    <div
                      onPointerDown={(e) => startResizePointer(e, item, 'w')}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        onUpdateText(item.id, { width: undefined }, true);
                      }}
                      className="ft-resize-handle absolute top-1/2 -left-[3px] -translate-y-1/2 w-[6px] h-[6px] bg-[#f5c41a] border border-white rounded-full pointer-events-auto cursor-ew-resize z-35 shadow-2xs hover:scale-125 transition-transform"
                      title="Kéo giãn chiều rộng (TRÁI) / Double-click để Reset"
                    />

                    {/* Right Middle Handle (6x6 Circle) */}
                    <div
                      onPointerDown={(e) => startResizePointer(e, item, 'e')}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        onUpdateText(item.id, { width: undefined }, true);
                      }}
                      className="ft-resize-handle absolute top-1/2 -right-[3px] -translate-y-1/2 w-[6px] h-[6px] bg-[#f5c41a] border border-white rounded-full pointer-events-auto cursor-ew-resize z-35 shadow-2xs hover:scale-125 transition-transform"
                      title="Kéo giãn chiều rộng (PHẢI) / Double-click để Reset"
                    />
                  </>
                )}
              </div>
            )}

            {isSelected && !isMultiSelectedText && !isShiftDown && !isGesturing && !(activeLinkCard && activeLinkCard.itemId === item.id) && (
              <AnnotationToolbar anchorId={`freetext-${item.id}`} preferredAbove={isToolbarAbove}
                ref={activeTextId === item.id ? toolbarRef : undefined}
                className="ft-toolbar pointer-events-auto bg-white text-neutral-800 px-1 py-1 rounded-[10px] shadow-[0_4px_24px_rgba(0,0,0,0.18)] flex items-center gap-0 text-[14px] select-none border border-neutral-200 transition-none"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => {
                  if ((e.target as HTMLElement).tagName !== 'INPUT') {
                    e.preventDefault();
                  }
                }}
              >
                {allLocked ? (
                  <div className="flex items-center gap-1 whitespace-nowrap">
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        if (isCurrentMulti && selectedTextsOnPage.length > 1) {
                          selectedTextsOnPage.forEach((t) => onUpdateText(t.id, { isLocked: false }));
                        } else {
                          onUpdateText(item.id, { isLocked: false });
                        }
                        setActivePopup(null);
                      }}
                      className="flex items-center gap-1.5 px-3 h-8 rounded-md hover:bg-neutral-100 text-neutral-800 transition-colors whitespace-nowrap shrink-0"
                    >
                      <Unlock size={14} className="shrink-0" />
                      <span className="font-medium text-[13px] whitespace-nowrap">Mở khóa</span>
                    </button>
                    <div className="w-px h-4 bg-neutral-200 mx-0.5 shrink-0" />
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        if (isCurrentMulti && selectedTextsOnPage.length > 1) {
                          selectedTextsOnPage.forEach((t) => onDeleteText(t.id));
                        } else {
                          onDeleteText(item.id);
                        }
                        setActiveTextId(null);
                        setActivePopup(null);
                        setActiveLinkCard(null);
                      }}
                      className="flex items-center gap-1.5 px-3 h-8 rounded-md hover:bg-red-50 text-red-600 transition-colors whitespace-nowrap shrink-0"
                    >
                      <Trash2 size={14} className="shrink-0" />
                      <span className="font-medium text-[13px] whitespace-nowrap">Xóa</span>
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Color dropdown */}
                <div className="relative">
                  <button
                    onMouseDown={(e) => {
                      captureCurrentSelection(item.id);
                      e.preventDefault();
                    }}
                    onClick={() => setActivePopup(activePopup === 'color' ? null : 'color')}
                    className={`flex items-center justify-between gap-1 w-[46px] h-8 px-1.5 rounded-md hover:bg-neutral-100 transition-colors ${activePopup === 'color' ? 'bg-neutral-100' : ''}`}
                    title="Đổi màu chữ và nền"
                  >
                    <div className="flex flex-col items-center">
                      <span
                        className="font-sans font-medium text-[16px] leading-none mb-[1px]"
                        style={{
                          color: isCurrentMulti
                            ? (multiGroupColor !== 'mixed' ? multiGroupColor : '#1D2129')
                            : ((selectionFormat && selectionFormat.color !== 'mixed')
                              ? selectionFormat.color
                              : (item.color || '#1D2129')),
                          WebkitTextStroke: (
                            (isCurrentMulti
                              ? (multiGroupColor !== 'mixed' ? multiGroupColor : '#1D2129')
                              : ((selectionFormat && selectionFormat.color !== 'mixed')
                                ? selectionFormat.color
                                : (item.color || '#1D2129'))
                            ).toUpperCase() === '#FFFFFF'
                              ? '0.5px #CBD5E1'
                              : '0px'
                          )
                        }}
                      >
                        A
                      </span>
                      <div
                        className="w-[18px] h-[3px] rounded-sm"
                        style={{
                          backgroundColor: isCurrentMulti
                            ? (multiGroupBgColor !== 'mixed'
                              ? ((multiGroupBgColor && multiGroupBgColor !== 'transparent') ? multiGroupBgColor : '#e5e5e5')
                              : '#e5e5e5')
                            : ((selectionFormat && selectionFormat.bgColor !== 'mixed')
                              ? ((selectionFormat.bgColor && selectionFormat.bgColor !== 'transparent') ? selectionFormat.bgColor : '#e5e5e5')
                              : ((item.bgColor && item.bgColor !== 'transparent') ? item.bgColor : '#e5e5e5')),
                        }}
                      />
                    </div>
                    <ChevronDown size={14} className="text-neutral-500" />
                  </button>
                  {activePopup === 'color' && (
                    <FloatingSubmenu
                      isToolbarAbove={isToolbarAbove}
                      align="left"
                      className="bg-white border border-neutral-200 shadow-[0_8px_30px_rgba(0,0,0,0.18)] rounded-2xl p-3 w-[290px] animate-in fade-in duration-150"
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      <div className="text-[12px] text-neutral-800 mb-1.5 font-medium">Màu văn bản</div>
                      <div className="flex justify-between mb-3">
                        {TEXT_COLORS.map((c) => {
                          const isColorSelected = isCurrentMulti
                            ? multiGroupColor.toUpperCase() === c.toUpperCase()
                            : (selectionFormat && selectionFormat.color !== 'mixed'
                              ? selectionFormat.color.toUpperCase() === c.toUpperCase()
                              : (item.color || '#1D2129').toUpperCase() === c.toUpperCase());
                          return (
                            <button
                              key={c}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                if (isCurrentMulti && selectedTextsOnPage.length > 1) {
                                  selectedTextsOnPage.forEach((t) => handleApplyTextColor(t.id, c));
                                } else {
                                  handleApplyTextColor(item.id, c);
                                }
                              }}
                              className={`w-6 h-6 flex items-center justify-center rounded border ${isColorSelected ? 'border-[#f5c41a] bg-[#f5c41a]/10 ring-1 ring-[#f5c41a]' : 'border-neutral-200 hover:bg-neutral-50'} transition-all`}
                            >
                              <span className="font-sans font-medium text-[14px]" style={{ color: c, WebkitTextStroke: (c === '#FFFFFF' ? '0.5px #CBD5E1' : '0px') }}>A</span>
                            </button>
                          );
                        })}
                      </div>
                      
                      <div className="text-[12px] text-neutral-800 mb-1.5 font-medium">Màu nền</div>
                      <div className="grid grid-cols-10 gap-1.5 mb-1.5">
                        {BG_COLORS_LIGHT.map((c) => {
                          const isBgSelected = isCurrentMulti
                            ? multiGroupBgColor.toLowerCase() === c.toLowerCase()
                            : (selectionFormat && selectionFormat.bgColor !== 'mixed'
                              ? selectionFormat.bgColor.toLowerCase() === c.toLowerCase()
                              : (item.bgColor || 'transparent').toLowerCase() === c.toLowerCase());
                          return (
                            <button
                              key={c}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                if (isCurrentMulti && selectedTextsOnPage.length > 1) {
                                  selectedTextsOnPage.forEach((t) => handleApplyBgColor(t.id, c));
                                } else {
                                  handleApplyBgColor(item.id, c);
                                }
                              }}
                              className={`w-6 h-6 rounded-[4px] border transition-transform ${isBgSelected ? 'border-[#f5c41a] ring-1 ring-[#f5c41a] ring-offset-1' : 'border-neutral-200 hover:scale-110'}`}
                              style={{ 
                                backgroundColor: c === 'transparent' ? '#fff' : c,
                                backgroundImage: c === 'transparent' ? 'linear-gradient(to bottom right, transparent 45%, #ef4444 45%, #ef4444 55%, transparent 55%)' : 'none'
                              }}
                            />
                          );
                        })}
                      </div>
                      <div className="grid grid-cols-10 gap-1.5">
                        {BG_COLORS_DARK.map((c) => {
                          const isBgSelected = isCurrentMulti
                            ? multiGroupBgColor.toLowerCase() === c.toLowerCase()
                            : (selectionFormat && selectionFormat.bgColor !== 'mixed'
                              ? selectionFormat.bgColor.toLowerCase() === c.toLowerCase()
                              : (item.bgColor || 'transparent').toLowerCase() === c.toLowerCase());
                          return (
                            <button
                              key={c}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                if (isCurrentMulti && selectedTextsOnPage.length > 1) {
                                  selectedTextsOnPage.forEach((t) => handleApplyBgColor(t.id, c));
                                } else {
                                  handleApplyBgColor(item.id, c);
                                }
                              }}
                              className={`w-6 h-6 rounded-[4px] border border-black/10 transition-transform ${isBgSelected ? 'ring-1 ring-[#f5c41a] ring-offset-1' : 'hover:scale-110'}`}
                              style={{ backgroundColor: c }}
                            />
                          );
                        })}
                      </div>
                    </FloatingSubmenu>
                  )}
                </div>

                <div className="w-px h-5 bg-neutral-200 mx-0.5" />

                {/* Font Size dropdown */}
                {(() => {
                  const currentFontSize = isCurrentMulti
                    ? (multiGroupFontSize === 'mixed' ? '-' : multiGroupFontSize)
                    : (selectionFormat
                      ? (selectionFormat.fontSize === 'mixed' ? '-' : selectionFormat.fontSize)
                      : (item.fontSize || 16));
                  return (
                    <div className="relative">
                      <div className={`flex items-center justify-between w-[56px] h-8 px-1 rounded-md hover:bg-neutral-100 transition-colors mx-0.5 ${activePopup === 'size' ? 'bg-neutral-100' : ''}`}>
                        <input
                          type="text"
                          className="w-7 h-full bg-transparent text-center font-medium text-[14px] outline-none text-neutral-800"
                          key={`fs-${item.id}-${activePopup}-${currentFontSize}`}
                          defaultValue={currentFontSize}
                          onMouseDown={(e) => {
                            captureCurrentSelection(item.id);
                            e.stopPropagation();
                          }}
                          onFocus={() => {
                            captureCurrentSelection(item.id);
                          }}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const val = parseInt((e.target as HTMLInputElement).value);
                              if (!isNaN(val) && val > 0 && val < 500) {
                                if (isCurrentMulti && selectedTextsOnPage.length > 1) {
                                  selectedTextsOnPage.forEach((t) => handleApplyFontSize(t.id, val));
                                } else {
                                  handleApplyFontSize(item.id, val);
                                }
                              }
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                          onBlur={(e) => {
                            const val = parseInt(e.target.value);
                            if (!isNaN(val) && val > 0 && val < 500) {
                              if (isCurrentMulti && selectedTextsOnPage.length > 1) {
                                selectedTextsOnPage.forEach((t) => handleApplyFontSize(t.id, val));
                              } else {
                                handleApplyFontSize(item.id, val);
                              }
                            } else {
                              e.target.value = currentFontSize.toString();
                            }
                          }}
                        />
                        <button
                          onMouseDown={(e) => {
                            e.preventDefault();
                            captureCurrentSelection(item.id);
                          }}
                          onClick={() => setActivePopup(activePopup === 'size' ? null : 'size')}
                          className="flex-1 flex justify-center items-center h-full text-neutral-500 hover:text-neutral-800"
                        >
                          <ChevronDown size={14} />
                        </button>
                      </div>
                      {activePopup === 'size' && (
                        <FloatingSubmenu
                          isToolbarAbove={isToolbarAbove}
                          align="center"
                          className="bg-white border border-neutral-200 shadow-[0_8px_30px_rgba(0,0,0,0.18)] rounded-xl py-1.5 w-[75px]"
                          onMouseDown={(e) => e.preventDefault()}
                        >
                          {FONT_SIZES.map((size) => {
                            const isSizeActive = currentFontSize === size;
                            return (
                              <button
                                key={size}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  if (isCurrentMulti && selectedTextsOnPage.length > 1) {
                                    selectedTextsOnPage.forEach((t) => handleApplyFontSize(t.id, size));
                                  } else {
                                    handleApplyFontSize(item.id, size);
                                  }
                                  setActivePopup(null);
                                }}
                                className={`w-full text-left px-3 py-1.5 text-[14px] flex items-center justify-between hover:bg-neutral-100 ${
                                  isSizeActive ? 'text-[#f5c41a] bg-[#f5c41a]/10 hover:bg-[#f5c41a]/10 font-semibold' : 'text-neutral-700'
                                }`}
                              >
                                {size}
                                {isSizeActive && (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                    <path d="M20 6L9 17l-5-5"/>
                                  </svg>
                                )}
                              </button>
                            );
                          })}
                        </FloatingSubmenu>
                      )}
                    </div>
                  );
                })()}

                <div className="w-px h-5 bg-neutral-200 mx-0.5" />

                {/* Rich Text Format Popover Dropdown */}
                <div className="relative">
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setActivePopup(activePopup === 'format' ? null : 'format')}
                    className={`flex items-center justify-between gap-1 w-[46px] h-8 px-1.5 rounded-md hover:bg-neutral-100 transition-colors ${activePopup === 'format' ? 'bg-neutral-100' : ''}`}
                    title="Menu định dạng chữ"
                  >
                    <div className="flex items-center text-neutral-800">
                      <span className="font-sans font-medium text-[17px]">A</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="-ml-0.5 mt-0.5"><path d="M4 6h16M4 12h10M4 18h14"/></svg>
                    </div>
                    <ChevronDown size={14} className="text-neutral-500" />
                  </button>
                  {activePopup === 'format' && (
                    <FloatingSubmenu
                      isToolbarAbove={isToolbarAbove}
                      align="center"
                      className="bg-white border border-neutral-200/90 shadow-[0_8px_30px_rgba(0,0,0,0.18)] rounded-2xl p-2.5 w-[220px] flex flex-col animate-in fade-in duration-150"
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      {/* Row 1 Capsule: T (Normal Text), 1/2/3 (Numbered List), Bulleted List (•) */}
                      {(() => {
                        const itemHtml = item.text || '';
                        const isOl = /<ol\b/i.test(itemHtml);
                        const isUl = /<ul\b/i.test(itemHtml);
                        const isNormalText = !isOl && !isUl;

                        return (
                          <>
                            <div className="bg-[#F0F2F6] rounded-xl p-1 flex items-center justify-between gap-1">
                              <button 
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  if (isCurrentMulti && selectedTextsOnPage.length > 1) {
                                    selectedTextsOnPage.forEach((t) => removeListFormat(t.id));
                                  } else {
                                    removeListFormat(item.id);
                                  }
                                }}
                                className={`flex-1 h-8 rounded-lg font-sans font-semibold text-[16px] flex items-center justify-center transition-colors ${isNormalText ? 'bg-[#fdebc2] text-[#d97706] shadow-2xs' : 'text-neutral-800 hover:bg-white/60'}`}
                                title="Văn bản thường"
                              >
                                T
                              </button>

                              <button 
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  if (isCurrentMulti && selectedTextsOnPage.length > 1) {
                                    selectedTextsOnPage.forEach((t) => toggleListFormat(t.id, 'ol'));
                                  } else {
                                    toggleListFormat(item.id, 'ol');
                                  }
                                }}
                                className={`flex-1 h-8 rounded-lg flex items-center justify-center transition-colors ${isOl ? 'bg-[#fdebc2] text-[#d97706] shadow-2xs' : 'text-neutral-800 hover:bg-white/60'}`}
                                title="Danh sách số"
                              >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <line x1="10" y1="6" x2="21" y2="6" />
                                  <line x1="10" y1="12" x2="21" y2="12" />
                                  <line x1="10" y1="18" x2="21" y2="18" />
                                  <path d="M4 6h2M5 4v4" strokeWidth="1.5" />
                                  <path d="M4 11h2v3H4" strokeWidth="1.5" />
                                </svg>
                              </button>

                              <button 
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  if (isCurrentMulti && selectedTextsOnPage.length > 1) {
                                    selectedTextsOnPage.forEach((t) => toggleListFormat(t.id, 'ul'));
                                  } else {
                                    toggleListFormat(item.id, 'ul');
                                  }
                                }}
                                className={`flex-1 h-8 rounded-lg flex items-center justify-center transition-colors ${isUl ? 'bg-[#fdebc2] text-[#d97706] shadow-2xs' : 'text-neutral-800 hover:bg-white/60'}`}
                                title="Danh sách chấm"
                              >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <line x1="10" y1="6" x2="21" y2="6" />
                                  <line x1="10" y1="12" x2="21" y2="12" />
                                  <line x1="10" y1="18" x2="21" y2="18" />
                                  <circle cx="5" cy="6" r="1.5" fill="currentColor" stroke="none" />
                                  <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
                                  <circle cx="5" cy="18" r="1.5" fill="currentColor" stroke="none" />
                                </svg>
                              </button>
                            </div>

                            {/* Row 2 Capsule: B (Bold), I (Italic), U (Underline), S (Strikethrough / Gạch ngang), Shadow */}
                            {(() => {
                              const isBoldActive = isCurrentMulti ? allBold : (selectionFormat ? selectionFormat.isBold : !!item.isBold);
                              const isItalicActive = isCurrentMulti ? allItalic : (selectionFormat ? selectionFormat.isItalic : !!item.isItalic);
                              const isUnderlineActive = isCurrentMulti ? allUnderline : (selectionFormat ? selectionFormat.isUnderline : !!item.isUnderline);
                              const isStrikethroughActive = isCurrentMulti ? allStrikethrough : (selectionFormat ? selectionFormat.isStrikethrough : !!item.isStrikethrough);
                              const isShadowActive = isCurrentMulti ? allShadow : !!item.hasShadow;

                              return (
                                <div className="bg-[#F0F2F6] rounded-xl p-1 flex items-center justify-between gap-1 mt-2">
                                  <button 
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                      if (isCurrentMulti && selectedTextsOnPage.length > 1) {
                                        const nextBold = !allBold;
                                        selectedTextsOnPage.forEach((t) => {
                                          const el = document.getElementById(`editable-${t.id}`);
                                          if (el) {
                                            const updatedHtml = applyWholeBlockFormatting(el, 'bold', nextBold);
                                            onUpdateText(t.id, { isBold: nextBold, text: updatedHtml });
                                          } else {
                                            onUpdateText(t.id, { isBold: nextBold });
                                          }
                                        });
                                      } else {
                                        handleToggleBold(item.id);
                                      }
                                    }} 
                                    className={`flex-1 h-8 rounded-lg flex justify-center items-center font-bold text-[15px] transition-colors ${isBoldActive ? 'bg-[#fdebc2] text-[#d97706] shadow-2xs' : 'text-neutral-800 hover:bg-white/60'}`}
                                    title="In đậm (Bold)"
                                  >
                                    B
                                  </button>

                                  <button 
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                      if (isCurrentMulti && selectedTextsOnPage.length > 1) {
                                        const nextItalic = !allItalic;
                                        selectedTextsOnPage.forEach((t) => {
                                          const el = document.getElementById(`editable-${t.id}`);
                                          if (el) {
                                            const updatedHtml = applyWholeBlockFormatting(el, 'italic', nextItalic);
                                            onUpdateText(t.id, { isItalic: nextItalic, text: updatedHtml });
                                          } else {
                                            onUpdateText(t.id, { isItalic: nextItalic });
                                          }
                                        });
                                      } else {
                                        handleToggleItalic(item.id);
                                      }
                                    }} 
                                    className={`flex-1 h-8 rounded-lg flex justify-center items-center text-[15px] transition-colors ${isItalicActive ? 'bg-[#fdebc2] text-[#d97706] shadow-2xs' : 'text-neutral-800 hover:bg-white/60'}`}
                                    title="In nghiêng (Italic)"
                                  >
                                    <span className="italic font-serif font-medium">I</span>
                                  </button>

                                  <button 
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                      if (isCurrentMulti && selectedTextsOnPage.length > 1) {
                                        const nextUnderline = !allUnderline;
                                        selectedTextsOnPage.forEach((t) => {
                                          const el = document.getElementById(`editable-${t.id}`);
                                          if (el) {
                                            const updatedHtml = applyWholeBlockFormatting(el, 'underline', nextUnderline);
                                            onUpdateText(t.id, { isUnderline: nextUnderline, text: updatedHtml });
                                          } else {
                                            onUpdateText(t.id, { isUnderline: nextUnderline });
                                          }
                                        });
                                      } else {
                                        handleToggleUnderline(item.id);
                                      }
                                    }} 
                                    className={`flex-1 h-8 rounded-lg flex justify-center items-center text-[15px] transition-colors ${isUnderlineActive ? 'bg-[#fdebc2] text-[#d97706] shadow-2xs' : 'text-neutral-800 hover:bg-white/60'}`}
                                    title="Gạch chân (Underline)"
                                  >
                                    <span className="underline font-medium">U</span>
                                  </button>

                                  <button 
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                      if (isCurrentMulti && selectedTextsOnPage.length > 1) {
                                        const nextStrikethrough = !allStrikethrough;
                                        selectedTextsOnPage.forEach((t) => {
                                          const el = document.getElementById(`editable-${t.id}`);
                                          if (el) {
                                            const updatedHtml = applyWholeBlockFormatting(el, 'strikethrough', nextStrikethrough);
                                            onUpdateText(t.id, { isStrikethrough: nextStrikethrough, text: updatedHtml });
                                          } else {
                                            onUpdateText(t.id, { isStrikethrough: nextStrikethrough });
                                          }
                                        });
                                      } else {
                                        handleToggleStrikethrough(item.id);
                                      }
                                    }} 
                                    className={`flex-1 h-8 rounded-lg flex justify-center items-center text-[15px] transition-colors ${isStrikethroughActive ? 'bg-[#fdebc2] text-[#d97706] shadow-2xs' : 'text-neutral-800 hover:bg-white/60'}`}
                                    title="Gạch ngang text (Strikethrough)"
                                  >
                                    <span className="line-through font-medium">S</span>
                                  </button>

                                  <button 
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                      if (isCurrentMulti && selectedTextsOnPage.length > 1) {
                                        const nextShadow = !allShadow;
                                        selectedTextsOnPage.forEach((t) => onUpdateText(t.id, { hasShadow: nextShadow }));
                                      } else {
                                        onUpdateText(item.id, { hasShadow: !item.hasShadow });
                                      }
                                    }} 
                                    className={`flex-1 h-8 rounded-lg flex justify-center items-center transition-colors ${isShadowActive ? 'bg-[#fdebc2] shadow-2xs' : 'hover:bg-white/60'}`}
                                    title="Tạo bóng cho nền text"
                                  >
                                    <div className={`w-4 h-4 flex items-center justify-center rounded-[2px] border ${isShadowActive ? 'border-[#d97706] bg-[#fdebc2]' : 'border-neutral-500 bg-white'}`} style={{ boxShadow: '2px 2px 0px rgba(0,0,0,0.3)' }}>
                                      <span className={`text-[10px] font-bold ${isShadowActive ? 'text-[#d97706]' : 'text-neutral-700'}`}>A</span>
                                    </div>
                                  </button>
                                </div>
                              );
                            })()}
                          </>
                        );
                      })()}

                      {/* Divider */}
                      <div className="w-full h-px bg-neutral-200/80 my-2.5" />

                      {/* Row 3 Capsule: Align Left, Align Center, Align Right, Link */}
                      <div className="bg-[#F0F2F6] rounded-xl p-1 flex items-center justify-between gap-1">
                        <button 
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            if (isCurrentMulti && selectedTextsOnPage.length > 1) {
                              selectedTextsOnPage.forEach((t) => {
                                const el = document.getElementById(`editable-${t.id}`);
                                if (el) {
                                  ensureSelectionRestored(t.id);
                                  document.execCommand('justifyLeft', false, undefined);
                                  onUpdateText(t.id, { textAlign: 'left', text: el.innerHTML });
                                } else {
                                  onUpdateText(t.id, { textAlign: 'left' });
                                }
                              });
                            } else {
                              applyFormatCommand(item.id, 'justifyLeft');
                              onUpdateText(item.id, { textAlign: 'left' });
                            }
                          }} 
                          className={`flex-1 h-8 rounded-lg flex justify-center items-center relative transition-colors ${
                            isCurrentMulti
                              ? (multiGroupAlign === 'left' ? 'bg-[#fdebc2] text-[#d97706] shadow-2xs' : 'text-neutral-800 hover:bg-white/60')
                              : ((!item.textAlign || item.textAlign === 'left') ? 'bg-[#fdebc2] text-[#d97706] shadow-2xs' : 'text-neutral-800 hover:bg-white/60')
                          }`}
                          title="Căn lề trái"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="3" y1="6" x2="21" y2="6" />
                            <line x1="3" y1="12" x2="15" y2="12" />
                            <line x1="3" y1="18" x2="18" y2="18" />
                          </svg>
                          {(isCurrentMulti ? multiGroupAlign === 'left' : (!item.textAlign || item.textAlign === 'left')) && (
                            <div className="absolute bottom-1 w-4 h-[2px] bg-[#d97706] rounded-full" />
                          )}
                        </button>

                        <button 
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            if (isCurrentMulti && selectedTextsOnPage.length > 1) {
                              selectedTextsOnPage.forEach((t) => {
                                const el = document.getElementById(`editable-${t.id}`);
                                if (el) {
                                  ensureSelectionRestored(t.id);
                                  document.execCommand('justifyCenter', false, undefined);
                                  onUpdateText(t.id, { textAlign: 'center', text: el.innerHTML });
                                } else {
                                  onUpdateText(t.id, { textAlign: 'center' });
                                }
                              });
                            } else {
                              applyFormatCommand(item.id, 'justifyCenter');
                              onUpdateText(item.id, { textAlign: 'center' });
                            }
                          }} 
                          className={`flex-1 h-8 rounded-lg flex justify-center items-center relative transition-colors ${
                            isCurrentMulti
                              ? (multiGroupAlign === 'center' ? 'bg-[#fdebc2] text-[#d97706] shadow-2xs' : 'text-neutral-800 hover:bg-white/60')
                              : (item.textAlign === 'center' ? 'bg-[#fdebc2] text-[#d97706] shadow-2xs' : 'text-neutral-800 hover:bg-white/60')
                          }`}
                          title="Căn giữa"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="3" y1="6" x2="21" y2="6" />
                            <line x1="6" y1="12" x2="18" y2="12" />
                            <line x1="4" y1="18" x2="20" y2="18" />
                          </svg>
                          {(isCurrentMulti ? multiGroupAlign === 'center' : item.textAlign === 'center') && (
                            <div className="absolute bottom-1 w-4 h-[2px] bg-[#d97706] rounded-full" />
                          )}
                        </button>

                        <button 
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            if (isCurrentMulti && selectedTextsOnPage.length > 1) {
                              selectedTextsOnPage.forEach((t) => {
                                const el = document.getElementById(`editable-${t.id}`);
                                if (el) {
                                  ensureSelectionRestored(t.id);
                                  document.execCommand('justifyRight', false, undefined);
                                  onUpdateText(t.id, { textAlign: 'right', text: el.innerHTML });
                                } else {
                                  onUpdateText(t.id, { textAlign: 'right' });
                                }
                              });
                            } else {
                              applyFormatCommand(item.id, 'justifyRight');
                              onUpdateText(item.id, { textAlign: 'right' });
                            }
                          }} 
                          className={`flex-1 h-8 rounded-lg flex justify-center items-center relative transition-colors ${
                            isCurrentMulti
                              ? (multiGroupAlign === 'right' ? 'bg-[#fdebc2] text-[#d97706] shadow-2xs' : 'text-neutral-800 hover:bg-white/60')
                              : (item.textAlign === 'right' ? 'bg-[#fdebc2] text-[#d97706] shadow-2xs' : 'text-neutral-800 hover:bg-white/60')
                          }`}
                          title="Căn lề phải"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="3" y1="6" x2="21" y2="6" />
                            <line x1="9" y1="12" x2="21" y2="12" />
                            <line x1="6" y1="18" x2="21" y2="18" />
                          </svg>
                          {(isCurrentMulti ? multiGroupAlign === 'right' : item.textAlign === 'right') && (
                            <div className="absolute bottom-1 w-4 h-[2px] bg-[#d97706] rounded-full" />
                          )}
                        </button>

                        <div className="w-[1px] h-5 bg-neutral-300 mx-0.5" />

                        <button
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handleOpenLinkDialog(item.id)}
                          className={`flex-1 h-8 rounded-lg flex justify-center items-center text-[14px] font-medium transition-colors ${showLinkInput ? 'bg-[#fdebc2] text-[#d97706] shadow-2xs' : 'text-neutral-800 hover:bg-white/60'}`}
                          title="Chèn liên kết (Ctrl+K)"
                        >
                          <Link size={15} />
                        </button>
                      </div>
                    </FloatingSubmenu>
                  )}
                </div>

                <div className="w-px h-5 bg-neutral-200 mx-0.5" />

                {/* Link Input Dialog Popover (Renders when showLinkInput is true) */}
                {showLinkInput && (
                  <FloatingSubmenu
                    isToolbarAbove={isToolbarAbove}
                    align="left"
                    className="ft-link-dialog bg-white border border-neutral-200 shadow-[0_8px_30px_rgba(0,0,0,0.18)] rounded-xl p-3 w-[290px] flex flex-col gap-2.5 animate-in fade-in zoom-in-95 duration-150"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-semibold text-neutral-800 flex items-center gap-1.5">
                        <Link size={14} className="text-[#f5c41a]" />
                        {editingAnchor ? 'Chỉnh sửa liên kết' : 'Liên kết'}
                      </span>
                      <button
                        type="button"
                        onClick={() => { setShowLinkInput(false); setEditingAnchor(null); }}
                        className="text-neutral-400 hover:text-neutral-600 p-0.5 rounded transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <div className="flex flex-col gap-2">
                      <input 
                        type="text" 
                        value={linkUrl}
                        onChange={(e) => setLinkUrl(e.target.value)}
                        placeholder="Dán hoặc nhập liên kết"
                        className="w-full border border-neutral-200 rounded-lg px-2.5 py-1.5 text-[13px] outline-none focus:border-[#f5c41a] focus:ring-2 focus:ring-[#f5c41a]/20 text-neutral-800 placeholder-neutral-400"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleConfirmLink(item.id);
                          } else if (e.key === 'Escape') {
                            setShowLinkInput(false);
                            setEditingAnchor(null);
                          }
                        }}
                        autoFocus
                      />
                      <div className="flex justify-end gap-2 mt-0.5">
                        <button
                          type="button"
                          onClick={() => { setShowLinkInput(false); setEditingAnchor(null); }}
                          className="px-2.5 py-1 text-[12px] font-medium text-neutral-600 hover:bg-neutral-100 rounded-md transition-colors"
                        >
                          Hủy
                        </button>
                        <button 
                          id="ft-confirm-link-btn"
                          type="button"
                          onClick={() => handleConfirmLink(item.id)}
                          className="px-3 py-1 bg-[#f5c41a] text-neutral-900 rounded-md text-[12px] font-medium hover:bg-[#e5a84c] transition-colors shadow-sm"
                        >
                          Xác nhận
                        </button>
                      </div>
                    </div>
                  </FloatingSubmenu>
                )}

                {/* More options (Lock / Delete) */}
                <div className="relative">
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setActivePopup(activePopup === 'more' ? null : 'more')}
                    className={`w-8 h-8 flex items-center justify-center rounded-md hover:bg-neutral-100 text-neutral-700 transition-colors mr-0.5 ${activePopup === 'more' ? 'bg-neutral-100' : ''}`}
                    title="Tùy chọn khác"
                  >
                    <MoreHorizontal size={18} />
                  </button>
                  {activePopup === 'more' && (
                    <FloatingSubmenu
                      isToolbarAbove={isToolbarAbove}
                      align="right"
                      className="bg-white border border-neutral-200 shadow-[0_8px_30px_rgba(0,0,0,0.18)] rounded-xl py-1.5 w-44"
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          if (isCurrentMulti && selectedTextsOnPage.length > 1) {
                            const nextLocked = !allLocked;
                            selectedTextsOnPage.forEach((t) => onUpdateText(t.id, { isLocked: nextLocked }));
                          } else {
                            onUpdateText(item.id, { isLocked: !item.isLocked });
                          }
                          setEditingTextId(null);
                          setActivePopup(null);
                        }}
                        className="w-full text-left px-4 py-2 text-[14px] hover:bg-neutral-100 text-neutral-800 flex items-center justify-between"
                      >
                        {allLocked ? 'Mở khóa' : 'Khóa'}
                        {allLocked ? <Unlock size={16} className="text-neutral-500"/> : <Lock size={16} className="text-neutral-500"/>}
                      </button>
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          if (isCurrentMulti && selectedTextsOnPage.length > 1) {
                            selectedTextsOnPage.forEach((t) => onDeleteText(t.id));
                          } else {
                            onDeleteText(item.id);
                          }
                          setActiveTextId(null);
                          setActivePopup(null);
                          setActiveLinkCard(null);
                        }}
                        className="w-full text-left px-4 py-2 text-[14px] hover:bg-red-50 text-red-600 flex items-center justify-between border-t border-neutral-100"
                      >
                        Xóa
                        <Trash2 size={16} />
                      </button>
                    </FloatingSubmenu>
                  )}
                </div>
              
                  </>
                )}</AnnotationToolbar>
            )}

            {/* Editable Text Element */}
            <div className={`relative z-10 w-full h-full p-0 flex flex-col justify-center ${
              editingTextId === item.id ? 'cursor-text select-text' : 'cursor-default select-none'
            }`}>
              <EditableText
                id={item.id}
                isSelected={isSelected}
                isEditing={editingTextId === item.id}
                isLocked={item.isLocked || false}
                text={item.text}
                fontSize={currentFontSize}
                scale={scale}
                color={item.color || '#1D2129'}
                isBold={item.isBold}
                isItalic={item.isItalic}
                isUnderline={item.isUnderline}
                isStrikethrough={item.isStrikethrough}
                hasShadow={item.hasShadow}
                textAlign={item.textAlign}
                pageNumber={item.pageNumber || pageNumber}
                onUpdateText={onUpdateText}
                onDeleteText={(id) => {
                  onDeleteText(id);
                  setActiveLinkCard(null);
                }}
                setActiveTextId={setActiveTextId}
                setEditingTextId={setEditingTextId}
                onLinkHover={(anchor, href, isPinned) => handleLinkHover(item.id, anchor, href, isPinned)}
                onLinkHoverLeave={handleLinkHoverLeave}
                onSelectionRangeChange={(range) => {
                  if (range && !range.collapsed) {
                    savedRangeRef.current = { itemId: item.id, range: range.cloneRange() };
                    setSavedRange(range.cloneRange());
                    const el = document.getElementById(`editable-${item.id}`);
                    if (el) {
                      const offsets = getSelectionOffsets(el, range);
                      if (offsets) {
                        savedOffsetsRef.current = { itemId: item.id, ...offsets, text: range.toString() };
                      }
                    }
                  } else {
                    if (savedRangeRef.current?.itemId === item.id) {
                      savedRangeRef.current = null;
                    }
                    if (savedOffsetsRef.current?.itemId === item.id) {
                      savedOffsetsRef.current = null;
                    }
                    setSavedRange(null);
                  }
                }}
                onOpenLinkDialog={() => handleOpenLinkDialog(item.id)}
              />
            </div>
          </div>
        );
      })}



      {/* Link Card Popover (Popover Xem & Thao tác nhanh cố định 8px phía dưới chữ) */}
      {activeLinkCard && createPortal(
        <div
          className="ft-link-card-popover pointer-events-auto fixed z-[99999] bg-white border border-neutral-200 shadow-[0_8px_30px_rgba(0,0,0,0.15)] rounded-xl px-3 py-1.5 flex items-center gap-2 select-none animate-in fade-in zoom-in-95 duration-150 before:absolute before:-top-3 before:left-0 before:right-0 before:h-3 before:content-['']"
          style={{
            top: `${activeLinkCard.top}px`,
            left: `${activeLinkCard.left}px`,
          }}
          onMouseEnter={() => {
            if (linkCardTimeoutRef.current) {
              clearTimeout(linkCardTimeoutRef.current);
              linkCardTimeoutRef.current = null;
            }
          }}
          onMouseLeave={handleLinkHoverLeave}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {activeLinkCard.isEditingInline ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSaveInlineLink();
              }}
              className="flex items-center gap-1.5 w-[310px]"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="relative flex-1 flex items-center">
                <Globe size={14} className="absolute left-2.5 text-neutral-400 pointer-events-none" />
                <input
                  type="text"
                  value={inlineLinkUrl}
                  onChange={(e) => setInlineLinkUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full pl-8 pr-2.5 py-1 text-[13px] bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:border-[#f5c41a] focus:ring-2 focus:ring-[#f5c41a]/20 text-neutral-800"
                  autoFocus
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Escape') {
                      setActiveLinkCard((prev) => prev ? { ...prev, isEditingInline: false } : null);
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveInlineLink();
                    }
                  }}
                />
              </div>
              <button
                type="submit"
                className="px-2.5 py-1 bg-[#f5c41a] text-neutral-900 rounded-lg text-[12px] font-medium hover:bg-[#e5a84c] transition-colors shadow-2xs flex-shrink-0 cursor-pointer"
                title="Lưu liên kết"
              >
                Lưu
              </button>
              <button
                type="button"
                onClick={() => setActiveLinkCard((prev) => prev ? { ...prev, isEditingInline: false } : null)}
                className="p-1 text-neutral-400 hover:text-neutral-600 rounded-lg transition-colors flex-shrink-0 cursor-pointer"
                title="Hủy"
              >
                <X size={14} />
              </button>
            </form>
          ) : (
            <>
              {/* 1. Mở link trong tab mới */}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  window.open(activeLinkCard.href, '_blank', 'noopener,noreferrer');
                }}
                className="flex items-center gap-1.5 text-[13px] text-blue-600 hover:text-blue-700 hover:underline max-w-[200px] truncate font-medium group py-1 px-1.5 rounded-lg hover:bg-blue-50/80 transition-colors text-left cursor-pointer"
                title={`Mở liên kết trong tab mới: ${activeLinkCard.href}`}
              >
                <Globe size={14} className="text-neutral-500 group-hover:text-blue-600 flex-shrink-0" />
                <span className="truncate">{activeLinkCard.href.replace(/^https?:\/\//i, '')}</span>
                <ExternalLink size={12} className="text-neutral-400 group-hover:text-blue-600 flex-shrink-0 ml-0.5" />
              </button>

              <div className="w-px h-4 bg-neutral-200 mx-0.5 flex-shrink-0" />

              {/* 2. Biểu tượng Sửa (Edit Pencil Icon) */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleEditLinkFromCard(activeLinkCard);
                }}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-neutral-100 text-neutral-600 hover:text-neutral-900 transition-colors flex-shrink-0 cursor-pointer"
                title="Chỉnh sửa liên kết"
              >
                <Pencil size={14} />
              </button>

              {/* 3. Biểu tượng Hủy liên kết (Unlink Icon) */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleUnlinkFromCard(activeLinkCard);
                }}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-neutral-600 hover:text-red-600 transition-colors flex-shrink-0 cursor-pointer"
                title="Hủy liên kết (Xóa liên kết)"
              >
                <Unlink size={14} />
              </button>
            </>
          )}
        </div>
      , document.body)}
    </div>
  );
};
