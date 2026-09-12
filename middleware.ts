import { NextRequest, NextResponse } from "next/server";
import { getMiddlewareSession } from "@/lib/middleware-session";

/**
 * Edge-safe admin role check.
 * ⚠️  Do NOT import from @/lib/roles here — that module imports from the
 * Prisma-generated client which uses require('./runtime/client.js'), a
 * Node.js-only module incompatible with the Edge runtime middleware runs on.
 * Inline a plain string comparison instead.
 */
function isAdminRole(role: unknown): boolean {
  const r = String(role ?? "").toUpperCase();
  return r === "ADMIN";
}

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/messages",
  "/feed",
  "/community",
  "/brand",
  "/creator",
  "/profile",
] as const;

const ADMIN_PREFIX = "/admin";
const SIGN_IN_PATH = "/sign-in";
const ONBOARDING_PATH = "/onboarding";
const DASHBOARD_PATH = "/dashboard";

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isAdminPath(pathname: string): boolean {
  return pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = isProtectedPath(pathname);
  const isOnboardingRoute = pathname === ONBOARDING_PATH;
  const isAdminRoute = isAdminPath(pathname);

  if (!isProtected && !isOnboardingRoute && !isAdminRoute) {
    return NextResponse.next();
  }

  // Bypass cookie cache so onboarding completion is reflected immediately.
  const session = await getMiddlewareSession(request, {
    disableCookieCache: true,
  });

  // ── Admin guard ──────────────────────────────────────────────────────────
  if (isAdminRoute) {
    if (!session?.user) {
      const signInUrl = request.nextUrl.clone();
      signInUrl.pathname = SIGN_IN_PATH;
      signInUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(signInUrl);
    }

    if (!isAdminRole(session.user.role)) {
      const homeUrl = request.nextUrl.clone();
      homeUrl.pathname = "/";
      homeUrl.search = "";
      return NextResponse.redirect(homeUrl);
    }

    return NextResponse.next();
  }

  // ── Standard authenticated routes ────────────────────────────────────────

  // (a) Unauthenticated → sign-in
  if (!session?.user) {
    const signInUrl = request.nextUrl.clone();
    signInUrl.pathname = SIGN_IN_PATH;
    signInUrl.searchParams.set(
      "callbackUrl",
      `${pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(signInUrl);
  }

  // Banned users are redirected to sign-in for ALL non-admin routes.
  // Admins cannot be banned (the banUser action prevents it), so we check
  // BEFORE the admin bypass so even a misconfigured admin row is still protected.
  if (session.user.banned && !isAdminRole(session.user.role)) {
    const url = request.nextUrl.clone();
    url.pathname = SIGN_IN_PATH;
    url.search = "?error=account_suspended";
    return NextResponse.redirect(url);
  }

  // Admin users skip the onboarding gate and all other regular-path guards.
  // They land on /admin directly; they have no creator/brand profile to onboard.
  // This also prevents the redirect loop that occurs when an admin visits a
  // creator/brand route — the server lets them through, and ProtectedRoute
  // (client-side) redirects them to /admin instead.
  if (isAdminRole(session.user.role)) {
    return NextResponse.next();
  }

  const onboardingComplete = Boolean(session.user.hasCompletedOnboarding);

  // (c) Onboarded user visiting /onboarding → dashboard
  if (isOnboardingRoute && onboardingComplete) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = DASHBOARD_PATH;
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }

  // (b) Authenticated but not onboarded → /onboarding (unless already there)
  if (isProtected && !onboardingComplete) {
    const onboardingUrl = request.nextUrl.clone();
    onboardingUrl.pathname = ONBOARDING_PATH;
    onboardingUrl.search = "";
    return NextResponse.redirect(onboardingUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/messages/:path*",
    "/feed/:path*",
    "/community/:path*",
    "/brand/:path*",
    "/creator/:path*",
    "/profile/:path*",
    "/onboarding",
    "/admin/:path*",
    "/admin",
  ],
};
