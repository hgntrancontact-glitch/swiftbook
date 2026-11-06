const fs = require('fs');

const newSimulatedSelectionCode = `import React, { useRef, useState, useEffect } from 'react';
import { HighlightAnnotation, NormalizedRect, HighlightColor } from '../types';

interface SimulatedSelectionLayerProps {
  pageNumber: number;
  scale: number;
  isActive: boolean;
  highlightColor: HighlightColor;
  onAddHighlight: (highlight: HighlightAnnotation) => void;
}

interface PendingBox {
  minX: number;
  maxX: number;
  y: number;
  width: number;
  lineHeight: number;
  normalizedRect: NormalizedRect;
}

export const SimulatedSelectionLayer: React.FC<SimulatedSelectionLayerProps> = ({
  pageNumber,
  scale,
  isActive,
  highlightColor,
  onAddHighlight,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentPos, setCurrentPos] = useState<{ x: number; y: number } | null>(null);
  const [pendingSelection, setPendingSelection] = useState<PendingBox | null>(null);
  const lastRightClickTimeRef = useRef<number>(0);

  // Constants for simulated line height
  const BASE_LINE_HEIGHT = 20;

  useEffect(() => {
    if (!isActive) {
      setStartPos(null);
      setCurrentPos(null);
      setIsDragging(false);
      setPendingSelection(null);
    }
  }, [isActive]);

  // Global listener: if user clicks left mouse anywhere outside this pending selection, dismiss it!
  useEffect(() => {
    const handleGlobalMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return; // Only for left click
      const target = e.target as HTMLElement;
      // If clicking inside the pending selection, don't dismiss immediately
      if (target.closest('.pending-simulated-selection')) {
        return;
      }
      // If clicking elsewhere, dismiss pending selection
      setPendingSelection(null);
    };

    window.addEventListener('mousedown', handleGlobalMouseDown);
    return () => {
      window.removeEventListener('mousedown', handleGlobalMouseDown);
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isActive || e.button !== 0) return;

    // Ignore clicks on existing annotations or interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('.annotation-interactive-element, button, .sticky-note-paper')) {
      return;
    }

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setStartPos({ x, y });
    setCurrentPos({ x, y });
    setIsDragging(false);
    // Don't clear pendingSelection right away until user actually starts dragging
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!startPos) return;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const dist = Math.hypot(x - startPos.x, y - startPos.y);
    if (dist > 3) {
      setIsDragging(true);
      setPendingSelection(null); // Clear previous pending selection when dragging a new one
    }

    setCurrentPos({ x, y });
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!startPos || !currentPos) {
      setIsDragging(false);
      setStartPos(null);
      setCurrentPos(null);
      return;
    }

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      setIsDragging(false);
      setStartPos(null);
      setCurrentPos(null);
      return;
    }

    const endX = e.clientX - rect.left;
    const minX = Math.min(startPos.x, endX);
    const maxX = Math.max(startPos.x, endX);
    const width = maxX - minX;

    // Minimum drag distance to count as selection
    if (width > 8 && isDragging) {
      const lineHeight = BASE_LINE_HEIGHT * scale;
      const y = startPos.y - lineHeight / 2;

      const normalizedRect: NormalizedRect = {
        x: (minX / rect.width) * 100,
        y: (y / rect.height) * 100,
        width: (width / rect.width) * 100,
        height: (lineHeight / rect.height) * 100,
      };

      // Set as pending temporary selection (khối nền xanh nhạt tạm thời)
      setPendingSelection({
        minX,
        maxX,
        y,
        width,
        lineHeight,
        normalizedRect,
      });
    }

    setIsDragging(false);
    setStartPos(null);
    setCurrentPos(null);
  };

  // Convert pending selection to permanent highlight
  const commitHighlight = () => {
    if (!pendingSelection) return;

    const newHighlight: HighlightAnnotation = {
      id: crypto.randomUUID(),
      pageNumber,
      text: '', // Simulated selection
      color: highlightColor,
      rects: [pendingSelection.normalizedRect],
      createdAt: Date.now(),
    };

    onAddHighlight(newHighlight);
    setPendingSelection(null);
  };

  // Handle double right-click on the pending selection
  const handleContextMenu = (e: React.MouseEvent) => {
    if (!pendingSelection) return;
    e.preventDefault();
    e.stopPropagation();

    const now = Date.now();
    if (now - lastRightClickTimeRef.current < 450) {
      // Double right click detected!
      commitHighlight();
      lastRightClickTimeRef.current = 0;
    } else {
      lastRightClickTimeRef.current = now;
    }
  };

  // Active dragging rectangle
  let draggingStyle: React.CSSProperties = { display: 'none' };
  if (isDragging && startPos && currentPos) {
    const minX = Math.min(startPos.x, currentPos.x);
    const maxX = Math.max(startPos.x, currentPos.x);
    const width = maxX - minX;
    const lineHeight = BASE_LINE_HEIGHT * scale;
    const y = startPos.y - lineHeight / 2;

    draggingStyle = {
      position: 'absolute',
      left: \`\${minX}px\`,
      top: \`\${y}px\`,
      width: \`\${width}px\`,
      height: \`\${lineHeight}px\`,
      backgroundColor: 'rgba(59, 130, 246, 0.3)',
      pointerEvents: 'none',
      zIndex: 50,
    };
  }

  return (
    <div
      ref={containerRef}
      className={\`absolute inset-0 z-[15] \${
        !isActive
          ? 'pointer-events-none'
          : isDragging
          ? 'cursor-text pointer-events-auto'
          : 'cursor-default pointer-events-auto'
      }\`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Live dragging rectangle */}
      {isDragging && <div style={draggingStyle} />}

      {/* Pending simulated selection overlay */}
      {pendingSelection && !isDragging && (
        <div
          className="pending-simulated-selection absolute cursor-pointer select-none transition-all"
          style={{
            left: \`\${pendingSelection.minX}px\`,
            top: \`\${pendingSelection.y}px\`,
            width: \`\${pendingSelection.width}px\`,
            height: \`\${pendingSelection.lineHeight}px\`,
            backgroundColor: 'rgba(59, 130, 246, 0.35)',
            border: '1px solid rgba(37, 99, 235, 0.5)',
            borderRadius: '2px',
            zIndex: 45,
          }}
          onContextMenu={handleContextMenu}
          onClick={(e) => {
            e.stopPropagation();
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            commitHighlight();
          }}
          title="Nhấp đúp chuột phải (hoặc đúp chuột trái) để lưu Highlight. Nhấp chuột trái ra ngoài để hủy."
        />
      )}
    </div>
  );
};
`;

fs.writeFileSync('src/components/SimulatedSelectionLayer.tsx', newSimulatedSelectionCode);
console.log('Successfully written new SimulatedSelectionLayer.tsx');
