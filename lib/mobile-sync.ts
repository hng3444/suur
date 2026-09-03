import { mobileAuthorization, mobileEndpoint, normalizeServerUrl } from './mobile-client.ts';
import { MOBILE_API_VERSION, type MobileSyncDelta, type MobileSyncResponse, type MobileSyncSnapshot } from './mobile-protocol.ts';
import { compactOperations, type QueuedOperation } from './offline.ts';
import { syncDecision } from './sync-policy.ts';
import type { AppSettings, Label, Note } from './types.ts';

export type MobilePendingOperation = QueuedOperation;

export interface MobileLocalState {
  serverId: string;
  userId: string;
  cursor: number | null;
  notes: Note[];
  labels: Label[];
  settings: AppSettings | null;
}

export interface MobileSyncStore {
  readState(): Promise<MobileLocalState>;
  writeState(state: MobileLocalState): Promise<void>;
  readQueue(): Promise<MobilePendingOperation[]>;
  writeQueue(operations: MobilePendingOperation[]): Promise<void>;
}

export interface MobileSyncResult {
  state: MobileLocalState;
  pending: number;
  pushed: number;
  conflictCopies: number;
  online: boolean;
  authRequired: boolean;
  blocked: boolean;
}

export function createEmptyMobileState(serverId: string, userId: string): MobileLocalState {
  return { serverId, userId, cursor: null, notes: [], labels: [], settings: null };
}

function assertIdentity(state: MobileLocalState, response: MobileSyncResponse) {
  if (response.apiVersion !== MOBILE_API_VERSION) throw new Error('INCOMPATIBLE_SYNC_API');
  if (response.serverId !== state.serverId || response.userId !== state.userId) throw new Error('SYNC_IDENTITY_MISMATCH');
}

function upsert<T extends { id: string }>(items: T[], value: T) {
  const index = items.findIndex((item) => item.id === value.id);
  if (index < 0) return [value, ...items];
  const next = [...items];
  next[index] = value;
  return next;
}

export function applyMobileSnapshot(state: MobileLocalState, snapshot: MobileSyncSnapshot): MobileLocalState {
  assertIdentity(state, snapshot);
  return {
    ...state,
    cursor: snapshot.cursor,
    notes: snapshot.notes,
    labels: snapshot.labels,
    settings: snapshot.settings,
  };
}

export function applyMobileDelta(state: MobileLocalState, delta: MobileSyncDelta): MobileLocalState {
  assertIdentity(state, delta);
  if (state.cursor !== null && delta.fromCursor !== state.cursor) throw new Error('SYNC_CURSOR_MISMATCH');
  let notes = [...state.notes];
  let labels = [...state.labels];
  let settings = state.settings;

  for (const change of delta.changes) {
    if (change.entity === 'note') {
      if (change.operation === 'delete' || !change.data) notes = notes.filter((note) => note.id !== change.id);
      else notes = upsert(notes, change.data as Note);
      continue;
    }
    if (change.entity === 'label') {
      if (change.operation === 'delete' || !change.data) {
        labels = labels.filter((label) => label.id !== change.id);
        notes = notes.map((note) => ({ ...note, labels: note.labels.filter((label) => label.id !== change.id) }));
      } else {
        const label = change.data as Label;
        labels = upsert(labels, label);
        notes = notes.map((note) => ({
          ...note,
          labels: note.labels.map((item) => item.id === label.id ? label : item),
        }));
      }
      continue;
    }
    if (change.entity === 'settings' && change.operation === 'upsert' && change.data) {
      settings = change.data as AppSettings;
    }
  }
  return { ...state, cursor: delta.cursor, notes, labels, settings };
}

function responseBody(response: Response) {
  return response.json().catch(() => null) as Promise<Record<string, unknown> | null>;
}

async function pullPage(input: {
  baseUrl: string;
  token: string;
  cursor: number | null;
  fetcher: typeof fetch;
}) {
  const suffix = input.cursor === null ? '' : `?cursor=${encodeURIComponent(String(input.cursor))}`;
  const response = await input.fetcher(mobileEndpoint(input.baseUrl, `/api/mobile/sync${suffix}`), {
    method: 'GET',
    headers: { Accept: 'application/json', ...mobileAuthorization(input.token) },
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'manual',
  });
  const body = await responseBody(response);
  if (response.status === 409 && body?.code === 'SYNC_RESET_REQUIRED') return { reset: true as const };
  if (!response.ok || !body) throw new Error(String(body?.code || body?.error || `HTTP_${response.status}`));
  if (body.mode !== 'snapshot' && body.mode !== 'delta') throw new Error('INVALID_SYNC_RESPONSE');
  return { reset: false as const, response: body as unknown as MobileSyncResponse };
}

export async function pullMobileState(input: {
  serverUrl: string;
  token: string;
  state: MobileLocalState;
  fetcher?: typeof fetch;
}) {
  const baseUrl = normalizeServerUrl(input.serverUrl);
  const fetcher = input.fetcher || fetch;
  let state = input.state;
  let cursor = state.cursor;

  for (let page = 0; page < 1_000; page += 1) {
    let result = await pullPage({ baseUrl, token: input.token, cursor, fetcher });
    if (result.reset) {
      cursor = null;
      result = await pullPage({ baseUrl, token: input.token, cursor, fetcher });
      if (result.reset) throw new Error('SYNC_RESET_LOOP');
    }
    const response = result.response;
    state = response.mode === 'snapshot'
      ? applyMobileSnapshot(state, response)
      : applyMobileDelta(state, response);
    if (response.mode === 'snapshot' || !response.hasMore) return state;
    cursor = state.cursor;
  }
  throw new Error('SYNC_PAGE_LIMIT_EXCEEDED');
}

