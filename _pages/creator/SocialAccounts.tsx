"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { Link2, Trash2, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import MainLayout from "@/components/layout/MainLayout";
import { useToast } from "@/hooks/use-toast";
import ConnectMetaPlatformButton from "@/components/meta/ConnectMetaPlatformButton";
import type { MetaPlatform } from "@/components/meta/ConnectMetaPlatformButton";
import ConnectTikTokButton from "@/components/tiktok/ConnectTikTokButton";
import ConnectYouTubeButton from "@/components/youtube/ConnectYouTubeButton";
import {
  getConnectedAccountsAction,
  removePlatformAction,
  type ConnectedAccount,
} from "@/app/actions/social-connections";
import { refreshTikTokDataAction } from "@/app/actions/tiktok-sync";
import { disconnectTikTokAction } from "@/app/actions/tiktok-disconnect";

// ─── Static platform display config ──────────────────────────────────────────

const PLATFORM_DISPLAY: Record<string, {
  label: string; emoji: string; bg: string; description: string;
}> = {
  instagram:    { label: "Instagram",    emoji: "📷", bg: "bg-pink-500/10 border-pink-500/20",   description: "Instagram Business account" },
  facebook_page:{ label: "Facebook Page",emoji: "🔵", bg: "bg-blue-500/10 border-blue-500/20",   description: "Facebook Page you manage" },
  threads:      { label: "Threads",      emoji: "🧵", bg: "bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700", description: "Threads profile" },
  tiktok:       { label: "TikTok",       emoji: "🎵", bg: "bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700", description: "TikTok creator account" },
  youtube:      { label: "YouTube",      emoji: "▶️", bg: "bg-red-500/10 border-red-500/20",     description: "YouTube creator channel" },
  twitter:      { label: "Twitter / X",  emoji: "🐦", bg: "bg-sky-500/10 border-sky-500/20",     description: "" },
};

/** The three platforms that use Meta OAuth — shown as fixed cards regardless of connection state. */
const META_PLATFORMS: MetaPlatform[] = ["instagram", "facebook_page", "threads"];

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function AccountStatusBadge({ via }: { via?: ConnectedAccount["connectedVia"] }) {
  if (via === "oauth") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-1.5 py-0.5 rounded-full">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
        Connected
      </span>
    );
  }
  if (via === "public_data") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 px-1.5 py-0.5 rounded-full">
        Public data
      </span>
    );
  }
  return (
    <span className="text-[10px] text-muted-foreground bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-1.5 py-0.5 rounded-full">
      Not connected
    </span>
  );
}

function hasVisibleStats(account: ConnectedAccount | undefined): account is ConnectedAccount {
  return !!account;
}

// ─── Meta platform card (always visible, connect / connected state) ───────────

