import "server-only";
import { createHmac, randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { db } from "@/lib/db";
import { lockThreadsOwner } from "@/lib/threads-lock";

export const THREADS_STATE_COOKIE = "__threads_oauth_state";
export const THREADS_STATE_OPTIONS = { httpOnly: true, secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const, path: "/api/auth", maxAge: 300 };
export function threadsAppUrl(): string {
  const url = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "");
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      (url.protocol !== "https:" && (process.env.NODE_ENV === "production" || url.protocol !== "http:")) ||
      (process.env.NODE_ENV === "production" && url.origin !== "https://duolync.com"))
    throw new Error("threads_configuration_error");
  return url.origin;
}
export function threadsCallbackUri() { return `${threadsAppUrl()}/api/auth/callback/threads`; }
export function threadsConfig() {
  const appId = process.env.NEXT_PUBLIC_THREADS_APP_ID, secret = process.env.THREADS_APP_SECRET;
  if (!appId?.trim() || !secret?.trim()) throw new Error("threads_configuration_error");
  return { appId, secret, redirectUri: threadsCallbackUri() };
}
function sign(state: string) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("threads_configuration_error");
  return createHmac("sha256", secret).update(`threads-oauth:${state}`).digest("base64url");
}
export function threadsAuthorityId(userId: string) {
  return `threads-oauth-authority:${createHash("sha256").update(userId).digest("hex")}`;
}
export async function createThreadsState(userId: string, sessionId: string, now = Date.now()) {
  const state = randomBytes(32).toString("base64url"), cookie = `${state}.${sign(state)}`;
  const id = `threads-oauth-state:${state}`, authority = threadsAuthorityId(userId);
  await db.$transaction(async tx => {
    await lockThreadsOwner(tx, userId);
    const owner = await tx.user.findUnique({ where: { id: userId }, select: { isImported: true } });
    if (!owner || owner.isImported || !await tx.creatorProfile.findUnique({ where: { userId }, select: { id: true } }))
      throw new Error("threads_owner_invalid");
    // A new start supersedes all earlier authorizations, including consumed in-flight callbacks.
    await tx.verification.deleteMany({ where: { identifier: authority } });
    const dates = { createdAt: new Date(now), updatedAt: new Date(now), expiresAt: new Date(now + 300_000) };
    await tx.verification.create({ data: { id, identifier: authority,
      value: JSON.stringify({ userId, sessionId }), ...dates } });
    await tx.verification.upsert({ where: { id: authority },
      create: { id: authority, identifier: authority, value: state, ...dates },
      update: { value: state, ...dates } });
  });
  return { state, cookie };
}
export async function consumeThreadsState(cookie: string | undefined, state: string | null,
  userId: string | undefined, sessionId: string | undefined, now = Date.now()): Promise<boolean> {
  if (!cookie || !state || !userId || !sessionId || !/^[A-Za-z0-9_-]{43}$/.test(state)) return false;
  try {
    const parts = cookie.split("."), expected = Buffer.from(sign(state)), actual = Buffer.from(parts[1] ?? "");
    if (parts.length !== 2 || parts[0] !== state || expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
  } catch { return false; }
  return db.$transaction(async tx => {
    await lockThreadsOwner(tx, userId);
    const authority = await tx.verification.findUnique({ where: { id: threadsAuthorityId(userId) } });
    if (!authority || authority.value !== state || authority.expiresAt.getTime() <= now) return false;
    const result = await tx.verification.deleteMany({ where: { id: `threads-oauth-state:${state}`,
      value: JSON.stringify({ userId, sessionId }), createdAt: { lte: new Date(now) }, expiresAt: { gt: new Date(now) } } });
    return result.count === 1;
  });
}
export function buildThreadsAuthUrl(state: string) {
  const { appId, redirectUri } = threadsConfig();
  const url = new URL("https://threads.net/oauth/authorize");
  url.search = new URLSearchParams({ client_id: appId, redirect_uri: redirectUri,
    scope: "threads_basic", response_type: "code", state }).toString();
  return url.toString();
}
