import "server-only";
import { lockYouTubeCompliance, youtubeDatabaseNow } from "@/lib/youtube-compliance";
import type { YouTubeRemovalReason } from "@/lib/generated/prisma";
import { db } from "@/lib/db";
import { lockYouTubeOwner } from "@/lib/youtube-lock";
import { youtubeAggregateRemovalPatch } from "@/lib/youtube-aggregates";
import type { PlatformToken, Prisma } from "@/lib/generated/prisma";

/** Coordinated local YouTube cleanup. Same coordination domain as reconnect/refresh,
 * including history-only accounts: User -> token -> profile -> dataset.
 */
export async function removeYouTubeLocalData(userId: string,
  credentialGuard?: (current: PlatformToken | null, tx: Prisma.TransactionClient) => boolean | Promise<boolean>,
  afterCleanup?: (tx: Prisma.TransactionClient) => Promise<void>,
  reason?: YouTubeRemovalReason): Promise<{ error: string | null }> {
  const result = await db.$transaction(async tx => {
    await lockYouTubeOwner(tx, userId);
    const tokens = await tx.$queryRaw<PlatformToken[]>`
      SELECT * FROM "PlatformToken"
      WHERE "userId" = ${userId} AND "platform" = 'youtube' FOR UPDATE
    `;
    const profiles = await tx.$queryRaw<{ id: string; connectedPlatforms: string[]; profileOrigin: string }[]>`
      SELECT "id", "connectedPlatforms", "profileOrigin" FROM "CreatorProfile"
      WHERE "userId" = ${userId} FOR UPDATE
    `;
    const profile = profiles[0];
    if (!profile && reason !== "DEADLINE_EXCEEDED" && reason !== "AUTHORIZATION_LOST") return { error: "Profile not found" };
    // Phase C: validate the version and consume proof after profile coordination,
    // before any destructive writes. A failed transaction restores the receipt.
    if (credentialGuard && !await credentialGuard(tokens[0] ?? null, tx)) return { error: "connection_changed" };

    await lockYouTubeCompliance(tx, userId);
    const now = await youtubeDatabaseNow(tx);
    const beforeStats = await tx.platformStats.findMany({ where: { userId, platform: "youtube" }, select: { followerCount: true } });
    const hadPosts = !!profile && await tx.socialPost.count({ where: { creatorProfileId: profile.id, platform: "youtube" } }) > 0;
    await tx.platformToken.deleteMany({ where: { userId, platform: "youtube" } });
    await tx.platformStats.deleteMany({ where: { userId, platform: "youtube" } });
    if (profile) {
      await tx.socialPost.deleteMany({ where: { creatorProfileId: profile.id, platform: "youtube" } });
      await tx.creatorContentCuration.deleteMany({ where: { creatorProfileId: profile.id, platform: "youtube" } });
    }

    if (profile) {
      const connectedPlatforms = profile.connectedPlatforms.filter(p => p !== "youtube");
      const remaining = await tx.platformStats.findMany({ where: { userId }, select: { followerCount: true, fetchedAt: true } });
      const aggregatePatch = youtubeAggregateRemovalPatch(profile.profileOrigin, beforeStats.length > 0, hadPosts, remaining);
      await tx.creatorProfile.update({ where: { userId }, data: { connectedPlatforms, ...aggregatePatch } });
    }
    const removalReason = reason ?? (tokens[0] ? "EXPLICIT_DISCONNECT" : "TOKENLESS_HISTORY");
    const marker = { status: "PURGED" as const, purgedAt: now, blockedAt: now, removalReason,
      authorizationLostAt: removalReason === "AUTHORIZATION_LOST" ? now : null,
      lastOutcome: removalReason === "AUTHORIZATION_LOST" ? "AUTHORIZATION_LOST" as const : null,
      leaseId: null, leaseExpiresAt: null, nextAttemptAt: null, deleteByAt: null };
    await tx.youTubeComplianceState.upsert({ where: { userId },
      create: { userId, ...marker, connectionGeneration: 1, revision: 1 },
      update: { ...marker, connectionGeneration: { increment: 1 }, revision: { increment: 1 } } });
    if (afterCleanup) await afterCleanup(tx);
    return { error: null };
  }, { maxWait: 5_000, timeout: 15_000 });
  if (!result.error) {
    // Next request contexts invalidate current readers after commit. CLI backfill
    // has no route cache context; persistence remains authoritative.
    try {
      const { revalidatePath } = await import("next/cache");
      for (const path of ["/creator/accounts", "/creator/settings", "/creator/content", "/creator/presence", "/creator/dashboard", "/creator/analytics", "/creator/discover", "/brand/discover", `/profile/${userId}`]) revalidatePath(path);
    } catch { /* Standalone planning/apply has no Next cache context. */ }
  }
  return result;
}
