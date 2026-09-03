import 'server-only';
import { randomUUID } from 'node:crypto';
import packageJson from '@/package.json';
import { getDb } from '@/lib/db';
import { MOBILE_API_VERSION } from '@/lib/mobile-protocol';
import { getBranding } from '@/lib/repository';

export { MOBILE_API_VERSION } from '@/lib/mobile-protocol';
const SERVER_ID_KEY = 'system.mobile_server_id';

function serverId() {
  const database = getDb();
  const row = database.prepare('SELECT value_json FROM settings WHERE key = ?').get(SERVER_ID_KEY) as { value_json: string } | undefined;
  if (row) {
    try {
      const value = JSON.parse(row.value_json);
      if (typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value)) return value;
    } catch {
      // Replace a malformed internal value below.
    }
  }
  const value = randomUUID();
  database.prepare(`
    INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
  `).run(SERVER_ID_KEY, JSON.stringify(value), new Date().toISOString());
  return value;
}

export function getMobileServerInfo() {
  const configuredUploadMb = Number(process.env.MAX_UPLOAD_MB || 25);
  const uploadMb = Number.isFinite(configuredUploadMb) && configuredUploadMb > 0 ? configuredUploadMb : 25;
  return {
    service: 'suur',
    serverId: serverId(),
    name: getBranding().appName,
    version: packageJson.version,
    apiVersion: MOBILE_API_VERSION,
    apiBasePath: '/api',
    authentication: {
      type: 'bearer',
      sessionEndpoint: '/api/mobile/auth/session',
    },
    synchronization: {
      endpoint: '/api/mobile/sync',
      strategy: 'snapshot-delta',
    },
    capabilities: {
      notes: true,
      checklists: true,
      labels: true,
      attachments: true,
      reminders: true,
      noteHistory: true,
      mutationIds: true,
      offlineSync: true,
      deltaSync: true,
      sharing: true,
      userAssignment: true,
    },
    limits: {
      maxUploadBytes: Math.round(uploadMb * 1024 * 1024),
    },
    requiresHttps: true,
  } as const;
}
