"use server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { revokeYouTubeAuthorization, matchesRevokedYouTubeCredential, consumeConfirmedYouTubeRevoke, requireYouTubeRevokeConfirmation, deleteYouTubeRevokeReceipt, isYouTubeRevokeConfirmationUnavailable } from "@/lib/youtube-revoke";
import { removeYouTubeLocalData } from "@/lib/youtube-removal";

export type YouTubeDisconnectResult =
  | { ok: true; authorizationRevoked: boolean }
  | { ok: false; reason: "unauthorized" | "temporary_failure" | "provider_failure" | "configuration_failure" | "connection_changed"; error: string };

export async function disconnectYouTubeAction(): Promise<YouTubeDisconnectResult> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return { ok: false, reason: "unauthorized", error: "Please sign in to remove YouTube data." };
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await revokeYouTubeAuthorization(session.user.id);
        if (result.state !== "success" && result.state !== "authorization_gone") {
          return { ok: false, reason: result.state, error: result.state === "configuration_failure"
            ? "YouTube authorization could not be revoked. Please contact support."
            : result.state === "connection_changed" ? "YouTube connection changed. Please reload and try again."
            : "YouTube authorization could not be revoked. Please try again." };
        }
        const removed = await removeYouTubeLocalData(session.user.id,
          async (current, tx) => {
            if (!matchesRevokedYouTubeCredential(current, result.credential)) return false;
            if (current) requireYouTubeRevokeConfirmation(await consumeConfirmedYouTubeRevoke(tx, session.user.id, current));
            else await deleteYouTubeRevokeReceipt(tx, session.user.id, null);
            return true;
          });
        if (removed.error) return { ok: false, reason: removed.error === "connection_changed" ? "connection_changed" : "temporary_failure",
          error: removed.error === "connection_changed" ? "YouTube connection changed. Please reload and try again." : "Could not remove stored YouTube data. Please try again." };
        for (const path of ["/creator/accounts", "/creator/presence", "/creator/dashboard", "/creator/analytics"]) revalidatePath(path);
        return { ok: true, authorizationRevoked: result.state === "success" && result.authorizationRevoked };
      } catch (error) {
        if (attempt !== 0 || !isYouTubeRevokeConfirmationUnavailable(error)) throw error;
        // Receipt consumption lost to pruning/expiry. Re-establish exact proof
        // outside the rolled-back transaction, then retry cleanup once.
      }
    }
    return { ok: false, reason: "temporary_failure", error: "Could not complete YouTube removal. Please try again." };
  } catch { return { ok: false, reason: "temporary_failure", error: "Could not complete YouTube removal. Please try again." }; }
}
