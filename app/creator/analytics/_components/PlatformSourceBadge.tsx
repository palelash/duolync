"use client";

import { cn } from "@/lib/utils";
import type { SourceBadgeType } from "@/lib/analytics-v2";

interface PlatformSourceBadgeProps {
  type: SourceBadgeType;
  label: string;
  className?: string;
}

const BADGE_STYLES: Record<SourceBadgeType, string> = {
  official_connected:
    "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
  official_historical:
    "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  public_data:
    "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800",
  imported_data:
    "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800",
  unverified:
    "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700",
};

export function PlatformSourceBadge({
  type,
  label,
  className,
}: PlatformSourceBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        BADGE_STYLES[type],
        className,
      )}
    >
      {label}
    </span>
  );
}
