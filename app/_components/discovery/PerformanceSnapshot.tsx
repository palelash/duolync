"use client";

import { useEffect, useState } from "react";
import { TrendingUp, Eye, Zap, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getCreatorAnalyticsAction,
  type CreatorAnalytics,
} from "@/app/actions/analytics";

function formatReach(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

interface PerformanceSnapshotProps {
  creatorUserId: string;
  /** Fallback engagement rate from creator profile */
  fallbackEngRate?: number;
  /** Fallback follower count */
  fallbackFollowers?: number;
  className?: string;
}

/**
 * Compact performance snapshot shown to brands when viewing a creator profile
 * in Discover or within a proposal. Displays Average Engagement Rate and Reach.
 */
export function PerformanceSnapshot({
  creatorUserId,
  fallbackEngRate = 0,
  fallbackFollowers = 0,
  className,
}: PerformanceSnapshotProps) {
  const [data, setData] = useState<CreatorAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getCreatorAnalyticsAction(creatorUserId).then(({ data: result }) => {
      if (!cancelled) {
        setData(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [creatorUserId]);

  const engRate = data?.avgEngagementRate ?? fallbackEngRate;
  const avgViewsPerPost = data?.avgViewsPerPost ?? null;
  const bestPlatform = data?.bestPlatform?.label ?? null;

  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 overflow-hidden",
        className
      )}
    >
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
        <Zap className="w-3.5 h-3.5 text-violet-500 shrink-0" />
        <span className="text-[10px] uppercase tracking-widest font-semibold text-zinc-500 dark:text-zinc-400">
          Performance Snapshot
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-5">
          <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
        </div>
      ) : (
        <div className="grid grid-cols-2 divide-x divide-zinc-200 dark:divide-zinc-800">
          {/* Avg Engagement Rate */}
          <div className="px-4 py-3.5 flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-3 h-3 text-emerald-500 shrink-0" />
              <span className="text-[9px] uppercase tracking-widest text-zinc-500 dark:text-zinc-400 font-semibold">
                Avg Eng Rate
              </span>
            </div>
            <span
              className={cn(
                "text-xl font-display font-bold leading-none",
                engRate >= 5
                  ? "text-emerald-500"
                  : engRate >= 2
                  ? "text-amber-500"
                  : "text-zinc-700 dark:text-zinc-300"
              )}
            >
              {engRate.toFixed(1)}%
            </span>
            <span className="text-[10px] text-zinc-500 dark:text-zinc-500">
              {engRate >= 5 ? "Above average" : engRate >= 2 ? "Average" : "Below avg"}
            </span>
          </div>

          {/* Avg Views / Post */}
          <div className="px-4 py-3.5 flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <Eye className="w-3 h-3 text-violet-500 shrink-0" />
              <span className="text-[9px] uppercase tracking-widest text-zinc-500 dark:text-zinc-400 font-semibold">
                Avg Views / Post
              </span>
            </div>
            <span className="text-xl font-display font-bold leading-none text-zinc-900 dark:text-zinc-50">
              {avgViewsPerPost != null ? formatReach(avgViewsPerPost) : "—"}
            </span>
            <span className="text-[10px] text-zinc-500 dark:text-zinc-500">per post</span>
          </div>
        </div>
      )}

      {/* Best platform strip */}
      {!loading && bestPlatform && (
        <div className="px-4 py-2 border-t border-zinc-200 dark:border-zinc-800 bg-violet-50 dark:bg-violet-500/[0.06]">
          <p className="text-[10px] text-violet-600 dark:text-violet-400 font-semibold truncate">
            ✦ {bestPlatform}
          </p>
        </div>
      )}
    </div>
  );
}
