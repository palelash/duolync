-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: add_crm_creator
-- Creator CRM table (profiles saved via the Chrome extension) plus postsCount.
-- Idempotent: the table may already exist in databases synced with `db push`.
-- ──────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "SocialPlatform" AS ENUM ('INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'THREADS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SavedCreatorStatus" AS ENUM (
    'SAVED', 'CONTACTED', 'IN_PROGRESS', 'REJECTED', 'ARCHIVED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "Creator" (
    "id"             TEXT                 NOT NULL,
    "userId"         TEXT                 NOT NULL,
    "platform"       "SocialPlatform"     NOT NULL,
    "handle"         TEXT                 NOT NULL,
    "name"           TEXT,
    "avatarUrl"      TEXT,
    "sourceUrl"      TEXT,
    "followersCount" INTEGER,
    "email"          TEXT,
    "notes"          TEXT,
    "status"         "SavedCreatorStatus" NOT NULL DEFAULT 'SAVED',
    "createdAt"      TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3)         NOT NULL,

    CONSTRAINT "Creator_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "Creator" ADD COLUMN "postsCount" INTEGER;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "Creator_userId_platform_handle_key" ON "Creator"("userId", "platform", "handle");
CREATE INDEX IF NOT EXISTS "Creator_userId_idx" ON "Creator"("userId");
CREATE INDEX IF NOT EXISTS "Creator_userId_platform_idx" ON "Creator"("userId", "platform");
CREATE INDEX IF NOT EXISTS "Creator_userId_status_idx" ON "Creator"("userId", "status");

DO $$ BEGIN
  ALTER TABLE "Creator" ADD CONSTRAINT "Creator_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
