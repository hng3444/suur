'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  Bell,
  CheckSquare,
  Code2,
  Download,
  Eye,
  FileText,
  ListTodo,
  Mic,
  Paperclip,
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
import type { ChecklistItem, Label, Locale, Note, NoteColor, NoteView, UserSummary } from '@/lib/types';

interface NoteEditorProps {
  note: Note;
  locale: Locale;
  currentUserId: string;
  offline: boolean;
  users: UserSummary[];
  completedItemsBottom: boolean;
  labels: Label[];
  view: NoteView;
  saveStatus: string;
  onChange: (note: Note) => void;
  onClose: () => void;
  onArchive: () => void;
  onTrash: () => void;
  onRestore: () => void;
  onPermanentDelete: () => void;
  onUpload: (file: File) => void;
  onDeleteAttachment: (id: string) => void;
}

const colors: Array<{ value: NoteColor; label: string }> = [
  { value: 'default', label: 'Varsayılan' },
  { value: 'mint', label: 'Nane' },
  { value: 'sage', label: 'Adaçayı' },
  { value: 'sand', label: 'Kum' },
  { value: 'rose', label: 'Gül' },
  { value: 'sky', label: 'Gökyüzü' },
  { value: 'lavender', label: 'Lavanta' },
];

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
  labels,
  view,
  saveStatus,
  onChange,
  onClose,
  onArchive,
  onTrash,
  onRestore,
  onPermanentDelete,
  onUpload,
  onDeleteAttachment,
}: NoteEditorProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const voiceStream = useRef<MediaStream | null>(null);
  const [recording, setRecording] = useState(false);
  const [preview, setPreview] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [mediaError, setMediaError] = useState('');
  const readOnly = view === 'trash';
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const ui = (turkish: string, english: string) => locale === 'tr' ? turkish : english;
  const imageAttachments = note.attachments.filter((attachment) => attachment.mimeType.startsWith('image/'));
  const otherAttachments = note.attachments.filter((attachment) => !attachment.mimeType.startsWith('image/'));

  useEffect(() => () => voiceStream.current?.getTracks().forEach((track) => track.stop()), []);

  const updateItem = (id: string, patch: Partial<ChecklistItem>) => {
    const items = note.items.map((item) => item.id === id ? { ...item, ...patch } : item);
    if (completedItemsBottom && patch.checked !== undefined) items.sort((a, b) => Number(a.checked) - Number(b.checked));
    onChange({ ...note, items });
  };

  const addItem = () => {
    onChange({ ...note, items: [...note.items, { id: crypto.randomUUID(), text: '', checked: false }] });
  };

  const toggleLabel = (label: Label) => {
    const selected = note.labels.some((item) => item.id === label.id);
    onChange({ ...note, labels: selected ? note.labels.filter((item) => item.id !== label.id) : [...note.labels, label] });
  };

  const uploadFiles = (files: FileList | File[]) => {
    for (const file of Array.from(files)) onUpload(file);
  };

  const toggleVoice = async () => {
    if (recording) { recorder.current?.stop(); return; }
    if (offline) { setMediaError(ui('Sesli not eklemek için sunucu bağlantısı gerekiyor.', 'A server connection is required to attach a voice note.')); return; }
    if (!navigator.mediaDevices?.getUserMedia || !('MediaRecorder' in window)) { setMediaError(ui('Bu tarayıcı ses kaydını desteklemiyor.', 'This browser does not support audio recording.')); return; }
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { setMediaError(ui('Mikrofon izni verilmedi.', 'Microphone permission was not granted.')); return; }
    setMediaError('');
    voiceStream.current = stream;
    const chunks: Blob[] = [];
    const mediaRecorder = new MediaRecorder(stream);
    recorder.current = mediaRecorder;
    mediaRecorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    mediaRecorder.onstop = () => {
      const mimeType = mediaRecorder.mimeType || 'audio/webm';
      onUpload(new File(chunks, `voice-note-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`, { type: mimeType }));
      stream.getTracks().forEach((track) => track.stop());
      voiceStream.current = null;
      setRecording(false);
    };
    mediaRecorder.start();
    setRecording(true);
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
                  value={item.text}
                  onChange={(event) => updateItem(item.id, { text: event.target.value })}
                  placeholder={t('editor.item')}
                  className={item.checked ? 'completed' : ''}
                  readOnly={readOnly}
                />
                {!readOnly && <button className="row-remove" onClick={() => onChange({ ...note, items: note.items.filter((entry) => entry.id !== item.id) })} aria-label={ui('Öğeyi sil', 'Delete item')}><X size={15} /></button>}
              </div>
            ))}
            {!readOnly && <button className="add-list-item" onClick={addItem}><Plus size={16} /> {t('editor.addItem')}</button>}
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
            {(offline || mediaError) && <p className="editor-inline-warning">{mediaError || ui('Metin değişiklikleri çevrimdışı kaydedilir. Dosya ve ses eklemek için bağlantı gerekir.', 'Text changes are saved offline. Attachments and voice notes require a connection.')}</p>}
            <div className="option-row">
              <Bell size={17} />
              <label htmlFor="reminder">{t('editor.reminder')}</label>
              <input
                id="reminder"
                type="datetime-local"
                value={localDateTime(note.reminderAt)}
                onChange={(event) => onChange({ ...note, reminderAt: event.target.value ? new Date(event.target.value).toISOString() : null })}
              />
            </div>

            <div className="option-row">
              <UserRound size={17} />
              <label htmlFor="assignee">{ui('Atanan kullanıcı', 'Assigned user')}</label>
              <select id="assignee" disabled={note.ownerId !== currentUserId} value={note.assignedUserId || ''} onChange={(event) => onChange({ ...note, assignedUserId: event.target.value || null })}><option value="">{ui('Yalnızca ben', 'Only me')}</option>{users.filter((user) => user.id !== note.ownerId).map((user) => <option key={user.id} value={user.id}>{user.displayName} (@{user.username})</option>)}</select>
            </div>

            <details className="label-picker">
              <summary><Tag size={17} /> {t('editor.labels')} <span>{note.labels.length || ''}</span></summary>
              <div className="label-picker-list">
                {labels.length === 0 ? <p>{t('editor.noLabels')}</p> : labels.map((label) => (
                  <label key={label.id}>
                    <input type="checkbox" checked={note.labels.some((item) => item.id === label.id)} onChange={() => toggleLabel(label)} />
                    <span className="label-dot" style={{ background: label.color }} />{label.name}
                  </label>
                ))}
              </div>
            </details>

            <div className="color-picker" aria-label={ui('Not rengi', 'Note color')}>
              {colors.map((color) => (
                <button
                  key={color.value}
                  className={`color-dot note-${color.value} ${note.color === color.value ? 'selected' : ''}`}
                  onClick={() => onChange({ ...note, color: color.value })}
                  title={color.label}
                  aria-label={`${color.label} rengi`}
                />
              ))}
            </div>
          </div>
        )}

        <footer className="editor-footer">
          <div className="editor-tools">
            {!readOnly ? (
              <>
                <button className="toolbar-button" onClick={() => onChange({ ...note, type: 'text' })} aria-label={t('editor.text')} title={t('editor.text')}><Type size={18} /></button>
                <button className="toolbar-button" onClick={() => onChange({ ...note, type: 'checklist', items: note.items.length ? note.items : [{ id: crypto.randomUUID(), text: '', checked: false }] })} aria-label={t('editor.checklist')} title={t('editor.checklist')}><ListTodo size={18} /></button>
                <button className="toolbar-button" disabled={offline} onClick={() => fileInput.current?.click()} aria-label={t('editor.attachment')} title={offline ? ui('Çevrimdışıyken dosya eklenemez', 'Attachments are unavailable offline') : t('editor.attachment')}><Paperclip size={18} /><span className="tool-label">{ui('Dosya', 'File')}</span></button>
                <input ref={fileInput} hidden multiple type="file" accept="image/*,audio/*,application/pdf,text/plain,text/markdown,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods" onChange={(event) => { if (event.target.files) uploadFiles(event.target.files); event.target.value = ''; }} />
                <button className={`toolbar-button ${recording ? 'recording' : ''}`} disabled={offline} onClick={() => void toggleVoice()} aria-label={ui('Sesli not', 'Voice note')} title={recording ? ui('Kaydı bitir', 'Stop recording') : ui('Sesli not', 'Voice note')}><Mic size={18} /><span className="tool-label">{ui('Ses', 'Voice')}</span></button>
                {note.type === 'text' && <button className={`toolbar-button ${note.contentFormat === 'markdown' ? 'active' : ''}`} onClick={() => { onChange({ ...note, contentFormat: note.contentFormat === 'markdown' ? 'plain' : 'markdown' }); setPreview(false); }} aria-label="Markdown" title="Markdown"><Code2 size={18} /></button>}
                {note.type === 'text' && note.contentFormat === 'markdown' && <button className={`toolbar-button ${preview ? 'active' : ''}`} onClick={() => setPreview((value) => !value)} aria-label={ui('Önizleme', 'Preview')} title={ui('Önizleme', 'Preview')}><Eye size={18} /></button>}
                <button className="toolbar-button" onClick={onArchive} aria-label={note.archived ? t('unarchive') : t('archive')} title={note.archived ? t('unarchive') : t('archive')}>{note.archived ? <ArchiveRestore size={18} /> : <Archive size={18} />}</button>
                <button className="toolbar-button danger" onClick={onTrash} aria-label={t('moveTrash')} title={t('moveTrash')}><Trash2 size={18} /></button>
              </>
            ) : (
              <>
                <button className="text-button" onClick={onRestore}><Undo2 size={17} /> {t('restore')}</button>
                {note.ownerId === currentUserId && <button className="text-button danger" onClick={onPermanentDelete}><Trash2 size={17} /> {t('deleteForever')}</button>}
              </>
            )}
          </div>
          <span className="save-status">{readOnly ? '' : saveStatus}</span>
          <button className="close-button" onClick={onClose}>{t('close')}</button>
        </footer>
      </section>
    </div>
  );
}
