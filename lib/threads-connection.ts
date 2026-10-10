import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma";
import { threadsAuthorityId } from "@/lib/threads-auth";
import { lockThreadsConnection } from "@/lib/threads-lock";
import { computeFollowerCache } from "@/lib/creator-metrics";
import { threadsProviderId } from "@/lib/threads-token";

async function cache(tx: Prisma.TransactionClient, userId: string, connected: boolean) {
  const profile = await tx.creatorProfile.findUnique({ where: { userId } });
  if (!profile) return;
  const stats = await tx.platformStats.findMany({ where: { userId }, select: { followerCount: true } });
  const platforms = profile.connectedPlatforms.filter(p => p !== "threads");
  if (connected) platforms.push("threads");
  await tx.creatorProfile.update({ where: { userId }, data: { connectedPlatforms: platforms,
    followerCount: computeFollowerCache(stats), lastSyncedAt: connected ? new Date() : platforms.length ? undefined : null } });
}
export async function saveThreadsConnection(userId: string, sessionId: string, state: string,
  data: { accessToken: string; expiresAt: Date; platformUserId: string; username: string | null }) {
  threadsProviderId(data.platformUserId);
  return db.$transaction(async tx => {
    await lockThreadsConnection(tx, userId);
    const now = new Date();
    const authority = await tx.verification.findUnique({ where: { id: threadsAuthorityId(userId) } });
    const session = await tx.session.findUnique({ where: { id: sessionId }, select: { userId: true, expiresAt: true } });
    if (!authority || authority.value !== state || authority.expiresAt <= now ||
        !session || session.userId !== userId || session.expiresAt <= now) return false;
    const profile = await tx.creatorProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) throw new Error("threads_profile_missing");
    const old = await tx.platformToken.findUnique({ where: { userId_platform: { userId, platform: "threads" } } });
    if (old?.platformUserId !== data.platformUserId) {
      await tx.socialPost.deleteMany({ where: { creatorProfileId: profile.id, platform: "threads" } });
      await tx.creatorContentCuration.deleteMany({ where: { creatorProfileId: profile.id, platform: "threads" } });
    }
    // Recreate the marker from received official identity only. No inherited metrics.
    await tx.platformStats.deleteMany({ where: { userId, platform: "threads" } });
    await tx.platformToken.upsert({ where: { userId_platform: { userId, platform: "threads" } },
      create: { userId, platform: "threads", ...data, refreshToken: null, scopes: "threads_basic" },
      update: { ...data, refreshToken: null, scopes: "threads_basic" } });
    await tx.platformStats.create({ data: { userId, platform: "threads", providerAccountId: data.platformUserId,
      dataSource: "OFFICIAL_API", raw: data.username ? { handle: data.username } : {} } });
    await cache(tx, userId, true);
    await tx.verification.deleteMany({ where: { id: threadsAuthorityId(userId), value: state } });
    return true;
  });
}
export async function disconnectThreads(userId: string) {
  await db.$transaction(async tx => {
    await lockThreadsConnection(tx, userId);
    await tx.verification.deleteMany({ where: { identifier: threadsAuthorityId(userId) } });
    await tx.platformToken.deleteMany({ where: { userId, platform: "threads" } });
    await tx.platformStats.deleteMany({ where: { userId, platform: "threads" } });
    const profile = await tx.creatorProfile.findUnique({ where: { userId }, select: { id: true } });
    if (profile) {
      await tx.socialPost.deleteMany({ where: { creatorProfileId: profile.id, platform: "threads" } });
      await tx.creatorContentCuration.deleteMany({ where: { creatorProfileId: profile.id, platform: "threads" } });
      await cache(tx, userId, false);
    }
  });
}
/** Caller already holds sorted claim owner/token/profile locks. */
export async function guardThreadsClaim(tx: Prisma.TransactionClient, source: string, destination: string) {
  if (await tx.platformToken.count({ where: { userId: source, platform: "threads" } }))
    throw new Error("PLACEHOLDER_HAS_TOKEN");
  const destinationToken = await tx.platformToken.count({ where: { userId: destination, platform: "threads" } });
  if (destinationToken && (
    await tx.platformStats.count({ where: { userId: source, platform: "threads" } }) ||
    await tx.socialPost.count({ where: { creatorProfile: { userId: source }, platform: "threads" } }) ||
    await tx.creatorContentCuration.count({ where: { creatorProfile: { userId: source }, platform: "threads" } })))
    throw new Error("THREADS_IDENTITY_REQUIRES_MANUAL_REVIEW");
}
