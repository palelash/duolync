"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { renewThreadsToken } from "@/lib/threads-token";

export type ThreadsRenewResult =
  | { ok: true; reason: "renewed" | "not_due" }
  | { ok: false; reason: "unauthorized" | "reconnect_required" | "superseded" | "invalid_response" | "temporary_failure" };

/** No client owner/identity argument: only the authenticated user's authorization. */
export async function renewThreadsAuthorizationAction(): Promise<ThreadsRenewResult> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) return { ok: false, reason: "unauthorized" };
    const result = await renewThreadsToken(session.user.id);
    let bounded: ThreadsRenewResult;
    if (result.ok && (result.reason === "renewed" || result.reason === "not_due"))
      bounded = { ok: true, reason: result.reason };
    else if (result.reason === "missing_authorization" || result.reason === "invalid_authorization")
      bounded = { ok: false, reason: "reconnect_required" };
    else if (result.reason === "superseded" || result.reason === "invalid_response")
      bounded = { ok: false, reason: result.reason };
    else bounded = { ok: false, reason: "temporary_failure" };
    // A cache failure must not turn a committed renewal into a reported failure.
    try {
      revalidatePath("/creator/presence");
      revalidatePath("/creator/dashboard");
    } catch { /* Connection readers still use current server time. */ }
    return bounded;
  } catch {
    return { ok: false, reason: "temporary_failure" };
  }
}
