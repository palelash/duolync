import "server-only";

import type { Prisma } from "@/lib/generated/prisma";

/**
 * Global Instagram auth/write lock order:
 * User -> Instagram PlatformToken (if present) -> CreatorProfile (if needed).
 * The User row coordinates reconnect even when no token exists. Acquire this
 * inside the caller's transaction, before any token/profile locks or writes.
 * Curation may lock only CreatorProfile; it must not then acquire either of
 * the preceding locks. Locks are released when the transaction finishes.
 */
export async function lockInstagramOwner(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE
  `;
  if (!rows[0]) throw new Error("instagram_owner_missing");
}
