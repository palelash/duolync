-- Migration: add_creator_content_curation
-- Adds the CreatorContentCuration table for durable content curation.
-- Keyed by (creatorProfileId + platform + providerPostId) — NOT a FK to SocialPost.
-- Missing row = visible=true, featured=false (no backfill required).

CREATE TABLE "CreatorContentCuration" (
    "id"               TEXT NOT NULL,
    "creatorProfileId" TEXT NOT NULL,
    "platform"         TEXT NOT NULL,
    "providerPostId"   TEXT NOT NULL,
    "isHidden"         BOOLEAN NOT NULL DEFAULT false,
    "isFeatured"       BOOLEAN NOT NULL DEFAULT false,
    "featuredOrder"    INTEGER,

    CONSTRAINT "CreatorContentCuration_pkey" PRIMARY KEY ("id")
);

-- Durable identity index (unique per creator × platform × post).
-- Explicit short name: the default Prisma name exceeds PostgreSQL's 63-byte limit.
CREATE UNIQUE INDEX "cc_curation_identity_key"
    ON "CreatorContentCuration"("creatorProfileId", "platform", "providerPostId");

-- Fast index for portfolio reads (featured items sorted by order).
CREATE INDEX "cc_featured_order_idx"
    ON "CreatorContentCuration"("creatorProfileId", "isFeatured", "featuredOrder");

-- FK back to CreatorProfile with cascade delete
-- (profile deletion removes all curation choices — no orphans)
ALTER TABLE "CreatorContentCuration"
    ADD CONSTRAINT "CreatorContentCuration_creatorProfileId_fkey"
    FOREIGN KEY ("creatorProfileId")
    REFERENCES "CreatorProfile"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
