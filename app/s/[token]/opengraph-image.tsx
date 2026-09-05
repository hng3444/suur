import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { notFound } from 'next/navigation';
import { uploadsDirectory } from '@/lib/db';
import { translate } from '@/lib/i18n';
import { getBranding, getSettings, getSharedAttachmentRecord, getSharedNote } from '@/lib/repository';
import { sharedNoteSummary, sharedNoteTitle } from '@/lib/share-utils';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const noteBackgrounds = {
  default: '#f7f8f7',
  mint: '#dff3e7',
  sage: '#eef0df',
  sand: '#fff0c2',
  rose: '#f8dfe4',
  sky: '#dcecf7',
  lavender: '#e9e1f6',
} as const;

async function previewImage(token: string, id: string, mimeType: string, sizeInBytes: number) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType) || sizeInBytes > 8 * 1024 * 1024) return null;
  const record = getSharedAttachmentRecord(token, id);
  if (!record) return null;
  try {
    const bytes = await readFile(path.join(uploadsDirectory(), record.stored_name));
    return `data:${mimeType};base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}

export default async function SharedNoteOpenGraphImage({ params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  if (token.length < 20 || token.length > 128) notFound();
  const note = getSharedNote(token);
  if (!note) notFound();
  const branding = getBranding();
  const locale = getSettings(note.ownerId).locale;
  const title = sharedNoteTitle(note, locale);
  const summary = sharedNoteSummary(note, locale, 150);
  const firstImage = note.attachments.find((attachment) => attachment.mimeType.startsWith('image/'));
  const image = firstImage ? await previewImage(token, firstImage.id, firstImage.mimeType, firstImage.size) : null;
  const background = noteBackgrounds[note.color] || noteBackgrounds.default;
  const brandIcon = `data:image/png;base64,${(await readFile(path.join(process.cwd(), 'public', 'suuricon.png'))).toString('base64')}`;

  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', background: '#101312', color: '#172019', fontFamily: 'Arial, sans-serif', padding: 34 }}>
      <div style={{ width: '100%', height: '100%', display: 'flex', overflow: 'hidden', borderRadius: 34, background, boxShadow: '0 24px 70px rgba(0,0,0,.3)' }}>
        {image && <img src={image} alt="" width="650" height="562" style={{ width: 650, height: '100%', objectFit: 'cover' }} />}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', padding: image ? '48px 52px' : '58px 68px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, color: '#2948dc', fontSize: 25, fontWeight: 700 }}>
            <img src={brandIcon} alt="" width="34" height="34" style={{ width: 34, height: 34, borderRadius: 8 }} />
            {branding.appName}
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ display: 'flex', fontSize: image ? 48 : 62, lineHeight: 1.08, fontWeight: 750, letterSpacing: '-2px' }}>{title.slice(0, 90)}</div>
            {summary && <div style={{ display: 'flex', marginTop: 24, color: '#4a544c', fontSize: image ? 23 : 27, lineHeight: 1.4 }}>{summary}</div>}
          </div>
          <div style={{ display: 'flex', color: '#6d766f', fontSize: 18, letterSpacing: '2px', textTransform: 'uppercase' }}>{translate(locale, 'share.readOnly')} · Suur by hn9</div>
        </div>
      </div>
    </div>,
    { ...size, headers: { 'Cache-Control': 'private, max-age=300', 'X-Robots-Tag': 'noindex, noarchive' } },
  );
}
