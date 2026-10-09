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
  server_misconfiguration: "YouTube integration not configured on this server.",
  token_exchange_failed:   "Could not exchange the authorisation code.",
  network_error:           "A network error occurred. Please try again.",
  db_error:                "Could not save your token. Please try again.",
  no_youtube_channel:      "No YouTube channel was found on this Google account.",
  access_denied:           "Access was denied. Please try again and grant the required permissions.",
};

// ─── Component ─────────────────────────────────────────────────────────────────

interface ConnectYouTubeButtonProps {
  /** When true shows "Reconnect YouTube" instead of "Connect YouTube". */
  isConnected?: boolean;
  className?: string;
  /** Overrides the default button label. */
  label?: string;
  /** Called after a successful connection is detected. */
  onConnected?: (value: string) => void;
}

/**
 * Triggers the Google OAuth 2.0 flow requesting the YouTube Data API read scope.
 * Uses dedicated YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET credentials (not the
 * general Google login credentials).
 *
 * Wrap this in <Suspense fallback={null}> because it uses useSearchParams().
 */
export default function ConnectYouTubeButton({
  isConnected = false,
  className,
  label,
  onConnected,
}: ConnectYouTubeButtonProps) {
  const { toast } = useToast();
  const searchParams = useSearchParams();

  // ── Handle callback result ────────────────────────────────────────────────
  useEffect(() => {
    const connected = searchParams.get("youtube_connected");
    const error = searchParams.get("youtube_error");

    if (connected) {
      const name = connected === "1" ? "YouTube" : connected;
      toast({
        title: "YouTube connected! 🎉",
        description:
          name !== "YouTube"
            ? `"${name}" channel has been linked to your profile.`
            : undefined,
      });
      onConnected?.(connected);

      const url = new URL(window.location.href);
      url.searchParams.delete("youtube_connected");
      window.history.replaceState({}, "", url.toString());
    } else if (error) {
      toast({
        title: "Could not connect YouTube",
        description:
          ERROR_MESSAGES[error] ??
          decodeURIComponent(error).replace(/_/g, " "),
        variant: "destructive",
      });

      const url = new URL(window.location.href);
      url.searchParams.delete("youtube_error");
      window.history.replaceState({}, "", url.toString());
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Redirect to Google OAuth consent screen ───────────────────────────────
  function handleClick() {
    window.location.href = "/api/auth/youtube/start";
  }

  const buttonLabel =
    label ?? (isConnected ? "Reconnect YouTube" : "Connect YouTube");

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
