"use client";

import { useState, useEffect, useRef, useCallback, useId } from "react";
import {
  Wifi, Zap, RefreshCw, TrendingUp, Users, BarChart3, Loader2,
  CheckCircle2, AlertCircle, Heart, MessageCircle, Eye, Pencil, Trash2,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  startVerifyAction,
  pollVerifyAction,
  confirmSyncAction,
  startPortfolioResyncAction,
  pollApifyRunAction,
  type Platform,
  type AccountPreview,
} from "@/app/actions/apify-sync";
import { getSocialPostsAction, deletePostAction, clearBrokenPostImagesAction, type SocialPostItem } from "@/app/actions/social-posts";
import { removePlatformAction } from "@/app/actions/social-connections";

// ─── Platform SVG Icons ───────────────────────────────────────────────────────

function InstagramIcon({ className }: { className?: string }) {
  // useId ensures each instance gets a unique gradient ID — avoids SVG defs collision
  const uid = useId().replace(/:/g, "");
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id={`ig-bg-${uid}`} cx="28%" cy="106%" r="148%">
          <stop offset="0%"  stopColor="#fdf497" />
          <stop offset="6%"  stopColor="#fdf497" />
          <stop offset="44%" stopColor="#fd5949" />
          <stop offset="62%" stopColor="#d6249f" />
          <stop offset="90%" stopColor="#285AEB" />
        </radialGradient>
      </defs>
      {/* Official gradient background */}
      <rect width="24" height="24" rx="5.5" fill={`url(#ig-bg-${uid})`} />
      {/* Camera body outline */}
      <rect x="6.5" y="6.5" width="11" height="11" rx="3.2" stroke="white" strokeWidth="1.55" fill="none" />
      {/* Lens circle */}
      <circle cx="12" cy="12" r="3.1" stroke="white" strokeWidth="1.55" fill="none" />
      {/* Flash dot */}
      <circle cx="16.1" cy="7.9" r="0.95" fill="white" />
    </svg>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  // Official TikTok shape: stylised music note with cyan + red double-exposure shadow
  const path = "M13.8 3.6h-2.1V13a2.15 2.15 0 1 1-3-1.96V8.73a4.37 4.37 0 1 0 5.1 4.27V6.52a5.95 5.95 0 0 0 3.47 1.1V5.4a3.9 3.9 0 0 1-3.46-1.8z";
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="5.5" fill="#010101" />
      {/* Cyan shadow offset left */}
      <path d={path} fill="#69C9D0" transform="translate(-0.55,0)" opacity="0.9" />
      {/* Red shadow offset right */}
      <path d={path} fill="#EE1D52" transform="translate(0.55,0)" opacity="0.9" />
      {/* Main white foreground */}
      <path d={path} fill="white" />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="5.5" fill="#1877F2" />
      {/* Official 'f' letterform */}
      <path
        d="M15.5 8h-2c-.28 0-.5.22-.5.5V10h2.5l-.38 2.5H13V19h-2.5v-6.5H9V10h1.5V8.5C10.5 6.57 12.07 5 14 5h1.5v3z"
        fill="white"
      />
    </svg>
  );
}

function ThreadsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="5.5" fill="#101010" />
      {/* Official Threads "@"-derived mark */}
      <path
        d="M16.22 11.18a4.38 4.38 0 0 0-.4-.16c-.07-1.56-.95-2.46-2.44-2.47h-.05c-.89 0-1.64.38-2.09 1.06l.99.68c.3-.45.77-.69 1.1-.69.75 0 1.21.47 1.39 1.41-.45-.07-.92-.09-1.41-.07-1.43.08-2.34.88-2.28 1.98.03.56.32 1.05.8 1.36.42.28.96.41 1.53.38.74-.05 1.39-.34 1.87-.84.36-.39.6-.9.69-1.51.33.2.55.45.64.76.18.59.01 1.33-.45 1.88-.52.6-1.38.9-2.49.9-1.19 0-2.08-.39-2.65-1.15-.54-.72-.82-1.78-.82-3.15 0-1.37.28-2.43.82-3.15.57-.77 1.46-1.16 2.65-1.16.85 0 1.56.2 2.1.6.46.34.82.83 1.06 1.45l1.19-.4a4.5 4.5 0 0 0-1.33-1.98c-.76-.63-1.78-.97-3.02-.97-1.6 0-2.89.56-3.73 1.63-.76.99-1.15 2.34-1.15 4.01 0 1.67.39 3.02 1.15 4.01.84 1.07 2.13 1.63 3.73 1.63 1.32 0 2.38-.38 3.07-1.1.72-.76 1.01-1.84.84-2.91a2.73 2.73 0 0 0-.48-1.1zm-3.8 1.71c-.62.04-1.28-.25-1.3-.84-.02-.44.39-.94 1.35-.99.47-.03.9.01 1.37.08-.1.95-.65 1.71-1.42 1.75z"
        fill="white"
      />
    </svg>
  );
}

