'use client';

import { useEffect, useRef } from 'react';
import { Archive, ArchiveRestore, Bell, Check, GripVertical, Pin, PinOff, Trash2, Undo2, Users } from 'lucide-react';
import { translate } from '@/lib/i18n';
import { plainTextPreview } from '@/lib/client-utils';
import type { Locale, Note, NoteView } from '@/lib/types';

interface NoteCardProps {
  note: Note;
  currentUserId: string;
  locale: Locale;
  view: NoteView;
  layout: 'grid' | 'list';
  draggable: boolean;
  selectionMode: boolean;
  selected: boolean;
  collaboratorName?: string;
  onSelect: (note: Note) => void;
  onOpen: (note: Note) => void;
  onPatch: (note: Note, patch: Partial<Note>, remove?: boolean) => void;
  onPermanentDelete: (note: Note) => void;
  onDragStart: (id: string) => void;
  onDrop: (id: string) => void;
}

function reminderText(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function NoteCard({
  note,
  currentUserId,
  locale,
  view,
  layout,
  draggable,
  selectionMode,
  selected,
  collaboratorName,
  onSelect,
  onOpen,
  onPatch,
  onPermanentDelete,
  onDragStart,
  onDrop,
}: NoteCardProps) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerStart = useRef({ x: 0, y: 0 });
  const suppressClick = useRef(false);
  const stop = (event: React.MouseEvent) => event.stopPropagation();
  const t = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) => translate(locale, key, values);
  const ui = (turkish: string, english: string) => locale === 'tr' ? turkish : english;
  const cover = note.attachments.find((attachment) => attachment.mimeType.startsWith('image/'));

  const cancelLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };

  useEffect(() => cancelLongPress, []);

  const startLongPress = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'touch' || selectionMode || (event.target as HTMLElement).closest('button, a, input, audio')) return;
    pointerStart.current = { x: event.clientX, y: event.clientY };
    cancelLongPress();
    longPressTimer.current = setTimeout(() => {
      suppressClick.current = true;
      navigator.vibrate?.(20);
      onSelect(note);
      longPressTimer.current = null;
    }, 450);
  };

  const moveLongPress = (event: React.PointerEvent<HTMLElement>) => {
    if (Math.hypot(event.clientX - pointerStart.current.x, event.clientY - pointerStart.current.y) > 9) cancelLongPress();
  };

  return (
    <div className={`note-card-shell note-${note.color} ${layout === 'list' ? 'note-card-shell-list' : ''} ${selectionMode ? 'selection-mode' : ''} ${selected ? 'selected' : ''}`}>
      <button className="note-select" aria-pressed={selected} onClick={(event) => { event.stopPropagation(); onSelect(note); }} aria-label={selected ? ui('Seçimi kaldır', 'Clear selection') : ui('Notu seç', 'Select note')}>{selected && <Check size={15} />}</button>
      <article
      className={`note-card note-${note.color} ${layout === 'list' ? 'note-card-list' : ''} ${selected ? 'selected' : ''}`}
      onClick={() => {
        if (suppressClick.current) { suppressClick.current = false; return; }
        if (selectionMode) onSelect(note); else onOpen(note);
      }}
      onContextMenu={(event) => { event.preventDefault(); if (!suppressClick.current) onSelect(note); }}
      onPointerDown={startLongPress}
      onPointerMove={moveLongPress}
      onPointerUp={cancelLongPress}
      onPointerCancel={cancelLongPress}
      draggable={draggable}
      onDragStart={() => onDragStart(note.id)}
      onDragOver={(event) => { if (draggable) event.preventDefault(); }}
      onDrop={(event) => { event.preventDefault(); onDrop(note.id); }}
      tabIndex={0}
      onKeyDown={(event) => { if (event.key === 'Enter') { if (selectionMode) onSelect(note); else onOpen(note); } }}
      aria-label={note.title || t('untitled')}
    >
      {cover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="note-cover" src={cover.url} alt={cover.filename} loading="lazy" />
      )}
      <div className="note-card-body">
        <div className="note-card-heading">
          {note.title && <h2>{note.title}</h2>}
          {draggable && <GripVertical className="drag-handle" size={17} aria-hidden="true" />}
        </div>
        {note.type === 'checklist' ? (
          <ul className="checklist-preview">
            {note.items.slice(0, 6).map((item) => (
              <li className={item.checked ? 'checked' : ''} key={item.id}>
                <span>{item.checked ? '✓' : ''}</span>{item.text || t('blankItem')}
              </li>
            ))}
            {note.items.length > 6 && <li className="more-items">{t('moreItems', { count: note.items.length - 6 })}</li>}
          </ul>
        ) : (
          note.content && <p className="note-content">{note.contentFormat === 'markdown' ? plainTextPreview(note.content) : note.content}</p>
        )}

        {(note.reminderAt || note.labels.length > 0 || collaboratorName) && (
          <div className="note-chips">
            {collaboratorName && <span className="note-chip collaboration-chip"><Users size={12} />{collaboratorName}</span>}
            {note.reminderAt && <span className="note-chip"><Bell size={12} />{reminderText(note.reminderAt, locale)}</span>}
            {note.labels.map((label) => <span className="note-chip" key={label.id}>{label.name}</span>)}
          </div>
        )}

        <div className="note-actions" onClick={stop}>
          {view === 'trash' ? (
            <>
              <button title={t('restore')} aria-label={t('restore')} onClick={() => onPatch(note, { trashedAt: null }, true)}><Undo2 size={16} /></button>
              {note.ownerId === currentUserId && <button className="danger" title={t('deleteForever')} aria-label={t('deleteForever')} onClick={() => onPermanentDelete(note)}><Trash2 size={16} /></button>}
            </>
          ) : (
            <>
              <button title={note.pinned ? t('unpin') : t('pin')} aria-label={note.pinned ? t('unpin') : t('pin')} onClick={() => onPatch(note, { pinned: !note.pinned })}>
                {note.pinned ? <PinOff size={16} /> : <Pin size={16} />}
              </button>
              <button title={note.archived ? t('unarchive') : t('archive')} aria-label={note.archived ? t('unarchive') : t('archive')} onClick={() => onPatch(note, { archived: !note.archived }, true)}>
                {note.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
              </button>
              <button title={t('moveTrash')} aria-label={t('moveTrash')} onClick={() => onPatch(note, { trashedAt: new Date().toISOString() }, true)}><Trash2 size={16} /></button>
            </>
          )}
        </div>
      </div>
      </article>
    </div>
  );
}
