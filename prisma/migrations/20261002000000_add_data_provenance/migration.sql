-- Migration: add_data_provenance
-- Additive only — no existing columns, indexes, or data are modified.
-- All new columns carry safe defaults so existing rows are unaffected.
--
-- Backfill rule (conservative):
--   Only rows with persisted raw.source = 'rapidapi' evidence are classified.
--   PlatformToken existence is NOT used as evidence (a token may exist while
--   stats were historically overwritten by Apify before provenance existed).
--   All other rows remain LEGACY_UNKNOWN.

-- 1. Create DataSource enum
CREATE TYPE "DataSource" AS ENUM (
  'OFFICIAL_API',
  'APIFY',
  'RAPIDAPI',
  'MANUAL_IMPORT',
  'LEGACY_UNKNOWN'
);

-- 2. Add provenance columns to PlatformStats
ALTER TABLE "PlatformStats"
  ADD COLUMN "dataSource" "DataSource" NOT NULL DEFAULT 'LEGACY_UNKNOWN',
  ADD COLUMN "providerAccountId" TEXT;

-- 3. Add provenance columns to SocialPost
ALTER TABLE "SocialPost"
  ADD COLUMN "dataSource" "DataSource" NOT NULL DEFAULT 'LEGACY_UNKNOWN',
  ADD COLUMN "providerPostId" TEXT;

-- 4. Provenance index on PlatformStats
CREATE INDEX "PlatformStats_userId_platform_dataSource_idx"
  ON "PlatformStats" ("userId", "platform", "dataSource");

-- 5. Provenance index on SocialPost (by source)
CREATE INDEX "SocialPost_creatorProfileId_platform_dataSource_idx"
  ON "SocialPost" ("creatorProfileId", "platform", "dataSource");

-- 6. Correlation index on SocialPost (for future dedup — non-unique)
CREATE INDEX "SocialPost_creatorProfileId_platform_providerPostId_idx"
  ON "SocialPost" ("creatorProfileId", "platform", "providerPostId");

-- 7. Backfill: classify rows with proven RapidAPI evidence
--    raw::jsonb->>'source' = 'rapidapi' is the only persisted signal we trust.
--    No other classification is applied.
UPDATE "PlatformStats"
SET "dataSource" = 'RAPIDAPI'
WHERE raw IS NOT NULL
  AND raw::jsonb->>'source' = 'rapidapi';
