import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildYouTubeAuthUrl, createYouTubeState, youtubeAppUrl,
  YOUTUBE_STATE_COOKIE, YOUTUBE_STATE_OPTIONS } from "@/lib/youtube-auth";

export async function GET(req: NextRequest): Promise<NextResponse> {
  let appUrl: string;
  try { appUrl = youtubeAppUrl(); }
  catch { return new NextResponse("YouTube configuration unavailable", { status: 500 }); }
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user?.id || !session.session?.id) return NextResponse.redirect(new URL("/auth", appUrl));
    const creator = await db.creatorProfile.findUnique({ where: { userId: session.user.id }, select: { id: true } });
    if (!creator) return new NextResponse("Creator account required", { status: 403 });
    const current = await db.platformToken.findUnique({
      where: { userId_platform: { userId: session.user.id, platform: "youtube" } },
      select: { refreshToken: true },
    });
    const { state, cookie } = await createYouTubeState(session.user.id, session.session.id);
    // recovery=1 is an explicit consent retry if a newly selected channel did not
    // return a refresh token. It conveys no owner/credential identity.
    const response = NextResponse.redirect(buildYouTubeAuthUrl(state,
      !current?.refreshToken?.trim() || req.nextUrl.searchParams.get("recovery") === "1"));
    response.cookies.set(YOUTUBE_STATE_COOKIE, cookie, YOUTUBE_STATE_OPTIONS);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    const url = new URL("/creator/accounts", appUrl);
    url.searchParams.set("youtube_error", "temporary_failure");
    return NextResponse.redirect(url);
  }
}
