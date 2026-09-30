/**
 * Import Candidate Generator
 *
 * Reads the same CSV source files used by prisma/import-creators.ts, reproduces
 * the script's email/placeholder identity logic, then matches those resolved
 * identities against existing User + CreatorProfile rows in the database.
 *
 * Output: tmp/imported-creators-review.csv
 *
 * reviewStatus values:
 *   AUTO_SAFE        — matched by source email, no activity signals detected
 *   REVIEW_REQUIRED  — matched but has activity signals (verified, sessions, tokens, etc.)
 *   EXCLUDED         — explicitly excluded (e.g. seed / test accounts)
 *
 * The backfill script MUST only process AUTO_SAFE rows.
 *
 * Run with:
 *   pnpm tsx prisma/generate-import-candidates.ts
 *
 * Output is written to tmp/imported-creators-review.csv (gitignored).
 * Do NOT commit that file — it may contain personal data.
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
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

// ─── Constants ────────────────────────────────────────────────────────────────

interface CsvFile {
  filename: string;
  format: "v1" | "v2";
}

const CSV_FILES: CsvFile[] = [
  {
    filename: "-Name-Email-InstagramURL-TikTokOtherSocials-NotesB.csv",
    format: "v1",
  },
  {
    filename: "-Name-Email-Instagram-TikTok-YouTube-Other-1.csv",
    format: "v2",
  },
];

// Domains that identify test/seed accounts — never classify these as imported
const EXCLUDED_EMAIL_DOMAINS = ["test.nexly.com"];

const OUTPUT_PATH = resolve(process.cwd(), "tmp/imported-creators-review.csv");

// ─── CSV parsing — identical to import-creators.ts ───────────────────────────

interface CsvRow {
  index: number;
  name: string;
  rawEmail: string;
  instagramUrl: string;
}

function parseCSV(raw: string): string[][] {
  const rows: string[][] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const fields: string[] = [];
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
        fields.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    fields.push(cur);
    rows.push(fields);
  }
  return rows;
}

function cell(v: string | undefined): string {
  const s = (v ?? "").trim();
  return s === "—" || s === "-" || s === "" ? "" : s;
}

function handleFromInstagram(url: string): string {
  return url
    .replace(/https?:\/\//, "")
    .replace(/instagram\.com\/?/, "")
    .replace(/\/$/, "")
    .trim();
}

function parseRowsV1(raw: string): CsvRow[] {
  const matrix = parseCSV(raw);
  return matrix.slice(1).flatMap((cols, i) => {
    const name = cell(cols[1]);
    const email = cell(cols[2]);
    const instagram = cell(cols[3]);
    if (!name && !email && !instagram) return [];
    return [{ index: i + 1, name: name || "Unknown Creator", rawEmail: email, instagramUrl: instagram }];
  });
}

function parseRowsV2(raw: string): CsvRow[] {
  const matrix = parseCSV(raw);
  return matrix.slice(1).flatMap((cols, i) => {
    const name = cell(cols[1]);
    const rawEmail = cell(cols[2]);
    // Same compound-email split as import-creators.ts
    const email = rawEmail.includes(" / ") ? rawEmail.split(" / ")[0].trim() : rawEmail;
    const instagram = cell(cols[3]);
    if (!name && !email && !instagram) return [];
    return [{ index: i + 1, name: name || "Unknown Creator", rawEmail: email, instagramUrl: instagram }];
  });
}

// ─── Identity resolution — identical logic to import-creators.ts ─────────────

interface ResolvedIdentity {
  resolvedEmail: string;
  isPlaceholder: boolean;
  rawEmail: string;
}

function resolveIdentity(row: CsvRow): ResolvedIdentity {
  let email = row.rawEmail;
  let isPlaceholder = false;

  if (!email || email.startsWith("—") || email.startsWith("'@")) {
    const handle = row.instagramUrl
      ? handleFromInstagram(row.instagramUrl)
      : row.name.toLowerCase().replace(/[^a-z0-9]/g, "_");
    email = `${handle}@import.nexly.internal`;
    isPlaceholder = true;
  }

  return { resolvedEmail: email, isPlaceholder, rawEmail: row.rawEmail };
}

// ─── Activity signal check ────────────────────────────────────────────────────

interface ActivitySignals {
  emailVerified: boolean;
  hasCompletedOnboarding: boolean;
  hasSession: boolean;
  hasPlatformToken: boolean;
  createdAt: string;
  userId: string;
  currentEmail: string;
  hasCreatorProfile: boolean;
}

async function getActivitySignals(userId: string): Promise<ActivitySignals | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      emailVerified: true,
      hasCompletedOnboarding: true,
      createdAt: true,
      sessions: { select: { id: true }, take: 1 },
      platformTokens: { select: { id: true }, take: 1 },
      creatorProfile: { select: { id: true } },
    },
  });
  if (!user) return null;
  return {
    userId: user.id,
    currentEmail: user.email,
    emailVerified: user.emailVerified,
    hasCompletedOnboarding: user.hasCompletedOnboarding,
    hasSession: user.sessions.length > 0,
    hasPlatformToken: user.platformTokens.length > 0,
    createdAt: user.createdAt.toISOString(),
    hasCreatorProfile: Boolean(user.creatorProfile),
  };
}

// ─── CSV output ───────────────────────────────────────────────────────────────

type ReviewStatus = "AUTO_SAFE" | "REVIEW_REQUIRED" | "EXCLUDED";

interface CandidateRow {
  userId: string;
  currentEmail: string;
  resolvedSourceEmail: string;
  sourceCsv: string;
  sourceRow: number;
  sourceName: string;
  matchReason: string;
  emailVerified: string;
  hasCompletedOnboarding: string;
  hasSession: string;
  hasPlatformToken: string;
  hasCreatorProfile: string;
  createdAt: string;
  reviewStatus: ReviewStatus;
  reviewNotes: string;
}

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCsvLine(row: CandidateRow): string {
  return [
    row.userId,
    row.currentEmail,
    row.resolvedSourceEmail,
    row.sourceCsv,
    String(row.sourceRow),
    row.sourceName,
    row.matchReason,
    row.emailVerified,
    row.hasCompletedOnboarding,
    row.hasSession,
    row.hasPlatformToken,
    row.hasCreatorProfile,
    row.createdAt,
    row.reviewStatus,
    row.reviewNotes,
  ]
    .map(escapeCsvField)
    .join(",");
}

const CSV_HEADER =
  "userId,currentEmail,resolvedSourceEmail,sourceCsv,sourceRow,sourceName,matchReason," +
  "emailVerified,hasCompletedOnboarding,hasSession,hasPlatformToken,hasCreatorProfile," +
  "createdAt,reviewStatus,reviewNotes";

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔍  Generating import candidate review file…\n");

  // Ensure output directory exists
  mkdirSync(resolve(process.cwd(), "tmp"), { recursive: true });

  const candidates: CandidateRow[] = [];

  // Track resolved emails we've already matched to avoid duplicate CSV rows
  // when the same email appears in both CSV files
  const seenEmails = new Set<string>();

  let totalSourceRows = 0;
  let matchedCount = 0;
  let notFoundCount = 0;

  for (const { filename, format } of CSV_FILES) {
    const csvPath = resolve(process.cwd(), filename);
    if (!existsSync(csvPath)) {
      console.warn(`  ⚠️  CSV not found, skipping: ${filename}`);
      continue;
    }

    const raw = readFileSync(csvPath, "utf-8");
    const rows = format === "v2" ? parseRowsV2(raw) : parseRowsV1(raw);
    console.log(`📂  ${filename} (${format}): ${rows.length} source rows`);
    totalSourceRows += rows.length;

    for (const row of rows) {
      const identity = resolveIdentity(row);

      // Deduplicate: if we already processed this resolved email from a previous CSV, skip
      if (seenEmails.has(identity.resolvedEmail)) continue;
      seenEmails.add(identity.resolvedEmail);

      // Check for explicit exclusions
      const emailDomain = identity.resolvedEmail.split("@")[1] ?? "";
      if (EXCLUDED_EMAIL_DOMAINS.some((d) => emailDomain === d)) {
        candidates.push({
          userId: "N/A",
          currentEmail: identity.resolvedEmail,
          resolvedSourceEmail: identity.resolvedEmail,
          sourceCsv: filename,
          sourceRow: row.index,
          sourceName: row.name,
          matchReason: "excluded_domain",
          emailVerified: "N/A",
          hasCompletedOnboarding: "N/A",
          hasSession: "N/A",
          hasPlatformToken: "N/A",
          hasCreatorProfile: "N/A",
          createdAt: "N/A",
          reviewStatus: "EXCLUDED",
          reviewNotes: `Excluded domain: ${emailDomain}`,
        });
        continue;
      }

      // Look up user by the same email the import script would use
      const user = await db.user.findUnique({
        where: { email: identity.resolvedEmail },
        select: { id: true },
      });

      if (!user) {
        notFoundCount++;
        // Source row present in CSV but not in DB — could mean it failed to import or was deleted
        console.log(`  ○  Not found in DB: ${identity.resolvedEmail} (${row.name})`);
        continue;
      }

      matchedCount++;

      const signals = await getActivitySignals(user.id);
      if (!signals) {
        // User row disappeared between the findUnique and the signals fetch — race condition
        notFoundCount++;
        continue;
      }

      // Determine review status
      const isActive =
        signals.emailVerified ||
        signals.hasCompletedOnboarding ||
        signals.hasSession ||
        signals.hasPlatformToken;

      let reviewStatus: ReviewStatus = "AUTO_SAFE";
      let reviewNotes = "";

      if (isActive) {
        reviewStatus = "REVIEW_REQUIRED";
        const flags: string[] = [];
        if (signals.emailVerified) flags.push("emailVerified");
        if (signals.hasCompletedOnboarding) flags.push("onboardingCompleted");
        if (signals.hasSession) flags.push("hasSession");
        if (signals.hasPlatformToken) flags.push("hasPlatformToken");
        reviewNotes = `Active signals: ${flags.join(", ")}`;
      } else {
        reviewNotes = identity.isPlaceholder
          ? "Placeholder email; no activity signals"
          : "Real email from CSV; no activity signals";
      }

      const matchReason = identity.isPlaceholder ? "placeholder_email" : "csv_email_match";

      candidates.push({
        userId: signals.userId,
        currentEmail: signals.currentEmail,
        resolvedSourceEmail: identity.resolvedEmail,
        sourceCsv: filename,
        sourceRow: row.index,
        sourceName: row.name,
        matchReason,
        emailVerified: String(signals.emailVerified),
        hasCompletedOnboarding: String(signals.hasCompletedOnboarding),
        hasSession: String(signals.hasSession),
        hasPlatformToken: String(signals.hasPlatformToken),
        hasCreatorProfile: String(signals.hasCreatorProfile),
        createdAt: signals.createdAt,
        reviewStatus,
        reviewNotes,
      });
    }
  }

  // Write CSV
  const lines = [CSV_HEADER, ...candidates.map(toCsvLine)];
  writeFileSync(OUTPUT_PATH, lines.join("\n") + "\n", "utf-8");

  // Summary
  const autoSafe = candidates.filter((c) => c.reviewStatus === "AUTO_SAFE").length;
  const reviewRequired = candidates.filter((c) => c.reviewStatus === "REVIEW_REQUIRED").length;
  const excluded = candidates.filter((c) => c.reviewStatus === "EXCLUDED").length;

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("✅  Candidate generation complete\n");
  console.log(`  Source rows total:      ${totalSourceRows}`);
  console.log(`  Unique source emails:   ${seenEmails.size}`);
  console.log(`  Matched in DB:          ${matchedCount}`);
  console.log(`  Not found in DB:        ${notFoundCount}`);
  console.log(`  Excluded (test):        ${excluded}`);
  console.log(`  AUTO_SAFE:              ${autoSafe}`);
  console.log(`  REVIEW_REQUIRED:        ${reviewRequired}`);
  console.log(`\n📄  Review file written to: ${OUTPUT_PATH}`);
  console.log("\n  ⚠️  Review the CSV manually before running backfill.");
  console.log("  ⚠️  Do NOT commit tmp/ — it may contain personal data.");
  console.log("  ⚠️  Only AUTO_SAFE rows will be processed by the backfill script.");
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
