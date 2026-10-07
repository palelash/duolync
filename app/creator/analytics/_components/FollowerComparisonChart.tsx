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
  Cell,
} from "recharts";
import type { PlatformAnalyticsSlice } from "@/lib/analytics-v2";
import { fmtMetric, PLATFORM_DISPLAY_NAMES } from "@/lib/analytics-v2";

const PLATFORM_COLORS: Record<string, string> = {
  instagram: "#c026d3",
  tiktok: "#06b6d4",
  youtube: "#dc2626",
  facebook_page: "#2563eb",
};

interface FollowerComparisonChartProps {
  slices: PlatformAnalyticsSlice[];
}

export function FollowerComparisonChart({
  slices,
}: FollowerComparisonChartProps) {
  // Only include platforms where followerCount !== null
  const data = slices
    .filter((s) => s.followers !== null)
    .map((s) => ({
      name: PLATFORM_DISPLAY_NAMES[s.platform] ?? s.platform,
      followers: s.followers as number,
      platform: s.platform,
    }));

  if (data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart
        data={data}
        margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
        barSize={48}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="rgba(100,116,139,0.1)"
          vertical={false}
        />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 12, fill: "currentColor" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "currentColor" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => fmtMetric(v as number)}
          width={48}
        />
        <Tooltip
          cursor={{ fill: "rgba(100,116,139,0.05)" }}
          formatter={(v: number) => [fmtMetric(v), "Followers"]}
          contentStyle={{
            borderRadius: "8px",
            border: "1px solid rgba(100,116,139,0.2)",
            fontSize: "12px",
            background: "var(--popover, white)",
          }}
        />
        <Bar dataKey="followers" radius={[4, 4, 0, 0]}>
          {data.map((entry) => (
            <Cell
              key={entry.platform}
              fill={PLATFORM_COLORS[entry.platform] ?? "#6366f1"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
