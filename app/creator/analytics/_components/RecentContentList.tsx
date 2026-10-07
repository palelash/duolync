"use client";

import { Eye, Heart, MessageCircle, ExternalLink } from "lucide-react";
import type { RecentPostV2 } from "@/lib/analytics-v2";
import { fmtMetric, fmtPercent, fmtDate, PLATFORM_DISPLAY_NAMES } from "@/lib/analytics-v2";
import { PlatformSourceBadge } from "./PlatformSourceBadge";

interface RecentContentListProps {
  posts: RecentPostV2[];
  maxItems?: number;
  /** Whether to show the platform label (useful for cross-platform lists) */
  showPlatform?: boolean;
}

/**
 * Compact list of recent posts with metrics.
 *
 * Clearly shows: platform, source badge, caption, publish date,
 * views / likes / comments, post-level ER where eligible.
 *
 * No cross-platform score is calculated.
 */
export function RecentContentList({
  posts,
  maxItems = 10,
  showPlatform = true,
}: RecentContentListProps) {
  const visible = posts.slice(0, maxItems);

  if (visible.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No recent content available
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {visible.map((post) => (
        <div
          key={post.id}
          className="flex items-start gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100/80 dark:hover:bg-zinc-800 transition-colors"
        >
          {/* Thumbnail */}
          {post.imageUrl && (
            <img
              src={post.imageUrl}
              alt=""
              className="w-12 h-12 rounded-lg object-cover shrink-0 bg-zinc-200 dark:bg-zinc-700"
            />
          )}

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Top row: platform + badge + date */}
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              {showPlatform && (
                <span className="text-xs font-medium">
                  {PLATFORM_DISPLAY_NAMES[post.platform] ?? post.platform}
                </span>
              )}
              <PlatformSourceBadge
                type={post.sourceBadge.type}
                label={post.sourceBadge.label}
              />
              <span className="text-xs text-muted-foreground ml-auto shrink-0">
                {fmtDate(post.postedAt)}
              </span>
            </div>

            {/* Caption */}
            {post.caption && (
              <p className="text-xs text-muted-foreground truncate mb-1.5">
                {post.caption}
              </p>
            )}

            {/* Metrics row */}
            <div className="flex items-center gap-3 flex-wrap">
              {post.views !== null && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Eye className="w-3 h-3" />
                  {fmtMetric(post.views)}
                </span>
              )}
              {post.likes !== null && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Heart className="w-3 h-3" />
                  {fmtMetric(post.likes)}
                </span>
              )}
              {post.comments !== null && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MessageCircle className="w-3 h-3" />
                  {fmtMetric(post.comments)}
                </span>
              )}
              {post.engagementRate !== null && (
                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  {fmtPercent(post.engagementRate)} ER
                </span>
              )}
              {post.postUrl && (
                <a
                  href={post.postUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto text-muted-foreground hover:text-primary transition-colors"
                  title="View post"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
