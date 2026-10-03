-- Migration: add_claim_profile
-- Adds ProfileClaimStatus enum, ProfileClaim and ProfileAlias tables.
-- Includes a partial unique index (one PENDING claim per profile) that cannot
-- be expressed in the Prisma DSL and must be maintained as raw SQL.

-- ── 1. New enum ───────────────────────────────────────────────────────────────

CREATE TYPE "ProfileClaimStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- ── 2. ProfileClaim ───────────────────────────────────────────────────────────

CREATE TABLE "ProfileClaim" (
    "id"               TEXT NOT NULL,
    "creatorProfileId" TEXT NOT NULL,
    "requesterUserId"  TEXT,
    "status"           "ProfileClaimStatus" NOT NULL DEFAULT 'PENDING',
    "evidenceNote"     TEXT,
    "evidenceEmail"    TEXT,
    "evidencePlatform" TEXT,
    "evidenceHandle"   TEXT,
    "requiresMerge"    BOOLEAN NOT NULL DEFAULT false,
    "reviewedByUserId" TEXT,
    "reviewedAt"       TIMESTAMP(3),
    "rejectionReason"  TEXT,
    "requestedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfileClaim_pkey" PRIMARY KEY ("id")
);

-- FK: requesterUserId -> User.id  (SetNull on delete)
ALTER TABLE "ProfileClaim"
    ADD CONSTRAINT "ProfileClaim_requesterUserId_fkey"
    FOREIGN KEY ("requesterUserId")
    REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- FK: reviewedByUserId -> User.id  (SetNull on delete)
ALTER TABLE "ProfileClaim"
    ADD CONSTRAINT "ProfileClaim_reviewedByUserId_fkey"
    FOREIGN KEY ("reviewedByUserId")
    REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- FK: creatorProfileId -> CreatorProfile.id  (Cascade on delete)
ALTER TABLE "ProfileClaim"
    ADD CONSTRAINT "ProfileClaim_creatorProfileId_fkey"
    FOREIGN KEY ("creatorProfileId")
    REFERENCES "CreatorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Regular indexes
CREATE INDEX "ProfileClaim_creatorProfileId_status_idx"
    ON "ProfileClaim"("creatorProfileId", "status");

CREATE INDEX "ProfileClaim_requesterUserId_status_idx"
    ON "ProfileClaim"("requesterUserId", "status");

CREATE INDEX "ProfileClaim_status_requestedAt_idx"
    ON "ProfileClaim"("status", "requestedAt");

-- ── 3. Partial unique index: at most one PENDING claim per profile ─────────────
-- This constraint cannot be expressed in the Prisma schema DSL.
-- Approved / rejected / cancelled claims are not constrained.

CREATE UNIQUE INDEX "profile_claim_one_pending_per_profile"
    ON "ProfileClaim" ("creatorProfileId")
    WHERE status = 'PENDING';

-- ── 4. ProfileAlias ───────────────────────────────────────────────────────────
-- fromUserId is intentionally NOT a FK so it survives placeholder User deletion.
-- creatorProfileId IS a FK with Cascade so stale aliases are removed with the profile.

CREATE TABLE "ProfileAlias" (
    "id"               TEXT NOT NULL,
    "fromUserId"       TEXT NOT NULL,
    "creatorProfileId" TEXT NOT NULL,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileAlias_pkey" PRIMARY KEY ("id")
);

-- Unique on fromUserId — the @unique in Prisma schema creates this index
CREATE UNIQUE INDEX "ProfileAlias_fromUserId_key"
    ON "ProfileAlias"("fromUserId");

-- FK: creatorProfileId -> CreatorProfile.id  (Cascade on delete)
ALTER TABLE "ProfileAlias"
    ADD CONSTRAINT "ProfileAlias_creatorProfileId_fkey"
    FOREIGN KEY ("creatorProfileId")
    REFERENCES "CreatorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
