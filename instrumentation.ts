export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { startMaintenanceScheduler } = await import('@/lib/maintenance');
  startMaintenanceScheduler();
}
