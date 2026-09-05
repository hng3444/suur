import { jsonRequest, mobileJson, mobileRequest } from '../../lib/mobile-client.ts';
import type { Attachment, BrandingSettings, Label, Note, User, UserSummary } from '../../lib/types.ts';
import type { StoredMobileSession } from './secure-session.ts';

export interface NoteHistoryEntry {
  id: string;
  version: number;
  createdAt: string;
  title: string;
  preview: string;
  changedBy: string | null;
}

export interface BackupEntry {
  name: string;
  size: number;
  createdAt: string;
}

const auth = (session: StoredMobileSession) => ({ serverUrl: session.serverUrl, token: session.token });

export async function refreshMobileUser(session: StoredMobileSession) {
  return (await mobileJson<{ user: User }>(auth(session).serverUrl, auth(session).token, '/api/auth/me')).user;
}

export async function listDirectory(session: StoredMobileSession) {
  return (await mobileJson<{ users: UserSummary[] }>(auth(session).serverUrl, auth(session).token, '/api/users/directory')).users;
}

export async function duplicateRemoteNote(session: StoredMobileSession, noteId: string) {
  return (await mobileJson<{ note: Note }>(auth(session).serverUrl, auth(session).token, `/api/notes/${noteId}/duplicate`, { method: 'POST' })).note;
}

export async function shareRemoteNote(session: StoredMobileSession, noteId: string) {
  return (await mobileJson<{ url: string }>(auth(session).serverUrl, auth(session).token, `/api/notes/${noteId}/share`, { method: 'POST' })).url;
}

export async function revokeRemoteShare(session: StoredMobileSession, noteId: string) {
  await mobileJson(auth(session).serverUrl, auth(session).token, `/api/notes/${noteId}/share`, { method: 'DELETE' });
}

export async function noteHistory(session: StoredMobileSession, noteId: string) {
  return (await mobileJson<{ history: NoteHistoryEntry[] }>(auth(session).serverUrl, auth(session).token, `/api/notes/${noteId}/history`)).history;
}

export async function restoreRemoteHistory(session: StoredMobileSession, noteId: string, historyId: string) {
  return (await mobileJson<{ note: Note }>(auth(session).serverUrl, auth(session).token, `/api/notes/${noteId}/history`, jsonRequest('POST', { historyId }))).note;
}

export async function uploadRemoteAttachment(session: StoredMobileSession, noteId: string, file: File) {
  const form = new FormData();
  form.append('file', file);
  return (await mobileJson<{ attachment: Attachment }>(auth(session).serverUrl, auth(session).token, `/api/notes/${noteId}/attachments`, { method: 'POST', body: form })).attachment;
}

export async function deleteRemoteAttachment(session: StoredMobileSession, attachmentId: string) {
  await mobileJson(auth(session).serverUrl, auth(session).token, `/api/attachments/${attachmentId}`, { method: 'DELETE' });
}

export function attachmentResponse(session: StoredMobileSession, attachmentId: string) {
  return mobileRequest(auth(session).serverUrl, auth(session).token, `/api/attachments/${attachmentId}`);
}

export async function updateProfile(session: StoredMobileSession, values: Record<string, unknown>) {
  return mobileJson<{ user: User; reauthenticate: boolean }>(auth(session).serverUrl, auth(session).token, `/api/users/${session.user.id}`, jsonRequest('PATCH', values));
}

export async function uploadProfileAvatar(session: StoredMobileSession, file: File) {
  const form = new FormData();
  form.append('file', file);
  return (await mobileJson<{ user: User }>(auth(session).serverUrl, auth(session).token, '/api/users/me/avatar', { method: 'POST', body: form })).user;
}

export async function listRemoteBackups(session: StoredMobileSession) {
  return (await mobileJson<{ backups: BackupEntry[] }>(auth(session).serverUrl, auth(session).token, '/api/backups')).backups;
}

export async function createRemoteBackup(session: StoredMobileSession) {
  return (await mobileJson<{ name: string }>(auth(session).serverUrl, auth(session).token, '/api/backups', { method: 'POST' })).name;
}

export function backupResponse(session: StoredMobileSession, name: string) {
  return mobileRequest(auth(session).serverUrl, auth(session).token, `/api/backups/${encodeURIComponent(name)}`);
}

export function exportResponse(session: StoredMobileSession, format: 'backup' | 'json' | 'markdown' | 'txt') {
  return mobileRequest(auth(session).serverUrl, auth(session).token, `/api/export?format=${format}`);
}

export async function importRemoteFile(session: StoredMobileSession, file: File, kind: 'portable' | 'keep') {
  const form = new FormData();
  form.append('file', file);
  const path = kind === 'keep' ? '/api/import/google-keep' : '/api/import/portable';
  return mobileJson<Record<string, number>>(auth(session).serverUrl, auth(session).token, path, { method: 'POST', body: form });
}

export async function listRemoteUsers(session: StoredMobileSession) {
  return (await mobileJson<{ users: User[] }>(auth(session).serverUrl, auth(session).token, '/api/users')).users;
}

export async function createRemoteUser(session: StoredMobileSession, values: Record<string, unknown>) {
  return (await mobileJson<{ user: User }>(auth(session).serverUrl, auth(session).token, '/api/users', jsonRequest('POST', values))).user;
}

export async function updateRemoteUser(session: StoredMobileSession, userId: string, values: Record<string, unknown>) {
  return (await mobileJson<{ user: User }>(auth(session).serverUrl, auth(session).token, `/api/users/${userId}`, jsonRequest('PATCH', values))).user;
}

export async function deleteRemoteUser(session: StoredMobileSession, userId: string) {
  await mobileJson(auth(session).serverUrl, auth(session).token, `/api/users/${userId}`, { method: 'DELETE' });
}

export async function getRemoteBranding(session: StoredMobileSession) {
  return (await mobileJson<{ branding: BrandingSettings }>(auth(session).serverUrl, auth(session).token, '/api/branding')).branding;
}

export async function updateRemoteBranding(session: StoredMobileSession, appName: string) {
  return (await mobileJson<{ branding: BrandingSettings }>(auth(session).serverUrl, auth(session).token, '/api/branding', jsonRequest('PATCH', { appName }))).branding;
}

export async function uploadRemoteBrandingIcon(session: StoredMobileSession, file: File) {
  const form = new FormData();
  form.append('file', file);
  return (await mobileJson<{ branding: BrandingSettings }>(auth(session).serverUrl, auth(session).token, '/api/branding/icon', { method: 'POST', body: form })).branding;
}

export async function resetRemoteBrandingIcon(session: StoredMobileSession) {
  return (await mobileJson<{ branding: BrandingSettings }>(auth(session).serverUrl, auth(session).token, '/api/branding/icon', { method: 'DELETE' })).branding;
}

export function createLocalLabel(name: string, color: string): Label {
  const timestamp = new Date().toISOString();
  return { id: `label_${crypto.randomUUID()}`, name: name.trim(), color, createdAt: timestamp, updatedAt: timestamp };
}
