import localforage from 'localforage';
import {
  PDFDocumentState,
  HighlightAnnotation,
  TextNoteAnnotation,
  DrawingStroke,
  BoxAnnotation,
  FreeTextAnnotation,
  CustomTOCItem,
  SavedBook,
  BookGroup,
} from '../types';

const STORAGE_PREFIX = 'pdf_reader_doc_';
const LAST_OPENED_KEY = 'pdf_reader_last_opened_id';
const SAVED_BOOKS_LIST_KEY = 'pdf_reader_saved_books_index';
const SAVED_BOOK_GROUPS_KEY = 'pdf_reader_book_groups_list';

localforage.config({
  name: 'PDFReaderApp',
  storeName: 'pdf_files'
});

export function getDocumentStorageKey(fileId: string): string {
  return `${STORAGE_PREFIX}${fileId}`;
}

export function saveDocumentState(state: PDFDocumentState): void {
  try {
    const key = getDocumentStorageKey(state.fileId);
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem(LAST_OPENED_KEY, state.fileId);

    // If this book is in the Saved Books library, keep its index updated with latest reading page
    const books = getSavedBooks();
    const existingIndex = books.findIndex((b) => b.id === state.fileId);
    if (existingIndex >= 0) {
      books[existingIndex].lastReadPage = state.currentPage;
      books[existingIndex].totalPages = state.totalPages;
      books[existingIndex].savedAt = Date.now();
      localStorage.setItem(SAVED_BOOKS_LIST_KEY, JSON.stringify(books));
    }
  } catch (error) {
    console.error('Failed to save PDF state to localStorage:', error);
  }
}

export function loadDocumentState(fileId: string): PDFDocumentState | null {
  try {
    const key = getDocumentStorageKey(fileId);
    const data = localStorage.getItem(key);
    if (!data) return null;
    
    const parsed = JSON.parse(data);
    return {
      ...parsed,
      boxes: parsed.boxes || [],
      freeTexts: parsed.freeTexts || [],
    } as PDFDocumentState;
  } catch (error) {
    console.error('Failed to load PDF state from localStorage:', error);
    return null;
  }
}

export function getLastOpenedFileId(): string | null {
  try {
    return localStorage.getItem(LAST_OPENED_KEY);
  } catch {
    return null;
  }
}

export function clearDocumentState(fileId: string): void {
  try {
    localStorage.removeItem(getDocumentStorageKey(fileId));
  } catch (error) {
    console.error('Failed to clear PDF state:', error);
  }
}

export async function savePdfFileToForage(fileId: string, arrayBuffer: ArrayBuffer | Uint8Array): Promise<void> {
  try {
    await localforage.setItem(`pdf_content_${fileId}`, arrayBuffer);
  } catch (err) {
    console.error('Failed to save PDF content to localforage:', err);
  }
}

export async function loadPdfFileFromForage(fileId: string): Promise<Uint8Array | null> {
  try {
    const data = await localforage.getItem<Uint8Array | ArrayBuffer>(`pdf_content_${fileId}`);
    if (!data) return null;
    return new Uint8Array(data);
  } catch (err) {
    console.error('Failed to load PDF content from localforage:', err);
    return null;
  }
}

export async function deletePdfFileFromForage(fileId: string): Promise<void> {
  try {
    await localforage.removeItem(`pdf_content_${fileId}`);
  } catch (err) {
    console.error('Failed to remove PDF content from localforage:', err);
  }
}

const DEFAULT_BOOK_GROUPS: BookGroup[] = [];

const INITIAL_SAMPLE_BOOKS: SavedBook[] = [];

export function getSavedBooks(): SavedBook[] {
  try {
    const data = localStorage.getItem(SAVED_BOOKS_LIST_KEY);
    if (!data) {
      localStorage.setItem(SAVED_BOOKS_LIST_KEY, JSON.stringify(INITIAL_SAMPLE_BOOKS));
      return INITIAL_SAMPLE_BOOKS;
    }
    const parsed = JSON.parse(data) as SavedBook[];
    // Lọc bỏ các sách mẫu ảo cũ (ID bắt đầu bằng book_sample_)
    const filtered = parsed.filter(b => !b.id.startsWith('book_sample_'));
    if (filtered.length !== parsed.length) {
      localStorage.setItem(SAVED_BOOKS_LIST_KEY, JSON.stringify(filtered));
    }
    return filtered;
  } catch {
    return INITIAL_SAMPLE_BOOKS;
  }
}

