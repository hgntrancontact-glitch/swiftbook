import React, { useState, useEffect, useRef } from 'react';

interface ImageOrderModalProps {
  isOpen: boolean;
  files: File[];
  onClose: () => void;
  onConfirm: (orderedFiles: File[]) => void;
}

interface FileItem {
  id: string;
  file: File;
  previewUrl: string;
}

export function ImageOrderModal({
  isOpen,
  files,
  onClose,
  onConfirm,
}: ImageOrderModalProps) {
  const [items, setItems] = useState<FileItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Mặc định khởi tạo: Giữ nguyên vẹn 100% thứ tự các file trong danh sách bôi đen từ trên xuống dưới
  // File nằm trên cùng trong vùng bôi đen (files[0]) BẮT BUỘC là Trang 1, các file tiếp theo là Trang 2, Trang 3...
  useEffect(() => {
    if (!isOpen || !files || files.length === 0) {
      setItems([]);
      setSelectedIndex(0);
      setIsPreviewOpen(false);
      return;
    }

    const createdItems: FileItem[] = files.map((file, idx) => ({
      id: `${file.name}_${file.size}_${file.lastModified}_${idx}_${Date.now()}`,
      file,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
    }));

    setItems(createdItems);
    setSelectedIndex(0);
    setIsPreviewOpen(false);

    return () => {
      createdItems.forEach((item) => {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
    };
  }, [isOpen, files]);

  // Bắt phím Spacebar để Quick Preview & phím điều hướng
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Phím Space (Dấu cách)
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        setIsPreviewOpen((prev) => !prev);
        return;
      }

      // Phím Escape
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isPreviewOpen) {
          setIsPreviewOpen(false);
        } else {
          onClose();
        }
        return;
      }

      // Phím Enter (khi không bật Preview)
      if (e.key === 'Enter' && !isPreviewOpen && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        handleConfirm();
        return;
      }

      // Phím Mũi tên trái/phải hoặc lên/xuống để đổi ảnh chọn
      if (!isPreviewOpen) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex((prev) => (prev < items.length - 1 ? prev + 1 : prev));
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isPreviewOpen, items, selectedIndex]);

  if (!isOpen || items.length === 0) return null;

  // Đảo ngược toàn bộ thứ tự trang (1 -> N thành N -> 1)
  const handleReverse = () => {
    setItems((prev) => [...prev].reverse());
    setSelectedIndex((prev) => items.length - 1 - prev);
  };

  // Drag & Drop
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
    setSelectedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const updated = [...items];
    const [moved] = updated.splice(draggedIndex, 1);
    updated.splice(index, 0, moved);
    setDraggedIndex(index);
    setSelectedIndex(index);
    setItems(updated);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleConfirm = () => {
    const finalFiles = items.map((it) => it.file);
    onConfirm(finalFiles);
  };

  const currentSelectedItem = items[selectedIndex] || items[0];

  return (
    <div
      className="fixed inset-0 z-[999999] flex items-center justify-center bg-transparent font-['Inter',sans-serif]"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="relative flex flex-col w-[92vw] max-w-5xl h-[86vh] bg-white text-black shadow-[0_8px_32px_rgba(0,0,0,0.12)] select-none rounded-xl overflow-hidden border border-neutral-200/90"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header tối giản: Không icon, chữ đen nền trắng */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-neutral-200">
          <div>
            <h2 className="text-xl font-bold text-black tracking-tight">
              Quản lý và sắp xếp trang ({items.length} trang)
            </h2>
            <p className="text-sm text-neutral-500 mt-0.5">
              Click chọn ảnh và bấm phím Space để xem lớn. Kéo thả để đổi thứ tự trang.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleReverse}
              className="px-4 py-2 text-sm font-medium text-black bg-neutral-100 hover:bg-neutral-200 transition-colors"
            >
              Đảo ngược
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-neutral-600 hover:text-black hover:bg-neutral-100 transition-colors"
            >
              Hủy
            </button>

            <button
              type="button"
              onClick={handleConfirm}
              className="px-5 py-2 text-sm font-bold text-white bg-black hover:bg-neutral-800 transition-colors"
            >
              Tạo sách ngay
            </button>
          </div>
        </div>

        {/* Danh sách trang kéo thả trực quan */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
            {items.map((item, index) => {
              const isSelected = selectedIndex === index;
              const isDragging = draggedIndex === index;

              return (
                <div
                  key={item.id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  onClick={() => setSelectedIndex(index)}
                  onDoubleClick={() => setIsPreviewOpen(true)}
                  className={`group relative flex flex-col bg-white cursor-pointer transition-all duration-100 ${
                    isDragging
                      ? 'opacity-30'
                      : isSelected
                      ? 'ring-2 ring-black shadow-md'
                      : 'hover:shadow-sm'
                  }`}
                >
                  {/* Khung ảnh tối giản, không viền thừa */}
                  <div className="relative aspect-[3/4] w-full bg-neutral-100 flex items-center justify-center overflow-hidden">
                    {item.previewUrl ? (
                      <img
                        src={item.previewUrl}
                        alt={item.file.name}
                        className="w-full h-full object-contain pointer-events-none"
                      />
                    ) : (
                      <div className="text-xs text-neutral-400">Tệp tin</div>
                    )}

                    {/* Huy hiệu Trang */}
                    <div className="absolute top-2 left-2 px-2 py-0.5 text-xs font-bold bg-black text-white">
                      Trang {index + 1}
                    </div>
                  </div>

                  {/* Thông tin tên tệp */}
                  <div className="py-2 px-1">
                    <p className="text-xs font-medium text-black truncate" title={item.file.name}>
                      {item.file.name}
                    </p>
                    <p className="text-[11px] text-neutral-400 mt-0.5">
                      {new Date(item.file.lastModified).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      · {(item.file.size / 1024).toFixed(0)} KB
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer hướng dẫn phím tắt tinh gọn */}
        <div className="flex items-center justify-between px-8 py-3.5 border-t border-neutral-200 bg-neutral-50 text-xs text-neutral-600">
          <div>
            Đang chọn: <strong className="text-black">Trang {selectedIndex + 1}</strong> ({currentSelectedItem?.file.name})
          </div>
          <div className="flex items-center gap-4">
            <span>
              Phím <strong className="text-black font-semibold">Space</strong>: Xem ảnh lớn
            </span>
            <span>
              Phím <strong className="text-black font-semibold">Enter</strong>: Hoàn tất
            </span>
            <span>
              Phím <strong className="text-black font-semibold">Esc</strong>: Đóng
            </span>
          </div>
        </div>

        {/* Quick Preview lớn khi bấm phím Space */}
        {isPreviewOpen && currentSelectedItem && (
          <div
            className="absolute inset-0 z-50 flex flex-col bg-white p-6"
            onClick={() => setIsPreviewOpen(false)}
          >
            <div className="flex items-center justify-between pb-4 border-b border-neutral-200">
              <div>
                <span className="text-sm font-bold text-black">
                  Trang {selectedIndex + 1} / {items.length} — {currentSelectedItem.file.name}
                </span>
                <span className="text-xs text-neutral-500 ml-3">
                  (Nhấn Space hoặc Click để đóng xem trước)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="px-3 py-1 text-xs font-medium text-black bg-neutral-100 hover:bg-neutral-200"
              >
                Đóng xem trước
              </button>
            </div>

            <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
              {currentSelectedItem.previewUrl ? (
                <img
                  src={currentSelectedItem.previewUrl}
                  alt={currentSelectedItem.file.name}
                  className="max-w-full max-h-full object-contain shadow-lg"
                />
              ) : (
                <div className="text-neutral-400">Không có bản xem trước</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
