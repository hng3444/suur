import type { Note, NoteSortOrder } from '@/lib/types';

export function plainTextPreview(value: string, limit = 360) {
  const text = value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/[*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text;
}

export function hasActiveFilters(filters: { color: string; label: string; date: string; reminder: string }) {
  return Object.values(filters).some((value) => value !== 'all');
}

export function sortNotes(notes: Note[], order: NoteSortOrder, locale: string) {
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
  return [...notes].sort((left, right) => {
    if (order === 'updated-desc') return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    if (order === 'updated-asc') return Date.parse(left.updatedAt) - Date.parse(right.updatedAt);
    if (order === 'created-desc') return Date.parse(right.createdAt) - Date.parse(left.createdAt);
    if (order === 'created-asc') return Date.parse(left.createdAt) - Date.parse(right.createdAt);
    if (order === 'title-asc') return collator.compare(left.title, right.title) || Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    return left.position - right.position || Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  });
}

export function reconcileEditorSave(current: Note, saved: Note, hasNewerLocalChanges: boolean) {
  if (!hasNewerLocalChanges) return saved;
  return {
    ...current,
    version: Math.max(current.version, saved.version),
    createdAt: saved.createdAt,
    updatedAt: saved.updatedAt,
    attachments: current.attachments.length >= saved.attachments.length ? current.attachments : saved.attachments,
  };
}
