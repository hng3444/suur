'use client';

import { Bell, Pencil, Trash2, Undo2, X } from 'lucide-react';
import type { Note, NoteView } from '@/lib/types';

interface NoteViewerProps {
  note: Note;
  view: NoteView;
  onClose: () => void;
  onEdit: () => void;
  onRestore: () => void;
  onPermanentDelete: () => void;
}

function formatReminder(value: string) {
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function NoteViewer({ note, view, onClose, onEdit, onRestore, onPermanentDelete }: NoteViewerProps) {
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <article className={`note-viewer note-${note.color}`} role="dialog" aria-modal="true" aria-labelledby="note-viewer-title">
        <header className="viewer-header">
          <span className="editor-kicker">{view === 'trash' ? 'ÇÖP KUTUSU' : 'OKUMA MODU'}</span>
          <div>
            {view !== 'trash' && <button className="toolbar-button viewer-edit" onClick={onEdit} aria-label="Notu düzenle" title="Düzenle"><Pencil size={18} /></button>}
            <button className="toolbar-button" onClick={onClose} aria-label="Kapat" title="Kapat"><X size={20} /></button>
          </div>
        </header>
        {note.attachments.length > 0 && <div className="viewer-images">{note.attachments.map((attachment) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={attachment.id} src={attachment.url} alt={attachment.filename} />
        ))}</div>}
        <div className="viewer-content">
          <h1 id="note-viewer-title">{note.title || 'Başlıksız not'}</h1>
          {note.type === 'checklist' ? <ul className="viewer-checklist">{note.items.map((item) => <li className={item.checked ? 'checked' : ''} key={item.id}><span>{item.checked ? '✓' : ''}</span><p>{item.text || 'Boş öğe'}</p></li>)}</ul> : <p className="viewer-text">{note.content || 'Bu notta metin yok.'}</p>}
          {(note.reminderAt || note.labels.length > 0) && <div className="viewer-chips">
            {note.reminderAt && <span><Bell size={13} />{formatReminder(note.reminderAt)}</span>}
            {note.labels.map((label) => <span key={label.id}>{label.name}</span>)}
          </div>}
        </div>
        {view === 'trash' && <footer className="viewer-footer"><button className="text-button" onClick={onRestore}><Undo2 size={17} /> Geri yükle</button><button className="text-button danger" onClick={onPermanentDelete}><Trash2 size={17} /> Kalıcı sil</button></footer>}
      </article>
    </div>
  );
}
