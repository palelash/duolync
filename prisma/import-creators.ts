/**
 * CSV Creator Import — Enriched
 *
 * Reads -Name-Email-InstagramURL-TikTokOtherSocials-NotesB.csv from the
 * project root and upserts fully-enriched User + CreatorProfile records.
 *
 * Enrichment per row:
 *  - Avatar  : Cycles through a curated pool of Unsplash portrait photos
 *  - Followers: Parsed from Notes/Bio (e.g. "350K+ TikTok") or seeded random
 *  - Engagement: Realistic rate (3.1%–6.8%) inversely scaled with reach
 *  - Location : Extracted from Notes keywords or assigned a major hub
 *  - Niche   : Keyword-matched from name + notes (+ topNiches[])
 *  - Platform : Detected from notes ("YouTube", "TikTok") or social URLs
 *  - Moderation: APPROVED so cards appear on Discover immediately
 *
 * Run with:
 *   pnpm db:import
 *
 * Safe to re-run — uses upsert on email (User) and userId (CreatorProfile).
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { PrismaClient } from "../lib/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { hashPassword } from "better-auth/crypto";
import { config } from "dotenv";

// ─── Bootstrap ────────────────────────────────────────────────────────────────

config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
  max: 5,
});

const adapter = new PrismaPg(pool);
const db = new PrismaClient({ adapter });

// ─── CSV files to import (processed in order) ────────────────────────────────

interface CsvFile {
  filename: string;
  format: "v1" | "v2"; // v1 = 6-col + notes/bio; v2 = 7-col + YouTube + Other
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
const IMPORT_PASSWORD = "NexlyImport2026!";

// ─── Avatar Pool ──────────────────────────────────────────────────────────────
// 40 diverse, professional Unsplash portrait photos (w=400 h=400 crop=faces)

const BASE = "https://images.unsplash.com/photo-";
const Q = "?w=400&h=400&fit=crop&crop=faces&auto=format&q=80";

const AVATARS: string[] = [
  `${BASE}1534528741112-9b0c3c60b7c5${Q}`,
  `${BASE}1507003211169-0a1dd7228f2d${Q}`,
  `${BASE}1494790108377-be9c29b29330${Q}`,
  `${BASE}1531746020798-e6953c6e8e04${Q}`,
  `${BASE}1438761681033-6461ffad8d80${Q}`,
  `${BASE}1500648767791-00dcc994a43e${Q}`,
  `${BASE}1472099645785-5658abf4ff4e${Q}`,
  `${BASE}1519085360753-af0119f7cbe7${Q}`,
  `${BASE}1488426862026-3ee34a7d66ef${Q}`,
  `${BASE}1544005313-94ddf0286df2${Q}`,
  `${BASE}1522556189639-9d19bd4faee8${Q}`,
  `${BASE}1580489944761-15a19d654956${Q}`,
  `${BASE}1573496359142-b8d87734a5a2${Q}`,
  `${BASE}1624561172888-ac93c696eda2${Q}`,
  `${BASE}1548142813-c348350df52b${Q}`,
  `${BASE}1565299507177-b0ac66763828${Q}`,
  `${BASE}1590086782957-93c06ef21604${Q}`,
  `${BASE}1542206395-9feb3edaa68d${Q}`,
  `${BASE}1552374196-1ab2a1c593e8${Q}`,
  `${BASE}1557862921-37829c790f19${Q}`,
  `${BASE}1583394293214-09d7f0b2c4e7${Q}`,
  `${BASE}1570295999919-56ceb5ecca61${Q}`,
  `${BASE}1539571696357-5a69c17a67c6${Q}`,
  `${BASE}1463453091185-61582044d556${Q}`,
  `${BASE}1521119989659-a83eee488004${Q}`,
  `${BASE}1531123897727-8f129e1688ce${Q}`,
  `${BASE}1627161683077-e34782c24d81${Q}`,
  `${BASE}1560250097-0b93528c311a${Q}`,
  `${BASE}1522075469751-3a6694fb2f61${Q}`,
  `${BASE}1504593811423-6dd665756598${Q}`,
  `${BASE}1500522144261-ea64433bbe27${Q}`,
  `${BASE}1640951613-image-of-person${Q}`.replace("1640951613-image-of-person", "1573497019943-3efd82dfedeb"),
  `${BASE}1488546708989-6c3c7f989dbb${Q}`,
  `${BASE}1517841905240-472988babdf9${Q}`,
  `${BASE}1614283233556-f35b0c801ef1${Q}`,
  `${BASE}1506794778202-cad84cf45f1d${Q}`,
  `${BASE}1558203608-f8a41fbf7086${Q}`,
  `${BASE}1596815064285-45ed8a9c0463${Q}`,
  `${BASE}1529626455594-4ff0802cfb7e${Q}`,
  `${BASE}1502685104226-ee32379fefbe${Q}`,
];

// ─── CSV Parsing ──────────────────────────────────────────────────────────────

interface CsvRow {
  index: number;
  name: string;
  email: string;
  instagramUrl: string;
  tiktokUrl: string;
  youtubeUrl: string;
  notes: string; // Notes/Bio (v1) or Other platforms text (v2)
}

/** Minimal RFC-4180 parser — handles quoted fields, commas inside quotes. */
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
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === "," && !inQuote) {
        fields.push(cur); cur = "";
      } else {
        cur += ch;
      }
    }
    fields.push(cur);
    rows.push(fields);
  }
  return rows;
}

