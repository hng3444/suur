'use client';
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  Bell,
  Cloud,
  CloudOff,
  Grid2X2,
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
import { NoteEditor } from '@/components/note-editor';
import { NoteViewer } from '@/components/note-viewer';
import { SettingsCenter } from '@/components/settings-center';
import { enqueue, getCache, queuedOperations, removeQueuedOperation, setCache, setOfflineNamespace, type QueuedOperation } from '@/lib/offline';
import type { AppSettings, Label, Note, NoteView, User } from '@/lib/types';

const initialSettings: AppSettings = { theme: 'system', view: 'grid', sidebarCollapsed: false };

function createDraft(): Note {
  const timestamp = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: '',
    content: '',
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
    type: note.type,
    items: note.items,
    color: note.color,
    pinned: note.pinned,
    archived: note.archived,
    trashedAt: note.trashedAt,
    reminderAt: note.reminderAt,
    position: note.position,
    labelIds: note.labels.map((label) => label.id),
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

function viewTitle(view: NoteView, activeLabel: Label | null) {
  if (activeLabel) return activeLabel.name;
  if (view === 'reminders') return 'Hatırlatıcılar';
  if (view === 'archive') return 'Arşiv';
  if (view === 'trash') return 'Çöp kutusu';
  return 'Notlar';
}

export function SuurApp({ initialUser }: { initialUser: User }) {
  setOfflineNamespace(initialUser.id);
  const [currentUser, setCurrentUser] = useState(initialUser);
  const [notes, setNotes] = useState<Note[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [settings, setSettings] = useState<AppSettings>(initialSettings);
  const [view, setView] = useState<NoteView>('notes');
  const [activeLabel, setActiveLabel] = useState<Label | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [labelManagerOpen, setLabelManagerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [editorNote, setEditorNote] = useState<Note | null>(null);
  const [viewerNote, setViewerNote] = useState<Note | null>(null);
  const [saveStatus, setSaveStatus] = useState('Kaydedildi');
  const [toast, setToast] = useState('');
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const editorRef = useRef<Note | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());

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

  const createConflictCopy = useCallback(async (operation: QueuedOperation) => {
    const original = (operation.body || {}) as Record<string, unknown>;
    const body: Record<string, unknown> = { ...original, id: crypto.randomUUID(), baseVersion: undefined };
    body.title = `${String(original.title || 'Başlıksız not')} (çakışan kopya)`;
    const conflictOperation: QueuedOperation = {
      id: crypto.randomUUID(),
      method: 'POST',
      url: '/api/notes',
      body,
      createdAt: new Date().toISOString(),
    };
    try {
      const { response } = await rawOperation(conflictOperation);
      if (!response.ok) throw new Error('Kopya oluşturulamadı.');
    } catch {
      await enqueue(conflictOperation);
    }
    showToast('Aynı not başka bir yerde değişti; içeriğin çakışan kopya olarak korundu.');
  }, [showToast]);

  const dispatchOperation = useCallback(async (operation: QueuedOperation) => {
    if (!navigator.onLine) {
      await enqueue(operation);
      setOffline(true);
      return null;
    }
    try {
      const { response, data } = await rawOperation(operation);
      if (response.status === 409 && operation.url.startsWith('/api/notes/')) {
        await createConflictCopy(operation);
        return null;
      }
      if (!response.ok) {
        if (response.status >= 500) {
          await enqueue(operation);
          setOffline(true);
          return null;
        }
        throw new Error((data as { error?: string }).error || 'İşlem tamamlanamadı.');
      }
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
  }, [createConflictCopy, showToast]);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    const query = new URLSearchParams({ view });
    if (activeLabel) query.set('label', activeLabel.id);
    try {
      const response = await fetch(`/api/notes?${query}`);
      if (!response.ok) throw new Error('Notlar alınamadı.');
      const data = await response.json() as { notes: Note[] };
      setNotes(data.notes);
      await setCache(cacheKey, data.notes);
      setOffline(false);
    } catch {
      const cached = await getCache<Note[]>(cacheKey).catch(() => undefined);
      if (cached) setNotes(cached);
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, [activeLabel, cacheKey, view]);

  const syncPending = useCallback(async () => {
    if (!navigator.onLine || syncing) return;
    setSyncing(true);
    try {
      for (const operation of await queuedOperations()) {
        try {
          const { response } = await rawOperation(operation);
          if (response.status === 409 && operation.url.startsWith('/api/notes/')) {
            await createConflictCopy(operation);
            await removeQueuedOperation(operation.id);
            continue;
          }
          if (!response.ok) {
            if (response.status >= 500) break;
            await removeQueuedOperation(operation.id);
            continue;
          }
          await removeQueuedOperation(operation.id);
        } catch {
          setOffline(true);
          break;
        }
      }
      if (navigator.onLine) {
        setOffline(false);
        await loadNotes();
      }
    } finally {
      setSyncing(false);
    }
  }, [createConflictCopy, loadNotes, syncing]);

  useEffect(() => {
    const task = window.setTimeout(() => void loadNotes(), 0);
    return () => window.clearTimeout(task);
  }, [loadNotes]);

  useEffect(() => {
    const loadSupportingData = async () => {
      try {
        const [labelsResponse, settingsResponse] = await Promise.all([fetch('/api/labels'), fetch('/api/settings')]);
        if (!labelsResponse.ok || !settingsResponse.ok) throw new Error();
        const labelsData = await labelsResponse.json() as { labels: Label[] };
        const settingsData = await settingsResponse.json() as { settings: AppSettings };
        setLabels(labelsData.labels);
        setSettings(settingsData.settings);
        await Promise.all([setCache('labels', labelsData.labels), setCache('settings', settingsData.settings)]);
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
    const handleOnline = () => void syncPending();
    const handleOffline = () => setOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    return () => {
      window.clearTimeout(initialSync);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
    // The initial synchronization deliberately runs only once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const resolved = settings.theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : settings.theme;
    document.documentElement.dataset.theme = resolved;
  }, [settings.theme]);

  useEffect(() => {
    void setCache(cacheKey, notes);
  }, [cacheKey, notes]);

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

    setSaveStatus('Kaydediliyor…');
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
      setSaveStatus(result ? 'Kaydedildi' : 'Çevrimdışı kaydedildi');
    });
    await saveChain.current;
  }, [dispatchOperation, mergeServerNote]);

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
    setSaveStatus('Kaydedildi');
  };

  const openViewer = (note: Note) => setViewerNote(note);

  const editFromViewer = () => {
    if (!viewerNote) return;
    const note = viewerNote;
    setViewerNote(null);
    openEditor(note);
  };

  const newNote = (type: 'text' | 'checklist' = 'text') => {
    const draft = createDraft();
    if (type === 'checklist') {
      draft.type = 'checklist';
      draft.items = [{ id: crypto.randomUUID(), text: '', checked: false }];
    }
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

  const deletePermanently = async (note: Note) => {
    if (!window.confirm('Bu not kalıcı olarak silinsin mi? Bu işlem geri alınamaz.')) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setNotes((items) => items.filter((item) => item.id !== note.id));
    if (editorRef.current?.id === note.id) {
      setEditorNote(null);
      editorRef.current = null;
    }
    if (viewerNote?.id === note.id) setViewerNote(null);
    await dispatchOperation({ id: crypto.randomUUID(), method: 'DELETE', url: `/api/notes/${note.id}`, createdAt: new Date().toISOString() });
  };

  const uploadImage = async (file: File) => {
    if (!navigator.onLine) { showToast('Görsel yüklemek için bağlantı gerekli.'); return; }
    await persistEditor(true);
    await saveChain.current;
    const current = editorRef.current;
    if (!current) return;
    const form = new FormData();
    form.append('file', file);
    try {
      setSaveStatus('Görsel yükleniyor…');
      const response = await fetch(`/api/notes/${current.id}/attachments`, { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Görsel yüklenemedi.');
      const next = { ...editorRef.current!, attachments: [...editorRef.current!.attachments, data.attachment] };
      editorRef.current = next;
      setEditorNote(next);
      setNotes((items) => items.map((note) => note.id === next.id ? next : note));
      setSaveStatus('Kaydedildi');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Görsel yüklenemedi.');
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
    } catch { showToast('Görsel kaldırılamadı.'); }
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

  const removeLabel = async (label: Label) => {
    if (!window.confirm(`“${label.name}” etiketi silinsin mi? Notlar silinmez.`)) return;
    try {
      const response = await fetch(`/api/labels/${label.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error();
      setLabels((items) => items.filter((item) => item.id !== label.id));
      setNotes((items) => items.map((note) => ({ ...note, labels: note.labels.filter((item) => item.id !== label.id) })));
      if (activeLabel?.id === label.id) setActiveLabel(null);
    } catch { showToast('Etiket silinemedi.'); }
  };

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
    const query = search.trim().toLocaleLowerCase('tr');
    if (!query) return notes;
    return notes.filter((note) => [
      note.title,
      note.content,
      ...note.items.map((item) => item.text),
      ...note.labels.map((label) => label.name),
    ].some((value) => value.toLocaleLowerCase('tr').includes(query)));
  }, [notes, search]);

  const pinnedNotes = filteredNotes.filter((note) => note.pinned);
  const otherNotes = filteredNotes.filter((note) => !note.pinned);
  const canReorder = view === 'notes' && !activeLabel && !search;

  const navigate = (nextView: NoteView, label: Label | null = null) => {
    setView(nextView);
    setActiveLabel(label);
    setSearch('');
    setSidebarOpen(false);
  };

  const reloadLabels = async () => {
    try {
      const response = await fetch('/api/labels');
      if (!response.ok) return;
      const next = (await response.json() as { labels: Label[] }).labels;
      setLabels(next);
      await setCache('labels', next);
    } catch { setOffline(true); }
  };

  const sidebar = (
    <>
      <button className={`nav-item ${view === 'notes' && !activeLabel ? 'active' : ''}`} onClick={() => navigate('notes')}><Lightbulb size={20} /><span>Notlar</span></button>
      <button className={`nav-item ${view === 'reminders' ? 'active' : ''}`} onClick={() => navigate('reminders')}><Bell size={20} /><span>Hatırlatıcılar</span></button>
      <div className="sidebar-caption"><span>ETİKETLER</span><button onClick={() => setLabelManagerOpen(true)} aria-label="Etiketleri düzenle"><Settings size={14} /></button></div>
      {labels.map((label) => (
        <button className={`nav-item ${activeLabel?.id === label.id ? 'active' : ''}`} key={label.id} onClick={() => navigate('notes', label)}>
          <Tag size={19} /><span>{label.name}</span>
        </button>
      ))}
      {labels.length === 0 && <button className="nav-item quiet" onClick={() => setLabelManagerOpen(true)}><Plus size={19} /><span>Etiket oluştur</span></button>}
      <div className="sidebar-divider" />
      <button className={`nav-item ${view === 'archive' ? 'active' : ''}`} onClick={() => navigate('archive')}><Archive size={20} /><span>Arşiv</span></button>
      <button className={`nav-item ${view === 'trash' ? 'active' : ''}`} onClick={() => navigate('trash')}><Trash2 size={20} /><span>Çöp kutusu</span></button>
      <button className="nav-item" onClick={() => { setSettingsOpen(true); setSidebarOpen(false); }}><Settings size={20} /><span>Ayarlar</span></button>
    </>
  );

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="icon-button menu-button" onClick={() => setSidebarOpen(true)} aria-label="Menüyü aç"><Menu size={21} /></button>
        <button className="brand" onClick={() => navigate('notes')} aria-label="Suur notlarına git">
          <span className="brand-logo" aria-hidden="true" />
          <span>Suur</span>
        </button>
        <label className="search-box">
          <Search size={19} aria-hidden="true" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Notlarda ara" aria-label="Notlarda ara" />
          {search && <button onClick={() => setSearch('')} aria-label="Aramayı temizle"><X size={17} /></button>}
        </label>
        <div className="top-actions">
          <span className={`connection-state ${offline ? 'offline' : ''}`} title={offline ? 'Çevrimdışı' : syncing ? 'Senkronize ediliyor' : 'Senkronize'}>
            {syncing ? <RefreshCw className="spin" size={17} /> : offline ? <CloudOff size={17} /> : <Cloud size={17} />}
          </span>
          <button className="icon-button layout-toggle" onClick={() => void persistSettings({ view: settings.view === 'grid' ? 'list' : 'grid' })} aria-label={settings.view === 'grid' ? 'Liste görünümü' : 'Grid görünümü'} title={settings.view === 'grid' ? 'Liste görünümü' : 'Grid görünümü'}>
            {settings.view === 'grid' ? <List size={20} /> : <Grid2X2 size={19} />}
          </button>
          <button className="avatar" onClick={() => setSettingsOpen(true)} aria-label="Suur ayarları" title="Ayarlar">
            {currentUser.avatarUrl
              ? <img src={currentUser.avatarUrl} alt="" />
              : (currentUser.displayName || currentUser.username).slice(0, 1).toLocaleUpperCase('tr')}
          </button>
        </div>
      </header>

      <aside className="sidebar desktop-sidebar" aria-label="Ana menü">{sidebar}<div className="privacy-note">Verilerin bu sunucuda kalır.</div></aside>

      {sidebarOpen && (
        <div className="mobile-drawer-backdrop" onClick={() => setSidebarOpen(false)}>
          <aside className="mobile-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-brand">
              <span className="brand-logo" aria-hidden="true" />
              <strong>Suur</strong><button onClick={() => setSidebarOpen(false)} aria-label="Menüyü kapat"><X size={20} /></button>
            </div>
            {sidebar}
          </aside>
        </div>
      )}

      <section className="workspace">
        <div className="mobile-title-row"><h1>{viewTitle(view, activeLabel)}</h1></div>
        {view === 'notes' && !activeLabel && (
          <div className="composer" role="group" aria-label="Yeni not oluştur">
            <button className="composer-main" onClick={() => newNote('text')}>Bir not al…</button>
            <button onClick={() => newNote('checklist')} aria-label="Yeni checklist" title="Yeni checklist"><CheckSquareIcon /></button>
          </div>
        )}

        {loading ? (
          <div className="loading-grid" aria-label="Notlar yükleniyor">{[1, 2, 3, 4].map((item) => <span key={item} />)}</div>
        ) : filteredNotes.length === 0 ? (
          <div className="empty-state">
            {view === 'trash' ? <Trash2 size={38} /> : view === 'archive' ? <Archive size={38} /> : activeLabel ? <Tags size={38} /> : <Lightbulb size={40} />}
            <h2>{search ? 'Eşleşen not bulunamadı' : view === 'trash' ? 'Çöp kutusu boş' : view === 'archive' ? 'Arşiv boş' : 'İlk notunu oluştur'}</h2>
            <p>{search ? 'Başka bir kelimeyle aramayı dene.' : view === 'trash' ? 'Sildiğin notlar burada görünür.' : 'Aklındakini kaybetmeden Suur’a bırak.'}</p>
            {view === 'notes' && !search && <button onClick={() => newNote()}><Plus size={17} /> Yeni not</button>}
          </div>
        ) : (
          <>
            {pinnedNotes.length > 0 && (
              <section className="note-section">
                <h2 className="section-label">SABİTLENMİŞ</h2>
                <div className={`notes-grid ${settings.view === 'list' ? 'list-view' : ''}`}>
                  {pinnedNotes.map((note) => <NoteCard key={note.id} note={note} view={view} layout={settings.view} draggable={canReorder} onOpen={openViewer} onPatch={(item, patch, remove) => void patchNote(item, patch, remove)} onPermanentDelete={(item) => void deletePermanently(item)} onDragStart={setDraggedId} onDrop={(id) => void reorder(id)} />)}
                </div>
              </section>
            )}
            {otherNotes.length > 0 && (
              <section className="note-section">
                {pinnedNotes.length > 0 && <h2 className="section-label">DİĞER</h2>}
                <div className={`notes-grid ${settings.view === 'list' ? 'list-view' : ''}`}>
                  {otherNotes.map((note) => <NoteCard key={note.id} note={note} view={view} layout={settings.view} draggable={canReorder} onOpen={openViewer} onPatch={(item, patch, remove) => void patchNote(item, patch, remove)} onPermanentDelete={(item) => void deletePermanently(item)} onDragStart={setDraggedId} onDrop={(id) => void reorder(id)} />)}
                </div>
              </section>
            )}
          </>
        )}
      </section>

      {view === 'notes' && <button className="mobile-fab" onClick={() => newNote()} aria-label="Yeni not"><Plus size={25} /></button>}

      {viewerNote && (
        <NoteViewer
          note={viewerNote}
          view={view}
          onClose={() => setViewerNote(null)}
          onEdit={editFromViewer}
          onRestore={() => { void patchNote(viewerNote, { trashedAt: null }, true); setViewerNote(null); }}
          onPermanentDelete={() => void deletePermanently(viewerNote)}
        />
      )}

      {editorNote && (
        <NoteEditor
          note={editorNote}
          labels={labels}
          view={view}
          saveStatus={saveStatus}
          onChange={changeEditor}
          onClose={closeEditor}
          onArchive={() => { const current = editorRef.current; if (current) commitEditorAction({ archived: !current.archived }); }}
          onTrash={() => commitEditorAction({ trashedAt: new Date().toISOString() })}
          onRestore={() => commitEditorAction({ trashedAt: null })}
          onPermanentDelete={() => { const current = editorRef.current; if (current) void deletePermanently(current); }}
          onUpload={(file) => void uploadImage(file)}
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
          onClose={() => setSettingsOpen(false)}
          onSettingsChange={persistSettings}
          onUserChange={setCurrentUser}
          onImportComplete={() => { void loadNotes(); void reloadLabels(); }}
          onEditLabels={() => setLabelManagerOpen(true)}
        />
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}

function CheckSquareIcon() {
  return <span className="check-square-icon" aria-hidden="true">✓</span>;
}