function safeOperation(operation: MobilePendingOperation) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(operation.id)) return false;
  if (operation.method === 'POST' && ['/api/notes', '/api/notes/reorder', '/api/labels'].includes(operation.url)) return true;
  if (operation.method === 'PATCH' && operation.url === '/api/settings') return true;
  return /^(PATCH|DELETE)$/.test(operation.method)
    && /^\/api\/(?:notes|labels)\/[A-Za-z0-9_-]{1,80}$/.test(operation.url);
}

async function sendOperation(baseUrl: string, token: string, operation: MobilePendingOperation, fetcher: typeof fetch) {
  if (!safeOperation(operation)) throw new Error('UNSAFE_QUEUED_OPERATION');
  const response = await fetcher(mobileEndpoint(baseUrl, operation.url), {
    method: operation.method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Suur-Mutation-Id': operation.id,
      ...mobileAuthorization(token),
    },
    body: operation.body === undefined ? undefined : JSON.stringify(operation.body),
    credentials: 'omit',
    redirect: 'manual',
  });
  return { response, body: await responseBody(response) };
}

export function createConflictCopy(operation: MobilePendingOperation): MobilePendingOperation | null {
  if (operation.method !== 'PATCH' || !/^\/api\/notes\/[A-Za-z0-9_-]{1,80}$/.test(operation.url)) return null;
  if (!operation.body || typeof operation.body !== 'object' || Array.isArray(operation.body)) return null;
  const safeId = operation.id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 65);
  if (!safeId) return null;
  const body = { ...(operation.body as Record<string, unknown>) };
  delete body.baseVersion;
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  body.id = `conflict_${safeId}`.slice(0, 80);
  body.title = `${title || 'Offline note'} (offline copy)`.slice(0, 500);
  body.assignedUserId = null;
  return {
    id: `conflict_${safeId}`.slice(0, 100),
    method: 'POST',
    url: '/api/notes',
    body,
    createdAt: operation.createdAt,
  };
}

async function pushMobileQueue(input: {
  baseUrl: string;
  token: string;
  store: MobileSyncStore;
  fetcher: typeof fetch;
}) {
  const queue = compactOperations(await input.store.readQueue());
  let pushed = 0;
  let conflictCopies = 0;
  let authRequired = false;
  let blocked = false;
  let online = true;
  let remaining = [...queue];

  for (let index = 0; index < queue.length; index += 1) {
    const operation = queue[index];
    try {
      let { response } = await sendOperation(input.baseUrl, input.token, operation, input.fetcher);
      if (response.status === 409) {
        const conflictCopy = createConflictCopy(operation);
        if (conflictCopy) {
          const conflictResult = await sendOperation(input.baseUrl, input.token, conflictCopy, input.fetcher);
          response = conflictResult.response;
          if (response.ok) conflictCopies += 1;
          else remaining = [conflictCopy, ...queue.slice(index + 1)];
        }
      }
      const decision = syncDecision(response.status);
      if (decision === 'complete' || (operation.method === 'DELETE' && response.status === 404)) {
        pushed += 1;
        remaining = queue.slice(index + 1);
        continue;
      }
      if (decision === 'pause-auth') authRequired = true;
      else if (decision === 'pause-invalid' || decision === 'conflict') blocked = true;
      else online = false;
      if (!remaining.length) remaining = queue.slice(index);
      break;
    } catch (error) {
      if (error instanceof TypeError) online = false;
      else blocked = true;
      remaining = queue.slice(index);
      break;
    }
  }
  await input.store.writeQueue(remaining);
  return { pending: remaining.length, pushed, conflictCopies, online, authRequired, blocked };
}

export async function runMobileSync(input: {
  serverUrl: string;
  token: string;
  store: MobileSyncStore;
  fetcher?: typeof fetch;
}): Promise<MobileSyncResult> {
  const fetcher = input.fetcher || fetch;
  const baseUrl = normalizeServerUrl(input.serverUrl);
  const queueResult = await pushMobileQueue({ baseUrl, token: input.token, store: input.store, fetcher });
  let state = await input.store.readState();
  // A server snapshot must never replace optimistic local data while an operation
  // is still waiting. Once the durable queue is empty, the server view is safe to
  // apply and becomes the new local baseline.
  if (queueResult.pending === 0 && queueResult.online && !queueResult.authRequired) {
    try {
      state = await pullMobileState({ serverUrl: baseUrl, token: input.token, state, fetcher });
      await input.store.writeState(state);
    } catch (error) {
      if (error instanceof TypeError) queueResult.online = false;
      else if (error instanceof Error && ['UNAUTHORIZED', 'PASSWORD_CHANGE_REQUIRED'].includes(error.message)) queueResult.authRequired = true;
      else queueResult.blocked = true;
    }
  }
  return { state, ...queueResult };
}
