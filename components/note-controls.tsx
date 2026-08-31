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
  const tr = locale === 'tr';
  const activeCount = Object.values(filters).filter((value) => value !== 'all').length;
  const colorNames: Record<string, string> = tr
    ? { default: 'Varsayılan', mint: 'Nane', sage: 'Adaçayı', sand: 'Kum', rose: 'Gül', sky: 'Gökyüzü', lavender: 'Lavanta' }
    : { default: 'Default', mint: 'Mint', sage: 'Sage', sand: 'Sand', rose: 'Rose', sky: 'Sky', lavender: 'Lavender' };
  return <section className="filter-panel" aria-label={tr ? 'Notları filtrele' : 'Filter notes'}>
    <header><div><strong>{tr ? 'Notları filtrele' : 'Filter notes'}</strong><span>{activeCount ? `${activeCount} ${tr ? 'filtre etkin' : 'active filters'}` : tr ? 'Sonuçları daralt' : 'Narrow the results'}</span></div><button onClick={onClose} aria-label={translate(locale, 'close')}><X size={18} /></button></header>
    <div className="filter-colors" role="group" aria-label={tr ? 'Renk' : 'Color'}>{colors.map((color) => <button key={color} className={`filter-color note-${color} ${filters.color === color ? 'selected' : ''}`} onClick={() => onChange({ ...filters, color })} title={colorNames[color]} aria-label={colorNames[color]}>{filters.color === color && <Check size={13} />}</button>)}</div>
    <div className="filter-fields">
      <label><span>{tr ? 'Etiket' : 'Label'}</span><select value={filters.label} onChange={(event) => onChange({ ...filters, label: event.target.value })}><option value="all">{tr ? 'Tüm etiketler' : 'All labels'}</option>{labels.map((label) => <option value={label.id} key={label.id}>{label.name}</option>)}</select></label>
      <label><span>{tr ? 'Değiştirilme tarihi' : 'Updated'}</span><select value={filters.date} onChange={(event) => onChange({ ...filters, date: event.target.value })}><option value="all">{tr ? 'Her zaman' : 'Any time'}</option><option value="today">{tr ? 'Son 24 saat' : 'Last 24 hours'}</option><option value="week">{tr ? 'Son 7 gün' : 'Last 7 days'}</option><option value="month">{tr ? 'Son 30 gün' : 'Last 30 days'}</option></select></label>
      <label><span>{tr ? 'Hatırlatıcı' : 'Reminder'}</span><select value={filters.reminder} onChange={(event) => onChange({ ...filters, reminder: event.target.value })}><option value="all">{tr ? 'Tümü' : 'All'}</option><option value="yes">{tr ? 'Olanlar' : 'With reminder'}</option><option value="no">{tr ? 'Olmayanlar' : 'Without reminder'}</option></select></label>
    </div>
    {activeCount > 0 && <button className="filter-clear" onClick={onClear}>{tr ? 'Tüm filtreleri temizle' : 'Clear all filters'}</button>}
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

export function TemplateMenu({ locale, onChoose }: { locale: Locale; onChoose: (template: 'shopping' | 'daily' | 'meeting' | 'idea') => void }) {
  const tr = locale === 'tr';
  const items = [
    { id: 'shopping' as const, icon: '🛒', title: tr ? 'Alışveriş' : 'Shopping', help: tr ? 'Hazır checklist' : 'Ready-made checklist' },
    { id: 'daily' as const, icon: '☀️', title: tr ? 'Günlük plan' : 'Daily plan', help: tr ? 'Öncelikler ve işler' : 'Priorities and tasks' },
    { id: 'meeting' as const, icon: '👥', title: tr ? 'Toplantı' : 'Meeting', help: tr ? 'Gündem ve kararlar' : 'Agenda and decisions' },
    { id: 'idea' as const, icon: '💡', title: tr ? 'Fikir' : 'Idea', help: tr ? 'Fikri hızlı geliştir' : 'Develop an idea quickly' },
  ];
  return <div className="template-menu">{items.map((item) => <button key={item.id} onClick={() => onChoose(item.id)}>{item.icon}<span><strong>{item.title}</strong><small>{item.help}</small></span></button>)}</div>;
}
