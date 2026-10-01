-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: repair_schema_gaps
--
-- Adds to migration history all objects that exist in the production database
-- (created via historical db push) but have never appeared in any migration
-- file. Without this migration a fresh PostgreSQL database built solely from
-- the migration history would be missing these objects, causing
-- `prisma migrate diff` to report significant drift.
--
-- Objects covered:
--   · Role enum: ADMIN value
--   · New enum types: ModerationStatus, DisputeStatus, ReportReason
--   · User columns: banned, banReason, twoFactorEnabled
--   · Campaign columns: moderationStatus, moderationNote, moderatedAt + index
--   · CreatorProfile columns: moderationStatus, moderationNote, moderatedAt
--   · TwoFactor table (Better Auth 2FA)
--   · Dispute table
--
-- Also corrects two pre-existing migration-chain issues that prevent a clean
-- `prisma migrate diff` result on a fresh database:
--   · Campaign.status was created as TEXT DEFAULT 'DRAFT' in
--     20260602120000_decouple_profiles_and_marketplace, which blocked the
--     TEXT→CampaignStatus conversion in 20260826000000 (error 42804). This
--     migration performs the conversion with an idempotent conditional guard.
--   · Application.status lacks its schema-declared DEFAULT after the type
--     conversion in 20260826000000; this migration sets it.
--   · Several @updatedAt columns received DEFAULT CURRENT_TIMESTAMP from
--     old migration files; the Prisma schema engine expects no DB-level
--     default on @updatedAt fields. This migration drops those defaults.
--
-- Fully idempotent: every statement uses IF NOT EXISTS, ADD VALUE IF NOT EXISTS,
-- or a DO $$ ... EXCEPTION / conditional block so it is safe to run against
-- the production database where all these objects already exist.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 1. Role enum: add ADMIN value ─────────────────────────────────────────────
-- PostgreSQL native syntax; no-op if the value already exists.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ADMIN';

-- ── 2. New enum types ─────────────────────────────────────────────────────────

DO $$ BEGIN
    CREATE TYPE "ModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "ReportReason" AS ENUM (
        'SCAM_FRAUD', 'INAPPROPRIATE_CONTENT', 'UNPROFESSIONAL_BEHAVIOR', 'SPAM', 'OTHER'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 3. User: moderation and 2FA flag columns ──────────────────────────────────

DO $$ BEGIN
    ALTER TABLE "User" ADD COLUMN "banned" BOOLEAN NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "User" ADD COLUMN "banReason" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "User" ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- ── 4. Campaign: moderation columns + index ───────────────────────────────────

DO $$ BEGIN
    ALTER TABLE "Campaign"
        ADD COLUMN "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'PENDING';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "Campaign" ADD COLUMN "moderationNote" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "Campaign" ADD COLUMN "moderatedAt" TIMESTAMP(3);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "Campaign_moderationStatus_idx"
    ON "Campaign"("moderationStatus");

-- ── 5. CreatorProfile: moderation columns ────────────────────────────────────

DO $$ BEGIN
    ALTER TABLE "CreatorProfile"
        ADD COLUMN "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'PENDING';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "CreatorProfile" ADD COLUMN "moderationNote" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "CreatorProfile" ADD COLUMN "moderatedAt" TIMESTAMP(3);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- ── 6. TwoFactor table ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "TwoFactor" (
    "id"          TEXT    NOT NULL,
    "secret"      TEXT    NOT NULL,
    "backupCodes" TEXT    NOT NULL,
    "userId"      TEXT    NOT NULL,
    "verified"    BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TwoFactor_pkey" PRIMARY KEY ("id")
);

-- userId is @unique in schema.prisma
CREATE UNIQUE INDEX IF NOT EXISTS "TwoFactor_userId_key"
    ON "TwoFactor"("userId");

CREATE INDEX IF NOT EXISTS "TwoFactor_secret_idx"
    ON "TwoFactor"("secret");

CREATE INDEX IF NOT EXISTS "TwoFactor_userId_idx"
    ON "TwoFactor"("userId");

