import { NextResponse } from 'next/server';
import { authenticateCredentials, createSession } from '@/lib/auth';
import { handleApiError, jsonError } from '@/lib/api';
import { loginSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const input = loginSchema.parse(await request.json());
    const result = await authenticateCredentials(request, input.username, input.password);
    if (!result.ok) return jsonError(result.message, result.status, { code: result.code });
    await createSession(result.user.id);
    return NextResponse.json({ user: result.user });
  } catch (error) {
    return handleApiError(error);
  }
}
