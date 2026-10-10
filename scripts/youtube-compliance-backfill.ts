import "dotenv/config";
import { db } from "../lib/db";
import { lockYouTubeOwner } from "../lib/youtube-lock";
import { lockYouTubeCompliance, youtubeDatabaseNow } from "../lib/youtube-compliance";
import { planYouTubeBootstrap } from "../lib/youtube-bootstrap";
import { removeYouTubeLocalData } from "../lib/youtube-removal";

async function main() {
  const mode = process.argv[2];
  if (mode !== "--plan" && mode !== "--apply") throw new Error("Specify --plan or --apply");
  const counts: Record<string, number> = {};
  let cursor: string | undefined;
  for (;;) {
    const users = await db.user.findMany({ orderBy: { id: "asc" }, take: 100,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: { id: true } });
    if (!users.length) break;
    for (const { id: userId } of users) {
      const kind = await db.$transaction(async tx => {
        await lockYouTubeOwner(tx, userId);
        const tokens = await tx.$queryRaw<{ platformUserId: string | null }[]>`SELECT "platformUserId" FROM "PlatformToken" WHERE "userId" = ${userId} AND "platform" = 'youtube' FOR UPDATE`;
        const profiles = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "CreatorProfile" WHERE "userId" = ${userId} FOR UPDATE`;
        const state = await lockYouTubeCompliance(tx, userId);
        const stats = await tx.platformStats.findUnique({ where: { userId_platform: { userId, platform: "youtube" } } });
        const officialPosts = profiles[0] ? await tx.socialPost.count({ where: { creatorProfileId: profiles[0].id, platform: "youtube", dataSource: "OFFICIAL_API" } }) > 0 : false;
        const oldestPost = profiles[0] ? await tx.socialPost.findFirst({ where: { creatorProfileId: profiles[0].id, platform: "youtube", dataSource: "OFFICIAL_API" }, orderBy: { fetchedAt: "asc" }, select: { fetchedAt: true } }) : null;
        const now = await youtubeDatabaseNow(tx);
        const plan = planYouTubeBootstrap({ state, token: tokens[0] ?? null, stats, officialPosts, oldestOfficialPostAt: oldestPost?.fetchedAt }, now);
        if (mode === "--apply" && plan.kind === "ACTIVE") await tx.youTubeComplianceState.create({ data: {
          userId, status: "ACTIVE", connectionGeneration: 1, revision: 1,
          lastSuccessfulDataRefreshAt: plan.refreshAt, nextAttemptAt: plan.nextAttemptAt, deleteByAt: plan.deleteByAt,
        } });
        return plan.kind;
      });
      if (mode === "--apply" && kind === "PURGE") {
        // Revalidate after releasing planning locks. Reconnect/another apply wins.
        const removed = await removeYouTubeLocalData(userId, async (token, tx) =>
          !token && !await tx.youTubeComplianceState.findUnique({ where: { userId } }), undefined, "TOKENLESS_HISTORY");
        counts[removed.error ? "REVALIDATION_SKIPPED" : "PURGED"] = (counts[removed.error ? "REVALIDATION_SKIPPED" : "PURGED"] ?? 0) + 1;
      }
      counts[kind] = (counts[kind] ?? 0) + 1;
    }
    cursor = users[users.length - 1].id;
  }
  console.log(JSON.stringify({ mode, counts }));
}
main().catch(() => { console.error("YouTube backfill failed; no identifying data logged."); process.exitCode = 1; }).finally(() => db.$disconnect());
