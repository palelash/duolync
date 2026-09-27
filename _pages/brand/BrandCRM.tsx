"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Search, ExternalLink, Users, Chrome, Filter, X, Grid3x3, Trash2 } from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { RichEmptyState } from "@/components/shared/RichEmptyState";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type SocialPlatform = "INSTAGRAM" | "TIKTOK" | "YOUTUBE" | "THREADS";
type SavedCreatorStatus = "SAVED" | "CONTACTED" | "IN_PROGRESS" | "REJECTED" | "ARCHIVED";

interface Creator {
  id: string;
  platform: SocialPlatform;
  handle: string;
  name: string | null;
  avatarUrl: string | null;
  sourceUrl: string | null;
  followersCount: number | null;
  postsCount: number | null;
  email: string | null;
  notes: string | null;
  status: SavedCreatorStatus;
  createdAt: string;
  updatedAt: string;
}

// ─── Platform config ──────────────────────────────────────────────────────────

const PLATFORMS: { key: SocialPlatform | "ALL"; label: string }[] = [
  { key: "ALL",       label: "All"       },
  { key: "INSTAGRAM", label: "Instagram" },
  { key: "TIKTOK",    label: "TikTok"    },
  { key: "YOUTUBE",   label: "YouTube"   },
  { key: "THREADS",   label: "Threads"   },
];

const PLATFORM_META: Record<
  SocialPlatform,
  { label: string; dot: string; badge: string; postsLabel: string }
