import "server-only";
import type { Prisma } from "@/lib/generated/prisma";

/** Global YouTube lock order: User -> PlatformToken (if present) -> CreatorProfile -> YouTubeComplianceState -> dataset.
 * The stable owner exists even before the first token. Missing owners fail closed.
 */
export async function lockYouTubeOwner(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE
  `;
  if (!rows[0]) throw new Error("youtube_owner_missing");
}
