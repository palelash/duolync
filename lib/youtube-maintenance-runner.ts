/** No raw result or exception is logged by this one-shot boundary. */
const outcomes = ["SUCCESS", "TEMPORARY_FAILURE", "AUTHORIZATION_LOST", "DEADLINE_PURGED", "QUOTA_EXHAUSTED",
  "CONFIGURATION_FAILURE", "SUPERSEDED", "NOT_CONNECTED", "PROVIDER_FAILURE", "IDENTITY_MISMATCH"] as const;
export type MaintenanceRunResult = {
  processed: number; outcomes: Partial<Record<(typeof outcomes)[number], number>>;
  quotaUsed: number; quotaBudget: number; itemErrors: number;
};
export async function executeYouTubeMaintenance(deps: {
  initialize: () => Promise<{ run: () => Promise<MaintenanceRunResult>; close: () => Promise<void> }>;
  log: (message: string) => void; error: (message: string) => void;
}): Promise<number> {
  const startedAt = new Date().toISOString();
  let close: (() => Promise<void>) | undefined, exitCode = 0;
  try {
    const initialized = await deps.initialize(); close = initialized.close;
    const result = await initialized.run();
    const counts = Object.fromEntries(outcomes.map(key => [key, result.outcomes[key] ?? 0]));
    deps.log(JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), selected: result.processed,
      processed: result.processed, outcomes: counts, quotaUsed: result.quotaUsed, quotaBudget: result.quotaBudget,
      itemErrors: result.itemErrors }));
    // Persisted item outcomes are healthy batch completion. Unpersisted errors
    // mean infrastructure failed; remaining leases will be recoverable.
    if (result.itemErrors) { deps.error("YouTube maintenance outcomes could not be persisted."); exitCode = 1; }
  } catch { deps.error("YouTube maintenance run failed."); exitCode = 1; }
  finally {
    try { await close?.(); }
    catch { deps.error("YouTube maintenance shutdown failed."); exitCode = 1; }
  }
  return exitCode;
}
