import type { MobileLocalState, MobilePendingOperation } from './mobile-sync.ts';
import type { AppSettings, ChecklistItem, Label, Note, NoteSortOrder, NoteView } from './types.ts';

export const fallbackMobileSettings: AppSettings = {
  theme: 'system',
  view: 'grid',
  sortOrder: 'manual',
  backgroundTone: 'neutral',
  sidebarCollapsed: false,
  locale: 'tr',
  accent: 'forest',
  notificationsEnabled: false,
  backupFrequency: 'off',
  trashRetentionDays: 30,
  completedItemsBottom: true,
};

function randomId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function createMobileChecklistItem(text = ''): ChecklistItem {
  return { id: randomId('item'), text, checked: false };
}

export function createMobileNote(state: MobileLocalState, type: Note['type'] = 'text'): Note {
  const timestamp = new Date().toISOString();
  const minimumPosition = state.notes.reduce((minimum, note) => Math.min(minimum, note.position), 1024);
  return {
    id: randomId('note'),
    ownerId: state.userId,
    assignedUserId: null,
    title: '',
    content: '',
    contentFormat: 'plain',
    type,
    items: type === 'checklist' ? [createMobileChecklistItem()] : [],
    color: 'default',
    pinned: false,
    archived: false,
    trashedAt: null,
    reminderAt: null,
    position: minimumPosition - 1024,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    labels: [],
    attachments: [],
  };
}

export function noteWriteBody(note: Note) {
  return {
    id: note.id,
    title: note.title,
    content: note.content,
    contentFormat: note.contentFormat,
    type: note.type,
    items: note.items,
    color: note.color,
    pinned: note.pinned,
    archived: note.archived,
    trashedAt: note.trashedAt,
    reminderAt: note.reminderAt,
    position: note.position,
    labelIds: note.labels.map((label) => label.id),
    assignedUserId: note.assignedUserId,
  };
}

/** Merge only fields edited on this screen; preserve remote media and metadata.
 * A concurrent change to the same field keeps the old base version so the
 * existing sync conflict policy preserves both versions rather than overwriting.
 */
export function mergeMobileDraft(latest: Note, draft: Note, original: Note): Note {
  const fields = ['title', 'content', 'contentFormat', 'type', 'items', 'color', 'pinned', 'archived', 'trashedAt', 'reminderAt', 'position', 'labels', 'assignedUserId'] as const;
  const changes: Partial<Note> = {};
  let conflict = false;
  for (const field of fields) {
    const before = JSON.stringify(original[field]);
    const after = JSON.stringify(draft[field]);
    if (before === after) continue;
    const remote = JSON.stringify(latest[field]);
    if (remote !== before && remote !== after) conflict = true;
    Object.assign(changes, { [field]: draft[field] });
  }
  return { ...latest, ...changes, version: conflict ? original.version : latest.version, updatedAt: new Date().toISOString() };
}

export function createNoteOperation(note: Note): MobilePendingOperation {
  return {
    id: randomId('mutation'),
    method: 'POST',
    url: '/api/notes',
    body: noteWriteBody(note),
    createdAt: new Date().toISOString(),
  };
}

export function updateNoteOperation(note: Note): MobilePendingOperation {
  const body = Object.fromEntries(Object.entries(noteWriteBody(note)).filter(([key]) => key !== 'id'));
  return {
    id: randomId('mutation'),
    method: 'PATCH',
    url: `/api/notes/${note.id}`,
    body: { ...body, baseVersion: note.version },
    createdAt: new Date().toISOString(),
  };
}

export function deleteNoteOperation(noteId: string): MobilePendingOperation {
  return {
    id: randomId('mutation'),
    method: 'DELETE',
    url: `/api/notes/${noteId}`,
    createdAt: new Date().toISOString(),
  };
}

export function settingsOperation(settings: Partial<AppSettings>): MobilePendingOperation {
  return {
    id: randomId('mutation'),
    method: 'PATCH',
    url: '/api/settings',
    body: settings,
    createdAt: new Date().toISOString(),
  };
}

export function createLabelOperation(label: Label): MobilePendingOperation {
  return {
    id: randomId('mutation'),
    method: 'POST',
    url: '/api/labels',
    body: { id: label.id, name: label.name, color: label.color },
    createdAt: new Date().toISOString(),
  };
}

export function updateLabelOperation(label: Label): MobilePendingOperation {
  return {
    id: randomId('mutation'),
    method: 'PATCH',
    url: `/api/labels/${label.id}`,
    body: { name: label.name, color: label.color },
    createdAt: new Date().toISOString(),
  };
}

export function deleteLabelOperation(labelId: string): MobilePendingOperation {
  return {
    id: randomId('mutation'),
    method: 'DELETE',
    url: `/api/labels/${labelId}`,
    createdAt: new Date().toISOString(),
  };
}

export function replaceLocalLabel(state: MobileLocalState, label: Label): MobileLocalState {
  const index = state.labels.findIndex((item) => item.id === label.id);
  const labels = index < 0 ? [...state.labels, label] : state.labels.map((item) => item.id === label.id ? label : item);
  return {
    ...state,
    labels,
    notes: state.notes.map((note) => ({
      ...note,
      labels: note.labels.map((item) => item.id === label.id ? label : item),
    })),
  };
}

export function removeLocalLabel(state: MobileLocalState, labelId: string): MobileLocalState {
  return {
    ...state,
    labels: state.labels.filter((label) => label.id !== labelId),
    notes: state.notes.map((note) => ({ ...note, labels: note.labels.filter((label) => label.id !== labelId) })),
  };
}

export function replaceLocalNote(state: MobileLocalState, note: Note): MobileLocalState {
  const next = { ...note, updatedAt: new Date().toISOString() };
  const index = state.notes.findIndex((item) => item.id === note.id);
  if (index < 0) return { ...state, notes: [next, ...state.notes] };
  const notes = [...state.notes];
  notes[index] = next;
  return { ...state, notes };
}

export function removeLocalNote(state: MobileLocalState, noteId: string): MobileLocalState {
  return { ...state, notes: state.notes.filter((note) => note.id !== noteId) };
}

export function visibleMobileNotes(state: MobileLocalState, view: NoteView, search: string) {
  const query = search.trim().toLocaleLowerCase();
  return state.notes.filter((note) => {
    const inView = view === 'trash' ? Boolean(note.trashedAt)
      : view === 'archive' ? note.archived && !note.trashedAt
        : view === 'reminders' ? Boolean(note.reminderAt) && !note.archived && !note.trashedAt
          : view === 'shared' ? note.ownerId !== state.userId && !note.trashedAt
            : !note.archived && !note.trashedAt;
    if (!inView) return false;
    if (!query) return true;
    const checklist = note.items.map((item) => item.text).join(' ');
    const labels = note.labels.map((label) => label.name).join(' ');
    return `${note.title} ${note.content} ${checklist} ${labels}`.toLocaleLowerCase().includes(query);
  });
}

export function sortMobileNotes(notes: Note[], order: NoteSortOrder) {
  const next = [...notes];
  const text = (value: string) => value.trim().toLocaleLowerCase();
  next.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (order === 'updated-desc') return b.updatedAt.localeCompare(a.updatedAt);
    if (order === 'updated-asc') return a.updatedAt.localeCompare(b.updatedAt);
    if (order === 'created-desc') return b.createdAt.localeCompare(a.createdAt);
    if (order === 'created-asc') return a.createdAt.localeCompare(b.createdAt);
    if (order === 'title-asc') return text(a.title).localeCompare(text(b.title));
    return a.position - b.position || b.updatedAt.localeCompare(a.updatedAt);
  });
  return next;
}
