"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { computeFollowerCache } from "@/lib/creator-metrics";
import { lockInstagramOwner } from "@/lib/instagram-lock";

export type InstagramDisconnectResult =
  | { ok: true }
  | { ok: false; reason: "unauthorized" | "profile_not_found" | "temporary_failure" };

/** Explicit local removal, including history without a token. Does not revoke Meta authorization. */
export async function disconnectInstagramAction(): Promise<InstagramDisconnectResult> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) return { ok: false, reason: "unauthorized" };
    const userId = session.user.id;

    const result = await db.$transaction(async (tx): Promise<InstagramDisconnectResult> => {
      await lockInstagramOwner(tx, userId);
      const profile = await tx.creatorProfile.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (!profile) return { ok: false, reason: "profile_not_found" };

      // Global order: stable User first, token second, creator profile third.
      // Curation mutations lock this same profile before validating a post;
      // hold it before cleanup, including when no token row remains.
      await tx.$queryRaw`
        SELECT "id" FROM "PlatformToken"
        WHERE "userId" = ${userId} AND "platform" = 'instagram'
        FOR UPDATE
      `;
      await tx.$queryRaw`
        SELECT id FROM "CreatorProfile"
        WHERE id = ${profile.id}
        FOR UPDATE
      `;

      await tx.platformToken.deleteMany({ where: { userId, platform: "instagram" } });
      await tx.platformStats.deleteMany({ where: { userId, platform: "instagram" } });
      await tx.socialPost.deleteMany({ where: { creatorProfileId: profile.id, platform: "instagram" } });
      await tx.creatorContentCuration.deleteMany({ where: { creatorProfileId: profile.id, platform: "instagram" } });

      // Remove only this marker from the current array, without overwriting a
      // concurrent update to another platform with a stale array snapshot.
      await tx.$executeRaw`
        UPDATE "CreatorProfile"
        SET "connectedPlatforms" = array_remove("connectedPlatforms", 'instagram')
        WHERE "userId" = ${userId}
      `;
      const currentProfile = await tx.creatorProfile.findUniqueOrThrow({
        where: { userId },
        select: { connectedPlatforms: true },
      });
      const remaining = await tx.platformStats.findMany({
        where: { userId },
        select: { followerCount: true },
      });
      await tx.creatorProfile.update({
        where: { userId },
        data: {
          followerCount: computeFollowerCache(remaining),
          lastSyncedAt: currentProfile.connectedPlatforms.length === 0 ? null : undefined,
        },
      });
      return { ok: true };
    });
    if (!result.ok) return result;
  } catch {
    console.warn("[disconnectInstagramAction] local cleanup failed");
    return { ok: false, reason: "temporary_failure" };
  }

  // Cleanup has committed; a cache invalidation failure must not imply rollback.
  try {
    for (const path of ["/creator/accounts", "/creator/presence", "/creator/dashboard", "/creator/analytics"]) revalidatePath(path);
  } catch {
    console.warn("[disconnectInstagramAction] cache invalidation failed");
  }
  return { ok: true };
}
