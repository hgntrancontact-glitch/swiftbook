import React, { useState, useEffect } from 'react';
import {
  CustomTOCItem,
  AutoTOCItem,
  HighlightAnnotation,
  TextNoteAnnotation,
  BoxAnnotation,
  FreeTextAnnotation,
  DrawingStroke,
} from '../types';
import {
  Plus,
  X,
  ChevronDown,
  ChevronRight,
  Edit2,
  Trash2,
  ArrowUp,
  ArrowDown,
  GripVertical,
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  currentPage: number;
  totalPages: number;
  customTOC: CustomTOCItem[];
  autoTOC?: AutoTOCItem[];
  highlights?: HighlightAnnotation[];
  textNotes?: TextNoteAnnotation[];
  boxes?: BoxAnnotation[];
  freeTexts?: FreeTextAnnotation[];
  drawings?: DrawingStroke[];
  onPageSelect: (page: number) => void;
  onAddCustomTOCItem: (title: string, pageNumber: number, level: 1 | 2 | 3, parentId?: string | null) => void;
  onUpdateCustomTOCItem: (id: string, title: string, pageNumber: number) => void;
  onDeleteCustomTOCItem: (id: string) => void;
  onMoveCustomTOCItem?: (id: string, direction: 'up' | 'down') => void;
  onReorderCustomTOC?: (fromC1Id: string, toC1Id: string, position: 'before' | 'after') => void;
  onDeleteHighlight?: (id: string) => void;
  onDeleteNote?: (id: string) => void;
  onDeleteBox?: (id: string) => void;
  onDeleteFreeText?: (id: string) => void;
  onClearAllAnnotations?: () => void;
  onExportData?: () => void;
  onImportData?: (file: File) => void;
}

interface TOCNode extends CustomTOCItem {
  children: TOCNode[];
}

