import { config } from "dotenv";
import { validateYouTubeDatabaseConfig, youtubeBackfillMode } from "../lib/youtube-maintenance-config";
config({ quiet: true });

let closeDatabase: (() => Promise<void>) | undefined;
async function main() {
  const mode = youtubeBackfillMode(process.argv.slice(2));
  validateYouTubeDatabaseConfig();
  const database = await import("../lib/db");
  const db = database.db; closeDatabase = database.closeDatabase;
  const { removeYouTubeLocalData } = await import("../lib/youtube-removal");
  const { planYouTubeBootstrap } = await import("../lib/youtube-bootstrap");
  const { lockYouTubeCompliance, youtubeDatabaseNow } = await import("../lib/youtube-compliance");
  const { lockYouTubeOwner } = await import("../lib/youtube-lock");
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
main().catch(() => { console.error("YouTube backfill failed; no identifying data logged."); process.exitCode = 1; }).finally(async () => {
  try { await closeDatabase?.(); }
  catch { console.error("YouTube backfill shutdown failed."); process.exitCode = 1; }
});
