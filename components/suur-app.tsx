'use client';
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  Bell,
  CalendarDays,
  CheckSquare,
  Cloud,
  CloudOff,
  Grid2X2,
  Filter,
  LayoutTemplate,
  Lightbulb,
  List,
  Menu,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Tag,
  Tags,
  Trash2,
  X,
} from 'lucide-react';
import { NoteCard } from '@/components/note-card';
import { CalendarView } from '@/components/calendar-view';
import { BulkToolbar, NoteFilterPanel, TemplateMenu } from '@/components/note-controls';
import { NoteEditor } from '@/components/note-editor';
import { NoteViewer } from '@/components/note-viewer';
import { SettingsCenter } from '@/components/settings-center';
import { ConfirmDialog, ShareDialog } from '@/components/app-dialogs';
import { enqueue, getCache, queuedOperations, removeQueuedOperation, setCache, setOfflineNamespace, type QueuedOperation } from '@/lib/offline';
import { languageDirection, translate } from '@/lib/i18n';
import { hasActiveFilters } from '@/lib/client-utils';
import { syncDecision } from '@/lib/sync-policy';
import type { AppSettings, Label, Note, NoteView, User, UserSummary } from '@/lib/types';

const initialSettings: AppSettings = {
  theme: 'system',
  view: 'grid',
  sidebarCollapsed: false,
  locale: 'tr',
  accent: 'forest',
  notificationsEnabled: false,
  backupFrequency: 'off',
  trashRetentionDays: 30,
  completedItemsBottom: true,
};

function createDraft(ownerId = ''): Note {
  const timestamp = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    ownerId,
    assignedUserId: null,
    title: '',
    content: '',
    contentFormat: 'plain',
    type: 'text',
    items: [],
    color: 'default',
    pinned: false,
    archived: false,
    trashedAt: null,
    reminderAt: null,
    position: 0,
    version: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    labels: [],
    attachments: [],
  };
}

