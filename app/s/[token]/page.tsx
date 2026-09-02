import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SharedNoteView } from '@/components/shared-note-view';
import { getBranding, getSettings, getSharedNote } from '@/lib/repository';
import { openGraphLocale, sharedNoteSummary, sharedNoteTitle } from '@/lib/share-utils';

type Props = { params: Promise<{ token: string }> };

export const dynamic = 'force-dynamic';

function publicUrl() {
  return process.env.SUUR_PUBLIC_URL || 'http://localhost:3000';
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const token = (await params).token;
  const note = getSharedNote(token);
  const branding = getBranding();
  if (!note) return { title: branding.appName, robots: { index: false, follow: false, noarchive: true } };
  const locale = getSettings(note.ownerId).locale;
  const noteTitle = sharedNoteTitle(note, locale);
  const title = `${noteTitle} · ${branding.appName}`;
  const description = sharedNoteSummary(note, locale);
  const url = new URL(`/s/${encodeURIComponent(token)}`, publicUrl()).toString();
  const image = new URL(`/s/${encodeURIComponent(token)}/opengraph-image?v=${encodeURIComponent(note.updatedAt)}`, publicUrl()).toString();
  const images = [{ url: image, width: 1200, height: 630, alt: noteTitle }];
  return {
    title,
    description,
    robots: { index: false, follow: false, noarchive: true },
    openGraph: { title, description, url, siteName: branding.appName, locale: openGraphLocale(locale), type: 'article', images },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

export default async function SharedNotePage({ params }: Props) {
  const token = (await params).token;
  if (token.length < 20 || token.length > 128) notFound();
  const note = getSharedNote(token);
  if (!note) notFound();
  return <SharedNoteView note={note} branding={getBranding()} locale={getSettings(note.ownerId).locale} token={token} />;
}

