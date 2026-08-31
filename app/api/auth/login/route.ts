import { NextResponse } from 'next/server';
import { createSession, findUserByUsername, toUser, verifyPassword } from '@/lib/auth';
import { handleApiError, jsonError } from '@/lib/api';
import { loginSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const globalLimiter = globalThis as unknown as { suurLoginAttempts?: Map<string, { count: number; resetAt: number }> };
const attempts = globalLimiter.suurLoginAttempts ?? new Map();
globalLimiter.suurLoginAttempts = attempts;
const dummyPasswordHash = 'scrypt$16384$8$1$8cbb4e6c64380641afce209f81987bf9$9c23b68a76fc1922873c9f0a3b6b275a1ce02d3353a35a7a0bb88ac1c0cd3a7d870f24e7bd0ae9ae4e92768a44536ab1c739f36f86731323e0f65cf6c77dc282';

export async function POST(request: Request) {
  try {
    const input = loginSchema.parse(await request.json());
    const trustProxy = process.env.SUUR_TRUST_PROXY === 'true';
    const forwarded = trustProxy
      ? request.headers.get('cf-connecting-ip')
        || request.headers.get('x-real-ip')
        || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || 'proxy'
      : 'all-clients';
    const key = `${forwarded}:${input.username.toLocaleLowerCase('en-US')}`;
    const current = attempts.get(key);
    const now = Date.now();
    if (current && current.resetAt > now && current.count >= 5) {
      return jsonError('Çok fazla başarısız deneme. 15 dakika sonra tekrar deneyin.', 429);
    }
    if (current && current.resetAt <= now) attempts.delete(key);

    const row = findUserByUsername(input.username);
    const passwordValid = await verifyPassword(input.password, row?.password_hash || dummyPasswordHash);
    if (!row || !passwordValid) {
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