function MetaPlatformCard({
  platform,
  account,
  onRemove,
  onConnected,
}: {
  platform: MetaPlatform;
  account: ConnectedAccount | undefined;
  onRemove: (platform: string) => void;
  onConnected: () => void;
}) {
  const display = PLATFORM_DISPLAY[platform]!;
  // Connected = creator authorized via official OAuth. Public-data accounts are NOT connected.
  const isConnected = !!account && account.connectedVia === "oauth";

  const syncedAt = account?.lastSyncedAt
    ? new Date(account.lastSyncedAt).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
      })
    : null;

  return (
    <div className={`rounded-2xl border p-5 flex items-center gap-4 transition-all ${
      isConnected
        ? "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
        : "bg-zinc-50/80 dark:bg-zinc-900/40 border-zinc-200/60 dark:border-zinc-800/50"
    }`}>
      {/* Icon */}
      <div className={`w-12 h-12 rounded-xl border flex items-center justify-center text-2xl shrink-0 ${display.bg}`}>
        {display.emoji}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <p className="font-semibold text-sm">{display.label}</p>
          <AccountStatusBadge via={account?.connectedVia} />
        </div>

        {hasVisibleStats(account) && account.username ? (
          <p className="text-xs text-muted-foreground">@{account.username}</p>
        ) : !isConnected && display.description ? (
          <p className="text-xs text-muted-foreground/60">{display.description}</p>
        ) : null}
        {hasVisibleStats(account) && syncedAt && (
          <p className="text-xs text-muted-foreground/60 flex items-center gap-1 mt-0.5">
            <RefreshCw className="w-3 h-3" /> Updated {syncedAt}
          </p>
        )}
      </div>

      {/* Followers stay visible for public or unlabeled stats. Connection is separate. */}
      {hasVisibleStats(account) && (
        <div className="hidden sm:block text-center shrink-0">
          <p className="text-base font-bold font-display">{fmt(account.followers)}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Followers</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        <Suspense fallback={null}>
          <ConnectMetaPlatformButton
            platform={platform}
            isConnected={isConnected}
            onConnected={onConnected}
            className="h-8 text-xs"
          />
        </Suspense>
        {account && (
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8 text-muted-foreground/60 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
            title={`Disconnect ${display.label}`}
            onClick={() => onRemove(platform)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── TikTok platform card (always visible, connect / connected state) ────────

function TikTokCard({
  account,
  onRemove,
  onConnected,
  onRefresh,
  refreshing,
}: {
  account: ConnectedAccount | undefined;
  onRemove: (platform: string) => void;
  onConnected: () => void;
  /** Called when the Refresh data button is clicked (OAuth-connected only). */
  onRefresh?: () => void;
  /** When true shows a spinner on the Refresh button. */
  refreshing?: boolean;
}) {
  const display = PLATFORM_DISPLAY["tiktok"]!;
  const isConnected = !!account && account.connectedVia === "oauth";
  // Previously connected: PlatformToken gone but OFFICIAL_API historical data remains.
  // Shows "Reconnect TikTok" so the user knows this isn't a fresh first-time connect.
  const wasOfficiallyConnected =
    !isConnected && account?.dataSource === "OFFICIAL_API";

  const syncedAt = account?.lastSyncedAt
    ? new Date(account.lastSyncedAt).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
      })
    : null;

  return (
    <div className={`rounded-2xl border p-5 flex items-center gap-4 transition-all ${
      isConnected
        ? "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
        : "bg-zinc-50/80 dark:bg-zinc-900/40 border-zinc-200/60 dark:border-zinc-800/50"
    }`}>
      {/* Icon */}
      <div className={`w-12 h-12 rounded-xl border flex items-center justify-center text-2xl shrink-0 ${display.bg}`}>
        {display.emoji}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <p className="font-semibold text-sm">{display.label}</p>
          <AccountStatusBadge via={account?.connectedVia} />
        </div>

        {hasVisibleStats(account) && account.username ? (
          <p className="text-xs text-muted-foreground">@{account.username}</p>
        ) : !isConnected && display.description ? (
          <p className="text-xs text-muted-foreground/60">{display.description}</p>
        ) : null}
        {hasVisibleStats(account) && syncedAt && (
          <p className="text-xs text-muted-foreground/60 flex items-center gap-1 mt-0.5">
            <RefreshCw className="w-3 h-3" /> Updated {syncedAt}
          </p>
        )}
      </div>

      {/* Followers stay visible for public or unlabeled stats. Connection is separate. */}
      {hasVisibleStats(account) && (
        <div className="hidden sm:block text-center shrink-0">
          <p className="text-base font-bold font-display">{fmt(account.followers)}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Followers</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Refresh data button — shown only when OAuth-connected, beside ConnectTikTokButton */}
        {isConnected && onRefresh && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
            className="h-8 text-xs gap-1.5"
            title="Refresh TikTok data"
          >
            {refreshing ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            {refreshing ? "Refreshing…" : "Refresh data"}
          </Button>
        )}
        <Suspense fallback={null}>
          <ConnectTikTokButton
            isConnected={isConnected || wasOfficiallyConnected}
            onConnected={onConnected}
            className="h-8 text-xs"
          />
        </Suspense>
        {account && (
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8 text-muted-foreground/60 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
            // History-only: no live token, so no provider revoke is needed.
            // Use "tiktok_history" sentinel so the dialog shows truthful copy.
            title={wasOfficiallyConnected ? "Remove TikTok data" : "Disconnect TikTok"}
            onClick={() => onRemove(wasOfficiallyConnected ? "tiktok_history" : "tiktok")}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── YouTube platform card (always visible, connect / connected state) ───────

function YouTubeCard({
  account,
  onRemove,
  onConnected,
}: {
  account: ConnectedAccount | undefined;
  onRemove: (platform: string) => void;
  onConnected: () => void;
}) {
  const display = PLATFORM_DISPLAY["youtube"]!;
  const isConnected = !!account && account.connectedVia === "oauth";

  const syncedAt = account?.lastSyncedAt
    ? new Date(account.lastSyncedAt).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
      })
    : null;

  return (
    <div className={`rounded-2xl border p-5 flex items-center gap-4 transition-all ${
      isConnected
        ? "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
        : "bg-zinc-50/80 dark:bg-zinc-900/40 border-zinc-200/60 dark:border-zinc-800/50"
    }`}>
      {/* Icon */}
      <div className={`w-12 h-12 rounded-xl border flex items-center justify-center text-2xl shrink-0 ${display.bg}`}>
        {display.emoji}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <p className="font-semibold text-sm">{display.label}</p>
          <AccountStatusBadge via={account?.connectedVia} />
        </div>

        {hasVisibleStats(account) && account.username ? (
          <p className="text-xs text-muted-foreground">
            {account.username.startsWith("@") ? account.username : `@${account.username}`}
          </p>
        ) : !isConnected && display.description ? (
          <p className="text-xs text-muted-foreground/60">{display.description}</p>
        ) : null}
        {hasVisibleStats(account) && syncedAt && (
          <p className="text-xs text-muted-foreground/60 flex items-center gap-1 mt-0.5">
            <RefreshCw className="w-3 h-3" /> Updated {syncedAt}
          </p>
        )}
      </div>

      {hasVisibleStats(account) && (
        <div className="hidden sm:block text-center shrink-0">
          <p className="text-base font-bold font-display">{fmt(account.followers)}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Subscribers</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        <Suspense fallback={null}>
          <ConnectYouTubeButton
            isConnected={isConnected}
            onConnected={onConnected}
            className="h-8 text-xs"
          />
        </Suspense>
        {account && (
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8 text-muted-foreground/60 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
            title="Disconnect YouTube"
            onClick={() => onRemove("youtube")}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Other-platform row (public-data only — no OAuth, read-only) ─────────────

function OtherPlatformRow({
  account,
  onRemove,
}: {
  account: ConnectedAccount;
  onRemove: (platform: string) => void;
}) {
  const display = PLATFORM_DISPLAY[account.platform] ?? {
    label: account.platform,
    emoji: "📱",
    bg: "bg-zinc-100 border-zinc-200",
    description: "",
  };

  const syncedAt = account.lastSyncedAt
    ? new Date(account.lastSyncedAt).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
      })
    : null;

  return (
    <div className="card-elevated p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl border flex items-center justify-center text-xl shrink-0 ${display.bg}`}>
        {display.emoji}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="font-semibold text-sm">{display.label}</p>
          {account.connectedVia === "public_data" && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 px-1.5 py-0.5 rounded-full">
              Public data
            </span>
          )}
        </div>
        {account.username && <p className="text-xs text-muted-foreground">@{account.username}</p>}
        {syncedAt && (
          <p className="text-xs text-muted-foreground/60 flex items-center gap-1 mt-0.5">
            <RefreshCw className="w-3 h-3" /> Updated {syncedAt}
          </p>
        )}
      </div>

      <div className="hidden sm:block text-center shrink-0">
        <p className="text-base font-bold font-display">{fmt(account.followers)}</p>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Followers</p>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="w-8 h-8 text-muted-foreground/60 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 shrink-0"
        title={`Disconnect ${display.label}`}
        onClick={() => onRemove(account.platform)}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const SocialAccounts = () => {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  // Per-button loading state for TikTok manual refresh
  const [tiktokRefreshing, setTiktokRefreshing] = useState(false);

  // ── Load from DB ────────────────────────────────────────────────────────
  const loadAccounts = useCallback(async () => {
    setLoading(true);
    const { data, error } = await getConnectedAccountsAction();
    if (error) {
      toast({ title: "Could not load accounts", description: error, variant: "destructive" });
    } else {
      setAccounts(data);
    }
    setLoading(false);
  }, [toast]);

  // ── TikTok manual data Refresh ──────────────────────────────────────────
  const handleTikTokRefresh = useCallback(async () => {
    if (tiktokRefreshing) return;
    setTiktokRefreshing(true);
    try {
      const result = await refreshTikTokDataAction();
      if (result.ok) {
        toast({ title: "TikTok refreshed ✓", description: "Your TikTok data has been updated." });
        await loadAccounts();
      } else if (result.reason === "reauth_required") {
        toast({
          title: "Reconnect required",
          description: "Your TikTok authorization has expired. Please reconnect TikTok.",
          variant: "destructive",
        });
        await loadAccounts();
      } else if (result.reason === "identity_mismatch") {
        toast({
          title: "Identity mismatch",
          description: "TikTok returned a different account. Please reconnect TikTok to resolve this.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Refresh failed",
          description: "Could not update TikTok data right now. Please try again later.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Refresh failed",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setTiktokRefreshing(false);
    }
  }, [tiktokRefreshing, toast, loadAccounts]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  // ── Disconnect ──────────────────────────────────────────────────────────
  const handleRemoveConfirm = async () => {
    if (!confirmRemove) return;
    setRemoving(true);

    // Both "tiktok" (connected) and "tiktok_history" (dead-auth, history-only) use the
    // dedicated action. disconnectTikTokAction() automatically skips provider revoke when
    // no PlatformToken exists, so the history-only path is safe and correct.
    if (confirmRemove === "tiktok" || confirmRemove === "tiktok_history") {
      const res = await disconnectTikTokAction();
      setRemoving(false);
      if (!res.ok) {
        // Revoke failed transiently — keep dialog open so the user can retry.
        // Local TikTok data is preserved.
        const description =
          res.reason === "temporary_failure"
            ? "TikTok is temporarily unavailable. Please try again shortly."
            : res.reason === "configuration_error"
              ? "TikTok connection is misconfigured. Please contact support."
              : "Please try again.";
        toast({
          title: "Could not disconnect TikTok",
          description,
          variant: "destructive",
        });
        return; // Keep dialog open; do NOT reload (connection remains)
      }
      setConfirmRemove(null);
      toast({ title: "TikTok disconnected ✓", description: "Your TikTok data has been removed." });
      loadAccounts();
      return;
    }

    // All other platforms use the generic action.
    const { error } = await removePlatformAction(confirmRemove);
    setRemoving(false);
    setConfirmRemove(null);
    if (error) {
      toast({ title: "Failed to disconnect", description: error, variant: "destructive" });
    } else {
      const label = PLATFORM_DISPLAY[confirmRemove]?.label ?? confirmRemove;
      toast({ title: `${label} disconnected` });
      loadAccounts();
    }
  };

  // Build a lookup map for fast access in cards
  const accountByPlatform = new Map(accounts.map((a) => [a.platform, a]));

  // Platforms without a fixed OAuth card. Never treated as Connected.
  const otherAccounts = accounts.filter(
    (a) =>
      !META_PLATFORMS.includes(a.platform as MetaPlatform) &&
      a.platform !== "tiktok" &&
      a.platform !== "youtube" &&
      a.connectedVia !== "oauth",
  );
  const otherPublicAccounts = otherAccounts.filter((a) => a.connectedVia === "public_data");
  const otherUnknownAccounts = otherAccounts.filter((a) => a.connectedVia === "unknown");

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto p-6 space-y-10">

        {/* Header */}
        <div>
          <h1 className="font-display text-3xl font-bold mb-2">Social Accounts</h1>
          <p className="text-muted-foreground">
            Connect your social media accounts to showcase your stats to brands.
          </p>
        </div>

        {/* ── Meta Platforms ── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
              Meta Platforms
            </h2>
            <span className="text-[10px] text-muted-foreground/60 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-1.5 py-0.5 rounded-full">
              OAuth
            </span>
          </div>

          {loading ? (
            <div className="space-y-3">
              {META_PLATFORMS.map((p) => (
                <div key={p} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 animate-pulse flex gap-4 items-center">
                  <div className="w-12 h-12 rounded-xl bg-secondary shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-secondary rounded w-1/4" />
                    <div className="h-3 bg-secondary rounded w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {META_PLATFORMS.map((p) => (
                <MetaPlatformCard
                  key={p}
                  platform={p}
                  account={accountByPlatform.get(p)}
                  onRemove={(platform) => setConfirmRemove(platform)}
                  onConnected={loadAccounts}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── TikTok ── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
              TikTok
            </h2>
            <span className="text-[10px] text-muted-foreground/60 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-1.5 py-0.5 rounded-full">
              OAuth
            </span>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 animate-pulse flex gap-4 items-center">
              <div className="w-12 h-12 rounded-xl bg-secondary shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-secondary rounded w-1/4" />
                <div className="h-3 bg-secondary rounded w-1/3" />
              </div>
            </div>
          ) : (
            <TikTokCard
              account={accountByPlatform.get("tiktok")}
              onRemove={(platform) => setConfirmRemove(platform)}
              onConnected={loadAccounts}
              onRefresh={handleTikTokRefresh}
              refreshing={tiktokRefreshing}
            />
          )}
        </section>

        {/* ── YouTube ── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
              YouTube
            </h2>
            <span className="text-[10px] text-muted-foreground/60 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-1.5 py-0.5 rounded-full">
              OAuth
            </span>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 animate-pulse flex gap-4 items-center">
              <div className="w-12 h-12 rounded-xl bg-secondary shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-secondary rounded w-1/4" />
                <div className="h-3 bg-secondary rounded w-1/3" />
              </div>
            </div>
          ) : (
            <YouTubeCard
              account={accountByPlatform.get("youtube")}
              onRemove={(platform) => setConfirmRemove(platform)}
              onConnected={loadAccounts}
            />
          )}
        </section>

        {/* ── Public data platforms (no OAuth token) ── */}
        {otherPublicAccounts.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                Public Data
              </h2>
              <span className="text-[10px] text-muted-foreground/60 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 text-sky-600 dark:text-sky-400 px-1.5 py-0.5 rounded-full">
                Not officially connected
              </span>
            </div>
            <div className="space-y-3">
              {otherPublicAccounts.map((account) => (
                <OtherPlatformRow
                  key={account.id}
                  account={account}
                  onRemove={(platform) => setConfirmRemove(platform)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Stats with no confirmed source. Not Connected, and not labeled public data. */}
        {otherUnknownAccounts.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
              Other stats
            </h2>
            <div className="space-y-3">
              {otherUnknownAccounts.map((account) => (
                <OtherPlatformRow
                  key={account.id}
                  account={account}
                  onRemove={(platform) => setConfirmRemove(platform)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Empty-state when truly nothing is connected */}
        {!loading && accounts.length === 0 && (
          <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 p-10 text-center">
            <Link2 className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="font-semibold text-sm mb-1">No accounts connected yet</p>
            <p className="text-xs text-muted-foreground">Use the Connect buttons above to link your Meta platforms.</p>
          </div>
        )}

        {/* Tip */}
        <div className="p-5 rounded-2xl bg-secondary/50 border border-border">
          <h4 className="font-semibold mb-1.5">💡 Tip</h4>
          <p className="text-sm text-muted-foreground">
            Connect each Meta platform independently. Instagram pulls your follower count and recent
            posts. Facebook Page shows your page fan count. Threads links your profile. All three
            use OAuth — no manual entry, verified by Meta.
          </p>
        </div>
      </div>

      {/* Disconnect confirmation */}
      <AlertDialog
        open={confirmRemove !== null}
        onOpenChange={(open) => { if (!open && !removing) setConfirmRemove(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmRemove === "tiktok"
                ? "Disconnect TikTok?"
                : confirmRemove === "tiktok_history"
                  ? "Remove TikTok data?"
                  : `Disconnect ${confirmRemove ? (PLATFORM_DISPLAY[confirmRemove]?.label ?? confirmRemove) : "account"}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmRemove === "tiktok" ? (
                <>
                  Disconnecting TikTok will revoke Duolync&apos;s access to your TikTok account
                  and delete synced TikTok stats and videos from Duolync.
                </>
              ) : confirmRemove === "tiktok_history" ? (
                <>
                  Remove previously synced TikTok stats and videos from Duolync? This cannot be
                  undone.
                </>
              ) : (
                "This will remove all synced data for this account. You can reconnect at any time."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            {/*
              Use a plain Button instead of AlertDialogAction so that the dialog
              stays open when a TikTok revoke fails transiently — AlertDialogAction
              would auto-close the Radix dialog on every click regardless of the
              async result.
            */}
            <Button
              onClick={handleRemoveConfirm}
              disabled={removing}
              className="bg-red-600 hover:bg-red-700 text-white gap-2"
            >
              {removing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              {confirmRemove === "tiktok_history" ? "Remove data" : "Disconnect"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
};

export default SocialAccounts;
