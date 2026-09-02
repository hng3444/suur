import { translate } from '@/lib/i18n';
import type { Locale, Note } from '@/lib/types';

const openGraphLocales: Record<Locale, string> = {
  en: 'en_US',
  zh: 'zh_CN',
  hi: 'hi_IN',
  es: 'es_ES',
  ar: 'ar_SA',
  fr: 'fr_FR',
  bn: 'bn_BD',
  pt: 'pt_BR',
  ru: 'ru_RU',
  tr: 'tr_TR',
};

export function openGraphLocale(locale: Locale) {
  return openGraphLocales[locale];
}

function plainText(value: string) {
  return value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sharedNoteTitle(note: Note, locale: Locale) {
  return note.title.trim() || translate(locale, 'share.sharedNote');
}

export function sharedNoteSummary(note: Note, locale: Locale, limit = 180) {
  const source = note.type === 'checklist'
    ? note.items.filter((item) => item.text.trim()).slice(0, 4).map((item) => `${item.checked ? '✓' : '○'} ${item.text.trim()}`).join(' · ')
    : plainText(note.content);
  const fallback = translate(locale, 'share.readOnly');
  if (!source) return fallback;
  return source.length > limit ? `${source.slice(0, limit - 1).trimEnd()}…` : source;
}

