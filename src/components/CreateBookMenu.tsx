import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Check } from 'lucide-react';
import {
  BOOK_COLOR_PALETTE,
  CustomBookConfig,
  isDarkColor,
} from '../utils/customBookGenerator';

interface CreateBookMenuProps {
  isCreated: boolean;
  onAddPage: () => void;
  onCreateBook: (config: CustomBookConfig) => void;
}

export const CreateBookMenu: React.FC<CreateBookMenuProps> = ({
  isCreated,
  onAddPage,
  onCreateBook,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedOrientation, setSelectedOrientation] = useState<'portrait' | 'landscape' | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const updatePosition = () => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const right = Math.max(8, window.innerWidth - rect.right);
      const top = rect.bottom + 6;
      setCoords({ top, right });
    }
  };

  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition();
    }
  }, [isOpen]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleScrollOrResize = () => {
      if (isOpen) {
        updatePosition();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      window.addEventListener('resize', handleScrollOrResize);
      window.addEventListener('scroll', handleScrollOrResize, true);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isOpen]);

  const handleCreate = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedOrientation || !selectedColor) return;
    onCreateBook({
      orientation: selectedOrientation,
      bgColor: selectedColor,
    });
    setIsOpen(false);
  };

  // If already created, render "+ Thêm trang" button with direct 1-click execution
  if (isCreated) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onAddPage();
        }}
        className="h-[26px] flex items-center gap-1 px-2.5 bg-neutral-100 hover:bg-neutral-200 active:scale-95 text-neutral-900 rounded-md text-xs font-semibold border border-neutral-300 transition-all shadow-xs cursor-pointer select-none whitespace-nowrap"
      >
        <Plus size={13} className="text-neutral-900" />
        <span>Thêm trang</span>
      </button>
    );
  }

  const isFormValid = Boolean(selectedOrientation && selectedColor);

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger button: "+ Tạo" */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        className={`h-[26px] flex items-center gap-1 px-2.5 bg-neutral-100 hover:bg-neutral-200 active:scale-95 text-neutral-900 rounded-md text-xs font-semibold border border-neutral-300 transition-all shadow-xs cursor-pointer select-none whitespace-nowrap ${
          isOpen ? 'ring-1 ring-neutral-300 bg-neutral-200 border-neutral-400' : ''
        }`}
      >
        <Plus size={13} className="text-neutral-900" />
        <span>Tạo</span>
      </button>

      {/* Popover Menu: 286px */}
      {isOpen &&
        coords &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              right: `${coords.right}px`,
            }}
            className="w-[286px] bg-white rounded-xl shadow-2xl border border-neutral-200 p-3.5 z-[999999] animate-in fade-in zoom-in-95 duration-100 flex flex-col text-left font-['Inter',sans-serif]"
          >
            {/* Tiêu đề Menu: Tạo trang sách */}
            <div className="text-xs font-bold text-neutral-900 tracking-tight mb-3 select-none">
              Tạo trang sách
            </div>

            {/* Hàng 1: 1. Chọn khổ giấy */}
            <div className="mb-3">
              <div className="text-[11px] font-semibold text-neutral-600 mb-1.5 select-none">
                1. Chọn khổ giấy
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedOrientation('portrait')}
                  className={`py-1.5 px-3 rounded-lg text-xs font-medium border transition-all text-center cursor-pointer select-none ${
                    selectedOrientation === 'portrait'
                      ? 'bg-neutral-900 text-white border-neutral-900 shadow-xs'
                      : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                  }`}
                >
                  A4 Dọc
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedOrientation('landscape')}
                  className={`py-1.5 px-3 rounded-lg text-xs font-medium border transition-all text-center cursor-pointer select-none ${
                    selectedOrientation === 'landscape'
                      ? 'bg-neutral-900 text-white border-neutral-900 shadow-xs'
                      : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                  }`}
                >
                  A4 Ngang
                </button>
              </div>
            </div>

            {/* Hàng 2: 2. Chọn màu nền (16 màu) */}
            <div className="mb-3.5">
              <div className="text-[11px] font-semibold text-neutral-600 mb-1.5 select-none">
                2. Chọn màu nền
              </div>
              <div className="grid grid-cols-8 gap-1.5">
                {BOOK_COLOR_PALETTE.map((hex) => {
                  const isSelected = selectedColor === hex;
                  const isDark = isDarkColor(hex);
                  return (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => setSelectedColor(hex)}
                      style={{ backgroundColor: hex }}
                      className={`h-6 w-6 rounded border transition-all flex items-center justify-center relative cursor-pointer ${
                        hex === '#FFFFFF' ? 'border-neutral-300' : 'border-black/10'
                      } ${
                        isSelected
                          ? 'scale-105 ring-2 ring-neutral-900 border-neutral-900 shadow-xs z-10'
                          : 'hover:scale-105'
                      }`}
                    >
                      {isSelected && (
                        <Check
                          size={12}
                          strokeWidth={3}
                          className={isDark ? 'text-white' : 'text-neutral-900'}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Hàng 3: Nút hành động "Tạo trang sách" */}
            <button
              type="button"
              disabled={!isFormValid}
              onClick={handleCreate}
              className={`w-full py-2 px-3 font-semibold text-xs rounded-lg transition-all text-center select-none ${
                isFormValid
                  ? 'bg-[#f5c41a] hover:bg-[#e1b418] text-neutral-950 shadow-xs cursor-pointer active:scale-98'
                  : 'bg-neutral-200 text-neutral-400 opacity-60 cursor-not-allowed'
              }`}
            >
              Tạo trang sách
            </button>
          </div>,
          document.body
        )}
    </div>
  );
};
