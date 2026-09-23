"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Users, Eye, TrendingUp, ArrowRight, LayoutDashboard,
  Wifi, Zap,
} from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { SmartCalendarWidget } from "@/components/calendar/SmartCalendarWidget";
import { OnboardingChecklist } from "@/app/_components/dashboard/OnboardingChecklist";
import { KpiCardsSkeleton, SocialConnectionsSkeleton } from "@/app/_components/dashboard/DashboardSkeletons";
import { AIGrowthMentor } from "@/app/_components/dashboard/AIGrowthMentor";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

const VIOLET = "var(--accent-violet-text)";
const VIOLET_T = "var(--accent-violet-text)";
const CYAN = "var(--accent-cyan-text)";
const CYAN_T = "var(--accent-cyan-text)";

const PLATFORM_META: Record<string, { emoji: string; color: string }> = {
  instagram: { emoji: "📷", color: "var(--brand-instagram-text)" },
  tiktok:    { emoji: "📱", color: "#ffffff" },
  youtube:   { emoji: "▶️", color: "var(--brand-youtube-text)" },
  twitter:   { emoji: "🐦", color: "#1da1f2" },
  twitch:    { emoji: "🎮", color: "#9146ff" },
  linkedin:  { emoji: "💼", color: "#0a66c2" },
};

const fmt = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
};

