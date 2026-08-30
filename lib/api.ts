import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getCurrentUser } from '@/lib/auth';

export function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

export function handleApiError(error: unknown) {
  if (error instanceof ZodError) return jsonError('Gönderilen veri geçersiz.', 422, error.flatten());
  if (error instanceof SyntaxError) return jsonError('Geçersiz JSON gövdesi.', 400);
  if (error instanceof Error && error.message.includes('UNIQUE constraint failed: labels.name')) {
    return jsonError('Bu etiket zaten var.', 409);
  }
  if (error instanceof Error && error.message.includes('UNIQUE constraint failed: users.username')) {
    return jsonError('Bu kullanıcı adı zaten kullanılıyor.', 409);
  }
  console.error(error);
  return jsonError('Beklenmeyen bir sunucu hatası oluştu.', 500);
}

export function mutationId(request: Request) {
  const value = request.headers.get('x-suur-mutation-id');
  return value && /^[a-zA-Z0-9_-]{1,100}$/.test(value) ? value : null;
}

export async function requireApiUser() {
  return getCurrentUser();
}

export function unauthorized() {
  return jsonError('Oturum açmanız gerekiyor.', 401);
}
