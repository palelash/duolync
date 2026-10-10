import { config } from "dotenv";

// Environment must be ready before dynamic imports instantiate either pool.
config({ quiet: true });

async function main() {
  let closeDatabase: (() => Promise<void>) | undefined;
  try {
    if (!process.env.DATABASE_URL) throw new Error("missing_database_configuration");
    const database = await import("../lib/db");
    closeDatabase = database.closeDatabase;
    const { runYouTubeMaintenance } = await import("../lib/youtube-maintenance");
    const summary = await runYouTubeMaintenance();
    console.log(JSON.stringify(summary));
    if (summary.itemErrors) process.exitCode = 1;
  } catch {
    console.error("YouTube maintenance run failed.");
    process.exitCode = 1;
  } finally {
    try { await closeDatabase?.(); }
    catch { console.error("YouTube maintenance shutdown failed."); process.exitCode = 1; }
  }
}
void main();
