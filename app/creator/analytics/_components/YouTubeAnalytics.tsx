"use client";

import { Wifi, WifiOff, Info } from "lucide-react";
import type { PlatformAnalyticsSlice } from "@/lib/analytics-v2";
import { fmtMetric, fmtPercent, fmtDate } from "@/lib/analytics-v2";
import { PlatformSourceBadge } from "./PlatformSourceBadge";
import { RecentContentList } from "./RecentContentList";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/app/_components/ui/tooltip";

function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z" />
    </svg>
  );
}

interface YouTubeAnalyticsProps {
  slice: PlatformAnalyticsSlice;
}

/**
 * YouTube tab content (LIMITED in V2.0).
 *
 * Sections:
 *   1. Header — source badge + connection state + freshness note
 *   2. Channel overview — Subscribers / Videos / Channel lifetime views
 *   3. Video performance averages
 *   4. Recent videos (up to 6)
 *
 * Freshness note: "Data from last YouTube connection" — never implies live analytics.
 * Tab is only shown when meaningful data exists (enforced by showAsTab in slice).
 */
export function YouTubeAnalytics({ slice }: YouTubeAnalyticsProps) {
  const badge = slice.sourceBadge;

  return (
    <div className="space-y-4">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center shrink-0">
            <YouTubeIcon className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold">YouTube</h2>
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
            <p className="text-xs text-muted-foreground mt-0.5">
              Data from last YouTube connection
              {slice.statsUpdatedAt ? ` · ${fmtDate(slice.statsUpdatedAt)}` : ""}
            </p>
          </div>
        </div>
      </div>

      {/* ── Channel Overview ─────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4">
        <h3 className="text-sm font-semibold mb-3">Channel</h3>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Subscribers", value: fmtMetric(slice.followers) },
            { label: "Videos", value: fmtMetric(slice.postCount) },
            // channelLifetimeViews from raw.total_views
            { label: "Lifetime Views", value: fmtMetric(slice.channelLifetimeViews) },
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

      {/* ── Video Performance Averages ───────────────────────────────────── */}
      {(slice.avgViews !== null ||
        slice.avgLikes !== null ||
        slice.avgComments !== null ||
        slice.avgEngagementRate !== null) && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4">
          <h3 className="text-sm font-semibold mb-3">Video Performance</h3>
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
                      platform&apos;s current subscriber count.
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

      {/* ── Recent Videos (up to 6) ──────────────────────────────────────── */}
      {slice.recentPosts.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4">
          <h3 className="text-sm font-semibold mb-3">Recent Videos</h3>
          <RecentContentList
            posts={slice.recentPosts}
            maxItems={6}
            showPlatform={false}
          />
        </div>
      )}
    </div>
  );
}
