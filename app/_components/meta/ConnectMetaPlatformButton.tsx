"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useSearchParams } from "next/navigation";

export type MetaPlatform = "instagram" | "facebook_page" | "threads";

// ─── Per-platform OAuth config ────────────────────────────────────────────────

const PLATFORM_CONFIG: Record<
  MetaPlatform,
  {
    defaultLabel: string;
    callbackPath: string;
    scope: string;
    /** Query param set on success by the callback route */
    connectedParam: string;
    /** Query param set on error by the callback route */
    errorParam: string;
    /** Human-readable name for toasts */
    displayName: string;
  }
> = {
  instagram: {
    defaultLabel: "Connect Instagram",
    callbackPath: "/api/auth/callback/instagram",
    scope: "instagram_basic,instagram_manage_messages,pages_read_engagement,pages_show_list,business_management",
    connectedParam: "instagram_connected",
    errorParam: "instagram_error",
    displayName: "Instagram",
  },
  facebook_page: {
    defaultLabel: "Connect Facebook Page",
    callbackPath: "/api/auth/callback/facebook",
    scope: "pages_show_list,pages_read_engagement,business_management",
    connectedParam: "facebook_connected",
    errorParam: "facebook_error",
    displayName: "Facebook Page",
  },
  threads: {
    defaultLabel: "Connect Threads",
    callbackPath: "/api/auth/callback/threads",
    scope: "threads_basic",
    connectedParam: "threads_connected",
    errorParam: "threads_error",
    displayName: "Threads",
  },
};

const ERROR_MESSAGES: Record<string, string> = {
  missing_code:            "No authorisation code received.",
  unauthenticated:         "Please sign in first.",
  session_error:           "Could not verify your session. Please try again.",
  server_misconfiguration: "Integration not configured on this server.",
  token_exchange_failed:   "Could not exchange the authorisation code.",
  network_error:           "A network error occurred. Please try again.",
  db_error:                "Could not save your token. Please try again.",
  no_pages_found:          "No Facebook Pages were found on your account.",
  no_threads_account:      "No Threads account was found for this profile.",
  profile_fetch_failed:    "Could not load your Threads profile.",
};

// ─── Component ────────────────────────────────────────────────────────────────

interface ConnectMetaPlatformButtonProps {
  platform: MetaPlatform;
  /** When true shows "Reconnect" instead of the default label. */
  isConnected?: boolean;
  className?: string;
  /** Overrides the default button label. */
  label?: string;
  /** Called after a successful connection is detected (e.g. to reload accounts). */
  onConnected?: (value: string) => void;
}

/**
 * Triggers the Meta OAuth flow for a single platform.
 * Each platform uses its own callback route, scopes, and query params.
 *
 * Wrap this component in <Suspense fallback={null}> because it uses
 * useSearchParams() internally.
 */
export default function ConnectMetaPlatformButton({
  platform,
  isConnected = false,
  className,
  label,
  onConnected,
}: ConnectMetaPlatformButtonProps) {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const cfg = PLATFORM_CONFIG[platform];

  // ── Handle callback result ────────────────────────────────────────────────
  useEffect(() => {
    const connected = searchParams.get(cfg.connectedParam);
    const error = searchParams.get(cfg.errorParam);

    if (connected) {
      const name = connected === "1" ? cfg.displayName : connected;
      toast({
        title: `${cfg.displayName} connected! 🎉`,
        description:
          name !== "1" ? `@${name} has been linked to your profile.` : undefined,
      });
      onConnected?.(connected);

      const url = new URL(window.location.href);
      url.searchParams.delete(cfg.connectedParam);
      window.history.replaceState({}, "", url.toString());
    } else if (error) {
      toast({
        title: `Could not connect ${cfg.displayName}`,
        description: ERROR_MESSAGES[error] ?? decodeURIComponent(error).replace(/_/g, " "),
        variant: "destructive",
      });

      const url = new URL(window.location.href);
      url.searchParams.delete(cfg.errorParam);
      window.history.replaceState({}, "", url.toString());
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Redirect to the correct OAuth dialog ─────────────────────────────────
  function handleClick() {
    const appBase =
      process.env.NEXT_PUBLIC_APP_URL ??
      `${window.location.protocol}//${window.location.host}`;

    const redirectUri = `${appBase.replace(/\/$/, "")}${cfg.callbackPath}`;

    // Threads has its own OAuth dialog and its own App ID — do NOT use the
    // Facebook login dialog or NEXT_PUBLIC_META_APP_ID for Threads.
    if (platform === "threads") {
      const threadsAppId = process.env.NEXT_PUBLIC_THREADS_APP_ID;
      if (!threadsAppId) {
        toast({
          title: "Threads integration not configured",
          description: "NEXT_PUBLIC_THREADS_APP_ID is missing.",
          variant: "destructive",
        });
        return;
      }
      window.location.href =
        `https://threads.net/oauth/authorize` +
        `?client_id=${threadsAppId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=threads_basic` +
        `&response_type=code`;
      return;
    }

    const appId = process.env.NEXT_PUBLIC_META_APP_ID;
    if (!appId) {
      toast({
        title: "Meta integration not configured",
        description: "NEXT_PUBLIC_META_APP_ID is missing.",
        variant: "destructive",
      });
      return;
    }

    const authUrl = new URL("https://www.facebook.com/v18.0/dialog/oauth");
    authUrl.searchParams.set("client_id", appId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("scope", cfg.scope);
    authUrl.searchParams.set("response_type", "code");

    window.location.href = authUrl.toString();
  }

  const buttonLabel = label ?? (isConnected ? `Reconnect ${cfg.displayName}` : cfg.defaultLabel);

  return (
    <Button onClick={handleClick} className={className} variant="outline" size="sm">
      {buttonLabel}
    </Button>
  );
}
