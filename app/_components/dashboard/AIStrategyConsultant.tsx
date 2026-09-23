"use client";

import { useState, useRef } from "react";
import {
  Sparkles, Send, Loader2, TrendingUp, RotateCcw,
  ChevronRight, BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getBrandAdStrategyAction, type AdStrategyResult } from "@/app/actions/ai";

interface Props {
  industry: string | null;
}

const EXAMPLE_PROMPTS = [
  "Skincare brand launching a new vitamin C serum targeting women 25–40",
  "Gaming peripheral brand promoting a new mechanical keyboard for streamers",
  "Sustainable fashion label seeking authentic creators for Gen Z audience",
];

export function AIStrategyConsultant({ industry }: Props) {
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<AdStrategyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function submit() {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await getBrandAdStrategyAction(prompt, {
      industry,
      budget: 5000,
    });
    setLoading(false);
    if (err) { setError(err); return; }
    setResult(data);
  }

  function reset() {
    setResult(null);
    setError(null);
    setPrompt("");
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  const confidenceColor = (score: number) => {
    if (score >= 85) return "#34d399";
    if (score >= 70) return "#fcd34d";
    return "#f472b6";
  };

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
            style={{ background: "rgba(52,211,153,0.10)", border: "1px solid rgba(52,211,153,0.18)" }}
          >
            <BarChart3 className="w-4 h-4" style={{ color: "#34d399" }} strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-zinc-100">AI Strategy Consultant</h3>
            <p className="text-xs text-zinc-500">Ad format & ROI recommendations</p>
          </div>
        </div>
        {result && (
          <button
            onClick={reset}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />
            New query
          </button>
        )}
      </div>

      <div className="p-5">
        {/* Input state */}
        {!result && (
          <>
            <p className="text-sm text-zinc-400 mb-3">
              Describe your product and campaign goal. The AI will recommend the most effective ad formats with predicted ROI.
            </p>

            {/* Example prompts */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {EXAMPLE_PROMPTS.map((ex) => (
                <button
                  key={ex}
                  onClick={() => { setPrompt(ex); textareaRef.current?.focus(); }}
                  className="text-[10px] px-2.5 py-1 rounded-full transition-colors"
                  style={{
                    background: "rgba(52,211,153,0.07)",
                    border: "1px solid rgba(52,211,153,0.15)",
                    color: "#34d399",
                  }}
                >
                  {ex.length > 45 ? ex.slice(0, 45) + "…" : ex}
                </button>
              ))}
            </div>

            <div className="relative">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
                }}
                placeholder="e.g. Skincare brand targeting women 25–40 with a $10K budget focused on conversions…"
                rows={3}
                className="w-full resize-none rounded-2xl text-sm px-4 py-3 pr-12 outline-none transition-colors text-zinc-200 placeholder:text-zinc-600"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(52,211,153,0.15)",
                }}
              />
              <button
                onClick={submit}
                disabled={!prompt.trim() || loading}
                className="absolute bottom-3 right-3 w-8 h-8 rounded-xl flex items-center justify-center transition-all"
                style={{
                  background: prompt.trim() && !loading
                    ? "linear-gradient(135deg, #059669, #34d399)"
                    : "rgba(255,255,255,0.04)",
                  opacity: prompt.trim() && !loading ? 1 : 0.4,
                }}
              >
                {loading
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                  : <Send className="w-3.5 h-3.5 text-white" strokeWidth={1.5} />
                }
              </button>
            </div>

            <p className="text-[10px] text-zinc-600 mt-2">
              Press ⌘↵ to submit
            </p>

            {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
          </>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center py-8 gap-3">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: "rgba(52,211,153,0.10)", border: "1px solid rgba(52,211,153,0.2)" }}
            >
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#34d399" }} />
            </div>
            <p className="text-sm text-muted-foreground">Analyzing top-performing campaigns…</p>
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <>
            {/* Summary */}
            <div
              className="rounded-xl px-4 py-3 mb-4"
              style={{ background: "rgba(52,211,153,0.07)", border: "1px solid rgba(52,211,153,0.18)" }}
            >
              <div className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#34d399" }} />
                <p className="text-sm leading-relaxed">{result.summary}</p>
              </div>
            </div>

            {/* Strategies */}
            <div className="space-y-3">
              {result.strategies.map((s, i) => {
                const color = confidenceColor(s.confidenceScore);
                return (
                  <div
                    key={i}
                    className="rounded-xl p-4"
                    style={{
                      background: "rgba(255,255,255,0.025)",
                      border: `1px solid ${color}22`,
                    }}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold">{s.format}</span>
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                            style={{ background: `${color}18`, color }}
                          >
                            {s.platform}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold font-display" style={{ color }}>
                          {s.roiMultiplier}×
                        </div>
                        <div className="text-[10px] text-muted-foreground">ROI</div>
                      </div>
                    </div>

                    {/* Confidence bar */}
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${s.confidenceScore}%`, background: color }}
                        />
                      </div>
                      <span className="text-[10px] font-medium shrink-0" style={{ color }}>
                        {s.confidenceScore}% confidence
                      </span>
                    </div>

                    <div className="mt-2 flex items-center gap-1.5">
                      <ChevronRight className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                      <p className="text-[11px] text-muted-foreground">
                        <span className="font-medium text-foreground/70">Best for:</span> {s.bestFor}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* CTA */}
            <div className="mt-4 flex items-center gap-2">
              <Button
                size="sm"
                onClick={reset}
                variant="outline"
                className="flex-1 text-xs rounded-xl border-white/[0.08] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]"
              >
                Try another query
              </Button>
              <Button
                size="sm"
                className="flex-1 text-xs gap-1.5 rounded-xl"
                style={{ background: "linear-gradient(135deg, #059669, #34d399)", border: "none", color: "#fff", boxShadow: "0 4px 16px rgba(52,211,153,0.20)" }}
                asChild
              >
                <a href="/brand/smart-match">
                  <TrendingUp className="w-3.5 h-3.5" strokeWidth={1.5} />
                  Find matching creators
                </a>
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
