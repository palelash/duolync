"use server";

/**
 * app/actions/tiktok-sync.ts
 *
 * Server action for manual TikTok data refresh.
 *
 * Security:
 *  - Takes NO userId argument — always authenticates via session.
 *  - A client can never request sync for another user.
 *  - Never returns tokens, raw TikTok bodies, or provider detail strings.
 */

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { syncTikTokOfficialData } from "@/lib/tiktok-sync";

// ── Client-safe result type ────────────────────────────────────────────────────

export type TikTokSyncActionResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "unauthorized"
        | "not_connected"
        | "reauth_required"
        | "temporary_failure"
        | "configuration_error"
        | "identity_mismatch";
    };

// ── Action ─────────────────────────────────────────────────────────────────────

/**
 * Refreshes TikTok profile metadata, follower stats, and public videos for the
 * currently authenticated creator without starting a new OAuth flow.
 *
 * Returns a small client-safe result object — never provider details or tokens.
 */
export async function refreshTikTokDataAction(): Promise<TikTokSyncActionResult> {
  // Authenticate via session — client cannot inject a userId.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return { ok: false, reason: "unauthorized" };
  }

  const userId = session.user.id;

  const result = await syncTikTokOfficialData(userId);

  if (result.ok) {
    // Success: revalidate pages that display TikTok data.
    revalidatePath("/creator/presence");
    revalidatePath("/creator/accounts");
    return { ok: true };
  }

  // reauth_required: the PlatformToken was removed by the token lifecycle —
  // revalidate so the UI transitions to "Reconnect TikTok" naturally.
  if (result.reason === "reauth_required") {
    revalidatePath("/creator/presence");
    revalidatePath("/creator/accounts");
    return { ok: false, reason: "reauth_required" };
  }

  // All other failures: return the reason for UI feedback.
  // No revalidatePath — existing UI/data should remain unchanged.
  return { ok: false, reason: result.reason };
}