const CreatorDashboard = () => {
  const { profile, fullProfile, loading: profileLoading } = useAuth();
  const [stats] = useState({ totalViews: 0, savedBy: 0 });

  const firstName = profile?.full_name?.split(" ")[0] || "Creator";

  const connectedPlatforms = fullProfile?.connectedPlatforms ?? [];
  const followerCount = fullProfile?.followerCount ?? profile?.total_followers ?? 0;
  const engagementRate = fullProfile?.averageEngagement ?? profile?.avg_engagement_rate ?? 0;
  const hasConnections = connectedPlatforms.length > 0 || followerCount > 0;

  return (
    <MainLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Command Center header */}
        <div className="mb-8">
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-4"
            style={{
              background: "color-mix(in srgb, var(--accent-violet-text) 12%, transparent)",
              border: "1px solid color-mix(in srgb, var(--accent-violet-text) 35%, transparent)",
              color: VIOLET_T,
            }}
          >
            <LayoutDashboard size={11} />
            Command Center
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-bold mb-2">
            Welcome back, {firstName}!{" "}
            <span
              style={{
                background: `linear-gradient(90deg, ${VIOLET}, ${CYAN})`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              One command center.
            </span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl">
            Plan, schedule, and track your brand campaigns across every platform — all in one place.
          </p>
        </div>

        {/* Onboarding checklist — hidden once all steps are done or dismissed */}
        {profile?.id && (
          <OnboardingChecklist
            userId={profile.id}
            hasConnectedPlatform={hasConnections}
          />
        )}

        {/* KPI cards */}
        {profileLoading ? (
          <KpiCardsSkeleton />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="relative overflow-hidden rounded-3xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl p-5 flex flex-col gap-2 transition-all hover:border-white/[0.10] hover:bg-white/[0.05]">
              <Users className="w-5 h-5 text-violet-400 mb-1" strokeWidth={1.5} />
              <div className="text-2xl font-display font-bold text-zinc-100">{fmt(followerCount)}</div>
              <div className="text-xs text-zinc-500">Total Followers</div>
            </div>
            <div className="relative overflow-hidden rounded-3xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl p-5 flex flex-col gap-2 transition-all hover:border-white/[0.10] hover:bg-white/[0.05]">
              <Eye className="w-5 h-5 text-cyan-400 mb-1" strokeWidth={1.5} />
              <div className="text-2xl font-display font-bold text-zinc-100">{fmt(stats.totalViews)}</div>
              <div className="text-xs text-zinc-500">Total Views</div>
            </div>
            <div className="relative overflow-hidden rounded-3xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl p-5 flex flex-col gap-2 transition-all hover:border-white/[0.10] hover:bg-white/[0.05]">
              <TrendingUp className="w-5 h-5 text-emerald-400 mb-1" strokeWidth={1.5} />
              <div className="text-2xl font-display font-bold text-zinc-100">{engagementRate}%</div>
              <div className="text-xs text-zinc-500">Engagement Rate</div>
            </div>
            <div className="relative overflow-hidden rounded-3xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl p-5 flex flex-col gap-2 transition-all hover:border-white/[0.10] hover:bg-white/[0.05]">
              <Wifi className="w-5 h-5 text-violet-400 mb-1" strokeWidth={1.5} />
              <div className="text-2xl font-display font-bold text-zinc-100">{connectedPlatforms.length}</div>
              <div className="text-xs text-zinc-500">Connected Platforms</div>
            </div>
          </div>
        )}

        {/* Smart Calendar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl font-bold text-zinc-100">Smart Content Calendar</h2>
            <Link
              href="/creator/campaigns"
              className="text-sm text-violet-400 hover:text-violet-300 flex items-center gap-1 transition-colors"
            >
              View campaigns <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
            </Link>
          </div>
          <SmartCalendarWidget />
        </div>

        {/* Social Connections section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Wifi className="w-5 h-5 text-violet-400" strokeWidth={1.5} />
              <h2 className="font-display text-xl font-bold text-zinc-100">Social Connections</h2>
            </div>
            <Link
              href="/creator/presence"
              className="text-sm text-violet-400 hover:text-violet-300 flex items-center gap-1 transition-colors"
            >
              Manage <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
            </Link>
          </div>

          {hasConnections ? (
            <div className="rounded-3xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] p-6">
              <div className="flex items-start justify-between gap-6 flex-wrap">
                {/* Aggregated stats */}
                <div className="flex items-center gap-8">
                  <div>
                    <p className="text-3xl font-display font-bold text-zinc-100">{fmt(followerCount)}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">Total Followers</p>
                  </div>
                  {engagementRate > 0 && (
                    <div>
                      <p className="text-3xl font-display font-bold text-emerald-400">{engagementRate}%</p>
                      <p className="text-xs text-zinc-500 mt-0.5">Avg. Engagement</p>
                    </div>
                  )}
                </div>

                {/* Per-platform rows */}
                <div className="flex flex-col gap-2 min-w-[180px]">
                  {connectedPlatforms.map((p) => {
                    const meta = PLATFORM_META[p] ?? { emoji: "📱", color: "#888" };
                    const stat = fullProfile?.platformStats?.find((s) => s.platform === p);
                    return (
                      <div
                        key={p}
                        className="flex items-center justify-between gap-4 px-3 py-2 rounded-2xl bg-white/[0.04] border border-white/[0.07]"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-base">{meta.emoji}</span>
                          <span className="text-xs font-medium text-zinc-300 capitalize">{p}</span>
                        </div>
                        <span className="text-xs font-semibold text-zinc-200 tabular-nums">
                          {stat?.followerCount != null ? fmt(stat.followerCount) : "—"} followers
                        </span>
                      </div>
                    );
                  })}
                  <Link href="/creator/presence">
                    <div className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-violet-500/10 border border-violet-500/15 text-xs font-medium text-violet-400 hover:bg-violet-500/20 transition-colors cursor-pointer">
                      + Add Platform
                    </div>
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            /* Not connected CTA */
            <div className="rounded-3xl border border-dashed border-white/[0.08] p-8 flex flex-col sm:flex-row items-center gap-6 bg-white/[0.02]">
              <div className="w-14 h-14 rounded-3xl bg-violet-500/10 border border-violet-500/15 flex items-center justify-center shrink-0">
                <Wifi className="w-7 h-7 text-violet-400" strokeWidth={1.5} />
              </div>
              <div className="flex-1 text-center sm:text-left">
                <h3 className="font-display font-bold text-lg mb-1 text-zinc-100">Connect your social accounts</h3>
                <p className="text-sm text-zinc-500 max-w-md">
                  Link Instagram, TikTok, YouTube and more to showcase your reach to brands and unlock analytics.
                </p>
              </div>
              <Link href="/creator/presence">
                <Button className="gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white border-0 shrink-0 rounded-xl shadow-lg shadow-violet-500/20">
                  <Zap className="w-4 h-4" strokeWidth={1.5} /> Connect Now
                </Button>
              </Link>
            </div>
          )}
        </div>
        {/* AI Growth Mentor */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="font-display text-xl font-bold text-zinc-100">AI Growth Mentor</h2>
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold tracking-wide"
              style={{ background: "rgba(192,132,252,0.12)", color: "#c084fc", border: "1px solid rgba(192,132,252,0.20)" }}
            >
              AI
            </span>
          </div>
          <AIGrowthMentor
            followerCount={followerCount}
            engagementRate={engagementRate}
            niche={fullProfile?.niche ?? profile?.niche ?? null}
            platforms={connectedPlatforms}
          />
        </div>
      </div>
    </MainLayout>
  );
};

export default CreatorDashboard;
