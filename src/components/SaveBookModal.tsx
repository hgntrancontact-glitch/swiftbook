import React, { useState, useEffect } from 'react';
import { Bookmark, BookCheck, Check, X, FolderPlus } from 'lucide-react';
import { SavedBook, BookGroup } from '../types';
import { saveBookToLibrary, getBookGroups } from '../utils/storage';
import { CustomBookConfig } from '../utils/customBookGenerator';

interface SaveBookModalDocItem {
  id: string;
  fileId: string;
  fileName: string;
  totalPages: number;
  currentPage: number;
  bookConfig?: CustomBookConfig | null;
}

interface SaveBookModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  fileId: string;
  totalPages: number;
  currentPage: number;
  bookConfig?: CustomBookConfig | null;
  onSaveBookTitle: (newTitle: string, targetFileId?: string) => void;
  onSelectSavedBook?: (savedBook: SavedBook) => void;
  openDocs?: SaveBookModalDocItem[];
}

export const SaveBookModal: React.FC<SaveBookModalProps> = ({
  isOpen,
  onClose,
  fileName,
  fileId,
  totalPages,
  currentPage,
  bookConfig,
  onSaveBookTitle,
  onSelectSavedBook,
  openDocs,
}) => {
  const [selectedDocId, setSelectedDocId] = useState<string>(fileId);
  const [bookTitleInput, setBookTitleInput] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [groups, setGroups] = useState<BookGroup[]>([]);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Active target doc details
  const activeDoc = openDocs && openDocs.length > 1
    ? openDocs.find((d) => d.fileId === selectedDocId || d.id === selectedDocId) || openDocs[0]
    : null;

  const effectiveFileName = activeDoc ? activeDoc.fileName : fileName;
  const effectiveFileId = activeDoc ? activeDoc.fileId : fileId;
  const effectiveTotalPages = activeDoc ? activeDoc.totalPages : totalPages;
  const effectiveCurrentPage = activeDoc ? activeDoc.currentPage : currentPage;
  const effectiveBookConfig = activeDoc ? activeDoc.bookConfig : bookConfig;

  useEffect(() => {
    if (isOpen) {
      setSelectedDocId(fileId);
      setBookTitleInput(fileName.replace(/\.pdf$/i, ''));
      setSaveSuccess(false);
      const loadedGroups = getBookGroups();
      setGroups(loadedGroups);
      setSelectedGroupId(loadedGroups[0]?.id || '');
    }
  }, [isOpen, fileName, fileId]);

  // When user switches document from dropdown
  const handleDocChange = (newDocId: string) => {
    setSelectedDocId(newDocId);
    const target = openDocs?.find((d) => d.fileId === newDocId || d.id === newDocId);
    if (target) {
      setBookTitleInput(target.fileName.replace(/\.pdf$/i, ''));
    }
  };

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const finalTitle = bookTitleInput.trim() || effectiveFileName;
    const currentGroup = groups.find((g) => g.id === selectedGroupId);

    const newSavedBook: SavedBook = {
      id: effectiveFileId,
      name: finalTitle,
      originalFileName: effectiveFileName,
      bookConfig: effectiveBookConfig || undefined,
      totalPages: effectiveTotalPages,
      lastReadPage: effectiveCurrentPage,
      savedAt: Date.now(),
      lastReadAt: Date.now(),
      groupId: currentGroup?.id,
      groupName: currentGroup?.name,
    };

    saveBookToLibrary(newSavedBook);
    onSaveBookTitle(finalTitle, effectiveFileId);
    setSaveSuccess(true);

    setTimeout(() => {
      onClose();
    }, 900);
  };

  return (
    <div className="fixed inset-0 z-[99999] bg-transparent flex items-center justify-center p-4 font-sans">
      {/* Click outside to close */}
      <div className="absolute inset-0 bg-transparent" onClick={onClose} />

      <div
        className="relative z-10 bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-neutral-200/90 w-full max-w-[460px] overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-[#f5c41a] text-neutral-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bookmark size={18} className="text-neutral-900" />
            <h3 className="font-bold text-[15px] text-neutral-900">Lưu vào Kho Sách</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-800 hover:text-neutral-950 hover:bg-black/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-5">
          <form onSubmit={handleSave} className="space-y-4">
            {/* If multiple PDFs are open, allow selecting which PDF to save */}
            {openDocs && openDocs.length > 1 && (
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                  Tài liệu cần lưu
                </label>
                <select
                  value={selectedDocId}
                  onChange={(e) => handleDocChange(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-neutral-50 border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#f5c41a]/40 focus:border-[#f5c41a] text-neutral-900 font-semibold transition-shadow cursor-pointer"
                >
                  {openDocs.map((doc) => (
                    <option key={doc.fileId || doc.id} value={doc.fileId || doc.id}>
                      {doc.fileName} (Trang {doc.currentPage}/{doc.totalPages})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                Tên cuốn sách
              </label>
              <input
                type="text"
                value={bookTitleInput}
                onChange={(e) => setBookTitleInput(e.target.value)}
                placeholder="Nhập tên dễ nhớ..."
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#f5c41a]/40 focus:border-[#f5c41a] text-neutral-900 font-medium transition-shadow placeholder-neutral-400"
                autoFocus
                required
              />
              <p className="text-xs text-neutral-400 mt-1.5 truncate">
                Tệp gốc: <span className="font-sans text-neutral-600 bg-neutral-100 px-1.5 py-0.5 rounded text-[11px]">{effectiveFileName}</span>
              </p>
            </div>

            {/* Group Selection */}
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                Phân loại / Nhóm sách
              </label>
              <select
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#f5c41a]/40 focus:border-[#f5c41a] text-neutral-900 font-medium transition-shadow cursor-pointer"
              >
                <option value="">Chưa phân nhóm</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Book Metadata Preview */}
            <div className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-200 flex items-center justify-between gap-4">
              <div className="flex-1">
                <span className="text-neutral-500 block text-[11px] mb-0.5 uppercase tracking-wider font-semibold">Độ dài</span>
                <span className="font-bold text-neutral-800 text-sm">{effectiveTotalPages} trang</span>
              </div>
              <div className="w-px h-7 bg-neutral-200" />
              <div className="flex-1 pl-2">
                <span className="text-neutral-500 block text-[11px] mb-0.5 uppercase tracking-wider font-semibold">Đang đọc</span>
                <span className="font-bold text-amber-600 text-sm">Trang {effectiveCurrentPage}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 text-xs font-semibold transition-colors"
              >
                Hủy
              </button>
              <button
                type="submit"
                className={`px-5 py-2.5 rounded-xl text-neutral-900 text-xs font-bold flex items-center gap-2 transition-all shadow-xs ${
                  saveSuccess ? 'bg-emerald-100 text-emerald-800' : 'bg-[#f5c41a] hover:bg-[#eab308] active:scale-98'
                }`}
              >
                {saveSuccess ? (
                  <>
                    <Check size={16} />
                    <span>Đã lưu vào kho!</span>
                  </>
                ) : (
                  <>
                    <BookCheck size={16} />
                    <span>Lưu ngay</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
