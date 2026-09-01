import { baseMimeType } from '@/lib/media-utils';

export const attachmentMimeExtensions: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'text/markdown': '.md',
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'audio/mp4': '.m4a',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/vnd.oasis.opendocument.text': '.odt',
  'application/vnd.oasis.opendocument.spreadsheet': '.ods',
};

const inlineMimeTypes = new Set(Object.keys(attachmentMimeExtensions).filter((mime) => mime.startsWith('image/') || mime.startsWith('audio/')));

export function normalizedAttachmentMime(mime: unknown) {
  const normalized = baseMimeType(mime);
  return normalized in attachmentMimeExtensions ? normalized : 'application/octet-stream';
}

export function acceptedAttachmentMime(mime: unknown) {
  const normalized = baseMimeType(mime);
  return normalized in attachmentMimeExtensions ? normalized : null;
}

export function attachmentExtension(mime: unknown) {
  return attachmentMimeExtensions[normalizedAttachmentMime(mime)] || '.bin';
}

export function attachmentResponseHeaders(mime: unknown, filename: string) {
  const normalized = normalizedAttachmentMime(mime);
  const disposition = inlineMimeTypes.has(normalized) ? 'inline' : 'attachment';
  return {
    'Content-Type': normalized,
    'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(filename)}`,
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'X-Content-Type-Options': 'nosniff',
  };
}
