"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import {
  Sparkles, Search, Loader2, ArrowRight, Users,
  TrendingUp, Star, RotateCcw, ChevronRight, MapPin,
  Zap, Target, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import MainLayout from "@/components/layout/MainLayout";
import { runAIMatchmakerAction, type MatchedCreator } from "@/app/actions/ai";

const VIOLET = "#c084fc";
const EMERALD = "#34d399";
const CYAN = "#67e8f9";

const PLATFORM_EMOJI: Record<string, string> = {
  instagram: "📷", tiktok: "📱", youtube: "▶️",
  twitter: "🐦", twitch: "🎮", linkedin: "💼", pinterest: "📌",
};

const EXAMPLE_QUERIES = [
  "Skincare brand targeting women 25–40 with high-AOV audience on Instagram",
  "Gaming brand wanting TikTok creators with 500K+ followers and 5%+ ER",
  "Sustainable fashion label looking for eco-conscious creators in US & Europe",
  "Fitness supplement brand seeking authentic gym creators on YouTube",
];

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return n.toString();
}

function ScoreBar({ label, score, color, icon: Icon }: {
  label: string; score: number; color: string; icon: React.ElementType;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className="w-3 h-3" style={{ color }} />
          <span className="text-[11px] text-muted-foreground">{label}</span>
        </div>
        <span className="text-[11px] font-semibold" style={{ color }}>{score}%</span>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${score}%`, background: color }}
        />
      </div>
    </div>
  );
}

function CreatorCard({ creator, rank }: { creator: MatchedCreator; rank: number }) {
  const initials = creator.fullName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const matchColor =
    creator.matchScore >= 85 ? EMERALD :
    creator.matchScore >= 70 ? "#fcd34d" :
    VIOLET;

  return (
    <div
      className="rounded-3xl overflow-hidden transition-all duration-300 hover:scale-[1.01] border bg-white/[0.03] backdrop-blur-xl"
      style={{
        borderColor: `${matchColor}20`,
        boxShadow: rank === 0 ? `0 0 30px ${matchColor}10` : "none",
      }}
    >
      {/* Top bar */}
      <div
        className="px-4 py-2.5 flex items-center justify-between"
        style={{ borderBottom: `1px solid ${matchColor}14`, background: `${matchColor}06` }}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
            style={{ background: matchColor, color: "#000" }}
          >
            {rank + 1}
          </span>
          {rank === 0 && (
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-bold"
              style={{ background: `${EMERALD}20`, color: EMERALD, border: `1px solid ${EMERALD}30` }}
            >
              TOP MATCH
            </span>
          )}
        </div>
        <div
          className="flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-bold"
          style={{ background: `${matchColor}18`, color: matchColor, border: `1px solid ${matchColor}30` }}
        >
          <Star className="w-3 h-3 fill-current" />
          {creator.matchScore}%
        </div>
      </div>

      <div className="p-4">
        {/* Creator info */}
        <div className="flex items-start gap-3 mb-3">
          <div className="w-11 h-11 rounded-xl overflow-hidden ring-1 ring-white/10 shrink-0">
            {creator.avatarUrl ? (
              <img src={creator.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center text-sm font-bold"
                style={{ background: `linear-gradient(135deg, ${VIOLET}60, ${CYAN}40)`, color: "#fff" }}
              >
                {initials}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
                <Link
                  href={`/profile/${creator.id}`}
                  className="font-semibold text-sm hover:text-violet-400 transition-colors truncate text-zinc-100"
                >
                {creator.fullName}
              </Link>
              {creator.primaryPlatform && (
                <span className="text-base leading-none">
                  {PLATFORM_EMOJI[creator.primaryPlatform.toLowerCase()] ?? "🌐"}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {creator.niche && (
                <span className="text-[11px] text-muted-foreground">{creator.niche}</span>
              )}
              {creator.location && (
                <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                  <MapPin className="w-3 h-3" />
                  {creator.location}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div
            className="rounded-xl px-3 py-2 text-center"
            style={{ background: "rgba(192,132,252,0.07)", border: "1px solid rgba(192,132,252,0.14)" }}
          >
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Users className="w-3 h-3" style={{ color: VIOLET }} />
              <span className="text-sm font-bold">{fmt(creator.totalFollowers)}</span>
            </div>
            <p className="text-[10px] text-muted-foreground">Followers</p>
          </div>
          <div
            className="rounded-xl px-3 py-2 text-center"
            style={{ background: "rgba(52,211,153,0.07)", border: "1px solid rgba(52,211,153,0.14)" }}
          >
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <TrendingUp className="w-3 h-3" style={{ color: EMERALD }} />
              <span className="text-sm font-bold">{creator.engagementRate}%</span>
            </div>
            <p className="text-[10px] text-muted-foreground">Engagement</p>
          </div>
        </div>

        {/* Match breakdown */}
        <div className="space-y-2 mb-3">
          <ScoreBar label="Audience-Brand Fit" score={creator.audienceFit} color={VIOLET} icon={Target} />
          <ScoreBar label="Sales Prediction" score={creator.salesPrediction} color={EMERALD} icon={TrendingUp} />
          <ScoreBar label="Content Authenticity" score={creator.contentAuthenticity} color={CYAN} icon={ShieldCheck} />
        </div>

        {/* Match reason */}
        <div
          className="rounded-xl px-3 py-2 mb-3"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="flex items-start gap-2">
            <Sparkles className="w-3 h-3 shrink-0 mt-0.5" style={{ color: VIOLET }} />
            <p className="text-[11px] text-muted-foreground leading-relaxed">{creator.matchReason}</p>
          </div>
        </div>

        {/* CTA */}
        <Link
          href={`/profile/${creator.id}`}
          className="flex items-center justify-center gap-2 w-full rounded-2xl py-2.5 text-xs font-semibold transition-all hover:opacity-90"
          style={{
            background: `linear-gradient(135deg, ${VIOLET}25, ${CYAN}15)`,
            border: `1px solid ${VIOLET}28`,
            color: VIOLET,
          }}
        >
          View Full Profile
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}

const SmartMatch = () => {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<MatchedCreator[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function runMatch() {
    if (!query.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResults(null);
    const { data, error: err } = await runAIMatchmakerAction(query);
    setLoading(false);
    if (err) { setError(err); return; }
    setResults(data);
  }

  function reset() {
    setResults(null);
    setError(null);
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  return (
    <MainLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="mb-8">
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-4"
            style={{
              background: "rgba(192,132,252,0.10)",
              border: "1px solid rgba(192,132,252,0.25)",
              color: VIOLET,
            }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI Matchmaker
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold mb-2">
            Find your perfect{" "}
            <span
              style={{
                background: `linear-gradient(90deg, ${VIOLET}, ${CYAN})`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              creator match
            </span>
          </h1>
          <p className="text-muted-foreground text-sm max-w-xl">
            Describe your brand and campaign in plain language. Our AI analyzes audience fit, engagement quality, and niche alignment to surface the most relevant creators.
          </p>
        </div>

        {/* ── Search bar ─────────────────────────────────────────────────── */}
        {!results && (
          <div
            className="rounded-3xl p-5 mb-6 border border-violet-500/20 bg-white/[0.03] backdrop-blur-xl"
          >
            <div className="flex items-start gap-3 mb-4">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(192,132,252,0.12)", border: "1px solid rgba(192,132,252,0.2)" }}
              >
                <Search className="w-4 h-4" style={{ color: VIOLET }} />
              </div>
              <div className="flex-1 min-w-0">
                <textarea
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) runMatch();
                  }}
                  placeholder="e.g. Skincare brand targeting women 25–40 with $50+ AOV. Need creators with authentic beauty content on Instagram and TikTok..."
                  rows={3}
                  className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                  style={{ color: "inherit" }}
                />
              </div>
            </div>

            {/* Example chips */}
            <div className="mb-4">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Try an example</p>
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLE_QUERIES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => { setQuery(ex); inputRef.current?.focus(); }}
                    className="text-[11px] px-2.5 py-1 rounded-full transition-all hover:opacity-90"
                    style={{
                      background: "rgba(192,132,252,0.08)",
                      border: "1px solid rgba(192,132,252,0.18)",
                      color: VIOLET,
                    }}
                  >
                    {ex.length > 55 ? ex.slice(0, 55) + "…" : ex}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] text-muted-foreground">Press ⌘↵ to run • Results ranked by AI match score</p>
                <Button
                onClick={runMatch}
                disabled={!query.trim() || loading}
                size="sm"
                className="gap-2 font-semibold shrink-0 rounded-xl"
                style={{
                  background: query.trim() && !loading
                    ? `linear-gradient(135deg, #7c3aed, ${VIOLET})`
                    : undefined,
                  border: "none",
                  color: "#fff",
                  boxShadow: query.trim() && !loading ? "0 4px 16px rgba(124,58,237,0.25)" : undefined,
                }}
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Matching…</>
                ) : (
                  <><Zap className="w-4 h-4" /> Run AI Match</>
                )}
              </Button>
            </div>

            {error && (
              <p className="text-sm text-red-400 mt-3">{error}</p>
            )}
          </div>
        )}

        {/* ── Loading state ──────────────────────────────────────────────── */}
        {loading && (
          <div className="flex flex-col items-center py-16 gap-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: "rgba(192,132,252,0.10)", border: "1px solid rgba(192,132,252,0.2)" }}
            >
              <Sparkles className="w-8 h-8 animate-pulse" style={{ color: VIOLET }} />
            </div>
            <div className="text-center">
              <p className="font-semibold mb-1">AI is analyzing creators…</p>
              <p className="text-sm text-muted-foreground">Analyzing audience fit and niche alignment across your query</p>
            </div>
            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-full animate-bounce"
                  style={{ background: VIOLET, animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Results ───────────────────────────────────────────────────── */}
        {results && !loading && (
          <>
            {/* Results header */}
            <div
              className="rounded-2xl p-4 mb-6 flex items-center justify-between gap-4"
              style={{
                background: "rgba(192,132,252,0.06)",
                border: "1px solid rgba(192,132,252,0.15)",
              }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: "rgba(192,132,252,0.15)" }}
                >
                  <Sparkles className="w-4 h-4" style={{ color: VIOLET }} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {results.length} creator{results.length !== 1 ? "s" : ""} matched
                  </p>
                  <p className="text-xs text-muted-foreground truncate">&quot;{query}&quot;</p>
                </div>
              </div>
              <button
                onClick={reset}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                New search
              </button>
            </div>

            {results.length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="font-medium mb-1">No matching creators found</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Try broadening your query or check back as more creators join.
                </p>
                <Button onClick={reset} size="sm" variant="outline">
                  Try a different query
                </Button>
              </div>
            ) : (
              <>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                  {results.map((creator, i) => (
                    <CreatorCard key={creator.id} creator={creator} rank={i} />
                  ))}
                </div>

                <div className="flex items-center justify-center gap-4">
                  <Button onClick={reset} variant="outline" size="sm" className="gap-2">
                    <RotateCcw className="w-3.5 h-3.5" />
                    New search
                  </Button>
                  <Button asChild size="sm" className="gap-2" style={{ background: `linear-gradient(135deg, #7c3aed, ${VIOLET})`, border: "none", color: "#fff" }}>
                    <Link href="/brand/discover">
                      Browse all creators
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </Button>
                </div>
              </>
            )}
          </>
        )}

        {/* ── How it works ──────────────────────────────────────────────── */}
        {!results && !loading && (
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              {
                icon: Search,
                color: VIOLET,
                title: "Describe your campaign",
                desc: "Tell us about your brand, target audience, budget, and goals in natural language.",
              },
              {
                icon: Sparkles,
                color: CYAN,
                title: "AI analyzes 200+ signals",
                desc: "Our model cross-references audience demographics, engagement quality, and brand affinity.",
              },
              {
                icon: TrendingUp,
                color: EMERALD,
                title: "Ranked by match score",
                desc: "Creators ranked by audience fit, sales prediction, and content authenticity scores.",
              },
            ].map(({ icon: Icon, color, title, desc }) => (
              <div
                key={title}
                className="rounded-3xl p-5 border bg-white/[0.03] backdrop-blur-xl"
                style={{
                  borderColor: `${color}18`,
                }}
              >
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center mb-3"
                  style={{ background: `${color}10`, border: `1px solid ${color}18` }}
                >
                  <Icon className="w-4 h-4" style={{ color }} strokeWidth={1.5} />
                </div>
                <h3 className="font-semibold text-sm mb-1 text-zinc-100">{title}</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default SmartMatch;
