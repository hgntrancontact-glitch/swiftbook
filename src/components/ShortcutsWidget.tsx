import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle, Keyboard, X } from 'lucide-react';

export const ShortcutsWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const widgetRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (widgetRef.current && !widgetRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      window.addEventListener('mousedown', handleClickOutside);
    }
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const shortcutList = [
    { key: 'V', label: 'Công cụ chọn & di chuyển (Selection Tool)' },
    { key: 'P', label: 'Vẽ tự do' },
    { key: 'P (x2)', label: 'Vẽ thông minh (Smart Draw)' },
    { key: 'H', label: 'Highlight tự do' },
    { key: 'H (x2)', label: 'Highlight thông minh (Smart Highlight)' },
    { key: 'T', label: 'Nhập khối văn bản (Text Box)' },
    { key: 'D', label: 'Vẽ khối Box (Rectangle Tool)' },
    { key: 'N', label: 'Tạo ghi chú (Note)' },
    { key: 'Z', label: 'Quay lại 100% tỷ lệ phóng (Fit to Page)' },
    { key: '⌘ + Z / Ctrl + Z', label: 'Hoàn tác (Undo)' },
    { key: '⌘ + Shift + Z', label: 'Làm lại (Redo)' },
  ];

  return (
    <div ref={widgetRef} className="fixed bottom-5 right-5 z-[100] select-none font-['Inter',sans-serif]">
      {/* Popover Menu */}
      {isOpen && (
        <div className="absolute bottom-full right-0 mb-3 w-80 sm:w-88 bg-white rounded-2xl shadow-2xl border border-neutral-200/90 p-4.5 text-neutral-900">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-150">
            <div className="flex items-center gap-2">
              
              <div>
                <h3 className="text-sm font-bold text-neutral-950 tracking-tight">
                  Keyboard Shortcuts
                </h3>
                <p className="text-[11px] text-neutral-500 font-medium">Bảng hướng dẫn phím tắt nhanh</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
              title="Đóng"
            >
              <X size={15} />
            </button>
          </div>

          <div className="mt-3 space-y-2 max-h-72 overflow-y-auto pr-1 text-xs">
            {shortcutList.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-neutral-50 transition-colors"
              >
                <span className="text-neutral-700 font-medium text-[12px]">{item.label}</span>
                <kbd className="px-2 py-1 font-['Inter',sans-serif] text-[11px] text-neutral-800 font-semibold whitespace-nowrap">
                  {item.key}
                </kbd>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Floating Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-11 h-11 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 ${
          isOpen
            ? 'bg-neutral-950 text-[#f5c41a] scale-105 ring-4 ring-neutral-900/20'
            : 'bg-[#f5c41a] text-neutral-950 hover:bg-[#eab308] hover:scale-105 active:scale-95 border border-[#e5b512]'
        }`}
        title="Hướng dẫn phím tắt (?)"
      >
        <HelpCircle size={22} className="stroke-[2.25]" />
      </button>
    </div>
  );
};
