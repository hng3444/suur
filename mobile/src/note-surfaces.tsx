import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Bell,
  Check,
  Code2,
  Copy,
  Eye,
  History,
  ImagePlus,
  ListTodo,
  LoaderCircle,
  Mic,
  MoreVertical,
  Palette,
  Paperclip,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Share2,
  Tag,
  Trash2,
  Type,
  UserRound,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { MarkdownView } from '../../components/markdown-view.tsx';
import { audioFilenameExtension, baseMimeType, preferredAudioRecordingMime } from '../../lib/media-utils.ts';
import { createMobileChecklistItem } from '../../lib/mobile-note-actions.ts';
import type { Attachment, Label, Locale, Note, NoteColor, UserSummary } from '../../lib/types.ts';
import type { IndexedDbMobileSyncStore } from '../../lib/mobile-offline-store.ts';
import { sharedText, mobileText } from './mobile-i18n.ts';
import { MobileAttachment } from './mobile-media.tsx';
import type { NoteHistoryEntry } from './mobile-api.ts';
import type { StoredMobileSession } from './secure-session.ts';
import { useBackLayer } from './use-back-layer.ts';

const noteColors: NoteColor[] = ['default', 'mint', 'sage', 'sand', 'rose', 'sky', 'lavender'];

function noteSummary(note: Note, locale: Locale) {
  if (note.type === 'checklist') return note.items.find((item) => item.text)?.text || sharedText(locale, 'blankItem');
  return note.content.trim();
}

function formatDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function KeepNoteCard({ note, locale, session, store, selected, selectionMode, onOpen, onSelect }: {
  note: Note;
  locale: Locale;
  session: StoredMobileSession;
  store: IndexedDbMobileSyncStore | null;
  selected: boolean;
  selectionMode: boolean;
  onOpen: () => void;
  onSelect: () => void;
}) {
  const timer = useRef<number | null>(null);
  const longPressed = useRef(false);
  const pointerStart = useRef<{ x: number; y: number; id: number } | null>(null);
  const image = note.attachments.find((attachment) => attachment.mimeType.startsWith('image/'));
  const visibleItems = note.items.slice(0, 6);
  const startLongPress = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse' || selectionMode) return;
    longPressed.current = false;
    pointerStart.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
    timer.current = window.setTimeout(() => {
      longPressed.current = true;
      pointerStart.current = null;
      navigator.vibrate?.(18);
      onSelect();
    }, 480);
  };
  const clearLongPress = () => { if (timer.current) window.clearTimeout(timer.current); timer.current = null; pointerStart.current = null; };
  const moveLongPress = (event: ReactPointerEvent<HTMLElement>) => {
    const start = pointerStart.current;
    if (!start || start.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) clearLongPress();
  };
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const open = () => {
    if (longPressed.current) { longPressed.current = false; return; }
    if (selectionMode) onSelect(); else onOpen();
  };
  return (
    <article
      className={`keep-card note-color-${note.color} ${image ? 'has-cover' : ''} ${selectionMode ? 'selection-active' : ''} ${selected ? 'is-selected' : ''}`}
      onPointerDown={startLongPress}
      onPointerUp={clearLongPress}
      onPointerCancel={clearLongPress}
      onPointerMove={moveLongPress}
      onContextMenu={(event) => {
        event.preventDefault();
        if (!longPressed.current && !selectionMode) {
          clearLongPress();
          longPressed.current = true;
          onSelect();
        }
      }}
      onClick={open}
      tabIndex={0}
      aria-pressed={selectionMode ? selected : undefined}
      role="button"
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } }}
    >
      <span className={`select-mark ${selectionMode ? 'visible' : ''}`}>{selected && <Check />}</span>
      {image && <MobileAttachment attachment={image} session={session} store={store} compact />}
      <div className="keep-card-body">
        {note.pinned && <Pin className="card-pin" fill="currentColor" />}
        {note.title && <h3>{note.title}</h3>}
        {note.type === 'checklist' ? (
          <div className="keep-check-preview">{visibleItems.map((item) => <span key={item.id} className={item.checked ? 'checked' : ''}><i>{item.checked && <Check />}</i><em>{item.text || sharedText(locale, 'blankItem')}</em></span>)}</div>
        ) : note.content ? <p>{note.content}</p> : null}
        <div className="keep-card-chips">
          {note.reminderAt && <span><Bell />{formatDate(note.reminderAt, locale)}</span>}
          {note.labels.slice(0, 3).map((label) => <span key={label.id}><i style={{ background: label.color }} />{label.name}</span>)}
          {note.attachments.length > (image ? 1 : 0) && <span><Paperclip />{note.attachments.length}</span>}
        </div>
      </div>
    </article>
  );
}

