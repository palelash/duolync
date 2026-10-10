import "server-only";
import type { Prisma } from "@/lib/generated/prisma";
import { lockYouTubeOwner } from "@/lib/youtube-lock";
import { lockYouTubeCompliance } from "@/lib/youtube-compliance";

/** Conservative Pass 3B-1: reject ownership movement involving any established
 * lifecycle or official source connection. No block or deadline can be lost.
 * Both owners sorted -> all provider tokens -> both profiles -> both compliance rows.
 */
/** Shared claim mutation protocol, including submission/rejection. All referenced
 * Users (reviewer too) sorted -> ALL provider tokens -> profiles -> compliance -> claim rows.
 * Token row order is userId (outer loop), then platform, then token id.
 * Rejection/submission coordinate without rejecting compliance state. */
export async function lockClaimOwners(tx: Prisma.TransactionClient, userIds: string[]): Promise<void> {
  const owners = [...new Set(userIds)].sort();
  for (const id of owners) await lockYouTubeOwner(tx, id);
  // Claims can move any provider credential later. Lock every existing row
  // before profiles, matching token-first TikTok cleanup and owner-first
  // Instagram/YouTube paths. Never depend on an unordered scan for row locks.
  for (const id of owners) await tx.$queryRaw`
    SELECT "id" FROM "PlatformToken" WHERE "userId" = ${id}
    ORDER BY "platform", "id" FOR UPDATE
  `;
  for (const id of owners) await tx.$queryRaw`SELECT "id" FROM "CreatorProfile" WHERE "userId" = ${id} FOR UPDATE`;
  for (const id of owners) await lockYouTubeCompliance(tx, id);
}

export async function guardYouTubeClaim(tx: Prisma.TransactionClient, source: string, destination: string,
  reviewer?: string): Promise<void> {
  const owners = [...new Set([source, destination])].sort();
  await lockClaimOwners(tx, reviewer ? [...owners, reviewer] : owners);
  for (const id of owners) {
    if (await tx.youTubeComplianceState.findUnique({ where: { userId: id } })) throw new Error("YOUTUBE_COMPLIANCE_REQUIRES_MANUAL_REVIEW");
  }
  const official = await tx.platformToken.count({ where: { userId: { in: owners }, platform: "youtube" } });
  const history = await tx.platformStats.count({ where: { userId: source, platform: "youtube", dataSource: "OFFICIAL_API" } });
  const posts = await tx.socialPost.count({ where: { creatorProfile: { userId: source }, platform: "youtube", dataSource: "OFFICIAL_API" } });
  if (official || history || posts) throw new Error("YOUTUBE_COMPLIANCE_REQUIRES_MANUAL_REVIEW");
}
