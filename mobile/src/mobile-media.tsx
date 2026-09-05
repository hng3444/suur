import { Download, FileText, Image as ImageIcon, LoaderCircle, Music2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Attachment } from '../../lib/types.ts';
import type { IndexedDbMobileSyncStore } from '../../lib/mobile-offline-store.ts';
import { attachmentResponse } from './mobile-api.ts';
import { mobileRequest } from '../../lib/mobile-client.ts';
import { saveOrShareBlob } from './native-capabilities.ts';
import type { StoredMobileSession } from './secure-session.ts';

function useAttachmentBlob(attachment: Attachment, session: StoredMobileSession, store: IndexedDbMobileSyncStore | null) {
  const [value, setValue] = useState<{ blob: Blob; url: string } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let objectUrl = '';
    void (async () => {
      try {
        const cached = await store?.readAttachment(attachment.id);
        let blob = cached?.blob;
        if (!blob) {
          const response = await attachmentResponse(session, attachment.id);
          if (!response.ok) throw new Error(`HTTP_${response.status}`);
          blob = await response.blob();
          await store?.writeAttachment({
            id: attachment.id,
            filename: attachment.filename,
            mimeType: attachment.mimeType,
            blob,
            cachedAt: new Date().toISOString(),
          });
        }
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setValue({ blob, url: objectUrl });
      } catch {
        if (active) setFailed(true);
      }
    })();
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [attachment.filename, attachment.id, attachment.mimeType, session, store]);
  return { value, failed };
}

export function MobileAttachment({ attachment, session, store, compact = false }: {
  attachment: Attachment;
  session: StoredMobileSession;
  store: IndexedDbMobileSyncStore | null;
  compact?: boolean;
}) {
  const { value, failed } = useAttachmentBlob(attachment, session, store);
  const image = attachment.mimeType.startsWith('image/');
  const audio = attachment.mimeType.startsWith('audio/');
  if (compact && image) {
    return value
      ? <img className="note-cover" src={value.url} alt="" />
      : <span className="note-cover-placeholder">{failed ? <ImageIcon /> : <LoaderCircle className="spin" />}</span>;
  }
  if (image) return <figure className="mobile-image-attachment">{value ? <img src={value.url} alt={attachment.filename} /> : <span>{failed ? <ImageIcon /> : <LoaderCircle className="spin" />}</span>}<figcaption>{attachment.filename}</figcaption></figure>;
  if (audio) return <div className="mobile-file-attachment">{value ? <audio controls preload="metadata" src={value.url} /> : <Music2 />}<span>{attachment.filename}</span></div>;
  return <button className="mobile-file-attachment" disabled={!value} onClick={() => value && void saveOrShareBlob(value.blob, attachment.filename, attachment.filename)}><FileText /><span>{attachment.filename}<small>{Math.max(1, Math.round(attachment.size / 1024))} KB</small></span>{value ? <Download /> : <LoaderCircle className="spin" />}</button>;
}

export function MobileAvatar({ session, size = 'medium' }: { session: StoredMobileSession; size?: 'small' | 'medium' | 'large' }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!session.user.avatarUrl) return;
    let active = true;
    let objectUrl = '';
    void mobileRequest(session.serverUrl, session.token, session.user.avatarUrl).then(async (response) => {
      if (!response.ok) return;
      objectUrl = URL.createObjectURL(await response.blob());
      if (active) setUrl(objectUrl);
    }).catch(() => undefined);
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [session]);
  const initials = session.user.displayName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase() || session.user.username[0].toLocaleUpperCase();
  return <span className={`mobile-avatar avatar-${size}`}>{session.user.avatarUrl && url ? <img src={url} alt="" /> : initials}</span>;
}
