'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  Bell,
  CheckCircle2,
  CheckSquare,
  Code2,
  Download,
  Eye,
  FileText,
  ListTodo,
  LoaderCircle,
  Mic,
  MoreVertical,
  Paperclip,
  Palette,
  Pin,
  PinOff,
  Plus,
  Tag,
  Trash2,
  Type,
  Undo2,
  UserRound,
  X,
} from 'lucide-react';
import { translate } from '@/lib/i18n';
import { MarkdownView } from '@/components/markdown-view';
import { audioFilenameExtension, baseMimeType, preferredAudioRecordingMime } from '@/lib/media-utils';
import type { ChecklistItem, Label, Locale, Note, NoteColor, NoteView, UserSummary } from '@/lib/types';

export interface UploadFeedback {
  state: 'uploading' | 'success' | 'error';
  message: string;
}

interface NoteEditorProps {
  note: Note;
  locale: Locale;
  currentUserId: string;
  offline: boolean;
  users: UserSummary[];
  completedItemsBottom: boolean;
  notificationsEnabled: boolean;
  labels: Label[];
  view: NoteView;
  saveStatus: string;
  onChange: (note: Note) => void;
  onClose: () => void;
  onArchive: () => void;
  onTrash: () => void;
  onRestore: () => void;
  onPermanentDelete: () => void;
  uploadFeedback: UploadFeedback | null;
  onUpload: (file: File) => Promise<boolean>;
  onEnableNotifications: () => Promise<void>;
  onDeleteAttachment: (id: string) => void;
}

const colors: NoteColor[] = ['default', 'mint', 'sage', 'sand', 'rose', 'sky', 'lavender'];

function localDateTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function NoteEditor({
  note,
  locale,
  currentUserId,
  offline,
  users,
  completedItemsBottom,
  notificationsEnabled,
  labels,
  view,
  saveStatus,
  onChange,
  onClose,
  onArchive,
  onTrash,
  onRestore,
  onPermanentDelete,
  uploadFeedback,
  onUpload,
  onEnableNotifications,
  onDeleteAttachment,
}: NoteEditorProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const moreToolsRef = useRef<HTMLDivElement>(null);
  const itemInputs = useRef(new Map<string, HTMLInputElement>());
  const pendingItemFocus = useRef<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const voiceStream = useRef<MediaStream | null>(null);
  const [recording, setRecording] = useState(false);
  const [preview, setPreview] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [voiceState, setVoiceState] = useState<'idle' | 'requesting' | 'recording' | 'processing' | 'success' | 'error'>('idle');
  const [voiceMessage, setVoiceMessage] = useState('');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [reminderNotice, setReminderNotice] = useState('');
  const [activePanel, setActivePanel] = useState<'reminder' | 'assignee' | 'labels' | 'color' | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const readOnly = view === 'trash';
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const ui = (turkish: string, english: string) => locale === 'tr' ? turkish : english;
  const imageAttachments = note.attachments.filter((attachment) => attachment.mimeType.startsWith('image/'));
  const otherAttachments = note.attachments.filter((attachment) => !attachment.mimeType.startsWith('image/'));

  useEffect(() => () => voiceStream.current?.getTracks().forEach((track) => track.stop()), []);

  useEffect(() => {
    const id = pendingItemFocus.current;
    if (!id) return;
    const input = itemInputs.current.get(id);
    if (input) {
      input.focus();
      pendingItemFocus.current = null;
    }
  }, [note.items]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setRecordingSeconds((seconds) => seconds + 1), 1_000);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    if (!moreOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (moreToolsRef.current?.contains(target) || target.closest('.editor-more-toggle')) return;
      // Consume the same click before it reaches the underlying control.
      event.preventDefault();
      event.stopPropagation();
      setMoreOpen(false);
    };
    document.addEventListener('click', closeOnOutsideClick, true);
    return () => document.removeEventListener('click', closeOnOutsideClick, true);
  }, [moreOpen]);

  const updateItem = (id: string, patch: Partial<ChecklistItem>) => {
    const items = note.items.map((item) => item.id === id ? { ...item, ...patch } : item);
    if (completedItemsBottom && patch.checked !== undefined) items.sort((a, b) => Number(a.checked) - Number(b.checked));
    onChange({ ...note, items });
  };

  const addItem = (afterId?: string) => {
    const item = { id: crypto.randomUUID(), text: '', checked: false };
    const items = [...note.items];
    const index = afterId ? items.findIndex((entry) => entry.id === afterId) + 1 : items.length;
    items.splice(index < 0 ? items.length : index, 0, item);
    pendingItemFocus.current = item.id;
    onChange({ ...note, items });
  };

  const removeItem = (id: string, focusPrevious = false) => {
    const index = note.items.findIndex((item) => item.id === id);
    const previous = index > 0 ? note.items[index - 1] : note.items[index + 1];
    const items = note.items.filter((item) => item.id !== id);
    if (focusPrevious && previous) pendingItemFocus.current = previous.id;
    if (items.length) {
      onChange({ ...note, items });
      return;
    }
    const emptyItem = { id: crypto.randomUUID(), text: '', checked: false };
    pendingItemFocus.current = emptyItem.id;
    onChange({ ...note, items: [emptyItem] });
  };

  const toggleLabel = (label: Label) => {
    const selected = note.labels.some((item) => item.id === label.id);
    onChange({ ...note, labels: selected ? note.labels.filter((item) => item.id !== label.id) : [...note.labels, label] });
  };

  const uploadFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) await onUpload(file);
  };

  const microphoneError = (error: unknown) => {
    const name = error instanceof DOMException ? error.name : '';
    if (name === 'NotFoundError') return ui('Bu cihazda kullanılabilir mikrofon bulunamadı.', 'No available microphone was found on this device.');
    if (name === 'NotReadableError') return ui('Mikrofon başka bir uygulama tarafından kullanılıyor.', 'The microphone is being used by another app.');
    if (name === 'SecurityError') return ui('Mikrofon için HTTPS bağlantısı gerekiyor.', 'A secure HTTPS connection is required for microphone access.');
    return ui('Mikrofon izni verilmedi. Tarayıcı site ayarlarından mikrofonu açabilirsiniz.', 'Microphone permission was not granted. You can enable it in the browser site settings.');
  };

  const toggleVoice = async () => {
    if (recording) { recorder.current?.stop(); return; }
    if (voiceState === 'requesting' || voiceState === 'processing') return;
    if (offline) { setVoiceState('error'); setVoiceMessage(ui('Sesli not eklemek için sunucu bağlantısı gerekiyor.', 'A server connection is required to attach a voice note.')); return; }
    if (!window.isSecureContext) { setVoiceState('error'); setVoiceMessage(ui('Mikrofon için HTTPS bağlantısı gerekiyor.', 'A secure HTTPS connection is required for microphone access.')); return; }
    if (!navigator.mediaDevices?.getUserMedia || !('MediaRecorder' in window)) { setVoiceState('error'); setVoiceMessage(ui('Bu tarayıcı ses kaydını desteklemiyor.', 'This browser does not support audio recording.')); return; }
    setVoiceState('requesting');
    setVoiceMessage(ui('Mikrofon izni bekleniyor…', 'Waiting for microphone permission…'));
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (error) { setVoiceState('error'); setVoiceMessage(microphoneError(error)); return; }
    voiceStream.current = stream;
    const chunks: Blob[] = [];
    const selectedMime = preferredAudioRecordingMime((type) => typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(type));
    let mediaRecorder: MediaRecorder;
    try { mediaRecorder = selectedMime ? new MediaRecorder(stream, { mimeType: selectedMime }) : new MediaRecorder(stream); }
    catch {
      try { mediaRecorder = new MediaRecorder(stream); }
      catch (error) {
        stream.getTracks().forEach((track) => track.stop());
        voiceStream.current = null;
        setVoiceState('error');
        setVoiceMessage(microphoneError(error));
        return;
      }
    }
    recorder.current = mediaRecorder;
    mediaRecorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    mediaRecorder.onerror = () => {
      mediaRecorder.onstop = null;
      stream.getTracks().forEach((track) => track.stop());
      voiceStream.current = null;
      recorder.current = null;
      setRecording(false);
      setVoiceState('error');
      setVoiceMessage(ui('Ses kaydı tamamlanamadı.', 'The audio recording could not be completed.'));
    };
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      voiceStream.current = null;
      recorder.current = null;
      setRecording(false);
      setVoiceState('processing');
      setVoiceMessage(ui('Ses kaydı hazırlanıyor…', 'Preparing the audio recording…'));
      const mimeType = baseMimeType(mediaRecorder.mimeType || selectedMime || chunks[0]?.type) || 'audio/webm';
      const extension = audioFilenameExtension(mimeType);
      const file = new File(chunks, `voice-note-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`, { type: mimeType });
      if (!file.size) {
        setVoiceState('error');
        setVoiceMessage(ui('Ses kaydı boş kaldı. Yeniden deneyin.', 'The audio recording was empty. Please try again.'));
        return;
      }
      try {
        const uploaded = await onUpload(file);
        setVoiceState(uploaded ? 'success' : 'error');
        setVoiceMessage(uploaded ? ui('Sesli not eklendi.', 'Voice note added.') : ui('Sesli not yüklenemedi.', 'The voice note could not be uploaded.'));
      } catch {
        setVoiceState('error');
        setVoiceMessage(ui('Sesli not yüklenemedi. Bağlantıyı kontrol edip yeniden deneyin.', 'The voice note could not be uploaded. Check the connection and try again.'));
      }
    };
    try { mediaRecorder.start(1_000); }
    catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      voiceStream.current = null;
      recorder.current = null;
      setVoiceState('error');
      setVoiceMessage(microphoneError(error));
      return;
    }
    setRecordingSeconds(0);
    setRecording(true);
    setVoiceState('recording');
    setVoiceMessage(ui('Kayıt sürüyor', 'Recording'));
  };

  const requestReminderPermission = async () => {
    if (!('Notification' in window)) {
      setReminderNotice(ui('Bu tarayıcı bildirimleri desteklemiyor; hatırlatıcı yine kaydedildi.', 'This browser does not support notifications; the reminder was still saved.'));
      return;
    }
    let permission = Notification.permission;
    if (permission === 'default') {
      setReminderNotice(ui('Bildirim izni bekleniyor…', 'Waiting for notification permission…'));
      try { permission = await Notification.requestPermission(); }
      catch { permission = 'denied'; }
    }
    if (permission === 'granted') {
      if (!notificationsEnabled) await onEnableNotifications();
      setReminderNotice(ui('Bildirimler açık. Hatırlatıcı zamanı gelince haber verilecek.', 'Notifications are on. You will be notified when the reminder is due.'));
      if ('serviceWorker' in navigator) void navigator.serviceWorker.ready.then((registration) => registration.active?.postMessage({ type: 'CHECK_REMINDERS' }));
      return;
    }
    setReminderNotice(ui('Hatırlatıcı kaydedildi; bildirim için tarayıcı site ayarlarından izni açın.', 'The reminder was saved; enable notifications in the browser site settings to receive an alert.'));
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`note-editor note-${note.color} ${dragging ? 'dragging-files' : ''}`} role="dialog" aria-modal="true" aria-labelledby="note-editor-title" onDragOver={(event) => { if (readOnly) return; event.preventDefault(); setDragging(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={(event) => { if (readOnly) return; event.preventDefault(); setDragging(false); uploadFiles(event.dataTransfer.files); }}>
        <header className="editor-header">
          <span className="editor-kicker">{readOnly ? t('trashMode') : note.version === 0 ? t('editor.new') : t('editor.edit')}</span>
          <div className="editor-header-actions">
            {!readOnly && (
              <button className="toolbar-button" onClick={() => onChange({ ...note, pinned: !note.pinned })} aria-label={note.pinned ? t('unpin') : t('pin')} title={note.pinned ? t('unpin') : t('pin')}>
                {note.pinned ? <PinOff size={18} /> : <Pin size={18} />}
              </button>
            )}
            <button className="toolbar-button" onClick={onClose} aria-label={t('close')} title={t('close')}><X size={20} /></button>
          </div>
        </header>

        {imageAttachments.length > 0 && (
          <div className="editor-images">
            {imageAttachments.map((attachment) => (
              <figure key={attachment.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={attachment.url} alt={attachment.filename} />
                {!readOnly && <button onClick={() => onDeleteAttachment(attachment.id)} aria-label={`${ui('Görseli kaldır', 'Remove image')}: ${attachment.filename}`}><X size={15} /></button>}
              </figure>
            ))}
          </div>
        )}

        {otherAttachments.length > 0 && <div className="editor-files">{otherAttachments.map((attachment) => attachment.mimeType.startsWith('audio/') ? <div className="editor-audio" key={attachment.id}><audio controls preload="metadata" src={attachment.url} /><span>{attachment.filename}</span>{!readOnly && <button onClick={() => onDeleteAttachment(attachment.id)} aria-label={attachment.filename}><X size={15} /></button>}</div> : <div key={attachment.id}><FileText size={18} /><span>{attachment.filename}<small>{(attachment.size / 1024).toFixed(0)} KB</small></span><a href={attachment.url} download={attachment.filename} aria-label={attachment.filename}><Download size={16} /></a>{!readOnly && <button onClick={() => onDeleteAttachment(attachment.id)} aria-label={attachment.filename}><X size={15} /></button>}</div>)}</div>}

        {uploadFeedback && <div className={`editor-upload-feedback ${uploadFeedback.state}`} role="status">{uploadFeedback.state === 'uploading' ? <LoaderCircle className="spin" size={17} /> : uploadFeedback.state === 'success' ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}<span>{uploadFeedback.message}</span></div>}

        <input
          id="note-editor-title"
          className="editor-title"
          value={note.title}
          onChange={(event) => onChange({ ...note, title: event.target.value })}
          placeholder={t('editor.title')}
          maxLength={500}
          readOnly={readOnly}
          autoFocus={!readOnly}
        />

        {note.type === 'checklist' ? (
          <div className="checklist-editor">
            {note.items.map((item) => (
              <div className="checklist-row" key={item.id}>
                <button
                  className={`check-toggle ${item.checked ? 'selected' : ''}`}
                  onClick={() => updateItem(item.id, { checked: !item.checked })}
                  aria-label={item.checked ? ui('Tamamlanmadı olarak işaretle', 'Mark as incomplete') : ui('Tamamlandı olarak işaretle', 'Mark as complete')}
                  disabled={readOnly}
                >
                  {item.checked && <CheckSquare size={16} />}
                </button>
                <input
                  ref={(element) => {
                    if (element) itemInputs.current.set(item.id, element);
                    else itemInputs.current.delete(item.id);
                  }}
                  value={item.text}
                  onChange={(event) => updateItem(item.id, { text: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.nativeEvent.isComposing) return;
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addItem(item.id);
                    } else if (event.key === 'Backspace' && !item.text && note.items.length > 1) {
                      event.preventDefault();
                      removeItem(item.id, true);
                    }
                  }}
                  placeholder={t('editor.item')}
                  className={item.checked ? 'completed' : ''}
                  readOnly={readOnly}
                />
                {!readOnly && <button className="row-remove" onClick={() => removeItem(item.id)} aria-label={ui('Öğeyi sil', 'Delete item')}><X size={15} /></button>}
              </div>
            ))}
            {!readOnly && <button className="add-list-item" onClick={() => addItem()}><Plus size={16} /> {t('editor.addItem')}</button>}
          </div>
        ) : preview && note.contentFormat === 'markdown' ? (
          <div className="editor-markdown-preview"><MarkdownView value={note.content} /></div>
        ) : (
          <textarea
            className="editor-content"
            value={note.content}
            onChange={(event) => onChange({ ...note, content: event.target.value })}
            placeholder={t('newNote')}
            maxLength={100_000}
            readOnly={readOnly}
          />
        )}

        {!readOnly && (
          <div className="editor-options">
            {offline && <p className="editor-inline-warning">{ui('Metin değişiklikleri çevrimdışı kaydedilir. Dosya ve ses eklemek için bağlantı gerekir.', 'Text changes are saved offline. Attachments and voice notes require a connection.')}</p>}
            {voiceState !== 'idle' && <p className={`editor-inline-status ${voiceState}`} role="status">{voiceState === 'requesting' || voiceState === 'processing' ? <LoaderCircle className="spin" size={16} /> : voiceState === 'success' ? <CheckCircle2 size={16} /> : voiceState === 'error' ? <AlertCircle size={16} /> : <Mic size={16} />}<span>{voiceMessage}{voiceState === 'recording' ? ` · ${String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:${String(recordingSeconds % 60).padStart(2, '0')} · ${ui('Bitirmek için mikrofona yeniden dokunun', 'Tap the microphone again to stop')}` : ''}</span></p>}
            {activePanel === 'reminder' && <div className="editor-tool-panel"><div className="option-row">
              <Bell size={17} /><label htmlFor="reminder">{t('editor.reminder')}</label><input id="reminder" type="datetime-local" value={localDateTime(note.reminderAt)} onChange={(event) => { const reminderAt = event.target.value ? new Date(event.target.value).toISOString() : null; onChange({ ...note, reminderAt }); if (reminderAt) void requestReminderPermission(); else setReminderNotice(''); }} />
            </div>{reminderNotice && <p className="reminder-permission-status" role="status"><Bell size={14} /><span>{reminderNotice}</span></p>}</div>}

            {activePanel === 'assignee' && <div className="editor-tool-panel"><div className="option-row">
              <UserRound size={17} /><label htmlFor="assignee">{ui('Atanan kullanıcı', 'Assigned user')}</label><select id="assignee" disabled={note.ownerId !== currentUserId} value={note.assignedUserId || ''} onChange={(event) => onChange({ ...note, assignedUserId: event.target.value || null })}><option value="">{ui('Yalnızca ben', 'Only me')}</option>{users.filter((user) => user.id !== note.ownerId).map((user) => <option key={user.id} value={user.id}>{user.displayName} (@{user.username})</option>)}</select>
            </div></div>}

            {activePanel === 'labels' && <div className="editor-tool-panel"><div className="label-picker"><div className="editor-panel-title"><Tag size={17} /> {t('editor.labels')} {note.labels.length > 0 && <span>{note.labels.length}</span>}</div>
              <div className="label-picker-list">
                {labels.length === 0 ? <p>{t('editor.noLabels')}</p> : labels.map((label) => (
                  <label key={label.id}>
                    <input type="checkbox" checked={note.labels.some((item) => item.id === label.id)} onChange={() => toggleLabel(label)} />
                    <span className="label-dot" style={{ background: label.color }} />{label.name}
                  </label>
                ))}
              </div>
            </div></div>}

            {activePanel === 'color' && <div className="editor-tool-panel"><div className="color-picker" role="radiogroup" aria-label={ui('Not rengi', 'Note color')}>
              {colors.map((color) => (
                <button
                  key={color}
                  className={`color-dot note-${color} ${note.color === color ? 'selected' : ''}`}
                  onClick={() => onChange({ ...note, color })}
                  role="radio"
                  aria-checked={note.color === color}
                  title={t(`color.${color}` as Parameters<typeof translate>[1])}
                  aria-label={t(`color.${color}` as Parameters<typeof translate>[1])}
                />
              ))}
            </div></div>}
          </div>
        )}

        <footer className="editor-footer">
          <div className="editor-tools">
            {!readOnly ? (
              <>
                <button className="toolbar-button" onClick={() => onChange({ ...note, type: 'text' })} aria-label={t('editor.text')} title={t('editor.text')}><Type size={18} /></button>
                <button className="toolbar-button" onClick={() => onChange({ ...note, type: 'checklist', items: note.items.length ? note.items : [{ id: crypto.randomUUID(), text: '', checked: false }] })} aria-label={t('editor.checklist')} title={t('editor.checklist')}><ListTodo size={18} /></button>
                <button className={`toolbar-button ${activePanel === 'reminder' ? 'active' : ''}`} onClick={() => setActivePanel((panel) => panel === 'reminder' ? null : 'reminder')} aria-label={t('editor.reminder')} title={t('editor.reminder')}><Bell size={18} /></button>
                <button className="toolbar-button" disabled={offline} onClick={() => fileInput.current?.click()} aria-label={t('editor.attachment')} title={offline ? ui('Çevrimdışıyken dosya eklenemez', 'Attachments are unavailable offline') : t('editor.attachment')}><Paperclip size={18} /><span className="tool-label">{ui('Dosya', 'File')}</span></button>
                <input ref={fileInput} hidden multiple type="file" accept="image/*,audio/*,application/pdf,text/plain,text/markdown,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods" onChange={(event) => { if (event.target.files) void uploadFiles(event.target.files); event.target.value = ''; }} />
                <div ref={moreToolsRef} className={`editor-more-tools ${moreOpen ? 'open' : ''}`}>
                  <button className={`toolbar-button ${activePanel === 'assignee' ? 'active' : ''}`} onClick={() => setActivePanel((panel) => panel === 'assignee' ? null : 'assignee')} aria-label={t('editor.assignee')} title={t('editor.assignee')}><UserRound size={18} /><span className="more-tool-label">{t('editor.assignee')}</span></button>
                  <button className={`toolbar-button ${activePanel === 'labels' ? 'active' : ''}`} onClick={() => setActivePanel((panel) => panel === 'labels' ? null : 'labels')} aria-label={t('editor.labels')} title={t('editor.labels')}><Tag size={18} /><span className="more-tool-label">{t('editor.labels')}</span></button>
                  <button className={`toolbar-button ${activePanel === 'color' ? 'active' : ''}`} onClick={() => setActivePanel((panel) => panel === 'color' ? null : 'color')} aria-label={t('editor.color')} title={t('editor.color')}><Palette size={18} /><span className="more-tool-label">{t('editor.color')}</span></button>
                  <button className={`toolbar-button ${recording ? 'recording' : ''}`} disabled={offline} onClick={() => void toggleVoice()} aria-label={t('editor.voice')} title={recording ? ui('Kaydı bitir', 'Stop recording') : t('editor.voice')}><Mic size={18} /><span className="more-tool-label">{t('editor.voice')}</span></button>
                  {note.type === 'text' && <button className={`toolbar-button ${note.contentFormat === 'markdown' ? 'active' : ''}`} onClick={() => { onChange({ ...note, contentFormat: note.contentFormat === 'markdown' ? 'plain' : 'markdown' }); setPreview(false); }} aria-label="Markdown" title="Markdown"><Code2 size={18} /><span className="more-tool-label">Markdown</span></button>}
                  {note.type === 'text' && note.contentFormat === 'markdown' && <button className={`toolbar-button ${preview ? 'active' : ''}`} onClick={() => setPreview((value) => !value)} aria-label={t('editor.preview')} title={t('editor.preview')}><Eye size={18} /><span className="more-tool-label">{t('editor.preview')}</span></button>}
                  <button className="toolbar-button" onClick={onArchive} aria-label={note.archived ? t('unarchive') : t('archive')} title={note.archived ? t('unarchive') : t('archive')}>{note.archived ? <ArchiveRestore size={18} /> : <Archive size={18} />}<span className="more-tool-label">{note.archived ? t('unarchive') : t('archive')}</span></button>
                  <button className="toolbar-button danger" onClick={onTrash} aria-label={t('moveTrash')} title={t('moveTrash')}><Trash2 size={18} /><span className="more-tool-label">{t('moveTrash')}</span></button>
                </div>
                <button className={`toolbar-button editor-more-toggle ${moreOpen ? 'active' : ''}`} onClick={() => setMoreOpen((value) => !value)} aria-label={t('editor.more')} title={t('editor.more')} aria-expanded={moreOpen}><MoreVertical size={19} /></button>
              </>
            ) : (
              <>
                <button className="text-button" onClick={onRestore}><Undo2 size={17} /> {t('restore')}</button>
                {note.ownerId === currentUserId && <button className="text-button danger" onClick={onPermanentDelete}><Trash2 size={17} /> {t('deleteForever')}</button>}
              </>
            )}
          </div>
          <span className="save-status">{readOnly ? '' : saveStatus}</span>
          <button className="save-button" onClick={onClose}>{readOnly ? t('close') : t('save')}</button>
        </footer>
      </section>
    </div>
  );
}
