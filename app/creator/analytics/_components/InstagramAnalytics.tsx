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

function IgIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

interface InstagramAnalyticsProps {
  slice: PlatformAnalyticsSlice;
}

/**
 * Instagram tab content.
 *
 * Sections:
 *   1. Header — source badge + connection state + freshness
 *   2. Account snapshot — Followers / Following / Posts
 *   3. 28-day insights — only when selectedSource === OFFICIAL_API + snapshot stored
 *   4. Avg engagement + avg views
 *   5. Recent content
 *
 * Connection and source are separate concepts:
 *   - Connected = PlatformToken exists
 *   - Official = OFFICIAL_API data (may remain after token expires)
 */
export function InstagramAnalytics({ slice }: InstagramAnalyticsProps) {
  const badge = slice.sourceBadge;

  return (
    <div className="space-y-4">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shrink-0">
            <IgIcon className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold">Instagram</h2>
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

      {/* ── Account Snapshot ───────────────────────────────────────────── */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4">
        <h3 className="text-sm font-semibold mb-3">Account</h3>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Followers", value: fmtMetric(slice.followers) },
            { label: "Following", value: fmtMetric(slice.following) },
            { label: "Posts", value: fmtMetric(slice.postCount) },
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

      {/* ── Instagram 28-day Insights ────────────────────────────────────
           Only shown when selectedSource === OFFICIAL_API AND snapshot stored.
           Does NOT require a live token.
           Public Instagram (non-official) never gets this block. */}
      {slice.instagramInsights?.available && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
            <div>
              <h3 className="text-sm font-semibold">Instagram Insights</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Last 28 days · not lifetime totals
              </p>
            </div>
            {slice.instagramInsights.fetchedAt && (
              <p className="text-xs text-muted-foreground shrink-0">
                Updated {fmtDate(slice.instagramInsights.fetchedAt)}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: "Reach", value: slice.instagramInsights.reach },
              { label: "Views", value: slice.instagramInsights.views },
              { label: "Profile Views", value: slice.instagramInsights.profileViews },
              { label: "Accounts Engaged", value: slice.instagramInsights.accountsEngaged },
              { label: "Total Interactions", value: slice.instagramInsights.totalInteractions },
            ].map((m) => (
              <div
                key={m.label}
                className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-3 text-center"
              >
                <p className="text-lg font-bold tabular-nums">
                  {fmtMetric(m.value)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {m.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Content Averages ────────────────────────────────────────────── */}
      {(slice.avgEngagementRate !== null || slice.avgViews !== null) && (
        <div className="grid grid-cols-2 gap-3">
          <TooltipProvider>
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4">
              <div className="flex items-center gap-1 mb-1">
                <p className="text-xs text-muted-foreground">Avg Engagement</p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-3 h-3 text-muted-foreground cursor-help shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[220px] text-xs">
                    Average likes and comments per post relative to the
                    platform&apos;s current follower count.
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className="text-2xl font-bold tabular-nums">
                {fmtPercent(slice.avgEngagementRate)}
              </p>
              {slice.avgEngagementRate !== null &&
                slice.engagementSampleSize !== null &&
                slice.engagementSampleSize > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Based on {slice.engagementSampleSize} post
                    {slice.engagementSampleSize !== 1 ? "s" : ""}
                  </p>
                )}
            </div>
          </TooltipProvider>
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Avg Views</p>
            <p className="text-2xl font-bold tabular-nums">
              {fmtMetric(slice.avgViews)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Recent posts</p>
          </div>
        </div>
      )}

      {/* ── Recent Content ───────────────────────────────────────────────── */}
      {slice.recentPosts.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4">
          <h3 className="text-sm font-semibold mb-3">Recent Content</h3>
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
