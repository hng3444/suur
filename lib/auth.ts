import 'server-only';
import { cookies, headers } from 'next/headers';
import { createHash, randomBytes, randomUUID, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import { getDb } from '@/lib/db';
import { parseBearerAuthorization } from '@/lib/session-token';
import type { User, UserRole } from '@/lib/types';

const COOKIE_NAME = 'suur_session';
const SESSION_DAYS = 30;
const MOBILE_SESSION_DAYS = 90;

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  role: UserRole;
  avatar_stored_name: string | null;
  storage_quota_mb: number;
  must_change_password: number;
  created_at: string;
  updated_at: string;
}

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function createSessionRecord(userId: string, type: 'web' | 'mobile', lifetimeDays: number, deviceName: string | null) {
  const token = randomBytes(32).toString('base64url');
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + lifetimeDays * 86_400_000);
  getDb().prepare(`
    INSERT INTO sessions (token_hash, user_id, expires_at, created_at, session_type, device_name)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(tokenHash(token), userId, expiresAt.toISOString(), createdAt.toISOString(), type, deviceName);
  return { token, expiresAt: expiresAt.toISOString() };
}

export function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$16384$8$1$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, encoded: string) {
  try {
    const [algorithm, n, r, p, saltHex, hashHex] = encoded.split('$');
    if (algorithm !== 'scrypt' || !saltHex || !hashHex) return false;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, Buffer.from(saltHex, 'hex'), expected.length, {
        N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
      }, (error, key) => error ? reject(error) : resolve(key));
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
    storageQuotaMb: row.storage_quota_mb,
    mustChangePassword: Boolean(row.must_change_password),
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
  const { token, expiresAt } = createSessionRecord(userId, 'web', SESSION_DAYS, null);
  const publicUrl = process.env.SUUR_PUBLIC_URL || '';
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: publicUrl.startsWith('https://'),
    path: '/',
    expires: new Date(expiresAt),
  });
}

export function createMobileSession(userId: string, deviceName: string) {
  return createSessionRecord(userId, 'mobile', MOBILE_SESSION_DAYS, deviceName);
}

export async function destroySession() {
  const store = await cookies();
  const cookieToken = store.get(COOKIE_NAME)?.value;
  const bearerToken = parseBearerAuthorization((await headers()).get('authorization'));
  for (const token of new Set([cookieToken, bearerToken].filter((value): value is string => Boolean(value)))) {
    getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
  }
  store.set(COOKIE_NAME, '', { httpOnly: true, sameSite: 'strict', path: '/', expires: new Date(0) });
}

export async function getCurrentUser() {
  const authorization = (await headers()).get('authorization');
  const token = authorization === null
    ? (await cookies()).get(COOKIE_NAME)?.value
    : parseBearerAuthorization(authorization);
  if (!token) return null;
  const row = getDb().prepare(`
    SELECT users.* FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).get(tokenHash(token), new Date().toISOString()) as UserRow | undefined;
  return row ? toUser(row) : null;
}

export function revokeSessionToken(token: string) {
  return getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token)).changes > 0;
}

const globalLimiter = globalThis as unknown as { suurLoginAttempts?: Map<string, { count: number; resetAt: number }> };
const loginAttempts = globalLimiter.suurLoginAttempts ?? new Map();
globalLimiter.suurLoginAttempts = loginAttempts;
const dummyPasswordHash = 'scrypt$16384$8$1$8cbb4e6c64380641afce209f81987bf9$9c23b68a76fc1922873c9f0a3b6b275a1ce02d3353a35a7a0bb88ac1c0cd3a7d870f24e7bd0ae9ae4e92768a44536ab1c739f36f86731323e0f65cf6c77dc282';

export async function authenticateCredentials(request: Request, username: string, password: string): Promise<
  { ok: true; user: User } | { ok: false; status: 401 | 429; message: string; code: 'INVALID_CREDENTIALS' | 'TOO_MANY_ATTEMPTS' }
> {
  const trustProxy = process.env.SUUR_TRUST_PROXY === 'true';
  const forwarded = trustProxy
    ? request.headers.get('cf-connecting-ip')
      || request.headers.get('x-real-ip')
      || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || 'proxy'
    : 'all-clients';
  const key = `${forwarded}:${username.toLocaleLowerCase('en-US')}`;
  const current = loginAttempts.get(key);
  const now = Date.now();
  if (current && current.resetAt > now && current.count >= 5) {
    return { ok: false, status: 429, message: 'Çok fazla başarısız deneme. 15 dakika sonra tekrar deneyin.', code: 'TOO_MANY_ATTEMPTS' };
  }
  if (current && current.resetAt <= now) loginAttempts.delete(key);

  const row = findUserByUsername(username);
  const passwordValid = await verifyPassword(password, row?.password_hash || dummyPasswordHash);
  if (!row || !passwordValid) {
    const next = loginAttempts.get(key) || { count: 0, resetAt: now + 15 * 60_000 };
    next.count += 1;
    loginAttempts.set(key, next);
    return { ok: false, status: 401, message: 'Kullanıcı adı veya şifre hatalı.', code: 'INVALID_CREDENTIALS' };
  }

  loginAttempts.delete(key);
  return { ok: true, user: toUser(row) };
}

export function createUser(input: { username: string; displayName: string; password: string; role: UserRole; storageQuotaMb: number }) {
  const id = randomUUID();
  const timestamp = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO users (id, username, display_name, password_hash, role, storage_quota_mb, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.username, input.displayName, hashPassword(input.password), input.role, input.storageQuotaMb, timestamp, timestamp);
  return toUser(findUserById(id)!);
}

export function listUsers() {
  return (getDb().prepare(`
    SELECT * FROM users ORDER BY CASE role WHEN 'superadmin' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, username COLLATE NOCASE
  `).all() as UserRow[]).map(toUser);
}

export function updateUser(id: string, input: { username?: string; displayName?: string; password?: string; role?: UserRole; avatarStoredName?: string | null; storageQuotaMb?: number }) {
  const assignments: string[] = [];
  const values: unknown[] = [];
  const mapping: Array<[keyof typeof input, string, (value: unknown) => unknown]> = [
    ['username', 'username', (value) => value],
    ['displayName', 'display_name', (value) => value],
    ['password', 'password_hash', (value) => hashPassword(String(value))],
    ['role', 'role', (value) => value],
    ['avatarStoredName', 'avatar_stored_name', (value) => value],
    ['storageQuotaMb', 'storage_quota_mb', (value) => value],
  ];
  for (const [key, column, transform] of mapping) {
    if (input[key] !== undefined) { assignments.push(`${column} = ?`); values.push(transform(input[key])); }
  }
  if (input.password !== undefined) assignments.push('must_change_password = 0');
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