export function MobileNoteViewer({ note, locale, session, store, online, onClose, onEdit, onUpdate, onTrash, onDeleteForever, onDuplicate, onShare, onHistory, onRestoreHistory }: {
  note: Note;
  locale: Locale;
  session: StoredMobileSession;
  store: IndexedDbMobileSyncStore | null;
  view: string;
  online: boolean;
  onClose: () => void;
  onEdit: () => void;
  onUpdate: (note: Note) => Promise<void>;
  onTrash: () => Promise<void>;
  onDeleteForever: () => Promise<void>;
  onDuplicate: () => Promise<void>;
  onShare: () => Promise<void>;
  onHistory: () => Promise<NoteHistoryEntry[]>;
  onRestoreHistory: (historyId: string) => Promise<void>;
}) {
  const [menu, setMenu] = useState(false);
  const [history, setHistory] = useState<NoteHistoryEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useBackLayer(true, 20, onClose);
  useBackLayer(menu || history !== null, 25, () => { setMenu(false); setHistory(null); });
  const images = note.attachments.filter((item) => item.mimeType.startsWith('image/'));
  const files = note.attachments.filter((item) => !item.mimeType.startsWith('image/'));
  const trashed = Boolean(note.trashedAt);
  const owned = note.ownerId === session.user.id;
  const loadHistory = async () => {
    setBusy(true);
    try { setHistory(await onHistory()); setMenu(false); }
    catch (caught) { setError(caught instanceof Error ? caught.message : mobileText(locale, 'failed')); }
    finally { setBusy(false); }
  };
  const closeViewer = onClose;
  return (
    <section className={`note-detail note-color-${note.color}`} role="dialog" aria-modal="true">
      <header className="note-detail-bar">
        <button onClick={closeViewer} aria-label={sharedText(locale, 'close')}><ArrowLeft /></button>
        <span />
        {!trashed && <button className={note.pinned ? 'active' : ''} onClick={() => void onUpdate({ ...note, pinned: !note.pinned })} aria-label={sharedText(locale, note.pinned ? 'unpin' : 'pin')}>{note.pinned ? <PinOff /> : <Pin />}</button>}
        {!trashed && <button onClick={() => void onUpdate({ ...note, reminderAt: note.reminderAt || new Date(Date.now() + 3_600_000).toISOString() })} aria-label={mobileText(locale, 'reminder')}><Bell /></button>}
        {!trashed && <button onClick={() => void onUpdate({ ...note, archived: !note.archived })} aria-label={sharedText(locale, note.archived ? 'unarchive' : 'archive')}>{note.archived ? <ArchiveRestore /> : <Archive />}</button>}
        <button onClick={() => setMenu(!menu)} aria-label={sharedText(locale, 'editor.more')}><MoreVertical /></button>
      </header>
      <div className="detail-scroll">
        {error && <p className="form-error" role="alert">{error}</p>}
        {images.length > 0 && <div className="detail-gallery">{images.map((attachment) => <MobileAttachment key={attachment.id} attachment={attachment} session={session} store={store} />)}</div>}
        {note.title && <h1>{note.title}</h1>}
        {note.type === 'checklist' ? <div className="detail-checklist">{note.items.map((item) => <div key={item.id} className={item.checked ? 'checked' : ''}><i>{item.checked && <Check />}</i><span>{item.text || sharedText(locale, 'blankItem')}</span></div>)}</div> : note.contentFormat === 'markdown' ? <MarkdownView value={note.content} /> : <p className="detail-copy">{note.content || sharedText(locale, 'emptyText')}</p>}
        {files.length > 0 && <div className="detail-files">{files.map((attachment) => <MobileAttachment key={attachment.id} attachment={attachment} session={session} store={store} />)}</div>}
        {(note.reminderAt || note.labels.length > 0 || note.assignedUserId) && <div className="detail-chips">{note.reminderAt && <span><Bell />{formatDate(note.reminderAt, locale)}</span>}{note.labels.map((label) => <span key={label.id}><i style={{ background: label.color }} />{label.name}</span>)}{note.assignedUserId && <span><UserRound />{mobileText(locale, 'shared')}</span>}</div>}
        <small className="detail-updated">{mobileText(locale, 'edited')} {formatDate(note.updatedAt, locale)}</small>
      </div>
      <footer className={`note-detail-footer ${trashed ? '' : 'floating-edit-footer'}`}>
        {trashed ? <><button onClick={() => void onTrash()}><ArchiveRestore />{mobileText(locale, 'restore')}</button>{owned && <button className="danger" onClick={() => void onDeleteForever()}><Trash2 />{mobileText(locale, 'deleteForever')}</button>}</> : <button className="edit-note-button" onClick={onEdit} aria-label={sharedText(locale, 'edit')} title={sharedText(locale, 'edit')}><Pencil /></button>}
      </footer>
      {menu && <div className="floating-menu-layer" onClick={() => setMenu(false)}><div className="detail-menu" onClick={(event) => event.stopPropagation()}>
        {!trashed && <button disabled={!online || busy} onClick={() => { setMenu(false); void onDuplicate(); }}><Copy />{mobileText(locale, 'duplicate')}</button>}
        {!trashed && owned && <button disabled={!online || busy} onClick={() => { setMenu(false); void onShare(); }}><Share2 />{mobileText(locale, 'shareLink')}</button>}
        {!trashed && <button disabled={!online || busy} onClick={() => void loadHistory()}>{busy ? <LoaderCircle className="spin" /> : <History />}{mobileText(locale, 'history')}</button>}
        {!trashed && owned && <button className="danger" onClick={() => { setMenu(false); void onTrash(); }}><Trash2 />{sharedText(locale, 'moveTrash')}</button>}
      </div></div>}
      {history && <div className="subsheet-backdrop" onClick={() => setHistory(null)}><section className="history-sheet" onClick={(event) => event.stopPropagation()}><header><div><h2>{mobileText(locale, 'history')}</h2><span>{mobileText(locale, 'historyHelp')}</span></div><button onClick={() => setHistory(null)}><X /></button></header>{history.length ? history.map((item) => <button key={item.id} onClick={() => void onRestoreHistory(item.id)}><span><strong>{item.title || mobileText(locale, 'untitled')}</strong><small>{formatDate(item.createdAt, locale)}{item.changedBy ? ` · ${item.changedBy}` : ''}</small><em>{item.preview}</em></span><ArchiveRestore /></button>) : <p>{mobileText(locale, 'noHistory')}</p>}</section></div>}
    </section>
  );
}

