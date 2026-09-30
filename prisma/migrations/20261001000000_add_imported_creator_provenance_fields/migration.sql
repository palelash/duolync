-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: add_imported_creator_provenance_fields
--
-- Adds explicit provenance / claim-state fields so imported (synthetic) creator
-- profiles can be distinguished from real registered creators.
--
-- Additive only:
--   - No rows deleted
--   - No existing columns modified
--   - No existing foreign keys changed
--   - All new columns are nullable or carry safe defaults
--   - All existing User IDs and CreatorProfile IDs are preserved
--
-- Idempotent: safe to re-run; uses IF NOT EXISTS / EXCEPTION guards throughout.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 1. New enum types ─────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "ProfileOrigin" AS ENUM ('REGISTERED', 'IMPORTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ClaimStatus" AS ENUM (
    'NOT_APPLICABLE', 'UNCLAIMED', 'CLAIM_PENDING', 'CLAIMED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. User.isImported ────────────────────────────────────────────────────────
-- Marks User rows that were created by the import script rather than normal sign-up.

DO $$ BEGIN
  ALTER TABLE "User" ADD COLUMN "isImported" BOOLEAN NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- ── 3. CreatorProfile provenance fields ───────────────────────────────────────

-- profileOrigin: REGISTERED (default) or IMPORTED
DO $$ BEGIN
  ALTER TABLE "CreatorProfile"
    ADD COLUMN "profileOrigin" "ProfileOrigin" NOT NULL DEFAULT 'REGISTERED';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- claimStatus: NOT_APPLICABLE for registered creators; UNCLAIMED/CLAIM_PENDING/CLAIMED for imported
DO $$ BEGIN
  ALTER TABLE "CreatorProfile"
    ADD COLUMN "claimStatus" "ClaimStatus" NOT NULL DEFAULT 'NOT_APPLICABLE';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- claimedByUserId: the real Duolync User who will claim this imported profile (future claim flow)
-- Nullable; unique enforces one-user-per-claim while allowing many NULL (unclaimed) rows.
-- PostgreSQL UNIQUE on a nullable column correctly permits multiple NULLs.
DO $$ BEGIN
  ALTER TABLE "CreatorProfile" ADD COLUMN "claimedByUserId" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- claimedAt: timestamp set when claim is completed (future claim flow)
DO $$ BEGIN
  ALTER TABLE "CreatorProfile" ADD COLUMN "claimedAt" TIMESTAMP(3);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- importedEmail: original email from the import source row (placeholder or real CSV email)
DO $$ BEGIN
  ALTER TABLE "CreatorProfile" ADD COLUMN "importedEmail" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- importedAt: timestamp of the import run that created this profile
DO $$ BEGIN
  ALTER TABLE "CreatorProfile" ADD COLUMN "importedAt" TIMESTAMP(3);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- importBatchId: stable identifier for the import source batch (e.g. "csv-v1-2026")
DO $$ BEGIN
  ALTER TABLE "CreatorProfile" ADD COLUMN "importBatchId" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- ── 4. Foreign key: CreatorProfile.claimedByUserId → User.id ─────────────────
-- Named relation "ClaimedCreatorProfiles". SetNull on User delete.

DO $$ BEGIN
  ALTER TABLE "CreatorProfile"
    ADD CONSTRAINT "CreatorProfile_claimedByUserId_fkey"
    FOREIGN KEY ("claimedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 5. Unique constraint on claimedByUserId ───────────────────────────────────
-- One real User may ultimately claim at most one imported profile.
-- Multiple NULLs are allowed (unclaimed profiles).

CREATE UNIQUE INDEX IF NOT EXISTS "CreatorProfile_claimedByUserId_key"
  ON "CreatorProfile"("claimedByUserId");

-- ── 6. Indexes ────────────────────────────────────────────────────────────────

-- For auth middleware: quickly identify imported User rows
CREATE INDEX IF NOT EXISTS "User_isImported_idx"
  ON "User"("isImported");

-- For discover filtering and admin views
CREATE INDEX IF NOT EXISTS "CreatorProfile_profileOrigin_idx"
  ON "CreatorProfile"("profileOrigin");

-- For combined filtering (e.g. IMPORTED + UNCLAIMED)
CREATE INDEX IF NOT EXISTS "CreatorProfile_profileOrigin_claimStatus_idx"
  ON "CreatorProfile"("profileOrigin", "claimStatus");

-- claimedByUserId is already covered by the unique index above
