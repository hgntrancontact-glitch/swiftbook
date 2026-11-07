import React, { useRef, useState, useLayoutEffect, useEffect } from 'react';
import { WorkspaceDoc } from '../types';
import { FileText, Eye, EyeOff, X } from 'lucide-react';

interface TabBarProps {
  docs: WorkspaceDoc[];
  activeDocId: string;
  onSelectDoc: (id: string) => void;
  onToggleHide: (id: string) => void;
  onCloseDoc: (id: string) => void;
  onReorderDocs: (sourceId: string, targetId: string, insertBefore: boolean) => void;
}

export const TabBar: React.FC<TabBarProps> = ({
  docs,
  activeDocId,
  onSelectDoc,
  onToggleHide,
  onCloseDoc,
  onReorderDocs,
}) => {
  const barRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef(new Map<string, HTMLDivElement>());
  const latestRef = useRef({ docs, onReorderDocs, onSelectDoc });
  latestRef.current = { docs, onReorderDocs, onSelectDoc };
  const dragInProgressRef = useRef(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragRef = useRef<{ id: string; clientX: number; startX: number; grabX: number; started: boolean } | null>(null);
  const frameRef = useRef<number | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const positionsRef = useRef(new Map<string, number>());
  const reorderPendingRef = useRef(false);

  const positionDraggedTab = () => {
    const drag = dragRef.current;
    const bar = barRef.current;
    const element = drag && tabsRef.current.get(drag.id);
    if (!drag || !bar || !element) return null;
    const rect = bar.getBoundingClientRect();
    const left = Math.max(rect.left + 6, Math.min(rect.right - element.offsetWidth - 6, drag.clientX - drag.grabX));
    const baseLeft = rect.left + element.offsetLeft - bar.scrollLeft;
    element.style.transform = `translateX(${left - baseLeft}px)`;
    return { center: left + element.offsetWidth / 2, barRect: rect };
  };
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar || !dragRef.current?.started) return;
    const rect = bar.getBoundingClientRect();
    tabsRef.current.forEach((element, id) => {
      const oldLeft = positionsRef.current.get(id);
      if (id === dragRef.current?.id || oldLeft === undefined) return;
      element.getAnimations().forEach((animation) => animation.cancel());
      const delta = oldLeft - (rect.left + element.offsetLeft - bar.scrollLeft);
      if (Math.abs(delta) > 0.5) element.animate([{ transform: `translateX(${delta}px)` }, { transform: 'translateX(0)' }], { duration: 140, easing: 'ease-out' });
    });
    positionsRef.current.clear();
    reorderPendingRef.current = false;
    positionDraggedTab();
  }, [docs, draggingId]);
  useEffect(() => () => cleanupRef.current?.(), []);

  const startPointerDrag = (event: React.PointerEvent<HTMLDivElement>, id: string) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
    event.preventDefault();
    cleanupRef.current?.();
    const element = event.currentTarget;
    const rect = element.getBoundingClientRect();
    dragRef.current = { id, clientX: event.clientX, startX: event.clientX, grabX: event.clientX - rect.left, started: false };
    const tick = () => {
      const drag = dragRef.current;
      const bar = barRef.current;
      if (!drag?.started || !bar) return;
      const rect = bar.getBoundingClientRect();
      if (drag.clientX < rect.left + 28) bar.scrollLeft -= 8;
      else if (drag.clientX > rect.right - 28) bar.scrollLeft += 8;
      const placed = positionDraggedTab();
      if (placed && !reorderPendingRef.current) {
        const current = latestRef.current.docs;
        const sourceIndex = current.findIndex((doc) => doc.id === drag.id);
        let targetIndex = sourceIndex;
        current.forEach((doc, index) => {
          if (doc.id === drag.id) return;
          const tab = tabsRef.current.get(doc.id);
          if (!tab) return;
          const center = rect.left + tab.offsetLeft - bar.scrollLeft + tab.offsetWidth / 2;
          if (index < sourceIndex && drag.clientX < center) targetIndex = Math.min(targetIndex, index);
          if (index > sourceIndex && drag.clientX > center) targetIndex = Math.max(targetIndex, index);
        });
        if (targetIndex >= 0 && targetIndex !== sourceIndex) {
          tabsRef.current.forEach((tab, tabId) => positionsRef.current.set(tabId, tab.getBoundingClientRect().left));
          reorderPendingRef.current = true;
          latestRef.current.onReorderDocs(drag.id, current[targetIndex].id, targetIndex < sourceIndex);
        }
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== event.pointerId || !dragRef.current) return;
      moveEvent.preventDefault();
      const drag = dragRef.current;
      drag.clientX = moveEvent.clientX;
      if (!drag.started && Math.abs(drag.clientX - drag.startX) >= 4) {
        drag.started = true;
        dragInProgressRef.current = true;
        setDraggingId(id);
        latestRef.current.onSelectDoc(id);
        frameRef.current = requestAnimationFrame(tick);
      }
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      dragRef.current = null;
      reorderPendingRef.current = false;
      element.style.transform = '';
    };
    const finish = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== event.pointerId) return;
      const started = dragRef.current?.started;
      const from = element.style.transform;
      cleanup();
      cleanupRef.current = null;
      setDraggingId(null);
      if (started) {
        element.animate([{ transform: from }, { transform: 'translateX(0)' }], { duration: 120, easing: 'ease-out' });
        latestRef.current.onSelectDoc(id);
        window.setTimeout(() => { dragInProgressRef.current = false; }, 150);
      }
    };
    cleanupRef.current = cleanup;
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };
  if (docs.length === 0) return null;

  return (
    <div
      ref={barRef}
      role="tablist"
      aria-label="Thanh tài liệu đang mở"
      className="relative flex items-center h-9 bg-[#f3f4f6] border-b border-neutral-200/90 px-1.5 overflow-x-auto no-scrollbar shrink-0 select-none gap-1 font-['Inter',sans-serif]"
    >
      {docs.map((doc) => {
        const isActive = doc.id === activeDocId;
        const isHidden = doc.isHidden;

        return (
          <div
            key={doc.id}
            ref={(element) => { if (element) tabsRef.current.set(doc.id, element); else tabsRef.current.delete(doc.id); }}
            data-tab-id={doc.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => {
              if (dragInProgressRef.current) {
                dragInProgressRef.current = false;
                return;
              }
              onSelectDoc(doc.id);
            }}
            draggable={false}
            onDragStart={(event) => event.preventDefault()}
            onPointerDown={(event) => startPointerDrag(event, doc.id)}
            style={{ zIndex: draggingId === doc.id ? 30 : undefined, touchAction: 'pan-y' }}
            title={doc.fileName}
            className={`group relative flex items-center h-[30px] px-2.5 rounded-t-md transition-colors ${draggingId === doc.id ? 'cursor-grabbing' : 'cursor-pointer'} text-xs shrink-0 max-w-[240px] gap-1.5 border-b-0 ${
              isActive
                ? 'bg-white text-neutral-900 border-t-2 border-t-neutral-900 border-x border-neutral-200/90 shadow-2xs font-semibold'
                : 'bg-neutral-200/50 hover:bg-neutral-200/80 text-neutral-600 hover:text-neutral-900 border-t-2 border-t-transparent border-x border-transparent font-medium'
            } ${isHidden ? 'opacity-60 bg-neutral-200/30 italic text-neutral-400' : ''}`}
          >
            {/* File Icon */}
            <FileText
              size={13}
              className={`shrink-0 ${
                isActive
                  ? 'text-neutral-800'
                  : isHidden
                  ? 'text-neutral-400'
                  : 'text-neutral-500 group-hover:text-neutral-700'
              }`}
            />

            {/* File Name */}
            <span className="truncate max-w-[130px] sm:max-w-[170px] leading-none">
              {doc.fileName || 'Tài liệu không tên'}
            </span>

            {/* Actions: Eye / EyeOff & Close */}
            <div className="flex items-center gap-0.5 ml-1 shrink-0">
              {/* Eye Off (khi đang hiển thị) / Eye (khi đã ẩn) */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleHide(doc.id);
                }}
                className={`p-1 rounded hover:bg-neutral-200/70 transition-colors cursor-pointer ${
                  isHidden
                    ? 'text-neutral-400 hover:text-neutral-700'
                    : 'text-neutral-600 hover:text-neutral-900 font-medium'
                }`}
                title={isHidden ? 'Hiển thị lại PDF' : 'Ẩn PDF'}
                aria-label={isHidden ? 'Hiển thị lại PDF' : 'Ẩn PDF'}
              >
                {isHidden ? (
                  <EyeOff size={13} className="hover:scale-110 transition-transform" />
                ) : (
                  <Eye size={13} className="hover:scale-110 transition-transform" />
                )}
              </button>

              {/* Close Button X */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseDoc(doc.id);
                }}
                className="p-1 rounded text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                title="Đóng PDF"
                aria-label="Đóng PDF"
              >
                <X size={13} className="hover:scale-110 transition-transform" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
