"use client";

import { useState, useEffect, useTransition } from "react";
import { BarChart3 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import MainLayout from "@/components/layout/MainLayout";
import { getCreatorAnalyticsV2Action } from "@/app/actions/analytics";
import type { CreatorAnalyticsV2 } from "@/lib/analytics-v2";
import { AnalyticsTabs } from "./_components/AnalyticsTabs";

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-24 rounded-2xl bg-zinc-200 dark:bg-zinc-800"
          />
        ))}
      </div>
      <div className="h-10 w-72 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-48 rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-64 rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function AnalyticsEmptyState() {
  return (
    <div className="flex flex-col items-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
        <BarChart3 className="w-8 h-8 text-muted-foreground/50" />
      </div>
      <h2 className="font-semibold text-lg mb-2">No analytics data yet</h2>
      <p className="text-sm text-muted-foreground max-w-xs">
        Connect a social account to start seeing analytics.
      </p>
    </div>
  );
}

// ─── Error state ──────────────────────────────────────────────────────────────

function AnalyticsErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center py-20 text-center">
      <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
        <BarChart3 className="w-7 h-7 text-red-500" />
      </div>
      <p className="font-semibold mb-1">Could not load analytics</p>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

// ─── Main content ─────────────────────────────────────────────────────────────

function AnalyticsV2Content() {
  const [data, setData] = useState<CreatorAnalyticsV2 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const result = await getCreatorAnalyticsV2Action();
      if (result.error) {
        setError(result.error);
      } else {
        setData(result.data);
      }
    });
  }, []);

  if (isPending) return <AnalyticsSkeleton />;
  if (error) return <AnalyticsErrorState message={error} />;
  if (!data) return <AnalyticsSkeleton />;

  // Empty state: no slices with any usable data
  if (data.slices.length === 0) {
    return <AnalyticsEmptyState />;
  }

  return <AnalyticsTabs analytics={data} />;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

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
            Per-platform performance from your available social data.
          </p>
        </div>

        {user ? <AnalyticsV2Content /> : <AnalyticsSkeleton />}
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
