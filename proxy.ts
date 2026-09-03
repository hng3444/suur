import { NextResponse, type NextRequest } from 'next/server';
import { appCorsHeaders, isAllowedAppOrigin } from '@/lib/cors';
import { MOBILE_API_VERSION } from '@/lib/mobile-protocol';

export function proxy(request: NextRequest) {
  const origin = request.headers.get('origin');
  const allowed = isAllowedAppOrigin(origin);

  if (request.method === 'OPTIONS') {
    if (!origin || !allowed) {
      return NextResponse.json({ error: 'Origin is not allowed.', code: 'ORIGIN_NOT_ALLOWED' }, { status: 403 });
    }
    return new NextResponse(null, { status: 204, headers: { ...appCorsHeaders(origin), 'X-Suur-API-Version': String(MOBILE_API_VERSION) } });
  }

  const response = NextResponse.next();
  response.headers.set('X-Suur-API-Version', String(MOBILE_API_VERSION));
  if (origin && allowed) {
    for (const [key, value] of Object.entries(appCorsHeaders(origin))) response.headers.set(key, value);
  }
  return response;
}

export const config = { matcher: '/api/:path*' };