function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="5.5" fill="#FF0000" />
      {/* White rounded-rect shield */}
      <path
        d="M19.8 8.26a2.08 2.08 0 0 0-1.46-1.47C17.06 6.5 12 6.5 12 6.5s-5.06 0-6.34.29A2.08 2.08 0 0 0 4.2 8.26C3.86 9.55 3.86 12 3.86 12s0 2.45.34 3.74a2.08 2.08 0 0 0 1.46 1.47C6.94 17.5 12 17.5 12 17.5s5.06 0 6.34-.29a2.08 2.08 0 0 0 1.46-1.47c.34-1.29.34-3.74.34-3.74s0-2.45-.34-3.74z"
        fill="white"
      />
      {/* Play triangle in brand red */}
      <polygon points="10.18,9.68 10.18,14.32 14.77,12" fill="#FF0000" />
    </svg>
  );
}

// ─── Platform config ──────────────────────────────────────────────────────────

type PlatformConfig = {
  id: Platform | "youtube" | "facebook_page" | "threads";
  label: string;
  bg: string;
  icon: React.FC<{ className?: string }>;
  syncable: boolean;
  placeholder: string;
};

const PLATFORMS: PlatformConfig[] = [
  {
    id: "instagram", label: "Instagram", icon: InstagramIcon,
    bg: "bg-gradient-to-br from-fuchsia-500/10 to-orange-500/10 border-fuchsia-500/20",
    syncable: true, placeholder: "your_handle",
  },
  {
    id: "tiktok", label: "TikTok", icon: TikTokIcon,
    bg: "bg-zinc-900 border-zinc-700",
    syncable: true, placeholder: "",
  },
  {
    id: "facebook_page", label: "Facebook Page", icon: FacebookIcon,
    bg: "bg-blue-500/10 border-blue-500/20",
    syncable: true, placeholder: "",
  },
  {
    id: "threads", label: "Threads", icon: ThreadsIcon,
    bg: "bg-zinc-900 border-zinc-700",
    syncable: true, placeholder: "",
  },
  {
    id: "youtube", label: "YouTube", icon: YouTubeIcon,
    bg: "bg-red-500/10 border-red-500/20",
    syncable: true, placeholder: "",
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number | null | undefined): string => {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
};

// ─── Sync Modal (2-step: verify preview → confirm sync) ──────────────────────

type SyncPhase =
  | "idle"
  | "verifying"
  | "preview"
  | "confirming"
  | "done"
  | "error_not_found"
  | "error_private"
  | "error_generic";

function SyncModal({
  userId,
  platform,
  onDone,
  onClose,
}: {
  userId: string;
  platform: Platform;
  onDone: () => void;
  onClose: () => void;
}) {
  const cfg = PLATFORMS.find((p) => p.id === platform)!;
  const [handle, setHandle] = useState("");
  const [phase, setPhase] = useState<SyncPhase>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [preview, setPreview] = useState<AccountPreview | null>(null);
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const { toast } = useToast();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };
  useEffect(() => () => stop(), []);

  // ── Step 1: Start verify run ──────────────────────────────────────────────
  const handlePreview = async () => {
    if (!handle.trim()) return;
    setPhase("verifying");
    setErrorMsg("");

    const start = await startVerifyAction(handle.trim(), platform);
    if ("error" in start) {
      setPhase("error_generic");
      setErrorMsg(start.error);
      return;
    }

    const { runId } = start;
    pollRef.current = setInterval(async () => {
      const result = await pollVerifyAction(runId, platform, handle.trim());
      if (result.state === "running") return;
      stop();

      if (result.state === "found") {
        setPreview(result.preview);
        setDatasetId(result.datasetId);
        setPhase("preview");
      } else if (result.state === "not_found") {
        setPhase("error_not_found");
      } else if (result.state === "private") {
        setPhase("error_private");
      } else {
        setPhase("error_generic");
        setErrorMsg(result.error);
      }
    }, 3_000);
  };

  // ── Step 2: Confirm and save ──────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!datasetId) return;
    setPhase("confirming");

    // Pass preview.handle so it gets stored in PlatformStats.raw for future re-syncs
    const result = await confirmSyncAction(datasetId, userId, platform, preview?.handle);
    if (result.success) {
      setPhase("done");
      toast({
        title: `${cfg.label} connected!`,
        description: `${fmt(result.platformFollowers)} followers imported.`,
      });
      onDone();
    } else {
      setPhase("error_generic");
      setErrorMsg(result.error);
    }
  };

  const handleReset = () => {
    stop();
    setPhase("idle");
    setPreview(null);
    setDatasetId(null);
    setErrorMsg("");
  };

  const busy = phase === "verifying" || phase === "confirming";

  return (
    <DialogContent className="sm:max-w-sm bg-zinc-950 border-zinc-800 text-white">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <cfg.icon className="w-6 h-6" />
          {phase === "preview" ? "Confirm Account" : `Connect ${cfg.label}`}
        </DialogTitle>
        <DialogDescription className="text-zinc-400 text-sm">
          {phase === "preview"
            ? "Is this your account?"
            : "We'll verify your public account to import your stats and latest posts into your portfolio."}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-1">

        {/* ── Phase: idle — handle input + warning ── */}
        {phase === "idle" && (
          <>
            <div className="flex items-start gap-2.5 rounded-lg bg-amber-950/40 border border-amber-700/40 px-3.5 py-3">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-300/90 leading-relaxed">
                Your <strong>{cfg.label}</strong> account must be <strong>public</strong>. Private accounts cannot be verified.
              </p>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">@</span>
              <Input
                value={handle}
                onChange={(e) => setHandle(e.target.value.replace(/^@/, ""))}
                placeholder={cfg.placeholder}
                className="pl-7 bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600 focus:border-violet-500 focus-visible:ring-0"
                onKeyDown={(e) => e.key === "Enter" && handlePreview()}
                autoFocus
              />
            </div>
          </>
        )}

        {/* ── Phase: verifying ── */}
        {phase === "verifying" && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
            <p className="text-sm text-zinc-300">Looking up @{handle}…</p>
            <p className="text-xs text-zinc-600">This takes 30–60 seconds</p>
          </div>
        )}

        {/* ── Phase: preview — show account card ── */}
        {phase === "preview" && preview && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 flex items-center gap-4">
            {preview.avatarUrl ? (
              <img
                src={preview.avatarUrl}
                alt={preview.displayName ?? "avatar"}
                className="w-14 h-14 rounded-full object-cover ring-2 ring-zinc-700 shrink-0"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                <cfg.icon className="w-7 h-7" />
              </div>
            )}
            <div className="min-w-0">
              {preview.displayName && (
                <p className="font-semibold text-white text-sm truncate">{preview.displayName}</p>
              )}
              <p className="text-zinc-400 text-xs">@{preview.handle}</p>
              {preview.followerCount != null && (
                <p className="text-zinc-500 text-xs mt-1">{fmt(preview.followerCount)} followers</p>
              )}
            </div>
          </div>
        )}

        {/* ── Phase: confirming ── */}
        {phase === "confirming" && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
            <p className="text-sm text-zinc-300">Syncing your data…</p>
          </div>
        )}

        {/* ── Phase: done ── */}
        {phase === "done" && (
          <div className="flex items-center gap-3 rounded-lg bg-emerald-950/50 border border-emerald-800/50 px-4 py-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <p className="text-sm text-emerald-300">Connected! Your data has been saved.</p>
          </div>
        )}

        {/* ── Phase: account not found ── */}
        {phase === "error_not_found" && (
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-lg bg-zinc-900 border border-zinc-700 px-4 py-3">
              <AlertCircle className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-white font-medium">Account not found</p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  No account was found for <strong>@{handle}</strong> on {cfg.label}. Please check the username and try again.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Phase: account is private ── */}
        {phase === "error_private" && (
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-lg bg-amber-950/40 border border-amber-700/40 px-4 py-3">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-white font-medium">Account is private</p>
                <p className="text-xs text-amber-300/80 mt-0.5">
                  <strong>@{handle}</strong> is set to private. Please make your account public in your {cfg.label} settings and try again.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Phase: generic error ── */}
        {phase === "error_generic" && (
          <div className="flex items-start gap-3 rounded-lg bg-red-950/50 border border-red-800/50 px-4 py-3">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-300 leading-relaxed">{errorMsg}</p>
          </div>
        )}
      </div>

      <DialogFooter className="gap-2">
        {/* Cancel / Close */}
        <Button
          variant="outline"
          onClick={phase === "done" ? onClose : phase === "preview" || phase.startsWith("error") ? handleReset : onClose}
          disabled={busy}
          className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
        >
          {phase === "done" ? "Close" : phase === "preview" ? "That's not me" : phase.startsWith("error") ? "Try again" : "Cancel"}
        </Button>

        {/* Primary action */}
        {phase === "idle" && (
          <Button
            onClick={handlePreview}
            disabled={!handle.trim()}
            className="gap-2 bg-violet-600 hover:bg-violet-500 text-white border-0"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Preview Account
          </Button>
        )}
        {phase === "preview" && (
          <Button
            onClick={handleConfirm}
            className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white border-0"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Yes, sync my data
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  );
}

// ─── Resync Posts Button ──────────────────────────────────────────────────────

/**
 * One-click "Refresh Posts" button for a connected platform.
 * Triggers a new Apify run using the stored handle and polls until done,
 * then calls onSuccess() so the parent can reload the post list.
 *
 * If the handle was never persisted (accounts connected before this feature),
 * it falls back to opening the full reconnect modal via onFallback().
 */
function ResyncPostsButton({
  userId,
  platform,
  onSuccess,
  onFallback,
}: {
  userId: string;
  platform: Platform;
  onSuccess: () => Promise<void>;
  onFallback: () => void;
}) {
  const { toast } = useToast();
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };
  useEffect(() => () => stop(), []);

  const handleClick = async () => {
    setState("running");
    const start = await startPortfolioResyncAction(platform);

    if ("error" in start) {
      stop();
      if (start.error === "no_handle") {
        // Handle was never persisted — fall back to the full connect modal
        setState("idle");
        toast({
          title: "Re-connect required",
          description: "Please reconnect your account to enable one-click re-sync.",
        });
        onFallback();
        return;
      }
      setState("error");
      toast({
        variant: "destructive",
        title: "Re-sync failed",
        description: start.error,
      });
      return;
    }

    const { runId } = start;
    pollRef.current = setInterval(async () => {
      try {
        const result = await pollApifyRunAction(runId, userId, platform);
        if (result.state === "running") return;
        stop();
        if (result.state === "succeeded") {
          setState("done");
          toast({
            title: "Posts refreshed! ✓",
            description: "Your latest posts have been updated.",
          });
          await onSuccess();
          setState("idle");
        } else {
          setState("error");
          toast({
            variant: "destructive",
            title: "Re-sync failed",
            description: result.error,
          });
        }
      } catch (err) {
        stop();
        setState("error");
        toast({
          variant: "destructive",
          title: "Re-sync failed",
          description: err instanceof Error ? err.message : "Unexpected error",
        });
      }
    }, 3_000);
  };

  const label =
    state === "running" ? "Syncing…" :
    state === "done"    ? "Refreshed!" :
    state === "error"   ? "Retry" :
    "Refresh Posts";

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleClick}
      disabled={state === "running"}
      className={cn(
        "gap-1.5 h-7 px-2.5 text-xs font-medium rounded-lg transition-colors",
        state === "done"
          ? "border-emerald-200 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10"
          : "border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-foreground hover:border-zinc-300 dark:hover:border-zinc-600 bg-transparent"
      )}
    >
      {state === "running" ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : state === "done" ? (
        <CheckCircle2 className="w-3 h-3" />
      ) : (
        <RefreshCw className="w-3 h-3" />
      )}
      {label}
    </Button>
  );
}

