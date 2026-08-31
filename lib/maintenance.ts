import 'server-only';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { listUsers } from '@/lib/auth';
import { uploadsDirectory } from '@/lib/db';
import { automaticBackupDue, createStoredBackup } from '@/lib/portable';
import { deleteExpiredTrash, getSettings } from '@/lib/repository';

export async function runMaintenanceForUser(userId: string) {
  const settings = getSettings(userId);
  const cutoff = new Date(Date.now() - settings.trashRetentionDays * 86_400_000).toISOString();
  const cleanup = deleteExpiredTrash(userId, cutoff);
  await Promise.all(cleanup.storedNames.map((name) => unlink(path.join(uploadsDirectory(), name)).catch(() => undefined)));
  const backup = await automaticBackupDue(userId) ? await createStoredBackup(userId) : null;
  return { deleted: cleanup.deleted, backup };
}

export async function runMaintenanceForAllUsers() {
  const results = [];
  for (const user of listUsers()) {
    try { results.push({ userId: user.id, ...(await runMaintenanceForUser(user.id)) }); }
    catch (error) { console.error(`Suur maintenance failed for user ${user.id}:`, error); }
  }
  return results;
}

const maintenanceGlobal = globalThis as unknown as { suurMaintenanceTimer?: ReturnType<typeof setInterval>; suurMaintenanceStart?: ReturnType<typeof setTimeout> };

export function startMaintenanceScheduler() {
  if (maintenanceGlobal.suurMaintenanceTimer) return;
  const configuredMinutes = Number(process.env.SUUR_MAINTENANCE_INTERVAL_MINUTES || 60);
  const interval = Math.max(5, Number.isFinite(configuredMinutes) ? configuredMinutes : 60) * 60_000;
  maintenanceGlobal.suurMaintenanceStart = setTimeout(() => void runMaintenanceForAllUsers(), 10_000);
  maintenanceGlobal.suurMaintenanceStart.unref?.();
  maintenanceGlobal.suurMaintenanceTimer = setInterval(() => void runMaintenanceForAllUsers(), interval);
  maintenanceGlobal.suurMaintenanceTimer.unref?.();
}
