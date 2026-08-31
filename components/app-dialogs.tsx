'use client';

import { Check, Copy, Link2, TriangleAlert, X } from 'lucide-react';
import { useState } from 'react';
import type { Locale } from '@/lib/types';

export function ConfirmDialog({ locale, title, message, destructive = false, onConfirm, onCancel }: { locale: Locale; title: string; message: string; destructive?: boolean; onConfirm: () => void | Promise<void>; onCancel: () => void }) {
  const tr = locale === 'tr';
  return <div className="dialog-backdrop nested-dialog" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}><section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message"><div className={`confirm-icon ${destructive ? 'danger' : ''}`}><TriangleAlert size={22} /></div><h2 id="confirm-title">{title}</h2><p id="confirm-message">{message}</p><footer><button onClick={onCancel}>{tr ? 'Vazgeç' : 'Cancel'}</button><button className={destructive ? 'danger' : 'primary'} onClick={() => void onConfirm()}>{tr ? 'Onayla' : 'Confirm'}</button></footer></section></div>;
}

export function ShareDialog({ locale, url, onClose }: { locale: Locale; url: string; onClose: () => void }) {
  const tr = locale === 'tr';
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  return <div className="dialog-backdrop nested-dialog" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-title"><header><span><Link2 size={18} /></span><div><h2 id="share-title">{tr ? 'Salt-okunur bağlantı' : 'Read-only link'}</h2><p>{tr ? 'Bağlantıya sahip kişiler notu değiştiremez.' : 'People with this link cannot edit the note.'}</p></div><button onClick={onClose} aria-label={tr ? 'Kapat' : 'Close'}><X size={18} /></button></header><div className="share-link"><input readOnly value={url} onFocus={(event) => event.currentTarget.select()} /><button onClick={() => void copy()}>{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? (tr ? 'Kopyalandı' : 'Copied') : (tr ? 'Kopyala' : 'Copy')}</button></div></section></div>;
}
