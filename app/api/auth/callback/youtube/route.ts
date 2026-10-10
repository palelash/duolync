import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { resolveYouTubeChannelIdentity, syncYouTubeOfficialData } from "@/lib/youtube-sync";

import { GOOGLE_TOKEN_URL, parseYouTubeTokenResponse, consumeYouTubeState,
  youtubeCallbackUri, youtubeAppUrl, youtubeFetch,
  YOUTUBE_STATE_COOKIE, YOUTUBE_STATE_OPTIONS, type YouTubeParsedToken } from "@/lib/youtube-auth";
import { saveYouTubeAccessToken } from "@/lib/youtube-token";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);

  // Validate the signed initiating session before success OR provider errors.
  let session: Awaited<ReturnType<typeof auth.api.getSession>>;
  try { session = await auth.api.getSession({ headers: req.headers }); }
  catch { return redir(req, "/creator/presence", { youtube_error: "temporary_failure" }); }
  try {
    if (!await consumeYouTubeState(req.cookies.get(YOUTUBE_STATE_COOKIE)?.value,
      searchParams.get("state"), session?.user?.id, session?.session?.id)) {
      return redir(req, "/creator/presence", { youtube_error: "invalid_state" });
    }
  } catch { return redir(req, "/creator/presence", { youtube_error: "temporary_failure" }); }
  const userId = session!.user.id;
  const oauthError = searchParams.get("error");
  if (oauthError) return redir(req, "/creator/presence", {
    youtube_error: oauthError === "access_denied" ? "access_denied" : "temporary_failure",
  });
  const code = searchParams.get("code");
  if (!code) return redir(req, "/creator/presence", { youtube_error: "missing_code" });

  // ── Env vars ───────────────────────────────────────────────────────────────
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return redir(req, "/creator/presence", {
      youtube_error: "server_misconfiguration",
    });
  }

  // ── Token exchange ─────────────────────────────────────────────────────────
  let parsedToken: YouTubeParsedToken | null;
  try {
    const res = await youtubeFetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: youtubeCallbackUri(), grant_type: "authorization_code" }).toString(),
    });
    parsedToken = parseYouTubeTokenResponse(await res.json());
    if (!res.ok || !parsedToken) return redir(req, "/creator/presence", { youtube_error: "temporary_failure" });
  } catch {
    return redir(req, "/creator/presence", { youtube_error: "temporary_failure" });
  }
  const { accessToken } = parsedToken;

  let channel;
  try { channel = await resolveYouTubeChannelIdentity(accessToken); }
  catch { return redir(req, "/creator/presence", { youtube_error: "temporary_failure" }); }
  if (!channel) return redir(req, "/creator/presence", { youtube_error: "no_youtube_channel" });

  try {
    // OAuth reconnect explicitly selects the authoritative channel. Shared sync
    // receives this exact saved version and cannot write through a newer reconnect.
    const credential = await saveYouTubeAccessToken(userId, {
      ...parsedToken, platformUserId: channel.id, username: channel.username,
    });
    const result = await syncYouTubeOfficialData(userId, { credential });
    if (!result.ok) return redir(req, "/creator/presence", {
      youtube_error: result.reason === "superseded" ? "temporary_failure" : result.reason,
    });
    for (const path of ["/creator/accounts", "/creator/presence", "/creator/dashboard", "/creator/analytics"]) revalidatePath(path);
  } catch {
    return redir(req, "/creator/presence", { youtube_error: "temporary_failure" });
  }

  // Clear the state cookie on success
  const successRes = redir(req, "/creator/presence", {
    youtube_connected: channel.title ?? "1",
  });
  return successRes;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function redir(
  req: NextRequest,
  path: string,
  params: Record<string, string>,
): NextResponse {
  let base: string;
  try { base = youtubeAppUrl(); }
  catch { return new NextResponse("YouTube configuration unavailable", { status: 500 }); }
  const url = new URL(path, base);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const response = NextResponse.redirect(url.toString());
  response.cookies.set(YOUTUBE_STATE_COOKIE, "", { ...YOUTUBE_STATE_OPTIONS, maxAge: 0 });
  // Clear the legacy browser-written cookie as well during migration.
  response.cookies.set("__youtube_state", "", { ...YOUTUBE_STATE_OPTIONS, path: "/", maxAge: 0 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
