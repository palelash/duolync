"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { RecentPostV2 } from "@/lib/analytics-v2";
import { fmtMetric } from "@/lib/analytics-v2";
import { BarChart3 } from "lucide-react";

interface ChartSeries {
  key: "views" | "likes" | "comments";
  label: string;
  color: string;
}

interface RecentPerformanceChartProps {
  posts: RecentPostV2[];
  series: ChartSeries[];
  /** Defaults to "Recent content performance" */
  title?: string;
}

/**
 * Bar chart for recent post performance ordered by publish date.
 *
 * Only plots posts with a non-null postedAt.
 * Displayed oldest-first (left → right) so the time axis reads naturally.
 *
 * Title is intentionally "Recent content performance" — NEVER "Growth".
 */
export function RecentPerformanceChart({
  posts,
  series,
  title = "Recent content performance",
}: RecentPerformanceChartProps) {
  const datedPosts = posts.filter((p) => p.postedAt !== null);

  if (datedPosts.length < 2) {
    return (
      <div className="flex flex-col items-center py-8 text-center gap-2">
        <BarChart3 className="w-8 h-8 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">
          {datedPosts.length === 0
            ? "No dated posts to chart"
            : "More posts needed to show chart"}
        </p>
      </div>
    );
  }

  // Oldest first for natural time-axis reading
  const chartData = [...datedPosts].reverse().map((p) => ({
    name: new Date(p.postedAt!).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    views: p.views,
    likes: p.likes,
    comments: p.comments,
  }));

  return (
    <div>
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      <ResponsiveContainer width="100%" height={210}>
        <BarChart
          data={chartData}
          margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(100,116,139,0.1)"
            vertical={false}
          />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: "currentColor" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "currentColor" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => fmtMetric(v as number)}
            width={44}
          />
          <Tooltip
            cursor={{ fill: "rgba(100,116,139,0.05)" }}
            formatter={(v, name: string) => [
              typeof v === "number" ? fmtMetric(v) : "—",
              name,
            ]}
            contentStyle={{
              borderRadius: "8px",
              border: "1px solid rgba(100,116,139,0.2)",
              fontSize: "12px",
              background: "var(--popover, white)",
            }}
          />
          <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: "12px" }} />
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={s.color}
              radius={[2, 2, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
