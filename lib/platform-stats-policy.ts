/**
 * PlatformStats + SocialPost write-precedence policy.
 *
 * Two-gate model:
 *
 * Gate 1 — hard OAuth protection (callers must check this first):
 *   If incoming source is APIFY or RAPIDAPI and a PlatformToken exists for
 *   the same (userId, platform), the write is refused unconditionally,
 *   regardless of the existing PlatformStats.dataSource.
 *   This protects LEGACY_UNKNOWN rows that were written before provenance
 *   existed but whose OAuth token is still active.
 *
 * Gate 2 — source authority (only reached when Gate 1 does not block):
 *   A lower-authority source cannot silently overwrite a higher-authority row.
 *   Equal-authority source refreshes (same source → same source) are allowed.
 *
 * Authority order:
 *   OFFICIAL_API (3) > RAPIDAPI (2) > APIFY (1) > LEGACY_UNKNOWN / MANUAL_IMPORT (0)
 *
 * OFFICIAL_API callers skip both gates — they are the highest authority and
 * always allowed to write. They must still stamp dataSource = OFFICIAL_API.
 */

import type { DataSource } from "@/lib/generated/prisma";

const SOURCE_AUTHORITY: Record<DataSource, number> = {
  OFFICIAL_API:   3,
  RAPIDAPI:       2,
  APIFY:          1,
  MANUAL_IMPORT:  0,
  LEGACY_UNKNOWN: 0,
};

/**
 * Gate 2 — source authority check.
 *
 * Returns true when `incoming` is allowed to overwrite a row whose current
 * source is `existing`. Used after Gate 1 (PlatformToken check) has already
 * passed.
 *
 * - Higher or equal authority: allowed.
 * - Lower authority: blocked.
 */
export function canOverwrite(
  existing: DataSource,
  incoming: DataSource,
): boolean {
  return SOURCE_AUTHORITY[incoming] >= SOURCE_AUTHORITY[existing];
}

/**
 * The set of sources that are subject to both gates.
 * OFFICIAL_API is excluded — it always writes without checking.
 */
export const GUARDED_SOURCES = new Set<DataSource>(["APIFY", "RAPIDAPI"]);
