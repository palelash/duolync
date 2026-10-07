"use client";

import { Wifi, WifiOff, Info } from "lucide-react";
import type { PlatformAnalyticsSlice } from "@/lib/analytics-v2";
import { fmtMetric, fmtPercent, fmtDate } from "@/lib/analytics-v2";
import { PlatformSourceBadge } from "./PlatformSourceBadge";
import { RecentContentList } from "./RecentContentList";
import { RecentPerformanceChart } from "./RecentPerformanceChart";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/app/_components/ui/tooltip";

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.3a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.69a8.24 8.24 0 0 0 4.82 1.54V6.78a4.85 4.85 0 0 1-1.06-.09z" />
    </svg>
  );
}

interface TikTokAnalyticsProps {
  slice: PlatformAnalyticsSlice;
}

/**
 * TikTok tab content.
 *
 * Sections:
 *   1. Header — source badge + connection state + freshness
 *   2. Account overview — Followers / Following / Videos / Lifetime Likes
 *   3. Content performance averages
 *   4. Recent video performance chart (Views / Likes / Comments by publish date)
 *   5. Recent videos list
 *
 * Chart title: "Recent video performance" — NEVER "Growth".
 * Lifetime likes: from raw.likes_count only; NEVER summed from synced posts.
 */
export function TikTokAnalytics({ slice }: TikTokAnalyticsProps) {
  const badge = slice.sourceBadge;
  const datedPostCount = slice.recentPosts.filter((p) => p.postedAt !== null).length;

  return (
    <div className="space-y-4">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-black flex items-center justify-center shrink-0">
            <TikTokIcon className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold">TikTok</h2>
              {badge && (
                <PlatformSourceBadge type={badge.type} label={badge.label} />
              )}
              {slice.connected ? (
                <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                  <Wifi className="w-3 h-3" />
                  Connected
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <WifiOff className="w-3 h-3" />
                  Not connected
                </span>
              )}
            </div>
            {slice.statsUpdatedAt && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Updated {fmtDate(slice.statsUpdatedAt)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Account Overview ────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4">
        <h3 className="text-sm font-semibold mb-3">Account Overview</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Followers", value: fmtMetric(slice.followers) },
            { label: "Following", value: fmtMetric(slice.following) },
            { label: "Videos", value: fmtMetric(slice.postCount) },
            // lifetimeLikes from raw.likes_count only — NEVER summed from posts
            { label: "Lifetime Likes", value: fmtMetric(slice.lifetimeLikes) },
          ].map((m) => (
            <div
              key={m.label}
              className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-3 text-center"
            >
              <p className="text-lg font-bold tabular-nums">{m.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{m.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Content Performance Averages ────────────────────────────────── */}
      {(slice.avgViews !== null ||
        slice.avgLikes !== null ||
        slice.avgComments !== null ||
        slice.avgEngagementRate !== null) && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4">
          <h3 className="text-sm font-semibold mb-3">Content Performance</h3>
          <TooltipProvider>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Avg Views", value: fmtMetric(slice.avgViews) },
                { label: "Avg Likes", value: fmtMetric(slice.avgLikes) },
                { label: "Avg Comments", value: fmtMetric(slice.avgComments) },
              ].map((m) => (
                <div
                  key={m.label}
                  className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-3 text-center"
                >
                  <p className="text-lg font-bold tabular-nums">{m.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {m.label}
                  </p>
                </div>
              ))}
              {/* Avg Engagement — tooltip + sample count */}
              <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-3 text-center">
                <p className="text-lg font-bold tabular-nums">
                  {fmtPercent(slice.avgEngagementRate)}
                </p>
                <div className="flex items-center justify-center gap-1 mt-0.5">
                  <p className="text-xs text-muted-foreground">Avg Engagement</p>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="w-3 h-3 text-muted-foreground cursor-help shrink-0" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[220px] text-xs">
                      Average likes and comments per video relative to the
                      platform&apos;s current follower count.
                    </TooltipContent>
                  </Tooltip>
                </div>
                {slice.avgEngagementRate !== null &&
                  slice.engagementSampleSize !== null &&
                  slice.engagementSampleSize > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Based on {slice.engagementSampleSize} video
                      {slice.engagementSampleSize !== 1 ? "s" : ""}
                    </p>
                  )}
              </div>
            </div>
          </TooltipProvider>
        </div>
      )}

      {/* ── Recent Video Performance Chart ──────────────────────────────── */}
      {datedPostCount >= 2 && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4">
          <RecentPerformanceChart
            posts={slice.recentPosts}
            title="Recent video performance"
            series={[
              { key: "views", label: "Views", color: "#6366f1" },
              { key: "likes", label: "Likes", color: "#ec4899" },
              { key: "comments", label: "Comments", color: "#f59e0b" },
            ]}
          />
        </div>
      )}

      {/* ── Recent Videos ────────────────────────────────────────────────── */}
      {slice.recentPosts.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4">
          <h3 className="text-sm font-semibold mb-3">Recent Videos</h3>
          <RecentContentList
            posts={slice.recentPosts}
            maxItems={10}
            showPlatform={false}
          />
        </div>
      )}
    </div>
  );
}
