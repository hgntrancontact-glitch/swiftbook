import React from 'react';
import { WorkspaceDoc } from '../types';
import { FileText, Eye, EyeOff, X } from 'lucide-react';

interface TabBarProps {
  docs: WorkspaceDoc[];
  activeDocId: string;
  onSelectDoc: (id: string) => void;
  onToggleHide: (id: string) => void;
  onCloseDoc: (id: string) => void;
  onReorderDocs: (sourceId: string, targetId: string) => void;
}

export const TabBar: React.FC<TabBarProps> = ({
  docs,
  activeDocId,
  onSelectDoc,
  onToggleHide,
  onCloseDoc,
  onReorderDocs,
}) => {
  if (docs.length === 0) return null;

  return (
    <div
      role="tablist"
      aria-label="Thanh tài liệu đang mở"
      className="flex items-center h-9 bg-[#f3f4f6] border-b border-neutral-200/90 px-1.5 overflow-x-auto no-scrollbar shrink-0 select-none gap-1 font-['Inter',sans-serif]"
    >
      {docs.map((doc) => {
        const isActive = doc.id === activeDocId;
        const isHidden = doc.isHidden;

        return (
          <div
            key={doc.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelectDoc(doc.id)}
            draggable
            onDragStart={(event) => {
              if ((event.target as HTMLElement).closest('button')) {
                event.preventDefault();
                return;
              }
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', doc.id);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(event) => {
              event.preventDefault();
              const sourceId = event.dataTransfer.getData('text/plain');
              if (sourceId && sourceId !== doc.id) onReorderDocs(sourceId, doc.id);
            }}
            title={doc.fileName}
            className={`group relative flex items-center h-[30px] px-2.5 rounded-t-md transition-all cursor-pointer text-xs shrink-0 max-w-[240px] gap-1.5 border-b-0 ${
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
