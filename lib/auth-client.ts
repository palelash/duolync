import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import type { auth } from "@/lib/auth";

// On the client side use the page's actual origin so auth works on any domain
// (local IPs, preview deployments, production) without needing a matching env var.
// On the server side during SSR, prefer localhost:PORT to bypass TLS proxies
// (same pattern as lib/middleware-session.ts) and fall back to the env var.
function resolveBaseURL(): string | undefined {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  if (process.env.PORT) {
    return `http://localhost:${process.env.PORT}`;
  }
  return process.env.NEXT_PUBLIC_APP_URL;
}

export const authClient = createAuthClient({
  baseURL: resolveBaseURL(),
  plugins: [inferAdditionalFields<typeof auth>()],
});

export const {
  signIn,
  signOut,
  signUp,
  useSession,
  getSession,
  sendVerificationEmail: resendVerificationEmail,
} = authClient;
