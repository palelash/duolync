"use client";

import { cn } from "@/lib/utils";

interface AnalyticsKpiCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  iconBg?: string;
}

export function AnalyticsKpiCard({
  label,
  value,
  sub,
  icon,
  iconBg,
}: AnalyticsKpiCardProps) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex flex-col gap-2.5">
      <div
        className={cn(
          "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
          iconBg ?? "bg-zinc-100 dark:bg-zinc-800",
        )}
      >
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold tabular-nums leading-none">{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{label}</p>
        {sub && (
          <p className="text-xs text-muted-foreground/70 mt-0.5">{sub}</p>
        )}
      </div>
    </div>
  );
}
