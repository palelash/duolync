-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: create_application
--
-- Creates the Application table before 20260616100000_add_negotiation_fields
-- needs it. That migration runs ADD COLUMN IF NOT EXISTS on Application; on
-- a fresh database those statements fail with PostgreSQL error 42P01
-- (undefined_table) because Application was originally created via db push
-- and was never committed to migration history.
--
-- Design decisions:
--   1. status is TEXT with NO DEFAULT — the ApplicationStatus enum does not
--      exist yet at this point in the chain. 20260826000000 creates
--      ApplicationStatus and converts Application.status TEXT → ApplicationStatus
--      in its existing DO block. A DB-level DEFAULT on status would cause
--      PostgreSQL error 42804 ("default for column cannot be cast automatically")
--      during that conversion, silently swallowed by EXCEPTION WHEN others.
--      Omitting the DEFAULT avoids that failure.
--   2. updatedAt has NO DEFAULT — schema.prisma declares it @updatedAt, which
--      Prisma manages at the application layer; no DB-level default should exist
--      on @updatedAt columns per the generated baseline SQL.
--   3. contentFormats is created NOT NULL DEFAULT ARRAY[]::TEXT[] so that the
--      later UPDATE + SET NOT NULL in 20260826120000 is a safe no-op.
--   4. All subsequent ADD COLUMN IF NOT EXISTS in 20260616100000 target columns
--      created here → all become no-ops on both fresh and production databases.
--
-- Fully idempotent: safe to run against a database that already contains
-- Application (e.g. production, which has Application from historical db push).
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Application" (
    "id"               TEXT             NOT NULL,
    "campaignId"       TEXT             NOT NULL,
    "creatorProfileId" TEXT             NOT NULL,
    "coverLetter"      TEXT,
    "proposedRate"     DOUBLE PRECISION NOT NULL,
    "negotiatedRate"   DOUBLE PRECISION,
    "contentFormats"   TEXT[]           NOT NULL DEFAULT ARRAY[]::TEXT[],
    "brandNote"        TEXT,
    "selectedPlatform" TEXT,
    "status"           TEXT             NOT NULL,
    "createdAt"        TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3)     NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- Unique constraint required by schema.prisma @@unique([campaignId, creatorProfileId])
CREATE UNIQUE INDEX IF NOT EXISTS "Application_campaignId_creatorProfileId_key"
    ON "Application"("campaignId", "creatorProfileId");

-- Indexes required by schema.prisma @@index([creatorProfileId]) and @@index([campaignId, status])
CREATE INDEX IF NOT EXISTS "Application_creatorProfileId_idx"
    ON "Application"("creatorProfileId");

CREATE INDEX IF NOT EXISTS "Application_campaignId_status_idx"
    ON "Application"("campaignId", "status");

-- Foreign keys — wrapped in DO blocks so the migration is idempotent on
-- databases that already have these constraints (e.g. production).
DO $$ BEGIN
    ALTER TABLE "Application"
        ADD CONSTRAINT "Application_campaignId_fkey"
        FOREIGN KEY ("campaignId")
        REFERENCES "Campaign"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "Application"
        ADD CONSTRAINT "Application_creatorProfileId_fkey"
        FOREIGN KEY ("creatorProfileId")
        REFERENCES "CreatorProfile"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
