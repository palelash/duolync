import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { threadsAppUrl, consumeThreadsState, THREADS_STATE_COOKIE } from "@/lib/threads-auth";
import { exchangeThreadsCode, ThreadsProviderError } from "@/lib/threads-token";
import { saveThreadsConnection } from "@/lib/threads-connection";

export async function GET(req: NextRequest): Promise<NextResponse> {
  let origin: string;
  try { origin = threadsAppUrl(); }
  catch {
    return NextResponse.redirect(new URL("/creator/presence?threads_error=server_misconfiguration",
      process.env.NODE_ENV === "production" ? "https://duolync.com" : "http://localhost:3000"));
  }
  const redirect = (key: string, value: string) => {
    const url = new URL("/creator/presence", origin);
    url.searchParams.set(key, value);
    const response = NextResponse.redirect(url);
    // Let the five-minute cookie expire: a late A response must not clear B's
    // newer cookie. Durable state consumption still rejects every replay.
    response.headers.set("Cache-Control", "no-store");
    return response;
  };
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user?.id || !session.session?.id) return redirect("threads_error", "unauthenticated");
    const params = req.nextUrl.searchParams, state = params.get("state");
    if (!await consumeThreadsState(req.cookies.get(THREADS_STATE_COOKIE)?.value, state, session.user.id, session.session.id))
      return redirect("threads_error", "invalid_state");
    if (params.has("error")) return redirect("threads_error", "authorization_denied");
    const code = params.get("code");
    if (!code || code.length > 4096) return redirect("threads_error", "missing_code");
    const data = await exchangeThreadsCode(code);
    if (!await saveThreadsConnection(session.user.id, session.session.id, state!, data))
      return redirect("threads_error", "superseded");
    // Cache invalidation is best-effort after the committed connection.
    try { revalidatePath("/creator/presence"); } catch { /* committed successfully */ }
    return redirect("threads_connected", data.username ?? "1");
  } catch (error) {
    return redirect("threads_error", error instanceof ThreadsProviderError ? error.kind : "temporary_failure");
  }
}