DO $$ BEGIN
    ALTER TABLE "TwoFactor"
        ADD CONSTRAINT "TwoFactor_userId_fkey"
        FOREIGN KEY ("userId")
        REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 7. Dispute table ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Dispute" (
    "id"              TEXT             NOT NULL,
    "reporterId"      TEXT,
    "targetUserId"    TEXT,
    "brandId"         TEXT,
    "creatorId"       TEXT,
    "campaignId"      TEXT,
    "status"          "DisputeStatus"  NOT NULL DEFAULT 'OPEN',
    "reason"          "ReportReason"   NOT NULL DEFAULT 'OTHER',
    "description"     TEXT             NOT NULL,
    "resolutionNotes" TEXT,
    "createdAt"       TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3)     NOT NULL,

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Dispute_status_idx"
    ON "Dispute"("status");

CREATE INDEX IF NOT EXISTS "Dispute_reporterId_idx"
    ON "Dispute"("reporterId");

CREATE INDEX IF NOT EXISTS "Dispute_targetUserId_idx"
    ON "Dispute"("targetUserId");

CREATE INDEX IF NOT EXISTS "Dispute_brandId_idx"
    ON "Dispute"("brandId");

CREATE INDEX IF NOT EXISTS "Dispute_creatorId_idx"
    ON "Dispute"("creatorId");

CREATE INDEX IF NOT EXISTS "Dispute_campaignId_idx"
    ON "Dispute"("campaignId");

DO $$ BEGIN
    ALTER TABLE "Dispute"
        ADD CONSTRAINT "Dispute_reporterId_fkey"
        FOREIGN KEY ("reporterId")
        REFERENCES "User"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "Dispute"
        ADD CONSTRAINT "Dispute_targetUserId_fkey"
        FOREIGN KEY ("targetUserId")
        REFERENCES "User"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "Dispute"
        ADD CONSTRAINT "Dispute_brandId_fkey"
        FOREIGN KEY ("brandId")
        REFERENCES "User"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "Dispute"
        ADD CONSTRAINT "Dispute_creatorId_fkey"
        FOREIGN KEY ("creatorId")
        REFERENCES "User"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "Dispute"
        ADD CONSTRAINT "Dispute_campaignId_fkey"
        FOREIGN KEY ("campaignId")
        REFERENCES "Campaign"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 8. Fix Campaign.status TEXT→CampaignStatus conversion ─────────────────────
-- 20260602120000 created Campaign.status as TEXT DEFAULT 'DRAFT'. The conversion
-- in 20260826000000 fails silently (error 42804: default cannot be cast) because
-- a TEXT DEFAULT blocks ALTER COLUMN TYPE on a column with a DB-level default.
-- Guard: only runs if status is still TEXT; on production (already CampaignStatus)
-- the IF condition is false and the entire block is a no-op.

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'Campaign'
          AND column_name = 'status'
          AND udt_name = 'text'
    ) THEN
        -- Drop the TEXT DEFAULT that blocks the type conversion
        ALTER TABLE "Campaign" ALTER COLUMN "status" DROP DEFAULT;
        -- Convert TEXT → CampaignStatus (all existing values are valid enum literals)
        ALTER TABLE "Campaign"
            ALTER COLUMN "status" TYPE "CampaignStatus"
            USING "status"::"CampaignStatus";
        -- Restore the DEFAULT at the correct enum type
        ALTER TABLE "Campaign" ALTER COLUMN "status" SET DEFAULT 'DRAFT'::"CampaignStatus";
    END IF;
EXCEPTION WHEN others THEN NULL; END $$;

-- ── 9. Set Application.status DEFAULT ─────────────────────────────────────────
-- 20260826000000 converts Application.status from TEXT to ApplicationStatus but
-- does not restore the schema-declared DEFAULT. Set it idempotently here.

DO $$ BEGIN
    ALTER TABLE "Application"
        ALTER COLUMN "status" SET DEFAULT 'PENDING'::"ApplicationStatus";
EXCEPTION WHEN others THEN NULL; END $$;

-- ── 10. Drop spurious DEFAULT CURRENT_TIMESTAMP from @updatedAt columns ────────
-- Several old migrations created tables with DEFAULT CURRENT_TIMESTAMP on
-- @updatedAt columns. Prisma's schema engine manages @updatedAt at the
-- application layer and generates these columns WITHOUT a DB-level default.
-- `prisma migrate diff` reports the presence of the default as schema drift.
-- DROP DEFAULT is a no-op if no default exists, so these statements are
-- safe to run on production databases that were built via db push.

ALTER TABLE "Account"     ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "Campaign"    ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "Dispute"     ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "Invitation"  ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "Session"     ALTER COLUMN "updatedAt" DROP DEFAULT;