// ─── Platform Card ────────────────────────────────────────────────────────────

function PlatformCard({
  platform,
  isConnected,
  followers,
  engagement,
  onSync,
  onRemove,
}: {
  platform: PlatformConfig;
  isConnected: boolean;
  followers: number | null;
  engagement: number | null;
  onSync: () => void;
  onRemove: () => void;
}) {
  const IconComp = platform.icon;
  return (
    <div
      className={cn(
        "rounded-2xl border p-4 flex items-center gap-4 transition-all",
        isConnected
          ? "bg-zinc-900/80 border-white/[0.08] hover:border-white/[0.14]"
          : "bg-zinc-900/40 border-white/[0.05] hover:border-white/[0.09]",
      )}
    >
      {/* Icon */}
      <div className={cn("w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 overflow-hidden", platform.bg)}>
        <IconComp className="w-7 h-7" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="font-semibold text-sm text-zinc-100">{platform.label}</p>
          {isConnected ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Connected
            </span>
          ) : (
            <span className="text-[10px] font-medium text-zinc-500 bg-white/[0.05] border border-white/[0.08] px-1.5 py-0.5 rounded-full">
              Not Connected
            </span>
          )}
        </div>
        {isConnected && followers != null ? (
          <p className="text-xs text-zinc-400">
            {fmt(followers)} followers{engagement ? ` · ${engagement}% eng` : ""}
          </p>
        ) : (
          <p className="text-xs text-zinc-600">
            {platform.syncable ? "Sync to import your stats" : "Coming soon"}
          </p>
        )}
      </div>

      {/* Actions */}
      {platform.syncable && (
        <div className="flex items-center gap-1.5 shrink-0">
          {isConnected && (
            <>
              <Button
                size="icon"
                variant="ghost"
                onClick={onSync}
                className="w-8 h-8 text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06]"
                title={`Re-sync ${platform.label}`}
              >
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={onRemove}
                className="w-8 h-8 text-zinc-600 hover:text-red-400 hover:bg-red-500/10"
                title={`Remove ${platform.label}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </>
          )}
          {!isConnected && (
            <Button
              size="sm"
              onClick={onSync}
              className="gap-1.5 bg-gradient-to-r from-violet-600/20 to-pink-600/10 border border-violet-500/30 text-violet-300 hover:from-violet-600/30 hover:to-pink-600/20 hover:border-violet-400/40"
              variant="outline"
            >
              <Zap className="w-3.5 h-3.5" /> Connect
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Post Card ────────────────────────────────────────────────────────────────

function PostCard({
  post,
  onDelete,
}: {
  post: SocialPostItem;
  onDelete?: (id: string) => void;
}) {
  const [imgError, setImgError] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleting(true);
    const res = await deletePostAction(post.id);
    setDeleting(false);
    if (res.error) {
      toast({ title: "Failed to remove post", description: res.error, variant: "destructive" });
    } else {
      onDelete?.(post.id);
    }
  };

  const PlatformIcon =
    post.platform === "instagram" ? InstagramIcon :
    post.platform === "youtube"   ? YouTubeIcon :
    TikTokIcon;

  const inner = (
    <div className="rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900/80 group cursor-pointer relative">
      {/* Delete button */}
      {onDelete && (
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-black/70 border border-zinc-700 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600/80 hover:border-red-500"
          title="Remove post"
        >
          {deleting ? (
            <Loader2 className="w-3 h-3 text-white animate-spin" />
          ) : (
            <AlertCircle className="w-3 h-3 text-white" />
          )}
        </button>
      )}

      {/* Image or fallback */}
      {post.imageUrl && !imgError ? (
        <div className="aspect-square w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800">
          <img
            src={post.imageUrl}
            alt={post.caption ?? "Post"}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        </div>
      ) : (
        <div className="aspect-square w-full bg-zinc-900 flex items-center justify-center">
          <PlatformIcon className="w-8 h-8 opacity-40" />
        </div>
      )}

      <div className="p-3 space-y-1.5">
        {post.caption && (
          <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">{post.caption}</p>
        )}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground/60">
          {post.likes != null && (
            <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{fmt(post.likes)}</span>
          )}
          {post.comments != null && (
            <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" />{fmt(post.comments)}</span>
          )}
          {post.views != null && (
            <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{fmt(post.views)}</span>
          )}
        </div>
      </div>
    </div>
  );

  if (post.postUrl) {
    return (
      <a href={post.postUrl} target="_blank" rel="noopener noreferrer" className="block">
        {inner}
      </a>
    );
  }
  return inner;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const PresencePage = () => {
  const { profile, fullProfile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [posts, setPosts] = useState<SocialPostItem[]>([]);
  const [syncTarget, setSyncTarget] = useState<Platform | null>(null);
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    const [, postsRes] = await Promise.all([refreshProfile(), getSocialPostsAction()]);
    if (!postsRes.error) setPosts(postsRes.data);
  };

  useEffect(() => {
    // Silently clear any posts with broken image URLs from a previous code version
    clearBrokenPostImagesAction().catch(() => {});
    reload().finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Show feedback toasts after Meta OAuth callback ───────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const checks: Array<{ connectedParam: string; errorParam: string; displayName: string }> = [
      { connectedParam: "instagram_connected", errorParam: "instagram_error", displayName: "Instagram" },
      { connectedParam: "facebook_connected",  errorParam: "facebook_error",  displayName: "Facebook Page" },
      { connectedParam: "threads_connected",   errorParam: "threads_error",   displayName: "Threads" },
      { connectedParam: "tiktok_connected",    errorParam: "tiktok_error",    displayName: "TikTok" },
      { connectedParam: "youtube_connected",   errorParam: "youtube_error",   displayName: "YouTube" },
      // Legacy all-in-one param (kept for old bookmarks/links)
      { connectedParam: "meta_connected",      errorParam: "meta_error",      displayName: "Meta" },
    ];

    const errorMessages: Record<string, string> = {
      missing_code:            "No authorisation code received.",
      invalid_state:           "Invalid OAuth state. Please try again.",
      unauthenticated:         "Please sign in first.",
      session_error:           "Could not verify your session. Please try again.",
      server_misconfiguration: "Integration is not configured on this server.",
      token_exchange_failed:   "Could not exchange the authorisation code.",
      network_error:           "A network error occurred. Please try again.",
      db_error:                "Could not save your tokens. Please try again.",
      no_pages_found:          "No Facebook Pages were found on your account.",
      no_threads_account:      "No Threads account was found for this profile.",
      no_tiktok_account:       "No TikTok account was returned from the API.",
      no_youtube_channel:      "No YouTube channel was found on this Google account.",
      access_denied:           "Access was denied. Please grant the required permissions.",
    };

    let reloadNeeded = false;
    const clean = new URL(window.location.href);

    for (const { connectedParam, errorParam, displayName } of checks) {
      const connected = params.get(connectedParam);
      const error = params.get(errorParam);

      if (connected) {
        const name = connected === "1" ? displayName : connected;
        toast({ title: `${name} connected! 🎉` });
        reloadNeeded = true;
        clean.searchParams.delete(connectedParam);
      } else if (error) {
        toast({
          title: `Could not connect ${displayName}`,
          description: errorMessages[error] ?? decodeURIComponent(error).replace(/_/g, " "),
          variant: "destructive",
        });
        clean.searchParams.delete(errorParam);
      }
    }

    if (reloadNeeded) reload();
    window.history.replaceState({}, "", clean.toString());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Per-platform Meta OAuth redirect ─────────────────────────────────────
  const handleMetaOAuth = useCallback((platform: "instagram" | "facebook_page" | "threads") => {
    const appBase = process.env.NEXT_PUBLIC_APP_URL ?? `${window.location.protocol}//${window.location.host}`;

    const configs = {
      instagram:    { path: "/api/auth/callback/instagram", scope: "instagram_basic,instagram_manage_messages,pages_read_engagement,pages_show_list,business_management", dialog: "https://www.facebook.com/v18.0/dialog/oauth" },
      facebook_page:{ path: "/api/auth/callback/facebook",  scope: "pages_show_list,pages_read_engagement,business_management", dialog: "https://www.facebook.com/v18.0/dialog/oauth" },
      // Threads uses its own OAuth dialog, NOT the Facebook login dialog
      threads:      { path: "/api/auth/callback/threads",   scope: "threads_basic", dialog: "https://threads.net/oauth/authorize" },
    } as const;

    const { path, scope, dialog } = configs[platform];
    const redirectUri = `${appBase.replace(/\/$/, "")}${path}`;

    // Threads requires its own App ID — never use the Facebook/Meta App ID here.
    if (platform === "threads") {
      const threadsAppId = process.env.NEXT_PUBLIC_THREADS_APP_ID;
      if (!threadsAppId) {
        toast({ title: "Threads connection unavailable", description: "Threads sign-in is not available right now. Please try again later or contact support.", variant: "destructive" });
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
      toast({ title: "Instagram connection unavailable", description: "This connection is not available right now. Please try again later or contact support.", variant: "destructive" });
      return;
    }

    const authUrl = new URL(dialog);
    authUrl.searchParams.set("client_id", appId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("scope", scope);
    authUrl.searchParams.set("response_type", "code");

    window.location.href = authUrl.toString();
  }, [toast]);

  // ── TikTok OAuth redirect ─────────────────────────────────────────────────
  const handleTikTokOAuth = useCallback(() => {
    const clientKey = process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY;
    if (!clientKey) {
      toast({
        title: "TikTok connection unavailable",
        description: "TikTok sign-in is not available right now. Please try again later or contact support.",
        variant: "destructive",
      });
      return;
    }

    // Prefer the explicit public URL env-var; fall back to the browser's own origin
    const origin =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
      window.location.origin;

    const redirectUri = `${origin}/api/auth/callback/tiktok`;

    // CSRF state stored in a short-lived cookie so the server callback can verify it
    const state = crypto.randomUUID();
    document.cookie = `__tiktok_state=${state}; path=/; max-age=300; SameSite=Lax`;

    // Build params with an explicit URLSearchParams object — no URL mutation
    const params = new URLSearchParams({
      client_key: clientKey,
      redirect_uri: redirectUri,
      scope: "user.info.basic,user.info.stats",
      response_type: "code",
      state,
    });

    window.location.href =
      `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
  }, [toast]);

  // ── YouTube OAuth redirect ────────────────────────────────────────────────
  const handleYouTubeOAuth = useCallback(() => {
    const clientId = process.env.NEXT_PUBLIC_YOUTUBE_CLIENT_ID;
    if (!clientId) {
      toast({
        title: "YouTube connection unavailable",
        description: "YouTube sign-in is not available right now. Please try again later or contact support.",
        variant: "destructive",
      });
      return;
    }

    const appBase =
      process.env.NEXT_PUBLIC_APP_URL ??
      `${window.location.protocol}//${window.location.host}`;
    const redirectUri = `${appBase.replace(/\/$/, "")}/api/auth/callback/youtube`;

    const state = crypto.randomUUID();
    document.cookie = `__youtube_state=${state}; path=/; max-age=300; SameSite=Lax`;

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("scope", "https://www.googleapis.com/auth/youtube.readonly");
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");

    window.location.href = authUrl.toString();
  }, [toast]);

  // Per-platform stats lookup
  const getPerPlatformStats = (platformId: string) => {
    return fullProfile?.platformStats?.find((s) => s.platform === platformId) ?? null;
  };

  const connectedPlatforms = fullProfile?.connectedPlatforms ?? [];
  const totalFollowers = fullProfile?.followerCount ?? null;
  const avgEngagement = fullProfile?.averageEngagement ?? null;
  const niches = fullProfile?.topNiches ?? [];
  const lastSynced = fullProfile?.lastSyncedAt;

  const handleSyncDone = async () => {
    setSyncTarget(null);
    await reload();
  };

  const handleRemoveConfirm = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    const res = await removePlatformAction(removeTarget);
    setRemoving(false);
    setRemoveTarget(null);
    if (res.error) {
      toast({ title: "Failed to remove", description: res.error, variant: "destructive" });
    } else {
      toast({ title: `${removeTarget.charAt(0).toUpperCase() + removeTarget.slice(1)} removed` });
      await reload();
    }
  };

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* ── Header ── */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1.5">
            <Wifi className="w-5 h-5 text-violet-500 dark:text-violet-400" />
            <h1 className="font-display text-2xl font-bold">Social Connections</h1>
          </div>
          <p className="text-sm text-muted-foreground mb-2">
            Connect your platforms to build your public creator portfolio and get matched with relevant brand campaigns.
          </p>
          <p className="text-xs text-muted-foreground/70">
            We only read public account stats (followers, posts, engagement). We never post, message, or modify your accounts. You can disconnect at any time.
          </p>
        </div>

        {loading ? (
          <div className="space-y-8">
            {/* Stats bar skeleton */}
            <div className="grid grid-cols-3 gap-3">
              {[0,1,2].map((i) => (
                <div key={i} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 animate-pulse">
                  <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded w-16 mb-2" />
                  <div className="h-6 bg-zinc-200 dark:bg-zinc-800 rounded w-20" />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-violet-500 dark:text-violet-400 animate-spin" />
            </div>
          </div>
        ) : (
          <div className="space-y-10">
            {/* ── Summary stats bar ── */}
            {connectedPlatforms.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl border border-white/[0.06] bg-zinc-950/80 backdrop-blur-sm p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mb-1.5">Connected</p>
                  <p className="text-2xl font-bold font-display text-violet-400">
                    {connectedPlatforms.length}
                    <span className="text-sm font-normal text-zinc-500 ml-1">platforms</span>
                  </p>
                </div>
                <div className="rounded-2xl border border-white/[0.06] bg-zinc-950/80 backdrop-blur-sm p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mb-1.5">Followers</p>
                  <p className="text-2xl font-bold font-display text-zinc-100">
                    {totalFollowers != null ? fmt(totalFollowers) : "—"}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/[0.06] bg-zinc-950/80 backdrop-blur-sm p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mb-1.5">Avg Eng.</p>
                  <p className="text-2xl font-bold font-display text-emerald-400">
                    {avgEngagement != null ? `${avgEngagement}%` : "—"}
                  </p>
                </div>
              </div>
            )}
            {/* ── Connect Accounts ── */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">
                  Connect Accounts
                </h2>
                {lastSynced && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500 bg-white/[0.04] border border-white/[0.08] px-2 py-0.5 rounded-full">
                    <RefreshCw className="w-3 h-3" />
                    Last synced {new Date(lastSynced).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                )}
              </div>
              <div className="space-y-3">
                {PLATFORMS.map((p) => {
                  const perPlatform = getPerPlatformStats(p.id);
                  return (
                    <PlatformCard
                      key={p.id}
                      platform={p}
                      isConnected={connectedPlatforms.includes(p.id)}
                      followers={perPlatform?.followerCount ?? null}
                      engagement={perPlatform?.engagementRate ?? null}
                      onSync={() => {
                        if (p.id === "instagram" || p.id === "facebook_page" || p.id === "threads") {
                          handleMetaOAuth(p.id as "instagram" | "facebook_page" | "threads");
                        } else if (p.id === "tiktok") {
                          handleTikTokOAuth();
                        } else if (p.id === "youtube") {
                          handleYouTubeOAuth();
                        } else if (p.syncable) {
                          setSyncTarget(p.id as Platform);
                        }
                      }}
                      onRemove={() => setRemoveTarget(p.id)}
                    />
                  );
                })}
              </div>
            </section>

            {/* ── Performance Snapshot ── */}
            <section>
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-4">
                Performance Snapshot
              </h2>

              {connectedPlatforms.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 p-10 text-center">
                  <Zap className="w-10 h-10 text-zinc-400 dark:text-zinc-700 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground font-medium mb-1">No data yet</p>
                  <p className="text-xs text-muted-foreground/60">
                    Connect a platform above to pull your stats.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-2xl bg-zinc-900/80 border border-white/[0.07] p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Users className="w-4 h-4 text-violet-400" />
                      <p className="text-[11px] text-zinc-500 uppercase tracking-widest font-medium">Followers</p>
                    </div>
                    {totalFollowers != null ? (
                      <p className="text-3xl font-bold font-display text-zinc-100">{fmt(totalFollowers)}</p>
                    ) : (
                      <p className="text-sm text-zinc-600 font-medium">Not synced</p>
                    )}
                  </div>

                  <div className="rounded-2xl bg-zinc-900/80 border border-white/[0.07] p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp className="w-4 h-4 text-emerald-400" />
                      <p className="text-[11px] text-zinc-500 uppercase tracking-widest font-medium">Engagement</p>
                    </div>
                    {avgEngagement != null ? (
                      <p className="text-3xl font-bold font-display text-emerald-400">
                        {avgEngagement.toFixed(1)}%
                      </p>
                    ) : (
                      <p className="text-sm text-zinc-600 font-medium">Not synced</p>
                    )}
                  </div>

                  <div className="rounded-2xl bg-zinc-900/80 border border-white/[0.07] p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <BarChart3 className="w-4 h-4 text-violet-400" />
                      <p className="text-[11px] text-zinc-500 uppercase tracking-widest font-medium">Niches</p>
                    </div>
                    {niches.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {niches.slice(0, 3).map((n) => (
                          <span key={n} className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/20 font-medium">
                            {n}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-zinc-600 font-medium">Not synced</p>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* ── Latest Posts grouped by platform ── */}
            {(() => {
              const PLATFORM_LABELS: Record<string, { label: string; Icon: React.FC<{ className?: string }> }> = {
                instagram: { label: "Instagram Posts", Icon: InstagramIcon },
                tiktok: { label: "TikTok Videos", Icon: TikTokIcon },
                youtube: { label: "YouTube Videos", Icon: YouTubeIcon },
              };
              const groups = Object.entries(PLATFORM_LABELS).map(([key, meta]) => ({
                key,
                meta,
                items: posts.filter((p) => p.platform === key),
              })).filter((g) => g.items.length > 0);

              if (groups.length === 0) return null;

              return (
                <section className="space-y-8">
                  <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">
                    Latest Posts
                  </h2>
                  {groups.map(({ key, meta, items }) => (
                    <div key={key}>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                          <meta.Icon className="w-5 h-5" /> {meta.label}
                        </p>
                        {connectedPlatforms.includes(key) && (
                          <ResyncPostsButton
                            userId={profile?.id ?? ""}
                            platform={key as Platform}
                            onSuccess={reload}
                            onFallback={() =>
                              key === "instagram" || key === "facebook_page" || key === "threads"
                                ? handleMetaOAuth(key as "instagram" | "facebook_page" | "threads")
                                : key === "tiktok"
                                ? handleTikTokOAuth()
                                : key === "youtube"
                                ? handleYouTubeOAuth()
                                : setSyncTarget(key as Platform)
                            }
                          />
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        {items.slice(0, 3).map((post) => (
                          <PostCard
                            key={post.id}
                            post={post}
                            onDelete={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </section>
              );
            })()}
          </div>
        )}
      </div>

      {/* Sync Modal — not used for Instagram, TikTok, or YouTube (all use OAuth) */}
      {syncTarget && syncTarget !== "instagram" && syncTarget !== "tiktok" && syncTarget !== "youtube" && (
        <Dialog open onOpenChange={(open) => !open && setSyncTarget(null)}>
          <SyncModal
            userId={profile?.id ?? ""}
            platform={syncTarget}
            onDone={handleSyncDone}
            onClose={() => setSyncTarget(null)}
          />
        </Dialog>
      )}

      {/* Remove Confirm Dialog */}
      <AlertDialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent className="bg-zinc-950 border-zinc-800 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeTarget}?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              This will delete all synced data and posts for{" "}
              <span className="capitalize font-medium text-white">{removeTarget}</span>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 bg-transparent">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveConfirm}
              disabled={removing}
              className="bg-red-600 hover:bg-red-500 text-white border-0 gap-2"
            >
              {removing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
};

export default PresencePage;
