import type { Metadata } from 'next';
/* eslint-disable @next/next/no-img-element */
import { notFound } from 'next/navigation';
import { Bell, Download, FileText } from 'lucide-react';
import { MarkdownView } from '@/components/markdown-view';
import { getSharedNote } from '@/lib/repository';

type Props = { params: Promise<{ token: string }> };

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const note = getSharedNote((await params).token);
  if (!note) return { title: 'Shared note · Suur', robots: { index: false, follow: false } };
  return { title: `${note.title || 'Shared note'} · Suur`, description: note.content.slice(0, 150), robots: { index: false, follow: false } };
}

export default async function SharedNotePage({ params }: Props) {
  const token = (await params).token;
  const note = getSharedNote(token);
  if (!note) notFound();
  const images = note.attachments.filter((attachment) => attachment.mimeType.startsWith('image/'));
  const files = note.attachments.filter((attachment) => !attachment.mimeType.startsWith('image/'));
  const attachmentUrl = (id: string) => `/share/${encodeURIComponent(token)}/attachments/${id}`;
  return <main className="shared-page"><article className={`shared-note note-${note.color}`}><header><span className="brand-logo" aria-hidden="true" /><strong>Suur</strong><span>Read-only note</span></header>{images.length > 0 && <div className="shared-images">{images.map((attachment) => <img key={attachment.id} src={attachmentUrl(attachment.id)} alt={attachment.filename} />)}</div>}<h1>{note.title || 'Untitled note'}</h1>{note.type === 'checklist' ? <ul>{note.items.map((item) => <li className={item.checked ? 'checked' : ''} key={item.id}><span>{item.checked ? '✓' : ''}</span>{item.text}</li>)}</ul> : note.contentFormat === 'markdown' ? <MarkdownView value={note.content} /> : <p className="shared-text">{note.content}</p>}{files.length > 0 && <div className="shared-files">{files.map((attachment) => attachment.mimeType.startsWith('audio/') ? <audio key={attachment.id} controls preload="metadata" src={attachmentUrl(attachment.id)} /> : <a key={attachment.id} href={attachmentUrl(attachment.id)} download={attachment.filename}><FileText size={18} /><span>{attachment.filename}</span><Download size={16} /></a>)}</div>}<footer>{note.reminderAt && <span><Bell size={12} />{new Date(note.reminderAt).toLocaleString()}</span>}{note.labels.map((label) => <span key={label.id}>{label.name}</span>)}</footer></article></main>;
}
