"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { syncInstagramOfficialData, type InstagramSyncResult } from "@/lib/instagram-sync";

export type InstagramSyncActionResult = InstagramSyncResult | { ok: false; reason: "unauthorized" };

/** Session-owned refresh; accepts no client identity and returns no provider detail. */
export async function refreshInstagramDataAction(): Promise<InstagramSyncActionResult> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) return { ok: false, reason: "unauthorized" };
    const result = await syncInstagramOfficialData(session.user.id);
    if (result.ok || result.reason === "reauth_required") {
      for (const path of ["/creator/accounts", "/creator/presence", "/creator/dashboard", "/creator/analytics"]) revalidatePath(path);
    }
    return result;
  } catch {
    return { ok: false, reason: "temporary_failure" };
  }
}
