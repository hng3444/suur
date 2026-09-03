export interface MobileServerInfo {
  service: 'suur';
  serverId: string;
  name: string;
  version: string;
  apiVersion: number;
  apiBasePath: string;
  authentication: { type: 'bearer'; sessionEndpoint: string };
  synchronization?: { endpoint: string; strategy: 'snapshot-delta' };
  capabilities: Record<string, boolean>;
  limits: { maxUploadBytes: number };
  requiresHttps: boolean;
}

export interface MobileSessionResponse {
  token: string;
  tokenType: 'Bearer';
  expiresAt: string;
  apiVersion: number;
  user: { id: string; username: string; displayName: string; mustChangePassword: boolean };
}

export function normalizeServerUrl(input: string, options: { allowInsecure?: boolean } = {}) {
  const raw = input.trim();
  if (!raw) throw new Error('SERVER_URL_REQUIRED');
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(withProtocol);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('INVALID_SERVER_URL');
  }
  const localHost = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !localHost && !options.allowInsecure) throw new Error('HTTPS_REQUIRED');
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}

export function mobileEndpoint(serverUrl: string, path: string) {
  const base = `${normalizeServerUrl(serverUrl, { allowInsecure: true })}/`;
  return new URL(path.replace(/^\//, ''), base).toString();
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as ({ error?: string; code?: string } & T) | null;
  if (!response.ok || !body) throw new Error(body?.code || body?.error || `HTTP_${response.status}`);
  return body;
}

export async function discoverSuurServer(serverUrl: string, fetcher: typeof fetch = fetch) {
  const baseUrl = normalizeServerUrl(serverUrl);
  const response = await fetcher(mobileEndpoint(baseUrl, '/api/mobile/server'), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'manual',
  });
  const info = await responseJson<MobileServerInfo>(response);
  if (info.service !== 'suur' || !info.serverId || !Number.isInteger(info.apiVersion)) throw new Error('INCOMPATIBLE_SERVER');
  return { baseUrl, info };
}

export async function createRemoteMobileSession(input: {
  serverUrl: string;
  username: string;
  password: string;
  deviceName: string;
  platform: 'android' | 'ios';
  clientVersion: string;
}, fetcher: typeof fetch = fetch) {
  const baseUrl = normalizeServerUrl(input.serverUrl);
  const response = await fetcher(mobileEndpoint(baseUrl, '/api/mobile/auth/session'), {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    credentials: 'omit',
    redirect: 'manual',
    body: JSON.stringify({
      username: input.username,
      password: input.password,
      deviceName: input.deviceName,
      platform: input.platform,
      clientVersion: input.clientVersion,
    }),
  });
  return { baseUrl, session: await responseJson<MobileSessionResponse>(response) };
}

export function mobileAuthorization(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('INVALID_SESSION_TOKEN');
  return { Authorization: `Bearer ${token}` };
}