> = {
  INSTAGRAM: {
    label: "Instagram",
    postsLabel: "Posts",
    dot: "bg-fuchsia-400",
    badge: "bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20",
  },
  TIKTOK: {
    label: "TikTok",
    postsLabel: "Videos",
    dot: "bg-teal-400",
    badge: "bg-teal-500/10 text-teal-400 border border-teal-500/20",
  },
  YOUTUBE: {
    label: "YouTube",
    postsLabel: "Videos",
    dot: "bg-red-400",
    badge: "bg-red-500/10 text-red-400 border border-red-500/20",
  },
  THREADS: {
    label: "Threads",
    postsLabel: "Posts",
    dot: "bg-zinc-400",
    badge: "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCount(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}M`;
  }
  if (n >= 1_000) {
    const v = n / 1_000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}K`;
  }
  return n.toLocaleString();
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function CreatorCardSkeleton() {
  return (
    <div className="animate-pulse flex flex-col gap-3 p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-zinc-800" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 w-32 bg-zinc-800 rounded-md" />
          <div className="h-3 w-20 bg-zinc-800/60 rounded-md" />
        </div>
        <div className="h-5 w-16 bg-zinc-800 rounded-full" />
      </div>
      <div className="h-px bg-zinc-800/60" />
      <div className="flex gap-4">
        <div className="h-3 w-20 bg-zinc-800/60 rounded-md" />
        <div className="h-3 w-28 bg-zinc-800/60 rounded-md" />
      </div>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <CreatorCardSkeleton key={i} />
      ))}
    </div>
  );
}

// ─── Creator Card ─────────────────────────────────────────────────────────────

interface CreatorCardProps {
  creator: Creator;
  onDelete: (id: string) => void;
}

function CreatorCard({ creator, onDelete }: CreatorCardProps) {
  const meta        = PLATFORM_META[creator.platform];
  const displayName = creator.name ?? creator.handle;
  const initials    = displayName
    .replace(/^@/, "")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const hasFollowers = creator.followersCount != null;
  const hasPosts     = creator.postsCount     != null;

  const [avatarError,   setAvatarError]   = useState(false);
  const [deleteState,   setDeleteState]   = useState<"idle" | "confirm" | "deleting">("idle");

  const handleDeleteClick = () => {
    if (deleteState === "idle") {
      setDeleteState("confirm");
      // Auto-reset if the user doesn't confirm within 3 s
      setTimeout(() => setDeleteState((s) => s === "confirm" ? "idle" : s), 3000);
      return;
    }
    if (deleteState === "confirm") {
      setDeleteState("deleting");
      fetch(`/api/creators/${creator.id}`, { method: "DELETE", credentials: "include" })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          onDelete(creator.id);
        })
        .catch(() => setDeleteState("idle"));
    }
  };

  return (
    <div
      className={cn(
        "group flex flex-col bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.06] hover:border-white/[0.12] rounded-2xl overflow-hidden transition-all duration-200 shadow-sm",
        deleteState === "deleting" && "opacity-40 pointer-events-none"
      )}
    >
      {/* ── Identity row ── */}
      <div className="flex items-start gap-3.5 p-5 pb-4">
        {/* Avatar */}
        <div className="relative shrink-0">
          <div className="w-12 h-12 rounded-full overflow-hidden bg-zinc-800 ring-1 ring-white/[0.08]">
            {creator.avatarUrl && !avatarError ? (
              <img
                src={creator.avatarUrl}
                alt={displayName}
                className="w-full h-full object-cover"
                onError={() => setAvatarError(true)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sm font-bold text-zinc-400">
                {initials}
              </div>
            )}
          </div>
          <span className={cn("absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#070709]", meta.dot)} />
        </div>

        {/* Name + handle */}
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="font-semibold text-sm text-zinc-100 truncate leading-snug">
            {displayName}
          </div>
          <div className="text-xs text-zinc-500 truncate mt-0.5">{creator.handle}</div>
        </div>

        {/* Platform badge */}
        <span className={cn("shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold leading-none", meta.badge)}>
          <span className={cn("w-1.5 h-1.5 rounded-full", meta.dot)} />
          {meta.label}
        </span>
      </div>

      {/* ── Stats strip ── */}
      <div className="grid grid-cols-2 border-t border-white/[0.05]">
        {/* Followers */}
        <div className="flex flex-col items-center justify-center py-3 gap-0.5 border-r border-white/[0.05]">
          <div
            className={cn("text-base font-bold tracking-tight leading-none", hasFollowers ? "text-zinc-100" : "text-zinc-700")}
            title={hasFollowers ? creator.followersCount?.toLocaleString() : undefined}
          >
            {fmtCount(creator.followersCount)}
          </div>
          <div className="flex items-center gap-1 text-[10px] font-medium text-zinc-600 uppercase tracking-wide mt-0.5">
            <Users className="w-2.5 h-2.5" />
            Followers
          </div>
        </div>

        {/* Posts / videos */}
        <div className="flex flex-col items-center justify-center py-3 gap-0.5">
          <div
            className={cn("text-base font-bold tracking-tight leading-none", hasPosts ? "text-zinc-100" : "text-zinc-700")}
            title={hasPosts ? creator.postsCount?.toLocaleString() : undefined}
          >
            {fmtCount(creator.postsCount)}
          </div>
          <div className="flex items-center gap-1 text-[10px] font-medium text-zinc-600 uppercase tracking-wide mt-0.5">
            <Grid3x3 className="w-2.5 h-2.5" />
            {meta.postsLabel}
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-white/[0.015] border-t border-white/[0.04]">
        <span className="text-[11px] text-zinc-600">
          {new Date(creator.createdAt).toLocaleDateString("en-US", {
            month: "short", day: "numeric", year: "numeric",
          })}
        </span>

        <div className="flex items-center gap-2">
          {creator.sourceUrl && (
            <Link
              href={creator.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              View profile
              <ExternalLink className="w-3 h-3" />
            </Link>
          )}

          {/* Delete button — first click arms it; second click fires */}
          <button
            onClick={handleDeleteClick}
            disabled={deleteState === "deleting"}
            title={deleteState === "confirm" ? "Click again to confirm" : "Remove from CRM"}
            className={cn(
              "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-all duration-150",
              deleteState === "idle"
                ? "text-zinc-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100"
                : deleteState === "confirm"
                  ? "text-red-400 bg-red-500/15 border border-red-500/30 opacity-100"
                  : "text-red-400 opacity-40 cursor-not-allowed"
            )}
          >
            <Trash2 className="w-3 h-3" />
            {deleteState === "confirm" && <span>Confirm?</span>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const BrandCRM = () => {
  const [creators, setCreators]         = useState<Creator[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [search, setSearch]             = useState("");
  const [activePlatform, setActivePlatform] = useState<SocialPlatform | "ALL">("ALL");

  const fetchCreators = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search)                   params.set("q", search);
      if (activePlatform !== "ALL") params.set("platform", activePlatform);

      const res = await fetch(`/api/creators?${params.toString()}`, {
        credentials: "include",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json() as { creators: Creator[] };
      setCreators(data.creators);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [search, activePlatform]);

  // Debounce search changes
  useEffect(() => {
    const timer = setTimeout(() => { void fetchCreators(); }, 300);
    return () => clearTimeout(timer);
  }, [fetchCreators]);

  // Optimistic removal — no refetch needed
  const handleDelete = useCallback((id: string) => {
    setCreators((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const isEmpty    = !loading && !error && creators.length === 0;
  const hasSearch  = search.trim().length > 0 || activePlatform !== "ALL";

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">

        {/* ── Page header ── */}
        <div className="flex items-start justify-between gap-4 flex-wrap mb-8">
          <div>
            <h1 className="font-display text-3xl font-bold text-zinc-50 mb-1">
              Creator CRM
            </h1>
            <p className="text-sm text-zinc-500">
              Profiles saved from Instagram, TikTok, YouTube, and Threads via the Chrome extension
            </p>
          </div>

          {!loading && creators.length > 0 && (
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/[0.03] border border-white/[0.07] text-sm text-zinc-400">
              <Users className="w-4 h-4 text-zinc-500" />
              <span>
                <span className="font-semibold text-zinc-200">{creators.length}</span>{" "}
                creator{creators.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>

        {/* ── Filters ── */}
        {!error && (
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, handle…"
                className="pl-10 h-10 bg-white/[0.03] border-white/[0.08] text-zinc-100 placeholder:text-zinc-600 focus:border-white/20 text-sm"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.07] w-fit flex-wrap">
              {PLATFORMS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setActivePlatform(key)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150",
                    activePlatform === key
                      ? "bg-white/[0.09] text-zinc-100 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {hasSearch && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSearch(""); setActivePlatform("ALL"); }}
                className="h-10 px-3 text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] gap-1.5"
              >
                <Filter className="w-3.5 h-3.5" />
                Clear filters
              </Button>
            )}
          </div>
        )}

        {/* ── States ── */}
        {loading && <GridSkeleton />}

        {error && (
          <div className="flex flex-col items-center py-16 text-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <X className="w-5 h-5 text-red-400" />
            </div>
            <p className="font-semibold text-zinc-200 text-sm">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchCreators()}
              className="border-white/[0.08] text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]"
            >
              Try again
            </Button>
          </div>
        )}

        {isEmpty && !hasSearch && (
          <RichEmptyState
            icon={<Chrome className="w-8 h-8 text-violet-400" />}
            headline="No saved creators yet"
            sub="Install the Duolync Chrome extension, browse a creator's profile on Instagram, TikTok, YouTube, or Threads, then click 'Save to Duolync'."
            tips={[
              { icon: <span className="text-fuchsia-400 text-xs font-bold">IG</span>, label: "Instagram profiles" },
              { icon: <span className="text-teal-400 text-xs font-bold">TT</span>, label: "TikTok profiles" },
              { icon: <span className="text-red-400 text-xs font-bold">YT</span>, label: "YouTube channels" },
              { icon: <span className="text-zinc-400 text-xs font-bold">TH</span>, label: "Threads profiles" },
            ]}
            ambient="purple"
          />
        )}

        {isEmpty && hasSearch && (
          <div className="flex flex-col items-center py-16 text-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-zinc-800/60 border border-white/[0.06] flex items-center justify-center">
              <Search className="w-5 h-5 text-zinc-500" />
            </div>
            <p className="font-semibold text-zinc-200 text-sm">No creators match your filters</p>
            <p className="text-xs text-zinc-500 max-w-xs">
              Try a different search term or switch the platform filter.
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSearch(""); setActivePlatform("ALL"); }}
              className="text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
            >
              Clear filters
            </Button>
          </div>
        )}

        {!loading && !error && creators.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {creators.map((creator) => (
              <CreatorCard key={creator.id} creator={creator} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default BrandCRM;
