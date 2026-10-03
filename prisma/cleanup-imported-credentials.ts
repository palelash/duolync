/**
 * Cleanup: Imported Creator Credential Account Rows
 *
 * Identifies and optionally deletes credential Account rows that belong to
 * placeholder (isImported=true) User rows. These rows have hashed password
 * entries that were auto-created by the import pipeline or by Better Auth
 * when placeholder users were set up. Removing them ensures placeholder users
 * cannot authenticate via email/password even if the hash is somehow known.
 *
 * Safety checks before any deletion:
 *   - User.isImported = true  (re-verified at delete time, not just at scan time)
 *   - User.emailVerified = false  (real users have verified email; placeholders do not)
 *   - No active Session rows for that User  (sessions imply someone authenticated)
 *
 * Fields targeted:
 *   Account rows where:
 *     - Account.providerId = 'credential'
 *     - Account.userId → User.isImported = true
 *
 * Default: DRY RUN — prints affected rows, makes no writes.
 * Pass --apply to delete.
 *
 * Usage:
 *   # Dry run (default — safe to run any time):
 *   pnpm tsx prisma/cleanup-imported-credentials.ts
 *
 *   # Apply (deletes credential rows for confirmed placeholder users):
 *   pnpm tsx prisma/cleanup-imported-credentials.ts --apply
 *
 * Never run --apply against production without reviewing the dry-run output first.
 * Never targets registered user accounts (isImported=false).
 */

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

const args = process.argv.slice(2);
const applyMode = args.includes("--apply");

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log("");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(" Cleanup: Imported Creator Credential Accounts");
  console.log(` Mode: ${applyMode ? "APPLY (will delete rows)" : "DRY RUN (no writes)"}`);
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");

  // ── Step 1: Find candidate credential Account rows ─────────────────────────
  const candidates = await db.account.findMany({
    where: {
      providerId: "credential",
      user: {
        isImported: true,
      },
    },
    select: {
      id: true,
      userId: true,
      accountId: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          isImported: true,
          emailVerified: true,
          _count: { select: { sessions: true } },
        },
      },
    },
  });

  console.log(`Found ${candidates.length} candidate credential Account row(s) for imported users.\n`);

  if (candidates.length === 0) {
    console.log("Nothing to do.");
    await cleanup();
    return;
  }

  // ── Step 2: Apply safety filters ──────────────────────────────────────────
  const toDelete: typeof candidates = [];
  const skipped: { account: (typeof candidates)[0]; reason: string }[] = [];

  for (const account of candidates) {
    const user = account.user;

    // Re-verify safety conditions
    if (!user.isImported) {
      skipped.push({ account, reason: "User.isImported is false — not a placeholder user" });
      continue;
    }
    if (user.emailVerified) {
      skipped.push({ account, reason: "User.emailVerified is true — may be a real user, skipping" });
      continue;
    }
    if (user._count.sessions > 0) {
      skipped.push({ account, reason: `User has ${user._count.sessions} active session(s) — skipping` });
      continue;
    }

    toDelete.push(account);
  }

  // ── Step 3: Report ────────────────────────────────────────────────────────
  if (toDelete.length > 0) {
    console.log(`✅ Safe to delete: ${toDelete.length} Account row(s)`);
    console.log("");
    for (const account of toDelete) {
      console.log(
        `  Account ${account.id}  userId=${account.user.id}  email=${account.user.email}  name=${account.user.name ?? "(none)"}  created=${account.createdAt.toISOString().slice(0, 10)}`,
      );
    }
  }

  if (skipped.length > 0) {
    console.log("");
    console.log(`⚠️  Skipped: ${skipped.length} Account row(s)`);
    for (const { account, reason } of skipped) {
      console.log(`  Account ${account.id}  userId=${account.user.id}  email=${account.user.email}  — ${reason}`);
    }
  }

  // ── Step 4: Delete (apply mode only) ──────────────────────────────────────
  if (!applyMode) {
    console.log("");
    console.log("DRY RUN complete. Pass --apply to delete the rows listed above.");
    console.log("Review the output carefully before applying.");
    await cleanup();
    return;
  }

  if (toDelete.length === 0) {
    console.log("\nNo rows to delete after safety checks.");
    await cleanup();
    return;
  }

  console.log("\nApplying deletions…");
  let deleted = 0;
  let errors = 0;

  for (const account of toDelete) {
    try {
      // Final safety re-check inside the delete loop
      const freshUser = await db.user.findUnique({
        where: { id: account.userId },
        select: {
          isImported: true,
          emailVerified: true,
          _count: { select: { sessions: true } },
        },
      });

      if (!freshUser) {
        console.log(`  SKIP  Account ${account.id} — user no longer exists`);
        continue;
      }
      if (!freshUser.isImported || freshUser.emailVerified || freshUser._count.sessions > 0) {
        console.log(`  SKIP  Account ${account.id} — safety condition changed since scan`);
        continue;
      }

      await db.account.delete({ where: { id: account.id } });
      console.log(`  DELETED  Account ${account.id}  userId=${account.userId}`);
      deleted++;
    } catch (err) {
      console.error(`  ERROR  Account ${account.id}: ${err instanceof Error ? err.message : String(err)}`);
      errors++;
    }
  }

  console.log("");
  console.log("─────────────────────────────────────");
  console.log(`Summary: ${deleted} deleted, ${errors} errors, ${skipped.length} skipped`);

  await cleanup();
}

async function cleanup() {
  await db.$disconnect();
  await pool.end();
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
