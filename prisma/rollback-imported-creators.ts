/**
 * Rollback: Imported Creator Provenance Fields
 *
 * Resets ONLY the rows contained in the reviewed mapping file back to their
 * pre-backfill defaults. Does NOT globally update every creator row.
 *
 * Fields reset:
 *   User.isImported                     = false
 *   CreatorProfile.profileOrigin        = REGISTERED
 *   CreatorProfile.claimStatus          = NOT_APPLICABLE
 *   CreatorProfile.importedEmail        = null
 *   CreatorProfile.importedAt           = null
 *   CreatorProfile.importBatchId        = null
 *
 * Fields NOT touched:
 *   claimedByUserId, claimedAt, socialLinks, followerCount, moderationStatus,
 *   Account rows, passwords, PlatformToken, PlatformStats, SocialPost
 *
 * Usage:
 *   # Dry run (default):
 *   pnpm tsx prisma/rollback-imported-creators.ts --mapping=tmp/imported-creators-review.csv
 *
 *   # Write mode:
 *   pnpm tsx prisma/rollback-imported-creators.ts --mapping=tmp/imported-creators-review.csv --apply
 *
 * Note on schema rollback:
 *   After a successful data rollback, removing the added columns from production
 *   requires a new FORWARD migration that drops the fields. Never use
 *   `prisma migrate dev` or `prisma migrate reset` as a production rollback mechanism.
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { PrismaClient } from "../lib/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { config } from "dotenv";

config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
  max: 3,
});
const adapter = new PrismaPg(pool);
const db = new PrismaClient({ adapter });

const args = process.argv.slice(2);
const applyMode = args.includes("--apply");
const mappingArg = args.find((a) => a.startsWith("--mapping="));
const mappingPath = mappingArg ? resolve(process.cwd(), mappingArg.replace("--mapping=", "")) : null;

function parseMappingUserIds(raw: string): { userId: string; sourceName: string }[] {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = lines[0].split(",");
  const userIdIdx = header.indexOf("userId");
  const nameIdx = header.indexOf("sourceName");
  const statusIdx = header.indexOf("reviewStatus");
  return lines
    .slice(1)
    .map((line) => {
      const cols = line.split(",");
      return {
        userId: cols[userIdIdx] ?? "",
        sourceName: cols[nameIdx] ?? "",
        reviewStatus: cols[statusIdx] ?? "",
      };
    })
    .filter((r) => r.userId && r.userId !== "N/A" && r.reviewStatus === "AUTO_SAFE");
}

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Imported Creator ROLLBACK");
  console.log(`  Mode: ${applyMode ? "⚠️  WRITE (--apply)" : "✅  DRY RUN (default)"}`);
  console.log("═══════════════════════════════════════════════════════\n");

  if (!mappingPath) {
    console.error("❌  --mapping=<path> is required.\n");
    process.exit(1);
  }
  if (!existsSync(mappingPath)) {
    console.error(`❌  Mapping file not found: ${mappingPath}\n`);
    process.exit(1);
  }

  const rows = parseMappingUserIds(readFileSync(mappingPath, "utf-8"));
  console.log(`  Rows to rollback (AUTO_SAFE only): ${rows.length}\n`);

  let rolledBack = 0;
  let skipped = 0;
  let errors = 0;

  for (const { userId, sourceName } of rows) {
    const profile = await db.creatorProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!profile) {
      skipped++;
      console.log(`  ⊘  Skipped (no profile): ${userId} / ${sourceName}`);
      continue;
    }

    if (applyMode) {
      try {
        await db.$transaction([
          db.user.update({
            where: { id: userId },
            data: { isImported: false },
          }),
          db.creatorProfile.update({
            where: { userId },
            data: {
              profileOrigin: "REGISTERED",
              claimStatus: "NOT_APPLICABLE",
              importedEmail: null,
              importedAt: null,
              importBatchId: null,
            },
          }),
        ]);
        rolledBack++;
        console.log(`  ✓  Rolled back: ${userId} / ${sourceName}`);
      } catch (err) {
        errors++;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ✗  Error: ${userId} / ${sourceName}: ${msg}`);
      }
    } else {
      rolledBack++;
      console.log(`  [DRY RUN] Would rollback: ${userId} / ${sourceName}`);
      console.log(`            User.isImported = false`);
      console.log(`            CreatorProfile.profileOrigin = REGISTERED`);
      console.log(`            CreatorProfile.claimStatus = NOT_APPLICABLE`);
      console.log(`            CreatorProfile.importedEmail/importedAt/importBatchId = null`);
    }
  }

  console.log("\n═══════════════════════════════════════════════════════");
  console.log(applyMode ? "✅  Rollback complete\n" : "✅  Dry run complete — no changes written\n");
  console.log(`  ${applyMode ? "Rolled back" : "Would rollback"}:  ${rolledBack}`);
  console.log(`  Skipped:           ${skipped}`);
  console.log(`  Errors:            ${errors}`);

  if (!applyMode) {
    console.log("\n    Re-run with --apply to commit the rollback.");
  }
}

main()
  .catch((e) => {
    console.error("\n💥  Fatal:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
    await pool.end();
  });
