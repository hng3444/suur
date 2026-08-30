import 'server-only';
import { cookies } from 'next/headers';
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { getDb } from '@/lib/db';
import type { User, UserRole } from '@/lib/types';

const COOKIE_NAME = 'suur_session';
const SESSION_DAYS = 30;

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  role: UserRole;
  avatar_stored_name: string | null;
  created_at: string;
  updated_at: string;
}

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$16384$8$1$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export function verifyPassword(password: string, encoded: string) {
  try {
    const [algorithm, n, r, p, saltHex, hashHex] = encoded.split('$');
    if (algorithm !== 'scrypt' || !saltHex || !hashHex) return false;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, {
      N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
    });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    avatarUrl: row.avatar_stored_name ? `/api/users/${row.id}/avatar?v=${encodeURIComponent(row.updated_at)}` : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function findUserByUsername(username: string) {
  return getDb().prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username) as UserRow | undefined;
}

export function findUserById(id: string) {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('base64url');
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + SESSION_DAYS * 86_400_000);
  getDb().prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
    tokenHash(token), userId, expiresAt.toISOString(), createdAt.toISOString(),
  );
  const publicUrl = process.env.SUUR_PUBLIC_URL || '';
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: publicUrl.startsWith('https://'),
    path: '/',
    expires: expiresAt,
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
  store.set(COOKIE_NAME, '', { httpOnly: true, sameSite: 'strict', path: '/', expires: new Date(0) });
}

export async function getCurrentUser() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const row = getDb().prepare(`
    SELECT users.* FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).get(tokenHash(token), new Date().toISOString()) as UserRow | undefined;
  return row ? toUser(row) : null;
}

export function createUser(input: { username: string; displayName: string; password: string; role: UserRole }) {
  const id = randomUUID();
  const timestamp = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO users (id, username, display_name, password_hash, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.username, input.displayName, hashPassword(input.password), input.role, timestamp, timestamp);
  return toUser(findUserById(id)!);
}

export function listUsers() {
  return (getDb().prepare(`
    SELECT * FROM users ORDER BY CASE role WHEN 'superadmin' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, username COLLATE NOCASE
  `).all() as UserRow[]).map(toUser);
}

export function updateUser(id: string, input: { username?: string; displayName?: string; password?: string; role?: UserRole; avatarStoredName?: string | null }) {
  const assignments: string[] = [];
  const values: unknown[] = [];
  const mapping: Array<[keyof typeof input, string, (value: unknown) => unknown]> = [
    ['username', 'username', (value) => value],
    ['displayName', 'display_name', (value) => value],
    ['password', 'password_hash', (value) => hashPassword(String(value))],
    ['role', 'role', (value) => value],
    ['avatarStoredName', 'avatar_stored_name', (value) => value],
  ];
  for (const [key, column, transform] of mapping) {
    if (input[key] !== undefined) { assignments.push(`${column} = ?`); values.push(transform(input[key])); }
  }
  if (!assignments.length) return findUserById(id) ? toUser(findUserById(id)!) : null;
  assignments.push('updated_at = ?');
  values.push(new Date().toISOString(), id);
  const result = getDb().prepare(`UPDATE users SET ${assignments.join(', ')} WHERE id = ?`).run(...values);
  return result.changes ? toUser(findUserById(id)!) : null;
}

export function deleteUser(id: string) {
  return getDb().prepare('DELETE FROM users WHERE id = ?').run(id).changes > 0;
}

export function revokeUserSessions(id: string, exceptCurrentToken?: string) {
  if (exceptCurrentToken) {
    getDb().prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(id, tokenHash(exceptCurrentToken));
  } else getDb().prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
}

export function sessionCookieName() {
  return COOKIE_NAME;
}
