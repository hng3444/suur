import { NextResponse } from 'next/server';
import { getCurrentMobileUser } from '@/lib/auth';
import { handleApiError } from '@/lib/api';
import { MOBILE_API_VERSION } from '@/lib/mobile-protocol';
import { getSyncChanges, getSyncSnapshot } from '@/lib/repository';
import { getMobileServerInfo } from '@/lib/server-info';
import { mobileSyncQuerySchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  try {
    const user = await getCurrentMobileUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Oturum açmanız gerekiyor.', code: 'UNAUTHORIZED' },
        { status: 401, headers: noStore },
      );
    }
    if (user.mustChangePassword) {
      return NextResponse.json(
        { error: 'Senkronizasyondan önce varsayılan şifre değiştirilmelidir.', code: 'PASSWORD_CHANGE_REQUIRED' },
        { status: 403, headers: noStore },
      );
    }

    const url = new URL(request.url);
    const query = mobileSyncQuerySchema.parse(Object.fromEntries(url.searchParams));
    const identity = {
      serverId: getMobileServerInfo().serverId,
      userId: user.id,
      apiVersion: MOBILE_API_VERSION,
      generatedAt: new Date().toISOString(),
    };

    if (query.cursor === undefined) {
      return NextResponse.json({ mode: 'snapshot', ...identity, ...getSyncSnapshot(user.id) }, { headers: noStore });
    }

    const delta = getSyncChanges(user.id, query.cursor, query.limit);
    if (delta.resetRequired) {
      return NextResponse.json(
        {
          mode: 'reset',
          ...identity,
          code: 'SYNC_RESET_REQUIRED',
          serverCursor: delta.serverCursor,
        },
        { status: 409, headers: noStore },
      );
    }
    return NextResponse.json({
      mode: 'delta',
      ...identity,
      fromCursor: query.cursor,
      cursor: delta.cursor,
      hasMore: delta.hasMore,
      changes: delta.changes,
    }, { headers: noStore });
  } catch (error) {
    return handleApiError(error);
  }
}

