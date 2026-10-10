import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { threadsAppUrl, buildThreadsAuthUrl, createThreadsState, THREADS_STATE_COOKIE, THREADS_STATE_OPTIONS } from "@/lib/threads-auth";

export async function GET(req: NextRequest) {
  let origin: string;
  try { origin = threadsAppUrl(); }
  catch { return new NextResponse("Threads configuration unavailable", { status: 500 }); }
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user?.id || !session.session?.id) return NextResponse.redirect(new URL("/auth", origin));
    // Validate all config before issuing durable state.
    buildThreadsAuthUrl("configuration-check");
    const { state, cookie } = await createThreadsState(session.user.id, session.session.id);
    const response = NextResponse.redirect(buildThreadsAuthUrl(state));
    response.cookies.set(THREADS_STATE_COOKIE, cookie, THREADS_STATE_OPTIONS);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return NextResponse.redirect(new URL("/creator/presence?threads_error=temporary_failure", origin));
  }
}
