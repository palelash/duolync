import "server-only";
import { db } from "@/lib/db";
import { lockYouTubeOwner } from "@/lib/youtube-lock";
import { computeFollowerCache } from "@/lib/creator-metrics";
import type { PlatformToken, Prisma } from "@/lib/generated/prisma";

/** Coordinated local YouTube cleanup. Same coordination domain as reconnect/refresh,
 * including history-only accounts: User -> token -> profile -> dataset.
 */
export async function removeYouTubeLocalData(userId: string,
  credentialGuard?: (current: PlatformToken | null, tx: Prisma.TransactionClient) => boolean | Promise<boolean>,
  afterCleanup?: (tx: Prisma.TransactionClient) => Promise<void>): Promise<{ error: string | null }> {
  return db.$transaction(async tx => {
    await lockYouTubeOwner(tx, userId);
    const tokens = await tx.$queryRaw<PlatformToken[]>`
      SELECT * FROM "PlatformToken"
      WHERE "userId" = ${userId} AND "platform" = 'youtube' FOR UPDATE
    `;
    const profiles = await tx.$queryRaw<{ id: string; connectedPlatforms: string[] }[]>`
      SELECT "id", "connectedPlatforms" FROM "CreatorProfile"
      WHERE "userId" = ${userId} FOR UPDATE
    `;
    const profile = profiles[0];
    if (!profile) return { error: "Profile not found" };
    // Phase C: validate the version and consume proof after profile coordination,
    // before any destructive writes. A failed transaction restores the receipt.
    if (credentialGuard && !await credentialGuard(tokens[0] ?? null, tx)) return { error: "connection_changed" };

    await tx.platformToken.deleteMany({ where: { userId, platform: "youtube" } });
    await tx.platformStats.deleteMany({ where: { userId, platform: "youtube" } });
    await tx.socialPost.deleteMany({ where: { creatorProfileId: profile.id, platform: "youtube" } });
    await tx.creatorContentCuration.deleteMany({ where: { creatorProfileId: profile.id, platform: "youtube" } });

    const connectedPlatforms = profile.connectedPlatforms.filter(p => p !== "youtube");
    const remaining = await tx.platformStats.findMany({ where: { userId }, select: { followerCount: true } });
    const followerCount = computeFollowerCache(remaining);
    await tx.creatorProfile.update({ where: { userId }, data: {
      connectedPlatforms, followerCount,
      lastSyncedAt: connectedPlatforms.length === 0 ? null : undefined,
    } });
    if (afterCleanup) await afterCleanup(tx);
    return { error: null };
  }, { maxWait: 5_000, timeout: 15_000 });
}
