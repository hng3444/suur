import type { AppSettings, Label, Note } from './types.ts';

export const MOBILE_API_VERSION = 2;
export const MOBILE_SYNC_PAGE_LIMIT = 200;
export const MOBILE_SYNC_MAX_PAGE_LIMIT = 500;

export type SyncEntityType = 'note' | 'label' | 'settings';
export type SyncOperation = 'upsert' | 'delete';

export interface MobileSyncChange {
  cursor: number;
  entity: SyncEntityType;
  id: string;
  operation: SyncOperation;
  data: Note | Label | AppSettings | null;
}

interface MobileSyncIdentity {
  serverId: string;
  userId: string;
  apiVersion: typeof MOBILE_API_VERSION;
  generatedAt: string;
}

export interface MobileSyncSnapshot extends MobileSyncIdentity {
  mode: 'snapshot';
  cursor: number;
  notes: Note[];
  labels: Label[];
  settings: AppSettings;
}

export interface MobileSyncDelta extends MobileSyncIdentity {
  mode: 'delta';
  fromCursor: number;
  cursor: number;
  hasMore: boolean;
  changes: MobileSyncChange[];
}

export type MobileSyncResponse = MobileSyncSnapshot | MobileSyncDelta;
