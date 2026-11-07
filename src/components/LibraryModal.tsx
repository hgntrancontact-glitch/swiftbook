import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  BookOpen,
  Trash2,
  X,
  Search,
  RotateCcw,
  FolderPlus,
  Folder,
  Tag,
  CheckSquare,
  Square,
  Check,
  Plus,
  Edit2,
  SquarePen,
  ChevronDown,
  LayoutGrid,
  List,
  BookMarked,
  Download,
  Clock,
  FileText,
  AlertCircle,
  Layers,
  Sparkles,
  ArrowUpDown,
  MoreVertical,
  CheckCircle2,
  Loader2,
  GripVertical,
  Copy,
} from 'lucide-react';
import { SavedBook, BookGroup } from '../types';
import {
  getSavedBooks,
  saveBookToLibrary,
  moveBookToTrash,
  moveMultipleBooksToTrash,
  restoreBookFromTrash,
  restoreAllFromTrash,
  permanentlyDeleteBook,
  emptyTrash,
  getBookGroups,
  saveBookGroup,
  saveBookGroupsOrder,
  deleteBookGroup,
  updateBookGroupAssignment,
  updateSavedBookDetails,
  savePdfFileToForage,
  loadPdfFileFromForage,
  loadDocumentState,
  saveDocumentState,
} from '../utils/storage';
import { convertAnyFileToPdfBytes, sortFilesByUserSelectionIntent } from '../utils/fileConverter';
import { pdfjsLib } from '../utils/pdfWorker';
import { ImageOrderModal } from './ImageOrderModal';

interface LibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectBook: (book: SavedBook) => void;
  onUploadFile?: (file: File) => void;
  openBookIds?: string[];
}

type SortOption = 'recent' | 'name-asc' | 'name-desc' | 'progress' | 'size';

