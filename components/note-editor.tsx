'use client';

import { useRef } from 'react';
import {
  Archive,
  ArchiveRestore,
  Bell,
  CheckSquare,
  ImagePlus,
  ListTodo,
  Pin,
  PinOff,
  Plus,
  Tag,
  Trash2,
  Type,
  Undo2,
  X,
} from 'lucide-react';
import type { ChecklistItem, Label, Note, NoteColor, NoteView } from '@/lib/types';

interface NoteEditorProps {
  note: Note;
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
  const readOnly = view === 'trash';

  const updateItem = (id: string, patch: Partial<ChecklistItem>) => {
    onChange({ ...note, items: note.items.map((item) => item.id === id ? { ...item, ...patch } : item) });
  };

  const addItem = () => {
    onChange({ ...note, items: [...note.items, { id: crypto.randomUUID(), text: '', checked: false }] });
  };

  const toggleLabel = (label: Label) => {
    const selected = note.labels.some((item) => item.id === label.id);
    onChange({ ...note, labels: selected ? note.labels.filter((item) => item.id !== label.id) : [...note.labels, label] });
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`note-editor note-${note.color}`} role="dialog" aria-modal="true" aria-labelledby="note-editor-title">
        <header className="editor-header">
          <span className="editor-kicker">{readOnly ? 'ÇÖP KUTUSU' : note.version === 0 ? 'YENİ NOT' : 'NOTU DÜZENLE'}</span>
          <div className="editor-header-actions">
            {!readOnly && (
              <button className="toolbar-button" onClick={() => onChange({ ...note, pinned: !note.pinned })} aria-label={note.pinned ? 'Sabitlemeyi kaldır' : 'Sabitle'} title={note.pinned ? 'Sabitlemeyi kaldır' : 'Sabitle'}>
                {note.pinned ? <PinOff size={18} /> : <Pin size={18} />}
              </button>
            )}
            <button className="toolbar-button" onClick={onClose} aria-label="Kapat" title="Kapat"><X size={20} /></button>
          </div>
        </header>

        {note.attachments.length > 0 && (
          <div className="editor-images">
            {note.attachments.map((attachment) => (
              <figure key={attachment.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={attachment.url} alt={attachment.filename} />
                {!readOnly && <button onClick={() => onDeleteAttachment(attachment.id)} aria-label={`${attachment.filename} görselini kaldır`}><X size={15} /></button>}
              </figure>
            ))}
          </div>
        )}

        <input
          id="note-editor-title"
          className="editor-title"
          value={note.title}
          onChange={(event) => onChange({ ...note, title: event.target.value })}
          placeholder="Başlık"
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
                  aria-label={item.checked ? 'Tamamlanmadı olarak işaretle' : 'Tamamlandı olarak işaretle'}
                  disabled={readOnly}
                >
                  {item.checked && <CheckSquare size={16} />}
                </button>
                <input
                  value={item.text}
                  onChange={(event) => updateItem(item.id, { text: event.target.value })}
                  placeholder="Liste öğesi"
                  className={item.checked ? 'completed' : ''}
                  readOnly={readOnly}
                />
                {!readOnly && <button className="row-remove" onClick={() => onChange({ ...note, items: note.items.filter((entry) => entry.id !== item.id) })} aria-label="Öğeyi sil"><X size={15} /></button>}
              </div>
            ))}
            {!readOnly && <button className="add-list-item" onClick={addItem}><Plus size={16} /> Öğe ekle</button>}
          </div>
        ) : (
          <textarea
            className="editor-content"
            value={note.content}
            onChange={(event) => onChange({ ...note, content: event.target.value })}
            placeholder="Bir not al…"
            maxLength={100_000}
            readOnly={readOnly}
          />
        )}

        {!readOnly && (
          <div className="editor-options">
            <div className="option-row">
              <Bell size={17} />
              <label htmlFor="reminder">Hatırlatıcı</label>
              <input
                id="reminder"
                type="datetime-local"
                value={localDateTime(note.reminderAt)}
                onChange={(event) => onChange({ ...note, reminderAt: event.target.value ? new Date(event.target.value).toISOString() : null })}
              />
            </div>

            <details className="label-picker">
              <summary><Tag size={17} /> Etiketler <span>{note.labels.length || ''}</span></summary>
              <div className="label-picker-list">
                {labels.length === 0 ? <p>Henüz etiket yok.</p> : labels.map((label) => (
                  <label key={label.id}>
                    <input type="checkbox" checked={note.labels.some((item) => item.id === label.id)} onChange={() => toggleLabel(label)} />
                    <span className="label-dot" style={{ background: label.color }} />{label.name}
                  </label>
                ))}
              </div>
            </details>

            <div className="color-picker" aria-label="Not rengi">
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
                <button className="toolbar-button" onClick={() => onChange({ ...note, type: 'text' })} aria-label="Metin notu" title="Metin notu"><Type size={18} /></button>
                <button className="toolbar-button" onClick={() => onChange({ ...note, type: 'checklist', items: note.items.length ? note.items : [{ id: crypto.randomUUID(), text: '', checked: false }] })} aria-label="Checklist" title="Checklist"><ListTodo size={18} /></button>
                <button className="toolbar-button" onClick={() => fileInput.current?.click()} aria-label="Görsel ekle" title="Görsel ekle"><ImagePlus size={18} /></button>
                <input ref={fileInput} hidden type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/avif" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); event.target.value = ''; }} />
                <button className="toolbar-button" onClick={onArchive} aria-label={note.archived ? 'Arşivden çıkar' : 'Arşivle'} title={note.archived ? 'Arşivden çıkar' : 'Arşivle'}>{note.archived ? <ArchiveRestore size={18} /> : <Archive size={18} />}</button>
                <button className="toolbar-button danger" onClick={onTrash} aria-label="Çöp kutusuna taşı" title="Çöp kutusuna taşı"><Trash2 size={18} /></button>
              </>
            ) : (
              <>
                <button className="text-button" onClick={onRestore}><Undo2 size={17} /> Geri yükle</button>
                <button className="text-button danger" onClick={onPermanentDelete}><Trash2 size={17} /> Kalıcı sil</button>
              </>
            )}
          </div>
          <span className="save-status">{readOnly ? '' : saveStatus}</span>
          <button className="close-button" onClick={onClose}>Kapat</button>
        </footer>
      </section>
    </div>
  );
}
