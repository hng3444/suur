import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { LocalNotifications, type ActionPerformed } from '@capacitor/local-notifications';
import { Share } from '@capacitor/share';
import type { Locale, Note } from '../../lib/types.ts';

function notificationId(noteId: string) {
  let hash = 2166136261;
  for (let index = 0; index < noteId.length; index += 1) {
    hash ^= noteId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash | 0) || 1;
}

function notificationBody(note: Note, locale: Locale) {
  const checklist = note.items.find((item) => !item.checked)?.text;
  const text = note.content.trim() || checklist || (locale === 'tr' ? 'Notuna göz at.' : 'Open your note.');
  return text.slice(0, 180);
}

export async function notificationPermission(request = false) {
  try {
    let permission = await LocalNotifications.checkPermissions();
    if (request && permission.display === 'prompt') permission = await LocalNotifications.requestPermissions();
    return permission.display === 'granted';
  } catch {
    return false;
  }
}

let reminderWork: Promise<unknown> = Promise.resolve();
let lastReminderState = '';

export function syncNativeReminders(notes: Note[], locale: Locale, appName: string, requestPermission = false) {
  const run = reminderWork.catch(() => undefined).then(() => scheduleReminders(notes, locale, appName, requestPermission));
  reminderWork = run;
  return run;
}

async function scheduleReminders(notes: Note[], locale: Locale, appName: string, requestPermission: boolean) {
  if (!Capacitor.isNativePlatform()) return false;
  const granted = await notificationPermission(requestPermission);
  if (!granted) return false;
  const now = Date.now();
  const notifications = notes
    .filter((note) => note.reminderAt && !note.archived && !note.trashedAt && new Date(note.reminderAt).getTime() > now)
    .slice(0, 250)
    .map((note) => ({
      id: notificationId(note.id),
      title: note.title.trim() || appName,
      body: notificationBody(note, locale),
      schedule: { at: new Date(note.reminderAt!), allowWhileIdle: true },
      isExactNotification: false,
      extra: { noteId: note.id },
      iconColor: '#f05a24',
    }));
  const fingerprint = JSON.stringify(notifications);
  if (lastReminderState === fingerprint) return true;
  await LocalNotifications.cancelAll();
  if (notifications.length) await LocalNotifications.schedule({ notifications });
  lastReminderState = fingerprint;
  return true;
}

export function onNotificationOpened(listener: (noteId: string) => void) {
  return LocalNotifications.addListener('localNotificationActionPerformed', (action: ActionPerformed) => {
    const noteId = action.notification.extra?.noteId;
    if (typeof noteId === 'string') listener(noteId);
  });
}

function blobAsBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function saveOrShareBlob(blob: Blob, filename: string, title: string) {
  if (!Capacitor.isNativePlatform()) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    return;
  }
  const result = await Filesystem.writeFile({
    path: `exports/${filename}`,
    directory: Directory.Cache,
    data: await blobAsBase64(blob),
    recursive: true,
  });
  await Share.share({ title, files: [result.uri], dialogTitle: title });
}

export async function shareText(title: string, text: string, url?: string) {
  if (Capacitor.isNativePlatform() || await Share.canShare().then((result) => result.value).catch(() => false)) {
    await Share.share({ title, text, url, dialogTitle: title });
    return;
  }
  await navigator.clipboard.writeText(url || text);
}
