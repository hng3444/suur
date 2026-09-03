const BEARER_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function parseBearerAuthorization(value: string | null) {
  if (!value) return null;
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  if (!match || !BEARER_TOKEN_PATTERN.test(match[1])) return null;
  return match[1];
}

