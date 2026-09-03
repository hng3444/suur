import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedAppOrigins, appCorsHeaders, isAllowedAppOrigin } from '../lib/cors.ts';
import { createRemoteMobileSession, discoverSuurServer, mobileAuthorization, mobileEndpoint, normalizeServerUrl } from '../lib/mobile-client.ts';
import { parseBearerAuthorization } from '../lib/session-token.ts';

test('Bearer tokens accept only the expected 256-bit base64url format', () => {
  const token = 'a'.repeat(43);
  assert.equal(parseBearerAuthorization(`Bearer ${token}`), token);
  assert.equal(parseBearerAuthorization(`bearer ${token}`), token);
  assert.equal(parseBearerAuthorization(`Basic ${token}`), null);
  assert.equal(parseBearerAuthorization('Bearer too-short'), null);
});

test('native app origins are allowed without opening CORS to arbitrary websites', () => {
  assert.equal(isAllowedAppOrigin('http://localhost'), true);
  assert.equal(isAllowedAppOrigin('capacitor://localhost'), true);
  assert.equal(isAllowedAppOrigin('https://malicious.example'), false);
  assert.equal(isAllowedAppOrigin('https://mobile.example', 'https://mobile.example'), true);
  assert.equal(allowedAppOrigins('*').has('*'), false);
});

test('CORS response exposes the API version but never enables credential cookies', () => {
  const headers = appCorsHeaders('http://localhost/');
  assert.equal(headers['Access-Control-Allow-Origin'], 'http://localhost');
  assert.match(headers['Access-Control-Allow-Headers'], /Authorization/);
  assert.equal('Access-Control-Allow-Credentials' in headers, false);
});

test('mobile server addresses default to HTTPS and preserve an optional base path', () => {
  assert.equal(normalizeServerUrl('notes.example.com/'), 'https://notes.example.com');
  assert.equal(normalizeServerUrl('https://example.com/suur/'), 'https://example.com/suur');
  assert.equal(mobileEndpoint('https://example.com/suur', '/api/mobile/server'), 'https://example.com/suur/api/mobile/server');
  assert.throws(() => normalizeServerUrl('http://notes.example.com'), /HTTPS_REQUIRED/);
  assert.equal(normalizeServerUrl('http://localhost:3000'), 'http://localhost:3000');
});

test('mobile server addresses reject embedded credentials and session headers validate tokens', () => {
  assert.throws(() => normalizeServerUrl('https://user:pass@example.com'), /INVALID_SERVER_URL/);
  assert.deepEqual(mobileAuthorization('a'.repeat(43)), { Authorization: `Bearer ${'a'.repeat(43)}` });
  assert.throws(() => mobileAuthorization('short'), /INVALID_SESSION_TOKEN/);
});

test('mobile discovery and sign-in never follow redirects or send browser cookies', async () => {
  const requests = [];
  const fetcher = async (url, options) => {
    requests.push({ url, options });
    if (String(url).endsWith('/api/mobile/server')) {
      return Response.json({
        service: 'suur', serverId: 'server-1', name: 'Suur', version: '0.2.0', apiVersion: 1,
        apiBasePath: '/api', authentication: { type: 'bearer', sessionEndpoint: '/api/mobile/auth/session' },
        capabilities: {}, limits: { maxUploadBytes: 1 }, requiresHttps: true,
      });
    }
    return Response.json({
      token: 'a'.repeat(43), tokenType: 'Bearer', expiresAt: new Date().toISOString(), apiVersion: 1,
      user: { id: 'u1', username: 'user', displayName: 'User', mustChangePassword: false },
    });
  };
  await discoverSuurServer('notes.example.com', fetcher);
  await createRemoteMobileSession({
    serverUrl: 'notes.example.com', username: 'user', password: 'secret', deviceName: 'Phone', platform: 'android', clientVersion: '0.2.0',
  }, fetcher);
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.options.credentials, 'omit');
    assert.equal(request.options.redirect, 'manual');
  }
});
