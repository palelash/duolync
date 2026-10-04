-- Migration: add_claim_merge_audit
-- Adds two nullable audit columns to ProfileClaim for Scenario B (Claim Merge).
--
-- mergedFromProfileId: plain TEXT, NOT a foreign key.
--   Stores the id of the registered CreatorProfile (RP) that was consumed and
--   deleted during a Scenario B merge. RP no longer exists after merge, so a FK
--   would be orphaned or prevent deletion. A plain string preserves the historical
--   id permanently regardless of the RP lifecycle.
--
-- mergeCompletedAt: timestamp of the successful Scenario B merge commit.
--   Non-null only on claims where requiresMerge was true and the merge succeeded.
--   Distinguishes Scenario B approvals from Scenario A approvals at a glance.
--
-- This migration is ADDITIVE ONLY.
-- No DROP, no DELETE, no destructive ALTER.

ALTER TABLE "ProfileClaim"
  ADD COLUMN "mergedFromProfileId" TEXT,
  ADD COLUMN "mergeCompletedAt"    TIMESTAMP(3);
