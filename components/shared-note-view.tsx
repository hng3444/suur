'use client';

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from 'react';
import { Bell, Download, FileText, Moon, Sun } from 'lucide-react';
import { BrandMark } from '@/components/brand-mark';
import { MarkdownView } from '@/components/markdown-view';
import { languageDirection, translate } from '@/lib/i18n';
import { sharedNoteTitle } from '@/lib/share-utils';
import type { BrandingSettings, Locale, Note } from '@/lib/types';

type ShareTheme = 'light' | 'dark';

export function SharedNoteView({ note, branding, locale, token }: { note: Note; branding: BrandingSettings; locale: Locale; token: string }) {
  const [theme, setTheme] = useState<ShareTheme>('light');
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const images = note.attachments.filter((attachment) => attachment.mimeType.startsWith('image/'));
  const files = note.attachments.filter((attachment) => !attachment.mimeType.startsWith('image/'));
  const attachmentUrl = (id: string) => `/s/${encodeURIComponent(token)}/attachments/${id}`;

  useEffect(() => {
    const task = window.setTimeout(() => {
      const saved = window.localStorage.getItem('suur-share-theme');
      setTheme(saved === 'light' || saved === 'dark' ? saved : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    }, 0);
    return () => window.clearTimeout(task);
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    window.localStorage.setItem('suur-share-theme', next);
  };

  return (
    <main className="shared-page" data-share-theme={theme} lang={locale} dir={languageDirection(locale)}>
      <div className="shared-page-shell">
        <article className={`shared-note note-${note.color}`}>
          <header className="shared-note-header">
            <div className="shared-note-brand"><BrandMark branding={branding} /><strong>{branding.appName}</strong></div>
            <span>{t('share.readOnly')}</span>
            <button className="shared-theme-toggle" onClick={toggleTheme} aria-label={theme === 'dark' ? t('share.lightMode') : t('share.darkMode')} title={theme === 'dark' ? t('share.lightMode') : t('share.darkMode')}>
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </header>
          {images.length > 0 && <div className="shared-images">{images.map((attachment) => <img key={attachment.id} src={attachmentUrl(attachment.id)} alt={attachment.filename} />)}</div>}
          <h1>{sharedNoteTitle(note, locale)}</h1>
          {note.type === 'checklist'
            ? <ul>{note.items.map((item) => <li className={item.checked ? 'checked' : ''} key={item.id}><span>{item.checked ? '✓' : ''}</span>{item.text}</li>)}</ul>
            : note.contentFormat === 'markdown'
              ? <MarkdownView value={note.content} />
              : <p className="shared-text">{note.content}</p>}
          {files.length > 0 && <div className="shared-files">{files.map((attachment) => attachment.mimeType.startsWith('audio/') ? <audio key={attachment.id} controls preload="metadata" src={attachmentUrl(attachment.id)} /> : <a key={attachment.id} href={attachmentUrl(attachment.id)} download={attachment.filename}><FileText size={18} /><span>{attachment.filename}</span><Download size={16} /></a>)}</div>}
          <footer>{note.reminderAt && <span><Bell size={12} />{new Date(note.reminderAt).toLocaleString(locale)}</span>}{note.labels.map((label) => <span key={label.id}>{label.name}</span>)}</footer>
        </article>
        <a className="shared-signature" href="https://github.com/hng3444/suur" target="_blank" rel="noreferrer">Suur by hn9</a>
      </div>
    </main>
  );
}
