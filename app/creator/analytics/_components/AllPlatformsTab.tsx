"use client";

import { Users, BarChart3, Wifi } from "lucide-react";
import type { CreatorAnalyticsV2 } from "@/lib/analytics-v2";
import { fmtMetric } from "@/lib/analytics-v2";
import { AnalyticsKpiCard } from "./AnalyticsKpiCard";
import { FollowerComparisonChart } from "./FollowerComparisonChart";
import { PlatformComparisonTable } from "./PlatformComparisonTable";
import { RecentContentList } from "./RecentContentList";

interface AllPlatformsTabProps {
  analytics: CreatorAnalyticsV2;
}

/**
 * All Platforms tab.
 *
 * Sections:
 *   1. Overview KPIs: Total Followers / Platforms with data / Connected accounts
 *   2. Follower comparison chart (platforms where followerCount !== null)
 *   3. Platform comparison table (all slices including limited Facebook row)
 *   4. Recent cross-platform content
 *
 * No overall engagement rate.
 * No overall avg views.
 * No Best Platform.
 *
 * Total followers label: "Across available platform data" (not "connected accounts")
 * because historical/public data may be included.
 */
export function AllPlatformsTab({ analytics }: AllPlatformsTabProps) {
  const { overview, slices, crossPlatformRecentContent } = analytics;

  // Platforms eligible for follower comparison chart
  const followerSlices = slices.filter(
    (s) => s.followers !== null && s.platform !== "threads",
  );

  return (
    <div className="space-y-5">
      {/* ── KPI Overview ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <AnalyticsKpiCard
          label="Total Followers"
          value={fmtMetric(overview.totalFollowers)}
          sub="Across available platform data"
          icon={
            <Users className="w-5 h-5 text-violet-600 dark:text-violet-400" />
          }
          iconBg="bg-violet-100 dark:bg-violet-900/30"
        />
        <AnalyticsKpiCard
          label="Platforms with data"
          value={overview.platformsWithData.toString()}
          icon={
            <BarChart3 className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
          }
          iconBg="bg-cyan-100 dark:bg-cyan-900/30"
        />
        <AnalyticsKpiCard
          label="Connected"
          value={overview.connectedAccounts.toString()}
          icon={
            <Wifi className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          }
          iconBg="bg-emerald-100 dark:bg-emerald-900/30"
        />
      </div>

      {/* ── Follower Comparison ──────────────────────────────────────────── */}
      {followerSlices.length >= 1 && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4">
          <h3 className="text-sm font-semibold mb-4">Follower Comparison</h3>
          <FollowerComparisonChart slices={followerSlices} />
        </div>
      )}

      {/* ── Platform Comparison Table ────────────────────────────────────── */}
      {slices.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2 px-0.5">
            Platform Overview
          </h3>
          <PlatformComparisonTable slices={slices} />
        </div>
      )}

      {/* ── Cross-Platform Recent Content ────────────────────────────────── */}
      {crossPlatformRecentContent.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4">
          <h3 className="text-sm font-semibold mb-3">Recent Content</h3>
          <RecentContentList
            posts={crossPlatformRecentContent}
            maxItems={12}
            showPlatform
          />
        </div>
      )}
    </div>
  );
}