export function saveBookToLibrary(book: SavedBook): void {
  try {
    const current = getSavedBooks();
    const existingIndex = current.findIndex((b) => b.id === book.id);
    let updated: SavedBook[];
    
    if (existingIndex >= 0) {
      updated = [...current];
      updated[existingIndex] = { ...current[existingIndex], ...book, savedAt: Date.now(), deletedAt: undefined };
    } else {
      updated = [{ ...book, deletedAt: undefined }, ...current];
    }
    
    localStorage.setItem(SAVED_BOOKS_LIST_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to save book to library:', err);
  }
}

export function updateSavedBookDetails(bookId: string, updates: Partial<SavedBook>): void {
  try {
    const current = getSavedBooks();
    const updated = current.map((b) => (b.id === bookId ? { ...b, ...updates } : b));
    localStorage.setItem(SAVED_BOOKS_LIST_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to update saved book details:', err);
  }
}

export function moveBookToTrash(id: string): void {
  try {
    const current = getSavedBooks();
    const updated = current.map((b) => (b.id === id ? { ...b, deletedAt: Date.now() } : b));
    localStorage.setItem(SAVED_BOOKS_LIST_KEY, JSON.stringify(updated));
    clearDocumentState(id);
  } catch (err) {
    console.error('Failed to move book to trash:', err);
  }
}

export function moveMultipleBooksToTrash(ids: string[]): void {
  try {
    const idSet = new Set(ids);
    const current = getSavedBooks();
    const updated = current.map((b) => (idSet.has(b.id) ? { ...b, deletedAt: Date.now() } : b));
    localStorage.setItem(SAVED_BOOKS_LIST_KEY, JSON.stringify(updated));
    ids.forEach((id) => clearDocumentState(id));
  } catch (err) {
    console.error('Failed to move multiple books to trash:', err);
  }
}

export function restoreBookFromTrash(id: string): void {
  try {
    const current = getSavedBooks();
    const updated = current.map((b) => (b.id === id ? { ...b, deletedAt: undefined } : b));
    localStorage.setItem(SAVED_BOOKS_LIST_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to restore book from trash:', err);
  }
}

export function restoreAllFromTrash(): void {
  try {
    const current = getSavedBooks();
    const updated = current.map((b) => ({ ...b, deletedAt: undefined }));
    localStorage.setItem(SAVED_BOOKS_LIST_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to restore all books from trash:', err);
  }
}

export function permanentlyDeleteBook(id: string): void {
  try {
    const current = getSavedBooks();
    const target = current.find((b) => b.id === id);
    if (target) {
      deletePdfFileFromForage(target.id);
      clearDocumentState(target.id);
    }
    const updated = current.filter((b) => b.id !== id);
    localStorage.setItem(SAVED_BOOKS_LIST_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to permanently delete book:', err);
  }
}

export function emptyTrash(): void {
  try {
    const current = getSavedBooks();
    const trashItems = current.filter((b) => b.deletedAt);
    trashItems.forEach((b) => {
      deletePdfFileFromForage(b.id);
      clearDocumentState(b.id);
    });
    const updated = current.filter((b) => !b.deletedAt);
    localStorage.setItem(SAVED_BOOKS_LIST_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to empty trash:', err);
  }
}

export function removeSavedBook(id: string): void {
  permanentlyDeleteBook(id);
}

export function removeMultipleSavedBooks(ids: string[]): void {
  try {
    const idSet = new Set(ids);
    const current = getSavedBooks();
    const toDelete = current.filter((b) => idSet.has(b.id));
    toDelete.forEach((b) => {
      deletePdfFileFromForage(b.id);
      clearDocumentState(b.id);
    });
    const updated = current.filter((b) => !idSet.has(b.id));
    localStorage.setItem(SAVED_BOOKS_LIST_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to remove multiple saved books:', err);
  }
}

export function updateBookGroupAssignment(bookId: string, groupId?: string, groupName?: string): void {
  try {
    const current = getSavedBooks();
    const updated = current.map((b) => {
      if (b.id === bookId) {
        return { ...b, groupId: groupId || undefined, groupName: groupName || undefined };
      }
      return b;
    });
    localStorage.setItem(SAVED_BOOKS_LIST_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to update book group:', err);
  }
}

export function getBookGroups(): BookGroup[] {
  try {
    const data = localStorage.getItem(SAVED_BOOK_GROUPS_KEY);
    if (!data) {
      localStorage.setItem(SAVED_BOOK_GROUPS_KEY, JSON.stringify(DEFAULT_BOOK_GROUPS));
      return DEFAULT_BOOK_GROUPS;
    }
    return JSON.parse(data) as BookGroup[];
  } catch {
    return DEFAULT_BOOK_GROUPS;
  }
}

export function saveBookGroupsOrder(orderedGroups: BookGroup[]): void {
  try {
    localStorage.setItem(SAVED_BOOK_GROUPS_KEY, JSON.stringify(orderedGroups));
  } catch (err) {
    console.error('Failed to save book groups order:', err);
  }
}

export function saveBookGroup(nameOrGroup: string | BookGroup, color?: string, id?: string): BookGroup {
  try {
    const groups = getBookGroups();
    let groupToSave: BookGroup;

    if (typeof nameOrGroup === 'object') {
      groupToSave = nameOrGroup;
    } else {
      const targetId = id || `group_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const existing = groups.find((g) => g.id === targetId);
      groupToSave = {
        id: targetId,
        name: nameOrGroup,
        color: color || '#f59e0b',
        createdAt: existing?.createdAt || Date.now(),
      };
    }

    const existingIndex = groups.findIndex((g) => g.id === groupToSave.id);
    let updated: BookGroup[];
    if (existingIndex >= 0) {
      updated = [...groups];
      updated[existingIndex] = groupToSave;
    } else {
      updated = [...groups, groupToSave];
    }
    localStorage.setItem(SAVED_BOOK_GROUPS_KEY, JSON.stringify(updated));
    return groupToSave;
  } catch (err) {
    console.error('Failed to save book group:', err);
    return {
      id: id || `group_${Date.now()}`,
      name: typeof nameOrGroup === 'string' ? nameOrGroup : nameOrGroup.name,
      createdAt: Date.now(),
    };
  }
}

export function deleteBookGroup(groupId: string): void {
  try {
    const groups = getBookGroups();
    const updated = groups.filter((g) => g.id !== groupId);
    localStorage.setItem(SAVED_BOOK_GROUPS_KEY, JSON.stringify(updated));
    // Clear groupId from any books that belonged to this group
    const books = getSavedBooks();
    const updatedBooks = books.map((b) => (b.groupId === groupId ? { ...b, groupId: undefined, groupName: undefined } : b));
    localStorage.setItem(SAVED_BOOKS_LIST_KEY, JSON.stringify(updatedBooks));
  } catch (err) {
    console.error('Failed to delete book group:', err);
  }
}

export function removeAllSavedBooks(): void {
  try {
    const books = getSavedBooks();
    books.forEach(b => {
      deletePdfFileFromForage(b.id);
      clearDocumentState(b.id);
    });
    localStorage.setItem(SAVED_BOOKS_LIST_KEY, JSON.stringify([]));
    localStorage.removeItem(LAST_OPENED_KEY);
  } catch (err) {
    console.error('Failed to clear all saved books:', err);
  }
}

export function isBookSavedInLibrary(fileId: string): boolean {
  try {
    const books = getSavedBooks();
    return books.some((b) => b.id === fileId && !b.deletedAt);
  } catch {
    return false;
  }
}

export function exportDocumentDataJSON(state: PDFDocumentState): string {
  return JSON.stringify(state, null, 2);
}

export function importDocumentDataJSON(jsonStr: string): Partial<PDFDocumentState> | null {
  try {
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}