function notePayload(note: Note) {
  return {
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

async function rawOperation(operation: QueuedOperation) {
  const response = await fetch(operation.url, {
    method: operation.method,
    headers: {
      'Content-Type': 'application/json',
      'X-Suur-Mutation-Id': operation.id,
    },
    body: operation.body === undefined ? undefined : JSON.stringify(operation.body),
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

function viewTitle(view: NoteView, activeLabel: Label | null, locale: AppSettings['locale']) {
  if (activeLabel) return activeLabel.name;
  if (view === 'reminders') return translate(locale, 'nav.reminders');
  if (view === 'archive') return translate(locale, 'nav.archive');
  if (view === 'trash') return translate(locale, 'nav.trash');
  if (view === 'calendar') return translate(locale, 'nav.calendar');
  return translate(locale, 'nav.notes');
}

export function SuurApp({ initialUser }: { initialUser: User }) {
  setOfflineNamespace(initialUser.id);
  const [currentUser, setCurrentUser] = useState(initialUser);
  const [notes, setNotes] = useState<Note[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [directoryUsers, setDirectoryUsers] = useState<UserSummary[]>([]);
  const [settings, setSettings] = useState<AppSettings>(initialSettings);
  const [view, setView] = useState<NoteView>('notes');
  const [activeLabel, setActiveLabel] = useState<Label | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncIssue, setSyncIssue] = useState<'auth' | 'invalid' | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [compactNavigation, setCompactNavigation] = useState(false);
  const [labelManagerOpen, setLabelManagerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(initialUser.mustChangePassword);
  const [newLabelName, setNewLabelName] = useState('');
  const [editorNote, setEditorNote] = useState<Note | null>(null);
  const [viewerNote, setViewerNote] = useState<Note | null>(null);
  const [saveStatus, setSaveStatus] = useState('Kaydedildi');
  const [toast, setToast] = useState('');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionEnabled, setSelectionEnabled] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [filters, setFilters] = useState({ color: 'all', label: 'all', date: 'all', reminder: 'all' });
  const [filterEpoch, setFilterEpoch] = useState(0);
  const [confirmation, setConfirmation] = useState<{ title: string; message: string; destructive?: boolean; action: () => void | Promise<void> } | null>(null);
  const [shareUrl, setShareUrl] = useState('');
  const t = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) => translate(settings.locale, key, values);
  const ui = (turkish: string, english: string) => settings.locale === 'tr' ? turkish : english;

  const editorRef = useRef<Note | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());
  const syncingRef = useRef(false);
  const syncPausedRef = useRef(false);
  const hydratedCacheKeyRef = useRef<string | null>(null);
  const notesLoadSequenceRef = useRef(0);

  const cacheKey = `notes:${view}:${activeLabel?.id || 'all'}`;

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => current === message ? '' : current), 3200);
  }, []);

  const mergeServerNote = useCallback((serverNote: Note) => {
    setNotes((current) => current.map((note) => {
      if (note.id !== serverNote.id) return note;
      if (note.version > serverNote.version) return { ...note, attachments: serverNote.attachments };
      return serverNote;
    }));
    setEditorNote((current) => {
      if (!current || current.id !== serverNote.id) return current;
      const merged = current.version > serverNote.version
        ? { ...current, attachments: serverNote.attachments }
        : serverNote;
      editorRef.current = merged;
      return merged;
    });
    setViewerNote((current) => current?.id === serverNote.id ? serverNote : current);
  }, []);

  const retryVersionConflict = useCallback(async (operation: QueuedOperation, data: unknown) => {
    if (operation.method !== 'PATCH' || !operation.url.match(/^\/api\/notes\/[^/]+$/)) return null;
    const serverNote = (data as { note?: Note })?.note;
    if (!serverNote || !operation.body || typeof operation.body !== 'object' || Array.isArray(operation.body)) return null;
    const rebased: QueuedOperation = {
      ...operation,
      id: crypto.randomUUID(),
      body: { ...(operation.body as Record<string, unknown>), baseVersion: serverNote.version },
      createdAt: new Date().toISOString(),
    };
    return { ...(await rawOperation(rebased)), operation: rebased };
  }, []);

  const recoverMissingNote = useCallback(async (operation: QueuedOperation) => {
    const match = operation.method === 'PATCH' ? operation.url.match(/^\/api\/notes\/([^/]+)$/) : null;
    if (!match || !operation.body || typeof operation.body !== 'object' || Array.isArray(operation.body)) return null;
    const body: Record<string, unknown> = { ...(operation.body as Record<string, unknown>), id: decodeURIComponent(match[1]) };
    delete body.baseVersion;
    const recovery: QueuedOperation = {
      id: crypto.randomUUID(),
      method: 'POST',
      url: '/api/notes',
      body,
      createdAt: new Date().toISOString(),
    };
    return { ...(await rawOperation(recovery)), operation: recovery };
  }, []);

  const dispatchOperation = useCallback(async (operation: QueuedOperation) => {
    if (!navigator.onLine) {
      await enqueue(operation);
      setOffline(true);
      return null;
    }
    try {
      let { response, data } = await rawOperation(operation);
      if (operation.method === 'DELETE' && response.status === 404) return { deleted: true };
      if (operation.method === 'PATCH' && response.status === 404) {
        const recovery = await recoverMissingNote(operation);
        if (recovery) { response = recovery.response; data = recovery.data; }
      }
      let decision = syncDecision(response.status);
      if (decision === 'conflict' && operation.url.startsWith('/api/notes/')) {
        const retry = await retryVersionConflict(operation, data);
        if (retry) {
          response = retry.response;
          data = retry.data;
          decision = syncDecision(response.status);
        }
      }
      if (!response.ok) {
        await enqueue(operation);
        if (decision === 'pause-auth') { syncPausedRef.current = true; setSyncIssue('auth'); }
        else if (decision === 'pause-invalid') { syncPausedRef.current = true; setSyncIssue('invalid'); }
        else setOffline(true);
        showToast((data as { error?: string }).error || 'Değişiklik güvenli biçimde beklemeye alındı.');
        return null;
      }
      setSyncIssue(null);
      setOffline(false);
      return data as { note?: Note; deleted?: boolean; updated?: boolean };
    } catch (error) {
      if (error instanceof TypeError) {
        await enqueue(operation);
        setOffline(true);
        return null;
      }
      showToast(error instanceof Error ? error.message : 'İşlem tamamlanamadı.');
      return null;
    }
  }, [recoverMissingNote, retryVersionConflict, showToast]);

  const loadNotes = useCallback(async () => {
    const sequence = ++notesLoadSequenceRef.current;
    const requestedCacheKey = cacheKey;
    hydratedCacheKeyRef.current = null;
    setLoading(true);
    const query = new URLSearchParams({ view });
    if (activeLabel) query.set('label', activeLabel.id);
    try {
      const response = await fetch(`/api/notes?${query}`);
      if (!response.ok) throw new Error('Notlar alınamadı.');
      const data = await response.json() as { notes: Note[] };
      if (sequence !== notesLoadSequenceRef.current) return;
      hydratedCacheKeyRef.current = requestedCacheKey;
      setNotes(data.notes);
      await setCache(requestedCacheKey, data.notes);
      setOffline(false);
    } catch {
      const cached = await getCache<Note[]>(requestedCacheKey).catch(() => undefined);
      if (sequence !== notesLoadSequenceRef.current) return;
      hydratedCacheKeyRef.current = requestedCacheKey;
      if (cached) setNotes(cached);
      setOffline(true);
    } finally {
      if (sequence === notesLoadSequenceRef.current) setLoading(false);
    }
  }, [activeLabel, cacheKey, view]);

  const syncPending = useCallback(async (force = false) => {
    if (!navigator.onLine || syncingRef.current || (syncPausedRef.current && !force)) return;
    if (force) syncPausedRef.current = false;
    syncingRef.current = true;
    setSyncing(true);
    let completed = true;
    let changed = false;
    try {
      for (const operation of await queuedOperations()) {
        try {
          let { response, data } = await rawOperation(operation);
          if (operation.method === 'DELETE' && response.status === 404) { await removeQueuedOperation(operation.id); changed = true; continue; }
          if (operation.method === 'PATCH' && response.status === 404) {
            const recovery = await recoverMissingNote(operation);
            if (recovery) { response = recovery.response; data = recovery.data; }
          }
          let decision = syncDecision(response.status);
          if (decision === 'conflict' && operation.url.startsWith('/api/notes/')) {
            const retry = await retryVersionConflict(operation, data);
            if (retry) {
              response = retry.response;
              data = retry.data;
              decision = syncDecision(response.status);
            }
          }
          if (!response.ok) {
            completed = false;
            if (decision === 'pause-auth') { syncPausedRef.current = true; setSyncIssue('auth'); }
            else if (decision === 'pause-invalid') { syncPausedRef.current = true; setSyncIssue('invalid'); }
            else setOffline(true);
            break;
          }
          await removeQueuedOperation(operation.id);
          changed = true;
          const serverNote = (data as { note?: Note })?.note;
          if (serverNote) mergeServerNote(serverNote);
          setSyncIssue(null);
        } catch {
          completed = false;
          setOffline(true);
          break;
        }
      }
      if (completed && navigator.onLine) {
        syncPausedRef.current = false;
        setSyncIssue(null);
        setOffline(false);
        if (changed) await loadNotes();
      }
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [loadNotes, mergeServerNote, recoverMissingNote, retryVersionConflict]);

  useEffect(() => {
    const task = window.setTimeout(() => void loadNotes(), 0);
    return () => window.clearTimeout(task);
  }, [loadNotes]);

  useEffect(() => {
    const loadSupportingData = async () => {
      try {
        const [labelsResponse, settingsResponse, usersResponse] = await Promise.all([fetch('/api/labels'), fetch('/api/settings'), fetch('/api/users/directory')]);
        if (!labelsResponse.ok || !settingsResponse.ok) throw new Error();
        const labelsData = await labelsResponse.json() as { labels: Label[] };
        const settingsData = await settingsResponse.json() as { settings: AppSettings };
        setLabels(labelsData.labels);
        setSettings(settingsData.settings);
        if (usersResponse.ok) setDirectoryUsers((await usersResponse.json() as { users: UserSummary[] }).users);
        await Promise.all([setCache('labels', labelsData.labels), setCache('settings', settingsData.settings)]);
        void fetch('/api/maintenance', { method: 'POST' }).catch(() => undefined);
      } catch {
        const [cachedLabels, cachedSettings] = await Promise.all([
          getCache<Label[]>('labels').catch(() => undefined),
          getCache<AppSettings>('settings').catch(() => undefined),
        ]);
        if (cachedLabels) setLabels(cachedLabels);
        if (cachedSettings) setSettings(cachedSettings);
      }
    };
    void loadSupportingData();
    const initialSync = window.setTimeout(() => void syncPending(), 0);
    const retrySync = window.setInterval(() => {
      void queuedOperations().then((operations) => {
        if (operations.length && !syncPausedRef.current) void syncPending();
      }).catch(() => undefined);
    }, 12_000);
    const handleOnline = () => void syncPending();
    const handleOffline = () => setOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js').then(async () => {
        const registration = await navigator.serviceWorker.ready;
        registration.active?.postMessage({ type: 'CACHE_PRIVATE_SHELL', userId: initialUser.id });
        const periodic = (registration as ServiceWorkerRegistration & { periodicSync?: { register: (tag: string, options: { minInterval: number }) => Promise<void> } }).periodicSync;
        if (periodic) await periodic.register('suur-reminders', { minInterval: 15 * 60_000 }).catch(() => undefined);
      }).catch(() => undefined);
    }
    return () => {
      window.clearTimeout(initialSync);
      window.clearInterval(retrySync);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
    // The initial synchronization deliberately runs only once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const update = () => {
      setCompactNavigation(media.matches);
      if (!media.matches) setSidebarOpen(false);
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const resolved = settings.theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : settings.theme;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.accent = settings.accent;
    document.documentElement.lang = settings.locale;
    document.documentElement.dir = languageDirection(settings.locale);
    window.localStorage.setItem('suur-locale', settings.locale);
  }, [settings.accent, settings.locale, settings.theme]);

  useEffect(() => {
    if (hydratedCacheKeyRef.current === cacheKey) void setCache(cacheKey, notes);
  }, [cacheKey, notes]);

  useEffect(() => {
    if (!settings.notificationsEnabled || !('Notification' in window) || Notification.permission !== 'granted' || !('serviceWorker' in navigator)) return;
    let cancelled = false;
    const checkReminders = async () => {
      let reminderNotes: Note[] | undefined;
      try {
        const response = await fetch('/api/notes?view=reminders');
        if (response.ok) {
          reminderNotes = (await response.json() as { notes: Note[] }).notes;
          await setCache('notes:reminders:all', reminderNotes);
        }
      } catch {
        reminderNotes = await getCache<Note[]>('notes:reminders:all').catch(() => undefined);
      }
      if (cancelled || !reminderNotes) return;
      const now = Date.now();
      const registration = await navigator.serviceWorker.ready;
      for (const note of reminderNotes) {
        if (!note.reminderAt) continue;
        const due = new Date(note.reminderAt).getTime();
        if (due > now || due < now - 86_400_000) continue;
        const notificationKey = `notified:${note.id}:${note.reminderAt}`;
        if (await getCache<boolean>(notificationKey).catch(() => false)) continue;
        await registration.showNotification(note.title || translate(settings.locale, 'untitled'), {
          body: note.type === 'checklist' ? note.items.filter((item) => !item.checked).slice(0, 3).map((item) => item.text).join(' · ') : note.content.slice(0, 180),
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: notificationKey,
          data: { url: '/#reminders' },
        });
        await setCache(notificationKey, true);
      }
    };
    void checkReminders();
    const timer = window.setInterval(() => void checkReminders(), 30_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [settings.locale, settings.notificationsEnabled]);

  const persistSettings = async (patch: Partial<AppSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    await setCache('settings', next).catch(() => undefined);
    try {
      await fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    } catch { setOffline(true); }
  };

  const persistEditor = useCallback(async (force = false) => {
    const current = editorRef.current;
    if (!current) return;
    const meaningful = current.title.trim() || current.content.trim() || current.items.some((item) => item.text.trim()) || current.attachments.length;
    if (!force && !meaningful) return;

    setSaveStatus(translate(settings.locale, 'status.saving'));
    const isNew = current.version === 0;
    const optimistic: Note = {
      ...current,
      version: isNew ? 1 : current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    editorRef.current = optimistic;
    setEditorNote(optimistic);
    setNotes((items) => {
      const exists = items.some((note) => note.id === optimistic.id);
      return exists ? items.map((note) => note.id === optimistic.id ? optimistic : note) : [optimistic, ...items];
    });

    const operation: QueuedOperation = {
      id: crypto.randomUUID(),
      method: isNew ? 'POST' : 'PATCH',
      url: isNew ? '/api/notes' : `/api/notes/${current.id}`,
      body: isNew
        ? { id: current.id, ...notePayload(current) }
        : { ...notePayload(current), baseVersion: current.version },
      createdAt: new Date().toISOString(),
    };

    saveChain.current = saveChain.current.then(async () => {
      const result = await dispatchOperation(operation);
      if (result?.note) mergeServerNote(result.note);
      setSaveStatus(result ? translate(settings.locale, 'status.saved') : `${translate(settings.locale, 'status.offline')} · ${translate(settings.locale, 'status.saved')}`);
    });
    await saveChain.current;
  }, [dispatchOperation, mergeServerNote, settings.locale]);

  const changeEditor = (note: Note) => {
    editorRef.current = note;
    setEditorNote(note);
    setSaveStatus('Değişiklik var');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void persistEditor(), 700);
  };

  const closeEditor = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const beforeSave = editorRef.current;
    void persistEditor();
    const afterSave = editorRef.current;
    setEditorNote(null);
    editorRef.current = null;
    if (beforeSave && afterSave && afterSave.version > 0 && !afterSave.trashedAt) setViewerNote(afterSave);
  };

  const commitEditorAction = (patch: Partial<Note>) => {
    const current = editorRef.current;
    if (!current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    editorRef.current = { ...current, ...patch };
    void persistEditor(true);
    setNotes((items) => items.filter((item) => item.id !== current.id));
    setEditorNote(null);
    setViewerNote(null);
    editorRef.current = null;
  };

  const openEditor = (note: Note) => {
    editorRef.current = note;
    setEditorNote(note);
    setSaveStatus(t('status.saved'));
  };

  const openViewer = (note: Note) => setViewerNote(note);

  const editFromViewer = () => {
    if (!viewerNote) return;
    const note = viewerNote;
    setViewerNote(null);
    openEditor(note);
  };

  const newNote = (type: 'text' | 'checklist' = 'text') => {
    const draft = createDraft(currentUser.id);
    if (type === 'checklist') {
      draft.type = 'checklist';
      draft.items = [{ id: crypto.randomUUID(), text: '', checked: false }];
    }
    openEditor(draft);
  };

  const newFromTemplate = (template: 'shopping' | 'daily' | 'meeting' | 'idea') => {
    const draft = createDraft(currentUser.id);
    if (template === 'shopping') {
      draft.title = ui('Alışveriş listesi', 'Shopping list'); draft.type = 'checklist';
      draft.items = (settings.locale === 'tr' ? ['Meyve ve sebze', 'Temel ihtiyaçlar', 'Diğer'] : ['Fruit and vegetables', 'Essentials', 'Other']).map((text) => ({ id: crypto.randomUUID(), text, checked: false }));
    } else if (template === 'daily') {
      draft.title = ui('Günlük plan', 'Daily plan'); draft.type = 'checklist';
      draft.items = (settings.locale === 'tr' ? ['Bugünün önceliği', 'Yapılacaklar', 'Günün notu'] : ['Today’s priority', 'To-do list', 'Notes for today']).map((text) => ({ id: crypto.randomUUID(), text, checked: false }));
    } else if (template === 'meeting') {
      draft.title = ui('Toplantı notu', 'Meeting notes'); draft.contentFormat = 'markdown';
      draft.content = settings.locale === 'tr' ? '## Katılımcılar\n\n## Gündem\n\n## Kararlar\n\n## Aksiyonlar\n- [ ] ' : '## Attendees\n\n## Agenda\n\n## Decisions\n\n## Action items\n- [ ] ';
    } else {
      draft.title = ui('Yeni fikir', 'New idea'); draft.contentFormat = 'markdown';
      draft.content = settings.locale === 'tr' ? '## Fikir\n\n## Neden değerli?\n\n## İlk adım\n' : '## Idea\n\n## Why it matters\n\n## First step\n';
    }
    setTemplatesOpen(false);
    openEditor(draft);
  };

  const patchNote = async (note: Note, patch: Partial<Note>, remove = false) => {
    const optimistic = { ...note, ...patch, version: note.version + 1, updatedAt: new Date().toISOString() };
    setNotes((items) => remove ? items.filter((item) => item.id !== note.id) : items.map((item) => item.id === note.id ? optimistic : item));
    const operation: QueuedOperation = {
      id: crypto.randomUUID(),
      method: 'PATCH',
      url: `/api/notes/${note.id}`,
      body: { ...patch, labelIds: patch.labels?.map((label) => label.id), labels: undefined, attachments: undefined, baseVersion: note.version },
      createdAt: new Date().toISOString(),
    };
    const result = await dispatchOperation(operation);
    if (result?.note && !remove) mergeServerNote(result.note);
  };

  const performPermanentDelete = async (note: Note) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setNotes((items) => items.filter((item) => item.id !== note.id));
    if (editorRef.current?.id === note.id) {
      setEditorNote(null);
      editorRef.current = null;
    }
    if (viewerNote?.id === note.id) setViewerNote(null);
    await dispatchOperation({ id: crypto.randomUUID(), method: 'DELETE', url: `/api/notes/${note.id}`, createdAt: new Date().toISOString() });
  };

  const deletePermanently = (note: Note) => setConfirmation({
    title: ui('Not kalıcı olarak silinsin mi?', 'Delete this note forever?'),
    message: ui('Bu işlem geri alınamaz. Nota bağlı dosyalar da silinir.', 'This cannot be undone. Attached files will also be deleted.'),
    destructive: true,
    action: async () => { setConfirmation(null); await performPermanentDelete(note); },
  });

  const uploadAttachment = async (file: File) => {
    if (!navigator.onLine) { showToast('Dosya yüklemek için bağlantı gerekli.'); return; }
    await persistEditor(true);
    await saveChain.current;
    const current = editorRef.current;
    if (!current) return;
    const form = new FormData();
    form.append('file', file);
    try {
      setSaveStatus('Dosya yükleniyor…');
      const response = await fetch(`/api/notes/${current.id}/attachments`, { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Dosya yüklenemedi.');
      const next = { ...editorRef.current!, attachments: [...editorRef.current!.attachments, data.attachment] };
      editorRef.current = next;
      setEditorNote(next);
      setNotes((items) => items.map((note) => note.id === next.id ? next : note));
      setSaveStatus(t('status.saved'));
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Dosya yüklenemedi.');
    }
  };

  const deleteAttachment = async (id: string) => {
    const current = editorRef.current;
    if (!current) return;
    try {
      const response = await fetch(`/api/attachments/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error();
      const next = { ...current, attachments: current.attachments.filter((attachment) => attachment.id !== id) };
      editorRef.current = next;
      setEditorNote(next);
      setNotes((items) => items.map((note) => note.id === next.id ? next : note));
    } catch { showToast('Dosya kaldırılamadı.'); }
  };

  const duplicateNote = async (note: Note) => {
    try {
      const response = await fetch(`/api/notes/${note.id}/duplicate`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Not çoğaltılamadı.');
      setNotes((items) => [data.note, ...items]);
      setViewerNote(null);
      showToast('Not çoğaltıldı.');
    } catch (error) { showToast(error instanceof Error ? error.message : 'Not çoğaltılamadı.'); }
  };

  const shareNote = async (note: Note) => {
    try {
      const response = await fetch(`/api/notes/${note.id}/share`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Paylaşım bağlantısı oluşturulamadı.');
      setShareUrl(data.url);
    } catch (error) { showToast(error instanceof Error ? error.message : 'Paylaşım bağlantısı oluşturulamadı.'); }
  };

  const addLabel = async () => {
    const name = newLabelName.trim();
    if (!name) return;
    try {
      const response = await fetch('/api/labels', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, color: '#198754' }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Etiket eklenemedi.');
      const next = [...labels, data.label].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
      setLabels(next);
      await setCache('labels', next);
      setNewLabelName('');
    } catch (error) { showToast(error instanceof Error ? error.message : 'Etiket eklenemedi.'); }
  };

  const performRemoveLabel = async (label: Label) => {
    try {
      const response = await fetch(`/api/labels/${label.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error();
      setLabels((items) => items.filter((item) => item.id !== label.id));
      setNotes((items) => items.map((note) => ({ ...note, labels: note.labels.filter((item) => item.id !== label.id) })));
      if (activeLabel?.id === label.id) setActiveLabel(null);
    } catch { showToast('Etiket silinemedi.'); }
  };

  const removeLabel = (label: Label) => setConfirmation({
    title: ui('Etiketi sil', 'Delete label'),
    message: ui(`“${label.name}” etiketi silinecek. Notlar silinmez.`, `The “${label.name}” label will be removed. Notes will stay.`),
    destructive: true,
    action: async () => { setConfirmation(null); await performRemoveLabel(label); },
  });

  const reorder = async (targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    const source = notes.find((note) => note.id === draggedId);
    const target = notes.find((note) => note.id === targetId);
    if (!source || !target || source.pinned !== target.pinned) return;
    const group = notes.filter((note) => note.pinned === source.pinned);
    const sourceIndex = group.findIndex((note) => note.id === draggedId);
    const targetIndex = group.findIndex((note) => note.id === targetId);
    const reordered = [...group];
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    const positions = reordered.map((note, index) => ({ id: note.id, position: index * 1024 }));
    const byId = new Map(positions.map((item) => [item.id, item.position]));
    setNotes((items) => items.map((note) => byId.has(note.id) ? { ...note, position: byId.get(note.id)!, version: note.version + 1 } : note));
    setDraggedId(null);
    await dispatchOperation({ id: crypto.randomUUID(), method: 'POST', url: '/api/notes/reorder', body: { positions }, createdAt: new Date().toISOString() });
  };

  const filteredNotes = useMemo(() => {
    const query = search.trim().toLocaleLowerCase(settings.locale);
    const now = filterEpoch;
    const dateCutoff = filters.date === 'today' ? now - 86_400_000 : filters.date === 'week' ? now - 604_800_000 : filters.date === 'month' ? now - 2_592_000_000 : 0;
    return notes.filter((note) => {
      if (query && ![note.title, note.content, ...note.items.map((item) => item.text), ...note.labels.map((label) => label.name)].some((value) => value.toLocaleLowerCase(settings.locale).includes(query))) return false;
      if (filters.color !== 'all' && note.color !== filters.color) return false;
      if (filters.label !== 'all' && !note.labels.some((label) => label.id === filters.label)) return false;
      if (filters.reminder === 'yes' && !note.reminderAt) return false;
      if (filters.reminder === 'no' && note.reminderAt) return false;
      if (dateCutoff && new Date(note.updatedAt).getTime() < dateCutoff) return false;
      return true;
    });
  }, [filterEpoch, filters, notes, search, settings.locale]);

  const pinnedNotes = filteredNotes.filter((note) => note.pinned);
  const otherNotes = filteredNotes.filter((note) => !note.pinned);
  const canReorder = view === 'notes' && !activeLabel && !search && !selectionEnabled && !hasActiveFilters(filters);

  const navigate = (nextView: NoteView, label: Label | null = null) => {
    setView(nextView);
    setActiveLabel(label);
    setSearch('');
    setSidebarOpen(false);
    setSelectedIds(new Set());
    setSelectionEnabled(false);
    window.history.replaceState(null, '', nextView === 'notes' ? location.pathname : `#${nextView}`);
  };

  const toggleSelected = (note: Note) => {
    setSelectionEnabled(true);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(note.id)) next.delete(note.id); else next.add(note.id);
      return next;
    });
  };

  const selectedNotes = notes.filter((note) => selectedIds.has(note.id));

  const bulkPatch = async (patch: Partial<Note>, remove = false) => {
    await Promise.all(selectedNotes.map((note) => patchNote(note, patch, remove)));
    setSelectedIds(new Set());
    setSelectionEnabled(false);
  };

  const bulkAddLabel = async (labelId: string) => {
    const label = labels.find((item) => item.id === labelId);
    if (!label) return;
    await Promise.all(selectedNotes.map((note) => patchNote(note, { labels: note.labels.some((item) => item.id === label.id) ? note.labels : [...note.labels, label] })));
    setSelectedIds(new Set());
    setSelectionEnabled(false);
  };

  const performBulkDeleteForever = async () => {
    setNotes((items) => items.filter((note) => !selectedIds.has(note.id)));
    await Promise.all(selectedNotes.map((note) => dispatchOperation({ id: crypto.randomUUID(), method: 'DELETE', url: `/api/notes/${note.id}`, createdAt: new Date().toISOString() })));
    setSelectedIds(new Set());
    setSelectionEnabled(false);
  };

  const bulkDeleteForever = () => setConfirmation({
    title: ui('Seçili notları kalıcı sil', 'Delete selected notes forever'),
    message: ui(`${selectedNotes.length} not kalıcı olarak silinecek. Bu işlem geri alınamaz.`, `${selectedNotes.length} notes will be deleted permanently. This cannot be undone.`),
    destructive: true,
    action: async () => { setConfirmation(null); await performBulkDeleteForever(); },
  });

  useEffect(() => {
    const hash = window.location.hash.slice(1) as NoteView;
    const hashTask = window.setTimeout(() => { if (['reminders', 'calendar', 'archive', 'trash'].includes(hash)) setView(hash); }, 0);
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
      if (event.key === 'Escape') { setFilterOpen(false); setTemplatesOpen(false); setSelectedIds(new Set()); setSelectionEnabled(false); if (editorRef.current) closeEditor(); else setViewerNote(null); }
      if (!editing && event.key === '/') { event.preventDefault(); searchInput.current?.focus(); }
      if (!editing && event.key.toLowerCase() === 'n') { event.preventDefault(); newNote(); }
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && editorRef.current) closeEditor();
    };
    window.addEventListener('keydown', onKey);
    return () => { window.clearTimeout(hashTask); window.removeEventListener('keydown', onKey); };
    // Keyboard commands intentionally bind to the current editor state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reloadLabels = async () => {
    try {
      const response = await fetch('/api/labels');
      if (!response.ok) return;
      const next = (await response.json() as { labels: Label[] }).labels;
      setLabels(next);
      await setCache('labels', next);
    } catch { setOffline(true); }
  };

  const toggleNavigation = () => {
    if (compactNavigation) {
      setSidebarOpen((value) => !value);
      return;
    }
    void persistSettings({ sidebarCollapsed: !settings.sidebarCollapsed });
  };

  const sidebar = (
    <>
      <button className={`nav-item ${view === 'notes' && !activeLabel ? 'active' : ''}`} onClick={() => navigate('notes')}><Lightbulb size={20} /><span>{t('nav.notes')}</span></button>
      <button className={`nav-item ${view === 'reminders' ? 'active' : ''}`} onClick={() => navigate('reminders')}><Bell size={20} /><span>{t('nav.reminders')}</span></button>
      <button className={`nav-item ${view === 'calendar' ? 'active' : ''}`} onClick={() => navigate('calendar')}><CalendarDays size={20} /><span>{t('nav.calendar')}</span></button>
      <div className="sidebar-caption"><span>{t('nav.labels').toLocaleUpperCase(settings.locale)}</span><button onClick={() => setLabelManagerOpen(true)} aria-label={t('nav.labels')}><Settings size={14} /></button></div>
      {labels.map((label) => (
        <button className={`nav-item ${activeLabel?.id === label.id ? 'active' : ''}`} key={label.id} onClick={() => navigate('notes', label)}>
          <Tag size={19} /><span>{label.name}</span>
        </button>
      ))}
      {labels.length === 0 && <button className="nav-item quiet" onClick={() => setLabelManagerOpen(true)}><Plus size={19} /><span>{t('nav.createLabel')}</span></button>}
      <div className="sidebar-divider" />
      <button className={`nav-item ${view === 'archive' ? 'active' : ''}`} onClick={() => navigate('archive')}><Archive size={20} /><span>{t('nav.archive')}</span></button>
      <button className={`nav-item ${view === 'trash' ? 'active' : ''}`} onClick={() => navigate('trash')}><Trash2 size={20} /><span>{t('nav.trash')}</span></button>
      <button className="nav-item" onClick={() => { setSettingsOpen(true); setSidebarOpen(false); }}><Settings size={20} /><span>{t('nav.settings')}</span></button>
    </>
  );

  return (
    <main className={`app-shell ${settings.sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <header className="topbar">
        <button
          className="icon-button menu-button"
          onClick={toggleNavigation}
          aria-label={compactNavigation ? (sidebarOpen ? ui('Menüyü kapat', 'Close menu') : ui('Menüyü aç', 'Open menu')) : (settings.sidebarCollapsed ? ui('Menüyü göster', 'Show menu') : ui('Menüyü gizle', 'Hide menu'))}
          aria-expanded={compactNavigation ? sidebarOpen : !settings.sidebarCollapsed}
        ><Menu size={21} /></button>
        <button className="brand" onClick={() => navigate('notes')} aria-label={ui('Suur notlarına git', 'Go to Suur notes')}>
          <span className="brand-logo" aria-hidden="true" />
          <span>Suur</span>
        </button>
        <label className="search-box">
          <Search size={19} aria-hidden="true" />
          <input ref={searchInput} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('search')} aria-label={t('search')} />
          {search && <button onClick={() => setSearch('')} aria-label={ui('Aramayı temizle', 'Clear search')}><X size={17} /></button>}
        </label>
        <div className="top-actions">
          <span className={`connection-state ${offline ? 'offline' : ''}`} title={offline ? t('status.offline') : syncing ? t('status.syncing') : t('status.synced')}>
            {syncing ? <RefreshCw className="spin" size={17} /> : offline ? <CloudOff size={17} /> : <Cloud size={17} />}
          </span>
          <button className={`icon-button ${filterOpen || hasActiveFilters(filters) ? 'active' : ''}`} onClick={() => setFilterOpen((value) => !value)} aria-label={ui('Notları filtrele', 'Filter notes')} title={ui('Notları filtrele', 'Filter notes')}><Filter size={18} />{hasActiveFilters(filters) && <span className="toolbar-badge" />}</button>
          <button className={`icon-button ${selectionEnabled ? 'active' : ''}`} onClick={() => { setSelectionEnabled((value) => !value); setSelectedIds(new Set()); }} aria-label={ui('Notları seç', 'Select notes')} title={ui('Notları seç', 'Select notes')}><CheckSquare size={18} /></button>
          <button className="icon-button layout-toggle" onClick={() => void persistSettings({ view: settings.view === 'grid' ? 'list' : 'grid' })} aria-label={settings.view === 'grid' ? ui('Liste görünümü', 'List view') : ui('Grid görünümü', 'Grid view')} title={settings.view === 'grid' ? ui('Liste görünümü', 'List view') : ui('Grid görünümü', 'Grid view')}>
            {settings.view === 'grid' ? <List size={20} /> : <Grid2X2 size={19} />}
          </button>
          <button className="avatar" onClick={() => setSettingsOpen(true)} aria-label={ui('Suur ayarları', 'Suur settings')} title={t('nav.settings')}>
            {currentUser.avatarUrl
              ? <img src={currentUser.avatarUrl} alt="" />
              : (currentUser.displayName || currentUser.username).slice(0, 1).toLocaleUpperCase('tr')}
          </button>
        </div>
      </header>

      <aside className="sidebar desktop-sidebar" aria-label={ui('Ana menü', 'Main menu')}>{sidebar}<div className="privacy-note">{ui('Verilerin bu sunucuda kalır.', 'Your data stays on this server.')}</div></aside>

      {sidebarOpen && (
        <div className="mobile-drawer-backdrop" onClick={() => setSidebarOpen(false)}>
          <aside className="mobile-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-brand">
              <span className="brand-logo" aria-hidden="true" />
              <strong>Suur</strong><button onClick={() => setSidebarOpen(false)} aria-label={ui('Menüyü kapat', 'Close menu')}><X size={20} /></button>
            </div>
            {sidebar}
          </aside>
        </div>
      )}

      <section className="workspace">
        <div className="mobile-title-row"><h1>{viewTitle(view, activeLabel, settings.locale)}</h1></div>
        {syncIssue && <div className="sync-warning" role="status"><CloudOff size={17} /><span>{syncIssue === 'auth' ? ui('Oturum sona erdi. Bekleyen değişiklikler cihazda korunuyor; yeniden giriş yapınca gönderilecek.', 'Your session ended. Pending changes are safe on this device and will sync after sign-in.') : ui('Eski bir bekleyen değişiklik sunucu tarafından kabul edilmedi. Ekran otomatik yenilenmeyecek; düzeltildikten sonra yeniden deneyebilirsiniz.', 'An older pending change was rejected by the server. The screen will not auto-refresh; retry after it is corrected.')}</span><button onClick={() => void syncPending(true)}>{ui('Yeniden dene', 'Retry')}</button></div>}
        {selectionEnabled && <BulkToolbar locale={settings.locale} view={view} count={selectedIds.size} canDelete={selectedNotes.every((note) => note.ownerId === currentUser.id)} labels={labels} onArchive={() => void bulkPatch({ archived: view !== 'archive' }, true)} onTrash={() => void bulkPatch({ trashedAt: new Date().toISOString() }, true)} onRestore={() => void bulkPatch({ trashedAt: null }, true)} onDeleteForever={() => void bulkDeleteForever()} onAddLabel={(id) => void bulkAddLabel(id)} onClose={() => { setSelectionEnabled(false); setSelectedIds(new Set()); }} />}
        {filterOpen && <NoteFilterPanel locale={settings.locale} labels={labels} filters={filters} onChange={(next) => { if (next.date !== filters.date) setFilterEpoch(Date.now()); setFilters(next); }} onClear={() => { setFilters({ color: 'all', label: 'all', date: 'all', reminder: 'all' }); setFilterEpoch(0); }} onClose={() => setFilterOpen(false)} />}
        {view === 'notes' && !activeLabel && (
          <div className="composer-wrap"><div className="composer" role="group" aria-label={t('newNote')}>
            <button className="composer-main" onClick={() => newNote('text')}>{t('newNote')}</button>
            <button onClick={() => newNote('checklist')} aria-label={t('newChecklist')} title={t('newChecklist')}><CheckSquareIcon /></button>
            <button onClick={() => setTemplatesOpen((value) => !value)} aria-label={ui('Not şablonları', 'Note templates')} title={ui('Not şablonları', 'Note templates')}><LayoutTemplate size={19} /></button>
          </div>{templatesOpen && <TemplateMenu locale={settings.locale} onChoose={newFromTemplate} />}</div>
        )}

        {loading ? (
          <div className="loading-grid" aria-label={ui('Notlar yükleniyor', 'Loading notes')}>{[1, 2, 3, 4].map((item) => <span key={item} />)}</div>
        ) : view === 'calendar' ? (
          <CalendarView notes={filteredNotes} locale={settings.locale} onOpen={openViewer} />
        ) : filteredNotes.length === 0 ? (
          <div className="empty-state">
            {view === 'trash' ? <Trash2 size={38} /> : view === 'archive' ? <Archive size={38} /> : activeLabel ? <Tags size={38} /> : <Lightbulb size={40} />}
            <h2>{search ? t('empty.noMatch') : view === 'trash' ? t('empty.trash') : view === 'archive' ? t('empty.archive') : t('empty.first')}</h2>
            <p>{search ? t('empty.searchHint') : view === 'trash' ? t('empty.trashHint') : t('empty.firstHint')}</p>
            {view === 'notes' && !search && <button onClick={() => newNote()}><Plus size={17} /> {t('editor.new')}</button>}
          </div>
        ) : (
          <>
            {pinnedNotes.length > 0 && (
              <section className="note-section">
                <h2 className="section-label">{t('pinned')}</h2>
                <div className={`notes-grid ${settings.view === 'list' ? 'list-view' : ''}`}>
                  {pinnedNotes.map((note) => <NoteCard key={note.id} locale={settings.locale} note={note} currentUserId={currentUser.id} view={view} layout={settings.view} draggable={canReorder} selectionMode={selectionEnabled} selected={selectedIds.has(note.id)} onSelect={toggleSelected} onOpen={openViewer} onPatch={(item, patch, remove) => void patchNote(item, patch, remove)} onPermanentDelete={deletePermanently} onDragStart={setDraggedId} onDrop={(id) => void reorder(id)} />)}
                </div>
              </section>
            )}
            {otherNotes.length > 0 && (
              <section className="note-section">
                {pinnedNotes.length > 0 && <h2 className="section-label">{t('others')}</h2>}
                <div className={`notes-grid ${settings.view === 'list' ? 'list-view' : ''}`}>
                  {otherNotes.map((note) => <NoteCard key={note.id} locale={settings.locale} note={note} currentUserId={currentUser.id} view={view} layout={settings.view} draggable={canReorder} selectionMode={selectionEnabled} selected={selectedIds.has(note.id)} onSelect={toggleSelected} onOpen={openViewer} onPatch={(item, patch, remove) => void patchNote(item, patch, remove)} onPermanentDelete={deletePermanently} onDragStart={setDraggedId} onDrop={(id) => void reorder(id)} />)}
                </div>
              </section>
            )}
          </>
        )}
      </section>

      {view === 'notes' && <button className="mobile-fab" onClick={() => newNote()} aria-label={t('newNote')}><Plus size={25} /></button>}

      {viewerNote && (
        <NoteViewer
          note={viewerNote}
          locale={settings.locale}
          view={view}
          onClose={() => setViewerNote(null)}
          onEdit={editFromViewer}
          onRestore={() => { void patchNote(viewerNote, { trashedAt: null }, true); setViewerNote(null); }}
          onPermanentDelete={() => deletePermanently(viewerNote)}
          canDelete={viewerNote.ownerId === currentUser.id}
          canShare={viewerNote.ownerId === currentUser.id}
          onDuplicate={() => void duplicateNote(viewerNote)}
          onShare={() => void shareNote(viewerNote)}
          onNoteChange={(note) => { mergeServerNote(note); setViewerNote(note); }}
        />
      )}

      {editorNote && (
        <NoteEditor
          note={editorNote}
          locale={settings.locale}
          currentUserId={currentUser.id}
          offline={offline}
          users={directoryUsers}
          completedItemsBottom={settings.completedItemsBottom}
          labels={labels}
          view={view}
          saveStatus={saveStatus}
          onChange={changeEditor}
          onClose={closeEditor}
          onArchive={() => { const current = editorRef.current; if (current) commitEditorAction({ archived: !current.archived }); }}
          onTrash={() => commitEditorAction({ trashedAt: new Date().toISOString() })}
          onRestore={() => commitEditorAction({ trashedAt: null })}
          onPermanentDelete={() => { const current = editorRef.current; if (current) deletePermanently(current); }}
          onUpload={(file) => void uploadAttachment(file)}
          onDeleteAttachment={(id) => void deleteAttachment(id)}
        />
      )}

      {labelManagerOpen && (
        <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setLabelManagerOpen(false); }}>
          <section className="label-manager" role="dialog" aria-modal="true" aria-labelledby="label-manager-title">
            <header><div><span className="editor-kicker">DÜZENLE</span><h2 id="label-manager-title">Etiketler</h2></div><button className="toolbar-button" onClick={() => setLabelManagerOpen(false)} aria-label="Kapat"><X size={20} /></button></header>
            <div className="new-label-row"><Tag size={18} /><input value={newLabelName} onChange={(event) => setNewLabelName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void addLabel(); }} placeholder="Yeni etiket" maxLength={80} /><button onClick={() => void addLabel()} disabled={!newLabelName.trim()}><Plus size={18} /></button></div>
            <div className="managed-labels">
              {labels.map((label) => <div key={label.id}><span className="label-dot" style={{ background: label.color }} /><span>{label.name}</span><button onClick={() => void removeLabel(label)} aria-label={`${label.name} etiketini sil`}><Trash2 size={16} /></button></div>)}
              {labels.length === 0 && <p>Notlarını gruplamak için ilk etiketini oluştur.</p>}
            </div>
          </section>
        </div>
      )}

      {settingsOpen && (
        <SettingsCenter
          currentUser={currentUser}
          settings={settings}
          onClose={() => { if (!currentUser.mustChangePassword) setSettingsOpen(false); }}
          onSettingsChange={persistSettings}
          onUserChange={setCurrentUser}
          onImportComplete={() => { void loadNotes(); void reloadLabels(); }}
          onEditLabels={() => setLabelManagerOpen(true)}
        />
      )}

      {shareUrl && <ShareDialog locale={settings.locale} url={shareUrl} onClose={() => setShareUrl('')} />}
      {confirmation && <ConfirmDialog locale={settings.locale} title={confirmation.title} message={confirmation.message} destructive={confirmation.destructive} onCancel={() => setConfirmation(null)} onConfirm={confirmation.action} />}

      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}

function CheckSquareIcon() {
  return <span className="check-square-icon" aria-hidden="true">✓</span>;
}
