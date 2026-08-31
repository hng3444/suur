export type SyncDecision = 'complete' | 'conflict' | 'pause-auth' | 'pause-invalid' | 'retry';

export function syncDecision(status: number): SyncDecision {
  if (status >= 200 && status < 300) return 'complete';
  if (status === 409) return 'conflict';
  if (status === 401 || status === 403) return 'pause-auth';
  if (status >= 400 && status < 500) return 'pause-invalid';
  return 'retry';
}
