import { NextResponse } from 'next/server';
import { authenticateCredentials, createMobileSession, getCurrentUser, revokeSessionToken } from '@/lib/auth';
import { handleApiError } from '@/lib/api';
import { MOBILE_API_VERSION } from '@/lib/server-info';
import { parseBearerAuthorization } from '@/lib/session-token';
import { mobileLoginSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function mobileError(message: string, status: number, code: string) {
  return NextResponse.json({ error: message, code }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function mobileHttpsAllowed(request: Request) {
  if (process.env.SUUR_ALLOW_INSECURE_MOBILE === 'true') return true;
  const publicUrl = process.env.SUUR_PUBLIC_URL || '';
  const requestUrl = new URL(request.url);
  return publicUrl.startsWith('https://')
    || requestUrl.protocol === 'https:'
    || ['localhost', '127.0.0.1', '::1'].includes(requestUrl.hostname);
}

export async function POST(request: Request) {
  try {
    if (!mobileHttpsAllowed(request)) {
      return mobileError('Mobil oturumlar için HTTPS gereklidir.', 426, 'HTTPS_REQUIRED');
    }
    const input = mobileLoginSchema.parse(await request.json());
    const result = await authenticateCredentials(request, input.username, input.password);
    if (!result.ok) return mobileError(result.message, result.status, result.code);
    const session = createMobileSession(result.user.id, `${input.deviceName} · ${input.platform} · ${input.clientVersion}`);
    return NextResponse.json({
      token: session.token,
      tokenType: 'Bearer',
      expiresAt: session.expiresAt,
      apiVersion: MOBILE_API_VERSION,
      user: result.user,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET() {
  const user = await getCurrentUser();
  return user
    ? NextResponse.json({ user, apiVersion: MOBILE_API_VERSION }, { headers: { 'Cache-Control': 'no-store' } })
    : mobileError('Oturum açmanız gerekiyor.', 401, 'UNAUTHORIZED');
}

export function DELETE(request: Request) {
  const token = parseBearerAuthorization(request.headers.get('authorization'));
  if (!token) return mobileError('Oturum açmanız gerekiyor.', 401, 'UNAUTHORIZED');
  revokeSessionToken(token);
  return NextResponse.json({ signedOut: true }, { headers: { 'Cache-Control': 'no-store' } });
}
