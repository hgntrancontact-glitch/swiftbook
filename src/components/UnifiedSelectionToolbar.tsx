import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { FreeTextAnnotation, BoxAnnotation, BoxConfig, DEFAULT_BOX_CONFIG } from '../types';
import {
  Unlock,
  Trash2,
  ChevronDown,
  Check,
  Square,
  Lock,
} from 'lucide-react';

interface UnifiedSelectionToolbarProps {
  selectedIds?: string[];
  freeTexts: FreeTextAnnotation[];
  boxes: BoxAnnotation[];
  boxConfig?: BoxConfig;
  onUpdateText: (id: string, updates: Partial<FreeTextAnnotation>, skipHistory?: boolean) => void;
  onDeleteText: (id: string) => void;
  onUpdateBox: (id: string, updates: Partial<BoxAnnotation>, skipHistory?: boolean) => void;
  onDeleteBox: (id: string) => void;
  onUpdateBoxConfig?: (updates: Partial<BoxConfig>) => void;
  isModalOpen?: boolean;
}

const BOX_PRESET_COLORS = [
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#22c55e', // Green
  '#eab308', // Yellow
  '#171717', // Black
];

const BORDER_WIDTHS = [2, 3, 4, 6];

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

// Helper to synchronize whole block properties across all descendant elements while preserving rich-text structure
export const applyWholeBlockFormatting = (
  el: HTMLElement,
  property: 'bgColor' | 'color' | 'bold' | 'italic' | 'underline' | 'strikethrough' | 'fontSize',
  value: any
): string => {
  const all = Array.from(el.querySelectorAll('*')) as HTMLElement[];

  if (property === 'bgColor') {
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

const toggleListFormat = (el: HTMLElement | null, currentHtml: string, type: 'ol' | 'ul'): string => {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = el ? el.innerHTML : currentHtml;

  const existingList = tempDiv.querySelector(type);
  if (existingList) {
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
    return newHtml;
  }

  let lines: string[] = [];
  const otherLis = tempDiv.querySelectorAll('li');
  if (otherLis.length > 0) {
    otherLis.forEach((li) => {
      const content = li.innerHTML.trim();
      if (content) lines.push(content);
    });
  } else {
    const rawFormatted = (el ? el.innerHTML : currentHtml)
      .replace(/<\/?(p|div|h[1-6]|blockquote)[^>]*>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n');
    const parserDiv = document.createElement('div');
    parserDiv.innerHTML = rawFormatted;
    const rawText = parserDiv.innerText || parserDiv.textContent || '';
    lines = rawText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  }

  if (lines.length === 0) {
    const raw = (tempDiv.innerText || tempDiv.textContent || '').trim();
    lines = raw ? [raw] : ['Mục 1'];
  }

  const listItemsHtml = lines.map((line) => `<li>${line}</li>`).join('');
  const newHtml = `<${type}>${listItemsHtml}</${type}>`;
  if (el) el.innerHTML = newHtml;
  return newHtml;
};

const removeListFormat = (el: HTMLElement | null, currentHtml: string): string => {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = el ? el.innerHTML : currentHtml;

  const lis = tempDiv.querySelectorAll('li');
  if (lis.length > 0) {
    let plainLines: string[] = [];
    lis.forEach((li) => {
      const content = li.innerHTML.trim();
      if (content) plainLines.push(content);
    });
    const newHtml = plainLines.join('<br>') || '';
    if (el) el.innerHTML = newHtml;
    return newHtml;
  }
  const stripped = (el ? el.innerHTML : currentHtml)
    .replace(/<\/?(ol|ul|li)[^>]*>/gi, '')
    .trim();
  if (el) el.innerHTML = stripped;
  return stripped;
};

interface FloatingSubmenuProps {
  isToolbarAbove: boolean;
  align?: 'left' | 'center' | 'right';
  className?: string;
  children: React.ReactNode;
}

const FloatingSubmenu: React.FC<FloatingSubmenuProps> = ({
  isToolbarAbove,
  align = 'center',
  className = '',
  children,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [effectiveAbove, setEffectiveAbove] = useState(isToolbarAbove);

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const parentRect = el.parentElement?.getBoundingClientRect();
    if (!parentRect) return;

    const headerEl = document.querySelector('header');
    const headerBottom = headerEl ? Math.max(0, headerEl.getBoundingClientRect().bottom) : 48;
    const bottomToolbarEl =
      document.getElementById('bottom-toolbar') ||
      document.querySelector('.bottom-toolbar, [data-bottom-toolbar="true"]');
    const bottomToolbarRect = bottomToolbarEl ? bottomToolbarEl.getBoundingClientRect() : null;
    const bottomLimit =
      bottomToolbarRect && bottomToolbarRect.top > 0
        ? bottomToolbarRect.top
        : window.innerHeight - 70;

    const spaceAbove = parentRect.top - headerBottom;
    const spaceBelow = bottomLimit - parentRect.bottom;

    if (isToolbarAbove && spaceAbove < 140 && spaceBelow > spaceAbove) {
      setEffectiveAbove(false);
    } else if (!isToolbarAbove && spaceBelow < 140 && spaceAbove > spaceBelow) {
      setEffectiveAbove(true);
    } else {
      setEffectiveAbove(isToolbarAbove);
    }
  }, [isToolbarAbove]);

  return (
    <div
      ref={menuRef}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className={`floating-submenu absolute z-[99999] ${
        effectiveAbove ? 'bottom-full mb-2' : 'top-full mt-2'
      } ${
        align === 'left' ? 'left-0' : align === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2'
      } ${className}`}
    >
      {children}
    </div>
  );
};

export const UnifiedSelectionToolbar: React.FC<UnifiedSelectionToolbarProps> = ({
  selectedIds,
  freeTexts,
  boxes,
  boxConfig = DEFAULT_BOX_CONFIG,
  onUpdateText,
  onDeleteText,
  onUpdateBox,
  onDeleteBox,
  onUpdateBoxConfig,
  isModalOpen = false,
}) => {
  const [activePopup, setActivePopup] = useState<'color' | 'size' | 'format' | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const isAboveRef = useRef<boolean | undefined>(undefined);
  const isDraggingRef = useRef<boolean>(false);

  // Keep references to latest props in refs to avoid recreating callbacks
  const boxesRef = useRef(boxes);
  boxesRef.current = boxes;
  const freeTextsRef = useRef(freeTexts);
  freeTextsRef.current = freeTexts;
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const boxConfigRef = useRef(boxConfig);
  boxConfigRef.current = boxConfig;

  // Filter selected items across ALL pages using memoization
  const selectedIdsKey = (selectedIds || []).join(',');
  const selectedBoxes = useMemo(() => {
    if (!selectedIds || selectedIds.length === 0) return [];
    const idSet = new Set(selectedIds);
    return boxes.filter((b) => idSet.has(b.id));
  }, [boxes, selectedIdsKey]);

  const selectedTexts = useMemo(() => {
    if (!selectedIds || selectedIds.length === 0) return [];
    const idSet = new Set(selectedIds);
    return freeTexts.filter((t) => idSet.has(t.id));
  }, [freeTexts, selectedIdsKey]);

  const isBoxGroup = selectedBoxes.length > 1;
  const isTextGroup = !isBoxGroup && selectedTexts.length > 1;
  const isVisibleGroup = (isBoxGroup || isTextGroup) && !isModalOpen;

  const isVisibleGroupRef = useRef(isVisibleGroup);
  isVisibleGroupRef.current = isVisibleGroup;
  const isBoxGroupRef = useRef(isBoxGroup);
  isBoxGroupRef.current = isBoxGroup;
  const isTextGroupRef = useRef(isTextGroup);
  isTextGroupRef.current = isTextGroup;

  const [pos, setPos] = useState<{ left: number; top: number; isAbove: boolean; isVisible: boolean }>({
    left: 0,
    top: 0,
    isAbove: true,
    isVisible: false,
  });

  // Calculate live viewport coordinates directly from actual DOM bounding rects
  const updatePosition = useCallback(() => {
    if (!isVisibleGroupRef.current) {
      setPos((prev) => (prev.isVisible ? { ...prev, isVisible: false } : prev));
      return;
    }

    const currentSelectedIds = selectedIdsRef.current || [];
    const currentBoxes = boxesRef.current || [];
    const currentTexts = freeTextsRef.current || [];
    const idSet = new Set(currentSelectedIds);

    const elements: HTMLElement[] = [];
    if (isBoxGroupRef.current) {
      currentBoxes.forEach((b) => {
        if (idSet.has(b.id)) {
          const el = document.getElementById(`box-${b.id}`);
          if (el) elements.push(el);
        }
      });
    } else if (isTextGroupRef.current) {
      currentTexts.forEach((t) => {
        if (idSet.has(t.id)) {
          const el = document.getElementById(`freetext-${t.id}`) || document.getElementById(`editable-${t.id}`);
          if (el) elements.push(el);
        }
      });
    }

    if (elements.length === 0) {
      return;
    }

    const rects = elements.map((el) => el.getBoundingClientRect());
    const minLeft = Math.min(...rects.map((r) => r.left));
    const maxRight = Math.max(...rects.map((r) => r.right));
    const minTop = Math.min(...rects.map((r) => r.top));
    const maxBottom = Math.max(...rects.map((r) => r.bottom));

    const groupCenterX = (minLeft + maxRight) / 2;

    const headerEl = document.querySelector('header');
    const headerBottom = headerEl ? Math.max(0, headerEl.getBoundingClientRect().bottom) : 48;

    const bottomToolbarEl =
      document.getElementById('bottom-toolbar') ||
      document.querySelector('.bottom-toolbar, [data-bottom-toolbar="true"]');
    const bottomToolbarRect = bottomToolbarEl ? bottomToolbarEl.getBoundingClientRect() : null;
    const bottomLimit =
      bottomToolbarRect && bottomToolbarRect.top > 0
        ? bottomToolbarRect.top
        : window.innerHeight - 70;

    const sidebarEl = document.querySelector('aside, .sidebar-container, [data-sidebar="true"]');
    const sidebarRect = sidebarEl ? sidebarEl.getBoundingClientRect() : null;
    const sidebarRight =
      sidebarRect && sidebarRect.right > 0 && sidebarRect.right < window.innerWidth / 2
        ? sidebarRect.right
        : 0;

    const viewportWidth = window.innerWidth;

    // Check if group is completely off screen
    if (maxBottom < headerBottom || minTop > bottomLimit || maxRight < 0 || minLeft > viewportWidth) {
      setPos((prev) => (prev.isVisible ? { ...prev, isVisible: false } : prev));
      return;
    }

    const tbEl = toolbarRef.current;
    const tbWidth = tbEl ? tbEl.offsetWidth : (isBoxGroupRef.current ? 290 : 430);
    const tbHeight = tbEl ? tbEl.offsetHeight : (isBoxGroupRef.current ? 38 : 42);

    const GAP_BOX_TB = 10;
    const GAP_TB_SUB = 8;
    const MARGIN = 10;
    const PREDICTED_SUBMENU_HEIGHT = isTextGroupRef.current ? 280 : 0;

    const totalAboveNeeded = tbHeight + GAP_BOX_TB + GAP_TB_SUB + PREDICTED_SUBMENU_HEIGHT + MARGIN;
    const totalBelowNeeded = tbHeight + GAP_BOX_TB + GAP_TB_SUB + PREDICTED_SUBMENU_HEIGHT + MARGIN;

    const spaceAbove = minTop - headerBottom;
    const spaceBelow = bottomLimit - maxBottom;

    let isAbove = isAboveRef.current;
    if (isAbove === undefined) {
      if (spaceAbove >= totalAboveNeeded) {
        isAbove = true;
      } else if (spaceBelow >= totalBelowNeeded) {
        isAbove = false;
      } else {
        isAbove = spaceAbove >= spaceBelow;
      }
    } else if (isAbove) {
      const hysteresisMargin = 16;
      if (spaceAbove < totalAboveNeeded - hysteresisMargin && spaceBelow > spaceAbove) {
        isAbove = false;
      } else {
        isAbove = true;
      }
    } else {
      const hysteresisMargin = 16;
      if (
        spaceAbove >= totalAboveNeeded + hysteresisMargin ||
        (spaceAbove > spaceBelow && spaceBelow < totalBelowNeeded - hysteresisMargin)
      ) {
        isAbove = true;
      } else {
        isAbove = false;
      }
    }
    isAboveRef.current = isAbove;

    let targetTop = isAbove ? minTop - tbHeight - GAP_BOX_TB : maxBottom + GAP_BOX_TB;
    if (targetTop < headerBottom + MARGIN) {
      targetTop = headerBottom + MARGIN;
    } else if (targetTop + tbHeight > bottomLimit - MARGIN) {
      targetTop = bottomLimit - MARGIN - tbHeight;
    }

    const minAllowedLeft = Math.max(MARGIN, sidebarRight + MARGIN);
    const maxAllowedLeft = viewportWidth - MARGIN - tbWidth;

    let targetLeft = groupCenterX - tbWidth / 2;
    targetLeft = Math.max(minAllowedLeft, Math.min(maxAllowedLeft, targetLeft));

    const finalLeft = Math.round(targetLeft);
    const finalTop = Math.round(targetTop);

    if (tbEl) {
      tbEl.style.left = `${finalLeft}px`;
      tbEl.style.top = `${finalTop}px`;
    }

    setPos((prev) => {
      if (
        prev.left === finalLeft &&
        prev.top === finalTop &&
        prev.isAbove === isAbove &&
        prev.isVisible === true
      ) {
        return prev;
      }
      return {
        left: finalLeft,
        top: finalTop,
        isAbove,
        isVisible: true,
      };
    });
  }, []);

  // Handle outside click to close submenus
  useEffect(() => {
    if (!activePopup) return;
    const handleOutside = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target : (e.target as Node | null)?.parentElement;
      if (!el?.closest?.('.unified-group-toolbar') && !el?.closest?.('.floating-submenu')) {
        setActivePopup(null);
      }
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, [activePopup]);

  // Synchronize during active drag across page boundaries
  useEffect(() => {
    let rafId: number | null = null;

    const onBatchStart = () => {
      isDraggingRef.current = true;
      setActivePopup(null);
      const loop = () => {
        updatePosition();
        if (isDraggingRef.current) {
          rafId = requestAnimationFrame(loop);
        }
      };
      rafId = requestAnimationFrame(loop);
    };

    const onBatchCommit = () => {
      isDraggingRef.current = false;
      if (rafId) cancelAnimationFrame(rafId);
      updatePosition();
    };

    const onBatchTranslate = () => {
      updatePosition();
    };

    const onWindowMove = (e: MouseEvent) => {
      if (e.buttons > 0) {
        updatePosition();
      }
    };

    const onWindowMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        if (rafId) cancelAnimationFrame(rafId);
        updatePosition();
      }
    };

    window.addEventListener('batch-translate-start', onBatchStart);
    window.addEventListener('batch-translate', onBatchTranslate);
    window.addEventListener('batch-translate-commit', onBatchCommit);
    window.addEventListener('pointermove', onWindowMove, { passive: true });
    window.addEventListener('mousemove', onWindowMove, { passive: true });
    window.addEventListener('mouseup', onWindowMouseUp, { passive: true });
    window.addEventListener('pointerup', onWindowMouseUp, { passive: true });
    window.addEventListener('scroll', updatePosition, { passive: true, capture: true });
    window.addEventListener('resize', updatePosition, { passive: true });

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('batch-translate-start', onBatchStart);
      window.removeEventListener('batch-translate', onBatchTranslate);
      window.removeEventListener('batch-translate-commit', onBatchCommit);
      window.removeEventListener('pointermove', onWindowMove);
      window.removeEventListener('mousemove', onWindowMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
      window.removeEventListener('pointerup', onWindowMouseUp);
      window.removeEventListener('scroll', updatePosition, { capture: true } as any);
      window.removeEventListener('resize', updatePosition);
    };
  }, [updatePosition]);

  useLayoutEffect(() => {
    if (!isVisibleGroup) {
      isAboveRef.current = undefined;
      return;
    }
    updatePosition();
    const raf = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(raf);
  }, [isVisibleGroup, selectedIdsKey, updatePosition]);

  if (!isVisibleGroup || typeof document === 'undefined' || !document.body) {
    return null;
  }

  // 1. RENDER BOX GROUP TOOLBAR
  const renderBoxGroupToolbar = () => {
    const allGroupColorSame = selectedBoxes.every(
      (b) => (b.color || '#ef4444') === (selectedBoxes[0].color || '#ef4444')
    );
    const groupColor = allGroupColorSame ? selectedBoxes[0].color || '#ef4444' : null;

    const allGroupWidthSame = selectedBoxes.every(
      (b) => (b.borderWidth || 2) === (selectedBoxes[0].borderWidth || 2)
    );
    const groupWidth = allGroupWidthSame ? selectedBoxes[0].borderWidth || 2 : null;

    const allGroupStyleSame = selectedBoxes.every(
      (b) => (b.borderStyle || 'solid') === (selectedBoxes[0].borderStyle || 'solid')
    );
    const isGroupDashed = allGroupStyleSame && selectedBoxes[0].borderStyle === 'dashed';

    const allGroupFillSame = selectedBoxes.every(
      (b) =>
        Boolean(b.fillColor && b.fillColor !== 'transparent') ===
        Boolean(selectedBoxes[0].fillColor && selectedBoxes[0].fillColor !== 'transparent')
    );
    const isGroupFilled =
      allGroupFillSame &&
      Boolean(selectedBoxes[0].fillColor && selectedBoxes[0].fillColor !== 'transparent');

    return (
      <div
        className="unified-box-toolbar bg-white/98 backdrop-blur-md border border-neutral-200/90 shadow-xl rounded-lg px-2 py-1 flex items-center gap-1.5 whitespace-nowrap select-none max-w-full flex-wrap"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Border Color Swatches */}
        <div className="flex items-center gap-1 pr-1.5 border-r border-neutral-200">
          {BOX_PRESET_COLORS.map((c) => {
            const isChecked = groupColor === c;
            return (
              <button
                key={c}
                onClick={() => {
                  selectedBoxes.forEach((targetBox) => {
                    const tHasFill = targetBox.fillColor && targetBox.fillColor !== 'transparent';
                    const tNewFill = tHasFill ? `${c}25` : 'transparent';
                    onUpdateBox(targetBox.id, { color: c, fillColor: tNewFill });
                  });
                  onUpdateBoxConfig?.({ color: c });
                }}
                className="w-4.5 h-4.5 rounded-full border border-black/15 flex items-center justify-center transition-transform hover:scale-115 cursor-pointer shadow-2xs"
                style={{ backgroundColor: c }}
                title={`Đổi màu viền sang ${c}`}
              >
                {isChecked && (
                  <Check size={10} className={c === '#eab308' ? 'text-black' : 'text-white'} />
                )}
              </button>
            );
          })}
        </div>

        {/* Border Width Selector */}
        <div className="flex items-center gap-0.5 px-1 border-r border-neutral-200">
          {BORDER_WIDTHS.map((w) => {
            const isActive = groupWidth === w;
            return (
              <button
                key={w}
                onClick={() => {
                  selectedBoxes.forEach((targetBox) => {
                    onUpdateBox(targetBox.id, { borderWidth: w });
                  });
                  onUpdateBoxConfig?.({ borderWidth: w });
                }}
                className={`px-1.5 py-0.5 rounded text-[11px] font-bold transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-neutral-900 text-white shadow-2xs'
                    : 'text-neutral-700 hover:bg-neutral-100'
                }`}
                title={`Độ dày viền ${w}px`}
              >
                {w}px
              </button>
            );
          })}
        </div>

        {/* Border Style (Solid / Dashed) */}
        <div className="flex items-center gap-1 px-0.5">
          <button
            onClick={() => {
              const nextStyle = isGroupDashed ? 'solid' : 'dashed';
              selectedBoxes.forEach((targetBox) => {
                onUpdateBox(targetBox.id, { borderStyle: nextStyle });
              });
              onUpdateBoxConfig?.({ borderStyle: nextStyle });
            }}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors flex items-center justify-center cursor-pointer ${
              isGroupDashed ? 'bg-neutral-900 text-white shadow-2xs' : 'text-neutral-700 hover:bg-neutral-100'
            }`}
            title={isGroupDashed ? 'Chuyển sang nét liền' : 'Chuyển sang nét đứt'}
          >
            <span>{isGroupDashed ? 'Đứt' : 'Liền'}</span>
          </button>

          {/* Fill / Background Toggle */}
          <button
            onClick={() => {
              const nextHasFill = !isGroupFilled;
              selectedBoxes.forEach((targetBox) => {
                const targetFill = nextHasFill ? `${targetBox.color || '#ef4444'}25` : 'transparent';
                onUpdateBox(targetBox.id, { fillColor: targetFill });
              });
              onUpdateBoxConfig?.({ hasBackground: nextHasFill });
            }}
            className={`p-1 rounded text-[11px] transition-colors cursor-pointer ${
              isGroupFilled ? 'bg-neutral-900 text-white shadow-2xs' : 'text-neutral-700 hover:bg-neutral-100'
            }`}
            title={isGroupFilled ? 'Bỏ màu nền (Trong suốt)' : 'Tô màu nền nhẹ'}
          >
            <Square size={13} className={isGroupFilled ? 'fill-current' : ''} />
          </button>
        </div>

        <div className="w-px h-3.5 bg-neutral-200" />

        {/* Delete Button */}
        <button
          onClick={() => {
            selectedBoxes.forEach((targetBox) => onDeleteBox(targetBox.id));
          }}
          className="p-1 rounded text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors cursor-pointer shrink-0"
          title="Xóa nhóm khung đã chọn"
        >
          <Trash2 size={13.5} />
        </button>
      </div>
    );
  };

  // 2. RENDER TEXT GROUP TOOLBAR
  const renderTextGroupToolbar = () => {
    const allGroupColorSame = selectedTexts.every(
      (t) => (t.color || '#1D2129').toUpperCase() === (selectedTexts[0].color || '#1D2129').toUpperCase()
    );
    const groupColor = allGroupColorSame ? selectedTexts[0].color || '#1D2129' : 'mixed';

    const allGroupBgSame = selectedTexts.every(
      (t) =>
        (t.bgColor || 'transparent').toLowerCase() === (selectedTexts[0].bgColor || 'transparent').toLowerCase()
    );
    const groupBgColor = allGroupBgSame ? selectedTexts[0].bgColor || 'transparent' : 'mixed';

    const allGroupFontSizeSame = selectedTexts.every(
      (t) => (t.fontSize || 16) === (selectedTexts[0].fontSize || 16)
    );
    const groupFontSize = allGroupFontSizeSame ? selectedTexts[0].fontSize || 16 : 'mixed';

    const allGroupBold = selectedTexts.every((t) => !!t.isBold);
    const allGroupItalic = selectedTexts.every((t) => !!t.isItalic);
    const allGroupUnderline = selectedTexts.every((t) => !!t.isUnderline);
    const allGroupStrikethrough = selectedTexts.every((t) => !!t.isStrikethrough);
    const allGroupShadow = selectedTexts.every((t) => !!t.hasShadow);

    const allGroupAlignSame = selectedTexts.every(
      (t) => (t.textAlign || 'left') === (selectedTexts[0].textAlign || 'left')
    );
    const groupAlign = allGroupAlignSame ? selectedTexts[0].textAlign || 'left' : 'mixed';

    const allGroupLocked = selectedTexts.every((t) => !!t.isLocked);

    return (
      <div
        className="unified-text-toolbar pointer-events-auto max-w-full flex-wrap bg-white text-neutral-800 px-1 py-1 rounded-[10px] shadow-[0_4px_24px_rgba(0,0,0,0.18)] flex items-center gap-0 text-[14px] select-none border border-neutral-200 transition-none"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {allGroupLocked ? (
          <div className="flex items-center gap-1 whitespace-nowrap">
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                selectedTexts.forEach((t) => onUpdateText(t.id, { isLocked: false }));
                setActivePopup(null);
              }}
              className="flex items-center gap-1.5 px-3 h-8 rounded-md hover:bg-neutral-100 text-neutral-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Unlock size={14} className="shrink-0" />
              <span className="font-medium text-[13px] whitespace-nowrap">Mở khóa</span>
            </button>
            <div className="w-px h-4 bg-neutral-200 mx-0.5 shrink-0" />
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                selectedTexts.forEach((t) => onDeleteText(t.id));
                setActivePopup(null);
              }}
              className="flex items-center gap-1.5 px-3 h-8 rounded-md hover:bg-red-50 text-red-600 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setActivePopup(activePopup === 'color' ? null : 'color')}
                className={`flex items-center justify-between gap-1 w-[46px] h-8 px-1.5 rounded-md hover:bg-neutral-100 transition-colors cursor-pointer ${
                  activePopup === 'color' ? 'bg-neutral-100' : ''
                }`}
                title="Đổi màu chữ và nền"
              >
                <div className="flex flex-col items-center">
                  <span
                    className="font-sans font-medium text-[16px] leading-none mb-[1px]"
                    style={{
                      color: groupColor !== 'mixed' ? groupColor : '#1D2129',
                    }}
                  >
                    A
                  </span>
                  <div
                    className="w-[18px] h-[3px] rounded-sm"
                    style={{
                      backgroundColor:
                        groupBgColor !== 'mixed'
                          ? groupBgColor && groupBgColor !== 'transparent'
                            ? groupBgColor
                            : '#e5e5e5'
                          : '#e5e5e5',
                    }}
                  />
                </div>
                <ChevronDown size={14} className="text-neutral-500" />
              </button>
              {activePopup === 'color' && (
                <FloatingSubmenu
                  isToolbarAbove={pos.isAbove}
                  align="left"
                  className="bg-white border border-neutral-200 shadow-[0_8px_30px_rgba(0,0,0,0.18)] rounded-2xl p-3 w-[290px] animate-in fade-in duration-150 z-[25000]"
                >
                  <div className="text-[12px] text-neutral-800 mb-1.5 font-medium">Màu văn bản</div>
                  <div className="flex justify-between mb-3">
                    {TEXT_COLORS.map((c) => {
                      const isColorSelected = groupColor.toUpperCase() === c.toUpperCase();
                      return (
                        <button
                          key={c}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            selectedTexts.forEach((t) => {
                              const el = document.getElementById(`editable-${t.id}`);
                              if (el) {
                                applyWholeBlockFormatting(el, 'color', c);
                                onUpdateText(t.id, { color: c, text: el.innerHTML });
                              } else {
                                onUpdateText(t.id, { color: c });
                              }
                            });
                          }}
                          className={`w-6 h-6 flex items-center justify-center rounded border cursor-pointer ${
                            isColorSelected
                              ? 'border-[#f5c41a] bg-[#f5c41a]/10 ring-1 ring-[#f5c41a]'
                              : 'border-neutral-200 hover:bg-neutral-50'
                          } transition-all`}
                        >
                          <span className="font-sans font-medium text-[14px]" style={{ color: c }}>
                            A
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="text-[12px] text-neutral-800 mb-1.5 font-medium">Màu nền</div>
                  <div className="grid grid-cols-10 gap-1.5 mb-1.5">
                    {BG_COLORS_LIGHT.map((c) => {
                      const isBgSelected = groupBgColor.toLowerCase() === c.toLowerCase();
                      return (
                        <button
                          key={c}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            selectedTexts.forEach((t) => {
                              const el = document.getElementById(`editable-${t.id}`);
                              if (el) {
                                applyWholeBlockFormatting(el, 'bgColor', c);
                                onUpdateText(t.id, { bgColor: c, text: el.innerHTML });
                              } else {
                                onUpdateText(t.id, { bgColor: c });
                              }
                            });
                          }}
                          className={`w-6 h-6 rounded-[4px] border transition-transform cursor-pointer ${
                            isBgSelected
                              ? 'border-[#f5c41a] ring-1 ring-[#f5c41a] ring-offset-1'
                              : 'border-neutral-200 hover:scale-110'
                          }`}
                          style={{
                            backgroundColor: c === 'transparent' ? '#fff' : c,
                            backgroundImage:
                              c === 'transparent'
                                ? 'linear-gradient(to bottom right, transparent 45%, #ef4444 45%, #ef4444 55%, transparent 55%)'
                                : 'none',
                          }}
                        />
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-10 gap-1.5">
                    {BG_COLORS_DARK.map((c) => {
                      const isBgSelected = groupBgColor.toLowerCase() === c.toLowerCase();
                      return (
                        <button
                          key={c}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            selectedTexts.forEach((t) => {
                              const el = document.getElementById(`editable-${t.id}`);
                              if (el) {
                                applyWholeBlockFormatting(el, 'bgColor', c);
                                onUpdateText(t.id, { bgColor: c, text: el.innerHTML });
                              } else {
                                onUpdateText(t.id, { bgColor: c });
                              }
                            });
                          }}
                          className={`w-6 h-6 rounded-[4px] border border-black/10 transition-transform cursor-pointer ${
                            isBgSelected ? 'ring-1 ring-[#f5c41a] ring-offset-1' : 'hover:scale-110'
                          }`}
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
            <div className="relative">
              <div
                className={`flex items-center justify-between w-[56px] h-8 px-1 rounded-md hover:bg-neutral-100 transition-colors mx-0.5 cursor-pointer ${
                  activePopup === 'size' ? 'bg-neutral-100' : ''
                }`}
                onClick={() => setActivePopup(activePopup === 'size' ? null : 'size')}
              >
                <input
                  type="text"
                  className="w-7 h-full bg-transparent text-center font-medium text-[14px] outline-none text-neutral-800 cursor-pointer pointer-events-none"
                  value={groupFontSize === 'mixed' ? '-' : groupFontSize}
                  readOnly
                />
                <ChevronDown size={14} className="text-neutral-500 cursor-pointer" />
              </div>
              {activePopup === 'size' && (
                <FloatingSubmenu
                  isToolbarAbove={pos.isAbove}
                  align="center"
                  className="bg-white border border-neutral-200 shadow-[0_8px_30px_rgba(0,0,0,0.18)] rounded-xl py-1 w-[72px] z-[25000]"
                >
                  {FONT_SIZES.map((sz) => (
                    <button
                      key={sz}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        selectedTexts.forEach((t) => {
                          const el = document.getElementById(`editable-${t.id}`);
                          if (el) {
                            applyWholeBlockFormatting(el, 'fontSize', sz);
                            onUpdateText(t.id, { fontSize: sz, text: el.innerHTML });
                          } else {
                            onUpdateText(t.id, { fontSize: sz });
                          }
                        });
                        setActivePopup(null);
                      }}
                      className={`w-full text-center py-1 text-[13px] hover:bg-neutral-100 font-medium cursor-pointer ${
                        groupFontSize === sz ? 'bg-[#f5c41a]/15 text-[#d97706] font-bold' : 'text-neutral-800'
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </FloatingSubmenu>
              )}
            </div>

            <div className="w-px h-5 bg-neutral-200 mx-0.5" />

            {/* Rich Text Format Popover Dropdown (A≡ button) */}
            <div className="relative">
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setActivePopup(activePopup === 'format' ? null : 'format')}
                className={`flex items-center justify-between gap-1 w-[46px] h-8 px-1.5 rounded-md hover:bg-neutral-100 transition-colors cursor-pointer ${
                  activePopup === 'format' ? 'bg-neutral-100' : ''
                }`}
                title="Menu định dạng chữ"
              >
                <div className="flex items-center text-neutral-800">
                  <span className="font-sans font-medium text-[17px]">A</span>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    className="-ml-0.5 mt-0.5"
                  >
                    <path d="M4 6h16M4 12h10M4 18h14" />
                  </svg>
                </div>
                <ChevronDown size={14} className="text-neutral-500" />
              </button>
              {activePopup === 'format' && (
                <FloatingSubmenu
                  isToolbarAbove={pos.isAbove}
                  align="center"
                  className="bg-white border border-neutral-200/90 shadow-[0_8px_30px_rgba(0,0,0,0.18)] rounded-2xl p-2.5 w-[220px] flex flex-col animate-in fade-in duration-150 z-[25000]"
                >
                  {/* Row 1: Normal, Numbered List, Bulleted List */}
                  {(() => {
                    const firstHtml = selectedTexts[0]?.text || '';
                    const isOl = /<ol\b/i.test(firstHtml);
                    const isUl = /<ul\b/i.test(firstHtml);
                    const isNormalText = !isOl && !isUl;

                    return (
                      <>
                        <div className="bg-[#F0F2F6] rounded-xl p-1 flex items-center justify-between gap-1">
                          <button
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              selectedTexts.forEach((t) => {
                                const el = document.getElementById(`editable-${t.id}`);
                                const updated = removeListFormat(el, t.text || '');
                                onUpdateText(t.id, { text: updated });
                              });
                            }}
                            className={`flex-1 h-8 rounded-lg font-sans font-semibold text-[16px] flex items-center justify-center transition-colors cursor-pointer ${
                              isNormalText ? 'bg-[#fdebc2] text-[#d97706] shadow-2xs' : 'text-neutral-800 hover:bg-white/60'
                            }`}
                            title="Văn bản thường"
                          >
                            T
                          </button>

                          <button
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              selectedTexts.forEach((t) => {
                                const el = document.getElementById(`editable-${t.id}`);
                                const updated = toggleListFormat(el, t.text || '', 'ol');
                                onUpdateText(t.id, { text: updated });
                              });
                            }}
                            className={`flex-1 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                              isOl ? 'bg-[#fdebc2] text-[#d97706] shadow-2xs' : 'text-neutral-800 hover:bg-white/60'
                            }`}
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
                              selectedTexts.forEach((t) => {
                                const el = document.getElementById(`editable-${t.id}`);
                                const updated = toggleListFormat(el, t.text || '', 'ul');
                                onUpdateText(t.id, { text: updated });
                              });
                            }}
                            className={`flex-1 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                              isUl ? 'bg-[#fdebc2] text-[#d97706] shadow-2xs' : 'text-neutral-800 hover:bg-white/60'
                            }`}
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

                        {/* Row 2: B, I, U, S, Shadow */}
                        <div className="bg-[#F0F2F6] rounded-xl p-1 flex items-center justify-between gap-1 mt-2">
                          <button
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              const nextBold = !allGroupBold;
                              selectedTexts.forEach((t, idx) => {
                                const el = document.getElementById(`editable-${t.id}`);
                                if (el) {
                                  const updatedHtml = applyWholeBlockFormatting(el, 'bold', nextBold);
                                  onUpdateText(t.id, { isBold: nextBold, text: updatedHtml }, idx > 0);
                                } else {
                                  onUpdateText(t.id, { isBold: nextBold }, idx > 0);
                                }
                              });
                            }}
                            className={`flex-1 h-8 rounded-lg flex justify-center items-center font-bold text-[15px] transition-colors cursor-pointer ${
                              allGroupBold ? 'bg-[#fdebc2] text-[#d97706] shadow-2xs' : 'text-neutral-800 hover:bg-white/60'
                            }`}
                            title="In đậm (Bold)"
                          >
                            B
                          </button>

                          <button
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              const nextItalic = !allGroupItalic;
                              selectedTexts.forEach((t, idx) => {
                                const el = document.getElementById(`editable-${t.id}`);
                                if (el) {
                                  const updatedHtml = applyWholeBlockFormatting(el, 'italic', nextItalic);
                                  onUpdateText(t.id, { isItalic: nextItalic, text: updatedHtml }, idx > 0);
                                } else {
                                  onUpdateText(t.id, { isItalic: nextItalic }, idx > 0);
                                }
                              });
                            }}
                            className={`flex-1 h-8 rounded-lg flex justify-center items-center text-[15px] transition-colors cursor-pointer ${
                              allGroupItalic ? 'bg-[#fdebc2] text-[#d97706] shadow-2xs' : 'text-neutral-800 hover:bg-white/60'
                            }`}
                            title="In nghiêng (Italic)"
                          >
                            <span className="italic font-serif font-medium">I</span>
                          </button>

                          <button
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              const nextUnderline = !allGroupUnderline;
                              selectedTexts.forEach((t, idx) => {
                                const el = document.getElementById(`editable-${t.id}`);
                                if (el) {
                                  const updatedHtml = applyWholeBlockFormatting(el, 'underline', nextUnderline);
                                  onUpdateText(t.id, { isUnderline: nextUnderline, text: updatedHtml }, idx > 0);
                                } else {
                                  onUpdateText(t.id, { isUnderline: nextUnderline }, idx > 0);
                                }
                              });
                            }}
                            className={`flex-1 h-8 rounded-lg flex justify-center items-center text-[15px] transition-colors cursor-pointer ${
                              allGroupUnderline ? 'bg-[#fdebc2] text-[#d97706] shadow-2xs' : 'text-neutral-800 hover:bg-white/60'
                            }`}
                            title="Gạch chân (Underline)"
                          >
                            <span className="underline font-medium">U</span>
                          </button>

                          <button
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              const nextStrikethrough = !allGroupStrikethrough;
                              selectedTexts.forEach((t, idx) => {
                                const el = document.getElementById(`editable-${t.id}`);
                                if (el) {
                                  const updatedHtml = applyWholeBlockFormatting(el, 'strikethrough', nextStrikethrough);
                                  onUpdateText(t.id, { isStrikethrough: nextStrikethrough, text: updatedHtml }, idx > 0);
                                } else {
                                  onUpdateText(t.id, { isStrikethrough: nextStrikethrough }, idx > 0);
                                }
                              });
                            }}
                            className={`flex-1 h-8 rounded-lg flex justify-center items-center text-[15px] transition-colors cursor-pointer ${
                              allGroupStrikethrough ? 'bg-[#fdebc2] text-[#d97706] shadow-2xs' : 'text-neutral-800 hover:bg-white/60'
                            }`}
                            title="Gạch ngang text (Strikethrough)"
                          >
                            <span className="line-through font-medium">S</span>
                          </button>

                          <button
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              const nextShadow = !allGroupShadow;
                              selectedTexts.forEach((t) => onUpdateText(t.id, { hasShadow: nextShadow }));
                            }}
                            className={`flex-1 h-8 rounded-lg flex justify-center items-center transition-colors cursor-pointer ${
                              allGroupShadow ? 'bg-[#fdebc2] shadow-2xs' : 'hover:bg-white/60'
                            }`}
                            title="Tạo bóng cho nền text"
                          >
                            <div
                              className={`w-4 h-4 flex items-center justify-center rounded-[2px] border ${
                                allGroupShadow ? 'border-[#d97706] bg-[#fdebc2]' : 'border-neutral-500 bg-white'
                              }`}
                              style={{ boxShadow: '2px 2px 0px rgba(0,0,0,0.3)' }}
                            >
                              <span className={`text-[10px] font-bold ${allGroupShadow ? 'text-[#d97706]' : 'text-neutral-700'}`}>
                                A
                              </span>
                            </div>
                          </button>
                        </div>
                      </>
                    );
                  })()}

                  {/* Divider */}
                  <div className="w-full h-px bg-neutral-200/80 my-2.5" />

                  {/* Row 3: Align Left, Align Center, Align Right */}
                  <div className="bg-[#F0F2F6] rounded-xl p-1 flex items-center justify-between gap-1">
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        selectedTexts.forEach((t) => {
                          const el = document.getElementById(`editable-${t.id}`);
                          if (el) {
                            onUpdateText(t.id, { textAlign: 'left', text: el.innerHTML });
                          } else {
                            onUpdateText(t.id, { textAlign: 'left' });
                          }
                        });
                      }}
                      className={`flex-1 h-8 rounded-lg flex justify-center items-center relative transition-colors cursor-pointer ${
                        groupAlign === 'left' ? 'bg-[#fdebc2] text-[#d97706] shadow-2xs' : 'text-neutral-800 hover:bg-white/60'
                      }`}
                      title="Căn lề trái"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <line x1="3" y1="12" x2="15" y2="12" />
                        <line x1="3" y1="18" x2="18" y2="18" />
                      </svg>
                      {groupAlign === 'left' && (
                        <div className="absolute bottom-1 w-4 h-[2px] bg-[#d97706] rounded-full" />
                      )}
                    </button>

                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        selectedTexts.forEach((t) => {
                          const el = document.getElementById(`editable-${t.id}`);
                          if (el) {
                            onUpdateText(t.id, { textAlign: 'center', text: el.innerHTML });
                          } else {
                            onUpdateText(t.id, { textAlign: 'center' });
                          }
                        });
                      }}
                      className={`flex-1 h-8 rounded-lg flex justify-center items-center relative transition-colors cursor-pointer ${
                        groupAlign === 'center' ? 'bg-[#fdebc2] text-[#d97706] shadow-2xs' : 'text-neutral-800 hover:bg-white/60'
                      }`}
                      title="Căn giữa"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <line x1="6" y1="12" x2="18" y2="12" />
                        <line x1="4" y1="18" x2="20" y2="18" />
                      </svg>
                      {groupAlign === 'center' && (
                        <div className="absolute bottom-1 w-4 h-[2px] bg-[#d97706] rounded-full" />
                      )}
                    </button>

                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        selectedTexts.forEach((t) => {
                          const el = document.getElementById(`editable-${t.id}`);
                          if (el) {
                            onUpdateText(t.id, { textAlign: 'right', text: el.innerHTML });
                          } else {
                            onUpdateText(t.id, { textAlign: 'right' });
                          }
                        });
                      }}
                      className={`flex-1 h-8 rounded-lg flex justify-center items-center relative transition-colors cursor-pointer ${
                        groupAlign === 'right' ? 'bg-[#fdebc2] text-[#d97706] shadow-2xs' : 'text-neutral-800 hover:bg-white/60'
                      }`}
                      title="Căn lề phải"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <line x1="9" y1="12" x2="21" y2="12" />
                        <line x1="6" y1="18" x2="21" y2="18" />
                      </svg>
                      {groupAlign === 'right' && (
                        <div className="absolute bottom-1 w-4 h-[2px] bg-[#d97706] rounded-full" />
                      )}
                    </button>
                  </div>
                </FloatingSubmenu>
              )}
            </div>

            <div className="w-px h-5 bg-neutral-200 mx-0.5" />

            {/* Lock button */}
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                selectedTexts.forEach((t) => onUpdateText(t.id, { isLocked: true }));
                setActivePopup(null);
              }}
              className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-neutral-100 text-neutral-700 transition-colors cursor-pointer"
              title="Khóa tất cả khối đã chọn"
            >
              <Lock size={15} />
            </button>

            {/* Delete button */}
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                selectedTexts.forEach((t) => onDeleteText(t.id));
                setActivePopup(null);
              }}
              className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-red-50 text-red-600 transition-colors cursor-pointer"
              title="Xóa tất cả khối đã chọn"
            >
              <Trash2 size={15} />
            </button>
          </>
        )}
      </div>
    );
  };

  return createPortal(
    <div
      ref={toolbarRef}
      className="unified-group-toolbar fixed z-[90000] pointer-events-auto select-none"
      style={{
        maxWidth: 'calc(100vw - 20px)',
        left: `${pos.left}px`,
        top: `${pos.top}px`,
        visibility: pos.isVisible ? 'visible' : 'hidden',
        opacity: pos.isVisible ? 1 : 0,
        pointerEvents: isDraggingRef.current ? 'none' : 'auto',
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {isBoxGroup && renderBoxGroupToolbar()}
      {isTextGroup && renderTextGroupToolbar()}
    </div>,
    document.body
  );
};
