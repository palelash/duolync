"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  TrendingUp, Users, Eye, Zap, Clock, BarChart3,
  RefreshCw, Wifi, Star,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from "recharts";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { RichEmptyState } from "@/app/_components/shared/RichEmptyState";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  getMyAnalyticsAction,
  type CreatorAnalytics,
} from "@/app/actions/analytics";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

// ── Constants ─────────────────────────────────────────────────────────────────

const PLATFORM_EMOJIS: Record<string, string> = {
  tiktok: "🎵",
  instagram: "📸",
  youtube: "▶️",
  twitter: "🐦",
  twitch: "🎮",
  linkedin: "💼",
  pinterest: "📌",
  snapchat: "👻",
};

const PLATFORM_LABELS: Record<string, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
  twitter: "X / Twitter",
  twitch: "Twitch",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
  snapchat: "Snapchat",
};

const chartConfig = {
  rate: { label: "Engagement %", color: "hsl(var(--primary))" },
} satisfies ChartConfig;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatHour(h: number): string {
  const period = h < 12 ? "AM" : "PM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:00 ${period}`;
}

function engColor(rate: number): string {
  if (rate >= 6) return "text-emerald-600 dark:text-emerald-400";
  if (rate >= 3) return "text-sky-600 dark:text-sky-400";
  return "text-amber-600 dark:text-amber-400";
}

