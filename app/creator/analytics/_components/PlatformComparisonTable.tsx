"use client";

import type { PlatformAnalyticsSlice } from "@/lib/analytics-v2";
import { fmtMetric, fmtPercent, fmtDate } from "@/lib/analytics-v2";
import { PlatformSourceBadge } from "./PlatformSourceBadge";

interface PlatformComparisonTableProps {
  slices: PlatformAnalyticsSlice[];
}

/**
 * Platform comparison table.
 *
 * Columns: Platform | Followers | Avg engagement | Avg views | Synced posts | Source | Updated
 *
 * Facebook row shows Followers only; Engagement / Avg views / Synced posts → "No data".
 * Threads is never in slices so it never appears here.
 */
export function PlatformComparisonTable({
  slices,
}: PlatformComparisonTableProps) {
  if (slices.length === 0) return null;

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              {[
                { label: "Platform", align: "left" },
                { label: "Followers", align: "right" },
                { label: "Avg engagement", align: "right" },
                { label: "Avg views", align: "right" },
                { label: "Content analyzed", align: "right" },
                { label: "Source", align: "left" },
                { label: "Updated", align: "right" },
              ].map((col) => (
                <th
                  key={col.label}
                  className={`px-4 py-3 font-medium text-muted-foreground text-xs whitespace-nowrap text-${col.align}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {slices.map((slice) => {
              const isFacebook = slice.platform === "facebook_page";
              const noData = (
                <span className="text-muted-foreground text-xs">No data</span>
              );
              return (
                <tr
                  key={slice.platform}
                  className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 transition-colors"
                >
                  {/* Platform */}
                  <td className="px-4 py-3 font-medium whitespace-nowrap">
                    {slice.displayName}
                  </td>
                  {/* Followers */}
                  <td className="px-4 py-3 text-right tabular-nums">
                    {fmtMetric(slice.followers)}
                  </td>
                  {/* Avg engagement */}
                  <td className="px-4 py-3 text-right tabular-nums">
                    {isFacebook ? noData : fmtPercent(slice.avgEngagementRate)}
                  </td>
                  {/* Avg views */}
                  <td className="px-4 py-3 text-right tabular-nums">
                    {isFacebook ? noData : fmtMetric(slice.avgViews)}
                  </td>
                  {/* Synced posts */}
                  <td className="px-4 py-3 text-right tabular-nums">
                    {isFacebook ? (
                      <span className="text-muted-foreground text-xs">—</span>
                    ) : (
                      slice.syncedPostCount.toString()
                    )}
                  </td>
                  {/* Source */}
                  <td className="px-4 py-3">
                    {slice.sourceBadge ? (
                      <PlatformSourceBadge
                        type={slice.sourceBadge.type}
                        label={slice.sourceBadge.label}
                      />
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  {/* Updated */}
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                    {fmtDate(slice.statsUpdatedAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
