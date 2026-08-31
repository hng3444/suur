'use client';

import { useState } from 'react';
import { Bell, Copy, Download, FileText, History, Pencil, Share2, Trash2, Undo2, X } from 'lucide-react';
import { MarkdownView } from '@/components/markdown-view';
import { translate } from '@/lib/i18n';
import type { Locale, Note, NoteView } from '@/lib/types';

interface NoteViewerProps {
  note: Note;
  locale: Locale;
  view: NoteView;
  onClose: () => void;
  onEdit: () => void;
  onRestore: () => void;
  onPermanentDelete: () => void;
  canDelete: boolean;
  canShare: boolean;
  onDuplicate: () => void;
  onShare: () => void;
  onNoteChange: (note: Note) => void;
}

function formatReminder(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function NoteViewer({ note, locale, view, onClose, onEdit, onRestore, onPermanentDelete, canDelete, canShare, onDuplicate, onShare, onNoteChange }: NoteViewerProps) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const ui = (turkish: string, english: string) => locale === 'tr' ? turkish : english;
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<Array<{ id: string; version: number; createdAt: string; title: string; preview: string; changedBy: string | null }>>([]);
  const images = note.attachments.filter((attachment) => attachment.mimeType.startsWith('image/'));
  const files = note.attachments.filter((attachment) => !attachment.mimeType.startsWith('image/'));

  const openHistory = async () => {
    const next = !historyOpen;
    setHistoryOpen(next);
    if (!next || history.length) return;
    const response = await fetch(`/api/notes/${note.id}/history`);
    if (response.ok) setHistory((await response.json()).history);
  };

  const restoreHistory = async (historyId: string) => {
    const response = await fetch(`/api/notes/${note.id}/history`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ historyId }) });
    if (!response.ok) return;
    onNoteChange((await response.json()).note);
    setHistoryOpen(false);
  };
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <article className={`note-viewer note-${note.color}`} role="dialog" aria-modal="true" aria-labelledby="note-viewer-title">
        <header className="viewer-header">
          <span className="editor-kicker">{view === 'trash' ? t('trashMode') : t('readMode')}</span>
          <div>
            {view !== 'trash' && <><button className="toolbar-button" onClick={() => void openHistory()} aria-label={ui('Not geçmişi', 'Note history')} title={ui('Not geçmişi', 'Note history')}><History size={18} /></button><button className="toolbar-button" onClick={onDuplicate} aria-label={ui('Notu çoğalt', 'Duplicate note')} title={ui('Notu çoğalt', 'Duplicate note')}><Copy size={18} /></button>{canShare && <button className="toolbar-button" onClick={onShare} aria-label={ui('Salt-okunur bağlantı paylaş', 'Share read-only link')} title={ui('Salt-okunur bağlantı paylaş', 'Share read-only link')}><Share2 size={18} /></button>}<button className="toolbar-button viewer-edit" onClick={onEdit} aria-label={t('edit')} title={t('edit')}><Pencil size={18} /></button></>}
            <button className="toolbar-button" onClick={onClose} aria-label={t('close')} title={t('close')}><X size={20} /></button>
          </div>
        </header>
        {images.length > 0 && <div className="viewer-images">{images.map((attachment) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={attachment.id} src={attachment.url} alt={attachment.filename} />
        ))}</div>}
        {files.length > 0 && <div className="viewer-files">{files.map((attachment) => attachment.mimeType.startsWith('audio/') ? <div className="viewer-audio" key={attachment.id}><audio controls preload="metadata" src={attachment.url} /><span>{attachment.filename}</span></div> : <a key={attachment.id} href={attachment.url} download={attachment.filename}><FileText size={18} /><span>{attachment.filename}<small>{(attachment.size / 1024).toFixed(0)} KB</small></span><Download size={16} /></a>)}</div>}
        <div className="viewer-content">
          <h1 id="note-viewer-title">{note.title || t('untitled')}</h1>
          {note.type === 'checklist' ? <ul className="viewer-checklist">{note.items.map((item) => <li className={item.checked ? 'checked' : ''} key={item.id}><span>{item.checked ? '✓' : ''}</span><p>{item.text || t('blankItem')}</p></li>)}</ul> : note.contentFormat === 'markdown' ? <MarkdownView value={note.content} /> : <p className="viewer-text">{note.content || t('emptyText')}</p>}
          {(note.reminderAt || note.labels.length > 0) && <div className="viewer-chips">
            {note.reminderAt && <span><Bell size={13} />{formatReminder(note.reminderAt, locale)}</span>}
            {note.labels.map((label) => <span key={label.id}>{label.name}</span>)}
          </div>}
        </div>
        {historyOpen && <section className="history-panel"><header><strong>{ui('Not geçmişi', 'Note history')}</strong><span>{ui('Son 100 sürüm', 'Last 100 versions')}</span></header>{history.length === 0 ? <p>{ui('Henüz önceki sürüm yok.', 'No previous version yet.')}</p> : history.map((item) => <button key={item.id} onClick={() => void restoreHistory(item.id)}><span><strong>{item.title || t('untitled')}</strong><small>{new Date(item.createdAt).toLocaleString(locale)}{item.changedBy ? ` · ${item.changedBy}` : ''}</small></span><em>{item.preview || `${ui('Sürüm', 'Version')} ${item.version}`}</em><Undo2 size={15} /></button>)}</section>}
        {view === 'trash' && <footer className="viewer-footer"><button className="text-button" onClick={onRestore}><Undo2 size={17} /> {t('restore')}</button>{canDelete && <button className="text-button danger" onClick={onPermanentDelete}><Trash2 size={17} /> {t('deleteForever')}</button>}</footer>}
      </article>
    </div>
  );
}