function engLabel(rate: number): string {
  if (rate >= 6) return "Excellent";
  if (rate >= 3) return "Good";
  if (rate >= 1) return "Average";
  return "Low";
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-white dark:bg-zinc-900/50 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 animate-pulse"
          >
            <div className="h-3 w-20 bg-zinc-200 dark:bg-zinc-700 rounded mb-3" />
            <div className="h-7 w-16 bg-zinc-200 dark:bg-zinc-700 rounded mb-1" />
            <div className="h-2.5 w-12 bg-zinc-100 dark:bg-zinc-800 rounded" />
          </div>
        ))}
      </div>
      <div className="bg-white dark:bg-zinc-900/50 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 animate-pulse">
        <div className="h-4 w-40 bg-zinc-200 dark:bg-zinc-700 rounded mb-2" />
        <div className="h-3 w-64 bg-zinc-100 dark:bg-zinc-800 rounded mb-6" />
        <div className="h-52 bg-zinc-100 dark:bg-zinc-800 rounded-xl" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="bg-white dark:bg-zinc-900/50 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 animate-pulse space-y-3"
          >
            <div className="h-3 w-28 bg-zinc-200 dark:bg-zinc-700 rounded" />
            <div className="h-8 w-32 bg-zinc-200 dark:bg-zinc-700 rounded" />
            <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  accentClass,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  accentClass?: string;
}) {
  return (
    <div className="bg-white dark:bg-zinc-900/50 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Icon className={cn("w-4 h-4 shrink-0", accentClass ?? "text-muted-foreground")} />
        <p className="text-xs text-muted-foreground font-medium truncate">{label}</p>
      </div>
      <p className={cn("text-2xl font-bold leading-none mb-1", accentClass ?? "text-foreground")}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ── Platform card ─────────────────────────────────────────────────────────────

function PlatformCard({
  platform,
  followerCount,
  engagementRate,
  totalFollowers,
  dataSource,
}: {
  platform: string;
  followerCount: number | null;
  engagementRate: number | null;
  totalFollowers: number;
  dataSource?: string | null;
}) {
  const key = platform.toLowerCase();
  const emoji = PLATFORM_EMOJIS[key] ?? "🌐";
  const label = PLATFORM_LABELS[key] ?? platform;
  const followers = followerCount ?? 0;
  const eng = engagementRate ?? 0;
  const share = totalFollowers > 0 ? Math.min((followers / totalFollowers) * 100, 100) : 0;

  return (
    <div className="bg-white dark:bg-zinc-900/50 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-2xl leading-none">{emoji}</span>
        <div className="min-w-0">
          <p className="font-semibold text-sm capitalize">{label}</p>
          {(dataSource === "APIFY" || dataSource === "RAPIDAPI") && (
            <p className="text-[10px] font-medium text-sky-600 dark:text-sky-400">Public data</p>
          )}
          {eng > 0 && (
            <p className={cn("text-xs font-medium", engColor(eng))}>
              {eng.toFixed(2)}% — {engLabel(eng)}
            </p>
          )}
        </div>
        {eng >= 6 && (
          <span title="Top performer" className="ml-auto shrink-0"><Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" /></span>
        )}
      </div>

      <p className="text-3xl font-bold mb-1">{followers > 0 ? formatNum(followers) : "—"}</p>
      <p className="text-xs text-muted-foreground mb-3">followers</p>

      {totalFollowers > 0 && followers > 0 && (
        <div>
          <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
            <span>Share of total audience</span>
            <span>{share.toFixed(0)}%</span>
          </div>
          <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-500 transition-all duration-700"
              style={{ width: `${share}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Engagement trend chart ────────────────────────────────────────────────────

function EngagementChart({
  trend,
}: {
  trend: { month: string; rate: number }[];
}) {
  const hasData = trend.some((d) => d.rate > 0);

  return (
    <div className="bg-white dark:bg-zinc-900/50 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-display font-bold text-base">Engagement Trend</h2>
        <span className="text-xs text-muted-foreground bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
          Last 3 months
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-5">
        Average engagement rate across all your posts per month
      </p>

      {hasData ? (
        <ChartContainer config={chartConfig} className="h-52 w-full">
          <AreaChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
            <defs>
              <linearGradient id="engGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border)"
              vertical={false}
            />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `${v}%`}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => [`${value}%`, "Engagement"]}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="rate"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fill="url(#engGrad)"
              dot={{ fill: "hsl(var(--primary))", r: 4, strokeWidth: 0 }}
              activeDot={{ r: 6, stroke: "hsl(var(--primary))", strokeWidth: 2, fill: "white" }}
            />
          </AreaChart>
        </ChartContainer>
      ) : (
        <div className="h-52 flex flex-col items-center justify-center gap-2 border border-dashed border-zinc-200 dark:border-zinc-700 rounded-xl">
          <BarChart3 className="w-8 h-8 text-zinc-300 dark:text-zinc-600" />
          <p className="text-sm text-muted-foreground">No post data yet for this period</p>
          <Link href="/creator/presence">
            <Button size="sm" variant="outline" className="text-xs mt-1">
              Sync your accounts
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

const CreatorAnalytics = () => {
  const { fullProfile: profile } = useAuth();
  const [analytics, setAnalytics] = useState<CreatorAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const analyticsRes = await getMyAnalyticsAction();
      if (!analyticsRes.error) setAnalytics(analyticsRes.data);
      setLoading(false);
    }
    load();
  }, []);

  const totalFollowers = analytics?.totalFollowers ?? 0;
  const platformStats = profile?.platformStats ?? [];
  // Show analytics whenever public or official stats exist. OAuth is not required.
  const hasData = platformStats.length > 0 || (profile?.followerCount ?? 0) > 0 || totalFollowers > 0;

  const lastSynced = profile?.lastSyncedAt
    ? new Date(profile.lastSyncedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold flex items-center gap-3 mb-1">
              <BarChart3 className="w-7 h-7 text-primary" />
              Analytics
            </h1>
            <p className="text-muted-foreground text-sm">
              Performance overview from your platform stats
            </p>
          </div>
          {lastSynced && (
            <div className="flex items-center gap-1.5 shrink-0 mt-1 text-xs text-muted-foreground bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-700">
              <RefreshCw className="w-3 h-3" />
              Synced {lastSynced}
            </div>
          )}
        </div>

        {loading ? (
          <AnalyticsSkeleton />
        ) : !hasData ? (
          <RichEmptyState
            icon={<BarChart3 className="w-8 h-8 text-violet-500" />}
            headline="No data yet"
            sub="Connect an account or refresh public profile data to unlock followers, engagement trends, and posting insights."
            primary={{ label: "Connect Accounts", href: "/creator/presence" }}
            secondary={{ label: "Learn more", href: "/creator/dashboard" }}
            tips={[
              { icon: "📸", label: "Instagram" },
              { icon: "🎵", label: "TikTok" },
              { icon: "▶️", label: "YouTube" },
              { icon: "🐦", label: "X / Twitter" },
            ]}
          />
        ) : (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                icon={Users}
                label="Total Followers"
                value={formatNum(totalFollowers)}
                sub={`across ${platformStats.length} platform${platformStats.length === 1 ? "" : "s"}`}
                accentClass="text-violet-600 dark:text-violet-400"
              />
              <KpiCard
                icon={TrendingUp}
                label="Avg Engagement"
                value={analytics ? `${analytics.avgEngagementRate.toFixed(2)}%` : "—"}
                sub={analytics ? engLabel(analytics.avgEngagementRate) : undefined}
                accentClass={analytics ? engColor(analytics.avgEngagementRate) : undefined}
              />
              <KpiCard
                icon={Eye}
                label="Avg Reach / Post"
                value={analytics?.avgReach ? formatNum(analytics.avgReach) : "—"}
                sub="views per post"
                accentClass="text-sky-600 dark:text-sky-400"
              />
              <KpiCard
                icon={Zap}
                label="Best Platform"
                value={
                  analytics?.bestPlatform
                    ? (PLATFORM_EMOJIS[analytics.bestPlatform.name] ?? "🌐") +
                      " " +
                      (PLATFORM_LABELS[analytics.bestPlatform.name] ?? analytics.bestPlatform.name)
                    : "—"
                }
                sub={analytics?.bestPlatform?.label.split("—")[1]?.trim()}
                accentClass="text-amber-600 dark:text-amber-400"
              />
            </div>

            {/* Engagement trend chart */}
            {analytics && (
              <EngagementChart trend={analytics.engagementTrend} />
            )}

            {/* Platform breakdown */}
            {platformStats.length > 0 && (
              <div>
                <h2 className="font-display font-bold mb-4">Platform Breakdown</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {platformStats.map((s) => (
                    <PlatformCard
                      key={s.platform}
                      platform={s.platform}
                      followerCount={s.followerCount}
                      engagementRate={s.engagementRate}
                      totalFollowers={totalFollowers}
                      dataSource={s.dataSource}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Insights row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Peak hour */}
              <div className="bg-white dark:bg-zinc-900/50 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-sky-500" />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Peak Posting Time
                  </p>
                </div>
                {analytics?.peakHour != null ? (
                  <>
                    <p className="text-3xl font-bold mb-1">{formatHour(analytics.peakHour)}</p>
                    <p className="text-xs text-muted-foreground">
                      Most of your content was posted around this hour. Schedule future posts here for maximum early engagement.
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Not enough post data to determine a peak hour yet.
                  </p>
                )}
              </div>

              {/* Quick stats */}
              <div className="bg-white dark:bg-zinc-900/50 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <Wifi className="w-4 h-4 text-emerald-500" />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Platforms with data
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {platformStats.map((s) => (
                    <span
                      key={s.platform}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300"
                    >
                      {PLATFORM_EMOJIS[s.platform.toLowerCase()] ?? "🌐"}
                      {PLATFORM_LABELS[s.platform.toLowerCase()] ?? s.platform}
                    </span>
                  ))}
                </div>
                <Link href="/creator/presence" className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-4">
                  Manage accounts →
                </Link>
              </div>
            </div>

            {/* Tips callout */}
            <div className="rounded-2xl border border-violet-200/60 dark:border-violet-500/20 bg-violet-50 dark:bg-violet-500/5 p-5">
              <div className="flex items-start gap-3">
                <Star className="w-4 h-4 text-violet-600 dark:text-violet-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-violet-800 dark:text-violet-300 mb-1">
                    Boost your analytics accuracy
                  </p>
                  <p className="text-xs text-violet-700 dark:text-violet-400 leading-relaxed">
                    Sync your accounts regularly to keep engagement data fresh. Brands view your analytics when reviewing proposals — a high engagement rate dramatically increases your acceptance rate.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </MainLayout>
  );
};

export default CreatorAnalytics;
