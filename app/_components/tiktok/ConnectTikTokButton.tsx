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
  access_denied:           "Access was denied. Please try again.",
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
 * Triggers the TikTok Login Kit v2 OAuth flow via the server-side start route.
 *
 * The OAuth URL is constructed server-side at /api/auth/tiktok/start.
 * No client-side state generation or redirect URI construction is performed here.
 * The CSRF state cookie is set HttpOnly by the start route.
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
      // connected is the real TikTok username when available, else "1"
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

  // ── Redirect to server-side TikTok OAuth start ────────────────────────────
  // All OAuth URL construction, CSRF state generation, and cookie setting
  // happens server-side in /api/auth/tiktok/start — never in client code.
  function handleClick() {
    window.location.href = "/api/auth/tiktok/start";
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
