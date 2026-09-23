import { cn } from "@/lib/utils";

// ── Base pulse block ──────────────────────────────────────────────────────────

function Pulse({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800",
        className,
      )}
    />
  );
}

// ── KPI card skeleton ─────────────────────────────────────────────────────────

function KpiCardSkeleton() {
  return (
    <div className="rounded-3xl border border-white/[0.06] bg-white/[0.03] p-5 flex flex-col gap-2">
      {/* Icon placeholder */}
      <Pulse className="w-5 h-5 rounded-xl bg-zinc-800" />
      {/* Number */}
      <Pulse className="h-7 w-16 rounded-lg bg-zinc-800" />
      {/* Label */}
      <Pulse className="h-3 w-24 rounded-md bg-zinc-800/70" />
    </div>
  );
}

export function KpiCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      {Array.from({ length: 4 }).map((_, i) => (
        <KpiCardSkeleton key={i} />
      ))}
    </div>
  );
}

// ── Calendar skeleton ─────────────────────────────────────────────────────────

const DAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

export function CalendarSkeleton() {
  return (
    <div
      className={cn(
        "rounded-3xl overflow-hidden",
        "bg-white/80 dark:bg-zinc-950/80 backdrop-blur-sm",
        "border border-zinc-200/60 dark:border-white/[0.06]",
        "shadow-sm",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-white/[0.05]">
        <Pulse className="h-4 w-48 rounded-lg" />
        <div className="flex items-center gap-1.5">
          <Pulse className="h-7 w-7 rounded-xl" />
          <Pulse className="h-7 w-7 rounded-xl" />
        </div>
      </div>

      {/* Platform KPI strip */}
      <div className="grid grid-cols-3 divide-x divide-zinc-100 dark:divide-white/[0.04] border-b border-zinc-100 dark:border-white/[0.04]">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="p-3 flex flex-col items-center gap-1.5 bg-zinc-50 dark:bg-[#09090f]">
            <Pulse className="h-5 w-8 rounded-md" />
            <Pulse className="h-2.5 w-16 rounded-sm" />
            <Pulse className="h-2.5 w-12 rounded-sm" />
          </div>
        ))}
      </div>

      <div className="p-4 sm:p-5">
        {/* Day labels */}
        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {DAY_LABELS.map((d) => (
            <div
              key={d}
              className="text-[9px] sm:text-[10px] text-zinc-400 dark:text-zinc-600 text-center py-0.5 font-medium"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day cells — 5 rows × 7 cols with staggered opacity for depth */}
        <div className="grid grid-cols-7 gap-0.5 mb-6">
          {Array.from({ length: 35 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl bg-zinc-100 dark:bg-zinc-800/50 animate-pulse"
              style={{
                minHeight: 52,
                animationDelay: `${(i % 7) * 40}ms`,
                opacity: 0.4 + (i % 3) * 0.2,
              }}
            />
          ))}
        </div>

        {/* Upcoming posts skeleton */}
        <div className="border-t border-zinc-100 dark:border-white/[0.05] pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Pulse className="w-3 h-3 rounded-sm" />
            <Pulse className="h-3 w-28 rounded-md" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <Pulse className="w-8 h-8 shrink-0 rounded-xl" />
                <div className="flex-1 space-y-1.5">
                  <Pulse className="h-3 w-3/4 rounded-md" />
                  <Pulse className="h-2.5 w-1/2 rounded-sm" />
                </div>
                <Pulse className="h-4 w-14 rounded-full shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer stats */}
      <div className="grid grid-cols-3 border-t border-zinc-100 dark:border-white/[0.05] divide-x divide-zinc-100 dark:divide-white/[0.04]">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5 py-3 bg-zinc-50 dark:bg-[rgba(9,9,15,0.6)]">
            <Pulse className="w-3.5 h-3.5 rounded-sm" />
            <Pulse className="h-2.5 w-20 rounded-sm" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Social connections skeleton ───────────────────────────────────────────────

export function SocialConnectionsSkeleton() {
  return (
    <div className="rounded-3xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-xl p-6">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        {/* Aggregated stats */}
        <div className="flex items-center gap-8">
          <div className="space-y-1.5">
            <Pulse className="h-8 w-20 rounded-lg bg-zinc-800" />
            <Pulse className="h-3 w-24 rounded-md bg-zinc-800/70" />
          </div>
          <div className="space-y-1.5">
            <Pulse className="h-8 w-16 rounded-lg bg-zinc-800" />
            <Pulse className="h-3 w-20 rounded-md bg-zinc-800/70" />
          </div>
        </div>
        {/* Platform rows */}
        <div className="flex flex-col gap-2 min-w-[180px]">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-4 px-3 py-2 rounded-2xl bg-white/[0.04] border border-white/[0.06]"
            >
              <div className="flex items-center gap-2">
                <Pulse className="w-5 h-5 rounded-md bg-zinc-800" />
                <Pulse className="h-3 w-14 rounded-md bg-zinc-800" />
              </div>
              <Pulse className="h-3 w-20 rounded-md bg-zinc-800" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
