"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useSearchParams } from "next/navigation";

// ─── Error messages ────────────────────────────────────────────────────────────

const ERROR_MESSAGES: Record<string, string> = {
  missing_code:            "No authorisation code received.",
  invalid_state:           "Invalid OAuth state. Please try again.",
  unauthenticated:         "Please sign in first.",
  session_error:           "Could not verify your session. Please try again.",
  server_misconfiguration: "TikTok integration not configured on this server.",
  token_exchange_failed:   "Could not exchange the authorisation code.",
  network_error:           "A network error occurred. Please try again.",
  db_error:                "Could not save your token. Please try again.",
  no_tiktok_account:       "No TikTok account was returned from the API.",
};

// ─── Component ─────────────────────────────────────────────────────────────────

interface ConnectTikTokButtonProps {
  /** When true shows "Reconnect TikTok" instead of "Connect TikTok". */
  isConnected?: boolean;
  className?: string;
  /** Overrides the default button label. */
  label?: string;
  /** Called after a successful connection is detected. */
  onConnected?: (value: string) => void;
}

/**
 * Triggers the TikTok Login Kit v2 OAuth flow.
 * Scopes: user.info.basic, user.info.stats
 *
 * Wrap this in <Suspense fallback={null}> because it uses useSearchParams().
 */
export default function ConnectTikTokButton({
  isConnected = false,
  className,
  label,
  onConnected,
}: ConnectTikTokButtonProps) {
  const { toast } = useToast();
  const searchParams = useSearchParams();

  // ── Handle callback result ────────────────────────────────────────────────
  useEffect(() => {
    const connected = searchParams.get("tiktok_connected");
    const error = searchParams.get("tiktok_error");

    if (connected) {
      const name = connected === "1" ? "TikTok" : connected;
      toast({
        title: "TikTok connected! 🎉",
        description:
          name !== "TikTok"
            ? `@${name} has been linked to your profile.`
            : undefined,
      });
      onConnected?.(connected);

      const url = new URL(window.location.href);
      url.searchParams.delete("tiktok_connected");
      window.history.replaceState({}, "", url.toString());
    } else if (error) {
      toast({
        title: "Could not connect TikTok",
        description:
          ERROR_MESSAGES[error] ??
          decodeURIComponent(error).replace(/_/g, " "),
        variant: "destructive",
      });

      const url = new URL(window.location.href);
      url.searchParams.delete("tiktok_error");
      window.history.replaceState({}, "", url.toString());
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Redirect to TikTok OAuth dialog ──────────────────────────────────────
  function handleClick() {
    const clientKey = process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY;
    if (!clientKey) {
      toast({
        title: "TikTok integration not configured",
        description: "NEXT_PUBLIC_TIKTOK_CLIENT_KEY is missing.",
        variant: "destructive",
      });
      return;
    }

    const appBase =
      process.env.NEXT_PUBLIC_APP_URL ??
      `${window.location.protocol}//${window.location.host}`;

    const redirectUri = `${appBase.replace(/\/$/, "")}/api/auth/callback/tiktok`;

    // Generate a cryptographically random state for CSRF protection
    const state = crypto.randomUUID();
    // Store in a short-lived cookie so the server-side callback can verify it
    document.cookie = `__tiktok_state=${state}; path=/; max-age=300; SameSite=Lax`;

    const authUrl = new URL("https://www.tiktok.com/v2/auth/authorize/");
    authUrl.searchParams.set("client_key", clientKey);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("scope", "user.info.basic,user.info.stats,video.list");
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("state", state);

    window.location.href = authUrl.toString();
  }

  const buttonLabel =
    label ?? (isConnected ? "Reconnect TikTok" : "Connect TikTok");

  return (
    <Button
      onClick={handleClick}
      className={className}
      variant="outline"
      size="sm"
    >
      {buttonLabel}
    </Button>
  );
}
