import { config } from "dotenv";
import { Pool } from "pg";
import { validateYouTubeDatabaseConfig } from "../lib/youtube-maintenance-config";
import { readYouTubeInventory } from "../lib/youtube-inventory";
config({ quiet: true });
async function main() {
  validateYouTubeDatabaseConfig();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1,
    connectionTimeoutMillis: 5000, statement_timeout: 30000,
    ssl: new URL(process.env.DATABASE_URL!).searchParams.get("sslmode") === "disable" ? false : { rejectUnauthorized: false } });
  pool.on("error", () => { console.error("YouTube inventory database failure."); process.exitCode = 1; });
  try {
    const client = await pool.connect();
    try { console.log(JSON.stringify(await readYouTubeInventory(client))); }
    finally { client.release(); }
  } finally { await pool.end(); }
}
main().catch(() => { console.error("YouTube inventory failed."); process.exitCode = 1; });