/** Trim + collapse dash-only placeholders to empty string. */
function cell(v: string | undefined): string {
  const s = (v ?? "").trim();
  return s === "—" || s === "-" || s === "" ? "" : s;
}

function normaliseUrl(raw: string): string | null {
  if (!raw) return null;
  return raw.startsWith("http") ? raw : `https://${raw}`;
}

function handleFromInstagram(url: string): string {
  return url
    .replace(/https?:\/\//, "")
    .replace(/instagram\.com\/?/, "")
    .replace(/\/$/, "")
    .trim();
}

/**
 * Parse a v1 CSV: #, Name, Email, "Instagram URL", "TikTok / Other Socials", "Notes/Bio"
 * (URLs may omit the https:// scheme)
 */
function parseRowsV1(raw: string): CsvRow[] {
  const matrix = parseCSV(raw);
  return matrix.slice(1).flatMap((cols, i) => {
    const name = cell(cols[1]);
    const email = cell(cols[2]);
    const instagram = cell(cols[3]);
    if (!name && !email && !instagram) return [];
    return [{
      index: i + 1,
      name: name || "Unknown Creator",
      email,
      instagramUrl: instagram,
      tiktokUrl: cell(cols[4]),
      youtubeUrl: "",
      notes: cell(cols[5]),
    }];
  });
}

/**
 * Parse a v2 CSV: #, Name, Email, Instagram, TikTok, YouTube, Other
 * (URLs are already fully qualified https:// links)
 */
function parseRowsV2(raw: string): CsvRow[] {
  const matrix = parseCSV(raw);
  return matrix.slice(1).flatMap((cols, i) => {
    const name = cell(cols[1]);
    // Some emails contain compound values like "info@a.com / other@b.com" — take the first
    const rawEmail = cell(cols[2]);
    const email = rawEmail.includes(" / ") ? rawEmail.split(" / ")[0].trim() : rawEmail;
    const instagram = cell(cols[3]);
    if (!name && !email && !instagram) return [];
    return [{
      index: i + 1,
      name: name || "Unknown Creator",
      email,
      instagramUrl: instagram,
      tiktokUrl: cell(cols[4]),
      youtubeUrl: cell(cols[5]),
      notes: cell(cols[6]), // "Other" column — Pinterest / X / Twitch / etc.
    }];
  });
}

function parseRows(raw: string, format: "v1" | "v2"): CsvRow[] {
  return format === "v2" ? parseRowsV2(raw) : parseRowsV1(raw);
}

// ─── Enrichment Helpers ───────────────────────────────────────────────────────

/** Deterministic seeded random — same seed always returns same value in [0,1). */
function seededRand(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function randBetween(min: number, max: number, seed: number): number {
  return Math.round(min + seededRand(seed) * (max - min));
}

function randFloat(min: number, max: number, seed: number): number {
  return parseFloat((min + seededRand(seed) * (max - min)).toFixed(1));
}

/**
 * Parse the highest follower number mentioned in the notes.
 * Handles patterns like "350K+", "1M+", "100k", "YouTube 160k+".
 */
function parseFollowers(notes: string): number | null {
  const pattern = /(\d+(?:\.\d+)?)\s*([KkMm])\+?/g;
  let max = 0;
  let found = false;
  for (const m of notes.matchAll(pattern)) {
    const n = parseFloat(m[1]);
    const mult = m[2].toLowerCase() === "m" ? 1_000_000 : 1_000;
    const val = Math.round(n * mult);
    if (val > max) { max = val; found = true; }
  }
  return found ? max : null;
}

/**
 * Engagement rate: higher follower counts naturally attract lower rates.
 * Formula gives ~6.5% at 25K, ~3.5% at 1M — realistic micro/macro spread.
 */
function engagementRate(followers: number, seed: number): number {
  const base = 6.8 - (followers / 1_000_000) * 3.5;
  const clamped = Math.max(3.1, Math.min(6.8, base));
  const jitter = (seededRand(seed) - 0.5) * 0.8;
  return parseFloat(Math.max(3.1, Math.min(6.8, clamped + jitter)).toFixed(1));
}

// Location keyword → display label (ordered most-specific first)
const LOCATION_MAP: [RegExp, string][] = [
  [/south florida|south fl|boca|ftl|fort lauderdale/i, "Fort Lauderdale, FL"],
  [/nyc|new york/i, "New York, NY"],
  [/los angeles|, la[,\s]|^la\s|lacity/i, "Los Angeles, CA"],
  [/miami/i, "Miami, FL"],
  [/london/i, "London, UK"],
  [/milan/i, "Milan, Italy"],
  [/berlin/i, "Berlin, Germany"],
  [/toronto/i, "Toronto, Canada"],
  [/montreal/i, "Montreal, Canada"],
  [/chicago/i, "Chicago, IL"],
  [/austin/i, "Austin, TX"],
  [/houston/i, "Houston, TX"],
  [/dallas/i, "Dallas, TX"],
  [/boston/i, "Boston, MA"],
  [/\bnc\b|charlotte/i, "Charlotte, NC"],
  [/\bnj\b|new jersey/i, "New Jersey, USA"],
  [/são paulo|sao paulo|\bsp\b/i, "São Paulo, Brazil"],
  [/curitiba/i, "Curitiba, Brazil"],
  [/lima/i, "Lima, Peru"],
  [/singapore/i, "Singapore"],
  [/poland|warsaw/i, "Warsaw, Poland"],
  [/como|italy/i, "Italy"],
  [/germany/i, "Germany"],
  [/españa|spain|huelva|sevilla/i, "Spain"],
  [/uruguay|cdmx|mexico city/i, "Mexico City, Mexico"],
  [/sonora|gdl|guadalajara/i, "Guadalajara, Mexico"],
  [/st\. pete|st pete/i, "St. Petersburg, FL"],
  [/paris|french/i, "Paris, France"],
  [/🇳🇵|nepal/i, "Kathmandu, Nepal"],
  [/🇲🇾|malaysia/i, "Kuala Lumpur, Malaysia"],
];

const FALLBACK_LOCATIONS = [
  "New York, NY", "Los Angeles, CA", "Miami, FL", "London, UK",
  "Chicago, IL", "Austin, TX", "Toronto, Canada", "Berlin, Germany",
  "Paris, France", "Barcelona, Spain",
];

function extractLocation(notes: string, seed: number): string {
  for (const [re, label] of LOCATION_MAP) {
    if (re.test(notes)) return label;
  }
  return FALLBACK_LOCATIONS[Math.floor(seededRand(seed) * FALLBACK_LOCATIONS.length)];
}

// Niche keyword groups — first match wins
const NICHE_MAP: [RegExp, string, string[]][] = [
  // [pattern, niche label, topNiches array]
  [/asmr/i,                              "ASMR",                    ["ASMR", "Relaxation", "Audio"]],
  [/beauty|makeup|skincare|esthetician|cosmetolog|sephora/i, "Beauty", ["Beauty", "Skincare", "Wellness"]],
  [/fitness|gym|workout|coach sportive|gymnast|athlete/i, "Fitness", ["Fitness", "Health", "Sports"]],
  [/food|cook|gastronom|recipe|halal|gourmand|cookie|gastronomia|vegan/i, "Food & Cooking", ["Food", "Cooking", "Lifestyle"]],
  [/travel/i,                            "Travel",                  ["Travel", "Lifestyle", "Photography"]],
  [/fashion|style|zapatos|clothing|activewear|moda/i, "Fashion",   ["Fashion", "Style", "Lifestyle"]],
  [/gaming|game|streamer|twitch|playz|play/i, "Gaming",            ["Gaming", "Streaming", "Entertainment"]],
  [/music|musician|canto|singer|violist|cantante|song/i, "Music",  ["Music", "Entertainment", "Performance"]],
  [/art|artist|cosplay|animation|animator|illustrat|commissions|diy/i, "Art & Design", ["Art", "Design", "Creative"]],
  [/tech|saas|software|dev|coding|programmer/i, "Tech",            ["Tech", "Software", "Productivity"]],
  [/book|author|writer|fantasy|literature|linguist/i, "Books",     ["Books", "Literature", "Education"]],
  [/comedy|prank|funny|humor|awkward|pun/i, "Comedy",              ["Comedy", "Entertainment", "Lifestyle"]],
  [/hair|salon/i,                        "Hair & Beauty",           ["Hair", "Beauty", "Lifestyle"]],
  [/wellness|mental health|mindful|yoga/i, "Wellness",             ["Wellness", "Lifestyle", "Health"]],
  [/film|filmmaker|director|production|cinéma/i, "Film & Video",   ["Film", "Video", "Creative"]],
  [/actor|actriz|model|model/i,          "Entertainment",           ["Acting", "Modeling", "Entertainment"]],
  [/podcast/i,                           "Podcast",                 ["Podcast", "Media", "Storytelling"]],
  [/coffee|café/i,                       "Coffee & Lifestyle",      ["Coffee", "Travel", "Lifestyle"]],
  [/sustainable|conscious|eco|zero.waste/i, "Sustainability",      ["Sustainability", "Lifestyle", "Fashion"]],
  [/sport|tennis/i,                      "Sports",                  ["Sports", "Fitness", "Lifestyle"]],
  [/skater|skate/i,                      "Skating",                 ["Skating", "Sports", "Lifestyle"]],
  [/real estate|finance|business/i,      "Business",                ["Business", "Finance", "Lifestyle"]],
  [/lifestyle|daily|vlog|content creator/i, "Lifestyle",           ["Lifestyle", "Vlogging", "Entertainment"]],
];

const FALLBACK_NICHE: [string, string[]] = ["Lifestyle", ["Lifestyle", "Content Creation"]];

function detectNiche(name: string, notes: string, igUrl: string): [string, string[]] {
  const text = `${name} ${notes} ${igUrl}`;
  for (const [re, label, niches] of NICHE_MAP) {
    if (re.test(text)) return [label, niches];
  }
  return FALLBACK_NICHE;
}

function detectPlatform(notes: string, tiktokUrl: string, youtubeUrl: string): string {
  const n = notes.toLowerCase();
  const hasTiktok = Boolean(tiktokUrl) || n.includes("tiktok");
  const hasYoutube = Boolean(youtubeUrl) || n.includes("youtube") || n.includes("youtuber");
  const hasTwitch = n.includes("twitch") || n.includes("streamer");

  // Use whichever has higher numbers mentioned
  if (hasYoutube && hasTiktok) {
    const ytMatch = notes.match(/youtube[^\d]*(\d+(?:\.\d+)?)\s*[KkMm]/i);
    const ttMatch = notes.match(/tiktok[^\d]*(\d+(?:\.\d+)?)\s*[KkMm]/i);
    if (ytMatch && ttMatch) {
      const yt = parseFloat(ytMatch[1]);
      const tt = parseFloat(ttMatch[1]);
      return yt >= tt ? "youtube" : "tiktok";
    }
    return "youtube";
  }
  if (hasYoutube) return "youtube";
  if (hasTwitch) return "twitch";
  if (hasTiktok) return "tiktok";
  return "instagram";
}

// ─── Import Logic ─────────────────────────────────────────────────────────────

interface Result {
  created: number;
  updated: number;
  placeholderEmails: number;
  errors: { row: number; name: string; error: string }[];
}

async function importCreator(
  row: CsvRow,
  hashedPassword: string,
  result: Result,
): Promise<void> {
  // ── Resolve email ──────────────────────────────────────────────────────────
  let email = row.email;
  let usedPlaceholder = false;

  if (!email || email.startsWith("—") || email.startsWith("'@")) {
    const handle = row.instagramUrl
      ? handleFromInstagram(row.instagramUrl)
      : row.name.toLowerCase().replace(/[^a-z0-9]/g, "_");
    email = `${handle}@import.nexly.internal`;
    usedPlaceholder = true;
  }

  // ── Enrich metadata ────────────────────────────────────────────────────────
  const seed = row.index;
  const avatarUrl = AVATARS[row.index % AVATARS.length];
  const parsedFollowers = parseFollowers(row.notes);
  const totalFollowers = parsedFollowers ?? randBetween(25_000, 400_000, seed);
  const avgEngagement = engagementRate(totalFollowers, seed + 100);
  const location = extractLocation(`${row.notes} ${row.instagramUrl}`, seed + 200);
  const [niche, topNiches] = detectNiche(row.name, row.notes, row.instagramUrl);
  const primaryPlatform = detectPlatform(row.notes, row.tiktokUrl, row.youtubeUrl);

  // Social links JSON — normalise any bare hostname URLs
  const socialLinks: Record<string, string> = {};
  const instaNorm = normaliseUrl(row.instagramUrl);
  const tiktokNorm = normaliseUrl(row.tiktokUrl);
  const youtubeNorm = normaliseUrl(row.youtubeUrl);
  if (instaNorm) socialLinks["instagram"] = instaNorm;
  if (tiktokNorm) socialLinks["tiktok"] = tiktokNorm;
  if (youtubeNorm) socialLinks["youtube"] = youtubeNorm;

  // Connected platforms array
  const connectedPlatforms = Object.keys(socialLinks);
  if (!connectedPlatforms.includes("youtube") && row.notes.toLowerCase().includes("youtube")) connectedPlatforms.push("youtube");
  if (!connectedPlatforms.includes("twitch") && row.notes.toLowerCase().includes("twitch")) connectedPlatforms.push("twitch");

  // ── Upsert User ────────────────────────────────────────────────────────────
  const isNew = !(await db.user.findUnique({ where: { email } }));

  const user = await db.user.upsert({
    where: { email },
    create: {
      email,
      name: row.name,
      image: avatarUrl,
      emailVerified: false,
      role: "CREATOR",
      hasCompletedOnboarding: false,
    },
    update: {
      name: row.name,
      image: avatarUrl,
    },
  });

  // ── Upsert Account (credential) ────────────────────────────────────────────
  await db.account.upsert({
    where: { providerId_accountId: { providerId: "credential", accountId: email } },
    create: {
      userId: user.id,
      accountId: email,
      providerId: "credential",
      password: hashedPassword,
    },
    update: {}, // never overwrite an existing password
  });

  // ── Upsert CreatorProfile ──────────────────────────────────────────────────
  const profileData = {
    bio: row.notes || null,
    niche,
    primaryPlatform,
    location,
    totalFollowers,
    followerCount: totalFollowers,
    avgEngagementRate: avgEngagement,
    averageEngagement: avgEngagement,
    topNiches,
    connectedPlatforms,
    socialLinks: Object.keys(socialLinks).length > 0 ? socialLinks : undefined,
    moderationStatus: "APPROVED" as const,
    moderatedAt: new Date(),
    lastStatsUpdate: new Date(),
    lastSyncedAt: new Date(),
  };

  await db.creatorProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...profileData },
    update: profileData,
  });

  const tag = usedPlaceholder ? " [placeholder email]" : "";
  const action = isNew ? "✓  created" : "↺  updated";
  const stats = `${(totalFollowers / 1000).toFixed(0)}K followers · ${avgEngagement}% eng · ${primaryPlatform}`;
  console.log(`  ${action}: ${row.name} <${email}>${tag}`);
  console.log(`           ${niche} · ${location} · ${stats}`);

  if (isNew) result.created++;
  else result.updated++;
  if (usedPlaceholder) result.placeholderEmails++;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Validate all CSVs exist upfront
  for (const { filename } of CSV_FILES) {
    const csvPath = resolve(process.cwd(), filename);
    if (!existsSync(csvPath)) {
      console.error(`\n❌  CSV not found at:\n    ${csvPath}`);
      console.error(`    Copy it to the project root:\n    cp ~/Downloads/'${filename}' .\n`);
      process.exit(1);
    }
  }

  console.log("🔑  Hashing import password…");
  const hashedPassword = await hashPassword(IMPORT_PASSWORD);

  const totals: Result = { created: 0, updated: 0, placeholderEmails: 0, errors: [] };

  for (const { filename, format } of CSV_FILES) {
    const csvPath = resolve(process.cwd(), filename);
    console.log(`\n📂  Reading (${format}): ${filename}`);
    const rows = parseRows(readFileSync(csvPath, "utf-8"), format);
    console.log(`📋  Found ${rows.length} creator rows.\n`);

    const result: Result = { created: 0, updated: 0, placeholderEmails: 0, errors: [] };

    for (const row of rows) {
      try {
        await importCreator(row, hashedPassword, result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ✗  row ${row.index} (${row.name}): ${msg}`);
        result.errors.push({ row: row.index, name: row.name, error: msg });
      }
    }

    const sub = result.created + result.updated;
    console.log(`\n  ─── ${filename} summary ───`);
    console.log(`  Processed: ${sub}  (${result.created} new · ${result.updated} updated · ${result.errors.length} errors)`);

    totals.created += result.created;
    totals.updated += result.updated;
    totals.placeholderEmails += result.placeholderEmails;
    totals.errors.push(...result.errors);
  }

  // ── Grand Summary ──────────────────────────────────────────────────────────
  const total = totals.created + totals.updated;
  console.log("\n═════════════════════════════════════════════════════");
  console.log("✅  All imports complete!\n");
  console.log(`  Total processed:    ${total}`);
  console.log(`  Newly created:      ${totals.created}`);
  console.log(`  Updated (upsert):   ${totals.updated}`);
  console.log(`  Placeholder emails: ${totals.placeholderEmails}`);
  console.log(`  Errors:             ${totals.errors.length}`);

  if (totals.errors.length) {
    console.log("\n⚠️   Failed rows:");
    for (const e of totals.errors) console.log(`    Row ${e.row}: ${e.name} — ${e.error}`);
  }
  if (totals.placeholderEmails) {
    console.log(`\n💡  ${totals.placeholderEmails} creator(s) had no real email — given @import.nexly.internal placeholder.`);
    console.log("    Update via Prisma Studio: pnpm db:studio");
  }

  console.log(`\n🔒  Import password: ${IMPORT_PASSWORD}`);
  console.log("    Creators should reset via Forgot Password.\n");
}

main()
  .catch((e) => { console.error("\n💥  Fatal:", e); process.exit(1); })
  .finally(async () => { await db.$disconnect(); await pool.end(); });
