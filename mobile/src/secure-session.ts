import { Capacitor, registerPlugin } from '@capacitor/core';
import { normalizeServerUrl, type MobileSessionResponse } from '../../lib/mobile-client.ts';

export interface StoredMobileSession {
  serverUrl: string;
  serverId: string;
  serverName: string;
  apiVersion: number;
  token: string;
  expiresAt: string;
  user: MobileSessionResponse['user'];
}

interface NativeSecureSessionPlugin {
  save(options: { value: string }): Promise<void>;
  load(): Promise<{ value: string | null }>;
  clear(): Promise<void>;
}

const NativeSecureSession = registerPlugin<NativeSecureSessionPlugin>('SuurSecureSession');
const WEB_SESSION_KEY = 'suur-mobile-development-session';

function parseSession(value: string | null): StoredMobileSession | null {
  if (!value) return null;
  try {
    const session = JSON.parse(value) as Partial<StoredMobileSession>;
    if (!session.serverId || !/^[A-Za-z0-9_-]{43}$/.test(session.token || '')) return null;
    if (!session.user?.id || !session.user.username || !Number.isInteger(session.apiVersion)) return null;
    return {
      ...session,
      serverUrl: normalizeServerUrl(session.serverUrl || ''),
    } as StoredMobileSession;
  } catch {
    return null;
  }
}

export async function loadMobileSession() {
  const value = Capacitor.isNativePlatform()
    ? (await NativeSecureSession.load()).value
    : sessionStorage.getItem(WEB_SESSION_KEY);
  return parseSession(value);
}

export async function saveMobileSession(session: StoredMobileSession) {
  const value = JSON.stringify(session);
  if (Capacitor.isNativePlatform()) await NativeSecureSession.save({ value });
  else sessionStorage.setItem(WEB_SESSION_KEY, value);
}

export async function clearMobileSession() {
  if (Capacitor.isNativePlatform()) await NativeSecureSession.clear();
  else sessionStorage.removeItem(WEB_SESSION_KEY);
}
