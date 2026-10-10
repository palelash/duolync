/** Shared parsing for standalone operations and the maintenance service. */
export type YouTubeMaintenanceConfig = {
  batchSize?: number; concurrency?: number; itemLimit?: number; runLimitMs?: number;
  leaseMs?: number; quotaBudget?: number;
};
const limits = {
  batchSize: [50, 1, 100, "BATCH_SIZE"], concurrency: [3, 1, 10, "CONCURRENCY"],
  itemLimit: [200, 1, 10000, "ITEM_LIMIT"], runLimitMs: [300000, 1, 3600000, "RUN_LIMIT_MS"],
  leaseMs: [300000, 1000, 3600000, "LEASE_MS"], quotaBudget: [100, 0, 1000000, "QUOTA_BUDGET"],
} as const;
export function maintenanceInteger(value: number, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error("youtube_maintenance_invalid_config");
  return value;
}
export function maintenanceConfig(config: YouTubeMaintenanceConfig = {}, env = process.env) {
  const result = {} as Required<YouTubeMaintenanceConfig>;
  for (const key of Object.keys(limits) as (keyof typeof limits)[]) {
    const [fallback, min, max, suffix] = limits[key];
    const raw = env[`YOUTUBE_MAINTENANCE_${suffix}`];
    // Reject empty, fractional, exponent, hexadecimal and signed strings.
    if (config[key] === undefined && raw !== undefined && !/^\d+$/.test(raw)) throw new Error("youtube_maintenance_invalid_config");
    result[key] = maintenanceInteger(config[key] ?? (raw === undefined ? fallback : Number(raw)), min, max);
  }
  return result;
}
export function validateYouTubeDatabaseConfig(env = process.env) {
  let url: URL;
  try { url = new URL(env.DATABASE_URL ?? ""); } catch { throw new Error("youtube_database_invalid_config"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.pathname.length < 2)
    throw new Error("youtube_database_invalid_config");
}
export function validateYouTubeMaintenanceStartup(env = process.env) {
  validateYouTubeDatabaseConfig(env);
  // Dedicated YouTube credentials only: no Google login, cookies or session.
  if (!env.YOUTUBE_CLIENT_ID?.trim() || !env.YOUTUBE_CLIENT_SECRET?.trim()) throw new Error("youtube_oauth_invalid_config");
  return maintenanceConfig({}, env);
}
export function youtubeBackfillMode(args: string[]) {
  if (!args.length || (args.length === 1 && args[0] === "--plan")) return "--plan";
  if (args.length === 1 && args[0] === "--apply") return "--apply";
  throw new Error("youtube_backfill_invalid_mode");
}
