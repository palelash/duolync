"use client";

import { useState } from "react";
import {
  Sparkles, TrendingUp, Clock, Target, Zap, ChevronRight,
  Loader2, RotateCcw, Lightbulb,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getCreatorGrowthTipsAction,
  type GrowthTipsResult,
  type GrowthTip,
} from "@/app/actions/ai";

interface Props {
  followerCount: number;
  engagementRate: number;
  niche: string | null;
  platforms: string[];
}

const CATEGORY_META: Record<GrowthTip["category"], { label: string; color: string; bg: string }> = {
  content:     { label: "Content",     color: "#c084fc", bg: "rgba(192,132,252,0.10)" },
  engagement:  { label: "Engagement",  color: "#67e8f9", bg: "rgba(103,232,249,0.10)" },
  growth:      { label: "Growth",      color: "#34d399", bg: "rgba(52,211,153,0.10)" },
  monetization:{ label: "Monetize",    color: "#fcd34d", bg: "rgba(252,211,77,0.10)" },
};

const PRIORITY_DOT: Record<GrowthTip["priority"], string> = {
  high:   "#34d399",
  medium: "#fcd34d",
  low:    "#94a3b8",
};

export function AIGrowthMentor({ followerCount, engagementRate, niche, platforms }: Props) {
  const [result, setResult] = useState<GrowthTipsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"tips" | "schedule">("tips");

  async function analyze() {
    setLoading(true);
    setError(null);
    const { data, error: err } = await getCreatorGrowthTipsAction({
      followerCount,
      engagementRate,
      niche,
      platforms,
    });
    setLoading(false);
    if (err) { setError(err); return; }
    setResult(data);
    setTab("tips");
  }

  return (
    <div
      className="rounded-3xl overflow-hidden border border-white/[0.07] bg-white/[0.03] backdrop-blur-xl"
    >
      {/* Header */}
      <div
        className="px-5 py-4 flex items-center justify-between border-b border-white/[0.06]"
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: "rgba(192,132,252,0.12)", border: "1px solid rgba(192,132,252,0.20)" }}
          >
            <Sparkles className="w-4 h-4" style={{ color: "#c084fc" }} strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-zinc-100">AI Growth Mentor</h3>
            <p className="text-xs text-zinc-500">Personalized weekly strategy</p>
          </div>
        </div>

        {result && (
          <button
            onClick={analyze}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />
            Refresh
          </button>
        )}
      </div>

      {/* Body */}
      <div className="p-5">
        {!result && !loading && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-zinc-400 leading-relaxed">
                Let the AI analyze your{" "}
                <span className="font-medium text-zinc-200">
                  {engagementRate > 0 ? `${engagementRate}% engagement rate` : "profile"}
                </span>{" "}
                {niche ? (
                  <>
                    in <span className="font-medium text-zinc-200">{niche}</span>{" "}
                  </>
                ) : null}
                and generate a personalized weekly growth plan.
              </p>
            </div>
            <Button
              onClick={analyze}
              size="sm"
              className="shrink-0 gap-2 font-semibold rounded-xl"
              style={{
                background: "linear-gradient(135deg, #7c3aed, #c084fc)",
                border: "none",
                color: "#fff",
                boxShadow: "0 4px 20px rgba(124,58,237,0.25)",
              }}
            >
              <Zap className="w-3.5 h-3.5" strokeWidth={1.5} />
              Analyze My Growth
            </Button>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center py-8 gap-3">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: "rgba(192,132,252,0.12)", border: "1px solid rgba(192,132,252,0.2)" }}
            >
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#c084fc" }} />
            </div>
            <p className="text-sm text-muted-foreground">Analyzing your creator profile…</p>
          </div>
        )}

        {error && (
          <div className="text-sm text-red-400 py-2">{error}</div>
        )}

        {result && !loading && (
          <>
            {/* Weekly goal */}
            <div
              className="rounded-xl px-4 py-3 mb-4 flex items-start gap-3"
              style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)" }}
            >
              <Target className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#34d399" }} />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: "#34d399" }}>
                  This Week&apos;s Goal
                </p>
                <p className="text-sm leading-snug">{result.weeklyGoal}</p>
              </div>
            </div>

            {/* Tab switcher */}
            <div
              className="flex rounded-xl p-0.5 mb-4 gap-0.5"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              {(["tips", "schedule"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg transition-all"
                  style={
                    tab === t
                      ? { background: "rgba(192,132,252,0.18)", color: "#c084fc" }
                      : { color: "var(--text-muted, #94a3b8)" }
                  }
                >
                  {t === "tips" ? <Lightbulb className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                  {t === "tips" ? "Growth Tips" : "Post Schedule"}
                </button>
              ))}
            </div>

            {/* Tips */}
            {tab === "tips" && (
              <div className="space-y-2.5">
                {result.weeklyTips.map((tip, i) => {
                  const meta = CATEGORY_META[tip.category];
                  return (
                    <div
                      key={i}
                      className="rounded-xl px-4 py-3 flex items-start gap-3"
                      style={{ background: meta.bg, border: `1px solid ${meta.color}25` }}
                    >
                      <div className="flex flex-col items-center gap-1.5 mt-0.5 shrink-0">
                        <span
                          className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                          style={{ background: `${meta.color}20`, color: meta.color }}
                        >
                          {meta.label}
                        </span>
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ background: PRIORITY_DOT[tip.priority] }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold mb-0.5">{tip.title}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">{tip.description}</p>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-1 opacity-40" />
                    </div>
                  );
                })}
              </div>
            )}

            {/* Posting schedule */}
            {tab === "schedule" && (
              <div className="space-y-2">
                {result.postingSchedule.map((slot, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-xl px-4 py-3"
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold"
                      style={{ background: "rgba(192,132,252,0.12)", color: "#c084fc" }}
                    >
                      <TrendingUp className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{slot.day}</span>
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                          style={{ background: "rgba(103,232,249,0.12)", color: "#67e8f9" }}
                        >
                          {slot.time}
                        </span>
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                          style={{ background: "rgba(192,132,252,0.10)", color: "#c084fc" }}
                        >
                          {slot.platform}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{slot.reason}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
