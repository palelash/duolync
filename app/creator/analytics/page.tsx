"use client";

import { useState, useEffect, useTransition } from "react";
import { useAuth } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import MainLayout from "@/components/layout/MainLayout";
import { getCreatorAnalyticsAction, type CreatorAnalytics } from "@/app/actions/analytics";
import {
  BarChart3, TrendingUp, Users, Eye, Zap, Clock, Star,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { cn } from "@/lib/utils";

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
        ))}
      </div>
      <div className="h-64 rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="h-28 rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-28 rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
      </div>
    </div>
  );
}

function AnalyticsContent({ userId }: { userId: string }) {
  const [data, setData] = useState<CreatorAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const result = await getCreatorAnalyticsAction(userId);
      if (result.error) setError(result.error);
      else setData(result.data);
    });
  }, [userId]);

  if (isPending) return <AnalyticsSkeleton />;

  if (error) {
    return (
      <div className="flex flex-col items-center py-20 text-center">
        <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
          <BarChart3 className="w-7 h-7 text-red-500" />
        </div>
        <p className="font-semibold mb-1">Could not load analytics</p>
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const noData =
    (data.totalFollowers ?? 0) <= 1 &&
    (data.avgEngagementRate ?? 0) === 0 &&
    data.engagementTrend.every((p) => p.rate === 0);

  const statCards = [
    {
      label: "Total Followers",
      value: data.totalFollowers != null
        ? (data.totalFollowers >= 1000
            ? `${(data.totalFollowers / 1000).toFixed(1)}K`
            : data.totalFollowers.toString())
        : "—",
      icon: Users,
      color: "text-violet-600 dark:text-violet-400",
      bg: "bg-violet-100 dark:bg-violet-900/30",
    },
    {
      label: "Avg Engagement",
      value: data.avgEngagementRate != null ? `${data.avgEngagementRate.toFixed(1)}%` : "—",
      icon: TrendingUp,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-100 dark:bg-emerald-900/30",
    },
    {
      label: "Avg Views / Post",
      value: data.avgViewsPerPost != null
        ? (data.avgViewsPerPost >= 1000
            ? `${(data.avgViewsPerPost / 1000).toFixed(1)}K`
            : data.avgViewsPerPost.toString())
        : "—",
      icon: Eye,
      color: "text-cyan-600 dark:text-cyan-400",
      bg: "bg-cyan-100 dark:bg-cyan-900/30",
    },
    {
      label: "Peak Hour",
      value: data.peakHour !== null
        ? new Date(2000, 0, 1, data.peakHour).toLocaleTimeString("en-US", {
            hour: "numeric",
            hour12: true,
          })
        : "—",
      icon: Clock,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-100 dark:bg-amber-900/30",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <div
            key={s.label}
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex flex-col gap-3"
          >
            <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", s.bg)}>
              <s.icon className={cn("w-5 h-5", s.color)} />
            </div>
            <div>
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Engagement trend chart */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
        <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          Engagement Trend (last 3 months)
        </h2>
        {noData ? (
          <div className="flex flex-col items-center py-10 text-center">
            <BarChart3 className="w-8 h-8 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">
              No post data yet. Connect your social accounts to start tracking.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data.engagementTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,116,139,0.1)" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 12, fill: "currentColor" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: "currentColor" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                formatter={(v: number) => [`${v.toFixed(2)}%`, "Engagement Rate"]}
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid rgba(100,116,139,0.2)",
                  background: "var(--bg-card)",
                  color: "currentColor",
                }}
              />
              <Line
                type="monotone"
                dataKey="rate"
                stroke="hsl(var(--primary))"
                strokeWidth={2.5}
                dot={{ r: 4, strokeWidth: 2 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Best platform + peak insights */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
            <Star className="w-5 h-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Best Platform</p>
            {data.bestPlatform ? (
              <>
                <p className="font-semibold capitalize">{data.bestPlatform.name}</p>
                <p className="text-xs text-muted-foreground">{data.bestPlatform.label}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No data yet</p>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Best Time to Post</p>
            {data.peakHour !== null ? (
              <>
                <p className="font-semibold">
                  {new Date(2000, 0, 1, data.peakHour).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  })}
                </p>
                <p className="text-xs text-muted-foreground">Based on your post history</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Post more to unlock this insight</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AnalyticsPage() {
  const { user } = useAuth();

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-primary" />
            Analytics
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track your engagement, reach, and audience insights.
          </p>
        </div>

        {user ? (
          <AnalyticsContent userId={user.id} />
        ) : (
          <AnalyticsSkeleton />
        )}
      </div>
    </MainLayout>
  );
}

export default function Page() {
  return (
    <ProtectedRoute requiredType="creator">
      <AnalyticsPage />
    </ProtectedRoute>
  );
}
