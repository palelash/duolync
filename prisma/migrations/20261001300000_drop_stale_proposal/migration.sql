-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: drop_stale_proposal
--
-- Removes the Proposal table that was created in
-- 20260602120000_decouple_profiles_and_marketplace but was never included in
-- schema.prisma (the Application model replaced it via db push).
--
-- No CASCADE required: Proposal holds only outgoing foreign keys
-- (Proposal.campaignId → Campaign, Proposal.creatorProfileId → CreatorProfile).
-- No other table references Proposal, so the table and its owned constraints
-- are removed cleanly by a plain DROP TABLE.
--
-- IF NOT EXISTS makes this idempotent on databases where Proposal was already
-- removed manually or via db push.
-- ──────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS "Proposal";
