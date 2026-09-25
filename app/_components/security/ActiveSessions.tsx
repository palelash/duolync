"use client";

import { useEffect, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Monitor,
  Smartphone,
  Tablet,
  MapPin,
  Clock,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ActiveSession {
  id: string;
  isCurrent: boolean;
  deviceType: "Desktop" | "Mobile" | "Tablet";
  os: string;
  browser: string;
  ipAddress: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function DeviceIcon({
  type,
  className,
}: {
  type: "Desktop" | "Mobile" | "Tablet";
  className?: string;
}) {
  if (type === "Mobile") return <Smartphone className={className} />;
  if (type === "Tablet") return <Tablet className={className} />;
  return <Monitor className={className} />;
}

// ── Session Card ──────────────────────────────────────────────────────────────

function SessionCard({
  session,
  onRevoke,
  isRevoking,
}: {
  session: ActiveSession;
  onRevoke: (id: string) => void;
  isRevoking: boolean;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -12, scale: 0.97 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "group relative flex items-start gap-4 rounded-xl border p-4 transition-colors",
        session.isCurrent
          ? "border-violet-200 dark:border-violet-500/30 bg-violet-50/60 dark:bg-violet-500/8"
          : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 hover:border-zinc-300 dark:hover:border-zinc-700",
      )}
    >
      {/* Device icon */}
      <div
        className={cn(
          "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
          session.isCurrent
            ? "bg-violet-100 dark:bg-violet-500/20"
            : "bg-zinc-100 dark:bg-zinc-800",
        )}
      >
        <DeviceIcon
          type={session.deviceType}
          className={cn(
            "h-5 w-5",
            session.isCurrent
              ? "text-violet-600 dark:text-violet-400"
              : "text-zinc-500 dark:text-zinc-400",
          )}
        />
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold leading-none">
            {session.browser} on {session.os}
          </p>

          {session.isCurrent && (
            <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 dark:border-violet-500/30 bg-violet-100 dark:bg-violet-500/15 px-2 py-0.5 text-[11px] font-semibold text-violet-700 dark:text-violet-300">
              <ShieldCheck className="h-2.5 w-2.5" />
              Current Session
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3 shrink-0" />
            {session.ipAddress}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3 shrink-0" />
            Last active {formatRelative(session.lastActiveAt)}
          </span>
        </div>

        <p className="text-[11px] text-muted-foreground/70">
          Signed in {formatRelative(session.createdAt)}
        </p>
      </div>

      {/* Action */}
      {!session.isCurrent && (
        <Button
          size="sm"
          variant="ghost"
          disabled={isRevoking}
          onClick={() => onRevoke(session.id)}
          className="shrink-0 h-8 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:border-red-300 dark:hover:border-red-600/40 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-colors gap-1.5"
        >
          {isRevoking ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <LogOut className="h-3 w-3" />
          )}
          Log out
        </Button>
      )}
    </motion.div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ActiveSessions() {
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [isRefreshing, startRefreshTransition] = useTransition();

  async function fetchSessions() {
    try {
      const res = await fetch("/api/sessions");
      if (!res.ok) throw new Error("Failed to fetch sessions");
      const data = (await res.json()) as { sessions: ActiveSession[] };
      setSessions(data.sessions);
    } catch {
      toast.error("Could not load active sessions");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchSessions();
  }, []);

  function handleRefresh() {
    startRefreshTransition(async () => {
      setLoading(true);
      await fetchSessions();
    });
  }

  async function handleRevoke(id: string) {
    setRevokingId(id);
    try {
      const res = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        toast.error(body.error ?? "Failed to log out session");
        return;
      }
      setSessions((prev) => prev.filter((s) => s.id !== id));
      toast.success("Session terminated");
    } catch {
      toast.error("Something went wrong");
    } finally {
      setRevokingId(null);
    }
  }

  const otherSessions = sessions.filter((s) => !s.isCurrent);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Active Sessions</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Devices currently signed in to your account
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={loading || isRefreshing}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors disabled:opacity-40"
        >
          <RefreshCw className={cn("h-3 w-3", (loading || isRefreshing) && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Session list */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : sessions.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No sessions found.</p>
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {sessions.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                onRevoke={handleRevoke}
                isRevoking={revokingId === s.id}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Revoke all other sessions */}
      {!loading && otherSessions.length > 1 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="pt-1"
        >
          <button
            type="button"
            disabled={revokingId !== null}
            onClick={async () => {
              for (const s of otherSessions) {
                await handleRevoke(s.id);
              }
            }}
            className="text-xs font-medium text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 transition-colors disabled:opacity-40"
          >
            Log out all other sessions ({otherSessions.length})
          </button>
        </motion.div>
      )}
    </div>
  );
}
