import { NextResponse } from 'next/server';
import { createSession, findUserByUsername, toUser, verifyPassword } from '@/lib/auth';
import { handleApiError, jsonError } from '@/lib/api';
import { loginSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const globalLimiter = globalThis as unknown as { suurLoginAttempts?: Map<string, { count: number; resetAt: number }> };
const attempts = globalLimiter.suurLoginAttempts ?? new Map();
globalLimiter.suurLoginAttempts = attempts;

export async function POST(request: Request) {
  try {
    const input = loginSchema.parse(await request.json());
    const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
    const key = `${forwarded}:${input.username.toLocaleLowerCase('en-US')}`;
    const current = attempts.get(key);
    const now = Date.now();
    if (current && current.resetAt > now && current.count >= 5) {
      return jsonError('Çok fazla başarısız deneme. 15 dakika sonra tekrar deneyin.', 429);
    }
    if (current && current.resetAt <= now) attempts.delete(key);

    const row = findUserByUsername(input.username);
    if (!row || !verifyPassword(input.password, row.password_hash)) {
      const next = attempts.get(key) || { count: 0, resetAt: now + 15 * 60_000 };
      next.count += 1;
      attempts.set(key, next);
      return jsonError('Kullanıcı adı veya şifre hatalı.', 401);
    }

    attempts.delete(key);
    await createSession(row.id);
    return NextResponse.json({ user: toUser(row) });
  } catch (error) {
    return handleApiError(error);
  }
}
