'use client';

import { Archive, ArchiveRestore, Bell, GripVertical, Pin, PinOff, Trash2, Undo2 } from 'lucide-react';
import type { Note, NoteView } from '@/lib/types';

interface NoteCardProps {
  note: Note;
  view: NoteView;
  layout: 'grid' | 'list';
  draggable: boolean;
  onOpen: (note: Note) => void;
  onPatch: (note: Note, patch: Partial<Note>, remove?: boolean) => void;
  onPermanentDelete: (note: Note) => void;
  onDragStart: (id: string) => void;
  onDrop: (id: string) => void;
}

function reminderText(value: string) {
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function NoteCard({
  note,
  view,
  layout,
  draggable,
  onOpen,
  onPatch,
  onPermanentDelete,
  onDragStart,
  onDrop,
}: NoteCardProps) {
  const stop = (event: React.MouseEvent) => event.stopPropagation();

  return (
    <article
      className={`note-card note-${note.color} ${layout === 'list' ? 'note-card-list' : ''}`}
      onClick={() => onOpen(note)}
      draggable={draggable}
      onDragStart={() => onDragStart(note.id)}
      onDragOver={(event) => { if (draggable) event.preventDefault(); }}
      onDrop={(event) => { event.preventDefault(); onDrop(note.id); }}
      tabIndex={0}
      onKeyDown={(event) => { if (event.key === 'Enter') onOpen(note); }}
      aria-label={`${note.title || 'Başlıksız not'} notunu aç`}
    >
      {note.attachments[0] && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="note-cover" src={note.attachments[0].url} alt={note.attachments[0].filename} loading="lazy" />
      )}
      <div className="note-card-body">
        <div className="note-card-heading">
          <h2>{note.title || 'Başlıksız not'}</h2>
          {draggable && <GripVertical className="drag-handle" size={17} aria-hidden="true" />}
        </div>
        {note.type === 'checklist' ? (
          <ul className="checklist-preview">
            {note.items.slice(0, 6).map((item) => (
              <li className={item.checked ? 'checked' : ''} key={item.id}>
                <span>{item.checked ? '✓' : ''}</span>{item.text || 'Boş öğe'}
              </li>
            ))}
            {note.items.length > 6 && <li className="more-items">+{note.items.length - 6} öğe</li>}
          </ul>
        ) : (
          note.content && <p className="note-content">{note.content}</p>
        )}

        {(note.reminderAt || note.labels.length > 0) && (
          <div className="note-chips">
            {note.reminderAt && <span className="note-chip"><Bell size={12} />{reminderText(note.reminderAt)}</span>}
            {note.labels.map((label) => <span className="note-chip" key={label.id}>{label.name}</span>)}
          </div>
        )}

        <div className="note-actions" onClick={stop}>
          {view === 'trash' ? (
            <>
              <button title="Geri yükle" aria-label="Notu geri yükle" onClick={() => onPatch(note, { trashedAt: null }, true)}><Undo2 size={16} /></button>
              <button className="danger" title="Kalıcı sil" aria-label="Notu kalıcı sil" onClick={() => onPermanentDelete(note)}><Trash2 size={16} /></button>
            </>
          ) : (
            <>
              <button title={note.pinned ? 'Sabitlemeyi kaldır' : 'Sabitle'} aria-label={note.pinned ? 'Sabitlemeyi kaldır' : 'Sabitle'} onClick={() => onPatch(note, { pinned: !note.pinned })}>
                {note.pinned ? <PinOff size={16} /> : <Pin size={16} />}
              </button>
              <button title={note.archived ? 'Arşivden çıkar' : 'Arşivle'} aria-label={note.archived ? 'Arşivden çıkar' : 'Arşivle'} onClick={() => onPatch(note, { archived: !note.archived }, true)}>
                {note.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
              </button>
              <button title="Çöp kutusuna taşı" aria-label="Çöp kutusuna taşı" onClick={() => onPatch(note, { trashedAt: new Date().toISOString() }, true)}><Trash2 size={16} /></button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
