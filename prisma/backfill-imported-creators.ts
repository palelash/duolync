/**
 * Backfill: Imported Creator Provenance Fields
 *
 * Reads a reviewed mapping CSV (produced by prisma/generate-import-candidates.ts)
 * and sets the provenance fields on User + CreatorProfile rows that have been
 * confirmed as imported/synthetic records.
 *
 * Default mode is DRY RUN — no database writes are made.
 * Pass --apply to write changes.
 *
 * Usage:
 *   # Dry run (default):
 *   pnpm tsx prisma/backfill-imported-creators.ts --mapping=tmp/imported-creators-review.csv
 *
 *   # Write mode (requires explicit approval first):
 *   pnpm tsx prisma/backfill-imported-creators.ts --mapping=tmp/imported-creators-review.csv --apply
 *
 * Only AUTO_SAFE rows in the mapping file are processed.
 * REVIEW_REQUIRED and EXCLUDED rows are always skipped.
 *
 * Fields written:
 *   User.isImported                     = true
 *   CreatorProfile.profileOrigin        = IMPORTED
 *   CreatorProfile.claimStatus          = UNCLAIMED
 *   CreatorProfile.importedEmail        = resolvedSourceEmail from mapping
 *   CreatorProfile.importedAt           = current timestamp (backfill run time)
 *   CreatorProfile.importBatchId        = derived from sourceCsv field
 *
 * Fields NOT modified:
 *   Account rows, passwords, socialLinks, followerCount, engagementRate,
 *   moderationStatus, PlatformToken, PlatformStats, SocialPost, verification state
 *
 * Rollback:
 *   Run prisma/rollback-imported-creators.ts with the same mapping file.
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { PrismaClient } from "../lib/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { config } from "dotenv";

config();

// ─── Bootstrap ────────────────────────────────────────────────────────────────

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
  max: 3,
});
const adapter = new PrismaPg(pool);
const db = new PrismaClient({ adapter });

// ─── Argument parsing ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const applyMode = args.includes("--apply");
const mappingArg = args.find((a) => a.startsWith("--mapping="));
const mappingPath = mappingArg ? resolve(process.cwd(), mappingArg.replace("--mapping=", "")) : null;

// ─── CSV parsing ──────────────────────────────────────────────────────────────

interface MappingRow {
  userId: string;
  currentEmail: string;
  resolvedSourceEmail: string;
  sourceCsv: string;
  sourceRow: string;
  sourceName: string;
  matchReason: string;
  emailVerified: string;
  hasCompletedOnboarding: string;
  hasSession: string;
  hasPlatformToken: string;
  hasCreatorProfile: string;
  createdAt: string;
  reviewStatus: string;
  reviewNotes: string;
}

function parseMappingCsv(raw: string): MappingRow[] {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const header = lines[0].split(",");
  const idx = (name: string) => header.indexOf(name);

  return lines.slice(1).map((line) => {
    // Simple split — fields in this CSV should not contain commas inside quotes
    // given how generate-import-candidates.ts escapes them, but handle it defensively
    const cols: string[] = [];
    let inQuote = false;
    let cur = "";
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = !inQuote;
        }
      } else if (ch === "," && !inQuote) {
        cols.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    cols.push(cur);

    return {
      userId: cols[idx("userId")] ?? "",
      currentEmail: cols[idx("currentEmail")] ?? "",
      resolvedSourceEmail: cols[idx("resolvedSourceEmail")] ?? "",
      sourceCsv: cols[idx("sourceCsv")] ?? "",
      sourceRow: cols[idx("sourceRow")] ?? "",
      sourceName: cols[idx("sourceName")] ?? "",
      matchReason: cols[idx("matchReason")] ?? "",
      emailVerified: cols[idx("emailVerified")] ?? "",
      hasCompletedOnboarding: cols[idx("hasCompletedOnboarding")] ?? "",
      hasSession: cols[idx("hasSession")] ?? "",
      hasPlatformToken: cols[idx("hasPlatformToken")] ?? "",
      hasCreatorProfile: cols[idx("hasCreatorProfile")] ?? "",
      createdAt: cols[idx("createdAt")] ?? "",
      reviewStatus: cols[idx("reviewStatus")] ?? "",
      reviewNotes: cols[idx("reviewNotes")] ?? "",
    };
  });
}

// ─── Safety re-check ──────────────────────────────────────────────────────────

interface SafetyCheckResult {
  safe: boolean;
  reason: string;
  // User.createdAt from the live DB row — used as the defensible importedAt value
  userCreatedAt: Date | null;
}

async function reCheckSafety(userId: string): Promise<SafetyCheckResult> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      createdAt: true,
      emailVerified: true,
      hasCompletedOnboarding: true,
      sessions: { select: { id: true }, take: 1 },
      platformTokens: { select: { id: true }, take: 1 },
    },
  });

  if (!user) {
    return { safe: false, reason: "User row no longer exists", userCreatedAt: null };
  }

  if (user.emailVerified) {
    return { safe: false, reason: "emailVerified is now true — user may have registered", userCreatedAt: null };
  }
  if (user.hasCompletedOnboarding) {
    return { safe: false, reason: "hasCompletedOnboarding is now true — user may have onboarded", userCreatedAt: null };
  }
  if (user.sessions.length > 0) {
    return { safe: false, reason: "User now has Session rows — user may have signed in", userCreatedAt: null };
  }
  if (user.platformTokens.length > 0) {
    return { safe: false, reason: "User now has PlatformToken rows — user may have connected OAuth", userCreatedAt: null };
  }

  return { safe: true, reason: "All safety conditions confirmed", userCreatedAt: user.createdAt };
}

// ─── Batch ID derivation ──────────────────────────────────────────────────────

function deriveBatchId(sourceCsv: string): string {
  if (sourceCsv.includes("-1.csv") || sourceCsv.includes("v2") || sourceCsv.includes("YouTube")) {
    return "csv-v2-2026";
  }
  return "csv-v1-2026";
}

// ─── importedEmail trust gate ─────────────────────────────────────────────────
// Conservative filter: only preserve values that look like real contact emails.
// Intentionally not full RFC validation — just enough to exclude:
//   - Empty / missing values
//   - Human-readable notes ("Booking email in bio", "DM for collabs", etc.)
//   - Placeholder domain (@import.nexly.internal), including p/<post-id> variants
//   - Values with whitespace
//   - Values with multiple or no @ characters
//
// User.email is never touched — this gate only controls what goes into
// CreatorProfile.importedEmail for future claim-flow matching.

function isTrustableImportedEmail(value: string | null | undefined): boolean {
  if (!value) return false;
  // Reject anything with whitespace — catches "Booking email in bio" etc.
  if (/\s/.test(value)) return false;
  // Must contain exactly one @
  const atIdx = value.indexOf("@");
  if (atIdx < 1) return false;
  if (atIdx !== value.lastIndexOf("@")) return false;
  const local = value.slice(0, atIdx);
  const domain = value.slice(atIdx + 1);
  if (!local || !domain) return false;
  // Reject placeholder domain regardless of local part
  if (domain === "import.nexly.internal") return false;
  return true;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Imported Creator Backfill");
  console.log(`  Mode: ${applyMode ? "⚠️  WRITE (--apply)" : "✅  DRY RUN (default)"}`);
  console.log("═══════════════════════════════════════════════════════\n");

  if (!mappingPath) {
    console.error("❌  --mapping=<path> is required.\n");
    console.error("    Example:");
    console.error("    pnpm tsx prisma/backfill-imported-creators.ts --mapping=tmp/imported-creators-review.csv\n");
    process.exit(1);
  }

  if (!existsSync(mappingPath)) {
    console.error(`❌  Mapping file not found: ${mappingPath}\n`);
    console.error("    Run prisma/generate-import-candidates.ts first.\n");
    process.exit(1);
  }

  const raw = readFileSync(mappingPath, "utf-8");
  const rows = parseMappingCsv(raw);

  console.log(`📄  Mapping file: ${mappingPath}`);
  console.log(`    Total rows: ${rows.length}\n`);

  // ── Filter to AUTO_SAFE only ───────────────────────────────────────────────
  const autoSafeRows = rows.filter((r) => r.reviewStatus === "AUTO_SAFE");
  const reviewRequiredRows = rows.filter((r) => r.reviewStatus === "REVIEW_REQUIRED");
  const excludedRows = rows.filter((r) => r.reviewStatus === "EXCLUDED");
  const otherRows = rows.filter(
    (r) =>
      r.reviewStatus !== "AUTO_SAFE" &&
      r.reviewStatus !== "REVIEW_REQUIRED" &&
      r.reviewStatus !== "EXCLUDED"
  );

  console.log(`  Candidates:        ${rows.length}`);
  console.log(`  AUTO_SAFE:         ${autoSafeRows.length}  ← will be processed`);
  console.log(`  REVIEW_REQUIRED:   ${reviewRequiredRows.length}  ← skipped`);
  console.log(`  EXCLUDED:          ${excludedRows.length}  ← skipped`);
  console.log(`  Other/unknown:     ${otherRows.length}  ← skipped\n`);

  if (autoSafeRows.length === 0) {
    console.log("ℹ️  No AUTO_SAFE rows to process. Exiting.\n");
    return;
  }

  // ── Process AUTO_SAFE rows ─────────────────────────────────────────────────
  let updated = 0;
  let skippedSafety = 0;
  let skippedMissing = 0;
  let errors = 0;
  let importedEmailNonNull = 0;
  let importedEmailNull = 0;

  for (const row of autoSafeRows) {
    const { userId, resolvedSourceEmail, sourceCsv, sourceName } = row;

    if (!userId || userId === "N/A") {
      skippedMissing++;
      console.log(`  ⊘  Skipped (no userId): ${sourceName}`);
      continue;
    }

    // Re-verify User still exists and CreatorProfile is present
    const profile = await db.creatorProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!profile) {
      skippedMissing++;
      console.log(`  ⊘  Skipped (no CreatorProfile): ${userId} / ${sourceName}`);
      continue;
    }

    // Re-check activity signals against live DB
    const safety = await reCheckSafety(userId);
    if (!safety.safe) {
      skippedSafety++;
      console.log(`  ⚠️  Safety check failed — skipping: ${userId} / ${sourceName}`);
      console.log(`      Reason: ${safety.reason}`);
      continue;
    }

    const batchId = deriveBatchId(sourceCsv);
    const trustedEmail = isTrustableImportedEmail(resolvedSourceEmail)
      ? resolvedSourceEmail
      : null;

    if (applyMode) {
      try {
        await db.$transaction([
          db.user.update({
            where: { id: userId },
            data: { isImported: true },
          }),
          db.creatorProfile.update({
            where: { userId },
            data: {
              profileOrigin: "IMPORTED",
              claimStatus: "UNCLAIMED",
              importedEmail: trustedEmail,
              importedAt: safety.userCreatedAt,
              importBatchId: batchId,
            },
          }),
        ]);
        updated++;
        if (trustedEmail) importedEmailNonNull++; else importedEmailNull++;
        console.log(`  ✓  Updated: ${userId} / ${sourceName}`);
      } catch (err) {
        errors++;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ✗  Error updating ${userId} / ${sourceName}: ${msg}`);
      }
    } else {
      // Dry run — log what would happen
      updated++;
      if (trustedEmail) importedEmailNonNull++; else importedEmailNull++;
      console.log(`  [DRY RUN] Would update: ${userId} / ${sourceName}`);
      console.log(`            User.isImported = true`);
      console.log(`            CreatorProfile.profileOrigin = IMPORTED`);
      console.log(`            CreatorProfile.claimStatus = UNCLAIMED`);
      console.log(`            CreatorProfile.importedEmail = ${trustedEmail ?? "null"}${trustedEmail ? "" : "  ← filtered by trust gate"}`);
      console.log(`            CreatorProfile.importedAt = ${safety.userCreatedAt?.toISOString() ?? "null"}  ← User.createdAt`);
      console.log(`            CreatorProfile.importBatchId = ${batchId}`);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════");
  if (applyMode) {
    console.log("✅  Backfill complete\n");
  } else {
    console.log("✅  Dry run complete — no changes written\n");
    console.log("    To apply, re-run with --apply after reviewing the output above.\n");
  }
  console.log(`  Candidate rows:        ${autoSafeRows.length}`);
  console.log(`  ${applyMode ? "Updated" : "Would update"}:             ${updated}`);
  console.log(`  Skipped (safety):      ${skippedSafety}`);
  console.log(`  Skipped (not found):   ${skippedMissing}`);
  console.log(`  Errors:                ${errors}`);
  console.log(`  importedEmail non-null: ${importedEmailNonNull}  ← trusted real emails`);
  console.log(`  importedEmail null:     ${importedEmailNull}  ← placeholders / notes / post URLs`);
  console.log(`  REVIEW_REQUIRED rows:  ${reviewRequiredRows.length}  ← require manual decision`);
  console.log(`  EXCLUDED rows:         ${excludedRows.length}  ← test/seed, untouched`);

  if (reviewRequiredRows.length > 0) {
    console.log("\n⚠️  REVIEW_REQUIRED rows (manual action needed before these can be processed):");
    for (const r of reviewRequiredRows) {
      console.log(`    userId=${r.userId}  email=${r.currentEmail}  notes=${r.reviewNotes}`);
    }
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
