import "server-only";
import type { Prisma } from "@/lib/generated/prisma";

/** Shared order: User -> provider token -> CreatorProfile -> datasets.
 * Claims lock sorted Users before all tokens/profiles; no HTTP under locks. */
export async function lockThreadsOwner(tx: Prisma.TransactionClient, userId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE
  `;
  if (!rows[0]) throw new Error("threads_owner_missing");
}
export async function lockThreadsConnection(tx: Prisma.TransactionClient, userId: string) {
  await lockThreadsOwner(tx, userId);
  await tx.$queryRaw`SELECT "id" FROM "PlatformToken" WHERE "userId" = ${userId} AND "platform" = 'threads' FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "CreatorProfile" WHERE "userId" = ${userId} FOR UPDATE`;
}