type EditorPanel = 'add' | 'color' | 'labels' | 'assignee' | 'more' | null;

function localDateInput(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function MobileNoteEditor({ note, isNew, originalNote, locale, labels, users, session, store, online, completedItemsBottom, onClose, onSave, onDelete, onDeleteForever, onDuplicate, onShare, onHistory, onRestoreHistory, onUpload, onDeleteAttachment, onRequestNotifications }: {
  note: Note;
  isNew: boolean;
  originalNote?: Note;
  locale: Locale;
  labels: Label[];
  users: UserSummary[];
  session: StoredMobileSession;
  store: IndexedDbMobileSyncStore | null;
  online: boolean;
  completedItemsBottom: boolean;
  onClose: () => void;
  onSave: (note: Note, isNew: boolean, original?: Note) => Promise<void>;
  onDelete: (note: Note) => Promise<void>;
  onDeleteForever: (note: Note) => Promise<boolean>;
  onDuplicate: (note: Note) => Promise<void>;
  onShare: (note: Note) => Promise<void>;
  onHistory: (note: Note) => Promise<NoteHistoryEntry[]>;
  onRestoreHistory: (note: Note, historyId: string) => Promise<Note>;
  onUpload: (note: Note, file: File) => Promise<Attachment | null>;
  onDeleteAttachment: (note: Note, attachment: Attachment) => Promise<void>;
  onRequestNotifications: () => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(note);
  const persisted = useRef(!isNew);
  const original = useRef(originalNote || note);
  const draftRef = useRef(draft);
  useEffect(() => { draftRef.current = draft; }, [draft]);
  const [panel, setPanel] = useState<EditorPanel>(null);
  const [history, setHistory] = useState<NoteHistoryEntry[] | null>(null);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [message, setMessage] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [requestingAudio, setRequestingAudio] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const recordingStream = useRef<MediaStream | null>(null);
  const savingRef = useRef(false);
  const transferBusy = useRef(false);
  const audioBusy = useRef(false);
  const mounted = useRef(true);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftWork = useRef<Promise<unknown>>(Promise.resolve());
  const finished = useRef(false);
  const owned = draft.ownerId === session.user.id;
  const trashed = Boolean(draft.trashedAt);

  // Keep an unsent recovery draft locally; it never replaces the text being typed.
  useEffect(() => {
    if (!store || finished.current) return;
    const persistDraft = () => {
      if (finished.current) return;
      draftWork.current = draftWork.current.catch(() => undefined).then(() => store.writeEditorDraft({ note: draft, original: original.current, isNew: !persisted.current }));
      void draftWork.current.catch(() => setMessage(mobileText(locale, 'failed')));
    };
    draftTimer.current = setTimeout(persistDraft, 250);
    const hidden = () => { if (document.visibilityState === 'hidden') { if (draftTimer.current) clearTimeout(draftTimer.current); persistDraft(); } };
    document.addEventListener('visibilitychange', hidden);
    return () => { if (draftTimer.current) clearTimeout(draftTimer.current); document.removeEventListener('visibilitychange', hidden); };
  }, [draft, store, locale]);

  const clearRecoveryDraft = async () => {
    finished.current = true;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    try {
      await draftWork.current.catch(() => undefined);
      await store?.writeEditorDraft(null);
    } catch (error) { finished.current = false; throw error; }
  };

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1_000);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (recorder.current) recorder.current.onstop = null;
      recordingStream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const displayItems = useMemo(() => completedItemsBottom ? [...draft.items].sort((a, b) => Number(a.checked) - Number(b.checked)) : draft.items, [completedItemsBottom, draft.items]);
  const updateItem = (id: string, patch: Partial<Note['items'][number]>) => setDraft((current) => ({ ...current, items: current.items.map((item) => item.id === id ? { ...item, ...patch } : item) }));
  const addItem = (afterId?: string) => {
    const item = createMobileChecklistItem();
    setDraft((current) => {
      const items = [...current.items];
      const index = afterId ? items.findIndex((value) => value.id === afterId) : items.length - 1;
      items.splice(index + 1, 0, item);
      return { ...current, items };
    });
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[data-check-id="${item.id}"]`)?.focus());
  };
  const save = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      if (trashed) {
        await clearRecoveryDraft();
        onClose();
        return;
      }
      const current = draftRef.current;
      const empty = !current.title.trim() && !current.content.trim() && !current.items.some((item) => item.text.trim()) && !current.attachments.length;
      if (persisted.current || !empty) {
        await onSave(current, !persisted.current, original.current);
        persisted.current = true;
      }
      await clearRecoveryDraft();
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : mobileText(locale, 'failed'));
    } finally { savingRef.current = false; setSaving(false); }
  };
  const requestClose = () => {
    if (recorder.current?.state === 'recording') { audioBusy.current = true; recorder.current.stop(); return; }
    if (transferBusy.current || audioBusy.current || savingRef.current) return;
    void save();
  };
  useBackLayer(true, 30, requestClose);
  useBackLayer(panel !== null, 40, () => setPanel(null));
  useBackLayer(history !== null, 45, () => setHistory(null));
  const ensurePersisted = async () => {
    if (persisted.current) return true;
    if (!online) { setMessage(mobileText(locale, 'onlineRequired')); return false; }
    setSaving(true);
    try {
      const snapshot = draftRef.current;
      await onSave(snapshot, true);
      original.current = snapshot;
      persisted.current = true;
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : mobileText(locale, 'failed'));
      return false;
    } finally { setSaving(false); }
  };
  const runRemoteAction = async (action: (current: Note) => Promise<void>) => {
    if (!online) { setMessage(mobileText(locale, 'onlineRequired')); return; }
    if (!await ensurePersisted()) return;
    try {
      setSaving(true);
      await action(draftRef.current);
      setPanel(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : mobileText(locale, 'failed')); }
    finally { setSaving(false); }
  };
  const openHistory = async () => runRemoteAction(async (current) => setHistory(await onHistory(current)));
  const restoreHistory = async (historyId: string) => {
    try {
      setSaving(true);
      const restored = await onRestoreHistory(draftRef.current, historyId);
      original.current = restored;
      draftRef.current = restored;
      setDraft(restored);
      setHistory(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : mobileText(locale, 'failed')); }
    finally { setSaving(false); }
  };
  const uploadFiles = async (files: FileList | File[]) => {
    if (transferBusy.current) return;
    const selectedFiles = Array.from(files);
    if (!selectedFiles.length) return;
    if (!online) { setMessage(mobileText(locale, 'onlineRequired')); return; }
    transferBusy.current = true;
    setUploading(true);
    setMessage(mobileText(locale, 'uploading'));
    try {
      if (!await ensurePersisted()) return;
      for (const file of selectedFiles) {
        const attachment = await onUpload(draftRef.current, file);
        if (attachment) {
          setDraft((current) => ({ ...current, attachments: [...current.attachments.filter((item) => item.id !== attachment.id), attachment] }));
        }
      }
      setMessage(mobileText(locale, 'uploadComplete'));
    } catch (error) { setMessage(error instanceof Error ? error.message : mobileText(locale, 'failed')); }
    finally { transferBusy.current = false; setUploading(false); }
  };
  const toggleRecording = async () => {
    if (recorder.current?.state === 'recording') { audioBusy.current = true; recorder.current.stop(); return; }
    if (audioBusy.current || transferBusy.current) return;
    if (!online) { setMessage(mobileText(locale, 'onlineRequired')); return; }
    if (!navigator.mediaDevices?.getUserMedia || !('MediaRecorder' in window)) {
      setMessage(mobileText(locale, 'microphoneDenied'));
      return;
    }
    audioBusy.current = true;
    setRequestingAudio(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      recordingStream.current = stream;
      const chunks: Blob[] = [];
      const preferred = preferredAudioRecordingMime((type) => typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(type));
      const active = preferred ? new MediaRecorder(stream, { mimeType: preferred }) : new MediaRecorder(stream);
      recorder.current = active;
      active.onerror = () => {
        active.onstop = null;
        stream.getTracks().forEach((track) => track.stop());
        recordingStream.current = null;
        recorder.current = null;
        audioBusy.current = false;
        setRecording(false);
        setMessage(mobileText(locale, 'failed'));
      };
      active.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      active.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        recordingStream.current = null;
        recorder.current = null;
        audioBusy.current = false;
        setRecording(false);
        const mimeType = active.mimeType || chunks[0]?.type || 'audio/webm';
        const normalizedMime = baseMimeType(mimeType) || 'audio/webm';
        const file = new File(chunks, `voice-note-${Date.now()}.${audioFilenameExtension(normalizedMime)}`, { type: normalizedMime });
        if (!file.size) {
          setMessage(mobileText(locale, 'failed'));
          return;
        }
        await uploadFiles([file]);
      };
      active.start(1_000);
      setSeconds(0);
      setRecording(true);
      setMessage(mobileText(locale, 'recording'));
    } catch {
      recordingStream.current?.getTracks().forEach((track) => track.stop());
      recordingStream.current = null;
      recorder.current = null;
      setMessage(mobileText(locale, 'microphoneDenied'));
    } finally { audioBusy.current = false; setRequestingAudio(false); }
  };
  const removeAttachment = async (attachment: Attachment) => {
    if (transferBusy.current) return;
    transferBusy.current = true;
    setUploading(true);
    try {
      await onDeleteAttachment(draftRef.current, attachment);
      setDraft((current) => ({ ...current, attachments: current.attachments.filter((item) => item.id !== attachment.id) }));
    } catch (error) { setMessage(error instanceof Error ? error.message : mobileText(locale, 'failed')); }
    finally { transferBusy.current = false; setUploading(false); }
  };
  const deleteDraft = async () => {
    if (transferBusy.current || audioBusy.current || recording) return;
    try {
      if (persisted.current) await onDelete(draftRef.current);
      await clearRecoveryDraft();
      onClose();
    } catch (error) { setMessage(error instanceof Error ? error.message : mobileText(locale, 'failed')); }
  };
  const restoreDraft = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await clearRecoveryDraft();
      await onDelete(draftRef.current);
      onClose();
    } catch (error) { setMessage(error instanceof Error ? error.message : mobileText(locale, 'failed')); }
    finally { savingRef.current = false; setSaving(false); }
  };
  const deleteForever = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await clearRecoveryDraft();
      if (await onDeleteForever(draftRef.current)) onClose();
    } catch (error) { setMessage(error instanceof Error ? error.message : mobileText(locale, 'failed')); }
    finally { savingRef.current = false; setSaving(false); }
  };
  const toggleLabel = (label: Label) => setDraft((current) => ({ ...current, labels: current.labels.some((item) => item.id === label.id) ? current.labels.filter((item) => item.id !== label.id) : [...current.labels, label] }));
  return (
    <section className={`mobile-editor note-color-${draft.color}`} role="dialog" aria-modal="true">
      <header className="mobile-editor-bar">
        <button onClick={requestClose} aria-label={sharedText(locale, 'save')}><ArrowLeft /></button>
        <span />
        {!trashed && <button className={draft.pinned ? 'active' : ''} onClick={() => setDraft({ ...draft, pinned: !draft.pinned })}>{draft.pinned ? <PinOff /> : <Pin />}</button>}
        {!trashed && <label className={draft.reminderAt ? 'active date-action' : 'date-action'}><Bell /><input type="datetime-local" value={localDateInput(draft.reminderAt)} onChange={(event) => { const reminderAt = event.target.value ? new Date(event.target.value).toISOString() : null; setDraft({ ...draft, reminderAt }); if (reminderAt) void onRequestNotifications(); }} /></label>}
        {!trashed && <button onClick={() => setDraft({ ...draft, archived: !draft.archived })}>{draft.archived ? <ArchiveRestore /> : <Archive />}</button>}
      </header>
      <main className="mobile-editor-paper">
        {draft.attachments.filter((item) => item.mimeType.startsWith('image/')).length > 0 && <div className="editor-gallery">{draft.attachments.filter((item) => item.mimeType.startsWith('image/')).map((attachment) => <div key={attachment.id}><MobileAttachment attachment={attachment} session={session} store={store} /><button onClick={() => { void removeAttachment(attachment); }}><X /></button></div>)}</div>}
        <input className="mobile-editor-title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder={sharedText(locale, 'editor.title')} maxLength={500} disabled={trashed} />
        {draft.type === 'checklist' ? <div className="mobile-editor-checklist">{displayItems.map((item) => <div key={item.id} className={item.checked ? 'checked' : ''}><button onClick={() => updateItem(item.id, { checked: !item.checked })}>{item.checked && <Check />}</button><input data-check-id={item.id} value={item.text} onChange={(event) => updateItem(item.id, { text: event.target.value })} onKeyDown={(event) => { if (event.nativeEvent.isComposing) return; if (event.key === 'Enter') { event.preventDefault(); addItem(item.id); } else if (event.key === 'Backspace' && !item.text && draft.items.length > 1) { event.preventDefault(); setDraft((current) => ({ ...current, items: current.items.filter((value) => value.id !== item.id) })); } }} placeholder={sharedText(locale, 'editor.item')} disabled={trashed} /><button className="remove-row" onClick={() => setDraft((current) => ({ ...current, items: current.items.filter((value) => value.id !== item.id) }))}><X /></button></div>)}{!trashed && <button className="editor-add-row" onClick={() => addItem()}><Plus />{sharedText(locale, 'editor.addItem')}</button>}</div> : <>{draft.contentFormat === 'markdown' && <div className="markdown-mode-indicator"><span><Code2 />{mobileText(locale, 'markdownEnabled')}</span><button onClick={() => setPreview((value) => !value)}>{preview ? mobileText(locale, 'editText') : mobileText(locale, 'previewText')}</button></div>}{preview && draft.contentFormat === 'markdown' ? <div className="mobile-markdown-preview"><MarkdownView value={draft.content} /></div> : <textarea className="mobile-editor-content" value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} placeholder={sharedText(locale, 'newNote')} maxLength={100_000} disabled={trashed} autoFocus={isNew && !draft.title} />}</>}
        {draft.attachments.filter((item) => !item.mimeType.startsWith('image/')).length > 0 && <div className="editor-file-list">{draft.attachments.filter((item) => !item.mimeType.startsWith('image/')).map((attachment) => <div key={attachment.id}><MobileAttachment attachment={attachment} session={session} store={store} /><button onClick={() => { void removeAttachment(attachment); }}><X /></button></div>)}</div>}
        {message && <div className="editor-message" role="status">{uploading && <LoaderCircle className="spin" />}{recording && <Mic />}{message}{recording && ` · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}</div>}
      </main>
      {!trashed ? <footer className="mobile-editor-footer">
        <div className="editor-primary-tools"><button className={panel === 'add' ? 'active' : ''} aria-label={sharedText(locale, 'editor.attachment')} onClick={() => setPanel(panel === 'add' ? null : 'add')}><Plus /></button><button className={panel === 'color' ? 'active' : ''} aria-label={sharedText(locale, 'editor.color')} onClick={() => setPanel(panel === 'color' ? null : 'color')}><Palette /></button><button className={panel === 'labels' ? 'active' : ''} aria-label={sharedText(locale, 'editor.labels')} onClick={() => setPanel(panel === 'labels' ? null : 'labels')}><Tag /></button><button className={panel === 'more' ? 'active' : ''} aria-label={sharedText(locale, 'editor.more')} onClick={() => setPanel(panel === 'more' ? null : 'more')}><MoreVertical /></button></div>
        <button className="editor-save" onClick={requestClose} disabled={saving || uploading || requestingAudio}>{saving || uploading ? <LoaderCircle className="spin" /> : mobileText(locale, 'save')}</button>
      </footer> : <footer className="mobile-editor-footer trashed-editor-actions"><button onClick={() => void restoreDraft()} disabled={saving}><ArchiveRestore />{mobileText(locale, 'restore')}</button>{owned && <button className="danger" onClick={() => void deleteForever()} disabled={saving}><Trash2 />{mobileText(locale, 'deleteForever')}</button>}</footer>}
      {panel && <div className="editor-panel-layer" onClick={() => setPanel(null)}><section className="editor-bottom-sheet" onClick={(event) => event.stopPropagation()}>
        {panel === 'add' && <><div className="editor-action-grid"><button onClick={() => imageInput.current?.click()}><ImagePlus /><span>{mobileText(locale, 'image')}</span></button><button onClick={() => fileInput.current?.click()}><Paperclip /><span>{mobileText(locale, 'file')}</span></button><button className={recording ? 'recording' : ''} disabled={requestingAudio || uploading} onClick={() => void toggleRecording()}>{requestingAudio ? <LoaderCircle className="spin" /> : <Mic />}<span>{recording ? mobileText(locale, 'stop') : mobileText(locale, 'voice')}</span></button><button onClick={() => setDraft({ ...draft, type: draft.type === 'text' ? 'checklist' : 'text', items: draft.items.length ? draft.items : [createMobileChecklistItem()] })}>{draft.type === 'text' ? <ListTodo /> : <Type />}<span>{draft.type === 'text' ? mobileText(locale, 'checklist') : mobileText(locale, 'textNote')}</span></button></div>{recording && <div className="voice-recorder-card" role="status"><span className="recording-dot" /><div><strong>{mobileText(locale, 'recording')} · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</strong><small>{mobileText(locale, 'voiceHelp')}</small></div><button onClick={() => void toggleRecording()}><span />{mobileText(locale, 'stop')}</button></div>}</>}
        {panel === 'color' && <div className="editor-color-grid" role="radiogroup" aria-label={sharedText(locale, 'editor.color')}>{noteColors.map((color) => <button key={color} role="radio" aria-checked={draft.color === color} className={`color-choice note-color-${color} ${draft.color === color ? 'selected' : ''}`} onClick={() => setDraft({ ...draft, color })} aria-label={sharedText(locale, `color.${color}`)} title={sharedText(locale, `color.${color}`)}>{draft.color === color && <Check />}</button>)}</div>}
        {panel === 'labels' && <div className="editor-label-list">{labels.length ? labels.map((label) => <button key={label.id} className={draft.labels.some((item) => item.id === label.id) ? 'selected' : ''} onClick={() => toggleLabel(label)}><i style={{ background: label.color }} />{label.name}{draft.labels.some((item) => item.id === label.id) && <Check />}</button>) : <p>{sharedText(locale, 'editor.noLabels')}</p>}</div>}
        {panel === 'assignee' && <div className="assignee-list"><button className={!draft.assignedUserId ? 'selected' : ''} onClick={() => setDraft({ ...draft, assignedUserId: null })}><UserRound />{mobileText(locale, 'onlyMe')}{!draft.assignedUserId && <Check />}</button>{users.filter((user) => user.id !== draft.ownerId).map((user) => <button key={user.id} className={draft.assignedUserId === user.id ? 'selected' : ''} disabled={!owned} onClick={() => setDraft({ ...draft, assignedUserId: user.id })}><UserRound />{user.displayName}<small>@{user.username}</small>{draft.assignedUserId === user.id && <Check />}</button>)}</div>}
        {panel === 'more' && <div className="editor-menu-list"><button onClick={() => setPanel('assignee')}><UserRound />{sharedText(locale, 'editor.assignee')}</button>{draft.type === 'text' && <button className={draft.contentFormat === 'markdown' ? 'active' : ''} onClick={() => { setDraft({ ...draft, contentFormat: draft.contentFormat === 'markdown' ? 'plain' : 'markdown' }); setPreview(false); }}><Code2 />Markdown</button>}{draft.type === 'text' && draft.contentFormat === 'markdown' && <button onClick={() => setPreview(!preview)}><Eye />{sharedText(locale, 'editor.preview')}</button>}<button disabled={!online || saving} onClick={() => void openHistory()}><History />{mobileText(locale, 'history')}</button><button disabled={!online || saving} onClick={() => void runRemoteAction(onDuplicate)}><Copy />{mobileText(locale, 'duplicate')}</button>{owned && <button disabled={!online || saving} onClick={() => void runRemoteAction(onShare)}><Share2 />{mobileText(locale, 'shareLink')}</button>}<button onClick={() => setDraft({ ...draft, archived: !draft.archived })}><Archive />{draft.archived ? sharedText(locale, 'unarchive') : sharedText(locale, 'archive')}</button>{owned && <button className="danger" disabled={uploading || recording || requestingAudio || saving} onClick={() => void deleteDraft()}><Trash2 />{sharedText(locale, 'moveTrash')}</button>}</div>}
      </section></div>}
      {history && <div className="subsheet-backdrop" onClick={() => setHistory(null)}><section className="history-sheet" onClick={(event) => event.stopPropagation()}><header><div><h2>{mobileText(locale, 'history')}</h2><span>{mobileText(locale, 'historyHelp')}</span></div><button onClick={() => setHistory(null)}><X /></button></header>{history.length ? history.map((item) => <button key={item.id} onClick={() => void restoreHistory(item.id)}><span><strong>{item.title || mobileText(locale, 'untitled')}</strong><small>{formatDate(item.createdAt, locale)}{item.changedBy ? ` · ${item.changedBy}` : ''}</small><em>{item.preview}</em></span><ArchiveRestore /></button>) : <p>{mobileText(locale, 'noHistory')}</p>}</section></div>}
      <input ref={imageInput} hidden type="file" accept="image/*" multiple onChange={(event) => { if (event.target.files) void uploadFiles(event.target.files); event.target.value = ''; }} />
      <input ref={fileInput} hidden type="file" accept="image/*,audio/*,application/pdf,text/plain,text/markdown,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods" multiple onChange={(event) => { if (event.target.files) void uploadFiles(event.target.files); event.target.value = ''; }} />
    </section>
  );
}

export function noteMatchesQuery(note: Note, query: string) {
  const haystack = [note.title, note.content, ...note.items.map((item) => item.text), ...note.labels.map((label) => label.name)].join(' ').toLocaleLowerCase();
  return haystack.includes(query.trim().toLocaleLowerCase());
}

export function noteSummaryText(note: Note, locale: Locale) {
  return note.title || noteSummary(note, locale) || mobileText(locale, 'untitled');
}