export const LibraryModal: React.FC<LibraryModalProps> = ({
  isOpen,
  onClose,
  onSelectBook,
  onUploadFile,
  openBookIds = [],
}) => {
  const [allBooks, setAllBooks] = useState<SavedBook[]>([]);
  const [groups, setGroups] = useState<BookGroup[]>([]);
  const [selectedNavKey, setSelectedNavKey] = useState<string>('all'); // 'all', 'trash', or groupId

  // Selection & Batch Delete
  const [isSelectionMode, setIsSelectionMode] = useState<boolean>(false);
  const [selectedBookIds, setSelectedBookIds] = useState<string[]>([]);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Group Management Modal
  const [isGroupManagerOpen, setIsGroupManagerOpen] = useState<boolean>(false);
  const [newGroupName, setNewGroupName] = useState<string>('');
  const [newGroupColor, setNewGroupColor] = useState<string>('#f59e0b');
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupNameText, setEditingGroupNameText] = useState<string>('');
  const [draggedGroupId, setDraggedGroupId] = useState<string | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  const [groupToDelete, setGroupToDelete] = useState<BookGroup | null>(null);

  const handleDropGroup = (targetGroupId: string) => {
    if (!draggedGroupId || draggedGroupId === targetGroupId) {
      setDraggedGroupId(null);
      setDragOverGroupId(null);
      return;
    }
    const fromIdx = groups.findIndex((g) => g.id === draggedGroupId);
    const toIdx = groups.findIndex((g) => g.id === targetGroupId);
    if (fromIdx === -1 || toIdx === -1) return;

    const newGroups = [...groups];
    const [removed] = newGroups.splice(fromIdx, 1);
    newGroups.splice(toIdx, 0, removed);

    setGroups(newGroups);
    saveBookGroupsOrder(newGroups);
    setDraggedGroupId(null);
    setDragOverGroupId(null);
  };

  // Edit Single Book Modal
  const [editingBook, setEditingBook] = useState<SavedBook | null>(null);
  const [editBookTitle, setEditBookTitle] = useState<string>('');
  const [editBookGroupId, setEditBookGroupId] = useState<string>('');

  // Quick Move Popover
  const [activeGroupMenuBookId, setActiveGroupMenuBookId] = useState<string | null>(null);

  // Image Order Management Modal inside Library
  const [isImageOrderModalOpen, setIsImageOrderModalOpen] = useState<boolean>(false);
  const [pendingImageFiles, setPendingImageFiles] = useState<File[]>([]);

  // Hidden file input for uploading new book
  const fileInputRef = useRef<HTMLInputElement>(null);

  const groupColors = [
    { name: 'Vàng Cam', hex: '#f59e0b' },
    { name: 'Xanh Lam', hex: '#3b82f6' },
    { name: 'Xanh Lá', hex: '#10b981' },
    { name: 'Tím', hex: '#8b5cf6' },
    { name: 'Hồng Đỏ', hex: '#ec4899' },
    { name: 'Xám Ghi', hex: '#64748b' },
    { name: 'Đỏ', hex: '#ef4444' },
    { name: 'Xanh Ngọc', hex: '#06b6d4' },
  ];

  // Refresh Books & Groups
  const refreshData = () => {
    const rawBooks = getSavedBooks();
    setAllBooks(rawBooks);
    const grps = getBookGroups();
    setGroups(grps);
  };

  useEffect(() => {
    if (isOpen) {
      refreshData();
      setIsSelectionMode(false);
      setSelectedBookIds([]);
      setActiveGroupMenuBookId(null);
    }
  }, [isOpen]);

  // Active (non-deleted) vs Trash books
  const activeBooks = useMemo(() => allBooks.filter((b) => !b.deletedAt), [allBooks]);
  const trashBooks = useMemo(() => allBooks.filter((b) => !!b.deletedAt), [allBooks]);

  // Helper to remove Vietnamese diacritics/accents for smart searching
  const normalizeStr = (str?: string) =>
    (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .trim();

  // Status state for uploading new book directly to library
  const [isUploadingNewBook, setIsUploadingNewBook] = useState(false);
  const [uploadSuccessMessage, setUploadSuccessMessage] = useState<string | null>(null);

  // Filtered by Selected Nav Item (Group / All / Trash) & Search
  const displayBooks = useMemo(() => {
    let list: SavedBook[] = [];

    // If search query is entered, search across active books (or trash if in trash)
    if (searchQuery.trim()) {
      const q = normalizeStr(searchQuery);
      const pool = selectedNavKey === 'trash' ? trashBooks : activeBooks;

      // STRICT USER REQUIREMENT:
      // A.1: Only search and match against File Name (b.name and b.originalFileName). Completely exclude Group Name.
      // A.2: Real-time filter & exclusion: non-matching files are completely hidden.
      list = pool.filter((b) => {
        const nameMatch = normalizeStr(b.name).includes(q);
        const originalFileMatch = normalizeStr(b.originalFileName).includes(q);
        return nameMatch || originalFileMatch;
      });

      // Refinement filtering priority: exact match > starts with query > contains query
      return [...list].sort((a, b) => {
        const nameA = normalizeStr(a.name);
        const nameB = normalizeStr(b.name);
        const exactA = nameA === q ? 0 : 1;
        const exactB = nameB === q ? 0 : 1;
        if (exactA !== exactB) return exactA - exactB;

        const startsA = nameA.startsWith(q) ? 0 : 1;
        const startsB = nameB.startsWith(q) ? 0 : 1;
        if (startsA !== startsB) return startsA - startsB;

        return nameA.indexOf(q) - nameB.indexOf(q);
      });
    } else {
      if (selectedNavKey === 'trash') {
        list = trashBooks;
      } else if (selectedNavKey === 'all') {
        list = activeBooks;
      } else {
        list = activeBooks.filter((b) => b.groupId === selectedNavKey);
      }
    }

    // Apply Sorting when not searching
    return [...list].sort((a, b) => {
      if (sortBy === 'recent') {
        const timeA = a.lastReadAt || a.savedAt || 0;
        const timeB = b.lastReadAt || b.savedAt || 0;
        return timeB - timeA;
      }
      if (sortBy === 'name-asc') {
        return (a.name || '').localeCompare(b.name || '');
      }
      if (sortBy === 'name-desc') {
        return (b.name || '').localeCompare(a.name || '');
      }
      if (sortBy === 'progress') {
        const progA = a.totalPages ? (a.lastReadPage / a.totalPages) : 0;
        const progB = b.totalPages ? (b.lastReadPage / b.totalPages) : 0;
        return progB - progA;
      }
      if (sortBy === 'size') {
        return (b.fileSize || 0) - (a.fileSize || 0);
      }
      return 0;
    });
  }, [activeBooks, trashBooks, selectedNavKey, searchQuery, sortBy]);

  // State for Confirm Delete Modal (Đóng | Xóa ngay)
  const [confirmDeleteModal, setConfirmDeleteModal] = useState<{
    isOpen: boolean;
    count: number;
    isTrash: boolean;
  } | null>(null);

  const [isSidebarUploadMenuOpen, setIsSidebarUploadMenuOpen] = useState<boolean>(false);
  const [isEmptyCategoryUploadMenuOpen, setIsEmptyCategoryUploadMenuOpen] = useState<boolean>(false);
  const sidebarUploadMenuRef = useRef<HTMLDivElement>(null);
  const emptyCategoryUploadMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        sidebarUploadMenuRef.current &&
        !sidebarUploadMenuRef.current.contains(e.target as Node)
      ) {
        setIsSidebarUploadMenuOpen(false);
      }
      if (
        emptyCategoryUploadMenuRef.current &&
        !emptyCategoryUploadMenuRef.current.contains(e.target as Node)
      ) {
        setIsEmptyCategoryUploadMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Checkbox helpers
  const handleToggleSelectBook = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedBookIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedBookIds.length === displayBooks.length) {
      setSelectedBookIds([]);
    } else {
      setSelectedBookIds(displayBooks.map((b) => b.id));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedBookIds.length === 0) return;
    setConfirmDeleteModal({
      isOpen: true,
      count: selectedBookIds.length,
      isTrash: selectedNavKey === 'trash',
    });
  };

  const handleDeleteAll = () => {
    if (selectedNavKey === 'trash') {
      if (trashBooks.length === 0) return;
      const allTrashIds = trashBooks.map((b) => b.id);
      setSelectedBookIds(allTrashIds);
      setIsSelectionMode(true);
      setConfirmDeleteModal({
        isOpen: true,
        count: allTrashIds.length,
        isTrash: true,
      });
    } else {
      if (displayBooks.length === 0) return;
      const allIds = displayBooks.map((b) => b.id);
      setSelectedBookIds(allIds);
      setIsSelectionMode(true);
      setConfirmDeleteModal({
        isOpen: true,
        count: allIds.length,
        isTrash: false,
      });
    }
  };

  const executeDeleteConfirmed = () => {
    if (selectedBookIds.length === 0) {
      setConfirmDeleteModal(null);
      return;
    }
    if (selectedNavKey === 'trash') {
      selectedBookIds.forEach((id) => permanentlyDeleteBook(id));
      setSelectedBookIds([]);
      setIsSelectionMode(false);
      setConfirmDeleteModal(null);
      refreshData();
    } else {
      moveMultipleBooksToTrash(selectedBookIds);
      setSelectedBookIds([]);
      setIsSelectionMode(false);
      setConfirmDeleteModal(null);
      refreshData();
    }
  };

  const handleCloseConfirmModal = () => {
    // Closes the modal while retaining selected ticks so user can uncheck unwanted items
    setConfirmDeleteModal(null);
  };

  // Group helpers
  const getGroupById = (id?: string) => groups.find((g) => g.id === id);

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    const newGrp = saveBookGroup(newGroupName.trim(), '#f5c41a');
    setNewGroupName('');
    setIsGroupManagerOpen(false);
    refreshData();
    setSelectedNavKey(newGrp.id);
  };

  const handleUpdateGroupName = (id: string) => {
    if (!editingGroupNameText.trim()) return;
    const existing = groups.find((g) => g.id === id);
    if (existing) {
      saveBookGroup(editingGroupNameText.trim(), existing.color || '#f5c41a', id);
    }
    setEditingGroupId(null);
    setEditingGroupNameText('');
    setIsGroupManagerOpen(false);
    refreshData();
  };

  const handleRequestDeleteGroup = (grp: BookGroup, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setGroupToDelete(grp);
  };

  const handleConfirmDeleteGroup = () => {
    if (!groupToDelete) return;
    const targetId = groupToDelete.id;
    deleteBookGroup(targetId);
    if (selectedNavKey === targetId) setSelectedNavKey('all');
    setGroupToDelete(null);
    refreshData();
  };

  const handleCancelDeleteGroup = () => {
    setGroupToDelete(null);
  };

  // Edit Book Modal
  const handleOpenEditBook = (book: SavedBook, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingBook(book);
    setEditBookTitle(book.name);
    setEditBookGroupId(book.groupId || '');
  };

  const handleSaveEditBook = () => {
    if (!editingBook || !editBookTitle.trim()) return;
    updateSavedBookDetails(editingBook.id, {
      name: editBookTitle.trim(),
      groupId: editBookGroupId || undefined,
    });
    setEditingBook(null);
    refreshData();
  };

  // Quick Move Group
  const handleQuickMoveGroup = (bookId: string, groupId?: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    updateBookGroupAssignment(bookId, groupId);
    setActiveGroupMenuBookId(null);
    refreshData();
  };

  // Process and save files to library
  const processAndSaveFilesToLibrary = async (files: File[], skipSort: boolean = false) => {
    try {
      setIsUploadingNewBook(true);
      const { bytes, fileName: processedName } = await convertAnyFileToPdfBytes(
        files.length === 1 ? files[0] : files,
        skipSort
      );
      const firstFile = files[0];
      const safeId = `doc_${firstFile.name.replace(/[^a-zA-Z0-9]/g, '_')}_${firstFile.size}_${Date.now()}`;
      
      const uint8Data = new Uint8Array(bytes);
      await savePdfFileToForage(safeId, uint8Data);

      let totalPages = 1;
      try {
        const loadingTask = (pdfjsLib as any).getDocument({
          data: uint8Data,
          cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/`,
          cMapPacked: true,
          stopAtErrors: false,
          ignoreErrors: true,
        });
        const doc = await loadingTask.promise;
        totalPages = doc.numPages || 1;
      } catch (err) {
        console.warn('Could not parse page count directly:', err);
      }

      const bookName = processedName.replace(/\.pdf$/i, '');
      const newSavedBook: SavedBook = {
        id: safeId,
        name: bookName,
        originalFileName: files.length === 1 ? firstFile.name : `${files.length} tệp gộp (${firstFile.name}...)`,
        totalPages,
        lastReadPage: 1,
        savedAt: Date.now(),
        lastReadAt: Date.now(),
        fileSize: bytes.byteLength,
        groupId: selectedNavKey !== 'all' && selectedNavKey !== 'trash' ? selectedNavKey : undefined,
        groupName: getGroupById(selectedNavKey)?.name,
      };

      saveBookToLibrary(newSavedBook);
      refreshData();
      setUploadSuccessMessage(`Đã thêm "${bookName}" vào kho sách thành công!`);
      setTimeout(() => setUploadSuccessMessage(null), 3500);
    } catch (err) {
      console.error('Error saving book directly to library:', err);
    } finally {
      setIsUploadingNewBook(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Direct upload handler for PDF or Multi-Images
  const handleDirectUploadFiles = async (rawFilesList: File[]) => {
    if (rawFilesList.length === 0) return;

    // Strict rule: If PDF is chosen, strictly use only 1 PDF.
    const firstPdf = rawFilesList.find(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (firstPdf && rawFilesList.length === 1) {
      await processAndSaveFilesToLibrary([firstPdf]);
      return;
    }

    const isImage = (f: File) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif)$/i.test(f.name);
    if (rawFilesList.length > 1 && rawFilesList.some(isImage)) {
      setPendingImageFiles(rawFilesList);
      setIsImageOrderModalOpen(true);
      return;
    }

    await processAndSaveFilesToLibrary(rawFilesList);
  };

  const handleConfirmOrderedImagesForLibrary = async (orderedFiles: File[]) => {
    setIsImageOrderModalOpen(false);
    if (!orderedFiles || orderedFiles.length === 0) return;
    await processAndSaveFilesToLibrary(orderedFiles, true);
  };

  const triggerLibraryUpload = (accept: string, multiple: boolean) => {
    setIsSidebarUploadMenuOpen(false);
    setIsEmptyCategoryUploadMenuOpen(false);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = (e) => {
      const rawFiles = (e.target as HTMLInputElement).files;
      if (!rawFiles || rawFiles.length === 0) return;
      const files = Array.from(rawFiles);
      if (files.length > 0) {
        if (!multiple) {
          handleDirectUploadFiles([files[0]]);
        } else {
          handleDirectUploadFiles(files);
        }
      }
    };
    input.click();
  };

  // Upload file handler - Directly saves new book into Saved Books without replacing currently active reading book
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = Array.from(e.target.files || []);
    if (files.length > 0) {
      handleDirectUploadFiles(files);
    }
  };

  // Duplicate / Copy Book handler
  const handleDuplicateBook = async (book: SavedBook, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const bytes = await loadPdfFileFromForage(book.id);
      if (!bytes || bytes.byteLength === 0) {
        alert('Không tìm thấy dữ liệu tệp tin để sao chép.');
        return;
      }
      const newId = `${book.id}_copy_${Date.now()}`;
      const newName = `${book.name} (Bản sao)`;
      await savePdfFileToForage(newId, bytes.slice(0));

      const existingState = loadDocumentState(book.id);
      if (existingState) {
        saveDocumentState({
          ...existingState,
          fileId: newId,
          fileName: `${newName}.pdf`,
          lastReadAt: Date.now(),
        });
      }

      const duplicatedBook: SavedBook = {
        ...book,
        id: newId,
        name: newName,
        originalFileName: book.originalFileName,
        savedAt: Date.now(),
        lastReadAt: Date.now(),
      };
      saveBookToLibrary(duplicatedBook);
      refreshData();
      setUploadSuccessMessage(`Đã tạo bản sao "${newName}" thành công!`);
      setTimeout(() => setUploadSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Error duplicating book:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-5 md:p-6 bg-transparent font-sans">
      {/* Click outside to close */}
      <div className="absolute inset-0 bg-transparent" onClick={onClose} />
      {/* Modal Container */}
      <div
        data-library-modal="true" className="relative isolate z-10 w-full max-w-5xl h-[84vh] max-h-[760px] bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] flex flex-col overflow-hidden border border-zinc-200/90 my-auto"
        onClick={() => setActiveGroupMenuBookId(null)}
      >
        {/* TOP BANNER: Minimalist White Header with Brand Yellow Accents */}
        <div className="bg-white px-4 sm:px-6 py-3 flex items-center justify-between border-b border-zinc-100 shrink-0">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-zinc-900 tracking-tight flex items-center gap-2.5">
                Kho Sách Đã Lưu
                <span className="text-xs font-bold px-2.5 py-0.5 bg-[#f5c41a] text-zinc-950 rounded-full normal-case tracking-normal">
                  {activeBooks.length} sách
                </span>
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Multi-select Toggle */}
            <button
              onClick={() => {
                setIsSelectionMode(!isSelectionMode);
                setSelectedBookIds([]);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer ${
                isSelectionMode
                  ? 'bg-[#f5c41a] text-zinc-950 shadow-xs'
                  : 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200'
              }`}
            >
              <CheckSquare size={14} />
              <span className="hidden sm:inline">{isSelectionMode ? 'Hủy chọn' : 'Chọn nhiều'}</span>
            </button>

            {/* Xóa tất cả Button */}
            <button
              onClick={handleDeleteAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-100 hover:bg-red-50 text-zinc-800 hover:text-red-600 transition-all duration-200 cursor-pointer"
              title={selectedNavKey === 'trash' ? 'Xóa vĩnh viễn tất cả trong thùng rác' : 'Chuyển tất cả sách vào thùng rác'}
            >
              <Trash2 size={14} />
              <span className="hidden sm:inline">
                {selectedNavKey === 'trash' ? 'Dọn sạch thùng rác' : 'Xóa tất cả'}
              </span>
            </button>

            {/* Close Modal */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-zinc-100 hover:bg-[#f5c41a] hover:text-zinc-950 text-zinc-700 transition-all ml-1 cursor-pointer"
              title="Đóng Kho sách (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* BODY: Sidebar + Main Area */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-white">
          {/* LEFT SIDEBAR: Groups & Categories */}
          <div className="w-full md:w-60 bg-zinc-50/60 border-r border-zinc-100 flex flex-col shrink-0">
            {/* Sidebar Header */}
            <div className="p-3.5 border-b border-zinc-100 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                Nhóm lưu trữ
              </span>
              <button
                onClick={() => setIsGroupManagerOpen(true)}
                className="flex items-center gap-1 text-xs font-semibold text-zinc-800 hover:text-black bg-zinc-200/60 hover:bg-zinc-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                title="Tạo nhóm lưu trữ mới"
              >
                <Plus size={14} className="stroke-[2.5]" />
                <span>Tạo nhóm</span>
              </button>
            </div>

            {/* Navigation items */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {/* All Books */}
              <button
                onClick={() => {
                  setSelectedNavKey('all');
                  setSelectedBookIds([]);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  selectedNavKey === 'all'
                    ? 'bg-[#f5c41a] text-zinc-950 shadow-xs'
                    : 'text-zinc-700 hover:bg-zinc-100/80'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <BookOpen size={16} className={selectedNavKey === 'all' ? 'text-zinc-950' : 'text-zinc-500'} />
                  <span>Tất cả sách</span>
                </div>
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                    selectedNavKey === 'all' ? 'bg-black/10 text-zinc-950' : 'bg-zinc-200/60 text-zinc-600'
                  }`}
                >
                  {activeBooks.length}
                </span>
              </button>

              {/* Group items with Drag-and-Drop Reordering */}
              {groups.map((grp) => {
                const count = activeBooks.filter((b) => b.groupId === grp.id).length;
                const isSelected = selectedNavKey === grp.id;
                const isDragging = draggedGroupId === grp.id;
                const isOver = dragOverGroupId === grp.id;

                return (
                  <div
                    key={grp.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', grp.id);
                      e.dataTransfer.effectAllowed = 'move';
                      setDraggedGroupId(grp.id);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (dragOverGroupId !== grp.id) {
                        setDragOverGroupId(grp.id);
                      }
                    }}
                    onDragLeave={() => {
                      if (dragOverGroupId === grp.id) {
                        setDragOverGroupId(null);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleDropGroup(grp.id);
                    }}
                    onDragEnd={() => {
                      setDraggedGroupId(null);
                      setDragOverGroupId(null);
                    }}
                    className={`group relative flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      isDragging ? 'opacity-40 scale-98' : ''
                    } ${
                      isOver ? 'border-t-2 border-[#f5c41a] bg-[#f5c41a]/10' : ''
                    } ${
                      isSelected
                        ? 'bg-[#f5c41a] text-zinc-950 shadow-xs'
                        : 'text-zinc-700 hover:bg-zinc-100/80'
                    }`}
                    onClick={() => {
                      setSelectedNavKey(grp.id);
                      setSelectedBookIds([]);
                    }}
                  >
                    <div className="flex items-center gap-1.5 truncate pr-1">
                      <span
                        className="text-zinc-400 group-hover:text-zinc-600 cursor-grab active:cursor-grabbing p-0.5 shrink-0"
                        title="Kéo thả để sắp xếp lại thứ tự nhóm"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <GripVertical size={13} />
                      </span>
                      <span className="truncate">{grp.name}</span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full font-bold group-hover:hidden ${
                          isSelected ? 'bg-black/10 text-zinc-950' : 'bg-zinc-200/60 text-zinc-600'
                        }`}
                      >
                        {count}
                      </span>
                      {/* REQUIRED ORDER: [Nút Xóa] [Nút Chỉnh sửa] */}
                      <button
                        onClick={(e) => handleRequestDeleteGroup(grp, e)}
                        className={`hidden group-hover:inline-flex p-1 rounded hover:bg-red-500/20 text-zinc-600 hover:text-red-600 ${
                          isSelected ? 'text-zinc-900 hover:text-red-700' : ''
                        }`}
                        title="Xóa nhóm"
                      >
                        <Trash2 size={12} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingGroupId(grp.id);
                          setEditingGroupNameText(grp.name);
                          setIsGroupManagerOpen(true);
                        }}
                        className={`hidden group-hover:inline-flex p-1 rounded hover:bg-zinc-200 text-zinc-600 hover:text-black ${
                          isSelected ? 'hover:bg-black/10 text-zinc-900' : ''
                        }`}
                        title="Đổi tên"
                      >
                        <Edit2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}

              <div className="pt-2 pb-1">
                <div className="h-px bg-zinc-200/60 mx-2" />
              </div>

              {/* Trash */}
              <button
                onClick={() => {
                  setSelectedNavKey('trash');
                  setSelectedBookIds([]);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  selectedNavKey === 'trash'
                    ? 'bg-[#f5c41a] text-zinc-950 shadow-xs'
                    : 'text-zinc-700 hover:bg-red-50 hover:text-red-600'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Trash2 size={15} className={selectedNavKey === 'trash' ? 'text-zinc-950' : 'text-zinc-400'} />
                  <span>Thùng rác</span>
                </div>
                {trashBooks.length > 0 && (
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                      selectedNavKey === 'trash' ? 'bg-black/10 text-zinc-950' : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {trashBooks.length}
                  </span>
                )}
              </button>
            </div>

            {/* Quick Upload Button at Sidebar Bottom */}
            <div className="p-3 border-t border-zinc-100 bg-zinc-50/60 relative" ref={sidebarUploadMenuRef}>
              <button
                onClick={() => setIsSidebarUploadMenuOpen((prev) => !prev)}
                disabled={isUploadingNewBook}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 bg-[#f5c41a] hover:bg-[#e0b216] active:scale-[0.98] disabled:opacity-60 text-zinc-950 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer select-none"
                title="Tải lên tài liệu PDF hoặc Ảnh (PNG, JPG)"
              >
                <Plus size={15} className="text-zinc-950 stroke-[2.5]" />
                <span>Tải sách mới vào kho</span>
                <ChevronDown size={13} className={`transition-transform duration-150 ${isSidebarUploadMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isSidebarUploadMenuOpen && (
                <div className="absolute left-3 right-3 bottom-[calc(100%+6px)] bg-white rounded-xl shadow-lg border border-zinc-100 py-1 z-[99999] animate-in fade-in zoom-in-95 duration-100 flex flex-col overflow-hidden text-left">
                  <button
                    onClick={() => {
                      setIsSidebarUploadMenuOpen(false);
                      triggerLibraryUpload(".pdf,application/pdf", false);
                    }}
                    className="w-full px-4 py-2 text-left text-xs font-semibold text-zinc-800 hover:bg-zinc-100 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Tải PDF
                  </button>
                  <button
                    onClick={() => {
                      setIsSidebarUploadMenuOpen(false);
                      triggerLibraryUpload(".png,.jpg,.jpeg,image/png,image/jpeg", true);
                    }}
                    className="w-full px-4 py-2 text-left text-xs font-semibold text-zinc-800 hover:bg-zinc-100 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Tải Ảnh
                  </button>
                </div>
              )}
              {isUploadingNewBook && (
                <div className="mt-2 flex items-center justify-center gap-1.5 text-xs font-semibold text-zinc-700 bg-zinc-100 p-2 rounded-lg border border-zinc-200/60">
                  <Loader2 size={14} className="animate-spin text-zinc-800" />
                  <span>Đang lưu vào kho...</span>
                </div>
              )}
              {uploadSuccessMessage && (
                <div className="mt-2 p-2 rounded-lg bg-zinc-100 border border-zinc-200 text-zinc-800 text-[11px] font-semibold flex items-center gap-1.5 animate-fade-in">
                  <CheckCircle2 size={14} className="text-zinc-800 shrink-0" />
                  <span className="truncate">{uploadSuccessMessage}</span>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT MAIN PANEL */}
          <div className="flex-1 flex flex-col overflow-hidden bg-white">
            {/* Main Action Bar: Search, Sort, View toggle */}
            <div className="p-3 sm:px-5 sm:py-3.5 bg-white border-b border-zinc-100 flex flex-wrap items-center justify-between gap-2.5">
              {/* Search Bar - File Name Only */}
              <div className="relative flex-1 min-w-[220px]">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm kiếm theo tên file / tên sách..."
                  className="w-full pl-9 pr-8 py-2 bg-zinc-100/70 hover:bg-zinc-100 focus:bg-white border-0 focus:ring-1 focus:ring-zinc-900 rounded-xl text-xs font-medium focus:outline-hidden transition-all text-zinc-900 placeholder:text-zinc-400"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-zinc-200 text-zinc-400 hover:text-zinc-700"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Controls: Sort & View Mode */}
              <div className="flex items-center gap-2 shrink-0">
                {/* Sort dropdown */}
                <div className="flex items-center gap-1.5 bg-zinc-100 px-2.5 py-1.5 rounded-xl border-0 text-xs font-medium text-zinc-700">
                  <ArrowUpDown size={13} className="text-zinc-500" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    className="bg-transparent text-xs font-semibold text-zinc-800 focus:outline-hidden cursor-pointer"
                  >
                    <option value="recent">Mới đọc gần đây</option>
                    <option value="name-asc">Tên (A → Z)</option>
                    <option value="name-desc">Tên (Z → A)</option>
                    <option value="progress">Tiến độ đọc cao nhất</option>
                    <option value="size">Dung lượng lớn nhất</option>
                  </select>
                </div>

                {/* View Switcher */}
                <div className="flex items-center bg-zinc-100 p-0.5 rounded-xl border-0">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                      viewMode === 'grid'
                        ? 'bg-white text-zinc-950 shadow-2xs'
                        : 'text-zinc-500 hover:text-zinc-900'
                    }`}
                    title="Chế độ xem lưới"
                  >
                    <LayoutGrid size={14} />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                      viewMode === 'list'
                        ? 'bg-white text-zinc-950 shadow-2xs'
                        : 'text-zinc-500 hover:text-zinc-900'
                    }`}
                    title="Chế độ xem danh sách"
                  >
                    <List size={14} />
                  </button>
                </div>
              </div>
            </div>

            {/* Selection Banner */}
            {isSelectionMode && displayBooks.length > 0 && (
              <div className="bg-[#f5c41a]/15 border-b border-[#f5c41a]/30 px-4 py-2 flex items-center justify-between text-xs animate-fadeIn">
                <div className="flex items-center gap-2 font-semibold text-zinc-900">
                  <button
                    onClick={handleSelectAll}
                    className="flex items-center gap-1.5 hover:underline cursor-pointer"
                  >
                    {selectedBookIds.length === displayBooks.length ? (
                      <CheckSquare size={15} className="text-zinc-900" />
                    ) : (
                      <Square size={15} className="text-zinc-500" />
                    )}
                    <span>
                      {selectedBookIds.length === displayBooks.length
                        ? 'Bỏ chọn tất cả'
                        : 'Chọn tất cả trong trang này'}
                    </span>
                  </button>
                  <span className="text-zinc-500 font-normal">
                    (Đã chọn {selectedBookIds.length}/{displayBooks.length})
                  </span>
                </div>

                {selectedBookIds.length > 0 && (
                  <button
                    onClick={handleDeleteSelected}
                    className="flex items-center gap-1.5 px-3 py-1 bg-[#f5c41a] hover:bg-red-600 text-zinc-950 hover:text-white rounded-lg font-bold transition-colors shadow-2xs cursor-pointer"
                  >
                    <Trash2 size={13} />
                    <span>Xóa {selectedBookIds.length} sách đã chọn</span>
                  </button>
                )}
              </div>
            )}

            {/* Books Display Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
              {displayBooks.length === 0 ? (
                /* Empty state */
                <div className="h-full flex flex-col items-center justify-center text-center p-8 text-zinc-400">
                  <h3 className="text-base font-bold text-zinc-800 mb-1">
                    {searchQuery
                      ? 'Không tìm thấy sách nào phù hợp'
                      : selectedNavKey === 'trash'
                      ? 'Thùng rác trống'
                      : 'Chưa có cuốn sách nào trong nhóm này'}
                  </h3>
                  <p className="text-xs text-zinc-500 max-w-sm mb-4">
                    {searchQuery
                      ? 'Hãy thử tìm kiếm với từ khóa khác hoặc xóa bộ lọc tìm kiếm.'
                      : selectedNavKey === 'trash'
                      ? 'Các sách bạn xóa sẽ xuất hiện ở đây trước khi bị xóa vĩnh viễn.'
                      : 'Tải lên tài liệu PDF hoặc Ảnh (PNG, JPG) để lưu trữ và đọc mọi lúc mọi nơi.'}
                  </p>
                  {selectedNavKey !== 'trash' && (
                    <div className="relative inline-flex flex-col items-center" ref={emptyCategoryUploadMenuRef}>
                      <button
                        onClick={() => setIsEmptyCategoryUploadMenuOpen((prev) => !prev)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-[#f5c41a] hover:bg-[#e0b216] active:scale-[0.97] text-zinc-950 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer select-none"
                      >
                        <Plus size={15} className="text-zinc-950 stroke-[2.5]" />
                        <span>Thêm sách đầu tiên</span>
                        <ChevronDown size={13} className={`transition-transform duration-150 ${isEmptyCategoryUploadMenuOpen ? 'rotate-180' : ''}`} />
                      </button>

                      {isEmptyCategoryUploadMenuOpen && (
                        <div className="absolute left-1/2 -translate-x-1/2 top-[calc(100%+6px)] w-full min-w-[130px] bg-white rounded-xl shadow-lg border border-zinc-100 py-1 z-[99999] animate-in fade-in zoom-in-95 duration-100 flex flex-col overflow-hidden text-left">
                          <button
                            onClick={() => {
                              setIsEmptyCategoryUploadMenuOpen(false);
                              triggerLibraryUpload(".pdf,application/pdf", false);
                            }}
                            className="w-full px-4 py-2 text-left text-xs font-semibold text-zinc-800 hover:bg-zinc-100 transition-colors cursor-pointer whitespace-nowrap"
                          >
                            Tải PDF
                          </button>
                          <button
                            onClick={() => {
                              setIsEmptyCategoryUploadMenuOpen(false);
                              triggerLibraryUpload(".png,.jpg,.jpeg,image/png,image/jpeg", true);
                            }}
                            className="w-full px-4 py-2 text-left text-xs font-semibold text-zinc-800 hover:bg-zinc-100 transition-colors cursor-pointer whitespace-nowrap"
                          >
                            Tải Ảnh
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : viewMode === 'grid' ? (
                /* GRID VIEW */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {displayBooks.map((book) => {
                    const group = getGroupById(book.groupId);
                    const isSelected = selectedBookIds.includes(book.id);
                    const progressPercent = book.totalPages
                      ? Math.min(100, Math.round((book.lastReadPage / book.totalPages) * 100))
                      : 0;

                    return (
                      <div
                        key={book.id}
                        onClick={() => {
                          if (isSelectionMode) {
                            handleToggleSelectBook(book.id);
                          }
                        }}
                        className={`group relative bg-zinc-50/50 border border-zinc-100/80 rounded-2xl p-4 flex flex-col justify-between transition-all hover:bg-zinc-100/70 hover:shadow-2xs ${
                          isSelectionMode ? 'cursor-pointer' : 'cursor-default'
                        } ${
                          isSelected
                            ? 'ring-2 ring-[#f5c41a] bg-[#f5c41a]/10'
                            : ''
                        }`}
                      >
                        {/* Top Card: Checkbox or Group Badge */}
                        <div className="flex items-start justify-between gap-2 mb-1">
                          {isSelectionMode ? (
                            <button
                              onClick={(e) => handleToggleSelectBook(book.id, e)}
                              className="p-1 rounded text-zinc-900 hover:text-black"
                            >
                              {isSelected ? <CheckSquare size={18} /> : <Square size={18} className="text-zinc-400" />}
                            </button>
                          ) : group ? (
                            <span className="text-[11px] font-medium text-zinc-500 bg-transparent p-0 border-0 leading-tight">
                              {group.name}
                            </span>
                          ) : (
                            <span className="text-[11px] font-medium text-zinc-400 bg-transparent p-0 border-0 leading-tight">
                              Chung
                            </span>
                          )}

                          {/* Quick Actions */}
                          {selectedNavKey !== 'trash' && (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={(e) => handleDuplicateBook(book, e)}
                                className="w-6.5 h-6.5 border border-zinc-200 rounded-lg bg-white hover:bg-zinc-200 text-zinc-700 flex items-center justify-center transition-all shadow-2xs cursor-pointer shrink-0"
                                title="Sao chép (Tạo bản sao mới)"
                              >
                                <Copy size={12} className="stroke-[2]" />
                              </button>
                              <button
                                onClick={(e) => handleOpenEditBook(book, e)}
                                className="w-6.5 h-6.5 border border-zinc-200 rounded-lg bg-white hover:bg-zinc-200 text-zinc-700 flex items-center justify-center transition-all shadow-2xs cursor-pointer shrink-0"
                                title="Đổi tên / Chuyển nhóm"
                              >
                                <SquarePen size={13} className="stroke-[2]" />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Middle Card: Book Title & Details */}
                        <div className="mb-4">
                          <div className="flex items-center gap-1.5 mb-1">
                            <h4 className="font-bold text-zinc-900 text-sm leading-snug line-clamp-2 group-hover:text-black transition-colors flex-1">
                              {book.name}
                            </h4>
                            {openBookIds?.includes(book.id) && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 shrink-0">
                                Đang mở
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-zinc-500 font-medium">
                            <span className="flex items-center gap-1">
                              <FileText size={12} />
                              {book.totalPages ? `${book.totalPages} trang` : 'PDF'}
                            </span>
                            {book.fileSize && (
                              <span>{(book.fileSize / (1024 * 1024)).toFixed(1)} MB</span>
                            )}
                          </div>
                        </div>

                        {/* Bottom Card: Progress & Actions */}
                        <div>
                          {/* Progress Bar */}
                          {selectedNavKey !== 'trash' && (
                            <div className="mb-3 bg-zinc-200/70 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-[#f5c41a] h-full rounded-full transition-all"
                                style={{ width: `${progressPercent}%` }}
                              />
                            </div>
                          )}

                          <div className="flex items-center justify-between pt-2 border-t border-zinc-200/50 text-xs gap-2">
                            {selectedNavKey === 'trash' ? (
                              /* Trash actions */
                              <div className="w-full flex items-center justify-between gap-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    restoreBookFromTrash(book.id);
                                    refreshData();
                                  }}
                                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-[#f5c41a] hover:bg-[#e0b216] text-zinc-950 rounded-lg font-bold text-xs transition-colors cursor-pointer"
                                >
                                  <RotateCcw size={12} />
                                  <span>Khôi phục</span>
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    permanentlyDeleteBook(book.id);
                                    refreshData();
                                  }}
                                  className="w-7 h-7 border border-zinc-200 rounded-lg bg-white hover:bg-red-50 text-zinc-500 hover:text-red-600 hover:border-red-200 flex items-center justify-center transition-all shadow-2xs cursor-pointer shrink-0"
                                  title="Xóa vĩnh viễn"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            ) : (
                              /* Active book actions */
                              <>
                                <span
                                  className="text-[11px] font-semibold text-zinc-600 whitespace-nowrap truncate shrink min-w-0"
                                  title={`Trang ${book.lastReadPage || 1}/${book.totalPages || 1} (${progressPercent}%)`}
                                >
                                  Trang {book.lastReadPage || 1}
                                  {book.totalPages ? ` / ${book.totalPages}` : ''} ({progressPercent}%)
                                </span>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      moveBookToTrash(book.id);
                                      refreshData();
                                    }}
                                    className="w-7 h-7 border border-zinc-200 rounded-lg bg-white hover:bg-red-50 text-zinc-500 hover:text-red-600 hover:border-red-200 flex items-center justify-center transition-all shadow-2xs cursor-pointer shrink-0"
                                    title="Chuyển vào thùng rác"
                                  >
                                    <Trash2 size={13} />
                                  </button>

                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onSelectBook(book);
                                      onClose();
                                    }}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-[#f5c41a] hover:bg-[#e0b216] text-zinc-950 rounded-lg font-bold text-xs transition-all shadow-2xs cursor-pointer shrink-0 whitespace-nowrap"
                                  >
                                    <span>{openBookIds?.includes(book.id) ? 'Chuyển đến' : 'Đọc tiếp'}</span>
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* LIST VIEW */
                <div className="bg-white rounded-2xl border-0 overflow-hidden divide-y divide-zinc-100">
                  {displayBooks.map((book) => {
                    const group = getGroupById(book.groupId);
                    const isSelected = selectedBookIds.includes(book.id);
                    const progressPercent = book.totalPages
                      ? Math.min(100, Math.round((book.lastReadPage / book.totalPages) * 100))
                      : 0;

                    return (
                      <div
                        key={book.id}
                        onClick={() => {
                          if (isSelectionMode) {
                            handleToggleSelectBook(book.id);
                          }
                        }}
                        className={`group p-3.5 sm:px-4 flex items-center justify-between gap-3 hover:bg-zinc-50/80 transition-colors ${
                          isSelectionMode ? 'cursor-pointer' : 'cursor-default'
                        } ${
                          isSelected ? 'bg-[#f5c41a]/15' : ''
                        }`}
                      >
                        {/* Left: Checkbox + Title */}
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {isSelectionMode && (
                            <button
                              onClick={(e) => handleToggleSelectBook(book.id, e)}
                              className="p-1 text-zinc-950 shrink-0 cursor-pointer"
                            >
                              {isSelected ? <CheckSquare size={17} /> : <Square size={17} className="text-zinc-400" />}
                            </button>
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-zinc-900 text-xs sm:text-sm truncate group-hover:text-black transition-colors">
                                {book.name}
                              </h4>
                              {group && (
                                <span className="hidden sm:inline-flex items-center text-[11px] font-medium text-zinc-500 bg-transparent p-0 border-0 shrink-0">
                                  {group.name}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-zinc-500 truncate">
                              Đang đọc trang {book.lastReadPage || 1}
                              {book.totalPages ? `/${book.totalPages}` : ''} | Tiến độ {progressPercent}%
                            </p>
                          </div>
                        </div>

                        {/* Right: Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          {selectedNavKey === 'trash' ? (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  restoreBookFromTrash(book.id);
                                  refreshData();
                                }}
                                className="flex items-center gap-1 px-2.5 py-1 bg-[#f5c41a] text-zinc-950 rounded-lg text-xs font-bold hover:bg-[#e0b216] cursor-pointer"
                              >
                                <RotateCcw size={12} />
                                <span className="hidden sm:inline">Khôi phục</span>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  permanentlyDeleteBook(book.id);
                                  refreshData();
                                }}
                                className="w-7 h-7 border border-zinc-200 rounded-lg bg-white hover:bg-red-50 text-zinc-500 hover:text-red-600 hover:border-red-200 flex items-center justify-center transition-all shadow-2xs cursor-pointer"
                                title="Xóa vĩnh viễn"
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={(e) => handleDuplicateBook(book, e)}
                                className="w-6.5 h-6.5 border border-zinc-200 rounded-lg bg-white hover:bg-zinc-200 text-zinc-700 flex items-center justify-center transition-all shadow-2xs cursor-pointer shrink-0"
                                title="Sao chép (Tạo bản sao mới)"
                              >
                                <Copy size={12} className="stroke-[2]" />
                              </button>
                              <button
                                onClick={(e) => handleOpenEditBook(book, e)}
                                className="w-6.5 h-6.5 border border-zinc-200 rounded-lg bg-white hover:bg-zinc-200 text-zinc-700 flex items-center justify-center transition-all shadow-2xs cursor-pointer shrink-0"
                                title="Đổi tên / Chuyển nhóm"
                              >
                                <SquarePen size={13} className="stroke-[2]" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  moveBookToTrash(book.id);
                                  refreshData();
                                }}
                                className="w-7 h-7 border border-zinc-200 rounded-lg bg-white hover:bg-red-50 text-zinc-500 hover:text-red-600 hover:border-red-200 flex items-center justify-center transition-all shadow-2xs cursor-pointer"
                                title="Chuyển vào thùng rác"
                              >
                                <Trash2 size={13} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectBook(book);
                                  onClose();
                                }}
                                className="flex items-center gap-1 px-3 py-1.5 bg-[#f5c41a] hover:bg-[#e0b216] text-zinc-950 rounded-lg font-bold text-xs shadow-2xs cursor-pointer whitespace-nowrap"
                              >
                                <span>{openBookIds?.includes(book.id) ? 'Chuyển đến' : 'Đọc tiếp'}</span>
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* MODAL: GROUP MANAGER */}
        {isGroupManagerOpen && (
          <div className="absolute inset-0 z-60 bg-transparent flex items-center justify-center p-4">
            <div data-library-child-backdrop="true" className="absolute inset-0 bg-white/25 backdrop-blur-[3px]" onClick={() => { setIsGroupManagerOpen(false); setEditingGroupId(null); }} />
            <div className="relative z-10 w-full max-w-md bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] overflow-hidden animate-scaleIn border border-zinc-200/90">
              <div className="bg-[#f5c41a] px-5 py-3.5 flex items-center justify-between border-b border-[#e5b512]">
                <h3 className="font-bold text-zinc-950 text-sm">
                  <span>{editingGroupId ? 'Đổi Tên Nhóm' : 'Tạo Nhóm Lưu Trữ Mới'}</span>
                </h3>
                <button
                  onClick={() => {
                    setIsGroupManagerOpen(false);
                    setEditingGroupId(null);
                  }}
                  className="p-1 rounded-lg hover:bg-black/10 text-zinc-950 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {editingGroupId ? (
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                      Tên nhóm
                    </label>
                    <input
                      type="text"
                      value={editingGroupNameText}
                      onChange={(e) => setEditingGroupNameText(e.target.value)}
                      placeholder="Nhập tên nhóm..."
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold focus:outline-hidden focus:border-[#f5c41a] focus:bg-white text-zinc-900"
                    />
                    <div className="flex justify-end gap-2 mt-4">
                      <button
                        onClick={() => {
                          setIsGroupManagerOpen(false);
                          setEditingGroupId(null);
                        }}
                        className="px-3.5 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 rounded-xl cursor-pointer"
                      >
                        Hủy
                      </button>
                      <button
                        onClick={() => handleUpdateGroupName(editingGroupId)}
                        className="px-4 py-1.5 bg-[#f5c41a] hover:bg-[#e0b216] text-zinc-950 text-xs font-bold rounded-xl shadow-xs cursor-pointer"
                      >
                        Lưu thay đổi
                      </button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleCreateGroup} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                        Tên nhóm mới
                      </label>
                      <input
                        type="text"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        placeholder="Nhập tên nhóm lưu trữ mới..."
                        className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold focus:outline-hidden focus:border-[#f5c41a] focus:bg-white text-zinc-900"
                        autoFocus
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setIsGroupManagerOpen(false)}
                        className="px-3.5 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 rounded-xl cursor-pointer"
                      >
                        Hủy
                      </button>
                      <button
                        type="submit"
                        disabled={!newGroupName.trim()}
                        className="px-4 py-1.5 bg-[#f5c41a] hover:bg-[#e0b216] disabled:opacity-50 text-zinc-950 text-xs font-bold rounded-xl shadow-xs cursor-pointer"
                      >
                        Tạo nhóm
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        )}

        {/* MODAL: EDIT BOOK DETAILS */}
        {editingBook && (
          <div className="absolute inset-0 z-60 bg-transparent flex items-center justify-center p-4">
            <div data-library-child-backdrop="true" className="absolute inset-0 bg-white/25 backdrop-blur-[3px]" onClick={() => setEditingBook(null)} />
            <div className="relative z-10 w-full max-w-md bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-zinc-200/90 animate-scaleIn relative flex flex-col overflow-hidden">
              <div className="bg-[#f5c41a] px-5 py-3.5 flex items-center justify-between border-b border-[#e5b512]">
                <h3 className="font-bold text-zinc-950 text-sm flex items-center gap-2">
                  <Edit2 size={16} />
                  <span>Đổi Tên & Nhóm Sách</span>
                </h3>
                <button
                  onClick={() => setEditingBook(null)}
                  className="p-1 rounded-lg hover:bg-black/10 text-zinc-950 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                    Tên sách hiển thị
                  </label>
                  <input
                    type="text"
                    value={editBookTitle}
                    onChange={(e) => setEditBookTitle(e.target.value)}
                    className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold focus:outline-hidden focus:border-[#f5c41a] focus:bg-white text-zinc-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                    Nhóm lưu trữ
                  </label>
                  <select
                    value={editBookGroupId}
                    onChange={(e) => setEditBookGroupId(e.target.value)}
                    className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold focus:outline-hidden focus:border-[#f5c41a] focus:bg-white text-zinc-900 cursor-pointer"
                  >
                    <option value="">(Không phân nhóm / Nhóm Chung)</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setEditingBook(null)}
                    className="px-3.5 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 rounded-xl cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={handleSaveEditBook}
                    className="px-4 py-1.5 bg-[#f5c41a] hover:bg-[#e0b216] text-zinc-950 text-xs font-bold rounded-xl shadow-xs cursor-pointer"
                  >
                    Lưu thông tin
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL XÁC NHẬN: ĐÓNG | XOÁ NGAY */}
        {confirmDeleteModal?.isOpen && (
          <div className="absolute inset-0 z-70 bg-transparent flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div data-library-child-backdrop="true" className="absolute inset-0 bg-white/25 backdrop-blur-[3px]" onClick={handleCloseConfirmModal} />
            <div className="relative z-10 w-full max-w-sm bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] overflow-hidden flex flex-col animate-in zoom-in-95 duration-150 border border-zinc-200/90">
              <div className={`px-4 py-3.5 flex items-center justify-between ${confirmDeleteModal.isTrash ? 'bg-red-600 text-white' : 'bg-[#f5c41a] text-zinc-950'}`}>
                <div className="font-bold text-xs">
                  <span>
                    {confirmDeleteModal.isTrash ? 'Xác nhận dọn sạch thùng rác' : 'Xác nhận xóa sách đã chọn'}
                  </span>
                </div>
                <button
                  onClick={handleCloseConfirmModal}
                  className="p-1 rounded-md hover:bg-black/10 text-current cursor-pointer transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-4 sm:p-5 space-y-3">
                <p className="text-xs font-semibold text-zinc-800 leading-relaxed">
                  {confirmDeleteModal.isTrash ? (
                    <>
                      Tất cả các mục đã được chọn (<span className="text-red-600 font-bold">{selectedBookIds.length}</span> cuốn sách). Bạn có chắc chắn muốn dọn sạch thùng rác và <span className="text-red-600 font-bold">xóa vĩnh viễn</span> không?
                    </>
                  ) : (
                    <>
                      Tất cả các mục đã được chọn (<span className="text-zinc-900 font-bold">{selectedBookIds.length}</span> cuốn sách). Bạn có chắc chắn muốn chuyển vào <span className="text-red-600 font-bold">Thùng rác</span> không?
                    </>
                  )}
                </p>
                <p className="text-[11px] text-zinc-500">
                  {confirmDeleteModal.isTrash
                    ? 'Dữ liệu và toàn bộ ghi chú sẽ bị xóa hoàn toàn khỏi thiết bị và không thể khôi phục lại.'
                    : 'Nếu muốn bỏ bớt sách chưa muốn xóa, hãy nhấn "Đóng" để tắt dấu tick của những sách đó rồi nhấn xóa lại.'}
                </p>

                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-zinc-100">
                  <button
                    onClick={handleCloseConfirmModal}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 transition-colors cursor-pointer"
                  >
                    Đóng
                  </button>
                  <button
                    onClick={executeDeleteConfirmed}
                    className="px-4 py-1.5 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-700 active:scale-95 transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                  >
                    <Trash2 size={13} />
                    <span>Xoá ngay</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL XÁC NHẬN XÓA NHÓM */}
        {groupToDelete && (
          <div className="absolute inset-0 z-70 bg-transparent flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div data-library-child-backdrop="true" className="absolute inset-0 bg-white/25 backdrop-blur-[3px]" onClick={handleCancelDeleteGroup} />
            <div className="relative z-10 w-full max-w-sm bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] overflow-hidden flex flex-col animate-in zoom-in-95 duration-150 border border-zinc-200/90">
              <div className="bg-[#f5c41a] px-4 py-3.5 flex items-center justify-between text-zinc-950 border-b border-[#e5b512]">
                <div className="font-bold text-xs flex items-center gap-2">
                  <AlertCircle size={16} className="text-zinc-950 shrink-0" />
                  <span>Xác nhận xóa nhóm</span>
                </div>
                <button
                  onClick={handleCancelDeleteGroup}
                  className="p-1 rounded-md hover:bg-black/10 text-zinc-950 cursor-pointer transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-4 sm:p-5 space-y-3">
                <p className="text-xs font-semibold text-zinc-800 leading-relaxed">
                  Bạn có chắc chắn muốn xóa nhóm <span className="font-bold text-red-600">"{groupToDelete.name}"</span> không?
                </p>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Các cuốn sách trong nhóm này sẽ không bị xóa mà sẽ tự động chuyển về trạng thái <span className="font-semibold text-zinc-700">Tất cả sách (Chưa phân nhóm)</span>.
                </p>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-100">
                  <button
                    onClick={handleCancelDeleteGroup}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 transition-colors cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={handleConfirmDeleteGroup}
                    className="px-4 py-1.5 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-700 active:scale-95 transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                  >
                    <Trash2 size={13} />
                    <span>Xóa nhóm</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Image Ordering Modal for Library Uploads */}
        <ImageOrderModal
          isOpen={isImageOrderModalOpen}
          files={pendingImageFiles}
          onClose={() => setIsImageOrderModalOpen(false)}
          onConfirm={handleConfirmOrderedImagesForLibrary}
        />
      </div>
    </div>
  );
};
