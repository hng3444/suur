'use client';

import { Archive, ArchiveRestore, Check, Tag, Trash2, X } from 'lucide-react';
import { translate } from '@/lib/i18n';
import type { Label, Locale, NoteColor, NoteView } from '@/lib/types';

export interface NoteFilters {
  color: string;
  label: string;
  date: string;
  reminder: string;
}

const colors: NoteColor[] = ['default', 'mint', 'sage', 'sand', 'rose', 'sky', 'lavender'];

export function NoteFilterPanel({ locale, labels, filters, onChange, onClear, onClose }: { locale: Locale; labels: Label[]; filters: NoteFilters; onChange: (filters: NoteFilters) => void; onClear: () => void; onClose: () => void }) {
  const t = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) => translate(locale, key, values);
  const activeCount = Object.values(filters).filter((value) => value !== 'all').length;
  return <section className="filter-panel" aria-label={t('filter.title')}>
    <header><div><strong>{t('filter.title')}</strong><span>{activeCount ? t('filter.active', { count: activeCount }) : t('filter.hint')}</span></div><button onClick={onClose} aria-label={translate(locale, 'close')}><X size={18} /></button></header>
    <div className="filter-colors" role="group" aria-label={t('filter.color')}>{colors.map((color) => <button key={color} className={`filter-color note-${color} ${filters.color === color ? 'selected' : ''}`} onClick={() => onChange({ ...filters, color })} title={t(`color.${color}` as Parameters<typeof translate>[1])} aria-label={t(`color.${color}` as Parameters<typeof translate>[1])}>{filters.color === color && <Check size={13} />}</button>)}</div>
    <div className="filter-fields">
      <label><span>{t('filter.label')}</span><select value={filters.label} onChange={(event) => onChange({ ...filters, label: event.target.value })}><option value="all">{t('filter.allLabels')}</option>{labels.map((label) => <option value={label.id} key={label.id}>{label.name}</option>)}</select></label>
      <label><span>{t('filter.updated')}</span><select value={filters.date} onChange={(event) => onChange({ ...filters, date: event.target.value })}><option value="all">{t('filter.anyTime')}</option><option value="today">{t('filter.today')}</option><option value="week">{t('filter.week')}</option><option value="month">{t('filter.month')}</option></select></label>
      <label><span>{t('filter.reminder')}</span><select value={filters.reminder} onChange={(event) => onChange({ ...filters, reminder: event.target.value })}><option value="all">{t('filter.all')}</option><option value="yes">{t('filter.withReminder')}</option><option value="no">{t('filter.withoutReminder')}</option></select></label>
    </div>
    {activeCount > 0 && <button className="filter-clear" onClick={onClear}>{t('filter.clear')}</button>}
  </section>;
}

export function BulkToolbar({ locale, view, count, canDelete, labels, onArchive, onTrash, onRestore, onDeleteForever, onAddLabel, onClose }: { locale: Locale; view: NoteView; count: number; canDelete: boolean; labels: Label[]; onArchive: () => void; onTrash: () => void; onRestore: () => void; onDeleteForever: () => void; onAddLabel: (id: string) => void; onClose: () => void }) {
  const tr = locale === 'tr';
  const disabled = count === 0;
  return <div className="bulk-toolbar"><strong><span>{count}</span> {tr ? 'not seçildi' : 'notes selected'}</strong><div className="bulk-actions">
    {view === 'trash' ? <><button disabled={disabled} onClick={onRestore}><ArchiveRestore size={16} /> {translate(locale, 'restore')}</button><button className="danger" disabled={disabled || !canDelete} title={!canDelete ? (tr ? 'Yalnızca sahibi olduğunuz notlar kalıcı silinebilir.' : 'Only notes you own can be permanently deleted.') : ''} onClick={onDeleteForever}><Trash2 size={16} /> {translate(locale, 'deleteForever')}</button></> : <><button disabled={disabled} onClick={onArchive}>{view === 'archive' ? <ArchiveRestore size={16} /> : <Archive size={16} />} {view === 'archive' ? translate(locale, 'unarchive') : translate(locale, 'archive')}</button><button disabled={disabled} onClick={onTrash}><Trash2 size={16} /> {tr ? 'Sil' : 'Delete'}</button></>}
    <label className="bulk-label"><Tag size={15} /><select aria-label={tr ? 'Etiket ekle' : 'Add label'} disabled={disabled} value="" onChange={(event) => onAddLabel(event.target.value)}><option value="">{tr ? 'Etiket ekle…' : 'Add label…'}</option>{labels.map((label) => <option value={label.id} key={label.id}>{label.name}</option>)}</select></label>
  </div><button className="bulk-close" onClick={onClose} aria-label={translate(locale, 'close')}><X size={18} /></button></div>;
}
