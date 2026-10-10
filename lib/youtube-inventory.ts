/** Aggregate SELECTs only; transaction rejects writes at the PostgreSQL level. */
export type InventoryClient = { query: (sql: string) => Promise<{ rows: Record<string, unknown>[] }> };
export async function readYouTubeInventory(client: InventoryClient) {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    await client.query("SET LOCAL statement_timeout = '30s'");
    const count = async (sql: string) => (await client.query(sql)).rows[0].count;
    const counts: Record<string, unknown> = {};
    for (const [key, table] of Object.entries({ tokens: "PlatformToken", stats: "PlatformStats", posts: "SocialPost", curations: "CreatorContentCuration" }))
      counts[key] = await count(`SELECT count(*)::text AS count FROM "${table}" WHERE "platform" = 'youtube'`);
    counts.lowerSourceStats = await count(`SELECT count(*)::text AS count FROM "PlatformStats" WHERE "platform" = 'youtube' AND "dataSource" <> 'OFFICIAL_API'`);
    counts.lowerSourcePosts = await count(`SELECT count(*)::text AS count FROM "SocialPost" WHERE "platform" = 'youtube' AND "dataSource" <> 'OFFICIAL_API'`);
    const relevant = `('youtube' = ANY(p."connectedPlatforms") OR p."socialLinks"->>'youtube' IS NOT NULL
      OR EXISTS (SELECT 1 FROM "SocialPost" d WHERE d."creatorProfileId" = p."id" AND d."platform" = 'youtube')
      OR EXISTS (SELECT 1 FROM "PlatformStats" d WHERE d."userId" = p."userId" AND d."platform" = 'youtube')
      OR EXISTS (SELECT 1 FROM "PlatformToken" d WHERE d."userId" = p."userId" AND d."platform" = 'youtube')
      OR EXISTS (SELECT 1 FROM "CreatorContentCuration" d WHERE d."creatorProfileId" = p."id" AND d."platform" = 'youtube'))`;
    counts.importedRelevantOwners = await count(`SELECT count(*)::text AS count FROM "CreatorProfile" p WHERE p."profileOrigin" = 'IMPORTED' AND ${relevant}`);
    counts.claimedRelevantOwners = await count(`SELECT count(*)::text AS count FROM "CreatorProfile" p WHERE (p."claimedByUserId" IS NOT NULL OR p."claimStatus" = 'CLAIMED') AND ${relevant}`);
    const present = (await client.query(`SELECT to_regclass('"YouTubeComplianceState"') IS NOT NULL AS present`)).rows[0].present;
    if (!present) return { complianceTablePresent: false, counts, compliance: null, recentOutcomes: null };
    const compliance: Record<string, unknown> = {};
    const filters = {
      active: `s."status" = 'ACTIVE'`, purged: `s."status" = 'PURGED'`,
      activeWithoutToken: `s."status" = 'ACTIVE' AND NOT EXISTS (SELECT 1 FROM "PlatformToken" t WHERE t."userId" = s."userId" AND t."platform" = 'youtube')`,
      dueSoon: `s."status" = 'ACTIVE' AND s."nextAttemptAt" > now() AND s."nextAttemptAt" <= now() + interval '1 day'`,
      overdue: `s."status" = 'ACTIVE' AND (s."nextAttemptAt" IS NULL OR s."nextAttemptAt" <= now() OR s."deleteByAt" IS NULL OR s."deleteByAt" <= now())`,
      deadlineOverdue: `s."status" = 'ACTIVE' AND (s."deleteByAt" IS NULL OR s."deleteByAt" <= now())`,
      approachingDeadline: `s."status" = 'ACTIVE' AND s."deleteByAt" > now() AND s."deleteByAt" <= now() + interval '3 days'`,
      leases: `s."leaseId" IS NOT NULL`, activeLeases: `s."leaseId" IS NOT NULL AND s."leaseExpiresAt" > now()`,
      expiredLeases: `s."leaseId" IS NOT NULL AND (s."leaseExpiresAt" IS NULL OR s."leaseExpiresAt" <= now())`,
    };
    for (const [key, filter] of Object.entries(filters))
      compliance[key] = await count(`SELECT count(*)::text AS count FROM "YouTubeComplianceState" s WHERE ${filter}`);
    compliance.tokenWithoutState = await count(`SELECT count(*)::text AS count FROM "PlatformToken" t WHERE t."platform" = 'youtube' AND NOT EXISTS (SELECT 1 FROM "YouTubeComplianceState" s WHERE s."userId" = t."userId")`);
    const blocked = `EXISTS (SELECT 1 FROM "YouTubeComplianceState" s WHERE s."userId" = d."userId" AND (s."status" = 'PURGED' OR s."blockedAt" IS NOT NULL))`;
    counts.blockedLowerSourceStats = await count(`SELECT count(*)::text AS count FROM "PlatformStats" d WHERE d."platform" = 'youtube' AND d."dataSource" <> 'OFFICIAL_API' AND ${blocked}`);
    counts.blockedLowerSourcePosts = await count(`SELECT count(*)::text AS count FROM "SocialPost" d JOIN "CreatorProfile" p ON p."id" = d."creatorProfileId" WHERE d."platform" = 'youtube' AND d."dataSource" <> 'OFFICIAL_API' AND EXISTS (SELECT 1 FROM "YouTubeComplianceState" s WHERE s."userId" = p."userId" AND (s."status" = 'PURGED' OR s."blockedAt" IS NOT NULL))`);
    // Outcomes are database enums; no provider data or owner identifiers.
    const recentOutcomes = (await client.query(`SELECT "lastOutcome" AS outcome, count(*)::text AS count FROM "YouTubeComplianceState" WHERE "lastAttemptAt" >= now() - interval '7 days' GROUP BY "lastOutcome" ORDER BY "lastOutcome"`)).rows;
    return { complianceTablePresent: true, counts, compliance, recentOutcomes };
  } finally { await client.query("ROLLBACK"); }
}