function buildTOCTree(items: CustomTOCItem[]): TOCNode[] {
  const itemMap = new Map<string, TOCNode>();
  const roots: TOCNode[] = [];

  items.forEach((item) => {
    itemMap.set(item.id, { ...item, children: [] });
  });

  items.forEach((item) => {
    const node = itemMap.get(item.id)!;
    if (item.parentId && itemMap.has(item.parentId)) {
      itemMap.get(item.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  currentPage,
  totalPages,
  customTOC,
  onPageSelect,
  onAddCustomTOCItem,
  onUpdateCustomTOCItem,
  onDeleteCustomTOCItem,
  onMoveCustomTOCItem,
  onReorderCustomTOC,
}) => {
  // Collapsed items state (item.id -> isCollapsed)
  const [collapsedIds, setCollapsedIds] = useState<Record<string, boolean>>({});

  // Drag-and-drop state for C1 items
  const [draggedC1Id, setDraggedC1Id] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<{
    id: string;
    position: 'before' | 'after';
  } | null>(null);

  // Adding TOC state
  const [isAddingTOC, setIsAddingTOC] = useState(false);
  const [tocTargetParentId, setTocTargetParentId] = useState<string | null>(null);
  const [tocTargetLevel, setTocTargetLevel] = useState<1 | 2 | 3>(1);
  const [newTOCTitle, setNewTOCTitle] = useState('');
  const [newTOCPage, setNewTOCPage] = useState<number>(currentPage || 1);
  const [isPageManuallyEdited, setIsPageManuallyEdited] = useState(false);

  // Edit TOC item state
  const [editingTOCId, setEditingTOCId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editPage, setEditPage] = useState(1);

  // Auto update "Đến trang: X" to currentPage if user hasn't manually edited it
  useEffect(() => {
    if (isAddingTOC && !isPageManuallyEdited) {
      setNewTOCPage(currentPage || 1);
    }
  }, [currentPage, isAddingTOC, isPageManuallyEdited]);

  if (!isOpen) return null;

  const toggleCollapse = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCollapsedIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleOpenAddRootItem = () => {
    setTocTargetParentId(null);
    setTocTargetLevel(1);
    setNewTOCTitle('');
    setNewTOCPage(currentPage || 1);
    setIsPageManuallyEdited(false);
    setIsAddingTOC(true);
  };

  const handleOpenAddSubItem = (parent: CustomTOCItem) => {
    const nextLevel = Math.min(3, (parent.level || 1) + 1) as 1 | 2 | 3;
    setTocTargetParentId(parent.id);
    setTocTargetLevel(nextLevel);
    setNewTOCTitle('');
    setNewTOCPage(currentPage || 1);
    setIsPageManuallyEdited(false);
    setIsAddingTOC(true);
    // Expand parent when adding a child
    setCollapsedIds((prev) => ({ ...prev, [parent.id]: false }));
  };

  const handleSaveNewTOC = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTOCTitle.trim()) return;

    onAddCustomTOCItem(
      newTOCTitle.trim(),
      Math.max(1, Math.min(totalPages || 9999, newTOCPage)),
      tocTargetLevel,
      tocTargetParentId
    );

    if (tocTargetParentId) {
      setCollapsedIds((prev) => ({ ...prev, [tocTargetParentId]: false }));
    }

    setIsAddingTOC(false);
    setNewTOCTitle('');
    setTocTargetParentId(null);
    setTocTargetLevel(1);
  };

  const handleStartEditTOC = (item: CustomTOCItem) => {
    setEditingTOCId(item.id);
    setEditTitle(item.title);
    setEditPage(item.pageNumber);
  };

  const handleSaveEditTOC = (id: string) => {
    if (!editTitle.trim()) return;
    onUpdateCustomTOCItem(id, editTitle.trim(), Math.max(1, Math.min(totalPages || 9999, editPage)));
    setEditingTOCId(null);
  };

  const tree = buildTOCTree(customTOC);

  const renderNode = (
    node: TOCNode,
    c1Meta?: {
      isFirstC1: boolean;
      isLastC1: boolean;
    }
  ) => {
    const level = node.level || 1;
    const hasChildren = node.children.length > 0;
    const isCollapsed = Boolean(collapsedIds[node.id]);
    const isEditing = editingTOCId === node.id;
    const isTargetForAdd = isAddingTOC && tocTargetParentId === node.id;
    const isC1 = level === 1;

    // Indentation according to level (C1: pl-0, C2: pl-6, C3: pl-12)
    const indentClass = level === 1 ? 'pl-0' : level === 2 ? 'pl-6' : 'pl-12';

    return (
      <div key={node.id} className="w-full">
        {/* Node Row */}
        {isEditing ? (
          <div className={`py-1 ${indentClass}`}>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="flex-1 bg-transparent border-b border-neutral-400 outline-none text-[13px] text-neutral-900 py-0.5"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveEditTOC(node.id);
                  if (e.key === 'Escape') setEditingTOCId(null);
                }}
              />
            </div>
            <div className="flex items-center gap-2 mt-1.5 text-[12px]">
              <span className="text-neutral-700">Đến trang:</span>
              <input
                type="number"
                min={1}
                max={totalPages || 9999}
                value={editPage}
                onChange={(e) => setEditPage(parseInt(e.target.value, 10) || 1)}
                className="w-12 px-1 py-0.5 border border-neutral-300 rounded-[3px] text-center text-[12px]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveEditTOC(node.id);
                  if (e.key === 'Escape') setEditingTOCId(null);
                }}
              />
              <span className="text-neutral-400">/ {totalPages || 1}</span>
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleSaveEditTOC(node.id)}
                  className="px-2.5 py-0.5 bg-black text-white rounded-[3px] text-[12px] hover:bg-neutral-800 transition-colors cursor-pointer"
                >
                  Lưu
                </button>
                <button
                  type="button"
                  onClick={() => setEditingTOCId(null)}
                  className="px-1.5 py-0.5 text-neutral-500 hover:text-black text-[12px] transition-colors cursor-pointer"
                >
                  Hủy
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div
            draggable={isC1 && !isEditing && !isAddingTOC}
            onDragStart={(e) => {
              if (!isC1) return;
              e.stopPropagation();
              e.dataTransfer.setData('text/plain', node.id);
              e.dataTransfer.effectAllowed = 'move';
              setDraggedC1Id(node.id);
            }}
            onDragEnd={() => {
              setDraggedC1Id(null);
              setDragOverTarget(null);
            }}
            className={`group flex items-center justify-between py-1 px-1 rounded-sm ${indentClass} hover:bg-neutral-50/90 transition-colors select-none ${
              isC1 ? 'cursor-grab active:cursor-grabbing' : ''
            }`}
          >
            {/* Left: Grip Handle (C1 only) + Chevron (if has children) & Title */}
            <div className="flex items-center gap-1 min-w-0 flex-1 mr-2">
              {isC1 && (
                <div
                  className="text-neutral-400 group-hover:text-neutral-700 transition-colors shrink-0 cursor-grab active:cursor-grabbing p-0.5"
                  title="Đè/giữ chuột trái kéo di chuyển mục C1 (toàn bộ nhánh con đi theo)"
                >
                  <GripVertical size={13} strokeWidth={2} />
                </div>
              )}

              {hasChildren ? (
                <button
                  type="button"
                  draggable={false}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => toggleCollapse(node.id, e)}
                  className="text-neutral-700 hover:text-black shrink-0 transition-colors cursor-pointer"
                  title={isCollapsed ? 'Mở rộng' : 'Thu gọn'}
                >
                  {isCollapsed ? (
                    <ChevronRight size={14} strokeWidth={1.8} />
                  ) : (
                    <ChevronDown size={14} strokeWidth={1.8} />
                  )}
                </button>
              ) : null}

              <span
                onClick={() => onPageSelect(node.pageNumber)}
                className={`${
                  level === 1
                    ? 'text-[13px] font-semibold text-neutral-900'
                    : level === 2
                    ? 'text-[12.5px] font-normal text-neutral-800'
                    : 'text-[12px] font-normal text-neutral-700'
                } hover:text-black cursor-pointer truncate ${
                  currentPage === node.pageNumber ? 'text-black underline underline-offset-2' : ''
                }`}
                title={`Nhảy tới trang ${node.pageNumber}${isC1 && hasChildren ? ' • Đè/giữ chuột trái kéo để đổi vị trí cả nhánh' : ''}`}
              >
                {node.title}
              </span>
            </div>

            {/* Right: Actions, Page Number & Plus button */}
            <div
              className="flex items-center shrink-0"
              onMouseDown={(e) => e.stopPropagation()}
              draggable={false}
            >
              {/* Quick actions on hover: Reorder Up/Down, Edit, Delete */}
              <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 mr-1 transition-opacity">
                {isC1 && (
                  <>
                    <button
                      type="button"
                      disabled={c1Meta?.isFirstC1}
                      onClick={(e) => {
                        e.stopPropagation();
                        onMoveCustomTOCItem?.(node.id, 'up');
                      }}
                      className="p-1 text-neutral-400 hover:text-neutral-900 disabled:opacity-20 disabled:hover:text-neutral-400 disabled:cursor-not-allowed transition-colors cursor-pointer rounded"
                      title={c1Meta?.isFirstC1 ? 'Đang ở vị trí đầu tiên' : 'Di chuyển C1 lên trên (kèm toàn bộ nhánh con)'}
                    >
                      <ArrowUp size={11} strokeWidth={2.4} />
                    </button>
                    <button
                      type="button"
                      disabled={c1Meta?.isLastC1}
                      onClick={(e) => {
                        e.stopPropagation();
                        onMoveCustomTOCItem?.(node.id, 'down');
                      }}
                      className="p-1 text-neutral-400 hover:text-neutral-900 disabled:opacity-20 disabled:hover:text-neutral-400 disabled:cursor-not-allowed transition-colors cursor-pointer rounded"
                      title={c1Meta?.isLastC1 ? 'Đang ở vị trí cuối cùng' : 'Di chuyển C1 xuống dưới (kèm toàn bộ nhánh con)'}
                    >
                      <ArrowDown size={11} strokeWidth={2.4} />
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartEditTOC(node);
                  }}
                  className="p-1 text-neutral-400 hover:text-neutral-800 transition-colors cursor-pointer rounded"
                  title="Sửa mục"
                >
                  <Edit2 size={11} />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteCustomTOCItem(node.id);
                  }}
                  className="p-1 text-neutral-400 hover:text-red-600 transition-colors cursor-pointer rounded"
                  title="Xóa mục"
                >
                  <Trash2 size={11} />
                </button>
              </div>

              {/* Page Number (display only, non-clickable) */}
              <span className="text-[12px] text-neutral-700 font-normal text-right w-8 select-none mr-2">
                {node.pageNumber}
              </span>

              {/* Plus button slot: exactly 16px wide to maintain perfect column alignment */}
              <div className="w-[16px] flex items-center justify-center">
                {level < 3 ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenAddSubItem(node);
                    }}
                    className="text-neutral-400 hover:text-neutral-900 transition-colors p-0.5 rounded cursor-pointer"
                    title={`+ Thêm mục Cấp ${level + 1}`}
                  >
                    <Plus size={13} strokeWidth={1.8} />
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {/* Inline Creation Form under this item */}
        {isTargetForAdd && !isCollapsed && (
          <div className={`mt-1.5 mb-2.5 ${level === 1 ? 'pl-6' : 'pl-12'}`}>
            <form onSubmit={handleSaveNewTOC} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-neutral-600 text-sm shrink-0 select-none">↳</span>
                <input
                  type="text"
                  value={newTOCTitle}
                  onChange={(e) => setNewTOCTitle(e.target.value)}
                  placeholder={
                    tocTargetLevel === 2
                      ? 'Mục C2 (vd: 1.2 kế hoạch)'
                      : 'Mục C3 (vd: 3.2.1 hoạch định)'
                  }
                  className="flex-1 bg-transparent border-none outline-none text-[13px] text-neutral-900 placeholder:text-neutral-400 placeholder:font-normal py-0.5"
                  autoFocus
                  required
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setIsAddingTOC(false);
                  }}
                />
                <button
                  type="button"
                  onClick={() => setIsAddingTOC(false)}
                  className="text-neutral-400 hover:text-neutral-800 p-1 shrink-0 transition-colors cursor-pointer"
                  title="Hủy"
                >
                  <X size={13} />
                </button>
              </div>

              <div className="flex items-center gap-2 text-[12px]">
                <label className="text-neutral-700 font-normal whitespace-nowrap">Đến trang:</label>
                <input
                  type="number"
                  min={1}
                  max={totalPages || 9999}
                  value={newTOCPage}
                  onChange={(e) => {
                    setIsPageManuallyEdited(true);
                    setNewTOCPage(parseInt(e.target.value, 10) || 1);
                  }}
                  className="w-12 px-1.5 py-0.5 bg-white border border-neutral-300 rounded-[3px] text-center text-[12px] text-neutral-900 font-medium outline-none focus:border-neutral-800"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setIsAddingTOC(false);
                  }}
                />
                <span className="text-neutral-400">/ {totalPages || 1}</span>

                <button
                  type="submit"
                  className="ml-auto px-3 py-0.5 bg-black hover:bg-neutral-800 text-white rounded-[3px] font-normal text-[12px] transition-colors cursor-pointer"
                >
                  Lưu
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Children list */}
        {!isCollapsed && node.children.length > 0 && (
          <div className="space-y-0.5">
            {node.children.map((child) => renderNode(child))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="absolute md:relative inset-y-0 left-0 w-84 sm:w-92 md:w-[380px] bg-white border-r border-neutral-200 h-full flex flex-col z-30 md:z-20 shadow-xl md:shadow-none font-['Inter',sans-serif] shrink-0 min-h-0 animate-in slide-in-from-left duration-200 max-w-[92vw]">
      {/* 1. Header của sidebar */}
      <div className="flex items-center justify-between bg-[#ECEEF1] px-4 py-2.5 shrink-0 select-none">
        <button
          type="button"
          onClick={handleOpenAddRootItem}
          className="flex items-center gap-1 px-2.5 py-1 bg-black hover:bg-neutral-800 text-white text-[12.5px] font-semibold rounded-[4px] transition-colors shadow-2xs cursor-pointer"
          title="Tạo mục cấp 1"
        >
          <Plus size={13} strokeWidth={2.6} />
          <span>Tạo</span>
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1 text-neutral-800 hover:text-black text-[12.5px] font-normal transition-colors py-0.5 px-1 cursor-pointer"
          title="Đóng Mục lục"
        >
          <X size={14} strokeWidth={2} />
          <span>Đóng</span>
        </button>
      </div>

      {/* 2. Body Mục lục */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3.5 sm:px-5 sm:py-4 custom-scrollbar bg-white">
        {/* Form tạo Mục cấp 1 khi bấm "+ Tạo" ở header */}
        {isAddingTOC && tocTargetParentId === null && (
          <form onSubmit={handleSaveNewTOC} className="mb-5 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-neutral-600 text-sm shrink-0 select-none">↳</span>
              <input
                type="text"
                value={newTOCTitle}
                onChange={(e) => setNewTOCTitle(e.target.value)}
                placeholder="Mục C1 (vd: Chương 1, Bài 1.1...)"
                className="flex-1 bg-transparent border-none outline-none text-[13px] text-neutral-900 placeholder:text-neutral-400 placeholder:font-normal py-0.5"
                autoFocus
                required
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setIsAddingTOC(false);
                }}
              />
              <button
                type="button"
                onClick={() => setIsAddingTOC(false)}
                className="text-neutral-400 hover:text-neutral-800 p-1 shrink-0 transition-colors cursor-pointer"
                title="Hủy"
              >
                <X size={13} />
              </button>
            </div>

            <div className="flex items-center gap-2 text-[12px]">
              <label className="text-neutral-700 font-normal whitespace-nowrap">Đến trang:</label>
              <input
                type="number"
                min={1}
                max={totalPages || 9999}
                value={newTOCPage}
                onChange={(e) => {
                  setIsPageManuallyEdited(true);
                  setNewTOCPage(parseInt(e.target.value, 10) || 1);
                }}
                className="w-12 px-1.5 py-0.5 bg-white border border-neutral-300 rounded-[3px] text-center text-[12px] text-neutral-900 font-medium outline-none focus:border-neutral-800"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setIsAddingTOC(false);
                }}
              />
              <span className="text-neutral-400">/ {totalPages || 1}</span>

              <button
                type="submit"
                className="ml-auto px-3 py-0.5 bg-black hover:bg-neutral-800 text-white rounded-[3px] font-normal text-[12px] transition-colors cursor-pointer"
              >
                Lưu
              </button>
            </div>
          </form>
        )}

        {/* Danh sách mục lục */}
        {customTOC.length === 0 && !isAddingTOC ? (
          <div className="py-14 text-center text-neutral-400 text-[13px]">
            <p>Chưa có mục lục.</p>
            <p className="text-[12px] text-neutral-400 mt-1">
              Bấm “+ Tạo” để thêm mục đầu tiên.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {tree.map((rootNode, index) => {
              const isFirstC1 = index === 0;
              const isLastC1 = index === tree.length - 1;
              const isBeingDragged = draggedC1Id === rootNode.id;
              const isDragOverBefore =
                dragOverTarget?.id === rootNode.id && dragOverTarget.position === 'before';
              const isDragOverAfter =
                dragOverTarget?.id === rootNode.id && dragOverTarget.position === 'after';

              return (
                <div
                  key={rootNode.id}
                  className={`relative transition-all duration-150 ${
                    isBeingDragged
                      ? 'opacity-50 scale-[0.99] border-2 border-dashed border-neutral-900 bg-neutral-100/90 rounded-md p-0.5'
                      : ''
                  }`}
                  onDragOver={(e) => {
                    if (!draggedC1Id || draggedC1Id === rootNode.id) return;
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'move';
                    const rect = e.currentTarget.getBoundingClientRect();
                    const mid = rect.top + rect.height / 2;
                    const pos = e.clientY < mid ? 'before' : 'after';
                    setDragOverTarget({ id: rootNode.id, position: pos });
                  }}
                  onDragLeave={(e) => {
                    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                    setDragOverTarget((prev) => (prev?.id === rootNode.id ? null : prev));
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!draggedC1Id || draggedC1Id === rootNode.id) {
                      setDraggedC1Id(null);
                      setDragOverTarget(null);
                      return;
                    }
                    const rect = e.currentTarget.getBoundingClientRect();
                    const mid = rect.top + rect.height / 2;
                    const pos = e.clientY < mid ? 'before' : 'after';
                    onReorderCustomTOC?.(draggedC1Id, rootNode.id, pos);
                    setDraggedC1Id(null);
                    setDragOverTarget(null);
                  }}
                >
                  {/* Drop indicator line BEFORE */}
                  {isDragOverBefore && (
                    <div className="absolute -top-1.5 left-0 right-0 h-1 bg-black rounded-full z-20 shadow-xs pointer-events-none flex items-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-black -ml-1 border-2 border-white shadow-xs" />
                    </div>
                  )}

                  <div className="space-y-0.5">
                    {renderNode(rootNode, { isFirstC1, isLastC1 })}
                  </div>

                  {/* Drop indicator line AFTER */}
                  {isDragOverAfter && (
                    <div className="absolute -bottom-1.5 left-0 right-0 h-1 bg-black rounded-full z-20 shadow-xs pointer-events-none flex items-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-black -ml-1 border-2 border-white shadow-xs" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
};
