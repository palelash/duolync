"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { syncYouTubeOfficialData } from "@/lib/youtube-sync";

export type YouTubeSyncActionResult = { ok: true } | { ok: false; reason:
  "unauthorized" | "not_connected" | "reauth_required" | "identity_mismatch" |
  "temporary_failure" | "configuration_failure" | "provider_failure" };

/** Session owns the identity. Internal version/range states never expose provider detail. */
export async function refreshYouTubeDataAction(): Promise<YouTubeSyncActionResult> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) return { ok: false, reason: "unauthorized" };
    const result = await syncYouTubeOfficialData(session.user.id);
    if (result.ok || result.reason === "reauth_required") {
      for (const path of ["/creator/accounts", "/creator/presence", "/creator/dashboard", "/creator/analytics"]) revalidatePath(path);
    }
    if (result.ok) return { ok: true };
    const reason = result.reason;
    if (reason === "superseded") return { ok: false, reason: "temporary_failure" };
    if (reason === "counter_range") return { ok: false, reason: "configuration_failure" };
    return { ok: false, reason };
  } catch { return { ok: false, reason: "temporary_failure" }; }
}
