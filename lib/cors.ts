export const nativeAppOrigins = ['http://localhost', 'https://localhost', 'capacitor://localhost'] as const;

function normalizeOrigin(value: string) {
  return value.trim().replace(/\/$/, '');
}

export function allowedAppOrigins(configured = process.env.SUUR_ALLOWED_APP_ORIGINS || '') {
  const extra = configured
    .split(',')
    .map(normalizeOrigin)
    .filter((origin) => origin && origin !== '*' && /^(https?:\/\/|capacitor:\/\/)[^/]+$/i.test(origin));
  return new Set([...nativeAppOrigins, ...extra]);
}

export function isAllowedAppOrigin(origin: string | null, configured?: string) {
  return Boolean(origin && allowedAppOrigins(configured).has(normalizeOrigin(origin)));
}

export function appCorsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': normalizeOrigin(origin),
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-Match, X-Suur-Mutation-Id',
    'Access-Control-Expose-Headers': 'X-Suur-API-Version',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

