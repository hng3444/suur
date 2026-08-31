'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { translate } from '@/lib/i18n';
import type { Locale, Note } from '@/lib/types';

export function CalendarView({ notes, locale, onOpen }: { notes: Note[]; locale: Locale; onOpen: (note: Note) => void }) {
  const [cursor, setCursor] = useState(() => { const date = new Date(); return new Date(date.getFullYear(), date.getMonth(), 1); });
  const monthNotes = useMemo(() => {
    const groups = new Map<string, Note[]>();
    for (const note of notes) {
      if (!note.reminderAt) continue;
      const date = new Date(note.reminderAt);
      if (date.getFullYear() !== cursor.getFullYear() || date.getMonth() !== cursor.getMonth()) continue;
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      groups.set(key, [...(groups.get(key) || []), note]);
    }
    return groups;
  }, [cursor, notes]);
  const startDay = new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay();
  const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const weekDays = Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2024, 0, 7 + index)));
  const cells = Array.from({ length: Math.ceil((startDay + days) / 7) * 7 }, (_, index) => index - startDay + 1);
  const agenda = [...monthNotes.entries()].sort(([a], [b]) => a.localeCompare(b));
  const tr = locale === 'tr';

  return <section className="calendar-view"><header><button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label={tr ? 'Önceki ay' : 'Previous month'}><ChevronLeft size={18} /></button><h2>{new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(cursor)}</h2><button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label={tr ? 'Sonraki ay' : 'Next month'}><ChevronRight size={18} /></button></header><div className="calendar-desktop"><div className="calendar-weekdays">{weekDays.map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{cells.map((day, index) => {
    if (day < 1 || day > days) return <div className="calendar-day empty" key={index} />;
    const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${day}`;
    const items = monthNotes.get(key) || [];
    const today = new Date();
    const isToday = day === today.getDate() && cursor.getMonth() === today.getMonth() && cursor.getFullYear() === today.getFullYear();
    return <div className={`calendar-day ${isToday ? 'today' : ''}`} key={index}><strong>{day}</strong><div>{items.slice(0, 3).map((note) => <button className={`note-${note.color}`} key={note.id} onClick={() => onOpen(note)}><span>{new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(note.reminderAt!))}</span>{note.title || translate(locale, 'untitled')}</button>)}{items.length > 3 && <small>+{items.length - 3}</small>}</div></div>;
  })}</div></div><div className="calendar-mobile-agenda">{agenda.length === 0 ? <p>{tr ? 'Bu ay için hatırlatıcı yok.' : 'No reminders this month.'}</p> : agenda.map(([key, items]) => <section key={key}><time>{new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(items[0].reminderAt!))}</time>{items.map((note) => <button className={`note-${note.color}`} key={note.id} onClick={() => onOpen(note)}><span>{new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(note.reminderAt!))}</span><strong>{note.title || translate(locale, 'untitled')}</strong></button>)}</section>)}</div></section>;
}
