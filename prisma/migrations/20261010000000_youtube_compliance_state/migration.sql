-- CreateEnum
CREATE TYPE "YouTubeComplianceStatus" AS ENUM ('ACTIVE', 'PURGED');

-- CreateEnum
CREATE TYPE "YouTubeMaintenanceOutcome" AS ENUM ('SUCCESS', 'NOT_CONNECTED', 'AUTHORIZATION_LOST', 'TEMPORARY_FAILURE', 'QUOTA_EXHAUSTED', 'CONFIGURATION_FAILURE', 'PROVIDER_FAILURE', 'IDENTITY_MISMATCH', 'SUPERSEDED', 'DEADLINE_PURGED');

-- CreateEnum
CREATE TYPE "YouTubeRemovalReason" AS ENUM ('AUTHORIZATION_LOST', 'DEADLINE_EXCEEDED', 'EXPLICIT_DISCONNECT', 'TOKENLESS_HISTORY', 'AMBIGUOUS_HISTORY');

-- CreateTable
CREATE TABLE "YouTubeComplianceState" (
    "userId" TEXT NOT NULL,
    "connectionGeneration" INTEGER NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "status" "YouTubeComplianceStatus" NOT NULL,
    "lastSuccessfulAuthorizationValidationAt" TIMESTAMPTZ(3),
    "lastSuccessfulDataRefreshAt" TIMESTAMPTZ(3),
    "nextAttemptAt" TIMESTAMPTZ(3),
    "deleteByAt" TIMESTAMPTZ(3),
    "lastAttemptAt" TIMESTAMPTZ(3),
    "lastOutcome" "YouTubeMaintenanceOutcome",
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "authorizationLostAt" TIMESTAMPTZ(3),
    "purgedAt" TIMESTAMPTZ(3),
    "removalReason" "YouTubeRemovalReason",
    "blockedAt" TIMESTAMPTZ(3),
    "leaseId" TEXT,
    "leaseExpiresAt" TIMESTAMPTZ(3),

    CONSTRAINT "YouTubeComplianceState_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "YouTubeComplianceState_status_nextAttemptAt_idx" ON "YouTubeComplianceState"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "YouTubeComplianceState_status_deleteByAt_idx" ON "YouTubeComplianceState"("status", "deleteByAt");

-- CreateIndex
CREATE INDEX "YouTubeComplianceState_leaseExpiresAt_idx" ON "YouTubeComplianceState"("leaseExpiresAt");

-- AddForeignKey
ALTER TABLE "YouTubeComplianceState" ADD CONSTRAINT "YouTubeComplianceState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Enforce durable cleanup markers and prevent contradictory lifecycle rows.
ALTER TABLE "YouTubeComplianceState" ADD CONSTRAINT "youtube_compliance_lifecycle" CHECK (
  ("status" = 'ACTIVE' AND "blockedAt" IS NULL AND "purgedAt" IS NULL AND "removalReason" IS NULL)
  OR ("status" = 'PURGED' AND "blockedAt" IS NOT NULL AND "purgedAt" IS NOT NULL
      AND "removalReason" IS NOT NULL AND "leaseId" IS NULL AND "leaseExpiresAt" IS NULL)
);
ALTER TABLE "YouTubeComplianceState" ADD CONSTRAINT "youtube_compliance_versions" CHECK ("connectionGeneration" >= 0 AND "revision" >= 0);
